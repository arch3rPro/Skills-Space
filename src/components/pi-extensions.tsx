import type { PiSkillState } from '@/lib/pi';
import type { PiPackageCache } from '@/lib/pi-package-cache';
import { PiPackageSourceIcon } from '@/components/pi-package-source-icon';
import { PiPackageDetail } from '@/components/pi-package-detail';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ListChecksIcon, XIcon, RotateCcwIcon, FolderOpenIcon, PlusIcon, RefreshCwIcon, SearchCheckIcon, CircleArrowUpIcon, LoaderCircleIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { BulkSelectionBar } from '@/components/bulk-selection-bar';
import { SkillBatchToggleControls } from '@/components/skill-batch-toggle-controls';
import { selectVisible } from '@/lib/selection';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Field, FieldLabel, FieldGroup, FieldDescription } from '@/components/ui/field';
import { Empty, EmptyHeader, EmptyTitle, EmptyContent } from '@/components/ui/empty';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogBody, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Modal, ModalActions } from '@/components/modal';
import { Choice } from '@/components/choice';
import { Hint } from '@/components/hint';
import { OverflowText } from '@/components/overflow-text';
import { InventoryToolbar } from '@/components/inventory-toolbar';
import { InventoryCardHeader, InventoryCardFooter } from '@/components/inventory-card';
import { LoadingCards } from '@/components/loading-cards';
import { FlowError } from '@/components/flow-error';
import { PiPackageUpdateDialog } from '@/components/pi-package-update-dialog';
import { piPackageBlocker, type PiPackageResult } from '@/lib/pi';
import { piPackageDisplayName, piPackageEnabled, piPackageSourceLabel, type PiPackageSummary, type PiPackageInventory, type PiExtensionPackage, type PiInventoryResult } from '@/lib/pi-packages';
import type { InstalledSkill, Target } from '@/lib/upstream';
import { notifySuccess, useFeedbackError } from '@/lib/notifications';

import {createFilterSession,filterContext,useViewFilters,type FilterSession} from '@/lib/filter-session';

export function PiExtensions({onOpenDirectory,filterSession,cache,skills,states,onSkill,active,selected,onSelect,onSummary,target,home,zh,disabled,onBusy,onChanged,onSettings}:{onOpenDirectory:(path:string)=>void;filterSession?:FilterSession;cache:PiPackageCache;skills:InstalledSkill[];states:PiSkillState[];onSkill:(skill:InstalledSkill)=>void;active:boolean;selected:string|null;onSelect:(id:string|null)=>void;onSummary:(summary:PiPackageSummary)=>void;target:Target;home:string;zh:boolean;disabled:boolean;onBusy:(busy:boolean)=>void;onChanged:()=>void;onSettings:()=>void}) {
 const t=(cn:string,en:string)=>zh?cn:en;
 const [snapshot,setSnapshot]=useState<PiPackageInventory|null>(()=>cache.peek(target));
 const [loading,setLoading]=useState(()=>!cache.peek(target)),[pending,setPending]=useState(false);
 const [localFilters]=useState(createFilterSession);
 const [filters,patchFilters]=useViewFilters(filterSession??localFilters,filterContext(target,'pi','plugins'));
 const query=filters.query,sourceFilter=filters.source,statusFilter=filters.status;
 const setQuery=(value:string)=>patchFilters({query:value}),setSourceFilter=(value:string)=>patchFilters({source:value}),setStatusFilter=(value:string)=>patchFilters({status:value});
 const [adding,setAdding]=useState(false),[source,setSource]=useState('');
 const [removing,setRemoving]=useState<PiExtensionPackage[]|null>(null),[review,setReview]=useState<{id:string;result:PiPackageResult}|null>(null);
 const [selecting,setSelecting]=useState(false),[pickedIds,setPickedIds]=useState<string[]>([]);
 const [checks,setChecks]=useState<Record<string,PiPackageResult>>({}),[checkingUpdates,setCheckingUpdates]=useState(false);
 const [operationError,setOperationError]=useState<string|null>(null);
 const [,reportError]=useFeedbackError(zh);
 const sequence=useRef(0),mutation=useRef(false),checkGeneration=useRef(0),checking=useRef(false);
 function cancelChecks(){++checkGeneration.current;checking.current=false;setCheckingUpdates(false);}
 const selection=useRef(selected);selection.current=selected;
 const locked=disabled||pending;
 useEffect(()=>{if(disabled)cancelChecks();},[disabled]);
 async function load(force=false,preserveChecks=false) {
  if(force){cancelChecks();if(!preserveChecks)setChecks({});}
  const ticket=++sequence.current;if(force||!cache.peek(target))setLoading(true);
  try {const snapshot=await cache.load(target,force);if(ticket===sequence.current)setSnapshot(snapshot);}
  catch(error){if(ticket===sequence.current)reportError(String(error),t('扩展包读取失败，请刷新。','Could not read packages. Refresh the list.'));}
  finally{if(ticket===sequence.current)setLoading(false);}
 }
 useEffect(()=>{onSummary({count:snapshot?.packages.length??null,loading,packages:snapshot?.packages});},[snapshot,loading,onSummary]);
 useEffect(()=>{cancelChecks();setSnapshot(cache.peek(target));setSelecting(false);setPickedIds([]);setRemoving(null);setChecks({});setReview(null);void load();return()=>{++sequence.current;++checkGeneration.current;checking.current=false;};},[target.scope,target.projectPath]);
 useEffect(()=>{if(active&&!cache.peek(target))void load();},[active,target.scope,target.projectPath,cache]);
 async function run(action:string,extra:Record<string,unknown>={}) {
  if(!snapshot||mutation.current)return;
  if(action==='check')return checkUpdates(String(extra.id));
  cancelChecks();
  if(action==='update'){
   const installations=review&&review.id===extra.id?review.result.affected:[];
   const affected=new Set(snapshot.packages.filter(item=>item.id===extra.id||installations.some(installation=>installation.status!=='pinned'&&installation.source===item.source&&installation.scope===item.scope&&installation.root===item.path)).map(item=>item.id));
   setChecks(current=>Object.fromEntries(Object.entries(current).filter(([id])=>!affected.has(id))));
  }else setChecks({});
  ++sequence.current;setLoading(false);mutation.current=true;setPending(true);onBusy(true);setOperationError(null);
  try {
   const result=await invoke<PiInventoryResult>('upstream_pi_packages',{request:{target,action,revision:snapshot.revision,...extra}});
   cache.accept(target,result.snapshot);setSnapshot(result.snapshot);
   if(action==='update'&&result.update) {
    if(result.update.error){setReview({id:String(extra.id),result:result.update});setOperationError(result.update.error);}
    else {setReview(null);notifySuccess(t('扩展包已更新','Package updated'));}
    onChanged();
   } else {
    setAdding(false);setRemoving(null);setSource('');
    if(action==='install')notifySuccess(t('扩展包已添加','Package added'));
    else if(action==='remove'){onSelect(null);notifySuccess(t('扩展包已卸载','Package removed'));}
    else notifySuccess(t('已保存','Saved'));
    onChanged();
   }
  } catch(error) {
   if(action==='install'||action==='remove'||action==='update')setOperationError(String(error));
   else reportError(String(error),t('加载设置保存失败，请重新操作。','Could not save loading settings. Try again.'));
   cache.invalidate(target);await load(true,action==='update');
  } finally {mutation.current=false;setPending(false);onBusy(false);}
 }
 async function checkUpdates(id?:string) {
  if(!snapshot||locked||loading||mutation.current||checking.current||!snapshot.projectTrusted)return;
  const candidates=snapshot.packages.filter(item=>item.canUpdate&&(!id||item.id===id));
  if(!candidates.length)return;
  const sources=[...new Map(candidates.map(item=>[item.source,item])).values()];
  const ticket=++checkGeneration.current;checking.current=true;setCheckingUpdates(true);
  if(id)setChecks(previous=>{const next={...previous};delete next[id];return next;});else setChecks({});
  let current=snapshot;const failures:string[]=[];
  try {
   for(const item of sources) {
    if(ticket!==checkGeneration.current)return;
    try {
     const result=await invoke<PiInventoryResult>('upstream_pi_packages',{request:{target,action:'check',id:item.id,revision:current.revision}});
     if(ticket!==checkGeneration.current)return;
     current=result.snapshot;cache.accept(target,current,false);setSnapshot(current);
     const update=result.update;
     if(!update)throw Error('Missing package update result.');
     if(update.error)throw Error(update.error);
     setChecks(previous=>({...previous,...Object.fromEntries(candidates.filter(pkg=>pkg.source===item.source).map(pkg=>[pkg.id,update]))}));
     if(id&&selection.current===id){
      if(update.affected.some(affected=>affected.status==='available'))setReview({id,result:update});
      else {setReview(null);const unavailable=update.affected.find(affected=>!affected.updateable||affected.status==='pinned');toast(unavailable?unavailable.status==='pinned'?t('扩展包已固定版本','Package version is pinned'):piPackageBlocker(unavailable,zh)??t('没有可用更新','No update available'):t('扩展包已是最新版本','Package is up to date'));}
     }
    }catch(error){if(ticket!==checkGeneration.current)return;failures.push(`${piPackageDisplayName(item)}: ${String(error)}`);}
   }
   if(id&&selection.current!==id)return;
   if(failures.length)reportError(failures.join('\n'),id?t('扩展包检查失败，请重新检查。','Package check failed. Check again.'):t('部分插件更新检查失败，请重新检查。','Some plugin updates could not be checked. Try again.'));
   else if(!id)notifySuccess(t('更新检查完成','Update check complete'));
  }finally{if(ticket===checkGeneration.current){checking.current=false;setCheckingUpdates(false);}}
 }
 async function removePackages() {
  if(!snapshot||!removing||mutation.current)return;
  cancelChecks();setChecks({});
  ++sequence.current;setLoading(false);mutation.current=true;setPending(true);onBusy(true);setOperationError(null);
  let current=snapshot;const completed:string[]=[];let failed=false;
  try {
   for(const item of removing) {
    const result=await invoke<PiInventoryResult>('upstream_pi_packages',{request:{target,action:'remove',id:item.id,revision:current.revision}});
    current=result.snapshot;completed.push(item.id);
   }
   setRemoving(null);onSelect(null);notifySuccess(t('扩展包已卸载','Packages removed'));
  } catch(error) {failed=true;setRemoving(removing.filter(item=>!completed.includes(item.id)));setOperationError(String(error));cache.invalidate(target);await load(true);}
  finally {if(!failed){cache.accept(target,current);setSnapshot(current);}setPickedIds(previous=>previous.filter(id=>!completed.includes(id)));mutation.current=false;setPending(false);onBusy(false);if(completed.length)onChanged();}
 }
 const pkg=snapshot?.packages.find(item=>item.id===selected);
 const filtered=(snapshot?.packages??[]).filter(item=>(sourceFilter==='all'||item.kind===sourceFilter)&&(statusFilter==='all'||(statusFilter==='partial'?item.resources.some(resource=>resource.enabled)&&item.resources.some(resource=>!resource.enabled):statusFilter==='enabled'?item.resources.length>0&&item.resources.every(resource=>resource.enabled):item.resources.length>0&&!piPackageEnabled(item)))&&`${item.name} ${item.source} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()));
 const picked=(snapshot?.packages??[]).filter(item=>pickedIds.includes(item.id));
 const eligible=filtered.filter(item=>snapshot?.projectTrusted&&(item.resources.length>0||item.canRemove)).map(item=>item.id);
 const project=target.scope==='project';
 return <section className="flex min-w-0 flex-col gap-5" aria-label={t('Pi 扩展包管理','Pi packages')}>
  {project&&snapshot&&!snapshot.projectTrusted&&<Alert><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{t('信任此项目后可管理项目扩展包。','Trust this project to manage its packages.')}</span><Button variant="outline" size="sm" disabled={locked} onClick={onSettings}>{t('Pi 设置','Pi settings')}</Button></AlertDescription></Alert>}
  {selected?<PiPackageDetail checkingUpdates={checkingUpdates} onOpenDirectory={onOpenDirectory} states={states} skills={skills} onSkill={onSkill} trusted={snapshot?.projectTrusted??false} onToggle={(resource,enabled)=>{if(pkg)void run('resource',{id:pkg.id,resourceId:resource.id,state:enabled?'load':'unload'});}} onRestore={()=>{if(pkg)void run('packages',{ids:[pkg.id],state:'inherit'});}} key={selected} pkg={pkg} project={project} home={home} zh={zh} disabled={locked} onBack={()=>onSelect(null)} onCheck={()=>{if(pkg)void run('check',{id:pkg.id});}} onRemove={()=>{if(pkg){cancelChecks();setOperationError(null);setRemoving([pkg]);}}}/>:<>
   <InventoryToolbar><div className="toolbar-filters flex shrink-0 items-center gap-2"><div className="toolbar-search relative w-56 shrink-0"><SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/><Input type="search" name="pi-package-query" autoComplete="off" spellCheck={false} className="pl-9" aria-label={t('搜索扩展包','Search packages')} placeholder={t('搜索扩展包…','Search packages…')} value={query} onChange={event=>setQuery(event.target.value)}/></div><Choice className="filter-trigger" label={t('扩展包来源','Package source')} value={sourceFilter} onChange={value=>{setSourceFilter(value);setPickedIds([]);}} options={[{value:'all',label:t('全部来源','All sources')},...(['local','npm','git'] as const).map(kind=>({value:kind,label:piPackageSourceLabel(kind,zh)}))]}/><Choice className="filter-trigger" label={t('筛选插件状态','Filter plugin state')} value={statusFilter} onChange={value=>{setStatusFilter(value);setPickedIds([]);}} options={[{value:'all',label:t('全部状态','All states')},{value:'enabled',label:t('已启用','Enabled')},{value:'disabled',label:t('已停用','Disabled')},{value:'partial',label:t('部分启用','Partially enabled')}]}/><Hint text={t('刷新','Refresh')}><Button variant="ghost" className="toolbar-secondary-action" data-toolbar-priority="3" disabled={locked||loading} aria-label={t('刷新扩展包','Refresh packages')} onClick={()=>void load(true)}><RefreshCwIcon aria-hidden="true" className={loading?'animate-spin motion-reduce:animate-none':undefined}/><span className="toolbar-secondary-label">{t('刷新','Refresh')}</span></Button></Hint></div><div className="toolbar-actions ml-auto flex shrink-0 items-center gap-2"><Hint text={t('检查更新','Check updates')} disabled={locked||loading||!snapshot?.projectTrusted||!snapshot.packages.some(item=>item.canUpdate)}><Button variant="ghost" className="toolbar-secondary-action" data-toolbar-priority="2" aria-label={t('检查更新','Check updates')} aria-busy={checkingUpdates} disabled={locked||loading||checkingUpdates||!snapshot?.projectTrusted||!snapshot.packages.some(item=>item.canUpdate)} onClick={()=>void checkUpdates()}>{checkingUpdates?<LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none"/>:<SearchCheckIcon aria-hidden="true"/>}<span className="toolbar-secondary-label">{t('检查更新','Check updates')}</span></Button></Hint><Hint text={selecting?t('取消选择','Cancel selection'):t('批量选择','Select multiple')} disabled={locked||!selecting&&!eligible.length}><Button variant={selecting?'secondary':'ghost'} className="toolbar-secondary-action" data-toolbar-priority="1" disabled={locked||!selecting&&!eligible.length} aria-pressed={selecting} aria-label={selecting?t('取消选择','Cancel selection'):t('批量选择','Select multiple')} onClick={()=>{setSelecting(!selecting);setPickedIds([]);}}>{selecting?<XIcon aria-hidden="true"/>:<ListChecksIcon aria-hidden="true"/>}<span className="toolbar-secondary-label inline-grid" aria-hidden="true"><span className={cn('col-start-1 row-start-1',selecting&&'invisible')}>{t('批量选择','Select multiple')}</span><span className={cn('col-start-1 row-start-1',!selecting&&'invisible')}>{t('取消选择','Cancel selection')}</span></span></Button></Hint><Button disabled={locked||!snapshot||!snapshot.projectTrusted} onClick={()=>{cancelChecks();setOperationError(null);setAdding(true);}}><PlusIcon aria-hidden="true" data-icon="inline-start"/>{t('添加','Add')}</Button></div></InventoryToolbar>
   {selecting&&<BulkSelectionBar framed count={picked.length} disabled={locked} zh={zh} onSelectAll={()=>setPickedIds(selectVisible(pickedIds,eligible))} onInvert={()=>setPickedIds(selectVisible(pickedIds,eligible,true))}>
    <SkillBatchToggleControls count={picked.length} disabled={locked} canEnable={picked.some(item=>item.resources.some(resource=>!resource.enabled))} canDisable={picked.some(piPackageEnabled)} zh={zh} onChange={enabled=>{const ids=picked.filter(item=>item.resources.some(resource=>resource.enabled!==enabled)).map(item=>item.id);if(ids.length)void run('packages',{ids,state:enabled?'load':'unload'});}}/>
    <Button size="sm" variant="destructive" disabled={locked||!picked.some(item=>item.canRemove)} onClick={()=>{setOperationError(null);setRemoving(picked.filter(item=>item.canRemove));}}>{t('卸载','Uninstall')}</Button>
   </BulkSelectionBar>}
   {loading&&!snapshot?<LoadingCards variant="inventory" className="skill-grid" label={t('正在读取扩展包…','Reading packages…')}/>:!snapshot?<Empty><EmptyHeader><EmptyTitle>{t('扩展包读取失败','Could not read packages')}</EmptyTitle></EmptyHeader><EmptyContent><Button variant="outline" onClick={()=>void load(true)}>{t('重试','Retry')}</Button></EmptyContent></Empty>:<>
    {!filtered.length?<Empty><EmptyHeader><EmptyTitle>{query||sourceFilter!=='all'||statusFilter!=='all'?t('未找到匹配的扩展包','No matching packages'):t('暂无扩展包','No packages yet')}</EmptyTitle></EmptyHeader><EmptyContent>{query||sourceFilter!=='all'||statusFilter!=='all'?<Button variant="outline" onClick={()=>{setQuery('');setSourceFilter('all');setStatusFilter('all');}}>{t('清除筛选','Clear filters')}</Button>:<Button disabled={locked||!snapshot.projectTrusted} onClick={()=>{cancelChecks();setOperationError(null);setAdding(true);}}>{t('添加扩展包','Add package')}</Button>}</EmptyContent></Empty>:<div className="skill-grid grid auto-rows-fr gap-4">{filtered.map(item=><Card variant="inventory" role={selecting?'checkbox':'article'} aria-label={selecting?`${t('选择插件','Select plugin')} ${item.name}`:undefined} tabIndex={selecting&&!locked&&eligible.includes(item.id)?0:undefined} aria-checked={selecting?pickedIds.includes(item.id):undefined} aria-disabled={selecting?(locked||!eligible.includes(item.id)):undefined} className={cn('group min-w-0 cursor-pointer text-left active:ring-ring',selecting&&pickedIds.includes(item.id)&&'ring-primary/50',selecting&&'outline-none focus-visible:ring-2 focus-visible:ring-ring')} key={item.id} onClick={event=>{if(selecting){if(!locked&&eligible.includes(item.id))setPickedIds(previous=>selectVisible(previous,[item.id],true));}else if(!locked&&event.target instanceof Element&&!event.target.closest("button, a, input, select, textarea, [role='switch'], [data-hint-disabled]"))onSelect(item.id);}} onKeyDown={event=>{if(selecting&&event.target===event.currentTarget&&(event.key===' '||event.key==='Enter')){event.preventDefault();if(!event.repeat&&!locked&&eligible.includes(item.id))setPickedIds(previous=>selectVisible(previous,[item.id],true));}}}>
     <InventoryCardHeader inert={selecting} selection={selecting&&<Checkbox checked={pickedIds.includes(item.id)} disabled={locked||!eligible.includes(item.id)} tabIndex={-1} aria-hidden="true"/>} control={item.resources.length>0&&<Hint stable disabled={locked||!snapshot.projectTrusted} text={item.resources.some(resource=>resource.enabled)&&item.resources.some(resource=>!resource.enabled)?t('部分启用','Partially enabled'):piPackageEnabled(item)?t('已启用','Enabled'):t('已停用','Disabled')}><Switch checked={piPackageEnabled(item)} disabled={locked||!snapshot.projectTrusted} aria-label={`${t('启用插件','Enable plugin')} ${item.name}`} onCheckedChange={enabled=>void run('packages',{ids:[item.id],state:enabled?'load':'unload'})}/></Hint>} heading={<button type="button" disabled={locked} aria-label={`${t('查看扩展包详情','View package details')} ${item.name}`} className="flex w-full min-w-0 cursor-pointer items-center gap-2 text-left" onClick={()=>onSelect(item.id)}><OverflowText text={piPackageDisplayName(item)} className="truncate"/></button>} description={<OverflowText className="min-h-10 line-clamp-2 leading-5" text={item.description}/>}/>
     <InventoryCardFooter inert={selecting} metadata={<span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><PiPackageSourceIcon kind={item.kind}/><span className="truncate">{item.kind==='npm'?'NPM':piPackageSourceLabel(item.kind,zh)}</span></span>}>
      {project&&item.resources.some(resource=>resource.override&&resource.override!=='inherit')&&<Hint text={t('恢复继承设置','Restore inherited settings')}><Button variant="ghost" size="icon-sm" disabled={locked||!snapshot.projectTrusted} aria-label={`${t('恢复继承设置','Restore inherited settings')} ${item.name}`} onClick={()=>void run('packages',{ids:[item.id],state:'inherit'})}><RotateCcwIcon aria-hidden="true"/></Button></Hint>}
      {item.canUpdate&&checks[item.id]?.affected.some(affected=>affected.status==='available'&&affected.updateable)&&<Hint stable text={t('可更新','Update available')} disabled={locked}><Button variant="ghost" size="icon-sm" disabled={locked} aria-label={`${t('更新','Update')} ${piPackageDisplayName(item)}`} onClick={()=>{cancelChecks();setOperationError(null);setReview({id:item.id,result:checks[item.id]});}}><CircleArrowUpIcon aria-hidden="true" className="text-skill-update"/></Button></Hint>}
      {item.canRemove&&<Hint text={t('卸载','Uninstall')}><Button variant="ghost" size="icon-sm" disabled={locked} aria-label={`${t('卸载','Uninstall')} ${item.name}`} onClick={()=>{cancelChecks();setOperationError(null);setRemoving([item]);}}><Trash2Icon aria-hidden="true"/></Button></Hint>}
     </InventoryCardFooter>
    </Card>)}</div>}
   </>}
  </>}
  <Modal compact open={adding&&active} onClose={()=>setAdding(false)} busy={pending} title={t('添加扩展包','Add package')} description={t(`安装到${project?'当前项目':'全局'}。`,`Install ${project?'in this project':'globally'}.`)}>
   <FieldGroup><Field><FieldLabel htmlFor="pi-package-source">{t('包来源','Package source')}</FieldLabel><div className="flex min-w-0 items-center gap-2"><Input name="pi-package-source" autoComplete="off" spellCheck={false} id="pi-package-source" disabled={pending} placeholder="npm:package-name / git:github.com/owner/repo" value={source} onChange={event=>setSource(event.target.value)}/><Hint text={t('选择本地目录','Choose local folder')}><Button variant="outline" size="icon-sm" disabled={pending} aria-label={t('选择本地目录','Choose local folder')} onClick={()=>void open({directory:true,multiple:false}).then(path=>{if(typeof path==='string')setSource(path);}).catch(error=>reportError(String(error),t('目录选择失败','Could not select a folder')))}><FolderOpenIcon aria-hidden="true"/></Button></Hint></div><FieldDescription>{t('支持 npm 包、Git 仓库和本地路径。','Supports npm packages, Git repositories and local paths.')}</FieldDescription></Field><Button variant="link" className="w-fit" disabled={pending} onClick={()=>void openUrl('https://pi.dev/packages').catch(error=>reportError(String(error),t('包目录无法打开','Could not open the package catalog')))}>{t('浏览 Pi 扩展包','Browse Pi packages')}</Button>{operationError&&<FlowError zh={zh} message={operationError} help={t('扩展包添加失败，请检查来源后重新添加。','Could not add the package. Check its source and add again.')}/>}</FieldGroup>
   <ModalActions><Button variant="outline" disabled={pending} onClick={()=>setAdding(false)}>{t('取消','Cancel')}</Button><Button disabled={pending||!source.trim()} onClick={()=>void run('install',{source})}>{pending?t('添加中…','Adding…'):t('添加','Add')}</Button></ModalActions>
  </Modal>
  {removing&&<AlertDialog open={active} onOpenChange={value=>{if(!value&&!pending)setRemoving(null);}}><AlertDialogContent size="sm" onEscapeKeyDown={event=>{if(pending)event.preventDefault();}}><AlertDialogHeader><AlertDialogTitle>{t('卸载扩展包？','Uninstall package?')}</AlertDialogTitle><AlertDialogDescription>{removing?.every(item=>item.kind==='local')?t('移除当前范围的引用，保留本地源文件。','Remove the reference in this scope and keep local source files.'):t('移除当前范围的安装及配置，包括包内的扩展、技能、模板和主题。','Remove this scope’s installation and configuration, including its extensions, skills, templates and themes.')}{removing?.some(item=>item.kind==='local')&&!removing.every(item=>item.kind==='local')&&t('本地目录仅移除引用，保留源文件。',' Local directories only lose their references; source files are kept.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogBody className="flex flex-col gap-4"><p className="break-words font-medium">{removing?.map(item=>item.name).join('、')}</p><p className="text-sm text-muted-foreground">{project?t('当前项目','This project'):t('全局','Global')}</p>{operationError&&<FlowError zh={zh} message={operationError} help={t('扩展包卸载失败，请刷新后重新卸载。','Package removal failed. Refresh and try again.')}/>}</AlertDialogBody><AlertDialogFooter><AlertDialogCancel disabled={pending}>{t('取消','Cancel')}</AlertDialogCancel><AlertDialogAction disabled={pending} variant="destructive" onClick={event=>{event.preventDefault();void removePackages();}}>{pending?t('卸载中…','Uninstalling…'):t('卸载','Uninstall')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
  <PiPackageUpdateDialog packageName={snapshot?.packages.find(item=>item.id===review?.id)?.name} review={active?review?.result??null:null} busy={pending} zh={zh} home={home} onClose={()=>{setReview(null);setOperationError(null);}} onUpdate={()=>{if(review)void run(review.result.error?'check':'update',{id:review.id,expected:review.result.affected});}}/>
 </section>;
}
