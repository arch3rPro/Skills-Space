//! Package inventory and original Pi lifecycle; configuration writes stay bounded
//! to the original selector's package/resource fields, with revision checks.
use super::*;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    target: Target,
    action: String,
    revision: Option<String>,
    id: Option<String>,
    ids: Option<Vec<String>>,
    source: Option<String>,
    resource_id: Option<String>,
    state: Option<String>,
    expected: Option<serde_json::Value>,
}
pub(super) fn helper(
    engine: &Engine,
    target: &Target,
    request: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let directory = target.directory(&engine.home)?;
    let mut command = engine.command(&engine.node, &engine.home);
    command
        .arg(engine.resources.join("pi-packages.mjs"))
        .arg(&engine.home)
        .arg(agent_directory(engine)?)
        .arg(if target.scope == "project" {
            directory.to_string_lossy().into_owned()
        } else {
            String::new()
        })
        .arg(serde_json::to_string(&request).map_err(|e| e.to_string())?);
    let output = run_process_with_timeout(
        &mut command,
        Duration::from_secs(if request["action"] == "list" { 30 } else { 180 }),
    )?;
    if !output.success {
        return Err(format!("Pi package operation failed: {}", output.stderr));
    }
    // Original npm may print progress; only our final structured record is state.
    serde_json::from_str(output.stdout.lines().last().unwrap_or(""))
        .map_err(|_| "Unsupported Pi package response.".into())
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuiltinChoice {
    pub resource_id: String,
    pub state: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuiltinChange {
    pub revision: String,
    pub choices: Vec<BuiltinChoice>,
}
pub(super) fn prepare_builtins(
    engine: &Engine,
    target: &Target,
    change: &BuiltinChange,
) -> Result<serde_json::Value, String> {
    let prepared = helper(
        engine,
        target,
        serde_json::json!({"action":"builtins","revision":change.revision,"choices":change.choices}),
    )?;
    let fields = prepared["changes"]
        .as_object()
        .ok_or("Missing Pi built-in settings.")?;
    if fields.keys().any(|key| key != "extensions") {
        return Err("Unsupported Pi built-in configuration field.".into());
    }
    Ok(prepared["changes"].clone())
}
fn run(engine: &Engine, request: Request) -> Result<serde_json::Value, String> {
    let target = &request.target;
    let listed = helper(engine, target, serde_json::json!({"action":"list"}))?;
    if request.action == "list" {
        return Ok(listed);
    }
    let snapshot = &listed["snapshot"];
    if request.revision.as_deref() != snapshot["revision"].as_str() {
        return Err("Pi packages or settings changed. Refresh the package list.".into());
    }
    if target.scope == "project" && snapshot["projectTrusted"] != true {
        return Err("This project is not trusted. Trust it in Pi settings first.".into());
    }
    let selected = snapshot["packages"].as_array().and_then(|items| {
        items
            .iter()
            .find(|item| item["id"].as_str() == request.id.as_deref())
    });
    if request.action == "check" || request.action == "update" {
        let selected = selected.ok_or("Pi package is no longer configured.")?;
        if selected["canUpdate"] != true {
            return Err("This Pi package is maintained at its local source.".into());
        }
        let result = packages::from_source(
            engine,
            target,
            selected["source"]
                .as_str()
                .ok_or("Invalid package source.")?,
            &request.action,
            request.expected,
        )?;
        return Ok(
            serde_json::json!({"snapshot":helper(engine,target,serde_json::json!({"action":"list"}))?["snapshot"],"update":result}),
        );
    }
    if !["install", "remove", "resource", "packages"].contains(&request.action.as_str()) {
        return Err("Unsupported Pi package action.".into());
    }
    let directory = target.directory(&engine.home)?;
    if target.scope == "project"
        && fs::symlink_metadata(directory.join(".pi"))
            .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return Err("Project Pi configuration is a symbolic link. Edit its original configuration directly.".into());
    }
    let global = agent_directory(engine)?.join("settings.json");
    let local = directory.join(".pi/settings.json");
    let path = if target.scope == "project" {
        &local
    } else {
        &global
    };
    let _lock = SettingsLock::acquire(path)?;
    let before_global = settings(&global)?;
    let before = settings(path)?;
    let trust_path = agent_directory(engine)?.join("trust.json");
    let trust_before = fs::read(&trust_path).ok();
    let prepared = helper(
        engine,
        target,
        serde_json::json!({"action":request.action,"revision":request.revision,"id":request.id,"ids":request.ids,"source":request.source,"resourceId":request.resource_id,"state":request.state}),
    )?;
    if settings(&global)? != before_global
        || settings(path)? != before
        || fs::read(&trust_path).ok() != trust_before
    {
        return Err("Pi settings changed during the operation. Refresh the package list.".into());
    }
    let mut after = before;
    let changes = prepared["changes"]
        .as_object()
        .ok_or("Missing Pi settings changes.")?;
    for (key, value) in changes {
        if !["packages", "extensions", "skills", "prompts", "themes"].contains(&key.as_str())
            || (!value.is_null() && !value.is_array())
        {
            return Err("Pi returned an unsupported configuration field.".into());
        }
        if value.is_null() {
            after
                .as_object_mut()
                .ok_or("Invalid Pi settings.")?
                .remove(key);
        } else {
            after[key] = value.clone();
        }
    }
    if !changes.is_empty() {
        write_settings(path, &after)?;
    }
    drop(_lock);
    let actual = helper(engine, target, serde_json::json!({"action":"list"}))?;
    if request.action == "packages" {
        for id in request.ids.as_deref().unwrap_or_default() {
            let package = actual["snapshot"]["packages"].as_array().and_then(|items| items.iter().find(|item| item["id"].as_str() == Some(id.as_str()))).ok_or("Pi package was not found after saving.")?;
            for resource in package["resources"].as_array().into_iter().flatten() {
                let retained = if target.scope == "project" { resource["override"].as_str() == request.state.as_deref() } else { resource["enabled"].as_bool() == Some(request.state.as_deref() == Some("load")) };
                if !retained { return Err("Pi did not retain package loading settings.".into()); }
            }
        }
    }
    if request.action == "resource" {
        let resources = actual["snapshot"]["packages"]
            .as_array()
            .into_iter()
            .flatten()
            .flat_map(|item| item["resources"].as_array().into_iter().flatten())
            .chain(
                actual["snapshot"]["builtins"]
                    .as_array()
                    .into_iter()
                    .flatten(),
            );
        let resource = resources
            .into_iter()
            .find(|item| item["id"].as_str() == request.resource_id.as_deref())
            .ok_or("Pi resource was not found after saving.")?;
        if target.scope == "project" {
            if resource["override"].as_str() != request.state.as_deref() {
                return Err("Pi did not retain the project resource override.".into());
            }
        } else if resource["enabled"].as_bool() != Some(request.state.as_deref() == Some("load")) {
            return Err("Pi did not retain the resource loading choice.".into());
        }
    }
    Ok(actual)
}
#[tauri::command]
pub async fn upstream_pi_packages(
    app: AppHandle,
    request: Request,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let engine = Engine::from_app(&app)?;
        if request.action == "list" {
            return run(&engine, request);
        }
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        run(&engine, request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::upstream::tests::engine;
    #[test]
    #[ignore = "requires SKILLS_SPACE_PI_TEST_INSTALL; all writes use isolated fixtures"]
    fn original_pi_inventory_lifecycle_and_project_override() {
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
        let source = root.0.join("package");
        fs::create_dir_all(source.join("extensions")).unwrap();
        fs::write(
            source.join("package.json"),
            r#"{"name":"native-fixture","version":"1.0.0","pi":{"extensions":["extensions"]}}"#,
        )
        .unwrap();
        let code = "throw Error('Extension must never execute');";
        fs::write(source.join("extensions/demo.js"), code).unwrap();
        write_settings(
            &agent.join("settings.json"),
            &serde_json::json!({"keep":{"value":3}}),
        )
        .unwrap();
        let global = Target {
            host: "local".into(),
            scope: "global".into(),
            project_path: None,
        };
        let execute = |target: &Target, action: &str, values: serde_json::Value| {
            let current = helper(&e, target, serde_json::json!({"action":"list"})).unwrap();
            let mut request = serde_json::json!({"target":target,"action":action,"revision":current["snapshot"]["revision"]});
            request
                .as_object_mut()
                .unwrap()
                .extend(values.as_object().unwrap().clone());
            run(&e, serde_json::from_value(request).unwrap()).unwrap()
        };
        let first = execute(&global, "install", serde_json::json!({"source":source}));
        let package = &first["snapshot"]["packages"][0];
        let id = package["id"].clone();
        let resource = package["resources"][0]["id"].clone();
        assert_eq!(package["resources"].as_array().unwrap().len(), 1);
        let disabled = execute(
            &global,
            "resource",
            serde_json::json!({"id":id,"resourceId":resource,"state":"unload"}),
        );
        assert_eq!(
            disabled["snapshot"]["packages"][0]["resources"][0]["enabled"],
            false
        );
        let project_dir = root.0.join("project");
        fs::create_dir_all(project_dir.join(".pi")).unwrap();
        let project_dir = fs::canonicalize(project_dir).unwrap();
        write_settings(
            &project_dir.join(".pi/settings.json"),
            &serde_json::json!({"projectKeep":true}),
        )
        .unwrap();
        let project = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project_dir.to_string_lossy().into_owned()),
        };
        write_settings(
            &agent.join("trust.json"),
            &serde_json::json!({project_dir.to_string_lossy().to_string():true}),
        )
        .unwrap();
        let global_before = fs::read(agent.join("settings.json")).unwrap();
        let enabled = execute(
            &project,
            "resource",
            serde_json::json!({"id":id,"resourceId":resource,"state":"load"}),
        );
        assert_eq!(
            enabled["snapshot"]["packages"][0]["resources"][0]["enabled"],
            true
        );
        assert_eq!(
            fs::read(agent.join("settings.json")).unwrap(),
            global_before
        );
        let inherited = execute(
            &project,
            "resource",
            serde_json::json!({"id":id,"resourceId":resource,"state":"inherit"}),
        );
        assert_eq!(
            inherited["snapshot"]["packages"][0]["resources"][0]["enabled"],
            false
        );
        assert_eq!(
            settings(&project_dir.join(".pi/settings.json")).unwrap()["projectKeep"],
            true
        );
        // Whole-package writes use the same native atomic boundary for every
        // resource kind; invalid batches cannot partially update valid members.
        for folder in ["skills/demo", "prompts", "themes"] {
            fs::create_dir_all(source.join(folder)).unwrap();
        }
        fs::write(source.join("skills/demo/SKILL.md"), "---\nname: demo\ndescription: Native fixture\n---\nFixture").unwrap();
        fs::write(source.join("prompts/demo.md"), "Fixture prompt").unwrap();
        fs::write(source.join("themes/demo.json"), "{}").unwrap();
        fs::write(source.join("package.json"), r#"{"name":"native-fixture","version":"1.0.0","pi":{"extensions":["extensions"],"skills":["skills"],"prompts":["prompts"],"themes":["themes"]}}"#).unwrap();
        let all = execute(&global, "packages", serde_json::json!({"ids":[id],"state":"unload"}));
        let resources = all["snapshot"]["packages"][0]["resources"].as_array().unwrap();
        assert_eq!(resources.len(), 4);
        assert!(resources.iter().all(|item| item["enabled"] == false));
        let global_bytes = fs::read(agent.join("settings.json")).unwrap();
        for target in [&global, &project] {
            let current = helper(&e, target, serde_json::json!({"action":"list"})).unwrap();
            let local_bytes = fs::read(project_dir.join(".pi/settings.json")).unwrap();
            let invalid = run(&e, serde_json::from_value(serde_json::json!({"target":target,"action":"packages","revision":current["snapshot"]["revision"],"ids":[id,"missing"],"state":"load"})).unwrap());
            assert!(invalid.is_err());
            assert_eq!(fs::read(agent.join("settings.json")).unwrap(), global_bytes);
            assert_eq!(fs::read(project_dir.join(".pi/settings.json")).unwrap(), local_bytes);
        }
        let loaded = execute(&project, "packages", serde_json::json!({"ids":[id],"state":"load"}));
        assert!(loaded["snapshot"]["packages"][0]["resources"].as_array().unwrap().iter().all(|item| item["enabled"] == true && item["override"] == "load"));
        assert_eq!(fs::read(agent.join("settings.json")).unwrap(), global_bytes);
        let inherited = execute(&project, "packages", serde_json::json!({"ids":[id],"state":"inherit"}));
        assert!(inherited["snapshot"]["packages"][0]["resources"].as_array().unwrap().iter().all(|item| item["enabled"] == false && item["override"] == "inherit"));
        assert_eq!(fs::read(agent.join("settings.json")).unwrap(), global_bytes);
        let removed = execute(&global, "remove", serde_json::json!({"id":id}));
        assert!(removed["snapshot"]["packages"]
            .as_array()
            .unwrap()
            .is_empty());
        assert_eq!(
            fs::read_to_string(source.join("extensions/demo.js")).unwrap(),
            code
        );
        assert_eq!(
            settings(&agent.join("settings.json")).unwrap()["keep"]["value"],
            3
        );
        // Agent settings share one revision-checked write. Invalid built-in
        // choices must not partially save skill fields or unrelated settings.
        let mut data = settings(&agent.join("settings.json")).unwrap();
        data["skills"] = serde_json::json!([]);
        data["enableSkillCommands"] = false.into();
        write_settings(&agent.join("settings.json"), &data).unwrap();
        let current = inspect(&e, &global).unwrap();
        let listed = helper(&e, &global, serde_json::json!({"action":"list"})).unwrap();
        let builtin = &listed["snapshot"]["builtins"][0];
        let bytes = fs::read(agent.join("settings.json")).unwrap();
        let invalid = save_with_builtins(
            &e,
            Change {
                codemode: None,
                target: global.clone(),
                revision: current.revision.clone(),
                entries: vec!["!skills/draft/**".into()],
                skill_commands: Some(true),
            },
            Some(BuiltinChange {
                revision: listed["snapshot"]["revision"].as_str().unwrap().into(),
                choices: vec![BuiltinChoice {
                    resource_id: "invalid".into(),
                    state: "unload".into(),
                }],
            }),
        );
        assert!(invalid.is_err());
        assert_eq!(fs::read(agent.join("settings.json")).unwrap(), bytes);
        let saved = save_with_builtins(
            &e,
            Change {
                codemode: None,
                target: global.clone(),
                revision: current.revision,
                entries: current.entries,
                skill_commands: current.skill_commands,
            },
            Some(BuiltinChange {
                revision: listed["snapshot"]["revision"].as_str().unwrap().into(),
                choices: vec![BuiltinChoice {
                    resource_id: builtin["id"].as_str().unwrap().into(),
                    state: "unload".into(),
                }],
            }),
        )
        .unwrap();
        assert_eq!(
            saved.builtin_configuration.as_ref().unwrap()["builtins"][0]["enabled"],
            false
        );
        assert_eq!(
            settings(&agent.join("settings.json")).unwrap()["skills"],
            serde_json::json!([])
        );
        assert_eq!(
            settings(&agent.join("settings.json")).unwrap()["keep"]["value"],
            3
        );
        let global_bytes = fs::read(agent.join("settings.json")).unwrap();
        let current = inspect(&e, &project).unwrap();
        let listed = helper(&e, &project, serde_json::json!({"action":"list"})).unwrap();
        let saved = save_with_builtins(
            &e,
            Change {
                codemode: None,
                target: project.clone(),
                revision: current.revision,
                entries: current.entries,
                skill_commands: current.skill_commands,
            },
            Some(BuiltinChange {
                revision: listed["snapshot"]["revision"].as_str().unwrap().into(),
                choices: vec![BuiltinChoice {
                    resource_id: builtin["id"].as_str().unwrap().into(),
                    state: "load".into(),
                }],
            }),
        )
        .unwrap();
        assert_eq!(
            saved.builtin_configuration.as_ref().unwrap()["builtins"][0]["override"],
            "load"
        );
        assert_eq!(fs::read(agent.join("settings.json")).unwrap(), global_bytes);
        assert_eq!(
            settings(&project_dir.join(".pi/settings.json")).unwrap()["projectKeep"],
            true
        );
    }
}
