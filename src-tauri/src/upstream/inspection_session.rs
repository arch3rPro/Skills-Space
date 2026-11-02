//! Ephemeral read-only source checkouts. Installation still receives the original source.
use super::*;
use std::sync::{LazyLock, Once};

const TTL: Duration = Duration::from_secs(30 * 60);
const PREFIX: &str = "skills-space-inspection-";
struct Session {
    home: PathBuf,
    source: String,
    checkout: TemporaryDirectory,
    touched: Instant,
}
static SESSIONS: LazyLock<Mutex<BTreeMap<String, Session>>> =
    LazyLock::new(|| Mutex::new(BTreeMap::new()));
static CLEANER: Once = Once::new();

fn start_cleanup() {
    CLEANER.call_once(|| {
        // Only our dedicated inspection directories, never general CLI/read/test temp trees.
        if let Ok(entries) = fs::read_dir(std::env::temp_dir()) {
            for entry in entries.flatten() {
                if !entry.file_name().to_string_lossy().starts_with(PREFIX) {
                    continue;
                }
                if let Ok(meta) = fs::symlink_metadata(entry.path()) {
                    if meta.is_dir()
                        && !meta.is_symlink()
                        && meta
                            .modified()
                            .ok()
                            .and_then(|t| t.elapsed().ok())
                            .is_some_and(|age| age > Duration::from_secs(24 * 3600))
                    {
                        let _ = fs::remove_dir_all(entry.path());
                    }
                }
            }
        }
        thread::spawn(|| loop {
            thread::sleep(Duration::from_secs(60));
            if let Ok(mut sessions) = SESSIONS.lock() {
                expire(&mut sessions);
            }
        });
    });
}
pub(crate) fn cleanup() {
    if let Ok(mut sessions) = SESSIONS.lock() {
        sessions.clear();
    }
}
fn expire(sessions: &mut BTreeMap<String, Session>) {
    sessions.retain(|_, session| session.touched.elapsed() < TTL);
}
fn take(engine: &Engine, id: &str) -> Result<Session, String> {
    let mut sessions = SESSIONS
        .lock()
        .map_err(|_| "Cannot access source inspection session.")?;
    expire(&mut sessions);
    if sessions.get(id).is_none_or(|s| s.home != engine.home) {
        return Err(
            "Source inspection expired. Inspect the source again before installing.".into(),
        );
    }
    sessions
        .remove(id)
        .ok_or_else(|| "Source inspection expired. Inspect again.".into())
}
pub(super) fn release(engine: &Engine, id: &str) -> Result<(), String> {
    let mut sessions = SESSIONS
        .lock()
        .map_err(|_| "Cannot access source inspection session.")?;
    if sessions.get(id).is_some_and(|s| s.home == engine.home) {
        sessions.remove(id);
    }
    Ok(())
}
fn git(engine: &Engine, root: &Path, args: &[&str]) -> Result<String, String> {
    let result = run_process_with_progress(
        engine
            .command(Path::new("git"), root)
            .args(["-c", "core.hooksPath=/dev/null"])
            .args(args),
        Duration::from_secs(120),
        engine.progress.clone(),
    )?;
    if !result.success {
        return Err(format!(
            "Cannot recheck source repository: {}",
            result.stderr
        ));
    }
    Ok(result.stdout)
}
pub(super) fn refresh(
    engine: &Engine,
    checkout: &Path,
    location: &GitSource,
) -> Result<(), String> {
    engine.report_installation("checking", 0, 0);
    // Resolve exact branch/tag names, with the same branch-before-tag preference as clone --branch.
    let reference = location.reference.as_deref();
    let patterns = reference
        .map(|r| {
            vec![
                format!("refs/heads/{r}"),
                format!("refs/tags/{r}^{{}}"),
                format!("refs/tags/{r}"),
            ]
        })
        .unwrap_or_else(|| vec!["HEAD".into()]);
    let mut args = vec!["ls-remote", "--", location.url.as_str()];
    args.extend(patterns.iter().map(String::as_str));
    let remote = git(engine, &engine.home, &args)?;
    let refs: BTreeMap<_, _> = remote
        .lines()
        .filter_map(|line| line.split_once('\t').map(|(oid, name)| (name, oid)))
        .collect();
    let (resolved_ref, oid) = patterns
        .iter()
        .find_map(|p| refs.get(p.as_str()).map(|oid| (p.as_str(), *oid)))
        .ok_or("Cannot resolve source reference. Inspect the source again.")?;
    if !matches!(oid.len(), 40 | 64) || !oid.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Invalid remote source revision.".into());
    }
    let head = git(engine, checkout, &["rev-parse", "HEAD"])?;
    if head.trim() != oid {
        git(
            engine,
            checkout,
            &[
                "fetch",
                "--depth",
                "1",
                "--no-tags",
                "--progress",
                "--",
                &location.url,
                resolved_ref.trim_end_matches("^{}"),
            ],
        )?;
        git(
            engine,
            checkout,
            &["checkout", "--detach", "--force", "FETCH_HEAD"],
        )?;
        git(engine, checkout, &["clean", "-ffd"])?;
        // A moving remote between advertisement and fetch must be re-reviewed.
        if git(engine, checkout, &["rev-parse", "HEAD"])?.trim() != oid {
            return Err("Source changed while checking. Inspect again before installing.".into());
        }
    }
    Ok(())
}
fn scan(
    engine: &Engine,
    source: &str,
    internal: bool,
    parsed: ParsedSource,
    session: &Session,
) -> Result<Inspection, String> {
    let root = session.checkout.0.join("repo");
    let path = match parsed.subpath.as_deref() {
        Some(subpath) => contained_path(&root, subpath)?,
        None => root.clone(),
    };
    // Always scan bytes again: a matching commit never authorizes trusting altered local files.
    inspect_directory(engine, source, internal, parsed, &root, &path)
}
pub(super) fn inspect(
    engine: &Engine,
    source: &str,
    internal: bool,
    previous: Option<&str>,
) -> Result<Inspection, String> {
    start_cleanup();
    let source = source.trim();
    let parsed = parsed_source(engine, source)?;
    if !matches!(parsed.source_type.as_str(), "github" | "gitlab" | "git") {
        if let Some(id) = previous {
            release(engine, id)?;
        }
        return inspect_with_options(engine, source, internal);
    }
    let location = parsed_git_location(&parsed)?;
    let reused = previous
        .and_then(|id| take(engine, id).ok())
        .filter(|s| s.source == source);
    let (id, mut session) = if let Some(session) = reused {
        refresh(engine, &session.checkout.0.join("repo"), &location)?;
        (
            previous.ok_or("Missing source session.")?.to_owned(),
            session,
        )
    } else {
        let mut checkout = clone_repository(engine, &location)?;
        let suffix = checkout
            .0
            .file_name()
            .ok_or("Invalid temporary checkout.")?
            .to_string_lossy();
        let id = format!("{PREFIX}{suffix}");
        let path = std::env::temp_dir().join(&id);
        fs::rename(&checkout.0, &path).map_err(|e| e.to_string())?;
        checkout.0 = path;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&checkout.0, fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
        (
            id,
            Session {
                home: engine.home.clone(),
                source: source.into(),
                checkout,
                touched: Instant::now(),
            },
        )
    };
    let mut inspection = scan(engine, source, internal, parsed, &session)?;
    session.touched = Instant::now();
    let mut sessions = SESSIONS
        .lock()
        .map_err(|_| "Cannot access source inspection session.")?;
    expire(&mut sessions);
    // Bound abandoned concurrent checks as well as their age.
    if sessions.len() >= 16 {
        if let Some(oldest) = sessions
            .iter()
            .min_by_key(|(_, s)| s.touched)
            .map(|(id, _)| id.clone())
        {
            sessions.remove(&oldest);
        }
    }
    sessions.insert(id.clone(), session);
    inspection.session_id = Some(id);
    Ok(inspection)
}
pub(super) fn recheck(engine: &Engine, operation: &Operation) -> Result<Inspection, String> {
    let source = operation.source.as_deref().ok_or("Missing source.")?.trim();
    let Some(id) = operation.inspection_session.as_deref() else {
        return inspect_with_options(engine, source, operation.include_internal);
    };
    let session = take(engine, id)?;
    if session.source != source {
        return Err("Source differs from its inspection session. Inspect again.".into());
    }
    let parsed = parsed_source(engine, source)?;
    let location = parsed_git_location(&parsed)?;
    refresh(engine, &session.checkout.0.join("repo"), &location)?;
    // Consumed on apply, including validation failure; Drop releases the checkout.
    scan(engine, source, operation.include_internal, parsed, &session)
}

#[tauri::command]
pub async fn upstream_inspection_release(app: AppHandle, session_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || release(&Engine::from_app(&app)?, &session_id))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn document(root: &Path, name: &str) {
        fs::create_dir_all(root).unwrap();
        fs::write(root.join("SKILL.md"), format!("---\nname: {name}\ndescription: A multi-line fixture description for batch installation\n---\n# {name}\n")).unwrap();
    }
    fn commit(e: &Engine, root: &Path) {
        git(e, root, &["add", "."]).unwrap();
        git(
            e,
            root,
            &[
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "-m",
                "fixture",
            ],
        )
        .unwrap();
    }
    fn setup() -> (TemporaryDirectory, Engine, String) {
        let fixture = TemporaryDirectory::new().unwrap();
        let home = fixture.0.join("home");
        fs::create_dir_all(home.join(".codex")).unwrap();
        fs::create_dir_all(home.join(".claude")).unwrap();
        let mut e = super::super::tests::engine(&home);
        e.test_trace = Some(fixture.0.join("git-trace"));
        let repo = fixture.0.join("repo");
        fs::create_dir(&repo).unwrap();
        git(&e, &repo, &["init", "-b", "main"]).unwrap();
        document(&repo.join("skills/alpha"), "alpha");
        document(&repo.join("skills/beta"), "beta");
        commit(&e, &repo);
        let url = "https://skills-fixture.invalid/batch/repo.git".to_owned();
        fs::write(
            home.join(".gitconfig"),
            format!(
                "[url \"{}\"]\n insteadOf = {url}\n",
                crate::upstream::tests::file_url(&repo)
            ),
        )
        .unwrap();
        (fixture, e, url)
    }
    fn operation(
        e: &Engine,
        source: &str,
        preview: &Inspection,
        copy: bool,
        project: bool,
    ) -> Operation {
        let target = if project {
            let root = e.home.join("project");
            fs::create_dir_all(&root).unwrap();
            Target {
                host: "local".into(),
                scope: "project".into(),
                project_path: Some(root.to_str().unwrap().into()),
            }
        } else {
            super::super::tests::global()
        };
        Operation {
            dsh_context_key: None,
            inspection_session: preview.session_id.clone(),
            sync_origin: None,
            target,
            action: "add".into(),
            source: Some(source.into()),
            skills: vec!["alpha".into(), "beta".into()],
            agents: vec!["codex".into(), "claude-code".into()],
            copy,
            source_hashes: Some(
                preview
                    .skills
                    .iter()
                    .map(|s| (s.name.clone(), s.selection_fingerprint.clone()))
                    .collect(),
            ),
            include_internal: false,
            removals: None,
            eve_subagents: vec![],
            removal_source: None,
        }
    }
    fn clones(e: &Engine) -> usize {
        fs::read_to_string(e.test_trace.as_ref().unwrap())
            .unwrap()
            .lines()
            .filter(|l| l.contains("built-in: git") && l.contains(" clone "))
            .count()
    }
    #[test]
    fn batch_session_installs_two_skills_with_two_clones_in_both_scopes_and_modes() {
        for (project, copy) in [(false, false), (true, true)] {
                let (_f, mut e, url) = setup();
                let events = std::sync::Arc::new(Mutex::new(Vec::new()));
                let received = events.clone();
                e.progress = Some(Channel::new(move |body| {
                    received
                        .lock()
                        .unwrap()
                        .push(body.deserialize::<InstallationProgress>()?);
                    Ok(())
                }));
                let preview = inspect(&e, &url, false, None).unwrap();
                let id = preview.session_id.clone().unwrap();
                let checkout = SESSIONS.lock().unwrap()[&id].checkout.0.clone();
                let repeated = inspect(&e, &url, true, Some(&id)).unwrap();
                assert_eq!(repeated.session_id, preview.session_id);
                assert_eq!(clones(&e), 1);
                let op = operation(&e, &url, &preview, copy, project);
                let result = apply(&e, &op).unwrap();
                assert_eq!(result.items.len(), 2);
                let progress = events.lock().unwrap();
                assert!(progress.iter().any(|event| event.stage == "cloning"));
                let installing = progress
                    .iter()
                    .position(|event| event.stage == "installing")
                    .unwrap();
                let verifying = progress
                    .iter()
                    .position(|event| event.stage == "verifying")
                    .unwrap();
                assert!(installing < verifying);
                let last = progress.last().unwrap();
                assert_eq!(
                    (last.stage.as_str(), last.completed, last.total),
                    ("verifying", 2, 2)
                );
                drop(progress);
                assert!(
                    result.items.iter().all(|i| i.status == "complete"),
                    "{}\n{:?}",
                    result.logs,
                    result
                        .items
                        .iter()
                        .map(|i| (&i.skill, &i.status))
                        .collect::<Vec<_>>()
                );
                assert_eq!(
                    clones(&e),
                    2,
                    "one inspection clone and one original batch CLI clone"
                );
                assert!(!checkout.exists());
                let root = op.target.directory(&e.home).unwrap();
                for name in ["alpha", "beta"] {
                    assert!(root
                        .join(".agents/skills")
                        .join(name)
                        .join("SKILL.md")
                        .exists());
                    let agent = root.join(".claude/skills").join(name);
                    assert_eq!(fs::symlink_metadata(agent).unwrap().is_symlink(), !copy);
                    let lock = e.lock(&op.target).unwrap();
                    assert_eq!(lock["skills"][name]["sourceUrl"], url);
                    assert_eq!(lock["skills"][name]["sourceType"], "git");
                }
        }
    }
    #[test]
    fn batch_recheck_rejects_changed_selected_content_but_accepts_unrelated_commits() {
        for selected_changed in [false, true] {
            let (f, e, url) = setup();
            let preview = inspect(&e, &url, false, None).unwrap();
            let op = operation(&e, &url, &preview, false, false);
            let repo = f.0.join("repo");
            fs::write(
                repo.join(if selected_changed {
                    "skills/alpha/new.txt"
                } else {
                    "unrelated.txt"
                }),
                "new content",
            )
            .unwrap();
            commit(&e, &repo);
            let result = apply(&e, &op);
            if selected_changed {
                assert!(result.err().unwrap().contains("changed since preview"));
                assert!(!e.home.join(".agents/skills").exists());
                assert_eq!(clones(&e), 1);
            } else {
                let result = result.unwrap();
                assert!(
                    result.items.iter().all(|i| i.status == "complete"),
                    "{}",
                    result.logs
                );
                assert_eq!(clones(&e), 2);
            }
            let trace = fs::read_to_string(e.test_trace.as_ref().unwrap()).unwrap();
            assert!(trace.contains(" fetch --depth 1"));
        }
    }
    #[test]
    fn media_skill_over_four_mib_installs_and_reinstalls_for_dsh() {
        let (f, e, url) = setup();
        let source = f.0.join("repo/skills/alpha");
        fs::create_dir(source.join("assets")).unwrap();
        fs::write(source.join("assets/hero.gif"), vec![1u8; 3 * 1024 * 1024]).unwrap();
        fs::write(
            source.join("assets/example.png"),
            vec![2u8; 2 * 1024 * 1024],
        )
        .unwrap();
        // Compare exact media and document bytes, independent of host Git newline defaults.
        fs::write(f.0.join("repo/.gitattributes"), "* -text\n").unwrap();
        commit(&e, &f.0.join("repo"));
        let profile = e.home.join(".dsh/profiles/desktop");
        fs::create_dir_all(&profile).unwrap();
        let manifest = br#"{"dsh":{"profile":{"bundles":["@fixture/missing-bundle"]}}}"#;
        fs::write(profile.join("package.json"), manifest).unwrap();
        for _ in 0..2 {
            let preview = inspect(&e, &url, false, None).unwrap();
            let mut op = operation(&e, &url, &preview, true, false);
            op.skills = vec!["alpha".into()];
            op.agents = vec![dsh::ID.into()];
            assert!(preview
                .skills
                .iter()
                .find(|s| s.name == "alpha")
                .unwrap()
                .selection_fingerprint
                .is_some());
            let result = apply(&e, &op).unwrap();
            assert_eq!(result.items[0].status, "complete", "{}", result.logs);
            let installed = e.home.join(".agents/skills/alpha");
            let expected = source_install_signature(&source).expect("Source tree is readable");
            let actual = tree_signature(&installed).expect("Installed tree is readable");
            let first_difference = expected
                .iter()
                .zip(&actual)
                .position(|(a, b)| a != b)
                .or_else(|| {
                    (expected.len() != actual.len()).then_some(expected.len().min(actual.len()))
                });
            assert!(expected == actual,
                "Exact tree bytes differ: source length {}, installed length {}, first differing byte {:?}",
                expected.len(), actual.len(), first_difference);
            assert_eq!(
                fs::metadata(installed.join("assets/hero.gif"))
                    .unwrap()
                    .len(),
                3 * 1024 * 1024
            );
            assert!(!e.home.join(".agents/skills/beta").exists());
            assert!(e.lock(&op.target).unwrap()["skills"]["alpha"].is_object());
            assert_eq!(fs::read(profile.join("package.json")).unwrap(), manifest);
        }
    }
    #[test]
    fn session_rejects_offline_missing_expired_mismatched_and_tampered_checkouts() {
        for failure in ["offline", "expired", "mismatch", "tamper", "missing"] {
            let (f, e, url) = setup();
            let preview = inspect(&e, &url, false, None).unwrap();
            let mut op = operation(&e, &url, &preview, false, false);
            let id = preview.session_id.clone().unwrap();
            let checkout = SESSIONS.lock().unwrap()[&id].checkout.0.clone();
            match failure {
                "offline" => fs::rename(f.0.join("repo"), f.0.join("unavailable")).unwrap(),
                "expired" => {
                    SESSIONS.lock().unwrap().get_mut(&id).unwrap().touched = Instant::now() - TTL
                }
                "mismatch" => {
                    op.source = Some("https://skills-fixture.invalid/other/repo.git".into())
                }
                "tamper" => {
                    fs::write(checkout.join("repo/skills/alpha/tamper.txt"), "tampered").unwrap();
                }
                "missing" => release(&e, &id).unwrap(),
                _ => unreachable!(),
            }
            assert!(apply(&e, &op).is_err(), "{failure}");
            assert!(!e.home.join(".agents/skills").exists(), "{failure}");
            assert!(!checkout.exists(), "{failure}");
            assert_eq!(clones(&e), 1);
        }
    }
    #[test]
    fn session_release_and_ref_refresh_follow_default_branches_and_tags() {
        for tag in [false, true] {
            let (f, e, url) = setup();
            let repo = f.0.join("repo");
            git(&e, &repo, &["tag", "v1"]).unwrap();
            let source = if tag {
                format!("{url}#v1")
            } else {
                url.clone()
            };
            // Generic git fragments are intentionally unsupported; exercise the resolved ref boundary directly.
            let preview = inspect(&e, &url, false, None).unwrap();
            let id = preview.session_id.unwrap();
            let session = take(&e, &id).unwrap();
            let root = session.checkout.0.join("repo");
            if tag {
                refresh(
                    &e,
                    &root,
                    &GitSource {
                        url: url.clone(),
                        reference: Some("v1".into()),
                    },
                )
                .unwrap();
            } else {
                git(&e, &repo, &["checkout", "-b", "next"]).unwrap();
                fs::write(repo.join("new.txt"), "next branch").unwrap();
                commit(&e, &repo);
                refresh(
                    &e,
                    &root,
                    &GitSource {
                        url: url.clone(),
                        reference: None,
                    },
                )
                .unwrap();
                assert!(root.join("new.txt").exists());
            }
            drop(session);
            assert!(!root.exists(), "{source}");
        }
        let (_f, e, url) = setup();
        let preview = inspect(&e, &url, false, None).unwrap();
        let id = preview.session_id.unwrap();
        let root = SESSIONS.lock().unwrap()[&id].checkout.0.clone();
        release(&e, &id).unwrap();
        release(&e, &id).unwrap();
        assert!(!root.exists());
    }
    #[test]
    fn session_subdirectories_and_moved_annotated_tags_reuse_the_checkout() {
        for reference in ["main", "release"] {
            let (f, e, _) = setup();
            let repo = f.0.join("repo");
            if reference == "release" {
                git(
                    &e,
                    &repo,
                    &[
                        "-c",
                        "user.name=Fixture",
                        "-c",
                        "user.email=test@example.invalid",
                        "tag",
                        "-a",
                        "release",
                        "-m",
                        "release",
                    ],
                )
                .unwrap();
            }
            let source = format!("https://github.com/fixture/batch/tree/{reference}/skills");
            let parsed = parsed_source(&e, &source).unwrap();
            fs::write(
                e.home.join(".gitconfig"),
                format!(
                    "[url \"{}\"]\n insteadOf = {}\n",
                    crate::upstream::tests::file_url(&repo),
                    parsed.url
                ),
            )
            .unwrap();
            let preview = inspect(&e, &source, false, None).unwrap();
            assert_eq!(preview.skills.len(), 2);
            let id = preview.session_id.clone().unwrap();
            let root = SESSIONS.lock().unwrap()[&id].checkout.0.clone();
            fs::write(repo.join("unrelated.txt"), "new commit").unwrap();
            commit(&e, &repo);
            if reference == "release" {
                git(
                    &e,
                    &repo,
                    &[
                        "-c",
                        "user.name=Fixture",
                        "-c",
                        "user.email=test@example.invalid",
                        "tag",
                        "-f",
                        "-a",
                        "release",
                        "-m",
                        "moved",
                    ],
                )
                .unwrap();
            }
            let repeated = inspect(&e, &source, false, Some(&id)).unwrap();
            assert_eq!(repeated.session_id, preview.session_id);
            assert_eq!(clones(&e), 1);
            assert!(root.join("repo/unrelated.txt").exists());
            assert_eq!(
                preview.skills[0].selection_fingerprint,
                repeated.skills[0].selection_fingerprint
            );
            let other_home = f.0.join("other-home");
            fs::create_dir(&other_home).unwrap();
            let other = super::super::tests::engine(&other_home);
            assert!(take(&other, &id).is_err());
            release(&other, &id).unwrap();
            assert!(root.exists());
            release(&e, &id).unwrap();
            assert!(!root.exists());
        }
    }
    #[cfg(unix)]
    #[test]
    fn batch_rejects_changed_unselected_content_and_lock_entries() {
        use std::os::unix::fs::PermissionsExt;
        fn quoted(path: &Path) -> String {
            format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"))
        }
        for alter_lock in [false, true] {
            let (f, mut e, url) = setup();
            let unrelated = f.0.join("unrelated-source");
            document(&unrelated, "unrelated");
            fs::write(unrelated.join("note.txt"), "original").unwrap();
            let mut seed =
                super::super::tests::addition(&unrelated, super::super::tests::global(), false);
            seed.skills = vec!["unrelated".into()];
            assert_eq!(apply(&e, &seed).unwrap().items[0].status, "complete");
            let preview = inspect(&e, &url, false, None).unwrap();
            let op = operation(&e, &url, &preview, false, false);
            let wrapper = f.0.join("node-wrapper");
            let (destination, content) = if alter_lock {
                (e.home.join(".agents/.skill-lock.json"), "{\"skills\":{}}")
            } else {
                (e.home.join(".agents/skills/unrelated/note.txt"), "changed")
            };
            fs::write(&wrapper, format!("#!/bin/sh\n{} \"$@\"\nresult=$?\ncase \"$1\" in */skills/bin/cli.mjs) if [ \"$2\" = add ]; then printf '%s' '{}' > {}; fi ;; esac\nexit \"$result\"\n", quoted(&e.node), content, quoted(&destination))).unwrap();
            fs::set_permissions(&wrapper, fs::Permissions::from_mode(0o755)).unwrap();
            e.node = wrapper;
            let result = apply(&e, &op).unwrap();
            assert!(
                result.items.iter().all(|i| i.status != "complete"),
                "{}",
                result.logs
            );
        }
    }
    #[cfg(unix)]
    #[test]
    fn batch_partial_failure_does_not_mark_the_successful_skill_failed() {
        use std::os::unix::fs::PermissionsExt;
        let (_f, e, url) = setup();
        let preview = inspect(&e, &url, false, None).unwrap();
        let op = operation(&e, &url, &preview, false, false);
        let blocked = e.home.join(".agents/skills/beta");
        fs::create_dir_all(&blocked).unwrap();
        fs::write(blocked.join("obstruction"), "keep").unwrap();
        fs::set_permissions(&blocked, fs::Permissions::from_mode(0o555)).unwrap();
        let result = apply(&e, &op);
        fs::set_permissions(&blocked, fs::Permissions::from_mode(0o755)).unwrap();
        let result = result.unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        assert_ne!(result.items[1].status, "complete", "{}", result.logs);
        assert_eq!(clones(&e), 2);
    }
}
