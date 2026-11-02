import { ChevronRightIcon, TerminalIcon } from "lucide-react";
import { formatExecutionLog } from "@/lib/execution-log";
import { displayHomePath } from "@/lib/upstream";

export function ExecutionLog({ value, home, zh, label }: { value: string; home: string; zh: boolean; label?: string }) {
  if (!value.trim()) return null;
  return <details className="group/terminal overflow-hidden rounded-lg border border-border bg-sidebar text-sidebar-foreground">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs outline-none hover:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden"><TerminalIcon className="size-4 shrink-0" aria-hidden="true" /><span className="font-mono">{label ?? (zh ? "执行日志" : "Execution log")}</span><ChevronRightIcon className="ml-auto size-3.5 shrink-0 transition-transform group-open/terminal:rotate-90" aria-hidden="true" /></summary>
    <pre className="border-t border-border px-4 py-3 font-mono text-xs leading-4 whitespace-pre-wrap break-words">{displayHomePath(formatExecutionLog(value), home)}</pre>
  </details>;
}
