import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {LogOutIcon} from 'lucide-react';
import {Card,CardContent} from '@/components/ui/card';
import {Field,FieldContent,FieldDescription,FieldGroup,FieldLabel} from '@/components/ui/field';
import {Button} from '@/components/ui/button';
import {notifySuccess,useFeedbackError} from '@/lib/notifications';
import type {CodexAccountStatus} from '@/hooks/use-codex-authorization';

export function CodexAccountConnection({zh,disabled,onBusy,onSaved}:{zh:boolean;disabled:boolean;onBusy:(busy:boolean)=>void;onSaved:()=>void}){
  const [status,setStatus]=useState<CodexAccountStatus|null>(null),[working,setWorking]=useState(false),[failed,setFailed]=useState(false);
  const [,setError]=useFeedbackError(zh),generation=useRef(0);
  const t=(cn:string,en:string)=>zh?cn:en;
  async function load(){
    const id=++generation.current;setFailed(false);
    try{const value=await invoke<CodexAccountStatus>('upstream_codex_account_status');if(id===generation.current)setStatus(value);}
    catch{if(id===generation.current)setFailed(true);}
  }
  useEffect(()=>{void load();return()=>{++generation.current;};},[]);
  async function logout(){
    if(working||disabled)return;
    setWorking(true);onBusy(true);
    try{await invoke('upstream_codex_account_logout');setStatus({state:'required',attemptId:null});notifySuccess(t('已退出此应用的账号授权','Signed out of this app'));onSaved();}
    catch(error){setError(String(error),t('退出授权未完成，请重试。','Could not sign out. Retry.'));}
    finally{setWorking(false);onBusy(false);}
  }
  return <Card><CardContent><FieldGroup><Field orientation="horizontal"><FieldContent><FieldLabel>{t('账号授权','Account authorization')}</FieldLabel><FieldDescription>{failed?t('授权状态读取失败','Could not read authorization status'):status?.state==='ready'?t('已授权，自动保持登录','Authorized; sign-in is kept automatically'):status?.state==='waiting'?t('等待浏览器授权','Waiting for browser authorization'):status?t('未授权，需要时提示','Not authorized; prompted when needed'):t('读取中…','Reading…')}</FieldDescription></FieldContent>{failed?<Button variant="outline" disabled={disabled||working} onClick={()=>void load()}>{t('重试','Retry')}</Button>:status?.state==='ready'?<Button variant="outline" disabled={disabled||working} onClick={()=>void logout()}><LogOutIcon data-icon="inline-start" aria-hidden="true"/>{working?t('退出中…','Signing out…'):t('退出授权','Sign out')}</Button>:null}</Field></FieldGroup></CardContent></Card>;
}
