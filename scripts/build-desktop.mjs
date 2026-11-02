import { spawnSync } from "node:child_process";

const commands = [
  ["scripts/stage-upstream.mjs"],
  ["node_modules/typescript/bin/tsc"],
  ["node_modules/vite/bin/vite.js", "build"],
];

for (const args of commands) {
  const result = spawnSync("node", args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
