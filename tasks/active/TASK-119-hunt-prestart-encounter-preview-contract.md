# TASK-119 — Hunt Pre-Start Encounter Preview Contract

## Metadata

- State: DRAFT
- Class: A — new public read authority/contract
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent contract reviewer
- Auditor: Security/Privacy Reviewer
- Auditor execution surface: independent disclosure/authority audit
- Consultants: Game Systems Consultant as needed
- Consultant execution surface(s): advisory only
- Spec: DRAFT SPEC-024
- Related: TASK-034 / TASK-039 / TASK-118
- Branch: not created
- Worktree: not created

## Objective

Define the minimum authoritative, privacy-safe read contract needed for the first-Pre-alpha Hunt Start screen to show possible Species and reward preview without inventing content locally or broadening SPEC-018 by implication.

## Context

- TASK-039 requires Team + possible Species + rewards before Start and intentionally fails closed without an authoritative preview.
- SPEC-018 only authorizes manifest + Zone/Hunt artifacts; it does not authorize Encounter definitions.
- Existing immutable game-data includes encounter definitions, but repository presence is not public API authority.

## Scope

- Decide the bounded public preview facts required before Start.
- Define how those facts bind to the currently selected new-operation game-data release.
- Define privacy limits so no per-Encounter RNG outcome, hidden HP, Genetics, Shiny roll, capture roll, server secret or Player-specific admission state leaks.
- Define fail-closed behavior for missing/tampered/stale preview authority.
- Define whether preview is an immutable artifact projection, a server-computed bounded projection, or another explicitly accepted read shape.
- Define whether Start must bind to the exact preview release or whether preview is advisory and Start re-resolves current authority.

## Out of scope

- Backend implementation before Class-A acceptance.
- Player eligibility/admission changes unless explicitly accepted as part of the contract.
- Battle/capture RNG prediction.
- CombatPresentation transport.
- Economy/content tuning changes.

## Acceptance criteria

- [ ] SPEC-024 reaches an explicit Owner-approved contract for public preview facts and release binding.
- [ ] The contract is sufficient for TASK-039 to render possible Species and reward preview without local authority.
- [ ] Privacy and information-disclosure limits are explicit and independently reviewed.
- [ ] Missing/stale/tampered preview behavior is fail-closed and does not silently substitute local content.
- [ ] Relationship to SPEC-018 and Start authority is explicit; no implied amendment remains.

## Validation / tests

- [ ] Contract examples cover current `Verdant Edge -> Wilds` without hard-coding that content as protocol.
- [ ] Rollback/release-switch/missing-artifact scenarios are specified.
- [ ] Disclosure review confirms no hidden per-Encounter or Player-private facts are required.

## Dependencies

- APPROVED SPEC-018 as the existing Zone/Hunt transport boundary.
- SPEC-002 immutable game-data semantics.
- TASK-034 published Encounter/Hunt content semantics.

TASK-039 is the downstream client consumer of the accepted contract, not a prerequisite for defining it.

## Risks / irreversible actions

- Publishing raw Encounter definitions may expose more information than the UI needs; the contract must minimize disclosure deliberately.
- Changing Start version-binding semantics would amend accepted mutation authority and therefore requires explicit Class-A acceptance.
- No implementation, deploy, publication or Git-history action is authorized by this DRAFT.

## Expected files / boundaries

- `docs/specs/SPEC-024-hunt-prestart-encounter-preview-delivery.md`
- `docs/project/PROJECT_ROADMAP.md`
- TASK-039 dependency/blocker references after acceptance.
