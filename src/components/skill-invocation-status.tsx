import { HandIcon, SparklesIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Hint } from "@/components/hint";

// Source-declared invocation channels; the separate switch owns skill enablement.
export function SkillInvocationStatus({ automatic, zh }: { automatic: boolean | null | undefined; zh: boolean }) {
  if (automatic == null) return null;
  const channels = [
    ...(automatic ? [{ label: zh ? "自动选择" : "Automatic selection", Icon: SparklesIcon }] : []),
    { label: zh ? "手动调用" : "Manual invocation", Icon: HandIcon },
  ];
  return <span className="inline-flex items-center gap-2" onClick={event => { event.preventDefault(); event.stopPropagation(); }}>
    {channels.map(({ label, Icon }) => <Hint key={label} text={label} stable focusable><span role="img" aria-label={label} className={buttonVariants({ variant: "ghost", size: "icon-sm", className: "pointer-events-none" })}><Icon aria-hidden="true" /></span></Hint>)}
  </span>;
}
