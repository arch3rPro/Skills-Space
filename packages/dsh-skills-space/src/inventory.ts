import { filterDshSkills } from "@/lib/dsh";
import { skillCollection, matchesSkillQuery, type InstalledSkill } from "@/lib/upstream";
import { filterManagedSkills } from "@/lib/managed-skill-filters";
import type { Skill } from "./client";

export function asInstalled(item: Skill): InstalledSkill {
  return { name: item.name, path: item.state?.file ?? item.path, description: item.description,
    source: item.installation?.source ?? null, sourceUrl: item.installation?.sourceUrl ?? null,
    sourceType: item.installation?.sourceType ?? null, installSource: item.installation?.source ?? null,
    agents: ["deepseek-harness"], cliManaged: item.managed === true,
    shared: item.cliAddressable || item.managed === true || ["user-agents", "project-agents"].includes(item.source), dshState: item.state };
}

export function managedSkills(items: Skill[]): Skill[] {
  return items.filter(item => item.state && skillCollection(asInstalled(item), "deepseek-harness") === "managed")
    .map(item => ({ ...item, removable: item.managedRemovable }));
}

export function nativeSkills(items: Skill[], preset: string): Skill[] {
  const discovered = items.filter(item => item.discoverable);
  const matches = new Map(filterDshSkills(discovered.map(asInstalled), "all", preset).map(skill => [JSON.stringify([skill.dshState?.file, skill.name]), skill.dshState]));
  return discovered.flatMap(item => {
    const state = matches.get(JSON.stringify([item.state?.file, item.name]));
    return state ? [{ ...item, state, source: state.source, shadowed: state.shadowed, removable: item.nativeRemovable }] : [];
  });
}

export function filterInventory(items: Skill[], collection: string, query: string, source: string, status: string): Skill[] {
  const matching = collection === "managed" ? new Set(filterManagedSkills(items.map(asInstalled), source, status, "deepseek-harness").map(skill => JSON.stringify([skill.path, skill.name]))) : null;
  return items.filter(item => (!matching || matching.has(JSON.stringify([asInstalled(item).path, item.name]))) && matchesSkillQuery(asInstalled(item), query, "deepseek-harness"));
}

export function nativeDirectoryState(data: { partialPresets?: string[]; runtimePresets?: string[]; readFailedPresets?: string[] } | undefined, preset: string) {
  const matches = (id: string) => preset === "all" || preset === id;
  const runtime = data?.runtimePresets ?? [];
  return { runtime: runtime.filter(matches), failed: [...new Set([...(data?.readFailedPresets ?? []), ...(data?.partialPresets ?? []).filter(id => !runtime.includes(id))])].filter(matches) };
}
