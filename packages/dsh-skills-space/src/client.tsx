import { DshDirectoryEmpty, DshPresetEmpty } from "@/components/dsh-directory-empty";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Columns2Icon, FolderOpenIcon, GitBranchIcon, GlobeIcon, Grid2X2Icon, InfoIcon, FilePenLineIcon, ListChecksIcon, PackagePlusIcon, RefreshCwIcon, SearchIcon, StoreIcon, Trash2Icon } from "lucide-react";
import { BulkSelectionBar } from "@/components/bulk-selection-bar";
import { Hint } from "@/components/hint";
import { InventoryCard, InventoryCardFooter, InventoryCardHeader, InventoryListRow, InventoryListActions } from "@/components/inventory-card";
import { InventoryEmpty } from "@/components/inventory-empty";
import { InventoryToolbar } from "@/components/inventory-toolbar";
import { LoadingCards } from "@/components/loading-cards";
import { Modal, ModalActions } from "@/components/modal";
import { OperationResults } from "@/components/operation-results";
import { OverflowText } from "@/components/overflow-text";
import { PresetChoiceCards } from "@/components/preset-choice-cards";
import { SkillDetail, SkillDetailField, SkillDetailHeader, SkillDetailMetadata, SkillDetailPath, SkillDetailVersion } from "@/components/skill-detail";
import { dshPresetText, dshSourceLabel, canChangeDsh, dshBatchEligibility, type DshSkillState, type DshPolicyAction } from "@/lib/dsh";
import type { OperationResult, Target } from "@/lib/upstream";
import { DshPolicySwitch, DshPolicyChannels } from "@/components/dsh-policy-controls";
import { DshBatchControls, type DshBatchController, type DshPolicySubmission } from "@/components/dsh-batch-actions";
import { SkillDocument } from "@/components/skill-document";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { OverlayContainer } from "@/components/ui/overlay-container";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { notifyError, notifySuccess } from "@/lib/notifications";
import sonnerStyles from "sonner/dist/styles.css?inline";
import { SkillStore, type SkillStoreBackend } from "@/components/skill-store";
import { createMarketplaceSession } from "@/lib/marketplace";
import { Choice } from "./choice";
import { asInstalled, managedSkills, nativeSkills, filterInventory, nativeDirectoryState } from "./inventory";
import { managedSkillSourceOptions, managedSkillSourceLabel } from "@/lib/managed-skill-filters";
import { Installation, type Destination, type InstallationStart, type InstallPreview, type InstallResult } from "./installation";
import { DirectorySettings, directoryDraft, type DirectoryConfiguration, type DirectoryDraft, type DirectoryEditorHandle } from "./directories";
import { RemoveSkills, removalReason, type RemovalItem, type RemovalPreview, type RemovalResult } from "./file-actions";
import styles from "./surface.css?inline";

const id = "dsh-skills-space";
// @property rules inside a shadow tree do not register document properties.
// Apply Tailwind's own fallback defaults here, including both translate axes,
// so switches, focus rings and shadows have the same initial values as the app.
const shadowStyles = styles.replace(/:root/g, ":host").replace(
  /@layer properties\s*\{\s*@supports[^{}]+\{([\s\S]*?)\}\s*\}\s*\}/,
  "@layer properties{$1}}",
);
const labels = {
  "user-dsh": ["DSH 原生", "DSH native"],
  "user-agents": ["共享技能", "Shared skills"],
  "project-dsh": ["项目 DSH", "Project DSH"],
  "project-agents": ["项目共享", "Project shared"],
  custom: ["附加目录", "Additional directory"],
  bundled: ["内置技能", "Bundled"],
};
export type Translate = (zh: string, en: string) => string;
type Placement = "settings" | "sidebar" | "both";
type Directories = { defaults: boolean | null; watch: boolean | null; dsh: string | null; shared: string | null; additional: string[]; builtinAdditional?: boolean; partial: boolean };
export type Preset = { id: string; label: string; name?: string; description?: string; directoryStatus: "available" | "none" | "unknown"; directories: Directories[]; directoryEdit?: DirectoryConfiguration; directoryReadOnly?: string | null; installGlobal: boolean; installProject: boolean; discoversGlobal: boolean; discoversProject: boolean };
export type Bootstrap = { userHome: string; configuration?: {path:string;exists:boolean;canOpen:boolean}; placement: Placement; reveal: boolean; installGlobal: boolean; presets: Preset[]; workspaces: { id: string; title: string; path: string; installable: boolean }[] };
export type Skill = { id: string; name: string; description: string; path: string; source: string; shadowed: boolean; discoverable: boolean; managed: boolean | null; cliAddressable: boolean; installation?: { source: string | null; sourceType: string | null; sourceUrl: string | null; version?: string | null }; managedRemovable: boolean; nativeRemovable: boolean; removable: boolean; state?: DshSkillState };
type Inventory = { items: Skill[]; partial: boolean; partialPresets?: string[]; runtimePresets?: string[]; readFailedPresets?: string[]; managedPartial?: boolean; managedConfigurationRevision?: string; configurationRevision?: string; policy?: { status: 'ready' | 'error'; revision: string | null; file: string; issue?: string };  ownership?: 'ready' | 'error'; removalBatchLimit?: number; policyBatchLimit?: number };

async function request<T>(query: Record<string, string> = {}, options?: RequestInit): Promise<T> {
  const url = new URL("api/dsh-skills-space", document.baseURI);
  url.search = new URLSearchParams(query).toString();
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    if(error?.error==='configuration-open'&&typeof error.message==='string')throw new Error(error.message);
    throw new Error(["destination", "directory-fields", "directory-conflict", "occupied", "preview-expired", "selection", "installation-busy", "creation-directory", "creation-unverified", "creation-failed", "removal-conflict", "removal-unavailable", "policy-selection", "policy-conflict", "policy-unavailable"].includes(error?.error) ? error.error : `Skills Space request failed (${response.status})`);
  }
  return response.json();
}

const storeBackend: SkillStoreBackend = {
  board: (board, page, size) => request({ store: board, page: String(page), size: String(size) }),
  search: (q, owner) => request({ store: "search", q, owner }),
  document: (id, metadata) => request({ store: "document", id, ...(metadata ? { metadata: "1" } : {}) }),
  markdown: id => request({ store: "markdown", id }),
  open: async value => {
    const url = URL.parse(value);
    if (url && ["https:", "http:"].includes(url.protocol) && !url.username && !url.password) window.open(url.href, "_blank", "noopener,noreferrer");
  },
};

function writeRequest<T>(action: "preview" | "install" | "directories" | "create" | "removal-preview" | "remove" | "reveal" | "policy" | "open-configuration" | "open-directory", payload: object) {
  return request<T>({ action }, { method: "POST", headers: { "Content-Type": "application/json", "X-DSH-Skills-Space": action }, body: JSON.stringify(payload) });
}

function useRequest<T>(load: (signal: AbortSignal) => Promise<T>, key: string, revision: number) {
  const [state, setState] = useState<{ key: string; revision: number; data?: T; failed?: boolean }>();
  useEffect(() => {
    const abort = new AbortController();
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]);
    void load(signal).then(
      data => { if (!abort.signal.aborted) setState({ key, revision, data }); },
      () => { if (!abort.signal.aborted) setState({ key, revision, failed: true }); },
    );
    return () => abort.abort();
  }, [load, key, revision]);
  return state?.key === key ? { ...state, refreshing: revision !== state.revision } : undefined;
}

type Appearance={subscribe:(notify:()=>void)=>()=>void;getSnapshot:()=>{active:{colorScheme:'light'|'dark';tokens:Record<string,string>};revision:number}};
function Surface({ children, appearance }: { children: ReactNode; appearance:Appearance }) {
  const [target, setTarget] = useState<ShadowRoot | null>(null);
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const attach = useCallback((element: HTMLDivElement | null) => {
    if (element) setTarget(element.shadowRoot ?? element.attachShadow({ mode: "open" }));
  }, []);
  const theme = useSyncExternalStore(appearance.subscribe, appearance.getSnapshot);
  return <div ref={attach}>
    {target && createPortal(<><style>{shadowStyles}</style><div className={theme.active.colorScheme==='dark' ? "dsh-skills-surface dark" : "dsh-skills-surface"} style={{colorScheme:theme.active.colorScheme}}>
      <div ref={setOverlay} />
      <OverlayContainer.Provider value={overlay ?? undefined}><TooltipProvider>{children}</TooltipProvider></OverlayContainer.Provider>
    </div></>, target)}
  </div>;
}

function SpaceIcon() {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <rect x="3.5" y="4.5" width="6" height="6" rx="1.3" /><rect x="3.5" y="14.5" width="6" height="6" rx="1.3" />
    <rect x="13.5" y="14.5" width="6" height="6" rx="1.3" /><path d="m17 2.8 4.5 4.5-4.5 4.5-4.5-4.5L17 2.8Z" />
  </svg>;
}

function Notice({ title, description }: { title: string; description?: string }) {
  return <Empty className="min-h-32"><EmptyHeader><EmptyTitle>{title}</EmptyTitle>{description && <EmptyDescription>{description}</EmptyDescription>}</EmptyHeader></Empty>;
}
function Loading({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="grid gap-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24" /></div>;
}
function sourceLabel(source: string, t: Translate) {
  const names = Object.entries(labels).find(([key]) => key === source)?.[1];
  return names ? t(names[0], names[1]) : source;
}
function presetText(preset: Preset, t: Translate) {
  return dshPresetText({ preset: preset.id, presetName: preset.name ?? (preset.label !== preset.id ? preset.label : undefined), presetDescription: preset.description }, t('zh', 'en') === 'zh');
}
function inventorySource(skill: Skill, collection: string, t: Translate) {
  const zh = t('zh', 'en') === 'zh';
  return collection === 'managed' ? managedSkillSourceLabel(asInstalled(skill), zh) : skill.state ? dshSourceLabel(skill.state, zh) : sourceLabel(skill.source, t);
}
function DetailsMetadata({ skill, home, t, collection, onOpen, compact, version, versionState }: { skill: Skill; home: string; t: Translate; collection: string; onOpen?: () => void; compact?: boolean; version: string | null; versionState: "loading" | "ready" | "error" }) {
  return <SkillDetailMetadata compact={compact}>
      <SkillDetailVersion version={version} state={versionState} zh={t('zh', 'en') === 'zh'}/>
      <SkillDetailField icon={FolderOpenIcon} label={t('技能位置', 'Skill location')}>
        <SkillDetailPath path={skill.path} home={home} openLabel={t('打开目录', 'Open folder')} onOpen={onOpen}/>
      </SkillDetailField>
      <SkillDetailField icon={collection === 'managed' ? GitBranchIcon : FolderOpenIcon} label={t('安装来源', 'Installation source')}>
        {inventorySource(skill, collection, t)}
      </SkillDetailField>
    </SkillDetailMetadata>;
}
function Details({ skill, home, collection, workspace, revision, t, onRetry, onOpen, compact }: {
  skill: Skill; home: string; collection: string; workspace: string; revision: number; t: Translate; onRetry: () => void; onOpen?: () => void; compact?: boolean;
}) {
  const load = useCallback((signal: AbortSignal) => request<{ content: string; version: string | null }>({ inventory: "1", ...(workspace ? { workspace } : {}), skill: skill.id }, { signal }), [workspace, skill.id]);
  const state = useRequest(load, JSON.stringify([workspace, skill.id]), revision);
  const installedVersion = collection === 'managed' ? skill.installation?.version : null;
  const versionState = installedVersion ? 'ready' : !state ? 'loading' : state.failed ? 'error' : 'ready';
  return <section aria-label={t('技能预览', 'Skill preview')} className="flex min-w-0 flex-col gap-4">
    <DetailsMetadata skill={skill} home={home} collection={collection} t={t} onOpen={onOpen} compact={compact} version={installedVersion ?? state?.data?.version ?? null} versionState={versionState}/>
    {!skill.discoverable && <p className="text-sm text-muted-foreground">{t('已安装到共享目录，当前预设未确认发现此文件。', 'Installed in the shared directory; discovery is not confirmed for the selected preset.')}</p>}
    {skill.shadowed && <p className="text-sm text-muted-foreground">{t('存在优先级更高的同名技能。', 'A higher-priority skill has the same name.')}</p>}
    {!state ? <Loading label={t('读取技能正文', 'Reading skill document')} /> : state.failed
      ? <><Notice title={t('无法读取技能正文', 'Could not read the skill document')} /><Button variant="outline" className="self-start" disabled={state.refreshing} onClick={onRetry}>{t('重试', 'Retry')}</Button></>
      : <SkillDocument content={state.data?.content ?? ''} zh={t('zh', 'en') === 'zh'} onOpenExternal={url => window.open(url, '_blank', 'noopener,noreferrer')} />}
  </section>;
}
function hasInstallationTarget(config: Bootstrap) { return config.installGlobal || config.workspaces.some(item => item.installable); }
type Filters = { source: string; query: string; status: string };
type Preferences = { workspace: string; preset: string; layout: string; collection: string; filters: Map<string, Filters> };
type SessionView = { scope: string; global: Preferences; project: Preferences };
const emptyFilters: Filters = { source: 'all', query: '', status: 'all' };
const inventoryPreferences = (): Preferences => ({ workspace: '', preset: 'all', layout: 'cards', collection: 'native', filters: new Map() });

function InventoryPage({ config, project, t, preferences, reload, onInstall, inventoryRevision, onMutation }: {
  config: Bootstrap; project: boolean; t: Translate; preferences: Preferences; reload: () => Promise<boolean>; onInstall: (destination: Destination) => void;
  inventoryRevision: number; onMutation: () => void;
}) {
  const [workspace, setWorkspace] = useState(preferences.workspace);
  const [preset, setPreset] = useState(preferences.preset);
  const [layout, setLayout] = useState(preferences.layout);
  const [collection, setCollection] = useState(preferences.collection);
  const [filters, setFilters] = useState(preferences.filters);
  const [openSkill, setOpenSkill] = useState('');
  const [localRevision, setRevision] = useState(0);
  const revision = localRevision + inventoryRevision;
  const [selection, setSelection] = useState<{ context: string; ids: string[] }>();
  const [removal, setRemoval] = useState<RemovalPreview & { destination: Destination; collection: string; source?: string }>();
  const [reviewing, setReviewing] = useState(false);
  const [removalResult, setRemovalResult] = useState<OperationResult>();
  const [locating, setLocating] = useState<string>();
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyIntent, setPolicyIntent] = useState<{id:string;action:DshPolicyAction}>();
  const policyController = useRef<DshBatchController>(null);
  useLayoutEffect(()=>{if(policyIntent)policyController.current?.run(policyIntent.action);},[policyIntent]);
  const actionTrigger = useRef<HTMLElement | null>(null);
  const bulkTrigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const activeContext = useRef('');
  const [checkingContext, setCheckingContext] = useState(false);
  const lastCard = useRef('');
  const detailBack = useRef<HTMLButtonElement>(null);
  const cardButtons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => { if (project) void reload(); }, [project, reload]);
  const presetChoices = config.presets.filter(item => item.directoryStatus !== 'none');
  const selectedPreset = presetChoices.find(item => item.id === preset);
  const presetId = selectedPreset?.id ?? 'all';
  useEffect(() => {
    if (preset !== presetId) { preferences.preset = presetId; setPreset(presetId); if (collection === 'native') { setSelection(undefined); setOpenSkill(''); } }
  }, [preset, presetId, preferences, collection]);
  const selectedWorkspace = project ? config.workspaces.find(item => item.id === workspace) ?? config.workspaces[0] : undefined;
  const workspaceId = selectedWorkspace?.id ?? '';
  const enabled = Boolean(!project || selectedWorkspace);
  const inventoryCache = useRef<{ key: string; data: Inventory } | undefined>(undefined);
  const load = useCallback(async (signal: AbortSignal): Promise<Inventory> => {
    if (!enabled) return { items: [], partial: false };
    const data = await request<Inventory>({ inventory: '1', ...(workspaceId ? { workspace: workspaceId } : {}) }, { signal });
    const key = JSON.stringify([config.configuration?.path, workspaceId]);
    const previous = inventoryCache.current?.key === key ? inventoryCache.current.data.items : [];
    const known = new Map(previous.filter(item => item.managed || item.cliAddressable).map(item => [item.id, item]));
    const merged = new Map(data.items.map(item => [item.id, data.ownership === 'error' ? { ...item,
      managed: known.get(item.id)?.managed ?? item.managed, installation: known.get(item.id)?.installation ?? item.installation,
      removable: false, managedRemovable: false, nativeRemovable: false } : item]));
    for (const item of previous) {
      const unreadable = item.state?.memberships?.some(member => data.partialPresets?.includes(member.presetKey ?? ''));
      const current = merged.get(item.id);
      if (unreadable && current?.state) {
        const members = [...current.state.memberships ?? []];
        for (const member of item.state?.memberships ?? []) if (data.partialPresets?.includes(member.presetKey ?? '') && !members.some(value => value.presetKey === member.presetKey)) members.push(member);
        const shadowed = members.length > 0 && members.every(member => member.shadowed === true);
        merged.set(item.id, { ...current, discoverable: members.length > 0, shadowed, state: { ...current.state, memberships: members, shadowed } });
      }
      if (!merged.has(item.id) && (unreadable || (data.managedPartial || data.ownership === 'error') && known.has(item.id))) {
        merged.set(item.id, { ...item, removable: false, managedRemovable: false, nativeRemovable: false,
          state: item.state && { ...item.state, canSetPolicy: false, policyBlocker: 'unavailable' } });
      }
    }
    const result = { ...data, items: [...merged.values()] };
    if (data.ownership !== 'error') inventoryCache.current = { key, data: result };
    return result;
  }, [enabled, config.configuration?.path, workspaceId]);
  const inventoryKey = JSON.stringify([config.configuration?.path, workspaceId]);
  const context = JSON.stringify([config.configuration?.path, workspaceId, collection]);
  useLayoutEffect(() => { activeContext.current = context; return () => { activeContext.current = ''; }; }, [context]);
  const state = useRequest(load, inventoryKey, revision);
  const inventory = state?.data?.items ?? [];
  const managed = managedSkills(inventory);
  const native = nativeSkills(inventory, 'all');
  const items = collection === 'managed' ? managed : nativeSkills(inventory, presetId);
  const anyTarget = hasInstallationTarget(config);
  const add = () => onInstall({ workspace: workspaceId || null });
  const { source, query, status } = filters.get(context) ?? emptyFilters;
  function changeFilters(next: Partial<Filters>) {
    const updated = new Map(filters).set(context, { ...emptyFilters, ...filters.get(context), ...next });
    preferences.filters = updated; setFilters(updated);
    if (next.source !== undefined || next.status !== undefined) setSelection(undefined);
  }
  const sources = managedSkillSourceOptions(managed.map(asInstalled), t('zh', 'en') === 'zh');
  const sourceFilter = sources.some(item => item.value === source) ? source : 'all';
  const managedStatus = ['enabled', 'disabled'].includes(status) ? status : 'all';
  const needle = query.trim();
  const visible = filterInventory(items, collection, query, sourceFilter, managedStatus);
  useEffect(() => {
    if (collection === 'managed' && state?.data && state.data.ownership !== 'error' && !state.data.managedPartial && (source !== sourceFilter || status !== managedStatus)) changeFilters({ source: sourceFilter, status: managedStatus });
  }, [collection, context, source, sourceFilter, status, managedStatus, state?.data]);
  function clearFilters() {
    changeFilters(emptyFilters); setOpenSkill('');
    if (collection === 'native') { preferences.preset = 'all'; setPreset('all'); }
  }
  const directoryState = nativeDirectoryState(state?.data, presetId);
  const presetNames = (ids: string[]) => config.presets.filter(item => ids.includes(item.id)).map(item => presetText(item, t).name).join('、');
  const runtimeDescription = t(`${presetNames(directoryState.runtime)}的部分技能目录由预设规则动态确定。这里显示已能确定的文件技能。`, `Some directories in ${presetNames(directoryState.runtime)} are determined by preset rules. This list shows confirmed file skills.`);
  const partial = collection === 'managed' ? state?.data?.managedPartial || managed.some(item => item.state?.policyBlocker === 'unavailable')
    : directoryState.failed.length > 0 || items.some(item => item.state?.policyBlocker === 'unavailable');
  const filtered = !!needle || (collection === 'managed' ? sourceFilter !== 'all' || managedStatus !== 'all' : presetId !== 'all');
  const refresh = () => setRevision(current => current + 1);
  const selecting = selection?.context === context;
  const detail = selecting ? undefined : visible.find(item => item.id === openSkill) ?? (layout === 'list' ? visible[0] : undefined);
  const selectable=(item:Skill)=>item.removable||canChangeDsh(asInstalled(item),'invocation');
  const eligible = visible.filter(selectable);
  const chosen = selecting ? items.filter(item => selection.ids.includes(item.id)) : [];
  const batchLimit = state?.data?.removalBatchLimit;
  const uninstallable = chosen.filter(item => item.removable);
  const exceedsRemovalLimit = batchLimit !== undefined && uninstallable.length > batchLimit;
  const policyLimit = state?.data?.policyBatchLimit;
  const exceedsPolicyLimit = policyLimit !== undefined && (['enable', 'disable', 'model-on', 'model-off', 'manual-on', 'manual-off'] as const)
    .some(action => dshBatchEligibility(chosen.map(asInstalled), action).eligible.length > policyLimit);
  function selectVisible(invert = false) {
    setSelection(current => { const ids = new Set(current?.context === context ? current.ids : []); for (const item of eligible) { if (invert && ids.has(item.id)) ids.delete(item.id); else ids.add(item.id); } return { context, ids: [...ids] }; });
  }
  const destination = { workspace: workspaceId || null };
  const busy = reviewing || !!removal || !!removalResult || policyBusy;
  function rememberTrigger(element: HTMLElement) { actionTrigger.current = element; }
  function restoreFocus() { if (actionTrigger.current?.isConnected && !actionTrigger.current.matches(':disabled')) actionTrigger.current.focus(); else if (bulkTrigger.current && !bulkTrigger.current.disabled) bulkTrigger.current.focus(); else searchInput.current?.focus(); }
  function toggleSkill(id: string) {
    if (busy) return;
    setSelection(current => { const ids = current?.context === context ? current.ids : []; return { context, ids: ids.includes(id) ? ids.filter(key => key !== id) : [...ids, id] }; });
  }
  async function reviewRemoval(selected: Skill[], trigger: HTMLElement, source?: string) {
    const eligible = selected.filter(item => item.removable);
    if ((source ? reviewing : busy) || !eligible.length || (batchLimit !== undefined && eligible.length > batchLimit)) return;
    const excluded = selected.filter(item => !item.removable).map(item => ({ id: item.id, name: item.name, path: item.path, reason: 'removal-unavailable' }));
    if (!source) rememberTrigger(trigger);
    setReviewing(true);
    try {
      const reviewed = await writeRequest<RemovalPreview>('removal-preview', { ...destination, collection, source, skills: eligible.map(item => ({ id: item.id })) });
      if (activeContext.current === context) setRemoval({ destination, collection, source, items: reviewed.items, excluded: [...reviewed.excluded, ...excluded] });
    } catch {
      if (activeContext.current === context) {
        notifyError('', t('zh', 'en') === 'zh', undefined, t('无法核对所选技能的卸载范围。请刷新后重试。', 'Could not verify the uninstall scope for the selected skills. Refresh and try again.'));
        trigger.focus();
      }
    } finally { setReviewing(false); }
  }
  async function removeSkills(selected: RemovalItem[]) {
    if (!removal) return;
    const result = await writeRequest<RemovalResult>('remove', { ...removal.destination, collection: removal.collection, source: removal.source, skills: selected.map(({ id, revision }) => ({ id, revision })) }).finally(onMutation);
    const removed = new Set(result.removedIds ?? result.removed);
    const wasRemoved = (item: RemovalItem) => removed.has(result.removedIds ? item.id : item.name);
    const remaining = [...removal.excluded.map(item => item.id).filter(id => items.some(item => item.id === id)), ...selected.filter(item => !wasRemoved(item)).map(item => item.id)];
    if (selecting) setSelection(remaining.length ? { context, ids: remaining } : undefined);
    if (detail && selected.some(item => item.id === detail.id && wasRemoved(item))) setOpenSkill('');
    if (result.failed || remaining.length || removal.excluded.length) setRemovalResult({
      inventory: null,
      logs: result.failed && selected.every(wasRemoved) ? t('已确认目标已移除，卸载命令返回异常。', 'The selected skills were removed, but the uninstall command reported an error.') : '',
      items: [
        ...selected.map(item => ({ skill: item.name, destination: item.path, status: wasRemoved(item) ? 'complete' as const : 'failed' as const,
          message: wasRemoved(item) ? '' : t('此技能未卸载，请重新检查。', 'This skill was not uninstalled. Check again.') })),
        ...removal.excluded.map(item => ({ skill: item.name, destination: item.path, status: 'failed' as const, message: removalReason(item.reason, t) })),
      ],
    });
    else notifySuccess(t(`已卸载 ${result.removed.length} 项。`, `Uninstalled ${result.removed.length} skills.`));
  }
  async function refreshContext() { setCheckingContext(true); try { await reload(); refresh(); } finally { setCheckingContext(false); } }
  function showCard(item: Skill) { if (!busy) { lastCard.current = item.id; setOpenSkill(item.id); } }
  function workspaceLabel(item: Bootstrap['workspaces'][number]) { return config.workspaces.some(other => other.id !== item.id && other.title === item.title) ? `${item.title} · ${item.path}` : item.title; }
  async function revealSkill(item: Skill) {
    if (locating) return;
    setLocating(item.id);
    try { await writeRequest('reveal', { ...destination, skill: item.id }); }
    catch { notifyError(t('无法在访达中显示此技能，请重新读取后重试。', 'Could not reveal this skill in Finder. Reload and retry.'), t('zh', 'en') === 'zh'); }
    finally { setLocating(undefined); }
  }
  function skillSwitch(item:Skill) {
    return !selecting&&item.state&&<DshPolicySwitch state={item.state} name={item.name} disabled={busy||!!state?.refreshing} project={project} zh={t('zh','en')==='zh'} onChange={action=>setPolicyIntent({id:item.id,action})}/>;
  }
  function skillActions(item: Skill) {
    return !selecting && <>
      {item.state&&<DshPolicyChannels state={item.state} name={item.name} disabled={busy||!!state?.refreshing} project={project} zh={t('zh','en')==='zh'} onChange={action=>setPolicyIntent({id:item.id,action})}/>}
      {config.reveal && <Hint text={t('在访达中显示', 'Show in Finder')}><Button variant="ghost" size="icon-sm" disabled={busy || !!locating} aria-label={t(`在访达中显示 ${item.name}`, `Show ${item.name} in Finder`)} onClick={() => void revealSkill(item)}><FolderOpenIcon aria-hidden="true" /></Button></Hint>}
      {item.removable && <Hint text={t('卸载', 'Uninstall')}><Button variant="ghost" size="icon-sm" disabled={busy || state?.refreshing} aria-label={t(`卸载 ${item.name}`, `Uninstall ${item.name}`)} onClick={event => void reviewRemoval([item], event.currentTarget)}><Trash2Icon aria-hidden="true" /></Button></Hint>}
    </>;
  }
  const policySkills = (selecting ? chosen : items.filter(item=>item.id===policyIntent?.id)).map(asInstalled);
  const policyTarget:Target={host:'local',scope:project?'project':'global',projectPath:selectedWorkspace?.path??null};
  async function savePolicy(change:DshPolicySubmission) {
    const skills=change.files.map(({file,revision})=>{
      const item=items.find(item=>item.state?.file===file);
      if(!item)throw new Error('policy-conflict');
      return {id:item.id,revision};
    });
    await writeRequest('policy',{...destination,collection,operation:change.action,configurationRevision:change.configurationRevision,policyRevision:change.revision,skills});
  }
  const policyControls=<DshBatchControls controller={policyController} skills={policySkills} target={policyTarget} contextKey={null} revision={(collection === 'managed' ? state?.data?.managedConfigurationRevision : state?.data?.configurationRevision) ?? ''} policyRevision={state?.data?.policy?.revision??''} home={config.userHome} disabled={busy||!!state?.refreshing} maxPolicySkills={policyLimit} zh={t('zh','en')==='zh'} onBusy={setPolicyBusy} onSnapshot={onMutation} onChanged={onMutation} allowRemoval={false} showControls={!!selecting} savePolicy={savePolicy}/>;
  const detailOpen = layout === 'cards' && !!detail;
  useLayoutEffect(() => {
    if (detailOpen) detailBack.current?.focus();
    else if (lastCard.current) {
      (cardButtons.current.get(lastCard.current) ?? searchInput.current)?.focus();
      lastCard.current = '';
    }
  }, [detailOpen]);
  const removalSource = removal?.collection === 'managed' && !removal.source && !selecting && removal.items.length === 1
    ? managed.find(item => item.id === removal.items[0].id)?.installation?.source
    : null;
  const sourceGroup = removalSource ? managed.filter(item => item.installation?.source === removalSource) : [];
  function reviewSourceRemoval() {
    if (removalSource && actionTrigger.current) void reviewRemoval(sourceGroup, actionTrigger.current, removalSource);
  }
  const showRemoval = <>
    <RemoveSkills items={removal?.items} excluded={removal?.excluded} native={removal?.collection === 'native'} close={() => setRemoval(undefined)} remove={removeSkills}
      t={t} home={config.userHome} source={removal?.source} reviewing={reviewing} restoreFocus={removalResult ? () => {} : restoreFocus}
      onSource={removalSource && (batchLimit === undefined || sourceGroup.filter(item => item.removable).length <= batchLimit) ? reviewSourceRemoval : undefined}/>
    <Modal open={!removal && !!removalResult} title={t('卸载结果', 'Uninstall result')} onClose={() => setRemovalResult(undefined)} onClosed={restoreFocus}>
      {removalResult && <OperationResults result={removalResult} action="remove" operation={null} home={config.userHome} zh={t('zh', 'en') === 'zh'} busy={false} inventoryExpected={false} distinguishPaths/>}
      <ModalActions><Button onClick={() => setRemovalResult(undefined)}>{t('完成', 'Done')}</Button></ModalActions>
    </Modal>
  </>;
  if (detailOpen && detail) return <SkillDetail>
    <SkillDetailHeader title={detail.name} description={detail.description} backLabel={t('返回技能列表', 'Back to skills')}
      backRef={detailBack} backDisabled={busy} onBack={() => setOpenSkill('')}
      actions={detail.removable && <Hint text={t('卸载', 'Uninstall')}><Button variant="ghost" size="icon-sm" disabled={busy || state?.refreshing}
        aria-label={t(`卸载 ${detail.name}`, `Uninstall ${detail.name}`)} onClick={event => void reviewRemoval([detail], event.currentTarget)}><Trash2Icon aria-hidden="true"/></Button></Hint>}/>
    <Details key={detail.id} skill={detail} home={config.userHome} collection={collection} workspace={workspaceId} revision={revision} t={t} onRetry={refresh} onOpen={config.reveal ? () => void revealSkill(detail) : undefined}/>
    {showRemoval}
  </SkillDetail>;
  return <div className="inventory-content flex min-w-0 flex-col gap-3">
    {showRemoval}
    {!selecting&&policyControls}
    {enabled && <div className="flex min-w-0 items-center gap-3 overflow-x-auto overflow-y-hidden py-0.5 [scrollbar-width:thin]">
      <ToggleGroup type="single" size="sm" className="segmented-control shrink-0" value={collection} onValueChange={value => { if (value) { preferences.collection = value; setCollection(value); setSelection(undefined); setOpenSkill(''); } }} aria-label={t('技能集合', 'Skill collection')}>
        <ToggleGroupItem value="native"><FolderOpenIcon aria-hidden="true" />{t('原生技能', 'Native skills')}{state?.data && <span className="text-muted-foreground tabular-nums">{native.length}</span>}</ToggleGroupItem>
        <ToggleGroupItem value="managed"><PackagePlusIcon aria-hidden="true" />{t('托管技能', 'Managed skills')}{state?.data && state.data.ownership !== 'error' && <span className="text-muted-foreground tabular-nums">{managed.length}</span>}</ToggleGroupItem>
      </ToggleGroup>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {project && selectedWorkspace && (config.workspaces.length === 1 ? <span className="text-sm">{selectedWorkspace.title}</span> : <Choice label={t('项目工作区', 'Workspace')} value={workspaceId} onChange={value => { preferences.workspace = value; setWorkspace(value); setSelection(undefined); setOpenSkill(''); }} options={config.workspaces.map(item => ({ value: item.id, label: workspaceLabel(item) }))} />)}
      </div>
    </div>}
    <div className="flex min-w-0 flex-col gap-3">
      {enabled && <InventoryToolbar>
        <div className="toolbar-filters flex shrink-0 items-center gap-3">
          <label className="relative w-56 shrink-0"><SearchIcon aria-hidden="true" className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" /><Input ref={searchInput} type="search" className="pl-8" aria-label={t('搜索技能', 'Search skills')} placeholder={t('搜索技能…', 'Search skills…')} value={query} onChange={event => changeFilters({ query: event.target.value })} /></label>
          {collection === 'managed' ? <>
            <Choice label={t('来源', 'Source')} value={sourceFilter} onChange={source => changeFilters({ source })} options={sources} />
            <Choice label={t('状态', 'Status')} value={managedStatus} onChange={status => changeFilters({ status })} options={[{ value: 'all', label: t('全部状态', 'All states') }, { value: 'enabled', label: t('已启用', 'Enabled') }, { value: 'disabled', label: t('已停用', 'Disabled') }]} />
          </> : <Choice label={t('筛选预设', 'Filter preset')} value={presetId} onChange={value => { preferences.preset = value; setPreset(value); setSelection(undefined); setOpenSkill(''); }} options={[{ value: 'all', label: t('全部预设', 'All presets') }, ...presetChoices.map(item => ({ value: item.id, label: presetText(item, t).name }))]} />}
          {collection === 'native' && directoryState.runtime.length > 0 && <Hint text={runtimeDescription}><Button variant="ghost" size="icon-sm" aria-label={t('技能目录说明', 'About skill directories')}><InfoIcon aria-hidden="true" /></Button></Hint>}
          <Hint text={t('刷新', 'Refresh')}><Button variant="ghost" size="sm" data-toolbar-priority="3" aria-label={t('刷新', 'Refresh')} disabled={checkingContext} onClick={() => void refreshContext()}><RefreshCwIcon aria-hidden="true" className={state?.refreshing || checkingContext ? 'motion-safe:animate-spin' : ''} /><span className="toolbar-secondary-label">{t('刷新', 'Refresh')}</span></Button></Hint>
        </div>
        <div className="toolbar-actions ml-auto flex shrink-0 items-center gap-3">
          <ToggleGroup type="single" size="xs" className="segmented-control" value={layout} onValueChange={value => { if (value) { preferences.layout = value; lastCard.current = ''; setLayout(value); setOpenSkill(''); } }} aria-label={t('技能视图', 'Skill view')}>
            <ToggleGroupItem value="cards" aria-label={t('卡片', 'Cards')} title={t('卡片', 'Cards')}><Grid2X2Icon aria-hidden="true" /></ToggleGroupItem><ToggleGroupItem value="list" aria-label={t('列表和详情', 'List and details')} title={t('列表和详情', 'List and details')}><Columns2Icon aria-hidden="true" /></ToggleGroupItem>
          </ToggleGroup>
          {(selecting || eligible.length > 0) && <Hint text={t('批量选择', 'Batch selection')}><Button ref={bulkTrigger} size="sm" data-toolbar-priority="1" variant={selecting ? 'secondary' : 'ghost'} aria-pressed={selecting} aria-label={t('批量选择', 'Batch selection')} disabled={busy || (!selecting && !eligible.length)} onClick={() => { setSelection(selecting ? undefined : { context, ids: [] }); setOpenSkill(''); }}><ListChecksIcon aria-hidden="true" /><span className="toolbar-secondary-label">{t('批量选择', 'Batch selection')}</span></Button></Hint>}
          {collection === 'managed' && <Button size="sm" disabled={!anyTarget} onClick={add}><PackagePlusIcon data-icon="inline-start" />{t('添加技能', 'Add skills')}</Button>}
        </div>
      </InventoryToolbar>}
      {selecting && <BulkSelectionBar framed count={chosen.length} disabled={busy || !eligible.length} zh={t('zh', 'en') === 'zh'} onSelectAll={() => selectVisible()} onInvert={() => selectVisible(true)}>{policyControls}<Button variant="destructive" size="sm" disabled={busy || !uninstallable.length || exceedsRemovalLimit} onClick={event => void reviewRemoval(chosen, event.currentTarget)}><Trash2Icon data-icon="inline-start" />{t('卸载', 'Uninstall')}</Button></BulkSelectionBar>}
      {exceedsRemovalLimit && <p role="status" className="text-sm text-muted-foreground">{t(`每次最多卸载 ${batchLimit} 项。请减少选择。`, `Select at most ${batchLimit} skills to uninstall at once.`)}</p>}
      {exceedsPolicyLimit && <p role="status" className="text-sm text-muted-foreground">{t(`每次最多为 ${policyLimit} 个技能修改启停或调用设置。`, `Change enablement or invocation for at most ${policyLimit} skills at once.`)}</p>}
      {!enabled || (!config.presets.length && collection === 'native') ? <><Notice title={project && !selectedWorkspace ? t('暂无项目工作区', 'No project workspaces') : t('暂无 Agent 预设', 'No Agent presets')} description={project && !selectedWorkspace ? t('在 DSH 添加项目后，刷新工作区列表。', 'Add a project in DSH, then refresh the workspace list.') : undefined} /><Button variant="outline" className="self-center" disabled={checkingContext} onClick={() => void refreshContext()}>{t('刷新', 'Refresh')}</Button></>
        : !state ? layout === 'cards' ? <LoadingCards label={t('读取技能', 'Reading skills')} variant="inventory" className="skill-grid gap-3" /> : <div className="grid min-w-0 grid-cols-1 gap-3 @min-[800px]/skill-inventory:grid-cols-[minmax(22rem,2fr)_minmax(0,3fr)]"><Card variant="inventory"><CardContent className="grid gap-2"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" /></CardContent></Card><Loading label={t('读取技能', 'Reading skills')} /></div>
        : state.failed ? <InventoryEmpty kind="failed" zh={t('zh', 'en') === 'zh'} disabled={state.refreshing} onRetry={refresh} onClear={clearFilters} onAdd={add} />
        : <>
          {state.data?.policy?.status==='error'&&<Alert variant="destructive"><AlertDescription>{t('技能启停与调用设置无法读取，请检查设置文件后刷新。','Enablement and invocation settings could not be read. Check the settings file and refresh.')}<p className="break-all font-mono text-xs">{state.data.policy.file}</p></AlertDescription></Alert>}
          {state.data?.ownership === 'error' && <Alert variant="destructive"><AlertDescription role="alert">{t('安装记录无法读取，暂不能确认托管归属或执行卸载。已知条目会保留。', 'Installation records could not be read. Managed ownership and removal are unavailable; known items are retained.')}{visible.length > 0 && <Button variant="outline" size="sm" className="mt-2" disabled={state.refreshing} onClick={refresh}>{t('重新读取安装记录', 'Reload installation records')}</Button>}</AlertDescription></Alert>}
          {partial && <Alert><AlertDescription>{collection === 'managed' ? t('共享技能目录未能完整读取，请刷新重试。', 'The shared skill directory could not be fully read. Refresh to retry.') : directoryState.failed.length ? t(`以下预设的技能目录未能完整读取：${presetNames(directoryState.failed)}。请检查目录设置后刷新。`, `Skill directories could not be fully read for ${presetNames(directoryState.failed)}. Check their directory settings and refresh.`) : t('部分技能文件无法读取，请刷新重试。', 'Some skill files could not be read. Refresh to retry.')}</AlertDescription></Alert>}
          {!visible.length ? collection === 'native' && directoryState.runtime.length > 0 && !needle && !partial ? <Notice title={t('技能目录由预设规则确定', 'Skill directories depend on preset rules')} description={runtimeDescription} /> : <InventoryEmpty kind={state.data?.ownership === 'error' && collection === 'managed' ? 'failed' : partial ? 'failed' : filtered ? 'filtered' : collection === 'managed' ? 'managed' : 'native'} zh={t('zh', 'en') === 'zh'} disabled={state.refreshing || (collection === 'managed' && !filtered && !anyTarget)} onRetry={refresh} onClear={clearFilters} onAdd={add} />
            : layout === 'list' ? <div className="grid min-w-0 grid-cols-1 gap-3 @min-[800px]/skill-inventory:grid-cols-[minmax(22rem,2fr)_minmax(0,3fr)]">
              <Card variant="inventory" className="min-w-0 self-start"><CardContent className="grid gap-1">
                {visible.map(item => <InventoryListRow key={item.id} selected={selecting ? chosen.includes(item) : item.id === detail?.id}><Button variant="plain" role={selecting ? 'checkbox' : undefined} aria-checked={selecting ? chosen.includes(item) : undefined} aria-pressed={selecting ? undefined : item.id === detail?.id} className="h-auto min-w-0 flex-1 flex-col items-start gap-0 py-1 text-left" disabled={busy || selecting && !selectable(item)} onClick={() => selecting ? toggleSkill(item.id) : setOpenSkill(item.id)}><span className="max-w-full truncate">{item.name}</span><span className="max-w-full truncate text-xs text-muted-foreground">{inventorySource(item, collection, t)}{item.shadowed && t(' · 被覆盖', ' · Shadowed')}</span>{items.some(other => other.id !== item.id && other.name === item.name) && <span className="w-full truncate text-right text-xs text-muted-foreground" dir="rtl"><bdi>{item.path}</bdi></span>}</Button>{!selecting && <InventoryListActions>{skillSwitch(item)}{skillActions(item)}</InventoryListActions>}</InventoryListRow>)}
              </CardContent></Card>
              {detail && <Card variant="detail" className="min-w-0 self-start"><CardHeader><CardTitle>{detail.name}</CardTitle>{detail.description && <CardDescription><OverflowText text={detail.description} className="line-clamp-2" /></CardDescription>}</CardHeader><CardContent><Details key={detail.id} skill={detail} home={config.userHome} collection={collection} workspace={workspaceId} revision={revision} t={t} onRetry={refresh} onOpen={config.reveal ? () => void revealSkill(detail) : undefined} compact /></CardContent></Card>}
            </div>
            : <div className="skill-grid grid gap-3">{visible.map(item => <InventoryCard key={item.id} onOpen={selecting && !selectable(item) ? undefined : () => selecting ? toggleSkill(item.id) : showCard(item)}>
              <InventoryCardHeader control={skillSwitch(item)} selection={selecting && <Checkbox aria-label={t(`选择 ${item.name}`, `Select ${item.name}`)} disabled={busy || !selectable(item)} checked={chosen.includes(item)} onCheckedChange={() => toggleSkill(item.id)} />}
                heading={selecting ? <span className="block max-w-full truncate">{item.name}</span> : <button type="button" ref={element => { if (element) cardButtons.current.set(item.id, element); else cardButtons.current.delete(item.id); }} className="block max-w-full truncate text-left" onClick={() => showCard(item)}>{item.name}</button>}
                information={!selecting && item.shadowed && <Hint text={t('存在优先级更高的同名技能。', 'A higher-priority skill has the same name.')}><button type="button" className={buttonVariants({ variant: 'ghost', size: 'icon-xs' })} aria-label={t('查看同名覆盖', 'View skill conflict')} onClick={() => showCard(item)}><InfoIcon aria-hidden="true" /></button></Hint>}
                description={<OverflowText className="min-h-10 line-clamp-2 leading-5" text={item.description} />} />
              <InventoryCardFooter metadata={<span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><FolderOpenIcon aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{inventorySource(item, collection, t)}</span></span>}>{skillActions(item)}</InventoryCardFooter>
            </InventoryCard>)}</div>}
        </>}
    </div>
  </div>;
}

function Space({ config, reload, failed, t, workspace, view, chooseDirectory, inventoryRevision, onMutation }: {
  config?: Bootstrap; reload: () => Promise<boolean>; failed: boolean; t: Translate; workspace: boolean; view: SessionView;
  chooseDirectory: () => Promise<string | null>;
  inventoryRevision: number; onMutation: () => void;
}) {
  const [scope, setScope] = useState(view.scope);
  const [installation, setInstallation] = useState<InstallationStart>();
  const [inventoryVersion, setInventoryVersion] = useState(0);
  const [store] = useState(() => ({ current: createMarketplaceSession() }));
  const container = useRef<HTMLElement>(null);
  const installOpener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!installation && installOpener.current) {
      installOpener.current.focus();
      installOpener.current = null;
    }
  }, [installation]);
  const scrollContainer = useCallback(() => {
    const root = container.current?.getRootNode();
    for (let node = root instanceof ShadowRoot ? root.host.parentElement : null; node; node = node.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
    }
    return null;
  }, []);
  const [pageSize, setPageSize] = useState(12);
  function changeScope(value: string) { view.scope = value; setScope(value); }
  function startInstall(start: InstallationStart) {
    const root = container.current?.getRootNode();
    const active = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    installOpener.current = active instanceof HTMLElement ? active : null;
    setInstallation(start);
  }
  function complete(target: Destination) {
    const next = target.workspace ? "project" : "global";
    view[next].workspace = target.workspace ?? "";
    view[next].collection = "managed";
    view[next].filters = new Map(view[next].filters).set(JSON.stringify([config?.configuration?.path, target.workspace ?? "", "managed"]), emptyFilters);
    installOpener.current = container.current?.querySelector<HTMLButtonElement>(`[data-skill-scope-tab="${next}"]`) ?? null;
    setInventoryVersion(current => current + 1);
    setInstallation(undefined);
    changeScope(next);
  }
  return <section ref={container} className={workspace ? "mx-auto flex max-w-[960px] flex-col gap-3 px-6 py-7" : "flex min-w-0 flex-col gap-3"}>
    {workspace && <h1 className="text-xl font-semibold">{t("技能空间", "Skills Space")}</h1>}
    {failed && !config ? <><Notice title={t("无法连接技能空间", "Could not load Skills Space")} /><Button variant="outline" className="self-start" onClick={reload}>{t("重试", "Retry")}</Button></>
      : !config ? <Loading label={t("读取技能空间", "Loading Skills Space")} /> : <>
      {installation && <Installation config={config} start={installation} t={t} chooseDirectory={chooseDirectory} onClose={() => setInstallation(undefined)} onComplete={complete}
        preview={(source, destination, includeInternal) => writeRequest<InstallPreview>("preview", { source, ...destination, includeInternal })}
        install={(token, names, destination) => writeRequest<InstallResult>("install", { token, names, ...destination }).finally(onMutation)} />}
      <div><Tabs value={scope} onValueChange={changeScope}>
        <TabsList variant="quiet" className="page-tabs" aria-label={t("技能空间范围", "Skills Space scope")}>
          <TabsTrigger data-skill-scope-tab="global" value="global"><GlobeIcon aria-hidden="true" />{t("全局管理", "Global")}</TabsTrigger>
          <TabsTrigger data-skill-scope-tab="project" value="project"><FolderOpenIcon aria-hidden="true" />{t("项目管理", "Projects")}</TabsTrigger>
          <TabsTrigger value="store"><StoreIcon aria-hidden="true" />{t("技能商店", "Skill store")}</TabsTrigger>
        </TabsList>
        <TabsContent value="global"><InventoryPage key={inventoryVersion} config={config} project={false} t={t} preferences={view.global} reload={reload} onInstall={destination => startInstall({ destination })} inventoryRevision={inventoryRevision} onMutation={onMutation} /></TabsContent>
        <TabsContent value="project"><InventoryPage key={inventoryVersion} config={config} project t={t} preferences={view.project} reload={reload} onInstall={destination => startInstall({ destination })} inventoryRevision={inventoryRevision} onMutation={onMutation} /></TabsContent>
        <TabsContent value="store"><SkillStore zh={t("zh", "en") === "zh"} initialPageSize={pageSize} onPageSize={async value => setPageSize(value)}
          disabled={!hasInstallationTarget(config)} session={store} backend={storeBackend} getScrollContainer={scrollContainer} embedded
          onInstall={(source, _agents, skills) => startInstall({ source, skills, destination: { workspace: null } })} /></TabsContent>
      </Tabs></div>
    </>}
  </section>;
}

type PresetDraft = { revision: string; fields: DirectoryDraft };

function PluginSettings({ config, failed, reload, changePlacement, t, directoryDrafts, directorySaved, chooseDirectory }: {
  config?: Bootstrap; failed: boolean; reload: () => Promise<boolean>; changePlacement: (value: Placement) => Promise<void>; t: Translate; directoryDrafts: Map<string, PresetDraft>;
  directorySaved: (preset: string, value: DirectoryConfiguration) => void;
  chooseDirectory:()=>Promise<string|null>;
}) {
  const [presetId, setPresetId] = useState("");
  const [directoryPending, setDirectoryPending] = useState(false);
  const [refreshingSettings,setRefreshingSettings] = useState(false);
  const [openingConfiguration,setOpeningConfiguration]=useState(false);
  const [configurationError,setConfigurationError]=useState<string>();
  const [editorVersion, redrawDraft] = useState(0);
  function discardDraft(key: string) { directoryDrafts.delete(key); redrawDraft(value => value + 1); }
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<"saved" | "failed">();
  const selected = config?.presets.find(item => item.id === presetId) ?? config?.presets[0];
  const selectedDraft = selected ? directoryDrafts.get(selected.id) : undefined;
  const selectedDirectory = selected?.directoryEdit;
  const editor = useRef<DirectoryEditorHandle>(null);
  const [confirmLeave,setConfirmLeave] = useState(false);
  const pendingNavigation = useRef<(()=>void)|undefined>(undefined);
  const continuing = useRef(false);
  function requestLeave(action:()=>void) {
    if(directoryPending||refreshingSettings)return;
    if(editor.current?.dirty || selectedDraft && selectedDirectory && JSON.stringify(selectedDraft.fields)!==JSON.stringify(directoryDraft(selectedDirectory))) {
      pendingNavigation.current=action;setConfirmLeave(true);
    } else action();
  }
  function choosePreset(next:string) {if(next!==selected?.id)requestLeave(()=>{if(selected)discardDraft(selected.id);setPresetId(next);});}
  async function refreshSettings(){
    if(directoryPending||refreshingSettings)return;
    setRefreshingSettings(true);
    try{if(await reload()&&selected)discardDraft(selected.id);}finally{setRefreshingSettings(false);}
  }
  function settled(saved:boolean) {
    if(!continuing.current)return;
    continuing.current=false;
    const action=pendingNavigation.current;pendingNavigation.current=undefined;
    if(saved)action?.();
  }
  function discardAndContinue(){
    const action=pendingNavigation.current;pendingNavigation.current=undefined;setConfirmLeave(false);action?.();
  }
  async function openConfiguration(){
    if(openingConfiguration)return;
    setOpeningConfiguration(true);setConfigurationError(undefined);
    try{
      if(selected)discardDraft(selected.id);
      const result=await writeRequest<{opened:boolean}>('open-configuration',{});
      if(!result.opened)throw new Error(t('系统没有接受打开请求。','The system did not accept the open request.'));
    }catch(error){setConfigurationError(error instanceof Error?error.message:String(error));}
    finally{setOpeningConfiguration(false);}
  }
  async function save(value: string) {
    if (pending || value === config?.placement || (value !== "settings" && value !== "sidebar" && value !== "both")) return;
    setPending(true);
    setResult(undefined);
    try { await changePlacement(value); setResult("saved"); notifySuccess(t("入口位置已保存。", "Entry placement saved.")); }
    catch { setResult("failed"); }
    finally { setPending(false); }
  }
  if (!config && failed) return <Button variant="outline" onClick={reload}>{t("重新读取技能空间设置", "Reload Skills Space settings")}</Button>;
  if (!config) return <Loading label={t("读取技能空间设置", "Loading Skills Space settings")} />;
  return <div className="flex min-w-0 flex-col gap-4 py-3">
    {failed && <Alert variant="destructive"><AlertDescription role="alert">{t("无法重新读取最新设置，当前显示上次确认的值，草稿仍保留。", "Could not reload the latest settings. Showing the last confirmed values; your draft is retained.")}
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => requestLeave(()=>{void refreshSettings();})}>{t("重新读取", "Reload")}</Button>
    </AlertDescription></Alert>}
    <Card><CardHeader><CardTitle>{t("入口展示位置", "Entry placement")}</CardTitle></CardHeader><CardContent aria-busy={pending}>
      <ToggleGroup type="single" size="sm" className="segmented-control" disabled={pending} value={config.placement} onValueChange={value => void save(value)} aria-label={t("入口展示位置", "Entry placement")}>
        <ToggleGroupItem value="settings">{t("仅设置", "Settings")}</ToggleGroupItem>
        <ToggleGroupItem value="sidebar">{t("仅侧栏", "Sidebar")}</ToggleGroupItem>
        <ToggleGroupItem value="both">{t("两边显示", "Both")}</ToggleGroupItem>
      </ToggleGroup>
      {(pending || result === "failed") && <p className={result === "failed" ? "mt-2 text-sm text-destructive" : "mt-2 text-sm text-muted-foreground"} role="status">
        {pending ? t("正在保存入口位置…", "Saving entry placement…") : t("无法保存入口位置，请重新选择展示位置重试。", "Could not save entry placement. Select a placement again to retry.")}
      </p>}
    </CardContent></Card>
    <AlertDialog open={confirmLeave} onOpenChange={open=>{if(!open){setConfirmLeave(false);pendingNavigation.current=undefined;}}}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('保存 DSH 设置？','Save DSH settings?')}</AlertDialogTitle>
        <AlertDialogDescription>{t('有未保存的修改。','You have unsaved changes.')}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>{t('继续编辑','Keep editing')}</AlertDialogCancel>
          <Button variant="outline" onClick={discardAndContinue}>{t('放弃修改','Discard changes')}</Button>
          <Button disabled={!editor.current?.canSave} onClick={()=>{continuing.current=true;setConfirmLeave(false);editor.current?.save();}}>{t('保存并继续','Save and continue')}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      {config.configuration&&<span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={config.configuration.path}>{config.configuration.path}</span>}
      <Hint text={t('重新读取','Reload')}><Button variant="outline" size="icon-sm" disabled={directoryPending||pending||refreshingSettings} aria-label={t('重新读取 DSH 设置','Reload DSH settings')} onClick={()=>requestLeave(()=>{void refreshSettings();})}><RefreshCwIcon aria-hidden="true"/></Button></Hint>
    </div>
    {configurationError&&<Alert variant="destructive" role="alert"><AlertDescription>{configurationError}</AlertDescription></Alert>}
    <Card><CardHeader><div className="flex min-w-0 items-center justify-between gap-3"><CardTitle>{t('Agent 预设', 'Agent presets')}</CardTitle>{config.configuration&&<Button variant="outline" size="sm" disabled={directoryPending||refreshingSettings||openingConfiguration||!config.configuration.exists||!config.configuration.canOpen} onClick={()=>requestLeave(()=>{void openConfiguration();})}><FilePenLineIcon data-icon="inline-start" aria-hidden="true"/>{openingConfiguration?t('正在打开…','Opening…'):t('打开配置文件','Open configuration file')}</Button>}</div><CardDescription>{t('选择要配置技能目录的 Agent 预设。', 'Choose the Agent preset whose skill directories you want to configure.')}</CardDescription></CardHeader>
      <CardContent>{config.presets.length ? <PresetChoiceCards label={t('Agent 预设', 'Agent presets')} value={selected?.id ?? ''} disabled={directoryPending||refreshingSettings}
        choices={config.presets.map(item => ({ key: item.id, identifier: item.id, ...presetText(item, t) }))} onChange={choosePreset} /> : <DshPresetEmpty zh={t("zh","en")==="zh"}/>}</CardContent>
    </Card>
    {selected && <Card><CardHeader><CardTitle>{t(`技能目录（${presetText(selected, t).name}）`, `Skill directories (${presetText(selected, t).name})`)}</CardTitle></CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3">
      {selected?.directoryReadOnly && selected.directories.length > 0 && <p className="text-sm text-muted-foreground">{directoryRestriction(selected.directoryReadOnly, t)}</p>}
      {selected && selectedDirectory ? <DirectorySettings controller={editor} key={`${selected.id}:${editorVersion}`} chooseDirectory={chooseDirectory} openDirectory={config.reveal?path=>writeRequest<void>('open-directory',{preset:selected.id,path}):undefined} value={selectedDirectory} onSettled={settled} t={t} onBusyChange={setDirectoryPending}
        reload={async () => {
          if (!await reload()) throw new Error("directory-readback");
          if (directoryDrafts.get(selected.id) === selectedDraft) discardDraft(selected.id);
        }}
        stale={refreshingSettings||Boolean(selectedDraft && selectedDraft.revision !== selectedDirectory.revision)}
        draft={selectedDraft?.fields ?? directoryDraft(selectedDirectory)}
        onChange={next => {
          directoryDrafts.set(selected.id, { revision: selectedDraft?.revision ?? selectedDirectory.revision, fields: next });
          redrawDraft(value => value + 1);
        }}
        onRestore={async () => {
          const saved = await writeRequest<DirectoryConfiguration>('directories', { preset: selected.id, revision: selectedDraft?.revision ?? selectedDirectory.revision, reset: true, confirmOverride: true });
          directorySaved(selected.id, saved);
          if (directoryDrafts.get(selected.id) === selectedDraft) discardDraft(selected.id);
          void reload();
        }}
        onSave={async fields => {
          const saved = await writeRequest<DirectoryConfiguration>("directories", { preset: selected.id, revision: selectedDraft?.revision ?? selectedDirectory.revision, fields, confirmOverride: true });
          directorySaved(selected.id, saved);
          if (directoryDrafts.get(selected.id) === selectedDraft) discardDraft(selected.id);
          void reload();
        }} /> : !selected?.directories.length ? <DshDirectoryEmpty status={selected?.directoryReadOnly==="unknown-provider"?"unknown":"none"} zh={t("zh","en")==="zh"}/>
        : selected.directories.map((directories, index) => <div key={index} className="grid min-w-0 gap-2">
          <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 text-sm">
            <dt className="text-muted-foreground">{t("发现默认目录", "Discover default directories")}</dt><dd>{toggleLabel(directories.defaults, t)}</dd>
            <dt className="text-muted-foreground">{t("DSH 技能目录", "DSH skill directory")}</dt><dd className="break-all">{directories.dsh ?? toggleLabel(directories.defaults === false ? false : null, t)}</dd>
            <dt className="text-muted-foreground">{t("共享技能目录", "Shared skill directory")}</dt><dd className="break-all">{directories.shared ?? toggleLabel(directories.defaults === false ? false : null, t)}</dd>
            {directories.builtinAdditional && <><dt className="text-muted-foreground">{t('DSH 内置技能目录','DSH built-in skill directory')}</dt><dd>{t('随 DSH 安装提供','Provided by DSH')}</dd></>}
            <dt className="text-muted-foreground">{t("附加技能目录", "Additional directories")}</dt>
            <dd className="break-all">{directories.additional.length ? <ul>{directories.additional.map((path, position) => <li key={position}>{path}</li>)}</ul> : t("未列出", "None listed")}</dd>
          </dl>
          {directories.partial && <p className="text-sm text-muted-foreground">{t("部分目录由预设动态决定。", "Some directories are resolved by the preset at runtime.")}</p>}
        </div>)}
      </CardContent></Card>}
  </div>;
}

function directoryRestriction(reason: string, t: Translate) {
  if (reason === 'multiple-providers') return t('该预设组合了多份技能目录配置，请在宿主的预设配置中分别修改。', 'This preset combines multiple skill directory configurations. Edit them in the host preset configuration.');
  if (reason === 'nested-provider') return t('目录配置位于嵌套配置中，请在宿主的预设配置中修改。', 'The directory settings are nested. Edit them in the host preset configuration.');
  if (reason === 'wrapped-provider') return t('目录由其他插件提供，请在对应插件配置中修改。', 'Another plugin provides these directories. Edit that plugin’s configuration.');
  if (reason === 'dynamic-fields') return t('部分目录由动态配置决定，请在宿主的预设配置中修改。', 'Some directories depend on dynamic configuration. Edit them in the host preset configuration.');
  return t('宿主未提供此预设的编辑入口，当前只能查看。', 'The host has no editing entry for this preset. These settings are read-only.');
}
function toggleLabel(value: boolean | null, t: Translate) {
  return value === null ? t("由预设决定", "Set by the preset") : value ? t("开启", "On") : t("关闭", "Off");
}

type Stop = () => void;
type Slot = { name: string; id?: string; key?: string; order?: number; label?: () => string };
interface ClientContext {
  slots: {
    inject: (name: string, setup: () => Stop) => Stop;
    register: (slot: Slot, component: (props: { view?: string }) => ReactNode) => Stop;
  };
  theme: {getTheme:()=>{active:{colorScheme:'light'|'dark';tokens:Record<string,string>};revision:number}};
  uiWorkspace: {pickDirectory:()=>Promise<string|null>};
  locale: { getSnapshot: () => { active: string } };
  on: (event: string, listener: () => void) => Stop;
  effect: (setup: () => Stop) => void;
}
export const inject = ["slots", "locale", "uiWorkspace", "theme"];

export function apply(ctx: ClientContext) {
  const appearance:Appearance={subscribe:notify=>ctx.on('theme/change',notify),getSnapshot:()=>ctx.theme.getTheme()};
  const views: Record<"settings" | "workspace", SessionView> = {
    settings: { scope: "global", global: inventoryPreferences(), project: inventoryPreferences() },
    workspace: { scope: "global", global: inventoryPreferences(), project: inventoryPreferences() },
  };
  const directoryDrafts = new Map<string, PresetDraft>();
  const listeners = new Set<() => void>();
  const registrations = new Set<() => void>();
  const abort = new AbortController();
  let snapshot: { config?: Bootstrap; failed: boolean; language: string; inventoryRevision: number } = { failed: false, language: ctx.locale.getSnapshot().active, inventoryRevision: 0 };
  let generation = 0;
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const current = () => snapshot;
  const update = (next: typeof snapshot) => {
    if (abort.signal.aborted) return;
    const prior = snapshot.config?.placement ?? "settings";
    snapshot = next;
    if ((next.config?.placement ?? "settings") !== prior) for (const reconcile of registrations) reconcile();
    for (const notify of listeners) notify();
  };
  const onMutation = () => update({ ...snapshot, inventoryRevision: snapshot.inventoryRevision + 1 });
  const reload = async () => {
    const run = ++generation;
    try {
      const config = await request<Bootstrap>({}, { signal: abort.signal });
      if (run === generation) update({ ...snapshot, config, failed: false });
      return run === generation;
    } catch {
      if (run === generation) update({ ...snapshot, failed: true });
      return false;
    }
  };
  const directorySaved = (preset: string, value: DirectoryConfiguration) => {
    generation++;
    if (snapshot.config) update({ ...snapshot, failed: false, inventoryRevision: snapshot.inventoryRevision + 1, config: { ...snapshot.config,
      presets: snapshot.config.presets.map(item => item.id === preset ? { ...item, ...value.context, directoryEdit: value } : item),
    } });
  };
  const changePlacement = async (placement: Placement) => {
    try {
      const saved = await request<{ placement: Placement }>({}, {
        method: "POST", signal: abort.signal,
        headers: { "Content-Type": "application/json", "X-DSH-Skills-Space": "placement" },
        body: JSON.stringify({ placement }),
      });
      if (saved.placement !== placement) throw new Error("Placement did not change");
      if (snapshot.config) update({ ...snapshot, config: { ...snapshot.config, placement: saved.placement }, failed: false });
    } finally { void reload(); }
  };
  const label = () => snapshot.language.startsWith("zh") ? "技能空间" : "Skills Space";
  function View({ kind }: { kind: "settings" | "workspace" | "config" }) {
    const state = useSyncExternalStore(subscribe, current);
    const t: Translate = (zh, en) => state.language.startsWith("zh") ? zh : en;
    return <Surface appearance={appearance}>{kind === "config"
      ? <PluginSettings {...state} t={t} changePlacement={changePlacement} reload={reload} directoryDrafts={directoryDrafts} directorySaved={directorySaved} chooseDirectory={()=>ctx.uiWorkspace.pickDirectory()} />
      : <Space {...state} t={t} workspace={kind === "workspace"} reload={reload} view={views[kind]} onMutation={onMutation} chooseDirectory={()=>ctx.uiWorkspace.pickDirectory()} />}</Surface>;
  }
  function slot(definition: Slot, component: (props: { view?: string }) => ReactNode, visible: (placement: Placement) => boolean) {
    return ctx.slots.inject(definition.name, () => {
      let dispose: Stop | undefined;
      const reconcile = () => {
        if (visible(snapshot.config?.placement ?? "settings")) dispose ??= ctx.slots.register(definition, component);
        else if (dispose) { dispose(); dispose = undefined; }
      };
      registrations.add(reconcile);
      reconcile();
      return () => { registrations.delete(reconcile); dispose?.(); };
    });
  }
  ctx.effect(() => {
    const settingsVisible = (placement: Placement) => placement !== "sidebar";
    const sidebarVisible = (placement: Placement) => placement !== "settings";
    const cleanups = [
      slot({ name: "shell.overlay", id: `${id}-notifications` }, () => <Surface appearance={appearance}><style>{sonnerStyles}</style><Toaster /></Surface>, () => true),
      slot({ name: "settings.section", id, order: 25, label }, () => <View kind="settings" />, settingsVisible),
      slot({ name: "settings.section.icon", id }, SpaceIcon, settingsVisible),
      slot({ name: "main", key: id }, () => <View kind="workspace" />, sidebarVisible),
      slot({ name: "sidebar.panellist", id, order: 10, label }, SpaceIcon, sidebarVisible),
      slot({ name: "plugins.bundle.config", key: id }, props => props.view === "summary" ? null : <View kind="config" />, () => true),
      ctx.on("locale/change", () => update({ ...snapshot, language: ctx.locale.getSnapshot().active })),
      ctx.on("connection/reset", () => void reload()),
    ];
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (![...directoryDrafts].some(([preset, draft]) => {
        const value = snapshot.config?.presets.find(item => item.id === preset)?.directoryEdit;
        return !value || JSON.stringify(draft.fields) !== JSON.stringify(directoryDraft(value));
      })) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    void reload();
    return () => { window.removeEventListener('beforeunload', beforeUnload); abort.abort(); for (const dispose of cleanups.reverse()) dispose(); };
  });
}
