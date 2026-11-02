import type { PiSkillState } from '@/lib/pi';
import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, ChevronRightIcon, FileTextIcon, PackageIcon, LoaderCircleIcon, SearchCheckIcon, Trash2Icon } from 'lucide-react';
import { BackButton } from '@/components/back-button';
import { CodexSkillIcon } from '@/components/codex-skill-icon';
import { OverflowText } from '@/components/overflow-text';
import { Hint } from '@/components/hint';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { piResourceTypeLabel, piPackageSourceLabel, piPackageDisplayName, piPackageSkills, type PiExtensionPackage, type PiResource, type PiResourceType } from '@/lib/pi-packages';
import { displayHomePath, type InstalledSkill } from '@/lib/upstream';
import { shortSkillVersion } from '@/lib/skill-document';

import {useLocalDirectories} from '@/hooks/use-local-directories';
import {DirectoryLink} from '@/components/directory-link';

const types: PiResourceType[] = ['extensions', 'skills', 'prompts', 'themes'];
export function PiPackageDetail({ checkingUpdates=false,onOpenDirectory,pkg, skills, states, project, home, zh, disabled, onBack, onRestore, onCheck, onRemove, onSkill, trusted, onToggle }: {
  checkingUpdates?:boolean;onOpenDirectory:(path:string)=>void;pkg: PiExtensionPackage | undefined; skills: InstalledSkill[]; states: PiSkillState[]; project: boolean; home: string; zh: boolean; disabled: boolean;
  onBack: () => void; onRestore: () => void; onCheck: () => void; onRemove: () => void; onSkill: (skill: InstalledSkill) => void; trusted: boolean; onToggle: (resource: PiResource, enabled: boolean) => void;
}) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const [expanded, setExpanded] = useState(false);
  const localDirectory=useLocalDirectories([pkg?.path]).find(item=>item.path===pkg?.path);
  const packageSkills = pkg ? piPackageSkills(pkg, skills, states) : [];
  const visibleSkills = expanded ? packageSkills : packageSkills.slice(0, 6);
  return <section className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6" aria-label={t('插件详情', 'Plugin details')}>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 basis-72 items-start gap-3">
        <BackButton disabled={disabled} label={t('返回插件列表', 'Back to plugins')} onClick={onBack} />
        <CodexSkillIcon size="lg" fallback={<PackageIcon className="size-10 text-muted-foreground" aria-hidden="true" />} />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2"><h1 className="min-w-0 break-words text-2xl font-medium tracking-tight">{pkg ? piPackageDisplayName(pkg) : t('插件已移除', 'Plugin removed')}</h1></div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {pkg && project && pkg.resources.some(resource => resource.override && resource.override !== 'inherit') && <Button variant="outline" disabled={disabled || !trusted} onClick={onRestore}>{t('恢复继承设置', 'Restore inherited settings')}</Button>}
        {pkg?.canUpdate && <Button variant="outline" disabled={disabled||checkingUpdates} aria-busy={checkingUpdates} onClick={onCheck}>{checkingUpdates?<LoaderCircleIcon data-icon="inline-start" aria-hidden="true" className="animate-spin motion-reduce:animate-none"/>:<SearchCheckIcon data-icon="inline-start" aria-hidden="true" />}{t('检查更新', 'Check for updates')}</Button>}
        {pkg?.canRemove && <Button variant="outline" disabled={disabled} onClick={onRemove}><Trash2Icon data-icon="inline-start" aria-hidden="true" />{t('卸载', 'Uninstall')}</Button>}
      </div>
    </header>
    {pkg && <>
      {pkg.description && <p className="whitespace-pre-wrap break-words text-sm leading-6">{pkg.description}</p>}
      {packageSkills.length > 0 && <Card><CardHeader><CardTitle><h2>{t('技能', 'Skills')} <span className="text-muted-foreground tabular-nums">{packageSkills.length}</span></h2></CardTitle></CardHeader><CardContent className="flex min-w-0 flex-col gap-2">
        <div id="pi-package-skills" className="flex min-w-0 flex-col gap-1">{visibleSkills.map(skill => { const resource = pkg.resources.find(item => item.type === 'skills' && piPackageSkills({...pkg, resources:[item]}, [skill]).length > 0); return <div key={skill.path} className="flex min-w-0 items-center gap-3 rounded-lg px-3 py-3 hover:bg-muted focus-within:bg-muted">
          <button type="button" className="flex min-w-0 flex-1 items-center gap-3 self-stretch rounded-lg text-left outline-none focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-50" disabled={disabled} aria-label={`${t('查看技能', 'View skill')} ${skill.name}`} onClick={() => onSkill(skill)}>
            <CodexSkillIcon fallback={<FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />} />
            <span className="flex min-w-0 flex-1 flex-col gap-1"><OverflowText text={skill.name} className="truncate text-sm font-medium" /><OverflowText text={skill.description} className="line-clamp-2 text-xs font-normal text-muted-foreground" /></span>
          </button>
          {resource && <Hint stable disabled={disabled || !trusted} text={resource.enabled ? t('已启用', 'Enabled') : t('已停用', 'Disabled')}><Switch checked={resource.enabled} disabled={disabled || !trusted} aria-label={`${t('启用技能', 'Enable skill')} ${skill.name}`} onCheckedChange={enabled => onToggle(resource, enabled)} /></Hint>}
          <Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={`${t('查看技能详情', 'View skill details')} ${skill.name}`} onClick={() => onSkill(skill)}><ChevronRightIcon aria-hidden="true" /></Button>
        </div>;})}</div>
        {packageSkills.length > 6 && <Button variant="ghost" className="self-start" disabled={disabled} aria-expanded={expanded} aria-controls="pi-package-skills" onClick={() => setExpanded(value => !value)}>{expanded ? <ChevronUpIcon aria-hidden="true" /> : <ChevronDownIcon aria-hidden="true" />}{expanded ? t('收起', 'Show less') : t(`展开其余 ${packageSkills.length - 6} 个技能`, `Show ${packageSkills.length - 6} more skills`)}</Button>}
      </CardContent></Card>}
      {!pkg.resources.length && <Empty><EmptyHeader><EmptyTitle>{t('未发现可加载资源', 'No loadable resources found')}</EmptyTitle></EmptyHeader></Empty>}
      <Card><CardHeader><CardTitle><h2>{t('关于', 'About')}</h2></CardTitle></CardHeader><CardContent>
        <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 text-sm">
          {types.filter(type => type !== 'skills' && pkg.resources.some(resource => resource.type === type)).map(type => <div key={type} className="contents"><dt className="text-muted-foreground">{piResourceTypeLabel(type, zh)}</dt><dd className="tabular-nums">{pkg.resources.filter(resource => resource.type === type).length}</dd></div>)}
          <dt className="text-muted-foreground">{t('包名', 'Package name')}</dt><dd className="break-all">{pkg.name}</dd>
          <dt className="text-muted-foreground">{t('来源', 'Source')}</dt><dd className="break-all">{pkg.kind === 'local' ? piPackageSourceLabel(pkg.kind, zh) : displayHomePath(pkg.source, home)}</dd>
          {pkg.version && <><dt className="text-muted-foreground">{t('版本', 'Version')}</dt><dd>{shortSkillVersion(pkg.version)}</dd></>}
          <dt className="text-muted-foreground">{t('配置范围', 'Settings scope')}</dt><dd>{project ? pkg.inherited || pkg.delta ? t('全局安装，项目覆盖', 'Global installation, project overrides') : t('当前项目', 'This project') : t('全局', 'Global')}</dd>
          {localDirectory && <><dt className="text-muted-foreground">{t('位置', 'Location')}</dt><dd className="min-w-0"><DirectoryLink path={localDirectory.path} directory={localDirectory.directory} home={home} zh={zh} disabled={disabled} onOpen={onOpenDirectory}/></dd></>}
        </dl>
      </CardContent></Card>
    </>}
  </section>;
}
