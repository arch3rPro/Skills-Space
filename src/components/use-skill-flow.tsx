import { Hint } from "@/components/hint";
import { notifySuccess, useFeedbackError } from "@/lib/notifications";
import { formatExecutionLog } from "@/lib/execution-log";
import { OverflowText } from "@/components/overflow-text";
import { FlowError } from "@/components/flow-error";
import { SourceField } from "@/components/source-field";
import { ModalActions } from "@/components/modal";
import { StepIndicator } from "@/components/step-indicator";
import { cn } from "@/lib/utils";
import { useEffect, useId, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { displayHomePath, expandHomePath, type Inspection, type Target } from "@/lib/upstream";
import { useSessionNeedsPolling, type UseAgent, type UseInput, type UsePlan, type UseSession } from "@/lib/use";

type Props = { source: string; skill: string; target: Target; home: string; projects: string[]; zh: boolean; icon: (id: string) => ReactNode; onBusy: (busy: boolean) => void };
export function UseSkillFlow(props: Props) {
  const id = useId();
  const t = (zh: string, en: string) => props.zh ? zh : en;
  const path = (value: string) => displayHomePath(value, props.home);
  const [source, setSource] = useState(props.source);
  const [internal, setInternal] = useState(false);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [skill, setSkill] = useState(props.skill);
  const [target, setTarget] = useState(props.target);
  const [mode, setMode] = useState<"prompt" | "agent">("prompt");
  const [agent, setAgent] = useState<string | null>(null);
  const [agents, setAgents] = useState<UseAgent[]>([]);
  const [plan, setPlan] = useState<UsePlan | null>(null);
  const [session, setSession] = useState<UseSession | null>(null);
  const [sessions, setSessions] = useState<UseSession[]>([]);
  const [risk, setRisk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, setError] = useFeedbackError(props.zh);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState(0);
  const refresh = async () => { try { setSessions(await invoke<UseSession[]>("upstream_use_sessions")); } catch (reason) { setError(String(reason),t("会话列表读取失败，请重新打开测试窗口。","Could not read sessions. Reopen the test window.")); } };
  useEffect(() => { let active = true; void Promise.all([invoke<UseAgent[]>("upstream_use_agents"), invoke<UseSession[]>("upstream_use_sessions")]).then(([a, s]) => { if (active) { setAgents(a); setSessions(s); } }).catch((reason: unknown) => { if (active) setError(String(reason),t("测试环境读取失败，请重新打开测试窗口。","Could not read the test environment. Reopen the test window.")); }); return () => { active = false; }; }, []);
  useEffect(() => { if (!session || !useSessionNeedsPolling(session)) return; let active = true; let pending = false; const id = session.plan.id; const timer = window.setInterval(() => { if (pending) return; pending = true; void invoke<UseSession>("upstream_use_session", { id }).then((next) => { if (active) setSession(next); }).catch((reason: unknown) => { if (active) setError(String(reason),t("会话状态读取失败，正在重试。","Could not read session status. Retrying.")); }).finally(() => { pending = false; }); }, 1000); return () => { active = false; window.clearInterval(timer); }; }, [session?.plan.id, session?.status.phase, session?.canRelease]);
  async function action(work: () => Promise<void>, failure: string) { setBusy(true); props.onBusy(true); setError(""); try { await work(); } catch (reason) { setError(String(reason),failure); } finally { setBusy(false); props.onBusy(false); } }
  async function inspect() { await action(async () => { const next = await invoke<Inspection>("upstream_inspect", { source, includeInternal: internal }); setInspection(next); setSource(next.source); setSkill(next.skillFilter ? next.skills[0]?.name ?? "" : next.skills.some((s) => s.name === skill) ? skill : ""); setStep(1); }, t('来源读取失败，请点击“检查来源”。', 'Could not read the source. Click Inspect source.')); }
  async function prepare() { await action(async () => { const selected = inspection?.skills.find((s) => s.name === skill); if (!selected) throw new Error(t("请选择一个技能。", "Choose one skill.")); const input: UseInput = { target, source, skill, includeInternal: internal, mode, agent: mode === "agent" ? agent : null, sourceFingerprint: selected.selectionFingerprint }; const next = await invoke<UsePlan>("upstream_use_prepare", { input }); setPlan(next); setRisk(false); setStep(2); await refresh(); }, t('会话准备失败，请点击“下一步”重试。', 'Could not prepare the session. Click Next to retry.')); }
  async function start() { if (!plan) return; await action(async () => { setSession(await invoke<UseSession>("upstream_use_start", { id: plan.id, acceptRisks: risk })); setStep(3); await refresh(); }, t('会话启动未完成，请重新确认启动。', 'The session did not start. Confirm start again.')); }
  async function load(id: string) { await action(async () => { setSession(await invoke<UseSession>("upstream_use_session", { id })); setPlan(null); setStep(3); setCopied(false); }, t('会话读取失败，请重新选择该会话。', 'Could not read the session. Select it again.')); }
  async function release(id: string) { await action(async () => { await invoke("upstream_use_release", { id }); if (session?.plan.id === id) setSession(null); if (plan?.id === id) setPlan(null); setStep(0); setCopied(false); await refresh(); }, t('临时文件未释放，请再次点击“释放临时文件”。', 'Temporary files were not released. Click Release temporary files again.')); }
  const phase = (value: string) => ({ planned: t("未启动", "Not started"), waiting: t("等待启动", "Waiting to start"), preparing: t("正在准备技能", "Preparing skill"), ready: t("提示词已生成", "Prompt ready"), running: t("Agent 运行中", "Agent running"), background: t("会话已退出，关联进程仍在运行", "Session exited; related processes still running"), exited: t("会话已结束", "Session exited"), failed: t("启动或执行失败", "Start or execution failed"), stopping: t("正在停止", "Stopping"), cancelled: t("已停止", "Stopped"), interrupted: t("无法确认进程是否仍在运行", "Process status unavailable") }[value] ?? value);
  return <div className="flex flex-col gap-5">
    <StepIndicator steps={[t("来源", "Source"),t("技能与运行方式", "Skill and mode"),t("确认", "Confirm"),t("会话", "Session")]} current={step} />
    {step === 0 && <>
      <SourceField zh={props.zh} disabled={busy} value={path(source)} onChange={value => setSource(expandHomePath(value,props.home))} onBrowse={() => void action(async () => {const chosen = await open({directory:true});if(typeof chosen === "string") setSource(chosen);}, t("目录选择器无法打开，请直接输入路径。","Could not open the folder picker. Enter the path directly."))} />
      <details><summary className="cursor-pointer text-xs text-muted-foreground">{t("更多设置", "More settings")}</summary><div className="mt-3 flex flex-col gap-2"><label className="flex items-center gap-2 text-sm"><Checkbox checked={internal} disabled={busy} onCheckedChange={(value) => { setInternal(value === true); setInspection(null); setSkill(""); }} />{t("显示内部技能", "Show internal skills")}</label><p className="text-xs text-muted-foreground">{t("显示来源中默认隐藏的内部技能，供选择测试", "Show skills hidden by default in this source for testing.")}</p></div></details>
      <p className="text-xs text-muted-foreground">{t("测试不会安装到 Agent 技能目录。", "Testing does not install skills into Agent skill directories.")}</p>
      <ModalActions><Button disabled={busy || !source.trim()} onClick={() => void inspect()}>{busy ? t("正在检查…", "Inspecting…") : t("检查来源", "Inspect source")}</Button></ModalActions>
      {!!sessions.length && <div className="flex flex-col gap-2 border-t pt-4"><p className="text-sm font-medium">{t("保留的临时会话", "Retained temporary sessions")}</p>{sessions.map((s) => <Button key={s.plan.id} variant="outline" className="h-auto w-full justify-between text-left" disabled={busy} onClick={() => void load(s.plan.id)}><span className="truncate">{s.plan.skill} · {s.plan.agent ?? t("提示词", "Prompt")}</span><span className="text-xs text-muted-foreground">{phase(s.status.phase)}</span></Button>)}</div>}
    </>}
    {step === 1 && <>
      <FieldGroup>
        <FieldSet><FieldLegend variant="label">{t("选择技能", "Choose a skill")}</FieldLegend>
          <RadioGroup aria-label={t("选择测试技能", "Choose a skill to test")} value={skill} disabled={busy} onValueChange={setSkill} className="gap-0 rounded-lg border border-border/60">
            {inspection?.skills.map((s,index)=><label key={s.name} htmlFor={`${id}-skill-${index}`} className={cn("flex min-w-0 cursor-pointer items-center gap-4 border-b border-border/50 px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/50 focus-within:bg-muted/50",skill===s.name&&"bg-primary/5",busy&&"pointer-events-none opacity-50")}>
              <RadioGroupItem id={`${id}-skill-${index}`} value={s.name} aria-label={s.name} />
              <span className="min-w-0 flex-1"><OverflowText className="block truncate text-sm font-medium" text={s.name} /><OverflowText className="mt-1 block truncate text-xs leading-5 text-muted-foreground" text={s.description||t("暂无描述","No description")} />{s.pluginName&&<span className="mt-1 block truncate text-xs text-muted-foreground">{s.pluginName}</span>}</span>
            </label>)}
          </RadioGroup>
        </FieldSet>
        <Field><FieldLabel htmlFor={`${id}-directory`}>{t("工作目录", "Working directory")}</FieldLabel><Select disabled={busy} value={target.projectPath ?? "global"} onValueChange={value=>setTarget(value==="global"?{host:"local",scope:"global",projectPath:null}:{host:"local",scope:"project",projectPath:value})}><SelectTrigger id={`${id}-directory`}><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="global">{t("用户目录", "Home directory")} · ~</SelectItem>{props.projects.map(p=><SelectItem key={p} value={p}>{path(p)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <FieldSet><FieldLegend variant="label">{t("运行方式", "Run mode")}</FieldLegend>
          <RadioGroup aria-label={t("运行方式", "Run mode")} value={mode==="prompt"?"prompt":agent?`agent:${agent}`:""} disabled={busy} onValueChange={value=>{if(value==="prompt"){setMode("prompt");setAgent(null);}else{setMode("agent");setAgent(value.slice(6));}}}>
            <label htmlFor={`${id}-prompt`} className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5 text-sm has-disabled:cursor-default has-disabled:opacity-50"><RadioGroupItem id={`${id}-prompt`} value="prompt" disabled={!!agents.length&&!agents.some(a=>a.promptSupported)} />{t("生成提示词", "Generate prompt")}</label>
            {agents.map(a=><label key={a.id} htmlFor={`${id}-agent-${a.id}`} className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5 text-sm has-disabled:cursor-default has-disabled:opacity-50"><RadioGroupItem id={`${id}-agent-${a.id}`} value={`agent:${a.id}`} disabled={!a.path||!a.terminalSupported} />{props.icon(a.id)}<span className="min-w-0"><span className="block truncate">{a.name}</span><Hint text={a.path?path(a.path):undefined} focusable><span className="block truncate text-xs text-muted-foreground">{a.path&&!a.terminalSupported?t("此平台暂不支持系统终端启动","System terminal launch is unavailable on this platform"):a.path?path(a.path):t("未找到可执行命令","Executable command not found")}</span></Hint></span></label>)}
          </RadioGroup>
        </FieldSet>
      </FieldGroup>
      <ModalActions><Button variant="outline" disabled={busy} onClick={() => setStep(0)}>{t("上一步", "Back")}</Button><Button disabled={busy || !skill || mode === "agent" && !agent || mode === "prompt" && !!agents.length && !agents.some((a) => a.promptSupported)} onClick={() => void prepare()}>{busy ? t("正在准备…", "Preparing…") : t("下一步", "Next")}</Button></ModalActions>
    </>}
    {step === 2 && plan && <>
      <div className="flex flex-col gap-3 rounded-lg bg-muted/30 p-4 text-sm"><p>{t("来源", "Source")}：{path(plan.source)}</p><p>{t("技能", "Skill")}：{plan.skill}</p><p>{t("工作目录", "Working directory")}：{path(plan.workingDirectory)}</p><p>{t("运行方式", "Mode")}：{plan.mode === "prompt" ? t("生成提示词", "Generate prompt") : agents.find((a) => a.id === plan.agent)?.name ?? plan.agent}</p><p className="text-xs text-muted-foreground">{plan.mode === "agent" ? t("在系统终端运行，可能修改工作目录中的文件。", "Runs in the system terminal and may modify files in the working directory.") : t("提示词可复制；临时文件保留至点击“释放临时文件”。", "Copy the prompt if needed. Temporary files remain until Release temporary files is clicked.")}</p></div>
      {plan.riskRequired && <label className="flex items-start gap-2 text-sm text-destructive"><Checkbox checked={risk} disabled={busy} onCheckedChange={(v) => setRisk(v === true)} />{t("已了解 OpenClaw 社区技能未经验证、可能执行有害操作，确认仍要使用。", "I understand OpenClaw community skills are unverified and may perform harmful actions, and choose to continue.")}</label>}
      <ModalActions><Button variant="outline" disabled={busy} onClick={() => void action(async () => { await invoke("upstream_use_release", { id: plan.id }); setPlan(null); setStep(1); await refresh(); },t("临时文件未释放，请再次点击“上一步”。","Temporary files were not released. Click Back again."))}>{t("上一步", "Back")}</Button><Button disabled={busy || plan.riskRequired && !risk} onClick={() => void start()}>{busy ? t("正在启动…", "Starting…") : plan.mode === "prompt" ? t("确认生成", "Generate prompt") : t("确认启动", "Start Agent")}</Button></ModalActions>
    </>}
    {step === 3 && session && <>
      <div className="flex flex-col gap-2 rounded-lg bg-muted/30 p-4 text-sm"><p className="font-medium">{session.plan.skill} · {phase(session.status.phase)}</p><p>{t("工作目录", "Working directory")}：{path(session.plan.workingDirectory)}</p>{session.status.exitCode !== null && <p>{t("进程退出码", "Process exit code")}：{session.status.exitCode}</p>}{session.status.error && <FlowError zh={props.zh} title={t("会话执行失败", "Session execution failed")} message={path(session.status.error)} help={t("请查看诊断输出，再点击“准备新会话”。", "Read Diagnostic output, then click Prepare new session.")} />}{session.status.skillDirectory && <p className="break-all text-xs text-muted-foreground">{path(session.status.skillDirectory)}</p>}{session.plan.mode === "agent" && <p className="text-xs text-muted-foreground">{t("请在系统终端查看运行结果。", "View the result in the system terminal.")}</p>}</div>
      {session.prompt && <><pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{path(session.prompt)}</pre><Button variant="outline" disabled={busy} onClick={() => void action(async () => { await navigator.clipboard.writeText(session.prompt ?? ""); setCopied(true); notifySuccess(t("已复制", "Copied")); },t("提示词复制失败，请再次复制。","Could not copy the prompt. Copy it again."))}>{copied ? t("已复制", "Copied") : t("复制原始提示词", "Copy original prompt")}</Button><p className="text-xs text-muted-foreground">{t("提示词使用附件的实际路径。", "The prompt uses the attachments' actual paths.")}</p></>}
      <ModalActions><Button variant="outline" disabled={busy} onClick={() => void action(async () => { await invoke("upstream_use_open_directory", { id: session.plan.id }); },t("临时目录无法打开，请检查目录是否存在。","Could not open the temporary folder. Check that it exists."))}>{t("打开临时目录", "Open temporary directory")}</Button>{useSessionNeedsPolling(session) && <Button variant="outline" disabled={busy || session.status.phase === "stopping"} onClick={() => void action(async () => { setSession(await invoke<UseSession>("upstream_use_cancel", { id: session.plan.id })); },t("停止请求未完成，请再次点击“停止会话”。","Could not stop the session. Click Stop session again."))}>{t("停止会话", "Stop session")}</Button>}<Button variant="destructive" disabled={busy || !session.canRelease} onClick={() => void release(session.plan.id)}>{t("释放临时文件", "Release temporary files")}</Button><Button variant="ghost" disabled={busy} onClick={() => { setSession(null); setPlan(null); setStep(0); setCopied(false); void refresh().catch((r: unknown) => setError(String(r),t("会话列表读取失败，请重新打开测试窗口。","Could not read sessions. Reopen the test window."))); }}>{t("准备新会话", "Prepare new session")}</Button></ModalActions>
      <p className="text-xs text-muted-foreground">{t("释放后，已复制提示词中的支持文件路径将失效。关闭弹窗不会停止会话或删除文件。", "After release, supporting-file paths in copied prompts stop working. Closing this dialog does not stop sessions or delete files.")}</p>
      {session.diagnostic && <details><summary className="cursor-pointer text-xs">{t("诊断输出", "Diagnostic output")}</summary><pre className="mt-2 whitespace-pre-wrap break-all text-xs">{path(formatExecutionLog(session.diagnostic))}</pre></details>}
    </>}
  </div>;
}
