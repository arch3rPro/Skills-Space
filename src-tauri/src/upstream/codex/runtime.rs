//! Discover the original desktop-bundled CLI without depending on its version or resource path.
use super::*;

pub(super) fn app_binary(engine: &Engine) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let mut roots = vec![engine.home.join("Applications")];
        if !engine.isolated {
            roots.push(PathBuf::from("/Applications"));
        }
        for root in roots {
            for name in ["Codex.app", "ChatGPT.app"] {
                let app = root.join(name);
                let Some(metadata) = bundle(&app) else {
                    continue;
                };
                if metadata["CFBundleIdentifier"] != "com.openai.codex" {
                    continue;
                }
                // Only traverse this identified application's resources, with bounded work.
                let mut pending = vec![(app.join("Contents/Resources"), 0)];
                let mut visited = 0;
                while let Some((directory, depth)) = pending.pop() {
                    let Ok(entries) = fs::read_dir(directory) else {
                        continue;
                    };
                    for entry in entries.flatten().take(256) {
                        visited += 1;
                        if visited > 2048 {
                            break;
                        }
                        let path = entry.path();
                        if !entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                            continue;
                        }
                        if path.extension().is_some_and(|ext| ext == "app") {
                            let Some(metadata) = bundle(&path) else {
                                continue;
                            };
                            if metadata["CFBundleIdentifier"] != "com.openai.codex.cli" {
                                continue;
                            }
                            let Some(name) = metadata["CFBundleExecutable"].as_str() else {
                                continue;
                            };
                            if Path::new(name).file_name().and_then(|part| part.to_str())
                                != Some(name)
                            {
                                continue;
                            }
                            let binary = path.join("Contents/MacOS").join(name);
                            if super::super::detection::executable(&binary) {
                                return Some(binary);
                            }
                        } else if depth < 3 {
                            pending.push((path, depth + 1));
                        }
                    }
                    if visited > 2048 {
                        break;
                    }
                }
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = engine;
    None
}

#[cfg(target_os = "macos")]
fn bundle(path: &Path) -> Option<Value> {
    let plist = path.join("Contents/Info.plist");
    if fs::metadata(&plist).ok()?.len() > 1024 * 1024 {
        return None;
    }
    let output = run_process_with_timeout(
        Command::new("/usr/bin/plutil")
            .args(["-convert", "json", "-o", "-"])
            .arg(plist),
        Duration::from_secs(2),
    )
    .ok()?;
    if !output.success {
        return None;
    }
    serde_json::from_str(&output.stdout).ok()
}
