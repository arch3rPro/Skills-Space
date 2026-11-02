import { errorSummary } from "./error-summary.ts";

export function notificationError(message: string, zh: boolean, fallback?: string): string {
  const summary = errorSummary(message, zh);
  if (summary) return summary;
  const partial = /^(已完成 \d+\/\d+ 项。|\d+\/\d+ completed\. )/.exec(message);
  if (fallback) return (partial?.[1] ?? "") + fallback;
  return zh ? "操作未完成。" : "The operation did not finish.";
}
