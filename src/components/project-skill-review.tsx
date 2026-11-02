import type { ReactNode } from "react";
import { AgentLogo } from "@/components/agent-logo";
import { RemovalPaths } from "@/components/removal-paths";
import { ExecutionLog } from "@/components/execution-log";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { notificationError } from "@/lib/notification-message";
import { displayHomePath, type Agent, type DependencyPlan, type DependencyResult, type RestorePlan, type RestoreResult } from "@/lib/upstream";
import { groupProjectResults } from "@/lib/project-operation-results";

export function ProjectSkillList({ items, zh, title, emptyRecords = false }: { emptyRecords?: boolean; items: Array<{ skill: string; source: string; issue?: string }>; zh: boolean; title?: string }) {
  if (!items.length) return <Empty><EmptyHeader><EmptyTitle>{emptyRecords ? (zh ? "没有安装记录" : "No installation records") : (zh ? "没有找到技能" : "No skills found")}</EmptyTitle>{!emptyRecords && <EmptyDescription>{zh ? "检查项目依赖或调整查找规则后重试。" : "Check project dependencies or adjust the search patterns."}</EmptyDescription>}</EmptyHeader></Empty>;
  return <section className="flex min-w-0 flex-col gap-3">{title && <h3 className="font-medium">{title} {items.length}</h3>}<ul className="flex min-w-0 flex-col gap-3">{items.map(item => <li key={`${item.skill}:${item.source}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1"><span className="min-w-0 break-words font-medium">{item.skill}</span><span className="min-w-0 break-all text-xs text-muted-foreground">{item.source}</span>{item.issue && <p className="col-span-2 text-xs text-destructive" role="alert">{item.issue}</p>}</li>)}</ul></section>;
}
function SkillNames({ title, names }: { title: string; names: string[] }) {
  const unique = [...new Set(names)];
  if (!unique.length) return null;
  return <section className="flex flex-col gap-2"><h3 className="font-medium">{title} {unique.length}</h3><div className="flex flex-wrap gap-2">{unique.map(name => <Badge key={name} variant="secondary" className="h-auto min-h-5 max-w-full whitespace-normal break-all">{name}</Badge>)}</div></section>;
}
function AffectedAgents({ ids, agents, zh }: { ids: string[]; agents: Agent[]; zh: boolean }) {
  const affected = agents.filter(agent => ids.includes(agent.id));
  if (!affected.length) return null;
  return <section className="flex flex-col gap-2"><h3 className="text-xs text-muted-foreground">{zh ? "影响 Agent" : "Affected Agents"}</h3><div className="flex flex-wrap gap-x-5 gap-y-2">{affected.map(agent => <span className="inline-flex items-center gap-2" key={agent.id}><AgentLogo name={agent.id} size={18} />{agent.name}</span>)}</div></section>;
}
function ReviewDetails({ children, zh }: { children: ReactNode; zh: boolean }) {
  return <details><summary className="w-fit cursor-pointer rounded-sm text-xs text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring">{zh ? "查看明细" : "View details"}</summary><div className="mt-3 flex flex-col gap-3 text-xs">{children}</div></details>;
}
export function DependencyReview({ plan, agents, home, zh }: { plan: DependencyPlan; agents: Agent[]; home: string; zh: boolean }) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const missingRoots = [...new Set(plan.items.flatMap(item => item.destinations.filter(destination => destination.rootMissing).map(destination => destination.agent)))];
  const removedPaths = plan.removals.flatMap(item => item.paths);
  const copies = plan.options.copy && plan.items.some(item => item.action === "install" && !item.cached);
  const affected = [...new Set([...(plan.items.some(item => item.action === "install") ? plan.agents : []), ...plan.items.filter(item => item.action === "install").flatMap(item => item.affectedAgents).filter(id => agents.some(agent => agent.id === id && agent.detected)), ...agents.filter(agent => removedPaths.some(path => path.path.replace(/\\/g, "/").startsWith(`${agent.path.replace(/\\/g, "/")}/`))).map(agent => agent.id)])];
  return <div className="flex flex-col gap-5 text-sm">
    <dl className="flex items-center gap-4"><dt className="shrink-0 text-muted-foreground">{t("安装模式", "Installation mode")}</dt><dd>{copies ? t("文件复制", "File copies") : t("符号链接", "Symbolic links")}</dd></dl>
    {!plan.items.length && !plan.removals.length && <p className="text-muted-foreground">{t("没有需要处理的依赖技能。", "No dependency skill changes are needed.")}</p>}
    <SkillNames title={t("安装", "Install")} names={plan.items.filter(item => item.action === "install" && !item.cached).map(item => item.skill)} />
    <SkillNames title={t("补建链接", "Repair links")} names={plan.items.filter(item=>item.cached).map(item=>item.skill)} />
    <SkillNames title={t("跳过", "Skip")} names={plan.items.filter(item => item.action === "skip").map(item => item.skill)} />
    <SkillNames title={t("清理", "Remove stale skills")} names={plan.removals.map(item => item.skill)} />
    <AffectedAgents ids={affected} agents={agents} zh={zh} />
    {plan.items.some(item => item.action === "install" && !item.cached) && <p className="text-xs text-muted-foreground">{t("可能替换现有内容和来源记录，影响共用目录的 Agent。", "May replace existing content and source records, affecting Agents sharing the folder.")}</p>}
    {!!plan.removals.length && <p className="text-xs text-destructive">{t("清理包含未选 Agent 的失效目标；清单外的独立副本保留。", "Cleanup includes stale targets in unselected Agents; independent copies outside the list are preserved.")}</p>}
    {!!missingRoots.length && <p className="text-xs text-destructive">{t("项目目录不存在，仅安装共享内容：", "Project Agent folders are missing; only shared content will be installed: ")}{missingRoots.map(id => agents.find(agent => agent.id === id)?.name ?? id).join(" · ")}</p>}
    {plan.items.some(item => item.remoteSource) && <p className="text-xs text-muted-foreground">{t("Git 声明按来源链接，链接失败时可能复制。", "Git declarations link to the source; a failed link may fall back to a copy.")}</p>}
    <RemovalPaths paths={[...plan.items.flatMap(item => [{ path: item.shared.path, state: item.cached ? t("保留", "Retain") : item.action === "skip" ? t("跳过", "Skip") : t("安装", "Install") }, ...item.destinations.map(destination => ({ path: destination.before.path, state: destination.rootMissing ? t("不创建", "Not created") : item.action === "skip" ? t("跳过", "Skip") : t("安装", "Install") }))]), ...plan.removals.flatMap(item => [...item.paths.map(path => ({ path: path.path, state: t("将删除", "Delete") })), ...item.retained.map(path => ({ path: path.path, state: t("保留", "Retain") }))])]} home={home} zh={zh} />
    {!!plan.items.length && <ReviewDetails zh={zh}>{plan.items.map(item => <dl key={item.skill} className="flex min-w-0 flex-col gap-1"><dt className="break-words font-medium">{item.skill} · {item.package}</dt><dd className="break-all text-muted-foreground">{displayHomePath(item.remoteSource ?? item.sourcePath, home)}</dd>{item.via && <dd className="break-all text-muted-foreground">{item.via}</dd>}</dl>)}</ReviewDetails>}
  </div>;
}
export function RestoreReview({ plan, agents, home, zh }: { plan: RestorePlan; agents: Agent[]; home: string; zh: boolean }) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const preserved = plan.observed.filter(path => path.kind !== "link" && !plan.items.some(item => item.path === path.path) && plan.items.some(item => item.path.split(/[\\/]/).pop() === path.path.split(/[\\/]/).pop()));
  const changed = plan.items.filter(item => item.sourceHash && item.recordedHash && item.sourceHash !== item.recordedHash);
  return <div className="flex flex-col gap-5 text-sm">
    {!plan.items.length && <p className="text-muted-foreground">{t("没有可恢复的技能。", "No skills to restore.")}</p>}
    <ProjectSkillList items={plan.items.filter(item => !item.additional).map(item => ({ skill: item.skill, source: displayHomePath(item.source,home), issue:item.issue?notificationError(item.issue,zh,t("来源读取失败，请重新检查。","Could not read the source. Check again.")):undefined }))} zh={zh} title={t("重新安装", "Reinstall")} />
    {!!plan.items.some(item => item.additional) && <ProjectSkillList items={plan.items.filter(item => item.additional).map(item => ({ skill: item.skill, source: displayHomePath(item.source,home), issue:item.issue?notificationError(item.issue,zh,t("来源读取失败，请重新检查。","Could not read the source. Check again.")):undefined }))} zh={zh} title={t("依赖新增", "Additional dependency skills")} />}
    <AffectedAgents ids={[...new Set(plan.items.flatMap(item => item.affectedAgents))].filter(id => agents.some(agent => agent.id === id && agent.detected))} agents={agents} zh={zh} />
    {!!plan.items.length && <p className="text-xs text-muted-foreground">{t("将覆盖项目共用目录中的对应技能文件，独立副本保留。", "Restore the current version into the project shared folder. Existing files may be replaced; independent copies remain.")}</p>}
    {!!changed.length && <p className="text-xs text-destructive">{t("来源已更新：", "Source updated:")}{changed.map(item => item.skill).join(" · ")}</p>}
    <RemovalPaths paths={[...plan.items.map(item => ({ path: item.path, state: item.issue ? t("无法恢复", "Unavailable") : item.action === "skip" ? t("跳过", "May skip") : t("恢复", "Restore") })), ...preserved.map(path => ({ path: path.path, state: t("保留", "Retain") }))]} home={home} zh={zh} />
    <ReviewDetails zh={zh}>{!!plan.warnings.length && <ul className="flex flex-col gap-2">{plan.warnings.map(warning=><li key={warning} className="break-words">{displayHomePath(warning,home)}</li>)}</ul>}<p className="break-all font-mono text-muted-foreground">{displayHomePath(plan.lockPath, home)}</p>{plan.items.map(item => <dl key={item.skill} className="flex flex-col gap-1"><dt className="break-words font-medium">{item.skill}</dt><dd className="break-all text-muted-foreground">{displayHomePath(item.source, home)}</dd>{item.issue && <dd className="whitespace-pre-wrap break-words text-muted-foreground">{displayHomePath(item.issue, home)}</dd>}{item.before.linkTarget && <dd className="break-all font-mono text-muted-foreground">→ {displayHomePath(item.before.linkTarget, home)}</dd>}</dl>)}</ReviewDetails>
  </div>;
}
export function ProjectSkillResults({ result, kind, agents, home, zh }: { result: DependencyResult | RestoreResult; kind: "dependency" | "restore"; agents: Agent[]; home: string; zh: boolean }) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const groups = groupProjectResults(result.items);
  const incomplete = groups.filter(group => group.status !== "complete");
  const completed = groups.filter(group => group.status === "complete");
  const name = (id: string) => agents.find(agent => agent.id === id)?.name ?? id;
  const reason = (item: (typeof result.items)[number]) => {
    if (!item.contentMatches) {
      const state = item.contentState ?? ("afterKind" in item ? item.afterKind === "missing" ? "missing" : "unverified" : item.after?.kind === "missing" ? "missing" : "unverified");
      if (state === "missing") return t("目标文件未安装", "Target files were not installed");
      if (state === "different") return t("目标内容与安装来源不一致", "Target content differs from the installation source");
      if (state === "unreadable") return t("无法读取目标文件", "Target files could not be read");
      if (state === "retained") return t("目标文件未删除", "Target files were not removed");
      return t("无法确认安装内容，请查看执行日志", "Installation content is unconfirmed. View the execution log.");
    }
    if ("relationshipMatches" in item && !item.relationshipMatches) return t("目标链接或目录类型不符", "The target link or directory type does not match");
    if (!item.lockMatches) return item.lockState === "unreadable" ? t("无法读取安装记录", "Installation records could not be read") : item.lockState === "missing" ? t("安装记录未写入", "Installation records were not written") : item.lockState === "different" ? t("安装记录与来源不一致", "Installation records differ from the source") : t("无法确认安装记录，请查看执行日志", "Installation records are unconfirmed. View the execution log.");
    return t("操作未完成，请查看执行日志", "The operation did not finish. View the execution log.");
  };
  return <div className="flex flex-col gap-5 text-sm">
    <p className="font-medium" role="status">{t(`已完成 ${completed.length} 项`, `${completed.length} completed`)}{!!incomplete.length && <span className="ml-3 text-muted-foreground">{t(`${incomplete.length} 项未完成`, `${incomplete.length} incomplete`)}</span>}</p>
    {!!incomplete.length && <ul className="flex flex-col gap-3">{incomplete.map(group => <li key={group.key}><p className="break-words font-medium">{group.skill}{group.action === "remove" && ` · ${t("清理", "Cleanup")}`}</p><ul className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">{group.items.filter(item => item.status !== "complete").map((item, index) => <li className="break-words" key={index}>{"agent" in item && item.agent ? `${name(item.agent)} · ` : ""}{reason(item)}</li>)}</ul></li>)}</ul>}
    <SkillNames title={kind === "restore" ? t("已重新安装", "Reinstalled") : t("已安装", "Installed")} names={completed.filter(group => group.action !== "remove").map(group => group.skill)} />
    <SkillNames title={t("已清理", "Removed")} names={completed.filter(group => group.action === "remove").map(group => group.skill)} />
    <RemovalPaths paths={result.items.filter(item => item.status !== "complete").map(item => ({ path: item.path, state: item.status === "complete" ? "action" in item && item.action === "remove" ? t("已删除", "Removed") : t("已安装", "Installed") : item.status === "failed" ? t("未完成", "Incomplete") : t("未能确认", "Unconfirmed") }))} home={home} zh={zh} />
    {"inventory" in result && !result.inventory && <p className="text-xs text-muted-foreground">{t("技能列表读取失败，请关闭弹窗后刷新。", "Could not read skills. Close this dialog and refresh.")}</p>}
    <ExecutionLog value={[result.logs, ...result.warnings, ...result.items.filter(item => item.status !== "complete").map(item => JSON.stringify(item))].join("\n")} home={home} zh={zh} />
  </div>;
}
