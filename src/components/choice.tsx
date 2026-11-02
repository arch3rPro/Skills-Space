import type { LucideIcon } from "lucide-react";
import { AgentLogo } from "@/components/agent-logo";
import { cn } from '@/lib/utils';
import { FilterSelectSizer, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function Choice({ id, label, value, options, onChange, disabled, className, placeholder, fit = false }: { id?: string; label: string; value: string; options: Array<{ value: string; label: string; agentId?: string; icon?: LucideIcon }>; onChange: (value: string) => void; disabled?: boolean; className?: string; placeholder?: string; fit?: boolean }) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id} aria-label={label} className={cn(className,fit&&'choice-fit')}>{(fit||className?.includes('filter-trigger'))&&<FilterSelectSizer>{options.map(option=><span className="flex items-center gap-1.5">{(option.agentId||option.icon)&&<span className="size-4 shrink-0"/>}{option.label}</span>)}</FilterSelectSizer>}<SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent position="popper" className={fit?'min-w-0 max-w-[min(20rem,var(--radix-select-content-available-width))]':undefined}><SelectGroup>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.agentId && <AgentLogo name={option.agentId} size={16} />}{option.icon && <option.icon aria-hidden="true" />}<span className="truncate">{option.label}</span></SelectItem>)}</SelectGroup></SelectContent></Select>;
}
