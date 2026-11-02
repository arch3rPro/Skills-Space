import { OverflowText } from "@/components/overflow-text";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export function BulkSelectionBar({count,disabled,zh,onSelectAll,onInvert,children,framed=false,summaryLabel,selectionNames}: {count:number;disabled:boolean;zh:boolean;onSelectAll:()=>void;onInvert:()=>void;children?:ReactNode;framed?:boolean;summaryLabel?:string;selectionNames?:string}) {
  return <div className={cn("flex min-w-0 max-w-full shrink-0 items-center gap-3 overflow-x-auto overflow-y-hidden py-1",framed&&"rounded-lg border bg-muted/30 px-3 py-2")}>
    <div className="flex shrink-0 items-center gap-2"><Button size="sm" variant="ghost" disabled={disabled} onClick={onSelectAll}>{zh?"全选":"Select all"}</Button><Button size="sm" variant="ghost" disabled={disabled} onClick={onInvert}>{zh?"反选":"Invert selection"}</Button>{children}</div>
    {selectionNames && <OverflowText className="min-w-0 flex-1 truncate text-xs text-muted-foreground" text={selectionNames} />}
    <span className="ml-auto shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground" aria-live="polite">{summaryLabel??(zh?"已选":"Selected")} {count}</span>
  </div>;
}
