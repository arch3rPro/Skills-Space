import { type ReactNode, lazy, memo, Suspense } from "react";
import { BotIcon } from "lucide-react";
const DeepSeekLogo = lazy(() => import("@lobehub/icons/es/DeepSeek").then(({ default: Icon }) => ({ default: Icon.Color })));
const AmpLogo = lazy(() => import("@lobehub/icons/es/Amp").then(({ default: Icon }) => ({ default: Icon.Color })));
const AntigravityLogo = lazy(() => import("@lobehub/icons/es/Antigravity").then(({ default: Icon }) => ({ default: Icon.Color })));
const ClaudeCodeLogo = lazy(() => import("@lobehub/icons/es/ClaudeCode").then(({ default: Icon }) => ({ default: Icon.Color })));
const CodeBuddyLogo = lazy(() => import("@lobehub/icons/es/CodeBuddy").then(({ default: Icon }) => ({ default: Icon.Color })));
const ClineLogo = lazy(() => import("@lobehub/icons/es/Cline").then(({ default: Icon }) => ({ default: Icon.Avatar })));
const CodexLogo = lazy(() => import("@lobehub/icons/es/Codex").then(({ default: Icon }) => ({ default: Icon.Color })));
const DevinLogo = lazy(() => import("@lobehub/icons/es/Devin").then(({ default: Icon }) => ({ default: Icon.Color })));
const GeminiCLILogo = lazy(() => import("@lobehub/icons/es/GeminiCLI").then(({ default: Icon }) => ({ default: Icon.Color })));
const GithubCopilotLogo = lazy(() => import("@lobehub/icons/es/GithubCopilot").then(({ default: Icon }) => ({ default: Icon.Avatar })));
const GrokLogo = lazy(() => import("@lobehub/icons/es/Grok").then(({ default: Icon }) => ({ default: Icon.Avatar })));
const HermesAgentLogo = lazy(() => import("@lobehub/icons/es/HermesAgent").then(({ default: Icon }) => ({ default: Icon.Avatar })));
const InferenceLogo = lazy(() => import("@lobehub/icons/es/Inference").then(({ default: Icon }) => ({ default: Icon.Avatar })));
const JunieLogo = lazy(() => import("@lobehub/icons/es/Junie").then(({ default: Icon }) => ({ default: Icon.Color })));
const KimiLogo = lazy(() => import("@lobehub/icons/es/Kimi").then(({ default: Icon }) => ({ default: Icon.Color })));
const KiroLogo = lazy(() => import("@lobehub/icons/es/Kiro").then(({ default: Icon }) => ({ default: Icon.Color })));
const MistralLogo = lazy(() => import("@lobehub/icons/es/Mistral").then(({ default: Icon }) => ({ default: Icon.Color })));
const CursorLogo = lazy(() => import("@lobehub/icons/es/Cursor").then(({ default: Icon }) => ({ default: Icon.Avatar })));
const GooseLogo = lazy(() => import("@lobehub/icons/es/Goose").then(({ default: Icon }) => ({ default: Icon.Avatar })));
const KiloCodeLogo = lazy(() => import("@lobehub/icons/es/KiloCode").then(({ default: Icon }) => ({ default: Icon.Avatar })));
const OpenClawLogo = lazy(() => import("@lobehub/icons/es/OpenClaw").then(({ default: Icon }) => ({ default: Icon.Color })));
const OpenCodeLogo = lazy(() => import("@lobehub/icons/es/OpenCode").then(({ default: Icon }) => ({ default: Icon.Avatar })));
const OpenHandsLogo = lazy(() => import("@lobehub/icons/es/OpenHands").then(({ default: Icon }) => ({ default: Icon.Color })));
const PiLogo = lazy(() => import("@lobehub/icons/es/Pi").then(({ default: Icon }) => ({ default: Icon.Avatar })));
const QoderLogo = lazy(() => import("@lobehub/icons/es/Qoder").then(({ default: Icon }) => ({ default: Icon.Color })));
const QwenLogo = lazy(() => import("@lobehub/icons/es/Qwen").then(({ default: Icon }) => ({ default: Icon.Color })));
const ReplitLogo = lazy(() => import("@lobehub/icons/es/Replit").then(({ default: Icon }) => ({ default: Icon.Color })));
const RooCodeLogo = lazy(() => import("@lobehub/icons/es/RooCode").then(({ default: Icon }) => ({ default: Icon.Avatar })));
const TraeLogo = lazy(() => import("@lobehub/icons/es/Trae").then(({ default: Icon }) => ({ default: Icon.Color })));
const WindsurfLogo = lazy(() => import("@lobehub/icons/es/Windsurf").then(({ default: Icon }) => ({ default: Icon.Avatar })));
const ZencoderLogo = lazy(() => import("@lobehub/icons/es/Zencoder").then(({ default: Icon }) => ({ default: Icon.Color })));

const localAgentIconUrls = import.meta.glob<string>("../assets/agent-icons/*.{png,svg}", { eager: true, import: "default", query: "?url" });
const localAgentIconFiles: Record<string, string> = {
  adal: "adal.png",
  augment: "augment.svg",
  bob: "bob.png",
  "ibm-bob": "bob.png",
  "command-code": "command_code.svg",
  continue: "continue.png",
  cortex: "cortex.png",
  "cortex-code": "cortex.png",
  crush: "crush.png",
  deepagents: "deepagents.png",
  "deep-agents": "deepagents.png",
  droid: "droid.svg",
  firebender: "firebender.svg",
  "iflow-cli": "iflow.png",
  iflow: "iflow.png",
  kode: "kode.png",
  mcpjam: "mcpjam.png",
  mux: "mux.png",
  neovate: "neovate.png",
  omp: "oh_my_pi.svg",
  pochi: "pochi.png",
  warp: "warp.svg",
  rovodev: "rovo_dev.png",
  "rovo-dev": "rovo_dev.png",
  tabnine: "tabnine.png",
  "tabnine-cli": "tabnine.png",
  zcode: "zcode.png",
  zed: "zed.svg",
};

function localAgentIconUrl(normalized: string) {
  const filename = localAgentIconFiles[normalized];
  return filename ? localAgentIconUrls[`../assets/agent-icons/${filename}`] : undefined;
}

export const AgentLogo = memo(function AgentLogo({ name, size = 24 }: { name: string; size?: number }) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  let logo: ReactNode;

  if (normalized.includes("claude")) logo = <ClaudeCodeLogo size={size} />;
  else if (normalized.includes("codex") || normalized.includes("openai")) logo = <CodexLogo size={size} />;
  else if (normalized.includes("cursor")) logo = <CursorLogo size={size} />;
  else if (normalized.includes("cline")) logo = <ClineLogo size={size} />;
  else if (normalized.includes("codebuddy")) logo = <CodeBuddyLogo size={size} />;
  else if (normalized.includes("devin")) logo = <DevinLogo size={size} />;
  else if (normalized.includes("gemini")) logo = <GeminiCLILogo size={size} />;
  else if (normalized.includes("github-copilot")) logo = <GithubCopilotLogo size={size} />;
  else if (normalized.includes("grok")) logo = <GrokLogo size={size} />;
  else if (normalized.includes("hermes")) logo = <HermesAgentLogo size={size} />;
  else if (normalized.includes("inference")) logo = <InferenceLogo size={size} />;
  else if (normalized.includes("junie")) logo = <JunieLogo size={size} />;
  else if (normalized.includes("kimi")) logo = <KimiLogo size={size} />;
  else if (normalized.includes("kiro")) logo = <KiroLogo size={size} />;
  else if (normalized.includes("mistral")) logo = <MistralLogo size={size} />;
  else if (normalized.includes("goose")) logo = <GooseLogo size={size} />;
  else if (normalized.includes("kilo")) logo = <KiloCodeLogo size={size} />;
  else if (normalized.includes("openclaw")) logo = <OpenClawLogo size={size} />;
  else if (normalized.includes("opencode")) logo = <OpenCodeLogo size={size} />;
  else if (normalized.includes("openhands")) logo = <OpenHandsLogo size={size} />;
  else if (normalized === "pi") logo = <PiLogo size={size} />;
  else if (normalized.includes("qoder")) logo = <QoderLogo size={size} />;
  else if (normalized.includes("qwen")) logo = <QwenLogo size={size} />;
  else if (normalized.includes("replit")) logo = <ReplitLogo size={size} />;
  else if (normalized.includes("roo")) logo = <RooCodeLogo size={size} />;
  else if (normalized.includes("trae")) logo = <TraeLogo size={size} />;
  else if (normalized.includes("windsurf")) logo = <WindsurfLogo size={size} />;
  else if (normalized.includes("zencoder") || normalized.includes("zenflow")) logo = <ZencoderLogo size={size} />;
  else if (normalized.includes("antigravity")) logo = <AntigravityLogo size={size} />;
  else if (normalized === "deepseek-harness") logo = <DeepSeekLogo size={size} />;
  else if (normalized.includes("amp")) logo = <AmpLogo size={size} />;
  else {
    const localIconUrl = localAgentIconUrl(normalized);
    logo = localIconUrl ? <img width={size} height={size} src={localIconUrl} alt="" aria-hidden="true" className="size-full object-contain" /> : <BotIcon size={size} className="text-primary" aria-hidden="true" />;
  }

  return <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}><Suspense fallback={<span aria-hidden="true" className="size-full rounded-sm bg-muted" />}>{logo}</Suspense></span>;
});
