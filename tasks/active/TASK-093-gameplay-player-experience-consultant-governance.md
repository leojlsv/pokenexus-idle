# TASK-093 — Gameplay Systems & Player Experience Consultant Governance

## Metadata

- State: REVIEW
- Class: B
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: N/A
- Auditor execution surface: N/A
- Consultants: N/A
- Consultant execution surface(s): N/A
- Spec: N/A
- ADR: N/A
- Branch: chore/gameplay-pxe-consultant-governance
- Worktree: G:/pokenexus-idle/.worktrees/gameplay-pxe-consultant-governance

## Objective

Formalize dedicated advisory roles for gameplay-system design and player-experience/economy
analysis so future Class A product/rule decisions receive explicit specialist input without
changing Human Owner, QA, IA or implementation authority.

## Context

Existing PM, balance, UI and audit coverage does not define one canonical consultative role for
Idle/Incremental/MMO/RPG/collection/progression loop design, nor one for F2P/payer/P2W,
monetization-pressure, fairness and long-term economy consequences. The Human Owner explicitly
authorized formalizing both roles and requested that their responsibilities and boundaries be
well-defined.

## Scope

- Add `GSC` — Gameplay Systems Consultant — with `RECOMMEND`-only authority.
- Add `PXE` — Player Experience & Economy Consultant — with `RECOMMEND`-only authority.
- Define purpose, consultation triggers, expected analysis/output, exclusions and conflict
  escalation for both roles.
- Define required consultation policy for high-impact gameplay/progression/reward/economy/
  monetization Class A decisions.
- Define PXE safeguards for F2P viability, payer value, fairness/competitive integrity, economy
  sustainability, monetization pressure, P2W risk and dark-pattern avoidance.
- Preserve independent QA/audit gates and Human Owner final authority.
- Add task metadata/workflow/tool-adapter/handoff support for consultant assignments.
- Wire the planned roadmap tasks that already meet the consultation triggers.

## Out of scope

- Giving either consultant implementation, merge, acceptance, audit or final approval authority.
- Replacing `SK-GAME-BAL`, QA, IA, PM or Human Owner responsibilities.
- Creating new lifecycle states.
- Adopting Gacha, loot boxes, battle passes, premium currency, paid boosts or any monetization
  mechanic.
- Defining prices, legal/compliance policy or backend reward/security mechanisms.
- Retroactively reopening already accepted Class A specs solely to obtain consultant input.

## Acceptance criteria

- [x] Canonical role docs define GSC and PXE as advisory `RECOMMEND` roles only.
- [x] Authority matrix contains explicit scoped permissions and prohibitions for both roles.
- [x] Approval gates define when GSC, PXE or both are required before Human Class A acceptance.
- [x] Workflow and task template support explicit consultant assignment without adding lifecycle
      states or confusing consultation with QA/audit.
- [x] Consultant handoff format separates facts/assumptions, forecasts, options, trade-offs, risks,
      recommendation and Human Owner decisions.
- [x] PXE policy prohibits revenue-only optimization and requires explicit fairness/F2P/economy/
      monetization-pressure analysis.
- [x] Roadmap documents current planned task consultation assignments and keeps TASK-022 as the
      next product task.
- [x] Generated roadmap HTML is regenerated from Markdown and passes deterministic check.
- [x] Independent QA reports no unresolved P0/P1 finding on this governance change.

## Validation / tests

- [x] `corepack pnpm roadmap:generate`
- [x] `corepack pnpm roadmap:check`
- [x] `git diff --check`
- [x] Governance diff manually checked for authority leakage or approval-gate ambiguity.
- [x] Fresh independent QA review completed — READY, P0/P1/P2/P3 `0/0/0/0` on the frozen
      governance snapshot.

## Dependencies

- TASK-000
- TASK-003

## Risks / irreversible actions

- No irreversible repository/runtime action is authorized.
- This changes canonical role policy, so `docs/agents/approval-gates.md` requires explicit Human
  Owner direction and independent QA. Human Owner direction is already present for this task.
- IA is N/A because GSC/PXE remain advisory-only and this change does not alter a
  security-sensitive or irreversible approval path. Economy/trading tasks still retain their
  existing mandatory IA requirements.
- Git history actions remain separately gated by explicit Human Owner authorization.

## Expected files / boundaries

- `AGENTS.md`
- `docs/agents/roles.md`
- `docs/agents/gameplay-systems-consultant.md`
- `docs/agents/player-experience-economy-consultant.md`
- `docs/agents/authority-matrix.md`
- `docs/agents/approval-gates.md`
- `docs/agents/workflow.md`
- `docs/agents/tool-adapters.md`
- `docs/agents/launching.md`
- `docs/agents/handoff-protocol.md`
- `tasks/TEMPLATE.md`
- `docs/project/PROJECT_ROADMAP.md`
- generated `docs/project/PROJECT_ROADMAP.html`

No production game/runtime source, dependency, lockfile, approved spec or ADR is in scope.

## Completion

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
