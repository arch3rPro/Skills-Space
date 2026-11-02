import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import type {InstalledSkill,Target} from '@/lib/upstream';
import {filterCodexPluginPage,codexDirectoryPagePlugins,codexDirectoryWithSnapshot,sameCodexContext,reconcileCodexSnapshot,unavailableCodexSnapshot,codexToggleSelection,remainingCodexPlugins,codexPluginActionAllowed,type CodexDirectory,type CodexDirectoryResponse,type CodexDirectoryPage,type CodexSnapshot,type CodexPending,type CodexPlugin,type CodexPluginAction,type CodexPluginCheck} from '@/lib/codex';
import {useCodexAuthorization,type CodexAccountStatus} from '@/hooks/use-codex-authorization';
import {notifySuccess,useFeedbackError} from '@/lib/notifications';

export function useCodexManagement({detailPluginId,active,catalogActive=true,directoryActive,target,zh,onBusy,onSaved,initialSnapshot,inventoryReady=true}:{detailPluginId?:string|null;catalogActive?:boolean;inventoryReady?:boolean;active:boolean;directoryActive:boolean;initialSnapshot?:CodexSnapshot|null;target:Target;zh:boolean;onBusy:(busy:boolean)=>void;onSaved:(snapshot:CodexSnapshot,refreshInventory?:boolean,changed?:boolean)=>void}) {
  const [snapshot,setSnapshot]=useState<CodexSnapshot|null>(null),[loading,setLoading]=useState(false),[working,setWorking]=useState(false),[pending,setPending]=useState<CodexPending|null>(null);
  const [checks,setChecks]=useState<Record<string,CodexPluginCheck>>({}),[updateReview,setUpdateReview]=useState<{plugin:CodexPlugin;check:CodexPluginCheck;error?:string}|null>(null);
  const [error,setError]=useFeedbackError(zh),generation=useRef(0);
  const [directory,setDirectory]=useState<CodexDirectory|null>(null),[directoryLoading,setDirectoryLoading]=useState(false);
  const directoryGeneration=useRef(0);
  const [directoryRevision,setDirectoryRevision]=useState(0);
  const directoryCache=useRef(new Map<boolean,CodexDirectory>());
  const directoryRead=useRef<{key:string;promise:Promise<void>}|null>(null);
  const targetKey=JSON.stringify([target.host,target.scope,target.projectPath??null]);
  const checkRead=useRef<number|null>(null),checkGeneration=useRef(0);
  const [checkingUpdates,setCheckingUpdates]=useState(false);
  const detailContext=useRef(detailPluginId);detailContext.current=detailPluginId;
  function cancelChecks(){++checkGeneration.current;checkRead.current=null;setCheckingUpdates(false);}
  const [actionError,setActionError]=useState<string|null>(null);
  const saved=useRef(onSaved);saved.current=onSaved;
  const latest=useRef(snapshot);latest.current=snapshot;
  function accept(value:CodexSnapshot,refreshInventory=false,changed=false){if(latest.current&&!sameCodexContext(latest.current,value)){setDirectory(null);setChecks({});setUpdateReview(null);}const next=reconcileCodexSnapshot(latest.current,value);latest.current=next;setSnapshot(next);saved.current(next,refreshInventory,changed);return next;}
  const authorization=useCodexAuthorization({context:JSON.stringify([active,targetKey]),onAuthorized:async item=>{
    if(item.kind==='directory'){directoryCache.current.clear();await load(true);await loadDirectory();return;}
    const value=await load(true);
    if(!value)return;
    if(item.kind==='plugin'){
      const plugins:CodexPlugin[]=[];for(const previous of item.plugins){const plugin=value.plugins.find(plugin=>plugin.id===previous.id)??await prepareDirectoryPlugin(previous,item.action);if(!plugin)return;plugins.push(plugin);}
      const next={...item,plugins};
      if(item.action==='install'||item.action==='uninstall')setPending(next);else await execute(next);
    }
  }});
  const inventoryRead=useRef<{key:string;generation:number;promise:Promise<CodexSnapshot|null>}|null>(null);
  async function load(includeCatalog=true):Promise<CodexSnapshot|null> {
    const key=JSON.stringify([targetKey,includeCatalog]);
    if(inventoryRead.current?.key===key&&inventoryRead.current.generation===generation.current)return inventoryRead.current.promise;
    const promise=readInventory(includeCatalog);
    inventoryRead.current={key,generation:generation.current,promise};
    try{return await promise;}finally{if(inventoryRead.current?.promise===promise)inventoryRead.current=null;}
  }
  async function readInventory(includeCatalog:boolean) {
    cancelChecks();const id=++generation.current;setLoading(true);setChecks({});
    try {if(includeCatalog)await invoke<CodexAccountStatus>('upstream_codex_account_status');if(id!==generation.current)return null;const value=await invoke<CodexSnapshot>('upstream_codex_settings',{target,includeCatalog});if(id===generation.current){const accepted=accept(value);if(includeCatalog && !value.unavailableReason && value.pluginsComplete===false)setError(value.warnings.join('\n'),zh?'插件状态读取失败，可点击刷新重试；已读取的插件仍可查看。':'Plugin state could not be read. Refresh to retry; retrieved plugins remain available.');return accepted;}}
    catch(e){if(id===generation.current){if(latest.current)accept(unavailableCodexSnapshot(latest.current));setError(String(e),zh?'Codex 状态读取失败，请重新读取。':'Could not read Codex state. Reload it.');}}
    finally {if(id===generation.current)setLoading(false);}
    return null;
  }
  async function prepareDirectoryPlugin(plugin:CodexPlugin,action?:CodexPluginAction){
    if(!plugin.fingerprint.startsWith('public:'))return plugin;
    setWorking(true);onBusy(true);
    try{return await invoke<CodexPlugin>('upstream_codex_prepare_public_plugin',{target,remotePluginId:plugin.remotePluginId});}
    catch(error){if(String(error).includes('CODEX_AUTH_REQUIRED')){authorization.request(action?{kind:'plugin',plugins:[plugin],action}:{kind:'directory'});}else setError(String(error),zh?'插件详情读取失败，请重试。':'Could not read plugin details. Retry.');return null;}
    finally{setWorking(false);onBusy(false);}
  }
  async function readCategory(slug:string|null,query:string,cursor:string|null,personal:boolean){const page=await invoke<CodexDirectoryPage>('upstream_codex_plugin_category',{target,slug,query,cursor,personal,zh});return {...page,plugins:codexDirectoryPagePlugins(page.plugins,latest.current)};}
  async function loadDirectory(refresh=false):Promise<void>{
    const current=latest.current;
    const cached=directoryCache.current.get(zh);
    if(!refresh&&cached&&current&&sameCodexContext(cached.snapshot,current)){
      setDirectory(codexDirectoryWithSnapshot(cached,current));return;
    }
    const key=JSON.stringify([targetKey,zh,refresh]);
    if(directoryRead.current?.key===key)return directoryRead.current.promise;
    const id=++directoryGeneration.current;
    const promise=(async()=>{
      setDirectoryLoading(true);
      try {
        // A directory locale request needs editorial metadata, not another
        // native installation scan. Explicit Refresh still reads actual state.
        let current=latest.current;
        if(refresh||!current?.catalogRequested||current.unavailableReason)current=await load(true);
        if(!current||current.unavailableReason)throw new Error('Plugin inventory unavailable.');
        if(id!==directoryGeneration.current)return;
        const value=await invoke<CodexDirectoryResponse>('upstream_codex_plugin_directory',{target,zh,metadataOnly:true});
        if(id!==directoryGeneration.current)return;
        const snapshot=value.snapshot?accept(value.snapshot):latest.current;
        if(!snapshot)throw new Error('Plugin inventory unavailable.');
        const next=codexDirectoryWithSnapshot(value,snapshot);
        if(!value.publicError&&!value.personalError&&!value.accountRequired)directoryCache.current.set(zh,{...value,snapshot});setDirectory(next);
      }catch(error){if(id===directoryGeneration.current){setDirectory(current=>current?{...current,publicError:String(error),personalError:String(error)}:latest.current?{snapshot:latest.current,publicSections:[],personalSections:[],accountRequired:false,publicError:String(error),personalError:String(error)}:null);setError(String(error),zh?'插件目录读取失败，请重试。':'Could not read the plugin directory. Retry.');}}
      finally{if(id===directoryGeneration.current)setDirectoryLoading(false);}
    })();
    directoryRead.current={key,promise};
    try{await promise;}finally{if(directoryRead.current?.promise===promise)directoryRead.current=null;}
  }
  useEffect(()=>{
    cancelChecks();inventoryRead.current=null;directoryRead.current=null;directoryCache.current.clear();setDirectory(null);setDirectoryLoading(false);setLoading(false);latest.current=null;setSnapshot(null);setPending(null);setActionError(null);setChecks({});setUpdateReview(null);
    return()=>{++generation.current;++directoryGeneration.current;++checkGeneration.current;checkRead.current=null;};
  },[active,targetKey]);
  useEffect(()=>{
    if(!active)return;
    if(!inventoryReady){if(inventoryRead.current){++generation.current;inventoryRead.current=null;setLoading(false);}return;}
    if(initialSnapshot&&initialSnapshot!==latest.current){
      if(latest.current&&initialSnapshot.revision!==latest.current.revision){cancelChecks();setChecks({});}
      const next=reconcileCodexSnapshot(latest.current,initialSnapshot);latest.current=next;setSnapshot(next);
    }
    if(catalogActive&&!latest.current?.catalogRequested&&!latest.current?.unavailableReason&&!inventoryRead.current)void load(true);
  },[active,targetKey,inventoryReady,initialSnapshot,catalogActive]);
  useEffect(()=>{
    if(active&&directoryActive&&inventoryReady)void loadDirectory();
    return()=>{++directoryGeneration.current;directoryRead.current=null;};
  },[active,directoryActive,targetKey,zh,inventoryReady,directoryRevision]);
  async function checkPlugin(plugin:CodexPlugin, review=false) {
    if(working||checkRead.current!==null)return;
    const detail=detailContext.current;
    const id=++checkGeneration.current;checkRead.current=id;setCheckingUpdates(true);
    setChecks(current=>{const next={...current};delete next[plugin.id];return next;});
    try {const check=await invoke<CodexPluginCheck>('upstream_codex_check_plugin',{target,pluginId:plugin.id});
      if(id!==checkGeneration.current)return;
      setChecks(current=>({...current,[plugin.id]:check}));
      if(!review&&detail!==undefined&&detailContext.current!==detail)return;
      if(review || check.canUpdate || check.status!=='current')setUpdateReview({plugin,check});
      else notifySuccess(zh?'已是最新内容':'Content is up to date');
    }catch(e){if(id===checkGeneration.current&&(review||detail===undefined||detailContext.current===detail))setError(String(e),zh?'插件检查失败，请重试。':'Plugin check failed. Retry.');}
    finally{if(id===checkGeneration.current){checkRead.current=null;setCheckingUpdates(false);}}
  }
  async function checkPlugins() {
    if(working||checkRead.current!==null||!latest.current||latest.current.unavailableReason)return;
    const plugins=filterCodexPluginPage(latest.current.plugins,false,'all','all').filter(plugin=>plugin.canCheckUpdates);
    const id=++checkGeneration.current;checkRead.current=id;setCheckingUpdates(true);setChecks({});
    const failures:string[]=[];
    try {
      for(const plugin of plugins){
        if(id!==checkGeneration.current)return;
        try{
          const check=await invoke<CodexPluginCheck>('upstream_codex_check_plugin',{target,pluginId:plugin.id});
          if(id!==checkGeneration.current)return;
          setChecks(current=>({...current,[plugin.id]:check}));
        }catch(error){if(id!==checkGeneration.current)return;failures.push(`${plugin.name}: ${String(error)}`);}
      }
      if(failures.length)setError(failures.join('\n'),zh?'部分插件更新检查失败，请重新检查。':'Some plugin updates could not be checked. Try again.');
      else notifySuccess(zh?'更新检查完成':'Update check complete');
    }finally{if(id===checkGeneration.current){checkRead.current=null;setCheckingUpdates(false);}}
  }
  function reviewPluginUpdate(plugin:CodexPlugin){
    const check=checks[plugin.id];
    if(!working&&plugin.canCheckUpdates&&check?.canUpdate){cancelChecks();setUpdateReview({plugin,check});}
  }
  async function updatePlugin() {
    if(!updateReview || working)return;
    if(updateReview.error){await checkPlugin(updateReview.plugin,true);return;}
    cancelChecks();setWorking(true);onBusy(true);
    try {let value=await invoke<CodexSnapshot>('upstream_codex_update_plugin',{target,reviewed:updateReview.check});
      if(!value.catalogRequested)value=await invoke<CodexSnapshot>('upstream_codex_settings',{target,includeCatalog:true});
      accept(value,true,true);directoryCache.current.clear();setDirectoryRevision(value=>value+1);setChecks(current=>{const next={...current};delete next[updateReview.plugin.id];return next;});setUpdateReview(null);notifySuccess(updateReview.check.recovery?(zh?'插件配置已恢复':'Plugin configuration restored'):(zh?'插件已更新':'Plugin updated'));
    }catch(e){setUpdateReview({...updateReview,error:String(e)});setError(String(e),zh?'插件更新未完成，请重新检查。':'Plugin update incomplete. Check again.');}
    finally{setWorking(false);onBusy(false);}
  }
  function toggle(skills:InstalledSkill[],enabled:boolean) {
    const selection=codexToggleSelection(skills,enabled);
    if(!snapshot||snapshot.unavailableReason||working||!selection.skills.length)return;
    cancelChecks();setActionError(null);
    const item:CodexPending={kind:'skills',...selection,enabled};
    if(target.scope==='project'||selection.skills.some(s=>s.shared||s.codexState?.documentPath!==`${s.path}/SKILL.md`))setPending(item);else void execute(item);
  }
  function plugin(plugin:CodexPlugin,action:CodexPluginAction){pluginBatch([plugin],action);}
  function pluginBatch(plugins:CodexPlugin[],action:CodexPluginAction){
    if(!snapshot||working||!plugins.length)return;
    if(action==='install'&&plugins.length===1&&plugins[0].fingerprint.startsWith('public:')){void prepareDirectoryPlugin(plugins[0],action).then(plugin=>{if(plugin)pluginBatch([plugin],action);});return;}
    if(!plugins.every(plugin=>codexPluginActionAllowed(plugin,action))){setError('Plugin action unavailable.',zh?'此插件当前不支持该操作。':'This plugin action is unavailable.');return;}
    cancelChecks();setActionError(null);
    const item:Extract<CodexPending,{kind:'plugin'}>={kind:'plugin',plugins:[...new Map(plugins.map(p=>[p.id,p])).values()],action};
    if(!plugins.some(p=>p.remote)){setPending(item);return;}
    const id=generation.current;
    void invoke<CodexAccountStatus>('upstream_codex_account_status').then(status=>{
      if(id!==generation.current)return;
      if(status.state==='ready')setPending(item);else authorization.request(item);
    }).catch(()=>{if(id===generation.current)authorization.request(item);});
  }
  async function apply() {if(pending)await execute(pending);}
  async function execute(pending:CodexPending) {
    if(!latest.current||latest.current.unavailableReason||working)return;
    cancelChecks();++generation.current;setLoading(false);setWorking(true);setActionError(null);onBusy(true);let completed=0;
    try {
      let value:CodexSnapshot=latest.current;
      if(pending.kind==='skills')value=await invoke<CodexSnapshot>('upstream_codex_toggle',{request:{target,revision:value.revision,baseRules:value.rules,documents:pending.skills.flatMap(s=>s.codexState?[s.codexState.documentPath]:[]),enabled:pending.enabled}});
      else for(const plugin of pending.plugins){
        value=await invoke<CodexSnapshot>('upstream_codex_plugin',{request:{target,revision:value.revision,pluginId:plugin.id,fingerprint:plugin.fingerprint,remotePluginId:plugin.remotePluginId??null,catalogEntry:plugin.catalogEntry??false,action:pending.action}});
        completed++;
      }
      if(!value.catalogRequested)value=await invoke<CodexSnapshot>('upstream_codex_settings',{target,includeCatalog:true});
      accept(value,pending.kind==='plugin'&&(pending.action==='install'||pending.action==='uninstall'),true);directoryCache.current.clear();setDirectoryRevision(value=>value+1);setChecks({});setPending(null);
      notifySuccess(zh?'已保存':'Saved');
    }catch(e){
      if(pending.kind==='plugin'&&String(e).includes('CODEX_AUTH_REQUIRED')){setPending(null);authorization.request({...pending,plugins:pending.plugins.slice(completed)});return;}
      setPending(pending);
      const actual=await load(true);
      setActionError(String(e));
      if(pending.kind==='plugin'){
        const remaining=actual?remainingCodexPlugins(pending.plugins,completed,actual):pending.plugins.slice(completed);
        setPending(remaining.length?{...pending,plugins:remaining}:null);
        setError(String(e),pending.plugins.length>1?(zh?`已完成 ${completed}/${pending.plugins.length} 个插件，其余项可重试。`:`Completed ${completed}/${pending.plugins.length} plugins. Retry the remaining items.`):(zh?`${pending.plugins[0].name} 操作未完成，请重试。`:`Could not complete the action for ${pending.plugins[0].name}. Retry.`));
      }else setError(String(e),zh?'操作未完成，请刷新状态后重试。':'Operation incomplete. Refresh state and retry.');
    }
    finally{setWorking(false);onBusy(false);}
  }
  return {checkingUpdates,checkPlugins,reviewPluginUpdate,prepareDirectoryPlugin,readCategory,directory,directoryLoading,loadDirectory:()=>loadDirectory(true),authorizeDirectory:()=>authorization.request({kind:'directory'}),authorization:authorization.authorization,startAuthorization:authorization.start,cancelAuthorization:authorization.cancel,checks,checkPlugin,updateReview,setUpdateReview,updatePlugin,snapshot,loading,working,error,actionError,pending,setPending,load,toggle,plugin,pluginBatch,apply};
}
