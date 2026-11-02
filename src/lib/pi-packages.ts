import type { PiSkillState } from './pi';
import type { InstalledSkill } from './upstream';
import type { PiPackageResult } from './pi';
export type PiResourceType = 'extensions' | 'skills' | 'prompts' | 'themes';
export type PiResource = {id:string;path:string;name:string;type:PiResourceType;enabled:boolean;override:'inherit'|'load'|'unload'|null};
export type PiExtensionPackage = {id:string;source:string;scope:'user'|'project';kind:'npm'|'git'|'local';path:string|null;name:string;description:string;version:string|null;inherited:boolean;delta:boolean;canRemove:boolean;canUpdate:boolean;resources:PiResource[]};
export type PiPackageInventory = {version:string;revision:string;projectTrusted:boolean;packages:PiExtensionPackage[];builtins:PiResource[]};
export type PiInventoryResult = {snapshot:PiPackageInventory;update?:PiPackageResult};
export function piResourceTypeLabel(type:PiResourceType,zh:boolean) {
 const labels={extensions:['扩展','Extensions'],skills:['技能','Skills'],prompts:['提示词模板','Prompt templates'],themes:['主题','Themes']};
 return labels[type][zh?0:1];
}
export type PiLoadingChoice = 'inherit' | 'load' | 'unload';
export function piLoadingChoice(resource: PiResource, project: boolean): PiLoadingChoice {
 return project ? resource.override ?? 'inherit' : resource.enabled ? 'load' : 'unload';
}

export function piPackageEnabled(pkg: PiExtensionPackage): boolean { return pkg.resources.some(resource => resource.enabled); }
export function piPackageSourceLabel(kind: PiExtensionPackage['kind'], zh: boolean): string {
 return kind === 'local' ? (zh ? '本地目录' : 'Local directory') : kind === 'npm' ? (zh ? 'NPM包' : 'NPM package') : (zh ? 'Git 仓库' : 'Git repository');
}

export type PiPackageSummary = { count: number | null; loading: boolean; packages?: PiExtensionPackage[] };

export function piPackageDisplayName(pkg: Pick<PiExtensionPackage, 'name'>): string {
 return pkg.name.replace(/^@[^/]+\/([^/]+)$/, '$1');
}
export function piPackageSkills(pkg: PiExtensionPackage, skills: InstalledSkill[], states: PiSkillState[] = []): InstalledSkill[] {
 const paths=new Set(pkg.resources.filter(resource=>resource.type==='skills').map(resource=>resource.path.replace(/\\/g,'/').replace(/\/SKILL\.md$/i,'')));
 const normalize = (path: string) => path.replace(/\\/g,'/').replace(/\/SKILL\.md$/i,'');
 const matched = skills.filter(skill=>skill.agents.includes('pi')&&paths.has(normalize(skill.piState?.file??skill.path)));
 // The original Pi inspection includes inherited metadata outside the project's
 // owned inventory. Preserve those actual permission fields; do not invent them.
 for (const state of states) if (paths.has(normalize(state.file)) && !matched.some(skill=>normalize(skill.piState?.file??skill.path)===normalize(state.file))) {
   matched.push({name:state.name,path:state.path,agents:['pi'],source:state.packageSource,sourceUrl:null,description:state.description,piState:state});
 }
 return matched;
}
