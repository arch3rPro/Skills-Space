import type { Operation, OperationResult } from "./upstream";

// A failed command is not evidence that its deleted files should be removed again.
export function retryableSkills(result: OperationResult, operation: Operation | null): string[] {
  if (!result.inventory) return [];
  return [...new Set(result.items.filter(item => {
    if (item.status === "complete") return false;
    if (operation?.action !== "remove") return true;
    const report = item.removal;
    if (report) {
      if (report.paths.some(path => path.selected && path.outcome !== "removed")) return true;
      return report.lock !== "removed" && report.lock !== "absent";
    }
    return result.inventory?.skills.some(skill => skill.name === item.skill && (
      operation.removalSource ? skill.cliManaged && skill.source === operation.removalSource
        : skill.agents.some(id => operation.agents.includes(id)) && skill.piState?.cliAddressable !== false
    )) ?? false;
  }).map(item => item.skill))];
}

export type PathEntry = { path: string; state: string };
export function groupPaths(paths: PathEntry[]): Array<{ directory: string; state: string; names: string[] }> {
  const groups = new Map<string, { directory: string; state: string; names: string[] }>();
  for (const entry of paths) {
    const slash = Math.max(entry.path.lastIndexOf("/"), entry.path.lastIndexOf("\\"));
    const directory = entry.path.slice(0, slash + 1);
    const name = entry.path.slice(slash + 1) || entry.path;
    const key = JSON.stringify([directory, entry.state]);
    const group = groups.get(key) ?? { directory, state: entry.state, names: [] };
    if (!group.names.includes(name)) group.names.push(name);
    groups.set(key, group);
  }
  return [...groups.values()];
}

// Rebuild a source review from current inventory/locks; never turn it into a
// name-only removal or replay the previous confirmation snapshot.
export async function recheckSourceRemoval(
  previous: Operation,
  skills: string[],
  commands: {
    inventory: (target: Operation["target"]) => Promise<NonNullable<OperationResult["inventory"]>>;
    sourcePlan: (target: Operation["target"], skill: string) => Promise<Operation>;
  },
): Promise<{ inventory: NonNullable<OperationResult["inventory"]>; operation: Operation | null }> {
  if (previous.action !== "remove" || !previous.removalSource || !skills.length) throw new Error("Missing source removal context.");
  const inventory = await commands.inventory(previous.target);
  const candidate = inventory.skills.find(skill => skills.includes(skill.name) && skill.cliManaged && skill.source === previous.removalSource);
  try {
    const operation = await commands.sourcePlan(previous.target, candidate?.name ?? skills[0]);
    if (operation.removalSource !== previous.removalSource) throw new Error("Skill source changed. Review its details.");
    return { inventory, operation };
  } catch (reason) {
    // Lock-only entries can still be reviewed even if no installation is visible.
    // No lock entry and no managed install means there is nothing left to retry.
    if (!candidate && /^(?:Error:\s*)?This skill has no upstream source record\.$/i.test(String(reason).trim())) {
      if (inventory.skills.some(skill => skills.includes(skill.name) && skill.cliAgents?.some(id => previous.agents.includes(id)))) {
        throw new Error("Source record is missing but CLI paths remain. Review the paths.");
      }
      return { inventory, operation: null };
    }
    throw reason;
  }
}
