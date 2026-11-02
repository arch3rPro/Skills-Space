import { Hint } from "@/components/hint";
import { useFeedbackError } from "@/lib/notifications";
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { BookOpenIcon, BriefcaseIcon, CodeIcon, DatabaseIcon, FlaskConicalIcon, FolderIcon, GlobeIcon, GraduationCapIcon, HeartIcon, LayersIcon, MusicIcon, PaletteIcon, PencilIcon, RocketIcon, TerminalIcon, WrenchIcon, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Modal, ModalActions } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { displayHomePath, type Project } from "@/lib/upstream";

const icons: { id: string; zh: string; en: string; icon: LucideIcon }[] = [
  {id:"folder",zh:"文件夹",en:"Folder",icon:FolderIcon}, {id:"code",zh:"代码",en:"Code",icon:CodeIcon},
  {id:"terminal",zh:"终端",en:"Terminal",icon:TerminalIcon}, {id:"book",zh:"书籍",en:"Book",icon:BookOpenIcon},
  {id:"flask",zh:"研究",en:"Research",icon:FlaskConicalIcon}, {id:"palette",zh:"设计",en:"Design",icon:PaletteIcon},
  {id:"briefcase",zh:"工作",en:"Work",icon:BriefcaseIcon}, {id:"database",zh:"数据库",en:"Database",icon:DatabaseIcon},
  {id:"globe",zh:"网站",en:"Website",icon:GlobeIcon}, {id:"graduation",zh:"学习",en:"Learning",icon:GraduationCapIcon},
  {id:"layers",zh:"图层",en:"Layers",icon:LayersIcon}, {id:"rocket",zh:"发布",en:"Launch",icon:RocketIcon},
  {id:"pencil",zh:"写作",en:"Writing",icon:PencilIcon}, {id:"wrench",zh:"工具",en:"Tools",icon:WrenchIcon},
  {id:"music",zh:"音乐",en:"Music",icon:MusicIcon}, {id:"heart",zh:"收藏",en:"Favorite",icon:HeartIcon},
];
export function ProjectIcon({name,className="size-4"}:{name:string;className?:string}) {
  const Icon = icons.find(item=>item.id===name)?.icon ?? FolderIcon;
  return <Icon className={cn("text-primary",className)} aria-hidden="true" />;
}
export function ProjectEditor({project,projects,home,zh,busy,onSave,onClose}:{project:Project;projects:Project[];home:string;zh:boolean;busy:boolean;onSave:(project:Project)=>Promise<void>;onClose:()=>void}) {
  const [draft,setDraft]=useState(project);
  const [search,setSearch]=useState("");
  const [picker,setPicker]=useState(false);
  const [, setError] = useFeedbackError(zh);
  const t=(cn:string,en:string)=>zh?cn:en;
  const editing=!!project.path;
  const chooseDirectory=async()=>{
    try {
      const path=await open({directory:true,multiple:false});
      if(typeof path==="string") {setDraft(current=>({...current,path,name:current.name||path.split(/[\\/]/).filter(Boolean).pop()||path}));setError("");}
    } catch(reason) {setError(String(reason),t("目录选择器无法打开，请再次点击“选择目录”。","Could not open the folder picker. Click Choose folder again."));}
  };
  const submit=async()=>{
    if(!draft.path||!draft.name.trim()) {setError(t("请选择目录并填写项目名称。","Choose a folder and enter a project name."));return;}
    if(projects.some(item=>item.path===draft.path&&item.path!==project.path)) {setError(t("该目录已添加。","This folder is already registered."));return;}
    try {await onSave({...draft,name:draft.name.trim()});} catch(reason) {setError(String(reason),t("项目未保存，请重新保存。","The project was not saved. Save again."));}
  };
  return <Modal compact open title={editing?t("编辑项目","Edit project"):t("新增项目","Add project")} busy={busy} onClose={onClose}>
    <FieldGroup>
      <Field><FieldLabel htmlFor="project-name">{t("项目名称","Project name")}</FieldLabel><div className="flex items-center gap-2">
        <Popover open={picker} onOpenChange={setPicker}><PopoverTrigger asChild><Button variant="outline" size="icon" disabled={busy} aria-label={t("选择项目图标","Choose project icon")}><ProjectIcon name={draft.icon}/></Button></PopoverTrigger><PopoverContent side="bottom" align="start" sideOffset={8} className="gap-3 p-3" aria-label={t("项目图标","Project icons")}>
          <Input name="project-icon-search" autoComplete="off" spellCheck={false} aria-label={t("搜索图标","Search icons")} placeholder={t("搜索图标","Search icons")} value={search} onChange={event=>setSearch(event.target.value)}/>
          <div className="grid grid-cols-4 gap-2">{icons.filter(item=>`${item.zh} ${item.en}`.toLowerCase().includes(search.toLowerCase())).map(item=><Hint text={zh?item.zh:item.en} key={item.id}><Button variant={item.id===draft.icon?"secondary":"ghost"} size="icon" aria-label={zh?item.zh:item.en} aria-pressed={item.id===draft.icon} onClick={()=>{setDraft(current=>({...current,icon:item.id}));setPicker(false);}}><item.icon className="text-primary" aria-hidden="true"/></Button></Hint>)}</div>
          {!icons.some(item=>`${item.zh} ${item.en}`.toLowerCase().includes(search.toLowerCase()))&&<p className="text-sm text-muted-foreground">{t("没有匹配的图标","No matching icons")}</p>}
        </PopoverContent></Popover>
        <Input name="project-name" id="project-name" autoComplete="off" maxLength={80} value={draft.name} disabled={busy} onChange={event=>setDraft(current=>({...current,name:event.target.value}))}/>
      </div></Field>
      <Field><FieldLabel>{t("项目目录","Project folder")}</FieldLabel><div className="flex items-center gap-2"><span className="min-w-0 flex-1 break-all font-mono text-sm">{draft.path?displayHomePath(draft.path,home):t("尚未选择目录","No folder selected")}</span><Button variant="outline" disabled={busy} onClick={()=>void chooseDirectory()}>{t("选择目录","Choose folder")}</Button></div></Field>
    </FieldGroup>
    <ModalActions><Button variant="outline" disabled={busy} onClick={onClose}>{t("取消","Cancel")}</Button><Button disabled={busy} onClick={()=>void submit()}>{t("保存","Save")}</Button></ModalActions>
  </Modal>;
}
