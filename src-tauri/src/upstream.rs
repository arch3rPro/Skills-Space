//! Desktop adaptation of the unmodified skills CLI. No installation logic lives here.
pub mod codex;
pub mod creation;
pub mod dependencies;
mod detection;
pub mod document_diff;
mod downloads;
pub mod dsh;
pub mod eve;
pub mod hermes;
pub mod inspection_session;
pub mod node_runtime;
pub mod pi;
pub mod pi_removal;
mod plugins;
mod progress;
pub mod project_sources;
mod provider;
use progress::InstallationProgress;
use tauri::ipc::{Channel, JavaScriptChannelId};
pub mod restoration;
pub mod skill_sync;
pub mod source_removal;
mod update_safety;
pub mod usage;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

static MUTATION: Mutex<()> = Mutex::new(());
pub(super) fn bundled_version(app: &AppHandle) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_slice(
        &fs::read(resource_directory(app)?.join("version.json")).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    value["version"]
        .as_str()
        .map(str::to_owned)
        .ok_or("Bundled CLI version is missing.".into())
}

const VERSION: &str = "1.7.4";

fn resource_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let bundled = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("resources/upstream");
    if bundled.is_dir() {
        Ok(bundled)
    } else if cfg!(debug_assertions) {
        Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/upstream"))
    } else {
        Err("Bundled upstream resources are missing.".into())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Target {
    pub host: String,
    pub scope: String,
    pub project_path: Option<String>,
}
impl Target {
    fn directory(&self, home: &Path) -> Result<PathBuf, String> {
        if self.host != "local" {
            return Err("Remote execution is not available in this release.".into());
        }
        match self.scope.as_str() {
            "global" if self.project_path.is_none() => Ok(home.to_path_buf()),
            "project" => {
                let path = PathBuf::from(
                    self.project_path
                        .as_deref()
                        .ok_or("Choose a project directory.")?,
                );
                if !path.is_absolute() || !path.is_dir() {
                    return Err("Project directory must be an existing absolute path.".into());
                }
                dunce::canonicalize(path).map_err(|e| e.to_string())
            }
            _ => Err("Invalid installation scope.".into()),
        }
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetectionPath {
    base: String,
    path: String,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentDefinition {
    id: String,
    name: String,
    project_path: String,
    global_base: Option<String>,
    global_path: String,
    detection_paths: Vec<DetectionPath>,
    detection_dependency: Option<String>,
    #[serde(default)]
    universal_visible: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    id: String,
    name: String,
    path: String,
    directory_exists: bool,
    // Original upstream signal: retained for lifecycle impact analysis.
    detected: bool,
    installation_status: detection::InstallationStatus,
    installation_evidence: Option<String>,
    shared_directory: bool,
    additional_paths: Vec<String>,
    subagents: Vec<String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    #[serde(default)]
    source_type: Option<String>,
    #[serde(default)]
    plugin_name: Option<String>,
    name: String,
    path: String,
    agents: Vec<String>,
    #[serde(default)]
    shared: bool,
    source: Option<String>,
    source_url: Option<String>,
    #[serde(default)]
    description: String,
    #[serde(default)]
    issue: Option<String>,
    #[serde(default)]
    updateable: bool,
    #[serde(default)]
    install_source: Option<String>,
    #[serde(default)]
    eve_locations: Vec<String>,
    #[serde(default)]
    cli_managed: bool,
    #[serde(default)]
    cli_agents: Vec<String>,
    #[serde(default)]
    hermes_origin: Option<String>,
    #[serde(default)]
    hermes_state: Option<hermes::SkillState>,
    #[serde(default)]
    pi_state: Option<pi::SkillState>,
    #[serde(default)]
    dsh_state: Option<dsh::SkillState>,
    #[serde(default)]
    codex_state: Option<codex::SkillState>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inventory {
    version: String,
    agents: Vec<Agent>,
    skills: Vec<Skill>,
    warnings: Vec<String>,
    dsh: Option<serde_json::Value>,
    codex: Option<codex::Snapshot>,
    pi: Option<pi::Snapshot>,
    hermes: Option<serde_json::Value>,
}

struct Engine {
    #[cfg(test)]
    test_trace: Option<PathBuf>,
    node: PathBuf,
    resources: PathBuf,
    home: PathBuf,
    isolated: bool,
    progress: Option<Channel<InstallationProgress>>,
}
#[derive(Clone)]
struct ProcessResult {
    success: bool,
    stdout: String,
    stderr: String,
}
fn capture(stream: impl Read) -> String {
    capture_with_limit(stream, 2 * 1024 * 1024)
}
fn capture_with_limit(mut stream: impl Read, limit: usize) -> String {
    let mut captured = Vec::new();
    let mut buf = [0u8; 8192];
    while let Ok(count) = stream.read(&mut buf) {
        if count == 0 {
            break;
        }
        let remaining = limit.saturating_sub(captured.len());
        captured.extend_from_slice(&buf[..count.min(remaining)]);
    }
    String::from_utf8_lossy(&captured).into_owned()
}
fn terminate_process(child: &mut std::process::Child) {
    #[cfg(unix)]
    {
        let _ = Command::new("kill")
            .args(["-KILL", &format!("-{}", child.id())])
            .status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}
fn run_process(command: &mut Command) -> Result<ProcessResult, String> {
    run_process_with_timeout(command, Duration::from_secs(120))
}
fn run_process_with_timeout(
    command: &mut Command,
    timeout: Duration,
) -> Result<ProcessResult, String> {
    run_process_with_progress(command, timeout, None)
}
fn run_process_with_progress(
    command: &mut Command,
    timeout: Duration,
    progress: Option<Channel<InstallationProgress>>,
) -> Result<ProcessResult, String> {
    run_process_with_output_limit(command, timeout, progress, 2 * 1024 * 1024)
}
fn run_process_with_output_limit(
    command: &mut Command,
    timeout: Duration,
    progress: Option<Channel<InstallationProgress>>,
    stdout_limit: usize,
) -> Result<ProcessResult, String> {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("Cannot capture stdout.")?;
    let stderr = child.stderr.take().ok_or("Cannot capture stderr.")?;
    let (send, receive) = std::sync::mpsc::channel();
    let out = send.clone();
    thread::spawn(move || {
        let _ = out.send((true, capture_with_limit(stdout, stdout_limit)));
    });
    thread::spawn(move || {
        let output = match progress {
            Some(channel) => progress::capture_progress(stderr, channel),
            None => capture(stderr),
        };
        let _ = send.send((false, output));
    });
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {}
            Err(error) => {
                terminate_process(&mut child);
                return Err(error.to_string());
            }
        }
        if Instant::now() >= deadline {
            terminate_process(&mut child);
            return Err("Operation timed out. Refresh actual state before retrying.".into());
        }
        thread::sleep(Duration::from_millis(25));
    };
    let mut result = ProcessResult {
        success: status.success(),
        stdout: String::new(),
        stderr: String::new(),
    };
    for _ in 0..2 {
        match receive.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
            Ok((true, output)) => result.stdout = output,
            Ok((false, output)) => result.stderr = output,
            Err(_) => {
                terminate_process(&mut child);
                return Err(
                    "Output capture timed out. Refresh actual state before retrying.".into(),
                );
            }
        }
    }
    Ok(result)
}
impl Engine {
    fn from_app(app: &AppHandle) -> Result<Self, String> {
        let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
            .map(PathBuf::from)
            .ok_or("Home directory unavailable.")?;
        #[cfg(windows)]
        let home = dunce::canonicalize(home).map_err(|e| e.to_string())?;
        let resources = resource_directory(app)?;
        let node = node_runtime::resolve(app)?;
        Ok(Self {
            #[cfg(test)]
            test_trace: None,
            node,
            resources,
            home,
            isolated: false,
            progress: None,
        })
    }
    fn command(&self, program: &Path, directory: &Path) -> Command {
        let mut command = Command::new(program);
        #[cfg(test)]
        if let Some(trace) = &self.test_trace {
            command.env("GIT_TRACE", trace);
        }
        command
            .current_dir(directory)
            .env("DISABLE_TELEMETRY", "1")
            .env("GIT_TERMINAL_PROMPT", "0");
        // Child tools using `env node` must use the runtime selected by the App,
        // including when a Finder launch has no developer tools in PATH.
        if let Some(directory) = self.node.parent() {
            let mut paths = vec![directory.to_path_buf()];
            if let Some(path) = std::env::var_os("PATH") {
                paths.extend(std::env::split_paths(&path));
            }
            if let Ok(path) = std::env::join_paths(paths) {
                command.env("PATH", path);
            }
        }
        if self.isolated {
            for key in [
                "CODEX_HOME",
                "GH_HOST",
                "CLAUDE_CONFIG_DIR",
                "VIBE_HOME",
                "HERMES_HOME",
                "PI_CODING_AGENT_DIR",
                "DSH_HOME",
                "DSH_AGENTS_HOME",
                "AUTOHAND_HOME",
                "GROK_HOME",
                "SARVAM_HOME",
                "XDG_CONFIG_HOME",
                "XDG_STATE_HOME",
            ] {
                command.env_remove(key);
            }
            command
                .env("HOME", &self.home)
                .env("USERPROFILE", &self.home);
        }
        command
    }
    fn cli(&self, args: &[String], target: &Target) -> Result<ProcessResult, String> {
        self.cli_with_internal(args, target, false)
    }
    fn cli_with_internal(
        &self,
        args: &[String],
        target: &Target,
        internal_update: bool,
    ) -> Result<ProcessResult, String> {
        let directory = target.directory(&self.home)?;
        let mut command = self.command(&self.node, &directory);
        // The GUI is not the coding Agent that launched it. These pinned upstream
        // context signals would otherwise silently narrow an update's target Agents.
        for key in [
            "AI_AGENT",
            "CURSOR_TRACE_ID",
            "CURSOR_AGENT",
            "CURSOR_EXTENSION_HOST_ROLE",
            "GEMINI_CLI",
            "CODEX_SANDBOX",
            "CODEX_CI",
            "CODEX_THREAD_ID",
            "ANTIGRAVITY_AGENT",
            "AUGMENT_AGENT",
            "OPENCODE_CLIENT",
            "CLAUDECODE",
            "CLAUDE_CODE",
            "CLAUDE_CODE_IS_COWORK",
            "REPL_ID",
            "COPILOT_MODEL",
            "COPILOT_ALLOW_ALL",
            "COPILOT_GITHUB_TOKEN",
        ] {
            command.env_remove(key);
        }
        // Inventory must include installed internal documents. Only a verified internal
        // update opts into upstream's internal discovery; ambient flags never broaden writes.
        if args
            .first()
            .is_some_and(|arg| arg == "list" || arg == "update" && internal_update)
        {
            command.env("INSTALL_INTERNAL_SKILLS", "1");
        } else {
            command.env_remove("INSTALL_INTERNAL_SKILLS");
        }
        command
            .arg(self.resources.join("skills/bin/cli.mjs"))
            .args(dsh::cli_args(args));
        if args.first().is_some_and(|arg| arg == "add") {
            run_process_with_progress(
                &mut command,
                Duration::from_secs(120),
                self.progress.clone(),
            )
        } else {
            run_process(&mut command)
        }
    }
    fn agents(&self, target: &Target) -> Result<Vec<Agent>, String> {
        let directory = target.directory(&self.home)?;
        let definitions: Vec<AgentDefinition> = serde_json::from_slice(
            &fs::read(self.resources.join("agents.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        for agent in definitions {
            let mut additional_paths = Vec::new();
            let path = if target.scope == "project" {
                directory.join(&agent.project_path)
            } else {
                let Some(base) = agent.global_base.as_deref() else {
                    continue;
                };
                let base = match base {
                    "home" => self.home.clone(),
                    "configHome" => self.env_home("XDG_CONFIG_HOME", ".config"),
                    "codexHome" => self.env_home("CODEX_HOME", ".codex"),
                    "claudeHome" => self.env_home("CLAUDE_CONFIG_DIR", ".claude"),
                    "vibeHome" => self.env_home("VIBE_HOME", ".vibe"),
                    "hermesHome" => self.env_home("HERMES_HOME", ".hermes"),
                    "autohandHome" => self.env_home("AUTOHAND_HOME", ".autohand"),
                    "grokHome" => self.env_home("GROK_HOME", ".grok"),
                    "sarvamHome" => self.env_home("SARVAM_HOME", ".sarvam"),
                    "openclaw" => [".openclaw", ".clawdbot", ".moltbot"]
                        .iter()
                        .find(|part| self.home.join(part).exists())
                        .map(|part| self.home.join(part))
                        .unwrap_or_else(|| self.home.join(".openclaw")),
                    _ => return Err(format!("Unsupported upstream path base: {base}")),
                };
                // getAgentBaseDir overrides globalSkillsDir for universal Agents.
                if agent.project_path == ".agents/skills" {
                    let legacy = base.join(&agent.global_path);
                    if legacy != self.home.join(".agents/skills") && legacy.is_dir() {
                        additional_paths.push(legacy.to_string_lossy().into_owned());
                    }
                    self.home.join(".agents/skills")
                } else {
                    base.join(&agent.global_path)
                }
            };
            if agent.id == "fx" {
                let legacy = directory.join(".fx/skills");
                if legacy.is_dir() {
                    additional_paths.push(legacy.to_string_lossy().into_owned());
                }
            }
            let detected = agent.detection_paths.iter().any(|probe| {
                let base = match probe.base.as_str() {
                    "home" => self.home.clone(),
                    "cwd" => directory.clone(),
                    "absolute" => PathBuf::new(),
                    "configHome" => self.env_home("XDG_CONFIG_HOME", ".config"),
                    "codexHome" => self.env_home("CODEX_HOME", ".codex"),
                    "claudeHome" => self.env_home("CLAUDE_CONFIG_DIR", ".claude"),
                    "vibeHome" => self.env_home("VIBE_HOME", ".vibe"),
                    "hermesHome" => self.env_home("HERMES_HOME", ".hermes"),
                    "autohandHome" => self.env_home("AUTOHAND_HOME", ".autohand"),
                    "grokHome" => self.env_home("GROK_HOME", ".grok"),
                    "sarvamHome" => self.env_home("SARVAM_HOME", ".sarvam"),
                    "zedAppDataHome" if !self.isolated => match std::env::var_os("APPDATA") {
                        Some(value) => PathBuf::from(value),
                        None => return false,
                    },
                    "zedFlatpakConfigHome" if !self.isolated => {
                        match std::env::var_os("FLATPAK_XDG_CONFIG_HOME") {
                            Some(value) => PathBuf::from(value),
                            None => return false,
                        }
                    }
                    _ => return false,
                };
                base.join(&probe.path).exists()
            }) && agent
                .detection_dependency
                .as_ref()
                .is_none_or(|dependency| {
                    fs::read(directory.join("package.json"))
                        .ok()
                        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
                        .is_some_and(|package| {
                            !package["dependencies"][dependency].is_null()
                                || !package["devDependencies"][dependency].is_null()
                        })
                });
            let subagents = if agent.id == "eve" && target.scope == "project" {
                eve::subagents(&directory)?
            } else {
                Vec::new()
            };
            for name in &subagents {
                additional_paths.push(
                    directory
                        .join("agent/subagents")
                        .join(name)
                        .join("skills")
                        .to_string_lossy()
                        .into_owned(),
                );
            }
            let (mut installation_status, mut installation_evidence) = detection::inspect_agent(
                &agent.id,
                &agent.name,
                &self.home,
                self.isolated,
                detected,
            );
            if let Some(dependency) = agent.detection_dependency.as_deref() {
                if let Some(evidence) = detection::dependency_evidence(&directory, dependency) {
                    installation_status = detection::InstallationStatus::Confirmed;
                    installation_evidence = Some(evidence);
                }
            }
            let shared_directory = agent.project_path == ".agents/skills";
            result.push(Agent {
                id: agent.id,
                name: agent.name,
                directory_exists: path.is_dir(),
                detected,
                installation_status,
                installation_evidence,
                shared_directory,
                path: path.to_string_lossy().into_owned(),
                additional_paths,
                subagents,
            });
        }
        result.push(dsh::agent(self, target)?);
        Ok(result)
    }
    fn env_home(&self, name: &str, fallback: &str) -> PathBuf {
        if !self.isolated {
            if let Ok(value) = std::env::var(name) {
                if !value.trim().is_empty() {
                    return PathBuf::from(value.trim());
                }
            }
        }
        self.home.join(fallback)
    }
    fn inventory(&self, target: &Target) -> Result<Inventory, String> {
        self.inventory_context(target, None)
    }
    fn inventory_context(
        &self,
        target: &Target,
        dsh_context_key: Option<&str>,
    ) -> Result<Inventory, String> {
        let execution_directory = target.directory(&self.home)?;
        let mut args = vec!["list".into(), "--json".into()];
        if target.scope == "global" {
            args.push("--global".into());
        }
        let output = self.cli(&args, target)?;
        if !output.success {
            return Err(format!("Upstream list failed: {}", output.stderr));
        }
        let listed: Vec<Skill> = serde_json::from_str(&output.stdout)
            .map_err(|e| format!("Unsupported upstream list response: {e}"))?;
        let mut agents = self.agents(target)?;
        let mut warnings = Vec::new();
        let hermes_config = if target.scope == "global" {
            hermes::configuration(self)?
        } else {
            hermes::Configuration::default()
        };
        warnings.extend(hermes_config.warnings.clone());
        if let Some(agent) = agents.iter_mut().find(|agent| agent.id == "hermes-agent") {
            agent
                .additional_paths
                .extend(hermes_config.directories.clone());
        }
        let mut discovered = BTreeMap::<(String, String), Vec<PathBuf>>::new();
        let mut observed = BTreeMap::<(String, String), Skill>::new();
        let mut documents = std::collections::BTreeSet::new();
        for agent in agents.iter().filter(|agent| agent.id != dsh::ID) {
            for directory in std::iter::once(&agent.path).chain(&agent.additional_paths) {
                let paths = if agent.id == "hermes-agent" {
                    hermes::paths(Path::new(directory), &mut warnings)
                } else {
                    match fs::read_dir(directory) {
                        Ok(entries) => entries.flatten().map(|entry| entry.path()).collect(),
                        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
                        Err(e) => {
                            warnings.push(format!("{directory}: {e}"));
                            Vec::new()
                        }
                    }
                };
                for path in &paths {
                    if path.join("SKILL.md").is_file() {
                        documents.insert(path.to_string_lossy().into_owned());
                    }
                }
                discovered.insert((agent.id.clone(), directory.clone()), paths);
            }
        }
        let mut metadata = self.documents(&documents.into_iter().collect::<Vec<_>>())?;
        let lock = self.lock(target)?;
        eve::inventory_documents(self, &agents, &lock, &mut metadata, &mut warnings)?;
        let shared_root = target.directory(&self.home)?.join(".agents/skills");
        // Inspect real Agent paths: upstream list merges same-name skills and reports display names.
        for agent in agents.iter().filter(|agent| agent.id != dsh::ID) {
            for directory in std::iter::once(&agent.path).chain(&agent.additional_paths) {
                for path in discovered
                    .get(&(agent.id.clone(), directory.clone()))
                    .into_iter()
                    .flatten()
                {
                    if !path.is_dir() {
                        if path.is_symlink() {
                            warnings.push(format!("Broken link: {}", path.display()));
                        }
                        continue;
                    }
                    let key = path.to_string_lossy();
                    let Some(document) = metadata.get(key.as_ref()) else {
                        continue;
                    };
                    let (Some(name), Some(description)) = (&document.name, &document.description)
                    else {
                        warnings.push(format!(
                            "{}: {}",
                            path.display(),
                            document.error.as_deref().unwrap_or("Invalid metadata")
                        ));
                        continue;
                    };
                    let (name, description) = (name.clone(), description.clone());
                    let canonical = dunce::canonicalize(&path)
                        .map_err(|e| e.to_string())?
                        .to_string_lossy()
                        .into_owned();
                    let source = listed.iter().find(|skill| {
                        skill.name == name
                            && dunce::canonicalize(&skill.path)
                                .ok()
                                .is_some_and(|candidate| candidate.to_string_lossy() == canonical)
                    });
                    let skill = observed
                        .entry((name.clone(), canonical.clone()))
                        .or_insert_with(|| Skill {
                            source_type: None,
                            plugin_name: None,
                            name,
                            path: canonical,
                            agents: Vec::new(),
                            shared: false,
                            source: source.and_then(|s| s.source.clone()),
                            source_url: source.and_then(|s| s.source_url.clone()),
                            description,
                            issue: None,
                            updateable: false,
                            install_source: None,
                            eve_locations: Vec::new(),
                            cli_managed: false,
                            cli_agents: Vec::new(),
                            hermes_origin: None,
                            hermes_state: None,
                            pi_state: None,
                            dsh_state: None,
                            codex_state: None,
                        });
                    // Extra Hermes roots/categories are visible inventory, not CLI installation targets.
                    let cli_path = path.parent() == Some(Path::new(directory))
                        && (!matches!(agent.id.as_str(), "hermes-agent" | "fx")
                            || directory == &agent.path);
                    if cli_path && !skill.cli_agents.contains(&agent.id) {
                        skill.cli_agents.push(agent.id.clone());
                    }
                    if agent.id == "hermes-agent" {
                        let origin = if directory != &agent.path {
                            "external"
                        } else if target.scope == "global"
                            && skill.source.is_none()
                            && hermes_config.bundled.contains(&skill.name)
                        {
                            "builtin"
                        } else {
                            "local"
                        };
                        if skill.hermes_origin.is_none() || origin == "builtin" {
                            skill.hermes_origin = Some(origin.into());
                        }
                    }
                    // Only a physical entry in the canonical store implies shared availability.
                    // A symlink in an Agent-specific folder remains a separate association.
                    skill.shared |= Path::new(directory) == shared_root;
                    if !skill.agents.contains(&agent.id) {
                        skill.agents.push(agent.id.clone());
                    }
                    if agent.id == "eve" {
                        let slot = if directory == &agent.path {
                            "root".to_string()
                        } else {
                            Path::new(directory)
                                .parent()
                                .and_then(|p| p.file_name())
                                .map(|s| s.to_string_lossy().into_owned())
                                .unwrap_or_default()
                        };
                        if !skill.eve_locations.contains(&slot) {
                            skill.eve_locations.push(slot);
                        }
                    }
                }
            }
        }
        for skill in observed.values_mut() {
            if skill.agents.contains(&"eve".into()) && skill.source.is_none() {
                if eve::recorded_path(target, &self.home, &skill.name, &skill.path, &lock) {
                    skill.source = lock["skills"][&skill.name]["source"]
                        .as_str()
                        .map(str::to_owned);
                    skill.source_url = lock["skills"][&skill.name]["sourceUrl"]
                        .as_str()
                        .map(str::to_owned);
                }
            }
            if skill.source.is_none() && !skill.cli_agents.is_empty() {
                if let Some(record) = listed.iter().find(|record| {
                    record.name == skill.name
                        && record.source.is_some()
                        && tree_signature(Path::new(&record.path)).is_some_and(|signature| {
                            tree_signature(Path::new(&skill.path)).as_ref() == Some(&signature)
                        })
                }) {
                    skill.source = record.source.clone();
                    skill.source_url = record.source_url.clone();
                }
            }
        }
        for mut skill in listed {
            if !observed
                .values()
                .any(|existing| existing.name == skill.name)
            {
                skill.agents = skill
                    .agents
                    .iter()
                    .filter_map(|name| {
                        agents
                            .iter()
                            .find(|agent| &agent.name == name)
                            .map(|agent| agent.id.clone())
                    })
                    .collect();
                skill.issue = Some("Metadata or per-target identity could not be fully inspected; this record comes from upstream list.".into());
                skill.description = metadata
                    .get(&skill.path)
                    .and_then(|doc| doc.description.clone())
                    .unwrap_or_default();
                observed.insert((skill.name.clone(), skill.path.clone()), skill);
            }
        }
        let lock = self.lock(target)?;
        for skill in observed.values_mut() {
            if skill.cli_agents.is_empty() {
                skill.source = None;
                skill.source_url = None;
                continue;
            }
            let entry = &lock["skills"][&skill.name];
            skill.cli_managed = skill.source.is_some() && entry.is_object();
            skill.source_type = entry["sourceType"].as_str().map(str::to_owned);
            skill.plugin_name = entry["pluginName"].as_str().map(str::to_owned);
            skill.install_source = entry["sourceUrl"]
                .as_str()
                .or_else(|| entry["source"].as_str())
                .filter(|source| !source.is_empty())
                .map(|source| {
                    let source =
                        if entry["sourceType"] == "local" && !Path::new(source).is_absolute() {
                            execution_directory
                                .join(source)
                                .to_string_lossy()
                                .into_owned()
                        } else {
                            source.to_owned()
                        };
                    match entry["ref"].as_str() {
                        Some(reference) => format!("{source}#{reference}"),
                        None => source,
                    }
                });
            if skill.source_type.as_deref() == Some("well-known") {
                skill.install_source = provider::reinstall_source(entry);
            }
            skill.updateable = skill.source.is_some()
                && (entry["sourceType"] == "well-known"
                    && entry["wellKnownDigest"].is_string()
                    && provider::reinstall_source(entry).is_some()
                    && !skill.agents.iter().any(|a| a == "eve")
                    || entry["skillPath"].as_str().is_some_and(|p| !p.is_empty())
                        && matches!(
                            entry["sourceType"].as_str(),
                            Some("github" | "gitlab" | "git")
                        )
                        && (target.scope == "project"
                            || entry["skillFolderHash"]
                                .as_str()
                                .is_some_and(|h| !h.is_empty())));
        }
        let mut inventory = Inventory {
            version: VERSION.into(),
            agents,
            skills: observed.into_values().collect(),
            warnings,
            dsh: None,
            codex: None,
            pi: None,
            hermes: None,
        };
        // Independent read-only probes run together; preserve the original merge
        // order so shared skill ownership and Agent-specific metadata stay intact.
        let (hermes_read, pi_read, codex_read, dsh_read) = std::thread::scope(|scope| {
            let hermes = scope.spawn(|| {
                self.resources
                    .join("inspect-hermes-config.mjs")
                    .is_file()
                    .then(|| hermes::inspect(self, target))
            });
            let pi = scope.spawn(|| {
                self.resources
                    .join("inspect-pi-skills.mjs")
                    .is_file()
                    .then(|| pi::inspect(self, target))
            });
            let codex = scope.spawn(|| codex::read_snapshot(self, target));
            let dsh = scope.spawn(|| dsh::inspect_context(self, target, dsh_context_key));
            Ok::<_, String>((
                hermes
                    .join()
                    .map_err(|_| "Hermes inspection stopped unexpectedly.")?,
                pi.join()
                    .map_err(|_| "Pi inspection stopped unexpectedly.")?,
                codex
                    .join()
                    .map_err(|_| "Codex inspection stopped unexpectedly.")?,
                dsh.join()
                    .map_err(|_| "DSH inspection stopped unexpectedly.")?,
            ))
        })?;
        if let Some(value) = hermes_read {
            hermes::augment_observed(self, target, &mut inventory, value);
        }
        if let Some(value) = pi_read {
            pi::augment_observed(self, target, &mut inventory, value);
        }
        codex::augment_observed(self, target, &mut inventory, codex_read);
        dsh::augment_observed(&mut inventory, dsh_read);
        skill_sync::augment(self, target, &mut inventory);
        Ok(inventory)
    }
}

#[derive(Deserialize)]
struct DocumentMetadata {
    path: String,
    name: Option<String>,
    description: Option<String>,
    #[serde(default)]
    internal: bool,
    hash: Option<String>,
    error: Option<String>,
}
#[derive(Deserialize)]
struct CodexDocumentMetadata {
    #[serde(default)]
    #[serde(rename = "allowImplicitInvocation")]
    allow_implicit_invocation: Option<bool>,
    #[serde(flatten)]
    document: DocumentMetadata,
    #[serde(default)]
    interface: serde_json::Value,
}
impl Engine {
    fn codex_documents(
        &self,
        paths: &[String],
    ) -> Result<BTreeMap<String, CodexDocumentMetadata>, String> {
        let mut command = self.command(&self.node, &self.home);
        command
            .arg(self.resources.join("inspect-skill-documents.mjs"))
            .arg(serde_json::to_string(paths).map_err(|e| e.to_string())?)
            .arg("--metadata-only");
        let output = run_process(&mut command)?;
        if !output.success {
            return Err(output.stderr);
        }
        let documents: Vec<CodexDocumentMetadata> =
            serde_json::from_str(&output.stdout).map_err(|e| e.to_string())?;
        Ok(documents
            .into_iter()
            .map(|d| (d.document.path.clone(), d))
            .collect())
    }
    fn documents(&self, paths: &[String]) -> Result<BTreeMap<String, DocumentMetadata>, String> {
        let mut command = self.command(&self.node, &self.home);
        command
            .arg(self.resources.join("inspect-skill-documents.mjs"))
            .arg(serde_json::to_string(paths).map_err(|e| e.to_string())?);
        let output = run_process(&mut command)?;
        if !output.success {
            return Err(format!("Cannot inspect skill documents: {}", output.stderr));
        }
        let documents: Vec<DocumentMetadata> =
            serde_json::from_str(&output.stdout).map_err(|e| e.to_string())?;
        Ok(documents
            .into_iter()
            .map(|document| (document.path.clone(), document))
            .collect())
    }
    fn lock(&self, target: &Target) -> Result<serde_json::Value, String> {
        let path = if target.scope == "global" {
            let state = self.env_home("XDG_STATE_HOME", ".agents");
            state.join(
                if !self.isolated
                    && std::env::var("XDG_STATE_HOME").is_ok_and(|v| !v.trim().is_empty())
                {
                    "skills/.skill-lock.json"
                } else {
                    ".skill-lock.json"
                },
            )
        } else {
            target.directory(&self.home)?.join("skills-lock.json")
        };
        match fs::read(path) {
            Ok(bytes) => {
                let value: serde_json::Value = serde_json::from_slice(&bytes)
                    .map_err(|e| format!("Cannot inspect lockfile: {e}"))?;
                if value
                    .get("version")
                    .is_some_and(|version| version != if target.scope == "global" { 3 } else { 1 })
                {
                    return Err("Unsupported upstream lock schema version. Update checking was not started.".into());
                }
                Ok(value)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                Ok(serde_json::json!({"skills":{}}))
            }
            Err(e) => Err(e.to_string()),
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SourceSkill {
    #[serde(skip)]
    use_signature: Option<Vec<u8>>,
    #[serde(skip)]
    download_source: Option<String>,
    #[serde(skip)]
    download_digest: Option<String>,
    download_url: Option<String>,
    file_count: Option<usize>,
    plugin_name: Option<String>,
    selection_fingerprint: Option<String>,
    internal: bool,
    name: String,
    description: String,
    path: String,
    content: String,
    #[serde(skip)]
    signature: Option<Vec<u8>>,
    fingerprint: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inspection {
    #[serde(skip_serializing_if = "Option::is_none")]
    session_id: Option<String>,
    provider: bool,
    source: String,
    skill_filter: Option<String>,
    skills: Vec<SourceSkill>,
    warnings: Vec<String>,
}
struct TemporaryDirectory(PathBuf);
impl TemporaryDirectory {
    fn new() -> Result<Self, String> {
        // Clock readings can repeat between parallel update inspections on macOS.
        static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let sequence = SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "skills-space-read-{}-{stamp}-{sequence}",
            std::process::id()
        ));
        fs::create_dir(&path).map_err(|e| e.to_string())?;
        let path = dunce::canonicalize(path).map_err(|e| e.to_string())?;
        Ok(Self(path))
    }
}
impl Drop for TemporaryDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParsedSource {
    owner_repo: Option<String>,
    #[serde(rename = "type")]
    source_type: String,
    url: String,
    local_path: Option<String>,
    #[serde(rename = "ref")]
    reference: Option<String>,
    subpath: Option<String>,
    skill_filter: Option<String>,
}
fn parsed_source(engine: &Engine, source: &str) -> Result<ParsedSource, String> {
    if source.is_empty()
        || source.len() > 8192
        || source.starts_with('-')
        || source.chars().any(char::is_control)
    {
        return Err("Enter a valid skill source.".into());
    }
    // Upstream may normalize a GitHub URL and discard its original userinfo/query.
    // Reject secrets on the supplied URL before inspecting the normalized repository.
    let mut supplied = source;
    while let Some(next) = supplied
        .strip_prefix("github:")
        .or_else(|| supplied.strip_prefix("gitlab:"))
    {
        supplied = next;
    }
    if reqwest::Url::parse(supplied).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https")
            && (!url.username().is_empty() || url.password().is_some() || url.query().is_some())
    }) {
        return Err("Credential-bearing or query URLs cannot be previewed. Use your Git credential configuration.".into());
    }
    let output = run_process(
        engine
            .command(&engine.node, &engine.home)
            .arg(engine.resources.join("inspect-upstream-source.mjs"))
            .arg(source),
    )?;
    if !output.success {
        return Err("Could not parse this source reliably. Review its syntax.".into());
    }
    let parsed: ParsedSource =
        serde_json::from_str(&output.stdout).map_err(|_| "Unsupported source parser response.")?;
    if parsed.skill_filter.as_ref().is_some_and(|s| {
        s.is_empty() || s == "*" || s.starts_with('-') || s.chars().any(char::is_control)
    }) {
        return Err(
            "Choose an explicit skill filter; wildcards are unavailable in source preview.".into(),
        );
    }
    if parsed
        .reference
        .as_ref()
        .is_some_and(|r| r.is_empty() || r.starts_with('-') || r.chars().any(char::is_control))
    {
        return Err("Invalid Git reference.".into());
    }
    Ok(parsed)
}
fn parsed_git_location(parsed: &ParsedSource) -> Result<GitSource, String> {
    if !matches!(parsed.source_type.as_str(), "github" | "gitlab" | "git") {
        return Err(
            "This source cannot be reliably previewed. Use its original installation instructions."
                .into(),
        );
    }
    if parsed.url.contains('#') {
        return Err("This fragment form cannot be reliably previewed.".into());
    }
    validate_git_url(&parsed.url)?;
    Ok(GitSource {
        url: parsed.url.clone(),
        reference: parsed.reference.clone(),
    })
}
#[derive(Clone)]
struct GitSource {
    url: String,
    reference: Option<String>,
}
// This is only a URL/protocol safety boundary. Source semantics belong to upstream.
fn validate_git_url(input: &str) -> Result<(), String> {
    if input.chars().any(char::is_control) || input.starts_with('-') {
        return Err("Invalid repository URL.".into());
    }
    if input.starts_with("git@") && input.contains(':') {
        return Ok(());
    }
    let url = reqwest::Url::parse(input).map_err(|_| "Unsupported repository URL.")?;
    if (!url.username().is_empty() && url.scheme() != "ssh")
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Credential-bearing or query URLs cannot be previewed. Use your Git credential configuration.".into());
    }
    if !matches!(url.scheme(), "https" | "http" | "ssh" | "git" | "file") {
        return Err("Unsupported repository protocol.".into());
    }
    if matches!(url.host_str(), Some("github.com" | "gitlab.com"))
        || url.path().ends_with(".git")
        || matches!(url.scheme(), "ssh" | "git" | "file")
    {
        return Ok(());
    }
    Err(
        "This source cannot be reliably previewed. Use its original installation instructions."
            .into(),
    )
}
fn clone_repository(engine: &Engine, location: &GitSource) -> Result<TemporaryDirectory, String> {
    engine.report_installation("cloning", 0, 0);
    let temp = TemporaryDirectory::new()?;
    let mut command = engine.command(Path::new("git"), &engine.home);
    command.args(["-c", "core.hooksPath=/dev/null", "clone", "--depth", "1"]);
    if engine.progress.is_some() {
        command.arg("--progress");
    }
    if let Some(reference) = &location.reference {
        command.arg("--branch").arg(reference);
    }
    command
        .arg("--")
        .arg(&location.url)
        .arg(temp.0.join("repo"));
    let output = run_process_with_progress(
        &mut command,
        Duration::from_secs(120),
        engine.progress.clone(),
    )?;
    if !output.success {
        return Err(format!("Cannot inspect repository: {}", output.stderr));
    }
    Ok(temp)
}
fn contained_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative);
    if path.is_absolute()
        || path
            .components()
            .any(|part| !matches!(part, std::path::Component::Normal(_)))
    {
        return Err("Invalid source subdirectory.".into());
    }
    let canonical = dunce::canonicalize(root.join(path)).map_err(|e| e.to_string())?;
    if !canonical.starts_with(dunce::canonicalize(root).map_err(|e| e.to_string())?) {
        return Err("Source path escapes the repository.".into());
    }
    Ok(canonical)
}
// Bounded, read-only byte comparison. Unknown trees never count as verified installs.
fn tree_signature(root: &Path) -> Option<Vec<u8>> {
    bounded_signature(root, false)
}
// Upstream copyDirectory omits metadata.json and Python cache directories at every depth.
// Filter only the source expectation; actual installed/unrelated content remains fully observed.
fn source_install_signature(root: &Path) -> Option<Vec<u8>> {
    bounded_signature(root, true)
}
// Relative paths in source metadata and signatures use a portable separator.
fn relative_path_text(path: &Path) -> String {
    path.components()
        .map(|part| part.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}
fn bounded_signature(root: &Path, source: bool) -> Option<Vec<u8>> {
    signature_profile(root, if source { 1 } else { 0 })
}
const MAX_SKILL_CONTENT_BYTES: usize = 16 * 1024 * 1024;
fn signature_profile(root: &Path, profile: u8) -> Option<Vec<u8>> {
    fn visit(
        root: &Path,
        path: &Path,
        result: &mut Vec<u8>,
        count: &mut usize,
        profile: u8,
    ) -> Option<()> {
        let mut entries = fs::read_dir(path)
            .ok()?
            .collect::<Result<Vec<_>, _>>()
            .ok()?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let kind = entry.file_type().ok()?;
            if (profile < 2 || profile == 2 && kind.is_dir()) && entry.file_name() == ".git"
                || profile < 2 && entry.file_name() == "node_modules"
            {
                continue;
            }
            *count += 1;
            if *count > 2000 {
                return None;
            }
            if matches!(profile, 1 | 2)
                && (entry.file_name() == "metadata.json"
                    || kind.is_dir()
                        && matches!(
                            entry.file_name().to_str(),
                            Some("__pycache__" | "__pypackages__")
                        ))
            {
                continue;
            }
            if kind.is_symlink() {
                return None;
            }
            if kind.is_dir() {
                visit(root, &entry.path(), result, count, profile)?;
            } else if kind.is_file() {
                if usize::try_from(entry.metadata().ok()?.len()).ok()? > MAX_SKILL_CONTENT_BYTES {
                    return None;
                }
                let name = relative_path_text(entry.path().strip_prefix(root).ok()?);
                let bytes = fs::read(entry.path()).ok()?;
                if result.len() + bytes.len() + name.len() > MAX_SKILL_CONTENT_BYTES {
                    return None;
                }
                result.extend_from_slice(&(name.len() as u64).to_le_bytes());
                result.extend_from_slice(name.as_bytes());
                result.extend_from_slice(&(bytes.len() as u64).to_le_bytes());
                result.extend(bytes);
            } else {
                return None;
            }
        }
        Some(())
    }
    let mut result = Vec::new();
    visit(root, root, &mut result, &mut 0, profile)?;
    Some(result)
}
fn inspect(engine: &Engine, source: &str) -> Result<Inspection, String> {
    inspect_with_options(engine, source, false)
}
fn inspect_with_options(
    engine: &Engine,
    source: &str,
    include_internal: bool,
) -> Result<Inspection, String> {
    let source = source.trim();
    if source.is_empty() || source.starts_with('-') {
        return Err("Enter a skill source.".into());
    }
    let parsed = parsed_source(engine, source)?;
    if parsed.source_type == "download" {
        return downloads::inspect(engine, source, &parsed.url, include_internal);
    }
    if parsed.source_type == "well-known" {
        return provider::inspect(engine, source, &parsed.url, include_internal);
    }
    let local = Path::new(parsed.local_path.as_deref().unwrap_or(source));
    let temp;
    let base = if parsed.source_type == "local" {
        if !Path::new(source).is_absolute() || !local.is_dir() {
            return Err("Choose an existing absolute local directory; the interface expands ~ before preview.".into());
        }
        dunce::canonicalize(local).map_err(|e| e.to_string())?
    } else {
        let location = parsed_git_location(&parsed)?;
        temp = clone_repository(engine, &location)?;
        temp.0.join("repo")
    };
    let path = if let Some(subpath) = &parsed.subpath {
        contained_path(&base, subpath)?
    } else {
        base.clone()
    };
    inspect_directory(engine, source, include_internal, parsed, &base, &path)
}
fn inspect_directory(
    engine: &Engine,
    source: &str,
    include_internal: bool,
    parsed: ParsedSource,
    base: &Path,
    path: &Path,
) -> Result<Inspection, String> {
    engine.report_installation("checking", 0, 0);
    let path = dunce::canonicalize(path).map_err(|e| e.to_string())?;
    let mut skills = Vec::new();
    let mut warnings = Vec::new();
    let groups = plugins::discover(engine, &path)?;
    let selected = plugins::selected_paths(
        engine,
        base,
        &path,
        include_internal,
        parsed.skill_filter.as_deref(),
    )?;
    let paths = selected.paths;
    warnings.extend(selected.warnings);
    let mut names = std::collections::BTreeSet::new();
    for (document_path, document) in engine.documents(&paths)? {
        let (Some(name), Some(description)) = (document.name, document.description) else {
            warnings.push(format!(
                "{document_path}: {}",
                document.error.unwrap_or_default()
            ));
            continue;
        };
        if !names.insert(name.to_lowercase()) {
            return Err("Duplicate skill names: preview cannot reliably select a unique skill. Use upstream CLI.".into());
        }
        if document.internal && !include_internal {
            continue;
        }
        let content = fs::read_to_string(Path::new(&document_path).join("SKILL.md"))
            .map_err(|e| e.to_string())?;
        skills.push(SourceSkill {
            use_signature: signature_profile(Path::new(&document_path), 2),
            download_source: None,
            download_digest: None,
            download_url: None,
            file_count: None,
            selection_fingerprint: plugins::selection_fingerprint(
                &document.hash,
                &groups.get(&document_path).cloned(),
            ),
            plugin_name: groups.get(&document_path).cloned(),
            internal: document.internal,
            name,
            description,
            content,
            path: document_path.clone(),
            signature: source_install_signature(Path::new(&document_path)),
            fingerprint: document.hash,
        });
    }
    if parsed.skill_filter.is_some() {
        if skills.len() != 1 {
            return Err("The source skill filter does not identify one visible skill. Review the name or explicitly show internal skills; no installation was started.".into());
        }
    }
    if skills.is_empty() {
        return Err(format!(
            "No reliably previewable skills. {}",
            warnings.join("\n")
        ));
    }
    for skill in &mut skills {
        skill.path = relative_path_text(
            Path::new(&skill.path)
                .strip_prefix(&path)
                .map_err(|e| e.to_string())?,
        );
    }
    Ok(Inspection {
        session_id: None,
        provider: false,
        source: source.into(),
        skill_filter: parsed.skill_filter,
        skills,
        warnings,
    })
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Operation {
    #[serde(default)]
    dsh_context_key: Option<String>,
    #[serde(default)]
    inspection_session: Option<String>,
    #[serde(default)]
    sync_origin: Option<skill_sync::Origin>,
    target: Target,
    action: String,
    source: Option<String>,
    skills: Vec<String>,
    agents: Vec<String>,
    copy: bool,
    #[serde(default)]
    source_hashes: Option<BTreeMap<String, Option<String>>>,
    #[serde(default)]
    include_internal: bool,
    #[serde(default)]
    removals: Option<Vec<RemovalPlan>>,
    #[serde(default)]
    eve_subagents: Vec<String>,
    #[serde(default)]
    removal_source: Option<String>,
}
fn operation_args(engine: &Engine, operation: &Operation) -> Result<Vec<String>, String> {
    operation.target.directory(&engine.home)?;
    if operation.skills.is_empty()
        || operation.skills.iter().any(|name| {
            name.is_empty()
                || name.starts_with('-')
                || name == "*"
                || name.chars().any(char::is_control)
        })
    {
        return Err("Choose explicit skill names.".into());
    }
    if !matches!(operation.action.as_str(), "add" | "remove" | "update") {
        return Err("Unsupported operation.".into());
    }
    if operation.include_internal && operation.action != "add" {
        return Err("Internal source selection is only valid for installation.".into());
    }
    eve::validate_operation(engine, operation)?;
    dsh::validate_target(engine, operation)?;
    let catalog = engine.agents(&operation.target)?;
    if operation.action == "update" && !operation.agents.is_empty() {
        return Err("Upstream does not support single-Agent updates.".into());
    }
    if operation.action != "update"
        && (operation.agents.is_empty()
            || operation
                .agents
                .iter()
                .any(|id| !catalog.iter().any(|agent| &agent.id == id)))
    {
        return Err("Choose supported Agent targets.".into());
    }
    let mut args = vec![operation.action.clone()];
    if operation.action == "add" {
        args.push(
            operation
                .source
                .clone()
                .filter(|source| !source.is_empty() && !source.starts_with('-'))
                .ok_or("Missing source.")?,
        );
    }
    if operation.action == "update" {
        args.extend(operation.skills.clone());
    } else {
        if operation.action == "add" {
            args.push("--skill".into());
        }
        args.extend(operation.skills.clone());
        args.push("--agent".into());
        args.extend(operation.agents.clone());
    }
    if operation.target.scope == "global" {
        args.push("--global".into());
    } else if operation.action == "update" {
        args.push("--project".into());
    }
    if operation.action == "add" {
        args.push("--full-depth".into());
        if operation.agents.iter().any(|id| id == "eve") {
            args.push("--subagent".into());
            args.extend(if operation.eve_subagents.is_empty() {
                vec!["root".into()]
            } else {
                operation.eve_subagents.clone()
            });
        }
        if operation.copy {
            args.push("--copy".into());
        }
    }
    args.push("--yes".into());
    Ok(args)
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemovalPath {
    path: String,
    kind: String,
    agents: Vec<String>,
    selected: bool,
    link_target: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemovalPlan {
    skill: String,
    agents: Vec<String>,
    paths: Vec<RemovalPath>,
    shared: bool,
    cleanup_possible: bool,
    lock_present: bool,
    lock_record: serde_json::Value,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovalObservation {
    path: String,
    kind: String,
    agents: Vec<String>,
    selected: bool,
    outcome: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovalReport {
    paths: Vec<RemovalObservation>,
    lock: String,
    unrelated_preserved: bool,
}
fn removal_plan(
    engine: &Engine,
    operation: &Operation,
    inventory: &Inventory,
) -> Result<Vec<RemovalPlan>, String> {
    if operation.agents.iter().any(|id| id == "codex")
        && inventory
            .skills
            .iter()
            .filter(|skill| operation.removal_source.is_none() || skill.cli_managed)
            .any(|skill| {
                operation.skills.contains(&skill.name)
                    && skill
                        .codex_state
                        .as_ref()
                        .is_some_and(|state| state.lifecycle_owner != "skills-cli")
            })
    {
        return Err(
            "Native Codex skills must be managed through their owning plugin or source directory."
                .into(),
        );
    }
    if let Some(plan) = skill_sync::removal_plan(engine, operation)? {
        return Ok(plan);
    }
    let canonical_base = operation
        .target
        .directory(&engine.home)?
        .join(".agents/skills");
    let canonical_base = dunce::canonicalize(&canonical_base).unwrap_or(canonical_base);
    let lock = engine.lock(&operation.target)?;
    let mut plans = Vec::new();
    for name in &operation.skills {
        let records: Vec<_> = inventory
            .skills
            .iter()
            .filter(|skill| &skill.name == name)
            // A lock source owns CLI installs, not same-name native Pi/package skills.
            .filter(|skill| operation.removal_source.is_none() || skill.cli_managed)
            .collect();
        if operation.agents.iter().any(|id| id == "fx")
            && records.iter().any(|record| {
                record.agents.iter().any(|id| id == "fx")
                    && !record.cli_agents.iter().any(|id| id == "fx")
            })
        {
            return Err("This fx skill belongs to its previous installation directory. Open its directory to manage it.".into());
        }
        if records.iter().any(|record| {
            record.agents.iter().any(|id| id == dsh::ID)
                && operation.agents.iter().any(|id| id == dsh::ID)
                && !record.cli_agents.iter().any(|id| id == dsh::ID)
        }) {
            return Err("This DSH skill is outside the original CLI target. Manage its source directory directly.".into());
        }
        if records.iter().any(|record| {
            record
                .pi_state
                .as_ref()
                .is_some_and(|state| !state.cli_addressable)
                && operation.agents.iter().any(|id| id == "pi")
                && !record
                    .cli_agents
                    .iter()
                    .any(|id| id != "pi" && operation.agents.contains(id))
        }) {
            return Err("This Pi skill is outside the upstream CLI installation paths. Manage its source directory or package directly.".into());
        }
        if records.iter().any(|record| {
            record.hermes_origin.is_some()
                && operation
                    .agents
                    .iter()
                    .any(|id| record.agents.contains(id) && !record.cli_agents.contains(id))
                && !record
                    .cli_agents
                    .iter()
                    .any(|id| operation.agents.contains(id))
        }) {
            return Err("These Hermes skills are outside the upstream CLI installation paths. Manage them in Hermes or open their directories.".into());
        }
        let mut paths = BTreeMap::<String, RemovalPath>::new();
        for record in &records {
            for agent in inventory
                .agents
                .iter()
                .filter(|agent| record.agents.contains(&agent.id))
            {
                for directory in std::iter::once(&agent.path).chain(&agent.additional_paths) {
                    let entries = match fs::read_dir(directory) {
                        Ok(entries) => entries,
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                        Err(error) => {
                            return Err(format!("Cannot inspect removal targets: {error}"))
                        }
                    };
                    for entry in entries {
                        let path = entry.map_err(|error| error.to_string())?.path();
                        if !dunce::canonicalize(&path)
                            .is_ok_and(|actual| actual.to_string_lossy() == record.path)
                        {
                            continue;
                        }
                        let metadata =
                            fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
                        let shared = !metadata.is_symlink()
                            && path
                                .parent()
                                .and_then(|parent| dunce::canonicalize(parent).ok())
                                .as_ref()
                                == Some(&canonical_base);
                        // A configured Hermes root can be a /private alias of the same shared directory.
                        // Merge that physical shared entry, retaining separate Agent symlinks.
                        let key = if shared {
                            paths
                                .values()
                                .find(|item| {
                                    item.kind == "shared"
                                        && fs::canonicalize(&item.path).ok()
                                            == fs::canonicalize(&path).ok()
                                })
                                .map(|item| item.path.clone())
                                .unwrap_or_else(|| path.to_string_lossy().into_owned())
                        } else {
                            path.to_string_lossy().into_owned()
                        };
                        let item = paths.entry(key.clone()).or_insert_with(|| RemovalPath {
                            path: key,
                            kind: if shared {
                                "shared"
                            } else if metadata.is_symlink() {
                                "link"
                            } else {
                                "copy"
                            }
                            .into(),
                            agents: Vec::new(),
                            selected: false,
                            link_target: fs::read_link(&path)
                                .ok()
                                .map(|path| path.to_string_lossy().into_owned()),
                        });
                        if !item.agents.contains(&agent.id) {
                            item.agents.push(agent.id.clone());
                        }
                    }
                }
            }
        }
        let shared = paths.values().any(|path| {
            path.kind == "shared" && path.agents.iter().any(|id| operation.agents.contains(id))
        });
        let mut agents = operation.agents.clone();
        if shared {
            // Universal Agents share actual content. Include links to that same content,
            // but never widen another skill's targets or include independent copies.
            for record in &records {
                if Path::new(&record.path).parent() == Some(canonical_base.as_path()) {
                    agents.extend(
                        record
                            .agents
                            .iter()
                            .filter(|id| {
                                record.hermes_origin.is_none() || record.cli_agents.contains(id)
                            })
                            .cloned(),
                    );
                }
            }
        }
        agents.sort();
        agents.dedup();
        if agents.iter().any(|id| id == "eve") {
            let mut expanded = operation.clone();
            expanded.agents = agents.clone();
            eve::validate_operation(engine, &expanded)?;
            eve::add_removal_paths(engine, &operation.target, name, &mut paths)?;
        }
        for path in paths.values_mut() {
            path.agents.sort();
            path.selected = path.agents.iter().any(|id| agents.contains(id));
        }
        let cleanup_possible = paths
            .values()
            .any(|path| path.kind == "shared" && !path.selected)
            && !inventory.agents.iter().any(|agent| {
                agent.detected
                    && !agents.contains(&agent.id)
                    && fs::symlink_metadata(Path::new(&agent.path).join(name)).is_ok()
            });
        plans.push(RemovalPlan {
            skill: name.clone(),
            agents,
            paths: paths.into_values().collect(),
            shared,
            cleanup_possible,
            lock_present: !lock["skills"][name].is_null(),
            lock_record: lock["skills"][name].clone(),
        });
    }
    Ok(plans)
}
fn removal_report(
    engine: &Engine,
    target: &Target,
    plan: &RemovalPlan,
    unrelated_preserved: bool,
) -> RemovalReport {
    let paths = plan
        .paths
        .iter()
        .map(|path| {
            let outcome = match fs::symlink_metadata(&path.path) {
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => "removed",
                Err(_) => "unknown",
                Ok(metadata) if metadata.is_symlink() && !Path::new(&path.path).exists() => {
                    "broken"
                }
                Ok(metadata)
                    if metadata.is_symlink() != (path.kind == "link")
                        || (metadata.is_symlink()
                            && fs::read_link(&path.path)
                                .ok()
                                .map(|p| p.to_string_lossy().into_owned())
                                != path.link_target) =>
                {
                    "changed"
                }
                Ok(_) => "retained",
            };
            RemovalObservation {
                path: path.path.clone(),
                kind: path.kind.clone(),
                agents: path.agents.clone(),
                selected: path.selected,
                outcome: outcome.into(),
            }
        })
        .collect();
    let lock = match engine.lock(target) {
        Ok(lock) if lock["skills"][&plan.skill].is_null() => {
            if plan.lock_present {
                "removed"
            } else {
                "absent"
            }
        }
        Ok(lock) if lock["skills"][&plan.skill] == plan.lock_record => "retained",
        Ok(_) => "changed",
        Err(_) => "unknown",
    };
    RemovalReport {
        paths,
        lock: lock.into(),
        unrelated_preserved,
    }
}

#[derive(Serialize)]
pub struct ItemResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    destination: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    agents: Vec<String>,
    skill: String,
    status: String,
    message: String,
    removal: Option<RemovalReport>,
    eve_paths: Option<Vec<eve::EveObservation>>,
}
#[derive(Serialize)]
pub struct OperationResult {
    items: Vec<ItemResult>,
    inventory: Option<Inventory>,
    logs: String,
}
struct MutationBatch {
    skills: Vec<String>,
    before: Inventory,
    lock: serde_json::Value,
    signatures: BTreeMap<(String, String), Option<Vec<u8>>>,
    output: Result<ProcessResult, String>,
    observed: Result<Inventory, String>,
    structured: bool,
}
fn apply(engine: &Engine, operation: &Operation) -> Result<OperationResult, String> {
    let _lock = MUTATION
        .try_lock()
        .map_err(|_| "Another change is running. Wait for it to finish.")?;
    if operation.action == "add" {
        engine.report_installation("checking", 0, operation.skills.len());
    }
    let mut result = apply_dispatch(engine, operation)?;
    if let Err(error) = skill_sync::detach_removed_sources(engine) {
        result.items.push(ItemResult {
            skill: operation.skills.join(", "),
            status: "failed".into(),
            message: error,
            removal: None,
            eve_paths: None,
            destination: None,
            agents: vec![],
        });
    }
    result.inventory = engine.inventory(&operation.target).ok();
    Ok(result)
}
fn apply_dispatch(engine: &Engine, operation: &Operation) -> Result<OperationResult, String> {
    if operation.sync_origin.is_some() {
        return skill_sync::sync(engine, operation);
    }
    if operation.action == "add" || !skill_sync::has_store(engine) {
        return apply_unlocked(engine, operation);
    }
    if operation.action == "update"
        && !operation.agents.is_empty()
        && skill_sync::selected_only(engine, operation)?
    {
        return Ok(OperationResult {
            items: skill_sync::update_selected(
                engine,
                &operation.target,
                &operation.skills,
                &operation.agents,
            )?,
            inventory: engine.inventory(&operation.target).ok(),
            logs: String::new(),
        });
    }
    let initial_sync = engine.inventory(&operation.target)?;
    let local_names: Vec<String> = operation
        .skills
        .iter()
        .filter(|name| {
            let records: Vec<_> = initial_sync
                .skills
                .iter()
                .filter(|s| &s.name == *name)
                .collect();
            !records.iter().any(|s| s.cli_managed && s.updateable)
                && records
                    .iter()
                    .any(|s| s.source_type.as_deref() == Some("local-sync"))
        })
        .cloned()
        .collect();
    if operation.action == "remove" && skill_sync::selected_only(engine, operation)? {
        return skill_sync::remove(engine, operation);
    }
    if operation.action == "update" && !local_names.is_empty() {
        let mut items = skill_sync::update(engine, &operation.target, &local_names)?;
        let mut rest = operation.clone();
        rest.skills.retain(|n| !local_names.contains(n));
        let logs = if rest.skills.is_empty() {
            String::new()
        } else {
            let next = apply_unlocked(engine, &rest)?;
            items.extend(next.items);
            next.logs
        };
        return Ok(OperationResult {
            items,
            inventory: engine.inventory(&operation.target).ok(),
            logs,
        });
    }
    apply_unlocked(engine, operation)
}
fn apply_unlocked(engine: &Engine, operation: &Operation) -> Result<OperationResult, String> {
    operation_args(engine, operation)?;
    source_removal::validate(engine, operation)?;
    let mut initial =
        skill_sync::lifecycle_inventory(engine, &operation.target, &operation.action)?;
    if operation.action == "update" {
        initial
            .skills
            .retain(|s| s.source_type.as_deref() != Some("local-sync"));
    }
    if operation.action == "update" {
        eve::validate_locked(
            engine,
            operation,
            &engine.lock(&operation.target)?,
            &initial,
        )?;
    }
    let removals = if operation.action == "remove" {
        removal_plan(engine, operation, &initial)?
    } else {
        Vec::new()
    };
    if operation
        .removals
        .as_ref()
        .is_some_and(|confirmed| confirmed != &removals)
    {
        return Err("Removal targets changed since confirmation. Refresh and review the removal plan again.".into());
    }
    if operation.action != "add" {
        for name in &operation.skills {
            let records: Vec<_> = initial
                .skills
                .iter()
                .filter(|skill| &skill.name == name)
                .filter(|skill| operation.removal_source.is_none() || skill.cli_managed)
                .collect();
            if records.is_empty()
                && operation.action == "remove"
                && operation.removal_source.is_some()
            {
                continue;
            }
            if records.is_empty() {
                return Err("Installation is missing or could not be fully inspected. Refresh before changing it.".into());
            }
            if operation.action == "update" {
                if records
                    .iter()
                    .any(|skill| !skill.updateable || skill.source != records[0].source)
                {
                    return Err("These installations have unknown, different or unsupported update sources. Preview the intended source and reinstall instead.".into());
                }
            } else {
                let agents = &removals
                    .iter()
                    .find(|plan| &plan.skill == name)
                    .ok_or("Missing removal plan.")?
                    .agents;
                if !records
                    .iter()
                    .any(|skill| skill.agents.iter().any(|id| agents.contains(id)))
                    || agents.iter().any(|id| {
                        records
                            .iter()
                            .filter(|skill| {
                                skill.agents.contains(id)
                                    && (skill.hermes_origin.is_none()
                                        || skill.cli_agents.contains(id))
                            })
                            .count()
                            > 1
                            && id != "eve"
                    })
                {
                    return Err("Skill is missing or ambiguous within a selected Agent. Refresh and inspect Agent directories.".into());
                }
            }
        }
    }
    let mut expected = BTreeMap::new();
    let mut expected_plugins = BTreeMap::new();
    let mut expected_downloads = BTreeMap::new();
    let mut direct_downloads = std::collections::BTreeSet::new();
    let mut provider_digests = BTreeMap::new();
    let plugin_lock_expected = operation.action == "add"
        && operation.target.scope == "global"
        && parsed_source(
            engine,
            operation.source.as_deref().ok_or("Missing source.")?,
        )?
        .owner_repo
        .is_some();
    let mut eve_expected = BTreeMap::new();
    let mut eve_hashes = BTreeMap::new();
    if operation.action == "add" {
        let inspection = inspection_session::recheck(engine, operation)?;
        if inspection.skills.iter().any(|s| s.download_url.is_some())
            && operation.agents.iter().any(|id| id == "eve")
        {
            return Err("Eve destinations are not supported for downloadable sources; no installation was started.".into());
        }
        if !operation
            .skills
            .iter()
            .all(|name| inspection.skills.iter().any(|skill| &skill.name == name))
        {
            return Err("Source changed or selected skill is unavailable. Inspect again.".into());
        }
        if let Some(hashes) = &operation.source_hashes {
            if operation.skills.iter().any(|name| {
                inspection
                    .skills
                    .iter()
                    .find(|skill| &skill.name == name)
                    .is_none_or(|skill| {
                        hashes
                            .get(name)
                            .and_then(Option::as_ref)
                            .is_some_and(|hash| skill.selection_fingerprint.as_ref() != Some(hash))
                    })
            }) {
                return Err("Source content changed since preview. Inspect again before confirming installation.".into());
            }
        }
        dsh::validate_source(engine, operation, &inspection)?;
        for skill in inspection.skills {
            if let Some(digest) = &skill.download_digest {
                provider_digests.insert(skill.name.clone(), digest.clone());
            }
            if skill.download_url.is_some() && skill.download_source.is_none() {
                direct_downloads.insert(skill.name.clone());
            }
            if let (Some(url), Some(hash), Some(source)) = (
                &skill.download_url,
                &skill.fingerprint,
                &skill.download_source,
            ) {
                expected_downloads.insert(
                    skill.name.clone(),
                    (url.clone(), hash.clone(), source.clone()),
                );
            }
            expected_plugins.insert(skill.name.clone(), skill.plugin_name.clone());
            if operation.agents.iter().any(|id| id == "eve") {
                if operation.skills.contains(&skill.name) {
                    let signature = skill
                        .signature
                        .as_ref()
                        .ok_or("Eve source exceeds verification limits.")?;
                    eve_expected
                        .insert(skill.name.clone(), Some(eve::signature(engine, signature)?));
                    eve_hashes.insert(
                        skill.name.clone(),
                        skill
                            .fingerprint
                            .clone()
                            .ok_or("Eve source hash is unavailable.")?,
                    );
                }
            }
            expected.insert(skill.name, skill.signature);
        }
    }
    let mut source_cache = SourceCache::default();
    let mut update_snapshots = BTreeMap::new();
    if operation.action == "update" {
        for name in &operation.skills {
            update_snapshots.insert(
                name.clone(),
                source_snapshot(engine, &operation.target, name, &mut source_cache),
            );
        }
    }
    let update_before = if operation.action == "update" {
        Some(skill_sync::lifecycle_inventory(
            engine,
            &operation.target,
            &operation.action,
        )?)
    } else {
        None
    };
    let mut batch_operation = operation.clone();
    if operation.action == "update" {
        batch_operation
            .skills
            .retain(|name| update_snapshots.get(name).is_some_and(Result::is_ok));
    }
    // Submit all eligible names once; the unmodified CLI owns its update scheduling.
    let batch = if operation.action == "add"
        || operation.action == "update"
            && !batch_operation.skills.is_empty()
            && !skill_sync::has_relations(engine, &operation.skills)?
    {
        let before = match update_before {
            Some(before) => before,
            None => skill_sync::lifecycle_inventory(engine, &operation.target, &operation.action)?,
        };
        let lock = engine.lock(&operation.target)?;
        let signatures = before
            .skills
            .iter()
            .map(|skill| {
                (
                    (skill.name.clone(), skill.path.clone()),
                    tree_signature(Path::new(&skill.path)),
                )
            })
            .collect();
        let mut args = operation_args(engine, &batch_operation)?;
        let structured = operation.action == "add"
            && parsed_source(
                engine,
                operation.source.as_deref().ok_or("Missing source.")?,
            )?
            .source_type
                != "well-known";
        if structured {
            args.push("--json".into());
        }
        let internal = update_snapshots
            .values()
            .filter_map(|v| v.as_ref().ok())
            .any(|s| s.internal);
        if operation.action == "add" {
            engine.report_installation("installing", 0, operation.skills.len());
        }
        let output = engine.cli_with_internal(&args, &operation.target, internal);
        if operation.action == "add" {
            engine.report_installation("verifying", 0, operation.skills.len());
        }
        let observed =
            skill_sync::lifecycle_inventory(engine, &operation.target, &operation.action);
        Some(MutationBatch {
            skills: batch_operation.skills.clone(),
            before,
            lock,
            signatures,
            output,
            observed,
            structured,
        })
    } else {
        None
    };
    let mut items = Vec::new();
    let mut logs = String::new();
    if let Some(batch) = &batch {
        match &batch.output {
            Ok(output) => logs.push_str(&format!("{}\n{}\n", output.stdout, output.stderr)),
            Err(error) => logs.push_str(&format!("{error}\n")),
        }
    }
    for (index, name) in operation.skills.iter().enumerate() {
        let before = match batch
            .as_ref()
            .map(|batch| Ok(batch.before.clone()))
            .unwrap_or_else(|| {
                skill_sync::lifecycle_inventory(engine, &operation.target, &operation.action)
            }) {
            Ok(inventory) => inventory,
            Err(error) => {
                logs.push_str(&format!("Cannot inspect remaining targets: {error}\n"));
                for remaining in &operation.skills[index..] {
                    items.push(ItemResult { skill: remaining.clone(), status: "uncertain".into(), message: "Not executed: current state could not be read. Refresh before retrying.".into(), removal: None, eve_paths: None, destination: None, agents: vec![] });
                }
                break;
            }
        };
        let snapshot = if operation.action == "update" {
            match update_snapshots
                .remove(name)
                .ok_or("Missing update inspection.")?
            {
                Ok(snapshot) => Some(snapshot),
                Err(error) => {
                    logs.push_str(&format!("{name}: {error}\n"));
                    items.push(ItemResult {
                        skill: name.clone(),
                        status: "failed".into(),
                        message: format!("Update not started: {error}"),
                        removal: None,
                        eve_paths: None,
                        destination: None,
                        agents: vec![],
                    });
                    continue;
                }
            }
        } else {
            None
        };
        let before_signatures: BTreeMap<_, _> = before
            .skills
            .iter()
            .filter(|skill| {
                (if let Some(batch) = &batch {
                    !batch.skills.contains(&skill.name)
                } else {
                    &skill.name != name
                }) || operation.removal_source.is_some() && !skill.cli_managed
                    || operation.action == "add"
                        && skill.agents.iter().any(|id| id == "eve")
                        && !eve::paths(operation, &engine.home, &skill.name).is_ok_and(|paths| {
                            paths.iter().any(|p| p.to_string_lossy() == skill.path)
                        })
            })
            .map(|skill| {
                (
                    (skill.name.clone(), skill.path.clone()),
                    match &batch {
                        Some(batch) => batch
                            .signatures
                            .get(&(skill.name.clone(), skill.path.clone()))
                            .cloned()
                            .flatten(),
                        None => tree_signature(Path::new(&skill.path)),
                    },
                )
            })
            .collect();
        let mut single = operation.clone();
        single.skills = vec![name.clone()];
        let removal = removals.iter().find(|plan| &plan.skill == name);
        if let Some(plan) = removal {
            let current = removal_plan(engine, &single, &before)?;
            if current.first() != Some(plan) {
                items.push(ItemResult {
                    skill: name.clone(),
                    status: "failed".into(),
                    message: "Not executed: removal targets changed. Refresh and confirm again."
                        .into(),
                    removal: None,
                    eve_paths: None,
                    destination: None,
                    agents: vec![],
                });
                continue;
            }
            single.agents = plan.agents.clone();
        }
        let before_lock = match &batch {
            Some(batch) => batch.lock.clone(),
            None => engine.lock(&single.target)?,
        };
        let has_eve = single.agents.iter().any(|id| id == "eve")
            || before
                .skills
                .iter()
                .any(|s| s.name == *name && s.agents.iter().any(|id| id == "eve"));
        let mut removal_details = None;
        let output = match &batch {
            Some(batch) => batch.output.clone(),
            None => engine.cli_with_internal(
                &skill_sync::update_args(engine, &single)?
                    .unwrap_or(operation_args(engine, &single)?),
                &single.target,
                snapshot.as_ref().is_some_and(|snapshot| snapshot.internal),
            ),
        };
        let observed = batch
            .as_ref()
            .map(|batch| batch.observed.clone())
            .unwrap_or_else(|| {
                skill_sync::lifecycle_inventory(engine, &operation.target, &operation.action)
            });
        let (status, message) = match output {
            Ok(output) => {
                if batch.is_none() {
                    logs.push_str(&format!("{name}\n{}\n{}\n", output.stdout, output.stderr));
                }
                match &observed {
                    Ok(inventory) => {
                        let records: Vec<_> = inventory
                            .skills
                            .iter()
                            .filter(|skill| &skill.name == name)
                            .collect();
                        let matches =
                            |id: &String| records.iter().any(|skill| skill.agents.contains(id));
                        let other_skills_preserved =
                            before_signatures
                                .iter()
                                .all(|((other_name, path), signature)| {
                                    inventory.skills.iter().any(|skill| {
                                        &skill.name == other_name
                                            && &skill.path == path
                                            && signature.as_ref().is_none_or(|value| {
                                                tree_signature(Path::new(&skill.path)).as_ref()
                                                    == Some(value)
                                            })
                                    })
                                });
                        let targets_preserved = before
                            .skills
                            .iter()
                            .filter(|skill| &skill.name == name)
                            .all(|skill| {
                                skill
                                    .agents
                                    .iter()
                                    .filter(|id| !operation.agents.contains(id))
                                    .all(matches)
                            });
                        if let Some(plan) = removal {
                            removal_details = Some(removal_report(
                                engine,
                                &operation.target,
                                plan,
                                other_skills_preserved,
                            ));
                        }
                        let verified = match operation.action.as_str() {
                            "add" => {
                                targets_preserved
                                    && batch.as_ref().is_none_or(|batch| {
                                        engine.lock(&operation.target).is_ok_and(|lock| {
                                            batch.lock["skills"].as_object().is_none_or(|entries| {
                                                entries
                                                    .iter()
                                                    .filter(|(key, _)| {
                                                        !operation.skills.contains(key)
                                                    })
                                                    .all(|(key, value)| {
                                                        lock["skills"][key] == *value
                                                    })
                                            })
                                        })
                                    })
                                    && provider_digests.get(name).is_none_or(|digest| {
                                        engine.lock(&single.target).is_ok_and(|lock| {
                                            lock["skills"][name]["wellKnownDigest"].as_str()
                                                == Some(digest)
                                        })
                                    })
                                    && (!direct_downloads.contains(name)
                                        || engine
                                            .lock(&single.target)
                                            .is_ok_and(|lock| lock == before_lock))
                                    && expected_downloads.get(name).is_none_or(
                                        |(url, hash, source)| {
                                            provider::lock_matches(
                                                engine, &single, name, url, hash, source,
                                            )
                                        },
                                    )
                                    && (!plugin_lock_expected
                                        || engine.lock(&operation.target).is_ok_and(|lock| {
                                            expected_plugins.get(name)
                                                == Some(
                                                    &lock["skills"][name]["pluginName"]
                                                        .as_str()
                                                        .map(str::to_owned),
                                                )
                                        }))
                                    && operation.agents.iter().all(|id| {
                                        if id == "eve" {
                                            return eve::installed_matches(
                                                engine,
                                                &single,
                                                name,
                                                eve_expected.get(name).and_then(Option::as_ref),
                                                eve_hashes.get(name),
                                            );
                                        }
                                        records.iter().any(|skill| {
                                            skill.agents.contains(id)
                                                && expected
                                                    .get(name)
                                                    .and_then(Option::as_ref)
                                                    .is_none_or(|signature| {
                                                        tree_signature(Path::new(&skill.path))
                                                            .as_ref()
                                                            == Some(signature)
                                                    })
                                        })
                                    })
                            }
                            "remove" => removal_details.as_ref().is_some_and(|report| {
                                (report.paths.iter().any(|path| path.selected)
                                    || operation.removal_source.is_some()
                                        && report.paths.is_empty())
                                    && report
                                        .paths
                                        .iter()
                                        .filter(|path| path.selected)
                                        .all(|path| path.outcome == "removed")
                                    && report
                                        .paths
                                        .iter()
                                        .filter(|path| !path.selected)
                                        .all(|path| path.outcome == "retained")
                                    && (matches!(report.lock.as_str(), "removed" | "absent")
                                        || report.lock == "retained"
                                            && report
                                                .paths
                                                .iter()
                                                .any(|p| !p.selected && p.outcome == "retained"))
                            }),
                            "update" => snapshot.as_ref().is_some_and(|snapshot| {
                                let lock = engine.lock(&operation.target).ok();
                                let hash_key =
                                    if before_lock["skills"][name]["sourceType"] == "well-known" {
                                        "wellKnownDigest"
                                    } else if operation.target.scope == "global" {
                                        "skillFolderHash"
                                    } else {
                                        "computedHash"
                                    };
                                targets_preserved
                                    && (!has_eve
                                        || snapshot.signature.as_ref().is_none_or(|signature| {
                                            eve::update_matches(
                                                engine,
                                                &single,
                                                name,
                                                &before_lock,
                                                signature,
                                            )
                                        }))
                                    && !records.is_empty()
                                    && (records.iter().all(|skill| {
                                        snapshot.signature.as_ref().is_none_or(|signature| {
                                            eve::content_matches(engine, skill, signature)
                                        })
                                    }) || lock.as_ref().is_some_and(|lock| {
                                        lock["skills"][name] == before_lock["skills"][name]
                                    }))
                                    && lock
                                        .as_ref()
                                        .and_then(|lock| lock["skills"][name][hash_key].as_str())
                                        .is_some_and(|hash| {
                                            snapshot
                                                .hashes
                                                .iter()
                                                .any(|candidate| candidate == hash)
                                        })
                            }),
                            _ => false,
                        } && other_skills_preserved;
                        let item_reported_installed =
                            batch.as_ref().is_some_and(|batch| batch.structured)
                                && serde_json::from_str::<Vec<serde_json::Value>>(&output.stdout)
                                    .is_ok_and(|items| {
                                        items
                                            .iter()
                                            .filter(|item| item["name"].as_str() == Some(name))
                                            .count()
                                            == 1
                                            && items.iter().any(|item| {
                                                item["name"].as_str() == Some(name)
                                                    && item["status"] == "installed"
                                            })
                                    });
                        if verified
                            && (if batch.as_ref().is_some_and(|batch| batch.structured) {
                                item_reported_installed
                            } else {
                                output.success || operation.action == "update"
                            })
                        {
                            (
                                "complete",
                                "Selected targets and applicable source records observed after execution.",
                            )
                        } else if removal_details.as_ref().is_some_and(|report| {
                            report.paths.iter().any(|path| {
                                path.selected
                                    && matches!(
                                        path.outcome.as_str(),
                                        "retained" | "broken" | "changed"
                                    )
                            })
                        }) {
                            ("failed", "One or more selected paths still exist. Review the actual removal results.")
                        } else if !output.success {
                            ("failed", "Upstream execution failed; actual inventory refreshed. Review logs and installed state.")
                        } else {
                            ("uncertain", "The observed content, target relationships or lock record do not fully confirm this operation. Review actual state before retrying.")
                        }
                    }
                    Err(error) => {
                        logs.push_str(&format!("Refresh failed: {error}\n"));
                        ("uncertain", "Cannot refresh actual state. Do not assume failure or retry automatically.")
                    }
                }
            }
            Err(error) => {
                logs.push_str(&format!("{name}: {error}\n"));
                ("uncertain", "Execution outcome could not be confirmed. Refresh actual state before retrying.")
            }
        };
        if removal_details.is_none() {
            if let Some(plan) = removal {
                removal_details = Some(removal_report(engine, &operation.target, plan, false));
            }
        }
        items.push(ItemResult {
            skill: name.clone(),
            status: status.into(),
            message: message.into(),
            removal: removal_details,
            destination: None,
            agents: vec![],
            eve_paths: if has_eve && single.action != "remove" {
                let paths = if single.action == "add" {
                    eve::paths(&single, &engine.home, name).unwrap_or_default()
                } else {
                    eve::recorded_paths(&single.target, &engine.home, name, &before_lock)
                };
                let converted = snapshot
                    .as_ref()
                    .and_then(|s| s.signature.as_ref())
                    .and_then(|signature| eve::signature(engine, signature).ok());
                Some(eve::observations(
                    engine,
                    paths,
                    if single.action == "add" {
                        eve_expected.get(name).and_then(Option::as_ref)
                    } else {
                        converted.as_ref()
                    },
                ))
            } else {
                None
            },
        });
        if operation.action == "add" {
            engine.report_installation("verifying", items.len(), operation.skills.len());
        }
    }
    if matches!(operation.action.as_str(), "add" | "update") {
        if let Ok(actual) =
            skill_sync::lifecycle_inventory(engine, &operation.target, &operation.action)
        {
            for item in items.iter().filter(|item| item.status == "complete") {
                if operation.action == "update"
                    && update_snapshots
                        .get(&item.skill)
                        .and_then(|result| result.as_ref().ok())
                        .is_some_and(|source| {
                            actual
                                .skills
                                .iter()
                                .filter(|skill| skill.name == item.skill)
                                .any(|skill| {
                                    source.signature.as_ref().is_none_or(|signature| {
                                        !eve::content_matches(engine, skill, signature)
                                    })
                                })
                        })
                {
                    continue; // An upstream no-op retains user edits; never adopt them as clean source contents.
                }
                if let Err(error) =
                    update_safety::remember(engine, &operation.target, &item.skill, &actual)
                {
                    logs.push_str(&format!(
                        "Content verified, but update baseline could not be saved: {error}\n"
                    ));
                }
            }
        }
    }
    if matches!(operation.action.as_str(), "update" | "remove") {
        let sources: Vec<_> = initial
            .skills
            .iter()
            .filter(|s| {
                items
                    .iter()
                    .any(|i| i.skill == s.name && i.status == "complete")
            })
            .map(|s| s.path.clone())
            .collect();
        match skill_sync::propagate(engine, &sources) {
            Ok(related) => items.extend(related),
            Err(error) => items.push(ItemResult {
                skill: operation.skills.join(", "),
                status: "failed".into(),
                message: error,
                removal: None,
                eve_paths: None,
                destination: None,
                agents: vec![],
            }),
        }
    }
    Ok(OperationResult {
        items,
        inventory: engine.inventory(&operation.target).ok(),
        logs,
    })
}

#[derive(Clone, PartialEq)]
struct SourceSnapshot {
    internal: bool,
    signature: Option<Vec<u8>>,
    hashes: Vec<String>,
}
#[derive(Default)]
struct SourceCache {
    locations: BTreeMap<String, Result<GitSource, String>>,
    checkouts: BTreeMap<String, Result<TemporaryDirectory, String>>,
    refresh: bool,
    checked: BTreeSet<String>,
    restoration: Option<restoration::Prepared>,
}
impl SourceCache {
    fn warm(&mut self, engine: &Engine, locations: Vec<GitSource>) -> Result<(), String> {
        let unique: BTreeMap<String, GitSource> = locations
            .into_iter()
            .map(|location| {
                Ok((
                    serde_json::to_string(&(location.url.clone(), location.reference.clone()))
                        .map_err(|e| e.to_string())?,
                    location,
                ))
            })
            .collect::<Result<_, String>>()?;
        let mut pending = unique.into_iter();
        loop {
            let batch: Vec<_> = pending
                .by_ref()
                .take(3)
                .map(|(key, location)| {
                    let previous = self.checkouts.remove(&key);
                    (key, location, previous)
                })
                .collect();
            if batch.is_empty() {
                break;
            }
            let refresh = self.refresh;
            let values = thread::scope(|scope| {
                batch
                    .into_iter()
                    .map(|(key, location, previous)| {
                        scope.spawn(move || {
                            let value = match previous {
                                Some(Ok(checkout)) => {
                                    if refresh {
                                        inspection_session::refresh(
                                            engine,
                                            &checkout.0.join("repo"),
                                            &location,
                                        )
                                        .map(|_| checkout)
                                    } else {
                                        Ok(checkout)
                                    }
                                }
                                Some(Err(error)) if !refresh => Err(error),
                                _ => clone_repository(engine, &location),
                            };
                            (key, value)
                        })
                    })
                    .collect::<Vec<_>>()
                    .into_iter()
                    .map(|task| task.join().map_err(|_| "Source check failed.".to_string()))
                    .collect::<Result<Vec<_>, String>>()
            })?;
            for (key, value) in values {
                self.checked.insert(key.clone());
                self.checkouts.insert(key, value);
            }
        }
        Ok(())
    }
    fn checkout(
        &mut self,
        engine: &Engine,
        location: &GitSource,
    ) -> Result<&TemporaryDirectory, String> {
        let key = serde_json::to_string(&(location.url.clone(), location.reference.clone()))
            .map_err(|e| e.to_string())?;
        let cached = self.checkouts.get(&key).is_some_and(|value| value.is_ok());
        let recheck = self.refresh && self.checked.insert(key.clone());
        if recheck && self.checkouts.get(&key).is_some_and(|value| value.is_err()) {
            self.checkouts.remove(&key);
        }
        let checkout = self
            .checkouts
            .entry(key.clone())
            .or_insert_with(|| clone_repository(engine, location))
            .as_ref()
            .map_err(Clone::clone)?;
        if recheck && cached {
            inspection_session::refresh(engine, &checkout.0.join("repo"), location)?;
        }
        Ok(checkout)
    }
}
fn source_snapshot(
    engine: &Engine,
    target: &Target,
    name: &str,
    cache: &mut SourceCache,
) -> Result<SourceSnapshot, String> {
    let lock = engine.lock(target)?;
    source_snapshot_from_entry(engine, target, name, &lock["skills"][name], cache)
}
fn source_snapshot_from_entry(
    engine: &Engine,
    target: &Target,
    name: &str,
    entry: &serde_json::Value,
    cache: &mut SourceCache,
) -> Result<SourceSnapshot, String> {
    if entry["sourceType"] == "well-known" {
        return provider::snapshot(engine, target, name);
    }
    let source = entry["sourceUrl"]
        .as_str()
        .or_else(|| entry["source"].as_str())
        .ok_or("Source is unknown.")?;
    if !matches!(
        entry["sourceType"].as_str(),
        Some("github" | "gitlab" | "git")
    ) {
        return Err("This source cannot be checked automatically. Preview and reinstall it to refresh its content.".into());
    }
    let location = cache
        .locations
        .entry(source.into())
        .or_insert_with(|| parsed_git_location(&parsed_source(engine, source)?))
        .as_ref()
        .map_err(Clone::clone)?;
    let mut location = location.clone();
    location.reference = entry["ref"]
        .as_str()
        .map(str::to_owned)
        .or(location.reference);
    let checkout = cache.checkout(engine, &location)?;
    let root = dunce::canonicalize(checkout.0.join("repo")).map_err(|e| e.to_string())?;
    let document = entry["skillPath"]
        .as_str()
        .filter(|p| !p.is_empty())
        .ok_or("No source skill path was recorded. Preview and reinstall the source.")?;
    let document = contained_path(&root, document)?;
    let folder = document.parent().ok_or("Invalid source skill path.")?;
    let key = folder.to_string_lossy().into_owned();
    let metadata = engine.documents(std::slice::from_ref(&key))?;
    let metadata = metadata
        .get(&key)
        .ok_or("Source document could not be inspected.")?;
    if metadata.name.as_deref() != Some(name) {
        return Err("The recorded source skill was removed or renamed. Inspect the source before reinstalling.".into());
    }
    let mut hashes = vec![metadata
        .hash
        .clone()
        .ok_or("Source exceeds verification limits.")?];
    if target.scope == "global" && entry["sourceType"] == "github" {
        let relative = folder
            .strip_prefix(&root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let object = if relative.is_empty() {
            "HEAD^{tree}".into()
        } else {
            format!("HEAD:{relative}")
        };
        let output = run_process(engine.command(Path::new("git"), &root).args([
            "rev-parse",
            "--verify",
            &object,
        ]))?;
        if !output.success {
            return Err("Cannot inspect source tree identity.".into());
        }
        // Upstream falls back to its SHA-256 folder hash when the GitHub tree API is unavailable.
        hashes.push(output.stdout.trim().into());
        if relative.is_empty() {
            // The original GitHub API path may record the root commit as tree.sha;
            // its clone fallback records HEAD^{tree}. Both identify this checkout.
            let output = run_process(engine.command(Path::new("git"), &root).args([
                "rev-parse",
                "--verify",
                "HEAD",
            ]))?;
            if !output.success {
                return Err("Cannot inspect source commit identity.".into());
            }
            hashes.insert(1, output.stdout.trim().into());
        }
    }
    Ok(SourceSnapshot {
        internal: metadata.internal,
        signature: source_install_signature(folder),
        hashes,
    })
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    current_revision: Option<String>,
    latest_revision: Option<String>,
    local_state: String,
    skill: String,
    status: String,
    message: String,
}
fn check_skill_update(
    engine: &Engine,
    target: &Target,
    skill: &Skill,
    inventory: &Inventory,
    lock: &serde_json::Value,
    source_cache: &mut SourceCache,
) -> UpdateStatus {
    if skill.source_type.as_deref() == Some("local-sync") {
        if let Some(status) = skill_sync::status(engine, target, &skill.name) {
            return status;
        }
    }
    let entry = &lock["skills"][&skill.name];
    let current_revision = entry[if entry["sourceType"] == "well-known" {
        "wellKnownDigest"
    } else if target.scope == "global" {
        "skillFolderHash"
    } else {
        "computedHash"
    }]
    .as_str()
    .map(str::to_owned);
    let mut latest_revision = None;
    if entry["sourceType"] == "well-known" && skill.updateable {
        if let Ok(true) = provider::removed(engine, entry, &skill.name) {
            return UpdateStatus{current_revision,latest_revision,local_state:update_safety::state(engine,target,&skill.name,inventory),skill:skill.name.clone(),status:"removed".into(),message:"The source no longer provides this skill. Installed files are retained; use Uninstall to review their removal.".into()};
        }
    }
    let result = if skill.updateable
        && inventory
            .skills
            .iter()
            .filter(|record| {
                record.name == skill.name && record.source_type.as_deref() != Some("local-sync")
            })
            .all(|record| record.source == skill.source && record.updateable)
    {
        source_snapshot_from_entry(engine, target, &skill.name, entry, source_cache)
    } else {
        Err(if entry["sourceType"] == "well-known" {
            "Download sources cannot be checked automatically. Preview the discovery source and confirm installation again to refresh content.".into()
        } else {
            "No reliable update record. Preview and reinstall the source, or use the original CLI."
                .into()
        })
    };
    let mut observed_local = None;
    let (status, message) = match result {
        Ok(snapshot) => {
            // Compare and present identities produced by the same upstream hash scheme.
            latest_revision = snapshot
                .hashes
                .iter()
                .find(|hash| Some(hash.as_str()) == current_revision.as_deref())
                .or_else(|| {
                    snapshot
                        .hashes
                        .iter()
                        .find(|hash| Some(hash.len()) == current_revision.as_ref().map(String::len))
                })
                .or_else(|| snapshot.hashes.first())
                .cloned();
            let recorded = current_revision.as_deref();
            if !recorded
                .is_some_and(|hash| snapshot.hashes.iter().any(|candidate| candidate == hash))
            {
                (
                    "available",
                    "Source content has changed; updating may affect multiple Agents.".into(),
                )
            } else if snapshot.signature.is_none() {
                ("current", "The installed source version is current.".into())
            } else if inventory
                .skills
                .iter()
                .filter(|record| {
                    record.name == skill.name && record.source_type.as_deref() != Some("local-sync")
                })
                .all(|record| {
                    snapshot
                        .signature
                        .as_ref()
                        .is_some_and(|signature| eve::content_matches(engine, record, signature))
                })
            {
                {
                    let _ = update_safety::remember(engine, target, &skill.name, inventory);
                    ("current", "Source and installed content match.".into())
                }
            } else {
                observed_local = Some(
                    if inventory
                        .skills
                        .iter()
                        .filter(|record| {
                            record.name == skill.name
                                && record.source_type.as_deref() != Some("local-sync")
                        })
                        .all(|record| tree_signature(Path::new(&record.path)).is_some())
                    {
                        "modified"
                    } else {
                        "unverified"
                    }
                    .to_string(),
                );
                ("current", "The source is unchanged; installed content differs. Review local edits before updating.".into())
            }
        }
        Err(error) => ("unknown", error),
    };
    UpdateStatus {
        current_revision,
        latest_revision,
        local_state: observed_local
            .unwrap_or_else(|| update_safety::state(engine, target, &skill.name, inventory)),
        skill: skill.name.clone(),
        status: status.into(),
        message,
    }
}

fn check_updates(engine: &Engine, target: &Target) -> Result<Vec<UpdateStatus>, String> {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let inventory = engine.inventory(target)?;
    let lock = engine.lock(target)?;
    let mut checked = std::collections::BTreeSet::new();
    let mut sources = BTreeMap::<String, Vec<(usize, &Skill)>>::new();
    let mut ordered: Vec<_> = inventory.skills.iter().enumerate().collect();
    ordered.sort_by_key(|(_, s)| {
        if s.cli_managed && s.updateable {
            0
        } else if s.source_type.as_deref() == Some("local-sync") {
            1
        } else {
            2
        }
    });
    for (index, skill) in ordered {
        if !checked.insert(skill.name.clone()) {
            continue;
        }
        let entry = &lock["skills"][&skill.name];
        let source = entry["sourceUrl"]
            .as_str()
            .or_else(|| entry["source"].as_str())
            .unwrap_or("");
        let key =
            serde_json::to_string(&(source, entry["ref"].as_str())).map_err(|e| e.to_string())?;
        sources.entry(key).or_default().push((index, skill));
    }
    let groups: Vec<_> = sources.into_values().collect();
    let next = AtomicUsize::new(0);
    // Independent sources may perform network I/O together. Keep skills from
    // one source in one worker so repository and failure caches stay shared.
    let mut statuses = thread::scope(|scope| {
        let workers: Vec<_> = (0..groups.len().min(4))
            .map(|_| {
                scope.spawn(|| {
                    let mut output = Vec::new();
                    let mut cache = SourceCache::default();
                    loop {
                        let index = next.fetch_add(1, Ordering::Relaxed);
                        let Some(group) = groups.get(index) else {
                            break;
                        };
                        for (position, skill) in group {
                            output.push((
                                *position,
                                check_skill_update(
                                    engine, target, skill, &inventory, &lock, &mut cache,
                                ),
                            ));
                        }
                    }
                    output
                })
            })
            .collect();
        let mut output = Vec::new();
        for worker in workers {
            output.extend(
                worker
                    .join()
                    .map_err(|_| "An update check worker failed. Check again.")?,
            );
        }
        Ok::<_, String>(output)
    })?;
    statuses.sort_by_key(|(position, _)| *position);
    Ok(statuses
        .into_iter()
        .map(|(_, mut status)| {
            if status.status == "current" {
                if let Some(local) = skill_sync::status(engine, target, &status.skill) {
                    if local.status != "current" {
                        status = local
                    }
                }
            }
            status
        })
        .collect())
}

#[tauri::command]
pub async fn upstream_agents(app: AppHandle, target: Target) -> Result<Vec<Agent>, String> {
    tauri::async_runtime::spawn_blocking(move || Engine::from_app(&app)?.agents(&target))
        .await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn upstream_inventory(
    app: AppHandle,
    target: Target,
    dsh_context_key: Option<String>,
) -> Result<Inventory, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Engine::from_app(&app)?.inventory_context(&target, dsh_context_key.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_inspect(
    app: AppHandle,
    webview: tauri::Webview,
    source: String,
    include_internal: Option<bool>,
    session_id: Option<String>,
    on_progress: Option<JavaScriptChannelId>,
) -> Result<Inspection, String> {
    let progress = on_progress.map(|id| id.channel_on(webview));
    tauri::async_runtime::spawn_blocking(move || {
        let mut engine = Engine::from_app(&app)?;
        engine.progress = progress;
        engine.report_installation("checking", 0, 0);
        inspection_session::inspect(
            &engine,
            &source,
            include_internal.unwrap_or(false),
            session_id.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_removal_plan(
    app: AppHandle,
    operation: Operation,
) -> Result<Vec<RemovalPlan>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let engine = Engine::from_app(&app)?;
        operation_args(&engine, &operation)?;
        if operation.action != "remove" {
            return Err("Choose a removal operation.".into());
        }
        removal_plan(&engine, &operation, &engine.inventory(&operation.target)?)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn upstream_apply(
    app: AppHandle,
    webview: tauri::Webview,
    operation: Operation,
    on_progress: Option<JavaScriptChannelId>,
) -> Result<OperationResult, String> {
    if operation.action == "remove" && operation.removals.is_none() {
        return Err("Review the removal plan before confirming uninstall.".into());
    }
    if operation.action == "add" && operation.source_hashes.is_none() {
        return Err("Inspect the source before confirming installation.".into());
    }
    let progress = on_progress.map(|id| id.channel_on(webview));
    tauri::async_runtime::spawn_blocking(move || {
        let mut engine = Engine::from_app(&app)?;
        engine.progress = progress;
        apply(&engine, &operation)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_check_updates(
    app: AppHandle,
    target: Target,
) -> Result<Vec<UpdateStatus>, String> {
    tauri::async_runtime::spawn_blocking(move || check_updates(&Engine::from_app(&app)?, &target))
        .await
        .map_err(|e| e.to_string())?
}
// Refresh only local edit status; returning to the app must not clone sources again.
#[tauri::command]
pub async fn upstream_update_local_states(
    app: AppHandle,
    target: Target,
    skills: Vec<String>,
) -> Result<BTreeMap<String, String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let engine = Engine::from_app(&app)?;
        let inventory = engine.inventory(&target)?;
        let names: std::collections::BTreeSet<_> = inventory
            .skills
            .iter()
            .filter(|skill| skill.cli_managed && skills.contains(&skill.name))
            .map(|skill| &skill.name)
            .collect();
        Ok(names
            .into_iter()
            .map(|name| {
                (
                    name.clone(),
                    update_safety::state(&engine, &target, name, &inventory),
                )
            })
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDocumentInfo {
    plugin_version: Option<String>,
    source_directory: Option<String>,
    revision: Option<String>,
    local_state: Option<String>,
    content: String,
    version: Option<String>,
}
#[tauri::command]
pub async fn upstream_document(
    app: AppHandle,
    target: Target,
    path: String,
    dsh_context_key: Option<String>,
    codex_native: Option<bool>,
    dsh_native: Option<bool>,
) -> Result<SkillDocumentInfo, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<SkillDocumentInfo, String> {
        let engine = Engine::from_app(&app)?;
        if codex_native.unwrap_or(false) {
            if target.host != "local" {
                return Err("Native documents require a local target.".into());
            }
            return codex::read_document(Path::new(&path));
        }
        let inventory = engine.inventory_context(&target, dsh_context_key.as_deref())?;
        if dsh_native.unwrap_or(false) {
            let snapshot = inventory.dsh.as_ref().ok_or("DSH discovery is unavailable. Refresh first.")?;
            let mut document = dsh::read_discovered_document(snapshot, &path)?;
            if document.version.is_none() {
                document.version = inventory.skills.iter().find(|skill| skill.path == path && skill.cli_managed)
                    .and_then(|skill| engine.lock(&target).ok().and_then(|lock| {
                        ["skillFolderHash", "computedHash", "wellKnownDigest"].iter()
                            .find_map(|key| lock["skills"][&skill.name][*key].as_str().filter(|value| !value.trim().is_empty()).map(str::to_owned))
                    }));
            }
            return Ok(document);
        }
        let skill = inventory
            .skills
            .iter()
            .find(|skill| skill.path == path)
            .ok_or("Skill is no longer in this inventory. Refresh first.")?;
        let document = skill
            .pi_state
            .as_ref()
            .map(|state| PathBuf::from(&state.file))
            .or_else(|| {
                skill
                    .dsh_state
                    .as_ref()
                    .map(|state| PathBuf::from(&state.file))
            })
            .unwrap_or_else(|| Path::new(&path).join("SKILL.md"));
        if fs::metadata(&document).map_err(|e| e.to_string())?.len() > 256 * 1024 {
            return Err("Skill document exceeds preview limits.".into());
        }
        let version = skill_sync::version(&engine, &target, skill);
        Ok(SkillDocumentInfo {
            plugin_version: skill
                .codex_state
                .as_ref()
                .and_then(|state| state.plugin_id.as_ref())
                .and_then(|id| {
                    inventory
                        .codex
                        .as_ref()?
                        .plugins
                        .iter()
                        .find(|p| &p.id == id)?
                        .version
                        .clone()
                }),
            source_directory: local_source_directory(skill, &target.directory(&engine.home)?)
                .map(|path| path.to_string_lossy().into_owned()),
            revision: tree_signature(Path::new(&skill.path))
                .map(|signature| document_diff::revision(&signature)),
            local_state: if skill.cli_managed {
                Some(update_safety::state(
                    &engine,
                    &target,
                    &skill.name,
                    &inventory,
                ))
            } else {
                None
            },
            content: fs::read_to_string(document).map_err(|e| e.to_string())?,
            version,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
// Resolve only filesystem origins recorded in the current inventory. Remote URLs must
// never become local paths, and missing sources remain non-clickable in the UI.
fn local_source_directory(skill: &Skill, directory: &Path) -> Option<PathBuf> {
    if !matches!(skill.source_type.as_deref(), Some("local" | "node_modules")) {
        return None;
    }
    [&skill.install_source, &skill.source_url, &skill.source]
        .into_iter()
        .flatten()
        .filter(|value| !value.contains("://") && !value.starts_with("git@"))
        .find_map(|value| {
            let path = Path::new(value);
            let path = if path.is_absolute() {
                path.to_path_buf()
            } else {
                directory.join(path)
            };
            path.is_dir().then(|| fs::canonicalize(path).ok()).flatten()
        })
}

#[tauri::command]
pub async fn upstream_source_directory(
    app: AppHandle,
    target: Target,
    path: String,
    dsh_context_key: Option<String>,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let engine = Engine::from_app(&app)?;
        let directory = target.directory(&engine.home)?;
        let inventory = engine.inventory_context(&target, dsh_context_key.as_deref())?;
        let skill = inventory
            .skills
            .iter()
            .find(|skill| skill.path == path)
            .ok_or("Skill is no longer in this inventory. Refresh first.")?;
        Ok(local_source_directory(skill, &directory).map(|path| path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDirectory {
    path: String,
    directory: String,
}

// Metadata only: never scan inventories or read file contents to show a path link.
fn local_directories(paths: Vec<String>) -> Vec<LocalDirectory> {
    paths.into_iter().filter_map(|value| {
        let path = Path::new(&value);
        if !path.is_absolute() { return None; }
        let metadata = fs::metadata(path).ok()?;
        let directory = if metadata.is_dir() { path } else if metadata.is_file() { path.parent()? } else { return None; };
        Some(LocalDirectory { directory: directory.to_string_lossy().into_owned(), path: value })
    }).collect()
}

#[tauri::command]
pub async fn upstream_local_directories(paths: Vec<String>) -> Result<Vec<LocalDirectory>, String> {
    tauri::async_runtime::spawn_blocking(move || local_directories(paths)).await.map_err(|error| error.to_string())
}

// Opening a user-selected local folder must not rediscover every Agent or
// contact plugin catalogs. Markdown-only skills open their containing folder.
fn directory_to_open(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("Choose an absolute local directory.".into());
    }
    let metadata = fs::metadata(path).map_err(|e| format!("Cannot read directory: {e}"))?;
    if metadata.is_dir() {
        return Ok(path.to_path_buf());
    }
    if metadata.is_file()
        && path
            .extension()
            .and_then(|s| s.to_str())
            .is_some_and(|s| s.eq_ignore_ascii_case("md") || s.eq_ignore_ascii_case("markdown"))
    {
        return path
            .parent()
            .map(Path::to_path_buf)
            .ok_or("Skill parent directory unavailable.".into());
    }
    Err("The selected path is not a directory or Markdown skill.".into())
}

#[tauri::command]
pub async fn upstream_open_directory(
    app: AppHandle,
    target: Target,
    path: String,
    dsh_context_key: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_opener::OpenerExt;
        let engine = Engine::from_app(&app)?;
        target.directory(&engine.home)?;
        // Retain the command's existing optional argument for callers. Opening
        // a folder does not inspect or change DSH invocation state.
        let _ = dsh_context_key;
        let open_path = directory_to_open(Path::new(&path))?;
        app.opener()
            .open_path(open_path.to_string_lossy().into_owned(), None::<&str>)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests;

pub(crate) fn marketplace_skill_document(app: &AppHandle, source: &str, name: &str) -> Result<String, String> {
    provider::marketplace_document(app, source, name)
}
