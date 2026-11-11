import { DshDirectoryEmpty, DshPresetEmpty } from "@/components/dsh-directory-empty";
import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ChevronDownIcon, FilePenLineIcon, RefreshCwIcon } from 'lucide-react';
import { BackButton } from '@/components/back-button';
import { AgentLogo } from '@/components/agent-logo';
import { Hint } from '@/components/hint';
import { HelpPopover } from '@/components/help-popover';
import { ExecutionLog } from '@/components/execution-log';
import { Modal, ModalActions } from '@/components/modal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldTitle } from '@/components/ui/field';
import { DshDirectoryFields } from '@/components/dsh-directory-fields';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DshConfigurationChoice, DshPresetChoices } from '@/components/dsh-settings-context';
import { OverflowText } from '@/components/overflow-text';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogContent, AlertDialogBody, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { notifySuccess, useFeedbackError } from '@/lib/notifications';
import { displayHomePath, expandHomePath, type Project, type Target } from '@/lib/upstream';
import { dshPresetConfigurations, dshSelectPreset, dshPresetContextKey, dshPresetText, dshProfileLabel, dshReadOnlyReason, dshScopeKey, type DshEditorHandle, type DshSnapshot, type DshConfiguration } from '@/lib/dsh';

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
  policyInventory?: DshSnapshot["policy"];
};

export function DshManagement({backLabel,initialContext,ref, home, initialTarget, zh, disabled, onBack, onBusy, onSaved, contexts, onContext, policyInventory}: Props) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const target:Target={host:'local',scope:'global',projectPath:null};
  const [context, setContext] = useState(initialContext??contexts.settings ?? contexts[dshScopeKey(initialTarget)] ?? '');
  const [snapshot, setSnapshot] = useState<DshSnapshot | null>(null);
  const [filePath,setFilePath]=useState('');
  const [directories, setDirectories] = useState<(string|null)[]>([]);
  const [includeDefaults, setIncludeDefaults] = useState(true);
  const [extra,setExtra] = useState({dshHome:'',agentsHome:''});
  const [confirmRepair,setConfirmRepair]=useState(false);
  const [confirmPolicySetup,setConfirmPolicySetup]=useState(false);
  const [confirmReset,setConfirmReset] = useState(false);
  const [confirmMaterialize,setConfirmMaterialize]=useState(false);
  const [pendingDirectory,setPendingDirectory]=useState(false);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, setError] = useFeedbackError(zh);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const request = useRef(0);
  const saveButton=useRef<HTMLButtonElement>(null);
  const repairButton=useRef<HTMLButtonElement>(null);
  const presetHeading=useRef<HTMLDivElement>(null);
  const requestedContext = useRef('');
  const requestedFile = useRef('');
  const pending = useRef<(() => void) | null>(null);
  const allowClose = useRef(false);
  const presetConfigurations=dshPresetConfigurations(snapshot?.configurations??[]);
  const presets=snapshot?.presets??[];
  const selectedPreset=presets.find(preset=>preset.path===filePath&&(preset.key===context||preset.configurationKeys.includes(context)));
  const files=snapshot?.configurationFiles??[...new Map((snapshot?.configurations??[]).map(item=>[item.path,{path:item.path,profile:item.profile,installation:item.installation,exists:item.patchExists!==false}])).values()];
  const currentFile=files.find(file=>file.path===filePath);
  const policy = currentFile && snapshot?.configurationPath === currentFile.path ? snapshot.policy : undefined;
  const policyRuntime = policy?.canSave && policy.status === 'pending' && selectedPreset?.directoryStatus === 'none'
    ? policyInventory?.configurations?.find(item => item.path === currentFile?.path && item.canSave)
    : policy;
  const canSetUpPolicy = policy?.canInstall && (policy.status === 'not-installed' || policy.status === 'needs-setup');
  const policyAction = policy?.status === 'needs-setup' ? t('启用管理','Enable management') : t('安装并启用','Install and enable');
  const policyStatus = policy?.status === 'error' ? t('技能设置无法读取。','Could not read skill settings.')
    : policy?.owner === 'companion' && policy?.status === 'pending' && !policy?.running ? t('请在 DSH 插件页面确认 Skills Space 已启用，然后刷新。','Confirm Skills Space is enabled in DSH Plugins, then refresh.')
    : canSetUpPolicy ? (policy?.status === 'needs-setup' ? t('插件已安装，当前配置尚未启用。','Plugin installed. Management is off for this configuration.') : t('安装插件后可启停技能，并设置自动选择和手动调用。','Install the plugin to enable or disable skills and manage automatic selection and manual invocation.'))
    : policyRuntime?.status === 'active' ? t('已启用','Enabled')
    : policyRuntime?.pendingReason === 'apply' ? t('正在应用…','Applying…')
    : policyRuntime?.running ? t('重启 DSH 后生效。','Restart DSH to apply.')
    : policy?.status === 'unavailable' || !policy?.canSave ? t('当前配置无法启用技能管理。','Skill management is unavailable for this configuration.')
    : t('已配置，下次启动 DSH 时生效。','Configured. Applies the next time DSH starts.');
  const policyDetails = policy?.status === 'error' ? [
    policy.problemPath ?? policy.policyFile, policy.issue,
    ...(policy.migrationConflicts ?? []).map(item => `${item.name} · ${item.file}`),
  ].filter(Boolean).join('\n') : '';
  const affectedPresets=snapshot?.configurationPath===filePath?snapshot.repairablePresets?.map(id=>{
    const preset=presets.find(item=>item.path===filePath&&item.preset===id);
    return preset?dshPresetText(preset,zh).name:id;
  }).join(zh?'、':', '):null;
  const row = presetConfigurations.find(item => item.key === context&&item.path===filePath);
  const displayExtra = (value?:DshConfiguration) => {return {dshHome:displayHomePath(value?.dshHome??'',home),agentsHome:displayHomePath(value?.agentsHome??'',home)};};
  const expanded = directories.map(path => path===null?null:expandHomePath(path.trim(),home));
  const directoryErrors = expanded.some(path => path!==null&&!path.startsWith('/')&&!/^[a-zA-Z]:[\\/]/.test(path));
  const extraPaths=[extra.dshHome,extra.agentsHome].map(path=>expandHomePath(path.trim(),home));
  const invalid = pendingDirectory||directoryErrors||extraPaths.some(path=>!!path&&!path.startsWith('/')&&!/^[a-zA-Z]:[\\/]/.test(path));
  const directoryDirty=!!row&&(JSON.stringify(expanded)!==JSON.stringify(row.additionalDirectoryLayout?.entries??row.customSkillDirs)||includeDefaults!==(row.includeDefaultRoots??true)||extra.dshHome!==displayExtra(row).dshHome||extra.agentsHome!==displayExtra(row).agentsHome);
  const dirty=!!row?.editable&&(pendingDirectory||directoryDirty);
  const locked = disabled || loading || saving;



  function accept(value: DshSnapshot,preferredPath?:string) {
    setPendingDirectory(false);
    setSnapshot(value);
    const path=preferredPath||(value.contextIssue?'':value.configurationPath??value.configurations.find(item=>item.key===value.contextKey)?.path??value.configurationFiles?.[0]?.path??'');
    setFilePath(path);
    const own = dshPresetConfigurations(value.configurations).find(item => item.key === value.contextKey&&item.path===path);
    const preset=value.presets?.find(item=>item.path===path&&(item.key===value.presetKey||item.key===value.contextKey));
    setContext(own?.key??preset?.key??'');
    setDirectories((own?.additionalDirectoryLayout?.entries??own?.customSkillDirs??[]).map(path=>path===null?null:displayHomePath(path,home)));
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
  async function setUpPolicy() {
    if (!snapshot || !currentFile || !canSetUpPolicy || locked || dirty) return;
    setSaving(true); onBusy(true);
    try {
      const value = await invoke<DshSnapshot>('upstream_dsh_policy_install', {
        target, contextKey: `file:${currentFile.path}`, revision: snapshot.revision,
      });
      if (value.contextKey !== context) await load(context, currentFile.path);
      else accept(value, currentFile.path);
      notifySuccess(value.policy?.status === 'active' ? t('已启用技能管理。','Skill management enabled.') : t('已启用技能管理，请重启 DSH。','Skill management enabled. Restart DSH.'));
    } catch (reason) {
      await load(context, currentFile.path);
      setError(String(reason), t('未能启用技能管理，请检查当前配置后重试。','Could not enable skill management. Check this configuration and try again.'));
    } finally {
      setConfirmPolicySetup(false); setSaving(false); onBusy(false); onSaved();
    }
  }
  async function save(reset=false,confirmed=false) {
    if (!row?.editable || !snapshot || (!reset && invalid)) return false;
    if(row.parentPreset&&!row.hasOverride&&!confirmed){setConfirmLeave(false);setConfirmMaterialize(true);return false;}
    setSaving(true); onBusy(true);
    try {
      const value = await invoke<DshSnapshot>('upstream_dsh_save', {change: {
        target, key: row.key, revision: snapshot.revision,
        customSkillDirs: expanded.filter(path=>path!==null), includeDefaultRoots: includeDefaults, directoryOnly:true, reset, confirmMaterialize:confirmed,
        settings:{dshHome:extraPaths[0]||null,agentsHome:extraPaths[1]||null,...(row.additionalDirectoryLayout?{customSkillDirs:expanded}:{})},
      }});
      accept(value); setConfirmReset(false);setConfirmMaterialize(false); notifySuccess(reset?t('已恢复默认设置','Default settings restored'):(row.disabled?t('已保存，此目录配置仍处于停用状态。','Saved. This directory configuration remains disabled.'):t('已保存，请重启使用此配置的 DSH。','Saved. Restart DSH using this profile.'))); onSaved(); return true;
    } catch (reason) { setError(String(reason),t("DSH 设置保存失败，请重新保存。","DSH settings could not be saved. Save again.")); return false; }
    finally { setSaving(false); onBusy(false); }
  }
  async function repairPresets() {
    if(!snapshot||!currentFile||!affectedPresets||locked||dirty)return;
    setSaving(true);onBusy(true);
    try {
      const value=await invoke<DshSnapshot>('upstream_dsh_repair_preset',{target,contextKey:context||`file:${currentFile.path}`,revision:snapshot.revision});
      setConfirmRepair(false);
      accept(value,currentFile.path);
      onSaved();
      notifySuccess(t('已修复预设配置，请重启 DSH','Preset configuration repaired. Restart DSH.'));
    } catch(reason) {
      setConfirmRepair(false);
      setError(String(reason),t('预设修复未完成，请重新读取配置后重试。','Preset repair did not complete. Reload the configuration and try again.'));
    } finally {setSaving(false);onBusy(false);}
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
      {!!policy?.providerCount && <Card><CardContent>
        <FieldGroup><Field orientation="responsive">
          <FieldContent><FieldTitle>{t('技能启停与调用','Skill enablement and invocation')}</FieldTitle><FieldDescription>{policyStatus}</FieldDescription></FieldContent>
          {canSetUpPolicy && <Hint text={dirty ? t('请先保存技能目录修改。','Save your directory changes first.') : undefined} disabled={locked || dirty}>
            <Button variant="outline" size="sm" disabled={locked || dirty} onClick={() => setConfirmPolicySetup(true)}>{policyAction}</Button>
          </Hint>}
          {policy.status === 'error' && policy.problemPath && <Button variant="outline" size="sm" disabled={locked}
            onClick={() => void invoke('upstream_open_directory', { target, path: policy.problemPath }).catch(reason => setError(String(reason), t('无法打开设置目录。','Could not open the settings folder.')))}>
            {t('打开设置目录','Open settings folder')}
          </Button>}
        </Field>{policyDetails && <ExecutionLog value={policyDetails} home={home} zh={zh} label={t('错误详情','Error details')}/>}</FieldGroup>
      </CardContent></Card>}
      {currentFile&&<Card>
        <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle ref={presetHeading} tabIndex={-1}>{t('Agent 预设','Agent presets')}</CardTitle><Hint text={!currentFile.exists?t('配置文件尚不存在。','The configuration file does not exist yet.'):undefined} disabled={locked||!currentFile.exists}><Button variant="outline" size="sm" disabled={locked||!currentFile.exists} onClick={()=>requestLeave(()=>void invoke('upstream_dsh_open_configuration',{target,configurationPath:filePath}).catch(reason=>setError(String(reason),t('配置文件无法打开','Could not open the configuration file'))))}><FilePenLineIcon data-icon="inline-start" aria-hidden="true"/>{t('打开配置文件','Open configuration file')}</Button></Hint></div><CardDescription>{t('选择要配置技能目录的 Agent 预设。','Choose the Agent preset whose skill directories you want to configure.')}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {affectedPresets&&<FieldGroup><Field orientation="responsive"><FieldContent>
            <FieldTitle>{t('预设包含旧版工具','Presets contain an outdated tool')}</FieldTitle>
            <FieldDescription>{affectedPresets}</FieldDescription>
          </FieldContent><Button ref={repairButton} size="sm" variant="outline" disabled={locked||dirty} onClick={()=>setConfirmRepair(true)}>{t('修复预设','Repair presets')}</Button></Field></FieldGroup>}
          {presets.some(item=>item.path===filePath)?<DshPresetChoices rows={snapshot.configurations} presets={presets} current={selectedPreset} configuration={row} path={filePath} disabled={disabled||saving} zh={zh} onChange={key=>requestLeave(()=>void load(key))}/>:<DshPresetEmpty zh={zh}/>}</CardContent>
      </Card>}
      {selectedPreset&&!row&&<Card>
        <CardHeader className="min-w-0"><CardTitle className="min-w-0"><OverflowText text={t(`技能目录（${dshPresetText(selectedPreset,zh).name}）`,`Skill directories (${dshPresetText(selectedPreset,zh).name})`)} className="block truncate"/></CardTitle></CardHeader>
        <CardContent><DshDirectoryEmpty status={selectedPreset.directoryStatus==='none'?'none':'unknown'} zh={zh}/></CardContent>
      </Card>}
      {row&&<>
        <Card>
          <CardHeader><div className="flex min-w-0 items-center justify-between gap-3"><CardTitle className="min-w-0 flex-1"><OverflowText text={t(`技能目录（${dshPresetText(row,zh).name}）`,`Skill directories (${dshPresetText(row,zh).name})`)} className="block truncate"/></CardTitle><HelpPopover label={t('技能配置文件与来源','Skill configuration file and source')}>
            <div className="flex min-w-0 flex-col gap-2 text-sm"><p>{row.source==='home'?t('来自用户覆盖层','From the home override'):row.hasOverride?t('来自配置文件的用户覆盖','From a profile override'):t('继承预设默认配置','Inherited from preset defaults')}</p><p className="break-all font-mono text-xs">{displayHomePath(row.path,home)}</p>{row.source==='home'&&<p className="break-all font-mono text-xs">{displayHomePath(row.openPath??row.path,home)}</p>}</div>
          </HelpPopover></div>
            {!row.editable&&<CardDescription>{dshReadOnlyReason(row.readOnlyReason,zh)}</CardDescription>}
            {row.disabled===true&&<CardDescription>{t('此目录配置已停用，保存不会启用它。','This directory configuration is disabled. Saving does not enable it.')}</CardDescription>}
          </CardHeader>
          <CardContent><DshDirectoryFields key={`${row.key}:${snapshot.revision}`} home={home} zh={zh} disabled={locked} row={row}
            defaults={{dshHome:snapshot.dshHome??home,agentsHome:snapshot.sharedHome??home}} roots={snapshot.roots}
            includeDefaults={includeDefaults} setIncludeDefaults={setIncludeDefaults} extra={extra} onHomeChange={(key,value)=>setExtra(current=>({...current,[key]:value}))}
            directories={directories} setDirectories={setDirectories} onPendingChange={setPendingDirectory}
            onChooseDirectory={async()=>{const path=await open({directory:true,multiple:false});return typeof path==='string'?path:null;}}
            onOpenDirectory={path=>invoke('upstream_open_directory',{target,path,dshContextKey:context})}/></CardContent>
        </Card>
        {row.parentPreset&&!row.hasOverride&&dirty&&<FieldDescription>{t('首次保存会创建完整预设覆盖；之后预设更新不会自动合入，保存前将确认影响。','The first save creates a complete preset override. Future preset updates will not merge automatically; review the impact before saving.')}</FieldDescription>}
        {row.editable&&<Field orientation="horizontal" className="justify-end gap-3" aria-busy={saving}>{row.canRestoreDirectories&&<Button variant="outline" disabled={locked||dirty} onClick={()=>setConfirmReset(true)}>{t('恢复默认设置','Restore default settings')}</Button>}<Button ref={saveButton} disabled={locked||!dirty||invalid} onClick={()=>void save()}>{saving?t('保存中…','Saving…'):t('保存','Save')}</Button></Field>}
      </>}
      {snapshot.warnings.length>0&&<DshSettingsDisclosure title={`${t('读取异常','Read issues')} (${snapshot.warnings.length})`}><ul className="flex flex-col gap-2 text-sm text-muted-foreground">{snapshot.warnings.map((warning,index)=><li key={index} className="break-all">{displayHomePath(warning,home)}</li>)}</ul></DshSettingsDisclosure>}
    </>}

    {currentFile && <Modal compact title={policyAction} open={confirmPolicySetup} busy={saving} onClose={() => setConfirmPolicySetup(false)}>
      <div className="flex flex-col gap-3 text-sm">
        <p>{policy?.status === 'needs-setup'
          ? t('启用后，可在 Skills Space 中管理此配置的技能启停和调用方式。','This enables skill management for this configuration in Skills Space.')
          : t('安装技能管理插件，并在此配置中启用。','Install the skill management plugin and enable it for this configuration.')}</p>
        <p className="font-medium">{dshProfileLabel(currentFile.profile)}</p>
        <p className="break-all font-mono text-xs text-muted-foreground">{displayHomePath(currentFile.path,home)}</p>
        <p className="text-muted-foreground">{t('配置保存后，重启 DSH 生效。','Restart DSH to apply the configuration.')}</p>
      </div>
      <ModalActions><Button variant="outline" disabled={saving} onClick={() => setConfirmPolicySetup(false)}>{t('取消','Cancel')}</Button>
        <Button disabled={locked || !canSetUpPolicy} onClick={() => void setUpPolicy()}>{saving ? t('正在启用…','Enabling…') : policyAction}</Button></ModalActions>
    </Modal>}

    {confirmRepair&&currentFile&&<AlertDialog open onOpenChange={value=>{if(!value&&!saving)setConfirmRepair(false);}}>
      <AlertDialogContent aria-busy={saving} onEscapeKeyDown={event=>{if(saving)event.preventDefault();}} onCloseAutoFocus={event=>{
        event.preventDefault();
        (repairButton.current?.isConnected&&!repairButton.current.disabled?repairButton.current:presetHeading.current)?.focus();
      }}>
        <AlertDialogHeader><AlertDialogTitle>{t('修复 Agent 预设？','Repair Agent presets?')}</AlertDialogTitle><AlertDialogDescription>{t('移除这些预设中的旧版工具。修复后重启 DSH。','Remove the obsolete tool from these presets, then restart DSH.')}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogBody><p className="break-all text-sm">{dshProfileLabel(currentFile.profile)} · {displayHomePath(filePath,home)}</p><p className="text-sm">{affectedPresets}</p></AlertDialogBody>
        <AlertDialogFooter><AlertDialogCancel disabled={saving}>{t('取消','Cancel')}</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={event=>{event.preventDefault();void repairPresets();}}>{saving?t('修复中…','Repairing…'):t('修复预设','Repair presets')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
    {confirmReset&&<AlertDialog open onOpenChange={value=>{if(!value&&!saving)setConfirmReset(false);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('恢复默认设置？','Restore default settings?')}</AlertDialogTitle><AlertDialogDescription>{t('恢复所选预设的技能目录设置，保留其他配置和技能文件。','Restore the selected preset’s skill directory settings, keeping other settings and skill files.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogBody><p className="break-all text-sm">{row?.profile} / {row?dshPresetText(row,zh).name:''}</p></AlertDialogBody><AlertDialogFooter><AlertDialogCancel disabled={saving}>{t('取消','Cancel')}</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={event=>{event.preventDefault();void save(true,true);}}>{t('恢复','Restore')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
    {confirmMaterialize&&<AlertDialog open onOpenChange={value=>{if(!saving){setConfirmMaterialize(value);if(!value)pending.current=null;}}}><AlertDialogContent onCloseAutoFocus={event=>{if(saveButton.current?.isConnected&&!saveButton.current.disabled){event.preventDefault();saveButton.current.focus();}}}><AlertDialogHeader><AlertDialogTitle>{t('保存技能目录？','Save skill directories?')}</AlertDialogTitle><AlertDialogDescription>{t('本次会保留并覆盖此预设的完整配置，只修改技能目录。后续内置预设的默认变更不会自动合入。','Save a complete configuration override for this preset while changing only skill directories. Future bundled preset changes will not merge automatically.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogBody><p className="break-all text-sm">{row?.profile} / {row?.preset}</p></AlertDialogBody><AlertDialogFooter><AlertDialogCancel disabled={saving}>{t('取消','Cancel')}</AlertDialogCancel><AlertDialogAction disabled={saving||invalid} onClick={event=>{event.preventDefault();void save(false,true).then(ok=>{if(ok&&pending.current)finishLeave();});}}>{t('确认保存','Save')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
    {confirmLeave && <AlertDialog open onOpenChange={value => { if (!value && !saving) cancelLeave(); }}><AlertDialogContent size="sm" aria-busy={saving} onEscapeKeyDown={event => { if (saving) event.preventDefault(); }}><AlertDialogHeader><AlertDialogTitle>{t('保存 DSH 设置？', 'Save DSH settings?')}</AlertDialogTitle><AlertDialogDescription>{t('有未保存的修改。', 'You have unsaved changes.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving} onClick={cancelLeave}>{t('继续编辑', 'Keep editing')}</AlertDialogCancel><Button variant="outline" disabled={saving} onClick={finishLeave}>{t('放弃修改', 'Discard changes')}</Button><AlertDialogAction disabled={saving || invalid} onClick={event => { event.preventDefault(); void save().then(ok => { if (ok) finishLeave(); }); }}>{saving ? t('保存中…', 'Saving…') : t('保存并继续', 'Save and continue')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
  </section>;
}
