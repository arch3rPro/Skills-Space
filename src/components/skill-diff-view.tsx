import { useState } from "react";
import { GitCompareArrowsIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { AlertDialog, AlertDialogContent, AlertDialogBody, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { diffLines } from "@/lib/skill-document";
import { cn } from "@/lib/utils";
import type { SkillDiff } from "@/lib/upstream";

export function SkillDiffView({data,loading,zh,onRestore}: {data:SkillDiff|null;loading:boolean;zh:boolean;onRestore?:(file:string)=>Promise<void>}) {
  const [selected,setSelected]=useState<SkillDiff['files'][number]|null>(null);
  const [restoring,setRestoring]=useState(false);
  const t=(cn:string,en:string)=>zh?cn:en;
  if(loading)return <div className="flex min-w-0 flex-col gap-3" role="status" aria-label={t("正在读取差异","Loading diff")}><Skeleton className="h-8 w-full motion-reduce:animate-none"/><Skeleton className="h-32 w-full motion-reduce:animate-none"/></div>;
  return <div className="flex min-w-0 flex-col gap-4">
    {data&&!data.files.length&&<Empty className="py-10"><EmptyHeader><EmptyMedia variant="icon"><GitCompareArrowsIcon aria-hidden="true"/></EmptyMedia><EmptyTitle>{t("无差异","No differences")}</EmptyTitle><EmptyDescription>{t("当前技能没有本地修改","This skill has no local changes")}</EmptyDescription></EmptyHeader></Empty>}
    {data?.files.map(file=><Card key={file.path} size="sm" className="min-w-0 gap-0 py-0" aria-label={file.path}>
      <CardHeader className="flex min-w-0 flex-row items-center justify-between gap-3 py-2"><CardTitle className="min-w-0 break-all font-mono text-xs">{file.path}<span className="ml-2 text-muted-foreground">{file.status==="added"?t("新增","Added"):file.status==="deleted"?t("删除","Deleted"):t("修改","Modified")}</span></CardTitle>{onRestore&&<Button size="sm" variant="ghost" disabled={restoring} onClick={()=>setSelected(file)}><RotateCcwIcon data-icon="inline-start"/>{t("恢复文件","Restore file")}</Button>}</CardHeader><CardContent className="min-w-0 px-0">
      {file.binary?<p className="p-3 text-sm text-muted-foreground">{t("二进制内容差异","Binary content differs")}</p>:<div className="min-w-0 font-mono text-xs leading-6">{diffLines(file.diff).map((line,index)=><div key={index} className={cn("grid min-w-0 grid-cols-[2.5rem_2.5rem_minmax(0,1fr)]",line.kind==="added"&&"bg-skill-update/10 text-skill-update",line.kind==="removed"&&"bg-destructive/10 text-destructive",line.kind==="hunk"&&"bg-muted/50 text-muted-foreground")}><span className="select-none pr-2 text-right text-muted-foreground" aria-hidden="true">{line.oldLine}</span><span className="select-none pr-2 text-right text-muted-foreground" aria-hidden="true">{line.newLine}</span><span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] px-2">{line.text}</span></div>)}</div>}
    </CardContent></Card>)}
    <AlertDialog open={!!selected} onOpenChange={open=>{if(!open&&!restoring)setSelected(null);}}>{selected&&<AlertDialogContent onEscapeKeyDown={event=>{if(restoring)event.preventDefault();}}><AlertDialogHeader><AlertDialogTitle>{t("恢复文件？","Restore file?")}</AlertDialogTitle><AlertDialogDescription>{selected.status==="added"?t("将移除此本地新增文件。","Remove this locally added file."):t("将恢复安装时的文件内容，丢弃此文件的本地修改。","Restore the installed source contents and discard this file's local changes.")}</AlertDialogDescription></AlertDialogHeader><AlertDialogBody className="flex flex-col gap-2"><p className="break-all font-mono text-xs">{selected.path}</p></AlertDialogBody><AlertDialogFooter><AlertDialogCancel disabled={restoring}>{t("取消","Cancel")}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={restoring} onClick={async event=>{event.preventDefault();if(!onRestore)return;setRestoring(true);try{await onRestore(selected.path);setSelected(null);}catch{setSelected(null);}finally{setRestoring(false);}}}>{restoring?t("恢复中…","Restoring…"):t("恢复文件","Restore file")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>}</AlertDialog>
  </div>;
}
