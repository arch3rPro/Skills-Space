import { useId, type ReactNode } from "react";
import { CircleHelpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

export function HelpPopover({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return <Popover>
    <PopoverTrigger asChild><Button variant="ghost" size="icon-xs" aria-label={label}><CircleHelpIcon aria-hidden="true" /></Button></PopoverTrigger>
    <PopoverContent align="start" aria-labelledby={id}>
      <PopoverHeader><PopoverTitle id={id}>{label}</PopoverTitle></PopoverHeader>
      <div className="flex flex-col gap-2 text-muted-foreground">{children}</div>
    </PopoverContent>
  </Popover>;
}
