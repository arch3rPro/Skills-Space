import { useCallback, useEffect, useRef, useState } from 'react';
import { TypeIcon, BotIcon, ClipboardCheckIcon, ClockIcon, EyeIcon, FileTextIcon, FolderIcon, FolderOpenIcon, InfoIcon, LoaderCircleIcon, AppWindowIcon, PackagePlusIcon, PencilIcon, GitCommitHorizontalIcon, PlusIcon, RefreshCwIcon } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Modal, ModalActions } from '@/components/modal';
import { InventoryCard, InventoryCardHeader, InventoryCardFooter } from '@/components/inventory-card';
import { InventoryToolbar } from '@/components/inventory-toolbar';
import { SkillDetail, SkillDetailHeader, SkillDetailMetadata } from '@/components/skill-detail';
import { SkillDocument } from '@/components/skill-document';
import { SkillMarkdown } from '@/components/skill-markdown';
import { AgentLogo } from '@/components/agent-logo';
import { DirectoryLink } from '@/components/directory-link';
import { VersionValue } from '@/components/version-value';
import { cn } from '@/lib/utils';
import { OverflowText } from '@/components/overflow-text';
import { Hint } from '@/components/hint';
import { WorkshopWorkbench, type WorkbenchWorkspace } from '@/components/workshop-workbench';
import { notifyError } from '@/lib/notifications';
import { workshop, workshopRunning, workshopAgentEligibility, type WorkshopDraft, type WorkshopDetail, type WorkshopAgent, type WorkshopScreen, type WorkshopSession } from '@/lib/workshop';

type Form = { id?:string; title:string; description:string; brief:string; agent:WorkshopAgent['id']|'' };
const defaultWorkspace:WorkbenchWorkspace={file:'PLAN.md',filesOpen:false};
export function SkillWorkshop({zh,home,visibleAgentIds,session,onInstall,onWorkbenchChange}: {zh:boolean;home:string;visibleAgentIds:string[];session:WorkshopSession;onInstall:(source:string,agents?:string[],skills?:string[])=>void;onWorkbenchChange:(active:boolean)=>void}) {
  const t=(cn:string,en:string)=>zh?cn:en;
  const [drafts,setDrafts]=useState<WorkshopDraft[]>([]),[agents,setAgents]=useState<WorkshopAgent[]>([]);
  const [agentStatus,setAgentStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[pending,setPending]=useState(false);
  const [screens,setScreens]=useState(session.screens),[query,setQuery]=useState(session.query);
  const [workspaces,setWorkspaces]=useState(session.workspaces),[inputs,setInputs]=useState(session.inputs);
  const [form,setForm]=useState<Form|null>(null),[fileContent,setFileContent]=useState(''),[fileLoading,setFileLoading]=useState(false),[fileError,setFileError]=useState(false),[fileReload,setFileReload]=useState(0);
  const [detailMetadata,setDetailMetadata]=useState<WorkshopDraft['metadata']>(null);
  const [detailContent,setDetailContent]=useState(''),[report,setReport]=useState(''),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState(false),[reportError,setReportError]=useState(false),[detailReload,setDetailReload]=useState(0);
  const [discard,setDiscard]=useState(false);
  const formOriginal=useRef<Form|null>(null),fileToggle=useRef<HTMLButtonElement>(null),pollError=useRef('');
  const activeRequest=useRef(false),fileRequest=useRef(0),detailRequest=useRef(0),reported=useRef('');
  const screen=screens[screens.length-1], draft=drafts.find(d=>d.id===screen?.id);
  const running=drafts.find(workshopRunning), isWorkbench=screen?.view==='workbench';
  const workspace=draft?workspaces[draft.id]??defaultWorkspace:defaultWorkspace;
  const selectedFile=draft?.files.find(f=>f.path===workspace.file);
  const planFile=draft?.files.find(f=>f.path==='PLAN.md');
  const reportFile=draft?.files.find(f=>f.path==='review/report.md');
  const skillFile=draft?.files.find(f=>f.path===draft.skillFile);
  const screenId=screen?.id;
  useEffect(()=>{onWorkbenchChange(isWorkbench);return()=>onWorkbenchChange(false);},[isWorkbench,onWorkbenchChange]);
  const load=useCallback(async(showLoading=false)=>{
    if(activeRequest.current)return;
    activeRequest.current=true;if(showLoading)setLoading(true);
    try{const result=await workshop<WorkshopDraft[]>('list');setDrafts(result);setFailed(false);pollError.current='';}
    catch(reason){setFailed(true);if(pollError.current!==String(reason)){pollError.current=String(reason);notifyError(String(reason),zh,undefined,zh?'创意工坊读取失败，请刷新。':'Could not read the workshop. Refresh to try again.');}}
    finally{activeRequest.current=false;setLoading(false);}
  },[zh]);
  const loadAgents=useCallback(async()=>{setAgentStatus('loading');try{setAgents(await workshop<WorkshopAgent[]>('agents'));setAgentStatus('ready');}catch(reason){setAgentStatus('error');notifyError(String(reason),zh);}},[zh]);
  useEffect(()=>{void load(true);void loadAgents();},[load,loadAgents]);
  useEffect(()=>{if(!running)return;const timer=window.setInterval(()=>void load(),750);return()=>window.clearInterval(timer);},[running?.id,load]);
  useEffect(()=>{if(!draft||isWorkbench)return;
    const token=++detailRequest.current;setDetailContent('');setReport('');setDetailMetadata(null);setDetailError(false);setReportError(false);setDetailLoading(!!draft.skillFile);
    void workshop<WorkshopDetail>('detail',{id:draft.id}).then(value=>{
      if(token!==detailRequest.current)return;
      setDetailContent(value.content);setReport(value.report);setDetailMetadata(value.metadata);setDetailError(!!value.contentError);setReportError(!!value.reportError);
      if(value.contentError)notifyError(value.contentError,zh);if(value.reportError)notifyError(value.reportError,zh);
    }).catch(reason=>{if(token===detailRequest.current){setDetailError(true);notifyError(String(reason),zh);}}).finally(()=>{if(token===detailRequest.current)setDetailLoading(false);});
    return()=>{detailRequest.current++;};
  },[screenId,isWorkbench,skillFile?.modified,reportFile?.modified,detailReload,zh]);
  useEffect(()=>{const token=++fileRequest.current;setFileContent('');setFileError(false);if(!draft||!isWorkbench||!workspace.filesOpen||!selectedFile?.readable){setFileLoading(false);return;}setFileLoading(true);
    void workshop<string>('document',{id:draft.id,path:selectedFile.path}).then(content=>{if(token===fileRequest.current)setFileContent(content);}).catch(reason=>{if(token===fileRequest.current){setFileError(true);notifyError(String(reason),zh);}}).finally(()=>{if(token===fileRequest.current)setFileLoading(false);});return()=>{fileRequest.current++;};
  },[screenId,isWorkbench,workspace.filesOpen,workspace.file,selectedFile?.modified,fileReload,zh]);
  useEffect(()=>{const result=draft?.run;if(!result?.error||result.phase!=='failed'||reported.current===result.id)return;reported.current=result.id;notifyError(result.error,zh,undefined,t('本轮创作未完成，现有文件已保留。','This turn did not finish. Existing files were preserved.'));},[draft?.run?.id,draft?.run?.phase,draft?.run?.error,zh]);
  function navigate(next?:WorkshopScreen){setScreens(previous=>{const value=next?[...previous.filter(item=>item.id!==next.id||item.view!==next.view),next]:previous.slice(0,-1);session.screens=value;return value;});}
  function updateWorkspace(value:Partial<WorkbenchWorkspace>){if(!draft)return;if(value.filesOpen===false)fileToggle.current?.focus();setWorkspaces(previous=>{const next={...previous,[draft.id]:{...(previous[draft.id]??defaultWorkspace),...value}};session.workspaces=next;return next;});}
  function updateInput(value:string){if(!draft)return;setInputs(previous=>{const next={...previous,[draft.id]:value};session.inputs=next;return next;});}
  async function refresh(){setFileReload(value=>value+1);await Promise.all([load(true),loadAgents()]);}
  const canUseAgent=(id:string)=>agentStatus==='ready'&&workshopAgentEligibility(agents,visibleAgentIds,id).canContinue;
  const canChooseAgent=(id:string)=>agentStatus==='ready'&&workshopAgentEligibility(agents,visibleAgentIds,id).canSelect;
  const defaultAgent=agents.find(agent=>canChooseAgent(agent.id))?.id??'';
  const formWillSend=!!form&&!form.id&&!running&&canChooseAgent(form.agent);
  async function send(item:WorkshopDraft,message:string,kind:'plan'|'chat'|'build'='chat',clearInput=true) {
    if(pending||running||!canUseAgent(item.agent))return;
    setPending(true);
    try {
      const plan=kind==='build'&&workspace.file==='PLAN.md'&&workspace.filesOpen&&!fileLoading?fileContent:undefined;
      if(kind==='build'&&!plan){updateWorkspace({file:'PLAN.md',filesOpen:true});return;}
      await workshop('send',{id:item.id,message,kind,plan});
      if(clearInput)setInputs(previous=>{const next={...previous,[item.id]:''};session.inputs=next;return next;});
      await load();
    }catch(reason){notifyError(String(reason),zh,undefined,t('未能开始本轮创作，请检查 Agent 后重试。','Could not start this turn. Check the Agent and try again.'));}
    finally{setPending(false);}
  }
  function openForm(value:Form){formOriginal.current=value;setForm(value);if(!value.id)void loadAgents();}
  function closeForm(){if(pending)return;if(form&&JSON.stringify(form)!==JSON.stringify(formOriginal.current)){setDiscard(true);return;}setForm(null);}
  async function submitForm(){
    if(!form||!form.id&&!canChooseAgent(form.agent))return;
    const isNew=!form.id,willSend=formWillSend;
    setPending(true);let result:WorkshopDraft|undefined;
    try{
      result=await workshop<WorkshopDraft>(isNew?'create':'update',isNew?{input:form}:{id:form.id,input:{title:form.title,description:form.description}});
      await load();setForm(null);
      if(isNew)navigate({id:result.id,view:'workbench'});
    }catch(reason){notifyError(String(reason),zh);}
    finally{setPending(false);}
    if(result&&willSend)await send(result,result.brief,'plan',false);
  }
  async function stop(){if(!draft)return;try{await workshop('stop',{id:draft.id});await load();}catch(reason){notifyError(String(reason),zh);}}
  function openFolder(item:WorkshopDraft,skill=false){void workshop('open',{id:item.id,skill}).catch(reason=>notifyError(String(reason),zh));}
  function folderAction(item:WorkshopDraft,withLabel=false){return <Hint text={withLabel?undefined:t('打开目录','Open folder')}><Button variant={withLabel?'outline':'ghost'} size={withLabel?'default':'icon-sm'} aria-label={t('打开目录','Open folder')} onClick={()=>openFolder(item)}><FolderOpenIcon data-icon={withLabel?'inline-start':undefined}/>{withLabel?t('打开目录','Open folder'):null}</Button></Hint>;}
  function editAction(item:WorkshopDraft,compact=false){return <Hint text={t('编辑信息','Edit information')}><Button variant="ghost" size={compact?'icon-xs':'icon-sm'} className={cn(compact&&'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100')} aria-label={`${t('编辑信息','Edit information')} ${item.title}`} disabled={pending||workshopRunning(item)} onClick={()=>openForm({id:item.id,title:item.title,description:item.description??'',brief:item.brief,agent:item.agent})}><PencilIcon/></Button></Hint>;}
  function start(item:WorkshopDraft){navigate({id:item.id,view:'workbench'});}
  const skillTitle=(item:WorkshopDraft)=>item.metadata?.name||item.title;
  const skillDescription=(item:WorkshopDraft)=>item.description||item.metadata?.description||t('暂无描述','No description');
  const visible=drafts.filter(item=>[item.title,item.description,item.brief,item.metadata?.name,item.metadata?.description].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const runningLink=running&&running.id!==draft?.id?<Button variant="ghost" size="sm" onClick={()=>navigate({id:running.id,view:'workbench'})}>{t('返回运行中的对话','Return to the active conversation')}</Button>:null;
  const toolbar=<InventoryToolbar><div className="toolbar-filters flex min-w-0 flex-1 items-center gap-2"><Input autoComplete="off" type="search" aria-label={t('搜索创作','Search creations')} placeholder={t('搜索创作…','Search creations…')} value={query} onChange={event=>{setQuery(event.target.value);session.query=event.target.value;}}/><Button variant="ghost" disabled={loading} onClick={()=>void refresh()}><RefreshCwIcon data-icon="inline-start" className={loading?'animate-spin motion-reduce:animate-none':undefined}/>{t('刷新','Refresh')}</Button></div><div className="toolbar-actions ml-auto">{runningLink}<Button disabled={pending} onClick={()=>openForm({title:'',description:'',brief:'',agent:defaultAgent})}><PlusIcon data-icon="inline-start"/>{t('新建技能','New skill')}</Button></div></InventoryToolbar>;
  return <section className={isWorkbench?"workshop-page flex h-full min-h-0 min-w-0 flex-col gap-5":"workshop-page inventory-content flex min-w-0 flex-col gap-5"}>
    {!draft?<><h1>{t('创意工坊','Workshop')}</h1>{toolbar}{loading&&!drafts.length?<div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none"/>{t('加载中…','Loading…')}</div>:failed?<Empty><EmptyHeader><EmptyTitle>{t('创意工坊读取失败','Could not read the workshop')}</EmptyTitle></EmptyHeader><EmptyContent><Button variant="outline" onClick={()=>void refresh()}>{t('刷新','Refresh')}</Button></EmptyContent></Empty>:visible.length?<div className="skill-grid grid auto-rows-fr gap-4">{visible.map(item=>{
        const name=item.title,active=workshopRunning(item),editLabel=t('工作台','Workbench');
        return <InventoryCard key={item.id} onOpen={()=>navigate({id:item.id,view:'detail'})} className="flex flex-col">
          <InventoryCardHeader heading={<div className="flex min-w-0 items-center gap-1"><button type="button" className="block min-w-0 cursor-pointer text-left" aria-label={`${t('查看技能','View skill')} ${name}`} onClick={()=>navigate({id:item.id,view:'detail'})}><OverflowText text={name} className="block min-w-0 truncate"/></button>{editAction(item,true)}</div>}
            information={active?<Hint text={t('正在创作','Working')} focusable><span role="status" aria-label={t('正在创作','Working')}><LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none"/></span></Hint>:item.metadata?.error?<Hint text={t('技能信息读取失败，可刷新列表后重试。','Could not read skill metadata. Refresh the list to retry.')}><Button variant="ghost" size="icon-xs" aria-label={`${t('查看技能信息','View skill information')} ${name}`} onClick={()=>navigate({id:item.id,view:'detail'})}><InfoIcon/></Button></Hint>:undefined}
            description={<button type="button" className="block w-full min-w-0 cursor-pointer whitespace-normal text-left" aria-label={`${t('查看技能','View skill')} ${name}`} onClick={()=>navigate({id:item.id,view:'detail'})}><OverflowText text={skillDescription(item)} className="line-clamp-2 min-h-10 leading-5"/></button>}/>
          <InventoryCardFooter metadata={<Hint text={`${t('更新于','Updated')} ${new Date(item.updated).toLocaleString(zh?'zh-CN':'en-US')}`} focusable><span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">{item.skillFile?<ClockIcon className="size-3.5 shrink-0" aria-hidden="true"/>:<FileTextIcon className="size-3.5 shrink-0" aria-hidden="true"/>}<span className="truncate">{item.skillFile?new Date(item.updated).toLocaleDateString(zh?'zh-CN':'en-US'):t('草稿','Draft')}</span></span></Hint>}>
            <Hint text={t('打开目录','Open folder')}><Button variant="ghost" size="icon-sm" aria-label={`${t('打开目录','Open folder')} ${name}`} onClick={()=>void workshop('open',{id:item.id}).catch(reason=>notifyError(String(reason),zh))}><FolderOpenIcon/></Button></Hint>
            <Hint text={editLabel}><Button variant="ghost" size="icon-sm" aria-label={`${editLabel} ${name}`} onClick={()=>start(item)}><AppWindowIcon/></Button></Hint>
            {item.skillDirectory?<Hint text={t('安装技能','Install skill')} disabled={active||pending}><Button variant="ghost" size="icon-sm" disabled={active||pending} aria-label={`${t('安装技能','Install skill')} ${name}`} onClick={()=>onInstall(item.skillDirectory??'',[],item.metadata?.name?[item.metadata.name]:undefined)}><PackagePlusIcon/></Button></Hint>:null}
          </InventoryCardFooter>
        </InventoryCard>;
      })}</div>:<Empty><EmptyHeader><EmptyTitle>{query?t('没有找到创作','No creations found'):t('创建你的第一个技能','Create your first skill')}</EmptyTitle><EmptyDescription>{query?t('换个关键词，或清空搜索。','Try another keyword or clear the search.'):t('写下用途与要求，让你的 Agent 帮你完成。','Describe what you need and create it with your Agent.')}</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={()=>query?(setQuery(''),session.query=''):openForm({title:'',description:'',brief:'',agent:defaultAgent})}>{query?t('清空搜索','Clear search'):t('新建技能','New skill')}</Button></EmptyContent></Empty>}</>:isWorkbench?<>
      <SkillDetailHeader title={draft.title} backLabel={screens[screens.length-2]?.view==='detail'?t('返回技能详情','Back to skill details'):t('返回创意工坊','Back to Workshop')} onBack={()=>navigate()} actions={<>{runningLink}<Button ref={fileToggle} variant="outline" aria-expanded={workspace.filesOpen} aria-label={t('展开文件区','Show files')} aria-controls="workshop-files-panel" onClick={()=>updateWorkspace({filesOpen:true})}><FolderIcon data-icon="inline-start"/>{t('文件','Files')}</Button>{draft.skillFile?<Button variant="outline" onClick={()=>navigate({id:draft.id,view:'detail'})}><EyeIcon data-icon="inline-start"/>{t('查看技能','View skill')}</Button>:null}{folderAction(draft,true)}</>}/>
      <WorkshopWorkbench id={draft.id} agent={draft.agent} agentName={agents.find(agent=>agent.id===draft.agent)?.name} messages={draft.messages.map(message=>({...message,files:message.role==='assistant'&&message===draft.messages[draft.messages.length-1]&&!workshopRunning(draft)?draft.files.filter(f=>f.path==='PLAN.md'||f.path===draft.skillFile).map(f=>f.path):undefined}))} files={draft.files} onRefreshFiles={()=>{setFileReload(value=>value+1);void load(true);}} refreshing={loading||fileLoading} workspace={workspace} onWorkspace={updateWorkspace} content={fileContent} fileLoading={fileLoading} fileError={fileError} onFileRetry={()=>setFileReload(value=>value+1)} notice={agentStatus==='ready'&&!canUseAgent(draft.agent)?<Alert><AlertTitle>{t('未找到所选智能体的命令','The selected Agent command was not found')}</AlertTitle><AlertDescription>{t('安装后刷新状态，再继续对话。','Install it, refresh its status, then continue.')}<Button variant="link" size="sm" onClick={()=>void loadAgents()}>{t('刷新状态','Refresh status')}</Button></AlertDescription></Alert>:agentStatus==='error'?<Alert><AlertTitle>{t('智能体读取失败','Could not read Agents')}</AlertTitle><AlertDescription><Button variant="link" size="sm" onClick={()=>void loadAgents()}>{t('重新检测智能体','Detect Agents again')}</Button></AlertDescription></Alert>:['failed','interrupted','stopped'].includes(draft.run?.phase??'')?<Alert><AlertTitle>{draft.run?.phase==='failed'?t('本轮创作未完成','This turn did not finish'):draft.run?.phase==='stopped'?t('已停止','Stopped'):t('上次创作已中断','The previous task was interrupted')}</AlertTitle><AlertDescription>{t('现有文件已保留，可以继续对话。','Existing files were preserved. Continue the conversation when ready.')}</AlertDescription></Alert>:null} input={inputs[draft.id]??''} onInput={updateInput} onSend={()=>void send(draft,inputs[draft.id]??'',draft.stage==='draft'?'plan':'chat')} onStop={()=>void stop()} onConfirm={canUseAgent(draft.agent)&&draft.stage==='planned'&&planFile&&workspace.filesOpen&&workspace.file==='PLAN.md'&&!fileLoading?()=>void send(draft,t('按当前方案开始构建。','Build the current plan.'),'build'):undefined} running={workshopRunning(draft)} activity={draft.run?.phase==='preparing'?t('正在准备创作技能…','Preparing skill-creator…'):draft.run?.activity} disabled={pending||!!running&&running.id!==draft.id||!canUseAgent(draft.agent)} onCopy={content=>{void navigator.clipboard.writeText(content).catch(reason=>notifyError(String(reason),zh));}} onOpenExternal={url=>void openUrl(url).catch(reason=>notifyError(String(reason),zh))} zh={zh} scrolls={session.scrolls}/>
    </>:<SkillDetail><SkillDetailHeader title={detailMetadata?.name||skillTitle(draft)} description={draft.description||detailMetadata?.description||skillDescription(draft)} backLabel={screens[screens.length-2]?.view==='workbench'?t('返回工作台','Back to workbench'):t('返回创意工坊','Back to Workshop')} onBack={()=>navigate()} actions={<><Button variant="outline" onClick={()=>start(draft)}><AppWindowIcon data-icon="inline-start"/>{t('工作台','Workbench')}</Button>{draft.skillDirectory?<Button disabled={workshopRunning(draft)} onClick={()=>onInstall(draft.skillDirectory??'',[],(detailMetadata?.name||draft.metadata?.name)?[detailMetadata?.name||draft.metadata?.name||'']:undefined)}><PackagePlusIcon data-icon="inline-start"/>{t('安装技能','Install skill')}</Button>:null}{report||reportError?<Button variant="outline" onClick={()=>navigate({id:draft.id,view:'detail',review:true})}><ClipboardCheckIcon data-icon="inline-start"/>{t('查看评估','View assessment')}</Button>:null}</>}/><SkillDetailMetadata>
      <div className="flex min-w-0 items-start gap-3"><dt className="shrink-0 text-muted-foreground"><Hint text={t('显示名称','Display name')} focusable><span className="inline-flex"><TypeIcon className="size-4" aria-hidden="true"/><span className="sr-only">{t('显示名称','Display name')}</span></span></Hint></dt><dd className="min-w-0 break-words">{draft.title}</dd></div>
      <div className="flex min-w-0 items-center gap-3"><dt className="shrink-0 text-muted-foreground"><Hint text={t('创作来源','Created with')} focusable><span className="inline-flex"><BotIcon className="size-4" aria-hidden="true"/><span className="sr-only">{t('创作来源','Created with')}</span></span></Hint></dt><dd className="flex min-w-0 items-center gap-2"><AgentLogo name={draft.agent} size={16}/>{agents.find(agent=>agent.id===draft.agent)?.name??draft.agent}</dd></div>
      {draft.skillFile?<div className="flex min-w-0 items-center gap-3"><dt className="shrink-0 text-muted-foreground"><GitCommitHorizontalIcon className="size-4" aria-hidden="true"/><span className="sr-only">{t('版本','Version')}</span></dt><dd className="flex min-w-0 items-center gap-2"><span className="text-muted-foreground">{t('版本','Version')}</span><Hint text={detailMetadata?.version||detailMetadata?.hash||undefined} focusable><span className="font-mono text-xs"><VersionValue value={detailMetadata?.version||detailMetadata?.hash||null} state={detailLoading?'loading':detailError||detailMetadata?.error||!detailMetadata?.version&&!detailMetadata?.hash?'error':'ready'} zh={zh}/></span></Hint></dd></div>:null}
      <div className="flex min-w-0 items-start gap-3"><dt className="sr-only">{t('技能位置','Skill location')}</dt><dd className="min-w-0"><DirectoryLink path={draft.skillDirectory??draft.directory} home={home} zh={zh} onOpen={()=>openFolder(draft,!!draft.skillDirectory)}/></dd></div>
      {detailMetadata?.license?<div className="flex min-w-0 items-start gap-3"><dt className="shrink-0 text-muted-foreground">{t('许可证','License')}</dt><dd className="min-w-0 break-words">{detailMetadata.license}</dd></div>:null}
      {detailMetadata?.compatibility?<div className="flex min-w-0 items-start gap-3"><dt className="shrink-0 text-muted-foreground">{t('兼容要求','Compatibility')}</dt><dd className="min-w-0 break-words">{detailMetadata.compatibility}</dd></div>:null}
    </SkillDetailMetadata>{draft.skillFile||detailLoading||detailError||report||reportError?<SkillDocument key={`${draft.id}:${screen.review&&(report||reportError)?'review':'preview'}`} content={detailContent} contentError={detailError?<Empty><EmptyHeader><EmptyTitle>{t('技能内容读取失败','Could not read the skill')}</EmptyTitle></EmptyHeader><EmptyContent><Button variant="outline" onClick={()=>setDetailReload(value=>value+1)}>{t('重新读取','Read again')}</Button></EmptyContent></Empty>:undefined} loading={detailLoading} zh={zh} defaultView={screen.review&&(report||reportError)?'review':undefined} additionalViews={report||reportError?[{id:'review',label:t('评估','Evaluation'),icon:<ClipboardCheckIcon aria-hidden="true"/>,content:reportError?<Empty><EmptyHeader><EmptyTitle>{t('评估报告读取失败','Could not read the report')}</EmptyTitle></EmptyHeader><EmptyContent><Button variant="outline" onClick={()=>setDetailReload(value=>value+1)}>{t('重新读取','Read again')}</Button></EmptyContent></Empty>:<SkillMarkdown content={report} zh={zh} onOpenExternal={url=>void openUrl(url)}/>}]:[]} onOpenExternal={url=>void openUrl(url).catch(reason=>notifyError(String(reason),zh))}/>:<Empty><EmptyHeader><EmptyTitle>{t('尚未构建技能','No skill yet')}</EmptyTitle><EmptyDescription>{t('进入工作台继续创作。','Continue creating in the workbench.')}</EmptyDescription></EmptyHeader></Empty>}</SkillDetail>}
    <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('放弃未保存的内容？','Discard unsaved changes?')}</AlertDialogTitle><AlertDialogDescription>{t('创作信息的修改尚未保存。','Changes to the creation have not been saved.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('继续编辑','Keep editing')}</AlertDialogCancel><AlertDialogAction onClick={()=>{setDiscard(false);setForm(null);}}>{t('放弃修改','Discard changes')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Modal compact open={!!form} title={form?.id?t('编辑信息','Edit information'):t('新建技能','New skill')} busy={pending} onClose={closeForm}>{form?<FieldGroup>
      <Field><FieldLabel htmlFor="workshop-title">{t('名称','Name')}</FieldLabel><Input autoComplete="off" autoFocus id="workshop-title" maxLength={80} value={form.title} disabled={pending} onChange={event=>setForm({...form,title:event.target.value})}/></Field>
      <Field><FieldLabel htmlFor="workshop-description">{t('描述','Description')}</FieldLabel><Textarea autoComplete="off" id="workshop-description" rows={2} maxLength={1000} value={form.description} disabled={pending} onChange={event=>setForm({...form,description:event.target.value})}/></Field>
      {!form.id?<>
      <Field><FieldLabel htmlFor="workshop-brief">{t('提示词','Prompt')}</FieldLabel><Textarea autoComplete="off" id="workshop-brief" rows={5} maxLength={8000} disabled={pending} value={form.brief} onChange={event=>setForm({...form,brief:event.target.value})}/></Field>
      <Field><FieldLabel id="workshop-agent-label">{t('选择智能体','Choose Agent')}</FieldLabel><Select value={form.agent} disabled={pending||agentStatus!=='ready'||!agents.some(agent=>canChooseAgent(agent.id))} onValueChange={value=>{const selected=agents.find(agent=>agent.id===value);if(selected)setForm({...form,agent:selected.id});}}><SelectTrigger aria-labelledby="workshop-agent-label"><SelectValue placeholder={t('选择智能体','Choose Agent')}/></SelectTrigger><SelectContent><SelectGroup>{visibleAgentIds.flatMap(id=>agents.filter(agent=>agent.id===id)).map(agent=>{const id=agent.id;return <SelectItem key={id} value={id} disabled={!canChooseAgent(id)}><AgentLogo name={id} size={16}/><span>{agent.name}</span>{agentStatus==='ready'&&!agent?.available?<span className="text-muted-foreground">{t('未安装','Not installed')}</span>:null}</SelectItem>;})}</SelectGroup></SelectContent></Select>
      {agentStatus==='loading'?<FieldDescription>{t('正在检测智能体…','Detecting Agents…')}</FieldDescription>:agentStatus==='error'?<FieldDescription><Button variant="link" size="sm" onClick={()=>void loadAgents()}>{t('重新检测智能体','Detect Agents again')}</Button></FieldDescription>:!form.agent?<FieldDescription>{t('在设置 → 智能体中显示已安装的 Claude Code、Codex、Pi 或 Sarvam Code 后，即可选择。','Show an installed Claude Code, Codex, Pi or Sarvam Code in Settings → Agents to select it.')}</FieldDescription>:null}
      </Field></>:null}
      <ModalActions><Button variant="outline" disabled={pending} onClick={closeForm}>{t('取消','Cancel')}</Button><Button disabled={pending||!form.title.trim()||!form.id&&(agentStatus==='loading'||!form.brief.trim()||!canChooseAgent(form.agent))} onClick={()=>void submitForm()}>{pending?<LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none"/>:null}{form.id?t('保存','Save'):formWillSend?t('开始对话','Start conversation'):t('保存草稿','Save draft')}</Button></ModalActions>
    </FieldGroup>:null}</Modal>
  </section>;
}
