// Internal read-only adapter. Installation and lockfile writes remain upstream-owned.
import { readFile, stat, realpath } from "node:fs/promises";
import { join, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { readUpstream, skillFolderHashes } from "./upstream-readonly.mjs";
import { parse } from "./skills/node_modules/yaml/dist/index.js";


const MAX_SKILL_CONTENT_BYTES = 16 * 1024 * 1024;

if (process.argv[2] === "--hash-file") {
  const path = process.argv[3];
  if (!path || (await stat(path)).size > MAX_SKILL_CONTENT_BYTES) throw new Error("File exceeds verification limits.");
  const bytes = await readFile(path);
  if (bytes.length > MAX_SKILL_CONTENT_BYTES) throw new Error("File exceeds verification limits.");
  console.log(createHash("sha256").update(bytes).digest("hex"));
} else {
const upstream = await readUpstream();
const hashes = skillFolderHashes(upstream);
const {parseFrontmatter, sanitizeMetadata, isInternalSkill} = runInNewContext(
  upstream.metadata() + upstream.block("function isRecord$1(", "async function hasSkillMd(")
    + "\n({parseFrontmatter,sanitizeMetadata,isInternalSkill});", {parse}, {timeout:1000});
const metadataOnly = process.argv.includes("--metadata-only");
let input = process.argv[2];
if (input === "--stdin") {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  input = Buffer.concat(chunks).toString("utf8");
}
const paths = JSON.parse(input);
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
    const contentHashes = metadataOnly ? {} : await hashes(path).catch(() => ({}));
    const versionValue = data.metadata?.version ?? data.version;
    const version = typeof versionValue === 'string' || typeof versionValue === 'number' ? clean(String(versionValue)) || null : null;
    const license = typeof data.license === 'string' ? clean(data.license) || null : null;
    const compatibility = typeof data.compatibility === 'string' ? clean(data.compatibility) || null : null;
    results.push({ path, name, description, version, license, compatibility, interface: skillInterface, allowImplicitInvocation, internal: isInternalSkill(data.metadata), ...contentHashes, error: null });
  } catch (error) { results.push({ path, ...(metadataOnly ? {} : await hashes(path).catch(() => ({}))), error: String(error) }); }
}
console.log(JSON.stringify(results));

}
