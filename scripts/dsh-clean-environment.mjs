import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(workspace, ".scratch/dsh-clean-test");
const pidFile = join(root, "server.pid");
const url = "http://127.0.0.1:64590";
function activePid() {
  if (!existsSync(pidFile)) return null;
  const pid = Number(readFileSync(pidFile, "utf8").trim());
  if (!Number.isInteger(pid) || pid < 2) throw Error("Invalid clean-environment PID");
  const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
  if (result.status !== 0) { unlinkSync(pidFile); return null; }
  if (!result.stdout.includes("--profile skills-space-clean") || !result.stdout.includes("--port 64590")) throw Error("PID does not belong to the clean environment; no process stopped");
  return pid;
}
async function stop() {
  const pid = activePid(); if (!pid) return;
  process.kill(pid, "SIGTERM");
  for (let attempt = 0; attempt < 40; attempt++) { if (!activePid()) return; await delay(250); }
  throw Error("Clean Host did not stop; no forced termination attempted");
}
async function start() {
  if (activePid()) { console.log("Clean Host already running: " + url); return; }
  if (spawnSync("lsof", ["-nP", "-iTCP:64590", "-sTCP:LISTEN"], { encoding: "utf8" }).status === 0) throw Error("Port 64590 is occupied; no other service changed");
  const result = spawnSync(process.execPath, [join(workspace, "scripts/dsh-clean-start.mjs")], { cwd: workspace, stdio: "inherit" });
  if (result.status !== 0) throw Error("Clean Host launcher failed");
  for (let attempt = 0; attempt < 60; attempt++) {
    if (!activePid()) throw Error("Clean Host exited during startup");
    try { const response = await fetch(url, { signal: AbortSignal.timeout(500) }); if ([200, 401, 403].includes(response.status)) { console.log("Clean Host listening; official login opens in its separate browser: " + url); return; } } catch {}
    await delay(250);
  }
  throw Error("Clean Host listener did not become available");
}
const command = process.argv[2] ?? "status";
try {
  if (command === "status") console.log(activePid() ? "Clean Host running: " + url : "Clean Host stopped");
  else if (command === "start") await start();
  else if (command === "open" || command === "restart") { await stop(); await start(); }
  else if (command === "stop") { await stop(); console.log("Clean Host stopped; data retained"); }
  else throw Error("Usage: pnpm dev:dsh:clean [status|start|open|restart|stop]");
} catch (error) { console.error(error.message); process.exitCode = 1; }
