// Read-only adapter: execute the pinned package's original parser, never its CLI entry.
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { runInNewContext } from "node:vm";
const code = await readFile(new URL("./skills/dist/cli.mjs", import.meta.url), "utf8");
const start = code.indexOf('const DEFAULT_GITHUB_HOST = "github.com";');
const end = code.indexOf("const CSI_RE =", start);
if (start < 0 || end < start) throw new Error("Review pinned source parser boundaries.");
const input = process.argv[2];
if (!input || input.length > 8192) throw new Error("Invalid source input.");
const parsed = runInNewContext(code.slice(start, end) + "\nconst parsed = parseSource(input); ({...parsed, ownerRepo: getOwnerRepo(parsed)});", {
  input, URL, isAbsolute, resolve, process: { env: { GH_HOST: process.env.GH_HOST } },
}, { timeout: 1000 });
console.log(JSON.stringify(parsed));
