import { Fragment, useEffect, useId, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { CircleArrowUpIcon, LoaderCircleIcon, ChevronDownIcon, ChevronUpIcon, ChevronRightIcon, FileTextIcon, PackageIcon, SearchCheckIcon, Trash2Icon } from 'lucide-react';
import { BackButton } from '@/components/back-button';
import { CodexSkillIcon } from '@/components/codex-skill-icon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Hint } from '@/components/hint';
import { FlowError } from '@/components/flow-error';
import { OverflowText } from '@/components/overflow-text';
import { useFeedbackError } from '@/lib/notifications';
import { displayHomePath, type InstalledSkill } from '@/lib/upstream';
import { codexPluginManagementNote, codexPluginSkillDisplay, codexPluginSkills, codexSkillDisplayName, codexSkillToggleHint, codexPluginRestriction, type CodexPlugin, type CodexPluginAction, type CodexPluginCheck, type CodexPluginDetails, type CodexSnapshot } from '@/lib/codex';

import {useLocalDirectories} from '@/hooks/use-local-directories';
import {DirectoryLink} from '@/components/directory-link';

export function CodexPluginPage({checkingUpdates=false,onOpenDirectory,plugin,check,snapshot,home,zh,disabled,onBack,onAction,onCheck,onSkill,onToggle}: {
  checkingUpdates?:boolean;onOpenDirectory:(path:string)=>void;check:CodexPluginCheck|undefined;plugin:CodexPlugin | undefined;snapshot:CodexSnapshot|null;home:string;zh:boolean;disabled:boolean;
  onBack:()=>void;onAction:(plugin:CodexPlugin,action:CodexPluginAction)=>void;
  onCheck:(plugin:CodexPlugin)=>void;onSkill:(skill:InstalledSkill)=>void;onToggle:(skill:InstalledSkill,enabled:boolean)=>void;
}) {
  const t=(cn:string,en:string)=>zh?cn:en;
  const [details,setDetails]=useState<CodexPluginDetails|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [retry,setRetry]=useState(0);
  const [expanded,setExpanded]=useState(false);
  const skillsId=useId();
  const [failedIcon,setFailedIcon]=useState<string|null>(null);
  const [,reportError]=useFeedbackError(zh);
  const location=plugin?.installed?plugin.installedPath:plugin?.sourcePath;
  const localDirectory=useLocalDirectories([location]).find(item=>item.path===location);
  const sourcePreview=!!plugin?.sourcePath && (plugin.skillInventory?.missingFromInstallation??0)>0;
  const root=sourcePreview?plugin?.sourcePath:plugin?.installed?plugin.installedPath:plugin?.sourcePath;
  const id=plugin?.id,version=plugin?.version;
  const checkedContent=check?.currentContentFingerprint;
  useEffect(()=>{
    let active=true;setDetails(null);setError(null);
    if(!root||!id||!(/^(\/|[A-Za-z]:[\\/])/.test(root))){setLoading(false);return;}
    setLoading(true);
    void invoke<CodexPluginDetails>('upstream_codex_plugin_details',{root,pluginId:id,expectedVersion:sourcePreview?version:null}).then(value=>{if(active)setDetails(value);}).catch(reason=>{if(active)setError(String(reason));}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[root,id,version,sourcePreview,checkedContent,retry]);
  if(!plugin)return <section className="flex flex-col gap-6"><BackButton label={t('返回插件列表','Back to plugins')} onClick={onBack}/><Empty><EmptyHeader><EmptyTitle>{t('插件已不在当前列表中','Plugin is no longer in this list')}</EmptyTitle></EmptyHeader></Empty></section>;
  const skills=codexPluginSkills(plugin,snapshot,details);
  const skillDisplay=codexPluginSkillDisplay(plugin,skills.length,details!==null,loading,!!error);
  const visibleSkills=expanded?skills:skills.slice(0,6);
  const info: Array<[string,string|null|undefined]> = [
    ...(!plugin.installed&&plugin.permissions?.install==='restricted'?[[t('安装条件','Installation requirements'),codexPluginRestriction(plugin.unavailableReason,zh)]] as Array<[string,string|null]>:[]),
    ...(details?.capabilities.length?[[t('功能','Features'),details.capabilities.join(' · ')] as [string,string]]:[]),
    [t('启停设置','Enabled state'),codexPluginManagementNote(plugin,zh)],
    [t('安装方式','Installation'),plugin.installPolicy==='INSTALLED_BY_DEFAULT'?t('默认提供','Provided by default'):null],
    [t('启停范围','Enabled scope'),plugin.remote?t('当前账号','Current account'):plugin.toggleScope==='project'?t('当前项目','This project'):t('用户默认','User default')],
    ...(plugin.toggleScope==='project'?[[t('项目设置','Project setting'),plugin.projectEnabled==null?t('继承设置','Inherited'):t('项目覆盖','Project override')]] as Array<[string,string|null]>:[]),
    [t('组件','Components'),plugin.components.filter(value=>value!=='skills').map(value=>value==='mcpServers'?t('工具服务','Tool servers'):value==='hooks'?t('自动化钩子','Hooks'):value==='apps'?t('应用连接','App connections'):value).join(' · ')],
    [t('类别','Category'),details?.category],[t('版本','Version'),plugin.version],
    [t('插件市场','Marketplace'),plugin.marketplace],[t('来源','Source'),plugin.sourcePath?displayHomePath(plugin.sourcePath,home):null],
  ];
  const title = <h1 className="min-w-0 break-words text-2xl font-medium tracking-tight">{plugin.name}</h1>;
  return <section className="mx-auto flex min-w-0 w-full max-w-4xl flex-col gap-6" aria-label={t('插件详情','Plugin details')}>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 basis-72 items-start gap-3">
        <BackButton disabled={disabled} label={t('返回','Back')} onClick={onBack}/>
        <CodexSkillIcon src={plugin.icon} size="lg" fallback={<PackageIcon className="size-10 text-muted-foreground" aria-hidden="true"/>}/>
        <div className="flex min-w-0 flex-col gap-1">{title}{plugin.author?<p className="text-sm text-muted-foreground">{t(`由 ${plugin.author} 提供`,`By ${plugin.author}`)}</p>:null}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {plugin.installed&&<>{plugin.canCheckUpdates&&<Hint text={check?.canUpdate?t('更新整个插件','Update entire plugin'):t('检查更新','Check for updates')} disabled={disabled||(!check?.canUpdate&&checkingUpdates)||!plugin.canCheckUpdates}><Button variant="outline" disabled={disabled||(!check?.canUpdate&&checkingUpdates)||!plugin.canCheckUpdates} aria-busy={!check?.canUpdate&&checkingUpdates} aria-label={check?.canUpdate?t('更新插件','Update plugin'):t('检查插件更新','Check plugin updates')} onClick={()=>onCheck(plugin)}><>{checkingUpdates&&!check?.canUpdate?<LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none"/>:check?.canUpdate?<CircleArrowUpIcon className="text-skill-update" aria-hidden="true"/>:<SearchCheckIcon aria-hidden="true"/>}</>{check?.canUpdate?t('更新','Update'):t('检查更新','Check for updates')}</Button></Hint>}{plugin.canUninstall&&<Hint text={codexPluginRestriction(plugin.uninstallReason??plugin.unavailableReason,zh)??undefined} disabled={disabled||!plugin.canUninstall}><Button variant="outline" disabled={disabled||!plugin.canUninstall} onClick={()=>onAction(plugin,'uninstall')}><Trash2Icon aria-hidden="true"/>{t('卸载','Uninstall')}</Button></Hint>}</>}
        {plugin.toggleScope==='project'&&plugin.projectEnabled!=null&&plugin.canToggle&&<Button variant="outline" disabled={disabled} onClick={()=>onAction(plugin,'reset')}>{t('恢复继承设置','Restore inherited settings')}</Button>}
        {!plugin.installed&&plugin.installationKnown&&plugin.canInstall&&<Hint text={codexPluginRestriction(plugin.unavailableReason,zh)??undefined} disabled={disabled||!plugin.canInstall}><Button disabled={disabled||!plugin.canInstall} onClick={()=>onAction(plugin,'install')}>{t('安装','Install')}</Button></Hint>}
      </div>
    </header>
    {error&&<div className="flex flex-col items-start gap-3"><FlowError message={error} help={t('未能读取插件信息，请重试。','Could not read plugin information. Retry.')} zh={zh}/><Button variant="outline" disabled={disabled} onClick={()=>setRetry(value=>value+1)}>{t('重试','Retry')}</Button></div>}
    {(details?.description||plugin.description)&&<p className="whitespace-pre-wrap break-words text-sm leading-6">{details?.description||plugin.description}</p>}
    {!!details?.examples.length&&<section aria-label={t('示例','Examples')} className="relative isolate overflow-hidden rounded-xl bg-muted p-6 sm:p-8">
      {plugin.icon&&failedIcon!==plugin.icon&&<img src={plugin.icon} alt="" width={640} height={240} aria-hidden="true" onError={()=>setFailedIcon(plugin.icon??null)} className="pointer-events-none absolute inset-0 -z-10 size-full scale-125 object-cover opacity-40 blur-3xl"/>}
      <div aria-hidden="true" onError={()=>setFailedIcon(plugin.icon??null)} className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-br from-primary/15 via-transparent to-primary/20"/>
      <ul className="mx-auto flex max-w-xl flex-col items-start gap-3 text-sm">{details.examples.map((example,index)=><li key={index} className="max-w-full whitespace-pre-wrap break-words rounded-2xl bg-background/90 px-3 py-2 text-foreground">
        <span className="mr-1 inline-flex items-center gap-1 align-middle font-medium"><CodexSkillIcon src={plugin.icon} fallback={<PackageIcon className="size-4" aria-hidden="true"/>}/>{plugin.name}</span>{example}
      </li>)}</ul>
    </section>}
    {skillDisplay.show&&<Card><CardHeader><CardTitle><h2>{t('技能','Skills')} {skillDisplay.count!==null&&<span className="text-muted-foreground tabular-nums">{skillDisplay.count}</span>}</h2></CardTitle></CardHeader><CardContent className="flex min-w-0 flex-col gap-2">
      {skillDisplay.state==='unread'&&!skills.length&&<p className="text-sm text-muted-foreground">{t('尚未取得技能内容','Skill content is not available yet')}</p>}
      <div id={skillsId} className="flex min-w-0 flex-col gap-1">
      {loading&&!skills.length?<Skeleton className="h-16 w-full"/>:visibleSkills.map(skill=><div key={skill.path} className="flex min-w-0 items-center gap-3 rounded-lg px-3 py-3 hover:bg-muted focus-within:bg-muted">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 self-stretch rounded-lg text-left outline-none focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-50" disabled={disabled} aria-label={`${t('查看技能','View skill')} ${codexSkillDisplayName(skill)}`} onClick={()=>onSkill(skill)}>
          <CodexSkillIcon src={skill.codexState?.icon} fallback={<FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/>}/>
          <span className="flex min-w-0 flex-1 flex-col gap-1"><span className="truncate text-sm font-medium">{codexSkillDisplayName(skill)}</span><OverflowText text={skill.description} className="line-clamp-2 text-xs font-normal text-muted-foreground"/></span>
        </button>
        {plugin.installed&&skill.codexState?.enabled!=null&&(skill.codexState.canToggle?<Hint stable text={codexSkillToggleHint(skill.codexState,snapshot?.plugins??[],zh)} disabled={disabled||!skill.codexState.canToggle}><Switch checked={skill.codexState.enabled} disabled={disabled||!skill.codexState.canToggle} aria-label={`${t('启用技能','Enable skill')} ${codexSkillDisplayName(skill)}`} onCheckedChange={value=>onToggle(skill,value)}/></Hint>:<span className="shrink-0 text-xs text-muted-foreground">{skill.codexState.enabled?t("已启用","Enabled"):t("已停用","Disabled")}</span>)}<Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={`${t('查看技能详情','View skill details')} ${codexSkillDisplayName(skill)}`} onClick={()=>onSkill(skill)}><ChevronRightIcon aria-hidden="true"/></Button>
      </div>)}
      </div>
      {skills.length>6&&<Button variant="ghost" className="self-start" disabled={disabled} aria-expanded={expanded} aria-controls={skillsId} onClick={()=>setExpanded(value=>!value)}>{expanded?<ChevronUpIcon aria-hidden="true"/>:<ChevronDownIcon aria-hidden="true"/>}{expanded?t('收起','Show less'):t(`展开其余 ${skills.length-6} 个技能`,`Show ${skills.length-6} more skills`)}</Button>}
    </CardContent></Card>}
    {(localDirectory||info.some(([,value])=>value)||details?.website||loading)&&<Card><CardHeader><CardTitle><h2>{t('关于','About')}</h2></CardTitle></CardHeader><CardContent>{loading?<Skeleton className="h-16 w-full"/>:<dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 text-sm">{localDirectory&&<><dt className="text-muted-foreground">{t('位置','Location')}</dt><dd className="min-w-0"><DirectoryLink path={localDirectory.path} directory={localDirectory.directory} home={home} zh={zh} disabled={disabled} onOpen={onOpenDirectory}/></dd></>}{info.filter(([,value])=>value).map(([label,value])=><Fragment key={label}><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words [overflow-wrap:anywhere]">{value}</dd></Fragment>)}{details?.website&&<><dt className="text-muted-foreground">{t('网站','Website')}</dt><dd className="min-w-0 break-all"><a href={details.website} className="underline underline-offset-4" onClick={event=>{event.preventDefault();void openUrl(details.website!).catch(reason=>reportError(String(reason),t('无法打开网站。','Could not open the website.')));}}>{details.website}</a></dd></>}</dl>}</CardContent></Card>}
  </section>;
}
