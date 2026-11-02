import type { Target } from "./upstream";

export type UseInput = { target: Target; source: string; skill: string; includeInternal: boolean; mode: "prompt" | "agent"; agent: string | null; sourceFingerprint: string | null };
export type UsePlan = { id: string; input: UseInput; source: string; skill: string; description: string; workingDirectory: string; mode: "prompt" | "agent"; agent: string | null; riskRequired: boolean; fileBytes: number };
export type UseAgent = { promptSupported: boolean; terminalSupported: boolean; id: string; name: string; command: string; path: string | null };
export type UseSession = { plan: UsePlan; status: { phase: string; runnerPid: number | null; cliPid: number | null; exitCode: number | null; verified: boolean; agentStarted: boolean; skillDirectory: string | null; error: string | null }; canRelease: boolean; prompt: string | null; diagnostic: string | null };

export function useSessionNeedsPolling(session: UseSession): boolean {
  return !session.canRelease || ["waiting", "preparing", "running", "stopping"].includes(session.status.phase);
}
