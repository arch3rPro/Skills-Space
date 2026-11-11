import { useId, useState, type FormEvent } from "react";
import { AgentLogo } from "@/components/agent-logo";
import { Modal, ModalActions } from "@/components/modal";
import { InstallSourceStep, InstallSelectionStep } from "@/components/install-steps";
import { InstallModeField } from "@/components/install-mode-field";
import { InstallReview } from "@/components/install-review";
import { OperationResults } from "@/components/operation-results";
import { StepIndicator } from "@/components/step-indicator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { displayHomePath, expandHomePath, type OperationResult, type Target } from "@/lib/upstream";
import { notifyError, notifySuccess, useInstallationProgress } from "@/lib/notifications";
import type { Bootstrap, Translate } from "./client";
import { Choice } from "./choice";

export type Destination = { workspace: string | null };
export type InstallationStart = { source?: string; skills?: string[]; destination: Destination };
export type InstallPreview = { token: string; skills: { name: string; description: string; internal?: boolean }[]; skillFilter?: string | null; warnings?: string[] };
export type InstallResult = { installed: string[]; failed: boolean };

export function Installation({ config, start, preview, install, chooseDirectory, onClose, onComplete, t }: {
  config: Bootstrap; start: InstallationStart;
  preview: (source: string, destination: Destination, includeInternal: boolean) => Promise<InstallPreview>;
  install: (token: string, names: string[], destination: Destination) => Promise<InstallResult>;
  chooseDirectory: () => Promise<string | null>;
  onClose: () => void; onComplete: (target: Destination) => void; t: Translate;
}) {
  const formId = useId();
  const zh = t("zh", "en") === "zh";
  const [step, setStep] = useState(0);
  const [source, setSource] = useState(start.source ?? "");
  const [destination, setDestination] = useState(() => {
    if (start.destination.workspace && config.workspaces.some(item => item.id === start.destination.workspace && item.installable)) return start.destination;
    return { workspace: config.installGlobal ? null : config.workspaces.find(item => item.installable)?.id ?? null };
  });
  const [planDestination, setPlanDestination] = useState<Destination>();
  const [includeInternal, setIncludeInternal] = useState(false);
  const [plan, setPlan] = useState<InstallPreview>();
  const [selected, setSelected] = useState<string[]>([]);
  const [requested, setRequested] = useState(start.skills ?? []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [result, setResult] = useState<InstallResult>();
  const workspace = config.workspaces.find(item => item.id === destination.workspace);
  const eligible = destination.workspace === null ? config.installGlobal : workspace?.installable === true;
  const remaining = result ? selected.filter(name => !result.installed.includes(name)) : [];
  const installTarget: Target = { host: "local", scope: destination.workspace ? "project" : "global", projectPath: workspace ? expandHomePath(workspace.path, config.userHome) : null };
  const chosen = plan?.skills.filter(skill => selected.includes(skill.name)) ?? [];
  const agents = [{ id: "deepseek-harness", name: "DeepSeek Harness" }];
  useInstallationProgress(busy ? { stage: step === 3 ? "installing" : "checking", detail: null, completed: 0, total: step === 3 ? selected.length : 0 } : null, zh);
  const operationResult: OperationResult | undefined = result && {
    inventory: null,
    logs: result.failed && !remaining.length ? t("已确认技能存在，安装命令返回异常。", "The skills were found, but the install command reported an error.") : "",
    items: selected.map(name => ({ skill: name, status: result.installed.includes(name) ? "complete" : "failed", message: result.installed.includes(name) ? "" : t("安装未完成，请重新检查。", "Installation did not finish. Check again.") })),
  };
  function reset(preferred: string[] = []) {
    setPlan(undefined); setResult(undefined); setMessage(""); setUncertain(false); setRequested(preferred); setStep(0);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || step === 4 || step === 0 && !source.trim() || (step === 1 || step === 3) && !selected.length || (step === 2 || step === 3) && !eligible) return;
    if (step === 1) { setStep(2); return; }
    if (step === 2 && plan && planDestination?.workspace === destination.workspace) { setStep(3); return; }
    setBusy(true); setMessage(""); setUncertain(false);
    try {
      if (step === 3 && plan) {
        const response = await install(plan.token, selected, destination);
        setResult(response); setStep(4);
        if (!response.failed) notifySuccess(t(`已安装 ${response.installed.length} 项。`, `Installed ${response.installed.length} skills.`));
      } else {
        const inspectionTarget = eligible ? destination : { workspace: config.installGlobal ? null : config.workspaces.find(item => item.installable)?.id ?? null };
        const inspected = await preview(source.trim(), inspectionTarget, includeInternal);
        setPlan(inspected); setPlanDestination(inspectionTarget);
        const wanted = step === 2 ? selected : requested;
        const preferred = inspected.skills.filter(skill => wanted.includes(skill.name)).map(skill => skill.name);
        setSelected(step === 0 && !wanted.length && inspected.skillFilter ? inspected.skills.map(skill => skill.name) : preferred);
        setStep(step === 2 && preferred.length === wanted.length ? 3 : 1);
        if (wanted.length && preferred.length !== wanted.length) setMessage(t("来源中缺少部分先前选择，请重新选择。", "Some previous selections are absent. Select the available skills again."));
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const known = ['occupied', 'preview-expired', 'selection', 'installation-busy', 'destination'].includes(code);
      if (plan) setRequested(selected);
      setUncertain(step === 3 && !known);
      if (step === 3) {
        setPlan(undefined);
        setStep(code === 'destination' ? 2 : 0);
      }
      setMessage(code === 'occupied' ? t('目标已有同名技能，未继续安装。可核对目标托管技能。', 'The destination has a skill with the same name. Installation stopped; inspect managed skills at the destination.')
        : code === 'preview-expired' || code === 'selection' ? t('来源或预览已变化，请重新预览。', 'The source or preview changed. Preview it again.')
        : code === 'installation-busy' ? t('此目标正被其他技能操作使用，请稍后重新预览。', 'Another skill operation is using this destination. Preview again after it finishes.')
        : code === 'destination' ? t('安装位置已变化，请重新选择全局共享目录或项目根目录。', 'The destination changed. Select the global shared directory or a project root again.')
        : step === 3 ? t('安装结果无法确认。请先核对目标托管技能，再重新预览未完成项。', 'The installation result could not be confirmed. Inspect managed skills at the destination before previewing unfinished items again.')
          : t('无法读取来源中的可安装技能，请检查来源路径、仓库权限或网络后重试。', 'Could not read installable skills. Check the source path, repository access or connection and try again.'));
    } finally { setBusy(false); }
  }
  return <Modal open title={t("安装技能", "Install skills")} busy={busy} tall={step === 1 || step === 2} onClose={onClose} bodyStep={step}>
    <form id={formId} onSubmit={event => void submit(event)} className="flex min-w-0 flex-col gap-5">
      <StepIndicator steps={zh ? ["安装来源", "技能", "安装目标", "确认", "结果"] : ["Source", "Skills", "Targets", "Review", "Result"]} current={step} />
      {step === 0 && <InstallSourceStep zh={zh} disabled={busy} allowDownload={false} value={displayHomePath(source, config.userHome)}
        onChange={value => { setSource(expandHomePath(value, config.userHome)); reset(selected.length ? selected : requested); }}
        onBrowse={() => { void chooseDirectory().then(path => { if (path) { setSource(path); reset(selected.length ? selected : requested); } }).catch(() => notifyError(t("目录选择器无法打开，请直接输入路径。", "Could not open the folder picker. Enter the path directly."), zh)); }}
        includeInternal={includeInternal} onIncludeInternal={include => { setIncludeInternal(include); reset(selected.length ? selected : requested); }}/>}
      {step === 1 && plan && <InstallSelectionStep skills={plan.skills} selected={selected} onSelect={setSelected}
        disabled={busy} zh={zh} skillFilter={plan.skillFilter} warnings={plan.warnings?.map(warning=>displayHomePath(warning,config.userHome))}/>}
      {step === 2 && <FieldGroup>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor={`${formId}-scope`}>{t("安装范围", "Installation scope")}</FieldLabel>
            <Choice id={`${formId}-scope`} label={t("安装范围", "Installation scope")} value={destination.workspace ?? "global"} disabled={busy}
              onChange={value => { setDestination({ workspace: value === "global" ? null : value }); setMessage(""); }}
              options={[{ value: "global", label: t("全局", "Global"), disabled: !config.installGlobal }, ...config.workspaces.map(item => ({ value: item.id, label: `${item.title}  ${item.path}`, disabled: !item.installable }))]} />
          </Field>
          <InstallModeField compact zh={zh} mode="copy" copyOnly disabled={busy} onChange={() => {}} copyReason={t("DSH 使用共享安装目录，采用文件复制。", "DSH uses one shared installation folder and file copies.")} />
        </div>
        <Field orientation="horizontal"><FieldContent><FieldTitle>Agent</FieldTitle></FieldContent><span className="flex items-center gap-2"><AgentLogo name="deepseek-harness" size={22} />DeepSeek Harness</span></Field>
      {!eligible && <Alert variant="destructive"><AlertDescription role="alert">{t('当前目标与共享目录或 Git 根目录不一致，请选择其他安装位置。', 'This destination differs from the shared directory or Git root. Choose another destination.')}</AlertDescription></Alert>}
      </FieldGroup>}
      {step === 3 && <InstallReview source={source} target={installTarget} skills={chosen} agents={agents} mode="copy" home={config.userHome} zh={zh} eveSubagents={[]} />}
      {step === 4 && operationResult && <OperationResults result={operationResult} operation={null} home={config.userHome} zh={zh} busy={busy} inventoryExpected={false} />}
      {message && <Alert variant="destructive"><AlertDescription role="alert">{message}</AlertDescription></Alert>}
      <ModalActions>
        {step > 0 && step < 4 && <Button type="button" variant="outline" disabled={busy} onClick={() => { setMessage(""); setStep(step === 2 && !plan ? 0 : step - 1); }}>{t("上一步", "Back")}</Button>}
        {(result?.installed.length || uncertain) ? <Button type="button" variant="outline" disabled={busy} onClick={() => onComplete(destination)}>{uncertain ? t("核对目标托管技能", "Inspect managed destination") : t("查看技能", "View skills")}</Button> : null}
        {step === 4 ? <>
          {remaining.length > 0 && <Button type="button" disabled={busy} onClick={() => reset(remaining)}>{t("重新检查", "Check again")}</Button>}
          <Button type="button" onClick={onClose}>{t("完成", "Done")}</Button>
        </> : <Button form={formId} type="submit" disabled={busy || step === 0 && !source.trim() || (step === 1 || step === 3) && !selected.length || (step === 2 || step === 3) && !eligible}>
          {busy ? t("处理中…", "Working…") : step === 0 ? t("检查来源", "Inspect source") : step === 3 ? t("确认安装", "Install") : t("下一步", "Next")}
        </Button>}
      </ModalActions>
    </form>
  </Modal>;
}
