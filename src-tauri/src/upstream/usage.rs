//! Owned temporary use sessions. The original CLI prepares prompts and launches Agents.
use super::*;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UseInput {
    target: Target,
    source: String,
    skill: String,
    include_internal: bool,
    mode: String,
    agent: Option<String>,
    source_fingerprint: Option<String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsePlan {
    id: String,
    input: UseInput,
    source: String,
    skill: String,
    description: String,
    working_directory: String,
    mode: String,
    agent: Option<String>,
    risk_required: bool,
    file_bytes: usize,
}
#[derive(Deserialize, Serialize)]
struct Request {
    root: String,
    plan: UsePlan,
    node: String,
    cli: String,
    cli_dist: String,
    runner: String,
    home: String,
    search_path: String,
    isolated: bool,
    agent_command: Option<String>,
    agent_stamp: Option<String>,
    args: Vec<String>,
    selection_fingerprint: Option<String>,
}
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    phase: String,
    runner_pid: Option<u32>,
    cli_pid: Option<u32>,
    exit_code: Option<i32>,
    verified: bool,
    agent_started: bool,
    skill_directory: Option<String>,
    error: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    plan: UsePlan,
    status: Status,
    can_release: bool,
    prompt: Option<String>,
    diagnostic: Option<String>,
}
#[derive(Deserialize)]
struct AgentConfig {
    command: String,
    args: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UseAgent {
    prompt_supported: bool,
    terminal_supported: bool,
    id: String,
    name: String,
    command: String,
    path: Option<String>,
}

fn search_path(engine: &Engine) -> String {
    let mut paths = Vec::new();
    if engine.isolated {
        paths.push(engine.home.join("bin"));
    }
    if let Some(value) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&value));
    }
    paths.extend([
        engine.home.join(".local/bin"),
        engine.home.join(".cargo/bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ]);
    std::env::join_paths(paths)
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}
fn executable(path: &Path) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}
fn agents(engine: &Engine) -> Result<Vec<UseAgent>, String> {
    let configs: BTreeMap<String, AgentConfig> = serde_json::from_slice(
        &fs::read(engine.resources.join("use-agents.json")).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let paths = search_path(engine);
    configs
        .into_iter()
        .map(|(id, config)| {
            if !config.args.is_empty() || config.command.contains(['/', '\\']) {
                return Err("Unsupported pinned use Agent command.".into());
            }
            let path = std::env::split_paths(&paths)
                .map(|p| {
                    p.join(if cfg!(windows) {
                        format!("{}.exe", config.command)
                    } else {
                        config.command.clone()
                    })
                })
                .find(|p| executable(p));
            Ok(UseAgent {
                prompt_supported: cfg!(unix),
                terminal_supported: cfg!(target_os = "macos"),
                name: if id == "codex" {
                    "Codex".into()
                } else if id == "sarvam-code" {
                    "Sarvam Code".into()
                } else {
                    "Claude Code".into()
                },
                id,
                command: config.command,
                path: path
                    .and_then(|p| fs::canonicalize(p).ok())
                    .map(|p| p.to_string_lossy().into_owned()),
            })
        })
        .collect()
}
fn stamp(path: &str) -> Result<String, String> {
    let m = fs::metadata(path).map_err(|e| e.to_string())?;
    Ok(format!(
        "{}:{:?}",
        m.len(),
        m.modified().map_err(|e| e.to_string())?
    ))
}
fn private(path: &Path, directory: bool) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(
            path,
            fs::Permissions::from_mode(if directory { 0o700 } else { 0o600 }),
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn base(path: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(path).map_err(|e| e.to_string())?;
    if fs::symlink_metadata(path)
        .map_err(|e| e.to_string())?
        .is_symlink()
    {
        return Err("Session cache must be a real directory.".into());
    }
    private(path, true)?;
    fs::canonicalize(path).map_err(|e| e.to_string())
}
fn root(cache: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || id.len() > 80 || !id.bytes().all(|b| b.is_ascii_digit() || b == b'-') {
        return Err("Invalid session identity.".into());
    }
    let path = base(cache)?.join(id);
    if !fs::symlink_metadata(&path).is_ok_and(|m| m.is_dir() && !m.is_symlink()) {
        return Err("Session is missing or has been released.".into());
    }
    Ok(path)
}
fn read<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    let m = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !m.is_file() || m.is_symlink() || m.len() > 1024 * 1024 {
        return Err("Invalid session record.".into());
    }
    serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
fn write<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let temp = path.with_extension("new");
    fs::write(&temp, serde_json::to_vec(value).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    private(&temp, false)?;
    fs::rename(temp, path).map_err(|e| e.to_string())
}
fn request(cache: &Path, id: &str) -> Result<(PathBuf, Request), String> {
    let path = root(cache, id)?;
    let request: Request = read(&path.join("request.json"))?;
    if request.root != path.to_string_lossy() || request.plan.id != id {
        return Err("Session record identity differs.".into());
    }
    Ok((path, request))
}
fn inspect_input(
    engine: &Engine,
    input: &UseInput,
) -> Result<(SourceSkill, bool, Option<String>), String> {
    if !cfg!(unix) {
        return Err("Temporary-use process control is unavailable on this platform.".into());
    }
    input.target.directory(&engine.home)?;
    if !matches!(input.mode.as_str(), "prompt" | "agent")
        || input.skill.is_empty()
        || input.skill == "*"
        || input.skill.starts_with('-')
    {
        return Err("Choose one skill and a supported use mode.".into());
    }
    if input.mode == "agent" && !cfg!(target_os = "macos") {
        return Err("Interactive terminal launch is not available on this platform.".into());
    }
    if input.mode == "prompt" && input.agent.is_some() {
        return Err("Prompt mode does not accept an Agent target.".into());
    }
    let command = if input.mode == "agent" {
        Some(agents(engine)?.into_iter().find(|a|Some(&a.id)==input.agent.as_ref()).and_then(|a|a.path).ok_or("Agent command not found in the executable search path. Install or configure the command before starting.")?)
    } else {
        None
    };
    // 1.7.2 removed the OpenClaw-specific use acceptance option.
    let risk = false;
    let inspection = inspect_with_options(engine, &input.source, input.include_internal)?;
    let skill = inspection
        .skills
        .into_iter()
        .find(|s| s.name == input.skill)
        .ok_or("The selected skill is not visible in this source.")?;
    if input.source_fingerprint != skill.selection_fingerprint {
        return Err("Source changed since preview. Inspect it again before preparing use.".into());
    }
    if skill.use_signature.is_none() {
        return Err(
            "Source exceeds temporary-use verification limits; no Agent was started.".into(),
        );
    }
    Ok((skill, risk, command))
}
fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
fn prepare(engine: &Engine, cache: &Path, input: UseInput) -> Result<UsePlan, String> {
    let (skill, risk, command) = inspect_input(engine, &input)?;
    let signature = skill
        .use_signature
        .as_ref()
        .ok_or("Missing use content expectation.")?;
    let cache = base(cache)?;
    if fs::read_dir(&cache).map_err(|e| e.to_string())?.count() >= 50 {
        return Err("Release old use sessions before creating more (limit 50).".into());
    }
    let id = format!(
        "{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos()
    );
    let path = cache.join(&id);
    fs::create_dir(&path).map_err(|e| e.to_string())?;
    private(&path, true)?;
    for dir in ["tmp", "bin"] {
        fs::create_dir(path.join(dir)).map_err(|e| e.to_string())?;
        private(&path.join(dir), true)?;
    }
    let plan = UsePlan {
        id,
        input: input.clone(),
        source: input.source.clone(),
        skill: skill.name.clone(),
        description: skill.description.clone(),
        working_directory: input
            .target
            .directory(&engine.home)?
            .to_string_lossy()
            .into_owned(),
        mode: input.mode.clone(),
        agent: input.agent.clone(),
        risk_required: risk,
        file_bytes: signature.len(),
    };
    let mut args = vec![
        "use".into(),
        input.source.clone(),
        "--skill".into(),
        skill.name,
        "--full-depth".into(),
    ];
    if let Some(id) = &input.agent {
        args.extend(["--agent".into(), id.clone()]);
    }
    let request = Request {
        root: path.to_string_lossy().into_owned(),
        plan: plan.clone(),
        node: engine.node.to_string_lossy().into_owned(),
        cli: engine
            .resources
            .join("skills/bin/cli.mjs")
            .to_string_lossy()
            .into_owned(),
        cli_dist: engine
            .resources
            .join("skills/dist/cli.mjs")
            .to_string_lossy()
            .into_owned(),
        runner: engine
            .resources
            .join("run-upstream-use.mjs")
            .to_string_lossy()
            .into_owned(),
        home: engine.home.to_string_lossy().into_owned(),
        search_path: search_path(engine),
        isolated: engine.isolated,
        agent_stamp: command.as_deref().map(stamp).transpose()?,
        agent_command: command,
        args,
        selection_fingerprint: skill.selection_fingerprint,
    };
    fs::write(path.join("expected.bin"), signature).map_err(|e| e.to_string())?;
    private(&path.join("expected.bin"), false)?;
    write(&path.join("request.json"), &request)?;
    write(
        &path.join("status.json"),
        &Status {
            phase: "planned".into(),
            ..Status::default()
        },
    )?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let launch = format!(
            "#!/bin/sh\nexec {} {} {}\n",
            quote(&request.node),
            quote(&request.runner),
            quote(
                path.join("request.json")
                    .to_str()
                    .ok_or("Invalid session path.")?
            )
        );
        fs::write(path.join("Launch.command"), launch).map_err(|e| e.to_string())?;
        fs::set_permissions(
            path.join("Launch.command"),
            fs::Permissions::from_mode(0o700),
        )
        .map_err(|e| e.to_string())?;
        if let Some(agent) = &request.plan.agent {
            let def: BTreeMap<String, AgentConfig> =
                read(&engine.resources.join("use-agents.json"))?;
            let command = &def.get(agent).ok_or("Unknown use Agent.")?.command;
            let shim = format!(
                "#!/bin/sh\nexec {} {} {} --bridge \"$@\"\n",
                quote(&request.node),
                quote(&request.runner),
                quote(
                    path.join("request.json")
                        .to_str()
                        .ok_or("Invalid session path.")?
                )
            );
            let file = path.join("bin").join(command);
            fs::write(&file, shim).map_err(|e| e.to_string())?;
            fs::set_permissions(file, fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(plan)
}
fn group_alive(pid: Option<u32>) -> bool {
    #[cfg(unix)]
    {
        pid.is_some_and(|pid| {
            pid > 1
                && Command::new("kill")
                    .args(["-0", &format!("-{pid}")])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
                    .is_ok_and(|s| s.success())
        })
    }
    #[cfg(not(unix))]
    {
        pid.is_some()
    }
}
fn owns_runner(pid: Option<u32>, path: &Path) -> bool {
    #[cfg(unix)]
    {
        pid.is_some_and(|pid| {
            pid > 1
                && Command::new("ps")
                    .args(["-ww", "-p", &pid.to_string(), "-o", "command="])
                    .output()
                    .is_ok_and(|o| {
                        o.status.success()
                            && String::from_utf8_lossy(&o.stdout)
                                .contains(path.join("request.json").to_string_lossy().as_ref())
                            && String::from_utf8_lossy(&o.stdout).contains("run-upstream-use.mjs")
                    })
        })
    }
    #[cfg(not(unix))]
    {
        pid.is_some()
    }
}
fn session(cache: &Path, id: &str, content: bool) -> Result<Session, String> {
    let (path, request) = request(cache, id)?;
    let mut status: Status = read(&path.join("status.json"))?;
    if matches!(status.phase.as_str(), "preparing" | "waiting") {
        if let Ok(agent) = read::<serde_json::Value>(&path.join("agent.json")) {
            if agent["phase"] == "running" {
                status.phase = "running".into();
                status.verified = agent["verified"] == true;
                status.agent_started = true;
                status.skill_directory = agent["skillDirectory"].as_str().map(str::to_owned);
            }
        }
    }
    let alive = owns_runner(status.runner_pid, &path);
    let group = group_alive(status.cli_pid);
    if matches!(
        status.phase.as_str(),
        "preparing" | "running" | "background"
    ) && !alive
    {
        status.phase = "interrupted".into();
        status.error=Some("Session process was interrupted. Close related terminal processes before releasing temporary files.".into());
    }
    if path.join("cancel").exists() && alive {
        status.phase = "stopping".into();
    }
    if let Some(dir) = &status.skill_directory {
        if !Path::new(dir).starts_with(path.join("tmp")) {
            return Err("Invalid session support directory.".into());
        }
    }
    let text = |name: &str, limit: u64| -> Option<String> {
        let p = path.join(name);
        let m = fs::symlink_metadata(&p).ok()?;
        if !m.is_file() || m.is_symlink() || m.len() > limit {
            return None;
        }
        fs::read_to_string(p).ok()
    };
    Ok(Session {
        plan: request.plan,
        can_release: !alive && !group,
        status: status.clone(),
        prompt: if content && status.phase == "ready" && status.verified {
            text("prompt.txt", 512 * 1024)
        } else {
            None
        },
        diagnostic: if content {
            text("diagnostic.txt", 64 * 1024)
        } else {
            None
        },
    })
}
fn start(
    engine: &Engine,
    cache: &Path,
    id: &str,
    _accept_risks: bool,
    terminal: bool,
) -> Result<Session, String> {
    let (path, request) = request(cache, id)?;
    if read::<Status>(&path.join("status.json"))?.phase != "planned" {
        return Err(
            "This session has already been started. Prepare a new confirmation to run again."
                .into(),
        );
    }
    if request.node != engine.node.to_string_lossy()
        || request.cli
            != engine
                .resources
                .join("skills/bin/cli.mjs")
                .to_string_lossy()
    {
        return Err("Application runtime changed. Prepare a new use session.".into());
    }
    let (skill, _, command) = inspect_input(engine, &request.plan.input)?;
    if fs::read(path.join("expected.bin"))
        .map_err(|e| e.to_string())?
        .as_slice()
        != skill
            .use_signature
            .as_deref()
            .ok_or("Missing content expectation.")?
        || request.selection_fingerprint != skill.selection_fingerprint
    {
        return Err("Source changed after confirmation. Prepare a new session.".into());
    }
    if command != request.agent_command
        || command.as_deref().map(stamp).transpose()? != request.agent_stamp
    {
        return Err("Agent command changed. Prepare a new confirmation.".into());
    }
    write(&path.join("request.json"), &request)?;
    write(
        &path.join("status.json"),
        &Status {
            phase: "waiting".into(),
            ..Status::default()
        },
    )?;
    let result = if request.plan.mode == "agent" && terminal {
        run_process(
            Command::new("open")
                .args(["-a", "Terminal"])
                .arg(path.join("Launch.command")),
        )
        .and_then(|o| {
            if o.success {
                Ok(())
            } else {
                Err("System terminal could not be opened.".into())
            }
        })
    } else {
        let mut cmd = engine.command(&engine.node, &engine.home);
        cmd.arg(&request.runner)
            .arg(path.join("request.json"))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }
        cmd.spawn()
            .map(|mut child| {
                thread::spawn(move || {
                    let _ = child.wait();
                });
            })
            .map_err(|e| e.to_string())
    };
    if let Err(error) = result {
        write(
            &path.join("status.json"),
            &Status {
                phase: "failed".into(),
                error: Some(error),
                ..Status::default()
            },
        )?;
    }
    session(cache, id, true)
}
fn cancel(cache: &Path, id: &str) -> Result<Session, String> {
    let (path, _) = request(cache, id)?;
    fs::write(path.join("cancel"), b"cancel").map_err(|e| e.to_string())?;
    let current: Status = read(&path.join("status.json"))?;
    if matches!(current.phase.as_str(), "planned" | "waiting")
        && current.runner_pid.is_none()
        && fs::create_dir(path.join("ownership")).is_ok()
    {
        write(
            &path.join("status.json"),
            &Status {
                phase: "cancelled".into(),
                ..current
            },
        )?;
        fs::remove_dir(path.join("ownership")).map_err(|e| e.to_string())?;
    }
    session(cache, id, true)
}
fn release(cache: &Path, id: &str) -> Result<(), String> {
    let s = session(cache, id, false)?;
    if !s.can_release {
        return Err(
            "Session processes are still active. Stop the session and wait before releasing files."
                .into(),
        );
    }
    let path = root(cache, id)?;
    fs::write(path.join("cancel"), b"released").map_err(|e| e.to_string())?;
    if path.join("ownership").exists() {
        if s.status.runner_pid.is_none() {
            return Err(
                "Session startup is still being claimed. Wait before releasing files.".into(),
            );
        }
        fs::remove_dir(path.join("ownership"))
            .map_err(|_| "Session ownership could not be verified; files were retained.")?;
    }
    fs::create_dir(path.join("ownership"))
        .map_err(|_| "Session started concurrently; wait before releasing files.")?;
    fs::remove_dir_all(path).map_err(|e| e.to_string())
}
fn cache(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("use-sessions"))
}

#[tauri::command]
pub async fn upstream_use_agents(app: AppHandle) -> Result<Vec<UseAgent>, String> {
    tauri::async_runtime::spawn_blocking(move || agents(&Engine::from_app(&app)?))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_use_prepare(app: AppHandle, input: UseInput) -> Result<UsePlan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        prepare(&Engine::from_app(&app)?, &cache(&app)?, input)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_use_start(
    app: AppHandle,
    id: String,
    accept_risks: bool,
) -> Result<Session, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        start(
            &Engine::from_app(&app)?,
            &cache(&app)?,
            &id,
            accept_risks,
            true,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_use_session(app: AppHandle, id: String) -> Result<Session, String> {
    tauri::async_runtime::spawn_blocking(move || session(&cache(&app)?, &id, true))
        .await
        .map_err(|e| e.to_string())?
}
fn list_sessions(cache: &Path) -> Result<Vec<Session>, String> {
    let cache = base(cache)?;
    let mut sessions = Vec::new();
    for entry in fs::read_dir(&cache).map_err(|e| e.to_string())?.take(50) {
        let entry = entry.map_err(|e| e.to_string())?;
        if let Ok(s) = session(&cache, &entry.file_name().to_string_lossy(), false) {
            sessions.push(s);
        }
    }
    sessions.sort_by(|a, b| b.plan.id.cmp(&a.plan.id));
    Ok(sessions)
}
#[tauri::command]
pub async fn upstream_use_sessions(app: AppHandle) -> Result<Vec<Session>, String> {
    tauri::async_runtime::spawn_blocking(move || list_sessions(&cache(&app)?))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_use_cancel(app: AppHandle, id: String) -> Result<Session, String> {
    tauri::async_runtime::spawn_blocking(move || cancel(&cache(&app)?, &id))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_use_release(app: AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || release(&cache(&app)?, &id))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_use_open_directory(app: AppHandle, id: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let s = session(&cache(&app)?, &id, false)?;
    let root = root(&cache(&app)?, &id)?;
    let path = s
        .status
        .skill_directory
        .map(PathBuf::from)
        .unwrap_or(root.join("tmp"));
    let real = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    if !real.starts_with(&root) {
        return Err("Temporary directory is outside this session.".into());
    }
    app.opener()
        .open_path(real.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::tests::{engine, global};
    fn fixture() -> (TemporaryDirectory, Engine, PathBuf, PathBuf, Target) {
        let f = TemporaryDirectory::new().unwrap();
        let home = f.0.join("home");
        let source = f.0.join("source");
        let project = f.0.join("project");
        let cache = f.0.join("sessions");
        fs::create_dir_all(home.join(".codex")).unwrap();
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&project).unwrap();
        fs::write(source.join("SKILL.md"),"---\nname: fixture-skill\ndescription: Temporary use fixture\n---\n# Skill\nRead supporting.bin\n").unwrap();
        fs::write(source.join("supporting.bin"), [0, 255, 1]).unwrap();
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into_owned()),
        };
        let e = engine(&home);
        (f, e, source, cache, target)
    }
    fn input(e: &Engine, source: &str, target: Target, agent: Option<&str>) -> UseInput {
        let s = inspect(e, source)
            .unwrap()
            .skills
            .into_iter()
            .find(|s| s.name == "fixture-skill")
            .unwrap();
        UseInput {
            target,
            source: source.into(),
            skill: s.name,
            source_fingerprint: s.selection_fingerprint,
            include_internal: false,
            mode: if agent.is_some() {
                "agent".into()
            } else {
                "prompt".into()
            },
            agent: agent.map(str::to_owned),
        }
    }
    fn wait(cache: &Path, id: &str, expected: &[&str]) -> Session {
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let s = session(cache, id, true).unwrap();
            if expected.contains(&s.status.phase.as_str()) && s.can_release {
                return s;
            }
            assert!(
                Instant::now() < deadline,
                "{} {:?}",
                s.status.phase,
                s.status.error
            );
            thread::sleep(Duration::from_millis(50));
        }
    }
    fn untouched(e: &Engine, project: &Target) {
        assert!(!e.home.join(".agents/skills").exists());
        assert!(!e.home.join(".agents/.skill-lock.json").exists());
        assert!(!project
            .directory(&e.home)
            .unwrap()
            .join("skills-lock.json")
            .exists());
    }
    #[cfg_attr(not(windows), ignore = "Windows temporary-use capability contract")]
    #[test]
    fn unsupported_temporary_use_refuses_without_writing_sessions_or_skills() {
        let (_f, e, source, cache, project) = fixture();
        let document = fs::read(source.join("SKILL.md")).unwrap();
        let support = fs::read(source.join("supporting.bin")).unwrap();
        for (mode, agent) in [("prompt", None), ("agent", Some("codex"))] {
            let request = UseInput {
                target: project.clone(),
                source: source.to_string_lossy().into_owned(),
                skill: "fixture-skill".into(),
                source_fingerprint: None,
                include_internal: false,
                mode: mode.into(),
                agent: agent.map(str::to_owned),
            };
            assert_eq!(
                prepare(&e, &cache, request).err().unwrap(),
                "Temporary-use process control is unavailable on this platform."
            );
            assert!(!cache.exists());
            assert_eq!(fs::read(source.join("SKILL.md")).unwrap(), document);
            assert_eq!(fs::read(source.join("supporting.bin")).unwrap(), support);
            assert!(!e.home.join(".codex/skills").exists());
            untouched(&e, &project);
        }
    }
    #[cfg(unix)]
    #[test]
    fn original_use_prompt_retains_support_files_until_release_and_never_installs() {
        let (_f, e, source, cache, project) = fixture();
        fs::write(source.join("metadata.json"), "excluded").unwrap();
        fs::write(source.join(".git"), "gitdir: ../worktree-metadata\n").unwrap();
        for dir in ["__pycache__", "__pypackages__", "node_modules/pkg"] {
            fs::create_dir_all(source.join(dir)).unwrap();
            fs::write(source.join(dir).join("file.bin"), [4, 5]).unwrap();
        }
        for target in [global(), project.clone()] {
            let plan = prepare(
                &e,
                &cache,
                input(&e, source.to_str().unwrap(), target, None),
            )
            .unwrap();
            start(&e, &cache, &plan.id, false, false).unwrap();
            let s = wait(&cache, &plan.id, &["ready", "failed"]);
            assert_eq!(s.status.phase, "ready", "{:?}", s.status.error);
            assert!(s.status.verified);
            let directory = PathBuf::from(s.status.skill_directory.unwrap());
            assert_eq!(
                fs::read(directory.join("supporting.bin")).unwrap(),
                [0, 255, 1]
            );
            assert!(!directory.join("metadata.json").exists());
            assert_eq!(
                fs::read_to_string(directory.join(".git")).unwrap(),
                "gitdir: ../worktree-metadata\n"
            );
            assert!(!directory.join("__pycache__").exists());
            assert!(directory.join("node_modules/pkg/file.bin").is_file());
            let prompt = s.prompt.unwrap();
            assert!(prompt.contains("<SKILL.md>\n---\nname: fixture-skill"));
            assert!(prompt.contains(directory.to_str().unwrap()));
            untouched(&e, &project);
            release(&cache, &plan.id).unwrap();
            assert!(!directory.exists());
            assert!(source.join("supporting.bin").is_file());
            assert!(session(&cache, &plan.id, true).is_err());
        }
    }
    #[cfg(unix)]
    #[test]
    fn changed_node_modules_source_invalid_agents_and_foreign_cleanup_are_blocked() {
        let (_f, e, source, cache, project) = fixture();
        fs::create_dir_all(source.join("node_modules/pkg")).unwrap();
        fs::write(source.join("node_modules/pkg/file"), "one").unwrap();
        let plan = prepare(
            &e,
            &cache,
            input(&e, source.to_str().unwrap(), global(), None),
        )
        .unwrap();
        fs::write(source.join("node_modules/pkg/file"), "two").unwrap();
        assert!(start(&e, &cache, &plan.id, false, false)
            .err()
            .unwrap()
            .contains("Source changed after confirmation"));
        release(&cache, &plan.id).unwrap();
        let mut i = input(&e, source.to_str().unwrap(), project.clone(), None);
        i.agent = Some("hermes-agent".into());
        assert!(prepare(&e, &cache, i).is_err());
        assert!(release(&cache, "../../source").is_err());
        #[cfg(unix)]
        {
            let id = "123-456";
            std::os::unix::fs::symlink(&source, base(&cache).unwrap().join(id)).unwrap();
            assert!(release(&cache, id).is_err());
            fs::remove_file(cache.join(id)).unwrap();
        }
        assert!(source.join("SKILL.md").is_file());
        let plan = prepare(
            &e,
            &cache,
            input(&e, source.to_str().unwrap(), global(), None),
        )
        .unwrap();
        assert_eq!(cancel(&cache, &plan.id).unwrap().status.phase, "cancelled");
        // A delayed terminal launch must see the cancellation before the CLI runs.
        let path = root(&cache, &plan.id).unwrap();
        run_process(
            e.command(&e.node, &e.home)
                .arg(e.resources.join("run-upstream-use.mjs"))
                .arg(path.join("request.json")),
        )
        .unwrap();
        assert_eq!(
            wait(&cache, &plan.id, &["cancelled"]).status.phase,
            "cancelled"
        );
        release(&cache, &plan.id).unwrap();
        untouched(&e, &project);
    }
    #[cfg(unix)]
    fn fake_agent(e: &Engine, body: &str) {
        use std::os::unix::fs::PermissionsExt;
        let bin = e.home.join("bin");
        fs::create_dir_all(&bin).unwrap();
        let script = bin.join("fixture-agent.mjs");
        fs::write(&script, body).unwrap();
        let exec = bin.join("codex");
        fs::write(
            &exec,
            format!(
                "#!/bin/sh\nexec {} {} \"$@\"\n",
                quote(e.node.to_str().unwrap()),
                quote(script.to_str().unwrap())
            ),
        )
        .unwrap();
        fs::set_permissions(&exec, fs::Permissions::from_mode(0o700)).unwrap();
        for command in ["claude", "sarvam-code"] {
            fs::copy(&exec, bin.join(command)).unwrap();
        }
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn original_use_agent_has_tty_accepts_input_and_preserves_exit_status() {
        let (_f, e, source, cache, project) = fixture();
        fake_agent(&e,"import{writeFileSync}from'node:fs';import{createInterface}from'node:readline';writeFileSync(process.env.HOME+'/agent-start.json',JSON.stringify({args:process.argv.slice(2),inputTTY:!!process.stdin.isTTY,outputTTY:!!process.stdout.isTTY,cwd:process.cwd()}));const r=createInterface({input:process.stdin,output:process.stdout});r.once('line',line=>{writeFileSync(process.env.HOME+'/reply',line);r.close();process.exit(7);});");
        for agent in ["codex", "claude-code", "sarvam-code"] {
            let plan = prepare(
                &e,
                &cache,
                input(&e, source.to_str().unwrap(), project.clone(), Some(agent)),
            )
            .unwrap();
            let path = root(&cache, &plan.id).unwrap();
            let request: Request = read(&path.join("request.json")).unwrap();
            assert!(request.args.windows(2).any(|args|args[0] == "--agent" && args[1] == agent));
            let command = if agent == "claude-code" { "claude" } else { agent };
            assert_eq!(Path::new(request.agent_command.as_deref().unwrap()).file_name().and_then(|name|name.to_str()), Some(command));
            if agent != "codex" { continue; }

            let mut child = Command::new("/usr/bin/script")
                .args(["-q", "/dev/null"])
                .arg(path.join("Launch.command"))
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            let deadline = Instant::now() + Duration::from_secs(15);
            while !e.home.join("agent-start.json").exists() {
                assert!(Instant::now() < deadline);
                thread::sleep(Duration::from_millis(50));
            }
            use std::io::Write;
            child
                .stdin
                .as_mut()
                .unwrap()
                .write_all(b"fixture reply\n")
                .unwrap();
            while child.try_wait().unwrap().is_none() {
                assert!(Instant::now() < deadline);
                thread::sleep(Duration::from_millis(50));
            }
            let s = wait(&cache, &plan.id, &["failed", "exited"]);
            assert_eq!(s.status.phase, "failed");
            assert_eq!(s.status.exit_code, Some(7));
            assert!(s.status.verified && s.status.agent_started);
            let record: serde_json::Value =
                serde_json::from_slice(&fs::read(e.home.join("agent-start.json")).unwrap())
                    .unwrap();
            assert_eq!(record["inputTTY"], true);
            assert_eq!(record["outputTTY"], true);
            assert_eq!(record["args"].as_array().unwrap().len(), 1);
            assert_eq!(record["cwd"], plan.working_directory);
            assert_eq!(
                fs::read_to_string(e.home.join("reply")).unwrap(),
                "fixture reply"
            );
            untouched(&e, &project);
            release(&cache, &plan.id).unwrap();
        }
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn changed_materialization_never_launches_agent_and_stop_ends_descendants() {
        let (_f, e, source, cache, project) = fixture();
        fake_agent(&e,"import{writeFileSync}from'node:fs';import{spawn}from'node:child_process';writeFileSync(process.env.HOME+'/started','yes');process.on('SIGTERM',()=>{});spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setTimeout(()=>require('node:fs').writeFileSync(process.env.HOME+'/late','bad'),3500)\"],{stdio:'ignore'});setInterval(()=>{},1000);");
        let plan = prepare(
            &e,
            &cache,
            input(&e, source.to_str().unwrap(), project.clone(), Some("codex")),
        )
        .unwrap();
        fs::write(source.join("supporting.bin"), [9]).unwrap();
        // Simulate a source race after confirmation: the original CLI materializes
        // new bytes, but the bridge must reject them before invoking the real command.
        let path = root(&cache, &plan.id).unwrap();
        let out = run_process(
            e.command(&e.node, &e.home)
                .arg(e.resources.join("run-upstream-use.mjs"))
                .arg(path.join("request.json")),
        )
        .unwrap();
        assert!(!out.success || session(&cache, &plan.id, true).unwrap().status.phase == "failed");
        let s = wait(&cache, &plan.id, &["failed"]);
        assert!(!s.status.verified && !s.status.agent_started);
        assert!(!e.home.join("started").exists());
        release(&cache, &plan.id).unwrap();
        let plan = prepare(
            &e,
            &cache,
            input(&e, source.to_str().unwrap(), project.clone(), Some("codex")),
        )
        .unwrap();
        start(&e, &cache, &plan.id, false, false).unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        while !e.home.join("started").exists() {
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(50));
        }
        assert!(!session(&cache, &plan.id, false).unwrap().can_release);
        assert!(release(&cache, &plan.id).is_err());
        cancel(&cache, &plan.id).unwrap();
        let s = wait(&cache, &plan.id, &["cancelled"]);
        assert!(!group_alive(s.status.cli_pid));
        release(&cache, &plan.id).unwrap();
        thread::sleep(Duration::from_secs(4));
        assert!(!e.home.join("late").exists());
        fake_agent(&e,"import{spawn}from'node:child_process';const c=spawn(process.execPath,['-e',\"setTimeout(()=>require('node:fs').writeFileSync(process.env.HOME+'/continued','yes'),2000)\"],{stdio:'ignore'});c.unref();process.exit(0);");
        let plan = prepare(
            &e,
            &cache,
            input(&e, source.to_str().unwrap(), project.clone(), Some("codex")),
        )
        .unwrap();
        start(&e, &cache, &plan.id, false, false).unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let s = session(&cache, &plan.id, false).unwrap();
            if s.status.phase == "background" {
                assert!(!s.can_release);
                break;
            }
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(50));
        }
        let s = wait(&cache, &plan.id, &["exited", "failed"]);
        assert_eq!(s.status.phase, "exited");
        assert_eq!(fs::read_to_string(e.home.join("continued")).unwrap(), "yes");
        release(&cache, &plan.id).unwrap();
        untouched(&e, &project);
    }
    #[cfg(unix)]
    #[test]
    fn original_provider_use_keeps_map_files_and_zero_exit_without_preparation_fails() {
        let (f, mut e, _source, cache, project) = fixture();
        let server = crate::upstream::provider::tests::Server::new();
        server.legacy("fixture-skill", true);
        let plan = prepare(&e, &cache, input(&e, &server.url, global(), None)).unwrap();
        start(&e, &cache, &plan.id, false, false).unwrap();
        let s = wait(&cache, &plan.id, &["ready", "failed"]);
        assert_eq!(s.status.phase, "ready", "{:?}", s.status.error);
        let support = PathBuf::from(s.status.skill_directory.unwrap());
        assert!(support.join("metadata.json").is_file());
        assert_eq!(fs::read(support.join("data.bin")).unwrap(), [0, 255, 1]);
        release(&cache, &plan.id).unwrap();
        fn copy(from: &Path, to: &Path) {
            fs::create_dir_all(to).unwrap();
            for entry in fs::read_dir(from).unwrap() {
                let entry = entry.unwrap();
                if entry.path().is_dir() {
                    copy(&entry.path(), &to.join(entry.file_name()));
                } else {
                    fs::copy(entry.path(), to.join(entry.file_name())).unwrap();
                }
            }
        }
        let resources = f.0.join("noop");
        copy(&e.resources, &resources);
        fs::write(resources.join("skills/bin/cli.mjs"), "process.exit(0);").unwrap();
        e.resources = resources;
        let plan = prepare(&e, &cache, input(&e, &server.url, global(), None)).unwrap();
        start(&e, &cache, &plan.id, false, false).unwrap();
        let s = wait(&cache, &plan.id, &["failed"]);
        assert!(!s.status.verified);
        assert!(s.prompt.is_none());
        release(&cache, &plan.id).unwrap();
        untouched(&e, &project);
    }

    #[cfg(unix)]
    #[test]
    fn original_direct_download_use_preserves_support_and_never_creates_locks() {
        use crate::upstream::provider::tests::{archive, Server};
        let (_f, e, _source, cache, project) = fixture();
        let server = Server::new();
        server.put(
            "/opaque-download",
            archive(&e, "zip", "fixture-skill", false),
        );
        let url = format!("{}/opaque-download", server.url);
        let plan = prepare(&e, &cache, input(&e, &url, project.clone(), None)).unwrap();
        start(&e, &cache, &plan.id, false, false).unwrap();
        let session = wait(&cache, &plan.id, &["ready", "failed"]);
        assert_eq!(session.status.phase, "ready", "{:?}", session.status.error);
        assert_eq!(
            fs::read(
                Path::new(session.status.skill_directory.as_deref().unwrap()).join("binary.dat")
            )
            .unwrap(),
            [0, 255, 2]
        );
        assert!(session
            .prompt
            .as_deref()
            .unwrap()
            .contains("Supporting files"));
        release(&cache, &plan.id).unwrap();
        untouched(&e, &project);
    }
    #[cfg(unix)]
    #[test]
    fn original_git_use_accepts_openclaw_without_retired_flag_and_cleans_clone() {
        let (_f, e, source, cache, project) = fixture();
        let init = run_process(
            e.command(Path::new("git"), &source)
                .args(["init", "-q", "-b", "main"]),
        )
        .unwrap();
        assert!(init.success);
        for args in [
            vec!["add", "."],
            vec![
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "commit",
                "-qm",
                "source",
            ],
        ] {
            assert!(
                run_process(e.command(Path::new("git"), &source).args(args))
                    .unwrap()
                    .success
            );
        }
        fs::write(
            e.home.join(".gitconfig"),
            format!(
                "[url \"{}\"]\n    insteadOf = https://github.com/openclaw/use-fixture.git\n",
                crate::upstream::tests::file_url(&source)
            ),
        )
        .unwrap();
        let input = input(
            &e,
            "openclaw/use-fixture@fixture-skill",
            project.clone(),
            None,
        );
        let plan = prepare(&e, &cache, input).unwrap();
        assert!(!plan.risk_required);
        start(&e, &cache, &plan.id, false, false).unwrap();
        let s = wait(&cache, &plan.id, &["ready", "failed"]);
        assert_eq!(s.status.phase, "ready", "{:?}", s.status.error);
        let entries = fs::read_dir(root(&cache, &plan.id).unwrap().join("tmp"))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        let entries: Vec<_> = entries
            .iter()
            .filter(|entry| entry.file_name().to_string_lossy().starts_with("skills-"))
            .collect();
        assert_eq!(entries.len(), 1);
        assert!(entries[0]
            .file_name()
            .to_string_lossy()
            .starts_with("skills-use-"));
        let (_, request) = request(&cache, &plan.id).unwrap();
        assert!(!request
            .args
            .iter()
            .any(|a| a == "--dangerously-accept-openclaw-risks"));
        release(&cache, &plan.id).unwrap();
        untouched(&e, &project);
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn started_session_survives_history_list_permission_failure_and_retries() {
        let (_f, e, source, cache, project) = fixture();
        let plan = prepare(
            &e,
            &cache,
            input(&e, source.to_str().unwrap(), project.clone(), None),
        )
        .unwrap();
        start(&e, &cache, &plan.id, false, false).unwrap();
        let ready = wait(&cache, &plan.id, &["ready", "failed"]);
        assert_eq!(ready.status.phase, "ready", "{:?}", ready.status.error);
        let acl = "everyone deny list";
        assert!(Command::new("chmod")
            .args(["+a", &acl])
            .arg(&cache)
            .status()
            .unwrap()
            .success());
        let failed = list_sessions(&cache);
        let preserved = session(&cache, &plan.id, true);
        // Remove the temporary ACL before assertions or cleanup.
        assert!(Command::new("chmod")
            .args(["-a", &acl])
            .arg(&cache)
            .status()
            .unwrap()
            .success());
        assert!(
            failed.is_err(),
            "the history permission failure must actually occur"
        );
        let preserved = preserved.unwrap();
        assert_eq!(preserved.status.phase, "ready");
        assert!(preserved.prompt.is_some());
        assert!(list_sessions(&cache)
            .unwrap()
            .iter()
            .any(|item| item.plan.id == plan.id));
        release(&cache, &plan.id).unwrap();
        assert!(source.join("SKILL.md").is_file());
        untouched(&e, &project);
    }
}
