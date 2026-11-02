import {useEffect, useId, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {open} from '@tauri-apps/plugin-dialog';
import {ArrowUpIcon, FolderOpenIcon, PlusIcon, RefreshCwIcon, StoreIcon, Trash2Icon} from 'lucide-react';
import {BackButton} from '@/components/back-button';
import {Modal, ModalActions} from '@/components/modal';
import {FlowError} from '@/components/flow-error';
import {Hint} from '@/components/hint';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card, CardContent} from '@/components/ui/card';
import {Field, FieldGroup, FieldLabel} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Skeleton} from '@/components/ui/skeleton';
import {Empty,EmptyHeader,EmptyTitle} from '@/components/ui/empty';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogBody,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {notifySuccess} from '@/lib/notifications';
import {displayHomePath,expandHomePath,type Target} from '@/lib/upstream';

type Market={name:string;displayName:string;root:string;source:string;sourceType:string;refName:string|null;sparsePaths:string[];canRemove:boolean;canUpgrade:boolean;origin:"app"|"runtime"|"user"|"configuration";userRegistered:boolean;registrationRevision:string;remainsProvided:boolean};
type Inventory={markets:Market[];canAdd:boolean;readError:string|null};
export function CodexMarketplaces({target,home,zh,disabled,onBack,onBusy,onSaved}:{target:Target;home:string;zh:boolean;disabled:boolean;onBack:()=>void;onBusy:(busy:boolean)=>void;onSaved:()=>void}) {
  const t=(cn:string,en:string)=>zh?cn:en;
  const formId=useId();
  const [inventory,setInventory]=useState<Inventory|null>(null),[loading,setLoading]=useState(true),[working,setWorking]=useState(false);
  const [error,setError]=useState<string|null>(null),[actionError,setActionError]=useState<string|null>(null);
  const [adding,setAdding]=useState(false),[pending,setPending]=useState<{market:Market;action:'remove'|'upgrade'}|null>(null);
  const [source,setSource]=useState(''),[reference,setReference]=useState(''),[sparse,setSparse]=useState('');
  const locked=disabled||working;
  const markets=inventory?.markets.filter(market=>market.origin!=='app'&&market.origin!=='runtime')??[];
  const local=/^(~[\\/]|[\\/]|[A-Za-z]:[\\/]|\.\.?[\\/])/.test(source.trim());
  async function read(){
    setLoading(true);setError(null);
    try{const value=await invoke<Inventory>('upstream_codex_marketplaces',{target});setInventory(value);setError(value.readError);}catch(e){setError(String(e));}finally{setLoading(false);}
  }
  useEffect(()=>{let active=true;setLoading(true);setInventory(null);setError(null);
    void invoke<Inventory>('upstream_codex_marketplaces',{target}).then(value=>{if(active){setInventory(value);setError(value.readError);}}).catch(e=>{if(active)setError(String(e));}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[target]);
  async function mutate(action:'add'|'remove'|'upgrade') {
    setWorking(true);onBusy(true);setActionError(null);
    try{
      const value=await invoke<Inventory>('upstream_codex_marketplace_apply',{request:{target,action,source:expandHomePath(source.trim(),home),refName:reference.trim()||null,sparsePaths:sparse.split('\n').map(s=>s.trim()).filter(Boolean),market:pending?.market??null}});
      setInventory(value);setError(value.readError);setAdding(false);setPending(null);setSource('');setReference('');setSparse('');
      notifySuccess(action==='add'?t('市场已添加','Marketplace added'):action==='upgrade'?t('市场已升级','Marketplace upgraded'):t('市场已移除','Marketplace removed'));onSaved();
    }catch(e){setActionError(String(e));if(action==='upgrade'){try{const value=await invoke<Inventory>('upstream_codex_marketplaces',{target});setInventory(value);setError(value.readError);}catch{/* Keep the original operation error available. */}onSaved();}}finally{setWorking(false);onBusy(false);}
  }
  async function browse(){try{const path=await open({directory:true,multiple:false});if(typeof path==='string'){setSource(displayHomePath(path,home));setReference('');setSparse('');}}catch(e){setActionError(String(e));}}
  return <section className="mx-auto flex min-w-0 w-full max-w-4xl flex-col gap-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><BackButton label={t('返回插件列表','Back to plugins')} disabled={locked} onClick={onBack}/><h1 className="text-2xl font-medium tracking-tight">{t('插件市场','Plugin marketplaces')}</h1></div><div className="flex items-center gap-2"><Hint text={t('刷新','Refresh')} disabled={locked||loading}><Button variant="ghost" size="icon-sm" disabled={locked||loading} aria-label={t('刷新市场','Refresh marketplaces')} onClick={()=>void read()}><RefreshCwIcon aria-hidden="true" className={loading?'animate-spin motion-reduce:animate-none':undefined}/></Button></Hint>{inventory?.canAdd&&<Button disabled={locked||loading} onClick={()=>{setActionError(null);setAdding(true);}}><PlusIcon aria-hidden="true"/>{t('添加市场','Add marketplace')}</Button>}</div></header>
    {error&&<div className="flex flex-col items-start gap-3"><FlowError message={error} help={t('市场读取失败，请重试。','Could not read marketplaces. Retry.')} zh={zh}/><Button variant="outline" disabled={locked||loading} onClick={()=>void read()}>{t('重试','Retry')}</Button></div>}
    {loading&&!inventory?<Skeleton className="h-32 w-full"/>:inventory&&!markets.length?<Empty><EmptyHeader><EmptyTitle>{t('暂无插件市场','No plugin marketplaces')}</EmptyTitle></EmptyHeader></Empty>:inventory&&<Card><CardContent className="flex min-w-0 flex-col gap-1">{markets.map(market=><div key={`${market.name}:${market.root}`} className="flex min-w-0 items-center gap-3 rounded-lg p-3 hover:bg-muted focus-within:bg-muted"><StoreIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true"/><div className="flex min-w-0 flex-1 flex-col gap-1"><div className="flex flex-wrap items-center gap-2"><p className="break-words text-sm font-medium">{market.displayName}</p>{market.origin==='configuration'&&<Badge variant="secondary">{t('配置提供','Configuration-provided')}</Badge>}</div><p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{displayHomePath(market.source,home)}</p>{(market.refName||market.sparsePaths.length>0)&&<p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{[market.refName,...market.sparsePaths].filter(Boolean).join(' · ')}</p>}</div>{market.canUpgrade&&<Button variant="outline" size="sm" disabled={locked||loading} aria-label={`${t('升级市场','Upgrade marketplace')} ${market.displayName}`} onClick={()=>{setActionError(null);setPending({market,action:'upgrade'});}}><ArrowUpIcon data-icon="inline-start" aria-hidden="true"/>{t('升级','Upgrade')}</Button>}{market.canRemove&&<Hint text={t('移除用户注册','Remove user registration')} disabled={locked}><Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" disabled={locked} aria-label={`${t('移除市场','Remove marketplace')} ${market.displayName}`} onClick={()=>{setActionError(null);setPending({market,action:'remove'});}}><Trash2Icon aria-hidden="true"/></Button></Hint>}</div>)}</CardContent></Card>}
    {adding&&<Modal compact open title={t('添加插件市场','Add plugin marketplace')} busy={working} onClose={()=>setAdding(false)}>
      <form id={formId} className="flex flex-col gap-4" onSubmit={event=>{event.preventDefault();if(source.trim()&&!working)void mutate('add');}}><FieldGroup className="gap-4">
        <Field><FieldLabel htmlFor="codex-market-source">{t('来源','Source')}</FieldLabel><div className="flex min-w-0 items-center gap-2"><Input autoFocus id="codex-market-source" name="codex-market-source" autoComplete="off" spellCheck={false} value={source} disabled={working} placeholder="owner/repo · https://github.com/owner/repo.git" onChange={event=>{setSource(event.target.value);if(/^(~[\\/]|[\\/]|[A-Za-z]:[\\/]|\.\.?[\\/])/.test(event.target.value.trim())){setReference('');setSparse('');}}}/><Hint text={t('选择本地目录','Choose local folder')} disabled={working}><Button variant="outline" size="icon-sm" disabled={working} aria-label={t('选择市场目录','Choose marketplace folder')} onClick={()=>void browse()}><FolderOpenIcon aria-hidden="true"/></Button></Hint></div></Field>
        <Field><FieldLabel htmlFor="codex-market-ref">{t('Git 引用','Git ref')}</FieldLabel><Input id="codex-market-ref" name="codex-market-ref" autoComplete="off" spellCheck={false} disabled={working||local} value={reference} placeholder={t('默认分支','Default branch')} onChange={event=>setReference(event.target.value)}/></Field>
        <Field><FieldLabel htmlFor="codex-market-sparse">{t('稀疏路径','Sparse paths')}</FieldLabel><Textarea id="codex-market-sparse" name="codex-market-sparse" autoComplete="off" spellCheck={false} disabled={working||local} value={sparse} placeholder="plugins/codex" onChange={event=>setSparse(event.target.value)}/></Field>
      </FieldGroup>{actionError&&<FlowError message={actionError} help={t('请检查市场来源后重试。','Check the marketplace source and retry.')} zh={zh}/>}<ModalActions><Button variant="outline" disabled={working} onClick={()=>setAdding(false)}>{t('取消','Cancel')}</Button><Button type="submit" form={formId} disabled={working||!source.trim()}>{working?t('添加中…','Adding…'):t('添加市场','Add marketplace')}</Button></ModalActions></form>
    </Modal>}
    {pending&&<AlertDialog open onOpenChange={value=>{if(!value&&!working)setPending(null);}}><AlertDialogContent aria-busy={working} onEscapeKeyDown={event=>{if(working)event.preventDefault();}}><AlertDialogHeader><AlertDialogTitle>{pending?.action==='upgrade'?t('升级市场','Upgrade marketplace'):t('移除市场？','Remove marketplace?')}</AlertDialogTitle><AlertDialogDescription>{pending?.action==='upgrade'?t('将刷新此市场到配置的 Git 引用，并可能重新安装或刷新其中已配置插件的文件，包括已停用的插件。运行中的会话可能需要重新开启。','Refresh this marketplace to its configured Git ref. Files for its configured plugins may be installed again or refreshed, including disabled plugins. Existing sessions may need to be reopened.'):pending?.market.remainsProvided?t('移除此市场的配置记录，保留应用或运行环境提供的内容。','Remove this marketplace registration, keeping the content supplied by the app or runtime.'):t('移除市场注册及下载的目录副本，保留本地来源目录、已安装插件缓存和技能规则。来自此市场的插件可能无法加载或更新。','Remove the registration and downloaded snapshot, keeping local source folders, installed plugin caches and skill rules. Plugins from this marketplace may no longer load or update.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogBody className="flex min-w-0 flex-col gap-2"><p className="break-words text-sm font-medium">{pending?.market.displayName}</p><p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{displayHomePath(pending?.market.source??'',home)}</p>{actionError&&<FlowError message={actionError} help={t('请重新读取市场后重试。','Reload marketplaces and retry.')} zh={zh}/>}</AlertDialogBody><AlertDialogFooter><AlertDialogCancel disabled={working}>{t('取消','Cancel')}</AlertDialogCancel><AlertDialogAction variant={pending?.action==='upgrade'?'default':'destructive'} disabled={working} onClick={event=>{event.preventDefault();if(pending)void mutate(pending.action);}}>{working?t('处理中…','Working…'):actionError?t('重试','Retry'):pending?.action==='upgrade'?t('升级市场','Upgrade marketplace'):t('移除市场','Remove marketplace')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
  </section>;
}
