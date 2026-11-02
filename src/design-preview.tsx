import { useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, ArrowUpCircleIcon, BoxIcon, CheckIcon, ChevronDownIcon, FolderIcon, GlobeIcon, LayoutGridIcon, ListChecksIcon, MoonIcon, PlusIcon, SearchIcon, Settings2Icon, ShoppingBagIcon, SunIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogBody, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { InventoryToolbar } from '@/components/inventory-toolbar';
import { InventoryCardHeader, InventoryCardFooter } from '@/components/inventory-card';
import { SkillDocument } from '@/components/skill-document';
import { Modal, ModalActions } from '@/components/modal';
import { AgentLogo } from '@/components/agent-logo';
import appIcon from '@/assets/icon.png';

const samples = [
  { name: 'frontend-design', description: '创建有辨识度、可交付的前端界面，将设计方向转化为细致的页面与组件。', source: 'anthropics/skills' },
  { name: 'shadcn', description: '查找、组合和调整 shadcn/ui 组件，复用项目既有的设计变量与交互模式。', source: 'shadcn/ui' },
  { name: 'web-design-guidelines', description: '审查界面的一致性、可访问性、键盘操作与响应式表现。', source: 'vercel-labs/agent-skills' },
  { name: 'vercel-react-best-practices', description: 'React 与 Next.js 性能实践，覆盖渲染、数据获取和资源加载。', source: 'vercel-labs/agent-skills' },
  { name: 'skill-creator', description: '创建和维护可复用技能，明确触发条件、输入、输出与执行边界。', source: 'openai/skills' },
  { name: 'systematic-debugging', description: '从复现与证据开始定位问题，逐步验证原因与修复结果。', source: 'obra/superpowers' },
  { name: 'writing-plans', description: '将确认的需求整理成具体步骤，保留清楚的验收条件和检查方式。', source: 'obra/superpowers' },
  { name: '文档整理与跨项目设计规范交接', description: '整理中英文文档、长目录与项目约定，检查较长标题和混合内容的阅读效果。', source: 'local/design-notes' },
];
type Sample = typeof samples[number];
const documentContent = `---\nname: frontend-design\ndescription: 创建可交付的前端界面\n---\n# Frontend Design\n\n将明确的设计方向转化为可使用的界面。优先理解现有项目的组件、布局和交互，再完成当前任务。\n\n## 适用场景\n\n- 创建或调整页面、组件与桌面工作区。\n- 统一导航、表单、卡片与弹窗的视觉层次。\n- 检查中文、英文与长路径混排时的可读性。\n\n## 工作方式\n\n### 1. 理解上下文\n\n确认页面的主要任务与用户操作路径，阅读现有设计规范，并选择可以复用的组件。\n\n### 2. 建立清晰层次\n\n让标题、正文、辅助信息和操作各有稳定位置。使用有限的间距与字号，避免重复的容器和说明。\n\n\`\`\`tsx\n<Card variant="inventory">\n  <CardHeader>\n    <CardTitle>frontend-design</CardTitle>\n    <CardDescription>创建可交付的前端界面。</CardDescription>\n  </CardHeader>\n</Card>\n\`\`\`\n\n### 3. 验证真实状态\n\n检查默认、悬停、焦点、选中和禁用状态。长内容保持可读，窄窗口下主要操作仍可到达。\n\n## 交付检查\n\n| 检查项 | 要求 |\n| --- | --- |\n| 内容 | 信息完整，层次清楚 |\n| 交互 | 键盘可达，焦点可见 |\n| 布局 | 长内容与大字号不遮挡操作 |\n`;

function IconHint({ label, children }: { label: string; children: React.ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

export default function DesignPreview() {
  const [dark, setDark] = useState(true);
  const [size, setSize] = useState('16');
  const [detail, setDetail] = useState<Sample | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [enabled, setEnabled] = useState(() => new Set(samples.map(s => s.name)));
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [bulk, setBulk] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const confirmationOpener = useRef<HTMLElement | null>(null);
  const [pending, setPending] = useState<Sample | null>(null);
  const [installSkill, setInstallSkill] = useState<Sample>(samples[0]);
  const [install, setInstall] = useState(false);
  const [step, setStep] = useState(0);
  const [targets, setTargets] = useState(() => new Set(['Codex']));
  const [message, setMessage] = useState('示例数据 · 操作仅影响当前预览');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.documentElement.style.fontSize = `${size}px`;
  }, [dark, size]);
  function toggle(set: Set<string>, value: string) { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); return next; }
  const visible = samples.filter(s => !removed.has(s.name) && `${s.name} ${s.description} ${s.source}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'enabled') === enabled.has(s.name)));
  function openConfirmation(skill: Sample) { confirmationOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setPending(skill); }
  function openInstall() { setInstallSkill(detail ?? samples[0]); setStep(0); setInstall(true); }
  return <TooltipProvider><div className="design-review-shell">
    <a className="skip-link" href="#preview-main">跳到主要内容</a>
    <header className="design-review-bar">
      <span className="design-review-label">设计样板 <span>01</span></span>
      <span className="design-review-status" role="status">{message}</span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>库存页</Button>
        <Button variant="ghost" size="sm" onClick={() => setDetail(samples[0])}>详情页</Button>
        <Button variant="ghost" size="sm" onClick={() => openConfirmation(samples[0])}>确认弹窗</Button>
        <Button variant="ghost" size="sm" onClick={openInstall}>安装弹窗</Button>
        <Select value={size} onValueChange={setSize}><SelectTrigger aria-label="预览字号" className="w-24"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{['14','16','18'].map(n => <SelectItem key={n} value={n}>{n}px</SelectItem>)}</SelectGroup></SelectContent></Select>
        <IconHint label={dark ? '切换浅色' : '切换深色'}><Button variant="ghost" size="icon-sm" aria-label={dark ? '切换浅色' : '切换深色'} onClick={() => setDark(!dark)}>{dark ? <SunIcon /> : <MoonIcon />}</Button></IconHint>
      </div>
    </header>
    <div className="design-workspace">
      <aside className="design-sidebar" aria-label="工作区导航">
        <div className="design-brand"><img src={appIcon} width={28} height={28} alt="" /><span>Skills Space</span></div>
        <nav className="design-sidebar-nav">
          <Button variant="ghost" onClick={() => setMessage('本轮样板覆盖库存、详情和弹窗。')}><ShoppingBagIcon data-icon="inline-start" />技能商店</Button>
          <Button variant="ghost" onClick={() => { setDetail(null); setMessage('示例数据 · 操作仅影响当前预览'); }}><LayoutGridIcon data-icon="inline-start" />技能空间</Button>
          <p className="design-nav-label">全局管理</p>
          {['Pi','Codex','Hermes Agent','DeepSeek Harness'].map(name => <Button key={name} variant="ghost" aria-current={name === 'Codex' ? 'page' : undefined} onClick={() => { setDetail(null); if (name !== 'Codex') setMessage('当前展示 Codex 库存样板，其他 Agent 待确认后推广。'); }}><AgentLogo name={name} size={18} />{name}</Button>)}
          <div className="design-nav-label flex items-center justify-between"><span>项目管理</span><IconHint label="新增项目"><Button variant="ghost" size="icon-xs" aria-label="新增项目" onClick={() => setMessage('本轮保留项目导航，仅演示库存、详情和弹窗。')}><PlusIcon /></Button></IconHint></div>
          <Button variant="ghost" onClick={() => setMessage('当前为全局库存样板。')}><FolderIcon data-icon="inline-start" />Skills Space<ChevronDownIcon data-icon="inline-end" /></Button>
          <div className="design-project-agents">{['Pi','Codex'].map(name => <Button key={name} variant="ghost" onClick={() => setMessage('项目库存将在样板确认后使用同一基线。')}><AgentLogo name={name} size={18} />{name}</Button>)}</div>
        </nav>
        <div className="design-sidebar-footer"><Button variant="ghost" onClick={() => setMessage('使用顶部预览工具切换主题和字号。')}><Settings2Icon data-icon="inline-start" />设置</Button><span>本地工作区</span></div>
      </aside>
      <main id="preview-main" tabIndex={-1} className="design-main">
        <div className={detail ? 'design-page design-detail' : 'design-page'}>
          {detail ? <>
            <div className="design-detail-back"><Button variant="ghost" size="sm" onClick={() => setDetail(null)}><ArrowLeftIcon data-icon="inline-start" />返回技能</Button></div>
            <header className="design-page-header"><div><h1>{detail.name}</h1><p>{detail.description}</p></div><Button onClick={openInstall}><PlusIcon data-icon="inline-start" />同步技能</Button></header>
            <dl className="design-detail-meta"><div><dt>来源</dt><dd><GlobeIcon aria-hidden="true" />{detail.source}</dd></div><div><dt>版本</dt><dd>8e4c2a1</dd></div><div><dt>安装位置</dt><dd>~/.agents/skills/{detail.name}</dd></div></dl>
            <SkillDocument content={detail.name === samples[0].name ? documentContent : documentContent.split('frontend-design').join(detail.name)} zh onOpenExternal={url => window.open(url, '_blank', 'noopener,noreferrer')} />
          </> : <>
            <header className="design-page-header"><div className="flex items-center gap-3"><AgentLogo name="Codex" size={36} /><div><h1>Codex</h1><p>全局管理</p></div></div></header>
            <Tabs defaultValue="managed" className="gap-6"><TabsList variant="quiet" aria-label="技能分类"><TabsTrigger value="managed">托管技能 <span className="design-count">{samples.length - removed.size}</span></TabsTrigger><TabsTrigger value="native">原生技能 <span className="design-count">0</span></TabsTrigger></TabsList>
              <TabsContent value="managed" className="flex flex-col gap-5">
                <InventoryToolbar><div className="flex items-center gap-2"><div className="design-search"><SearchIcon aria-hidden="true" /><Input aria-label="搜索技能" name="search" autoComplete="off" placeholder="搜索技能…" value={query} onChange={e => setQuery(e.target.value)} /></div><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-32" aria-label="筛选状态"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">已启用</SelectItem><SelectItem value="disabled">已停用</SelectItem></SelectGroup></SelectContent></Select></div><div className="ml-auto flex items-center gap-2"><Tooltip><TooltipTrigger asChild><Button variant="ghost" data-toolbar-priority="1" aria-label="批量选择" aria-pressed={bulk} onClick={() => { setBulk(!bulk); setSelected(new Set()); }}><ListChecksIcon data-icon="inline-start" /><span className="toolbar-secondary-label">批量选择</span></Button></TooltipTrigger><TooltipContent>批量选择</TooltipContent></Tooltip><Button onClick={openInstall}><PlusIcon data-icon="inline-start" />安装技能</Button></div></InventoryToolbar>
                {bulk && <div className="design-selection-bar"><span>已选择 {selected.size} 项</span><Button size="sm" variant="secondary" disabled={!selected.size} onClick={() => { setEnabled(previous => new Set([...previous, ...selected])); setMessage(`已在预览中启用 ${selected.size} 项`); }}>启用所选</Button></div>}
                {visible.length ? <div className="design-inventory-grid">{visible.map(skill => <Card key={skill.name} variant="inventory" data-selected={selected.has(skill.name)}>
                  <InventoryCardHeader selection={bulk ? <Checkbox aria-label={`选择 ${skill.name}`} checked={selected.has(skill.name)} onCheckedChange={() => setSelected(toggle(selected, skill.name))} /> : undefined} heading={<button className="design-card-link" onClick={() => setDetail(skill)}>{skill.name}</button>} control={<Switch aria-label={`启用 ${skill.name}`} checked={enabled.has(skill.name)} onCheckedChange={() => setEnabled(toggle(enabled, skill.name))} />} description={<span className="line-clamp-2">{skill.description}</span>} />
                  <InventoryCardFooter metadata={<><GlobeIcon className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{skill.source}</span></>}>
                    <IconHint label="查看更新"><Button variant="ghost" size="icon-sm" aria-label={`查看更新 ${skill.name}`} onClick={() => setMessage(`${skill.name} · 示例版本已是最新`)}><ArrowUpCircleIcon /></Button></IconHint>
                    <IconHint label="卸载技能"><Button variant="ghost" size="icon-sm" aria-label={`卸载 ${skill.name}`} onClick={() => openConfirmation(skill)}><Trash2Icon /></Button></IconHint>
                  </InventoryCardFooter>
                </Card>)}</div> : <Empty><EmptyHeader><EmptyTitle>没有匹配的技能</EmptyTitle><EmptyDescription>尝试其他关键词或筛选条件。</EmptyDescription></EmptyHeader></Empty>}
              </TabsContent>
              <TabsContent value="native"><Empty><EmptyHeader><EmptyTitle>暂无原生技能</EmptyTitle><EmptyDescription>此样板使用托管技能展示库存布局。</EmptyDescription></EmptyHeader></Empty></TabsContent>
            </Tabs>
          </>}
        </div>
      </main>
    </div>
    <AlertDialog open={!!pending} onOpenChange={open => { if (!open) setPending(null); }}><AlertDialogContent onCloseAutoFocus={event => { if (confirmationOpener.current?.isConnected) { event.preventDefault(); confirmationOpener.current.focus(); } }}><AlertDialogHeader><AlertDialogTitle>卸载这个技能？</AlertDialogTitle><AlertDialogDescription>将移除该技能在 Codex 中的全局安装。</AlertDialogDescription></AlertDialogHeader><AlertDialogBody><p className="font-medium">{pending?.name}</p><p className="design-path">~/.agents/skills/{pending?.name}</p></AlertDialogBody><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { if (pending) setRemoved(previous => new Set([...previous, pending.name])); setMessage('已从预览库存移除示例技能，未修改本地文件。'); setPending(null); }}>卸载</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Modal title={step === 0 ? '安装技能' : '确认安装'} description={step === 0 ? '选择要安装到的 Agent。' : '检查技能与安装位置。'} open={install} onClose={() => setInstall(false)} bodyStep={step}>
      <div className="design-install-body"><div className="design-install-skill"><BoxIcon aria-hidden="true" /><div><p>{installSkill.name}</p><span>{installSkill.source}</span></div></div>
        {step === 0 ? <fieldset className="flex flex-col gap-2"><legend className="design-field-label">Agent</legend>{['Codex','Pi','Hermes Agent','DeepSeek Harness'].map(name => <label className="design-agent-option" key={name}><AgentLogo name={name} size={24} /><div><span>{name}</span><small>已安装</small></div><Checkbox checked={targets.has(name)} onCheckedChange={() => setTargets(toggle(targets, name))} /></label>)}</fieldset> : <dl className="design-install-review"><div><dt>技能</dt><dd>{installSkill.name}</dd></div><div><dt>范围</dt><dd>全局</dd></div><div><dt>Agent</dt><dd>{[...targets].join('、')}</dd></div><div><dt>安装方式</dt><dd>复制</dd></div><div><dt>位置</dt><dd>~/.agents/skills/{installSkill.name}</dd></div></dl>}
      </div><ModalActions>{step === 1 && <Button variant="ghost" onClick={() => setStep(0)}>上一步</Button>}<Button variant="outline" onClick={() => setInstall(false)}>取消</Button><Button disabled={!targets.size} onClick={() => { if (!step) setStep(1); else { setInstall(false); setMessage('安装评审预览完成，未执行安装。'); } }}>{step ? <CheckIcon data-icon="inline-start" /> : null}{step ? '确认安装' : '下一步'}</Button></ModalActions>
    </Modal>
  </div></TooltipProvider>;
}
