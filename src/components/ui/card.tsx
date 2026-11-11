import * as React from "react"

import { cn } from "@/lib/utils"

function Card({
  className,
  size = "default",
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm"; variant?: "default" | "inventory" | "selection" | "plain" | "composer" | "detail" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-[var(--card-radius,var(--radius-xl))] bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/6 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        variant === "composer" && "bg-muted/40 ring-0 shadow-none transition-colors focus-within:bg-muted/60",
        variant === "plain" && "ring-0 shadow-none",
        variant === "detail" && "gap-6 [&>[data-slot=card-header]]:gap-3 [&_[data-slot=card-title]]:text-xl",
        variant === "inventory" && "inventory-card [--card-spacing:--spacing(4)] gap-3 bg-card ring-foreground/6 transition-[background-color,box-shadow] hover:bg-muted/30 hover:ring-foreground/12 [&>[data-slot=card-header]]:min-w-0 [&>[data-slot=card-header]]:grid-cols-[minmax(0,1fr)] [&>[data-slot=card-header]]:gap-2 [&>[data-slot=card-footer]]:border-0 [&>[data-slot=card-footer]]:bg-transparent [&>[data-slot=card-footer]]:pt-0",
        variant === "selection" && "[--card-spacing:--spacing(2)] data-[size=sm]:[--card-spacing:--spacing(2)] cursor-pointer ring-border/60 transition-[background-color,box-shadow] hover:bg-muted/30 data-[state=checked]:bg-primary/5 data-[state=checked]:ring-primary/50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm group-data-[variant=inventory]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground group-data-[variant=inventory]/card:text-[0.8125rem] group-data-[variant=inventory]/card:leading-relaxed", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
