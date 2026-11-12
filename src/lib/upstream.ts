import type { CodexSkillState, CodexSnapshot } from "./codex";
import type { HermesSkillState, HermesSettings } from "./hermes";
import type { DshSkillState, DshSnapshot } from "./dsh";
import type { PiSkillState, PiSettings } from "./pi";
export type Target = { host: "local"; scope: "global" | "project"; projectPath: string | null };
export type Agent = { id: string; name: string; path: string; directoryExists: boolean; detected: boolean; installationStatus: "confirmed" | "configurationOnly" | "notFound"; installationEvidence: string | null; sharedDirectory: boolean; additionalPaths: string[]; subagents?: string[] };
export type InstalledSkill = { codexState?: CodexSkillState | null; hermesState?: HermesSkillState | null; dshState?: DshSkillState | null; shared?: boolean; name: string; path: string; agents: string[]; source: string | null; sourceUrl: string | null; description: string; issue?: string | null; updateable?: boolean; installSource?: string | null; sourceType?: string | null; pluginName?: string | null; eveLocations?: string[]; cliManaged?: boolean; cliAgents?: string[]; hermesOrigin?: "builtin" | "external" | "local" | null; piState?: PiSkillState | null };
export type Inventory = { version: string; agents: Agent[]; skills: InstalledSkill[]; warnings: string[]; dsh?: DshSnapshot | null; codex?: CodexSnapshot | null; pi?: PiSettings | null; hermes?: HermesSettings | null };
export type Inspection = { sessionId?: string; source: string; provider: boolean; skillFilter: string | null; skills: Array<{ name: string; path: string; description: string; content: string; internal: boolean; downloadUrl: string | null; fileCount: number | null; pluginName: string | null; selectionFingerprint: string | null; fingerprint: string | null }>; warnings: string[] };
export type SyncOrigin = { target: Target; path: string; name: string };
export type SyncContentState = "matching" | "different" | "unknown";
export type SkillSyncReview = { inspection: Inspection; sourceRevision: string | null; agents: Agent[]; state: SyncContentState; sharedConflict: boolean; blockedAgents: Record<string, SyncContentState> };
export type RemovalPath = { path: string; kind: "shared" | "link" | "copy"; agents: string[]; selected: boolean; linkTarget: string | null };
export type RemovalPlan = { skill: string; agents: string[]; paths: RemovalPath[]; shared: boolean; cleanupPossible: boolean; lockPresent: boolean };
export type RemovalReport = { paths: Array<Omit<RemovalPath, "linkTarget"> & { outcome: "removed" | "retained" | "broken" | "changed" | "unknown" }>; lock: "removed" | "retained" | "absent" | "changed" | "unknown"; unrelatedPreserved: boolean };
export type Operation = { dshContextKey?: string | null; syncOrigin?: SyncOrigin; inspectionSession?: string; target: Target; action: "add" | "remove" | "update"; source: string | null; skills: string[]; agents: string[]; copy: boolean; includeInternal?: boolean; eveSubagents?: string[]; sourceHashes?: Record<string, string | null>; removals?: RemovalPlan[]; removalSource?: string | null };
export type OperationResult = { items: Array<{ destination?: string | null; agents?: string[]; skill: string; status: "complete" | "failed" | "uncertain"; message: string; evePaths?: Array<{ path: string; kind: string; contentMatches: boolean }> | null; removal?: RemovalReport | null }>; inventory: Inventory | null; logs: string };
export type UpdateStatus = { currentRevision?: string | null; latestRevision?: string | null; localState?: "clean"|"modified"|"unverified"; skill: string; status: "available" | "current" | "unknown" | "removed"; message: string };
export type Project = { path: string; name: string; icon: string };
export type InstallMode = "symlink" | "copy";
export type Preferences = { workshopDirectory?:string|null;workshopHistoryPaths?:string[]; storePageSize?: number; dshContexts?:Record<string,string|null>; installMode: InstallMode; colorTheme: string; fontFamily: string; fontSize: number; theme: string; language: string; projects: Project[]; collapsedSections: string[]; hiddenAgents: string[]; visibleAgents: string[]; agentOrder: string[] };

export function detectedSkillAgents(skill: InstalledSkill, agents: Agent[]): Agent[] {
  return agents.filter((agent) => agent.installationStatus === "confirmed" && skill.agents.includes(agent.id));
}

// Presentation only: process arguments and persisted paths retain their absolute values.
export function displayHomePath(value: string, home: string): string {
  const base = home.replace(/[\\/]+$/, "");
  if (!base) return value;
  // macOS resolves /var and /tmp through /private; consume the whole alias prefix.
  const aliases = [base];
  if (/^\/(var|tmp)(?:\/|$)/.test(base)) aliases.unshift(`/private${base}`);
  else if (/^\/private\/(var|tmp)(?:\/|$)/.test(base)) aliases.push(base.slice(8));
  const escaped = aliases.map(path => path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return value.replace(new RegExp(`(?:${escaped})(?=$|[\\\\/\\s"'<>:])`, "g"), "~");
}

export function expandHomePath(value: string, home: string): string {
  return home && (value === "~" || value.startsWith("~/") || value.startsWith("~\\")) ? home.replace(/[\\/]+$/, "") + value.slice(1) : value;
}

export function visibleSkills(inventory: Inventory | null, query: string, agent: string): InstalledSkill[] {
  if (agent && !inventory?.agents.some((target) => target.id === agent && target.installationStatus === "confirmed")) return [];
  return (inventory?.skills ?? []).filter(skill => (!agent || skill.agents.includes(agent)) && matchesSkillQuery(skill, query, agent));
}

export function matchesSkillQuery(skill: InstalledSkill, query: string, agent = ""): boolean {
  const normalized = query.trim().toLowerCase();
  return (!normalized || `${skill.name} ${skill.description} ${skill.source ?? ""} ${skill.sourceUrl ?? ""} ${skill.installSource ?? ""} ${skill.piState?.packageSource ?? ""} ${!agent || agent === "codex" ? `${skill.codexState?.displayName ?? ""} ${skill.codexState?.pluginDisplayName ?? ""}` : ""}`.toLowerCase().includes(normalized));
}

export type SkillCollection = "managed" | "agent";

// Management surface, not proof of who originally copied a skill. Untracked standard
// CLI targets (including downloads without locks) keep their existing lifecycle.
export function skillCollection(skill: InstalledSkill, agent?: string): SkillCollection {
  if (agent) return isNativeSkillForAgent(skill, agent) ? "agent" : "managed";
  return ["hermes-agent", "pi", "deepseek-harness", "fx", "codex"].some(agent => isNativeSkillForAgent(skill, agent)) ? "agent" : "managed";
}

// Native content ownership is separate from optional Agent configuration actions.
export function isNativeSkillForAgent(skill: InstalledSkill, agent: string): boolean {
  if (agent === "fx" && skill.agents.includes(agent) && skill.cliAgents && !skill.cliAgents.includes(agent)) return true;
  if (agent === "codex" && skill.codexState) return skill.codexState.lifecycleOwner !== "skills-cli";
  if (skill.cliManaged) return false;
  if (agent === "hermes-agent") return !!skill.hermesOrigin && (skill.hermesOrigin !== "local" || !skill.cliAgents?.includes(agent));
  if (agent === "pi") return !!skill.piState && (skill.piState.managed === undefined ? skill.piState.origin !== "directory" || !skill.piState.cliAddressable : !skill.piState.managed);
  if (agent === "deepseek-harness") return !!skill.dshState && (!skill.dshState.cliAddressable || !!skill.shared);
  return false;
}

export function agentSkillOrigin(skill: InstalledSkill, agent?: string): "builtin" | "package" | "directory" | null {
  if(skillCollection(skill,agent)!=="agent")return null;
  if(agent==="codex")return skill.codexState?.origin === "system" || skill.codexState?.origin === "admin" ? "builtin" : skill.codexState?.pluginId ? "package" : "directory";
  if(agent==="hermes-agent")return skill.hermesOrigin === "builtin" ? "builtin" : "directory";
  if(agent==="pi")return skill.piState?.origin === "package" ? "package" : "directory";
  if(agent==="deepseek-harness")return skill.dshState?.source === "bundled" ? "builtin" : "directory";
  if(skill.codexState?.origin === "system" || skill.codexState?.origin === "admin")return "builtin";
  if(skill.codexState?.pluginId)return "package";
  if(skill.hermesOrigin === "builtin")return "builtin";
  return skill.piState?.origin === "package" ? "package" : "directory";
}

/** Reinstall from recorded origin; an installed path is not an installation source. */
export function skillReinstallSource(skill: InstalledSkill): string | null {
  const source = skill.sourceType === "well-known" ? skill.installSource : skill.installSource ?? skill.sourceUrl ?? skill.source;
  return source?.trim() || null;
}

/** A shortcut must never expand a missing or ambiguous name to the whole source. */
export function inspectInstalledSkill(inspection: Inspection, name: string): Inspection | null {
  const matches = inspection.skills.filter(skill => skill.name === name);
  return matches.length === 1 ? { ...inspection, skills: matches, skillFilter: name } : null;
}

export function targetLabel(target: Target): string { return target.scope === "global" ? "Global" : target.projectPath ?? ""; }

// Never represent same-name, different-path installations as one uniquely actionable skill.
export function ambiguousNames(skills: InstalledSkill[]): Set<string> {
  const paths = new Map<string, Set<string>>();
  for (const skill of skills) {
    const values = paths.get(skill.name) ?? new Set<string>();
    values.add(skill.path); paths.set(skill.name, values);
  }
  return new Set([...paths].filter(([, values]) => values.size > 1).map(([name]) => name));
}

export type SkillInstallationPath = { path: string; state: "piActive" | "piShadowed" | "piDisabled" | "piUnknown" | "directory" };

// Use Pi's inspected precedence, never infer a winner from directory order or CLI ownership.
export function skillInstallationPaths(skills: InstalledSkill[], name: string, agent: string | null = "pi"): SkillInstallationPath[] {
  const records = [...new Map(skills.filter(skill => skill.name === name).map(skill => [skill.path, skill])).values()];
  if (agent !== "pi") return records.map(skill => ({path: skill.path, state: "directory"}));
  const active = records.filter(skill => skill.piState?.enabled && skill.piState.reason !== "shadowed");
  return records.map(skill => ({ path: skill.path, state: !skill.piState ? "directory"
    : !skill.piState.enabled ? "piDisabled"
    : skill.piState.reason === "shadowed" ? "piShadowed"
    : active.length === 1 ? "piActive" : "piUnknown" }));
}

export function sameNameNotice(skills: InstalledSkill[], name: string, zh: boolean, agent: string | null = "pi"): string {
  return skillInstallationPaths(skills, name, agent).some(item => item.state === "piShadowed")
    ? zh ? "Pi 中存在同名覆盖，查看详情。" : "Same-name skills overlap in Pi. See details."
    : zh ? "存在多个同名目录，查看详情。" : "Multiple folders share this skill name. See details.";
}

// Global removal selects CLI-addressable associations; Agent view keeps its explicit target.
export function removalTargetAgents(skill: InstalledSkill, agent: string): string[] {
  const agents = agent ? [agent] : skill.hermesOrigin ? skill.cliAgents ?? [] : skill.agents;
  return agents.filter(id => (id !== "codex" || !isNativeSkillForAgent(skill,"codex")) && (id !== "fx" || !isNativeSkillForAgent(skill,"fx")) && (id !== "pi" || skill.piState?.cliAddressable !== false) && (id !== "deepseek-harness" || skill.dshState?.cliAddressable !== false));
}

export function canRemove(skills: InstalledSkill[], names: string[], agents: string[]): boolean {
  return agents.length > 0 && names.length > 0 && names.every((name) => {
    const records = skills.filter((skill) => skill.name === name);
    return !records.some((skill) => agents.includes("codex") && isNativeSkillForAgent(skill,"codex") || agents.includes("deepseek-harness") && skill.dshState?.cliAddressable === false || agents.includes("pi") && skill.piState?.cliAddressable === false && !skill.cliAgents?.some(id => id !== "pi" && agents.includes(id)) || skill.hermesOrigin && skill.agents.some((id) => agents.includes(id) && !skill.cliAgents?.includes(id)) && !skill.cliAgents?.some(id => agents.includes(id))) && records.some((skill) => skill.agents.some((id) => agents.includes(id))) && agents.every((id) => id === "eve" || records.filter((skill) => skill.agents.includes(id) && (!skill.hermesOrigin || skill.cliAgents?.includes(id))).length <= 1);
  });
}

// Separate copies remain distinct inventory records but may share one upstream update source.
export function canUpdate(skills: InstalledSkill[], names: string[]): boolean {
  return names.length > 0 && names.every((name) => {
    const all = skills.filter((skill) => skill.name === name);
    const originals = all.filter(skill => skill.cliManaged && skill.sourceType !== "local-sync");
    const copies = all.filter(skill => skill.sourceType === "local-sync");
    const records = originals.length ? originals : copies.length ? copies : all;
    return records.length > 0 && records.every((skill) => skill.updateable && !!skill.source && skill.source === records[0].source);
  });
}

/** Only confirmed, actionable source changes belong in an update operation. */
export function availableUpdateSkills(skills: InstalledSkill[], names: string[], updates: UpdateStatus[]): string[] {
  const byName = new Map(updates.map(update => [update.skill, update]));
  return [...new Set(names)].filter(name => {
    const update = byName.get(name);
    return update?.status === "available"
      && !!update.currentRevision && !!update.latestRevision
      && update.currentRevision !== update.latestRevision && canUpdate(skills, [name]);
  });
}

export function remainingOperationSkills(result: OperationResult): string[] {
  return [...new Set(result.items.filter((item) => item.status !== "complete").map((item) => item.skill))];
}

export type MarketplaceSkill = { id: string; skillId: string; name: string; source: string; installs: number; previewable: boolean; description: string | null; change: number | null; isOfficial: boolean };
export type MarketplacePage = { skills: MarketplaceSkill[]; page: number; total: number; totalPages: number; stale: boolean; fetchedAt: number };

export type CreationPlan = { directory: string; name: string | null; skillName: string; skillDirectory: string; file: string };
export type CreationResult = { plan: CreationPlan; status: "complete" | "failed" | "uncertain"; message: string; content: string | null; fileState?: "missing" | "unreadable" | "invalid" | "valid" | "unverified"; logs: string };

export type RestorePath = { path: string; kind: "missing" | "directory" | "link" | "other" | "unknown"; hash: string | null; linkTarget: string | null };
export type RestoreItem = { skill: string; source: string; sourceType: string; path: string; sourceHash: string | null; recordedHash: string | null; action: "restore" | "skip"; additional: boolean; affectedAgents: string[]; before: RestorePath; issue: string | null };
export type RestorePlan = { target: Target; lockPath: string; lockHash: string; agents: string[]; items: RestoreItem[]; observed: RestorePath[]; warnings: string[] };
export type RestoreResult = { plan: RestorePlan; items: Array<{ skill: string; path: string; status: "complete" | "failed" | "uncertain"; changed: boolean; afterKind: RestorePath["kind"]; contentMatches: boolean; contentState?: "matching" | "missing" | "different" | "unreadable" | "unverified"; lockMatches: boolean; lockState?: "matching" | "missing" | "different" | "unreadable"; lockChanged: boolean }>; inventory: Inventory | null; warnings: string[]; logs: string };

export type SyncOptions = { copy: boolean; recursive: boolean; include: string[]; exclude: string[]; cleanup: boolean; remote: boolean };
export type DependencyPlan = { options: SyncOptions; discoveryFingerprint: string; removals: Array<{skill: string; key: string | null; paths: RestorePath[]; retained: RestorePath[]}>; target: Target; agents: string[]; lockHash: string | null; items: Array<{ skill: string; package: string; sourcePath: string; sourceHash: string; action: "install" | "skip"; replacesRecord: boolean; shared: RestorePath; destinations: Array<{ agent: string; before: RestorePath; rootMissing: boolean }>; affectedAgents: string[]; remoteSource: string | null; via: string | null; changesShared: boolean; cached: boolean }>; observed: RestorePath[] };
export type DependencyResult = { items: Array<{ skill: string; agent: string; path: string; status: "complete" | "failed" | "uncertain"; action: "install" | "skip" | "remove"; after: RestorePath; changed: boolean; contentMatches: boolean; contentState?: "matching" | "missing" | "different" | "unreadable" | "unverified" | "retained"; relationshipMatches: boolean; lockMatches: boolean; lockState?: "matching" | "missing" | "different" | "unreadable" }>; warnings: string[]; logs: string };

/** A source category describes origin, without exposing repository or HOME details on cards. */
export function skillSourceKind(skill: InstalledSkill): "git" | "local" | "download" | "well-known" | "node_modules" | "unknown" {
  switch (skill.sourceType) {
    case "github": case "gitlab": case "git": return "git";
    case "local": case "download": case "well-known": case "node_modules": return skill.sourceType;
  }
  const source = skill.sourceUrl ?? skill.installSource ?? skill.source ?? "";
  if (source.startsWith("/") || source.startsWith("./") || source.startsWith("../") || source.startsWith("~")) return "local";
  if (source.startsWith("git@") || /^(https?:\/\/)?(github\.com|gitlab\.com|bitbucket\.org)\//.test(source) || /^[^/:]+\/[^/:]+$/.test(source)) return "git";
  return "unknown";
}

/** Only browser-safe recorded URLs become links; local paths are resolved by the native layer. */
export function skillSourceUrl(skill: InstalledSkill): string | null {
  for (const value of [skill.sourceUrl, skill.installSource, skill.source]) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href;
    } catch { /* A shorthand or a filesystem path is not a browser URL. */ }
  }
  const source = skill.source ?? "";
  if (skillSourceKind(skill) === "git" && /^[\w.-]+\/[\w.-]+$/.test(source)) return `https://github.com/${source}`;
  return null;
}

export function agentStatusLabel(agent: Agent, zh: boolean): string {
  if (agent.installationStatus === "confirmed") return zh ? "已安装" : "Installed";
  if (agent.installationStatus === "configurationOnly") return zh ? "发现配置" : "Configuration found";
  return zh ? "未安装" : "Not installed";
}

// Counts describe installed targets, never every Agent sharing a directory definition.
export function installedSkillCounts(inventory: Inventory | null): Map<string, number> {
  const counts = new Map<string, number>();
  const confirmed = new Set(inventory?.agents.filter(agent => agent.installationStatus === "confirmed").map(agent => agent.id));
  for (const skill of inventory?.skills ?? []) {
    for (const id of skill.agents) if (confirmed.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

const defaultAgentOrder = ["claude-code", "codex", "cursor", "gemini-cli", "github-copilot", "opencode", "pi", "windsurf"];
export function orderAgents(agents: Agent[], saved: string[] = []): Agent[] {
  const rank = new Map([...new Set([...saved, ...defaultAgentOrder])].map((id, index) => [id, index]));
  return [...agents].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}
export function moveAgent(agents: Agent[], saved: string[], source: string, destination: string): string[] {
  const ids = [...new Set([...saved, ...orderAgents(agents, saved).map(agent => agent.id)])];
  const from = ids.indexOf(source), to = ids.indexOf(destination);
  if (from < 0 || to < 0 || from === to) return ids;
  ids.splice(from, 1);
  ids.splice(to, 0, source);
  return ids;
}

// Declared application capabilities; unrelated to installation or visibility preferences.
export function agentEnhancement(id: string): { nativeInventory: boolean; settings: "codex" | "pi" | "dsh" | "hermes" | null } {
  if (id === "codex") return {nativeInventory:true,settings:"codex"};
  if (id === "pi") return {nativeInventory:true,settings:"pi"};
  if (id === "deepseek-harness") return {nativeInventory:true,settings:"dsh"};
  return {nativeInventory:id === "hermes-agent",settings:id === "hermes-agent" ? "hermes" : null};
}
export function agentSupportGroup(id: string): "enhanced" | "standard" {
  return agentEnhancement(id).nativeInventory ? "enhanced" : "standard";
}
export function moveAgentWithinSupport(agents: Agent[], saved: string[], source: string, destination: string): string[] {
  const ids = [...new Set([...saved, ...orderAgents(agents,saved).map(agent=>agent.id)])];
  if (agentSupportGroup(source) !== agentSupportGroup(destination)) return ids;
  const known = new Set(agents.map(agent=>agent.id));
  const slots = ids.flatMap((id,index)=>known.has(id) && agentSupportGroup(id)===agentSupportGroup(source) ? [index] : []);
  const group = slots.map(index=>ids[index]);
  const from=group.indexOf(source), to=group.indexOf(destination);
  if (from<0 || to<0 || from===to) return ids;
  group.splice(to,0,...group.splice(from,1));
  slots.forEach((index,at)=>{ids[index]=group[at];});
  return ids;
}

export type SkillDocumentInfo = { pluginVersion?: string | null; sourceDirectory: string | null; revision: string | null; content: string; version: string | null; localState: string | null };

export type SkillDiff = { revision: string; version: string; files: Array<{path: string; status: string; binary: boolean; diff: string}> };
