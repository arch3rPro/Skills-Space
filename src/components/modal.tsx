import { createContext, useContext, useEffect, useRef, useState, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const ActionsContext = createContext<HTMLDivElement | null>(null);
export function ModalActions({ children }: { children: ReactNode }) {
  const host = useContext(ActionsContext);
  return host ? createPortal(<div className="flex flex-wrap justify-end gap-2">{children}</div>, host) : null;
}

export function Modal({ title, description, open, onClose, children, busy = false, tall = false, compact = false, bodyStep, onClosed }: { title: string; description?: string; open: boolean; onClose: () => void; children: ReactNode; busy?: boolean; tall?: boolean; compact?: boolean; bodyStep?: string | number; onClosed?: () => void }) {
  const descriptionId = useId();
  const body = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (open && bodyStep !== undefined && body.current) body.current.scrollTop = 0;
  }, [open, bodyStep]);
  const opener = useRef<HTMLElement | null>(null);
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (open) return;
    const remember = (event: PointerEvent) => {
      if (event.target instanceof Element) {
        const target = event.target.closest<HTMLElement>("button, a, input, [role='button']");
        if (target && !target.closest("[role='menu']")) opener.current = target;
      }
    };
    document.addEventListener("pointerdown", remember, true);
    return () => document.removeEventListener("pointerdown", remember, true);
  }, [open]);
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
    {open && <DialogContent className={cn("flex min-w-0 max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(760px,92vw)]", compact && "sm:max-w-[min(560px,92vw)]", tall && "h-[min(760px,90dvh)]")} showCloseButton={false} aria-describedby={description ? descriptionId : undefined} onOpenAutoFocus={() => { if (!opener.current?.isConnected && document.activeElement instanceof HTMLElement) opener.current = document.activeElement; }} onCloseAutoFocus={event => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } onClosed?.(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
      <DialogHeader className="shrink-0 px-6 pt-6 pb-2 sm:px-8 sm:pt-7"><div className="flex items-center justify-between gap-4"><DialogTitle>{title}</DialogTitle><DialogClose asChild><Button variant="ghost" size="icon-sm" disabled={busy} aria-label={document.documentElement.lang.startsWith("zh") ? "关闭" : "Close"}><XIcon aria-hidden="true" /></Button></DialogClose></div>{description && <DialogDescription id={descriptionId}>{description}</DialogDescription>}</DialogHeader>
      <ActionsContext.Provider value={actionsHost}>
        <div ref={body} className={cn("modal-body min-h-0 min-w-0 max-w-full overflow-x-hidden overflow-y-auto [scrollbar-width:thin] overscroll-contain px-6 py-5 sm:px-8 sm:pb-7", tall && "flex-1")} aria-busy={busy}>{children}</div>
        <div ref={setActionsHost} className="flex shrink-0 flex-col gap-2 px-6 pb-6 sm:px-8 sm:pb-7 empty:hidden" />
      </ActionsContext.Provider>
    </DialogContent>}
  </Dialog>;
}
