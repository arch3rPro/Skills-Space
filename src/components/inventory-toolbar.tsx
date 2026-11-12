import { forwardRef, useLayoutEffect, useRef, type ComponentPropsWithoutRef, type ReactNode, type Ref } from "react";
import { ListChecksIcon, ListFilterIcon, LoaderCircleIcon, RefreshCwIcon, SearchCheckIcon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/hint";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Keep full labels until the rendered controls actually need more room. */
export function InventoryToolbar({ children, layout = "scroll" }: { children: ReactNode; layout?: "scroll" | "wrap" }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const toolbar = ref.current;
    if (!toolbar) return;
    let active = true;
    const fit = () => {
      if (!active || !toolbar.clientWidth) return;
      const groups = Array.from(toolbar.children);
      const gap = parseFloat(getComputedStyle(toolbar).columnGap) || 0;
      for (let level = 0; level <= 3; level++) {
        toolbar.dataset.compact = String(level);
        const widths = groups.map(group => group.getBoundingClientRect().width);
        const width = layout === "wrap" ? Math.max(0, ...widths) : widths.reduce((sum, width) => sum + width, 0) + Math.max(0, groups.length - 1) * gap;
        if (width <= toolbar.clientWidth) break;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(toolbar);
    void document.fonts.ready.then(fit);
    return () => { active = false; observer.disconnect(); };
  }, [children, layout]);

  // The horizontal scrollbar may appear when a filter changes its option set.
  // Keep it inside the existing gap below the row, outside normal flow.
  if (layout === "wrap") return <div ref={ref} data-compact="0" className="responsive-toolbar flex min-w-0 shrink-0 flex-wrap items-center gap-3 overflow-x-auto overflow-y-hidden py-0.5 [scrollbar-width:thin]">{children}</div>;
  return <div className="inventory-toolbar-frame relative min-w-0 shrink-0"><div ref={ref} data-compact="0" className="layout-toolbar responsive-toolbar absolute inset-x-0 top-0 flex items-center gap-3">{children}</div></div>;
}

export function InventoryToolbarSearch({ label, placeholder, value, onChange, inputRef }: { label: string; placeholder: string; value: string; onChange: (value: string) => void; inputRef?: Ref<HTMLInputElement> }) {
  return <div className="toolbar-search relative min-w-40 flex-1"><SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input ref={inputRef} autoComplete="off" spellCheck={false} type="search" className="pl-9" aria-label={label} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} /></div>;
}

type InventoryToolbarFilterTriggerProps = Omit<ComponentPropsWithoutRef<typeof Button>, "children" | "variant" | "size"> & { label: string; ariaLabel: string; count: number };

export const InventoryToolbarFilterTrigger = forwardRef<HTMLButtonElement, InventoryToolbarFilterTriggerProps>(function InventoryToolbarFilterTrigger({ label, ariaLabel, count, className, ...buttonProps }, ref) {
  return <Button {...buttonProps} ref={ref} variant="outline" size="sm" className={cn("w-24 justify-center", className)} aria-label={ariaLabel}><ListFilterIcon data-icon="inline-start" aria-hidden="true" />{label}{count > 0 && <span className="tabular-nums text-muted-foreground">{count}</span>}</Button>;
});

export function InventoryToolbarRefresh({ label, busy, disabled, onClick }: { label: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return <Hint text={label} disabled={disabled}><Button variant="ghost" className="toolbar-secondary-action" data-toolbar-priority="3" aria-label={label} aria-busy={busy} disabled={disabled} onClick={onClick}><RefreshCwIcon aria-hidden="true" className={busy ? "animate-spin motion-reduce:animate-none" : undefined} /><span className="toolbar-secondary-label">{label}</span></Button></Hint>;
}

export function InventoryToolbarCheckUpdates({ label, checking, disabled, onClick }: { label: string; checking: boolean; disabled: boolean; onClick: () => void }) {
  return <Hint text={label} disabled={disabled}><Button variant="ghost" className="toolbar-secondary-action" data-toolbar-priority="2" aria-label={label} aria-busy={checking} disabled={disabled} onClick={onClick}>{checking ? <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <SearchCheckIcon aria-hidden="true" />}<span className="toolbar-secondary-label">{label}</span></Button></Hint>;
}

export function InventoryToolbarBatchSelect({ label, cancelLabel, selecting, disabled, onClick, buttonRef }: { label: string; cancelLabel: string; selecting: boolean; disabled: boolean; onClick: () => void; buttonRef?: Ref<HTMLButtonElement> }) {
  const currentLabel = selecting ? cancelLabel : label;
  return <Hint text={currentLabel} disabled={disabled}><Button ref={buttonRef} className="toolbar-secondary-action" data-toolbar-priority="1" variant={selecting ? "secondary" : "ghost"} disabled={disabled} aria-label={currentLabel} aria-pressed={selecting} onClick={onClick}>{selecting ? <XIcon aria-hidden="true" /> : <ListChecksIcon aria-hidden="true" />}<span className="toolbar-secondary-label">{currentLabel}</span></Button></Hint>;
}
