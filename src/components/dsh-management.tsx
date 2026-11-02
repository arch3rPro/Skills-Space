import { useEffect, useEffectEvent, useId, useImperativeHandle, useRef, useState, type Ref, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ChevronDownIcon, FilePenLineIcon, FolderOpenIcon, FolderSearchIcon, LayersIcon, PencilIcon, CheckIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { BackButton } from '@/components/back-button';
import { AgentLogo } from '@/components/agent-logo';
import { Hint } from '@/components/hint';
import { HelpPopover } from '@/components/help-popover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal, ModalActions } from '@/components/modal';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { DshConfigurationChoice, DshPresetChoices } from '@/components/dsh-settings-context';
import { OverflowText } from '@/components/overflow-text';
import { DirectoryLink } from '@/components/directory-link';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogContent, AlertDialogBody, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { notifySuccess, useFeedbackError } from '@/lib/notifications';
import { displayHomePath, expandHomePath, type Project, type Target } from '@/lib/upstream';
import { dshPresetConfigurations, dshSelectPreset, dshPresetContextKey, dshPresetText, dshReadOnlyReason, dshScopeKey, dshSkillsPath, dshHomeFromSkillsPath, type DshEditorHandle, type DshSnapshot, type DshConfiguration } from '@/lib/dsh';

function DshSettingsDisclosure({title,children}:{title:string;children:ReactNode}) {
  return <Collapsible>
    <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="w-full justify-start [&[data-state=open]>svg]:rotate-180"><ChevronDownIcon data-icon="inline-start" aria-hidden="true"/>{title}</Button></CollapsibleTrigger>
    <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
  </Collapsible>;
}
type Props = {
  backLabel?:string;initialContext?:string|null;ref?: Ref<DshEditorHandle>; home: string; projects: Project[]; initialTarget: Target;
  zh: boolean; disabled: boolean; onBack: () => void; onBusy: (busy: boolean) => void;
  onSaved: () => void; contexts: Record<string,string|null>; onContext: (target: Target, key: string | null, filePath?:string|null) => void;
};

export function DshManagement({backLabel,initialContext,ref, home, initialTarget, zh, disabled, onBack, onBusy, onSaved, contexts, onContext}: Props) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const id = useId();
  const target:Target={host:'local',scope:'global',projectPath:null};
  const [context, setContext] = useState(initialContext??contexts.settings ?? contexts[dshScopeKey(initialTarget)] ?? '');
  const [snapshot, setSnapshot] = useState<DshSnapshot | null>(null);
  const [filePath,setFilePath]=useState('');
  const [directories, setDirectories] = useState<string[]>([]);
  const [includeDefaults, setIncludeDefaults] = useState(true);
  const [extra,setExtra] = useState({dshHome:'',agentsHome:''});
  const [editingRoot,setEditingRoot]=useState<'dshHome'|'agentsHome'|null>(null);
  const [rootDraft,setRootDraft]=useState('');
  const [resetRoot,setResetRoot]=useState(false);
  const [confirmReset,setConfirmReset] = useState(false);
  const [confirmMaterialize,setConfirmMaterialize]=useState(false);
  const [editingDirectory,setEditingDirectory]=useState<number|null>(null);
  const [addingDirectory,setAddingDirectory]=useState(false);
  const [directoryDraft,setDirectoryDraft]=useState('');
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, setError] = useFeedbackError(zh);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const request = useRef(0);
  const saveButton=useRef<HTMLButtonElement>(null);
  const requestedContext = useRef('');
  const requestedFile = useRef('');
  const pending = useRef<(() => void) | null>(null);
  const allowClose = useRef(false);
  const presetConfigurations=dshPresetConfigurations(snapshot?.configurations??[]);
  const presets=snapshot?.presets??[];
  const selectedPreset=presets.find(preset=>preset.path===filePath&&(preset.key===context||preset.configurationKeys.includes(context)));
  const files=snapshot?.configurationFiles??[...new Map((snapshot?.configurations??[]).map(item=>[item.path,{path:item.path,profile:item.profile,installation:item.installation,exists:item.patchExists!==false}])).values()];
  const currentFile=files.find(file=>file.path===filePath);
  const row = presetConfigurations.find(item => item.key === context&&item.path===filePath);
  const displayExtra = (value?:DshConfiguration) => {return {dshHome:displayHomePath(value?.dshHome??'',home),agentsHome:displayHomePath(value?.agentsHome??'',home)};};
  const expanded = directories.map(path => expandHomePath(path.trim(), home));
  const directoryErrors = expanded.map(path => !path.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(path));
  const extraPaths=[extra.dshHome,extra.agentsHome].map(path=>expandHomePath(path.trim(),home));
  const draftPath=expandHomePath(directoryDraft.trim(),home);
  const draftInvalid=!!draftPath&&!draftPath.startsWith('/')&&!/^[a-zA-Z]:[\\/]/.test(draftPath);
  const invalid = addingDirectory&&!!directoryDraft.trim()||directoryErrors.some(Boolean)||extraPaths.some(path=>!!path&&!path.startsWith('/')&&!/^[a-zA-Z]:[\\/]/.test(path));
  const directoryDirty=!!row&&(JSON.stringify(expanded)!==JSON.stringify(row.customSkillDirs)||includeDefaults!==(row.includeDefaultRoots??true)||extra.dshHome!==displayExtra(row).dshHome||extra.agentsHome!==displayExtra(row).agentsHome);
  const dirty=!!row?.editable&&(addingDirectory&&!!directoryDraft.trim()||directoryDirty);
  const locked = disabled || loading || saving;
  const fieldLocked=(item:DshConfiguration,key:string)=>locked||!item.editable||!!item.unresolvedFields?.includes(key)||!!item.readOnlyFields?.includes(key);
  const fieldReason=(key:string)=>row?.readOnlyFields?.includes(key)?t('当前 DSH 安装无法验证此设置的写入接口，只读。','The write interface for this setting could not be verified in this installation; read-only.'):null;
  const defaultLocations=([{key:'dshHome',label:t('用户技能目录','User skill directory'),fallback:snapshot?.dshHome},{key:'agentsHome',label:t('共享技能目录','Shared skill directory'),fallback:snapshot?.sharedHome}] as const).map(location=>({...location,path:dshSkillsPath(expandHomePath(extra[location.key]||location.fallback||home,home))}));
  const rootExpanded=expandHomePath(rootDraft.trim(),home);
  const rootInvalid=(!rootExpanded.startsWith('/')&&!/^[a-zA-Z]:[\\/]/.test(rootExpanded))||dshHomeFromSkillsPath(rootExpanded)===null;


  function accept(value: DshSnapshot,preferredPath?:string) {
    setAddingDirectory(false);setDirectoryDraft('');setEditingDirectory(null);setEditingRoot(null);
    setSnapshot(value);
    const path=preferredPath||(value.contextIssue?'':value.configurationPath??value.configurations.find(item=>item.key===value.contextKey)?.path??value.configurationFiles?.[0]?.path??'');
    setFilePath(path);
    const own = dshPresetConfigurations(value.configurations).find(item => item.key === value.contextKey&&item.path===path);
    const preset=value.presets?.find(item=>item.path===path&&(item.key===value.presetKey||item.key===value.contextKey));
    setContext(own?.key??preset?.key??'');
    setDirectories(own?.customSkillDirs.map(path => displayHomePath(path, home)) ?? []);
    setIncludeDefaults(own?.includeDefaultRoots ?? true);
    setExtra(displayExtra(own));
    onContext(target,own?.key??preset?.key??null,path||null);
  }
  async function load(key = context,path=filePath) {
    const token = ++request.current;
    requestedContext.current = key;
    requestedFile.current = path;
    setLoading(true); setLoadFailed(false);
    try {
      const value = await invoke<DshSnapshot>('upstream_dsh_settings', {target, contextKey: key || null});
      if (token === request.current) accept(value,path);
    } catch (reason) {
      if (token === request.current) { setLoadFailed(true); setError(String(reason),t("DSH 设置读取失败，请重新读取。","DSH settings could not be read. Reload them.")); }
    } finally {
      if (token === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    setSnapshot(null); void load(initialContext!==undefined?initialContext??'':contexts.settings??contexts[dshScopeKey(initialTarget)]??'',initialContext!==undefined?'':contexts.settingsFile??'');
    return () => { ++request.current; };
  }, []);
  function requestLeave(action: () => void) {
    if (saving) return;
    if (!dirty) { action(); return; }
    if (!pending.current) { pending.current = action; setConfirmLeave(true); }
  }
  useImperativeHandle(ref, () => ({requestLeave}));
  function cancelLeave() { pending.current = null; setConfirmLeave(false); }
  function finishLeave() { const action = pending.current; cancelLeave(); action?.(); }
  async function save(reset=false,confirmed=false) {
    if (!row?.editable || !snapshot || (!reset && invalid)) return false;
    if(row.parentPreset&&!row.hasOverride&&!confirmed){setConfirmLeave(false);setConfirmMaterialize(true);return false;}
    setSaving(true); onBusy(true);
    try {
      const value = await invoke<DshSnapshot>('upstream_dsh_save', {change: {
        target, key: row.key, revision: snapshot.revision,
        customSkillDirs: expanded, includeDefaultRoots: includeDefaults, directoryOnly:true, reset, confirmMaterialize:confirmed,
        settings:{dshHome:extraPaths[0]||null,agentsHome:extraPaths[1]||null},
      }});
      accept(value); setConfirmReset(false);setConfirmMaterialize(false); notifySuccess(reset?t('已恢复默认设置','Default settings restored'):(row.disabled?t('已保存，此目录配置仍处于停用状态。','Saved. This directory configuration remains disabled.'):t('已保存，请重启使用此配置的 DSH。','Saved. Restart DSH using this profile.'))); onSaved(); return true;
    } catch (reason) { setError(String(reason),t("DSH 设置保存失败，请重新保存。","DSH settings could not be saved. Save again.")); return false; }
    finally { setSaving(false); onBusy(false); }
  }
  async function addDirectory() {
    const path = await open({directory: true, multiple: false});
    if (typeof path === 'string') setDirectoryDraft(displayHomePath(path,home));
  }
  const closeRequested = useEffectEvent((event: {preventDefault: () => void}) => {
    if (allowClose.current || !dirty && !saving) return;
    event.preventDefault();
    requestLeave(() => {
      allowClose.current = true;
      void getCurrentWindow().destroy().catch(reason => { allowClose.current = false; setError(String(reason),t("窗口未关闭，请再次关闭。","The window did not close. Close it again.")); });
    });
  });
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(event => closeRequested(event)).then(stop => {
      if (disposed) stop(); else unlisten = stop;
    }).catch(reason => setError(String(reason),t("关闭确认未就绪，请先保存修改。","Close confirmation is unavailable. Save changes before closing.")));
    return () => { disposed = true; unlisten?.(); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (!allowClose.current) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return <section className="flex flex-col gap-5" aria-label={t('DeepSeek Harness 设置', 'DeepSeek Harness settings')} aria-busy={loading || saving}>
    <div className="flex flex-wrap items-center gap-3">
      <BackButton disabled={saving} onClick={() => requestLeave(onBack)} label={backLabel??t('返回智能体列表', 'Back to Agents')} />
      <span className="flex items-center gap-2 font-semibold"><AgentLogo name="deepseek-harness" size={22} />DeepSeek Harness</span>
      <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
        {snapshot&&<DshConfigurationChoice files={files} path={filePath} disabled={disabled||saving} zh={zh} home={home} onChange={path=>requestLeave(()=>{const preset=dshSelectPreset(presets,selectedPreset,path);void load(preset?dshPresetContextKey(preset,snapshot.configurations,row):'',path);})}/>}
        <Hint text={t('重新读取', 'Reload')} disabled={locked}><Button variant="outline" size="icon-sm" disabled={locked} aria-label={t('重新读取 DSH 设置', 'Reload DSH settings')} onClick={() => requestLeave(() => void load())}><RefreshCwIcon aria-hidden="true" /></Button></Hint>
      </div>
    </div>
    {loading && !snapshot && <><Skeleton className="h-32 w-full" /><span className="sr-only" role="status">{t('正在读取 DSH 设置…', 'Reading DSH settings…')}</span></>}
    {loadFailed && !loading && <Empty><EmptyHeader><EmptyTitle>{t('未能读取 DSH 设置', 'Could not read DSH settings')}</EmptyTitle></EmptyHeader><EmptyContent><Button variant="outline" disabled={locked} onClick={() => requestLeave(() => void load(requestedContext.current,requestedFile.current))}>{t('重新读取', 'Reload')}</Button></EmptyContent></Empty>}
    {snapshot && !loadFailed && <>
      {!files.length&&<Empty><EmptyHeader><EmptyTitle>{t('未找到配置文件','No configuration files found')}</EmptyTitle></EmptyHeader></Empty>}
      {!currentFile&&files.length>0&&<Empty><EmptyHeader><EmptyTitle>{t('请选择配置文件','Choose a configuration file')}</EmptyTitle><EmptyDescription>{t('原配置已不可用，请从上方选择要管理的配置。','The previous configuration is unavailable. Choose a configuration above.')}</EmptyDescription></EmptyHeader></Empty>}
      {currentFile&&<Card>
        <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{t('Agent 预设','Agent presets')}</CardTitle><Hint text={!currentFile.exists?t('配置文件尚不存在。','The configuration file does not exist yet.'):undefined} disabled={locked||!currentFile.exists}><Button variant="outline" size="sm" disabled={locked||!currentFile.exists} onClick={()=>requestLeave(()=>void invoke('upstream_dsh_open_configuration',{target,configurationPath:filePath}).catch(reason=>setError(String(reason),t('配置文件无法打开','Could not open the configuration file'))))}><FilePenLineIcon data-icon="inline-start" aria-hidden="true"/>{t('打开配置文件','Open configuration file')}</Button></Hint></div><CardDescription>{t('选择要配置技能目录的 Agent 预设。','Choose the Agent preset whose skill directories you want to configure.')}</CardDescription></CardHeader>
        <CardContent>{presets.some(item=>item.path===filePath)?<DshPresetChoices rows={snapshot.configurations} presets={presets} current={selectedPreset} configuration={row} path={filePath} disabled={disabled||saving} zh={zh} onChange={key=>requestLeave(()=>void load(key))}/>:<Empty><EmptyHeader><EmptyMedia variant="icon"><LayersIcon aria-hidden="true"/></EmptyMedia><EmptyTitle>{t('未找到 Agent 预设','No Agent presets found')}</EmptyTitle><EmptyDescription>{t('当前配置中没有可读取的预设声明，可打开配置文件查看。','No readable preset declarations were found in this configuration. Open the configuration file to inspect it.')}</EmptyDescription></EmptyHeader></Empty>}</CardContent>
      </Card>}
      {selectedPreset&&!row&&<Card>
        <CardHeader className="min-w-0"><CardTitle className="min-w-0"><OverflowText text={t(`技能目录（${dshPresetText(selectedPreset,zh).name}）`,`Skill directories (${dshPresetText(selectedPreset,zh).name})`)} className="block truncate"/></CardTitle></CardHeader>
        <CardContent><Empty><EmptyHeader><EmptyMedia variant="icon"><FolderSearchIcon aria-hidden="true"/></EmptyMedia><EmptyTitle>{selectedPreset.directoryStatus==='none'?t('未配置技能目录','No skill directories configured'):t('暂时无法读取技能目录','Skill directories could not be read')}</EmptyTitle><EmptyDescription>{selectedPreset.directoryStatus==='none'?t('当前预设未配置文件技能目录，可通过上方“打开配置文件”查看预设内容。','No file-based skill directories are configured for this preset. Use Open configuration file above to view its configuration.'):t('暂时无法确定此预设的技能目录，请打开配置文件查看。','The skill directories for this preset could not be determined. Open the configuration file to inspect it.')}</EmptyDescription></EmptyHeader></Empty></CardContent>
      </Card>}
      {row&&<>
        <Card>
          <CardHeader><div className="flex min-w-0 items-center justify-between gap-3"><CardTitle className="min-w-0 flex-1"><OverflowText text={t(`技能目录（${dshPresetText(row,zh).name}）`,`Skill directories (${dshPresetText(row,zh).name})`)} className="block truncate"/></CardTitle><HelpPopover label={t('技能配置文件与来源','Skill configuration file and source')}>
            <div className="flex min-w-0 flex-col gap-2 text-sm"><p>{row.source==='home'?t('来自用户覆盖层','From the home override'):row.hasOverride?t('来自配置文件的用户覆盖','From a profile override'):t('继承预设默认配置','Inherited from preset defaults')}</p><p className="break-all font-mono text-xs">{displayHomePath(row.path,home)}</p>{row.source==='home'&&<p className="break-all font-mono text-xs">{displayHomePath(row.openPath??row.path,home)}</p>}</div>
          </HelpPopover></div>
            {!row.editable&&<CardDescription>{dshReadOnlyReason(row.readOnlyReason,zh)}</CardDescription>}
            {row.disabled===true&&<CardDescription>{t('此目录配置已停用，保存不会启用它。','This directory configuration is disabled. Saving does not enable it.')}</CardDescription>}
          </CardHeader>
          <CardContent><FieldGroup className="settings-fields">
            <Field orientation="horizontal" data-disabled={fieldLocked(row,'includeDefaultRoots')}><FieldContent><div className="flex items-center gap-1">{row.unresolvedFields?.includes('includeDefaultRoots')?<FieldTitle>{t('使用默认技能目录','Use default skill directories')}</FieldTitle>:<FieldLabel htmlFor={`${id}-defaults`}>{t('使用默认技能目录','Use default skill directories')}</FieldLabel>}<HelpPopover label={t('默认技能目录范围','Default skill directory scope')}><p>{t('包括下方用户目录，以及项目根目录中的 .dsh/skills 和 .agents/skills。关闭后附加目录仍保留。','Includes the user directories below and .dsh/skills and .agents/skills under the project root. Additional directories remain available when disabled.')}</p></HelpPopover></div>{fieldReason('includeDefaultRoots')&&<FieldDescription>{fieldReason('includeDefaultRoots')}</FieldDescription>}</FieldContent>{row.unresolvedFields?.includes('includeDefaultRoots')?<span className="text-sm text-muted-foreground">{t('由配置表达式决定','Determined by a configuration expression')}</span>:<Switch id={`${id}-defaults`} disabled={fieldLocked(row,'includeDefaultRoots')} checked={includeDefaults} onCheckedChange={setIncludeDefaults}/>}</Field>
            {(includeDefaults||row.unresolvedFields?.includes('includeDefaultRoots'))&&<FieldGroup className="gap-2">{defaultLocations.map(location=><Field orientation="horizontal" key={location.key} data-disabled={fieldLocked(row,location.key)}><FieldContent>{row.unresolvedFields?.includes(location.key)?<FieldDescription>{location.label} · {t('由配置表达式决定','Determined by a configuration expression')}</FieldDescription>:<DirectoryLink path={location.path} home={home} zh={zh} disabled={locked||!snapshot.roots.some(root=>root.path===location.path&&root.exists)} onOpen={path=>void invoke('upstream_open_directory',{target,path,dshContextKey:context}).catch(reason=>setError(String(reason),t('目录无法打开','Could not open folder')))}/>}{fieldReason(location.key)&&<FieldDescription>{fieldReason(location.key)}</FieldDescription>}</FieldContent><Button variant="ghost" size="sm" disabled={fieldLocked(row,location.key)} aria-label={`${t('修改','Edit')} ${displayHomePath(location.path,home)}`} onClick={()=>{setEditingRoot(location.key);setResetRoot(false);setRootDraft(displayHomePath(location.path,home));}}><PencilIcon data-icon="inline-start" aria-hidden="true"/>{t('修改','Edit')}</Button></Field>)}</FieldGroup>}
            <Field data-disabled={fieldLocked(row,'customSkillDirs')} data-invalid={directoryErrors.some(Boolean)}>
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-1"><FieldTitle>{t('附加技能目录','Additional skill directories')}</FieldTitle><HelpPopover label={t('附加技能目录帮助','Additional skill directory help')}><p>{t('使用绝对路径或 ~/ 路径。添加到草稿后保存。移除目录配置不会删除技能文件。','Use absolute paths or ~/ paths. Save after adding to the draft. Removing a directory entry keeps its files.')}</p></HelpPopover></div><Button variant="outline" size="sm" disabled={fieldLocked(row,'customSkillDirs')||addingDirectory} onClick={()=>setAddingDirectory(true)}><PlusIcon data-icon="inline-start" aria-hidden="true"/>{t('添加目录','Add directory')}</Button></div>
              <FieldContent className="gap-2">{directories.map((path,index)=><div key={index} className="flex min-w-0 flex-wrap items-center gap-2"><FolderOpenIcon className="size-4 shrink-0" aria-hidden="true"/>{editingDirectory===index?<Input autoFocus className="min-w-0 flex-1" aria-label={`${t('技能目录','Skill directory')} ${index+1}`} autoComplete="off" spellCheck={false} aria-invalid={directoryErrors[index]} disabled={fieldLocked(row,'customSkillDirs')} value={path} onChange={event=>setDirectories(current=>current.map((value,at)=>at===index?event.target.value:value))}/>:<OverflowText text={path} className="min-w-0 flex-1 truncate text-sm"/>}<Button size="sm" variant="ghost" disabled={fieldLocked(row,'customSkillDirs')} onClick={()=>setEditingDirectory(editingDirectory===index?null:index)}>{editingDirectory===index?<CheckIcon aria-hidden="true"/>:<PencilIcon aria-hidden="true"/>}{editingDirectory===index?t('完成','Done'):t('修改','Edit')}</Button><Hint text={t('移除目录配置','Remove directory entry')} disabled={fieldLocked(row,'customSkillDirs')}><Button size="icon-sm" variant="ghost" disabled={fieldLocked(row,'customSkillDirs')} aria-label={`${t('移除目录配置','Remove directory entry')} ${index+1}`} onClick={()=>{setDirectories(current=>current.filter((_,at)=>at!==index));setEditingDirectory(null);}}><Trash2Icon aria-hidden="true"/></Button></Hint></div>)}{!directories.length&&<FieldDescription>{row.unresolvedFields?.includes('customSkillDirs')?t('由配置表达式决定','Determined by a configuration expression'):t('未添加','None added')}</FieldDescription>}</FieldContent>
              {fieldReason('customSkillDirs')&&<FieldDescription>{fieldReason('customSkillDirs')}</FieldDescription>}
              {addingDirectory&&<Field data-invalid={draftInvalid}><FieldLabel htmlFor={`${id}-new-directory`}>{t('新技能目录','New skill directory')}</FieldLabel><div className="flex min-w-0 flex-wrap items-center gap-2"><Input autoFocus id={`${id}-new-directory`} className="min-w-0 flex-1" disabled={locked} autoComplete="off" spellCheck={false} placeholder="~/skills" value={directoryDraft} aria-invalid={draftInvalid} onChange={event=>setDirectoryDraft(event.target.value)}/><Button variant="outline" size="icon-sm" disabled={locked} aria-label={t('选择文件夹','Choose folder')} onClick={()=>void addDirectory().catch(reason=>setError(String(reason),t('无法选择目录','Could not choose folder')))}><FolderOpenIcon aria-hidden="true"/></Button><Button size="sm" variant="outline" disabled={locked||!draftPath||draftInvalid} onClick={()=>{setDirectories(current=>[...current,displayHomePath(draftPath,home)]);setDirectoryDraft('');setAddingDirectory(false);}}>{t('添加','Add')}</Button><Button size="sm" variant="ghost" disabled={locked} onClick={()=>{setDirectoryDraft('');setAddingDirectory(false);}}>{t('取消','Cancel')}</Button></div>{draftInvalid&&<FieldError>{t('目录必须是绝对路径或以 ~/ 开头。','Use an absolute path or a ~/ path.')}</FieldError>}</Field>}
              {directoryErrors.some(Boolean)&&<FieldError>{t('目录必须是绝对路径或以 ~/ 开头。','Use an absolute path or a ~/ path.')}</FieldError>}
            </Field>
            {snapshot.roots.filter(root=>root.source==='bundled').map(root=><Field key={root.path}><FieldTitle>{t('打包技能目录','Packaged skill directory')}</FieldTitle><DirectoryLink path={root.path} home={home} zh={zh} disabled={locked||!root.exists} onOpen={path=>void invoke('upstream_open_directory',{target,path,dshContextKey:context}).catch(reason=>setError(String(reason),t('目录无法打开','Could not open folder')))}/></Field>)}
          </FieldGroup></CardContent>
        </Card>
        {row.parentPreset&&!row.hasOverride&&dirty&&<FieldDescription>{t('首次保存会创建完整预设覆盖；之后预设更新不会自动合入，保存前将确认影响。','The first save creates a complete preset override. Future preset updates will not merge automatically; review the impact before saving.')}</FieldDescription>}
        {row.editable&&<Field orientation="horizontal" className="justify-end gap-3" aria-busy={saving}>{row.canRestoreDirectories&&<Button variant="outline" disabled={locked||dirty} onClick={()=>setConfirmReset(true)}>{t('恢复默认设置','Restore default settings')}</Button>}<Button ref={saveButton} disabled={locked||!dirty||invalid} onClick={()=>void save()}>{saving?t('保存中…','Saving…'):t('保存','Save')}</Button></Field>}
      </>}
      {snapshot.warnings.length>0&&<DshSettingsDisclosure title={`${t('读取异常','Read issues')} (${snapshot.warnings.length})`}><ul className="flex flex-col gap-2 text-sm text-muted-foreground">{snapshot.warnings.map((warning,index)=><li key={index} className="break-all">{displayHomePath(warning,home)}</li>)}</ul></DshSettingsDisclosure>}
    </>}
    <Modal compact title={t('修改默认技能目录','Edit default skill directory')} description={t('只修改 DSH 读取位置，不移动已有文件。其他目录可通过“添加目录”添加。','Change where DSH reads skills without moving files. Use Add directory for other locations.')} open={editingRoot!==null} onClose={()=>setEditingRoot(null)} busy={locked}>
      <FieldGroup><Field data-invalid={rootInvalid}><FieldLabel htmlFor={`${id}-root`}>{t('技能目录','Skill directory')}</FieldLabel><div className="flex gap-2"><Input autoFocus id={`${id}-root`} autoComplete="off" spellCheck={false} disabled={locked} value={rootDraft} onChange={event=>{setResetRoot(false);setRootDraft(event.target.value);}} aria-invalid={rootInvalid}/><Button variant="outline" size="icon-sm" disabled={locked} aria-label={t('选择文件夹','Choose folder')} onClick={()=>void open({directory:true,multiple:false}).then(path=>{if(typeof path==='string'){setResetRoot(false);setRootDraft(displayHomePath(path,home));}}).catch(reason=>setError(String(reason),t('无法选择目录','Could not choose folder')))}><FolderOpenIcon aria-hidden="true"/></Button></div><FieldDescription>{t('默认技能目录需以 skills 结尾。其他位置请通过“添加目录”添加。','Default skill directories must end in skills. Use Add directory for other locations.')}</FieldDescription>{rootInvalid&&<FieldError>{t('请输入以 /skills 结尾的绝对路径或 ~/ 路径。','Enter an absolute or ~/ path ending in /skills.')}</FieldError>}</Field></FieldGroup>
      <ModalActions><Button variant="outline" disabled={locked} onClick={()=>setEditingRoot(null)}>{t('取消','Cancel')}</Button><Button disabled={locked} variant="outline" onClick={()=>{setResetRoot(true);if(editingRoot)setRootDraft(displayHomePath(dshSkillsPath(editingRoot==='dshHome'?snapshot?.dshHome??home:snapshot?.sharedHome??home),home));}}>{t('使用默认位置','Use default location')}</Button><Button disabled={locked||rootInvalid} onClick={()=>{if(!editingRoot)return;const own=dshHomeFromSkillsPath(rootExpanded);if(own===null)return;if(!resetRoot&&own===dshHomeFromSkillsPath(defaultLocations.find(location=>location.key===editingRoot)?.path??'')){setEditingRoot(null);return;}const fallback=editingRoot==='dshHome'?snapshot?.dshHome:snapshot?.sharedHome;setExtra(current=>({...current,[editingRoot]:own===fallback?'':displayHomePath(own,home)}));setEditingRoot(null);}}>{t('完成','Done')}</Button></ModalActions>
    </Modal>
    {confirmReset&&<AlertDialog open onOpenChange={value=>{if(!value&&!saving)setConfirmReset(false);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('恢复默认设置？','Restore default settings?')}</AlertDialogTitle><AlertDialogDescription>{t('恢复所选预设的技能目录设置，保留其他配置和技能文件。','Restore the selected preset’s skill directory settings, keeping other settings and skill files.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogBody><p className="break-all text-sm">{row?.profile} / {row?dshPresetText(row,zh).name:''}</p></AlertDialogBody><AlertDialogFooter><AlertDialogCancel disabled={saving}>{t('取消','Cancel')}</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={event=>{event.preventDefault();void save(true,true);}}>{t('恢复','Restore')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
    {confirmMaterialize&&<AlertDialog open onOpenChange={value=>{if(!saving){setConfirmMaterialize(value);if(!value)pending.current=null;}}}><AlertDialogContent onCloseAutoFocus={event=>{if(saveButton.current?.isConnected&&!saveButton.current.disabled){event.preventDefault();saveButton.current.focus();}}}><AlertDialogHeader><AlertDialogTitle>{t('保存技能目录？','Save skill directories?')}</AlertDialogTitle><AlertDialogDescription>{t('本次会保留并覆盖此预设的完整配置，只修改技能目录。后续内置预设的默认变更不会自动合入。','Save a complete configuration override for this preset while changing only skill directories. Future bundled preset changes will not merge automatically.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogBody><p className="break-all text-sm">{row?.profile} / {row?.preset}</p></AlertDialogBody><AlertDialogFooter><AlertDialogCancel disabled={saving}>{t('取消','Cancel')}</AlertDialogCancel><AlertDialogAction disabled={saving||invalid} onClick={event=>{event.preventDefault();void save(false,true).then(ok=>{if(ok&&pending.current)finishLeave();});}}>{t('确认保存','Save')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
    {confirmLeave && <AlertDialog open onOpenChange={value => { if (!value && !saving) cancelLeave(); }}><AlertDialogContent size="sm" aria-busy={saving} onEscapeKeyDown={event => { if (saving) event.preventDefault(); }}><AlertDialogHeader><AlertDialogTitle>{t('保存 DSH 设置？', 'Save DSH settings?')}</AlertDialogTitle><AlertDialogDescription>{t('有未保存的修改。', 'You have unsaved changes.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving} onClick={cancelLeave}>{t('继续编辑', 'Keep editing')}</AlertDialogCancel><Button variant="outline" disabled={saving} onClick={finishLeave}>{t('放弃修改', 'Discard changes')}</Button><AlertDialogAction disabled={saving || invalid} onClick={event => { event.preventDefault(); void save().then(ok => { if (ok) finishLeave(); }); }}>{saving ? t('保存中…', 'Saving…') : t('保存并继续', 'Save and continue')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
  </section>;
}
