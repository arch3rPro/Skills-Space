import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";

export function useWindowFullscreen() {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    const window = getCurrentWindow();
    let disposed = false;
    let revision = 0;
    let unlisten: UnlistenFn | undefined;
    const refresh = async () => {
      const current = ++revision;
      try {
        const value = await window.isFullscreen();
        if (!disposed && current === revision) setFullscreen(value);
      } catch (error) {
        console.error("Could not read native fullscreen state", error);
      }
    };
    void window.onResized(() => { void refresh(); }).then(stop => {
      if (disposed) stop();
      else { unlisten = stop; void refresh(); }
    }).catch(error => console.error("Could not observe native window resize", error));
    return () => { disposed = true; unlisten?.(); };
  }, []);
  return fullscreen;
}
