import { Hint } from "@/components/hint";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GripVerticalIcon, RefreshCwIcon, SearchIcon, SettingsIcon } from "lucide-react";
import { AgentLogo } from "@/components/agent-logo";
import { AgentStatusBadge } from "@/components/agent-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelectSizer, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OverflowText } from "@/components/overflow-text";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { agentEnhancement, agentSupportGroup, displayHomePath, moveAgentWithinSupport, orderAgents, type Agent } from "@/lib/upstream";

type Props = {
  status:string;onStatus:(value:string)=>void;
  agents: Agent[]; order: string[]; counts: Map<string, number>; zh: boolean; home: string;
  disabled: boolean; loading: boolean; query: string; onQuery: (query: string) => void;
  onRefresh: () => void; isVisible: (agent: Agent) => boolean; onVisible: (agent: Agent, visible: boolean) => void;
  onOrder: (order: string[]) => Promise<void>; onOpen: (id: string) => void;
};

export function AgentManagement(props: Props) {
  const { agents, order, counts, zh, home, disabled, loading, query } = props;
  const t = (cn: string, en: string) => zh ? cn : en;
  const list = useRef<HTMLDivElement>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrolling = useRef<number | null>(null);
  const floating = useRef<HTMLElement | null>(null);
  const slots = useRef<{ id: string; rect: DOMRect }[]>([]);
  const positions = useRef(new Map<string, DOMRect>());
  const animations = useRef(new Map<string, Animation>());
  const gesture = useRef<{ id: string; target: string; x: number; y: number; active: boolean; offsetX: number; offsetY: number; listTop: number } | null>(null);
  const status=props.status,setStatus=props.onStatus;
  const [preview, setPreview] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  useEffect(() => {
    const running = animations.current;
    return () => {
      if (hold.current) clearTimeout(hold.current);
      if (scrolling.current) cancelAnimationFrame(scrolling.current);
      floating.current?.remove();
      running.forEach(animation => animation.cancel());
    };
  }, []);
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>();
    list.current?.querySelectorAll<HTMLElement>("[data-agent-id]").forEach(card => {
      const id = card.dataset.agentId; if (!id) return;
      const running = animations.current.get(id);
      const prior = positions.current.get(id);
      const transform = running ? new DOMMatrixReadOnly(getComputedStyle(card).transform) : null;
      const previous = prior && { left: prior.left + (transform?.m41 ?? 0), top: prior.top + (transform?.m42 ?? 0) };
      running?.cancel();
      const rect = card.getBoundingClientRect();
      next.set(id, rect);
      animations.current.delete(id);
      if (previous && id !== dragging && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const x = previous.left - rect.left, y = previous.top - rect.top;
        if (x || y) {
          const animation = card.animate([
            { transform: `translate(${x}px, ${y}px)` }, { transform: "translate(0, 0)" },
          ], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
          animations.current.set(id, animation);
          animation.onfinish = () => { if (animations.current.get(id) === animation) animations.current.delete(id); };
        }
      }
    });
    positions.current = next;
  }, [preview, order, query, status, dragging]);
  const moveFloating = () => {
    const current = gesture.current;
    if (current && floating.current) floating.current.style.transform = `translate3d(${current.x - current.offsetX}px, ${current.y - current.offsetY}px, 0)`;
  };
  const beginDrag = () => {
    const current = gesture.current; if (!current || !list.current) return;
    const card = list.current.querySelector<HTMLElement>(`[data-agent-id="${CSS.escape(current.id)}"]`);
    if (!card) return;
    animations.current.forEach(animation => animation.cancel()); animations.current.clear();
    slots.current = Array.from(list.current.querySelectorAll<HTMLElement>("[data-agent-id]")).map(element => ({ id: element.dataset.agentId ?? "", rect: element.getBoundingClientRect() }));
    current.listTop = list.current.getBoundingClientRect().top;
    const rect = card.getBoundingClientRect();
    const clone = card.cloneNode(true);
    if (!(clone instanceof HTMLElement)) return;
    // The floating row leaves its query container; preserve the displayed column layout.
    clone.style.gridTemplateColumns = getComputedStyle(card).gridTemplateColumns;
    Array.from(card.children).forEach((child, index) => {
      const copy = clone.children[index];
      if (!(copy instanceof HTMLElement)) return;
      const style = getComputedStyle(child);
      copy.style.gridColumn = style.gridColumn;
      copy.style.gridRow = style.gridRow;
      if (child.classList.contains("agent-management-meta")) {
        copy.style.display = style.display;
        copy.style.gridTemplateColumns = style.gridTemplateColumns;
        copy.style.flexWrap = style.flexWrap;
        copy.style.gap = style.gap;
      }
    });
    clone.removeAttribute("data-agent-id");
    clone.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
    clone.setAttribute("aria-hidden", "true"); clone.inert = true;
    clone.classList.add("agent-drag-floating"); clone.style.width = `${rect.width}px`; clone.style.height = `${rect.height}px`;
    floating.current = clone; document.body.appendChild(clone);
    current.active = true; moveFloating(); setDragging(current.id);
    scrolling.current = requestAnimationFrame(scrollAtEdge);
  };
  const cancel = () => {
    if (hold.current) clearTimeout(hold.current);
    if (scrolling.current) cancelAnimationFrame(scrolling.current); scrolling.current = null;
    floating.current?.remove(); floating.current = null; slots.current = [];
    hold.current = null; gesture.current = null; setDragging(null); setPreview(null);
  };
  const destinationAt = (x: number, y: number) => {
    const current = gesture.current; if (!current?.active) return;
    // Use stationary grid slots rather than animated cards for stable hit testing.
    const shift = (list.current?.getBoundingClientRect().top ?? current.listTop) - current.listTop;
    const slot = slots.current.find(({rect}) => x >= rect.left && x <= rect.right && y >= rect.top + shift && y <= rect.bottom + shift);
    if (slot && slot.id !== current.target && agentSupportGroup(slot.id) === agentSupportGroup(current.id)) {
      current.target = slot.id; setPreview(moveAgentWithinSupport(agents,order,current.id,slot.id));
    }
  };
  const scrollAtEdge = () => {
    const current = gesture.current; if (!current?.active || !list.current) return;
    let container: HTMLElement | null = list.current.parentElement;
    while (container && !(container.scrollHeight > container.clientHeight && /auto|scroll/.test(getComputedStyle(container).overflowY))) container = container.parentElement;
    if (!container && document.scrollingElement instanceof HTMLElement) container = document.scrollingElement;
    if (container) {
      const rect = container.getBoundingClientRect();
      const top = Math.max(0,rect.top), bottom = Math.min(window.innerHeight,rect.bottom);
      const amount = current.y < top + 50 ? -12 : current.y > bottom - 50 ? 12 : 0;
      if (amount) { container.scrollTop += amount; destinationAt(current.x,current.y); }
    }
    moveFloating();
    scrolling.current = requestAnimationFrame(scrollAtEdge);
  };
  const saveOrder = (next: string[], id: string) => {
    setPreview(next);
    void props.onOrder(next).finally(() => requestAnimationFrame(() => {
      setPreview(null);
      list.current?.querySelector<HTMLButtonElement>(`[data-agent-id="${CSS.escape(id)}"] .agent-drag-handle`)?.focus({preventScroll:true});
    }));
  };
  const items = orderAgents(agents, preview ?? order).filter(agent => (status === "all" || agent.installationStatus === status) && `${agent.name} ${agent.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section aria-label={t("智能体", "Agents")} className="agent-management flex flex-col gap-6">
    <div className="agent-management-toolbar flex items-center gap-3">
      <div className="relative min-w-0 flex-1 max-w-80"><SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input type="search" name="agent-search" className="pl-9" autoComplete="off" spellCheck={false} aria-label={t("搜索智能体", "Search Agents")} placeholder={t("搜索智能体…", "Search Agents…")} value={query} onChange={event => { cancel(); props.onQuery(event.target.value); }} /></div>
      <Select value={status} disabled={disabled || loading} onValueChange={value => { cancel(); setStatus(value); }}><SelectTrigger className="filter-trigger" aria-label={t("按安装状态筛选", "Filter by installation status")}><FilterSelectSizer>{[t("全部","All"),t("已安装","Installed"),t("发现配置","Configuration found"),t("未安装","Not installed")]}</FilterSelectSizer><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{[["all",t("全部", "All")],["confirmed",t("已安装", "Installed")],["configurationOnly",t("发现配置", "Configuration found")],["notFound",t("未安装", "Not installed")]].map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select>
      <Button className="ml-auto" variant="ghost" disabled={disabled || loading} aria-busy={loading} onClick={props.onRefresh}><RefreshCwIcon data-icon="inline-start" aria-hidden="true" className={loading ? "animate-spin motion-reduce:animate-none" : undefined} />{t("重新检测", "Detect again")}</Button>
    </div>
    <div ref={list} className="flex flex-col gap-6">
      {(["enhanced", "standard"] as const).map(group => { const grouped = items.filter(agent => agentSupportGroup(agent.id) === group); return grouped.length > 0 && <section key={group} aria-label={group === "enhanced" ? t("增强适配", "Enhanced integration") : t("通用支持", "General support")} className="flex flex-col gap-3"><h2 className="text-sm font-medium text-muted-foreground">{group === "enhanced" ? t("增强适配", "Enhanced integration") : t("通用支持", "General support")}</h2><div className="agent-management-list">{grouped.map(agent => {
        const countLabel = `${counts.get(agent.id) ?? 0} ${t("个已安装技能", "installed skills")}`;
        return <div key={agent.id} data-agent-id={agent.id} className={cn("agent-management-row", dragging === agent.id && "opacity-20")}>
          <button type="button" className="agent-drag-handle flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" disabled={disabled || loading} aria-label={t(`长按拖动排序 ${agent.name}，也可使用方向键`, `Hold to reorder ${agent.name}, or use arrow keys`)} aria-pressed={dragging === agent.id}
            onPointerDown={event => {
              if (event.button !== 0 || disabled || loading) return;
              cancel(); const handle = event.currentTarget; const pointer = event.pointerId; handle.focus({preventScroll:true});
              const rect = handle.closest<HTMLElement>("[data-agent-id]")?.getBoundingClientRect(); if (!rect) return;
              gesture.current = {id: agent.id, target: agent.id, x: event.clientX, y: event.clientY, active: false, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, listTop: 0};
              handle.setPointerCapture(pointer);
              hold.current = setTimeout(() => {
                if (!gesture.current) return;
                beginDrag();
                if (handle.isConnected) handle.setPointerCapture(pointer);
              }, 350);
            }}
            onPointerMove={event => {
              const current = gesture.current; if (!current) return;
              if (!current.active) {
                if (Math.hypot(event.clientX - current.x, event.clientY - current.y) <= 8) return;
                if (event.pointerType !== "mouse") { cancel(); return; }
                if (hold.current) clearTimeout(hold.current); hold.current = null;
                beginDrag();
              }
              current.x = event.clientX; current.y = event.clientY; destinationAt(current.x,current.y);
            }}
            onPointerUp={event => {
              const current = gesture.current;
              const dropped = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-agent-id]");
              const inside = !!dropped && list.current?.contains(dropped) && !!current && agentSupportGroup(dropped.dataset.agentId ?? "") === agentSupportGroup(current.id);
              const next = !disabled && !loading && current?.active && inside && current.id !== current.target ? moveAgentWithinSupport(agents, order, current.id, current.target) : null;
              cancel();
              if (next && current) saveOrder(next, current.id);
            }} onPointerCancel={cancel} onLostPointerCapture={cancel}
            onKeyDown={event => {
              if (event.key === "Escape") { cancel(); return; }
              if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
              event.preventDefault(); const at = grouped.findIndex(item => item.id === agent.id);
              const columns = list.current ? getComputedStyle(event.currentTarget.closest(".agent-management-list") ?? list.current).gridTemplateColumns.split(" ").length : 1;
              const offset = event.key === "ArrowUp" ? -columns : event.key === "ArrowDown" ? columns : event.key === "ArrowLeft" ? -1 : 1;
              const destination = grouped[at + offset];
              if (destination) saveOrder(moveAgentWithinSupport(agents, order, agent.id, destination.id), agent.id);
            }}><GripVerticalIcon className="size-4" aria-hidden="true" /></button>
          <span className="flex size-9 shrink-0 items-center justify-center"><AgentLogo name={agent.id} size={26} /></span>
          <div className="agent-management-identity min-w-0">
            {agentEnhancement(agent.id).settings ? <button type="button" className="block max-w-full text-left" disabled={disabled || loading} onClick={()=>props.onOpen(agent.id)} aria-label={t(`配置 ${agent.name}`, `Configure ${agent.name}`)}><OverflowText text={agent.name} className="block truncate text-sm font-medium" /></button> : <OverflowText text={agent.name} className="block truncate text-sm font-medium" />}
            <OverflowText text={displayHomePath(agent.path, home)} className="mt-1 block truncate font-mono text-xs text-muted-foreground" />
          </div>
          <div className="agent-management-meta"><span className="agent-management-count whitespace-nowrap text-xs tabular-nums text-muted-foreground">{countLabel}</span>
          <span className="agent-management-status"><AgentStatusBadge agent={agent} zh={zh} presentation="status" hint={agent.installationEvidence ? displayHomePath(agent.installationEvidence, home) : undefined} /></span></div>
          {agentEnhancement(agent.id).settings ? <Hint text={t(`${agent.name} 设置`, `${agent.name} settings`)} disabled={disabled || loading}><Button variant="ghost" size="icon-sm" disabled={disabled || loading} onClick={()=>props.onOpen(agent.id)} aria-label={t(`${agent.name} 设置`, `${agent.name} settings`)}><SettingsIcon aria-hidden="true" /></Button></Hint> : <span aria-hidden="true" className="size-7 shrink-0" />}
          <Switch checked={props.isVisible(agent)} disabled={disabled} onCheckedChange={visible => props.onVisible(agent, visible)} aria-label={`${t("显示", "Show")} ${agent.name}`} />
      </div>;
      })}</div></section>;})}
      {!items.length && <p className="col-span-full py-8 text-center text-sm text-muted-foreground">{t("没有匹配的 Agent", "No matching Agents")}</p>}
    </div>
    <span className="sr-only" role="status" aria-live="polite">{dragging ? t("正在拖动 Agent", "Reordering Agent") : ""}</span>
  </section>;
}
