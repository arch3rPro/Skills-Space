# Read-only evaluation brief

Evaluate only `./skill/meeting-notes/`, using CREATION.md, cases.json and the actual files in review/outputs/. Work in a new session separate from the creator. Write only `./review/report.md`. Do not edit, add, rename or delete skill files. Do not initialize Git, install tools, inspect unrelated skills, spawn subagents or enter an optimization loop.

This is a Skills Space trial rubric inspired by darwin's separation of structural review and actual effectiveness, and Anthropic's evidence-based grading. It is not the unmodified darwin rubric or a certified quality score. Do not import author-specific ecosystem preferences or demand approval gates and fallback machinery for a pure text transformation.

## Structural review: 60 points

| Criterion | Maximum | Evidence |
| --- | ---: | --- |
| Valid, meaningful metadata | 10 | Parse/read frontmatter; name matches directory; description explains purpose and usage |
| Clear, faithful task workflow | 20 | Instructions separate decisions, actions and unknowns without inventing facts |
| Portable instructions | 15 | No required Agent-specific tool, config, personal path or provider |
| Resource completeness and useful brevity | 15 | Referenced template exists and is consistent; no unrelated material |

Assign points with concrete file/section evidence. Score substantive user outcomes, not the number of rules, warnings or headings. Do not reward extra complexity. This total represents reviewer judgment, not a calibrated measurement.

## Observed task results: 40 points

For each of the two cases in cases.json, compare its actual output with each expected check. Allocate that case's 20 points equally across its checks. Attach evidence and a pass/fail result for every check.

Missing or unreadable outputs mean “Not run / Not verifiable”, not an inferred failure or simulated success. Keep the affected points and total unset. A partial structural score must remain “X/60; task results not verified”, not be scaled to 100.

Do not run the task again in the evaluator session. Do not claim natural triggering, improvement over a baseline or cross-Agent compatibility from these two explicitly loaded executions.

## Report

Include:

1. Reviewed skill directory, model/Agent if known, and actual evidence files.
2. Structural findings and points, each with evidence.
3. Per-case expected-check results and observed-task points.
4. Total only if all required evidence exists; state the trial rubric and its limits.
5. Material defects, their user impact, and concise improvement suggestions. Do not apply fixes.
6. Read-only status. Only claim file integrity if an external before/after file-list and SHA-256 comparison was supplied; otherwise mark integrity comparison pending.

Stop after this report. Suggested changes do not authorize another execution or an automatic revision cycle.
