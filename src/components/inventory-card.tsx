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
