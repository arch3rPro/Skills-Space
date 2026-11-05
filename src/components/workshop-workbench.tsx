import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import { ChevronRightIcon, CircleCheckIcon, CircleHelpIcon, CircleXIcon, PencilIcon, TerminalIcon, CopyIcon, FileTextIcon, FolderTreeIcon, LoaderCircleIcon, PlayIcon, RefreshCwIcon, ArrowUpIcon, SquareIcon, XIcon } from 'lucide-react';
import { SkillDiffView } from '@/components/skill-diff-view';
import type { SkillDiff } from '@/lib/upstream';
import { workshop } from '@/lib/workshop';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { FieldLegend, FieldSet } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { AgentLogo } from '@/components/agent-logo';
import { Hint } from '@/components/hint';
import { OverflowText } from '@/components/overflow-text';
import { SkillMarkdown, SkillCodeBlock } from '@/components/skill-markdown';

export type WorkbenchWorkspace = { file: string; filesOpen: boolean };
export type WorkshopQuestion = { token: string; questions: { id:string; question:string; isOther?:boolean; options?:{label:string;description:string}[] }[] };
type WorkshopTool = {id:string;label?:string;status:string;output?:string};
type WorkshopChange = {path:string;kind:'added'|'modified'|'removed'};
export type WorkbenchMessage = { id: string; role: 'user' | 'assistant'; text: string; skill?:'creator'|'evaluator'|'optimizer';agent?:'codex'|'pi'|'claude-code'|'sarvam-code';skillVersion?:string; files?: string[]; updates?: string[]; choices?: string[]; question?:string; plan?:boolean; runId?:string; startedAt?:number; finishedAt?:number; failed?:boolean; tools?:WorkshopTool[]; changes?:WorkshopChange[] };
export type WorkbenchFile = { path: string; readable?: boolean };
type TreeNode = { name: string; path: string; file?: WorkbenchFile; children: TreeNode[] };

function treeFor(files: WorkbenchFile[]) {
  const root: TreeNode = { name: '', path: '', children: [] };
  for (const file of files) {
    let node = root;
    const parts = file.path.split('/');
    parts.forEach((name, index) => {
      let child = node.children.find(item => item.name === name);
      if (!child) {
        child = { name, path: parts.slice(0, index + 1).join('/'), children: [] };
        node.children.push(child);
      }
      node = child;
    });
    node.file = file;
  }
  function compact(nodes: TreeNode[]): TreeNode[] {
    return nodes.map(node => {
      let current = node;
      let name = node.name;
      while (!current.file && current.children.length === 1 && !current.children[0].file) {
        current = current.children[0];
        name += ` / ${current.name}`;
      }
      return { ...current, name, children: compact(current.children) };
    }).sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name));
  }
  return compact(root.children);
}

function FileTree({ nodes, selected, onFile, collapsed, onToggle, depth = 0 }: {
  nodes: TreeNode[]; selected: string; onFile: (file: string) => void;
  collapsed: Record<string, boolean>; onToggle: (path: string) => void; depth?: number;
}) {
  return <ul className="flex min-w-0 flex-col gap-0.5">
    {nodes.map(node => <li key={node.path} className="min-w-0">
      {node.file ? <Button variant="navigation" title={node.path}
        aria-current={node.path === selected ? 'page' : undefined}
        style={{ paddingInlineStart: 8 + depth * 12 }}
        onClick={() => onFile(node.path)}>
        <FileTextIcon aria-hidden="true" /><span className="truncate font-normal">{node.name}</span>
      </Button> : <Collapsible open={!collapsed[node.path]} onOpenChange={() => onToggle(node.path)}>
        <CollapsibleTrigger asChild>
          <Button variant="navigation" className="group/folder" title={node.path}
            style={{ paddingInlineStart: 8 + depth * 12 }}>
            <ChevronRightIcon aria-hidden="true" className="transition-transform group-data-[state=open]/folder:rotate-90 motion-reduce:transition-none" />
            <span className="truncate font-normal">{node.name}</span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <FileTree nodes={node.children} selected={selected} onFile={onFile} collapsed={collapsed} onToggle={onToggle} depth={depth + 1} />
        </CollapsibleContent>
      </Collapsible>}
    </li>)}
  </ul>;
}

function QuestionPanel({question,onAnswer,zh}: {question:WorkshopQuestion;onAnswer:(answers:Record<string,string>)=>Promise<void>;zh:boolean}) {
  const [answers,setAnswers]=useState<Record<string,{value:string; custom?:boolean}>>({});
  const [sending,setSending]=useState(false);
  const [error,setError]=useState('');
  const form=useRef<HTMLFormElement>(null);
  useEffect(()=>{form.current?.querySelector<HTMLElement>('input, textarea')?.focus();},[]);
  const submit = <Button type="submit" size="sm" className="ml-auto"
    disabled={sending||question.questions.some(item=>!answers[item.id]?.value.trim())}>
    {sending?(zh?'正在提交…':'Submitting…'):(zh?'发送':'Send')}
  </Button>;
  return <Card size="sm" className="max-h-[42vh] overflow-y-auto"><CardContent>
    <form ref={form} className="flex flex-col gap-2" aria-label={zh?'问题':'Questions'} onSubmit={async event=>{
      event.preventDefault();
      setSending(true);
      setError('');
      try { await onAnswer(Object.fromEntries(Object.entries(answers).map(([id, answer])=>[id,answer.value]))); }
      catch(reason){setError(String(reason));setSending(false);}
    }}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CircleHelpIcon aria-hidden="true" className="size-3.5"/>{zh?'问题':'Question'}</p>
      {question.questions.map((item, index)=>{
        const selected=answers[item.id];
        const hasCustomAnswer=item.isOther||!item.options?.length;
        const last=index===question.questions.length-1;
        return <FieldSet key={item.id} className="gap-1" disabled={sending}>
          <FieldLegend variant="label" className="mb-1 max-w-full [overflow-wrap:anywhere]">{item.question}</FieldLegend>
          {item.options?.map((option, optionIndex)=><label key={option.label} className="flex cursor-pointer items-baseline gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted focus-within:ring-1 focus-within:ring-ring has-checked:bg-muted">
            <input className="sr-only" type="radio" name={item.id} checked={!selected?.custom&&selected?.value===option.label} onChange={()=>setAnswers(previous=>({...previous,[item.id]:{value:option.label}}))}/>
            <span aria-hidden="true" className="shrink-0 rounded bg-muted px-1.5 text-xs text-muted-foreground">{optionIndex+1}</span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{option.label}{option.description&&<> <span className="text-muted-foreground">{option.description}</span></>}</span>
          </label>)}
          {(hasCustomAnswer||last)&&<div className="flex min-w-0 items-end gap-2">
            {hasCustomAnswer&&<div className="flex min-w-0 flex-1 items-center gap-1.5">
              <PencilIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground"/>
              <Textarea variant="plain" autoComplete="off" aria-label={zh?`自行撰写回复 · ${item.question}`:`Write an answer · ${item.question}`}
                placeholder={zh?'或自行撰写回复':'Or write your own answer'} maxLength={2000} rows={1}
                className="min-h-7 max-h-20 resize-none bg-transparent px-1 py-1"
                value={selected?.custom?selected.value:''}
                onChange={event=>setAnswers(previous=>({...previous,[item.id]:{value:event.target.value,custom:true}}))}/>
            </div>}
            {last&&submit}
          </div>}
        </FieldSet>;
      })}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  </CardContent></Card>;
}

function WorkshopElapsed({startedAt, finishedAt, zh}: {startedAt:number;finishedAt?:number;zh:boolean}) {
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{
    if(finishedAt!==undefined)return;
    const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return ()=>window.clearInterval(timer);
  },[finishedAt]);
  const elapsed=Math.max(0,Math.floor(((finishedAt??now)-startedAt)/1000));
  const minutes=Math.floor(elapsed/60);
  const seconds=elapsed%60;
  const duration=zh?(minutes?`${minutes} 分钟 ${seconds} 秒`:`${seconds} 秒`)
    :(minutes?`${minutes}m ${seconds}s`:`${seconds}s`);
  return <span className="tabular-nums">
    {zh?`${finishedAt===undefined?'已处理':'用时'} ${duration}`:`${finishedAt===undefined?'Processing for':'Elapsed'} ${duration}`}
  </span>;
}

function WorkshopExecution({tool, finished, zh, onInspect}: {tool:WorkshopTool;finished:boolean;zh:boolean;onInspect:()=>void}) {
  const t=(cn:string,en:string)=>zh?cn:en;
  const [StatusIcon, status]: [typeof TerminalIcon, string] = tool.status==='completed'?[CircleCheckIcon,t('已完成','Completed')]
    :tool.status==='failed'?[CircleXIcon,t('失败','Failed')]
    :tool.status==='declined'?[CircleXIcon,t('已拒绝','Declined')]
    :finished?[TerminalIcon,t('未完成','Incomplete')]
    :[LoaderCircleIcon,t('正在执行','Running')];
  const command=tool.label??t('工具调用','Tool call');
  const statusLabel=<span className="inline-flex shrink-0 items-center gap-1"><StatusIcon aria-hidden="true" className="size-3.5"/>{status}</span>;
  if(!tool.output)return <div className="flex h-7 min-w-0 items-center gap-2 border border-transparent px-2.5 text-[0.8rem]">
    {statusLabel}<OverflowText text={command} className="min-w-0 flex-1 truncate font-mono"/>
  </div>;
  return <Collapsible onOpenChange={open=>{if(open)onInspect();}}>
    <CollapsibleTrigger asChild><Button variant="navigation" size="sm" className="group/execution gap-2 font-normal">
      {statusLabel}<span className="min-w-0 flex-1 truncate text-left font-mono">{command}</span>
      <ChevronRightIcon aria-hidden="true" className="group-data-[state=open]/execution:rotate-90"/>
    </Button></CollapsibleTrigger>
    <CollapsibleContent className="pt-1">
      <SkillCodeBlock code={tool.output} zh={zh} wrap/>
    </CollapsibleContent>
  </Collapsible>;
}

export function WorkshopWorkbench({ id, agent, agentName, messages, files, workspace, onWorkspace, content, fileLoading = false, fileError = false, onFileRetry, onRefreshFiles, refreshing = false, notice, input, onInput, onSend, onStop, onConfirm, confirmLabel, onReviewResult, composerReplacement, onReviewPlan, promptEditor, sendDisabled = false, onInputKeyDown, running = false, activity, question, onAnswer, disabled = false, onCopy, onOpenExternal, zh, scrolls }: {
  id: string; agent: string; agentName?: string; messages: WorkbenchMessage[]; files: WorkbenchFile[]; workspace: WorkbenchWorkspace;
  onWorkspace: (value: Partial<WorkbenchWorkspace>) => void; content: string; fileLoading?: boolean; fileError?: boolean; onFileRetry?: () => void; onRefreshFiles: () => void; refreshing?: boolean; notice?: ReactNode; input: string;
  sendDisabled?:boolean; promptEditor?: ReactNode; onReviewResult?: () => void; composerReplacement?: ReactNode; onReviewPlan?: () => void; confirmLabel?: string; onInputKeyDown?:(event:KeyboardEvent<HTMLElement>)=>boolean;
  onInput: (text: string) => void; onSend: () => void; onStop: () => void; onConfirm?: () => void; running?: boolean;
  question?:WorkshopQuestion; onAnswer?:(answers:Record<string,string>)=>Promise<void>;
  activity?: string; disabled?: boolean; onCopy: (content: string) => void; onOpenExternal: (url: string) => void; zh: boolean;
  scrolls: Record<string, number>;
}) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const conversation = useRef<HTMLDivElement>(null), fileBody = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true), lastMessage = messages[messages.length - 1];
  const activeReply=running&&lastMessage?.role==='assistant'&&!lastMessage.finishedAt?lastMessage:undefined;
  const [processOpen,setProcessOpen]=useState<Record<string,boolean>>({});
  const status=running&&!question?<div role="status" className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
    <LoaderCircleIcon aria-hidden="true" className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"/>
    <span className="truncate">{activity||(activeReply?.tools?.some(tool=>tool.status==='inProgress')?t('正在执行…','Running…'):t('思考中…','Thinking…'))}</span>
  </div>:null;
  const latestAuthoringMessage = [...messages].reverse().find(message => message.skill !== 'evaluator');
  const [diff,setDiff]=useState<{draftId:string;runId:string;files:WorkshopChange[];data?:SkillDiff;error?:string}>();
  const shownDiff=workspace.filesOpen&&diff?.draftId===id?diff:undefined;
  const [diffCache,setDiffCache]=useState<Record<string,SkillDiff>>({});
  const recentChange=[...messages].reverse().find(message=>message.changes?.length)?.runId;
  useEffect(()=>{
    if(!recentChange)return;
    let live=true;
    void workshop<SkillDiff>('diff',{id,runId:recentChange}).then(data=>{
      if(live)setDiffCache(previous=>({...previous,[recentChange]:data}));
    }).catch(()=>{/* The review button reports unavailable comparisons. */});
    return ()=>{live=false;};
  },[id,recentChange]);
  const previousQuestion=useRef(question?.token);
  useEffect(()=>{
    if(previousQuestion.current&&!question)document.getElementById('workshop-message')?.focus();
    previousQuestion.current=question?.token;
  },[question]);
  const progressText=(update:string)=>update.replace(/<!-- skills-space:(?:plan-ready|scope-change) -->/g,'').trim();
  const currentPlan=[...messages].reverse().find(message=>message.plan);
  const [diffFile,setDiffFile]=useState('');
  async function showChanges(message:WorkbenchMessage) {
    if(!message.runId||!message.changes?.length)return;
    const view={draftId:id,runId:message.runId,files:message.changes,data:diffCache[message.runId]};
    setDiffFile(message.changes[0].path);
    setDiff(view);
    onWorkspace({filesOpen:true});
    if(view.data)return;
    try {
      const data=await workshop<SkillDiff>('diff',{id,runId:message.runId});
      setDiffCache(previous=>({...previous,[view.runId]:data}));
      setDiff(current=>current===view?{...view,data}:current);
    } catch(reason){setDiff(current=>current===view?{...view,error:String(reason)}:current);}
  }
  const [closedFolders, setClosedFolders] = useState<Record<string, Record<string, boolean>>>({});
  const nodes = treeFor(files);
  const collapsed = closedFolders[id] ?? {};
  function selectFile(file: string) {
    setDiff(undefined);
    setClosedFolders(previous => ({ ...previous, [id]: Object.fromEntries(Object.entries(previous[id] ?? {}).filter(([path]) => !file.startsWith(`${path}/`))) }));
    onWorkspace({ file, filesOpen: true });
  }
  useEffect(() => {
    const pane = conversation.current;
    if (pane) {
      pane.scrollTop = scrolls[`${id}:chat`] ?? pane.scrollHeight;
      nearBottom.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 80;
    }
  }, [id, scrolls]);
  useEffect(() => {
    const pane = conversation.current;
    if (pane && nearBottom.current) pane.scrollTop = pane.scrollHeight;
  }, [lastMessage?.id, lastMessage?.text, lastMessage?.tools?.length, lastMessage?.updates?.length, question?.token, running]);
  useEffect(() => {
    if (fileBody.current && !fileLoading) fileBody.current.scrollTop = scrolls[`${id}:${workspace.file}`] ?? 0;
  }, [id, workspace.file, workspace.filesOpen, fileLoading, content, scrolls]);
  const canSend=!!input.split('\uFFFC').join('').trim()&&(!input.startsWith('/')||!!promptEditor)&&!disabled&&!running&&!sendDisabled;
  const selectedFile = files.find(file => file.path === workspace.file);

  return <div className="min-h-0 min-w-0 flex-1 overflow-x-auto" aria-label={t('技能创作工作台', 'Skill workbench')}>
    <ResizablePanelGroup orientation="horizontal" className={workspace.filesOpen ? 'min-w-[920px]' : undefined} aria-label={t('工作台分栏', 'Workbench panels')}>
      <ResizablePanel id="workshop-chat-panel" defaultSize={workspace.filesOpen ? '40%' : '100%'} minSize={workspace.filesOpen ? '40%' : '100%'}>
        <section className="mx-auto flex h-full w-full max-w-3xl min-w-0 flex-col px-4 pb-2" aria-label={t('创作对话', 'Conversation')}>
          <div ref={conversation} aria-label={t('对话记录', 'Messages')} tabIndex={0}
            className="no-scrollbar flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto pb-8 pt-5"
            onScroll={event => {
              const pane = event.currentTarget;
              scrolls[`${id}:chat`] = pane.scrollTop;
              nearBottom.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 80;
            }}>
            {messages.map(message => {
              const elapsed=message.startedAt!==undefined&&(message===activeReply||message.finishedAt!==undefined)
                ? <WorkshopElapsed startedAt={message.startedAt} finishedAt={message.finishedAt} zh={zh}/>
                : null;
              const hasProcess=!!message.tools?.length||message.updates?.some(update=>progressText(update));
              return message.role === 'user' ? <div key={message.id} className="min-w-0 max-w-[85%] self-end rounded-xl bg-muted/60 px-4 py-3 [overflow-wrap:anywhere]">
              {message.question&&<p className="text-sm text-muted-foreground">{message.question}</p>}
              <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
            </div> : <div key={message.id} className="flex min-w-0 flex-col gap-3">
              {message.skill?<p className="flex items-center gap-2 text-xs text-muted-foreground"><AgentLogo name={message.agent??agent} size={14}/><Hint text={message.skillVersion?`${message.skill} · ${message.skillVersion}`:undefined} focusable><span>{{creator:t('技能创建','Skill creation'),evaluator:t('技能评估','Skill evaluation'),optimizer:t('技能优化','Skill optimization')}[message.skill]}{message.agent?' · '+({codex:'Codex',pi:'Pi','claude-code':'Claude Code','sarvam-code':'Sarvam Code'}[message.agent]??message.agent):''}</span></Hint></p>:null}
              {hasProcess ? <Collapsible
                open={processOpen[message.id]??(message===activeReply)}
                onOpenChange={open=>setProcessOpen(previous=>({...previous,[message.id]:open}))}>
                <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="group">
                  <ChevronRightIcon data-icon="inline-start" className="group-data-[state=open]:rotate-90"/>
                  {elapsed??t('过程记录','Progress notes')}
                </Button></CollapsibleTrigger>
                <CollapsibleContent className="pt-1 text-muted-foreground">
                  {message.tools?.map(tool=><WorkshopExecution key={tool.id} tool={tool} finished={!!message.finishedAt} zh={zh} onInspect={()=>setProcessOpen(previous=>({...previous,[message.id]:true}))}/>)}
                  {message.updates?.map((update, index) => {
                    const content=progressText(update);
                    return content&&<SkillMarkdown key={index} content={content} zh={zh} onOpenExternal={onOpenExternal}/>;
                  })}
                </CollapsibleContent>
              </Collapsible> : elapsed&&<p className="text-xs text-muted-foreground">{elapsed}</p>}
              {message.plan?<Card size="sm"><CardContent className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">{message===currentPlan&&(message===latestAuthoringMessage||running)?t('方案','Plan'):t('历史方案','Previous plan')}</span>
                <SkillMarkdown content={message.text} zh={zh} onOpenExternal={onOpenExternal}/>
              </CardContent></Card>:message.text&&<SkillMarkdown content={message.text} zh={zh} onOpenExternal={onOpenExternal}/>}
              {message.changes?.length?<Card size="sm"><CardContent className="flex flex-wrap items-center justify-between gap-2">
                <ul className="min-w-0 text-sm">{message.changes.map(change=>{
                  const file=message.runId?diffCache[message.runId]?.files.find(item=>item.path===change.path):undefined;
                  const lines=file?.diff.split('\n')??[];
                  return <li key={change.path} className="break-all">{change.path} <span className="text-muted-foreground">{file?.diff?`+${lines.filter(line=>line.startsWith('+')).length} −${lines.filter(line=>line.startsWith('-')).length}`:({added:t('新增','Added'),modified:t('修改','Modified'),removed:t('删除','Deleted')})[change.kind]}</span></li>;
                })}</ul>
                <Button variant="outline" size="sm" onClick={()=>void showChanges(message)}>{t('查看变更','Review changes')}</Button>
              </CardContent></Card>:null}
              {message.files?.length ? <div className="flex flex-wrap gap-2">{message.files.map(file => <Button key={file} variant="ghost" size="sm" onClick={() => selectFile(file)}>
                <FileTextIcon data-icon="inline-start" />{file.split('/').pop()}
              </Button>)}</div> : null}
              {message===activeReply&&status}
            </div>;
            })}
            {!activeReply&&status}
            {onReviewResult && <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{t('本轮优化已完成','Optimization round complete')}</span><Button variant="outline" size="sm" onClick={onReviewResult}><FileTextIcon data-icon="inline-start"/>{t('查看优化结果','Review optimization results')}</Button></div>}
            {notice}

          </div>
          <div className="flex shrink-0 flex-col gap-3">
            {composerReplacement ?? <>
            {question&&onAnswer&&<QuestionPanel key={question.token} question={question} onAnswer={onAnswer} zh={zh}/>}
            {onConfirm?<Card size="sm"><CardContent className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{t('实施此方案？','Implement this plan?')}</span><div className="ml-auto flex flex-wrap gap-2">{onReviewPlan&&<Button variant="ghost" size="sm" onClick={()=>{setDiff(undefined);onReviewPlan();}}><FileTextIcon data-icon="inline-start"/>{t('查看方案','Review plan')}</Button>}<Button size="sm" disabled={running||disabled} onClick={onConfirm}><PlayIcon data-icon="inline-start"/>{confirmLabel??t('按方案构建','Build this plan')}</Button></div></CardContent></Card>:null}
            <Card variant="composer" size="sm"><CardContent className="flex flex-col gap-3">
              {promptEditor??<>
              <label htmlFor="workshop-message" className="sr-only">{t('发送消息','Send a message')}</label>
              <Textarea autoComplete="off" id="workshop-message" rows={2} variant="plain" className="max-h-40 resize-none bg-transparent" value={input} disabled={disabled} maxLength={16000} aria-describedby="workshop-composer-help"
                onChange={event=>onInput(event.target.value)} placeholder={onConfirm?t('补充要求，或告诉我方案哪里需要调整…','Add details or refine the plan…'):t('描述你的想法，输入 / 调用技能…','Describe what you need. Type / to choose a skill…')}
                onKeyDown={event=>{if(event.nativeEvent.isComposing||event.keyCode===229)return;if(onInputKeyDown?.(event))return;if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();if(canSend)onSend();}}}/>
              </>}
              <div className="flex min-w-0 items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Hint text={agentName||agent} focusable><span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"><AgentLogo name={agent} size={14}/><span>{agentName||agent}</span></span></Hint></div>
                <Hint text={running?t('停止本轮执行','Stop this turn'):t('发送 · Enter；换行 · Shift+Enter','Send · Enter; new line · Shift+Enter')}><Button size="icon" aria-label={running?t('停止','Stop'):t('发送消息','Send message')} disabled={!running&&!canSend} onClick={running?onStop:onSend}>{running?<SquareIcon className="size-3.5" fill="currentColor"/>:<ArrowUpIcon/>}</Button></Hint>
              </div><span id="workshop-composer-help" className="sr-only">{t('Enter 发送，Shift+Enter 换行，也支持 Ctrl 或 Command 加 Enter。输入斜杠选择技能。','Enter sends, Shift+Enter adds a line. Ctrl or Command plus Enter also sends. Type slash to choose a skill.')}</span>
            </CardContent></Card>
            </>}
          </div>
        </section>
      </ResizablePanel>
      {workspace.filesOpen ? <>
        <ResizableHandle variant="quiet" aria-label={t('调整对话与文件区宽度', 'Resize conversation and files')} />
        <ResizablePanel id="workshop-files-panel" defaultSize="60%" minSize="540px" maxSize="60%">
          <Card variant="plain" className="h-full min-w-0 gap-0 overflow-hidden py-0">
            <section className="h-full min-w-0" aria-label={t('文件区', 'Files')}>
              <ResizablePanelGroup orientation="horizontal" aria-label={t('预览与目录分栏', 'Preview and file tree panels')}>
              <ResizablePanel id="workshop-file-preview" defaultSize="60%" minSize="300px">
              <div className="flex h-full min-h-0 min-w-0 flex-col">
                <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-5">
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <FileTextIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <OverflowText text={shownDiff?t('本轮变更','Turn changes'):workspace.file || t('文件', 'File')} displayText={shownDiff?t('本轮变更','Turn changes'):workspace.file.split('/').pop() || t('文件', 'File')} className="min-w-0 truncate font-medium" />
                  </div>
                  {!shownDiff && selectedFile && !fileLoading && !fileError && content ? <Hint text={t('复制当前文件', 'Copy current file')}>
                    <Button variant="ghost" size="icon-sm" aria-label={t('复制当前文件', 'Copy current file')} onClick={() => onCopy(content)}><CopyIcon /></Button>
                  </Hint> : null}
                </div>
                <div ref={fileBody} tabIndex={0} className="subtle-scrollbar min-h-0 min-w-0 flex-1 overflow-auto px-5 pb-8 pt-3" aria-label={t('文件内容', 'File content')}
                  onScroll={event => { if (!fileLoading) scrolls[`${id}:${workspace.file}`] = event.currentTarget.scrollTop; }}>
                  {shownDiff ? shownDiff.error ? <div className="flex flex-col items-start gap-2"><p role="alert" className="text-sm text-destructive">{t('无法读取本轮变更。','Could not read this turn’s changes.')}</p><Button variant="outline" size="sm" onClick={()=>{const message=messages.find(item=>item.runId===shownDiff.runId&&item.changes?.length);if(message)void showChanges(message);}}>{t('重试','Retry')}</Button></div>
                    : <SkillDiffView data={shownDiff.data?{...shownDiff.data,files:shownDiff.data.files.filter(file=>file.path===diffFile)}:null} loading={!shownDiff.data} zh={zh}/>
                    : fileLoading ? <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />{t('加载中…', 'Loading…')}</div>
                    : fileError ? <Empty><EmptyHeader><EmptyTitle>{t('文件读取失败', 'Could not read this file')}</EmptyTitle></EmptyHeader>{onFileRetry ? <Button variant="outline" onClick={onFileRetry}>{t('重新读取', 'Read again')}</Button> : null}</Empty>
                    : selectedFile?.readable === false ? <Empty><EmptyHeader><EmptyTitle>{t('此文件无法预览', 'Preview is unavailable for this file')}</EmptyTitle></EmptyHeader></Empty>
                    : selectedFile ? (/\.md$/i.test(selectedFile.path) ? <SkillMarkdown content={content} zh={zh} onOpenExternal={onOpenExternal} /> : <SkillCodeBlock code={content} language={selectedFile.path.split('.').pop()} zh={zh} wrap />)
                    : <Empty><EmptyHeader><EmptyTitle>{files.length ? t('选择文件', 'Select a file') : t('尚无文件', 'No files yet')}</EmptyTitle></EmptyHeader></Empty>}
                </div>
              </div>
              </ResizablePanel>
              <ResizableHandle variant="quiet" aria-label={t('调整预览与目录比例', 'Resize preview and file tree')} />
              <ResizablePanel id="workshop-file-tree" defaultSize="40%" minSize="216px">
              <nav className="flex h-full min-w-0 flex-col bg-muted/30" aria-label={t('工作区文件', 'Workspace files')}>
                <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
                  <CardTitle role="heading" aria-level={2} className="flex min-w-0 items-center gap-2"><FolderTreeIcon aria-hidden="true" className="size-4 shrink-0"/><span>{shownDiff?t('已更改的文件','Changed files'):t('文件目录', 'File tree')}</span></CardTitle>
                  <div className="flex items-center gap-1">
                  {shownDiff?<Button variant="ghost" size="sm" onClick={()=>setDiff(undefined)}>{t('返回文件目录','Back to files')}</Button>:<Hint text={t('刷新文件', 'Refresh files')}>
                    <Button variant="ghost" size="icon-sm" aria-label={t('刷新文件', 'Refresh files')} disabled={refreshing} onClick={onRefreshFiles}><RefreshCwIcon className={refreshing ? 'animate-spin motion-reduce:animate-none' : undefined} /></Button>
                  </Hint>}
                  <Hint text={t('关闭文件区', 'Close files')}>
                    <Button variant="ghost" size="icon-sm" aria-label={t('关闭文件区', 'Close files')} onClick={() => onWorkspace({ filesOpen: false })}><XIcon /></Button>
                  </Hint>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 pb-4">
                  {shownDiff?<ul className="flex flex-col gap-1">{shownDiff.files.map(file=><li key={file.path}><Button variant="ghost" size="sm" className="w-full justify-start" aria-pressed={diffFile===file.path} onClick={()=>setDiffFile(file.path)}><OverflowText text={file.path} className="truncate"/></Button></li>)}</ul>:<FileTree nodes={nodes} selected={workspace.file} onFile={selectFile} collapsed={collapsed}
                    onToggle={path => setClosedFolders(previous => ({ ...previous, [id]: { ...previous[id], [path]: !previous[id]?.[path] } }))} />}
                </div>
              </nav>
              </ResizablePanel>
              </ResizablePanelGroup>
            </section>
          </Card>
        </ResizablePanel>
      </> : null}
    </ResizablePanelGroup>
  </div>;
}
