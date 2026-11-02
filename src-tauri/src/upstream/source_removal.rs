//! Expand an exact upstream lock source into an explicit, reviewed removal plan.
use super::*;
fn members(engine: &Engine, target: &Target, source: &str) -> Result<Vec<String>, String> {
    let lock = engine.lock(target)?;
    let entries = lock["skills"]
        .as_object()
        .ok_or("No source records are available.")?;
    let mut names: Vec<_> = entries
        .iter()
        .filter(|(_, e)| e["source"].as_str() == Some(source))
        .map(|(n, _)| n.clone())
        .collect();
    names.sort();
    if names.is_empty() || names.len() > 200 {
        return Err("Source removal requires 1–200 recorded skills.".into());
    }
    Ok(names)
}
pub(super) fn validate(engine: &Engine, op: &Operation) -> Result<(), String> {
    if let Some(source) = &op.removal_source {
        if op.action != "remove" || members(engine, &op.target, source)? != op.skills {
            return Err("Source membership changed. Review a new removal plan.".into());
        }
    }
    Ok(())
}
fn plan(engine: &Engine, target: Target, skill: &str) -> Result<Operation, String> {
    let lock = engine.lock(&target)?;
    let source = lock["skills"][skill]["source"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or("This skill has no upstream source record.")?
        .to_owned();
    if source.len() > 8192
        || source.chars().any(char::is_control)
        || reqwest::Url::parse(&source).is_ok_and(|u| {
            matches!(u.scheme(), "http" | "https")
                && (!u.username().is_empty() || u.password().is_some())
        })
    {
        return Err(
            "This source record cannot be safely displayed. Use per-skill uninstall instead."
                .into(),
        );
    }
    let skills = members(engine, &target, &source)?;
    let inventory = engine.inventory(&target)?;
    let mut agents: Vec<_> = inventory
        .skills
        .iter()
        .filter(|s| skills.contains(&s.name) && s.cli_managed)
        .flat_map(|s| s.cli_agents.clone())
        .collect();
    agents.sort();
    agents.dedup();
    if agents.is_empty() {
        agents = inventory.agents.iter().map(|a| a.id.clone()).collect();
    }
    let mut op = Operation {
        dsh_context_key: None,
        target,
        action: "remove".into(),
        source: None,
        skills,
        agents,
        copy: false,
        source_hashes: None,
        include_internal: false,
        removals: None,
        eve_subagents: vec![],
        removal_source: Some(source),
        inspection_session: None,
        sync_origin: None,
    };
    operation_args(engine, &op)?;
    op.removals = Some(removal_plan(engine, &op, &inventory)?);
    Ok(op)
}
#[tauri::command]
pub async fn upstream_source_removal_plan(
    app: AppHandle,
    target: Target,
    skill: String,
) -> Result<Operation, String> {
    tauri::async_runtime::spawn_blocking(move || plan(&Engine::from_app(&app)?, target, &skill))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::tests::{addition, engine, global};
    #[test]
    fn source_membership_is_rechecked_and_other_sources_and_files_survive() {
        for project_scope in [false, true] {
            let f = TemporaryDirectory::new().unwrap();
            let project = f.0.join("project");
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
            fs::create_dir_all(f.0.join(".codex")).unwrap();
            if project_scope {
                // Pi only discovers project-native skills after explicit project trust.
                let agent = f.0.join(".pi/agent");
                fs::create_dir_all(&agent).unwrap();
                fs::write(
                    agent.join("trust.json"),
                    serde_json::to_vec(&serde_json::json!({
                        fs::canonicalize(&project).unwrap().to_string_lossy().to_string(): true
                    }))
                    .unwrap(),
                )
                .unwrap();
            }
            let e = engine(&f.0);
            let root = f.0.join("source");
            for name in ["alpha", "beta"] {
                let p = root.join(name);
                fs::create_dir_all(&p).unwrap();
                fs::write(
                    p.join("SKILL.md"),
                    format!("---\nname: {name}\ndescription: Source fixture\n---\nBody\n"),
                )
                .unwrap();
            }
            let mut op = addition(&root, target.clone(), false);
            op.skills = vec!["alpha".into(), "beta".into()];
            assert!(apply(&e, &op)
                .unwrap()
                .items
                .iter()
                .all(|i| i.status == "complete"));
            let other = f.0.join("other");
            fs::create_dir(&other).unwrap();
            fs::write(
                other.join("SKILL.md"),
                "---\nname: other\ndescription: Other\n---\nKeep\n",
            )
            .unwrap();
            op.source = Some(other.to_string_lossy().into_owned());
            op.skills = vec!["other".into()];
            assert_eq!(apply(&e, &op).unwrap().items[0].status, "complete");
            let native = if project_scope {
                project.join(".pi/skills/alpha")
            } else {
                f.0.join(".pi/agent/skills/alpha")
            };
            fs::create_dir_all(&native).unwrap();
            let native_bytes =
                b"---\nname: alpha\ndescription: Native Pi copy\n---\nKeep native content\n";
            fs::write(native.join("SKILL.md"), native_bytes).unwrap();
            let inventory = e.inventory(&target).unwrap();
            assert!(inventory.skills.iter().any(|skill| skill.name == "alpha"
                && !skill.cli_managed
                && skill
                    .pi_state
                    .as_ref()
                    .is_some_and(|state| !state.cli_addressable)));
            let stale = plan(&e, target.clone(), "alpha").unwrap();
            assert!(stale
                .removals
                .as_ref()
                .unwrap()
                .iter()
                .flat_map(|plan| &plan.paths)
                .all(|path| Path::new(&path.path) != native));
            assert_eq!(stale.skills, vec!["alpha", "beta"]);
            let path = if project_scope {
                project.join("skills-lock.json")
            } else {
                f.0.join(".agents/.skill-lock.json")
            };
            let mut lock = e.lock(&target).unwrap();
            lock["skills"]["ghost"] = lock["skills"]["alpha"].clone();
            fs::write(&path, serde_json::to_vec(&lock).unwrap()).unwrap();
            assert!(apply(&e, &stale).is_err());
            let op = plan(&e, target.clone(), "alpha").unwrap();
            let result = apply(&e, &op).unwrap();
            assert!(
                result.items.iter().all(|i| i.status == "complete"),
                "{}",
                result.logs
            );
            let current = e.inventory(&target).unwrap();
            assert_eq!(current.skills.len(), 2);
            assert!(current.skills.iter().any(|skill| skill.name == "other"));
            assert!(!current.skills.iter().any(|skill| skill.name == "beta"));
            let alpha: Vec<_> = current
                .skills
                .iter()
                .filter(|skill| skill.name == "alpha")
                .collect();
            assert_eq!(alpha.len(), 1);
            assert!(!alpha[0].cli_managed);
            assert_eq!(fs::read(native.join("SKILL.md")).unwrap(), native_bytes);
            assert!(root.join("alpha/SKILL.md").exists());
            assert!(e.lock(&target).unwrap()["skills"]["ghost"].is_null());
        }
    }
}
