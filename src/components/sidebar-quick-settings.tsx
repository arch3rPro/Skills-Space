import { Hint } from "@/components/hint";
import { useEffect, useState, type ComponentProps } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckIcon, LanguagesIcon, MonitorIcon, MoonIcon, PaletteIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { themePresets } from "@/lib/appearance";
import type { Preferences } from "@/lib/upstream";

export const sidebarFooterButtonClassName = "h-8 w-full min-w-0 gap-1 px-1 text-xs [&_svg]:size-3.5 data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:[&_svg]:size-4 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:[&>span]:hidden";

export function SidebarFooterHint(props: Omit<ComponentProps<typeof Hint>, "side">) {
  const { state } = useSidebar();
  return <Hint {...props} side={state === "collapsed" ? "right" : "top"} />;
}

export function SidebarQuickSettings({ preferences, disabled, onChange }: { preferences: Preferences; disabled: boolean; onChange: (change: Partial<Preferences>) => void }) {
  const zh = preferences.language !== "en";
  const t = (cn: string, en: string) => zh ? cn : en;
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const dark = preferences.theme === "dark" || preferences.theme === "system" && systemDark;
  return <>
    <Popover>
      <SidebarFooterHint text={t("主题与显示模式", "Theme and display mode")} disabled={disabled}><PopoverTrigger asChild><Button size="sm" variant="ghost" className={sidebarFooterButtonClassName} disabled={disabled} aria-label={t("外观", "Appearance")}><PaletteIcon aria-hidden="true" /><span className="text-xs">{t("外观", "Theme")}</span></Button></PopoverTrigger></SidebarFooterHint>
      <PopoverContent side="top" align="center" className="w-80 p-4" aria-label={t("外观", "Appearance")}>
        <h2 className="mb-4 text-sm font-semibold">{t("外观", "Appearance")}</h2>
        <p id="quick-display-label" className="mb-2 text-xs text-muted-foreground">{t("显示模式", "Display mode")}</p>
        <ToggleGroup type="single" value={preferences.theme} disabled={disabled} aria-labelledby="quick-display-label" className="segmented-control w-full" onValueChange={theme => { if (theme) onChange({ theme }); }}>
          <ToggleGroupItem className="flex-1" value="light"><SunIcon aria-hidden="true" />{t("浅色", "Light")}</ToggleGroupItem>
          <ToggleGroupItem className="flex-1" value="dark"><MoonIcon aria-hidden="true" />{t("深色", "Dark")}</ToggleGroupItem>
          <ToggleGroupItem className="flex-1" value="system"><MonitorIcon aria-hidden="true" />{t("系统", "System")}</ToggleGroupItem>
        </ToggleGroup>
        <fieldset disabled={disabled} className="mt-4"><legend className="mb-2 text-xs text-muted-foreground">{t("配色主题", "Color theme")}</legend>
          <div className="grid grid-cols-2 gap-2">{themePresets.map(preset => {
            const selected = preferences.colorTheme === preset.id;
            const colors = dark ? preset.dark : preset.light;
            return <label key={preset.id} className="theme-option flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2 py-2.5" data-selected={selected}>
              <input className="sr-only" type="radio" name="quick-color-theme" value={preset.id} checked={selected} onChange={() => onChange({ colorTheme: preset.id })} />
              <span aria-hidden="true" className="size-3 shrink-0 rounded-full border" style={{ backgroundColor: colors.primary, borderColor: colors.border }} />
              <span className="min-w-0 flex-1 truncate text-xs">{preset.label}</span>
              {selected && <CheckIcon aria-hidden="true" className="size-3 shrink-0" />}
            </label>;
          })}</div>
        </fieldset>
      </PopoverContent>
    </Popover>
    <DropdownMenu><SidebarFooterHint text={t("语言", "Language")} disabled={disabled}><DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className={sidebarFooterButtonClassName} disabled={disabled} aria-label={t("语言", "Language")}><LanguagesIcon aria-hidden="true" /><span>{zh ? "中文" : "EN"}</span></Button></DropdownMenuTrigger></SidebarFooterHint>
      <DropdownMenuContent side="top" align="end" className="min-w-36"><DropdownMenuRadioGroup value={preferences.language} onValueChange={language => onChange({ language })}><DropdownMenuRadioItem className="min-h-9" value="zh-CN">简体中文</DropdownMenuRadioItem><DropdownMenuRadioItem className="min-h-9" value="en">English</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent>
    </DropdownMenu>
  </>;
}
