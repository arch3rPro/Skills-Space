import { useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function OverflowText({ text, displayText = text, className }: { text: string; displayText?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setOverflow(displayText !== text || element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    let active = true;
    void document.fonts.ready.then(() => { if (active) measure(); });
    return () => { active = false; observer.disconnect(); };
  }, [text, displayText, className]);
  return <TooltipProvider delayDuration={1000} skipDelayDuration={0}><Tooltip><TooltipTrigger asChild><span ref={ref} className={className} tabIndex={overflow ? 0 : undefined}>{displayText}</span></TooltipTrigger>{overflow && <TooltipContent tone="surface" align="start" className="max-w-[min(28rem,calc(100vw-2rem))]"><span className="block max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6">{text}</span></TooltipContent>}</Tooltip></TooltipProvider>;
}
