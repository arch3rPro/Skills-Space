import {ExternalLinkIcon,LoaderCircleIcon} from 'lucide-react';
import {Modal,ModalActions} from '@/components/modal';
import {Button} from '@/components/ui/button';
import {FlowError} from '@/components/flow-error';
import type {CodexAuthorization} from '@/hooks/use-codex-authorization';

export function CodexAuthorizationDialog({authorization,zh,onStart,onCancel}:{authorization:CodexAuthorization|null;zh:boolean;onStart:()=>void;onCancel:()=>void}){
  const t=(cn:string,en:string)=>zh?cn:en;
  if(!authorization)return null;
  const {pending,phase,error}=authorization;
  const action=pending.kind==='directory'?t('浏览官方插件','Browse official plugins'):pending.action==='enable'?t('启用','Enable'):pending.action==='disable'?t('停用','Disable'):pending.action==='install'?t('安装','Install'):t('卸载','Uninstall');
  const waiting=phase==='waiting',starting=phase==='starting';
  return <Modal compact open title={waiting?t('等待授权','Waiting for authorization'):t('授权 Codex 账号','Authorize your Codex account')} description={t('独立授权后会安全保持登录，不读取 Codex 现有登录凭据。','Sign in separately and stay signed in securely. Existing Codex credentials are not accessed.')} onClose={onCancel}>
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1"><p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{action}{pending.kind==='plugin'&&<>{zh?'：':': '}{pending.plugins.map(p=>p.name).join('、')}</>}</p><p className="text-sm text-muted-foreground">{pending.kind==='directory'?t('读取官方插件目录，选择插件后再确认安装。','Browse the official directory and confirm installation after choosing a plugin.'):t('影响授权账号的插件设置，以及使用同一账号的其他客户端。','Affects plugin settings for the authorized account and other clients using it.')}</p></div>
      {waiting&&<p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><LoaderCircleIcon aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none"/>{t('请在浏览器中完成授权，完成后将继续本次操作。','Complete authorization in your browser to continue this action.')}</p>}
      {error&&<FlowError zh={zh} message={error} help={t('授权未完成，请重试。','Authorization was not completed. Retry.')}/>}
    </div>
    <ModalActions><Button variant="outline" onClick={onCancel}>{t('取消','Cancel')}</Button>{!waiting&&<Button disabled={starting} onClick={onStart}>{starting?<LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none"/>:<ExternalLinkIcon aria-hidden="true"/>}{starting?t('打开授权页…','Opening authorization…'):phase==='failed'?t('重新授权','Retry authorization'):t('授权并继续','Authorize and continue')}</Button>}</ModalActions>
  </Modal>;
}
