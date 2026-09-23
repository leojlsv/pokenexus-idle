# TASK-033 — PvE World/Map, Zone & Solo Hunt Rules/Lifecycle Spec

## Metadata

- State: DONE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor (Hunt concurrency / checkpoint / reward-correlation integrity spot-check)
- Auditor execution surface: fresh independent ChatGPT worker
- Consultants: Gameplay Systems Consultant (GSC); Player Experience & Economy Consultant (PXE)
- Consultant execution surface(s): fresh independent ChatGPT advisory workers
- Spec: `docs/specs/SPEC-013-pve-world-map-zone-solo-hunt-rules-lifecycle.md`
- Related specs: SPEC-002, SPEC-003, SPEC-005, SPEC-006, SPEC-007, SPEC-009, SPEC-012
- Related ADRs: ADR-002, ADR-004, ADR-005
- Related tasks: TASK-006, TASK-008, TASK-009, TASK-011, TASK-019, TASK-021, TASK-022,
  TASK-023, TASK-024, TASK-033, TASK-034, TASK-035, TASK-036, TASK-037, TASK-038,
  TASK-039, TASK-040, TASK-041, TASK-087, TASK-090, TASK-091
- Branch: `main` canonical governance worktree; prior semantic acceptance, corrective Human
  reaffirmation and repository/history completion authorization recorded 2026-09-23
- Worktree: `.worktrees/main-governance-integration`

## Objective

Define and obtain Human Owner acceptance for the first PokeNexus PvE World/Map → Zone → Solo Hunt
rules/lifecycle contract before TASK-034 publishes Hunt content and TASK-035 implements the Solo Hunt
orchestrator.

The specification must make the player loop, lifecycle boundaries, deterministic elapsed-time
semantics, Team continuation, inter-Battle item window, reward-source cadence, reset/retreat behavior
and capture handoff explicit without creating a Hunt-specific combat engine or stealing content/data,
capture probability, persistence/API or offline-engine implementation from downstream tasks.

## Existing accepted constraints

TASK-033 consumes rather than reopens these accepted contracts:

- ADR-002: Solo Hunts are event/elapsed-time driven; no persistent server tick; authoritative state is
  advanced at checkpoints/claims from elapsed time + seed + pinned rules context.
- ADR-004 / SPEC-003: one universal deterministic Combat Engine; one Hunt is one cadence-continuity
  scope; surviving Pokémon HP, actor GCD, per-Move cooldowns, ordered Move cursor and cadence-scoped
  effects can continue across chained Battles; Battle boundaries do not auto-heal/reset them.
- SPEC-003: due cadence-effect boundaries may mutate HP and KO a Pokémon between Battles; Battle-local
  stat stages reset per Battle; unsupported mechanics fail closed.
- SPEC-005: a selected saved Team is only a preset. The Hunt must resolve/pin its own immutable Team /
  Move / Ability / Level snapshot; later Team/loadout edits do not rewrite a running Hunt.
- SPEC-006: durable Pokémon/Player XP is server-authoritative; TASK-033 may define reward allocation
  semantics but cannot make Battle/client elapsed time directly mutate XP without the reward authority.
- SPEC-007: no automatic/offline item consumption; normal healing targets only living damaged Pokémon;
  healing uses the shared deterministic game-core primitive; revival/equipment are deferred; every
  valid accepted capture attempt consumes exactly one capture item whether capture succeeds or fails.
- SPEC-009/TASK-024: every durable reward uses a stable server-authoritative RewardSourceKey and one
  immutable Reward Resolution; retries cannot duplicate/reinterpret rewards.
- SPEC-012/TASK-091: first Solo Hunt production combat content uses the accepted production rule
  catalog; 408 unsupported Moves and all inactive-by-policy Abilities remain fail-closed. TASK-033/034
  may choose a playability-cleared production subset using TASK-091 evidence.

## Scope

### 1. World / Map / Zone / Hunt semantics

- define semantic relationships among World, Map, Zone and Hunt without choosing concrete Kanto/Johto
  content rows owned by TASK-034;
- define Zone/Hunt availability and the rule inputs allowed to gate access;
- define selection/entry authority and the exact point at which Team/content/rules snapshots pin;
- define whether baseline v1 permits one active Solo Hunt per Player and how a new start interacts with
  an already-running Hunt.

### 2. Hunt cadence and lifecycle

- define Hunt identity and lifecycle states needed by checkpoint/replay and later API/UI work;
- define start, running advancement, checkpoint/claim, explicit stop/retreat, automatic stop/failure,
  and restart/new-Hunt semantics;
- define fresh-Hunt reset semantics separately from intra-Hunt Battle transitions;
- define reset/reroll abuse policy without adding paid stamina, currency fees or hidden friction by
  inference.
- define the accepted one-active-Hunt-per-Player concurrency/retry invariant so simultaneous
  start/checkpoint/stop commands cannot create two active Hunts or let stale simulation overwrite a
  newer checkpoint/terminal state; exact persistence/API mechanics remain TASK-038-owned.
- require stable logical command correlation for `start`/`checkpoint`/`claim`/`stop`, distinct from
  Hunt/checkpoint/OCC identity. First acceptance freezes any advancement cutoff/safe-boundary target;
  response-loss replay cannot advance farther, and stale recomputation must reuse that same target
  rather than a later `now`.

### 3. Team continuation and KO

- define Solo Hunt active capacity and how saved Team order maps to active/reserve continuation;
- for an in-Battle KO with a surviving reserve, preserve SPEC-003 mandatory zero-time forced replacement
  inside the **same Battle**, with Hunt policy selecting the first living eligible pinned Team reserve
  in Team order;
- for an inter-Battle cadence KO, select the first living eligible pinned Team member for the next
  Battle when one exists;
- when no living eligible Pokémon remains, prevent creation of a new Battle and automatically terminate
  the Hunt at that exact logical no-living boundary;
- respect SPEC-007 revival deferral: TASK-033 cannot invent Revive behavior.

### 4. Inter-Battle logical time and items

- define deterministic inter-Battle elapsed time and ordering against cadence-effect ticks/expiries;
- define the exact v1 player item-use window without allowing retroactive healing or a second effect
  engine;
- preserve explicit-command-only item use and no offline/automatic consumption.

### 5. Encounters, capture and production admission

- define encounter-stream/lifecycle authority and deterministic seed/ordinal requirements while leaving
  concrete encounter tables to TASK-034 and simulation implementation to TASK-035;
- define the lifecycle hook at which TASK-036 may accept a capture attempt, but not probability/outcome;
- define production admission requirements from TASK-091 all-Species/all-level evidence so a Zone/Hunt
  cannot admit a Species/level with zero progress-capable executable choices.

### 6. Rewards, checkpoint and claim semantics

- define when an encounter/Hunt produces a deterministic reward source occurrence and when
  checkpoint/claim durably materializes its immutable Reward Resolution;
- define stable Hunt/encounter correlation requirements for SPEC-009 RewardSourceKey composition;
- define whether completed-encounter rewards survive retreat/failure and how checkpoint/claim relates to
  already-earned immutable reward intent;
- if completed rewards are retained, define terminal checkpoint/source-evidence preservation so
  retreat/failure cannot erase a completed-but-not-yet-applied occurrence;
- define XP target/share policy at the rules level without choosing concrete amounts/drop tables owned
  by TASK-034;
- leave currency/economy additions out of baseline unless separately proposed and Human-approved.

### 7. Downstream handoff

- TASK-034: concrete World/Map/Zone/Hunt content, encounter tables, level inputs and reward/drop tables;
- TASK-035: deterministic event-driven Solo Hunt orchestration/policy using shared Combat Engine;
- TASK-036: capture eligibility/probability/outcome and reward/capture resolution;
- TASK-037: persisted offline advancement, safe caps and checkpoint/claim engine;
- TASK-038: authenticated Hunt commands/persistence orchestration;
- TASK-039/040: Card/Visual presentation of the same authoritative Hunt state;
- TASK-041: end-to-end/offline/performance qualification.

## Accepted v1 direction

The Human Owner accepted the following baseline after GSC/PXE consultation, independent QA and
Independent Auditor review:

1. **Topology:** preserve SPEC-001's open Map-identity boundary with a minimal v1
   World/Map navigation surface addressed authoritatively by existing `ZoneId`, with no new canonical
   `MapId` unless TASK-034 content proves a persistent region/map identity is required. A Zone exposes
   one or more versioned Hunt definitions.
2. **Availability:** baseline Zone/Hunt gates may use explicit Player Level and prerequisite-content
   completion predicates only when present in accepted versioned content; no stamina, entry fee,
   currency sink or source-Pokémon progression inference.
3. **One active Solo Hunt per Player:** starting another Hunt requires explicitly ending the current
   one; no hidden concurrent offline farming sessions.
4. **Pinned start snapshot:** selected Team order, member instance IDs, Species/forms, Level, Moves,
   selected Ability state, exact gameDataVersion/rulesVersion, Hunt content version, seed and policy
   identity pin when the Hunt starts.
5. **Solo lineup:** exactly one active player Pokémon at a time; remaining eligible pinned Team members
   are ordered Battle reserves. An in-Battle KO uses SPEC-003 `replacementPending` and zero-time forced
   replacement inside the same Battle, with Hunt policy selecting the first living reserve in pinned
   Team order; an inter-Battle cadence KO selects the first living member for the next Battle.
6. **Fresh-Hunt state:** a newly started Hunt begins a new cadence scope with full HP, clean cadence
   effects, reset GCD/Move readiness and sequence cursor, but stop/restart cannot resample the next
   unresolved same-Zone encounter. A subsequent Hunt after termination also has explicit non-zero,
   versioned Player-wide recovery/setup downtime before productive encounters resume; Zone switching
   cannot bypass it and the already-established recovery boundary is not reinterpreted by later rules.
   There is no fee/stamina or paid bypass. Exact duration is TASK-034 content/Human sample scope.
   The same-Zone pending encounter selection is an immutable version-bound token; a later Hunt that
   consumes it must use its exact retained compatible content/data/rules context or fail closed — never
   reinterpret/redraw it under latest content.
7. **Inter-Battle healing/item timing:** no supported healing/normal-consumable command resolves inside
   an actively simulated Battle. A supported command submitted during Battle is ordered for the next deterministic inter-Battle
   command boundary; the Hunt resolves the Battle and all due cadence effects first, then applies the
   item only if the target is still eligible. Ineligible/no-op use consumes nothing. Capture commands
  follow the accepted Option B capture boundary below.
8. **No-living boundary:** with no living eligible Team member, simulation cannot create another Battle.
   Because revival is deferred, baseline v1 automatically terminalizes the Hunt at that exact logical
   boundary; return/navigation is post-terminal presentation rather than a separate terminate command.
9. **Reward entitlement:** each completed encounter creates its own stable reward-source occurrence
   keyed by Hunt identity + encounter ordinal. Completed encounter rewards are not forfeited by later
   retreat/failure; incomplete encounters grant nothing. Claim/checkpoint applies/replays those immutable
   source occurrences through SPEC-009/TASK-024 rather than recomputing current rewards.
10. **XP allocation:** one fixed encounter Pokémon-XP pool is split deterministically across
    actual participants that became active in that encounter and were below Level 200 in the pinned Hunt
    snapshot; unused reserves receive no share, exact integer remainder follows pinned Team order, and
    frozen shares are never redistributed later if a participant reaches cap before application. Player
    XP is a separate sibling reward when configured.
11. **Capture boundary:** use **Option B**, one bounded server-authoritative post-encounter pending
    capture decision with no Ball debit until explicit attempt. At most one accepted capture attempt per
    `EncounterId` is allowed in baseline v1. TASK-036 still owns probability/outcome and SPEC-007
    one-ball-per-attempt consumption. The pending capture is post-completion and cannot mint a second
    encounter-completion reward source.
12. **Offline behavior:** no automatic Potion/capture command is invented during elapsed-time catch-up.
    TASK-037 may advance only deterministic policy already accepted/pinned; player-command opportunities
    cannot be retroactively inserted into elapsed history.

## Accepted Human Owner decisions

On 2026-09-23 the Human Owner accepted the complete SPEC-013 baseline:

1. **Fresh-Hunt recovery/reset:** full HP/clean fresh scope plus no-free-reroll and explicit non-zero
   Player-wide recovery/setup downtime.
2. **Reward retention:** completed encounter rewards survive retreat/failure; incomplete encounters
   grant nothing.
3. **Pokémon XP:** deterministic split across actual non-cap participants, with no unused-reserve share.
4. **Zone/Hunt progression gates:** prerequisite completion is normal sequencing; Player Level is used
   only for an explicit distinct readiness purpose rather than as an automatic double-gate.
5. **Capture mode + attempt count:** **Option B**, one bounded post-encounter pending capture decision,
   with at most one accepted attempt per `EncounterId`.
6. **Stop/retreat:** exact SPEC-013 safe boundary with no fee/stamina/reward confiscation; recovery/setup
   downtime is the opportunity cost.
7. **World/Map identity:** minimal Zone-addressed navigation; canonical Map/Region identity requires a
   later accepted contract if concrete content/progression proves it necessary.
8. **Concurrent activity:** at most one active Solo Hunt per Player.

## Out of scope

- production TypeScript/SQL/API/UI implementation;
- concrete World/Map/Zone names, encounter tables, reward quantities/drop probabilities or level bands;
- capture probability/formula, capture RNG, captured-Pokémon construction or grant transaction;
- new combat primitives, Move/Ability mechanics or Hunt-specific damage/healing math;
- revival items, equipment/held items or automatic item-use rules;
- currencies, prices, stamina/energy, premium systems, paid convenience/power or monetization;
- PvP/Duo/Gym/World Boss rules;
- realtime/WebSocket Solo Hunt loop;
- broad offline cap/performance tuning owned by TASK-037/041;
- public HTTP route/payload/idempotency-key design owned by TASK-038;
- Git/history mutation without separate Human Owner authorization.

## Acceptance criteria

- [x] World/Map/Zone/Hunt semantic ownership and content/runtime boundaries are explicit.
- [x] Zone/Hunt availability uses only accepted rule inputs and cannot infer unlocks from source data.
- [x] Hunt start pins Team/content/rules/policy identities needed for deterministic replay.
- [x] One Hunt cadence scope preserves accepted cross-Battle HP/cooldown/cursor/effect continuity.
- [x] Solo active/reserve continuation and no-living behavior are exact and do not invent revival.
- [x] SPEC-003 `BattleEnded` maps exactly to Hunt Encounter outcome: only player-side sole victory
      successfully completes the Encounter; opposing-side victory/draw grant no completion reward or
      capture decision and leave `PendingEncounterSelection` unconsumed.
- [x] Inter-Battle item-use ordering is deterministic, non-retroactive and uses SPEC-007/SPEC-003
      shared healing semantics.
- [x] Fresh-Hunt reset/recovery semantics and reset-abuse consequences are explicitly Human-approved.
- [x] Reward-source cadence/retention and XP allocation are exact, server-authoritative and compatible
      with SPEC-006/SPEC-009 without duplicate-reward paths.
- [x] Capture lifecycle hook composes with SPEC-007 and leaves probability/outcome to TASK-036.
- [x] Production Species/level admission consumes TASK-091 playability evidence and fails closed for
      zero progress-capable executable choices.
- [x] Offline advancement remains event/elapsed-time driven with no hidden server tick or automatic
      player item/capture commands.
- [x] Start/checkpoint/claim/stop response-loss and OCC retry are command-idempotent: same correlation
      means same normalized intent and immutable advancement target/result, never a later advancement;
      genuinely new intent requires a new correlation.
- [x] Required GSC advisory is completed and reconciled before Human acceptance: initial
      **ADVISORY CONCERN** reconciled; exact-current delta re-gate **ADVISORY PASS** with no remaining
      correction before QA/Human gate.
- [x] Required PXE advisory is completed and reconciled before Human acceptance: initial
      **ADVISORY CONCERN** reconciled; exact-current delta re-gate **ADVISORY PASS** with no remaining
      correction before QA/Human gate.
- [x] Prior pre-acceptance independent QA reported **READY 0/0/0/0** on the previously accepted DRAFT.
- [x] Prior pre-acceptance Independent Auditor reported **PASS 0/0/0/0** on single-active-Hunt
      concurrency, checkpoint/retry identity and reward/capture correlation boundaries.
- [x] Human Owner explicitly accepted the complete SPEC-013 baseline on 2026-09-23, including Capture
      Option B and at most one accepted capture attempt per `EncounterId`.
- [x] Fresh corrective QA reports **READY 0/0/0/0** on the exact corrected DRAFT after normalization of
      the post-acceptance P1 and lifecycle evidence.
- [x] Fresh corrective Independent Auditor reports **PASS 0/0/0/0** on the exact corrected semantic
      snapshot, including Battle outcome → Encounter completion, reward/capture/token correlation and
      frozen stop-cutoff composition.
- [x] Fresh corrective GSC and PXE advisory deltas are recorded and reconciled for the loss/draw
      reward/capture behavior; both returned **ADVISORY PASS** with no required spec correction.
- [x] Human Owner explicitly reaffirmed the corrective Battle-outcome → Encounter-completion mapping on
      2026-09-23 after fresh QA/Independent Auditor re-gates and corrective GSC/PXE advisory deltas.

## Validation / review

For the accepted snapshot:

```text
corepack pnpm roadmap:generate
corepack pnpm roadmap:check
git diff --check
```

Also verify:

- diff is limited to TASK-033, SPEC-013 and roadmap planning artifacts;
- no `packages/**`, `apps/**`, migration, manifest, lockfile or runtime-config change;
- ADR-002 event-driven Solo Hunt architecture is preserved;
- SPEC-003 shared Combat Engine/cadence semantics are not duplicated in Hunt orchestration;
- SPEC-007 revival deferral/no-auto-use/capture-debit rules remain intact;
- SPEC-009 RewardSourceKey/idempotency semantics remain the only durable reward completion authority;
- TASK-091 production support state is consumed without promoting unsupported Moves/Abilities;
- the accepted Human decisions are materialized as normative SPEC-013 behavior rather than unresolved
  proposal text.

## Dependencies

- TASK-006 / SPEC-002 — DONE / APPROVED.
- TASK-008 / SPEC-003 — DONE / APPROVED.
- TASK-009 — DONE.
- TASK-019 / SPEC-005 — DONE / APPROVED.
- TASK-021 / SPEC-006 — DONE / APPROVED.
- TASK-022 / SPEC-007 — DONE / APPROVED.
- TASK-023 / SPEC-009 — DONE / APPROVED.
- TASK-024 — DONE.
- TASK-087 — DONE.
- TASK-090 / SPEC-012 — DONE / APPROVED.
- TASK-091 — DONE.
- ADR-002 / ADR-004 / ADR-005 — ACCEPTED.

## Risks / irreversible actions

- Fresh-Hunt healing/reset could become a degenerate free-recovery loop if downstream implementation
  violates the accepted no-free-reroll or non-zero recovery/setup contracts.
- Completed-reward retention intentionally reduces retreat punishment; downstream content must preserve
  the accepted recovery/setup opportunity cost rather than adding hidden fees or confiscation.
- Participant-based XP sharing changes team-progression incentives; TASK-034 concrete XP values remain a
  later content/balance validation responsibility.
- Player-Level Zone gates can create a clean progression ladder but may become grind walls if thresholds
  are too aggressive; TASK-034 content values require later sample validation.
- The accepted post-encounter capture boundary materially affects Ball consumption and offline fairness;
  TASK-036 must preserve that boundary while owning probability/outcome.
- A Hunt-specific effect/healing resolver would violate ADR-004 and break replay equivalence.
- A latest/current content fallback would make offline checkpoints non-replayable and is forbidden.
- Git/history completion was separately authorized by the Human Owner on 2026-09-23.

## Expected files / boundaries

```text
tasks/done/TASK-033-pve-world-map-zone-solo-hunt-rules-lifecycle-spec.md
docs/specs/SPEC-013-pve-world-map-zone-solo-hunt-rules-lifecycle.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

## Current execution state

TASK-033 is **DONE** after closure of a narrow corrective P1. Upstream combat/data/team/progression/item/reward
and production-rule dependencies remain integrated. The Human Owner previously accepted the reconciled
baseline and selected Capture **Option B** with at most one accepted attempt per `EncounterId`, but a
post-acceptance exact-current Independent Auditor review found that SPEC-013 did not map SPEC-003
`BattleEnded` player win/opponent win/draw outcomes to Encounter completion. Section 5.4.1 now makes the
mapping explicit: only player-side sole victory completes the Encounter; loss/draw generate no
completion reward/capture and preserve `PendingEncounterSelection`. The corrected semantic snapshot has
fresh Independent Auditor **PASS 0/0/0/0**, corrective GSC **ADVISORY PASS** and corrective PXE
**ADVISORY PASS** with no required spec correction. Final corrective QA is **READY 0/0/0/0**. On
2026-09-23 the Human Owner explicitly reaffirmed the corrective mapping, so SPEC-013 is **APPROVED**,
then separately authorized repository/history completion. TASK-033 is therefore closed as DONE; TASK-034
is dependency-clear but remains PLANNED/inactive until normal activation.

Initial independent pre-Human reviews found concrete DRAFT gaps, all specification-only. QA returned
**NOT READY P0/P1/P2/P3 = 0/3/1/0** (version-bound pending selection, exact retreat safe boundary,
Option-A success/reward lifecycle, complete Human-decision inventory); IA returned **FAIL 0/1/0/0**
(checkpoint/claim/stop response-loss correlation + immutable advancement cutoff). After those fixes,
QA found two further P1 lifecycle ambiguities in stop advancement across `replacementPending` and the
no-living terminal boundary. The final corrected DRAFT resolves both and distinguishes a terminal
Battle from a terminal Hunt while advancing toward a frozen stop cutoff.

## Independent review evidence

- Initial QA: **NOT READY 0/3/1/0**. Cross-contract foundations were otherwise consistent; required
  corrections were pending-selection version pinning/fail-closed reuse, deterministic stop/retreat
  ordering, Capture-A success/reward classification and complete Human decision enumeration.
- Initial IA: **FAIL 0/1/0/0**. All audited reward/capture/recovery/no-reroll invariants were otherwise
  coherent; the sole blocker was response-loss/stale-recompute ambiguity for advancing Hunt commands.
  Corrected semantics now give every start/checkpoint/claim/stop a stable command correlation and
  immutable advancement cutoff/result, with no retry-as-later-`now` reinterpretation.
- Corrected QA delta: **NOT READY 0/2/0/0**. Remaining findings were SPEC-003-compliant handling of
  `replacementPending` while advancing a correlated stop and contradictory no-living intervention vs
  automatic-terminal semantics. Both were corrected: forced replacement is resolved at zero time before
  advancement resumes, and no-living now auto-terminalizes the Hunt at its exact logical boundary.
- Final exact-current QA re-gate: **READY 0/0/0/0**. Battle-terminal `T < L` now closes that Encounter
  and may continue Hunt orchestration toward the same frozen `L`; only an actual Hunt-terminal boundary
  short-circuits advancement, and recovery anchors to the actual terminal boundary.
- Final exact-current Independent Auditor re-gate: **PASS 0/0/0/0**. Stable command correlation/OCC,
  frozen advancement cutoff, reward-source preservation, version-bound pending selection, Capture A/B
  correlation and one-accepted-attempt-per-EncounterId boundaries have no unresolved P0-P3 finding.
- Post-acceptance exact-current normalization audit: **FAIL 0/1/0/0**. The sole P1 was missing normative
  mapping from SPEC-003 terminal Battle outcome to successful Encounter completion, which left
  loss/draw reward, capture and pending-selection consumption ambiguous. Section 5.4.1 is the corrective
  mapping that was subsequently re-gated by fresh QA/IA.
- Corrective Independent Auditor re-gate on SPEC-013 SHA-256
  `56DE03950ADD22AA1F636A68BFC83C51A17CEC1A05C6B1C10AD7D008239E65F0`: **PASS 0/0/0/0**. Player-side
  sole victory, opposing-side victory/draw, reward/capture/token behavior and frozen stop-cutoff
  composition are coherent; no blocker remains from the original P1.
- Corrective QA semantic re-gate on the same SPEC snapshot found **no P0/P1** and one P2 lifecycle
  evidence inconsistency: old pre-acceptance QA/IA checkboxes were still presented as the current final
  gates while the task/roadmap correctly said corrective re-gates were pending. The criteria above now
  distinguish prior and corrective gates; the final exact-current QA re-gate is recorded below.
- Final corrective QA re-gate after lifecycle-evidence normalization: **READY 0/0/0/0**. It confirmed
  SPEC-013 section 5.4.1, stop/no-living/reward/capture/token consequences, corrective IA/GSC/PXE
  evidence and task/roadmap lifecycle coherence with no remaining finding. A parallel narrow QA check
  found one roadmap-only P2 in the EPIC-05 status wording (`fresh QA/IA` still described as pending);
  that stale wording is corrected as part of the REVIEW → ACCEPTANCE transition.

## Consultation evidence

- GSC exact-snapshot advisory: **ADVISORY CONCERN**. Accepted topology/one-Hunt/Potion/no-revive/
  reward-retention/TASK-091 boundaries; required correction to same-Battle forced replacement was
  applied; requested explicit anti-reset/reroll semantics, participation XP, capture timing and
  prerequisite-first gating.
- PXE exact-snapshot advisory: **ADVISORY CONCERN**. Accepted one active Hunt, completed-reward
  retention, no stamina/fee/sink, explicit-only items/capture, one-Ball rule and ZoneId topology;
  requested participation XP, no-free-reroll/recovery resolution, non-double-gated progression and
  explicit handling of offline capture disadvantage.
- Material consultant difference retained for Human decision: GSC prefers current non-terminal
  encounter capture after catch-up; PXE prefers one bounded pending capture decision to reduce offline
  collection disadvantage.
- GSC exact-current reconciliation delta: **ADVISORY PASS**, blockers none. Confirmed no-free-reroll +
  Player-wide non-zero recovery/setup downtime restores Potion/run-continuity value without fees,
  corrected same-Battle replacement matches SPEC-003, participant XP/reward retention/gates are
  coherent, and capture A/B is sufficiently explicit for Human choice.
- PXE exact-current reconciliation delta: **ADVISORY PASS**, blockers none. Confirmed the revised
  recovery model preserves F2P viability without stamina/paid bypass, participant XP removes last-hit
  distortion, reward retention protects player trust, prerequisite-first gating avoids default grind
  stacking, and capture A/B makes the active/offline trade-off explicit rather than hidden.
- Corrective GSC delta on SPEC-013 SHA-256
  `56DE03950ADD22AA1F636A68BFC83C51A17CEC1A05C6B1C10AD7D008239E65F0`: **ADVISORY PASS**, required
  correction none. Loss/draw correctly yields no completion reward/capture, preserves the same target
  selection and terminalizes at no-living. Material tuning risks are intentionally retained for
  TASK-034: mutual-KO draw is harsh, repeated failure may temporarily wall one Zone target, concrete
  recovery duration controls retry-fishing pressure, and an early offline defeat truncates productive
  offline advancement while recovery itself may elapse offline.
- Corrective PXE delta on the same SPEC snapshot: **ADVISORY PASS**, required correction none. Loss/draw
  burns no Ball/Potion, fee, stamina, prior completed reward or rare target; intentional failure cannot
  mint value, reroll the target, duplicate reward/capture or bypass Player-wide recovery. Player-facing
  implementation should clearly surface Hunt termination, zero current-Encounter completion reward/
  capture, retained target selection and active recovery; this is a downstream UX requirement rather
  than a SPEC-013 blocker.

## Completion

TASK-033 is DONE. SPEC-013 is APPROVED after the original Human acceptance, the post-acceptance
Battle-outcome corrective cycle, final corrective QA **READY 0/0/0/0**, Independent Auditor
**PASS 0/0/0/0**, corrective GSC/PXE **ADVISORY PASS**, explicit Human reaffirmation and separate
repository/history completion authorization on 2026-09-23.

The approved contract is now the prerequisite authority for TASK-034 and downstream Solo Hunt work.
TASK-034 remains PLANNED and inactive until normal task activation.
