import {useEffect,useState} from 'react';
import {ClipboardCheckIcon,AppWindowIcon,ChevronRightIcon,FileTextIcon,LoaderCircleIcon,SquareIcon} from 'lucide-react';
import {AgentLogo} from '@/components/agent-logo';
import {WorkshopReportScore, WorkshopReportHistory, WorkshopReportHistoryRow, evidenceText} from '@/components/workshop-report';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card,CardContent} from '@/components/ui/card';
import {Checkbox} from '@/components/ui/checkbox';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription,EmptyContent} from '@/components/ui/empty';
import {SkillMarkdown} from '@/components/skill-markdown';
import {SkillDocument} from '@/components/skill-document';
import {Modal} from '@/components/modal';
import {workshop,type EvaluationRecord,type WorkshopDraft} from '@/lib/workshop';
import {notifyError} from '@/lib/notifications';
import {FlowError} from '@/components/flow-error';
const agentNames = {codex:'Codex',pi:'Pi','claude-code':'Claude Code','sarvam-code':'Sarvam Code'};

function EvaluationIdentity({record,zh}:{record:EvaluationRecord;zh:boolean}) {
 const date=new Date(record.createdAt);
 const locale=zh?'zh-CN':'en-US';
 return <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
   <span className="inline-flex items-center gap-1.5 font-medium text-foreground"><AgentLogo name={record.agent} size={16}/>{agentNames[record.agent]}</span>
   <time dateTime={date.toISOString()} className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{date.toLocaleDateString(locale)}{' '}{date.toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit',hour12:false})}</time>
 </span>;
}

export function WorkshopEvaluation({draft,sourceHash,legacyReport,legacyError,zh,onStart,onStop,onOptimize,onRetry}:{draft:WorkshopDraft;sourceHash:string|null;legacyReport:string;legacyError:boolean;zh:boolean;onStart:()=>void;onStop:()=>void;onOptimize:(text:string)=>void;onRetry:()=>void}){
 const t=(cn:string,en:string)=>zh?cn:en;
 const [chosen,setChosen]=useState<number[]>([]),[history,setHistory]=useState<EvaluationRecord|null>(null),[historyText,setHistoryText]=useState(''),[historyError,setHistoryError]=useState(false),[historyLoading,setHistoryLoading]=useState(false),[historyReload,setHistoryReload]=useState(0),[evidence,setEvidence]=useState<{path:string;content:string}|null>(null);
 const all=draft.evaluations??[],latest=[...all].reverse().find(e=>e.phase==='complete'&&e.result&&!e.resultError),last=all[all.length-1],result=latest?.result;
 const selectedIssues=result?.issues.filter((_,i)=>chosen.includes(i))??[];
 const failedRun=draft.run?.skill==='evaluator'&&draft.run.phase==='failed';
 const lastFailed=!!last&&(last.phase==='failed'||!!last.resultError);
 const failure=lastFailed&&(!failedRun||last.id===draft.run?.id)?last:undefined;
 const pastEvaluations=[...all].reverse().filter(e=>e.id!==latest?.id&&e.id!==failure?.id);
 const failed=!!failure;
 const stopped=last?.phase==='stopped'&&!failedRun;
 const failureError=(failedRun?draft.run?.error:null)??failure?.error??failure?.resultError??'';
 const failureMessage=failure?.resultError?t('未生成有效评估报告，可查看返回内容后重新评估。','No valid evaluation report was generated. View the response and try again.'):t('请查看错误详情，处理后重新评估。','Review the error details, resolve the issue and try again.');
 const legacy=!latest&&!all.some(e=>e.phase==='complete'&&e.resultError)?legacyReport:'';
 const running=draft.run?.skill==='evaluator'&&['preparing','running','stopping'].includes(draft.run.phase);
 useEffect(()=>setChosen(result?.issues.map((_,i)=>i)??[]),[latest?.id]);
 useEffect(()=>{setHistoryText('');setHistoryError(false);setHistoryLoading(false);if(!history?.reportPath)return;let active=true;setHistoryLoading(true);void workshop<string>('document',{id:draft.id,path:history.reportPath}).then(text=>{if(active)setHistoryText(text);}).catch(e=>{if(active){setHistoryError(true);notifyError(String(e),zh);}}).finally(()=>{if(active)setHistoryLoading(false);});return()=>{active=false;};},[history?.id,draft.id,historyReload,zh]);
 async function showEvidence(path:string){try{setEvidence({path,content:await workshop<string>('document',{id:draft.id,path:`skill/${draft.skillDirectory?.split(/[\\/]/).pop()}/${path}`})});}catch(e){notifyError(String(e),zh);}}
 const historySection=pastEvaluations.length>0&&<WorkshopReportHistory label={t('历史评估','Evaluation history')} count={pastEvaluations.length}>
   {pastEvaluations.map(record=>{
     const failed=!!record.resultError||record.phase==='failed';
     const status=failed?t('失败','Failed'):record.phase==='stopped'?t('已停止','Stopped'):record.phase==='complete'?t('完成','Complete'):t('未完成','Incomplete');
     return <WorkshopReportHistoryRow key={record.id} status={status} failed={failed} disabled={!record.reportPath} onOpen={()=>setHistory(record)}>
       <EvaluationIdentity record={record} zh={zh}/>
     </WorkshopReportHistoryRow>;
   })}
 </WorkshopReportHistory>;
 const outdated=!!(latest&&sourceHash&&latest.sourceHash!==sourceHash);
 return <div className="flex flex-col gap-6">{!running&&<div className="flex flex-wrap items-center justify-between gap-3">{latest?<div className="flex flex-wrap items-center gap-3"><EvaluationIdentity record={latest} zh={zh}/>{outdated&&<Badge variant="outline">{t('待重新评估','Needs reevaluation')}</Badge>}</div>:<span className="text-sm text-muted-foreground">{running?null:t('检查技能质量，也可结合实际输出评估效果。','Review skill quality, optionally with actual task outputs.')}</span>}{running?null:latest||legacy||failed||failedRun?<Button variant="outline" disabled={!!draft.run&&['preparing','running','stopping'].includes(draft.run.phase)} onClick={onStart}><ClipboardCheckIcon data-icon="inline-start"/>{t('重新评估','Evaluate again')}</Button>:null}</div>}
 {!running&&(failed||failedRun||stopped)?<div className="flex flex-col gap-2">{stopped?<p className="text-sm text-muted-foreground">{t('本次评估已停止。','This evaluation was stopped.')}</p>:<FlowError title={t('评估失败','Evaluation failed')} message={failureError} help={failureMessage} zh={zh}/>}{latest||legacy?<p className="text-sm text-muted-foreground">{t('下方保留上次报告。','The previous report remains available below.')}</p>:null}{failure?.reportPath?<Button variant="link" size="sm" className="self-start" onClick={()=>setHistory(failure)}>{t('查看返回内容','View response')}</Button>:null}</div>:null}
 {running&&<Card size="sm"><CardContent className="flex flex-wrap items-center gap-3">
   <LoaderCircleIcon className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true"/>
   <div className="flex-1" role="status"><p className="font-medium">{t('正在评估技能','Evaluating skill')}</p><p className="text-muted-foreground">{t('正在检查技能说明和引用文件。','Checking skill instructions and referenced files.')}</p></div>
   <Button variant="outline" onClick={onStop}><SquareIcon data-icon="inline-start"/>{t('停止评估','Stop evaluation')}</Button>
 </CardContent></Card>}
 {result?<Card>
   <WorkshopReportScore result={result} zh={zh}/>
   <CardContent>
 <section className="flex flex-col gap-4">
   <div className="flex flex-wrap items-center justify-between gap-3">
     <h2 className="text-base font-medium">{t('问题与建议','Findings and suggestions')}{result.issues.length>0&&<span className="ms-2 text-sm font-normal tabular-nums text-muted-foreground">{result.issues.length}</span>}</h2>
     {result.issues.length>0&&<Button variant="outline" size="sm" disabled={!selectedIssues.length} onClick={()=>onOptimize(selectedIssues.map(issue=>`- ${issue.title}：${issue.suggestion}`).join('\n'))}><AppWindowIcon data-icon="inline-start"/>{t('到工作台优化','Optimize in workbench')} · {selectedIssues.length}</Button>}
   </div>
   {result.issues.length?<ul className="flex flex-col gap-5">{result.issues.map((issue,i)=><li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3">
     <Checkbox id={`evaluation-issue-${i}`} className="mt-0.5" checked={chosen.includes(i)} onCheckedChange={v=>setChosen(c=>v?[...c.filter(n=>n!==i),i]:c.filter(n=>n!==i))}/>
     <div className="flex min-w-0 flex-col gap-2 text-sm [overflow-wrap:anywhere]">
       <h3 className="font-medium"><label htmlFor={`evaluation-issue-${i}`} className="cursor-pointer">{issue.title}</label></h3>
       <p className="whitespace-pre-wrap leading-6 text-muted-foreground">{issue.impact}</p>
       <p className="whitespace-pre-wrap leading-6"><span className="me-2 font-medium">{t('建议','Suggestion')}</span>{issue.suggestion}</p>
       <Collapsible>
         <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="group -ms-2"><ChevronRightIcon data-icon="inline-start" className="group-data-[state=open]:rotate-90"/>{t('查看依据','View evidence')}</Button></CollapsibleTrigger>
         <CollapsibleContent className="flex flex-col gap-2 pt-2">
           <blockquote className="whitespace-pre-wrap border-s-2 border-border ps-3 leading-6 text-muted-foreground">{evidenceText(issue.evidence,issue.path)}</blockquote>
           <Button variant="link" size="sm" disabled={!!sourceHash&&latest?.sourceHash!==sourceHash} className="h-auto min-w-0 max-w-full justify-start self-start px-0 text-left" onClick={()=>void showEvidence(issue.path)}><FileTextIcon data-icon="inline-start"/><span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{issue.path}</span></Button>
         </CollapsibleContent>
       </Collapsible>
     </div>
   </li>)}</ul>:<p className="text-sm text-muted-foreground">{t('未发现需要处理的实质问题。','No material issues were reported.')}</p>}
 </section>
   </CardContent>
   {historySection&&<CardContent>{historySection}</CardContent>}
 </Card>:legacy?<><p className="text-sm text-muted-foreground">{t('已有报告未记录对应技能版本。','This existing report has no recorded skill version.')}</p><SkillMarkdown content={legacy} zh={zh} onOpenExternal={()=>{}}/></>:legacyError?<Empty><EmptyHeader><EmptyTitle>{t('评估报告读取失败','Could not read the report')}</EmptyTitle></EmptyHeader><EmptyContent><Button variant="outline" onClick={onRetry}>{t('重新读取','Read again')}</Button></EmptyContent></Empty>:!running&&!failed&&!failedRun?<Empty><EmptyHeader><EmptyTitle>{t('了解技能可以怎样改进','Find ways to improve this skill')}</EmptyTitle><EmptyDescription>{t('检查指令、通用性和资源完整性；有实际输出时再检查任务完成情况。','Review instructions, portability and resources. Assess effectiveness when actual outputs are supplied.')}</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={onStart} disabled={!!draft.run&&['preparing','running','stopping'].includes(draft.run.phase)}>{t('开始评估','Start evaluation')}</Button></EmptyContent></Empty>:null}
 {!result&&historySection&&<Card><CardContent>{historySection}</CardContent></Card>}
 <Modal title={history?.phase==='failed'||history?.resultError?t('评估返回内容','Evaluation response'):t('评估报告','Evaluation report')} open={!!history} onClose={()=>setHistory(null)}>{historyError?<Empty><EmptyHeader><EmptyTitle>{t('评估报告读取失败','Could not read the report')}</EmptyTitle></EmptyHeader><EmptyContent><Button variant="outline" onClick={()=>setHistoryReload(v=>v+1)}>{t('重新读取','Read again')}</Button></EmptyContent></Empty>:<SkillMarkdown content={historyLoading?t('加载中…','Loading…'):historyText||t('报告内容为空。','The report is empty.')} zh={zh} onOpenExternal={()=>{}}/>}</Modal><Modal title={evidence?.path??''} open={!!evidence} onClose={()=>setEvidence(null)}><SkillDocument content={evidence?.content??''} zh={zh} onOpenExternal={()=>{}}/></Modal></div>;
}
