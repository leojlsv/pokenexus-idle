# TASK-094 — Player State API Contract Spec

## Metadata

- State: ACCEPTANCE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor (authz, concurrency and idempotency)
- Auditor execution surface: fresh independent ChatGPT worker
- Consultants: Gameplay Systems Consultant (GSC) — required advisory for player-visible saved-Team
  quota / team-building consequence
- Consultant execution surface(s): fresh independent ChatGPT worker
- Spec: `docs/specs/SPEC-011-player-state-api-contract.md`
- Related specs: SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-010
- Related ADRs: ADR-005, ADR-006
- Related tasks: TASK-017, TASK-020, TASK-024, TASK-089, TASK-025
- Branch: `main` canonical governance worktree; no TASK-094 Git/history mutation authorized
- Worktree: `.worktrees/main-governance-integration`

## Objective

Freeze the public v1 self-scoped Player State HTTP contract before TASK-025 implementation so the
Class B implementation consumes accepted protocol semantics instead of inventing route/payload,
numeric-encoding, session-activity, OCC/idempotency or saved-Team quota behavior.

## Why this prerequisite exists

The roadmap previously classified TASK-025 directly as Class B. The approved domain specs do define
ownership and mutation authority, but they explicitly leave public HTTP payloads/encoding/API shape to
TASK-025. Repository governance classifies public protocol semantics as Class A. Therefore TASK-025
must depend on an accepted public API contract before endpoint implementation begins.

This task is the narrow prerequisite and does not change existing domain/gameplay rules.

## Scope

- exact self-scoped route/method set for Collection/Pokémon, Teams, Inventory and Progression;
- exact Move Loadout mutation handoff to TASK-089;
- JSON integer encoding for Player progression, Item quantities and OCC versions;
- normal-session authz, Origin/CSRF and subscriber-activity classification;
- bounded error/status taxonomy;
- Collection/Team-list/Inventory pagination bounds and non-gameplay ordering semantics;
- saved-Team creation quota and durable response-loss idempotency;
- exact authority/runtime failure semantics for Move mutation;
- privacy/non-enumeration boundaries;
- implementation handoff for TASK-025.

## Out of scope

- production endpoint code;
- database migration/repository implementation;
- new gameplay, reward, item-use, Ability-selection or economy rules;
- public/social state;
- TASK-090/091 content;
- Git history mutation without separate Human Owner authorization.

## Acceptance criteria

- [x] SPEC-011 is internally consistent with ADR-005/006 and SPEC-004/005/006/007/010.
- [x] No route lets client AccountId/PlayerId/owner identifiers become authority.
- [x] Protocol preserves exact integer domains without JavaScript-number narrowing.
- [x] Mutation Origin/CSRF and route activity classification are explicit.
- [x] Team creation is both storage-bounded and response-loss idempotent.
- [x] Required GSC advisory has no unresolved concern with the Human-revised player-visible
      6-live-Team quota and
      does not reinterpret that service limit as battle/gameplay capacity.
- [x] Team/Move mutation maps existing OCC semantics without hidden retry.
- [x] Move mutation cannot bypass TASK-089 or select authority versions from the client.
- [x] No unsupported Inventory/progression/Ability mutation is exposed.
- [x] Independent QA reports no unresolved P0/P1 on the Human-revised 6-Team quota snapshot.
- [x] Independent Auditor reports no unresolved P0/P1 on the Human-revised 6-Team quota snapshot.
- [x] Human Owner explicitly accepts SPEC-011.

## Validation / review

- cross-spec/ADR consistency review;
- protocol completeness review against current repository/application capabilities;
- QA Definition-of-Ready review;
- independent authz/concurrency/idempotency audit;
- required GSC advisory for the saved-Team service quota / team-building consequence;
- `corepack pnpm roadmap:generate`;
- `corepack pnpm roadmap:check`;
- `git diff --check`.

## Dependencies

- TASK-017 — DONE; authenticated private Player/profile boundary.
- TASK-020 — DONE; Collection/Team persistence and OCC.
- TASK-024 — DONE; Inventory/Progression/Reward persistence.
- TASK-089 — DONE; authoritative Move eligibility and shared Pokémon OCC integration.
- ADR-005 / ADR-006 — ACCEPTED.
- SPEC-004/005/006/007/010 — APPROVED.

## Risks / irreversible actions

- A public protocol accidentally becomes long-lived compatibility surface; ambiguous payload/error
  semantics create client/server debt.
- Incorrect authz or CSRF reuse can expose another Player's state or permit cross-site mutation.
- Unsafe numeric JSON can silently corrupt uncapped Player progression.
- Team-create retries without durable idempotency can duplicate durable aggregates.
- Team quota races can exceed the intended storage-abuse ceiling.
- A player-visible saved-Team service quota can affect team-building UX even though it is not a
  battle/domain capacity; GSC advisory is required before Human acceptance.
- No production or destructive action is authorized by this spec task.

## Current execution state

PM identified the protocol-governance gap after TASK-089 completion and materialized SPEC-011/TASK-094
as the Class A prerequisite. TASK-025 remains PLANNED and must not implement public endpoints until
SPEC-011 passes independent QA/IA and the Human Owner accepts the complete contract. The first
pre-acceptance snapshot reached QA READY, IA PASS and GSC ADVISORY PASS with no unresolved
P0/P1/P2/P3. At the Human acceptance gate on 2026-09-22, the Human Owner changed the live Saved Team
service quota from 32 to **6 per Player**. Fresh delta QA returned READY `0/0/0/0` and fresh delta IA
returned PASS `0/0/0/0`. GSC found the 6-Team value structurally coherent but materially
player-visible, so the contract now explicitly classifies six retained presets as a deliberate v1
product/UX capacity constraint rather than a gameplay-invisible abuse/storage ceiling. The narrow
wording delta then received fresh **GSC ADVISORY PASS** with no remaining correction. All required
independent pre-acceptance gates on the Human-revised snapshot are now clear. On 2026-09-22 the Human
Owner explicitly accepted the complete revised SPEC-011 snapshot. TASK-094 is now in ACCEPTANCE
pending repository/history closure only; TASK-025 remains blocked until that closure is complete.

## Pre-acceptance gate evidence

- Prior independent QA final delta re-gate before the Human quota change: **READY**,
  P0/P1/P2/P3 `0/0/0/0`.
- Prior independent authz/concurrency/idempotency Auditor final re-gate before the Human quota change:
  **PASS**, P0/P1/P2/P3 `0/0/0/0`.
- Prior required Gameplay Systems Consultant advisory before the Human quota change:
  **ADVISORY PASS** for the superseded 32-live-Team value.
- Human Owner changed the live Saved Team quota to **6 per Player** at the Class A acceptance gate;
  the separate
  `64` accepted-new-Team-create rolling-24h abuse-control remains unchanged unless the Human Owner
  changes it separately.
- Fresh independent QA delta on the Human-revised 6-Team snapshot: **READY**,
  P0/P1/P2/P3 `0/0/0/0`.
- Fresh independent authz/concurrency/idempotency Auditor delta on the Human-revised 6-Team snapshot:
  **PASS**, P0/P1/P2/P3 `0/0/0/0`.
- Fresh GSC delta on that snapshot: **ADVISORY CONCERN** only because six retained presets are low
  enough to materially constrain team-building organization. GSC confirmed structural compatibility
  with SPEC-005 and no combat/roster-capacity reinterpretation. The exact recommendation was to keep
  `6` only if the contract acknowledges the deliberate player-visible product/UX constraint. The
  wording was corrected accordingly.
- Fresh narrow GSC wording delta after that reconciliation: **ADVISORY PASS**, with the previous
  concern fully closed and no remaining correction. The Human-selected `6` cap remains unchanged.
- Earlier review findings were reconciled before the final gates: Idempotency-Key CORS; replay-first
  per-Player serialized create transaction; bounded create issuance; stale-without-fresh-token
  semantics; snapshot-safe Inventory paging; TASK-089 error mapping; bounded Team-list paging;
  historical over-quota Team access; and exact 30-day deleted-Team tombstone expiry/normal pruning. These
  findings remain structurally applicable. The subsequent wording-only reconciliation does not alter
  authz, concurrency, idempotency, numeric or Move-authority invariants already cleared by QA/IA.
- `corepack pnpm roadmap:check`: PASS.
- `git diff --check`: PASS.
- No TASK-025 production implementation has started.

## Human Owner gate

On 2026-09-22 the Human Owner explicitly approved the complete revised SPEC-011 protocol. The exact
pre-transition approved specification snapshot SHA-256 was
`41CC5525E896F9402CDE5747914B172EE25901A228C0AB7BCD423AD26B14C858`.

This acceptance includes the Human-selected **6 live saved Teams per Player** as a deliberate
player-visible v1 saved-preset capacity, the separate `64` accepted new Team-create commands per
rolling 24h abuse-control, durable replay-first Team-create idempotency, the exact 30-day deleted-Team
tombstone window, bounded paging, lossless integer transport, OCC without hidden stale retry, and the
TASK-089-only Move mutation authority boundary.

## Acceptance state

- SPEC-011 is **APPROVED**.
- TASK-094 is **ACCEPTANCE** pending separate repository/history completion authorization and closure.
- TASK-025 remains **PLANNED** and must not start until TASK-094 is formally completed/integrated.
- No TASK-094 Git/history mutation has been authorized by this semantic approval alone.
