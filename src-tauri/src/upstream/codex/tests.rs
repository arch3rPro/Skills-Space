use super::super::tests::{engine, global};
use super::*;
fn skill(path: &Path, name: &str) {
    fs::create_dir_all(path).unwrap();
    fs::write(path.join("SKILL.md"),format!("---\nname: {name}\ndescription: Isolated Codex fixture.\n---\nContent remains unchanged.\n")).unwrap();
}
#[test]
#[ignore = "Requires explicitly selected original Codex CLI; uses an isolated HOME"]
fn native_config_and_local_plugin_round_trip() {
    native_round_trip(false);
}
#[cfg(target_os = "macos")]
#[test]
#[ignore = "Requires explicitly selected original Codex CLI; uses an isolated HOME"]
fn app_only_native_config_and_local_plugin_round_trip() {
    native_round_trip(true);
}
fn native_round_trip(app_only: bool) {
    let binary = PathBuf::from(
        std::env::var_os("SKILLS_SPACE_CODEX_TEST_BINARY").expect("Select original Codex binary"),
    );
    let fixture = super::super::TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir_all(home.join(".local/bin")).unwrap();
    if app_only {
        #[cfg(target_os = "macos")]
        app_fixture(&home, &binary);
    } else {
        #[cfg(unix)]
        std::os::unix::fs::symlink(&binary, home.join(".local/bin/codex")).unwrap();
    }
    let e = engine(&home);
    let root = home.join(".codex");
    fs::create_dir_all(&root).unwrap();
    let a = root.join("skills/a");
    let b = root.join("skills/b");
    skill(&a, "duplicate");
    skill(&b, "duplicate");
    fs::write(root.join("config.toml"),"# preserve comment\nmodel = \"fixture-model\"\n[[skills.config]]\nname = \"duplicate\"\nenabled = false\n").unwrap();
    let mut config = fs::read_to_string(root.join("config.toml")).unwrap();
    config.push_str(&format!(
        "\n[[skills.config]]\npath = {}\nenabled = false\ncustom = \"preserved\"\n",
        json!(identity(&a.join("SKILL.md")))
    ));
    fs::write(root.join("config.toml"), config).unwrap();
    fs::create_dir_all(home.join(".agents")).unwrap();
    let lock = home.join(".agents/.skill-lock.json");
    fs::write(&lock, b"{\"unrelated\":true}").unwrap();
    fs::write(a.join("support.txt"), "support bytes").unwrap();
    let before = inspect(&e, &global()).unwrap();
    assert!(before.context_id.is_some());
    assert_eq!(
        identity(Path::new(&before.config_path)),
        identity(&root.join("config.toml"))
    );
    assert_eq!(
        before
            .skills
            .iter()
            .filter(|s| s.name == "duplicate" && s.state.enabled == Some(false))
            .count(),
        2
    );
    let document = identity(&a.join("SKILL.md")).to_string_lossy().into_owned();
    let body = fs::read(a.join("SKILL.md")).unwrap();
    let after = toggle(
        &e,
        ToggleRequest {
            base_rules: None,
            target: global(),
            revision: before.revision.clone(),
            documents: vec![document.clone(), document.clone()],
            enabled: true,
        },
    )
    .unwrap();
    assert!(after
        .skills
        .iter()
        .any(|s| s.state.document_path == document && s.state.enabled == Some(true)));
    assert!(after
        .skills
        .iter()
        .any(|s| s.state.document_path != document
            && s.name == "duplicate"
            && s.state.enabled == Some(false)));
    assert!(toggle(
        &e,
        ToggleRequest {
            base_rules: None,
            target: global(),
            revision: before.revision,
            documents: vec![document.clone()],
            enabled: false
        }
    )
    .unwrap_err()
    .contains("changed"));
    let batch: Vec<_> = after
        .skills
        .iter()
        .filter(|s| s.name == "duplicate")
        .map(|s| s.state.document_path.clone())
        .collect();
    let after = toggle(
        &e,
        ToggleRequest {
            base_rules: None,
            target: global(),
            revision: after.revision,
            documents: batch,
            enabled: false,
        },
    )
    .unwrap();
    assert_eq!(
        after
            .skills
            .iter()
            .filter(|s| s.name == "duplicate" && s.state.enabled == Some(false))
            .count(),
        2
    );
    assert_eq!(fs::read(a.join("SKILL.md")).unwrap(), body);
    let text = fs::read_to_string(root.join("config.toml")).unwrap();
    assert!(
        text.contains("custom = \"preserved\"")
            && text.contains("# preserve comment")
            && text.contains("fixture-model")
            && text.contains("name = \"duplicate\"")
    );
    // Compare the adapter's explicit path rule against the native single-item endpoint.
    let mut session = Session::start(&e, &binary, &home).unwrap();
    session
        .call(
            "skills/config/write",
            json!({"path":document,"enabled":true}),
        )
        .unwrap();
    // Native enable removes the explicit disabled selector: the name rule still disables it.
    assert!(list_skills(&mut session, &home)
        .unwrap()
        .0
        .iter()
        .any(|s| s.state.document_path == document && s.state.enabled == Some(false)));
    let single = root.join("skills/single");
    skill(&single, "single");
    let single = identity(&single.join("SKILL.md"));
    session
        .call(
            "skills/config/write",
            json!({"path":single,"enabled":false}),
        )
        .unwrap();
    assert!(list_skills(&mut session, &home)
        .unwrap()
        .0
        .iter()
        .any(|s| Path::new(&s.state.document_path) == single && s.state.enabled == Some(false)));
    session
        .call("skills/config/write", json!({"path":single,"enabled":true}))
        .unwrap();
    assert!(list_skills(&mut session, &home)
        .unwrap()
        .0
        .iter()
        .any(|s| Path::new(&s.state.document_path) == single && s.state.enabled == Some(true)));
    drop(session);
    // Physical project links remain owned by the project despite native canonical deduplication.
    let project = home.join("project");
    fs::create_dir_all(project.join(".git")).unwrap();
    fs::create_dir_all(project.join(".agents/skills")).unwrap();
    fs::create_dir_all(project.join(".codex/skills")).unwrap();
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&a, project.join(".agents/skills/shared")).unwrap();
        std::os::unix::fs::symlink(&b, project.join(".codex/skills/legacy-link")).unwrap();
    }
    skill(&project.join(".agents/skills/project-only"), "project-only");
    let project_target = Target {
        host: "local".into(),
        scope: "project".into(),
        project_path: Some(project.to_string_lossy().into()),
    };
    let project_snapshot = inspect(&e, &project_target).unwrap();
    assert!(project_snapshot.skills.iter().any(|s| s
        .state
        .installation_path
        .ends_with(".codex/skills/legacy-link")
        && s.state.in_scope));
    assert!(!project_snapshot
        .skills
        .iter()
        .any(|s| s.name == "single" && s.state.in_scope));
    skill(&home.join(".agents/skills/standard"), "untracked-standard");
    let mut standard_inventory = Inventory {
        version: VERSION.into(),
        agents: vec![],
        skills: vec![],
        warnings: vec![],
        dsh: None,
        codex: None,
        pi: None,
        hermes: None,
    };
    augment(&e, &global(), &mut standard_inventory);
    let standard = standard_inventory
        .skills
        .iter()
        .find(|s| s.name == "untracked-standard")
        .unwrap();
    assert_eq!(
        standard.codex_state.as_ref().unwrap().lifecycle_owner,
        "skills-cli"
    );
    assert_eq!(standard.cli_agents, vec!["codex"]);
    let mut inventory = Inventory {
        version: VERSION.into(),
        agents: vec![],
        skills: vec![],
        warnings: vec![],
        dsh: None,
        codex: None,
        pi: None,
        hermes: None,
    };
    augment(&e, &project_target, &mut inventory);
    assert!(inventory
        .skills
        .iter()
        .any(|s| s.path.ends_with(".agents/skills/shared")));
    assert!(!inventory.skills.iter().any(|s| s.name == "single"));
    // The native expectedVersion guard rejects a real edit between read and write.
    let mut session = Session::start(&e, &binary, &home).unwrap();
    let config = read_config(&mut session, &home).unwrap();
    let revision = user_layer(&config).unwrap()["version"].clone();
    let mut content = fs::read_to_string(root.join("config.toml")).unwrap();
    content = content.replace("fixture-model", "externally-changed-model");
    fs::write(root.join("config.toml"), content).unwrap();
    assert!(session.call("config/value/write",json!({"keyPath":"skills.config","value":[],"mergeStrategy":"replace","expectedVersion":revision})).is_err());
    drop(session);
    let market = fixture.0.join("market");
    let plugin = market.join("plugins/demo.name");
    fs::create_dir_all(market.join(".agents/plugins")).unwrap();
    fs::create_dir_all(plugin.join(".codex-plugin")).unwrap();
    fs::write(
        plugin.join(".codex-plugin/plugin.json"),
        json!({"name":"demo.name","version":"1.0.0","description":"Fixture","author":{"name":"Fixture Author"},"interface":{"displayName":"Fixture Plugin","shortDescription":"Plugin introduction","composerIcon":"./icon.svg"},"skills":"./skills/"})
            .to_string(),
    )
    .unwrap();
    skill(&plugin.join("skills/alpha"), "plugin-alpha");
    skill(&plugin.join("skills/beta"), "plugin-beta");
    fs::write(
        plugin.join("icon.svg"),
        r#"<svg xmlns="http://www.w3.org/2000/svg"/>"#,
    )
    .unwrap();
    fs::create_dir_all(plugin.join("skills/alpha/agents")).unwrap();
    fs::create_dir_all(plugin.join("skills/alpha/assets")).unwrap();
    fs::write(
        plugin.join("skills/alpha/assets/skill-icon.svg"),
        "<svg xmlns=\"http://www.w3.org/2000/svg\">skill</svg>",
    )
    .unwrap();
    fs::write(
        plugin.join("skills/alpha/agents/openai.yaml"),
        "interface:\n  display_name: Readable Alpha\n  icon_small: ./assets/skill-icon.svg\n",
    )
    .unwrap();
    fs::write(market.join(".agents/plugins/marketplace.json"),json!({"name":"fixture","plugins":[{"name":"demo.name","source":{"source":"local","path":"./plugins/demo.name"},"policy":{"installation":"AVAILABLE","authentication":"ON_USE"},"category":"Productivity"}]}).to_string()).unwrap();
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
    // Simulate a CLI reporting failure after a successful mutation, without changing the original binary.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let wrapper = super::binary(&e).unwrap();
        fs::remove_file(&wrapper).unwrap();
        let quoted = format!("'{}'", binary.to_string_lossy().replace('\'', "'\"'\"'"));
        fs::write(&wrapper, format!("#!/bin/sh\nif [ \"$1\" = -c ]; then shift 2; fi\nif [ \"$1\" = plugin ] && [ \"$2\" = add ] && [ \"$3\" != --help ]; then\n  {quoted} \"$@\" || exit $?\n  exit 17\nfi\nexec {quoted} \"$@\"\n")).unwrap();
        fs::set_permissions(&wrapper, fs::Permissions::from_mode(0o755)).unwrap();
    }
    let mut snapshot = inspect(&e, &global()).unwrap();
    assert_eq!(snapshot.plugins.len(), 1, "{:?}", snapshot.warnings);
    for action in ["install", "disable", "enable", "uninstall"] {
        let plugin = snapshot.plugins[0].clone();
        snapshot = plugin_apply(
            &e,
            PluginRequest {
                remote_plugin_id: None,
                catalog_entry: false,
                target: global(),
                revision: snapshot.revision,
                plugin_id: plugin.id,
                fingerprint: plugin.fingerprint,
                action: action.into(),
            },
        )
        .unwrap();
        if action == "install" {
            assert!(snapshot.plugins[0].content_verified);
            assert!(snapshot
                .warnings
                .iter()
                .any(|warning| warning.contains("verified after a command error")));
            let alpha = snapshot
                .skills
                .iter()
                .find(|s| s.name == "demo.name:plugin-alpha")
                .unwrap();
            assert!(alpha.state.can_toggle);
            assert_eq!(alpha.state.display_name.as_deref(), Some("Readable Alpha"));
            assert!(alpha
                .state
                .icon
                .as_deref()
                .is_some_and(|s| s.starts_with("data:image/svg+xml,")));
            assert_eq!(
                alpha.state.plugin_display_name.as_deref(),
                Some("Fixture Plugin")
            );
            assert!(snapshot.plugins[0]
                .icon
                .as_ref()
                .unwrap()
                .starts_with("data:image/svg+xml,"));
            assert_eq!(snapshot.plugins[0].description, "Plugin introduction");
            assert_eq!(
                snapshot.plugins[0].author.as_deref(),
                Some("Fixture Author")
            );
            let document = alpha.state.document_path.clone();
            snapshot = toggle(
                &e,
                ToggleRequest {
                    base_rules: None,
                    target: global(),
                    revision: snapshot.revision,
                    documents: vec![document.clone()],
                    enabled: false,
                },
            )
            .unwrap();
            assert!(snapshot.plugins[0].enabled);
            assert_eq!(
                snapshot
                    .skills
                    .iter()
                    .find(|s| s.state.document_path == document)
                    .unwrap()
                    .state
                    .enabled,
                Some(false)
            );
            assert_eq!(
                snapshot
                    .skills
                    .iter()
                    .find(|s| s.name == "demo.name:plugin-beta")
                    .unwrap()
                    .state
                    .enabled,
                Some(true)
            );
        }
        if action == "enable" {
            assert_eq!(
                snapshot
                    .skills
                    .iter()
                    .find(|s| s.name == "demo.name:plugin-alpha")
                    .unwrap()
                    .state
                    .enabled,
                Some(false)
            );
            assert_eq!(
                snapshot
                    .skills
                    .iter()
                    .find(|s| s.name == "demo.name:plugin-beta")
                    .unwrap()
                    .state
                    .enabled,
                Some(true)
            );
        }
        if action == "disable" {
            let beta = snapshot
                .skills
                .iter()
                .find(|s| s.name == "demo.name:plugin-beta")
                .unwrap()
                .state
                .document_path
                .clone();
            let alpha = snapshot
                .skills
                .iter()
                .find(|s| s.name == "demo.name:plugin-alpha")
                .unwrap();
            assert!(alpha.state.can_toggle);
            assert_eq!(alpha.state.display_name.as_deref(), Some("Readable Alpha"));
            assert!(alpha.state.icon.is_some());
            for enabled in [false, true] {
                snapshot = toggle(
                    &e,
                    ToggleRequest {
                        base_rules: None,
                        target: global(),
                        revision: snapshot.revision,
                        documents: vec![beta.clone()],
                        enabled,
                    },
                )
                .unwrap();
                assert!(
                    !snapshot
                        .plugins
                        .iter()
                        .find(|p| p.id == "demo.name@fixture")
                        .unwrap()
                        .enabled
                );
                assert_eq!(
                    snapshot
                        .skills
                        .iter()
                        .find(|s| s.state.document_path == beta)
                        .unwrap()
                        .state
                        .enabled,
                    Some(enabled)
                );
            }
            assert!(snapshot
                .skills
                .iter()
                .any(|s| s.name == "demo.name:plugin-alpha" && !s.description.is_empty()));
            assert_eq!(
                snapshot
                    .skills
                    .iter()
                    .filter(|s| s.state.plugin_id.is_some() && s.state.enabled == Some(false))
                    .count(),
                1
            );
        }
    }
    assert_eq!(fs::read(&lock).unwrap(), b"{\"unrelated\":true}");
    assert_eq!(
        fs::read_to_string(a.join("support.txt")).unwrap(),
        "support bytes"
    );
    assert!(!snapshot.plugins[0].installed);
    assert!(plugin.exists());
    // Exercise a real Git marketplace through an isolated local URL rewrite.
    for args in [
        vec!["init"],
        vec!["add", "."],
        vec![
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "-m",
            "Fixture",
        ],
    ] {
        assert!(Command::new("git")
            .current_dir(&market)
            .args(args)
            .output()
            .unwrap()
            .status
            .success());
    }
    let origin = updates::git_fixture::GitOrigin::new(&market);
    cli(
        &e,
        &binary,
        &home,
        &["plugin", "marketplace", "remove", "fixture", "--json"],
    )
    .unwrap();
    cli(
        &e,
        &binary,
        &home,
        &["plugin", "marketplace", "add", &origin.url, "--json"],
    )
    .unwrap();
    cli(
        &e,
        &binary,
        &home,
        &["plugin", "add", "demo.name@fixture", "--json"],
    )
    .unwrap();
    let mut snapshot = inspect(&e, &global()).unwrap();
    for action in ["disable", "enable"] {
        let plugin = snapshot
            .plugins
            .iter()
            .find(|p| p.id == "demo.name@fixture")
            .unwrap()
            .clone();
        assert!(plugin.installed && plugin.can_toggle);
        assert!(
            plugin.can_uninstall,
            "Original CLI owns Git package removal too"
        );
        assert!(
            plugin.can_check_updates && plugin.git_marketplace,
            "Git marketplace local snapshots support content comparison"
        );
        snapshot = plugin_apply(
            &e,
            PluginRequest {
                remote_plugin_id: None,
                catalog_entry: false,
                target: global(),
                revision: snapshot.revision,
                plugin_id: plugin.id,
                fingerprint: plugin.fingerprint,
                action: action.into(),
            },
        )
        .unwrap();
        assert_eq!(
            snapshot
                .plugins
                .iter()
                .find(|p| p.id == "demo.name@fixture")
                .unwrap()
                .enabled,
            action == "enable"
        );
        if action == "install" {
            assert!(snapshot.plugins[0].content_verified);
            assert!(snapshot
                .warnings
                .iter()
                .any(|warning| warning.contains("verified after a command error")));
            let alpha = snapshot
                .skills
                .iter()
                .find(|s| s.name == "demo.name:plugin-alpha")
                .unwrap();
            assert!(alpha.state.can_toggle);
            assert_eq!(alpha.state.display_name.as_deref(), Some("Readable Alpha"));
            assert!(alpha
                .state
                .icon
                .as_deref()
                .is_some_and(|s| s.starts_with("data:image/svg+xml,")));
            assert_eq!(
                alpha.state.plugin_display_name.as_deref(),
                Some("Fixture Plugin")
            );
            assert!(snapshot.plugins[0]
                .icon
                .as_ref()
                .unwrap()
                .starts_with("data:image/svg+xml,"));
            assert_eq!(snapshot.plugins[0].description, "Plugin introduction");
            assert_eq!(
                snapshot.plugins[0].author.as_deref(),
                Some("Fixture Author")
            );
            let document = alpha.state.document_path.clone();
            snapshot = toggle(
                &e,
                ToggleRequest {
                    base_rules: None,
                    target: global(),
                    revision: snapshot.revision,
                    documents: vec![document.clone()],
                    enabled: false,
                },
            )
            .unwrap();
            assert!(snapshot.plugins[0].enabled);
            assert_eq!(
                snapshot
                    .skills
                    .iter()
                    .find(|s| s.state.document_path == document)
                    .unwrap()
                    .state
                    .enabled,
                Some(false)
            );
            assert_eq!(
                snapshot
                    .skills
                    .iter()
                    .find(|s| s.name == "demo.name:plugin-beta")
                    .unwrap()
                    .state
                    .enabled,
                Some(true)
            );
        }
        if action == "disable" {
            assert_eq!(
                snapshot
                    .skills
                    .iter()
                    .filter(|s| s.state.plugin_id.as_deref() == Some("demo.name@fixture"))
                    .count(),
                2
            );
        }
    }
    // A check compares the local Git snapshot and must not upgrade/install anything.
    let git_document = snapshot
        .skills
        .iter()
        .find(|s| s.name == "demo.name:plugin-alpha")
        .unwrap()
        .state
        .document_path
        .clone();
    snapshot = toggle(
        &e,
        ToggleRequest {
            base_rules: None,
            target: global(),
            revision: snapshot.revision,
            documents: vec![git_document],
            enabled: false,
        },
    )
    .unwrap();
    assert!(snapshot
        .skills
        .iter()
        .any(|s| s.name == "demo.name:plugin-alpha" && s.state.enabled == Some(false)));
    fs::write(plugin.join("new-content.txt"), "new revision").unwrap();
    for args in [
        vec!["add", "."],
        vec![
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "-m",
            "Update",
        ],
    ] {
        assert!(Command::new("git")
            .current_dir(&market)
            .args(args)
            .output()
            .unwrap()
            .status
            .success());
    }
    let checked = updates::check(&e, &global(), "demo.name@fixture").unwrap();
    assert_eq!(checked.status, "contentChanged");
    assert!(
        !Path::new(&snapshot.plugins[0].source_path)
            .join("new-content.txt")
            .exists(),
        "Checking must not refresh the registered Git marketplace"
    );
    let installed = snapshot
        .plugins
        .iter()
        .find(|p| p.id == "demo.name@fixture")
        .unwrap()
        .installed_path
        .as_ref()
        .unwrap();
    assert!(!Path::new(installed).join("new-content.txt").exists());
    // The native upgrade is intentionally NOT called by Check: it also installs.
    cli(
        &e,
        &binary,
        &home,
        &["plugin", "marketplace", "upgrade", "fixture", "--json"],
    )
    .unwrap();
    assert!(Path::new(installed).join("new-content.txt").is_file());
    // Configured plugins remain visible without claiming installation/cache evidence.
    let mut content = fs::read_to_string(root.join("config.toml")).unwrap();
    content.push_str("\n[plugins.\"configured@offline-market\"]\nenabled = false\n");
    fs::write(root.join("config.toml"), content).unwrap();
    let snapshot = inspect(&e, &global()).unwrap();
    let plugin = snapshot
        .plugins
        .iter()
        .find(|p| p.id == "configured@offline-market")
        .unwrap();
    assert!(
        !plugin.installation_known
            && !plugin.installed
            && !plugin.can_toggle
            && !plugin.can_uninstall
    );
    let bytes = fs::read(root.join("config.toml")).unwrap();
    assert!(plugin_apply(
        &e,
        PluginRequest {
            remote_plugin_id: None,
            catalog_entry: false,
            target: global(),
            revision: snapshot.revision.clone(),
            plugin_id: plugin.id.clone(),
            fingerprint: plugin.fingerprint.clone(),
            action: "enable".into()
        }
    )
    .is_err());
    assert_eq!(bytes, fs::read(root.join("config.toml")).unwrap());
    // Rule settings edit the ordered user rules and restore inheritance by removing overrides.
    let before = inspect(&e, &global()).unwrap();
    assert!(before.capabilities.write_config && before.capabilities.name_rules);
    let mut rules = before.rules.clone();
    rules.retain(|r| r["path"].as_str() != Some(&document));
    rules.push(json!({"name":"duplicate","enabled":false}));
    let restored = rules::save_rules(
        &e,
        rules::RulesRequest {
            base_rules: None,
            target: global(),
            revision: before.revision.clone(),
            rules,
        },
    )
    .unwrap();
    assert!(restored
        .skills
        .iter()
        .any(|s| s.state.document_path == document && s.state.enabled == Some(false)));
    assert!(rules::save_rules(
        &e,
        rules::RulesRequest {
            base_rules: None,
            target: global(),
            revision: before.revision,
            rules: vec![]
        }
    )
    .is_err());
    let mut rules = restored.rules.clone();
    rules.push(json!({"path":document,"enabled":true,"custom":"kept"}));
    let saved = rules::save_rules(
        &e,
        rules::RulesRequest {
            base_rules: None,
            target: global(),
            revision: restored.revision,
            rules,
        },
    )
    .unwrap();
    assert!(saved
        .skills
        .iter()
        .any(|s| s.state.document_path == document && s.state.enabled == Some(true)));
    assert!(saved.skills.iter().any(|s| s.name == "duplicate"
        && s.state.document_path != document
        && s.state.enabled == Some(false)));
    let unchanged = fs::read(root.join("config.toml")).unwrap();
    let mut invalid = saved.rules.clone();
    invalid.push(json!({"path":a,"enabled":true}));
    assert!(rules::save_rules(
        &e,
        rules::RulesRequest {
            base_rules: None,
            target: global(),
            revision: saved.revision,
            rules: invalid
        }
    )
    .is_err());
    assert_eq!(unchanged, fs::read(root.join("config.toml")).unwrap());
    assert_eq!(fs::read(a.join("SKILL.md")).unwrap(), body);
}

#[test]
fn portable_plugin_uses_fixed_components_and_openai_overlay() {
    let fixture = TemporaryDirectory::new().unwrap();
    fs::create_dir_all(fixture.0.join(".codex-plugin")).unwrap();
    fs::write(
        fixture.0.join(".codex-plugin/plugin.json"),
        json!({"name":"legacy","hooks":"legacy.json","skills":"./legacy/"}).to_string(),
    )
    .unwrap();
    fs::write(fixture.0.join("plugin.json"), json!({"$schema":"https://agent-plugins.org/plugin.schema.json","name":"portable","version":"2","extensions":{"com.openai":{"hooks":"./hooks.json","skills":"./wrong/"}}}).to_string()).unwrap();
    fs::write(fixture.0.join("mcp.json"), "{}").unwrap();
    let data = manifest(&fixture.0).unwrap();
    assert_eq!(data["name"], "portable");
    assert_eq!(data["skills"], "./skills/");
    assert_eq!(data["mcpServers"], "./mcp.json");
    assert_eq!(data["hooks"], "./hooks.json");
}

#[cfg(unix)]
#[test]
#[ignore = "Requires explicitly selected original Codex CLI; isolated slow catalog"]
fn agent_inventory_does_not_wait_for_remote_catalog() {
    use std::os::unix::fs::PermissionsExt;
    let binary = std::env::var("SKILLS_SPACE_CODEX_TEST_BINARY").unwrap();
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir_all(home.join(".local/bin")).unwrap();
    fs::create_dir_all(home.join(".codex")).unwrap();
    let marker = home.join("remote-called");
    let account_marker = home.join("account-called");
    let proxy = home.join("rpc-proxy.py");
    fs::write(&proxy, r#"import json,subprocess,sys
child=subprocess.Popen([sys.argv[1], '-c', 'cli_auth_credentials_store=\"ephemeral\"', 'app-server', '--stdio'], stdin=subprocess.PIPE)
for line in sys.stdin:
    if json.loads(line).get('method') == 'account/read':
        open(sys.argv[2], 'w').write('called')
        sys.exit(1)
    child.stdin.write(line.encode()); child.stdin.flush()
"#).unwrap();
    let wrapper = home.join(".local/bin/codex");
    fs::write(&wrapper,format!("#!/bin/sh\nif [ \"$1\" = -c ]; then shift 2; fi\nif [ \"$*\" = 'plugin list --json' ]; then\n touch '{}'\n sleep 2\n printf '%s' '{{\"installed\":[]}}'\n exit 0\nfi\nexec '{}' \"$@\"\n",marker.display(),binary)).unwrap();
    let script=fs::read_to_string(&wrapper).unwrap().replace("#!/bin/sh\n", &format!("#!/bin/sh\nif [ \"$1\" = -c ]; then shift 2; fi\nif [ \"$1\" = app-server ]; then exec /usr/bin/python3 '{}' '{}' '{}'; fi\n",proxy.display(),binary,account_marker.display()));
    fs::write(&wrapper, script).unwrap();
    fs::set_permissions(&wrapper, fs::Permissions::from_mode(0o755)).unwrap();
    let e = engine(&home);
    let start = std::time::Instant::now();
    let snapshot = read_snapshot(&e, &global());
    assert!(
        snapshot.unavailable_reason.is_none(),
        "{:?}",
        snapshot.warnings
    );
    println!("local inventory elapsed: {:?}", start.elapsed());
    let project = home.join("project");
    fs::create_dir_all(&project).unwrap();
    let target = Target {
        host: "local".into(),
        scope: "project".into(),
        project_path: Some(project.to_string_lossy().into_owned()),
    };
    let start = std::time::Instant::now();
    let project_snapshot = read_snapshot(&e, &target);
    assert!(project_snapshot.unavailable_reason.is_none());
    assert_ne!(snapshot.context_id, project_snapshot.context_id);
    assert_eq!(snapshot.context_id, read_snapshot(&e, &global()).context_id);
    println!("project inventory elapsed: {:?}", start.elapsed());
    assert!(
        !marker.exists(),
        "Opening an Agent waited for the remote plugin catalog"
    );
    let full = read_snapshot_catalog(&e, &global(), true);
    assert!(
        marker.exists(),
        "The plugin page must request installed remote state"
    );
    assert!(full.unavailable_reason.is_none());
    assert!(
        !account_marker.exists(),
        "Local loading must not query cloud account identity"
    );
}

#[test]
#[ignore = "Requires original Codex CLI; isolated bundled marketplace"]
fn bundled_plugin_actions_use_native_policy() {
    let binary = PathBuf::from(
        std::env::var_os("SKILLS_SPACE_CODEX_TEST_BINARY").expect("Select original CLI"),
    );
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir_all(home.join(".local/bin")).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&binary, home.join(".local/bin/codex")).unwrap();
    let e = engine(&home);
    let market = home.join(".codex/.tmp/bundled-marketplaces/openai-bundled");
    fs::create_dir_all(market.join(".agents/plugins")).unwrap();
    let source = market.join("plugins/sample");
    fs::create_dir_all(source.join(".codex-plugin")).unwrap();
    fs::write(
        source.join(".codex-plugin/plugin.json"),
        json!({"name":"sample","version":"1.0","skills":"./skills"}).to_string(),
    )
    .unwrap();
    skill(&source.join("skills/one"), "one");
    fs::write(market.join(".agents/plugins/marketplace.json"),json!({"name":"openai-bundled","plugins":[{"name":"sample","source":{"source":"local","path":"./plugins/sample"},"policy":{"installation":"AVAILABLE","authentication":"ON_USE"},"category":"Productivity"}]}).to_string()).unwrap();
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
    let mut snapshot = inspect(&e, &global()).unwrap();
    for action in ["install", "disable", "enable", "uninstall"] {
        let p = snapshot
            .plugins
            .iter()
            .find(|p| p.id == "sample@openai-bundled")
            .unwrap()
            .clone();
        assert!(p.builtin);
        assert_eq!(p.can_check_updates, p.installed);
        snapshot = plugin_apply(
            &e,
            PluginRequest {
                remote_plugin_id: None,
                target: global(),
                revision: snapshot.revision,
                plugin_id: p.id,
                fingerprint: p.fingerprint,
                catalog_entry: false,
                action: action.into(),
            },
        )
        .unwrap();
        let p = snapshot
            .plugins
            .iter()
            .find(|p| p.id == "sample@openai-bundled")
            .unwrap();
        assert_eq!(p.installed, action != "uninstall");
        if action != "uninstall" {
            assert_eq!(p.enabled, action != "disable");
        }
    }
    assert!(source.join("skills/one/SKILL.md").is_file());
}

#[cfg(unix)]
#[test]
#[ignore = "Requires original Codex CLI for config; remote transport is an isolated fixture"]
fn catalog_lifecycle_rechecks_native_inventory_and_rejects_fake_toggle() {
    use std::os::unix::fs::PermissionsExt;
    let binary = std::env::var("SKILLS_SPACE_CODEX_TEST_BINARY").unwrap();
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir_all(home.join(".local/bin")).unwrap();
    fs::create_dir_all(home.join(".codex")).unwrap();
    let entry = json!({"pluginId":"github@openai-curated-remote","name":"github","marketplaceName":"openai-curated-remote","version":"1","installed":true,"enabled":true,"source":{"source":"remote","id":"fixture-remote"},"installPolicy":"AVAILABLE","authPolicy":"ON_INSTALL"});
    let mut available = entry.clone();
    available["installed"] = json!(false);
    available["enabled"] = json!(false);
    fs::write(
        home.join("installed.json"),
        json!({"installed":[entry],"available":[]}).to_string(),
    )
    .unwrap();
    fs::write(
        home.join("available.json"),
        json!({"installed":[],"available":[available]}).to_string(),
    )
    .unwrap();
    fs::copy(home.join("installed.json"), home.join("catalog.json")).unwrap();
    let wrapper = home.join(".local/bin/codex");
    fs::write(
        &wrapper,
        format!(
            r#"#!/bin/sh
if [ "$*" = 'plugin list --json' ]; then cat "$HOME/catalog.json"; exit 0; fi
if [ "$*" = 'plugin remove github@openai-curated-remote --json' ]; then
  cp "$HOME/available.json" "$HOME/catalog.json"
  printf '%s' '{{"pluginId":"github@openai-curated-remote"}}'
  exit 0
fi
if [ "$*" = 'plugin add github@openai-curated-remote --json' ]; then
  cp "$HOME/installed.json" "$HOME/catalog.json"
  printf '%s' '{{"pluginId":"github@openai-curated-remote"}}'
  exit 0
fi
exec '{}' "$@"
"#,
            binary
        ),
    )
    .unwrap();
    fs::set_permissions(&wrapper, fs::Permissions::from_mode(0o755)).unwrap();
    let e = engine(&home);
    let snapshot = inspect_catalog(&e, &global(), true).unwrap();
    let p = snapshot.plugins.iter().find(|p| p.remote).unwrap().clone();
    assert!(p.can_toggle && p.can_uninstall && !p.can_check_updates);
    let before = fs::read(home.join("catalog.json")).unwrap();
    for action in ["disable", "enable", "uninstall"] {
        let error = plugin_apply(
            &e,
            PluginRequest {
                remote_plugin_id: None,
                target: global(),
                revision: snapshot.revision.clone(),
                plugin_id: p.id.clone(),
                fingerprint: p.fingerprint.clone(),
                catalog_entry: true,
                action: action.into(),
            },
        )
        .unwrap_err();
        assert_eq!(error, "CODEX_AUTH_REQUIRED");
        assert_eq!(fs::read(home.join("catalog.json")).unwrap(),before,"Unauthenticated operation used the legacy CLI instead of requesting independent authorization");
    }
    let refreshed = inspect_catalog(&e, &global(), true).unwrap();
    assert!(refreshed
        .plugins
        .iter()
        .any(|plugin| plugin.id == p.id && plugin.installed && plugin.enabled));
    assert!(!fs::read_to_string(home.join(".codex/config.toml"))
        .unwrap_or_default()
        .contains("github"));
}

#[test]
#[cfg(unix)]
fn unrequested_market_entries_are_excluded_from_inventory() {
    use std::os::unix::fs::PermissionsExt;
    let fixture = TemporaryDirectory::new().unwrap();
    let entries:Vec<Value>=(0..100).map(|i|json!({"pluginId":format!("plugin-{i}@remote"),"name":format!("Plugin {i}"),"marketplaceName":"remote","installed":false,"enabled":false,"source":{"source":"remote","id":format!("remote-{i}")},"installPolicy":"AVAILABLE","description":"Full catalog output must survive the bounded process capture."})).collect();
    let value = json!({"installed":[],"available":entries});
    let bytes = serde_json::to_vec_pretty(&value).unwrap();

    let data = fixture.0.join("catalog.json");
    fs::write(&data, bytes).unwrap();
    let binary = fixture.0.join("catalog-cli");
    fs::write(&binary, format!("#!/bin/sh\ncat '{}'\n", data.display())).unwrap();
    fs::set_permissions(&binary, fs::Permissions::from_mode(0o755)).unwrap();
    let mut complete = true;
    let mut warnings = vec![];
    let actual = catalog::read(
        &engine(&fixture.0),
        &binary,
        &fixture.0,
        &mut complete,
        &mut warnings,
    )
    .unwrap();
    assert!(complete);
    assert!(actual["available"].as_array().unwrap().is_empty());
    let mut plugins = vec![];
    catalog::merge(
        &mut plugins,
        &actual,
        &fixture.0,
        &Capabilities::default(),
        &json!({}),
    )
    .unwrap();
    assert!(plugins.is_empty());
}

#[cfg(target_os = "macos")]
fn app_fixture(home: &Path, executable: &Path) -> PathBuf {
    let app = home.join("Applications/ChatGPT.app");
    let nested = app.join("Contents/Resources/arbitrary/runtime/Original.app");
    for (path, id, name) in [
        (&app, "com.openai.codex", "Desktop"),
        (&nested, "com.openai.codex.cli", "original-cli"),
    ] {
        fs::create_dir_all(path.join("Contents/MacOS")).unwrap();
        fs::write(path.join("Contents/Info.plist"), format!(r#"<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>{id}</string><key>CFBundleExecutable</key><string>{name}</string></dict></plist>"#)).unwrap();
    }
    let result = nested.join("Contents/MacOS/original-cli");
    std::os::unix::fs::symlink(executable, &result).unwrap();
    result
}
#[cfg(target_os = "macos")]
#[test]
fn discovers_app_runtime_by_bundle_identity_and_preserves_cli_precedence() {
    let fixture = super::super::TemporaryDirectory::new().unwrap();
    let e = engine(&fixture.0);
    let app_binary = app_fixture(&fixture.0, Path::new("/usr/bin/true"));
    assert_eq!(binary(&e), Some(app_binary.clone()));
    fs::create_dir_all(fixture.0.join(".local/bin")).unwrap();
    let standalone = fixture.0.join(".local/bin/codex");
    fs::write(&standalone, "not executable").unwrap();
    assert_eq!(binary(&e), Some(app_binary));
    fs::remove_file(&standalone).unwrap();
    std::os::unix::fs::symlink("/usr/bin/true", &standalone).unwrap();
    assert_eq!(binary(&e), Some(standalone));
}

#[cfg(unix)]
#[test]
#[ignore = "Requires original Codex CLI; isolated credential trap and concurrent edits"]
fn local_management_avoids_credentials_and_preserves_unrelated_edits() {
    let original = PathBuf::from(std::env::var_os("SKILLS_SPACE_CODEX_TEST_BINARY").unwrap());
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir_all(home.join(".local/bin")).unwrap();
    std::os::unix::fs::symlink(&original, home.join(".local/bin/codex")).unwrap();
    let root = home.join(".codex");
    fs::create_dir_all(&root).unwrap();
    // Opening this fake auth file would block. No real account files are used.
    assert!(Command::new("mkfifo")
        .arg(root.join("auth.json"))
        .status()
        .unwrap()
        .success());
    fs::write(
        root.join("config.toml"),
        "cli_auth_credentials_store = \"file\"\nmodel = \"before\"\n",
    )
    .unwrap();
    skill(&root.join("skills/one"), "one");
    skill(
        &root.join("skills/.system/fixture-system"),
        "fixture-system",
    );
    let e = engine(&home);
    let before = inspect_skills(&e, &global()).unwrap();
    assert!(before.plugins.is_empty());
    let document = before
        .skills
        .iter()
        .find(|s| s.name == "one")
        .unwrap()
        .state
        .document_path
        .clone();
    fs::write(
        root.join("config.toml"),
        "cli_auth_credentials_store = \"file\"\nmodel = \"external-edit\"\n",
    )
    .unwrap();
    let saved = rules::save_rules(
        &e,
        rules::RulesRequest {
            target: global(),
            revision: before.revision,
            base_rules: Some(before.rules),
            rules: vec![json!({"name":"one","enabled":false})],
        },
    )
    .unwrap();
    assert_eq!(
        saved
            .skills
            .iter()
            .find(|s| s.name == "one")
            .unwrap()
            .state
            .enabled,
        Some(false)
    );
    assert!(fs::read_to_string(root.join("config.toml"))
        .unwrap()
        .contains("external-edit"));
    let after = toggle(
        &e,
        ToggleRequest {
            target: global(),
            revision: saved.revision,
            base_rules: Some(saved.rules),
            documents: vec![document.clone()],
            enabled: true,
        },
    )
    .unwrap();
    assert_eq!(
        after
            .skills
            .iter()
            .find(|s| s.name == "one")
            .unwrap()
            .state
            .enabled,
        Some(true)
    );
    let inherited = rules::save_rules(
        &e,
        rules::RulesRequest {
            target: global(),
            revision: after.revision,
            base_rules: Some(after.rules),
            rules: vec![json!({"name":"one","enabled":false})],
        },
    )
    .unwrap();
    assert_eq!(
        inherited
            .skills
            .iter()
            .find(|s| s.name == "one")
            .unwrap()
            .state
            .enabled,
        Some(false)
    );
    let details = read_document(&root.join("skills/one")).unwrap();
    assert!(details.content.contains("Content remains unchanged"));
    assert!(details.revision.is_some());
    // User authentication configuration is untouched: ephemeral is process-only.
    assert!(fs::read_to_string(root.join("config.toml"))
        .unwrap()
        .contains("\"file\""));
    let mut session = Session::start(&e, &original, &home).unwrap();
    let config = read_config(&mut session, &home).unwrap();
    assert_eq!(config["config"]["cli_auth_credentials_store"], "ephemeral");
    let system = before_system_probe(&mut session, &home);
    assert_eq!(system.state.runtime_scope, "system");
    let current = read_config(&mut session, &home).unwrap();
    let version = user_layer(&current).unwrap()["version"].clone();
    let mut rules = user_layer(&current).unwrap()["config"]["skills"]["config"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    rules.push(json!({"path":system.state.document_path,"enabled":false}));
    session.call("config/value/write", json!({"keyPath":"skills.config","value":rules,"mergeStrategy":"replace","expectedVersion":version})).unwrap();
    assert_eq!(
        before_system_probe(&mut session, &home).state.enabled,
        Some(false)
    );
    drop(session);
    let current = inspect(&e, &global()).unwrap();
    let after = toggle(
        &e,
        ToggleRequest {
            base_rules: Some(current.rules),
            revision: current.revision,
            target: global(),
            documents: vec![system.state.document_path.clone()],
            enabled: true,
        },
    )
    .unwrap();
    assert!(after
        .skills
        .iter()
        .any(|s| s.state.document_path == system.state.document_path
            && s.state.enabled == Some(true)));
    let command = command(&e, &original, &home);
    for key in [
        "CODEX_ACCESS_TOKEN",
        "OPENAI_API_KEY",
        "CODEX_API_KEY",
        "OPENAI_IDENTITY_TOKEN_FILE",
    ] {
        assert!(command
            .get_envs()
            .any(|(name, value)| name == key && value.is_none()));
    }
}

#[cfg(unix)]
fn before_system_probe(session: &mut Session, cwd: &Path) -> NativeSkill {
    list_skills(session, cwd)
        .unwrap()
        .0
        .into_iter()
        .find(|s| s.state.runtime_scope == "system")
        .unwrap()
}

#[cfg(unix)]
#[test]
#[ignore = "Requires original Codex CLI; isolated local plugin lifecycle and credential trap"]
fn local_plugin_lifecycle_ignores_auxiliary_changes_and_cache_residue() {
    use std::os::unix::fs::PermissionsExt;
    let original = PathBuf::from(std::env::var_os("SKILLS_SPACE_CODEX_TEST_BINARY").unwrap());
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    let root = home.join(".codex");
    fs::create_dir_all(home.join(".local/bin")).unwrap();
    fs::create_dir_all(&root).unwrap();
    assert!(Command::new("mkfifo")
        .arg(root.join("auth.json"))
        .status()
        .unwrap()
        .success());
    fs::write(
        root.join("config.toml"),
        "cli_auth_credentials_store = \"file\"\nmodel = \"before\"\n",
    )
    .unwrap();
    let wrapper = home.join(".local/bin/codex");
    std::os::unix::fs::symlink(&original, &wrapper).unwrap();
    let e = engine(&home);
    let market = fixture.0.join("market");
    let source = market.join("plugins/local");
    fs::create_dir_all(market.join(".agents/plugins")).unwrap();
    fs::create_dir_all(source.join(".codex-plugin")).unwrap();
    let metadata = json!({"name":"local","version":"1.0.0","skills":"./skills/"});
    fs::write(
        source.join(".codex-plugin/plugin.json"),
        metadata.to_string(),
    )
    .unwrap();
    skill(&source.join("skills/one"), "one");
    fs::write(market.join(".agents/plugins/marketplace.json"),json!({"name":"fixture","plugins":[{"name":"local","source":"./plugins/local","policy":{"installation":"AVAILABLE","authentication":"ON_INSTALL"}}]}).to_string()).unwrap();
    cli(
        &e,
        &original,
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
    let mut snapshot = inspect(&e, &global()).unwrap();
    let mut cache = PathBuf::new();
    for action in ["install", "disable", "enable", "uninstall", "install"] {
        let reviewed = snapshot
            .plugins
            .iter()
            .find(|p| p.id == "local@fixture")
            .unwrap()
            .clone();
        // External model edits and optional presentation metadata do not invalidate review.
        let config = fs::read_to_string(root.join("config.toml")).unwrap();
        fs::write(
            root.join("config.toml"),
            config.replace("before", "external"),
        )
        .unwrap();
        if let Some(path) = &reviewed.installed_path {
            cache = PathBuf::from(path);
            let mut changed = metadata.clone();
            changed["description"] = json!(format!("Edited before {action}"));
            changed["author"] = json!({"name":"New author"});
            fs::write(cache.join(".codex-plugin/plugin.json"), changed.to_string()).unwrap();
        }
        if action == "uninstall" {
            // Simulate a native manager retaining its cache after removing installation.
            fs::remove_file(&wrapper).unwrap();
            let quote = |p: &Path| format!("'{}'", p.to_string_lossy().replace('\'', "'\"'\"'"));
            fs::write(&wrapper,format!("#!/bin/sh\nif [ \"$3\" = plugin ] && [ \"$4\" = remove ]; then\n {} \"$@\" || exit $?\n mkdir -p {}\n exit 0\nfi\nexec {} \"$@\"\n",quote(&original),quote(&cache),quote(&original))).unwrap();
            fs::set_permissions(&wrapper, fs::Permissions::from_mode(0o755)).unwrap();
        }
        snapshot = plugin_apply(
            &e,
            PluginRequest {
                remote_plugin_id: None,
                target: global(),
                revision: snapshot.revision,
                plugin_id: reviewed.id,
                fingerprint: reviewed.fingerprint,
                catalog_entry: true,
                action: action.into(),
            },
        )
        .unwrap();
        let actual = snapshot
            .plugins
            .iter()
            .find(|p| p.id == "local@fixture")
            .unwrap();
        assert_eq!(actual.installed, action != "uninstall");
        if action == "disable" {
            assert!(!actual.enabled);
        }
        if action == "enable" {
            assert!(actual.enabled);
        }
        if action == "uninstall" {
            assert!(cache.is_dir());
            assert!(actual.can_install);
        }
        let refreshed = inspect(&e, &global()).unwrap();
        let reread = refreshed
            .plugins
            .iter()
            .find(|p| p.id == actual.id)
            .unwrap();
        assert_eq!(
            (reread.installed, reread.enabled),
            (actual.installed, actual.enabled)
        );
        snapshot = refreshed;
    }
    assert!(fs::read_to_string(root.join("config.toml"))
        .unwrap()
        .contains("external"));
    assert!(fs::read_to_string(root.join("config.toml"))
        .unwrap()
        .contains("\"file\""));
    // Missing optional package metadata is not a lifecycle permission check.
    let installed = snapshot
        .plugins
        .iter()
        .find(|p| p.id == "local@fixture")
        .unwrap()
        .installed_path
        .as_ref()
        .unwrap();
    fs::remove_file(Path::new(installed).join(".codex-plugin/plugin.json")).unwrap();
    snapshot = inspect(&e, &global()).unwrap();
    let damaged = snapshot
        .plugins
        .iter()
        .find(|p| p.id == "local@fixture")
        .unwrap();
    assert!(damaged.can_toggle && damaged.can_uninstall);
    assert!(!damaged.content_verified);
    // Real changes to the reviewed target remain a conflict.
    let p = snapshot
        .plugins
        .iter()
        .find(|p| p.id == "local@fixture")
        .unwrap()
        .clone();
    let changed = plugin_apply(
        &e,
        PluginRequest {
            remote_plugin_id: None,
            target: global(),
            revision: snapshot.revision.clone(),
            plugin_id: p.id.clone(),
            fingerprint: p.fingerprint.clone(),
            catalog_entry: false,
            action: "disable".into(),
        },
    )
    .unwrap();
    assert!(
        !changed
            .plugins
            .iter()
            .find(|x| x.id == p.id)
            .unwrap()
            .enabled
    );
    assert!(plugin_apply(
        &e,
        PluginRequest {
            remote_plugin_id: None,
            target: global(),
            revision: snapshot.revision,
            plugin_id: p.id,
            fingerprint: p.fingerprint,
            catalog_entry: false,
            action: "enable".into()
        }
    )
    .unwrap_err()
    .contains("Plugin changed"));
}
