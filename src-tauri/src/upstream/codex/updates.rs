//! On-demand source checks and reviewed plugin updates. The original Codex CLI owns package writes.
use super::*;
mod runtime_config;
mod source;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub plugin_id: String,
    pub revision: String,
    pub installed_version: Option<String>,
    pub candidate_version: Option<String>,
    pub candidate_components: Vec<String>,
    pub candidate_skill_count: usize,
    pub current_content_fingerprint: Option<String>,
    pub candidate_content_fingerprint: Option<String>,
    pub baseline_content_fingerprint: Option<String>,
    pub source_path: String,
    pub status: String,
    pub reason: Option<String>,
    pub local_state: String,
    pub can_update: bool,
    pub recovery: bool,
    pub unmapped_rules: Vec<String>,
    pub affected_rules: Vec<Value>,
    pub installed_path: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
struct Recovery {
    enabled: bool,
    old_root: String,
    // Exact original rules, including extension fields, retained for interrupted recovery.
    rules: Vec<Value>,
    path_rules: BTreeMap<String, String>,
    documents: Vec<String>,
    candidate_fingerprint: String,
    candidate_version: Option<String>,
    #[serde(default)]
    package_fingerprint: Option<String>,
    #[serde(default)]
    unmapped_rules: Vec<String>,
}
#[derive(Default, Deserialize, Serialize)]
struct Record {
    baseline: Option<String>,
    installed_path: Option<String>,
    recovery: Option<Recovery>,
}
fn record_path(engine: &Engine, id: &str) -> PathBuf {
    engine
        .env_home("CODEX_HOME", ".codex")
        .join("skills-space/plugin-updates")
        .join(format!("{}.json", document_diff::revision(id.as_bytes())))
}
fn record(engine: &Engine, id: &str) -> Result<Record, String> {
    let path = record_path(engine, id);
    if !path.try_exists().map_err(|e| e.to_string())? {
        return Ok(Record::default());
    }
    if fs::symlink_metadata(&path)
        .map_err(|e| e.to_string())?
        .file_type()
        .is_symlink()
        || fs::metadata(&path).map_err(|e| e.to_string())?.len() > 1024 * 1024
    {
        return Err("Plugin update record is not a bounded regular file.".into());
    }
    let value: Value = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Cannot read plugin update recovery: {e}"))?;
    // Optional history never gates an update. A pending recovery must remain readable.
    let recovery = if value["recovery"].is_null() {
        None
    } else {
        Some(
            serde_json::from_value(value["recovery"].clone())
                .map_err(|e| format!("Cannot read plugin update recovery: {e}"))?,
        )
    };
    Ok(Record {
        baseline: value["baseline"].as_str().map(str::to_owned),
        installed_path: value["installed_path"].as_str().map(str::to_owned),
        recovery,
    })
}
fn save(engine: &Engine, id: &str, record: &Record) -> Result<(), String> {
    let path = record_path(engine, id);
    for ancestor in path.ancestors().take(3) {
        if ancestor.is_symlink() {
            return Err("Plugin update record path is a symbolic link.".into());
        }
    }
    super::super::pi::write_bytes(
        &path,
        &serde_json::to_vec(record).map_err(|e| e.to_string())?,
    )
}
fn fingerprint(path: &Path) -> Option<String> {
    tree_signature(path).map(|bytes| document_diff::revision(&bytes))
}
fn version(root: &Path) -> Option<String> {
    manifest(root)
        .ok()?
        .get("version")?
        .as_str()
        .filter(|v| !v.is_empty())
        .map(str::to_owned)
}
fn check_snapshot(
    engine: &Engine,
    snapshot: &Snapshot,
    id: &str,
    source: Option<&source::Source>,
) -> Result<Check, String> {
    let plugin = snapshot
        .plugins
        .iter()
        .find(|p| p.id == id)
        .ok_or("Plugin unavailable. Refresh plugins.")?;
    let saved = record(engine, id)?;
    let root = plugin.installed_path.as_deref().map(Path::new);
    let current = root.and_then(fingerprint);
    let baseline = (saved.installed_path == plugin.installed_path)
        .then_some(saved.baseline)
        .flatten();
    let mut result = Check {
        plugin_id: id.into(),
        revision: snapshot.revision.clone(),
        installed_version: plugin.version.clone(),
        candidate_version: None,
        candidate_components: vec![],
        candidate_skill_count: 0,
        current_content_fingerprint: current.clone(),
        candidate_content_fingerprint: None,
        baseline_content_fingerprint: baseline.clone(),
        source_path: plugin.source_path.clone(),
        status: "unavailable".into(),
        reason: None,
        local_state: if current.is_some() && baseline.is_some() {
            if current == baseline {
                "unchanged"
            } else {
                "modified"
            }
        } else {
            "unknown"
        }
        .into(),
        can_update: false,
        recovery: saved.recovery.is_some(),
        unmapped_rules: vec![],
        affected_rules: root
            .map(|root| affected_rules(&snapshot.rules, root))
            .unwrap_or_default(),
        installed_path: plugin.installed_path.clone(),
    };
    if saved.recovery.is_some() {
        result.status = "recovery".into();
        result.can_update =
            plugin.installed && plugin.can_toggle && snapshot.capabilities.write_config;
        return Ok(result);
    }
    if !plugin.can_check_updates {
        result.reason = Some("source".into());
        return Ok(result);
    }
    let source = source.ok_or("Plugin source was not prepared.")?;
    result.source_path = source.label.clone();
    let source = source.root.as_path();
    if !source.try_exists().map_err(|e| e.to_string())? {
        result.status = "removed".into();
        return Ok(result);
    }
    let data = manifest(source)?;
    if data["name"].as_str() != id.rsplit_once('@').map(|v| v.0) {
        result.reason = Some("identity".into());
        return Ok(result);
    }
    let documents = relative_documents(source)?;
    let previous_documents = root
        .map(relative_documents)
        .transpose()?
        .unwrap_or_default();
    result.unmapped_rules = root
        .map(|root| {
            capture_paths(&snapshot.rules, root)
                .into_iter()
                .filter(|(_, relative)| {
                    !documents.contains(relative) || !previous_documents.contains(relative)
                })
                .map(|(path, _)| path)
                .collect()
        })
        .unwrap_or_default();
    result.candidate_skill_count = documents.len();
    result.candidate_components = ["skills", "mcpServers", "hooks", "apps"]
        .iter()
        .filter(|key| !data[**key].is_null())
        .map(|key| key.to_string())
        .collect();
    for (file, component) in [
        ("skills", "skills"),
        ("mcp.json", "mcpServers"),
        (".mcp.json", "mcpServers"),
        ("hooks/hooks.json", "hooks"),
        (".app.json", "apps"),
    ] {
        if source.join(file).exists() && !result.candidate_components.iter().any(|c| c == component)
        {
            result.candidate_components.push(component.into());
        }
    }
    result.candidate_version = version(source);
    result.candidate_content_fingerprint = fingerprint(source);
    if current.is_none() || result.candidate_content_fingerprint.is_none() {
        result.reason = Some("content".into());
        return Ok(result);
    }
    let policy = runtime_config::fields(plugin);
    let package_current = root.and_then(|root| runtime_config::fingerprint(root, policy));
    let package_candidate = runtime_config::fingerprint(source, policy);
    if package_current.is_none() || package_candidate.is_none() {
        result.reason = Some("content".into());
        return Ok(result);
    }
    result.status = if package_current == package_candidate {
        "current"
    } else if result.candidate_version.is_some() && plugin.version != result.candidate_version {
        "versionChanged"
    } else {
        "contentChanged"
    }
    .into();
    result.can_update = result.status != "current"
        && plugin.can_toggle
        && plugin.can_uninstall
        && snapshot.capabilities.install_plugins;
    Ok(result)
}
pub(super) fn check(engine: &Engine, target: &Target, id: &str) -> Result<Check, String> {
    if target.scope == "project" {
        return Err("Manage plugin updates in global management.".into());
    }
    let snapshot = inspect(engine, target)?;
    let prepared = prepare(engine, target, &snapshot, id)?;
    check_snapshot(engine, &snapshot, id, prepared.as_ref())
}
fn prepare(
    engine: &Engine,
    target: &Target,
    snapshot: &Snapshot,
    id: &str,
) -> Result<Option<source::Source>, String> {
    let plugin = snapshot
        .plugins
        .iter()
        .find(|p| p.id == id)
        .ok_or("Plugin unavailable. Refresh plugins.")?;
    if !plugin.can_check_updates || record(engine, id)?.recovery.is_some() {
        return Ok(None);
    }
    source::prepare(engine, target, snapshot, plugin).map(Some)
}
fn affected_rules(rules: &[Value], root: &Path) -> Vec<Value> {
    let paths = capture_paths(rules, root);
    rules
        .iter()
        .filter(|r| r["path"].as_str().is_some_and(|p| paths.contains_key(p)))
        .cloned()
        .collect()
}

fn relative_documents(root: &Path) -> Result<Vec<String>, String> {
    plugin_documents(root, &manifest(root)?)
        .iter()
        .map(|p| {
            identity(p)
                .strip_prefix(identity(root))
                .map(|p| p.to_string_lossy().into_owned())
                .map_err(|_| "Plugin skill escapes its package.".into())
        })
        .collect()
}
fn capture_paths(rules: &[Value], root: &Path) -> BTreeMap<String, String> {
    rules
        .iter()
        .filter_map(|rule| {
            let path = rule["path"].as_str()?;
            identity(Path::new(path))
                .strip_prefix(identity(root))
                .ok()
                .map(|relative| (path.to_owned(), relative.to_string_lossy().into_owned()))
        })
        .collect()
}
fn migrate_rules(
    current: &[Value],
    old: &Recovery,
    new_root: &Path,
    documents: &[String],
) -> Result<Vec<Value>, String> {
    let old_root = Path::new(&old.old_root);
    let mut next = current.to_vec();
    for rule in &old.rules {
        let Some(path) = rule["path"].as_str() else {
            continue;
        };
        let Some(relative) = old.path_rules.get(path) else {
            continue;
        };
        if old.unmapped_rules.iter().any(|p| p == path) {
            continue;
        }
        if !old.documents.contains(relative) || !documents.contains(relative) {
            return Err(format!(
                "A skill path rule cannot be mapped to the updated plugin: {path}"
            ));
        }
        let mut migrated = rule.clone();
        migrated["path"] = json!(identity(new_root).join(relative));
        if migrated == *rule {
            continue;
        }
        // Only transform exact old selectors. New or edited rules are never silently overwritten.
        let matching: Vec<_> = next
            .iter()
            .enumerate()
            .filter(|(_, r)| r["path"] == rule["path"])
            .map(|(i, _)| i)
            .collect();
        let destination: Vec<_> = next
            .iter()
            .filter(|r| r["path"] == migrated["path"])
            .collect();
        if matching.is_empty() && destination == vec![&migrated] {
            continue;
        } // already recovered
        if matching.len() != 1 || next[matching[0]] != *rule || !destination.is_empty() {
            return Err("A plugin skill rule changed during update. Resolve the conflicting path rules in Codex settings, then check again.".into());
        }
        next[matching[0]] = migrated;
    }
    // Rules added while the CLI was running must not be left pointing at the old cache.
    if old_root != identity(new_root)
        && next.iter().any(|rule| {
            rule["path"].as_str().is_some_and(|p| {
                Path::new(p).starts_with(old_root) && !old.unmapped_rules.iter().any(|old| old == p)
            })
        })
    {
        return Err(
            "New rules reference the old plugin path. Review Codex settings before recovery."
                .into(),
        );
    }
    Ok(next)
}
fn recover(
    engine: &Engine,
    target: &Target,
    id: &str,
    saved: &mut Record,
) -> Result<Snapshot, String> {
    let recovery = saved
        .recovery
        .as_ref()
        .ok_or("No pending plugin recovery.")?
        .clone();
    let snapshot = inspect(engine, target)?;
    let plugin = snapshot
        .plugins
        .iter()
        .find(|p| p.id == id && p.installed)
        .ok_or("Updated plugin is not installed; recovery retained.")?;
    let root = Path::new(
        plugin
            .installed_path
            .as_deref()
            .ok_or("Updated plugin path unavailable.")?,
    );
    let documents = relative_documents(root)?;
    let cwd = target.directory(&engine.home)?;
    let mut session = Session::start(engine, Path::new(&snapshot.binary), &cwd)?;
    // Restore the package switch first, even when a removed skill blocks rule migration.
    let config = read_config(&mut session, &cwd)?;
    let layer = user_layer(&config)?;
    let mut entries = layer["config"]["plugins"]
        .as_object()
        .cloned()
        .unwrap_or_default();
    let entry = entries.entry(id.to_owned()).or_insert(json!({}));
    if entry["enabled"] != recovery.enabled {
        entry["enabled"] = json!(recovery.enabled);
        session.call("config/value/write",json!({"keyPath":"plugins","value":entries,"mergeStrategy":"replace","expectedVersion":layer["version"]}))?;
    }
    let config = read_config(&mut session, &cwd)?;
    let layer = user_layer(&config)?;
    let rules = layer["config"]["skills"]["config"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let next = migrate_rules(&rules, &recovery, root, &documents)?;
    if next != rules {
        session.call("config/value/write", json!({"keyPath":"skills.config","value":next,"mergeStrategy":"replace","expectedVersion":layer["version"]}))?;
    }
    drop(session);
    let after = inspect(engine, target)?;
    let actual = after
        .plugins
        .iter()
        .find(|p| p.id == id)
        .ok_or("Updated plugin unavailable after configuration recovery.")?;
    if actual.enabled != recovery.enabled
        || affected_rules(&after.rules, root) != affected_rules(&next, root)
    {
        return Err(
            "Plugin configuration recovery could not be verified; recovery retained.".into(),
        );
    }
    let matches_content = if let Some(expected) = &recovery.package_fingerprint {
        runtime_config::fingerprint(root, runtime_config::fields(actual)).as_ref() == Some(expected)
    } else {
        fingerprint(root).as_deref() == Some(&recovery.candidate_fingerprint)
    };
    if !matches_content || version(root) != recovery.candidate_version {
        // Configuration is safe again; a failed/no-op installation must not trap
        // the user in a recovery-only loop. Recheck reviews the actual content.
        saved.recovery = None;
        save(engine, id, saved)?;
        return Err("Plugin configuration restored, but installation did not match the reviewed source. Check again before retrying the update.".into());
    }
    saved.baseline = Some(recovery.candidate_fingerprint);
    saved.installed_path = actual.installed_path.clone();
    saved.recovery = None;
    save(engine, id, saved)?;
    Ok(after)
}
fn update(engine: &Engine, target: &Target, reviewed: &Check) -> Result<Snapshot, String> {
    if target.scope == "project" {
        return Err("Manage plugin updates in global management.".into());
    }
    let before = inspect(engine, target)?;
    let prepared = prepare(engine, target, &before, &reviewed.plugin_id)?;
    let actual = check_snapshot(engine, &before, &reviewed.plugin_id, prepared.as_ref())?;
    if !actual.can_update
        || actual.recovery != reviewed.recovery
        || (!actual.recovery
            && (actual.source_path != reviewed.source_path
                || actual.installed_path != reviewed.installed_path
                || actual.current_content_fingerprint != reviewed.current_content_fingerprint
                || actual.candidate_content_fingerprint != reviewed.candidate_content_fingerprint
                || actual.affected_rules != reviewed.affected_rules
                || actual.unmapped_rules != reviewed.unmapped_rules))
    {
        return Err("Plugin source, installed content or configuration changed. Check again before updating.".into());
    }
    let id = &reviewed.plugin_id;
    let mut saved = record(engine, id)?;
    if saved.recovery.is_some() {
        return recover(engine, target, id, &mut saved);
    }
    let plugin = before.plugins.iter().find(|p| p.id == *id).unwrap();
    let runtime_config = runtime_config::capture(plugin)?;
    let old_root = plugin
        .installed_path
        .clone()
        .ok_or("Installed plugin path unavailable.")?;
    let recovery = Recovery {
        enabled: plugin.enabled,
        old_root: identity(Path::new(&old_root))
            .to_string_lossy()
            .into_owned(),
        rules: actual.affected_rules.clone(),
        path_rules: capture_paths(&before.rules, Path::new(&old_root)),
        documents: relative_documents(Path::new(&old_root))?,
        candidate_fingerprint: actual
            .candidate_content_fingerprint
            .clone()
            .ok_or("Source fingerprint unavailable.")?,
        candidate_version: actual.candidate_version.clone(),
        package_fingerprint: runtime_config::fields(plugin).and_then(|policy| {
            prepared
                .as_ref()
                .and_then(|source| runtime_config::fingerprint(&source.root, Some(policy)))
        }),
        unmapped_rules: actual.unmapped_rules.clone(),
    };
    let prepared = prepared.ok_or("Plugin source unavailable.")?;
    // Detect conflicts before installation; confirmed unmapped rules stay unchanged.
    migrate_rules(
        &before.rules,
        &recovery,
        &prepared.root,
        &relative_documents(&prepared.root)?,
    )?;
    saved.recovery = Some(recovery);
    save(engine, id, &saved)?;
    let result = if let Some(marketplace) = &prepared.native_marketplace {
        // Reserved App marketplaces cannot be replaced with a temporary same-name
        // catalog. Use the original App Server's explicit marketplace install route.
        Session::start(engine, Path::new(&before.binary), &target.directory(&engine.home)?)
            .and_then(|mut session|session.call("plugin/install",json!({"marketplacePath":marketplace,"pluginName":id.rsplit_once('@').ok_or("Invalid plugin identity.")?.0})))
    } else {
        cli(
            engine,
            Path::new(&before.binary),
            &target.directory(&engine.home)?,
            &[
                "-c",
                &prepared.install_override,
                "plugin",
                "add",
                id,
                "--json",
            ],
        )
    };
    let runtime_restore = (|| -> Result<(), String> {
        if let Some(captured) = &runtime_config {
            let observed = inspect(engine, target)?;
            if let Some(p) = observed.plugins.iter().find(|p| p.id == *id && p.installed) {
                if let Some(root) = p.installed_path.as_deref() {
                    let expected = saved
                        .recovery
                        .as_ref()
                        .and_then(|r| r.package_fingerprint.as_ref());
                    if expected.is_some()
                        && runtime_config::fingerprint(Path::new(root), runtime_config::fields(p))
                            .as_ref()
                            == expected
                    {
                        runtime_config::restore(Path::new(root), captured)?;
                    }
                }
            }
        }
        Ok(())
    })();
    // Always attempt state recovery: the CLI may have written before returning an error.
    match recover(engine, target, id, &mut saved) {
        Ok(mut after) => {
            runtime_restore.map_err(|error|format!("Plugin installed, but App runtime configuration could not be restored: {error}"))?;
            if let Err(error) = result {
                after.warnings.push(error);
            }
            Ok(after)
        }
        Err(error) => Err(format!(
            "Plugin update is incomplete: {error}{}",
            result.err().map(|e| format!("; {e}")).unwrap_or_default()
        )),
    }
}
#[tauri::command]
pub async fn upstream_codex_check_plugin(
    app: AppHandle,
    target: Target,
    plugin_id: String,
) -> Result<Check, String> {
    tauri::async_runtime::spawn_blocking(move || {
        check(&Engine::from_app(&app)?, &target, &plugin_id)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_codex_update_plugin(
    app: AppHandle,
    target: Target,
    reviewed: Check,
) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        update(&Engine::from_app(&app)?, &target, &reviewed)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests;

#[cfg(test)]
pub(super) mod git_fixture;
