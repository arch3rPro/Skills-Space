import {useEffect,useRef,useState} from 'react';
import {ExternalLinkIcon,PackageIcon,PlusIcon,RefreshCwIcon,SearchIcon,StoreIcon,ChevronRightIcon,FileTextIcon,PowerIcon,RotateCcwIcon,Trash2Icon,InfoIcon} from 'lucide-react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {CodexSkillIcon} from '@/components/codex-skill-icon';
import {ActionMenu} from '@/components/action-menu';
import {BackButton} from '@/components/back-button';
import {FlowError} from '@/components/flow-error';
import {Hint} from '@/components/hint';
import {OverflowText} from '@/components/overflow-text';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Skeleton} from '@/components/ui/skeleton';
import {Empty,EmptyHeader,EmptyTitle,EmptyContent} from '@/components/ui/empty';
import {type CodexDirectory,type CodexDirectorySection,type CodexDirectoryPage,type CodexPluginAction,type CodexPlugin} from '@/lib/codex';

export type CodexDirectoryNavigation={tab:string;section:CodexDirectorySection|null};
type Props={canManageMarkets:boolean;view:CodexDirectoryNavigation;onView:(value:CodexDirectoryNavigation)=>void;directory:CodexDirectory|null;loading:boolean;disabled:boolean;zh:boolean;query:string;onQuery:(value:string)=>void;onBack:()=>void;onRefresh:()=>void;onMarkets:()=>void;onAuthorize:()=>void;onOpen:(plugin:CodexPlugin)=>void;onInstall:(plugin:CodexPlugin)=>void;onAction:(plugin:CodexPlugin,action:CodexPluginAction)=>void;readCategory:(slug:string|null,query:string,cursor:string|null,personal:boolean)=>Promise<CodexDirectoryPage>};
function DirectoryEntry({plugin,disabled,zh,onOpen,onInstall,onAction}:{plugin:CodexPlugin;disabled:boolean;zh:boolean;onOpen:()=>void;onInstall:()=>void;onAction:(action:CodexPluginAction)=>void}){
  return <li className="flex min-w-0 items-center gap-3 py-3">
    <button type="button" disabled={disabled} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${zh?'查看插件详情':'View plugin details'} ${plugin.name}`} onClick={onOpen}>
      <CodexSkillIcon src={plugin.icon} size="md" fallback={<PackageIcon className="size-7 text-muted-foreground" aria-hidden="true"/>}/>
      <span className="flex min-w-0 flex-1 flex-col gap-1"><OverflowText text={plugin.name} className="truncate text-sm font-medium"/>{plugin.description&&<OverflowText text={plugin.description} className="line-clamp-1 text-sm text-muted-foreground"/>}</span>
    </button>
    {plugin.installed&&<ActionMenu compact label={`${zh?'插件操作':'Plugin actions'} ${plugin.name}`} disabled={disabled} groups={[[{label:zh?'查看详情':'View details',icon:<FileTextIcon aria-hidden="true"/>,run:onOpen},...(plugin.canToggle?[{label:plugin.enabled?(zh?'停用':'Disable'):(zh?'启用':'Enable'),icon:<PowerIcon aria-hidden="true"/>,run:()=>onAction(plugin.enabled?'disable':'enable')}]:[]),...(plugin.toggleScope==='project'&&plugin.projectEnabled!=null&&plugin.canToggle?[{label:zh?'恢复继承设置':'Restore inherited settings',icon:<RotateCcwIcon aria-hidden="true"/>,run:()=>onAction('reset')}]:[])],...(plugin.canUninstall?[[{label:zh?'卸载':'Uninstall',icon:<Trash2Icon aria-hidden="true"/>,run:()=>onAction('uninstall'),destructive:true}]]:[])]}/>}
    {!plugin.installed&&plugin.permissions?.install==='restricted'&&<Hint text={zh?'查看安装条件':'View installation requirements'}><Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={`${zh?'查看插件详情':'View plugin details'} ${plugin.name}`} onClick={onOpen}><InfoIcon aria-hidden="true"/></Button></Hint>}
    {!plugin.installed&&plugin.canInstall&&<Hint text={zh?'安装插件':'Install plugin'} disabled={disabled}><Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={`${zh?'安装插件':'Install plugin'} ${plugin.id}`} onClick={onInstall}><PlusIcon aria-hidden="true"/></Button></Hint>}
  </li>;
}
export function CodexPluginDirectory({canManageMarkets,directory,loading,disabled,zh,query,onQuery,onBack,onRefresh,onMarkets,onAuthorize,onOpen,onInstall,onAction,readCategory,view,onView}:Props){
  const t=(cn:string,en:string)=>zh?cn:en;
  const {tab,section:selected}=view;
  const setSelected=(section:CodexDirectorySection|null)=>onView({...view,section});
  const [page,setPage]=useState<CodexDirectoryPage|null>(null),[pageLoading,setPageLoading]=useState(false),[pageError,setPageError]=useState<string|null>(null),[reload,setReload]=useState(0);
  const generation=useRef(0);
  const pages=useRef(new Map<string,CodexDirectoryPage>());
  const previousPageQuery=useRef('');
  const sections=(tab==='public'?directory?.publicSections:directory?.personalSections)??[];
  const section=sections.find(section=>section.id===selected?.id)??selected;
  useEffect(()=>{if(directory&&!loading&&selected&&!(tab==='public'?directory.publicError:directory.personalError)&&!sections.some(section=>section.id===selected.id))onView({...view,section:null});},[directory,loading,selected?.id,tab]);
  const remotePage=section?section.kind!=='market':tab==='public'&&query.trim().length>0;
  const personalPage=section?.kind==='created';
  const slug=personalPage?null:section?.urlSlug??null;
  const nativeRevision=JSON.stringify(directory?.snapshot.plugins.map(plugin=>[plugin.id,plugin.fingerprint]));
  const pageQuery=JSON.stringify([directory?.snapshot.contextId,nativeRevision,slug,query,personalPage]);
  const pageKey=JSON.stringify([pageQuery,zh]);
  useEffect(()=>{
    const id=++generation.current;setPageError(null);
    if(!remotePage||!directory||directory.accountRequired){setPage(null);setPageLoading(false);return;}
    const cached=pages.current.get(pageKey);
    if(cached){previousPageQuery.current=pageQuery;setPage(cached);setPageLoading(false);return;}
    if(previousPageQuery.current!==pageQuery)setPage(null);
    previousPageQuery.current=pageQuery;setPageLoading(true);
    const timer=setTimeout(()=>{void readCategory(slug,query,null,personalPage).then(value=>{if(id===generation.current){if(pages.current.size>=8){const oldest=pages.current.keys().next().value;if(oldest)pages.current.delete(oldest);}pages.current.set(pageKey,value);setPage(value);}}).catch(error=>{if(id===generation.current){setPageError(String(error));if(String(error).includes('CODEX_AUTH_REQUIRED'))onAuthorize();}}).finally(()=>{if(id===generation.current)setPageLoading(false);});},query.trim()?250:0);
    return()=>{clearTimeout(timer);++generation.current;};
  },[remotePage,pageKey,reload,directory?.accountRequired,directory?.snapshot.contextId]);
  async function more(){
    if(!page?.nextPageToken||pageLoading)return;
    const id=++generation.current;setPageLoading(true);setPageError(null);
    try{const next=await readCategory(slug,query,page.nextPageToken,personalPage);if(id===generation.current)setPage(current=>{const combined=current?{...next,plugins:[...new Map([...current.plugins,...next.plugins].map(plugin=>[plugin.remotePluginId??plugin.id,plugin])).values()]}:next;pages.current.set(pageKey,combined);return combined;});}
    catch(error){if(id===generation.current)setPageError(String(error));}
    finally{if(id===generation.current)setPageLoading(false);}
  }
  const search=query.trim().toLowerCase();
  const matches=(plugin:CodexPlugin)=>!search||`${plugin.name} ${plugin.description??''}`.toLowerCase().includes(search);
  const visibleSections=section?[{...section,title:page?.title??section.title,plugins:(remotePage?page?.plugins??[]:section.plugins).filter(plugin=>section.kind==='created'||section.kind==='market'?matches(plugin):true)}]
    :remotePage?[{id:'search',title:'',urlSlug:null,kind:'public' as const,plugins:page?.plugins??[]}]
    :sections.map(section=>({...section,plugins:tab==='personal'?section.plugins.filter(matches):section.plugins})).filter(section=>section.plugins.length>0);
  const error=pageError??(tab==='public'?directory?.publicError:directory?.personalError);
  const empty=!visibleSections.some(section=>section.plugins.length>0);
  const pending=loading||pageLoading;
  function back(){if(section){setSelected(null);setPage(null);}else onBack();}
  function refresh(){pages.current.clear();if(remotePage)setReload(value=>value+1);else onRefresh();}
  const body=<div className="flex min-w-0 flex-col gap-6">
    {error&&<FlowError message={error} help={t('目录读取失败，请刷新重试。','Could not read the directory. Refresh and retry.')} zh={zh}/>}
    {tab==='public'&&directory?.accountRequired?<Empty><EmptyHeader><EmptyTitle>{t('浏览官方插件目录','Browse the official plugin directory')}</EmptyTitle></EmptyHeader><EmptyContent><Button disabled={disabled} onClick={onAuthorize}><ExternalLinkIcon data-icon="inline-start" aria-hidden="true"/>{t('授权并浏览','Authorize and browse')}</Button></EmptyContent></Empty>:pending&&empty?<div className="grid grid-cols-1 gap-6 md:grid-cols-2">{Array.from({length:6},(_,index)=><Skeleton key={index} className="h-16 w-full"/>)}</div>:empty&&!error?<Empty><EmptyHeader><EmptyTitle>{query?t('没有匹配的插件','No matching plugins'):t('暂无插件','No plugins')}</EmptyTitle></EmptyHeader></Empty>:visibleSections.map(group=><section key={group.id} className="flex min-w-0 flex-col gap-2">
      {!section&&!remotePage&&(group.urlSlug||group.plugins.length>6?<h2 className="self-start"><Button variant="ghost" size="sm" className="-ml-3 self-start" disabled={disabled} onClick={()=>{setSelected(group);}}>{group.title}<ChevronRightIcon data-icon="inline-end" aria-hidden="true"/></Button></h2>:<h2 className="text-base font-medium">{group.title}</h2>)}
      <ul className="grid min-w-0 grid-cols-1 gap-x-12 md:grid-cols-2">{(section||remotePage?group.plugins:group.plugins.slice(0,6)).map(plugin=><DirectoryEntry key={plugin.remotePluginId??plugin.id} plugin={plugin} disabled={disabled} zh={zh} onOpen={()=>onOpen(plugin)} onInstall={()=>onInstall(plugin)} onAction={action=>onAction(plugin,action)}/>)}</ul>
    </section>)}
    {remotePage&&page?.nextPageToken&&<Button variant="outline" className="self-center" disabled={disabled||pageLoading} onClick={()=>void more()}>{pageLoading?t('加载中…','Loading…'):pageError?t('重试','Retry'):t('加载更多','Load more')}</Button>}
  </div>;
  return <section className="flex min-w-0 flex-col gap-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><div className="flex min-w-0 items-center gap-2"><BackButton label={section?t('返回插件发现','Back to plugin discovery'):t('返回插件管理','Back to plugins')} disabled={disabled} onClick={back}/><h1 className="text-2xl font-medium tracking-tight">{section?page?.title??section.title:t('添加插件','Add plugins')}</h1></div><div className="flex flex-wrap items-center gap-2"><div className="relative w-64"><SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/><Input type="search" className="pl-9" value={query} onChange={event=>onQuery(event.target.value)} aria-label={t('搜索插件','Search plugins')} placeholder={t('搜索插件…','Search plugins…')}/></div><Hint text={t('刷新','Refresh')} disabled={disabled||pending}><Button variant="ghost" size="icon-sm" aria-label={t('刷新插件目录','Refresh plugin directory')} disabled={disabled||pending} onClick={refresh}><RefreshCwIcon aria-hidden="true" className={pending?'animate-spin motion-reduce:animate-none':undefined}/></Button></Hint>{canManageMarkets&&<Button variant="outline" disabled={disabled} onClick={onMarkets}><StoreIcon data-icon="inline-start" aria-hidden="true"/>{t('插件市场','Plugin marketplaces')}</Button>}</div></header>
    {section?body:<Tabs value={tab} onValueChange={value=>{onView({tab:value,section:null});setPage(null);}} className="gap-6"><TabsList variant="quiet" aria-label={t('插件目录','Plugin directory')}><TabsTrigger value="public">{t('公开','Public')}</TabsTrigger><TabsTrigger value="personal">{t('个人','Personal')}</TabsTrigger></TabsList><TabsContent value={tab}>{body}</TabsContent></Tabs>}
  </section>;
}
