// Keep the original release untouched. Helpers evaluate only the upstream
// functions they need, with their existing filesystem and network boundaries.
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

export const upstreamChunk = 'dist/_chunks/remove.mjs';

export async function readUpstream(packagePath = fileURLToPath(new URL('./skills/package.json', import.meta.url))) {
  const root = dirname(packagePath);
  const [shared, cli, api] = await Promise.all([
    readFile(join(root, upstreamChunk), 'utf8'),
    readFile(join(root, 'dist/cli.mjs'), 'utf8'),
    import(pathToFileURL(join(root, 'dist/index.mjs')).href),
  ]);
  const block = (start, end, entry = shared) => {
    const first = entry.indexOf(start);
    const last = entry.indexOf(end, first);
    if (first < 0 || last < first) throw new Error(`Review pinned upstream boundary: ${start}`);
    return entry.slice(first, last);
  };
  return {
    block, cli, diagnostics: api.diagnostics, isDiagnostic: api.isDiagnostic,
    source: () => block('const DEFAULT_GITHUB_HOST =', 'const DEFAULT_CLONE_TIMEOUT_MS =')
      + block('function isCommitSha(ref)', 'function isMissingRefError(')
      + block('function getOwnerRepo(', 'const CSI_RE ='),
    metadata: () => block('const CSI_RE =', 'const silentOutput =') + block('function parseFrontmatter(raw)', 'const EXCLUDE_FILES ='),
    discovery: () => block('const LEGACY_AGENT_PROJECT_SKILL_DIRS =', 'async function detectInstalledAgents(')
      + block('const SKIP_DIRS =', 'function isPathSafe$1('),
  };
}

export async function readProjectLock(directory, read, diagnostics) {
  const path = join(directory, 'skills-lock.json');
  let raw;
  try { raw = await read(path, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return { version: 2, skills: {} };
    throw error;
  }
  let lock;
  try { lock = JSON.parse(raw); } catch { /* Same diagnostic as upstream. */ }
  if (![1, 2].includes(lock?.version) || !lock.skills || typeof lock.skills !== 'object' || Array.isArray(lock.skills)) {
    throw diagnostics.SKILLS_INVALID_LOCAL_LOCK({ path, reason: 'expected a version 1 or 2 skills object' });
  }
  for (const entry of Object.values(lock.skills)) {
    if (entry?.sourceType === 'local' && typeof entry.source === 'string') entry.source = resolve(directory, entry.source);
  }
  return lock;
}

export function skillFolderHashes(upstream) {
  return async (directory) => {
    const hashers = runInNewContext(
      upstream.block('const EXCLUDE_FILES =', 'const AGENTS_DIR$1 =')
      + upstream.block('async function computeLegacySkillFolderHash(', 'async function getLockedSkillState(')
      + '\n({computeSkillFolderHash,computeLegacySkillFolderHash});',
      { Buffer, createHash, join, relative, sep, stat, realpath, readdir, readFile },
      { timeout: 1000 },
    );
    const hash = await hashers.computeSkillFolderHash(directory);
    const legacyHash = await hashers.computeLegacySkillFolderHash(directory).catch(() => null);
    return { hash, legacyHash };
  };
}
