import { cn } from "@/lib/utils";
import type { ReactNode, Ref } from 'react';
import { BackButton } from '@/components/back-button';
import { OverflowText } from '@/components/overflow-text';
import { Hint } from '@/components/hint';
import { FingerprintIcon, HistoryIcon, type LucideIcon } from 'lucide-react';
import { VersionValue, type VersionReadState } from '@/components/version-value';
import { displayHomePath } from '@/lib/upstream';

export function SkillDetail({ children }: { children: ReactNode }) {
  return <section className="skill-detail-page mx-auto flex max-w-4xl flex-col gap-6">{children}</section>;
}
export function SkillDetailHeader({ title, description, backLabel, onBack, backDisabled, backRef, actions }: {
  title: string; description?: string; backLabel: string; onBack: () => void; backDisabled?: boolean; backRef?: Ref<HTMLButtonElement>; actions: ReactNode;
}) {
  return <><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 flex-1 basis-72 items-center gap-2"><BackButton ref={backRef} disabled={backDisabled} className="shrink-0" label={backLabel} onClick={onBack} /><h1 className="min-w-0 break-words text-2xl font-medium tracking-tight">{title}</h1></div><div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div></div>{description && <div className="flex min-w-0 flex-col gap-3"><OverflowText className="line-clamp-2 break-words text-sm leading-6 text-muted-foreground" text={description} /></div>}</>;
}
export function SkillDetailMetadata({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return <dl className={cn("skill-detail-metadata flex min-w-0 flex-col", compact ? "gap-2 text-xs" : "gap-3 text-sm")}>{children}</dl>;
}

export function SkillDetailField({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return <SkillMetadataField label={label} icon={<Icon className="size-4" aria-hidden="true" />}>{children}</SkillMetadataField>;
}

export function SkillDetailPath({ path, home, openLabel, onOpen }: { path: string; home: string; openLabel: string; onOpen?: () => void }) {
  const displayPath = displayHomePath(path, home);
  if (!onOpen) return <Hint text={displayPath} focusable><span className="block truncate font-mono text-xs">{displayPath}</span></Hint>;
  return <Hint text={displayPath} align="start"><button type="button" className="interactive-path block max-w-full truncate text-left font-mono text-xs" onClick={onOpen} aria-label={`${openLabel} ${displayPath}`}>{displayPath}</button></Hint>;
}

export function SkillDetailVersion({ version, state, zh }: { version: string | null; state: VersionReadState; zh: boolean }) {
  return <SkillVersionMetadata label={zh ? "版本" : "Version"} value={version} state={state} zh={zh} />;
}

export function SkillMetadataField({ label, icon, children }: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return <div className="flex min-w-0 items-start gap-3">
    {icon ? <dt className="flex h-5 w-4 shrink-0 items-center text-muted-foreground">
      <Hint text={label} focusable><span className="inline-flex">{icon}<span className="sr-only">{label}</span></span></Hint>
    </dt> : <dt className="sr-only">{label}</dt>}
    <dd className="min-w-0 flex-1 leading-5 [overflow-wrap:anywhere]">{children}</dd>
  </div>;
}

export function SkillVersionMetadata({ label, value, fullValue = value, state, zh, emptyLabel, fingerprint }: {
  label: string;
  value: string | null;
  fullValue?: string | null;
  state: VersionReadState;
  zh: boolean;
  emptyLabel?: string;
  fingerprint?: boolean;
}) {
  const Icon = fingerprint ? FingerprintIcon : HistoryIcon;
  return <SkillMetadataField label={label} icon={<Icon className="size-4" aria-hidden="true" />}>
    <Hint text={state === "ready" ? fullValue ?? undefined : undefined} focusable>
      <span className={state === "ready" && value ? "font-mono tabular-nums" : undefined}>
        <VersionValue value={value} state={state} zh={zh} emptyLabel={emptyLabel} />
      </span>
    </Hint>
  </SkillMetadataField>;
}
