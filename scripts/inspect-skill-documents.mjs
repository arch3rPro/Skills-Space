// Internal read-only adapter. Installation and lockfile writes remain upstream-owned.
import { createReadStream } from "node:fs";
import { readFile, readdir, stat, realpath } from "node:fs/promises";
import { join, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { parse } from "./skills/node_modules/yaml/dist/index.js";


const MAX_SKILL_CONTENT_BYTES = 16 * 1024 * 1024;

async function hashFolder(path) {
  try {
      const files = [];
      async function visit(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const full = join(directory, entry.name);
          if (entry.isDirectory()) { if (![".git", "node_modules"].includes(entry.name)) await visit(full); }
          else if (entry.isFile()) {
            files.push({ path: relative(path, full).split("\\").join("/"), full });
          } else throw new Error("Unsupported file type.");
        }
      }
      await visit(path);
      files.sort((a, b) => a.path.localeCompare(b.path));
      const digest = createHash("sha256");
      for (const file of files) { digest.update(file.path); for await (const chunk of createReadStream(file.full)) digest.update(chunk); }
    return digest.digest("hex");
  } catch { return null; }
}

if (process.argv[2] === "--hash-file") {
  const path = process.argv[3];
  if (!path || (await stat(path)).size > MAX_SKILL_CONTENT_BYTES) throw new Error("File exceeds verification limits.");
  const bytes = await readFile(path);
  if (bytes.length > MAX_SKILL_CONTENT_BYTES) throw new Error("File exceeds verification limits.");
  console.log(createHash("sha256").update(bytes).digest("hex"));
} else {
const originalCode = await readFile(new URL("./skills/dist/cli.mjs", import.meta.url), "utf8");
function originalBlock(start, end) {
  const a = originalCode.indexOf(start), b = originalCode.indexOf(end, a);
  if (a < 0 || b < a) throw new Error("Review pinned document parser boundaries.");
  return originalCode.slice(a, b);
}
const {parseFrontmatter, sanitizeMetadata} = runInNewContext(
  originalBlock("const CSI_RE =", "const silentOutput =")
    + originalBlock("function parseFrontmatter(raw) {", "function isContainedIn(")
    + "\n({parseFrontmatter,sanitizeMetadata});", {parse}, {timeout:1000});

const metadataOnly = process.argv.includes("--metadata-only");
const paths = JSON.parse(process.argv[2]);
if (!Array.isArray(paths) || paths.length > 2000 || paths.some((path) => typeof path !== "string")) throw new Error("Document inspection exceeds limits.");
const results = [];
for (const path of paths) {
  try {
    if ((await stat(join(path, "SKILL.md"))).size > 256 * 1024) throw new Error("Skill document exceeds preview limits.");
    const content = await readFile(join(path, "SKILL.md"), "utf8");
    if (Buffer.byteLength(content) > 256 * 1024) throw new Error("Skill document exceeds preview limits.");
    const {data} = parseFrontmatter(content);
    if (typeof data?.name !== "string" || typeof data?.description !== "string") throw new Error("Skill name and description must be strings.");
    const clean = sanitizeMetadata;
    const name = clean(data.name), description = clean(data.description);
    if (!name || !description || name.startsWith("-") || name === "*" || /[\x00-\x1f\x7f]/.test(name)) throw new Error("Invalid skill metadata.");
    let skillInterface = null;
    let allowImplicitInvocation = null;
    if (metadataOnly) {
      try {
        const file = join(path, "agents/openai.yaml");
        const resolved = await realpath(file), root = await realpath(path);
        const within = relative(root, resolved);
        if (within && within !== ".." && !within.startsWith("../") && !within.startsWith("..\\") && !isAbsolute(within) && (await stat(resolved)).size <= 256 * 1024) {
          const metadata = await readFile(resolved, "utf8");
          if (Buffer.byteLength(metadata) <= 256 * 1024) {
            const value = parse(metadata);
            skillInterface = value?.interface ?? null;
            if (value == null || typeof value === "object" && !Array.isArray(value)) {
              const policy = value?.policy;
              if (policy == null || typeof policy === "object" && !Array.isArray(policy)) {
                const declared = policy?.allow_implicit_invocation;
                allowImplicitInvocation = typeof declared === "boolean" ? declared : null;
              }
            }
          }
        }
      } catch {
        // Missing, invalid or unreadable declarations do not produce a display state.
      }
    }
    const hash = metadataOnly ? null : await hashFolder(path);
    const versionValue = data.metadata?.version ?? data.version;
    const version = typeof versionValue === 'string' || typeof versionValue === 'number' ? clean(String(versionValue)) || null : null;
    const license = typeof data.license === 'string' ? clean(data.license) || null : null;
    const compatibility = typeof data.compatibility === 'string' ? clean(data.compatibility) || null : null;
    results.push({ path, name, description, version, license, compatibility, interface: skillInterface, allowImplicitInvocation, internal: data.metadata?.internal === true, hash, error: null });
  } catch (error) { results.push({ path, hash: metadataOnly ? null : await hashFolder(path), error: String(error) }); }
}
console.log(JSON.stringify(results));

}
