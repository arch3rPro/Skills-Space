import { ChevronRightIcon } from "lucide-react";
import { groupPaths, type PathEntry } from "@/lib/operation-results";
import { displayHomePath } from "@/lib/upstream";

export function RemovalPaths({ paths, home, zh }: { paths: PathEntry[]; home: string; zh: boolean }) {
  if (!paths.length) return null;
  return <details className="group/removal-paths">
    <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"><ChevronRightIcon className="size-3.5 transition-transform group-open/removal-paths:rotate-90" aria-hidden="true" />{zh ? "查看路径" : "View paths"}</summary>
    <dl className="mt-3 flex flex-col gap-3 text-xs">{groupPaths(paths).map(group => <div key={JSON.stringify([group.directory, group.state])} className="min-w-0"><dt className="break-all text-muted-foreground">{group.state} · <span className="font-mono">{displayHomePath(group.directory, home)}</span></dt><dd className="mt-1 break-words font-mono leading-5">{group.names.join(" · ")}</dd></div>)}</dl>
  </details>;
}
