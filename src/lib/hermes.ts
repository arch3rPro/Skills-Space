import { skillCollection, displayHomePath, type InstalledSkill, type Inventory, type Target } from './upstream.ts';
export type HermesSkillState = {
 path:string; file:string; name:string; description:string; origin:string; inScope:boolean;
 enabled:boolean; autoLoad:boolean; canToggle:boolean; canPreload:boolean; reason:string|null;
 loadName:string|null; version?:string|null; documentRevision:string; cliAddressable:boolean;
};
export type HermesSettings = {
 target:Target; path:string; revision:string; hermesHome:string; externalDirs:string[]; createDir:string;
 projectDiscovery:boolean; trustedProjects:string[]; disabled:string[]; autoLoad:string[];
 projectRoot:string|null; projectTrusted:boolean; skills:HermesSkillState[]; warnings:string[];
};
export function mergeHermesStates(inventory:Inventory|null,snapshot:HermesSettings):Inventory|null {
 if(!inventory)return inventory;
 const states=new Map(snapshot.skills.filter(s=>s.inScope).map(s=>[`${s.path}\0${s.name}`,s]));
 return {...inventory,skills:inventory.skills.map(s=>{const state=states.get(`${s.path}\0${s.name}`);return state?{...s,hermesState:state}:s;})};
}
export function hermesReason(state:HermesSkillState,zh:boolean):string {
 const reasons:Record<string,[string,string]>={untrusted:['项目未信任','Project not trusted'],noProject:['未识别 Git 项目','No Git project'],discoveryDisabled:['项目发现已关闭','Project discovery disabled'],differentRoot:['Hermes 使用父级 Git 根目录','Hermes uses the parent Git root'],shadowed:['同名技能已覆盖此副本','Shadowed by another skill'],ambiguous:['存在多个同名技能，请查看安装路径','Multiple skills share this name; see installation paths'],platform:['不适用当前系统','Not available on this OS'],conditional:['加载条件由 Hermes 判断','Loading conditions are evaluated by Hermes'],scanUnverified:['Hermes 尚未返回项目扫描结果','Hermes project scan results are unavailable'],disabled:['已停用','Disabled']};
 return state.name==='hermes-agent'?(zh?'必需技能，不可停用':'Essential skill; cannot disable'):reasons[state.reason??'']?.[zh?0:1]??(zh?'当前配置方案':'Current profile');
}
export function hermesCardNotice(state: Pick<HermesSkillState, "reason">): boolean {
 return ['untrusted','noProject','discoveryDisabled','differentRoot','shadowed','ambiguous','platform'].includes(state.reason ?? '');
}
export function hermesInspectionWarnings(warnings: string[], home: string, zh: boolean): string[] {
 const t=(cn:string,en:string)=>zh?cn:en;
 return [...new Set(warnings.map(message=>{
  for(const [prefix,cn,en] of [
   ['Invalid Hermes skill: ','技能文件无法解析','Cannot parse skill file'],
   ['Cannot inspect Hermes skill directory: ','无法读取技能目录','Cannot read skill directory'],
  ]) if(message.startsWith(prefix))return `${t(cn,en)} · ${displayHomePath(message.slice(prefix.length),home)}`;
  if(message==='Hermes skill inspection limit exceeded.')return t('目录内容过多，部分技能未读取','Some skills were not read because the directory is too large');
  if(message==='Hermes Hub records could not be inspected.')return t('无法读取 Hermes Hub 来源记录','Cannot read Hermes Hub source records');
  return t('部分技能未能读取，请检查目录和配置','Some skills could not be read. Check the directories and configuration');
 }))];
}
export type HermesEditorHandle={requestLeave:(action:()=>void)=>void};
export const hermesGlobal:Target={host:'local',scope:'global',projectPath:null};

export function filterHermesSkills(skills:InstalledSkill[],status:string,origin:string) {
 return skills.filter(skill=>{
  const state=skill.hermesState;
  if(!state||origin!=="all"&&state.origin!==origin)return false;
  return status==="all"||status==="enabled"&&state.enabled||status==="disabled"&&!state.enabled||status==="preload"&&state.enabled&&state.autoLoad||status==="ondemand"&&state.enabled&&!state.autoLoad;
 });
}

// Build the editable part of each action; immutable skills do not block other selected skills.
export function hermesActionSkills(skills:InstalledSkill[],kind:"toggle"|"preload",enabled:boolean) {
 return skills.filter(skill=>{const state=skill.hermesState;return state && (kind==="toggle"?state.canToggle:state.canPreload) && (kind==="toggle"?state.enabled:state.autoLoad)!==enabled;});
}

export function hermesSelection(skills:InstalledSkill[],selected:string[],collection:"managed"|"agent") {
 const keys=new Set(selected);
 return skills.filter(skill=>skill.agents.includes("hermes-agent") && skillCollection(skill)===collection && skill.hermesState && keys.has(collection==="agent"?skill.hermesState.file:skill.name));
}
