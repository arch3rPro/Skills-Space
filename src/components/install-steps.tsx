import { useId } from "react";
import { BulkSelectionBar } from "@/components/bulk-selection-bar";
import { InstallSkillOption } from "@/components/install-skill-option";
import { SourceField } from "@/components/source-field";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function InstallSourceStep({ includeInternal, onIncludeInternal, ...props }: ComponentProps<typeof SourceField> & {
  includeInternal: boolean;
  onIncludeInternal: (include: boolean) => void;
}) {
  const id = useId();
  return <>
    <SourceField {...props}/>
    <details>
      <summary className="cursor-pointer text-xs text-muted-foreground">{props.zh ? "更多设置" : "More settings"}</summary>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <Checkbox disabled={props.disabled} checked={includeInternal} onCheckedChange={value => onIncludeInternal(value === true)} aria-describedby={id}/>
        {props.zh ? "显示内部技能" : "Show internal skills"}
      </label>
      <p id={id} className="mt-2 text-xs text-muted-foreground">{props.zh ? "显示安装来源中默认隐藏的内部技能，供选择安装" : "Show internal skills hidden by default in the installation source so you can select them for installation."}</p>
    </details>
  </>;
}

export function InstallSelectionStep({ skills, selected, onSelect, disabled, zh, warnings, skillFilter, fill }: {
  skills: ComponentProps<typeof InstallSkillOption>["skill"][];
  selected: string[];
  onSelect: (selected: string[]) => void;
  disabled: boolean;
  zh: boolean;
  warnings?: string[];
  skillFilter?: string | null;
  fill?: boolean;
}) {
  return <div className={cn("flex min-w-0 flex-col gap-2", fill && "min-h-0 flex-1")}>
    {skillFilter && <p className="text-xs text-muted-foreground">{zh ? "来源指定的技能" : "Skill specified by source"} · {skillFilter}</p>}
    {!!warnings?.length && <details><summary className="text-sm">{zh ? "预览限制" : "Preview limitations"}</summary><pre className="whitespace-pre-wrap break-words text-xs">{warnings.join("\n")}</pre></details>}
    <BulkSelectionBar count={selected.length} disabled={disabled} zh={zh} onSelectAll={() => onSelect(skills.map(skill => skill.name))}
      onInvert={() => onSelect(skills.filter(skill => !selected.includes(skill.name)).map(skill => skill.name))}/>
    <div className={cn("grid auto-rows-max content-start gap-3 overflow-y-auto overscroll-contain p-1 sm:grid-cols-2", fill ? "min-h-0 flex-1" : "max-h-[50vh]")}>
      {skills.map(skill => <InstallSkillOption key={skill.name} skill={skill} checked={selected.includes(skill.name)} disabled={disabled} zh={zh}
        onChange={checked => onSelect(checked ? [...selected.filter(name => name !== skill.name), skill.name] : selected.filter(name => name !== skill.name))}/>)}
    </div>
  </div>;
}
