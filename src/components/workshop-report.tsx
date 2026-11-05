import type { ReactNode } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardHeader, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import type { EvaluationResult } from '@/lib/workshop';

export function evidenceText(evidence:string,path:string) {
 const prefix=evidence.match(/^[ \t]*\`?([^\r\n\`:：]+?)\`?[ \t]*[:：]\s*/);
 const relative=(value:string)=>value.trim().replace(/^\.\//,'').replace(/^skill\//,'');
 if (!prefix || relative(prefix[1])!==relative(path)) return evidence;
 return evidence.slice(prefix[0].length)||evidence;
}

export function WorkshopReportScore({result,actual=result.actual,zh,title}: {
  result: EvaluationResult;
  actual?: EvaluationResult['actual'];
  zh: boolean;
  title?: string;
}) {
  const t=(cn:string,en:string)=>zh?cn:en;
  const structureEvidence=result.structure.map(item=>evidenceText(item.evidence,'SKILL.md'));
  const sharedSkillSource=structureEvidence.length>0&&structureEvidence.every((text,i)=>text!==result.structure[i].evidence);
  return <>
   <CardHeader className="gap-2">
     <h2 className="text-base font-medium">{title ?? t('评估结论','Evaluation summary')}</h2>
     <p className="whitespace-pre-wrap leading-6 [overflow-wrap:anywhere]">{result.summary}</p>
   </CardHeader>
   <CardContent>
     <dl className="grid grid-cols-2 gap-4">
       <div><dt className="text-sm text-muted-foreground">{t('技能质量','Skill quality')}</dt><dd className="mt-1 text-lg font-medium tabular-nums">{result.structureScore} <span className="text-sm font-normal text-muted-foreground">/ 60</span></dd></div>
       <div><dt className="text-sm text-muted-foreground">{t('实际效果','Task effectiveness')}</dt><dd className="mt-1 text-lg font-medium tabular-nums">{actual?<>{actual.score} <span className="text-sm font-normal text-muted-foreground">/ {actual.max}</span></>:<span className="text-sm font-normal text-muted-foreground">{t('未评估','Not evaluated')}</span>}</dd></div>
     </dl>
     <Collapsible className="mt-3">
       <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="group -ms-2"><ChevronRightIcon data-icon="inline-start" className="group-data-[state=open]:rotate-90"/>{t('分项评分','Score breakdown')}</Button></CollapsibleTrigger>
       <CollapsibleContent className="flex flex-col gap-4 pt-3 text-sm [overflow-wrap:anywhere]">
         {sharedSkillSource&&<p className="text-xs text-muted-foreground">{t('评分依据','Scoring source')} <code className="ms-1">SKILL.md</code></p>}
         {result.structure.map((item,i)=><div key={item.id}><div className="flex justify-between gap-3"><h3 className="font-medium">{{metadata:t('元数据与适用范围','Metadata and applicability'),instructions:t('任务流程与指令','Workflow and instructions'),portability:t('通用性与依赖','Portability and dependencies'),resources:t('资源与简洁性','Resources and brevity')}[item.id]}</h3><span className="shrink-0 tabular-nums">{item.score} / {item.max}</span></div><p className="mt-1 whitespace-pre-wrap leading-6 text-muted-foreground">{sharedSkillSource?structureEvidence[i]:item.evidence}</p></div>)}
         {actual?.checks.map((c,i)=><div key={i}><h3 className="font-medium">{c.expectation}</h3><p>{c.result}</p><p className="whitespace-pre-wrap leading-6 text-muted-foreground">{c.evidence}</p></div>)}
       </CollapsibleContent>
     </Collapsible>
   </CardContent>
  </>;
}

export function WorkshopReportHistory({label,count,children}: {label:string;count:number;children:ReactNode}) {
  if (!count) return null;
  return <Collapsible>
    <CollapsibleTrigger asChild>
      <Button variant="ghost" size="sm" className="group -ms-2">
        <ChevronRightIcon data-icon="inline-start" className="group-data-[state=open]:rotate-90"/>
        {label}
        <span className="tabular-nums text-muted-foreground">{count}</span>
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent><ul className="flex flex-col gap-1 pt-2">{children}</ul></CollapsibleContent>
  </Collapsible>;
}

export function WorkshopReportHistoryRow({children,status,failed,disabled,onOpen}: {
  children:ReactNode;status:string;failed?:boolean;disabled?:boolean;onOpen:()=>void;
}) {
  return <li>
    <Button variant="navigation" className="h-auto min-h-9 w-full justify-between gap-3 py-2 text-left" disabled={disabled} onClick={onOpen}>
      {children}
      <span className="inline-flex shrink-0 items-center gap-2">
        <Badge variant={failed?'destructive':'secondary'}>{status}</Badge><ChevronRightIcon aria-hidden="true"/>
      </span>
    </Button>
  </li>;
}
