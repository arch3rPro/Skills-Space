import { WorkshopOptimization } from '@/components/workshop-optimization';
import { WandSparklesIcon } from 'lucide-react';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
import { WorkshopPrompt, invocationMarker } from "@/components/workshop-skill-picker";
import { WorkshopEvaluation } from "@/components/workshop-evaluation";
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScaleIcon, TypeIcon, BotIcon, ClipboardCheckIcon, ClockIcon, EyeIcon, FileTextIcon, FolderIcon, FolderOpenIcon, InfoIcon, LoaderCircleIcon, AppWindowIcon, PackagePlusIcon, PencilIcon, PlusIcon, RefreshCwIcon } from 'lucide-react';
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
import { SkillDetail, SkillDetailHeader, SkillDetailMetadata, SkillMetadataField, SkillVersionMetadata } from '@/components/skill-detail';
import { SkillDocument } from '@/components/skill-document';
import { AgentLogo } from '@/components/agent-logo';
import { DirectoryLink } from '@/components/directory-link';
import { cn } from '@/lib/utils';
import { OverflowText } from '@/components/overflow-text';
import { Hint } from '@/components/hint';
import { WorkshopWorkbench, type WorkbenchWorkspace } from '@/components/workshop-workbench';
import { notifyError } from '@/lib/notifications';
import { workshop, workshopRunning, workshopAgentEligibility, type WorkshopEvaluationInput, type WorkshopSkillId, type WorkshopAgentId, type WorkshopDraft, type WorkshopDetail, type WorkshopAgent, type WorkshopScreen, type WorkshopSession } from '@/lib/workshop';

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
  const [discard,setDiscard]=useState(false),[promptMenuOpen,setPromptMenuOpen]=useState(false);
  const [selectedSkills,setSelectedSkills]=useState<Record<string,WorkshopSkillId>>(session.skills??{});
  const [sourceHash,setSourceHash]=useState<string|null>(null),[evaluationOpen,setEvaluationOpen]=useState(false);
  const [evaluationInputs,setEvaluationInputs]=useState<Record<string,WorkshopEvaluationInput>>(session.evaluationInputs??{});
  const formOriginal=useRef<Form|null>(null),fileToggle=useRef<HTMLButtonElement>(null),pollError=useRef('');
  const activeRequest=useRef(false),fileRequest=useRef(0),detailRequest=useRef(0),reported=useRef('');
  const screen=screens[screens.length-1], draft=drafts.find(d=>d.id===screen?.id);
  const running=drafts.find(workshopRunning), isWorkbench=screen?.view==='workbench';
  const optimizationOwner=drafts.find(item=>item.id===draft?.optimizationParent);
  const optimizationTask=optimizationOwner?.optimization;
  const closedRound=!!draft?.optimizationParent&&(optimizationTask?.ended||optimizationTask?.rounds.slice(-1)[0]!==draft.id);
  const workspace=draft?workspaces[draft.id]??defaultWorkspace:defaultWorkspace;
  const selectedFile=draft?.files.find(f=>f.path===workspace.file);
  const planFile=draft?.files.find(f=>f.path==='PLAN.md');
  const candidateReady=!!draft?.optimizationParent&&draft.stage==='ready'&&!!draft.candidateHash&&draft.candidateHash!==draft.optimizationInputHash;
  const reportFile=draft?.files.find(f=>f.path==='review/report.md');
  const skillFile=draft?.files.find(f=>f.path===draft.skillFile);
  const screenId=screen?.id;
  const {agent:evaluationAgent,focus:evaluationFocus,task:evaluationTask,output:evaluationOutput}=evaluationInputs[draft?.id??'']??{agent:draft?.agent??'codex',focus:'',task:'',output:''};
  function patchEvaluation(value:Partial<WorkshopEvaluationInput>){if(!draft)return;setEvaluationInputs(previous=>{const next={...previous,[draft.id]:{...(previous[draft.id]??{agent:draft.agent,focus:'',task:'',output:''}),...value}};session.evaluationInputs=next;return next;});}
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
    const token=++detailRequest.current;setDetailContent('');setReport('');setDetailMetadata(null);setSourceHash(null);setDetailError(false);setReportError(false);setDetailLoading(!!draft.skillFile);
    void workshop<WorkshopDetail>('detail',{id:draft.id}).then(value=>{
      if(token!==detailRequest.current)return;
      setDetailContent(value.content);setReport(value.report);setDetailMetadata(value.metadata);setSourceHash(value.currentSourceHash);setDetailError(!!value.contentError);setReportError(!!value.reportError);
      if(value.contentError)notifyError(value.contentError,zh);if(value.reportError)notifyError(value.reportError,zh);
    }).catch(reason=>{if(token===detailRequest.current){setDetailError(true);notifyError(String(reason),zh);}}).finally(()=>{if(token===detailRequest.current)setDetailLoading(false);});
    return()=>{detailRequest.current++;};
  },[screenId,isWorkbench,skillFile?.modified,reportFile?.modified,draft?.run?.phase,detailReload,zh]);
  useEffect(()=>{const token=++fileRequest.current;setFileContent('');setFileError(false);if(!draft||!isWorkbench||!workspace.filesOpen||!selectedFile?.readable){setFileLoading(false);return;}setFileLoading(true);
    void workshop<string>('document',{id:draft.id,path:selectedFile.path}).then(content=>{if(token===fileRequest.current)setFileContent(content);}).catch(reason=>{if(token===fileRequest.current){setFileError(true);notifyError(String(reason),zh);}}).finally(()=>{if(token===fileRequest.current)setFileLoading(false);});return()=>{fileRequest.current++;};
  },[screenId,isWorkbench,workspace.filesOpen,workspace.file,selectedFile?.modified,fileReload,zh]);
  useEffect(()=>{const result=draft?.run;if(!result?.error||result.phase!=='failed'||reported.current===result.id)return;reported.current=result.id;notifyError(result.error,zh,undefined,result.skill==='evaluator'?t('评估失败，请在评估页查看返回内容。','Evaluation failed. View the response in the evaluation tab.'):t('本轮创作未完成，现有文件已保留。','This turn did not finish. Existing files were preserved.'));},[draft?.run?.id,draft?.run?.phase,draft?.run?.error,zh]);
  function navigate(next?:WorkshopScreen){setScreens(previous=>{const value=next?[...previous.filter(item=>item.id!==next.id||item.view!==next.view),next]:previous.slice(0,-1);session.screens=value;return value;});}
  function updateWorkspace(value:Partial<WorkbenchWorkspace>){if(!draft)return;if(value.filesOpen===false)fileToggle.current?.focus();setWorkspaces(previous=>{const next={...previous,[draft.id]:{...(previous[draft.id]??defaultWorkspace),...value}};session.workspaces=next;return next;});}
  function updateInput(value:string){if(!draft)return;setInputs(previous=>{const next={...previous,[draft.id]:value};session.inputs=next;return next;});}
  async function refresh(){setFileReload(value=>value+1);await Promise.all([load(true),loadAgents()]);}
  const canUseAgent=(id:string)=>agentStatus==='ready'&&workshopAgentEligibility(agents,visibleAgentIds,id).canContinue;
  const canChooseAgent=(id:string)=>agentStatus==='ready'&&workshopAgentEligibility(agents,visibleAgentIds,id).canSelect;
  const defaultAgent=agents.find(agent=>canChooseAgent(agent.id))?.id??'';
  const formWillSend=!!form&&!form.id&&!running&&canChooseAgent(form.agent);
  async function send(item:WorkshopDraft,message:string,kind:'plan'|'chat'|'build'='chat',clearInput=true,options?:{skill?:WorkshopSkillId;agent?:WorkshopAgentId;task?:string;output?:string;baselineOutput?:string}) {
    const invocation=message.includes(invocationMarker)?selectedSkills[item.id]:undefined;
    message=message.split(invocationMarker).join('').trim();
    const explicitSkill=options?.skill??(kind==='build'?item.pendingSkill:invocation);
    const previousSkill=[...item.messages].reverse().find(turn=>turn.role==='user'&&(turn.skill==='optimizer'||turn.skill==='creator'))?.skill;
    const openCandidate=!item.optimizationParent&&!!item.skillFile&&kind==='chat'&&(explicitSkill??previousSkill)==='optimizer';
    const skill=openCandidate?'optimizer':explicitSkill;
    if(kind==='build'&&skill==='optimizer')message=t('按当前方案开始优化。','Optimize using the current plan.');
    const agent=skill==='evaluator'?(options?.agent??item.agent):item.agent;
    if(pending||running||closedRound||!canUseAgent(agent)||!message||clearInput&&promptMenuOpen)return;
    setPending(true);
    try {
      const approvedPlan=[...item.messages].reverse().find(message=>message.plan)?.text;
      const plan=kind==='build'
        ? approvedPlan || (workspace.file==='PLAN.md'&&workspace.filesOpen&&!fileLoading&&fileContent) || await workshop<string>('document',{id:item.id,path:'PLAN.md'})
        : undefined;
      const id=openCandidate?await workshop<string>('optimization-open',{id:item.id}):item.id;
      await workshop('send',{id,message,kind,plan,...options,skill});
      if(openCandidate){
        navigate({id:item.id,view:'detail',optimization:true});
        navigate({id,view:'workbench'});
      }
      if(clearInput){chooseSkill(item,undefined);setInputs(previous=>{const next={...previous,[item.id]:''};session.inputs=next;return next;});}
      await load();
    }catch(reason){notifyError(String(reason),zh,undefined,skill==='evaluator'?t('未能开始评估，请检查所选智能体后重试。','Could not start evaluation. Check the selected Agent and try again.'):t('未能开始本轮创作，请检查 Agent 后重试。','Could not start this turn. Check the Agent and try again.'));}
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
  function chooseSkill(item:WorkshopDraft,skill?:WorkshopSkillId){setSelectedSkills(previous=>{const next={...previous};if(skill)next[item.id]=skill;else delete next[item.id];session.skills=next;return next;});}
  function configureEvaluation(){if(!draft)return;setEvaluationOpen(true);}
  async function evaluate(){if(!draft||!canUseAgent(evaluationAgent))return;await send(draft,evaluationFocus.trim()||t('评估当前技能的质量。','Evaluate the current skill.'),'chat',false,{skill:'evaluator',agent:evaluationAgent,task:evaluationTask,output:evaluationOutput});setEvaluationOpen(false);}
  function start(item:WorkshopDraft){navigate({id:item.id,view:'workbench'});}
  async function optimizationAction(action:'optimization-start'|'optimization-open'|'optimization-apply'|'optimization-end',item:WorkshopDraft,round?:WorkshopDraft,suggestion?:string){
    setPending(true);
    try{
      const id=await workshop<string|null>(action,{id:item.id,roundId:round?.id,candidateHash:round?.candidateHash});
      if(id){
        setSelectedSkills(previous=>{const next={...previous,[id]:'optimizer' as const};session.skills=next;return next;});
        setInputs(previous=>{const next={...previous,[id]:invocationMarker+' '+(previous[id]?.split(invocationMarker).join('').trim()??'')+(suggestion?(previous[id]?.trim()?'\n\n':'')+suggestion:'')};session.inputs=next;return next;});
        navigate({id:item.id,view:'detail',optimization:true});
        navigate({id,view:'workbench'});
      }
      await load();
      setDetailReload(value=>value+1);
      return true;
    }catch(reason){notifyError(String(reason),zh);return false;}
    finally{setPending(false);}
  }
  const skillTitle=(item:WorkshopDraft)=>item.metadata?.name||item.title;
  const skillDescription=(item:WorkshopDraft)=>item.description||item.metadata?.description||t('暂无描述','No description');
  const visible=drafts.filter(item=>!item.optimizationParent&&[item.title,item.description,item.brief,item.metadata?.name,item.metadata?.description].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const runningLink=running&&running.id!==draft?.id?<Button variant="ghost" size="sm" onClick={()=>navigate({id:running.id,view:'workbench'})}>{t('返回运行中的对话','Return to the active conversation')}</Button>:null;
  const canConfirmPlan=!!draft&&!closedRound&&canUseAgent(draft.agent)&&draft.stage==='planned'&&!draft.planStale&&!!planFile&&!running;
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
      <SkillDetailHeader title={draft.title} backLabel={screens[screens.length-2]?.view==='detail'?t('返回技能详情','Back to skill details'):t('返回创意工坊','Back to Workshop')} onBack={()=>navigate()} actions={<>{draft.optimizationParent&&(!candidateReady||closedRound||running)&&<Button variant="outline" onClick={()=>navigate({id:draft.optimizationParent!,view:'detail',optimization:true})}><WandSparklesIcon data-icon="inline-start"/>{t('优化结果','Optimization results')}</Button>}{runningLink}<Button ref={fileToggle} variant="outline" aria-expanded={workspace.filesOpen} aria-label={t('展开文件区','Show files')} aria-controls="workshop-files-panel" onClick={()=>updateWorkspace({filesOpen:true})}><FolderIcon data-icon="inline-start"/>{t('文件','Files')}</Button>{draft.skillFile?<Button variant="outline" onClick={()=>navigate({id:draft.id,view:'detail'})}><EyeIcon data-icon="inline-start"/>{t('查看技能','View skill')}</Button>:null}{folderAction(draft,true)}</>}/>
      <WorkshopWorkbench id={draft.id} agent={draft.agent} agentName={agents.find(agent=>agent.id===draft.agent)?.name} messages={draft.messages.map(message=>({...message,files:message.files??(message.role==='assistant'&&message===draft.messages[draft.messages.length-1]&&!workshopRunning(draft)?draft.files.filter(f=>f.path==='PLAN.md'||f.path===draft.skillFile).map(f=>f.path):undefined)}))} files={draft.files} onRefreshFiles={()=>{setFileReload(value=>value+1);void load(true);}} refreshing={loading||fileLoading} workspace={workspace} onWorkspace={updateWorkspace} content={fileContent} fileLoading={fileLoading} fileError={fileError} onFileRetry={()=>setFileReload(value=>value+1)} notice={closedRound?null:agentStatus==='ready'&&!canUseAgent(draft.agent)?<Alert><AlertTitle>{t('未找到所选智能体的命令','The selected Agent command was not found')}</AlertTitle><AlertDescription>{t('安装后刷新状态，再继续对话。','Install it, refresh its status, then continue.')}<Button variant="link" size="sm" onClick={()=>void loadAgents()}>{t('刷新状态','Refresh status')}</Button></AlertDescription></Alert>:agentStatus==='error'?<Alert><AlertTitle>{t('智能体读取失败','Could not read Agents')}</AlertTitle><AlertDescription><Button variant="link" size="sm" onClick={()=>void loadAgents()}>{t('重新检测智能体','Detect Agents again')}</Button></AlertDescription></Alert>:['failed','interrupted','stopped'].includes(draft.run?.phase??'')?<Alert><AlertTitle>{draft.run?.phase==='failed'?(draft.run.skill==='evaluator'?t('评估未完成','Evaluation did not finish'):t('本轮创作未完成','This turn did not finish')):draft.run?.phase==='stopped'?t('已停止','Stopped'):t('上次创作已中断','The previous task was interrupted')}</AlertTitle><AlertDescription>{draft.run?.error&&<p className="break-words">{draft.run.error}</p>}{draft.run?.skill==='evaluator'?t('可在技能详情的评估页查看结果并重试。','View the result and retry in the skill’s evaluation tab.'):t('现有文件已保留，可以继续对话。','Existing files were preserved. Continue the conversation when ready.')}</AlertDescription></Alert>:null} composerReplacement={closedRound&&optimizationOwner?<div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{t('正在查看历史对话','Viewing past conversation')}</span>
        <Button disabled={pending||!!running} onClick={()=>void optimizationAction('optimization-open',optimizationOwner)}>{t('继续优化','Continue optimizing')}</Button>
      </div>:undefined}
      onReviewPlan={!closedRound&&draft.stage==='planned'&&planFile&&!running?()=>updateWorkspace({file:'PLAN.md',filesOpen:true}):undefined}
      question={workshopRunning(draft)?draft.run?.question:undefined}
      onAnswer={async answers=>{if(!draft.run?.question)return;await workshop('answer',{id:draft.id,runId:draft.run.id,token:draft.run.question.token,answers});await load();}}
      onReviewResult={candidateReady&&!closedRound&&!running&&optimizationOwner?()=>navigate({id:optimizationOwner.id,view:'detail',optimization:true}):undefined}
 sendDisabled={promptMenuOpen} promptEditor={<WorkshopPrompt placeholder={canConfirmPlan?t('告诉我方案哪里需要调整…','Tell me what to change in the plan…'):undefined} onMenuOpenChange={setPromptMenuOpen} key={draft.id} value={inputs[draft.id]??''} skill={selectedSkills[draft.id]} onChange={(value,skill)=>{updateInput(value);chooseSkill(draft,skill);}} disabled={closedRound||pending||!!running&&running.id!==draft.id||!canUseAgent(draft.agent)} hasSkill={!!draft.skillFile} zh={zh} running={workshopRunning(draft)} onSend={()=>void send(draft,inputs[draft.id]??'')}/>} confirmLabel={draft.pendingSkill==='optimizer'?t('按方案优化','Optimize this plan'):undefined} input={inputs[draft.id]??''} onInput={updateInput} onSend={()=>void send(draft,inputs[draft.id]??'')} onStop={()=>void stop()} onConfirm={canConfirmPlan?()=>void send(draft,t('按当前方案开始构建。','Build the current plan.'),'build'):undefined} running={workshopRunning(draft)} activity={draft.run?.phase==='stopping'?t('正在停止…','Stopping…'):undefined} disabled={closedRound||pending||!!running&&running.id!==draft.id||!canUseAgent(draft.agent)} onCopy={content=>{void navigator.clipboard.writeText(content).catch(reason=>notifyError(String(reason),zh));}} onOpenExternal={url=>void openUrl(url).catch(reason=>notifyError(String(reason),zh))} zh={zh} scrolls={session.scrolls}/>
    </>:<SkillDetail><SkillDetailHeader title={detailMetadata?.name||skillTitle(draft)} description={draft.description||detailMetadata?.description||skillDescription(draft)} backLabel={screens[screens.length-2]?.view==='workbench'?t('返回工作台','Back to workbench'):t('返回创意工坊','Back to Workshop')} onBack={()=>navigate()} actions={<><Button variant="outline" onClick={()=>start(draft)}><AppWindowIcon data-icon="inline-start"/>{t('工作台','Workbench')}</Button>{draft.skillDirectory&&!draft.optimizationParent?<Button disabled={workshopRunning(draft)} onClick={()=>onInstall(draft.skillDirectory??'',[],(detailMetadata?.name||draft.metadata?.name)?[detailMetadata?.name||draft.metadata?.name||'']:undefined)}><PackagePlusIcon data-icon="inline-start"/>{t('安装技能','Install skill')}</Button>:null}</>}/><SkillDetailMetadata>
      <SkillMetadataField label={t('显示名称','Display name')} icon={<TypeIcon className="size-4" aria-hidden="true" />}>{draft.title}</SkillMetadataField>
      <SkillMetadataField label={t('创作来源','Created with')} icon={<BotIcon className="size-4" aria-hidden="true" />}>
        <span className="inline-flex max-w-full items-center gap-2 align-top"><AgentLogo name={draft.agent} size={16}/>{agents.find(agent=>agent.id===draft.agent)?.name??draft.agent}</span>
      </SkillMetadataField>
      {draft.skillFile && <SkillVersionMetadata label={t('版本','Version')} value={detailMetadata?.version || detailMetadata?.hash || null}
        state={detailLoading ? 'loading' : detailError || detailMetadata?.error ? 'error' : 'ready'} zh={zh} />}
      <SkillMetadataField label={t('技能位置','Skill location')}>
        <DirectoryLink path={draft.skillDirectory ?? draft.directory} home={home} zh={zh} onOpen={() => openFolder(draft, !!draft.skillDirectory)} />
      </SkillMetadataField>
      {detailMetadata?.license && <SkillMetadataField label={t('许可证','License')} icon={<ScaleIcon className="size-4" aria-hidden="true" />}>{detailMetadata.license}</SkillMetadataField>}
      {detailMetadata?.compatibility && <SkillMetadataField label={t('兼容要求','Compatibility')} icon={<InfoIcon className="size-4" aria-hidden="true" />}>{detailMetadata.compatibility}</SkillMetadataField>}
    </SkillDetailMetadata>{draft.skillFile||detailLoading||detailError||report||reportError?<SkillDocument key={`${draft.id}:${screen.optimization?'optimization':screen.review?'review':'preview'}`} content={detailContent} contentError={detailError?<Empty><EmptyHeader><EmptyTitle>{t('技能内容读取失败','Could not read the skill')}</EmptyTitle></EmptyHeader><EmptyContent><Button variant="outline" onClick={()=>setDetailReload(value=>value+1)}>{t('重新读取','Read again')}</Button></EmptyContent></Empty>:undefined} loading={detailLoading} zh={zh} defaultView={screen.optimization?'optimization':screen.review?'review':undefined} additionalViews={[...(draft.skillFile||report||reportError?[{id:'review',label:t('评估','Evaluation'),icon:<ClipboardCheckIcon aria-hidden="true"/>,content:<WorkshopEvaluation draft={draft} sourceHash={sourceHash} legacyReport={report} legacyError={reportError} zh={zh} onStart={configureEvaluation} onStop={()=>void stop()} onRetry={()=>setDetailReload(v=>v+1)} onOptimize={text=>void optimizationAction('optimization-open',draft,undefined,t('根据以下评估建议优化技能：\n','Optimize the skill using these findings:\n')+text)}/>}]:[]),...(!draft.optimizationParent&&draft.skillFile?[{
      id:'optimization',label:t('优化','Optimization'),icon:<WandSparklesIcon aria-hidden="true"/>,
      content:<WorkshopOptimization draft={draft} rounds={drafts.filter(item=>item.optimizationParent===draft.id)} zh={zh} busy={pending||!!running}
        onStart={()=>void optimizationAction('optimization-start',draft)} onContinue={round=>{navigate({id:draft.id,view:'detail',optimization:true});start(round);}}
        onCompare={(round,task,baselineOutput,output)=>void send(round,t('按相同用例对比两版实际输出。','Compare actual outputs for the same cases.'),'chat',false,{skill:'evaluator',task,baselineOutput,output})}
        onApply={round=>optimizationAction('optimization-apply',draft,round)} onEnd={()=>optimizationAction('optimization-end',draft)}/>
    }]:[])]} onOpenExternal={url=>void openUrl(url).catch(reason=>notifyError(String(reason),zh))}/>:<Empty><EmptyHeader><EmptyTitle>{t('尚未构建技能','No skill yet')}</EmptyTitle><EmptyDescription>{t('进入工作台继续创作。','Continue creating in the workbench.')}</EmptyDescription></EmptyHeader></Empty>}</SkillDetail>}
    <Modal compact open={evaluationOpen} title={t('评估技能','Evaluate skill')} description={t('评估技能质量，查看具体问题和改进建议。','Evaluate the skill and get findings and suggestions.')} busy={pending} onClose={()=>setEvaluationOpen(false)}><FieldGroup><Field><FieldLabel id="evaluation-agent-label">{t('选择智能体','Choose Agent')}</FieldLabel><Select value={evaluationAgent} onValueChange={value=>{const agent=agents.find(a=>a.id===value);if(agent)patchEvaluation({agent:agent.id});}}><SelectTrigger aria-labelledby="evaluation-agent-label"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{agents.filter(a=>visibleAgentIds.includes(a.id)||a.id===draft?.agent).map(a=><SelectItem key={a.id} value={a.id} disabled={!a.available}><AgentLogo name={a.id} size={16}/>{a.name}{!a.available?t(' · 未安装',' · Not installed'):''}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel htmlFor="evaluation-focus">{t('评估重点','Evaluation focus')}</FieldLabel><Textarea id="evaluation-focus" rows={2} value={evaluationFocus} onChange={e=>patchEvaluation({focus:e.target.value})} placeholder={t('可选，重点检查哪些问题…','Optional: what should the review focus on?')}/></Field><Collapsible><CollapsibleTrigger asChild><Button variant="ghost" size="sm">{t('添加任务与实际输出（可选）','Add task and actual output (optional)')}</Button></CollapsibleTrigger><CollapsibleContent><FieldGroup className="pt-4"><Field><FieldLabel htmlFor="evaluation-task">{t('任务与预期','Task and expectations')}</FieldLabel><Textarea id="evaluation-task" value={evaluationTask} onChange={e=>patchEvaluation({task:e.target.value})}/></Field><Field><FieldLabel htmlFor="evaluation-output">{t('实际输出','Actual output')}</FieldLabel><Textarea id="evaluation-output" value={evaluationOutput} onChange={e=>patchEvaluation({output:e.target.value})}/><FieldDescription>{t('仅评审已有输出，不自动执行任务。','Review supplied outputs without automatically executing a task.')}</FieldDescription></Field></FieldGroup></CollapsibleContent></Collapsible><ModalActions><Button variant="outline" disabled={pending} onClick={()=>setEvaluationOpen(false)}>{t('取消','Cancel')}</Button><Button disabled={pending||!!running||!canUseAgent(evaluationAgent)} onClick={()=>void evaluate()}>{t('开始评估','Start evaluation')}</Button></ModalActions></FieldGroup></Modal>
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
