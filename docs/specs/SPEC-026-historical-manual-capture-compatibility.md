# SPEC-026 — Historical Manual-Capture Compatibility & Migration

- Status: DRAFT Class-A — not implementation or migration authority
- Owner: Human Owner
- Coordinator: ChatGPT
- Related ADRs: ADR-006
- Related tasks: TASK-038, TASK-039, TASK-098, TASK-106, TASK-110, TASK-121

## Problem

Historical accepted Hunt contracts persisted manual pending-capture state and durable manual-capture commands. APPROVED SPEC-020 removes per-Encounter capture/Ball-choice UX from the forward product, but canonical persistence still has legacy states that cannot be discarded or reinterpreted safely without an explicit compatibility plan.

## Goals

- Inventory every legacy persisted/manual-capture state that can still be encountered.
- Select a deterministic forward treatment for each state class.
- Preserve no-free-reroll, Inventory debit, capture provenance, completed-command replay and exactly-once semantics.
- Define when the forward API/client can stop exposing the legacy compatibility marker.

## Non-goals

- Reintroduce manual capture UX.
- Change forward automatic capture policy semantics.
- Rewrite immutable historical command outcomes.
- Execute a production migration before separate implementation/deployment authorization.

## Required behavior

- Every historical state class MUST have an explicit treatment: preserved/read-only, migrated, deterministically resolved, or surfaced through a bounded recovery path.
- Any migration MUST be idempotent, restart-safe, auditable and versioned.
- Migration/recovery MUST remain Player-scoped and bind the exact historical Hunt/Encounter/command identities; no compatibility path may resolve or replay another Player's state.
- Existing Ball debit/capture creation/reward evidence MUST NOT be duplicated, refunded, re-rolled or silently dropped unless the accepted plan explicitly proves the economic/replay semantics.
- Pending Encounter/no-free-reroll authority MUST remain coherent across migration/recovery.
- Completed historical command replay MUST remain immutable or have a formally versioned compatibility adapter; stored completed results are not rewritten ad hoc.
- If legacy manual-capture HTTP routes remain temporarily available in replay-only mode, they MUST accept only an exact already-existing durable historical correlation/key + frozen intent/result. Unseen keys or new intents MUST be rejected and MUST NOT advance, debit Inventory, create a capture, or otherwise recreate forward manual-capture mutation authority.
- An unresolved pending manual-capture decision whose historical command correlation has expired is **not** replay. It MUST be classified under an explicitly accepted migration/recovery treatment before replay-only conversion or route removal; the compatibility layer may not mint a replacement manual-capture command implicitly.
- If an accepted recovery path economically auto-resolves a pending historical capture, the pending-state transition plus any Ball debit, capture creation/reward provenance and migration-version evidence MUST commit atomically under Player serialization/OCC and remain exactly-once across restart/retry.
- Forward UI MUST remain management-first and MUST NOT regain manual Ball/skip controls.

## Edge cases

- Pending capture with no currently eligible Ball.
- Command frozen but transport result lost.
- Pending decision whose durable correlation/idempotency replay window expired before resolution.
- Completed attempt success/failure or skip with stale pending marker.
- Player with a newer active Hunt while an older legacy row still exists.
- Migration interrupted between persistence steps.
- Rollback to older application code after a new migration version.

## Acceptance

- Human Owner explicitly selects treatment for each legacy state category.
- Independent architecture/replay review confirms no reroll/economic duplication path.
- Persistence/security review validates idempotency, restart and rollback strategy.
- A separate Class-B implementation task and dry-run evidence gate are defined before any persistent mutation.

## Open decisions

1. Exact inventory/count of legacy row/command states present in supported environments.
2. Whether unresolved pending states are preserved, auto-closed, converted to forward automatic authority, or require recovery.
3. Compatibility duration and whether old manual-capture HTTP commands remain routable for exact-existing-key historical replay only.
4. Migration rollout/rollback/version marker design.
5. Criteria for removing `pendingManualCapture` from the forward public state shape.
