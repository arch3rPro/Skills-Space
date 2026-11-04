import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, variant = "default", ...props }: React.ComponentProps<"textarea"> & { variant?: "default" | "plain" }) {
  return (
    <textarea
      data-slot="textarea"
      data-variant={variant}
      className={cn(
        "flex field-sizing-content min-h-16 w-full [scrollbar-width:thin] rounded-md border border-input bg-card px-2.5 py-2 text-base transition-[background-color,border-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground focus-visible:border-ring/60 focus-visible:ring-1 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        variant === "plain" && "no-scrollbar [scrollbar-width:none] border-0 shadow-none focus-visible:border-transparent focus-visible:ring-0",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
