import { WorkshopWorkbench } from '@/components/workshop-workbench';
import { useEffect, useRef, useState } from 'react';
import { TypeIcon, BotIcon, ClockIcon, FileTextIcon, PackagePlusIcon, EyeIcon, PencilIcon, AppWindowIcon, ClipboardCheckIcon, FolderOpenIcon, FolderIcon, LayoutGridIcon, MoonIcon, PlayIcon, PlusIcon, RefreshCwIcon, RotateCcwIcon, ShoppingBagIcon, LightbulbIcon, SunIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarInset, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup, SidebarGroupLabel, SidebarTrigger } from '@/components/ui/sidebar';
import { InventoryCard, InventoryCardHeader, InventoryCardFooter } from '@/components/inventory-card';
import { InventoryToolbar } from '@/components/inventory-toolbar';
import { Modal, ModalActions } from '@/components/modal';
import { SkillDetail, SkillDetailHeader, SkillDetailMetadata } from '@/components/skill-detail';
import { SkillMarkdown } from '@/components/skill-markdown';
import { SkillDocument } from '@/components/skill-document';
import { OverflowText } from '@/components/overflow-text';
import { ActionMenu } from '@/components/action-menu';
import { DirectoryLink } from '@/components/directory-link';
import { AgentLogo } from '@/components/agent-logo';
import { Hint } from '@/components/hint';
import { StepIndicator } from '@/components/step-indicator';
import { InstallSkillOption } from '@/components/install-skill-option';
import { InstallModeField } from '@/components/install-mode-field';
import { InstallReview } from '@/components/install-review';
import { AgentPicker } from '@/components/agent-picker';
import { applyAppearance, defaultAppearance } from '@/lib/appearance';
import type { Agent, Inspection, InstallMode, Target } from '@/lib/upstream';
import appIcon from '@/assets/icon.png';

type Creator = 'pi' | 'codex';
type Review = { revision: number; structure: number; actual: number | null };
type Plan = { feedback?: string; approach: string; requirements: string; output: string; example: string; files: { path: string; change: string }[]; scopeChange?: string; format?: 'markdown' | 'json' };
type Screen = { id: string; kind: 'detail' | 'workbench'; review?: boolean };
type WorkspaceState = { file: WorkspaceFile; filesOpen: boolean };
const defaultWorkspace: WorkspaceState = { file: 'plan', filesOpen: false };
type WorkspaceFile = 'plan' | 'skill' | 'template' | 'review';
type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; files?: WorkspaceFile[] };
type Draft = { messages?: ChatMessage[]; planRevision?: number; plan?: Plan; planPending?: boolean; requirementsPending?: boolean; skillRules?: string[]; templateRules?: string[]; skillPlan?: Plan; templatePlan?: Plan; artifactTitle?: string; id: string; title: string; skill: string; description: string; creationDescription?:string; brief: string; agent: Creator; generated: boolean; revision: number; evidence: boolean; updated: string; review?: Review; failed?: boolean };
type Run = { direct?: boolean; confirmedPlan?: Plan; request: string; draft: string; agent: Creator; kind: 'plan' | 'create' | 'review'; phase: 'running' | 'done' | 'stopped'; startedAt: number; finishedAt?: number; step: number; full: boolean };
type Form = { id?: string; description: string; title: string; brief: string; agent: Creator };
const names = { pi: 'Pi', codex: 'Codex' };
const planEvents = ['读取创作要求', '整理输入与输出规则', '确定文件及操作范围', '生成可审阅的创作方案'];
const createEvents = ['读取创作要求', '读取参考模板', '编写技能说明与输出模板', '检查生成的文件'];
const structureReviewEvents = ['读取本次技能内容', '检查元数据与工作流程', '检查资源与可移植性', '整理评估结论与证据'];
const reviewEvents = ['读取本次技能内容', '检查工作流程与引用资源', '对照实际任务与输出', '整理评估结论与证据'];
const seeds: Draft[] = [
  { id: 'meeting', title: '会议纪要整理', skill: 'meeting-notes', description: '从会议速记提取决定、行动项和待确认事项，保留负责人和原始日期。', brief: '将会议速记整理为简明纪要。区分已确认决定与建议，不推断负责人、日期或尚未确定的结论。支持中英文输入。', agent: 'pi', generated: true, revision: 2, evidence: true, updated: '今天', review: { revision: 2, structure: 54, actual: 32 } },
  { id: 'api', title: '接口变更检查', skill: 'api-change-review', description: '对照接口约定检查变更影响，整理兼容性问题和需要确认的细节。', brief: '阅读接口变更说明，识别参数、返回值和错误处理的变化。每条问题指出具体依据，未确定的影响单独列出。', agent: 'codex', generated: true, revision: 1, evidence: false, updated: '今天', review: { revision: 1, structure: 51, actual: null } },
  { id: 'prd', title: '产品需求评审', skill: 'review-requirements', description: '检查需求文档中的用户任务、业务规则和验收条件，整理具体的待澄清问题。', brief: '对需求文档进行评审，重点检查用户任务、业务规则和验收条件。不要把建议包装为已确认需求。', agent: 'pi', generated: true, revision: 1, evidence: false, updated: '昨天' },
  { id: 'weekly', title: '周报整理', skill: 'weekly-summary', description: '把零散工作记录整理为进展、问题和下周安排。', brief: '从工作记录中整理周报，保留原有事实与完成状态；未完成事项不能写成完成。', agent: 'codex', generated: false, revision: 0, evidence: false, updated: '昨天' },
  { id: 'commit', title: '提交说明整理', skill: 'write-change-notes', description: '根据实际改动整理清楚的提交说明，突出问题、变化和必要验证。', brief: '根据提供的改动整理提交说明。只描述实际发生的变化，区分已验证与尚未验证。', agent: 'codex', generated: true, revision: 3, evidence: true, updated: '2 天前', review: { revision: 2, structure: 55, actual: 36 } },
  { id: 'terms', title: '文档术语统一', skill: 'unify-terminology', description: '参照术语表检查文档，输出需要调整的用词及所在位置。', brief: '检查文档中的术语，依据提供的术语表提出调整建议。没有依据的词语保留待确认。', agent: 'pi', generated: false, revision: 0, evidence: false, updated: '3 天前', failed: true },
];
function latestRequirement(brief: string) { const parts = brief.split(/\n\n(?:本轮补充|补充要求)：/); return parts[parts.length - 1]; }
const scopeEditExample = '将输出改为 JSON，替换现有 Markdown 模板。';
// Canned responses for the prototype examples, not a natural-language scope detector.
function scopeChangeFor(brief: string) { return latestRequirement(brief).includes(scopeEditExample); }
function planFor(d: Draft): Plan {
  const json = scopeChangeFor(d.brief) || !!(d.planPending && d.plan?.scopeChange);
  const weekly = d.id === 'weekly';
  return {
    feedback: d.planRevision ? latestRequirement(d.brief) : undefined,
    approach: json ? '保留信息提取与缺失项检查，将结果整理为 summary、decisions、actions 和 pending 字段。' : weekly ? '按本周进展、问题和下周安排归类工作记录；保留完成状态，未完成事项继续列为待办。' : d.id === 'meeting' ? '区分会议中的已确认决定、建议和分歧；为行动项保留负责人和原始日期，缺失信息列入待确认。' : `围绕“${d.title}”读取材料，检查事实与缺失项，按统一结构整理结果。`,
    output: json ? '一个可解析的 JSON 对象；actions 中每项包含任务、负责人和日期，缺失值保留为 null。' : weekly ? '一份包含本周进展、问题与风险、下周安排的 Markdown 周报。' : d.id === 'meeting' ? '一份 Markdown 纪要：摘要、已确认决定、行动项表格、待确认事项。' : `一份用于“${d.title}”的 Markdown 结果，包含结论、具体条目和待确认信息。`,
    example: json ? '{"summary":"讨论发布安排","decisions":[],"actions":[{"task":"补充帮助文案","owner":null,"date":null}],"pending":["确认发布时间"]}' : weekly ? '## 本周进展\n- 帮助文案：已完成\n\n## 问题与风险\n- 发布时间待确认\n\n## 下周安排\n- 完成发布检查' : '## 已确认决定\n- 先完成帮助文案，再发布\n\n## 行动项\n| 任务 | 负责人 | 日期 |\n| --- | --- | --- |\n| 补充帮助文案 | 未明确 | 周五前 |\n\n## 待确认\n- 发布时间',
    files: [{ path: 'SKILL.md', change: json ? '更新输出格式和字段规则' : '写入使用条件、工作流程和信息处理规则' }, { path: 'references/output-template.md', change: json ? '用 JSON 字段模板替换 Markdown 模板' : '提供对应的输出结构和填写示例' }],
    requirements: '在当前创作目录内编辑说明和模板。',
    scopeChange: json ? '输出将从 Markdown 文档变成 JSON，现有模板和使用方式都会变化。' : undefined,
    format: json ? 'json' : 'markdown',
  };
}
const initialDrafts = seeds.map(d => ({ ...d, ...(d.generated ? { plan: planFor(d), planPending: false, artifactTitle: d.title, planRevision: 1 } : {}), messages: [{ id: `${d.id}-user`, role: 'user' as const, text: d.brief }, ...(d.generated ? [{ id: `${d.id}-assistant`, role: 'assistant' as const, text: '技能已构建完成。文件在右侧工作区，你可以继续告诉我需要调整的地方。', files: ['plan', 'skill', 'template'] as WorkspaceFile[] }] : [])] }));
const mockAgents: Agent[] = (['pi', 'codex'] as const).map(id => ({ id, name: names[id], path: '~/.agents/skills', directoryExists: true, detected: true, installationStatus: 'confirmed', installationEvidence: null, sharedDirectory: true, additionalPaths: [] }));
function documentFor(d: Draft) {
  return `---\nname: ${d.skill}\ndescription: ${d.description}\n---\n\n# ${d.artifactTitle ?? d.title}\n\n${d.description}\n\n## 使用方式\n\n阅读用户提供的材料，先确认输入包含的信息，再按照约定组织结果。只使用材料中有依据的事实。\n\n## 工作流程\n\n${d.skillPlan ? `${d.skillPlan.approach}\n\n` : ""}1. 阅读输入，区分已确认内容与尚未确定的事项。\n2. 保留原文中的负责人、日期和明确限制，不补充缺失事实。\n3. 参考 [输出模板](references/output-template.md)，整理结果。\n4. 检查每一项结论是否能在原始材料中找到依据。\n\n## 输出要求\n\n${d.skillPlan ? `${d.skillPlan.output}\n\n` : ""}- ${d.skillPlan?.format === "json" ? "输出合法 JSON，使用约定字段。" : "保持输入语言，使用简明的 Markdown。"}\n- 将含糊、冲突和未确认的信息单独列出。\n- ${d.skillPlan?.format === "json" ? "缺失的负责人和日期使用 null。" : "缺失的负责人和日期使用“未明确”。"}\n\n## 风险与待确认\n\n建议不等于决定。没有明确结论时，保留原有分歧；不要推断最终选择。${d.skillRules?.length ? `\n\n## 补充规则\n\n${d.skillRules.map(rule => `- ${rule}`).join("\n")}` : ""}`;
}
function generatedRules(d: Draft, task: Run) {
  const instruction = latestRequirement(task.request);
  const template = instruction.startsWith('修改 references/output-template.md：');
  const rule = instruction.replace(/^修改 (?:SKILL.md|references\/output-template.md)：/, '');
  const previous = (template ? d.templateRules : d.skillRules) ?? [];
  const rules = previous.includes(rule) ? previous : [...previous, rule];
  if (!d.generated || !task.direct && task.confirmedPlan?.scopeChange) return { skillRules: rules, skillPlan: task.confirmedPlan, templatePlan: task.confirmedPlan };
  return template ? { templateRules: rules, templatePlan: task.confirmedPlan ?? d.templatePlan } : { skillRules: rules, skillPlan: task.confirmedPlan ?? d.skillPlan };
}
function templateFor(d: Draft) {
  if (d.templatePlan?.format === 'markdown') return `# 输出模板\n\n${d.templatePlan.output}\n\n${d.templatePlan.example}${d.templateRules?.length ? `\n\n## 补充约定\n\n${d.templateRules.join('\n')}` : ''}`;
  if (d.templatePlan?.format === 'json') return `# 输出模板\n\n${d.templatePlan.output}\n\n\`\`\`json\n${d.templatePlan.example}\n\`\`\`${d.templateRules?.length ? `\n\n## 补充约定\n\n${d.templateRules.join('\n')}` : ''}`;
  return `# 输出模板${d.templatePlan ? `\n\n## 使用方式\n\n${d.templatePlan.approach}` : ""}\n\n## 摘要\n\n简明呈现材料中的主要内容。\n\n## 已确认事项\n\n保留明确作出的决定。\n\n## 行动项\n\n| 任务 | 负责人 | 日期 |\n| --- | --- | --- |\n| 原文事项 | 原文负责人或未明确 | 原文日期或未明确 |\n\n## 风险与待确认\n\n保留含糊、冲突和未确认的信息。${d.templateRules?.length ? `\n\n## 补充约定\n\n${d.templateRules.map(rule => `- ${rule}`).join("\n")}` : ''}`;
}
function skillFor(d: Draft): Inspection['skills'][number] {
  return { name: d.skill, path: `~/Skills Space/workshop/${d.id}/skill/${d.skill}`, description: d.description, content: documentFor(d), internal: false, downloadUrl: null, fileCount: 2, pluginName: null, selectionFingerprint: null, fingerprint: null };
}
function planDocument(d: Draft) {
  if (!d.plan) return '';
  const plan = d.plan;
  return `# ${d.title} · 构建方案\n\n## 技能目标\n\n${d.description}\n\n## 工作方式\n\n${plan.approach}\n\n## 输出结果\n\n${plan.output}\n\n### 输出示例\n\n${plan.example}\n\n## 文件安排\n\n${plan.files.map(file => `- **${file.path}**：${file.change}`).join('\n')}\n\n## 执行范围\n\n${plan.requirements}${plan.scopeChange ? `\n\n## 本次变化\n\n${plan.scopeChange}` : ''}${plan.feedback ? `\n\n## 本轮调整\n\n${plan.feedback}` : ''}`;
}
function reviewDocument(d: Draft) {
  if (!d.review) return '';
  return `# ${d.title} · 评估报告\n\n结构评估：${d.review.structure} / 60\n\n实际任务：${d.review.actual === null ? '未评估' : `${d.review.actual} / 40`}\n\n## 结论与建议\n\n技能边界和输出规则清楚，引用模板完整。建议补充缺失与冲突信息的区别，以及模板空章节的写法。\n\n## 依据\n\nSKILL.md 的工作流程和 references/output-template.md。${d.review.revision !== d.revision ? '\n\n本报告基于此前版本。' : ''}`;
}
const fileNames: Record<WorkspaceFile, string> = { plan: 'PLAN.md', skill: 'SKILL.md', template: 'output-template.md', review: 'review.md' };
function chatMessage(role: ChatMessage['role'], text: string, files?: WorkspaceFile[]): ChatMessage {
  return { id: crypto.randomUUID(), role, text, files };
}

export default function WorkshopPreview() {
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts);
  const [screens, setScreens] = useState<Screen[]>([]);
  const screen = screens[screens.length - 1];
  const selected = screen?.id ?? null;
  const isWorkbench = screen?.kind === 'workbench';
  const previousScreen = screens[screens.length - 2];
  const backLabel = previousScreen?.kind === 'workbench' ? '返回工作台' : previousScreen?.kind === 'detail' ? '返回技能详情' : '返回创意工坊';
  const [query, setQuery] = useState('');
  const [workspaces, setWorkspaces] = useState<Record<string, WorkspaceState>>({});
  const workspace = selected ? workspaces[selected] ?? defaultWorkspace : defaultWorkspace;
  const fileToggle = useRef<HTMLButtonElement | null>(null);
  const chatScroll = useRef<Record<string, number>>({});
  const [dark, setDark] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const [form, setForm] = useState<Form | null>(null);
  const [formOriginal, setFormOriginal] = useState<Form | null>(null);
  const [discard, setDiscard] = useState(false);
  const [removing, setRemoving] = useState<Draft | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewFull, setReviewFull] = useState(false);
  const [reviewAgent, setReviewAgent] = useState<Creator>('pi');
  const [trial, setTrial] = useState(false);
  const [task, setTask] = useState('');
  const [trialResult, setTrialResult] = useState(false);
  const [install, setInstall] = useState(false);
  const [installStep, setInstallStep] = useState(0);
  const [installSelected, setInstallSelected] = useState(true);
  const [agents, setAgents] = useState<string[]>(['pi']);
  const [installMode, setInstallMode] = useState<InstallMode>('copy');
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const main = useRef<HTMLElement | null>(null);
  const listScroll = useRef(0);
  const draft = drafts.find(d => d.id === selected);
  const activeRun = run?.draft === selected ? run : null;
  const isRunning = activeRun?.phase === 'running';
  const hasRunning = run?.phase === 'running';
  const otherRunning = hasRunning && run.draft !== selected;
  const runningDraft = hasRunning ? drafts.find(d => d.id === run.draft) : undefined;
  const elapsed = activeRun ? Math.max(0, Math.floor(((activeRun.finishedAt ?? now) - activeRun.startedAt) / 1000)) : 0;
  const visible = drafts.filter(d => `${d.title} ${d.creationDescription??''} ${d.description} ${d.brief} ${d.skill}`.toLowerCase().includes(query.trim().toLowerCase()));
  const target: Target = { host: 'local', scope, projectPath: scope === 'project' ? '~/Projects/example-project' : null };

  useEffect(() => { applyAppearance({ ...defaultAppearance, theme: dark ? 'dark' : 'light' }, false); }, [dark]);
  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasRunning]);
  useEffect(() => { if (main.current) main.current.scrollTop = selected ? 0 : listScroll.current; }, [selected, isWorkbench]);
  useEffect(() => {
    if (run?.phase !== 'running') return;
    const timer = window.setTimeout(() => {
      if (run.step < 3) { setRun({ ...run, step: run.step + 1 }); return; }
      setDrafts(ds => ds.map(d => d.id !== run.draft ? d : run.kind === 'plan'
        ? { ...d, plan: planFor(d), planPending: true, planRevision: (d.planRevision ?? 0) + 1, messages: [...(d.messages ?? []), chatMessage('assistant', d.plan ? `我已更新构建方案，本轮会纳入：${latestRequirement(d.brief)}\n\n请看右侧 PLAN.md。可以继续告诉我如何修改，或确认后开始构建。` : '构建方案已整理好，包含技能的工作方式、输出示例和文件安排。\n\n请看右侧 PLAN.md。你可以继续提出修改，或确认后开始构建。', ['plan'])] }
        : run.kind === 'create' ? { ...d, generated: true, planPending: false, ...generatedRules(d, run), artifactTitle: d.title, messages: [...(d.messages ?? []), chatMessage('assistant', run.direct ? '已按你的要求更新技能，原有用途和操作范围保持不变。' : '构建完成，技能说明与输出模板已生成。你可以查看文件，继续调整，或安装使用。', ['skill', 'template'])], failed: false, revision: d.revision + 1, updated: '刚刚' }
        : { ...d, review: { revision: d.revision, structure: 54, actual: run.full ? 32 : null }, messages: [...(d.messages ?? []), chatMessage('assistant', '评估完成，报告已放入工作区。源技能未修改。', ['review'])] }));
      setRun({ ...run, step: 4, phase: 'done', finishedAt: Date.now() });
      toast.success(run.kind === 'plan' ? '创作方案已生成，确认后再生成技能。' : run.kind === 'create' ? '演示创作已结束，产物已更新。' : '演示评估已结束，技能内容未修改。');
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [run, selected]);

  function updateWorkspace(change: Partial<WorkspaceState>) {
    if (selected) setWorkspaces(values => ({ ...values, [selected]: { ...defaultWorkspace, ...values[selected], ...change } }));
  }
  function goBack() { setScreens(values => values.slice(0, -1)); }
  function openDraft(id: string, view: 'detail' | 'workbench' | 'review' = 'detail') {
    if (!selected && main.current) listScroll.current = main.current.scrollTop;
    const next: Screen = { id, kind: view === 'workbench' ? 'workbench' : 'detail', review: view === 'review' };
    setScreens(values => { const current = values[values.length - 1]; return current?.id === id && current.kind === next.kind ? [...values.slice(0, -1), next] : [...values, next]; });
  }
  function openForm(item?:Draft) { const next: Form = item?{id:item.id,title:item.title,description:item.creationDescription??'',brief:item.brief,agent:item.agent}:{ title: '', description:'', brief: '', agent: 'pi' }; setForm(next); setFormOriginal(next); }
  function closeForm() { if (JSON.stringify(form) !== JSON.stringify(formOriginal)) setDiscard(true); else setForm(null); }
  function begin(d: Draft, kind: Run['kind'] = 'plan', full = false, agent: Creator = d.agent, direct = false) {
    if (run?.phase === 'running') { openDraft(run.draft, 'workbench'); return; }
    const actualKind = kind;
    setDrafts(ds => ds.map(item => item.id === d.id ? { ...item, requirementsPending: actualKind === 'review' ? item.requirementsPending : false, ...(actualKind === 'create' ? { planPending: false } : {}) } : item));
    if (selected !== d.id) openDraft(d.id, kind === 'review' ? 'review' : 'workbench'); setNow(Date.now());
    setRun({ direct, confirmedPlan: actualKind === 'create' && d.plan ? { ...d.plan } : undefined, request: d.brief, draft: d.id, agent, kind: actualKind, startedAt: Date.now(), phase: 'running', step: 0, full });
  }

  function startWorkbench(item: Draft) { openDraft(item.id, 'workbench'); }

  function saveForm() {
    if (!form?.title.trim() || !form.id&&!form.brief.trim()) return;
    if(form.id){setDrafts(values=>values.map(item=>item.id===form.id?{...item,title:form.title.trim(),creationDescription:form.description.trim()}:item));setForm(null);return;}
    const next: Draft = { id: `draft-${Date.now()}`, title: form.title.trim(), skill: 'new-skill', creationDescription: form.description.trim(), description: '处理用户指定的任务，并遵循已确认的方案。', brief: form.brief.trim(), agent: form.agent, generated: false, revision: 0, evidence: false, updated: '刚刚', messages: [chatMessage('user', form.brief.trim())] };
    setDrafts(ds => [next, ...ds]); setForm(null); openDraft(next.id, 'workbench'); begin(next);
  }
  function startReview(d: Draft) { setReviewFull(d.evidence); setReviewAgent(d.agent); setReviewing(true); }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); toast.success('已复制。'); } catch { toast.error('复制失败，请选择文字后复制。'); } }
  function draftMenu(d: Draft) { return <ActionMenu label={`${d.title}的更多操作`} compact groups={[[...(d.generated ? [{ label: '评估技能', icon: <ClipboardCheckIcon />, run: () => { openDraft(d.id); startReview(d); } }, { label: '试用技能', icon: <PlayIcon />, run: () => { openDraft(d.id); setTrialResult(false); setTask(''); setTrial(true); } }] : [])], [{ label: '删除创作', icon: <Trash2Icon />, destructive: true, run: () => setRemoving(d) }]]} />; }
  function reset() { setDrafts(initialDrafts); setInstructions({}); setWorkspaces({}); setScreens([]); setQuery(''); setRun(null); toast.success('已重置演示。'); }
  const events = activeRun?.kind === 'plan' ? planEvents : activeRun?.kind === 'review' ? activeRun.full ? reviewEvents : structureReviewEvents : createEvents;
  const composer = draft ? instructions[draft.id] ?? '' : '';
  const awaitingApproval = !!draft?.planPending && !!draft.plan && !isRunning;
  function approvePlan(message = '按这个方案开始构建。') {
    if (!draft?.plan || hasRunning) return;
    const next = { ...draft, messages: [...(draft.messages ?? []), chatMessage('user', message)] };
    setDrafts(ds => ds.map(item => item.id === next.id ? next : item));
    begin(next, 'create');
  }
  function sendInstruction() {
    if (!draft || hasRunning) return;
    const message = composer.trim();
    if (!message) return;
    if (draft.plan && /^(按这个方案开始构建[。！!]?|开始构建[。！!]?|确认方案[。！!]?)$/.test(message)) {
      setInstructions(values => ({ ...values, [draft.id]: '' })); approvePlan(message); return;
    }
    if (awaitingApproval && /^(先不改|取消构建|暂不构建)[。！!]?$/.test(message)) {
      setDrafts(ds => ds.map(item => item.id === draft.id ? { ...item, planPending: false, plan: item.generated ? item.skillPlan ?? planFor({ ...item, planPending: false, plan: undefined, brief: item.description }) : item.plan, messages: [...(item.messages ?? []), chatMessage('user', message), chatMessage('assistant', '先保留当前文件，不执行构建。你可以继续讨论或之后再确认。')] } : item));
      setInstructions(values => ({ ...values, [draft.id]: '' })); return;
    }
    const next: Draft = { ...draft, brief: `${draft.brief}\n\n本轮补充：${message}`, messages: [...(draft.messages ?? []), chatMessage('user', message)] };
    const needsPlan = !draft.generated || !!draft.planPending || scopeChangeFor(message) && draft.skillPlan?.format !== 'json';
    if (needsPlan && !draft.planPending) next.plan = undefined;
    setDrafts(ds => ds.map(item => item.id === next.id ? next : item));
    begin(next, needsPlan ? 'plan' : 'create', false, next.agent, !needsPlan);
    setInstructions(values => ({ ...values, [draft.id]: '' }));
  }
  function stopRun() {
    if (!activeRun || !draft) return;
    setRun({ ...activeRun, phase: 'stopped', finishedAt: Date.now() });
    setDrafts(ds => ds.map(item => item.id === draft.id ? { ...item, messages: [...(item.messages ?? []), chatMessage('assistant', '已停止本轮处理，现有文件保留。你可以继续告诉我如何调整。')] } : item));
  }
  const availableFiles: WorkspaceFile[] = draft ? [...(draft.plan ? ['plan' as const] : []), ...(draft.generated ? ['skill' as const, 'template' as const] : []), ...(draft.review ? ['review' as const] : [])] : [];
  const selectedFile = availableFiles.includes(workspace.file) ? workspace.file : availableFiles[0];
  const contents = draft && selectedFile ? selectedFile === 'plan' ? planDocument(draft) : selectedFile === 'skill' ? documentFor(draft) : selectedFile === 'template' ? templateFor(draft) : reviewDocument(draft) : '';
  const selectedPath = selectedFile && draft ? selectedFile === 'plan' ? 'PLAN.md' : selectedFile === 'review' ? 'review/review.md' : `skill/${draft.skill}/${selectedFile === 'template' ? 'references/' : ''}${fileNames[selectedFile]}` : '';
  const pathFor = (file: WorkspaceFile) => file === 'plan' ? 'PLAN.md' : file === 'review' ? 'review/review.md' : `skill/${draft?.skill}/${file === 'template' ? 'references/' : ''}${fileNames[file]}`;
  const workbench = draft ? <WorkshopWorkbench id={draft.id} agent={draft.agent} agentName={names[draft.agent]} messages={(draft.messages ?? []).map(message => ({ ...message, files: message.files?.map(pathFor) }))} files={availableFiles.map(file => ({path:pathFor(file),readable:true}))} onRefreshFiles={()=>toast.success('文件已刷新')} workspace={{...workspace,file:selectedPath}} onWorkspace={change=>{const file=change.file?availableFiles.find(file=>pathFor(file)===change.file):undefined;updateWorkspace({...(change.filesOpen!==undefined?{filesOpen:change.filesOpen}:{}),...(file?{file}:{})});if(change.filesOpen===false)fileToggle.current?.focus();}} content={contents} input={composer} onInput={value=>setInstructions(values=>({...values,[draft.id]:value}))} onSend={sendInstruction} onStop={stopRun} onConfirm={awaitingApproval?()=>approvePlan():undefined} running={isRunning} activity={isRunning?`${events[Math.min(activeRun.step,events.length-1)]} · ${elapsed} 秒`:undefined} disabled={!!otherRunning} onCopy={text=>void copy(text)} onOpenExternal={url=>window.open(url,'_blank','noopener,noreferrer')} zh scrolls={chatScroll.current}/> : null;
  function installDraft() { if (draft) { setInstallStep(0); setInstallSelected(true); setAgents([draft.agent]); setInstall(true); } }
  const detail = draft ? <SkillDetail><SkillDetailHeader title={draft.generated?draft.skill:draft.title} description={draft.creationDescription||draft.description} backLabel={backLabel} onBack={goBack} actions={<><Button variant="outline" onClick={() => startWorkbench(draft)}><AppWindowIcon data-icon="inline-start" />工作台</Button>{draft.generated ? <Button disabled={isRunning} onClick={installDraft}><PlusIcon data-icon="inline-start" />安装技能</Button> : null}{draftMenu(draft)}</>} />
    <SkillDetailMetadata><div className="flex flex-col gap-2"><dt className="shrink-0 text-muted-foreground"><Hint text="显示名称" focusable><span className="inline-flex"><TypeIcon className="size-4" aria-hidden="true"/><span className="sr-only">显示名称</span></span></Hint></dt><dd>{draft.title}</dd></div><div className="flex flex-col gap-2"><dt className="shrink-0 text-muted-foreground"><Hint text="创作来源" focusable><span className="inline-flex"><BotIcon className="size-4" aria-hidden="true"/><span className="sr-only">创作来源</span></span></Hint></dt><dd className="flex items-center gap-2"><AgentLogo name={draft.agent} size={16} />{names[draft.agent]}</dd></div>{draft.generated ? <div className="flex flex-col gap-2"><dt className="text-xs text-muted-foreground">目录</dt><dd><DirectoryLink path={skillFor(draft).path} home="" zh onOpen={()=>toast('演示目录：'+skillFor(draft).path)}/></dd></div> : null}<div className="flex flex-col gap-2"><dt className="text-xs text-muted-foreground">更新时间</dt><dd>{draft.updated}</dd></div></SkillDetailMetadata>
    {draft.generated ? <SkillDocument key={`${draft.id}:${screen?.review ? 'review' : 'preview'}`} content={documentFor(draft)} defaultView={screen?.review && draft.review ? 'review' : undefined} additionalViews={draft.review ? [{ id: 'review', label: '评估', icon: <ClipboardCheckIcon aria-hidden="true" />, content: <SkillMarkdown content={reviewDocument(draft)} zh onOpenExternal={url => window.open(url, '_blank', 'noopener,noreferrer')} /> }] : []} zh onOpenExternal={url => window.open(url, '_blank', 'noopener,noreferrer')} /> : <Empty><EmptyHeader><EmptyTitle>尚未构建技能</EmptyTitle><EmptyDescription>开始构建后，可在这里查看生成的技能。</EmptyDescription></EmptyHeader></Empty>}
  </SkillDetail> : null;
  return <TooltipProvider><a className="skip-link" href="#workshop-main">跳到主要内容</a><SidebarProvider className="app-shell bg-sidebar">
    <Sidebar collapsible="icon" className="app-navigation">
      <SidebarHeader className="app-brand px-3.5 pb-4 pt-5"><div className="flex min-w-0 items-center gap-2.5"><img src={appIcon} alt="" width={28} height={28} className="size-7 rounded-md" /><span className="truncate font-medium group-data-[collapsible=icon]:hidden">Skills Space</span></div></SidebarHeader>
      <SidebarContent className="gap-2 px-1.5"><SidebarGroup><SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton disabled><ShoppingBagIcon /><span>技能商店</span></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton disabled><LayoutGridIcon /><span>技能空间</span></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton isActive onClick={() => setScreens([])} tooltip="创意工坊"><LightbulbIcon /><span>创意工坊</span></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></SidebarGroup><SidebarGroup><SidebarGroupLabel>全局管理</SidebarGroupLabel><SidebarMenu>{(['pi','codex','Hermes Agent','DeepSeek Harness']).map(name => <SidebarMenuItem key={name}><SidebarMenuButton disabled><AgentLogo name={name} size={18} /><span>{name === 'pi' ? 'Pi' : name === 'codex' ? 'Codex' : name}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroup><SidebarGroup><SidebarGroupLabel>项目管理</SidebarGroupLabel><SidebarMenu><SidebarMenuItem><SidebarMenuButton disabled><FolderIcon /><span>示例项目</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroup></SidebarContent>
      <SidebarFooter className="gap-3 px-3 pb-4"><div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">原型 · 示例数据</span><Hint text={dark ? '切换浅色' : '切换深色'}><Button variant="ghost" size="icon-sm" aria-label={dark ? '切换浅色' : '切换深色'} onClick={() => setDark(!dark)}>{dark ? <SunIcon /> : <MoonIcon />}</Button></Hint></div><Button variant="ghost" size="sm" onClick={reset}><RotateCcwIcon />重置演示</Button></SidebarFooter>
    </Sidebar>
    <SidebarInset className="desktop-content relative"><SidebarTrigger className="absolute left-2 top-0" aria-label="展开或收起侧栏" /><main ref={main} id="workshop-main" className="app-content w-full min-w-0" tabIndex={-1}><div className="app-page mx-auto w-full min-w-0" style={isWorkbench ? { maxWidth: "none", paddingInline: "1.5rem", paddingBottom:"1rem", height:"100%", display:"flex", flexDirection:"column" } : undefined}>
      <div className="mb-5 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>交互原型 · 未连接真实 Agent</span>{runningDraft ? <Button variant="ghost" size="sm" onClick={() => openDraft(runningDraft.id, 'workbench')}>返回运行中的对话</Button> : null}</div>

      {!draft ? <section className="inventory-content flex flex-col gap-6"><h1>创意工坊</h1><InventoryToolbar><div className="flex min-w-0 flex-1"><Input autoComplete="off" name="workshop-search" aria-label="搜索创作" placeholder="搜索创作…" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="flex items-center gap-2"><Button variant="ghost" onClick={() => toast.success('示例内容已刷新。')}><RefreshCwIcon data-icon="inline-start" />刷新</Button><Button onClick={() => openForm()}><PlusIcon data-icon="inline-start" />新建技能</Button></div></InventoryToolbar>
        {visible.length ? <div className="skill-grid grid auto-rows-fr gap-4">{visible.map(d => {
          const name=d.title;
          return <InventoryCard key={d.id} onOpen={() => openDraft(d.id)} className="flex flex-col">
            <InventoryCardHeader heading={<div className="flex min-w-0 items-center gap-1"><button type="button" className="block min-w-0 cursor-pointer text-left" aria-label={`查看技能 ${name}`} onClick={() => openDraft(d.id)}><OverflowText text={name} className="block min-w-0 truncate"/></button><Hint text="编辑信息"><Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100" aria-label={`编辑信息 ${name}`} onClick={()=>openForm(d)}><PencilIcon/></Button></Hint></div>} description={<button type="button" className="block w-full min-w-0 cursor-pointer text-left" aria-label={`查看技能 ${name}`} onClick={() => openDraft(d.id)}><OverflowText text={d.creationDescription||d.description} className="line-clamp-2 min-h-10 leading-5"/></button>}/>
            <InventoryCardFooter metadata={<Hint text={`${d.updated}更新`} focusable><span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">{d.generated?<ClockIcon className="size-3.5 shrink-0" aria-hidden="true"/>:<FileTextIcon className="size-3.5 shrink-0" aria-hidden="true"/>}<span className="truncate">{d.generated?d.updated:'草稿'}</span></span></Hint>}>
              <Hint text="原型未连接文件系统" disabled><Button variant="ghost" size="icon-sm" disabled aria-label={`打开目录 ${name}`}><FolderOpenIcon/></Button></Hint>
              <Hint text="工作台"><Button variant="ghost" size="icon-sm" aria-label={`工作台 ${name}`} onClick={()=>startWorkbench(d)}><AppWindowIcon/></Button></Hint>
              {d.generated?<Hint text="安装技能"><Button variant="ghost" size="icon-sm" disabled={hasRunning} aria-label={`安装技能 ${name}`} onClick={()=>{openDraft(d.id);setInstallStep(0);setInstallSelected(true);setAgents([d.agent]);setInstall(true);}}><PackagePlusIcon/></Button></Hint>:null}
            </InventoryCardFooter>
          </InventoryCard>;
        })}</div> : <Empty><EmptyHeader><EmptyTitle>{drafts.length ? '没有找到创作' : '创建你的第一个技能'}</EmptyTitle><EmptyDescription>{drafts.length ? '换个关键词，或清空搜索查看全部创作。' : '写下提示词，让智能体帮你创建技能。'}</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={() => drafts.length ? setQuery('') : openForm()}>{drafts.length ? '清空搜索' : '新建技能'}</Button></EmptyContent></Empty>}
      </section> : isWorkbench ? <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"><SkillDetailHeader title={draft.title} backLabel={backLabel} onBack={goBack} actions={<><Button ref={fileToggle} variant="outline" aria-label="展开文件区" aria-expanded={workspace.filesOpen} aria-controls="workshop-files-panel" onClick={() => updateWorkspace({ filesOpen: true })}><FolderIcon data-icon="inline-start"/>文件</Button>{draft.generated ? <Button variant="outline" onClick={() => openDraft(draft.id)}><EyeIcon data-icon="inline-start" />查看技能</Button> : null}<Button variant="outline" onClick={()=>toast('演示目录：'+skillFor(draft).path)}><FolderOpenIcon data-icon="inline-start"/>打开目录</Button>{draftMenu(draft)}</>} />{workbench}</section> : detail}
    </div></main></SidebarInset>
    <Modal compact title={form?.id?'编辑信息':'新建技能'} open={!!form} onClose={closeForm}>{form ? <FieldGroup><Field><FieldLabel htmlFor="draft-title">名称</FieldLabel><Input id="draft-title" value={form.title} maxLength={80} autoComplete="off" placeholder="例如：会议纪要整理" onChange={e => setForm({ ...form, title: e.target.value })} /></Field><Field><FieldLabel htmlFor="draft-description">描述</FieldLabel><Textarea id="draft-description" rows={2} value={form.description} maxLength={1000} onChange={event=>setForm({...form,description:event.target.value})}/></Field>{!form.id?<><Field><FieldLabel htmlFor="draft-brief">提示词</FieldLabel><Textarea id="draft-brief" rows={5} className="resize-y" value={form.brief} maxLength={8000} placeholder="希望技能解决什么问题？需要保留哪些规则？" onChange={e => setForm({ ...form, brief: e.target.value })} /></Field><Field><FieldLabel id="creator-label">选择智能体</FieldLabel><Select value={form.agent} onValueChange={value => { if (value === 'pi' || value === 'codex') setForm({ ...form, agent: value }); }}><SelectTrigger aria-labelledby="creator-label" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{(['pi','codex'] as const).map(id => <SelectItem key={id} value={id}><AgentLogo name={id} size={16} />{names[id]}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></>:null}<ModalActions><Button variant="outline" onClick={closeForm}>取消</Button><Button disabled={!form.title.trim() || !form.id&&(!form.brief.trim() || hasRunning)} onClick={saveForm}>{form.id?'保存':'开始对话'}</Button></ModalActions></FieldGroup> : null}</Modal>
    <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>放弃未保存的需求？</AlertDialogTitle><AlertDialogDescription>这次输入的修改不会保存。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><AlertDialogAction onClick={() => { setDiscard(false); setForm(null); }}>放弃修改</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={!!removing} onOpenChange={open => { if (!open) setRemoving(null); }}><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>删除这条创作？</AlertDialogTitle><AlertDialogDescription>从本次演示中移除“{removing?.title}”。不会操作磁盘或卸载技能。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { setDrafts(ds => ds.filter(d => d.id !== removing?.id)); setScreens(values => values.filter(item => item.id !== removing?.id)); if (run?.draft === removing?.id) setRun(null); setRemoving(null); }}>删除创作</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Modal compact title="评估技能" open={reviewing} onClose={() => setReviewing(false)}><FieldGroup><Field><FieldLabel>评估对象</FieldLabel><p className="text-sm">{draft?.title}</p></Field><Field><FieldLabel id="review-agent-label">评估 Agent</FieldLabel><Select value={reviewAgent} onValueChange={v => { if (v === 'pi' || v === 'codex') setReviewAgent(v); }}><SelectTrigger aria-labelledby="review-agent-label"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{(['pi','codex'] as const).map(id => <SelectItem key={id} value={id}>{names[id]}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel id="review-scope-label">评估范围</FieldLabel><Select value={reviewFull ? 'full' : 'structure'} onValueChange={v => setReviewFull(v === 'full')}><SelectTrigger aria-labelledby="review-scope-label"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="structure">结构评估</SelectItem><SelectItem value="full" disabled={!draft?.evidence}>结构与实际任务</SelectItem></SelectGroup></SelectContent></Select>{!draft?.evidence ? <FieldDescription>这条创作还没有实际任务输出。</FieldDescription> : null}</Field><ModalActions><Button variant="outline" onClick={() => setReviewing(false)}>取消</Button><Button disabled={hasRunning} onClick={() => { if (draft) begin(draft,'review',reviewFull,reviewAgent); setReviewing(false); }}>开始评估</Button></ModalActions></FieldGroup></Modal>
    <Modal title="试用技能" open={trial} onClose={() => setTrial(false)}><FieldGroup><Field><FieldLabel htmlFor="trial-task">实际任务</FieldLabel><Textarea id="trial-task" rows={4} value={task} onChange={e => { setTask(e.target.value); setTrialResult(false); }} placeholder="输入一个你希望技能处理的任务…" /></Field>{trialResult ? <Field><FieldLabel>{names[draft?.agent ?? "pi"]} 的试用结果</FieldLabel><p className="text-sm leading-7">已整理输入中的明确事项；没有确认的内容保留为待确认。这是原型示例输出，未调用真实 Agent。</p></Field> : null}<ModalActions><Button variant="outline" onClick={() => setTrial(false)}>关闭</Button>{trialResult ? <Button onClick={() => { setDrafts(ds => ds.map(d => d.id === selected ? { ...d, evidence: true } : d)); setTrial(false); toast.success('已保存演示任务记录。'); }}>保留任务记录</Button> : <Button disabled={!task.trim()} onClick={() => setTrialResult(true)}><PlayIcon />演示试用</Button>}</ModalActions></FieldGroup></Modal>
    <Modal title="安装技能" description="复用现有安装组件；本原型只演示流程，不会安装技能。" open={install} onClose={() => setInstall(false)} bodyStep={installStep}><div className="flex flex-col gap-5"><StepIndicator steps={['安装来源','技能','安装目标','确认','结果']} current={installStep} />{draft ? installStep === 0 ? <FieldGroup><Field><FieldLabel>安装来源</FieldLabel><p className="text-sm">本地目录</p></Field><Field><FieldLabel>技能目录</FieldLabel><Input readOnly value={skillFor(draft).path} aria-label="待安装技能目录" /></Field></FieldGroup> : installStep === 1 ? <InstallSkillOption skill={skillFor(draft)} checked={installSelected} disabled={false} zh onChange={setInstallSelected} /> : installStep === 2 ? <FieldGroup><Field><FieldLabel id="install-scope-label">安装范围</FieldLabel><Select value={scope} onValueChange={v => { if (v === 'global' || v === 'project') setScope(v); }}><SelectTrigger aria-labelledby="install-scope-label"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="global">全局</SelectItem><SelectItem value="project">项目 · 示例项目</SelectItem></SelectGroup></SelectContent></Select></Field><Field><FieldLabel>Agent</FieldLabel><AgentPicker home="~" agents={mockAgents} selected={agents} onChange={setAgents} zh disabled={false} /></Field><InstallModeField mode={installMode} onChange={setInstallMode} zh disabled={false} /></FieldGroup> : installStep === 3 ? <InstallReview source={skillFor(draft).path} target={target} skills={[skillFor(draft)]} agents={mockAgents.filter(a => agents.includes(a.id))} mode={installMode} home="~" zh eveSubagents={[]} /> : <Empty><EmptyHeader><EmptyTitle>安装流程演示结束</EmptyTitle><EmptyDescription>没有向任何 Agent 目录写入文件。</EmptyDescription></EmptyHeader></Empty> : null}<ModalActions>{installStep > 0 && installStep < 4 ? <Button variant="outline" onClick={() => setInstallStep(installStep - 1)}>上一步</Button> : null}<Button variant="outline" onClick={() => setInstall(false)}>{installStep === 4 ? '完成' : '取消'}</Button>{installStep < 4 ? <Button disabled={installStep === 1 && !installSelected || installStep === 2 && !agents.length} onClick={() => setInstallStep(installStep + 1)}>{installStep === 0 ? '检查来源' : installStep === 3 ? '演示安装结果' : '下一步'}</Button> : null}</ModalActions></div></Modal>
  </SidebarProvider><Toaster theme={dark ? "dark" : "light"} /></TooltipProvider>;
}
