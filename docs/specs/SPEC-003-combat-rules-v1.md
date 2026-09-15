# SPEC-003 — Combat Rules v1

- Status: APPROVED
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Architecture: ADR-004
- Static-data/version envelope: SPEC-002

## 1. Purpose

This specification defines the first executable PokeNexus combat semantics. It is intentionally
smaller than the complete Pokémon franchise mechanic surface: the goal is a deterministic,
versioned, mode-agnostic rules baseline that TASK-009 can implement without guessing.

Source Pokémon data is factual input only. PokeNexus executable behavior is defined by this spec
and by immutable rule artifacts published under the accepted `rulesVersion` envelope.

## 2. Normative numeric domains

### 2.1 Level

Combat receives `level` as an integer in the inclusive range `1..200` in the Combatant Snapshot.

`200` is the global Pokémon hard Level Cap for the accepted PokeNexus product direction. Adding a
new region or generation does not automatically raise this cap. Progression beyond Level 200 belongs
to separate endgame/progression systems owned by TASK-021 or later accepted rules. Any future change
to the Level Cap requires an explicit Human Owner product/rules decision; it is never inferred from
generation count, region progression or content expansion.

### 2.2 Individual Values

Every canonical IV is an integer in the inclusive range `0..31`.

No EV, Nature, breeding modifier or hidden stat input exists in combat rules v1.

### 2.3 Derived stats

For base stat `B`, IV `I` and level `L`:

```text
maxHp = floor(((2 * B + I) * L) / 100) + L + 10

otherStat = floor(((2 * B + I) * L) / 100) + 5
```

`otherStat` is used independently for `atk`, `def`, `spa`, `spd` and `spe`.

The formulas use mathematical integer arithmetic and the indicated floor. Intermediate values
must not depend on binary floating-point rounding.

Battle initialization validates that all resolved derived stats are positive integers.

### 2.4 Starting HP

The mode/orchestrator supplies the Battle's starting HP as an explicit immutable Battle input.
It must satisfy `0 <= startingHp <= maxHp`. A living Combatant has `startingHp >= 1`; a
Combatant supplied with `startingHp = 0` begins KO and cannot occupy an active slot.

Combat does not assume every Battle starts at full HP because later Hunt/orchestration rules may
carry HP between Battles. A fresh-battle mode may simply supply `maxHp`.

## 3. Move loadout v1

A battle-eligible Combatant has an ordered Move Loadout containing `1..4` distinct `MoveId`
references.

- duplicate `MoveId` values in one loadout are invalid;
- for a player-owned Pokémon, the player defines the order of the populated Move slots; the
  persistence/editing contract for that ordered selection belongs to TASK-019+ rather than the
  Combat Engine;
- for a non-player Combatant, accepted content/orchestration supplies the ordered loadout under the
  same battle contract;
- loadout order is stable pinned Battle input and drives the external sequential automatic-action
  policy defined in section 5.2, but does not itself grant Speed initiative or Move priority;
- every selected move must resolve under the pinned game-data/rules pair;
- a move that does not resolve to executable v1 semantics makes the snapshot invalid rather than
  silently becoming a generic/no-op move;
- source `pp` is not consumed by PokeNexus battle rules v1; for allowlisted simple-damage Moves it
  is a factual balance input from the pinned `gameDataVersion`, used together with source `power`
  by the pinned `rulesVersion` cooldown curve.

There is no `Struggle`/automatic fallback action in v1. A Combatant with no executable move is not
battle-eligible.

## 4. Executable MoveRule boundary

Every usable move resolves to an immutable `MoveRule` under the pinned `rulesVersion`.

The exact TypeScript representation belongs to TASK-009, but the observable semantics include:

- executable category: `physical | special | status`;
- target scope;
- published per-Move cooldown in integer milliseconds, always `>= globalActionCooldownMs` for
  `useMove` actions;
- power rule;
- accuracy rule;
- critical-hit policy;
- ordered effect instructions, if any;
- deterministic tags needed by accepted rules such as contact.

### 4.1 Generic simple-damage compilation

The baseline simple-damage compiler is **allowlist-gated**. A Move is eligible only when its
`MoveId` appears in an immutable `simpleDamageMoveAllowlist` published as rules content for the
pinned `rulesVersion`.

Allowlisting is an explicit semantic/content decision that asserts the Move does not require a
special mechanic omitted by the factual source schema. It must not be inferred automatically from
name, prose or the mere presence of numeric `power`/`accuracy` fields.

For an allowlisted source Move with:

- `sourceCategory = physical | special`;
- integer `power > 0`;
- integer `pp > 0`;
- understood target mapping;

v1 defines the baseline simple-damage compilation from the factual source values as:

- executable category equals `sourceCategory`;
- type equals the source `typeId`;
- power equals source `power`;
- numeric accuracy equals source `accuracy`;
- `accuracy = null` means no accuracy roll / the accuracy gate automatically passes;
- cooldown is deterministically resolved from exact source `power` + source `pp` plus the pinned
  rules curve in section 4.1.1; battle execution never recomputes that curve;
- critical-hit policy is `normal`;
- contact tag mirrors source `makesContact`;
- no additional effect is inferred from name or prose.

The source target classification must pass an explicit closed mapping into one of the accepted
target scopes. That mapping is versioned rule content. An unknown/ambiguous source target
classification is unsupported, not guessed, and TASK-009 may not invent a mapping from prose.

### 4.1.1 Simple-damage Move cooldown derivation

PokeNexus does **not** consume PP during combat. Instead, the factual source PP acts as a secondary
frequency/rarity signal when publishing cooldowns for allowlisted simple-damage Moves.

The v1 publication curve is exact and uses integer/rational arithmetic only. It deliberately uses
continuous formulas rather than coarse Power/PP bands so adjacent factual values cannot create a
large discontinuous balance jump.

First compute the Power component:

```text
powerBaseCooldownMs = clamp(2000, 10000, 500 + 50 * power)
```

Then compute the exact PP multiplier from positive integer source `pp`:

```text
pp >= 30:
  ppMultiplier = 4/5

20 <= pp < 30:
  ppMultiplier = 1 - (pp - 20) / 50

10 <= pp < 20:
  ppMultiplier = 1 + 7 * (20 - pp) / 200

5 <= pp < 10:
  ppMultiplier = 27/20 + 7 * (10 - pp) / 100

1 <= pp < 5:
  ppMultiplier = 17/10
```

The anchors are therefore PP `30 -> 4/5`, `20 -> 1`, `10 -> 27/20` and `5 -> 17/10`, with exact
linear interpolation between them and clamping outside the anchor range.

For an allowlisted simple-damage Move:

```text
rawCooldownMs = powerBaseCooldownMs * ppMultiplier
moveCooldownMs = max(2000, ceil(rawCooldownMs / 100) * 100)
```

The **curve/formula** is immutable `rulesVersion` semantics; source `power`/`pp` are immutable facts
from the pinned `gameDataVersion`. For each accepted compatible `{ gameDataVersion, rulesVersion }`
pair, rule-context resolution deterministically materializes the resulting integer
`moveCooldownMs` before Battle execution. The engine then only compares logical timestamps; it does
not consult source PP or rerun the derivation while resolving battle/offline advancement.

Examples of the curve itself:

- power `60`, PP `20` -> `3500 ms`;
- power `120`, PP `10` -> raw `8775 ms`, quantized upward to `8800 ms`.

This automatic derivation applies only to allowlisted **simple-damage** Moves. Status Moves and
complex authored Moves publish an explicit `moveCooldownMs >= 2000` in their immutable MoveRule. Their
authors may use source power/PP as balance references where meaningful, but any mechanical
adjustment (charge/recoil/drain/heal/control strength/etc.) must be explicit versioned rule content,
not runtime inference from prose.

The same authored-rule path is also the explicit balance override for an otherwise mechanically
simple Move whose automatic Power+PP result is judged unsuitable. In that case the Move is removed
from the generic simple-damage allowlist and receives an immutable authored MoveRule with an exact
`moveCooldownMs >= 2000`. This is a versioned content decision, not an engine special case.

### 4.2 Moves requiring authored rules

The following require an explicit authored immutable MoveRule and are not executable merely from
source fields:

- `status` moves;
- null/variable/special power behavior;
- fixed-damage or HP-relative damage;
- multi-hit behavior;
- recoil/drain/healing;
- persistent status/effect behavior;
- unusual target selection;
- guaranteed/suppressed/modified critical behavior;
- any move whose gameplay meaning depends on description prose.

A physical/special numeric-power Move that is not in the immutable simple-damage allowlist is also
unsupported until explicitly authored/allowlisted. This prevents multi-hit/recoil/drain/charge or
other complex Moves from being silently approximated when SPEC-002 does not carry enough
structured factual flags to prove simplicity.

An authored MoveRule still may use only mechanics explicitly accepted by SPEC-003. Authorship does
not authorize TASK-009 to invent a new variable-power formula, multi-hit loop, recoil model,
fixed-damage formula, target scope or other primitive. If the intended Move cannot be represented
by the accepted v1 primitives/scopes, it remains unavailable until a later accepted rules
extension adds that mechanic.

TASK-009 may implement fixture rules needed to prove the generic effect machinery, but it must not
invent broad production move semantics that are absent from an accepted rule artifact/content
decision.

## 5. Logical time and readiness

Combat logical time is a non-negative integer number of milliseconds from Battle start.

There is no turn counter, wall-clock timer or persistent tick in rules v1.

Every living Combatant has deterministic actor-level and per-Move readiness state:

- `nextActionAtMs`: the earliest logical time the Combatant may perform another `useMove` action;
- `moveReadyAtMs[MoveId]`: the earliest logical time that specific Move may be reused.

Rules v1 fixes `globalActionCooldownMs = 2000`.

- readiness is **not intrinsically Battle-local**. A Battle receives explicit non-negative
  readiness carry-in for each Combatant. For a genuinely fresh combat-cadence session the carry-in
  values are zero; a later Battle inside the same accepted cadence-continuity scope must preserve
  the remaining actor GCD and per-Move cooldowns instead of resetting them;
- because Battle logical time itself still starts at `0`, the carry-in representation is expressed
  as remaining delays from the new Battle start. Initialize
  `nextActionAtMs = initialNextActionRemainingMs` and, for each executable loadout Move,
  `moveReadyAtMs[MoveId] = initialMoveCooldownRemainingMs[MoveId]`;
- `initialNextActionRemainingMs` must be a non-negative integer number of milliseconds;
- `initialMoveCooldownRemainingMs` must contain exactly one entry for every executable `MoveId` in
  that Combatant's pinned loadout, no missing/extra/unknown keys, and every value must be a
  non-negative integer number of milliseconds;
- a `useMove` ActionIntent has no independent future/past execution timestamp: it resolves exactly
  at the Battle State's current `combatTimeMs` and is legal only when both
  `combatTimeMs >= nextActionAtMs` and `combatTimeMs >= moveReadyAtMs[moveId]`;
- after a Move resolves as an accepted action, set
  `nextActionAtMs = actionTimeMs + globalActionCooldownMs` and
  `moveReadyAtMs[usedMoveId] = actionTimeMs + move.moveCooldownMs`;
- readiness of every other Move remains unchanged;
- rejected ActionIntents do not change readiness or logical time;
- Move resolution is instantaneous at its logical action time in v1; no cast/animation duration
  participates in authoritative combat semantics.

### 5.0.1 Cross-Battle cadence continuity

Battle boundaries do not reset cooldowns inside one continuous combat-cadence session.

At a Battle end/checkpoint time `t`, deterministic carry-out for one Combatant is:

```text
nextActionRemainingMs = max(0, nextActionAtMs - t)
moveCooldownRemainingMs[MoveId] = max(0, moveReadyAtMs[MoveId] - t)
```

If the owning orchestrator defines a deterministic non-negative integer inter-Battle elapsed
duration `gapMs`, the carry-in for the next Battle in the same cadence-continuity scope is:

```text
initialNextActionRemainingMs = max(0, previousNextActionRemainingMs - gapMs)
initialMoveCooldownRemainingMs[MoveId]
  = max(0, previousMoveCooldownRemainingMs[MoveId] - gapMs)
```

If there is no modeled inter-Battle gap, `gapMs = 0`.

The Combat Engine does not infer that two Combatants from different Battles represent the same
persistent Pokémon. The external orchestration/session layer maps the continuing participant and
supplies the explicit carry-in. The engine only validates and consumes those deterministic input
values. No wall-clock timestamp may substitute for this contract.

Any malformed readiness carry-in fails Battle initialization atomically before `BattleStarted`,
combat RNG consumption, event sequencing or mutable Battle State exists. There is no defaulting of
missing Move keys to zero and no silent discard of extra/unknown Move keys.

Starting a genuinely new cadence-continuity scope resets actor GCD and Move cooldown remaining
values to zero. The owning mode spec defines the scope boundary. For Solo Hunt, TASK-033 must define
one Hunt as one continuous cadence scope from Hunt start until Hunt end; TASK-035 then carries this
state across its encounter Battles. Starting a new enemy Battle inside that same Hunt is **not** a
cooldown reset boundary.

Logical time changes only through an explicit `advanceTime(toMs)` CombatStimulus. `toMs` must be
strictly greater than the current `combatTimeMs`; past/equal-time advancement is rejected
atomically. The engine resolves every due effect boundary in chronological order up to `toMs`.

If a due boundary makes the Battle terminal, advancement stops at that boundary. If a due boundary
leaves the Battle non-terminal but creates mandatory `replacementPending`, advancement also stops
at that exact logical time before crossing it. Terminal outcome takes precedence over replacement;
the engine never requires a replacement after the Battle has ended. After replacement is resolved,
the caller may issue another `advanceTime` toward the original target. Readiness becoming due by
itself does not stop time advancement because action selection remains an external policy decision.

### 5.1 Speed semantics v1

`spe` does **not** change Move cooldown, damage, accuracy or logical time progression in v1.

Speed is used only for deterministic initiative ordering when two or more active living
Combatants are simultaneously action-eligible at the same logical time. A Combatant is
action-eligible only when its global action cooldown has elapsed, it is not action-locked, and it
has at least one executable Move whose own cooldown has elapsed and that has at least one legal
target in the current Battle State.

1. higher effective `spe` acts first;
2. remaining ties are broken by ascending lexicographic comparison of the UTF-8 bytes of the exact
   canonical `CombatantId` string.

This ordering is rule semantics, not packet arrival order.

At a given logical timestamp, only the first Combatant in this canonical eligibility order may
resolve a `useMove` intent. After that action resolves and its readiness changes, eligibility is
recomputed at the same timestamp before another same-time action can resolve. Therefore a slower
ready Combatant cannot act first merely because its network/policy intent was presented first.

Move priority is not used by rules v1, so TASK-008 does not request priority ingestion from
SPEC-002.

### 5.2 Ordered Move-sequence policy contract

The Combat Engine still never chooses a Move. ADR-004's `ActionIntent` boundary remains unchanged.
The baseline v1 automatic policy for a player/content-defined ordered Move Loadout follows the
sequence semantics below so TASK-009, Hunt orchestration or another mode cannot invent incompatible
rotation behavior. A later mode spec may explicitly choose a different ActionIntent-production
model where that mode requires one.

The external automatic policy maintains one deterministic `nextMoveSlot` cursor per continuing
Combatant over that Combatant's populated ordered slots:

- populated slots are contiguous and numbered `1..N`, where `N` is `1..4`;
- at the start of a genuinely fresh cadence-continuity scope, `nextMoveSlot = 1`;
- when a later Battle starts inside the same cadence-continuity scope, the external policy carries
  the previous `nextMoveSlot` forward rather than resetting because of the Battle boundary;
- carried `nextMoveSlot` must be an integer within `1..N` for the frozen populated loadout; malformed
  policy continuation state fails closed in the owning policy/orchestration layer rather than being
  wrapped/clamped implicitly;
- when the Combatant is otherwise able to act, the external automatic policy examines populated
  slots cyclically starting at `nextMoveSlot` and selects the first Move that is individually ready
  and for which the policy can construct a currently legal `useMove` ActionIntent, including a
  legal target where the Move requires one;
- if the selected ActionIntent is accepted and the Move executes, advance `nextMoveSlot` to the slot
  immediately after the executed slot, wrapping `N -> 1`;
- an atomically rejected ActionIntent does not advance `nextMoveSlot`;
- a skipped cooling-down or currently unusable slot does not mutate the cursor by itself; cursor
  advancement is anchored only to an accepted Move execution;
- if no populated slot can currently produce a legal ready Move action, the policy emits no
  `useMove` intent. Logical time/orchestration advances to a later deterministic opportunity rather
  than submitting a knowingly invalid Move or inventing a fallback action;
- automatic policy reconsideration is event-driven at deterministic combat/policy boundaries; it
  does not poll/tick per millisecond while waiting for GCD, Move readiness, action-lock expiry or a
  Battle-State change that can alter legality;
- `nextMoveSlot` is deterministic cadence-session policy state, not persistent Pokémon
  progression/state. It resets only when the accepted cadence-continuity scope resets;
- reserve/active transitions inside the same Battle do not reset that Combatant's cursor. Forced
  replacement therefore preserves the already initialized battle-local sequence state.

This is **ordered cyclic selection with deterministic skip**, not strict blocking on one slot. A
Move with a long cooldown or no currently legal target therefore cannot freeze other configured
Moves. It is also not "choose any ready Move": the player/content-defined slot order is the canonical
search order and therefore can change battle outcomes.

The ordered loadout/configuration must be part of the pinned Battle/session input. If an orchestrator
regenerates rather than stores the exact ActionIntent stream for replay/offline continuation, it
must also retain the deterministic policy identity/state required by ADR-004, including this cursor
and any cross-Battle cadence carry state needed to reconstruct later Battle initialization.

For one continuing Combatant inside a cadence-continuity scope, the ordered Move Loadout used by
that scope is immutable. A persistent player-side loadout edit made after the scope starts does not
rewrite the already pinned session sequence or cooldown mapping; it takes effect only in a later
fresh scope unless an owning future mode spec defines another explicitly versioned mutation rule.

TASK ownership is intentionally split:

- TASK-008 owns the universal `1..4` slot ordering and sequential-policy semantics above;
- TASK-009 validates/resolves supplied ActionIntents and deterministic Battle readiness carry-in; it
  does not implement hidden Move selection or infer cross-Battle actor identity;
- TASK-019+ own persistent player Pokémon Move selection/order and mutation/storage contracts;
- TASK-033 owns the Solo Hunt cadence-continuity boundary and deterministic inter-Battle gap rule;
- TASK-035 owns Solo Hunt's event-driven execution of the accepted external automatic policy plus
  GCD/Move-readiness/cursor carry across encounter Battles;
- mode rule specs such as TASK-055 may explicitly select a different ActionIntent-production model
  for that mode, but may not silently change the shared Combat Engine resolver semantics.

## 6. Action eligibility

A `useMove` intent is valid only when all of these are true:

- Battle is non-terminal;
- actor exists, is living and currently active;
- actor is action-eligible at the Battle's current `combatTimeMs` under section 5.1;
- actor is the canonical next eligible Combatant at that action time under section 5.1;
- Move is in the actor's immutable battle loadout;
- Move resolves to an executable MoveRule under the pinned rules/data context;
- selected Move is individually ready at the current `combatTimeMs`;
- supplied targets satisfy that MoveRule and current Battle State.

Validation occurs before any combat RNG consumption or mutation, preserving ADR-004 atomic
rejection.

The engine never chooses a Move or replacement Combatant. That remains external policy/player/
orchestration behavior.

## 7. Targeting v1

The v1 engine supports these generic target scopes when an authored/compiled MoveRule selects one:

- `self`;
- `singleAlly`;
- `singleEnemy`;
- `allAllies`;
- `allEnemies`;
- `allActive`.

Target eligibility is exact in baseline v1:

- `self`: exactly the acting Combatant;
- `singleAlly`: exactly one **other** living active Combatant on the actor's Battle Side;
- `singleEnemy`: exactly one living active Combatant on an opposing Battle Side;
- `allAllies`: every living active Combatant on the actor's Battle Side, including the actor;
- `allEnemies`: every living active Combatant on every opposing Battle Side;
- `allActive`: every living active Combatant on every Battle Side, including the actor.

Reserve/non-active Combatants are never targetable by a Move in baseline v1. KO Combatants are
never legal Move targets.

`self` and all-target scopes derive their target set from Battle State. Single-target scopes
require the ActionIntent to identify the target explicitly. The complete legal target set is
validated and frozen before `MoveUsed`/RNG/state mutation begins; container iteration or later
adapter changes cannot add a target mid-action.

There is no implicit retargeting. If the supplied single target is no longer legal at resolution
time, the intent is rejected atomically rather than redirected.

For a multi-target Move, targets resolve by the same ascending UTF-8-byte `CombatantId` order from
section 5.1. Any per-target RNG is consumed in that same order so adapter/container iteration
cannot affect results.

At action acceptance, freeze the direct-hit calculation inputs for the current Move action:
MoveRule/type/category/power plus the actor's effective offensive stat and battle types, and each
frozen target's effective defensive stat/battle types. A reaction from an earlier target may change
future Battle State, but it does not retroactively alter direct-hit inputs for a later target in
the same already-accepted Move.

Each frozen target resolves its complete per-target chain before the next target begins. If a
later frozen target has become KO before its turn in that same action chain, that target is skipped
without accuracy/crit/variance RNG and without miss/immune/damage events. No new target is added as
a replacement.

## 8. Move category and effective stats

Rules v1 adopts the three executable categories:

- `physical`: direct damage uses attacker's effective `atk` and defender's effective `def`;
- `special`: direct damage uses attacker's effective `spa` and defender's effective `spd`;
- `status`: has no implicit direct-damage calculation and executes only its explicit effect rule.

For the baseline simple-damage compilation, executable category mirrors PokémonDB
`sourceCategory`. Any future intentional category override is explicit immutable rule semantics,
never a crawler/parser decision.

Combatant types are fixed from the resolved Battle snapshot in baseline v1. Type-changing effects
are not part of the accepted v1 effect primitives.

Status Move resolution uses its explicit accuracy rule, then its authored effects on an accuracy
pass. Baseline Status Moves do **not** consult STAB, type effectiveness, critical-hit or damage
variance rules. A future status mechanic that needs type-based immunity or another additional gate
requires an explicit accepted rules extension; it is not inferred from the Move's TypeId.

## 9. Stat stages v1

Rules v1 supports battle-local stages for `atk`, `def`, `spa`, `spd` and `spe` only.

- every supported stage initializes to exactly `0` for every Combatant at the start of every new
  Battle, before `BattleStarted` and before battle-start Ability reactions;
- each stage is an integer in `-6..+6`;
- attempts to exceed the domain clamp at the nearest bound;
- `hp` has no stage;
- accuracy/evasion stages do not exist in v1.

For base derived stat `S` and stage `n`:

```text
n >= 0: effective = floor(S * (2 + n) / 2)
n <  0: effective = floor(S * 2 / (2 - n))
```

The result is at least `1`.

Stage changes are battle-local state and never modify the persistent Pokémon Instance.
They are never accepted as cross-Battle carry-in in baseline v1.

## 10. Accuracy

For a Move with numeric accuracy `A`, `A` must be an integer in `1..100` in the executable rule.

The engine draws one uniform integer `accuracyRoll` from `1..100` inclusive and the accuracy gate
passes iff `accuracyRoll <= A`.

For a rule whose accuracy is `always`, no accuracy RNG draw occurs.

There are no accuracy/evasion stages, hidden modifiers or implicit level/Speed adjustments in v1.

If the accuracy gate fails:

- the Move is still an accepted action and consumes both the actor GCD and that Move's individual
  cooldown;
- `MoveUsed` then `MoveMissed` are emitted;
- no crit or variance draw occurs for that missed target;
- no hit-only effect for that target executes.

For multi-target Moves, accuracy is resolved separately per target in canonical target order unless
the explicitly authored MoveRule defines an always-hit target-independent effect.

## 11. Critical hits

The baseline `normal` critical policy applies only to a successful direct damaging hit.

- critical chance: exactly `1/16`;
- resolve with one uniform integer draw `1..16`; a result of `1` is critical;
- critical damage multiplier: exactly `3/2`;
- status/no-direct-damage actions do not consume a critical RNG draw;
- v1 has no crit stage, held-item crit modifier or implicit move-name exception.

An explicitly authored MoveRule may later select `never` or `always` critical policy as versioned
semantics; no such behavior is inferred from prose.

## 12. Damage variance

Every successful direct damaging hit consumes one uniform integer variance draw in `85..100`
inclusive.

The drawn integer is used as the rational multiplier `variance / 100`.

No variance draw is consumed for a miss, immunity with no damage calculation, status-only action
or rejected intent.

## 13. Base damage arithmetic

For attacker level `L`, Move power `P`, effective attacking stat `A` and effective defending stat
`D`:

```text
levelFactor = floor((2 * L) / 5) + 2
scaled      = floor((levelFactor * P * A) / D)
baseDamage  = floor(scaled / 50) + 2
```

`D` must be at least `1` after stat-stage resolution.

No floating-point intermediate is normative. TASK-009 may use integers/bigints/rational helpers
as needed as long as observable output is identical for the supported numeric domain.

## 14. Damage modifiers

After `baseDamage`, the hit uses these rational modifiers:

### 14.1 STAB

If the Move's `TypeId` matches at least one of the attacker's current battle types, STAB is `3/2`.
Otherwise STAB is `1`.

STAB is applied once even if an unusual future Combatant somehow contains the same type more than
once.

### 14.2 Type effectiveness

For each current defender type, obtain the factual current attack-type/defense-type multiplier
from the pinned SPEC-002 game-data matrix. Multiply all defender-type multipliers together.

Baseline v1 accepts the current matrix values `0`, `0.5`, `1` and `2` and converts them to the exact
rationals `0`, `1/2`, `1` and `2` before combat arithmetic. A different factual multiplier domain
requires a new compatible rules decision rather than being interpreted through binary floats.

Examples of structural behavior:

- one neutral type contributes `1`;
- two defender types multiply their values;
- any `0` component makes the total effectiveness `0`.

Historical type charts are not used by v1 unless a later rulesVersion explicitly adopts them.

### 14.3 Critical multiplier

Critical hit: `3/2`. Non-critical: `1`.

### 14.4 Variance

Use `variance / 100` from section 12.

### 14.5 Final rounding

Compute one exact rational product:

```text
modified = baseDamage * STAB * typeEffectiveness * critical * variance/100
```

Then:

- if `typeEffectiveness == 0`, final damage is exactly `0`;
- otherwise `finalDamage = max(1, floor(modified))`.

There is no intermediate rounding between these four modifiers.

Damage cannot reduce current HP below `0`.

Baseline v1 has no revival mechanic. Once a Combatant reaches `0` HP it remains KO for the rest of
that Battle. Healing cannot raise a KO Combatant above `0`.

## 15. Direct-hit RNG order

For each target in canonical target order, the baseline direct-hit pipeline consumes RNG exactly
as follows:

1. accuracy draw, only when accuracy is numeric;
2. if miss: stop hit pipeline for that target;
3. if type effectiveness is exactly zero, emit the immune/no-damage result and do not consume
   crit or variance draws;
4. critical draw, when crit policy is `normal`;
5. variance draw;
6. apply exact damage arithmetic;
7. execute ordered hit/post-damage effects that are part of the explicit MoveRule.

Explicit effect rules that use randomness must declare their deterministic draw point/order in the
immutable rules artifact; implementation iteration order may never choose it accidentally.

## 16. Effects v1

Rules v1 intentionally keeps the generic effect algebra small. Explicit MoveRule/AbilityRule/
EffectRule content may compose these primitives:

- instant HP healing by exact integer amount or exact positive rational fraction of `maxHp`;
- stat-stage delta for one of `atk/def/spa/spd/spe`;
- timed action lock with explicit `battle | cadence` lifetime scope until an explicit logical
  `expiresAtMs`;
- periodic HP consequence with explicit `damage` or `healing` kind, first tick, integer interval,
  exact integer or positive rational max-HP magnitude and expiry;
- apply/remove one identified Active Effect whose stacking policy is explicit.

Every finite-duration EffectRule/timed action lock declares an immutable `lifetimeScope` under
`rulesVersion`:

- `battle`: the effect exists only in the Battle where it was applied. Battle end terminates any
  remaining duration/schedule without a cross-Battle tick or carry-in;
- `cadence`: the effect belongs to the continuing Combatant inside one accepted combat-cadence
  scope. It preserves its remaining duration, next periodic boundary, stack state and deterministic
  schedule identity across chained Battles and through deterministic inter-Battle elapsed time.

There is **no default lifetime scope**. Unsupported/omitted scope fails rule validation rather than
silently choosing Battle or Hunt persistence.

`DoT`, `HoT`, `Buff` and `Debuff` are descriptive gameplay labels, not executable shortcuts. An
EffectRule must still resolve entirely to primitives explicitly supported by the accepted rules.
In particular, the word "Buff" or "Debuff" does not implicitly create a stat multiplier/stage
change, and no behavior is inferred from Move/Effect names or source prose.

Stat stages remain a distinct **Battle-local** mechanic in baseline v1. They always reset to `0` for
a new Battle and are not made cadence-persistent merely because a timed Buff/Debuff EffectRule may
use `lifetimeScope = cadence`. A timed Buff/Debuff that persists across Battles must therefore be
represented by an explicitly authored Active Effect rather than by carrying a stat-stage value.

For a `battle` effect, teardown is not a new combat-time boundary and does not execute remaining
ticks/expiries. Once `BattleEnded` has been emitted, no future `battle`-scoped schedule from that
Battle may produce authoritative consequences. Cleanup after terminal Battle State is implementation
teardown, not an `EffectRemoved` sequence after `BattleEnded`; `BattleEnded` remains the final
authoritative Combat Event for that Battle.

For a positive rational HP fraction `p/q`, requested magnitude is
`max(1, floor(maxHp * p / q))`. Healing clamps at `maxHp`; damage clamps at `0`. Events/authoritative
cadence consequence records store the actual applied amount after clamping. Periodic/effect damage
does not implicitly receive STAB, type, critical or variance modifiers.

Healing, stat-stage changes, action locks and new Active Effect applications require a living
target at the moment that primitive resolves. If an already-accepted action/reaction reaches one
of those primitives after that intended target became KO earlier in the same chain, the primitive
is skipped with no state change, event or RNG. `EffectRemoved` may still clean up an effect owned
by a KO Combatant. No accepted v1 primitive revives a KO Combatant.

### 16.1 Active Effect identity and stacking

Every persistent executable effect resolves from an immutable EffectRule under `rulesVersion`.

Effect identity uses the target identity appropriate to its lifetime scope:

- `battle` state is keyed at least by `(targetCombatantId, effectId)`;
- `cadence` carry state is keyed at least by `(targetCadenceParticipant, effectId)`, where
  `targetCadenceParticipant` is the complete stable pair `{ kind, identity }`. `kind` is
  `pokemonInstance` for a continuing player-owned Pokémon and its `identity` is exactly that
  `PokemonInstanceId`; a continuing non-player participant uses `kind = nonPlayer` and an explicit
  equally stable accepted non-player identity. The pair does **not** derive from or reuse a
  Battle-scoped `CombatantId`. The same raw identity string under two different kinds denotes two
  different cadence participants. Absent a stable accepted participant pair, cross-Battle cadence
  carry is unavailable.

When a cadence participant enters a new Battle, orchestration supplies an explicit one-to-one
`targetCadenceParticipant { kind, identity } -> CombatantId` binding as Battle initialization input.
The engine validates the complete participant pair before applying cadence carry. Missing, duplicate,
conflicting or mismatched bindings fail initialization; the engine never guesses continuity from
SpeciesId, slot, team position, display name or a reused CombatantId.

Persistent effect state also carries a monotonically increasing `applicationSequence` within its
lifetime scope. Battle-scoped sequences are Battle-local; cadence-scoped sequences remain stable/
ordered for that cadence scope. A `replace` application removes the old instance and creates a new
application sequence. `refresh` and `stack` operate on the existing instance unless the authored
rule explicitly says replacement.

Any operation that changes an existing effect's future tick/expiry schedule increments that
effect's deterministic `scheduleRevision`. Scheduled boundaries capture both
`applicationSequence` and `scheduleRevision` so stale scheduled work cannot act on a replacement
or refreshed schedule accidentally.

That rule declares one stacking policy:

- `replace`: new application replaces the prior same-effect instance on the same target;
- `refresh`: keep the existing effect identity/stacks but reset duration/tick schedule as defined by
  the rule;
- `stack`: valid only for periodic HP-damage effects; add one stack up to an explicit integer
  `maxStacks >= 2`.

No default stacking policy exists.

Stacking behavior is exact in v1:

- a new non-existing persistent effect starts at stack count `1`;
- `replace` emits `EffectRemoved` for the old instance and then `EffectApplied` for the new instance,
  with a new `applicationSequence`;
- `refresh` keeps stack count/application sequence, recomputes its future schedule from the current
  logical time, increments `scheduleRevision`, and emits `EffectUpdated`;
- `stack` increments stack count by exactly `1` up to `maxStacks`, does **not** refresh expiry/tick
  schedule, and emits `EffectUpdated` only when the stack count actually changes;
- a stack attempt already at `maxStacks` is a deterministic no-op with no event/RNG;
- periodic damage requested magnitude is multiplied by current stack count before HP clamping.

Timed action locks and periodic Active Effects have finite integer `durationMs >= 1` in baseline
v1. Within one active Battle, `expiresAtMs = applicationTimeMs + durationMs`; a cadence-scoped
effect crossing a Battle boundary is normalized to deterministic remaining-duration/next-boundary
state rather than interpreting the next Battle's clock origin as the original timestamp. Battle-long
stat changes are modeled by the immediate stat-stage primitive rather than an infinite-duration
Active Effect.

### 16.2 Effect timing

Effect expiry/ticks use deterministic logical milliseconds only. A periodic interval is an integer
`>= 1 ms`. During an active Battle they use Battle logical time; cadence-scoped effects also consume
the deterministic elapsed time explicitly advanced between Battles. Time advancement resolves every
due timestamp in chronological order without a wall-clock loop or per-millisecond polling.

There is no universal default periodic interval and no implicit conversion from source/franchise
"turn" counts to PokeNexus milliseconds. Every periodic `intervalMs` and finite `durationMs` is an
explicit authored `rulesVersion` value. If content design chooses values inspired by a turn-based
source mechanic, that translation is a PokeNexus rule decision rather than factual source data.

At Battle end:

- a `battle` effect discards every future tick/expiry as described above;
- a `cadence` effect whose target remains a continuing cadence participant carries its exact
  remaining duration, remaining time to next tick, stacks and schedule identity into cadence state;
- if the target does not continue in the cadence scope, the effect terminates with that target's
  participation and cannot later resolve against an unrelated Combatant with a reused Battle ID.

Cross-Battle replay/checkpoint identity therefore includes the exact stable cadence participant
`{ kind, identity }` pair and its deterministic Battle binding wherever cadence effects/readiness/
cursor are carried.

Inter-Battle elapsed time **counts** for cadence-scoped effects. The same deterministic cadence
advancement that reduces remaining GCD/Move cooldown delay also advances cadence effects and resolves
every due periodic/expiry boundary in order. A cadence DoT can therefore reduce a continuing
Pokémon to `0` HP before the next Battle begins; a cadence HoT can heal during the same gap. There is
no automatic safety/heal at a Battle boundary.

Cadence effect resolution necessarily operates on the continuing participant's current HP. For Solo
Hunt, the Battle-end HP of a continuing player Pokémon becomes its cadence HP, inter-Battle effects
mutate that value, and the next Battle receives the resulting HP for that same `PokemonInstanceId`.
The Battle boundary itself does not restore HP. TASK-033 owns broader Hunt recovery/termination/team
replacement policy, but it may not silently insert an automatic full-heal that erases these accepted
cadence consequences.

This cadence HP is **Hunt runtime/checkpoint state keyed by** `PokemonInstanceId`; it is not an
implicit mutation of durable Pokémon Instance progression/definition state merely because the stable
instance identity is used for continuity. TASK-013/TASK-033/TASK-037 own the eventual persistence and
checkpoint envelope for that runtime state.

Ending the accepted cadence scope terminates all remaining cadence-scoped effects/schedules. For
Solo Hunt this means a genuinely new Hunt starts with no prior-Hunt cadence effects unless TASK-033
later accepts a broader outer scope. Therefore Hunt cancel/restart policy must treat both cooldown
reset and cadence-effect cleanse/reset as potential abuse surfaces.

If a cadence effect makes a continuing Pokémon reach `0` HP between Battles, that Pokémon is KO for
the Hunt/cadence state and cannot be admitted as a living participant to the next Battle. Baseline
SPEC-003 still does not invent item-based revival. TASK-022/TASK-033 must define Potion/healing/
revival item semantics and when the player may submit such item-use stimuli. Any such command must
be explicitly ordered on the same deterministic cadence timeline relative to scheduled effect
boundaries. Inventory authorization/consumption remains outside the Combat Engine, but any accepted
item consequence that mutates cadence HP/effects must normalize into an accepted generic game-core
rule/stimulus and use the same deterministic evaluator; Hunt orchestration may not own alternate
healing/revival math.

The Hunt/orchestration layer must **not** implement a second damage/healing/effect resolver for this
gap. TASK-009 must expose/reuse the same pure deterministic game-core effect-rule evaluator for
cadence advancement, while TASK-033/035 own participant mapping, cadence lifecycle and the Hunt-level
event/checkpoint envelope. This preserves ADR-004's one-resolver invariant even when no Battle is
currently active.

When a periodic effect is applied at logical time T, its first tick is exactly
`firstTickAtMs = T + intervalMs`, which is strictly greater than T. Its expiry follows the finite
duration rule above. This prevents zero-time periodic reaction loops.

For one logical timestamp T, all effect ticks/expiries that were already due at T before boundary
resolution form one **time-boundary batch**. That due set is frozen before resolving the first
member. Members resolve in effect application sequence, then ascending lexicographic UTF-8-byte
order of canonical `EffectId`, then boundary kind with `tick` before `expiry`.

Therefore, when one periodic Active Effect has a scheduled tick exactly at its `expiresAtMs`, that
final tick resolves first and the effect expires immediately afterward at the same logical time.

Before a frozen boundary member executes, its captured `(applicationSequence, scheduleRevision)`
must still match the current exact effect instance. If an earlier deterministic consequence has
removed/replaced/refreshed that schedule, the stale member is suppressed with no Combat Event and
no RNG consumption. A tick is likewise suppressed with no event/RNG if its target became KO
earlier in the same boundary batch; an expiry boundary may still remove its matching effect
instance. These suppression rules do not cancel a due effect merely because its **source** became
KO; target state/schedule identity controls execution.

KO state is applied immediately as HP reaches zero, but Battle terminal outcome is not finalized
until the entire frozen batch for T completes. Therefore two already-due effects at the same
timestamp can KO the final surviving Combatants on opposing sides and produce a deterministic
draw. A due effect is not cancelled merely because its source becomes KO earlier inside the same
boundary batch; an effect whose target was already KO before T is not due/eligible for that batch.

Splitting an A→C time advance into A→B and B→C without an interleaved stimulus yields the same
flattened events/final state/RNG position as required by ADR-004.

### 16.3 Action lock

An action-locked Combatant remains active/alive but cannot legally use a Move until the lock
expires. Action lock does not itself move `nextActionAtMs` or any `moveReadyAtMs`; global readiness,
individual Move readiness and lock state must all permit action.

`actionLock` is the v1 hard-control primitive, not a type-erased framework for future control
mechanics. Each MoveRule/AbilityRule action-lock instruction declares `lifetimeScope: battle |
cadence`; omitted or unsupported scope fails validation. A Combatant stores at most one deadline
per scope. Reapplication within a scope is extend-only:
`max(currentDeadline, applicationTimeMs + durationMs)`. Battle and cadence deadlines are
independent gates, and either unexpired deadline blocks action. Battle locks are discarded at Battle
end. A cadence lock requires a stable cadence participant, carries its exact remaining duration,
and decreases by explicit inter-Battle `gapMs` before deterministic rebinding. Future concrete
control mechanics may apply duration resistance, immunity, or diminishing returns before their own
deadline mutation; v1 implements none of those mechanics.

## 17. Ability semantics v1

An Ability has executable combat behavior only when its `AbilityId` resolves to an explicit
immutable `AbilityRule` under the pinned `rulesVersion`.

No behavior is inferred from PokémonDB descriptive text, Ability name or source slot.

If a Combatant Snapshot contains an Ability intended to participate in combat but no compatible
AbilityRule exists, Battle initialization fails closed. A mode/content definition may explicitly
provide no active combat Ability for a Combatant when its owning product rules permit that state.

AbilityRule effects use the same deterministic effect/RNG/time boundary as Move effects. Initial
v1 implementation/fixtures may support only explicitly accepted example Ability rules; broad
production Ability coverage requires authored versioned rule content rather than implementation
guesswork.

### 17.1 Ability reaction surface v1

The generic v1 AbilityRule reaction surface is deliberately closed. An authored AbilityRule may
react only at these semantic points:

- `battleStart`;
- `afterDirectDamageDealt`;
- `afterDirectDamageTaken`;
- `afterContactDealt`;
- `afterContactReceived`.

There is no generic v1 Ability trigger for KO, effect tick, switch-in/activation, pre-hit,
pre-accuracy or pre-damage modification.

These reactions may compose only accepted v1 effect primitives and target either:

- `self` — the Combatant owning the AbilityRule; or
- `counterpart` — the other direct-damage/contact participant for a non-battleStart reaction.

`counterpart` is invalid for `battleStart`. Ability reactions cannot target reserves or arbitrary
third Combatants in baseline v1.

Reactions cannot retroactively change an already-resolved accuracy/crit/variance/direct-damage
result. A future pre-hit/pre-damage modifier system requires a new accepted rules version/spec
extension.

For one successful direct-damage/contact consequence, reaction order is exact:

1. living source/attacker `afterDirectDamageDealt`;
2. living source/attacker `afterContactDealt`, only when the MoveRule contact tag is true;
3. living target `afterDirectDamageTaken`, only if the target remains living after immediate KO
   evaluation;
4. living target `afterContactReceived`, only when contact is true and the target remains living.

If multiple reaction entries exist at one trigger point, their authored stable ordering key is
part of the immutable AbilityRule.

Ability reaction outputs do not themselves trigger another Ability reaction in baseline v1.
Therefore the v1 Ability reaction graph is non-recursive by rule, not by implementation depth
limits.

### 17.2 Battle-start Ability ordering

After complete Battle initialization/validation, emit `BattleStarted` as authoritative event
sequence `1` at `combatTimeMs = 0`.

Then collect battle-start Ability reactions from **living active Combatants only**. Reserve
Combatants do not fire `battleStart`, and later forced activation does not retroactively fire it.

The complete battle-start Combatant order is frozen before the first reaction using the initial
pre-reaction effective `spe` values: higher Speed first, with ties broken by the same ascending
UTF-8-byte `CombatantId` order used by section 5.1. Reactions do not cause this frozen startup order
to be recomputed.

Within one Combatant's `battleStart` reaction point, authored stable AbilityRule ordering keys are
used when more than one reaction entry exists. All resulting effect/event consequences resolve
before moving to the next Combatant in the frozen startup order.

After the full battle-start reaction pass, resolve any resulting KO/terminal state before normal
Move/time stimuli are accepted. If the Battle is non-terminal and fillable active vacancies exist,
enter mandatory replacement state before accepting normal stimuli.

## 18. KO and active replacement

### 18.1 Battle-side / active-set initialization validity

A baseline v1 Battle starts with at least two Battle Sides.

For every side:

- `activeCapacity` is an integer `>= 1`;
- the side contains at least one living battle-eligible Combatant at initialization;
- every Combatant belongs to exactly one Battle Side and every `CombatantId` is unique across the
  Battle;
- the initial active set contains unique Combatants owned by that side only;
- initial active count is exactly `min(activeCapacity, livingBattleEligibleCombatantCount)`;
- any additional living Combatants are reserves;
- starting-KO Combatants may exist as non-active lineup members but do not count toward the living
  active-set requirement.

For every Combatant, readiness initialization must additionally satisfy section 5.0.1:

- `initialNextActionRemainingMs` is a non-negative integer;
- `initialMoveCooldownRemainingMs` has an exact key set equal to that Combatant's executable pinned
  Move Loadout `MoveId` set, with every value a non-negative integer;
- no missing, extra or unknown Move readiness key is accepted.

Battle-local effect initialization is split by lifetime scope:

- every supported stat stage starts at exactly `0`;
- no `battle`-scoped Active Effect, periodic schedule or timed action lock from a prior Battle is
  accepted as initialization input;
- cadence-scoped Active Effects for a continuing participant are accepted only from validated
  deterministic cadence carry-in produced by the same rulesVersion evaluator. Their target
  `{ kind, identity }` participant pair,
  lifetime scope, remaining duration, next-boundary delay, stacks and schedule identity must all be
  valid for the pinned loadout/rules context, and their stable cadence participant must have exactly one
  validated binding to the intended new-Battle `CombatantId`; malformed or foreign carry-in fails
  initialization.

Any violation fails Battle initialization before `BattleStarted` and before RNG/state mutation.
This prevents a valid non-terminal Battle from beginning with zero active actors or intentionally
unfilled active capacity while living reserves exist.

### 18.2 KO semantics

A Combatant is KO when current HP reaches `0`.

- KO is evaluated immediately after each HP-changing consequence;
- a KO Combatant cannot act or be a legal living target;
- KO never mutates persistent ownership/progression state directly;
- an active KO leaves a vacancy in that Battle Side's active capacity.

Rules v1 supports **forced replacement only**. Voluntary switching is disabled.

When a side has a living non-active reserve and an active vacancy, that side enters
`replacementPending`. Replacement is mandatory until either all active vacancies are filled or no
living non-active reserve remains.

While any side has `replacementPending`, the engine accepts only legal forced-replacement
stimuli. `useMove` and time-advancement stimuli are rejected atomically with no state/RNG/time
change. This prevents a side from delaying replacement to gain invulnerability, alter initiative
or let another actor continue while a required slot is intentionally left empty.

An external player/policy/orchestrator supplies each zero-combat-time replacement selection. The
engine validates that the selected Combatant belongs to the side, is living and is not already
active, then activates it.

The engine never chooses the replacement itself.

Replacement consumes no combat RNG and does not advance logical time. Every reserve already has
deterministic actor/per-Move readiness from Battle initialization, including any non-zero cadence
carry-in. Therefore a never-previously-active reserve is immediately action-eligible on activation
only when its carried/elapsed GCD and at least one carried/elapsed Move cooldown permit it and that
Move has a legal target. A previously active reserve retains its existing battle-local
HP/effects/global-action/per-Move readiness state.

After each activation, replacement-pending state is recomputed. Only after no mandatory
replacement remains does normal action/time processing resume, at the same logical timestamp.

Mode-specific active capacity and the validated initial active set are immutable Battle
configuration; v1 does not require exactly one active Combatant per Battle Side.

## 19. Victory and draw

Define a **surviving side** as a Battle Side that has at least one living battle-eligible
Combatant, active or reserve.

After every complete accepted Move/reaction chain, evaluate survival. For explicit time
advancement, evaluate survival only after the complete same-timestamp boundary batch from section
16.2 has resolved.

At that evaluation point:

- more than one surviving side: Battle remains non-terminal;
- exactly one surviving side: Battle ends with that side as winner;
- zero surviving sides: Battle ends in draw.

Terminal outcome is decided before mandatory replacement is established. If more than one side
survives, then and only then compute `replacementPending` for fillable active vacancies. If the
Battle is terminal, no replacement is required or accepted afterward.

An active vacancy with a living reserve is not defeat; the Battle can wait at the same logical
time for a legal forced replacement.

Forfeit, external timeout, score victory, raid contribution or other mode-specific termination is
not part of baseline rules v1 and must enter through a later accepted generic rule/config rather
than a mode branch inside the resolver.

## 20. Combat Events v1 semantic taxonomy

Every authoritative Combat Event has a monotonically increasing battle-local `sequence` and
deterministic `combatTimeMs`. `BattleStarted` is sequence `1`; each subsequent authoritative event
increments sequence by exactly `1` with no infrastructure/audit records inserted into that sequence.

`recordedAt`, server receipt timestamps, request IDs and transport diagnostics are external
observability metadata and are not part of authoritative event equality/replay semantics.

The initial semantic taxonomy contains at least:

- `BattleStarted`;
- `MoveUsed`;
- `MoveMissed`;
- `MoveImmune`;
- `CriticalHit`;
- `DamageApplied` including applied amount and resulting HP;
- `HealingApplied` including applied amount and resulting HP;
- `StatStageChanged`;
- `EffectApplied`;
- `EffectUpdated`;
- `EffectRemoved`;
- `EffectTicked` when a persistent effect causes a timed consequence;
- `CombatantKO`;
- `CombatantActivated` for forced replacement;
- `BattleEnded` with win/draw outcome.

An immune target emits `MoveImmune` and no `DamageApplied` for that target. A stage instruction
emits `StatStageChanged` with requested delta, applied delta and resulting stage even when clamping
makes the applied delta `0`.

Branch-event order is normative:

- `BattleStarted` is event `1`; battle-start Ability consequence events follow in section 17.2's
  frozen startup order before normal action/time processing;
- `MoveUsed` is emitted once before any per-target result for that action;
- targets then resolve in canonical target order;
- `MoveMissed` is the terminal direct-hit event for a missed target;
- `MoveImmune` is the terminal direct-hit event for an immune target;
- on a critical damaging hit, `CriticalHit` is emitted immediately before its `DamageApplied`;
- `DamageApplied`/`HealingApplied` is emitted at the HP mutation; if damage causes KO,
  `CombatantKO` follows immediately after that `DamageApplied` before later consequence events;
- `EffectTicked` is emitted before the HP/stat consequence produced by that tick; resulting
  `DamageApplied`/`HealingApplied`/`StatStageChanged` and possible `CombatantKO` then follow;
- `EffectApplied`, `EffectUpdated` and `EffectRemoved` are emitted at their corresponding state
  mutation; at the same timestamp tick-before-expiry means tick consequence events precede
  `EffectRemoved` for that expiry;
- `CombatantActivated` is emitted when a forced replacement mutates the active set;
- `BattleEnded` is always the final authoritative event of the action/reaction chain or complete
  same-time boundary batch that establishes the terminal outcome.

Rejected external intents do not emit authoritative Combat Events under ADR-004. Adapters may
record them in a separate command/audit log.

The exact TypeScript discriminated union and serialized payload shape belong to TASK-009, but it
must preserve these meanings and the pinned `combatEventSchemaVersion` contract.

## 21. Canonical action/effect ordering

For one accepted Move action at logical time T, observable ordering is:

1. validate complete intent atomically;
2. freeze action direct-hit inputs and legal target set as defined in section 7;
3. emit `MoveUsed`;
4. resolve targets in canonical target order;
5. for each still-living frozen target:
   - Physical/Special direct-damage rule: accuracy → type immunity → critical → variance/direct
     damage → immediate KO event when applicable;
   - Status rule: accuracy only; on pass, proceed directly to the successful effect point with no
     STAB/type/critical/variance/direct-damage processing;
6. execute that direct-hit consequence's Ability reactions using section 17.1;
7. execute that target's explicit `perResolvedTarget` Move effects in authored order; then move to
   the next frozen target;
8. after all targets, execute explicit `oncePerAction` Move effects in authored order;
9. update the actor GCD plus the used Move's individual cooldown/readiness for the accepted action;
10. evaluate surviving sides from the complete action chain; if terminal, emit `BattleEnded` as
    the final event and do not establish replacement;
11. otherwise establish mandatory replacement state from all fillable active vacancies produced
    by the complete action chain.

Every authored Move effect instruction must declare one execution scope:

- `perResolvedTarget`: execute once for each target whose accuracy/immunity gate reached the
  successful effect point; it may target `actor` or that `currentTarget`;
- `oncePerAction`: execute once after all target chains; it may target `actor` only in baseline v1.

`perResolvedTarget` effects do not execute for missed, immune or skipped-KO targets. Baseline v1
does not provide an authored "effect even on miss/immunity" override; such behavior requires a
later rules extension.

An authored reaction/effect rule must expose an explicit stable ordering key/phase where multiple
rules can react to the same consequence. TASK-009 may choose the internal representation, but
unordered map/object iteration is never rule semantics.

## 22. Rules versioning

Every executable semantic in this specification that can change authoritative interpretation is
`rulesVersion` semantics, including:

- IV domain and derived-stat formulas;
- Move loadout battle constraints;
- baseline ordered automatic Move-sequence policy semantics, including cursor initialization,
  cyclic scan/skip and cursor advancement/cadence-scope reset rules;
- global-action cooldown, the per-Move cooldown derivation curve and the exact cross-Battle
  readiness carry/reset arithmetic;
- Speed initiative rule;
- accuracy/crit/variance domains and RNG draw order;
- damage formula and rounding points;
- STAB/type math;
- stat-stage formula;
- effect stacking/timing/lifetime-scope rules and deterministic cadence-effect advancement;
- Battle-scoped teardown plus cadence-scoped cross-Battle effect carry/advancement semantics;
- KO/replacement/victory semantics;
- authored MoveRule/AbilityRule/EffectRule content;
- deterministic reaction/effect ordering.

Changing any of those semantics requires a new immutable `rulesVersion` rather than mutating an
existing version.

Pair-derived values are different. For an allowlisted simple-damage Move, the resolved
`moveCooldownMs` is a deterministic output of the pinned compatible
`{ gameDataVersion, rulesVersion }` pair: `gameDataVersion` supplies factual `power`/`pp`, while
`rulesVersion` supplies the curve. A factual Power/PP correction may therefore change that resolved
cooldown in a new compatible `gameDataVersion` without requiring a new `rulesVersion`, exactly as
SPEC-002 permits. Historical replay remains stable because the Battle pins both versions.

By contrast, an authored Status/complex MoveRule's explicit cooldown is rule content; changing that
authored value is a semantic rule change and requires a new `rulesVersion`.

Structural Combat Event changes additionally follow ADR-004's independent
`combatEventSchemaVersion` rules.

## 23. Explicitly unsupported baseline mechanics

Unless a later accepted rulesVersion/spec adds them, baseline v1 has no:

- Move PP consumption;
- Move priority;
- Speed-derived cooldown/attack rate;
- accuracy/evasion stages;
- EV/Nature mechanics;
- voluntary switch;
- held-item combat behavior;
- weather/terrain/hazards;
- cast/channel/animation time as combat semantics;
- implicit move/Ability behavior derived from prose;
- implicit random retargeting;
- mode-specific damage resolver.

Unsupported semantics fail validation or remain unavailable to battle content; they are never
approximated silently.

## 24. Required implementation fixtures for TASK-009/010

Implementation must make it possible to fixture at least:

- Physical neutral hit;
- Special STAB super-effective hit;
- dual-type multiplier and immunity;
- numeric-accuracy hit and miss;
- always-hit/null-accuracy Move;
- normal critical and non-critical paths;
- minimum non-immune damage;
- same-time readiness ordered by Speed then CombatantId;
- actor-GCD rejection with zero state/RNG change;
- per-Move cooldown rejection with zero state/RNG change;
- using another individually ready Move while a previously used Move remains on cooldown;
- non-zero deterministic readiness carry-in at Battle initialization;
- cross-Battle carry-out/carry-in preserving actor GCD and a long per-Move cooldown across a new
  Battle, including deterministic subtraction of an explicit inter-Battle `gapMs`;
- publication examples proving deterministic Power+PP cooldown derivation/quantization;
- multi-target canonical RNG order;
- stat-stage increase/decrease/clamp;
- next-Battle stat stages reset to `0`; battle-scoped effects initialize absent while validated
  cadence-scoped effects may carry for the same continuing participant;
- timed action lock expiry;
- periodic-damage tick with partition-invariant time advancement;
- battle-scoped effect teardown at Battle end with no future tick/carry;
- cadence-scoped DoT/HoT/effect carry across Battle boundaries, including due tick/expiry processing
  during deterministic inter-Battle elapsed time and KO before next-Battle initialization;
- cadence effect keyed by the full stable continuing `{ kind, identity }` participant pair (with
  `pokemonInstance` bound exactly to `PokemonInstanceId`), rebinding deterministically to a different
  `CombatantId` in the next Battle and rejecting ambiguous or kind-mismatched mapping;
- KO with living reserve and externally selected forced replacement;
- winning KO and simultaneous-effect draw;
- unsupported status Move/Ability failing closed;
- replay reproducing identical events/final state under pinned rules/data/event schema.

Because TASK-009 does not implement Move selection, the first owning automatic-policy
implementation (Solo Hunt: TASK-035) must additionally fixture the section 5.2 contract: `1`, `2`,
`3` and `4` populated slots; fresh-session slot-1 selection; cyclic wrap; skip of cooling-down and
currently unusable slots; cursor advancement only after accepted execution; one-Move repetition;
no-usable-Move idle advancement without tick polling; cross-Battle cursor/readiness continuity; and
deterministic checkpoint/resume when the policy regenerates ActionIntents.

## 25. Deferred rule/content work

This spec deliberately separates **rule mechanics** from **broad content coverage**.

TASK-009 implements the accepted engine and enough explicit rule fixtures to prove the contract.
It must not silently author hundreds of status Move/Ability behaviors from names/descriptions.

Before production content depends on mechanics not explicitly covered by the baseline simple-
damage compiler or accepted fixture rules, the project must materialize an owned versioned combat-
rule content/catalog task or extend an appropriate accepted Class A rules task. That work publishes
new immutable rule artifacts under SPEC-002 rather than hiding content semantics inside engine
code.

The project roadmap must keep this production-content gate visible before Solo/Duo/PvP or other
content is allowed to rely on broad status-Move/Ability/complex-Move coverage.

## 25.1 Known baseline balance/product consequences

These are intentional consequences of the small v1 foundation and are not hidden implementation
behavior:

- the actor GCD limits one Combatant to at most one Move action per `2000 ms`, while independent
  per-Move cooldowns naturally desynchronize loadout availability; this reduces single-Move spam
  without introducing persistent PP depletion;
- loadout size/composition and player/content-defined slot order therefore affect achievable action
  throughput and exact Move ordering. Several independently cooling Moves may let the cyclic policy
  stay close to the 2s GCD, while a one-Move loadout or a sequence with fewer currently legal ready
  options may create idle gaps. This is intentional mechanical value of the `1..4` Move loadout,
  not hidden scheduler behavior;
- the model rate-limits but does not universally forbid repetition. A one-Move loadout whose Move
  has individual cooldown `2000 ms` repeats every GCD; in a multi-Move loadout, deterministic skip
  can also revisit a ready earlier Move when intervening slots are unavailable. The sequential
  policy constrains selection order without inventing PP consumption or an absolute anti-repeat
  rule;
- Battle boundaries are not cooldown-reset opportunities inside one cadence-continuity scope. Actor
  GCD, per-Move cooldown remaining time and the automatic sequence cursor carry across chained
  Battles, so a `12000 ms` Move used shortly before an enemy is defeated remains cooling down against
  the next enemy. Only deterministic modeled elapsed time between Battles reduces the remaining
  cooldown; starting a fresh accepted cadence scope resets it. For Solo Hunt, the entire Hunt is one
  such scope, preventing short encounters from bypassing long Move cooldowns;
- because a genuinely fresh cadence scope does reset GCD/Move readiness/cursor, a product mode must
  not accidentally make "cancel Hunt -> immediately start Hunt" a free cooldown-reset **or
  cadence-effect-cleanse** exploit. TASK-033 must explicitly define Solo Hunt cancel/end/restart
  eligibility and any anti-abuse consequence needed around that reset boundary; TASK-035 may not
  invent one implicitly;
- cadence-scoped effects make Hunt attrition continuous rather than cleansing at every encounter.
  Positive and negative timed effects can survive an enemy transition, deterministic gap time counts,
  and a periodic damage effect may KO a continuing Pokémon before the next Battle. This is intentional
  resource-management pressure; no automatic heal/cleanse is implied. Item/Potion intervention is a
  separately authored/timed Hunt action under TASK-022/TASK-033;
- carrying cadence-effect state itself is bounded/small: only the active effect instances and their
  remaining duration/next-boundary/stack/order metadata cross a Battle boundary. Runtime/offline cost
  instead scales with the number of **semantic effect boundaries that become due**. A very small
  `intervalMs` over a long duration can therefore create a large deterministic event workload even
  without polling. Publication/performance work must constrain or reject pathological authored effect
  schedules before production content depends on them; TASK-011 measures the engine budget and the
  future combat-rule content/catalog gate owns concrete content-level limits. The v1 rules do not
  silently aggregate or skip required ticks because that would change replay-visible semantics;
- source PP is only a rule-context-resolution balance signal. A future mechanic that truly consumes PP,
  charges or another resource requires an explicit later rulesVersion rather than silently reusing
  the source PP field as battle state;
- source PP is a **correlated legacy balance signal**, not an independent physical quantity. Because
  accuracy already affects expected output and a miss still consumes GCD + Move cooldown, using PP
  as an additional cooldown input can intentionally or unintentionally penalize some low-accuracy/
  low-PP Moves twice. The v1 curve accepts this as a starting heuristic, not as proof of final Move
  balance; later balance evidence may revise the curve under a new `rulesVersion`;
- exact equal-Speed ties fall to CombatantId byte order. This is deterministic but is **not** a
  final PvP fairness policy; TASK-055/PvP rules must explicitly accept it or publish a new generic
  tie rule/rulesVersion before competitive play if bias is a concern;
- baseline universal combat has no timeout/forfeit/anti-stall termination. A content/mode whose
  legal policies can produce immune/non-progressing combat must define a deterministic timeout,
  draw, policy fallback or content-validity rule before shipping that mode.

## 26. Human Owner acceptance decisions

Accepting SPEC-003 ratifies at least these product/game-rule decisions:

1. IV domain `0..31`; no EV/Nature mechanics in combat v1.
2. Derived stat formulas in section 2, with global Pokémon hard Level Cap `200`; new generations or
   regions do not automatically raise the cap, and post-cap progression is owned by separate
   progression/endgame rules.
3. Player/content-defined ordered distinct `1..4` Move loadout; populated slots use the deterministic
   cyclic sequential policy in section 5.2; no PP consumption or Struggle fallback.
4. Integer-millisecond continuous logical time; no turns/ticks/cast time.
5. Global action cooldown is exactly `2000 ms`; each Move also has its own positive immutable
   cooldown and both gates must be ready before use.
6. Allowlisted simple-damage Move cooldown is published from the exact continuous Power + PP
   rational curve + 100 ms upward quantization in section 4.1.1; PP is not consumed in battle.
7. Status/complex Moves publish explicit cooldowns, with any mechanical adjustment versioned rather
   than inferred at runtime.
8. Speed affects only same-time initiative ordering; it does not scale GCD/Move cooldown/DPS.
9. No Move priority in v1 and therefore no priority ingestion requirement.
10. Physical uses atk/def; Special uses spa/spd; Status requires explicit authored effects.
11. Numeric accuracy uses `1..100`; null/always accuracy consumes no accuracy RNG.
12. Normal crit is `1/16` with `3/2` damage; damage variance is uniform integer `85..100`.
13. Exact base-damage/rounding formula in sections 13–14.
14. STAB `3/2`; pinned current type matrix multiplies across defender types; immunity is zero.
15. Stat stages only for atk/def/spa/spd/spe, range `-6..+6`, using section 9 multiplier.
16. Generic simple-damage compilation requires an immutable MoveId allowlist; numeric source fields
    alone never prove a Move is mechanically simple.
17. Target scopes operate on living active Combatants only, with exact self/ally/enemy membership,
    frozen target sets and canonical per-target resolution order.
18. Small deterministic Active Effect primitive set with finite timing, exact replace/refresh/stack
    behavior, stale-schedule suppression and same-time tick-before-expiry ordering. Each finite
    timed effect explicitly declares `lifetimeScope = battle | cadence`; no default is inferred.
19. Ability execution is explicit/fail-closed, with the closed v1 battleStart/direct-damage/contact
    reaction surface and no pre-hit/pre-damage/recursive Ability reactions.
20. KO is non-revivable in v1.
21. Battle init requires >=2 sides, positive active capacity, globally unique CombatantIds and fully
    populated initial active slots from living eligible Combatants.
22. Forced KO replacement only; mandatory replacement blocks actions/time until fillable vacancies
    are resolved; voluntary switching is disabled.
23. Same-timestamp timed-effect batches complete before terminal evaluation, allowing deterministic
    mutual KO/draw; terminal outcome takes precedence over replacement.
24. Victory by surviving Battle Side; zero surviving sides is draw.
25. useMove/replacement execute only at current logical time; time moves only through monotonic
    advanceTime and stops at terminal/replacement blocking boundaries.
26. Authoritative event sequence + logical combat time; branch-event order is normative while
    infrastructure timestamps remain non-authoritative.
27. Broad production status-Move/Ability rule coverage is separate owned versioned content work,
    not implementation guesswork inside TASK-009.
28. CombatantId resolves exact-Speed ties in v1; PvP may require a later accepted fairness rule.
29. No universal battle timeout exists in v1; mode/content specs own deterministic anti-stall
    policy where their legal content can otherwise fail to terminate.
30. Automatic v1 Move selection follows the ordered cyclic `1..4` loadout with deterministic skip
    of cooling-down/currently unusable slots; only accepted Move execution advances the cursor. The
    cursor starts at slot 1 only for a fresh cadence-continuity scope and carries across chained
    Battles inside that scope.
31. Source PP is accepted only as a secondary correlated balance heuristic; accuracy and other
    mechanics may already encode costs, so the initial Power+PP curve is a v1 calibration subject
    to later evidence/versioned retuning rather than a claim of mathematically final balance.
32. Move loadout size/composition can change achievable action throughput because independently
    cooling Moves may be rotated to fill GCD opportunities; configured slot order can also change
    exact action order. Both are intentional v1 gameplay mechanics, not presentation-only details.
33. GCD and per-Move cooldowns are not intra-Battle-only state. Chained Battles inside one accepted
    cadence-continuity scope carry remaining readiness and sequence cursor deterministically; a
    Battle boundary cannot reset a long cooldown. Fresh-scope reset is explicit, and Solo Hunt must
    treat one Hunt as one cadence scope from start to end. TASK-033 must also explicitly close or
    consciously accept any cancel/restart cooldown-reset/effect-cleanse exploit created by the
    fresh-Hunt boundary.
34. Stat stages remain Battle-local and reset to `0`, while explicitly authored timed DoTs/HoTs/
    Buffs/Debuffs/locks/other Active Effects may be Battle-scoped or cadence-scoped. Battle-scoped
    effects terminate at Battle end; cadence-scoped effects carry for the same continuing participant.
35. Deterministic inter-Battle elapsed time counts for cadence-scoped effects and resolves their due
    ticks/expiries through the same game-core rule evaluator. A cadence DoT may KO a Pokémon before
    the next Battle. Potion/healing/revival availability and inventory consumption are owned by
    TASK-022/TASK-033, and any item-use command must be explicitly ordered on that cadence timeline.
36. Ending the cadence scope terminates remaining cadence effects. `DoT`/`HoT`/`Buff`/`Debuff` labels
    never imply hidden mechanics; only explicitly authored supported EffectRule primitives execute.
37. Solo Hunt carries a continuing player's current HP through the inter-Battle cadence gap; cadence
    effects mutate that HP and the next Battle receives the resulting value. Battle transition itself
    is not an automatic heal/reset boundary.
