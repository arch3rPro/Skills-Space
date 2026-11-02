use super::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RulesRequest {
    pub(super) target: Target,
    pub(super) revision: String,
    pub(super) rules: Vec<Value>,
    pub(super) base_rules: Option<Vec<Value>>,
}
fn selector(rule: &Value) -> Option<(bool, String)> {
    match (
        rule.get("path").and_then(Value::as_str),
        rule.get("name").and_then(Value::as_str),
    ) {
        (Some(path), None) if Path::new(path).is_absolute() => {
            Some((true, identity(Path::new(path)).to_string_lossy().into()))
        }
        (None, Some(name)) if !name.trim().is_empty() => Some((false, name.trim().into())),
        _ => None,
    }
}
fn protected(rule: &Value, skills: &[NativeSkill]) -> bool {
    let Some((path, value)) = selector(rule) else {
        return true;
    };
    skills.iter().any(|skill| {
        (if path {
            skill.state.document_path == value
        } else {
            skill.name == value
        }) && skill.state.runtime_scope == "admin"
    })
}
fn validate_rules(before: &[Value], after: &[Value], snapshot: &Snapshot) -> Result<(), String> {
    if after.len() > 2000 {
        return Err("Too many Codex skill rules.".into());
    }
    let preserved: Vec<_> = before
        .iter()
        .filter(|rule| protected(rule, &snapshot.skills))
        .collect();
    let retained: Vec<_> = after
        .iter()
        .filter(|rule| protected(rule, &snapshot.skills))
        .collect();
    if preserved != retained {
        return Err("Read-only Codex rules must retain their relative order and value.".into());
    }
    for rule in after {
        if before.contains(rule) {
            continue;
        }
        let Some((path, value)) = selector(rule) else {
            return Err("Choose exactly one skill name or absolute SKILL.md path.".into());
        };
        if rule["enabled"].as_bool().is_none() {
            return Err("A skill rule requires an enabled value.".into());
        }
        if path && Path::new(&value).file_name().and_then(|s| s.to_str()) != Some("SKILL.md") {
            return Err("A path rule must reference SKILL.md, not its folder.".into());
        }
        if !path && !snapshot.capabilities.name_rules {
            return Err("This Codex interface does not support name rules.".into());
        }
        if protected(rule, &snapshot.skills) {
            return Err("Administrator skill rules are read-only.".into());
        }
    }
    Ok(())
}
pub(super) fn save_rules(engine: &Engine, request: RulesRequest) -> Result<Snapshot, String> {
    if request.target.host != "local" || request.target.scope != "global" {
        return Err("Skill rule settings require local user scope.".into());
    }
    let mut before = inspect_skills(engine, &request.target)?;
    if !before.capabilities.write_config {
        return Err("This Codex interface cannot safely write skill rules.".into());
    }
    if before.revision != request.revision && request.base_rules.as_ref() != Some(&before.rules) {
        return Err(
            "Codex configuration changed. Reload before saving; your draft has been retained."
                .into(),
        );
    }
    validate_rules(&before.rules, &request.rules, &before)?;
    let cwd = request.target.directory(&engine.home)?;
    let mut session = Session::start(engine, Path::new(&before.binary), &cwd)?;
    session.call("config/value/write", json!({"keyPath":"skills.config","value":request.rules,"mergeStrategy":"replace","expectedVersion":before.revision}))?;
    let config = read_config(&mut session, &cwd)?;
    let layer = user_layer(&config)?;
    before.rules = layer["config"]["skills"]["config"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    before.revision = layer["version"]
        .as_str()
        .ok_or("Configuration version missing")?
        .into();
    before.skills = list_skills(&mut session, &cwd)?.0;
    if before.rules != request.rules {
        return Err("Codex saved configuration but the rules could not be verified. Reload actual settings.".into());
    }
    Ok(before)
}
#[tauri::command]
pub async fn upstream_codex_save_rules(
    app: AppHandle,
    request: RulesRequest,
) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        save_rules(&Engine::from_app(&app)?, request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn removing_an_override_preserves_opaque_rules_without_blocking_on_index_shifts() {
        let snapshot = Snapshot {
            context_id: None,
            binary: String::new(),
            version: String::new(),
            codex_home: String::new(),
            config_path: String::new(),
            revision: String::new(),
            unavailable_reason: None,
            plugins_complete: true,
            catalog_requested: false,
            rules: vec![],
            skills: vec![],
            plugins: vec![],
            warnings: vec![],
            capabilities: Capabilities {
                write_config: true,
                name_rules: true,
                ..Capabilities::default()
            },
        };
        let editable = json!({"name":"standalone","enabled":false});
        let opaque = json!({"futureSelector":"system","enabled":false});
        assert!(validate_rules(
            &[editable.clone(), opaque.clone()],
            std::slice::from_ref(&opaque),
            &snapshot
        )
        .is_ok());
        assert!(
            validate_rules(&[editable.clone(), opaque.clone()], &[editable], &snapshot).is_err()
        );
        assert!(validate_rules(
            std::slice::from_ref(&opaque),
            &[json!({"futureSelector":"changed","enabled":false})],
            &snapshot
        )
        .is_err());
    }
}

// Same ordered exact-name/canonical-path rule semantics as codex-config skills_config.rs.
// Used for installed plugin skills absent from skills/list when their package is disabled.
pub(super) fn configured_enabled(rules: &Value, name: &str, document: &str) -> bool {
    rules
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|rule| {
            let (path, value) = selector(rule)?;
            ((path && value == identity(Path::new(document)).to_string_lossy())
                || (!path && value == name))
                .then(|| rule["enabled"].as_bool())
                .flatten()
        })
        .last()
        .unwrap_or(true)
}
