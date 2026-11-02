import { CodexSkillIcon } from '@/components/codex-skill-icon';
import { ActionMenu } from '@/components/action-menu';
import { CodexPluginSourceChoice } from '@/components/codex-plugin-source-choice';
import { Choice } from '@/components/choice';
import { useDeferredValue, useMemo, useState } from 'react';
import { BulkSelectionBar } from '@/components/bulk-selection-bar';
import { Checkbox } from '@/components/ui/checkbox';
import { selectVisible } from '@/lib/selection';
import { RotateCcwIcon, ChevronDownIcon, PlusIcon, StoreIcon, CircleArrowUpIcon, LoaderCircleIcon, SearchCheckIcon, RefreshCwIcon, Trash2Icon, PackageIcon, PackagePlusIcon, UserRoundIcon, SearchIcon, ListChecksIcon, XIcon } from 'lucide-react';
import { Hint } from '@/components/hint';
import { OverflowText } from '@/components/overflow-text';
import { LoadingCards } from '@/components/loading-cards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { InventoryCardHeader, InventoryCardFooter } from '@/components/inventory-card';
import { InventoryToolbar } from '@/components/inventory-toolbar';
import { SkillBatchToggleControls } from '@/components/skill-batch-toggle-controls';
import { cn } from '@/lib/utils';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { codexPluginStateLabel, filterCodexPluginPage, codexAvailabilityMessage, visibleCodexPlugins } from '@/lib/codex';
import type { CodexSnapshot, CodexPlugin, CodexPluginAction, CodexPluginCheck } from '@/lib/codex';

type Props = {
  onOpen:(plugin:CodexPlugin)=>void;
  onMarkets:()=>void;onAdd:()=>void;
  source:string;setSource:(value:string)=>void;status:string;setStatus:(value:string)=>void;
  checkingUpdates:boolean;onCheckAll:()=>void;onUpdate:(plugin:CodexPlugin)=>void;checks: Record<string,CodexPluginCheck>;
  project:boolean;zh: boolean; snapshot: CodexSnapshot | null; loading: boolean; disabled: boolean;
  query: string; onQuery: (value: string) => void; onRefresh: () => void;
  onAction: (plugin: CodexPlugin, action: CodexPluginAction) => void; onBatch: (plugins: CodexPlugin[], action: CodexPluginAction) => void;
};
export function CodexManagement({ project,onMarkets,onAdd,source,setSource,status,setStatus,onOpen, checks, checkingUpdates, onCheckAll, onUpdate, zh, snapshot, loading, disabled, query, onQuery, onRefresh, onAction, onBatch }: Props) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const deferredQuery=useDeferredValue(query);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const locked = disabled;
  const sourcePlugins=filterCodexPluginPage(snapshot?.plugins??[],false,'all','all');
  const availability = codexAvailabilityMessage(snapshot,zh);
  const plugins = useMemo(()=>filterCodexPluginPage(visibleCodexPlugins(snapshot?.plugins ?? [], deferredQuery), false, source, status),[snapshot,deferredQuery,source,status]);
  const picked = plugins.filter(plugin => selected.includes(plugin.id));
  return <section className="flex min-w-0 flex-col gap-4">
    <InventoryToolbar><div className="toolbar-filters flex shrink-0 items-center gap-2">
      <div className="toolbar-search relative w-56 shrink-0"><SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input className="pl-9" type="search" name="plugin-query" autoComplete="off" spellCheck={false} value={query} onChange={event => onQuery(event.target.value)} placeholder={t('搜索插件…', 'Search plugins…')} aria-label={t('搜索插件', 'Search plugins')} /></div>
      <CodexPluginSourceChoice zh={zh} plugins={sourcePlugins} value={source} disabled={locked} onChange={value=>{setSource(value);setSelected([]);}}/>
      <Choice className="filter-trigger" label={t('筛选插件状态','Filter plugin state')} value={status} onChange={value=>{setStatus(value);setSelected([]);}} options={[{value:'all',label:t('全部状态','All states')},{value:'enabled',label:t('已启用','Enabled')},{value:'disabled',label:t('已停用','Disabled')}]}/>
      <Hint text={t('刷新', 'Refresh')} disabled={locked}><Button variant="ghost" className="toolbar-secondary-action" data-toolbar-priority="3" aria-label={t('刷新', 'Refresh')} disabled={locked || loading} onClick={onRefresh} aria-busy={loading}><RefreshCwIcon aria-hidden="true" className={loading ? "animate-spin motion-reduce:animate-none" : undefined}/><span className="toolbar-secondary-label">{t('刷新', 'Refresh')}</span></Button></Hint>
      </div><div className="toolbar-actions ml-auto flex shrink-0 items-center gap-2"><Hint text={t('检查更新','Check updates')} disabled={locked||loading||!sourcePlugins.some(plugin=>plugin.canCheckUpdates)}><Button variant="ghost" className="toolbar-secondary-action" data-toolbar-priority="2" aria-label={t('检查更新','Check updates')} aria-busy={checkingUpdates} disabled={locked||loading||checkingUpdates||!sourcePlugins.some(plugin=>plugin.canCheckUpdates)} onClick={onCheckAll}>{checkingUpdates?<LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none"/>:<SearchCheckIcon aria-hidden="true"/>}<span className="toolbar-secondary-label">{t('检查更新','Check updates')}</span></Button></Hint><Hint text={selecting?t('取消选择','Cancel selection'):t('批量选择','Select multiple')} disabled={locked||!plugins.length}><Button className="toolbar-secondary-action" data-toolbar-priority="1" variant={selecting ? 'secondary' : 'ghost'} disabled={locked || !plugins.length} aria-label={selecting?t('取消选择','Cancel selection'):t('批量选择','Select multiple')} aria-pressed={selecting} onClick={() => {setSelecting(!selecting); setSelected([]);}}>{selecting ? <XIcon aria-hidden="true"/> : <ListChecksIcon aria-hidden="true"/>}<span className="toolbar-secondary-label inline-grid" aria-hidden="true"><span className={cn('col-start-1 row-start-1',selecting&&'invisible')}>{t('批量选择','Select multiple')}</span><span className={cn('col-start-1 row-start-1',!selecting&&'invisible')}>{t('取消选择','Cancel selection')}</span></span></Button></Hint>
      <ActionMenu label={t('添加','Add')} disabled={locked} trigger={<Button disabled={locked}><PlusIcon data-icon="inline-start" aria-hidden="true"/>{t('添加','Add')}<ChevronDownIcon data-icon="inline-end" aria-hidden="true"/></Button>} groups={[[{label:t('添加插件','Add plugins'),icon:<PackagePlusIcon aria-hidden="true"/>,run:onAdd},...(!project?[{label:t('插件市场','Plugin marketplaces'),icon:<StoreIcon aria-hidden="true"/>,run:onMarkets}]:[])]]}/>
      </div></InventoryToolbar>
    {selecting && <BulkSelectionBar framed count={picked.length} disabled={locked} zh={zh} onSelectAll={() => setSelected(selectVisible(selected, plugins.filter(p => p.canToggle || p.canUninstall).map(p => p.id)))} onInvert={() => setSelected(selectVisible(selected, plugins.filter(p => p.canToggle || p.canUninstall).map(p => p.id), true))}>
      <SkillBatchToggleControls count={picked.length} disabled={locked} canEnable={picked.some(p=>p.canToggle&&!p.enabled)} canDisable={picked.some(p=>p.canToggle&&p.enabled)} zh={zh} onChange={enabled=>onBatch(picked.filter(p=>p.canToggle&&p.enabled!==enabled),enabled?'enable':'disable')}/>
      <Button size="sm" variant="destructive" disabled={locked || !picked.some(p => p.canUninstall)} onClick={() => onBatch(picked.filter(p => p.canUninstall), 'uninstall')}>{t('卸载','Uninstall')}</Button>
    </BulkSelectionBar>}
    {loading && !snapshot ? <LoadingCards variant="inventory" className="skill-grid" label={t('正在读取插件…', 'Reading plugins…')} /> : !snapshot || !plugins.length ? <Empty><EmptyHeader><EmptyTitle>{availability ? t('原生插件管理不可用','Native plugin management unavailable') : !snapshot || snapshot.pluginsComplete === false && !snapshot.plugins.length ? t('插件读取未完成', 'Plugin inspection incomplete') : (query || source !== 'all' || status !== 'all') ? t('没有匹配的插件', 'No matching plugins') : t('尚未安装插件','No installed plugins')}</EmptyTitle>{availability && <EmptyDescription>{availability}</EmptyDescription>}</EmptyHeader><EmptyContent>{!snapshot || snapshot.pluginsComplete === false && !snapshot.plugins.length ? <Button variant="outline" onClick={onRefresh}>{t('重试', 'Retry')}</Button> : (query || source !== 'all' || status !== 'all') ? <Button variant="outline" onClick={() => {onQuery('');setSource('all');setStatus('all');setSelected([]);}}>{t('清除筛选', 'Clear filters')}</Button> : <Button onClick={onAdd}>{t('添加插件','Add plugins')}</Button>}</EmptyContent></Empty> : <div className="skill-grid grid auto-rows-fr gap-4">{plugins.map(plugin => {
      const selectable = plugin.canToggle || plugin.canUninstall;
      return <Card variant="inventory" className={cn("group min-w-0 text-left", !selecting&&"cursor-pointer active:ring-ring")} key={plugin.id} role={selecting ? 'checkbox' : 'article'} aria-label={selecting ? `${t('选择插件','Select plugin')} ${plugin.id}` : undefined} aria-checked={selecting ? selected.includes(plugin.id) : undefined} aria-disabled={selecting ? locked || !selectable : undefined} tabIndex={selecting && !locked && selectable ? 0 : undefined} onClick={selecting ? () => {if(!locked && selectable)setSelected(previous => selectVisible(previous, [plugin.id], true));} : event=>{if(!locked&&event.target instanceof Element&&!event.target.closest("button, a, input, select, textarea, [role='switch'], [role='checkbox'], [data-hint-disabled]"))onOpen(plugin);}} onKeyDown={selecting ? event => {if(event.target===event.currentTarget && (event.key===' ' || event.key==='Enter')){event.preventDefault();if(!event.repeat && !locked && selectable)setSelected(previous=>selectVisible(previous,[plugin.id],true));}} : undefined}>
        <InventoryCardHeader inert={selecting}
          selection={selecting&&<Checkbox className="size-3.5 shrink-0" checked={selected.includes(plugin.id)} disabled={locked||!selectable} tabIndex={-1} aria-hidden="true"/>}
          heading={<button type="button" className="flex w-full min-w-0 cursor-pointer items-center gap-2 text-left" disabled={locked} aria-label={`${t("查看插件详情","View plugin details")} ${plugin.name}`} onClick={()=>onOpen(plugin)}><CodexSkillIcon src={plugin.icon} fallback={<PackageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/>}/><OverflowText text={plugin.name} className="block truncate"/></button>}
          control={plugin.installed&&(plugin.canToggle?<Hint stable text={`${plugin.remote?t('账号','Account'):project?t('当前项目','This project'):t('用户默认','User default')} · ${plugin.enabled?t('已启用','Enabled'):t('已停用','Disabled')}`}><Switch checked={plugin.enabled} disabled={locked} aria-label={`${t('启用插件','Enable plugin')} ${plugin.id}`} onCheckedChange={enabled=>onAction(plugin,enabled?'enable':'disable')}/></Hint>:<span className="text-xs text-muted-foreground">{codexPluginStateLabel(plugin,zh)}</span>)}
          description={<OverflowText className="min-h-10 line-clamp-2 leading-5" text={plugin.description || t('暂无描述','No description')}/>}
        />
        <InventoryCardFooter inert={selecting} metadata={<span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><UserRoundIcon className="size-4 shrink-0" aria-hidden="true"/><OverflowText className="truncate" text={plugin.author || t('作者未提供','Author not provided')}/></span>}>
          {plugin.toggleScope==='project'&&plugin.projectEnabled!=null&&plugin.canToggle&&<Hint text={t('恢复继承设置','Restore inherited settings')}><Button variant="ghost" size="icon-sm" disabled={locked} aria-label={`${t('恢复继承设置','Restore inherited settings')} ${plugin.id}`} onClick={()=>onAction(plugin,'reset')}><RotateCcwIcon aria-hidden="true"/></Button></Hint>}
          {plugin.installed&&plugin.canCheckUpdates&&checks[plugin.id]?.canUpdate&&<Hint stable text={t('可更新','Update available')} disabled={locked}><Button variant="ghost" size="icon-sm" disabled={locked} aria-label={`${t('更新','Update')} ${plugin.name}`} onClick={()=>onUpdate(plugin)}><CircleArrowUpIcon className="text-skill-update" aria-hidden="true"/></Button></Hint>}
          {plugin.installed&&plugin.canUninstall&&<Hint stable text={t('卸载插件','Uninstall plugin')}><Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" disabled={locked} aria-label={`${t('卸载插件','Uninstall plugin')} ${plugin.id}`} onClick={()=>onAction(plugin,'uninstall')}><Trash2Icon aria-hidden="true"/></Button></Hint>}

        </InventoryCardFooter>
      </Card>;
    })}</div>}
  </section>;
}
