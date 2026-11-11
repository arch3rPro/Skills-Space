import { createContext, useContext, useEffect, useRef, useState, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const ActionsContext = createContext<HTMLDivElement | null>(null);
export function ModalActions({ children, fallback }: { children: ReactNode; fallback?: 'inline' }) {
  const host = useContext(ActionsContext);
  const actions = <div className="flex flex-wrap justify-end gap-2">{children}</div>;
  return host ? createPortal(actions, host) : fallback === 'inline' ? actions : null;
}

export function Modal({ title, description, open, onClose, children, busy = false, tall = false, compact = false, bodyStep, onClosed }: { title: string; description?: string; open: boolean; onClose: () => void; children: ReactNode; busy?: boolean; tall?: boolean; compact?: boolean; bodyStep?: string | number; onClosed?: () => void }) {
  const descriptionId = useId();
  const body = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (open && bodyStep !== undefined && body.current) body.current.scrollTop = 0;
  }, [open, bodyStep]);
  const opener = useRef<HTMLElement | null>(null);
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
  function focusOnOpen(event: Event) {
    const content = body.current?.closest<HTMLElement>('[data-slot="dialog-content"]');
    const root = content?.getRootNode();
    const active = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    if (!opener.current?.isConnected && active instanceof HTMLElement) opener.current = active;
    if (!(root instanceof ShadowRoot) || !content) return;
    // Radix's document-level traversal cannot observe focus within a shadow root.
    event.preventDefault();
    const selector = 'input:not([readonly]):not(:disabled):not([type="hidden"]), textarea:not([readonly]):not(:disabled), select:not(:disabled)';
    const target = [...content.querySelectorAll<HTMLElement>(selector)].find(element => element.getClientRects().length > 0)
      ?? [...content.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')].find(element => element.getClientRects().length > 0);
    (target ?? content).focus();
  }
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
    {open && <DialogContent className={cn("flex min-w-0 max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(760px,92vw)]", compact && "sm:max-w-[min(560px,92vw)]", tall && "h-[min(760px,90dvh)]")} showCloseButton={false} aria-describedby={description ? descriptionId : undefined} onOpenAutoFocus={focusOnOpen} onCloseAutoFocus={event => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } onClosed?.(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
      <DialogHeader className="shrink-0 px-[var(--dialog-padding,1.5rem)] pt-6 pb-2 sm:px-[var(--dialog-padding,2rem)] sm:pt-7"><div className="flex items-center justify-between gap-4"><DialogTitle>{title}</DialogTitle><DialogClose asChild><Button variant="ghost" size="icon-sm" disabled={busy} aria-label={document.documentElement.lang.startsWith("zh") ? "关闭" : "Close"}><XIcon aria-hidden="true" /></Button></DialogClose></div>{description && <DialogDescription id={descriptionId}>{description}</DialogDescription>}</DialogHeader>
      <ActionsContext.Provider value={actionsHost}>
        <div ref={body} className={cn("modal-body min-h-0 min-w-0 max-w-full overflow-x-hidden overflow-y-auto [scrollbar-width:thin] overscroll-contain px-[var(--dialog-padding,1.5rem)] py-5 sm:px-[var(--dialog-padding,2rem)] sm:pb-7", tall && "flex-1")} aria-busy={busy}>{children}</div>
        <div ref={setActionsHost} className="flex shrink-0 flex-col gap-2 px-[var(--dialog-padding,1.5rem)] pb-6 sm:px-[var(--dialog-padding,2rem)] sm:pb-7 empty:hidden" />
      </ActionsContext.Provider>
    </DialogContent>}
  </Dialog>;
}
