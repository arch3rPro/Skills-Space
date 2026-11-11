import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { DshDirectoryFields } from '@/components/dsh-directory-fields';
import { ModalActions } from '@/components/modal';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { dshHomeFromSkillsPath, dshSkillsPath, type DshAdditionalDirectoryLayout } from '@/lib/dsh';
import { displayHomePath, expandHomePath } from '@/lib/upstream';
import { notifySuccess } from '@/lib/notifications';
import type { Preset, Translate } from './client';

type Fields = { defaults: boolean; dshHome: string; agentsHome: string; additional: (string|null)[] };
export type DirectoryConfiguration = Fields & { unresolvedFields?: string[]; additionalDirectoryLayout?: DshAdditionalDirectoryLayout; revision: string; overridden: boolean; canRestore?: boolean; userHome?: string; defaultHomes?: { dsh: string; shared: string }; roots?: {path:string;exists:boolean;source?:string}[]; context?: Pick<Preset, 'directories' | 'installGlobal' | 'installProject' | 'discoversGlobal' | 'discoversProject'> };
// Draft home fields display the actual skills directory; the Host receives homes.
export type DirectoryDraft = Fields;
export type DirectoryEditorHandle = { save: () => void; dirty:boolean; canSave:boolean };
export function directoryDraft(value: DirectoryConfiguration): DirectoryDraft {
  return { defaults: value.defaults, dshHome: value.dshHome ? dshSkillsPath(value.dshHome) : '', agentsHome: value.agentsHome ? dshSkillsPath(value.agentsHome) : '', additional: value.additional.map(path=>path!==null&&value.userHome?displayHomePath(path,value.userHome):path) };
}

export function DirectorySettings({ value, draft, stale, onChange, onSave, onRestore, reload, t, onBusyChange, onSettled, controller, chooseDirectory, openDirectory }: {
  value: DirectoryConfiguration; draft: DirectoryDraft; stale: boolean; onChange: (next: DirectoryDraft) => void;
  onSave: (fields: Fields) => Promise<void>; onRestore: () => Promise<void>; reload: () => Promise<void>; t: Translate;
  onBusyChange?: (value: boolean) => void; onSettled?: (saved: boolean) => void; controller?: Ref<DirectoryEditorHandle>; chooseDirectory?:()=>Promise<string|null>; openDirectory?:(path:string)=>Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<'failed' | 'conflict'>();
  const [, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<'save' | 'restore'>();
  const [pendingDirectory, setPendingDirectory] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const changed = pendingDirectory || JSON.stringify(draft) !== JSON.stringify(directoryDraft(value));
  const invalid = pendingDirectory || draft.additional.some(path => path!==null&&!/^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(value.userHome ? expandHomePath(path.trim(),value.userHome) : path.trim()));
  const canSave = changed && !invalid && !pending && !stale && result !== 'conflict';
  useEffect(() => { onBusyChange?.(pending); return () => onBusyChange?.(false); }, [pending, onBusyChange]);
  useImperativeHandle(controller, () => ({ save: () => { void save(false); }, dirty:changed, canSave }));
  const absolute = (path: string) => value.userHome ? expandHomePath(path.trim(), value.userHome) : path.trim();
  function change(next: DirectoryDraft) { setResult(undefined); setErrors({}); onChange(next); }
  function fields(): Fields | null {
    let dshHome = draft.dshHome.trim() ? dshHomeFromSkillsPath(absolute(draft.dshHome)) : '';
    let agentsHome = draft.agentsHome.trim() ? dshHomeFromSkillsPath(absolute(draft.agentsHome)) : '';
    const additional = draft.additional.map(path=>path===null?null:absolute(path));
    const next: Record<string, string> = {};
    const absolutePath = (path: string) => /^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(path);
    if (!draft.defaults) {
      if (dshHome === null || dshHome !== '' && !absolutePath(dshHome)) dshHome = value.dshHome;
      if (agentsHome === null || agentsHome !== '' && !absolutePath(agentsHome)) agentsHome = value.agentsHome;
    }
    if (dshHome === null || dshHome !== '' && !absolutePath(dshHome)) next.dshHome = t('请输入以 skills 结尾的绝对目录路径。', 'Enter an absolute directory path ending in skills.');
    if (agentsHome === null || agentsHome !== '' && !absolutePath(agentsHome)) next.agentsHome = t('请输入以 skills 结尾的绝对目录路径。', 'Enter an absolute directory path ending in skills.');
    additional.forEach((path, index) => { if (path!==null&&!/^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(path)) next[`additional-${index}`] = t('请输入宿主上的绝对目录路径。', 'Enter an absolute directory path on the host.'); });
    if (additional.length > 64) next.additional = t('最多添加 64 个目录。', 'Add no more than 64 directories.');
    setErrors(next);
    if (dshHome === null || agentsHome === null || Object.keys(next).length) {
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return null;
    }
    return { defaults: draft.defaults, dshHome, agentsHome, additional };
  }
  async function reread() {
    if (pending) return;
    setPending(true);
    try { await reload(); setResult(undefined); setErrors({}); }
    catch { setResult('failed'); }
    finally { setPending(false); }
  }
  async function save(confirmed: boolean) {
    if (pending || stale || pendingDirectory || result === 'conflict') { onSettled?.(false); return; }
    if (!changed) { onSettled?.(true); return; }
    const next = fields();
    if (!next) { onSettled?.(false); return; }
    if (!value.overridden && !confirmed) { setConfirming('save'); return; }
    await apply(() => onSave(next));
  }
  async function apply(operation: () => Promise<void>, restoring = false) {
    setPending(true); setResult(undefined);
    try { await operation(); setConfirming(undefined); notifySuccess(restoring ? t('已恢复默认设置。','Default settings restored.') : t('技能目录已保存。', 'Skill directories saved.')); onSettled?.(true); }
    catch (error) { setResult(error instanceof Error && error.message === 'directory-conflict' ? 'conflict' : 'failed'); onSettled?.(false); }
    finally { setPending(false); }
  }
  return <form ref={form} id={id} className="flex min-w-0 flex-col gap-5" aria-busy={pending} onSubmit={event => { event.preventDefault(); void save(false); }}>
    <DshDirectoryFields key={value.revision} home={value.userHome??''} zh={t('zh','en')==='zh'} disabled={pending||stale} row={{editable:true,unresolvedFields:value.unresolvedFields,additionalDirectoryLayout:value.additionalDirectoryLayout}}
      defaults={{dshHome:value.defaultHomes?.dsh??value.userHome??'',agentsHome:value.defaultHomes?.shared??value.userHome??''}} roots={value.roots??[]}
      includeDefaults={draft.defaults} setIncludeDefaults={defaults=>change({...draft,defaults})}
      extra={{dshHome:draft.dshHome?dshHomeFromSkillsPath(draft.dshHome)??'':'',agentsHome:draft.agentsHome?dshHomeFromSkillsPath(draft.agentsHome)??'':''}}
      onHomeChange={(key,path)=>change({...draft,[key]:path?dshSkillsPath(path):''})}
      directories={draft.additional} setDirectories={next=>change({...draft,additional:typeof next==='function'?next(draft.additional):next})}
      onPendingChange={setPendingDirectory} onChooseDirectory={chooseDirectory} onOpenDirectory={openDirectory}/>
    {(stale || result) && <Alert variant="destructive"><AlertDescription>
      <p>{stale || result === 'conflict' ? t('预设已变化，请重新读取后再保存。', 'The preset changed. Reload before saving.') : t('目录未能保存，草稿已保留，请重试。', 'Could not save directories. Your draft is retained; retry saving.')}</p>
      {(stale || result === 'conflict') && <Button variant="outline" size="sm" disabled={pending} onClick={() => void reread()}>{t('放弃草稿并重新读取', 'Discard draft and reload')}</Button>}
    </AlertDescription></Alert>}
    <AlertDialog open={!!confirming} onOpenChange={open => { if (!open && !pending) { setConfirming(undefined); onSettled?.(false); } }}>
      <AlertDialogContent aria-busy={pending} onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onCloseAutoFocus={event => { event.preventDefault(); saveButton.current?.focus(); }}>
        <AlertDialogHeader><AlertDialogTitle>{confirming === 'restore' ? t('恢复默认设置？', 'Restore default settings?') : t('保存技能目录？', 'Save skill directories?')}</AlertDialogTitle>
          <AlertDialogDescription>{confirming === 'restore'
            ? t('恢复此预设继承的目录设置，保留技能文件和其他预设设置。', 'Restore inherited directory settings for this preset, keeping skill files and other preset settings.')
            : t('本次会保留并覆盖此预设的完整配置，只修改技能目录。后续内置预设的默认变更不会自动合入。', 'Save a complete override for this preset while changing only skill directories. Future bundled preset changes will not merge automatically.')}</AlertDialogDescription>
        </AlertDialogHeader>
        {result && <Alert variant="destructive"><AlertDescription>{result === 'conflict' ? t('预设已变化，请返回表单重新读取。', 'The preset changed. Return to the form and reload.') : t('保存未完成，可以重试或继续编辑。', 'The save did not complete. Retry or keep editing.')}</AlertDescription></Alert>}
        <AlertDialogFooter><AlertDialogCancel disabled={pending}>{t('继续编辑', 'Keep editing')}</AlertDialogCancel>
          <Button disabled={pending || stale || result === 'conflict'} onClick={() => { if (confirming === 'restore') void apply(onRestore, true); else void save(true); }}>{pending ? t('正在保存…', 'Saving…') : t('确认', 'Confirm')}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <ModalActions fallback="inline">
      {value.canRestore && <Button variant="outline" size="sm" disabled={pending || stale || changed} onClick={() => setConfirming('restore')}>{t('恢复默认设置', 'Restore default settings')}</Button>}
      <Button ref={saveButton} form={id} type="submit" size="sm" disabled={!canSave}>{pending ? t('正在保存…', 'Saving…') : t('保存', 'Save')}</Button>
    </ModalActions>
  </form>;
}
