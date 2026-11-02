//! Resolve a user-owned Node installation, downloading the official fallback only when needed.
use super::run_process_with_timeout;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant, SystemTime},
};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(test)]
#[path = "node_runtime_tests.rs"]
mod tests;

const MANIFEST: &str = include_str!("../../../scripts/node-runtime.json");
static CACHE: Mutex<Option<Cached>> = Mutex::new(None);
static CHANGE: Mutex<()> = Mutex::new(());
static DOWNLOADING: AtomicBool = AtomicBool::new(false);
static LAST_FAILURE: Mutex<Option<(PathBuf, Instant, String)>> = Mutex::new(None);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    version: String,
    minimum_version: String,
    checksums: std::collections::BTreeMap<String, String>,
}
fn manifest() -> Manifest {
    serde_json::from_str(MANIFEST).expect("checked Node manifest")
}
#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Selection {
    path: Option<PathBuf>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub path: Option<PathBuf>,
    pub version: Option<String>,
    pub source: Option<String>,
    pub state: String,
    pub selected_path: Option<PathBuf>,
    pub minimum_version: String,
}
#[derive(Clone)]
struct Cached {
    config: PathBuf,
    selected: Option<PathBuf>,
    original: PathBuf,
    original_resolution: PathBuf,
    original_modified: SystemTime,
    original_len: u64,
    resolved: PathBuf,
    modified: SystemTime,
    len: u64,
    status: Status,
}
#[derive(Clone)]
struct Locations {
    home: PathBuf,
    config: PathBuf,
    data: PathBuf,
}
impl Locations {
    fn app(app: &AppHandle) -> Result<Self, String> {
        Ok(Self {
            home: std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
                .map(PathBuf::from)
                .ok_or("Home directory unavailable.")?,
            config: app
                .path()
                .app_config_dir()
                .map_err(|e| e.to_string())?
                .join("node-runtime.json"),
            data: app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?
                .join("node-runtime"),
        })
    }
    fn selection(&self) -> Result<Selection, String> {
        match fs::read(&self.config) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|e| format!("Cannot read Node selection: {e}")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Selection::default()),
            Err(e) => Err(e.to_string()),
        }
    }
    fn save(&self, selection: &Selection) -> Result<(), String> {
        fs::create_dir_all(self.config.parent().ok_or("Invalid Node settings path.")?)
            .map_err(|e| e.to_string())?;
        let temporary = self.config.with_extension("tmp");
        fs::write(
            &temporary,
            serde_json::to_vec(selection).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        fs::rename(temporary, &self.config).map_err(|e| e.to_string())
    }
}
fn version(value: &str) -> Option<[u64; 3]> {
    let parts: Vec<_> = value.trim().trim_start_matches('v').split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let mut numbers = [0; 3];
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() || !part.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        numbers[i] = part.parse().ok()?;
    }
    Some(numbers)
}
fn compatible(value: &str) -> bool {
    version(value)
        .is_some_and(|v| v >= version(&manifest().minimum_version).expect("Node minimum version"))
}
fn node_name() -> &'static str {
    if cfg!(windows) {
        "node.exe"
    } else {
        "node"
    }
}
fn add_versions(paths: &mut Vec<PathBuf>, root: PathBuf, suffix: &str) {
    if let Ok(entries) = fs::read_dir(root) {
        let mut entries: Vec<_> = entries
            .filter_map(Result::ok)
            .map(|e| e.path().join(suffix))
            .collect();
        entries.sort();
        entries.reverse();
        paths.extend(entries);
    }
}
fn candidates(home: &Path) -> Vec<PathBuf> {
    let mut paths: Vec<_> = std::env::var_os("PATH")
        .map(|p| {
            std::env::split_paths(&p)
                .filter(|p| p.is_absolute())
                .map(|p| p.join(node_name()))
                .collect()
        })
        .unwrap_or_default();
    if cfg!(windows) {
        for key in [
            "ProgramFiles",
            "LOCALAPPDATA",
            "APPDATA",
            "NVM_SYMLINK",
            "VOLTA_HOME",
        ] {
            if let Some(root) = std::env::var_os(key)
                .map(PathBuf::from)
                .filter(|p| p.is_absolute())
            {
                paths.extend([
                    root.join("nodejs/node.exe"),
                    root.join("node.exe"),
                    root.join("bin/node.exe"),
                ]);
            }
        }
        add_versions(&mut paths, home.join("AppData/Roaming/nvm"), "node.exe");
        add_versions(
            &mut paths,
            home.join("AppData/Local/fnm/node-versions"),
            "installation/node.exe",
        );
    } else {
        paths.extend([
            PathBuf::from("/opt/homebrew/bin/node"),
            PathBuf::from("/usr/local/bin/node"),
            PathBuf::from("/usr/bin/node"),
            home.join(".local/bin/node"),
            home.join(".volta/bin/node"),
            home.join(".n/bin/node"),
        ]);
        for root in [
            home.join(".nvm/versions/node"),
            home.join(".asdf/installs/nodejs"),
            home.join(".local/share/mise/installs/node"),
        ] {
            add_versions(&mut paths, root, "bin/node");
        }
        for root in [
            home.join(".local/share/fnm/node-versions"),
            home.join("Library/Application Support/fnm/node-versions"),
            home.join(".fnm/node-versions"),
        ] {
            add_versions(&mut paths, root, "installation/bin/node");
        }
        for (key, suffix) in [
            ("NVM_DIR", "versions/node"),
            ("FNM_DIR", "node-versions"),
            ("MISE_DATA_DIR", "installs/node"),
            ("ASDF_DATA_DIR", "installs/nodejs"),
        ] {
            if let Some(root) = std::env::var_os(key)
                .map(PathBuf::from)
                .filter(|p| p.is_absolute())
            {
                add_versions(
                    &mut paths,
                    root.join(suffix),
                    if key == "FNM_DIR" {
                        "installation/bin/node"
                    } else {
                        "bin/node"
                    },
                );
            }
        }
        if let Some(root) = std::env::var_os("VOLTA_HOME")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
        {
            paths.push(root.join("bin/node"));
        }
    }
    let mut seen = HashSet::new();
    paths
        .into_iter()
        .filter(|path| {
            path.is_file() && seen.insert(fs::canonicalize(path).unwrap_or_else(|_| path.clone()))
        })
        .collect()
}
fn probe(path: &Path) -> Result<String, String> {
    Ok(probe_runtime(path)?.version)
}
#[derive(Deserialize)]
struct RuntimeProbe { version: String, executable: PathBuf }
fn probe_runtime(path: &Path) -> Result<RuntimeProbe, String> {
    if !path.is_absolute() || !path.is_file() {
        return Err("Choose an existing Node executable.".into());
    }
    let result = run_process_with_timeout(
        Command::new(path)
            .args(["-p", "JSON.stringify({version:process.version,executable:process.execPath})"])
            .env_remove("NODE_OPTIONS")
            .env_remove("NODE_PATH"),
        Duration::from_secs(3),
    ).map_err(|_| "The selected file is not a usable Node executable.")?;
    let value = serde_json::from_str::<RuntimeProbe>(result.stdout.trim());
    let value = value.map_err(|_| "The selected file is not a usable Node executable.")?;
    if !result.success || version(&value.version).is_none() || !value.executable.is_absolute() || !value.executable.is_file() {
        return Err("The selected file is not a usable Node executable.".into());
    }
    Ok(value)
}
fn platform() -> Result<String, String> {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        "linux" => "linux",
        "windows" => "win",
        _ => return Err("Unsupported Node platform.".into()),
    };
    let arch = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        _ => return Err("Unsupported Node architecture.".into()),
    };
    Ok(format!("{os}-{arch}"))
}
fn stem() -> Result<String, String> {
    Ok(format!("node-v{}-{}", manifest().version, platform()?))
}
fn managed_node(loc: &Locations) -> Result<PathBuf, String> {
    Ok(loc.data.join(stem()?).join(if cfg!(windows) {
        "node.exe"
    } else {
        "bin/node"
    }))
}
fn npm_entry(root: &Path) -> PathBuf {
    root.join(if cfg!(windows) { "node_modules/npm/bin/npm-cli.js" } else { "lib/node_modules/npm/bin/npm-cli.js" })
}
fn cache_status(
    loc: &Locations,
    selected: &Option<PathBuf>,
    original: &Path,
    executable: &Path,
    value: &str,
    source: &str,
) -> Result<Status, String> {
    let resolved = fs::canonicalize(executable).map_err(|e| e.to_string())?;
    let original_resolution = fs::canonicalize(original).map_err(|e| e.to_string())?;
    let original_metadata = fs::metadata(&original_resolution).map_err(|e| e.to_string())?;
    let metadata = fs::metadata(&resolved).map_err(|e| e.to_string())?;
    let status = Status {
        path: Some(resolved.clone()),
        version: Some(value.into()),
        source: Some(source.into()),
        state: "ready".into(),
        selected_path: selected.clone(),
        minimum_version: manifest().minimum_version,
    };
    *CACHE.lock().map_err(|e| e.to_string())? = Some(Cached {
        config: loc.config.clone(),
        selected: selected.clone(),
        original: original.into(),
        original_resolution,
        original_modified: original_metadata.modified().map_err(|e| e.to_string())?,
        original_len: original_metadata.len(),
        resolved,
        modified: metadata.modified().map_err(|e| e.to_string())?,
        len: metadata.len(),
        status: status.clone(),
    });
    Ok(status)
}
fn cached(loc: &Locations, selected: &Option<PathBuf>) -> Option<Status> {
    let cache = CACHE.lock().ok()?;
    let c = cache.as_ref()?;
    if c.status.source.as_deref() == Some("downloaded") && !npm_entry(&loc.data.join(stem().ok()?)).is_file() {
        return None;
    }
    if c.config != loc.config
        || c.selected != *selected
        || fs::canonicalize(&c.original).ok()? != c.original_resolution
    {
        return None;
    }
    let metadata = fs::metadata(&c.resolved).ok()?;
    let original_metadata = fs::metadata(&c.original).ok()?;
    (metadata.len() == c.len && metadata.modified().ok()? == c.modified
        && original_metadata.len() == c.original_len && original_metadata.modified().ok()? == c.original_modified)
        .then(|| c.status.clone())
}
fn inspect(loc: &Locations, paths: &[PathBuf]) -> Result<Status, String> {
    let selection = loc.selection()?;
    if let Some(status) = cached(loc, &selection.path) {
        return Ok(status);
    }
    let mut invalid = None;
    let selected = selection.path.clone();
    let search = selected.iter().map(|p| (p.clone(), "custom")).chain(paths.iter().map(|p| (p.clone(), "system")));
    for (path, source) in search {
        if let Ok(value) = probe_runtime(&path) {
            if compatible(&value.version) {
                return cache_status(loc, &selected, &path, &value.executable, &value.version, source);
            }
            invalid.get_or_insert((path, value.version));
        }
    }
    let fallback = managed_node(loc)?;
    if let Ok(value) = probe(&fallback) {
        if value == format!("v{}", manifest().version) && npm_entry(&loc.data.join(stem()?)).is_file() {
            return cache_status(loc, &selected, &fallback, &fallback, &value, "downloaded");
        }
    }
    let (path, value) = match invalid {
        Some((p, v)) => (Some(p), Some(v)),
        None => (selected.clone(), None),
    };
    Ok(Status {
        path,
        version: value.clone(),
        source: None,
        state: if DOWNLOADING.load(Ordering::Relaxed) {
            "downloading"
        } else if value.is_some() {
            "incompatible"
        } else {
            "missing"
        }
        .into(),
        selected_path: selected,
        minimum_version: manifest().minimum_version,
    })
}

// The allowlisted archive digest comes from Node's official SHASUMS256.txt and is
// shipped with the app. A compromised/misdirected download cannot change the pin.
fn download_to(mut response: impl Read, path: &Path, checksum: &str) -> Result<(), String> {
    let mut file = File::create(path).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut count = 0u64;
    let mut bytes = [0; 64 * 1024];
    loop {
        let size = response
            .read(&mut bytes)
            .map_err(|e| format!("Node download failed: {e}"))?;
        if size == 0 {
            break;
        }
        count += size as u64;
        if count > 100_000_000 {
            return Err("Node download exceeded size limit.".into());
        }
        hash.update(&bytes[..size]);
        file.write_all(&bytes[..size]).map_err(|e| e.to_string())?;
    }
    file.sync_all().map_err(|e| e.to_string())?;
    if format!("{:x}", hash.finalize()) != checksum {
        return Err("Official Node checksum mismatch.".into());
    }
    Ok(())
}
fn install(loc: &Locations) -> Result<(), String> {
    let metadata = manifest();
    let platform = platform()?;
    let stem = stem()?;
    let extension = if cfg!(windows) { "zip" } else { "tar.gz" };
    let archive_name = format!("{stem}.{extension}");
    let checksum = metadata
        .checksums
        .get(&platform)
        .ok_or("Missing official Node checksum.")?;
    fs::create_dir_all(&loc.data).map_err(|e| e.to_string())?;
    let work = loc.data.join("download");
    if work.exists() {
        fs::remove_dir_all(&work).map_err(|e| e.to_string())?;
    }
    fs::create_dir(&work).map_err(|e| e.to_string())?;
    let result = (|| {
        let client = reqwest::blocking::Client::builder()
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(180))
            .build()
            .map_err(|e| e.to_string())?;
        let response = client
            .get(format!(
                "https://nodejs.org/dist/v{}/{archive_name}",
                metadata.version
            ))
            .send()
            .and_then(|r| r.error_for_status())
            .map_err(|e| format!("Node download failed: {e}"))?;
        let archive = work.join(&archive_name);
        download_to(response, &archive, checksum)?;
        // tar is provided by supported macOS/Linux and modern Windows systems.
        let tar = if cfg!(windows) {
            PathBuf::from(
                std::env::var_os("SystemRoot").ok_or("Windows system directory unavailable.")?,
            )
            .join("System32/tar.exe")
        } else {
            PathBuf::from("/usr/bin/tar")
        };
        let files: &[&str] = if cfg!(windows) {
            &["node.exe", "LICENSE", "npm", "npm.cmd", "npx", "npx.cmd", "node_modules/npm"]
        } else {
            &["bin/node", "LICENSE", "bin/npm", "bin/npx", "lib/node_modules/npm"]
        };
        let result = run_process_with_timeout(
            Command::new(tar)
                .arg("-xf")
                .arg(&archive)
                .arg("-C")
                .arg(&work)
                .args(files.iter().map(|file| format!("{stem}/{file}"))),
            Duration::from_secs(60),
        )?;
        if !result.success {
            return Err("Cannot extract the official Node runtime.".into());
        }
        let extracted = work.join(&stem);
        let executable = extracted.join(if cfg!(windows) {
            "node.exe"
        } else {
            "bin/node"
        });
        if probe(&executable)? != format!("v{}", metadata.version)
            || !extracted.join("LICENSE").is_file()
            || !npm_entry(&extracted).is_file()
        {
            return Err("Downloaded Node verification failed.".into());
        }
        let destination = loc.data.join(&stem);
        if destination.exists() {
            fs::remove_dir_all(&destination).map_err(|e| e.to_string())?;
        }
        fs::rename(extracted, destination).map_err(|e| e.to_string())
    })();
    let _ = fs::remove_dir_all(work);
    result
}
fn ensure(loc: &Locations, app: Option<&AppHandle>) -> Result<Status, String> {
    let _guard = CHANGE.lock().map_err(|e| e.to_string())?;
    if let Some(status) = cached(loc, &loc.selection()?.path) {
        return Ok(status);
    }
    let paths = candidates(&loc.home);
    let status = inspect(loc, &paths)?;
    if status.state == "ready" {
        return Ok(status);
    }
    if let Some((config, when, error)) = &*LAST_FAILURE.lock().map_err(|e| e.to_string())? {
        if *config == loc.config && when.elapsed() < Duration::from_secs(30) {
            return Err(error.clone());
        }
    }
    DOWNLOADING.store(true, Ordering::Relaxed);
    if let Some(app) = app {
        let _ = app.emit("node-runtime-download", true);
    }
    let result = install(loc);
    DOWNLOADING.store(false, Ordering::Relaxed);
    if let Some(app) = app {
        let _ = app.emit("node-runtime-download", false);
    }
    if let Err(error) = result {
        *LAST_FAILURE.lock().map_err(|e| e.to_string())? =
            Some((loc.config.clone(), Instant::now(), error.clone()));
        return Err(error);
    }
    *LAST_FAILURE.lock().map_err(|e| e.to_string())? = None;
    let status = inspect(loc, &paths)?;
    if status.state != "ready" {
        return Err("Downloaded Node verification failed.".into());
    }
    Ok(status)
}
pub(super) fn resolve(app: &AppHandle) -> Result<PathBuf, String> {
    let loc = Locations::app(app)?;
    let status = match cached(&loc, &loc.selection()?.path) {
        Some(status) => status,
        None => ensure(&loc, Some(app))?,
    };
    status.path.ok_or("Node runtime unavailable.".into())
}
#[cfg(test)]
pub(super) fn test_node() -> PathBuf {
    static RUNTIME: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
    RUNTIME.get_or_init(|| {
        let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
        candidates(&home).into_iter()
            .find_map(|p| probe_runtime(&p).ok().filter(|v| compatible(&v.version)).map(|v| v.executable))
            .expect("Native tests require Node >=22.20.0")
    }).clone()
}
#[tauri::command]
pub async fn application_node_status(app: AppHandle) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let loc = Locations::app(&app)?;
        inspect(&loc, &candidates(&loc.home))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn application_node_detect(app: AppHandle) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        *CACHE.lock().map_err(|e| e.to_string())? = None;
        *LAST_FAILURE.lock().map_err(|e| e.to_string())? = None;
        ensure(&Locations::app(&app)?, Some(&app))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn application_node_select(
    app: AppHandle,
    path: Option<PathBuf>,
) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let loc = Locations::app(&app)?;
        {
            let _guard = CHANGE.lock().map_err(|e| e.to_string())?;
            if let Some(path) = &path {
                let value = probe(path)?;
                if !compatible(&value) {
                    return Err(format!(
                        "Node {} or later is required.",
                        manifest().minimum_version
                    ));
                }
            }
            loc.save(&Selection { path })?;
            *CACHE.lock().map_err(|e| e.to_string())? = None;
            *LAST_FAILURE.lock().map_err(|e| e.to_string())? = None;
        }
        ensure(&loc, Some(&app))
    })
    .await
    .map_err(|e| e.to_string())?
}
