import { AlertCircleIcon, ChevronRightIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { errorSummary } from "@/lib/error-summary";

export function FlowError({ message, help, zh, title }: { message: string; help: string; zh: boolean; title?: string }) {
  const summary = errorSummary(message, zh);
  return <Alert className="border-destructive/20 bg-destructive/5 p-4">
    <AlertCircleIcon className="text-destructive" aria-hidden="true" />
    <AlertTitle>{title ?? (zh ? "操作未完成" : "Operation incomplete")}</AlertTitle>
    <AlertDescription className="mt-1 flex min-w-0 flex-col gap-3">
      <span className="break-words text-foreground">{summary ?? help}</span>
      <details className="group/error min-w-0"><summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"><ChevronRightIcon className="size-3.5 transition-transform group-open/error:rotate-90" aria-hidden="true" />{zh ? "错误详情" : "Error details"}</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-background/70 p-3 font-mono text-xs leading-5 text-muted-foreground">{message}</pre></details>
    </AlertDescription>
  </Alert>;
}
