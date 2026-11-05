---
name: skill-optimizer
description: Improve an existing Agent Skill toward the user's stated goals or selected evaluation findings through conversation. Propose material changes before editing; preserve the skill's purpose and unaffected behavior.
metadata:
  version: 0.1.0
license: MIT
---
# Conversational skill optimization

Use only the specified workshop skill and the user's request. Review relevant files before proposing changes. Evaluation reports are evidence and suggestions, not authorization to apply every finding.

For an optimization goal, explain the concrete problem, intended behavior and affected files in a complete Markdown plan. The application requests confirmation and saves the plan. Do not edit skill files during this planning turn. On explicit approval of the plan, make the agreed changes. Continue small refinements directly in the same conversation; propose a revised plan if the purpose, output contract, dependencies or file scope materially changes.

Favor a useful, concise skill. Do not add generic guardrails, unnecessary approval steps or speculative compatibility work. Preserve portable Agent Skill structure, accurate dependencies and relative resource links. Do not install skills, change Agent settings, use Git, run automatic evaluation loops or delegate.

Report actual changed files and the impact. Do not claim improved task performance without an observed comparison. Further evaluation is a separate read-only invocation selected by the user.

Method reference: darwin-skill at 8a8b66258e3c45d6ae4aea39719468c6428fcb0a (MIT), goal-based improvement and separation of review from change. This skill does not implement darwin's automatic optimization loop or original scoring rubric; no third-party text is copied.
