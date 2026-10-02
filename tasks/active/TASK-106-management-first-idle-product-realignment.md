# TASK-106 — Management-First Idle Product Realignment

## Metadata

- State: ACCEPTANCE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: N/A unless amendment introduces new security/economy integrity semantics
- Auditor execution surface: N/A
- Consultants: Gameplay Systems Consultant (GSC) — **completed advisory 2026-10-01**; PXE when a selected decision materially changes economy/scarcity/fairness
- Consultant execution surface(s): fresh independent ChatGPT advisory worker(s)
- Spec: `docs/specs/SPEC-020-management-first-idle-product-realignment.md`
- ADR: N/A
- Branch: current documentation realignment is being prepared in the existing isolated worktree; dedicated implementation branch not authorized
- Worktree: current evidence/reconciliation work only

## Objective

Reconcile PokeNexus product contracts and future development with the Human Owner's 2026-10-01 direction that the game is management-first Idle, PvE traversal is automatic, HUB is the only free-movement surface, healing Potions are automatic-only HP%-based PvE behavior, and Encounter rewards are not a post-Hunt grant phase.

This coordination task does not authorize gameplay/runtime implementation, migration, deployment or Git-history operations. Those remain owned by separately scoped execution tasks/gates.

## Context

The Human Owner identified that prior agents/specs had inferred material gameplay interactions without explicit consultation. Manual Potion use and adventure-like PvE movement/exploration assumptions are concrete examples.

Further product/gameplay development is paused until all relevant stages are aligned with Human expectations.

## Scope

- maintain `PRODUCT_EXPECTATIONS_BASELINE.md` as the confirmed/open product inventory;
- maintain `PRODUCT_FLOW_DECISION_MAP.md` with traceable Human decision points;
- audit SPEC-013/014/015/016/017/018/019 against the current product identity;
- draft the required Class-A amendments without silently editing accepted semantic history;
- classify existing TASK-035/037/038/039/040/041 behavior as aligned, reconfirm, conflict or open;
- obtain GSC management-first Idle consultation before Human acceptance;
- present unresolved decisions to the Human Owner in player language and in small reviewable groups;
- define the exact aligned Pre-alpha vertical slice before gameplay-facing implementation resumes.

## Out of scope

- production code changes;
- database migrations;
- deleting/deprecating runtime routes before the replacement contract is accepted;
- deploying or enabling public gameplay capability;
- deciding unresolved product rules on behalf of the Human Owner;
- Git commit/push/merge/history operations without separate authorization.

## Acceptance criteria

- [x] Human-confirmed product pillars and active-Hunt control decisions are recorded without extrapolation.
- [x] Current Solo Hunt player-facing actions in the mapped Hunt loop are classified as CONFIRMED, COMPATIBLE, RECONFIRM, CONFLICT or OPEN-HO; remaining open semantics are explicitly listed.
- [x] SPEC-003/007/013/014/015/016 conflicts plus the new SPEC-021 Player State/HUB/PokéCenter vitality contract have explicit proposed Class-A amendment text in SPEC-020/SPEC-021; SPEC-017 versioned combat-feed compatibility and SPEC-019 draft alignment are accounted for.
- [x] Manual-heal product behavior is fully removed from the future desired contract and the Human-selected Pre-alpha Solo-Hunt auto-Potion rule is propagated through the proposed Class-A amendments/UI contract; remaining manual-heal references are explicitly historical/conflict evidence.
- [x] PvE movement/exploration is explicitly automatic/non-manual; the HUB free-movement exception remains explicit and the first Pre-alpha HUB is separately non-locomotion.
- [x] Reward/terminal wording cannot imply a post-Hunt reward grant; Encounter reward remains authoritative at the Encounter boundary and terminal/result surfaces are reporting only.
- [x] First-Pre-alpha product/UX is fixed. **D-F16 B** closes the final edge: simultaneous-KO `draw` + successful post-Battle Revive consumes the Encounter as `resolved_non_win`, grants no capture/XP/item reward, consumes its pending selection and advances the open-ended Hunt. Initial automation defaults remain **Auto-Potion OFF / Auto-Revive OFF**.
- [x] GSC consultation completed 2026-10-01; it found one blocking direct conflict (manual Potion) plus explicit Human reconfirmation gates, all surfaced in this task/SPEC-020.
- [x] Independent QA re-clears the **2026-10-02 Revive cleanup + Battle-result precedence + D-F16 B delta**. Final semantic and architecture/replay reviews are both **READY with P0/P1/P2 = 0/0/0**.
- [x] Human Owner explicitly accepted the selected Class-A realignment on 2026-10-02. Dependent implementation may be re-scoped/re-readied against SPEC-020/021, but no runtime/migration/Git action is authorized by this acceptance alone.

## Validation / tests

- [x] Documentation cross-reference audit across PRODUCT baseline/flow, roadmap and affected specs/tasks.
- [x] Exact-text search confirms no future desired contract still presents manual Potion use as valid player behavior; hits are historical/conflict/removal statements only.
- [x] Exact-text search distinguishes HUB free movement from PvE automatic traversal and first-Pre-alpha non-locomotion HUB.
- [x] Flow audit confirms Encounter reward resolution precedes/exists independently of Hunt terminal presentation and remains separate from Claim/result reporting.
- [x] Required consultant/QA handoffs are recorded.

### Independent Class-A QA evidence — 2026-10-02

- Pre-adjustment semantic contract review: exact-delta result **READY**, P0/P1/P2 = **0/0/0**. Earlier wording/traceability findings around Auto-Potion default state and decision IDs were corrected before that pass.
- Pre-adjustment architecture/replay review: exact-delta result **READY**, P0/P1/P2 = **0/0/0**. Earlier blockers around KO-intervention replay authority, exact Retreat-boundary handling and public `CombatantRevived` presentation versioning were corrected before that pass; disabled-policy identity and durable terminal provenance were also made explicit.
- **Human correction after that QA:** successful Revive now clears transient buffs/debuffs/DoTs/HoTs/status/action locks and neutralizes stat stages; and opponent exhaustion seals `BattleEnded` before any Player Revive, so post-Battle Revive can never create/rewrite victory. These changed clauses require fresh focused semantic + architecture delta QA before this section can be considered final acceptance evidence.
- Focused semantic delta QA then found one P1 hidden product inference: drawn-Encounter token disposition after successful post-Battle Revive. Human Owner explicitly selected **D-F16 B** on 2026-10-02: consume as `resolved_non_win`, no capture/XP/item reward, consume pending selection, advance the open-ended Hunt.
- Focused architecture delta QA found two P1s plus one P2: missing durable post-Battle Revive replay provenance; incomplete byte definition for stat-stage reset; generic singular-opponent wording. The current draft fixes all three with versioned `PostBattleReviveApplied` Hunt provenance + atomic replay/debit/checkpoint binding, exact `requestedDelta/appliedDelta = -priorStage`, and any-living-non-intervention-side gating.
- Architecture re-review after D-F16 B found two additional P1 contract gaps: consumed `PendingEncounterSelection` replay provenance was not yet retained by the non-win path, and accepted SPEC-017 still required reward/capture disposition before Battle N+1 publication. The current draft now retains the exact consumed selection/RNG/content/rules/individualization provenance in the atomic D-F16 record and explicitly treats committed `resolved_non_win` + settled post-Battle Revive/cadence effects as the forward Battle N+1 publication gate, with no reward/capture row required.
- **Final focused semantic re-review:** READY, P0/P1/P2 = **0/0/0**. D-F16 B is explicit Human authority; no-free-reroll, reward/capture, Retreat and `no_living` semantics are coherent.
- **Final focused architecture/replay re-review:** READY, P0/P1/P2 = **0/0/0**. Consumed-selection continuity, `PostBattleReviveApplied`, restart/offline/OCC, activity sealing, exact cleanup event bytes and SPEC-017 Battle N+1 publication gating are coherent.
- Documentation validation after the reconciled draft: `pnpm roadmap:generate`, `pnpm roadmap:check` and `git diff --check` pass. No runtime/gameplay implementation or migration validation is claimed by this documentation-only Class-A preparation.

### GSC advisory evidence — 2026-10-01

Historical initial advisory snapshot; later Human decisions below supersede the open status of manual capture/Ball choice and visible Checkpoint/Claim.

- P0: manual Potion contract/UI directly conflicts with current Human direction.
- P1: manual capture/Ball choice requires Human reconfirmation.
- P1: visible checkpoint/claim controls require Human reconfirmation.
- P1: Duo/PvP/World Boss action-input model requires explicit Human choice before implementation.
- P2: PvE movement concern is wording/product-drift risk; no canonical free-movement PvE mechanic found.
- P2: reward semantics are already Encounter-owned; terminal/result copy must not imply Hunt-end grant.

### Human decisions after the initial advisory — 2026-10-01

- Checkpoint: **internal/automatic; no player-facing button**.
- Claim: **internal/automatic; no player-facing button; UI reports already-authoritative effects**.
- Retreat: **retained as manual strategic intervention**.
- Capture: **management/automation; no future per-Encounter manual capture/Ball-choice flow**.
- Automation policies: **may be changed during an active Hunt** and are forward-only; the exact authoritative boundary for each policy type must conform to the reconciled contract without retroactivity.

Follow-up Human clarification:

- existing auto-capture management dimensions are retained: enabled, explicit Ball permissions, minimum reserve, ordered visible-condition rules, VIP opt-in, no eligible Ball = no attempt;
- auto-capture OFF means no attempt, no Ball consumption, no manual fallback; the opportunity closes and the Hunt continues;
- the forward-only principle applies to all mutable Hunt automation policies, not only auto-capture;
- Solo Hunt Retreat means return to the HUB; other modes own their own exit semantics.
- The earlier fresh-Hunt full-HP assumption is **superseded**: Pokémon HP persists across Hunts and full healing is performed at the HUB PokéCenter; product behavior is fixed and durable-vitality persistence/concurrency remains implementation work.
- Same-Zone no-free-reroll is retained for unresolved selections. **D-F16 B** is the explicit exception: successful post-Battle Revive after simultaneous-KO draw durably resolves that Encounter as non-win and consumes its pending selection before the next selection.
- Recovery applies after both Retreat and defeat/no-living and is Player-wide **only for starting Solo Hunts**; HUB/management remain available. Duration is fixed at **30s**.
- PokéCenter healing is free and heals the selected/active Team only.
- Damaged Pokémon may Start at persisted HP; KO Pokémon may remain in Team; Start is allowed iff at least one selected Team member is conscious.
- Revive is an available automatic/policy-driven Hunt feature, with the **initial policy default OFF until explicit Player configuration**. When enabled, it targets only the **Leader/active Pokémon that becomes KO during the current Hunt**. While the opponent side remains alive, eligible active KO evaluates Revive before replacement/Player-side defeat finalization; if opponent exhaustion has already sealed `BattleEnded`, any eligible Revive is post-Battle Hunt processing and cannot rewrite winner/draw, capture or victory reward. Tiers restore exactly **25% / 50% / 100% max HP**. Successful Revive clears transient buffs/debuffs/DoTs/HoTs/status/action locks and neutralizes stat stages, while preserving Move cooldowns/cursor. The earlier 2s reviving state is removed: a successful Revive consumes one action opportunity ("turno" de ação). Allowed items/priority/fallback/minimum reserve follow the Ball/Potion model; the same eligible active Pokémon may be revived repeatedly with no extra per-Pokémon/Hunt limit/cooldown beyond Inventory/policy/reserve; offline parity remains; last-conscious KO evaluates eligible Revive before Hunt-level `no_living`.
- PokéCenter healing is immediate, restores KO -> conscious and max HP for the selected/active Team, and may be used during the 30s Hunt recovery.
- Pre-alpha Solo Hunt auto-Potion is an available Player-wide/global policy feature, with the **initial policy default OFF until explicit Player configuration**. When enabled, HP trigger choices are 90/80/70/60/50/40/30/20/10%, evaluated as **current HP <= threshold**; target is always the active Pokémon; allowed items/priority/fallback/minimum reserve follow the Ball model; execution is allowed during Battle and between Battles; each applied Potion consumes one action opportunity; damage/DoT resolves before Potion at the same logical boundary, so 0 HP proceeds to KO/Revive and Potion only evaluates if the active remains conscious; the healed target has a 5s auto-Potion cooldown; ordinary Potion never revives; offline behavior is identical; no eligible Potion means the Hunt continues automatically.
- Hunt duration is content-dependent: some Hunts may be open-ended, others finite; initial finite-content concept is **Safari with a specific duration**. Normal finite completion returns automatically to HUB.
- Initial offline Hunt progression cap is **8h**.
- Offline return summary is confirmed to include Battles/Encounters, capture successes/failures, XP/rewards, item gains, Ball/Potion/Revive consumption, KO/Revive activity and terminal reason.
- A stamina-like mechanic that may gate/extend offline progression is exploratory only; no stamina rule is accepted yet.
- Pre-alpha bootstrap: Player chooses one **Lv. 1** starter from **Bulbasaur / Charmander / Squirtle / Chikorita / Cyndaquil / Totodile**, initially owns only that Pokémon, the system auto-creates the first Team with it as Leader, and auto-assigns up to 4 valid Lv. 1 Moves. Starter kit is **50 Poké Balls / 20 basic Potions / 5 Revives**. Basic Potion heals **25% max HP**. The five starter Revives restore **25% max HP**; current Revive tiers are **25% / 50% / 100%**. `Wilds` does not replenish Revive, so those five are limited stock there. There is no formal tutorial. `Verdant Edge -> Wilds` is the permanent basic Hunt and open-ended in Pre-alpha. Species weights are **Pidgey 16% / Rattata 15% / Caterpie 18% / Sentret 17% / Ledyba 17% / Sunkern 17%**. Species and level are rolled independently; all six therefore use **Lv.1 50% / Lv.2 35% / Lv.3 15%**. All are capturable and all currently have at least one executable Lv.1 progress-capable Move. Provisional XP remains **2× wild level Player / 6× wild level Pokémon**, pending later curve confirmation. Each completed Encounter independently rolls **15% Poké Ball ×1** and **5% basic Potion ×1**; both may drop together; Revive does not drop.
- First Pre-alpha functional slice: **Hunt / Pokémon / Teams / Inventory / Settings + HUB**. HUB is functional but has no free movement yet; it provides PokéCenter and access/navigation functions. Hunt presentation is **Cards only**; Visual/Pixi is deferred. Offline progression is included with the approved **8h cap and detailed return summary**. Capture/Potion/Revive policies remain editable during an active Hunt with forward-only effect. Captures enter Collection immediately and may be placed on Teams; **evolution is deferred to a later Pre-alpha step**.
- First Pre-alpha admission/UX: Start requires a valid 1–6 member Team, at least one conscious member, and a valid 1–4 executable Move loadout for every selected Pokémon with at least one progress/damage-capable Move; unsupported selected Moves block Start. Pre-Start shows **Team + possible Species + rewards** only; policies/resources remain in their management surfaces.
- Active Cards Hunt uses a compact resolved-Encounter feed showing battle completion, capture success/failure, XP, drops, Ball/Potion/Revive consumption, KO and Revive. No additional automation families beyond **Capture / Potion / Revive** are in the first Pre-alpha.
- PokéCenter is unavailable while Solo Hunt is active. Player must Retreat or reach terminal, return to HUB, then heal. `Wilds` is open-ended with no normal completion: Retreat and `no_living` both return to HUB with summary and 30s recovery.
- Authority/content/service failure fails closed for progression/resource mutation; safe read/management surfaces may remain available and affected gameplay exposes unavailable/error + retry.

### Persistent-vitality architecture audit

- P0/Class-A: accepted SPEC-013 explicitly initializes fresh Hunt at full HP and rejects durable out-of-Hunt HP; this must be amended.
- P0/Class-A: current Start/terminal API contract has no durable owned-Pokémon vitality source; Start must pin persisted current HP and terminalization must commit final HP atomically.
- P0 implementation: `createFreshSoloHuntCadence` currently hard-codes derived max HP as starting HP.
- P1: `pokemon_instances` has no `currentHp`; a durable vitality aggregate/storage + OCC is required.
- P1: legacy full-HP-start Hunts/checkpoints must retain historical replay semantics.
- P1: max-HP-changing mutations need a reconciliation/clamp rule for persisted absolute HP.
- P1: PokéCenter must be concurrency-safe with active Hunt state; product interaction itself is now fixed as free/immediate selected-Team full heal during recovery.

### GSC delta after Human active-Hunt decisions

- P0: manual capture/manual Ball input is now a direct future-product conflict.
- P0: visible Checkpoint/Claim controls are now direct future-UI conflicts.
- P1 (resolved by Human Owner): capture disabled/no-policy behavior required explicit selection because no manual fallback remains; selected result is OFF=no attempt/no debit/opportunity closes/Hunt continues.
- P1 (resolved by Human Owner): retained capture-policy dimensions/defaults are accepted as the management base.
- P1 (resolved by Human Owner): forward-only mutation is the common rule for all mutable Hunt automation policies.
- P1 (resolved by Human Owner): Solo Hunt Retreat means return to HUB; technical safe-boundary persistence remains an authority/consistency mechanism, not a separate product outcome.

### Accepted Human Class-A package — 2026-10-02

The Human Owner accepted the following QA-cleared Class-A package on 2026-10-02:

The initial Auto-Potion/Auto-Revive defaults remain OFF. Their accepted persistence identity is the immutable no-saved sentinel `policyVersion=null`, `rowVersion="0"`, `enabled=false`, with no dormant item authority/debit until explicit configuration.

1. **Action opportunity:** a successful automatic Potion consumes one future GCD opportunity of the healed Player-active Pokémon; a successful Revive consumes one future GCD opportunity of the revived Player-active Pokémon. Neither consumes a Move cooldown or advances the Move cursor.
2. **Revive lifecycle/replay:** forward Combat rules pin the single-active Player intervention side in immutable Battle authority and persist the exact pending `{sideId, combatantId}`. This first rules version requires intervention-side `activeCapacity=1`; a future multi-active mode needs its own deterministic pending-order contract. A Player active KO pauses for in-Battle Revive only while the opponent side still has a living Combatant. If the resolved chain has already exhausted the opponent side, `BattleEnded` is sealed first and any later Revive is Hunt/cadence processing only.
3. **Revive consequences:** successful Revive restores HP/conscious state **and clears transient state on that Pokémon**: buffs, debuffs, DoTs/HoTs, status/effect instances and action locks are removed; stat stages reset to neutral. Move cooldowns and Move cursor are preserved, and the Revive action-opportunity GCD cost still applies. A successful Revive cannot immediately chain an auto-Potion at the same boundary.
4. **Simultaneous KO / result precedence:** Revive never participates in deciding an already-ended Battle. If the resolved chain exhausts both sides, current Battle lifecycle seals `draw` first. Post-Battle Revive may then restore the Player active Pokémon for Hunt-level continuation/no-living evaluation, but never turns that draw into victory and never retroactively grants capture/victory reward.
   - **D-F16 B:** successful post-Battle Revive then closes that Encounter as `resolved_non_win`, grants no capture/XP/item reward, consumes the matching pending selection and allows the open-ended Hunt to proceed to the next Encounter.
5. **Retreat tie-break:** intervention created strictly before Retreat's frozen boundary resolves first. A new KO intervention created exactly at the Retreat boundary remains unchanged in the sealed non-resumable Battle snapshot; versioned Hunt terminal/checkpoint replay authority atomically records `abandoned_by_retreat` with Battle/Combatant/logical-time identity, independent of expiring command transport, submits no Revive/decline, emits no synthetic `BattleEnded`, spends no item and preserves terminal reason `retreat`.
6. **Persistent vitality:** one separate OCC vitality aggregate stores absolute `currentHp`; `maxHp` is derived. Max-HP decreases clamp current HP; increases do not heal. Historical Hunts keep historical full-HP-start semantics.
7. **PokéCenter:** HUB heal explicitly receives the selected owned `teamId`; it is free/immediate, unavailable while Hunt active, allowed during recovery and serialized against Start/terminal through the Player Hunt root.
8. **Offline 8h:** the first return reconciliation freezes an 8h-capped target plus return database-time anchor; after complete commit, excess absence beyond 8h is discarded rather than claimable in repeated chunks.
9. **Presentation split/version:** SPEC-017 remains CombatEvent-only. Historical `pokenexus.combat-presentation.v1` stays exact; forward **in-Battle** Revive uses additive `pokenexus.combat-presentation.v2` with `CombatantRevived` plus deterministic cleanup events. Post-Battle Revive is versioned SPEC-015 Hunt activity with durable replay provenance and cannot append to/rewrite an ended Battle transcript. Capture/reward/Inventory consumption and resolved-Encounter summaries remain separate Hunt activity.

These rules are now accepted Class-A authority through SPEC-020/SPEC-021. They still do **not** authorize implementation, migration, deployment or Git-history operations by themselves.

## Post-acceptance implementation decomposition

The Class-A decision package is closed. Implementation should proceed only through separate Class-B execution scopes with one owner each; the following is the minimum coherent dependency split, not runtime authorization:

1. **TASK-107 — deterministic game-core/cadence primitives** — versioned external item action, Auto-Potion action-opportunity/cooldown semantics, KO intervention, Revive cleanup, exact cleanup CombatEvents and historical-rules compatibility.
2. **TASK-108 — persistent vitality + HUB PokéCenter** — `PokemonVitality` persistence/OCC, reusable atomic vitality-creation authority + existing capture integration, Start/terminal writeback, max-HP reconciliation, Player-root lock order and idempotent selected-`teamId` PokéCenter command.
3. **TASK-109 — first-Pre-alpha bootstrap/content/admission** — starter bootstrap consumes TASK-108 vitality creation atomically with initial ownership/Inventory/Team/loadout; also owns Verdant Edge/Wilds authoritative content, strict Team/loadout admission, provisional XP/drop rules and fail-closed content authority.
4. **TASK-110 — authoritative Hunt automation/offline/provenance** — Capture/Potion/Revive policy persistence/evaluation, internal checkpoint/claim, forward-only policy edits, 8h frozen offline target, post-Battle Revive/D-F16 atomic transaction, exact consumed-selection replay provenance and bounded Hunt activity.
5. **TASK-100 management surfaces** — extend the existing planned Pokémon/Team management UI to own the accepted Inventory browsing surface as well: persisted vitality presentation, Collection/Team/loadout management and bounded owned-item quantity/information browsing with no client consume/grant authority.
6. **TASK-103 presentation rebase** — consume TASK-107/106/108 authoritative runtime facts, preserve v1, add v2 for in-Battle Revive/cleanup, keep Hunt activity separate, use persisted vitality origin and enforce the D-F16 Battle N+1 publication gate.
7. **TASK-039 Cards/client rebase** — consume TASK-109/108/103, remove superseded manual Potion/capture/Checkpoint/Claim controls, add management policies, strict Pre-Start, compact resolved feed, HUB/PokéCenter/recovery states and fail-closed unavailable/retry UX.
8. **TASK-041 end-to-end/offline/performance acceptance** — first-Pre-alpha cross-slice validation after TASK-100/103/039/105–108; Pixi parity remains later through TASK-040.

READY gates for any new implementation slice: exact owner/reviewer/auditor assignments, scoped objective/in/out/acceptance/tests/dependencies, approved SPEC-020/021 references, compatibility plan for historical versions, and explicit migration/deploy/irreversible-action boundary. No slice may rely on TASK-039/TASK-103's previous `ACTIVE` labels as authorization.

## Dependencies

- Human Owner product directions dated 2026-10-01/02.
- TASK-093 consultant governance.
- Existing accepted SPEC-003/007/013/014/015/016/017 as forward-amended by approved SPEC-020/021, plus current DRAFT SPEC-019.
- Existing TASK-039 source is audit evidence, not a dependency required to define the realignment.

## Risks / irreversible actions

- Reinterpreting an accepted contract without a formal Class-A amendment could create implementation drift; prohibited.
- Removing or superseding already-persisted/public behavior requires compatibility/migration planning under the accepted contracts; that implementation work is not authorized in this task.
- No irreversible runtime/database/Git action is authorized.

## Expected files / boundaries

- `docs/project/PRODUCT_EXPECTATIONS_BASELINE.md`
- `docs/project/PRODUCT_FLOW_DECISION_MAP.md`
- `docs/project/PROJECT_ROADMAP.md`
- `docs/specs/SPEC-020-management-first-idle-product-realignment.md`
- `docs/specs/SPEC-021-persistent-pokemon-vitality-pokecenter.md`
- affected accepted specs now carry forward-amendment pointers to approved SPEC-020/021
- no production source code

## Completion

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
