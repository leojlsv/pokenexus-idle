# TASK-119 — Hunt Pre-Start Encounter Preview Contract

## Metadata

- State: DONE
- Lifecycle note: exact protocol v1 explicitly approved by Human Owner 2026-10-06; implementation validated, committed as `3ae9604` and merged into canonical `main` as `490b6de`; deploy/public enablement remain separate
- Class: A — new public read authority/contract; Option 1 and exact v1 protocol approved 2026-10-06
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: independent QA Reviewer — contract QA READY after bounded-input P2 correction; implementation QA found only a stale-lifecycle P2, corrected before history integration
- Reviewer execution surface: independent contract reviewer
- Auditor: Security/Privacy Reviewer — contract audit READY `0/0/0`; implementation audit found one stale-preview render-binding P2 and no P0/P1, corrected with exact Hunt+release gating and regression coverage
- Auditor execution surface: independent disclosure/authority audit
- Consultants: Game Systems Consultant as needed
- Consultant execution surface(s): advisory only
- Spec: APPROVED SPEC-024 v1
- Related: TASK-034 / TASK-039 / TASK-118
- Branch: `spec/TASK-119-prestart-preview-contract`
- Worktree: `.worktrees/TASK-119-prestart-preview-contract`
- Repository/history: Human-authorized feature `3ae9604` merged into canonical `main` as `490b6de` on 2026-10-06; deploy/public enablement remain separate and blocked

## Objective

Define the minimum authoritative, privacy-safe read contract needed for the first-Pre-alpha Hunt Start screen to show possible Species and reward preview without inventing content locally or broadening SPEC-018 by implication.

## Context

- TASK-039 requires Team + possible Species + rewards before Start and intentionally fails closed without an authoritative preview.
- SPEC-018 only authorizes manifest + Zone/Hunt artifacts; it does not authorize Encounter definitions.
- Existing immutable game-data includes encounter definitions, but repository presence is not public API authority.
- Human Owner selected **Option 1** on 2026-10-06: authenticated minimal server projection of possible Species + limited reward preview, carrying release identity, while Start continues to revalidate current authority. Raw Encounter publication and exact preview-release Start binding are not authorized by this decision.

## Approved implementation scope

- Implement only the Human-approved minimal authenticated server projection.
- Deliver the bounded possible-Species/reward facts required before Start without exposing raw Encounter definitions.
- Bind the projection to the server-selected new-operation game-data release identity.
- Preserve the accepted privacy limits so no per-Encounter RNG outcome, hidden HP, Genetics, Shiny roll, capture roll, server secret or Player-specific admission state leaks.
- Fail closed for missing/tampered/stale/oversized preview authority.
- Preserve Start as current-authority revalidation with no preview token or exact-release binding.

## Out of scope

- Any backend/frontend semantics beyond the exact approved SPEC-024 v1 contract.
- Player eligibility/admission changes unless explicitly accepted as part of the contract.
- Battle/capture RNG prediction.
- CombatPresentation transport.
- Economy/content tuning changes.

## Acceptance criteria

- [x] Human Owner selects the transport/release-binding direction: **Option 1 minimal authenticated server projection; Start revalidates current authority**.
- [x] SPEC-024's exact v1 route, response fields, aggregation semantics, budgets and errors received explicit Human acceptance on 2026-10-06.
- [x] The contract is sufficient for TASK-039 to render possible Species and reward preview without local authority or raw Encounter-definition bytes; independent contract QA READY after bounded-input P2 correction.
- [x] Privacy and information-disclosure limits are explicit and independently reviewed; audit READY `0/0/0`.
- [x] Missing/stale/tampered/oversized preview behavior is fail-closed and does not silently substitute local content.
- [x] Relationship to SPEC-018 and Start authority is explicit; no implied amendment remains.

## Validation / tests

- [x] Contract examples cover current `Verdant Edge -> Wilds` without hard-coding that content as protocol.
- [x] Rollback/release-switch/missing-artifact scenarios are specified.
- [x] Disclosure review confirms no hidden per-Encounter or Player-private facts are required.
- [x] Contract QA confirms the candidate projection matches the minimum fields already consumed by TASK-039's existing Pre-Start presentation model.
- [x] Local implementation validation: API typecheck + 267/267 unit PASS; web typecheck + 125/125 unit PASS; production web build PASS; Wrangler API dry-run PASS; targeted ESLint and `git diff --check` PASS.

## Dependencies

- APPROVED SPEC-018 as the existing Zone/Hunt transport boundary.
- SPEC-002 immutable game-data semantics.
- TASK-034 published Encounter/Hunt content semantics.

TASK-039 is the downstream client consumer of the accepted contract, not a prerequisite for defining it.

## Risks / irreversible actions

- Raw Encounter definitions remain intentionally undisclosed under the selected Option 1.
- Changing Start to exact preview-release binding remains outside this authorization and would require a new explicit Class-A amendment.
- Exact endpoint fields/bounds are approved public protocol semantics; any semantic change requires a new explicit Class-A amendment.
- Backend/frontend implementation, validation and repository-history integration of this exact v1 are authorized. Deploy/public enablement remain separate and blocked.

## Expected files / boundaries

- `docs/specs/SPEC-024-hunt-prestart-encounter-preview-delivery.md`
- `docs/project/PROJECT_ROADMAP.md`
- TASK-039 dependency/blocker wording may be reconciled to the selected projection direction without changing its implementation.
