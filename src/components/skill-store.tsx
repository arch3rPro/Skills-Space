import { websiteIntroduction } from "@/lib/website-document";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ActivityIcon, ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, ExternalLinkIcon, GitBranchIcon, Globe2Icon, LoaderCircleIcon, PackagePlusIcon, RefreshCwIcon, SearchIcon, StarIcon, TagsIcon, XIcon } from 'lucide-react';
import { SkillDetail, SkillDetailHeader, SkillDetailMetadata, SkillMetadataField } from '@/components/skill-detail';
import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { NativeSelect, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { InventoryCard, InventoryCardHeader, InventoryCardFooter } from '@/components/inventory-card';
import { OverflowText } from '@/components/overflow-text';
import { Hint } from '@/components/hint';
import { LoadingCards } from '@/components/loading-cards';
import { Skeleton } from '@/components/ui/skeleton';
import { compactInstalls, createDescriptionLoader, createMarkdownLoader, createResourceLoader, searchPageItems, isWebsiteSource, marketplaceMetric, marketplaceMetricParts, marketplaceChange, marketplaceSourceUrl, type DescriptionLoader, type DescriptionRequest, type MarketplaceBoard, type MarketplaceSession, type WebsiteDocument } from '@/lib/marketplace';
import { notifyError, useFeedbackError } from '@/lib/notifications';
import type { MarketplacePage, MarketplaceSkill } from '@/lib/upstream';
import { cn } from '@/lib/utils';

const SkillDocument = lazy(() => import('@/components/skill-document').then(module => ({ default: module.SkillDocument })));
type Detail = { skill: MarketplaceSkill; metric: MarketplaceBoard | 'search'; loading: boolean; document: WebsiteDocument | null; content: string | null; missing: boolean };
export type SkillStoreBackend = {
  board: (board: MarketplaceBoard, page: number, pageSize: number, refresh: boolean) => Promise<MarketplacePage>;
  search: (query: string, owner: string) => Promise<MarketplaceSkill[]>;
  document: (id: string, requireMetadata: boolean) => Promise<WebsiteDocument>;
  markdown: (id: string) => Promise<string>;
  open: (url: string) => Promise<void>;
};
const desktopBackend: SkillStoreBackend = {
  board: (board, page, pageSize, refresh) => invoke('fetch_skill_leaderboard', { board, page, pageSize, refresh }),
  search: (query, owner) => invoke('upstream_find', { query, owner }),
  document: (id, requireMetadata) => invoke('fetch_skill_document', { id, requireDocument: false, ...(requireMetadata ? { requireMetadata } : {}) }),
  markdown: id => invoke('fetch_skill_markdown', { id }),
  open: openUrl,
};
type Props = {
  zh: boolean;
  initialPageSize: number;
  onPageSize: (size: number) => Promise<void>;
  disabled: boolean;
  session: RefObject<MarketplaceSession>;
  onInstall: (source?: string, agents?: string[], skills?: string[]) => void;
  backend?: SkillStoreBackend;
  embedded?: boolean;
  getScrollContainer?: () => HTMLElement | null;
};
const scrollContainer = () => document.getElementById('store-list') ?? document.getElementById('main-content');

function StoreDescription({ skill, cache, load, zh, getScrollContainer }: { skill: MarketplaceSkill; cache: Map<string, string>; load: DescriptionLoader; zh: boolean; getScrollContainer: () => HTMLElement | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(cache.has(skill.id) || skill.description ? 'ready' : 'loading');
  const [description, setDescription] = useState(cache.get(skill.id) || skill.description || null);
  const alive = useRef(true);
  const request = useRef<DescriptionRequest | null>(null);
  const read = useCallback(() => {
    request.current?.release();
    const current = load(skill.id);
    request.current = current;
    setState('loading');
    void current.promise.then(text => { if (alive.current && request.current === current) { request.current = null; setDescription(text); setState('ready'); } }, reason => { if (alive.current && request.current === current && !(reason instanceof DOMException && reason.name === 'AbortError')) { request.current = null; setState('failed'); } });
  }, [load, skill.id]);
  useEffect(() => {
    alive.current = true;
    if (cache.has(skill.id) || skill.description) return () => { alive.current = false; };
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        if (cache.has(skill.id)) { setDescription(cache.get(skill.id) || null); setState('ready'); }
        else if (!request.current) read();
      } else { const current = request.current; request.current = null; current?.release(); }
    }, { root: getScrollContainer(), rootMargin: '120px' });
    if (ref.current) observer.observe(ref.current);
    return () => { alive.current = false; observer.disconnect(); const current = request.current; request.current = null; current?.release(); };
  }, [cache, skill.id, skill.description, read, getScrollContainer]);
  return <div ref={ref} className="min-h-10">
    {state === 'loading' ? <div className="flex flex-col gap-2" role="status" aria-label={zh ? '正在读取简介…' : 'Loading description…'}><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>
      : description ? <OverflowText text={description} className="line-clamp-2 leading-5" />
      : state === 'failed' ? <span>{zh ? '简介暂不可用' : 'Description unavailable'}</span>
      : <span>{zh ? '暂无简介' : 'No description'}</span>}
  </div>;
}

function InstallationChange({ change, zh, compact = false }: { change: number | null; zh: boolean; compact?: boolean }) {
  const value = marketplaceChange(change, zh);
  if (!value) return null;
  const Icon = value.direction === 'up' ? ArrowUpRightIcon : value.direction === 'down' ? ArrowDownRightIcon : MinusIcon;
  return <Hint text={value.description} focusable><span className={cn("inline-flex items-center gap-1 whitespace-nowrap tabular-nums text-muted-foreground", compact && "text-xs")} role="img" aria-label={value.description}><Icon className="size-3.5" aria-hidden="true" /><span>{compact ? compactInstalls(value.amount, zh) : value.amount.toLocaleString(zh ? 'zh-CN' : 'en-US')}</span></span></Hint>;
}

function StoreCards({ skills, metric, descriptions, loadDescription, disabled, installingSource, zh, onOpen, onInstall, getScrollContainer }: {
  skills: MarketplaceSkill[]; metric: MarketplaceBoard | 'search'; descriptions: Map<string, string>;
  loadDescription: DescriptionLoader;
  getScrollContainer: () => HTMLElement | null;
  disabled: boolean; installingSource: string | null; zh: boolean; onOpen: (skill: MarketplaceSkill) => void; onInstall: (skill: MarketplaceSkill) => void;
}) {
  return <div className="skill-grid grid gap-4">{skills.map(skill => {
    const SourceIcon = isWebsiteSource(skill.source) ? Globe2Icon : GitBranchIcon;
    return <InventoryCard className="@container" key={skill.id} onOpen={() => onOpen(skill)}>
      <InventoryCardHeader heading={<button type="button" className="block w-full min-w-0 cursor-pointer text-left" onClick={() => onOpen(skill)} aria-label={`${zh ? '查看技能' : 'View skill'} ${skill.name}`}><OverflowText text={skill.name} className="block truncate" /></button>}
        description={<StoreDescription skill={skill} cache={descriptions} load={loadDescription} zh={zh} getScrollContainer={getScrollContainer} />} />
      <InventoryCardFooter metadata={<Hint text={skill.source} focusable><span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><SourceIcon className="size-3.5 shrink-0" aria-hidden="true" /><OverflowText text={skill.source} className="truncate" /></span></Hint>}>
        <Hint text={marketplaceMetric(skill, metric, zh)} focusable><span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs tabular-nums text-muted-foreground"><DownloadIcon className="size-3.5" aria-hidden="true" />{compactInstalls(skill.installs, zh)}</span></Hint>
        {metric === 'hot' && <InstallationChange change={skill.change} zh={zh} compact />}
        <span className="@[22rem]:hidden"><Hint text={!skill.previewable ? zh ? '该来源暂不支持安装预览，可打开详情查看来源。' : 'Install preview is unavailable for this source. Open details for its source.' : zh ? '安装' : 'Install'} disabled={disabled || !skill.previewable}>
          <Button variant="ghost" size="icon-sm" disabled={disabled || !skill.previewable} aria-busy={installingSource === skill.id} onClick={() => onInstall(skill)} aria-label={`${zh ? '安装' : 'Install'} ${skill.name}`}>{installingSource === skill.id ? <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <PackagePlusIcon aria-hidden="true" />}</Button>
        </Hint></span>
        <span className="hidden @[22rem]:inline-flex"><Hint text={!skill.previewable ? zh ? '该来源暂不支持安装预览，可打开详情查看来源。' : 'Install preview is unavailable for this source. Open details for its source.' : undefined} disabled={disabled || !skill.previewable}>
          <Button variant="ghost" size="sm" disabled={disabled || !skill.previewable} aria-busy={installingSource === skill.id} onClick={() => onInstall(skill)} aria-label={`${zh ? '安装' : 'Install'} ${skill.name}`}>{installingSource === skill.id ? <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <PackagePlusIcon aria-hidden="true" />}{zh ? '安装' : 'Install'}</Button>
        </Hint></span>
      </InventoryCardFooter>
    </InventoryCard>;
  })}</div>;
}

export function SkillStore({ zh, initialPageSize, onPageSize, disabled, session, onInstall, backend = desktopBackend, embedded = false, getScrollContainer = scrollContainer }: Props) {
  const [loadDocument] = useState(() => session.current.documentLoader ??= createResourceLoader(session.current.documents, id => backend.document(id, false)));
  const [loadDescription] = useState(() => session.current.descriptionLoader ??= createDescriptionLoader(session.current.descriptions, async id => {
    const document = await loadDocument(id);
    return document.description || (document.html ? websiteIntroduction(document.html) : null);
  }));
  const [loadMetadata] = useState(() => session.current.metadataLoader ??= createResourceLoader(session.current.documents, id => backend.document(id, true), document => document.metadata != null));
  const [loadMarkdown] = useState(() => session.current.markdownLoader ??= createMarkdownLoader(session.current.markdown, backend.markdown));
  const t = (cn: string, en: string) => zh ? cn : en;
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [board, setBoard] = useState(session.current.board);
  const [page, setPage] = useState(session.current.page);
  const [searchWindow, setSearchWindow] = useState(session.current.searchPage);
  const [installingSource, setInstallingSource] = useState<string | null>(null);
  const [draft, setDraft] = useState(session.current.query);
  const [query, setQuery] = useState(session.current.query);
  const [owner, setOwner] = useState(session.current.owner);
  const [ownerDraft, setOwnerDraft] = useState(session.current.owner);
  const [jumpPage, setJumpPage] = useState('');
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [boardResult, setBoardResult] = useState<{ key: string; data: MarketplacePage } | null>(null);
  const [searchResult, setSearchResult] = useState<{ key: string; query: string; owner: string; skills: MarketplaceSkill[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const forceRefresh = useRef(false);
  const [error, reportError] = useFeedbackError(zh);
  const [detailError, reportDetailError] = useFeedbackError(zh);
  const [detail, setDetail] = useState<Detail | null>(null);
  const detailRequest = useRef(0);
  const detailLease = useRef<DescriptionRequest | null>(null);
  const scrollPosition = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const boardKey = `${board}:${pageSize}:${page}`;
  const searchKey = `${query}\0${owner}`;
  const searching = query.length >= 2;
  const cachedBoard = session.current.boards.get(boardKey);
  const data = boardResult?.key === boardKey ? boardResult.data : cachedBoard;
  const searchData = searchResult?.key === searchKey ? searchResult.skills : session.current.searches.get(searchKey)?.skills;
  const items = searching ? searchData ?? searchResult?.skills : data?.skills;
  const searchWindowData = searchPageItems(items ?? [], searchWindow.key === searchKey ? searchWindow.page : 1, pageSize);
  const shownItems = searching ? searchWindowData.items : items;
  const currentPage = searching ? searchWindowData.page : page;
  const boardSummary = data ?? (boardResult?.key.startsWith(`${board}:${pageSize}:`) ? boardResult.data : null);
  const hasPageCount = searching ? !!searchData : !!boardSummary;
  const totalPages = searching ? searchWindowData.totalPages : boardSummary?.totalPages ?? 1;
  const installDisabled = disabled || installingSource !== null;
  const initialLoading = !items && !error;
  const previousSearch = searching && !searchData ? searchResult : null;

  useEffect(() => { if (initialPageSize !== pageSize) { setPageSize(initialPageSize); setPage(1); setSearchWindow({ key: searchKey, page: 1 }); } }, [initialPageSize]);
  useEffect(() => { setJumpPage(''); getScrollContainer()?.scrollTo({ top: 0 }); }, [board, query, owner, pageSize]);
  useEffect(() => { setSearchWindow(previous => previous.key !== searchKey || previous.page !== searchWindowData.page ? { key: searchKey, page: searchWindowData.page } : previous); }, [searchKey, searchWindowData.page]);
  useEffect(() => { session.current.searchPage = { key: searchKey, page: searchWindowData.page }; }, [session, searchKey, searchWindowData.page]);
  useEffect(() => { session.current.board = board; session.current.page = page; session.current.query = query; session.current.owner = owner; }, [board, page, query, owner, session]);
  useEffect(() => {
    if (composing) return;
    const next = draft.trim();
    if (next.length < 2) { setQuery(''); return; }
    const timer = window.setTimeout(() => setQuery(next), 250);
    return () => window.clearTimeout(timer);
  }, [draft, composing]);

  const requestKey = searching ? `search:${searchKey}` : boardKey;
  useEffect(() => {
    if (detail) return;
    let cancelled = false;
    const refresh = forceRefresh.current;
    forceRefresh.current = false;
    const cached = searching ? session.current.searches.get(searchKey) : session.current.boards.get(boardKey);
    const fresh = cached && (searching ? 'at' in cached && Date.now() - cached.at < 60_000 : 'fetchedAt' in cached && Date.now() / 1000 - cached.fetchedAt < 300);
    if (fresh && !refresh) { if (searching) { const previous = session.current.searches.get(searchKey); if (previous) setSearchResult({ key: searchKey, query, owner, skills: previous.skills }); } else if (cachedBoard) setBoardResult({ key: boardKey, data: cachedBoard }); setLoading(false); reportError(''); return; }
    setLoading(true); reportError('');
    async function load() {
      try {
        if (searching) {
          const skills = await backend.search(query, owner);
          const cache = session.current.searches;
          if (cache.size >= 10) { const oldest = cache.keys().next().value; if (oldest !== undefined) cache.delete(oldest); }
          cache.set(searchKey, { skills, at: Date.now() });
          if (!cancelled) setSearchResult({ key: searchKey, query, owner, skills });
        } else {
          let result = await backend.board(board, page, pageSize, refresh);
          session.current.boards.set(`${board}:${pageSize}:${result.page}`, result);
          if (!cancelled) { if (result.page !== page) setPage(result.page); else setBoardResult({ key: boardKey, data: result }); }
          if (result.stale && !refresh && !cancelled) {
            result = await backend.board(board, page, pageSize, true);
            session.current.boards.set(`${board}:${pageSize}:${result.page}`, result);
            if (!cancelled) { if (result.page !== page) setPage(result.page); else setBoardResult({ key: boardKey, data: result }); }
          }
        }
      } catch (reason) {
        if (!cancelled) reportError(String(reason), searching ? t('技能搜索失败，请重试。', 'Could not search skills. Try again.') : t('榜单读取失败，请重试。', 'Could not load the leaderboard. Try again.'));
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [requestKey, reload, !!detail, session, reportError]);

  useEffect(() => () => { detailRequest.current++; detailLease.current?.release(); }, []);
  const inspectDetail = useCallback(async (skill: MarketplaceSkill, metric: MarketplaceBoard | 'search', position?: number) => {
    const id = ++detailRequest.current;
    detailLease.current?.release(); detailLease.current = null;
    if (position !== undefined) scrollPosition.current = position;
    const cached = session.current.documents.get(skill.id);
    const content = session.current.markdown.get(skill.id) ?? null;
    const next: Detail = { skill, metric, loading: content === null, document: cached ?? null, content, missing: false };
    setDetail(next); reportDetailError('');
    getScrollContainer()?.scrollTo({ top: 0 });
    // Keep the existing introduction request alive when its card unmounts.
    const lease = loadDescription(skill.id);
    detailLease.current = lease;
    void lease.promise.then(() => {
      if (id === detailRequest.current) setDetail(current => current ? { ...current } : current);
    }, reason => {
      if (id === detailRequest.current) reportDetailError(String(reason), zh ? '技能简介读取失败，返回列表可重试。' : 'Could not read the introduction. Return to the list to retry.');
    }).finally(() => { if (detailLease.current === lease) detailLease.current = null; });
    const information = loadDocument(skill.id).then(
      document => document.metadata != null ? document : loadMetadata(skill.id),
      () => loadMetadata(skill.id),
    );
    void information.then(document => {
      if (id === detailRequest.current) setDetail(current => current ? { ...current, document } : current);
    }, reason => {
      if (id === detailRequest.current) reportDetailError(String(reason), zh ? '技能信息读取失败，返回列表刷新后可重试。' : 'Could not read skill information. Return to the list and refresh to retry.');
    });
    if (content !== null) return;
    try {
      const content = await loadMarkdown(skill.id);
      if (id === detailRequest.current) setDetail(current => current ? { ...current, loading: false, content } : current);
    } catch (sourceReason) {
      if (id !== detailRequest.current) return;
      try {
        let document = session.current.documents.get(skill.id);
        if (!document?.html) {
          document = await information;
          if (id !== detailRequest.current) return;
        }
        if (id !== detailRequest.current) return;
        if (!document.html) throw new Error('Complete website document is unavailable.');
        session.current.documents.set(skill.id, document);
        setDetail(current => current ? { ...current, loading: false, document } : current);
        reportDetailError(String(sourceReason), zh ? '原始 SKILL.md 读取失败，可重试；当前显示官网正文。' : 'Could not read SKILL.md. Showing the website preview; retry is available.');
      } catch (reason) {
        if (id === detailRequest.current) {
          setDetail(current => current ? { ...current, loading: false, missing: /\b404\b/.test(String(reason)) } : current);
          reportDetailError(String(reason), zh ? '技能正文读取失败，请重试。' : 'Could not read the skill document. Try again.');
        }
      } finally { if (id === detailRequest.current) detailLease.current = null; }
    }
  }, [loadMarkdown, loadDescription, loadDocument, loadMetadata, reportDetailError, session, zh, getScrollContainer]);

  function back() {
    ++detailRequest.current; detailLease.current?.release(); detailLease.current = null;
    setDetail(null); reportDetailError('');
    requestAnimationFrame(() => getScrollContainer()?.scrollTo({ top: scrollPosition.current }));
  }
  function clearSearch() { setSearchWindow({ key: '', page: 1 }); setDraft(''); setQuery(''); setOwner(''); setOwnerDraft(''); setOwnerOpen(false); }
  function changeBoard(value: string) { if (value !== 'alltime' && value !== 'trending' && value !== 'hot') return; clearSearch(); setBoard(value); setPage(value === board ? page : 1); }
  function refresh() { forceRefresh.current = true; setReload(value => value + 1); }
  async function resolveSource(skill: MarketplaceSkill) {
    if (!isWebsiteSource(skill.source)) return skill.source;
    if (session.current.documents.has(skill.id) && !session.current.documents.get(skill.id)?.sourceUrl) session.current.documents.delete(skill.id);
    const document = await loadDocument(skill.id);
    if (!document.sourceUrl) throw new Error(document.sourceError || 'Published installation source is unavailable.');
    return document.sourceUrl;
  }
  async function installSkill(skill: MarketplaceSkill) {
    if (installDisabled) return;
    setInstallingSource(skill.id);
    try { onInstall(await resolveSource(skill), [], [skill.skillId]); }
    catch (reason) { (detail ? reportDetailError : reportError)(String(reason), t(`无法读取 ${skill.name} 的安装来源，请重试。`, `Could not read the installation source for ${skill.name}. Try again.`)); }
    finally { setInstallingSource(null); }
  }
  async function openSource(skill: MarketplaceSkill) {
    try { external(isWebsiteSource(skill.source) ? await resolveSource(skill) : session.current.documents.get(skill.id)?.metadata?.repository?.url || marketplaceSourceUrl(skill)); }
    catch (reason) { reportDetailError(String(reason), t('无法读取技能来源，请重试。', 'Could not read the skill source. Try again.')); }
  }
  function selectPageSize(value: string) {
    void onPageSize(Number(value)).catch(reason => reportError(String(reason), t('每页数量未保存，请重试。', 'Could not save page size. Try again.')));
  }
  function changePage(value: number) {
    setJumpPage('');
    if (searching) setSearchWindow({ key: searchKey, page: value }); else setPage(value);
    getScrollContainer()?.scrollTo({ top: 0 });
  }
  function external(url: string) { void backend.open(url).catch(reason => notifyError(String(reason), zh)); }

  const detailMetadata = detail ? session.current.documents.get(detail.skill.id)?.metadata ?? detail.document?.metadata : null;
  const detailMetric = detail ? marketplaceMetricParts(detail.skill, detail.metric, zh) : null;
  const hasDetailPanels = !!(detailMetadata?.summaryHtml || detailMetadata?.installation?.command || detailMetadata?.installation?.prompt);
  if (detail) return <SkillDetail>
    <SkillDetailHeader title={detail.skill.name} description={session.current.descriptions.get(detail.skill.id) || detail.document?.description || undefined} backLabel={searching ? t('返回搜索结果', 'Back to search') : t('返回排行榜', 'Back to leaderboard')} onBack={back} actions={<>
      {!detail.loading && !detail.content && (detail.document?.html || hasDetailPanels) && <Button variant="ghost" size="sm" onClick={() => void inspectDetail(detail.skill, detail.metric)}><RefreshCwIcon aria-hidden="true" />{t('重试源码', 'Retry source')}</Button>}
      <Hint text={!detail.skill.previewable ? t('该来源暂不支持安装预览。', 'Install preview is unavailable for this source.') : undefined} disabled={installDisabled || !detail.skill.previewable}><Button disabled={installDisabled || !detail.skill.previewable} aria-busy={installingSource === detail.skill.id} onClick={() => void installSkill(detail.skill)}>{installingSource === detail.skill.id ? <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <PackagePlusIcon aria-hidden="true" />}{t('安装', 'Install')}</Button></Hint>
    </>} />
    <SkillDetailMetadata>
      <SkillMetadataField label={isWebsiteSource(detail.skill.source) ? t('来源', 'Source') : t('仓库', 'Repository')} icon={isWebsiteSource(detail.skill.source) ? <Globe2Icon className="size-4" aria-hidden="true" /> : <GitBranchIcon className="size-4" aria-hidden="true" />}>
        <button type="button" className="skill-metadata-link text-left" onClick={() => void openSource(detail.skill)} aria-label={`${isWebsiteSource(detail.skill.source) ? t('打开网站', 'Open website') : t('打开仓库', 'Open repository')} ${detail.skill.source}`}>{isWebsiteSource(detail.skill.source) ? session.current.documents.get(detail.skill.id)?.sourceUrl || detail.skill.source : detailMetadata?.repository?.label || detail.skill.source}</button>
      </SkillMetadataField>
      {detailMetadata?.githubStars && <SkillMetadataField label={t('收藏', 'GitHub Stars')} icon={<StarIcon className="size-4" aria-hidden="true" />}><span className="tabular-nums">{detailMetadata.githubStars}</span></SkillMetadataField>}
      {detailMetric && <SkillMetadataField label={detailMetric.label} icon={<DownloadIcon className="size-4" aria-hidden="true" />}>
        <span className="tabular-nums">{detailMetric.value}</span>{(detail.metric === 'hot' || detail.metric === 'trending') && <span className="ms-2 text-xs text-muted-foreground">{detailMetric.label}</span>}
      </SkillMetadataField>}
      {detail.metric === 'hot' && detail.skill.change !== null && <SkillMetadataField label={t('活跃度', 'Activity')} icon={<ActivityIcon className="size-4" aria-hidden="true" />}><InstallationChange change={detail.skill.change} zh={zh} /></SkillMetadataField>}
      {!!detailMetadata?.topics.length && <SkillMetadataField label={t('主题', 'Topics')} icon={<TagsIcon className="size-4" aria-hidden="true" />}>
        <div className="flex min-w-0 flex-wrap gap-2">{detailMetadata.topics.map(topic => <Badge key={topic.url} variant="secondary" className="max-w-full" asChild><a href={topic.url} onClick={event => { event.preventDefault(); external(topic.url); }}><OverflowText text={topic.label} className="min-w-0 truncate" /></a></Badge>)}</div>
      </SkillMetadataField>}
    </SkillDetailMetadata>
    {detail.loading || detail.content || detail.document?.html || hasDetailPanels ? <Suspense fallback={<Skeleton className="h-32 w-full" />}><SkillDocument key={detail.skill.id} content={detail.content ?? ''} html={detail.document?.html ?? undefined} preferInstallation installation={detailMetadata?.installation} overviewHtml={detailMetadata?.summaryHtml} loading={detail.loading} zh={zh} onOpenExternal={external} /></Suspense>
      : <Empty><EmptyHeader><EmptyMedia variant="icon"><SearchIcon aria-hidden="true" /></EmptyMedia><EmptyTitle>{detail.missing ? t('官网未找到此技能', 'Skill not found on skills.sh') : detailError ? t('技能说明读取失败', 'Could not read skill details') : t('此来源暂不支持内容预览', 'Content preview is unavailable')}</EmptyTitle><EmptyDescription>{t('可打开来源查看技能说明。', 'Open the source to read the skill.')}</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={() => void inspectDetail(detail.skill, detail.metric)}>{t('重试', 'Try again')}</Button><Button variant="ghost" onClick={() => void openSource(detail.skill)}>{t('打开来源', 'Open source')}<ExternalLinkIcon aria-hidden="true" /></Button></EmptyContent></Empty>}
  </SkillDetail>;

  return <section className="inventory-content store-page flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-hidden">
    {!embedded && <header className="shrink-0"><h1>{t('技能商店', 'Skill store')}</h1></header>}
    <div className={cn("flex shrink-0 items-center gap-3", embedded ? "flex-wrap" : "layout-toolbar")}>
      <ToggleGroup type="single" size="xs" className="segmented-control shrink-0" value={searching ? '' : board} onValueChange={changeBoard} aria-label={t('排行榜', 'Leaderboard')}>
        <ToggleGroupItem value="alltime">{t('总榜', 'All time')}</ToggleGroupItem><ToggleGroupItem value="trending">{t('趋势', 'Trending')}</ToggleGroupItem><ToggleGroupItem value="hot">{t('热门', 'Hot')}</ToggleGroupItem>
      </ToggleGroup>
      <form className="relative min-w-36 flex-1" onSubmit={event => { event.preventDefault(); if (!composing && draft.trim().length >= 2) { if (query === draft.trim()) refresh(); else setQuery(draft.trim()); } }}>
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input ref={searchInput} className="pl-8 pr-8" aria-label={t('搜索全部技能', 'Search all skills')} placeholder={t('搜索全部技能…', 'Search all skills…')} autoComplete="off" spellCheck={false} maxLength={200} value={draft} onChange={event => { const next = event.target.value; setDraft(next); if (!next.trim()) clearSearch(); }} onCompositionStart={() => setComposing(true)} onCompositionEnd={event => { setDraft(event.currentTarget.value); setComposing(false); }} />
        {draft && <div className="absolute inset-y-0 right-1 flex items-center"><Button variant="ghost" size="icon-xs" aria-label={t('清空搜索并返回排行榜', 'Clear search and return to leaderboard')} onClick={() => { clearSearch(); searchInput.current?.focus(); }}><XIcon aria-hidden="true" /></Button></div>}
      </form>
      <Button variant="ghost" disabled={loading} aria-busy={loading} onClick={refresh}><RefreshCwIcon aria-hidden="true" className={cn(loading && 'animate-spin motion-reduce:animate-none')} />{t('刷新', 'Refresh')}</Button>
      <Button disabled={installDisabled} onClick={() => onInstall()}><PackagePlusIcon aria-hidden="true" />{t('安装技能', 'Install skills')}</Button>
    </div>
    {(searching || draft.trim().length === 1 || error) && <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span role="status">{draft.trim().length === 1 ? t('至少输入 2 个字符进行搜索', 'Enter at least 2 characters to search') : previousSearch ? t(`“${query}”${error ? '未加载' : '正在搜索'}；下方为上次“${previousSearch.query}”${previousSearch.owner ? `（${previousSearch.owner}）` : ''}的结果`, `“${query}” ${error ? 'could not be loaded' : 'is loading'}; showing previous results for “${previousSearch.query}”${previousSearch.owner ? ` (${previousSearch.owner})` : ''}`) : loading ? t('正在搜索…', 'Searching…') : searching && searchData ? t(`“${query}” · ${searchData.length} 项${searchData.length === 100 ? '（最多显示 100 项）' : ''}`, `“${query}” · ${searchData.length} results${searchData.length === 100 ? ' (up to 100)' : ''}`) : null}</span>
      <div className="flex items-center gap-2">{error && (!embedded || Boolean(items?.length)) && <Button size="sm" variant="outline" onClick={refresh}>{t('重试', 'Retry')}</Button>}{searching && <Popover open={ownerOpen} onOpenChange={setOwnerOpen}><PopoverTrigger asChild><Button size="sm" variant="ghost">{owner || t('来源', 'Source')}</Button></PopoverTrigger><PopoverContent><form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); setOwner(ownerDraft.trim()); setOwnerOpen(false); }}><Field><FieldLabel htmlFor="store-owner">{t('GitHub 用户或组织', 'GitHub user or organization')}</FieldLabel><Input id="store-owner" value={ownerDraft} maxLength={39} onChange={event => setOwnerDraft(event.target.value)} /></Field><div className="flex justify-end gap-2">{owner && <Button variant="ghost" onClick={() => { setOwner(''); setOwnerDraft(''); setOwnerOpen(false); }}>{t('清除', 'Clear')}</Button>}<Button type="submit">{t('应用', 'Apply')}</Button></div></form></PopoverContent></Popover>}</div>
    </div>}
    <div id="store-list" className="app-content min-w-0">
    {initialLoading ? <LoadingCards variant="inventory" count={6} label={searching ? t('正在搜索…', 'Searching…') : t('正在读取排行榜…', 'Loading leaderboard…')} className="skill-grid" />
      : items?.length ? <StoreCards getScrollContainer={getScrollContainer} key={reload} skills={shownItems ?? []} metric={searching ? 'search' : board} descriptions={session.current.descriptions} loadDescription={loadDescription} zh={zh} disabled={installDisabled} installingSource={installingSource} onInstall={skill => void installSkill(skill)} onOpen={skill => void inspectDetail(skill, searching ? 'search' : board, getScrollContainer()?.scrollTop ?? 0)} />
      : <Empty className="min-h-64"><EmptyHeader><EmptyMedia variant="icon"><SearchIcon aria-hidden="true" /></EmptyMedia><EmptyTitle>{error ? t('无法加载技能', 'Could not load skills') : searching ? t('未找到匹配的技能', 'No matching skills') : t('暂无技能', 'No skills')}</EmptyTitle>{searching && !error && <EmptyDescription>{t('试试其他关键词，或清除来源筛选。', 'Try another keyword or clear the source filter.')}</EmptyDescription>}</EmptyHeader><EmptyContent>{error ? <Button variant="outline" onClick={refresh}>{t('重试', 'Retry')}</Button> : searching && <Button variant="outline" onClick={clearSearch}>{t('返回排行榜', 'Back to leaderboard')}</Button>}</EmptyContent></Empty>}
    </div>
    <nav className="flex shrink-0 flex-wrap items-center justify-center gap-3" aria-label={searching ? t('搜索结果分页', 'Search results pagination') : t('榜单分页', 'Leaderboard pagination')}>
      {embedded ? <NativeSelect value={pageSize} disabled={loading || disabled} aria-label={t('每页数量', 'Items per page')} onChange={event => selectPageSize(event.target.value)}>
        {[12,24,48].map(size => <option key={size} value={size}>{t(`${size} 项 / 页`, `${size} / page`)}</option>)}
      </NativeSelect> : <Select value={String(pageSize)} disabled={loading || disabled} onValueChange={selectPageSize}><SelectTrigger aria-label={t('每页数量', 'Items per page')}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{[12,24,48].map(size => <SelectItem key={size} value={String(size)}>{t(`${size} 项 / 页`, `${size} / page`)}</SelectItem>)}</SelectGroup></SelectContent></Select>}
      <Button size="icon" variant="outline" aria-label={t('上一页', 'Previous page')} disabled={!hasPageCount || currentPage <= 1 || loading} onClick={() => changePage(currentPage - 1)}><ChevronLeftIcon aria-hidden="true" /></Button>
      <span className="text-sm tabular-nums text-muted-foreground">{currentPage} / {hasPageCount ? totalPages : '—'}</span>
      <Button size="icon" variant="outline" aria-label={t('下一页', 'Next page')} disabled={!hasPageCount || currentPage >= totalPages || loading} onClick={() => changePage(currentPage + 1)}><ChevronRightIcon aria-hidden="true" /></Button>
      <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); const value = Number(jumpPage); if (Number.isInteger(value) && value >= 1 && value <= totalPages && hasPageCount && !loading) changePage(value); }}><Field orientation="horizontal"><FieldLabel htmlFor="store-jump-page" className="sr-only">{t('跳转页码', 'Go to page')}</FieldLabel><Input id="store-jump-page" className="w-20" type="number" inputMode="numeric" min={1} max={totalPages} step={1} required value={jumpPage} placeholder={t('页码', 'Page')} disabled={loading || !hasPageCount} onChange={event => setJumpPage(event.target.value)} /><Button size="sm" variant="outline" type="submit" disabled={loading || !hasPageCount || !jumpPage}>{t('跳转', 'Go')}</Button></Field></form>
    </nav>
    {loading && items && <span className="sr-only" role="status"><LoaderCircleIcon aria-hidden="true" />{t('正在刷新…', 'Refreshing…')}</span>}
  </section>;
}
