# TASK-110 — Management-First Hunt Automation, Offline & Provenance

## Metadata

- State: ACCEPTANCE
- Acceptance note: exact-current implementation is complete; independent QA and Independent Auditor report no unresolved P0/P1, and fresh delegated Class-B PM/Architecture acceptance is `ACCEPT 0/0/0/0`. Repository/history integration, persistent migration execution, production activation, deploy and public enablement remain separately gated.
- Class: B — implement accepted management-first Hunt authority without reopening product decisions
- Owner: Lead Developer
- Owner execution surface: ChatGPT delegated implementation worker
- Reviewer: independent QA Reviewer (API/domain/replay/offline/inventory conformance)
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: independent Auditor (Inventory/reward integrity, OCC/concurrency, exactly-once replay, offline target/provenance and fail-closed behavior)
- Auditor execution surface: independent ChatGPT delegated auditor
- Consultants: N/A — Capture/Potion/Revive/offline/D-F16 rules are already accepted; any new product choice must escalate
- Consultant execution surface(s): N/A
- Specs: APPROVED SPEC-015/020/021; APPROVED SPEC-013/014/017 as forward-amended
- Related: TASK-023/024/035/036/037/038/101/104/105/106/107
- Branch: `feat/TASK-110-management-first-hunt-automation-offline-provenance`
- Worktree: `.worktrees/TASK-110-management-first-hunt-automation-offline-provenance`
- Implementation branch/worktree: created from `origin/main` at `352713f1c74cb89b7ed4d20ba88f57163eda54db`; exact-current implementation, independent QA/IA and delegated Class-B acceptance are complete in this worktree. Git-history integration remains separately gated.

## Objective

Rebase authoritative Solo Hunt orchestration onto the accepted management-first contract: Capture/Potion/Revive are policy-driven automation, checkpoint/claim are internal reconciliation, offline productive progress is capped at one frozen 8-hour target, persistent vitality is authoritative, D-F16 post-Battle Revive has exactly-once replay provenance, and bounded Hunt activity supplies downstream presentation without mutating sealed Battle transcripts.

## Implementation / acceptance status — 2026-10-05

- Forward `hunt-runtime-inputs-v3` and `pokenexus.solo-hunt-checkpoint.v3` freeze exact Capture/Potion/Revive authority, persistent vitality and cadence state while preserving historical V1/V2 codecs and runtime shape.
- Capture/Potion/Revive policy persistence, independent OCC/versioning, prospective active-Hunt intervals, deterministic ordered fallback/minimum-reserve selection and exactly-once Inventory debits are implemented. Forward Capture/Potion progression requires no manual productive action.
- First-return offline reconciliation freezes one database-time return anchor and productive target capped at 8 hours; bounded continuations/retries reuse it and completed capped work rebases the checkpoint anchor without reclaiming excess absence.
- D-F16 B atomically persists post-Battle Revive debit/vitality/cadence cleanup, exact consumed PendingEncounterSelection provenance and `resolved_non_win` with no capture/reward or early Encounter N+1 publication.
- Retreat exact-boundary handling persists `abandoned_by_retreat` with zero automation spend; Retreat/`no_living` use the exact Player-wide 30-second database-clock recovery without healing on expiry. Ordinary unresolved-selection no-free-reroll remains intact.
- Versioned Hunt activity persists immutable resolved Encounter summaries with Capture/XP/item/KO/Revive/resource evidence and stable reconnect pagination capped at 64 records.
- Final PostgreSQL validation exposed and closed one forward activity bug: inter-Battle advancement had dropped the active Pokémon identity after a successful in-Battle Auto-Revive. The identity is now retained only for V3 automation states both at victory transition and through cadence advancement; a dedicated historical V2 post-victory encode/decode regression proves V1/V2 isolation remains strict.
- Exact-current independent QA: **PASS, no unresolved P0/P1**. Exact-current Independent Auditor: **PASS, no unresolved P0/P1**. Fresh delegated Class-B PM/Architecture acceptance: **ACCEPT, P0/P1/P2/P3 = 0/0/0/0**.

## In scope

1. Rebase Capture automation:
   - enabled/disabled;
   - explicit Ball permissions;
   - ordered priority/visible-condition rules;
   - minimum reserve;
   - VIP explicit opt-in;
   - no eligible Ball => no attempt/debit/prompt and Hunt continues;
   - max one accepted capture attempt per completed Encounter;
   - Encounter N capture consumes pre-N-reward Inventory and resolves before N reward commits.
2. Add Player-wide Auto-Potion policy authority:
   - initial no-saved sentinel `policyVersion=null`, `rowVersion="0"`, `enabled=false`;
   - trigger choices 90..10% by tens with `current HP <= threshold`;
   - explicit allowed items, ordered priority/fallback and minimum reserve;
   - active Pokémon only;
   - forward-only edits;
   - during/between-Battle execution using TASK-107 semantics;
   - no eligible item => no debit/prompt and Hunt continues.
3. Add automatic Revive policy authority:
   - same initial no-saved OFF sentinel;
   - target only the current Leader/active Pokémon that becomes KO in the current Hunt;
   - explicit allowed Revive items, priority/fallback/minimum reserve;
   - accepted 25% / 50% / 100% tiers;
   - no revive-specific count cap or cooldown;
   - use TASK-107 in-Battle intervention/cleanup when opponent remains living;
   - failed/ineligible Revive falls through to normal replacement or `no_living`.
4. Make Checkpoint/Claim internal/automatic reconciliation only; preserve durable idempotency/replay but expose no requirement for player-triggered progression/reward claim.
5. Rebase Hunt Start/terminal flow onto TASK-108 persisted vitality and TASK-109 strict admission/content.
6. Implement the accepted post-Battle simultaneous-KO path:
   - `BattleEnded(draw)` remains sealed and immutable;
   - successful post-Battle Revive cannot create victory/capture/victory reward;
   - D-F16 B atomically commits exactly-one Revive Inventory debit, revived HP, TASK-107 forward cadence/effect/action-lock cleanup plus action-opportunity carry, durable `PostBattleReviveApplied`, Encounter `resolved_non_win`, and matching PendingEncounterSelection consumption;
   - sealed Battle result/transcript is never mutated and no post-Battle CombatEvent is appended;
   - no Player XP, Pokémon XP, item reward or capture for that Encounter.
7. Persist full post-Battle Revive replay/provenance required by SPEC-020, including exact pending-selection identity/snapshot commitment, before/after selection RNG provenance, pinned content/rules/individualization authority, selected item/rule authority, policy version, correlation, HP and cadence readiness.
8. Enforce Retreat tie-break:
   - intervention created strictly before frozen Retreat boundary resolves first;
   - new intervention created exactly at boundary loses to Retreat;
   - no item spend/stimulus/synthetic `BattleEnded`;
   - preserve pending Battle state in sealed non-resumable snapshot;
   - persist durable Hunt-level `abandoned_by_retreat` provenance.
9. Preserve no-free-reroll/recovery lifecycle:
   - unresolved PendingEncounterSelection survives Retreat/defeat/restart under the existing no-free-reroll rule;
   - D-F16 B is the explicit exception because the Encounter is durably resolved `resolved_non_win` before its pending selection is consumed;
   - Retreat or `no_living` returns to HUB and starts exactly 30 seconds of Player-wide Solo Hunt Start recovery;
   - recovery cannot be bypassed by Zone switching, does not heal/revive on expiry, and does not block HUB/management or PokéCenter.
10. Implement first-return offline reconciliation:
   - productive target = `min(serverNow - lastCommittedWallClockAnchor, 8h)`;
   - freeze the target and return DB-time anchor on first return;
   - bounded `202` continuations reuse the same target/anchor;
   - only after complete capped commit rebase wall-clock anchor to frozen return time;
   - discard excess >8h;
   - retries cannot claim repeated chunks and partial failure cannot prematurely discard remaining capped work;
   - online/offline Capture/Potion/Revive/RNG/replay semantics are identical.
11. Introduce the forward versioned Solo Hunt checkpoint/runtime-input codec required to persist TASK-107 cadence additions and TASK-108 vitality authority across restart/offline reconciliation. Historical V1/V2 checkpoint bytes/decoders remain immutable; unsupported/missing forward authority fails closed rather than being inferred.
12. Persist/query bounded versioned Hunt activity for compact UI/offline summaries, including resolved Encounter result, capture attempt/success/fail/no-eligible disposition, Player/Pokémon XP, item rewards, Ball/Potion/Revive spend, KO/Revive and terminal reason; accepted bounded page maximum is 64.
13. Enforce fail-closed authority behavior: unavailable required rules/content/policy/Inventory/vitality/replay authority causes no productive/resource mutation or fabricated progress/reward/item use.

## Out of scope

- Defining new combat primitives; consume TASK-107.
- Creating vitality/PokéCenter storage; consume TASK-108.
- Bootstrap/Wilds/admission rule implementation; consume TASK-109.
- Combat presentation ledger/cursor/v2 projection; TASK-103 consumes this task's authoritative facts.
- Cards/frontend controls; TASK-039 consumes this task after TASK-103.
- New automation families beyond Capture/Potion/Revive.

## Acceptance criteria

- [x] Capture/Potion/Revive policies persist with exact OFF sentinels, OCC/versioning, forward-only edits and deterministic item priority/reserve behavior.
- [x] No manual Potion/capture/Checkpoint/Claim path is required for productive Hunt progression.
- [x] Online and offline automation use identical item/order/replay semantics and exactly-once Inventory debits.
- [x] D-F16 B atomic commit/retry/restart cannot duplicate Revive debit, lose consumed-selection provenance, fabricate reward/capture or publish/select Encounter N+1 early.
- [x] Retreat exact-boundary tie preserves Battle snapshot and durable `abandoned_by_retreat` evidence with zero item spend.
- [x] Ordinary unresolved-selection no-free-reroll remains intact; only successful D-F16 B consumes its selection as a durably resolved non-win exception.
- [x] Retreat/`no_living` apply the exact 30-second Player-wide Solo Hunt Start recovery while HUB/management/PokéCenter remain available and recovery expiry performs no heal.
- [x] `no_living` and replacement behavior correctly follows failed/ineligible Revive.
- [x] Offline 8h target/anchor survives bounded continuation, retry and partial failure without multiple chunks or premature discard.
- [x] Bounded Hunt activity max-64 pagination/replay is stable across reconnect/restart and never rewrites sealed Combat transcripts.
- [x] Fail-closed faults produce no fabricated mutation.
- [x] Independent QA and IA report no unresolved P0/P1; delegated Class-B acceptance is complete.

## Required validation

- Pure deterministic orchestration tests for Capture/Potion/Revive ordering, same-boundary cases, Retreat tie and D-F16.
- Disposable PostgreSQL integration for policy OCC, Inventory debit, PendingEncounterSelection consumption/provenance, vitality writeback, recovery and activity pagination.
- Restart/same-key/idempotency tests around every resource mutation and D-F16 commit.
- Direct vs segmented online/offline equivalence through an 8h capped target; partial-failure/resume and excess-discard cases.
- Forward checkpoint roundtrip/restart proves TASK-107 cadence fields and TASK-108 persisted-vitality origin survive exactly, while historical V1/V2 checkpoint fixtures remain byte/decoder compatible.
- Concurrent policy edit vs advancement and Retreat vs automation boundary tests.
- Fail-closed fault-injection for rules/content/policy/Inventory/vitality/replay authority.
- Relevant workspace lint/typecheck/test/build plus Worker-compatible bounded advancement evidence.

### Final validation evidence — 2026-10-05

- `@pokenexus/game-core` unit: **257/257 PASS**; historical post-victory V2 round-trip and forward V3 activity-boundary active identity are covered.
- `@pokenexus/database` unit: **36/36 PASS**; disposable PostgreSQL integration: **102/102 PASS**.
- `@pokenexus/api` unit: **199/199 PASS**; disposable PostgreSQL integration: **84/84 PASS**.
- `@pokenexus/game-core`, `@pokenexus/database` and `@pokenexus/api` typecheck: **PASS**; package lint: **PASS**.
- API Wrangler dry-run build: **PASS**; database Worker-compatible dry-run and API reward Worker-compatible dry-run: **PASS**.
- `roadmap:check` and `git diff --check`: **PASS** on the accepted implementation snapshot; roadmap is regenerated again after this acceptance-state update.

## Dependencies

- TASK-107 deterministic combat/cadence primitives.
- TASK-108 persistent vitality/PokéCenter implementation.
- TASK-109 bootstrap/Wilds/admission implementation.
- TASK-023/024 reward/Inventory integrity, TASK-035/036/037 Hunt/capture/reward/offline foundations, TASK-038/101 API/Retreat historical baseline.
- APPROVED SPEC-020/021 and TASK-106 acceptance.

## Risks / irreversible actions

- This slice owns high-risk exactly-once Inventory/reward/replay and offline/OCC behavior; independent audit is mandatory.
- A partial migration or mixed old/new authority can corrupt replay; all forward version gates must fail closed.
- No persistent migration execution, production enablement, deploy or Git-history action is authorized by this implementation gate.

## Readiness / execution gate

READY gate was satisfied on 2026-10-04 and implementation advanced in the dedicated owner worktree. Exact-current implementation validation, independent QA/IA and delegated Class-B acceptance completed on 2026-10-05. The task remains in ACCEPTANCE until separately authorized repository/history completion; this state does not authorize persistent migration execution, production activation, deploy or public enablement.
