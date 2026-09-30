# TASK-102 — Authoritative Solo Hunt Presentation Source Contract

## Metadata

- State: ACCEPTANCE
- Acceptance note: detailed SPEC-017 accepted by Human Owner on 2026-09-29; repository/history integration and DONE transition remain separately gated
- Class: A
- Owner: PM / Architecture Coordinator (ChatGPT project coordination)
- Owner execution surface: ChatGPT project coordination (explicit PM assignment)
- Reviewer: independent QA Reviewer (protocol, historical replay, source parity)
- Reviewer execution surface: independent ChatGPT delegated reviewer (explicit non-default; exact review-session identity to be reconciled against the previously recorded contract QA)
- Auditor: independent Auditor (Player scope, immutable evidence, cursor and transaction safety)
- Auditor execution surface: independent ChatGPT delegated auditor (explicit non-default; exact audit-session identity to be reconciled against the previously recorded contract audit)
- Consultants: N/A — no new combat, progression, economic or monetization rules; reassess if scope changes
- Consultant execution surface(s): N/A
- Spec: `docs/specs/SPEC-017-public-hunt-combat-presentation-feed.md`
- Related: ADR-004; SPEC-002/011/013/015/016; TASK-028/035/037/038/039/097/101
- Branch: `feat/TASK-039-solo-hunt-card-integration` (contract-only documentation prepared here; no TASK-102 code implementation or history action)
- Worktree: `.worktrees/TASK-039-solo-hunt-card-integration` (accepted source snapshot retained as untracked local documentation pending authorized history integration)

## Objective

Obtain acceptance of the smallest complete Class-A source, persistence and HTTP contract for a real, bounded TASK-028 Combat presentation feed, so the TASK-039 frontend can consume authoritative Battle events without reconstructing hidden values or violating existing Hunt command semantics.

## Owner decisions already resolved

- The Human Owner approved public Hunt Combat presentation direction on 2026-09-29.
- The Human Owner accepted inference of damage dealt **to owned Pokémon** from exact HP changes between Battle bootstraps and committed state reads for MVP. Keep TASK-028 event masks, never expose numeric wild HP/Genetics, and revisit owned-damage inference only after MVP if necessary. This is **not** an open MVP decision.

## Source-verified constraints

- The original locked Team read includes each member's `individualization.shiny`, but `apps/api/src/hunts/runtime.ts` discards it when constructing the frozen `SoloHuntTeamMemberSnapshot`. The existing frozen input envelope v1 and checkpoint v1/v2 enforce strict shapes. A new format must pin shiny at Start, with **new additive input/checkpoint versions** and the legacy readers and in-flight writes kept byte-compatible.
- The authoritative Battle initialization returns **post-`battleStart`-reaction** state. Battle bootstrap initial owned HP and active roster must be captured from validated pre-reaction `BattleInitInput` or an equivalent immutable core-produced sidecar; test with a time-zero heal and the original `BattleStarted` plus subsequent events.
- Replay currently verifies prior/completed stimuli, cadence effects, deterministic RNG and outcome, but discards reconstructed `CombatEvent` arrays. The transient `advanceSoloHunt...events` value is not stored by the API. A historical transcript cannot be asserted from `currentHp`, current Collection Shiny, terminal response or a renderer-only fixture.
- Advancing a Hunt first commits a checkpoint at the successful Encounter boundary; reward/capture and due-heal consequences complete in later transactions. An event feed must not publish Battle N+1 before Encounter N's committed reward/capture and all same-boundary due heals. Retreat terminalization may live in the database Hunt row without `SoloHuntRuntimeState.status='terminal'`; read termination from the committed authoritative row.
- Existing checkpoints overwrite state with OCC; they do not form an append-only event index. A late-page GET that replays an unbounded Hunt prefix violates the read budget. APPROVED SPEC-017 selects a transactional, indexed public projection ledger. Its implementation, measured production-compatible workload evidence and public-enablement acceptance remain open.
- `solo_hunts.terminal_at` is the checkpoint's logical-time wall-clock anchor, used by SPEC-015 recovery. A delayed bounded-`202` terminalization may commit substantially later; proposed 30-day presentation retention requires an independent database transaction-time anchor without changing recovery.

## Scope — contract and source-proof only

- Freeze the exact new-Hunt immutable team Shiny binding, input/checkpoint schema versioning, old-Hunt `410 presentation_unavailable` behavior and version-aware writes across Start, checkpoint, claim, healing and cleanup.
- Freeze Battle origin sidecar/projection semantics: IDs, roster order, original active status, pre-reaction owned HP/maxHP, source wild Shiny, time-zero reactions, contiguous source sequence, cutoffs and zero-gap ordering.
- Review the proposed immutable indexed ledger and `UNIQUE(huntId,eventIndex)` seek, canonical public row bytes, **separate private unprojected source commitments**, idempotent event identity, committed public prefix digest, bounded producer checkpoint yields, durable permanent-presentation-unavailable disposition, terminal marker, source binding and fail-closed partial-publication behavior; benchmark the accepted design before enabling its public read.
- Freeze the `GET /player/hunts/:huntId/presentation` self-scoped API, payload schema, cursor signing/key rotation, snapshot/resume semantics, 128-event/4-envelope/256KiB ceiling, transaction-clock terminal retention and an explicit no-events sentinel under SPEC-017.
- Define a complete conformance matrix for direct/segmented/history/restart parity, old-version failures, forced replacement, time-zero abilities, explicit heal, policy/capture boundary, loss/draw/no-living/retreat, cursor/security/privacy and early/mid/late workload.
- Reconcile SPEC-017 with the accepted owned-damage inference and with SPEC-015/ADR-004, then obtain independent QA + security/persistence audit and Human Owner acceptance of the detailed contract.

## Out of scope

- This contract-only task does not implement the public HTTP endpoint, retention/background worker, migration, `SoloHuntTeamMemberSnapshot` or checkpoint/source schema mutation. That work belongs exclusively to the separately owned TASK-103 under APPROVED SPEC-017.
- No fake `shiny=false`, current Collection backfill, forged CombatEvent, wild HP/Genetics export, automatic rewards, game-rule/capture/cadence change or UI renderer rework.
- No unilateral commit, push, merge, deploy or irreversible schema/history rewrite.

## Class-A contract acceptance criteria (before backend READY)

- [x] SPEC-017 accepted by Human Owner on 2026-09-29 with one documented versioned origin/persistence strategy that preserves old checkpoint semantics.
- [x] Define transactional commit boundaries, private-source replay proof, producer event/row/byte budget policy and safe mid-Battle `202` yield, recoverable rollback versus permanent presentation-only failure with atomic gameplay continuation, and unique append-only event order for first Battle, later Battle, due heal, terminalization, retries and source failures; freeze new input/checkpoint versions and terminal retention clock. Numerical producer limits require later production-compatible measurements before endpoint enablement.
- [x] Independent QA and security/persistence reviewers assess the proposed architecture, authz/ownership/Origin/CORS/session/non-mutating GET, cursor tamper/replay/expiry, snapshot promotion and historical fail-closed rules.
- [x] Human Owner accepts the detailed Class-A spec on 2026-09-29. TASK-103 is materialized as a separate backend implementation task with one owner and independent reviewer/auditor; TASK-039 continues separately under FE ownership. Neither merge nor feed enablement is implied.

## Separate implementation / public enablement gates

- [ ] An approved backend task implements original, validated pre-reaction Battle origin, immutable Shiny and strict input-v2/checkpoint-v3 binding, version-aware bounded writers, separately stored but transactionally committed private-source proof, append-only public projection and self-scoped snapshot-consistent indexed endpoint.
- [ ] Source-level conformance tests demonstrate direct/segmented/restart event equality, time-zero HP origin, historical failures and transactional first/later Battle publication; pure fixture proofs alone do not certify storage.
- [ ] Integrated database and security tests prove event idempotence including public-byte collision/private-source mismatch, immutable prefix, safe producer budget yield/oversize failure, permanent-unavailability behavior for both existing and fresh cursors, **atomic terminal row/retention anchor/last presentation generation sealing**, healing/terminal race handling, cursor key rotation and expiry, bounded cursor ingress, cross-Player protection, consistent reader snapshot and safe rollback/failure behavior.
- [ ] Production-compatible early/middle/late/terminal reads, high-event producer segments and maximum-retention workload benchmarks establish measured CPU, SQL read/write row/byte counts, latency and storage-growth limits before public reads are enabled.
- [ ] Independent implementation QA/audit, real deployed authority verification and Human acceptance of public enablement precede mounting a real TASK-039 consumer.

## Validation / tests

- [x] Pure `packages/game-core/src/solo-hunt.test.ts`: transient direct event stream equals checkpoint-v2-roundtrip-and-resume stream in the bounded fixture, and the first completed Battle's engine events can be re-executed from its retained normalized stimuli and original frozen inputs. No durable DB publication, general historical feed or persisted Shiny is claimed.
- [x] Pure `packages/game-protocol/src/combat-presentation.test.ts`: `battleStart` healing changes the post-init state while the projector accepts **test-supplied** earlier owned HP and masks the healed event; the future authoritative Hunt origin producer is not yet implemented or proven.
- [x] Independent QA **source/contract** review of the proposed versioned origin/index transaction model: PASS, no P0/P1/P2 on the final DRAFT snapshot. Does not attest a deployed or implemented event feed.
- [x] Independent security/persistence **pre-implementation contract** audit of the public API proposal, existing transaction behavior and forward-only migration boundary: PASS, no P0/P1/P2 on the final DRAFT snapshot. The eventual migration, SQL implementation and live endpoint still require the independent implementation audit in the separate enablement gates above.
- [ ] Worker-compatible bounded producer/read workload benchmark with documented CPU, SQL read/write bytes/rows, safe mid-Battle yield and retention measurements before enablement.

The final DRAFT reviewed by both independent roles was `SPEC-017` SHA-256 `754A4ACFE38FB2A3CA1694AEE72F48B2878AF40E176798A5E75B79A7663555B2` and this task document SHA-256 `12D2B04AA2877C1CF6687DA39ACD7D8DDA73F7902802998C88CF695DE7BCAAF9` **before review-record and acceptance-status updates**. The Human Owner explicitly replied `Aceito SPEC-017` on 2026-09-29; the accepted semantic contract is that reviewed DRAFT, and only status/governance references were subsequently adjusted. Reviews were read-only against the cited source and accepted contracts; no PostgreSQL, Worker, production-browser, migration or public-route tests were run for TASK-102. **Class-A contract acceptance is complete; implementation and public-enablement gates remain open.**

## Dependencies

- TASK-028/035/037/038/097/101 (DONE), with TASK-039 consumer pending. SPEC-017 is APPROVED; TASK-103 separately owns backend implementation and mandatory independent implementation QA/security/persistence gates.

## Risks / irreversible actions

- Schema migration, legacy checkpoint re-interpretation, public security/privacy and historical-retention behavior remain governed by the accepted Class-A contract. Only forward-only additive migrations are eligible for later TASK-103 implementation; rollback/fail-closed behavior must be explicit. This contract acceptance does not authorize Git-history mutation, migration execution or public feed enablement.

## Expected files / boundaries

- `docs/specs/SPEC-017-public-hunt-combat-presentation-feed.md` and this canonical task document are the contract artifacts.
- Later approved implementation: `packages/game-core/src/solo-hunt.ts` / `solo-hunt-checkpoint.ts`, `apps/api/src/hunts/runtime.ts` / `application.ts` / `http.ts`, new versioned database storage as needed, and `apps/web/src/hunt-api.ts` plus TASK-029 renderer consumer in TASK-039. Keep distinct backend and frontend owners.

## Completion

Use `docs/agents/handoff-protocol.md`; SPEC-017 contract acceptance is not implementation sign-off, authorized Git-history completion or production enablement. Keep this task in ACCEPTANCE until repository/history integration is separately authorized and completed.
