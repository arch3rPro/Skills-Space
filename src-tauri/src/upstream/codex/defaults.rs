//! User defaults only. The original server owns atomic, versioned TOML edits.
use super::*;

const FIELDS: [(&str, &str); 9] = [
    ("skillCatalogTokens", "skills.max_context_tokens"),
    ("bundledSkills", "skills.bundled.enabled"),
    ("skillDependencies", "features.skill_mcp_dependency_install"),
    ("pluginsEnabled", "plugins._default.enabled"),
    ("appsEnabled", "apps._default.enabled"),
    ("appsApproval", "apps._default.default_tools_approval_mode"),
    ("appsReviewer", "apps._default.approvals_reviewer"),
    ("appsDestructive", "apps._default.destructive_enabled"),
    ("appsOpenWorld", "apps._default.open_world_enabled"),
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldValue {
    value: Value,
    effective: Value,
    overridden: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Defaults {
    revision: String,
    config_path: String,
    writable: bool,
    fields: BTreeMap<String, FieldValue>,
    rules: Vec<Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Change {
    key: String,
    value: Value,
    base_value: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveRequest {
    revision: String,
    changes: Vec<Change>,
}

fn at<'a>(value: &'a Value, path: &str) -> &'a Value {
    path.split('.').fold(value, |value, key| &value[key])
}

fn snapshot(config: &Value, writable: bool) -> Result<Defaults, String> {
    let user = user_layer(config)?;
    let layers = config["layers"]
        .as_array()
        .ok_or("Codex configuration layers unavailable.")?;
    let fields = FIELDS
        .into_iter()
        .map(|(key, path)| {
            let overridden = layers
                .iter()
                .take_while(|layer| layer["name"]["type"] != "user")
                .any(|layer| {
                    layer["disabledReason"].is_null() && !at(&layer["config"], path).is_null()
                });
            (
                key.to_owned(),
                FieldValue {
                    value: at(&user["config"], path).clone(),
                    effective: at(&config["config"], path).clone(),
                    overridden,
                },
            )
        })
        .collect();
    let config_path = user["name"]["file"]
        .as_str()
        .filter(|path| Path::new(path).is_absolute())
        .ok_or("Codex user configuration path unavailable.")?
        .to_owned();
    Ok(Defaults {
        revision: user["version"]
            .as_str()
            .ok_or("Codex configuration version unavailable.")?
            .into(),
        config_path,
        writable: writable && user["disabledReason"].is_null(),
        fields,
        rules: user["config"]["skills"]["config"]
            .as_array()
            .cloned()
            .unwrap_or_default(),
    })
}

fn start(engine: &Engine) -> Result<(Session, bool), String> {
    let binary = binary(engine).ok_or("Codex CLI was not found.")?;
    let caps = inspect_capabilities(engine, &binary, &engine.home);
    let session = Session::start(engine, &binary, &engine.home)?;
    let home = engine.env_home("CODEX_HOME", ".codex");
    if session
        .codex_home
        .as_ref()
        .is_some_and(|actual| identity(actual) != identity(&home))
    {
        return Err("Codex returned a different configuration directory.".into());
    }
    Ok((session, caps.write_defaults))
}

fn inspect(engine: &Engine) -> Result<Defaults, String> {
    let (mut session, writable) = start(engine)?;
    snapshot(&read_config(&mut session, &engine.home)?, writable)
}

fn validate(change: &Change) -> Result<&'static str, String> {
    let path = FIELDS
        .iter()
        .find(|(key, _)| *key == change.key)
        .map(|(_, path)| *path)
        .ok_or("Unknown Codex default setting.")?;
    let valid = change.value.is_null()
        || match change.key.as_str() {
            "skillCatalogTokens" => change
                .value
                .as_u64()
                .is_some_and(|value| (1..=10000).contains(&value)),
            "appsApproval" => change
                .value
                .as_str()
                .is_some_and(|value| matches!(value, "auto" | "prompt" | "writes" | "approve")),
            "appsReviewer" => change
                .value
                .as_str()
                .is_some_and(|value| matches!(value, "user" | "auto_review")),
            _ => change.value.is_boolean(),
        };
    if !valid {
        return Err("Invalid Codex default setting value.".into());
    }
    Ok(path)
}

fn save(engine: &Engine, request: SaveRequest) -> Result<Defaults, String> {
    if request.changes.is_empty() || request.changes.len() > FIELDS.len() {
        return Err("Choose the Codex defaults to change.".into());
    }
    let mut keys = std::collections::BTreeSet::new();
    for change in &request.changes {
        validate(change)?;
        if !keys.insert(&change.key) {
            return Err("Duplicate Codex default setting.".into());
        }
    }
    let (mut session, writable) = start(engine)?;
    let config = read_config(&mut session, &engine.home)?;
    let before = snapshot(&config, writable)?;
    if !before.writable {
        return Err("Codex user defaults are read-only.".into());
    }
    let mut edits = Vec::new();
    for change in &request.changes {
        let path = validate(change)?;
        let field = &before.fields[&change.key];
        if before.revision != request.revision && field.value != change.base_value {
            return Err("These Codex defaults changed outside this window. Reload before saving; your draft is retained.".into());
        }
        edits.push(json!({"keyPath":path,"value":change.value,"mergeStrategy":"replace"}));
    }
    // Null deletes only this leaf. Never replace skills/plugins/apps tables.
    session.call(
        "config/batchWrite",
        json!({"edits":edits,"expectedVersion":before.revision}),
    )?;
    let after = snapshot(&read_config(&mut session, &engine.home)?, writable)?;
    if request
        .changes
        .iter()
        .any(|change| after.fields[&change.key].value != change.value)
    {
        return Err(
            "Codex defaults were written but could not be verified. Reload actual settings.".into(),
        );
    }
    Ok(after)
}

#[tauri::command]
pub async fn upstream_codex_defaults(app: AppHandle) -> Result<Defaults, String> {
    tauri::async_runtime::spawn_blocking(move || inspect(&Engine::from_app(&app)?))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn upstream_codex_save_defaults(
    app: AppHandle,
    request: SaveRequest,
) -> Result<Defaults, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|error| error.to_string())?;
        save(&Engine::from_app(&app)?, request)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::super::super::tests::engine;
    use super::*;

    fn change(before: &Defaults, key: &str, value: Value) -> Change {
        Change {
            key: key.into(),
            value,
            base_value: before.fields[key].value.clone(),
        }
    }

    #[test]
    fn only_approved_default_leaves_and_types_are_accepted() {
        let config = std::env::temp_dir().join("skills-space-defaults-fixture/config.toml");
        let before = snapshot(
            &json!({"layers":[{"name":{"type":"user","file":config},"version":"r","config":{}}]}),
            true,
        )
        .unwrap();
        for (key, value) in [
            ("skills.config", json!([])),
            ("appsEnabled", json!("false")),
            ("skillCatalogTokens", json!(0)),
            ("appsReviewer", json!("approve")),
            ("appsApproval", json!("never")),
        ] {
            let request = Change {
                key: key.into(),
                value,
                base_value: Value::Null,
            };
            assert!(validate(&request).is_err());
        }
        for key in before.fields.keys() {
            assert!(validate(&change(&before, key, Value::Null)).is_ok());
        }
    }

    #[cfg(unix)]
    fn fixture() -> (TemporaryDirectory, Engine, PathBuf) {
        let original = PathBuf::from(
            std::env::var_os("SKILLS_SPACE_CODEX_TEST_BINARY").expect("Select original Codex CLI"),
        );
        let fixture = TemporaryDirectory::new().unwrap();
        let home = fixture.0.join("home");
        fs::create_dir_all(home.join(".local/bin")).unwrap();
        fs::create_dir_all(home.join(".codex")).unwrap();
        std::os::unix::fs::symlink(original, home.join(".local/bin/codex")).unwrap();
        // A credential read would block; no real credentials are used.
        assert!(Command::new("mkfifo")
            .arg(home.join(".codex/auth.json"))
            .status()
            .unwrap()
            .success());
        let file = home.join(".codex/config.toml");
        fs::write(&file,"# preserve user formatting\nmodel = \"fixture\"\ncli_auth_credentials_store = \"file\"\n[[skills.config]]\nname = \"fixture\"\nenabled = false\n[plugins.\"fixture@local\"]\nenabled = false\n[apps.fixture.tools.search]\nenabled = false\n").unwrap();
        let e = engine(&home);
        (fixture, e, file)
    }

    #[cfg(unix)]
    #[test]
    #[ignore = "Requires original Codex CLI; isolated HOME, credential trap and restart persistence"]
    fn native_defaults_round_trip_preserves_rules_and_unrelated_settings() {
        let (_fixture, e, file) = fixture();
        let before = inspect(&e).unwrap();
        assert!(before.writable);
        let values = [
            json!(3200),
            json!(false),
            json!(false),
            json!(false),
            json!(false),
            json!("writes"),
            json!("auto_review"),
            json!(false),
            json!(false),
        ];
        let changes = FIELDS
            .iter()
            .zip(values.iter())
            .map(|((key, _), value)| change(&before, key, value.clone()))
            .collect();
        let saved = save(
            &e,
            SaveRequest {
                revision: before.revision.clone(),
                changes,
            },
        )
        .unwrap();
        for ((key, _), value) in FIELDS.iter().zip(values.iter()) {
            assert_eq!(&saved.fields[*key].value, value);
        }
        assert_eq!(saved.rules, before.rules);
        let restarted = inspect(&e).unwrap();
        for (key, _) in FIELDS {
            assert_eq!(restarted.fields[key].value, saved.fields[key].value);
        }
        // Exercise all approval values through the original parser and persistence.
        let mut current = restarted;
        for mode in ["auto", "prompt", "writes", "approve"] {
            let changes = vec![change(&current, "appsApproval", json!(mode))];
            current = save(
                &e,
                SaveRequest {
                    revision: current.revision,
                    changes,
                },
            )
            .unwrap();
            assert_eq!(current.fields["appsApproval"].value, mode);
        }
        let changes = FIELDS
            .iter()
            .map(|(key, _)| change(&current, key, Value::Null))
            .collect();
        save(
            &e,
            SaveRequest {
                revision: current.revision,
                changes,
            },
        )
        .unwrap();
        let reset = inspect(&e).unwrap();
        assert!(reset.fields.values().all(|field| field.value.is_null()));
        assert_eq!(reset.rules, before.rules);
        let (mut session, _) = start(&e).unwrap();
        let config = read_config(&mut session, &e.home).unwrap();
        let user = &user_layer(&config).unwrap()["config"];
        assert_eq!(user["plugins"]["fixture@local"], json!({"enabled":false}));
        assert_eq!(
            user["apps"]["fixture"],
            json!({"tools":{"search":{"enabled":false}}})
        );
        assert_eq!(user["model"], "fixture");
        assert_eq!(user["cli_auth_credentials_store"], "file");
        let body = fs::read_to_string(file).unwrap();
        for text in [
            "# preserve user formatting",
            "model = \"fixture\"",
            "cli_auth_credentials_store = \"file\"",
            "[plugins.\"fixture@local\"]",
            "[apps.fixture.tools.search]",
            "enabled = false",
        ] {
            assert!(body.contains(text), "{text}");
        }
    }

    #[cfg(unix)]
    #[test]
    #[ignore = "Requires original Codex CLI; isolated concurrent-edit and invalid-write checks"]
    fn native_defaults_detect_conflicts_and_preserve_unrelated_external_edits() {
        let (_fixture, e, file) = fixture();
        let before = inspect(&e).unwrap();
        let initial = fs::read_to_string(&file).unwrap();
        fs::write(
            &file,
            initial.replace("model = \"fixture\"", "model = \"external\""),
        )
        .unwrap();
        let changes = vec![change(&before, "pluginsEnabled", json!(false))];
        let saved = save(
            &e,
            SaveRequest {
                revision: before.revision,
                changes,
            },
        )
        .unwrap();
        assert!(fs::read_to_string(&file)
            .unwrap()
            .contains("model = \"external\""));
        fs::write(
            &file,
            fs::read_to_string(&file).unwrap().replace(
                "[plugins._default]\nenabled = false",
                "[plugins._default]\nenabled = true",
            ),
        )
        .unwrap();
        let externally_changed = fs::read(&file).unwrap();
        let changes = vec![
            change(&saved, "pluginsEnabled", Value::Null),
            change(&saved, "appsEnabled", json!(false)),
        ];
        assert!(save(
            &e,
            SaveRequest {
                revision: saved.revision.clone(),
                changes
            }
        )
        .is_err());
        assert_eq!(fs::read(&file).unwrap(), externally_changed);
        let bad = Change {
            key: "skills.config".into(),
            value: json!([]),
            base_value: Value::Null,
        };
        assert!(save(
            &e,
            SaveRequest {
                revision: saved.revision,
                changes: vec![bad]
            }
        )
        .is_err());
        assert_eq!(fs::read(&file).unwrap(), externally_changed);
    }
}
