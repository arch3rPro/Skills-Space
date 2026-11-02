//! Updates use the installed original Pi package manager, with whole-package preflight.
use super::*;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackageRequest {
    target: Target,
    file: String,
    revision: String,
    dependencies: Vec<Dependency>,
    action: String,
    expected: Option<serde_json::Value>,
}
#[derive(Serialize)]
pub struct PackageIssue {
    kind: &'static str,
    subject: String,
    message: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageResult {
    pub updated: bool,
    pub issues: Vec<PackageIssue>,
    pub affected: serde_json::Value,
    pub snapshot: Snapshot,
    pub error: Option<String>,
}
fn driver(
    engine: &Engine,
    snapshot: &Snapshot,
    source: &str,
    action: &str,
    expected: Option<&serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let cwd = if snapshot.target.scope == "project" {
        snapshot.target.directory(&engine.home)?
    } else {
        PathBuf::from(&snapshot.agent_directory)
    };
    let mut command = engine.command(&engine.node, &cwd);
    command
        .arg(engine.resources.join("pi-package-driver.mjs"))
        .arg(action)
        .arg(&snapshot.agent_directory)
        .arg(cwd)
        .arg(source);
    if let Some(value) = expected {
        command.arg(serde_json::to_string(value).map_err(|e| e.to_string())?);
    }
    let output = run_process_with_timeout(&mut command, Duration::from_secs(180))?;
    if !output.success {
        return Err(output.stderr);
    }
    serde_json::from_str(output.stdout.lines().last().unwrap_or(""))
        .map_err(|_| "Pi package response could not be verified. Refresh actual state.".into())
}
fn remember_installations(
    snapshot: &Snapshot,
    checked: &serde_json::Value,
    update: &serde_json::Value,
) -> Result<(), String> {
    let Some(installations) = update["installations"].as_object() else {
        return Err("Missing installation result.".into());
    };
    if installations.is_empty() {
        return Ok(());
    }
    let path = Path::new(&snapshot.agent_directory).join("skills-space-invocation.json");
    native::plain(&path)?;
    let _guard = SettingsLock::acquire(&path)?;
    let mut state: serde_json::Value = if path.exists() {
        if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 16 * 1024 * 1024 {
            return Err("Invocation recovery journal exceeds its size limit.".into());
        }
        serde_json::from_slice(&fs::read(&path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?
    } else {
        serde_json::json!({"version":1,"records":{}})
    };
    if state["version"] != 1 || !state["records"].is_object() {
        return Err("Invalid invocation recovery journal.".into());
    }
    if state.get("installations").is_none() {
        state["installations"] = serde_json::json!({});
    }
    for (root, baseline) in installations {
        if !checked.as_array().is_some_and(|items| {
            items.iter().any(|item| {
                item["npmManifestRoot"].as_str() == Some(root.as_str())
                    || item["root"].as_str() == Some(root.as_str())
            })
        }) {
            return Err("Installation baseline escaped the reviewed update scope.".into());
        }
        state["installations"][root] = baseline.clone();
    }
    if serde_json::to_vec(&state).map_err(|e| e.to_string())?.len() > 16 * 1024 * 1024 {
        return Err("Invocation recovery journal exceeds its size limit.".into());
    }
    write_settings(&path, &state)
}
fn run(engine: &Engine, request: PackageRequest) -> Result<PackageResult, String> {
    let snapshot = inspect(engine, &request.target)?;
    if snapshot.dependencies != request.dependencies {
        return Err("Pi settings changed. Check the package again.".into());
    }
    let skill = snapshot
        .skills
        .iter()
        .find(|s| {
            s.file == request.file
                && !s.managed
                && s.in_scope
                && (request.action == "update" || s.document_revision == request.revision)
        })
        .ok_or("Package skill changed or belongs to another scope.")?;
    let source = skill
        .package_source
        .clone()
        .ok_or("This skill is not owned by a Pi package.")?;
    run_checked(engine, request, snapshot, source)
}
pub(super) fn from_source(
    engine: &Engine,
    target: &Target,
    source: &str,
    action: &str,
    expected: Option<serde_json::Value>,
) -> Result<PackageResult, String> {
    let snapshot = inspect(engine, target)?;
    let request = PackageRequest {
        target: target.clone(),
        file: String::new(),
        revision: String::new(),
        dependencies: snapshot.dependencies.clone(),
        action: action.into(),
        expected,
    };
    run_checked(engine, request, snapshot, source.into())
}
fn run_checked(
    engine: &Engine,
    request: PackageRequest,
    snapshot: Snapshot,
    source: String,
) -> Result<PackageResult, String> {
    let checked = driver(engine, &snapshot, &source, "check", None)?;
    let affected = checked["affected"].clone();
    if request.action == "check" {
        let issues = remember_installations(&snapshot, &affected, &checked)
            .err()
            .map(|message| PackageIssue {
                kind: "record",
                subject: source.clone(),
                message: format!("Invocation record persistence failed: {message}"),
            })
            .into_iter()
            .collect();
        return Ok(PackageResult {
            updated: false,
            issues,
            affected,
            snapshot: inspect(engine, &request.target)?,
            error: None,
        });
    }
    let signature = |value: &serde_json::Value| {
        value.as_array().map(|items| {
            items
                .iter()
                .map(|item| {
                    serde_json::json!({
                        "scope": item["scope"], "source": item["source"], "root": item["root"],
                        "installed": item["installed"], "latest": item["latest"]
                    })
                })
                .collect::<Vec<_>>()
        })
    };
    if request.action != "update"
        || request.expected.as_ref().and_then(signature) != signature(&affected)
    {
        return Err("Package update review expired. Check the actual package again.".into());
    }
    if affected
        .as_array()
        .is_none_or(|items| items.is_empty() || items.iter().any(|v| v["updateable"] != true))
    {
        return Err("Package version is pinned or unavailable.".into());
    }
    // The original Pi manager owns package filesystem writes; invocation-file
    // destination restrictions do not apply to its installation paths.
    let update = match driver(engine, &snapshot, &source, "update", Some(&affected)) {
        Ok(value) => value,
        Err(error) => {
            return Ok(PackageResult {
                updated: false,
                issues: vec![],
                affected,
                snapshot: inspect(engine, &request.target)?,
                error: Some(error),
            })
        }
    };
    let record_error = remember_installations(&snapshot, &affected, &update).err();
    let roots: Vec<_> = affected
        .as_array()
        .ok_or("Invalid affected package list.")?
        .iter()
        .filter_map(|item| item["root"].as_str())
        .map(|root| dunce::canonicalize(root).unwrap_or_else(|_| PathBuf::from(root)))
        .collect();
    let issues = |value: &Snapshot| {
        let relevant = |source: &serde_json::Value| {
            source["root"]
                .as_str()
                .is_some_and(|root| roots.iter().any(|known| known == Path::new(root)))
        };
        let mut names: Vec<String> = value
            .skills
            .iter()
            .filter(|item| {
                item.lifecycle
                    .as_ref()
                    .is_some_and(|v| relevant(&v["source"]) && v["recovery"] != "consistent")
            })
            .map(|item| item.name.clone())
            .collect();
        names.extend(
            value
                .recovery_issues
                .iter()
                .filter(|v| relevant(&v["source"]))
                .filter_map(|v| v["name"].as_str().map(str::to_owned)),
        );
        names
    };
    let mut failed = Vec::new();
    let mut global_error = None;
    if request.target.scope == "project" {
        match native::reconcile(
            engine,
            &Target {
                host: "local".into(),
                scope: "global".into(),
                project_path: None,
            },
        ) {
            Ok(value) => failed.extend(issues(&value)),
            Err(error) => global_error = Some(error),
        }
    }
    let recovery = native::reconcile(engine, &request.target);
    let (actual, recovery_failure) = match recovery {
        Ok(actual) => (actual, None),
        Err(error) => (inspect(engine, &request.target)?, Some(error)),
    };
    failed.extend(issues(&actual));
    failed.sort();
    failed.dedup();
    let mut issues = Vec::new();
    for (kind, message) in [
        ("record", record_error),
        ("invocation", global_error),
        ("invocation", recovery_failure),
    ] {
        if let Some(message) = message {
            issues.push(PackageIssue {
                kind,
                subject: source.clone(),
                message: if kind == "record" {
                    format!("Invocation record persistence failed: {message}")
                } else {
                    message
                },
            });
        }
    }
    if !failed.is_empty() {
        issues.push(PackageIssue {
            kind: "invocation",
            subject: failed.join(", "),
            message: "Invocation recovery requires an explicit invocation choice.".into(),
        });
    }
    match skill_sync::propagate_roots(engine, &roots) {
        Ok(items) => {
            for item in items.into_iter().filter(|item| item.status != "complete") {
                let subject = match item.destination {
                    Some(path) => format!("{} · {} · {path}", item.skill, item.agents.join(", ")),
                    None => item.skill,
                };
                issues.push(PackageIssue {
                    kind: "association",
                    subject,
                    message: item.message,
                });
            }
        }
        Err(message) => issues.push(PackageIssue {
            kind: "association",
            subject: source,
            message,
        }),
    }
    let error = (!issues.is_empty()).then(|| {
        issues
            .iter()
            .map(|item| format!("{}: {}", item.subject, item.message))
            .collect::<Vec<_>>()
            .join("\n")
    });
    Ok(PackageResult {
        updated: true,
        issues,
        affected: update["affected"].clone(),
        snapshot: actual,
        error,
    })
}
#[tauri::command]
pub async fn upstream_pi_package(
    app: AppHandle,
    request: PackageRequest,
) -> Result<PackageResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        run(&Engine::from_app(&app)?, request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::upstream::tests::engine;
    fn git(e: &Engine, cwd: &Path, args: &[&str]) {
        let output = run_process(e.command(Path::new("git"), cwd).args(args)).unwrap();
        assert!(output.success, "{}", output.stderr);
    }
    fn request(
        e: &Engine,
        target: &Target,
        action: &str,
        expected: Option<serde_json::Value>,
    ) -> PackageRequest {
        let snapshot = inspect(e, target).unwrap();
        let item = snapshot
            .skills
            .iter()
            .find(|s| s.name == "demo" && s.in_scope)
            .unwrap();
        PackageRequest {
            target: target.clone(),
            file: item.file.clone(),
            revision: item.document_revision.clone(),
            dependencies: snapshot.dependencies.clone(),
            action: action.into(),
            expected,
        }
    }
    #[test]
    fn installation_record_save_retries_without_replacing_linked_history() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        fs::create_dir_all(home.join(".pi/agent")).unwrap();
        let e = engine(&home);
        let target = Target {
            host: "local".into(),
            scope: "global".into(),
            project_path: None,
        };
        let snapshot = inspect(&e, &target).unwrap();
        let path = Path::new(&snapshot.agent_directory).join("skills-space-invocation.json");
        let original = root.0.join("original.json");
        let original_bytes = br#"{"version":1,"records":{},"other":"keep"}"#;
        fs::write(&original, original_bytes).unwrap();
        std::os::unix::fs::symlink(&original, &path).unwrap();
        let package = home
            .join(".pi/agent/npm/node_modules/fixture")
            .to_string_lossy()
            .to_string();
        let checked = serde_json::json!([{"root":package}]);
        let update = serde_json::json!({"installations":{package.clone():{"kind":"npm-reference","version":"2.0.0"}}});
        assert!(remember_installations(&snapshot, &checked, &update).is_err());
        assert_eq!(fs::read(&original).unwrap(), original_bytes);
        fs::remove_file(&path).unwrap();
        fs::write(&path, original_bytes).unwrap();
        remember_installations(&snapshot, &checked, &update).unwrap();
        let actual: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(actual["other"], "keep");
        assert_eq!(actual["installations"][&package]["version"], "2.0.0");
    }
    #[test]
    #[ignore = "requires explicitly selected original Pi 1.3.0/1.4.0 installation; all mutations use an isolated HOME"]
    fn original_pi_package_update_allows_confirmed_edits_and_restores_policy_in_both_scopes() {
        let install = PathBuf::from(
            std::env::var("SKILLS_SPACE_PI_TEST_INSTALL")
                .expect("Set SKILLS_SPACE_PI_TEST_INSTALL to original Pi package root"),
        );
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        fs::create_dir_all(&home).unwrap();
        let e = engine(&home);
        let agent = home.join(".pi/agent");
        let metadata: serde_json::Value =
            serde_json::from_slice(&fs::read(install.join("package.json")).unwrap()).unwrap();
        let version = metadata["version"].as_str().unwrap();
        let release = agent.join(format!(
            "install/releases/{version}/node_modules/@earendil-works"
        ));
        fs::create_dir_all(&release).unwrap();
        std::os::unix::fs::symlink(install, release.join("pi-coding-agent")).unwrap();
        fs::write(agent.join("install/current-version"), version).unwrap();
        let upstream = root.0.join("source");
        fs::create_dir_all(upstream.join("skills/demo")).unwrap();
        let document = "---\nname: demo\ndescription: Git package fixture\n---\nVersion 1\n";
        fs::write(upstream.join("skills/demo/SKILL.md"), document).unwrap();
        fs::write(upstream.join("support.txt"), "v1").unwrap();
        git(&e, &upstream, &["init", "-b", "main"]);
        git(
            &e,
            &upstream,
            &["config", "user.email", "fixture@example.invalid"],
        );
        git(&e, &upstream, &["config", "user.name", "Fixture"]);
        git(&e, &upstream, &["add", "."]);
        git(&e, &upstream, &["commit", "-m", "v1"]);
        let source = "git:https://fixture.invalid/owner/package";
        fs::write(
            home.join(".gitconfig"),
            format!(
                "[url \"{}\"]\n\tinsteadOf = https://fixture.invalid/owner/package\n",
                crate::upstream::tests::file_url(&upstream)
            ),
        )
        .unwrap();
        let project = home.join("project");
        fs::create_dir_all(project.join(".git")).unwrap();
        write_settings(&agent.join("trust.json"), &serde_json::json!({dunce::canonicalize(&project).unwrap().to_string_lossy().to_string():true})).unwrap();
        let global_root = agent.join("git/fixture.invalid/owner/package");
        let local_root = project.join(".pi/git/fixture.invalid/owner/package");
        for path in [&global_root, &local_root] {
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            git(
                &e,
                &home,
                &["clone", upstream.to_str().unwrap(), path.to_str().unwrap()],
            );
            git(
                &e,
                path,
                &[
                    "remote",
                    "set-url",
                    "origin",
                    "https://fixture.invalid/owner/package",
                ],
            );
        }
        for config in [
            agent.join("settings.json"),
            project.join(".pi/settings.json"),
        ] {
            write_settings(&config, &serde_json::json!({"packages":[source]})).unwrap();
        }
        let global = Target {
            host: "local".into(),
            scope: "global".into(),
            project_path: None,
        };
        let local = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into()),
        };
        for (target, mode) in [(&global, "manual"), (&local, "auto")] {
            let state = inspect(&e, target).unwrap();
            let item = state
                .skills
                .iter()
                .find(|s| s.name == "demo" && s.in_scope)
                .unwrap();
            native::change(
                &e,
                native::NativeChange {
                    target: target.clone(),
                    file: item.file.clone(),
                    revision: item.document_revision.clone(),
                    dependencies: state.dependencies,
                    mode: mode.into(),
                },
            )
            .unwrap();
        }
        let origin = dunce::canonicalize(global_root.join("skills/demo")).unwrap();
        let mut distribution = crate::upstream::tests::addition(&origin, global.clone(), true);
        distribution.skills = vec!["demo".into()];
        distribution.agents = vec!["claude-code".into()];
        distribution.sync_origin = Some(
            serde_json::from_value(
                serde_json::json!({"target":global,"path":origin,"name":"demo"}),
            )
            .unwrap(),
        );
        distribution.source_hashes = Some(BTreeMap::from([(
            "demo".into(),
            Some(document_diff::revision(&tree_signature(&origin).unwrap())),
        )]));
        assert!(skill_sync::sync(&e, &distribution)
            .unwrap()
            .items
            .iter()
            .all(|i| i.status == "complete"));
        fs::write(
            upstream.join("skills/demo/SKILL.md"),
            document.replace("Version 1", "Version 2").replace(
                "description: Git package fixture",
                "description: Git package fixture\ndisable-model-invocation: true",
            ),
        )
        .unwrap();
        fs::write(upstream.join("support.txt"), "v2").unwrap();
        git(&e, &upstream, &["add", "."]);
        git(&e, &upstream, &["commit", "-m", "v2"]);
        let checked = run(&e, request(&e, &local, "check", None)).unwrap();
        assert_eq!(checked.affected.as_array().unwrap().len(), 2);
        assert!(
            checked
                .affected
                .as_array()
                .unwrap()
                .iter()
                .all(|v| v["status"] == "available" && v["updateable"] == true),
            "{}",
            checked.affected
        );
        fs::write(global_root.join("support.txt"), "user local edit").unwrap();
        let local_edits = run(&e, request(&e, &local, "check", None)).unwrap();
        assert!(local_edits
            .affected
            .as_array()
            .unwrap()
            .iter()
            .all(|item| item["updateable"] == true));
        let updated = run(&e, request(&e, &local, "update", Some(checked.affected))).unwrap();
        assert!(updated.updated);
        assert!(updated.error.is_none(), "{:?}", updated.error);
        let global_bytes = fs::read_to_string(global_root.join("skills/demo/SKILL.md")).unwrap();
        let local_bytes = fs::read_to_string(local_root.join("skills/demo/SKILL.md")).unwrap();
        assert!(
            global_bytes.contains("Version 2")
                && global_bytes.contains("disable-model-invocation: true")
        );
        assert!(
            local_bytes.contains("Version 2")
                && local_bytes.contains("disable-model-invocation: false")
        );
        assert_eq!(
            fs::read_to_string(global_root.join("support.txt")).unwrap(),
            "v2"
        );
        // Original Pi resumes a dependency-install marker even when HEAD is already current.
        let marker = global_root
            .parent()
            .unwrap()
            .join(".package.pi-update-incomplete");
        fs::write(&marker, "interrupted fixture").unwrap();
        let interrupted = run(&e, request(&e, &local, "check", None)).unwrap();
        assert!(interrupted
            .affected
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["reason"] == "incompleteUpdate"
                && item["status"] == "available"
                && item["updateable"] == true));
        let resumed = run(
            &e,
            request(&e, &local, "update", Some(interrupted.affected)),
        )
        .unwrap();
        assert!(resumed.updated);
        assert!(resumed.error.is_none(), "{:?}", resumed.error);
        assert!(!marker.exists());
        let distributed = fs::read_to_string(home.join(".claude/skills/demo/SKILL.md")).unwrap();
        assert_eq!(
            distributed, global_bytes,
            "associated copy follows updated content after invocation recovery"
        );
        assert!(!agent.join("skills-space-update-backups").exists());
        let copy = home.join(".claude/skills/demo/SKILL.md");
        fs::write(
            &copy,
            distributed.replace("Version 2", "Independent copy edit"),
        )
        .unwrap();
        let next = fs::read_to_string(upstream.join("skills/demo/SKILL.md"))
            .unwrap()
            .replace("Version 2", "Version 3");
        fs::write(upstream.join("skills/demo/SKILL.md"), next).unwrap();
        git(&e, &upstream, &["add", "."]);
        git(&e, &upstream, &["commit", "-m", "v3"]);
        let checked = run(&e, request(&e, &local, "check", None)).unwrap();
        let partial = run(&e, request(&e, &local, "update", Some(checked.affected))).unwrap();
        assert!(partial.updated);
        assert!(partial.error.is_some());
        assert_eq!(partial.issues.len(), 1);
        assert_eq!(partial.issues[0].kind, "association");
        assert!(partial.issues[0].subject.contains("claude-code"));
        assert!(partial.issues[0]
            .subject
            .contains(copy.parent().unwrap().to_str().unwrap()));
        assert!(fs::read_to_string(copy)
            .unwrap()
            .contains("Independent copy edit"));
        assert!(fs::read_to_string(global_root.join("skills/demo/SKILL.md"))
            .unwrap()
            .contains("Version 3"));
    }
}
