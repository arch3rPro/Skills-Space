use super::*;
use crate::upstream::TemporaryDirectory;

fn locations(root: &Path) -> Locations {
    let home = root.join("home");
    fs::create_dir_all(&home).unwrap();
    Locations {
        home,
        config: root.join("config/node-runtime.json"),
        data: root.join("data/node-runtime"),
    }
}

#[test]
fn node_minimum_boundary_and_invalid_versions_are_explicit() {
    for value in ["22.20.0", "v22.20.1", "24.0.0", "25.9.0"] {
        assert!(compatible(value), "{value}");
    }
    for value in [
        "22.19.9",
        "20.20.0",
        "22.20",
        "22.20.0-rc.1",
        "22.20.0.1",
        "Node v25.9.0",
        "",
        "99.-1.0",
    ] {
        assert!(!compatible(value), "{value}");
    }
    let manifest = manifest();
    assert!(compatible(&manifest.version));
    for target in [
        "darwin-arm64",
        "darwin-x64",
        "linux-arm64",
        "linux-x64",
        "win-arm64",
        "win-x64",
    ] {
        let digest = &manifest.checksums[target];
        assert_eq!(digest.len(), 64);
        assert!(digest.bytes().all(|b| b.is_ascii_hexdigit()));
    }
}

#[test]
fn node_selection_survives_reload_and_reset_preserves_other_preferences() {
    let fixture = TemporaryDirectory::new().unwrap();
    let loc = locations(&fixture.0);
    assert!(loc.selection().unwrap().path.is_none());
    let preferences = loc.config.with_file_name("preferences-v2.json");
    fs::create_dir_all(preferences.parent().unwrap()).unwrap();
    fs::write(
        &preferences,
        b"{\"language\":\"en\",\"projects\":[\"untouched\"]}",
    )
    .unwrap();
    let original = fs::read(&preferences).unwrap();
    let path = fixture.0.join("Node directory/selected node");
    loc.save(&Selection {
        path: Some(path.clone()),
    })
    .unwrap();
    let reloaded = locations(&fixture.0);
    assert_eq!(reloaded.selection().unwrap().path, Some(path));
    assert_eq!(fs::read(&preferences).unwrap(), original);
    loc.save(&Selection::default()).unwrap();
    assert!(reloaded.selection().unwrap().path.is_none());
    assert_eq!(fs::read(&preferences).unwrap(), original);
    assert!(!loc.config.with_extension("tmp").exists());
}

#[test]
fn node_detection_never_downloads_during_read_and_scopes_cached_observations() {
    let fixture = TemporaryDirectory::new().unwrap();
    let loc = locations(&fixture.0);
    let missing = inspect(&loc, &[]).unwrap();
    assert_eq!(missing.state, "missing");
    assert!(!loc.data.exists());
    let node = test_node();
    let ready = inspect(&loc, &[node.clone()]).unwrap();
    assert_eq!(ready.state, "ready");
    assert_eq!(ready.source.as_deref(), Some("system"));
    assert_eq!(ready.path, Some(fs::canonicalize(&node).unwrap()));
    assert!(!loc.data.exists());
    let second = locations(&fixture.0.join("second"));
    assert_eq!(inspect(&second, &[]).unwrap().state, "missing");
    loc.save(&Selection { path: Some(node) }).unwrap();
    let selected = inspect(&loc, &[]).unwrap();
    assert_eq!(selected.source.as_deref(), Some("custom"));
    assert!(selected.selected_path.is_some());
}

#[cfg(unix)]
#[test]
fn node_probe_rejects_missing_nonexecutables_and_unrelated_programs() {
    use std::os::unix::fs::PermissionsExt;
    let fixture = TemporaryDirectory::new().unwrap();
    assert!(probe(Path::new("relative/node")).is_err());
    assert!(probe(&fixture.0.join("missing")).is_err());
    let file = fixture.0.join("not-node");
    fs::write(&file, "#!/bin/sh\nprintf 'Python 3.14.0\\n'\n").unwrap();
    assert!(probe(&file).unwrap_err().contains("Node executable"));
    fs::set_permissions(&file, fs::Permissions::from_mode(0o755)).unwrap();
    assert!(probe(&file).unwrap_err().contains("Node executable"));
}

#[cfg(unix)]
#[test]
fn node_cache_invalidates_when_a_selected_symlink_is_removed_or_retargeted() {
    use std::os::unix::fs::symlink;
    let fixture = TemporaryDirectory::new().unwrap();
    let loc = locations(&fixture.0);
    let first = fixture.0.join("first");
    let second = fixture.0.join("second");
    fs::write(&first, "first").unwrap();
    fs::write(&second, "second").unwrap();
    let link = fixture.0.join("node");
    symlink(&first, &link).unwrap();
    let selected = Some(link.clone());
    cache_status(&loc, &selected, &link, &link, "v22.20.0", "custom").unwrap();
    assert!(cached(&loc, &selected).is_some());
    fs::remove_file(&link).unwrap();
    assert!(cached(&loc, &selected).is_none());
    symlink(&second, &link).unwrap();
    assert!(cached(&loc, &selected).is_none());
    cache_status(&loc, &selected, &link, &link, "v22.20.0", "custom").unwrap();
    fs::write(&second, "replacement with a different size").unwrap();
    assert!(cached(&loc, &selected).is_none());
}

#[test]
fn node_archive_hash_rejects_truncation_and_corruption_before_extraction() {
    let fixture = TemporaryDirectory::new().unwrap();
    let path = fixture.0.join("download.tar.gz");
    let archive = b"known archive bytes";
    let hash = format!("{:x}", Sha256::digest(archive));
    download_to(&archive[..], &path, &hash).unwrap();
    assert_eq!(fs::read(&path).unwrap(), archive);
    assert!(download_to(&archive[..5], &path, &hash)
        .unwrap_err()
        .contains("checksum mismatch"));
    assert!(download_to(&b"corrupted bytes"[..], &path, &hash).is_err());
    assert!(!fixture.0.join("bin/node").exists());
}

#[test]
fn concurrent_node_requests_reuse_the_selected_runtime_without_downloading() {
    let fixture = TemporaryDirectory::new().unwrap();
    let loc = locations(&fixture.0);
    let node = test_node();
    loc.save(&Selection {
        path: Some(node.clone()),
    })
    .unwrap();
    std::thread::scope(|scope| {
        let tasks: Vec<_> = (0..6)
            .map(|_| {
                let loc = &loc;
                scope.spawn(move || ensure(loc, None).unwrap())
            })
            .collect();
        for task in tasks {
            let status = task.join().unwrap();
            assert_eq!(status.state, "ready");
            assert_eq!(status.source.as_deref(), Some("custom"));
            assert_eq!(status.path, Some(fs::canonicalize(&node).unwrap()));
        }
    });
    assert!(!loc.data.exists());
}

#[cfg(unix)]
#[test]
fn node_shims_resolve_to_the_actual_executable_and_unchanged_reads_do_not_reprobe() {
    use std::os::unix::fs::PermissionsExt;
    let fixture = TemporaryDirectory::new().unwrap();
    let loc = locations(&fixture.0);
    let node = test_node();
    let shim = fixture.0.join("node shim");
    let trace = fixture.0.join("probe-count");
    let quote = |p: &Path| format!("'{}'", p.to_string_lossy().replace('\'', "'\\''"));
    fs::write(
        &shim,
        format!(
            "#!/bin/sh\nprintf x >> {}\nexec {} \"$@\"\n",
            quote(&trace),
            quote(&node)
        ),
    )
    .unwrap();
    fs::set_permissions(&shim, fs::Permissions::from_mode(0o755)).unwrap();
    loc.save(&Selection {
        path: Some(shim.clone()),
    })
    .unwrap();
    let first = inspect(&loc, &[]).unwrap();
    assert_eq!(first.path, Some(fs::canonicalize(&node).unwrap()));
    assert_ne!(first.path.as_ref(), Some(&shim));
    for _ in 0..5 {
        assert_eq!(inspect(&loc, &[]).unwrap().path, first.path);
    }
    assert_eq!(fs::read_to_string(&trace).unwrap(), "x");
}

#[test]
#[ignore = "Downloads the pinned official Node archive; requires public HTTPS"]
fn official_node_download_is_verified_minimal_and_reusable() {
    let fixture = TemporaryDirectory::new().unwrap();
    let loc = locations(&fixture.0);
    install(&loc).unwrap();
    let node = managed_node(&loc).unwrap();
    assert_eq!(probe(&node).unwrap(), format!("v{}", manifest().version));
    assert!(!loc.data.join("download").exists());
    let root = loc.data.join(stem().unwrap());
    assert!(root.join("LICENSE").is_file());
    let npm = root.join(if cfg!(windows) { "node_modules/npm/bin/npm-cli.js" } else { "lib/node_modules/npm/bin/npm-cli.js" });
    assert!(npm.is_file());
    let empty_config = loc.home.join("empty.npmrc");
    let global_config = loc.home.join("global.npmrc");
    fs::write(&empty_config, "").unwrap();
    fs::write(&global_config, "").unwrap();
    let result = run_process_with_timeout(Command::new(&node).arg(&npm).arg("--version").env("HOME", &loc.home).env("USERPROFILE", &loc.home).env("NPM_CONFIG_USERCONFIG", &empty_config).env("NPM_CONFIG_GLOBALCONFIG", &global_config).env("npm_config_cache", loc.home.join("npm-cache")), Duration::from_secs(10)).unwrap();
    assert!(result.success, "{}", result.stderr);
    assert!(result.stdout.trim().split('.').count() >= 3);
    #[cfg(unix)] {
        let path = std::env::join_paths([node.parent().unwrap(), Path::new("/usr/bin"), Path::new("/bin")]).unwrap();
        let npm_result = run_process_with_timeout(Command::new(root.join("bin/npm")).arg("--version").env("PATH", path).env("HOME", &loc.home).env("USERPROFILE", &loc.home).env("NPM_CONFIG_USERCONFIG", &empty_config).env("NPM_CONFIG_GLOBALCONFIG", &global_config).env("npm_config_cache", loc.home.join("npm-cache")), Duration::from_secs(10)).unwrap();
        assert!(npm_result.success, "{}", npm_result.stderr);
        assert_eq!(npm_result.stdout, result.stdout);
    }
    assert!(!root.join("include").exists());
    assert!(!root.join("share").exists());
    let status = inspect(&loc, &[]).unwrap();
    assert_eq!(status.source.as_deref(), Some("downloaded"));
    assert_eq!(status.path, Some(fs::canonicalize(node).unwrap()));
}
