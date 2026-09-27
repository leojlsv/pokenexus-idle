# TASK-098 — Authoritative Hunt API Contract Spec

## Metadata

- State: DONE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: current ChatGPT project coordination session
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh isolated Claude Code CLI session (read-only tools only)
- Auditor: Independent Auditor (authz, concurrency, idempotency and transaction composition)
- Auditor execution surface: separate fresh isolated Claude Code CLI session (read-only tools only)
- Consultants: Gameplay Systems Consultant (GSC) + Player Experience & Economy Consultant (PXE)
- Consultant execution surface(s): independent ChatGPT role-specific worker assignments
- Spec: `docs/specs/SPEC-015-authoritative-hunt-api-contract.md`
- Related specs: SPEC-003/004/005/006/007/009/010/011/013/014
- Related ADRs: ADR-006
- Related tasks: TASK-017, TASK-024, TASK-025, TASK-033, TASK-035, TASK-036, TASK-037, TASK-038, TASK-096, TASK-097
- Branch: `main` governance worktree; TASK-098 repository/history completion authorized by Human Owner on 2026-09-27
- Worktree: `.worktrees/main-governance-integration`

## Objective

Freeze the public v1 Solo Hunt HTTP/persistence orchestration contract before TASK-038 implementation so
the Class B implementation consumes accepted route/payload, idempotency, fixed-cutoff, auto-capture policy,
transaction-ordering and recovery semantics instead of inventing public protocol behavior.

## Why this prerequisite exists

SPEC-013 explicitly delegates exact public idempotency keys, command payloads and persistence/API
orchestration to TASK-038. Repository governance classifies public protocol semantics as Class A. The
roadmap currently labels TASK-038 as Class B, so an accepted contract spec must precede endpoint code.

The task also surfaces one previously unspecified gameplay/economy ordering: whether immediate auto-capture
of Encounter N can use Ball items granted by Encounter N's own reward. SPEC-015 proposes pre-current-reward
Inventory for that automatic boundary while a later manual attempt uses then-current Inventory. GSC/PXE
advisory plus Human acceptance are required.

## Scope

- exact self-scoped Hunt route/method/payload/error set;
- durable public command idempotency; exact TASK-037 advancement binding; 1:1 manual-capture correlation
  plus Encounter-owned zero/many automatic TASK-036 correlations for advancing commands;
- one-active-Hunt/recovery/no-free-reroll persistence contract;
- Player-wide Hunt-state public read without hidden authority leakage;
- checkpoint/claim/retreat semantics over TASK-037 fixed cutoffs;
- explicit normal healing-item/Potion command transport with SPEC-013 inter-Battle ordering, no auto-use
  and no revival;
- manual attempt/skip capture commands;
- exact standing auto-capture policy schema, bounds and warning acknowledgement;
- forward-only policy activation by logical interval;
- automatic per-Encounter capture boundary required for offline advancement;
- transaction ordering across reward, capture, checkpoint and policy state;
- explicit deployment dependency on accepted production capture-Ball content.

## Out of scope

- production endpoint implementation;
- database migration/repository implementation;
- changing capture odds, Ball powers, Genetics/Shiny, rewards or recovery;
- Ball ItemId publication, prices, stock, faucets or monetization;
- Card/Pixi UI;
- deployment/cutover;
- Git history mutation without separate Human Owner authorization.

## Acceptance criteria

- [x] SPEC-015 is internally consistent with SPEC-013/014 and TASK-036/037.
- [x] Public authz/CSRF/self-scope behavior is explicit.
- [x] Command correlation/replay/supersession semantics cannot reinterpret a retry.
- [x] Public command replay retention/expiry is explicit and bounded; expired supported retries cannot
      silently execute as a fresh command during the accepted replay/tombstone window.
- [x] Pending/progressing transport commands have a bounded 30-day continuation lease; expiry cannot execute
      an uncommitted capture/policy/retreat consequence or fabricate a new heal. A heal already materialized
      as scheduled domain state follows its frozen Hunt boundary independently of key retention.
- [x] Accepted scheduled-heal domain state is independent of Idempotency-Key retention: transport expiry
      returns 410 but cannot cancel/re-time an already accepted heal boundary.
- [x] Bounded TASK-037 segmentation is explicit as 202 same-key continuation; no Worker request requires an
      unbounded internal loop to reach the frozen cutoff.
- [x] Manual capture freezes source-Hunt and current advancement-Hunt identities independently; retry can
      never substitute a later active Hunt.
- [x] Explicit normal healing-item use is durable-idempotent, waits for the accepted inter-Battle
      boundary when submitted during Battle, atomically composes Inventory debit + shared heal consequence,
      never revives and is never fabricated by offline advancement; due heals resolve at most one per
      invocation with same-key 202 continuation so Worker execution remains bounded.
- [x] A cutoff exactly at Battle/gap end persists the inter-Battle sub-instant before zero-gap/next-Battle
      initialization, so retries cannot insert healing before already-committed history.
- [x] Advancing commands accept no client clock/cutoff; first server cutoff is frozen under TASK-037.
- [x] Server cutoff derivation cannot move logical time backward under cross-Worker clock skew.
- [x] One-active-Hunt and Player-wide recovery are concurrency-safe by contract.
- [x] All Hunt/policy mutations share one Player-wide serialization boundary with correlation re-check.
- [x] Same-Zone pending selection survives retreat/restart without free reroll.
- [x] Auto-capture policy uses only visible frozen facts and exact server-authorized Balls.
- [x] Historical policy evaluation pins exact immutable Ball authority and never substitutes latest.
- [x] VIP/premium auto-use cannot become implicit fallback.
- [x] Policy-save timing is forward-only after elapsed history is reconciled under the prior version.
- [x] Policy PUT expectedRowVersion is revalidated at the final activation boundary after any 202 prelude;
      an intervening save yields durable stale instead of silent overwrite.
- [x] Policy PUT freezes exact Ball/content validation authority before any 202 catch-up and has a fixed
      first-acceptance error order.
- [x] Manual pending capture can coexist with future automatic capture without retroactive conversion.
- [x] Auto-disabled Encounter completion creates/no-replaces the one Player-wide manual pending decision
      exactly as SPEC-013 requires.
- [x] Accepted manual attempt consequence and pending-decision closure are atomic.
- [x] Manual capture acceptance does not reserve Inventory; the final capture transaction is the resource
      linearization point when no active-Hunt prelude applies, and committed Hunt history is never replayed.
- [x] Encounter reward RNG and manual/automatic capture RNG origins are server-owned and replay-stable.
- [x] Automatic reserve selection and Ball debit use one locked authoritative Inventory boundary.
- [x] Claim reporting is bounded/aggregated and remains deterministic across response-loss recovery.
- [x] Encounter N reward/capture application completes before N+1 productive advancement so N's item
      grants deterministically participate in N+1 Inventory-dependent auto-capture.
- [x] Encounter N auto-capture eligibility/selection/debit uses locked pre-N-reward Inventory and cannot be
      funded by N's own reward even across retry/restart.
- [x] Route/domain errors are explicitly mapped and all nested auto-policy objects are fail-closed schemas.
- [x] New commands against owned terminal/non-current Hunts have an explicit public outcome.
- [x] Hunt state does not expose wild HP/HP% fields that can help infer hidden Genetics pre-capture.
- [x] Reward/capture boundary ordering is explicit and reviewed by GSC/PXE.
- [x] No production Ball content is invented.
- [x] Independent QA reports no unresolved P0/P1.
- [x] Independent Auditor reports no unresolved P0/P1.
- [x] GSC/PXE consultation surfaces no unresolved material issue beyond Human choices.
- [x] Human Owner explicitly accepts SPEC-015, including same-Encounter ordering and the disabled/no-saved
      auto-capture default, before TASK-038 becomes READY.

## Validation / review

- cross-spec/task consistency review;
- API/authz/protocol completeness review;
- concurrency/idempotency/transaction audit;
- GSC advisory on Hunt/capture-loop ordering;
- PXE advisory on Ball-sink/reward ordering and premium Ball authorization;
- `corepack pnpm roadmap:generate`;
- `corepack pnpm roadmap:check`;
- `git diff --check`.

## Dependencies

- TASK-017 — DONE; authenticated Player identity.
- TASK-024 — DONE; reward resolution/application authority.
- TASK-025 / SPEC-011 — DONE/APPROVED; reusable self-scoped HTTP/session conventions.
- TASK-033 / SPEC-013 — DONE/APPROVED; Solo Hunt lifecycle.
- TASK-035 — DONE; deterministic Hunt simulation.
- TASK-036 — DONE; canonical capture/reward resolver.
- TASK-037 — DONE; checkpoint/OCC/fixed-cutoff advancement.
- TASK-096 / SPEC-014 — DONE/APPROVED; acquisition and auto-capture semantics.
- TASK-097 — DONE; immutable Encounter individualization.

## Current execution state

SPEC-015 is DRAFT. No TASK-038 production code has started.

Pre-acceptance review history:

- Independent Auditor initially found manual-capture crash atomicity plus three protocol ambiguities;
  all were reconciled, and the resulting re-gate returned P0/P1/P2/P3 `0/0/0/0`.
- QA initially found four P1 protocol gaps: bounded TASK-037 continuation, auto-OFF manual pending,
  route-specific error mapping and fail-closed nested policy schemas. All were reconciled; subsequent
  re-gate returned READY with P0/P1/P2/P3 `0/0/0/0`.
- GSC advisory recommends accepting pre-current-reward immediate auto-capture and reports no objection to
  the conservative disabled/no-saved policy already present in the consulted snapshot, while requiring
  clear diagnostics for pending-slot loss, ordered-rule shadowing,
  reserve meaning, old-policy reconciliation and 202 same-key continuation.
- PXE advisory likewise recommends accepting the ordering and explicit opt-in/no-implicit-premium
  direction; retain delayed-manual current Inventory,
  auto-only reserves, ordered fallback, explicit premium/VIP opt-in, irreversible no-eligible closure and
  forward-only policy. Numerical Ball-scarcity tuning remains unavailable until production faucets/prices/
  stock and measured Encounter cadence exist.
- The later exact QA gate found one remaining P1 plus P2/P3 clarifications (owned terminal/non-current Hunt
  commands, replay retention, next-Encounter reward visibility, hidden-Genetics HP side-channel, manual
  error ordering, policy-schema edge cases and claim-report supersession semantics). These have been
  reconciled and require fresh exact-current QA/IA before Human acceptance.
- A subsequent exact QA gate was READY with no P0/P1 but found one P2: SPEC-013's explicit Hunt Potion
  command transport was missing, plus clarity P3s. SPEC-015 now includes explicit heal-hp transport with
  inter-Battle waiting/ordering, no revival/no auto-use, and those P3 clarifications; fresh exact-current
  QA/IA are still required.
- The next exact QA/IA gate on the healed protocol returned QA READY `0/0/0/3` and Auditor PASS
  `0/0/0/4`; all findings were non-blocking clarity items. Those items were reconciled in the current
  snapshot, including complete policy-route/error/body strictness, clock-skew treatment for heal cutoffs,
  explicit shared serialization of manual-capture availability, and the intentional Inventory
  linearization rule for a resumed manual command alongside a newer Hunt.
- A further exact-current QA/IA gate returned QA READY `0/0/0/3` and Auditor PASS `0/0/0/2`. Its remaining
  P3s were wording/traceability only: scheduled-heal record + cutoff atomicity, replay-lifetime epoch
  clarity, `resolved` rather than `applied` heal-limit wording, Encounter-boundary retry wording, and this
  review-history entry. Those were reconciled.
- The next exact-current gate returned QA READY `0/0/0/2` and Auditor PASS `0/0/0/0`. QA's two remaining
  P3s were request-body UUID canonicalization and UI/readback clarity for scheduled heals. The current
  snapshot requires canonical lowercase UUIDs in mutation bodies and explicitly keeps durable scheduled-heal
  queue readback out of the v1 state contract; UI may show an accepted waiting heal only while it retains
  that command correlation locally.
- Final exact-current re-gate on SPEC-015 SHA256
  `8A28C6C82448445EE4B9A1FE64572DB42FFB4A2884678776588788C1DFF6838C` (1496 lines) and TASK-098 SHA256
  `0AF9A59CD5FFAAA3EBF4F0A8099CCA2E74A424F9664E2E82E0A80E92ECC92747` (196 lines) returned QA READY
  `0/0/0/0` and Independent Auditor PASS `0/0/0/0`, with no findings or blockers.

All acceptance criteria are satisfied. On 2026-09-27 the Human Owner explicitly approved SPEC-015, including
the same-Encounter pre-reward automatic-capture ordering and the disabled/no-saved auto-capture default.
SPEC-015 is now APPROVED. On 2026-09-27 the Human Owner separately authorized TASK-098 repository/history
completion after semantic acceptance.

## Completion

TASK-098 is DONE. SPEC-015 is APPROVED after final exact-current QA READY and Independent Auditor PASS
with P0/P1/P2/P3 `0/0/0/0`, required GSC/PXE consultation, explicit Human Owner semantic acceptance, and
separate repository/history completion authorization on 2026-09-27.

No TASK-038 production implementation was performed by TASK-098. TASK-038 becomes dependency-clear only
after this approved contract/task snapshot is canonically integrated and must then follow its own Class B
READY/implementation/review/acceptance flow.
