import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardFooter } from "@/components/ui/card";
export function LoadingCards({ label, count = 3, className, variant = "default" }: { label: string; count?: number; className?: string; variant?: "default" | "inventory" }) {
  return <div role="status" aria-live="polite" aria-label={label} className={cn("grid sm:grid-cols-2 xl:grid-cols-3", "gap-4", className)}>{Array.from({length:count},(_,index) => variant === "inventory" ? <Card key={index} variant="inventory"><CardHeader><Skeleton className="h-6 w-2/3" /><Skeleton className="h-10 w-full" /></CardHeader><CardFooter><Skeleton className="h-7 w-1/3" /></CardFooter></Card> : <Card key={index}><CardHeader><Skeleton className="h-5 w-2/3" /><Skeleton className="h-10 w-full" /></CardHeader><CardFooter><Skeleton className="h-4 w-1/3" /></CardFooter></Card>)}</div>;
}
