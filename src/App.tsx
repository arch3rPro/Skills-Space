import { SkillDetail, SkillDetailHeader, SkillDetailMetadata } from "@/components/skill-detail";
import { SkillStore } from "@/components/skill-store";
import { createMarketplaceSession } from "@/lib/marketplace";
import { VersionValue, type VersionReadState } from '@/components/version-value';
import { createPiPackageCache } from '@/lib/pi-package-cache';
import { piPackageSkills, type PiInventoryResult } from '@/lib/pi-packages';
import type { PiPackageSummary } from '@/lib/pi-packages';
import { PiExtensions } from '@/components/pi-extensions';
import type {CodexPlugin,CodexSnapshot} from '@/lib/codex';
import { CodexPluginDirectory, type CodexDirectoryNavigation } from '@/components/codex-plugin-directory';
import { CodexSkillIcon } from "@/components/codex-skill-icon";
import { Choice } from "@/components/choice";
import { InventoryCard, InventoryCardHeader, InventoryCardFooter } from '@/components/inventory-card';
import { CodexSettings, type CodexSettingsHandle } from "@/components/codex-settings";
import { CodexPluginPage } from "@/components/codex-plugin-page";
import { CodexMarketplaces } from "@/components/codex-marketplaces";
import { CodexManagement } from "@/components/codex-management";
import { CodexPluginUpdateDialog } from "@/components/codex-plugin-update-dialog";
import { CodexAuthorizationDialog } from "@/components/codex-authorization-dialog";
import { CodexConfirmation } from "@/components/codex-confirmation";
import { PiSkillSourceChoice } from '@/components/pi-skill-source-choice';
import { CodexSkillSourceChoice } from "@/components/codex-skill-source-choice";
import { useCodexManagement } from "@/hooks/use-codex-management";
import { installedCodexPluginCount, codexSkillDisplayName, filterCodexSkills, codexSkillToggleHint, reconcileCodexInventory, codexOrigin, codexToggleSelection, mergeCodexStates } from "@/lib/codex";
import { PiPackageUpdateDialog } from "@/components/pi-package-update-dialog";
import { piActionSkills, piPackageBlocker, type PiPackageResult } from "@/lib/pi";
import { shortSkillVersion } from "@/lib/skill-document";
import { Hint } from "@/components/hint";
import { ListStartIcon, ZapIcon } from "lucide-react";
import { SkillBatchToggleControls } from "@/components/skill-batch-toggle-controls";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PiChangeNotice } from "@/components/pi-change-notice";
import { HermesManagement } from "@/components/hermes-management";
import { filterHermesSkills, hermesActionSkills, hermesSelection, hermesCardNotice, hermesReason, mergeHermesStates, type HermesSettings, type HermesEditorHandle } from "@/lib/hermes";
import { InventoryEmpty } from "@/components/inventory-empty";
import { InventoryToolbar } from "@/components/inventory-toolbar";
import { DshNativeContextChoice, DshNativeEmpty } from "@/components/dsh-context-fields";
import { DshManagement } from "@/components/dsh-management";
import { DshPolicySwitch, DshPolicyChannels, DshPolicyNotice } from "@/components/dsh-policy-controls";
import { dshPolicyNeedsConfirmation, dshPolicySaveFeedback, dshSkillNotice, mergeDshStates, dshDiscoveredSkills, dshSourceLabel, dshScopeKey, filterDshSkills, dshMatchesMembership, normalizeDshFilters, unreadableDshPreset, createDshContextWriter, type DshPolicyAction, type DshSnapshot, type DshRemoval, type DshEditorHandle } from "@/lib/dsh";
import { ProjectImportOptions } from "@/components/project-import-options";
import { skillAgentState, canAgentSkillAction } from "@/lib/agent-skill-actions";
import { DshBatchActions, DshBatchControls } from "@/components/dsh-batch-actions";
import { useWindowFullscreen } from "@/hooks/use-window-fullscreen";
import { WindowSidebarToolbar } from "@/components/window-sidebar-toolbar";
import { AlertDialog, AlertDialogContent, AlertDialogBody, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { BulkSelectionBar } from "@/components/bulk-selection-bar";
import { selectVisible } from "@/lib/selection";
import { PiBatchActions, PiBatchControls, type PiBatchAction } from "@/components/pi-batch-actions";
import { BackButton } from "@/components/back-button";
import { SkillInvocationStatus } from "@/components/skill-invocation-status";
import { PiInvocationToggle } from "@/components/pi-invocation-toggle";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ProjectSkillList, DependencyReview, RestoreReview, ProjectSkillResults } from "@/components/project-skill-review";
import { InstallSkillOption } from "@/components/install-skill-option";
import { ExecutionLog } from "@/components/execution-log";
import { OperationResults } from "@/components/operation-results";
import { recheckSourceRemoval, retryableSkills } from "@/lib/operation-results";
import { RemovalReview } from "@/components/removal-review";
import { Toaster } from "@/components/ui/sonner";
import { notifySuccess, notifyError, useFeedbackError, useInstallationProgress, type InstallationProgressState } from "@/lib/notifications";
import { PiManagement, type PiManagementHandle } from "@/components/pi-management";
import { type PiSettings, type PiRemovalPlan, filterPiNativeSkills, piStateReason, piConfiguredDirectory, mergePiSkillStates } from "@/lib/pi";
import { Switch } from "@/components/ui/switch";
import { syncWindowAppearance } from "@/lib/window-appearance";
import { OverflowText } from "@/components/overflow-text";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GeneralSettings } from "@/components/general-settings";
import { useNodeRuntimeDownload } from "@/hooks/use-node-runtime-download";
import { InstallReview } from "@/components/install-review";
import { InstallModeField } from "@/components/install-mode-field";
import { AgentLogo } from "@/components/agent-logo";
import { AgentStatusBadge } from "@/components/agent-status-badge";
import { ProjectEditor, ProjectIcon } from "@/components/project-editor";
import { ScopeSidebar } from "@/components/scope-sidebar";
import { AgentManagement } from "@/components/agent-management";
import { AgentPicker } from "@/components/agent-picker";
import { StepIndicator } from "@/components/step-indicator";
import { SidebarFooterHint, SidebarQuickSettings, sidebarFooterButtonClassName } from "@/components/sidebar-quick-settings";
import { ActionMenu } from "@/components/action-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Modal, ModalActions } from "@/components/modal";
import { type CSSProperties, lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { GitCommitHorizontalIcon, CircleArrowUpIcon, PaletteIcon, ListChecksIcon, XIcon, TerminalIcon, FilePlusIcon, RotateCcwIcon, Trash2Icon, CircleHelpIcon, InfoIcon, DownloadIcon, PackageIcon, ClockIcon, FolderOpenIcon, FolderPlusIcon, GitBranchIcon, Globe2Icon, LayoutDashboardIcon, PackagePlusIcon, RefreshCwIcon, SearchCheckIcon, LoaderCircleIcon, SearchIcon, Settings2Icon, ShoppingBagIcon } from "lucide-react";
import { AppearanceSettings } from "@/components/appearance-settings";
import { applyAppearance, cachedAppearance, cacheAppearance, normalizeAppearance } from "@/lib/appearance";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingCards } from "@/components/loading-cards";
import { SourceField } from "@/components/source-field";
import { cn } from "@/lib/utils";
const SkillDocument = lazy(() => import("@/components/skill-document").then(module => ({ default: module.SkillDocument })));
const UseSkillFlow = lazy(() => import("@/components/use-skill-flow").then(module => ({ default: module.UseSkillFlow })));
import appIcon from "@/assets/icon.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { inspectInstalledSkill, isNativeSkillForAgent, skillCollection, agentSkillOrigin, type SkillDiff, type SkillDocumentInfo, type SkillCollection, skillSourceKind, skillSourceUrl, ambiguousNames, skillInstallationPaths, sameNameNotice, removalTargetAgents, canRemove, canUpdate, availableUpdateSkills, detectedSkillAgents, installedSkillCounts, orderAgents, displayHomePath, expandHomePath, visibleSkills, type SyncOrigin, type SkillSyncReview, type SyncOptions, type DependencyPlan, type DependencyResult, type RestorePlan, type RestoreResult, type CreationPlan, type CreationResult, type Agent, type Inspection, type InstalledSkill, type Inventory, type Operation, type OperationResult, type RemovalPlan, type Preferences, type Project, type Target, type UpdateStatus } from "@/lib/upstream";

import {filterManagedSkills,managedSkillSourceOptions} from '@/lib/managed-skill-filters';

import {createFilterSession,filterContext,useViewFilters} from '@/lib/filter-session';

import {useLocalDirectories} from '@/hooks/use-local-directories';
import {DirectoryLink} from '@/components/directory-link';

function SourceIcon({ skill }: { skill: InstalledSkill }) {
  const origin = agentSkillOrigin(skill);
  const Icon = origin === "builtin" || origin === "package" ? PackageIcon : origin === "directory" ? FolderOpenIcon : { git: GitBranchIcon, local: FolderOpenIcon, download: DownloadIcon, "well-known": Globe2Icon, node_modules: PackageIcon, unknown: CircleHelpIcon }[skillSourceKind(skill)];
  return <Icon className="size-4 shrink-0" aria-hidden="true" />;
}


function skillSourceLabel(skill: InstalledSkill, zh: boolean): string {
  if(skill.codexState && skillCollection(skill)==="agent")return codexOrigin(skill.codexState,zh);
  const origin=agentSkillOrigin(skill);
  if(skillCollection(skill)==="agent"&&skill.hermesState){const labels:Record<string,[string,string]>={hub:["Hermes Hub","Hermes Hub"],builtin:["内置","Bundled"],created:["创建目录","Creation directory"],external:["附加目录","Extra directory"],project:["项目目录","Project directory"],local:["本地目录","Local directory"]};return labels[skill.hermesState.origin]?.[zh?0:1]??(zh?"本地目录":"Local directory");}
  if(origin==="builtin")return zh?"内置":"Bundled";
  if(origin==="package")return zh?"扩展包":"Package";
  if(origin==="directory")return zh?"本地目录":"Local folder";
  const labels={git:["Git 仓库","Git repository"],local:["本地目录","Local folder"],download:["直接下载","Direct download"],"well-known":["网站来源","Website source"],node_modules:["项目依赖","Project dependency"],unknown:["未知来源","Unknown source"]};
  return labels[skillSourceKind(skill)][zh?0:1];
}



const showSkillAuthoringActions = false;
const globalTarget: Target = { host: "local", scope: "global", projectPath: null };
const defaultPreferences: Preferences = { ...cachedAppearance(), language: "zh-CN", installMode: "symlink", projects: [], collapsedSections: [], hiddenAgents: [], visibleAgents: [], agentOrder: [] };
const steps = ["安装来源", "技能", "安装目标", "确认", "结果"];
const englishSteps = ["Source", "Skills", "Targets", "Review", "Result"];
type Page = "installed" | "discover" | "agents" | "settings";
type DependencyFlow = { step: number; discovery: DependencyPlan | null; options: SyncOptions; includeText: string; excludeText: string; target: Target; agents: string[]; plan: DependencyPlan | null; result: DependencyResult | null };
type Restoration = { records: Array<{skill:string;source:string}> | null; target: Target; plan: RestorePlan | null; result: RestoreResult | null };
type DshCreationReview={target:Target;key:string|null;revision:string;directory:string;name:string;plan:CreationPlan};
type Creation = { nativeDsh?:boolean;dshReview?:DshCreationReview; directory: string; name: string; mode: "child" | "current"; plan: CreationPlan | null; result: CreationResult | null };
type Wizard = { syncSkill?: string; syncOrigin?: SyncOrigin; syncReview?: SkillSyncReview; eveSubagents: string[]; includeInternal: boolean; step: number; source: string; inspection: Inspection | null; skills: string[]; agents: string[]; target: Target; catalog: Agent[]; copy: boolean };


function App() {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const preferencesRef=useRef(preferences);
  preferencesRef.current=preferences;
  const dshContextWrites=useRef(0);
  const dshSavedContexts=useRef<Record<string,string|null>>({});
  const [writeDshContext]=useState(()=>createDshContextWriter(async contexts=>{
    await invoke<Preferences>('upstream_save_preferences',{preferences:{...preferencesRef.current,dshContexts:contexts}});
  }));
  const [collection,setCollection] = useState<SkillCollection>("managed");
  const [page,setPage]=useState<Page>("installed");
  const [target,setTargetState]=useState<Target>(globalTarget);
  const [selectedAgent,setSelectedAgent]=useState("");
  const [filterSession]=useState(createFilterSession);
  const selectorKey=(owner:SkillCollection)=>filterContext(target,"inventory-agent",page==="agents"?"agents":"installed",owner);
  const [selectorFilters]=useViewFilters(filterSession,selectorKey(collection));
  const agentFilter=selectorFilters.agent;
  const queryKey=(owner:SkillCollection)=>filterContext(target,"skills",page==="agents"?"agents":"installed",page==="agents"?selectedAgent:filterSession.get(selectorKey(owner)).agent,owner);
  const [viewFilters]=useViewFilters(filterSession,queryKey(collection));
  const [managed]=useViewFilters(filterSession,queryKey("managed"));
  const [codexPlugins]=useViewFilters(filterSession,filterContext(target,"codex","plugins"));
  const [codexNativeFilters]=useViewFilters(filterSession,filterContext(target,"codex","native"));
  const [piNativeFilters]=useViewFilters(filterSession,filterContext(target,"pi","native"));
  const [dshNativeFilters,patchDshNativeFilters]=useViewFilters(filterSession,filterContext(target,"deepseek-harness","native"));
  const [hermesNativeFilters]=useViewFilters(filterSession,filterContext(target,"hermes-agent","native"));
  const [settingsFilters,patchSettingsFilters]=useViewFilters(filterSession,filterContext(target,"settings","agents"));
  const query=viewFilters.query,settingsAgentQuery=settingsFilters.query;
  const setSettingsAgentQuery=(value:string)=>patchSettingsFilters({query:value});
  const setSettingsAgentStatus=(value:string)=>patchSettingsFilters({status:value});
  function setQuery(value:string,owner:SkillCollection=collection){filterSession.patch(queryKey(owner),{query:value});}
  function setAgentFilter(value:string,owner:SkillCollection=collection){filterSession.patch(selectorKey(owner),{agent:value});}
  const managedSource=managed.source, setManagedSource=(value:string)=>filterSession.patch(queryKey("managed"),{source:value});
  const managedStatus=managed.status, setManagedStatus=(value:string)=>filterSession.patch(queryKey("managed"),{status:value});
  const codexPluginQuery=codexPlugins.query, setCodexPluginQuery=(value:string)=>filterSession.patch(filterContext(target,"codex","plugins"),{query:value});
  const codexPluginSource=codexPlugins.source, setCodexPluginSource=(value:string)=>filterSession.patch(filterContext(target,"codex","plugins"),{source:value});
  const codexPluginStatus=codexPlugins.status, setCodexPluginStatus=(value:string)=>filterSession.patch(filterContext(target,"codex","plugins"),{status:value});
  const codexStatus=codexNativeFilters.status, setCodexStatus=(value:string)=>filterSession.patch(filterContext(target,"codex","native"),{status:value});
  const codexSource=codexNativeFilters.source, setCodexSource=(value:string)=>filterSession.patch(filterContext(target,"codex","native"),{source:value});
  const hermesStatusFilter=hermesNativeFilters.status, setHermesStatusFilter=(value:string)=>filterSession.patch(filterContext(target,"hermes-agent","native"),{status:value});
  const hermesOriginFilter=hermesNativeFilters.source, setHermesOriginFilter=(value:string)=>filterSession.patch(filterContext(target,"hermes-agent","native"),{source:value});
  const piStatusFilter=piNativeFilters.status, setPiStatusFilter=(value:string)=>filterSession.patch(filterContext(target,"pi","native"),{status:value});
  const piPackageFilter=piNativeFilters.source, setPiPackageFilter=(value:string)=>filterSession.patch(filterContext(target,"pi","native"),{source:value});
  const [bulkSelectionMode, setBulkSelectionMode] = useState(false);
  const codexEditor = useRef<CodexSettingsHandle | null>(null);
  const [settingsCodex, setSettingsCodex] = useState(false);
  const piEditor = useRef<PiManagementHandle | null>(null);
  const hermesEditor = useRef<HermesEditorHandle | null>(null);
  const dshEditor = useRef<DshEditorHandle | null>(null);
  const guardPi = (action: () => void) => { if(codexEditor.current){codexEditor.current.requestLeave(action);return;} if(dshEditor.current){dshEditor.current.requestLeave(action);return;}  if(hermesEditor.current)hermesEditor.current.requestLeave(action);else if(piEditor.current)piEditor.current.requestLeave(action);else action(); };
  const [settingsPi, setSettingsPi] = useState(false);
  const [settingsDsh, setSettingsDsh] = useState(false);
  const dshContexts=preferences.dshContexts??{};
  function setDshContext(scope:Target,key:string|null,view:'scope'|'settings'='scope',filePath?:string|null){
    const name=view==='settings'?'settings':dshScopeKey(scope);
    if(view==='scope'){setSelected([]);setBulkSelectionMode(false);setDetail(null);}
    const current=preferencesRef.current;
    const contexts=current.dshContexts??{};
    const nextContexts={...contexts,[name]:key,...(view==='settings'&&filePath!==undefined?{settingsFile:filePath}:{})};
    if(contexts[name]===key&&!(view==='settings'&&filePath!==undefined&&contexts.settingsFile!==filePath))return;
    // Apply the intent immediately so fast choices merge across scopes. Persist in order,
    // without applying an older save response over the latest visible selection.
    if(!dshContextWrites.current)dshSavedContexts.current=contexts;
    const next={...current,dshContexts:nextContexts};
    preferencesRef.current=next;setPreferences(next);
    dshContextWrites.current++;setSaving(true);
    void writeDshContext(nextContexts).then(()=>{dshSavedContexts.current=nextContexts;}).catch(reason=>{
      const latest=preferencesRef.current.dshContexts===nextContexts;
      if(latest){
        const restored={...preferencesRef.current,dshContexts:dshSavedContexts.current};
        preferencesRef.current=restored;setPreferences(restored);
      }
      setError(String(reason),latest?t('配置选择未保存，已恢复上次保存的选择。','Configuration selection was not saved. The last saved selection has been restored.'):t('配置选择保存失败，后续选择仍将继续保存。','A configuration selection could not be saved. Later selections will still be saved.'));
    }).finally(()=>{
      dshContextWrites.current--;if(!dshContextWrites.current)setSaving(false);
    });
  }
  const [dshRemoval,setDshRemoval] = useState<DshRemoval|null>(null);
  const [codexPluginTab, setCodexPluginTab] = useState(false);
  const [piPackageTab,setPiPackageTab] = useState(false);
  const [piPackagePage,setPiPackagePage] = useState<string|null>(null);
  const [piPackageCache] = useState(() => createPiPackageCache(async target => (await invoke<PiInventoryResult>('upstream_pi_packages', {request:{target,action:'list'}})).snapshot));
  const [piPackageSummary,setPiPackageSummary] = useState<PiPackageSummary>({count:null,loading:true});
  const [codexAdding,setCodexAdding]=useState(false);
  const [codexDirectoryView,setCodexDirectoryView]=useState<CodexDirectoryNavigation>({tab:"public",section:null});
  const [directoryFilters,patchDirectoryFilters]=useViewFilters(filterSession,filterContext(target,"codex","discovery",codexDirectoryView.tab,codexDirectoryView.section?.urlSlug??codexDirectoryView.section?.title??""));
  const codexAddQuery=directoryFilters.query,setCodexAddQuery=(value:string)=>patchDirectoryFilters({query:value});
  const [codexDirectoryDetail,setCodexDirectoryDetail]=useState<CodexPlugin|null>(null);
  const [codexMarkets,setCodexMarkets]=useState(false);
  const [codexPluginPage,setCodexPluginPage]=useState<{id:string}|null>(null);
  const [codexReturnDetail, setCodexReturnDetail] = useState<InstalledSkill|null>(null);
  const [settingsHermes, setSettingsHermes] = useState(false);
  const [hermesSettings, setHermesSettings] = useState<HermesSettings | null>(null);
  const [hermesPending, setHermesPending] = useState<{skills:InstalledSkill[];kind:"toggle"|"preload";enabled:boolean}|null>(null);
  const [piPackageReview,setPiPackageReview]=useState<{skill:InstalledSkill;result:PiPackageResult}|null>(null);
  const [piSettings, setPiSettings] = useState<PiSettings | null>(null);
  const [settingsSection, setSettingsSection] = useState<"global" | "agents" | "appearance">("agents");
  const marketplaceSession = useRef(createMarketplaceSession());
  const [saving, setSaving] = useState(false);
  const [projectEditor, setProjectEditor] = useState<Project | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const dshContextKey = "all";
  const normalizedDshFilters=normalizeDshFilters(inventory?.dsh,dshNativeFilters.source,dshNativeFilters.status);
  const dshFileFilter=normalizedDshFilters.configuration,dshPresetFilter=normalizedDshFilters.preset;
  const contextFor = (_scope: Target) => "all";
  useEffect(()=>{
    if(page==='agents'&&selectedAgent==='deepseek-harness'&&collection==='agent'&&inventory?.dsh&&(dshNativeFilters.source!==dshFileFilter||dshNativeFilters.status!==dshPresetFilter)){
      patchDshNativeFilters({source:dshFileFilter,status:dshPresetFilter});setSelected([]);setDetail(null);
    }
  },[page,selectedAgent,collection,inventory?.dsh,dshFileFilter,dshPresetFilter,dshNativeFilters.source,dshNativeFilters.status,patchDshNativeFilters]);

  const inventoryReads=useRef(new Map<string,{promise:Promise<Inventory>;fresh:boolean}>());
  const inventorySnapshots=useRef(new Map<string,Inventory>());
  const inventoryGeneration=useRef(0);
  const inventoryContext=useRef<string|null>(null);
  const inventoryKey=(scope:Target)=>JSON.stringify([scope.host,scope.scope,scope.projectPath??null,contextFor(scope)]);
  function invalidateInventory(){inventoryGeneration.current++;inventorySnapshots.current.clear();inventoryReads.current.clear();}
  function acceptInventoryMutation(){invalidateInventory();++request.current;setLoading(false);}
  async function loadInventory(scope:Target,fresh=true){
    const dshContextKey=contextFor(scope),key=inventoryKey(scope);
    if(!fresh){const cached=inventorySnapshots.current.get(key);if(cached)return cached;}
    const pending=inventoryReads.current.get(key);
    if(pending&&(!fresh||pending.fresh))return pending.promise;
    if(fresh)invalidateInventory();
    const generation=inventoryGeneration.current;
    const read=invoke<Inventory>("upstream_inventory",{target:scope,dshContextKey}).then(value=>{
      if(value.dsh)value=mergeDshStates(value,value.dsh)??value;
      if(generation===inventoryGeneration.current)inventorySnapshots.current.set(key,value);
      return value;
    });
    inventoryReads.current.set(key,{promise:read,fresh});
    try{return await read;}finally{if(inventoryReads.current.get(key)?.promise===read)inventoryReads.current.delete(key);}
  }
  function setTarget(next: Target) {
    ++request.current;
    setCodexPluginTab(false);setCodexAdding(false);setCodexPluginPage(null);
    const key=inventoryKey(next),cached=inventorySnapshots.current.get(key);
    inventoryContext.current=cached?key:null;
    setInventory(cached??null);
    setTargetState(next);
  }
  useEffect(()=>{const key=inventoryKey(target);if(inventory&&inventoryContext.current===key)inventorySnapshots.current.set(key,inventory);},[inventory,target,dshContextKey]);
  const [selected, setSelected] = useState<string[]>([]);
  const [home, setHome] = useState("");
  const displayPath = (value: string) => displayHomePath(value, home);
  const expandPath = (value: string) => expandHomePath(value, home);
  const [error, setError] = useFeedbackError(preferences.language !== "en");
  const [busy, setBusyState] = useState(false);
  const setBusy=useCallback((value:boolean)=>{if(value)invalidateInventory();setBusyState(value);},[]);
  const [piConfigPending, setPiConfigPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [projectChecking, setProjectChecking] = useState(false);
  const projectRequest = useRef(0);
  const [dependencyFlow, setDependencyFlow] = useState<DependencyFlow | null>(null);
  const [, setDependencyError] = useFeedbackError(preferences.language !== "en");
  const [restoration, setRestoration] = useState<Restoration | null>(null);
  const [, setRestoreError] = useFeedbackError(preferences.language !== "en");
  const [creation, setCreation] = useState<Creation | null>(null);
  const [, setCreationError] = useFeedbackError(preferences.language !== "en");
  const [useFlow, setUseFlow] = useState<{ source: string; skill: string; target: Target } | null>(null);
  const [useBusy, setUseBusy] = useState(false);
  const [wizard, setWizard] = useState<Wizard | null>(null);
  const [, setWizardError] = useFeedbackError(preferences.language !== "en");
  const [piRemoval, setPiRemoval] = useState<PiRemovalPlan | null>(null);
  const [pending, setPending] = useState<Operation | null>(null);
  const [result, setResult] = useState<OperationResult | null>(null);
  const [lastOperation, setLastOperation] = useState<Operation | null>(null);
  const [detail, setDetail] = useState<InstalledSkill | null>(null);
  const [document, setDocument] = useState("");
  const [documentLoading,setDocumentLoading]=useState(false);
  const [documentReadState,setDocumentReadState]=useState<VersionReadState>("ready");
  const [documentVersion, setDocumentVersion] = useState<string | null>(null);
  const [documentRevision, setDocumentRevision] = useState<string | null>(null);
  const diffCache = useRef(new Map<string, Promise<SkillDiff>>());
  const [documentLocalState, setDocumentLocalState] = useState<string | null>(null);
  const [sourceDirectory, setSourceDirectory] = useState<string | null>(null);
  const [updates, setUpdates] = useState<UpdateStatus[]>([]);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [checkingPackage, setCheckingPackage] = useState(false);
  const updatesBySkill = useMemo(() => new Map(updates.map(item => [item.skill, item])), [updates]);
  const request = useRef(0);
  const inspectionRequest = useRef(0);
  const [installationProgress, setInstallationProgress] = useState<InstallationProgressState | null>(null);
  const progressRequest = useRef(0);
  function startInstallationProgress(stage: InstallationProgressState["stage"]) {
    const token = ++progressRequest.current;
    setInstallationProgress({stage, detail:null, completed:0, total:0});
    const channel = new Channel<InstallationProgressState>();
    channel.onmessage = progress => { if (token === progressRequest.current) setInstallationProgress(progress); };
    return channel;
  }
  function stopInstallationProgress() { ++progressRequest.current; setInstallationProgress(null); }

  const inspectionSessionId = wizard?.inspection?.sessionId;
  useEffect(() => () => {
    if (inspectionSessionId) void invoke("upstream_inspection_release", { sessionId: inspectionSessionId }).catch(() => {});
  }, [inspectionSessionId]);
  const documentRequest = useRef(0);
  const documentIdentity=useRef<string|null>(null);
  useEffect(()=>{if(!detail)documentIdentity.current=null;},[detail]);
  const zh = preferences.language !== "en";
  useNodeRuntimeDownload(zh);
  useInstallationProgress(installationProgress, zh);
  const t = (chinese: string, english: string) => zh ? chinese : english;
  const labels: Record<Page, string> = { installed: t("技能空间", "Skill Space"), discover: t("技能商店", "Skills Store"), agents: "Agents", settings: t("设置", "Settings") };
  const filter = page === "agents" ? selectedAgent : agentFilter;
  const deferredQuery = useDeferredValue(query);
  const filteredRows = useMemo(() => page === "agents" && !selectedAgent ? [] : visibleSkills(inventory, deferredQuery, filter), [inventory, deferredQuery, filter, page, selectedAgent]);
  const dshAgentView=page==='agents'&&selectedAgent==='deepseek-harness';
  const dshNativeInventory=useMemo(()=>inventory?{...inventory,skills:dshDiscoveredSkills(inventory)}:null,[inventory]);
  const dshVisibleRows=useMemo(()=>dshAgentView?filterDshSkills(visibleSkills(dshNativeInventory,deferredQuery,'deepseek-harness'),dshFileFilter,dshPresetFilter):[],[dshAgentView,dshNativeInventory,deferredQuery,dshFileFilter,dshPresetFilter]);
  const collections = useMemo(()=>({managed:filteredRows.filter(skill=>skillCollection(skill,page==="agents"?selectedAgent:undefined)==="managed"),agent:dshAgentView?dshVisibleRows:filteredRows.filter(skill=>skillCollection(skill,page==="agents"?selectedAgent:undefined)==="agent")}),[filteredRows,page,selectedAgent,dshAgentView,dshVisibleRows]);
  const nativeSourceSkills=useMemo(()=>dshAgentView?visibleSkills(dshNativeInventory,"",filter):visibleSkills(inventory,"",filter).filter(skill=>skillCollection(skill,page==="agents"?selectedAgent:undefined)==="agent"),[inventory,filter,page,selectedAgent,dshAgentView,dshNativeInventory]);
  const collectionCounts = useMemo(() => {
    const skills = page === "agents" && !selectedAgent ? [] : visibleSkills(inventory, "", page === "agents" ? selectedAgent : "");
    const managed = skills.filter(skill => skillCollection(skill,page==="agents"?selectedAgent:undefined) === "managed").length;
    return { managed, agent: dshAgentView?visibleSkills(dshNativeInventory,"",selectedAgent).length:skills.length-managed };
  }, [inventory, page, selectedAgent,dshAgentView,dshNativeInventory]);
  // Collection filters narrow results; only an Agent management page sets an action context.
  const activeSkillAgent = (page === "agents" ? selectedAgent : "") || null;
  const managedAgentContext=page==="agents"?selectedAgent:filterSession.get(selectorKey("managed")).agent;
  const managedSourceOptions=useMemo(()=>managedSkillSourceOptions(visibleSkills(inventory,"",managedAgentContext).filter(skill=>skillCollection(skill,page==="agents"?selectedAgent:undefined)==="managed"),zh),[inventory,managedAgentContext,zh,page,selectedAgent]);
  const piNativeBatch = activeSkillAgent === "pi" && collection === "agent";
  const dshNativeBatch = activeSkillAgent === "deepseek-harness" && collection === "agent";
  const codexNative = activeSkillAgent === "codex" && collection === "agent";
  const nativeFileBatch = codexNative || piNativeBatch || dshNativeBatch || activeSkillAgent === "hermes-agent" && collection === "agent";
  const selectedDshSkills = dshNativeBatch ? collections.agent.filter(skill=>skill.dshState&&selected.includes(skill.dshState.file)) : [];
  const managedDshSkills=activeSkillAgent==='deepseek-harness'&&collection==='managed'?collections.managed.filter(skill=>skill.dshState&&selected.includes(skill.name)):[];
  const hermesNative = activeSkillAgent === "hermes-agent" && collection === "agent";
  const rows = codexNative ? filterCodexSkills(collections.agent,codexSource,codexStatus) : piNativeBatch ? filterPiNativeSkills(collections.agent,piStatusFilter,piPackageFilter) : hermesNative ? filterHermesSkills(collections.agent,hermesStatusFilter,hermesOriginFilter) : collection==="managed"?filterManagedSkills(collections.managed,managedSource,managedStatus,filter||null):collections[collection];
  useEffect(()=>{setPiPackagePage(null);setPiPackageSummary({count:piPackageCache.peek(target)?.packages.length??null,loading:!piPackageCache.peek(target),packages:piPackageCache.peek(target)?.packages});setPiPackageTab(false);setCodexMarkets(false);setCodexAdding(false);setCodexDirectoryDetail(null);setCodexDirectoryView({tab:"public",section:null});setCodexPluginPage(null);setCodexReturnDetail(null);setCodexPluginTab(false);},[target,activeSkillAgent]);
  const selectedHermesSkills = activeSkillAgent==="hermes-agent" ? hermesSelection(visibleSkills(inventory,"","hermes-agent"),selected,collection) : [];
  const selectedPiSkills = piNativeBatch ? visibleSkills(inventory,"","pi").filter(skill => isNativeSkillForAgent(skill,"pi") && skill.piState && selected.includes(skill.piState.file)) : [];
  const piBatchSkills = collection === "managed" && activeSkillAgent === "pi" ? visibleSkills(inventory,"","pi").filter(skill=>skillCollection(skill)==="managed" && selected.includes(skill.name)) : selectedPiSkills;
  const piBatchAvailable = { enable: piActionSkills(piBatchSkills,"enable").length > 0, disable: piActionSkills(piBatchSkills,"disable").length > 0, auto: piActionSkills(piBatchSkills,"auto").length > 0, manual: piActionSkills(piBatchSkills,"manual").length > 0 };
  const canSetPiInvocation = (skill: InstalledSkill) => canAgentSkillAction(skill,activeSkillAgent,"pi-invocation");
  const canSelectManagedSkill = (skill: InstalledSkill) => canUpdate(inventory?.skills ?? [],[skill.name]) || canRemove(inventory?.skills ?? [],[skill.name],removalTargetAgents(skill,filter)) || canAgentSkillAction(skill,activeSkillAgent,"codex-toggle") || canAgentSkillAction(skill,activeSkillAgent,"pi-toggle") || canAgentSkillAction(skill,activeSkillAgent,"hermes-toggle") || canAgentSkillAction(skill,activeSkillAgent,"hermes-preload") || canAgentSkillAction(skill,activeSkillAgent,"dsh-invocation");
  const codex = useCodexManagement({detailPluginId:codexPluginPage?.id??null,inventoryReady:inventory!==null&&!loading,active:activeSkillAgent==="codex",directoryActive:codexAdding,initialSnapshot:inventory?.codex,target,zh,onBusy:setBusy,onSaved:(snapshot,refreshInventory,changed)=>{
    // Catalog reads enrich this scope; only writes invalidate other scopes.
    if(changed)acceptInventoryMutation();
    setInventory(current=>mergeCodexStates(current,snapshot));
    setDetail(current=>current?mergeCodexStates({version:"",agents:[],skills:[current],warnings:[]},snapshot)?.skills[0]??current:null);
    if(refreshInventory)void refresh(target,true,snapshot);
  }});
  useEffect(()=>{setCodexDirectoryDetail(null);setCodexPluginPage(null);setCodexDirectoryView({tab:"public",section:null});},[codex.snapshot?.contextId]);
  const pluginDirectory=activeSkillAgent==="codex"&&codexPluginTab&&codex.snapshot?.codexHome?`${codex.snapshot.codexHome.replace(/[\\/]+$/,"")}/plugins`:activeSkillAgent==="pi"&&piPackageTab?piSettings?.path.replace(/[\\/][^\\/]+$/,"")??null:null;
  const pluginDirectories=useLocalDirectories([pluginDirectory]);
  const confirmedPluginDirectory=pluginDirectories.find(item=>item.path===pluginDirectory&&item.directory===item.path);
  const selectedCodexSkills = activeSkillAgent==="codex" ? (inventory?.skills??[]).filter(skill=>skill.agents.includes("codex")&&selected.includes(skill.path)&&skillCollection(skill,"codex")===collection) : [];
  const selectedManagedNames=activeSkillAgent==="codex"?[...new Set((inventory?.skills??[]).filter(skill=>selected.includes(skill.path)&&skillCollection(skill,"codex")==="managed").map(skill=>skill.name))]:selected;
  function codexBatchControls(){return <SkillBatchToggleControls count={selectedCodexSkills.length} disabled={busy||!codex.snapshot||!!codex.snapshot.unavailableReason} canEnable={codexToggleSelection(selectedCodexSkills,true).skills.length>0} canDisable={codexToggleSelection(selectedCodexSkills,false).skills.length>0} zh={zh} onChange={enabled=>codex.toggle(selectedCodexSkills,enabled)}/>;}
  function openCodexPlugin(id: string){if(!codexPluginPage)setCodexReturnDetail(detail);setCodexPluginPage({id});setCodexPluginTab(true);setDetail(null);}
  const detailAgentState = detail ? skillAgentState(detail,activeSkillAgent) : null;
  const detailHermesState = detailAgentState?.hermes;
  const piAdditionalDirectories = activeSkillAgent === "pi" ? piSettings?.additionalDirectories ?? [] : [];
  const detailConfiguredDirectory = activeSkillAgent==="pi"&&detail && isNativeSkillForAgent(detail,"pi") ? piConfiguredDirectory(detail.piState?.rulePath, piAdditionalDirectories) : undefined;
  const detailDeclaredPath=detail&&dshNativeBatch?detail.dshState?.declaredPath:null;
  const detailPaths = detail ? skillInstallationPaths(dshNativeBatch?nativeSourceSkills:inventory?.skills??[], detail.name, activeSkillAgent) : [];
  const ambiguous = useMemo(() => ambiguousNames(dshNativeBatch?nativeSourceSkills:inventory?.skills??[]), [inventory,dshNativeBatch,nativeSourceSkills]);
  const catalog = useMemo(() => orderAgents(inventory?.agents ?? [], preferences.agentOrder), [inventory, preferences.agentOrder]);
  const agentById = useMemo(() => new Map(catalog.map(agent => [agent.id, agent])), [catalog]);
  const skillCountByAgent = useMemo(() => installedSkillCounts(inventory), [inventory]);
  const isVisible = (agent: Agent) => !preferences.hiddenAgents.includes(agent.id) && (agent.installationStatus === "confirmed" || preferences.visibleAgents.includes(agent.id));
  const shownAgents = catalog.filter(isVisible);
  const applyNavigation = (next: Page) => { setPiPackagePage(null);setCodexMarkets(false); setCodexPluginPage(null);setCodexReturnDetail(null);setPage(next); setDetail(null); setSelected([]); setBulkSelectionMode(false); };
  const navigate = (next: Page) => guardPi(()=>{if(next==="installed")setCollection("managed");applyNavigation(next);});
  const selectAgent = (id: string) => guardPi(()=>{ setSelectedAgent(id); applyNavigation("agents"); });
  const scopeOptions = [{ value: "global", label: t("全局", "Global") }, ...preferences.projects.map(project => ({ value: project.path, label: project.name }))];
  const chooseScope = (value: string): Target => value === "global" ? globalTarget : { host: "local", scope: "project", projectPath: value };
  const setVisible = (agent: Agent, visible: boolean) => void save({ ...preferences, hiddenAgents: visible ? preferences.hiddenAgents.filter((id) => id !== agent.id) : [...new Set([...preferences.hiddenAgents, agent.id])], visibleAgents: visible ? [...new Set([...preferences.visibleAgents, agent.id])] : preferences.visibleAgents.filter((id) => id !== agent.id) });
  const selectScopeAgent = (scope: Target, id: string) => guardPi(()=>{
    if (scope.scope !== target.scope || scope.projectPath !== target.projectPath) setTarget(scope);
    setCollection("managed");setSelectedAgent(id);applyNavigation("agents");
  });
  useEffect(() => {
    if (page === "agents" && !selectedAgent && shownAgents[0]) setSelectedAgent(shownAgents[0].id);
  }, [page, selectedAgent, shownAgents]);
  const scopeProject = target.scope === "project" ? preferences.projects.find(project => project.path === target.projectPath) : undefined;
  const scopeLabel = target.scope === "global" ? t("全局管理", "Global management") : scopeProject?.name ?? displayPath(target.projectPath ?? "");
  const currentAgent = agentById.get(selectedAgent);
  const currentSkillDirectory = collection === "agent" && selectedAgent === "hermes-agent" && !currentAgent?.directoryExists ? currentAgent?.additionalPaths[0] ?? currentAgent?.path : collection === "agent" && (selectedAgent === "pi" || selectedAgent === "codex") ? currentAgent?.additionalPaths[0] ?? currentAgent?.path : currentAgent?.path;
  const dshDirectories = (inventory?.dsh?.roots??[]).filter(root=>dshMatchesMembership(root.memberships,dshFileFilter,dshPresetFilter));
  const dshUnreadablePreset=unreadableDshPreset(inventory?.dsh,dshFileFilter,dshPresetFilter);
  const dshNativeDirectory = dshNativeBatch;
  const dshUseEmpty=dshNativeDirectory&&!!inventory?.dsh&&!dshDirectories.length&&(dshFileFilter==='all'&&dshPresetFilter==='all'||!!dshUnreadablePreset);
  const agentUnconfirmed = page === "agents" && !!currentAgent && currentAgent.installationStatus !== "confirmed";

  async function refresh(nextTarget = target, preserveSelection = false, codexState?: CodexSnapshot, fresh = true) {
    const id = ++request.current;
    const key=inventoryKey(nextTarget),cached=!fresh?inventorySnapshots.current.get(key):undefined;
    setLoading(!cached);if(!fresh){inventoryContext.current=cached?key:null;setInventory(previous=>cached??(selectedAgent==='deepseek-harness'&&nextTarget===target?previous:null));}
    setError(""); setUpdates([]); if(!preserveSelection)setSelected([]);
    try {
      const [currentHome, next] = await Promise.all([home ? Promise.resolve(home) : homeDir(), loadInventory(nextTarget,fresh)]);
      if (id === request.current) setHome(currentHome);
      if (id === request.current) {inventoryContext.current=key;setInventory(previous=>{const current=reconcileCodexInventory(previous,next);return codexState?mergeCodexStates(current,codexState):current;});}
    } catch (reason) { if (id === request.current) { setInventory(null); setError(String(reason),t("技能列表读取失败，请点击“刷新”。","Could not read skills. Click Refresh.")); } }
    finally { if (id === request.current) setLoading(false); }
  }
  useEffect(() => {
    void invoke<Preferences>("upstream_preferences").then(value => setPreferences({ ...value, ...normalizeAppearance(value) })).catch((reason) => setError(String(reason), t("应用设置读取失败，请重新打开设置。", "Could not read app settings. Reopen Settings.")));
  }, []);
  useEffect(() => { setSelected([]); setUpdates([]); setDetail(null); void refresh(target,false,undefined,false); }, [target,dshContextKey]);
  useEffect(() => {
    if (!updates.length || busy || loading || checkingUpdates) return;
    let cancelled = false;
    let running = false;
    const refreshLocal = async () => {
      if (running) return;
      running = true;
      const id = request.current;
      try {
        const states = await invoke<Record<string, string>>("upstream_update_local_states", { target, skills: updates.map(item => item.skill) });
        if (!cancelled && id === request.current) setUpdates(current => current.map(item => {
          const state = states[item.skill];
          return state === "clean" || state === "modified" ? { ...item, localState: state } : item;
        }));
      } catch { /* A failed local read does not discard the last observed state. */ }
      finally { running = false; }
    };
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) void refreshLocal();
    }).then(stop => { if (cancelled) stop(); else unlisten = stop; }).catch(() => {});
    void refreshLocal();
    return () => { cancelled = true; unlisten?.(); };
  }, [target, updates.length, busy, loading, checkingUpdates]);
  const piInventoryReady = inventory !== null && !loading;
  useEffect(() => {
    let cancelled = false;
    if (activeSkillAgent === "pi" && piInventoryReady) {
      setPiSettings(current=>current?.target.scope===target.scope && current.target.projectPath===target.projectPath ? current : null);
      const read=inventory?.pi?Promise.resolve(inventory.pi):invoke<PiSettings>("upstream_pi_settings", { target });
      void read.then(value => { if (!cancelled) {setPiSettings(value);setInventory(current=>{const next=mergePiSkillStates(current,value.skills);return next?{...next,pi:value}:next;});} }).catch(reason => { if (!cancelled) setError(String(reason), t("Pi 配置读取失败，请刷新技能列表。", "Could not read Pi settings. Refresh skills.")); });
    }
    else if (activeSkillAgent !== "pi") setPiSettings(null);
    return () => { cancelled = true; };
  }, [activeSkillAgent, target, piInventoryReady, inventory?.pi]);
  useEffect(()=>{
    let cancelled=false;
    if(activeSkillAgent==="hermes-agent" && piInventoryReady){
      setHermesSettings(current=>current?.target.scope===target.scope&&current.target.projectPath===target.projectPath?current:null);
      const read=inventory?.hermes?Promise.resolve(inventory.hermes):invoke<HermesSettings>("upstream_hermes_settings",{target});
      void read.then(value=>{if(!cancelled)applyHermesState(value);}).catch(reason=>{if(!cancelled)setError(String(reason),t("Hermes 配置读取失败，请刷新技能列表。","Could not read Hermes settings. Refresh skills."));});
    }else if(activeSkillAgent!=="hermes-agent")setHermesSettings(null);
    return()=>{cancelled=true;};
  },[activeSkillAgent,target,piInventoryReady,inventory?.hermes]);
  function applyHermesState(snapshot:HermesSettings,changed=false) {
    if(changed)acceptInventoryMutation();
    setHermesSettings(snapshot);setInventory(current=>{const next=mergeHermesStates(current,snapshot);return next?{...next,hermes:snapshot}:next;});
    setDetail(current=>current?mergeHermesStates({version:"",agents:[],skills:[current],warnings:[]},snapshot)?.skills[0]??current:current);
  }
  async function reconcileHermesState() {
    try{applyHermesState(await invoke<HermesSettings>("upstream_hermes_settings",{target}),true);return true;}catch{setHermesSettings(null);return false;}
  }
  async function applyHermesAction(item:{skills:InstalledSkill[];kind:"toggle"|"preload";enabled:boolean}) {
    if(!hermesSettings||busy||!item.skills.length)return;
    const changes=item.skills.map(skill=>({kind:item.kind,file:skill.hermesState?.file,documentRevision:skill.hermesState?.documentRevision,enabled:item.enabled}));
    setBusy(true);setError("");
    try {
      const snapshot=await invoke<HermesSettings>("upstream_hermes_save",{target,change:{kind:"batch",revision:hermesSettings.revision,changes}});
      applyHermesState(snapshot,true);setHermesPending(null);
      notifySuccess(t(`已完成 ${changes.length} 项`,`${changes.length} completed.`));
    }catch(reason){const refreshed=await reconcileHermesState();setHermesPending(null);const message=String(reason);setError(refreshed&&/Hermes settings changed|Hermes skill changed or is not editable/i.test(message)?t("技能列表已刷新，请重新选择启用、停用或加载方式。","Skills refreshed. Choose Enable, Disable or a loading mode again."):message,item.kind==="preload"?t("加载方式未保存，请重新选择加载方式。","Loading mode was not saved. Choose the loading mode again."):t("启停设置未保存，请重新选择启用或停用。","Enablement was not saved. Choose Enable or Disable again."));}finally{setBusy(false);}
  }
  function changeHermesSkills(selection:InstalledSkill[],kind:"toggle"|"preload",enabled:boolean) {
    const skills=hermesActionSkills(selection,kind,enabled);
    if(!hermesSettings||busy||!skills.length||skills.some(skill=>!canAgentSkillAction(skill,activeSkillAgent,kind==="toggle"?"hermes-toggle":"hermes-preload")))return;
    const item={skills,kind,enabled};
    if(target.scope==="project"||skills.some(skill=>hermesSettings.skills.filter(s=>s.name===skill.name).length>1))setHermesPending(item);else void applyHermesAction(item);
  }
  function canChangeHermesSelection(kind:"toggle"|"preload",enabled:boolean) {
    const changes=hermesActionSkills(selectedHermesSkills,kind,enabled);
    return !!hermesSettings && changes.length>0 && changes.every(skill=>canAgentSkillAction(skill,activeSkillAgent,kind==="toggle"?"hermes-toggle":"hermes-preload"));
  }
  function changeHermes(skill:InstalledSkill,kind:"toggle"|"preload",enabled:boolean){changeHermesSkills([skill],kind,enabled);}
  function applyDshSnapshot(snapshot: DshSnapshot) {
    acceptInventoryMutation();
    setInventory(current=>mergeDshStates(current,snapshot));
    setDetail(current=>current?mergeDshStates({version:"",agents:[],skills:[current],warnings:[]},snapshot)?.skills[0]??current:current);
  }
  const [dshPolicyPending,setDshPolicyPending]=useState<{skills:InstalledSkill[];action:DshPolicyAction}|null>(null);
  function changeDshPolicy(skills:InstalledSkill[],action:DshPolicyAction){
    if(busy)return;
    if(dshPolicyNeedsConfirmation(skills,target))setDshPolicyPending({skills,action});
    else void saveDshPolicy(skills,action);
  }
  async function saveDshPolicy(skills: InstalledSkill[], action: DshPolicyAction) {
    const snapshot=inventory?.dsh;
    if(busy||!snapshot?.policy?.canSave||!skills.length)return;
    setBusy(true);setError("");
    try{
      const next=await invoke<DshSnapshot>("upstream_dsh_policy",{change:{target,contextKey:dshContextKey,revision:snapshot.policy.revision,configurationRevision:snapshot.revision,action,files:skills.flatMap(skill=>skill.dshState?[{file:skill.dshState.file,revision:skill.dshState.documentRevision}]:[])}});
      applyDshSnapshot(next);setDshPolicyPending(null);notifySuccess(dshPolicySaveFeedback(next.policy,zh));
    }catch(reason){setDshPolicyPending(null);setError(String(reason),t("技能设置未保存，请刷新后重试。","Skill settings were not saved. Refresh and retry."));}
    finally{setBusy(false);}
  }
  const [dshPolicyInstallOpen,setDshPolicyInstallOpen]=useState(false);
  useEffect(()=>{
    if(!dshAgentView||busy||inventory?.dsh?.policy?.status!=="pending"||inventory.dsh.policy.pendingReason!=="apply")return;
    let current=true;
    const timer=setTimeout(()=>{void invoke<DshSnapshot>("upstream_dsh_settings",{target,contextKey:dshContextKey}).then(snapshot=>{if(current)applyDshSnapshot(snapshot);}).catch(reason=>{if(current)setError(String(reason),t("请刷新以确认 DSH 生效状态。","Refresh to confirm DSH activation."));});},1000);
    return ()=>{current=false;clearTimeout(timer);};
  },[dshAgentView,busy,inventory?.dsh?.policy?.status,inventory?.dsh?.policy?.pendingReason,inventory?.dsh?.policy?.revision,dshContextKey,target.scope,target.projectPath]);

  async function installDshPolicy(){
    if(busy||!inventory?.dsh)return;setBusy(true);setError("");
    try{const snapshot=await invoke<DshSnapshot>("upstream_dsh_policy_install",{target,contextKey:dshContextKey,revision:inventory.dsh.revision});applyDshSnapshot(snapshot);setDshPolicyInstallOpen(false);notifySuccess(t("插件安装完成，请重启 DSH。","Plugin installed. Restart DSH."));}
    catch(reason){
      try{applyDshSnapshot(await invoke<DshSnapshot>("upstream_dsh_settings",{target,contextKey:dshContextKey}));}catch{await refresh(target,true);}
      setError(String(reason),t("插件未能在所有配置中安装完成，请检查剩余配置后重试。","The plugin was not installed for every configuration. Check the remaining configurations and retry."));
    }
    finally{setBusy(false);}
  }

  async function prepareDshRemoval(skill: InstalledSkill){
    if(busy||!canAgentSkillAction(skill,activeSkillAgent,"dsh-trash")||!skill.dshState)return;setBusy(true);
    try{setDshRemoval(await invoke<DshRemoval>("upstream_dsh_removal_plan",{target,contextKey:dshContextKey,file:skill.dshState.file}));}catch(reason){setError(String(reason),t("无法读取卸载目标，请刷新技能列表。","Could not read the uninstall target. Refresh skills."));}finally{setBusy(false);}
  }
  async function executeDshRemoval(reviewed:DshRemoval){
    setBusy(true);
    try{await invoke("upstream_dsh_trash",{reviewed});setDshRemoval(null);setInventory(current=>current?{...current,skills:current.skills.filter(skill=>skill.dshState?.file!==reviewed.file),dsh:current.dsh?{...current.dsh,skills:current.dsh.skills.filter(skill=>skill.file!==reviewed.file)}:current.dsh}:current);setSelected(current=>current.filter(file=>file!==reviewed.file));if(detail?.dshState?.file===reviewed.file)setDetail(null);notifySuccess(t("卸载完成","Uninstalled"));try{setInventory(await loadInventory(reviewed.target));}catch{setError(t("卸载完成，请刷新列表","Uninstalled. Refresh the list."));}}
    catch(reason){setError(String(reason),t("卸载未完成，请重新确认。","Uninstall did not finish. Review it again."));}finally{setBusy(false);}
  }
  async function preparePiRemoval(skill: InstalledSkill) {
    if (!canAgentSkillAction(skill,activeSkillAgent,"pi-trash") || !skill.piState || busy) return;
    setBusy(true);
    try { setPiRemoval(await invoke<PiRemovalPlan>("upstream_pi_removal_plan",{target,file:skill.piState.file})); }
    catch(reason){setError(String(reason),t("无法读取卸载目标，请刷新技能列表。","Could not read the uninstall target. Refresh skills."));}
    finally{setBusy(false);}
  }
  async function executePiRemoval(reviewed: PiRemovalPlan) {
    setBusy(true);
    try {
      await invoke("upstream_pi_trash",{reviewed});
      setPiRemoval(null);
      setInventory(current=>current?{...current,skills:current.skills.filter(skill=>skill.piState?.file!==reviewed.file)}:current);
      setSelected(current=>current.filter(file=>file!==reviewed.file));
      if(detail?.piState?.file===reviewed.file)setDetail(null);
      notifySuccess(t("已移至废纸篓","Moved to Trash."));
      try {setInventory(await loadInventory(reviewed.target));await reconcilePiState();} catch {setError(t("已移至废纸篓，请刷新列表","Moved to Trash. Refresh the list."));}
    } catch(reason){setPiRemoval(null);setError(String(reason),t("技能未能移至废纸篓，请重新打开卸载确认。","Could not move the skill to Trash. Open uninstall again."));}
    finally{setBusy(false);}
  }
  async function runPiBatch(action: PiBatchAction) {
    const skills = piActionSkills(piBatchSkills,action);
    if (!skills.length || busy) return;
    const invocation = action === "auto" || action === "manual";
    setBusy(true); setPiConfigPending(true); setError("");
    try {
      if (!piSettings) throw new Error(t("请刷新技能列表", "Refresh the skill list."));
      const files=skills.flatMap(skill=>skill.piState?[{file:skill.piState.file,revision:skill.piState.documentRevision}]:[]);
      const snapshot=await invoke<PiSettings>(invocation?"upstream_pi_invocation_batch":"upstream_pi_toggle_batch",{request:invocation
        ? {target,files,dependencies:piSettings.dependencies,mode:action}
        : {target,files:files.map(item=>item.file),dependencies:piSettings.dependencies,enabled:action==="enable"}});
      applyPiState(snapshot);
      notifySuccess(t(`已完成 ${files.length} 项`, `${files.length} completed.`));
    } catch(reason) { await reconcilePiState(); setError(String(reason),invocation?t("调用方式未保存，请重新选择调用方式。","Invocation was not saved. Choose the mode again."):t("启停设置未保存，请重新选择启用或停用。","Enablement was not saved. Choose Enable or Disable again.")); }
    finally { setBusy(false); setPiConfigPending(false); }
  }

  function applyPiState(snapshot: PiSettings) {
    acceptInventoryMutation();
    piPackageCache.invalidate(snapshot.target);
    setPiSettings(snapshot);
    setDetail(current=>{const state=snapshot.skills.find(item=>item.file===current?.piState?.file);return current&&state?{...current,piState:state}:current;});
    if(detail?.piState && documentIdentity.current===JSON.stringify([target,detail.path]) && snapshot.skills.some(item=>item.file===detail.piState?.file && item.documentRevision!==detail.piState?.documentRevision)) {
      const request=++documentRequest.current;
      setDocumentReadState("loading");
      void invoke<SkillDocumentInfo>("upstream_document",{target,path:detail.path,dshContextKey,codexNative:!!detail.codexState&&!detail.cliManaged}).then(value=>{if(documentRequest.current===request){setDocumentLoading(false);setDocumentReadState("ready");setDocumentPluginVersion(value.pluginVersion??null);setDocument(value.content);setDocumentVersion(value.version);setDocumentRevision(value.revision);setDocumentLocalState(value.localState);}}).catch(reason=>{if(documentRequest.current===request){setDocumentLoading(false);setDocumentReadState("error");setError(String(reason),t("技能文件读取失败，请重新打开详情。","Could not read the skill file. Reopen details."));}});
    }
    setInventory(current=>{const next=mergePiSkillStates(current,snapshot.skills);return next?{...next,pi:snapshot}:next;});
  }
  async function reconcilePiState() {
    try { applyPiState(await invoke<PiSettings>("upstream_pi_settings",{target})); }
    catch { setPiSettings(null); }
  }
  async function changePiInvocation(skill: InstalledSkill, manualOnly: boolean, mode?: "default"|"recover") {
    if (!piSettings || !canSetPiInvocation(skill) || !skill.piState || busy) return;
    setBusy(true); setPiConfigPending(true); setError("");
    try {
      applyPiState(await invoke<PiSettings>(skill.piState.managed?"upstream_pi_visibility":"upstream_pi_invocation", {request:{target,file:skill.piState.file,revision:skill.piState.documentRevision,dependencies:piSettings.dependencies,...(skill.piState.managed?{manualOnly:mode==="default"?null:manualOnly}:{mode:mode??(manualOnly?"manual":"auto")})}}));
      notifySuccess(t("已保存", "Saved."));
    } catch(reason) { await reconcilePiState(); setError(String(reason),t("调用方式未保存，请重新选择调用方式。","Invocation was not saved. Choose the mode again.")); }
    finally { setBusy(false); setPiConfigPending(false); }
  }
  async function openPiSkillPackage(skill: InstalledSkill) {
    const state = skill.piState;
    if (!state?.packageSource || busy) return;
    const id = request.current;
    const detailId = documentRequest.current;
    setBusy(true);
    try {
      const snapshot = await piPackageCache.load(target);
      if (id !== request.current || detailId !== documentRequest.current) return;
      const pkg = snapshot.packages.find(item => piPackageSkills(item, [skill]).length > 0);
      if (!pkg) throw new Error(t("未找到所属扩展，请刷新后重试。", "Owning extension not found. Refresh and try again."));
      documentRequest.current++;
      setPiPackageTab(true);
      setPiPackagePage(pkg.id);
      setDetail(null);
      setSelected([]);
      setBulkSelectionMode(false);
    } catch (reason) {
      if (id === request.current && detailId === documentRequest.current) setError(String(reason), t("无法打开所属扩展，请刷新后重试。", "Could not open the owning extension. Refresh and try again."));
    } finally { setBusy(false); }
  }
  async function changePiPackage(skill:InstalledSkill,action:"check"|"update") {
    if(!piSettings || !skill.piState?.canCheckPackage || busy || checkingPackage)return;
    if(action==="update" && piPackageReview?.result.error){void changePiPackage(skill,"check");return;}
    const id = request.current;
    if(action==="check")setCheckingPackage(true);else setBusy(true);
    setError("");
    try {
      const result=await invoke<PiPackageResult>("upstream_pi_package",{request:{target,file:skill.piState.file,revision:piSettings.skills.find(item=>item.file===skill.piState?.file)?.documentRevision ?? skill.piState.documentRevision,dependencies:piSettings.dependencies,action,expected:action==="update"?piPackageReview?.result.affected:null}});
      if(action==="check" && id===request.current) {
        applyPiState(result.snapshot);
        const recordIssue = result.issues?.find(issue => issue.kind === "record");
        if (recordIssue) setError(recordIssue.message,t("调用记录未保存，请检查文件权限后重新检查扩展更新。","Invocation records were not saved. Check file permissions and package updates again."));
        if (result.error) {
          setPiPackageReview(null);setError(result.error,t("扩展包检查失败，请重新检查。","Package check failed. Check again."));
        } else if (result.affected.some(item=>item.status==="available")) {
          setPiPackageReview({skill:{...skill,piState:result.snapshot.skills.find(item=>item.file===skill.piState?.file)??skill.piState},result});
        } else {
          setPiPackageReview(null);
          if (result.affected.length && result.affected.every(item=>item.status==="current")) { if(!recordIssue) notifySuccess(t("已是最新版本", "Up to date")); }
          else {
            const unavailable=result.affected.find(item=>item.status!=="current");
            setError(unavailable?`${unavailable.source}：${piPackageBlocker(unavailable,zh) ?? t("未取得扩展包版本，请重新检查。","Package versions are unavailable. Check again.")}`:t("未取得扩展包版本，请重新检查。","Package versions are unavailable. Check again."));
          }
        }
      }
      else if(action==="update") {applyPiState(result.snapshot);if(result.updated)notifySuccess(t("扩展包已更新", "Package updated."));if(result.error)setPiPackageReview({skill:{...skill,piState:result.snapshot.skills.find(item=>item.file===skill.piState?.file)??skill.piState},result});else {setPiPackageReview(null);if(!result.updated)notifySuccess(t("扩展包已更新", "Package updated."));}}
    }catch(reason){if(action==="update"){await reconcilePiState();setPiPackageReview(current=>current?{...current,result:{...current.result,error:String(reason)}}:current);}else if(id===request.current)setError(String(reason),t("扩展包检查失败，请重新检查。","Package check failed. Check again."));}
    finally{if(action==="check")setCheckingPackage(false);else setBusy(false);}
  }
  async function togglePiSkill(skill: InstalledSkill, enabled: boolean) {
    if (!piSettings || !canAgentSkillAction(skill,activeSkillAgent,"pi-toggle") || !skill.piState || busy) return;
    setBusy(true); setPiConfigPending(true); setError("");
    try { applyPiState(await invoke<PiSettings>("upstream_pi_toggle", { request: { target, file: skill.piState.file, dependencies: piSettings.dependencies, enabled } })); notifySuccess(enabled ? t("已启用", "Enabled.") : t("已停用", "Disabled.")); }
    catch (reason) { await reconcilePiState(); setError(String(reason),t("启停设置未保存，请重新切换技能开关。","Enablement was not saved. Toggle the skill switch again.")); }
    finally { setBusy(false); setPiConfigPending(false); }
  }

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      applyAppearance(preferences, media.matches);
      void syncWindowAppearance(preferences.theme).catch(reason => console.error("Window appearance could not be synchronized", reason));
    };
    apply(); cacheAppearance(preferences);
    media.addEventListener("change", apply);
    window.document.documentElement.lang = preferences.language;
    return () => media.removeEventListener("change", apply);
  }, [preferences.theme, preferences.colorTheme, preferences.fontFamily, preferences.fontSize, preferences.language]);

  async function save(next: Preferences, propagate = false) {
    setSaving(true);
    try { setPreferences(await invoke<Preferences>("upstream_save_preferences", { preferences: next })); }
    catch (reason) { if (propagate) throw reason; setError(String(reason),t("设置未保存，请重新保存。","Settings were not saved. Save again.")); }
    finally { setSaving(false); }
  }
  function addProject() { if (!busy) setProjectEditor({ path: "", name: "", icon: "folder" }); }
  async function saveProject(project: Project) {
    if (!projectEditor) return;
    const oldPath = projectEditor.path;
    const projects = oldPath ? preferences.projects.map(item => item.path === oldPath ? project : item) : [...preferences.projects, project];
    const collapsedSections = preferences.collapsedSections.filter(key => key !== "projects").map(key => key === oldPath ? project.path : key);
    await save({ ...preferences, projects, collapsedSections }, true);
    if (oldPath && target.projectPath === oldPath && oldPath !== project.path) setTarget(chooseScope(project.path));
    setProjectEditor(null); notifySuccess(t("项目已保存", "Project saved"));
  }
  function forgetProject(project: Project) {
    if (target.projectPath === project.path) { setTarget(globalTarget); setSelectedAgent(""); }
    void save({ ...preferences, projects: preferences.projects.filter(item => item.path !== project.path), collapsedSections: preferences.collapsedSections.filter(key => key !== project.path) });
  }
  function startInstall(prefill = "", agents: string[] = [], skills: string[] = []) {
    setResult(null); setWizardError("");
    setWizard({ eveSubagents: ["root"], includeInternal: false, step: 0, source: prefill, inspection: null, skills, agents, target: { ...target }, catalog, copy: preferences.installMode === "copy" });
  }
  function startSkillSync(skill: InstalledSkill) {
    const origin = skill.path;
    const next: Wizard = { syncSkill: skill.name, syncOrigin: { target: { ...target }, path: skill.path, name: skill.name }, eveSubagents: ["root"], includeInternal: true, step: 2, source: origin, inspection: null, skills: [skill.name], agents: [], target: { ...target }, catalog, copy: preferences.installMode === "copy" };
    setResult(null); setDetail(null); setWizard(next);
    void inspectSource(next);
  }
  function startUse(prefill = "", skill = "") { setUseFlow({ source: prefill, skill, target: { ...target } }); }
  function showProjectSkills(scope: Target, agents: string[]) {
    if (page === "agents" && selectedAgent || agents.length === 1) {
      selectScopeAgent(scope, agents.length === 1 ? agents[0] : selectedAgent);
    } else {
      guardPi(() => { setTarget(scope); setCollection("managed"); applyNavigation("installed"); });
    }
  }
  function startDependencies() {
    setDependencyError(""); setResult(null);
    setDependencyFlow({ step:0, discovery:null, options:{copy:true,recursive:false,include:[],exclude:[],cleanup:false,remote:false},includeText:"",excludeText:"", target: { ...target }, agents: page === "agents" && selectedAgent && selectedAgent !== "eve" ? [selectedAgent] : [], plan: null, result: null });
  }
  function closeProjectFlow() {
    ++projectRequest.current; setProjectChecking(false); stopInstallationProgress();
    setDependencyFlow(null); setRestoration(null); setDependencyError(""); setRestoreError("");
    void invoke("upstream_project_preview_release").catch(() => {});
  }
  async function reviewDependencies(discover = false, refresh = false) {
    if (!dependencyFlow || projectChecking) return;
    const token = ++projectRequest.current;
    setProjectChecking(true); setDependencyError("");
    try {
      const plan = await invoke<DependencyPlan>("upstream_dependency_plan", { target: dependencyFlow.target, agents: discover ? [] : dependencyFlow.agents, refresh: discover || refresh, onProgress: startInstallationProgress("checking"), options:{...dependencyFlow.options,include:dependencyFlow.includeText.split(/[,\n]/).map(s=>s.trim()).filter(Boolean),exclude:dependencyFlow.excludeText.split(/[,\n]/).map(s=>s.trim()).filter(Boolean)} });
      if (token !== projectRequest.current) return;
      setDependencyFlow(current => current ? {...current, step: discover ? 1 : 2, discovery: discover ? plan : current.discovery, plan: discover ? null : plan, result:null} : null);
    } catch (reason) { if(token === projectRequest.current)setDependencyError(String(reason),t("项目技能检查失败，请重新检查。","Project skill check failed. Check again.")); }
    finally { if(token === projectRequest.current) {setProjectChecking(false);stopInstallationProgress();} }
  }
  async function installDependencies() {
    if (!dependencyFlow?.plan) return;
    setBusy(true); setDependencyError("");
    try {
      const next = await invoke<DependencyResult>("upstream_dependency_install", { plan: dependencyFlow.plan });
      setDependencyFlow((current) => current ? { ...current, step:3, result: next } : null);
      if (next.items.every(item => item.status === "complete")) notifySuccess(t("依赖技能处理完成", "Dependency skills processed"));
      else notifyError(t("部分操作未完成，请查看结果", "Some operations are incomplete. Review the results."), zh);
      await refresh(dependencyFlow.target);
    } catch (reason) { setDependencyError(String(reason),t("依赖技能安装未完成，请重新检查技能。","Dependency installation did not finish. Inspect skills again.")); setDependencyFlow((current) => current ? { ...current, step:1, plan: null } : null); await refresh(dependencyFlow.target); }
    finally { setBusy(false); }
  }
  function startRestore() {
    setRestoreError(""); setResult(null);
    const scope = {...target};
    setRestoration({ target: scope, records:null, plan: null, result: null });
    void readRestoreRecords(scope);
  }
  async function readRestoreRecords(scope: Target) {
    const token = ++projectRequest.current; setProjectChecking(true); setRestoreError("");
    try {
      const records = await invoke<Array<{skill:string;source:string}>>("upstream_restore_records", {target:scope});
      if(token === projectRequest.current)setRestoration(current=>current?{...current,records}:null);
    } catch(reason) { if(token === projectRequest.current)setRestoreError(String(reason),t("项目安装记录读取失败，请重新检查。","Could not read project installation records. Check again.")); }
    finally {if(token === projectRequest.current)setProjectChecking(false);}
  }
  async function reviewRestore() {
    if (!restoration || projectChecking) return;
    if (!restoration.records) {await readRestoreRecords(restoration.target);return;}
    const token = ++projectRequest.current; setProjectChecking(true); setRestoreError("");
    try {
      const plan = await invoke<RestorePlan>("upstream_restore_plan", { target: restoration.target, onProgress:startInstallationProgress("checking") });
      if(token === projectRequest.current)setRestoration(current => current ? { ...current, plan, result:null } : null);
    } catch (reason) { if(token === projectRequest.current)setRestoreError(String(reason),t("重新安装检查失败，请重新检查。","Reinstall check failed. Check again.")); }
    finally { if(token === projectRequest.current){setProjectChecking(false);stopInstallationProgress();} }
  }
  async function restoreProject() {
    if (!restoration?.plan) return;
    setBusy(true); setRestoreError("");
    try {
      const next = await invoke<RestoreResult>("upstream_restore", { plan: restoration.plan });
      setRestoration((current) => current ? { ...current, result: next } : null);
      if (next.inventory && next.items.every(item => item.status === "complete")) notifySuccess(t("重新安装完成", "Reinstalled"));
      else notifyError(t("部分技能未完成，请查看结果", "Some skills were not restored. Review the results."), zh);
      await refresh(target);
    } catch (reason) { setRestoreError(String(reason),t("重新安装未完成，请重新检查技能。","Skill restoration did not finish. Inspect the restore list again.")); setRestoration((current) => current ? { ...current, plan: null } : null); await refresh(target); }
    finally { setBusy(false); }
  }
  function startCreation() {
    setCreationError(""); setResult(null);
    setCreation({ nativeDsh:dshNativeDirectory,directory:dshNativeDirectory?(dshDirectories.find(root=>root.canCreate===true)?.path??""):target.projectPath ?? "", name: "", mode: "child", plan: null, result: null });
  }
  function editCreation(change: Partial<Pick<Creation, "directory" | "name" | "mode">>) {
    setCreation((current) => current ? { ...current, ...change, plan: null, result: null } : null); setCreationError("");
  }
  async function reviewCreation() {
    if (!creation) return;
    setBusy(true); setCreationError("");
    try {
      const reviewed=creation.nativeDsh?await invoke<DshCreationReview>('upstream_dsh_creation_plan',{target,key:dshContextKey,directory:creation.directory,name:creation.name.trim()}):null;
      const plan = reviewed?.plan??await invoke<CreationPlan>("upstream_creation_plan", { directory: creation.directory, name: creation.mode === "child" ? creation.name.trim() : null });
      if(reviewed)setCreation(current=>current?{...current,dshReview:reviewed}:null);
      setCreation((current) => current ? { ...current, plan, directory: plan.directory } : null);
    } catch (reason) { setCreationError(String(reason),t("创建位置检查失败，请重新检查创建位置。","Could not inspect the creation folder. Inspect it again.")); }
    finally { setBusy(false); }
  }
  async function createSkill() {
    if (!creation?.plan) return;
    setBusy(true); setCreationError("");
    try {
      const created = creation.nativeDsh?await invoke<CreationResult>("upstream_dsh_create",{reviewed:creation.dshReview}):await invoke<CreationResult>("upstream_create", { plan: creation.plan });
      setCreation((current) => current ? { ...current, result: created } : null); if(created.status==="complete")notifySuccess(t("技能已创建", "Skill created"));
      await refresh(target);
    } catch (reason) { setCreationError(String(reason),t("技能创建未完成，请打开下方目录查看文件。","Skill creation did not finish. Open the folder below to inspect the files.")); setCreation((current) => current ? { ...current, plan: null } : null); }
    finally { setBusy(false); }
  }
  async function openCreated(folder: boolean) {
    if (!creation?.result) return;
    setCreationError("");
    try { await invoke("upstream_open_created", { plan: creation.result.plan, folder }); }
    catch (reason) { setCreationError(String(reason),t("无法打开创建的文件，请打开下方目录。","Could not open the created file. Open the folder below.")); }
  }
  async function inspectSource(currentWizard: Wizard | null = wizard) {
    if (!currentWizard) return;
    const id = ++inspectionRequest.current;
    const onProgress = startInstallationProgress("checking");
    if (currentWizard.syncOrigin) setWizard(current => current ? { ...current, syncReview: undefined } : null);
    setBusy(true); setWizardError("");
    try {
      if (currentWizard.syncOrigin) {
        const origin = currentWizard.syncOrigin;
        const review = await invoke<SkillSyncReview>("upstream_skill_sync_review", { origin, target: currentWizard.target, sessionId: currentWizard.inspection?.sessionId, onProgress });
        if (id !== inspectionRequest.current) {
          if (review.inspection.sessionId) void invoke("upstream_inspection_release", { sessionId: review.inspection.sessionId }).catch(() => {});
          return;
        }
        setWizard(current => current ? { ...current, syncReview: review, catalog: review.agents, inspection: inspectInstalledSkill(review.inspection, origin.name), source: review.inspection.source, skills: [origin.name], agents: current.agents.filter(agent => review.blockedAgents[agent] !== "matching" && review.agents.some(item => item.id === agent) && !(review.inspection.provider && agent === "eve")), step: 2 } : null);
        return;
      }
      const inspection = await invoke<Inspection>("upstream_inspect", { source: currentWizard.source, includeInternal: currentWizard.includeInternal, sessionId: currentWizard.inspection?.sessionId, onProgress });
      if (id === inspectionRequest.current && currentWizard.skills.length && !currentWizard.skills.some((name) => inspection.skills.some((skill) => skill.name === name))) setWizardError(t("来源中没有所选技能，请重新选择。", "The source does not contain the selected skill. Choose another skill."));
      if (id !== inspectionRequest.current && inspection.sessionId) void invoke("upstream_inspection_release", { sessionId: inspection.sessionId });
      if (id === inspectionRequest.current) setWizard((current) => current ? { ...current, inspection, agents: inspection.provider ? current.agents.filter((agent) => agent !== "eve") : current.agents, source: inspection.source, skills: inspection.skillFilter ? inspection.skills.map((skill) => skill.name) : current.skills.filter((name) => inspection.skills.some((skill) => skill.name === name)), step: 1 } : null);
    } catch (reason) { if (id === inspectionRequest.current) setWizardError(String(reason),t("来源读取失败，请重新检查来源。","Could not read the source. Inspect the source again.")); }
    finally { stopInstallationProgress(); setBusy(false); }
  }
  async function changeWizardTarget(nextTarget: Target) {
    if (!wizard) return;
    if (wizard.syncOrigin) {
      const id = ++inspectionRequest.current;
      setBusy(true); setWizardError("");
      const next = { ...wizard, target: nextTarget, agents: [], eveSubagents: ["root"] };
      setWizard(next);
      try {
        const checked = await invoke<Omit<SkillSyncReview, "inspection" | "sourceRevision">>("upstream_skill_sync_targets", { origin: wizard.syncOrigin, target: nextTarget, source: wizard.source, sourceRevision: wizard.syncReview?.sourceRevision });
        if (id === inspectionRequest.current) setWizard(current => current?.syncReview ? { ...current, catalog: checked.agents, syncReview: { ...current.syncReview, ...checked } } : current);
      } catch (reason) {
        if (id === inspectionRequest.current) { setWizardError(String(reason),t("目标目录检查失败，请重新检查目标。","Could not inspect target folders. Check the targets again.")); setWizard(current => current ? { ...current, syncReview: undefined } : null); }
      } finally { if (id === inspectionRequest.current) setBusy(false); }
      return;
    }
    setBusy(true); setWizardError("");
    try {
      const [currentHome, next] = await Promise.all([home ? Promise.resolve(home) : homeDir(), loadInventory(nextTarget)]);
      setHome(currentHome);
      setWizard((current) => current ? { ...current, target: nextTarget, catalog: next.agents, eveSubagents: ["root"], agents: current.agents.filter((id) => next.agents.some((agent) => agent.id === id) && !(current.inspection?.skills.some(s=>!!s.downloadUrl) && id === "eve")) } : null);
    } catch (reason) { setWizardError(String(reason),t("目标目录检查失败，请重新检查目标。","Could not inspect target folders. Check the targets again.")); }
    finally { setBusy(false); }
  }
  async function execute(operation: Operation) {
    if(operation.action === "add" && operation.agents.includes("deepseek-harness")) operation={...operation,dshContextKey:operation.dshContextKey??contextFor(operation.target)};
    const onProgress = operation.action === "add" ? startInstallationProgress("checking") : undefined;
    setBusy(true); setError(""); setWizardError(""); setResult(null); setLastOperation(operation);
    try {
      const next = await invoke<OperationResult>("upstream_apply", { operation, onProgress });
      setResult(next); setPending(null); setDetail(null);
      if (next.inventory && next.items.length && next.items.every(item => item.status === "complete")) notifySuccess(operation.action === "remove" ? t("卸载完成", "Uninstalled") : operation.action === "update" ? t("更新完成", "Updated") : t("安装完成", "Installed"));
      else notifyError(t("部分操作未完成，请查看结果", "Some operations are incomplete. Review the results."), zh);
      if (wizard) setWizard((current) => current ? { ...current, step: 4 } : null);
      setUpdates([]); setSelected([]);
      if (operation.target.scope !== target.scope || operation.target.projectPath !== target.projectPath) setTarget(operation.target);
      else await refresh(operation.target);
    } catch (reason) {
      await refresh(target);
      const feedback=operation.action==="add"?t("安装未完成，请重新检查后重试。","Installation did not finish. Check again and retry."):operation.action==="update"?t("更新未完成，请重新检查更新。","Update did not finish. Check for updates again."):t("卸载未完成，请重新确认。","Uninstall did not finish. Review it again.");
      if (wizard) { setWizardError(String(reason),feedback); if (operation.action === "add") setWizard(current => current ? { ...current, step: current.syncSkill ? 2 : 0, inspection: null, syncReview: undefined } : null); } else setError(String(reason),feedback);
    }
    finally { if (onProgress) stopInstallationProgress(); setBusy(false); }
  }
  async function prepare(action: "remove" | "update", skills: string[], agents: string[], nextTarget: Target = target) {
    if (action === "update") {
      skills = availableUpdateSkills(inventory?.skills ?? [], skills, updates);
      if (!skills.length) return;
    }
    if (action === "update" ? !canUpdate(inventory?.skills ?? [], skills) : !canRemove(inventory?.skills ?? [], skills, agents)) { setError(t("存在同名不同安装记录，无法安全按名称操作。请先检查各 Agent 的实际目录。", "Same-name installations are ambiguous. Inspect Agent directories before changing them.")); return; }
    if(action === "update" && filter && skills.every(name=>{
      const records=(inventory?.skills ?? []).filter(skill=>skill.name===name&&skill.agents.includes(filter));
      return records.length>0 && records.every(skill=>skill.sourceType==="local-sync");
    })) agents=[filter];
    const operation: Operation = { target: { ...nextTarget }, action, source: null, skills: [...new Set(skills)], agents, copy: false };
    if (action === "remove") {
      setBusy(true); setError("");
      try {
        operation.removals = await invoke<RemovalPlan[]>("upstream_removal_plan", { operation });
        if (operation.removals.some((plan) => !plan.paths.some((path) => path.selected) || !canRemove(inventory?.skills ?? [], [plan.skill], plan.agents))) throw new Error(t("卸载涉及同名不同目录，无法安全选择目标。请刷新并检查实际目录。", "Removal targets are ambiguous. Refresh and inspect actual directories."));
        setPending(operation); setResult(null);
      } catch (reason) { setError(String(reason),t("操作目标读取失败，请刷新技能列表。","Could not read operation targets. Refresh skills.")); }
      finally { setBusy(false); }
    } else { setPending(operation); setResult(null); }
  }
  async function removeSource(skill: InstalledSkill, nextTarget: Target) {
    setBusy(true);setError("");
    try { const operation=await invoke<Operation>("upstream_source_removal_plan",{target:nextTarget,skill:skill.name});setDetail(null);setPending(operation);setResult(null); }
    catch(reason){setError(String(reason),t("同源技能读取失败，请刷新技能列表。","Could not read skills from the source. Refresh skills."));}finally{setBusy(false);}
  }
  const [documentPluginVersion,setDocumentPluginVersion]=useState<string|null>(null);
  async function openDetail(skill: InstalledSkill) {
    const id = ++documentRequest.current;
    documentIdentity.current=JSON.stringify([target,skill.path]);
    setDocumentLoading(true);setDocumentReadState("loading"); setDocument(""); setDocumentPluginVersion(null); setDocumentVersion(null);setDocumentRevision(null); setDocumentLocalState(null); setSourceDirectory(null); setDetail(skill);
    try { const content = await invoke<SkillDocumentInfo>("upstream_document", { target: activeSkillAgent === "pi" && target.scope === "project" && skill.piState?.scope === "global" && skill.piState.inScope === false ? {host:"local",scope:"global",projectPath:null} : target, path: skill.path, dshContextKey, dshNative:dshNativeBatch, codexNative: !dshNativeBatch&&!!skill.codexState&&!skill.cliManaged }); if (id === documentRequest.current) {setSourceDirectory(content.sourceDirectory);setDocumentPluginVersion(content.pluginVersion??null);setDocumentLoading(false);setDocumentReadState("ready");setDocument(content.content);setDocumentVersion(content.version);setDocumentRevision(content.revision);setDocumentLocalState(content.localState);} }
    catch (reason) { if (id === documentRequest.current) {setDocumentLoading(false);setDocumentReadState("error");setError(String(reason),t("技能详情读取失败，请重新打开详情。","Could not read skill details. Open them again."));} }
  }
  async function checkUpdates() {
    if (checkingUpdates || busy || loading) return;
    const id = request.current;
    setCheckingUpdates(true); setError(""); setUpdates([]);
    try {
      const next = await invoke<UpdateStatus[]>("upstream_check_updates", { target });
      if (id === request.current) { setUpdates(next); notifySuccess(t("更新检查完成", "Update check complete")); }
    }
    catch (reason) { if (id === request.current) setError(String(reason),t("技能更新检查失败，请再次检查更新。","Skill update check failed. Check for updates again.")); }
    finally { setCheckingUpdates(false); }
  }
  function diffKey(skill: InstalledSkill, version: string | null, revision: string | null) {
    return JSON.stringify([target,skill.path,version,revision]);
  }
  async function loadSkillDiff(skill: InstalledSkill, refresh = false): Promise<SkillDiff> {
    const requestId=documentRequest.current;
    let version=documentVersion, revision=documentRevision;
    if (refresh) {
      if(requestId===documentRequest.current)setDocumentReadState("loading");
      let info:SkillDocumentInfo;
      try {info=await invoke<SkillDocumentInfo>("upstream_document",{target,path:skill.path,dshContextKey});}
      catch(reason){if(requestId===documentRequest.current)setDocumentReadState("error");throw reason;}
      if(requestId!==documentRequest.current)throw new Error("Skill changed. Reopen its details before comparing.");
      setDocumentReadState("ready");
      version=info.version;revision=info.revision;
      setDocumentPluginVersion(info.pluginVersion??null);setDocument(info.content);setDocumentVersion(version);setDocumentRevision(revision);setDocumentLocalState(info.localState);
      const prefix=JSON.stringify([target,skill.path]).slice(0,-1);
      for(const previous of diffCache.current.keys())if(previous.startsWith(prefix))diffCache.current.delete(previous);
    }
    const key=diffKey(skill,version,revision);
    const cached=diffCache.current.get(key);
    if(cached)return cached;
    const prefix=JSON.stringify([target,skill.path]).slice(0,-1);
    for(const previous of diffCache.current.keys())if(previous.startsWith(prefix))diffCache.current.delete(previous);
    const pending=invoke<SkillDiff>("upstream_skill_diff",{target,path:skill.path,revision}).catch(reason=>{
      diffCache.current.delete(key);
      if (!refresh && requestId===documentRequest.current && String(reason).includes("Skill changed. Reopen its details before comparing.")) return loadSkillDiff(skill,true);
      throw reason;
    });
    diffCache.current.set(key,pending);return pending;
  }
  async function restoreSkillFile(skill: InstalledSkill,difference: SkillDiff,file: string): Promise<SkillDiff> {
    const id=documentRequest.current;
    const revision=await invoke<string>("upstream_skill_file_restore",{request:{target,path:skill.path,file,revision:difference.revision,version:difference.version}});
    const next={...difference,revision,files:difference.files.filter(item=>item.path!==file)};
    const prefix=JSON.stringify([target,skill.path]).slice(0,-1);
    for(const key of diffCache.current.keys())if(key.startsWith(prefix))diffCache.current.delete(key);
    diffCache.current.set(diffKey(skill,difference.version,revision),Promise.resolve(next));
    if(id===documentRequest.current)setDocumentReadState("loading");
    try {
      const info=await invoke<SkillDocumentInfo>("upstream_document",{target,path:skill.path,dshContextKey});
      if(id===documentRequest.current){setDocumentReadState("ready");setDocumentPluginVersion(info.pluginVersion??null);setDocument(info.content);setDocumentVersion(info.version);setDocumentRevision(info.revision);setDocumentLocalState(info.localState);}
      if(info.localState==="clean"||info.localState==="modified")setUpdates(current=>current.map(item=>item.skill===skill.name?{...item,localState:info.localState==="clean"?"clean":"modified"}:item));
    } catch {if(id===documentRequest.current){setDocumentReadState("error");setError(t("文件已恢复，请重新打开详情。","File restored. Reopen its details."));}}
    return next;
  }
  async function openDirectory(path: string) {
    try { await invoke("upstream_open_directory", { target, path, dshContextKey }); } catch (reason) { setError(String(reason),t("目录无法打开，请检查目录是否存在。","Could not open the folder. Check that it exists.")); }
  }
  const toggle = (values: string[], value: string) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];


  async function retryRemaining() {
    if (!result || !lastOperation || busy) return;
    const skills = retryableSkills(result, lastOperation);
    if (!skills.length) return;
    if (lastOperation.action === "add") {
      setResult(null);
      setWizardError("");
      const next: Wizard = { syncSkill: lastOperation.syncOrigin?.name, syncOrigin: lastOperation.syncOrigin, eveSubagents: lastOperation.eveSubagents?.length ? lastOperation.eveSubagents : ["root"], includeInternal: lastOperation.includeInternal ?? false, step: lastOperation.syncOrigin ? 2 : 0, source: lastOperation.source ?? "", inspection: null, skills, agents: lastOperation.agents, target: lastOperation.target, catalog, copy: lastOperation.copy };
      setWizard(next);
      if (next.syncOrigin) void inspectSource(next);
    } else if (lastOperation.action === "update") {
      setBusy(true);
      try {
        const [current, checked] = await Promise.all([loadInventory(lastOperation.target), invoke<UpdateStatus[]>("upstream_check_updates", { target: lastOperation.target })]);
        const actionable = availableUpdateSkills(current.skills, skills, checked);
        setUpdates(checked);
        if (target.scope === lastOperation.target.scope && target.projectPath === lastOperation.target.projectPath) setInventory(current);
        if (actionable.length) {
          const failedCopies=result.items.filter(item=>item.status!=="complete"&&!!item.destination&&actionable.includes(item.skill));
          const onlyAssociated=actionable.every(name=>failedCopies.some(item=>item.skill===name)||result.items.some(item=>item.skill===name&&item.status==="complete"));
          const associatedAgents=onlyAssociated?[...new Set(failedCopies.length?failedCopies.flatMap(item=>item.agents??[]):current.skills.filter(skill=>actionable.includes(skill.name)&&skill.sourceType==="local-sync").flatMap(skill=>skill.agents))]:lastOperation.agents;
          setResult(null); setPending({ ...lastOperation, skills: actionable, agents:associatedAgents });
        }
      } catch (reason) { setError(String(reason),t("未能读取待重试目标，请刷新技能列表。","Could not read retry targets. Refresh skills.")); }
      finally { setBusy(false); }
    } else if (lastOperation.action === "remove" && lastOperation.removalSource) {
      setBusy(true); setError("");
      try {
        const checked = await recheckSourceRemoval(lastOperation, skills, {
          inventory: loadInventory,
          sourcePlan: (target, skill) => invoke<Operation>("upstream_source_removal_plan", { target, skill }),
        });
        setResult(null);
        if (checked.operation) setPending(checked.operation);
        else {
          if (target.scope === lastOperation.target.scope && target.projectPath === lastOperation.target.projectPath) setInventory(checked.inventory);
          notifySuccess(t("托管安装已卸载，无需重试", "Managed installations are removed; no retry needed"));
        }
      } catch (reason) { setError(String(reason),t("未能读取待重试目标，请刷新技能列表。","Could not read retry targets. Refresh skills.")); }
      finally { setBusy(false); }
    } else void prepare(lastOperation.action, skills, lastOperation.agents, lastOperation.target);
  }

  function resultActions(includeDone = false) {
    if (!result) return null;
    return <>{lastOperation?.action !== "remove" && result.items.some(item => item.status === "complete" && result.inventory?.skills.some(skill=>skill.name===item.skill)) && <Button variant="outline" disabled={busy || loading} onClick={() => { const next = lastOperation?.target ?? target; setWizard(null); setResult(null); navigate("installed"); if (target.scope !== next.scope || target.projectPath !== next.projectPath) setTarget(next); else void refresh(); }}>{t("查看技能", "View skills")}</Button>}{retryableSkills(result, lastOperation).length > 0 && <Button variant="outline" disabled={busy || loading} onClick={() => void retryRemaining()}>{t("重新检查", "Check again")}</Button>}{includeDone && <Button disabled={busy} onClick={() => setResult(null)}>{t("完成", "Done")}</Button>}</>;
  }

  function resultView(withActions = true) {
    return result && <><OperationResults result={result} operation={lastOperation} home={home} zh={zh} busy={busy || loading} onReinstall={name => {
      const origin = result.inventory?.skills.find(skill => skill.name === name && skill.installSource)?.installSource;
      if (!origin || !lastOperation) return;
      setResult(null); setWizardError("");
      setWizard({ eveSubagents: lastOperation.eveSubagents?.length ? lastOperation.eveSubagents : ["root"], includeInternal: lastOperation.includeInternal ?? false, step: 0, source: origin, inspection: null, skills: [name], agents: [], target: lastOperation.target, catalog, copy: preferences.installMode === "copy" });
    }} />{withActions && <ModalActions>{resultActions(true)}</ModalActions>}</>;
  }

  function hermesBatchControls() {
    const locked=busy||!hermesSettings;
    return <>
      <SkillBatchToggleControls count={selectedHermesSkills.length} disabled={locked} canEnable={canChangeHermesSelection("toggle",true)} canDisable={canChangeHermesSelection("toggle",false)} zh={zh} onChange={enabled=>changeHermesSkills(selectedHermesSkills,"toggle",enabled)}/>
      <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="secondary" disabled={locked||!selectedHermesSkills.length}><ListStartIcon data-icon="inline-start" aria-hidden="true"/>{t("加载方式","Loading mode")}</Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-max min-w-0 max-w-[calc(100vw-2rem)]"><DropdownMenuGroup>
        <DropdownMenuItem disabled={!canChangeHermesSelection("preload",false)} onSelect={()=>changeHermesSkills(selectedHermesSkills,"preload",false)}><ClockIcon aria-hidden="true"/>{t("按需加载","Load on demand")}</DropdownMenuItem>
        <DropdownMenuItem disabled={!canChangeHermesSelection("preload",true)} onSelect={()=>changeHermesSkills(selectedHermesSkills,"preload",true)}><ZapIcon aria-hidden="true"/>{t("会话预加载","Session preload")}</DropdownMenuItem>
      </DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
    </>;
  }
  function skillCards() {
    return <div className="skill-grid grid auto-rows-fr gap-4" data-pi-config-pending={piConfigPending}>
      {rows.map((skill) => {
        const displayName = codexNative ? codexSkillDisplayName(skill) : skill.name;
        const selectionKey = activeSkillAgent==="codex" ? skill.path : hermesNative && skill.hermesState ? skill.hermesState.file : piNativeBatch && skill.piState ? skill.piState.file : dshNativeBatch && skill.dshState ? skill.dshState.file : skill.name;
        const selectable = codexNative ? !!skill.codexState?.canToggle : hermesNative ? !!skill.hermesState?.canToggle || !!skill.hermesState?.canPreload : piNativeBatch ? !!skill.piState?.canToggle || canSetPiInvocation(skill) : dshNativeBatch ? !!skill.dshState : canSelectManagedSkill(skill);
        const update = updatesBySkill.get(skill.name);
        const updateable = !dshNativeBatch&&canUpdate(inventory?.skills ?? [], [skill.name]);
        const sourceLabel = dshNativeBatch&&skill.dshState?dshSourceLabel(skill.dshState,zh):skillSourceLabel(skill,zh);
        const skillAgents = detectedSkillAgents(skill, catalog);
        const agents = [...skillAgents].sort((a, b) => Number(isVisible(b)) - Number(isVisible(a)));
        const duplicateNotice = ambiguous.has(skill.name) ? sameNameNotice(dshNativeBatch?nativeSourceSkills:inventory?.skills??[], skill.name, zh, activeSkillAgent) : null;
        const cardAgentState = skillAgentState(skill,activeSkillAgent);
        const cardHermesState = cardAgentState.hermes;
        const dshNotice = cardAgentState.dsh ? dshSkillNotice(cardAgentState.dsh,zh) : null;
        const notes = [
          duplicateNotice,
          cardAgentState.codex?.enabled===null?codexSkillToggleHint(cardAgentState.codex,codex.snapshot?.plugins??[],zh):null,
          dshNotice,
          cardHermesState && hermesCardNotice(cardHermesState) ? hermesReason(cardHermesState,zh) : null,
          update?.localState === "modified" ? t("本地已修改", "Locally modified") : null,
          update?.status === "unknown" && skill.updateable ? t("未能检查", "Check unavailable") : null,
          update?.status === "removed" && updateable ? t("来源已移除", "Removed upstream") : null,
          skill.eveLocations?.length ? `Eve · ${skill.eveLocations.map(slot => slot === "root" ? t("根 Agent", "Root Agent") : slot).join(", ")}` : null,
        ].filter((note): note is string => !!note);
        return <InventoryCard onOpen={bulkSelectionMode ? undefined : () => void openDetail(skill)} key={`${skill.name}:${skill.path}`} role={bulkSelectionMode ? "checkbox" : "article"} aria-label={bulkSelectionMode ? `${t("选择", "Select")} ${skill.name}` : undefined} aria-checked={bulkSelectionMode ? selected.includes(selectionKey) : undefined} aria-disabled={bulkSelectionMode ? busy || !selectable : undefined} tabIndex={bulkSelectionMode && !busy && selectable ? 0 : undefined} data-skill-card variant="inventory" className={cn("group min-w-0 cursor-pointer text-left", !bulkSelectionMode && "active:ring-ring")}
          onClick={() => {
            if (bulkSelectionMode) { if (!busy && selectable) setSelected(previous => toggle(previous, selectionKey)); return; }
          }}
          onKeyDown={bulkSelectionMode ? event => { if (event.target !== event.currentTarget || event.key !== " " && event.key !== "Enter") return; event.preventDefault(); if (!event.repeat && !busy && selectable) setSelected(previous => toggle(previous, selectionKey)); } : undefined}>
          <InventoryCardHeader inert={bulkSelectionMode} selection={bulkSelectionMode && <Checkbox className="size-3.5 shrink-0" aria-label={`${t("选择", "Select")} ${displayName}`} disabled={busy || !selectable} checked={selected.includes(selectionKey)} />} heading={<button type="button" className="flex w-full min-w-0 cursor-pointer items-center gap-2 text-left" aria-label={`${t("查看技能", "View skill")} ${displayName}`} onClick={() => void openDetail(skill)}>{codexNative && <CodexSkillIcon src={skill.codexState?.icon} fallback={<PackageIcon className="size-4 shrink-0" aria-hidden="true"/>}/>}<OverflowText className="block min-w-0 truncate" text={displayName} /></button>} information={notes.length > 0 && <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-xs" className="shrink-0 text-primary hover:text-primary" aria-label={`${t("查看技能信息", "View skill information")} ${displayName}`} onClick={() => void openDetail(skill)}><InfoIcon aria-hidden="true" /></Button></TooltipTrigger><TooltipContent tone="surface" className="whitespace-pre-line">{[...new Set(notes)].join("\n")}</TooltipContent></Tooltip>} control={<>{cardAgentState.dsh&&<DshPolicySwitch state={cardAgentState.dsh} name={displayName} project={target.scope==='project'} disabled={busy} zh={zh} onChange={action=>void changeDshPolicy([skill],action)}/>} {activeSkillAgent === "hermes-agent" && cardHermesState && <Tooltip><TooltipTrigger asChild><span className="flex shrink-0 items-center" tabIndex={!cardHermesState.canToggle?0:undefined}><Switch checked={cardHermesState.enabled} disabled={busy||!hermesSettings||!cardHermesState.canToggle} aria-label={`${cardHermesState.enabled?t("已启用","Enabled"):t("已停用","Disabled")} ${displayName}`} onCheckedChange={enabled=>changeHermes(skill,"toggle",enabled)}/></span></TooltipTrigger><TooltipContent>{cardHermesState.canToggle?(cardHermesState.enabled?t("已启用","Enabled"):t("已停用","Disabled")):hermesReason(cardHermesState,zh)}</TooltipContent></Tooltip>}
            {cardAgentState.codex && cardAgentState.codex.enabled !== null && <Hint stable text={codexSkillToggleHint(cardAgentState.codex,codex.snapshot?.plugins??[],zh)} disabled={busy||!codex.snapshot||!!codex.snapshot.unavailableReason||!cardAgentState.codex.canToggle}><Switch checked={cardAgentState.codex.enabled===true} disabled={busy||!codex.snapshot||!!codex.snapshot.unavailableReason||!cardAgentState.codex.canToggle} aria-label={`${t("启用技能","Enable skill")} ${displayName}`} onCheckedChange={enabled=>codex.toggle([skill],enabled)}/></Hint>}
            {activeSkillAgent === "pi" && skill.piState && <Tooltip><TooltipTrigger asChild><span className="flex shrink-0 items-center" tabIndex={!skill.piState.canToggle?0:undefined}><Switch checked={skill.piState.enabled} disabled={busy || !piSettings || !skill.piState.canToggle} aria-label={`${skill.piState.enabled ? t("已启用", "Enabled") : t("已停用", "Disabled")} ${displayName}`} onCheckedChange={enabled => void togglePiSkill(skill, enabled)} /></span></TooltipTrigger><TooltipContent>{piStateReason(skill.piState, zh)}</TooltipContent></Tooltip>}</>} description={<button type="button" className="block w-full min-w-0 cursor-pointer whitespace-normal text-left" onClick={() => void openDetail(skill)} aria-label={`${t("查看技能", "View skill")} ${displayName}`}><OverflowText className="min-h-10 line-clamp-2 leading-5" text={skill.description || t("暂无描述", "No description")} /></button>} />
          <InventoryCardFooter inert={bulkSelectionMode} metadata={<span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">{dshNativeBatch?<FolderOpenIcon aria-hidden="true" className="size-3.5 shrink-0"/>:<SourceIcon skill={skill} />}<span className="truncate">{sourceLabel}</span></span>}>
              {update?.status === "available" && updateable && <Hint stable text={t("可更新", "Update available")} disabled={busy}><Button size="icon-sm" variant="ghost" disabled={busy} aria-label={`${t("更新", "Update")} ${displayName}`} onClick={() => void prepare("update", [skill.name], [])}><CircleArrowUpIcon aria-hidden="true" className="text-skill-update" /></Button></Hint>}
              {activeSkillAgent === "hermes-agent" && cardHermesState && <Tooltip><TooltipTrigger asChild><span className="inline-flex" tabIndex={!cardHermesState.canPreload?0:undefined}><Button variant="ghost" size="icon-sm" data-preserve-appearance={cardHermesState.canPreload} disabled={busy||!hermesSettings||!cardHermesState.canPreload} aria-pressed={cardHermesState.autoLoad} aria-label={`${cardHermesState.autoLoad?t("会话预加载","Session preload"):t("按需加载","Load on demand")} ${displayName}`} onClick={()=>changeHermes(skill,"preload",!cardHermesState.autoLoad)}>{cardHermesState.autoLoad?<ZapIcon aria-hidden="true"/>:<ClockIcon aria-hidden="true"/>}</Button></span></TooltipTrigger><TooltipContent tone="surface">{cardHermesState.canPreload?(cardHermesState.autoLoad?t("会话预加载","Session preload"):t("按需加载","Load on demand")):hermesReason(cardHermesState,zh)}</TooltipContent></Tooltip>}
              {activeSkillAgent === "pi" && skill.piState && (collection === "agent" || skill.piState.cliAddressable) && <PiInvocationToggle state={skill.piState} disabled={busy || !piSettings} readOnly={!canSetPiInvocation(skill)} zh={zh} onChange={manualOnly=>void changePiInvocation(skill,manualOnly)} />}
              {cardAgentState.codex&&<SkillInvocationStatus automatic={cardAgentState.codex.allowImplicitInvocation} zh={zh}/>}
              {cardAgentState.dsh&&<DshPolicyChannels state={cardAgentState.dsh} name={displayName} project={target.scope==='project'} disabled={busy} zh={zh} onChange={action=>void changeDshPolicy([skill],action)}/>}
              {page !== "agents" && <div className="flex shrink-0 [&>*+*]:-ml-1.5">{agents.slice(0, 4).map((agent) => <Hint stable text={agent.name} disabled={busy} key={agent.id}><button type="button" aria-label={t(`查看 ${agent.name} 的技能`, `View ${agent.name} skills`)} disabled={busy} className="flex size-6 items-center justify-center rounded-full bg-card hover:z-10 focus-visible:z-10" onClick={() => selectAgent(agent.id)}><AgentLogo name={agent.id} size={20} /></button></Hint>)}{agents.length > 4 && <Hint stable text={agents.slice(4).map((agent) => agent.name).join(", ")} focusable><span className="z-10 flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium">+{agents.length - 4}</span></Hint>}</div>}
              <Tooltip><TooltipTrigger asChild>{collection === "managed" ? <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" data-preserve-appearance={canRemove(inventory?.skills ?? [], [skill.name], removalTargetAgents(skill, filter))} disabled={busy || !canRemove(inventory?.skills ?? [], [skill.name], removalTargetAgents(skill, filter))} aria-label={`${t("卸载", "Uninstall")} ${displayName}`} onClick={() => prepare("remove", [skill.name], removalTargetAgents(skill, filter))}><Trash2Icon aria-hidden="true" /></Button> : <Button type="button" variant="ghost" size="icon-sm" data-preserve-appearance={true} disabled={busy} aria-label={`${t("打开目录", "Open folder")} ${displayName}`} onClick={()=>void openDirectory(skill.path)}><FolderOpenIcon aria-hidden="true" /></Button>}</TooltipTrigger><TooltipContent>{collection === "managed"?t("卸载","Uninstall"):t("打开目录","Open folder")}</TooltipContent></Tooltip>
              {collection === "agent" && canAgentSkillAction(skill,activeSkillAgent,"dsh-trash") && <Hint stable text={t("卸载","Uninstall")} disabled={busy}><Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" data-preserve-appearance={true} disabled={busy} aria-label={`${t("卸载","Uninstall")} ${displayName}`} onClick={()=>void prepareDshRemoval(skill)}><Trash2Icon aria-hidden="true"/></Button></Hint>}
              {collection === "agent" && canAgentSkillAction(skill,activeSkillAgent,"pi-trash") && <Hint stable text={t("卸载", "Uninstall")} disabled={busy}><Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" data-preserve-appearance={true} disabled={busy} aria-label={`${t("卸载", "Uninstall")} ${displayName}`} onClick={()=>void preparePiRemoval(skill)}><Trash2Icon aria-hidden="true" /></Button></Hint>}
</InventoryCardFooter>
        </InventoryCard>;
      })}
    </div>;
  }

  const pendingSourceSkill = pending?.action === "remove" && !pending.removalSource && pending.skills.length === 1 && pending.target.scope === target.scope && pending.target.projectPath === target.projectPath
    ? inventory?.skills.find(skill => skill.name === pending.skills[0] && skill.cliManaged && !!skill.source)
    : undefined;
  const syncReady = !wizard?.syncSkill || wizard.syncReview?.state === "matching" && !wizard.syncReview.sharedConflict;
  const syncUnavailable = wizard?.syncReview ? Object.fromEntries(Object.entries(wizard.syncReview.blockedAgents).filter(([,state])=>state==="matching").map(([id, state]) => [id, { installed: state === "matching", reason: state === "matching" ? t("已有此技能", "Already has this skill") : state === "different" ? t("同名技能内容不同", "Different skill content") : t("需检查已有目录", "Review existing folder") }])) : undefined;
  const wizardWorkspace = wizard !== null && (!wizard.syncSkill || !!wizard.syncReview && syncReady) && (wizard.step === 2 || wizard.step === 1 && (wizard.inspection?.skills.length ?? 0) > 6);
  const wizardCopyOnly = wizard !== null && wizard.agents.length > 0 && (wizard.agents.every((id) => id === "eve") || !wizard.syncOrigin && new Set(wizard.catalog.filter((agent) => wizard.agents.includes(agent.id)).map((agent) => agent.path)).size <= 1);
  const macWindow = /Macintosh|Mac OS X/.test(navigator.userAgent);
  const windowFullscreen = useWindowFullscreen();
  return <><a className="skip-link" href="#main-content">{t("跳到主要内容", "Skip to content")}</a><SidebarProvider data-platform={macWindow ? "macos" : "other"} data-window-fullscreen={windowFullscreen} className="app-shell bg-sidebar" style={{ "--sidebar-width": "16rem" } as CSSProperties}>
    <Sidebar collapsible="icon" variant="sidebar" className="app-navigation">
      <SidebarHeader className="app-brand px-3.5 pb-4 pt-4"><div className="flex min-w-0 items-center gap-2.5 group-data-[collapsible=icon]:justify-center"><img width={28} height={28} className="size-7 shrink-0 rounded-md object-cover" src={appIcon} alt="" /><p className="min-w-0 flex-1 truncate text-base font-medium tracking-tight group-data-[collapsible=icon]:hidden">Skills Space</p></div></SidebarHeader>
      <SidebarContent className="gap-2 px-1.5 group-data-[collapsible=icon]:px-0">
        <SidebarGroup><SidebarMenu>{(["discover", "installed"] as const).map(item => <SidebarMenuItem key={item}><SidebarMenuButton disabled={busy} isActive={page === item && !detail} onClick={() => navigate(item)} tooltip={labels[item]}>{item === "discover" ? <ShoppingBagIcon className="text-primary" aria-hidden="true"/> : <LayoutDashboardIcon className="text-primary" aria-hidden="true"/>}<span className="group-data-[collapsible=icon]:hidden">{labels[item]}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroup>
        <ScopeSidebar home={home} error={error} onRefresh={scope => guardPi(()=>{invalidateInventory();setTarget({ ...scope });})} preferences={preferences} target={target} inventory={inventory} selected={selectedAgent} active={page === "agents" && !detail} disabled={busy || saving || !!wizard || !!pending || !!creation || !!restoration || !!dependencyFlow} zh={zh} onSelect={selectScopeAgent} onSave={change => save({ ...preferences, ...change })} onAdd={addProject} onEdit={setProjectEditor} onForget={forgetProject} onOpen={path => void openDirectory(path)} />
      </SidebarContent>
      <SidebarFooter className="px-2 py-3">
        <div className="grid grid-cols-3 items-center gap-1 group-data-[collapsible=icon]:grid-cols-1 group-data-[collapsible=icon]:justify-items-center">
          <SidebarFooterHint text={labels.settings} disabled={busy}><Button size="sm" variant="ghost" className={cn(sidebarFooterButtonClassName, page === "settings" && "bg-sidebar-accent text-sidebar-accent-foreground")} disabled={busy} aria-label={labels.settings} aria-current={page === "settings" ? "page" : undefined} onClick={() => navigate("settings")}><Settings2Icon aria-hidden="true" /><span>{labels.settings}</span></Button></SidebarFooterHint>
          <SidebarQuickSettings preferences={preferences} disabled={saving || busy} onChange={change => void save({ ...preferences, ...change })} />
        </div>
      </SidebarFooter>
    </Sidebar>
    {macWindow && <WindowSidebarToolbar zh={zh} fullscreen={windowFullscreen} />}
    <SidebarInset className="desktop-content relative">{!macWindow && <Hint text={t("展开或收起侧栏","Toggle sidebar")}><SidebarTrigger className="absolute left-2 top-0 lg:top-1" aria-label={t("展开或收起侧栏","Toggle sidebar")} /></Hint>}<main id="main-content" tabIndex={-1} className="app-content w-full min-w-0"><div className="app-page mx-auto w-full min-w-0">

      {detail ? <SkillDetail>
        <SkillDetailHeader title={activeSkillAgent==="codex" && isNativeSkillForAgent(detail,"codex") ? codexSkillDisplayName(detail) : detail.name} description={detail.description} backDisabled={busy && !!detailAgentState?.dsh} backLabel={codexPluginPage||activeSkillAgent==="pi"&&piPackagePage?t("返回插件页面","Back to plugin"):t("返回技能列表", "Back to skills")} onBack={() => { documentRequest.current++;documentIdentity.current=null; setDetail(null); }} actions={<>{canAgentSkillAction(detail,activeSkillAgent,"dsh-trash")&&<Hint text={t("卸载","Uninstall")} disabled={busy}><Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" disabled={busy} aria-label={`${t("卸载","Uninstall")} ${detail.name}`} onClick={()=>void prepareDshRemoval(detail)}><Trash2Icon aria-hidden="true"/></Button></Hint>}{canAgentSkillAction(detail,activeSkillAgent,"pi-trash") && <Hint text={t("卸载", "Uninstall")} disabled={busy}><Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" disabled={busy} aria-label={`${t("卸载", "Uninstall")} ${detail.name}`} onClick={()=>void preparePiRemoval(detail)}><Trash2Icon aria-hidden="true" /></Button></Hint>}<ActionMenu fitContent label={t("更多技能操作", "More skill actions")} disabled={busy} groups={[[...(detailAgentState?.codex?.pluginId ? [{label:t("管理所属插件","Manage owning plugin"),run:()=>openCodexPlugin(detailAgentState.codex!.pluginId!),icon:<PackageIcon aria-hidden="true"/>}] : []),...(showSkillAuthoringActions ? [{label:t("技能测试", "Test skill"),run:() => startUse(detail.path,detail.name),icon:<TerminalIcon aria-hidden="true" />}] : [])],...(detail.piState && activeSkillAgent==="pi"?[[
        ...(isNativeSkillForAgent(detail,"pi") && detail.piState.packageSource?[{label:t("扩展管理","Manage extension"),icon:<PackageIcon aria-hidden="true"/>,run:()=>void openPiSkillPackage(detail)}]:[]),
        {label:t("恢复默认","Restore source invocation default"),icon:<RefreshCwIcon aria-hidden="true"/>,disabled:!canSetPiInvocation(detail)||!detail.piState?.canRestoreDefault,run:()=>void changePiInvocation(detail,false,"default")},
        ...(detail.piState.canRecoverInvocation?[{label:t("重试配置恢复","Retry configuration recovery"),icon:<RefreshCwIcon aria-hidden="true"/>,disabled:!canSetPiInvocation(detail)||!detail.piState?.canRecoverInvocation,run:()=>void changePiInvocation(detail,false,"recover")}]:[])
      ]]:[]),...[]]} /><Hint text={!detail.path ? t("缺少安装来源", "Installation source missing") : t("同步安装到其他智能体", "Sync installation to other agents")} disabled={busy || !detail.path}><Button disabled={busy || !detail.path} onClick={() => startSkillSync(detail)}><PackagePlusIcon aria-hidden="true" />{t("同步技能", "Sync skill")}</Button></Hint></>} />
        <SkillDetailMetadata>
          {detailAgentState?.codex && isNativeSkillForAgent(detail,"codex") ? <>
            {detailAgentState.codex.pluginId && <div className="flex min-w-0 items-center gap-3"><dt className="shrink-0 text-muted-foreground"><GitCommitHorizontalIcon className="size-4" aria-hidden="true"/><span className="sr-only">{t("插件版本","Plugin version")}</span></dt><dd className="flex min-w-0 items-center gap-2"><span className="text-muted-foreground">{t("插件版本","Plugin version")}</span><Hint text={documentReadState==="ready"?documentPluginVersion??undefined:undefined} focusable><span className="font-mono text-xs"><VersionValue value={documentPluginVersion} state={documentReadState} zh={zh}/></span></Hint></dd></div>}
            <div className="flex min-w-0 items-center gap-3"><dt className="shrink-0 text-muted-foreground"><GitCommitHorizontalIcon className="size-4" aria-hidden="true"/><span className="sr-only">{t("内容指纹","Content fingerprint")}</span></dt><dd className="flex min-w-0 items-center gap-2"><span className="text-muted-foreground">{t("内容指纹","Content fingerprint")}</span><Hint text={documentReadState==="ready"&&documentRevision?`SHA-256 · ${documentRevision}`:undefined} focusable><span className="font-mono text-xs"><VersionValue value={documentRevision} state={documentReadState} zh={zh} emptyLabel={t("无法计算","Unavailable")}/></span></Hint></dd></div>
          </> : <div className="flex min-w-0 items-center gap-3"><dt className="shrink-0 text-muted-foreground"><GitCommitHorizontalIcon className="size-4" aria-hidden="true"/><span className="sr-only">{t("版本", "Version")}</span></dt><dd className="flex min-w-0 items-center gap-2"><span className="text-muted-foreground" aria-hidden="true">{t("版本", "Version")}</span><Hint text={documentReadState==="ready"?documentVersion??undefined:undefined} focusable><span className="font-mono text-xs"><VersionValue value={documentVersion} state={documentReadState} zh={zh}/></span></Hint></dd></div>}
          <div className="flex min-w-0 items-start gap-3"><dt className="mt-0.5 shrink-0 text-muted-foreground"><FolderOpenIcon className="size-4" aria-hidden="true" /><span className="sr-only">{t("技能位置", "Skill location")}</span></dt><dd className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">{detailPaths.length > 1 ? detailPaths.map(item => <div key={item.path} className="col-span-2 grid min-w-0 grid-cols-subgrid items-start">
            <Badge variant="secondary">{item.state === "piActive" ? t("Pi · 当前生效", "Pi · Active") : item.state === "piShadowed" ? t("Pi · 被覆盖", "Pi · Overridden") : item.state === "piDisabled" ? t("Pi · 已停用", "Pi · Disabled") : item.state === "piUnknown" ? "Pi" : t("安装目录", "Installation folder")}</Badge>
            <Hint text={`${t("打开目录", "Open folder")} ${displayPath(item.path)}`}><button type="button" className="interactive-path min-w-0 break-all text-left font-mono text-xs" onClick={() => void openDirectory(item.path)} aria-current={item.path === detail.path ? "location" : undefined}>{displayPath(item.path===detail.path?(detailDeclaredPath??item.path):item.path)}</button></Hint>
          </div>) : <Hint text={t("打开目录", "Open folder")}><button className="interactive-path col-span-2 break-all text-left font-mono text-xs" onClick={() => void openDirectory(detailDeclaredPath??detail.path)}>{displayPath(detailDeclaredPath??detail.path)}</button></Hint>}</dd></div>
          {detailConfiguredDirectory && <div className="flex min-w-0 items-start gap-3"><dt className="mt-0.5 shrink-0 text-muted-foreground"><FolderPlusIcon className="size-4" aria-hidden="true"/><span className="sr-only">{t("附加技能目录","Additional skill directories")}</span></dt><dd className="min-w-0"><Hint text={t("打开目录","Open folder")}><button type="button" className="interactive-path break-all text-left font-mono text-xs" onClick={()=>void openDirectory(detailConfiguredDirectory)}>{displayPath(detailConfiguredDirectory)}</button></Hint></dd></div>}
          <div className="flex min-w-0 items-start gap-3"><dt className="mt-0.5 shrink-0 text-muted-foreground">{dshNativeBatch?<FolderOpenIcon aria-hidden="true" className="size-4"/>:<SourceIcon skill={detail} />}<span className="sr-only">{t("安装来源", "Installation source")}</span></dt><dd className="min-w-0 break-all">{sourceDirectory ? <Hint text={t("打开来源目录", "Open source folder")}><button className="interactive-path text-left font-mono text-xs" onClick={() => void openDirectory(sourceDirectory)}>{displayPath(sourceDirectory)}</button></Hint> : skillSourceUrl(detail) ? <a className="underline-offset-4 hover:underline" href={skillSourceUrl(detail)!} onClick={event => { event.preventDefault(); void openUrl(skillSourceUrl(detail)!).catch(reason => setError(String(reason),t("链接无法打开，请检查系统浏览器设置。","Could not open the link. Check your default browser."))); }}>{displayPath(detail.sourceUrl ?? detail.installSource ?? detail.source ?? "")}</a> : displayPath(detail.sourceUrl ?? detail.installSource ?? detail.source ?? (dshNativeBatch&&detail.dshState?dshSourceLabel(detail.dshState,zh):detail.piState?.packageSource??skillSourceLabel(detail,zh)))}</dd></div>
        </SkillDetailMetadata>
        {detailHermesState && hermesCardNotice(detailHermesState) && <Alert><InfoIcon aria-hidden="true"/><AlertDescription>{hermesReason(detailHermesState,zh)}</AlertDescription></Alert>}
        <Suspense fallback={<div className="flex min-w-0 flex-col gap-3" role="status" aria-label={t("读取中…", "Loading…")}><Skeleton className="h-8 w-40 motion-reduce:animate-none" /><Skeleton className="h-32 w-full motion-reduce:animate-none" /></div>}><SkillDocument key={detail.path} loading={documentLoading} content={document} zh={zh} showDiff={!dshNativeBatch && !!detail.cliManaged && (documentLocalState ?? updatesBySkill.get(detail.name)?.localState ?? detail.piState?.lifecycle?.local) === "modified"} onDiff={refresh => loadSkillDiff(detail,refresh)} onRestore={(difference,file) => restoreSkillFile(detail,difference,file)} onOpenExternal={url => void openUrl(url).catch(reason => setError(String(reason),t("链接无法打开，请检查系统浏览器设置。","Could not open the link. Check your default browser.")))} /></Suspense>
      </SkillDetail> : codexMarkets&&activeSkillAgent==="codex" ? <CodexMarketplaces target={target} home={home} zh={zh} disabled={busy||saving} onBusy={setBusy} onSaved={()=>{if(codexAdding)void codex.loadDirectory();else void codex.load(true);}} onBack={()=>setCodexMarkets(false)}/> : codexPluginPage&&activeSkillAgent==="codex" ? <CodexPluginPage checkingUpdates={codex.checkingUpdates} onOpenDirectory={path=>void openDirectory(path)} check={codex.checks[codexPluginPage.id]} key={codexPluginPage.id} plugin={codex.snapshot?.plugins.find(plugin=>plugin.id===codexPluginPage.id)??(codexDirectoryDetail?.id===codexPluginPage.id?codexDirectoryDetail:codex.directory?.publicSections.flatMap(section=>section.plugins).find(plugin=>plugin.id===codexPluginPage.id))} snapshot={codexAdding?codex.directory?.snapshot??codex.snapshot:codex.snapshot} home={home} zh={zh} disabled={busy||saving} onBack={()=>{setCodexPluginPage(null);if(codexReturnDetail){void openDetail(codexReturnDetail);setCodexReturnDetail(null);}}} onAction={codex.plugin} onCheck={plugin=>{if(codex.checks[plugin.id]?.canUpdate)codex.reviewPluginUpdate(plugin);else void codex.checkPlugin(plugin);}} onSkill={skill=>void openDetail(skill)} onToggle={(skill,enabled)=>codex.toggle([skill],enabled)}/> : codexAdding&&activeSkillAgent==="codex" ? <CodexPluginDirectory canManageMarkets={target.scope==="global"} view={codexDirectoryView} onView={setCodexDirectoryView} directory={codex.directory} loading={codex.directoryLoading} disabled={busy||saving} zh={zh} query={codexAddQuery} onQuery={setCodexAddQuery} readCategory={codex.readCategory} onBack={()=>setCodexAdding(false)} onRefresh={()=>void codex.loadDirectory()} onMarkets={()=>setCodexMarkets(true)} onAuthorize={codex.authorizeDirectory} onOpen={plugin=>{void codex.prepareDirectoryPlugin(plugin).then(value=>{if(value){setCodexDirectoryDetail(value);setCodexPluginPage({id:value.id});}});}} onInstall={plugin=>codex.plugin(plugin,'install')} onAction={codex.plugin}/> : <>
      {page !== "settings" && page !== "discover" && !(activeSkillAgent==="pi"&&piPackagePage) && <header className="page-heading mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">{activeSkillAgent==="codex"&&codexPluginTab&&codexReturnDetail&&<BackButton label={t("返回技能详情","Back to skill")} disabled={busy} onClick={()=>{setDetail(codexReturnDetail);setCodexReturnDetail(null);setCodexPluginTab(false);}}/>}{page === "agents" && currentAgent && <div className="flex size-10 shrink-0 items-center justify-center"><AgentLogo name={currentAgent.id} size={30} /></div>}<div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><h1 className="truncate text-2xl font-medium tracking-tight">{page === "agents" ? currentAgent?.name ?? t("选择 Agent", "Select an Agent") : labels[page]}</h1>{activeSkillAgent==="pi" && <PiChangeNotice zh={zh}/>}</div>{page === "agents" && <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground"><span className="inline-flex min-w-0 max-w-full items-center gap-1.5">{target.scope === "project" && <ProjectIcon name={scopeProject?.icon ?? "folder"} className="size-4 shrink-0" />}<span className="truncate">{scopeLabel}</span></span>{agentUnconfirmed && currentAgent && <> · <AgentStatusBadge agent={currentAgent} zh={zh} /></>}{page === "agents" && currentAgent && dshNativeDirectory && <>{target.scope==='project'&&inventory?.dsh?.projectRoot&&inventory.dsh.projectRoot!==target.projectPath&&<Hint text={t('DSH 从父级 Git 仓库根目录发现项目技能。','DSH discovers project skills from the parent Git repository root.')} focusable><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><InfoIcon className="size-3.5" aria-hidden="true"/>{t('使用父级 Git 根目录','Using the parent Git root')}</span></Hint>}{!loading&&dshDirectories.map(root=><Hint key={root.path} text={displayPath(root.path)} disabled={busy || loading || !root.exists}><button type="button" className="interactive-path inline-flex min-w-0 max-w-full items-center gap-1.5 text-left font-mono text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || loading || !root.exists} aria-label={`${t("打开目录", "Open folder")} ${displayPath(root.path)}`} onClick={()=>void openDirectory(root.path)}><FolderOpenIcon className="size-4 shrink-0" aria-hidden="true"/><span className="truncate">{displayPath(root.path)}</span></button></Hint>)}</>}{confirmedPluginDirectory&&<DirectoryLink path={confirmedPluginDirectory.directory} home={home} zh={zh} disabled={busy} onOpen={path=>void openDirectory(path)}/>}{page === "agents" && currentAgent && !dshNativeDirectory && !(activeSkillAgent==="codex"&&codexPluginTab) && !(activeSkillAgent==="pi"&&piPackageTab) && <Hint text={displayPath(currentSkillDirectory ?? "")} disabled={busy || !currentSkillDirectory || currentSkillDirectory === currentAgent.path && !currentAgent.directoryExists}><button type="button" className="interactive-path inline-flex min-w-0 max-w-full items-center gap-1.5 text-left font-mono text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !currentSkillDirectory || currentSkillDirectory === currentAgent.path && !currentAgent.directoryExists} aria-label={`${t("打开目录", "Open folder")} ${displayPath(currentSkillDirectory ?? "")}`} onClick={() => { if (currentSkillDirectory) void openDirectory(currentSkillDirectory); }}><FolderOpenIcon className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{displayPath(currentSkillDirectory ?? "")}</span></button></Hint>}{collection === "agent" && !piPackageTab && piAdditionalDirectories.map(path=><Hint key={path} text={displayPath(path)} disabled={busy}><button type="button" className="interactive-path inline-flex min-w-0 max-w-full items-center gap-1.5 text-left font-mono text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} aria-label={`${t("附加技能目录","Additional skill directories")} ${displayPath(path)}`} onClick={()=>void openDirectory(path)}><FolderPlusIcon className="size-4 shrink-0" aria-hidden="true"/><span className="truncate">{displayPath(path)}</span></button></Hint>)}</p>}</div></div>
      </header>}
      {page === "discover" && <SkillStore zh={zh} initialPageSize={preferences.storePageSize ?? 12} onPageSize={storePageSize => save({...preferencesRef.current, storePageSize}, true)} disabled={busy || saving || !inventory} session={marketplaceSession} onInstall={startInstall} />}
      {(page === "installed" || page === "agents") && <section className="inventory-content flex flex-col gap-6"><Tabs value={activeSkillAgent==="pi"&&piPackageTab?"pi-packages":activeSkillAgent==="codex"&&codexPluginTab?"plugins":collection} className="gap-5" onValueChange={value=>{setPiPackageTab(value==="pi-packages");setCodexPluginTab(value==="plugins");setCodexReturnDetail(null);if(value==="managed"||value==="agent")setCollection(value);setSelected([]);setBulkSelectionMode(false);}}>
        {!(activeSkillAgent==="pi"&&piPackagePage)&&<TabsList variant="quiet" className="page-tabs inventory-tabs" aria-label={t("技能分类", "Skill collections")}><TabsTrigger value="managed"><PackageIcon aria-hidden="true" />{t("托管技能", "Managed skills")}<span className="text-xs tabular-nums text-muted-foreground">{collectionCounts.managed}</span></TabsTrigger><TabsTrigger value="agent"><FolderOpenIcon aria-hidden="true" />{t("原生技能", "Native skills")}<span className="text-xs tabular-nums text-muted-foreground">{collectionCounts.agent}</span></TabsTrigger>{activeSkillAgent==="codex"&&<TabsTrigger value="plugins"><PackageIcon aria-hidden="true"/>{t("插件管理","Plugins")}<span className="text-xs tabular-nums text-muted-foreground">{codex.loading ? <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" aria-label={t("读取插件数量","Loading plugin count")}/> : codex.snapshot?.catalogRequested && codex.snapshot.pluginsComplete && !codex.snapshot.unavailableReason ? installedCodexPluginCount(codex.snapshot.plugins) : null}</span></TabsTrigger>}{activeSkillAgent==="pi"&&<TabsTrigger value="pi-packages"><PackageIcon aria-hidden="true"/>{t("插件管理","Plugins")}<span className="text-xs tabular-nums text-muted-foreground">{piPackageSummary.loading?<LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" aria-label={t("读取扩展包数量","Loading package count")}/>:piPackageSummary.count}</span></TabsTrigger>}</TabsList>}
        {activeSkillAgent==="codex"&&<TabsContent value="plugins"><CodexManagement checkingUpdates={codex.checkingUpdates} onCheckAll={()=>void codex.checkPlugins()} onUpdate={codex.reviewPluginUpdate} project={target.scope==="project"} onMarkets={()=>setCodexMarkets(true)} onAdd={()=>setCodexAdding(true)} source={codexPluginSource} setSource={setCodexPluginSource} status={codexPluginStatus} setStatus={setCodexPluginStatus} onOpen={plugin=>{setCodexReturnDetail(null);setCodexPluginPage({id:plugin.id});}} checks={codex.checks} zh={zh} snapshot={codex.snapshot} loading={codex.loading||loading} disabled={busy||saving} query={codexPluginQuery} onQuery={setCodexPluginQuery} onRefresh={()=>void codex.load(true)} onAction={codex.plugin} onBatch={codex.pluginBatch} /></TabsContent>}
        {activeSkillAgent==="pi"&&<TabsContent forceMount value="pi-packages" className="data-[state=inactive]:hidden"><PiExtensions onOpenDirectory={path=>void openDirectory(path)} filterSession={filterSession} key={`${target.scope}:${target.projectPath??""}`} cache={piPackageCache} states={piSettings?.skills??[]} skills={inventory?.skills??[]} onSkill={skill=>void openDetail(skill)} selected={piPackagePage} onSelect={setPiPackagePage} active={piPackageTab} onSummary={setPiPackageSummary} target={target} home={home} zh={zh} disabled={busy||saving} onBusy={setBusy} onChanged={()=>void refresh()} onSettings={()=>guardPi(()=>{setSettingsCodex(false);setSettingsDsh(false);setSettingsHermes(false);setSettingsSection("agents");setSettingsPi(true);applyNavigation("settings");})}/></TabsContent>}
        <TabsContent value={collection} className="flex flex-col gap-4">
        <InventoryToolbar>
          <div className="toolbar-filters flex shrink-0 items-center gap-2"><div className="toolbar-search relative w-56 shrink-0"><SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input autoComplete="off" spellCheck={false} type="search" className="pl-9" aria-label={t("搜索已安装技能", "Search installed skills")} placeholder={t("搜索…", "Search…")} value={query} onChange={event => setQuery(event.target.value)} /></div>{page === "installed" && <Choice className="filter-trigger [&_[data-slot=select-value]]:min-w-0" label={t("按 Agent 筛选", "Filter Agent")} value={agentFilter || "all"} options={[{value:"all",label:t("所有智能体", "All Agents"),agentId:"all"},...shownAgents.map(agent => ({value:agent.id,label:agent.name,agentId:agent.id}))]} onChange={value => { setAgentFilter(value === "all" ? "" : value); setSelected([]); }} />}{collection==="managed"&&<><Choice className="filter-trigger" label={t("筛选托管技能来源","Filter managed skill source")} value={managedSource} options={managedSourceOptions} onChange={value=>{setManagedSource(value);setSelected([]);}}/><Choice className="filter-trigger" label={t("筛选托管技能状态","Filter managed skill state")} value={managedStatus} options={[{value:"all",label:t("全部状态","All states")},{value:"enabled",label:t("已启用","Enabled")},{value:"disabled",label:t("已停用","Disabled")}]} onChange={value=>{setManagedStatus(value);setSelected([]);}}/></>}{codexNative&&<Choice className="filter-trigger" label={t("筛选技能状态","Filter skill state")} value={codexStatus} onChange={value=>{setCodexStatus(value);setSelected([]);}} options={[{value:"all",label:t("全部状态","All states")},{value:"enabled",label:t("已启用","Enabled")},{value:"disabled",label:t("已停用","Disabled")}]} />}{codexNative&&<CodexSkillSourceChoice skills={nativeSourceSkills} plugins={codex.snapshot?.plugins??[]} zh={zh} disabled={busy||saving} value={codexSource} onChange={value=>{setCodexSource(value);setSelected([]);}}/>}{piNativeBatch && <><Choice className="filter-trigger" label={t("筛选原生技能", "Filter native skills")} value={piStatusFilter} onChange={setPiStatusFilter} options={[{value:"all",label:t("全部状态","All states")},{value:"enabled",label:t("已启用","Enabled")},{value:"disabled",label:t("已停用","Disabled")},{value:"auto",label:t("自动选择","Automatic selection")},{value:"manual",label:t("手动调用","Manual invocation")}]} /><PiSkillSourceChoice packages={piPackageSummary.packages??[]} skills={nativeSourceSkills} home={home} zh={zh} disabled={busy||saving} value={piPackageFilter} onChange={value=>{setPiPackageFilter(value);setSelected([]);}} /></>}{hermesNative&&<><Choice className="filter-trigger" label={t("筛选技能状态","Filter skill state")} value={hermesStatusFilter} onChange={setHermesStatusFilter} options={[{value:"all",label:t("全部状态","All states")},{value:"enabled",label:t("已启用","Enabled")},{value:"disabled",label:t("已停用","Disabled")},{value:"preload",label:t("会话预加载","Session preload")},{value:"ondemand",label:t("按需加载","Load on demand")}]} /><Choice className="filter-trigger" label={t("筛选原生来源","Filter native origin")} value={hermesOriginFilter} onChange={setHermesOriginFilter} options={[{value:"all",label:t("全部来源","All origins")},{value:"builtin",label:t("内置","Bundled")},{value:"hub",label:"Hermes Hub"},{value:"local",label:t("本地目录","Local folders")},{value:"created",label:t("创建目录","Creation directory")},{value:"external",label:t("附加目录","Extra directories")},{value:"project",label:t("项目目录","Project directories")}]} /></>}{dshNativeDirectory&&inventory?.dsh&&<DshNativeContextChoice snapshot={inventory.dsh} home={home} zh={zh} disabled={busy||(saving&&!dshContextWrites.current)} configuration={dshFileFilter} preset={dshPresetFilter} onChange={(configuration,preset)=>{patchDshNativeFilters({source:configuration,status:preset});setSelected([]);setDetail(null);}}/>}<Hint text={t("刷新", "Refresh")} disabled={busy || loading}><Button variant="ghost" className="toolbar-secondary-action" data-toolbar-priority="3" aria-label={t("刷新", "Refresh")} aria-busy={loading} disabled={busy || loading} onClick={() => {if(activeSkillAgent === "pi")piPackageCache.invalidate(target);void refresh();}}><RefreshCwIcon aria-hidden="true" className={loading ? "animate-spin motion-reduce:animate-none" : undefined} /><span className="toolbar-secondary-label">{t("刷新", "Refresh")}</span></Button></Hint></div>
          <div className="toolbar-actions ml-auto flex shrink-0 items-center gap-2">{collection === "managed"&&<><Hint text={t("检查更新", "Check updates")} disabled={busy || checkingUpdates || loading || !inventory}><Button variant="ghost" className="toolbar-secondary-action" data-toolbar-priority="2" aria-label={t("检查更新", "Check updates")} aria-busy={checkingUpdates} disabled={busy || checkingUpdates || loading || !inventory} onClick={() => void checkUpdates()}>{checkingUpdates ? <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <SearchCheckIcon aria-hidden="true" />}<span className="toolbar-secondary-label">{t("检查更新", "Check updates")}</span></Button></Hint><Hint text={bulkSelectionMode ? t("取消选择", "Cancel selection") : t("批量选择", "Select multiple")} disabled={busy || loading || !rows.length}><Button className="toolbar-secondary-action" data-toolbar-priority="1" variant={bulkSelectionMode ? "secondary" : "ghost"} disabled={busy || loading || !rows.length} aria-label={bulkSelectionMode ? t("取消选择", "Cancel selection") : t("批量选择", "Select multiple")} aria-pressed={bulkSelectionMode} onClick={() => { setBulkSelectionMode(!bulkSelectionMode); setSelected([]); }}>{bulkSelectionMode ? <XIcon aria-hidden="true" /> : <ListChecksIcon aria-hidden="true" />}<span className="toolbar-secondary-label inline-grid" aria-hidden="true"><span className={cn("col-start-1 row-start-1", bulkSelectionMode && "invisible")}>{t("批量选择", "Select multiple")}</span><span className={cn("col-start-1 row-start-1", !bulkSelectionMode && "invisible")}>{t("取消选择", "Cancel selection")}</span></span></Button></Hint></>}{nativeFileBatch && <Hint text={bulkSelectionMode ? t("取消选择", "Cancel selection") : t("批量选择", "Select multiple")} disabled={busy || loading || !rows.length}><Button className="toolbar-secondary-action" data-toolbar-priority="1" variant={bulkSelectionMode ? "secondary" : "ghost"} disabled={busy || loading || !rows.length} aria-pressed={bulkSelectionMode} aria-label={bulkSelectionMode ? t("取消选择", "Cancel selection") : t("批量选择", "Select multiple")} onClick={()=>{setBulkSelectionMode(!bulkSelectionMode);setSelected([]);}}>{bulkSelectionMode ? <XIcon aria-hidden="true" /> : <ListChecksIcon aria-hidden="true" />}<span className="toolbar-secondary-label">{bulkSelectionMode ? t("取消选择", "Cancel selection") : t("批量选择", "Select multiple")}</span></Button></Hint>}<ActionMenu fitContent={page === "installed" || collection === "managed" && target.scope === "project"} label={t("更多技能操作", "More skill actions")} disabled={busy || loading} groups={[

            showSkillAuthoringActions ? [{label:t("技能测试", "Test skill"),run:() => startUse(),disabled:!inventory,icon:<TerminalIcon aria-hidden="true" />}] : [],
            [...(showSkillAuthoringActions && collection === "managed" && page === "installed" ? [{label:t("创建技能", "Create skill"),run:startCreation,icon:<FilePlusIcon aria-hidden="true" />}] : []),...(collection === "managed" && target.scope === "project" ? [{label:t("项目导入", "Project import"),run:startDependencies,icon:<PackagePlusIcon aria-hidden="true" />},{label:t("重新安装", "Reinstall"),run:startRestore,icon:<RotateCcwIcon aria-hidden="true" />}] : [])],
          ]} />{collection === "managed" && <Hint text={t("添加技能", "Add skill")} disabled={busy || loading || !inventory || page === "agents" && !currentAgent}><Button disabled={busy || loading || !inventory || page === "agents" && !currentAgent} aria-label={t("添加技能", "Add skill")} onClick={() => startInstall("", page === "agents" && selectedAgent ? [selectedAgent] : [])}><PackagePlusIcon data-icon="inline-start" aria-hidden="true" /><span>{t("添加技能", "Add skill")}</span></Button></Hint>}</div>
        </InventoryToolbar>
        {collection === "managed" && bulkSelectionMode && <BulkSelectionBar framed count={selected.length} disabled={busy} zh={zh} onSelectAll={()=>setSelected(selectVisible(selected,rows.filter(canSelectManagedSkill).map(skill=>activeSkillAgent==="codex"?skill.path:skill.name)))} onInvert={()=>setSelected(selectVisible(selected,rows.filter(canSelectManagedSkill).map(skill=>activeSkillAgent==="codex"?skill.path:skill.name),true))}><Button size="sm" variant="secondary" disabled={busy || !selected.length || !availableUpdateSkills(inventory?.skills ?? [], selectedManagedNames, updates).length} onClick={() => prepare("update", selectedManagedNames, [])}>{t("更新", "Update")}</Button><Button size="sm" variant="destructive" disabled={busy || !canRemove(inventory?.skills ?? [], selectedManagedNames, filter ? [filter] : [...new Set((inventory?.skills ?? []).filter((skill) => selectedManagedNames.includes(skill.name)).flatMap((skill) => removalTargetAgents(skill, filter)))])} onClick={() => prepare("remove", selectedManagedNames, filter ? [filter] : [...new Set((inventory?.skills ?? []).filter((skill) => selectedManagedNames.includes(skill.name)).flatMap((skill) => removalTargetAgents(skill, filter)))])}>{t("卸载", "Uninstall")}</Button>{activeSkillAgent === "pi" && <PiBatchControls count={piBatchSkills.length} disabled={busy || !piSettings} canEnable={piBatchAvailable.enable} canDisable={piBatchAvailable.disable} canAuto={piBatchAvailable.auto} canManual={piBatchAvailable.manual} zh={zh} onAction={action=>void runPiBatch(action)} />}{activeSkillAgent==="hermes-agent" && hermesBatchControls()}{activeSkillAgent==="codex"&&codexBatchControls()}{activeSkillAgent==='deepseek-harness'&&<DshBatchControls skills={managedDshSkills} target={target} contextKey={dshContextKey} revision={inventory?.dsh?.revision??''} policyRevision={inventory?.dsh?.policy?.revision??''} home={home} disabled={busy} zh={zh} onBusy={setBusy} onSnapshot={applyDshSnapshot} onChanged={()=>void refresh(target,true)} allowRemoval={false}/>}</BulkSelectionBar>}
        {codexNative&&bulkSelectionMode&&<BulkSelectionBar framed count={selectedCodexSkills.length} disabled={busy} zh={zh} onSelectAll={()=>setSelected(selectVisible(selected,rows.filter(s=>s.codexState?.canToggle).map(s=>s.path)))} onInvert={()=>setSelected(selectVisible(selected,rows.filter(s=>s.codexState?.canToggle).map(s=>s.path),true))}>{codexBatchControls()}</BulkSelectionBar>}
        {dshAgentView&&<DshPolicyNotice home={home} policy={inventory?.dsh?.policy} disabled={busy} zh={zh} onInstall={()=>setDshPolicyInstallOpen(true)} onOpenDirectory={path=>void openDirectory(path)} onRefresh={()=>void refresh(target,true)}/>}
        {dshNativeBatch && bulkSelectionMode && <DshBatchActions skills={selectedDshSkills} target={target} contextKey={dshContextKey} revision={inventory?.dsh?.revision??''} policyRevision={inventory?.dsh?.policy?.revision??''} home={home} disabled={busy} zh={zh} onBusy={setBusy} onSnapshot={applyDshSnapshot} onChanged={removed=>{setSelected(current=>current.filter(file=>!removed.includes(file)));void refresh(target,true);}} onSelectAll={()=>setSelected(selectVisible(selected,rows.flatMap(skill=>skill.dshState?[skill.dshState.file]:[])))} onInvert={()=>setSelected(selectVisible(selected,rows.flatMap(skill=>skill.dshState?[skill.dshState.file]:[]),true))}/>}

        {hermesNative && bulkSelectionMode && <BulkSelectionBar framed count={selectedHermesSkills.length} disabled={busy} zh={zh} onSelectAll={()=>setSelected(selectVisible(selected,rows.filter(skill=>skill.hermesState?.canToggle||skill.hermesState?.canPreload).flatMap(skill=>skill.hermesState?[skill.hermesState.file]:[])))} onInvert={()=>setSelected(selectVisible(selected,rows.filter(skill=>skill.hermesState?.canToggle||skill.hermesState?.canPreload).flatMap(skill=>skill.hermesState?[skill.hermesState.file]:[]),true))}>
          {hermesBatchControls()}
        </BulkSelectionBar>}
        {piNativeBatch && bulkSelectionMode && <PiBatchActions count={selectedPiSkills.length} disabled={busy} canEnable={piBatchAvailable.enable} canDisable={piBatchAvailable.disable} canAuto={piBatchAvailable.auto} canManual={piBatchAvailable.manual} zh={zh} onAction={action=>void runPiBatch(action)} onSelectAll={()=>setSelected(selectVisible(selected,rows.filter(skill=>skill.piState?.canToggle || canSetPiInvocation(skill)).flatMap(skill=>skill.piState?[skill.piState.file]:[])))} onInvert={()=>setSelected(selectVisible(selected,rows.filter(skill=>skill.piState?.canToggle || canSetPiInvocation(skill)).flatMap(skill=>skill.piState?[skill.piState.file]:[]),true))} />}
        {loading && <LoadingCards variant="inventory" className="skill-grid" label={t("正在读取安装状态…", "Reading installed state…")} />}
        {!loading && !rows.length && dshUseEmpty && inventory?.dsh && <DshNativeEmpty snapshot={inventory.dsh} zh={zh} disabled={busy||saving} unreadable={dshUnreadablePreset} onOpenConfiguration={path=>void invoke("upstream_dsh_open_configuration",{target,configurationPath:path}).catch(reason=>setError(String(reason),t("配置文件无法打开","Could not open the configuration file")))} onRefresh={()=>void refresh()}/>}
        {!loading && !rows.length && !dshUseEmpty && <InventoryEmpty
          kind={!inventory?"failed":dshNativeDirectory&&(dshFileFilter!=="all"||dshPresetFilter!=="all")?"filtered":!inventory ? "failed" : agentUnconfirmed ? "uninstalled" : deferredQuery.trim() || page === "installed" && agentFilter || (collection==="managed"&&(managedSource!=="all"||managedStatus!=="all")) || (codexNative && (codexSource!=="all"||codexStatus!=="all") || piNativeBatch && (piStatusFilter !== "all" || piPackageFilter !== "all") || hermesNative && (hermesStatusFilter!=="all"||hermesOriginFilter!=="all")) ? "filtered" : collection === "agent" ? "native" : "managed"}
          zh={zh} disabled={busy}
          onRetry={() => void refresh()}
          onClear={() => { setQuery("");if(dshNativeDirectory)patchDshNativeFilters({source:"all",status:"all"});if(collection==="managed"){setManagedSource("all");setManagedStatus("all");}else if(activeSkillAgent==="codex"){setCodexSource("all");setCodexStatus("all");}else if(activeSkillAgent==="pi"){setPiStatusFilter("all");setPiPackageFilter("all");}else if(activeSkillAgent==="hermes-agent"){setHermesStatusFilter("all");setHermesOriginFilter("all");}if(page==="installed"){setAgentFilter("");filterSession.patch(filterContext(target,"skills","installed","",collection),{query:"",source:"all",status:"all"});}setSelected([]); }}
          onAdd={() => startInstall("", page === "agents" && selectedAgent ? [selectedAgent] : [])}
        />}
        {rows.length > 0 && (!dshNativeDirectory||!loading) && skillCards()}

      </TabsContent></Tabs></section>}
      {page === "settings" && <section className="settings-page mx-auto flex w-full max-w-4xl flex-col" aria-label={labels.settings}>
        <header className="page-heading mb-6"><h1 className="text-2xl font-medium tracking-tight">{labels.settings}</h1></header>
        <Tabs activationMode="manual" value={settingsSection} className="gap-6" onValueChange={section => { if (section === "global" || section === "agents" || section === "appearance") guardPi(()=>setSettingsSection(section)); }}><TabsList variant="quiet" className="page-tabs settings-tabs" aria-label={labels.settings}>{[{id:"global",label:t("全局设置", "General"),icon:Settings2Icon},{id:"agents",label:t("智能体", "Agents"),icon:LayoutDashboardIcon},{id:"appearance",label:t("外观主题", "Appearance"),icon:PaletteIcon}].map(({id,label,icon:Icon}) => <TabsTrigger key={id} value={id}><Icon aria-hidden="true" />{label}</TabsTrigger>)}</TabsList><TabsContent value={settingsSection} className="w-full">

        {settingsSection === "global" && <GeneralSettings preferences={preferences} disabled={saving || busy} home={home} onChange={change => void save({ ...preferences, ...change })} />}
        {settingsSection === "appearance" && <AppearanceSettings preferences={preferences} disabled={saving || busy} onChange={change => void save({ ...preferences, ...change })} />}
        {settingsSection === "agents" && <><div hidden={settingsCodex || settingsPi || settingsDsh || settingsHermes}><AgentManagement status={settingsFilters.status} onStatus={setSettingsAgentStatus} agents={catalog} order={preferences.agentOrder} counts={skillCountByAgent} zh={zh} home={home} disabled={saving || busy} loading={loading} query={settingsAgentQuery} onQuery={setSettingsAgentQuery} onRefresh={() => void refresh()} isVisible={isVisible} onVisible={setVisible} onOrder={agentOrder => save({...preferences, agentOrder})} onOpen={id => {if(id === "codex")setSettingsCodex(true);else if(id === "pi")setSettingsPi(true); else if(id === "deepseek-harness"){setSettingsDsh(true);}else if(id === "hermes-agent")setSettingsHermes(true);}} /></div> {settingsCodex && <CodexSettings ref={codexEditor} zh={zh} home={home} disabled={saving || busy} onBack={() => setSettingsCodex(false)} onBusy={setBusy} onSaved={() => void refresh()} />} {settingsPi && <PiManagement ref={piEditor} zh={zh} home={home} projects={preferences.projects} initialTarget={target} disabled={saving || busy} onBack={() => setSettingsPi(false)} onBusy={setBusy} onSaved={() => {piPackageCache.invalidate();void refresh();}} />}{settingsHermes&&<HermesManagement ref={hermesEditor} home={home} projects={preferences.projects} initialTarget={target} zh={zh} disabled={saving||busy} onBusy={setBusy} onSaved={()=>void refresh()} onBack={()=>setSettingsHermes(false)}/>}{settingsDsh && <DshManagement ref={dshEditor} home={home} projects={preferences.projects} initialTarget={target} zh={zh} disabled={busy} onBusy={setBusy} onSaved={()=>void refresh()} contexts={dshContexts} onContext={(_scope,key,path)=>setDshContext(target,key,'settings',path)} onBack={() => setSettingsDsh(false)} />}</>}
      </TabsContent></Tabs></section>}
      </>}
    </div></main></SidebarInset>
    {projectEditor && <ProjectEditor project={projectEditor} projects={preferences.projects} home={home} zh={zh} busy={saving} onSave={saveProject} onClose={() => setProjectEditor(null)} />}
    <Modal title={t("安装 DSH 配套插件？","Install the DSH companion plugin?")} open={dshPolicyInstallOpen} busy={busy} onClose={()=>setDshPolicyInstallOpen(false)}>
        <p className="text-sm">{t("通过原版 DSH CLI 安装或更新配套插件，并更新下面的配置文件。同一技能文件的启停和调用设置统一共用。完成后请重启 DSH，再刷新技能列表。","Install through the original DSH CLI and connect policy in the eligible configurations’ user overlays. Connected configurations share file-level policy; skill files remain unchanged. Restart DSH after installation, then refresh the skill list.")}</p>
        <div className="flex flex-col gap-1">{inventory?.dsh?.policy?.configurations?.filter(item=>item.canInstall&&["not-installed","needs-setup"].includes(item.status)).map(item=><p key={item.path} className="break-all font-mono text-xs text-muted-foreground">{displayPath(item.path)}</p>)}</div>
        <ModalActions><Button variant="outline" disabled={busy} onClick={()=>setDshPolicyInstallOpen(false)}>{t("取消","Cancel")}</Button><Button disabled={busy} onClick={()=>void installDshPolicy()}>{busy?t("安装中…","Installing…"):t("安装并启用","Install and enable")}</Button></ModalActions>
      </Modal>
    <Modal bodyStep={dependencyFlow?.step} busy={busy || useBusy} title={t("项目导入", "Project import")} description={t("查找项目依赖中提供的技能，选择智能体后安装。", "Find skills provided by project dependencies, then choose Agents to install them.")} open={!!dependencyFlow} onClose={closeProjectFlow}>{dependencyFlow && <div className="flex min-w-0 flex-col gap-5 text-sm">
      <StepIndicator steps={zh ? ["检查技能", "选择智能体", "确认", "结果"] : ["Skills", "Agents", "Review", "Result"]} current={dependencyFlow.step} />
      <p className="break-all font-mono text-xs text-muted-foreground">{displayPath(dependencyFlow.target.projectPath ?? "")}</p>
      {dependencyFlow.step === 0 && <>
        <ProjectImportOptions options={dependencyFlow.options} include={dependencyFlow.includeText} exclude={dependencyFlow.excludeText} disabled={projectChecking} zh={zh} onChange={value=>setDependencyFlow(current=>current?{...current,options:value.options,includeText:value.include,excludeText:value.exclude,discovery:null,plan:null,result:null}:null)} />
        <ModalActions><Button disabled={projectChecking} onClick={()=>void reviewDependencies(true)}>{projectChecking?t("检查中…","Checking…"):t("检查技能","Inspect skills")}</Button></ModalActions>
      </>}
      {dependencyFlow.step === 1 && <>
        <ProjectSkillList items={(dependencyFlow.discovery?.items??[]).map(item=>({skill:item.skill,source:item.package}))} zh={zh} title={t("发现技能","Skills found")} />
        {!!dependencyFlow.discovery?.removals.length && <p className="text-xs text-destructive">{t(`将清理 ${dependencyFlow.discovery.removals.length} 个失效技能，确认前可查看清单。`,`${dependencyFlow.discovery.removals.length} stale skills will be removed. Review the list before confirming.`)}</p>}
        {!!(dependencyFlow.discovery?.items.length || dependencyFlow.discovery?.removals.length) && <>
          <InstallModeField compact mode={dependencyFlow.options.copy?"copy":"symlink"} zh={zh} disabled={projectChecking} onChange={mode=>setDependencyFlow(current=>current?{...current,options:{...current.options,copy:mode==="copy"},plan:null}:null)} />
          <AgentPicker label={t("选择智能体","Choose Agents")} home={home} agents={catalog.filter(agent=>agent.id!=="eve")} selected={dependencyFlow.agents} disabled={projectChecking} zh={zh} onChange={agents=>setDependencyFlow(current=>current?{...current,agents,plan:null}:null)} />
        </>}
        <ModalActions><Button variant="outline" disabled={projectChecking} onClick={()=>setDependencyFlow(current=>current?{...current,step:0,plan:null}:null)}>{t("上一步","Back")}</Button><Button disabled={projectChecking || !dependencyFlow.agents.length || !dependencyFlow.discovery?.items.length && !dependencyFlow.discovery?.removals.length} onClick={()=>void reviewDependencies()}>{projectChecking?t("检查中…","Checking…"):t("下一步","Next")}</Button></ModalActions>
      </>}
      {dependencyFlow.step === 2 && dependencyFlow.plan && <>
        <DependencyReview plan={dependencyFlow.plan} agents={catalog} home={home} zh={zh} />
        <ModalActions><Button variant="outline" disabled={busy||projectChecking} onClick={()=>setDependencyFlow(current=>current?{...current,step:1}:null)}>{t("上一步","Back")}</Button><Button variant="outline" disabled={busy||projectChecking} onClick={()=>void reviewDependencies(false,true)}>{t("重新检查","Check again")}</Button><Button disabled={busy||projectChecking || !dependencyFlow.plan.items.length && !dependencyFlow.plan.removals.length} onClick={()=>void installDependencies()}>{busy?t("安装中…","Installing…"):t("确认安装","Confirm install")}</Button></ModalActions>
      </>}
      {dependencyFlow.result && <>
        <ProjectSkillResults result={dependencyFlow.result} kind="dependency" agents={catalog} home={home} zh={zh} />
        <ModalActions><Button variant="outline" disabled={busy} onClick={()=>setDependencyFlow(current=>current?{...current,step:0,plan:null,result:null}:null)}>{t("返回设置","Back to settings")}</Button>{dependencyFlow.result.items.some(item=>item.status==="complete"&&item.action!=="remove") && <Button variant="outline" disabled={busy} onClick={()=>{showProjectSkills(dependencyFlow.target,dependencyFlow.agents);closeProjectFlow();}}>{t("查看技能","View skills")}</Button>}<Button disabled={busy} onClick={closeProjectFlow}>{t("完成","Done")}</Button></ModalActions>
      </>}
    </div>}</Modal>
    <Modal bodyStep={restoration?.result ? "result" : restoration?.plan ? "review" : "records"} busy={busy || useBusy} title={t("重新安装", "Reinstall")} description={t("按项目保存的技能来源重新安装，内容以来源当前版本为准。", "Reinstall from the project's recorded skill sources using their current versions.")} open={!!restoration} onClose={closeProjectFlow}>{restoration && <div className="flex min-w-0 flex-col gap-5 text-sm">
      <p className="break-all font-mono text-xs text-muted-foreground">{displayPath(restoration.target.projectPath ?? "")}</p>
      {restoration.result ? <>
        <ProjectSkillResults result={restoration.result} kind="restore" agents={catalog} home={home} zh={zh} />
        <ModalActions>{restoration.result.items.some(item=>item.status!=="complete") && <Button variant="outline" disabled={busy||projectChecking} onClick={()=>void reviewRestore()}>{projectChecking?t("检查中…","Checking…"):t("重新检查","Check again")}</Button>}{restoration.result.items.some(item=>item.status==="complete") && <Button variant="outline" disabled={busy} onClick={()=>{showProjectSkills(restoration.target,restoration.plan?.agents??[]);closeProjectFlow();}}>{t("查看技能","View skills")}</Button>}<Button disabled={busy} onClick={closeProjectFlow}>{t("完成","Done")}</Button></ModalActions>
      </> : restoration.plan ? <>
        <RestoreReview plan={restoration.plan} agents={catalog} home={home} zh={zh} />
        <ModalActions><Button variant="outline" disabled={busy||projectChecking} onClick={()=>void reviewRestore()}>{projectChecking?t("检查中…","Checking…"):t("重新检查","Check again")}</Button><Button disabled={busy||projectChecking||!restoration.plan.items.length||restoration.plan.items.some(item=>item.issue)} onClick={()=>void restoreProject()}>{busy?t("安装中…","Installing…"):t("确认安装","Confirm install")}</Button></ModalActions>
      </> : <>
        {restoration.records ? <ProjectSkillList emptyRecords items={restoration.records.map(item=>({...item,source:displayPath(item.source)}))} zh={zh} title={t("已记录技能","Recorded skills")} /> : projectChecking ? <div className="flex flex-col gap-3" role="status" aria-label={t("读取中…","Loading…")}><Skeleton className="h-5 w-40"/><Skeleton className="h-12 w-full"/></div> : null}
        <ModalActions><Button disabled={projectChecking || restoration.records?.length === 0} onClick={()=>void reviewRestore()}>{projectChecking?t("检查中…","Checking…"):restoration.records?t("检查技能","Inspect skills"):t("重新检查","Check again")}</Button></ModalActions>
      </>}
    </div>}</Modal>
    <Modal busy={busy || useBusy} title={t("创建技能", "Create skill")} open={!!creation} onClose={() => { if (!busy) { setCreation(null); setCreationError(""); } }}>{creation && <div className="flex flex-col gap-4 text-sm">

      {!creation.result ? <>
        {creation.nativeDsh?<Field><FieldLabel htmlFor="dsh-create-directory">{t('创建目录','Creation directory')}</FieldLabel><Choice id="dsh-create-directory" label={t('创建目录','Creation directory')} value={creation.directory} disabled={busy} options={dshDirectories.filter(root=>root.canCreate===true).map(root=>({value:root.path,label:displayPath(root.path)}))} onChange={directory=>editCreation({directory})}/></Field>:<Field><FieldLabel htmlFor="create-directory">{t("创建目录", "Creation directory")}</FieldLabel><div className="flex gap-2"><Input id="create-directory" autoComplete="off" spellCheck={false} aria-label={t("创建目录", "Creation directory")} disabled={busy} value={displayPath(creation.directory)} onChange={(event) => editCreation({ directory: expandPath(event.target.value) })} placeholder="~/projects/my-project" /><Button variant="outline" disabled={busy} onClick={async () => { const path = await open({ directory: true, multiple: false }); if (typeof path === "string") editCreation({ directory: path }); }}>{t("选择文件夹", "Choose folder")}</Button></div></Field>}
        {!creation.nativeDsh&&<Field><FieldLabel>{t("创建位置", "Create in")}</FieldLabel><Choice label={t("创建位置", "Create in")} value={creation.mode} disabled={busy} options={[{ value: "child", label: t("新建同名子目录", "New named subdirectory") }, { value: "current", label: t("直接在所选目录创建", "Selected directory itself") }]} onChange={(value) => editCreation({ mode: value === "current" ? "current" : "child" })} /></Field>}
        {creation.mode === "child" ? <Field><FieldLabel htmlFor="create-name">{t("技能名称", "Skill name")}</FieldLabel><Input id="create-name" name="create-name" autoComplete="off" spellCheck={false} aria-label={t("技能名称", "Skill name")} disabled={busy} value={creation.name} onChange={(event) => editCreation({ name: event.target.value })} placeholder="my-skill" /><span className="block text-xs text-muted-foreground">{creation.nativeDsh?t("1–64 位小写字母、数字，以单个连字符分隔。","1–64 lowercase letters or digits, separated by single hyphens."):t("1–64 位小写字母、数字、连字符或下划线，以字母或数字开头。", "1–64 lowercase letters, digits, hyphens or underscores, starting with a letter or digit.")}</span></Field> : <p className="text-muted-foreground">{t("使用所选目录的名称作为技能名称。", "The selected directory's name becomes the skill name.")}</p>}
        <p className="text-muted-foreground">{t("创建 SKILL.md 模板，不覆盖已有文件。", "Create a SKILL.md template without overwriting existing files.")}</p>
        {creation.plan && <div className="flex flex-col gap-3 rounded-lg bg-muted/30 p-4"><p>{t("技能", "Skill")}：{creation.plan.skillName}</p><p className="break-all">{t("将创建", "Will create")}：{displayPath(creation.plan.file)}</p></div>}
        <ModalActions>{creation.plan ? <Button disabled={busy} onClick={() => void createSkill()}>{busy ? t("创建中…", "Creating…") : t("确认创建", "Confirm creation")}</Button> : <Button disabled={busy || !creation.directory.trim() || creation.mode === "child" && !creation.name.trim()} onClick={() => void reviewCreation()}>{busy ? t("检查中…", "Checking…") : t("检查创建位置", "Review creation location")}</Button>}</ModalActions>
      </> : <>
        <div className="flex flex-col gap-3 rounded-lg bg-muted/30 p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">{creation.result.plan.skillName}</p><Badge variant="outline">{creation.result.status === "complete" ? t("已创建", "Created") : creation.result.status === "failed" ? t("创建失败", "Creation failed") : t("未能确认创建结果", "Creation result unavailable")}</Badge></div><p className="break-all">{displayPath(creation.result.plan.file)}</p><p className="text-muted-foreground">{creation.result.status === "complete" ? creation.nativeDsh?t("技能已创建并通过 DSH 格式检查，可打开文件编辑。","Skill created and validated for DSH. Open the file to edit it."):t("模板已创建，可编辑后安装。", "Template created. Edit it, then install.") : creation.result.fileState === "missing" ? t("SKILL.md 未生成，请查看执行日志。", "SKILL.md was not created. View the execution log.") : creation.result.fileState === "unreadable" ? t("无法预览 SKILL.md，请打开目录查看文件。", "SKILL.md cannot be previewed. Open the folder to view it.") : creation.result.fileState === "unverified" ? t("文件已生成，未能确认技能格式，请打开 SKILL.md 检查。", "The file was created, but its skill format is unconfirmed. Open SKILL.md to inspect it.") : creation.result.fileState === "invalid" ? t("文件格式不符合技能要求，请打开 SKILL.md 修改。", "The file is not a valid skill. Open SKILL.md to edit it.") : t("创建命令未正常结束，请打开 SKILL.md 查看内容。", "The creation command did not finish normally. Open SKILL.md to inspect it.")}</p>{creation.result.status !== "complete" && <details><summary className="cursor-pointer">{t("错误详情", "Error details")}</summary><p className="mt-2 break-all text-xs text-muted-foreground">{displayPath(creation.result.message)}</p></details>}</div>
        {creation.result.content && <details open><summary className="cursor-pointer">SKILL.md</summary><pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border bg-card p-4 text-xs">{creation.result.content}</pre></details>}
        <ModalActions>{creation.result.content && <><Button variant="outline" disabled={busy} onClick={() => void openCreated(false)}>{t("打开 SKILL.md", "Open SKILL.md")}</Button></>}<Button variant="outline" disabled={busy} onClick={() => void openCreated(true)}><FolderOpenIcon  aria-hidden="true" />{t("打开目录", "Open folder")}</Button>{!creation.nativeDsh&&<Button disabled={busy || creation.result.status === "failed"} onClick={() => { const created = creation.result; if (created) { setCreation(null); setCreationError(""); startInstall(created.plan.skillDirectory, [], [created.plan.skillName]); } }}><PackagePlusIcon  aria-hidden="true" />{t("预览并安装", "Preview and install")}</Button>}<Button variant="ghost" disabled={busy} onClick={() => { setCreation({ ...creation, name: "", plan: null, result: null }); setCreationError(""); }}>{t("返回创建", "Back to creation")}</Button></ModalActions>
        <ExecutionLog value={creation.result.logs} home={home} zh={zh} />
      </>}
    </div>}</Modal>
    <Modal busy={busy || useBusy} title={t("技能测试", "Test skill")} open={!!useFlow} onClose={() => { if (!useBusy) setUseFlow(null); }}>{useFlow && <Suspense fallback={<p role="status">{t("正在准备会话…", "Preparing session…")}</p>}><UseSkillFlow source={useFlow.source} skill={useFlow.skill} target={useFlow.target} home={home} projects={preferences.projects.map(project => project.path)} zh={zh} icon={(id) => <AgentLogo name={id} size={22} />} onBusy={setUseBusy} /></Suspense>}</Modal>
    <Modal busy={busy || useBusy} title={wizard?.syncSkill ? t("同步技能", "Sync skill") : t("安装技能", "Install skills")} tall={wizardWorkspace} open={!!wizard} onClose={() => { if (!busy) { inspectionRequest.current++; setWizard(null); } }}>{wizard && <div className={cn("flex flex-col gap-5", wizardWorkspace && "h-full min-h-0")}><StepIndicator steps={wizard.syncSkill ? (zh ? ["选择 Agent", "确认", "结果"] : ["Agents", "Review", "Result"]) : zh ? steps : englishSteps} current={wizard.syncSkill ? wizard.step - 2 : wizard.step} />{wizard.syncSkill && wizard.step === 2 && <p className="break-all text-sm font-medium">{wizard.syncSkill}</p>}{wizard.syncSkill && busy && !wizard.syncReview && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />{t("正在检查来源…", "Inspecting source…")}</p>}
      {wizard.step === 0 && <><SourceField zh={zh} disabled={busy} value={displayPath(wizard.source)} onChange={value => setWizard({...wizard,source:expandPath(value),inspection:null})} onBrowse={async () => {try {const path = await open({directory:true});if(typeof path === "string") setWizard({...wizard,source:path,inspection:null});} catch(reason) {setWizardError(String(reason),t("目录选择器无法打开，请直接输入路径。","Could not open the folder picker. Enter the path directly."));}}} /><details><summary className="cursor-pointer text-xs text-muted-foreground">{t("更多设置", "More settings")}</summary><div className="mt-3 flex flex-col gap-2"><label className="flex items-center gap-2 text-sm"><Checkbox disabled={busy} checked={wizard.includeInternal} onCheckedChange={(checked) => { inspectionRequest.current++; setWizardError(""); setWizard({ ...wizard, includeInternal: checked === true, inspection: null, skills: [] }); }} />{t("显示内部技能", "Show internal skills")}</label><p className="text-xs text-muted-foreground">{t("显示安装来源中默认隐藏的内部技能，供选择安装", "Show internal skills hidden by default in the installation source so you can select them for installation.")}</p></div></details></>}
      {wizard.step === 1 && <div className={cn("flex flex-col gap-2", wizardWorkspace && "min-h-0 flex-1")}>{wizard.inspection?.skillFilter && <p className="text-xs text-muted-foreground">{t("来源指定的技能", "Skill specified by source")}：{wizard.inspection.skillFilter}</p>}{wizard.inspection?.warnings.length ? <details><summary className="text-sm">{t("预览限制", "Preview limitations")}</summary><pre className="whitespace-pre-wrap text-xs">{displayPath(wizard.inspection.warnings.join("\n"))}</pre></details> : null}<BulkSelectionBar count={wizard.skills.length} disabled={busy} zh={zh} onSelectAll={()=>setWizard(current=>current?{...current,skills:current.inspection?.skills.map(skill=>skill.name)??[]}:current)} onInvert={()=>setWizard(current=>current?{...current,skills:current.inspection?.skills.filter(skill=>!current.skills.includes(skill.name)).map(skill=>skill.name)??[]}:current)} />
      <div className={cn("grid auto-rows-max content-start gap-3 overflow-y-auto overscroll-contain p-1 sm:grid-cols-2", wizardWorkspace ? "min-h-0 flex-1" : "max-h-[50vh]")}>{wizard.inspection?.skills.map(skill => <InstallSkillOption key={skill.name} skill={skill} checked={wizard.skills.includes(skill.name)} disabled={busy} zh={zh} onChange={checked => setWizard(current => current ? { ...current, skills: checked ? [...current.skills.filter(name => name !== skill.name), skill.name] : current.skills.filter(name => name !== skill.name) } : current)} />)}</div></div>}
      {wizard.step === 2 && (!wizard.syncSkill || wizard.syncReview) && <FieldGroup className="min-h-0 flex-1 gap-4">{wizard.syncSkill && wizard.syncReview && !syncReady && <Alert><InfoIcon aria-hidden="true" /><AlertTitle>{wizard.syncReview.state === "different" ? t("同步内容已变化", "Source and local content differ") : wizard.syncReview.state === "unknown" ? t("无法读取同步内容", "Content could not be verified") : t("共享目录存在冲突", "Shared folder conflict")}</AlertTitle><AlertDescription>{t("点击“重新检查”读取当前技能和目标目录。", "Click Check again to read the current skill and target folders.")}</AlertDescription></Alert>}<div className="grid shrink-0 gap-4 sm:grid-cols-2"><Field className="gap-2"><FieldLabel className="flex h-5 items-center text-xs text-muted-foreground">{t("安装范围", "Installation scope")}</FieldLabel><Choice label={t("安装范围", "Installation scope")} className="w-full" disabled={busy} value={wizard.target.projectPath ?? "global"} options={scopeOptions} onChange={(value) => void changeWizardTarget(chooseScope(value))} /></Field><InstallModeField compact zh={zh} disabled={busy} mode={wizard.copy ? "copy" : "symlink"} copyOnly={wizardCopyOnly} copyReason={wizard.agents.every(id => id === "eve") ? t("Eve 使用独立目录，采用文件复制。", "Eve uses independent folders and file copies.") : t("所选 Agent 共用安装目录，使用文件复制。", "The selected Agents share one installation folder and use file copies.")} onChange={mode => setWizard({ ...wizard, copy: mode === "copy" })} /></div>{syncReady && <AgentPicker defaultStatus="confirmed" unavailable={syncUnavailable} fill home={home} agents={orderAgents(wizard.catalog, preferences.agentOrder).filter(agent => !(agent.id === "eve" && wizard.inspection?.skills.some(s => !!s.downloadUrl)))} selected={wizard.agents} disabled={busy || !syncReady} zh={zh} onChange={agents => setWizard({...wizard,agents: agents.filter(id => !syncUnavailable?.[id])})} />}{wizard.agents.includes("eve") && <div className="flex flex-col gap-2 rounded-md border p-3 text-sm"><p className="font-medium">{t("Eve 安装位置", "Eve destinations")}</p>{["root", ...(wizard.catalog.find((a) => a.id === "eve")?.subagents ?? [])].map((slot) => <label className="flex items-center gap-2" key={slot}><Checkbox disabled={busy} checked={wizard.eveSubagents.includes(slot)} onCheckedChange={() => setWizard({ ...wizard, eveSubagents: toggle(wizard.eveSubagents, slot) })} />{slot === "root" ? t("根 Agent", "Root Agent") : slot}</label>)}<p className="text-xs text-muted-foreground">{t("转换为 Eve 技能格式后安装到所选位置。", "Eve converts skill documents and installs only to the selected destinations.")}</p></div>}{wizard.inspection?.provider && <p className="text-xs text-muted-foreground">{t("同一安装目录使用复制；Eve 暂不支持下载来源。", "A single installation folder uses copies. Eve does not support download sources.")}</p>}</FieldGroup>}
      {wizard.step === 3 && <InstallReview source={wizard.source} target={wizard.target} skills={(wizard.inspection?.skills ?? []).filter(skill => wizard.skills.includes(skill.name))} agents={orderAgents(wizard.catalog, preferences.agentOrder).filter(agent => wizard.agents.includes(agent.id))} mode={wizard.copy || wizardCopyOnly ? "copy" : "symlink"} eveSubagents={wizard.eveSubagents} overwrites={Object.entries(wizard.syncReview?.blockedAgents ?? {}).filter(([,state])=>state!=="matching").map(([id])=>id)} home={home} zh={zh} />}
      {wizard.step === 4 && resultView(false)}
      <ModalActions>{wizard.syncSkill && wizard.step < 4 && <Button variant="outline" disabled={busy} onClick={() => { inspectionRequest.current++; setWizard(null); }}>{t("取消", "Cancel")}</Button>}{wizard.syncSkill && wizard.syncReview && !syncReady && wizard.syncOrigin?.target.scope === target.scope && wizard.syncOrigin.target.projectPath === target.projectPath && <Button variant="outline" disabled={busy} onClick={() => { setWizard(null); void checkUpdates(); }}>{t("检查更新", "Check updates")}</Button>}{wizard.step > (wizard.syncSkill ? 2 : 0) && wizard.step < 4 && <Button variant="outline" disabled={busy} onClick={() => setWizard({ ...wizard, step: wizard.step - 1 })}>{t("上一步", "Back")}</Button>}{wizard.syncSkill && (!wizard.syncReview || !syncReady) && wizard.step < 4 ? <Button disabled={busy} onClick={() => void inspectSource()}>{busy ? t("正在检查…", "Inspecting…") : t("重新检查", "Check again")}</Button> : wizard.step === 0 ? <Button disabled={busy || !wizard.source.trim()} onClick={() => void inspectSource()}>{busy ? t("正在检查…", "Inspecting…") : t("检查来源", "Inspect source")}</Button> : wizard.step < 3 ? <Button disabled={busy || (wizard.step === 1 ? !wizard.skills.length : !wizard.agents.length || wizard.agents.includes("eve") && !wizard.eveSubagents.length)} onClick={() => setWizard({ ...wizard, step: wizard.step + 1 })}>{t("下一步", "Next")}</Button> : wizard.step === 3 ? <Button disabled={busy || !syncReady} onClick={() => void execute({ syncOrigin: wizard.syncOrigin, target: wizard.target, action: "add", source: wizard.source, skills: wizard.skills, agents: wizard.agents, copy: wizard.copy, eveSubagents: wizard.agents.includes("eve") ? wizard.eveSubagents : [], includeInternal: wizard.includeInternal, inspectionSession: wizard.inspection?.sessionId, sourceHashes: Object.fromEntries((wizard.inspection?.skills ?? []).filter((skill) => wizard.skills.includes(skill.name)).map((skill) => [skill.name, skill.selectionFingerprint])) })}>{busy ? t("安装中…", "Installing…") : wizard.syncSkill ? t("确认同步", "Confirm sync") : t("确认安装", "Confirm installation")}</Button> : <>{resultActions()}<Button onClick={() => { setWizard(null); setResult(null); }}>{t("完成", "Done")}</Button></>}</ModalActions></div>}</Modal>
    {dshPolicyPending&&<AlertDialog open onOpenChange={open=>{if(!open&&!busy)setDshPolicyPending(null);}}><AlertDialogContent size="sm" aria-busy={busy}><AlertDialogHeader><AlertDialogTitle>{t("修改技能设置？","Change skill settings?")}</AlertDialogTitle><AlertDialogDescription>{t("此技能不在当前项目内，修改也会影响使用同一文件的其他项目和配置。","This skill is outside this project. Other projects and configurations using this file share the change.")}</AlertDialogDescription></AlertDialogHeader><AlertDialogBody className="font-medium">{dshPolicyPending.skills.map(skill=>skill.name).join("、")}</AlertDialogBody><AlertDialogFooter><AlertDialogCancel disabled={busy}>{t("取消","Cancel")}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event=>{event.preventDefault();void saveDshPolicy(dshPolicyPending.skills,dshPolicyPending.action);}}>{t("确认","Confirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
    {dshRemoval&&<AlertDialog open onOpenChange={open=>{if(!open&&!busy)setDshRemoval(null);}}><AlertDialogContent size="sm" aria-busy={busy} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}}><AlertDialogHeader><AlertDialogTitle>{t("卸载技能？","Uninstall skill?")}</AlertDialogTitle><AlertDialogDescription>{dshRemoval?.path===dshRemoval?.file?t("所选 Markdown 文件将移至废纸篓，同目录的附件保留。","The selected Markdown file will move to Trash. Sibling attachments are preserved."):t("所选技能目录及其中的附件将移至废纸篓。","The selected skill directory and its attachments will move to Trash.")}</AlertDialogDescription></AlertDialogHeader><AlertDialogBody className="flex min-w-0 flex-col gap-1.5 text-sm"><p className="break-all font-medium">{dshRemoval?.name}</p><p className="break-all font-mono text-xs text-muted-foreground">{displayPath(dshRemoval?.path??"")}</p></AlertDialogBody><AlertDialogFooter><AlertDialogCancel disabled={busy}>{t("取消","Cancel")}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={event=>{event.preventDefault();if(dshRemoval)void executeDshRemoval(dshRemoval);}}>{busy?t("卸载中…","Uninstalling…"):t("卸载","Uninstall")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
    <AlertDialog open={!!piRemoval} onOpenChange={open=>{if(!open&&!busy)setPiRemoval(null);}}>
      {piRemoval && <AlertDialogContent size="sm" aria-busy={busy} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("卸载技能？","Uninstall skill?")}</AlertDialogTitle>
          <AlertDialogDescription>{t("所选技能将移到废纸篓。","The selected skill will be moved to Trash.")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogBody className="flex min-w-0 flex-col gap-1.5 text-sm">
          <p className="break-all font-medium">{piRemoval.name}</p>
          <p className="break-all font-mono text-xs leading-5 text-muted-foreground">{displayPath(piRemoval.path)}</p>
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("取消","Cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={event=>{event.preventDefault();void executePiRemoval(piRemoval);}}>{busy?t("卸载中…","Uninstalling…"):t("卸载","Uninstall")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>}
    </AlertDialog>
    <AlertDialog open={!!pending} onOpenChange={open=>{if(!open&&!busy&&!useBusy)setPending(null);}}>
      {pending && <AlertDialogContent size={pending.removalSource || pending.skills.length > 1 ? "wide" : "default"} aria-busy={busy || useBusy} onEscapeKeyDown={event=>{if(busy||useBusy)event.preventDefault();}}>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending.action === "remove" ? pending.removalSource ? t("同源卸载？","Uninstall by source?") : t("卸载技能？","Uninstall skills?") : t(`更新 ${pending.skills.length} 个技能？`,`Update ${pending.skills.length} skills?`)}</AlertDialogTitle>
          <AlertDialogDescription>{pending.action === "remove" ? pending.removalSource ? t("卸载当前范围内来自同一安装来源的全部托管技能。","Uninstall all managed skills from this installation source in the current scope.") : t("将删除所选技能的安装文件。","The selected skill installation files will be removed.") : t("更新可能覆盖本地修改，并影响同源或共用目录的技能。","Updates may overwrite local edits and affect skills from the same source or shared folder.")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogBody>
          {pending.action === "remove" ? <RemovalReview operation={pending} agents={catalog} home={home} zh={zh} busy={busy} onIncludeCopies={agents=>void prepare("remove",pending.skills,[...new Set([...pending.agents,...agents])],pending.target)} /> : <dl aria-label={t("版本更新", "Version updates")} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-3 gap-y-4 text-sm">
            {pending.skills.map(name => {
              const update = updatesBySkill.get(name);
              return <div key={name} className="col-span-4 grid min-w-0 grid-cols-subgrid items-center">
                <dt className="min-w-0 pr-3 font-medium [overflow-wrap:anywhere]">{name}</dt>
                <dd className="col-span-3 grid grid-cols-subgrid items-center font-mono text-xs tabular-nums text-muted-foreground"><span>{shortSkillVersion(update?.currentRevision ?? null)}</span><span>→</span><span>{shortSkillVersion(update?.latestRevision ?? null)}</span></dd>
              </div>;
            })}
          </dl>}
        </AlertDialogBody>
        <AlertDialogFooter>
          {pendingSourceSkill && <Hint stable text={t("卸载同一来源的所有技能","Uninstall all skills from the same source")} disabled={busy || useBusy}><Button variant="outline" disabled={busy || useBusy} onClick={() => void removeSource(pendingSourceSkill, pending.target)}><Trash2Icon data-icon="inline-start" aria-hidden="true" />{t("同源卸载","Uninstall by source")}</Button></Hint>}
          <AlertDialogCancel disabled={busy || useBusy}>{t("取消","Cancel")}</AlertDialogCancel>
          <AlertDialogAction variant={pending.action === "remove" ? "destructive" : "default"} disabled={busy || useBusy} onClick={event=>{event.preventDefault();void execute(pending);}}>{busy ? pending.action === "remove" ? t("卸载中…","Uninstalling…") : t("更新中…","Updating…") : pending.action === "remove" ? pending.skills.length === 1 ? t("卸载","Uninstall") : t(`卸载 ${pending.skills.length} 个技能`,`Uninstall ${pending.skills.length} skills`) : t(`更新 ${pending.skills.length} 个技能`,`Update ${pending.skills.length} skills`)}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>}
    </AlertDialog>
    <Modal compact busy={busy || useBusy} title={t("执行结果", "Operation results")} open={!!result && !wizard} onClose={() => setResult(null)}>{resultView()}</Modal>
  <CodexAuthorizationDialog authorization={codex.authorization} zh={zh} onStart={()=>void codex.startAuthorization()} onCancel={codex.cancelAuthorization}/>
  <CodexPluginUpdateDialog review={codex.updateReview} busy={codex.working} zh={zh} home={home} onClose={()=>codex.setUpdateReview(null)} onApply={()=>void codex.updatePlugin()}/><CodexConfirmation error={codex.actionError} pending={codex.pending} busy={codex.working} zh={zh} home={home} onClose={()=>codex.setPending(null)} onApply={()=>void codex.apply()}/>
  {hermesPending && <AlertDialog open={true} onOpenChange={value=>{if(!value&&!busy)setHermesPending(null);}}><AlertDialogContent size="sm" onEscapeKeyDown={e=>{if(busy)e.preventDefault();}}><AlertDialogHeader><AlertDialogTitle>{hermesPending?.kind==="preload"?t("修改预加载？","Change preload?"):t("修改技能状态？","Change skill state?")}</AlertDialogTitle><AlertDialogDescription>{t("此设置影响当前配置方案中的所有同名技能。","This affects all skills with this name in the current profile.")}</AlertDialogDescription></AlertDialogHeader><AlertDialogBody className="font-medium">{hermesPending?.skills.map(skill=>skill.name).join("、")}</AlertDialogBody><AlertDialogFooter><AlertDialogCancel disabled={busy}>{t("取消","Cancel")}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e=>{e.preventDefault();if(hermesPending)void applyHermesAction(hermesPending);}}>{t("确认","Confirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}<Toaster toastOptions={{ closeButtonAriaLabel: t("关闭提示", "Dismiss notification") }} containerAriaLabel={t("通知", "Notifications")} /></SidebarProvider><PiPackageUpdateDialog review={piPackageReview?.result ?? null} busy={busy || checkingPackage} zh={zh} home={home} onClose={()=>setPiPackageReview(null)} onUpdate={()=>{if(piPackageReview)void changePiPackage(piPackageReview.skill,"update");}} /></>;
}

export default App;
