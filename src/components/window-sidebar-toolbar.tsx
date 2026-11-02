import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Hint } from "@/components/hint";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

export function WindowSidebarToolbar({ zh, fullscreen }: { zh: boolean; fullscreen: boolean }) {
  const { state } = useSidebar();
  const [controlsHidden, setControlsHidden] = useState(false);
  const updates = useRef(Promise.resolve());
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    updates.current = updates.current.then(async () => {
      if (disposed) return;
      try {
        const hidden = await invoke<boolean>("upstream_window_controls", { collapsed: state === "collapsed" && !fullscreen });
        if (!disposed) setControlsHidden(hidden);
      } catch (error) {
        if (!disposed) setControlsHidden(false);
        console.error("Could not update native window controls", error);
      }
    });
    return () => { disposed = true; };
  }, [state, fullscreen]);
  return <div data-tauri-drag-region data-sidebar-state={state} data-controls-hidden={controlsHidden} className="desktop-titlebar">
    <Hint text={zh ? "展开或收起侧栏" : "Toggle sidebar"}><SidebarTrigger className="desktop-sidebar-toggle" aria-label={zh ? "展开或收起侧栏" : "Toggle sidebar"} /></Hint>
  </div>;
}
