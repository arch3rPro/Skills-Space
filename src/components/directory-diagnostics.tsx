import { Hint } from "@/components/hint";
import { notifyError, notifySuccess } from "@/lib/notifications";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExecutionLog } from "@/components/execution-log";
import { notificationError } from "@/lib/notification-message";
import { displayHomePath, type Inventory, type Project, type Target } from "@/lib/upstream";
import { directoryDiagnosticMessage, groupDirectoryDiagnostics, type DiagnosticResult } from "@/lib/directory-diagnostics";

export function DirectoryDiagnostics({ projects, home, zh, disabled }: { projects: Project[]; home: string; zh: boolean; disabled: boolean }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<DiagnosticResult[] | null>(null);
  const t = (cn: string, en: string) => zh ? cn : en;
  const { issues, groups } = groupDirectoryDiagnostics(results ?? []);
  const failures = results?.filter(result => result.error).length ?? 0;
  async function inspect() {
    setRunning(true);
    setResults(null);
    const scopes: { name: string; target: Target }[] = [
      { name: t("全局", "Global"), target: { host: "local", scope: "global", projectPath: null } },
      ...projects.map<{ name: string; target: Target }>(project => ({ name: project.name, target: { host: "local", scope: "project", projectPath: project.path } })),
    ];
    try {
      const next = await Promise.all(scopes.map(async scope => {
        try {
          const inventory = await invoke<Inventory>("upstream_inventory", { target: scope.target });
          return { ...scope, warnings: inventory.warnings, error: null };
        } catch (error) {
          return { ...scope, warnings: [], error: String(error) };
        }
      }));
      setResults(next);
      if (next.some(result => result.error)) notifyError(t("部分目录检测失败，请查看结果", "Some folders could not be checked. Review the results."), zh);
      else notifySuccess(t("目录检测完成", "Directory check complete"));
    } finally {
      setRunning(false);
    }
  }
  const status = running ? t("正在检测…", "Checking…") : results ? failures ? t(`${issues} 项问题，${failures} 个范围检测失败`, `${issues} issues; ${failures} scopes could not be checked`) : issues ? t(`${issues} 项问题`, `${issues} issues`) : t("未发现问题", "No issues found") : t("检测全局及已添加项目的技能目录。", "Check global and added project skill directories.");
  return <Card>
    <CardHeader>
      <CardTitle>{t("目录诊断", "Directory diagnostics")}</CardTitle>
      <CardDescription id="directory-diagnostics-status" role="status">{status}</CardDescription>
      <CardAction><Button variant="outline" size="sm" disabled={disabled || running} aria-busy={running} aria-describedby="directory-diagnostics-status" onClick={() => void inspect()}><RefreshCwIcon data-icon="inline-start" aria-hidden="true" className={running ? "animate-spin motion-reduce:animate-none" : undefined} />{t("检测", "Check")}</Button></CardAction>
    </CardHeader>
    {(groups.length>0||failures>0)&&<CardContent className="flex flex-col gap-4">
    {groups.map(group => <details key={group.key} className="min-w-0"><Hint text={group.paths.length ? displayHomePath(group.paths.join("\n"), home) : undefined}><summary className="cursor-pointer text-sm break-words">{group.names.join(zh ? "、" : ", ")} · {group.warnings.length}</summary></Hint><pre className="mt-3 whitespace-pre-wrap break-all text-xs text-muted-foreground">{displayHomePath(group.warnings.map(warning => directoryDiagnosticMessage(warning, zh)).join("\n"), home)}</pre></details>)}
    {results?.filter(result => result.error).map(result => <details key={result.target.projectPath ?? "global"} className="min-w-0"><Hint text={result.target.projectPath ? displayHomePath(result.target.projectPath, home) : undefined}><summary className="cursor-pointer text-sm">{result.name} · {t("检测失败", "Check failed")}</summary></Hint><div className="mt-3 flex flex-col gap-3"><p className="break-words text-xs text-destructive">{notificationError(result.error ?? "", zh)}</p><ExecutionLog value={result.error ?? ""} home={home} zh={zh} /></div></details>)}
    </CardContent>}
  </Card>;
}
