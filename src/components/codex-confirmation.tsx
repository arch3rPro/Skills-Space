import { FlowError } from '@/components/flow-error';
import type { CodexPending } from '@/lib/codex';
import { codexAppManagedPlugin, codexSkillDisplayName } from '@/lib/codex';
import { displayHomePath } from '@/lib/upstream';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogBody, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
export function CodexConfirmation({ pending, busy, zh, home, error, onClose, onApply }: { error?:string|null; pending: CodexPending | null; busy: boolean; zh: boolean; home: string; onClose: () => void; onApply: () => void }) {
  const t = (cn: string, en: string) => zh ? cn : en;
  if (!pending) return null;
  const label = pending.kind === 'plugin' ? pending.action === 'install' ? t('安装插件', 'Install plugin') : pending.action === 'uninstall' ? t('卸载插件', 'Uninstall plugin') : pending.action === 'reset' ? t('恢复继承设置','Restore inherited settings') : pending.action === 'enable' ? t('启用插件', 'Enable plugin') : t('停用插件', 'Disable plugin') : pending.enabled ? t('启用技能', 'Enable skills') : t('停用技能', 'Disable skills');
  const count = pending.kind === 'plugin' ? pending.plugins.length : pending.skills.length;
  const actionLabel=count>1?`${label} (${count})`:label;
  const impact=pending.kind!=='plugin'?t('影响使用该技能的项目。运行中的会话可能需要重新开启。','Affects projects using these skills. Existing sessions may need to be reopened.'):
    [...new Set(pending.plugins.map(plugin=>plugin.remote?'account':plugin.toggleScope==='project'?'project':'user'))].map(scope=>
      scope==='account'?t('更改当前 Codex 账号的插件状态，影响使用同一账号的客户端。','Changes plugin state for the current Codex account across clients using it.'):
      scope==='project'?(pending.action==='reset'?t('移除当前项目的显式启停设置，按继承配置生效。','Remove this project’s explicit enabled setting and use the inherited configuration.'):t('仅更改当前项目的插件启停覆盖。运行中的会话可能需要重新开启。','Change the enabled override for this project only. Existing sessions may need to be reopened.')):
      pending.action==='install'?t('安装所选插件及其组件，供当前用户的项目使用。','Install the selected plugins and their components for the current user’s projects.'):
      pending.action==='uninstall'?t('卸载所选插件及其组件，保留插件来源。使用此插件的项目将无法继续加载它。','Uninstall the selected plugins and their components, keeping their sources. Projects using them will no longer be able to load them.'):
      t('更改插件的用户默认启停设置；项目内的覆盖设置仍然生效。运行中的会话可能需要重新开启。','Change the user’s default enabled setting. Project overrides remain effective. Existing sessions may need to be reopened.')
    ).join(' ')+(pending.action==='uninstall'&&pending.plugins.some(codexAppManagedPlugin)?t(' 此插件由应用维护，后续启动或资源同步时可能重新安装。',' This plugin is maintained by the app and may be reinstalled during startup or resource sync.'):'');

  return <AlertDialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><AlertDialogContent size={count > 1 ? 'wide' : 'default'} aria-busy={busy} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}><AlertDialogHeader><AlertDialogTitle>{actionLabel}</AlertDialogTitle><AlertDialogDescription>{impact}</AlertDialogDescription></AlertDialogHeader><AlertDialogBody><div className="flex flex-col gap-3">
    {pending.kind === 'skills' ? pending.skills.map(skill => <div key={skill.codexState?.documentPath} className="flex min-w-0 flex-col gap-1"><p className="break-words text-sm font-medium">{codexSkillDisplayName(skill)}</p><p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{displayHomePath(skill.codexState?.documentPath ?? skill.path, home)}</p></div>) : pending.plugins.map(plugin => <div key={plugin.id} className="flex min-w-0 flex-col gap-1"><p className="break-words text-sm font-medium">{plugin.name}</p>{pending.action === 'install' && plugin.sourcePath && <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{displayHomePath(plugin.sourcePath,home)}</p>}</div>)}
  {error&&<FlowError message={error} help={t('请确认插件状态后重试。','Check plugin state and retry.')} zh={zh}/>}</div></AlertDialogBody><AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('取消', 'Cancel')}</AlertDialogCancel><AlertDialogAction variant={pending.kind === 'plugin' && pending.action === 'uninstall' ? 'destructive' : 'default'} disabled={busy} onClick={event => { event.preventDefault(); onApply(); }}>{busy ? t('处理中…', 'Working…') : error?t('重试','Retry'):actionLabel}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
