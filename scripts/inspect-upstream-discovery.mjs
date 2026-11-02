// Read-only original discovery: no CLI entry, repository scripts or mutation APIs.
import * as fs from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { runInNewContext } from 'node:vm';
import { parse } from './skills/node_modules/yaml/dist/index.js';

try {
  const root = await fs.realpath(process.argv[2]);
  const search = await fs.realpath(process.argv[3]);
  const includeInternal = process.argv[4] === 'true';
  const filter = process.argv[5] || null;
  const code = await fs.readFile(new URL('./skills/dist/cli.mjs', import.meta.url), 'utf8');
  function block(start, end) {
    const a = code.indexOf(start), b = code.indexOf(end, a);
    if (a < 0 || b < a) throw Error('Review pinned discovery boundaries.');
    return code.slice(a, b);
  }
  let failure = null, count = 0, bytes = 0;
  const warnings = [];
  async function checked(path) {
    const requested = resolve(path);
    if (requested !== root && !requested.startsWith(root + sep)) throw Error('Discovery path escapes source.');
    const actual = await fs.realpath(requested);
    // Case-insensitive filesystems may resolve SKILL.md to an ordinary skill.md.
    // Detect links from file metadata, not spelling differences in realpath.
    let current = root;
    for (const part of relative(root, requested).split(sep).filter(Boolean)) {
      current = join(current, part);
      if ((await fs.lstat(current)).isSymbolicLink()) throw Error('Linked source paths cannot be reliably previewed.');
    }
    if (actual !== root && !actual.startsWith(root + sep)) throw Error('Discovery path escapes source.');
    return actual;
  }
  function bounded(action) {
    return async (...args) => {
      try { return await action(...args); }
      catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes(error.code)) failure ??= error;
        throw error;
      }
    };
  }
  const original = runInNewContext(
    block('const CSI_RE =', 'const silentOutput =')
      + block('function parseFrontmatter(raw) {', 'const home = homedir();')
      + '\n({discoverSkills,filterSkills});', {
      basename, dirname, isAbsolute, join, normalize, relative, resolve, sep, parse,
      process: {env: {}, cwd: () => root},
      console: {warn: warning => { if (warnings.length < 200) warnings.push(String(warning)); }},
      stat: bounded(async path => fs.stat(await checked(path))),
      readFile: bounded(async path => {
        path = await checked(path);
        const limit = basename(path) === 'SKILL.md' ? 256 * 1024 : 1024 * 1024;
        const info = await fs.stat(path);
        if (!info.isFile() || info.size > limit) throw Error('Source file exceeds preview limits.');
        const data = await fs.readFile(path, 'utf8');
        bytes += Buffer.byteLength(data);
        if (Buffer.byteLength(data) > limit || bytes > 16 * 1024 * 1024) throw Error('Source exceeds preview limits.');
        return data;
      }),
      readdir: bounded(async (path, options) => {
        const entries = await fs.readdir(await checked(path), options);
        count += entries.length;
        if (count > 10000) throw Error('Source exceeds preview entry limits.');
        return entries;
      }),
    }, {timeout: 1000});
  // Application add always uses --full-depth. Keep the exact same original ordering,
  // internal filtering, project-lock exclusions, plugin paths and name deduplication.
  const skills = await original.discoverSkills(root, relative(root, search) || undefined, {includeInternal, fullDepth: true});
  if (failure) throw failure;
  const selected = filter ? original.filterSkills(skills, [filter]) : skills;
  if (selected.length > 200) throw Error('Source exceeds 200 skill preview limit.');
  console.log(JSON.stringify({paths: selected.map(skill => skill.path), warnings}));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
