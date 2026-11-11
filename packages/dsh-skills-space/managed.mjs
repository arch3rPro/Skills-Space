import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { devNull, homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { declaredSkillVersion } from './dist/dsh-skill-version.mjs';
import { repository, skillName } from './marketplace.mjs';

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
export function skillVersion(content) {
  const frontmatter = content.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)?.[1];
  if (!frontmatter) return null;
  const { parseDocument, isAlias } = createRequire(require.resolve('skills/package.json'))('yaml');
  const document = parseDocument(frontmatter);
  if (document.errors.length) return null;
  return declaredSkillVersion(document, document.toJS({ maxAliasCount: 50 }), isAlias);
}

const discover = fileURLToPath(new URL('./dist/discover.mjs', import.meta.url));
const agentMetadata = new URL('./dist/agents.json', import.meta.url);
const sourceParser = fileURLToPath(new URL('./dist/source.mjs', import.meta.url));
const previewLifetime = 10 * 60 * 1000;
const trashCommand = '/usr/bin/trash';

export class InstallRejection extends Error {}

function lockPath(workspace) {
  if (workspace) return join(workspace, 'skills-lock.json');
  return process.env.XDG_STATE_HOME ? join(process.env.XDG_STATE_HOME, 'skills/.skill-lock.json') : join(homedir(), '.agents/.skill-lock.json');
}

export async function managedEntries(workspace) {
  const path = lockPath(workspace);
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.size > 16 * 1024 * 1024) throw new Error('Invalid skills lock');
    const lock = JSON.parse(await readFile(path, 'utf8'));
    if (lock.version !== (workspace ? 1 : 3) || !lock.skills || typeof lock.skills !== 'object' || Array.isArray(lock.skills)) throw new Error('Unsupported skills lock');
    return lock.skills;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

export function managedCandidate(candidate, workspace, entries) {
  const source = workspace ? 'project-agents' : 'user-agents';
  const path = join(workspace ?? homedir(), '.agents', 'skills', candidate.name, 'SKILL.md');
  return candidate.source === source && candidate.path === path && Object.hasOwn(entries, candidate.name);
}

function gitEnvironment(directory) {
  return {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,
    HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE,
    ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE,
    GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'https',
    GH_CONFIG_DIR: directory, GH_PROMPT_DISABLED: '1', GIT_ASKPASS: '', DISABLE_TELEMETRY: '1',
  };
}

function sourceRepository(input) {
  if (typeof input !== 'string') return undefined;
  const source = input.replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '').replace(/\.git$/i, '');
  return repository(source) ? source : undefined;
}

async function checkTarget(root) {
  if (await realpath(root) !== resolve(root)) throw new Error('Linked installation base');
  for (const path of [join(root, '.agents'), join(root, '.agents/skills')]) {
    try { if (!(await lstat(path)).isDirectory()) throw new Error('Linked or invalid installation directory'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

async function fileInfo(path) {
  try { return await lstat(path, { bigint: true }); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function reviewRevision(path, entry, independent = false) {
  const digest = createHash('sha256').update(JSON.stringify(entry));
  let count = 0;
  async function observe(path, relative = '') {
    if (++count > 5000) throw new InstallRejection('removal-unavailable');
    const info = await fileInfo(path);
    if (!info) throw new InstallRejection('removal-unavailable');
    if (!info.isDirectory() && !info.isFile()) throw new InstallRejection('removal-linked-file');
    if (independent && info.isFile() && info.nlink !== 1n) throw new InstallRejection('removal-shared-file');
    digest.update(JSON.stringify([relative, info.dev, info.ino, info.mode, info.size, info.ctimeNs, info.mtimeNs].map(String)));
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) {
        if (independent && (name === '.dsh' || (relative && name === 'SKILL.md'))) throw new InstallRejection('removal-nested-skill');
        await observe(join(path, name), relative + '/' + name);
      }
    }
  }
  await observe(path);
  return digest.digest('hex');
}

async function managedRevision(target, name, entries, alternatives) {
  const root = target.path ?? homedir();
  const skill = join(root, '.agents/skills', name);
  if (!skillName(name) || !(await fileInfo(skill))?.isDirectory()
    || !(await fileInfo(join(skill, 'SKILL.md')))?.isFile()) throw new InstallRejection('removal-unavailable');
  for (const directory of alternatives) {
    if (await fileInfo(join(directory, name))) throw new InstallRejection('removal-shared-alternative');
  }
  return reviewRevision(skill, entries[name] ?? null);
}

export async function hasNativeTrash() {
  if (process.platform !== 'darwin') return false;
  try { await access(trashCommand); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export function managedLifecycle(withFileLock) {
  const plans = new Map();
  const pending = new Set();
  let agents;
  const upstreamAgents = async () => agents ??= JSON.parse(await readFile(agentMetadata, 'utf8'));
  async function protectedAgentRoots(workspace) {
    const home = homedir();
    const configured = (key, fallback) => process.env[key]?.trim() || join(home, fallback);
    const bases = {
      home, configHome: configured('XDG_CONFIG_HOME', '.config'),
      autohandHome: configured('AUTOHAND_HOME', '.autohand'),
      claudeHome: configured('CLAUDE_CONFIG_DIR', '.claude'),
      grokHome: configured('GROK_HOME', '.grok'),
      hermesHome: configured('HERMES_HOME', '.hermes'),
      vibeHome: configured('VIBE_HOME', '.vibe'),
    };
    const roots = new Set();
    for (const { projectPath, globalBase, globalPath } of await upstreamAgents()) {
      if (workspace) roots.add(join(workspace, projectPath));
      if (globalBase === 'openclaw') {
        for (const alias of ['.openclaw', '.clawdbot', '.moltbot']) roots.add(join(home, alias, globalPath));
      } else if (globalBase && bases[globalBase]) roots.add(join(bases[globalBase], globalPath));
    }
    return roots;
  }
  const cli = () => join(dirname(require.resolve('skills/package.json')), 'bin/cli.mjs');
  const run = (args, cwd, timeout = 120000) => execute(process.execPath, [cli(), ...args], {
    cwd, env: { ...gitEnvironment(cwd), XDG_STATE_HOME: process.env.XDG_STATE_HOME },
    timeout, maxBuffer: 2 * 1024 * 1024,
  });
  async function mutate(root, work) {
    if (pending.has(root)) throw new InstallRejection('installation-busy');
    pending.add(root);
    try {
      if (await realpath(root) !== resolve(root)) throw new Error('Linked installation base');
      return await withFileLock(join(root, '.dsh-skills-space-install'), work, { waitMs: 0 });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('atomic-write: timed out waiting for the writer lock')) throw new InstallRejection('installation-busy');
      throw error;
    } finally {
      pending.delete(root);
    }
  }
  async function preview(input, target, signal, { includeInternal = false } = {}) {
    if (typeof input !== 'string' || !input.trim() || input.length > 8192) throw new InstallRejection('source');
    const packagePath = require.resolve('skills/package.json');
    const parserResult = await execute(process.execPath, [sourceParser, input.trim().startsWith('~/') ? join(homedir(), input.trim().slice(2)) : input.trim(), join(dirname(packagePath), 'dist/cli.mjs')], {
      cwd: target.path ?? homedir(), env: gitEnvironment(target.path ?? homedir()), signal, timeout: 5000, maxBuffer: 64 * 1024,
    });
    const parsed = JSON.parse(parserResult.stdout);
    const local = parsed.type === 'local';
    if (!local) {
      if (!['github', 'gitlab', 'git'].includes(parsed.type)) throw new InstallRejection('source');
      const url = URL.parse(parsed.url);
      if (!url || url.protocol !== 'https:' || url.username || url.password) throw new InstallRejection('source');
      if (parsed.subpath && !['github', 'gitlab'].includes(parsed.type)) throw new InstallRejection('source');
    }
    const directory = await mkdtemp(join(tmpdir(), 'dsh-skills-preview-'));
    try {
      const { parse } = createRequire(packagePath)('yaml');
      const checkout = local ? await realpath(parsed.localPath) : join(directory, 'source');
      const env = gitEnvironment(directory);
      const options = { cwd: directory, env, signal, timeout: 60000, maxBuffer: 2 * 1024 * 1024 };
      let source = checkout;
      if (!local) {
        await execute('git', ['clone', '--depth=1', '--no-tags', '--', parsed.url, checkout], options);
        if (parsed.ref) {
          await execute('git', ['-C', checkout, 'fetch', '--depth=1', '--', 'origin', parsed.ref], options);
          await execute('git', ['-C', checkout, 'checkout', '--detach', 'FETCH_HEAD'], options);
        }
        const { stdout: revision } = await execute('git', ['-C', checkout, 'rev-parse', 'HEAD'], options);
        if (!/^[a-f\d]{40}$/.test(revision.trim())) throw new InstallRejection('source');
        source = parsed.subpath
          ? `${parsed.url.replace(/\.git$/, '')}/${parsed.type === 'gitlab' ? '-/' : ''}tree/${revision.trim()}/${parsed.subpath}`
          : `${parsed.url}#${revision.trim()}`;
      }
      const { stdout } = await execute(process.execPath, [discover, checkout, resolve(checkout, parsed.subpath ?? ''), String(includeInternal), parsed.skillFilter ?? '', packagePath], options);
      const { paths, warnings } = JSON.parse(stdout);
      const skills = [];
      const names = new Set();
      const files = new Map();
      for (const path of paths) {
        const content = await readFile(join(path, 'SKILL.md'), 'utf8');
        const frontmatter = content.match(/^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---(?:\s|$)/)?.[1];
        if (!frontmatter) continue;
        const metadata = parse(frontmatter);
        if (!skillName(metadata?.name) || typeof metadata.description !== 'string' || !metadata.description.trim() || names.has(metadata.name)) continue;
        if (['disableModelInvocation', 'modelInvocable', 'userInvocable'].some(key => Object.hasOwn(metadata, key))) continue;
        if (['disable-model-invocation', 'user-invocable'].some(key => Object.hasOwn(metadata, key) && !/^(?:true|false|yes|no|on|off|1|0)$/i.test(String(metadata[key])))) continue;
        names.add(metadata.name);
        if (local) files.set(metadata.name, { path, revision: await reviewRevision(path, { name: metadata.name }) });
        skills.push({ name: metadata.name, description: metadata.description, internal: metadata.metadata?.internal === true });
      }
      if (!skills.length) throw new Error('No compatible skill found');
      const now = Date.now();
      for (const [key, plan] of plans) if (plan.expires <= now) plans.delete(key);
      if (plans.size >= 16) plans.delete(plans.keys().next().value);
      const token = randomUUID();
      plans.set(token, { source, files, target, names, expires: now + previewLifetime });
      return { token, skills, skillFilter: parsed.skillFilter ?? null, warnings };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  async function install(token, names, target) {
    const plan = plans.get(token);
    if (!plan || plan.expires <= Date.now() || JSON.stringify(plan.target) !== JSON.stringify(target)) throw new InstallRejection('preview-expired');
    if (!Array.isArray(names) || !names.length || names.length !== new Set(names).size || names.some(name => !plan.names.has(name))) throw new InstallRejection('selection');
    const root = target.path ?? homedir();
    return mutate(root, async () => {
      plans.delete(token);
      await checkTarget(root);
      const entries = await managedEntries(target.path);
      for (const name of names) {
        const file = plan.files.get(name);
        if (file) {
          let current;
          try { current = await reviewRevision(file.path, { name }); }
          catch { throw new InstallRejection('preview-expired'); }
          if (current !== file.revision) throw new InstallRejection('preview-expired');
        }
        if (Object.hasOwn(entries, name) || await fileInfo(join(root, '.agents/skills', name))) throw new InstallRejection('occupied');
      }
      const directory = await mkdtemp(join(tmpdir(), 'dsh-skills-install-'));
      const args = [cli(), 'add', plan.source, '--agent', 'universal', '--skill', ...names,
        '--yes', '--copy', '--full-depth', ...(target.path ? [] : ['--global'])];
      const env = { ...gitEnvironment(directory), XDG_STATE_HOME: process.env.XDG_STATE_HOME };
      let processFailed = false;
      try { await execute(process.execPath, args, { cwd: root, env, timeout: 120000, maxBuffer: 2 * 1024 * 1024 }); }
      catch { processFailed = true; }
      finally { await rm(directory, { recursive: true, force: true }); }
      const installed = [];
      const current = await managedEntries(target.path);
      for (const name of names) {
        if (!Object.hasOwn(current, name)) continue;
        if ((await fileInfo(join(root, '.agents/skills', name, 'SKILL.md')))?.isFile()) installed.push(name);
      }
      return { installed, failed: processFailed || installed.length !== names.length };
    });
  }
  async function reviewRemoval(target, skills, source) {
    const root = target.path ?? homedir();
    await checkTarget(root);
    const entries = await managedEntries(target.path);
    const group = source ? Object.keys(entries).filter(name => entries[name]?.source === source).sort() : null;
    const shared = (await upstreamAgents()).filter(agent => agent.projectPath === '.agents/skills');
    const alternatives = target.path ? [] : [...new Set(shared.flatMap(({ globalBase, globalPath }) => {
      if (!globalBase || globalPath === '.agents/skills') return [];
      // The CLI subprocess receives a bounded environment, so configHome is ~/.config.
      if (globalBase === 'home') return [join(root, globalPath)];
      if (globalBase === 'configHome') return [join(root, '.config', globalPath)];
      throw new Error('Review the pinned upstream shared Agent paths');
    }))];
    return Promise.all(skills.map(async skill => {
      if (group && !group.includes(skill.name)) throw new InstallRejection('removal-conflict');
      const revision = await managedRevision(target, skill.name, entries, alternatives);
      return { id: skill.id, name: skill.name, path: skill.path,
        revision: group ? createHash('sha256').update(JSON.stringify([revision, group])).digest('hex') : revision };
    }));
  }
  async function remove(target, skills, source) {
    const root = target.path ?? homedir();
    return mutate(root, async () => {
      const current = await reviewRemoval(target, skills, source);
      if (current.some((skill, index) => skill.revision !== skills[index].revision)) throw new InstallRejection('removal-conflict');
      const names = current.map(skill => skill.name);
      const agents = (await upstreamAgents()).filter(agent => agent.projectPath === '.agents/skills').map(agent => agent.id);
      let processFailed = false;
      try { await run(['remove', ...names, '--agent', ...agents, '--yes', ...(target.path ? [] : ['--global'])], root); }
      catch { processFailed = true; }
      const entries = await managedEntries(target.path);
      const removed = [];
      for (const name of names) {
        if (!Object.hasOwn(entries, name) && !await fileInfo(join(root, '.agents/skills', name))) removed.push(name);
      }
      return { removed, failed: processFailed || removed.length !== names.length };
    });
  }
  async function create(target, directory, name, verify, authorize = async () => {}) {
    if (!skillName(name)) throw new InstallRejection('creation-name');
    return mutate(target.path ?? homedir(), async () => {
      await authorize();
      const base = dirname(dirname(directory));
      const occupied = join(directory, name);
      if (await realpath(base) !== resolve(base)) throw new InstallRejection('creation-directory');
      for (const path of [dirname(directory), directory]) {
        const info = await fileInfo(path);
        if (info && !info.isDirectory()) throw new InstallRejection('creation-directory');
      }
      if (await fileInfo(occupied)) throw new InstallRejection('occupied');
      await mkdir(directory, { recursive: true });
      if (await realpath(directory) !== resolve(directory)) throw new InstallRejection('creation-directory');
      await authorize();
      let processFailed = false;
      try { await run(['init', name], directory, 15000); }
      catch { processFailed = true; }
      const file = join(occupied, 'SKILL.md');
      const info = await fileInfo(file);
      if (!info?.isFile() || !await verify(file) || processFailed) {
        throw new InstallRejection(info ? 'creation-unverified' : 'creation-failed');
      }
      return { name };
    });
  }
  async function reviewTrash(skills) {
    if (!await hasNativeTrash()) throw new InstallRejection('removal-unavailable');
    return Promise.all(skills.map(async skill => {
      if (await realpath(skill.nativePath) !== resolve(skill.nativePath)) throw new InstallRejection('removal-unavailable');
      return { id: skill.id, name: skill.name, path: skill.path, revision: await reviewRevision(skill.nativePath, skill.id, true) };
    }));
  }
  async function trash(target, skills) {
    return mutate(target.path ?? homedir(), async () => {
      const current = await reviewTrash(skills);
      if (current.some((skill, index) => skill.revision !== skills[index].revision)) throw new InstallRejection('removal-conflict');
      const removed = [];
      const removedIds = [];
      for (const skill of skills) {
        try {
          const [latest] = await reviewTrash([skill]);
          if (latest.revision !== skill.revision) continue;
          await execute(trashCommand, [skill.nativePath], { timeout: 15000 });
          if (!await fileInfo(skill.nativePath)) {
            removed.push(skill.name);
            removedIds.push(skill.id);
          }
        } catch { /* An unsuccessful item is reported by the observed batch result. */ }
      }
      return { removed, removedIds, failed: removed.length !== skills.length };
    });
  }
  return { preview, install, reviewRemoval, remove, create, reviewTrash, trash, protectedAgentRoots };
}
