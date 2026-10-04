# SPEC-020 — Management-First Idle Product Realignment

- Status: **APPROVED — Class A; Human Owner accepted the reconciled package on 2026-10-02 after final semantic and architecture/replay QA READY at P0/P1/P2 = 0/0/0. Implementation, migration, public enablement and Git history remain separately gated.**
- Owner: PM / Architecture Coordinator
- Human authority source: Human Owner directions dated 2026-10-01/02
- Product baseline: `docs/project/PRODUCT_EXPECTATIONS_BASELINE.md`
- Flow source: `docs/project/PRODUCT_FLOW_DECISION_MAP.md`
- Forward HUB networking amendment: **ADR-007 accepted by the Human Owner on 2026-10-04.** Ordinary
  HUB use has no ambient shared multiplayer presence/networked movement/global HUB chat/always-on
  socket. Any later local/private HUB scene or locomotion remains a separate presentation choice;
  player-to-player realtime exists only through explicit action-scoped feature sessions.

## 1. Problem

PokeNexus accumulated accepted product/API/UI contracts while several high-level interaction assumptions were never explicitly revalidated against the intended product identity.

The Human Owner has now clarified that PokeNexus is primarily a **management-first Idle game**, not an Adventure/Action game, and that product development must pause until all affected player flows are aligned.

Confirmed conflicts include:

- PvE/World/Zone/Hunt must not imply manual movement or exploration;
- the HUB is the only intended free/manual movement surface;
- healing Potions are never manual and must instead be automatic HP%-based behavior only in explicitly enabled PvE;
- Hunt terminal presentation must not imply a post-Hunt reward grant when reward authority belongs to completed Encounters.

Several additional player-facing behaviors already exist in accepted contracts or implementations but are not automatically retained merely because they exist. Those items require explicit Human Owner reconfirmation before future scope relies on them.

## 2. Goals

- freeze the management-first Idle interaction model as the product-level constraint for affected systems;
- reconcile confirmed current Human direction with accepted SPEC-013, SPEC-015 and SPEC-016 semantics;
- distinguish technical authority/endpoints from player-facing controls;
- identify historical accepted behavior that must be explicitly reconfirmed rather than silently carried forward;
- keep current deterministic/security/idempotency/reward-integrity guarantees unless a product decision truly requires changing them;
- prevent TASK-039/TASK-103 or downstream gameplay-facing work from advancing on unresolved product assumptions.

## 3. Non-goals

This specification does **not** decide:

- sustainable consumable acquisition/economy beyond the fixed bootstrap/first-`Wilds` stock;
- later reconfirmation of the provisional `Verdant Edge -> Wilds` XP curve and later Zone/Hunt unlock progression;
- runtime/schema implementation of the accepted Potion/Revive serialization contract in §8.2/§8.3;
- physical endpoint/table decomposition beyond the normative forward-only policy, replay and serialization invariants in §8.2/§8.3;
- Safari-specific duration/objective/capture/reward rules and whether the exploratory stamina concept becomes a real mechanic;
- Beta audience or Release numerical health thresholds;
- Duo/PvP/Gym/World Boss detailed interaction models.

No first-Pre-alpha player-visible product choice remains open in this reconciliation package. **D-F16 B** is selected: a simultaneous-KO `draw` remains the immutable Battle result; if post-Battle Revive succeeds, the current Encounter is consumed as a resolved non-win with no capture/XP/item reward, its `PendingEncounterSelection` is consumed by that explicit disposition, and the open-ended Hunt advances to the next Encounter. The Human Owner also fixed that Revive clears transient effects and can never rewrite the sealed Battle result/capture/reward. Initial defaults remain **Auto-Potion OFF** and **Auto-Revive OFF** before first configuration; while disabled, neither family may automatically use or debit its consumables, and dormant threshold/item-priority/reserve fields have no player-effective behavior. The economy/XP/progression/content/Beta items below remain later Human decisions. Exact serialization/effective-boundary items are **technical/Class-A reconciliation choices**, not OPEN-HO gameplay decisions, and must preserve the already-approved player-visible ordering/forward-only semantics. New-player bootstrap is now fixed structurally and numerically: choose one **Lv. 1** starter from Bulbasaur/Charmander/Squirtle/Chikorita/Cyndaquil/Totodile; initially own only that Pokémon; auto-create a one-Pokémon Team with it as Leader; auto-assign up to 4 valid Lv. 1 Moves; grant **50 Poké Balls / 20 basic Potions / 5 Revives**; the basic Potion restores **25% max HP**; the starter Revive is the **25% max-HP tier**; the current Revive catalog is exactly **25% / 50% / 100%**; no formal Pre-alpha tutorial; first Hunt immediately available once bootstrap is valid. `Wilds` does not replenish Revive, so the five initial Revives are limited stock for this first Hunt. `Verdant Edge -> Wilds` is fixed as the permanent basic Hunt and open-ended in Pre-alpha. Species weights are **Pidgey 16% / Rattata 15% / Caterpie 18% / Sentret 17% / Ledyba 17% / Sunkern 17%**. Species and level are selected independently, so every species uses **Lv.1 50% / Lv.2 35% / Lv.3 15%**. All are capturable and all have at least one executable Lv.1 progress-capable Move under current production support. Provisional Encounter XP is **2 × wild level Player XP / 6 × wild level Pokémon XP pool**, pending later balance reconfirmation. Completed Encounters independently roll **15% Poké Ball ×1** and **5% basic Potion ×1**, allowing both drops together; Revive does not drop here. Recovery is already fixed at 30s Player-wide for Solo-Hunt Start; Pre-alpha Solo-Hunt auto-Potion enablement/trigger choices/active target/item priority-fallback-reserve/timing/cooldown/offline/depletion are already fixed; capture OFF/no-eligible behavior, Retreat destination, player-facing Checkpoint/Claim removal and mid-Hunt policy mutability are also decided in section 7 and are not open items.

## 4. Normative product identity

### 4.1 Management-first Idle

PokeNexus core gameplay is management/configuration/strategy first.

A player-facing feature must not introduce Adventure/Action-style execution merely because a conventional RPG would expose it. Product proposals must classify material inputs as management/configuration, strategic intervention, HUB/social interaction or action/adventure execution.

Action/adventure-style execution in the core Idle loop requires explicit Human Owner approval.

### 4.2 PvE World/Zone/Hunt traversal

PvE traversal/progression is automatic.

- no free/manual avatar locomotion is part of World/Zone/Hunt gameplay;
- no manual exploration loop is required to discover/advance ordinary Hunt Encounters;
- the player may select Zone/Hunt/content targets as management decisions;
- visual map/area presentation remains presentation only unless a later accepted product rule says otherwise.

### 4.3 HUB movement exception

The HUB remains the sole currently intended surface where a later accepted UX may expose free/manual
avatar movement.

Under ADR-007, any such HUB movement is local/private presentation state unless a separately accepted
feature action creates a bounded player-to-player session. HUB movement does not imply ambient shared
presence, shared movement authority or a generic realtime room, and it must not be reused as precedent
for PvE movement.

## 5. Healing Potion correction

### 5.1 Superseded product premise

The following historical premise is no longer valid for future product behavior:

> Player manually submits a healing-Potion command during a Hunt.

This affects at least:

- SPEC-013 §4 inherited constraint 8 and §5.6 explicit healing/item-use boundary;
- SPEC-013 §6/§6.1 references to already-accepted manual healing commands;
- SPEC-015 goals/non-goals and explicit `heal-hp` public command model;
- SPEC-015 §9.2 explicit healing-item use and downstream transaction/persistence clauses;
- SPEC-016 active-Hunt explicit-healing UI;
- TASK-038 implementation surface for explicit Hunt healing;
- TASK-039 explicit healing controls.

### 5.2 Replacement direction

Healing Potions are:

- automatic only;
- triggered from HP-percentage conditions;
- available only in explicitly enabled PvE content;
- never exposed as a manual Potion-use action.

For the **Pre-alpha Solo Hunt** slice, the Human Owner further fixed:

- initial Auto-Potion policy state is **OFF** until explicit Player configuration; while disabled, no automatic Potion use/debit occurs;
- Potion configuration is **Player-wide/global**;
- HP trigger choices are **90/80/70/60/50/40/30/20/10%**, evaluated as **current HP <= configured threshold**;
- target is always the **active Pokémon**;
- allowed Potion items, priority/fallback and minimum reserve follow the Ball-policy model;
- Potion automation may execute both **during Battle and between Battles**;
- each successfully applied Potion consumes one **action opportunity ("turno" de ação)**; exact mapping to the existing non-turn-based cadence/GCD belongs to the Class-A amendment;
- when damage/DoT and Potion eligibility coincide at the same logical boundary, **damage/DoT resolves first**. If HP reaches 0, KO stands and the Revive path owns eligible recovery; Potion evaluates only if the active Pokémon remains conscious;
- after an automatic Potion is applied, the active Pokémon has a **5s auto-Potion cooldown** before another automatic Potion may be applied to it;
- ordinary Potion never revives and does not reverse an already-authoritative KO;
- offline advancement uses the same policy/Inventory/cooldown semantics;
- if no eligible Potion remains, Hunt progression continues automatically without a manual prompt.

The player-visible damage/KO-versus-Potion order is fixed above. The coordinated Class-A contract still owns exact serialization against Retreat/Encounter-completion commands and the deterministic cadence mapping of consumed action opportunities, without changing the approved gameplay consequences.

### 5.3 Compatibility requirement

Until the coordinated Class-A amendment is accepted:

- existing manual-heal implementation may remain preserved for migration/review evidence but must not be treated as desired product behavior;
- new UI must not add/reinforce manual Potion controls;
- no public enablement should depend on the superseded manual-heal product premise;
- implementation migration/removal details remain downstream after this Class-A direction is accepted.

## 6. Reward and terminal clarification

SPEC-013/SPEC-015 already define reward authority compatibly with the current product expectation:

- each successfully completed Encounter creates its own reward source;
- reward entitlement/resolution is not created by Hunt terminalization;
- later retreat/KO/terminalization does not confiscate already durable completed-Encounter rewards;
- checkpoint/claim may reconcile/report effects operationally;
- SPEC-015 explicitly has no separate unclaimed-reward pool.

Therefore:

- Hunt terminal UI may show terminal reason, final state and historical/aggregate summary;
- it must not imply that rewards are granted only after the Hunt ends;
- wording such as generic “results” must be reviewed where it could imply a post-Hunt grant phase.

No reward-integrity implementation change is authorized by this clarification unless an audit finds actual behavior inconsistent with the existing accepted contract.

## 7. Active-Hunt controls — Human decisions 2026-10-01

### 7.1 Capture is management/automation

Historical SPEC-013/014/015 and TASK-039 include a manual pending-capture path and per-Encounter Ball choice.

The Human Owner has now superseded that future product behavior:

- no per-Encounter manual capture prompt;
- no manual pending-capture gameplay decision;
- no per-Encounter manual Ball choice;
- capture behavior is governed by management/automation policy.

The Human Owner selected the disabled behavior explicitly:

- `auto-capture = OFF` means **no capture attempt**;
- no Ball is consumed;
- there is no manual fallback;
- the capture opportunity closes;
- the Hunt continues.

The existing enabled-policy dimensions remain the accepted management base: explicit Ball permissions, minimum reserve, ordered visible-condition rules, VIP explicit opt-in and no-eligible-Ball = no automatic attempt.

### 7.2 Checkpoint

Checkpoint is a valid technical authority boundary. That does not automatically mean the player should press a visible `Checkpoint` button.

**HO-DIRECT:** checkpoint is internal/automatic. The desired product has no player-facing Checkpoint control.

### 7.3 Claim

Current SPEC-015 `claim` primarily advances/reconciles and returns a bounded already-applied effect delta.

**HO-DIRECT:** claim/reconciliation is internal/automatic. The desired product has no player-facing Claim control. UI may passively report authoritative effects; Claim does not grant the reward.

### 7.4 Retreat

**HO-DIRECT:** in Solo Hunt, Retreat means **leave the Hunt and return to the HUB**. It remains a deliberate manual strategic intervention. No other Hunt-specific destination/outcome is implied. Other game modes will define their own exit/retreat semantics separately.

The accepted technical safe-boundary machinery may be retained insofar as it is needed to commit authoritative state consistently before returning the Player to the HUB; it is an implementation/authority mechanism, not a different product meaning of Retreat.

### 7.5 Recovery/setup downtime and no-free-reroll

The Human Owner has now selected:

- keep the current same-Zone **no-free-reroll** behavior for unresolved selections; **D-F16 B is the sole first-Pre-alpha explicit exception**, where simultaneous-KO `draw` + successful post-Battle Revive durably resolves the Encounter as non-win and consumes its pending selection before the next Encounter is selected;
- recovery/cooldown applies after both Retreat and defeat/no-living terminalization;
- recovery is **Player-wide only for starting Solo Hunts**: while active, no Solo Hunt may start in any Zone/Hunt, but HUB/management surfaces remain available; in the first Pre-alpha the HUB is non-locomotion, while any later accepted HUB locomotion remains local/private presentation unless an owning feature action explicitly creates a bounded player session under ADR-007;
- recovery duration is **30 seconds globally**, not a per-Hunt/content tuning input.

The Human Owner also **reversed the earlier fresh-Hunt full-HP assumption**:

- Pokémon HP persists after a Hunt;
- starting a new Hunt does not automatically heal the Team;
- the Player may return to the HUB and use the **PokéCenter** to heal Pokémon fully.

This is a new Class-A product direction because the accepted baseline currently treats fresh Hunt as a new full-HP scope and explicitly avoids durable HP/revival outside Hunts. PokéCenter cost/scope/timing and damaged/KO Hunt admission are now fixed by the Human Owner; only the exact persistent-vitality implementation/concurrency contract remains open.

Technical audit confirms the current implementation does **not** already provide this behavior:

- `pokemon_instances` stores ownership/species/level/IV/configuration but no durable `currentHp`;
- `createFreshSoloHuntCadence` initializes every Team member at derived max HP;
- current HP lives inside Hunt runtime/checkpoint state only.

Therefore the accepted amendment must establish a durable owned-Pokémon vitality source. At minimum:

- Hunt Start reads/pins durable current HP for the selected Team;
- transient Hunt effects/cooldowns/cadence state may reset between Hunts, but HP does not auto-reset;
- Retreat/defeat/automatic terminal atomically persist the authoritative final owned-Pokémon HP together with terminal/recovery state;
- recovery expiration does **not** heal or revive Pokémon;
- PokéCenter performs the authoritative full-heal mutation under its own accepted product/API contract;
- legacy Hunts/checkpoints created under full-HP-start semantics replay under their historical version and are not reinterpreted.

The Human Owner further selected the product semantics:

- PokéCenter heals the **selected/active Team only**;
- PokéCenter healing is **free**;
- a damaged Pokémon may enter a Hunt at its persisted current HP;
- KO Pokémon may remain in the selected Team;
- Hunt Start is allowed iff **at least one selected Team member is conscious**. A full six-member Team with all 6 KO is therefore blocked; smaller otherwise-valid Teams use the same invariant.

The Human Owner selected the remaining timing/state semantics:

- healing is **immediate** on PokéCenter interaction;
- healing restores each selected/active Team member to **max HP and conscious**, including KO members;
- PokéCenter may be used while the **30s Hunt recovery** timer is active.

### 7.7 Revive inside Hunt

**HO-DIRECT:** Revive exists inside Solo Hunts as an **automatic policy-driven consumable**, not a manual combat action.

Confirmed semantics:

- initial Auto-Revive policy state is **OFF** until explicit Player configuration; while disabled, no automatic Revive use/debit occurs;
- the current Revive catalog has exactly **25% / 50% / 100% max-HP restoration tiers**;
- the automatic target is exclusively the **Leader/active Pokémon that becomes KO during the current Hunt**; reserve KO Pokémon are not automatic Revive targets;
- while the opponent side still has a living combatant after the authoritative action/effect chain, an eligible Leader/active KO evaluates automatic Revive before replacement/Player-side defeat finalization;
- if that same resolved chain has already exhausted the opponent side, the Battle outcome is sealed **before** Player Revive. A later post-Battle Revive may restore Hunt carry state but cannot alter the already-authoritative `BattleEnded` winner/draw, create capture eligibility or convert a non-win into an Encounter victory reward;
- the earlier fixed **2-second `reviving` state is removed**;
- a successful Revive consumes one **action opportunity ("turno" de ação)**. The product rule is the consumed action opportunity, not a new wall-clock delay; exact deterministic mapping onto the existing non-turn-based combat cadence/GCD belongs to the Class-A combat amendment;
- successful Revive clears the revived Pokémon's transient combat/cadence state: buffs, debuffs, DoTs/HoTs, status/effect instances and action locks are removed and stat stages reset to neutral. Move cooldowns and Move-sequence cursor are not reset; the Revive action-opportunity cost still applies;
- when the last conscious selected Pokémon reaches KO, the Hunt evaluates eligible Revive automation **before** committing `no_living`;
- `no_living` terminalization occurs only if no eligible Revive can be applied under the active policy/inventory state;
- the same deterministic automation applies during **offline advancement**;
- Revive item management follows the Ball/Potion model: explicit allowed items, configured priority, fallback and **minimum reserve**;
- the same eligible Leader/active Pokémon may be revived **multiple times in the same Hunt**, with no additional per-Pokémon/Hunt count limit or cooldown beyond Inventory + policy + minimum reserve;
- policy changes remain forward-only under the common active-Hunt automation rule.

This supersedes the accepted SPEC-007/SPEC-013 no-revival baseline and the intermediate 2s-reviving proposal. The coordinated Class-A amendment requires a shared deterministic KO -> Revive-action-opportunity -> conscious primitive plus authoritative Inventory debit/order.

The Revive gameplay policy block is now closed for the Pre-alpha Solo-Hunt direction. The restoration percentages are fixed at **25% / 50% / 100%**. Exact item names/IDs, broader economy/acquisition and other per-item content metadata remain downstream content work rather than open first-slice gameplay-policy semantics.

The exact storage shape is downstream architecture, not Human gameplay policy, but it requires OCC/concurrency protection and a rule for reconciling durable absolute HP when a later mutation changes derived max HP.

### 7.6 Mid-Hunt automation policy changes

**HO-DIRECT:** automation policies may be changed while a Hunt is active, and **all mutable Hunt automation policies use the same forward-only principle**.

Already-resolved history uses the policy effective at that time. A newly saved policy applies only prospectively from the next authoritative effective boundary and never reinterprets prior Encounters/effects. Existing SPEC-015 auto-capture policy replacement is structurally compatible with this principle.

Examples explicitly given by the Human Owner: change which Ball should be used, disable auto-capture, alter automatic-Potion parameters, or disable Potion use. For Pre-alpha Solo Hunt, Potion percentage now means the configured **HP trigger threshold** selected from 90% down to 10% in 10-point steps.

## 8. Impact on accepted contracts

| Artifact | Current status under realignment | Required action |
|---|---|---|
| SPEC-003 | **APPROVED forward amendment** | Add a versioned generic external-action / KO-intervention primitive so an accepted Hunt policy can apply Potion during Battle and can evaluate Revive **after Player KO but before replacement/Player-side defeat finalization only while the opponent side still has a living combatant**. If the opponent side is already exhausted, lifecycle seals `BattleEnded` first and any Revive is post-Battle Hunt/cadence processing. The immutable Battle input/state pins the intervention side and exact pending identity for replay. Successful Revive clears that Pokémon's transient effects/status/action locks and neutralizes stat stages, while preserving Move cooldowns/cursor and applying one GCD action-opportunity cost. Historical rules versions keep current immediate lifecycle/no-revive semantics. |
| SPEC-005 / SPEC-012 | **Compatible; no gameplay-rule amendment required for P1A** | Preserve strict Team/loadout semantics: 1–6 valid members, dense 1–4 selected Moves, executable-support intersection and no synthesized fallback. First Pre-alpha Start consumes these existing rules and fails closed when a selected member/loadout is invalid or unsupported. |
| SPEC-013 | **APPROVED forward amendment** | Replace manual Potion premise with the Pre-alpha Solo-Hunt auto-Potion rule (Player-wide/global policy; 90%-10% trigger choices using **HP <= threshold**; active target only; Ball-like item priority/fallback/reserve; **basic Potion = 25% max-HP heal**; Battle + inter-Battle execution; one consumed action opportunity per applied Potion; damage/DoT-before-Potion at the same logical boundary; 5s cooldown; offline parity; no manual fallback); add management-first/automatic-PvE traversal clarification; remove manual pending-capture future behavior; preserve the accepted **pre-N-reward capture -> N reward -> N+1 availability** ordering; **replace fresh-Hunt full-HP/no-durable-health baseline with persistent Pokémon HP + PokéCenter full-heal flow** and explicitly prohibit PokéCenter use while the Hunt remains active; retain same-Zone no-free-reroll; set Player-wide Hunt recovery after Retreat/defeat to **30s**; for open-ended `Wilds`, terminal paths are Retreat/`no_living` only; replace immediate no-revival/no-living baseline with automatic Leader/active-only Revive, exact **25% / 50% / 100%** item tiers, one consumed action opportunity, full transient-effect cleanup, pre-replacement intervention only while the opponent remains alive, and post-Battle Revive when opponent exhaustion has already sealed the Battle result. A post-Battle Revive never rewrites `BattleEnded`, capture eligibility or victory reward. |
| SPEC-007 | **APPROVED forward amendment** | Add executable Revive consumables and shared deterministic KO -> Revive-action-opportunity -> conscious semantics; exact current tiers are **25% / 50% / 100% max HP**, target is Leader/active only, allowed item/priority/fallback/reserve management follows the Ball/Potion model, repeated same-Pokémon use has no extra Hunt cooldown/count cap, and authoritative item consumption/restored-HP/offline behavior must be deterministic. Successful Revive also performs deterministic transient-state cleanup for the revived Pokémon: remove buffs/debuffs/DoTs/HoTs/status effects/action locks and reset stat stages to neutral while preserving Move cooldowns/cursor. Basic Potion content for first Pre-alpha is **25% max-HP healing** through the existing shared heal primitive. |
| SPEC-014 | **APPROVED forward amendment** | Keep capture management/automation, remove future dependence on manual pending capture/per-Encounter Ball prompts, retain enabled/permissions/reserves/ordered visible rules/VIP opt-in/no-eligible=no-attempt, and define `OFF` as no attempt/no debit/opportunity closes/Hunt continues. |
| SPEC-015 | **APPROVED forward amendment** | Remove manual Potion product route/semantics and replace it with authoritative **Player-wide/global** auto-Potion policy persistence/execution using the Human-selected `HP <= threshold`, active-target, item-priority/fallback/reserve, action-opportunity, damage/KO-before-Potion, cooldown and offline rules; classify checkpoint/claim as internal automatic reconciliation rather than player gameplay actions; remove future manual capture/skip behavior; preserve accepted capture-before-current-reward ordering; generalize forward-only active-Hunt policy replacement to Capture/Potion/Revive; make advancement/reconnect fail closed on unavailable authority without fabricating progress; and provide an authoritative bounded source for the Card's resolved-Encounter reporting facts (capture result, XP, drops, item consumption, KO/Revive) without reclassifying them as CombatEvents. |
| SPEC-016 | **APPROVED forward UI amendment** | First Pre-alpha IA is Hunt / Pokémon / Teams / Inventory / Settings + functional non-locomotion HUB. Hunt is Cards-only. Remove explicit manual-healing, manual capture, Checkpoint and Claim controls; keep Retreat; pre-Start shows **Team + possible Species + rewards** while policies/resources stay in management surfaces; active Hunt exposes Capture/Potion/Revive policy editing and a compact resolved-Encounter feed; PokéCenter is unavailable while Hunt is active; degraded gameplay shows fail-closed unavailable/error + retry; “results” means final state/summary, not reward grant. |
| Collection/Player State + HUB/PokéCenter contract | **APPROVED as SPEC-021** | Expose authoritative out-of-Hunt Pokémon vitality where management needs it; define free immediate full-heal for the selected/active Team; reject/disable PokéCenter while a Solo Hunt is active; allow it during the 30s recovery after Retreat/`no_living`; preserve concurrency/OCC with Hunt terminal HP writeback. |
| SPEC-017 | **APPROVED forward compatibility amendment; combat-only boundary preserved** | Keep public presentation feed limited to authoritative CombatEvents. Preserve accepted `pokenexus.combat-presentation.v1` bytes/schema for historical v1 streams and add forward **`pokenexus.combat-presentation.v2`** for source versions that can emit `CombatantRevived`; v2 is additive and preserves existing privacy projection. Potion healing still uses `HealingApplied`. Capture, rewards and actual Ball/Potion/Revive Inventory consumption remain non-Combat facts and come from a separate bounded Hunt-activity/reporting source. Visual/Pixi remains deferred beyond first Pre-alpha. |
| SPEC-018 | Review for compatibility | Published catalog remains selection authority; ensure no traversal/exploration implication. |
| SPEC-019 DRAFT | **Top-level rebase applied 2026-10-02; remains DRAFT** | Its normative header/non-goals now bind future-v4 interpretation to TASK-106/SPEC-020/021, preserve manual Potion/capture material only as legacy evidence, recognize the 8h cap as an implementation gap rather than a benchmark fact, and keep SPEC-017 combat activity separate from SPEC-015 Hunt activity. Detailed historical analysis remains traceability evidence. |

### 8.1 Accepted Class-A reconciliation order

The Human Owner accepted this coordinated Class-A direction on 2026-10-02. The amendments below are the forward authority for affected behavior; historical pinned versions retain their historical semantics.

1. **Combat action/lifecycle primitive — SPEC-003:** add versioned external Potion action + KO-intervention/Revive semantics that pause before Player replacement/defeat only while the opponent remains alive; opponent exhaustion seals Battle outcome first. Define deterministic Revive transient-state cleanup.
2. **Inventory/effect primitives — SPEC-007:** define Revive 25%/50%/100% item semantics, shared cleanup of effects/status/stages/action locks, and preserve the shared deterministic 25%-max-HP basic-Potion heal primitive.
3. **Persistent vitality/PokéCenter — SPEC-021:** define owned-Pokémon current HP persistence, OCC/versioning, Hunt Start read/pin, terminal/Retreat writeback and free selected-Team full-heal in HUB; PokéCenter fails while Hunt is active.
4. **Solo-Hunt lifecycle — SPEC-013:** rebase Start/admission, persistent HP, recovery, open-ended `Wilds`, Potion/Revive automation, no-free-reroll and Retreat/`no_living` outcomes on the new primitives.
5. **Capture model — SPEC-014:** remove future manual pending capture while preserving capture-policy dimensions and accepted capture probability/economy authority.
6. **Authoritative Hunt API — SPEC-015:** reclassify checkpoint/claim as automatic reconciliation transport; remove future manual Potion/capture gameplay; add forward-only Capture/Potion/Revive policy persistence; preserve pre-N-reward capture ordering; define vitality orchestration, offline 8h cap, fail-closed degraded behavior and bounded Hunt-activity reporting.
7. **Client IA — SPEC-016:** Cards-only first Pre-alpha, compact pre-Start panel, strict Start failure UX, active Capture/Potion/Revive policy management, resolved-Encounter feed, Retreat, non-locomotion HUB/PokéCenter and no active-Hunt PokéCenter.
8. **Presentation feed — SPEC-017:** keep CombatEvents combat-only; preserve historical public v1 exactly and add additive public v2 for forward `CombatantRevived` projection; do not encode capture/reward/Inventory-consumption activity as combat.
9. **Frontier/workload draft — SPEC-019:** top-level future-facing rebase reflects approved SPEC-020/021, while its remaining v4 workload/security clauses stay DRAFT until separately accepted; legacy replay/version compatibility remains mandatory.

Non-negotiable first-Pre-alpha invariants across every amendment: no fabricated progress/reward/item effects; no manual Potion; no manual per-Encounter capture/Ball prompt; no player Checkpoint/Claim; Retreat remains explicit; Capture/Potion/Revive edits are forward-only; Encounter N cannot use its own reward to fund its capture; HP persists across Hunts; PokéCenter requires no active Hunt; eligible Revive is evaluated before Hunt-level `no_living`, but never delays or rewrites a Battle result once the opponent side is exhausted; successful Revive clears the revived Pokémon's transient effects/status/stages/action locks; offline uses the same policy/item semantics; historical accepted Hunts retain their versioned historical rules.

### 8.2 Accepted normative amendment text

The clauses below are the accepted forward replacement/addition text for the affected Class-A contracts. Historical pinned rules/contracts remain replayable under their original versions.

#### 8.2.1 SPEC-003 — external item action and KO intervention

**Proposed additive versioned rule:**

For a Battle rules version that explicitly enables external mode interventions, SPEC-003 adds two generic deterministic primitives without giving the Combat Engine Inventory or policy authority. Intervention capability is part of immutable Battle authority, never process-local mode configuration: the forward Battle input pins `koInterventionSideId: BattleSideId | null`, and the resulting Battle state/checkpoint preserves that exact value. This first intervention rules version permits a non-null intervention side only when that pinned side has `activeCapacity = 1`; a future mode with multiple simultaneous active Combatants requires a newer rules version with an explicitly specified deterministic pending-order/queue contract. First Pre-alpha Solo Hunt pins the single-active Player side; historical/default rules versions pin `null`.

**External action consequence**

- The forward `CombatStimulus` union gains one versioned generic `externalHpHeal` stimulus carrying the target Combatant identity, the action-owner Combatant identity, already-normalized deterministic healing magnitude and required source/provenance identity. It carries no ItemId, Inventory quantity or policy branch. For first Pre-alpha Auto-Potion, target and action owner are the same current Player-active Pokémon.
- The mode/orchestrator may submit one normalized external HP-heal consequence at the current Battle logical time only when the Battle is active, no mandatory replacement is pending and no KO intervention is pending.
- Potion/item identity, Inventory eligibility and policy selection remain outside SPEC-003. The engine receives only the already-authorized normalized consequence.
- A normal external heal requires a living damaged target and uses the existing shared rational/clamping HP-heal evaluator. It emits the existing `HealingApplied` event.
- A successfully applied external item action consumes exactly one future action opportunity of the stimulus's validated action-owner Combatant. For first Pre-alpha Auto-Potion this is the healed Player-active Pokémon:

```text
nextActionAtMs =
  max(current nextActionAtMs, current combatTimeMs)
  + globalActionCooldownMs
```

- The external item action does **not** change any `moveReadyAtMs` entry and does not advance the automatic Move cursor because no Move was used.
- A rejected/no-op item consequence changes neither readiness nor logical time.
- Every accepted `externalHpHeal`, including its exact target/action-owner identities and provenance, is represented in replay/checkpoint provenance. Direct execution, segmented advancement, restart and offline replay must reproduce identical state/events/readiness; adapters may not reconstruct an item action from HP deltas.

**KO intervention**

- The forward `CombatStimulus` union gains one versioned `koInterventionDecision` stimulus bound to the exact pending Combatant and carrying exactly `decline` or `revive`; the revive branch additionally carries the already-normalized positive revive fraction/provenance required for deterministic replay.
- The immutable `koInterventionSideId` is the sole capability switch for this forward rules version. No adapter/process-local flag may enable Revive for a Battle whose pinned value is `null` or names another side.
- Battle state/checkpoint adds `koInterventionPending: null | { sideId, combatantId }`. The pending identity must name the pinned intervention side's currently active Combatant at `0` HP. A side cannot simultaneously be present in replacement-pending state and own `koInterventionPending`; the intervention is established first.
- After a complete accepted Move/reaction or same-timestamp timed-effect batch has emitted all HP/KO consequences, the engine first evaluates whether **at least one Battle side other than `koInterventionSideId` still has a living Combatant**. Only then may the engine pause before intervention-side replacement/defeat finalization and record `{sideId, combatantId}` as `koInterventionPending` for the newly KO active intervention-side Combatant. If every non-intervention side is exhausted, normal Battle lifecycle finalization runs immediately and no `koInterventionPending` is created for that Battle boundary. First Pre-alpha Solo Hunt remains exactly two-sided; this wording keeps the generic primitive deterministic for any later multi-side rules version.
- While `koInterventionPending` exists, `useMove`, time advancement and forced replacement are rejected. The only legal mode decision for that pending Combatant is `revive` or `decline`.
- `decline` performs the existing lifecycle evaluation at the same logical timestamp with no state/RNG change before that evaluation.
- `revive` accepts only a currently KO pending Combatant and one normalized positive rational revive fraction. Requested HP is:

```text
max(1, floor(maxHp * p / q))
```

  clamped to `maxHp`.
- Successful in-Battle revival keeps that Combatant active, emits a new versioned `CombatantRevived` CombatEvent carrying applied HP/resulting HP, clears the pending intervention and consumes one future action opportunity of that revived Combatant using the same GCD formula above. Move cooldowns/cursor remain unchanged.
- Revive atomically performs a **transient-state reset** for the revived Combatant before combat resumes: every Active Effect targeting that Combatant is removed regardless of battle/cadence lifetime, all stat stages reset to `0`, and all action-lock state for that Combatant is cleared. The accepted event order for one in-Battle Revive stimulus is: `CombatantRevived`; then one `EffectRemoved` per removed effect ordered by `(applicationSequence, effectId UTF-8)`; then one `StatStageChanged` for each nonzero stage in fixed `atk, def, spa, spd, spe` order. For prior stage `s != 0`, that event is byte-semantically fixed as `requestedDelta = -s`, `appliedDelta = -s`, `resultingStage = 0`; action-lock cleanup has no separate CombatEvent. The whole consequence is one atomic deterministic transition. This reset does **not** clear Move cooldowns, Move loadout/cursor, identity, base/derived stats or ability identity.
- Lifecycle is then re-evaluated at the same timestamp. Because `koInterventionPending` can only exist while the opponent still has a living Combatant, this revival may prevent Player replacement/Player-side defeat, but can never resurrect a Battle after opponent exhaustion has already produced `BattleEnded`.
- `koInterventionSideId`, the exact `koInterventionPending` identity and every `revive`/`decline` stimulus are serialized in the versioned Battle/checkpoint/replay authority. Replaying the same pinned Battle input plus stimuli must reproduce the same pending state, events and lifecycle without consulting external mode configuration; the engine never infers a prior decision from resulting HP/lifecycle state.
- For the first Pre-alpha Solo Hunt the pinned intervention side is the Player side only; wild/opponent sides do not gain revival policy by implication.
- Existing CombatEvent schema/rules versions preserve their exact previous event sequence and immediate lifecycle behavior.

**Cadence counterpart**

The generic cadence evaluator receives equivalent external-heal/revive helpers for inter-Battle/post-Battle Hunt state. Consuming one action opportunity adds exactly `globalActionCooldownMs` to the participant's current `nextActionRemainingMs`; Move cooldown remaining values and Move cursor remain unchanged. Cadence/post-Battle Revive performs the same transient-state reset: all cadence effect instances and action locks for that participant are removed before continuation. A cadence DoT KO therefore permits the owning mode to evaluate Revive before declaring Hunt-level no-living. A post-`BattleEnded` Revive never mutates the ended Battle, its outcome or its CombatEvent history.

This proposal is the minimum engine change required to honor in-Battle Revive before Player replacement/defeat **only while the opponent remains alive**, while preserving the opposite rule after opponent exhaustion: sealed `BattleEnded` is never rewritten and any later Revive belongs to Hunt/cadence authority.

#### 8.2.2 SPEC-007 — Potion/Revive Inventory semantics

SPEC-007 section 7.3 is replaced for an explicitly accepted Hunt automation scope by:

- player-owned consumables may be auto-consumed only through a persisted standing policy whose owning mode has an accepted automation contract;
- no generic offline/AI/low-HP auto-consumption exists outside that contract;
- policy execution must still prove authoritative Inventory quantity, item-rule authority, target/context eligibility and exactly-once debit/effect atomicity;
- a failed/no-op consequence consumes nothing.

For first Pre-alpha Solo Hunt:

- the **basic Potion** restores exactly **25% max HP** through the shared normal-heal primitive and can never target/revive a KO Pokémon;
- Revive items normalize to exactly **25% / 50% / 100% max-HP restoration**;
- a Revive primitive accepts only a KO target and changes it to conscious with the restored HP; normal healing and Revive remain distinct consequence kinds;
- successful Revive also clears every transient effect/status/action lock carried by that target and resets all stat stages to neutral; Move cooldowns and Move-sequence cursor remain unchanged;
- Hunt-level target eligibility is Leader/active-only under SPEC-013; SPEC-007 itself does not invent a broader auto-target rule;
- Potion/Revive Inventory debit and resulting HP/action-opportunity state commit atomically;
- no extra per-Pokémon/Hunt Revive count limit or Revive cooldown exists beyond Inventory, policy and minimum reserve.

Historical item-command replay keeps its historical explicit-use semantics under its original contract/version.

#### 8.2.3 SPEC-013 — forward Solo-Hunt lifecycle

The forward Solo-Hunt lifecycle replaces the old manual-heal/fresh-full-HP/no-revival/manual-capture assumptions with:

**Start/admission**

- Start pins a saved Team of `1..6` members.
- Every selected member, including a currently KO reserve, must have a dense `1..4` selected Move loadout whose selected Moves are executable under the pinned production support and include at least one progress/damage-capable executable Move.
- At least one selected member must have persisted `currentHp > 0`.
- Starting HP is read from SPEC-021 durable vitality; Start does not heal.
- Fresh Hunt creation resets prior-Hunt transient cadence effects/GCD/Move readiness/cursor but initializes cadence HP from the pinned persisted vitality.
- Existing Team-order semantics remain: the first living eligible member in pinned Team order is initial active.

**Auto-Potion**

- initial first-Pre-alpha/default state before explicit Player configuration is **OFF**; while disabled, no Potion is automatically used or debited and threshold/item-priority/reserve values are not player-effective;
- configuration is Player-wide/global and mutable during an active Hunt with forward-only effect;
- allowed HP trigger values are `90/80/70/60/50/40/30/20/10%` and trigger when `currentHp <= configured threshold`;
- target is the active Pokémon only;
- item eligibility uses explicit allowed items, ordered priority/fallback and post-debit minimum reserve;
- the basic Potion heals 25% max HP;
- Potion may resolve during an active Battle or between Battles at deterministic authority boundaries;
- all damage/DoT and resulting KO due at that same logical boundary resolve first;
- if resulting HP is `0`, Potion does not run and Revive owns the KO path;
- if the Pokémon remains conscious and the policy is eligible, Potion may apply;
- the Potion trigger is evaluated after each complete accepted combat action/reaction chain and complete same-timestamp timed-effect boundary, before the Solo-Hunt policy selects the player's next Move action at that logical timestamp; it is never inserted into the middle of an action/effect chain;
- one applied Potion consumes one action opportunity using SPEC-003 GCD readiness semantics;
- successful Potion starts a 5-second per-Pokémon auto-Potion cooldown measured on Hunt logical time;
- no eligible Potion means no debit/prompt and the Hunt continues;
- offline advancement uses the same policy, cooldown, ordering and Inventory rules.

**Auto-Revive**

- initial first-Pre-alpha/default state before explicit Player configuration is **OFF**; while disabled, no Revive is automatically used or debited and item-priority/reserve values are not player-effective;
- when the Battle is still active because the opponent side retains at least one living Combatant, every eligible KO of the current Leader/active Pokémon evaluates Revive before forced replacement/Player-side defeat finalization;
- KO reserves are not automatic Revive targets;
- item eligibility uses allowed Revives, priority/fallback and post-debit minimum reserve;
- successful Revive uses SPEC-003 KO-intervention semantics and consumes one action opportunity; there is no separate fixed “reviving” delay;
- successful Revive clears the revived Pokémon's transient combat/cadence state: buffs, debuffs, DoTs/HoTs, status/effect instances and action locks are removed and stat stages become neutral. Move cooldowns/cursor remain unchanged;
- a successful Revive closes automatic-Potion evaluation for that same logical boundary. If the restored HP is below the configured Potion threshold, Potion may be reconsidered only at the next otherwise-eligible combat/cadence policy boundary; Revive therefore cannot chain an immediate second consumable at the same timestamp;
- the same active Pokémon may revive repeatedly while policy/Inventory/reserve permit;
- if no eligible Revive applies and a living reserve exists, existing forced replacement proceeds in pinned Team order;
- if the last conscious selected member becomes KO, Hunt-level Revive is evaluated before `no_living`, including after an already-ended Battle;
- a cadence-effect KO between Battles uses the cadence counterpart of the same rule.
- if one complete same-time chain leaves the opponent side with no living Combatant, Battle lifecycle finalizes **before** any Player Revive. If both sides have no living Combatant, the current lifecycle result is `draw` and that `BattleEnded` outcome is immutable. The Hunt may then evaluate eligible post-Battle Revive for the Player active Pokémon before Hunt-level `no_living`; a successful post-Battle Revive restores the Pokémon and applies its cleanup/GCD cost, but does not create capture eligibility, Encounter victory reward or a rewritten Battle winner.
- **HO-DIRECT D-F16 B:** a simultaneous-KO `draw` followed by successful post-Battle Revive closes the current Encounter as **resolved non-win**. It grants no capture opportunity, Player/Pokémon XP or item reward, consumes that Encounter's `PendingEncounterSelection` as an explicit Human-approved exception to the older draw-retains-token baseline, and then allows the open-ended Hunt to select the next Encounter. The sealed `BattleEnded(draw)` remains unchanged.

**First `Wilds` terminal/recovery**

- `Wilds` is open-ended and has no normal-completion terminal;
- manual `Retreat` and exhausted `no_living` are its only product terminal paths;
- a Battle result is authoritative before any post-Battle Revive. A Player loss with another side still alive reaches its pre-finalization Revive opportunity first; if that fails, ordinary `no_living` follows. A simultaneous all-KO `draw` is already-ended combat: the Hunt may then attempt post-Battle Revive. If it fails and no selected Pokémon is living, ordinary `no_living` follows. If it succeeds, Battle result remains `draw`, the Encounter closes as D-F16 `resolved_non_win` with zero capture/XP/item reward, its pending selection is consumed, and the open-ended Hunt continues to the next Encounter;
- terminalization returns to HUB, produces result/summary reporting and creates a Player-wide 30-second Solo-Hunt Start gate;
- terminalization does not heal;
- PokéCenter is available only after Hunt exit and may be used while recovery is active.
- Retreat has precedence over **new** automatic Potion/Revive consumption at its exact accepted terminal stop boundary. Reconciliation cannot advance past an unresolved `koInterventionPending`: any intervention created at logical time `T < RetreatBoundary` must first resolve under the then-effective policy. If a complete authoritative chain **at exactly** `T = RetreatBoundary` creates a new Player `koInterventionPending`, the frozen Retreat terminal wins that tie: Hunt terminalization records an explicit Hunt-level `abandoned_by_retreat` intervention disposition, submits no `revive`/`decline`, does not mutate or clear the Battle's pending state, does not run replacement/`BattleEnded`, spends no Potion/Revive, and the Hunt terminal reason is `retreat`. The sealed terminal Hunt snapshot therefore may contain a nonterminal current Battle with that exact pending KO intervention; the parent Hunt terminal state makes it non-resumable. The durable versioned Hunt terminal/checkpoint replay authority records `abandoned_by_retreat` together with the exact `battleId`, `sideId`, `combatantId` and Hunt logical timestamp atomically with terminalization; it is not owned by or dependent on expiring public-command transport rows. Replay first reproduces the Battle pending state from its pinned input/stimuli and then the separate Hunt-level Retreat terminal/disposition. All effects/automation consequences authoritative strictly before the boundary remain committed. Absent Retreat, Revive still precedes replacement/`no_living`.

**Capture/reward**

- there is no future per-Encounter manual capture decision;
- auto-capture OFF or no eligible Ball closes that Encounter's capture opportunity with no debit/prompt and the Hunt continues;
- Encounter N automatic capture eligibility/debit uses the locked pre-N-reward Inventory; N reward then commits and may fund N+1 onward;
- Encounter reward remains Encounter-owned and is never a post-Hunt Claim grant.

Historical Solo Hunts retain their pinned historical lifecycle semantics.

#### 8.2.4 SPEC-014 — automation-only capture

Section 11.12 is amended so the forward product has exactly one capture-execution model during Solo Hunts:

- `enabled=true` authorizes standing automatic capture under the accepted Ball permissions, minimum reserves, ordered visible-condition rules and explicit VIP opt-in;
- `enabled=false` means **no capture attempt, no Ball debit, no manual fallback and no pending decision**; the opportunity closes and the Hunt continues;
- enabled policy with no eligible Ball has the same no-attempt/no-debit/no-pending result;
- at most one accepted capture attempt exists per completed Encounter;
- the frozen Encounter individual and accepted capture formula remain unchanged;
- historical pending-manual-capture rows/commands remain legacy compatibility data only and are never fabricated for forward Hunts.

No Genetics/Shiny/capture-probability/economy formula is changed by this amendment.

#### 8.2.5 SPEC-015 — authoritative API/persistence

**Public control classification**

- `checkpoint`/`claim` remain bounded authoritative reconciliation/reporting transports for compatibility and automatic client/server orchestration, but first-Pre-alpha UI exposes no player Checkpoint or Claim action.
- Forward Hunt versions do not create or accept new manual-capture decisions and do not expose a manual Potion gameplay route. Historical command keys/results remain replayable under their original version.
- `Retreat` remains an explicit player command.

**Start**

Start adds SPEC-021 vitality rows to its coherent locked snapshot and enforces the strict all-selected-member loadout rule plus “at least one conscious” admission. It freezes starting `currentHp/maxHp` for every selected member. Start pins the current effective Capture, Potion and Revive policy identity for each family, including the immutable no-saved disabled sentinel where no explicit policy has yet been saved.

**Automation policies**

Capture keeps its accepted policy semantics. Add independent standing Player-wide policy authorities for Potion and Revive:

```text
AutoPotionPolicy:
  enabled
  thresholdPercent in {90,80,...,10}
  orderedItems[]: { itemId, autoUseEnabled, minimumReserve }

AutoRevivePolicy:
  enabled
  orderedItems[]: { itemId, autoUseEnabled, minimumReserve }
```

- before the Player first saves Auto-Potion, its immutable no-saved authority is exactly `policyVersion: null`, `rowVersion: "0"`, `enabled: false`, `thresholdPercent: null`, `orderedItems: []`;
- before the Player first saves Auto-Revive, its immutable no-saved authority is exactly `policyVersion: null`, `rowVersion: "0"`, `enabled: false`, `orderedItems: []`;
- those null-version sentinels authorize no item-rule lookup, eligibility, debit or effect. Start/checkpoint/replay pins the null sentinel as the effective family identity where applicable; the active-Hunt policy interval may carry `null` only for this exact immutable disabled/no-saved meaning;
- the first explicit save creates the first immutable non-null policy version and advances that family's OCC `rowVersion`; later versions retain the accepted forward-only interval semantics;
- ordered item arrays define priority/fallback;
- item authorities are server-pinned/versioned exactly as capture Ball authority is;
- unknown/unavailable authority fails closed;
- each family has OCC `rowVersion` and immutable accepted policy versions;
- active-Hunt replacements first reconcile elapsed history to the save cutoff under the old interval, then activate the new version prospectively;
- Capture/Potion/Revive intervals are versioned independently but serialize through the same Player Hunt root/command sequence.

**Inventory/ordering**

All Capture/Potion/Revive debits serialize through the authoritative Inventory aggregate. Encounter N auto-capture freezes Ball eligibility from pre-N-reward Inventory, commits capture consequence, then commits N reward; later Potion/Revive boundaries may observe that committed reward only after this Encounter boundary is closed.

For a simultaneous-KO Battle whose sealed outcome is `draw`, there is no capture/reward source for that Encounter. If post-Battle Revive succeeds, **D-F16 B** requires one atomic authoritative commit of: exactly-one Revive Inventory debit; revived HP; cadence-effect/action-lock cleanup; one-GCD action-opportunity carry; a durable versioned post-Battle Revive provenance record; the Encounter `resolved_non_win` disposition; and consumption of the matching `PendingEncounterSelection`. Only after that commit may the next Encounter be selected. A failed/ineligible post-Battle Revive debits nothing and proceeds to ordinary living-team/`no_living` evaluation.

Post-Battle/cadence Revive provenance is separate from `CombatStimulus` and the sealed Battle transcript. The forward Hunt authority persists one versioned `PostBattleReviveApplied` fact containing at minimum: `huntRunIdentity`, `encounterOrdinal`, `encounterId`, `battleId`, target Pokémon/cadence participant identity, Hunt logical time, pinned Revive policy version, selected `itemId` plus immutable item/rule authority identity, normalized revive fraction, exactly-once Inventory debit/correlation identity, applied HP/resulting HP, resulting action-opportunity readiness, the exact `pendingSelectionIdentity`, and the exact consumed `PendingEncounterSelection` immutable replay snapshot/commitment required to reproduce selection-stream continuity, including its before/after selection RNG provenance and pinned content/rules/individualization authority. The forward checkpoint/replay shape must preserve an equivalent of the current `consumedPendingEncounterSelection` provenance for this non-win consumption; deleting the live pending row/token is never sufficient replay evidence. Physical table decomposition remains implementation-owned. This fact, Inventory debit, cadence/checkpoint mutation, D-F16 disposition and pending-selection consumption commit atomically under the Player Hunt root/OCC boundary. Retry, reconnect and offline replay must reuse the persisted provenance and may never re-evaluate policy, reconstruct the consumed selection from mutable content, or reselect an item from post-debit Inventory.

**Vitality/terminal**

Retreat/`no_living` atomically write final pinned Team HP to SPEC-021 vitality, terminalize the Hunt, clear the active-Hunt root and set `recoveryReadyAt = database terminal time + 30s`. New forward `Wilds` rows pin 30 seconds; the legacy per-Hunt recovery-duration column may remain for historical replay.

When Retreat wins the exact same-boundary KO-intervention tie defined by SPEC-013, the same terminal transaction also persists the versioned `abandoned_by_retreat` replay disposition and its exact Battle/Combatant/logical-time identity in Hunt terminal/checkpoint authority. This disposition is non-Combat provenance and does not create a `CombatEvent` or `koInterventionDecision`.

**Offline cap**

Automatic return/reconnect reconciliation advances at most **8 hours** of productive Hunt time for one uninterrupted inactivity gap. Proposed technical cap semantics:

- `cappedElapsed = min(serverNow - lastCommittedWallClockAnchor, 8h)`;
- the deterministic target uses only that capped elapsed interval;
- the first reconciliation attempt freezes both the capped target and the return database-time anchor; bounded `202` continuations retain those exact values;
- only after the complete capped return reconciliation commits does the wall-clock anchor rebase to that frozen return database time, so excess absence beyond 8h cannot be claimed by repeating reconciliation in chunks and a failed/partial continuation cannot discard time prematurely;
- online/internal reconciliation may advance the anchor normally before the 8h limit;
- Potion/Revive/Capture policies, Inventory ordering and RNG/replay remain identical online/offline.

**Offline/return summary**

The bounded return result aggregates, for the reconciled interval only:

- Battles/Encounters;
- capture attempts/successes/failures/no-eligible closures;
- Player/Pokémon XP;
- item rewards;
- Ball/Potion/Revive quantities consumed;
- KOs and successful Revives;
- terminal reason if terminalized.

The summary is reporting over already-applied effects and never gates entitlement.

**Resolved Hunt activity source**

Add a separate immutable bounded Hunt-activity projection for non-Combat facts. One resolved-Encounter activity record contains:

```text
encounterOrdinal / encounterId / resolvedAtHuntTimeMs
battleResolved
encounterDisposition   // victory | resolved_non_win
captureDisposition
playerXp / pokemonXp[]
itemDrops[]
consumedItems[]   // Ball/Potion/Revive quantities by ItemId
koSummary[]
reviveSummary[]
```

- `resolved_non_win` is the D-F16 B disposition for simultaneous-KO `draw` followed by successful post-Battle Revive. It has no capture opportunity and `playerXp/pokemonXp/itemDrops` are empty/zero; its `consumedItems`/`reviveSummary` include the authoritative post-Battle Revive already committed for that boundary;
- records commit atomically with the authoritative Encounter/effect boundary they summarize;
- an Encounter activity window begins with that Encounter's Battle and closes only when its capture/reward consequences plus all automatic Potion/Revive/cadence effects that must resolve before the next Battle initialization are settled, or when the Hunt terminalizes. The sealed record therefore never needs an in-place patch to add a later inter-Battle debit;
- retries require identity/byte equality and never duplicate a record;
- GET uses indexed seek/cursor pagination with a hard finite page bound of **64 records maximum** and never scans/replays an unbounded Hunt to answer;
- a terminal summary may report final unresolved-Encounter KO/Revive effects separately without manufacturing an Encounter completion;
- this source is distinct from SPEC-017 CombatEvents.

**Fail-closed degraded mode**

If required rules/content/policy/Inventory/vitality/replay authority is unavailable, productive advancement/resource mutation does not run and returns the accepted unavailable/retry response. Safe management/read projections may remain available when their own authority is independently valid.

#### 8.2.6 SPEC-016 — first Pre-alpha IA/UX

The first Pre-alpha shell exposes:

```text
Hunt / Pokémon / Teams / Inventory / Settings / HUB
```

HUB is a functional non-locomotion surface in this slice. It exposes PokéCenter and navigation/access.
Any later local/private HUB locomotion is separate presentation scope; player-to-player realtime is
action-scoped under ADR-007 and does not depend on HUB locomotion.

Hunt UX:

- Cards presentation only; Visual/Pixi is not required for first acceptance.
- Pre-Start shows selected Team, possible Species and rewards.
- Inventory/resource detail and Capture/Potion/Revive policy editors remain in their management/settings surfaces.
- Start validation failure identifies Team/loadout/readiness problems; the UI never silently removes a Pokémon/Move to make Start pass.
- Active Hunt shows current Card plus the compact authoritative resolved-Encounter feed.
- Capture/Potion/Revive policies may be edited during Hunt and display forward-only semantics.
- No manual Potion, manual capture/Ball prompt, Checkpoint or Claim control exists.
- Retreat remains explicit.
- PokéCenter is disabled/unavailable while a Hunt is active; after Retreat/terminal, HUB PokéCenter may heal during recovery.
- `Wilds` terminal presentation is HUB + result summary + 30-second recovery for Retreat/`no_living`.
- authority/service failure shows unavailable/error + retry without presenting speculative progress.
- captured Pokémon appear in Collection immediately and may be used in saved Teams; editing a saved Team does not mutate the running Hunt snapshot.
- evolution is deferred beyond this first slice.

#### 8.2.7 SPEC-017 — combat-feed compatibility

SPEC-017 remains combat-only.

- The accepted `pokenexus.combat-presentation.v1` union/projector remains byte- and schema-exact for every v1 historical feed; `CombatantRevived` is **not** inserted into v1 in place.
- Forward Hunts whose pinned source CombatEvent schema can emit `CombatantRevived` use additive public schema **`pokenexus.combat-presentation.v2`**. V2 retains the existing v1 event shapes/privacy rules and adds one projected `CombatantRevived` event containing `combatantId` plus the same privacy-filtered `hpChange` representation used for HP consequences; it never exposes a new wild numeric-HP field.
- `CombatantRevived` exists only for an **in-Battle** Revive while that Battle is still active. Its deterministic cleanup is projected through the ordinary `EffectRemoved` and `StatStageChanged` events already present in the combat stream. A Revive evaluated only after `BattleEnded` is Hunt activity, not a CombatEvent, and therefore cannot append to or rewrite the sealed Battle transcript/outcome.
- The v2 bootstrap/continuation envelopes and the SPEC-017 HTTP response report `presentationSchemaVersion = pokenexus.combat-presentation.v2` for that stream. A stream never changes presentation schema version after publication begins.
- Potion HP change during an active Battle remains `HealingApplied`; the fact that a Potion ItemId was consumed is **not** a CombatEvent.
- capture disposition, Encounter rewards, Ball/Potion/Revive Inventory consumption and policy transitions are never inserted into the combat stream; the Card composes those facts from SPEC-015 Hunt activity.
- SPEC-017's Battle N+1 publication/bootstrap gate is amended for D-F16 B: when Encounter N closes as committed `resolved_non_win`, the gate is satisfied by that durable disposition **plus** committed `PostBattleReviveApplied` provenance and all automatic Potion/Revive/cadence effects due before Battle N+1 initialization being settled. No capture disposition row, reward source or reward application is required for this non-win path because D-F16 B explicitly creates none. The next Battle origin/events remain blocked until that complete non-win boundary commits under the same Player/Hunt serialization authority; presentation code may not infer closure from `BattleEnded(draw)` alone.
- cursors/snapshots pin both the exact presentation schema version and source `combatEventSchemaVersion`; a v1 cursor cannot be reinterpreted/resumed as v2, and historical v1 feeds keep prior schema/event bytes unchanged.
- existing privacy rule remains: owned vitality may be shown under the accepted owned-HP disclosure; no new wild numeric vitality disclosure is authorized.

#### 8.2.8 SPEC-019 — draft rebase

SPEC-019 remains a DRAFT workload/frontier proposal. Before any of its own amendments are accepted:

- replace assumptions that depend on player-submitted healing with the standing auto-Potion/Revive policy model;
- treat Checkpoint/Claim as automatic/internal reconciliation transport rather than gameplay controls;
- use SPEC-021 durable vitality/PokéCenter as the forward health authority;
- preserve its already-selected bounded-work/ordering/security design only where compatible with the new forward lifecycle;
- keep all historical command/checkpoint versions replayable without reinterpretation.

### 8.3 Accepted technical serialization decisions

These are binding forward technical contract choices under the accepted Class-A package. They do not authorize implementation by themselves:

1. **Action-opportunity cost:** successful Potion advances only the healed Player-active Pokémon's GCD readiness; successful Revive advances only the revived Player-active Pokémon's GCD readiness by one full `globalActionCooldownMs` from the later of current readiness/current logical time; no Move cooldown/cursor consumption.
2. **Revive lifecycle/replay hook:** new rules versions pin `koInterventionSideId` in immutable Battle input/state and persist exact `koInterventionPending {sideId, combatantId}` only while at least one side other than the intervention side still has a living Combatant. Exhaustion of every non-intervention side seals `BattleEnded` first; any subsequent Revive is Hunt/cadence authority and cannot alter Battle outcome. In-Battle `decline` resumes lifecycle; in-Battle `revive` restores HP, clears transient effects/status/stages/action locks, emits byte-fixed reset events, then resumes lifecycle. No process-local mode flag may alter replay behavior.
3. **Post-Battle Revive provenance:** every successful post-`BattleEnded` Revive persists one versioned `PostBattleReviveApplied` Hunt-authority fact and atomically binds it to Inventory debit, cadence/checkpoint mutation, D-F16 `resolved_non_win` disposition and pending-selection consumption. That provenance retains the exact consumed `PendingEncounterSelection`/identity and selection-RNG/content/rules/individualization snapshot needed for the same continuity proof as current `consumedPendingEncounterSelection`; retry/reconnect/offline replay reuses that exact fact and never reselects policy/item or reconstructs the consumed selection from mutated state.
4. **Persistent vitality:** separate OCC vitality aggregate; `maxHp` derived, not duplicated; max-HP decrease clamps, increase never heals.
5. **PokéCenter selector:** explicit owned `teamId` in the HUB command; no new global active-Team state.
6. **Lock order:** Player Hunt root → Team/config → vitality → policy/Inventory/checkpoint sub-authorities.
7. **Retreat tie-break:** unresolved intervention strictly before the frozen Retreat boundary must resolve before the boundary is reached. A new `koInterventionPending` created exactly at that boundary remains byte/state-exact in the sealed non-resumable Battle snapshot while Hunt terminal authority separately records `abandoned_by_retreat`; no `revive`/`decline`, replacement, synthetic `BattleEnded` or item spend occurs, and terminal reason remains `retreat`.
8. **Offline 8h:** freeze capped target + return database-time anchor on first reconciliation acceptance; after the complete capped reconciliation commits, rebase to that frozen return time and discard excess absence beyond 8h.
9. **Card feed split/version:** SPEC-017 remains CombatEvent-only. Historical `pokenexus.combat-presentation.v1` is immutable; forward Hunts that can emit in-Battle `CombatantRevived` use additive `pokenexus.combat-presentation.v2`, with presentation+source schema pins in stream/cursors. Post-Battle Revive and all capture/reward/Inventory facts remain SPEC-015 Hunt activity; ended Battle bytes/outcome are never rewritten.

## 9. Impact on implementation/tasks

| Task/surface | Current disposition |
|---|---|
| TASK-035 Solo Hunt engine | Deterministic auto-execution remains aligned, but fresh cadence currently hard-codes max HP and has no accepted Revive cleanup/post-Battle hook. Forward engine work must accept authoritative starting HP, add SPEC-003 external-action/KO-intervention semantics only while opponent remains alive, seal Battle outcome before post-Battle Revive when opponent is exhausted, perform deterministic Revive transient-state cleanup, preserve transient fresh-cadence reset, apply Potion/Revive action-opportunity GCD cost and keep old rules versions exact. |
| TASK-037 offline/checkpoint engine | Preserve deterministic authority but enforce the real **8h offline cap**, use the same Capture/Potion/Revive policy intervals/Inventory ordering as online, rebase excess-offline wall-clock after capped return, and emit bounded aggregate return summary. Reconciliation is automatic/internal product behavior rather than a player Checkpoint/Claim control. |
| TASK-038 Hunt API/persistence | Preserve current source/evidence. Forward orchestration must add SPEC-021 vitality Start/terminal/PokéCenter serialization, Potion/Revive policy versions/intervals, strict all-member Start enforcement, fail-closed degraded mode and bounded Hunt-activity reporting. Checkpoint/claim transport may remain useful automatically/internal; Retreat remains player-triggered. |
| TASK-039 Card integration | **Execution hold.** Remove/replace explicit heal, manual capture, Checkpoint and Claim UI from the desired future slice. Preserve Retreat and automation-policy management, then rebase on the accepted amended contracts. |
| TASK-040 Visual/Pixi | **Deferred beyond the first Pre-alpha slice.** When resumed, it must consume the same aligned automatic-Hunt truth as Cards; no manual PvE locomotion. |
| TASK-041 E2E/MVP harness | First Pre-alpha harness must target the Human-approved **Cards-only** flow, including offline 8h/reconnect and active-Hunt policy edits; Visual/Pixi parity becomes a later extension after TASK-040. |
| TASK-103 Hunt combat presentation backend | Preserve as the combat-only SPEC-017 source. If the coordinated amendment is accepted, it must preserve historical `pokenexus.combat-presentation.v1` exactly and implement/prove additive `pokenexus.combat-presentation.v2` projection for forward **in-Battle** `CombatantRevived` plus deterministic cleanup events. Post-Battle Revive must remain Hunt activity and must not mutate a sealed Battle transcript. It must **not** absorb capture/reward/Inventory-consumption activity. Card feed composition needs the separate bounded SPEC-015 activity authority. |
| TASK-042–048 HUB | ADR-007 replaces the planned ambient shared realtime HUB with action-scoped player connections. The first Pre-alpha still needs only a **functional non-locomotion HUB surface** with PokéCenter + navigation/access and does not depend on realtime. Later local/private HUB locomotion remains separate presentation scope; TASK-043–048 must implement only explicit feature/session connection behavior accepted by their owning contracts. |
| Future Duo/PvP/Gym/World Boss | Must start from management-first interaction classification, not inherit action/adventure controls by convention. |

## 10. Deferred Human decisions beyond first-slice acceptance

No first-Pre-alpha player-visible product choice remains open in this reconciliation package. **D-F16 B is fixed**: simultaneous-KO `draw` + successful post-Battle Revive consumes the Encounter as `resolved_non_win`, grants no capture/XP/item reward, consumes the matching pending selection and advances the open-ended Hunt.

The following later-scope decisions are intentionally deferred and do **not** block first-slice acceptance:

1. Sustainable consumable acquisition/economy beyond the fixed bootstrap/first-`Wilds` stock.
2. Later reconfirmation of the provisional `Wilds` XP curve, plus any later unlock progression.

Additional Human decisions now fixed:

- Hunt duration/completion is **content-dependent**: some Hunts may be open-ended while others are finite/objective-based;
- initial finite-content concept: **Safari with a specific duration**; exact Safari objective/reward/capture rules are deferred;
- normal finite Hunt completion returns the player **automatically to HUB**;
- initial offline Hunt progression cap is **8 hours**;
- offline return summary includes Battles/Encounters, capture successes/failures, XP/rewards, items obtained, Balls/Potions/Revives spent, KOs/Revives and terminal reason;
- a stamina-like mechanic for offline progression is only an **exploratory future idea**, not an accepted product rule yet;
- first Pre-alpha surfaces are **Hunt / Pokémon / Teams / Inventory / Settings + HUB**;
- first Pre-alpha HUB is functional but **non-locomotion**: PokéCenter + navigation/access only; any later local/private HUB locomotion is deferred and does not imply shared player presence/networked movement;
- first Pre-alpha Hunt presentation is **Cards only**; Visual/Pixi is deferred;
- offline progression is included from the first Pre-alpha with the approved **8h cap + detailed summary**;
- Capture/Potion/Revive policies are editable during active Hunt and remain forward-only;
- captured Pokémon enter Collection immediately and may join Teams; **evolution is deferred to a later Pre-alpha step**;
- first Pre-alpha Hunt admission is strict: valid 1–6 member Team, at least one conscious member, and every selected Pokémon has a valid 1–4 executable Move loadout with at least one progress/damage-capable Move; unsupported selected Moves block Start;
- pre-Start Hunt view shows **selected Team + possible Species + rewards**; policies/resources remain in separate management surfaces;
- active Cards UI includes a compact resolved-Encounter feed for battle completion, capture result, XP, drops, Ball/Potion/Revive consumption, KO and Revive;
- PokéCenter is unavailable while a Solo Hunt is active; the Player must Retreat or reach terminal before healing in HUB;
- `Wilds` has no normal completion: Retreat and `no_living` both return to HUB with summary + 30s recovery;
- required authority/content/service failure fails closed for progression/resource mutation while safe management/read surfaces may remain available with error + retry;
- first Pre-alpha has no Hunt automation families beyond **Capture / Potion / Revive**.

## 11. Acceptance evidence and implementation gate

The Class-A acceptance gate is satisfied:

- required GSC consultation evaluated management-first Idle coherence;
- PM mapped every confirmed conflict to the affected accepted contract;
- independent semantic and architecture/replay QA finished READY with P0/P1/P2 = 0/0/0;
- first-Pre-alpha decisions, including D-F16 B, are closed without hidden re-opening;
- the Human Owner explicitly accepted the reconciled Class-A package on 2026-10-02.

This approval authorizes the contract as forward Class-A authority. Gameplay/runtime implementation, migration, public enablement and repository-history operations still require their own applicable READY/ACTIVE tasks and gates.

## 12. GSC consultation evidence — 2026-10-01

The findings immediately below are the **initial pre-resolution advisory snapshot**. Sections 7 and 12.1 contain the later Human decisions that resolve or supersede several of these items.

Fresh read-only Gameplay Systems Consultant review under the management-first baseline reported:

- **P0:** manual Potion contract/UI is a direct conflict and must be amended before gameplay resumes;
- **P1:** manual capture/Ball choice requires explicit Human reconfirmation;
- **P1:** player-facing checkpoint/claim requires explicit Human reconfirmation because current `claim` is reporting/reconciliation, not reward entitlement;
- **P1:** future Duo/PvP/World Boss action ownership must default to no assumed action-game execution and be explicitly selected by the Human Owner;
- **P2:** PvE navigation wording is ambiguous but no actual free-movement PvE mechanic was found;
- **P2:** reward semantics are already aligned; only result/summary wording needs care.

The consultant found no reason to reopen deterministic reward integrity or automated Hunt execution merely for the management-first correction.

### 12.1 Delta after Human active-Hunt decisions

The follow-up GSC audit found:

- **P0:** manual pending capture/per-Encounter Ball input is now a direct future-product conflict;
- **P0:** visible Checkpoint/Claim controls are now direct UI conflicts, while internal reconciliation may remain;
- **P1 (resolved later):** with no manual capture fallback, disabled/no-policy capture semantics required explicit Human selection; section 7.1 now records the selected `OFF = no attempt/no debit/opportunity closes/Hunt continues` rule;
- **P1:** existing capture-policy dimensions must be explicitly retained or changed because they now own the full capture experience;
- **P1:** SPEC-015's forward-only active-Hunt policy replacement is structurally aligned; Human must decide whether that rule is common to all mutable automation policies;
- **P1:** Retreat existence is confirmed and its current safe-boundary model is structurally compatible, but exact consequences still need product reconfirmation;
- **P2:** legacy manual-capture/heal results and command replay may require compatibility handling without remaining future gameplay mechanics.
