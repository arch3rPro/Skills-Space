//! Bounded read-only planning around the unmodified experimental_sync command.
use super::restoration::{
    file_hash, folder_name, link_destination, observe, safe_name, RestorePath,
};
use super::*;
use std::collections::{BTreeSet, HashSet};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct SyncOptions {
    pub copy: bool,
    pub recursive: bool,
    pub include: Vec<String>,
    pub exclude: Vec<String>,
    pub cleanup: bool,
    pub remote: bool,
}
impl Default for SyncOptions {
    fn default() -> Self {
        Self {
            copy: true,
            recursive: false,
            include: vec![],
            exclude: vec![],
            cleanup: false,
            remote: false,
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncRemoval {
    skill: String,
    key: Option<String>,
    paths: Vec<RestorePath>,
    retained: Vec<RestorePath>,
    record: serde_json::Value,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DependencyDestination {
    agent: String,
    before: RestorePath,
    root_missing: bool,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DependencyItem {
    skill: String,
    package: String,
    source_path: String,
    source_hash: String,
    action: String,
    replaces_record: bool,
    shared: RestorePath,
    destinations: Vec<DependencyDestination>,
    affected_agents: Vec<String>,
    remote_source: Option<String>,
    via: Option<String>,
    source_type: String,
    reference: Option<String>,
    lock_path: Option<String>,
    changes_shared: bool,
    cached: bool,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DependencyPlan {
    target: Target,
    agents: Vec<String>,
    options: SyncOptions,
    discovery_fingerprint: String,
    removals: Vec<SyncRemoval>,
    lock_hash: Option<String>,
    items: Vec<DependencyItem>,
    observed: Vec<RestorePath>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyOutcome {
    skill: String,
    agent: String,
    path: String,
    status: String,
    action: String,
    after: RestorePath,
    changed: bool,
    content_matches: bool,
    content_state: &'static str,
    relationship_matches: bool,
    lock_matches: bool,
    lock_state: &'static str,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyResult {
    items: Vec<DependencyOutcome>,
    warnings: Vec<String>,
    logs: String,
}
struct Prepared {
    plan: DependencyPlan,
    lock: serde_json::Value,
    expected: BTreeMap<String, Vec<u8>>,
}
fn local_lock(
    engine: &Engine,
    project: &Path,
) -> Result<(Option<String>, serde_json::Value), String> {
    let path = project.join("skills-lock.json");
    match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok((None, serde_json::json!({"version":1,"skills":{}})))
        }
        Err(e) => return Err(e.to_string()),
        Ok(m) if !m.is_file() || m.len() > 1024 * 1024 => {
            return Err("skills-lock.json must be a regular file within 1 MiB.".into())
        }
        _ => {}
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let lock: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|e| format!("Invalid skills-lock.json: {e}"))?;
    if lock["version"] != 1
        || !lock["skills"].is_object()
        || lock["skills"].as_object().is_some_and(|s| s.len() > 200)
    {
        return Err(
            "Dependency installation requires a version 1 lock with at most 200 records.".into(),
        );
    }
    let hash = file_hash(engine, &path)?;
    if fs::read(&path).map_err(|e| e.to_string())? != bytes {
        return Err("Lock changed during inspection.".into());
    }
    Ok((Some(hash), lock))
}
// Refuse linked parent directories that could redirect upstream writes outside the project.
fn real_parents(project: &Path, path: &Path) -> Result<(), String> {
    let relative = path
        .strip_prefix(project)
        .map_err(|_| "Installation path is outside the project.")?;
    let mut current = project.to_path_buf();
    for part in relative.components() {
        if !matches!(part, std::path::Component::Normal(_)) {
            return Err("Unsafe installation path.".into());
        }
        current.push(part);
        match fs::symlink_metadata(&current) {
            Ok(m) if !m.is_dir() || m.is_symlink() => {
                return Err(format!(
                    "Installation parent must be a real directory: {}",
                    current.display()
                ))
            }
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
            _ => {}
        }
    }
    Ok(())
}
#[cfg(test)]
fn prepare(engine: &Engine, target: &Target, selected: &[String]) -> Result<Prepared, String> {
    prepare_options(engine, target, selected, &SyncOptions::default())
}
#[cfg(test)]
fn prepare_options(
    engine: &Engine,
    target: &Target,
    selected: &[String],
    options: &SyncOptions,
) -> Result<Prepared, String> {
    prepare_cached(
        engine,
        target,
        selected,
        options,
        &mut SourceCache::default(),
    )
}
fn prepare_cached(
    engine: &Engine,
    target: &Target,
    selected: &[String],
    options: &SyncOptions,
    cache: &mut SourceCache,
) -> Result<Prepared, String> {
    if options.include.len() + options.exclude.len() > 100
        || options
            .include
            .iter()
            .chain(&options.exclude)
            .any(|p| p.is_empty() || p.len() > 512 || p.chars().any(char::is_control))
    {
        return Err(
            "Use at most 100 nonempty include/exclude patterns within 512 characters.".into(),
        );
    }
    if target.scope != "project" {
        return Err("Select a project to inspect its dependencies.".into());
    }
    let project = target.directory(&engine.home)?;
    let inventory = if selected.is_empty() {
        Inventory {
            version: VERSION.into(),
            agents: engine.agents(target)?,
            skills: vec![],
            warnings: vec![],
            dsh: None,
            codex: None,
            pi: None,
            hermes: None,
        }
    } else {
        engine.inventory(target)?
    };
    let mut agents = selected.to_vec();
    agents.sort();
    agents.dedup();
    if agents.len() != selected.len()
        || agents
            .iter()
            .any(|id| id == "eve" || !inventory.agents.iter().any(|a| &a.id == id))
    {
        return Err("Select valid Agents. Eve's transformed skill format is not supported by this workflow yet.".into());
    }
    real_parents(&project, &project.join(".agents/skills"))?;
    for id in &agents {
        let a = inventory.agents.iter().find(|a| &a.id == id).unwrap();
        real_parents(&project, Path::new(&a.path))?;
    }
    let (lock_hash, lock) = local_lock(engine, &project)?;
    let mut lock_destinations = std::collections::BTreeSet::new();
    if lock["skills"]
        .as_object()
        .unwrap()
        .keys()
        .any(|name| !safe_name(name) || !lock_destinations.insert(folder_name(name)))
    {
        return Err("Ambiguous lock skill destinations prevent a reliable sync plan.".into());
    }

    let mut request = serde_json::to_value(options).map_err(|e| e.to_string())?;
    request["agents"] = serde_json::json!(agents);
    let output = run_process(
        engine
            .command(&engine.node, &project)
            .arg(engine.resources.join("inspect-upstream-dependencies.mjs"))
            .arg(&project)
            .arg(request.to_string()),
    )?;
    if !output.success {
        return Err(format!("Dependency preview failed: {}", output.stderr));
    }
    let discovery: serde_json::Value =
        serde_json::from_str(&output.stdout).map_err(|e| e.to_string())?;
    let discovery_fingerprint = discovery["fingerprint"]
        .as_str()
        .ok_or("Missing dependency fingerprint.")?
        .to_owned();
    let found_values = discovery["skills"]
        .as_array()
        .ok_or("Missing dependency list.")?;
    let docs = engine.documents(
        &found_values
            .iter()
            .filter_map(|s| s["path"].as_str().map(str::to_owned))
            .collect::<Vec<_>>(),
    )?;
    let mut found = Vec::new();
    let mut properties = BTreeMap::new();
    for value in found_values {
        let name = value["name"]
            .as_str()
            .ok_or("Missing skill identity.")?
            .to_owned();
        let path = value["path"]
            .as_str()
            .ok_or("Missing dependency path.")?
            .to_owned();
        let doc = docs
            .get(&path)
            .ok_or("Cannot inspect dependency content.")?;
        if doc.name.as_deref() != Some(&name) || doc.internal {
            return Err("Dependency identity cannot be verified.".into());
        }
        properties.insert(
            name.clone(),
            (
                None,
                value["via"].as_str().map(str::to_owned),
                "node_modules".to_owned(),
                None,
                value["skillPath"].as_str().map(str::to_owned),
            ),
        );
        found.push((
            name,
            value["packageName"]
                .as_str()
                .ok_or("Missing package identity.")?
                .to_owned(),
            PathBuf::from(path),
            doc.hash
                .clone()
                .ok_or("Dependency exceeds verification limits.")?,
        ));
    }
    for request in discovery["remote"].as_array().into_iter().flatten() {
        let parsed: ParsedSource =
            serde_json::from_value(request["parsed"].clone()).map_err(|e| e.to_string())?;
        let location = parsed_git_location(&parsed)?;
        let clone = cache.checkout(engine, &location)?;
        let repo = clone.0.join("repo");
        let root = if let Some(subpath) = &parsed.subpath {
            contained_path(&repo, subpath)?
        } else {
            repo.clone()
        };
        let selected = request["skills"]
            .as_array()
            .ok_or("Invalid remote skill selection.")?;
        let include_internal = !selected.is_empty();
        let output=run_process(engine.command(&engine.node,&project).arg(engine.resources.join("inspect-upstream-dependencies.mjs")).arg(&repo).arg(serde_json::json!({"source":true,"includeInternal":include_internal,"subpath":parsed.subpath,"declarers":request["declarers"],"include":options.include,"exclude":options.exclude}).to_string()))?;
        if !output.success {
            return Err(format!("Remote discovery failed: {}", output.stderr));
        }
        let original: serde_json::Value =
            serde_json::from_str(&output.stdout).map_err(|e| e.to_string())?;
        let original = original["skills"]
            .as_array()
            .ok_or("Missing original source discovery.")?;
        let preview = inspect_with_options(engine, &root.to_string_lossy(), include_internal)?;
        let mut count = 0;
        for skill in preview.skills {
            if !original.iter().any(|o| o["name"] == skill.name) {
                continue;
            }
            if !selected.is_empty()
                && !selected.iter().any(|n| {
                    n.as_str()
                        .is_some_and(|n| n.eq_ignore_ascii_case(&skill.name))
                })
            {
                continue;
            }
            let path = fs::canonicalize(root.join(&skill.path)).map_err(|e| e.to_string())?;
            let repo = fs::canonicalize(&repo).map_err(|e| e.to_string())?;
            let folder = path
                .strip_prefix(&repo)
                .map_err(|_| "Remote skill escaped source.")?
                .to_string_lossy()
                .replace('\\', "/");
            let lock_path = if folder.is_empty() {
                "SKILL.md".into()
            } else {
                format!("{folder}/SKILL.md")
            };
            let url = match &parsed.reference {
                Some(r) => format!("{}#{r}", parsed.url),
                None => parsed.url.clone(),
            };
            properties.insert(
                skill.name.clone(),
                (
                    Some(url),
                    request["via"].as_str().map(str::to_owned),
                    parsed.source_type.clone(),
                    parsed.reference.clone(),
                    Some(lock_path),
                ),
            );
            found.push((
                skill.name,
                request["lockSource"]
                    .as_str()
                    .ok_or("Missing remote source identity.")?
                    .into(),
                path,
                skill.fingerprint.ok_or("Remote content exceeds limits.")?,
            ));
            count += 1;
        }
        if !selected.is_empty() && count != selected.len() {
            return Err(
                "Remote declaration does not identify a complete, unique skill selection.".into(),
            );
        }
    }
    let mut removals = Vec::new();
    for stale in discovery["stale"].as_array().into_iter().flatten() {
        let key = stale["key"].as_str().map(str::to_owned);
        let observe_paths = |field: &str| -> Result<Vec<RestorePath>, String> {
            stale[field]
                .as_array()
                .ok_or("Invalid cleanup list.")?
                .iter()
                .map(|value| {
                    let p = PathBuf::from(value.as_str().ok_or("Invalid cleanup path.")?);
                    real_parents(&project, p.parent().ok_or("Invalid cleanup parent.")?)?;
                    Ok(observe(engine, &p))
                })
                .collect()
        };
        removals.push(SyncRemoval {
            skill: stale["name"]
                .as_str()
                .ok_or("Missing cleanup name.")?
                .into(),
            record: key
                .as_ref()
                .map(|k| lock["skills"][k].clone())
                .unwrap_or(serde_json::Value::Null),
            key,
            paths: observe_paths("remove")?,
            retained: observe_paths("retain")?,
        });
    }
    if found.len() > 200 {
        return Err("Dependency discovery exceeds 200 skills.".into());
    }
    let mut names = HashSet::new();
    let mut folders = HashSet::new();
    let mut items = Vec::new();
    let mut expected = BTreeMap::new();
    let mut observed_paths: BTreeSet<PathBuf> = inventory
        .skills
        .iter()
        .map(|s| PathBuf::from(&s.path))
        .collect();
    let mut scan_paths = observed_paths.clone();
    for name in found.iter().map(|s| s.0.as_str()).chain(
        discovery["cached"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|c| c["name"].as_str()),
    ) {
        scan_paths.insert(project.join(".agents/skills").join(folder_name(name)));
        for agent in &inventory.agents {
            for base in std::iter::once(&agent.path).chain(agent.additional_paths.iter()) {
                scan_paths.insert(Path::new(base).join(folder_name(name)));
            }
        }
    }
    for removal in &removals {
        for path in removal.paths.iter().chain(&removal.retained) {
            scan_paths.insert(PathBuf::from(&path.path));
        }
    }
    let observed_cache = super::restoration::observations(engine, scan_paths);
    let observe_path = |path: &Path| {
        observed_cache
            .get(path.to_string_lossy().as_ref())
            .cloned()
            .unwrap_or_else(|| observe(engine, path))
    };
    for (skill, package, source, hash) in found {
        let folder = folder_name(&skill);
        if !safe_name(&skill)
            || folder.is_empty()
            || !names.insert(skill.clone())
            || !folders.insert(folder.clone())
        {
            return Err("Duplicate, unsafe or colliding dependency skill names prevent reliable installation.".into());
        }
        let (remote_source, via, source_type, reference, lock_path) = properties
            .remove(&skill)
            .ok_or("Missing discovery properties.")?;
        let remote = remote_source.is_some();
        if !remote && !options.copy {
            observed_paths.insert(dunce::canonicalize(&source).map_err(|e| e.to_string())?);
        }
        let signature = source_install_signature(&source)
            .ok_or("Dependency source cannot be fully verified.")?;
        let path = project.join(".agents/skills").join(&folder);
        if source.starts_with(&path) || path.starts_with(&source) {
            return Err("Source overlaps the installation directory.".into());
        }
        let shared = observe_path(&path);
        if shared.kind != "missing"
            && (shared.hash.is_none() && shared.kind != "link"
                || !matches!(shared.kind.as_str(), "directory" | "link"))
        {
            return Err("Existing shared target cannot be safely inspected.".into());
        }
        let entry = &lock["skills"][&skill];
        if !entry.is_null() && entry["sourceType"] != "node_modules" && entry["via"].is_null() {
            return Err("A dependency skill conflicts with an explicitly installed source. Uninstall the existing skill or resolve the duplicate before syncing.".into());
        }
        if !remote && entry.is_null() && shared.kind != "missing" && shared.kind != "link" {
            return Err("A dependency target exists without a sync record. Review or uninstall it before syncing.".into());
        }
        let action = "install";
        let mut affected = BTreeSet::new();
        let mut destinations = Vec::new();
        observed_paths.insert(path.clone());
        let changes_shared = remote
            || !options.copy
            || inventory
                .agents
                .iter()
                .any(|a| agents.contains(&a.id) && Path::new(&a.path).join(&folder) == path);
        for a in &inventory.agents {
            let destination = Path::new(&a.path).join(&folder);
            if changes_shared
                && (destination == path || link_destination(&destination).as_ref() == Some(&path))
            {
                affected.insert(a.id.clone());
            }
            for base in std::iter::once(&a.path).chain(a.additional_paths.iter()) {
                let p = Path::new(base).join(&folder);
                if changes_shared && link_destination(&p).as_ref() == Some(&path) {
                    affected.insert(a.id.clone());
                }
                if fs::symlink_metadata(&p).is_ok() {
                    observed_paths.insert(p);
                }
            }
            if agents.contains(&a.id) {
                affected.insert(a.id.clone());
                let before = observe_path(&destination);
                if before.kind != "missing"
                    && before.hash.is_none()
                    && !(before.kind == "link"
                        && link_destination(&destination).as_ref() == Some(&path))
                {
                    return Err(format!(
                        "Existing Agent target cannot be fully inspected: {}",
                        destination.display()
                    ));
                }
                if entry.is_null() && before.kind == "directory" {
                    return Err("Selected dependency target exists without a sync record. Review or uninstall it first.".into());
                }
                observed_paths.insert(destination.clone());
                let first = Path::new(&a.path)
                    .strip_prefix(&project)
                    .map_err(|e| e.to_string())?
                    .components()
                    .next()
                    .ok_or("Missing Agent root.")?;
                let root_missing = !options.copy
                    && !remote
                    && destination != path
                    && a.id != "claude-code"
                    && !project.join(first.as_os_str()).exists();
                destinations.push(DependencyDestination {
                    agent: a.id.clone(),
                    before,
                    root_missing,
                });
            }
        }
        if changes_shared && !destinations.iter().any(|d| d.before.path == shared.path) {
            destinations.push(DependencyDestination {
                agent: String::new(),
                before: shared.clone(),
                root_missing: false,
            });
        }
        let source_path = remote_source
            .clone()
            .unwrap_or_else(|| source.to_string_lossy().into_owned());
        items.push(DependencyItem {
            remote_source,
            via,
            source_type,
            reference,
            lock_path,
            changes_shared,
            cached: false,
            skill: skill.clone(),
            package: package.clone(),
            source_path,
            source_hash: hash,
            action: action.into(),
            replaces_record: !entry.is_null()
                && (entry["sourceType"] != "node_modules" || entry["source"] != package),
            shared,
            destinations,
            affected_agents: affected.into_iter().collect(),
        });
        expected.insert(skill, signature);
    }
    for cached in discovery["cached"].as_array().into_iter().flatten() {
        let skill = cached["name"]
            .as_str()
            .ok_or("Missing cached skill identity.")?
            .to_owned();
        if !safe_name(&skill)
            || !names.insert(skill.clone())
            || !folders.insert(folder_name(&skill))
        {
            return Err("Duplicate cached skill identity. Inspect again.".into());
        }
        let source = project.join(".agents/skills").join(folder_name(&skill));
        let source_path = source.to_string_lossy().into_owned();
        let signature = source_install_signature(&source)
            .ok_or("Cached skill cannot be read. Inspect again.")?;
        let docs = engine.documents(std::slice::from_ref(&source_path))?;
        let doc = docs
            .get(&source_path)
            .ok_or("Cached skill cannot be read.")?;
        let hash = doc.hash.clone().ok_or("Cached skill cannot be read.")?;
        let entry = &lock["skills"][&skill];
        let mut destinations = Vec::new();
        let mut affected_agents = Vec::new();
        for id in cached["agents"]
            .as_array()
            .ok_or("Missing cached skill targets.")?
        {
            let id = id.as_str().ok_or("Invalid cached skill target.")?;
            let agent = inventory
                .agents
                .iter()
                .find(|a| a.id == id && agents.contains(&a.id))
                .ok_or("Cached target changed. Inspect again.")?;
            let path = Path::new(&agent.path).join(folder_name(&skill));
            real_parents(&project, path.parent().ok_or("Invalid cached target.")?)?;
            let before = observe_path(&path);
            observed_paths.insert(path);
            destinations.push(DependencyDestination {
                agent: id.into(),
                before,
                root_missing: false,
            });
            affected_agents.push(id.into());
        }
        observed_paths.insert(source.clone());
        items.push(DependencyItem {
            skill: skill.clone(),
            package: entry["source"]
                .as_str()
                .ok_or("Cached source record missing.")?
                .into(),
            source_path,
            source_hash: hash,
            action: "install".into(),
            replaces_record: false,
            shared: observe_path(&source),
            destinations,
            affected_agents,
            remote_source: None,
            via: entry["via"].as_str().map(str::to_owned),
            source_type: entry["sourceType"]
                .as_str()
                .ok_or("Cached source type missing.")?
                .into(),
            reference: entry["ref"].as_str().map(str::to_owned),
            lock_path: entry["skillPath"].as_str().map(str::to_owned),
            changes_shared: false,
            cached: true,
        });
        expected.insert(skill, signature);
    }
    for removal in &removals {
        for path in removal.paths.iter().chain(&removal.retained) {
            observed_paths.insert(PathBuf::from(&path.path));
        }
    }
    let observed = observed_paths.iter().map(|p| observe_path(p)).collect();
    if local_lock(engine, &project)?.0 != lock_hash {
        return Err("Lock changed while inspecting dependencies.".into());
    }
    Ok(Prepared {
        plan: DependencyPlan {
            target: target.clone(),
            agents,
            options: options.clone(),
            discovery_fingerprint,
            removals,
            lock_hash,
            items,
            observed,
        },
        lock,
        expected,
    })
}
fn install(engine: &Engine, confirmed: &DependencyPlan) -> Result<DependencyResult, String> {
    let _guard = MUTATION
        .try_lock()
        .map_err(|_| "Another skill operation is running.")?;
    if confirmed.agents.is_empty() {
        return Err("Select at least one Agent before installing.".into());
    }
    let prepared =
        project_sources::with(engine, &confirmed.target, "dependencies", true, |cache| {
            prepare_cached(
                engine,
                &confirmed.target,
                &confirmed.agents,
                &confirmed.options,
                cache,
            )
        })?;
    if prepared.plan != *confirmed {
        return Err("Dependencies, lock, Agent roots or installations changed. Inspect and confirm a fresh plan.".into());
    }
    if confirmed.items.is_empty() && confirmed.removals.is_empty() {
        return Err(
            "No dependency skills were found. Install project dependencies and inspect again."
                .into(),
        );
    }
    let mut args = vec!["experimental_sync".into(), "--yes".into()];
    if confirmed.options.copy {
        args.push("--copy".into());
    }
    if !confirmed.options.cleanup {
        args.push("--no-cleanup".into());
    }
    if !confirmed.options.remote {
        args.push("--no-remote".into());
    }
    if confirmed.options.recursive {
        args.push("--recursive".into());
    }
    if !confirmed.options.include.is_empty() {
        args.push("--include".into());
        args.extend(confirmed.options.include.clone());
    }
    if !confirmed.options.exclude.is_empty() {
        args.push("--exclude".into());
        args.extend(confirmed.options.exclude.clone());
    }
    args.push("--agent".into());
    args.extend(confirmed.agents.clone());
    let (success, logs) = match engine.cli(&args, &confirmed.target) {
        Ok(o) => (o.success, format!("{}\n{}", o.stdout, o.stderr)),
        Err(e) => (false, e),
    };
    let mut warnings = Vec::new();
    if !success {
        warnings.push(
            "Execution failed or timed out; actual results follow. No automatic retry or rollback."
                .into(),
        );
    }
    let inventory = engine.inventory(&confirmed.target).ok();
    if inventory.is_none() {
        warnings.push("Current inventory could not be refreshed.".into());
    }
    let after_lock = engine.lock(&confirmed.target).ok();
    let changing: BTreeSet<_> = confirmed
        .items
        .iter()
        .filter(|i| i.action == "install")
        .flat_map(|i| i.destinations.iter().map(|d| PathBuf::from(&d.before.path)))
        .chain(
            confirmed
                .removals
                .iter()
                .flat_map(|r| r.paths.iter().map(|p| PathBuf::from(&p.path))),
        )
        .collect();
    for before in &confirmed.observed {
        if changing.contains(Path::new(&before.path)) {
            continue;
        }
        let after = observe(engine, Path::new(&before.path));
        let affected_link = before.kind == "link"
            && after.kind == "link"
            && before.link_target == after.link_target
            && link_destination(Path::new(&before.path))
                .is_some_and(|p| changing.contains(p.as_path()));
        if !affected_link && (after != *before || before.kind != "missing" && before.hash.is_none())
        {
            warnings.push(format!(
                "Unselected installation changed or could not be verified: {}",
                before.path
            ));
        }
    }
    if let Some(current) = inventory {
        for skill in current.skills {
            // Native inventories may discover nested documents inside a reviewed bundle.
            // Each changed destination is still verified against the complete source tree below.
            if !changing
                .iter()
                .any(|root| Path::new(&skill.path).starts_with(root))
                && !confirmed
                    .observed
                    .iter()
                    .any(|p| Path::new(&p.path) == Path::new(&skill.path))
            {
                warnings.push(format!(
                    "Additional installation outside the plan: {}",
                    skill.path
                ));
            }
        }
    }
    let planned: BTreeSet<_> = confirmed
        .items
        .iter()
        .filter(|i| i.action == "install")
        .map(|i| i.skill.as_str())
        .chain(confirmed.removals.iter().filter_map(|r| r.key.as_deref()))
        .collect();
    let old = prepared.lock["skills"].as_object().unwrap();
    if let Some(new) = after_lock.as_ref().and_then(|l| l["skills"].as_object()) {
        if old
            .iter()
            .any(|(n, e)| !planned.contains(n.as_str()) && new.get(n) != Some(e))
            || new
                .keys()
                .any(|n| !planned.contains(n.as_str()) && !old.contains_key(n))
        {
            warnings.push("Unplanned lock records changed.".into());
        }
    } else {
        warnings.push("Lock records could not be verified.".into());
    }
    for item in confirmed.items.iter().filter(|i| i.remote_source.is_none()) {
        let current = engine
            .documents(std::slice::from_ref(&item.source_path))
            .ok();
        if current
            .as_ref()
            .and_then(|m| m.get(&item.source_path))
            .and_then(|d| d.hash.as_deref())
            != Some(item.source_hash.as_str())
        {
            warnings.push(format!(
                "Dependency source changed or could not be rechecked: {}",
                item.source_path
            ));
        }
    }
    let integrity = warnings.iter().all(|w| w.starts_with("Execution failed"));
    let mut items = Vec::new();
    for item in &confirmed.items {
        let lock_matches = after_lock.as_ref().is_some_and(|l| {
            if item.cached {
                return l["skills"][&item.skill] == prepared.lock["skills"][&item.skill];
            }
            l["skills"][&item.skill]["sourceType"] == item.source_type
                && l["skills"][&item.skill]["source"] == item.package
                && l["skills"][&item.skill]["computedHash"].as_str() == Some(&item.source_hash)
                && l["skills"][&item.skill]["via"].as_str() == item.via.as_deref()
                && l["skills"][&item.skill]["ref"].as_str() == item.reference.as_deref()
                && l["skills"][&item.skill]["skillPath"].as_str() == item.lock_path.as_deref()
        });
        let lock_state = if lock_matches {
            "matching"
        } else if after_lock.is_none() {
            "unreadable"
        } else if after_lock
            .as_ref()
            .is_some_and(|l| l["skills"][&item.skill].is_null())
        {
            "missing"
        } else {
            "different"
        };
        let destinations = &item.destinations;
        for d in destinations {
            let path = Path::new(&d.before.path);
            let after = observe(engine, path);
            let signature = tree_signature(path);
            let reference = prepared.expected.get(&item.skill);
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
            let canonical = path == Path::new(&item.shared.path);
            let relationship_matches = if item.cached {
                after.kind == "link"
                    && link_destination(path).as_ref() == Some(&PathBuf::from(&item.shared.path))
            } else if item.remote_source.is_some() {
                if canonical {
                    after.kind == "directory"
                } else {
                    after.kind == "directory"
                        || after.kind == "link"
                            && link_destination(path).as_ref()
                                == Some(&PathBuf::from(&item.shared.path))
                }
            } else if confirmed.options.copy {
                after.kind == "directory"
            } else {
                after.kind == "directory"
                    || after.kind == "link"
                        && link_destination(path).as_ref()
                            == Some(&PathBuf::from(if canonical {
                                &item.source_path
                            } else {
                                &item.shared.path
                            }))
            };
            let status = if content_matches && relationship_matches && lock_matches && integrity {
                "complete"
            } else if after.kind == "missing" || after.hash.is_some() && !content_matches {
                "failed"
            } else {
                "uncertain"
            };
            items.push(DependencyOutcome {
                skill: item.skill.clone(),
                agent: d.agent.clone(),
                path: d.before.path.clone(),
                status: status.into(),
                action: item.action.clone(),
                changed: after != d.before,
                after,
                content_matches,
                content_state,
                relationship_matches,
                lock_matches,
                lock_state,
            });
        }
    }
    for removal in &confirmed.removals {
        let lock_matches = after_lock.as_ref().is_some_and(|l| {
            removal
                .key
                .as_ref()
                .is_none_or(|k| l["skills"][k].is_null())
        });
        let lock_state = if lock_matches {
            "matching"
        } else if after_lock.is_none() {
            "unreadable"
        } else {
            "different"
        };
        let retained = removal
            .retained
            .iter()
            .all(|p| observe(engine, Path::new(&p.path)) == *p);
        for before in &removal.paths {
            let after = observe(engine, Path::new(&before.path));
            let gone = after.kind == "missing";
            items.push(DependencyOutcome {
                skill: removal.skill.clone(),
                agent: String::new(),
                path: before.path.clone(),
                status: if success && gone && lock_matches && retained && integrity {
                    "complete"
                } else if !gone {
                    "failed"
                } else {
                    "uncertain"
                }
                .into(),
                action: "remove".into(),
                changed: after != *before,
                content_matches: gone,
                content_state: if gone {
                    "matching"
                } else if after.kind == "unknown" {
                    "unreadable"
                } else {
                    "retained"
                },
                relationship_matches: gone,
                lock_matches,
                lock_state,
                after,
            });
        }
        if removal.paths.is_empty() {
            items.push(DependencyOutcome {
                skill: removal.skill.clone(),
                agent: String::new(),
                path: String::new(),
                status: if success && lock_matches && retained && integrity {
                    "complete"
                } else {
                    "uncertain"
                }
                .into(),
                action: "remove".into(),
                changed: lock_matches && removal.key.is_some(),
                content_matches: true,
                content_state: "matching",
                relationship_matches: true,
                lock_matches,
                lock_state,
                after: RestorePath {
                    path: String::new(),
                    kind: "missing".into(),
                    hash: None,
                    link_target: None,
                },
            });
        }
    }
    Ok(DependencyResult {
        items,
        warnings,
        logs,
    })
}
#[tauri::command]
pub async fn upstream_dependency_plan(
    app: AppHandle,
    webview: tauri::Webview,
    target: Target,
    agents: Vec<String>,
    options: Option<SyncOptions>,
    refresh: Option<bool>,
    on_progress: Option<JavaScriptChannelId>,
) -> Result<DependencyPlan, String> {
    let progress = on_progress.map(|id| id.channel_on(webview));
    tauri::async_runtime::spawn_blocking(move || {
        let mut engine = Engine::from_app(&app)?;
        engine.progress = progress;
        engine.report_installation("checking", 0, 0);
        project_sources::with(
            &engine,
            &target,
            "dependencies",
            refresh.unwrap_or(true),
            |cache| {
                Ok(prepare_cached(
                    &engine,
                    &target,
                    &agents,
                    &options.unwrap_or_default(),
                    cache,
                )?
                .plan)
            },
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_dependency_install(
    app: AppHandle,
    plan: DependencyPlan,
) -> Result<DependencyResult, String> {
    tauri::async_runtime::spawn_blocking(move || install(&Engine::from_app(&app)?, &plan))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::tests::engine;
    fn fixture() -> (TemporaryDirectory, Engine, Target) {
        let f = TemporaryDirectory::new().unwrap();
        let home = f.0.join("home");
        let project = f.0.join("project");
        fs::create_dir_all(home.join(".codex")).unwrap();
        fs::create_dir_all(&project).unwrap();
        let e = engine(&home);
        let t = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into_owned()),
        };
        (f, e, t)
    }
    fn skill(path: &Path, name: &str, body: &str) {
        crate::upstream::tests::declare_dependency(path);
        fs::create_dir_all(path).unwrap();
        fs::write(
            path.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: Dependency fixture\n---\n{body}\n"),
        )
        .unwrap();
    }
    fn ids(values: &[&str]) -> Vec<String> {
        values.iter().map(|s| (*s).into()).collect()
    }
    #[test]
    fn real_sync_discovers_scoped_packages_root_precedence_and_preserves_unselected_copy() {
        let (_f, e, t) = fixture();
        let p = t.directory(&e.home).unwrap();
        skill(&p.join("node_modules/root"), "root-skill", "one");
        skill(
            &p.join("node_modules/root/skills/hidden-child"),
            "hidden-child",
            "root wins",
        );
        skill(
            &p.join("node_modules/@scope/pkg/skills/nested"),
            "nested",
            "two",
        );
        skill(
            &p.join(".hermes/skills/root-skill"),
            "root-skill",
            "independent copy",
        );
        let copy = fs::read(p.join(".hermes/skills/root-skill/SKILL.md")).unwrap();
        let plan = prepare(&e, &t, &ids(&["codex", "claude-code"]))
            .unwrap()
            .plan;
        assert_eq!(plan.items.len(), 2);
        assert!(plan.lock_hash.is_none());
        assert!(!p.join(".agents").exists());
        let result = install(&e, &plan).unwrap();
        assert!(
            result.items.iter().all(|r| r.status == "complete"),
            "{} {:?}",
            result.logs,
            result.warnings
        );
        assert!(result.warnings.is_empty(), "{:?}", result.warnings);
        assert!(p
            .join(".agents/skills/root-skill/skills/hidden-child/SKILL.md")
            .is_file());
        assert!(result
            .items
            .iter()
            .any(|r| r.agent == "claude-code" && r.after.kind == "directory"));
        assert_eq!(
            fs::read(p.join(".hermes/skills/root-skill/SKILL.md")).unwrap(),
            copy
        );
        assert!(!e.home.join(".agents/skills").exists());
        assert_eq!(
            e.lock(&t).unwrap()["skills"]["nested"]["source"],
            "@scope/pkg"
        );
    }
    #[test]
    fn real_sync_repairs_missing_agent_targets_without_retired_force_flag() {
        let (_f, e, t) = fixture();
        let p = t.directory(&e.home).unwrap();
        skill(&p.join("node_modules/pkg"), "dependency", "one");
        let plan = prepare(&e, &t, &ids(&["codex"])).unwrap().plan;
        let result = install(&e, &plan).unwrap();
        assert!(
            result.items.iter().all(|r| r.status == "complete"),
            "items: {}; warnings: {:?}",
            serde_json::to_string(&result.items).unwrap(),
            result.warnings
        );
        let plan = prepare(&e, &t, &ids(&["claude-code", "hermes-agent"]))
            .unwrap()
            .plan;
        assert_eq!(plan.items[0].action, "install");
        let result = install(&e, &plan).unwrap();
        assert!(
            result.items.iter().all(|r| r.status == "complete"),
            "items: {}; warnings: {:?}",
            serde_json::to_string(&result.items).unwrap(),
            result.warnings
        );
        let plan = prepare(&e, &t, &ids(&["claude-code", "hermes-agent"]))
            .unwrap()
            .plan;
        assert!(
            !plan.items[0]
                .destinations
                .iter()
                .find(|d| d.agent == "hermes-agent")
                .unwrap()
                .root_missing
        );
        let result = install(&e, &plan).unwrap();
        assert_eq!(
            result
                .items
                .iter()
                .find(|r| r.agent == "claude-code")
                .unwrap()
                .status,
            "complete"
        );
        assert_eq!(
            result
                .items
                .iter()
                .find(|r| r.agent == "hermes-agent")
                .unwrap()
                .status,
            "complete"
        );
        skill(&p.join("node_modules/pkg"), "dependency", "changed");
        assert!(install(&e, &plan).is_err());
        let plan = prepare(&e, &t, &ids(&["hermes-agent"])).unwrap().plan;
        let result = install(&e, &plan).unwrap();
        assert!(
            result.items.iter().all(|r| r.status == "complete"),
            "items: {}; warnings: {:?}",
            serde_json::to_string(&result.items).unwrap(),
            result.warnings
        );
    }
    #[test]
    fn explicit_source_conflicts_block_sync_and_preserve_copies_and_locks() {
        let (_f, e, t) = fixture();
        let p = t.directory(&e.home).unwrap();
        skill(&p.join("node_modules/pkg"), "dependency", "new dependency");
        skill(
            &p.join(".claude/skills/dependency"),
            "dependency",
            "old copy",
        );
        fs::write(p.join("skills-lock.json"), serde_json::to_vec(&serde_json::json!({"version":1,"skills":{"dependency":{"source":"owner/repo","sourceType":"github","computedHash":"old"},"other":{"source":"local","sourceType":"local","computedHash":"keep"}}})).unwrap()).unwrap();
        let before = fs::read(p.join("skills-lock.json")).unwrap();
        let copy = fs::read(p.join(".claude/skills/dependency/SKILL.md")).unwrap();
        assert!(prepare(&e, &t, &ids(&["claude-code"])).is_err());
        assert_eq!(fs::read(p.join("skills-lock.json")).unwrap(), before);
        assert_eq!(
            fs::read(p.join(".claude/skills/dependency/SKILL.md")).unwrap(),
            copy
        );
    }
    #[test]
    fn real_dependency_install_preserves_eve_documents_without_name_frontmatter() {
        let (_f, e, t) = fixture();
        let p = t.directory(&e.home).unwrap();
        let eve = p.join("agent/subagents/alpha/skills/manual-eve");
        fs::create_dir_all(&eve).unwrap();
        let content = "---\ndescription: Eve document without name\n---\n# Keep\n";
        fs::write(eve.join("SKILL.md"), content).unwrap();
        skill(&p.join("node_modules/pkg"), "dependency", "one");
        let plan = prepare(&e, &t, &ids(&["codex"])).unwrap().plan;
        assert!(plan
            .observed
            .iter()
            .find(|o| Path::new(&o.path) == eve)
            .unwrap()
            .hash
            .is_some());
        let result = install(&e, &plan).unwrap();
        assert!(
            result.items.iter().all(|r| r.status == "complete"),
            "{} {:?}",
            result.logs,
            result.warnings
        );
        assert_eq!(fs::read_to_string(eve.join("SKILL.md")).unwrap(), content);
    }
    #[test]
    fn pinned174_direct_optional_peer_npm_declarations_and_no_unreviewed_cleanup() {
        let (_f, e, t) = fixture();
        let p = t.directory(&e.home).unwrap();
        for (package, name, subpath) in [
            ("direct", "direct-skill", ""),
            ("optional", "optional-skill", "dist/skills/optional"),
            ("peer", "peer-skill", "skills/peer"),
            ("declared", "declared-skill", ""),
            ("undeclared", "unselected-skill", ""),
        ] {
            skill(
                &p.join("node_modules").join(package).join(subpath),
                name,
                "source",
            );
        }
        fs::write(p.join("package.json"),r#"{"dependencies":{"direct":"1"},"optionalDependencies":{"optional":"1"},"peerDependencies":{"peer":"1"},"skills":["npm:declared","fixture-owner/remote-fixture"]}"#).unwrap();
        skill(&p.join(".agents/skills/stale"), "stale", "keep");
        fs::write(p.join("skills-lock.json"),r#"{"version":1,"skills":{"stale":{"source":"gone","sourceType":"node_modules","computedHash":"old"}}}"#).unwrap();
        let stale = fs::read(p.join(".agents/skills/stale/SKILL.md")).unwrap();
        let plan = prepare(&e, &t, &ids(&["codex"])).unwrap().plan;
        assert_eq!(plan.items.len(), 4);
        assert!(!plan.items.iter().any(|i| i.skill == "unselected-skill"));
        let result = install(&e, &plan).unwrap();
        assert!(
            result.items.iter().all(|i| i.status == "complete"),
            "{} {:?}",
            result.logs,
            result.warnings
        );
        assert_eq!(
            fs::read(p.join(".agents/skills/stale/SKILL.md")).unwrap(),
            stale
        );
        assert_eq!(
            e.lock(&t).unwrap()["skills"]["stale"]["computedHash"],
            "old"
        );
        assert_eq!(e.lock(&t).unwrap()["skills"].as_object().unwrap().len(), 5);
        assert!(!p.join(".agents/skills/unselected-skill").exists());
    }
    #[test]
    fn stale_source_lock_target_and_invalid_inputs_are_rejected() {
        let (_f, e, t) = fixture();
        let p = t.directory(&e.home).unwrap();
        let discovery = prepare(&e, &t, &[]).unwrap().plan;
        assert!(discovery.agents.is_empty());
        assert!(install(&e, &discovery).is_err());
        assert!(prepare(&e, &t, &ids(&["eve"])).is_err());
        let empty = prepare(&e, &t, &ids(&["codex"])).unwrap().plan;
        assert!(empty.items.is_empty());
        assert!(install(&e, &empty).is_err());
        let source = p.join("node_modules/pkg");
        skill(&source, "dependency", "one");
        let plan = prepare(&e, &t, &ids(&["codex"])).unwrap().plan;
        skill(&source, "dependency", "changed");
        assert!(install(&e, &plan).is_err());
        let plan = prepare(&e, &t, &ids(&["codex"])).unwrap().plan;
        fs::write(p.join("skills-lock.json"), "{\"version\":1,\"skills\":{}}").unwrap();
        assert!(install(&e, &plan).is_err());
        let plan = prepare(&e, &t, &ids(&["codex"])).unwrap().plan;
        skill(&p.join(".agents/skills/dependency"), "dependency", "manual");
        assert!(install(&e, &plan).is_err());
        skill(&p.join("node_modules/duplicate"), "dependency", "duplicate");
        assert!(prepare(&e, &t, &ids(&["codex"])).is_err());
        fs::remove_dir_all(p.join("node_modules/duplicate")).unwrap();
        for value in ["{", "{\"version\":2,\"skills\":{}}"] {
            fs::write(p.join("skills-lock.json"), value).unwrap();
            assert!(prepare(&e, &t, &ids(&["codex"])).is_err());
        }
    }
    #[cfg(unix)]
    #[test]
    fn pnpm_links_are_discovered_and_linked_installation_parents_are_blocked() {
        use std::os::unix::fs::symlink;
        let (f, e, t) = fixture();
        let p = t.directory(&e.home).unwrap();
        let package = f.0.join("store/package");
        skill(&package, "dependency", "one");
        fs::create_dir_all(p.join("node_modules")).unwrap();
        fs::write(
            package.join("package.json"),
            r#"{"name":"pkg","version":"1.0.0"}"#,
        )
        .unwrap();
        fs::write(
            p.join("package.json"),
            r#"{"dependencies":{"pkg":"1.0.0"}}"#,
        )
        .unwrap();
        symlink(&package, p.join("node_modules/pkg")).unwrap();
        let plan = prepare(&e, &t, &ids(&["claude-code"])).unwrap().plan;
        assert_eq!(plan.items.len(), 1);
        symlink(&e.home, p.join(".claude")).unwrap();
        assert!(install(&e, &plan).is_err());
        fs::remove_file(p.join(".claude")).unwrap();
        symlink(&e.home, p.join(".agents")).unwrap();
        assert!(prepare(&e, &t, &ids(&["codex"])).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn zero_exit_without_changes_and_partial_actual_results_are_not_success() {
        use std::os::unix::fs::PermissionsExt;
        let (f, mut e, t) = fixture();
        let p = t.directory(&e.home).unwrap();
        skill(&p.join("node_modules/pkg"), "dependency", "one");
        let real = e.node.clone();
        let script = f.0.join("noop-node");
        fs::write(
            &script,
            format!(
                "#!/bin/sh\nif [ \"$2\" = experimental_sync ]; then exit 0; fi\nexec '{}' \"$@\"\n",
                real.to_string_lossy().replace('\'', "'\\''")
            ),
        )
        .unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        e.node = script;
        let plan = prepare(&e, &t, &ids(&["codex"])).unwrap().plan;
        let result = install(&e, &plan).unwrap();
        assert!(result.items.iter().all(|r| r.status == "failed"));
        e.node = real;
        let plan = prepare(&e, &t, &ids(&["codex", "hermes-agent"]))
            .unwrap()
            .plan;
        let result = install(&e, &plan).unwrap();
        assert_eq!(
            result
                .items
                .iter()
                .find(|r| r.agent == "codex")
                .unwrap()
                .status,
            "complete"
        );
        assert_eq!(
            result
                .items
                .iter()
                .find(|r| r.agent == "hermes-agent")
                .unwrap()
                .status,
            "complete"
        );
    }
    #[test]
    fn recursive_filters_link_to_dependencies_and_cleanup_lists_unselected_agent_paths() {
        let (_f, e, t) = fixture();
        let p = t.directory(&e.home).unwrap();
        skill(&p.join("node_modules/root"), "root-skill", "keep");
        skill(&p.join("node_modules/child/skills/yes"), "yes", "workspace");
        skill(&p.join("node_modules/child/skills/no"), "no", "excluded");
        fs::create_dir_all(p.join("packages/a")).unwrap();
        fs::write(
            p.join("packages/a/package.json"),
            r#"{"name":"workspace-a","dependencies":{"child":"1"}}"#,
        )
        .unwrap();
        fs::write(
            p.join("package.json"),
            r#"{"dependencies":{"root":"1"},"workspaces":["packages/*"]}"#,
        )
        .unwrap();
        let options = SyncOptions {
            copy: false,
            recursive: true,
            include: vec!["child#*".into()],
            exclude: vec!["child#no".into()],
            ..Default::default()
        };
        let plan = prepare_options(&e, &t, &ids(&["codex", "claude-code"]), &options)
            .unwrap()
            .plan;
        assert_eq!(plan.items.len(), 1);
        assert_eq!(plan.items[0].skill, "yes");
        let result = install(&e, &plan).unwrap();
        assert!(
            result.items.iter().all(|i| i.status == "complete"),
            "{} {:?}",
            result.logs,
            result.warnings
        );
        assert!(p.join(".agents/skills/yes").is_symlink());
        assert!(!p.join(".agents/skills/no").exists());
        skill(
            &p.join(".hermes/skills/yes"),
            "yes",
            "copy affected by cleanup",
        );
        fs::write(
            p.join("packages/a/package.json"),
            r#"{"name":"workspace-a"}"#,
        )
        .unwrap();
        let cleanup = SyncOptions {
            cleanup: true,
            ..options
        };
        let plan = prepare_options(&e, &t, &ids(&["codex"]), &cleanup)
            .unwrap()
            .plan;
        assert!(plan.items.is_empty());
        assert_eq!(plan.removals.len(), 1);
        assert!(plan.removals[0]
            .paths
            .iter()
            .any(|p| p.path.contains(".hermes")));
        let result = install(&e, &plan).unwrap();
        assert!(
            result.items.iter().all(|i| i.status == "complete"),
            "{} {:?}",
            result.logs,
            result.warnings
        );
        assert!(!p.join(".agents/skills/yes").exists());
        assert!(!p.join(".hermes/skills/yes").exists());
        assert!(p.join("node_modules/child/skills/yes/SKILL.md").exists());
    }
    #[test]
    fn declared_git_sources_install_via_original_sync_and_cleanup_rechecks_declarations() {
        let (f, e, t) = fixture();
        let p = t.directory(&e.home).unwrap();
        let repo = f.0.join("remote.git");
        skill(&repo, "remote-skill", "remote");
        for args in [
            vec!["init", "-q", "-b", "main"],
            vec!["add", "."],
            vec![
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "commit",
                "-qm",
                "fixture",
            ],
        ] {
            assert!(
                run_process(e.command(Path::new("git"), &repo).args(args))
                    .unwrap()
                    .success
            );
        }
        let url = reqwest::Url::from_file_path(&repo).unwrap().to_string();
        fs::write(p.join("package.json"),serde_json::to_vec(&serde_json::json!({"skills":[{"source":url,"skills":["remote-skill"],"ref":"main"}]})).unwrap()).unwrap();
        let options = SyncOptions {
            remote: true,
            ..Default::default()
        };
        let plan = prepare_options(&e, &t, &ids(&["hermes-agent"]), &options)
            .unwrap()
            .plan;
        assert_eq!(plan.items.len(), 1);
        assert!(plan.items[0].remote_source.is_some());
        let result = install(&e, &plan).unwrap();
        assert!(
            result.items.iter().all(|i| i.status == "complete"),
            "{} {:?}",
            result.logs,
            result.warnings
        );
        assert!(p.join(".hermes/skills/remote-skill").is_symlink());
        assert_eq!(e.lock(&t).unwrap()["skills"]["remote-skill"]["via"], ".");
        let satisfied = prepare_options(&e, &t, &ids(&["hermes-agent"]), &options)
            .unwrap()
            .plan;
        assert!(satisfied.items.is_empty());
        fs::write(p.join("package.json"), r#"{"skills":[]}"#).unwrap();
        let cleanup = SyncOptions {
            cleanup: true,
            ..options
        };
        let plan = prepare_options(&e, &t, &ids(&["codex"]), &cleanup)
            .unwrap()
            .plan;
        assert_eq!(plan.removals.len(), 1);
        fs::write(p.join("package.json"), r#"{"skills":[],"name":"changed"}"#).unwrap();
        assert!(install(&e, &plan).is_err());
        let plan = prepare_options(&e, &t, &ids(&["codex"]), &cleanup)
            .unwrap()
            .plan;
        let result = install(&e, &plan).unwrap();
        assert!(
            result.items.iter().all(|i| i.status == "complete"),
            "{} {:?}",
            result.logs,
            result.warnings
        );
        assert!(e.lock(&t).unwrap()["skills"]["remote-skill"].is_null());
        assert!(repo.join("SKILL.md").is_file());
    }
    #[test]
    fn malformed_or_secret_declarations_block_cleanup_without_leaking_credentials() {
        let (_f, e, t) = fixture();
        let p = t.directory(&e.home).unwrap();
        skill(&p.join("node_modules/pkg"), "keep", "source");
        let first = prepare(&e, &t, &ids(&["codex"])).unwrap().plan;
        assert!(install(&e, &first)
            .unwrap()
            .items
            .iter()
            .all(|i| i.status == "complete"));
        let before = fs::read(p.join("skills-lock.json")).unwrap();
        for content in [
            "{",
            r#"{"skills":["https://name:private-secret@example.invalid/repo.git"]}"#,
        ] {
            fs::write(p.join("package.json"), content).unwrap();
            let error = prepare_options(
                &e,
                &t,
                &ids(&["codex"]),
                &SyncOptions {
                    cleanup: true,
                    remote: true,
                    ..Default::default()
                },
            )
            .err()
            .unwrap();
            assert!(!error.contains("private-secret"));
            assert_eq!(fs::read(p.join("skills-lock.json")).unwrap(), before);
            assert!(p.join(".agents/skills/keep/SKILL.md").is_file());
        }
    }
    fn remote_repo(root: &Path, names: &[&str]) -> String {
        for name in names {
            skill(&root.join("skills").join(name), name, "remote fixture");
        }
        for args in [
            vec!["init", "-q", "-b", "main"],
            vec!["add", "."],
            vec![
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "commit",
                "-qm",
                "fixture",
            ],
        ] {
            assert!(std::process::Command::new("git")
                .current_dir(root)
                .args(args)
                .status()
                .unwrap()
                .success());
        }
        reqwest::Url::from_file_path(root).unwrap().to_string()
    }
    #[test]
    fn discovery_precedes_agents_reuses_checkout_and_rechecks_moving_source() {
        let (f, e, t) = fixture();
        let project = t.directory(&e.home).unwrap();
        let repo = f.0.join("flow-source");
        let url = remote_repo(&repo, &["flow-skill"]);
        fs::write(
            project.join("package.json"),
            serde_json::json!({"skills":[url]}).to_string(),
        )
        .unwrap();
        let options = SyncOptions {
            remote: true,
            ..Default::default()
        };
        let mut cache = SourceCache::default();
        let discovery = prepare_cached(&e, &t, &[], &options, &mut cache)
            .unwrap()
            .plan;
        assert!(discovery.agents.is_empty());
        assert_eq!(discovery.items.len(), 1);
        assert!(install(&e, &discovery).is_err());
        let checkout = cache
            .checkouts
            .values()
            .next()
            .unwrap()
            .as_ref()
            .unwrap()
            .0
            .clone();
        let hidden = f.0.join("temporarily-unavailable");
        fs::rename(&repo, &hidden).unwrap();
        let selected = prepare_cached(&e, &t, &ids(&["claude-code"]), &options, &mut cache)
            .unwrap()
            .plan;
        assert_eq!(
            selected.items[0].source_hash,
            discovery.items[0].source_hash
        );
        assert_eq!(cache.checkouts.len(), 1);
        assert_eq!(
            cache.checkouts.values().next().unwrap().as_ref().unwrap().0,
            checkout
        );
        fs::rename(hidden, &repo).unwrap();
        fs::write(repo.join("skills/flow-skill/note.txt"), "new version").unwrap();
        for args in [
            vec!["add", "."],
            vec![
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "commit",
                "-qm",
                "change",
            ],
        ] {
            assert!(std::process::Command::new("git")
                .current_dir(&repo)
                .args(args)
                .status()
                .unwrap()
                .success());
        }
        cache.refresh = true;
        cache.checked.clear();
        let changed = prepare_cached(&e, &t, &ids(&["claude-code"]), &options, &mut cache)
            .unwrap()
            .plan;
        assert_ne!(changed.items[0].source_hash, selected.items[0].source_hash);
        assert_eq!(
            cache.checkouts.values().next().unwrap().as_ref().unwrap().0,
            checkout
        );
        // A confirmed old source cannot execute; the existing recheck path produces a current review.
        assert!(install(&e, &selected).is_err());
        assert!(!project.join(".claude/skills/flow-skill").exists());
    }
    #[test]
    fn remote_filters_declarers_and_cleanup_match_174_without_refetch() {
        let (f, e, t) = fixture();
        let p = t.directory(&e.home).unwrap();
        let repo = f.0.join("remote");
        let url = remote_repo(&repo, &["remote-a", "remote-b"]);
        for name in ["pack-a", "pack-b"] {
            let dir = p.join("node_modules").join(name);
            fs::create_dir_all(&dir).unwrap();
            fs::write(
                dir.join("package.json"),
                serde_json::json!({"name":name,"skills":[url]}).to_string(),
            )
            .unwrap();
        }
        fs::write(
            p.join("package.json"),
            r#"{"dependencies":{"pack-a":"1","pack-b":"1"}}"#,
        )
        .unwrap();
        let options = SyncOptions {
            remote: true,
            exclude: vec!["pack-a".into()],
            ..Default::default()
        };
        let plan = prepare_options(&e, &t, &ids(&["codex"]), &options)
            .unwrap()
            .plan;
        assert_eq!(plan.items.len(), 2);
        assert!(plan
            .items
            .iter()
            .all(|i| i.via.as_deref() == Some("pack-b")));
        let result = install(&e, &plan).unwrap();
        assert!(
            result.items.iter().all(|i| i.status == "complete"),
            "{} {:?}",
            result.logs,
            result.warnings
        );
        fs::rename(&repo, f.0.join("remote-unavailable")).unwrap();
        let options = SyncOptions {
            cleanup: true,
            exclude: vec!["pack-a".into(), "pack-b#remote-a".into()],
            ..options
        };
        let plan = prepare_options(&e, &t, &ids(&["codex"]), &options)
            .unwrap()
            .plan;
        assert_eq!(plan.removals.len(), 1);
        assert_eq!(plan.removals[0].skill, "remote-a");
        assert!(plan.items.is_empty());
        let result = install(&e, &plan).unwrap();
        assert!(
            result.items.iter().all(|i| i.status == "complete"),
            "{} {:?}",
            result.logs,
            result.warnings
        );
        assert!(!p.join(".agents/skills/remote-a").exists());
        assert!(p.join(".agents/skills/remote-b/SKILL.md").exists());
    }
    #[cfg(unix)]
    #[test]
    fn cached_links_preserve_local_content_and_lock_with_copy_selected_and_retry() {
        let (f, e, t) = fixture();
        let p = t.directory(&e.home).unwrap();
        let repo = f.0.join("remote");
        let url = remote_repo(&repo, &["cached"]);
        fs::write(
            p.join("package.json"),
            serde_json::json!({"skills":[url]}).to_string(),
        )
        .unwrap();
        let options = SyncOptions {
            remote: true,
            ..Default::default()
        };
        let plan = prepare_options(&e, &t, &ids(&["codex"]), &options)
            .unwrap()
            .plan;
        assert!(install(&e, &plan)
            .unwrap()
            .items
            .iter()
            .all(|i| i.status == "complete"));
        let shared = p.join(".agents/skills/cached");
        fs::write(shared.join("notes.md"), "keep local notes").unwrap();
        let lock = fs::read(p.join("skills-lock.json")).unwrap();
        fs::rename(&repo, f.0.join("remote-unavailable")).unwrap();
        fs::write(p.join(".claude"), "blocked parent").unwrap();
        assert!(prepare_options(&e, &t, &ids(&["claude-code"]), &options).is_err());
        fs::remove_file(p.join(".claude")).unwrap();
        let plan = prepare_options(&e, &t, &ids(&["claude-code"]), &options)
            .unwrap()
            .plan;
        assert_eq!(plan.items.len(), 1);
        assert!(plan.items[0].cached && !plan.items[0].changes_shared);
        assert!(plan.options.copy);
        let result = install(&e, &plan).unwrap();
        assert!(
            result.items.iter().all(|i| i.status == "complete"),
            "{} {:?}",
            result.logs,
            result.warnings
        );
        assert!(p.join(".claude/skills/cached").is_symlink());
        assert_eq!(fs::read(p.join("skills-lock.json")).unwrap(), lock);
        assert_eq!(
            fs::read_to_string(shared.join("notes.md")).unwrap(),
            "keep local notes"
        );
        let restarted = engine(&e.home);
        assert!(
            prepare_options(&restarted, &t, &ids(&["claude-code"]), &options)
                .unwrap()
                .plan
                .items
                .is_empty()
        );
    }
}
