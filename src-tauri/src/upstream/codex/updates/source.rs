use super::*;

// Operation-scoped checkout: never upgrades a registered marketplace or reads Git credentials.
pub(super) struct Source {
    _temporary: TemporaryDirectory,
    pub root: PathBuf,
    pub label: String,
    pub install_override: String,
    pub native_marketplace: Option<PathBuf>,
}
fn git(home: &Path, cwd: &Path, args: &[&str]) -> Result<(), String> {
    let mut command = Command::new("git");
    command
        .env_clear()
        .env("PATH", "/usr/bin:/bin:/usr/local/bin")
        .env("HOME", home)
        .env("XDG_CONFIG_HOME", home)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "/usr/bin/false")
        .env("GIT_SSH_COMMAND", "/usr/bin/false")
        .current_dir(cwd)
        .args([
            "-c",
            "credential.helper=",
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "protocol.allow=never",
            "-c",
            "protocol.https.allow=always",
            "-c",
            "protocol.http.allow=always",
            "-c",
            "protocol.file.allow=always",
        ])
        .args(args);
    let result = run_process_with_timeout(&mut command, Duration::from_secs(45))?;
    if result.success {
        Ok(())
    } else {
        Err(format!("Cannot read plugin source: {}", result.stderr))
    }
}
fn copy(source: &Path, target: &Path) -> Result<(), String> {
    copy_bounded(source, target, &mut (0, 0))
}
fn copy_bounded(source: &Path, target: &Path, budget: &mut (usize, u64)) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_name() == ".git" {
            continue;
        }
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        // The original Codex store copies regular files/directories only.
        // Never follow source links, including dangling or escaping links.
        if kind.is_symlink() {
            continue;
        }
        budget.0 += 1;
        if budget.0 > 2000 {
            return Err("Plugin source content is too large.".into());
        }
        let dest = target.join(entry.file_name());
        if kind.is_dir() {
            copy_bounded(&entry.path(), &dest, budget)?;
        } else if kind.is_file() {
            budget.1 = budget
                .1
                .saturating_add(entry.metadata().map_err(|e| e.to_string())?.len());
            if budget.1 > MAX_SKILL_CONTENT_BYTES as u64 {
                return Err("Plugin source content is too large.".into());
            }
            fs::copy(entry.path(), dest).map_err(|e| e.to_string())?;
        } else {
            return Err("Plugin source contains an unsupported file type.".into());
        }
    }
    Ok(())
}
pub(super) fn prepare(
    engine: &Engine,
    target: &Target,
    snapshot: &Snapshot,
    plugin: &Plugin,
) -> Result<Source, String> {
    let temporary = TemporaryDirectory::new()?;
    let cwd = target.directory(&engine.home)?;
    let binary = Path::new(&snapshot.binary);
    let markets = cli(
        engine,
        binary,
        &cwd,
        &["plugin", "marketplace", "list", "--json"],
    )?;
    let market = markets["marketplaces"]
        .as_array()
        .and_then(|rows| rows.iter().find(|r| r["name"] == plugin.marketplace))
        .ok_or("Plugin marketplace is no longer registered.")?;
    let market_root = PathBuf::from(
        market["root"]
            .as_str()
            .ok_or("Marketplace root unavailable.")?,
    );
    let mut label = plugin.source_path.clone();
    let mut root = market_root.clone();
    if plugin.git_marketplace {
        let mut session = Session::start(engine, binary, &cwd)?;
        let config = read_config(&mut session, &cwd)?;
        let definition = &config["config"]["marketplaces"][&plugin.marketplace];
        let url = definition["source"]
            .as_str()
            .ok_or("Git source unavailable.")?;
        // No SSH, embedded credentials, credential helper or user Git configuration.
        let parsed = tauri::Url::parse(url).map_err(|_| "Invalid plugin Git source.")?;
        if !matches!(parsed.scheme(), "https" | "http" | "file")
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || parsed.query().is_some()
        {
            return Err("This Git source cannot be read without credentials. Use a public HTTPS or local repository source.".into());
        }
        root = temporary.0.join("repository");
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        git(&temporary.0, &root, &["init", "--quiet"])?;
        let reference = definition["ref"]
            .as_str()
            .or_else(|| definition["ref_name"].as_str())
            .unwrap_or("HEAD");
        git(
            &temporary.0,
            &root,
            &["fetch", "--quiet", "--depth=1", "--", url, reference],
        )?;
        git(
            &temporary.0,
            &root,
            &["checkout", "--quiet", "--detach", "FETCH_HEAD"],
        )?;
        label = format!("{url} ({reference})");
    }
    // Freeze just the selected package. Keep the original marketplace policy/metadata,
    // but expose only that entry to the original installer for this invocation.
    let mut marketplace =
        markets::manifest(&root).map_err(|e| format!("Cannot read plugin marketplace: {e}"))?;
    let name = plugin
        .id
        .rsplit_once('@')
        .ok_or("Invalid plugin identity.")?
        .0;
    let entry = marketplace["plugins"]
        .as_array()
        .and_then(|rows| rows.iter().find(|p| p["name"] == name))
        .cloned()
        .ok_or("Plugin was removed from its source.")?;
    if !entry["source"].is_string() && entry["source"]["source"] != "local" {
        return Err("Plugin source type changed. Refresh plugins before updating.".into());
    }
    let entry_path = entry["source"]
        .as_str()
        .or_else(|| entry["source"]["path"].as_str())
        .ok_or("Plugin source path unavailable.")?;
    let source = root.join(entry_path);
    if !identity(&source).starts_with(identity(&root)) {
        return Err("Plugin source escapes its marketplace.".into());
    }
    if plugin.builtin && catalog::builtin_market(&plugin.marketplace, &market_root) {
        // The original runtime validates reserved namespaces against CODEX_HOME,
        // so a frozen same-name market is intentionally not an admissible source.
        return Ok(Source {
            _temporary: temporary,
            root: source,
            label,
            install_override: String::new(),
            native_marketplace: Some(identity(
                &market_root.join(".agents/plugins/marketplace.json"),
            )),
        });
    }
    let frozen = temporary.0.join("candidate");
    copy(&source, &frozen.join("package"))?;
    fingerprint(&frozen.join("package")).ok_or("Plugin source content cannot be read.")?;
    let mut entry = entry;
    entry["source"] = json!({"source":"local", "path":"./package"});
    marketplace["plugins"] = json!([entry]);
    fs::create_dir_all(frozen.join(".agents/plugins")).map_err(|e| e.to_string())?;
    fs::write(
        frozen.join(".agents/plugins/marketplace.json"),
        serde_json::to_vec(&marketplace).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let install_override = format!(
        "marketplaces={{{}={{source_type=\"local\",source={}}}}}",
        serde_json::to_string(&plugin.marketplace).map_err(|e| e.to_string())?,
        serde_json::to_string(&frozen.to_string_lossy()).map_err(|e| e.to_string())?
    );
    Ok(Source {
        _temporary: temporary,
        root: frozen.join("package"),
        label,
        install_override,
        native_marketplace: None,
    })
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn frozen_source_matches_native_copy_without_following_links() {
        let temp = TemporaryDirectory::new().unwrap();
        let source = temp.0.join("source");
        let target = temp.0.join("frozen");
        fs::create_dir_all(source.join("skills")).unwrap();
        fs::write(source.join("CLAUDE.md"), "instructions").unwrap();
        fs::write(source.join("skills/SKILL.md"), "skill").unwrap();
        let outside = temp.0.join("private");
        fs::write(&outside, "must not be copied").unwrap();
        for (name, link) in [
            ("AGENTS.md", PathBuf::from("CLAUDE.md")),
            ("outside", outside),
            ("dangling", PathBuf::from("missing")),
            ("cycle", PathBuf::from(".")),
        ] {
            std::os::unix::fs::symlink(link, source.join(name)).unwrap();
        }
        assert!(fingerprint(&source).is_none());
        copy(&source, &target).unwrap();
        assert_eq!(
            fs::read_to_string(target.join("CLAUDE.md")).unwrap(),
            "instructions"
        );
        assert_eq!(
            fs::read_to_string(target.join("skills/SKILL.md")).unwrap(),
            "skill"
        );
        for name in ["AGENTS.md", "outside", "dangling", "cycle"] {
            assert!(fs::symlink_metadata(target.join(name)).is_err());
        }
        assert!(fingerprint(&target).is_some());
    }
}
