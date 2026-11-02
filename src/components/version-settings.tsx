import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { notifyError } from "@/lib/notifications";

type VersionEntry = {current:string;latest:string|null;state:"unchecked"|"current"|"available"|"unreleased"|"failed";url:string|null;error:string|null};
type Versions = {app:VersionEntry;cli:VersionEntry};

export function VersionSettings({zh,disabled}:{zh:boolean;disabled:boolean}) {
  const t=(cn:string,en:string)=>zh?cn:en;
  const [versions,setVersions]=useState<Versions|null>(null);
  const [loading,setLoading]=useState(true);
  const [checking,setChecking]=useState(false);
  useEffect(()=>{
    let active=true;
    invoke<Versions>("application_versions").then(value=>{if(active)setVersions(value);}).catch(()=>{if(active)notifyError(zh?"版本读取失败，请重新检查版本。":"Could not read versions. Check again.",zh,undefined,zh?"版本读取失败，请重新检查版本。":"Could not read versions. Check again.");}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[zh]);
  async function check() {
    if(checking||disabled)return;
    setChecking(true);
    try {
      const value=await invoke<Versions>("application_check_versions");setVersions(value);
      if(value.app.state==="failed"||value.cli.state==="failed"){
        const network=[value.app,value.cli].some(item=>item.error==="network");
        const message=network?t("版本检查失败，请检查网络后重试。","Version check failed. Check your connection and retry."):t("版本服务暂不可用，请重试。","Version service is unavailable. Try again.");
        notifyError(message,zh,undefined,message);
      }
    } catch {const message=t("版本检查失败，请重试。","Version check failed. Try again.");notifyError(message,zh,undefined,message);}
    finally {setChecking(false);}
  }
  const status=(item:VersionEntry)=>item.state==="unchecked"?t("未检查","Not checked"):item.state==="current"?t("已是最新版","Up to date"):item.state==="available"?t("有新版本","Update available"):item.state==="unreleased"?t("暂无发布版本","No published release"):t("检查失败","Check failed");
  return <Card>
    <CardHeader><CardTitle>{t("版本","Versions")}</CardTitle><CardAction><Button variant="outline" size="sm" disabled={disabled||loading||checking} onClick={()=>void check()}><RefreshCwIcon data-icon="inline-start" aria-hidden="true" className={checking?"animate-spin motion-reduce:animate-none":undefined}/>{checking?t("检查中…","Checking…"):t("检查更新","Check updates")}</Button></CardAction></CardHeader>
    <CardContent><FieldGroup>
      {(["app","cli"] as const).map(key=>{const item=versions?.[key];return <Field key={key} orientation="responsive"><FieldContent><FieldLabel>{key==="app"?"Skills Space":"skills CLI"}</FieldLabel>{loading?<Skeleton className="h-4 w-24"/>:<FieldDescription>{item?.current??"—"}{item?.state==="available"&&` → ${item.latest}`}</FieldDescription>}</FieldContent>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 text-sm text-muted-foreground" role="status">{item&&status(item)}{!loading&&!item&&t("读取失败","Could not read")}{item?.url&&<a className="underline underline-offset-4" href={item.url} onClick={event=>{event.preventDefault();const url=item.url;if(!url)return;void openUrl(url).catch(()=>{const message=t("下载页无法打开，请重试。","Could not open the download page. Try again.");notifyError(message,zh,undefined,message);});}}>{t("下载","Download")}</a>}</div>
      </Field>;})}
    </FieldGroup></CardContent>
  </Card>;
}
