use super::*;
pub(super) fn file_url(path: &Path) -> String {
    reqwest::Url::from_file_path(path).unwrap().to_string()
}
#[test]
fn fixture_file_urls_preserve_reserved_characters_and_native_paths() {
    let fixture = TemporaryDirectory::new().unwrap();
    let path = fixture.0.join("repository with # and %");
    let value = file_url(&path);
    assert!(!value.contains('\\'));
    assert!(value.contains("%23"));
    assert!(value.contains("%25"));
    assert_eq!(
        reqwest::Url::parse(&value).unwrap().to_file_path().unwrap(),
        path
    );
}
#[test]
fn rust_and_node_canonical_paths_agree_for_existing_platform_directories() {
    let fixture = TemporaryDirectory::new().unwrap();
    let path = fixture.0.join("canonical fixture with spaces");
    fs::create_dir(&path).unwrap();
    let e = engine(&fixture.0);
    let result = run_process(
        e.command(&e.node, &fixture.0)
            .args(["--input-type=module", "-e", "import {realpathSync, promises} from 'node:fs'; console.log(JSON.stringify([realpathSync.native(process.argv[1]), await promises.realpath(process.argv[1])]));"])
            .arg(&path),
    ).unwrap();
    assert!(result.success, "{}", result.stderr);
    let observed: Vec<String> = serde_json::from_str(result.stdout.trim()).unwrap();
    let expected = dunce::canonicalize(&path)
        .unwrap()
        .to_string_lossy()
        .into_owned();
    assert_eq!(observed, vec![expected.clone(), expected]);
}
#[test]
fn tree_signature_uses_portable_member_names_without_normalizing_file_bytes() {
    let fixture = TemporaryDirectory::new().unwrap();
    let root = fixture.0.join("tree");
    fs::create_dir_all(root.join("assets")).unwrap();
    let document = b"---\r\nname: demo\r\n---\r\nBody\r\n";
    let binary = [0, 255, 13, 10, 92];
    fs::write(root.join("SKILL.md"), document).unwrap();
    fs::write(root.join("assets").join("example.bin"), binary).unwrap();
    let mut expected = Vec::new();
    for (name, bytes) in [
        ("SKILL.md", document.as_slice()),
        ("assets/example.bin", binary.as_slice()),
    ] {
        expected.extend_from_slice(&(name.len() as u64).to_le_bytes());
        expected.extend_from_slice(name.as_bytes());
        expected.extend_from_slice(&(bytes.len() as u64).to_le_bytes());
        expected.extend_from_slice(bytes);
    }
    assert_eq!(tree_signature(&root).unwrap(), expected);
    assert_eq!(source_install_signature(&root).unwrap(), expected);
    fs::write(
        root.join("SKILL.md"),
        document
            .split(|byte| *byte == 13)
            .flatten()
            .copied()
            .collect::<Vec<_>>(),
    )
    .unwrap();
    assert_ne!(
        tree_signature(&root).unwrap(),
        expected,
        "Line ending changes remain actual content changes"
    );
}
pub(super) fn declare_dependency(path: &Path) {
    let parts: Vec<_> = path.components().collect();
    let Some(index) = parts.iter().position(|p| p.as_os_str() == "node_modules") else {
        return;
    };
    let project: PathBuf = parts[..index].iter().collect();
    let Some(first) = parts.get(index + 1) else {
        return;
    };
    let end = index
        + if first.as_os_str().to_string_lossy().starts_with('@') {
            3
        } else {
            2
        };
    if parts.len() < end {
        return;
    }
    let package: PathBuf = parts[..end].iter().collect();
    let name = parts[index + 1..end]
        .iter()
        .map(|p| p.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/");
    fs::create_dir_all(&package).unwrap();
    if !package.join("package.json").exists() {
        fs::write(
            package.join("package.json"),
            serde_json::to_vec(&serde_json::json!({"name":name,"version":"1.0.0"})).unwrap(),
        )
        .unwrap();
    }
    let manifest = project.join("package.json");
    let mut data: serde_json::Value = fs::read(&manifest)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or(serde_json::json!({"dependencies":{}}));
    data["dependencies"][&name] = "1.0.0".into();
    fs::write(manifest, serde_json::to_vec(&data).unwrap()).unwrap();
}
pub(super) fn engine(home: &Path) -> Engine {
    // Snapshot staging resources for fixtures when other builds share this checkout.
    let base = std::env::var_os("SKILLS_SPACE_TEST_RUNTIME_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")));
    let node = node_runtime::test_node();
    Engine {
        test_trace: None,
        node,
        resources: base.join("resources/upstream"),
        home: home.into(),
        isolated: true,
        progress: None,
    }
}
pub(super) fn global() -> Target {
    Target {
        host: "local".into(),
        scope: "global".into(),
        project_path: None,
    }
}

#[cfg(unix)]
#[test]
fn runtime_children_use_the_selected_node_directory_without_changing_host_path() {
    use std::os::unix::fs::PermissionsExt;
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir_all(&home).unwrap();
    let mut e = engine(&home);
    let selected = home.join("chosen runtime/node");
    fs::create_dir_all(selected.parent().unwrap()).unwrap();
    fs::write(&selected, "#!/bin/sh\nprintf 'v22.20.0\\n'\n").unwrap();
    fs::set_permissions(&selected, fs::Permissions::from_mode(0o755)).unwrap();
    e.node = selected.clone();
    let host_path = std::env::var_os("PATH");
    let mut command = e.command(Path::new("/usr/bin/env"), &home);
    let child_path = command
        .get_envs()
        .find(|(key, _)| *key == "PATH")
        .and_then(|(_, value)| value)
        .unwrap();
    assert_eq!(
        std::env::split_paths(child_path).next(),
        selected.parent().map(Path::to_path_buf)
    );
    let result = run_process(command.args(["node", "--version"])).unwrap();
    assert!(result.success, "{}", result.stderr);
    assert_eq!(result.stdout.trim(), "v22.20.0");
    assert_eq!(std::env::var_os("PATH"), host_path);
}

#[cfg(unix)]
#[test]
fn runtime_child_npm_uses_the_selected_installation_without_user_npm_configuration() {
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir_all(&home).unwrap();
    let e = engine(&home);
    if !e.node.parent().unwrap().join("npm").is_file() {
        return;
    }
    let user = home.join("empty-user-npmrc");
    let global = home.join("empty-global-npmrc");
    fs::write(&user, "").unwrap();
    fs::write(&global, "").unwrap();
    let mut command = e.command(Path::new("npm"), &home);
    command
        .env("NPM_CONFIG_USERCONFIG", user)
        .env("NPM_CONFIG_GLOBALCONFIG", global)
        .env("npm_config_cache", home.join("cache"))
        .arg("--version");
    let result = run_process(&mut command).unwrap();
    assert!(result.success, "{}", result.stderr);
    assert!(result.stdout.trim().split('.').count() >= 3);
}
fn source(path: &Path, name: &str) {
    fs::create_dir_all(path).unwrap();
    fs::write(path.join("SKILL.md"), format!("---\nname: {name}\ndescription: Fixture skill for isolated lifecycle verification\n---\n# Fixture\n")).unwrap();
}
pub(super) fn addition(source: &Path, target: Target, copy: bool) -> Operation {
    Operation {
        dsh_context_key: None,
        target,
        action: "add".into(),
        source: Some(source.to_str().unwrap().into()),
        skills: vec!["fixture-skill".into()],
        agents: vec!["codex".into(), "claude-code".into()],
        copy,
        source_hashes: None,
        include_internal: false,
        removals: None,
        removal_source: None,
        inspection_session: None,
        sync_origin: None,
        eve_subagents: Vec::new(),
    }
}
#[test]
fn real_cli_install_verification_matches_upstream_excluded_files() {
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir_all(home.join(".codex")).unwrap();
    let root = fixture.0.join("source");
    source(&root, "fixture-skill");
    fs::create_dir_all(root.join("nested")).unwrap();
    fs::write(root.join("metadata.json"), "{}").unwrap();
    fs::write(root.join("nested/metadata.json"), "{}").unwrap();
    fs::write(root.join("nested/reference.md"), "Keep this content").unwrap();
    for dir in ["__pycache__", "nested/__pypackages__"] {
        fs::create_dir_all(root.join(dir)).unwrap();
        fs::write(root.join(dir).join("cache"), "ignored").unwrap();
    }
    let engine = engine(&home);
    for copy in [false, true] {
        let result = apply(&engine, &addition(&root, global(), copy)).unwrap();
        assert!(
            result.items.iter().all(|item| item.status == "complete"),
            "{}",
            result.logs
        );
        let installed = home.join(".agents/skills/fixture-skill");
        assert!(!installed.join("metadata.json").exists());
        assert!(!installed.join("nested/metadata.json").exists());
        assert!(!installed.join("__pycache__").exists());
        assert!(!installed.join("nested/__pypackages__").exists());
        assert!(installed.join("nested/reference.md").exists());
        assert_eq!(source_install_signature(&root), tree_signature(&installed));
        fs::write(installed.join("extra.md"), "Must remain observable").unwrap();
        assert_ne!(source_install_signature(&root), tree_signature(&installed));
    }
}
#[test]
fn pinned172_shared_paths_bom_metadata_and_local_source_lock() {
    let f = TemporaryDirectory::new().unwrap();
    let home = f.0.join("home");
    fs::create_dir_all(home.join(".codex")).unwrap();
    let e = engine(&home);
    let catalog = e.agents(&global()).unwrap();
    let definitions: Vec<AgentDefinition> =
        serde_json::from_slice(&fs::read(e.resources.join("agents.json")).unwrap()).unwrap();
    assert_eq!(definitions.len(), 79);
    assert_eq!(catalog.len(), 78); // Two upstream Agents exclude global scope; DSH is an application adapter.
    assert!(catalog
        .iter()
        .any(|agent| agent.id == dsh::ID && agent.shared_directory));
    for id in ["codex", "pi", "droid", "kilo", "sarvam-code"] {
        assert_eq!(
            catalog.iter().find(|a| a.id == id).unwrap().path,
            home.join(".agents/skills").to_string_lossy()
        );
    }
    for id in ["fx", "minimax-code", "posit-assistant", "sarvam-code"] {
        assert!(catalog.iter().any(|a| a.id == id));
    }
    let source = f.0.join("source");
    fs::create_dir(&source).unwrap();
    fs::write(
        source.join("SKILL.md"),
        "\u{feff}---\nname: constructor\ndescription: BOM fixture\n---\nBody\n",
    )
    .unwrap();
    let preview = inspect(&e, source.to_str().unwrap()).unwrap();
    assert_eq!(preview.skills[0].name, "constructor");
    let mut op = addition(&source, global(), true);
    op.skills = vec!["constructor".into()];
    op.agents = vec!["codex".into()];
    let result = apply(&e, &op).unwrap();
    assert_eq!(result.items[0].status, "complete", "{}", result.logs);
    assert_eq!(
        e.lock(&global()).unwrap()["skills"]["constructor"]["sourceType"],
        "local"
    );
    op.action = "remove".into();
    let result = apply(&e, &op).unwrap();
    assert_eq!(result.items[0].status, "complete", "{}", result.logs);
    assert!(e.lock(&global()).unwrap()["skills"]["constructor"].is_null());
    assert!(source.join("SKILL.md").is_file());
}
#[test]
fn shared_skills_do_not_detect_uninstalled_agents() {
    let home = TemporaryDirectory::new().unwrap();
    fs::create_dir_all(home.0.join(".agents/skills")).unwrap();
    let engine = engine(&home.0);
    let agents = engine.agents(&global()).unwrap();
    for id in ["gemini-cli", "opencode", "github-copilot"] {
        let agent = agents.iter()
            .find(|agent| agent.id == id)
            .unwrap();
        assert!(
            agent.directory_exists,
            "{id} shares the existing skills directory"
        );
        assert!(!agent.detected, "shared skills alone must not detect {id}");
    }
    let cursor = agents.iter()
        .find(|agent| agent.id == "cursor")
        .unwrap();
    assert!(!cursor.detected);
    fs::create_dir_all(home.0.join(".cursor")).unwrap();
    let cursor = engine
        .agents(&global())
        .unwrap()
        .into_iter()
        .find(|agent| agent.id == "cursor")
        .unwrap();
    assert!(cursor.detected);
}
#[test]
fn rejects_remote_and_invalid_project_before_process_execution() {
    let home = TemporaryDirectory::new().unwrap();
    assert!(Target {
        host: "server".into(),
        ..global()
    }
    .directory(&home.0)
    .is_err());
    assert!(Target {
        host: "local".into(),
        scope: "project".into(),
        project_path: Some("relative".into())
    }
    .directory(&home.0)
    .is_err());
    assert!(Target {
        project_path: Some("/tmp".into()),
        ..global()
    }
    .directory(&home.0)
    .is_err());
}
#[test]
fn preview_uses_upstream_yaml_and_hides_internal_sources() {
    let home = TemporaryDirectory::new().unwrap();
    let engine = engine(&home.0);
    source(&home.0.join("valid"), "example");
    fs::write(home.0.join("valid/SKILL.md"), "---\nname: example # valid comment\ndescription: |-\n  first line\n  second line\nmetadata: {category: tools}\n---\n").unwrap();
    source(&home.0.join("hidden"), "hidden");
    fs::write(
        home.0.join("hidden/SKILL.md"),
        "---\nname: hidden\ndescription: hidden\nmetadata: {internal: true}\n---\n",
    )
    .unwrap();
    let preview = inspect(&engine, home.0.to_str().unwrap()).unwrap();
    assert_eq!(preview.skills.len(), 1);
    assert_eq!(preview.skills[0].description, "first line second line");
    fs::write(
        home.0.join("hidden/SKILL.md"),
        "---\nname: example\ndescription: hidden collision\nmetadata: {internal: true}\n---\n",
    )
    .unwrap();
    let visible = inspect(&engine, home.0.to_str().unwrap()).unwrap();
    assert_eq!(visible.skills.len(), 1);
    assert_eq!(visible.skills[0].path, "valid");
    let internal = inspect_with_options(&engine, home.0.to_str().unwrap(), true).unwrap();
    assert_eq!(internal.skills.len(), 1);
    assert_eq!(internal.skills[0].path, "hidden");
    assert!(internal.skills[0].internal);
}
#[test]
fn real_explicit_internal_selection_installs_only_selected_skills_in_both_scopes() {
    for project_scope in [false, true] {
        let fixture = TemporaryDirectory::new().unwrap();
        let home = fixture.0.join("home");
        let project = fixture.0.join("project");
        let root = fixture.0.join("source");
        fs::create_dir_all(home.join(".codex")).unwrap();
        fs::create_dir_all(&project).unwrap();
        source(&root.join("public"), "public-skill");
        source(&root.join("internal"), "internal-skill");
        fs::write(root.join("internal/SKILL.md"), "---\nname: internal-skill\ndescription: Internal fixture\nmetadata: {internal: true}\n---\n# Private workflow\n").unwrap();
        source(&root.join("unselected"), "unselected-skill");
        fs::write(root.join("unselected/SKILL.md"), "---\nname: unselected-skill\ndescription: Unselected internal\nmetadata: {internal: true}\n---\n").unwrap();
        let engine = engine(&home);
        let target = if project_scope {
            Target {
                host: "local".into(),
                scope: "project".into(),
                project_path: Some(project.to_string_lossy().into_owned()),
            }
        } else {
            global()
        };
        let preview = inspect(&engine, root.to_str().unwrap()).unwrap();
        assert_eq!(preview.skills.len(), 1);
        assert!(!preview.skills[0].internal);
        let mut operation = addition(&root, target.clone(), project_scope);
        operation.agents = vec!["codex".into()];
        operation.skills = vec!["internal-skill".into()];
        assert!(apply(&engine, &operation).is_err());
        let preview = inspect_with_options(&engine, root.to_str().unwrap(), true).unwrap();
        assert_eq!(preview.skills.iter().filter(|s| s.internal).count(), 2);
        operation.include_internal = true;
        operation.source_hashes = Some(
            preview
                .skills
                .iter()
                .map(|s| (s.name.clone(), s.fingerprint.clone()))
                .collect(),
        );
        let result = apply(&engine, &operation).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        let inventory = result.inventory.unwrap();
        assert_eq!(inventory.skills.len(), 1);
        assert_eq!(inventory.skills[0].name, "internal-skill");
        if project_scope {
            assert!(engine.lock(&target).unwrap()["skills"]["internal-skill"].is_object());
        } else {
            assert_eq!(
                engine.lock(&target).unwrap()["skills"]["internal-skill"]["sourceType"],
                "local"
            );
        }
        let remove = Operation {
            action: "remove".into(),
            include_internal: false,
            source_hashes: None,
            ..operation
        };
        let result = apply(&engine, &remove).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        assert!(result.inventory.unwrap().skills.is_empty());
        assert!(root.join("internal/SKILL.md").is_file());
    }
}
#[test]
fn installed_internal_git_skill_updates_without_reselecting_internal() {
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    let project = fixture.0.join("project");
    let repo = fixture.0.join("repo");
    fs::create_dir_all(home.join(".codex")).unwrap();
    fs::create_dir_all(&project).unwrap();
    let path = repo.join("skills/internal-skill");
    source(&path, "internal-skill");
    fs::write(path.join("SKILL.md"),"---\nname: internal-skill\ndescription: Internal git fixture\nmetadata: {internal: true}\n---\n").unwrap();
    fs::write(path.join("version.txt"), "one").unwrap();
    let engine = engine(&home);
    assert!(
        run_process(
            engine
                .command(Path::new("git"), &repo)
                .args(["init", "-q", "-b", "main"])
        )
        .unwrap()
        .success
    );
    git_commit(&engine, &repo, "initial");
    let url = "https://skills-fixture.invalid/internal/repo.git";
    fs::write(
        home.join(".gitconfig"),
        format!(
            "[url \"{}\"]\n    insteadOf = {url}\n",
            crate::upstream::tests::file_url(&repo)
        ),
    )
    .unwrap();
    let target = global();
    let preview = inspect_with_options(&engine, url, true).unwrap();
    let mut op = addition(&path, target.clone(), false);
    op.agents = vec!["codex".into()];
    op.source = Some(url.into());
    op.skills = vec!["internal-skill".into()];
    op.include_internal = true;
    op.source_hashes = Some(
        preview
            .skills
            .iter()
            .map(|s| (s.name.clone(), s.fingerprint.clone()))
            .collect(),
    );
    let result = apply(&engine, &op).unwrap();
    assert_eq!(result.items[0].status, "complete", "{}", result.logs);
    assert!(engine.lock(&target).unwrap()["skills"]["internal-skill"].is_object());
    assert_eq!(
        check_updates(&engine, &target).unwrap()[0].status,
        "current"
    );
    fs::write(path.join("version.txt"), "two").unwrap();
    git_commit(&engine, &repo, "version two");
    assert_eq!(
        check_updates(&engine, &target).unwrap()[0].status,
        "available"
    );
    op.action = "update".into();
    op.include_internal = false;
    op.agents.clear();
    op.source_hashes = None;
    let result = apply(&engine, &op).unwrap();
    assert_eq!(result.items[0].status, "complete", "{}", result.logs);
    assert!(result
        .inventory
        .unwrap()
        .skills
        .iter()
        .all(|s| fs::read_to_string(Path::new(&s.path).join("version.txt")).unwrap() == "two"));
    assert_eq!(
        check_updates(&engine, &target).unwrap()[0].status,
        "current"
    );
    op.action = "remove".into();
    op.agents = vec!["codex".into()];
    let result = apply(&engine, &op).unwrap();
    assert_eq!(result.items[0].status, "complete", "{}", result.logs);
    assert!(result.inventory.unwrap().skills.is_empty());
}
#[test]
fn internal_preview_rechecks_content_flags_and_duplicate_names_before_installation() {
    let fixture = TemporaryDirectory::new().unwrap();
    let root = fixture.0.join("source");
    source(&root.join("internal"), "internal-skill");
    let path = root.join("internal/SKILL.md");
    fs::write(&path,"---\nname: internal-skill\ndescription: Internal fixture\nmetadata: {internal: true}\n---\n").unwrap();
    let engine = engine(&fixture.0);
    assert!(inspect(&engine, root.to_str().unwrap()).is_err());
    let preview = inspect_with_options(&engine, root.to_str().unwrap(), true).unwrap();
    let mut operation = addition(&root, global(), false);
    operation.skills = vec!["internal-skill".into()];
    operation.include_internal = true;
    operation.source_hashes = Some(
        preview
            .skills
            .iter()
            .map(|s| (s.name.clone(), s.fingerprint.clone()))
            .collect(),
    );
    fs::write(&path,"---\nname: internal-skill\ndescription: Changed fixture\nmetadata: {internal: true}\n---\n").unwrap();
    assert!(apply(&engine, &operation)
        .err()
        .unwrap()
        .contains("Source content changed"));
    assert!(!fixture.0.join(".agents/skills").exists());
    source(&root.join("duplicate"), "internal-skill");
    let selected = inspect_with_options(&engine, root.to_str().unwrap(), true).unwrap();
    assert_eq!(selected.skills.len(), 1);
    assert_eq!(selected.skills[0].path, "duplicate");
    assert!(!selected.skills[0].internal);
    assert_eq!(
        inspect(&engine, root.to_str().unwrap()).unwrap().skills[0].path,
        "duplicate"
    );
    assert!(apply(&engine, &operation)
        .err()
        .unwrap()
        .contains("Source content changed"));
    operation.action = "remove".into();
    assert!(operation_args(&engine, &operation).is_err());
}
#[test]
fn pinned_source_parser_resolves_prefixes_aliases_filters_and_custom_host() {
    let fixture = TemporaryDirectory::new().unwrap();
    let engine = engine(&fixture.0);
    for (input, url, reference, filter) in [
        (
            "github:owner/repo@My-Skill",
            "https://github.com/owner/repo.git",
            None,
            Some("My-Skill"),
        ),
        (
            "gitlab:team/repo/-/tree/main/skills",
            "https://gitlab.com/team/repo.git",
            Some("main"),
            None,
        ),
        (
            "vercel-labs/vercel-skills",
            "https://github.com/vercel-labs/agent-skills.git",
            None,
            None,
        ),
        (
            "coinbase/agentWallet",
            "https://github.com/coinbase/agentic-wallet-skills.git",
            None,
            None,
        ),
        (
            "owner/repo#release%2Fone@my-skill",
            "https://github.com/owner/repo.git",
            Some("release/one"),
            Some("my-skill"),
        ),
        (
            "owner/repo#@my-skill",
            "https://github.com/owner/repo.git",
            None,
            Some("my-skill"),
        ),
        (
            "owner/repo@old#main@new",
            "https://github.com/owner/repo.git",
            Some("main"),
            Some("new"),
        ),
    ] {
        let p = parsed_source(&engine, input).unwrap();
        assert_eq!(p.url, url);
        assert_eq!(p.reference.as_deref(), reference);
        assert_eq!(p.skill_filter.as_deref(), filter);
        assert_eq!(p.source_type, if input.starts_with("gitlab:") { "gitlab" } else { "github" });
        parsed_git_location(&p).unwrap();
    }
    let output = run_process(
        engine
            .command(&engine.node, &engine.home)
            .env("GH_HOST", "enterprise.example.invalid")
            .arg(engine.resources.join("inspect-upstream-source.mjs"))
            .arg("owner/repo#main@my-skill"),
    )
    .unwrap();
    let parsed: ParsedSource = serde_json::from_str(&output.stdout).unwrap();
    assert_eq!(
        parsed.url,
        "https://enterprise.example.invalid/owner/repo.git"
    );
    assert_eq!(parsed.source_type, "git");
    parsed_git_location(&parsed).unwrap();
    assert!(parsed_source(&engine, "owner/repo@*").is_err());
    assert!(parsed_source(&engine, "owner/repo#main@%0Ahidden").is_err());
    assert!(parsed_source(&engine, "github:owner/repo/../escape").is_err());
    for input in [
        "https://secret@example.invalid/repo.git",
        "https://secret@github.com/owner/repo",
        "github:https://secret@github.com/owner/repo",
        "https://github.com/owner/repo?token=fixture",
    ] {
        assert!(parsed_source(&engine, input).is_err());
    }
}
#[test]
fn real_source_alias_prefix_and_filter_install_only_reviewed_skill_in_both_scopes() {
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    let project = fixture.0.join("project");
    let repo = fixture.0.join("repo");
    fs::create_dir_all(home.join(".codex")).unwrap();
    fs::create_dir_all(&project).unwrap();
    source(&repo.join("skills/first"), "fixture-skill");
    source(&repo.join("skills/second"), "other-skill");
    let engine = engine(&home);
    assert!(
        run_process(
            engine
                .command(Path::new("git"), &repo)
                .args(["init", "-q", "-b", "main"])
        )
        .unwrap()
        .success
    );
    git_commit(&engine, &repo, "sources");
    assert!(
        run_process(
            engine
                .command(Path::new("git"), &repo)
                .args(["branch", "release/one"])
        )
        .unwrap()
        .success
    );
    let mut config = String::new();
    for url in [
        "https://github.com/owner/repo.git",
        "https://gitlab.com/group/repo.git",
        "https://github.com/vercel-labs/agent-skills.git",
        "https://github.com/coinbase/agentic-wallet-skills.git",
    ] {
        config.push_str(&format!(
            "[url \"{}\"]\n    insteadOf = {url}\n",
            crate::upstream::tests::file_url(&repo)
        ));
    }
    fs::write(home.join(".gitconfig"), config).unwrap();
    for (input, project_scope) in [
        ("github:owner/repo@FIXTURE-SKILL", false),
        ("gitlab:group/repo", true),
        ("owner/repo#release%2Fone@fixture-skill", false),
    ] {
        let target = if !project_scope {
            global()
        } else {
            Target {
                host: "local".into(),
                scope: "project".into(),
                project_path: Some(project.to_string_lossy().into_owned()),
            }
        };
        // Spelling/ref variants are owned by pinned_source_parser_* .
        let preview = inspect(&engine, input).unwrap();
        assert_eq!(
            preview.skills.len(),
            if preview.skill_filter.is_some() { 1 } else { 2 }
        );
        assert_eq!(preview.skills[0].name, "fixture-skill");
        assert_eq!(preview.skills[0].path, "skills/first");
        let mut op = addition(&repo, target.clone(), project_scope);
        op.agents = vec!["codex".into()];
        op.source = Some(input.into());
        op.source_hashes = Some(
            preview
                .skills
                .iter()
                .map(|s| (s.name.clone(), s.fingerprint.clone()))
                .collect(),
        );
        let result = apply(&engine, &op).unwrap();
        assert_eq!(
            result.items[0].status, "complete",
            "{input}: {}",
            result.logs
        );
        let installed = result.inventory.unwrap();
        assert_eq!(installed.skills.len(), 1);
        assert_eq!(installed.skills[0].name, "fixture-skill");
        assert!(engine.lock(&target).unwrap()["skills"]["fixture-skill"].is_object());
        op.action = "remove".into();
        op.source_hashes = None;
        let result = apply(&engine, &op).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        assert!(result.inventory.unwrap().skills.is_empty());
    }
}
#[test]
fn source_filter_miss_hidden_ambiguity_and_extra_selection_do_not_install() {
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    let repo = fixture.0.join("repo");
    fs::create_dir_all(&home).unwrap();
    source(&repo.join("first"), "fixture-skill");
    source(&repo.join("second"), "other-skill");
    fs::write(
        repo.join("second/SKILL.md"),
        "---\nname: other-skill\ndescription: hidden\nmetadata: {internal: true}\n---\n",
    )
    .unwrap();
    let engine = engine(&home);
    assert!(
        run_process(
            engine
                .command(Path::new("git"), &repo)
                .args(["init", "-q", "-b", "main"])
        )
        .unwrap()
        .success
    );
    git_commit(&engine, &repo, "filter fixture");
    fs::write(
        home.join(".gitconfig"),
        format!(
            "[url \"{}\"]\n    insteadOf = https://github.com/owner/repo.git\n",
            crate::upstream::tests::file_url(&repo)
        ),
    )
    .unwrap();
    assert!(inspect(&engine, "owner/repo@missing").is_err());
    assert!(inspect(&engine, "owner/repo@other-skill").is_err());
    let hidden = inspect_with_options(&engine, "owner/repo@other-skill", true).unwrap();
    assert_eq!(hidden.skills.len(), 1);
    assert!(hidden.skills[0].internal);
    let preview = inspect(&engine, "owner/repo@fixture-skill").unwrap();
    let mut op = addition(&repo, global(), false);
    op.source = Some(preview.source);
    op.skills = vec!["other-skill".into()];
    op.include_internal = true;
    op.source_hashes = Some(
        preview
            .skills
            .iter()
            .map(|s| (s.name.clone(), s.fingerprint.clone()))
            .collect(),
    );
    assert!(apply(&engine, &op).is_err());
    assert!(!home.join(".agents/skills").exists());
    source(&repo.join("collision"), "FIXTURE-SKILL");
    git_commit(&engine, &repo, "case collision");
    assert!(inspect(&engine, "owner/repo@fixture-skill").is_err());
}
#[test]
fn unsupported_source_is_rejected_without_installing() {
    let fixture = TemporaryDirectory::new().unwrap();
    let engine = engine(&fixture.0);
    assert_eq!(
        parsed_source(&engine, "https://github.com/owner/repo/tree/main/skill")
            .unwrap()
            .subpath
            .as_deref(),
        Some("skill")
    );
    assert!(parsed_source(&engine, "--all").is_err());
    assert!(inspect(&engine, "../repo").is_err());
    assert_eq!(
        parsed_git_location(&parsed_source(&engine, "owner/repo").unwrap())
            .unwrap()
            .url,
        "https://github.com/owner/repo.git"
    );
    assert!(validate_git_url("javascript:alert(1)").is_err());
    assert!(parsed_git_location(
        &parsed_source(&engine, "https://example.invalid/provider").unwrap()
    )
    .is_err());
}

#[test]
fn update_has_explicit_scope_and_never_becomes_check_or_agent_update() {
    let home = TemporaryDirectory::new().unwrap();
    let engine = engine(&home.0);
    let mut operation = addition(&home.0, global(), false);
    operation.action = "update".into();
    operation.agents.clear();
    let args = operation_args(&engine, &operation).unwrap();
    assert_eq!(args, vec!["update", "fixture-skill", "--global", "--yes"]);
    operation.target = Target {
        host: "local".into(),
        scope: "project".into(),
        project_path: Some(home.0.to_str().unwrap().into()),
    };
    assert!(operation_args(&engine, &operation)
        .unwrap()
        .contains(&"--project".into()));
    operation.agents.push("codex".into());
    assert!(operation_args(&engine, &operation).is_err());
}
#[test]
fn real_upstream_global_install_and_selected_uninstall_preserve_other_agent() {
    let _serial = TEST_SERIAL
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir(&home).unwrap();
    fs::create_dir(home.join(".codex")).unwrap();
    let skill_source = fixture.0.join("source");
    source(&skill_source, "fixture-skill");
    let engine = engine(&home);
    let original = fs::read(skill_source.join("SKILL.md")).unwrap();
    let preview = inspect(&engine, skill_source.to_str().unwrap()).unwrap();
    assert_eq!(preview.skills.len(), 1);
    assert!(!home.join(".agents/skills").exists());
    let operation = addition(&skill_source, global(), false);
    let result = apply(&engine, &operation).unwrap();
    assert_eq!(result.items[0].status, "complete", "{}", result.logs);
    assert!(home.join(".agents/skills/fixture-skill").is_dir());
    assert!(!home.join(".agents/skills/fixture-skill").is_symlink());
    assert!(home.join(".claude/skills/fixture-skill/SKILL.md").exists());
    let inventory = engine.inventory(&global()).unwrap();
    let installed = inventory
        .skills
        .iter()
        .find(|skill| skill.name == "fixture-skill")
        .unwrap();
    assert!(installed.agents.contains(&"codex".into()));
    assert!(installed.agents.contains(&"claude-code".into()));
    let removal = Operation {
        action: "remove".into(),
        agents: vec!["claude-code".into()],
        ..operation
    };
    let result = apply(&engine, &removal).unwrap();
    assert_eq!(result.items[0].status, "complete", "{}", result.logs);
    let report = result.items[0].removal.as_ref().unwrap();
    assert!(report
        .paths
        .iter()
        .any(|path| path.kind == "link" && path.outcome == "removed"));
    assert!(report
        .paths
        .iter()
        .any(|path| path.kind == "shared" && path.outcome == "retained"));
    assert!(!home.join(".claude/skills/fixture-skill").exists());
    assert!(home.join(".agents/skills/fixture-skill/SKILL.md").exists());
    assert_eq!(fs::read(skill_source.join("SKILL.md")).unwrap(), original);
}
#[test]
fn real_upstream_project_copy_is_separate_from_global_scope() {
    let _serial = TEST_SERIAL
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir(&home).unwrap();
    fs::create_dir(home.join(".codex")).unwrap();
    let project = fixture.0.join("project");
    fs::create_dir(&project).unwrap();
    let skill_source = fixture.0.join("source");
    source(&skill_source, "fixture-skill");
    let engine = engine(&home);
    let target = Target {
        host: "local".into(),
        scope: "project".into(),
        project_path: Some(project.to_str().unwrap().into()),
    };
    let operation = addition(&skill_source, target.clone(), true);
    let result = apply(&engine, &operation).unwrap();
    assert_eq!(result.items[0].status, "complete", "{}", result.logs);
    assert!(project
        .join(".agents/skills/fixture-skill/SKILL.md")
        .exists());
    assert!(!project.join(".agents/skills/fixture-skill").is_symlink());
    assert!(engine.inventory(&global()).unwrap().skills.is_empty());
    assert!(engine
        .inventory(&target)
        .unwrap()
        .skills
        .iter()
        .any(|skill| skill.name == "fixture-skill"));
    assert!(project.join("skills-lock.json").exists());
    let removal = Operation {
        action: "remove".into(),
        agents: vec!["claude-code".into()],
        ..operation
    };
    assert_eq!(
        apply(&engine, &removal).unwrap().items[0].status,
        "complete"
    );
    assert!(project
        .join(".agents/skills/fixture-skill/SKILL.md")
        .exists());
    assert!(!project.join(".claude/skills/fixture-skill").exists());
}
#[test]
fn zero_exit_noop_does_not_verify_install_or_removal() {
    let _serial = TEST_SERIAL
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let fixture = TemporaryDirectory::new().unwrap();
    let mut engine = engine(&fixture.0);
    let resources = fixture.0.join("resources");
    fs::create_dir_all(resources.join("skills/bin")).unwrap();
    fs::copy(
        engine.resources.join("agents.json"),
        resources.join("agents.json"),
    )
    .unwrap();
    fs::write(
        resources.join("skills/bin/cli.mjs"),
        "if (process.argv[2] === 'list') console.log('[]');",
    )
    .unwrap();
    fn copy_directory(from: &Path, to: &Path) {
        fs::create_dir_all(to).unwrap();
        for entry in fs::read_dir(from).unwrap() {
            let entry = entry.unwrap();
            let target = to.join(entry.file_name());
            if entry.path().is_dir() {
                copy_directory(&entry.path(), &target);
            } else {
                fs::copy(entry.path(), target).unwrap();
            }
        }
    }
    fs::copy(
        engine.resources.join("inspect-skill-documents.mjs"),
        resources.join("inspect-skill-documents.mjs"),
    )
    .unwrap();
    fs::copy(
        engine.resources.join("inspect-upstream-source.mjs"),
        resources.join("inspect-upstream-source.mjs"),
    )
    .unwrap();
    fs::copy(
        engine.resources.join("inspect-upstream-plugins.mjs"),
        resources.join("inspect-upstream-plugins.mjs"),
    )
    .unwrap();
    fs::copy(
        engine.resources.join("inspect-upstream-discovery.mjs"),
        resources.join("inspect-upstream-discovery.mjs"),
    )
    .unwrap();
    fs::create_dir_all(resources.join("skills/dist")).unwrap();
    fs::copy(
        engine.resources.join("skills/dist/cli.mjs"),
        resources.join("skills/dist/cli.mjs"),
    )
    .unwrap();
    copy_directory(
        &engine.resources.join("skills/node_modules/yaml"),
        &resources.join("skills/node_modules/yaml"),
    );
    engine.resources = resources;
    let original = fixture.0.join(".claude/skills/fixture-skill");
    source(&original, "fixture-skill");
    let incoming = fixture.0.join("incoming");
    source(&incoming, "fixture-skill");
    fs::write(incoming.join("extra.txt"), "new file").unwrap();
    let mut operation = addition(&incoming, global(), true);
    operation.agents = vec!["claude-code".into()];
    assert_eq!(
        apply(&engine, &operation).unwrap().items[0].status,
        "uncertain"
    );
    operation.action = "remove".into();
    let noop = apply(&engine, &operation).unwrap();
    assert_eq!(noop.items[0].status, "failed");
    assert!(noop.items[0]
        .removal
        .as_ref()
        .unwrap()
        .paths
        .iter()
        .any(|path| path.selected && path.kind == "copy" && path.outcome == "retained"));
    assert!(original.join("SKILL.md").exists());
    // Add is one invocation: a failed batch without item evidence fails both items.
    // Record arguments so this also rejects per-item fallback or automatic retries.
    source(&incoming.join("second"), "second-skill");
    fs::write(
        engine.resources.join("skills/bin/cli.mjs"),
        r#"import { appendFileSync } from 'node:fs';
if (process.argv[2] === 'list') console.log('[]');
else if (process.argv[2] === 'add') {
    appendFileSync(process.env.HOME + '/add-invocations.jsonl', JSON.stringify(process.argv.slice(2)) + '\n');
    console.error('fixture batch failure');
    process.exitCode = 1;
}"#,
    ).unwrap();
    operation.action = "add".into();
    operation.skills = vec!["fixture-skill".into(), "second-skill".into()];
    let batch = apply(&engine, &operation).unwrap();
    assert_eq!(
        batch
            .items
            .iter()
            .map(|item| item.status.as_str())
            .collect::<Vec<_>>(),
        ["failed", "failed"]
    );
    assert!(batch.inventory.is_some());
    assert_eq!(batch.items[0].skill, "fixture-skill");
    assert_eq!(batch.items[1].skill, "second-skill");
    let calls: Vec<Vec<String>> = fs::read_to_string(engine.home.join("add-invocations.jsonl"))
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(calls.len(), 1, "No per-item fallback or automatic retry");
    let skill_flag = calls[0].iter().position(|arg| arg == "--skill").unwrap();
    assert_eq!(&calls[0][skill_flag + 1..skill_flag + 3], operation.skills);
    assert!(calls[0].iter().any(|arg| arg == "--json"));

    // Even structured installed claims with exit zero do not prove content changed.
    fs::write(
        engine.resources.join("skills/bin/cli.mjs"),
        r#"if (process.argv[2] === 'list') console.log('[]');
else if (process.argv[2] === 'add') console.log(JSON.stringify([
    { name: 'fixture-skill', status: 'installed' },
    { name: 'second-skill', status: 'installed' }
]));"#,
    )
    .unwrap();
    let noop_batch = apply(&engine, &operation).unwrap();
    assert_eq!(
        noop_batch
            .items
            .iter()
            .map(|item| item.status.as_str())
            .collect::<Vec<_>>(),
        ["uncertain", "uncertain"]
    );
    assert!(original.join("SKILL.md").exists());
    assert!(!original.join("extra.txt").exists());
    assert!(!engine.home.join(".claude/skills/second-skill").exists());
}
#[test]
fn real_upstream_shared_cleanup_is_reported_as_uncertain() {
    let _serial = TEST_SERIAL
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let fixture = TemporaryDirectory::new().unwrap();
    let engine = engine(&fixture.0);
    let incoming = fixture.0.join("incoming");
    source(&incoming, "fixture-skill");
    let operation = addition(&incoming, global(), false);
    assert_eq!(
        apply(&engine, &operation).unwrap().items[0].status,
        "complete"
    );
    // Codex is not detected by upstream: removing Claude may clean canonical storage.
    let removal = Operation {
        action: "remove".into(),
        agents: vec!["claude-code".into()],
        ..operation
    };
    let result = apply(&engine, &removal).unwrap();
    assert_eq!(result.items[0].status, "uncertain");
    let report = result.items[0].removal.as_ref().unwrap();
    assert!(report
        .paths
        .iter()
        .any(|path| path.kind == "shared" && !path.selected && path.outcome == "removed"));
    assert!(report
        .paths
        .iter()
        .any(|path| path.kind == "link" && path.selected && path.outcome == "removed"));
    assert!(!fixture.0.join(".agents/skills/fixture-skill").exists());
}
#[test]
fn shared_removal_reports_retained_content_until_remaining_copy_is_explicitly_selected() {
    let _serial = TEST_SERIAL
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for project_scope in [false, true] {
        let fixture = TemporaryDirectory::new().unwrap();
        fs::create_dir(fixture.0.join(".codex")).unwrap();
        fs::create_dir(fixture.0.join(".claude")).unwrap();
        fs::create_dir_all(fixture.0.join(".config/opencode")).unwrap();
        let project = fixture.0.join("project");
        fs::create_dir(&project).unwrap();
        let target = if project_scope {
            Target {
                scope: "project".into(),
                project_path: Some(project.to_string_lossy().into_owned()),
                ..global()
            }
        } else {
            global()
        };
        let engine = engine(&fixture.0);
        let input = fixture.0.join("incoming");
        source(&input, "fixture-skill");
        let mut add = addition(&input, target.clone(), false);
        add.agents.push("opencode".into());
        assert_eq!(apply(&engine, &add).unwrap().items[0].status, "complete");
        let independent = Operation {
            agents: vec!["hermes-agent".into()],
            copy: true,
            ..add.clone()
        };
        assert_eq!(
            apply(&engine, &independent).unwrap().items[0].status,
            "complete"
        );
        let before = engine.inventory(&target).unwrap();
        let mut remove = Operation {
            action: "remove".into(),
            agents: vec!["codex".into()],
            ..add
        };
        let plans = removal_plan(&engine, &remove, &before).unwrap();
        assert!(plans[0].shared);
        assert!(plans[0].agents.contains(&"opencode".into()));
        assert!(plans[0].agents.contains(&"claude-code".into()));
        assert!(!plans[0].agents.contains(&"hermes-agent".into()));
        remove.removals = Some(plans);
        let result = apply(&engine, &remove).unwrap();
        assert_eq!(
            result.items[0].status,
            if project_scope { "complete" } else { "failed" },
            "{}",
            result.logs
        );
        let report = result.items[0].removal.as_ref().unwrap();
        assert!(report.paths.iter().any(|path| path.kind == "shared"
            && path.outcome == if project_scope { "removed" } else { "retained" }));
        assert!(report
            .paths
            .iter()
            .any(|path| path.kind == "link" && path.outcome == "removed"));
        assert!(report
            .paths
            .iter()
            .any(|path| path.kind == "copy" && !path.selected && path.outcome == "retained"));
        // Upstream counts a detected independent copy as remaining use and keeps canonical content.
        remove.agents.push("hermes-agent".into());
        remove.removals = None;
        remove.removals =
            Some(removal_plan(&engine, &remove, &engine.inventory(&target).unwrap()).unwrap());
        let selected = apply(&engine, &remove).unwrap();
        assert_eq!(selected.items[0].status, "complete", "{}", selected.logs);
        assert!(selected.items[0]
            .removal
            .as_ref()
            .unwrap()
            .paths
            .iter()
            .all(|path| path.outcome == "removed"));
        assert!(selected.inventory.unwrap().skills.is_empty());
    }
}
#[test]
fn shared_batch_expansion_is_per_skill_and_does_not_remove_another_skills_independent_copy() {
    let _serial = TEST_SERIAL
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let fixture = TemporaryDirectory::new().unwrap();
    fs::create_dir(fixture.0.join(".codex")).unwrap();
    fs::create_dir(fixture.0.join(".claude")).unwrap();
    let engine = engine(&fixture.0);
    let first = fixture.0.join("first");
    source(&first, "fixture-skill");
    let add = addition(&first, global(), false);
    assert_eq!(apply(&engine, &add).unwrap().items[0].status, "complete");
    let second = fixture.0.join("second");
    source(&second, "second-skill");
    let second_add = Operation {
        skills: vec!["second-skill".into()],
        source: Some(second.to_string_lossy().into_owned()),
        copy: true,
        ..add.clone()
    };
    assert_eq!(
        apply(&engine, &second_add).unwrap().items[0].status,
        "complete"
    );
    let mut remove = Operation {
        action: "remove".into(),
        skills: vec!["fixture-skill".into(), "second-skill".into()],
        agents: vec!["codex".into()],
        ..add
    };
    let plans = removal_plan(&engine, &remove, &engine.inventory(&global()).unwrap()).unwrap();
    assert!(plans[0].agents.contains(&"claude-code".into()));
    assert!(!plans[1].agents.contains(&"claude-code".into()));
    remove.removals = Some(plans);
    let result = apply(&engine, &remove).unwrap();
    assert_eq!(result.items[0].status, "complete", "{}", result.logs);
    assert_eq!(result.items[1].status, "failed", "{}", result.logs);
    assert!(result.items[1]
        .removal
        .as_ref()
        .unwrap()
        .paths
        .iter()
        .any(|path| path.kind == "copy" && !path.selected && path.outcome == "retained"));
    assert!(fixture
        .0
        .join(".claude/skills/second-skill/SKILL.md")
        .exists());
    assert!(fixture.0.join(".agents/skills/second-skill").exists());
}
#[test]
fn changed_removal_plan_is_rejected_without_deleting_new_installations() {
    let _serial = TEST_SERIAL
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let fixture = TemporaryDirectory::new().unwrap();
    fs::create_dir(fixture.0.join(".codex")).unwrap();
    let engine = engine(&fixture.0);
    let input = fixture.0.join("incoming");
    source(&input, "fixture-skill");
    let add = addition(&input, global(), false);
    assert_eq!(apply(&engine, &add).unwrap().items[0].status, "complete");
    let mut remove = Operation {
        action: "remove".into(),
        agents: vec!["codex".into()],
        ..add.clone()
    };
    remove.removals =
        Some(removal_plan(&engine, &remove, &engine.inventory(&global()).unwrap()).unwrap());
    let extra = Operation {
        agents: vec!["hermes-agent".into()],
        ..add
    };
    assert_eq!(apply(&engine, &extra).unwrap().items[0].status, "complete");
    assert!(apply(&engine, &remove)
        .err()
        .unwrap()
        .contains("changed since confirmation"));
    assert!(fixture
        .0
        .join(".agents/skills/fixture-skill/SKILL.md")
        .exists());
    let pi = engine
        .agents(&global())
        .unwrap()
        .into_iter()
        .find(|agent| agent.id == "hermes-agent")
        .unwrap();
    assert!(Path::new(&pi.path).join("fixture-skill/SKILL.md").is_file());
}
#[test]
fn same_name_agent_installations_keep_distinct_identity_and_block_name_mutation() {
    let _serial = TEST_SERIAL
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let fixture = TemporaryDirectory::new().unwrap();
    let engine = engine(&fixture.0);
    source(&fixture.0.join(".agents/skills/first"), "same-name");
    source(&fixture.0.join(".agents/skills/second"), "same-name");
    let inventory = engine.inventory(&global()).unwrap();
    assert_eq!(
        inventory
            .skills
            .iter()
            .filter(|skill| skill.name == "same-name")
            .count(),
        2
    );
    let operation = Operation {
        dsh_context_key: None,
        target: global(),
        action: "remove".into(),
        source: None,
        skills: vec!["same-name".into()],
        agents: vec!["codex".into()],
        copy: false,
        source_hashes: None,
        include_internal: false,
        removals: None,
        removal_source: None,
        inspection_session: None,
        sync_origin: None,
        eve_subagents: Vec::new(),
    };
    assert!(apply(&engine, &operation)
        .err()
        .unwrap()
        .contains("ambiguous"));
    assert!(fixture.0.join(".agents/skills/first/SKILL.md").exists());
}
fn git_commit(engine: &Engine, repository: &Path, message: &str) {
    for args in [
        vec!["add", "."],
        vec![
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "-m",
            message,
        ],
    ] {
        let output = run_process(engine.command(Path::new("git"), repository).args(args)).unwrap();
        assert!(output.success, "{}", output.stderr);
    }
}

#[test]
fn dsh_original_cli_lifecycle_and_shared_removal_in_both_scopes() {
    let _serial = TEST_SERIAL
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for project_scope in [false, true] {
        let fixture = TemporaryDirectory::new().unwrap();
        let home = fixture.0.join("home");
        fs::create_dir_all(home.join(".codex")).unwrap();
        fs::create_dir_all(home.join(".dsh")).unwrap();
        let profile = home.join(".dsh/profiles/desktop");
        fs::create_dir_all(&profile).unwrap();
        let profile_manifest = br#"{"dsh":{"profile":{"bundles":["@fixture/missing-bundle"]}}}"#;
        fs::write(profile.join("package.json"), profile_manifest).unwrap();
        let e = engine(&home);
        let repository = fixture.0.join("source");
        fs::create_dir(&repository).unwrap();
        assert!(
            run_process(
                e.command(Path::new("git"), &repository)
                    .args(["init", "-b", "main"])
            )
            .unwrap()
            .success
        );
        let source_dir = repository.join("skills/fixture-skill");
        source(&source_dir, "fixture-skill");
        fs::write(source_dir.join("version.txt"), "one").unwrap();
        git_commit(&e, &repository, "initial");
        let url = "https://dsh-fixture.invalid/owner/repo.git";
        fs::write(
            home.join(".gitconfig"),
            format!(
                "[url \"{}\"]\n    insteadOf = {url}\n",
                crate::upstream::tests::file_url(&repository)
            ),
        )
        .unwrap();
        let project = fixture.0.join("project");
        fs::create_dir(&project).unwrap();
        let target = if project_scope {
            Target {
                host: "local".into(),
                scope: "project".into(),
                project_path: Some(project.to_string_lossy().into()),
            }
        } else {
            global()
        };
        let mut op = addition(&source_dir, target.clone(), project_scope);
        op.source = Some(url.into());
        op.agents = vec![dsh::ID.into(), "codex".into()];
        let result = apply(&e, &op).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        let base = target
            .directory(&home)
            .unwrap()
            .join(".agents/skills/fixture-skill");
        assert_eq!(fs::read_to_string(base.join("version.txt")).unwrap(), "one");
        if !project_scope {
            // Profile warnings and a stale inspection selection must not block a retry.
            op.dsh_context_key = Some("stale-inspection-context".into());
            let repeated = apply(&e, &op).unwrap();
            assert_eq!(repeated.items[0].status, "complete", "{}", repeated.logs);
            assert_eq!(fs::read_to_string(base.join("version.txt")).unwrap(), "one");
        }
        assert_eq!(
            fs::read(profile.join("package.json")).unwrap(),
            profile_manifest
        );
        op.dsh_context_key = None;
        let snapshot = dsh::inspect(&e, &target).unwrap();
        assert_eq!(snapshot["skills"][0]["cliAddressable"], true);
        let inventory = result.inventory.unwrap();
        let shared = inventory
            .skills
            .iter()
            .find(|skill| skill.name == "fixture-skill")
            .unwrap();
        assert!(shared.agents.iter().any(|id| id == dsh::ID));
        assert!(shared.agents.iter().any(|id| id == "codex"));
        if project_scope {
            let reopened = engine(&home).inventory(&target).unwrap();
            let restored = reopened.skills.iter().find(|skill|skill.name == "fixture-skill").unwrap();
            assert!(restored.agents.iter().any(|id|id == dsh::ID));
            assert!(restored.agents.iter().any(|id|id == "codex"));
            assert_eq!(fs::read_to_string(source_dir.join("version.txt")).unwrap(), "one");
            continue;
        }
        let lock = e.lock(&target).unwrap();
        assert_eq!(check_updates(&e, &target).unwrap()[0].status, "current");
        assert_eq!(e.lock(&target).unwrap(), lock);
        fs::write(source_dir.join("version.txt"), "two").unwrap();
        git_commit(&e, &repository, "updated");
        assert_eq!(check_updates(&e, &target).unwrap()[0].status, "available");
        op.action = "update".into();
        op.agents.clear();
        op.source = None;
        let updated = apply(&e, &op).unwrap();
        assert_eq!(updated.items[0].status, "complete", "{}", updated.logs);
        assert_eq!(fs::read_to_string(base.join("version.txt")).unwrap(), "two");
        assert_eq!(check_updates(&e, &target).unwrap()[0].status, "current");
        // Recreate the engine: inspection and associations cannot depend on process state.
        let restarted = engine(&home).inventory(&target).unwrap();
        assert!(restarted
            .skills
            .iter()
            .any(|skill| skill.name == "fixture-skill" && skill.dsh_state.is_some()));
        op.action = "remove".into();
        op.agents = vec![dsh::ID.into()];
        let plan = removal_plan(&e, &op, &restarted).unwrap();
        assert!(plan[0].shared);
        assert!(plan[0].agents.iter().any(|id| id == "codex"));
        op.removals = Some(plan);
        let removed = apply(&e, &op).unwrap();
        assert_eq!(removed.items[0].status, "complete", "{}", removed.logs);
        assert!(!base.exists());
        assert!(source_dir.join("SKILL.md").is_file());
        assert!(e.lock(&target).unwrap()["skills"]["fixture-skill"].is_null());
    }
}

#[test]
fn dsh_native_inventory_is_read_only_and_rejects_non_cli_removal_and_child_installs() {
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    let native = home.join(".dsh/skills/native-only");
    source(&native, "native-only");
    let original = fs::read(native.join("SKILL.md")).unwrap();
    let e = engine(&home);
    let inventory = e.inventory(&global()).unwrap();
    let native_skill = inventory
        .skills
        .iter()
        .find(|skill| skill.name == "native-only")
        .unwrap();
    assert!(
        !native_skill.cli_managed && !native_skill.updateable && native_skill.cli_agents.is_empty()
    );
    let mut op = addition(&native, global(), false);
    op.action = "remove".into();
    op.skills = vec!["native-only".into()];
    op.agents = vec![dsh::ID.into()];
    assert!(apply(&e, &op)
        .err()
        .unwrap()
        .contains("outside the original CLI"));
    assert_eq!(fs::read(native.join("SKILL.md")).unwrap(), original);
    let root = fixture.0.join("repo");
    fs::create_dir_all(root.join(".git")).unwrap();
    fs::create_dir(root.join("child")).unwrap();
    op.target = Target {
        host: "local".into(),
        scope: "project".into(),
        project_path: Some(root.join("child").to_string_lossy().into()),
    };
    op.action = "add".into();
    assert!(operation_args(&e, &op).unwrap_err().contains("Git root"));
    let args = vec![
        "add",
        "deepseek-harness",
        "--skill",
        "deepseek-harness",
        "--agent",
        dsh::ID,
        "universal",
        "codex",
        "-y",
    ]
    .into_iter()
    .map(str::to_owned)
    .collect::<Vec<_>>();
    assert_eq!(
        dsh::cli_args(&args),
        vec![
            "add",
            "deepseek-harness",
            "--skill",
            "deepseek-harness",
            "--agent",
            "universal",
            "codex",
            "-y"
        ]
    );
}
#[test]
#[cfg(unix)]
fn github_root_api_commit_and_clone_tree_versions_do_not_report_false_updates() {
    use std::os::unix::fs::PermissionsExt;
    let _serial = TEST_SERIAL
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir_all(home.join(".codex")).unwrap();
    let mut engine = engine(&home);
    let repository = fixture.0.join("repo");
    source(&repository, "fixture-skill");
    fs::write(repository.join("reference.txt"), "one").unwrap();
    assert!(
        run_process(
            engine
                .command(Path::new("git"), &repository)
                .args(["init", "-q", "-b", "main"])
        )
        .unwrap()
        .success
    );
    git_commit(&engine, &repository, "initial");
    let url = "https://github.com/skills-space-fixture/root-version.git";
    fs::write(
        home.join(".gitconfig"),
        format!(
            "[url \"{}\"]\n    insteadOf = {url}\n",
            crate::upstream::tests::file_url(&repository)
        ),
    )
    .unwrap();
    // Exercise the unchanged CLI's GitHub API path without a public network or user credentials.
    let response = fixture.0.join("tree.json");
    let preload = fixture.0.join("fetch.mjs");
    fs::write(&preload, format!(
        "import {{readFileSync}} from 'node:fs'; globalThis.fetch = async url => {{ if (!String(url).startsWith('https://api.github.com/repos/skills-space-fixture/root-version/git/trees/')) throw Error('Unexpected fixture request'); return new Response(readFileSync({}), {{status:200,headers:{{'Content-Type':'application/json'}}}}); }};",
        serde_json::to_string(&response.to_string_lossy()).unwrap()
    )).unwrap();
    let wrapper = fixture.0.join("node");
    fs::write(
        &wrapper,
        format!(
            "#!/bin/sh\nexec '{}' --import '{}' \"$@\"\n",
            engine.node.display(),
            preload.display()
        ),
    )
    .unwrap();
    fs::set_permissions(&wrapper, fs::Permissions::from_mode(0o755)).unwrap();
    engine.node = wrapper;
    let identity = |revision: &str| {
        run_process(
            engine
                .command(Path::new("git"), &repository)
                .args(["rev-parse", revision]),
        )
        .unwrap()
        .stdout
        .trim()
        .to_owned()
    };
    let publish = || {
        let commit = identity("HEAD");
        fs::write(&response, serde_json::to_vec(&serde_json::json!({"sha":commit,"tree":[{"path":"SKILL.md","type":"blob"},{"path":"reference.txt","type":"blob"}]})).unwrap()).unwrap();
        commit
    };
    let initial = publish();
    assert_ne!(initial, identity("HEAD^{tree}"));
    let mut operation = addition(&repository, global(), true);
    operation.source = Some(url.into());
    operation.agents = vec!["codex".into()];
    let installed = apply(&engine, &operation).unwrap();
    assert_eq!(installed.items[0].status, "complete", "{}", installed.logs);
    let lock = engine.lock(&global()).unwrap();
    assert_eq!(lock["skills"]["fixture-skill"]["skillFolderHash"], initial);
    let check = check_updates(&engine, &global()).unwrap();
    assert_eq!(check[0].status, "current");
    assert_eq!(check[0].current_revision, check[0].latest_revision);
    assert_eq!(engine.lock(&global()).unwrap(), lock);
    operation.action = "update".into();
    operation.source = None;
    operation.agents.clear();
    let unchanged = apply(&engine, &operation).unwrap();
    assert_eq!(unchanged.items[0].status, "complete", "{}", unchanged.logs);
    assert!(unchanged.logs.contains("All global skills are up to date"));
    assert_eq!(engine.lock(&global()).unwrap(), lock);
    // The clone fallback's tree identity remains valid and is presented unchanged.
    let mut tree_lock = lock.clone();
    tree_lock["skills"]["fixture-skill"]["skillFolderHash"] = identity("HEAD^{tree}").into();
    let lock_path = home.join(".agents/.skill-lock.json");
    fs::write(&lock_path, serde_json::to_vec(&tree_lock).unwrap()).unwrap();
    let check = check_updates(&engine, &global()).unwrap();
    assert_eq!(check[0].status, "current");
    assert_eq!(check[0].current_revision, check[0].latest_revision);
    fs::write(&lock_path, serde_json::to_vec(&lock).unwrap()).unwrap();
    assert_eq!(
        check_updates(&engine, &global()).unwrap()[0].status,
        "current"
    );
    let local = home.join(".agents/skills/fixture-skill/reference.txt");
    fs::write(&local, "local edit").unwrap();
    // A current upstream version is a successful no-op; it must retain local edits.
    let retained = apply(&engine, &operation).unwrap();
    assert_eq!(retained.items[0].status, "complete", "{}", retained.logs);
    assert!(retained.logs.contains("All global skills are up to date"));
    assert_eq!(fs::read_to_string(&local).unwrap(), "local edit");
    assert_eq!(engine.lock(&global()).unwrap(), lock);
    assert_eq!(
        check_updates(&engine, &global()).unwrap()[0].local_state,
        "modified"
    );
    fs::write(&local, "one").unwrap();
    fs::write(repository.join("reference.txt"), "two").unwrap();
    git_commit(&engine, &repository, "source update");
    let latest = publish();
    let check = check_updates(&engine, &global()).unwrap();
    assert_eq!(check[0].status, "available");
    assert_eq!(check[0].latest_revision.as_deref(), Some(latest.as_str()));
    let updated = apply(&engine, &operation).unwrap();
    assert_eq!(updated.items[0].status, "complete", "{}", updated.logs);
    assert_eq!(fs::read_to_string(&local).unwrap(), "two");
    assert_eq!(
        check_updates(&engine, &global()).unwrap()[0].status,
        "current"
    );
    // A repository commit is never a version candidate for a nested skill.
    source(&repository.join("skills/nested"), "nested");
    git_commit(&engine, &repository, "nested skill");
    let entry = serde_json::json!({"sourceType":"github","sourceUrl":url,"skillPath":"skills/nested/SKILL.md"});
    let snapshot = source_snapshot_from_entry(
        &engine,
        &global(),
        "nested",
        &entry,
        &mut SourceCache::default(),
    )
    .unwrap();
    assert!(!snapshot.hashes.contains(&identity("HEAD")));
}

#[test]
fn real_upstream_git_lifecycle_checks_updates_and_removes_in_both_scopes() {
    let _serial = TEST_SERIAL
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for project_scope in [false, true] {
        let fixture = TemporaryDirectory::new().unwrap();
        let home = fixture.0.join("home");
        fs::create_dir(&home).unwrap();
        fs::create_dir(home.join(".codex")).unwrap();
        fs::create_dir(home.join(".claude")).unwrap();
        let engine = engine(&home);
        let repository = fixture.0.join("source");
        fs::create_dir(&repository).unwrap();
        assert!(
            run_process(
                engine
                    .command(Path::new("git"), &repository)
                    .args(["init", "-b", "main"])
            )
            .unwrap()
            .success
        );
        let source_dir = repository.join("skills/fixture-skill");
        source(&source_dir, "fixture-skill");
        fs::write(source_dir.join("version.txt"), "one").unwrap();
        git_commit(&engine, &repository, "initial");
        let url = "https://skills-fixture.invalid/owner/repo.git";
        fs::write(
            home.join(".gitconfig"),
            format!(
                "[url \"{}\"]\n    insteadOf = {url}\n",
                crate::upstream::tests::file_url(&repository)
            ),
        )
        .unwrap();
        let project = fixture.0.join("project");
        fs::create_dir(&project).unwrap();
        let target = if project_scope {
            Target {
                host: "local".into(),
                scope: "project".into(),
                project_path: Some(project.to_str().unwrap().into()),
            }
        } else {
            global()
        };
        let mut install = addition(&source_dir, target.clone(), project_scope);
        install.source = Some(url.into());
        assert_eq!(
            inspect(&engine, url).unwrap().skills[0].name,
            "fixture-skill"
        );
        let result = apply(&engine, &install).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        let before_lock = engine.lock(&target).unwrap();
        let inventory = engine.inventory(&target).unwrap();
        assert!(inventory.skills.iter().all(|skill| skill.updateable));
        let check = check_updates(&engine, &target).unwrap();
        assert_eq!(check[0].status, "current", "{}", check[0].message);
        assert!(check[0].current_revision.is_some());
        assert_eq!(check[0].current_revision, check[0].latest_revision);
        assert_eq!(
            engine.lock(&target).unwrap(),
            before_lock,
            "read-only checking must not rewrite locks"
        );
        let file = Path::new(&inventory.skills[0].path).join("SKILL.md");
        let original = fs::read_to_string(&file).unwrap();
        let edited = original.replace("# Fixture", "# Local edit");
        fs::write(&file, &edited).unwrap();
        let root = &inventory.skills[0].path;
        let local_revision = || document_diff::revision(&tree_signature(Path::new(root)).unwrap());
        let reviewed = local_revision();
        let difference = document_diff::compare(&engine, &target, root, &reviewed).unwrap();
        assert_eq!(difference.files.len(), 1);
        assert!(difference.files[0].diff.contains("-# Fixture"));
        assert!(difference.files[0].diff.contains("+# Local edit"));
        assert_eq!(fs::read_to_string(&file).unwrap(), edited);
        assert_eq!(engine.lock(&target).unwrap(), before_lock);
        let restore = |review: &document_diff::SkillDiff, name: &str| document_diff::RestoreFile {
            target: target.clone(),
            path: root.clone(),
            file: name.into(),
            revision: review.revision.clone(),
            version: review.version.clone(),
        };
        // Branch-level file changes are covered directly in document_diff tests.
        // Keep the real recorded-source and scope integration here.
        // No earlier install/check baseline may stand in for restore's refresh.
        fs::remove_file(engine.home.join(".skills-space/update-baselines.json")).unwrap();
        document_diff::restore(&engine, &restore(&difference, "SKILL.md")).unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), original);
        assert_eq!(engine.lock(&target).unwrap(), before_lock);
        assert_eq!(
            update_safety::state(
                &engine,
                &target,
                "fixture-skill",
                &engine.inventory(&target).unwrap()
            ),
            "clean"
        );
        fs::write(source_dir.join("version.txt"), "two").unwrap();
        git_commit(&engine, &repository, "update content");
        assert!(
            document_diff::compare(&engine, &target, root, &local_revision())
                .unwrap_err()
                .contains("recorded source version")
        );
        let check = check_updates(&engine, &target).unwrap();
        assert_eq!(check[0].status, "available", "{}", check[0].message);
        assert!(check[0].latest_revision.is_some());
        assert_ne!(check[0].current_revision, check[0].latest_revision);
        let serialized = serde_json::to_value(&check[0]).unwrap();
        assert_eq!(
            serialized["currentRevision"],
            check[0].current_revision.as_deref().unwrap()
        );
        assert_eq!(
            serialized["latestRevision"],
            check[0].latest_revision.as_deref().unwrap()
        );
        for skill in &inventory.skills {
            assert_eq!(
                fs::read_to_string(Path::new(&skill.path).join("version.txt")).unwrap(),
                "one"
            );
        }
        let update = Operation {
            action: "update".into(),
            agents: vec![],
            source: None,
            ..install.clone()
        };
        for skill in &inventory.skills {
            fs::write(Path::new(&skill.path).join("version.txt"), "local edit").unwrap();
        }
        let local = check_updates(&engine, &target).unwrap();
        assert_eq!(local[0].status, "available");
        assert_eq!(local[0].local_state, "modified");
        let confirmed = apply(&engine, &update).unwrap();
        assert_eq!(confirmed.items[0].status, "complete", "{}", confirmed.logs);
        for skill in &inventory.skills {
            assert_eq!(
                fs::read_to_string(Path::new(&skill.path).join("version.txt")).unwrap(),
                "two"
            );
        }
        fs::write(source_dir.join("version.txt"), "three").unwrap();
        git_commit(&engine, &repository, "third version");
        // Simulate an older installation with no app-owned content baseline.
        fs::remove_file(engine.home.join(".skills-space/update-baselines.json")).unwrap();
        let legacy = check_updates(&engine, &target).unwrap();
        assert_eq!(legacy[0].status, "available");
        assert_eq!(legacy[0].local_state, "unverified");
        let result = apply(&engine, &update).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        let inventory = result.inventory.unwrap();
        assert_eq!(
            update_safety::state(&engine, &target, "fixture-skill", &inventory),
            "clean"
        );
        for skill in &inventory.skills {
            assert_eq!(
                fs::read_to_string(Path::new(&skill.path).join("version.txt")).unwrap(),
                "three"
            );
        }
        assert_ne!(engine.lock(&target).unwrap(), before_lock);
        assert_eq!(
            check_updates(&engine, &target).unwrap()[0].status,
            "current"
        );
        // Upstream skips an already current version; keep local edits and report the no-op accurately.
        fs::remove_file(engine.home.join(".skills-space/update-baselines.json")).unwrap();
        for skill in &inventory.skills {
            fs::write(
                Path::new(&skill.path).join("version.txt"),
                "legacy local edit",
            )
            .unwrap();
        }
        let confirmed = apply(&engine, &update).unwrap();
        assert_eq!(confirmed.items[0].status, "complete", "{}", confirmed.logs);
        for skill in &inventory.skills {
            assert_eq!(
                fs::read_to_string(Path::new(&skill.path).join("version.txt")).unwrap(),
                "legacy local edit"
            );
        }
        let removal = Operation {
            action: "remove".into(),
            source: None,
            agents: inventory
                .skills
                .iter()
                .flat_map(|skill| skill.agents.clone())
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .collect(),
            ..install
        };
        let result = apply(&engine, &removal).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        assert!(result.inventory.unwrap().skills.is_empty());
        assert!(engine.lock(&target).unwrap()["skills"]["fixture-skill"].is_null());
    }
}
#[test]
fn timeout_terminates_descendants_instead_of_leaving_a_late_mutation() {
    let fixture = TemporaryDirectory::new().unwrap();
    let engine = engine(&fixture.0);
    let script = fixture.0.join("timeout.mjs");
    fs::write(&script, "import {spawn} from 'node:child_process'; spawn(process.execPath, ['-e', \"setTimeout(() => require('node:fs').writeFileSync(process.argv[1], 'late'), 500)\", process.argv[2]], {stdio:'inherit'}); setTimeout(() => {}, 5000);").unwrap();
    let late = fixture.0.join("late.txt");
    let mut command = engine.command(&engine.node, &fixture.0);
    command.arg(script).arg(&late);
    assert!(run_process_with_timeout(&mut command, Duration::from_millis(150)).is_err());
    thread::sleep(Duration::from_millis(600));
    assert!(
        !late.exists(),
        "a timed-out descendant must not continue mutating after the operation returns"
    );
}
#[test]
#[ignore = "requires public HTTPS access; mutation stays inside temporary HOME"]
fn real_https_git_source_lifecycle() {
    let _serial = TEST_SERIAL
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let fixture = TemporaryDirectory::new().unwrap();
    fs::create_dir(fixture.0.join(".codex")).unwrap();
    let engine = engine(&fixture.0);
    let url = "https://github.com/vercel-labs/skills";
    let preview = inspect(&engine, url).unwrap();
    let name = preview.skills.first().unwrap().name.clone();
    let operation = Operation {
        dsh_context_key: None,
        target: global(),
        action: "add".into(),
        source: Some(url.into()),
        skills: vec![name.clone()],
        agents: vec!["codex".into()],
        copy: false,
        source_hashes: None,
        include_internal: false,
        removals: None,
        removal_source: None,
        inspection_session: None,
        sync_origin: None,
        eve_subagents: Vec::new(),
    };
    let result = apply(&engine, &operation).unwrap();
    assert_eq!(result.items[0].status, "complete", "{}", result.logs);
    let check = check_updates(&engine, &global()).unwrap();
    assert_eq!(check[0].status, "current", "{}", check[0].message);
    let update = Operation {
        action: "update".into(),
        agents: vec![],
        source: None,
        ..operation.clone()
    };
    let result = apply(&engine, &update).unwrap();
    assert_eq!(result.items[0].status, "complete", "{}", result.logs);
    let inventory = engine.inventory(&global()).unwrap();
    let agents = inventory
        .skills
        .iter()
        .flat_map(|skill| skill.agents.clone())
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();
    let removal = Operation {
        action: "remove".into(),
        agents,
        ..operation
    };
    let result = apply(&engine, &removal).unwrap();
    assert_eq!(result.items[0].status, "complete", "{}", result.logs);
    assert!(result.inventory.unwrap().skills.is_empty());
}
#[test]
fn changed_preview_is_rejected_before_installation() {
    let fixture = TemporaryDirectory::new().unwrap();
    let engine = engine(&fixture.0);
    let incoming = fixture.0.join("incoming");
    source(&incoming, "fixture-skill");
    let preview = inspect(&engine, incoming.to_str().unwrap()).unwrap();
    let mut operation = addition(&incoming, global(), false);
    operation.source_hashes = Some(
        preview
            .skills
            .into_iter()
            .map(|skill| (skill.name, skill.fingerprint))
            .collect(),
    );
    fs::write(incoming.join("new.txt"), "changed after preview").unwrap();
    assert!(apply(&engine, &operation)
        .err()
        .unwrap()
        .contains("changed since preview"));
    assert!(!fixture.0.join(".agents/skills").exists());
}
static TEST_SERIAL: Mutex<()> = Mutex::new(());

#[test]
fn source_directory_links_require_an_existing_recorded_local_directory() {
    let fixture = TemporaryDirectory::new().unwrap();
    let directory = fixture.0.join("project");
    fs::create_dir_all(directory.join("source")).unwrap();
    fs::write(directory.join("file"), "not a directory").unwrap();
    let mut skill: Skill = serde_json::from_value(serde_json::json!({
        "name":"fixture", "path":"/installed/fixture", "agents":[],
        "source":null, "sourceUrl":null, "sourceType":"local", "installSource":"source"
    }))
    .unwrap();
    assert_eq!(
        local_source_directory(&skill, &directory),
        Some(fs::canonicalize(directory.join("source")).unwrap())
    );
    skill.install_source = Some("missing".into());
    assert_eq!(local_source_directory(&skill, &directory), None);
    skill.install_source = Some("file".into());
    assert_eq!(local_source_directory(&skill, &directory), None);
    skill.install_source = Some("https://example.com/skill".into());
    assert_eq!(local_source_directory(&skill, &directory), None);
    skill.install_source = Some(directory.join("source").to_string_lossy().into_owned());
    skill.source_type = Some("git".into());
    assert_eq!(local_source_directory(&skill, &directory), None);
}

#[test]
fn unavailable_source_is_retried_only_on_a_new_check() {
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir_all(&home).unwrap();
    let repo = fixture.0.join("initially-missing-repository");
    let url = "https://skills-fixture.invalid/retry/repo.git";
    fs::write(
        home.join(".gitconfig"),
        format!(
            "[url \"{}\"]\n    insteadOf = {url}\n",
            crate::upstream::tests::file_url(&repo)
        ),
    )
    .unwrap();
    let engine = engine(&home);
    let entry = serde_json::json!({"sourceType":"git","sourceUrl":url,"skillPath":"skills/fixture-skill/SKILL.md"});
    let mut cache = SourceCache::default();
    assert!(
        source_snapshot_from_entry(&engine, &global(), "fixture-skill", &entry, &mut cache)
            .is_err()
    );
    source(&repo.join("skills/fixture-skill"), "fixture-skill");
    assert!(
        run_process(
            engine
                .command(Path::new("git"), &repo)
                .args(["init", "-q", "-b", "main"])
        )
        .unwrap()
        .success
    );
    git_commit(&engine, &repo, "source recovered");
    assert!(
        source_snapshot_from_entry(&engine, &global(), "fixture-skill", &entry, &mut cache)
            .is_err()
    );
    assert!(source_snapshot_from_entry(
        &engine,
        &global(),
        "fixture-skill",
        &entry,
        &mut SourceCache::default()
    )
    .is_ok());
}

#[test]
fn independent_sources_keep_update_results_ordered_and_read_only() {
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir_all(home.join(".codex")).unwrap();
    let engine = engine(&home);
    let names = ["a-current", "z-updated"];
    let mut config = String::new();
    for name in names {
        let repo = fixture.0.join(name);
        source(&repo.join("skills").join(name), name);
        assert!(
            run_process(
                engine
                    .command(Path::new("git"), &repo)
                    .args(["init", "-q", "-b", "main"])
            )
            .unwrap()
            .success
        );
        git_commit(&engine, &repo, "initial");
        let url = format!("https://skills-fixture.invalid/{name}/repo.git");
        config.push_str(&format!(
            "[url \"{}\"]\n    insteadOf = {url}\n",
            crate::upstream::tests::file_url(&repo)
        ));
        fs::write(home.join(".gitconfig"), &config).unwrap();
        let mut install = addition(Path::new(&url), global(), true);
        install.skills = vec![name.into()];
        install.agents = vec!["codex".into()];
        let result = apply(&engine, &install).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
    }
    let updated = fixture.0.join("z-updated");
    fs::write(updated.join("skills/z-updated/version.txt"), "new").unwrap();
    git_commit(&engine, &updated, "new version");
    let before_lock = engine.lock(&global()).unwrap();
    let statuses = check_updates(&engine, &global()).unwrap();
    assert_eq!(
        statuses
            .iter()
            .map(|s| (s.skill.as_str(), s.status.as_str()))
            .collect::<Vec<_>>(),
        vec![("a-current", "current"), ("z-updated", "available")],
        "diagnostics: {:?}",
        statuses
            .iter()
            .map(|status| (&status.skill, &status.message))
            .collect::<Vec<_>>()
    );
    assert_eq!(engine.lock(&global()).unwrap(), before_lock);
    assert!(!home.join(".agents/skills/z-updated/version.txt").exists());
}

#[test]
fn installation_evidence_is_separate_from_upstream_configuration_detection() {
    use super::detection::InstallationStatus;
    let home = TemporaryDirectory::new().unwrap();
    let e = engine(&home.0);
    fs::create_dir_all(home.0.join(".claude/plugins")).unwrap();
    fs::create_dir_all(home.0.join(".cursor")).unwrap();
    for id in ["claude-code", "cursor"] {
        let a = e
            .agents(&global())
            .unwrap()
            .into_iter()
            .find(|a| a.id == id)
            .unwrap();
        assert!(
            a.detected,
            "original CLI configuration signal must be preserved"
        );
        assert_eq!(a.installation_status, InstallationStatus::ConfigurationOnly);
        assert!(a.installation_evidence.is_none());
    }
    let codex = || {
        e.agents(&global())
            .unwrap()
            .into_iter()
            .find(|a| a.id == "codex")
            .unwrap()
    };
    assert_eq!(codex().installation_status, InstallationStatus::NotFound);
    let bin = home.0.join(".local/bin");
    fs::create_dir_all(&bin).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let entry = bin.join("codex");
        fs::write(&entry, "#!/bin/sh\nexit 0\n").unwrap();
        fs::set_permissions(&entry, fs::Permissions::from_mode(0o644)).unwrap();
        assert_eq!(
            codex().installation_status,
            InstallationStatus::NotFound,
            "non-executable files are not installation evidence"
        );
        fs::set_permissions(&entry, fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(codex().installation_status, InstallationStatus::Confirmed);
        assert_eq!(codex().installation_evidence.as_deref(), entry.to_str());
        assert!(
            !codex().detected,
            "confirmation must not alter upstream cleanup detection"
        );
        fs::remove_file(entry).unwrap();
        fs::create_dir_all(home.0.join(".codex/plugins")).unwrap();
        assert_eq!(
            codex().installation_status,
            InstallationStatus::ConfigurationOnly,
            "leftover config does not confirm an uninstalled Agent"
        );
    }
}

#[test]
fn shared_inventory_preserves_impact_without_claiming_separate_installations() {
    let home = TemporaryDirectory::new().unwrap();
    let project = TemporaryDirectory::new().unwrap();
    let e = engine(&home.0);
    for target in [
        global(),
        Target {
            scope: "project".into(),
            project_path: Some(project.0.to_string_lossy().into_owned()),
            ..global()
        },
    ] {
        let root = target.directory(&home.0).unwrap();
        source(
            &root.join(".agents/skills/shared-example"),
            "shared-example",
        );
        source(
            &root.join(".claude/skills/independent-example"),
            "independent-example",
        );
        let inventory = e.inventory(&target).unwrap();
        let shared = inventory
            .skills
            .iter()
            .find(|s| s.name == "shared-example")
            .unwrap();
        assert!(shared.shared);
        assert!(shared.agents.iter().any(|id| id == "codex"));
        assert!(shared.agents.iter().any(|id| id == "gemini-cli"));
        assert!(
            !inventory
                .skills
                .iter()
                .find(|s| s.name == "independent-example")
                .unwrap()
                .shared
        );
        assert!(
            inventory
                .agents
                .iter()
                .find(|a| a.id == "codex")
                .unwrap()
                .shared_directory
        );
    }
}

#[cfg(unix)]
#[test]
fn confirmed_agent_skill_associations_follow_real_copy_link_and_scope_targets() {
    use super::detection::InstallationStatus;
    use std::os::unix::fs::{symlink, PermissionsExt};
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir_all(home.join(".local/bin")).unwrap();
    for command in ["codex", "claude", "pi", "windsurf"] {
        let path = home.join(".local/bin").join(command);
        fs::write(&path, "#!/bin/sh\nexit 0\n").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
    }
    // Original CLI detection still uses its own configuration probes.
    for directory in [".codex", ".claude", ".pi/agent"] {
        fs::create_dir_all(home.join(directory)).unwrap();
    }
    let e = engine(&home);
    let source_path = fixture.0.join("source");
    source(&source_path, "association-example");
    // All four installation combinations are covered by basic lifecycle tests.
    for (project_scope, copy) in [(false, false), (true, true)] {
            let project = fixture.0.join(format!("project-{project_scope}-{copy}"));
            fs::create_dir_all(project.join(".claude")).unwrap();
            let target = if project_scope {
                Target {
                    scope: "project".into(),
                    project_path: Some(project.to_string_lossy().into_owned()),
                    ..global()
                }
            } else {
                global()
            };
            let mut op = addition(&source_path, target.clone(), copy);
            op.skills = vec!["association-example".into()];
            op.agents = vec!["codex".into(), "claude-code".into()];
            let result = apply(&e, &op).unwrap();
            assert_eq!(result.items[0].status, "complete", "{}", result.logs);
            let root = target.directory(&home).unwrap();
            let dedicated = root.join(".claude/skills/association-example");
            assert_eq!(dedicated.is_symlink(), !copy);
            let inv = e.inventory(&target).unwrap();
            let associations: Vec<_> = inv
                .skills
                .iter()
                .filter(|s| s.name == "association-example")
                .flat_map(|s| &s.agents)
                .collect();
            for id in ["codex", "pi", "claude-code"] {
                assert!(
                    associations.iter().any(|agent| agent.as_str() == id),
                    "{id} has a real target"
                );
                assert_eq!(
                    inv.agents
                        .iter()
                        .find(|a| a.id == id)
                        .unwrap()
                        .installation_status,
                    InstallationStatus::Confirmed
                );
            }
            assert!(
                !associations
                    .iter()
                    .any(|agent| agent.as_str() == "windsurf"),
                "an installed Agent without a skill target has no association"
            );
            fs::remove_dir_all(root.join(".claude/skills")).unwrap();
            fs::create_dir_all(root.join(".claude/skills")).unwrap();
            symlink(root.join("missing-target"), &dedicated).unwrap();
            let broken = e.inventory(&target).unwrap();
            assert!(!broken
                .skills
                .iter()
                .filter(|s| s.name == "association-example")
                .any(|s| s.agents.iter().any(|a| a == "claude-code")));
            assert!(broken.warnings.iter().any(|w| w.contains("Broken link")));
    }
}

#[test]
fn original_discovery_priority_matches_installed_bytes_in_both_scopes() {
    for (project_scope, git_source) in [(false, false), (true, true)]
    {
        let f = TemporaryDirectory::new().unwrap();
        let home = f.0.join("home");
        let repo = f.0.join("repo");
        let project = f.0.join("project");
        fs::create_dir_all(&home).unwrap();
        fs::create_dir_all(&project).unwrap();
        // Deliberately different directory bytes: matching only SKILL.md is insufficient.
        source(&repo.join("skills/primary"), "fixture-skill");
        source(&repo.join(".cursor/skills/copy"), "fixture-skill");
        fs::write(
            repo.join("skills/primary/primary.txt"),
            "canonical attachment",
        )
        .unwrap();
        fs::write(repo.join(".cursor/skills/copy/wrong.txt"), "agent copy").unwrap();
        source(&repo.join("outer/nested"), "fallback-skill");
        let engine = engine(&home);
        let source_input = if git_source {
            assert!(
                run_process(
                    engine
                        .command(Path::new("git"), &repo)
                        .args(["init", "-q", "-b", "main"])
                )
                .unwrap()
                .success
            );
            git_commit(&engine, &repo, "priority fixture");
            crate::upstream::tests::file_url(&repo)
        } else {
            repo.to_string_lossy().into_owned()
        };
        let preview = inspect(&engine, &source_input).unwrap();
        assert_eq!(preview.skills.len(), 2);
        let selected = preview
            .skills
            .iter()
            .find(|s| s.name == "fixture-skill")
            .unwrap();
        assert_eq!(selected.path, "skills/primary");
        let target = if project_scope {
            Target {
                host: "local".into(),
                scope: "project".into(),
                project_path: Some(project.to_string_lossy().into_owned()),
            }
        } else {
            global()
        };
        let mut op = addition(&repo, target.clone(), true);
        op.source = Some(source_input);
        op.skills = preview.skills.iter().map(|s| s.name.clone()).collect();
        op.agents = vec!["codex".into()];
        op.source_hashes = Some(
            preview
                .skills
                .iter()
                .map(|s| (s.name.clone(), s.selection_fingerprint.clone()))
                .collect(),
        );
        let result = apply(&engine, &op).unwrap();
        assert!(
            result.items.iter().all(|item| item.status == "complete"),
            "{}",
            result.logs
        );
        let installed = target
            .directory(&home)
            .unwrap()
            .join(".agents/skills/fixture-skill");
        assert_eq!(source_install_signature(&installed), selected.signature);
        assert_eq!(
            fs::read(installed.join("primary.txt")).unwrap(),
            b"canonical attachment"
        );
        assert!(!installed.join("wrong.txt").exists());
    }
}

#[test]
fn original_discovery_root_lock_and_subdirectory_rules_are_preserved() {
    let f = TemporaryDirectory::new().unwrap();
    let repo = f.0.join("repo");
    source(&repo, "root-skill");
    source(&repo.join("nested/copy"), "root-skill");
    source(&repo.join("skills/other"), "other-skill");
    source(&repo.join(".agents/skills/installed"), "installed-skill");
    fs::write(repo.join("skills-lock.json"), r#"{"version":1,"skills":{"installed-skill":{"source":"owner/repo","sourceType":"github"}}}"#).unwrap();
    let engine = engine(&f.0);
    let preview = inspect(&engine, repo.to_str().unwrap()).unwrap();
    assert_eq!(preview.skills.len(), 2);
    assert_eq!(
        preview
            .skills
            .iter()
            .find(|s| s.name == "root-skill")
            .unwrap()
            .path,
        ""
    );
    assert!(!preview.skills.iter().any(|s| s.name == "installed-skill"));
    // Subpath discovery must still read the repository-root lock, like original CLI.
    let parsed = ParsedSource {
        source_type: "local".into(),
        local_path: Some(repo.to_string_lossy().into_owned()),
        subpath: Some(".agents/skills".into()),
        ..parsed_source(&engine, repo.to_str().unwrap()).unwrap()
    };
    assert!(inspect_directory(
        &engine,
        repo.to_str().unwrap(),
        false,
        parsed,
        &repo,
        &repo.join(".agents/skills")
    )
    .is_err());
}

#[test]
fn original_discovery_limits_selected_skills_instead_of_rejecting_duplicate_copies() {
    let f = TemporaryDirectory::new().unwrap();
    let repo = f.0.join("repo");
    for index in 0..205 {
        source(&repo.join(format!("copy-{index:03}")), "one-skill");
    }
    let e = engine(&f.0);
    let preview = inspect(&e, repo.to_str().unwrap()).unwrap();
    assert_eq!(preview.skills.len(), 1);
    assert_eq!(preview.skills[0].path, "copy-000");
}

#[cfg(unix)]
#[test]
fn confirmed_batch_updates_submit_once_including_modified_peers_in_both_scopes() {
    use std::os::unix::fs::PermissionsExt;
    let _serial = TEST_SERIAL
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    for project_scope in [false, true] {
        let fixture = TemporaryDirectory::new().unwrap();
        let home = fixture.0.join("home");
        fs::create_dir_all(home.join(".codex")).unwrap();
        let mut engine = engine(&home);
        let repo = fixture.0.join("source");
        let names = ["batch-a", "batch-b", "batch-protected", "untouched"];
        for name in names {
            let dir = repo.join("skills").join(name);
            source(&dir, name);
            fs::write(dir.join("version.txt"), "one").unwrap();
        }
        assert!(
            run_process(
                engine
                    .command(Path::new("git"), &repo)
                    .args(["init", "-q", "-b", "main"])
            )
            .unwrap()
            .success
        );
        git_commit(&engine, &repo, "initial");
        let url = "https://skills-fixture.invalid/batch/repo.git";
        fs::write(
            home.join(".gitconfig"),
            format!(
                "[url \"{}\"]\n    insteadOf = {url}\n",
                crate::upstream::tests::file_url(&repo)
            ),
        )
        .unwrap();
        let project = fixture.0.join("project");
        fs::create_dir(&project).unwrap();
        let target = if project_scope {
            Target {
                host: "local".into(),
                scope: "project".into(),
                project_path: Some(project.to_str().unwrap().into()),
            }
        } else {
            global()
        };
        let mut install = addition(Path::new(url), target.clone(), true);
        install.skills = names.iter().map(|name| (*name).into()).collect();
        install.agents = vec!["codex".into()];
        let result = apply(&engine, &install).unwrap();
        assert!(
            result.items.iter().all(|item| item.status == "complete"),
            "{}",
            result.logs
        );
        let installed = engine.inventory(&target).unwrap();
        let path = |name: &str| {
            PathBuf::from(
                &installed
                    .skills
                    .iter()
                    .find(|skill| skill.name == name)
                    .unwrap()
                    .path,
            )
            .join("version.txt")
        };
        fs::write(path("batch-protected"), "local edit").unwrap();
        for name in &names[..3] {
            fs::write(repo.join("skills").join(name).join("version.txt"), "two").unwrap();
        }
        git_commit(&engine, &repo, "new versions");
        let old_lock = engine.lock(&target).unwrap();
        // Instrument only fixture process invocation; the original runtime and CLI stay intact.
        let trace = fixture.0.join("updates.log");
        let wrapper = fixture.0.join("node-wrapper");
        let quoted = |path: &Path| format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"));
        fs::write(&wrapper, format!("#!/bin/sh\nif [ \"$2\" = update ]; then printf '%s\\n' \"$*\" >> {}; fi\nexec {} \"$@\"\n", quoted(&trace), quoted(&engine.node))).unwrap();
        fs::set_permissions(&wrapper, fs::Permissions::from_mode(0o700)).unwrap();
        engine.node = wrapper;
        let mut update = install.clone();
        update.action = "update".into();
        update.source = None;
        update.agents.clear();
        update.skills = names[..3].iter().map(|name| (*name).into()).collect();
        let result = apply(&engine, &update).unwrap();
        assert_eq!(
            result
                .items
                .iter()
                .map(|item| (item.skill.as_str(), item.status.as_str()))
                .collect::<Vec<_>>(),
            vec![
                ("batch-a", "complete"),
                ("batch-b", "complete"),
                ("batch-protected", "complete")
            ],
            "{}",
            result.logs
        );
        let invocations = fs::read_to_string(&trace).unwrap();
        assert_eq!(invocations.lines().count(), 1);
        assert!(invocations.contains(" update batch-a batch-b batch-protected "));
        assert!(!invocations.contains("untouched"));
        for name in ["batch-a", "batch-b", "batch-protected"] {
            assert_eq!(fs::read_to_string(path(name)).unwrap(), "two");
        }
        assert_eq!(fs::read_to_string(path("batch-protected")).unwrap(), "two");
        assert_eq!(fs::read_to_string(path("untouched")).unwrap(), "one");
        let lock = engine.lock(&target).unwrap();
        for name in ["untouched"] {
            assert_eq!(lock["skills"][name], old_lock["skills"][name]);
        }
        let inventory = engine.inventory(&target).unwrap();
        for name in ["batch-a", "batch-b", "batch-protected"] {
            assert_eq!(
                update_safety::state(&engine, &target, name, &inventory),
                "clean"
            );
        }
        update.skills = vec!["batch-protected".into()];
        let repeated = apply(&engine, &update).unwrap();
        assert_eq!(repeated.items[0].status, "complete", "{}", repeated.logs);
        assert_eq!(fs::read_to_string(&trace).unwrap().lines().count(), 2);
    }
}

#[test]
fn optional_content_limits_do_not_block_original_install_update_or_uninstall() {
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    fs::create_dir_all(home.join(".codex")).unwrap();
    let engine = engine(&home);
    let directory = fixture.0.join("source");
    source(&directory, "fixture-skill");
    fs::write(
        directory.join("large.bin"),
        vec![0u8; MAX_SKILL_CONTENT_BYTES + 1],
    )
    .unwrap();
    assert!(tree_signature(&directory).is_none());
    run_process(
        engine
            .command(Path::new("git"), &directory)
            .args(["init", "-b", "main"]),
    )
    .unwrap();
    git_commit(&engine, &directory, "initial large skill");
    let url = "https://large-fixture.invalid/owner/repo.git";
    fs::write(
        home.join(".gitconfig"),
        format!(
            "[url \"{}\"]\n insteadOf = {url}\n",
            crate::upstream::tests::file_url(&directory)
        ),
    )
    .unwrap();
    let mut operation = addition(Path::new(url), global(), true);
    operation.agents = vec!["codex".into()];
    operation.source_hashes = Some(BTreeMap::from([("fixture-skill".into(), None)]));
    let installed = apply(&engine, &operation).unwrap();
    assert_eq!(
        installed.items[0].status, "complete",
        "{} {}",
        installed.items[0].message, installed.logs
    );
    let inventory = installed.inventory.unwrap();
    let record = inventory
        .skills
        .iter()
        .find(|skill| skill.name == "fixture-skill")
        .unwrap();
    assert_eq!(
        fs::metadata(Path::new(&record.path).join("large.bin"))
            .unwrap()
            .len(),
        (MAX_SKILL_CONTENT_BYTES + 1) as u64
    );
    fs::write(
        directory.join("SKILL.md"),
        fs::read_to_string(directory.join("SKILL.md")).unwrap() + "Updated content\n",
    )
    .unwrap();
    git_commit(&engine, &directory, "updated large skill");
    let checked = check_updates(&engine, &global()).unwrap();
    assert_eq!(checked[0].status, "available", "{}", checked[0].message);
    let mut update = operation.clone();
    update.action = "update".into();
    update.source = None;
    update.agents.clear();
    let updated = apply(&engine, &update).unwrap();
    assert_eq!(
        updated.items[0].status, "complete",
        "{} {}",
        updated.items[0].message, updated.logs
    );
    assert!(fs::read_to_string(Path::new(&record.path).join("SKILL.md"))
        .unwrap()
        .contains("Updated content"));
    operation.action = "remove".into();
    operation.source = None;
    operation.removals = Some(removal_plan(&engine, &operation, &inventory).unwrap());
    let removed = apply(&engine, &operation).unwrap();
    assert_eq!(
        removed.items[0].status, "complete",
        "{} {}",
        removed.items[0].message, removed.logs
    );
    assert!(!Path::new(&record.path).exists());
}

#[test]
fn fx_174_paths_keep_legacy_inventory_read_only_in_both_scopes() {
    let f = TemporaryDirectory::new().unwrap();
    let home = f.0.join("home");
    fs::create_dir_all(&home).unwrap();
    let e = engine(&home);
    let project = f.0.join("project");
    fs::create_dir_all(&project).unwrap();
    for (root, target) in [
        (&home, global()),
        (
            &project,
            Target {
                host: "local".into(),
                scope: "project".into(),
                project_path: Some(project.to_string_lossy().into()),
            },
        ),
    ] {
        for (dir, name) in [(".fx/skills", "legacy-fx"), (".agents/skills", "shared-fx")] {
            let p = root.join(dir).join(name);
            fs::create_dir_all(&p).unwrap();
            fs::write(
                p.join("SKILL.md"),
                format!("---\nname: {name}\ndescription: Fixture\n---\nKeep body\n"),
            )
            .unwrap();
        }
        let inventory = e.inventory(&target).unwrap();
        let fx = inventory.agents.iter().find(|a| a.id == "fx").unwrap();
        assert_eq!(
            fs::canonicalize(&fx.path).unwrap(),
            fs::canonicalize(root.join(".agents/skills")).unwrap()
        );
        let legacy = inventory
            .skills
            .iter()
            .find(|s| s.name == "legacy-fx" && s.agents.contains(&"fx".into()))
            .unwrap();
        assert!(!legacy.cli_agents.contains(&"fx".into()));
        let mut request = addition(&root.join(".fx/skills/legacy-fx"), target.clone(), true);
        request.action = "remove".into();
        request.source = None;
        request.skills = vec!["legacy-fx".into()];
        request.agents = vec!["fx".into()];
        assert!(removal_plan(&e, &request, &inventory)
            .unwrap_err()
            .contains("previous installation directory"));
        assert!(inventory
            .skills
            .iter()
            .any(|s| s.name == "shared-fx" && s.cli_agents.contains(&"fx".into())));
        assert!(root.join(".fx/skills/legacy-fx/SKILL.md").is_file());
    }
}

#[test]
fn local_directory_metadata_preserves_actual_roots_and_opens_file_parents() {
    let fixture = TemporaryDirectory::new().unwrap();
    let global = fixture.0.join("custom codex home/plugins");
    let project = fixture.0.join("project/.pi");
    let package = fixture.0.join("custom pi root/node_modules/plugin");
    for path in [&global, &project, &package] {
        fs::create_dir_all(path).unwrap();
    }
    let entry = package.join("extension.ts");
    fs::write(&entry, [0xff, 0x00, 0x01]).unwrap();
    let settings = project.join("settings.json");
    fs::write(&settings, "{not parsed as configuration}").unwrap();
    let inputs = [&global, &entry, &settings];
    let observed = local_directories(
        inputs
            .iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect(),
    );
    assert_eq!(observed.len(), 3);
    for ((record, original), expected) in observed
        .iter()
        .zip(inputs)
        .zip([&global, &package, &project])
    {
        assert_eq!(record.path, original.to_string_lossy());
        assert_eq!(record.directory, expected.to_string_lossy());
        assert_eq!(
            directory_to_open(Path::new(&record.directory)).unwrap(),
            *expected
        );
    }
    assert_eq!(fs::read(&entry).unwrap(), [0xff, 0x00, 0x01]);
    assert_eq!(
        fs::read_to_string(&settings).unwrap(),
        "{not parsed as configuration}"
    );
}

#[test]
fn local_directory_metadata_excludes_missing_relative_and_nonlocal_paths() {
    let fixture = TemporaryDirectory::new().unwrap();
    let missing = fixture.0.join("missing");
    let folder = fixture.0.join("real directory");
    fs::create_dir_all(&folder).unwrap();
    let mut paths = vec![
        String::new(),
        "relative/plugin".into(),
        "~/plugins".into(),
        "npm:plugin".into(),
        "https://example.com/plugin".into(),
        format!("file://{}", folder.display()),
        missing.to_string_lossy().into_owned(),
    ];
    #[cfg(unix)]
    {
        let broken = fixture.0.join("broken-link");
        std::os::unix::fs::symlink(&missing, &broken).unwrap();
        paths.push(broken.to_string_lossy().into_owned());
        paths.push("/dev/null".into());
    }
    assert!(local_directories(paths).is_empty());
    let observed = local_directories(vec![folder.to_string_lossy().into_owned()]);
    assert_eq!(observed.len(), 1);
    assert_eq!(observed[0].path, folder.to_string_lossy());
    assert_eq!(observed[0].directory, folder.to_string_lossy());
}

#[test]
fn opening_local_directories_needs_no_agent_inventory() {
    let fixture = TemporaryDirectory::new().unwrap();
    let folder = fixture.0.join("plugin skills");
    fs::create_dir_all(&folder).unwrap();
    let markdown = folder.join("standalone.md");
    fs::write(&markdown, "fixture").unwrap();
    assert_eq!(directory_to_open(&folder).unwrap(), folder);
    assert_eq!(directory_to_open(&markdown).unwrap(), folder);
    assert!(directory_to_open(Path::new("relative/path")).is_err());
    assert!(directory_to_open(&fixture.0.join("missing")).is_err());
    let executable = fixture.0.join("not-a-folder.sh");
    fs::write(&executable, "exit 1").unwrap();
    assert!(directory_to_open(&executable).is_err());
}

#[test]
#[ignore = "Read-only isolated loading profile; select a fixture HOME explicitly"]
fn isolated_inventory_loading_profile() {
    let home = PathBuf::from(
        std::env::var_os("SKILLS_SPACE_LOADING_FIXTURE_HOME")
            .expect("Select an isolated fixture HOME"),
    );
    assert!(home.starts_with(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join(".scratch")
    ));
    let e = engine(&home);
    let target = global();
    for pass in 0..2 {
        let started = std::time::Instant::now();
        let inventory = e.inventory(&target).unwrap();
        assert!(
            inventory.pi.is_some(),
            "Reuse the Pi observation already obtained during inventory"
        );
        assert!(
            inventory.hermes.is_some(),
            "Reuse the Hermes observation already obtained during inventory"
        );
        eprintln!(
            "LOADING_PROFILE pass={pass} total_ms={} agents={} skills={}",
            started.elapsed().as_millis(),
            inventory.agents.len(),
            inventory.skills.len()
        );
    }
}

#[test]
#[cfg(unix)]
fn agent_metadata_does_not_inspect_skills_or_execute_runtimes() {
    use std::os::unix::fs::PermissionsExt;
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    let project = home.join("project");
    fs::create_dir_all(home.join(".local/bin")).unwrap();
    fs::create_dir_all(home.join(".agents/skills/bait")).unwrap();
    fs::create_dir_all(project.join(".agents/skills")).unwrap();
    fs::write(
        home.join(".agents/skills/bait/SKILL.md"),
        "invalid skill fixture; metadata must not parse this",
    )
    .unwrap();
    let trace = home.join("unexpected-runtime-calls.log");
    let forbidden = format!(
        "#!/bin/sh\nprintf 'executed\\n' >> '{}'\nexit 98\n",
        trace.display()
    );
    for name in ["codex", "pi"] {
        let path = home.join(".local/bin").join(name);
        fs::write(&path, &forbidden).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
    }
    let mut e = engine(&home);
    e.node = home.join("forbidden-node");
    fs::write(&e.node, &forbidden).unwrap();
    fs::set_permissions(&e.node, fs::Permissions::from_mode(0o755)).unwrap();
    for target in [
        global(),
        Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into()),
        },
    ] {
        let metadata = e.agents(&target).unwrap();
        let root = target.directory(&home).unwrap();
        for name in ["codex", "pi"] {
            let agent = metadata.iter().find(|agent| agent.id == name).unwrap();
            assert_eq!(
                agent.installation_status,
                detection::InstallationStatus::Confirmed
            );
            assert_eq!(agent.path, root.join(".agents/skills").to_string_lossy());
            assert!(agent.directory_exists && agent.shared_directory);
        }
        let serialized = serde_json::to_value(&metadata).unwrap();
        assert!(serialized
            .as_array()
            .unwrap()
            .iter()
            .all(|agent| agent["id"].is_string() && agent["installationStatus"].is_string()));
        assert!(
            !trace.exists(),
            "Agent metadata must not invoke skills list or Codex/Pi inspection"
        );
    }
    for target in [
        Target {
            host: "remote".into(),
            scope: "global".into(),
            project_path: None,
        },
        Target {
            host: "local".into(),
            scope: "invalid".into(),
            project_path: None,
        },
        Target {
            host: "local".into(),
            scope: "global".into(),
            project_path: Some(project.to_string_lossy().into()),
        },
        Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some("relative".into()),
        },
        Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(home.join("missing").to_string_lossy().into()),
        },
    ] {
        assert!(e.agents(&target).is_err());
    }
    assert!(!trace.exists());
}

#[test]
#[cfg(unix)]
#[ignore = "requires explicitly selected original Codex/Pi program files; all state uses an isolated HOME"]
fn agent_metadata_matches_inventory_agents_with_counted_original_runtime_baseline() {
    use std::os::unix::fs::PermissionsExt;
    let binary = PathBuf::from(
        std::env::var_os("SKILLS_SPACE_CODEX_TEST_BINARY").expect("Select original Codex binary"),
    );
    let pi = PathBuf::from(
        std::env::var_os("SKILLS_SPACE_PI_TEST_INSTALL").expect("Select original Pi program root"),
    );
    let fixture = TemporaryDirectory::new().unwrap();
    let home = fixture.0.join("home");
    let project = home.join("project");
    fs::create_dir_all(home.join(".local/bin")).unwrap();
    fs::create_dir_all(home.join(".codex")).unwrap();
    fs::create_dir_all(home.join(".agents/skills/perf")).unwrap();
    fs::create_dir_all(project.join(".git")).unwrap();
    fs::create_dir_all(project.join(".agents/skills")).unwrap();
    fs::write(
        home.join(".agents/skills/perf/SKILL.md"),
        "---\nname: perf\ndescription: Isolated timing fixture\n---\nFixture\n",
    )
    .unwrap();
    fs::write(
        home.join(".codex/config.toml"),
        format!(
            "cli_auth_credentials_store=\"ephemeral\"\n[projects.{}]\ntrust_level=\"trusted\"\n",
            serde_json::json!(project)
        ),
    )
    .unwrap();
    let metadata: serde_json::Value =
        serde_json::from_slice(&fs::read(pi.join("package.json")).unwrap()).unwrap();
    let version = metadata["version"].as_str().unwrap();
    let release = home.join(format!(
        ".pi/agent/install/releases/{version}/node_modules/@earendil-works"
    ));
    fs::create_dir_all(&release).unwrap();
    std::os::unix::fs::symlink(&pi, release.join("pi-coding-agent")).unwrap();
    fs::write(home.join(".pi/agent/install/current-version"), version).unwrap();
    fs::write(home.join(".pi/agent/settings.json"), "{}").unwrap();
    let mut e = engine(&home);
    let real_node = e.node.clone();
    let trace = home.join("runtime-calls.log");
    let wrappers = [
        (
            home.join("counted-node"),
            format!(
                "#!/bin/sh\nprintf 'node:%s:%s\\n' \"$1\" \"$2\" >> '{}'\nexec '{}' \"$@\"\n",
                trace.display(),
                real_node.display()
            ),
        ),
        (
            home.join(".local/bin/codex"),
            format!(
                "#!/bin/sh\nprintf 'codex:%s\\n' \"$1\" >> '{}'\nexec '{}' \"$@\"\n",
                trace.display(),
                binary.display()
            ),
        ),
        (
            home.join(".local/bin/pi"),
            format!(
                "#!/bin/sh\nprintf 'pi:%s\\n' \"$1\" >> '{}'\nexec '{}' '{}' \"$@\"\n",
                trace.display(),
                real_node.display(),
                pi.join("dist/cli.js").display()
            ),
        ),
    ];
    for (path, content) in wrappers {
        fs::write(&path, content).unwrap();
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
    }
    e.node = home.join("counted-node");
    for target in [
        global(),
        Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into()),
        },
    ] {
        fs::write(&trace, "").unwrap();
        let started = std::time::Instant::now();
        let agents = e.agents(&target).unwrap();
        let metadata_ms = started.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(fs::read_to_string(&trace).unwrap(), "");
        let started = std::time::Instant::now();
        let inventory = e.inventory(&target).unwrap();
        let inventory_ms = started.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(agents.len(), inventory.agents.len());
        for (light, full) in agents.iter().zip(&inventory.agents) {
            let mut light = serde_json::to_value(light).unwrap();
            let mut full = serde_json::to_value(full).unwrap();
            // Full native inspection appends Codex/Pi native directories;
            // sidebar metadata retains the same identity/status/static paths.
            let light_extra = light
                .as_object_mut()
                .unwrap()
                .remove("additionalPaths")
                .unwrap();
            let full_extra = full
                .as_object_mut()
                .unwrap()
                .remove("additionalPaths")
                .unwrap();
            assert_eq!(
                light, full,
                "Agent identity/status must match without native inspection"
            );
            for path in light_extra.as_array().unwrap() {
                assert!(full_extra.as_array().unwrap().contains(path));
            }
        }
        let calls = fs::read_to_string(&trace).unwrap();
        let skills_list = calls
            .lines()
            .filter(|line| line.contains("skills/bin/cli.mjs:list"))
            .count();
        let codex_calls = calls
            .lines()
            .filter(|line| line.starts_with("codex:"))
            .count();
        let pi_inspect = calls
            .lines()
            .filter(|line| line.contains("inspect-pi-skills.mjs"))
            .count();
        assert_eq!(skills_list, 1);
        assert!(codex_calls > 0 && pi_inspect > 0);
        println!("AGENT_METADATA_BASELINE scope={} metadata_ms={:.3} first_inventory_ms={:.3} metadata_runtime_calls=0 inventory_skills_list={} inventory_codex_processes={} inventory_pi_inspections={}", target.scope, metadata_ms, inventory_ms, skills_list, codex_calls, pi_inspect);
    }
}
