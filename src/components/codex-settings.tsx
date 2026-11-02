import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { CircleHelpIcon, RefreshCwIcon } from 'lucide-react';
import { CodexAccountConnection } from '@/components/codex-account-connection';
import { BackButton } from '@/components/back-button';
import { AgentLogo } from '@/components/agent-logo';
import { Choice } from '@/components/choice';
import { HelpPopover } from '@/components/help-popover';
import { Hint } from '@/components/hint';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardAction, CardContent } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyTitle, EmptyContent } from '@/components/ui/empty';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { notifySuccess, useFeedbackError } from '@/lib/notifications';
import { displayHomePath } from '@/lib/upstream';
import { codexDefaultsDraft, codexDefaultsDirty, codexDefaultsChanges, type CodexDefaultKey, type CodexDefaults } from '@/lib/codex-defaults';
export type CodexSettingsHandle = { requestLeave: (action: () => void) => void };
type Props = {ref?: Ref<CodexSettingsHandle>; zh: boolean; home: string; disabled: boolean; onBack: () => void; onBusy: (busy: boolean) => void; onSaved: () => void};
export function CodexSettings({ref,zh,home,disabled,onBack,onBusy,onSaved}: Props) {
  const t = (cn:string,en:string) => zh ? cn : en;
  const [snapshot,setSnapshot] = useState<CodexDefaults|null>(null);
  const [draft,setDraft] = useState(codexDefaultsDraft);
  const [loading,setLoading] = useState(true), [saving,setSaving] = useState(false);
  const [submitted,setSubmitted] = useState(false), [confirmLeave,setConfirmLeave] = useState(false);
  const [,setError] = useFeedbackError(zh);
  const pending = useRef<(() => void)|null>(null), allowClose = useRef(false), generation = useRef(0);
  const dirty = codexDefaultsDirty(snapshot,draft);
  const locked = disabled || loading || saving;
  const writable = snapshot?.writable === true;
  const [budgetError,setBudgetError] = useState(false);
  function accept(value: CodexDefaults) { setSnapshot(value);setDraft(codexDefaultsDraft(value));setSubmitted(false);setBudgetError(false); }
  async function load() {
    const id = ++generation.current;setLoading(true);
    try { const value = await invoke<CodexDefaults>('upstream_codex_defaults');if(id===generation.current)accept(value); }
    catch(error) { if(id===generation.current){setSnapshot(previous=>previous?{...previous,writable:false}:null);setError(String(error),t('读取 Codex 设置失败，请重新读取。','Could not read Codex settings. Reload them.'));} }
    finally { if(id===generation.current)setLoading(false); }
  }
  useEffect(()=>{void load();return()=>{++generation.current;};},[]);
  async function save() {
    if(!snapshot || !writable || saving)return false;
    setSubmitted(true);
    let changes;
    try { changes=codexDefaultsChanges(snapshot,draft); }
    catch { setBudgetError(true);return false; }
    if(!changes.length)return true;
    setSaving(true);onBusy(true);
    try { accept(await invoke<CodexDefaults>('upstream_codex_save_defaults',{request:{revision:snapshot.revision,changes}}));notifySuccess(t('已保存','Saved'));onSaved();return true; }
    catch(error) { setError(String(error),t('无法确认设置是否保存成功，修改已保留。','Could not confirm that settings were saved. Your changes are retained.'));return false; }
    finally {setSaving(false);onBusy(false);}
  }
  function requestLeave(action: () => void) { if(saving)return;if(!dirty){action();return;}if(!pending.current){pending.current=action;setConfirmLeave(true);} }
  useImperativeHandle(ref,()=>({requestLeave}));
  function cancelLeave(){pending.current=null;setConfirmLeave(false);}
  function finishLeave(){const action=pending.current;cancelLeave();action?.();}
  const closeRequested = useEffectEvent((event:{preventDefault:()=>void})=>{
    if(allowClose.current || !dirty&&!saving)return;
    event.preventDefault();requestLeave(()=>{allowClose.current=true;void getCurrentWindow().destroy().catch(error=>{allowClose.current=false;setError(String(error),t('无法关闭窗口，请再次关闭。','Could not close the window. Try closing it again.'));});});
  });
  useEffect(()=>{let disposed=false;let stop:(()=>void)|undefined;void getCurrentWindow().onCloseRequested(closeRequested).then(value=>{if(disposed)value();else stop=value;}).catch(error=>setError(String(error),t('关闭确认不可用，请先保存修改。','Close confirmation is unavailable. Save your changes first.')));return()=>{disposed=true;stop?.();};},[]);
  useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>event.preventDefault();window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function patch(key:CodexDefaultKey,value:string){setDraft(current=>({...current,[key]:value}));if(key==='skillCatalogTokens')setBudgetError(false);}
  const inherited={value:'inherit',label:t('跟随 Codex','Follow Codex')};
  const booleanOptions=[inherited,{value:'true',label:t('允许','Allow')},{value:'false',label:t('不允许','Do not allow')}];
  function setting(key:CodexDefaultKey,label:string,description:string,options=booleanOptions,help?:string){
    return <Field key={key} orientation="horizontal">
      <FieldContent>
        <div className="flex items-center gap-1"><FieldLabel htmlFor={`codex-${key}`}>{label}</FieldLabel>{help&&<Hint text={help}><Button variant="ghost" size="icon-xs" aria-label={t(`${label}说明`,`${label} help`)}><CircleHelpIcon aria-hidden="true"/></Button></Hint>}</div>
        <FieldDescription>{description}</FieldDescription>
        {snapshot?.fields[key].overridden&&<FieldDescription>{t('当前使用其他配置指定的值。','Another configuration determines the current value.')}</FieldDescription>}
      </FieldContent>
      <Choice id={`codex-${key}`} className="w-48 shrink-0" label={label} value={draft[key]} options={options} disabled={locked||!writable} onChange={value=>patch(key,value)}/>
    </Field>;
  }
  function reset(keys:CodexDefaultKey[]){setDraft(current=>{const next={...current};for(const key of keys)next[key]='inherit';return next;});setBudgetError(false);}
  const skillKeys:CodexDefaultKey[]=['skillDependencies','bundledSkills','skillCatalogTokens','pluginsEnabled'];
  const appKeys:CodexDefaultKey[]=['appsEnabled','appsApproval','appsReviewer','appsDestructive','appsOpenWorld'];
  function groupTitle(title:string,keys:CodexDefaultKey[]){return <CardHeader><CardTitle>{title}</CardTitle><CardAction><Button variant="ghost" size="sm" disabled={locked||!writable||keys.every(key=>draft[key]==='inherit')} onClick={()=>reset(keys)}>{t('恢复默认','Restore defaults')}</Button></CardAction></CardHeader>;}
  const rulesText=snapshot?.rules.map(rule=>{
    const selector=[typeof rule.name==='string'?rule.name:'',typeof rule.path==='string'?displayHomePath(rule.path,home):''].filter(Boolean).join(' · ')||t('其他规则','Other rule');
    const state=rule.enabled===true?t('启用','Enabled'):rule.enabled===false?t('停用','Disabled'):t('未指定','Unspecified');
    return `${state}  ${selector}`;
  }).join('\n')??'';
  return <section aria-label={t('Codex 设置','Codex settings')} className="flex flex-col gap-5">
    <div className="flex items-center gap-3">
      <BackButton label={t('返回智能体列表','Back to Agents')} disabled={saving} onClick={()=>requestLeave(onBack)}/>
      <span className="flex items-center gap-2 font-semibold"><AgentLogo name="codex" size={22}/>{t('Codex 设置','Codex settings')}</span>
      <HelpPopover label={t('默认设置说明','About these defaults')}>
        <p>{t('此处设置 Codex 用户默认值，项目或单项配置可能覆盖它。','Sets Codex user defaults. Project or individual settings may override them.')}</p>
        <p>{t('选择“跟随 Codex”会撤销个人设置。更改在 Codex 重新加载配置后生效。','Following Codex removes your override. Changes apply when Codex reloads its configuration.')}</p>
        {snapshot&&<p>{t('配置位置：','Configuration: ')}<code className="break-all">{displayHomePath(snapshot.configPath,home)}</code></p>}
      </HelpPopover>
      <Hint text={t('重新读取','Reload')} disabled={locked}><Button className="ml-auto" variant="outline" size="icon-sm" disabled={locked} aria-label={t('重新读取 Codex 设置','Reload Codex settings')} onClick={()=>requestLeave(()=>void load())}><RefreshCwIcon aria-hidden="true"/></Button></Hint>
    </div>
    <CodexAccountConnection zh={zh} disabled={locked} onBusy={onBusy} onSaved={onSaved}/>
    {loading&&!snapshot?<Skeleton className="h-40 w-full"/>:!snapshot?<Empty><EmptyHeader><EmptyTitle>{t('无法读取 Codex 设置','Codex settings unavailable')}</EmptyTitle></EmptyHeader><EmptyContent><Button variant="outline" onClick={()=>void load()}>{t('重新读取','Reload')}</Button></EmptyContent></Empty>:<>
      {!writable&&<FieldError>{t('当前设置为只读。','These settings are read-only.')}</FieldError>}
      <Card>{groupTitle(t('技能与插件','Skills and plugins'),skillKeys)}<CardContent><FieldGroup className="settings-fields">
        {setting('skillDependencies',t('安装技能依赖','Skill dependencies'),t('技能缺少所需工具时，提示安装。','Offer to install tools required by a skill.'))}
        {setting('bundledSkills',t('内置技能','Bundled skills'),t('加载 Codex 自带的技能。','Load the skills included with Codex.'),[inherited,{value:'true',label:t('启用','Enabled')},{value:'false',label:t('停用','Disabled')}])}
        <Field orientation="horizontal" data-invalid={submitted&&budgetError}>
          <FieldContent>
            <div className="flex items-center gap-1"><FieldLabel htmlFor={draft.skillCatalogTokens==='inherit'?'codex-skill-budget-mode':'codex-skill-budget'}>{t('技能介绍长度','Skill introduction budget')}</FieldLabel><HelpPopover label={t('技能介绍长度说明','Skill introduction budget help')}><p>{t('按 token 计算。上限较小时，Codex 可能缩短技能介绍或省略部分技能。使用技能时仍会读取完整内容。','Measured in tokens. A lower budget can shorten descriptions or omit skills from the initial catalog. Selected skills are still read in full.')}</p></HelpPopover></div>
            <FieldDescription>{t('限制对话开始时提供给模型的技能介绍。','Limit the skill information provided at the start of a conversation.')}</FieldDescription>
            {submitted&&budgetError&&<FieldError id="codex-skill-budget-error">{t('请输入 1–10000 的整数。','Enter a whole number from 1 to 10000.')}</FieldError>}
          </FieldContent>
          <div className="flex shrink-0 flex-col gap-2">
            <Choice id="codex-skill-budget-mode" className="w-48" label={t('技能介绍长度','Skill introduction budget')} value={draft.skillCatalogTokens==='inherit'?'inherit':'custom'} options={[inherited,{value:'custom',label:t('自定义','Custom')}]} disabled={locked||!writable} onChange={value=>patch('skillCatalogTokens',value==='inherit'?'inherit':'')}/>
            {draft.skillCatalogTokens!=='inherit'&&<Input id="codex-skill-budget" name="codex-skill-budget" className="w-48" type="number" inputMode="numeric" min={1} max={10000} step={1} value={draft.skillCatalogTokens} placeholder="1–10000 tokens" disabled={locked||!writable} aria-invalid={submitted&&budgetError} aria-describedby={submitted&&budgetError?'codex-skill-budget-error':undefined} autoComplete="off" onChange={event=>patch('skillCatalogTokens',event.target.value)}/>}</div>
        </Field>
        {setting('pluginsEnabled',t('插件默认状态','Default plugin state'),t('应用于未单独设置状态的本地插件。','Applies to local plugins without an individual setting.'),[inherited,{value:'true',label:t('启用','Enabled')},{value:'false',label:t('停用','Disabled')}])}
      </FieldGroup></CardContent></Card>
      <Card>{groupTitle(t('账号工具','Account tools'),appKeys)}<CardContent><FieldGroup className="settings-fields">
        {setting('appsEnabled',t('工具默认状态','Default tool state'),t('决定账号连接的工具是否默认可用。','Set the default availability of tools from connected accounts.'),[inherited,{value:'true',label:t('启用','Enabled')},{value:'false',label:t('停用','Disabled')}])}
        {setting('appsApproval',t('操作确认','Action approval'),t('选择执行工具操作前的确认方式。','Choose how tool actions are approved.'),[inherited,{value:'auto',label:t('自动判断','Automatic')},{value:'prompt',label:t('每次确认','Always ask')},{value:'writes',label:t('读取免确认','Allow reads; ask for other actions')},{value:'approve',label:t('直接允许','Allow')}])}
        {setting('appsReviewer',t('确认处理方式','Approval handling'),t('由你确认，或交给 Codex 自动审查。','Review requests yourself or use automatic review.'),[inherited,{value:'user',label:t('手动确认','Manual')},{value:'auto_review',label:t('自动审查','Automatic review')}],t('自动审查会根据请求决定允许或拒绝。','Automatic review can allow or deny a request.'))}
        {setting('appsDestructive',t('破坏性操作','Destructive actions'),t('允许提供删除、覆盖等操作的工具。','Allow tools that can delete or overwrite data.'),booleanOptions,t('只影响声明了此类操作的工具，调用时仍遵守确认设置。','Applies only to tools that declare these actions. Approval settings still apply.'))}
        {setting('appsOpenWorld',t('外部交互','External interactions'),t('允许与外部系统或对象交互的工具。','Allow tools that interact with external systems or entities.'),booleanOptions,t('只影响声明会访问外部环境的工具，不会更改系统联网权限。','Applies only to tools that declare external interactions. System network permissions are unchanged.'))}
      </FieldGroup></CardContent></Card>
      <Card><CardContent><FieldGroup><Field>
        <div className="flex items-center gap-1"><FieldLabel htmlFor="codex-skill-rules">{t('技能规则','Skill rules')}</FieldLabel><Hint text={t('此处只读，可在技能空间调整技能启停。','Read-only here. Change skill states in Skills Space.')}><Button variant="ghost" size="icon-xs" aria-label={t('技能规则说明','Skill rules help')}><CircleHelpIcon aria-hidden="true"/></Button></Hint></div>
        <Textarea id="codex-skill-rules" name="codex-skill-rules" aria-label={t('技能规则（只读）','Skill rules (read-only)')} readOnly value={rulesText} rows={4} className="min-h-28 max-h-48 resize-none" spellCheck={false} autoComplete="off" placeholder={t('暂无技能规则','No skill rules')}/>
      </Field></FieldGroup></CardContent></Card>
      <Field orientation="horizontal" className="justify-end"><Button disabled={locked||!writable||!dirty} onClick={()=>void save()}>{saving?t('保存中…','Saving…'):t('保存','Save')}</Button></Field>
    </>}
    <AlertDialog open={confirmLeave} onOpenChange={value=>{if(!value&&!saving)cancelLeave();}}><AlertDialogContent onEscapeKeyDown={event=>{if(saving)event.preventDefault();}}><AlertDialogHeader><AlertDialogTitle>{t('保存修改？','Save changes?')}</AlertDialogTitle><AlertDialogDescription>{t('离开后，未保存的修改将丢失。','Unsaved changes will be lost when you leave.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving} onClick={cancelLeave}>{t('取消','Cancel')}</AlertDialogCancel><Button variant="outline" disabled={saving} onClick={finishLeave}>{t('不保存','Discard')}</Button><AlertDialogAction disabled={saving||!writable} onClick={event=>{event.preventDefault();void save().then(ok=>{if(ok)finishLeave();});}}>{t('保存并继续','Save and continue')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
