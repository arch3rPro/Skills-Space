import { invoke } from '@tauri-apps/api/core';
import type { WorkbenchWorkspace, WorkbenchMessage, WorkshopQuestion } from '@/components/workshop-workbench';
export type WorkshopAgentId = 'codex'|'pi'|'claude-code'|'sarvam-code';
export type WorkshopAgent = { id:WorkshopAgentId; name:string; available:boolean; path:string|null };
export type WorkshopSkillId='creator'|'evaluator'|'optimizer';
export type BuiltinSkill={id:WorkshopSkillId;name:string;label:string;description:string;version:string;revision:string;publisher:string;repository:string;path:string;directory:string;source:string;bundled:boolean;bundledLicense?:string;metadata?:{name?:string|null;description?:string|null;license?:string|null;compatibility?:string|null}|null};
export type BuiltinCandidate={revision:string;version:string;description:string};
export type BuiltinCheck={id:WorkshopSkillId;candidate:BuiltinCandidate|null;error:string|null};
export type EvaluationResult={summary:string;structureScore:number;structure:{id:'metadata'|'instructions'|'portability'|'resources';score:number;max:number;evidence:string}[];actual:{score:number;max:number;checks:{expectation:string;result:string;evidence:string}[]}|null;issues:{title:string;impact:string;path:string;evidence:string;suggestion:string}[]};
export type EvaluationRecord={id:string;comparisonId?:string;agent:WorkshopAgentId;sourceHash:string;createdAt:number;resource:{id:WorkshopSkillId;version:string;revision:string};phase:string;reportPath?:string;error?:string;resultError?:string;result:EvaluationResult|null};
export type WorkshopDraft = { id:string; optimization?:{baselineHash:string;history?:{id:string;index:number;baselineHash:string}[];rounds:string[];ended:boolean;appliedRound?:string}; optimizationParent?:string; optimizationInputHash?:string; candidateHash?:string|null; changedFiles?:{path:string;kind:'added'|'modified'|'removed'}[]; evaluations?:EvaluationRecord[]; pendingSkill?:WorkshopSkillId;planStale?:boolean; title:string; description?:string; brief:string; agent:WorkshopAgentId; updated:number; stage:'draft'|'planning'|'planned'|'building'|'ready'; messages:WorkbenchMessage[]; directory:string; files:{path:string;size:number;modified:number;readable:boolean}[]; metadata:{name:string|null;description:string|null;error:string|null;version?:string|null;hash?:string|null;license?:string|null;compatibility?:string|null}|null; skillFile:string|null; skillDirectory:string|null; run:{id:string;skill?:WorkshopSkillId;phase:string;question?:WorkshopQuestion;activity:string;error:string|null;startedAt:number;finishedAt?:number}|null };
export type WorkshopScreen = { id:string; view:'detail'|'workbench'; review?:boolean; optimization?:boolean };
export type WorkshopEvaluationInput={agent:WorkshopAgentId;focus:string;task:string;output:string};
export type WorkshopSession = { query:string; screens:WorkshopScreen[]; workspaces:Record<string,WorkbenchWorkspace>; inputs:Record<string,string>; scrolls:Record<string,number>; skills?:Record<string,WorkshopSkillId>;evaluationInputs?:Record<string,WorkshopEvaluationInput> };
export const createWorkshopSession = ():WorkshopSession=>({query:'',screens:[],workspaces:{},inputs:{},scrolls:{}});
export const workshopRunning = (draft:WorkshopDraft)=>['preparing','running','stopping'].includes(draft.run?.phase??'');
export function workshop<T>(action:string,input:Record<string,unknown>={}):Promise<T> {return invoke<T>('workshop_command',{action,input});}

/** New selections follow app visibility; existing conversations retain their original Agent. */
export function workshopAgentEligibility(agents: WorkshopAgent[], visibleIds: string[], id: string) {
  const available = agents.some(agent => agent.id === id && agent.available);
  return { canContinue: available, canSelect: available && visibleIds.includes(id) };
}

export type WorkshopDetail = WorkshopDraft & {content:string;contentError:string|null;report:string;reportError:string|null;currentSourceHash:string|null};
