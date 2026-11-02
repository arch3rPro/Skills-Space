import { useState, type ReactElement, type ReactNode } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
export type MenuAction = { label: string; run: () => void; icon: ReactNode; disabled?: boolean; destructive?: boolean };
export function ActionMenu({ label, groups, disabled = false, compact = false, fitContent = compact, trigger }: { label: string; groups: MenuAction[][]; disabled?: boolean; compact?: boolean; fitContent?: boolean; trigger?: ReactElement }) {
  const [open,setOpen]=useState(false);
  if (!groups.some(group => group.length > 0)) return null;
  return <DropdownMenu open={open} onOpenChange={setOpen}><DropdownMenuTrigger asChild>{trigger ?? <Button variant={compact ? "ghost" : "outline"} size={compact ? "icon-sm" : "icon"} className={compact ? "shrink-0 hover:bg-transparent data-[state=open]:bg-transparent" : "shrink-0"} aria-label={label} disabled={disabled}><MoreHorizontalIcon aria-hidden="true" /></Button>}</DropdownMenuTrigger><DropdownMenuContent side="bottom" align="end" className={fitContent ? "w-max min-w-0 max-w-[calc(100vw-2rem)]" : "w-max min-w-48 max-w-[calc(100vw-2rem)]"}>{groups.filter(group => group.length).map((group,index) => <DropdownMenuGroup key={index}>{index > 0 && <DropdownMenuSeparator />}{group.map(action => <DropdownMenuItem key={action.label} disabled={action.disabled} variant={action.destructive ? "destructive" : "default"} className="min-h-9 gap-2 px-2" onSelect={()=>{setOpen(false);action.run();}}><span className="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">{action.icon}</span><span className="min-w-0 text-left leading-5">{action.label}</span></DropdownMenuItem>)}</DropdownMenuGroup>)}</DropdownMenuContent></DropdownMenu>;
}
