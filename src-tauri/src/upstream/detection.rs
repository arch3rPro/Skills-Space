//! Read-only installation evidence, independent of upstream lifecycle detection.
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum InstallationStatus {
    Confirmed,
    ConfigurationOnly,
    NotFound,
}

pub(super) fn executable(path: &Path) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        path.extension().is_some_and(|ext| {
            ["exe", "cmd", "bat", "com"]
                .iter()
                .any(|candidate| ext.eq_ignore_ascii_case(candidate))
        })
    }
}

// Explicit known entry points only; Agent identifiers are not executable names.
// An unsupported entry point is unconfirmed, never inferred from configuration.
fn entry_points(id: &str) -> (&'static [&'static str], &'static [&'static str]) {
    match id {
        "codex" => (&["codex"], &["Codex.app", "ChatGPT.app"]),
        "claude-code" => (&["claude"], &[]),
        "cursor" => (&["cursor"], &["Cursor.app"]),
        "windsurf" => (&["windsurf"], &["Windsurf.app"]),
        "zed" => (&["zed"], &["Zed.app"]),
        "gemini-cli" => (&["gemini"], &[]),
        "opencode" => (&["opencode"], &[]),
        "github-copilot" => (&["copilot"], &[]),
        "amp" => (&["amp"], &[]),
        "goose" => (&["goose"], &[]),
        "hermes-agent" => (&["hermes"], &[]),
        "sarvam-code" => (&["sarvam-code"], &[]),
        "pi" => (&["pi"], &[]),
        "deepseek-harness" => (&["dsh"], &["DeepSeek Harness.app"]),
        "kimi-code-cli" => (&["kimi"], &[]),
        "mistral-vibe" => (&["vibe"], &[]),
        "qwen-code" => (&["qwen"], &[]),
        "kiro-cli" => (&["kiro-cli", "kiro"], &[]),
        "iflow-cli" => (&["iflow"], &[]),
        "continue" => (&["cn"], &[]),
        "autohand-code" => (&["autohand"], &[]),
        "inference-sh" => (&["infsh"], &[]),
        "forgecode" => (&["forge"], &[]),
        "codearts-agent" => (&["codearts"], &[]),
        "openclaw" => (&["openclaw", "clawdbot", "moltbot"], &[]),
        _ => (&[], &[]),
    }
}

pub(super) fn inspect_agent(
    id: &str,
    display_name: &str,
    home: &Path,
    isolated: bool,
    configuration: bool,
) -> (InstallationStatus, Option<String>) {
    let (known_commands, known_apps) = entry_points(id);
    // Exact upstream IDs are additional executable candidates, never configuration probes.
    // Universal is a shared target, and fx is an ambiguous unrelated command name.
    let commands: Vec<&str> =
        if known_commands.is_empty() && !matches!(id, "universal" | "fx" | "eve") {
            vec![id]
        } else {
            known_commands.to_vec()
        };
    let mut apps: Vec<String> = known_apps.iter().map(|app| (*app).to_string()).collect();
    if !matches!(id, "universal" | "eve")
        && !display_name.contains('/')
        && !display_name.contains('\\')
    {
        apps.push(format!("{display_name}.app"));
    }
    apps.sort();
    apps.dedup();
    let mut bins = vec![
        home.join(".local/bin"),
        home.join("bin"),
        home.join(".cargo/bin"),
        home.join(".bun/bin"),
        home.join(".opencode/bin"),
        home.join(".npm-global/bin"),
        home.join(".volta/bin"),
        home.join(".local/share/pnpm"),
    ];
    if !isolated {
        if let Some(path) = std::env::var_os("PATH") {
            bins.extend(std::env::split_paths(&path));
        }
        // Finder-launched macOS apps often inherit a minimal PATH.
        #[cfg(target_os = "macos")]
        bins.extend([
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
        ]);
    }
    // Version managers can be absent from a Finder-launched application's PATH.
    for root in [
        home.join(".nvm/versions/node"),
        home.join(".local/share/fnm/node-versions"),
    ] {
        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    bins.push(entry.path().join("bin"));
                    bins.push(entry.path().join("installation/bin"));
                }
            }
        }
    }
    if !extension_ids(id).is_empty() {
        if let Some(evidence) = agent_extension(id, home, isolated, &bins) {
            return (
                InstallationStatus::Confirmed,
                Some(evidence.to_string_lossy().into_owned()),
            );
        }
    }
    for bin in bins {
        for command in &commands {
            #[cfg(windows)]
            let names = ["exe", "cmd", "bat", "com"]
                .map(|ext| format!("{command}.{ext}"))
                .to_vec();
            #[cfg(not(windows))]
            let names = vec![command.to_string()];
            for name in names {
                let path = bin.join(name);
                if executable(&path) {
                    return (
                        InstallationStatus::Confirmed,
                        Some(path.to_string_lossy().into_owned()),
                    );
                }
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        let mut roots = vec![home.join("Applications")];
        if !isolated {
            roots.push(PathBuf::from("/Applications"));
        }
        for root in roots {
            for app in &apps {
                let bundle = root.join(app);
                if application_executable(&bundle).is_some() {
                    return (
                        InstallationStatus::Confirmed,
                        Some(bundle.to_string_lossy().into_owned()),
                    );
                }
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = apps;
    (
        if configuration {
            InstallationStatus::ConfigurationOnly
        } else {
            InstallationStatus::NotFound
        },
        None,
    )
}

/// Read the declared executable, rather than accepting any file in an app folder.
#[cfg(target_os = "macos")]
fn application_executable(bundle: &Path) -> Option<PathBuf> {
    let plist = bundle.join("Contents/Info.plist");
    if fs::metadata(&plist).ok()?.len() > 1024 * 1024 {
        return None;
    }
    // A ChatGPT bundle is a Codex host only when its product identity confirms it.
    if bundle.file_name().is_some_and(|name| name == "ChatGPT.app") {
        let identity = std::process::Command::new("/usr/bin/plutil")
            .args(["-extract", "CFBundleIdentifier", "raw", "-o", "-"])
            .arg(&plist)
            .output()
            .ok()?;
        if !identity.status.success()
            || String::from_utf8(identity.stdout).ok()?.trim() != "com.openai.codex"
        {
            return None;
        }
    }
    let output = std::process::Command::new("/usr/bin/plutil")
        .args(["-extract", "CFBundleExecutable", "raw", "-o", "-"])
        .arg(&plist)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let name = String::from_utf8(output.stdout).ok()?;
    let name = name.trim();
    if name.is_empty() || Path::new(name).components().count() != 1 || name == "." || name == ".." {
        return None;
    }
    let path = bundle.join("Contents/MacOS").join(name);
    executable(&path).then_some(path)
}

fn agent_extension(id: &str, home: &Path, isolated: bool, bins: &[PathBuf]) -> Option<PathBuf> {
    for (folder, command, app) in [
        (".vscode", "code", "Visual Studio Code.app"),
        (
            ".vscode-insiders",
            "code-insiders",
            "Visual Studio Code - Insiders.app",
        ),
        (".cursor", "cursor", "Cursor.app"),
        (".windsurf", "windsurf", "Windsurf.app"),
        (".antigravity", "antigravity", "Antigravity.app"),
    ] {
        let mut host_present = bins.iter().any(|bin| {
            #[cfg(windows)]
            {
                executable(&bin.join(format!("{command}.cmd")))
                    || executable(&bin.join(format!("{command}.exe")))
            }
            #[cfg(not(windows))]
            {
                executable(&bin.join(command))
            }
        });
        #[cfg(target_os = "macos")]
        {
            host_present |= application_executable(&home.join("Applications").join(app)).is_some();
            if !isolated {
                host_present |=
                    application_executable(&PathBuf::from("/Applications").join(app)).is_some();
            }
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (isolated, app);
        if !host_present {
            continue;
        }
        let root = home.join(folder).join("extensions");
        let obsolete: serde_json::Value = fs::read(root.join(".obsolete"))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        let Ok(entries) = fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let directory = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if obsolete[&name].as_bool() == Some(true) {
                continue;
            }
            let manifest_path = directory.join("package.json");
            if !fs::metadata(&manifest_path)
                .ok()
                .is_some_and(|m| m.len() <= 1024 * 1024)
            {
                continue;
            }
            let Some(manifest) = fs::read(&manifest_path)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
            else {
                continue;
            };
            let identity = format!(
                "{}.{}",
                manifest["publisher"].as_str().unwrap_or(""),
                manifest["name"].as_str().unwrap_or("")
            );
            if !extension_ids(id)
                .iter()
                .any(|expected| identity.eq_ignore_ascii_case(expected))
                || manifest["version"].as_str().is_none_or(str::is_empty)
                || manifest["engines"]["vscode"]
                    .as_str()
                    .is_none_or(str::is_empty)
            {
                continue;
            }
            // Manifest identity alone can be leftover metadata; require actual code.
            let root = match fs::canonicalize(&directory) {
                Ok(root) => root,
                Err(_) => continue,
            };
            let usable = ["main", "browser"].iter().any(|key| {
                manifest[key]
                    .as_str()
                    .and_then(|entry| fs::canonicalize(directory.join(entry)).ok())
                    .is_some_and(|path| path.starts_with(&root) && path.is_file())
            });
            if usable {
                return Some(manifest_path);
            }
        }
    }
    None
}

fn extension_ids(id: &str) -> &'static [&'static str] {
    match id {
        "github-copilot" => &["github.copilot", "github.copilot-chat"],
        "claude-code" => &["anthropic.claude-code"],
        "codex" => &["openai.chatgpt"],
        "cline" => &["saoudrizwan.claude-dev"],
        "roo" => &["rooveterinaryinc.roo-cline"],
        "kilo" => &["kilocode.kilo-code"],
        "continue" => &["continue.continue"],
        "augment" => &["augment.vscode-augment"],
        _ => &[],
    }
}
#[cfg(test)]
fn inspect(
    id: &str,
    home: &Path,
    isolated: bool,
    configuration: bool,
) -> (InstallationStatus, Option<String>) {
    inspect_agent(id, id, home, isolated, configuration)
}

#[cfg(all(test, unix))]
mod tests {
    use super::super::TemporaryDirectory;
    use super::*;
    use std::os::unix::fs::{symlink, PermissionsExt};

    fn binary(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "#!/bin/sh\nexit 0\n").unwrap();
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
    }

    #[test]
    fn finder_paths_and_version_managers_are_detected_without_configuration() {
        let home = TemporaryDirectory::new().unwrap();
        for (id, relative) in [
            ("opencode", ".opencode/bin/opencode"),
            ("gemini-cli", ".nvm/versions/node/v22.0.0/bin/gemini"),
            (
                "pi",
                ".local/share/fnm/node-versions/v22.0.0/installation/bin/pi",
            ),
            ("hermes-agent", ".local/bin/hermes"),
        ] {
            let path = home.0.join(relative);
            binary(&path);
            let (status, evidence) = inspect(id, &home.0, true, false);
            assert_eq!(status, InstallationStatus::Confirmed, "{id}");
            assert_eq!(evidence.as_deref(), path.to_str());
            fs::remove_file(&path).unwrap();
            symlink("/nonexistent/agent", &path).unwrap();
            assert_eq!(
                inspect(id, &home.0, true, true).0,
                InstallationStatus::ConfigurationOnly
            );
        }
    }

    #[test]
    fn copilot_extension_requires_host_identity_code_and_non_obsolete_installation() {
        let home = TemporaryDirectory::new().unwrap();
        let extension = home.0.join(".vscode/extensions/github.copilot-chat-1.0.0");
        fs::create_dir_all(&extension).unwrap();
        let manifest = extension.join("package.json");
        let mut data = serde_json::json!({"publisher":"GitHub","name":"copilot-chat","version":"1.0.0","engines":{"vscode":"^1.100.0"},"main":"extension.js"});
        fs::write(&manifest, serde_json::to_vec(&data).unwrap()).unwrap();
        fs::write(extension.join("extension.js"), "module.exports = {};").unwrap();
        assert_eq!(
            inspect("github-copilot", &home.0, true, true).0,
            InstallationStatus::ConfigurationOnly,
            "extension leftovers without a host are unconfirmed"
        );
        binary(&home.0.join(".local/bin/code"));
        assert_eq!(
            inspect("github-copilot", &home.0, true, false),
            (
                InstallationStatus::Confirmed,
                Some(manifest.to_string_lossy().into_owned())
            )
        );
        fs::write(
            extension.parent().unwrap().join(".obsolete"),
            "{\"github.copilot-chat-1.0.0\":true}",
        )
        .unwrap();
        assert_eq!(
            inspect("github-copilot", &home.0, true, true).0,
            InstallationStatus::ConfigurationOnly
        );
        fs::remove_file(extension.parent().unwrap().join(".obsolete")).unwrap();
        data["publisher"] = "Other".into();
        fs::write(&manifest, serde_json::to_vec(&data).unwrap()).unwrap();
        assert_eq!(
            inspect("github-copilot", &home.0, true, true).0,
            InstallationStatus::ConfigurationOnly
        );
        data["publisher"] = "GitHub".into();
        fs::write(&manifest, serde_json::to_vec(&data).unwrap()).unwrap();
        fs::remove_file(extension.join("extension.js")).unwrap();
        assert_eq!(
            inspect("github-copilot", &home.0, true, true).0,
            InstallationStatus::ConfigurationOnly,
            "metadata without implementation is unconfirmed"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn application_requires_declared_executable_not_an_unrelated_file() {
        let home = TemporaryDirectory::new().unwrap();
        let bundle = home.0.join("Applications/Cursor.app");
        binary(&bundle.join("Contents/MacOS/unrelated"));
        fs::write(bundle.join("Contents/Info.plist"), "<?xml version=\"1.0\"?><plist version=\"1.0\"><dict><key>CFBundleExecutable</key><string>Cursor</string></dict></plist>").unwrap();
        assert_eq!(
            inspect("cursor", &home.0, true, true).0,
            InstallationStatus::ConfigurationOnly
        );
        binary(&bundle.join("Contents/MacOS/Cursor"));
        assert_eq!(
            inspect("cursor", &home.0, true, false),
            (
                InstallationStatus::Confirmed,
                Some(bundle.to_string_lossy().into_owned())
            )
        );
        fs::remove_file(bundle.join("Contents/MacOS/Cursor")).unwrap();
        assert_eq!(
            inspect("cursor", &home.0, true, true).0,
            InstallationStatus::ConfigurationOnly
        );
    }
}

pub(super) fn dependency_evidence(project: &Path, dependency: &str) -> Option<String> {
    let directory = project.join("node_modules").join(dependency);
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(directory.join("package.json")).ok()?).ok()?;
    if manifest["name"].as_str() != Some(dependency)
        || manifest["version"].as_str().is_none_or(str::is_empty)
    {
        return None;
    }
    let root = fs::canonicalize(&directory).ok()?;
    let usable = ["main", "module"].iter().any(|key| {
        manifest[key]
            .as_str()
            .and_then(|entry| fs::canonicalize(directory.join(entry)).ok())
            .is_some_and(|entry| entry.starts_with(&root) && entry.is_file())
    });
    usable.then(|| {
        directory
            .join("package.json")
            .to_string_lossy()
            .into_owned()
    })
}

#[cfg(all(test, unix))]
mod coverage_tests {
    use super::super::TemporaryDirectory;
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    fn program(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "#!/bin/sh\nexit 0\n").unwrap();
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
    }
    #[test]
    fn all_pinned_definitions_are_inspected_without_shared_directory_false_positives() {
        let definitions: Vec<serde_json::Value> = serde_json::from_slice(
            &fs::read(
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/upstream/agents.json"),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(
            definitions.len(),
            79,
            "review new upstream Agent definitions before upgrading"
        );
        for definition in &definitions {
            let id = definition["id"].as_str().unwrap();
            let name = definition["name"].as_str().unwrap();
            let home = TemporaryDirectory::new().unwrap();
            fs::create_dir_all(home.0.join(".agents/skills/example")).unwrap();
            assert_eq!(
                inspect_agent(id, name, &home.0, true, false).0,
                InstallationStatus::NotFound,
                "shared inventory alone cannot install {id}"
            );
            if matches!(id, "universal" | "fx" | "eve") {
                continue;
            }
            let command = entry_points(id).0.first().copied().unwrap_or(id);
            let path = home.0.join(".local/bin").join(command);
            program(&path);
            assert_eq!(
                inspect_agent(id, name, &home.0, true, false).0,
                InstallationStatus::Confirmed,
                "entry point for {id} is inspected"
            );
            fs::remove_file(&path).unwrap();
            assert_eq!(
                inspect_agent(id, name, &home.0, true, true).0,
                InstallationStatus::ConfigurationOnly,
                "residue does not confirm {id}"
            );
        }
        assert_eq!(entry_points("kimi-code-cli").0, &["kimi"]);
    }
    #[test]
    fn ide_extensions_and_project_dependency_need_real_implementation_files() {
        let home = TemporaryDirectory::new().unwrap();
        program(&home.0.join(".local/bin/code"));
        for id in [
            "codex",
            "claude-code",
            "cline",
            "roo",
            "kilo",
            "continue",
            "augment",
        ] {
            let identity = extension_ids(id)[0];
            let (publisher, name) = identity.split_once('.').unwrap();
            let directory = home
                .0
                .join(".vscode/extensions")
                .join(format!("{identity}-1.0.0"));
            fs::create_dir_all(&directory).unwrap();
            let manifest = serde_json::json!({"publisher":publisher,"name":name,"version":"1.0.0","engines":{"vscode":"^1.100.0"},"main":"entry.js"});
            fs::write(
                directory.join("package.json"),
                serde_json::to_vec(&manifest).unwrap(),
            )
            .unwrap();
            assert_eq!(
                inspect_agent(id, id, &home.0, true, false).0,
                InstallationStatus::NotFound
            );
            fs::write(directory.join("entry.js"), "module.exports={};").unwrap();
            assert_eq!(
                inspect_agent(id, id, &home.0, true, false).0,
                InstallationStatus::Confirmed
            );
            fs::remove_dir_all(directory).unwrap();
        }
        let eve = home.0.join("node_modules/eve");
        fs::create_dir_all(&eve).unwrap();
        fs::write(
            eve.join("package.json"),
            r#"{"name":"eve","version":"1.0.0","main":"index.js"}"#,
        )
        .unwrap();
        assert!(dependency_evidence(&home.0, "eve").is_none());
        fs::write(eve.join("index.js"), "module.exports={};").unwrap();
        assert!(dependency_evidence(&home.0, "eve").is_some());
    }
}

#[cfg(all(test, target_os = "macos"))]
mod codex_app_tests {
    use super::*;
    #[test]
    fn chatgpt_bundle_requires_codex_product_identity() {
        use std::os::unix::fs::PermissionsExt;
        let fixture = super::super::TemporaryDirectory::new().unwrap();
        let app = fixture.0.join("ChatGPT.app");
        fs::create_dir_all(app.join("Contents/MacOS")).unwrap();
        let executable = app.join("Contents/MacOS/fixture");
        fs::write(&executable, "#!/bin/sh\nexit 0\n").unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o755)).unwrap();
        for (id, expected) in [("com.openai.chat", false), ("com.openai.codex", true)] {
            fs::write(app.join("Contents/Info.plist"), format!(r#"<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>{id}</string><key>CFBundleExecutable</key><string>fixture</string></dict></plist>"#)).unwrap();
            assert_eq!(application_executable(&app).is_some(), expected);
        }
    }
}
