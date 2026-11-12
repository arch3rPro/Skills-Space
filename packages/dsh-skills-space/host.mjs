import { directoryFields as directoryKeys, expression, isProvider, providerConfig as filesystemConfig, unresolvedDirectoryFields, directoryDeclarationStatus, additionalDirectoryLayout, restoreAdditionalDirectoryRules } from "./dist/directory-config.mjs";
import { isDeepStrictEqual } from "node:util";
import { createHash } from 'node:crypto';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hasNativeTrash, InstallRejection, managedCandidate, managedEntries, managedLifecycle, skillVersion } from './managed.mjs';
import { marketplace } from './marketplace.mjs';
import { installSkillPolicy, PolicyRejection } from './policy.mjs';

const id = 'dsh-skills-space';
const placements = ['settings', 'sidebar', 'both'];
const filesystem = '@deepseek-ai/dsh-skill-filesystem';
const wrapper = '@skills-space/dsh-skill-policy';
const removalBatchLimit = 100;
const policyBatchLimit = 100;

export const inject = ['profileContext', 'connection', 'loader', 'configEditor', 'workspaceRegistry'];

function enabledRows(rows) {
  return Array.isArray(rows) ? rows.flatMap(row => !row || typeof row !== "object" || row.disabled ? [] : row.group ? enabledRows(row.config) : [row]) : [];
}

function usableDirectory(value) {
  return typeof value === 'string' && (isAbsolute(value) || value === '~' || value.startsWith('~/'));
}

function displayPath(path) {
  const fromHome = relative(homedir(), path);
  if (!fromHome) return '~';
  return fromHome.startsWith('..') || isAbsolute(fromHome) ? path : `~/${fromHome}`;
}

function directorySummary(config, paths, home) {
  const defaults = config.includeDefaultRoots;
  const useDefaults = defaults === undefined || defaults === true;
  const dsh = config.dshHome;
  const agents = config.agentsHome;
  const extra = config.customSkillDirs;
  const validExtra = Array.isArray(extra) ? extra.filter(isAbsoluteString) : [];
  return {
    defaults: defaults === undefined ? true : typeof defaults === 'boolean' ? defaults : null,
    watch: config.watch === undefined ? true : typeof config.watch === 'boolean' ? config.watch : null,
    dsh: useDefaults && (dsh === undefined || usableDirectory(dsh)) ? displayPath(join(paths.resolveDshHome(dsh ?? home), 'skills')) : null,
    shared: useDefaults && (agents === undefined || usableDirectory(agents)) ? displayPath(join(paths.resolveAgentsHome(agents), 'skills')) : null,
    additional: validExtra.map(displayPath),
    builtinAdditional: additionalDirectoryLayout(config)?.builtin,
    partial: (defaults !== undefined && typeof defaults !== 'boolean')
      || (dsh !== undefined && !usableDirectory(dsh))
      || (agents !== undefined && !usableDirectory(agents))
      || (extra !== undefined && (!Array.isArray(extra) || validExtra.length !== extra.length))
      || (config.bundledSkillDir !== undefined && !isAbsoluteString(config.bundledSkillDir)),
  };
}

function isAbsoluteString(value) {
  return typeof value === 'string' && isAbsolute(value);
}

function inspectionConfig(config, home, summary) {
  return {
    watch: false,
    includeDefaultRoots: summary.defaults === true
      && (config.dshHome === undefined || usableDirectory(config.dshHome))
      && (config.agentsHome === undefined || usableDirectory(config.agentsHome)),
    dshHome: usableDirectory(config.dshHome) ? config.dshHome : home,
    agentsHome: usableDirectory(config.agentsHome) ? config.agentsHome : undefined,
    customSkillDirs: Array.isArray(config.customSkillDirs) ? config.customSkillDirs.filter(isAbsoluteString) : [],
    bundledSkillDir: isAbsoluteString(config.bundledSkillDir) ? config.bundledSkillDir : undefined,
  };
}

function directoryRevision(config) {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

function staticProvider(plugins) {
  if (!Array.isArray(plugins)) return undefined;
  const providers = enabledRows(plugins).filter(isProvider);
  if (providers.length !== 1 || !plugins.includes(providers[0])) return undefined;
  const config = filesystemConfig(providers[0]);
  if (!config || typeof config !== "object" || Array.isArray(config) || Object.hasOwn(config, "__js__") || Object.hasOwn(config, "__jsExpr")) return undefined;
  if (config.includeDefaultRoots !== undefined && !expression(config.includeDefaultRoots) && typeof config.includeDefaultRoots !== 'boolean') return undefined;
  if (['dshHome', 'agentsHome'].some(key => config[key] !== undefined && !expression(config[key]) && !usableDirectory(config[key]))) return undefined;
  if (config.customSkillDirs !== undefined && !expression(config.customSkillDirs) && (!Array.isArray(config.customSkillDirs) || !config.customSkillDirs.every(isAbsoluteString))) return undefined;
  return providers[0];
}

function directoryFields(fields) {
  if (!fields || typeof fields !== 'object' || typeof fields.defaults !== 'boolean') return null;
  if (!['dshHome', 'agentsHome'].every(key => fields[key] === '' || usableDirectory(fields[key]))) return null;
  if (!Array.isArray(fields.additional) || fields.additional.length > 64 || !fields.additional.every(entry => entry === null || isAbsoluteString(entry))) return null;
  const paths = new Set();
  const additional = fields.additional.filter(entry => {
    if (entry === null) return true;
    if (paths.has(entry)) return false;
    paths.add(entry);
    return true;
  });
  return {
    includeDefaultRoots: fields.defaults, customSkillDirs: additional,
    ...(fields.dshHome ? { dshHome: fields.dshHome } : {}),
    ...(fields.agentsHome ? { agentsHome: fields.agentsHome } : {}),
  };
}

function localWrite(request, action) {
  // The host has already admitted a same-origin owner. The carrier replaces
  // the URL with dsh.internal and retains the validated Host header.
  const host = request.headers.get('host');
  const authority = host && URL.parse(`http://${host}`);
  const hostname = authority?.hostname;
  return (hostname === 'localhost' || hostname === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(hostname ?? ''))
    && request.headers.get('x-dsh-skills-space') === action
    && request.headers.get('content-type')?.split(';')[0] === 'application/json';
}

// The pinned filesystem provider loads project directories from the nearest Git root.
async function projectRoot(directory) {
  for (let current = directory; current !== dirname(current); current = dirname(current)) {
    try { await access(join(current, '.git')); return current; }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
  }
  return directory;
}
async function parentRepository(directory) { return await projectRoot(directory) !== directory; }

export async function apply(ctx) {
  const profile = ctx.profileContext;
  const runtimeRequire = createRequire(profile.installAnchor);
  const load = name => import(pathToFileURL(runtimeRequire.resolve(name)).href);
  const [boot, paths, { FileSystemSkillProvider }, { withFileLock, writeFileAtomic }] = await Promise.all([
    load('@deepseek-ai/dsh-app-boot'),
    load('@deepseek-ai/dsh-home-paths'),
    load(filesystem),
    load('@deepseek-ai/dsh-atomic-write'),
  ]);
  const pluginEntry = () => [...ctx.loader.entries()].find(entry => entry.options.id === id && entry.options.name === id);
  const workspaces = () => ctx.workspaceRegistry.list().filter(workspace => isAbsoluteString(workspace.path));
  // Inventory reads are Host file management, independent of a conversation
  // filesystem and its session/permission lifecycle. Keep the original parser
  // and root discovery, using its supported native-filesystem fallback.
  const inventoryContext = { logger: ctx.logger, get: name => name === 'fs' ? undefined : ctx.get(name) };
  const managed = managedLifecycle(withFileLock);
  const policy = installSkillPolicy(ctx, profile.home, { withFileLock, writeFileAtomic, configuration: profile.patchPath });
  function presets() {
    const rows = enabledRows(boot.composeEntries([boot.readProfilePatches(id, profile)]));
    return rows.filter(row => row.name === '@deepseek-ai/dsh-agent-preset' && typeof row.config?.id === 'string')
      .map(row => ({
        id: row.config.id,
        rowId: row.id,
        label: typeof row.config.name === 'string' ? row.config.name : row.config.id,
        name: typeof row.config.name === 'string' ? row.config.name : undefined,
        description: typeof row.config.description === 'string' ? row.config.description : undefined,
        order: typeof row.config.order === "number" && Number.isFinite(row.config.order) ? row.config.order : Infinity,
        raw: row.config,
        configs: enabledRows(row.config.plugins ?? []).filter(isProvider)
          .map(filesystemConfig),
      })).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }
  function inventoryPreset(value) {
    const available = presets();
    if (value == null || value === '' || value === 'all') return {
      id: '', rowId: null, raw: available.map(row => row.raw),
      configs: available.flatMap(row => row.configs), members: available,
    };
    return available.find(row => row.id === value);
  }
  function placement() {
    const value = pluginEntry()?.options.config?.placement;
    return placements.includes(value) ? value : 'settings';
  }
  function presetEditor(preset) {
    return ctx.configEditor.entries().find(entry => entry.options.id === preset.rowId && entry.options.name === '@deepseek-ai/dsh-agent-preset');
  }
  function directoryReadOnly(preset, editors) {
    const rows = enabledRows(preset.raw.plugins).filter(isProvider);
    if (directoryDeclarationStatus(preset.raw.plugins) === "unknown") return "unknown-provider";
    if (!rows.length) return 'no-provider';
    if (rows.length > 1) return 'multiple-providers';
    if (!preset.raw.plugins.includes(rows[0])) return 'nested-provider';
    if (!staticProvider(preset.raw.plugins)) return 'dynamic-fields';
    if (!editors.some(item => item.entry.options.id === preset.rowId && item.entry.options.name === '@deepseek-ai/dsh-agent-preset')) return 'editor-unavailable';
    return null;
  }
  const directoryValues = config => Object.fromEntries(directoryKeys.filter(key => Object.hasOwn(config ?? {}, key)).map(key => [key, config[key]]));
  function inheritedDirectories(raw) {
    const provider = staticProvider(raw.plugins);
    if (provider) return directoryValues(filesystemConfig(provider));
    if (raw.plugins != null && (!Array.isArray(raw.plugins) || enabledRows(raw.plugins).some(row => [filesystem, wrapper].includes(row.name)))) return undefined;
    return {};
  }
  async function directoryEdit(preset, editors = ctx.configEditor.configuration()) {
    const provider = staticProvider(preset.raw.plugins);
    const editor = editors.find(item => item.entry.options.id === preset.rowId && item.entry.options.name === '@deepseek-ai/dsh-agent-preset');
    if (!provider || !editor) return undefined;
    const rawConfig = filesystemConfig(provider);
    const unresolvedFields = unresolvedDirectoryFields(rawConfig);
    const layout = additionalDirectoryLayout(rawConfig);
    const config = Object.fromEntries(Object.entries(rawConfig).filter(([key]) => !unresolvedFields.includes(key)));
    const inherited = inheritedDirectories(editor.inherited);
    const declaredRoots = [
      ...(config.includeDefaultRoots!==false ? [
        {path:join(paths.resolveDshHome(config.dshHome??profile.home),'skills'),source:'user-dsh'},
        {path:join(paths.resolveAgentsHome(config.agentsHome),'skills'),source:'user-agents'},
      ] : []),
      ...(config.customSkillDirs??[]).map(path=>({path,source:'custom'})),
      ...(isAbsoluteString(config.bundledSkillDir)?[{path:config.bundledSkillDir,source:'bundled'}]:[]),
    ];
    const roots=await Promise.all([...new Map(declaredRoots.map(root=>[root.path,root])).values()].map(async root=>({...root,exists:await stat(root.path).then(value=>value.isDirectory(),()=>false)})));
    return {
      roots, unresolvedFields, additionalDirectoryLayout:layout, revision: directoryRevision(preset.raw),
      overridden: Object.keys(editor.override).length > 0,
      canRestore: inherited !== undefined && !isDeepStrictEqual(directoryValues(rawConfig), inherited),
      userHome: homedir(), defaultHomes: { dsh: paths.resolveDshHome(profile.home), shared: paths.resolveAgentsHome() },
      defaults: config.includeDefaultRoots ?? true,
      dshHome: config.dshHome ?? '', agentsHome: config.agentsHome ?? '', additional: layout?.entries ?? config.customSkillDirs ?? [],
    };
  }
  async function updateDirectories(input) {
    const preset = presets().find(row => row.id === input.preset);
    const fields = input.reset === true ? null : directoryFields(input.fields);
    if (!preset || input.reset !== true && !fields) return Response.json({ error: 'directory-fields' }, { status: 400 });
    const entry = presetEditor(preset);
    const currentEdit = await directoryEdit(preset);
    if (!entry || !currentEdit || input.revision !== currentEdit.revision) return Response.json({ error: 'directory-conflict' }, { status: 409 });
    const hasRules = fields?.customSkillDirs.includes(null);
    if (hasRules && (!currentEdit.additionalDirectoryLayout ||
      fields.customSkillDirs.filter(value=>value===null).length !== currentEdit.additionalDirectoryLayout.entries.filter(value=>value===null).length)) {
      return Response.json({ error: 'directory-fields' }, { status: 400 });
    }
    if (input.reset === true && !currentEdit.canRestore) return Response.json({ error: 'directory-conflict' }, { status: 409 });
    if (!currentEdit.overridden && input.confirmOverride !== true) return Response.json({ error: 'directory-confirmation' }, { status: 409 });
    await ctx.configEditor.edit(entry, (current, inherited) => {
      const provider = staticProvider(current.plugins);
      if (!provider || directoryRevision(current) !== input.revision) throw new Error('Preset directory configuration changed');
      const restored = input.reset === true ? inheritedDirectories(inherited) : fields;
      if (restored === undefined) throw new Error('Inherited skill directories changed');
      const config = { ...filesystemConfig(provider) };
      for (const key of directoryKeys) {
        if (key === 'customSkillDirs' && hasRules) {
          config[key] = restoreAdditionalDirectoryRules(config[key], fields.customSkillDirs);
          continue;
        }
        if (input.reset !== true && unresolvedDirectoryFields(filesystemConfig(provider)).includes(key)) continue;
        delete config[key];
        if (Object.hasOwn(restored, key)) config[key] = restored[key];
      }
      return { ...current, plugins: current.plugins.map(row => row === provider ? { ...row, config: row.name === wrapper ? { ...row.config, filesystem: config } : config } : row) };
    });
    const updated = presets().find(row => row.id === input.preset);
    const result = updated && await directoryEdit(updated);
    return result ? Response.json({ ...result, context: { ...installEligibility(updated), directories: updated.configs.map(config => directorySummary(config, paths, profile.home)) } }) : Response.json({ error: 'directories' }, { status: 409 });
  }
  function installEligibility(preset) {
    const defaults = preset.configs.filter(config => directorySummary(config, paths, profile.home).defaults === true);
    return {
      installGlobal: true,
      installProject: true,
      discoversGlobal: defaults.some(config => (config.agentsHome === undefined || isAbsoluteString(config.agentsHome)) && paths.resolveAgentsHome(config.agentsHome) === join(homedir(), '.agents')),
      discoversProject: defaults.length > 0,
    };
  }
  async function installationTarget(input) {
    const workspace = input.workspace == null ? undefined : workspaces().find(row => row.id === input.workspace);
    const preset = inventoryPreset(null);
    if (input.workspace != null && !workspace) return null;
    const eligibility = installEligibility(preset);
    const discoversTarget = workspace ? eligibility.installProject : eligibility.installGlobal;
    if (!discoversTarget || (workspace && await parentRepository(workspace.path))) return null;
    return { workspace: workspace?.id ?? null, path: workspace?.path ?? null };
  }
  async function creationRoot(preset, workspace) {
    const configs = preset.configs;
    const active = configs.filter(config => inspectionConfig(config, profile.home, directorySummary(config, paths, profile.home)).includeDefaultRoots);
    if (!active.length) return null;
    const path = workspace ? join(workspace.path, '.dsh/skills') : join(profile.home, 'skills');
    if (workspace ? await parentRepository(workspace.path) : !active.some(config => paths.resolveDshHome(config.dshHome ?? profile.home) === profile.home)) return null;
    const sharedPaths = active.map(config => join(paths.resolveAgentsHome(config.agentsHome), 'skills'));
    return sharedPaths.includes(path) ? null : path;
  }
  async function creationChoices(preset, workspace) {
    const first = await creationRoot(preset, workspace);
    const roots = first ? [first] : [];
    for (const config of preset.configs) {
      const summary = directorySummary(config, paths, profile.home);
      if (!workspace && summary.defaults === true && (config.dshHome === undefined || usableDirectory(config.dshHome))) {
        roots.push(join(paths.resolveDshHome(config.dshHome ?? profile.home), 'skills'));
      }
      roots.push(...(Array.isArray(config.customSkillDirs) ? config.customSkillDirs.filter(isAbsoluteString) : []));
    }
    const protectedRoots = new Set([...await managed.protectedAgentRoots(workspace?.path), join(homedir(), '.agents/skills'), ...(workspace ? [join(workspace.path, '.agents/skills')] : []),
      ...preset.configs.flatMap(config => [join(paths.resolveAgentsHome(usableDirectory(config.agentsHome) ? config.agentsHome : undefined), 'skills'), ...(isAbsoluteString(config.bundledSkillDir) ? [config.bundledSkillDir] : [])])]);
    const canonical = async path => { try { return await realpath(path); } catch (error) { if (error.code === 'ENOENT') return path; throw error; } };
    const agents = JSON.parse(await readFile(new URL('./dist/agents.json', import.meta.url), 'utf8'));
    for (const agent of agents) {
      if (workspace && agent.projectPath) protectedRoots.add(join(workspace.path, agent.projectPath));
      if (agent.globalBase === 'home') protectedRoots.add(join(homedir(), agent.globalPath));
      else if (agent.globalBase === 'configHome') protectedRoots.add(join(homedir(), '.config', agent.globalPath));
    }
    const protectedPaths = new Set(await Promise.all([...protectedRoots].map(canonical)));
    const choices = [];
    const seen = new Set();
    for (const path of roots) {
      const physical = await canonical(path);
      if (physical !== path || seen.has(physical) || [...protectedPaths].some(root => physical === root || physical.startsWith(root + sep))) continue;
      seen.add(physical);
      choices.push({ id: createHash('sha256').update(path).digest('hex'), path, revision: directoryRevision(preset.raw) });
    }
    return choices;
  }
  async function withInventory(preset, workspace, signal, read) {
    const providers = [];
    const removalAllowed = !workspace || !await parentRepository(workspace.path);
    try {
      let partial = false, managedPartial = false;
      const partialPresets = new Set(), runtimePresets = new Set(), readFailedPresets = new Set();
      let entries;
      let ownership = 'ready';
      try { entries = await managedEntries(workspace?.path); }
      catch { ownership = 'error'; }
      const nativeRoots = await hasNativeTrash() ? (await creationChoices(preset, workspace)).map(choice => choice.path) : [];
      const discovered = [];
      const managedIds = new Set();
      const options = { cwd: workspace?.path, signal };
      for (const declaration of preset.members ?? [preset]) {
        let declarationPartial = directoryDeclarationStatus(declaration.raw.plugins) === 'unknown';
        if (declarationPartial && expression(declaration.raw.plugins)) runtimePresets.add(declaration.id);
        for (const config of declaration.configs) {
          const summary = directorySummary(config, paths, profile.home);
          if (unresolvedDirectoryFields(config).length || expression(config.bundledSkillDir)) runtimePresets.add(declaration.id);
          declarationPartial ||= summary.partial;
          const inspected = inspectionConfig(config, profile.home, summary);
          const jobs = [{ config: inspected }];
          // Unknown default-home fields suppress only their own roots. Keep each
          // provable root's original source and rank when inspecting it separately.
          if (summary.defaults === true && !inspected.includeDefaultRoots) {
            const known = [];
            if (workspace) {
              const root = await projectRoot(workspace.path);
              known.push([join(root, '.dsh/skills'), 'project-dsh', 100], [join(root, '.agents/skills'), 'project-agents', 200]);
            }
            if (typeof config.dshHome !== 'object' && (config.dshHome === undefined || isAbsoluteString(config.dshHome))) known.push([join(config.dshHome ?? profile.home, 'skills'), 'user-dsh', 400]);
            if (typeof config.agentsHome !== 'object' && (config.agentsHome === undefined || isAbsoluteString(config.agentsHome))) known.push([join(paths.resolveAgentsHome(config.agentsHome), 'skills'), 'user-agents', 500]);
            for (const [path, source, rank] of known) jobs.push({ config: { watch: false, includeDefaultRoots: false, customSkillDirs: [path] }, source, rank });
          }
          for (const job of jobs) {
            const provider = new FileSystemSkillProvider(inventoryContext, { invalidate() {}, signal }, job.config);
            providers.push(provider);
            let observed;
            try { observed = await provider.list(options); }
            catch (error) { if (signal?.aborted) throw error; declarationPartial = true; readFailedPresets.add(declaration.id); continue; }
            const candidates = Array.isArray(observed) ? observed : observed.candidates;
            if (!Array.isArray(observed) && !observed.complete) { declarationPartial = true; readFailedPresets.add(declaration.id); }
            for (const original of candidates) {
              const candidate = job.source ? { ...original, source: job.source, rank: job.rank } : original;
              if (!isAbsoluteString(candidate.path)) continue;
              let path;
              try { path = await realpath(candidate.path); }
              catch (error) {
                if (error.code !== 'ENOENT') throw error;
                declarationPartial = true; readFailedPresets.add(declaration.id);
                continue;
              }
              const key = createHash('sha256').update(JSON.stringify([path, candidate.name])).digest('hex');
              discovered.push({ key, path, candidate, provider, discoverable: true, presetId: declaration.id });
            }
          }
        }
        if (declarationPartial) partialPresets.add(declaration.id);
        partial ||= declarationPartial;
      }
      // CLI lifecycle follows the scope's standard shared directory, including
      // untracked files and files outside configured preset discovery.
      {
        const root = join(workspace?.path ?? homedir(), '.agents/skills');
        const provider = new FileSystemSkillProvider(inventoryContext, { invalidate() {}, signal }, { watch: false, includeDefaultRoots: false, customSkillDirs: [root] });
        providers.push(provider);
        let observed;
        try { observed = await provider.list(options); }
        catch (error) { if (signal?.aborted) throw error; observed = { candidates: [], complete: false }; }
        const candidates = Array.isArray(observed) ? observed : observed.candidates;
        if (!Array.isArray(observed)) managedPartial ||= !observed.complete;
        const present = new Set(discovered.map(item => item.key));
        for (const original of candidates) {
          if (original.path !== join(root, original.name, 'SKILL.md')) continue;
          const path = await realpath(original.path);
          const key = createHash('sha256').update(JSON.stringify([path, original.name])).digest('hex');
          if (entries && Object.hasOwn(entries, original.name)) managedIds.add(key);
          if (present.has(key)) continue;
          present.add(key);
          const candidate = { ...original, source: workspace ? 'project-agents' : 'user-agents', rank: workspace ? 200 : 500 };
          discovered.push({ key, path, candidate, provider, discoverable: false });
        }
      }
      discovered.sort((a, b) => a.candidate.rank - b.candidate.rank);
      for (const { key, candidate } of discovered) {
        if (entries && managedCandidate(candidate, workspace?.path, entries)) managedIds.add(key);
      }
      const sharedIds = new Set(discovered.filter(({ candidate }) => ['bundled', 'project-agents', 'user-agents'].includes(candidate.source)).map(({ key }) => key));
      const cliIds = new Set(discovered.filter(({ candidate }) => candidate.path === join(workspace?.path ?? homedir(), '.agents/skills', candidate.name, 'SKILL.md')).map(({ key }) => key));
      const winners = new Map(), memberships = new Map();
      for (const item of discovered) {
        if (!item.discoverable) continue;
        const winnerKey = JSON.stringify([item.presetId, item.candidate.name]);
        if (!winners.has(winnerKey)) winners.set(winnerKey, item.key);
        const member = { configurationPath: profile.patchPath, presetKey: item.presetId, preset: item.presetId, contextKey: item.presetId, source: item.candidate.source, shadowed: winners.get(winnerKey) !== item.key };
        const values = memberships.get(item.key) ?? [];
        if (!values.some(value => value.presetKey === member.presetKey)) values.push(member);
        memberships.set(item.key, values);
      }
      const ids = new Set();
      const items = discovered.flatMap(({ key, path, candidate, provider }) => {
        const members = memberships.get(key) ?? [];
        const cliAddressable = cliIds.has(key);
        const entry = cliAddressable ? entries?.[candidate.name] : undefined;
        if (ids.has(key)) return [];
        ids.add(key);
        let nativePath = null;
        if (removalAllowed && entries && !sharedIds.has(key) && !cliAddressable && !managedIds.has(key) && candidate.locator?.path === path
          && [workspace ? 'project-dsh' : 'user-dsh', 'custom'].includes(candidate.source)) {
          const directory = dirname(path);
          if (nativeRoots.includes(directory)) nativePath = path;
          else if (nativeRoots.includes(dirname(directory)) && basename(path) === 'SKILL.md') nativePath = directory;
        }
        return [{
          key, path, provider, candidate, nativePath,
          public: {
            id: key, name: candidate.name, description: candidate.description,
            path: displayPath(path), source: candidate.source,
            shadowed: members.length > 0 && members.every(member => member.shadowed),
            discoverable: members.length > 0, memberships: members, cliAddressable,
            installation: { source: typeof entry?.source === 'string' ? entry.source : null, sourceType: typeof entry?.sourceType === 'string' ? entry.sourceType : null, sourceUrl: typeof entry?.sourceUrl === 'string' ? entry.sourceUrl : null, version: [entry?.skillFolderHash, entry?.computedHash, entry?.wellKnownDigest].find(value => typeof value === 'string' && value.trim()) ?? null },
            managedUpdateable: removalAllowed && entries !== undefined && cliAddressable
              && ['github', 'gitlab', 'git', 'local', 'well-known'].includes(entry?.sourceType)
              && (entry?.sourceType !== 'git' || typeof entry.sourceUrl === 'string'),
            managedSyncable: removalAllowed && entries !== undefined && cliAddressable
              && /^[a-f\d]{40}(?:[a-f\d]{24})?$/i.test(entry?.computedHash || entry?.skillFolderHash || ''),
            managedRemovable: removalAllowed && entries !== undefined && cliAddressable, nativeRemovable: nativePath !== null,
            managed: entries ? managedIds.has(key) : null,
            removable: removalAllowed && entries !== undefined && cliAddressable || nativePath !== null,
          },
        }];
      }).filter(item => !workspace || !['user-dsh', 'user-agents', 'bundled'].includes(item.candidate.source));
      return await read(items, partial || managedPartial, options, ownership, { partialPresets: [...partialPresets], runtimePresets: [...runtimePresets], readFailedPresets: [...readFailedPresets], managedPartial });
    } finally {
      await Promise.all(providers.map(provider => provider.dispose()));
    }
  }
  const policySummary = snapshot => ({ status: snapshot.status, revision: snapshot.revision, file: displayPath(snapshot.file),
    ...(snapshot.status === 'error' ? { issue: snapshot.issue, migrationConflicts: snapshot.migrationConflicts.map(item => ({ ...item, file: displayPath(item.file) })) } : {}) });
  const policyContextRevision = (preset, workspace, collection) => directoryRevision([collection === 'managed' ? profile.patchPath : preset.raw, workspace?.id ?? null, workspace?.path ?? null]);
  async function inspectPolicy(items, snapshot, workspace) {
    let incomplete = false;
    for (const item of items) {
      let documentRevision;
      try { documentRevision = createHash('sha256').update(await readFile(item.path)).digest('hex'); }
      catch { incomplete = true; }
      const state = policy.stateFor({ ...item.candidate, path: item.path }, snapshot);
      item.documentRevision = documentRevision;
      item.public.state = {
        file: item.path, source: item.candidate.source, shadowed: item.public.shadowed,
        inScope: !workspace || item.path.startsWith(workspace.path + sep),
        configured: true, cliAddressable: item.public.cliAddressable, memberships: item.public.memberships, canTrash: item.nativePath !== null, reason: null,
        ...state, documentRevision,
        ...(!documentRevision ? { canSetPolicy: false, policyBlocker: 'unavailable' } : {}),
      };
    }
    return incomplete;
  }
  async function browse(url, signal) {
    const workspaceId = url.searchParams.get('workspace');
    const workspace = workspaceId === null ? undefined : workspaces().find(row => row.id === workspaceId);
    if (workspaceId !== null && !workspace) return Response.json({ error: 'workspace' }, { status: 404 });
    const preset = inventoryPreset(url.searchParams.get('preset'));
    if (!preset) return Response.json({ error: 'preset' }, { status: 404 });
    return withInventory(preset, workspace, signal, async (items, partial, options, ownership, completeness) => {
      const skillId = url.searchParams.get('skill');
      if (skillId === null) {
        const choices = await creationChoices(preset, workspace);
        const snapshot = await policy.read();
        const incomplete = await inspectPolicy(items, snapshot, workspace);
        return Response.json({ items: items.map(item => item.public), ...completeness, partial: partial || incomplete, ownership, removalBatchLimit, policyBatchLimit,
          managedConfigurationRevision: policyContextRevision(preset, workspace, 'managed'),
          policy: policySummary(snapshot), configurationRevision: policyContextRevision(preset, workspace),
          creation: choices.map(choice => ({ ...choice, path: displayPath(choice.path) })) });
      }
      const item = items.find(item => item.key === skillId);
      if (!item) return Response.json({ error: 'skill' }, { status: 404 });
      if (url.searchParams.has('diff-status')) {
        if (!item.public.managed || !item.public.cliAddressable) return Response.json({ modified: false, revision: null });
        return Response.json(await managed.diffStatus({ path: workspace?.path ?? null }, item.candidate.name, signal));
      }
      if (url.searchParams.has('diff')) {
        if (!item.public.managed || !item.public.cliAddressable) return Response.json({ error: 'diff-unavailable' }, { status: 409 });
        return Response.json(await managed.reviewDiff({ path: workspace?.path ?? null }, item.candidate.name, url.searchParams.get('revision'), signal));
      }
      const result = await item.provider.get(item.candidate, options);
      if (result?.name !== item.candidate.name) return Response.json({ error: 'skill' }, { status: 404 });
      const content = await readFile(item.path, 'utf8');
      return Response.json({ content, version: skillVersion(content) });
    });
  }
  function policyExclusion(item, operation) {
    if (!item?.public.state?.canSetPolicy) return 'unavailable';
    const state = item.public.state;
    if (operation === 'enable' && !state.sourceModelInvocable && !state.sourceUserInvocable) return 'source';
    if (operation.startsWith('model-') || operation.startsWith('manual-')) {
      if (!state.policyEnabled) return 'disabled';
      const model = operation.startsWith('model-');
      if (!(model ? state.sourceModelInvocable : state.sourceUserInvocable)) return 'source';
    }
    return null;
  }
  async function changePolicy(action, input, signal) {
    const operations = ['enable', 'disable', 'model-on', 'model-off', 'manual-on', 'manual-off'];
    if (!operations.includes(input.operation) || !Array.isArray(input.skills) || !input.skills.length || input.skills.length > policyBatchLimit) throw new PolicyRejection('policy-selection');
    const ids = input.skills.map(skill => skill?.id);
    if (ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) || new Set(ids).size !== ids.length) throw new PolicyRejection('policy-selection');
    function context() {
      const preset = inventoryPreset(input.collection === 'managed' ? null : input.preset);
      const workspace = input.workspace == null ? undefined : workspaces().find(row => row.id === input.workspace);
      if (!preset || input.workspace != null && !workspace) throw new PolicyRejection('policy-conflict');
      if (input.configurationRevision !== policyContextRevision(preset, workspace, input.collection)) throw new PolicyRejection('policy-conflict');
      return { preset, workspace };
    }
    context();
    async function inspect(snapshot, commit) {
      signal?.throwIfAborted();
      if (snapshot.status !== 'ready') throw new PolicyRejection('policy-unavailable');
      if (snapshot.revision !== input.policyRevision) throw new PolicyRejection('policy-conflict');
      const { preset, workspace } = context();
      return withInventory(preset, workspace, signal, async items => {
        await inspectPolicy(items, snapshot, workspace);
        const qualified = [], excluded = [], changes = [];
        for (const [index, id] of ids.entries()) {
          const item = items.find(item => item.key === id);
          const reason = policyExclusion(item, input.operation);
          if (commit && (!item || reason || input.skills[index].revision !== item.documentRevision)) throw new PolicyRejection('policy-conflict');
          if (reason) { excluded.push({ id, name: item?.candidate.name ?? '', path: item ? displayPath(item.path) : '', reason }); continue; }
          qualified.push({ id, name: item.candidate.name, path: displayPath(item.path), revision: item.documentRevision });
          changes.push({ skill: { file: item.path, name: item.candidate.name, ...item.public.state }, action: input.operation });
        }
        return commit ? changes : { items: qualified, excluded, policyRevision: snapshot.revision, configurationRevision: policyContextRevision(preset, workspace, input.collection) };
      });
    }
    if (action === 'policy-preview') return inspect(await policy.read(), false);
    const saved = await policy.write(input.policyRevision, snapshot => inspect(snapshot, true), signal);
    return { changedIds: ids, policy: policySummary(saved) };
  }
  async function manageFiles(action, input, signal) {
    const workspace = input.workspace == null ? undefined : workspaces().find(row => row.id === input.workspace);
    const preset = inventoryPreset(input.collection === 'managed' ? null : input.preset);
    if (!preset || (input.workspace != null && !workspace)) throw new InstallRejection('destination');
    const target = { path: workspace?.path ?? null };
    if (action === 'reveal') return withInventory(preset, workspace, signal, async items => {
      if (process.platform !== 'darwin') throw new InstallRejection('reveal-unavailable');
      const item = items.find(item => item.key === input.skill);
      if (!item) throw new InstallRejection('selection');
      await new Promise((resolve, reject) => execFile('/usr/bin/open', ['-R', item.path], { timeout: 15000 }, error => error ? reject(error) : resolve()));
      return { opened: true };
    });
    if (action === 'create') {
      const choice = (await creationChoices(preset, workspace)).find(choice => choice.id === input.directory);
      if (!choice || input.revision !== choice.revision) throw new InstallRejection('creation-directory');
      return managed.create(target, choice.path, input.name, async file => {
        const current = presets().find(row => row.id === input.preset);
        if (!current) return false;
        return withInventory(current, workspace, signal, async (items, _partial, options) => {
          const item = items.find(({ candidate }) => candidate.path === file && candidate.name === input.name);
          return item !== undefined && Boolean(await item.provider.get(item.candidate, options));
        });
      }, async () => {
        signal?.throwIfAborted();
        const current = inventoryPreset(input.preset);
        const currentWorkspace = input.workspace == null ? undefined : workspaces().find(row => row.id === input.workspace);
        if (!current || (input.workspace != null && currentWorkspace?.path !== workspace?.path)) throw new InstallRejection('destination');
        const latest = (await creationChoices(current, currentWorkspace)).find(item => item.id === input.directory);
        if (!latest || latest.revision !== input.revision) throw new InstallRejection('creation-directory');
      });
    }
    if (workspace && await parentRepository(workspace.path)) throw new InstallRejection('removal-unavailable');
    if (!Array.isArray(input.skills) || input.skills.length === 0 || input.skills.length > removalBatchLimit) throw new InstallRejection('selection');
    const ids = input.skills.map(item => item?.id);
    if (ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) || new Set(ids).size !== ids.length) throw new InstallRejection('selection');
    const native = input.collection === 'native';
    const source = !native && typeof input.source === 'string' && input.source ? input.source : undefined;
    return withInventory(preset, workspace, signal, async items => {
      const excluded = [];
      const selections = ids.flatMap((id, index) => {
        const item = items.find(candidate => candidate.key === id);
        if (!item || (native ? !item.nativePath : !item.public.managedRemovable)) {
          if (action !== 'removal-preview') throw new InstallRejection('removal-unavailable');
          excluded.push({id,name:item?.candidate.name??'',path:item?displayPath(item.path):'',reason:'removal-unavailable'});
          return [];
        }
        const file = native ? item.nativePath : join(workspace?.path ?? homedir(), '.agents/skills', item.candidate.name, 'SKILL.md');
        return [{ id, name: item.candidate.name, path: displayPath(file), nativePath: item.nativePath, revision: input.skills[index].revision }];
      });
      if (!native && new Set(selections.map(item => item.name)).size !== selections.length) throw new InstallRejection('selection');
      if (action === 'removal-preview') {
        if (source) {
          const entries = await managedEntries(target.path);
          const reviewed = new Set([...selections, ...excluded].map(item => item.name));
          for (const [name, entry] of Object.entries(entries)) {
            if (entry?.source === source && !reviewed.has(name)) {
              excluded.push({ id: `source:${name}`, name, path: displayPath(join(target.path ?? homedir(), '.agents/skills', name)), reason: 'removal-unavailable' });
            }
          }
        }
        const items = [];
        for (const skill of selections) {
          try {
            const [reviewed] = native ? await managed.reviewTrash([skill]) : await managed.reviewRemoval(target, [skill], source);
            items.push(reviewed);
          } catch (error) {
            excluded.push({ id: skill.id, name: skill.name, path: skill.path,
              reason: error instanceof InstallRejection ? error.message : 'removal-unreadable' });
          }
        }
        return { items, excluded };
      }
      return native ? managed.trash(target, selections) : managed.remove(target, selections, source);
    });
  }

  async function manageUpdate(action, input, signal) {
    const workspace = input.workspace == null ? undefined : workspaces().find(row => row.id === input.workspace);
    if ((input.workspace != null && !workspace) || (workspace && await parentRepository(workspace.path))) throw new InstallRejection('destination');
    const target = { path: workspace?.path ?? null };
    if (action === 'update') return managed.update(input.token, target);
    if (typeof input.skill !== 'string' || !/^[a-f0-9]{64}$/.test(input.skill)) throw new InstallRejection('selection');
    return withInventory(inventoryPreset(null), workspace, signal, async items => {
      const item = items.find(candidate => candidate.key === input.skill);
      if (action === 'sync-preview') {
        if (!item?.public.managedSyncable) throw new InstallRejection('sync-unavailable');
        return managed.reviewSync(target, item.candidate.name);
      }
      if (!item?.public.managedUpdateable) throw new InstallRejection('update-unavailable');
      return managed.reviewUpdate(target, item.candidate.name, signal);
    });
  }

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/dsh-skills-space',
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    async fetch(request) {
      try {
        const url = new URL(request.url);
        if (request.method === 'POST') {
          const action = url.searchParams.get('action') ?? 'placement';
          if (!['placement', 'preview', 'install', 'directories', 'create', 'removal-preview', 'remove', 'reveal', 'policy-preview', 'policy', 'open-configuration', 'open-directory', 'update-preview', 'update', 'sync-preview'].includes(action) || !localWrite(request, action)) return Response.json({ error: 'forbidden' }, { status: 403 });
          const text = await request.text();
          if (text.length > (action === 'placement' ? 256 : 16384)) return Response.json({ error: 'request' }, { status: 400 });
          let input;
          try { input = JSON.parse(text); } catch { return Response.json({ error: 'request' }, { status: 400 }); }
          if (!input || typeof input !== 'object' || Array.isArray(input)) return Response.json({ error: 'request' }, { status: 400 });
          if (action === 'directories') return await updateDirectories(input);
          if (action === 'open-configuration' || action === 'open-directory') {
            if(process.platform!=='darwin')return Response.json({error:'unavailable'},{status:409});
            let path=profile.patchPath;
            if(action==='open-directory'){
              const preset=presets().find(row=>row.id===input.preset);
              const settings=preset&&await directoryEdit(preset);
              const root=settings?.roots.find(root=>root.path===input.path&&root.exists);
              if(!root)return Response.json({error:'directory-fields'},{status:409});
              path=root.path;
            }
            try{
              await access(path);
              await new Promise((resolve,reject)=>execFile('/usr/bin/open',action==='open-configuration'?['-t',path]:[path],{timeout:10000},error=>error?reject(error):resolve()));
              return Response.json({opened:true});
            }catch(error){return Response.json({error:'configuration-open',message:error instanceof Error?error.message:String(error)},{status:503});}
          }
          if (action === 'policy-preview' || action === 'policy') return Response.json(await changePolicy(action, input, request.signal));
          if (action === 'update-preview' || action === 'update' || action === 'sync-preview') return Response.json(await manageUpdate(action, input, request.signal));
          if (['create', 'removal-preview', 'remove', 'reveal'].includes(action)) return Response.json(await manageFiles(action, input, request.signal));
          if (action !== 'placement') {
            const target = await installationTarget(input);
            if (!target) return Response.json({ error: 'destination' }, { status: 409 });
            const result = action === 'preview' ? await managed.preview(input.source, target, request.signal, { includeInternal: input.includeInternal === true })
              : await managed.install(input.token, input.names, target);
            return Response.json(result);
          }
          const next = input.placement;
          if (!placements.includes(next)) return Response.json({ error: 'placement' }, { status: 400 });
          const entry = pluginEntry();
          if (!entry) return Response.json({ error: 'placement' }, { status: 409 });
          if (placement() !== next) await ctx.configEditor.edit(entry, current => ({ ...current, placement: next }));
          return Response.json({ placement: placement() });
        }
        if (url.searchParams.has('store')) return await marketplace(url.searchParams, request.signal);
        if (url.searchParams.has('inventory') || url.searchParams.has('preset')) return await browse(url, request.signal);
        if (url.searchParams.has('check-updates')) {
          const workspaceId = url.searchParams.get('workspace');
          const workspace = workspaceId == null ? undefined : workspaces().find(row => row.id === workspaceId);
          if (workspaceId != null && (!workspace || await parentRepository(workspace.path))) throw new InstallRejection('destination');
          const target = { path: workspace?.path ?? null };
          return Response.json(await withInventory(inventoryPreset(null), workspace, request.signal, async items => {
            const names = items.filter(item => item.public.managedUpdateable).map(item => item.candidate.name);
            return managed.checkUpdates(target, names, request.signal);
          }));
        }
        const editors = ctx.configEditor.configuration();
        return Response.json({
          configuration: {path:displayPath(profile.patchPath),exists:await access(profile.patchPath).then(()=>true,()=>false),canOpen:process.platform==='darwin'},
          userHome: homedir(),
          placement: placement(),
          reveal: process.platform === 'darwin',
          installGlobal: true,
          workspaces: await Promise.all(workspaces().map(async ({ id, title, path }) => ({
            id, title, path: displayPath(path), installable: await parentRepository(path).then(nested => !nested, () => false),
          }))),
          presets: await Promise.all(presets().map(async preset => ({
            id: preset.id, label: preset.label, name: preset.name, description: preset.description, directoryStatus: directoryDeclarationStatus(preset.raw.plugins), directories: preset.configs.map(config => directorySummary(config, paths, profile.home)),
            directoryEdit: await directoryEdit(preset, editors),
            directoryReadOnly: directoryReadOnly(preset, editors),
            ...installEligibility(preset),
          }))),
        });
      } catch (error) {
        if (error instanceof PolicyRejection) return Response.json({ error: error.code }, { status: error.code === 'policy-unavailable' ? 503 : 409 });
        if (error instanceof InstallRejection) return Response.json({ error: error.message }, { status: 409 });
        if (!request.signal.aborted) ctx.logger.warn('Skills Space request failed: %s', String(error));
        return Response.json({ error: 'unavailable' }, { status: 503 });
      }
    },
  }));
}
