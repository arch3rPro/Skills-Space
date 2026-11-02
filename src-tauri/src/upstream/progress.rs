use super::*;
use tauri::ipc::Channel;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationProgress {
    pub stage: String,
    pub detail: Option<String>,
    pub completed: usize,
    pub total: usize,
}

impl Engine {
    pub(super) fn report_installation(&self, stage: &str, completed: usize, total: usize) {
        if let Some(channel) = &self.progress {
            let _ = channel.send(InstallationProgress {
                stage: stage.into(),
                detail: None,
                completed,
                total,
            });
        }
    }
}

// Only Git's numeric transfer diagnostics belong in progress; arbitrary logs and URLs do not.
fn git_progress(line: &[u8]) -> Option<String> {
    let text = std::str::from_utf8(line).ok()?.trim();
    let text = text.strip_prefix("remote: ").unwrap_or(text).trim();
    let prefixes = [
        "Enumerating objects:",
        "Counting objects:",
        "Compressing objects:",
        "Receiving objects:",
        "Resolving deltas:",
        "Updating files:",
        "Unpacking objects:",
    ];
    let prefix = prefixes.iter().find(|prefix| text.starts_with(**prefix))?;
    let values = text.strip_prefix(*prefix)?.trim();
    if values.is_empty()
        || !values.starts_with(|c: char| c.is_ascii_digit())
        || !values
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b" %()/.,|+-".contains(&c))
    {
        return None;
    }
    Some(text.into())
}

pub(super) fn capture_progress(
    mut stream: impl Read,
    channel: Channel<InstallationProgress>,
) -> String {
    let mut captured = Vec::new();
    let mut line = Vec::new();
    let mut last = None::<Instant>;
    let mut buf = [0u8; 8192];
    while let Ok(count) = stream.read(&mut buf) {
        if count == 0 {
            break;
        }
        let remaining = (2 * 1024 * 1024usize).saturating_sub(captured.len());
        captured.extend_from_slice(&buf[..count.min(remaining)]);
        for byte in &buf[..count] {
            if matches!(byte, b'\r' | b'\n') {
                if let Some(detail) = git_progress(&line) {
                    if last.is_none_or(|time| time.elapsed() >= Duration::from_millis(200))
                        || detail.contains("100%")
                    {
                        let _ = channel.send(InstallationProgress {
                            stage: "cloning".into(),
                            detail: Some(detail),
                            completed: 0,
                            total: 0,
                        });
                        last = Some(Instant::now());
                    }
                }
                line.clear();
            } else if line.len() < 1024 {
                line.push(*byte);
            }
        }
    }
    String::from_utf8_lossy(&captured).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    #[cfg(unix)]
    #[test]
    fn progress_arrives_before_process_exit_and_preserves_failure() {
        let fixture = TemporaryDirectory::new().unwrap();
        let release = fixture.0.join("release");
        let (send, receive) = std::sync::mpsc::channel();
        let channel = Channel::new(move |body| {
            let progress = body.deserialize::<InstallationProgress>()?;
            let _ = send.send(progress);
            Ok(())
        });
        let path = release.clone();
        let task = thread::spawn(move || {
            run_process_with_progress(
                Command::new("sh").args([
                    "-c",
                    "printf 'Receiving objects: 69%% (30/43), 2.59 MiB | 669.00 KiB/s\\r' >&2; while [ ! -f \"$1\" ]; do sleep 0.01; done; printf 'failed fixture\\n' >&2; exit 7",
                    "fixture",
                ]).arg(path),
                Duration::from_secs(10),
                Some(channel),
            )
        });
        let progress = receive.recv_timeout(Duration::from_secs(5));
        // Release the fixture even on assertion failure; the capture threads must not leak.
        fs::write(release, "continue").unwrap();
        let result = task.join().unwrap().unwrap();
        assert!(progress.unwrap().detail.unwrap().contains("69%"));
        assert!(!result.success);
        assert!(result.stderr.contains("failed fixture"));
    }
    #[test]
    fn split_git_progress_stream_preserves_logs_and_filters_unrelated_output() {
        struct Chunks(Vec<Vec<u8>>);
        impl Read for Chunks {
            fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
                if self.0.is_empty() {
                    return Ok(0);
                }
                let next = self.0.remove(0);
                buf[..next.len()].copy_from_slice(&next);
                Ok(next.len())
            }
        }
        let messages = Arc::new(Mutex::new(Vec::new()));
        let saved = messages.clone();
        let channel = Channel::new(move |body| {
            saved
                .lock()
                .unwrap()
                .push(body.deserialize::<InstallationProgress>()?);
            Ok(())
        });
        let chunks = vec![b"Cloning into '/private/path'...\nReceiving obj".to_vec(),b"ects: 69% (30/43), 2.59 MiB | 669.00 KiB/s\r".to_vec(),b"Receiving objects: 100% (43/43), done.\nremote: secret=https://private.invalid/token\n".to_vec()];
        let expected = String::from_utf8(chunks.concat()).unwrap();
        assert_eq!(capture_progress(Chunks(chunks), channel), expected);
        let messages = messages.lock().unwrap();
        assert_eq!(messages.len(), 2);
        assert!(messages[0].detail.as_ref().unwrap().contains("69% (30/43)"));
        assert!(messages[1].detail.as_ref().unwrap().contains("100%"));
        assert!(messages.iter().all(|p| p.stage == "cloning"));
    }
}
