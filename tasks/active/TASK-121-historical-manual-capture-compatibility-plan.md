# TASK-121 — Historical Manual-Capture Compatibility & Migration Plan

## Metadata

- State: DRAFT
- Class: A — persisted/public compatibility and migration decision
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: independent QA/Architecture Reviewer
- Reviewer execution surface: independent compatibility/replay review
- Auditor: Persistence/Security Reviewer
- Auditor execution surface: independent migration/idempotency audit
- Consultants: Game Systems Consultant as needed
- Consultant execution surface(s): advisory only
- Spec: DRAFT SPEC-026
- Related: TASK-038 / TASK-039 / TASK-098 / TASK-106 / TASK-110
- Branch: not created
- Worktree: not created

## Objective

Choose and specify the compatibility/migration treatment for historical persisted manual-capture boundaries now that the accepted management-first product no longer exposes per-Encounter Ball/skip controls.

## Context

- Canonical backend still retains historical `pendingManualCapture` persistence and manual-capture command machinery for replay/compatibility.
- TASK-039 intentionally exposes only a non-actionable compatibility marker and must not fabricate an automatic resolution.
- TASK-106 explicitly requires compatibility/migration planning before removing or superseding already-persisted/public behavior.

## Scope

- Inventory every persisted/manual-capture state and completed-command shape that can exist from historical contracts.
- Decide the forward treatment for each state: preserve/read-only, migrate, deterministically resolve, or require an explicit recovery path.
- Preserve immutable historical command/economic evidence and prevent free rerolls, duplicate Ball spend, duplicate capture creation or reward duplication.
- Separate exact-existing-key historical replay from migration/recovery of unresolved pending states whose correlation has expired; replay-only transport may never mint a new manual-capture intent.
- Define migration/versioning/idempotency/rollback and replay behavior if any persisted state changes.
- Define the public compatibility surface after migration, including when the legacy marker can be removed from forward state.

## Out of scope

- Reintroducing manual per-Encounter capture UX.
- Changing accepted automatic capture policy semantics.
- Executing a production migration before Class-A acceptance and a separate implementation/deployment gate.
- Rewriting immutable historical command results.

## Acceptance criteria

- [ ] SPEC-026 inventories every legacy persisted/manual-capture boundary that must remain replay-safe.
- [ ] Human Owner selects an explicit forward treatment for each legacy state class.
- [ ] No-free-reroll, Inventory debit, capture provenance and exactly-once semantics are preserved.
- [ ] Replay-only compatibility rejects unseen keys/new manual intents; expired-correlation pending states have a separately accepted recovery/migration treatment.
- [ ] Rollback/restart/replay and partially completed historical command cases are specified.
- [ ] A separate Class-B implementation/migration task is identified only after the Class-A plan is accepted.
- [ ] Independent compatibility and persistence/security review finds no unresolved P0/P1.

## Validation / tests

- [ ] Historical fixtures cover pending, skipped, attempted-success, attempted-failure, completed replay and ambiguous/interrupted command boundaries.
- [ ] Fixtures distinguish exact-existing-key replay from expired-correlation pending recovery and prove no implicit replacement command can be minted.
- [ ] Migration plan includes dry-run/count/evidence expectations before any persistent mutation.
- [ ] Negative proof covers no new manual capture UI/API exposure in the forward product.

## Dependencies

- Historical SPEC-015/TASK-038/TASK-098 command behavior.
- APPROVED SPEC-020 management-first supersession.
- TASK-110 forward automatic capture/runtime provenance.

TASK-039 is a downstream compatibility consumer, not a prerequisite for the Class-A migration decision.

## Risks / irreversible actions

- Incorrect migration can spend/restore Items incorrectly, duplicate Pokémon creation or permit rerolls.
- Historical rows/command results must not be destructively rewritten without an accepted compatibility proof.
- No persistent migration, deploy, deletion or public API removal is authorized by this DRAFT.

## Expected files / boundaries

- `docs/specs/SPEC-026-historical-manual-capture-compatibility.md`
- Historical fixtures/evidence inventory only after plan acceptance.
- No database migration file until a separate implementation task is authorized.
