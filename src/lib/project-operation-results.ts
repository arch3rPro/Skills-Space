import type { DependencyResult, RestoreResult } from "./upstream";

type ResultItem = DependencyResult["items"][number] | RestoreResult["items"][number];
export function groupProjectResults(items: ResultItem[]) {
  const groups = new Map<string, { key: string; skill: string; action: "install" | "remove"; status: ResultItem["status"]; items: ResultItem[] }>();
  for (const item of items) {
    const action = "action" in item && item.action === "remove" ? "remove" : "install";
    const key = JSON.stringify([item.skill, action]);
    let group = groups.get(key);
    if (!group) { group = { key, skill: item.skill, action, status: "complete", items: [] }; groups.set(key, group); }
    group.items.push(item);
    if (item.status === "failed" || item.status === "uncertain" && group.status !== "failed") group.status = item.status;
  }
  return [...groups.values()];
}
