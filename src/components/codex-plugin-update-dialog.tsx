import type { CodexPlugin, CodexPluginCheck } from '@/lib/codex';
import { ArrowRightIcon, PackageIcon } from 'lucide-react';
import { CodexSkillIcon } from '@/components/codex-skill-icon';
import { codexCheckLabel } from '@/lib/codex';
import { displayHomePath } from '@/lib/upstream';
import { shortSkillVersion } from '@/lib/skill-document';
import { Hint } from '@/components/hint';
import { FlowError } from '@/components/flow-error';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogBody, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
export function CodexPluginUpdateDialog({review,busy,zh,home,onClose,onApply}:{
  review:{plugin:CodexPlugin;check:CodexPluginCheck;error?:string}|null;busy:boolean;zh:boolean;home:string;onClose:()=>void;onApply:()=>void;
}) {
  const t=(cn:string,en:string)=>zh?cn:en;
  if(!review)return null;
  const {plugin,check}=review;
  const versionChanged=!!check.candidateVersion&&check.candidateVersion!==check.installedVersion;
  const oldRevision=versionChanged?check.installedVersion:shortSkillVersion(check.currentContentFingerprint);
  const newRevision=versionChanged?check.candidateVersion:shortSkillVersion(check.candidateContentFingerprint);
  const action=review.error?t('重新检查','Check again'):check.recovery?t('恢复配置','Recover configuration'):t('更新 1 个插件','Update 1 plugin');
  return <AlertDialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><AlertDialogContent aria-busy={busy} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}}>
    <AlertDialogHeader><AlertDialogTitle>{check.recovery?t('恢复插件配置','Recover plugin configuration'):t('更新 1 个插件？','Update 1 plugin?')}</AlertDialogTitle><AlertDialogDescription>{check.recovery?t('恢复上次更新前的插件启停状态及技能路径规则，不重复安装。','Restore the saved plugin state and skill path rules without reinstalling.'):t('更新整个插件，可能覆盖本地改动，影响所有使用它的项目。插件与技能启停设置会保留。','Update the entire plugin for all projects using it. Local edits may be overwritten; plugin and skill enabled settings are preserved.')}</AlertDialogDescription></AlertDialogHeader>
    <AlertDialogBody className="flex flex-col gap-4">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 text-sm">
        <div className="flex min-w-0 items-center gap-2"><CodexSkillIcon src={plugin.icon} fallback={<PackageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/>}/><span className="min-w-0 break-words font-medium">{plugin.name}</span></div>
        <span className="max-w-24 break-all font-mono text-xs text-muted-foreground tabular-nums">{oldRevision||check.installedVersion}</span>
        {!check.recovery&&<><ArrowRightIcon className="size-3.5 text-muted-foreground" aria-label={t('更新至','Update to')}/><span className="max-w-24 break-all font-mono text-xs tabular-nums">{newRevision}</span></>}
      </div>
      <details className="group min-w-0 text-sm"><summary className="w-fit cursor-pointer rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{t('更新详情','Update details')}</summary>
        <dl className="mt-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
          {([[t('当前内容','Current content'),check.currentContentFingerprint],[t('来源内容','Source content'),check.candidateContentFingerprint]] as const).filter(([,value])=>value).map(([label,value])=><div key={label} className="col-span-2 grid min-w-0 grid-cols-subgrid"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0"><Hint text={value??undefined} focusable><span className="font-mono text-xs">{shortSkillVersion(value)}</span></Hint></dd></div>)}
          <dt className="text-muted-foreground">{t('来源','Source')}</dt><dd className="min-w-0 break-words text-xs [overflow-wrap:anywhere]">{displayHomePath(check.sourcePath,home)}</dd>
        </dl>
      </details>
      {!check.canUpdate&&<p className="text-sm text-muted-foreground">{codexCheckLabel(check,zh)}</p>}
      {!check.recovery&&check.unmappedRules.length>0&&<div className="flex min-w-0 flex-col gap-2 text-sm"><p>{t('以下技能无法自动对应，更新后保留原路径规则。','These skills cannot be matched automatically. Their original path rules will be preserved.')}</p><ul className="flex flex-col gap-1 text-muted-foreground">{check.unmappedRules.map(path=><li key={path} className="break-all">{displayHomePath(path,home)}</li>)}</ul></div>}
      {review.error&&<FlowError message={review.error} help={t("请重新检查插件状态。","Check the plugin state again.")} zh={zh}/>}
    </AlertDialogBody>
    <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('取消','Cancel')}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event=>{event.preventDefault();if(!check.canUpdate&&!review.error)onClose();else onApply();}}>{busy?t('处理中…','Working…'):!check.canUpdate&&!review.error?t('完成','Done'):action}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>;
}
