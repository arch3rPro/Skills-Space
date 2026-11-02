import { AgentLogo } from "@/components/agent-logo";
import { Badge } from "@/components/ui/badge";
import { displayHomePath, type Agent, type Inspection, type InstallMode, type Target } from "@/lib/upstream";

export function InstallReview({ source, target, skills, agents, mode, home, zh, eveSubagents, overwrites = [] }: { source: string; target: Target; skills: Inspection["skills"]; agents: Agent[]; mode: InstallMode; home: string; zh: boolean; eveSubagents: string[]; overwrites?: string[] }) {
  const t = (cn: string, en: string) => zh ? cn : en;
  const path = (value: string) => displayHomePath(value, home);
  const eve = agents.some(agent => agent.id === "eve");
  const downloads = skills.filter(skill => skill.downloadUrl);
  return <div className="flex flex-col gap-5 text-sm">
    <dl className="grid gap-3 rounded-lg bg-muted/30 p-4 sm:grid-cols-2">
      <div className="flex min-w-0 items-start gap-4 sm:col-span-2"><dt className="shrink-0 text-muted-foreground">{t("安装来源", "Installation source")}</dt><dd className="min-w-0 break-all">{path(source)}</dd></div>
      <div className="flex min-w-0 items-start gap-4"><dt className="shrink-0 text-muted-foreground">{t("安装范围", "Scope")}</dt><dd className="min-w-0 break-all">{target.scope === "global" ? t("全局", "Global") : path(target.projectPath ?? "")}</dd></div>
      <div className="flex min-w-0 items-start gap-4"><dt className="shrink-0 text-muted-foreground">{t("安装方式", "Mode")}</dt><dd>{mode === "copy" ? t("文件复制", "File copies") : t("符号链接", "Symbolic links")}{eve && mode === "symlink" && <span className="mt-1 block text-xs text-muted-foreground">{t("Eve 使用文件复制", "Eve uses file copies")}</span>}</dd></div>
    </dl>
    <section className="flex flex-col gap-3"><h3 className="font-medium">{t(`技能 ${skills.length}`, `Skills ${skills.length}`)}</h3><div className="flex flex-wrap gap-2">{skills.map(skill => <Badge key={skill.name} variant="secondary" className="h-auto min-h-5 max-w-full whitespace-normal break-all">{skill.name}</Badge>)}</div></section>
    <section className="flex flex-col gap-3"><h3 className="font-medium">{t(`Agent ${agents.length}`, `Agents ${agents.length}`)}</h3><div className="flex flex-wrap gap-x-5 gap-y-2">{agents.map(agent => <span key={agent.id} className="inline-flex items-center gap-2"><AgentLogo name={agent.id} size={18} />{agent.name}{overwrites.includes(agent.id) && <span className="text-muted-foreground">{t("（覆盖）", " (replace)")}</span>}</span>)}</div></section>
    {eve && <details><summary className="w-fit cursor-pointer text-xs text-muted-foreground">{t("Eve 安装位置", "Eve destinations")}</summary><div className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground">{skills.flatMap(skill => eveSubagents.map(slot => <p className="break-all font-mono" key={`${skill.name}:${slot}`}>{path(`${target.projectPath}/agent/${slot === "root" ? "skills" : `subagents/${slot}/skills`}/${skill.name.toLowerCase().replace(/[^a-z0-9._]+/g, "-").replace(/^[.\-]+|[.\-]+$/g, "").slice(0,255) || "unnamed-skill"}`)}</p>))}</div></details>}
    {downloads.length > 0 && <details><summary className="w-fit cursor-pointer text-xs text-muted-foreground">{t("下载来源", "Download sources")}</summary><div className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground">{downloads.map(skill => <p key={skill.name} className="break-all">{skill.name}{skill.fileCount !== null && <> · {skill.fileCount} {t("个文件", "files")}</>}<br />{skill.downloadUrl}</p>)}</div></details>}
  </div>;
}
