import {useCallback,useSyncExternalStore} from 'react';
import type {Target} from './upstream';

export type ViewFilters={agent:string;query:string;source:string;status:string};
const empty:ViewFilters={agent:'',query:'',source:'all',status:'all'};
export function filterContext(target:Target,...view:string[]){return JSON.stringify([target.host,target.scope,target.projectPath??null,...view]);}
// Owned by one App instance; closing the application releases all view choices.
export function createFilterSession(){
 const values=new Map<string,ViewFilters>(),listeners=new Set<()=>void>();
 return {
  get:(key:string)=>values.get(key)??empty,
  patch(key:string,patch:Partial<ViewFilters>){const previous=values.get(key)??empty;const next={...previous,...patch};if(next.agent===previous.agent&&next.query===previous.query&&next.source===previous.source&&next.status===previous.status)return;values.set(key,next);for(const listener of listeners)listener();},
  subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
 };
}
export type FilterSession=ReturnType<typeof createFilterSession>;
export function useViewFilters(session:FilterSession,key:string){
 const read=useCallback(()=>session.get(key),[session,key]);
 const value=useSyncExternalStore(session.subscribe,read,read);
 const patch=useCallback((next:Partial<ViewFilters>)=>session.patch(key,next),[session,key]);
 return [value,patch] as const;
}
