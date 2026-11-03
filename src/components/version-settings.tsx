import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { BookOpenIcon, BugIcon, ChevronDownIcon, DownloadIcon, RefreshCwIcon, ScrollTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { FlowError } from "@/components/flow-error";
import { VersionValue } from "@/components/version-value";
import { Modal } from "@/components/modal";
import { SkillHtml } from "@/components/skill-markdown";
import { applicationReleaseSummary } from "@/lib/website-document";
import { notifyError, notifySuccess } from "@/lib/notifications";
import appIcon from "@/assets/icon.png";
import GithubIcon from "@lobehub/icons/es/Github";

type VersionEntry = {current:string;latest:string|null;state:"unchecked"|"current"|"available"|"unreleased"|"failed";url:string|null;error:string|null};
type Versions = {app:VersionEntry;cli:VersionEntry};
type Release = {version:string;title:string;url:string;updatedAt:string;html:string};
type ReleaseNotes = {latest:string|null;releases:Release[]};
const repository = "https://github.com/arch3rPro/Skills-Space";

export function VersionSettings({zh,disabled}:{zh:boolean;disabled:boolean}) {
  const t=(cn:string,en:string)=>zh?cn:en;
  const language=useRef(zh);
  useEffect(()=>{language.current=zh;},[zh]);
  const [versions,setVersions]=useState<Versions|null>(null);
  const [loading,setLoading]=useState(true);
  const [readFailed,setReadFailed]=useState(false);
  const [checking,setChecking]=useState(false);
  const [showHelp,setShowHelp]=useState(false);
  const [showNotes,setShowNotes]=useState(false);
  const [notes,setNotes]=useState<ReleaseNotes|null>(null);
  const [notesLoading,setNotesLoading]=useState(false);
  const [notesError,setNotesError]=useState("");
  const notesRequest=useRef(0);
  const notesPending=useRef<number|null>(null);
  const notesLatest=useRef<string|null>(null);
  const notesOpen=useRef(false);
  useEffect(()=>{
    let active=true;
    invoke<Versions>("application_versions").then(value=>{if(active)setVersions(value);})
      .catch(()=>{if(active)setReadFailed(true);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;notesRequest.current++;};
  },[]);
  async function openExternal(url:string) {
    try { await openUrl(url); }
    catch(reason) { const current=language.current;notifyError(String(reason),current,undefined,current?"链接无法打开，请重试。":"Could not open the link. Try again."); }
  }
  async function check() {
    if(checking||disabled)return;
    setChecking(true);
    try {
      const value=await invoke<Versions>("application_check_versions");setVersions(value);setReadFailed(false);
      if(value.app.state!=="failed" && (value.app.latest!==notesLatest.current || value.app.state==="unreleased"&&notesPending.current!==null)) {
        notesLatest.current=value.app.latest;notesRequest.current++;notesPending.current=null;
        setNotes(null);setNotesLoading(false);
        if(notesOpen.current)void loadNotes();
      }
      const current=language.current;
      if(value.app.state==="failed"){
        const message=current?"Skills Space 版本检查失败，请稍后重试。":"Could not check Skills Space versions. Try again later.";
        notifyError(message,current,undefined,message);
      }else{
        notifySuccess(value.app.state==="available"?(current?`发现新版本 v${value.app.latest}。`:`Version v${value.app.latest} is available.`):value.app.state==="unreleased"?(current?"暂无正式发布版本。":"No stable release has been published."):(current?"Skills Space 已是最新版。":"Skills Space is up to date."));
      }
    } catch(reason) {const current=language.current;notifyError(String(reason),current,undefined,current?"版本检查失败，请重试。":"Version check failed. Try again.");}
    finally {setChecking(false);}
  }
  async function loadNotes() {
    if(notesPending.current!==null)return;
    const id=++notesRequest.current;
    notesPending.current=id;setNotesLoading(true);setNotesError("");
    try { const value=await invoke<ReleaseNotes>("application_release_notes");if(id===notesRequest.current){notesLatest.current=value.latest;setNotes({...value,releases:value.releases.map(release=>({...release,html:applicationReleaseSummary(release.html)}))});} }
    catch(reason) {if(id===notesRequest.current)setNotesError(String(reason));}
    finally {if(notesPending.current===id)notesPending.current=null;if(id===notesRequest.current)setNotesLoading(false);}
  }
  function openNotes() {notesOpen.current=true;setShowNotes(true);if(!notes)void loadNotes();}
  const app=versions?.app,cli=versions?.cli;
  const date=(value:string)=>{const d=new Date(value);return Number.isNaN(d.getTime())?null:new Intl.DateTimeFormat(zh?"zh-CN":"en",{year:"numeric",month:"short",day:"numeric"}).format(d);};
  return <>
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <img src={appIcon} alt="" aria-hidden="true" className="size-10 shrink-0 rounded-lg"/>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-medium"><span>Skills Space</span>{loading?<VersionValue value={null} state="loading" zh={zh}/>:<span>{app&&`v${app.current}`}</span>}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{t("集中管理 AI Agent 的技能","Manage skills across AI Agents")}</span>
              {cli&&<span>skills CLI v{cli.current}</span>}
            </div>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={disabled||loading||checking} aria-busy={checking} onClick={()=>void check()}><RefreshCwIcon data-icon="inline-start" aria-hidden="true" className={checking?"animate-spin motion-reduce:animate-none":undefined}/>{t("检查更新","Check updates")}</Button>
          {app?.state==="available"&&app.url&&<Button size="sm" disabled={disabled} onClick={()=>{if(app.url)void openExternal(app.url);}}><DownloadIcon data-icon="inline-start" aria-hidden="true"/>{t("下载新版本","Download update")}</Button>}
          <Button variant="outline" size="sm" disabled={disabled} onClick={()=>setShowHelp(true)}><BookOpenIcon data-icon="inline-start" aria-hidden="true"/>{t("帮助","Help")}</Button>
          <Button variant="outline" size="sm" disabled={disabled} onClick={()=>void openExternal(`${repository}/issues/new`)}><BugIcon data-icon="inline-start" aria-hidden="true"/>{t("报告问题","Report issue")}</Button>
          <Button variant="outline" size="sm" disabled={disabled} onClick={openNotes}><ScrollTextIcon data-icon="inline-start" aria-hidden="true"/>{t("版本说明","Release notes")}</Button>
          <Button variant="outline" size="sm" disabled={disabled} onClick={()=>void openExternal(repository)}><GithubIcon data-icon="inline-start" aria-hidden="true"/>GitHub</Button>
        </div>
        {readFailed&&<p className="w-full text-sm text-destructive" role="status">{t("版本读取失败，请点击检查更新重试。","Could not read versions. Check for updates to retry.")}</p>}
      </CardContent>
    </Card>
    <Modal title={t("使用帮助","Help")} open={showHelp} onClose={()=>setShowHelp(false)}>
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h3 className="font-medium">{t("快速上手","Quick start")}</h3>
          <ol className="list-decimal pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>{t("打开技能商店，或点击「安装技能」选择 Git 仓库、本地目录或下载链接。","Browse the Skill Store, or choose Install skills to use a Git repository, local folder or download URL.")}</li>
            <li>{t("检查来源，选择技能、目标 Agent 和安装范围，确认安装。","Review the source, select skills, target Agents and scope, then confirm installation.")}</li>
            <li>{t("在技能空间或对应 Agent 页面查看和管理已安装的技能。","View and manage installed skills in Skill Space or the Agent’s page.")}</li>
          </ol>
        </section>
        {[
          [t("技能空间","Skill Space"),t("集中查看由应用管理的技能，检查更新、查看本地差异，并将技能同步到其他 Agent 或项目。","View app-managed skills, check updates and local changes, and sync skills to other Agents or projects.")],
          [t("技能商店","Skill Store"),t("浏览榜单或搜索技能，打开卡片查看介绍、安装说明和源码，再选择安装。","Browse rankings or search for skills. Open a card to read its introduction, installation instructions and source before installing.")],
          [t("全局与项目","Global and projects"),t("全局管理用户范围的技能；添加并选择项目后，管理该项目的技能与 Agent 配置。","Use Global for user-wide skills. Add and select a project to manage that project’s skills and Agent configuration.")],
          [t("Agent 原生技能","Agent-native skills"),t("查看 Agent 实际目录中的技能。根据 Agent 提供的能力，管理启用状态、自动选择、手动调用或预加载。","View skills in an Agent’s directories. Manage enabled state, automatic selection, manual invocation or preloading where supported by that Agent.")],
          [t("更新与卸载","Updates and removal"),t("检查更新后核对变更与本地修改，再确认更新。卸载前查看共享影响，选择需要移除的安装位置。","Review available updates and local changes before confirming. When removing a skill, review shared usage and select the installation locations to remove.")],
          [t("设置","Settings"),t("调整外观、语言和 Node 运行环境，在智能体设置中管理 Agent 的技能目录及相关配置。","Adjust appearance, language and the Node runtime. Use Agent settings to manage skill directories and related configuration.")],
        ].map(([title,description])=><Card key={title} size="sm"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader></Card>)}
      </div>
    </Modal>
    <Modal title={t("版本说明","Release notes")} open={showNotes} onClose={()=>{notesOpen.current=false;setShowNotes(false);}}>
      {notesLoading?<div className="flex flex-col gap-4" role="status" aria-label={t("正在读取版本说明","Reading release notes")}><Skeleton className="h-5 w-32"/><Skeleton className="h-24 w-full"/><Skeleton className="h-12 w-full"/></div>:notesError?<div className="flex flex-col items-start gap-4"><FlowError message={notesError} help={t("版本说明读取失败，请重试。","Could not read release notes. Try again.")} title={t("版本说明读取失败","Could not read release notes")} zh={zh}/><Button variant="outline" onClick={()=>void loadNotes()}>{t("重试","Retry")}</Button></div>:notes?.releases.length?<div className="flex flex-col gap-4">{notes.releases.map(release=><Collapsible key={release.url} defaultOpen={release.version===notes.latest} className="group/release min-w-0">
        <CollapsibleTrigger asChild><Button variant="ghost" className="h-auto w-full justify-start gap-3 py-3 text-left"><span className="font-medium">v{release.version}</span>{release.version===notes.latest&&<Badge variant="secondary">{t("最新","Latest")}</Badge>}{date(release.updatedAt)&&<span className="ml-auto text-xs font-normal text-muted-foreground">{date(release.updatedAt)}</span>}<ChevronDownIcon aria-hidden="true" className="shrink-0 transition-transform motion-reduce:transition-none group-data-[state=open]/release:rotate-180"/></Button></CollapsibleTrigger>
        <CollapsibleContent className="min-w-0 pt-3">{release.html?<SkillHtml html={release.html} origin="https://github.com/" zh={zh} onOpenExternal={url=>void openExternal(url)}/>:<p className="text-sm text-muted-foreground">{t("此版本暂无功能更新说明。","No feature updates were listed for this version.")}</p>}</CollapsibleContent>
      </Collapsible>)}</div>:<Empty><EmptyHeader><EmptyTitle>{t("暂无版本说明","No release notes yet")}</EmptyTitle></EmptyHeader></Empty>}
    </Modal>
  </>;
}
