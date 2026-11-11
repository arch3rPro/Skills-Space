import { ExecutionLog } from "@/components/execution-log";
import { notificationError } from "@/lib/notification-message";
import { displayHomePath, type Operation, type OperationResult } from "@/lib/upstream";
import { RemovalPaths } from "@/components/removal-paths";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function OperationResults({ result, operation, action = operation?.action, home, zh, busy, onReinstall, inventoryExpected = true, distinguishPaths = false }: { result: OperationResult; operation: Operation | null; action?: Operation["action"]; home: string; zh: boolean; busy: boolean; onReinstall?: (skill: string) => void; inventoryExpected?: boolean; distinguishPaths?: boolean }) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const completeKey = (item: OperationResult["items"][number]) => distinguishPaths ? JSON.stringify([item.skill, item.destination]) : item.skill;
  const complete = [...new Map(result.items.filter(item => item.status === "complete").map(item => [completeKey(item), item])).values()];
  const failures = result.items.filter(item => item.status !== "complete");
  const itemKey = (item: OperationResult["items"][number]) => JSON.stringify([item.skill,item.destination ?? null,item.agents ?? [],item.message]);
  const incomplete = [...new Map(failures.map(item => [itemKey(item), item])).values()];
  const isAssociated = (item: OperationResult["items"][number]) => operation?.action === "update" && (!!item.destination || complete.some(done=>done.skill===item.skill));
  const associatedOnly = incomplete.length>0 && incomplete.every(isAssociated);
  const verb = action === "remove" ? t("已卸载", "Uninstalled") : action === "update" ? t("已更新", "Updated") : t("已安装", "Installed");
  const hint = (item: OperationResult["items"][number]) => {
    const pending = item.removal?.paths.filter(path => path.selected && path.outcome !== "removed");
    if (pending?.some(path => path.outcome === "unknown")) return t("无法读取部分卸载路径，请检查访问权限", "Some uninstall paths could not be read. Check access permissions.");
    if (pending?.some(path => path.outcome === "changed")) return t("卸载路径已变化，请重新打开卸载确认", "Uninstall paths changed. Open uninstall again.");
    if (pending?.length) return t("部分文件未删除，请点击“重新检查”", "Some files were not removed. Click Check again.");
    if (item.removal && !item.removal.unrelatedPreserved) return t("未能确认其他技能是否保持原样，请查看执行日志", "Other skills could not be verified. View the execution log.");
    if (item.removal?.lock === "unknown") return t("无法读取安装记录，请检查访问权限", "Installation records could not be read. Check access permissions.");
    if (item.removal?.lock === "changed") return t("安装记录已变化，请重新打开卸载确认", "Installation records changed. Open uninstall again.");
    if (item.removal?.lock === "retained") return t("安装记录未删除，请点击“重新检查”", "Installation records remain. Click Check again.");
    if (item.removal && item.removal.paths.every(path => !path.selected || path.outcome === "removed") && ["removed", "absent"].includes(item.removal.lock)) return t("所选文件已删除，请查看执行日志中的异常", "Selected files were removed. View the execution log for errors.");
    if (/removal targets changed/i.test(item.message)) return t("卸载范围已变化，请重新检查", "Removal targets changed. Check again.");
    if (/upstream execution failed/i.test(item.message)) return t("命令执行失败，请查看日志", "Command failed. Review the log.");
    return notificationError(item.message, zh, t("操作未完成，请重新检查。", "The operation did not finish. Check again."));
  };
  const pathState = (outcome: string) => outcome === "removed" ? t("已删除", "Removed") : outcome === "retained" ? t("仍存在", "Still exists") : outcome === "broken" ? t("失效链接", "Broken link") : outcome === "changed" ? t("已变化", "Changed") : t("无法读取", "Unreadable");
  const paths = incomplete.flatMap(item => [
    ...(item.removal?.paths.filter(path => path.selected ? path.outcome !== "removed" : path.outcome !== "retained").map(path => ({ path: path.path, state: !path.selected && path.outcome === "retained" ? t("已保留", "Retained") : pathState(path.outcome) })) ?? []),
    ...(item.evePaths?.filter(path => !path.contentMatches).map(path => ({ path: path.path, state: path.contentMatches ? t("内容匹配", "Content matches") : path.kind === "missing" ? t("不存在", "Missing") : t("内容不符", "Content differs") })) ?? []),
  ]);
  return <div className="flex flex-col gap-5 text-sm">
    <p className="font-medium" role="status">{t(`${verb} ${complete.length} 个技能`, `${verb} ${complete.length} skills`)}{incomplete.length > 0 && <span className="ml-3 text-muted-foreground">{associatedOnly ? t(`${incomplete.length} 个关联副本未完成`, `${incomplete.length} associated copies incomplete`) : t(`${incomplete.length} 个未完成`, `${incomplete.length} incomplete`)}</span>}</p>
    {incomplete.length > 0 && <ul className="flex flex-col gap-3">{incomplete.map(item => <li key={itemKey(item)} className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="break-all font-medium">{item.skill}{!!item.agents?.length && ` · ${item.agents.map(id=>result.inventory?.agents?.find(agent=>agent.id===id)?.name ?? id).join("、")}`}{isAssociated(item) && t(" · 关联副本", " · associated copy")}</p><p className="mt-1 text-xs text-muted-foreground">{hint(item)}</p>{item.destination && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{displayHomePath(item.destination,home)}</p>}</div>{onReinstall && operation?.action === "update" && !item.destination && !result.inventory?.skills.some(skill => skill.name === item.skill && skill.sourceType === "local-sync") && result.inventory?.skills.some(skill => skill.name === item.skill && skill.installSource) && <Button variant="outline" size="sm" disabled={busy} onClick={() => onReinstall(item.skill)}>{t("重新安装", "Reinstall")}</Button>}</li>)}</ul>}
    {complete.length > 0 && <div className="flex flex-wrap gap-2">{complete.map(item => <Badge key={completeKey(item)} variant="secondary" className="h-auto min-h-5 max-w-full whitespace-normal break-all">{item.skill}</Badge>)}</div>}
    {inventoryExpected && !result.inventory && <p className="text-xs text-muted-foreground">{t("技能列表读取失败，请关闭弹窗后刷新。", "Could not read skills. Close this dialog and refresh.")}</p>}
    <RemovalPaths paths={paths} home={home} zh={zh} />
    {(result.logs || incomplete.length > 0) && <ExecutionLog value={[...failures.map(item => `${item.skill}: ${item.message}`), result.logs].join("\n")} home={home} zh={zh} />}
  </div>;
}
