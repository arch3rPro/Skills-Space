// Read-only Pi resource inspection. Never execute resource packages or install missing sources.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, globSync, accessSync, constants } from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readState, stateName, observe } from './pi-invocation-state.mjs';
import { readVisibilityPolicy, policyName, extensionName } from './pi-visibility-extension.mjs';
import { parse } from './skills/node_modules/yaml/dist/index.js';
const require = createRequire(new URL('./pi/package.json', import.meta.url));
const { minimatch } = require('minimatch');
const ignore = require('ignore').default ?? require('ignore');
const posix = value => value.split(sep).join('/');
const canonical = path => { try { return realpathSync(path); } catch { return resolve(path); } };
const systemPath = path => process.platform === 'darwin' ? resolve(path).replace(/^\/(var|tmp)(?=\/|$)/, '/private/$1') : resolve(path);
const isPattern = value => /^[!+-]/.test(value) || /[*?]/.test(value);
const isOverride = value => /^[!+-]/.test(value);
const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string');
// Match Pi's remembered nearest-parent decision and noninteractive default policy.
// Reading trust must not acquire Pi's write lock or create a trust store.
export function supportsPiPackageVersion(version) {
  const match=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version??'');
  return match!==null && (Number(match[1])>1 || Number(match[1])===1 && Number(match[2])>=3);
}
export function readProjectTrust(home, agentDir, project, globalSettings = {}) {
  const path = join(agentDir, 'trust.json');
  const raw = existsSync(path) ? readFileSync(path, 'utf8').replace(/^\uFEFF/, '') : null;
  let data; try { data = raw === null ? {} : JSON.parse(raw); } catch { throw Error('Invalid Pi project trust store.'); }
  if (!data || Array.isArray(data) || typeof data !== 'object' || Object.values(data).some(value => value !== null && typeof value !== 'boolean')) throw Error('Invalid Pi project trust store.');
  const dependency = {path, revision:createHash('sha256').update(raw === null ? 'missing' : `present:${raw}`).digest('hex')};
  if (!project) return {trusted:true, decision:true, dependency};
  const cwd = canonical(project), config = join(cwd, '.pi');
  let requiresTrust = ['settings.json','mcp.json','extensions','skills','prompts','themes','SYSTEM.md','APPEND_SYSTEM.md'].some(name => existsSync(join(config, name)));
  for (let dir = cwd; !requiresTrust;) {
    if (join(dir, '.agents/skills') !== join(canonical(home), '.agents/skills') && existsSync(join(dir, '.agents/skills'))) requiresTrust = true;
    const parent = dirname(dir); if (parent === dir) break; dir = parent;
  }
  for (let dir = cwd;;) {
    if (typeof data[dir] === 'boolean') return {trusted:!requiresTrust || data[dir], decision:data[dir], dependency};
    const parent = dirname(dir); if (parent === dir) break; dir = parent;
  }
  return {trusted:!requiresTrust || globalSettings.defaultProjectTrust === 'always', decision:globalSettings.defaultProjectTrust === 'always', dependency};
}
export function inspectPiSkills(home, agentDir, project = null, management = false) {
  const warnings = [], resources = new Map(), dependencies = [], configs = [];
  let visited = 0;
  function read(path, optional = true, limit = 1024 * 1024) {
    try { if (statSync(path).size > limit) throw Error(); return readFileSync(path, 'utf8').replace(/^\uFEFF/, ''); }
    catch (error) { if (optional && error.code === 'ENOENT') return null; throw Error(`Cannot safely read ${path}`); }
  }
  function configuration(scope, base) {
    const path = join(base, 'settings.json'), raw = read(path);
    let data;
    try { data = raw === null ? {} : JSON.parse(raw); } catch { throw Error(`Invalid Pi settings JSON: ${path}`); }
    if (!data || Array.isArray(data) || typeof data !== 'object' || data.skills !== undefined && !strings(data.skills) || data.enableSkillCommands !== undefined && typeof data.enableSkillCommands !== "boolean") throw Error(`Unsupported Pi skills settings: ${path}`);
    const entries = data.skills ?? [];
    const revision = createHash('sha256').update(raw === null ? 'missing' : `present:${raw}`).digest('hex');
    const config = {scope, path, base, revision, entries, data}; configs.push(config);
    return config;
  }
  const global = configuration('global', agentDir), local = project ? configuration('project', join(project, '.pi')) : null;
  const chosen = local ?? global;
  const trust = readProjectTrust(home, agentDir, project, global.data);
  dependencies.push(trust.dependency);
  // Management may edit installed project resources before Pi is allowed to load them.
  const activeLocal = management || trust.trusted ? local : null;
  const releasePath=join(agentDir,'install/current-version');let releaseRaw=null;
  try{releaseRaw=read(releasePath);}catch{releaseRaw='unreadable';}
  dependencies.push({path:releasePath,revision:createHash('sha256').update(releaseRaw===null?'missing':`present:${releaseRaw}`).digest('hex')});
  let packageManagerAvailable=false;
  if(supportsPiPackageVersion(releaseRaw?.trim())) {
    const path=join(agentDir,`install/releases/${releaseRaw.trim()}/node_modules/@earendil-works/pi-coding-agent/package.json`);let raw=null;
    try{raw=read(path);}catch{raw='unreadable';}
    dependencies.push({path,revision:createHash('sha256').update(raw===null?'missing':`present:${raw}`).digest('hex')});
    try {const data=JSON.parse(raw);packageManagerAvailable=data.name==='@earendil-works/pi-coding-agent'&&data.version===releaseRaw.trim();}catch{/* No qualified original package manager. */}
  }
  // Use the qualified original SettingsManager in memory: no configuration writes or extensions run.
  let codemode = null;
  if (packageManagerAvailable) {
    try {
      const {SettingsManager} = require(join(agentDir,`install/releases/${releaseRaw.trim()}/node_modules/@earendil-works/pi-coding-agent/dist/core/settings-manager.js`));
      const manager = (projectData = {}) => SettingsManager.fromStorage({withLock(scope, fn) { fn(JSON.stringify(scope === 'global' ? global.data : projectData)); }}, {projectTrusted:true});
      const inherited = manager().getSettings().codemode ?? {};
      const own = chosen.data.codemode ?? {};
      const mode = value => value === 'only' ? 'only' : 'on';
      const budget = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 3000;
      const startupTools=manager(local?.data).getDefaultTools() ?? ['read','bash','edit','write'];
      const builtin='builtin:codemode';
      let extensionEnabled=enabled(builtin,strings(global.data.extensions)?global.data.extensions:[],agentDir);
      for(const pattern of strings(local?.data.extensions)?local.data.extensions:[])if(isOverride(pattern)&&matches(builtin,pattern.slice(1),local.base,pattern.startsWith('+')||pattern.startsWith('-')))extensionEnabled=pattern.startsWith('+');
      codemode = {extensionEnabled,startupTools,startupEnabled:startupTools.includes('codemode'),mode:own.mode == null ? null : mode(own.mode),inlineBudget:own.inlineBudget == null ? null : budget(own.inlineBudget),inheritedMode:local ? mode(inherited.mode) : 'on',inheritedInlineBudget:local ? budget(inherited.inlineBudget) : 3000};
    } catch { warnings.push('Pi code mode settings could not be read from the installed Pi runtime.'); }
  }
  const journalPath=join(agentDir,stateName), journalRaw=read(journalPath,true,16*1024*1024);
  let journal;
  try {journal=readState(agentDir);} catch(error) {
    if(!(error instanceof SyntaxError) && !/Invalid invocation recovery journal/.test(error.message))throw error;
    journal={version:1,records:{},historyReset:true};
    // Keep the file untouched; only an explicit invocation write may rebuild it.
  }
  dependencies.push({path:journalPath,revision:createHash('sha256').update(journalRaw===null?'missing':`present:${journalRaw}`).digest('hex')});
  const visibilityPaths = [join(agentDir, policyName), ...(project ? [join(project, '.pi', policyName)] : [])];
  const policies = visibilityPaths.filter((_, index) => index === 0 || management || trust.trusted).map(path => {
    const raw = read(path);
    dependencies.push({path, revision:createHash('sha256').update(raw === null ? 'missing' : `present:${raw}`).digest('hex')});
    return readVisibilityPolicy(path);
  });
  const extensionPath = join(agentDir, 'extensions', extensionName);
  const extensionText = read(extensionPath);
  dependencies.push({path:extensionPath,revision:createHash('sha256').update(extensionText === null ? 'missing' : `present:${extensionText}`).digest('hex')});
  const extensionInstalled = extensionText === read(fileURLToPath(new URL('./pi-visibility-extension.mjs',import.meta.url)),false);

  const expand = (value, base) => resolve(base, value === '~' ? home : value.startsWith('~/') ? join(home, value.slice(2)) : value);
  function matches(file, pattern, base, exact = false) {
    const paths = [posix(file), posix(relative(base, file))];
    if (basename(file) === 'SKILL.md') paths.push(posix(dirname(file)), posix(relative(base, dirname(file))));
    if (exact) { const value = posix(normalize(pattern.replace(/^\.([/\\])/, ''))); return paths.includes(value); }
    paths.push(basename(file)); if (basename(file) === 'SKILL.md') paths.push(basename(dirname(file)));
    return paths.some(path => minimatch(path, posix(pattern)));
  }
  function enabled(file, patterns, base, explicit = false) {
    const includes = patterns.filter(value => !isOverride(value));
    let value = !explicit || !includes.length || includes.some(pattern => matches(file, pattern, base));
    if (patterns.some(pattern => pattern.startsWith('!') && matches(file, pattern.slice(1), base))) value = false;
    if (patterns.some(pattern => pattern.startsWith('+') && matches(file, pattern.slice(1), base, true))) value = true;
    if (patterns.some(pattern => pattern.startsWith('-') && matches(file, pattern.slice(1), base, true))) value = false;
    return value;
  }
  function scan(root, mode = 'pi') {
    const found = [];
    function visit(path, ig = ignore(), depth = 0, ancestors = new Set()) {
      if (++visited > 20000 || depth > 32) { if (!warnings.includes('Pi skill scan exceeded its inspection limit.')) warnings.push('Pi skill scan exceeded its inspection limit.'); return; }
      let actual, stat; try { actual = realpathSync(path); stat = statSync(path); } catch { return; }
      if (stat.isFile()) { if (path.endsWith('.md')) found.push(path); return; }
      if (!stat.isDirectory() || ancestors.has(actual)) return;
      const nextAncestors = new Set(ancestors).add(actual);
      const next = ignore().add(ig);
      for (const name of ['.gitignore', '.ignore', '.fdignore']) {
        const text = read(join(path, name)); if (!text) continue;
        const prefix = posix(relative(root, path));
        next.add(text.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
          const negated = line.startsWith('!'); const raw = (negated ? line.slice(1) : line).replace(/^\//, '');
          return `${negated ? '!' : ''}${prefix ? `${prefix}/` : ''}${raw}`;
        }));
      }
      // Pi preserves filesystem discovery order for same-rank name collisions.
      let entries; try { entries = readdirSync(path, {withFileTypes:true}); } catch { return; }
      const skill = join(path, 'SKILL.md');
      if (existsSync(skill) && statSync(skill).isFile() && !next.ignores(posix(relative(root, skill)))) { found.push(skill); return; }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const child = join(path, entry.name), rel = posix(relative(root, child));
        let stat; try { stat = statSync(child); } catch { continue; }
        if (stat.isDirectory() && !next.ignores(`${rel}/`)) visit(child, next, depth + 1, nextAncestors);
        else if (stat.isFile() && entry.name.endsWith('.md') && !next.ignores(rel) && (mode === 'pi' ? path === root : path !== root)) found.push(child);
      }
    }
    if (existsSync(root)) visit(root);
    return found;
  }
  function add(file, config, base, patterns, origin, packageIndex = null, packageSource = null, explicit = false, forced = null, inScope = config.scope === chosen.scope) {
    if (resources.has(file)) return;
    resources.set(file, { file, config, base, patterns, origin, packageIndex, packageSource, packageRoot:origin==='package'?canonical(base):null, inScope, enabled: forced ?? enabled(file, patterns, base, explicit) });
  }
  function packageRoot(source, config) {
    if (source.startsWith('npm:')) {
      const spec = source.slice(4), name = spec.startsWith('@') ? spec.split('@').slice(0,2).join('@') : spec.split('@')[0];
      return join(config.base, 'npm/node_modules', name);
    }
    if (/^(git:|https?:|ssh:|git@)/.test(source)) {
      const value = source.replace(/^git:/, '').replace(/^git@([^:]+):/, 'https://$1/');
      const url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`);
      if (url.protocol !== 'ssh:' && url.username || url.password || url.search) throw Error('Credential-bearing package source.');
      const path = url.pathname.replace(/@[^/]+$/, '').replace(/\.git$/, '').replace(/^\//,'');
      if (path.split('/').some(part => part === '..')) throw Error('Invalid Pi package path.');
      return join(config.base, 'git', url.hostname, path);
    }
    return expand(source, config.base);
  }
  let resolvedPackages = {};
  if (packageManagerAvailable && [activeLocal, global].some(config => Array.isArray(config?.data.packages) && config.data.packages.length)) {
    try {
      resolvedPackages = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('./pi-package-driver.mjs', import.meta.url)), 'paths', agentDir, project || home, home], {encoding:'utf8',timeout:12000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']}));
    } catch (error) { warnings.push('Some original Pi package paths could not be inspected.'); }
  }
  const packageSeen = new Map();
  for (const config of [activeLocal, global].filter(Boolean)) {
    if (config.data.packages !== undefined && !Array.isArray(config.data.packages)) { warnings.push(`Unsupported Pi packages: ${config.path}`); continue; }
    for (const [index, pkg] of (config.data.packages ?? []).entries()) {
      const source = typeof pkg === 'string' ? pkg : pkg?.source;
      if (typeof source !== 'string') { warnings.push(`Unsupported Pi package entry: ${config.path}`); continue; }
      let root; try { root = resolvedPackages[`${config.scope}:${index}`]?.path ?? packageRoot(source, config); } catch { warnings.push('A Pi package source cannot be inspected.'); continue; }
      // Package identity is independent of transport, version and scope.
      const identity = source.startsWith('npm:') ? `npm:${posix(relative(join(config.base,'npm/node_modules'),root))}`
        : /^(git:|https?:|ssh:|git@)/.test(source) ? `git:${posix(relative(join(config.base,'git'),root))}` : canonical(root);
      const delta = typeof pkg === 'object' && pkg.autoload === false;
      if (packageSeen.has(identity) && !packageSeen.get(identity)) continue;
      packageSeen.set(identity, delta && config.scope === 'project');
      if (delta && !existsSync(root) && /^(npm:|git:|https?:)/.test(source)) {
        try { root = packageRoot(source, global); } catch { /* Keep missing-root warning below. */ }
      }
      if (!existsSync(root)) { warnings.push(`Pi package is not installed locally`); continue; }
      let manifest = null; try { const raw = read(join(root, 'package.json')); manifest = raw ? JSON.parse(raw).pi ?? null : null; } catch { warnings.push(`Invalid Pi package manifest: ${root}`); continue; }
      const manifestEntries = manifest?.skills;
      if (manifestEntries !== undefined && !strings(manifestEntries)) { warnings.push(`Unsupported Pi skill manifest: ${root}`); continue; }
      const patterns = typeof pkg === 'object' ? pkg.skills : undefined;
      if (patterns !== undefined && !strings(patterns)) { warnings.push(`Unsupported Pi package skills: ${source}`); continue; }
      let files = [];
      // With no user filter, an explicit empty manifest remains empty. Explicit
      // filters/deltas use Pi's convention fallback when the manifest is empty.
      const convention = !manifest || typeof pkg === 'object' && (patterns !== undefined || delta ? !manifestEntries?.length : manifestEntries === undefined);
      if (!convention) {
        for (const item of manifestEntries ?? []) if (!isOverride(item)) {
          const paths = /[*?]/.test(item) ? globSync(item, {cwd:root}).filter(path => !path.split(sep).some(part => part.startsWith('.'))).sort((a,b)=>a<b?-1:a>b?1:0) : [item];
          for (const path of paths) files.push(...scan(resolve(root, path)));
        }
        files = files.filter(file => enabled(file, (manifestEntries ?? []).filter(isOverride), root, true));
      } else files = scan(join(root, 'skills'));
      for (const file of files) {
        let forced = patterns?.length === 0 ? false : null;
        if (delta) {
          let matched = false;
          for (const pattern of patterns ?? []) if (matches(file, isOverride(pattern) ? pattern.slice(1) : pattern, root, /^[+-]/.test(pattern))) {
            matched = true; forced = !/^[!-]/.test(pattern);
          }
          if (!matched) continue;
        }
        add(file, config, root, patterns ?? [], 'package', index, source, true, forced);
      }
    }
  }
  for (const config of [activeLocal, global].filter(Boolean)) {
    const patterns = config.entries.filter(isPattern);
    for (const entry of config.entries.filter(value => !isPattern(value))) for (const file of scan(expand(entry, config.base))) add(file, config, config.base, patterns, 'configured', null, null, true);
  }
  const roots = [];
  if (activeLocal) {
    roots.push({path:join(local.base,'skills'), config:local, mode:'pi', inScope:true});
    let path = project;
    while (true) {
      // Pi excludes the user shared root from ancestor discovery, then loads it with user rules.
      if (resolve(path) !== resolve(home)) roots.push({path:join(path,'.agents/skills'), config:local, mode:'agents', inScope:resolve(path) === resolve(project)});
      if (existsSync(join(path,'.git')) || dirname(path) === path) break;
      path = dirname(path);
    }
  }
  roots.push({path:join(agentDir,'skills'),config:global,mode:'pi',inScope:!project},{path:join(home,'.agents/skills'),config:global,mode:'agents',inScope:!project});
  // Keep Pi's discovery/configuration precedence; installation ownership is separate.
  for (const root of roots) for (const file of scan(root.path, root.mode)) add(file, root.config, root.mode === 'agents' ? dirname(root.path) : root.config.base, root.config.entries.filter(isOverride), 'directory', null, null, false, null, root.inScope);
  const seen = new Set(), names = new Set(), skills = [], lifecycleCache=new Map();
  // Match resourcePrecedenceRank: configured/project, automatic/project, configured/user,
  // automatic/user, then package resources (regardless of package scope).
  const managedFiles = new Set();
  for (const [scope, root, lockPath] of [
    ['global',join(home,'.agents/skills'),process.env.XDG_STATE_HOME && resolve(home) === resolve(process.env.HOME || home) ? join(process.env.XDG_STATE_HOME,'skills/.skill-lock.json') : join(home,'.agents/.skill-lock.json')],
    ...(project ? [['project',join(project,'.agents/skills'),join(project,'skills-lock.json')]] : [])
  ]) {
    const raw = read(lockPath), lock = raw === null ? {} : JSON.parse(raw);
    dependencies.push({path:lockPath,revision:createHash('sha256').update(raw === null ? 'missing' : `present:${raw}`).digest('hex')});
    for (const [name, entry] of Object.entries(lock.skills ?? {})) {
      if (!entry || typeof entry.source !== 'string') continue;
      if (basename(name) !== name || name === '.' || name === '..') continue;
      managedFiles.add(canonical(join(root,name,'SKILL.md')));
    }
  }
  // Management keeps a project's installation even when an inherited alias is enabled.
  // Runtime discovery still chooses enabled aliases across scopes as Pi does.
  const ownedFiles = new Set([...resources.values()].filter(item => item.inScope).map(item => canonical(item.file)));
  const scopedResources = [...resources.values()].filter(item => !management || item.inScope || !ownedFiles.has(canonical(item.file)));
  // Disabled aliases must not reserve the physical file ahead of an enabled path.
  const enabledFiles = new Set(scopedResources.filter(item => item.enabled).map(item => canonical(item.file)));
  const rank = item => item.origin === 'package' ? 4 : (item.config.scope === 'project' ? 0 : 2) + (item.origin === 'directory' ? 1 : 0);
  for (const item of scopedResources.sort((a,b) => rank(a)-rank(b))) {
    const actual = canonical(item.file); if (seen.has(actual) || !item.enabled && enabledFiles.has(actual)) continue; seen.add(actual);
    let metadata, text;
    try { text = read(item.file, false); const normalized = text.replace(/\r\n?/g,'\n'), end = normalized.indexOf('\n---',3); metadata = normalized.startsWith('---') && end !== -1 ? parse(normalized.slice(4,end)) : {}; } catch { warnings.push(`Invalid Pi skill: ${item.file}`); continue; }
    // Invalid candidates must not reserve a name and shadow a valid resource.
    if (typeof metadata?.description !== 'string' || !metadata.description.trim()) { warnings.push(`Invalid Pi skill description: ${item.file}`); continue; }
    const name = typeof metadata?.name === 'string' && metadata.name ? metadata.name : basename(dirname(item.file));
    const description = typeof metadata?.description === 'string' ? metadata.description : '';
    const shadowed = item.enabled && names.has(name); if (item.enabled) names.add(name);
    const projectOnly = project && item.config.scope !== 'project';
    const delta = item.packageIndex !== null && item.config.data.packages[item.packageIndex]?.autoload === false;
    const reason = shadowed ? 'shadowed' : projectOnly ? 'globalInProject' : delta ? 'packageDelta' : null;
    const blockingRules = item.patterns.filter(pattern => pattern.startsWith('-') && matches(item.file,pattern.slice(1),item.base,true));
    const removalPath = basename(item.file)==='SKILL.md' ? canonical(dirname(item.file)) : actual;
    const reservedRemovalRoots = [home,agentDir,join(agentDir,'skills'),join(home,'.agents'),join(home,'.agents/skills'),...(project?[project,join(project,'.pi'),join(project,'.pi/skills'),join(project,'.agents'),join(project,'.agents/skills')]:[])].map(canonical);
    const canTrash = item.inScope && item.packageIndex === null && ['directory','configured'].includes(item.origin) && item.config.scope === chosen.scope && systemPath(item.file) === actual && !reservedRemovalRoots.includes(removalPath) && ![join(home,'.agents'),join(agentDir,'npm'),join(agentDir,'git'),...(project?[join(project,'.agents'),join(project,'.pi/npm'),join(project,'.pi/git')]:[])].some(root=>actual.startsWith(`${canonical(root)}${sep}`));
    const documentRevision = createHash('sha256').update(readFileSync(item.file)).digest('hex');
    const visibilityRules = policies.slice(0,item.config.scope === 'project' ? 2 : 1).flatMap(policy=>policy.hiddenSkills).filter(entry=>canonical(entry.file) === actual && entry.name === name);
    const managed=managedFiles.has(actual);
    const visibilityHidden = (managed || journal.records[actual]?.phase!=='committed') && visibilityRules.at(-1)?.hidden !== false && visibilityRules.length > 0;
    const sourceManualOnly = metadata?.['disable-model-invocation'] === true;
    let lifecycle=null;
    if(!managed)try{lifecycle=observe({...item,file:actual},journal.records,lifecycleCache,journal.installations??{});}catch(error){warnings.push(`${name}: ${error.message}`);}
    const scopeConflict=visibilityRules.length>1 && new Set(visibilityRules.map(rule=>rule.hidden!==false)).size>1;
    const staleScopeConflict=journal.records[actual]?.phase==='committed' && visibilityRules.some(rule=>(rule.hidden!==false)!==sourceManualOnly);
    if(lifecycle && (scopeConflict || staleScopeConflict)) {lifecycle.scopeConflict=true;lifecycle.recovery='conflict';warnings.push(`${name}: invocation preferences conflict across scopes; choose the physical file policy explicitly.`);}
    if(lifecycle && !lifecycle.configured && visibilityRules.length && lifecycle.fieldToken!==null && lifecycle.fieldToken!==(visibilityHidden?'true':'false') && !(lifecycle.source.reliable && ['clean','policyOnly'].includes(lifecycle.local))) {
      lifecycle.recovery='conflict';warnings.push(`${name}: existing invocation metadata conflicts with external preferences; review before migration.`);
    }
    let writable=true;if(!managed)try{accessSync(actual,constants.W_OK);accessSync(dirname(actual),constants.W_OK);}catch{writable=false;}
    const canSetVisibility = item.inScope && !shadowed && !projectOnly && writable;
    const extensionEnabled = extensionInstalled && strings(global.data.extensions ?? []) && enabled(extensionPath,global.data.extensions ?? [],agentDir);
    const prior=journal.records[actual];
    const canCheckPackage=!managed&&item.inScope&&packageManagerAvailable&&/^(npm:|git:|https?:|ssh:|git@)/.test(item.packageSource??'');
    const ownVisibility=policies.at(-1)?.hiddenSkills.some(entry=>canonical(entry.file)===actual && entry.name===name)??false;
    const canRestoreDefault=canSetVisibility&&(!managed||ownVisibility);
    const canRecoverInvocation=canSetVisibility&&!managed&&!!prior&&!lifecycle?.scopeConflict&&lifecycle?.recovery==='pendingRestore';
    skills.push({canCheckPackage,canRestoreDefault,canRecoverInvocation,visibilityConfigured:visibilityRules.length>0,managed,packageRoot:item.packageRoot,lifecycle,canTrash,canSetVisibility,visibilityHidden,visibilityPending:(managed&&visibilityRules.length>0||visibilityHidden)&&!extensionEnabled,sourceManualOnly,documentRevision,path:basename(item.file)==='SKILL.md'?canonical(dirname(item.file)):actual,file:actual,rulePath:item.file,name,description,enabled:item.enabled,canToggle:!reason,reason,blockingRules,settingsPath:item.config.path,scope:item.config.scope,inScope:item.inScope,packageIndex:item.packageIndex,packageSource:item.packageSource,origin:item.origin,manualOnly:managed&&visibilityRules.length>0&&extensionEnabled ? visibilityHidden : sourceManualOnly || !managed&&visibilityHidden&&extensionEnabled,cliAddressable:item.inScope && basename(item.file)==='SKILL.md' && canonical(dirname(dirname(item.file))) === canonical(join(project || home,'.agents/skills'))});
  }
  for (const config of configs) dependencies.push({path:config.path,revision:config.revision});
  const recoveryIssues=Object.entries(journal.records).filter(([file,record])=>!existsSync(file) && record.scope===chosen.scope && record.settingsPath===canonical(chosen.path)).map(([file,record])=>({file,name:record.name,source:record.source,reason:'missingOrRenamed'}));
  return {codemode,runtimeVersion:/^\d+\.\d+\.\d+$/.test(releaseRaw?.trim()??'')?releaseRaw.trim():null,additionalDirectories:chosen.entries.filter(value=>!isPattern(value)).map(value=>expand(value,chosen.base)).filter(path=>!existsSync(path)||statSync(path).isDirectory()),projectTrusted:trust.trusted,projectTrustDecision:trust.decision,trustRevision:trust.dependency.revision,recoveryIssues,skillCommands:chosen.data.enableSkillCommands ?? null,inheritedSkillCommands:local ? global.data.enableSkillCommands ?? true : true,target:{host:'local',scope:project?'project':'global',projectPath:project},path:chosen.path,revision:chosen.revision,entries:chosen.entries,dependencies,skills,warnings,agentDirectory:agentDir,visibilityExtensionAllowed:strings(global.data.extensions ?? []) && enabled(extensionPath,global.data.extensions ?? [],agentDir)};
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { const [home, agentDir, project] = process.argv.slice(2); if (!isAbsolute(home) || !isAbsolute(agentDir) || project && !isAbsolute(project)) throw Error('Pi inspection requires absolute paths.'); process.stdout.write(JSON.stringify(inspectPiSkills(home,agentDir,project || null,process.argv[5]==='--management'))); }
  catch (error) { process.stderr.write(error.message); process.exitCode=1; }
}
