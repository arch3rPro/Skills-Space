import type { SkillDiff } from "@/lib/upstream";
import { SkillDiffView } from "@/components/skill-diff-view";
import { useState } from "react";
import { useFeedbackError } from "@/lib/notifications";
import { CodeIcon, EyeIcon, GitCompareArrowsIcon, TerminalIcon, AlignLeftIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Hint } from "@/components/hint";
import { SkillMarkdown, SkillHtml, SkillCodeBlock } from "@/components/skill-markdown";

export function SkillDocument({ content, html, overviewHtml, installation, preferInstallation = false, loading = false, zh, onOpenExternal, showDiff = false, onDiff, onRestore }: {
  content: string;
  html?: string;
  overviewHtml?: string | null;
  installation?: { command: string | null; prompt: string | null } | null;
  preferInstallation?: boolean;
  loading?: boolean;
  showDiff?: boolean;
  onDiff?: (refresh?: boolean) => Promise<SkillDiff>;
  onRestore?: (difference:SkillDiff,file:string)=>Promise<SkillDiff>;
  zh: boolean;
  onOpenExternal: (url: string) => void;
}) {
  const [mode, setMode] = useState(preferInstallation ? "installation" : "preview");
  const hasInstallation = !!(installation?.command || installation?.prompt);
  const previewUnavailable = preferInstallation && !content && !html && !loading;
  const firstMode = hasInstallation ? "installation" : overviewHtml ? "overview" : "preview";
  const effectiveMode = mode === "installation" && !hasInstallation || mode === "overview" && !overviewHtml || mode === "preview" && previewUnavailable || mode === "source" && !content ? firstMode : mode;
  const [difference, setDifference] = useState<SkillDiff | null>(null);
  const [diffError, setDiffError] = useFeedbackError(zh);
  const [diffLoading, setDiffLoading] = useState(false);
  async function changeMode(value: string) {
    if (!value) return;
    setMode(value);
    if (value !== "diff" || !onDiff || diffLoading || difference !== null && !diffError) return;
    setDiffLoading(true);setDiffError("");
    try { setDifference(await onDiff(!!diffError)); }
    catch (reason) {
      const message=String(reason);
      setDiffError(zh ? /changed|Reopen/.test(message) ? "文件已变化，点击“差异”重新读取。" : /recorded source version|installed source version/.test(message) ? "无法获取安装时的原文件，无法查看差异。" : /no recorded source/.test(message) ? "缺少原文件，无法查看差异。" : "差异读取失败，点击“差异”重试。" : message);
    } finally { setDiffLoading(false); }
  }
  const t = (cn: string, en: string) => zh ? cn : en;
  return <section className="flex min-w-0 flex-col gap-4" aria-label="SKILL.md" aria-busy={loading}>
    <ToggleGroup type="single" size="sm" className="segmented-control" value={effectiveMode} onValueChange={value => void changeMode(value)} aria-label={t("文档显示", "Document view")}>
      {hasInstallation && <ToggleGroupItem value="installation"><TerminalIcon aria-hidden="true" />{t("安装", "Install")}</ToggleGroupItem>}
      {overviewHtml && <ToggleGroupItem value="overview"><AlignLeftIcon aria-hidden="true" />{t("概述", "Summary")}</ToggleGroupItem>}
      <Hint text={previewUnavailable ? t("技能正文暂不可用。", "The skill document is unavailable.") : undefined} disabled={previewUnavailable}><ToggleGroupItem value="preview" disabled={previewUnavailable}><EyeIcon aria-hidden="true" />{t("预览", "Preview")}</ToggleGroupItem></Hint>
      <Hint text={html && !content && !loading ? t("原始 SKILL.md 暂不可用，可重试。", "Original SKILL.md is unavailable. Retry reading the source.") : undefined} disabled={!content}><ToggleGroupItem value="source" disabled={!content}><CodeIcon aria-hidden="true" />{t("源码", "Source")}</ToggleGroupItem></Hint>
      {(showDiff || mode === "diff") && <ToggleGroupItem value="diff" onClick={()=>{if(mode==="diff"&&diffError)void changeMode("diff");}} disabled={!content || diffLoading}><GitCompareArrowsIcon aria-hidden="true" />{t("差异", "Diff")}</ToggleGroupItem>}
    </ToggleGroup>
    {effectiveMode === "installation" ? <div className="flex min-w-0 flex-col gap-4">
      {installation?.command && <section className="min-w-0"><h3 className="mb-2 text-sm font-medium">{t("命令", "Command")}</h3><SkillCodeBlock code={installation.command} language="shell" zh={zh} /></section>}
      {installation?.prompt && <section className="min-w-0"><h3 className="mb-2 text-sm font-medium">{t("提示词", "Prompt")}</h3><SkillCodeBlock code={installation.prompt} zh={zh} wrap /></section>}
    </div> : effectiveMode === "overview" && overviewHtml ? <SkillHtml html={overviewHtml} zh={zh} onOpenExternal={onOpenExternal} /> : mode === "diff" ? <SkillDiffView data={difference} loading={diffLoading} zh={zh} onRestore={onRestore&&difference?async file=>{setDiffError("");try{setDifference(await onRestore(difference,file));}catch(reason){setDifference(null);setDiffError(file+": "+(zh?/^File restored/.test(String(reason))?"文件已恢复，其他文件有变化。点击“差异”重新读取。":/changed|Reopen|Review|version/.test(String(reason))?"文件或版本已变化，点击“差异”重新读取。":/linked|read-only|path/.test(String(reason))?"无法写入此文件，未恢复。":"恢复未完成，点击“差异”重新读取。":String(reason)));throw reason;}}:undefined}/> : loading ? <div className="flex min-w-0 flex-col gap-3" role="status" aria-label={t("读取中…", "Loading…")}><Skeleton className="h-5 w-2/3 motion-reduce:animate-none" /><Skeleton className="h-32 w-full motion-reduce:animate-none" /></div> : !content ? html ? <SkillHtml html={html} zh={zh} onOpenExternal={onOpenExternal} /> : null : effectiveMode === "source"
      ? <pre className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] rounded-xl bg-muted/30 p-6 text-sm leading-6">{content}</pre>
      : <SkillMarkdown content={content} zh={zh} onOpenExternal={onOpenExternal} />}
  </section>;
}
