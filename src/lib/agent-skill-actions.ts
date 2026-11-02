import { type InstalledSkill } from './upstream.ts';
import { canTrashPiSkill } from './pi.ts';
import { canChangeDsh } from './dsh.ts';

export type AgentSkillAction = 'codex-toggle' | 'pi-toggle' | 'pi-invocation' | 'pi-trash' | 'hermes-toggle' | 'hermes-preload' | 'dsh-invocation' | 'dsh-trash';

// Agent context controls presentation; ownership controls writes to skill content.
export function skillAgentState(skill: InstalledSkill, agent: string | null) {
  const belongs = agent !== null && skill.agents.includes(agent);
  return {
    codex: belongs && agent === 'codex' ? skill.codexState ?? null : null,
    pi: belongs && agent === 'pi' ? skill.piState ?? null : null,
    hermes: belongs && agent === 'hermes-agent' ? skill.hermesState ?? null : null,
    dsh: belongs && agent === 'deepseek-harness' ? skill.dshState ?? null : null,
  };
}

export function canAgentSkillAction(skill: InstalledSkill, agent: string | null, action: AgentSkillAction): boolean {
  const state = skillAgentState(skill, agent);
  switch (action) {
    case 'codex-toggle': return !!state.codex?.canToggle && state.codex.enabled !== null;
    case 'pi-toggle': return !!state.pi?.canToggle;
    case 'hermes-toggle': return !!state.hermes?.canToggle;
    case 'hermes-preload': return !!state.hermes?.canPreload;
    case 'pi-invocation': return !!state.pi?.canSetVisibility;
    case 'pi-trash': return !!state.pi && canTrashPiSkill(skill);
    case 'dsh-invocation': return !!state.dsh && canChangeDsh(skill, 'invocation');
    case 'dsh-trash': return !!state.dsh && canChangeDsh(skill, 'trash');
  }
}
