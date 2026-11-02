import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { HelpPopover } from "@/components/help-popover";
import type { SyncOptions } from "@/lib/upstream";

export function ProjectImportOptions({ options, include, exclude, disabled, zh, onChange }: {
  options: SyncOptions; include: string; exclude: string; disabled: boolean; zh: boolean;
  onChange: (value: { options: SyncOptions; include: string; exclude: string }) => void;
}) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const fields = [
    { key: "recursive", label: t("包含子项目", "Include subprojects"), help: t("同时查找工作区子项目依赖中提供的技能。", "Also find skills provided by workspace subproject dependencies.") },
    { key: "remote", label: t("包含 Git 来源", "Include Git sources"), help: t("同时处理项目或依赖包在 package.json 的 skills 字段中声明的 Git 技能。", "Also process Git skills declared in the project or dependency package's package.json skills field.") },
    { key: "cleanup", label: t("清理失效技能", "Remove stale skills"), help: t("删除已不再使用的项目技能。可能影响共用目录的其他智能体，确认前会列出删除清单。", "Remove stale project skills. This may affect other Agents sharing the folder; review the removal list before confirming.") },
  ] as const;
  return <details>
    <summary className="w-fit cursor-pointer rounded-sm text-xs text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring">{t("更多设置", "More settings")}</summary>
    <FieldGroup className="mt-4">
      {fields.map(field => <Field key={field.key} orientation="horizontal">
        <Checkbox id={`project-import-${field.key}`} disabled={disabled} checked={options[field.key]} onCheckedChange={value => onChange({ options: { ...options, [field.key]: value === true }, include, exclude })} />
        <div className="flex items-center gap-1"><FieldLabel htmlFor={`project-import-${field.key}`}>{field.label}</FieldLabel><HelpPopover label={field.label}><p>{field.help}</p></HelpPopover></div>
      </Field>)}
      {(["include", "exclude"] as const).map(key => {
        const label = key === "include" ? t("仅包含", "Include only") : t("排除", "Exclude");
        return <Field key={key}>
          <div className="flex items-center gap-1"><FieldLabel htmlFor={`project-import-${key}`}>{label}</FieldLabel><HelpPopover label={label}>
            <p>{key === "include" ? t("只安装匹配的技能，留空表示全部。", "Only install matching skills; leave empty for all.") : t("跳过匹配的技能，排除优先于包含。", "Skip matching skills; exclusion takes precedence.")}</p>
            <p>{t("填写包名，或“包名#技能名”。多个规则用逗号分隔。", "Enter a package name or package#skill. Separate patterns with commas.")}</p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
              <dt><code>my-tools</code></dt><dd>{t("这个包的全部技能", "All skills in this package")}</dd>
              <dt><code>my-tools#review</code></dt><dd>{t("这个包的 review 技能", "The package's review skill")}</dd>
              <dt><code>my-tools#test-*</code></dt><dd>{t("这个包内以 test- 开头的技能", "Skills starting with test- in this package")}</dd>
              <dt><code>.#review</code></dt><dd>{t("项目自己声明的 review 技能", "The project's own review declaration")}</dd>
            </dl>
          </HelpPopover></div>
          <Input id={`project-import-${key}`} name={`project-import-${key}`} autoComplete="off" spellCheck={false} disabled={disabled} placeholder={t("例如 my-tools#review", "e.g. my-tools#review")} value={key === "include" ? include : exclude} onChange={event => onChange({ options, include: key === "include" ? event.target.value : include, exclude: key === "exclude" ? event.target.value : exclude })} />
        </Field>;
      })}
    </FieldGroup>
  </details>;
}
