import { BulkSelectionBar } from "@/components/bulk-selection-bar";
import { selectVisible } from "@/lib/selection";
import { useId, useState } from "react";
import { AgentStatusBadge } from "@/components/agent-status-badge";
import { AgentLogo } from "@/components/agent-logo";
import { SearchIcon } from "lucide-react";
import { FilterSelectSizer, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { displayHomePath, type Agent } from "@/lib/upstream";

export function AgentPicker({ label, agents, selected, disabled, zh, home, onChange, fill = false, unavailable, defaultStatus = "all" }: { label?: string; agents: Agent[]; selected: string[]; disabled: boolean; zh: boolean; home: string; onChange: (ids: string[]) => void; fill?: boolean; unavailable?: Record<string, { installed: boolean; reason: string }>; defaultStatus?: "all" | Agent["installationStatus"] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | Agent["installationStatus"]>(defaultStatus);
  const id = useId();
  const t = (cn: string, en: string) => zh ? cn : en;
  const selectedTargets = selected.filter(agent => !unavailable?.[agent]);
  const items = agents.filter(a => (status === "all" || a.installationStatus === status) && `${a.name} ${a.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <FieldSet disabled={disabled} className={cn("gap-3", fill && "flex-1")}>
    <FieldLegend className="mb-0">{label ?? t("选择 Agent", "Choose Agents")}</FieldLegend>
    <div className="flex min-w-0 flex-wrap items-center gap-2"><Field className="min-w-48 flex-1 gap-1"><FieldLabel htmlFor={id} className="sr-only">{t("搜索安装目标", "Search target Agents")}</FieldLabel><div className="relative"><SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input id={id} type="search" autoComplete="off" className="pl-9" disabled={disabled} placeholder={t("搜索智能体…", "Search Agents…")} value={query} onChange={e => setQuery(e.target.value)} /></div></Field>
      <Select value={status} disabled={disabled} onValueChange={value => { if (value === "all" || value === "confirmed" || value === "configurationOnly" || value === "notFound") setStatus(value); }}><SelectTrigger className="filter-trigger" aria-label={t("按安装状态筛选 Agent", "Filter Agents by installation status")}><FilterSelectSizer>{[t("全部","All"),t("已安装","Installed"),t("发现配置","Configuration found"),t("未安装","Not installed")]}</FilterSelectSizer><SelectValue /></SelectTrigger><SelectContent position="popper"><SelectGroup><SelectItem value="all">{t("全部", "All")}</SelectItem><SelectItem value="confirmed">{t("已安装", "Installed")}</SelectItem><SelectItem value="configurationOnly">{t("发现配置", "Configuration found")}</SelectItem><SelectItem value="notFound">{t("未安装", "Not installed")}</SelectItem></SelectGroup></SelectContent></Select>
    </div>
    <div className={cn("agent-picker grid min-w-0 auto-rows-[minmax(3.5rem,max-content)] min-h-24 content-start gap-1 overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl bg-card p-1 sm:grid-cols-3", fill ? "flex-1" : "max-h-64")}>
      {items.map(agent => {
        const blocked = unavailable?.[agent.id];
        const reasonId = `${id}-${agent.id}-reason`;
        const row = <label key={agent.id} tabIndex={blocked ? 0 : undefined} className={cn("flex min-w-0 cursor-pointer items-center gap-3 rounded-lg px-3 py-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring", selectedTargets.includes(agent.id) && "bg-muted", blocked && "cursor-not-allowed hover:bg-transparent")}>
          <Checkbox aria-label={agent.name} aria-describedby={blocked ? reasonId : undefined} variant={blocked?.installed ? "muted" : "default"} disabled={disabled || !!blocked} checked={blocked ? blocked.installed : selectedTargets.includes(agent.id)} onCheckedChange={checked => { if (!blocked) onChange(checked === true ? [...selectedTargets, agent.id] : selectedTargets.filter(id => id !== agent.id)); }} />
          <span className="flex size-7 shrink-0 items-center justify-center"><AgentLogo name={agent.id} size={22} /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{agent.name}</span><AgentStatusBadge agent={agent} zh={zh} hint={!blocked && agent.installationEvidence ? displayHomePath(agent.installationEvidence, home) : undefined} /></span>
          {blocked && <span id={reasonId} className="sr-only">{blocked.reason}</span>}
        </label>;
        return blocked ? <Tooltip key={agent.id}><TooltipTrigger asChild>{row}</TooltipTrigger><TooltipContent tone="surface" side="top">{blocked.reason}</TooltipContent></Tooltip> : row;
      })}
      {!items.length && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">{t("没有匹配的 Agent", "No matching Agents")}</p>}
    </div>
    <BulkSelectionBar count={selectedTargets.length} disabled={disabled} zh={zh} summaryLabel={unavailable ? t("本次同步", "Sync targets") : undefined} selectionNames={agents.filter(a=>selectedTargets.includes(a.id)).map(a=>a.name).join(" · ")} onSelectAll={()=>onChange(selectVisible(selectedTargets,items.filter(a=>!unavailable?.[a.id]).map(a=>a.id)))} onInvert={()=>onChange(selectVisible(selectedTargets,items.filter(a=>!unavailable?.[a.id]).map(a=>a.id),true))} />
  </FieldSet>;
}
