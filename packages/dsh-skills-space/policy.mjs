import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import { changePolicyRule, digest, effectivePolicy, identity, preference, readPolicy, statusPath } from './dist/policy-state.mjs';

export class PolicyRejection extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function installSkillPolicy(ctx, home, { withFileLock, writeFileAtomic, configuration }) {
  const file = join(home, 'skills-space', 'skill-policy.json');
  const version = createRequire(import.meta.url)('./package.json').version;
  let active = true;
  let statusTimer;
  ctx.effect(() => () => { active = false; clearInterval(statusTimer); });

  async function read() {
    try { return { ...await readPolicy(file), status: 'ready', file }; }
    catch (error) { return { rules: [], raw: null, revision: null, status: 'error', file,
      issue: error instanceof Error ? error.message : String(error), migrationConflicts: Array.isArray(error.conflicts) ? error.conflicts : [] }; }
  }

  function stateFor(skill, policy) {
    const source = skill.invocation;
    const rule = preference(policy.rules, skill.path, skill.name);
    const effective = policy.status === 'ready' ? effectivePolicy(source, rule) : { modelInvocable: false, userInvocable: false };
    return {
      ...effective, sourceModelInvocable: source.modelInvocable, sourceUserInvocable: source.userInvocable,
      policyEnabled: effective.modelInvocable || effective.userInvocable,
      policyModelInvocable: rule?.modelInvocable ?? true, policyUserInvocable: rule?.userInvocable ?? true,
      canSetPolicy: active && policy.status === 'ready' && isAbsolute(skill.path ?? ''),
      policyBlocker: policy.status === 'ready' ? null : 'error',
    };
  }

  async function restrict(skill, policy) {
    if (!skill || !isAbsolute(skill.path ?? '')) return skill;
    if (policy.status !== 'ready') return { ...skill, invocation: { modelInvocable: false, userInvocable: false } };
    if (!policy.rules.length) return skill;
    const rule = preference(policy.rules, await identity(skill.path), skill.name);
    if (!rule) return skill;
    return { ...skill, invocation: effectivePolicy(skill.invocation, rule) };
  }

  // Public Cordis service-read waterfall: preserve the original registry and its
  // winner selection, then constrain its returned value. No provider is replaced.
  ctx.on('internal/get', (_consumer, name, _error, next) => {
    const original = next();
    if (name !== 'skills' || !original || !active) return original;
    const methods = new Map();
    return new Proxy(original, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (!['list', 'snapshot', 'get'].includes(key)) return value;
        if (!methods.has(key)) methods.set(key, async (...args) => {
          const raw = await Reflect.apply(value, target, args);
          if (!active) return raw;
          const options = args[key === 'get' ? 1 : 0];
          options?.signal?.throwIfAborted();
          const policy = await read();
          if (!active) return raw;
          const values = key === 'get' ? [raw] : key === 'snapshot' ? raw.skills : raw;
          const restricted = await Promise.all(values.map(skill => restrict(skill, policy)));
          options?.signal?.throwIfAborted();
          if (!active) return raw;
          if (key === 'get') return restricted[0];
          const skills = restricted.filter(skill => skill !== undefined);
          return key === 'snapshot' ? { ...raw, skills } : skills;
        });
        return methods.get(key);
      },
    });
  }, { global: true });

  if (configuration) {
    async function publishStatus() {
      if (!active) return;
      const [configurationPath, source, policy] = await Promise.all([
        identity(configuration), readFile(new URL('./policy.mjs', import.meta.url), 'utf8'), read(),
      ]);
      if (!active) return;
      const path = statusPath(file, configurationPath, 'dsh-skills-space');
      await mkdir(dirname(path), { recursive: true });
      await writeFileAtomic(path, JSON.stringify({ pid: process.pid, updatedAt: Date.now(), configuration: configurationPath,
        version, policyDigest: digest(source), revision: policy.revision, issue: policy.issue ?? null }), { mode: 0o600 });
    }
    const publish = () => { void publishStatus().catch(error => ctx.logger.warn(`Skills Space policy status: ${error.message}`)); };
    publish();
    statusTimer = setInterval(publish, 5000);
    statusTimer.unref();
  }

  async function regularTarget() {
    try {
      const metadata = await lstat(file);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) throw new PolicyRejection('policy-unavailable');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }

  async function write(revision, prepare, signal) {
    const parent = dirname(file);
    await mkdir(parent, { recursive: true });
    const originalParent = await lstat(parent);
    async function checkParent() {
      const current = await lstat(parent);
      if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== originalParent.dev || current.ino !== originalParent.ino || await realpath(parent) !== parent) throw new PolicyRejection('policy-unavailable');
    }
    await checkParent();
    return withFileLock(file, async () => {
      if (!active) throw new PolicyRejection('policy-unavailable');
      await checkParent();
      await regularTarget();
      const policy = await read();
      if (policy.status !== 'ready') throw new PolicyRejection('policy-unavailable');
      if (policy.revision !== revision) throw new PolicyRejection('policy-conflict');
      // Revalidate scope, document revisions and eligibility under the shared lock.
      const changes = await prepare(policy);
      if (!changes.length) throw new PolicyRejection('policy-selection');
      signal?.throwIfAborted();
      const next = new Map(policy.rules.map(rule => [JSON.stringify([rule.file, rule.name]), rule]));
      for (const { skill, action } of changes) {
        const key = JSON.stringify([skill.file, skill.name]);
        next.set(key, changePolicyRule(skill, next.get(key), action));
      }
      await regularTarget();
      let before;
      try { before = await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; before = null; }
      if (!active || before !== policy.raw) throw new PolicyRejection('policy-conflict');
      const opaque = policy.raw === null ? {} : JSON.parse(policy.raw);
      signal?.throwIfAborted();
      await checkParent();
      await writeFileAtomic(file, JSON.stringify({ ...opaque, version: 2, rules: [...next.values()] }, null, 2) + '\n', { mode: 0o600 });
      return read();
    });
  }

  return { read, stateFor, write };
}
