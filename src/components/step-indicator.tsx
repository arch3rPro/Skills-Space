import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return <ol className="step-indicator flex min-w-0 shrink-0 items-start" aria-label={document.documentElement.lang.startsWith("zh") ? "操作步骤" : "Progress"}>{steps.map((label,index) => <li key={label} aria-current={index === current ? "step" : undefined} className={cn("relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center text-xs text-muted-foreground", index === current && "text-foreground")}><span className={cn("relative flex size-6 items-center justify-center rounded-full bg-muted font-medium", index <= current && "bg-primary text-primary-foreground")}>{index < current ? <CheckIcon className="size-3.5" aria-hidden="true" /> : index+1}</span><span className="max-w-full break-words px-1">{label}</span></li>)}</ol>;
}
