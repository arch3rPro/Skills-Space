import { cn } from "@/lib/utils";
import type { ReactNode, ComponentProps } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';

// The existing skill inventory layout, shared with plugin inventory without owning actions.
export function InventoryCardHeader({ selection, heading, information, control, description, inert }: {
  selection?: ReactNode; heading: ReactNode; information?: ReactNode; control?: ReactNode; description: ReactNode; inert?: boolean;
}) {
  return <CardHeader inert={inert}>
    <div className="flex min-h-6 min-w-0 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {selection}<CardTitle className="min-w-0">{heading}</CardTitle>{information}
      </div>
      {control}
    </div>
    <CardDescription className="min-w-0">{description}</CardDescription>
  </CardHeader>;
}
export function InventoryCardFooter({ metadata, children, inert }: { metadata: ReactNode; children: ReactNode; inert?: boolean }) {
  return <CardFooter inert={inert} className="mt-auto min-h-7 min-w-0 justify-between gap-2">
    <div className="flex min-w-0 items-center gap-2">{metadata}</div>
    <div className="flex shrink-0 items-center gap-2">{children}</div>
  </CardFooter>;
}

// Shared normal-card navigation. Collection selection can still own onClick.
export function InventoryCard({ onOpen, onClick, className, ...props }: ComponentProps<typeof Card> & { onOpen?: () => void }) {
  return <Card {...props} variant="inventory" className={cn("group min-w-0 text-left", onOpen && "cursor-pointer active:ring-ring", className)} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || !onOpen || !(event.target instanceof Element) || !event.currentTarget.contains(event.target) || event.target.closest("button, a, input, select, textarea, [role='button'], [role='switch'], [role='checkbox'], [data-hint-disabled]")) return;
    onOpen();
  }} />;
}

// List selection belongs to the complete row, including its independent actions.
export function InventoryListRow({ selected, className, ...props }: ComponentProps<"div"> & { selected: boolean }) {
  return <div {...props} data-state={selected ? "selected" : undefined} className={cn("group/inventory-row flex min-w-0 items-center gap-2 rounded-[var(--button-radius,9999px)] px-1 transition-colors hover:bg-muted data-[state=selected]:bg-secondary data-[state=selected]:text-secondary-foreground", className)} />;
}

export function InventoryListActions({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("hidden shrink-0 items-center gap-1 group-hover/inventory-row:flex group-focus-within/inventory-row:flex [@media(hover:none)]:flex", className)} />;
}
