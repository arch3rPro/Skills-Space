import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { devNull, homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { declaredSkillVersion } from './dist/dsh-skill-version.mjs';
import { readUpstream, skillFolderHashes } from './dist/upstream-readonly.mjs';
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
const providerInspector = fileURLToPath(new URL('./dist/provider.mjs', import.meta.url));
const downloader = fileURLToPath(new URL('./dist/download.mjs', import.meta.url));
const previewLifetime = 10 * 60 * 1000;
const originalSkillHashes = readUpstream(require.resolve('skills/package.json')).then(skillFolderHashes);
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
    if (!(workspace ? [1, 2].includes(lock.version) : lock.version === 3) || !lock.skills || typeof lock.skills !== 'object' || Array.isArray(lock.skills)) throw new Error('Unsupported skills lock');
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

async function contentHash(directory) {
  const files = [];
  async function collect(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const child = join(path, entry.name);
      if (entry.isDirectory()) await collect(child);
      else if (entry.isFile()) files.push([relative(directory, child).split('\\').join('/'), await readFile(child)]);
      if (files.length > 5000) throw new InstallRejection('update-unavailable');
    }
  }
  await collect(directory);
  const digest = createHash('sha256');
  for (const [path, bytes] of files.sort(([a], [b]) => a.localeCompare(b))) digest.update(path).update(bytes);
  return digest.digest('hex');
}

async function fileHashes(directory) {
  const result = new Map();
  async function collect(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const child = join(path, entry.name);
      if (entry.isDirectory()) await collect(child);
      else if (entry.isFile()) result.set(relative(directory, child).split('\\').join('/'), createHash('sha256').update(await readFile(child)).digest('hex'));
      if (result.size > 5000) throw new InstallRejection('update-unavailable');
    }
  }
  await collect(directory);
  return result;
}

async function comparisonFiles(directory) {
  const files = new Map();
  let bytes = 0;
  async function collect(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const child = join(path, entry.name);
      if (entry.isDirectory()) await collect(child);
      else if (entry.isFile()) {
        const content = await readFile(child);
        bytes += content.length;
        if (bytes > 8 * 1024 * 1024 || files.size >= 100) throw new InstallRejection('diff-unavailable');
        files.set(relative(directory, child).split('\\').join('/'), content);
      } else throw new InstallRejection('diff-unavailable');
    }
  }
  await collect(directory);
  return files;
}

function contentHashMap(files) {
  const digest = createHash('sha256');
  for (const [path, bytes] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) digest.update(path).update(bytes);
  return digest.digest('hex');
}

async function compareContents(original, current, revision, version) {
  const names = [...new Set([...original.keys(), ...current.keys()])].sort();
  const changed = names.filter(name => !original.get(name)?.equals(current.get(name) ?? Buffer.alloc(0)) || !current.has(name));
  if (changed.length > 100) throw new InstallRejection('diff-unavailable');
  const directory = await mkdtemp(join(tmpdir(), 'dsh-skills-diff-'));
  try {
    const files = [];
    for (const name of changed) {
      const before = original.get(name), after = current.get(name);
      const binary = [before, after].filter(Boolean).some(bytes => {
        if (bytes.includes(0)) return true;
        try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return false; }
        catch { return true; }
      });
      const status = !before ? 'added' : !after ? 'deleted' : 'modified';
      let diff = '';
      if (!binary) {
        const oldPath = join(directory, 'old'), newPath = join(directory, 'new');
        if (before) await writeFile(oldPath, before);
        if (after) await writeFile(newPath, after);
        try {
          const output = await execute('git', ['-c', 'core.quotepath=false', 'diff', '--no-index', '--no-ext-diff', '--no-textconv', '--no-color', '--', before ? oldPath : devNull, after ? newPath : devNull], { timeout: 10000, maxBuffer: 2 * 1024 * 1024 });
          diff = output.stdout;
        } catch (error) {
          if (error.code !== 1) throw error;
          diff = error.stdout;
        }
        diff = diff.slice(diff.indexOf('@@ '));
        if (before) await rm(oldPath);
        if (after) await rm(newPath);
      }
      files.push({ path: name, status, binary, diff });
    }
    return { revision, version, files };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

async function gitTreeHash(directory) {
  async function tree(path) {
    const children = [];
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const child = join(path, entry.name);
      if (!entry.isDirectory() && !entry.isFile()) throw new InstallRejection('update-unavailable');
      const bytes = entry.isDirectory() ? await tree(child) : await readFile(child);
      const mode = entry.isDirectory() ? '40000' : (await stat(child)).mode & 0o111 ? '100755' : '100644';
      const object = createHash('sha1').update(`${entry.isDirectory() ? 'tree' : 'blob'} ${bytes.length}\0`).update(bytes).digest();
      children.push({ name: entry.name, mode, object, directory: entry.isDirectory() });
    }
    children.sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.directory ? '/' : '')), Buffer.from(b.name + (b.directory ? '/' : ''))));
    return Buffer.concat(children.map(({ name, mode, object }) => Buffer.concat([Buffer.from(`${mode} ${name}\0`), object])));
  }
  const bytes = await tree(directory);
  return createHash('sha1').update(`tree ${bytes.length}\0`).update(bytes).digest('hex');
}

async function installedRevisionMatches(directory, entry) {
  const recorded = entry?.computedHash || entry?.skillFolderHash;
  if (typeof recorded !== 'string') return null;
  if (/^[a-f\d]{64}$/i.test(recorded)) {
    const { hash, legacyHash } = await (await originalSkillHashes)(directory);
    return recorded === hash || recorded === legacyHash;
  }
  if (/^[a-f\d]{40}$/i.test(recorded)) return await gitTreeHash(directory) === recorded;
  return null;
}

function updateSource(entry) {
  if (entry.sourceType === 'well-known') return entry.sourceBaseUrl || entry.sourceUrl || null;
  const source = entry.sourceType === 'github' ? entry.source : entry.sourceUrl || entry.source;
  if (typeof source !== 'string' || !source || !['github', 'gitlab', 'git', 'local'].includes(entry.sourceType)) return null;
  if (entry.sourceType === 'git' && !entry.sourceUrl) return null;
  const folder = typeof entry.skillPath === 'string' ? entry.skillPath.replace(/\/?SKILL\.md$/, '').replace(/\/$/, '') : '';
  const append = !source.endsWith('.git') && !source.startsWith('git@') && !source.startsWith('ssh://') && (!source.includes('://') || ['github.com', 'gitlab.com'].includes(URL.parse(source)?.hostname));
  return `${append && folder ? `${source.replace(/\/$/, '')}/${folder}` : source}${entry.ref ? `#${entry.ref}` : ''}`;
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
  async function preview(input, target, signal, { includeInternal = false, captureName = null } = {}) {
    if (typeof input !== 'string' || !input.trim() || input.length > 8192) throw new InstallRejection('source');
    const packagePath = require.resolve('skills/package.json');
    const parserResult = await execute(process.execPath, [sourceParser, input.trim().startsWith('~/') ? join(homedir(), input.trim().slice(2)) : input.trim(), packagePath], {
      cwd: target.path ?? homedir(), env: gitEnvironment(target.path ?? homedir()), signal, timeout: 5000, maxBuffer: 64 * 1024,
    });
    const parsed = JSON.parse(parserResult.stdout);
    const local = parsed.type === 'local';
    if (!local) {
      if (!['github', 'gitlab', 'git', 'well-known'].includes(parsed.type)) throw new InstallRejection('source');
      const url = URL.parse(parsed.url);
      if (!url || (url.protocol !== 'https:' && !(parsed.type === 'well-known' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) || url.username || url.password) throw new InstallRejection('source');
      if (parsed.subpath && !['github', 'gitlab'].includes(parsed.type)) throw new InstallRejection('source');
    }
    const directory = await mkdtemp(join(tmpdir(), 'dsh-skills-preview-'));
    try {
      const { parse } = createRequire(packagePath)('yaml');
      let checkout = local ? await realpath(parsed.localPath) : join(directory, 'source');
      const env = gitEnvironment(directory);
      const options = { cwd: directory, env, signal, timeout: 60000, maxBuffer: 2 * 1024 * 1024 };
      if (parsed.type === 'well-known') {
        const inspected = await execute(process.execPath, [providerInspector, parsed.url, '', '', '', packagePath], options);
        const published = JSON.parse(inspected.stdout);
        if (published.directDownload) {
          const downloaded = await execute(process.execPath, [downloader, parsed.url, directory, packagePath], options);
          checkout = JSON.parse(downloaded.stdout).rootDir;
        } else {
          const skills = published.filter(skill => skill.internal !== true || includeInternal).map(skill => ({ name: skill.name, description: skill.description, internal: skill.internal }));
          if (!skills.length) throw new InstallRejection('source');
          const names = new Set(skills.map(skill => skill.name));
          const hashes = new Map(published.map(skill => [skill.name, contentHashMap(new Map(skill.files.map(([path, hex]) => [path, Buffer.from(hex, 'hex')])))]));
          const upstreamHashes = new Map(published.map(skill => [skill.name, skill.fingerprint]));
          const digests = new Map(published.map(skill => [skill.name, skill.digest]));
          const fileDetails = new Map(published.map(skill => [skill.name, new Map(skill.files.map(([path, hex]) => [path, createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex')]))]));
          const token = randomUUID();
          const contents = captureName && published.find(skill => skill.name === captureName)?.files;
          if (contents && (contents.length > 100 || contents.reduce((size, [, hex]) => size + hex.length / 2, 0) > 8 * 1024 * 1024)) throw new InstallRejection('diff-unavailable');
          plans.set(token, { kind: 'install', source: parsed.url, files: new Map(), hashes, upstreamHashes, digests, fileDetails, contents: contents ? new Map(contents.map(([path, hex]) => [path, Buffer.from(hex, 'hex')])) : null, target, names, expires: Date.now() + previewLifetime, website: true, download: false });
          return { token, skills, skillFilter: null, warnings: [] };
        }
      }
      let source = checkout;
      if (!local && parsed.type !== 'well-known') {
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
      const hashes = new Map();
      const fileDetails = new Map();
      let contents = null;
      let sourceTree = null;
      let sourceLockHashes = null;
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
        hashes.set(metadata.name, await contentHash(path));
        fileDetails.set(metadata.name, await fileHashes(path));
        if (metadata.name === captureName) {
          contents = await comparisonFiles(path);
          sourceTree = await gitTreeHash(path);
          sourceLockHashes = await (await originalSkillHashes)(path);
        }
        skills.push({ name: metadata.name, description: metadata.description, internal: metadata.metadata?.internal === true });
      }
      if (!skills.length) throw new Error('No compatible skill found');
      const now = Date.now();
      for (const [key, plan] of plans) if (plan.expires <= now) plans.delete(key);
      if (plans.size >= 16) plans.delete(plans.keys().next().value);
      const token = randomUUID();
      plans.set(token, { kind: 'install', source: parsed.type === 'well-known' ? parsed.url : source, files, hashes, fileDetails, contents, sourceTree, sourceLockHashes, target, names, expires: now + previewLifetime, website: parsed.type === 'well-known', download: parsed.type === 'well-known' });
      return { token, skills, skillFilter: parsed.skillFilter ?? null, warnings };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  async function install(token, names, target) {
    const plan = plans.get(token);
    if (plan?.kind !== 'install' || plan.expires <= Date.now() || JSON.stringify(plan.target) !== JSON.stringify(target)) throw new InstallRejection('preview-expired');
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
      if (plan.website) {
        const reviewDirectory = await mkdtemp(join(tmpdir(), 'dsh-skills-source-check-'));
        try {
          const options = { cwd: reviewDirectory, env: gitEnvironment(reviewDirectory), timeout: 60000, maxBuffer: 2 * 1024 * 1024 };
          if (plan.download) {
            const prepared = await execute(process.execPath, [downloader, plan.source, reviewDirectory, require.resolve('skills/package.json')], options);
            const directory = JSON.parse(prepared.stdout).rootDir;
            const discovered = await execute(process.execPath, [discover, directory, directory, 'true', '', require.resolve('skills/package.json')], options);
            const { parse } = createRequire(require.resolve('skills/package.json'))('yaml');
            const current = new Map();
            for (const path of JSON.parse(discovered.stdout).paths) {
              const content = await readFile(join(path, 'SKILL.md'), 'utf8');
              const frontmatter = content.match(/^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---(?:\s|$)/)?.[1];
              const name = frontmatter && parse(frontmatter)?.name;
              if (skillName(name)) current.set(name, await contentHash(path));
            }
            if (names.some(name => current.get(name) !== plan.hashes.get(name))) throw new InstallRejection('preview-expired');
          } else {
            const checked = await execute(process.execPath, [providerInspector, plan.source, '', '', '', require.resolve('skills/package.json')], options);
            const published = JSON.parse(checked.stdout);
            if (!Array.isArray(published)) throw new InstallRejection('preview-expired');
            const current = new Map(published.map(skill => [skill.name, contentHashMap(new Map(skill.files.map(([path, hex]) => [path, Buffer.from(hex, 'hex')])))]));
            if (names.some(name => current.get(name) !== plan.hashes.get(name))) throw new InstallRejection('preview-expired');
          }
        } finally { await rm(reviewDirectory, { recursive: true, force: true }); }
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
        if (!plan.download && !Object.hasOwn(current, name)) continue;
        if ((await fileInfo(join(root, '.agents/skills', name, 'SKILL.md')))?.isFile()
          && await contentHash(join(root, '.agents/skills', name)).catch(() => null) === plan.hashes.get(name)) installed.push(name);
      }
      return { installed, failed: processFailed || installed.length !== names.length,
        ...(plan.download ? { collection: 'native' } : {}) };
    });
  }
  async function reviewUpdate(target, name, signal) {
    if (!skillName(name)) throw new InstallRejection('update-unavailable');
    const root = target.path ?? homedir();
    await checkTarget(root);
    const entries = await managedEntries(target.path);
    const entry = entries[name];
    const source = entry && updateSource(entry);
    const installed = join(root, '.agents/skills', name);
    if (!source || !(await fileInfo(join(installed, 'SKILL.md')))?.isFile()) throw new InstallRejection('update-unavailable');
    const inspected = await preview(source, target, signal);
    const plan = plans.get(inspected.token);
    if (!plan?.hashes.has(name)) { plans.delete(inspected.token); throw new InstallRejection('update-unavailable'); }
    const currentHash = await contentHash(installed);
    const latestHash = plan.hashes.get(name);
    const currentFiles = await fileHashes(installed);
    const latestFiles = plan.fileDetails.get(name);
    const changedFiles = [...new Set([...currentFiles.keys(), ...latestFiles.keys()])].filter(path => currentFiles.get(path) !== latestFiles.get(path)).sort();
    plans.set(inspected.token, { ...plan, kind: 'update', name, entry, currentHash, latestHash });
    const recordedMatch = await recordedSnapshotMatches(target, name, entry, installed, signal);
    return { token: inspected.token, name, source: entry.source, changed: latestHash !== currentHash,
      localModified: recordedMatch === null ? null : !recordedMatch, changedFiles };
  }
  async function checkUpdates(target, names, signal) {
    const root = target.path ?? homedir();
    await checkTarget(root);
    const entries = await managedEntries(target.path);
    const groups = new Map();
    const result = new Map();
    for (const name of [...new Set(names)]) {
      const entry = entries[name];
      const source = entry && updateSource(entry);
      if (!skillName(name) || !source || !(await fileInfo(join(root, '.agents/skills', name, 'SKILL.md')))?.isFile()) continue;
      const group = groups.get(source) ?? [];
      group.push(name);
      groups.set(source, group);
    }
    for (const [source, group] of groups) {
      let inspected;
      try {
        inspected = await preview(source, target, signal);
        const plan = plans.get(inspected.token);
        for (const name of group) {
          const currentRevision = await contentHash(join(root, '.agents/skills', name));
          const latestRevision = plan?.hashes.get(name) ?? null;
          result.set(name, { name, status: latestRevision === null ? 'unknown' : latestRevision === currentRevision ? 'current' : 'available', currentRevision, latestRevision });
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        for (const name of group) result.set(name, { name, status: 'unknown', currentRevision: null, latestRevision: null });
      } finally {
        if (inspected) plans.delete(inspected.token);
      }
    }
    return [...result.values()];
  }
  async function reviewSync(target, name) {
    if (!skillName(name)) throw new InstallRejection('sync-unavailable');
    const root = target.path ?? homedir();
    await checkTarget(root);
    const entries = await managedEntries(target.path);
    const installed = join(root, '.agents/skills', name);
    if (!(await fileInfo(join(installed, 'SKILL.md')))?.isFile()
      || await recordedSnapshotMatches(target, name, entries[name], installed) !== true) throw new InstallRejection('sync-unavailable');
    return { source: installed, name };
  }
  async function reviewDiff(target, name, expectedRevision, signal) {
    if (!skillName(name) || !/^[a-f\d]{64}$/i.test(expectedRevision)) throw new InstallRejection('diff-unavailable');
    const root = target.path ?? homedir();
    const entry = (await managedEntries(target.path))[name];
    const source = entry && updateSource(entry);
    if (!source) throw new InstallRejection('diff-unavailable');
    const installed = join(root, '.agents/skills', name);
    const current = await comparisonFiles(installed);
    const revision = await contentHash(installed);
    if (revision !== expectedRevision) throw new InstallRejection('diff-changed');
    const recorded = entry.computedHash || entry.skillFolderHash || entry.wellKnownDigest;
    const comparisonSource = rootCommitSource(source, entry, recorded) ?? source;
    const inspected = await preview(comparisonSource, target, signal, { includeInternal: true, captureName: name });
    const plan = plans.get(inspected.token);
    plans.delete(inspected.token);
    const sourceMatches = typeof recorded === 'string' && (
      recorded === plan?.hashes.get(name) || recorded === plan?.upstreamHashes?.get(name) || recorded === plan?.sourceTree || recorded === plan?.sourceLockHashes?.hash || recorded === plan?.sourceLockHashes?.legacyHash || recorded === plan?.digests?.get(name)
      || /^[a-f\d]{40}$/i.test(recorded) && plan?.source.endsWith(`#${recorded}`)
    );
    if (!sourceMatches || !plan?.contents) throw new InstallRejection('diff-unavailable');
    if (JSON.stringify((await managedEntries(target.path))[name]) !== JSON.stringify(entry)
      || await contentHash(installed) !== revision) throw new InstallRejection('diff-changed');
    return compareContents(plan.contents, current, revision, recorded);
  }
  async function diffStatus(target, name, signal) {
    const entry = (await managedEntries(target.path))[name];
    if (!entry || !updateSource(entry)) return { modified: false, revision: null };
    const installed = join(target.path ?? homedir(), '.agents/skills', name);
    const matches = await recordedSnapshotMatches(target, name, entry, installed, signal).catch(() => null);
    return { modified: matches === false, revision: matches === false ? await contentHash(installed).catch(() => null) : null };
  }
  function rootCommitSource(source, entry, recorded) {
    if (!/^[a-f\d]{40}$/i.test(recorded ?? '') || !['github', 'gitlab', 'git'].includes(entry?.sourceType)) return null;
    const folder = entry.skillPath?.replace(/\/?SKILL\.md$/, '').replace(/\/$/, '') ?? '';
    return folder ? null : `${source.split('#')[0]}#${recorded}`;
  }
  async function recordedSnapshotMatches(target, name, entry, installed, signal) {
    const direct = await installedRevisionMatches(installed, entry);
    if (direct === true) return true;
    const recorded = entry?.computedHash || entry?.skillFolderHash;
    const source = entry && updateSource(entry);
    const pinned = source && rootCommitSource(source, entry, recorded);
    const website = entry?.sourceType === 'well-known' && typeof entry.wellKnownDigest === 'string';
    if (!pinned && !website) return direct;
    try {
      const inspected = await preview(pinned ?? source, target, signal ?? AbortSignal.timeout(60000), website ? { captureName: name } : {});
      const plan = plans.get(inspected.token);
      plans.delete(inspected.token);
      if (pinned && !plan?.source.endsWith(`#${recorded}`)) return null;
      if (website && plan?.digests?.get(name) !== entry.wellKnownDigest) return null;
      return (website ? plan.contents && contentHashMap(plan.contents) : plan.hashes.get(name)) === await contentHash(installed);
    } catch { return null; }
  }
  async function update(token, target) {
    const plan = plans.get(token);
    if (plan?.kind !== 'update' || plan.expires <= Date.now() || JSON.stringify(plan.target) !== JSON.stringify(target)) throw new InstallRejection('preview-expired');
    const root = target.path ?? homedir();
    return mutate(root, async () => {
      plans.delete(token);
      await checkTarget(root);
      const entries = await managedEntries(target.path);
      if (JSON.stringify(entries[plan.name]) !== JSON.stringify(plan.entry)
        || await contentHash(join(root, '.agents/skills', plan.name)) !== plan.currentHash) throw new InstallRejection('update-conflict');
      if (plan.latestHash === plan.currentHash) return { updated: [], failed: false };
      const local = plan.files.get(plan.name);
      if (local && await reviewRevision(local.path, { name: plan.name }) !== local.revision) throw new InstallRejection('preview-expired');
      if (plan.website) {
        const checked = await preview(plan.source, target, AbortSignal.timeout(60000));
        const current = plans.get(checked.token);
        plans.delete(checked.token);
        if (current?.hashes.get(plan.name) !== plan.latestHash) throw new InstallRejection('preview-expired');
      }
      const directory = await mkdtemp(join(tmpdir(), 'dsh-skills-update-'));
      const args = ['add', plan.source, '--agent', 'universal', '--skill', plan.name,
        '--yes', '--copy', '--full-depth', ...(target.path ? [] : ['--global'])];
      let processFailed = false;
      try { await execute(process.execPath, [cli(), ...args], { cwd: root,
        env: { ...gitEnvironment(directory), XDG_STATE_HOME: process.env.XDG_STATE_HOME },
        timeout: 120000, maxBuffer: 2 * 1024 * 1024 }); }
      catch { processFailed = true; }
      finally { await rm(directory, { recursive: true, force: true }); }
      const current = await managedEntries(target.path);
      const actual = await contentHash(join(root, '.agents/skills', plan.name)).catch(() => null);
      const updated = actual === plan.latestHash && Object.hasOwn(current, plan.name) ? [plan.name] : [];
      return { updated, failed: processFailed || updated.length !== 1 };
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
  return { preview, install, checkUpdates, reviewUpdate, update, reviewSync, reviewDiff, diffStatus, reviewRemoval, remove, create, reviewTrash, trash, protectedAgentRoots };
}
