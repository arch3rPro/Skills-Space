//! Read-only plugin grouping. Names and every mutation remain upstream-owned.
use super::*;

#[derive(Deserialize)]
struct Metadata {
    paths: Vec<String>,
    groups: Vec<(String, String)>,
}

#[derive(Deserialize)]
pub(super) struct SelectedPaths {
    pub paths: Vec<String>,
    pub warnings: Vec<String>,
}

pub(super) fn selected_paths(
    engine: &Engine,
    root: &Path,
    search: &Path,
    include_internal: bool,
    filter: Option<&str>,
) -> Result<SelectedPaths, String> {
    let output = run_process(
        engine
            .command(&engine.node, &engine.home)
            .arg(engine.resources.join("inspect-upstream-discovery.mjs"))
            .arg(root)
            .arg(search)
            .arg(include_internal.to_string())
            .arg(filter.unwrap_or("")),
    )?;
    if !output.success {
        return Err(format!(
            "Cannot preview original skill discovery: {}",
            output.stderr
        ));
    }
    serde_json::from_str(&output.stdout).map_err(|e| e.to_string())
}

pub(super) fn discover(engine: &Engine, root: &Path) -> Result<BTreeMap<String, String>, String> {
    let output = run_process(
        engine
            .command(&engine.node, &engine.home)
            .arg(engine.resources.join("inspect-upstream-plugins.mjs"))
            .arg(root),
    )?;
    if !output.success {
        return Err(format!(
            "Cannot inspect plugin manifests: {}",
            output.stderr
        ));
    }
    let metadata: Metadata = serde_json::from_str(&output.stdout).map_err(|e| e.to_string())?;
    let root = fs::canonicalize(root).map_err(|e| e.to_string())?;
    // Validate manifest paths; the original discoverSkills function alone enumerates candidates.
    for directory in metadata.paths {
        let directory = Path::new(&directory);
        if directory.exists() {
            checked_path(&root, directory)?;
        }
    }
    let mut groups = BTreeMap::new();
    for (path, name) in metadata.groups {
        let path = Path::new(&path);
        if path.exists() {
            checked_path(&root, path)?;
        }
        if !path.starts_with(&root) {
            return Err("Plugin path is outside the source.".into());
        }
        groups.insert(path.to_string_lossy().into_owned(), name);
    }
    Ok(groups)
}

fn checked_path(root: &Path, path: &Path) -> Result<(), String> {
    if !path.starts_with(root) {
        return Err("Plugin path is outside the source.".into());
    }
    for ancestor in path.ancestors().take_while(|p| *p != root) {
        if fs::symlink_metadata(ancestor)
            .map_err(|e| e.to_string())?
            .is_symlink()
        {
            return Err("Linked plugin paths cannot be reliably previewed.".into());
        }
    }
    if !fs::canonicalize(path)
        .map_err(|e| e.to_string())?
        .starts_with(root)
    {
        return Err("Plugin path escapes the source.".into());
    }
    Ok(())
}

pub(super) fn selection_fingerprint(
    hash: &Option<String>,
    plugin: &Option<String>,
) -> Option<String> {
    hash.as_ref().map(|hash| match plugin {
        Some(plugin) => serde_json::json!([hash, plugin]).to_string(),
        None => hash.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::tests::{addition, engine, global};

    fn source(path: &Path, name: &str) {
        fs::create_dir_all(path).unwrap();
        fs::write(
            path.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: Plugin fixture\n---\nVersion 1\n"),
        )
        .unwrap();
    }
    fn manifest(root: &Path, name: &str) {
        fs::create_dir_all(root.join(".claude-plugin")).unwrap();
        fs::write(
            root.join(".claude-plugin/marketplace.json"),
            serde_json::json!({
                "metadata":{"pluginRoot":"./extensions"},
                "plugins":[{"name":name,"source":"./one","skills":["./custom/fixture"]},
                           {"name":"other-tools","source":"./two","skills":["./custom/other"]},
                           {"name":"ignored","source":"../outside","skills":["./fixture"]}]
            })
            .to_string(),
        )
        .unwrap();
    }
    fn commit(engine: &Engine, repo: &Path) {
        for args in [
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
            let out = run_process(engine.command(Path::new("git"), repo).args(args)).unwrap();
            assert!(out.success, "{}", out.stderr);
        }
    }
    fn confirmed(engine: &Engine, source: &str, target: Target) -> Operation {
        let preview = inspect(engine, source).unwrap();
        let mut op = addition(Path::new(source), target, false);
        op.agents = vec!["codex".into()];
        op.source_hashes = Some(
            preview
                .skills
                .iter()
                .map(|s| (s.name.clone(), s.selection_fingerprint.clone()))
                .collect(),
        );
        op
    }

    #[test]
    fn plugin_manifest_preview_selection_and_changed_group_require_new_confirmation() {
        let f = TemporaryDirectory::new().unwrap();
        let home = f.0.join("home");
        fs::create_dir_all(home.join(".codex")).unwrap();
        let engine = engine(&home);
        let repo = f.0.join("repo");
        source(&repo.join("extensions/one/custom/fixture"), "fixture-skill");
        source(&repo.join("extensions/two/custom/other"), "other-skill");
        manifest(&repo, "review-tools");
        let preview = inspect(&engine, repo.to_str().unwrap()).unwrap();
        assert_eq!(preview.skills.len(), 2);
        let skill = preview
            .skills
            .iter()
            .find(|s| s.name == "fixture-skill")
            .unwrap();
        assert_eq!(skill.plugin_name.as_deref(), Some("review-tools"));
        assert_ne!(skill.fingerprint, skill.selection_fingerprint);
        let mut op = confirmed(&engine, repo.to_str().unwrap(), global());
        manifest(&repo, "renamed-tools");
        assert!(apply(&engine, &op)
            .err()
            .unwrap()
            .contains("Source content changed"));
        assert!(!home.join(".agents/skills").exists());
        op = confirmed(&engine, repo.to_str().unwrap(), global());
        let result = apply(&engine, &op).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        assert_eq!(result.inventory.unwrap().skills.len(), 1);
        assert!(!home.join(".agents/skills/other-skill").exists());
        op.action = "remove".into();
        op.source_hashes = None;
        assert_eq!(apply(&engine, &op).unwrap().items[0].status, "complete");
        assert!(repo
            .join("extensions/one/custom/fixture/SKILL.md")
            .is_file());
        let out = run_process(
            engine
                .command(Path::new("git"), &repo)
                .args(["init", "-q", "-b", "main"]),
        )
        .unwrap();
        assert!(out.success);
        commit(&engine, &repo);
        let input = format!("file://{}", repo.display());
        let mut file_op = confirmed(&engine, &input, global());
        let result = apply(&engine, &file_op).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        assert!(engine.lock(&global()).unwrap()["skills"]["fixture-skill"].is_null());
        assert!(result.inventory.unwrap().skills[0].plugin_name.is_none());
        file_op.action = "remove".into();
        file_op.source_hashes = None;
        assert_eq!(
            apply(&engine, &file_op).unwrap().items[0].status,
            "complete"
        );
    }

    #[test]
    fn original_plugin_git_lifecycle_keeps_raw_identity_and_global_only_group_record() {
        let f = TemporaryDirectory::new().unwrap();
        let home = f.0.join("home");
        fs::create_dir_all(home.join(".codex")).unwrap();
        let engine = engine(&home);
        let repo = f.0.join("repo");
        source(&repo.join("extensions/one/custom/fixture"), "fixture-skill");
        source(&repo.join("extensions/two/custom/other"), "other-skill");
        manifest(&repo, "review-tools");
        let out = run_process(
            engine
                .command(Path::new("git"), &repo)
                .args(["init", "-q", "-b", "main"]),
        )
        .unwrap();
        assert!(out.success);
        commit(&engine, &repo);
        let url = "https://skills-fixture.invalid/owner/plugin.git";
        fs::write(home.join(".gitconfig"),format!("[url \"file://{}\"]\n    insteadOf = {url}\n    insteadOf = https://github.com/fixture/plugin.git\n",repo.display())).unwrap();
        let filtered = inspect(&engine, "github:fixture/plugin#main@FIXTURE-SKILL").unwrap();
        assert_eq!(filtered.skills.len(), 1);
        assert_eq!(
            filtered.skills[0].plugin_name.as_deref(),
            Some("review-tools")
        );
        assert!(inspect(
            &engine,
            "github:fixture/plugin#main@review-tools:fixture-skill"
        )
        .is_err());
        for project_scope in [false, true] {
            let project = f.0.join(if project_scope { "project" } else { "unused" });
            fs::create_dir_all(&project).unwrap();
            let target = if project_scope {
                Target {
                    host: "local".into(),
                    scope: "project".into(),
                    project_path: Some(project.to_string_lossy().into_owned()),
                }
            } else {
                global()
            };
            let input = url.to_string();
            let mut op = confirmed(&engine, &input, target.clone());
            op.copy = project_scope;
            let result = apply(&engine, &op).unwrap();
            assert_eq!(result.items[0].status, "complete", "{}", result.logs);
            let inventory = result.inventory.unwrap();
            assert_eq!(inventory.skills.len(), 1);
            assert_eq!(inventory.skills[0].name, "fixture-skill");
            assert_eq!(
                inventory.skills[0].plugin_name.as_deref(),
                if project_scope {
                    None
                } else {
                    Some("review-tools")
                }
            );
            assert_eq!(
                engine.lock(&target).unwrap()["skills"]["fixture-skill"]["pluginName"].as_str(),
                if project_scope {
                    None
                } else {
                    Some("review-tools")
                }
            );
            assert_eq!(
                check_updates(&engine, &target).unwrap()[0].status,
                "current"
            );
            let doc = repo.join("extensions/one/custom/fixture/SKILL.md");
            let raw = fs::read_to_string(&doc).unwrap();
            fs::write(&doc, format!("{raw}Version 2\n")).unwrap();
            commit(&engine, &repo);
            assert_eq!(
                check_updates(&engine, &target).unwrap()[0].status,
                "available"
            );
            op.action = "update".into();
            op.agents.clear();
            op.source_hashes = None;
            let result = apply(&engine, &op).unwrap();
            assert_eq!(result.items[0].status, "complete", "{}", result.logs);
            assert!(fs::read_to_string(
                Path::new(&result.inventory.unwrap().skills[0].path).join("SKILL.md")
            )
            .unwrap()
            .contains("Version 2"));
            assert_eq!(
                check_updates(&engine, &target).unwrap()[0].status,
                "current"
            );
            op.action = "remove".into();
            op.agents = vec!["codex".into()];
            // Original update can install other skills from the same source.
            // Remove every actually observed item explicitly; never assume selection
            // of one skill constrained the upstream update's whole repository effect.
            op.skills = engine
                .inventory(&target)
                .unwrap()
                .skills
                .iter()
                .map(|s| s.name.clone())
                .collect();
            let result = apply(&engine, &op).unwrap();
            assert!(
                result.items.iter().all(|item| item.status == "complete"),
                "{}",
                result.logs
            );
            assert!(result.inventory.unwrap().skills.is_empty());
            assert!(doc.is_file());
        }
    }

    #[test]
    fn plugin_deep_paths_direct_manifest_ambiguity_and_invalid_manifest_boundaries() {
        let f = TemporaryDirectory::new().unwrap();
        let engine = engine(&f.0);
        let repo = f.0.join("repo");
        let skill = repo.join("one/two/three/four/five/six/custom/fixture");
        source(&skill, "fixture-skill");
        fs::create_dir_all(repo.join(".claude-plugin")).unwrap();
        let file = repo.join(".claude-plugin/plugin.json");
        fs::write(&file,serde_json::json!({"name":"deep-tools","skills":["./one/two/three/four/five/six/custom/fixture"]}).to_string()).unwrap();
        let preview = inspect(&engine, repo.to_str().unwrap()).unwrap();
        assert_eq!(preview.skills.len(), 1);
        assert_eq!(preview.skills[0].plugin_name.as_deref(), Some("deep-tools"));
        source(&repo.join("duplicate"), "FIXTURE-SKILL");
        assert!(inspect(&engine, repo.to_str().unwrap())
            .err()
            .unwrap()
            .contains("Duplicate"));
        fs::remove_dir_all(repo.join("duplicate")).unwrap();
        fs::write(&file, "{").unwrap();
        assert!(inspect(&engine, repo.to_str().unwrap())
            .err()
            .unwrap()
            .contains("plugin manifests"));
        fs::write(&file, r#"{"name":"broken","skills":[42]}"#).unwrap();
        assert!(inspect(&engine, repo.to_str().unwrap()).is_err());
        #[cfg(unix)]
        {
            fs::remove_file(&file).unwrap();
            let outside = f.0.join("outside.json");
            fs::write(&outside, "{}").unwrap();
            std::os::unix::fs::symlink(outside, &file).unwrap();
            assert!(inspect(&engine, repo.to_str().unwrap()).is_err());
        }
    }
}
