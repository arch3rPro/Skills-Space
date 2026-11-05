import { SkillDiffView } from '@/components/skill-diff-view';
import type { SkillDiff } from '@/lib/upstream';
import { WorkshopReportScore, WorkshopReportHistory, WorkshopReportHistoryRow } from '@/components/workshop-report';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldLabel } from '@/components/ui/field';
import { Modal, ModalActions } from '@/components/modal';
import { SkillDocument } from '@/components/skill-document';
import { notifyError } from '@/lib/notifications';
import { openUrl } from '@tauri-apps/plugin-opener';
import { workshop, workshopRunning, type WorkshopDraft } from '@/lib/workshop';

export function WorkshopOptimization({ draft, rounds, zh, busy, onStart, onContinue, onCompare, onApply, onEnd }: {
  draft: WorkshopDraft;
  rounds: WorkshopDraft[];
  zh: boolean;
  busy: boolean;
  onStart: () => void;
  onContinue: (round: WorkshopDraft) => void;
  onCompare: (round: WorkshopDraft, task: string, baselineOutput: string, output: string) => void;
  onApply: (round: WorkshopDraft) => Promise<boolean>;
  onEnd: () => Promise<boolean>;
}) {
  const [historyRound, setHistoryRound] = useState<string | null>(null);
  const [diff,setDiff]=useState<{id:string;data?:SkillDiff;error?:string}>();
  async function reviewDiff(round:WorkshopDraft){
    setDiff({id:round.id});
    try{const data=await workshop<SkillDiff>('diff',{id:round.id});setDiff(current=>current?.id===round.id?{id:round.id,data}:current);}
    catch(reason){setDiff(current=>current?.id===round.id?{id:round.id,error:String(reason)}:current);}
  }
  const [decision, setDecision] = useState<'apply' | 'end' | null>(null);
  const [preview, setPreview] = useState<{path:string; content:string} | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [cases, setCases] = useState('');
  const [baselineOutput, setBaselineOutput] = useState('');
  const [candidateOutput, setCandidateOutput] = useState('');
  const t = (cn: string, en: string) => zh ? cn : en;
  const task = draft.optimization;
  const ordered = task?.rounds.flatMap(id => rounds.filter(round => round.id === id)) ?? [];
  const latest = ordered[ordered.length-1];
  const completed = !!latest?.candidateHash && latest.candidateHash !== latest.optimizationInputHash &&
    latest.stage === 'ready' && !workshopRunning(latest);

  function score(round: WorkshopDraft, hash?: string | null) {
    return round.evaluations?.filter(record => record.sourceHash === hash && record.result && !record.result.actual).slice(-1)[0];
  }

  async function previewFile(round: WorkshopDraft, path: string) {
    const file = round.files.find(item => item.readable && item.path === round.skillFile?.replace(/SKILL\.md$/, path));
    if (!file) return;
    try { setPreview({ path, content: await workshop<string>('document', { id: round.id, path: file.path }) }); }
    catch (reason) { notifyError(String(reason), zh); }
  }

  function candidateScore(round: WorkshopDraft) {
    const assessment = score(round, round.candidateHash)?.result;
    if (!assessment) return null;
    const actual = round.evaluations?.filter(report => report.comparisonId && report.sourceHash === round.candidateHash && report.result?.actual).slice(-1)[0]?.result?.actual;
    return <WorkshopReportScore result={assessment} actual={actual ?? null} zh={zh}/>;
  }

  function roundStatus(round: WorkshopDraft) {
    if (task?.appliedRound === round.id) return t('已应用', 'Applied');
    if (workshopRunning(round)) return t('进行中', 'In progress');
    if (round.stage === 'planned' && !task?.ended) return t('待确认方案', 'Plan awaiting approval');
    if (round.candidateHash && round.candidateHash !== round.optimizationInputHash) return t('已生成候选', 'Candidate ready');
    if (task?.ended) return t('已结束', 'Ended');
    return t('待继续', 'Awaiting follow-up');
  }

  function result(round: WorkshopDraft, index: number, baselineHash=task?.baselineHash, prior=ordered[index - 1]) {
    const candidate = score(round, round.candidateHash);
    const actualCandidate = round.evaluations?.filter(report => report.comparisonId && report.sourceHash === round.candidateHash && report.result?.actual).slice(-1)[0];
    const actualBaseline = actualCandidate && round.evaluations?.find(report => report.comparisonId === actualCandidate.comparisonId && report.sourceHash === baselineHash && report.result?.actual);
    const baseline = score(round, baselineHash);
    const previous = prior;
    const previousReport = previous && score(previous, previous.candidateHash);
    const comparisons = [
      { label: t('初始版本', 'Baseline'), report: baseline },
      ...(previous ? [{ label: t('上一轮', 'Previous round'), report: previousReport }] : []),
    ];
    const goal = round.messages.find(message => message.role === 'user' && message.skill === 'optimizer');
    return <div className="flex flex-col gap-3 text-sm">
      {goal && <p className="whitespace-pre-wrap break-words">{goal.text}</p>}
      {round.run?.skill === 'evaluator' && round.run.phase === 'failed' && <p className="text-muted-foreground">{t('只读评估未完成。候选文件仍可查看。', 'The read-only evaluation did not finish. Candidate files are available.')}</p>}
      <dl className="grid gap-3 sm:grid-cols-2">
        {comparisons.map(({ label, report }) => <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{report?.result ? report.result.structureScore + ' / 60' : t('未评估', 'Not evaluated')}
            {report?.result && candidate?.result && (report.agent !== candidate.agent || report.resource.revision !== candidate.resource.revision) &&
              <span className="ms-2 text-muted-foreground">{t('评估条件不同', 'Different evaluation conditions')}</span>}
          </dd>
        </div>)}
        {actualBaseline?.result?.actual && actualCandidate?.result?.actual && <div>
          <dt className="text-muted-foreground">{t('实际效果对比', 'Task effectiveness comparison')}</dt>
          <dd>{actualBaseline.result.actual.score} / 40 → {actualCandidate.result.actual.score} / 40</dd>
        </div>}
      </dl>
      {actualBaseline?.result?.actual && actualCandidate?.result?.actual && <Collapsible>
        <CollapsibleTrigger asChild><Button variant="ghost" size="sm">{t('查看逐项效果', 'View case results')}</Button></CollapsibleTrigger>
        <CollapsibleContent className="grid gap-4 pt-2 sm:grid-cols-2">
          {[{ label:t('初始版本','Baseline'),checks:actualBaseline.result.actual.checks },{ label:t('本轮候选','Candidate'),checks:actualCandidate.result.actual.checks }].map(({label,checks})=><section key={label}>
            <h3 className="font-medium">{label}</h3>
            <ul className="mt-2 flex flex-col gap-2">{checks.map((check,i)=><li key={i}>
              <p>{check.result==='pass'?t('通过','Pass'):t('未通过','Fail')} · {check.expectation}</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{check.evidence}</p>
            </li>)}</ul>
          </section>)}
        </CollapsibleContent>
      </Collapsible>}
      {!!round.changedFiles?.length && <div>
        <h3 className="font-medium">{t('相对初始版本的变更', 'Changes from baseline')}</h3>
        <ul className="mt-2 flex flex-col gap-1">{round.changedFiles.map(file => <li key={file.path} className="flex gap-2">
          <span className="shrink-0 text-muted-foreground">{{added:t('新增','Added'),modified:t('修改','Modified'),removed:t('删除','Removed')}[file.kind]}</span>
          {round.files.some(item => item.readable && item.path === round.skillFile?.replace(/SKILL\.md$/, file.path)) ?
            <button type="button" className="skill-metadata-link text-left font-mono" onClick={() => void previewFile(round,file.path)}>{file.path}</button> :
            <code className="[overflow-wrap:anywhere]">{file.path}</code>}
        </li>)}</ul>
      </div>}
    </div>;
  }

  if (!latest) return <Empty>
    <EmptyHeader>
      <EmptyTitle>{t('优化现有技能', 'Improve this skill')}</EmptyTitle>
      <EmptyDescription>{t('在工作台描述想改进的地方，再查看每轮改动和评估结果。', 'Describe what to improve in the workbench, then review each round’s changes and evaluation.')}</EmptyDescription>
    </EmptyHeader>
    <EmptyContent><Button disabled={busy} onClick={onStart}>{t('开始优化', 'Start optimization')}</Button></EmptyContent>
  </Empty>;

  const historyEntries = [
    ...(task?.history ?? []),
    ...ordered.slice(0,-1).map((round,index)=>({id:round.id,index,baselineHash:task?.baselineHash ?? ''})),
  ].reverse();
  const historyEntry = historyEntries.find(entry => entry.id === historyRound);
  const previousRound = rounds.find(round => round.id === historyEntry?.id);

  return <Card>
    <CardHeader>
      <h2 className="text-base font-medium">{t('技能优化', 'Skill optimization')}</h2>
      <p className="text-sm text-muted-foreground">{task?.appliedRound
        ? t('已应用候选版本', 'Candidate applied')
        : task?.ended ? t('优化已结束', 'Optimization ended')
        : completed ? t('查看改动后，可应用到原技能或继续下一轮。', 'Review the changes, then apply them or start another round.') : latest.stage === 'planned' ? t('回到工作台确认方案或继续调整。', 'Approve or refine the plan in the workbench.') : t('在工作台描述想改什么，或继续补充要求。', 'Describe what to change or add details in the workbench.')}</p>
    </CardHeader>
    {candidateScore(latest)}
    <CardContent className="flex flex-col gap-4">
      <><h3 className="font-medium">{t('第', 'Round ')}{ordered.length}{t('轮', '')}
        <span className="ms-2 text-xs text-muted-foreground">{roundStatus(latest)}</span>
      </h3>{result(latest, ordered.length - 1)}</>
      <div className="flex flex-wrap gap-2">
        {latest && <Button variant="outline" onClick={() => onContinue(latest)}>{task?.ended || completed ? t('查看对话', 'View conversation') : latest.stage === 'planned' ? t('返回工作台','Return to workbench') : t('继续优化', 'Continue optimization')}</Button>}
        {completed&&<Button variant="outline" onClick={()=>void reviewDiff(latest)}>{t('查看累计变更','Review cumulative changes')}</Button>}
        {!task?.ended && completed && <><Button variant="outline" disabled={busy} onClick={onStart}>{t('开始下一轮', 'Start next round')}</Button><Button disabled={busy} onClick={() => setDecision('apply')}>{t('应用此版本', 'Apply this version')}</Button></>}
        {!task?.ended && completed && <Button variant="outline" disabled={busy} onClick={() => setCompareOpen(true)}>{t('对比实际输出','Compare actual outputs')}</Button>}
        {task?.ended && <Button disabled={busy} onClick={onStart}>{t('再次优化','Optimize again')}</Button>}
        {latest && !task?.ended && <Button variant="ghost" disabled={busy} onClick={() => setDecision('end')}>{t('结束优化', 'End optimization')}</Button>}
      </div>
      <WorkshopReportHistory label={t('历史轮次', 'Previous rounds')} count={historyEntries.length}>
        {historyEntries.map(entry => {
          const round=rounds.find(item=>item.id===entry.id);
          return round&&<WorkshopReportHistoryRow key={round.id} status={roundStatus(round)} onOpen={() => setHistoryRound(round.id)}>
            {t('第', 'Round ')}{entry.index+1}{t('轮', '')}
          </WorkshopReportHistoryRow>;
        })}
      </WorkshopReportHistory>
    </CardContent>
    <Modal title={t('累计变更','Cumulative changes')} open={!!diff} onClose={()=>setDiff(undefined)}>{diff?.error?<div className="flex flex-col items-start gap-2"><p role="alert" className="text-sm text-destructive">{t('无法读取累计变更。','Could not read cumulative changes.')}</p>{latest&&<Button variant="outline" size="sm" onClick={()=>void reviewDiff(latest)}>{t('重试','Retry')}</Button>}</div>:<SkillDiffView data={diff?.data??null} loading={!diff?.data} zh={zh}/>}</Modal>
    <Modal title={t('历史轮次', 'Previous round')} open={!!previousRound} onClose={() => setHistoryRound(null)}>
      {previousRound && <Card variant="plain">
        {candidateScore(previousRound)}
        <CardContent>{result(previousRound, historyEntry?.index ?? 0, historyEntry?.baselineHash, rounds.find(round=>historyEntries.some(entry=>entry.id===round.id&&entry.baselineHash===historyEntry?.baselineHash&&entry.index===(historyEntry?.index??0)-1)))}</CardContent>
      </Card>}
      {previousRound&&<ModalActions><Button variant="outline" onClick={()=>onContinue(previousRound)}>{t('查看对话','View conversation')}</Button></ModalActions>}
    </Modal>
    {decision && <AlertDialog open onOpenChange={open => { if (!open && !busy) setDecision(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{decision === 'apply' ? t('应用此版本？', 'Apply this version?') : t('结束优化？', 'End optimization?')}</AlertDialogTitle>
          <AlertDialogDescription>{decision === 'apply' ? t('将用本轮候选文件更新当前工坊技能。', 'Update the current workshop skill with this candidate.') : t('将保留已记录的候选和评估结果。', 'Saved candidates and evaluations will remain available.')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t('取消', 'Cancel')}</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={async event => {
            event.preventDefault();
            const succeeded = decision === 'apply' ? await onApply(latest) : await onEnd();
            if (succeeded) setDecision(null);
          }}>{decision === 'apply' ? t('应用', 'Apply') : t('结束', 'End')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
    <Modal title={t('对比实际输出','Compare actual outputs')} open={compareOpen} onClose={() => setCompareOpen(false)}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t('填入同一组用例和预期，再粘贴两个版本在相同条件下的实际输出。','Use the same test cases and expectations, then paste both versions’ outputs from matching conditions.')}</p>
        <Field><FieldLabel htmlFor="optimization-cases">{t('测试用例与预期','Test cases and expectations')}</FieldLabel><Textarea id="optimization-cases" value={cases} onChange={event => setCases(event.target.value)}/></Field>
        <Field><FieldLabel htmlFor="optimization-baseline-output">{t('初始版本输出','Baseline output')}</FieldLabel><Textarea id="optimization-baseline-output" value={baselineOutput} onChange={event => setBaselineOutput(event.target.value)}/></Field>
        <Field><FieldLabel htmlFor="optimization-candidate-output">{t('本轮候选输出','Candidate output')}</FieldLabel><Textarea id="optimization-candidate-output" value={candidateOutput} onChange={event => setCandidateOutput(event.target.value)}/></Field>
      </div>
      <ModalActions><Button disabled={busy || !cases.trim() || !baselineOutput.trim() || !candidateOutput.trim()} onClick={() => {
        if (!latest) return;
        onCompare(latest,cases,baselineOutput,candidateOutput);
        setCompareOpen(false);
        setCandidateOutput('');
      }}>{t('开始对比','Compare outputs')}</Button></ModalActions>
    </Modal>
    <Modal title={preview?.path ?? ''} open={preview !== null} onClose={() => setPreview(null)}>
      {preview && <SkillDocument content={preview.content} zh={zh} onOpenExternal={url => void openUrl(url).catch(reason => notifyError(String(reason),zh))}/>}
    </Modal>
  </Card>;
}
