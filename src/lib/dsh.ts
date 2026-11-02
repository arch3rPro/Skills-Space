import { isNativeSkillForAgent, type InstalledSkill, type Inventory, type Target } from './upstream.ts';
export type DshMembership={configurationPath:string|null;presetKey:string|null;preset:string|null;contextKey:string|null;shadowed?:boolean};
export type DshPolicyInfo={status:'unavailable'|'not-installed'|'needs-setup'|'pending'|'active'|'error';issue:string|null;running?:boolean;problemPath?:string|null;pendingReason?:'reload'|'apply';configuration:string|null;policyFile:string;revision:string|null;canInstall:boolean;canSave:boolean;providerCount:number;migrationConflicts?:{file:string;name:string}[];configurations?:(DshPolicyInfo&{path:string;profile:string})[]};
export type DshSkillState = {
  memberships?:DshMembership[];
  inScope?:boolean;declaredPath?:string|null;file:string;source:string;modelInvocable:boolean;userInvocable:boolean;
  shadowed:boolean;cliAddressable:boolean;configured:boolean;reason:string|null;
  canSetInvocation?:boolean;canTrash?:boolean;documentRevision?:string;
  policyBlocker?:string|null;canSetPolicy?:boolean;policyEnabled?:boolean;policyModelInvocable?:boolean;policyUserInvocable?:boolean;sourceModelInvocable?:boolean;sourceUserInvocable?:boolean;
};
export type DshExtraSettings = {dshHome:string;agentsHome:string;watchUsePolling:boolean;watchStabilityThresholdMs:number;watchPollIntervalMs:number;watchMaxProjects:number;watchFollowSymlinks:boolean};
export const dshExtraDefaults:DshExtraSettings={dshHome:'',agentsHome:'',watchUsePolling:false,watchStabilityThresholdMs:200,watchPollIntervalMs:100,watchMaxProjects:128,watchFollowSymlinks:true};
export function dshExtraSettings(row?:DshConfiguration):DshExtraSettings{return {dshHome:row?.dshHome??'',agentsHome:row?.agentsHome??'',watchUsePolling:row?.watchUsePolling??false,watchStabilityThresholdMs:row?.watchStabilityThresholdMs??200,watchPollIntervalMs:row?.watchPollIntervalMs??100,watchMaxProjects:row?.watchMaxProjects??128,watchFollowSymlinks:row?.watchFollowSymlinks??true};}
export type DshConfiguration = {
  presetKey?:string;
  presetName?:string|null;presetDescription?:string|null;
  installation?:'desktop'|'cli';runtimeVersion?:string|null;parentPreset?:boolean;parentChanges?:string[];key:string;path:string;openPath?:string;openExists?:boolean;profile:string;preset:string|null;provider:string;
  readOnlyFields?:string[];entryId?:string|null;unresolvedFields?:string[];source?:string;inherited?:Record<string,string|string[]|boolean|number|null>;resolved?:boolean;patchExists?:boolean;hasOverride?:boolean;canRestore?:boolean;canRestoreDirectories?:boolean;materializesInheritance?:boolean;bundledSkillDir?:string|null;watchUsePolling?:boolean;watchStabilityThresholdMs?:number;watchPollIntervalMs?:number;watchMaxProjects?:number;watchFollowSymlinks?:boolean;
  disabled:boolean|null;includeDefaultRoots:boolean|null;agentsHome:string|null;dshHome:string|null;
  customSkillDirs:string[];watch:boolean|null;dynamic:boolean;editable:boolean;readOnlyReason:string|null;
};
export type DshSnapshot = {
  dshHome:string;sharedHome:string;projectRoot:string|null;canonicalRoot:string;
  roots:{path:string;source:string;rank:number;contextKey:string|null;verified:boolean;inScope:boolean;exists:boolean;canCreate?:boolean;memberships?:DshMembership[]}[];
  profiles:string[];configurations:DshConfiguration[];
  configurationFiles?:DshConfigurationFile[];configurationPath?:string|null;
  presets?:DshPreset[];presetKey?:string|null;
  skills:(DshSkillState&{path:string;name:string;description:string;inScope:boolean})[];
  warnings:string[];installIssue:string|null;contextIssue:string|null;contextKey:string|null;
  runtimeVersion:string|null;writableVersion:boolean;revision:string;runtimeVerified:false;
  aggregate?:boolean;
  policy?:DshPolicyInfo;
};
export type DshConfigurationFile={path:string;profile:string;installation?:'desktop'|'cli';exists:boolean};
export type DshPreset={key:string;path:string;profile:string;installation?:'desktop'|'cli';preset:string;presetName?:string;presetDescription?:string;order?:number;configurationKeys:string[];directoryStatus:'available'|'none'|'unknown';disabled:boolean|null};
export function dshNativePresetChoices(presets:DshPreset[]):DshPreset[]{return presets.filter(preset=>preset.directoryStatus!=='none');}
export function dshProfileLabel(profile:string):string{return profile==='web'?'Web':profile==='desktop'?'Desktop':profile;}
export type DshPresetConfiguration=DshConfiguration&{preset:string};
export function dshPresetConfigurations(rows:DshConfiguration[]):DshPresetConfiguration[]{return rows.filter((row):row is DshPresetConfiguration=>typeof row.preset==='string'&&row.preset.trim().length>0);}
export type DshEditorHandle={requestLeave:(action:()=>void)=>void};
// Persist DSH selection intents in order; a failed write must not block the next selection.
export function createDshContextWriter(write:(contexts:Record<string,string|null>)=>Promise<void>){
  let pending=Promise.resolve();
  return (contexts:Record<string,string|null>)=>{
    const next=pending.then(()=>write(contexts));
    pending=next.catch(()=>{});
    return next;
  };
}
// File targets preserve an empty configuration without inventing an Agent preset.
export function dshFileContextKey(path:string):string{return `file:${path}`;}
export function dshNativeContext(snapshot:DshSnapshot){
  const preset=snapshot.presets?.find(item=>item.key===snapshot.presetKey||item.key===snapshot.contextKey||item.configurationKeys.includes(snapshot.contextKey??''));
  const configuration=snapshot.configurations.find(item=>item.key===snapshot.contextKey);
  const path=snapshot.configurationPath??preset?.path??configuration?.path??'';
  return {preset,configuration,path};
}
export function dshSelectFileContext(snapshot:DshSnapshot,path:string,presets:DshPreset[]=snapshot.presets??[]):string{
  const current=dshNativeContext(snapshot);
  const preset=dshSelectPreset(presets,current.preset,path);
  return preset?dshPresetContextKey(preset,snapshot.configurations,current.configuration):dshFileContextKey(path);
}
export function dshSelectPreset(presets:DshPreset[],current:DshPreset|undefined,path:string):DshPreset|undefined{
  const candidates=presets.filter(preset=>preset.path===path);
  return candidates.find(preset=>preset.preset===current?.preset)??candidates.find(preset=>preset.disabled===false)??candidates[0];
}
export function dshPresetContextKey(preset:DshPreset,configurations:DshConfiguration[],current?:DshConfiguration):string{
  return dshSelectConfiguration(configurations.filter(row=>preset.configurationKeys.includes(row.key)),current,preset.path,preset.preset)?.key??preset.key;
}
export function dshSelectConfiguration(rows:DshConfiguration[],current:DshConfiguration|undefined,path:string,preset?:string|null):DshPresetConfiguration|undefined{
  const fileRows=dshPresetConfigurations(rows).filter(row=>row.path===path);
  const presetRows=fileRows.filter(row=>row.preset===(preset===undefined?current?.preset:preset));
  if(!presetRows.length)return preset===undefined?fileRows.find(row=>row.disabled===false)??fileRows[0]:undefined;
  const candidates=presetRows;
  return candidates.find(row=>row.provider===current?.provider&&row.entryId===current?.entryId)
    ??candidates.find(row=>row.provider===current?.provider&&row.disabled===false)
    ??candidates.find(row=>row.disabled===false)
    ??candidates[0];
}
// Named custom presets own their display copy, even for a shipped preset id.
export function dshPresetText(row:Pick<DshPresetConfiguration,'preset'|'presetName'|'presetDescription'>,zh:boolean):{name:string;description:string|null}{
  const description=row.presetDescription?.trim()?row.presetDescription:null;
  if(row.presetName?.trim())return {name:row.presetName,description};
  const builtins:Record<string,[string,string,string,string]>={
    standard:['标准模式','Standard','处理代码、文件和资料，适合大多数任务。','Work with code, files and research for everyday tasks.'],
    ptc:['PTC 模式','PTC','批量调用工具，并筛选、整理或汇总结果。','Run tools in batches and filter, organize or summarize their results.'],
    minimal:['极简模式','Minimal','使用终端和图片读取工具，适合测试和对比基础表现。','Use terminal and image-reading tools to test baseline behavior.'],
    cordis:['创造模式','Creator','用对话定制 DSH，编写插件或创建自己的模式。','Customize DSH through conversation, plugins and new modes.'],
  };
  const text=Object.prototype.hasOwnProperty.call(builtins,row.preset)?builtins[row.preset]:undefined;
  return text?{name:text[zh?0:1],description:text[zh?2:3]}:{name:row.preset,description};
}
export function dshSkillsPath(home:string):string{return home.replace(/[\\/]$/,'')+(home.includes('\\')?'\\':'/')+'skills';}
export function dshHomeFromSkillsPath(path:string):string|null{
  const clean=path.trim().replace(/[\\/]$/,'');
  if(!/[\\/]skills$/.test(clean))return null;
  const parent=clean.replace(/[\\/]skills$/,'');
  return /^[a-zA-Z]:$/.test(parent)?parent+clean.charAt(2):parent||(clean.startsWith('\\')?'\\':'/');
}
export function dshScopeKey(target:Target):string{return target.scope==='global'?'global':`project:${target.projectPath}`;}
export function dshSkillDirectories(snapshot:DshSnapshot|null|undefined):DshSnapshot['roots']{return snapshot?.roots.filter(root=>root.inScope)??[];}
export function dshDirectoryStatus(snapshot:DshSnapshot|null|undefined,zh:boolean):string{
  if(!snapshot)return zh?'未能读取技能目录':'Could not read skill directories';
  if(snapshot.contextIssue)return zh?'技能目录配置已变化':'Skill directory configuration changed';
  const row=snapshot.configurations.find(item=>item.key===snapshot.contextKey);
  const preset=snapshot.presets?.find(item=>item.key===snapshot.presetKey||item.key===snapshot.contextKey);
  if(!row&&preset)return preset.directoryStatus==='none'?(zh?'此预设未配置技能目录':'This preset has no skill directories'):(zh?'无法读取此预设的技能目录':'Could not read this preset’s skill directories');
  if(!row&&snapshot.profiles.length)return snapshot.configurations.length?(zh?'请选择要管理的配置':'Choose a configuration to manage'):(zh?'无法读取技能目录配置':'Could not read skill directory configuration');
  const providers=preset?snapshot.configurations.filter(item=>preset.configurationKeys.includes(item.key)):row?[row]:[];
  const active=providers.filter(item=>item.disabled===false);
  if(providers.some(item=>item.disabled===null))return zh?'无法确定技能目录配置是否启用':'The skill directory configuration state is unknown';
  if(providers.length&&!active.length)return zh?'技能目录配置已停用':'Skill directory configurations are disabled';
  if(active.some(item=>['includeDefaultRoots','customSkillDirs','dshHome','agentsHome','bundledSkillDir'].some(key=>item.unresolvedFields?.includes(key))||item.resolved===false||['incomplete-bundles','relative-path'].includes(item.readOnlyReason??'')))return zh?'无法确定技能目录':'Cannot determine skill directories';
  return zh?'未启用技能目录':'No skill directories enabled';
}
export function dshCreationUnavailableReason(snapshot:DshSnapshot|null|undefined,zh:boolean):string|null{
  if(dshSkillDirectories(snapshot).some(root=>root.canCreate===true))return null;
  if(!snapshot||snapshot.contextIssue)return zh?'无法读取当前技能配置，请刷新列表。':'Could not read the skill configuration. Refresh the list.';
  const row=snapshot.configurations.find(item=>item.key===snapshot.contextKey);
  const preset=snapshot.presets?.find(item=>item.key===snapshot.presetKey||item.key===snapshot.contextKey);
  if(!row&&preset)return preset.directoryStatus==='none'?(zh?'此预设未配置技能目录，无法创建技能。':'This preset has no skill directories for creating skills.'):(zh?'无法读取此预设的技能目录，不能创建技能。':'Skill directories could not be read for this preset; creation is unavailable.');
  if(row?.disabled===true)return zh?'技能提供器已停用，请在 DSH 中启用或选择其他配置。':'The skill provider is disabled. Enable it in DSH or choose another configuration.';
  if(!row&&snapshot.profiles.length)return zh?'请先选择可读取的技能配置。':'Choose a readable skill configuration first.';
  if(row&&(row.disabled===null||row.resolved===false||['includeDefaultRoots','customSkillDirs','dshHome','agentsHome','bundledSkillDir'].some(key=>row.unresolvedFields?.includes(key))||row.readOnlyReason==='relative-path'))return zh?'当前配置无法确定技能目录，不能创建技能。':'Skill directories cannot be determined from this configuration; creation is unavailable.';
  const roots=dshSkillDirectories(snapshot);
  if(roots.length&&roots.every(root=>['user-agents','project-agents','configured-agents','bundled'].includes(root.source)))return zh?'共享和打包目录不支持独立创建，请添加独立技能目录。':'Shared and packaged directories do not support independent creation. Add an independent skill directory.';
  return roots.length?(zh?'当前目录不支持独立创建，请在目录设置中添加独立技能目录。':'These directories do not support independent creation. Add an independent directory in skill settings.'):(zh?'未启用技能目录，请在目录设置中启用默认目录或添加目录。':'No skill directories are enabled. Enable default directories or add a directory in skill settings.');
}
export type DshRemoval={contextKey?:string|null;target:Target;file:string;path:string;name:string;revision:string;dependencies:string};
export type DshInvocation='both'|'manual'|'model'|'none';
export const dshInvocationChannels=[{value:'model',zh:'自动选择',en:'Automatic selection'},{value:'manual',zh:'手动调用',en:'Manual invocation'}] as const;
export const dshInvocationOptions=[{value:'both',zh:'模型与手动调用',en:'Model and manual invocation'},{value:'manual',zh:'仅手动调用',en:'Manual invocation only'},{value:'model',zh:'仅模型调用',en:'Model invocation only'},{value:'none',zh:'禁止调用',en:'No invocation'}] as const;
export function invocationPolicy(value:DshInvocation){return {modelInvocable:value==='both'||value==='model',userInvocable:value==='both'||value==='manual'};}
export function dshInvocation(state:DshSkillState):DshInvocation{return state.modelInvocable?state.userInvocable?'both':'model':state.userInvocable?'manual':'none';}
export function canChangeDsh(skill:InstalledSkill,action:'invocation'|'trash'):boolean{return action==='invocation'?!!skill.dshState?.canSetPolicy:isNativeSkillForAgent(skill,'deepseek-harness')&&!!skill.dshState?.canTrash&&!skill.cliManaged&&!skill.shared&&skill.agents.every(id=>id==='deepseek-harness');}
export type DshPolicyAction=DshInvocation|'enable'|'disable'|'model-on'|'model-off'|'manual-on'|'manual-off';
// Discovery membership is independent from lifecycle ownership. Keep this projection
// local to the DSH view so shared Agent inventories retain their existing semantics.
export function dshDiscoveredSkills(inventory:Inventory|null):InstalledSkill[]{
  const snapshot=inventory?.dsh;
  if(!inventory||!snapshot||snapshot.contextIssue)return [];
  const byPath=new Map<string,InstalledSkill[]>(),byFile=new Map<string,InstalledSkill[]>();
  const add=(index:Map<string,InstalledSkill[]>,key:string,skill:InstalledSkill)=>{const records=index.get(key)??[];records.push(skill);index.set(key,records);};
  for(const skill of inventory.skills){add(byPath,skill.path,skill);if(skill.dshState)add(byFile,skill.dshState.file,skill);}
  const seen=new Set<string>(),result:InstalledSkill[]=[];
  for(const row of snapshot.skills){
    if(row.reason||seen.has(row.file))continue;
    seen.add(row.file);
    const records=[...new Set([...(byFile.get(row.file)??[]),...(byPath.get(row.path)??[])])];
    const original=records.find(skill=>skill.cliManaged)??records[0];
    const metadata:InstalledSkill=original??{name:row.name,path:row.path,agents:[],shared:false,source:null,sourceUrl:null,description:row.description,updateable:false,installSource:null,eveLocations:[]};
    const agents=[...new Set([...records.flatMap(skill=>skill.agents),'deepseek-harness'])];
    const cliManaged=records.some(skill=>skill.cliManaged);
    const shared=records.some(skill=>skill.shared)||['user-agents','project-agents','configured-agents'].includes(row.source)||row.cliAddressable;
    const protectedFile=shared||cliManaged||agents.some(id=>id!=='deepseek-harness')||!row.inScope||row.source==='bundled';
    result.push({...metadata,name:row.name,path:row.path,description:row.description,shared,cliManaged,agents,dshState:{...row,canSetInvocation:!!row.canSetInvocation&&!protectedFile,canTrash:!!row.canTrash&&!protectedFile}});
  }
  return result;
}
export function dshSourceLabel(state:DshSkillState,zh:boolean):string{
  const labels:Record<string,[string,string]>={
    'project-dsh':['项目目录','Project directory'],'project-agents':['项目目录','Project directory'],
    'user-dsh':['本地目录','Local directory'],'configured-dsh':['本地目录','Local directory'],
    'user-agents':['本地目录','Local directory'],'configured-agents':['本地目录','Local directory'],
    custom:['附加目录','Additional directory'],bundled:['内置','Bundled'],
  };
  return labels[state.source]?.[zh?0:1]??(zh?'本地目录':'Local directory');
}
export function mergeDshStates(inventory:Inventory|null,snapshot:DshSnapshot):Inventory|null{
  if(!inventory)return null;
  const byFile=new Map(snapshot.skills.map(row=>[row.file,row]));
  const byPath=new Map(snapshot.skills.map(row=>[JSON.stringify([row.path,row.name]),row]));
  return {...inventory,dsh:snapshot,skills:inventory.skills.map(skill=>{
    const state=(skill.dshState&&byFile.get(skill.dshState.file))??(skill.agents.includes('deepseek-harness')?byPath.get(JSON.stringify([skill.path,skill.name])):undefined);
    return state?{...skill,dshState:state}:skill;
  })};
}
export function dshReadOnlyReason(reason:string|null,zh:boolean):string{
  const messages:Record<string,[string,string]>={
    'unsupported-version':['无法验证此安装的配置接口',"This installation’s configuration interface could not be verified"],
    'unsupported-configuration':['无法从此安装验证技能设置接口，应用内只读','The skill settings interface could not be verified for this installation; read-only here'],
    'shared-configuration':['此设置来自共享配置，应用内只读',"This setting comes from shared configuration and is read-only here"],
    'complex-yaml':['此文件的 YAML 写法不支持应用内编辑',"This YAML syntax cannot be edited in the app"],
    dynamic:['此设置由表达式生成，应用内只读',"This setting uses an expression and is read-only here"],
    'home-overlay':['此设置使用用户配置，应用内只读',"This setting uses user configuration and is read-only here"],
    'parent-preset':['此设置继承自预设，应用内只读',"This setting is inherited from a preset and is read-only here"],
    'incomplete-bundles':['配置依赖缺失或版本不兼容，应用内只读','Configuration dependencies are missing or incompatible; read-only here'],
    'relative-path':['启动目录未确定，无法解析相对技能目录','The launch directory is unknown; relative skill roots cannot be resolved'],
    inherited:['此设置不支持应用内编辑',"This setting cannot be edited in the app"],
    ambiguous:['无法确定要编辑的配置',"The configuration could not be identified"],
    'unsupported-fields':['此字段不支持应用内编辑','This field cannot be edited in the app'],
    'linked-configuration':['此配置与其他方案共用文件，应用内只读',"This file is shared with other profiles and is read-only here"],
  };return (messages[reason??'']??['此配置仅供查看',"This configuration is read-only"])[zh?0:1];
}
export function dshSkillNotice(state:DshSkillState,zh:boolean):string|null{
  if(state.reason)return zh?'技能文件格式不符合 DSH 要求':'The skill file does not match the DSH format';
  if(state.shadowed)return zh?'存在优先级更高的同名技能':'A higher-priority skill has the same name';
  if(state.sourceModelInvocable===false&&state.sourceUserInvocable===false)return zh?'技能文件禁止模型和手动调用':'The skill file forbids model and manual invocation';
  return null;
}

export function dshBatchEligibility(skills:InstalledSkill[],action:'invocation'|'trash'|DshPolicyAction){
  const seen=new Set<string>(),eligible:InstalledSkill[]=[],excluded:{skill:InstalledSkill;reason:'unavailable'|'duplicate'|'source'}[]=[];
  for(const skill of skills){
    if(!canChangeDsh(skill,action==='trash'?'trash':'invocation')){excluded.push({skill,reason:'unavailable'});continue;}
    const state=skill.dshState!;
    if((action==='model-on'||action==='model-off'||action==='manual-on'||action==='manual-off')&&!(state.policyEnabled??(state.modelInvocable||state.userInvocable))){excluded.push({skill,reason:'unavailable'});continue;}
    if(action==='enable'&&state.sourceModelInvocable===false&&state.sourceUserInvocable===false||action==='both'&&(state.sourceModelInvocable===false||state.sourceUserInvocable===false)||(action==='model'||action==='model-on'||action==='model-off')&&state.sourceModelInvocable===false||(action==='manual'||action==='manual-on'||action==='manual-off')&&state.sourceUserInvocable===false){excluded.push({skill,reason:'source'});continue;}
    const file=skill.dshState!.file;
    if(seen.has(file)){excluded.push({skill,reason:'duplicate'});continue;}
    seen.add(file);eligible.push(skill);
  }
  return {eligible,excluded};
}

export function dshMatchesMembership(memberships:DshMembership[]|undefined,configuration:string,preset:string){
  return !memberships?configuration==='all'&&preset==='all':memberships.some(item=>(configuration==='all'||item.configurationPath===configuration)&&(preset==='all'||item.presetKey===preset));
}
export function filterDshSkills(skills:InstalledSkill[],configuration:string,preset:string){
  return skills.filter(skill=>dshMatchesMembership(skill.dshState?.memberships,configuration,preset)).map(skill=>{
    const state=skill.dshState;if(!state?.memberships)return skill;
    const matching=state.memberships.filter(item=>dshMatchesMembership([item],configuration,preset));
    return {...skill,dshState:{...state,shadowed:matching.length>0&&matching.every(item=>item.shadowed===true)}};
  });
}

export function normalizeDshFilters(snapshot:DshSnapshot|null|undefined,configuration:string,preset:string){
  if(configuration==='all')return {configuration:'all',preset:'all'};
  if(!snapshot)return {configuration,preset};
  if(configuration!=='all'&&!snapshot.configurationFiles?.some(row=>row.path===configuration))return {configuration:'all',preset:'all'};
  if(preset!=='all'&&!dshNativePresetChoices(snapshot.presets??[]).some(row=>row.key===preset&&(configuration==='all'||row.path===configuration)))return {configuration,preset:'all'};
  return {configuration,preset};
}

export function unreadableDshPreset(snapshot:DshSnapshot|null|undefined,configuration:string,preset:string){
  return snapshot?.presets?.find(row=>row.directoryStatus==='unknown'&&(configuration==='all'||row.path===configuration)&&(preset==='all'||row.key===preset));
}

export function dshPolicyNeedsConfirmation(skills:InstalledSkill[],target:Target){
  return target.scope==='project'&&skills.some(skill=>skill.dshState?.inScope===false);
}
export function dshPolicySaveFeedback(policy:DshSnapshot['policy'],zh:boolean){
  if(policy?.status==='pending'&&policy.pendingReason==='reload')return policy.running===false
    ? (zh?'已保存，下次启动 DSH 时生效。':'Saved. Applies next time DSH starts.')
    : (zh?'已保存，请重启 DSH。':'Saved. Restart DSH to apply changes.');
  return zh?'已保存':'Saved';
}

export function dshPolicyNoticeRequired(policy:DshSnapshot['policy']){
  if(!policy||policy.status==='active'||policy.status==='unavailable'&&policy.providerCount===0)return false;
  return policy.status!=='pending'||policy.pendingReason==='reload'&&policy.running!==false;
}
