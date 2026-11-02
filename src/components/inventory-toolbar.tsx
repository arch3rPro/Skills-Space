import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Keep full labels until the rendered controls actually need more room. */
export function InventoryToolbar({ children }: { children: ReactNode }) {
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
        const width = groups.reduce((sum, group) => sum + group.getBoundingClientRect().width, 0)
          + Math.max(0, groups.length - 1) * gap;
        if (width <= toolbar.clientWidth) break;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(toolbar);
    void document.fonts.ready.then(fit);
    return () => { active = false; observer.disconnect(); };
  }, [children]);

  // The horizontal scrollbar may appear when a filter changes its option set.
  // Keep it inside the existing gap below the row, outside normal flow.
  return <div className="inventory-toolbar-frame relative min-w-0 shrink-0"><div ref={ref} data-compact="0" className="layout-toolbar responsive-toolbar absolute inset-x-0 top-0 flex items-center gap-3">{children}</div></div>;
}
