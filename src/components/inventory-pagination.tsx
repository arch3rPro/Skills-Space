import { useId, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function InventoryPagination({ page, pages, size, onPage, onSize, zh, embedded = false, pageDisabled = false, sizeDisabled = pageDisabled, label }: {
  page: number;
  pages: number | null;
  size: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
  zh: boolean;
  embedded?: boolean;
  pageDisabled?: boolean;
  sizeDisabled?: boolean;
  label?: string;
}) {
  const [jumpPage, setJumpPage] = useState('');
  const jumpId = useId();
  const current = pages === null ? page : Math.min(page, pages);
  const t = (cn: string, en: string) => zh ? cn : en;
  function changePage(next: number) {
    setJumpPage('');
    onPage(next);
  }
  return <nav className="flex shrink-0 flex-wrap items-center justify-center gap-3" aria-label={label ?? t('技能分页', 'Skill pages')}>
    {embedded ? <NativeSelect value={size} disabled={sizeDisabled} aria-label={t('每页数量', 'Items per page')} onChange={event => onSize(Number(event.target.value))}>
      {[12, 24, 48].map(value => <option key={value} value={value}>{t(`${value} 项 / 页`, `${value} / page`)}</option>)}
    </NativeSelect> : <Select value={String(size)} disabled={sizeDisabled} onValueChange={value => onSize(Number(value))}><SelectTrigger aria-label={t('每页数量', 'Items per page')}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{[12, 24, 48].map(value => <SelectItem key={value} value={String(value)}>{t(`${value} 项 / 页`, `${value} / page`)}</SelectItem>)}</SelectGroup></SelectContent></Select>}
    <Button size="icon" variant="outline" aria-label={t('上一页', 'Previous page')} disabled={pages === null || current <= 1 || pageDisabled} onClick={() => changePage(current - 1)}><ChevronLeftIcon aria-hidden="true" /></Button>
    <span className="text-sm tabular-nums text-muted-foreground">{current} / {pages ?? '—'}</span>
    <Button size="icon" variant="outline" aria-label={t('下一页', 'Next page')} disabled={pages === null || current >= pages || pageDisabled} onClick={() => changePage(current + 1)}><ChevronRightIcon aria-hidden="true" /></Button>
    <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); const value = Number(jumpPage); if (pages !== null && Number.isInteger(value) && value >= 1 && value <= pages && !pageDisabled) changePage(value); }}>
      <Field orientation="horizontal"><FieldLabel htmlFor={jumpId} className="sr-only">{t('跳转页码', 'Go to page')}</FieldLabel><Input id={jumpId} className="w-20" type="number" inputMode="numeric" min={1} max={pages ?? undefined} step={1} required value={jumpPage} placeholder={t('页码', 'Page')} disabled={pageDisabled || pages === null} onChange={event => setJumpPage(event.target.value)} /><Button size="sm" variant="outline" type="submit" disabled={pageDisabled || pages === null || !jumpPage}>{t('跳转', 'Go')}</Button></Field>
    </form>
  </nav>;
}
