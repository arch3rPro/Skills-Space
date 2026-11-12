import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { hasNativeTrash, managedCandidate, managedEntries } from "../packages/dsh-skills-space/managed.mjs";
import { installSkillPolicy } from "../packages/dsh-skills-space/policy.mjs";
import { listingDocument, marketplace } from "../packages/dsh-skills-space/marketplace.mjs";
import { readUpstreamAgents } from "./read-upstream-agents.mjs";
import { upstreamChunk } from "./upstream-readonly.mjs";
import ts from "typescript";
import { dshHomeFromSkillsPath, dshSkillsPath } from "../src/lib/dsh.ts";
import { filterManagedSkills, managedSkillEnabled } from "../src/lib/managed-skill-filters.ts";
import { filterDshSkills } from "../src/lib/dsh.ts";
import { skillCollection, skillSourceKind, matchesSkillQuery } from "../src/lib/upstream.ts";
import { expandHomePath } from "../src/lib/upstream.ts";

const archive = process.env.DSH_COMPANION_TARBALL;
const require = createRequire(import.meta.url);
const browserExternals = new Set(["react", "react-dom", "react/jsx-runtime"]);
const lifecycleModule = new URL("../packages/dsh-skills-space/managed.mjs", import.meta.url).href;

test("companion policy preserves the selected skill while disabling both invocation channels", async t => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "dsh-companion-policy-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const skillPath = join(home, "SKILL.md");
  const document = "---\nname: same-name\ndescription: Test skill\n---\n";
  writeFileSync(skillPath, document);
  const policyFile = join(home, "skills-space", "skill-policy.json");
  mkdirSync(dirname(policyFile), { recursive: true });
  writeFileSync(policyFile, JSON.stringify({ version: 2, rules: [{ file: skillPath, name: "same-name", disabled: true, modelInvocable: true, userInvocable: true }] }));
  const skill = { name: "same-name", path: skillPath, invocation: { modelInvocable: true, userInvocable: true } };
  const service = { list: async () => [skill], snapshot: async () => ({ skills: [skill] }), get: async () => skill };
  let serviceRead;
  installSkillPolicy({ effect() {}, on(name, callback) { assert.equal(name, "internal/get"); serviceRead = callback; } }, home, {});
  const exposed = serviceRead(null, "skills", null, () => service);
  for (const result of [await exposed.list(), (await exposed.snapshot()).skills, [await exposed.get(skill)]]) {
    assert.equal(result.length, 1);
    assert.equal(result[0].path, skillPath);
    assert.deepEqual(result[0].invocation, { modelInvocable: false, userInvocable: false });
  }
  assert.equal(readFileSync(skillPath, "utf8"), document);
});

// Execute the real handlers at their request/state boundaries, following the
// existing application-handler fixtures. This does not establish DOM acceptance.
function sourceAst(name) {
  const source = readFileSync(new URL(`../packages/dsh-skills-space/${name}`, import.meta.url), "utf8");
  return ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function nodes(ast, predicate) {
  const result = [];
  function visit(node) { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); }
  visit(ast);
  return result;
}
function handlers(file, names, environment) {
  const ast = sourceAst(file);
  const declarations = names.map(name => {
    const matching = nodes(ast, node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.equal(matching.length, 1, `Expected one real ${name} handler`);
    return matching[0].getText(ast).replace(/^export /, "");
  });
  return compile(`${declarations.join("\n")}\nreturn {${names.join(",")}};`, environment);
}
function compile(source, environment) {
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  return new Function(...Object.keys(environment), code)(...Object.values(environment));
}
function componentCallback(file, component, variable, environment) {
  const ast = sourceAst(file);
  const [owner] = nodes(ast, node => ts.isFunctionDeclaration(node) && node.name?.text === component);
  assert.ok(owner);
  const declarations = nodes(owner, node => ts.isVariableDeclaration(node) && node.name.getText(ast) === variable);
  assert.equal(declarations.length, 1);
  const initializer = declarations[0].initializer;
  assert.ok(initializer && ts.isCallExpression(initializer));
  return compile(`return (${initializer.arguments[0].getText(ast)});`, environment);
}
function directoryCallbacks(environment) {
  const ast = sourceAst("src/client.tsx");
  const directory = nodes(ast, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "DirectorySettings");
  assert.equal(directory.length, 1);
  return Object.fromEntries(["onSave", "onRestore", "reload"].map(name => {
    const attribute = directory[0].attributes.properties.find(node => ts.isJsxAttribute(node) && node.name.text === name);
    assert.ok(attribute?.initializer && ts.isJsxExpression(attribute.initializer));
    return [name, compile(`return (${attribute.initializer.expression.getText(ast)});`, environment)];
  }));
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function officialHostFixture(t, source) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dsh-companion-official-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home");
  mkdirSync(home);
  const cliPackage = require.resolve("skills/package.json");
  let hostModule = new URL("../packages/dsh-skills-space/host.mjs", import.meta.url).href;
  if (archive) {
    const installed = join(root, "plugin"); mkdirSync(installed);
    execFileSync("tar", ["-xf", archive, "--strip-components=1", "-C", installed]);
    mkdirSync(join(installed, "node_modules"));
    symlinkSync(dirname(cliPackage), join(installed, "node_modules/skills"), "junction");
    hostModule = pathToFileURL(join(installed, "host.mjs")).href;
  }
  execFileSync(process.env.SKILLS_SPACE_DSH_TEST_DESKTOP, ["--input-type=module", "--eval", source,
    root, hostModule, cliPackage], {
    env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, DSH_HOME: join(home, ".dsh"), ELECTRON_RUN_AS_NODE: "1", DISABLE_TELEMETRY: "1" },
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function lifecycleFixture(t, source, packed = false, isolatedSource = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dsh-companion-lifecycle-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home");
  mkdirSync(home);
  const cliPackage = require.resolve("skills/package.json");
  let module = lifecycleModule;
  if (packed || isolatedSource) {
    const installed = join(root, "plugin");
    mkdirSync(installed);
    if (packed) execFileSync("tar", ["-xf", archive, "--strip-components=1", "-C", installed]);
    else {
      mkdirSync(join(installed, "dist"));
      for (const name of ["managed.mjs", "marketplace.mjs"]) writeFileSync(join(installed, name), readFileSync(new URL(`../packages/dsh-skills-space/${name}`, import.meta.url)));
      for (const [source, name] of [["inspect-upstream-discovery.mjs", "discover.mjs"], ["inspect-upstream-source.mjs", "source.mjs"], ["inspect-upstream-provider.mjs", "provider.mjs"], ["prepare-upstream-download.mjs", "download.mjs"], ["upstream-readonly.mjs", "upstream-readonly.mjs"], ["dsh-skill-version.mjs", "dsh-skill-version.mjs"]]) writeFileSync(join(installed, "dist", name), readFileSync(new URL(source, import.meta.url)));
      writeFileSync(join(installed, "dist", "agents.json"), JSON.stringify(readUpstreamAgents(readFileSync(join(dirname(cliPackage), upstreamChunk), "utf8"))));
    }
    mkdirSync(join(installed, "node_modules"));
    symlinkSync(dirname(cliPackage), join(installed, "node_modules", "skills"), "junction");
    module = pathToFileURL(join(installed, "managed.mjs")).href;
  }
  execFileSync(process.execPath, ["--input-type=module", "--eval", source, root, module, cliPackage], {
    env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, DISABLE_TELEMETRY: "1" },
    stdio: ["ignore", "pipe", "inherit"],
  });
}

test("the packed DSH plugin loads its client through the host module factory", {
  skip: !archive && "Set DSH_COMPANION_TARBALL to the local npm pack artifact",
}, () => {
  const read = (name) => execFileSync("tar", ["-xOf", archive, `package/${name}`], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const manifest = JSON.parse(read("package.json"));
  const client = read(manifest.exports["./client"].replace(/^\.\//, ""));
  const registrations = [];
  runInNewContext(client, {
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    window: { __ModuleLoader__: { load: (registration) => registrations.push(registration) } },
    document: {
      head: { appendChild() {} },
      createElement: () => ({ appendChild() {} }),
      createTextNode: (value) => value,
    },
  }, { displayErrors: false });

  assert.equal(registrations.length, 1);
  const [registration] = registrations;
  assert.equal(registration.id, manifest.name);
  const exports = registration.factory((id) => {
    assert.ok(browserExternals.has(id), `The DSH loader cannot resolve unregistered module ${id}`);
    return require(id);
  });
  assert.equal(typeof exports.apply, "function");
  assert.deepEqual(Array.from(exports.inject), ["slots", "locale", "uiWorkspace", "theme"]);
});

test("the final archive matches current Host, Client and freshly derived helper resources", {
  skip: !archive && "Set DSH_COMPANION_TARBALL to the final candidate artifact",
}, () => {
  const read = name => execFileSync("tar", ["-xOf", archive, `package/${name}`], { maxBuffer: 16 * 1024 * 1024 });
  for (const name of ["host.mjs", "managed.mjs", "marketplace.mjs", "policy.mjs", "cordis.patch.yml", "icon.svg", "locale/zh.json", "locale/en.json", "dist/client.js"]) {
    assert.deepEqual(read(name), readFileSync(new URL(`../packages/dsh-skills-space/${name}`, import.meta.url)), `Archive contains stale ${name}`);
  }
  assert.deepEqual(read("dist/discover.mjs"), readFileSync(new URL("./inspect-upstream-discovery.mjs", import.meta.url)));
  assert.deepEqual(read("dist/source.mjs"), readFileSync(new URL("./inspect-upstream-source.mjs", import.meta.url)));
  assert.deepEqual(read("dist/upstream-readonly.mjs"), readFileSync(new URL("./upstream-readonly.mjs", import.meta.url)));
  assert.deepEqual(read("dist/policy-state.mjs"), readFileSync(new URL("./dsh-skill-policy/state.mjs", import.meta.url)));
  assert.deepEqual(read("dist/directory-config.mjs"), readFileSync(new URL("./dsh-directory-config.mjs", import.meta.url)));
  assert.deepEqual(read("dist/dsh-skill-version.mjs"), readFileSync(new URL("./dsh-skill-version.mjs", import.meta.url)));
  const original = readFileSync(join(dirname(require.resolve("skills/package.json")), upstreamChunk), "utf8");
  const agents = readUpstreamAgents(original).map(({ id, projectPath, globalBase, globalPath, globalReadsCanonical }) => ({ id, projectPath, globalBase, globalPath, globalReadsCanonical }));
  assert.deepEqual(JSON.parse(read("dist/agents.json")), agents);
  const manifest = JSON.parse(read("package.json"));
  const sourceManifest = JSON.parse(readFileSync(new URL("../packages/dsh-skills-space/package.json", import.meta.url)));
  assert.deepEqual({ ...manifest, scripts: { ...manifest.scripts, prepack: sourceManifest.scripts.prepack } }, sourceManifest);
  assert.equal(manifest.dependencies.skills, "1.8.1");
  assert.equal(manifest.engines.dsh, ">=0.2.2-rc.1 <0.2.3-0");
  assert.equal(manifest.scripts.postinstall, undefined);
});

test("only the matching project and shared-directory skill inherit the CLI's managed identity", async (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dsh-managed-contract-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, "project");
  const home = join(root, "home");
  const source = join(root, "source");
  mkdirSync(project);
  mkdirSync(home);
  mkdirSync(join(source, "managed-fixture"), { recursive: true });
  writeFileSync(join(source, "managed-fixture", "SKILL.md"), [
    "---", "name: managed-fixture", "description: CLI-managed skill fixture", "---", "", "# Fixture", "",
  ].join("\n"));
  const cli = join(dirname(require.resolve("skills/package.json")), "bin/cli.mjs");
  execFileSync(process.execPath, [cli, "add", source, "--agent", "universal", "--skill", "managed-fixture", "--yes", "--copy"], {
    cwd: project,
    env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, DISABLE_TELEMETRY: "1" },
  });

  const candidate = { name: "managed-fixture", source: "project-agents", path: join(project, ".agents/skills/managed-fixture/SKILL.md") };
  const entries = await managedEntries(project);
  assert.equal(managedCandidate(candidate, project, entries), true);
  assert.equal(managedCandidate(candidate, root, await managedEntries(root)), false);
  assert.equal(managedCandidate({ ...candidate, source: "project-dsh", path: join(project, ".dsh/skills/managed-fixture/SKILL.md") }, project, entries), false);
});

test("native creation runs original init once, verifies the file, and rejects occupied or linked roots", (t) => {
  lifecycleFixture(t, `
    import assert from "node:assert/strict";
    import { mkdir, readFile, symlink } from "node:fs/promises";
    import { join } from "node:path";
    const [root, module] = process.argv.slice(1);
    const { managedLifecycle } = await import(module);
    const lifecycle = managedLifecycle((_path, write) => write());
    const project = join(root, "project");
    const directory = join(project, ".dsh", "skills");
    const target = { path: project };
    const file = join(directory, "create-fixture", "SKILL.md");
    await mkdir(project);
    const observed = [];
    const verify = async candidate => {
      observed.push(candidate);
      return /^name: create-fixture$/m.test(await readFile(candidate, "utf8"));
    };
    assert.deepEqual(await lifecycle.create(target, directory, "create-fixture", verify), { name: "create-fixture" });
    const original = await readFile(file, "utf8");
    await assert.rejects(lifecycle.create(target, directory, "create-fixture", verify), { message: "occupied" });
    assert.equal(await readFile(file, "utf8"), original);
    const linkedProject = join(root, "linked-project");
    await mkdir(linkedProject);
    await symlink(join(project, ".dsh"), join(linkedProject, ".dsh"), "junction");
    await assert.rejects(lifecycle.create({ path: linkedProject }, join(linkedProject, ".dsh", "skills"), "outside-fixture", verify), { message: "creation-directory" });
    await assert.rejects(readFile(join(directory, "outside-fixture", "SKILL.md")), { code: "ENOENT" });
    let checks = 0;
    await assert.rejects(lifecycle.create(target, directory, "authorization-changed", verify, async () => {
      if (++checks === 2) throw Error("creation-directory");
    }), { message: "creation-directory" });
    assert.equal(checks, 2, "Recheck after the lock and again immediately before the CLI");
    await assert.rejects(readFile(join(directory, "authorization-changed", "SKILL.md")), { code: "ENOENT" });
    assert.deepEqual(observed, [file]);
  `);
});

test("reviewed managed batch removal includes installed shared Agents without deleting independent same-name paths", {
  skip: !archive && "The packed artifact supplies the pinned shared Agent targets",
}, (t) => {
  lifecycleFixture(t, `
    import assert from "node:assert/strict";
    import { execFileSync } from "node:child_process";
    import { mkdir, readFile, writeFile } from "node:fs/promises";
    import { dirname, join } from "node:path";
    const [root, module, cliPackage] = process.argv.slice(1);
    const { managedEntries, managedLifecycle } = await import(module);
    const lifecycle = managedLifecycle((_path, write) => write());
    const project = join(root, "project");
    const other = join(root, "other");
    const source = join(root, "source");
    const names = ["alpha-fixture", "beta-fixture"];
    const document = (name) => "---\\nname: " + name + "\\ndescription: a removal fixture\\n---\\n\\nFixture\\n";
    await mkdir(join(root, "home", ".codex"));
    await mkdir(project);
    await mkdir(other);
    for (const name of names) {
      const path = join(source, name, "SKILL.md");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, document(name));
    }
    const cli = join(dirname(cliPackage), "bin", "cli.mjs");
    for (const cwd of [project, other]) {
      execFileSync(process.execPath, [cli, "add", source, "--agent", "universal", "--skill", ...names, "--yes", "--copy"], { cwd });
    }
    const independent = join(project, ".claude", "skills", names[0], "SKILL.md");
    await mkdir(dirname(independent), { recursive: true });
    await writeFile(independent, document(names[0]));
    const target = { path: project };
    const skills = names.map(name => ({ id: name, name, path: join(project, ".agents", "skills", name, "SKILL.md") }));
    const first = await lifecycle.reviewRemoval(target, skills);
    const attachment = join(dirname(skills[0].path), "local.txt");
    await writeFile(attachment, "changed after review");
    await assert.rejects(lifecycle.remove(target, first), { message: "removal-conflict" });
    assert.equal(await readFile(attachment, "utf8"), "changed after review");
    assert.deepEqual(Object.keys(await managedEntries(project)).sort(), names);
    const [record] = Object.values(await managedEntries(project));
    const grouped = await lifecycle.reviewRemoval(target, skills, record.source);
    const lockPath = join(project, "skills-lock.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    await writeFile(lockPath, JSON.stringify({ ...lock, skills: { ...lock.skills, "new-fixture": record } }));
    await assert.rejects(lifecycle.remove(target, grouped, record.source), { message: "removal-conflict" });
    await writeFile(lockPath, JSON.stringify(lock));
    const current = await lifecycle.reviewRemoval(target, skills, record.source);
    assert.deepEqual(await lifecycle.remove(target, current, record.source), { removed: names, failed: false });
    assert.deepEqual(await managedEntries(project), {});
    for (const skill of skills) {
      await assert.rejects(readFile(skill.path), { code: "ENOENT" });
      assert.equal(await readFile(join(other, ".agents", "skills", skill.name, "SKILL.md"), "utf8"), document(skill.name));
    }
    assert.deepEqual(Object.keys(await managedEntries(other)).sort(), names);
    assert.equal(await readFile(independent, "utf8"), document(names[0]));
  `, true);
});

test("native Trash review rejects hard-linked attachments and nested independent skills", {
  skip: !await hasNativeTrash() && "macOS Trash command is unavailable",
}, (t) => {
  lifecycleFixture(t, `
    import assert from "node:assert/strict";
    import { link, mkdir, rm, writeFile } from "node:fs/promises";
    import { join } from "node:path";
    const [root, module] = process.argv.slice(1);
    const { managedLifecycle } = await import(module);
    const lifecycle = managedLifecycle((_path, write) => write());
    const nativePath = join(root, "native-fixture");
    await mkdir(nativePath);
    await writeFile(join(nativePath, "SKILL.md"), "# Native skill");
    const skill = { id: "native-fixture", name: "native-fixture", path: nativePath, nativePath };
    assert.equal((await lifecycle.reviewTrash([skill]))[0].id, skill.id);
    const original = join(root, "independent-attachment.txt");
    const attachment = join(nativePath, "attachment.txt");
    await writeFile(original, "another skill's content");
    await link(original, attachment);
    await assert.rejects(lifecycle.reviewTrash([skill]), { message: "removal-shared-file" });
    await rm(attachment);
    const nested = join(nativePath, "separate-skill");
    await mkdir(nested);
    await writeFile(join(nested, "SKILL.md"), "# Independent nested skill");
    await assert.rejects(lifecycle.reviewTrash([skill]), { message: "removal-nested-skill" });
  `);
});

test("a store page spanning two upstream chunks preserves its requested rank window", async (t) => {
  const makeSkill = (rank) => ({ source: "owner/repo", skillId: `skill-${rank}`, name: `Skill ${rank}`, installs: 500 - rank });
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(url);
    if (url.endsWith("/1")) return Response.json({ skills: Array.from({ length: 200 }, (_, index) => makeSkill(index + 1)), total: 205, hasMore: true });
    assert.ok(url.endsWith("/2"));
    return Response.json({ skills: Array.from({ length: 5 }, (_, index) => makeSkill(index + 201)), total: 205, hasMore: false });
  });

  const response = await marketplace(new URLSearchParams({ store: "trending", page: "17", size: "12" }), new AbortController().signal);
  assert.equal(response.status, 200);
  const page = await response.json();
  assert.deepEqual(page.skills.map((skill) => skill.skillId), Array.from({ length: 12 }, (_, index) => `skill-${index + 193}`));
  assert.equal(page.total, 205);
  assert.equal(page.totalPages, 18);
  assert.deepEqual(requests, ["https://www.skills.sh/api/skills/trending/1", "https://www.skills.sh/api/skills/trending/2"]);
});

test("store separates skill prose and published metadata, and rejects a different listing", () => {
  const url = new URL("https://www.skills.sh/vercel-labs/skills/find-skills");
  const node = (tag, children, attributes = {}) => ["$", tag, null, { ...attributes, children }];
  const prose = (markup) => node("div", null, { className: "prose", dangerouslySetInnerHTML: { __html: markup } });
  const elements = [
    [node("h1", "find-skills"), node("a", "Agent workflows", { href: "/topic/agent-workflows" })],
    [node("h2", "Summary"), prose("<p>Résumé.</p>")],
    [node("h2", "SKILL.md"), prose("<p>Actual skill.</p>")],
    [node("span", "Repository"), node("a", "vercel-labs/skills", { href: "https://github.com/vercel-labs/skills" })],
    [node("span", "GitHub Stars"), node("span", "38K")],
    { label: "Installation", command: "$1", prompt: null },
  ];
  const command = "npx skills add vercel-labs/skills --skill find-skills";
  const payload = `0:${JSON.stringify(elements)}\n1:T${Buffer.byteLength(command).toString(16)},${command}`;
  const html = `<head><link rel="canonical" href="${url.href}"></head><script>self.__next_f.push(${JSON.stringify([1, payload])})</script>`;
  const result = listingDocument(html, url);
  assert.equal(result.html, "<p>Actual skill.</p>");
  assert.equal(result.metadata.summaryHtml, "<p>Résumé.</p>");
  assert.equal(result.metadata.installation.command, command);
  assert.equal(result.metadata.repository.label, "vercel-labs/skills");
  assert.equal(result.metadata.githubStars, "38K");
  assert.deepEqual(result.metadata.topics, [{ label: "Agent workflows", url: "https://www.skills.sh/topic/agent-workflows" }]);
  assert.throws(() => listingDocument(html, new URL("/other/repo/skill", url)), /identity/);
});

test("batch selection retains hidden items while select-all and invert only change visible eligible IDs", () => {
  let selection = { context: "project-a", ids: ["hidden"] };
  const eligible = [{ id: "visible-a" }, { id: "visible-b" }];
  const { selectVisible } = handlers("src/client.tsx", ["selectVisible"], {
    context: "project-a", eligible, setSelection: change => { selection = change(selection); },
  });
  selectVisible();
  assert.deepEqual(selection.ids, ["hidden", "visible-a", "visible-b"]);
  selectVisible(true);
  assert.deepEqual(selection.ids, ["hidden"]);
  eligible.splice(0, eligible.length, { id: "another-source" });
  selectVisible();
  assert.deepEqual(selection.ids, ["hidden", "another-source"]);
  selection = { context: "other-project", ids: ["must-not-leak"] };
  selectVisible();
  assert.deepEqual(selection, { context: "project-a", ids: ["another-source"] });
});

test("partial native removal retains failed physical IDs even when names match; managed removal retains unfinished names", async () => {
  for (const native of [false, true]) for (const failed of [false, true]) {
    let selection, result, refreshed = 0;
    const items = [{ id: "first", name: "same", revision: "r1" }, { id: "second", name: native ? "same" : "different", revision: "r2" }];
    const destination = { preset: "standard", workspace: "project-a" };
    const { removeSkills } = handlers("src/client.tsx", ["removeSkills"], {
      removal: { destination, kinds: { first: native ? "native" : "managed", second: native ? "native" : "managed" }, excluded: [{ id: "excluded", name: "excluded", reason: "removal-unavailable" }] }, context: "project-a",
      items: [...items, { id: "excluded" }], selecting: true, detail: undefined, removalReason: reason => reason,
      writeRequest: async (action, payload) => {
        assert.equal(action, "remove");
        assert.deepEqual(payload, { ...destination, collection: native ? "native" : "managed", source: undefined, skills: items.map(({ id, revision }) => ({ id, revision })) });
        return { removed: failed ? ["same"] : items.map(item => item.name), ...(native ? { removedIds: failed ? ["first"] : items.map(item => item.id) } : {}), failed };
      },
      refresh: () => { refreshed++; }, onMutation: () => { refreshed++; }, setOpenSkill() {},
      setSelection: next => { selection = next; }, setRemovalResult: next => { result = next; },
      notifySuccess: () => assert.fail("A partial result must not announce full success"), t: zh => zh,
    });
    await removeSkills(items);
    assert.deepEqual(selection, { context: "project-a", ids: failed ? ["excluded", "second"] : ["excluded"] });
    assert.equal(refreshed, 1);
    assert.equal(result.items.filter(item => item.status === "complete").length, failed ? 1 : 2);
    assert.equal(result.items.at(-1).skill, "excluded");
    assert.equal(result.items.at(-1).message, "removal-unavailable");
  }
});

test("one mixed removal confirmation keeps CLI and Trash actions separate", async () => {
  const selected = [
    { id: "shared", name: "shared", path: "/shared/SKILL.md", removable: true, revision: "r1" },
    { id: "private", name: "private", path: "/private/SKILL.md", removable: true, revision: "r2" },
  ];
  const destination = { workspace: "project-a" };
  const calls = [];
  let removal;
  const writeRequest = async (action, payload) => {
    calls.push([action, payload.collection, payload.skills.map(item => item.id)]);
    if (action === "removal-preview") return { items: selected.filter(item => item.id === payload.skills[0].id), excluded: [] };
    return payload.collection === "managed"
      ? { removed: ["shared"], failed: false }
      : { removed: ["private"], removedIds: ["private"], failed: false };
  };
  const context = "project-a", activeContext = { current: context };
  const { reviewRemoval } = handlers("src/client.tsx", ["reviewRemoval"], {
    busy: false, destination, context, activeContext, batchLimit: 10, reviewing: false,
    rememberTrigger() {}, setReviewing() {}, notifyError: () => assert.fail("Review must succeed"),
    writeRequest, setRemoval: value => { removal = value; }, skillLifecycle: item => item.id === "shared" ? "managed" : "native", t: zh => zh,
  });
  await reviewRemoval(selected, { focus() {} });
  assert.deepEqual(removal.items.map(item => item.id), ["shared", "private"]);
  assert.deepEqual(removal.kinds, { shared: "managed", private: "native" });
  let success = "", mutationCount = 0;
  const { removeSkills } = handlers("src/client.tsx", ["removeSkills"], {
    removal, context, items: selected, selecting: true, detail: undefined, writeRequest,
    onMutation: () => { mutationCount++; }, setSelection: value => assert.equal(value, undefined),
    setOpenSkill() {}, setRemovalResult: () => assert.fail("Complete removal must not show partial results"),
    notifySuccess: value => { success = value; }, t: zh => zh,
  });
  await removeSkills(selected);
  assert.deepEqual(calls, [
    ["removal-preview", "managed", ["shared"]], ["removal-preview", "native", ["private"]],
    ["remove", "managed", ["shared"]], ["remove", "native", ["private"]],
  ]);
  assert.equal(mutationCount, 1);
  assert.match(success, /2/);
});

test("a removal review resolving after a project change cannot open a confirmation in the new project", async () => {
  const pending = deferred(), activeContext = { current: "project-a" };
  let removal;
  const { reviewRemoval } = handlers("src/client.tsx", ["reviewRemoval"], {
    busy: false, destination: { preset: "standard", workspace: "project-a" }, context: "project-a", activeContext,
    rememberTrigger() {}, batchLimit: 100, setReviewing() {}, notifyError: () => assert.fail("Must not notify the obsolete project"),
    writeRequest: () => pending.promise, setRemoval: value => { removal = value; }, skillLifecycle: () => "managed", t: zh => zh,
  });
  const read = reviewRemoval([{ id: "selected", removable: true }], { focus: () => assert.fail("Must not focus the obsolete project") });
  activeContext.current = "project-b";
  pending.resolve({ items: [{ id: "selected", revision: "old-project" }], excluded: [] });
  await read;
  assert.equal(removal, undefined);
});

test("first directory confirmation remains open while saving and on failure, and closes after a verified save", async () => {
  for (const fail of [false, true]) {
    const pending = deferred();
    let confirming = 'save', busy = false, result, settled;
    const { save } = handlers("src/directories.tsx", ["fields", "apply", "save"], {
      changed: true, pending: false, pendingDirectory: false, stale: false, result: undefined, value: { overridden: false },
      draft: { defaults: true, dshHome: "  ~/custom/skills  ", agentsHome: "", additional: [" /fixture/extra "] },
      dshHomeFromSkillsPath, absolute: path => expandHomePath(path.trim(), '/fixture/home'), setErrors: value => assert.deepEqual(value, {}),
      onSave: fields => {
        assert.deepEqual(fields, { defaults: true, dshHome: "/fixture/home/custom", agentsHome: "", additional: ["/fixture/extra"] });
        assert.equal(Object.hasOwn(fields, 'watch'), false);
        return pending.promise;
      },
      onSettled: value => { settled = value; }, setEditing() {},
      setConfirming: value => { confirming = value; }, setPending: value => { busy = value; }, setResult: value => { result = value; }, notifySuccess() {}, t: zh => zh,
    });
    const writing = save(true);
    assert.equal(busy, true);
    assert.equal(confirming, 'save');
    fail ? pending.reject(Error("directory-conflict")) : pending.resolve();
    await writing;
    assert.equal(busy, false);
    assert.equal(confirming, fail ? 'save' : undefined);
    assert.equal(result, fail ? "conflict" : undefined);
    assert.equal(settled, !fail);
  }
});

test("directory save adopts the response before readback; failed discard-readback preserves the original draft", async () => {
  const selected = { id: "standard" }, fields = { defaults: false, dshHome: '', agentsHome: '', additional: ['/fixture/extra'] }, selectedDraft = { revision: "original", fields };
  const directoryDrafts = new Map([[selected.id, selectedDraft]]), events = [];
  const saved = { ...fields, revision: "written", overridden: true };
  let readResult = false;
  const callbacks = directoryCallbacks({
    selected, selectedDraft, selectedDirectory: { revision: "unexpected-newer-value" }, directoryDrafts,
    writeRequest: async (action, payload) => { assert.equal(action, "directories"); assert.equal(payload.revision, "original"); return saved; },
    directorySaved: (id, value) => { events.push(["saved", id, value]); },
    discardDraft: id => { directoryDrafts.delete(id); events.push(["discard"]); },
    reload: async () => { events.push(["readback"]); return readResult; },
  });
  await callbacks.onSave(fields);
  assert.deepEqual(events, [["saved", "standard", saved], ["discard"], ["readback"]]);
  events.length = 0;
  directoryDrafts.set(selected.id, selectedDraft);
  await callbacks.onRestore();
  assert.deepEqual(events, [["saved", "standard", saved], ["discard"], ["readback"]]);
  directoryDrafts.set(selected.id, selectedDraft);
  await assert.rejects(callbacks.reload(), /directory-readback/);
  assert.equal(directoryDrafts.get(selected.id), selectedDraft);
  readResult = true;
  await callbacks.reload();
  assert.equal(directoryDrafts.has(selected.id), false);
});

test("installation follows source, skills, target and review steps and recovers only unfinished names", async () => {
  const destination = { preset: "fixture", workspace: "project-a" };
  const state = {}, setters = Object.fromEntries(["Busy", "Message", "Uncertain", "Plan", "Result", "Selected", "Requested", "Step", "PlanDestination"].map(key => [`set${key}`, value => { state[key] = value; }]));
  const environment = {
    ...setters, step: 0, includeInternal: true, busy: false, eligible: true, destination, source: " /fixture/source ", selected: ["done", "unfinished"],
    requested: ["unfinished"], plan: undefined, t: zh => zh,
    notifySuccess: () => assert.fail("Recovery must not announce an unverified installation"),
    preview: async (source, target, internal) => { assert.equal(source, "/fixture/source"); assert.deepEqual(target, destination); assert.equal(internal, true); return { token: "retry", skills: [{ name: "done" }, { name: "unfinished" }] }; },
  };
  const submit = environment => handlers("src/installation.tsx", ["submit"], environment).submit({ preventDefault() {} });
  await submit(environment);
  assert.deepEqual(state.Selected, ["unfinished"]); assert.equal(state.Step, 1);
  assert.deepEqual(state.PlanDestination, destination);
  await submit({ ...environment, requested: [], preview: async () => ({ token: "single", skills: [{ name: "only" }] }) });
  assert.deepEqual(state.Selected, [], "Do not silently select a sole result");
  await submit({ ...environment, step: 1 }); assert.equal(state.Step, 2);
  await submit({ ...environment, step: 2, plan: { token: "existing" }, planDestination: destination }); assert.equal(state.Step, 3);
  await submit({ ...environment, step: 2, planDestination: { ...destination, workspace: null } });
  assert.equal(state.Step, 3); assert.deepEqual(state.PlanDestination, destination);
  const writing = { ...environment, step: 3, plan: { token: "install" }, install: async (_token, names, target) => { assert.deepEqual(names, ["done", "unfinished"]); assert.deepEqual(target, destination); throw Error("network-error"); } };
  await submit(writing);
  assert.equal(state.Uncertain, true); assert.equal(state.Plan, undefined); assert.equal(state.Step, 0);
  assert.deepEqual(state.Requested, ["done", "unfinished"]);
  writing.install = async () => ({ installed: ["done"], failed: true });
  await submit(writing);
  assert.deepEqual(state.Result, { installed: ["done"], failed: true }); assert.equal(state.Step, 4);
  handlers("src/installation.tsx", ["reset"], environment).reset(["unfinished"]);
  assert.deepEqual(state.Requested, ["unfinished"]); assert.equal(state.Step, 0);
});

test("a failed ownership read retains known managed items, freezes removal, and never imports another project's cache", async () => {
  const inventoryCache = { current: undefined };
  const known = { id: "managed-a", name: "fixture", managed: true, removable: true };
  let response = { ownership: "ready", partial: false, items: [known] };
  const environment = workspaceId => ({ enabled: true, config: { configuration: { path: "/fixture/profile.yml" } }, workspaceId, inventoryCache, request: async () => response });
  const load = componentCallback("src/client.tsx", "InventoryPage", "load", environment("a"));
  assert.deepEqual(await load(new AbortController().signal), response);
  response = { ownership: "error", partial: false, items: [{ id: "native-a", managed: null, removable: true }] };
  const failed = await load(new AbortController().signal);
  assert.equal(failed.ownership, "error");
  assert.equal(failed.items.find(item => item.id === known.id).managed, true);
  assert.ok(failed.items.every(item => item.removable === false));
  const other = componentCallback("src/client.tsx", "InventoryPage", "load", environment("b"));
  assert.equal((await other(new AbortController().signal)).items.some(item => item.id === known.id), false);
  response = { ownership: "ready", partial: false, items: [] };
  assert.deepEqual((await load(new AbortController().signal)).items, [], "A successful empty read must clear obsolete known entries");
});

test("pinned original Agent metadata preserves shared target and configurable Agent roots without staging", () => {
  const packageRoot = dirname(require.resolve("skills/package.json"));
  const agents = readUpstreamAgents(readFileSync(join(packageRoot, upstreamChunk), "utf8"));
  assert.equal(agents.length, 79);
  assert.equal(new Set(agents.map(agent => agent.id)).size, 79);
  assert.equal(agents.find(agent => agent.id === "codex").projectPath, ".agents/skills");
  assert.equal(agents.find(agent => agent.id === "antigravity").globalReadsCanonical, false);
  assert.equal(agents.find(agent => agent.id === "universal").globalReadsCanonical, true);
  assert.equal(agents.find(agent => agent.id === "universal").globalBase, "configHome");
  assert.equal(agents.find(agent => agent.id === "universal").globalPath, "agents/skills");
  // Installation special-cases universal to the canonical ~/.agents directory;
  // preserve the original table here rather than rewriting its declared paths.
  assert.equal(agents.find(agent => agent.id === "claude-code").globalBase, "claudeHome");
  assert.equal(agents.find(agent => agent.id === "openclaw").globalBase, "openclaw");
  assert.throws(() => readUpstreamAgents("changed upstream structure"), /table changed/);
});

test("local source preview installs through the original CLI and rejects changed source, occupied and linked destinations", t => {
  lifecycleFixture(t, `
    import assert from "node:assert/strict";
    import { lstat, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
    import { join } from "node:path";
    const [root, module] = process.argv.slice(1);
    const { managedLifecycle, managedEntries } = await import(module);
    const lifecycle = managedLifecycle((_path, write) => write());
    const source = join(root, "home", "source"), project = join(root, "project"), other = join(root, "other");
    await mkdir(project); await mkdir(other);
    const document = name => "---\\nname: " + name + "\\ndescription: Local source fixture\\n---\\nOriginal body\\n";
    for (const name of ["local-first", "local-second"]) {
      await mkdir(join(source, name), { recursive: true });
      await writeFile(join(source, name, "SKILL.md"), document(name));
    }
    await mkdir(join(source, "internal-skill"));
    await writeFile(join(source, "internal-skill/SKILL.md"), document("internal-skill").replace("description:", "metadata: { internal: true }\\ndescription:"));
    const target = { path: project }, signal = new AbortController().signal;
    const preview = await lifecycle.preview("~/source", target, signal);
    assert.deepEqual(preview.skills.map(item => item.name).sort(), ["local-first", "local-second"]);
    await assert.rejects(lifecycle.install(preview.token, ["local-first"], { path: other }), { message: "preview-expired" });
    assert.deepEqual(await lifecycle.install(preview.token, ["local-first"], target), { installed: ["local-first"], failed: false });
    const destination = join(project, ".agents/skills/local-first");
    assert.equal((await lstat(destination)).isSymbolicLink(), false);
    assert.equal(await readFile(join(destination, "SKILL.md"), "utf8"), document("local-first"));
    assert.ok(Object.hasOwn(await managedEntries(project), "local-first"));
    assert.deepEqual(await managedEntries(other), {});
    const internal = await lifecycle.preview(source, target, signal, { includeInternal: true });
    assert.equal(internal.skills.find(item => item.name === "internal-skill").internal, true);
    assert.deepEqual(await lifecycle.install(internal.token, ["internal-skill"], target), { installed: ["internal-skill"], failed: false });
    const stale = await lifecycle.preview(source, target, signal);
    await writeFile(join(source, "local-second", "attachment.txt"), "Changed after preview");
    await assert.rejects(lifecycle.install(stale.token, ["local-second"], target), { message: "preview-expired" });
    await assert.rejects(readFile(join(project, ".agents/skills/local-second/SKILL.md")), { code: "ENOENT" });
    const occupied = await lifecycle.preview(source, target, signal);
    await assert.rejects(lifecycle.install(occupied.token, ["local-first"], target), { message: "occupied" });
    const linked = await lifecycle.preview(source, { path: other }, signal);
    await symlink(join(project, ".agents"), join(other, ".agents"), "junction");
    await assert.rejects(lifecycle.install(linked.token, ["local-second"], { path: other }), /Linked or invalid installation directory/);
    assert.equal(await readFile(join(destination, "SKILL.md"), "utf8"), document("local-first"));
  `, Boolean(archive), true);
});

test("HTTPS Git URL and explicit ref are pinned before the original CLI installs", { skip: !process.env.DSH_COMPANION_GIT_SOURCE && "Select a public HTTPS Git source explicitly" }, t => {
  lifecycleFixture(t, `
    import assert from "node:assert/strict";
    import { mkdir, readFile, writeFile } from "node:fs/promises";
    import { join } from "node:path";
    const [root, module] = process.argv.slice(1);
    const { managedLifecycle, managedEntries } = await import(module);
    const lifecycle = managedLifecycle((_path, write) => write());
    const project = join(root, "project"); await mkdir(project);
    const target = { path: project };
    const preview = await lifecycle.preview(${JSON.stringify(process.env.DSH_COMPANION_GIT_SOURCE)}, target, new AbortController().signal);
    const name = preview.skills[0].name;
    const result = await lifecycle.install(preview.token, [name], target);
    assert.deepEqual(result, { installed: [name], failed: false });
    assert.ok(Object.hasOwn(await managedEntries(project), name));
    assert.match(await readFile(join(project, ".agents/skills", name, "SKILL.md"), "utf8"), new RegExp("name: " + name));
  `, Boolean(archive), true);
});

test("managed update and sync verify the recorded revision and affect only the selected project", t => {
  lifecycleFixture(t, `
    import assert from "node:assert/strict";
    import { mkdir, readFile, writeFile } from "node:fs/promises";
    import { join } from "node:path";
    const [root, module] = process.argv.slice(1);
    const { managedLifecycle, managedEntries } = await import(module);
    const lifecycle = managedLifecycle((_path, write) => write());
    const source = join(root, "source"), first = join(root, "first"), second = join(root, "second");
    await Promise.all([source, first, second].map(path => mkdir(path)));
    const file = join(source, "SKILL.md");
    const body = text => "---\\nname: update-fixture\\ndescription: Isolated update\\n---\\n" + text + "\\n";
    await writeFile(file, body("One"));
    const a = { path: first }, b = { path: second }, signal = new AbortController().signal;
    const initial = await lifecycle.preview(source, a, signal);
    assert.deepEqual(await lifecycle.install(initial.token, ["update-fixture"], a), { installed: ["update-fixture"], failed: false });
    assert.equal((await lifecycle.checkUpdates(a, ["update-fixture"], signal))[0].status, "current");
    assert.equal((await lifecycle.reviewSync(a, "update-fixture")).source, join(first, ".agents/skills/update-fixture"));
    assert.equal((await lifecycle.diffStatus(a, "update-fixture")).modified, false);
    await writeFile(file, body("Two"));
    assert.equal((await lifecycle.checkUpdates(a, ["update-fixture"], signal))[0].status, "available");
    const review = await lifecycle.reviewUpdate(a, "update-fixture", signal);
    assert.equal(review.changed, true);
    assert.equal(review.localModified, false);
    assert.deepEqual(review.changedFiles, ["SKILL.md"]);
    assert.deepEqual(await lifecycle.update(review.token, a), { updated: ["update-fixture"], failed: false });
    assert.equal((await lifecycle.checkUpdates(a, ["update-fixture"], signal))[0].status, "current");
    assert.equal(await readFile(join(first, ".agents/skills/update-fixture/SKILL.md"), "utf8"), body("Two"));
    const sync = await lifecycle.reviewSync(a, "update-fixture");
    const copied = await lifecycle.preview(sync.source, b, signal);
    assert.deepEqual(await lifecycle.install(copied.token, [sync.name], b), { installed: ["update-fixture"], failed: false });
    assert.ok(Object.hasOwn(await managedEntries(second), "update-fixture"));
    const global = { path: null };
    const globalInstall = await lifecycle.preview(source, global, signal);
    assert.deepEqual(await lifecycle.install(globalInstall.token, ["update-fixture"], global), { installed: ["update-fixture"], failed: false });
    assert.equal((await lifecycle.reviewSync(global, "update-fixture")).name, "update-fixture");
    await writeFile(file, body("Three"));
    assert.equal((await lifecycle.checkUpdates(global, ["update-fixture"], signal))[0].status, "available");
    const globalReview = await lifecycle.reviewUpdate(global, "update-fixture", signal);
    assert.equal(globalReview.changed, true);
    assert.deepEqual(await lifecycle.update(globalReview.token, global), { updated: ["update-fixture"], failed: false });
    assert.equal(await readFile(join(root, "home/.agents/skills/update-fixture/SKILL.md"), "utf8"), body("Three"));
    assert.equal(await readFile(join(second, ".agents/skills/update-fixture/SKILL.md"), "utf8"), body("Two"));
    await writeFile(join(first, ".agents/skills/update-fixture/SKILL.md"), body("Local edit"));
    const status = await lifecycle.diffStatus(a, "update-fixture");
    assert.equal(status.modified, true);
    await assert.rejects(lifecycle.reviewDiff(a, "update-fixture", status.revision, signal), { message: "diff-unavailable" });
    await writeFile(file, body("Two"));
    const difference = await lifecycle.reviewDiff(a, "update-fixture", status.revision, signal);
    assert.equal(difference.files.length, 1);
    assert.equal(difference.files[0].path, "SKILL.md");
    assert.match(difference.files[0].diff, /-Two/);
    assert.ok(difference.files[0].diff.includes("+Local edit"));
    await assert.rejects(lifecycle.reviewDiff(a, "update-fixture", "0".repeat(64), signal), { message: "diff-changed" });
    await assert.rejects(lifecycle.reviewSync(a, "update-fixture"), { message: "sync-unavailable" });
    assert.equal(await readFile(join(second, ".agents/skills/update-fixture/SKILL.md"), "utf8"), body("Two"));
  `, Boolean(archive), true);
});

test("website index and direct skill download preview through the pinned provider before original CLI installation", t => {
  lifecycleFixture(t, `
    import assert from "node:assert/strict";
    import { createServer } from "node:http";
    import { mkdir, readFile, writeFile } from "node:fs/promises";
    import { join } from "node:path";
    const [root, module] = process.argv.slice(1);
    const { managedLifecycle, managedEntries } = await import(module);
    const lifecycle = managedLifecycle((_path, write) => write());
    const project = join(root, "project"); await mkdir(project);
    const skill = name => "---\\nname: " + name + "\\ndescription: Website fixture\\n---\\nWebsite body\\n";
    let indexed = false;
    let websiteBody = skill("website-fixture");
    const server = createServer((request, response) => {
      if (indexed && request.url === "/.well-known/agent-skills/index.json") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ skills: [{ name: "website-fixture", description: "Website fixture", files: ["SKILL.md"] }] }));
      } else if (request.url === "/.well-known/agent-skills/website-fixture/SKILL.md") response.end(websiteBody);
      else if (request.url === "/direct/SKILL.md") response.end(skill("download-fixture"));
      else { response.statusCode = 404; response.end(); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const origin = "http://127.0.0.1:" + server.address().port;
      const target = { path: project }, signal = new AbortController().signal;
      const direct = await lifecycle.preview(origin + "/direct/SKILL.md", target, signal);
      assert.deepEqual(direct.skills.map(row => row.name), ["download-fixture"]);
      assert.deepEqual(await lifecycle.install(direct.token, ["download-fixture"], target), { installed: ["download-fixture"], failed: false, collection: "native" });
      assert.equal(await readFile(join(project, ".agents/skills/download-fixture/SKILL.md"), "utf8"), skill("download-fixture"));
      indexed = true;
      const website = await lifecycle.preview(origin, target, signal);
      assert.deepEqual(website.skills.map(row => row.name), ["website-fixture"]);
      websiteBody += "Changed before install\\n";
      await assert.rejects(lifecycle.install(website.token, ["website-fixture"], target), { message: "preview-expired" });
      assert.ok(!Object.hasOwn(await managedEntries(project), "website-fixture"));
      websiteBody = skill("website-fixture");
      const refreshed = await lifecycle.preview(origin, target, signal);
      assert.deepEqual(await lifecycle.install(refreshed.token, ["website-fixture"], target), { installed: ["website-fixture"], failed: false });
      assert.ok(Object.hasOwn(await managedEntries(project), "website-fixture"));
      websiteBody += "Version two\\n";
      const update = await lifecycle.reviewUpdate(target, "website-fixture", signal);
      assert.equal(update.changed, true);
      assert.deepEqual(await lifecycle.update(update.token, target), { updated: ["website-fixture"], failed: false });
      assert.equal(await readFile(join(project, ".agents/skills/website-fixture/SKILL.md"), "utf8"), websiteBody);
      assert.equal((await lifecycle.diffStatus(target, "website-fixture")).modified, false);
      await writeFile(join(project, ".agents/skills/website-fixture/SKILL.md"), websiteBody + "Local edit\\n");
      const status = await lifecycle.diffStatus(target, "website-fixture");
      assert.equal(status.modified, true);
      const difference = await lifecycle.reviewDiff(target, "website-fixture", status.revision, signal);
      assert.equal(difference.files[0].path, "SKILL.md");
      assert.ok(difference.files[0].diff.includes("+Local edit"));
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  `, Boolean(archive), true);
});

test("directory save and restore change only four fields using the real inherited callback contract", {
  skip: !process.env.SKILLS_SPACE_DSH_TEST_DESKTOP && "Select the official Electron runtime explicitly",
}, t => officialHostFixture(t, `
  import assert from "node:assert/strict";
  import { mkdir, writeFile } from "node:fs/promises";
  import { join } from "node:path";
  const [root, module] = process.argv.slice(1);
  const { apply } = await import(module);
  const dshHome = join(root, "home/.dsh"), profileDir = join(dshHome, "profiles/fixture");
  await mkdir(profileDir, { recursive: true });
  await writeFile(join(profileDir, "package.json"), JSON.stringify({ private: true, dsh: { profile: { bundles: [] } } }));
  let patchPath = join(profileDir, "cordis.patch.yml");
  const directoryKeys = ["includeDefaultRoots", "dshHome", "agentsHome", "customSkillDirs"];
  let wrapped = false;
  const provider = config => ({ id: "filesystem", name: wrapped ? "@skills-space/dsh-skill-policy" : "@deepseek-ai/dsh-skill-filesystem", config: wrapped ? { filesystem: config, opaque: { keep: true } } : config });
  let current, inherited, overridden = true, route;
  const entry = { options: { id: "fixture-preset", name: "@deepseek-ai/dsh-agent-preset" } };
  const persist = () => writeFile(patchPath, JSON.stringify([{ insert: [{ ...entry.options, config: current }] }]));
  const ctx = {
    profileContext: { home: dshHome, dir: profileDir, profileDir, patchPath,
      installAnchor: "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/package.json", startedBundles: [], overlays: [] },
    connection: { fetch: { register: value => { route = value; return () => {}; } } }, loader: { entries: () => [] },
    configEditor: {
      entries: () => [entry], configuration: () => [{ entry, inherited, override: overridden ? current : {} }],
      async edit(actual, change) { assert.equal(actual, entry); current = change(structuredClone(current), structuredClone(inherited)); overridden = true; await persist(); },
    },
    workspaceRegistry: { list: () => [] }, effect: setup => setup(), on: () => () => {}, get: () => undefined, logger: { warn() {} },
  };
  await apply(ctx);
  const bootstrap = async () => (await route.fetch(new Request("http://localhost/api/dsh-skills-space"))).json();
  const post = input => route.fetch(new Request("http://localhost/api/dsh-skills-space?action=directories", {
    method: "POST", headers: { Host: "localhost", "Content-Type": "application/json", "X-DSH-Skills-Space": "directories" }, body: JSON.stringify(input),
  }));
  const { providerConfig } = await import(new URL("./dist/directory-config.mjs", module));
  const unrelated = preset => ({ ...preset, plugins: preset.plugins.map(row => row.id !== "filesystem" ? row : { ...row, config: { ...row.config, ...(wrapped ? { filesystem: Object.fromEntries(Object.entries(providerConfig(row)).filter(([key]) => !directoryKeys.includes(key))) } : Object.fromEntries(directoryKeys.map(key => [key, undefined]))) } }) });
  for (wrapped of [false, true]) for (const watch of [
    { watch: false, watchUsePolling: true, watchMaxProjects: 17, watchPollIntervalMs: 555, watchFollowSymlinks: false },
    { watch: { __js__: "process.env.FIXTURE_WATCH" }, watchStabilityThresholdMs: { __js__: "500" }, unknownOption: { preserve: true } },
    {},
  ]) {
    inherited = { id: "fixture", name: "Custom name", description: "Custom purpose", unknownPreset: { preserve: "yes" }, plugins: [provider({
      includeDefaultRoots: true, dshHome: join(root, "inherited-dsh"), agentsHome: join(root, "inherited-agents"), customSkillDirs: [join(root, "inherited-extra")], watch: true,
    }), { id: "untouched", name: "fixture-untouched", config: { keep: "unchanged" } }] };
    current = { ...structuredClone(inherited), plugins: [provider({ ...Object.fromEntries(Object.entries(providerConfig(inherited.plugins[0])).filter(([key]) => directoryKeys.includes(key))), ...watch }), inherited.plugins[1]] };
    overridden = true;
    const original = structuredClone(current); await persist();
    const before = (await bootstrap()).presets[0];
    assert.equal(before.name, "Custom name"); assert.equal(before.description, "Custom purpose");
    assert.equal(before.directoryEdit.canRestore, false, "Watch-only overrides must not show directory restore");
    const save = await post({ preset: "fixture", revision: before.directoryEdit.revision, confirmOverride: true,
      fields: { defaults: false, dshHome: join(root, "new-dsh"), agentsHome: join(root, "new-agents"), additional: [join(root, "extra-one"), join(root, "extra-two")] } });
    assert.equal(save.status, 200); const saved = await save.json();
    assert.equal(saved.defaults, false); assert.equal(saved.canRestore, true);
    assert.deepEqual(unrelated(current), unrelated(original), "Saving directories must preserve every watch/unknown field and other plugin");
    assert.equal((await post({ preset: "fixture", revision: before.directoryEdit.revision, reset: true, confirmOverride: true })).status, 409);
    const restore = await post({ preset: "fixture", revision: saved.revision, reset: true, confirmOverride: true });
    assert.equal(restore.status, 200); const restored = await restore.json();
    assert.equal(restored.canRestore, false); assert.equal(restored.defaults, true);
    assert.deepEqual(restored.additional, [join(root, "inherited-extra")]);
    assert.equal(restored.dshHome, join(root, "inherited-dsh")); assert.equal(restored.agentsHome, join(root, "inherited-agents"));
    assert.deepEqual(unrelated(current), unrelated(original), "Restoring inherited directories must preserve current watch/unknown fields, including absent fields");
    assert.equal((await bootstrap()).presets[0].directoryEdit.canRestore, false);
  }
  const { createRequire } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const runtime = createRequire(ctx.profileContext.installAnchor);
  const boot = await import(pathToFileURL(runtime.resolve("@deepseek-ai/dsh-app-boot")).href);
  const creatorFile = join(runtime.resolve("@deepseek-ai/dsh-web-app/package.json"), "../presets/cordis.patch.yml");
  const creator = boot.composeEntries([boot.loadOverlayPatches("dsh", creatorFile)])[0].config;
  for (const profileName of ["desktop", "web", "custom"]) {
    const directory = join(dshHome, "profiles", profileName);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "package.json"), JSON.stringify({ private: true, dsh: { profile: { bundles: [] } } }));
    ctx.profileContext.dir = directory; ctx.profileContext.patchPath = patchPath = join(directory, "cordis.patch.yml");
    current = { id: "minimal", plugins: [] }; inherited = structuredClone(current); await persist();
    let data = await bootstrap();
    assert.equal(data.presets[0].directoryReadOnly, "no-provider");
    assert.equal(data.presets[0].directoryEdit, undefined);
    assert.equal(data.presets[0].directories.length, 0);
    assert.ok(data.configuration.path.endsWith("/profiles/" + profileName + "/cordis.patch.yml"));
    current = { id: "dynamic", plugins: { __js__: "plugins" } }; inherited = structuredClone(current); await persist();
    assert.equal((await bootstrap()).presets[0].directoryReadOnly, "unknown-provider");
    current = structuredClone(creator); inherited = structuredClone(creator); await persist();
    const beforeCreator = structuredClone(current); data = await bootstrap();
    const preset = data.presets[0];
    assert.equal(preset.id, "cordis");
    assert.equal(preset.directoryReadOnly, null);
    assert.deepEqual(preset.directoryEdit.unresolvedFields, ["customSkillDirs"]);
    assert.deepEqual(preset.directoryEdit.additionalDirectoryLayout, { entries: [null], builtin: true, dynamic: false });
    const saved = await post({ preset: "cordis", revision: preset.directoryEdit.revision, confirmOverride: true, fields: { defaults: false, dshHome: "", agentsHome: "", additional: [] } });
    assert.equal(saved.status, 200);
    const originalProvider = beforeCreator.plugins.find(row => row.id === "skill-filesystem");
    const changedProvider = current.plugins.find(row => row.id === "skill-filesystem");
    assert.deepEqual(changedProvider.config.customSkillDirs, originalProvider.config.customSkillDirs);
    assert.equal(changedProvider.config.includeDefaultRoots, false);
    const response = await saved.json();
    const first = join(root, "custom-first"), last = join(root, "custom-last");
    const mixed = await post({ preset: "cordis", revision: response.revision, confirmOverride: true,
      fields: { defaults: false, dshHome: "", agentsHome: "", additional: [first, null, last] } });
    assert.equal(mixed.status, 200);
    const afterMixed = await mixed.json();
    assert.deepEqual(afterMixed.additional, [first, null, last]);
    const edited = await post({ preset: "cordis", revision: afterMixed.revision, confirmOverride: true,
      fields: { defaults: false, dshHome: "", agentsHome: "", additional: [null, last] } });
    assert.equal(edited.status, 200);
    assert.deepEqual(current.plugins.find(row => row.id === "skill-filesystem").config.customSkillDirs,
      [...originalProvider.config.customSkillDirs, last]);
    assert.equal((await post({ preset: "cordis", revision: (await edited.json()).revision, reset: true, confirmOverride: true })).status, 200);
    assert.deepEqual(current, beforeCreator);
  }

`));

test("official provider keeps undiscovered managed skills scoped and protects shared, bundled and other-Agent creation roots", {
  skip: !process.env.SKILLS_SPACE_DSH_TEST_DESKTOP && "Select the official Electron runtime explicitly",
}, (t) => {
  officialHostFixture(t, `
    import assert from "node:assert/strict";
    import { execFileSync } from "node:child_process";
    import { chmod, link, mkdir, readFile, writeFile } from "node:fs/promises";
    import { dirname, join } from "node:path";
    import childProcess from "node:child_process";
    import { syncBuiltinESMExports } from "node:module";
    const [root, module, cliPackage] = process.argv.slice(1);
    const { apply } = await import(module);
    const revealed = [], originalExec = childProcess.execFile;
    childProcess.execFile = (file, args, options, callback) => {
      if (file !== "/usr/bin/open") return originalExec(file, args, options, callback);
      revealed.push(args); queueMicrotask(() => callback(null)); return {};
    };
    syncBuiltinESMExports();
    const home = join(root, "home"), dshHome = join(home, ".dsh"), profileDir = join(dshHome, "profiles", "fixture");
    const project = join(root, "project"), other = join(root, "other"), extra = join(root, "independent"), bundled = join(root, "bundled");
    for (const path of [profileDir, project, other, extra, bundled]) await mkdir(path, { recursive: true });
    const patchPath = join(profileDir, "cordis.patch.yml");
    await writeFile(join(profileDir, "package.json"), JSON.stringify({ private: true, dsh: { profile: { bundles: [] } } }));
    const filesystem = "@deepseek-ai/dsh-skill-filesystem";
    const preset = plugins => ({ id: "fixture-preset", name: "@deepseek-ai/dsh-agent-preset", config: { id: "fixture", name: "Fixture", plugins } });
    const setRows = rows => writeFile(patchPath, JSON.stringify([{ insert: rows }]));
    const provider = config => ({ id: "filesystem", name: filesystem, config: { watch: false, ...config } });
    await setRows([preset([provider({ includeDefaultRoots: false })])]);
    const source = join(root, "source", "scope-fixture");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "SKILL.md"), "---\\nname: scope-fixture\\ndescription: An isolated managed fixture\\n---\\nFixture body\\n");
    const cli = join(dirname(cliPackage), "bin", "cli.mjs");
    for (const cwd of [home, project, other]) execFileSync(process.execPath, [cli, "add", dirname(source), "--agent", "universal", "--skill", "scope-fixture", "--yes", "--copy", ...(cwd === home ? ["--global"] : [])], { cwd });
    let route, sessionFsAccesses = 0;
    const sessionFs = { resolve: () => new Promise(() => {}) };
    const ctx = {
      profileContext: { home: dshHome, dir: profileDir, profileDir, patchPath,
        installAnchor: "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/package.json", startedBundles: [], overlays: [] },
      connection: { fetch: { register: value => { route = value; return () => {}; } } },
      loader: { entries: () => [] }, configEditor: { entries: () => [], configuration: () => [] },
      workspaceRegistry: { list: () => [{ id: "a", title: "A", path: project }, { id: "b", title: "B", path: other }, { id: "nested", title: "Nested", path: join(other, "nested") }] },
      effect: setup => setup(), on: () => () => {}, get: name => { if (name === "fs") { sessionFsAccesses++; return sessionFs; } }, logger: { warn() {} },
    };
    await apply(ctx);
    const get = query => route.fetch(new Request("http://localhost/api/dsh-skills-space?" + new URLSearchParams(query)));
    const post = (action, payload) => route.fetch(new Request("http://localhost/api/dsh-skills-space?action=" + action, {
      method: "POST", headers: { Host: "localhost", "Content-Type": "application/json", "X-DSH-Skills-Space": action }, body: JSON.stringify(payload),
    }));
    const global = await (await get({ preset: "fixture" })).json();
    assert.equal(sessionFsAccesses, 0, "Inventory must not enter the conversation filesystem");
    const a = await (await get({ preset: "fixture", workspace: "a" })).json();
    const b = await (await get({ preset: "fixture", workspace: "b" })).json();
    for (const value of [global, a, b]) {
      assert.equal(value.items.length, 1);
      assert.equal(value.items[0].managed, true);
      assert.equal(value.items[0].discoverable, false);
      assert.equal(value.items[0].removable, true);
    }
    assert.notEqual(global.items[0].id, a.items[0].id);
    assert.notEqual(a.items[0].id, b.items[0].id);
    assert.equal(global.policy.status, "ready");
    assert.equal(global.items[0].state.canSetPolicy, true);
    const policyFile = join(dshHome, "skills-space/skill-policy.json");
    const instruction = join(home, ".agents/skills/scope-fixture/SKILL.md");
    const instructionBytes = await readFile(instruction, "utf8");
    const policyRequest = (inventory, operation, skills = inventory.items) => ({ preset: "fixture", workspace: null, operation,
      policyRevision: inventory.policy.revision, configurationRevision: inventory.configurationRevision,
      skills: skills.map(item => ({ id: item.id, revision: item.state?.documentRevision ?? item.revision, file: "/must-not-be-used/SKILL.md" })),
    });
    const plan = await post("policy-preview", policyRequest(global, "model-off"));
    assert.equal(plan.status, 200);
    const policyPlan = await plan.json();
    assert.equal(policyPlan.items.length, 1); assert.deepEqual(policyPlan.excluded, []);
    const changed = await post("policy", policyRequest(global, "model-off", policyPlan.items));
    assert.equal(changed.status, 200);
    assert.deepEqual((await changed.json()).changedIds, [global.items[0].id]);
    const limited = await (await get({ preset: "fixture" })).json();
    assert.equal(limited.items[0].state.modelInvocable, false);
    assert.equal(limited.items[0].state.userInvocable, true);
    assert.equal((await post("policy", policyRequest(global, "disable"))).status, 409, "A stale policy revision must not overwrite the newer rule");
    const lockedBytes = await readFile(policyFile, "utf8");
    assert.equal(JSON.parse(lockedBytes).rules[0].file, instruction, "Only inventory-resolved canonical paths may be persisted");
    await writeFile(instruction, instructionBytes + "\\nExternal document edit\\n");
    assert.equal((await post("policy", policyRequest(limited, "disable"))).status, 409, "A stale document revision must reject the complete write");
    assert.equal(await readFile(policyFile, "utf8"), lockedBytes);
    await writeFile(instruction, instructionBytes);
    const restoredDocument = await (await get({ preset: "fixture" })).json();
    assert.equal((await post("policy", { ...policyRequest(restoredDocument, "disable"), configurationRevision: "stale" })).status, 409);
    assert.equal((await post("policy", { ...policyRequest(a, "disable"), workspace: "a", skills: [{ id: global.items[0].id, revision: global.items[0].state.documentRevision }] })).status, 409);
    const enabled = await post("policy", policyRequest(restoredDocument, "model-on")); assert.equal(enabled.status, 200);
    assert.equal(await readFile(instruction, "utf8"), instructionBytes);
    await writeFile(policyFile, "{broken-policy");
    const brokenPolicy = await (await get({ preset: "fixture" })).json();
    assert.equal(brokenPolicy.items.length, 1); assert.equal(brokenPolicy.policy.status, "error");
    assert.equal(brokenPolicy.items[0].state.canSetPolicy, false);
    await writeFile(policyFile, lockedBytes);
    assert.equal((await get({ preset: "fixture", workspace: "unknown" })).status, 404);
    const foreignRemoval = await post("removal-preview", { preset: "fixture", workspace: "a", skills: [{ id: b.items[0].id }] });
    assert.equal(foreignRemoval.status, 200);
    const foreignPlan = await foreignRemoval.json();
    assert.deepEqual(foreignPlan.items, []);
    assert.equal(foreignPlan.excluded[0].id, b.items[0].id);
    const mixedRemoval = await post("removal-preview", { preset: "fixture", workspace: "a", skills: [{ id: a.items[0].id }, { id: b.items[0].id }] });
    const mixedPlan = await mixedRemoval.json();
    assert.equal(mixedRemoval.status, 200);
    assert.deepEqual(mixedPlan.items.map(item => item.id), [a.items[0].id]);
    assert.deepEqual(mixedPlan.excluded.map(item => item.id), [b.items[0].id]);
    const bodyResponse = await get({ preset: "fixture", workspace: "a", skill: a.items[0].id });
    assert.equal(bodyResponse.status, 200, "An inventory item must provide its source document");
    const body = await bodyResponse.json();
    assert.match(body.content, /Fixture body/);
    assert.equal((await post("reveal", { preset: "fixture", workspace: "a", skill: b.items[0].id })).status, 409);
    assert.deepEqual(revealed, []);
    assert.equal((await post("reveal", { preset: "fixture", workspace: "a", skill: a.items[0].id })).status, 200);
    assert.deepEqual(revealed, [["-R", join(project, ".agents/skills/scope-fixture/SKILL.md")]], "Only the verified scope path reaches the native adapter");
    assert.deepEqual(await (await post("preview", { preset: "fixture", workspace: "a", source: "" })).json(), { error: "source" }, "Unknown discovery must not reject the destination before source validation");
    const lockPath = join(project, "skills-lock.json"), lockBytes = await readFile(lockPath, "utf8");
    for (const invalid of ["{broken-json", JSON.stringify({ version: 99, skills: {} })]) {
      await writeFile(lockPath, invalid);
      const unknown = await (await get({ preset: "fixture", workspace: "a" })).json();
      assert.equal(unknown.ownership, "error");
      assert.equal(unknown.partial, false, "Lock failure is distinct from directory discovery failure");
      assert.equal((await (await get({ preset: "fixture", workspace: "b" })).json()).ownership, "ready");
    }
    await setRows([preset([provider({ includeDefaultRoots: true })])]);
    const visibleUnknown = await (await get({ preset: "fixture", workspace: "a" })).json();
    assert.equal(visibleUnknown.ownership, "error");
    assert.equal(visibleUnknown.items[0].managed, null);
    assert.equal(visibleUnknown.items[0].removable, false);
    const unknownRemoval = await post("removal-preview", { preset: "fixture", workspace: "a", collection: "managed", skills: [{ id: a.items[0].id }] });
    assert.equal(unknownRemoval.status, 200);
    const unknownPlan = await unknownRemoval.json();
    assert.deepEqual(unknownPlan.items, []);
    assert.equal(unknownPlan.excluded[0].id, a.items[0].id);
    assert.match(await readFile(join(project, ".agents/skills/scope-fixture/SKILL.md"), "utf8"), /Fixture body/);
    await writeFile(lockPath, lockBytes);
    await setRows([preset([])]);
    assert.equal((await (await get({ preset: "fixture", workspace: "a" })).json()).items[0].managed, true);
    await setRows([]);
    const withoutPreset = await (await get({ preset: "", workspace: "a" })).json();
    assert.equal(withoutPreset.items[0].managed, true, "No preset must still allow managed inventory");
    assert.deepEqual(await (await post("preview", { preset: "", workspace: "a", source: "" })).json(), { error: "source" });
    assert.equal((await get({ preset: "stale", workspace: "a" })).status, 404, "A removed preset ID must not become the no-preset context");
    const review = await (await post("removal-preview", { preset: "", workspace: "a", skills: [{ id: a.items[0].id }] })).json();
    assert.equal(review.items.length, 1);
    assert.deepEqual(review.excluded, []);
    const removal = await post("remove", { preset: "", workspace: "a", skills: review.items.map(({ id, revision }) => ({ id, revision })) });
    assert.equal(removal.status, 200);
    assert.deepEqual(await removal.json(), { removed: ["scope-fixture"], failed: false });
    await assert.rejects(readFile(join(project, ".agents/skills/scope-fixture/SKILL.md")), { code: "ENOENT" });
    assert.deepEqual(JSON.parse(await readFile(join(project, "skills-lock.json"), "utf8")).skills, {});
    assert.match(await readFile(join(home, ".agents/skills/scope-fixture/SKILL.md"), "utf8"), /Fixture body/);
    assert.match(await readFile(join(other, ".agents/skills/scope-fixture/SKILL.md"), "utf8"), /Fixture body/);
    await setRows([preset([provider({ customSkillDirs: [extra, join(home, ".claude/skills"), bundled, join(home, ".agents/skills")], bundledSkillDir: bundled })])]);
    const creation = (await (await get({ preset: "fixture" })).json()).creation;
    assert.ok(creation.some(choice => choice.path === extra));
    assert.ok(creation.some(choice => choice.path === "~/.dsh/skills"));
    assert.equal(creation.length, 2, "Shared, bundled and other-Agent directories must not be offered");
    const chosen = creation.find(choice => choice.path === extra);
    const created = await post("create", { preset: "fixture", workspace: null, directory: chosen.id, revision: chosen.revision, name: "custom-created" });
    assert.equal(created.status, 200);
    assert.match(await readFile(join(extra, "custom-created/SKILL.md"), "utf8"), /name: custom-created/);
    await setRows([preset([provider({ customSkillDirs: [extra], includeDefaultRoots: false })])]);
    assert.equal((await post("create", { preset: "fixture", workspace: null, directory: chosen.id, revision: chosen.revision, name: "stale-created" })).status, 409);
    await assert.rejects(readFile(join(extra, "stale-created/SKILL.md")), { code: "ENOENT" });
    const document = name => "---\\nname: " + name + "\\ndescription: Native boundary fixture\\n---\\nBody\\n";
    for (const name of ["hard-linked", "nested-owner"]) {
      await mkdir(join(extra, name));
      await writeFile(join(extra, name, "SKILL.md"), document(name));
    }
    const independent = join(root, "independent-attachment.txt");
    await writeFile(independent, "Keep this independent content");
    await link(independent, join(extra, "hard-linked", "attachment.txt"));
    await mkdir(join(extra, "nested-owner", "nested"));
    await writeFile(join(extra, "nested-owner", "nested", "SKILL.md"), document("nested"));
    const nativeInventory = await (await get({ preset: "fixture" })).json();
    const nativeNames = ["custom-created", "hard-linked", "nested-owner"];
    const nativeItems = nativeInventory.items.filter(item => nativeNames.includes(item.name));
    const nativeReview = await post("removal-preview", { preset: "fixture", collection: "native", skills: nativeItems.map(({ id }) => ({ id })) });
    assert.equal(nativeReview.status, 200);
    const mixed = await nativeReview.json();
    assert.deepEqual(mixed.items.map(item => item.name), ["custom-created"]);
    assert.deepEqual(mixed.excluded.map(item => item.name).sort(), ["hard-linked", "nested-owner"]);
    assert.deepEqual(Object.fromEntries(mixed.excluded.map(item => [item.name, item.reason])), {
      "hard-linked": "removal-shared-file", "nested-owner": "removal-nested-skill",
    });
    assert.equal(await readFile(independent, "utf8"), "Keep this independent content");
    const alternative = join(home, ".config/agents/skills/scope-fixture");
    await mkdir(alternative, { recursive: true });
    await writeFile(join(alternative, "SKILL.md"), document("scope-fixture"));
    const managedReview = await (await post("removal-preview", { preset: "fixture", collection: "managed", skills: [{ id: global.items[0].id }] })).json();
    assert.deepEqual(managedReview.items, []);
    assert.equal(managedReview.excluded[0].reason, "removal-shared-alternative");
    assert.match(await readFile(join(other, "skills-lock.json"), "utf8"), /scope-fixture/);
    const nativeGlobal = join(dshHome, "skills", "scope-fixture");
    const nativeProject = join(other, ".dsh/skills/scope-fixture");
    for (const path of [nativeGlobal, nativeProject]) { await mkdir(path, { recursive: true }); await writeFile(join(path, "SKILL.md"), document("scope-fixture")); }
    for (const dynamic of [{ dshHome: { dynamic: true }, agentsHome: join(home, ".agents") }, { dshHome, agentsHome: { dynamic: true } }]) {
      await setRows([preset([provider(dynamic)])]);
      const knownGlobal = await (await get({ preset: "fixture" })).json();
      assert.equal(knownGlobal.partial, true);
      const knownSource = typeof dynamic.dshHome === "object" ? "user-agents" : "user-dsh";
      assert.ok(knownGlobal.items.some(item => item.source === knownSource && item.discoverable));
      const knownProject = await (await get({ preset: "fixture", workspace: "b" })).json();
      assert.equal(knownProject.items.find(item => item.source === "project-dsh").shadowed, false);
      assert.equal(knownProject.items.find(item => item.source === "project-agents").shadowed, true);
      const native = knownProject.items.find(item => item.source === "project-dsh");
      const original = await (await get({ preset: "fixture", workspace: "b", skill: native.id })).json();
      assert.match(original.content, /^---\\nname: scope-fixture/, "Source view must retain original frontmatter");
    }
    const creator = { id: "creator-preset", name: "@deepseek-ai/dsh-agent-preset", config: { id: "creator", plugins: [provider({ includeDefaultRoots: false, customSkillDirs: [extra, join(home, ".agents/skills")] })] } };
    await setRows([preset([provider({ includeDefaultRoots: true })]), creator]);
    const aggregate = await (await get({ inventory: "1" })).json();
    assert.equal(new Set(aggregate.items.map(item => item.id)).size, aggregate.items.length);
    const shared = aggregate.items.find(item => item.name === "scope-fixture" && item.cliAddressable);
    assert.equal(shared.managed, true); assert.equal(shared.discoverable, true);
    assert.equal(shared.managedRemovable, true); assert.equal(shared.nativeRemovable, false);
    assert.equal(shared.shadowed, false, "A winner in one preset is not shadowed everywhere");
    assert.deepEqual(Object.fromEntries(shared.memberships.map(member => [member.presetKey, member.shadowed])), { fixture: true, creator: false });
    assert.equal(shared.installation.sourceType, "local");
    assert.ok(shared.installation.source.includes("source"));
    const aggregateBody = await (await get({ inventory: "1", skill: shared.id })).json();
    assert.match(aggregateBody.content, /Fixture body/);
    const cannotTrash = await (await post("removal-preview", { collection: "native", skills: [{ id: shared.id }] })).json();
    assert.deepEqual(cannotTrash.items, []); assert.equal(cannotTrash.excluded[0].id, shared.id);
    await setRows([preset([provider({ includeDefaultRoots: true })]), { ...creator, config: { ...creator.config, name: "Changed creator name" } }]);
    const renamed = await (await get({ inventory: "1" })).json();
    assert.equal(renamed.managedConfigurationRevision, aggregate.managedConfigurationRevision);
    assert.notEqual(renamed.configurationRevision, aggregate.configurationRevision);
    const managedPolicy = await post("policy-preview", { collection: "managed", preset: "stale-native-filter", operation: "model-on", configurationRevision: aggregate.managedConfigurationRevision, policyRevision: aggregate.policy.revision, skills: [{ id: shared.id, revision: shared.state.documentRevision }] });
    assert.equal(managedPolicy.status, 200);
    assert.equal((await managedPolicy.json()).items[0].id, shared.id);
    const untrackedPath = join(home, ".agents/skills/untracked-shared");
    await mkdir(untrackedPath); await writeFile(join(untrackedPath, "SKILL.md"), document("untracked-shared"));
    const untracked = (await (await get({ inventory: "1" })).json()).items.find(item => item.name === "untracked-shared");
    assert.equal(untracked.managed, false); assert.equal(untracked.cliAddressable, true);
    assert.equal(untracked.managedRemovable, true); assert.equal(untracked.nativeRemovable, false);
    const untrackedReview = await (await post("removal-preview", { collection: "managed", skills: [{ id: untracked.id }] })).json();
    assert.equal(untrackedReview.items.length, 1, JSON.stringify(untrackedReview));
    const untrackedRemoved = await (await post("remove", { collection: "managed", skills: untrackedReview.items.map(({ id, revision }) => ({ id, revision })) })).json();
    assert.deepEqual(untrackedRemoved, { removed: ["untracked-shared"], failed: false });
    await assert.rejects(readFile(join(untrackedPath, "SKILL.md")), { code: "ENOENT" });
    await mkdir(join(other, ".git"));
    const nestedRoot = join(other, "nested/.agents/skills/nested-skill");
    await mkdir(nestedRoot, { recursive: true }); await writeFile(join(nestedRoot, "SKILL.md"), document("nested-skill"));
    const nested = (await (await get({ inventory: "1", workspace: "nested" })).json()).items.find(item => item.name === "nested-skill");
    assert.equal(nested.cliAddressable, true); assert.equal(nested.managedRemovable, false);
    assert.equal(nested.nativeRemovable, false); assert.equal(nested.removable, false);
    assert.equal((await post("removal-preview", { collection: "managed", workspace: "nested", skills: [{ id: nested.id }] })).status, 409);
    const dynamicCreator = { ...creator, config: { ...creator.config, plugins: [provider({ includeDefaultRoots: true, customSkillDirs: { __js__: "([])" } })] } };
    await setRows([preset([provider({ includeDefaultRoots: true })]), dynamicCreator]);
    const runtimeDirectories = await (await get({ inventory: "1" })).json();
    assert.deepEqual(runtimeDirectories.runtimePresets, ["creator"]);
    assert.deepEqual(runtimeDirectories.readFailedPresets, []);
    assert.equal(runtimeDirectories.managedPartial, false);
    const lockedRoot = join(root, "unreadable-directory");
    await mkdir(lockedRoot); await chmod(lockedRoot, 0);
    try {
      await setRows([preset([provider({ includeDefaultRoots: false, customSkillDirs: [lockedRoot] })])]);
      const unreadableDirectories = await (await get({ inventory: "1" })).json();
      assert.deepEqual(unreadableDirectories.runtimePresets, []);
      assert.deepEqual(unreadableDirectories.readFailedPresets, ["fixture"]);
      assert.equal(unreadableDirectories.managedPartial, false);
    } finally { await chmod(lockedRoot, 0o700); }
  `);
});


test("shared installation progress dismisses its loading notification when a phase finishes", () => {
  const effects = [], calls = [];
  const { useInstallationProgress } = handlers("../../src/lib/notifications.ts", ["useInstallationProgress"], {
    useId: () => "install-progress", useEffect: effect => effects.push(effect),
    toast: { loading: (_label, options) => calls.push(["loading", options.id]), dismiss: id => calls.push(["dismiss", id]) },
  });
  useInstallationProgress({ stage: "checking", detail: null, completed: 0, total: 0 }, true);
  effects[0]();
  useInstallationProgress(null, true);
  effects[2]();
  assert.deepEqual(calls, [["loading", "install-progress"], ["dismiss", "install-progress"]]);
});


test("managed and discovery projections overlap while preset filtering preserves lifecycle ownership", () => {
  const { managedSkills, nativeSkills, inventorySkills, skillLifecycle, inventorySourceKey, filterInventory } = handlers("src/inventory.ts", ["asInstalled", "managedSkills", "nativeSkills", "inventorySkills", "skillLifecycle", "inventorySourceKey", "filterInventory"], { filterManagedSkills, managedSkillEnabled, filterDshSkills, skillCollection, skillSourceKind, matchesSkillQuery });
  const shared = { id: "shared", name: "same-name", path: "/shared/SKILL.md", description: "Shared source", source: "user-agents", managed: true, cliAddressable: true, discoverable: true, managedRemovable: true, nativeRemovable: false, installation: { source: "owner/repository", sourceType: "github", sourceUrl: "https://example.org/source" }, state: { file: "/shared/SKILL.md", source: "user-agents", cliAddressable: true, policyEnabled: true, memberships: [{ presetKey: "standard", source: "user-agents", shadowed: true }, { presetKey: "creator", source: "custom", shadowed: false }] } };
  const privateSkill = { ...shared, id: "private", source: "user-dsh", path: "/private/SKILL.md", managed: false, cliAddressable: false, managedRemovable: false, nativeRemovable: true, state: { ...shared.state, file: "/private/SKILL.md", source: "user-dsh", cliAddressable: false, memberships: [{ presetKey: "standard", shadowed: false }] } };
  const inventory = [shared, privateSkill];
  assert.deepEqual(managedSkills(inventory).map(item => item.id), ["shared"]);
  assert.equal(nativeSkills(inventory, "all").length, 2);
  assert.equal(nativeSkills(inventory, "standard").find(item => item.id === "shared").shadowed, true);
  assert.equal(nativeSkills(inventory, "creator").length, 1);
  assert.equal(nativeSkills(inventory, "creator")[0].shadowed, false);
  assert.equal(nativeSkills(inventory, "standard").find(item => item.id === "shared").source, "user-agents");
  assert.equal(nativeSkills(inventory, "creator")[0].source, "custom");
  assert.equal(nativeSkills(inventory, "creator")[0].removable, false);
  assert.deepEqual(inventorySkills(inventory, "all").map(item => item.id), ["shared", "private"], "Discovery and CLI ownership do not duplicate a physical skill");
  assert.equal(inventorySkills(inventory, "all")[0].removable, true, "The shared skill retains CLI removal");
  assert.equal(inventorySkills(inventory, "all")[1].removable, true, "The independent skill retains Trash removal");
  assert.deepEqual(inventorySkills(inventory, "creator").map(item => item.id), ["shared"]);
  assert.equal(inventorySkills(inventory, "creator")[0].removable, true);
  assert.deepEqual(inventorySkills([{ ...shared, discoverable: false }, privateSkill], "all").map(item => item.id), ["private", "shared"], "An installed but undiscovered CLI skill remains visible in the aggregate");
  assert.deepEqual(inventorySkills([{ ...shared, discoverable: false }, privateSkill], "standard").map(item => item.id), ["private"]);
  assert.equal(skillLifecycle(inventorySkills(inventory, "all")[0]), "managed");
  assert.equal(skillLifecycle(inventorySkills(inventory, "all")[1]), "native");
  assert.deepEqual(filterInventory(inventorySkills(inventory, "all"), "all", "", "directory:local", "all").map(item => item.id), ["private"]);
  assert.equal(inventorySourceKey({ ...shared, managed: false, installation: undefined }), "directory:local", "Untracked shared files show their directory source");
  assert.equal(managedSkills([{ ...shared, managed: false }]).length, 1, "Untracked standard targets retain CLI lifecycle");
  assert.equal(filterInventory(managedSkills(inventory), "managed", "EXAMPLE.ORG", "git", "enabled").length, 1);
  assert.equal(filterInventory(managedSkills(inventory), "managed", "", "local", "all").length, 0);
  assert.equal(managedSkills(inventory).length, 1, "Filtering does not mutate totals");
});


test("partial discovery keeps known preset membership and unreadable shared inventory stays non-actionable", async () => {
  const original = { id: "shared", name: "shared", managed: true, cliAddressable: true, discoverable: true, managedRemovable: true, installation: { sourceType: "git", source: "owner/repo" }, state: { file: "/shared/SKILL.md", canSetPolicy: true, memberships: [{ presetKey: "standard", shadowed: false }] } };
  let response = { ownership: "ready", partial: false, items: [original] };
  const inventoryCache = { current: undefined };
  const load = componentCallback("src/client.tsx", "InventoryPage", "load", { enabled: true, config: {}, workspaceId: "", inventoryCache, request: async () => response });
  await load(new AbortController().signal);
  response = { ownership: "ready", partial: true, partialPresets: ["standard"], items: [{ ...original, discoverable: false, state: { ...original.state, memberships: [] } }] };
  const partial = await load(new AbortController().signal);
  assert.equal(partial.items[0].discoverable, true);
  assert.equal(partial.items[0].state.memberships[0].presetKey, "standard");
  response = { ownership: "ready", partial: true, managedPartial: true, items: [] };
  const inaccessible = await load(new AbortController().signal);
  assert.equal(inaccessible.items[0].id, original.id);
  assert.equal(inaccessible.items[0].managedRemovable, false);
  assert.equal(inaccessible.items[0].state.canSetPolicy, false);
  assert.equal(inaccessible.items[0].state.policyBlocker, "unavailable");
  assert.deepEqual(inaccessible.items[0].installation, original.installation);
});

test("search preserves hidden selection while source and status changes clear it", () => {
  const preferences = { filters: new Map() }; let selected = ["hidden"], filters;
  const { changeFilters } = handlers("src/client.tsx", ["changeFilters"], { filters: new Map(), context: "managed", emptyFilters: { query: "", source: "all", status: "all" }, preferences, setFilters: value => { filters = value; }, setSelection: value => { selected = value; } });
  changeFilters({ query: "different source" }); assert.deepEqual(selected, ["hidden"]);
  assert.equal(filters.get("managed").query, "different source");
  changeFilters({ source: "git" }); assert.equal(selected, undefined);
  selected = ["hidden"]; changeFilters({ status: "enabled" }); assert.equal(selected, undefined);
});


test("runtime directory declarations are explanatory while actual read failures remain errors", () => {
  const { nativeDirectoryState } = handlers("src/inventory.ts", ["nativeDirectoryState"], {});
  const runtime = { partialPresets: ["creator"], runtimePresets: ["creator"], readFailedPresets: [] };
  assert.deepEqual(nativeDirectoryState(runtime, "all"), { runtime: ["creator"], failed: [] });
  assert.deepEqual(nativeDirectoryState(runtime, "standard"), { runtime: [], failed: [] });
  assert.deepEqual(nativeDirectoryState({ ...runtime, readFailedPresets: ["creator"] }, "all"), { runtime: ["creator"], failed: ["creator"] });
  assert.deepEqual(nativeDirectoryState({ partialPresets: ["invalid"] }, "all").failed, ["invalid"]);
});


test("read deadlines finish loading and cleanup cancellation does not report a failure", async () => {
  let deadline = new AbortController(), cleanup, state;
  const { useRequest } = handlers("src/client.tsx", ["useRequest"], {
    AbortController, AbortSignal: { any: signals => AbortSignal.any(signals), timeout: milliseconds => { assert.equal(milliseconds, 15000); return deadline.signal; } },
    useState: () => [undefined, value => { state = value; }], useEffect: effect => { cleanup = effect(); },
  });
  const load = signal => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  useRequest(load, "inventory", 0); deadline.abort(new DOMException("Read timed out", "TimeoutError"));
  await Promise.resolve(); assert.equal(state.failed, true); assert.equal(state.key, "inventory");
  cleanup(); state = undefined; deadline = new AbortController();
  useRequest(load, "changed-scope", 1); cleanup(); await Promise.resolve();
  assert.equal(state, undefined);
});
