import { useId } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { piPackageBlocker, type PiPackageResult } from "@/lib/pi";
import { displayHomePath } from "@/lib/upstream";
import { notificationError } from "@/lib/notification-message";
import { VersionValue } from "@/components/version-value";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogBody, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

export function PiPackageUpdateDialog({ review, busy, zh, home, packageName, onClose, onUpdate }: {
  review: PiPackageResult | null; busy: boolean; zh: boolean; home: string; packageName?: string; onClose: () => void; onUpdate: () => void;
}) {
  const descriptionId = useId();
  const t = (cn: string, en: string) => zh ? cn : en;
  const count = new Set(review?.affected.filter(item => item.status === "available").map(item => item.source)).size;
  const rows = review?.affected ?? [];
  const unique = rows.filter((item,index)=>rows.findIndex(other=>other.source===item.source&&other.installed===item.installed&&other.latest===item.latest&&other.reason===item.reason&&other.status===item.status&&other.updateable===item.updateable)===index);
  const canUpdate = !!review?.affected.length && count > 0 && review.affected.every(item => item.updateable);
  const affectedScopes = new Set(rows.filter(item => item.updateable && item.status !== "pinned").map(item => item.scope));
  const scopeImpact = affectedScopes.has("user") && affectedScopes.has("project")
    ? t("同时更新全局和当前项目中的安装。", " Updates both global and current project installations.")
    : affectedScopes.has("user")
      ? t("更新全局安装，影响使用此扩展包的项目。", " Updates the global installation used by projects that load this package.")
      : t("仅更新当前项目中的安装。", " Updates the current project installation only.");
  return <AlertDialog open={!!review} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    {review && <AlertDialogContent aria-describedby={review.error || count > 0 && !review.updated ? descriptionId : undefined} aria-busy={busy} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
      <AlertDialogHeader>
        <AlertDialogTitle>{review.updated ? t("扩展包已更新", "Package updated") : count ? t(`更新 ${count} 个扩展包？`, `Update ${count} packages?`) : t("扩展包更新", "Package update")}</AlertDialogTitle>
        {count > 0 && !review.updated && <AlertDialogDescription id={review.error ? undefined : descriptionId}>{t("更新整个扩展包，可能覆盖本地改动。", "Updates replace the entire package and may overwrite local edits.")}{scopeImpact}</AlertDialogDescription>}
      </AlertDialogHeader>
      <AlertDialogBody className="flex flex-col gap-4">
        <dl aria-label={t("版本更新", "Version updates")} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,auto)_auto_minmax(0,auto)] items-center gap-x-3 gap-y-4 text-sm">
          {unique.map(item => {
            const blocker = piPackageBlocker(item, zh);
            const installations = rows.filter(other => other.source === item.source && other.installed === item.installed && other.latest === item.latest && other.reason === item.reason && other.status === item.status && other.updateable === item.updateable);
            const scopes = [...new Set(installations.map(installation => installation.scope === "user" ? t("全局", "Global") : t("当前项目", "This project")))];
            return <div key={`${item.scope}:${item.root}`} className="col-span-4 grid min-w-0 grid-cols-subgrid items-center gap-y-2">
                <dt className="min-w-0 font-medium [overflow-wrap:anywhere]">{packageName??item.source}<span className="mt-1 block text-xs font-normal text-muted-foreground">{scopes.join(t("、", ", "))}</span>{unique.filter(other=>other.source===item.source).length>1 && <span className="mt-1 block text-xs font-normal text-muted-foreground">{displayHomePath(item.root,home)}</span>}</dt>
                {item.reason === "incompleteUpdate" ? <dd className="col-span-3 text-xs text-muted-foreground">{t("上次更新未完成", "Previous update unfinished")}</dd> : <dd className="col-span-3 grid min-w-0 grid-cols-subgrid items-center font-mono text-xs tabular-nums text-muted-foreground">
                  <span className="min-w-0 [overflow-wrap:anywhere]"><VersionValue value={item.installed} state={!item.installed&&item.reason==="referenceUnavailable"?"error":"ready"} zh={zh}/></span><span>→</span><span className="min-w-0 [overflow-wrap:anywhere]"><VersionValue value={item.latest} zh={zh}/></span>
                </dd>}
                {blocker ? <dd className="col-span-4"><Alert variant="destructive"><AlertDescription>{blocker}</AlertDescription></Alert></dd> : item.status === "current" ? <dd className="col-span-4 text-muted-foreground">{t("已是最新版本", "Up to date")}</dd> : item.status === "pinned" ? <dd className="col-span-4 text-muted-foreground">{t("版本已固定，不参与更新。", "Pinned version; excluded from this update.")}</dd> : null}
              </div>;
          })}
        </dl>
        {review.error && <Alert variant="destructive"><AlertDescription id={descriptionId}>{review.issues?.length ? <ul className="flex min-w-0 flex-col gap-3">{review.issues.map((issue,index)=><li key={index} className="min-w-0"><span className="block break-all font-medium">{displayHomePath(issue.subject,home)}</span><span>{notificationError(issue.message,zh,issue.kind==="invocation"?t("调用配置未恢复，请重新选择调用方式。","Invocation settings were not restored. Choose the invocation mode again."):issue.kind==="association"?t("关联副本更新未完成，请在对应智能体中重新检查更新。","The associated copy was not updated. Check for updates in its Agent."):t("扩展包已更新，调用记录未保存，请重新检查扩展更新。","The package updated, but invocation records were not saved. Check package updates again."))}</span></li>)}</ul> : notificationError(review.error,zh,t("扩展包操作未完成，请重新检查。","Package operation did not finish. Check again."))}</AlertDescription></Alert>}
      </AlertDialogBody>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>{t("关闭", "Close")}</AlertDialogCancel>
        {!review.updated && (count > 0 || !!review.error) && <AlertDialogAction disabled={busy || (!review.error && !canUpdate)} onClick={event => { event.preventDefault(); onUpdate(); }}>
          {busy && <LoaderCircleIcon data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
          {busy ? t("更新中…", "Updating…") : review.error ? t("重新检查", "Check again") : count ? t(`更新 ${count} 个扩展包`, `Update ${count} packages`) : t("更新", "Update")}
        </AlertDialogAction>}
      </AlertDialogFooter>
    </AlertDialogContent>}
  </AlertDialog>;
}
