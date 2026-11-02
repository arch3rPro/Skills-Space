import { RemovalPaths } from "@/components/removal-paths";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { displayHomePath, type Agent, type Operation } from "@/lib/upstream";

type Props = { operation: Operation; agents: Agent[]; home: string; zh: boolean; busy: boolean; onIncludeCopies: (agents: string[]) => void };

export function RemovalReview({ operation, agents, home, zh, busy, onIncludeCopies }: Props) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const plans = operation.removals ?? [];
  const paths = plans.flatMap(plan => plan.paths.map(path => ({ ...path, shared: plan.shared })));
  const affected = new Set(paths.filter(path => path.selected).flatMap(path => path.agents));
  const listedAgents = agents.filter(agent => affected.has(agent.id) && (agent.installationStatus === "confirmed" || operation.agents.includes(agent.id) && !agent.sharedDirectory && agent.directoryExists));
  const copies = paths.filter(path => (operation.removalSource || path.shared) && !path.selected && path.kind === "copy" && path.agents.some(id => agents.some(agent => agent.id === id && agent.detected)));
  const shared = plans.some(plan => plan.shared);
  const cleanup = plans.some(plan => plan.cleanupPossible);
  const eve = plans.some(plan => plan.agents.includes("eve"));
  return <div className="flex flex-col gap-3 text-sm">
    {operation.removalSource && <div className="flex flex-col gap-2">
      <p className="break-all text-xs text-muted-foreground">{t("来源", "Source")} · {displayHomePath(operation.removalSource, home)}</p>
    </div>}
    <section className="flex min-w-0 flex-col gap-2" aria-label={t("待卸载技能", "Skills to uninstall")}>
      <div className="flex min-w-0 flex-wrap gap-2">{operation.skills.length === 1 ? <span className="break-all font-medium">{operation.skills[0]}</span> : operation.skills.map(name => <Badge key={name} variant="secondary" className="h-auto min-h-5 max-w-full whitespace-normal break-all">{name}</Badge>)}</div>
      {(operation.skills.length > 1 || operation.removalSource) && <p className="break-all text-xs text-muted-foreground">{operation.target.scope === "global" ? t("全局", "Global") : displayHomePath(operation.target.projectPath ?? "", home)}</p>}
    </section>
    {(listedAgents.length > 0 || shared || cleanup) && <p className="text-xs leading-5 text-muted-foreground">
      {listedAgents.length > 0 && t(`移除 ${listedAgents.map(agent=>agent.name).join("、")} 的所选安装。`, `Remove the selected installations for ${listedAgents.map(agent=>agent.name).join(", ")}.`)}
      {shared ? t("共用这些内容的其他 Agent 也会受到影响。", "Other Agents sharing this content are also affected.") : cleanup ? t("同时可能清理无人引用的共享内容。", "Unreferenced shared content may also be removed.") : ""}
    </p>}
    {copies.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{t(`${copies.length} 个独立副本未选择，共享内容可能保留。`, `${copies.length} independent copies are unselected; shared content may remain.`)}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => onIncludeCopies([...new Set(copies.flatMap(path => path.agents))])}>{t("一并卸载副本", "Include copies")}</Button></div>}
    {eve && <p className="text-xs text-destructive">{t("Eve 将移除项目根 Agent 及所有子 Agent 中的同名技能。", "Eve removes matching skills from the project root Agent and every subagent.")}</p>}
    {paths.length <= 3 ? <div className="flex min-w-0 flex-col gap-1.5">{paths.map(path=><p key={path.path} className="break-all font-mono text-xs leading-5 text-muted-foreground">{!path.selected && `${t("未选择", "Unselected")} · `}{displayHomePath(path.path, home)}</p>)}</div> : <RemovalPaths paths={paths.map(path => ({ path: path.path, state: path.selected ? t("将删除", "Delete") : t("未选择", "Unselected") }))} home={home} zh={zh} />}
  </div>;
}
