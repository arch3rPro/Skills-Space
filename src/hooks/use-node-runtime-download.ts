import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";

export function useNodeRuntimeDownload(zh: boolean) {
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    const id = "node-runtime-download";
    let active = true;
    const unlisten = listen<boolean>(id, event => {
      if (!active) return;
      setDownloading(event.payload);
    });
    return () => { active = false; toast.dismiss(id); void unlisten.then(stop => stop()); };
  }, []);
  useEffect(() => {
    const id = "node-runtime-download";
    if (downloading) toast.loading(zh ? "正在下载 Node…" : "Downloading Node…", { id, duration: Infinity, closeButton: false });
    else toast.dismiss(id);
  }, [downloading, zh]);
}
