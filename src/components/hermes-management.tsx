import { Hint } from "@/components/hint";
import {useEffect,useEffectEvent,useId,useImperativeHandle,useRef,useState,type Ref} from "react";
import {invoke} from "@tauri-apps/api/core";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {open} from "@tauri-apps/plugin-dialog";
import {PlusIcon,FolderOpenIcon,RefreshCwIcon,Trash2Icon} from "lucide-react";
import {BackButton} from "@/components/back-button";
import {AgentLogo} from "@/components/agent-logo";
import {Button} from "@/components/ui/button";
import {Card,CardHeader,CardTitle,CardContent} from "@/components/ui/card";
import {Field,FieldContent,FieldDescription,FieldGroup,FieldLabel,FieldTitle} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Switch} from "@/components/ui/switch";
import {Select,SelectContent,SelectGroup,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Skeleton} from "@/components/ui/skeleton";
import {HelpPopover} from "@/components/help-popover";
import {AlertDialog,AlertDialogContent,AlertDialogBody,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from "@/components/ui/alert-dialog";
import {notifySuccess,useFeedbackError} from "@/lib/notifications";
import {displayHomePath,expandHomePath,type Target,type Project} from "@/lib/upstream";
import {hermesInspectionWarnings,type HermesSettings,type HermesEditorHandle} from "@/lib/hermes";

type Props={ref?:Ref<HermesEditorHandle>;zh:boolean;home:string;projects:Project[];initialTarget:Target;disabled:boolean;onBack:()=>void;onBusy:(busy:boolean)=>void;onSaved:()=>void};
export function HermesManagement({ref,zh,home,projects,initialTarget,disabled,onBack,onBusy,onSaved}:Props){
 const t=(cn:string,en:string)=>zh?cn:en,id=useId();
 const[target,setTarget]=useState(initialTarget),[snapshot,setSnapshot]=useState<HermesSettings|null>(null);
 const[directories,setDirectories]=useState<string[]>([]),[createDir,setCreateDir]=useState(''),[discovery,setDiscovery]=useState(true),[trusted,setTrusted]=useState<string[]>([]),[autoLoad,setAutoLoad]=useState('');
 const[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[,setError]=useFeedbackError(zh);
 const request=useRef(0),pendingAction=useRef<(()=>void)|null>(null),allowClose=useRef(false);
 const[confirmLeave,setConfirmLeave]=useState(false),[confirmTrust,setConfirmTrust]=useState(false);
 const list=(value:string)=>value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const payload={externalDirs:directories.map(s=>expandHomePath(s,home)).filter(s=>s.trim()),createDir:expandHomePath(createDir,home),projectDiscovery:discovery,trustedProjects:trusted,autoLoad:list(autoLoad)};
 const baseline=snapshot?{externalDirs:snapshot.externalDirs.map(s=>expandHomePath(s,home)),createDir:expandHomePath(snapshot.createDir,home),projectDiscovery:snapshot.projectDiscovery,trustedProjects:snapshot.trustedProjects,autoLoad:snapshot.autoLoad}:null;
 const dirty=!!snapshot&&JSON.stringify(payload)!==JSON.stringify(baseline),locked=disabled||loading||saving;
 function accept(value:HermesSettings){setSnapshot(value);setDirectories(value.externalDirs.map(s=>displayHomePath(s,home)));setCreateDir(displayHomePath(value.createDir,home));setDiscovery(value.projectDiscovery);setTrusted(value.trustedProjects);setAutoLoad(value.autoLoad.join('\n'));}
 async function load(){const n=++request.current;setLoading(true);try{const value=await invoke<HermesSettings>('upstream_hermes_settings',{target});if(n===request.current)accept(value);}catch(e){if(n===request.current)setError(String(e),t("Hermes 设置读取失败，请重新读取。","Hermes settings could not be read. Reload them."));}finally{if(n===request.current)setLoading(false);}}
 useEffect(()=>{setSnapshot(null);void load();return()=>{++request.current;};},[target]);
 async function save(){if(!snapshot)return false;setSaving(true);onBusy(true);try{accept(await invoke<HermesSettings>('upstream_hermes_save',{target,change:{kind:'settings',revision:snapshot.revision,...payload}}));notifySuccess(t('已保存，新会话生效。','Saved. Applies to new sessions.'));onSaved();return true;}catch(e){setError(String(e),t("Hermes 设置保存失败，请重新保存。","Hermes settings could not be saved. Save again."));return false;}finally{setSaving(false);onBusy(false);}}
  function requestLeave(action: () => void) {
    if(saving)return;
    if(!dirty){action();return;}
    if(pendingAction.current)return;
    pendingAction.current=action;setConfirmLeave(true);
  }
  useImperativeHandle(ref,()=>({requestLeave}));
  function cancelLeave() {pendingAction.current=null;setConfirmLeave(false);}
  function finishLeave() {const action=pendingAction.current;cancelLeave();action?.();}
  const closeRequested=useEffectEvent((event: {preventDefault: () => void})=>{
    if(allowClose.current||!dirty&&!saving)return;
    event.preventDefault();
    requestLeave(()=>{
      allowClose.current=true;
      void getCurrentWindow().destroy().catch(reason=>{allowClose.current=false;setError(String(reason),t("窗口未关闭，请再次关闭。","The window did not close. Close it again."));});
    });
  });
  useEffect(()=>{
    let disposed=false;
    let unlisten:(()=>void)|undefined;
    void getCurrentWindow().onCloseRequested(event=>closeRequested(event)).then(stop=>{if(disposed)stop();else unlisten=stop;}).catch(reason=>setError(String(reason),t("关闭确认未就绪，请先保存修改。","Close confirmation is unavailable. Save changes before closing.")));
    return()=>{disposed=true;unlisten?.();};
  },[]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(event:BeforeUnloadEvent)=>{if(!allowClose.current)event.preventDefault();};
    window.addEventListener("beforeunload",warn);
    return()=>window.removeEventListener("beforeunload",warn);
  },[dirty]);

 async function addDirectory(){const path=await open({directory:true});if(typeof path==='string')setDirectories(v=>[...v,displayHomePath(path,home)]);}
 const projectTrusted=!!snapshot?.projectRoot&&trusted.includes(snapshot.projectRoot);
 return <section className="flex flex-col gap-5" aria-label={t('Hermes 管理','Hermes management')}>
  <div className="flex items-center gap-3">
   <BackButton disabled={saving} onClick={()=>requestLeave(onBack)} label={t('返回智能体列表','Back to Agents')}/>
   <span className="flex items-center gap-2 font-semibold"><AgentLogo name="hermes-agent" size={22}/>Hermes</span>
   <Hint text={t('重新读取','Reload')} disabled={locked}><Button className="ml-auto" variant="outline" size="icon-sm" disabled={locked} onClick={()=>requestLeave(()=>void load())} aria-label={t('重新读取 Hermes 设置','Reload Hermes settings')}><RefreshCwIcon aria-hidden="true"/></Button></Hint>
  </div>
  {loading&&<Skeleton className="h-32 w-full"/>}
  {snapshot&&<>
   <Card>
    <CardHeader><CardTitle>{t('配置',"Configuration")}</CardTitle><p className="break-all font-mono text-xs text-muted-foreground">{displayHomePath(snapshot.path,home)}</p></CardHeader>
    <CardContent><FieldGroup>
     <Field data-disabled={locked}>
      <div className="flex items-center justify-between gap-3"><FieldTitle>{t('附加技能目录','Additional skill directories')}</FieldTitle><Hint text={t('添加目录','Add directory')} disabled={locked}><Button variant="ghost" size="icon-sm" disabled={locked} onClick={()=>void addDirectory().catch(e=>setError(String(e)))} aria-label={t('添加技能目录','Add skill directory')}><PlusIcon aria-hidden="true"/></Button></Hint></div>
      {directories.length>0&&<FieldContent className="gap-2">{directories.map((path,i)=><div key={i} className="flex items-center gap-2"><FolderOpenIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground"/><Input autoComplete="off" spellCheck={false} name={`external-directory-${i}`} aria-label={t(`技能目录 ${i+1}`,`Skill directory ${i+1}`)} disabled={locked} value={path} onChange={e=>setDirectories(v=>v.map((p,j)=>j===i?e.target.value:p))}/><Button variant="ghost" size="icon-sm" disabled={locked} aria-label={t('移除目录配置','Remove directory setting')} onClick={()=>setDirectories(v=>v.filter((_,j)=>j!==i))}><Trash2Icon aria-hidden="true"/></Button></div>)}</FieldContent>}
     </Field>
     <Field><FieldLabel htmlFor={`${id}-create`}>{t('技能创建目录','Skill creation directory')}</FieldLabel><Input autoComplete="off" spellCheck={false} name="skill-create-directory" id={`${id}-create`} disabled={locked} value={createDir} placeholder={displayHomePath(snapshot.hermesHome+'/skills',home)} onChange={e=>setCreateDir(e.target.value)}/></Field>
     <Field orientation="horizontal"><FieldContent><FieldLabel htmlFor={`${id}-discover`}>{t('加载项目技能','Load project skills')}</FieldLabel><FieldDescription>{t('仅加载已信任项目中的技能。','Load skills only from trusted projects.')}</FieldDescription></FieldContent><Switch id={`${id}-discover`} disabled={locked} checked={discovery} onCheckedChange={setDiscovery}/></Field>
     <Field><div className="flex items-center gap-1"><FieldLabel htmlFor={`${id}-preload`}>{t('会话预加载','Session preload')}</FieldLabel><HelpPopover label={t('预加载帮助','Preload help')}><p>{t('新会话开始时加载完整技能内容。每行一个技能名称。','Load full skill content when a new session starts. One skill name per line.')}</p></HelpPopover></div><Textarea autoComplete="off" spellCheck={false} name="skill-auto-load" id={`${id}-preload`} disabled={locked} rows={3} value={autoLoad} placeholder="skill-name" onChange={e=>setAutoLoad(e.target.value)}/></Field>
    </FieldGroup></CardContent>
   </Card>
   <Card>
    <CardHeader><CardTitle>{t('项目信任','Project trust')}</CardTitle></CardHeader>
    <CardContent><FieldGroup>
     <Field orientation="responsive"><FieldLabel htmlFor={`${id}-project`}>{t('项目','Project')}</FieldLabel><Select value={target.projectPath??'none'} disabled={locked} onValueChange={path=>requestLeave(()=>setTarget(path==='none'?{host:'local',scope:'global',projectPath:null}:{host:'local',scope:'project',projectPath:path}))}><SelectTrigger id={`${id}-project`} className="w-full min-w-0 @md/field-group:w-64" aria-label={t('选择信任项目','Choose project to trust')}><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="none">{t('选择项目','Choose a project')}</SelectItem>{projects.map(p=><SelectItem key={p.path} value={p.path}>{p.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
     {target.scope==='project'&&<Field orientation="horizontal"><FieldContent><FieldLabel htmlFor={`${id}-trust`}>{t('信任此项目','Trust this project')}</FieldLabel><p className="break-all font-mono text-xs text-muted-foreground">{snapshot.projectRoot?displayHomePath(snapshot.projectRoot,home):t('未识别 Git 项目','No Git project found')}</p></FieldContent><Switch id={`${id}-trust`} disabled={locked||!snapshot.projectRoot} checked={projectTrusted} onCheckedChange={value=>{if(value)setConfirmTrust(true);else setTrusted(v=>v.filter(p=>p!==snapshot.projectRoot));}}/></Field>}
     {trusted.some(path=>path!==snapshot.projectRoot)&&<Field><FieldTitle>{target.scope==='project'?t('其他已信任项目','Other trusted projects'):t('已信任项目','Trusted projects')}</FieldTitle><FieldContent className="gap-2">{trusted.filter(path=>path!==snapshot.projectRoot).map(path=><div key={path} className="flex items-center justify-between gap-2"><Hint text={displayHomePath(path,home)} focusable><span className="min-w-0 truncate font-mono text-xs">{displayHomePath(path,home)}</span></Hint><Button variant="ghost" size="icon-sm" disabled={locked} aria-label={t(`取消信任 ${displayHomePath(path,home)}`,`Untrust ${displayHomePath(path,home)}`)} onClick={()=>setTrusted(v=>v.filter(p=>p!==path))}><Trash2Icon aria-hidden="true"/></Button></div>)}</FieldContent></Field>}
    </FieldGroup></CardContent>
   </Card>
   {snapshot.warnings.length>0&&<details className="text-xs text-muted-foreground"><summary>{t('读取异常','Read issues')}</summary><ul className="mt-2 flex flex-col gap-1">{hermesInspectionWarnings(snapshot.warnings,home,zh).map(message=><li key={message}>{message}</li>)}</ul></details>}
   <Field orientation="horizontal" className="justify-end gap-3" aria-busy={saving}><Button disabled={locked||!dirty} onClick={()=>void save()}>{saving?t('保存中…','Saving…'):t('保存','Save')}</Button></Field>
  </>}
  <AlertDialog open={confirmTrust} onOpenChange={setConfirmTrust}><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{t('信任此项目？','Trust this project?')}</AlertDialogTitle><AlertDialogDescription>{t('允许 Hermes 加载此仓库中的技能。','Allow Hermes to load skills from this repository.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogBody className="break-all font-mono text-xs">{displayHomePath(snapshot?.projectRoot??'',home)}</AlertDialogBody><AlertDialogFooter><AlertDialogCancel>{t('取消','Cancel')}</AlertDialogCancel><AlertDialogAction onClick={()=>{if(snapshot?.projectRoot)setTrusted(v=>[...new Set([...v,snapshot.projectRoot!])]);}}>{t('信任','Trust')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  <AlertDialog open={confirmLeave} onOpenChange={value=>{if(!value&&!saving)cancelLeave();}}><AlertDialogContent size="sm" onEscapeKeyDown={e=>{if(saving)e.preventDefault();}}><AlertDialogHeader><AlertDialogTitle>{t('保存 Hermes 设置？','Save Hermes settings?')}</AlertDialogTitle><AlertDialogDescription>{t('有未保存的修改。','You have unsaved changes.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving} onClick={cancelLeave}>{t('继续编辑','Keep editing')}</AlertDialogCancel><Button variant="outline" disabled={saving} onClick={finishLeave}>{t('放弃修改','Discard changes')}</Button><AlertDialogAction disabled={saving} onClick={e=>{e.preventDefault();void save().then(ok=>{if(ok)finishLeave();});}}>{t('保存并继续','Save and continue')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </section>;
}
