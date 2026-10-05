# SPEC-025 — Durable Hunt Terminal & Offline Summary Read Contract

- Status: DRAFT Class-A — not implementation authority
- Owner: Human Owner
- Coordinator: ChatGPT
- Related ADRs: ADR-006
- Related tasks: TASK-039, TASK-041, TASK-103, TASK-110, TASK-120

## Problem

The forward client can read active Hunt state and paged Hunt Activity, but completed terminal reason and offline-return summary are not durably available after command-response loss or reload. A result screen must not infer those facts from local state or synthesize CombatEvents.

## Goals

- Define a durable owner-scoped terminal Hunt summary plus immutable per-reconciliation return/offline receipts.
- Preserve authoritative terminal reason and offline reconciliation facts across reload/reconnect.
- Reuse Hunt Activity for resolved Encounter details rather than creating a second mutable event authority.
- Make repeated reads/replay safe and bounded.

## Non-goals

- Grant rewards at Hunt end.
- Replace CombatPresentation or Hunt Activity.
- Expose private RNG/provenance secrets.
- Implement persistence/migrations before Class-A acceptance.

## Required behavior

- A terminal Hunt summary MUST be keyed to an owner-scoped Hunt identity and MUST NOT be readable cross-Player.
- Each return/offline reconciliation that produces player-visible aggregate facts MUST have an immutable receipt identity bound to that exact reconciled interval, including the frozen command/correlation identity and authoritative return anchor/target (or an equivalently monotonic immutable interval identity). A later return on the same open-ended Hunt MUST NOT rewrite an earlier receipt.
- The contract MAY expose a terminal summary that references an immutable receipt sequence/high-water, but MUST NOT collapse multiple return intervals into one mutable Hunt-only aggregate when exact prior response recovery is required.
- The read MUST require the authenticated self-scoped Player session under ADR-006/SPEC-011, accept no Player ID from the client, and fail closed when ownership cannot be established.
- Unknown and unowned Hunt/receipt identities MUST be indistinguishable through the public read surface (owner-scoped `404`); error bodies MUST be bounded/generic and MUST NOT disclose whether another Player owns the identifier.
- Summary/receipt reads MUST NOT touch session activity or perform any gameplay/session mutation.
- Terminal reason MUST be durable for the accepted retention window and survive ordinary command-response loss/reload.
- Offline/return summary facts MUST be derived from committed authoritative provenance and be stable under repeated reads.
- Resolved Encounter battle/capture/XP/drop/item-spend/KO/Revive details remain owned by Hunt Activity; the summary may reference/aggregate them only under explicitly accepted semantics.
- The contract MUST define retention/expiry, bounded response or pagination, and fail-closed behavior for missing/corrupt historical authority.
- Reading a summary MUST never trigger advancement, Item debit, reward grant, capture or other mutation.

## Edge cases

- Retreat, no-living/defeat, finite completion and open-ended return where applicable.
- 8h offline cap with excess elapsed time discarded under TASK-110 rules.
- Partial 202 reconciliation followed by reload.
- Multiple offline/return reconciliations on one open-ended Hunt, including reading an older receipt after later progression.
- Terminalization racing a read.
- Historical data expired/unavailable while Activity has different retention.

## Acceptance

- TASK-039 can render terminal/offline result state after reload without local inference, including recovery of the exact immutable return interval that produced the lost response.
- TASK-041 can test online/offline equivalence and reward integrity against one accepted read authority.
- Independent persistence/security review validates owner scope, replay stability and retention semantics.
- No duplicate reward/capture/item effects can result from reading or re-reading the summary.

## Open decisions

1. Endpoint/resource shape for terminal Hunt summary versus per-reconciliation receipt lookup.
2. Exact immutable receipt identity: command correlation + return anchor/target, server-issued reconciliation ID, or another monotonic equivalent.
3. Stored summary/receipt records vs deterministic reconstruction from retained committed provenance.
4. Exact terminal reason vocabulary and versioning.
5. Which aggregate resource facts belong in receipts/terminal summary versus only in Hunt Activity.
6. Retention window and behavior after expiry.
