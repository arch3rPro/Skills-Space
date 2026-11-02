import type { ReactNode } from 'react';
import { BackButton } from '@/components/back-button';
import { OverflowText } from '@/components/overflow-text';

export function SkillDetail({ children }: { children: ReactNode }) {
  return <section className="skill-detail-page mx-auto flex max-w-4xl flex-col gap-6">{children}</section>;
}
export function SkillDetailHeader({ title, description, backLabel, onBack, backDisabled, actions }: {
  title: string; description?: string; backLabel: string; onBack: () => void; backDisabled?: boolean; actions: ReactNode;
}) {
  return <><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 flex-1 basis-72 items-center gap-2"><BackButton disabled={backDisabled} className="shrink-0" label={backLabel} onClick={onBack} /><h1 className="min-w-0 break-words text-2xl font-medium tracking-tight">{title}</h1></div><div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div></div>{description && <div className="flex min-w-0 flex-col gap-3"><OverflowText className="line-clamp-2 break-words text-sm leading-6 text-muted-foreground" text={description} /></div>}</>;
}
export function SkillDetailMetadata({ children }: { children: ReactNode }) {
  return <dl className="skill-detail-metadata flex min-w-0 flex-col gap-3 text-sm">{children}</dl>;
}
