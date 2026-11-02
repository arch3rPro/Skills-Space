import { SkillBatchToggleControls } from "@/components/skill-batch-toggle-controls";
import { useState } from "react";
import { Hint } from "@/components/hint";
import { BulkSelectionBar } from "@/components/bulk-selection-bar";
import { HandIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from "@/components/ui/dropdown-menu";
export type PiBatchAction = "enable" | "disable" | "auto" | "manual";
export function PiBatchActions({count,disabled,canEnable,canDisable,canAuto,canManual,zh,onAction,onSelectAll,onInvert}: {count:number;disabled:boolean;canEnable:boolean;canDisable:boolean;canAuto:boolean;canManual:boolean;zh:boolean;onAction:(action:PiBatchAction)=>void;onSelectAll:()=>void;onInvert:()=>void}) {
  return <BulkSelectionBar framed count={count} disabled={disabled} zh={zh} onSelectAll={onSelectAll} onInvert={onInvert}>
    <PiBatchControls count={count} disabled={disabled} canEnable={canEnable} canDisable={canDisable} canAuto={canAuto} canManual={canManual} zh={zh} onAction={onAction} />
  </BulkSelectionBar>;
}

export function PiBatchControls({count,disabled,canEnable,canDisable,canAuto,canManual,zh,onAction,allowInvocation=true}: {count:number;disabled:boolean;canEnable:boolean;canDisable:boolean;canAuto:boolean;canManual:boolean;zh:boolean;onAction:(action:PiBatchAction)=>void;allowInvocation?:boolean}) {
  const t=(cn:string,en:string)=>zh?cn:en;
  const [open,setOpen]=useState(false);
  const canSetInvocation=canAuto||canManual;
  const invoke=(action:PiBatchAction)=>{setOpen(false);onAction(action);};
  return <>
    <SkillBatchToggleControls count={count} disabled={disabled} canEnable={canEnable} canDisable={canDisable} zh={zh} onChange={enabled=>onAction(enabled?"enable":"disable")} />
    {allowInvocation && <DropdownMenu open={open} onOpenChange={setOpen}><Hint text={!canSetInvocation?t("所选技能没有可修改的调用方式","No selected invocation settings can be changed"):undefined} disabled={disabled||!count||!canSetInvocation}><DropdownMenuTrigger asChild><Button size="sm" variant="secondary" disabled={disabled||!count||!canSetInvocation}><HandIcon data-icon="inline-start" aria-hidden="true" />{t("调用方式","Invocation")}</Button></DropdownMenuTrigger></Hint><DropdownMenuContent align="start" className="w-max min-w-0 max-w-[calc(100vw-2rem)]"><DropdownMenuGroup><DropdownMenuItem disabled={!canAuto} onSelect={()=>invoke("auto")}><SparklesIcon aria-hidden="true" />{t("自动选择","Automatic selection")}</DropdownMenuItem><DropdownMenuItem disabled={!canManual} onSelect={()=>invoke("manual")}><HandIcon aria-hidden="true" />{t("手动调用","Manual invocation")}</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>}
  </>;
}
