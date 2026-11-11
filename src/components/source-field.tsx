import { useEffect, useId, useRef, useState } from "react";
import { FolderOpenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type SourceMode = "git" | "download" | "local";
// This selects an input guide only. The upstream parser still determines the source.
function sourceMode(value: string): SourceMode {
  const source = value.trim();
  if (/^(?:~[/\\]|\.{1,2}(?:[/\\]|$)|[/\\]|[a-z]:[/\\])/i.test(source)) return "local";
  if (/^https?:\/\//i.test(source)) {
    try {
      const url = new URL(source);
      if (/\.(?:md|zip|tar|tar\.gz|tgz)$/i.test(url.pathname) || /^(?:(?:raw|objects)\.githubusercontent\.com|codeload\.github\.com)$/i.test(url.hostname) || /\/(?:archive\/|raw\/|releases\/(?:download\/|latest\/download\/)|-\/(?:archive|raw)\/)/.test(url.pathname)) return "download";
      if (/\.git\/?$/i.test(url.pathname) || /^(?:www\.)?(?:github|gitlab|bitbucket)\.(?:com|org)$/i.test(url.hostname) || url.pathname.includes("/_git/")) return "git";
    } catch { /* Keep incomplete URLs editable. */ }
    return "download";
  }
  return "git";
}

export function SourceField({ value, onChange, onBrowse, disabled, zh, mode: fixedMode, allowDownload = true }: { value: string; onChange: (value: string) => void; onBrowse?: () => void; disabled?: boolean; zh: boolean; mode?: SourceMode; allowDownload?: boolean }) {
  const id = useId();
  const t = (zhText: string, enText: string) => zh ? zhText : enText;
  const resolveMode = (value: string): SourceMode => { const detected = sourceMode(value); return detected === "download" && !allowDownload ? "git" : detected; };
  const [mode, setMode] = useState<SourceMode>(() => fixedMode ?? resolveMode(value));
  const drafts = useRef<Record<SourceMode, string>>({ git: "", download: "", local: "", [fixedMode ?? resolveMode(value)]: value });
  const lastValue = useRef(value);
  useEffect(() => {
    if (value === lastValue.current && (!fixedMode || fixedMode === mode)) return;
    const nextMode = fixedMode ?? (value.trim() ? resolveMode(value) : mode);
    drafts.current[nextMode] = value;
    lastValue.current = value;
    setMode(nextMode);
  }, [value, fixedMode, mode, allowDownload]);
  function change(value: string) {
    drafts.current[mode] = value;
    lastValue.current = value;
    onChange(value);
  }
  function select(value: string) {
    if (value === "download" && !allowDownload) return;
    if (value !== "git" && value !== "download" && value !== "local") return;
    drafts.current[mode] = lastValue.current;
    setMode(value);
    lastValue.current = drafts.current[value];
    onChange(drafts.current[value]);
  }
  const labels = { git: t("仓库地址", "Repository address"), download: t("下载地址", "Download URL"), local: t("技能目录", "Skill folder") };
  const placeholders = { git: t("仓库简称或完整 Git 地址", "Repository shorthand or full Git address"), download: t("SKILL.md 或技能压缩包的下载链接", "Download URL for SKILL.md or a skill archive"), local: t("单个技能或包含多个技能的目录", "Folder containing one or more skills") };
  const examples = { git: "vercel-labs/skills · https://github.com/vercel-labs/skills", download: "https://example.com/skill.zip", local: "~/projects/my-skills" };
  return <FieldGroup className="gap-4">
    {!fixedMode && <Field className="gap-2"><FieldLabel id={`${id}-source`}>{t("安装来源", "Installation source")}</FieldLabel><ToggleGroup type="single" variant="outline" size="sm" spacing={0} disabled={disabled} value={mode} onValueChange={select} aria-labelledby={`${id}-source`} className="w-full"><ToggleGroupItem value="git" className="flex-1">{t("Git 仓库", "Git repository")}</ToggleGroupItem>{allowDownload && <ToggleGroupItem value="download" className="flex-1">{t("下载链接", "Download URL")}</ToggleGroupItem>}<ToggleGroupItem value="local" className="flex-1">{t("本地目录", "Local folder")}</ToggleGroupItem></ToggleGroup></Field>}
    <Field className="gap-2"><FieldLabel htmlFor={id}>{labels[mode]}</FieldLabel><div className="flex min-w-0 flex-wrap items-center gap-2"><Input className="min-w-0 flex-1" id={id} name="skill-source" autoComplete="off" spellCheck={false} disabled={disabled} value={value} onChange={event => change(event.target.value)} placeholder={placeholders[mode]} aria-describedby={`${id}-example`} />{mode === "local" && onBrowse && <Button variant="outline" disabled={disabled} onClick={onBrowse}><FolderOpenIcon data-icon="inline-start" aria-hidden="true" />{t("选择目录", "Choose folder")}</Button>}</div><FieldDescription id={`${id}-example`} className="break-all text-[0.6875rem] text-muted-foreground/65">{t("示例：", "Example: ")}{examples[mode]}</FieldDescription></Field>
  </FieldGroup>;
}
