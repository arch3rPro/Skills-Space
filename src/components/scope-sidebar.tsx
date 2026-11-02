import { Hint } from "@/components/hint";
import { useFeedbackError } from "@/lib/notifications";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, PencilIcon, FolderOpenIcon, Trash2Icon, MoreHorizontalIcon, GlobeIcon, FoldersIcon } from "lucide-react";
import { AgentLogo } from "@/components/agent-logo";
import { ProjectIcon } from "@/components/project-editor";
import { ActionMenu } from "@/components/action-menu";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SidebarGroup, SidebarGroupLabel, SidebarGroupAction, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction, useSidebar } from "@/components/ui/sidebar";
import { displayHomePath, orderAgents, type Preferences, type Project, type Target, type Agent, type Inventory } from "@/lib/upstream";

function ScopeAgents({scope,enabled,preferences,target,inventory,selected,active,disabled,zh,onSelect,failure,onRefresh}:{scope:Target;enabled:boolean;preferences:Preferences;target:Target;inventory:Inventory|null;selected:string;active:boolean;disabled:boolean;zh:boolean;onSelect:(scope:Target,id:string)=>void;failure:string;onRefresh:(scope:Target)=>void}) {
  const [cached,setCached]=useState<Agent[]|null>(null);
  const [error,setError]=useFeedbackError(zh);
  const [retry,setRetry]=useState(0);
  const current=scope.projectPath===target.projectPath&&scope.scope===target.scope;
  useEffect(()=>{
    if(current&&inventory) {setCached(inventory.agents);setError("");}
  },[current,inventory]);
  useEffect(()=>{
    if(!enabled||current||cached) return;
    let cancelled=false;
    setError("");
    void invoke<Agent[]>("upstream_agents",{target:scope}).then(result=>{if(!cancelled)setCached(result);}).catch(reason=>{if(!cancelled)setError(String(reason),zh?"智能体列表读取失败，请点击重试。":"Could not read Agents. Click to retry.");});
    return ()=>{cancelled=true;};
  },[enabled,current,cached,scope.projectPath,retry]);
  const agents=orderAgents(current&&inventory?inventory.agents:cached??[],preferences.agentOrder).filter(agent=>!preferences.hiddenAgents.includes(agent.id)&&(agent.installationStatus==="confirmed"||preferences.visibleAgents.includes(agent.id)));
  const issue = error || (current && !inventory ? failure : "");
  return <SidebarMenu className={!enabled ? "hidden" : "pl-3 group-data-[collapsible=icon]:pl-0"}>
    {agents.map(agent=><SidebarMenuItem key={agent.id}><SidebarMenuButton disabled={disabled} isActive={active&&current&&selected===agent.id} onClick={()=>onSelect(scope,agent.id)} tooltip={agent.name}><AgentLogo name={agent.id} size={18}/><span className="truncate group-data-[collapsible=icon]:hidden">{agent.name}</span></SidebarMenuButton></SidebarMenuItem>)}
    {!agents.length&&<SidebarMenuItem>{issue?<Button className="h-auto justify-start whitespace-normal text-left" variant="ghost" size="sm" disabled={disabled} onClick={()=>current?onRefresh(scope):setRetry(value=>value+1)}>{zh?"智能体列表读取失败，点击重试":"Could not read Agents. Retry"}</Button>:<span className="block px-2 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{cached||current&&inventory?(zh?"暂无显示的 Agent":"No visible Agents"):(zh?"正在读取 Agent…":"Loading Agents…")}</span>}</SidebarMenuItem>}
  </SidebarMenu>;
}
export function ScopeSidebar({home,preferences,target,inventory,selected,active,disabled,zh,onSelect,onSave,onAdd,onEdit,onForget,onOpen,error,onRefresh}:{home:string;preferences:Preferences;target:Target;inventory:Inventory|null;selected:string;active:boolean;disabled:boolean;zh:boolean;onSelect:(scope:Target,id:string)=>void;onSave:(change:Partial<Preferences>)=>Promise<void>;onAdd:()=>void;onEdit:(project:Project)=>void;onForget:(project:Project)=>void;onOpen:(path:string)=>void;error:string;onRefresh:(scope:Target)=>void}) {
  const t=(cn:string,en:string)=>zh?cn:en;
  const {state:sidebarState}=useSidebar();
  const collapsed=(key:string)=>preferences.collapsedSections.includes(key);
  const toggle=(key:string)=>void onSave({collapsedSections:collapsed(key)?preferences.collapsedSections.filter(item=>item!==key):[...preferences.collapsedSections,key]});
  const group=useRef<HTMLDivElement>(null);
  const floating=useRef<HTMLElement|null>(null);
  const hold=useRef<ReturnType<typeof setTimeout>|null>(null);
  const drag=useRef<{path:string;target:string;x:number;y:number;dx:number;dy:number;active:boolean}|null>(null);
  const [dragging,setDragging]=useState("");
  const suppressClick=useRef(false);
  const cleanup=()=>{if(hold.current)clearTimeout(hold.current);hold.current=null;floating.current?.remove();floating.current=null;drag.current=null;setDragging("");};
  useEffect(()=>()=>{if(hold.current)clearTimeout(hold.current);floating.current?.remove();},[]);
  const start=()=>{
    const current=drag.current;if(!current||!group.current)return;
    const source=Array.from(group.current.querySelectorAll<HTMLElement>("[data-project-header]")).find(element=>element.dataset.projectHeader===current.path);
    if(!source)return;
    const rect=source.getBoundingClientRect(),clone=source.cloneNode(true);
    if(!(clone instanceof HTMLElement))return;
    clone.removeAttribute("data-project-header");clone.querySelectorAll("[id]").forEach(element=>element.removeAttribute("id"));clone.classList.add("project-drag-floating");clone.style.width=`${rect.width}px`;clone.inert=true;clone.setAttribute("aria-hidden","true");floating.current=clone;document.body.appendChild(clone);current.active=true;setDragging(current.path);
    clone.style.transform=`translate3d(${current.x-current.dx}px,${current.y-current.dy}px,0)`;
  };
  const move=(path:string,destination:string)=>{
    const next=[...preferences.projects],from=next.findIndex(item=>item.path===path),to=next.findIndex(item=>item.path===destination);
    if(from<0||to<0||from===to)return;
    const [project]=next.splice(from,1);next.splice(to,0,project);void onSave({projects:next});
  };
  const common={preferences,target,inventory,selected,active,disabled,zh,onSelect,failure:error,onRefresh};
  return <>
    <SidebarGroup className="group/scope-heading">
      <div className="flex items-center">
        <Hint side="right" text={sidebarState==="collapsed"?t("全局管理","Global management"):undefined} disabled={disabled}><SidebarGroupLabel asChild className="group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:opacity-100"><button type="button" aria-label={t("全局管理","Global management")} className="flex-1 gap-1.5 text-left" disabled={disabled} aria-expanded={!collapsed("global")} onClick={()=>toggle("global")}><span className="group-data-[collapsible=icon]:hidden">{t("全局管理","Global management")}</span><GlobeIcon aria-hidden="true" className="hidden group-data-[collapsible=icon]:block"/><span className="group-data-[collapsible=icon]:hidden opacity-0 group-hover/scope-heading:opacity-100 group-focus-within/scope-heading:opacity-100">{collapsed("global")?<ChevronRightIcon aria-hidden="true" className="size-3.5"/>:<ChevronDownIcon aria-hidden="true" className="size-3.5"/>}</span></button></SidebarGroupLabel></Hint>
      </div>
      <SidebarGroupContent><ScopeAgents {...common} scope={{host:"local",scope:"global",projectPath:null}} enabled={!collapsed("global")}/></SidebarGroupContent>
    </SidebarGroup>
    <SidebarGroup className="group/scope-heading">
      <div className="flex items-center">
        <Hint side="right" text={sidebarState==="collapsed"?t("项目管理","Project management"):undefined} disabled={disabled}><SidebarGroupLabel asChild className="group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:opacity-100"><button type="button" aria-label={t("项目管理","Project management")} className="min-w-0 flex-1 gap-1.5 text-left" disabled={disabled} aria-expanded={!collapsed("projects")} onClick={()=>toggle("projects")}><span className="group-data-[collapsible=icon]:hidden">{t("项目管理","Project management")}</span><FoldersIcon aria-hidden="true" className="hidden group-data-[collapsible=icon]:block"/><span className="group-data-[collapsible=icon]:hidden opacity-0 group-hover/scope-heading:opacity-100 group-focus-within/scope-heading:opacity-100">{collapsed("projects")?<ChevronRightIcon aria-hidden="true" className="size-3.5"/>:<ChevronDownIcon aria-hidden="true" className="size-3.5"/>}</span></button></SidebarGroupLabel></Hint>
        <SidebarGroupAction type="button" className="opacity-0 group-hover/scope-heading:opacity-100 group-focus-within/scope-heading:opacity-100 focus-visible:opacity-100" disabled={disabled} onClick={onAdd} aria-label={t("新增项目","Add project")}><PlusIcon aria-hidden="true"/></SidebarGroupAction>
      </div>
      <SidebarGroupContent ref={group} className={collapsed("projects") ? "hidden" : "flex flex-col gap-1 pt-1"}>
        <SidebarMenu>{preferences.projects.map((project,index)=><SidebarMenuItem key={project.path} data-project-section={project.path}>
          <div data-project-header={project.path} className={cn("group/project relative flex items-center rounded-full hover:bg-sidebar-accent focus-within:bg-sidebar-accent",dragging===project.path&&"opacity-25")}>
            <Hint side={sidebarState==="collapsed"?"right":undefined} text={sidebarState==="collapsed"?`${project.name} · ${displayHomePath(project.path,home)}`:displayHomePath(project.path,home)} disabled={disabled}><SidebarMenuButton type="button" className="agent-drag-handle pr-9" disabled={disabled} aria-label={project.name} aria-expanded={!collapsed(project.path)} aria-description={t("单击展开或折叠；拖动排序，也可使用上下方向键排序。","Click to expand or collapse; drag or use arrow keys to reorder.")} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}toggle(project.path);}}
              onPointerDown={event=>{if(event.button!==0||disabled)return;cleanup();suppressClick.current=false;const rect=event.currentTarget.parentElement?.getBoundingClientRect();if(!rect)return;drag.current={path:project.path,target:project.path,x:event.clientX,y:event.clientY,dx:event.clientX-rect.left,dy:event.clientY-rect.top,active:false};event.currentTarget.setPointerCapture(event.pointerId);hold.current=setTimeout(start,350);}}
              onPointerMove={event=>{const current=drag.current;if(!current)return;if(!current.active&&Math.hypot(event.clientX-current.x,event.clientY-current.y)>8){if(event.pointerType!=="mouse"){cleanup();return;}if(hold.current)clearTimeout(hold.current);start();}if(!current.active)return;current.x=event.clientX;current.y=event.clientY;if(floating.current)floating.current.style.transform=`translate3d(${current.x-current.dx}px,${current.y-current.dy}px,0)`;const element=document.elementFromPoint(current.x,current.y)?.closest<HTMLElement>("[data-project-section]");if(element?.dataset.projectSection&&group.current?.contains(element))current.target=element.dataset.projectSection;}}
              onPointerUp={event=>{const current=drag.current;const inside=group.current?.contains(document.elementFromPoint(event.clientX,event.clientY));if(current?.active){suppressClick.current=true;if(inside)move(current.path,current.target);}cleanup();}} onPointerCancel={cleanup} onLostPointerCapture={cleanup}
              onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){suppressClick.current=false;return;}if(event.key==="Escape")cleanup();if(event.key!=="ArrowUp"&&event.key!=="ArrowDown")return;event.preventDefault();const destination=preferences.projects[index+(event.key==="ArrowUp"?-1:1)];if(destination)move(project.path,destination.path);}}><ProjectIcon name={project.icon}/><span className="truncate group-data-[collapsible=icon]:hidden">{project.name}</span></SidebarMenuButton></Hint>
            <ActionMenu compact trigger={<SidebarMenuAction aria-label={t(`项目操作 ${project.name}`,`Project actions ${project.name}`)} disabled={disabled}><MoreHorizontalIcon aria-hidden="true"/></SidebarMenuAction>} label={t(`项目操作 ${project.name}`,`Project actions ${project.name}`)} disabled={disabled} groups={[[{label:t("编辑项目","Edit project"),run:()=>onEdit(project),icon:<PencilIcon/>},{label:t("打开目录","Open folder"),run:()=>onOpen(project.path),icon:<FolderOpenIcon/>}],[{label:t("移除项目","Remove project"),run:()=>onForget(project),icon:<Trash2Icon/>}]]}/>
          </div>
          <ScopeAgents {...common} scope={{host:"local",scope:"project",projectPath:project.path}} enabled={!collapsed("projects")&&!collapsed(project.path)}/>
        </SidebarMenuItem>)}</SidebarMenu>
        {!preferences.projects.length&&<span className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{t("点击 + 添加项目","Click + to add a project")}</span>}
      </SidebarGroupContent>
    </SidebarGroup>
  </>;
}
