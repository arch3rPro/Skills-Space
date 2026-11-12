import { useState, type FormEvent } from "react";
import { Modal, ModalActions } from "@/components/modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogBody, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RemovalReviewList } from "@/components/removal-review";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Choice } from "./choice";
import { Input } from "@/components/ui/input";
import type { Translate } from "./client";
import { displayHomePath } from "@/lib/upstream";

export type CreationTarget = { id: string; path: string; revision: string };
export type RemovalItem = { id: string; name: string; path: string; revision: string };
export type RemovalExclusion = { id: string; name: string; path: string; reason: string };
export type RemovalPreview = { items: RemovalItem[]; excluded: RemovalExclusion[] };
export function removalReason(reason: string, t: Translate) {
  if (reason === 'removal-shared-file') return t('文件有硬链接，不能独立移除。', 'The file has hard links and cannot be removed independently.');
  if (reason === 'removal-linked-file') return t('目录包含链接或特殊文件，不能按此范围移除。', 'The directory contains links or special files outside this removal scope.');
  if (reason === 'removal-nested-skill') return t('目录包含其他技能或 DSH 项目，不能作为单个技能移除。', 'The directory contains another skill or DSH project and cannot be removed as one skill.');
  if (reason === 'removal-shared-alternative') return t('其他共享目录有同名安装，当前操作不能完整处理。', 'Another shared directory has an installation with the same name outside this operation.');
  if (reason === 'removal-unreadable') return t('文件或安装记录无法读取，未纳入本次卸载。', 'The file or installation record could not be read and is excluded.');
  return t('文件或安装记录不符合当前卸载范围，请刷新后重新选择。', 'The file or installation record is outside this removal scope. Refresh and select again.');
}
export type RemovalResult = { removed: string[]; removedIds?: string[]; failed: boolean };

export function CreateSkill({ targets, close, create, restoreFocus, t }: {
  targets?: CreationTarget[]; close: () => void; create: (name: string, target: CreationTarget) => Promise<void>; restoreFocus: () => void; t: Translate;
}) {
  const [selected, setSelected] = useState("");
  const target = targets?.find(item => item.id === selected) ?? targets?.[0];
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 64;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!target || !valid || pending) return;
    setError("");
    setPending(true);
    try { await create(name, target); setName(""); close(); }
    catch (error) {
      const code = error instanceof Error ? error.message : "";
      setError(code === "occupied" ? t("目录已存在。请换一个技能名称。", "A directory already exists. Choose another skill name.")
        : code === "creation-directory" ? t("创建目录已变更。关闭并刷新后重试。", "The destination changed. Close the dialog and refresh before trying again.")
        : code === "creation-unverified" ? t("文件已写入，但无法确认 DSH 能读取。请刷新库存并检查目录。", "A file was written, but DSH discovery could not be verified. Refresh and check the directory.")
        : t("未能创建技能。请检查目录权限后重试。", "Could not create the skill. Check directory permissions and try again."));
    } finally { setPending(false); }
  }
  function cancel() { setError(""); setName(""); close(); }
  return <Modal open={!!target} onClose={cancel} onClosed={restoreFocus} compact busy={pending}
    title={t("创建技能", "Create skill")} description={t("创建 SKILL.md 模板。", "Create a SKILL.md template.")}>
    <form id="dsh-create-skill" onSubmit={event => void submit(event)}><FieldGroup className="gap-3">
      <Field><FieldLabel htmlFor="dsh-create-directory">{t("创建目录", "Destination")}</FieldLabel>
        {targets && targets.length > 1 ? <Choice id="dsh-create-directory" label={t("创建目录", "Destination")} value={target?.id ?? ""} disabled={pending}
          onChange={value => { setSelected(value); setError(""); }} options={targets.map(item => ({ value: item.id, label: item.path }))} />
          : <Input id="dsh-create-directory" value={target?.path ?? ""} readOnly />}
        <FieldDescription>{t("使用此目录的其他预设和项目也可能发现新技能。", "Other presets and projects using this directory may also discover the new skill.")}</FieldDescription>
      </Field>
      <Field><FieldLabel htmlFor="dsh-create-name">{t("技能名称", "Skill name")}</FieldLabel>
        <Input id="dsh-create-name" value={name} maxLength={64} disabled={pending} placeholder="example-skill"
          aria-describedby="dsh-create-hint" onChange={event => { setError(""); setName(event.target.value); }} />
        <FieldDescription id="dsh-create-hint">{t("使用小写字母、数字或连字符。", "Use lowercase letters, numbers, or hyphens.")}</FieldDescription>
      </Field>
      {error && <Alert variant="destructive"><AlertDescription role="alert">{error}</AlertDescription></Alert>}
    </FieldGroup></form>
    <ModalActions>
      <Button variant="outline" type="button" onClick={cancel} disabled={pending}>{t("取消", "Cancel")}</Button>
      <Button type="submit" form="dsh-create-skill" disabled={pending || !valid}>{pending ? t("正在创建…", "Creating…") : t("创建", "Create")}</Button>
    </ModalActions>
  </Modal>;
}

export function RemoveSkills({ items, excluded = [], kind, close, remove, restoreFocus, home, source, onSource, reviewing, t }: {
  items?: RemovalItem[]; excluded?: RemovalExclusion[]; kind: 'native' | 'managed' | 'mixed'; close: () => void; remove: (items: RemovalItem[]) => Promise<void>; restoreFocus: () => void; home: string;
  source?: string; onSource?: () => void; reviewing: boolean; t: Translate;
}) {
  const [removing, setPending] = useState(false);
  const pending = removing || reviewing;
  const [error, setError] = useState("");
  function cancel() { setError(""); close(); }
  async function submit() {
    if (pending || !items?.length || error) return;
    setPending(true);
    try { await remove(items); close(); }
    catch (error) {
      const code = error instanceof Error ? error.message : "";
      setError(code === "removal-conflict" || code === "removal-unavailable"
        ? t("技能文件或安装记录已变化。请关闭并重新核对。", "The skill files or installation record changed. Close this dialog and review again.")
        : t("无法确认卸载结果。请关闭并刷新当前技能列表。", "Could not confirm the uninstall result. Close this dialog and refresh the current skill list."));
    } finally { setPending(false); }
  }
  return <AlertDialog open={!!items} onOpenChange={open => { if (!open && !pending) cancel(); }}>
    <AlertDialogContent size={items && items.length + excluded.length > 1 ? 'wide' : 'default'} onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}
      onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} aria-busy={pending}>
      <AlertDialogHeader>
        <AlertDialogTitle>{t("卸载技能", "Uninstall skills")}</AlertDialogTitle>
        <AlertDialogDescription>{kind === 'mixed'
          ? t("共享目录中的技能将卸载，其他目录中的技能将移至废纸篓。", "Skills in shared directories will be uninstalled; skills in other directories will move to Trash.")
          : kind === 'native'
          ? t("以下文件或目录会移至宿主系统的废纸篓。", "The files or directories below will move to the host system Trash.")
          : t("将从以下共享技能目录卸载所选技能。使用这些目录的 Agent 会受到影响。", "The selected skills will be uninstalled from the shared directories below. Agents using these directories will be affected.")}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogBody>
        {source && <p className="mb-3 break-all text-xs text-muted-foreground">{t("来源", "Source")} · {displayHomePath(source, home)}</p>}
        <RemovalReviewList items={items ?? []} excluded={excluded.map(item => ({ ...item, message: removalReason(item.reason, t) }))}
          home={home} zh={t("zh", "en") === "zh"}/>
        {error && <Alert variant="destructive" className="mt-3"><AlertDescription role="alert">{error}</AlertDescription></Alert>}
      </AlertDialogBody>
      <AlertDialogFooter>
        {onSource && <Button variant="outline" disabled={pending || !!error} onClick={onSource}>{reviewing ? t("正在检查…", "Checking…") : t("按来源卸载", "Uninstall by source")}</Button>}
        <AlertDialogCancel disabled={pending}>{t("取消", "Cancel")}</AlertDialogCancel>
        <Button variant="destructive" onClick={() => void submit()} disabled={pending || !items?.length || !!error}>{removing ? t("正在卸载…", "Uninstalling…") : t("卸载", "Uninstall")}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
