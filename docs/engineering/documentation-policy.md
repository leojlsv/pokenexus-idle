# Documentation Policy

## Principle

Documentation describes the **current stable truth**.

Git commits, PRs and tasks describe **how it changed**.

## Allowed canonical documentation

- `README.md` — stable project onboarding/overview;
- `docs/architecture/` — current architecture;
- `docs/decisions/ADR-*.md` — accepted architectural decisions;
- `docs/specs/` — approved behavior/specifications;
- `docs/agents/` — agent governance;
- `docs/engineering/` — engineering policy;
- `tasks/` — scoped work lifecycle;
- `docs/qa/` — persistent QA artifact only when explicitly required.

## No inline changelog

Do not add change-history sections/comments to:
- source code;
- README files;
- architecture docs;
- specs;
- agent rules.

Examples to avoid:
- `// fixed crash on 2026-09-11`
- `// new v2 implementation`
- `<!-- updated by Claude -->`
- `## Recent changes`
- `Previously this used X; now it uses Y` unless the historical contrast is essential to an ADR rationale.

## No ad-hoc status/report files

Do not create files such as:
- `CHANGELOG.md`
- `CHANGES.md`
- `IMPLEMENTATION_SUMMARY.md`
- `IMPLEMENTATION_REPORT.md`
- `FIX_SUMMARY.md`
- `PROGRESS.md`
- `STATUS.md`
- `NOTES_FOR_NEXT_AGENT.md`

unless an explicit approved task requires that specific artifact.

If release notes are needed later, introduce a dedicated release process. Feature/fix tasks do not edit a changelog.

## Handoffs

Agent completion and QA handoffs are responses/workflow records by default.
Persist them only when a task explicitly requires a canonical QA/task artifact.

## Style

- Keep evergreen docs concise.
- Avoid duplicating the same rule in multiple canonical files.
- Link to the source of truth instead of copying large sections.
- Remove obsolete docs rather than keeping "deprecated" copies unless historical retention is explicitly useful.
