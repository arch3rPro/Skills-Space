//! Explicit local Pi removal extension. Never removes shared/CLI/package resources.
use super::*;
use sha2::{Digest, Sha256};
use std::io::Read;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Plan {
    target: Target,
    file: String,
    path: String,
    name: String,
    revision: String,
    dependencies: Vec<pi::Dependency>,
}

pub(super) fn tree_revision(root: &Path) -> Result<String, String> {
    fn visit(
        path: &Path,
        root: &Path,
        hash: &mut Sha256,
        count: &mut usize,
        bytes: &mut u64,
    ) -> Result<(), String> {
        *count += 1;
        if *count > 5000
            || path
                .components()
                .count()
                .saturating_sub(root.components().count())
                > 32
        {
            return Err("Pi removal exceeds review limits.".into());
        }
        let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
        if meta.is_symlink() {
            return Err("Pi removal refuses shared or linked files.".into());
        }
        hash.update(
            path.strip_prefix(root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .as_bytes(),
        );
        hash.update([0]);
        if meta.is_dir() {
            hash.update(b"directory\0");
            let mut entries = fs::read_dir(path)
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            entries.sort_by_key(|entry| entry.file_name());
            for entry in entries {
                if [".git", ".pi", ".agents"]
                    .iter()
                    .any(|name| entry.file_name() == *name)
                {
                    return Err("Pi removal refuses a project or configuration folder.".into());
                }
                if entry.file_name() == "SKILL.md" && path != root {
                    return Err("Pi removal refuses a folder containing other skills.".into());
                }
                visit(&entry.path(), root, hash, count, bytes)?;
            }
        } else if meta.is_file() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                if meta.nlink() != 1 {
                    return Err("Pi removal refuses shared or linked files.".into());
                }
            }
            *bytes += meta.len();
            if *bytes > 16 * 1024 * 1024 {
                return Err("Pi removal exceeds review limits.".into());
            }
            hash.update(b"file\0");
            hash.update(meta.len().to_le_bytes());
            let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
            let mut buffer = [0u8; 8192];
            let mut read = 0;
            loop {
                let size = file.read(&mut buffer).map_err(|e| e.to_string())?;
                if size == 0 {
                    break;
                }
                read += size as u64;
                if read > meta.len() {
                    return Err("Pi removal content changed. Review again.".into());
                }
                hash.update(&buffer[..size]);
            }
            if read != meta.len() {
                return Err("Pi removal content changed. Review again.".into());
            }
        } else {
            return Err("Pi removal refuses unsupported files.".into());
        }
        Ok(())
    }
    let mut hash = Sha256::new();
    visit(root, root, &mut hash, &mut 0, &mut 0)?;
    Ok(format!("{:x}", hash.finalize()))
}

fn plan(engine: &Engine, target: Target, file: String) -> Result<Plan, String> {
    let snapshot = pi::inspect(engine, &target)?;
    let skill = snapshot
        .skills
        .iter()
        .find(|skill| skill.file == file)
        .ok_or("Pi removal target is no longer available.")?;
    if !skill.can_trash || skill.package_index.is_some() || skill.cli_addressable {
        return Err("Pi removal only supports independent local skills.".into());
    }
    let root = PathBuf::from(&skill.path);
    if fs::symlink_metadata(&root)
        .map_err(|e| e.to_string())?
        .is_symlink()
        || fs::canonicalize(&root).map_err(|e| e.to_string())? != root
    {
        return Err("Pi removal refuses shared or linked files.".into());
    }
    let inventory = engine.inventory(&target)?;
    if inventory.skills.iter().any(|item| {
        fs::canonicalize(&item.path).ok().as_ref() == Some(&root)
            && (item.shared || item.cli_managed || item.agents.iter().any(|id| id != "pi"))
    }) {
        return Err("Pi removal only supports independent local skills.".into());
    }
    Ok(Plan {
        target,
        file,
        path: skill.path.clone(),
        name: skill.name.clone(),
        revision: tree_revision(&root)?,
        dependencies: snapshot.dependencies,
    })
}

fn apply_with(
    engine: &Engine,
    reviewed: Plan,
    move_to_trash: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    let current = plan(engine, reviewed.target.clone(), reviewed.file.clone())?;
    if current != reviewed {
        return Err("Pi removal content changed. Review again.".into());
    }
    // Same process lock as every other mutation; revalidate immediately before the OS move.
    if tree_revision(Path::new(&reviewed.path))? != reviewed.revision {
        return Err("Pi removal content changed. Review again.".into());
    }
    move_to_trash(Path::new(&reviewed.path))?;
    if fs::symlink_metadata(&reviewed.path).is_ok() {
        return Err("Pi removal could not verify the move to Trash.".into());
    }
    Ok(())
}

pub(super) fn system_trash(path: &Path) -> Result<(), String> {
    let context = trash::TrashContext::new();
    #[cfg(target_os = "macos")]
    let context = {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        let mut context = context;
        context.set_delete_method(DeleteMethod::NsFileManager);
        context
    };
    context
        .delete(path)
        .map_err(|error| format!("Cannot move Pi skill to Trash: {error}"))
}

#[tauri::command]
pub async fn upstream_pi_removal_plan(
    app: AppHandle,
    target: Target,
    file: String,
) -> Result<Plan, String> {
    tauri::async_runtime::spawn_blocking(move || plan(&Engine::from_app(&app)?, target, file))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_pi_trash(app: AppHandle, reviewed: Plan) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        let engine = Engine::from_app(&app)?;
        apply_with(&engine, reviewed, system_trash)?;
        skill_sync::detach_removed_sources(&engine)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::tests::{engine, global};
    fn skill(path: &Path, name: &str) -> PathBuf {
        fs::create_dir_all(path).unwrap();
        let file = path.join("SKILL.md");
        fs::write(
            &file,
            format!("---\nname: {name}\ndescription: Fixture\n---\nBody"),
        )
        .unwrap();
        fs::canonicalize(file).unwrap()
    }
    #[test]
    fn private_skill_moves_only_reviewed_directory_and_preserves_settings_and_siblings() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let e = engine(&home);
        let file = skill(&home.join(".pi/agent/skills/alpha"), "alpha");
        let sibling = skill(&home.join(".pi/agent/skills/beta"), "beta");
        let config = home.join(".pi/agent/settings.json");
        fs::write(&config, "{\"skills\":[],\"future\":true}").unwrap();
        fs::write(
            file.parent().unwrap().join("script.sh"),
            "unchanged support file",
        )
        .unwrap();
        let original = fs::read(&config).unwrap();
        let reviewed = plan(&e, global(), file.to_string_lossy().into_owned()).unwrap();
        let trash = root.0.join("fixture-trash");
        apply_with(&e, reviewed, |path| {
            fs::rename(path, &trash).map_err(|e| e.to_string())
        })
        .unwrap();
        assert!(!file.exists());
        assert!(trash.join("SKILL.md").is_file());
        assert_eq!(
            fs::read_to_string(trash.join("script.sh")).unwrap(),
            "unchanged support file"
        );
        assert!(sibling.exists());
        assert_eq!(fs::read(config).unwrap(), original);
    }
    #[test]
    fn content_or_configuration_changes_refuse_move_and_trash_failure_keeps_content() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let e = engine(&home);
        let file = skill(&home.join(".pi/agent/skills/alpha"), "alpha");
        let reviewed = plan(&e, global(), file.to_string_lossy().into_owned()).unwrap();
        fs::write(file.parent().unwrap().join("new.txt"), "new").unwrap();
        assert!(apply_with(&e, reviewed, |_| panic!("must not move")).is_err());
        let reviewed = plan(&e, global(), file.to_string_lossy().into_owned()).unwrap();
        fs::write(home.join(".pi/agent/settings.json"), "{\"skills\":[]}").unwrap();
        assert!(apply_with(&e, reviewed, |_| panic!("must not move")).is_err());
        let reviewed = plan(&e, global(), file.to_string_lossy().into_owned()).unwrap();
        assert_eq!(
            apply_with(&e, reviewed, |_| Err("Trash unavailable".into())).unwrap_err(),
            "Trash unavailable"
        );
        assert!(file.exists());
    }
    #[test]
    fn shared_link_package_and_unsafe_root_are_not_removal_candidates() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let e = engine(&home);
        let shared = skill(&home.join(".agents/skills/shared"), "shared");
        let pkg = home.join(".pi/agent/pkg");
        let packaged = skill(&pkg.join("skills/packaged"), "packaged");
        fs::write(
            pkg.join("package.json"),
            "{\"pi\":{\"skills\":[\"skills\"]}}",
        )
        .unwrap();
        fs::write(
            home.join(".pi/agent/settings.json"),
            "{\"packages\":[\"./pkg\"]}",
        )
        .unwrap();
        for file in [&shared, &packaged] {
            assert!(plan(&e, global(), file.to_string_lossy().into_owned()).is_err());
            assert!(file.exists());
        }
        #[cfg(unix)]
        {
            let own = home.join(".pi/agent/skills");
            fs::create_dir_all(&own).unwrap();
            std::os::unix::fs::symlink(shared.parent().unwrap(), own.join("alias")).unwrap();
            assert!(plan(&e, global(), shared.to_string_lossy().into_owned()).is_err());
        }
        let file = skill(&home.join(".pi/agent/skills"), "root-skill");
        assert!(plan(&e, global(), file.to_string_lossy().into_owned()).is_err());
    }
    #[test]
    fn nested_links_and_hardlinks_are_rejected_without_following_them() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let e = engine(&home);
        let file = skill(&home.join(".pi/agent/skills/alpha"), "alpha");
        let outside = root.0.join("outside.txt");
        fs::write(&outside, "outside").unwrap();
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&outside, file.parent().unwrap().join("link")).unwrap();
            assert!(plan(&e, global(), file.to_string_lossy().into_owned()).is_err());
            fs::remove_file(file.parent().unwrap().join("link")).unwrap();
            fs::hard_link(&outside, file.parent().unwrap().join("hardlink")).unwrap();
            assert!(plan(&e, global(), file.to_string_lossy().into_owned()).is_err());
        }
        assert_eq!(fs::read_to_string(outside).unwrap(), "outside");
    }
    #[test]
    fn configured_extra_file_and_project_skill_are_scoped() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        fs::create_dir_all(&home).unwrap();
        let e = engine(&home);
        let project = root.0.join("project");
        fs::create_dir_all(project.join(".git")).unwrap();
        fs::create_dir_all(home.join(".pi/agent")).unwrap();
        fs::write(
            home.join(".pi/agent/trust.json"),
            serde_json::to_vec(&serde_json::json!({fs::canonicalize(&project).unwrap().to_string_lossy().to_string():true}))
                .unwrap(),
        )
        .unwrap();
        let file = skill(&project.join(".pi/skills/alpha"), "alpha");
        let local = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into_owned()),
        };
        assert!(plan(&e, global(), file.to_string_lossy().into_owned()).is_err());
        plan(&e, local, file.to_string_lossy().into_owned()).unwrap();
        let extra = root.0.join("extra.md");
        fs::write(&extra, "---\nname: extra\ndescription: Fixture\n---\nBody").unwrap();
        fs::create_dir_all(home.join(".pi/agent")).unwrap();
        fs::write(
            home.join(".pi/agent/settings.json"),
            serde_json::to_vec(&serde_json::json!({"skills":[extra]})).unwrap(),
        )
        .unwrap();
        assert_eq!(
            plan(
                &e,
                global(),
                fs::canonicalize(&extra)
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            )
            .unwrap()
            .path,
            fs::canonicalize(&extra).unwrap().to_string_lossy()
        );
    }
}
