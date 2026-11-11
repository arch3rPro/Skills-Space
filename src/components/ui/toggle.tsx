"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Toggle as TogglePrimitive } from "radix-ui"

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-[var(--button-radius,var(--radius-lg))] text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity,transform] outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-muted data-[state=on]:bg-muted dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        document: "bg-transparent text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground",
        preview: "border border-border bg-background text-muted-foreground hover:bg-muted data-[state=on]:border-primary/60 data-[state=on]:bg-muted data-[state=on]:text-foreground",
        default: "bg-transparent text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-none",
        outline: "border border-input bg-transparent hover:bg-muted",
      },
      size: {
        xs: "h-[var(--toggle-height-xs,1.5rem)] min-w-6 rounded-[var(--button-radius,min(var(--radius-md),10px))] px-2.5",
        default:
          "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-[var(--toggle-height-sm,1.75rem)] min-w-7 rounded-[var(--button-radius,min(var(--radius-md),12px))] px-2.5 text-[var(--button-font-size,0.8rem)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-7 rounded-[var(--button-radius,9999px)] p-0",
        lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
