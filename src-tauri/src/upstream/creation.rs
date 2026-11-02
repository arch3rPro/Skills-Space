//! Creation delegates all writes to upstream init; paths and outcomes are inspected here.
use super::{Engine, Target, MUTATION};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};
use tauri::AppHandle;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreationPlan {
    directory: String,
    name: Option<String>,
    skill_name: String,
    skill_directory: String,
    file: String,
}
impl CreationPlan {
    pub(super) fn skill_path(&self) -> &Path {
        Path::new(&self.skill_directory)
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreationResult {
    plan: CreationPlan,
    status: String,
    message: String,
    content: Option<String>,
    file_state: &'static str,
    logs: String,
}
fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name.starts_with(|c: char| c.is_ascii_lowercase() || c.is_ascii_digit())
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "-_".contains(c))
}
fn location(directory: &str, name: Option<&str>) -> Result<CreationPlan, String> {
    location_inner(directory, name, false)
}
fn location_inner(
    directory: &str,
    name: Option<&str>,
    allow_missing: bool,
) -> Result<CreationPlan, String> {
    let parent = Path::new(directory);
    if !parent.is_absolute() || !parent.is_dir() && !allow_missing {
        return Err("Choose an existing absolute directory.".into());
    }
    let mut ancestor = parent;
    let mut missing = Vec::new();
    while !ancestor.exists() {
        missing.push(
            ancestor
                .file_name()
                .ok_or("Invalid creation directory")?
                .to_os_string(),
        );
        ancestor = ancestor.parent().ok_or("Invalid creation directory")?;
    }
    let mut parent = dunce::canonicalize(ancestor).map_err(|e| e.to_string())?;
    for component in missing.into_iter().rev() {
        parent.push(component);
    }
    let skill_name = match name {
        Some(name) => name.to_owned(),
        None => parent
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("This directory has no usable skill name.")?
            .to_owned(),
    };
    // Upstream interpolates the name into YAML and a path without validation.
    // The GUI accepts a portable single-component name, never traversal or YAML syntax.
    if !valid_name(&skill_name) {
        return Err("Use 1–64 lowercase letters, digits, hyphens or underscores, starting with a letter or digit. For a differently named directory, choose a new subdirectory.".into());
    }
    let destination = if name.is_some() {
        parent.join(&skill_name)
    } else {
        parent.clone()
    };
    match fs::symlink_metadata(&destination) {
        Ok(metadata) if metadata.is_symlink() || !metadata.is_dir() => {
            return Err(
                "The destination must be a real directory, not a file or symbolic link.".into(),
            )
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    Ok(CreationPlan {
        directory: parent.to_string_lossy().into_owned(),
        name: name.map(str::to_owned),
        skill_name,
        file: destination.join("SKILL.md").to_string_lossy().into_owned(),
        skill_directory: destination.to_string_lossy().into_owned(),
    })
}
fn plan(directory: &str, name: Option<&str>) -> Result<CreationPlan, String> {
    let plan = location(directory, name)?;
    match fs::symlink_metadata(&plan.file) {
        Ok(_) => Err("SKILL.md already exists. It will not be overwritten. Choose another name or directory.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(plan),
        Err(error) => Err(error.to_string()),
    }
}
pub(super) fn native_plan(directory: &str, name: &str) -> Result<CreationPlan, String> {
    let plan = location_inner(directory, Some(name), true)?;
    if Path::new(&plan.file).symlink_metadata().is_ok() {
        return Err("SKILL.md already exists. It will not be overwritten.".into());
    }
    Ok(plan)
}
fn document(plan: &CreationPlan) -> Result<String, String> {
    if location(&plan.directory, plan.name.as_deref())? != *plan {
        return Err("Creation location changed. Review the actual directory.".into());
    }
    let metadata = fs::symlink_metadata(&plan.file).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > 256 * 1024 {
        return Err(
            "The created document is not a readable regular file within preview limits.".into(),
        );
    }
    fs::read_to_string(&plan.file).map_err(|e| e.to_string())
}
pub(super) fn create(engine: &Engine, confirmed: &CreationPlan) -> Result<CreationResult, String> {
    let _guard = MUTATION
        .lock()
        .map_err(|_| "Another skill operation is unavailable.")?;
    if plan(&confirmed.directory, confirmed.name.as_deref())? != *confirmed {
        return Err("Creation location changed. Review it again before creating.".into());
    }
    let target = Target {
        host: "local".into(),
        scope: "project".into(),
        project_path: Some(confirmed.directory.clone()),
    };
    let mut args = vec!["init".into()];
    if let Some(name) = &confirmed.name {
        args.push(name.clone());
    }
    let output = engine.cli(&args, &target);
    let content = document(confirmed);
    let readable = content.as_ref().ok().cloned();
    let metadata = engine.documents(std::slice::from_ref(&confirmed.skill_directory));
    let verified = metadata
        .as_ref()
        .ok()
        .and_then(|docs| docs.get(&confirmed.skill_directory))
        .is_some_and(|doc| {
            doc.name.as_deref() == Some(&confirmed.skill_name)
                && doc.description.as_ref().is_some_and(|s| !s.is_empty())
        });
    let (success, logs) = match output {
        Ok(output) => (
            output.success,
            format!("{}\n{}", output.stdout, output.stderr),
        ),
        Err(error) => (false, error),
    };
    let (status, message) = if success && readable.is_some() && verified {
        ("complete", "Created SKILL.md and verified its name and readable template. No installation was executed.")
    } else if fs::symlink_metadata(&confirmed.file)
        .is_err_and(|error| error.kind() == std::io::ErrorKind::NotFound)
    {
        (
            "failed",
            "SKILL.md was not found after execution. Review the log and directory before retrying.",
        )
    } else {
        ("uncertain", "A path exists, but execution or document validation could not be confirmed. Review actual content before another operation.")
    };
    Ok(CreationResult {
        plan: confirmed.clone(),
        status: status.into(),
        message: message.into(),
        file_state: if status == "failed" {
            "missing"
        } else if readable.is_none() {
            "unreadable"
        } else if metadata.is_err() {
            "unverified"
        } else if !verified {
            "invalid"
        } else {
            "valid"
        },
        content: readable,
        logs,
    })
}
#[tauri::command]
pub async fn upstream_creation_plan(
    directory: String,
    name: Option<String>,
) -> Result<CreationPlan, String> {
    tauri::async_runtime::spawn_blocking(move || plan(&directory, name.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_create(app: AppHandle, plan: CreationPlan) -> Result<CreationResult, String> {
    tauri::async_runtime::spawn_blocking(move || create(&Engine::from_app(&app)?, &plan))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn upstream_open_created(
    plan: CreationPlan,
    app: AppHandle,
    folder: bool,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if folder {
        if location(&plan.directory, plan.name.as_deref())? != plan
            || !Path::new(&plan.skill_directory).is_dir()
        {
            return Err(
                "Creation directory is no longer available. Review the actual path.".into(),
            );
        }
    } else {
        document(&plan)?;
    }
    app.opener()
        .open_path(
            if folder {
                plan.skill_directory
            } else {
                plan.file
            },
            None::<&str>,
        )
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::{
        apply,
        tests::{addition, engine, global},
        TemporaryDirectory,
    };
    #[test]
    fn real_init_creates_without_installing_then_previews_installs_and_removes() {
        for named in [false, true] {
            let fixture = TemporaryDirectory::new().unwrap();
            let home = fixture.0.join("home");
            fs::create_dir_all(home.join(".codex")).unwrap();
            let project = fixture.0.join("project");
            let parent = project.join("my-skill");
            fs::create_dir_all(&parent).unwrap();
            fs::write(parent.join("keep.txt"), "untouched").unwrap();
            let engine = engine(&home);
            let target = if named {
                global()
            } else {
                Target {
                    host: "local".into(),
                    scope: "project".into(),
                    project_path: Some(project.to_string_lossy().into_owned()),
                }
            };
            let p = plan(parent.to_str().unwrap(), named.then_some("my-skill")).unwrap();
            assert!(!Path::new(&p.file).exists());
            let result = create(&engine, &p).unwrap();
            assert_eq!(result.status, "complete");
            assert_eq!(result.file_state, "valid");
            assert!(result.content.unwrap().contains("## Instructions"));
            assert!(engine.inventory(&target).unwrap().skills.is_empty());
            assert!(!home.join(".agents/.skill-lock.json").exists());
            assert!(!project.join("skills-lock.json").exists());
            let bytes = fs::read(&p.file).unwrap();
            assert!(plan(&p.directory, p.name.as_deref()).is_err());
            assert!(create(&engine, &p).is_err());
            assert_eq!(fs::read(&p.file).unwrap(), bytes);
            let preview = crate::upstream::inspect(&engine, &p.skill_directory).unwrap();
            assert_eq!(preview.skills[0].name, "my-skill");
            let mut op = addition(Path::new(&p.skill_directory), target, named);
            op.skills = vec!["my-skill".into()];
            let installed = apply(&engine, &op).unwrap();
            assert!(
                installed.items.iter().all(|i| i.status == "complete"),
                "{}",
                installed.logs
            );
            op.action = "remove".into();
            op.source = None;
            let removed = apply(&engine, &op).unwrap();
            assert!(
                removed.items.iter().all(|i| i.status == "complete"),
                "{}",
                removed.logs
            );
            assert_eq!(fs::read(&p.file).unwrap(), bytes);
            assert_eq!(
                fs::read_to_string(parent.join("keep.txt")).unwrap(),
                "untouched"
            );
        }
    }
    #[test]
    fn invalid_paths_existing_files_and_changed_confirmation_do_not_write() {
        let fixture = TemporaryDirectory::new().unwrap();
        let dir = fixture.0.to_str().unwrap();
        for name in [
            "../escape",
            "/absolute",
            "bad\nname",
            "-option",
            "has space",
            ".",
            "",
            "name: value",
        ] {
            assert!(plan(dir, Some(name)).is_err());
        }
        assert!(plan("relative", Some("good")).is_err());
        let p = plan(dir, Some("good")).unwrap();
        fs::create_dir_all(&p.skill_directory).unwrap();
        fs::write(&p.file, "existing content").unwrap();
        assert!(create(&engine(&fixture.0), &p).is_err());
        assert_eq!(fs::read_to_string(&p.file).unwrap(), "existing content");
        #[cfg(unix)]
        {
            let other = fixture.0.join("other");
            fs::create_dir(&other).unwrap();
            std::os::unix::fs::symlink(&other, fixture.0.join("linked")).unwrap();
            assert!(plan(dir, Some("linked")).is_err());
            std::os::unix::fs::symlink(fixture.0.join("missing"), fixture.0.join("SKILL.md"))
                .unwrap();
            let current = fixture.0.join("current-skill");
            fs::create_dir(&current).unwrap();
            std::os::unix::fs::symlink(&other, current.join("SKILL.md")).unwrap();
            assert!(plan(current.to_str().unwrap(), None).is_err());
        }
        let mut changed = plan(dir, Some("tampered")).unwrap();
        changed.file = fixture.0.join("outside.md").to_string_lossy().into_owned();
        assert!(create(&engine(&fixture.0), &changed).is_err());
        assert!(!fixture.0.join("outside.md").exists());
    }
    #[cfg(unix)]
    #[test]
    fn zero_exit_without_template_is_not_success() {
        let fixture = TemporaryDirectory::new().unwrap();
        let mut engine = engine(&fixture.0);
        engine.node = std::path::PathBuf::from("/usr/bin/true");
        let p = plan(fixture.0.to_str().unwrap(), Some("no-template")).unwrap();
        let result = create(&engine, &p).unwrap();
        assert_eq!(result.status, "failed");
        assert_eq!(result.file_state, "missing");
        assert!(result.content.is_none());
    }
    #[cfg(unix)]
    #[test]
    fn created_files_with_read_or_format_failures_are_preserved_for_manual_repair() {
        use std::os::unix::fs::PermissionsExt;
        for fault in ["unreadable", "invalid", "unverified"] {
            let fixture = TemporaryDirectory::new().unwrap();
            let home = fixture.0.join("home");
            fs::create_dir_all(&home).unwrap();
            let mut e = engine(&home);
            let p = plan(home.to_str().unwrap(), Some("repair-me")).unwrap();
            let wrapper = fixture.0.join("fault-node");
            let script = format!("#!/usr/bin/python3\nimport os,sys,subprocess\nreal={}\nfault={}\nfile={}\nif fault=='unverified' and os.path.basename(sys.argv[1])=='inspect-skill-documents.mjs':\n sys.stderr.write('isolated metadata read failure')\n sys.exit(1)\nresult=subprocess.run([real]+sys.argv[1:])\nif len(sys.argv)>2 and sys.argv[2]=='init':\n if fault=='unreadable': os.chmod(file,0)\n if fault=='invalid': open(file,'w').write('---\\nname: [\\n---\\nOriginal retained body\\n')\nsys.exit(result.returncode)\n",serde_json::to_string(&e.node.to_string_lossy()).unwrap(),serde_json::to_string(fault).unwrap(),serde_json::to_string(&p.file).unwrap());
            fs::write(&wrapper, script).unwrap();
            fs::set_permissions(&wrapper, fs::Permissions::from_mode(0o755)).unwrap();
            e.node = wrapper;
            let result = create(&e, &p).unwrap();
            fs::set_permissions(&p.file, fs::Permissions::from_mode(0o600)).unwrap();
            assert_eq!(result.status, "uncertain", "{fault}");
            assert_eq!(result.file_state, fault, "{fault}: {}", result.logs);
            let retained = fs::read(&p.file).unwrap();
            assert!(!retained.is_empty());
            assert!(create(&e, &p).is_err());
            assert_eq!(fs::read(&p.file).unwrap(), retained);
            // Repair is external; the existing preview action then reads the corrected file.
            fs::write(
                &p.file,
                "---\nname: repair-me\ndescription: repaired fixture\n---\nRepaired body\n",
            )
            .unwrap();
            let actual = crate::upstream::inspect(&engine(&home), &p.skill_directory).unwrap();
            assert_eq!(actual.skills[0].name, "repair-me");
        }
    }
}
