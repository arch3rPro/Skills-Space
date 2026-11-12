//! Eve path identity and read-only expectations for the pinned CLI's transformed documents.
use super::restoration::folder_name;
use super::*;

pub(super) fn subagents(project: &Path) -> Result<Vec<String>, String> {
    let root = project.join("agent/subagents");
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut names = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if name == "root" || folder_name(&name) != name || name.is_empty() {
            return Err("An Eve subagent directory has a reserved or non-portable name. Review agent/subagents before managing it.".into());
        }
        names.push(name);
        if names.len() > 100 {
            return Err("Eve subagent discovery exceeds 100 directories.".into());
        }
    }
    names.sort();
    Ok(names)
}
pub(super) fn validate_operation(engine: &Engine, op: &Operation) -> Result<(), String> {
    if op.action != "add" && !op.eve_subagents.is_empty() {
        return Err("Upstream has no selective Eve subagent update/remove option. Confirm all affected paths.".into());
    }
    if !op.agents.iter().any(|id| id == "eve") {
        if !op.eve_subagents.is_empty() {
            return Err("Select Eve before selecting its subagents.".into());
        }
        return Ok(());
    }
    if op.target.scope != "project" {
        return Err("Eve supports project scope only.".into());
    }
    let mut destinations = std::collections::BTreeSet::new();
    if op.skills.iter().any(|name| {
        !name.is_ascii()
            || name.len() > 200
            || folder_name(name).is_empty()
            || !destinations.insert(folder_name(name))
    }) {
        return Err(
            "Eve skill names require unique portable ASCII destinations within 200 characters."
                .into(),
        );
    }
    let project = op.target.directory(&engine.home)?;
    let available = subagents(&project)?;
    let mut selected = std::collections::BTreeSet::new();
    for name in &op.eve_subagents {
        if !selected.insert(name) || name != "root" && !available.contains(name) {
            return Err(
                "Eve targets changed or are invalid. Refresh and select existing subagents.".into(),
            );
        }
    }
    for path in [
        project.join("agent"),
        project.join("agent/skills"),
        project.join("agent/subagents"),
    ]
    .into_iter()
    .chain(available.iter().flat_map(|n| {
        [
            project.join("agent/subagents").join(n),
            project.join("agent/subagents").join(n).join("skills"),
        ]
    })) {
        match fs::symlink_metadata(path) {
            Ok(m) if m.is_symlink() || !m.is_dir() => {
                return Err("Eve installation parents must be real project directories.".into())
            }
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
            _ => {}
        }
    }
    Ok(())
}
pub(super) fn validate_locked(
    engine: &Engine,
    op: &Operation,
    lock: &serde_json::Value,
    inventory: &Inventory,
) -> Result<(), String> {
    for name in &op.skills {
        let field = &lock["skills"][name]["subagents"];
        let has_eve = inventory
            .skills
            .iter()
            .any(|s| s.name == *name && s.agents.iter().any(|id| id == "eve"));
        if field.is_null() && !has_eve {
            continue;
        }
        if !field.is_null()
            && (!field.is_array()
                || field.as_array().is_some_and(|a| {
                    a.is_empty() || a.len() > 101 || a.iter().any(|s| !s.is_string())
                }))
        {
            return Err("Invalid Eve subagent lock record. Review it before updating.".into());
        }
        let mut planned = op.clone();
        planned.action = "add".into();
        planned.agents = vec!["eve".into()];
        planned.eve_subagents = slots(lock, name)
            .iter()
            .map(|s| {
                if s.is_empty() {
                    "root".into()
                } else {
                    s.clone()
                }
            })
            .collect();
        validate_operation(engine, &planned)?;
    }
    Ok(())
}
pub(super) fn add_removal_paths(
    engine: &Engine,
    target: &Target,
    name: &str,
    paths: &mut BTreeMap<String, RemovalPath>,
) -> Result<(), String> {
    let project = target.directory(&engine.home)?;
    for base in std::iter::once(project.join("agent/skills")).chain(
        subagents(&project)?
            .iter()
            .map(|slot| project.join("agent/subagents").join(slot).join("skills")),
    ) {
        let path = base.join(folder_name(name));
        let meta = match fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(e.to_string()),
        };
        let key = path.to_string_lossy().into_owned();
        paths
            .entry(key.clone())
            .and_modify(|p| {
                if !p.agents.iter().any(|id| id == "eve") {
                    p.agents.push("eve".into());
                }
            })
            .or_insert(RemovalPath {
                path: key,
                kind: if meta.is_symlink() { "link" } else { "copy" }.into(),
                agents: vec!["eve".into()],
                selected: true,
                link_target: fs::read_link(path)
                    .ok()
                    .map(|p| p.to_string_lossy().into_owned()),
            });
    }
    Ok(())
}
pub(super) fn paths(op: &Operation, home: &Path, name: &str) -> Result<Vec<PathBuf>, String> {
    let root = op.target.directory(home)?;
    let folder = folder_name(name);
    if folder.is_empty() {
        return Err("Invalid Eve skill destination.".into());
    }
    let slots = if op.eve_subagents.is_empty() {
        vec!["root".into()]
    } else {
        op.eve_subagents.clone()
    };
    Ok(slots
        .iter()
        .map(|slot| {
            if slot == "root" {
                root.join("agent/skills").join(&folder)
            } else {
                root.join("agent/subagents")
                    .join(slot)
                    .join("skills")
                    .join(&folder)
            }
        })
        .collect())
}
pub(super) fn installed_matches(
    engine: &Engine,
    op: &Operation,
    name: &str,
    expected: Option<&Vec<u8>>,
    hash: Option<&String>,
) -> bool {
    let Ok(lock) = engine.lock(&op.target) else {
        return false;
    };
    let expected_slots = if op.eve_subagents.is_empty() {
        vec!["".to_string()]
    } else {
        op.eve_subagents
            .iter()
            .map(|s| if s == "root" { "".into() } else { s.clone() })
            .collect()
    };
    let recorded_slots = slots(&lock, name);
    expected.is_some_and(|expected| {
        paths(op, &engine.home, name).is_ok_and(|paths| {
            paths.iter().all(|p| {
                fs::symlink_metadata(p).is_ok_and(|m| m.is_dir() && !m.is_symlink())
                    && tree_signature(p).as_ref() == Some(expected)
            })
        })
    }) && expected_slots == recorded_slots
        && hash.is_some_and(|h| lock["skills"][name]["computedHash"].as_str() == Some(h.as_str()))
}
fn slots(lock: &serde_json::Value, name: &str) -> Vec<String> {
    lock["skills"][name]["subagents"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|s| s.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or(vec![String::new()])
}
pub(super) fn recorded_paths(
    target: &Target,
    home: &Path,
    name: &str,
    lock: &serde_json::Value,
) -> Vec<PathBuf> {
    let Ok(project) = target.directory(home) else {
        return Vec::new();
    };
    slots(lock, name)
        .iter()
        .map(|s| {
            if s.is_empty() {
                project.join("agent/skills").join(folder_name(name))
            } else {
                project
                    .join("agent/subagents")
                    .join(s)
                    .join("skills")
                    .join(folder_name(name))
            }
        })
        .collect()
}
pub(super) fn update_matches(
    engine: &Engine,
    op: &Operation,
    name: &str,
    before: &serde_json::Value,
    source: &[u8],
) -> bool {
    let Ok(after) = engine.lock(&op.target) else {
        return false;
    };
    signature(engine, source).is_ok_and(|expected| {
        recorded_paths(&op.target, &engine.home, name, before)
            .iter()
            .all(|p| {
                fs::symlink_metadata(p).is_ok_and(|m| m.is_dir() && !m.is_symlink())
                    && tree_signature(p).as_ref() == Some(&expected)
            })
    }) && slots(before, name) == slots(&after, name)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EveObservation {
    path: String,
    kind: String,
    content_matches: bool,
}
pub(super) fn observations(
    _engine: &Engine,
    paths: Vec<PathBuf>,
    expected: Option<&Vec<u8>>,
) -> Vec<EveObservation> {
    paths
        .iter()
        .map(|p| EveObservation {
            path: p.to_string_lossy().into_owned(),
            kind: match fs::symlink_metadata(p) {
                Ok(m) if m.is_symlink() => "link",
                Ok(m) if m.is_dir() => "directory",
                Ok(_) => "other",
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => "missing",
                Err(_) => "unknown",
            }
            .into(),
            content_matches: expected.is_some_and(|s| tree_signature(p).as_ref() == Some(s)),
        })
        .collect()
}
pub(super) fn recorded_path(
    target: &Target,
    home: &Path,
    name: &str,
    path: &str,
    lock: &serde_json::Value,
) -> bool {
    let Ok(project) = target.directory(home) else {
        return false;
    };
    let folder = folder_name(name);
    let entry = &lock["skills"][name];
    let slots = entry["subagents"]
        .as_array()
        .map(|a| a.iter().filter_map(|s| s.as_str()).collect::<Vec<_>>())
        .unwrap_or(vec![""]);
    slots.iter().any(|slot| {
        Path::new(path)
            == if slot.is_empty() {
                project.join("agent/skills").join(&folder)
            } else {
                project
                    .join("agent/subagents")
                    .join(slot)
                    .join("skills")
                    .join(&folder)
            }
    })
}
#[derive(Deserialize)]
struct EveDocument {
    path: String,
    description: Option<String>,
    error: Option<String>,
}
pub(super) fn inventory_documents(
    engine: &Engine,
    agents: &[Agent],
    lock: &serde_json::Value,
    metadata: &mut BTreeMap<String, DocumentMetadata>,
    warnings: &mut Vec<String>,
) -> Result<(), String> {
    let mut paths = Vec::new();
    for agent in agents.iter().filter(|a| a.id == "eve") {
        for base in std::iter::once(&agent.path).chain(agent.additional_paths.iter()) {
            if let Ok(entries) = fs::read_dir(base) {
                for entry in entries {
                    let path = entry.map_err(|e| e.to_string())?.path();
                    if path.is_file()
                        && path
                            .extension()
                            .is_some_and(|e| e.to_string_lossy().eq_ignore_ascii_case("md"))
                    {
                        warnings.push(format!("Flat Eve skill file is outside the supported directory workflow; inspect it directly: {}",path.display()));
                    }
                    if path.join("SKILL.md").is_file() {
                        paths.push(path.to_string_lossy().into_owned());
                    }
                }
            }
        }
    }
    if paths.is_empty() {
        return Ok(());
    }
    let output = run_process(
        engine
            .command(&engine.node, &engine.home)
            .arg(engine.resources.join("inspect-eve.mjs"))
            .arg("documents")
            .arg(serde_json::to_string(&paths).map_err(|e| e.to_string())?),
    )?;
    if !output.success {
        return Err("Could not inspect Eve skill documents.".into());
    }
    let docs: Vec<EveDocument> = serde_json::from_str(&output.stdout).map_err(|e| e.to_string())?;
    for doc in docs {
        let folder = Path::new(&doc.path)
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("Invalid Eve folder.")?;
        let candidates = lock["skills"]
            .as_object()
            .map(|m| {
                m.keys()
                    .filter(|n| folder_name(n) == folder)
                    .cloned()
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        if candidates.len() > 1 {
            return Err("Eve folder matches multiple lock identities.".into());
        }
        let name = candidates.first().cloned().unwrap_or(folder.into());
        let hash = metadata.get(&doc.path).and_then(|d| d.hash.clone());
        let legacy_hash = metadata.get(&doc.path).and_then(|d| d.legacy_hash.clone());
        metadata.insert(
            doc.path.clone(),
            DocumentMetadata {
                path: doc.path,
                name: doc.description.as_ref().map(|_| name),
                description: doc.description,
                internal: false,
                hash,
                legacy_hash,
                error: doc.error,
            },
        );
    }
    Ok(())
}
// The same framed tree representation used by bounded_signature, with only Eve's
// original frontmatter formatter applied to each SKILL.md. No temporary writes.
pub(super) fn signature(engine: &Engine, source: &[u8]) -> Result<Vec<u8>, String> {
    fn take<'a>(bytes: &mut &'a [u8]) -> Result<&'a [u8], String> {
        let prefix = bytes.get(..8).ok_or("Invalid tree framing.")?;
        let mut arr = [0; 8];
        arr.copy_from_slice(prefix);
        let len = usize::try_from(u64::from_le_bytes(arr)).map_err(|_| "Tree too large.")?;
        let value = bytes.get(8..8 + len).ok_or("Invalid tree content.")?;
        *bytes = &bytes[8 + len..];
        Ok(value)
    }
    let mut remaining = source;
    let mut files = Vec::new();
    let mut inputs = Vec::new();
    while !remaining.is_empty() {
        let name = take(&mut remaining)?.to_vec();
        let content = take(&mut remaining)?.to_vec();
        let path = std::str::from_utf8(&name).map_err(|e| e.to_string())?;
        let transform = Path::new(path)
            .file_name()
            .is_some_and(|s| s.to_string_lossy().eq_ignore_ascii_case("SKILL.md"));
        if transform {
            inputs.push(String::from_utf8(content.clone()).map_err(|e| e.to_string())?);
        }
        files.push((name, content, transform));
    }
    let input = serde_json::to_string(&inputs).map_err(|e| e.to_string())?;
    if input.len() > 64 * 1024 {
        return Err("Eve conversion exceeds the 64 KiB argument verification limit.".into());
    }
    let output = run_process(
        engine
            .command(&engine.node, &engine.home)
            .arg(engine.resources.join("inspect-eve.mjs"))
            .arg("transform")
            .arg(input),
    )?;
    if !output.success {
        return Err("Could not verify Eve document conversion.".into());
    }
    let values: Vec<String> = serde_json::from_str(&output.stdout).map_err(|e| e.to_string())?;
    if values.len() != inputs.len() {
        return Err("Incomplete Eve conversion expectation.".into());
    }
    let mut converted = values.into_iter();
    let mut result = Vec::new();
    for (name, content, transform) in files {
        let content = if transform {
            converted
                .next()
                .ok_or("Missing converted document.")?
                .into_bytes()
        } else {
            content
        };
        result.extend_from_slice(&(name.len() as u64).to_le_bytes());
        result.extend(name);
        result.extend_from_slice(&(content.len() as u64).to_le_bytes());
        result.extend(content);
    }
    Ok(result)
}
pub(super) fn content_matches(engine: &Engine, record: &Skill, source: &[u8]) -> bool {
    if record.agents.iter().any(|id| id == "eve") {
        signature(engine, source).is_ok_and(|expected| {
            tree_signature(Path::new(&record.path)).as_ref() == Some(&expected)
        })
    } else {
        tree_signature(Path::new(&record.path)).as_deref() == Some(source)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::tests::{addition, engine};
    fn fixture() -> (TemporaryDirectory, Engine, Target, PathBuf) {
        let f = TemporaryDirectory::new().unwrap();
        let home = f.0.join("home");
        let project = f.0.join("project");
        let source = f.0.join("source");
        fs::create_dir_all(home.join(".codex")).unwrap();
        fs::create_dir_all(project.join("agent/subagents/alpha")).unwrap();
        fs::create_dir_all(project.join("agent/subagents/beta")).unwrap();
        fs::create_dir_all(source.join("nested")).unwrap();
        fs::write(
            project.join("package.json"),
            "{\"dependencies\":{\"eve\":\"1.0.0\"}}",
        )
        .unwrap();
        let raw="---\nname: fixture-skill\ndescription: Eve fixture\nlicense: MIT\nmetadata: {author: fixture, internal: false, count: 2}\n---\n# Version one\n";
        fs::write(source.join("SKILL.md"), raw).unwrap();
        fs::write(
            source.join("nested/skill.md"),
            raw.replace("name: fixture-skill", "name: nested-fixture"),
        )
        .unwrap();
        fs::write(source.join("binary.dat"), [0, 255, 2]).unwrap();
        let e = engine(&home);
        let t = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into_owned()),
        };
        (f, e, t, source)
    }
    #[test]
    fn real_eve_mixed_install_preserves_transformed_slots_when_upstream_refuses_removal() {
        let (_f, e, t, source) = fixture();
        let project = t.directory(&e.home).unwrap();
        let mut op = addition(&source, t.clone(), false);
        op.agents = vec!["eve".into(), "codex".into()];
        op.eve_subagents = vec!["root".into(), "alpha".into(), "beta".into()];
        let result = apply(&e, &op).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        assert_eq!(result.items[0].eve_paths.as_ref().unwrap().len(), 3);
        let inventory = result.inventory.unwrap();
        assert_eq!(
            inventory
                .skills
                .iter()
                .filter(|s| s.agents.contains(&"eve".into()))
                .count(),
            3
        );
        assert!(inventory.skills.iter().all(|s| s.issue.is_none()));
        let root = project.join("agent/skills/fixture-skill");
        let text = fs::read_to_string(root.join("SKILL.md")).unwrap();
        assert!(text.contains("name: fixture-skill"));
        assert!(text.contains("internal"));
        assert!(text.contains("count"));
        assert!(text.contains("fixture"));
        assert_eq!(fs::read(root.join("binary.dat")).unwrap(), [0, 255, 2]);
        assert_ne!(
            fs::read(root.join("SKILL.md")).unwrap(),
            fs::read(project.join(".agents/skills/fixture-skill/SKILL.md")).unwrap()
        );
        let nested = fs::read_to_string(root.join("nested/skill.md")).unwrap();
        assert!(nested.contains("name: nested-fixture"));
        assert!(nested.contains("metadata:"));
        fs::create_dir_all(project.join("agent/subagents/gamma/skills/fixture-skill")).unwrap();
        fs::write(
            project.join("agent/subagents/gamma/skills/fixture-skill/note.txt"),
            "manual residual",
        )
        .unwrap();
        let removal = Operation {
            action: "remove".into(),
            agents: vec!["eve".into()],
            eve_subagents: Vec::new(),
            ..op
        };
        let original_lock = fs::read(project.join("skills-lock.json")).unwrap();
        let error = removal_plan(&e, &removal, &inventory).err().unwrap();
        assert!(error.contains("cannot verify it as an unmodified installation"));
        assert!(apply(&e, &removal).is_err());
        assert_eq!(
            fs::read(project.join("skills-lock.json")).unwrap(),
            original_lock
        );
        assert_eq!(fs::read_to_string(root.join("SKILL.md")).unwrap(), text);
        assert!(project
            .join("agent/subagents/gamma/skills/fixture-skill/note.txt")
            .is_file());
        assert!(project
            .join(".agents/skills/fixture-skill/SKILL.md")
            .is_file());
        assert!(source.join("SKILL.md").is_file());
    }
    #[test]
    fn real_eve_project_git_check_update_replays_recorded_subagents_and_verifies_conversion() {
        let (_f, e, t, source) = fixture();
        let git = |args: &[&str]| {
            let out = run_process(e.command(Path::new("git"), &source).args(args)).unwrap();
            assert!(out.success, "{}", out.stderr);
        };
        git(&["init", "-q", "-b", "main"]);
        let commit = || {
            git(&["add", "."]);
            git(&[
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-qm",
                "fixture",
            ]);
        };
        commit();
        let url = reqwest::Url::from_file_path(&source).unwrap().to_string();
        let mut op = addition(&source, t.clone(), false);
        op.source = Some(url);
        op.agents = vec!["eve".into()];
        op.eve_subagents = vec!["root".into(), "alpha".into(), "beta".into()];
        let result = apply(&e, &op).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        assert!(result
            .inventory
            .unwrap()
            .skills
            .iter()
            .all(|s| s.updateable));
        let checked = check_updates(&e, &t).unwrap();
        assert_eq!(checked[0].status, "current", "{}", checked[0].message);
        fs::write(source.join("version.txt"), "two").unwrap();
        commit();
        assert_eq!(check_updates(&e, &t).unwrap()[0].status, "available");
        op.action = "update".into();
        op.agents.clear();
        op.eve_subagents.clear();
        let result = apply(&e, &op).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        assert!(result.items[0]
            .eve_paths
            .as_ref()
            .unwrap()
            .iter()
            .all(|p| p.content_matches));
        assert_eq!(check_updates(&e, &t).unwrap()[0].status, "current");
        let project = t.directory(&e.home).unwrap();
        for path in [
            "agent/skills/fixture-skill",
            "agent/subagents/alpha/skills/fixture-skill",
            "agent/subagents/beta/skills/fixture-skill",
        ] {
            assert_eq!(
                fs::read_to_string(project.join(path).join("version.txt")).unwrap(),
                "two"
            );
        }
    }
    #[test]
    fn real_eve_selected_copy_preserves_unselected_slot_and_rejects_invalid_targets() {
        let (_f, e, t, source) = fixture();
        let project = t.directory(&e.home).unwrap();
        let mut op = addition(&source, t.clone(), true);
        op.agents = vec!["eve".into()];
        op.eve_subagents = vec!["alpha".into()];
        let result = apply(&e, &op).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        let original =
            fs::read(project.join("agent/subagents/alpha/skills/fixture-skill/SKILL.md")).unwrap();
        op.eve_subagents = vec!["beta".into()];
        let result = apply(&e, &op).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        assert_eq!(
            fs::read(project.join("agent/subagents/alpha/skills/fixture-skill/SKILL.md")).unwrap(),
            original
        );
        let expected = project
            .join("agent")
            .join("subagents")
            .join("alpha")
            .join("skills")
            .join("fixture-skill");
        assert!(result
            .inventory
            .unwrap()
            .skills
            .iter()
            .any(|s| Path::new(&s.path) == expected));
        op.eve_subagents = vec!["missing".into()];
        assert!(apply(&e, &op).is_err());
        op.eve_subagents = vec!["../outside".into()];
        assert!(apply(&e, &op).is_err());
        op.eve_subagents = vec!["root".into()];
        op.target.scope = "global".into();
        op.target.project_path = None;
        assert!(apply(&e, &op).is_err());
        let preview = inspect(&e, source.to_str().unwrap()).unwrap();
        assert!(preview.skills[0].content.contains("name: fixture-skill"));
    }
    #[cfg(unix)]
    #[test]
    fn eve_linked_parents_and_partial_zero_exit_are_not_verified() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let (f, mut e, t, source) = fixture();
        let project = t.directory(&e.home).unwrap();
        let mut op = addition(&source, t.clone(), false);
        op.agents = vec!["eve".into()];
        op.eve_subagents = vec!["root".into(), "alpha".into()];
        symlink(&e.home, project.join("agent/skills")).unwrap();
        assert!(apply(&e, &op).is_err());
        fs::remove_file(project.join("agent/skills")).unwrap();
        let script = f.0.join("partial-node");
        let real = e.node.clone();
        fs::write(&script,format!("#!/usr/bin/python3\nimport sys,subprocess,shutil\nr=subprocess.run([{}]+sys.argv[1:])\nif len(sys.argv)>2 and sys.argv[2]=='add':\n shutil.rmtree({},ignore_errors=True)\n sys.exit(0)\nsys.exit(r.returncode)\n",serde_json::to_string(&real.to_string_lossy()).unwrap(),serde_json::to_string(&project.join("agent/subagents/alpha/skills/fixture-skill").to_string_lossy()).unwrap())).unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        e.node = script;
        let result = apply(&e, &op).unwrap();
        assert_ne!(result.items[0].status, "complete");
        let observed = result.items[0].eve_paths.as_ref().unwrap();
        assert!(observed.iter().any(|p| p.kind == "missing"));
        assert!(observed.iter().any(|p| p.content_matches));
        e.node = real.clone();
        op.eve_subagents = vec!["root".into()];
        assert_eq!(apply(&e, &op).unwrap().items[0].status, "complete");
        let root = project.join("agent/skills/fixture-skill");
        let outside = f.0.join("converted-copy");
        fs::rename(&root, &outside).unwrap();
        symlink(&outside, &root).unwrap();
        let noop = f.0.join("noop-node");
        fs::write(
            &noop,
            format!(
                "#!/bin/sh\nif [ \"$2\" = add ]; then exit 0; fi\nexec '{}' \"$@\"\n",
                real.to_string_lossy().replace('\'', "'\\''")
            ),
        )
        .unwrap();
        fs::set_permissions(&noop, fs::Permissions::from_mode(0o755)).unwrap();
        e.node = noop;
        let result = apply(&e, &op).unwrap();
        assert_ne!(result.items[0].status, "complete");
        assert_eq!(result.items[0].eve_paths.as_ref().unwrap()[0].kind, "link");
    }
}

// Materialize the existing pinned formatter's framed result only inside the prepared copy.
pub(super) fn write_signature(root: &Path, mut bytes: &[u8]) -> Result<(), String> {
    fn take<'a>(bytes: &mut &'a [u8]) -> Result<&'a [u8], String> {
        let prefix: [u8; 8] = bytes
            .get(..8)
            .ok_or("Invalid Eve tree.")?
            .try_into()
            .map_err(|_| "Invalid Eve tree.")?;
        let len = usize::try_from(u64::from_le_bytes(prefix)).map_err(|_| "Invalid Eve tree.")?;
        let value = bytes.get(8..8 + len).ok_or("Invalid Eve tree.")?;
        *bytes = &bytes[8 + len..];
        Ok(value)
    }
    while !bytes.is_empty() {
        let name = std::str::from_utf8(take(&mut bytes)?).map_err(|e| e.to_string())?;
        if !Path::new(name)
            .components()
            .all(|c| matches!(c, std::path::Component::Normal(_)))
        {
            return Err("Invalid Eve file path.".into());
        }
        let content = take(&mut bytes)?;
        let path = root.join(name);
        if !fs::symlink_metadata(&path).is_ok_and(|m| m.is_file() && !m.is_symlink()) {
            return Err("Eve prepared file changed.".into());
        }
        fs::write(path, content).map_err(|e| e.to_string())?;
    }
    Ok(())
}
