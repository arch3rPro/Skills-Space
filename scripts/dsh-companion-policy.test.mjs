import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const electron = process.env.SKILLS_SPACE_DSH_TEST_DESKTOP;
const selected = { skip: !electron && 'Select the official Electron runtime explicitly' };

// Run the production module against the shipped official services in an isolated
// HOME. Each callback is serialized into that runtime; no prototype hook is used.
function official(t, callback) {
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-production-policy-')));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const home = join(fixture, 'home'); mkdirSync(home);
  const bootstrap = `
    import assert from 'node:assert/strict';
    import * as fs from 'node:fs/promises';
    import { join, dirname } from 'node:path';
    import { createRequire } from 'node:module';
    import { pathToFileURL } from 'node:url';
    const [fixture, policyUrl, repository] = process.argv.slice(1);
    const anchor = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/package.json';
    const require = createRequire(anchor);
    const load = name => import(pathToFileURL(require.resolve(name)).href);
    const { installSkillPolicy } = await import(policyUrl);
    const atomic = await load('@deepseek-ai/dsh-atomic-write');
    const { Context } = await load('@deepseek-ai/cordis');
    const { SkillRegistry } = await load('@deepseek-ai/dsh-skill');
    const home = join(fixture, 'home');
    const policyHome = join(home, '.dsh');
    const policyFile = join(policyHome, 'skills-space/skill-policy.json');
    async function writeRules(rules, extra = {}) {
      await fs.mkdir(dirname(policyFile), { recursive: true });
      await atomic.writeFileAtomic(policyFile, JSON.stringify({ ...extra, version: 2, rules }), { mode: 0o600 });
    }
    const rule = (file, name, fields = {}) => ({ file, name, disabled: false, modelInvocable: true, userInvocable: true, ...fields });
    async function install(root) {
      let api;
      const fiber = await root.plugin({ name: 'production-policy-fixture', apply(ctx) { api = installSkillPolicy(ctx, policyHome, atomic); } });
      return { api, fiber };
    }
    await (${callback.toString()})();
  `;
  execFileSync(electron, ['--input-type=module', '--eval', bootstrap, fixture,
    new URL('../packages/dsh-skills-space/policy.mjs', import.meta.url).href,
    new URL('..', import.meta.url).pathname], {
    env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, DSH_HOME: join(home, '.dsh'), ELECTRON_RUN_AS_NODE: '1', DISABLE_TELEMETRY: '1' },
    stdio: ['ignore', 'pipe', 'inherit'], timeout: 30000,
  });
}

test('production hook preserves real registry winners, source flags, realms and cached-reference disposal', selected, t => official(t, async function runtime() {
  const root = new Context();
  try {
    await root.plugin(SkillRegistry, {});
    const realm = root.isolate('skills'); await realm.plugin(SkillRegistry, {});
    let view, other;
    await root.plugin({ inject: ['skills'], apply(ctx) { view = ctx; } });
    await realm.plugin({ inject: ['skills'], apply(ctx) { other = ctx; } });
    const source = { modelInvocable: true, userInvocable: true };
    const high = join(fixture, 'high.md'), low = join(fixture, 'low.md');
    await fs.writeFile(high, 'high'); await fs.writeFile(low, 'low');
    const rows = [high, low].map((path, index) => ({ provider: 'fixture', name: 'same-name', description: 'winner', path, source: 'custom', rank: 100 + index, invocation: source, locator: path }));
    const remove = view.skills.registerProvider(() => ({ name: 'fixture', list: async () => rows, get: async item => ({ ...item, content: item.path === high ? 'HIGH' : 'LOW' }) }));
    const ordinary = other.skills.register({ name: 'same-name', description: 'runtime winner', source: 'runtime', content: 'OTHER_REALM' });
    const originalService = view.skills, originalGet = originalService.get;
    const { fiber } = await install(root);
    const options = { cwd: fixture, signal: new AbortController().signal };
    const facade = view.skills, cached = facade.get;
    assert.equal((await cached('same-name', options)).content, 'HIGH');
    for (const modelInvocable of [false, true]) for (const userInvocable of [false, true]) {
      await writeRules([rule(high, 'same-name', { modelInvocable, userInvocable })]);
      const list = await view.skills.list(options), snapshot = await view.skills.snapshot(options), loaded = await view.skills.get('same-name', options);
      for (const item of [list[0], snapshot.skills[0], loaded]) {
        assert.equal(item.path, high); assert.deepEqual(item.invocation, { modelInvocable, userInvocable });
      }
      assert.equal(snapshot.complete, true);
      assert.equal((await other.skills.get('same-name')).content, 'OTHER_REALM');
    }
    await writeRules([rule(high, 'same-name', { disabled: true })]);
    assert.deepEqual(await view.skills.list(options), []);
    assert.deepEqual((await view.skills.snapshot(options)).skills, []);
    assert.equal(await cached('same-name', options), undefined, 'Disabled winner must never fall back to lower-priority file');
    assert.equal((await originalGet.call(originalService, 'same-name', options)).content, 'HIGH', 'Pre-enable references remain the documented bypass boundary');
    await fs.writeFile(policyFile, '{corrupt');
    assert.deepEqual((await view.skills.get('same-name', options)).invocation, { modelInvocable: false, userInvocable: false });
    assert.equal((await other.skills.get('same-name')).content, 'OTHER_REALM', 'Non-file runtime skills remain available');
    await fiber.dispose();
    assert.equal((await cached('same-name', options)).content, 'HIGH');
    assert.equal((await facade.list(options))[0].path, high);
    const registered = view.skills.register({ name: 'after-unload', description: 'runtime', source: 'runtime', content: 'OK' });
    assert.equal((await view.skills.get('after-unload')).content, 'OK');
    await registered(); await ordinary(); await remove();
  } finally { await root.fiber.dispose(); }
}));

test('production hook keeps provider source restrictions and restores an in-flight lookup on unload', selected, t => official(t, async function sources() {
  const root = new Context();
  try {
    await root.plugin(SkillRegistry, {});
    let view; await root.plugin({ inject: ['skills'], apply(ctx) { view = ctx; } });
    const file = join(fixture, 'source.md'); await fs.writeFile(file, 'source');
    let release, started;
    const entered = new Promise(resolve => { started = resolve; });
    const pending = new Promise(resolve => { release = resolve; });
    let wait = false;
    const source = { provider: 'source', name: 'source-skill', description: 'source limits', path: file, source: 'custom', rank: 100, invocation: { modelInvocable: false, userInvocable: true }, locator: file };
    view.skills.registerProvider(() => ({ name: 'source', list: async () => [source], async get() { if (wait) { started(); await pending; } return { ...source, content: 'SOURCE' }; } }));
    const { fiber } = await install(root);
    await writeRules([rule(file, source.name)]);
    assert.deepEqual((await view.skills.get(source.name)).invocation, source.invocation);
    const alias = join(fixture, 'alias.md'); await fs.symlink(file, alias);
    await writeRules([rule(alias, source.name, { disabled: true })]);
    assert.equal(await view.skills.get(source.name), undefined, 'Legacy aliases normalize to physical file identity');
    wait = true;
    const cached = view.skills.get;
    const inflight = cached(source.name); await entered;
    await fiber.dispose(); release();
    assert.equal((await inflight).content, 'SOURCE');
    assert.equal((await cached(source.name)).content, 'SOURCE');
  } finally { await root.fiber.dispose(); }
}));

test('production policy writes reject stale revisions, unsafe files and a parent replaced while acquiring the lock', selected, t => official(t, async function writer() {
  const root = new Context();
  try {
    const { api } = await install(root);
    const file = join(fixture, 'instruction.md'); await fs.writeFile(file, 'instruction');
    const skill = { file, name: 'write-skill', sourceModelInvocable: true, sourceUserInvocable: true };
    const before = await api.read();
    const saved = await api.write(before.revision, async () => [{ skill, action: 'model-off' }]);
    assert.equal(saved.rules[0].modelInvocable, false);
    assert.equal((await fs.stat(policyFile)).mode & 0o777, 0o600);
    await assert.rejects(api.write(before.revision, async () => [{ skill, action: 'disable' }]), /policy-conflict/);
    const bytes = await fs.readFile(policyFile, 'utf8');
    const outside = join(fixture, 'outside.json'); await fs.writeFile(outside, bytes);
    await fs.rm(policyFile); await fs.symlink(outside, policyFile);
    await assert.rejects(api.write(saved.revision, async () => [{ skill, action: 'disable' }]), /policy-unavailable/);
    assert.equal(await fs.readFile(outside, 'utf8'), bytes);
    await fs.rm(policyFile); await fs.link(outside, policyFile);
    await assert.rejects(api.write(saved.revision, async () => [{ skill, action: 'disable' }]), /policy-unavailable/);
    await fs.rm(policyFile); await fs.writeFile(policyFile, bytes);
    const raceHome = join(fixture, 'race-home'), originalParent = join(raceHome, 'skills-space');
    const externalParent = join(fixture, 'external-parent'); await fs.mkdir(externalParent);
    let raceApi;
    await root.plugin({ name: 'parent-race', apply(ctx) { raceApi = installSkillPolicy(ctx, raceHome, {
      ...atomic, async withFileLock(_file, action) {
        await fs.rename(originalParent, join(fixture, 'original-parent'));
        await fs.symlink(externalParent, originalParent, 'dir');
        return action();
      },
    }); } });
    const empty = await raceApi.read();
    await assert.rejects(raceApi.write(empty.revision, async () => [{ skill, action: 'disable' }]), /policy-unavailable|policy-conflict/);
    await assert.rejects(fs.readFile(join(externalParent, 'skill-policy.json')), { code: 'ENOENT' });
  } finally { await root.fiber.dispose(); }
}));
