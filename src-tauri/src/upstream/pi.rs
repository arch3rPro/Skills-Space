//! Pi-native configuration. CLI lifecycle stays upstream-owned; local Trash removal is in pi_removal.
use super::*;
use std::io::Write;
pub(crate) mod inventory;
pub(crate) mod native;
pub(crate) mod packages;
pub(crate) mod visibility;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillState {
    pub path: String,
    pub file: String,
    pub rule_path: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub can_toggle: bool,
    pub reason: Option<String>,
    pub blocking_rules: Vec<String>,
    pub settings_path: String,
    pub scope: String,
    pub in_scope: bool,
    pub package_index: Option<usize>,
    pub package_source: Option<String>,
    pub origin: String,
    pub manual_only: bool,
    pub can_set_visibility: bool,
    #[serde(default)]
    pub can_check_package: bool,
    #[serde(default)]
    pub can_restore_default: bool,
    #[serde(default)]
    pub can_recover_invocation: bool,
    pub visibility_hidden: bool,
    pub visibility_pending: bool,
    pub source_manual_only: bool,
    pub can_trash: bool,
    pub document_revision: String,
    pub cli_addressable: bool,
    #[serde(default)]
    pub managed: bool,
    #[serde(default)]
    pub visibility_configured: bool,
    pub package_root: Option<String>,
    pub lifecycle: Option<serde_json::Value>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    path: String,
    revision: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    #[serde(default)]
    pub codemode: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub builtin_configuration: Option<serde_json::Value>,
    #[serde(default)]
    pub runtime_version: Option<String>,
    target: Target,
    pub path: String,
    pub revision: String,
    pub project_trusted: bool,
    pub project_trust_decision: bool,
    pub trust_revision: String,
    pub entries: Vec<String>,
    pub skill_commands: Option<bool>,
    pub inherited_skill_commands: bool,
    pub dependencies: Vec<Dependency>,
    pub skills: Vec<SkillState>,
    pub warnings: Vec<String>,
    #[serde(default)]
    pub recovery_issues: Vec<serde_json::Value>,
    agent_directory: String,
    #[serde(default)]
    pub additional_directories: Vec<String>,
    visibility_extension_allowed: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Change {
    #[serde(default)]
    codemode: Option<serde_json::Value>,
    target: Target,
    revision: String,
    entries: Vec<String>,
    skill_commands: Option<bool>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Toggle {
    target: Target,
    file: String,
    dependencies: Vec<Dependency>,
    enabled: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BatchToggle {
    target: Target,
    files: Vec<String>,
    dependencies: Vec<Dependency>,
    enabled: bool,
}
fn agent_directory(engine: &Engine) -> Result<PathBuf, String> {
    let configured = engine.env_home("PI_CODING_AGENT_DIR", ".pi/agent");
    let agent = match configured.to_str() {
        Some("~") => engine.home.clone(),
        Some(value) if value.starts_with("~/") => engine.home.join(&value[2..]),
        _ => configured,
    };
    if !agent.is_absolute() {
        return Err("Pi configuration directory must be absolute.".into());
    }
    Ok(agent)
}
pub(super) fn inspect(engine: &Engine, target: &Target) -> Result<Snapshot, String> {
    let directory = target.directory(&engine.home)?;
    let agent = agent_directory(engine)?;
    let mut command = engine.command(&engine.node, &engine.home);
    command
        .arg(engine.resources.join("inspect-pi-skills.mjs"))
        .arg(&engine.home)
        .arg(agent);
    command.arg(if target.scope == "project" {
        directory.to_string_lossy().into_owned()
    } else {
        String::new()
    });
    command.arg("--management");
    let output = run_process_with_timeout(&mut command, Duration::from_secs(20))?;
    if !output.success {
        return Err(format!(
            "Cannot inspect Pi skill settings. {}",
            output.stderr
        ));
    }
    serde_json::from_str(&output.stdout).map_err(|_| "Unsupported Pi settings response.".into())
}

fn settings(path: &Path) -> Result<serde_json::Value, String> {
    if fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
        return Err("Pi settings is a symbolic link. Edit its original file directly.".into());
    }
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > 1024 * 1024 {
        return Err("Pi settings exceeds the editing size limit.".into());
    }
    let bytes = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(bytes.trim_start_matches('\u{feff}'))
        .map_err(|_| "Invalid Pi settings JSON.")?;
    if !data.is_object() {
        return Err("Pi settings must be a JSON object.".into());
    }
    Ok(data)
}

fn write_settings(path: &Path, data: &serde_json::Value) -> Result<(), String> {
    let mut bytes = serde_json::to_vec_pretty(data).map_err(|e| e.to_string())?;
    bytes.push(b'\n');
    write_bytes(path, &bytes)
}
pub(super) fn write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid Pi settings path.")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp = parent.join(format!(
        ".settings.skills-space-{}-{}.tmp",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos()
    ));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| {
        let mut file = options.open(&temp).map_err(|e| e.to_string())?;
        file.write_all(bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        if path.exists() {
            fs::set_permissions(
                &temp,
                fs::metadata(path).map_err(|e| e.to_string())?.permissions(),
            )
            .map_err(|e| e.to_string())?;
        }
        fs::rename(&temp, path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}
pub(super) struct SettingsLock(PathBuf);
impl SettingsLock {
    pub(super) fn acquire(path: &Path) -> Result<Self, String> {
        let parent = path.parent().ok_or("Invalid Pi settings path.")?;
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let lock = PathBuf::from(format!("{}.lock", path.display()));
        fs::create_dir(&lock).map_err(|_| {
            "Pi settings is being edited. Retry after the other operation completes."
        })?;
        Ok(Self(lock))
    }
}
impl Drop for SettingsLock {
    fn drop(&mut self) {
        let _ = fs::remove_dir(&self.0);
    }
}
fn validate_entries(entries: &[String]) -> Result<(), String> {
    if entries.len() > 2000
        || entries
            .iter()
            .any(|v| v.trim().is_empty() || v.len() > 4096 || v.chars().any(char::is_control))
    {
        return Err(
            "Pi skill entries must be non-empty paths or rules within the size limit.".into(),
        );
    }
    Ok(())
}
fn is_skill_rule(value: &str) -> bool {
    value.starts_with(['!', '+', '-']) || value.contains(['*', '?'])
}
fn validate_directory(home: &Path, settings_path: &Path, value: &str) -> Result<(), String> {
    validate_entries(&[value.to_owned()])?;
    if is_skill_rule(value) {
        return Err(format!("Pi skill directory is unavailable: {value}"));
    }
    let expanded = if value == "~" {
        home.to_path_buf()
    } else if let Some(relative) = value.strip_prefix("~/") {
        home.join(relative)
    } else {
        settings_path
            .parent()
            .ok_or("Invalid Pi settings path.")?
            .join(value)
    };
    if !expanded.is_dir() || fs::read_dir(&expanded).is_err() {
        return Err(format!("Pi skill directory is unavailable: {value}"));
    }
    Ok(())
}
// Modify only the requested native fields. Other default tool selections remain byte-for-value intact.
fn update_codemode(data: &mut serde_json::Value, patch: &serde_json::Value) -> Result<(), String> {
    let patch = patch.as_object().ok_or("Invalid Pi code mode settings.")?;
    if patch
        .keys()
        .any(|key| !["startupEnabled", "mode", "inlineBudget"].contains(&key.as_str()))
    {
        return Err("Invalid Pi code mode setting.".into());
    }
    if let Some(enabled) = patch.get("startupEnabled") {
        let enabled = enabled
            .as_bool()
            .ok_or("Invalid Pi code mode startup setting.")?;
        let entries = match data.get("defaultTools") {
            None => vec![],
            Some(value) => value
                .as_array()
                .ok_or("Invalid Pi default tool selection.")?
                .iter()
                .map(|entry| {
                    entry
                        .as_str()
                        .map(str::to_owned)
                        .ok_or("Invalid Pi default tool selection.")
                })
                .collect::<Result<Vec<_>, _>>()?,
        };
        let modifiers = !data
            .get("defaultTools")
            .is_some_and(|v| v.as_array().is_some_and(Vec::is_empty))
            && entries
                .iter()
                .all(|entry| entry.starts_with('+') || entry.starts_with('-'));
        let mut entries: Vec<String> = entries
            .into_iter()
            .filter(|entry| !["codemode", "+codemode", "-codemode"].contains(&entry.as_str()))
            .collect();
        if modifiers {
            entries.push(if enabled { "+codemode" } else { "-codemode" }.into());
        } else if enabled {
            entries.push("codemode".into());
        }
        data["defaultTools"] = serde_json::json!(entries);
    }
    for key in ["mode", "inlineBudget"] {
        let Some(value) = patch.get(key) else {
            continue;
        };
        if !value.is_null()
            && match key {
                "mode" => !matches!(value.as_str(), Some("on" | "only")),
                _ => !value.as_f64().is_some_and(|n| n.is_finite() && n >= 0.0),
            }
        {
            return Err("Invalid Pi code mode value.".into());
        }
        if value.is_null() {
            if let Some(object) = data
                .get_mut("codemode")
                .and_then(serde_json::Value::as_object_mut)
            {
                object.remove(key);
            }
        } else {
            if data.get("codemode").is_none() {
                data["codemode"] = serde_json::json!({});
            }
            let object = data
                .get_mut("codemode")
                .and_then(serde_json::Value::as_object_mut)
                .ok_or("Invalid Pi code mode settings object.")?;
            object.insert(key.into(), value.clone());
        }
    }
    if data
        .get("codemode")
        .and_then(serde_json::Value::as_object)
        .is_some_and(|object| object.is_empty())
    {
        data.as_object_mut()
            .ok_or("Invalid Pi settings object.")?
            .remove("codemode");
    }
    Ok(())
}
#[cfg(test)]
fn save(engine: &Engine, change: Change) -> Result<Snapshot, String> {
    save_with_builtins(engine, change, None)
}
fn save_with_builtins(
    engine: &Engine,
    change: Change,
    builtins: Option<inventory::BuiltinChange>,
) -> Result<Snapshot, String> {
    validate_entries(&change.entries)?;
    let before = inspect(engine, &change.target)?;
    let _lock = SettingsLock::acquire(Path::new(&before.path))?;
    let current = inspect(engine, &change.target)?;
    if current.revision != change.revision {
        return Err("Pi settings changed outside this page. Reload before saving.".into());
    }
    let path = Path::new(&current.path);
    if change.target.scope == "project"
        && builtins.is_some()
        && fs::symlink_metadata(path.parent().ok_or("Invalid Pi configuration path.")?)
            .is_ok_and(|m| m.file_type().is_symlink())
    {
        return Err("Project Pi configuration is a symbolic link. Edit its original configuration directly.".into());
    }
    let builtin_fields = builtins
        .as_ref()
        .map(|changes| inventory::prepare_builtins(engine, &change.target, changes))
        .transpose()?;
    for entry in &change.entries {
        if !current.entries.contains(entry) && !is_skill_rule(entry) {
            validate_directory(&engine.home, path, entry)?;
        }
    }
    let mut data = settings(path)?;
    if change.entries != current.entries {
        if change.entries.is_empty() {
            data.as_object_mut()
                .ok_or("Invalid settings object.")?
                .remove("skills");
        } else {
            data["skills"] = serde_json::to_value(change.entries).map_err(|e| e.to_string())?;
        }
    }
    if change.skill_commands != current.skill_commands {
        if let Some(value) = change.skill_commands {
            data["enableSkillCommands"] = value.into();
        } else {
            data.as_object_mut()
                .ok_or("Invalid settings object.")?
                .remove("enableSkillCommands");
        }
    }
    if let Some(patch) = &change.codemode {
        if current.codemode.is_none() {
            return Err("Pi code mode settings are unavailable. Reload Pi settings with a compatible Pi installation.".into());
        }
        // Pi appends an empty project list to an inherited array. Materialize that
        // resolved selection before editing it, preserving every other active tool.
        if patch.get("startupEnabled").is_some()
            && data
                .get("defaultTools")
                .and_then(serde_json::Value::as_array)
                .is_some_and(Vec::is_empty)
        {
            if let Some(tools) = current
                .codemode
                .as_ref()
                .and_then(|code| code.get("startupTools"))
            {
                data["defaultTools"] = tools.clone();
            }
        }
        update_codemode(&mut data, patch)?;
    }
    if let Some(fields) = builtin_fields {
        if let Some(extensions) = fields.get("extensions") {
            if !extensions.is_array() {
                return Err("Invalid Pi built-in extension selection.".into());
            }
            data["extensions"] = extensions.clone();
        }
    }
    write_settings(path, &data)?;
    let mut actual = inspect(engine, &change.target)?;
    if let Some(changes) = builtins {
        let observed =
            inventory::helper(engine, &change.target, serde_json::json!({"action":"list"}))?;
        let resources = observed["snapshot"]["builtins"]
            .as_array()
            .ok_or("Pi built-in settings could not be read back.")?;
        for choice in changes.choices {
            let item = resources
                .iter()
                .find(|item| item["id"] == choice.resource_id)
                .ok_or("Pi built-in extension is missing after saving.")?;
            if change.target.scope == "project" {
                if item["override"] != choice.state {
                    return Err("Pi did not retain the built-in project override.".into());
                }
            } else if item["enabled"] != (choice.state == "load") {
                return Err("Pi did not retain the built-in loading setting.".into());
            }
        }
        actual.builtin_configuration = Some(observed["snapshot"].clone());
    }
    Ok(actual)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrustChange {
    target: Target,
    revision: String,
    trusted: bool,
}

fn save_trust(engine: &Engine, change: TrustChange) -> Result<Snapshot, String> {
    if change.target.scope != "project" {
        return Err("Select a project to change Pi trust.".into());
    }
    let project = change.target.directory(&engine.home)?;
    let path = agent_directory(engine)?.join("trust.json");
    visibility::regular_destination(&path)?;
    // Pi's proper-lockfile store uses the same trust.json.lock directory.
    let _lock = SettingsLock::acquire(&path)?;
    let current = inspect(engine, &change.target)?;
    if current.trust_revision != change.revision {
        return Err("Pi project trust changed. Reload before saving.".into());
    }
    let mut data = settings(&path)?;
    data.as_object_mut()
        .ok_or("Invalid Pi project trust store.")?
        .insert(
            project.to_string_lossy().into_owned(),
            change.trusted.into(),
        );
    write_settings(&path, &data)?;
    let after = inspect(engine, &change.target)?;
    if after.project_trust_decision != change.trusted {
        return Err(
            "Pi project trust was written but could not be verified. Reload settings.".into(),
        );
    }
    Ok(after)
}

#[tauri::command]
pub async fn upstream_pi_trust(app: AppHandle, change: TrustChange) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|error| error.to_string())?;
        save_trust(&Engine::from_app(&app)?, change)
    })
    .await
    .map_err(|error| error.to_string())?
}
fn toggle(engine: &Engine, request: Toggle) -> Result<Snapshot, String> {
    toggle_batch(
        engine,
        BatchToggle {
            target: request.target,
            files: vec![request.file],
            dependencies: request.dependencies,
            enabled: request.enabled,
        },
    )
}
fn toggle_batch(engine: &Engine, request: BatchToggle) -> Result<Snapshot, String> {
    if request.files.is_empty() || request.files.len() > 2000 {
        return Err("Select between 1 and 2000 Pi skills.".into());
    }
    let files: std::collections::HashSet<_> = request.files.iter().collect();
    if files.len() != request.files.len() {
        return Err("Duplicate Pi skill paths.".into());
    }
    let before = inspect(engine, &request.target)?;
    if before.dependencies != request.dependencies {
        return Err("Pi settings changed. Refresh before retrying.".into());
    }
    let _lock = SettingsLock::acquire(Path::new(&before.path))?;
    let current = inspect(engine, &request.target)?;
    if current.dependencies != request.dependencies {
        return Err("Pi settings changed. Refresh before retrying.".into());
    }
    let items: Vec<_> = current
        .skills
        .iter()
        .filter(|item| files.contains(&item.file))
        .collect();
    if items.len() != files.len()
        || items
            .iter()
            .any(|item| !item.can_toggle || item.settings_path != current.path)
    {
        return Err("A selected Pi skill changed or is controlled by another scope or resource rule. Refresh before retrying.".into());
    }
    let mut data = settings(Path::new(&current.path))?;
    let empty_packages: std::collections::HashSet<_> = data["packages"]
        .as_array()
        .into_iter()
        .flatten()
        .enumerate()
        .filter_map(|(index, package)| {
            (package
                .get("skills")
                .and_then(|rules| rules.as_array())
                .is_some_and(Vec::is_empty))
            .then_some(index)
        })
        .collect();
    let mut changed = false;
    for item in items {
        if item.enabled == request.enabled {
            continue;
        }
        let mut entries: Vec<String> = if let Some(index) = item.package_index {
            let pkg = data["packages"]
                .get_mut(index)
                .ok_or("Pi package settings changed.")?;
            if let Some(source) = pkg.as_str() {
                *pkg = serde_json::json!({"source":source});
            }
            pkg.get("skills")
                .map(|v| serde_json::from_value(v.clone()))
                .transpose()
                .map_err(|_| "Invalid package skills rules.")?
                .unwrap_or_default()
        } else {
            data.get("skills")
                .map(|v| serde_json::from_value(v.clone()))
                .transpose()
                .map_err(|_| "Invalid Pi skill rules.")?
                .unwrap_or_default()
        };
        let explicit_empty = item
            .package_index
            .is_some_and(|index| empty_packages.contains(&index));
        if request.enabled {
            entries.retain(|rule| !item.blocking_rules.contains(rule));
            let rule = if explicit_empty {
                item.rule_path.clone()
            } else {
                format!("+{}", item.rule_path)
            };
            if !entries.contains(&rule) {
                entries.push(rule);
            }
        } else {
            let rule = format!("-{}", item.rule_path);
            if !entries.contains(&rule) {
                entries.push(rule);
            }
        }
        validate_entries(&entries)?;
        if let Some(index) = item.package_index {
            data["packages"][index]["skills"] =
                serde_json::to_value(entries).map_err(|e| e.to_string())?;
        } else {
            data["skills"] = serde_json::to_value(entries).map_err(|e| e.to_string())?;
        }

        changed = true;
    }
    if !changed {
        return Ok(current);
    }
    write_settings(Path::new(&current.path), &data)?;
    let after = inspect(engine, &request.target)?;
    if files.iter().any(|file| {
        !after
            .skills
            .iter()
            .any(|item| &item.file == *file && item.enabled == request.enabled)
    }) {
        return Err("Pi settings was saved, but another rule still controls a selected skill. Refresh and review its settings.".into());
    }
    Ok(after)
}

pub(super) fn augment_observed(
    engine: &Engine,
    target: &Target,
    inventory: &mut Inventory,
    observed: Result<Snapshot, String>,
) {
    let snapshot = match observed {
        Ok(value) => value,
        Err(error) => {
            inventory.warnings.push(error);
            return;
        }
    };
    inventory.pi = Some(snapshot.clone());
    inventory.warnings.extend(snapshot.warnings);
    if let Some(agent) = inventory.agents.iter_mut().find(|agent| agent.id == "pi") {
        let native = if target.scope == "global" {
            PathBuf::from(snapshot.agent_directory).join("skills")
        } else {
            target
                .directory(&engine.home)
                .unwrap_or_default()
                .join(".pi/skills")
        };
        if native.to_string_lossy() != agent.path {
            agent
                .additional_paths
                .push(native.to_string_lossy().into_owned());
        }
    }
    for state in snapshot.skills.into_iter().filter(|item| item.in_scope) {
        if let Some(skill) = inventory
            .skills
            .iter_mut()
            .find(|skill| skill.name == state.name && skill.path == state.path)
        {
            if !skill.agents.iter().any(|id| id == "pi") {
                skill.agents.push("pi".into());
            }
            skill.pi_state = Some(state);
        } else {
            inventory.skills.push(Skill {
                source_type: None,
                plugin_name: None,
                name: state.name.clone(),
                path: state.path.clone(),
                agents: vec!["pi".into()],
                shared: false,
                source: None,
                source_url: None,
                description: state.description.clone(),
                issue: None,
                updateable: false,
                install_source: None,
                eve_locations: Vec::new(),
                cli_managed: false,
                cli_agents: Vec::new(),
                hermes_origin: None,
                hermes_state: None,
                pi_state: Some(state),
                dsh_state: None,
                codex_state: None,
            });
        }
    }
}

#[tauri::command]
pub async fn upstream_pi_settings(app: AppHandle, target: Target) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        native::reconcile(&Engine::from_app(&app)?, &target)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_pi_validate_directories(
    app: AppHandle,
    target: Target,
    paths: Vec<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_entries(&paths)?;
        let engine = Engine::from_app(&app)?;
        let directory = target.directory(&engine.home)?;
        let settings_path = if target.scope == "project" {
            directory.join(".pi/settings.json")
        } else {
            agent_directory(&engine)?.join("settings.json")
        };
        for path in paths {
            validate_directory(&engine.home, &settings_path, &path)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_pi_save(
    app: AppHandle,
    change: Change,
    builtins: Option<inventory::BuiltinChange>,
) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        save_with_builtins(&Engine::from_app(&app)?, change, builtins)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_pi_toggle(app: AppHandle, request: Toggle) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        toggle(&Engine::from_app(&app)?, request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn upstream_pi_toggle_batch(
    app: AppHandle,
    request: BatchToggle,
) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        toggle_batch(&Engine::from_app(&app)?, request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::tests::{engine as base_engine, global};
    fn engine(home: &Path) -> Engine {
        let engine = base_engine(home);
        let path = home.join(".pi/agent/trust.json");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            path,
            serde_json::to_vec(
                &serde_json::json!({dunce::canonicalize(home.parent().unwrap()).unwrap().to_string_lossy().to_string():true}),
            )
            .unwrap(),
        )
        .unwrap();
        engine
    }
    fn skill(root: &Path, name: &str) -> PathBuf {
        let directory = root.join(name);
        fs::create_dir_all(&directory).unwrap();
        let file = directory.join("SKILL.md");
        fs::write(
            &file,
            format!("---\nname: {name}\ndescription: Pi fixture\n---\nOriginal bytes\n"),
        )
        .unwrap();
        file
    }
    fn flip(
        engine: &Engine,
        snapshot: Snapshot,
        name: &str,
        enabled: bool,
    ) -> Result<Snapshot, String> {
        let file = snapshot
            .skills
            .iter()
            .find(|item| item.name == name)
            .unwrap()
            .file
            .clone();
        toggle(
            engine,
            Toggle {
                target: snapshot.target,
                file,
                dependencies: snapshot.dependencies,
                enabled,
            },
        )
    }
    #[cfg(unix)]
    #[test]
    #[ignore = "requires SKILLS_SPACE_PI_TEST_INSTALL; isolated configuration writes only"]
    fn original_pi_codemode_global_project_and_restart_round_trip() {
        let install = PathBuf::from(std::env::var("SKILLS_SPACE_PI_TEST_INSTALL").unwrap());
        let metadata: serde_json::Value =
            serde_json::from_slice(&fs::read(install.join("package.json")).unwrap()).unwrap();
        let version = metadata["version"].as_str().unwrap();
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        fs::create_dir_all(&home).unwrap();
        let e = engine(&home);
        let agent = home.join(".pi/agent");
        let release = agent.join(format!(
            "install/releases/{version}/node_modules/@earendil-works"
        ));
        fs::create_dir_all(&release).unwrap();
        std::os::unix::fs::symlink(&install, release.join("pi-coding-agent")).unwrap();
        fs::write(agent.join("install/current-version"), version).unwrap();
        let config = agent.join("settings.json");
        let original = serde_json::json!({"defaultTools":["-bash","+custom"],"codemode":{"future":true},"extensions":["-builtin:codemode","./private.js"],"future":{"preserved":true}});
        write_settings(&config, &original).unwrap();
        let before = inspect(&e, &global()).unwrap();
        assert_eq!(before.codemode.as_ref().unwrap()["startupEnabled"], false);
        assert_eq!(before.codemode.as_ref().unwrap()["extensionEnabled"], false);
        let saved = save(
            &e,
            Change {
                target: global(),
                revision: before.revision.clone(),
                entries: before.entries.clone(),
                skill_commands: before.skill_commands,
                codemode: Some(
                    serde_json::json!({"startupEnabled":true,"mode":"only","inlineBudget":0}),
                ),
            },
        )
        .unwrap();
        assert_eq!(saved.codemode.as_ref().unwrap()["startupEnabled"], true);
        assert_eq!(saved.codemode.as_ref().unwrap()["inlineBudget"], 0);
        let global_bytes = fs::read(&config).unwrap();
        let data = settings(&config).unwrap();
        for key in ["extensions", "future"] {
            assert_eq!(data[key], original[key]);
        }
        assert_eq!(
            data["defaultTools"],
            serde_json::json!(["-bash", "+custom", "+codemode"])
        );
        assert!(save(
            &e,
            Change {
                target: global(),
                revision: before.revision,
                entries: before.entries,
                skill_commands: before.skill_commands,
                codemode: Some(serde_json::json!({"startupEnabled":false}))
            }
        )
        .unwrap_err()
        .contains("changed outside"));
        let project = home.join("project");
        fs::create_dir_all(project.join(".pi")).unwrap();
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into_owned()),
        };
        write_settings(&project.join(".pi/settings.json"),&serde_json::json!({"defaultTools":["-read"],"codemode":{"mode":"on","inlineBudget":123,"future":7}})).unwrap();
        let before = inspect(&e, &target).unwrap();
        let code = before.codemode.as_ref().unwrap();
        assert_eq!(code["startupEnabled"], true);
        assert_eq!(code["inheritedMode"], "only");
        assert_eq!(code["inheritedInlineBudget"], 0);
        save(
            &e,
            Change {
                target: target.clone(),
                revision: before.revision,
                entries: before.entries,
                skill_commands: before.skill_commands,
                codemode: Some(
                    serde_json::json!({"startupEnabled":false,"mode":null,"inlineBudget":null}),
                ),
            },
        )
        .unwrap();
        let restarted = inspect(&engine(&home), &target).unwrap();
        let code = restarted.codemode.unwrap();
        assert_eq!(code["startupEnabled"], false);
        assert!(code["mode"].is_null());
        assert!(code["inlineBudget"].is_null());
        let local = settings(&project.join(".pi/settings.json")).unwrap();
        assert_eq!(
            local["defaultTools"],
            serde_json::json!(["-read", "-codemode"])
        );
        assert_eq!(local["codemode"], serde_json::json!({"future":7}));
        assert_eq!(fs::read(&config).unwrap(), global_bytes);
        // Pi replaces with plain names; an empty project list appends to inherited modifiers.
        for (tools, expected) in [
            (serde_json::json!(["read"]), false),
            (serde_json::json!([]), true),
            (serde_json::json!(["codemode", "custom"]), true),
        ] {
            write_settings(
                &project.join(".pi/settings.json"),
                &serde_json::json!({"defaultTools":tools}),
            )
            .unwrap();
            let before = inspect(&e, &target).unwrap();
            assert_eq!(
                before.codemode.as_ref().unwrap()["startupEnabled"],
                expected
            );
            if tools.as_array().unwrap().is_empty() {
                let other_tools: Vec<_> = before.codemode.as_ref().unwrap()["startupTools"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|tool| *tool != "codemode")
                    .cloned()
                    .collect();
                save(
                    &e,
                    Change {
                        target: target.clone(),
                        revision: before.revision,
                        entries: before.entries,
                        skill_commands: before.skill_commands,
                        codemode: Some(serde_json::json!({"startupEnabled":false})),
                    },
                )
                .unwrap();
                let code = inspect(&e, &target).unwrap().codemode.unwrap();
                assert_eq!(code["startupEnabled"], false);
                assert_eq!(code["startupTools"], serde_json::json!(other_tools));
            }
        }
    }
    #[test]
    fn codemode_patch_preserves_native_settings_and_supports_zero_and_inheritance() {
        let original = serde_json::json!({"defaultTools":["-bash","+custom","-codemode"],"codemode":{"mode":"on","inlineBudget":3000,"future":true},"extensions":["-builtin:codemode","./private.js"],"packages":["npm:demo"],"future":"preserved"});
        let mut data = original.clone();
        update_codemode(
            &mut data,
            &serde_json::json!({"startupEnabled":true,"mode":"only","inlineBudget":0}),
        )
        .unwrap();
        assert_eq!(
            data["defaultTools"],
            serde_json::json!(["-bash", "+custom", "+codemode"])
        );
        assert_eq!(
            data["codemode"],
            serde_json::json!({"mode":"only","inlineBudget":0,"future":true})
        );
        for key in ["extensions", "packages", "future"] {
            assert_eq!(data[key], original[key]);
        }
        update_codemode(
            &mut data,
            &serde_json::json!({"mode":null,"inlineBudget":null}),
        )
        .unwrap();
        assert_eq!(data["codemode"], serde_json::json!({"future":true}));
        assert_eq!(
            data["defaultTools"],
            serde_json::json!(["-bash", "+custom", "+codemode"])
        );
        for (before, enabled, expected) in [
            (
                serde_json::json!({}),
                true,
                serde_json::json!(["+codemode"]),
            ),
            (
                serde_json::json!({}),
                false,
                serde_json::json!(["-codemode"]),
            ),
            (
                serde_json::json!({"defaultTools":[]}),
                true,
                serde_json::json!(["codemode"]),
            ),
            (
                serde_json::json!({"defaultTools":[]}),
                false,
                serde_json::json!([]),
            ),
            (
                serde_json::json!({"defaultTools":["read","custom","codemode"]}),
                false,
                serde_json::json!(["read", "custom"]),
            ),
            (
                serde_json::json!({"defaultTools":["read","custom"]}),
                true,
                serde_json::json!(["read", "custom", "codemode"]),
            ),
        ] {
            let mut data = before;
            update_codemode(&mut data, &serde_json::json!({"startupEnabled":enabled})).unwrap();
            assert_eq!(data["defaultTools"], expected);
        }
        for invalid in [
            serde_json::json!({"mode":"auto"}),
            serde_json::json!({"inlineBudget":-1}),
            serde_json::json!({"inlineBudget":"3000"}),
            serde_json::json!({"enabled":true}),
            serde_json::json!({"startupEnabled":"yes"}),
        ] {
            assert!(update_codemode(&mut serde_json::json!({}), &invalid).is_err());
        }
    }
    #[test]
    fn shared_skill_toggle_persists_without_mutating_skill_or_other_settings() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let file = skill(&home.join(".agents/skills"), "shared-demo");
        let bytes = fs::read(&file).unwrap();
        let e = engine(&home);
        let config = home.join(".pi/agent/settings.json");
        fs::create_dir_all(config.parent().unwrap()).unwrap();
        let original = serde_json::json!({"defaultModel":"keep-model","future":{"nested":[1,2]},"packages":[{"source":"./missing","extensions":["one.ts"]}]});
        write_settings(&config, &original).unwrap();
        let before = inspect(&e, &global()).unwrap();
        assert!(before.skills[0].cli_addressable);
        let disabled = flip(&e, before, "shared-demo", false).unwrap();
        assert!(!disabled.skills[0].enabled);
        let restarted = inspect(&e, &global()).unwrap();
        assert!(!restarted.skills[0].enabled);
        let enabled = flip(&e, restarted, "shared-demo", true).unwrap();
        assert!(enabled.skills[0].enabled);
        assert_eq!(fs::read(file).unwrap(), bytes);
        let after = settings(&config).unwrap();
        for key in ["defaultModel", "future", "packages"] {
            assert_eq!(after[key], original[key]);
        }
        assert!(!PathBuf::from(format!("{}.lock", config.display())).exists());
        let inventory = e.inventory(&global()).unwrap();
        assert_eq!(
            inventory
                .skills
                .iter()
                .filter(|s| s.name == "shared-demo")
                .count(),
            1
        );
    }
    #[test]
    fn directory_validation_resolves_home_and_settings_relative_paths() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let config = home.join(".pi/agent/settings.json");
        fs::create_dir_all(config.parent().unwrap().join("relative")).unwrap();
        fs::create_dir_all(home.join("extra")).unwrap();
        let file = home.join("ordinary.txt");
        fs::write(&file, "not a directory").unwrap();
        for value in ["~", "~/extra", "relative", "../agent/relative"] {
            validate_directory(&home, &config, value).unwrap();
        }
        for value in ["~/missing", "~/ordinary.txt", "!relative", "relative/*"] {
            assert!(validate_directory(&home, &config, value)
                .unwrap_err()
                .contains("directory is unavailable"));
        }
        let project_config = root.0.join("project/.pi/settings.json");
        fs::create_dir_all(project_config.parent().unwrap().join("relative")).unwrap();
        validate_directory(&home, &project_config, "relative").unwrap();
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(home.join("extra"), home.join("alias")).unwrap();
            validate_directory(&home, &config, "~/alias").unwrap();
        }
    }

    #[test]
    fn save_rechecks_new_directories_without_blocking_unchanged_native_entries() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        fs::create_dir_all(&home).unwrap();
        let e = engine(&home);
        let config = home.join(".pi/agent/settings.json");
        let original =
            serde_json::json!({"skills":["missing-old", "single.md", "!draft/**"], "future":true});
        write_settings(&config, &original).unwrap();
        let before = inspect(&e, &global()).unwrap();
        let bytes = fs::read(&config).unwrap();
        let extra = home.join("extra");
        fs::create_dir_all(&extra).unwrap();
        // The folder existed when added, but was removed before Save.
        validate_directory(&home, &config, "~/extra").unwrap();
        fs::remove_dir(&extra).unwrap();
        let mut entries = before.entries.clone();
        entries.push("~/extra".into());
        assert!(save(
            &e,
            Change {
                codemode: None,
                target: global(),
                revision: before.revision.clone(),
                entries: entries.clone(),
                skill_commands: Some(false)
            }
        )
        .unwrap_err()
        .contains("directory is unavailable"));
        assert_eq!(fs::read(&config).unwrap(), bytes);
        fs::create_dir(&extra).unwrap();
        save(
            &e,
            Change {
                codemode: None,
                target: global(),
                revision: before.revision,
                entries: entries.clone(),
                skill_commands: Some(false),
            },
        )
        .unwrap();
        assert_eq!(inspect(&e, &global()).unwrap().entries, entries);
        assert_eq!(settings(&config).unwrap()["future"], true);
        assert!(!PathBuf::from(format!("{}.lock", config.display())).exists());
    }

    #[test]
    fn directory_rules_round_trip_and_reject_stale_malformed_and_locked_writes() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        fs::create_dir_all(&home).unwrap();
        let extra = root.0.join("extra");
        let file = skill(&extra, "extra-demo");
        let bytes = fs::read(&file).unwrap();
        let e = engine(&home);
        let before = inspect(&e, &global()).unwrap();
        let changed = save(
            &e,
            Change {
                codemode: None,
                skill_commands: None,
                target: global(),
                revision: before.revision,
                entries: vec![extra.to_string_lossy().into_owned(), "!extra-*".into()],
            },
        )
        .unwrap();
        assert!(!changed.skills[0].enabled);
        assert!(!changed.skills[0].cli_addressable);
        let inventory = e.inventory(&global()).unwrap();
        assert!(inventory
            .skills
            .iter()
            .any(|s| s.name == "extra-demo" && s.agents.contains(&"pi".into())));
        let stale = changed.revision.clone();
        let config = Path::new(&changed.path);
        let mut data = settings(config).unwrap();
        data["externalEdit"] = true.into();
        write_settings(config, &data).unwrap();
        let preserved = fs::read(config).unwrap();
        assert!(save(
            &e,
            Change {
                codemode: None,
                skill_commands: None,
                target: global(),
                revision: stale,
                entries: vec![]
            }
        )
        .unwrap_err()
        .contains("changed outside"));
        assert_eq!(fs::read(config).unwrap(), preserved);
        let current = inspect(&e, &global()).unwrap();
        let _lock = SettingsLock::acquire(config).unwrap();
        assert!(save(
            &e,
            Change {
                codemode: None,
                skill_commands: None,
                target: global(),
                revision: current.revision,
                entries: vec![]
            }
        )
        .unwrap_err()
        .contains("being edited"));
        drop(_lock);
        fs::write(config, "{invalid PRIVATE_TOKEN_VALUE").unwrap();
        let error = inspect(&e, &global()).err().unwrap();
        assert!(!error.contains("PRIVATE_TOKEN_VALUE"));
        assert_eq!(fs::read(file).unwrap(), bytes);
    }
    #[test]
    fn project_rules_do_not_modify_global_settings_or_import_global_inventory() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let global_file = skill(&home.join(".agents/skills"), "global-demo");
        let project = root.0.join("project");
        let local_file = skill(&project.join(".agents/skills"), "project-demo");
        fs::create_dir_all(project.join(".git")).unwrap();
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into_owned()),
        };
        let e = engine(&home);
        let before = inspect(&e, &target).unwrap();
        let global = before
            .skills
            .iter()
            .find(|s| s.name == "global-demo")
            .unwrap();
        assert!(!global.can_toggle);
        let disabled = flip(&e, before, "project-demo", false).unwrap();
        assert!(
            !disabled
                .skills
                .iter()
                .find(|s| s.name == "project-demo")
                .unwrap()
                .enabled
        );
        assert!(!home.join(".pi/agent/settings.json").exists());
        assert!(global_file.exists() && local_file.exists());
        let inventory = e.inventory(&target).unwrap();
        assert!(!inventory.skills.iter().any(|s| s.name == "global-demo"));
    }
    #[test]
    fn project_inventory_excludes_inherited_home_and_parent_installations() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        skill(&home.join(".agents/skills"), "global-demo");
        let parent = home.join("workspace");
        skill(&parent.join(".agents/skills"), "ancestor-demo");
        let project = parent.join("project");
        skill(&project.join(".agents/skills"), "project-demo");
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into_owned()),
        };
        let e = engine(&home);
        let snapshot = inspect(&e, &target).unwrap();
        for name in ["global-demo", "ancestor-demo"] {
            let inherited = snapshot.skills.iter().find(|s| s.name == name).unwrap();
            assert!(inherited.enabled);
            assert!(!inherited.in_scope && !inherited.cli_addressable && !inherited.can_trash);
        }
        let inventory = e.inventory(&target).unwrap();
        assert!(inventory.skills.iter().any(|s| s.name == "project-demo"));
        assert!(!inventory
            .skills
            .iter()
            .any(|s| s.name == "global-demo" || s.name == "ancestor-demo"));
        assert!(e
            .inventory(&global())
            .unwrap()
            .skills
            .iter()
            .any(|s| s.name == "global-demo"));
    }
    #[test]
    fn batch_toggle_validates_all_paths_and_preserves_unselected_package_skills() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let package = home.join(".pi/agent/local-package");
        let alpha = skill(&package.join("skills"), "package-alpha");
        let beta = skill(&package.join("skills"), "package-beta");
        let gamma = skill(&package.join("skills"), "package-gamma");
        let native = skill(&home.join(".pi/agent/skills"), "native");
        let originals: Vec<_> = [&alpha, &beta, &gamma, &native]
            .iter()
            .map(|file| fs::read(file).unwrap())
            .collect();
        let e = engine(&home);
        let config = home.join(".pi/agent/settings.json");
        write_settings(&config, &serde_json::json!({"future":true,"packages":[{"source":"./local-package","skills":[],"extensions":["extension.ts"]}]})).unwrap();
        let before = inspect(&e, &global()).unwrap();
        let files: Vec<_> = before
            .skills
            .iter()
            .filter(|item| item.name != "package-gamma")
            .map(|item| item.file.clone())
            .collect();
        assert_eq!(files.len(), 3);
        let bytes = fs::read(&config).unwrap();
        let mut invalid = files.clone();
        invalid.push(home.join("missing/SKILL.md").to_string_lossy().into_owned());
        assert!(toggle_batch(
            &e,
            BatchToggle {
                target: global(),
                files: invalid,
                dependencies: before.dependencies.clone(),
                enabled: true
            }
        )
        .is_err());
        assert_eq!(fs::read(&config).unwrap(), bytes);
        let enabled = toggle_batch(
            &e,
            BatchToggle {
                target: global(),
                files: files.clone(),
                dependencies: before.dependencies.clone(),
                enabled: true,
            },
        )
        .unwrap();
        assert!(enabled
            .skills
            .iter()
            .all(|item| item.enabled == (item.name != "package-gamma")));
        let bytes = fs::read(&config).unwrap();
        assert!(toggle_batch(
            &e,
            BatchToggle {
                target: global(),
                files: files.clone(),
                dependencies: before.dependencies,
                enabled: false
            }
        )
        .is_err());
        assert_eq!(fs::read(&config).unwrap(), bytes);
        let disabled = toggle_batch(
            &e,
            BatchToggle {
                target: global(),
                files,
                dependencies: enabled.dependencies,
                enabled: false,
            },
        )
        .unwrap();
        assert!(disabled.skills.iter().all(|item| !item.enabled));
        let saved = settings(&config).unwrap();
        assert_eq!(saved["future"], true);
        assert_eq!(
            saved["packages"][0]["extensions"],
            serde_json::json!(["extension.ts"])
        );
        for (index, file) in [&alpha, &beta, &gamma, &native].iter().enumerate() {
            assert_eq!(fs::read(file).unwrap(), originals[index]);
        }
    }
    #[test]
    fn enabling_one_explicitly_disabled_package_skill_does_not_enable_the_package() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let package = home.join(".pi/agent/local-package");
        skill(&package.join("skills"), "package-alpha");
        skill(&package.join("skills"), "package-beta");
        let e = engine(&home);
        let config = home.join(".pi/agent/settings.json");
        write_settings(&config,&serde_json::json!({"packages":[{"source":"./local-package","skills":[],"extensions":["extension.ts"],"future":true}]})).unwrap();
        let before = inspect(&e, &global()).unwrap();
        assert!(before.skills.iter().all(|s| !s.enabled));
        let after = flip(&e, before, "package-alpha", true).unwrap();
        assert!(
            after
                .skills
                .iter()
                .find(|s| s.name == "package-alpha")
                .unwrap()
                .enabled
        );
        assert!(
            !after
                .skills
                .iter()
                .find(|s| s.name == "package-beta")
                .unwrap()
                .enabled
        );
        let data = settings(&config).unwrap();
        assert_eq!(
            data["packages"][0]["extensions"],
            serde_json::json!(["extension.ts"])
        );
        assert_eq!(data["packages"][0]["future"], true);
    }
    #[test]
    fn ignore_files_cycles_aliases_and_name_precedence_match_pi_resource_rules() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let own = home.join(".pi/agent/skills");
        let shared = home.join(".agents/skills");
        skill(&own, "winner");
        skill(&own, "ignored");
        fs::write(own.join(".fdignore"), "ignored/\n").unwrap();
        let alternate = skill(&shared, "alternate");
        fs::write(
            alternate,
            "---\nname: winner\ndescription: Shadowed copy\n---\n",
        )
        .unwrap();
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&own, own.join("cycle")).unwrap();
            std::os::unix::fs::symlink(own.join("winner"), shared.join("alias")).unwrap();
        }
        let snapshot = inspect(&engine(&home), &global()).unwrap();
        assert!(!snapshot.skills.iter().any(|s| s.name == "ignored"));
        assert_eq!(
            snapshot
                .skills
                .iter()
                .filter(|s| s.name == "winner")
                .count(),
            2
        );
        assert!(snapshot
            .skills
            .iter()
            .any(|s| s.reason.as_deref() == Some("shadowed")));
    }
    #[test]
    fn copied_or_linked_skill_remains_installed_and_extra_path_cannot_be_uninstalled_by_cli() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let extra = root.0.join("extra");
        skill(&extra, "protected");
        fs::create_dir_all(&home).unwrap();
        let e = engine(&home);
        let snap = inspect(&e, &global()).unwrap();
        let snap = save(
            &e,
            Change {
                codemode: None,
                skill_commands: None,
                target: global(),
                revision: snap.revision,
                entries: vec![extra.to_string_lossy().into_owned()],
            },
        )
        .unwrap();
        let _ = flip(&e, snap, "protected", false).unwrap();
        let inventory = e.inventory(&global()).unwrap();
        let op = Operation {
            dsh_context_key: None,
            target: global(),
            action: "remove".into(),
            skills: vec!["protected".into()],
            agents: vec!["pi".into()],
            source: None,
            copy: false,
            include_internal: false,
            source_hashes: None,
            removals: None,
            removal_source: None,
            inspection_session: None,
            sync_origin: None,
            eve_subagents: Vec::new(),
        };
        assert!(removal_plan(&e, &op, &inventory)
            .unwrap_err()
            .contains("outside the upstream CLI"));
        assert!(extra.join("protected/SKILL.md").exists());
    }
    #[test]
    fn original_cli_copy_and_link_installs_can_toggle_and_uninstall_without_lifecycle_changes() {
        for copy in [false, true] {
            let root = TemporaryDirectory::new().unwrap();
            let home = root.0.join("home");
            fs::create_dir_all(home.join(".pi/agent")).unwrap();
            let source = root.0.join("source");
            skill(&source, "fixture-skill");
            let source = source.join("fixture-skill");
            let e = engine(&home);
            let mut add = crate::upstream::tests::addition(&source, global(), copy);
            add.agents = vec!["pi".into()];
            let installed = apply(&e, &add).unwrap();
            assert!(
                installed.items.iter().all(|item| item.status == "complete"),
                "{}",
                installed.logs
            );
            let snapshot = inspect(&e, &global()).unwrap();
            let state = snapshot
                .skills
                .iter()
                .find(|s| s.name == "fixture-skill")
                .unwrap();
            let file = state.file.clone();
            let original = fs::read(&file).unwrap();
            let disabled = flip(&e, snapshot, "fixture-skill", false).unwrap();
            assert!(
                !disabled
                    .skills
                    .iter()
                    .find(|s| s.name == "fixture-skill")
                    .unwrap()
                    .enabled
            );
            assert_eq!(fs::read(&file).unwrap(), original);
            let inventory = e.inventory(&global()).unwrap();
            assert!(inventory.skills.iter().any(|s| s.name == "fixture-skill"));
            let mut remove = add;
            remove.action = "remove".into();
            remove.source = None;
            remove.removals = Some(removal_plan(&e, &remove, &inventory).unwrap());
            let result = apply(&e, &remove).unwrap();
            assert!(
                result.items.iter().all(|item| item.status == "complete"),
                "{}",
                result.logs
            );
            assert!(!Path::new(&file).exists());
            assert!(source.join("SKILL.md").exists());
        }
    }
    #[test]
    fn skill_command_completion_preserves_unknown_settings_and_project_inheritance() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        fs::create_dir_all(&home).unwrap();
        let e = engine(&home);
        let global_path = home.join(".pi/agent/settings.json");
        write_settings(
            &global_path,
            &serde_json::json!({"enableSkillCommands":false,"future":{"keep":1}}),
        )
        .unwrap();
        let before = inspect(&e, &global()).unwrap();
        assert_eq!(before.skill_commands, Some(false));
        let after = save(
            &e,
            Change {
                codemode: None,
                target: global(),
                revision: before.revision,
                entries: vec![],
                skill_commands: Some(true),
            },
        )
        .unwrap();
        assert_eq!(after.skill_commands, Some(true));
        assert_eq!(settings(&global_path).unwrap()["future"]["keep"], 1);
        let project = root.0.join("project");
        fs::create_dir_all(&project).unwrap();
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into()),
        };
        let before = inspect(&e, &target).unwrap();
        assert!(before.inherited_skill_commands);
        assert_eq!(before.skill_commands, None);
        let after = save(
            &e,
            Change {
                codemode: None,
                target: target.clone(),
                revision: before.revision,
                entries: vec![],
                skill_commands: Some(false),
            },
        )
        .unwrap();
        assert_eq!(after.skill_commands, Some(false));
        let inherited = save(
            &e,
            Change {
                codemode: None,
                target,
                revision: after.revision,
                entries: vec![],
                skill_commands: None,
            },
        )
        .unwrap();
        assert_eq!(inherited.skill_commands, None);
        assert!(inherited.inherited_skill_commands);
        assert_eq!(settings(&global_path).unwrap()["enableSkillCommands"], true);
    }
    #[test]
    fn project_trust_is_read_only_and_invalidates_reviewed_actions() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let file = skill(&home.join(".pi/agent/skills"), "global");
        let e = engine(&home);
        let project = root.0.join("project");
        skill(&project.join(".pi/skills"), "local");
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into()),
        };
        let before = inspect(&e, &target).unwrap();
        assert!(before.skills.iter().any(|s| s.name == "local"));
        let trust = home.join(".pi/agent/trust.json");
        write_settings(&trust, &serde_json::json!({dunce::canonicalize(&project).unwrap().to_string_lossy().to_string():false})).unwrap();
        let bytes = fs::read(&trust).unwrap();
        let after = inspect(&e, &target).unwrap();
        assert!(after.skills.iter().any(|s| s.name == "local" && s.in_scope));
        assert!(!after.project_trusted);
        assert!(after
            .skills
            .iter()
            .any(|s| s.name == "global" && !s.in_scope));
        assert_eq!(fs::read(&trust).unwrap(), bytes);
        assert!(toggle(
            &e,
            Toggle {
                target,
                file: file.to_string_lossy().into(),
                dependencies: before.dependencies,
                enabled: false
            }
        )
        .is_err());
        assert!(!fs::read_to_string(file)
            .unwrap()
            .contains("disable-model-invocation"));
    }
    #[test]
    fn explicit_project_trust_preserves_other_entries_and_detects_stale_writes() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let project = root.0.join("project");
        let file = skill(&project.join(".pi/skills"), "local");
        let source = fs::read(&file).unwrap();
        let e = engine(&home);
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into()),
        };
        let path = home.join(".pi/agent/trust.json");
        write_settings(
            &path,
            &serde_json::json!({"/other":true,"/other/child":null}),
        )
        .unwrap();
        let before = inspect(&e, &target).unwrap();
        assert!(!before.project_trusted);
        let saved = save_trust(
            &e,
            TrustChange {
                target: target.clone(),
                revision: before.trust_revision.clone(),
                trusted: true,
            },
        )
        .unwrap();
        assert!(saved.project_trusted && saved.project_trust_decision);
        let data = settings(&path).unwrap();
        assert_eq!(data["/other"], true);
        assert!(data["/other/child"].is_null());
        assert!(save_trust(
            &e,
            TrustChange {
                target: target.clone(),
                revision: before.trust_revision,
                trusted: false
            }
        )
        .unwrap_err()
        .contains("changed"));
        let restarted = base_engine(&home);
        assert!(inspect(&restarted, &target).unwrap().project_trusted);
        let saved = save_trust(
            &restarted,
            TrustChange {
                target: target.clone(),
                revision: saved.trust_revision,
                trusted: false,
            },
        )
        .unwrap();
        assert!(!saved.project_trusted && !saved.project_trust_decision);
        let bytes = fs::read(&path).unwrap();
        {
            let _lock = SettingsLock::acquire(&path).unwrap();
            assert!(save_trust(
                &e,
                TrustChange {
                    target: target.clone(),
                    revision: saved.trust_revision.clone(),
                    trusted: true
                }
            )
            .is_err());
        }
        assert_eq!(fs::read(&path).unwrap(), bytes);
        fs::write(&path, b"{broken").unwrap();
        assert!(save_trust(
            &e,
            TrustChange {
                target,
                revision: saved.trust_revision,
                trusted: true
            }
        )
        .is_err());
        assert_eq!(fs::read(&path).unwrap(), b"{broken");
        assert_eq!(fs::read(file).unwrap(), source);
        assert!(!project.join(".pi/settings.json").exists());
        assert!(!project.join("skills-lock.json").exists());
    }
}
