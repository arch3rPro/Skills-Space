import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Keep the existing QA Profile, projects and saved drafts across development runs.
const qa = join(workspace, ".scratch/dsh-skills-space/p0p1-repair/qa");
const home = join(qa, "home");
const profile = "skills-space-qa";
const port = 64580;
const url = `http://127.0.0.1:${port}`;
const pidFile = join(qa, "web.pid");
const logFile = join(qa, "web.log");
const env = Object.fromEntries(["PATH", "TMPDIR", "LANG", "LC_ALL", "SystemRoot"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { HOME: home, USERPROFILE: home, DSH_HOME: join(home, ".dsh"), DISABLE_TELEMETRY: "1" });
mkdirSync(qa, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: workspace, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command} exited with ${result.status}`);
}
function activePid() {
  if (!existsSync(pidFile)) return null;
  const pid = Number(readFileSync(pidFile, "utf8").trim());
  if (!Number.isInteger(pid) || pid < 2) throw Error("Invalid QA PID file");
  const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
  if (result.status !== 0) { unlinkSync(pidFile); return null; }
  if (!result.stdout.includes(`--profile ${profile}`) || !result.stdout.includes(`--port ${port}`)) throw Error("QA PID belongs to another process; refusing to stop it");
  return pid;
}

async function start(openBrowser = false) {
  if (activePid()) { console.log(`QA already running: ${url}`); return; }
  const manifest = join(home, ".dsh/profiles", profile, "package.json");
  if (!existsSync(manifest)) throw Error("The persistent QA Profile is missing; restore it before starting");
  const listener = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  if (listener.status === 0) throw Error(`Port ${port} is occupied; no process was stopped`);
  const log = openSync(logFile, "a");
  const child = spawn("dsh", ["--profile", profile, "--host", "127.0.0.1", "--port", String(port), ...(openBrowser ? [] : ["--no-open"])], { cwd: qa, env, detached: true, stdio: ["ignore", log, log] });
  closeSync(log);
  await new Promise((yes, no) => { child.once("spawn", yes); child.once("error", no); });
  writeFileSync(pidFile, String(child.pid)); child.unref();
  for (let attempt = 0; attempt < 60; attempt++) {
    if (!activePid()) throw Error(`QA stopped during startup; see ${logFile}`);
    try { const response = await fetch(url, { signal: AbortSignal.timeout(500) }); if (response.ok || response.status === 401 || response.status === 403) { console.log(`QA ready: ${url}`); console.log(`Log: ${logFile}`); return; } } catch {}
    await delay(250);
  }
  throw Error(`QA did not become ready; see ${logFile}`);
}
async function stop() {
  const pid = activePid(); if (!pid) { console.log("QA already stopped"); return; }
  process.kill(pid, "SIGTERM");
  for (let attempt = 0; attempt < 60; attempt++) {
    if (!activePid()) { console.log("QA stopped; Profile and projects retained"); return; }
    await delay(250);
  }
  throw Error("QA did not stop; no forced termination was attempted");
}

async function update(archive) {
  if (!archive) {
    run("pnpm", ["--dir", "packages/dsh-skills-space", "run", "build"]);
    const output = join(qa, "dev-candidates"); mkdirSync(output, { recursive: true });
    run("npm", ["pack", "./packages/dsh-skills-space", "--ignore-scripts", "--pack-destination", output]);
    const manifest = JSON.parse(readFileSync(join(workspace, "packages/dsh-skills-space/package.json")));
    const packed = join(output, `dsh-skills-space-${manifest.version}.tgz`);
    const hash = createHash("sha256").update(readFileSync(packed)).digest("hex").slice(0, 12);
    archive = join(output, `dsh-skills-space-${manifest.version}-${hash}.tgz`);
    renameSync(packed, archive);
  }
  archive = resolve(archive);
  if (!existsSync(archive)) throw Error(`Archive not found: ${archive}`);
  const wasRunning = !!activePid();
  if (wasRunning) await stop();
  try { run("dsh", ["plugin", "--profile", profile, "add", archive], { env }); }
  finally { if (wasRunning) await start(); }
  console.log(`QA plugin updated: ${archive}`);
}
const command = process.argv[2] ?? "start";
try {
  if (command === "open") { await stop(); await start(true); }
  else if (command === "start") await start();
  else if (command === "stop") await stop();
  else if (command === "restart") { await stop(); await start(); }
  else if (command === "update") await update(process.argv[3]);
  else if (command === "status") console.log(activePid() ? `QA running: ${url}` : "QA stopped");
  else throw Error("Usage: pnpm dev:dsh [start|open|stop|restart|status|update [archive.tgz]]");
} catch (error) { console.error(error.message); process.exitCode = 1; }
