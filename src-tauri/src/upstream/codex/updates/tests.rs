use super::super::super::tests::{engine, global};
use super::*;
fn migration_root(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("skills-space-codex-update-{name}"))
}
fn recovery(rules: Vec<Value>) -> Recovery {
    Recovery {
        enabled: false,
        old_root: migration_root("old").to_string_lossy().into_owned(),
        path_rules: capture_paths(&rules, &migration_root("old")),
        rules,
        documents: vec![Path::new("skills")
            .join("a")
            .join("SKILL.md")
            .to_string_lossy()
            .into_owned()],
        candidate_fingerprint: "hash".into(),
        candidate_version: Some("2".into()),
        package_fingerprint: None,
        unmapped_rules: vec![],
    }
}
#[test]
fn migration_preserves_names_extensions_order_and_unrelated_edits() {
    let rule = json!({"path":migration_root("old").join("skills").join("a").join("SKILL.md"),"enabled":false,"custom":"keep"});
    let old = recovery(vec![rule.clone()]);
    let current = vec![
        json!({"name":"same-name","enabled":false}),
        rule,
        json!({"name":"concurrent","enabled":true}),
    ];
    let migrated = migrate_rules(&current, &old, &migration_root("new"), &old.documents).unwrap();
    assert_eq!(migrated[0], current[0]);
    assert_eq!(migrated[2], current[2]);
    assert_eq!(
        migrated[1],
        json!({"path":migration_root("new").join("skills").join("a").join("SKILL.md"),"enabled":false,"custom":"keep"})
    );
    assert_eq!(
        migrate_rules(&migrated, &old, &migration_root("new"), &old.documents).unwrap(),
        migrated
    );
}
#[test]
fn migration_rejects_removed_ambiguous_and_concurrently_edited_selectors() {
    let rule = json!({"path":migration_root("old").join("skills").join("a").join("SKILL.md"),"enabled":false});
    let old = recovery(vec![rule.clone()]);
    assert!(migrate_rules(&[rule.clone()], &old, &migration_root("new"), &[]).is_err());
    assert!(migrate_rules(
        &[rule.clone(), rule.clone()],
        &old,
        &migration_root("new"),
        &old.documents
    )
    .is_err());
    assert!(migrate_rules(
        &[json!({"path":migration_root("old").join("skills").join("a").join("SKILL.md"),"enabled":true})],
        &old,
        &migration_root("new"),
        &old.documents
    )
    .is_err());
    assert!(migrate_rules(
        &[
            rule,
            json!({"path":migration_root("old").join("skills").join("b").join("SKILL.md"),"enabled":false})
        ],
        &old,
        &migration_root("new"),
        &old.documents
    )
    .is_err());
}
#[test]
fn fingerprints_are_path_independent_and_include_supporting_content() {
    let fixture = TemporaryDirectory::new().unwrap();
    for name in ["a", "b"] {
        fs::create_dir_all(fixture.0.join(name)).unwrap();
        fs::write(fixture.0.join(name).join("SKILL.md"), "same").unwrap();
    }
    assert_eq!(
        fingerprint(&fixture.0.join("a")),
        fingerprint(&fixture.0.join("b"))
    );
    fs::write(fixture.0.join("b/support.txt"), "extra").unwrap();
    assert_ne!(
        fingerprint(&fixture.0.join("a")),
        fingerprint(&fixture.0.join("b"))
    );
    assert_eq!(fingerprint(&fixture.0.join("missing")), None);
}
#[test]
#[ignore = "Requires original Codex CLI; isolated HOME only"]
fn original_cli_local_update_preserves_disabled_plugin_and_skill_rules() {
    let binary = PathBuf::from(
        std::env::var_os("SKILLS_SPACE_CODEX_TEST_BINARY").expect("Select original CLI"),
    );
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir_all(home.join(".local/bin")).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&binary, home.join(".local/bin/codex")).unwrap();
    fs::create_dir_all(home.join(".codex")).unwrap();
    let e = engine(&home);
    let market = fixture.0.join("market");
    let source = market.join("plugins/demo");
    fs::create_dir_all(source.join(".codex-plugin")).unwrap();
    fs::create_dir_all(market.join(".agents/plugins")).unwrap();
    for name in ["a", "b"] {
        let dir = source.join("skills").join(name);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("SKILL.md"),
            "---\nname: same\ndescription: fixture\n---\nOriginal\n",
        )
        .unwrap();
    }
    let manifest_path = source.join(".codex-plugin/plugin.json");
    let set_version = |value: &str| {
        fs::write(
            &manifest_path,
            json!({"name":"demo","version":value,"skills":"./skills/"}).to_string(),
        )
        .unwrap()
    };
    set_version("1.0.0");
    fs::write(market.join(".agents/plugins/marketplace.json"),json!({"name":"updates","plugins":[{"name":"demo","source":{"source":"local","path":"./plugins/demo"},"policy":{"installation":"AVAILABLE","authentication":"ON_USE"},"category":"Productivity"}]}).to_string()).unwrap();
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
        &["plugin", "add", "demo@updates", "--json"],
    )
    .unwrap();
    let before = inspect(&e, &global()).unwrap();
    let plugin = &before.plugins[0];
    let old = plugin.installed_path.clone().unwrap();
    let rules = vec![
        json!({"name":"unrelated","enabled":false}),
        json!({"path":Path::new(&old).join("skills/a/SKILL.md"),"enabled":false}),
        json!({"path":Path::new(&old).join("skills/b/SKILL.md"),"enabled":true}),
    ];
    let after = rules::save_rules(
        &e,
        rules::RulesRequest {
            base_rules: None,
            target: global(),
            revision: before.revision,
            rules: rules.clone(),
        },
    )
    .unwrap();
    let p = inspect(&e, &global()).unwrap().plugins[0].clone();
    plugin_apply(
        &e,
        PluginRequest {
            remote_plugin_id: None,
            catalog_entry: false,
            target: global(),
            revision: after.revision,
            plugin_id: p.id.clone(),
            fingerprint: p.fingerprint,
            action: "disable".into(),
        },
    )
    .unwrap();
    set_version("1.1.0");
    let config = home.join(".codex/config.toml");
    let config_before = fs::read(&config).unwrap();
    let old_hash = fingerprint(Path::new(&old));
    let reviewed = check(&e, &global(), "demo@updates").unwrap();
    assert_eq!(reviewed.status, "versionChanged");
    assert!(reviewed.can_update);
    assert_eq!(reviewed.local_state, "unknown");
    assert_eq!(fs::read(&config).unwrap(), config_before);
    assert_eq!(fingerprint(Path::new(&old)), old_hash);
    assert!(!record_path(&e, "demo@updates").exists());
    // Confirmation becomes stale on supporting-file edits.
    fs::write(source.join("support.txt"), "new").unwrap();
    assert!(update(&e, &global(), &reviewed)
        .unwrap_err()
        .contains("changed"));
    let reviewed = check(&e, &global(), "demo@updates").unwrap();
    let after = update(&e, &global(), &reviewed).unwrap();
    let plugin = &after.plugins[0];
    assert!(!plugin.enabled);
    assert_eq!(plugin.version.as_deref(), Some("1.1.0"));
    assert_eq!(after.rules[0], rules[0]);
    for i in 1..3 {
        assert_eq!(after.rules[i]["enabled"], rules[i]["enabled"]);
        assert!(after.rules[i]["path"].as_str().unwrap().contains("/1.1.0/"));
    }
    let current = check(&e, &global(), "demo@updates").unwrap();
    assert_eq!(current.status, "current");
    assert_eq!(current.local_state, "unchanged");
    let plugin = after.plugins[0].clone();
    let enabled = plugin_apply(
        &e,
        PluginRequest {
            remote_plugin_id: None,
            catalog_entry: false,
            target: global(),
            revision: after.revision,
            plugin_id: plugin.id.clone(),
            fingerprint: plugin.fingerprint,
            action: "enable".into(),
        },
    )
    .unwrap();
    assert!(enabled
        .skills
        .iter()
        .any(|s| s.state.document_path.ends_with("skills/a/SKILL.md")
            && s.state.enabled == Some(false)));
    assert!(enabled
        .skills
        .iter()
        .any(|s| s.state.document_path.ends_with("skills/b/SKILL.md")
            && s.state.enabled == Some(true)));
    // Same-version content changes must be checked and replaced by the original CLI too.
    fs::write(source.join("support.txt"), "same version changed").unwrap();
    let reviewed = check(&e, &global(), "demo@updates").unwrap();
    assert_eq!(reviewed.status, "contentChanged");
    update(&e, &global(), &reviewed).unwrap();
    assert_eq!(
        check(&e, &global(), "demo@updates").unwrap().status,
        "current"
    );
    let after = inspect(&e, &global()).unwrap();
    let root = PathBuf::from(after.plugins[0].installed_path.as_ref().unwrap());
    fs::write(root.join("support.txt"), "local edit").unwrap();
    assert_eq!(
        check(&e, &global(), "demo@updates").unwrap().local_state,
        "modified"
    );

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let wrapper = home.join(".local/bin/codex");
        fs::remove_file(&wrapper).unwrap();
        let quoted = format!("'{}'", binary.to_string_lossy().replace('\'', "'\"'\"'"));
        fs::write(&wrapper,format!("#!/bin/sh\nwhile [ \"$1\" = -c ]; do shift 2; done\nif [ \"$1\" = plugin ] && [ \"$2\" = add ] && [ \"$3\" != --help ]; then exit 17; fi\nexec {quoted} \"$@\"\n")).unwrap();
        fs::set_permissions(&wrapper, fs::Permissions::from_mode(0o755)).unwrap();
        let reviewed = check(&e, &global(), "demo@updates").unwrap();
        assert!(update(&e, &global(), &reviewed).is_err());
        assert!(
            !check(&e, &global(), "demo@updates").unwrap().recovery,
            "failed command with unchanged installation remains retryable"
        );
        fs::remove_file(&wrapper).unwrap();
        std::os::unix::fs::symlink(&binary, &wrapper).unwrap();
        // Persist a real unfinished update, then simulate a restart and unrelated config edit.
        let snapshot = inspect(&e, &global()).unwrap();
        let plugin = &snapshot.plugins[0];
        set_version("2.0.0");
        let mut saved = record(&e, "demo@updates").unwrap();
        saved.recovery = Some(Recovery {
            enabled: false,
            old_root: plugin.installed_path.clone().unwrap(),
            rules: snapshot.rules.clone(),
            path_rules: capture_paths(
                &snapshot.rules,
                Path::new(plugin.installed_path.as_ref().unwrap()),
            ),
            documents: relative_documents(&root).unwrap(),
            candidate_fingerprint: fingerprint(&source).unwrap(),
            candidate_version: Some("2.0.0".into()),
            package_fingerprint: None,
            unmapped_rules: vec![],
        });
        save(&e, "demo@updates", &saved).unwrap();
        cli(
            &e,
            &binary,
            &home,
            &["plugin", "add", "demo@updates", "--json"],
        )
        .unwrap();
        let mut changed = snapshot.rules.clone();
        changed.push(json!({"name":"concurrent","enabled":false}));
        changed[1]["enabled"] = json!(true);
        let write_rules = |values: &Vec<Value>| {
            let mut session = Session::start(&e, &binary, &home).unwrap();
            let config = read_config(&mut session, &home).unwrap();
            session.call("config/value/write",json!({"keyPath":"skills.config","value":values,"mergeStrategy":"replace","expectedVersion":user_layer(&config).unwrap()["version"]})).unwrap();
        };
        write_rules(&changed);
        let reviewed = check(&e, &global(), "demo@updates").unwrap();
        assert!(reviewed.recovery);
        assert!(update(&e, &global(), &reviewed).is_err());
        assert!(record(&e, "demo@updates").unwrap().recovery.is_some());
        assert!(
            !inspect(&e, &global()).unwrap().plugins[0].enabled,
            "package disable restored even when rules conflict"
        );
        changed[1]["enabled"] = json!(false);
        write_rules(&changed);
        // Break installation to prove recovery never reinstalls the package.
        fs::remove_file(&wrapper).unwrap();
        fs::write(&wrapper,format!("#!/bin/sh\nwhile [ \"$1\" = -c ]; do shift 2; done\nif [ \"$1\" = plugin ] && [ \"$2\" = add ] && [ \"$3\" != --help ]; then exit 17; fi\nexec {quoted} \"$@\"\n")).unwrap();
        fs::set_permissions(&wrapper, fs::Permissions::from_mode(0o755)).unwrap();
        let reviewed = check(&e, &global(), "demo@updates").unwrap();
        let recovered = update(&e, &global(), &reviewed).unwrap();
        assert!(!recovered.plugins[0].enabled);
        assert!(recovered.rules.iter().any(|r| r["name"] == "concurrent"));
        assert!(recovered.rules[1]["path"]
            .as_str()
            .unwrap()
            .contains("/2.0.0/"));
        assert!(!record(&e, "demo@updates").unwrap().recovery.is_some());
    }
    fs::rename(&source, source.with_extension("gone")).unwrap();
    assert!(check(&e, &global(), "demo@updates").is_err());
}

#[test]
fn approved_unmapped_rules_remain_unchanged() {
    let rule = json!({"path":migration_root("old").join("skills").join("a").join("SKILL.md"),"enabled":false});
    let mut old = recovery(vec![rule.clone()]);
    old.unmapped_rules.push(
        migration_root("old")
            .join("skills")
            .join("a")
            .join("SKILL.md")
            .to_string_lossy()
            .into_owned(),
    );
    assert_eq!(
        migrate_rules(&[rule.clone()], &old, &migration_root("new"), &[]).unwrap(),
        vec![rule]
    );
}

#[test]
#[ignore = "Requires original Codex CLI and loopback Git; isolated HOME only"]
fn git_update_reads_origin_preserves_rules_and_does_not_update_other_plugins() {
    git_update_fixture(false);
}
#[test]
#[ignore = "Requires original Codex CLI and loopback Git; isolated HOME only"]
fn claude_marketplace_git_update_reads_origin_and_preserves_other_plugins() {
    git_update_fixture(true);
}
fn git_update_fixture(legacy: bool) {
    let binary = PathBuf::from(std::env::var_os("SKILLS_SPACE_CODEX_TEST_BINARY").unwrap());
    let temp = TemporaryDirectory::new().unwrap();
    let home = temp.0.join("home");
    fs::create_dir_all(home.join(".local/bin")).unwrap();
    fs::create_dir_all(home.join(".codex")).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&binary, home.join(".local/bin/codex")).unwrap();
    let e = engine(&home);
    let market = temp.0.join("origin.git");
    let metadata = if legacy {
        ".claude-plugin"
    } else {
        ".agents/plugins"
    };
    fs::create_dir_all(market.join(metadata)).unwrap();
    for name in ["demo", "other"] {
        let p = market.join(name);
        fs::create_dir_all(p.join(".codex-plugin")).unwrap();
        fs::write(
            p.join(".codex-plugin/plugin.json"),
            json!({"name":name,"version":"1","skills":"./skills/"}).to_string(),
        )
        .unwrap();
        for skill in ["a", "b"] {
            let dir = p.join("skills").join(skill);
            fs::create_dir_all(&dir).unwrap();
            fs::write(
                dir.join("SKILL.md"),
                format!("---\nname: {skill}\ndescription: fixture\n---\nbody"),
            )
            .unwrap();
        }
    }
    // Match mattpocock's source layout: the original installer omits links.
    #[cfg(unix)]
    if legacy {
        for name in ["demo", "other"] {
            fs::write(market.join(name).join("CLAUDE.md"), "Fixture instructions").unwrap();
            std::os::unix::fs::symlink("CLAUDE.md", market.join(name).join("AGENTS.md")).unwrap();
        }
    }
    fs::write(market.join(metadata).join("marketplace.json"),json!({"name":"git-update","plugins":[{"name":"demo","source":"./demo","policy":{"installation":"AVAILABLE","authentication":"ON_USE"}},{"name":"other","source":"./other","policy":{"installation":"AVAILABLE","authentication":"ON_USE"}}]}).to_string()).unwrap();
    let git = |args: &[&str]| {
        let out = Command::new("git")
            .current_dir(&market)
            .args(args)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
    };
    git(&["init", "--quiet"]);
    git(&["add", "."]);
    git(&[
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@invalid",
        "commit",
        "-qm",
        "one",
    ]);
    let origin = git_fixture::GitOrigin::new(&market);
    cli(
        &e,
        &binary,
        &home,
        &["plugin", "marketplace", "add", &origin.url, "--json"],
    )
    .unwrap();
    for id in ["demo@git-update", "other@git-update"] {
        cli(&e, &binary, &home, &["plugin", "add", id, "--json"]).unwrap();
    }
    let before = inspect(&e, &global()).unwrap();
    let p = before
        .plugins
        .iter()
        .find(|p| p.id == "demo@git-update")
        .unwrap();
    let old = PathBuf::from(p.installed_path.as_ref().unwrap());
    let old_rule = json!({"path":old.join("skills/b/SKILL.md"),"enabled":false});
    let rules = vec![
        json!({"path":old.join("skills/a/SKILL.md"),"enabled":false}),
        old_rule.clone(),
    ];
    let mut session = Session::start(&e, &binary, &home).unwrap();
    session
        .call(
            "config/value/write",
            json!({"keyPath":"skills.config","value":rules,"mergeStrategy":"replace"}),
        )
        .unwrap();
    session.call("config/value/write",json!({"keyPath":"plugins.\"demo@git-update\".enabled","value":false,"mergeStrategy":"replace"})).unwrap();
    drop(session);
    // auth.json would block indefinitely if any local update read persistent credentials.
    #[cfg(unix)]
    {
        assert!(Command::new("mkfifo")
            .arg(home.join(".codex/auth.json"))
            .status()
            .unwrap()
            .success());
    }
    fs::write(home.join(".gitconfig"), "[credential]\nhelper = !exit 89\n").unwrap();
    fs::remove_dir_all(market.join("demo/skills/b")).unwrap();
    for name in ["demo", "other"] {
        fs::write(
            market.join(name).join(".codex-plugin/plugin.json"),
            json!({"name":name,"version":"2","skills":"./skills/"}).to_string(),
        )
        .unwrap();
    }
    git(&["add", "."]);
    git(&[
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@invalid",
        "commit",
        "-qm",
        "two",
    ]);
    let config = home.join(".codex/config.toml");
    let config_before = fs::read(&config).unwrap();
    let review = check(&e, &global(), "demo@git-update").unwrap();
    assert_eq!(review.candidate_version.as_deref(), Some("2"));
    assert_eq!(
        review.unmapped_rules,
        vec![old.join("skills/b/SKILL.md").to_string_lossy().to_string()]
    );
    assert_eq!(fs::read(&config).unwrap(), config_before);
    assert_eq!(version(&old).as_deref(), Some("1"));
    assert_eq!(version(Path::new(&p.source_path)).as_deref(), Some("1"));
    // Unrelated settings and rules do not invalidate the review.
    let mut session = Session::start(&e, &binary, &home).unwrap();
    session
        .call(
            "config/value/write",
            json!({"keyPath":"model","value":"unrelated-model","mergeStrategy":"replace"}),
        )
        .unwrap();
    let mut extra = rules;
    extra.push(json!({"name":"unrelated","enabled":false}));
    session
        .call(
            "config/value/write",
            json!({"keyPath":"skills.config","value":extra,"mergeStrategy":"replace"}),
        )
        .unwrap();
    drop(session);
    let after = update(&e, &global(), &review).unwrap();
    let p = after
        .plugins
        .iter()
        .find(|p| p.id == "demo@git-update")
        .unwrap();
    assert!(!p.enabled);
    assert_eq!(p.version.as_deref(), Some("2"));
    assert_eq!(
        after
            .plugins
            .iter()
            .find(|p| p.id == "other@git-update")
            .unwrap()
            .version
            .as_deref(),
        Some("1")
    );
    assert!(after.rules.contains(&old_rule));
    assert!(after.rules.iter().any(|r| r["name"] == "unrelated"));
    assert!(after.rules.iter().any(|r| r["path"]
        .as_str()
        .is_some_and(|p| p.ends_with("/2/skills/a/SKILL.md"))
        && r["enabled"] == false));
    let config = fs::read_to_string(&config).unwrap();
    assert!(config.contains(&origin.url));
    assert!(config.contains("unrelated-model"));
    assert!(!config.contains("candidate"));
    assert_eq!(
        check(&e, &global(), "demo@git-update").unwrap().status,
        "current"
    );
}

#[test]
fn malformed_optional_history_does_not_block_but_recovery_is_not_discarded() {
    let temp = TemporaryDirectory::new().unwrap();
    let e = engine(&temp.0);
    let path = record_path(&e, "demo@market");
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(
        &path,
        br#"{"baseline":42,"installed_path":false,"recovery":null}"#,
    )
    .unwrap();
    let read = record(&e, "demo@market").unwrap();
    assert!(read.baseline.is_none() && read.recovery.is_none());
    fs::write(&path, br#"{"recovery":{"enabled":false}}"#).unwrap();
    assert!(record(&e, "demo@market").is_err());
    assert!(path.exists());
}

#[test]
fn app_runtime_projection_ignores_only_owned_fields_and_restores_them() {
    let fixture = TemporaryDirectory::new().unwrap();
    let old = fixture.0.join("old");
    let new = fixture.0.join("new");
    for (name, server) in [
        ("unified-computer-use", "cua_repl"),
        ("codex-app-tools", "codex_app"),
    ] {
        for root in [&old, &new] {
            fs::create_dir_all(root).unwrap();
            fs::write(root.join("server.mjs"), "original").unwrap();
        }
        let source = json!({"mcpServers":{server:{"command":"node","args":["server.mjs"],"cwd":".","enabled":false,"tools":{"one":{}},"tool_timeout_sec":10}}});
        let mut installed = source.clone();
        let row = &mut installed["mcpServers"][server];
        row["command"] = json!(old.join("server.mjs"));
        row["enabled"] = json!(true);
        row["env"] = json!({"fixture":"opaque-test-value"});
        // CUA does not rewrite cwd, so keep it equal there.
        if server == "codex_app" {
            row["cwd"] = json!(&old);
        }
        fs::write(
            old.join(".mcp.json"),
            serde_json::to_vec_pretty(&installed).unwrap(),
        )
        .unwrap();
        fs::write(new.join(".mcp.json"), serde_json::to_vec(&source).unwrap()).unwrap();
        let plugin:Plugin=serde_json::from_value(json!({"id":format!("{name}@openai-bundled"),"name":name,"marketplace":"openai-bundled","version":"1","installed":true,"installationKnown":true,"enabled":true,"builtin":true,"components":["mcpServers"],"skills":[],"sourcePath":new,"installedPath":old,"canInstall":false,"canToggle":true,"canUninstall":true,"fingerprint":"test","contentVerified":true})).unwrap();
        let policy = runtime_config::fields(&plugin);
        assert_ne!(fingerprint(&old), fingerprint(&new));
        assert_eq!(
            runtime_config::fingerprint(&old, policy),
            runtime_config::fingerprint(&new, policy)
        );
        assert_ne!(
            runtime_config::fingerprint(&old, None),
            runtime_config::fingerprint(&new, None)
        );
        let captured = runtime_config::capture(&plugin).unwrap().unwrap();
        let mut changed = source.clone();
        changed["mcpServers"][server]["tool_timeout_sec"] = json!(20);
        fs::write(new.join(".mcp.json"), serde_json::to_vec(&changed).unwrap()).unwrap();
        assert_ne!(
            runtime_config::fingerprint(&old, policy),
            runtime_config::fingerprint(&new, policy)
        );
        runtime_config::restore(&new, &captured).unwrap();
        let actual: Value =
            serde_json::from_slice(&fs::read(new.join(".mcp.json")).unwrap()).unwrap();
        assert_eq!(actual["mcpServers"][server]["enabled"], true);
        assert_eq!(
            actual["mcpServers"][server]["command"],
            json!(new.join("server.mjs"))
        );
        assert_eq!(actual["mcpServers"][server]["tool_timeout_sec"], 20);
        fs::write(new.join("server.mjs"), "real-release-change").unwrap();
        assert_ne!(
            runtime_config::fingerprint(&old, policy),
            runtime_config::fingerprint(&new, policy)
        );
    }
}

#[test]
#[ignore = "Requires original Codex CLI; isolated App marketplace only"]
fn original_app_runtime_updates_preserve_injection_and_native_state() {
    let binary = PathBuf::from(
        std::env::var_os("SKILLS_SPACE_CODEX_TEST_BINARY").expect("Select original CLI"),
    );
    for (name, server) in [
        ("codex-app-tools", "codex_app"),
        ("unified-computer-use", "cua_repl"),
    ] {
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        fs::create_dir_all(home.join(".local/bin")).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&binary, home.join(".local/bin/codex")).unwrap();
        let e = engine(&home);
        let market = home.join(".codex/.tmp/bundled-marketplaces/openai-bundled");
        let source = market.join("plugins").join(name);
        fs::create_dir_all(source.join(".codex-plugin")).unwrap();
        fs::create_dir_all(market.join(".agents/plugins")).unwrap();
        let set_version = |v: &str| {
            fs::write(
                source.join(".codex-plugin/plugin.json"),
                json!({"name":name,"version":v,"mcpServers":"./.mcp.json"}).to_string(),
            )
            .unwrap()
        };
        set_version("1.0.0");
        fs::write(source.join("server.mjs"), "original package").unwrap();
        let template = json!({"mcpServers":{server:{"command":"node","args":[],"enabled":false,"tool_timeout_sec":10}}});
        fs::write(source.join(".mcp.json"), template.to_string()).unwrap();
        fs::write(market.join(".agents/plugins/marketplace.json"),json!({"name":"openai-bundled","plugins":[{"name":name,"source":{"source":"local","path":format!("./plugins/{name}")},"policy":{"installation":"AVAILABLE","authentication":"ON_USE"},"category":"Productivity"}]}).to_string()).unwrap();
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
        let id = format!("{name}@openai-bundled");
        cli(&e, &binary, &home, &["plugin", "add", &id, "--json"]).unwrap();
        let snapshot = inspect(&e, &global()).unwrap();
        let p = snapshot.plugins.iter().find(|p| p.id == id).unwrap();
        let old = PathBuf::from(p.installed_path.as_ref().unwrap());
        let mut injected = template.clone();
        injected["mcpServers"][server]["enabled"] = json!(true);
        injected["mcpServers"][server]["command"] = json!(old.join("server.mjs"));
        injected["mcpServers"][server]["env"] = json!({"fixture":"no-real-credentials"});
        fs::write(old.join(".mcp.json"), injected.to_string()).unwrap();
        let snapshot = inspect(&e, &global()).unwrap();
        let p = snapshot.plugins.iter().find(|p| p.id == id).unwrap();
        plugin_apply(
            &e,
            PluginRequest {
                remote_plugin_id: None,
                target: global(),
                revision: snapshot.revision.clone(),
                plugin_id: id.clone(),
                fingerprint: p.fingerprint.clone(),
                catalog_entry: false,
                action: "disable".into(),
            },
        )
        .unwrap();
        let current = check(&e, &global(), &id).unwrap();
        assert_eq!(current.status, "current");
        assert!(!current.can_update);
        set_version("2.0.0");
        fs::write(source.join("server.mjs"), "real updated package").unwrap();
        let review = check(&e, &global(), &id).unwrap();
        assert_eq!(review.status, "versionChanged");
        assert!(review.can_update);
        let after = update(&e, &global(), &review).unwrap();
        let p = after.plugins.iter().find(|p| p.id == id).unwrap();
        assert!(!p.enabled);
        assert_eq!(p.version.as_deref(), Some("2.0.0"));
        let root = Path::new(p.installed_path.as_ref().unwrap());
        assert_eq!(
            fs::read_to_string(root.join("server.mjs")).unwrap(),
            "real updated package"
        );
        let config: Value =
            serde_json::from_slice(&fs::read(root.join(".mcp.json")).unwrap()).unwrap();
        assert_eq!(config["mcpServers"][server]["enabled"], true);
        assert_eq!(
            config["mcpServers"][server]["command"],
            json!(root.join("server.mjs"))
        );
        assert_eq!(
            config["mcpServers"][server]["env"]["fixture"],
            "no-real-credentials"
        );
        assert_eq!(check(&e, &global(), &id).unwrap().status, "current");
        fs::write(source.join("server.mjs"), "same-version package change").unwrap();
        let review = check(&e, &global(), &id).unwrap();
        assert_eq!(review.status, "contentChanged");
        assert!(review.can_update);
        let updated = update(&e, &global(), &review).unwrap();
        let p = updated.plugins.iter().find(|p| p.id == id).unwrap();
        assert!(!p.enabled);
        let root = Path::new(p.installed_path.as_ref().unwrap());
        assert_eq!(
            fs::read_to_string(root.join("server.mjs")).unwrap(),
            "same-version package change"
        );
        assert_eq!(check(&e, &global(), &id).unwrap().status, "current");
        assert!(source.join(".codex-plugin/plugin.json").is_file());
    }
}
