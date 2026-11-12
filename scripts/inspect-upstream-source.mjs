// Read-only adapter: execute the pinned package's original parser, never its CLI entry.
import { readUpstream } from "./upstream-readonly.mjs";
import { fileURLToPath } from "node:url";
import { isAbsolute, resolve } from "node:path";
import { runInNewContext } from "node:vm";
const upstream = await readUpstream(process.argv[3] || fileURLToPath(new URL("./skills/package.json", import.meta.url)));
const input = process.argv[2];
if (!input || input.length > 8192) throw new Error("Invalid source input.");
const parsed = runInNewContext(upstream.source() + "\nconst parsed = parseSource(input); ({...parsed, ownerRepo: getOwnerRepo(parsed)});", {
  input, URL, isAbsolute, resolve, diagnostics: upstream.diagnostics, process: { cwd: process.cwd, env: { GH_HOST: process.env.GH_HOST } },
}, { timeout: 1000 });
console.log(JSON.stringify(parsed));
