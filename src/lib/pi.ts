import type { PiPackageInventory } from './pi-packages';
import { isNativeSkillForAgent, type Target, type Inventory } from "./upstream.ts";

export type PiSkillState = {
  path: string; file: string; rulePath: string; name: string; description: string;
  enabled: boolean; canToggle: boolean; reason: "shadowed" | "globalInProject" | "packageDelta" | null;
  blockingRules: string[]; settingsPath: string; scope: "global" | "project"; inScope?: boolean;
  packageIndex: number | null; packageSource: string | null; origin: string;
  canCheckPackage?: boolean; canRestoreDefault?: boolean; canRecoverInvocation?: boolean;
  managed?: boolean; visibilityConfigured?: boolean; packageRoot?: string | null;
  lifecycle?: { source: {kind:string;root:string;identity:string;version:string|null;reliable:boolean}; local:"clean"|"policyOnly"|"modified"|"unverified"; recovery:"consistent"|"pendingRestore"|"conflict"; configured:boolean; scopeConflict?:boolean; mode:"auto"|"manual"|"default" } | null;
  canSetVisibility?: boolean; visibilityHidden?: boolean; visibilityPending?: boolean; sourceManualOnly?: boolean;
  canTrash?: boolean; manualOnly: boolean; cliAddressable: boolean; documentRevision?: string;
};
export type PiCodemode = {
  extensionEnabled?: boolean; startupEnabled: boolean; mode: "on" | "only" | null; inlineBudget: number | null;
  inheritedMode: "on" | "only"; inheritedInlineBudget: number;
};
export type PiSettings = {
  codemode?: PiCodemode | null;
  builtinConfiguration?: PiPackageInventory;
  runtimeVersion?: string | null;
  target: Target; path: string; revision: string; entries: string[];
  skillCommands: boolean | null; inheritedSkillCommands: boolean;
  dependencies: Array<{path:string;revision:string}>; skills: PiSkillState[];
  warnings: string[]; agentDirectory: string; additionalDirectories?: string[];
  projectTrusted?: boolean; projectTrustDecision?: boolean; trustRevision?: string;
};
export function isPiRule(value: string): boolean { return /^[!+-]/.test(value) || /[*?]/.test(value); }
export function piEntries(directories: string[], text: string): string[] {
  return [...directories.map(value => value.trim()).filter(Boolean), ...text.split(/\r?\n/).map(value => value.trim()).filter(Boolean)];
}

// Settings may edit directories, but the read-only rules retain their exact values
// and their relative order, including expressions this version does not interpret.
export function piSettingsEntries(original: string[], directories: string[]): string[] {
  let next = 0;
  const entries = original.flatMap(entry => isPiRule(entry) ? [entry] : next < directories.length ? [directories[next++]] : []);
  return [...entries, ...directories.slice(next)];
}

export function piDirectoryDisplayPath(directory: string): string {
  const parts = directory.split(/[\\/]/).filter(Boolean);
  const separator = directory.includes('\\') ? '\\' : '/';
  return parts.length > 3 ? `…${separator}${parts.slice(-3).join(separator)}` : directory;
}

export function piStateReason(state: PiSkillState, zh: boolean): string {
  if (state.reason === "shadowed") return zh ? "已被 Pi 中的同名技能覆盖，查看详情。" : "Overridden by a same-name skill in Pi. See details.";
  if (state.reason === "globalInProject") return zh ? "此技能由全局 Pi 设置控制。" : "This skill is controlled by global Pi settings.";
  if (state.reason === "packageDelta") return zh ? "扩展包规则不支持在此处切换。" : "Package rules cannot be changed here.";
  return state.enabled ? (zh ? "已启用" : "Enabled") : (zh ? "已停用" : "Disabled");
}

export function piInvocationReason(state: PiSkillState, zh: boolean): string {
  if (state.canSetVisibility) return state.manualOnly ? (zh ? "手动调用" : "Manual invocation") : (zh ? "自动选择" : "Automatic selection");
  if (state.reason === "shadowed" || state.reason === "globalInProject") return piStateReason(state, zh);
  return zh ? "调用配置不可写。" : "Invocation settings are not writable.";
}

export function piActionSkills(skills: Inventory["skills"], action: "enable" | "disable" | "auto" | "manual") {
  return skills.filter(skill => {
    const state = skill.piState;
    return skill.agents.includes("pi") && !!state && (action === "enable" || action === "disable"
      ? state.canToggle && state.enabled !== (action === "enable")
      : state.canSetVisibility && state.manualOnly !== (action === "manual"));
  });
}

// Configuration changes keep installed file identity, order and other Agent records intact.
export function mergePiSkillStates(inventory: Inventory | null, states: PiSkillState[]): Inventory | null {
  if (!inventory) return null;
  const byFile = new Map(states.map(state=>[state.file,state]));
  let changed=false;
  const skills=inventory.skills.map(skill=>{
    const state = skill.piState ? byFile.get(skill.piState.file) : states.find(item => item.inScope !== false && item.path === skill.path && item.name === skill.name);
    if(!state || JSON.stringify(state)===JSON.stringify(skill.piState))return skill;
    changed=true;return {...skill,piState:state};
  });
  return changed?{...inventory,skills}:inventory;
}

export type PiRemovalPlan = {target:Target;file:string;path:string;name:string;revision:string;dependencies:Array<{path:string;revision:string}>};
export function canTrashPiSkill(skill: Inventory["skills"][number]): boolean {
  return isNativeSkillForAgent(skill,"pi") && !!skill.piState?.canTrash && !skill.cliManaged && !skill.shared && skill.agents.every(id=>id==="pi");
}
export function filterPiNativeSkills(skills: Inventory["skills"], status: string, source: string): Inventory["skills"] {
  return skills.filter(skill=>{
    const state=skill.piState;
    const matches=status==="all" || !!state && (status==="enabled" ? state.enabled : status==="disabled" ? !state.enabled : status==="manual" ? state.manualOnly : status==="auto" ? !state.manualOnly : false);
    const sourceMatches = source==="all" || (source==="local" ? !state?.packageSource : `package:${state?.packageSource}`===source);
    return matches && sourceMatches;
  });
}

export type PiPackageAffected = {scope:string;source:string;root:string;status:string;latest:string|null;installed:string|null;localState:string;updateable:boolean;message:string;reason?:string|null};
export type PiPackageResult = {issues?:Array<{kind:"record"|"invocation"|"association";subject:string;message:string}>;updated?:boolean;affected:PiPackageAffected[];snapshot:PiSettings;error:string|null};


export function piConfiguredDirectory(rulePath: string | undefined, directories: string[]): string | null {
  if (!rulePath) return null;
  return directories.filter(path => rulePath === path || rulePath.startsWith(path.replace(/[\\/]+$/, "") + (path.includes("\\") ? "\\" : "/")))
    .sort((a,b)=>b.length-a.length)[0] ?? null;
}

// Unknown history is not evidence of edits. Only surface an actionable blocker.
export function piPackageBlocker(item: PiPackageAffected, zh: boolean): string | null {
  if (item.updateable) return null;
  if (item.reason === "incompleteUpdate") return zh ? "扩展包更新未完成，请继续更新。" : "The package update did not finish. Continue the update.";
  if (item.status === "pinned") return zh ? "此扩展包已固定版本。" : "This package is pinned to a version.";
  if (item.status === "unknown") return zh ? "未能获取最新版本，请重新检查扩展更新。" : "The latest version is unavailable. Check package updates again.";
  return item.message || (zh ? "此扩展包暂时无法更新。" : "This package cannot currently be updated.");
}
