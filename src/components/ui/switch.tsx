import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-4.5 w-8 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-muted-foreground/35 transition-[background-color,box-shadow] motion-reduce:transition-none outline-none hover:bg-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-ring data-[state=checked]:hover:bg-ring/85",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none data-[state=checked]:translate-x-3.5 data-[state=unchecked]:translate-x-0 data-[state=checked]:bg-white"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
