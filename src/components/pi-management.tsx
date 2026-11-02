import { BackButton } from '@/components/back-button';
import { AgentLogo } from '@/components/agent-logo';
import { Choice } from '@/components/choice';
import { Hint } from "@/components/hint";
import { OverflowText } from "@/components/overflow-text";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { notifySuccess, useFeedbackError } from "@/lib/notifications";
import { useEffect, useEffectEvent, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { CheckIcon, CodeXmlIcon, FolderIcon, FolderOpenIcon, GlobeIcon, MousePointerClickIcon, PencilIcon, PlusIcon, PowerIcon, PowerOffIcon, RefreshCwIcon, RotateCcwIcon, SaveIcon, SlidersHorizontalIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpPopover } from "@/components/help-popover";
import { AlertDialog, AlertDialogContent, AlertDialogBody, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { notificationError } from "@/lib/notification-message";
import { isPiRule, piSettingsEntries, piDirectoryDisplayPath, type PiSettings } from "@/lib/pi";
import { displayHomePath, expandHomePath, type Project, type Target } from "@/lib/upstream";

export type PiManagementHandle = { requestLeave: (action: () => void) => void };
type Props = { ref?: Ref<PiManagementHandle>; zh: boolean; home: string; projects: Project[]; initialTarget: Target; disabled: boolean; onBack: () => void; onBusy: (value: boolean) => void; onSaved: () => void };
export function PiManagement({ref,zh,home,projects,initialTarget,disabled,onBack,onBusy,onSaved}: Props) {
  const t = (cn:string,en:string) => zh ? cn : en;
  const [target,setTarget] = useState(initialTarget);
  const [snapshot,setSnapshot] = useState<PiSettings | null>(null);
  const [directories,setDirectories] = useState<string[]>([]);
  const [directoryDraft,setDirectoryDraft] = useState("");
  const [addingDirectory,setAddingDirectory] = useState(false);
  const [editingDirectory,setEditingDirectory] = useState<number|null>(null);
  const [directoryError,setDirectoryError] = useState<string | null>(null);
  const [checkingDirectory,setCheckingDirectory] = useState(false);
  const [projectTrust,setProjectTrust] = useState(false);
  const [confirmTrust,setConfirmTrust] = useState(false);
  const [skillCommands,setSkillCommands] = useState<boolean | null>(null);
  const [startupEnabled,setStartupEnabled] = useState(false);
  const [callMode,setCallMode] = useState('on');
  const [toolBudget,setToolBudget] = useState('3000');
  const [, setError] = useFeedbackError(zh);
  const [loading,setLoading] = useState(false);
  const [saving,setSaving] = useState(false);
  const request = useRef(0);
  const pendingAction = useRef<(() => void) | null>(null);
  const [confirmLeave,setConfirmLeave] = useState(false);
  const allowClose = useRef(false);
  const addDirectoryButton = useRef<HTMLButtonElement>(null);
  const editDirectoryButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  function accept(value:PiSettings) {
    setStartupEnabled(value.codemode?.startupEnabled??false);
    setCallMode(value.codemode?.mode??(value.target.scope==='project'?'inherit':'on'));
    setToolBudget(value.codemode?.inlineBudget?.toString()??(value.target.scope==='project'?'inherit':'3000'));
    setDirectoryError(null);setDirectoryDraft("");setAddingDirectory(false);setEditingDirectory(null);setSnapshot(value);setProjectTrust(value.projectTrustDecision ?? value.projectTrusted ?? false);setSkillCommands(value.skillCommands);setDirectories(value.entries.filter(entry=>!isPiRule(entry)).map(entry=>displayHomePath(entry,home)));
  }
  async function load() {
    const id=++request.current;setLoading(true);setError("");
    try {const value=await invoke<PiSettings>("upstream_pi_settings",{target});if(id===request.current)accept(value);}
    catch(reason){if(id===request.current)setError(String(reason),t("Pi 设置读取失败，请重新读取。","Pi settings could not be read. Reload them."));}
    finally{if(id===request.current)setLoading(false);}
  }
  useEffect(()=>{setSnapshot(null);void load();return()=>{++request.current;};},[target]);
  const originalDirectories=snapshot?.entries.filter(entry=>!isPiRule(entry))??[];
  const directoryEntries=[...directories,directoryDraft].filter(value=>value.trim()).map(value=>originalDirectories.find(entry=>displayHomePath(entry,home)===value)??expandHomePath(value.trim(),home));
  const entries=piSettingsEntries(snapshot?.entries??[],directoryEntries);
  const code = snapshot?.codemode;
  const project = target.scope==='project';
  const originalMode=code?.mode??(project?'inherit':'on');
  const originalBudget=code?.inlineBudget?.toString()??(project?'inherit':'3000');
  const codePatch = {
    ...(code && startupEnabled!==code.startupEnabled ? {startupEnabled} : {}),
    ...(callMode!==originalMode ? {mode:callMode==='inherit'?null:callMode} : {}),
    ...(toolBudget!==originalBudget ? {inlineBudget:toolBudget==='inherit'?null:Number(toolBudget)} : {}),
  };
  const budgetError=toolBudget!=='inherit' && (!toolBudget.trim() || !Number.isFinite(Number(toolBudget)) || Number(toolBudget)<0);
  const settingsDirty=!!snapshot && (skillCommands!==snapshot.skillCommands || JSON.stringify(entries)!==JSON.stringify(snapshot.entries) || Object.keys(codePatch).length>0);
  const trustDirty=project && !!snapshot && projectTrust !== (snapshot.projectTrustDecision ?? snapshot.projectTrusted ?? false);
  const dirty=settingsDirty || trustDirty;
  async function save() {
    if(!snapshot||budgetError)return false;
    setSaving(true);onBusy(true);setError("");let wrote=false;let trustSaved=false;
    try {
      const changedDirectories=directoryEntries.filter(value=>!snapshot.entries.includes(value));
      if(changedDirectories.length)await invoke("upstream_pi_validate_directories",{target,paths:changedDirectories});
      let value=snapshot;
      if(trustDirty){
        if(!snapshot.trustRevision)throw new Error(t("请重新读取 Pi 设置。","Reload Pi settings."));
        value=await invoke<PiSettings>("upstream_pi_trust",{change:{target,revision:snapshot.trustRevision,trusted:projectTrust}});
        setSnapshot(value);trustSaved=true;wrote=true;
      }
      if(settingsDirty){
        value=await invoke<PiSettings>("upstream_pi_save",{change:{target,revision:value.revision,entries,skillCommands,...(Object.keys(codePatch).length?{codemode:codePatch}:{})},builtins:null});wrote=true;
      }
      accept(value);notifySuccess(t("已保存，请在 Pi 中运行 /reload。","Saved. Run /reload in Pi to apply changes."));return true;}
    catch(reason){
      const fallback=t("Pi 设置保存失败，请重新保存。","Pi settings could not be saved. Save again.");
      if(trustSaved)setError(t("项目信任已保存。","Project trust saved. ")+notificationError(String(reason),zh,fallback));
      else setError(String(reason),fallback);
      return false;
    }
    finally{setSaving(false);onBusy(false);if(wrote)onSaved();}
  }
  function requestLeave(action: () => void) {
    if(saving||checkingDirectory)return;
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
  async function addDirectory(pick = false) {
    if(locked)return;
    setCheckingDirectory(true);setDirectoryError(null);
    try {
      const value=pick ? await open({directory:true,multiple:false}) : directoryDraft.trim();
      if(!value)return;
      if(typeof value!=="string")return;
      await invoke("upstream_pi_validate_directories",{target,paths:[expandHomePath(value,home)]});
      setDirectories(current=>current.includes(displayHomePath(value,home))?current:[...current,displayHomePath(value,home)]);
      setDirectoryDraft("");setAddingDirectory(false);
      requestAnimationFrame(()=>addDirectoryButton.current?.focus());
    } catch(reason) {
      if(String(reason).includes("Pi skill directory is unavailable:"))setDirectoryError(t("无法使用此目录，请检查路径和访问权限。","This folder is unavailable. Check its path and permissions."));
      else setError(String(reason),t("目录添加失败，请检查路径后重新添加。","Could not add the folder. Check the path and add it again."));
    } finally {setCheckingDirectory(false);}
  }
  const locked=disabled||loading||saving||checkingDirectory;
  return <section aria-label={t("Pi 设置","Pi settings")} className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center gap-3">
      <BackButton label={t('返回智能体列表','Back to Agents')} disabled={saving} onClick={()=>requestLeave(onBack)} />
      <span className="flex min-w-0 items-center gap-2 font-semibold"><AgentLogo name="pi" size={22}/>{t('Pi 设置','Pi settings')}</span>
      <div className="ml-auto flex items-center gap-2">
        <Choice className="w-48 shrink-0" disabled={locked} value={target.projectPath??"global"} label={t('Pi 配置范围','Pi settings scope')} options={[{value:'global',label:t('全局','Global'),icon:GlobeIcon},...projects.map(project=>({value:project.path,label:project.name,icon:FolderIcon}))]} onChange={value=>requestLeave(()=>setTarget(value==="global"?{host:"local",scope:"global",projectPath:null}:{host:"local",scope:"project",projectPath:value}))} />
        <Hint text={t("重新读取","Reload")} disabled={locked}><Button variant="outline" size="icon-sm" disabled={locked} aria-label={t("重新读取 Pi 设置","Reload Pi settings")} onClick={()=>requestLeave(()=>void load())}><RefreshCwIcon aria-hidden="true" /></Button></Hint>
      </div>
    </div>
    {loading&&<div role="status" aria-label={t("正在读取 Pi 设置…","Reading Pi settings…")}><Skeleton className="h-40 w-full" /></div>}
    {snapshot&&<>
      {target.scope==="project"&&<Card><CardContent><FieldGroup><Field orientation="horizontal" data-disabled={locked}>
        <FieldContent><FieldLabel htmlFor={`${id}-trust`}>{t("信任此项目","Trust this project")}</FieldLabel><FieldDescription>{t("允许加载项目中的技能、扩展和配置。","Allow skills, extensions and configuration from this project.")}</FieldDescription></FieldContent>
        <Switch id={`${id}-trust`} disabled={locked} checked={projectTrust} onCheckedChange={value=>{if(value)setConfirmTrust(true);else setProjectTrust(false);}} />
      </Field></FieldGroup></CardContent></Card>}
      <Card><CardHeader><CardTitle id={`${id}-loading`}>{t('技能加载','Skill loading')}</CardTitle></CardHeader><CardContent><FieldGroup className="settings-fields">
        <Field orientation="horizontal" data-disabled={locked}>
          <FieldContent><FieldLabel htmlFor={`${id}-commands`}>{t("技能命令补全","Skill command completion")}</FieldLabel><FieldDescription>{t("在 Pi 命令列表中显示技能","Show skills in Pi command completion")}</FieldDescription></FieldContent>
          <Hint stable text={(skillCommands??snapshot.inheritedSkillCommands)?t("显示","Show"):t("隐藏","Hide")} disabled={locked}><Switch id={`${id}-commands`} disabled={locked} checked={skillCommands??snapshot.inheritedSkillCommands} onCheckedChange={setSkillCommands} /></Hint>
        </Field>
        <Field data-disabled={locked}>
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center gap-1"><FieldLabel>{t("附加技能目录","Additional skill directories")}</FieldLabel>
              <HelpPopover label={t("附加技能目录帮助","Additional directory help")}>
                <p>{t("读取其他目录里的技能，例如 ~/my-skills。","Read skills from other folders, such as ~/my-skills.")}</p>
                <p>{t("点击“添加目录”后输入路径，或选择文件夹。移除目录不会删除文件。","Click Add directory to enter a path or choose a folder. Removing an entry keeps its files.")}</p>
                <p>{t("相对路径基于：","Relative paths start at: ")}<code className="break-all">{displayHomePath(snapshot.path.replace(/[\\/][^\\/]+$/, ""),home)}</code></p>
              </HelpPopover>
            </div>
            <Button ref={addDirectoryButton} variant="outline" size="sm" disabled={locked||addingDirectory} onClick={()=>{setAddingDirectory(true);setEditingDirectory(null);}}><PlusIcon data-icon="inline-start" aria-hidden="true" />{t("添加目录","Add directory")}</Button>
          </div>
          <FieldContent className="w-full gap-2">{directories.map((directory,index)=><div className="flex min-w-0 items-center gap-2" key={index}>
            <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {editingDirectory===index?<Input autoFocus className="min-w-0 flex-1" name={`pi-directory-${index}`} disabled={locked} value={directory} spellCheck={false} autoComplete="off" aria-label={`${t("技能目录","Skill directory")} ${index+1}`} onChange={event=>{setDirectories(values=>values.map((value,at)=>at===index?event.target.value:value));}} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();editDirectoryButton.current?.focus();setEditingDirectory(null);}}} />:<OverflowText text={directory} displayText={piDirectoryDisplayPath(directory)} className="block min-w-0 flex-1 truncate text-sm" />}
            <Button ref={editingDirectory===index?editDirectoryButton:undefined} variant="ghost" size="sm" disabled={locked} aria-label={`${editingDirectory===index?t('完成目录编辑','Finish editing directory'):t('编辑目录','Edit directory')} ${index+1}`} onClick={()=>setEditingDirectory(editingDirectory===index?null:index)}>{editingDirectory===index?<CheckIcon aria-hidden="true" />:<PencilIcon aria-hidden="true" />}{editingDirectory===index?t('完成','Done'):t('编辑','Edit')}</Button>
            <Hint text={t("移除目录配置","Remove directory entry")} disabled={locked}><Button variant="ghost" size="icon-sm" disabled={locked} aria-label={`${t("移除目录配置","Remove directory entry")} ${index+1}`} onClick={()=>{setDirectories(values=>values.filter((_,at)=>at!==index));setEditingDirectory(null);}}><Trash2Icon aria-hidden="true" /></Button></Hint>
          </div>)}
          {!directories.length&&!addingDirectory&&<p className="text-sm text-muted-foreground">{t('未添加','No additional directories')}</p>}
          {addingDirectory&&<Field className="gap-1.5" data-invalid={!!directoryError}>
            <div className="flex min-w-0 items-center gap-2">
              <Input autoFocus className="min-w-0 flex-1" name="pi-additional-directory" disabled={locked} aria-label={t("附加技能目录","Additional skill directories")} aria-invalid={!!directoryError} aria-describedby={directoryError?`${id}-directory-error`:undefined} placeholder="~/skills" spellCheck={false} autoComplete="off" value={directoryDraft} onChange={event=>{setDirectoryDraft(event.target.value);setDirectoryError(null);}} onKeyDown={event=>{if(event.key==="Enter" && !event.nativeEvent.isComposing && directoryDraft.trim()){event.preventDefault();void addDirectory();}}} />
              <Hint text={t('选择文件夹','Choose folder')} disabled={locked}><Button variant="ghost" size="icon-sm" disabled={locked} aria-label={t('选择技能文件夹','Choose skill folder')} onClick={()=>void addDirectory(true)}><FolderOpenIcon aria-hidden="true" /></Button></Hint>
              <Button variant="outline" size="sm" disabled={locked||!directoryDraft.trim()} onClick={()=>void addDirectory()}><PlusIcon aria-hidden="true" />{t('添加','Add')}</Button>
              <Button variant="ghost" size="sm" disabled={locked} onClick={()=>{setAddingDirectory(false);setDirectoryDraft('');setDirectoryError(null);requestAnimationFrame(()=>addDirectoryButton.current?.focus());}}><XIcon aria-hidden="true" />{t('取消','Cancel')}</Button>
            </div>
            {directoryError&&<FieldError id={`${id}-directory-error`}>{directoryError}</FieldError>}
          </Field>}</FieldContent>
        </Field>
      </FieldGroup></CardContent></Card>
      <Card><CardHeader><CardTitle>{t('代码模式','Code mode')}</CardTitle></CardHeader><CardContent><FieldGroup className="settings-fields">
        <Field orientation="horizontal" data-disabled={locked||!code}>
          <FieldContent><div className="flex items-center gap-1"><FieldLabel id={`${id}-startup-label`}>{t('启动模式','Startup mode')}</FieldLabel>{code?.extensionEnabled===false&&<HelpPopover label={t('扩展加载说明','Extension loading help')}><p>{t('代码模式扩展当前未加载；更改启动模式不会恢复扩展加载。','The code mode extension is excluded from loading. Changing the startup mode keeps that exclusion.')}</p></HelpPopover>}</div><FieldDescription>{t('选择新会话是否默认开启代码模式。','Choose whether code mode is enabled by default in new sessions.')}</FieldDescription>{!code&&<FieldDescription>{t('无法读取代码模式设置，请检查 Pi 安装后重新读取。','Code mode settings are unavailable. Check your Pi installation and reload.')}</FieldDescription>}</FieldContent>
          <ToggleGroup type="single" value={startupEnabled?'on':'off'} disabled={locked||!code} onValueChange={value=>{if(value==='on'||value==='off')setStartupEnabled(value==='on');}} size="default" className="segmented-control shrink-0" aria-labelledby={`${id}-startup-label`}>
            <ToggleGroupItem value="on"><PowerIcon aria-hidden="true" />{t('默认开启','Default on')}</ToggleGroupItem>
            <ToggleGroupItem value="off"><PowerOffIcon aria-hidden="true" />{t('默认关闭','Default off')}</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field orientation="horizontal" data-disabled={locked||!code}>
          <FieldContent><div className="flex items-center gap-1"><FieldLabel htmlFor={`${id}-call-mode`}>{t('调用方式','Tool calls')}</FieldLabel><HelpPopover label={t('调用方式说明','Tool calls help')}>
            <p>{t('直接调用：模型可以直接调用工具，也可以通过脚本调用。','Direct calls: the model can call tools directly or through scripts.')}</p>
            <p>{t('仅脚本调用：支持脚本调用的工具不再单独展示给模型，改由脚本调用。','Script calls only: tools that support scripts are no longer declared separately to the model and are called through scripts.')}</p>
            <p>{t('此设置仅在代码模式开启后生效，不影响工具的安装和启用状态。','This setting applies while code mode is active. It does not install, uninstall, enable or disable tools.')}</p>
          </HelpPopover></div><FieldDescription>{t('选择模型调用工具的方式。','Choose how the model calls tools.')}</FieldDescription></FieldContent>
          <Choice id={`${id}-call-mode`} className="w-48 shrink-0" label={t('调用方式','Tool calls')} value={callMode} disabled={locked||!code} options={[...(project?[{value:'inherit',label:t('跟随全局','Follow global'),icon:RotateCcwIcon}]:[]),{value:'on',label:t('直接调用','Direct calls'),icon:MousePointerClickIcon},{value:'only',label:t('仅脚本调用','Script calls only'),icon:CodeXmlIcon}]} onChange={setCallMode}/>
        </Field>
        <Field orientation="horizontal" data-disabled={locked||!code} data-invalid={budgetError}>
          <FieldContent className="self-start"><div className="flex items-center gap-1"><FieldLabel htmlFor={`${id}-budget${project?'-mode':''}`}>{t('工具预算','Tool budget')}</FieldLabel><HelpPopover label={t('工具预算说明','Tool budget help')}>
            <p>{t('默认值为 3000。设为 0 时不预先展示工具说明，模型通过搜索查找工具。','Defaults to 3000. Set to 0 to omit tool descriptions from the initial context and let the model find tools through search.')}</p>
            <p>{t('超出预算的工具仍可使用；此设置不限制工具执行结果或模型回复的长度。','Tools beyond the budget remain available. This setting does not limit tool results or model responses.')}</p>
          </HelpPopover></div><FieldDescription>{t('控制代码模式中工具说明的长度，单位为 token。','Control the length of tool descriptions in code mode, measured in tokens.')}</FieldDescription>{budgetError&&<FieldError id={`${id}-budget-error`}>{t('请输入不小于 0 的数字。','Enter a number greater than or equal to 0.')}</FieldError>}</FieldContent>
          <div className="flex shrink-0 flex-col gap-2">
            {project&&<Choice id={`${id}-budget-mode`} className="w-48" label={t('工具预算设置','Tool budget setting')} value={toolBudget==='inherit'?'inherit':'custom'} options={[{value:'inherit',label:t('跟随全局','Follow global'),icon:RotateCcwIcon},{value:'custom',label:t('自定义','Custom'),icon:SlidersHorizontalIcon}]} disabled={locked||!code} onChange={value=>setToolBudget(value==='inherit'?'inherit':String(code?.inlineBudget??code?.inheritedInlineBudget??3000))}/>}
            {toolBudget!=='inherit'&&<Input id={`${id}-budget`} className="w-48" name="pi-tool-budget" aria-label={t('工具预算','Tool budget')} autoComplete="off" type="number" inputMode="decimal" min={0} step="any" value={toolBudget} disabled={locked||!code} aria-invalid={budgetError} aria-describedby={budgetError?`${id}-budget-error`:undefined} onChange={event=>setToolBudget(event.target.value)}/>}
          </div>
        </Field>
      </FieldGroup></CardContent></Card>
      {snapshot.warnings.length>0&&<details className="text-xs text-muted-foreground"><summary>{t("目录检查提示","Directory inspection notes")} ({snapshot.warnings.length})</summary><ul className="mt-2 flex flex-col gap-1">{snapshot.warnings.map((warning,index)=><li key={index}>{displayHomePath(warning,home)}</li>)}</ul></details>}
      <Field orientation="horizontal" className="justify-end gap-3" aria-busy={saving}>
        <Button disabled={locked||!dirty||budgetError} onClick={()=>void save()}><SaveIcon aria-hidden="true" />{saving?t("保存中…","Saving…"):t("保存","Save")}</Button>
      </Field>
    </>}
    <AlertDialog open={confirmTrust} onOpenChange={setConfirmTrust}>
      <AlertDialogContent size="sm"><AlertDialogHeader>
        <AlertDialogTitle>{t("信任此项目？","Trust this project?")}</AlertDialogTitle>
        <AlertDialogDescription>{t("允许 Pi 加载此项目及子目录中的技能、扩展和配置。","Allow Pi to load skills, extensions and configuration from this project and its subdirectories.")}</AlertDialogDescription>
      </AlertDialogHeader><AlertDialogBody><p className="break-all font-mono text-xs text-muted-foreground">{displayHomePath(target.projectPath??"",home)}</p></AlertDialogBody><AlertDialogFooter>
        <AlertDialogCancel>{t("取消","Cancel")}</AlertDialogCancel>
        <AlertDialogAction onClick={()=>{setProjectTrust(true);setConfirmTrust(false);}}>{t("信任","Trust")}</AlertDialogAction>
      </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={confirmLeave} onOpenChange={open=>{if(!open&&!saving)cancelLeave();}}>
      <AlertDialogContent size="sm" aria-busy={saving} onEscapeKeyDown={event=>{if(saving)event.preventDefault();}}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("保存 Pi 设置？","Save Pi settings?")}</AlertDialogTitle>
          <AlertDialogDescription>{t("有未保存的修改。","You have unsaved changes.")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving} onClick={cancelLeave}>{t("继续编辑","Keep editing")}</AlertDialogCancel>
          <Button variant="outline" disabled={saving} onClick={finishLeave}>{t("放弃修改","Discard changes")}</Button>
          <AlertDialogAction disabled={saving} onClick={event=>{event.preventDefault();void save().then(ok=>{if(ok)finishLeave();});}}>{saving?t("保存中…","Saving…"):t("保存并继续","Save and continue")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
