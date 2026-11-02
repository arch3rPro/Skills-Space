import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { FileSearchIcon, RefreshCwIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { notifyError, notifySuccess } from "@/lib/notifications";
import { displayHomePath } from "@/lib/upstream";

type NodeStatus = {
  path: string | null;
  version: string | null;
  source: "system" | "custom" | "downloaded" | null;
  state: "ready" | "missing" | "incompatible" | "downloading";
  selectedPath: string | null;
  minimumVersion: string;
};

export function NodeRuntimeSettings({ zh, disabled, home }: { zh: boolean; disabled: boolean; home: string }) {
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const language = useRef(zh);
  language.current = zh;
  const active = useRef(false);
  const t = (cn: string, en: string) => zh ? cn : en;
  useEffect(() => {
    active.current = true;
    const read = () => invoke<NodeStatus>("application_node_status").then(value => { if (active.current) setStatus(value); });
    void read().catch(() => { if (active.current) notifyError("", language.current, undefined, language.current ? "Node 读取失败，请重新检测。" : "Could not read Node. Detect again."); }).finally(() => { if (active.current) setLoading(false); });
    const unlisten = listen<boolean>("node-runtime-download", event => {
      if (!active.current) return;
      if (event.payload) setStatus(previous => previous ? { ...previous, state: "downloading" } : previous);
      else void read().catch(() => {});
    });
    return () => { active.current = false; void unlisten.then(stop => stop()); };
  }, []);
  async function run(command: "application_node_detect" | "application_node_select", path?: string | null) {
    if (pending || disabled) return;
    setPending(true);
    try {
      const value = await invoke<NodeStatus>(command, command === "application_node_select" ? { path: path ?? null } : undefined);
      if (active.current) {
        setStatus(value);
        notifySuccess(language.current ? "Node 已就绪。" : "Node is ready.");
      }
    } catch (error) {
      if (active.current) notifyError(String(error), language.current, undefined, language.current ? "Node 设置未完成，请检查网络或选择可用的 Node。" : "Could not set up Node. Check your connection or choose a working Node executable.");
    } finally { if (active.current) setPending(false); }
  }
  async function choose() {
    if (pending || disabled) return;
    try {
      const path = await open({ title: t("选择 Node 可执行文件", "Choose a Node executable"), directory: false, multiple: false });
      if (typeof path === "string" && active.current) await run("application_node_select", path);
    } catch (error) { notifyError(String(error), language.current, undefined, language.current ? "无法选择文件，请重试。" : "Could not choose a file. Try again."); }
  }
  const downloading = status?.state === "downloading";
  const busy = pending || downloading;
  const state = pending ? t("正在设置 Node…", "Setting up Node…") : downloading ? t("正在下载 Node…", "Downloading Node…") : status?.state === "incompatible" ? t(`需要 Node ${status.minimumVersion} 或更新版本`, `Node ${status.minimumVersion} or later is required`) : status?.state === "missing" ? t("未找到可用的 Node", "No compatible Node found") : null;
  const runtimePath = status?.path ?? status?.selectedPath;
  const description = status ? ["Node", status.version, runtimePath ? displayHomePath(runtimePath, home) : null, state].filter(Boolean).join(" · ") : t("读取失败", "Could not read");
  return <Card>
    <CardHeader>
      <CardTitle>{t("运行环境", "Runtime")}</CardTitle>
        {loading ? <Skeleton className="h-4 w-40" /> : <CardDescription className="break-all" role="status">{description}</CardDescription>}
      <CardAction className="flex max-w-full flex-wrap items-center justify-end gap-2" aria-busy={busy}>
        <Button variant="outline" size="sm" disabled={disabled || loading || busy} onClick={() => void run("application_node_detect")}><RefreshCwIcon data-icon="inline-start" aria-hidden="true" className={busy ? "animate-spin motion-reduce:animate-none" : undefined} />{t("重新检测", "Detect again")}</Button>
        <Button variant="outline" size="sm" disabled={disabled || loading || busy} onClick={() => void choose()}><FileSearchIcon data-icon="inline-start" aria-hidden="true" />{t("选择文件", "Choose file")}</Button>
        {status?.selectedPath && <Button variant="outline" size="sm" disabled={disabled || loading || busy} onClick={() => void run("application_node_select", null)}><RotateCcwIcon data-icon="inline-start" aria-hidden="true" />{t("恢复自动检测", "Use automatic detection")}</Button>}
      </CardAction>
    </CardHeader>
  </Card>;
}
