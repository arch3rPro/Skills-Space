import { useId } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { OverflowText } from "@/components/overflow-text";
import type { Inspection } from "@/lib/upstream";

export function InstallSkillOption({ skill, checked, disabled, zh, onChange }: { skill: Inspection["skills"][number]; checked: boolean; disabled: boolean; zh: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return <Card size="sm" variant="selection" data-state={checked ? "checked" : "unchecked"} data-disabled={disabled || undefined} role="group" aria-labelledby={id} onClick={event => {
    if (disabled || event.target instanceof Element && event.target.closest("[data-slot=checkbox], input")) return;
    onChange(!checked);
  }}>
    <CardHeader>
      <div className="flex min-w-0 items-center gap-3"><Checkbox disabled={disabled} checked={checked} aria-labelledby={id} onCheckedChange={value => onChange(value === true)} /><CardTitle id={id} className="min-w-0 flex-1"><OverflowText className="block truncate" text={skill.name} /></CardTitle></div>
      <CardDescription className="pl-7"><OverflowText className="line-clamp-2 min-h-10 break-words text-xs leading-5" text={skill.description || (zh ? "暂无描述" : "No description")} /></CardDescription>
    </CardHeader>
    {(skill.pluginName || skill.internal || skill.downloadUrl && skill.fileCount !== null) && <CardContent className="flex min-h-5 items-center gap-2 overflow-hidden pl-9">
      {skill.pluginName && <Badge className="max-w-28" variant="secondary"><OverflowText className="truncate" text={skill.pluginName} /></Badge>}
      {skill.internal && <Badge variant="outline">{zh ? "内部技能" : "Internal"}</Badge>}
      {skill.downloadUrl && skill.fileCount !== null && <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{skill.fileCount} {zh ? "个文件" : "files"}</span>}
    </CardContent>}
  </Card>;
}
