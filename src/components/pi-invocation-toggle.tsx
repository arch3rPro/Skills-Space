import { HandIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { PiSkillState } from "@/lib/pi";
import { piInvocationReason } from "@/lib/pi";

export function PiInvocationToggle({ state, disabled, readOnly, zh, onChange }: { state: PiSkillState; disabled: boolean; readOnly?: boolean; zh: boolean; onChange: (manual: boolean) => void }) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const editable = state.canSetVisibility && !readOnly;
  const unavailable = disabled || !editable;
  const label = state.manualOnly ? t("手动调用", "Manual invocation") : t("自动选择", "Automatic selection");
  const control = <Button variant="ghost" size="icon-sm" data-preserve-appearance={!!editable} disabled={unavailable} aria-label={`${state.name} · ${label}`} aria-pressed={state.manualOnly} onClick={()=>{if(!unavailable)onChange(!state.manualOnly);}}><span className="invocation-glyph" data-manual={state.manualOnly} aria-hidden="true"><HandIcon data-invocation-icon="manual" /><SparklesIcon data-invocation-icon="auto" /></span></Button>;
  return <Tooltip><TooltipTrigger asChild><span className="inline-flex" tabIndex={unavailable ? 0 : undefined}>{control}</span></TooltipTrigger><TooltipContent tone="surface">{piInvocationReason(state,zh)}</TooltipContent></Tooltip>;
}
