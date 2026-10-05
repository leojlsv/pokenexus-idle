# TASK-120 — Durable Hunt Terminal & Offline Summary Contract

## Metadata

- State: DRAFT
- Class: A — new durable public read contract
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent protocol/replay reviewer
- Auditor: Security/Persistence Reviewer
- Auditor execution surface: independent owner-scope/retention/integrity audit
- Consultants: Game Systems Consultant as needed
- Consultant execution surface(s): advisory only
- Spec: DRAFT SPEC-025
- Related: TASK-039 / TASK-041 / TASK-103 / TASK-110
- Branch: not created
- Worktree: not created

## Objective

Define a durable owner-scoped read contract for completed Hunt terminal reason plus immutable per-reconciliation offline/return receipts so reload/reconnect/history views can recover the exact authoritative interval facts without depending on ephemeral command responses or synthesizing Battle events.

## Context

- TASK-110 provides authoritative Hunt Activity rows and offline reconciliation effects.
- Current public Hunt state exposes active Hunt/recovery state but not a durable terminal reason or completed return summary.
- TASK-039 therefore cannot satisfy its terminal/offline summary acceptance criterion after reload without inventing state.
- TASK-041 is a downstream E2E consumer and does not own this missing backend contract.

## Scope

- Define owner-scoped durable lookup identity and retention for a completed Hunt summary.
- Define immutable identity for each offline/return reconciliation interval on long-lived/open-ended Hunts; later returns cannot overwrite earlier receipts.
- Define canonical terminal reason exposure.
- Define authoritative offline/return facts and whether they are stored directly or deterministically reconstructed from retained provenance.
- Reuse Hunt Activity for resolved Encounter facts instead of duplicating/synthesizing CombatEvents.
- Define replay/idempotency semantics across reload, reconnect, repeated reads and late Activity pagination.
- Define bounded response/pagination rules and failure behavior for expired/unavailable historical data.

## Out of scope

- CombatPresentation event transport or mutation.
- New reward grants at Hunt end.
- Client-side arithmetic becoming authoritative.
- Persistent implementation/migration before Class-A acceptance.
- Production retention tuning without explicit acceptance.

## Acceptance criteria

- [ ] SPEC-025 defines a durable terminal-Hunt summary plus immutable per-reconciliation receipt contract sufficient for TASK-039 result/offline UI.
- [ ] Terminal reason survives command-response loss and ordinary reload/reconnect within the accepted retention window.
- [ ] Offline/return resource facts are authoritative and exactly-once/replay safe; an exact older reconciliation receipt remains stable after later progress/returns on the same Hunt.
- [ ] Encounter-level battle/capture/XP/drop/spend/KO/Revive facts remain sourced from Hunt Activity and are not fabricated as CombatEvents.
- [ ] Owner scoping, retention/expiry, pagination/size and corruption/unavailability behavior are explicit.
- [ ] Independent protocol + persistence/security review finds no unresolved P0/P1 before implementation authorization.

## Validation / tests

- [ ] Contract examples cover retreat, no-living/defeat, finite completion and open-ended return cases as applicable to accepted runtime semantics.
- [ ] Repeated read, reload, 8h-cap return, multiple sequential returns on one open-ended Hunt, partial reconciliation and expired-history cases are specified.
- [ ] Reward-integrity review proves the summary cannot imply or trigger duplicate grants.

## Dependencies

- TASK-110 runtime/activity provenance.
- APPROVED SPEC-020 management-first offline/return product requirement.

TASK-039 and TASK-041 are downstream consumers of this contract, not prerequisites for defining it.

## Risks / irreversible actions

- A summary that is not durably bound to authoritative Hunt identity/provenance can misreport resources after retries.
- Duplicating Activity as a second mutable ledger would create conflicting authorities and is prohibited.
- No migration, implementation, deploy or public enablement is authorized by this DRAFT.

## Expected files / boundaries

- `docs/specs/SPEC-025-durable-hunt-terminal-offline-summary.md`
- `docs/project/PROJECT_ROADMAP.md`
- TASK-039/TASK-041 dependency updates after acceptance.
