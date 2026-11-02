//! Project overrides are bounded to this project's config. Never fall back to user writes.
use super::*;

fn project_layer<'a>(config: &'a Value, root: &Path) -> Option<(usize, &'a Value)> {
    config["layers"]
        .as_array()?
        .iter()
        .enumerate()
        .find(|(_, layer)| {
            layer["name"]["type"] == "project"
                && layer["name"]["dotCodexFolder"]
                    .as_str()
                    .is_some_and(|path| {
                        Path::new(path)
                            .file_name()
                            .is_some_and(|name| name == ".codex")
                            && Path::new(path)
                                .parent()
                                .is_some_and(|parent| identity(parent) == identity(root))
                    })
        })
}
fn destination(engine: &Engine, target: &Target) -> Result<PathBuf, String> {
    if target.scope != "project" {
        return Err("Project scope is required.".into());
    }
    let root = identity(&target.directory(&engine.home)?);
    let folder = root.join(".codex");
    let file = folder.join("config.toml");
    if !identity(&folder).starts_with(&root)
        || !identity(&file).starts_with(&root)
        || identity(&file) == identity(&engine.env_home("CODEX_HOME", ".codex").join("config.toml"))
    {
        return Err("Project configuration must not resolve outside the project or to the user configuration.".into());
    }
    Ok(file)
}
pub(super) fn apply(engine: &Engine, target: &Target, config: &Value, plugins: &mut [Plugin]) {
    let root = target.directory(&engine.home).map(|root| identity(&root));
    for plugin in plugins {
        plugin.toggle_scope = if plugin.remote {
            "account"
        } else if target.scope == "project" {
            "project"
        } else {
            "user"
        }
        .into();
        plugin.project_enabled = None;
        if plugin.remote || target.scope != "project" {
            continue;
        }
        let layer = root
            .as_ref()
            .ok()
            .and_then(|root| project_layer(config, root));
        plugin.project_enabled = layer
            .and_then(|(_, layer)| layer["config"]["plugins"][&plugin.id]["enabled"].as_bool());
        let destination = destination(engine, target);
        let readonly = destination.as_ref().ok().is_some_and(|path| {
            fs::metadata(path).is_ok_and(|metadata| metadata.permissions().readonly())
                || path.parent().is_some_and(|parent| {
                    fs::metadata(parent).is_ok_and(|metadata| metadata.permissions().readonly())
                })
        });
        let reason = if destination.is_err() {
            Some("projectPath")
        } else if readonly {
            Some("projectReadOnly")
        } else if layer.is_none()
            && root
                .as_ref()
                .ok()
                .is_some_and(|root| root.join(".codex").exists())
        {
            Some("projectUnknown")
        } else if layer.is_some_and(|(_, layer)| !layer["disabledReason"].is_null()) {
            Some("untrustedProject")
        } else if !plugin.installed || !plugin.installation_known || !plugin.enabled_known {
            Some("unconfirmed")
        } else if plugin.install_policy.as_deref() == Some("NOT_AVAILABLE") {
            Some("policy")
        } else if !matches!(
            plugin.install_policy.as_deref(),
            Some("AVAILABLE" | "INSTALLED_BY_DEFAULT")
        ) {
            Some("unknownPolicy")
        } else if !matches!(
            plugin.source_kind.as_deref(),
            Some("local" | "url" | "git-subdir" | "npm")
        ) {
            Some("unknownSource")
        } else if layer.is_some_and(|(index, _)| {
            config["layers"].as_array().is_some_and(|layers| {
                layers[..index].iter().any(|layer| {
                    layer["disabledReason"].is_null()
                        && layer["config"]["plugins"][&plugin.id]["enabled"].is_boolean()
                })
            })
        }) {
            Some("managedOverride")
        } else {
            None
        };
        plugin.can_install = false;
        plugin.can_uninstall = false;
        plugin.can_check_updates = false;
        plugin.permissions.install = "notApplicable".into();
        plugin.permissions.uninstall = "notApplicable".into();
        plugin.permissions.check_updates = "notApplicable".into();
        plugin.can_toggle = reason.is_none();
        plugin.toggle_reason = reason.map(str::to_owned);
        plugin.permissions.toggle = match reason {
            None => "available",
            Some("projectUnknown" | "unconfirmed" | "unknownSource" | "unknownPolicy") => "unknown",
            Some("managedOverride") => "overridden",
            _ => "restricted",
        }
        .into();
        plugin.fingerprint=document_diff::revision(json!({"base":plugin.fingerprint,"scope":plugin.toggle_scope,"projectPath":root.as_ref().ok(),"projectEnabled":plugin.project_enabled,"toggle":plugin.permissions.toggle}).to_string().as_bytes());
    }
}
pub(super) fn write(
    engine: &Engine,
    target: &Target,
    binary: &Path,
    plugin: &Plugin,
    action: &str,
) -> Result<(), String> {
    let path = destination(engine, target)?;
    let folder = path
        .parent()
        .ok_or("Project configuration folder unavailable.")?;
    let created = if folder.exists() {
        false
    } else {
        fs::create_dir(folder).map_err(|error| error.to_string())?;
        true
    };
    let result = write_existing_folder(engine, target, binary, plugin, action, &path);
    if result.is_err() && created {
        let _ = fs::remove_dir(folder);
    }
    result
}
fn write_existing_folder(
    engine: &Engine,
    target: &Target,
    binary: &Path,
    plugin: &Plugin,
    action: &str,
    path: &Path,
) -> Result<(), String> {
    if fs::metadata(&path).is_ok_and(|metadata| metadata.permissions().readonly()) {
        return Err("Project configuration is read-only.".into());
    }
    let cwd = target.directory(&engine.home)?;
    let mut session = Session::start(engine, binary, &cwd)?;
    let config = read_config(&mut session, &cwd)?;
    let (index, layer) = project_layer(&config, &identity(&cwd))
        .ok_or("Project configuration layer unavailable.")?;
    if config["layers"].as_array().is_some_and(|layers| {
        layers[..index].iter().any(|layer| {
            layer["disabledReason"].is_null()
                && layer["config"]["plugins"][&plugin.id]["enabled"].is_boolean()
        })
    }) {
        return Err("A higher-priority configuration controls this project plugin.".into());
    }
    if !layer["disabledReason"].is_null() {
        return Err("The original Codex runtime does not trust this project. Project settings were not changed.".into());
    }
    let before = match fs::read(&path) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.to_string()),
    };
    let bytes = before.as_deref().unwrap_or_default();
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("Project configuration is too large.".into());
    }
    let text = std::str::from_utf8(bytes).map_err(|_| "Project configuration is not UTF-8.")?;
    let mut document = text
        .parse::<toml_edit::DocumentMut>()
        .map_err(|_| "Project configuration is not valid TOML. Correct it before retrying.")?;
    let actual = document
        .get("plugins")
        .and_then(|plugins| plugins.get(&plugin.id))
        .and_then(|entry| entry.get("enabled"))
        .and_then(toml_edit::Item::as_bool);
    if actual != plugin.project_enabled {
        return Err("Project plugin settings changed. Refresh before retrying.".into());
    }
    if action == "reset" {
        if let Some(plugins) = document
            .get_mut("plugins")
            .and_then(toml_edit::Item::as_table_like_mut)
        {
            if let Some(entry) = plugins
                .get_mut(&plugin.id)
                .and_then(toml_edit::Item::as_table_like_mut)
            {
                entry.remove("enabled");
            }
        }
    } else {
        if document.get("plugins").is_none() {
            document["plugins"] = toml_edit::Item::Table(toml_edit::Table::new());
        }
        let plugins = document
            .get_mut("plugins")
            .and_then(toml_edit::Item::as_table_like_mut)
            .ok_or("Invalid project plugin table.")?;
        if !plugins.contains_key(&plugin.id) {
            plugins.insert(&plugin.id, toml_edit::Item::Table(toml_edit::Table::new()));
        }
        plugins
            .get_mut(&plugin.id)
            .and_then(toml_edit::Item::as_table_like_mut)
            .ok_or("Invalid project plugin entry.")?
            .insert("enabled", toml_edit::value(action == "enable"));
    }
    let next = document.to_string();
    let folder = path
        .parent()
        .ok_or("Project configuration folder unavailable.")?;
    fs::create_dir_all(folder).map_err(|error| error.to_string())?;
    let temporary = folder.join(format!(
        ".skills-space-{}-{}.tmp",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_nanos()
    ));
    let result = (|| -> Result<(), String> {
        use std::io::Write;
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        file.write_all(next.as_bytes())
            .map_err(|error| error.to_string())?;
        if let Ok(metadata) = fs::metadata(&path) {
            fs::set_permissions(&temporary, metadata.permissions())
                .map_err(|error| error.to_string())?;
        }
        file.sync_all().map_err(|error| error.to_string())?;
        drop(file);
        destination(engine, target)?;
        let current = match fs::read(&path) {
            Ok(bytes) => Some(bytes),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error.to_string()),
        };
        if current != before {
            return Err("Project configuration changed. Refresh before retrying.".into());
        }
        fs::rename(&temporary, &path).map_err(|error| error.to_string())
    })();
    let _ = fs::remove_file(temporary);
    result
}

#[cfg(test)]
mod tests {
    use super::super::super::tests::{engine, global};
    use super::*;
    #[test]
    #[ignore = "Requires explicitly selected original Codex CLI; isolated project override lifecycle"]
    fn project_overrides_never_write_user_configuration() {
        let binary = PathBuf::from(
            std::env::var_os("SKILLS_SPACE_CODEX_TEST_BINARY").expect("Select original CLI"),
        );
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        fs::create_dir_all(home.join(".local/bin")).unwrap();
        fs::create_dir_all(home.join(".codex")).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&binary, home.join(".local/bin/codex")).unwrap();
        let e = engine(&home);
        let market = home.join("market");
        let package = market.join("plugins/sample");
        fs::create_dir_all(package.join(".codex-plugin")).unwrap();
        fs::create_dir_all(market.join(".agents/plugins")).unwrap();
        fs::write(
            package.join(".codex-plugin/plugin.json"),
            r#"{"name":"sample","version":"1.0.0","skills":"./skills"}"#,
        )
        .unwrap();
        fs::write(market.join(".agents/plugins/marketplace.json"),r#"{"name":"scope-fixture","plugins":[{"name":"sample","source":{"source":"local","path":"./plugins/sample"},"policy":{"installation":"AVAILABLE"}}]}"#).unwrap();
        fs::create_dir_all(package.join("skills/writing")).unwrap();
        fs::write(package.join("skills/writing/SKILL.md"), "---\nname: writing\ndescription: Isolated plugin skill\n---\nWriting fixture\n").unwrap();
        let a = home.join("project-a");
        let b = home.join("project-b");
        let untrusted = home.join("untrusted");
        for root in [&a, &b, &untrusted] {
            fs::create_dir_all(root.join(".git")).unwrap();
        }
        fs::create_dir_all(a.join(".agents/skills/project-only")).unwrap();
        fs::write(a.join(".agents/skills/project-only/SKILL.md"), "---\nname: project-only\ndescription: Isolated project skill\n---\nProject fixture\n").unwrap();
        #[cfg(unix)]
        {
            fs::create_dir_all(b.join(".agents/skills")).unwrap();
            std::os::unix::fs::symlink(a.join(".agents/skills/project-only"), b.join(".agents/skills/shared-project-skill")).unwrap();
        }
        let user = home.join(".codex/config.toml");
        fs::write(&user,format!("# user comment\nmodel = \"fixture-model\"\n[projects.{}]\ntrust_level = \"trusted\"\n[projects.{}]\ntrust_level = \"trusted\"\n",json!(identity(&a)),json!(identity(&b)))).unwrap();
        cli(
            &e,
            &binary,
            &home,
            &[
                "plugin",
                "marketplace",
                "add",
                market.to_str().unwrap(),
                "--json",
            ],
        )
        .unwrap();
        cli(
            &e,
            &binary,
            &home,
            &["plugin", "add", "sample@scope-fixture", "--json"],
        )
        .unwrap();
        let target = |path: &Path| Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(path.to_string_lossy().into()),
        };
        let read = |target: &Target| {
            inspect(&e, target)
                .unwrap()
                .plugins
                .into_iter()
                .find(|plugin| plugin.id == "sample@scope-fixture")
                .unwrap()
        };
        let change = |target: &Target, action: &str| {
            let snapshot = inspect(&e, target).unwrap();
            let plugin = snapshot
                .plugins
                .iter()
                .find(|plugin| plugin.id == "sample@scope-fixture")
                .unwrap();
            plugin_apply(
                &e,
                PluginRequest {
                    target: target.clone(),
                    revision: snapshot.revision.clone(),
                    plugin_id: plugin.id.clone(),
                    fingerprint: plugin.fingerprint.clone(),
                    catalog_entry: false,
                    remote_plugin_id: None,
                    action: action.into(),
                },
            )
        };
        // User-default single-skill toggles remain functional.
        for enabled in [false, true] {
            let snapshot = inspect(&e, &global()).unwrap();
            let skill = snapshot.skills.iter().find(|skill| skill.state.plugin_id.as_deref() == Some("sample@scope-fixture")).unwrap();
            assert!(skill.state.can_toggle);
            let document = skill.state.document_path.clone();
            let content = fs::read(&document).unwrap();
            let saved = toggle(&e, ToggleRequest { target:global(), revision:snapshot.revision.clone(), base_rules:Some(snapshot.rules.clone()), documents:vec![document.clone()], enabled }).unwrap();
            assert!(saved.skills.iter().any(|skill| skill.state.document_path == document && skill.state.enabled == Some(enabled)));
            assert_eq!(fs::read(&document).unwrap(), content);
        }
        assert!(read(&global()).enabled);
        let project = target(&a);
        let initial = read(&project);
        // Match the official card's RPC selectors. Project context does not
        // make these skill preferences independent project overrides.
        let snapshot = inspect(&e, &project).unwrap();
        let plugin_skill = snapshot.skills.iter().find(|skill| skill.state.plugin_id.as_deref() == Some("sample@scope-fixture")).unwrap();
        let project_skill = snapshot.skills.iter().find(|skill| skill.name == "project-only").unwrap();
        assert!(!plugin_skill.state.in_scope);
        assert!(project_skill.state.in_scope);
        let selected = [plugin_skill.state.document_path.clone(), project_skill.state.document_path.clone()];
        let plugin_name = plugin_skill.name.clone();
        let before_non_skill = {
            let mut document = fs::read_to_string(&user).unwrap().parse::<toml_edit::DocumentMut>().unwrap();
            document.remove("skills");
            document.to_string()
        };
        for document in &selected {
            let source_bytes = fs::read(document).unwrap();
            for enabled in [false, true] {
                let current = inspect(&e, &project).unwrap();
                assert!(current.skills.iter().any(|skill| skill.state.document_path == *document && skill.state.can_toggle));
                let saved = toggle(&e, ToggleRequest { target:project.clone(), revision:current.revision.clone(), base_rules:Some(current.rules.clone()), documents:vec![document.clone()], enabled }).unwrap();
                assert!(saved.skills.iter().any(|skill| skill.state.document_path == *document && skill.state.enabled == Some(enabled)));
                let reread = inspect(&e, &project).unwrap();
                assert!(reread.skills.iter().any(|skill| skill.state.document_path == *document && skill.state.enabled == Some(enabled)));
                let rule = if document == &selected[0] {
                    reread.rules.iter().find(|rule| rule["name"].as_str() == Some(&plugin_name))
                } else {
                    reread.rules.iter().find(|rule| rule["path"].as_str() == Some(document))
                };
                if enabled {
                    assert!(rule.is_none(), "the original RPC restores the default by removing its disabled rule");
                } else {
                    assert_eq!(rule.expect("the original RPC must save the name/path selector")["enabled"], false);
                }
                if document == &selected[0] {
                    // The shared plugin skill changes in other project/global
                    // views too, rather than pretending to be project-local.
                    for other in [&global(), &target(&b)] {
                        assert!(inspect(&e, other).unwrap().skills.iter().any(|skill| skill.state.document_path == *document && skill.state.enabled == Some(enabled)));
                    }
                }
                #[cfg(unix)]
                if document == &selected[1] {
                    let shared = inspect(&e, &target(&b)).unwrap();
                    assert!(shared.skills.iter().any(|skill| skill.state.document_path == *document && skill.state.enabled == Some(enabled)), "a project referencing the same canonical skill receives the original path rule");
                }
                assert!(!a.join(".codex/config.toml").exists());
                let mut document = fs::read_to_string(&user).unwrap().parse::<toml_edit::DocumentMut>().unwrap();
                document.remove("skills");
                assert_eq!(document.to_string(),before_non_skill);
            }
            assert_eq!(fs::read(document).unwrap(),source_bytes);
        }
        let before = fs::read(&user).unwrap();

        assert_eq!(initial.toggle_scope, "project");
        assert_ne!(
            initial.fingerprint,
            read(&target(&b)).fingerprint,
            "A review from another project must not be reusable"
        );
        assert!(initial.can_toggle, "{:?}", initial);
        assert!(!initial.can_install && !initial.can_uninstall && !initial.can_check_updates);
        change(&project, "disable").unwrap();
        assert!(!read(&project).enabled);
        assert_eq!(read(&project).project_enabled, Some(false));
        assert_eq!(fs::read(&user).unwrap(), before);
        assert!(read(&global()).enabled);
        assert!(read(&target(&b)).enabled);
        let file = a.join(".codex/config.toml");
        let mut content = fs::read_to_string(&file).unwrap();
        content.push_str("\n# preserve project metadata\n[plugins.\"sample@scope-fixture\".mcp_servers.fixture]\nenabled = false\n");
        fs::write(&file, content).unwrap();
        change(&project, "enable").unwrap();
        assert!(read(&project).enabled);
        change(&project, "reset").unwrap();
        let inherited = read(&project);
        assert!(inherited.enabled);
        assert_eq!(inherited.project_enabled, None);
        let content = fs::read_to_string(&file).unwrap();
        assert!(
            content.contains("# preserve project metadata")
                && content.contains("mcp_servers.fixture")
        );
        assert_eq!(fs::read(&user).unwrap(), before);
        change(&project, "disable").unwrap();
        change(&global(), "disable").unwrap();
        change(&global(), "enable").unwrap();
        assert!(!read(&project).enabled);
        fs::create_dir_all(untrusted.join(".codex")).unwrap();
        let before = fs::read(&user).unwrap();
        let blocked = read(&target(&untrusted));
        assert!(!blocked.can_toggle);
        assert_eq!(blocked.toggle_reason.as_deref(), Some("untrustedProject"));
        assert!(change(&target(&untrusted), "disable").is_err());
        assert!(!untrusted.join(".codex/config.toml").exists());
        assert_eq!(fs::read(&user).unwrap(), before);
        let missing = home.join("untrusted-missing");
        fs::create_dir_all(missing.join(".git")).unwrap();
        assert!(change(&target(&missing), "disable").is_err());
        assert!(!missing.join(".codex").exists());
        assert!(destination(&e, &target(&home)).is_err());
        assert!(change(&project, "uninstall").is_err());
        assert!(read(&global()).installed);
    }
}
