import { SparklesIcon, HandIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Hint } from '@/components/hint';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FlowError } from '@/components/flow-error';
import { displayHomePath } from '@/lib/upstream';
import { dshInvocationChannels, dshPolicyNoticeRequired, type DshSkillState, type DshSnapshot, type DshPolicyAction } from '@/lib/dsh';

function blocker(state:DshSkillState,zh:boolean){return state.policyBlocker==='error'?(zh?'技能设置无法读取，请检查设置文件':'Skill settings could not be read; check the settings file'):state.policyBlocker==='unavailable'?(zh?'当前配置无法使用启停和调用设置':'Enablement and invocation settings are unavailable for this configuration'):state.policyBlocker==='needs-setup'?(zh?'请先安装并启用 DSH 配套插件':'Install and enable the DSH companion plugin first'):(zh?'安装配套插件后可设置':'Install the companion plugin to configure');}

type Props={state:DshSkillState;name:string;disabled:boolean;project?:boolean;zh:boolean;onChange:(action:DshPolicyAction)=>void};
export function DshPolicySwitch({state,name,disabled,project,zh,onChange}:Props){
  const enabled=state.policyEnabled??(state.modelInvocable||state.userInvocable);
  const forbidden=state.sourceModelInvocable===false&&state.sourceUserInvocable===false;
  const unavailable=disabled||!state.canSetPolicy||forbidden;
  const hint=!state.canSetPolicy?blocker(state,zh):forbidden?(zh?'技能文件禁止所有调用，请在源文件中修改':'The skill file forbids all invocation; edit the source to change it'):enabled?(zh?'已启用':'Enabled'):(zh?'已停用':'Disabled');
  return <Hint stable text={hint+(project&&state.canSetPolicy?(zh?'；使用同一文件的其他配置和项目也会同步改变':'; other configurations and projects using this file share the change'):'')} disabled={unavailable}><Switch checked={enabled} disabled={unavailable} aria-label={`${zh?'启用技能':'Enable skill'} ${name}`} onCheckedChange={value=>onChange(value?'enable':'disable')}/></Hint>;
}
export function DshPolicyChannels({state,name,disabled,project,zh,onChange}:Props){
  const enabled=state.policyEnabled??(state.modelInvocable||state.userInvocable);
  return <>{dshInvocationChannels.map(option=>{
    const channel=option.value;
    const model=channel==='model',allowed=model?state.modelInvocable:state.userInvocable,sourceAllowed=model?state.sourceModelInvocable:state.sourceUserInvocable;
    const label=zh?option.zh:option.en;
    const unavailable=disabled||!state.canSetPolicy||!enabled||sourceAllowed===false;
    const hint=sourceAllowed===false?(zh?`${label}：技能文件禁止此入口`:`${label}: forbidden by the skill file`):!state.canSetPolicy?blocker(state,zh):!enabled?(zh?'先启用技能':'Enable this skill first'):`${label} · ${allowed?(zh?'已开启':'On'):(zh?'已关闭':'Off')}`;
    const Icon=model?SparklesIcon:HandIcon;
    return <Hint key={channel} stable text={hint+(project&&state.canSetPolicy?(zh?'；使用同一文件的其他配置和项目也会同步改变':'; other configurations and projects using this file share the change'):'')} disabled={unavailable}><Button variant="ghost" size="icon-sm" className={allowed?undefined:'text-muted-foreground opacity-50'} disabled={unavailable} aria-label={`${name} · ${label}`} aria-pressed={allowed} onClick={()=>onChange(`${channel}-${allowed?'off':'on'}`)}><Icon aria-hidden="true"/></Button></Hint>;
  })}</>;
}
export function DshPolicyNotice({policy,disabled,zh,home,onInstall,onOpenDirectory,onRefresh}:{policy:DshSnapshot['policy'];disabled:boolean;zh:boolean;home:string;onInstall:()=>void;onOpenDirectory:(path:string)=>void;onRefresh:()=>void}){
  if(!policy||!dshPolicyNoticeRequired(policy))return null;
  const t=(cn:string,en:string)=>zh?cn:en;
  const install=policy.canInstall&&['not-installed','needs-setup'].includes(policy.status);
  const conflicts=policy.migrationConflicts??[];
  const affected=(policy.configurations??[]).filter(item=>item.status===policy.status&&(policy.status!=='pending'||item.pendingReason==='reload'&&item.running!==false));
  const paths=affected.length?affected.map(item=>item.path):[policy.configuration??policy.problemPath??policy.policyFile];
  const actions=<div className="flex flex-wrap items-center gap-2">
    {install&&<Button size="sm" variant="outline" disabled={disabled} onClick={onInstall}>{t('安装并启用','Install and enable')}</Button>}
    {policy.problemPath&&<Button size="sm" variant="outline" disabled={disabled} onClick={()=>onOpenDirectory(policy.problemPath!)}>{t('打开设置目录','Open settings folder')}</Button>}
    {policy.status==='unavailable'&&paths.map(path=><Button key={path} size="sm" variant="outline" disabled={disabled} onClick={()=>onOpenDirectory(path)}>{t('打开配置目录','Open configuration folder')} · {displayHomePath(path,home)}</Button>)}
    <Button size="sm" variant="outline" disabled={disabled} onClick={onRefresh}>{t('刷新','Refresh')}</Button>
  </div>;
  if(policy.status==='error'||policy.status==='unavailable'){
    const errorPaths=[...new Set([...paths,policy.problemPath,policy.policyFile,...affected.flatMap(item=>[item.problemPath,item.policyFile])].filter((path):path is string=>!!path))];
    const details=[...errorPaths.map(path=>displayHomePath(path,home)),...affected.map(item=>item.issue?`${displayHomePath(item.path,home)}: ${item.issue}`:null),policy.issue,...conflicts.map(item=>`${item.name}: ${displayHomePath(item.file,home)}`)].filter(Boolean).join('\n');
    return <div className="flex flex-col gap-3">{paths.map(path=><p key={path} className="break-all font-mono text-xs">{displayHomePath(path,home)}</p>)}<FlowError zh={zh} title={t('DSH 技能设置不可用','DSH skill settings unavailable')} help={conflicts.length?t('同一技能存在不同的旧设置，请查看错误详情，处理后刷新。','A skill has conflicting previous settings. Review the error details, resolve the conflict and refresh.'):t('请查看错误详情，检查对应配置和设置文件后刷新。','Review the error details, check the affected configuration and settings file, then refresh.')} message={details}/>{actions}</div>;
  }
  const text=policy.status==='pending'?t('请重启 DSH，使技能设置生效。','Restart DSH to apply skill settings.'):t('安装 DSH 配套插件后，可管理技能启停和调用方式。','Install the DSH companion plugin to manage skill enablement and invocation.');
  return <Alert><AlertDescription><p>{text}</p>{paths.map(path=><p key={path} className="break-all font-mono text-xs">{displayHomePath(path,home)}</p>)}{actions}</AlertDescription></Alert>;
}
