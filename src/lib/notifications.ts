import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { notificationError } from "./notification-message";

export function notifyError(message: string, zh: boolean, onDismiss?: () => void, fallback?: string) {
  const text = notificationError(message, zh, fallback);
  toast.error(text, { id: `error:${text}`, duration: 6000, onDismiss, onAutoClose: onDismiss });
}

export function notifySuccess(message: string) {
  toast.success(message, { duration: 3000 });
}

// Keep failure state for retry controls without rendering a persistent banner.
// Repeated polling failures stay quiet until a new attempt clears the error.
export function useFeedbackError(zh: boolean): [string, (message: string, fallback?: string) => void] {
  const [error, setError] = useState("");
  const previous = useRef("");
  const report = useCallback((message: string, fallback?: string) => {
    setError(message);
    const changed = previous.current !== message;
    previous.current = message;
    if (message && changed) notifyError(message, zh, () => { if (previous.current === message) previous.current = ""; }, fallback);
  }, [zh]);
  return [error, report];
}

export type InstallationProgressState = {
  stage: "checking" | "cloning" | "installing" | "verifying";
  detail: string | null;
  completed: number;
  total: number;
};

export function useInstallationProgress(progress: InstallationProgressState | null, zh: boolean) {
  const id = useId();
  useEffect(() => {
    if (!progress) { toast.dismiss(id); return; }
    const labels = {
      checking: zh ? "正在检查来源…" : "Checking source…",
      cloning: zh ? "正在克隆仓库…" : "Cloning repository…",
      installing: zh ? "正在安装技能…" : "Installing skills…",
      verifying: zh ? "正在核验安装结果…" : "Verifying installation…",
    };
    const count = progress.total > 0
      ? progress.stage === "verifying" ? ` ${progress.completed}/${progress.total}`
        : progress.stage === "installing" ? ` ${progress.total} ${zh ? "个技能" : "skills"}` : ""
      : "";
    toast.loading(labels[progress.stage] + count, {id, description:progress.detail ?? undefined, duration:Infinity, closeButton:false});
  }, [progress, zh, id]);
  useEffect(() => () => { toast.dismiss(id); }, [id]);
}
