import { invoke } from '@tauri-apps/api/core';
import type { WorkbenchWorkspace, WorkbenchMessage } from '@/components/workshop-workbench';
export type WorkshopAgentId = 'codex'|'pi'|'claude-code'|'sarvam-code';
export type WorkshopAgent = { id:WorkshopAgentId; name:string; available:boolean; path:string|null };
export type WorkshopDraft = { id:string; title:string; description?:string; brief:string; agent:WorkshopAgentId; updated:number; stage:'draft'|'planning'|'planned'|'building'|'ready'; messages:WorkbenchMessage[]; directory:string; files:{path:string;size:number;modified:number;readable:boolean}[]; metadata:{name:string|null;description:string|null;error:string|null;version?:string|null;hash?:string|null;license?:string|null;compatibility?:string|null}|null; skillFile:string|null; skillDirectory:string|null; run:{id:string;phase:string;activity:string;error:string|null;startedAt:number;finishedAt?:number}|null };
export type WorkshopScreen = { id:string; view:'detail'|'workbench'; review?:boolean };
export type WorkshopSession = { query:string; screens:WorkshopScreen[]; workspaces:Record<string,WorkbenchWorkspace>; inputs:Record<string,string>; scrolls:Record<string,number> };
export const createWorkshopSession = ():WorkshopSession=>({query:'',screens:[],workspaces:{},inputs:{},scrolls:{}});
export const workshopRunning = (draft:WorkshopDraft)=>['preparing','running','stopping'].includes(draft.run?.phase??'');
export function workshop<T>(action:string,input:Record<string,unknown>={}):Promise<T> {return invoke<T>('workshop_command',{action,input});}

/** New selections follow app visibility; existing conversations retain their original Agent. */
export function workshopAgentEligibility(agents: WorkshopAgent[], visibleIds: string[], id: string) {
  const available = agents.some(agent => agent.id === id && agent.available);
  return { canContinue: available, canSelect: available && visibleIds.includes(id) };
}

export type WorkshopDetail = WorkshopDraft & {content:string;contentError:string|null;report:string;reportError:string|null};
