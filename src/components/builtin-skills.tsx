import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal, ModalActions } from '@/components/modal';
import { notifyError, notifySuccess } from '@/lib/notifications';
import type { InstalledSkill } from '@/lib/upstream';
import { workshop, type BuiltinSkill, type BuiltinCheck, type WorkshopSkillId } from '@/lib/workshop';

export type InventorySkill = InstalledSkill & { builtin?: BuiltinSkill };

export function builtinInventorySkill(skill: BuiltinSkill): InventorySkill {
  return {
    builtin: skill,
    name: skill.metadata?.name || skill.name,
    description: skill.metadata?.description ?? "",
    path: skill.directory,
    source: null,
    sourceUrl: skill.source,
    agents: [],
  };
}

export function useBuiltinSkills(active: boolean, zh: boolean) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const [rows, setRows] = useState<BuiltinSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [checks, setChecks] = useState<BuiltinCheck[]>([]);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [review, setReview] = useState<WorkshopSkillId | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await workshop('builtins'));
      setFailed(false);
    } catch (error) {
      setFailed(true);
      notifyError(String(error), zh);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (active && !updating) void load(); }, [active]);

  async function check() {
    if (checking || updating || loading) return;
    setChecking(true);
    try {
      const next = await workshop<BuiltinCheck[]>('builtin-check');
      setChecks(next);
      const errors = next.filter(item => item.error);
      if (errors.length) {
        notifyError(errors.map(item => item.error).join('\n'), zh, undefined, t('部分内置技能检查失败，请重试。', 'Some built-in skills could not be checked. Try again.'));
      } else {
        notifySuccess(next.some(item => item.candidate) ? t('发现可用更新。', 'Updates are available.') : t('没有可用更新。', 'No updates are available.'));
      }
    } catch (error) {
      notifyError(String(error), zh);
    } finally {
      setChecking(false);
    }
  }

  const source = rows.find(skill => skill.id === review);
  const candidate = checks.find(item => item.id === review)?.candidate;

  async function update(onUpdated: (skill: BuiltinSkill) => void) {
    if (!review || !candidate || updating || loading || checking) return;
    setUpdating(true);
    try {
      const next = await workshop<BuiltinSkill[]>('builtin-update', { skill: review, candidate });
      setRows(next);
      setChecks(items => items.filter(item => item.id !== review));
      setReview(null);
      const updated = next.find(skill => skill.id === review);
      if (updated) onUpdated(updated);
    } catch (error) {
      notifyError(String(error), zh);
    } finally {
      setUpdating(false);
    }
  }

  function renderUpdateDialog(onUpdated: (skill: BuiltinSkill) => void) {
    return (
      <Modal compact title={t('更新内置技能', 'Update built-in skill')} open={!!review} busy={updating} onClose={() => setReview(null)}>
        {source && candidate && <div className="flex flex-col gap-4 text-sm">
          <p className="font-medium">{source.metadata?.name || source.name}</p>
          <p className="font-mono">{source.version} → {candidate.version}</p>
          <p className="leading-6">{candidate.description}</p>
          <p className="text-muted-foreground">{t('新任务使用更新后的技能，已有会话继续使用原版本。', 'New tasks use the updated skill. Existing conversations keep their pinned version.')}</p>
          <ModalActions>
            <Button variant="outline" disabled={updating} onClick={() => setReview(null)}>{t('取消', 'Cancel')}</Button>
            <Button disabled={updating || loading || checking} onClick={() => void update(onUpdated)}>{updating ? t('更新中…', 'Updating…') : t('更新', 'Update')}</Button>
          </ModalActions>
        </div>}
      </Modal>
    );
  }

  return { rows, loading, failed, checks, checking, updating, load, check, setReview, renderUpdateDialog };
}
