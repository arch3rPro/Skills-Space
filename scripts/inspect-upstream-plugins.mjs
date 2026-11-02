// Read-only plugin discovery metadata from the unchanged pinned release.
import { readFile, lstat, realpath } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { runInNewContext } from "node:vm";

const root = await realpath(process.argv[2]);
const code = await readFile(new URL("./skills/dist/cli.mjs", import.meta.url), "utf8");
const start = code.indexOf("function isContainedIn(targetPath, basePath) {");
const end = code.indexOf('const LOCAL_LOCK_FILE =', start);
if (start < 0 || end < start) throw new Error("Review pinned plugin discovery boundaries.");
const contents = new Map();
for (const name of ["marketplace.json", "plugin.json"]) {
  const file = join(root, ".claude-plugin", name);
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.size > 1024 * 1024 || await realpath(file) !== file) throw new Error("Plugin manifest must be a bounded regular file within the source.");
    const raw = await readFile(file, "utf8");
    if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error("Plugin manifest exceeds limits.");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid plugin manifest.");
    // Do not let malformed manifests silently become an ungrouped successful preview.
    const plugins = name === "marketplace.json" ? data.plugins ?? [] : [data];
    if (!Array.isArray(plugins) || plugins.length > 200) throw new Error("Invalid plugin list.");
    for (const plugin of plugins) {
      if (!plugin || typeof plugin !== "object" || Array.isArray(plugin)) throw new Error("Invalid plugin entry.");
      if (plugin.name !== undefined && (typeof plugin.name !== "string" || !plugin.name.trim() || plugin.name.length > 200 || /[\x00-\x1f\x7f]/.test(plugin.name))) throw new Error("Invalid plugin name.");
      if (plugin.skills !== undefined && (!Array.isArray(plugin.skills) || plugin.skills.length > 200 || plugin.skills.some(p => typeof p !== "string" || p.length > 4096))) throw new Error("Invalid plugin skill paths.");
    }
    if (data.metadata?.pluginRoot !== undefined && typeof data.metadata.pluginRoot !== "string") throw new Error("Invalid plugin root.");
    contents.set(file, raw);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const original = runInNewContext(code.slice(start, end) + "\n({getPluginSkillPaths,getPluginGroupings})", {
  dirname, join, normalize, resolve, sep,
  readFile: async (file) => {
    if (!contents.has(file)) throw new Error("No manifest.");
    return contents.get(file);
  },
}, {timeout:1000});
const paths = await original.getPluginSkillPaths(root);
const groups = [...await original.getPluginGroupings(root)];
if (paths.length > 2000 || groups.length > 2000) throw new Error("Plugin metadata exceeds limits.");
console.log(JSON.stringify({paths, groups}));
