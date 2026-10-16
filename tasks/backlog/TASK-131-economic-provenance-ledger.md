# TASK-131 — Economic Provenance Ledger

## Lifecycle

`PLANNED`

Design approved direction:

- critical economic actions;
- domain intent + persistence verification;
- hot storage plus archival strategy;
- no XP/progression telemetry (covered by SPEC-030).

Specification draft:

`docs/specs/SPEC-029-economic-provenance-ledger.md`

Status:

`SPEC approved — awaiting implementation planning`

## Objective

Design a future append-only economic provenance capability for new gameplay actions.

The goal is to make future economic effects independently auditable by preserving the relationship between:

- player;
- command/action origin;
- economic resource change;
- authority version;
- immutable event identity.

## Relationship with TASK-130 / SPEC-026

This task is intentionally separate from historical manual-capture compatibility.

It MUST NOT:

- retroactively prove old H4 attempted captures;
- retroactively prove H5 zero effects;
- weaken SPEC-026 evidence requirements;
- create historical receipts from mutable state.

TASK-130 remains the bounded historical compatibility implementation.

## Initial design questions

- Event schema and immutable identity model.
- Command correlation requirements.
- Inventory/reward/capture integration boundaries.
- Hashing and audit verification strategy.
- Retention and query model.
- Migration strategy for future actions only.

## Related future capability

Balance and progression analysis is intentionally separated into a future SPEC-030 Gameplay Balance Telemetry capability.

Examples:

- XP/hour;
- money/hour;
- KO/hour;
- loot/hour;
- progression pacing.

TASK-131 should not become a gameplay analytics pipeline.

## Non-goals

- No production migration.
- No runtime economic changes.
- No historical backfill claims.
- No automatic migration closure logic.

## Entry gate

Requires separate Human approval of the specification before implementation.

## Current checkpoint

Reached the first Human Owner review boundary:

- draft specification prepared;
- scope boundaries defined;
- TASK-130 separation recorded;
- no runtime/database implementation started.

## Dependencies

- Economic Provenance design approval recorded under SPEC-029 (renumbered to avoid an already assigned SPEC-027).
- Implementation requires separate architecture review and migration planning.
- Gameplay Balance Telemetry is tracked separately in TASK-132.

## Approved design boundary

- Economic Provenance Ledger covers critical economic actions.
- Gameplay Balance Telemetry is defined separately in SPEC-030.
- XP/hour, money/hour, KO/hour and progression metrics belong to telemetry, not provenance.
- Implementation requires a separate execution plan and implementation task.
