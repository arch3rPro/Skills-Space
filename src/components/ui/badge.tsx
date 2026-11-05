import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        installed: "border-agent-installed/25 bg-agent-installed/10 text-agent-installed",
        configuration: "border-agent-configuration/25 bg-agent-configuration/10 text-agent-configuration",
        "not-installed": "border-agent-absent/25 bg-agent-absent/10 text-agent-absent",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      presentation: { invocation: "h-auto rounded-none border-0 px-0 py-0 align-baseline text-sm", pill: "", status: "gap-1.5 rounded-none border-0 bg-transparent px-0 font-normal before:size-1.5 before:shrink-0 before:rounded-full before:bg-current" },
    },
    defaultVariants: {
      variant: "default",
      presentation: "pill",
    },
  }
)

function Badge({
  className,
  variant = "default",
  presentation = "pill",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, presentation }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
