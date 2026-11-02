import { useState, type ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Card actions can keep a fixed proxy while their disabled state changes.
export function Hint({ text, children, disabled = false, focusable = false, stable = false, side, align }: {
  text?: string;
  children: ReactElement;
  disabled?: boolean;
  focusable?: boolean;
  stable?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  if (!text) return children;
  return <Tooltip open={open} onOpenChange={setOpen}>
    <TooltipTrigger asChild tabIndex={focusable ? 0 : undefined}
      onPointerDown={() => setOpen(false)}
      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setOpen(false); }}>
      {disabled || stable ? <span className="inline-flex max-w-full" tabIndex={disabled || focusable ? 0 : undefined} data-hint-disabled={disabled ? "" : undefined}>{children}</span> : children}
    </TooltipTrigger>
    <TooltipContent side={side} align={align}>{text}</TooltipContent>
  </Tooltip>;
}
