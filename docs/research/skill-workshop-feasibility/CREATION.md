# Creation brief: portable meeting-notes skill

Create one reusable Agent Skill named `meeting-notes` in `./skill/meeting-notes/`. This is a creator-only feasibility trial. Do not run tests, spawn subagents, optimize descriptions, install packages or skills, change Agent configuration, or perform Git operations.

## User task

Turn rough meeting notes supplied by the user into a concise, faithful Markdown record. Preserve the input language. Separate confirmed decisions, action items and unresolved questions. Preserve explicit owners and dates exactly; mark missing values as “未明确” in Chinese or “Not specified” in English. Do not invent facts or infer a calendar date from a relative expression.

Handle contradictory proposals as unresolved until the notes explicitly record a decision. If the input is empty, request the notes instead of producing a fictional meeting.

## Portable deliverable

- `SKILL.md`: valid Agent Skills frontmatter with matching name and a description stating the task and when to use it; concise workflow and output rules.
- `references/output-template.md`: a reusable output template referenced by a relative path in SKILL.md. Include summary, decisions, action items and unresolved questions.
- Instructions must work through ordinary reading and writing of text. No required Claude, Codex, Pi or DSH commands, private tools, plugins, provider APIs, personal paths or Agent-specific metadata.
- No dependency is needed for this task. Do not add scripts or empty directories.
- Place no creation brief, evaluation report, test output or development log inside the skill directory.

Use this brief as the task scope when reading the upstream creator. Skip unrelated evaluation, packaging and optimization stages. Supporting files of the creator are source references; write the new skill into the current working directory, not into the creator's temporary supporting-files directory.

Finish by listing created files and describing the skill's intended use. Do not claim the skill has been executed or evaluated.
