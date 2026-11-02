//! Read-only lock/source planning and verification around the original experimental_install.
use super::*;
use std::collections::{BTreeSet, HashSet};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestorePath {
    pub(super) path: String,
    pub(super) kind: String,
    pub(super) hash: Option<String>,
    pub(super) link_target: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestoreItem {
    skill: String,
    source: String,
    source_type: String,
    path: String,
    source_hash: Option<String>,
    recorded_hash: Option<String>,
    action: String,
    additional: bool,
    affected_agents: Vec<String>,
    before: RestorePath,
    issue: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestorePlan {
    target: Target,
    lock_path: String,
    lock_hash: String,
    agents: Vec<String>,
    items: Vec<RestoreItem>,
    observed: Vec<RestorePath>,
    warnings: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcome {
    skill: String,
    path: String,
    status: String,
    changed: bool,
    after_kind: String,
    content_matches: bool,
    content_state: &'static str,
    lock_matches: bool,
    lock_state: &'static str,
    lock_changed: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    plan: RestorePlan,
    items: Vec<RestoreOutcome>,
    inventory: Option<Inventory>,
    warnings: Vec<String>,
    logs: String,
}
#[derive(Clone)]
pub(super) struct Prepared {
    plan: RestorePlan,
    expected: BTreeMap<String, SourceSnapshot>,
}
pub(super) fn safe_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 200
        && name.is_ascii()
        && !name.starts_with('-')
        && name != "*"
        && !name.chars().any(char::is_control)
}
pub(super) fn folder_name(name: &str) -> String {
    let mut out = String::new();
    for c in name.to_ascii_lowercase().chars() {
        if c.is_ascii_alphanumeric() || "._".contains(c) {
            out.push(c);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    out.trim_matches(['.', '-']).chars().take(255).collect()
}
pub(super) fn file_hash(engine: &Engine, path: &Path) -> Result<String, String> {
    let output = run_process(
        engine
            .command(&engine.node, &engine.home)
            .arg(engine.resources.join("inspect-skill-documents.mjs"))
            .arg("--hash-file")
            .arg(path),
    )?;
    let value = output.stdout.trim();
    if !output.success || value.len() != 64 || !value.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Could not fingerprint the project lock file.".into());
    }
    Ok(value.into())
}
fn read_lock(project: &Path) -> Result<(Vec<u8>, serde_json::Value), String> {
    read_lock_with_empty(project, false)
}
fn read_lock_with_empty(
    project: &Path,
    allow_empty: bool,
) -> Result<(Vec<u8>, serde_json::Value), String> {
    let path = project.join("skills-lock.json");
    let meta =
        fs::symlink_metadata(&path).map_err(|e| format!("Cannot read skills-lock.json: {e}"))?;
    if !meta.is_file() || meta.len() > 1024 * 1024 {
        return Err(
            "Choose a regular skills-lock.json within 1 MiB; symbolic links are not restored."
                .into(),
        );
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if bytes.len() > 1024 * 1024 {
        return Err("Lock file exceeds limits.".into());
    }
    let value: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|e| format!("Invalid skills-lock.json: {e}"))?;
    let skills = value["skills"]
        .as_object()
        .ok_or("skills-lock.json must contain a skills object.")?;
    if value["version"] != 1 || !allow_empty && skills.is_empty() || skills.len() > 200 {
        return Err("Restore requires a version 1 lock containing 1–200 skills.".into());
    }
    Ok((bytes, value))
}
pub(super) fn link_destination(path: &Path) -> Option<PathBuf> {
    let target = fs::read_link(path).ok()?;
    let absolute = if target.is_absolute() {
        target
    } else {
        dunce::canonicalize(path.parent()?).ok()?.join(target)
    };
    let mut normalized = PathBuf::new();
    for part in absolute.components() {
        match part {
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            std::path::Component::CurDir => {}
            part => normalized.push(part.as_os_str()),
        }
    }
    // Windows read_link may return a verbatim absolute target; records use CLI paths.
    Some(dunce::simplified(&normalized).to_path_buf())
}
pub(super) fn observe(engine: &Engine, path: &Path) -> RestorePath {
    let mut out = RestorePath {
        path: path.to_string_lossy().into_owned(),
        kind: "unknown".into(),
        hash: None,
        link_target: None,
    };
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => out.kind = "missing".into(),
        Ok(m) => {
            out.kind = if m.is_symlink() {
                "link"
            } else if m.is_dir() {
                "directory"
            } else {
                "other"
            }
            .into();
            if m.is_symlink() {
                out.link_target = fs::read_link(path)
                    .ok()
                    .map(|p| p.to_string_lossy().into_owned());
            }
            if path.is_dir() {
                out.hash = engine
                    .documents(std::slice::from_ref(&out.path))
                    .ok()
                    .and_then(|d| d.get(&out.path).and_then(|doc| doc.hash.clone()));
            }
        }
        _ => {}
    }
    out
}
// Batch hashes by resolved directory so shared Agent paths are read once per check.
pub(super) fn observations(
    engine: &Engine,
    paths: impl IntoIterator<Item = PathBuf>,
) -> BTreeMap<String, RestorePath> {
    let mut result = BTreeMap::new();
    let mut directories = BTreeSet::new();
    let mut resolved = BTreeMap::new();
    for path in paths {
        let key = path.to_string_lossy().into_owned();
        if result.contains_key(&key) {
            continue;
        }
        let mut item = RestorePath {
            path: key.clone(),
            kind: "unknown".into(),
            hash: None,
            link_target: None,
        };
        match fs::symlink_metadata(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => item.kind = "missing".into(),
            Ok(meta) => {
                item.kind = if meta.is_symlink() {
                    "link"
                } else if meta.is_dir() {
                    "directory"
                } else {
                    "other"
                }
                .into();
                if meta.is_symlink() {
                    item.link_target = fs::read_link(&path)
                        .ok()
                        .map(|p| p.to_string_lossy().into_owned());
                }
                if path.is_dir() {
                    if let Ok(real) = fs::canonicalize(&path) {
                        let real = real.to_string_lossy().into_owned();
                        directories.insert(real.clone());
                        resolved.insert(key.clone(), real);
                    }
                }
            }
            _ => {}
        }
        result.insert(key, item);
    }
    let mut hashes = BTreeMap::new();
    let directories = directories.into_iter().collect::<Vec<_>>();
    for batch in directories.chunks(100) {
        if let Ok(docs) = engine.documents(batch) {
            for (path, doc) in docs {
                hashes.insert(path, doc.hash);
            }
        }
    }
    for (path, real) in resolved {
        if let Some(item) = result.get_mut(&path) {
            item.hash = hashes.get(&real).cloned().flatten();
        }
    }
    result
}

#[derive(Serialize)]
pub struct RestoreRecord {
    skill: String,
    source: String,
}
#[tauri::command]
pub async fn upstream_restore_records(
    app: AppHandle,
    target: Target,
) -> Result<Vec<RestoreRecord>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let engine = Engine::from_app(&app)?;
        if target.scope != "project" {
            return Err("Select a project.".into());
        }
        let project = target.directory(&engine.home)?;
        if fs::symlink_metadata(project.join("skills-lock.json"))
            .is_err_and(|e| e.kind() == std::io::ErrorKind::NotFound)
        {
            return Ok(vec![]);
        }
        let (_, lock) = read_lock_with_empty(&project, true)?;
        Ok(lock["skills"]
            .as_object()
            .ok_or("Missing project skills.")?
            .iter()
            .map(|(name, entry)| RestoreRecord {
                skill: name.clone(),
                source: display_source(entry["source"].as_str().unwrap_or("unknown")),
            })
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub(super) fn node_skills(
    engine: &Engine,
    project: &Path,
) -> Result<Vec<(String, String, PathBuf, String)>, String> {
    let output = run_process(
        engine
            .command(&engine.node, project)
            .arg(engine.resources.join("inspect-upstream-dependencies.mjs"))
            .arg(project),
    )?;
    if !output.success {
        return Err(format!("Dependency discovery failed: {}", output.stderr));
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Found {
        name: String,
        package_name: String,
        path: String,
    }
    #[derive(Deserialize)]
    struct Discovery {
        skills: Vec<Found>,
    }
    let discovery: Discovery = serde_json::from_str(&output.stdout).map_err(|e| e.to_string())?;
    let docs = engine.documents(
        &discovery
            .skills
            .iter()
            .map(|s| s.path.clone())
            .collect::<Vec<_>>(),
    )?;
    let mut out = Vec::new();
    for skill in discovery.skills {
        let doc = docs
            .get(&skill.path)
            .ok_or("Missing dependency content observation.")?;
        if doc.name.as_deref() != Some(&skill.name) || doc.internal {
            return Err("Dependency identity could not be verified.".into());
        }
        out.push((
            skill.name,
            skill.package_name,
            PathBuf::from(skill.path),
            doc.hash
                .clone()
                .ok_or("Dependency source exceeds verification limits.")?,
        ));
    }
    out.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)).then(a.2.cmp(&b.2)));
    Ok(out)
}
fn display_source(value: &str) -> String {
    if reqwest::Url::parse(value)
        .is_ok_and(|u| u.password().is_some() || (!u.username().is_empty() && u.scheme() != "ssh"))
    {
        "[credential-bearing source]".into()
    } else {
        value.into()
    }
}
fn entry_snapshot(
    engine: &Engine,
    target: &Target,
    name: &str,
    entry: &serde_json::Value,
    cache: &mut SourceCache,
) -> Result<SourceSnapshot, String> {
    let source = entry["sourceUrl"]
        .as_str()
        .or_else(|| entry["source"].as_str())
        .ok_or("Source is unknown.")?;
    if matches!(entry["sourceType"].as_str(), Some("git" | "gitlab"))
        && entry["sourceUrl"].as_str().is_none()
        && !source.contains(':')
        && !source.starts_with('.')
        && !source.starts_with('/')
    {
        return Err(
            "Generic Git/GitLab lock entry is missing sourceUrl; upstream cannot restore it."
                .into(),
        );
    }
    if entry["sourceType"] == "local" {
        if entry["ref"].as_str().is_some() {
            return Err("A local source with a Git ref cannot be reliably restored.".into());
        }
        let project = target.directory(&engine.home)?;
        let root = if Path::new(source).is_absolute() {
            PathBuf::from(source)
        } else {
            project.join(source)
        };
        let folder = entry["skillPath"]
            .as_str()
            .map(|s| {
                s.strip_suffix("/SKILL.md")
                    .or_else(|| s.strip_suffix("SKILL.md"))
                    .unwrap_or(s)
                    .trim_end_matches('/')
            })
            .unwrap_or("");
        let path = if folder.is_empty() || source.ends_with(".git") {
            fs::canonicalize(&root).map_err(|e| e.to_string())?
        } else {
            contained_path(&fs::canonicalize(&root).map_err(|e| e.to_string())?, folder)?
        };
        let preview = inspect(engine, &path.to_string_lossy())?;
        let skill = preview
            .skills
            .into_iter()
            .find(|s| s.name == name)
            .ok_or("Recorded local skill is missing, hidden or renamed.")?;
        return Ok(SourceSnapshot {
            internal: false,
            signature: Some(
                skill
                    .signature
                    .ok_or("Local source exceeds verification limits.")?,
            ),
            hashes: vec![skill
                .fingerprint
                .ok_or("Local source exceeds verification limits.")?],
        });
    }
    source_snapshot_from_entry(engine, target, name, entry, cache)
}
#[cfg(test)]
fn prepare(engine: &Engine, target: &Target) -> Result<Prepared, String> {
    prepare_cached(engine, target, &mut SourceCache::default())
}
fn prepare_cached(
    engine: &Engine,
    target: &Target,
    cache: &mut SourceCache,
) -> Result<Prepared, String> {
    if target.scope != "project" {
        return Err("Select a project to restore its skills-lock.json.".into());
    }
    let project = target.directory(&engine.home)?;
    for parent in [project.join(".agents"), project.join(".agents/skills")] {
        match fs::symlink_metadata(parent) {
            Ok(m) if m.is_symlink() || !m.is_dir() => return Err(
                "The project shared skills root must be a real directory. Inspect its links first."
                    .into(),
            ),
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
            _ => {}
        }
    }
    let (bytes, lock) = read_lock(&project)?;
    let lock_path = project.join("skills-lock.json");
    let lock_hash = file_hash(engine, &lock_path)?;
    if fs::read(&lock_path).map_err(|e| e.to_string())? != bytes {
        return Err("Lock file changed during preview. Inspect again.".into());
    }
    let definitions: Vec<AgentDefinition> = serde_json::from_slice(
        &fs::read(engine.resources.join("agents.json")).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let agents: Vec<_> = definitions
        .iter()
        .filter(|a| a.project_path == ".agents/skills" && a.universal_visible)
        .map(|a| a.id.clone())
        .collect();
    if agents.is_empty() {
        return Err("Upstream universal Agent metadata is unavailable.".into());
    }
    let inventory = engine.inventory(target)?;
    let entries = lock["skills"].as_object().unwrap();
    let mut paths: BTreeSet<PathBuf> = inventory
        .skills
        .iter()
        .map(|s| PathBuf::from(&s.path))
        .collect();
    for name in entries.keys() {
        paths.insert(project.join(".agents/skills").join(folder_name(name)));
        for agent in &inventory.agents {
            for base in std::iter::once(&agent.path).chain(agent.additional_paths.iter()) {
                paths.insert(Path::new(base).join(folder_name(name)));
            }
        }
    }
    let observed_cache = observations(engine, paths);
    let mut locations = Vec::new();
    for entry in entries.values().filter(|e| {
        matches!(e["sourceType"].as_str(), Some("github" | "gitlab" | "git"))
            && !e["subagents"].is_array()
            && !e["pluginName"].is_string()
    }) {
        if let Some(source) = entry["sourceUrl"]
            .as_str()
            .or_else(|| entry["source"].as_str())
        {
            if matches!(entry["sourceType"].as_str(), Some("git" | "gitlab"))
                && entry["sourceUrl"].as_str().is_none()
                && !source.contains(':')
                && !source.starts_with('.')
                && !source.starts_with('/')
            {
                continue;
            }
            let location = cache
                .locations
                .entry(source.into())
                .or_insert_with(|| parsed_git_location(&parsed_source(engine, source)?));
            if let Ok(location) = location {
                let mut location = location.clone();
                location.reference = entry["ref"]
                    .as_str()
                    .map(str::to_owned)
                    .or(location.reference);
                locations.push(location);
            }
        }
    }
    cache.warm(engine, locations)?;
    let mut expected = BTreeMap::new();
    let mut items = Vec::new();
    let mut destinations = HashSet::new();
    let mut add_item = |name: &str,
                        entry: &serde_json::Value,
                        snapshot: Result<SourceSnapshot, String>,
                        additional: bool,
                        action: &str|
     -> Result<(), String> {
        if !safe_name(name) {
            return Err(
                "A lock/dependency skill name cannot be safely restored by this GUI.".into(),
            );
        }
        let folder = folder_name(name);
        if folder.is_empty() || !destinations.insert(folder.clone()) {
            return Err("Duplicate or colliding skill destinations prevent a reliable restore. Inspect the lock and dependencies.".into());
        }
        let path = project.join(".agents/skills").join(folder);
        let before = observed_cache
            .get(path.to_string_lossy().as_ref())
            .cloned()
            .unwrap_or_else(|| observe(engine, &path));
        let mut issue = None;
        let mut source_hash = None;
        match snapshot {
            Ok(snapshot) if snapshot.internal => {
                issue = Some("Internal skills are not available in this restore workflow.".into());
            }
            Ok(snapshot) => {
                source_hash = snapshot.hashes.first().cloned();
                expected.insert(name.into(), snapshot);
            }
            Err(e) => issue = Some(e),
        }
        if before.kind != "missing" && before.hash.is_none() {
            issue=Some("Existing target cannot be fully inspected. Review its actual directory before restoring.".into());
        }
        let resolved = dunce::canonicalize(&path).ok();
        let mut affected: BTreeSet<String> = agents.iter().cloned().collect();
        for record in &inventory.skills {
            if resolved
                .as_ref()
                .is_some_and(|p| Path::new(&record.path) == p)
            {
                affected.extend(record.agents.clone());
            }
        }
        for agent in &inventory.agents {
            for base in std::iter::once(&agent.path).chain(agent.additional_paths.iter()) {
                if link_destination(&Path::new(base).join(folder_name(name))).as_ref()
                    == Some(&path)
                {
                    affected.insert(agent.id.clone());
                }
            }
        }
        items.push(RestoreItem {
            skill: name.into(),
            source: display_source(entry["source"].as_str().unwrap_or("unknown")),
            source_type: entry["sourceType"].as_str().unwrap_or("unknown").into(),
            path: before.path.clone(),
            source_hash,
            recorded_hash: entry["computedHash"].as_str().map(str::to_owned),
            action: action.into(),
            additional,
            affected_agents: affected.into_iter().collect(),
            before,
            issue,
        });
        Ok(())
    };
    for (name, entry) in entries
        .iter()
        .filter(|(_, e)| e["sourceType"] != "node_modules")
    {
        let snapshot = if entry["subagents"].is_array() || entry["pluginName"].is_string() {
            Err("Subagent/plugin lock entries require a separate supported workflow.".into())
        } else {
            entry_snapshot(engine, target, name, entry, cache)
        };
        add_item(name, entry, snapshot, false, "restore")?;
    }
    if entries.values().any(|e| e["sourceType"] == "node_modules") {
        let discovered = node_skills(engine, &project)?;
        let found: HashSet<_> = discovered.iter().map(|s| s.0.as_str()).collect();
        for (name, entry) in entries
            .iter()
            .filter(|(n, e)| e["sourceType"] == "node_modules" && !found.contains(n.as_str()))
        {
            add_item(name,entry,Err("Locked dependency skill is absent from node_modules. Install project dependencies and inspect again.".into()),false,"skip")?;
        }
        for (name, package, path, hash) in discovered {
            if entries
                .get(&name)
                .is_some_and(|e| e["sourceType"] != "node_modules")
            {
                return Err("A dependency skill collides with a remote lock skill; upstream could overwrite it. Resolve the duplicate before restoring.".into());
            }
            let old = entries.get(&name);
            let entry = serde_json::json!({"source":package,"sourceType":"node_modules","computedHash":old.and_then(|e|e["computedHash"].as_str())});
            let action = "restore";
            let snapshot = source_install_signature(&path)
                .map(|signature| SourceSnapshot {
                    internal: false,
                    signature: Some(signature),
                    hashes: vec![hash],
                })
                .ok_or("Dependency source cannot be fully verified.".into());
            add_item(&name, &entry, snapshot, old.is_none(), action)?;
        }
    }
    items.sort_by(|a, b| a.skill.cmp(&b.skill));
    let mut observed_paths: BTreeSet<PathBuf> = inventory
        .skills
        .iter()
        .map(|s| PathBuf::from(&s.path))
        .collect();
    for agent in &inventory.agents {
        for base in std::iter::once(&agent.path).chain(agent.additional_paths.iter()) {
            for item in &items {
                let path = Path::new(base).join(folder_name(&item.skill));
                if fs::symlink_metadata(&path).is_ok() {
                    observed_paths.insert(path);
                }
            }
        }
    }
    let observed: Vec<_> = observed_paths
        .into_iter()
        .map(|p| {
            observed_cache
                .get(p.to_string_lossy().as_ref())
                .cloned()
                .unwrap_or_else(|| observe(engine, &p))
        })
        .collect();
    if fs::read(&lock_path).map_err(|e| e.to_string())? != bytes {
        return Err("Lock changed while inspecting sources. Inspect again.".into());
    }
    let warnings = observed
        .iter()
        .filter(|p| {
            p.hash.is_none()
                && p.kind != "missing"
                && !items.iter().any(|item| {
                    item.path == p.path
                        || link_destination(Path::new(&p.path)).as_ref()
                            == Some(&PathBuf::from(&item.path))
                })
        })
        .map(|p| format!("Existing installation cannot be fully verified: {}", p.path))
        .collect();
    Ok(Prepared {
        plan: RestorePlan {
            target: Target {
                project_path: Some(project.to_string_lossy().into_owned()),
                ..target.clone()
            },
            lock_path: lock_path.to_string_lossy().into_owned(),
            lock_hash,
            agents,
            items,
            observed,
            warnings,
        },
        expected,
    })
}
fn reviewed(
    engine: &Engine,
    confirmed: &RestorePlan,
    cache: &mut SourceCache,
) -> Result<Prepared, String> {
    let Some(prepared) = cache
        .restoration
        .as_ref()
        .filter(|p| p.plan == *confirmed)
        .cloned()
    else {
        return prepare_cached(engine, &confirmed.target, cache);
    };
    let project = confirmed.target.directory(&engine.home)?;
    for path in [project.join(".agents"), project.join(".agents/skills")] {
        if fs::symlink_metadata(path).is_ok_and(|m| m.is_symlink() || !m.is_dir()) {
            return Err("Project installation directory changed. Check again.".into());
        }
    }
    let (_, lock) = read_lock(&project)?;
    if file_hash(engine, &project.join("skills-lock.json"))? != confirmed.lock_hash {
        return Err("Project installation records changed. Check again.".into());
    }
    let current = observations(
        engine,
        confirmed.observed.iter().map(|p| PathBuf::from(&p.path)),
    );
    if confirmed
        .observed
        .iter()
        .any(|p| current.get(&p.path) != Some(p))
    {
        return Err("Installed files changed. Check again before reinstalling.".into());
    }
    let dependencies = if confirmed
        .items
        .iter()
        .any(|i| i.source_type == "node_modules")
    {
        node_skills(engine, &project)?
    } else {
        vec![]
    };
    let expected_names: BTreeSet<_> = confirmed
        .items
        .iter()
        .filter(|i| i.source_type == "node_modules")
        .map(|i| i.skill.as_str())
        .collect();
    if dependencies
        .iter()
        .map(|i| i.0.as_str())
        .collect::<BTreeSet<_>>()
        != expected_names
    {
        return Err("Project dependencies changed. Check again.".into());
    }
    for item in &confirmed.items {
        let snapshot = if item.source_type == "node_modules" {
            let (_, _, path, hash) = dependencies
                .iter()
                .find(|i| i.0 == item.skill)
                .ok_or("Dependency skill is missing.")?;
            SourceSnapshot {
                internal: false,
                signature: source_install_signature(path),
                hashes: vec![hash.clone()],
            }
        } else {
            entry_snapshot(
                engine,
                &confirmed.target,
                &item.skill,
                &lock["skills"][&item.skill],
                cache,
            )?
        };
        if prepared.expected.get(&item.skill) != Some(&snapshot) {
            return Err("Skill source changed. Check again before reinstalling.".into());
        }
    }
    Ok(prepared)
}

fn restore(engine: &Engine, confirmed: &RestorePlan) -> Result<RestoreResult, String> {
    let _guard = MUTATION
        .try_lock()
        .map_err(|_| "Another skill operation is running.")?;
    let prepared = project_sources::with(engine, &confirmed.target, "restore", true, |cache| {
        reviewed(engine, confirmed, cache)
    })?;
    if prepared.plan != *confirmed {
        return Err(
            "Lock, sources or installed targets changed. Inspect and confirm a fresh restore plan."
                .into(),
        );
    }
    if confirmed.items.iter().any(|i| i.issue.is_some()) {
        return Err("Resolve all restore preview issues before execution.".into());
    }
    let before_lock = engine.lock(&confirmed.target)?;
    let args = vec![
        "experimental_install".into(),
        "--copy".into(),
        "--no-cleanup".into(),
        "--no-remote".into(),
    ];
    let output = engine.cli(&args, &confirmed.target);
    let (success, logs) = match output {
        Ok(o) => (o.success, format!("{}\n{}", o.stdout, o.stderr)),
        Err(e) => (false, e),
    };
    let inventory = engine.inventory(&confirmed.target).ok();
    let after_lock = engine.lock(&confirmed.target).ok();
    let mut warnings = Vec::new();
    if !success {
        warnings.push("Execution failed or timed out. Actual state is reported below; no rollback was attempted.".into());
    }
    if inventory.is_none() {
        warnings
            .push("Inventory refresh failed. Inspect actual directories before retrying.".into());
    }
    let target_paths: BTreeSet<_> = confirmed.items.iter().map(|i| i.path.as_str()).collect();
    let mut affected_paths: BTreeSet<String> = target_paths.iter().map(|p| (*p).into()).collect();
    for path in &confirmed.observed {
        if target_paths.contains(path.path.as_str()) {
            continue;
        }
        let after = observe(engine, Path::new(&path.path));
        let shared_link = path.kind == "link"
            && after.kind == "link"
            && path.link_target == after.link_target
            && dunce::canonicalize(&path.path)
                .ok()
                .is_some_and(|p| target_paths.contains(p.to_string_lossy().as_ref()));
        if shared_link {
            affected_paths.insert(path.path.clone());
        } else if path.hash.is_none() || after != *path {
            warnings.push(format!(
                "Other installation changed or could not be confirmed: {}",
                path.path
            ));
        }
    }
    if let Some(after) = &inventory {
        for skill in &after.skills {
            if !confirmed.observed.iter().any(|p| p.path == skill.path)
                && !affected_paths.contains(&skill.path)
            {
                warnings.push(format!(
                    "Additional installation observed outside the plan: {}",
                    skill.path
                ));
            }
        }
    }
    if let Some(after) = &after_lock {
        let planned: BTreeSet<_> = confirmed.items.iter().map(|i| i.skill.as_str()).collect();
        let old = before_lock["skills"]
            .as_object()
            .ok_or("Cannot inspect previous lock records.")?;
        let new = after["skills"].as_object();
        if new.is_none()
            || old.iter().any(|(n, e)| {
                !planned.contains(n.as_str()) && new.and_then(|m| m.get(n)) != Some(e)
            })
            || new.is_some_and(|m| {
                m.keys()
                    .any(|n| !planned.contains(n.as_str()) && !old.contains_key(n))
            })
        {
            warnings.push("Unplanned lock records changed or could not be inspected.".into());
        }
    } else {
        warnings.push("Lock records could not be read after execution.".into());
    }
    let integrity_ok = warnings
        .iter()
        .all(|w| w.starts_with("Execution failed or timed out."));
    let items = confirmed
        .items
        .iter()
        .map(|item| {
            let after = observe(engine, Path::new(&item.path));
            let expected = prepared.expected.get(&item.skill);
            let signature = tree_signature(Path::new(&item.path));
            let reference = expected.and_then(|e| e.signature.as_ref());
            let content_matches = reference.is_some() && signature.as_ref() == reference;
            let content_state = if content_matches {
                "matching"
            } else if after.kind == "missing" {
                "missing"
            } else if reference.is_none() {
                "unverified"
            } else if signature.is_none() {
                "unreadable"
            } else {
                "different"
            };
            let entry = after_lock.as_ref().map(|l| &l["skills"][&item.skill]);
            let lock_matches = entry.is_some_and(|e| {
                e["sourceType"] == item.source_type
                    && e["computedHash"].as_str() == item.source_hash.as_deref()
                    && (item.source_type != "node_modules" || e["source"] == item.source)
            });
            let status = if content_matches && lock_matches && integrity_ok {
                "complete"
            } else if after.kind == "missing"
                || !success
                || after.hash.is_some() && !content_matches
            {
                "failed"
            } else {
                "uncertain"
            };
            RestoreOutcome {
                skill: item.skill.clone(),
                path: item.path.clone(),
                status: status.into(),
                changed: after != item.before,
                after_kind: after.kind,
                content_matches,
                content_state,
                lock_matches,
                lock_state: if lock_matches {
                    "matching"
                } else if entry.is_none() {
                    "unreadable"
                } else if entry.is_some_and(serde_json::Value::is_null) {
                    "missing"
                } else {
                    "different"
                },
                lock_changed: entry != Some(&before_lock["skills"][&item.skill]),
            }
        })
        .collect();
    Ok(RestoreResult {
        plan: confirmed.clone(),
        items,
        inventory,
        warnings,
        logs,
    })
}
#[tauri::command]
pub async fn upstream_restore_plan(
    app: AppHandle,
    webview: tauri::Webview,
    target: Target,
    on_progress: Option<JavaScriptChannelId>,
) -> Result<RestorePlan, String> {
    let progress = on_progress.map(|id| id.channel_on(webview));
    tauri::async_runtime::spawn_blocking(move || {
        let mut engine = Engine::from_app(&app)?;
        engine.progress = progress;
        engine.report_installation("checking", 0, 0);
        project_sources::with(&engine, &target, "restore", true, |cache| {
            let prepared = prepare_cached(&engine, &target, cache)?;
            let plan = prepared.plan.clone();
            cache.restoration = Some(prepared);
            Ok(plan)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_restore(app: AppHandle, plan: RestorePlan) -> Result<RestoreResult, String> {
    tauri::async_runtime::spawn_blocking(move || restore(&Engine::from_app(&app)?, &plan))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::tests::engine;
    fn target(project: &Path) -> Target {
        Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into_owned()),
        }
    }
    fn source(path: &Path, name: &str, version: &str) {
        crate::upstream::tests::declare_dependency(path);
        fs::create_dir_all(path).unwrap();
        fs::write(
            path.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: Restore fixture\n---\n# {version}\n"),
        )
        .unwrap();
    }
    fn git(engine: &Engine, path: &Path, args: &[&str]) {
        let output = run_process(engine.command(Path::new("git"), path).args(args)).unwrap();
        assert!(output.success, "{}", output.stderr);
    }
    fn commit(engine: &Engine, path: &Path) {
        git(engine, path, &["add", "."]);
        git(
            engine,
            path,
            &[
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-qm",
                "fixture",
            ],
        );
    }
    fn add(engine: &Engine, t: &Target, url: &str, agents: &[&str], copy: bool) {
        let mut args = vec!["add".into(), url.into(), "--yes".into(), "--agent".into()];
        args.extend(agents.iter().map(|s| (*s).into()));
        if copy {
            args.push("--copy".into());
        }
        let out = engine.cli(&args, t).unwrap();
        assert!(out.success, "{} {}", out.stdout, out.stderr);
    }
    #[test]
    fn reviewed_reinstall_rechecks_local_edits_and_retries_without_full_inventory_prepare() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        fs::create_dir_all(home.join(".codex")).unwrap();
        let project = root.0.join("project");
        fs::create_dir_all(&project).unwrap();
        let original = root.0.join("source");
        source(&original, "reviewed-skill", "source body");
        let engine = engine(&home);
        let t = target(&project);
        add(&engine, &t, &original.to_string_lossy(), &["codex"], true);
        let path = project.join(".agents/skills/reviewed-skill");
        let review = || {
            project_sources::with(&engine, &t, "restore", false, |cache| {
                let prepared = prepare_cached(&engine, &t, cache)?;
                let plan = prepared.plan.clone();
                cache.restoration = Some(prepared);
                Ok(plan)
            })
            .unwrap()
        };
        let first = review();
        fs::write(path.join("note.txt"), "keep concurrent edit").unwrap();
        assert!(restore(&engine, &first).is_err());
        assert_eq!(
            fs::read_to_string(path.join("note.txt")).unwrap(),
            "keep concurrent edit"
        );
        let current = review();
        let result = restore(&engine, &current).unwrap();
        assert!(
            result.items.iter().all(|item| item.status == "complete"),
            "{:?}",
            result.warnings
        );
        assert!(!path.join("note.txt").exists());
        assert!(fs::read_to_string(path.join("SKILL.md"))
            .unwrap()
            .contains("source body"));
        project_sources::cleanup();
    }
    #[test]
    fn batched_observations_match_single_reads_and_detect_restored_content() {
        let root = TemporaryDirectory::new().unwrap();
        fs::create_dir_all(root.0.join("home")).unwrap();
        let e = engine(&root.0.join("home"));
        let dir = root.0.join("skill");
        source(&dir, "fixture", "original");
        let missing = root.0.join("missing");
        let linked = root.0.join("linked");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&dir, &linked).unwrap();
        let paths = vec![dir.clone(), missing, linked];
        let batch = observations(&e, paths.clone());
        for path in &paths {
            assert_eq!(
                batch[&path.to_string_lossy().into_owned()],
                observe(&e, path)
            );
        }
        let original = batch[&dir.to_string_lossy().into_owned()].clone();
        fs::write(dir.join("note.txt"), "local edit").unwrap();
        assert_ne!(
            observations(&e, vec![dir.clone()])[&dir.to_string_lossy().into_owned()],
            original
        );
        fs::remove_file(dir.join("note.txt")).unwrap();
        assert_eq!(
            observations(&e, vec![dir.clone()])[&dir.to_string_lossy().into_owned()],
            original
        );
    }
    #[test]
    fn real_local_restore_supports_sources_created_with_init() {
        let fixture = TemporaryDirectory::new().unwrap();
        let home = fixture.0.join("home");
        let project = fixture.0.join("project");
        fs::create_dir_all(&home).unwrap();
        fs::create_dir_all(&project).unwrap();
        let engine = engine(&home);
        let t = target(&project);
        let output = engine
            .cli(&["init".into(), "local-skill".into()], &t)
            .unwrap();
        assert!(output.success);
        let source_path = project.join("local-skill");
        add(
            &engine,
            &t,
            source_path.to_str().unwrap(),
            &["codex"],
            false,
        );
        fs::remove_dir_all(project.join(".agents/skills/local-skill")).unwrap();
        let plan = prepare(&engine, &t).unwrap().plan;
        assert!(plan.items[0].issue.is_none(), "{:?}", plan.items[0].issue);
        let result = restore(&engine, &plan).unwrap();
        assert_eq!(
            result.items[0].status, "complete",
            "{} {:?}",
            result.logs, result.warnings
        );
        let raw_lock = engine.lock(&t).unwrap();
        let portable = raw_lock["skills"]["local-skill"]["source"]
            .as_str()
            .unwrap();
        assert!(!Path::new(portable).is_absolute());
        assert_eq!(
            fs::canonicalize(t.directory(&engine.home).unwrap().join(portable)).unwrap(),
            fs::canonicalize(&source_path).unwrap()
        );
        let inventory = engine.inventory(&t).unwrap();
        let install_source = inventory.skills[0].install_source.as_deref().unwrap();
        assert!(Path::new(install_source).is_absolute());
        assert_eq!(
            fs::canonicalize(install_source).unwrap(),
            fs::canonicalize(&source_path).unwrap()
        );
        assert_eq!(
            inspect(&engine, install_source).unwrap().skills[0].name,
            "local-skill"
        );
        assert_eq!(
            fs::read(source_path.join("SKILL.md")).unwrap(),
            fs::read(project.join(".agents/skills/local-skill/SKILL.md")).unwrap()
        );
    }
    #[test]
    fn real_restore_preserves_eve_content_without_standard_name_metadata() {
        let fixture = TemporaryDirectory::new().unwrap();
        let home = fixture.0.join("home");
        let project = fixture.0.join("project");
        let local = fixture.0.join("source");
        fs::create_dir_all(&home).unwrap();
        fs::create_dir_all(&project).unwrap();
        let engine = engine(&home);
        let t = target(&project);
        source(&local, "restore-skill", "one");
        add(&engine, &t, local.to_str().unwrap(), &["codex"], false);
        let eve = project.join("agent/subagents/alpha/skills/manual-eve");
        fs::create_dir_all(&eve).unwrap();
        let content = "---\ndescription: Eve manual document\n---\n# Keep\n";
        fs::write(eve.join("SKILL.md"), content).unwrap();
        fs::remove_dir_all(project.join(".agents/skills/restore-skill")).unwrap();
        let plan = prepare(&engine, &t).unwrap().plan;
        assert!(plan.warnings.is_empty(), "{:?}", plan.warnings);
        let result = restore(&engine, &plan).unwrap();
        assert_eq!(
            result.items[0].status, "complete",
            "{} {:?}",
            result.logs, result.warnings
        );
        assert_eq!(fs::read_to_string(eve.join("SKILL.md")).unwrap(), content);
    }
    #[test]
    fn missing_generic_git_url_is_blocked_without_network_and_credentials_are_not_exposed() {
        let fixture = TemporaryDirectory::new().unwrap();
        let home = fixture.0.join("home");
        let project = fixture.0.join("project");
        fs::create_dir_all(&home).unwrap();
        fs::create_dir_all(&project).unwrap();
        let engine = engine(&home);
        let t = target(&project);
        for source in [
            "owner/repo",
            "https://secret-token@example.invalid/repo.git",
        ] {
            let bytes=serde_json::to_vec(&serde_json::json!({"version":1,"skills":{"skill":{"source":source,"sourceType":"git","computedHash":"0".repeat(64)}}})).unwrap();
            fs::write(project.join("skills-lock.json"), &bytes).unwrap();
            let plan = prepare(&engine, &t).unwrap().plan;
            assert!(plan.items[0].issue.is_some());
            assert!(!serde_json::to_string(&plan)
                .unwrap()
                .contains("secret-token"));
            assert!(restore(&engine, &plan).is_err());
            assert_eq!(fs::read(project.join("skills-lock.json")).unwrap(), bytes);
            assert!(!project.join(".agents").exists());
        }
    }
    #[test]
    fn real_git_restore_refreshes_shared_content_and_lock_preserving_independent_copy() {
        let fixture = TemporaryDirectory::new().unwrap();
        let home = fixture.0.join("home");
        let project = fixture.0.join("project");
        fs::create_dir_all(home.join(".codex")).unwrap();
        fs::create_dir_all(&project).unwrap();
        let engine = engine(&home);
        let t = target(&project);
        let repo = fixture.0.join("fixture.git");
        source(&repo, "restore-skill", "Version 1");
        git(&engine, &repo, &["init", "-q", "-b", "main"]);
        commit(&engine, &repo);
        let url = reqwest::Url::from_file_path(&repo).unwrap().to_string();
        add(&engine, &t, &url, &["codex", "claude-code"], false);
        add(&engine, &t, &url, &["hermes-agent"], true);
        let copy = project.join(".hermes/skills/restore-skill/SKILL.md");
        let copy_before = fs::read(&copy).unwrap();
        fs::remove_dir_all(project.join(".agents/skills/restore-skill")).unwrap();
        source(&repo, "restore-skill", "Version 2");
        commit(&engine, &repo);
        let plan = prepare(&engine, &t).unwrap().plan;
        assert!(plan.items[0].issue.is_none());
        assert!(plan.items[0]
            .affected_agents
            .contains(&"claude-code".into()));
        assert_ne!(plan.items[0].source_hash, plan.items[0].recorded_hash);
        let result = restore(&engine, &plan).unwrap();
        assert_eq!(
            result.items[0].status, "complete",
            "{} {:?}",
            result.logs, result.warnings
        );
        assert!(result.items[0].lock_changed);
        assert!(
            fs::read_to_string(project.join(".agents/skills/restore-skill/SKILL.md"))
                .unwrap()
                .contains("Version 2")
        );
        assert_eq!(fs::read(copy).unwrap(), copy_before);
        assert!(project
            .join(".claude/skills/restore-skill/SKILL.md")
            .is_file());
        assert!(!home.join(".agents/skills/restore-skill").exists());
    }
    #[test]
    fn real_dependency_restore_lists_extra_skills_and_repairs_missing_targets() {
        let fixture = TemporaryDirectory::new().unwrap();
        let home = fixture.0.join("home");
        let project = fixture.0.join("project");
        fs::create_dir_all(&home).unwrap();
        fs::create_dir_all(&project).unwrap();
        let engine = engine(&home);
        let t = target(&project);
        source(
            &project.join("node_modules/pkg"),
            "locked-dependency",
            "one",
        );
        let sync = engine
            .cli(
                &[
                    "experimental_sync".into(),
                    "--copy".into(),
                    "--no-cleanup".into(),
                    "--no-remote".into(),
                    "--yes".into(),
                    "--agent".into(),
                    "codex".into(),
                ],
                &t,
            )
            .unwrap();
        assert!(sync.success, "{}", sync.stderr);
        fs::remove_dir_all(project.join(".agents/skills/locked-dependency")).unwrap();
        source(
            &project.join("node_modules/@scope/extra/skills/extra"),
            "extra-dependency",
            "two",
        );
        let plan = prepare(&engine, &t).unwrap().plan;
        assert_eq!(plan.items.len(), 2);
        assert!(plan
            .items
            .iter()
            .any(|i| i.additional && i.skill == "extra-dependency"));
        assert!(plan
            .items
            .iter()
            .any(|i| i.skill == "locked-dependency" && i.action == "restore"));
        let result = restore(&engine, &plan).unwrap();
        assert_eq!(
            result
                .items
                .iter()
                .find(|i| i.skill == "locked-dependency")
                .unwrap()
                .status,
            "complete",
            "{}",
            result.logs
        );
        assert_eq!(
            result
                .items
                .iter()
                .find(|i| i.skill == "extra-dependency")
                .unwrap()
                .status,
            "complete",
            "{} {:?}",
            result.logs,
            result.warnings
        );
        let reviewed = prepare(&engine, &t).unwrap().plan;
        let result = restore(&engine, &reviewed).unwrap();
        assert!(
            result.items.iter().all(|i| i.status == "complete"),
            "{} {:?}",
            result.logs,
            result.warnings
        );
        assert!(project
            .join(".agents/skills/locked-dependency/SKILL.md")
            .is_file());
    }
    #[test]
    fn invalid_lock_and_changed_lock_are_not_executed() {
        let fixture = TemporaryDirectory::new().unwrap();
        let home = fixture.0.join("home");
        let project = fixture.0.join("project");
        fs::create_dir_all(&home).unwrap();
        fs::create_dir_all(&project).unwrap();
        let engine = engine(&home);
        let t = target(&project);
        assert!(prepare(
            &engine,
            &Target {
                host: "remote".into(),
                ..t.clone()
            }
        )
        .is_err());
        assert!(prepare(&engine, &t).is_err());
        for value in [
            "{",
            "{\"version\":2,\"skills\":{\"x\":{}}}",
            "{\"version\":1,\"skills\":{}}",
        ] {
            fs::write(project.join("skills-lock.json"), value).unwrap();
            assert!(prepare(&engine, &t).is_err());
        }
        source(&project.join("node_modules/pkg"), "locked", "one");
        let output = engine
            .cli(
                &[
                    "experimental_sync".into(),
                    "--copy".into(),
                    "--no-cleanup".into(),
                    "--no-remote".into(),
                    "--yes".into(),
                    "--agent".into(),
                    "codex".into(),
                ],
                &t,
            )
            .unwrap();
        assert!(output.success);
        let plan = prepare(&engine, &t).unwrap().plan;
        let path = project.join("skills-lock.json");
        let original = fs::read(&path).unwrap();
        fs::write(&path, [original.clone(), b"\n".to_vec()].concat()).unwrap();
        assert!(restore(&engine, &plan).is_err());
        assert!(project.join(".agents/skills/locked/SKILL.md").is_file());
        fs::write(&path, original).unwrap();
        let installed = project.join(".agents/skills/locked/SKILL.md");
        let installed_bytes = fs::read(&installed).unwrap();
        let source_file = project.join("node_modules/pkg/SKILL.md");
        let source_bytes = fs::read(&source_file).unwrap();
        fs::write(
            &source_file,
            [source_bytes.clone(), b"\nSource changed\n".to_vec()].concat(),
        )
        .unwrap();
        assert!(restore(&engine, &plan).is_err());
        assert_eq!(fs::read(&installed).unwrap(), installed_bytes);
        fs::write(&source_file, source_bytes).unwrap();
        fs::write(
            &installed,
            [installed_bytes.clone(), b"\nLocal edit\n".to_vec()].concat(),
        )
        .unwrap();
        assert!(restore(&engine, &plan).is_err());
        fs::write(&installed, installed_bytes).unwrap();
        let mut changed = plan.clone();
        changed.items[0].path = home.join("outside").to_string_lossy().into_owned();
        assert!(restore(&engine, &changed).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn partial_actual_state_is_reported_per_skill_even_with_zero_exit() {
        use std::os::unix::fs::PermissionsExt;
        let fixture = TemporaryDirectory::new().unwrap();
        let home = fixture.0.join("home");
        let project = fixture.0.join("project");
        fs::create_dir_all(&home).unwrap();
        fs::create_dir_all(&project).unwrap();
        let mut engine = engine(&home);
        let t = target(&project);
        source(&project.join("node_modules/first"), "first", "one");
        source(&project.join("node_modules/second"), "second", "two");
        let output = engine
            .cli(
                &[
                    "experimental_sync".into(),
                    "--copy".into(),
                    "--no-cleanup".into(),
                    "--no-remote".into(),
                    "--yes".into(),
                    "--agent".into(),
                    "codex".into(),
                ],
                &t,
            )
            .unwrap();
        assert!(output.success);
        fs::remove_dir_all(project.join(".agents/skills")).unwrap();
        let script = fixture.0.join("partial-node");
        fs::write(&script,format!("#!/usr/bin/python3\nimport sys, subprocess, shutil\nr = subprocess.run([{}] + sys.argv[1:])\nif len(sys.argv) > 2 and sys.argv[2] == 'experimental_install':\n    shutil.rmtree({}, ignore_errors=True)\n    sys.exit(0)\nsys.exit(r.returncode)\n",serde_json::to_string(&engine.node.to_string_lossy()).unwrap(),serde_json::to_string(&project.join(".agents/skills/second").to_string_lossy()).unwrap())).unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        engine.node = script;
        let plan = prepare(&engine, &t).unwrap().plan;
        let result = restore(&engine, &plan).unwrap();
        assert_eq!(
            result
                .items
                .iter()
                .find(|i| i.skill == "first")
                .unwrap()
                .status,
            "complete",
            "{} {:?}",
            result.logs,
            result.warnings
        );
        assert_eq!(
            result
                .items
                .iter()
                .find(|i| i.skill == "second")
                .unwrap()
                .status,
            "failed"
        );
        assert_eq!(
            result
                .items
                .iter()
                .find(|i| i.skill == "second")
                .unwrap()
                .after_kind,
            "missing"
        );
    }
    #[cfg(unix)]
    #[test]
    fn zero_exit_without_restore_does_not_report_success() {
        use std::os::unix::fs::PermissionsExt;
        let fixture = TemporaryDirectory::new().unwrap();
        let home = fixture.0.join("home");
        let project = fixture.0.join("project");
        fs::create_dir_all(&home).unwrap();
        fs::create_dir_all(&project).unwrap();
        let mut engine = engine(&home);
        let t = target(&project);
        source(&project.join("node_modules/pkg"), "locked", "one");
        engine
            .cli(
                &[
                    "experimental_sync".into(),
                    "--copy".into(),
                    "--no-cleanup".into(),
                    "--no-remote".into(),
                    "--yes".into(),
                    "--agent".into(),
                    "codex".into(),
                ],
                &t,
            )
            .unwrap();
        fs::remove_dir_all(project.join(".agents/skills/locked")).unwrap();
        let script = fixture.0.join("noop-node");
        let real = engine.node.to_string_lossy().replace('\'', "'\\''");
        fs::write(&script,format!("#!/bin/sh\nif [ \"$2\" = experimental_install ]; then exit 0; fi\nexec '{real}' \"$@\"\n")).unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        engine.node = script;
        let plan = prepare(&engine, &t).unwrap().plan;
        let result = restore(&engine, &plan).unwrap();
        assert_eq!(result.items[0].status, "failed");
        assert!(!result.items[0].content_matches);
        assert_eq!(result.items[0].content_state, "missing");
        assert_eq!(result.items[0].lock_state, "matching");
        engine.node = crate::upstream::tests::engine(&home).node;
        let reviewed = prepare(&engine, &t).unwrap().plan;
        let retried = restore(&engine, &reviewed).unwrap();
        assert_eq!(retried.items[0].status, "complete");
        assert_eq!(retried.items[0].content_state, "matching");
    }
    #[cfg(unix)]
    #[test]
    fn unreadable_restored_content_and_lock_recover_after_permissions_are_fixed() {
        use std::os::unix::fs::PermissionsExt;
        for fault in ["content", "lock"] {
            let fixture = TemporaryDirectory::new().unwrap();
            let home = fixture.0.join("home");
            let project = fixture.0.join("project");
            fs::create_dir_all(&home).unwrap();
            fs::create_dir_all(&project).unwrap();
            let mut e = engine(&home);
            let t = target(&project);
            source(&project.join("node_modules/pkg"), "locked", "one");
            assert!(
                e.cli(
                    &[
                        "experimental_sync".into(),
                        "--copy".into(),
                        "--no-cleanup".into(),
                        "--no-remote".into(),
                        "--yes".into(),
                        "--agent".into(),
                        "codex".into()
                    ],
                    &t
                )
                .unwrap()
                .success
            );
            let file = project.join(".agents/skills/locked/SKILL.md");
            let lock = project.join("skills-lock.json");
            let blocked = if fault == "content" { &file } else { &lock };
            let reviewed = prepare(&e, &t).unwrap().plan;
            let wrapper = fixture.0.join("fault-node");
            fs::write(&wrapper,format!("#!/usr/bin/python3\nimport os,sys,subprocess\nr=subprocess.run([{}]+sys.argv[1:])\nif len(sys.argv)>2 and sys.argv[2]=='experimental_install': os.chmod({},0)\nsys.exit(r.returncode)\n",serde_json::to_string(&e.node.to_string_lossy()).unwrap(),serde_json::to_string(&blocked.to_string_lossy()).unwrap())).unwrap();
            fs::set_permissions(&wrapper, fs::Permissions::from_mode(0o755)).unwrap();
            e.node = wrapper;
            let attempted = restore(&e, &reviewed);
            fs::set_permissions(blocked, fs::Permissions::from_mode(0o600)).unwrap();
            let result = attempted.unwrap();
            assert_ne!(result.items[0].status, "complete");
            if fault == "content" {
                assert_eq!(result.items[0].content_state, "unreadable");
            } else {
                assert_eq!(result.items[0].lock_state, "unreadable");
            }
            e.node = engine(&home).node;
            let reviewed = prepare(&e, &t).unwrap().plan;
            let retried = restore(&e, &reviewed).unwrap();
            assert_eq!(
                retried.items[0].status, "complete",
                "{fault}: {}",
                retried.logs
            );
        }
    }
}
