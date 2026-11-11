import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readUpstreamAgents } from "./read-upstream-agents.mjs";

const require = createRequire(import.meta.url);
const source = dirname(require.resolve("skills/package.json"));
const metadata = JSON.parse(readFileSync(`${source}/package.json`, "utf8"));
if (metadata.version !== "1.7.4") throw new Error("Review the upstream contract before changing skills@1.7.4.");
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 20)) throw new Error("Upstream skills requires Node >=22.20.");
const binary = process.execPath;

// Ship the published CLI bytes unchanged, including its bin entry used by update.
const destination = resolve("src-tauri/resources/upstream");
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
copyFileSync(resolve("scripts/tweakcn-LICENSE.txt"), `${destination}/TWEAKCN-LICENSE`);
copyFileSync(resolve("docs/research/ui-theme-sources.md"), `${destination}/THEME-SOURCES.md`);
copyFileSync(resolve("scripts/inspect-upstream-dependencies.mjs"), `${destination}/inspect-upstream-dependencies.mjs`);
copyFileSync(resolve("scripts/prepare-upstream-download.mjs"), `${destination}/prepare-upstream-download.mjs`);
copyFileSync(resolve("scripts/inspect-eve.mjs"), `${destination}/inspect-eve.mjs`);
copyFileSync(resolve("scripts/inspect-upstream-plugins.mjs"), `${destination}/inspect-upstream-plugins.mjs`);
copyFileSync(resolve("scripts/inspect-upstream-discovery.mjs"), `${destination}/inspect-upstream-discovery.mjs`);
copyFileSync(resolve("scripts/inspect-upstream-provider.mjs"), `${destination}/inspect-upstream-provider.mjs`);
copyFileSync(resolve("scripts/workshop-builtins.mjs"), `${destination}/workshop-builtins.mjs`);
cpSync(resolve("scripts/builtin-skills"), `${destination}/builtin-skills`, {recursive:true});
copyFileSync(resolve("scripts/workshop.mjs"), `${destination}/workshop.mjs`);
copyFileSync(resolve("scripts/workshop-codex.mjs"), `${destination}/workshop-codex.mjs`);
copyFileSync(resolve("scripts/workshop-sarvam.mjs"), `${destination}/workshop-sarvam.mjs`);
copyFileSync(resolve("scripts/run-upstream-use.mjs"), `${destination}/run-upstream-use.mjs`);
copyFileSync(resolve("scripts/inspect-upstream-source.mjs"), `${destination}/inspect-upstream-source.mjs`);
copyFileSync(resolve("scripts/inspect-skill-documents.mjs"), `${destination}/inspect-skill-documents.mjs`);
copyFileSync(resolve("scripts/inspect-dsh-skills.mjs"), `${destination}/inspect-dsh-skills.mjs`);
cpSync(resolve("scripts/dsh-skill-policy"), `${destination}/dsh-skill-policy`, {recursive:true,filter:path=>!path.endsWith(".test.mjs")});
copyFileSync(resolve("scripts/dsh-policy.mjs"), `${destination}/dsh-policy.mjs`);
copyFileSync(resolve("scripts/run-dsh-policy-install.mjs"), `${destination}/run-dsh-policy-install.mjs`);
copyFileSync(resolve("scripts/dsh-configuration.mjs"), `${destination}/dsh-configuration.mjs`);
copyFileSync(resolve("scripts/dsh-skill-version.mjs"), `${destination}/dsh-skill-version.mjs`);
copyFileSync(resolve("scripts/dsh-directory-config.mjs"), `${destination}/dsh-directory-config.mjs`);
copyFileSync(resolve("scripts/prepare-dsh-change.mjs"), `${destination}/prepare-dsh-change.mjs`);
copyFileSync(resolve("scripts/inspect-hermes-config.mjs"), `${destination}/inspect-hermes-config.mjs`);
copyFileSync(resolve("scripts/prepare-hermes-settings.mjs"), `${destination}/prepare-hermes-settings.mjs`);
copyFileSync(resolve("scripts/inspect-pi-skills.mjs"), `${destination}/inspect-pi-skills.mjs`);
copyFileSync(resolve("scripts/pi-visibility-extension.mjs"), `${destination}/pi-visibility-extension.mjs`);
copyFileSync(resolve("scripts/pi-invocation-state.mjs"), `${destination}/pi-invocation-state.mjs`);
copyFileSync(resolve("scripts/pi-package-driver.mjs"), `${destination}/pi-package-driver.mjs`);
copyFileSync(resolve("scripts/pi-packages.mjs"), `${destination}/pi-packages.mjs`);
rmSync(`${destination}/pi-npm-baseline.mjs`, { force: true });
copyFileSync(resolve("scripts/upstream-LICENSE.txt"), `${destination}/SKILLS-LICENSE`);
for (const path of ["dist", "bin", "docs", "package.json", "README.md", "ThirdPartyNoticeText.txt"]) {
  cpSync(`${source}/${path}`, `${destination}/skills/${path}`, { recursive: true, dereference: true });
}
// Preserve upstream runtime dependencies, including tar's transitive packages.
const staged = new Set();
function stageDependencies(parent) {
  const pkg = JSON.parse(readFileSync(`${parent}/package.json`, "utf8"));
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    const dependency = dirname(createRequire(`${parent}/package.json`).resolve(`${name}/package.json`));
    if (staged.has(name)) continue;
    staged.add(name);
    cpSync(dependency, `${destination}/skills/node_modules/${name}`, { recursive: true, dereference: true });
    stageDependencies(dependency);
  }
}
stageDependencies(source);

// Pi uses these exact matching semantics. Ship only the read-only matchers, not Pi's runtime.
function stagePiDependency(name, parentRequire = require) {
  const dependency = dirname(parentRequire.resolve(`${name}/package.json`));
  const target = `${destination}/pi/node_modules/${name}`;
  if (stagedPi.has(name)) return;
  stagedPi.add(name);
  cpSync(dependency, target, { recursive: true, dereference: true });
  const pkg = JSON.parse(readFileSync(`${dependency}/package.json`, "utf8"));
  const nested = createRequire(`${dependency}/package.json`);
  for (const child of Object.keys(pkg.dependencies ?? {})) stagePiDependency(child, nested);
}
const stagedPi = new Set();
stagePiDependency("minimatch");
stagePiDependency("ignore");
writeFileSync(`${destination}/pi/package.json`, JSON.stringify({private:true}));

// Read-only path metadata is derived from this pinned release, not a second Agent registry.
const code = readFileSync(`${source}/dist/cli.mjs`, "utf8");
const useConfig = code.split("const USE_AGENT_CONFIGS = ")[1]?.split(";\nconst SUPPORTED_USE_AGENTS")[0];
if (!useConfig) throw new Error("Review upstream use Agent configuration.");
// The fixed table is a literal, evaluated without an environment or process APIs.
const { runInNewContext } = await import("node:vm");
const useAgents = runInNewContext(`(${useConfig})`, {}, {timeout:1000});
if (Object.keys(useAgents).sort().join(",") !== "claude-code,codex,sarvam-code" || Object.values(useAgents).some(a => typeof a.command !== "string" || a.args.length)) throw new Error("Review upstream interactive use contract.");
writeFileSync(`${destination}/use-agents.json`, JSON.stringify(useAgents));
const agents = readUpstreamAgents(code);
writeFileSync(`${destination}/agents.json`, JSON.stringify(agents, null, 2));
const parserCheck = spawnSync(binary, [`${destination}/inspect-upstream-source.mjs`, "owner/repo#main@selected-skill"], { encoding: "utf8", env: { ...process.env, GH_HOST: "github.com" } });
if (parserCheck.status !== 0) throw new Error("Review pinned read-only source parser.");
const parsedCheck = JSON.parse(parserCheck.stdout);
if (parsedCheck.url !== "https://github.com/owner/repo.git" || parsedCheck.ref !== "main" || parsedCheck.skillFilter !== "selected-skill") throw new Error("Pinned source parser contract changed.");
const eveCheck = spawnSync(binary, [`${destination}/inspect-eve.mjs`, "transform", JSON.stringify(["---\nname: fixture\ndescription: Fixture\n---\n# Body\n"])], { encoding: "utf8" });
if (eveCheck.status !== 0 || JSON.parse(eveCheck.stdout)[0] !== '---\nname: fixture\ndescription: Fixture\n---\n# Body\n') throw new Error("Review pinned Eve conversion contract.");
const pluginCheck = spawnSync(binary, [`${destination}/inspect-upstream-plugins.mjs`, destination], { encoding: "utf8" });
if (pluginCheck.status !== 0 || JSON.parse(pluginCheck.stdout).groups.length !== 0) throw new Error("Review pinned plugin grouping contract.");
const providerCheck = spawnSync(binary, [`${destination}/inspect-upstream-provider.mjs`, "https://fixture.invalid", "--contract"], { encoding: "utf8" });
if (providerCheck.status !== 0 || JSON.parse(providerCheck.stdout).contract !== true) throw new Error("Review pinned provider contract.");
writeFileSync(`${destination}/version.json`, JSON.stringify({ version: metadata.version }));
console.log(`Staged original skills@${metadata.version}, ${agents.length} Agent paths; checks use system Node ${process.version}.`);
