import type { InstalledSkill, Inventory } from './upstream.ts';
export type CodexSkillState = {
  displayName?: string | null; icon?: string | null; pluginDisplayName?: string | null;
  documentPath: string; installationPath: string; origin: 'standalone' | 'plugin' | 'system' | 'admin';
  runtimeScope: string; inScope: boolean; enabled: boolean | null; allowImplicitInvocation?: boolean | null; pluginId: string | null;
  canToggle: boolean; needsConfirmation: boolean; toggleScope: 'user' | null; lifecycleOwner: 'skills-cli' | 'codex-plugin' | 'external';
};
export type CodexActionState = 'available' | 'restricted' | 'overridden' | 'notIntegrated' | 'unknown' | 'notApplicable' | 'stale';
export type CodexPluginPermissions = {install:CodexActionState;toggle:CodexActionState;uninstall:CodexActionState;checkUpdates:CodexActionState};
export type CodexPlugin = {
  toggleScope?:string;projectEnabled?:boolean|null;
  remotePluginId?:string|null;marketplaceDisplayName?:string|null;
  sourceOrigin?:string;category?:string|null;
  enabledKnown?:boolean;sourceKind?:string|null;installPolicy?:string|null;installPolicySource?:string|null;permissions?:CodexPluginPermissions;
  description?: string; author?: string | null; icon?: string | null;
  id: string; name: string; marketplace: string; version: string | null; installed: boolean; installationKnown: boolean; enabled: boolean;
  builtin?: boolean; canCheckUpdates?: boolean; catalogEntry?: boolean; remote?: boolean; gitMarketplace?: boolean; toggleReason?: string | null; uninstallReason?: string | null;
  authPolicy?: string | null; contentVerified?: boolean;
  skillInventory?: {complete:boolean;missingFromInstallation:number|null};
  components: string[]; skills: string[]; sourcePath: string; installedPath: string | null;
  canInstall: boolean; canToggle: boolean; canUninstall: boolean; unavailableReason: string | null; fingerprint: string;
};
export type CodexSnapshot = {
  contextId?: string | null;
  unavailableReason?: string | null; pluginsComplete?: boolean; catalogRequested?: boolean;
  rules: CodexRule[]; capabilities: {writeConfig: boolean; nameRules: boolean; listPlugins?: boolean; listMarketplaces?: boolean; installPlugins?: boolean; uninstallPlugins?: boolean};
  binary: string; version: string; codexHome: string; configPath: string; revision: string;
  skills: Array<{ name: string; description: string; state: CodexSkillState }>;
  plugins: CodexPlugin[]; warnings: string[];
};
export type CodexPluginAction = 'install' | 'uninstall' | 'enable' | 'disable' | 'reset';
export type CodexPending = { kind: 'skills'; skills: InstalledSkill[]; enabled: boolean; skipped: number }
  | { kind: 'plugin'; plugins: CodexPlugin[]; action: CodexPluginAction };
export function codexToggleSelection(skills: InstalledSkill[], enabled: boolean) {
  const eligible = skills.filter(skill => skill.codexState?.canToggle && skill.codexState.enabled !== null);
  const unique = [...new Map(eligible.filter(skill => skill.codexState?.enabled !== enabled).map(skill => [skill.codexState?.documentPath, skill])).values()];
  return { skills: unique, skipped: skills.length - eligible.length };
}
export function mergeCodexStates(inventory: Inventory | null, snapshot: CodexSnapshot): Inventory | null {
  if (!inventory) return inventory;
  const states = new Map(snapshot.skills.map(skill => [skill.state.documentPath, skill.state]));
  return { ...inventory, codex: snapshot, skills: inventory.skills.map(skill => {
    if (!skill.codexState) return skill;
    const state = states.get(skill.codexState.documentPath);
    return { ...skill, codexState: state ? { ...state, installationPath: skill.path, inScope: skill.codexState.inScope, lifecycleOwner: skill.codexState.lifecycleOwner }
      : { ...skill.codexState, enabled: null, canToggle: false } };
  }) };
}
export function codexOrigin(state: CodexSkillState, zh: boolean): string {
  if (state.pluginId) return state.pluginDisplayName || state.pluginId;
  if (state.origin === 'system') return zh ? 'Codex 内置' : 'Codex built-in';
  if (state.origin === 'admin') return zh ? '管理员技能' : 'Administrator skill';
  return zh ? '本地目录' : 'Local directory';
}

export function codexPluginActionAllowed(plugin: CodexPlugin, action: CodexPluginAction): boolean {
  if (action === 'reset') return plugin.canToggle&&plugin.toggleScope==='project'&&plugin.projectEnabled!=null;
  if (action === 'install') return plugin.canInstall;
  if (action === 'uninstall') return plugin.canUninstall;
  return plugin.canToggle;
}
export function remainingCodexPlugins(pending: CodexPlugin[], completed: number, actual: CodexSnapshot) {
  // Missing inventory is unknown, never proof that an operation completed.
  return pending.slice(completed).map(previous => actual.plugins.find(plugin => plugin.id === previous.id) ?? previous);
}

export type CodexRule = { path?: string; name?: string; enabled?: boolean; [key: string]: unknown };
export function canManageCodexPlugin(plugin: CodexPlugin): boolean {
  return plugin.canInstall || plugin.canToggle || plugin.canUninstall || plugin.canCheckUpdates === true;
}
export function codexPluginStateLabel(plugin:CodexPlugin,zh:boolean):string {
  if(!plugin.installationKnown||plugin.enabledKnown===false||plugin.unavailableReason==='stale')return zh?'待确认':'Unconfirmed';
  return plugin.enabled?(zh?'已启用':'Enabled'):(zh?'已停用':'Disabled');
}
export function codexPluginManagementNote(plugin:CodexPlugin,zh:boolean):string|null {
  const reason=plugin.toggleReason;
  if(plugin.remote && plugin.canToggle)return null;
  if(reason==='disabled_by_admin')return zh?'管理员已关闭此插件。':'An administrator has disabled this plugin.';
  if(reason==='projectOverride')return zh?'当前项目覆盖了用户设置；请在项目配置中调整。':'This project overrides the user setting. Change its project configuration.';
  if(reason==='untrustedProject')return zh?'当前项目未被 Codex 信任，项目配置不会生效。':'Codex does not trust this project, so project configuration is inactive.';
  if(reason==='managedOverride')return zh?'更高优先级配置已指定此插件状态。':'A higher-priority configuration controls this plugin.';
  if(reason==='projectReadOnly')return zh?'当前项目配置为只读。':'The project configuration is read-only.';
  if(reason==='projectPath'||reason==='projectUnknown')return zh?'当前项目配置路径无法确认。':'The current project configuration path could not be confirmed.';
  if(reason==='userReadOnly')return zh?'用户配置不可写，请检查文件访问权限。':'User settings are read-only. Check file access permissions.';
  if(reason==='policy')return zh?'当前策略不允许启用此插件。':'The current policy does not allow this plugin to be enabled.';
  return null;
}
export function visibleCodexPlugins(plugins: CodexPlugin[], query: string) {
  const search = query.trim().toLowerCase();
  return plugins.filter(plugin => !codexAppManagedPlugin(plugin) && `${plugin.id} ${plugin.name}`.toLowerCase().includes(search));
}
export function codexRuleEditable(rule: CodexRule, snapshot: CodexSnapshot): boolean {
  const path = typeof rule.path === 'string', name = typeof rule.name === 'string';
  if (path === name || typeof rule.enabled !== 'boolean') return false;
  return !snapshot.skills.some(skill => (path ? skill.state.documentPath === rule.path : skill.name === rule.name?.trim()) && (skill.state.runtimeScope==='admin' || skill.state.origin==='admin'));
}
export function codexRuleError(rule: CodexRule, zh: boolean): string | null {
  if (typeof rule.enabled !== 'boolean' || (typeof rule.path === 'string') === (typeof rule.name === 'string')) return zh ? '请选择名称或路径，并设置启用状态。' : 'Choose a name or path and an enabled state.';
  if (rule.name !== undefined && !rule.name.trim()) return zh ? '请输入技能名称。' : 'Enter a skill name.';
  if (rule.path !== undefined && !/^(\/|[A-Za-z]:[\\/]).*[\\/]SKILL\.md$/.test(rule.path)) return zh ? '请选择 SKILL.md 的完整路径。' : 'Enter the absolute path to SKILL.md.';
  return null;
}
export function withoutCodexPathRules(rules: CodexRule[], path: string): CodexRule[] {
  return rules.filter(rule => rule.path !== path || rule.name !== undefined);
}


export function unavailableCodexSnapshot(previous: CodexSnapshot, reason = 'unavailable'): CodexSnapshot {
  return {...previous, unavailableReason:reason,pluginsComplete:false,
    capabilities:{writeConfig:false,nameRules:false,listPlugins:false,listMarketplaces:false,installPlugins:false,uninstallPlugins:false},
    plugins:previous.plugins.map(plugin=>({...plugin,canToggle:false,canInstall:false,canUninstall:false,canCheckUpdates:false,permissions:{install:'stale',toggle:'stale',uninstall:'stale',checkUpdates:'stale'},unavailableReason:'stale'})),
    skills:previous.skills.map(skill=>({...skill,state:{...skill.state,enabled:null,canToggle:false}})),
  };
}
export function sameCodexContext(previous: CodexSnapshot, incoming: CodexSnapshot): boolean {
  return Boolean(previous.contextId && incoming.contextId && previous.contextId === incoming.contextId)
    && previous.binary === incoming.binary && previous.version === incoming.version
    && previous.codexHome === incoming.codexHome && previous.configPath === incoming.configPath;
}
export function reconcileCodexSnapshot(previous: CodexSnapshot|null, incoming: CodexSnapshot): CodexSnapshot {
  if (!previous || !sameCodexContext(previous, incoming)) return incoming;
  // Remote installation belongs to the current native response. Public account
  // metadata alone cannot prove workspace identity, so never replay remote rows.
  const localPrevious = {...previous, plugins: previous.plugins.filter(plugin => !plugin.remote && !plugin.catalogEntry)};
  if (incoming.unavailableReason) return {...unavailableCodexSnapshot(localPrevious, incoming.unavailableReason), warnings: incoming.warnings};
  if (incoming.pluginsComplete === false && incoming.catalogRequested !== false) {
    const retained = localPrevious.plugins.filter(plugin => !incoming.plugins.some(current => current.id === plugin.id));
    return {...incoming, plugins: [...incoming.plugins, ...retained.map<CodexPlugin>(plugin => ({...plugin, canToggle:false, canInstall:false, canUninstall:false, canCheckUpdates:false, permissions:{install:'stale',toggle:'stale',uninstall:'stale',checkUpdates:'stale'}, unavailableReason:'stale'}))]};
  }
  return incoming;
}
export function codexAvailabilityMessage(snapshot: CodexSnapshot|null, zh: boolean): string | null {
  if(snapshot?.unavailableReason==='cliMissing')return zh?'未找到可用的 Codex 运行程序，请检查 Codex 安装。':'No usable Codex runtime was found. Check the Codex installation.';
  if(snapshot?.unavailableReason)return zh?'Codex 状态读取失败。保留上次读取的内容，相关操作暂停，请刷新后重试。':'Codex state could not be read. Previously read items are retained and their actions are paused. Refresh and retry.';
  return null;
}
export function codexPluginAuthMessage(plugin: CodexPlugin, zh: boolean): string | null {
  if(plugin.installed || plugin.authPolicy!=='ON_INSTALL' || !plugin.components.some(component=>component==='mcpServers'||component==='apps'))return null;
  return zh?'安装后可能需要连接服务账号。':'Connecting a service account may be required after installation.';
}
// Reconcile only native Codex records. Other Agents and newly read physical records remain authoritative.
export function reconcileCodexInventory(previous: Inventory|null, incoming: Inventory): Inventory {
  if(!incoming.codex)return incoming;
  const snapshot=reconcileCodexSnapshot(previous?.codex??null,incoming.codex);
  if(!snapshot.unavailableReason || !previous?.codex || !sameCodexContext(previous.codex, incoming.codex))return {...incoming,codex:snapshot};
  const retained=(previous?.skills??[]).filter(skill=>skill.codexState?.lifecycleOwner !== 'skills-cli' && skill.codexState && skill.agents.length === 1 && skill.agents[0] === 'codex' && !incoming.skills.some(current=>current.path===skill.path));
  return mergeCodexStates({...incoming,skills:[...incoming.skills,...retained]},snapshot) ?? incoming;
}

export function filterCodexSkills(skills: InstalledSkill[], source: string, status: string) {
  return skills.filter(skill => (source === 'all' || (source === 'local' ? skill.codexState?.origin === 'standalone' : source === 'builtin' ? skill.codexState?.origin === 'system' : source === 'admin' ? skill.codexState?.origin === 'admin' : skill.codexState?.pluginId === source))
    && (status === 'all' || (status === 'unloaded' ? skill.codexState?.runtimeScope === 'unloaded' : status === 'unknown' ? skill.codexState?.enabled == null : skill.codexState?.enabled === (status === 'enabled'))));
}
export function installedCodexPluginCount(plugins: CodexPlugin[]): number {
  return new Set(plugins.filter(plugin => !codexAppManagedPlugin(plugin) && plugin.installed && plugin.installationKnown).map(plugin => plugin.id)).size;
}
export function filterCodexPluginCollection(plugins: CodexPlugin[], collection: string, status: string): CodexPlugin[] {
  return plugins.filter(plugin => !codexAppManagedPlugin(plugin) && plugin.installationKnown && (collection === 'available' ? !plugin.installed && (plugin.canInstall || plugin.installPolicy==='AVAILABLE' || plugin.installPolicy==='INSTALLED_BY_DEFAULT') : collection === 'all' ? plugin.installed || plugin.canInstall || plugin.installPolicy==='AVAILABLE' || plugin.installPolicy==='INSTALLED_BY_DEFAULT' : plugin.installed && plugin.installationKnown)
    && (status === 'all' || (status === 'unknown' ? !plugin.installationKnown : plugin.installationKnown && plugin.installed && plugin.enabledKnown!==false && plugin.unavailableReason!=='stale' && plugin.enabled === (status === 'enabled'))));
}
export function codexSkillToggleHint(state: CodexSkillState, plugins: CodexPlugin[], zh: boolean): string {
  if (state.pluginId && plugins.some(plugin => plugin.id === state.pluginId && plugin.installed && !plugin.enabled)) return zh ? '所属插件已停用；此开关保留技能自身的启停设置。' : 'The plugin is disabled; this switch keeps the skill’s own setting.';
  if (state.canToggle) return state.enabled ? (zh ? '已启用' : 'Enabled') : (zh ? '已停用' : 'Disabled');
  if (state.enabled === null) return zh ? '技能状态读取失败，请刷新重试。' : 'Could not read skill state. Refresh to retry.';
  return '';
}

export function codexSkillDisplayName(skill: InstalledSkill): string {
  return skill.codexState?.displayName || (skill.codexState?.pluginId ? skill.name.slice(skill.name.indexOf(':') + 1) : skill.name);
}

export type CodexPluginCheck = {
  pluginId: string; revision: string; installedVersion: string | null; candidateVersion: string | null;
  candidateComponents: string[]; candidateSkillCount: number;
  unmappedRules: string[]; affectedRules: unknown[]; installedPath: string | null;
  currentContentFingerprint: string | null; candidateContentFingerprint: string | null; baselineContentFingerprint: string | null;
  sourcePath: string; status: string; reason: string | null; localState: string; canUpdate: boolean; recovery: boolean;
};
export function codexCheckLabel(check: CodexPluginCheck | undefined, zh: boolean): string {
  const labels: Record<string, [string,string]> = {
    current:['已是最新内容','Content is up to date'], versionChanged:['来源版本不同','Source version differs'],
    contentChanged:['内容变化，版本未变','Content changed without a version change'], removed:['来源已移除','Source removed'],
    unavailable:['无法检查此来源','Cannot check this source'], recovery:['配置恢复未完成','Configuration recovery unfinished'],
  };
  return check ? (labels[check.status] ?? ['检查未完成','Check incomplete'])[zh ? 0 : 1] : (zh ? '尚未检查' : 'Not checked');
}

export function codexPluginRestriction(reason: string | null | undefined, zh: boolean): string | null {
  if(reason==='plan_not_eligible')return zh?'当前套餐不支持此插件。':'This plugin is not included in the current plan.';
  if(reason==='disabled_by_admin')return zh?'管理员已关闭此插件。':'An administrator has disabled this plugin.';
  if(reason==='required_app_unavailable')return zh?'所需应用当前不可用。':'A required app is currently unavailable.';

  const labels: Record<string,[string,string]> = {
    remoteToggle: ['请在 Codex 的插件页调整启停设置。','Change enabled state from the Plugins page in Codex.'],
    projectOverride: ['当前项目覆盖了用户设置。','This project overrides the user setting.'],
    userReadOnly: ['用户配置不可写，请检查访问权限。','User settings are read-only. Check access permissions.'],
    unknownPolicy: ['尚未确认此操作的权限，请刷新后重试。','Permission for this action is not confirmed. Refresh and retry.'],
    notIntegrated: ['请在 Codex 中完成此操作。','Complete this action in Codex.'],
    defaultInstall: ['此组件由默认安装策略提供，不支持单独卸载。','This component is provided by a default installation policy and cannot be uninstalled separately.'],
    stale: ['读取未完成，刷新成功后再操作。','Reading is incomplete. Refresh before making changes.'],
    policy: ['此操作受配置或管理员策略限制。','Configuration or administrator policy restricts this action.'],
    interface: ['当前接入的 Codex 接口不支持此操作。','The connected Codex interface does not support this action.'],
    source: ['尚未接入此操作所需的原生接口。','The native interface required for this action is not connected.'],
    unconfirmed: ['仅发现配置记录，尚未确认是否安装；请刷新。','Only a configuration record was found. Refresh to confirm installation.'],
  };
  return reason ? (labels[reason]?.[zh?0:1] ?? null) : null;
}
export function codexPluginCheckLabel(plugin: CodexPlugin, check: CodexPluginCheck | undefined, zh: boolean): string | null {
  if(!plugin.installed)return null;
  if(!plugin.canCheckUpdates)return null;
  return codexCheckLabel(check,zh);
}

export type CodexSkillSourceOption={value:string;label:string;pluginId?:string;icon?:string|null};
export function codexSkillSourceOptions(skills:InstalledSkill[],zh:boolean,catalog:CodexPlugin[]=[]):CodexSkillSourceOption[] {
  const byId=new Map(catalog.map(plugin=>[plugin.id,plugin]));
  const plugins=new Map<string,string>();
  for(const skill of skills){const state=skill.codexState;if(state?.pluginId)plugins.set(state.pluginId,state.pluginDisplayName||state.pluginId);}
  return [{value:'all',label:zh?'全部来源':'All sources'}, {value:'local',label:zh?'本地目录':'Local directories'}, {value:'builtin',label:zh?'内置技能':'Built-in skills'},
    ...(skills.some(skill=>skill.codexState?.origin==='admin')?[{value:'admin',label:zh?'管理员技能':'Administrator skills'}]:[]),
    ...[...plugins].map(([value,name])=>({value,label:byId.get(value)?.name||name,pluginId:value,icon:byId.get(value)?.icon??null}))];
}

export type CodexPluginDetails = {
  description: string; category: string | null; website: string | null;
  capabilities: string[]; examples: string[];
  skills: Array<{name: string; displayName: string; description: string; path: string; icon: string | null}>;
};
export function codexPluginSkills(plugin: CodexPlugin, snapshot: CodexSnapshot | null, details: CodexPluginDetails | null): InstalledSkill[] {
  const native = (snapshot?.skills ?? []).filter(skill=>skill.state.pluginId===plugin.id);
  const result: InstalledSkill[] = native.map(skill=>({name:skill.name,path:skill.state.installationPath,description:skill.description,agents:['codex'],source:null,sourceUrl:null,cliManaged:false,codexState:skill.state}));
  const relativeDocument=(path:string)=>{
    for(const root of [plugin.installedPath,plugin.sourcePath]){
      const prefix=root?.replace(/[\\/]+$/,'');
      if(prefix&&path.startsWith(`${prefix}/`))return path.slice(prefix.length+1);
    }
    return path;
  };
  for(const skill of details?.skills??[]) {
    const documentPath=`${skill.path}/SKILL.md`;
    if(result.some(item=>item.path===skill.path||relativeDocument(item.codexState?.documentPath??`${item.path}/SKILL.md`)===relativeDocument(documentPath)))continue;
    result.push({name:`${plugin.id.split('@')[0]}:${skill.name}`,path:skill.path,description:skill.description,agents:['codex'],source:null,sourceUrl:null,cliManaged:false,codexState:{displayName:skill.displayName,icon:skill.icon,pluginDisplayName:plugin.name,documentPath,installationPath:skill.path,origin:'plugin',runtimeScope:'unloaded',inScope:false,enabled:null,pluginId:plugin.id,canToggle:false,needsConfirmation:false,toggleScope:null,lifecycleOwner:'codex-plugin'}});
  }
  return result;
}

export function codexPluginSkillDisplay(plugin:CodexPlugin, count:number, loaded:boolean, loading:boolean, error:boolean) {
  const known=loaded || plugin.skillInventory?.complete===true;
  return {
    show: count>0 || (!error && (!known || loading)),
    count: count>0 && (loaded || !loading) ? count : null,
    state: error?'error':loading?'loading':known&&count===0?'empty':!loaded?'unread':'ready',
  };
}

// Provider identity comes from native canonical market inspection, not its name.
export function codexPluginSourceKey(plugin:CodexPlugin):string {
  if(plugin.remote || plugin.sourceOrigin==='account')return 'account';
  if(plugin.sourceOrigin==='app'||plugin.sourceOrigin==='runtime')return plugin.sourceOrigin;
  return `market:${plugin.marketplace}`;
}
export function codexPluginSources(plugins:CodexPlugin[],zh:boolean) {
  const options=new Map<string,string>();
  for(const plugin of plugins){
    if(codexAppManagedPlugin(plugin))continue;
    const key=codexPluginSourceKey(plugin);
    options.set(key,key==='app'?(zh?'应用内置':'App built-in'):key==='runtime'?(zh?'运行环境':'Runtime'):key==='account'?(zh?'官方插件':'Official plugins'):plugin.marketplaceDisplayName||plugin.marketplace);
  }
  const rank=(key:string)=>key==='app'?0:key==='runtime'?1:key==='account'?2:3;
  return [{value:'all',label:zh?'全部来源':'All sources'},...[...options].sort(([a],[b])=>rank(a)-rank(b)||a.localeCompare(b)).map(([value,label])=>({value,label}))];
}
export type CodexDirectorySection={id:string;title:string;urlSlug:string|null;kind:'public'|'market'|'created';plugins:CodexPlugin[]};
export type CodexDirectory = {snapshot:CodexSnapshot;publicSections:CodexDirectorySection[];personalSections:CodexDirectorySection[];accountRequired:boolean;publicError:string|null;personalError:string|null};
export type CodexDirectoryResponse = Omit<CodexDirectory,'snapshot'> & {snapshot:CodexSnapshot|null};
export function codexDirectoryWithSnapshot(value:CodexDirectoryResponse,snapshot:CodexSnapshot):CodexDirectory {
  const markets=new Map<string,CodexDirectorySection>();
  for(const plugin of snapshot.plugins.filter(plugin=>!plugin.remote&&!plugin.builtin&&plugin.installationKnown)){
    let section=markets.get(plugin.marketplace);
    if(!section){section={id:`market:${plugin.marketplace}`,title:plugin.marketplaceDisplayName||plugin.marketplace,urlSlug:null,kind:'market',plugins:[]};markets.set(plugin.marketplace,section);}
    section.plugins.push(plugin);
  }
  const join=(section:CodexDirectorySection)=>({...section,plugins:codexDirectoryPagePlugins(section.plugins,snapshot)});
  return {...value,snapshot,publicSections:value.publicSections.map(join),personalSections:[...value.personalSections.filter(section=>section.kind!=='market').map(join),...[...markets.values()].sort((a,b)=>a.id.localeCompare(b.id))]};
}
export type CodexDirectoryPage={title:string|null;description:string|null;plugins:CodexPlugin[];nextPageToken:string|null};
export function filterCodexPluginPage(plugins:CodexPlugin[],browse:boolean,source:string,status:string,category='all') {
  return filterCodexPluginCollection(plugins,browse?'available':'installed',browse?'all':status)
    .filter(plugin=>(source==='all'||codexPluginSourceKey(plugin)===source)&&(category==='all'||plugin.category===category));
}

// Directory searches reuse the installed snapshot for presentation only. Native
// detail preparation and mutation commands independently verify live authority.
export function codexDirectoryPagePlugins(plugins:CodexPlugin[],snapshot:CodexSnapshot|null):CodexPlugin[]{
  const installed=new Map(snapshot?.plugins.filter(plugin=>plugin.remotePluginId&&plugin.installed&&plugin.installationKnown).map(plugin=>[plugin.remotePluginId,plugin]));
  return plugins.map(plugin=>{const current=installed.get(plugin.remotePluginId);return current?{...current,name:plugin.name,description:plugin.description,icon:plugin.icon??current.icon}:plugin;});
}

export function codexAppManagedPlugin(plugin:CodexPlugin):boolean {
  return !!plugin.builtin&&plugin.marketplace==='openai-bundled'&&['codex-app-tools@openai-bundled','unified-computer-use@openai-bundled'].includes(plugin.id);
}
