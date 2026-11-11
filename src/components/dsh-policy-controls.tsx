import { SparklesIcon, HandIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Hint } from '@/components/hint';
import { dshInvocationChannels, type DshSkillState, type DshPolicyAction } from '@/lib/dsh';

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
