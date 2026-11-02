import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import type {CodexPending} from '@/lib/codex';

export type CodexAccountStatus={state:'required'|'waiting'|'ready';attemptId:string|null};
export type CodexAuthorizationIntent=Extract<CodexPending,{kind:'plugin'}>|{kind:'directory'};
export type CodexAuthorization={pending:CodexAuthorizationIntent;phase:'required'|'starting'|'waiting'|'failed';error?:string};
export function useCodexAuthorization({context,onAuthorized}:{context:string;onAuthorized:(pending:CodexAuthorizationIntent)=>Promise<void>}) {
  const [authorization,setAuthorization]=useState<CodexAuthorization|null>(null);
  const state=useRef(authorization);state.current=authorization;
  const attempt=useRef<string|null>(null),generation=useRef(0);
  const saved=useRef(onAuthorized);saved.current=onAuthorized;
  function cancel(){
    ++generation.current;
    const id=attempt.current;attempt.current=null;state.current=null;setAuthorization(null);
    if(id)void invoke('upstream_codex_account_cancel',{attemptId:id}).catch(()=>{});
  }
  useEffect(()=>()=>{
    ++generation.current;
    const id=attempt.current;attempt.current=null;
    if(id)void invoke('upstream_codex_account_cancel',{attemptId:id}).catch(()=>{});
  },[context]);
  useEffect(()=>{state.current=null;setAuthorization(null);},[context]);
  function request(pending:CodexAuthorizationIntent){
    ++generation.current;const value:CodexAuthorization={pending,phase:'required'};
    state.current=value;setAuthorization(value);
  }
  async function start(){
    const current=state.current;
    if(!current||current.phase==='starting'||current.phase==='waiting')return;
    const id=++generation.current;
    setAuthorization({...current,phase:'starting',error:undefined});
    try{
      const result=await invoke<CodexAccountStatus>('upstream_codex_account_start');
      if(id!==generation.current){if(result.attemptId)void invoke('upstream_codex_account_cancel',{attemptId:result.attemptId}).catch(()=>{});return;}
      attempt.current=result.attemptId;
      if(result.state==='ready'){
        state.current=null;setAuthorization(null);attempt.current=null;
        await saved.current(current.pending);
      }else setAuthorization({...current,phase:'waiting',error:undefined});
    }catch(error){if(id===generation.current)setAuthorization({...current,phase:'failed',error:String(error)});}
  }
  useEffect(()=>{
    if(authorization?.phase!=='waiting')return;
    const current=authorization,id=generation.current;
    let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
    async function poll(){
      try{
        const result=await invoke<CodexAccountStatus>('upstream_codex_account_status',{attemptId:attempt.current});
        if(stopped||id!==generation.current)return;
        if(result.state==='ready'){
          state.current=null;attempt.current=null;setAuthorization(null);
          await saved.current(current.pending);return;
        }
        if(result.state==='required')throw new Error('CODEX_AUTH_TIMEOUT');
        timer=setTimeout(()=>void poll(),1000);
      }catch(error){if(!stopped&&id===generation.current)setAuthorization({...current,phase:'failed',error:String(error)});}
    }
    timer=setTimeout(()=>void poll(),1000);
    return()=>{stopped=true;if(timer)clearTimeout(timer);};
  },[authorization]);
  return {authorization,request,start,cancel};
}
