# TASK-107 — Management-First Combat / Cadence Automation Primitives

## Metadata

- State: DONE
- Completion note: independent QA reports TECH READY with P0/P1/P2 = 0/0/0; delegated Class-B functional/architectural acceptance completed on 2026-10-02; Human Owner continuation authorized repository/history completion and the accepted implementation was integrated into local `main` at `ec647c70488b`; deploy/public enablement remain separately gated
- Readiness note: Human Owner explicitly authorized implementation on 2026-10-02 after the accepted Class-A decomposition; runtime implementation may proceed inside this task scope, while Git-history/deploy/public-enable remain separate gates
- Class: B — implement accepted Class-A combat/cadence rules without redefining product semantics
- Owner: Lead Developer
- Owner execution surface: ChatGPT delegated implementation worker
- Reviewer: independent QA Reviewer (determinism, lifecycle, replay and historical-version compatibility)
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: N/A — no persistence/security boundary is owned by this slice; reassess if scope expands
- Auditor execution surface: N/A
- Consultants: N/A — gameplay decisions are already accepted in SPEC-020; new rule choices must escalate rather than be inferred
- Consultant execution surface(s): N/A
- Specs: APPROVED SPEC-003 as forward-amended by APPROVED SPEC-020; APPROVED SPEC-013/015/017 as consumers
- Related: TASK-008/009/010/035/037/106
- Branch: `feat/TASK-107-management-first-combat-cadence-primitives`
- Worktree: `.worktrees/TASK-107-management-first-combat-cadence-primitives`

## Objective

Implement the deterministic game-core and cadence primitives required by the approved management-first Solo Hunt rules so authoritative Hunt orchestration can apply automatic Potion and Revive without embedding policy, Inventory or persistence decisions inside the combat engine.

## In scope

1. Add a versioned external-item/action-opportunity path that can apply accepted non-Move Hunt actions at deterministic logical boundaries without advancing the Move cursor or consuming a Move cooldown.
2. Implement successful Auto-Potion cadence consequences:
   - target remains conscious;
   - same-boundary damage/DoT resolves first;
   - successful heal consumes one future GCD/action opportunity;
   - successful heal establishes the accepted 5-second per-Pokémon Auto-Potion cooldown on Hunt logical time;
   - ordinary Potion never revives.
3. Implement the accepted first-version KO-intervention primitive:
   - exact pending intervention side/combatant identity is deterministic and replayable;
   - intervention-side `activeCapacity = 1`;
   - in-Battle intervention exists only while at least one non-intervention side still has a living Combatant;
   - if the resolved chain exhausts the opponent/non-intervention side, `BattleEnded` seals first.
4. Implement successful Revive combat/cadence consequences:
   - restore the authoritative HP amount supplied by Hunt authority;
   - clear transient buffs, debuffs, DoTs, HoTs, status/effect instances and action locks;
   - reset nonzero stat stages to neutral;
   - preserve Move cooldowns and Move sequence/cursor;
   - consume one future GCD/action opportunity;
   - do not immediately chain Auto-Potion at the same boundary.
5. Emit deterministic in-Battle cleanup CombatEvents in the accepted order:
   - `CombatantRevived`;
   - one `EffectRemoved` per removed effect ordered by `(applicationSequence, effectId UTF-8)`;
   - one `StatStageChanged` per nonzero stage in fixed `atk/def/spa/spd/spe` order with `requestedDelta = appliedDelta = -priorStage` and `resultingStage = 0`;
   - no separate CombatEvent for action-lock cleanup.
6. Expose the accepted Revive cleanup as a deterministic cadence-state transition reusable by Hunt authority after a sealed Battle. The post-Battle caller may clean forward cadence/effect/action-lock carry but **must not** append CombatEvents to or otherwise mutate the ended Battle transcript.
7. Preserve historical combat/rules versions and their replay bytes; forward semantics must be additive/versioned rather than silently reinterpreting old Hunts.

## Out of scope

- Selecting Potion/Revive items, policy persistence, Inventory debit, minimum reserve, fallback order or enabled/default state.
- Persistent Pokémon vitality, Start/terminal writeback or PokéCenter.
- Post-Battle `PostBattleReviveApplied`, D-F16 `resolved_non_win`, PendingEncounterSelection consumption or Hunt activity persistence.
- Offline target calculation, HTTP/API commands, database schema/migrations, public presentation projection or frontend controls.
- Any new gameplay rule not already fixed by SPEC-020.

## Acceptance criteria

- [x] Deterministic direct vs segmented/restarted execution produces identical forward combat/cadence state for the new rules version.
- [x] Auto-Potion cannot execute at 0 HP, cannot revive and applies the exact GCD + 5-second cooldown semantics.
- [x] KO intervention is created/replayed with exact side/combatant identity only while a non-intervention side remains living.
- [x] Opponent exhaustion seals Battle outcome before Revive; simultaneous all-KO remains the existing `draw`.
- [x] Successful Revive clears exactly the accepted transient state, resets stages with the accepted bytes/order, preserves Move cooldowns/cursor and applies the one-GCD carry.
- [x] The reusable post-Battle cleanup path produces the accepted forward cadence state without changing sealed Battle events/result bytes.
- [x] Historical pinned rules versions remain byte/replay compatible and do not gain forward Revive/Potion behavior.
- [x] No Inventory/policy/persistence authority leaks into `packages/game-core`.
- [x] Independent QA reports no unresolved P0/P1; delegated Class-B functional/architectural acceptance completes after implementation.

## Required validation

- Focused game-core unit/property/replay tests for Potion boundary ordering, cooldown, KO intervention, Revive cleanup, stage event bytes, simultaneous KO and historical-version compatibility.
- Direct/segmented/BattleState-JSON-rehydrated equivalence for the new rules version. Forward Hunt checkpoint codec/version persistence is TASK-110-owned; TASK-107 must preserve historical checkpoint V1/V2 exactness.
- Relevant package lint/typecheck/test/build checks.
- No claim of API/PostgreSQL/offline validation from this task alone.

## Dependencies

- Human-approved SPEC-020/021 package and forward amendment pointers.
- TASK-009 deterministic combat engine, TASK-035 Solo Hunt simulation and TASK-037 elapsed-time engine as historical foundations.
- TASK-106 Class-A acceptance complete.

## Risks / irreversible actions

- Incorrect version gating can corrupt historical replay; historical rules must remain immutable.
- Event-order drift can break SPEC-017 v2 projection/replay.
- No migration is part of this slice. Deploy/public enablement remain separately gated; repository/history completion was authorized by the Human Owner continuation on 2026-10-02.

## Readiness / execution gate

Definition of Ready was satisfied and Human implementation authorization was given on 2026-10-02. The Human Owner subsequently directed continuation of TASK-107/108, authorizing repository/history completion; deploy/public enablement remain separate gates.

## Owner implementation evidence

- Added an additive management-first combat rules/event-schema pair; historical contexts retain their prior runtime shapes and behavior.
- Added deterministic `externalHpHeal` and KO-intervention decision stimuli, exact Revive cleanup event ordering, Auto-Potion cooldown carry, and pure post-Battle cadence Potion/Revive transitions.
- Revive preserves any existing Auto-Potion cooldown and adds only the accepted GCD/action-opportunity cost. Same-boundary Auto-Potion suppression remains an orchestration/action-boundary responsibility; no synthetic Revive cooldown was introduced.
- Historical Solo Hunt checkpoint V1/V2 codecs were not changed. Direct/segmented/BattleState-JSON rehydration is covered here; TASK-110 owns the forward Hunt checkpoint codec/version for the new cadence fields and restart/offline equivalence.
- Owner validation on the exact REVIEW candidate: `@pokenexus/game-core` test **243/243 PASS**; `@pokenexus/game-protocol` test **34/34 PASS** after the build refreshes its compiled test artifact; full root `pnpm test` PASS; game-core/protocol typecheck PASS; root lint/build PASS; and `git diff --check` PASS.
- Fresh acceptance revalidation kept game-core **243/243**, game-protocol **34/34**, both relevant typechecks, root lint/build and `git diff --check` green. A later full-root `pnpm test` run hit only two unrelated 5-second `game-data` timeout ceilings (`pve-publication-sanity` and `sanity-harness`); rerunning those exact files with `--testTimeout 30000` passed **15/15**. No TASK-107-owned test failed.
- Replay evidence covers JSON rehydration of exact pending KO identity through both Revive and Decline, plus serialized replay of KO → Revive. Historical presentation v1 remains schema-exact and fails closed on forward-only `CombatantRevived`; TASK-103 owns the accepted additive presentation v2 projection.
- Independent QA reports TECH READY with P0/P1/P2 = 0/0/0; delegated Class-B functional/architectural acceptance is complete.
- Post-integration validation on the combined TASK-107/108 tree: game-core **245/245 PASS**, focused game-protocol **17/17 PASS**, full root `pnpm test` PASS, relevant typechecks PASS, root lint/build PASS and `git diff --check` PASS. The accepted implementation is integrated into local `main` at `ec647c70488b`.
