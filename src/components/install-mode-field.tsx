import { HelpPopover } from "@/components/help-popover";
import { CopyIcon, LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useId } from "react";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { InstallMode } from "@/lib/upstream";

export function InstallModeField({ mode, onChange, zh, disabled, copyOnly = false, description, compact = false, copyReason }: { mode: InstallMode; onChange: (mode: InstallMode) => void; zh: boolean; disabled: boolean; copyOnly?: boolean; description?: string; compact?: boolean; copyReason?: string }) {
  const id = useId();
  const t = (cn: string, en: string) => zh ? cn : en;
  return <Field orientation={compact ? "vertical" : "responsive"} className={compact ? "gap-2" : "gap-4"}>
    <FieldContent><div className={cn("flex items-center gap-1", compact && "h-5")}><FieldLabel id={id} className={compact ? "text-xs text-muted-foreground" : undefined}>{t("安装模式", "Installation mode")}</FieldLabel>{compact && <span className="inline-flex size-5 shrink-0 items-center justify-center">{copyOnly && copyReason && <HelpPopover label={t("为何使用文件复制", "Why file copies")}><p>{copyReason}</p></HelpPopover>}</span>}</div>{description && <FieldDescription id={`${id}-help`}>{description}</FieldDescription>}</FieldContent>
    <ToggleGroup type="single" value={copyOnly ? "copy" : mode} disabled={disabled} onValueChange={value => { if (value === "copy" || value === "symlink") onChange(value); }} size={compact ? "sm" : "default"} className={cn("segmented-control shrink-0", compact && "w-full")} aria-labelledby={id} aria-describedby={description ? `${id}-help` : undefined}>
      <ToggleGroupItem className={compact ? "flex-1" : undefined} value="symlink" disabled={copyOnly}><LinkIcon aria-hidden="true" />{t("符号链接", "Symbolic links")}</ToggleGroupItem>
      <ToggleGroupItem className={compact ? "flex-1" : undefined} value="copy"><CopyIcon aria-hidden="true" />{t("文件复制", "File copies")}</ToggleGroupItem>
    </ToggleGroup>
  </Field>;
}
