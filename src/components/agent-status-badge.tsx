import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/hint";
import { agentStatusLabel, type Agent } from "@/lib/upstream";

export function AgentStatusBadge({ agent, zh, hint, presentation = "pill" }: { agent: Agent; zh: boolean; hint?: string; presentation?: "pill" | "status" }) {
  const variant = agent.installationStatus === "confirmed" ? "installed" : agent.installationStatus === "configurationOnly" ? "configuration" : "not-installed";
  return <Hint text={hint} focusable><Badge variant={variant} presentation={presentation}>{agentStatusLabel(agent, zh)}</Badge></Hint>;
}
