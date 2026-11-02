import { Hint } from "@/components/hint";
import type { ComponentProps } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackButton({ label, ...props }: Omit<ComponentProps<typeof Button>, "children" | "variant" | "size"> & { label: string }) {
  return <Hint text={label} disabled={props.disabled}><Button {...props} variant="ghost" size="icon-sm" aria-label={label}><ArrowLeftIcon aria-hidden="true" /></Button></Hint>;
}
