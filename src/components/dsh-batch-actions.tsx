import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { HandIcon, SparklesIcon } from 'lucide-react';
import { SkillBatchToggleControls } from '@/components/skill-batch-toggle-controls';
import { BulkSelectionBar } from '@/components/bulk-selection-bar';
import { Hint } from '@/components/hint';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExecutionLog } from '@/components/execution-log';
import { RemovalReviewList } from '@/components/removal-review';
import { FlowError } from '@/components/flow-error';
import { notifySuccess, notifyError } from '@/lib/notifications';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { Modal, ModalActions } from '@/components/modal';
import { dshPolicyNeedsConfirmation, dshPolicySaveFeedback, dshInvocationChannels, dshBatchEligibility, type DshPolicyAction, type DshRemoval, type DshSnapshot } from '@/lib/dsh';
import { errorSummary } from '@/lib/error-summary';
import { displayHomePath, type InstalledSkill, type Target } from '@/lib/upstream';

type Props = {
  skills:InstalledSkill[];target:Target;contextKey:string|null;revision:string;policyRevision:string;home:string;
  disabled:boolean;zh:boolean;onBusy:(busy:boolean)=>void;onSnapshot:(value:DshSnapshot)=>void;onChanged:(removedFiles:string[])=>void;
  onSelectAll:()=>void;onInvert:()=>void;
};
export type DshPolicySubmission={target:Target;contextKey:string|null;configurationRevision:string;revision:string;action:DshPolicyAction;files:{file:string;revision?:string}[]};
export type DshBatchController={run:(action:DshPolicyAction)=>void};
type Outcome={file:string;name:string;status:'complete'|'failed'|'skipped';message:string;details?:string};
export function DshBatchActions(props:Props){
  return <BulkSelectionBar framed count={props.skills.length} disabled={props.disabled} zh={props.zh} onSelectAll={props.onSelectAll} onInvert={props.onInvert}><DshBatchControls {...props}/></BulkSelectionBar>;
}
export function DshBatchControls({skills,target,contextKey,revision,policyRevision,home,disabled,zh,onBusy,onSnapshot,onChanged,allowRemoval=true,showControls=true,savePolicy,controller,maxPolicySkills}:Omit<Props,'onSelectAll'|'onInvert'>&{allowRemoval?:boolean;showControls?:boolean;savePolicy?:(change:DshPolicySubmission)=>Promise<DshSnapshot|void>;controller?:Ref<DshBatchController>;maxPolicySkills?:number}){
  const t=(cn:string,en:string)=>zh?cn:en;
  const [action,setAction]=useState<DshPolicyAction|'trash'|null>(null);
  const [plans,setPlans]=useState<DshRemoval[]>([]);
  const [results,setResults]=useState<Outcome[]|null>(null);
  const [running,setRunning]=useState(false);
  const [preparing,setPreparing]=useState(false);
  const [reviewError,setReviewError]=useState('');
  const [preparationFailures,setPreparationFailures]=useState<Outcome[]>([]);
  const [invocationOpen,setInvocationOpen]=useState(false);
  const invocationTrigger=useRef<HTMLButtonElement>(null);
  const queuedInvocation=useRef<DshPolicyAction|null>(null);
  useImperativeHandle(controller,()=>({run:value=>{void review(value);}}));
  const eligibility=dshBatchEligibility(skills,action??'invocation');
  const invocationCount=dshBatchEligibility(skills,'model-on').eligible.length+dshBatchEligibility(skills,'manual-on').eligible.length;
  const actionAvailable = (value:DshPolicyAction) => {
    const count = dshBatchEligibility(skills,value).eligible.length;
    return count > 0 && (maxPolicySkills === undefined || count <= maxPolicySkills);
  };
  const trashCount=dshBatchEligibility(skills,'trash').eligible.length;
  function unavailable(skill:InstalledSkill){
    if(action!=='trash')return skill.dshState?.policyEnabled===false?t('请先启用此技能','Enable this skill first'):t('此技能暂不能修改启停和调用设置，请检查插件状态','This skill cannot change enablement or invocation settings; check the plugin status');
    if(skill.cliManaged)return t('由技能 CLI 管理，不能作为独立原生技能修改','Managed by the skills CLI; independent native changes are unavailable');
    if(skill.shared||skill.agents.some(id=>id!=='deepseek-harness')||['user-agents','project-agents','configured-agents'].includes(skill.dshState?.source??''))return t('与其他智能体共享，不能在此修改文件','Shared with other Agents; files cannot be changed here');
    if(skill.dshState?.inScope===false)return t('来自用户级目录，在当前项目中只读','Inherited from a user directory; read-only in this project');
    if(skill.dshState?.source==='bundled')return t('属于打包资源，不能独立修改或移除','Part of a package; independent changes or removal are unavailable');
    if(skill.dshState?.reason)return t('文件格式不符合 DSH 要求，请打开文件修正','Invalid DSH format; open the file to correct it');
    return t('无法确认此文件可独立修改，请打开原目录检查','The file could not be qualified for independent changes; inspect its source folder');
  }
  async function review(value:DshPolicyAction|'trash'){
    if(value!=='trash'&&!actionAvailable(value))return;
    setResults(null);setPlans([]);setPreparationFailures([]);setReviewError('');
    if(value!=='trash'){
      if(dshPolicyNeedsConfirmation(dshBatchEligibility(skills,value).eligible,target))setAction(value);
      else {setAction(null);await execute(value);}
      return;
    }
    setAction(value);
    setPreparing(true);onBusy(true);
    try{
      const next:DshRemoval[]=[];
      const failures:Outcome[]=[];
      for(const skill of dshBatchEligibility(skills,'trash').eligible){
        try{
          const plan=await invoke<DshRemoval>('upstream_dsh_removal_plan',{target,contextKey,file:skill.dshState!.file});
          if(plan.dependencies!==revision){setReviewError(t('配置已变化，请重新读取。','Configuration changed. Reload it.'));break;}
          next.push(plan);
        }catch(reason){
          const current=await invoke<DshSnapshot>('upstream_dsh_settings',{target,contextKey});
          if(current.revision!==revision||current.contextIssue){setReviewError(t('配置已变化，请重新读取。','Configuration changed. Reload it.'));break;}
          const raw=String(reason);failures.push({file:skill.dshState!.file,name:skill.name,status:'failed',message:errorSummary(raw,zh)??t('无法准备此技能的卸载；其他技能可继续。','Could not prepare this skill for removal. Other skills can continue.'),details:raw});
        }
      }
      setPreparationFailures(failures);
      setPlans(next);
    }catch(reason){setReviewError(String(reason));}
    finally{setPreparing(false);onBusy(false);}
  }
  function finish(outcomes:Outcome[],value:NonNullable<typeof action>,snapshot?:DshSnapshot){
    const completed=outcomes.filter(result=>result.status==='complete').length;
    if(outcomes.length&&completed===outcomes.length){
      setResults(null);setAction(null);
      notifySuccess(t(`已完成 ${completed} 项`,`${completed} completed.`)+(snapshot?.policy?.status==='pending'&&snapshot.policy.pendingReason==='reload'?` · ${dshPolicySaveFeedback(snapshot.policy,zh)}`:''));
    }else{
      setAction(value);setResults(outcomes);
      notifyError('',zh,undefined,t(`已完成 ${completed}/${outcomes.length} 项，请查看未完成明细。`,`${completed}/${outcomes.length} completed. Review the incomplete items.`));
    }
    setRunning(false);onBusy(false);
  }
  async function execute(value=action){
    if(!value)return;setRunning(true);onBusy(true);
    const eligible=dshBatchEligibility(skills,value);
    const outcomes:Outcome[]=eligible.excluded.map(({skill,reason})=>({file:skill.path,name:skill.name,status:'skipped',message:reason==='duplicate'?t('同一文件，仅执行一次','Same file; executed once'):reason==='source'?t('技能文件禁止此调用入口','The skill file forbids this invocation channel'):unavailable(skill)}));
    if(value==='trash')outcomes.push(...preparationFailures);
    if(value!=='trash'){
      if(!eligible.eligible.length){finish(outcomes,value);return;}
      let saved:DshSnapshot|undefined;
      try{
        const change:DshPolicySubmission={target,contextKey,configurationRevision:revision,revision:policyRevision,action:value,files:eligible.eligible.map(skill=>({file:skill.dshState!.file,revision:skill.dshState!.documentRevision}))};
        const snapshot=await (savePolicy?savePolicy(change):invoke<DshSnapshot>('upstream_dsh_policy',{change}));
        if(snapshot){onSnapshot(snapshot);saved=snapshot;}
        outcomes.push(...eligible.eligible.map(skill=>({file:skill.dshState!.file,name:skill.name,status:'complete' as const,message:t('已保存','Saved')})));
      }catch(reason){outcomes.push(...eligible.eligible.map(skill=>({file:skill.dshState!.file,name:skill.name,status:'failed' as const,message:t('技能设置未保存，请刷新后重试','Skill settings were not saved. Refresh and retry.'),details:String(reason)})));}
      finish(outcomes,value,saved);onChanged([]);return;
    }
    let stopped=false;
    for(const skill of eligible.eligible){
      const file=skill.dshState!.file;
      if(value==='trash'&&!plans.some(plan=>plan.file===file))continue;
      if(stopped){outcomes.push({file,name:skill.name,status:'skipped',message:t('配置已变化，请重新读取','Configuration changed. Reload it.')});continue;}
      try{
        const current=await invoke<DshSnapshot>('upstream_dsh_settings',{target,contextKey});
        if(current.revision!==revision||current.contextIssue){stopped=true;throw Error(t('配置上下文已变化，停止后续操作','Configuration context changed; remaining operations stopped'));}
        if(value==='trash')await invoke('upstream_dsh_trash',{reviewed:plans.find(plan=>plan.file===file)});

        outcomes.push({file,name:skill.name,status:'complete',message:t('已完成','Completed')});
      }catch(reason){const raw=String(reason);outcomes.push({file,name:skill.name,status:'failed',message:errorSummary(raw,zh)??t('操作未完成，请重新读取后再试。','The operation did not finish. Reload and try again.'),details:raw});}
    }
    finish(outcomes,value);onChanged(value==='trash'?outcomes.filter(result=>result.status==='complete').map(result=>result.file):[]);
  }
  const channel=dshInvocationChannels.find(option=>action?.startsWith(option.value));
  const invocationLabel=channel?`${zh?channel.zh:channel.en} · ${action?.endsWith('on')?t('开启','On'):t('关闭','Off')}`:'';
  const actionTitle=action==='enable'?t('启用所选技能？','Enable selected skills?'):action==='disable'?t('停用所选技能？','Disable selected skills?'):t('保存调用设置？','Save invocation settings?');
  return <>
    {showControls&&<>
      <SkillBatchToggleControls count={skills.length} disabled={disabled} canEnable={actionAvailable('enable')} canDisable={actionAvailable('disable')} zh={zh} onChange={enabled=>void review(enabled?'enable':'disable')} />
      <DropdownMenu open={invocationOpen} onOpenChange={setInvocationOpen}><Hint text={!invocationCount?t("所选技能没有可修改的调用设置","No selected invocation settings can be changed"):undefined} disabled={disabled||!invocationCount}><DropdownMenuTrigger asChild><Button ref={invocationTrigger} size="sm" variant="secondary" disabled={disabled||!invocationCount}><HandIcon data-icon="inline-start" aria-hidden="true"/>{t('调用方式','Invocation')}</Button></DropdownMenuTrigger></Hint><DropdownMenuContent align="start" className="w-max min-w-0 max-w-[calc(100vw-2rem)]" onCloseAutoFocus={event=>{
        const policy=queuedInvocation.current;
        if(!policy)return;
        event.preventDefault();
        queuedInvocation.current=null;
        // Open the review after the menu releases its focus scope.
        // Give Modal a connected return target for keyboard as well as pointer input.
        invocationTrigger.current?.focus();
        void review(policy);
      }}><DropdownMenuGroup>{dshInvocationChannels.map(channel=><DropdownMenuSub key={channel.value}><DropdownMenuSubTrigger>{channel.value==='model'?<SparklesIcon aria-hidden="true"/>:<HandIcon aria-hidden="true"/>}{zh?channel.zh:channel.en}</DropdownMenuSubTrigger><DropdownMenuSubContent><DropdownMenuGroup>{(['on','off'] as const).map(state=>{
        const value=`${channel.value}-${state}` as const;
        return <DropdownMenuItem key={state} disabled={!actionAvailable(value)} onSelect={()=>{queuedInvocation.current=value;setInvocationOpen(false);}}>{state==='on'?t('开启','On'):t('关闭','Off')}</DropdownMenuItem>;
      })}</DropdownMenuGroup></DropdownMenuSubContent></DropdownMenuSub>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
      {allowRemoval&&<Hint text={!trashCount?t("所选技能不支持独立移除；共享、托管和内置内容受保护。","The selected skills cannot be removed independently; shared, managed and bundled files are protected."):undefined} disabled={disabled||!trashCount}><Button size="sm" variant="destructive" disabled={disabled||!trashCount} onClick={()=>void review('trash')}>{t('卸载','Uninstall')}</Button></Hint>}
    </>}
    <Modal title={results?t('批量操作结果','Batch results'):action==='trash'?t('卸载技能？','Uninstall skills?'):actionTitle} open={action!==null} busy={running||preparing} onClose={()=>setAction(null)}>
      <div className="flex flex-col gap-4 text-sm">
        {!results&&<>{action!=='trash'&&<p>{t('所选技能包含当前项目之外的技能，修改也会影响使用同一文件的其他项目和配置。','The selection includes skills outside this project. Other projects and configurations using the same files share the change.')}</p>}<p>{preparing?t('正在准备卸载…','Preparing removal…'):t(`可执行 ${(action==='trash'?plans.length:eligibility.eligible.length)} 项，不执行 ${eligibility.excluded.length+preparationFailures.length} 项。`,`${action==='trash'?plans.length:eligibility.eligible.length} eligible; ${eligibility.excluded.length+preparationFailures.length} excluded.`)} {action==='trash'?t('目录技能会连同附件一起移至废纸篓；扁平文件只移动该 Markdown。','Directory skills include attachments; flat skills move only their Markdown file.'):invocationLabel}</p>
          {action==='trash'?<RemovalReviewList home={home} zh={zh} items={plans.map(plan=>({id:plan.file,name:plan.name,path:plan.path}))}
            excluded={eligibility.excluded.map(({skill,reason})=>({id:skill.path,name:skill.name,path:skill.path,message:reason==='duplicate'?t('同一文件，仅执行一次','Same file; executed once'):unavailable(skill)}))}/> : <>
          {eligibility.eligible.filter(skill=>!preparationFailures.some(failure=>failure.file===skill.dshState?.file)).map(skill=><div key={skill.dshState!.file} className="flex flex-col gap-1"><span>{skill.name}</span><span className="break-all text-xs text-muted-foreground">{displayHomePath(skill.path,home)}</span></div>)}
          {eligibility.excluded.map(({skill,reason},index)=><p key={index} className="break-all text-muted-foreground">{skill.name} — {reason==='duplicate'?t('同一文件，不重复执行','Duplicate physical file'):reason==='source'?t('技能文件禁止此调用入口','The skill file forbids this invocation channel'):unavailable(skill)}</p>)}
          </>}
          {preparationFailures.map(failure=><div key={failure.file}><p className="text-destructive">{failure.name} — {failure.message}</p><p className="break-all font-mono text-xs text-muted-foreground">{displayHomePath(failure.file,home)}</p>{failure.details&&<ExecutionLog value={failure.details} home={home} zh={zh} label={t('错误详情','Error details')}/>}</div>)}
          {reviewError&&<FlowError message={reviewError} help={t('无法准备此操作，请刷新技能列表后重试。','Could not prepare this action. Refresh the skill list and retry.')} zh={zh}/>}
        </>}
        {results&&<p>{t(`已完成 ${results.filter(result=>result.status==='complete').length}/${results.length} 项`,`${results.filter(result=>result.status==='complete').length}/${results.length} completed.`)}</p>}
        {results?.filter(result=>result.status!=='complete').map((result,index)=><div key={index} className="flex flex-col gap-1"><div className="flex items-center gap-2"><span>{result.name}</span><Badge variant="outline">{result.status==='complete'?t('已完成','Completed'):result.status==='failed'?t('失败','Failed'):t('未执行','Not executed')}</Badge></div><p className="break-all text-muted-foreground">{result.message}</p>{(result.status!=='complete'||results.some(other=>other!==result&&other.name===result.name&&other.file!==result.file))&&<p className="break-all font-mono text-xs text-muted-foreground">{displayHomePath(result.file,home)}</p>}{result.details&&<ExecutionLog value={result.details} home={home} zh={zh} label={t('错误详情','Error details')}/>}</div>)}
      </div>
      <ModalActions>{results?<Button onClick={()=>setAction(null)}>{t('完成','Done')}</Button>:<><Button variant="outline" disabled={running||preparing} onClick={()=>setAction(null)}>{t('取消','Cancel')}</Button><Button variant={action==='trash'?'destructive':'default'} disabled={running||preparing||!!reviewError||!eligibility.eligible.length||action==='trash'&&!plans.length} onClick={()=>void execute()}>{running?t('执行中…','Applying…'):t('确认','Confirm')}</Button></>}</ModalActions>
    </Modal>
  </>;
}
