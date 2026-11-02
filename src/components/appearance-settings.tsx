import { useEffect, useState } from "react";
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Field, FieldContent, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Hint } from "@/components/hint";
import { themePresets, fontChoices } from "@/lib/appearance";
import type { Preferences } from "@/lib/upstream";

export function AppearanceSettings({ preferences, disabled, onChange }: { preferences: Preferences; disabled: boolean; onChange: (change: Partial<Preferences>) => void }) {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => { const media = window.matchMedia("(prefers-color-scheme: dark)"); const update = () => setSystemDark(media.matches); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const zh = preferences.language === "zh-CN";
  const t = (cn: string, en: string) => zh ? cn : en;
  const dark = preferences.theme === "dark" || preferences.theme === "system" && systemDark;
  return <div className="appearance-settings flex w-full flex-col gap-4">
    <Card size="sm"><CardContent><FieldGroup className="settings-fields">
      <Field orientation="horizontal">
        <FieldContent><FieldLabel htmlFor="appearance-language">{t("语言", "Language")}</FieldLabel></FieldContent>
        <Select value={preferences.language} disabled={disabled} onValueChange={language => onChange({ language })}><SelectTrigger id="appearance-language" className="w-44 shrink-0"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="zh-CN">简体中文</SelectItem><SelectItem value="en">English</SelectItem></SelectGroup></SelectContent></Select>
      </Field>
      <Field orientation="horizontal">
        <FieldContent><FieldLabel id="appearance-mode-label">{t("显示模式", "Display mode")}</FieldLabel></FieldContent>
        <ToggleGroup type="single" variant="preview" size="default" value={preferences.theme} disabled={disabled} onValueChange={theme => { if (theme) onChange({ theme }); }} aria-labelledby="appearance-mode-label" className="shrink-0">
          {[{mode:"system",label:t("跟随系统", "System"),icon:MonitorIcon},{mode:"light",label:t("浅色", "Light"),icon:SunIcon},{mode:"dark",label:t("深色", "Dark"),icon:MoonIcon}].map(({mode,label,icon:Icon})=><ToggleGroupItem key={mode} value={mode} aria-label={label}><Icon aria-hidden="true" />{label}</ToggleGroupItem>)}
        </ToggleGroup>
      </Field>
    </FieldGroup></CardContent></Card>
    <Card size="sm"><CardContent><FieldSet disabled={disabled}>
      <FieldLegend className="sr-only" variant="label">{t("配色主题", "Color theme")}</FieldLegend>
      <div className="appearance-theme-group">
      <span className="text-sm font-medium" aria-hidden="true">{t("配色主题", "Color theme")}</span>
      <div className="theme-grid grid grid-cols-2 gap-3">
        {themePresets.map(preset => {
          const colors = dark ? preset.dark : preset.light;
          const selected = preferences.colorTheme === preset.id;
          return <label key={preset.id} className="theme-option relative flex min-w-0 cursor-pointer flex-col gap-2 rounded-xl border p-2" data-selected={selected}>
            <input type="radio" name="color-theme" value={preset.id} aria-label={preset.label} checked={selected} disabled={disabled} onChange={() => onChange({colorTheme:preset.id})} className="sr-only" />
            <span aria-hidden="true" className="flex h-14 overflow-hidden rounded-md border" style={{backgroundColor:colors.background,borderColor:colors.border}}>
              <span className="flex w-1/4 flex-col gap-2 p-2" style={{backgroundColor:colors.sidebar}}><span className="h-1.5 rounded-sm" style={{backgroundColor:colors.primary}} /><span className="h-1.5 rounded-sm" style={{backgroundColor:colors.border}} /><span className="h-1.5 rounded-sm" style={{backgroundColor:colors.border}} /></span>
              <span className="flex flex-1 flex-col gap-2 p-2"><span className="h-1 w-2/3 rounded-sm" style={{backgroundColor:colors.foreground}} /><span className="flex flex-1 gap-1">{[0,1,2].map(i=><span key={i} className="flex-1 rounded-sm border" style={{backgroundColor:colors.card,borderColor:colors.border}} />)}</span><span className="h-1 w-1/2 rounded-sm" style={{backgroundColor:colors.primary}} /></span>
            </span>
            <span className="flex min-w-0 items-center justify-between gap-1 text-xs font-medium"><span className="truncate">{preset.label}</span>{selected && <CheckIcon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />}</span>
          </label>;
        })}
      </div>
      </div>
    </FieldSet></CardContent></Card>
    <Card size="sm"><CardContent><FieldGroup className="settings-fields">
      <Field orientation="horizontal">
        <FieldContent><FieldLabel htmlFor="appearance-font">{t("界面字体", "Interface font")}</FieldLabel></FieldContent>
        <Select value={preferences.fontFamily} disabled={disabled} onValueChange={fontFamily => onChange({ fontFamily })}><SelectTrigger id="appearance-font" className="w-44 shrink-0"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{fontChoices.map(font => <SelectItem key={font.id} value={font.id}>{font.id === "system" ? t("系统字体", "System") : font.id === "serif" ? t("衬线字体", "Serif") : font.id === "mono" ? t("等宽字体", "Monospace") : font.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
      </Field>
      <Field orientation="horizontal">
        <FieldContent><FieldLabel id="appearance-size-label">{t("界面字号", "Text size")}</FieldLabel></FieldContent>
        <ToggleGroup type="single" value={String(preferences.fontSize)} disabled={disabled} onValueChange={value=>{if(value)onChange({fontSize:Number(value)});}} aria-labelledby="appearance-size-label" className="segmented-control shrink-0" size="sm">{[14,16,18].map(size=><Hint key={size} text={`${size}px`} stable><ToggleGroupItem value={String(size)}>{size===14?t("较小", "Smaller"):size===16?t("默认", "Default"):t("较大", "Larger")}</ToggleGroupItem></Hint>)}</ToggleGroup>
      </Field>
    </FieldGroup></CardContent></Card>
  </div>;
}
