use super::*;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin};
use std::sync::mpsc::{self, Receiver};

// This session owns only the child it starts, never a desktop/shared daemon.
pub(super) struct Session {
    child: Child,
    input: ChildStdin,
    output: Receiver<Result<Value, String>>,
    next: u64,
    login_result: Option<(String, bool)>,
    pub(super) codex_home: Option<PathBuf>,
}
impl Drop for Session {
    fn drop(&mut self) {
        super::super::terminate_process(&mut self.child);
    }
}
impl Session {
    pub(super) fn start(engine: &Engine, binary: &Path, cwd: &Path) -> Result<Self, String> {
        Self::start_command(command(engine, binary, cwd))
    }
    #[cfg(test)]
    pub(super) fn start_isolated(binary: &Path, home: &Path) -> Result<Self, String> {
        fs::create_dir_all(home.join(".codex"))
            .map_err(|_| "Cannot create independent Codex home")?;
        let mut command = Command::new(binary);
        command
            .env_clear()
            .current_dir(home)
            .env("HOME", home)
            .env("CODEX_HOME", home.join(".codex"))
            .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
            .env("TMPDIR", home)
            .args(["-c", "cli_auth_credentials_store=\"ephemeral\""]);
        Self::start_command(command)
    }
    pub(super) fn start_account(
        binary: &Path,
        home: &Path,
        codex_home: &Path,
        system_home: &Path,
    ) -> Result<Self, String> {
        fs::create_dir_all(codex_home).map_err(|_| "CODEX_AUTH_STORAGE")?;
        if fs::symlink_metadata(codex_home)
            .map_err(|_| "CODEX_AUTH_STORAGE")?
            .file_type()
            .is_symlink()
        {
            return Err("CODEX_AUTH_STORAGE".into());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(codex_home, fs::Permissions::from_mode(0o700))
                .map_err(|_| "CODEX_AUTH_STORAGE")?;
        }
        let mut command = Command::new(binary);
        command
            .env_clear()
            .current_dir(home)
            .env("HOME", system_home)
            .env("CODEX_HOME", codex_home)
            .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
            .env("TMPDIR", home)
            .args(["-c", "cli_auth_credentials_store=\"keyring\""]);
        let mut session = Self::start_command(command)?;
        let config = session.call("config/read", json!({"includeLayers":false}))?;
        if config["config"]["cli_auth_credentials_store"] != "keyring" {
            return Err("CODEX_AUTH_STORAGE".into());
        }
        Ok(session)
    }
    fn start_command(mut command: Command) -> Result<Self, String> {
        command
            .args(["app-server", "--stdio"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let mut child = command
            .spawn()
            .map_err(|e| format!("Cannot start Codex: {e}"))?;
        let input = child.stdin.take().ok_or("Codex stdin unavailable")?;
        let stdout = child.stdout.take().ok_or("Codex stdout unavailable")?;
        let (send, output) = mpsc::sync_channel(32);
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut line = Vec::new();
                // Bound each protocol message before parsing, including unterminated output.
                let read = reader
                    .by_ref()
                    .take(4 * 1024 * 1024 + 1)
                    .read_until(b'\n', &mut line);
                match read {
                    Ok(0) => break,
                    Ok(n) if n <= 4 * 1024 * 1024 => {
                        let message = serde_json::from_slice(&line)
                            .map_err(|e| format!("Invalid Codex response: {e}"));
                        if send.send(message).is_err() {
                            break;
                        }
                    }
                    _ => {
                        let _ = send.send(Err(
                            "Codex response exceeded the protocol limit or could not be read."
                                .into(),
                        ));
                        break;
                    }
                }
            }
        });
        let mut session = Self {
            child,
            input,
            output,
            next: 0,
            login_result: None,
            codex_home: None,
        };
        let initialized = session.call(
            "initialize",
            json!({"clientInfo":{"name":"skills_space","version":"0.1"}}),
        )?;
        session.codex_home = initialized["codexHome"].as_str().map(PathBuf::from);
        if session
            .codex_home
            .as_ref()
            .is_some_and(|path| !path.is_absolute())
        {
            return Err("Codex returned an invalid configuration directory.".into());
        }
        session.send(json!({"method":"initialized"}))?;
        Ok(session)
    }
    fn note_login(&mut self, value: &Value) {
        if value["method"] == "account/login/completed" {
            if let (Some(id), Some(success)) = (
                value["params"]["loginId"].as_str(),
                value["params"]["success"].as_bool(),
            ) {
                self.login_result = Some((id.into(), success));
            }
        }
    }
    pub(super) fn poll_login(&mut self, id: &str) -> Result<Option<bool>, String> {
        if self
            .child
            .try_wait()
            .map_err(|_| "Codex process status unavailable")?
            .is_some()
        {
            return Err("Codex authorization process stopped".into());
        }
        while let Ok(value) = self.output.try_recv() {
            self.note_login(&value?);
        }
        Ok(self
            .login_result
            .as_ref()
            .filter(|(key, _)| key == id)
            .map(|(_, result)| *result))
    }
    fn send(&mut self, value: Value) -> Result<(), String> {
        writeln!(self.input, "{value}")
            .and_then(|_| self.input.flush())
            .map_err(|e| e.to_string())
    }
    pub(super) fn call(&mut self, method: &str, params: Value) -> Result<Value, String> {
        self.next += 1;
        let id = self.next;
        self.send(json!({"id":id,"method":method,"params":params}))?;
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            let value = self.output.recv_timeout(remaining).map_err(|_| {
                format!(
                    "Codex {method} timed out or stopped. Refresh actual state before retrying."
                )
            })??;
            if value.get("method").is_some() {
                self.note_login(&value);
                if let Some(request_id) = value.get("id") {
                    self.send(json!({"id":request_id,"error":{"code":-32601,"message":"Interactive requests are unavailable in skill management."}}))?;
                }
                continue;
            }
            if value["id"] != id {
                continue;
            }
            if let Some(error) = value.get("error") {
                return Err(format!("Codex {method}: {error}"));
            }
            return value
                .get("result")
                .cloned()
                .ok_or_else(|| format!("Codex {method} returned no result."));
        }
    }
}
