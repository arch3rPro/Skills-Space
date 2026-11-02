// Skills Space Pi visibility extension v2. No skill or lockfile writes.
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const policyName = 'skills-space-visibility.json';
export const extensionName = 'skills-space-visibility.js';
export function canonicalSkillFile(file) {
  try { return realpathSync(file); } catch { return resolve(file); }
}
export function readVisibilityPolicy(path) {
  let text;
  try {
    if (statSync(path).size > 1024 * 1024) throw Error('Visibility settings exceed the size limit.');
    text = readFileSync(path, 'utf8');
  } catch (error) { if (error.code === 'ENOENT') return { version: 1, hiddenSkills: [] }; throw error; }
  const data = JSON.parse(text);
  if (!data || data.version !== 1 || !Array.isArray(data.hiddenSkills) || data.hiddenSkills.length > 10000 || data.hiddenSkills.some(item => !item || typeof item.file !== 'string' || !isAbsolute(item.file) || typeof item.name !== 'string' || item.hidden !== undefined && typeof item.hidden !== 'boolean')) {
    throw Error('Unsupported Skills Space visibility settings.');
  }
  return data;
}

// Only original CLI installation records authorize overriding a source restriction.
function managedSkillFiles(cwd, trusted) {
  const home = homedir(), files = new Set();
  const locations = [
    ...(trusted ? [[join(cwd, '.agents/skills'), join(cwd, 'skills-lock.json')]] : []),
    [join(home, '.agents/skills'), process.env.XDG_STATE_HOME ? join(process.env.XDG_STATE_HOME, 'skills/.skill-lock.json') : join(home, '.agents/.skill-lock.json')],
  ];
  for (const [root, path] of locations) {
    let lock;
    try {
      if (statSync(path).size > 1024 * 1024) continue;
      lock = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
    } catch { continue; }
    for (const [name, entry] of Object.entries(lock?.skills ?? {})) {
      if (basename(name) === name && name !== '.' && name !== '..' && typeof entry?.source === 'string') files.add(canonicalSkillFile(join(root, name, 'SKILL.md')));
    }
  }
  return files;
}

export default function skillsSpaceVisibility(pi) {
  // The deployed entry lives directly in <agentDir>/extensions/.
  const agentDir = dirname(dirname(fileURLToPath(import.meta.url)));
  pi.on('before_agent_start', (event, ctx) => {
    if (!event.systemPromptOptions || !Array.isArray(event.systemPromptOptions.skills)) {
      throw Error('Skills Space visibility requires Pi 1.3.0 compatible structured prompt options.');
    }
    const policies = [readVisibilityPolicy(join(agentDir, policyName))];
    if (ctx.isProjectTrusted()) policies.push(readVisibilityPolicy(join(ctx.cwd, '.pi', policyName)));
    let nativeRecords={};
    try {
      const path=join(agentDir,'skills-space-invocation.json');
      if(statSync(path).size>16*1024*1024)throw Error('Invocation journal exceeds its size limit.');
      const state=JSON.parse(readFileSync(path,'utf8'));
      if(state.version!==1 || !state.records || typeof state.records!=='object')throw Error('Invalid invocation journal.');
      nativeRecords=state.records;
    } catch(error) {if(error.code!=='ENOENT')throw error;}
    const rules = new Map(policies.flatMap(policy => policy.hiddenSkills.map(item => [`${canonicalSkillFile(item.file)}\n${item.name}`, item.hidden !== false])));
    // Change this turn's prompt copy only. Keep the loader's complete skill list
    // and original skill contents for native /skill:name expansion. Explicit managed
    // preferences override frontmatter; missing preferences preserve its default.
    let managedFiles;
    for (const skill of event.systemPromptOptions.skills) {
      const file = canonicalSkillFile(skill.filePath);
      const hidden = rules.get(`${file}\n${skill.name}`);
      if (hidden === undefined) continue;
      const managed = (managedFiles ??= managedSkillFiles(ctx.cwd, ctx.isProjectTrusted())).has(file);
      if (!managed && (nativeRecords[file]?.phase === 'committed' || hidden === false)) continue;
      skill.disableModelInvocation = hidden;
    }
  });
}
