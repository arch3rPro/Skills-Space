import { useLayoutEffect, useRef, type ReactNode } from "react";

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
