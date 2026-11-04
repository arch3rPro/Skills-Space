import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRightIcon, CopyIcon, FileTextIcon, FolderTreeIcon, LoaderCircleIcon, PlayIcon, RefreshCwIcon, SendIcon, SquareIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { AgentLogo } from '@/components/agent-logo';
import { Hint } from '@/components/hint';
import { OverflowText } from '@/components/overflow-text';
import { SkillMarkdown, SkillCodeBlock } from '@/components/skill-markdown';

export type WorkbenchWorkspace = { file: string; filesOpen: boolean };
export type WorkbenchMessage = { id: string; role: 'user' | 'assistant'; text: string; files?: string[] };
export type WorkbenchFile = { path: string; readable?: boolean };
type TreeNode = { name: string; path: string; file?: WorkbenchFile; children: TreeNode[] };

function treeFor(files: WorkbenchFile[]) {
  const root: TreeNode = { name: '', path: '', children: [] };
  for (const file of files) {
    let node = root;
    const parts = file.path.split('/');
    parts.forEach((name, index) => {
      let child = node.children.find(item => item.name === name);
      if (!child) {
        child = { name, path: parts.slice(0, index + 1).join('/'), children: [] };
        node.children.push(child);
      }
      node = child;
    });
    node.file = file;
  }
  function compact(nodes: TreeNode[]): TreeNode[] {
    return nodes.map(node => {
      let current = node;
      let name = node.name;
      while (!current.file && current.children.length === 1 && !current.children[0].file) {
        current = current.children[0];
        name += ` / ${current.name}`;
      }
      return { ...current, name, children: compact(current.children) };
    }).sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name));
  }
  return compact(root.children);
}

function FileTree({ nodes, selected, onFile, collapsed, onToggle, depth = 0 }: {
  nodes: TreeNode[]; selected: string; onFile: (file: string) => void;
  collapsed: Record<string, boolean>; onToggle: (path: string) => void; depth?: number;
}) {
  return <ul className="flex min-w-0 flex-col gap-0.5">
    {nodes.map(node => <li key={node.path} className="min-w-0">
      {node.file ? <Button variant="navigation" title={node.path}
        aria-current={node.path === selected ? 'page' : undefined}
        style={{ paddingInlineStart: 8 + depth * 12 }}
        onClick={() => onFile(node.path)}>
        <FileTextIcon aria-hidden="true" /><span className="truncate font-normal">{node.name}</span>
      </Button> : <Collapsible open={!collapsed[node.path]} onOpenChange={() => onToggle(node.path)}>
        <CollapsibleTrigger asChild>
          <Button variant="navigation" className="group/folder" title={node.path}
            style={{ paddingInlineStart: 8 + depth * 12 }}>
            <ChevronRightIcon aria-hidden="true" className="transition-transform group-data-[state=open]/folder:rotate-90 motion-reduce:transition-none" />
            <span className="truncate font-normal">{node.name}</span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <FileTree nodes={node.children} selected={selected} onFile={onFile} collapsed={collapsed} onToggle={onToggle} depth={depth + 1} />
        </CollapsibleContent>
      </Collapsible>}
    </li>)}
  </ul>;
}

export function WorkshopWorkbench({ id, agent, agentName, messages, files, workspace, onWorkspace, content, fileLoading = false, fileError = false, onFileRetry, onRefreshFiles, refreshing = false, notice, input, onInput, onSend, onStop, onConfirm, running = false, activity, disabled = false, onCopy, onOpenExternal, zh, scrolls }: {
  id: string; agent: string; agentName?: string; messages: WorkbenchMessage[]; files: WorkbenchFile[]; workspace: WorkbenchWorkspace;
  onWorkspace: (value: Partial<WorkbenchWorkspace>) => void; content: string; fileLoading?: boolean; fileError?: boolean; onFileRetry?: () => void; onRefreshFiles: () => void; refreshing?: boolean; notice?: ReactNode; input: string;
  onInput: (text: string) => void; onSend: () => void; onStop: () => void; onConfirm?: () => void; running?: boolean;
  activity?: string; disabled?: boolean; onCopy: (content: string) => void; onOpenExternal: (url: string) => void; zh: boolean;
  scrolls: Record<string, number>;
}) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const conversation = useRef<HTMLDivElement>(null), fileBody = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true), lastMessage = messages[messages.length - 1];
  const [closedFolders, setClosedFolders] = useState<Record<string, Record<string, boolean>>>({});
  const nodes = treeFor(files);
  const collapsed = closedFolders[id] ?? {};
  function selectFile(file: string) {
    setClosedFolders(previous => ({ ...previous, [id]: Object.fromEntries(Object.entries(previous[id] ?? {}).filter(([path]) => !file.startsWith(`${path}/`))) }));
    onWorkspace({ file, filesOpen: true });
  }
  useEffect(() => {
    const pane = conversation.current;
    if (pane) {
      pane.scrollTop = scrolls[`${id}:chat`] ?? pane.scrollHeight;
      nearBottom.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 80;
    }
  }, [id, scrolls]);
  useEffect(() => {
    const pane = conversation.current;
    if (pane && nearBottom.current) pane.scrollTop = pane.scrollHeight;
  }, [lastMessage?.id, lastMessage?.text, running]);
  useEffect(() => {
    if (fileBody.current && !fileLoading) fileBody.current.scrollTop = scrolls[`${id}:${workspace.file}`] ?? 0;
  }, [id, workspace.file, workspace.filesOpen, fileLoading, content, scrolls]);
  const selectedFile = files.find(file => file.path === workspace.file);

  return <div className="min-h-0 min-w-0 flex-1 overflow-x-auto" aria-label={t('技能创作工作台', 'Skill workbench')}>
    <ResizablePanelGroup orientation="horizontal" className={workspace.filesOpen ? 'min-w-[920px]' : undefined} aria-label={t('工作台分栏', 'Workbench panels')}>
      <ResizablePanel id="workshop-chat-panel" defaultSize={workspace.filesOpen ? '40%' : '100%'} minSize={workspace.filesOpen ? '40%' : '100%'}>
        <section className="mx-auto flex h-full w-full max-w-3xl min-w-0 flex-col px-4 pb-1" aria-label={t('创作对话', 'Conversation')}>
          <div className="flex h-12 shrink-0 items-center gap-2 text-sm text-muted-foreground">
            <AgentLogo name={agent} size={16} /><h2 className="font-medium text-foreground">{agentName || agent}</h2>
          </div>
          <div ref={conversation} aria-label={t('对话记录', 'Messages')} tabIndex={0}
            className="no-scrollbar flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto pb-6 pt-2"
            onScroll={event => {
              const pane = event.currentTarget;
              scrolls[`${id}:chat`] = pane.scrollTop;
              nearBottom.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 80;
            }}>
            {messages.map(message => message.role === 'user' ? <div key={message.id} className="min-w-0 max-w-[90%] self-end rounded-xl bg-muted px-4 py-3 [overflow-wrap:anywhere]">
              <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
            </div> : <div key={message.id} className="flex min-w-0 flex-col gap-3">
              <SkillMarkdown content={message.text} zh={zh} onOpenExternal={onOpenExternal} />
              {message.files?.length ? <div className="flex flex-wrap gap-2">{message.files.map(file => <Button key={file} variant="outline" size="sm" onClick={() => selectFile(file)}>
                <FileTextIcon data-icon="inline-start" />{file.split('/').pop()}
              </Button>)}</div> : null}
            </div>)}
            {notice}
            {running ? <div role="status" className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 shrink-0 animate-spin motion-reduce:animate-none" /><span className="truncate">{activity || t('正在处理…', 'Working…')}</span>
            </div> : null}
          </div>
          <Card size="sm" variant="plain" className="focus-within:bg-muted/50">
            <CardContent className="flex flex-col gap-2">
              {onConfirm ? <Button variant="outline" size="sm" className="self-start" disabled={running || disabled} onClick={onConfirm}>
                <PlayIcon data-icon="inline-start" />{t('按方案构建', 'Build this plan')}
              </Button> : null}
              <label htmlFor="workshop-message" className="sr-only">{t('发送消息', 'Send a message')}</label>
              <Textarea autoComplete="off" id="workshop-message" rows={3} variant="plain" className="max-h-40 resize-none bg-transparent" value={input} disabled={disabled} maxLength={16000}
                onChange={event => onInput(event.target.value)}
                placeholder={onConfirm ? t('告诉我方案哪里需要调整…', 'Tell me what to change in the plan…') : t('告诉我需要如何调整…', 'Tell me what to change…')}
                onKeyDown={event => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    if (!event.nativeEvent.isComposing && !running && !disabled && input.trim()) onSend();
                  }
                }} />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">⌘ / Ctrl + Enter</span>
                {running ? <Button variant="ghost" size="sm" onClick={onStop}><SquareIcon data-icon="inline-start" />{t('停止', 'Stop')}</Button> : <Button size="icon-sm" aria-label={t('发送消息', 'Send message')} disabled={disabled || !input.trim()} onClick={onSend}><SendIcon /></Button>}
              </div>
            </CardContent>
          </Card>
        </section>
      </ResizablePanel>
      {workspace.filesOpen ? <>
        <ResizableHandle variant="quiet" aria-label={t('调整对话与文件区宽度', 'Resize conversation and files')} />
        <ResizablePanel id="workshop-files-panel" defaultSize="60%" minSize="540px" maxSize="60%">
          <Card variant="plain" className="h-full min-w-0 gap-0 overflow-hidden py-0">
            <section className="h-full min-w-0" aria-label={t('文件区', 'Files')}>
              <ResizablePanelGroup orientation="horizontal" aria-label={t('预览与目录分栏', 'Preview and file tree panels')}>
              <ResizablePanel id="workshop-file-preview" defaultSize="60%" minSize="300px">
              <div className="flex h-full min-h-0 min-w-0 flex-col">
                <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-5">
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <FileTextIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <OverflowText text={workspace.file || t('文件', 'File')} displayText={workspace.file.split('/').pop() || t('文件', 'File')} className="min-w-0 truncate font-medium" />
                  </div>
                  {selectedFile && !fileLoading && !fileError && content ? <Hint text={t('复制当前文件', 'Copy current file')}>
                    <Button variant="ghost" size="icon-sm" aria-label={t('复制当前文件', 'Copy current file')} onClick={() => onCopy(content)}><CopyIcon /></Button>
                  </Hint> : null}
                </div>
                <div ref={fileBody} tabIndex={0} className="subtle-scrollbar min-h-0 min-w-0 flex-1 overflow-auto px-5 pb-8 pt-3" aria-label={t('文件内容', 'File content')}
                  onScroll={event => { if (!fileLoading) scrolls[`${id}:${workspace.file}`] = event.currentTarget.scrollTop; }}>
                  {fileLoading ? <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />{t('加载中…', 'Loading…')}</div>
                    : fileError ? <Empty><EmptyHeader><EmptyTitle>{t('文件读取失败', 'Could not read this file')}</EmptyTitle></EmptyHeader>{onFileRetry ? <Button variant="outline" onClick={onFileRetry}>{t('重新读取', 'Read again')}</Button> : null}</Empty>
                    : selectedFile?.readable === false ? <Empty><EmptyHeader><EmptyTitle>{t('此文件无法预览', 'Preview is unavailable for this file')}</EmptyTitle></EmptyHeader></Empty>
                    : selectedFile ? (/\.md$/i.test(selectedFile.path) ? <SkillMarkdown content={content} zh={zh} onOpenExternal={onOpenExternal} /> : <SkillCodeBlock code={content} language={selectedFile.path.split('.').pop()} zh={zh} wrap />)
                    : <Empty><EmptyHeader><EmptyTitle>{files.length ? t('选择文件', 'Select a file') : t('尚无文件', 'No files yet')}</EmptyTitle></EmptyHeader></Empty>}
                </div>
              </div>
              </ResizablePanel>
              <ResizableHandle variant="quiet" aria-label={t('调整预览与目录比例', 'Resize preview and file tree')} />
              <ResizablePanel id="workshop-file-tree" defaultSize="40%" minSize="216px">
              <nav className="flex h-full min-w-0 flex-col bg-muted/30" aria-label={t('工作区文件', 'Workspace files')}>
                <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
                  <CardTitle role="heading" aria-level={2} className="flex min-w-0 items-center gap-2"><FolderTreeIcon aria-hidden="true" className="size-4 shrink-0"/><span>{t('文件目录', 'File tree')}</span></CardTitle>
                  <div className="flex items-center gap-1">
                  <Hint text={t('刷新文件', 'Refresh files')}>
                    <Button variant="ghost" size="icon-sm" aria-label={t('刷新文件', 'Refresh files')} disabled={refreshing} onClick={onRefreshFiles}><RefreshCwIcon className={refreshing ? 'animate-spin motion-reduce:animate-none' : undefined} /></Button>
                  </Hint>
                  <Hint text={t('关闭文件区', 'Close files')}>
                    <Button variant="ghost" size="icon-sm" aria-label={t('关闭文件区', 'Close files')} onClick={() => onWorkspace({ filesOpen: false })}><XIcon /></Button>
                  </Hint>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 pb-4">
                  <FileTree nodes={nodes} selected={workspace.file} onFile={selectFile} collapsed={collapsed}
                    onToggle={path => setClosedFolders(previous => ({ ...previous, [id]: { ...previous[id], [path]: !previous[id]?.[path] } }))} />
                </div>
              </nav>
              </ResizablePanel>
              </ResizablePanelGroup>
            </section>
          </Card>
        </ResizablePanel>
      </> : null}
    </ResizablePanelGroup>
  </div>;
}
