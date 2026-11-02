// Run with the original DSH Node runtime. Set SKILLS_SPACE_DSH_RUNTIME to the
// installed package root containing node_modules; never boot a personal Profile.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire, registerHooks } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, cp, realpath, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const runtime = process.env.SKILLS_SPACE_DSH_RUNTIME;
assert.ok(runtime, 'Set SKILLS_SPACE_DSH_RUNTIME to an original installed DSH package root');
const requireRuntime = createRequire(join(resolve(runtime), 'package.json'));
const load = name => import(pathToFileURL(requireRuntime.resolve(name)).href);
const [{ Context }, { SkillRegistry }, filesystem, skillTool, llm, { createScope }] = await Promise.all([
  load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-skill'),
  load('@deepseek-ai/dsh-skill-filesystem'), load('@deepseek-ai/dsh-tool-skill'), load('@deepseek-ai/dsh-llm'), load('@deepseek-ai/dsh-scope'),
]);

const root = await mkdtemp(join(tmpdir(), 'skills-space-dsh-policy-'));
const originalEnv = Object.fromEntries(['HOME', 'DSH_HOME', 'DSH_AGENTS_HOME', 'DSH_BUNDLED_SKILL_DIR'].map(key => [key, process.env[key]]));
process.env.HOME = join(root, 'home');
process.env.DSH_HOME = join(root, 'home', '.dsh');
process.env.DSH_AGENTS_HOME = join(root, 'home', '.agents');
delete process.env.DSH_BUNDLED_SKILL_DIR;
const packageDir = join(root, 'plugin');
await cp(dirname(fileURLToPath(import.meta.url)), packageDir, { recursive: true });
// Electron can import its ASAR modules by resolved URL, but Node's ESM package
// resolver cannot traverse an external symlink into ASAR. Resolve this one peer
// to the original installed module; leave its implementation untouched.
const filesystemUrl = pathToFileURL(requireRuntime.resolve('@deepseek-ai/dsh-skill-filesystem')).href;
const resolver = registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@deepseek-ai/dsh-skill-filesystem') {
    return { url: filesystemUrl, shortCircuit: true };
  }
  return next(specifier, context);
} });
const policyPlugin = (await import(pathToFileURL(join(packageDir, 'index.mjs')).href)).default;
resolver.deregister();
const configA = join(root, 'profiles', 'desktop', 'cordis.patch.yml');
const configB = join(root, 'profiles', 'web', 'cordis.patch.yml');
const policyFile = join(root, 'state', 'skill-policy.json');
const projectA = join(root, 'projects', 'a');
const projectB = join(root, 'projects', 'b');
const custom = join(root, 'custom');
const bundled = join(root, 'bundled');
const allFiles = [];
const skillFiles = {};
const fibers = [];

async function put(file, text) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
  allFiles.push(file);
  return file;
}
async function skill(dir, name, body = name, frontmatter = '') {
  const file = await put(join(dir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: Fixture ${name}\n${frontmatter}---\n${body}\n`);
  skillFiles[body] = await realpath(file);
  return file;
}
async function save(rules) {
  await mkdir(dirname(policyFile), { recursive: true });
  await writeFile(`${policyFile}.new`, JSON.stringify({ version: 2, rules }));
  await rename(`${policyFile}.new`, policyFile);
}
function rule(file, disabled = true, _project = null, _configuration = configA, name = 'shared-demo') {
  return { file, name, disabled };
}
async function hashFiles() {
  return Object.fromEntries(await Promise.all(allFiles.map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
}
const fsConfig = {
  dshHome: process.env.DSH_HOME, agentsHome: process.env.DSH_AGENTS_HOME,
  customSkillDirs: [custom], bundledSkillDir: bundled, watch: false,
};
async function harness({ configuration = configA, wrapped = true, providers = [fsConfig] } = {}) {
  const ctx = new Context();
  const registry = ctx.plugin(SkillRegistry);
  await registry;
  const installed = [];
  for (const config of providers) {
    const fiber = wrapped
      ? ctx.plugin(policyPlugin, { configuration, policyFile, runtimeAnchor: join(resolve(runtime), "package.json"), filesystem: config })
      : ctx.plugin(filesystem, config);
    await fiber;
    installed.push(fiber);
  }
  const close = async () => { for (const fiber of [...installed].reverse()) await fiber.dispose(); await registry.dispose(); };
  fibers.push(close);
  return { ctx, close, list: cwd => ctx.skills.list({ cwd }), get: (name, cwd) => ctx.skills.get(name, { cwd }) };
}
function signature(list) {
  return list.map(({ name, description, path, source, provider, resourceBase }) => ({ name, description, path, source, provider, resourceBase }));
}
async function waitFor(predicate) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(done => setTimeout(done, 30));
  }
  assert.fail('Policy file watcher did not invalidate the live registry within 2.5 seconds');
}
// Invoke the actual installed tool and pre-step listeners. Only host facilities
// (working directory and registration) are supplied by the fixture; no model/API.
function invocationHarness(host, cwd) {
  let tool;
  const listeners = [];
  const agent = { session: { surface: { nodes: [] }, seq: 0 } };
  skillTool.apply({
    skills: host.ctx.skills,
    tools: { register(value) { tool = value; }, get() { return tool; } },
    workingDirectory: { ensure: async () => cwd },
    on(event, handler) { if (event === 'agent/pre-step') listeners.push(handler); },
  });
  return {
    model: name => tool.execute({ name }, { agent, signal: new AbortController().signal }),
    async manual(name) {
      const messages = [llm.createUserMessage({ content: [{ type: 'text', text: `/${name}` }], source: { kind: 'user' } })];
      let decision = { kind: 'continue', messages };
      // Run both original listeners, in their waterfall order.
      for (const listener of [...listeners].reverse()) {
        const previous = decision;
        decision = await listener({ agent, messages, signal: new AbortController().signal }, async () => previous);
      }
      return decision.messages.filter(message => message.source?.kind === 'skill-invocation');
    },
  };
}

try {
  for (const project of [projectA, projectB]) await mkdir(join(project, '.git'), { recursive: true });
  await mkdir(join(projectA, 'nested'), { recursive: true });
  await put(configA, '# isolated desktop profile\n[]\n');
  await put(configB, '# isolated web profile\n[]\n');
  const shared = await skill(join(process.env.DSH_AGENTS_HOME, 'skills'), 'shared-demo', 'SHARED_BODY');
  const projectCopy = await skill(join(projectA, '.dsh', 'skills'), 'shared-demo', 'PROJECT_COPY');
  await skill(join(process.env.DSH_HOME, 'skills'), 'duplicate-demo', 'USER_DSH');
  await skill(join(process.env.DSH_AGENTS_HOME, 'skills'), 'duplicate-demo', 'USER_SHARED');
  await skill(custom, 'duplicate-demo', 'CUSTOM');
  await skill(bundled, 'duplicate-demo', 'BUNDLED');
  const preferred = await skill(join(projectA, '.dsh', 'skills'), 'duplicate-demo', 'PROJECT_DSH');
  await skill(join(projectA, '.agents', 'skills'), 'duplicate-demo', 'PROJECT_SHARED');
  await skill(custom, 'custom-only');
  await skill(bundled, 'bundled-only');
  await skill(join(process.env.DSH_HOME, 'skills'), 'manual-only', 'MANUAL_ONLY', 'disable-model-invocation: true\n');
  await skill(join(process.env.DSH_HOME, 'skills'), 'model-only', 'MODEL_ONLY', 'user-invocable: false\n');
  await put(join(process.env.DSH_AGENTS_HOME, '.skill-lock.json'), '{"skills":{"shared-demo":{"source":"fixture/repository"}}}\n');
  await put(join(projectA, 'skills-lock.json'), '{"version":1,"skills":{}}\n');
  const before = await hashFiles();

  await test('official discovery, directory options, duplicate precedence and multiple providers remain unchanged', async () => {
    await save([]);
    for (const providers of [
      [fsConfig],
      [{ ...fsConfig, includeDefaultRoots: false }],
      [{ ...fsConfig, includeDefaultRoots: false, customSkillDirs: [] }],
      [{ ...fsConfig, providerName: 'primary' }, { ...fsConfig, providerName: 'secondary', includeDefaultRoots: false, customSkillDirs: [bundled] }],
    ]) {
      const official = await harness({ wrapped: false, providers });
      const wrapped = await harness({ providers });
      for (const cwd of [projectA, projectB, join(projectA, 'nested'), undefined]) {
        const expected = await official.list(cwd);
        const actual = await wrapped.list(cwd);
        assert.deepEqual(actual, expected);
        for (const row of actual) assert.deepEqual(await wrapped.get(row.name, cwd), await official.get(row.name, cwd));
      }
      await official.close(); await wrapped.close();
    }
    assert.deepEqual(await hashFiles(), before);
  });

  await test('one physical file shares policy across configurations and projects while a project copy stays independent after restart', async () => {
    await save([rule(shared)]);
    const a = await harness();
    const b = await harness({ configuration: configB });
    assert.equal((await a.get('shared-demo', projectA)).invocation.modelInvocable, true,'a distinct project copy is independent');
    assert.equal((await a.get('shared-demo', projectB)).invocation.userInvocable, false);
    assert.equal((await b.get('shared-demo', projectB)).invocation.modelInvocable, false,'configuration is no longer a policy namespace');
    assert.equal((await a.get('shared-demo')).invocation.userInvocable, false);
    const otherCalls=invocationHarness(b,projectB);
    await assert.rejects(otherCalls.model('shared-demo'),/not available for model invocation/);
    assert.equal((await otherCalls.manual('shared-demo')).length,0);
    await save([rule(shared,false)]);
    await waitFor(async () => (await a.list(projectB)).find(row => row.name === 'shared-demo').invocation.modelInvocable);
    assert.equal((await b.get('shared-demo',projectB)).invocation.userInvocable,true);
    await save([rule(projectCopy)]);
    await a.close();
    const restarted = await harness();
    assert.equal((await restarted.get('shared-demo', projectA)).invocation.userInvocable, false);
    // Disabling the independent project file never changes the user file.
    const isolated = await harness();
    assert.equal((await isolated.get('shared-demo', projectA)).invocation.userInvocable, false);
    assert.equal((await isolated.get('shared-demo', projectB)).invocation.userInvocable, true);
    assert.equal((await isolated.get('shared-demo')).invocation.userInvocable, true);
    assert.deepEqual(await hashFiles(), before);
  });

  await test('disabled winner remains discovered and cannot fall back; original model and manual entries both stop', async () => {
    await save([]);
    const official = await harness({ wrapped: false });
    const initial = await official.list(projectA);
    await save([rule(preferred, true, null, configA, 'duplicate-demo')]);
    const host = await harness();
    const rows = await host.list(projectA);
    assert.deepEqual(signature(rows), signature(initial));
    assert.equal(rows.length, initial.length);
    const winner = await host.get('duplicate-demo', projectA);
    assert.equal(await realpath(winner.path), await realpath(preferred));
    assert.match(winner.content, /PROJECT_DSH/);
    assert.deepEqual(winner.invocation, { modelInvocable: false, userInvocable: false });
    const calls = invocationHarness(host, projectA);
    await assert.rejects(calls.model('duplicate-demo'), /not available for model invocation/);
    assert.equal((await calls.manual('duplicate-demo')).length, 0);
    // Another configuration reading the same file observes the same restriction.
    const other = invocationHarness(await harness({ configuration: configB }), projectA);
    await assert.rejects(other.model('duplicate-demo'),/not available for model invocation/);
    assert.equal((await other.manual('duplicate-demo')).length, 0);
    // Remove restriction: get() must recheck even if registry has a cached list.
    await save([]);
    await waitFor(async () => (await host.list(projectA)).find(row => row.name === 'duplicate-demo').invocation.modelInvocable);
    assert.match((await calls.model('duplicate-demo')).content, /PROJECT_DSH/);
    assert.equal((await calls.manual('duplicate-demo')).length, 1);
    await assert.rejects(calls.model('manual-only'), /not available for model invocation/);
    assert.equal((await calls.manual('manual-only')).length, 1);
    assert.ok(await calls.model('model-only'));
    assert.equal((await calls.manual('model-only')).length, 0);
    assert.deepEqual(await hashFiles(), before);
  });

  await test('a cached enabled catalog cannot bypass a newly disabled policy at actual load boundaries', async () => {
    await save([]);
    const host = await harness();
    const calls = invocationHarness(host, projectB);
    assert.match((await calls.model('shared-demo')).content, /SHARED_BODY/);
    assert.equal((await calls.manual('shared-demo')).length, 1);
    await save([rule(shared)]);
    // Deliberately do not wait for watchFile or refresh list(). The official
    // model tool may see an enabled cached summary, but its loaded definition
    // must still deny the request; manual injection only uses that definition.
    await assert.rejects(calls.model('shared-demo'), /not available for model invocation/);
    assert.equal((await calls.manual('shared-demo')).length, 0);
    assert.deepEqual((await host.get('shared-demo', projectB)).invocation, {
      modelInvocable: false, userInvocable: false,
    });
    assert.deepEqual(await hashFiles(), before);
  });

  await test('real preset scopes share configuration policy and retain nearest-layer shadowing', async () => {
    await save([rule(shared)]);
    const host = await harness({ wrapped: false });
    const keys = [{ id: 'standard' }, { id: 'ptc' }];
    const scopes = keys.map(key => createScope(host.ctx, key));
    for (const scope of scopes) {
      await scope.ctx.plugin(policyPlugin, { configuration: configA, policyFile, runtimeAnchor: join(resolve(runtime), "package.json"), filesystem: fsConfig });
      fibers.push(() => scope.dispose());
    }
    assert.equal((await host.get('shared-demo', projectB)).invocation.modelInvocable, true,
      'the unwrapped global provider remains original outside either preset');
    for (const scope of keys) {
      const row = (await host.ctx.skills.list({ cwd: projectB, scope })).find(skill => skill.name === 'shared-demo');
      assert.equal(row.invocation.modelInvocable, false);
      const loaded = await host.ctx.skills.get('shared-demo', { cwd: projectB, scope });
      assert.deepEqual(loaded.invocation, { modelInvocable: false, userInvocable: false });
      assert.match(loaded.content, /SHARED_BODY/);
    }
    assert.deepEqual(await hashFiles(), before);
  });

  await test('unreadable policy contents retain the same winner with both channels closed; removing policy restores source defaults', async () => {
    await writeFile(policyFile, '{malformed');
    const host = await harness();
    const winner = await host.get('duplicate-demo', projectA);
    assert.equal(await realpath(winner.path), await realpath(preferred));
    assert.match(winner.content, /PROJECT_DSH/);
    assert.deepEqual(winner.invocation, { modelInvocable: false, userInvocable: false });
    const calls = invocationHarness(host, projectA);
    await assert.rejects(calls.model('duplicate-demo'), /not available for model invocation/);
    assert.equal((await calls.manual('duplicate-demo')).length, 0);
    await rm(policyFile);
    const restored = await harness();
    assert.deepEqual((await restored.get('shared-demo', projectA)).invocation, {
      modelInvocable: true, userInvocable: true,
    });
    assert.deepEqual((await restored.get('manual-only', projectA)).invocation, {
      modelInvocable: false, userInvocable: true,
    });
    assert.deepEqual(await hashFiles(), before);
  });

  console.log(JSON.stringify({ runtime, packages: Object.fromEntries(await Promise.all([
    '@deepseek-ai/dsh-skill', '@deepseek-ai/dsh-skill-filesystem', '@deepseek-ai/dsh-tool-skill',
  ].map(async name => [name, JSON.parse(await readFile(requireRuntime.resolve(`${name}/package.json`), 'utf8')).version]))),
  protectedFiles: allFiles.length, unchanged: assert.deepEqual(await hashFiles(), before) === undefined,
  fixture: root, personalProfileBooted: false }, null, 2));
} finally {
  for (const close of fibers.reverse()) await close();
  for (const [key, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await rm(root, { recursive: true, force: true });
}
