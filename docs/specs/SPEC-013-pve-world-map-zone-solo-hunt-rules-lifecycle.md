# SPEC-013 — PvE World/Map, Zone & Solo Hunt Rules/Lifecycle

- Status: APPROVED
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Related ADRs: ADR-002, ADR-004, ADR-005
- Related specs: SPEC-002, SPEC-003, SPEC-005, SPEC-006, SPEC-007, SPEC-009, SPEC-012
- Related tasks: TASK-033, TASK-034, TASK-035, TASK-036, TASK-037, TASK-038, TASK-039, TASK-040, TASK-041

## 1. Problem

PokeNexus has accepted deterministic combat, Team/loadout persistence, progression, Inventory/item,
reward-ledger and production Move/Ability content contracts, but still lacks the product/rules layer
that turns those systems into the first playable Solo Hunt loop.

Without one accepted Hunt lifecycle contract, downstream tasks could independently guess whether
restarting heals the Team, when Potions may be used, how a KO selects the next Pokémon, whether offline
simulation can auto-use items, when rewards become durable, whether retreat forfeits progress, how
Zone access is gated or when capture can be attempted. Those choices are player-visible rules and
must not emerge accidentally from persistence/API/UI implementation.

## 2. Goals

- define the semantic World → Map → Zone → Hunt hierarchy without embedding concrete content rows;
- define Zone/Hunt selection and availability authority;
- define one deterministic Solo Hunt lifecycle over ADR-002 elapsed-time orchestration;
- compose Hunt cadence with SPEC-003 HP/cooldown/effect continuity and TASK-091 production content;
- define Team continuation, KO and no-living behavior;
- define the exact player-command item-use window required by SPEC-007;
- define reward-source cadence/retention and progression allocation boundaries compatible with
  SPEC-006/SPEC-009;
- define the capture opportunity handoff without stealing TASK-036 probability/outcome;
- record reset/reward/progression/capture trade-offs, consultation evidence and the accepted Human Owner
  decisions;
- leave TASK-034..041 implementation/content responsibilities cleanly separated.

## 3. Non-goals

SPEC-013 does not define production code, SQL, HTTP payloads, UI, concrete Zones/encounter tables,
reward quantities/drop rates, capture probability, captured-Pokémon construction, new Move/Ability
mechanics, revival/equipment, currencies, stamina/energy, monetization, realtime Solo Hunt networking,
or offline performance caps.

## 4. Normative inherited constraints

The final SPEC-013 must preserve these already-approved rules:

1. Solo Hunt is event/elapsed-time driven; no persistent server tick.
2. All combat resolution uses the shared deterministic Combat Engine.
3. One continuing Hunt cadence can carry HP, GCD, per-Move cooldowns, ordered Move cursor and
   cadence-scoped effects across Battle boundaries.
4. Battle boundaries do not auto-heal a surviving Pokémon or reset cadence state.
5. Due cadence effects can KO a Pokémon between Battles.
6. Running Hunt snapshots are not rewritten by later Team/loadout edits.
7. Normal healing items cannot revive and use the shared deterministic healing primitive.
8. No item is silently auto-consumed during offline advancement or AI policy.
9. Revival items are not part of accepted v1 Inventory semantics.
10. A valid accepted capture attempt consumes exactly one configured capture item whether the capture
    succeeds or fails; invalid/stale/ineligible attempts consume nothing.
11. Durable XP/rewards require server-authoritative reward sources and SPEC-009 idempotent resolution;
    Battle events or elapsed time alone are not durable reward authority.
12. Unsupported production Moves and inactive-by-policy Abilities remain fail-closed under TASK-091.
13. New Hunt/Battle admission must reject a persisted loadout that cannot resolve to executable
    production support in the pinned context.
14. Historical checkpoint/replay context never falls back to latest/current data or rules.

## 5. Accepted semantic model

### 5.1 World/Map topology

Baseline PvE uses the minimal identity surface accepted for the first Solo Hunt MVP:

```text
PvE World/Map navigation surface
  -> ZoneId
       -> HuntDefinition
```

`ZoneId` is the canonical content/progression location identity. UI grouping/labels do not become
authority, and baseline v1 introduces no canonical `MapId` or `Map/RegionDefinition`. If later concrete
content proves that a persistent map/region identity is required, that identity requires a separate
accepted contract rather than being inferred from a name or UI index.

A `Zone` exposes one or more versioned Hunt definitions, and TASK-034 owns concrete records. Source
Pokémon locations/encounter tables do not become PokeNexus Zone/Hunt content by inference.

### 5.2 Availability and entry

Accepted baseline:

- availability is server-authoritative and versioned;
- allowed v1 gating inputs are explicit Player Level and explicit prerequisite-content completion when
  such a prerequisite exists in accepted content;
- no entry currency, stamina/energy or paid access rule exists by default;
- the client selects an available Zone/Hunt and a saved Team identifier, but does not select rules/data
  versions, seed, resolved eligibility or reward authority;
- one Player has at most one active Solo Hunt in baseline v1.

Explicit prerequisite completion is the normal sequencing tool. `Player Level` may be an additional
sparse/coarse readiness gate only when a specific Hunt/Zone has a distinct progression reason for it.
Content must not automatically require both mechanisms for every Zone, and TASK-034 Human sample
validation must surface expected F2P time-to-unlock for any configured threshold.

### 5.3 Hunt identity and pinned start snapshot

A started Hunt requires a canonical immutable gameplay identity distinct from SPEC-004's
`checkpoint_id`. The later persistence implementation may use UUIDv7, but this spec owns only the
semantic requirement for stable identity.

At start, the server resolves and pins at least:

- subject Player identity;
- selected Hunt/Zone content identity/version;
- ordered Team member instance identities;
- each member's Species/form, Level, selected Moves and selected Ability state;
- exact production executability/admission result;
- exact gameDataVersion and rulesVersion;
- deterministic policy identity/configuration;
- server-owned Hunt seed / RNG continuation state required by downstream deterministic orchestration.

Later edits to saved Team, Move loadouts or durable selected Ability do not rewrite this running Hunt.

### 5.3.1 Single-active-Hunt concurrency boundary

The accepted one-active-Solo-Hunt rule is an authoritative invariant rather than a UI convention:

- concurrent start attempts for one Player cannot commit two active Hunts;
- every logical `start`, `checkpoint`, `claim` and `stop/retreat` command has one stable
  server-validated **Hunt command correlation** distinct from `HuntId`, checkpoint identity and OCC
  `rowVersion`; a genuinely new player intent uses a new correlation;
- at first acceptance the server freezes the normalized command intent. For commands that advance Hunt
  time, that frozen intent includes one immutable authoritative **advancement cutoff / safe-boundary
  target** derived from the first accepted command occurrence; retry never substitutes a later `now`;
- retrying one logical start after response uncertainty must converge on the same accepted start or
  return its prior result, not mint a second Hunt;
- retrying an already-committed `checkpoint`, `claim` or `stop/retreat` correlation after response loss
  returns/reconstructs that command's prior accepted result and performs **no new Hunt advancement,
  reward resolution/application, terminal transition or recovery-boundary creation**;
- a new Hunt cannot become active until the prior Hunt has reached an accepted terminal/closed state;
- checkpoint/update/stop commands are bound to the exact Hunt identity and expected authoritative
  version; a stale computation cannot overwrite a newer checkpoint or terminal state;
- if the first execution of a correlated advancing command loses a pre-commit OCC race, retry reloads
  current authoritative Hunt state and recomputes the **same correlated command against the same frozen
  advancement cutoff / safe-boundary target** under the same pinned context rather than persisting stale
  simulated output or advancing to a newer wall-clock instant;
- if a distinct accepted command has already advanced authoritative Hunt state beyond that frozen
  target before the correlated command commits, the old correlation is deterministically
  superseded/conflicted with no additional advancement. Continuing from the newer state is a **new
  intent** and therefore requires a new command correlation;
- reusing one correlation with a different normalized command kind/target/intent is an integrity
  conflict and never grants authority to reinterpret the existing command;
- exact public idempotency keys, SQL uniqueness/locking and command payloads remain TASK-038-owned.

The Independent Auditor reviewed this boundary before Human acceptance because it introduces a durable
concurrency invariant even though SPEC-013 itself contains no SQL/runtime implementation.

### 5.4 Solo lineup

Accepted baseline: exactly one player Pokémon is active in each Solo Hunt Battle. Other eligible pinned
Team members are ordered Battle reserves in pinned Team order.

If the active Pokémon becomes KO **inside a non-terminal Battle**:

1. SPEC-003 first completes the current accepted consequence chain / same-time boundary and evaluates
   terminal outcome;
2. when the Battle remains non-terminal and a living non-active reserve exists, the Combat Engine is in
   mandatory `replacementPending` at the same combat timestamp;
3. the Solo Hunt policy supplies the first living eligible pinned Team reserve in Team order as the
   zero-combat-time forced-replacement selection;
4. normal Battle time/actions resume only after SPEC-003 reports no required replacement.

An active vacancy with a living reserve is therefore **not** a new Encounter/Battle and is not defeat.
The Hunt orchestrator does not bypass or reimplement SPEC-003 replacement semantics.

Separately, if a continuing Pokémon becomes KO **between Battles** because a cadence-scoped effect is
resolved during the inter-Battle gap, that Pokémon is ineligible for the next Battle. The next Battle
starts with the first living eligible pinned Team member in Team order. If none exists, do not create
another Battle and enter the no-living boundary.

No voluntary mid-Battle switch is introduced by SPEC-013.

### 5.4.1 Battle outcome → Encounter completion

SPEC-003 remains authoritative for `BattleEnded`; SPEC-013 only maps that terminal Battle outcome into
Solo Hunt Encounter lifecycle semantics. The pinned player Team belongs to the player Battle Side, and
the Encounter opponents belong to the opposing Encounter Battle Side(s).

Baseline v1 mapping is exact:

- an Encounter is **successfully completed** only when `BattleEnded` identifies the player Battle Side
  as the sole surviving/winning side. That transition records `completionKind = defeat`, consumes the
  matching `PendingEncounterSelection`, creates exactly one encounter-completion reward-source
  occurrence and may create the Option B post-encounter pending capture decision;
- if an opposing Encounter Battle Side wins, the Encounter is **not** successfully completed. It creates
  no encounter-completion RewardSourceKey, creates no pending capture decision and does not consume the
  `PendingEncounterSelection`. Because the player Battle Side then has no living battle-eligible
  Combatant under SPEC-003 survival semantics, section 5.7 terminalizes the Hunt at that same logical
  boundary;
- a SPEC-003 draw (zero surviving Battle Sides) is also **not** a successful Encounter completion. It
  creates no encounter-completion RewardSourceKey, creates no pending capture decision and does not
  consume the `PendingEncounterSelection`; section 5.7 terminalizes the Hunt at that same logical
  boundary because no living eligible player Pokémon remains;
- if a future Hunt definition uses more than one opposing Battle Side, successful completion still
  requires the player Battle Side to be the sole surviving/winning side.

This mapping does not synthesize or rewrite Combat Engine outcomes. It classifies the already-terminal
SPEC-003 result for Hunt orchestration, reward and capture purposes.

### 5.5 Cadence scope and Battle boundaries

One Hunt is one cadence-continuity scope. Inside that Hunt:

- current HP continues for surviving player Pokémon;
- actor GCD/per-Move readiness and ordered Move cursor continue as accepted by SPEC-003;
- cadence-scoped effects continue and may tick/expire/KO between encounters;
- Battle-local stat stages/effects reset according to SPEC-003;
- the Hunt orchestrator never reimplements damage, healing, effect-tick or KO math.

TASK-034/035 may define/configure a deterministic non-negative inter-Battle gap. Any such gap advances
logical time through the same game-core cadence evaluator before the next Battle.

### 5.6 Explicit healing/item-use boundary

Accepted v1 rule:

- no supported **healing/normal consumable** command resolves while a Battle is actively being simulated;
- a player may submit such a supported Hunt item command while a Battle is in progress, but the command is
  ordered for the **next deterministic inter-Battle command boundary** rather than inserted into the
  already-running Battle;
- authoritative Hunt advancement first resolves through that boundary, including the complete Battle
  outcome/replacement semantics and all cadence-effect ticks/expiries due before the boundary;
- only then may a supported item consequence apply at that logical time;
- normal healing can target only a living damaged pinned Team member and uses SPEC-007/SPEC-003 shared
  healing semantics;
- if the requested target is no longer eligible at the command boundary (for example it became KO or
  is already full HP), the command fails/no-ops under SPEC-007 and consumes nothing;
- item commands do not move logical time backward and cannot heal before an already-due DoT/KO;
- offline advancement never fabricates a Potion/capture command.

Capture-item debit is not governed by this healing window. Capture is a separate Hunt orchestration
command with its own lifecycle boundary in section 9; if accepted, its Ball debit and capture outcome
remain one atomic SPEC-007/TASK-036 consequence.

This keeps item use explicit and deterministic without requiring the player to hit a near-zero-width
timing window between automatic Battles. TASK-038 owns command idempotency/transport; TASK-035 owns the
deterministic orchestration that stops at the next eligible boundary and supplies the normalized
consequence to shared game-core.

### 5.7 No-living boundary

When no living eligible pinned Team member remains:

- future Battle creation is blocked;
- elapsed simulation cannot silently revive or auto-consume an item;
- because SPEC-007 defers revival, baseline v1 cannot present a functioning Revive command;
- the Hunt **automatically reaches its terminal no-living state at that exact logical boundary**; no
  additional player `terminate` command is required to close it, and the recovery anchor is that same
  boundary under section 6.1;
- after terminalization, the client may present return/navigation actions, and a new Hunt may later be
  started under fresh-Hunt rules once the accepted recovery/setup rule permits it.

If revival is desired later, SPEC-007/shared game-core semantics must be extended first through a
separate accepted Class A change.

## 6. Fresh-Hunt reset and retreat — accepted baseline

SPEC-003 requires fresh-Hunt reset/anti-abuse semantics to be explicit. Baseline v1 uses full-HP fresh
scope with retained earned rewards, no-free-reroll semantics and deterministic non-zero recovery/setup
downtime:

- explicit retreat/stop ends the current cadence scope at the next deterministic safe boundary;
- a newly started Hunt creates a fresh cadence scope;
- fresh start initializes pinned Team members at full HP, clears prior Hunt cadence effects and resets
  actor GCD/per-Move readiness and Move-sequence cursor, preserving the natural fresh-scope semantics
  and avoiding a new cross-Hunt persistent-HP/revive model;
- no prior incomplete **Battle runtime state** or partially executed capture attempt transfers to the
  new Hunt. However, the no-free-reroll rule deliberately preserves the unresolved same-Zone
  **selection outcome** (Species/content choice) across retreat/restart until that encounter selection
  reaches an accepted terminal resolution;
- completed durable reward sources remain governed by their immutable reward records.
- **no-free-reroll:** start/stop/restart does not itself advance or resample the next unresolved
  encounter selection for the same Zone. Encounter-selection progression advances only through the
  accepted deterministic encounter-resolution rule; a player cannot repeatedly start/cancel to fish
  for a different next target;
- **recovery/setup opportunity cost:** after ending a Hunt, a subsequent fresh Hunt has an explicit,
  visible, deterministic **non-zero recovery/setup interval** before productive encounter simulation
  resumes. The interval is not stamina, currency, item consumption or a paid gate; elapsed offline time
  counts normally. TASK-034 owns the concrete versioned value/content input and its Human sample gate,
  while SPEC-013 requires it to be non-zero for the baseline anti-reset contract;
- the recovery boundary is **Player-wide**, so switching Zones cannot bypass it. Its `recoveryReadyAt`
  is derived once from the authoritative terminal/retreat boundary plus the ending Hunt's pinned
  recovery duration and then preserved as authoritative state; later rule/content publication cannot
  retroactively lengthen/shorten an already-established recovery boundary;
- no paid bypass or hidden shortening of that recovery/setup interval is introduced by this baseline.

Under this baseline Potions are optional **run-extension** resources: spend one to preserve productive
Hunt continuity, or retreat for free and recover fully at the cost of explicit zero-reward downtime.
Earned rewards are never confiscated as the anti-reset mechanism. Durable HP/recovery outside Hunts is
not part of baseline v1 because it would require a separate persistent health/revival contract. The
concrete non-zero TASK-034 recovery value remains subject to its later Human sample gate.

### 6.1 Exact stop/retreat safe boundary

`stop/retreat` does not mean "finish the current Battle" and does not create a hidden forfeit rule
inside the Combat Engine. On first acceptance of the correlated stop command, the server freezes its
advancement cutoff `L` under section 5.3.1. The safe boundary is defined as follows:

1. deterministically replay/advance all already-authoritative Hunt policy/combat history **strictly
   before `L`**;
2. advance toward `L` using SPEC-003 semantics. If a due boundary at logical time `T <= L` makes the
   **Battle** terminal, Combat Engine advancement for that Battle stops at `T` as required by SPEC-003
   and section 5.4.1 maps that exact outcome. A player-side sole victory successfully completes the
   Encounter at `T`, preserves its deterministic encounter/reward-source evidence, applies the accepted
   inter-Battle policy, and — if the Hunt itself remains non-terminal and policy permits further
   productive time before `L` — may initialize the next Encounter/Battle and continue advancing toward
   the same frozen `L`. An opposing-side victory or draw creates no Encounter completion reward/capture,
   leaves the pending selection unconsumed and terminalizes the Hunt at `T` through section 5.7. If a
   due boundary instead leaves a non-terminal Battle in
   `replacementPending`, advancement stops at `T`; the Hunt policy must supply all mandatory
   zero-combat-time forced replacements in pinned Team order until the engine reaches a stable same-time
   state. Only when no mandatory replacement remains may advancement resume toward the same frozen `L`;
   repeat this orchestration as needed for every due boundary/Encounter before reaching `L`;
   if section 5.7's no-living condition terminalizes the Hunt at some `T < L`, the correlated stop
   converges on that already-terminal Hunt at `T` and performs no further advancement toward `L`;
3. once the command path reaches `L`, resolve any same-time boundary/replacement work required by
   SPEC-003, then emit no subsequent Move/time stimulus. In particular, a new automatic `useMove`
   ActionIntent is **not generated at `L` after the stop command has frozen that cutoff**; actions
   already accepted before the cutoff remain authoritative history;
4. a healing/normal-consumable command that was already accepted **before** the stop command and whose
   own frozen inter-Battle boundary was reached before the stop terminalization resolves in its existing
   authoritative order. A queued item boundary that lies after the stop boundary is canceled with no
   Inventory consumption. Equal-boundary command ordering follows server-authoritative command
   acceptance order and is replayed identically; a retry cannot reorder those commands;
5. if the current Encounter/Battle is still non-terminal after the processing above, stop/retreat
   abandons that incomplete Encounter at `L`: it produces no encounter-completion RewardSourceKey,
   creates no post-encounter pending capture decision and emits no synthetic Combat Engine
   victory/defeat;
6. the unresolved same-Zone pending selection token remains unconsumed for the no-free-reroll rule;
7. absent an earlier automatic terminal boundary, the Hunt cadence scope terminates exactly at `L`.
   `recoveryReadyAt` is anchored to the authoritative Hunt/session-time instant corresponding to the
   actual logical terminal boundary (`T` for earlier no-living, otherwise `L`) plus the ending Hunt's
   pinned recovery duration, **not** to a later claim/retry wall-clock receipt time.

Automatic Hunt termination because no living eligible Pokémon remains uses the exact logical instant
of that terminal/no-living boundary as the same recovery anchor. Therefore time already elapsed while
the player was offline may satisfy some or all recovery downtime before the next command. TASK-037/038
own the persisted representation/mapping between Hunt logical elapsed time and infrastructure instants;
they may not move the semantic boundary to claim time.

## 7. Encounter stream and production admission

### 7.1 Deterministic encounter identity

Each encounter in one Hunt requires a stable ordinal/identity under the Hunt plus deterministic
selection inputs. TASK-034 owns the tables; TASK-035 owns the selection algorithm/policy implementation.
Checkpoint/resume must continue the same stream rather than redraw already-resolved history.

For the reconciled no-free-reroll rule, selecting/observing an unresolved same-Zone encounter also
creates a stable server-authoritative **PendingEncounterSelection** token/outcome that is not advanced
or resampled merely by retreat, stop or restart. The token is immutable and binds at minimum:

- subject Player + `ZoneId`;
- exact Hunt/encounter-definition content identity/version and the deterministic selection
  provenance/cursor position required to prove the selected slot/outcome;
- exact selected Species/form + encounter Level and any other resolved encounter input that would
  otherwise be re-read from mutable current content;
- exact `gameDataVersion` / `rulesVersion` (and required immutable artifact/hash identities) under
  which selection/admission was validated.

A later Hunt in the same Zone with an unresolved token must start/continue under that token's exact
retained compatible content/data/rules context for the Hunt that consumes it. If that exact context is
unavailable or cannot be admitted, start **fails closed**; it does not reinterpret the token under
latest/current content, redraw a replacement or silently migrate it. The token is consumed only when
that selected encounter is successfully completed by player-side sole victory under section 5.4.1.
Opposing-side victory, draw, retreat or other incomplete termination leaves it unconsumed. Under
baseline Option B, successful completion occurs before any pending capture decision. Any future
operational migration/retirement of a stuck token requires a separately
accepted/versioned rule and is not a side effect of player restart. Exact storage/cursor shape remains
TASK-038 implementation scope.

### 7.2 Production playability admission

Before a Hunt content entry can become eligible for production, its proposed Species/form + encounter
Level must pass TASK-091 production evidence:

- at least one executable Move choice under the exact production context; and
- at least one progress/damage-capable executable choice at that admission Level.

A zero-progress-capable admission fails closed. TASK-033 does not choose the actual Species/Level
roster; TASK-034 publishes the content after this gate.

## 8. Reward lifecycle — accepted baseline

### 8.1 Source cadence

Each **successfully completed encounter** under section 5.4.1 is one deterministic logical reward source
occurrence. Encounter completion records an immutable `completionKind` owned by this lifecycle contract;
baseline value `defeat` means the Encounter opposition was defeated by a player-side sole victory under
the accepted Capture Option B flow. Its
stable source correlation must bind to at least Hunt identity + encounter ordinal and cannot be
recreated by retry, restart or checkpoint mechanics.

Exactly one encounter-completion RewardSourceKey may exist for one `EncounterId`, regardless of
completion kind. `completionKind` is part of the immutable source evidence/context so TASK-034 may
version outcome-specific reward envelopes if approved, but retry/capture cannot create both a defeat
source and a capture source for the same encounter.

Offline/in-memory simulation does not need to durably write a Reward Resolution at every encounter.
At checkpoint/claim, deterministic replay/continuation identifies all newly completed encounter-source
occurrences and submits their exact immutable envelopes/context through SPEC-009/TASK-024. Once a
Reward Resolution exists, retry uses it rather than re-resolving the source from mutable current
content.

The exact `sourceAuthority` identifier and persistence shape remain implementation/versioning details,
but must compose with SPEC-009.

### 8.2 Reward retention

Once an encounter is successfully completed and its reward entitlement/source is durably resolved,
later retreat, all-Team KO or Hunt termination does not erase that completed reward. An incomplete
encounter — including opposing-side victory, draw or retreat before player-side victory — yields no
encounter-completion reward.

Checkpoint/claim may batch application/replay work operationally, but it cannot re-roll a completed
encounter's immutable reward from newer/current content.

Therefore a terminal retreat/failure/stop path must first preserve
enough authoritative checkpoint/source evidence for every completed encounter reached before that
terminal boundary. Closing the Hunt cannot erase a completed-but-not-yet-applied reward occurrence.
The implementation may leave an already-durable Reward Resolution pending application/retry under
SPEC-009, but it may not convert "close Hunt" into silent reward loss or into a second reward roll.

### 8.3 XP allocation

Baseline v1 uses deterministic participant-based allocation:

- TASK-034 defines one fixed non-negative **encounter Pokémon-XP pool** for the encounter/content;
- the participant set is the distinct pinned player Pokémon that actually became active at least once
  during that encounter and whose **pinned Hunt Level** is below 200;
- unused reserves receive no Pokémon XP;
- if the participant set is empty because every actual participant is already at Level 200, no
  Pokémon-XP effect is emitted for that encounter;
- otherwise split the fixed pool by exact integer division across eligible participants; distribute
  any remainder one XP at a time in pinned Team order, preserving the exact total;
- the resulting per-Pokémon XP amounts are part of that encounter's immutable Reward Resolution. They
  are never recomputed/redistributed because a participant reaches Level 200 before delayed claim/
  application; SPEC-006 applies each frozen share and deterministically discards any portion above cap;
- Player XP remains a separate sibling effect when configured by Hunt content/rules;
- concrete XP pool amounts and item drops remain TASK-034 content.

This keeps participation meaningful, avoids last-hit/forced-replacement distortion and avoids
granting XP to unused bench members.

## 9. Capture handoff — accepted Option B baseline

Capture remains an explicit player command; offline policy does not invent attempts or consume a Ball.
Baseline v1 uses one bounded server-authoritative post-encounter pending capture decision:

- when an encounter reaches successful completion under section 5.4.1, it may create one explicit server-authoritative
  **post-encounter** pending capture decision from that exact completed encounter snapshot without
  consuming a Ball; this option intentionally makes capture a PokeNexus post-encounter mechanic rather
  than a Combat Engine action;
- at most **one** pending capture decision may exist for a Player in baseline v1; later eligible
  encounters do not silently replace it or debit inventory while it remains unresolved;
- the player later explicitly chooses `attempt` or `skip`; only an accepted `attempt` invokes
  TASK-036 and the SPEC-007 one-Ball debit rule;
- the pending identity must remain bound to the exact encounter/content context and cannot be changed
  or silently discarded by restart/retry/retreat; exact persistence/API representation belongs to
  TASK-038;
- this reduces offline collection loss but adds durable pending-decision state and can reduce capture
  throughput for players who stay offline for long periods.

The pending capture decision is created **after** the Encounter has already been successfully completed
with `completionKind = defeat`; resolving that pending capture therefore never creates a second
encounter-completion reward source.
The captured-Pokémon grant/capture result uses its own TASK-036 durable attempt/outcome correlation.

Under the accepted Option B flow TASK-036 owns:

- target eligibility beyond the lifecycle boundary;
- probability/RNG/outcome;
- captured-Pokémon construction/grant;
- atomic composition with the required one-unit capture-item debit.

Every accepted attempt must have one stable durable attempt identity; replay of that attempt cannot
consume a second Ball or produce a second outcome.

Baseline v1 permits **at most one accepted capture attempt per `EncounterId`**. This prevents zero-time
repeated Ball spam without inventing a capture action inside the universal
Combat Engine. A rejected/stale/ineligible command does not consume that opportunity or a Ball; one
accepted failed attempt consumes its Ball and closes capture eligibility for that EncounterId. This
attempt-count rule is authoritative for the accepted Option B baseline.

## 10. Checkpoint / offline continuation

The rules contract requires checkpoints to preserve enough state to resume exactly, including Hunt
identity, logical time, pinned content/rules identities, encounter continuation, Team/cadence state,
combat/policy RNG continuation and any other deterministic policy memory.

TASK-037 owns codec, safe offline horizon/caps, persistence/recompute mechanics and performance.
TASK-038 owns command/API orchestration. Neither may substitute latest rules/content for the pinned
context.

An explicit player command issued after time has elapsed cannot be inserted retroactively into already
simulated logical history. On first acceptance, the server establishes that logical command's stable
correlation and freezes its authoritative advancement cutoff/safe-boundary target. The command path
advances only to that fixed target, then applies the command if still eligible.

Response-loss retry of the same accepted correlation replays the prior committed result without moving
the cutoff forward. A pre-commit stale/OCC retry may reload and deterministically recompute, but only
against the same fixed target; it cannot reinterpret the retry as "advance to current time now". If
another accepted command already moved authoritative state beyond the fixed target before this command
committed, the old correlation resolves as superseded/conflicted with no new advancement and the caller
must express any later advancement as a new logical command/correlation.

If a stop/retreat command reaches a terminal boundary after one or more new encounters completed, the
same command path must preserve those deterministic encounter/source identities before the terminal
Hunt state can make the live checkpoint unreachable. Exact transaction decomposition remains
TASK-038-owned and is subject to the TASK-033 Independent Auditor gate.

## 11. Reset/reroll abuse principles

Under the accepted fresh-Hunt recovery rule:

- starting/canceling a Hunt cannot itself mint XP/items/capture outcomes;
- the client never chooses the authoritative seed or encounter ordinal;
- retries/checkpoints reuse the same Hunt/encounter identities rather than drawing new outcomes;
- already-completed reward/capture correlations cannot be replayed for additional effects;
- no hidden entry fee, stamina sink or cooldown may be added merely as an anti-abuse implementation
  shortcut without Human-approved rules.

The section 6 **no-free-reroll** rule is authoritative: stop/restart alone never resamples the next
unresolved same-Zone selection.

## 12. Downstream ownership

- TASK-034: concrete World/Map/Zone/Hunt definitions, encounter tables, level bands, reward amounts and
  item-drop content under immutable publication/versioning.
- TASK-035: event-driven encounter loop, deterministic auto-Move policy and Combat Engine orchestration.
- TASK-036: capture and reward resolution from accepted Hunt sources.
- TASK-037: offline/checkpoint/claim persistence and advancement.
- TASK-038: Hunt API/persistence command orchestration.
- TASK-039/040: player-facing Card/Visual rendering of the same authoritative states.
- TASK-041: end-to-end, offline and performance qualification.

## 13. Consultation questions

GSC and PXE must assess at minimum:

1. full-HP fresh Hunt versus persistent damage/another recovery model;
2. whether completed encounter rewards survive retreat/failure;
3. decisive-active-only Pokémon XP versus participation/share alternatives;
4. Player Level/prerequisite Zone gates and grind/content-longevity implications;
5. exact capture-opportunity timing and its impact on Ball scarcity/offline fairness;
6. one-active-Hunt limit and offline/session expectations;
7. degenerate reset/reroll loops and whether any non-monetized friction is actually needed;
8. effects on F2P viability, player trust, reward pressure and future PvP fairness.

PM/QA additionally validated the architecture choice between a minimal Zone-addressed World/Map surface
and a new canonical Map/Region identity; the accepted baseline is the minimal Zone-addressed surface.

## 13.1 Consultation evidence and reconciliation

Required **GSC** advisory on the corrected same-Battle replacement snapshot returned **ADVISORY
CONCERN**. It accepted the minimal Zone-addressed topology, one active Hunt, explicit Potion boundary,
no revival, completed-reward retention, no automatic offline item/capture use and TASK-091 production
admission. Its material concerns were free-heal/reset+r​​eroll dominance, decisive-active-only XP,
capture timing/offline asymmetry and over-reliance on Player-Level gates.

Required **PXE** advisory independently returned **ADVISORY CONCERN**. It converged on one active Hunt,
completed-reward retention, no stamina/fee/currency sink, explicit-only Potion/capture use, the
SPEC-007 one-Ball rule and minimal ZoneId topology. It independently rejected decisive-active-only XP,
warned against double-gating/grind walls, and preferred a bounded pending capture-decision model unless
the Human Owner explicitly accepts active/offline capture asymmetry.

The accepted reconciliation is:

1. same-Battle KO/replacement wording was corrected to exact SPEC-003 `replacementPending` semantics;
2. completed encounter rewards are retained; terminal closure must preserve their source evidence;
3. decisive-active-only XP was replaced by deterministic actual-participant splitting;
4. full-HP fresh Hunt uses explicit non-zero recovery/setup downtime plus no-free-reroll semantics; no
   fee/stamina/reward forfeiture is used as the anti-reset mechanism;
5. prerequisite completion is the default sequencing tool; Player Level is optional coarse readiness,
   not an automatic second gate;
6. Capture **Option B** is accepted: one bounded post-encounter pending capture decision, with no
   automatic Ball debit and no second encounter-completion reward source;
7. minimal Zone-addressed World/Map identity is accepted; canonical Map/Region identity requires a
   separate accepted contract if later content proves a real persistent identity requirement.

The consultant concerns are recorded as decision evidence. A narrow advisory delta re-gate on the exact
reconciled snapshot returned **GSC ADVISORY PASS** and **PXE ADVISORY PASS**, both with no remaining
consultant correction; subsequent QA and Independent Auditor gates were also clean before Human
acceptance.

## 14. Accepted Human Owner decisions

On 2026-09-23 the Human Owner accepted the complete SPEC-013 baseline, including these material
player-facing rules:

1. **World/Map identity:** minimal Zone-addressed navigation surface; a canonical Map/Region identity is
   introduced only through a later accepted contract if concrete content proves it necessary.
2. **Concurrent activity:** at most **one active Solo Hunt per Player**, with stable correlated
   start/checkpoint/claim/stop commands and no parallel offline farming Hunts.
3. **Recovery/reset:** full HP/clean fresh scope + version-bound no-free-reroll + Player-wide non-zero
   recovery/setup downtime. TASK-034 later Human-samples the concrete non-zero duration.
4. **Retreat/stop:** available without fee/stamina/reward confiscation at the exact section 6.1 safe
   boundary; incomplete Encounter gets no completion reward and recovery anchors at that terminal
   logical boundary.
5. **Reward retention:** completed Encounter rewards survive retreat/failure; incomplete Encounter
   rewards nothing.
6. **Pokémon XP:** one fixed Encounter XP pool split deterministically among actual participants whose
   pinned Hunt Level is below 200; unused reserves receive no share and frozen shares are not later
   redistributed.
7. **Zone/Hunt gates:** prerequisite completion by default; Player Level only for explicit coarse
   readiness, avoiding automatic double-gates.
8. **Capture mode:** **Option B**, one bounded post-encounter pending capture decision. It carries exact
   encounter/content context, creates no second encounter reward source and never consumes a Ball until
   the player explicitly attempts capture.
9. **Capture attempt count:** at most one accepted capture attempt per `EncounterId`.
   Rejected/stale/ineligible commands consume neither Ball nor opportunity; one accepted failed attempt
   consumes one Ball and closes capture eligibility.

Other mechanics in the document that are direct compositions of already-APPROVED upstream contracts
(for example SPEC-003 same-Battle forced replacement and SPEC-007 no revival/no automatic item use) are
also part of the accepted SPEC-013 baseline.

## 15. Acceptance evidence and corrective reaffirmation

The Human Owner accepted the prior pre-transition DRAFT snapshot on 2026-09-23; its SHA-256 was
`3EFF103B60555F510FF372C39828553847EB6DE1B6C794067FE3F6822941E2D0`. That acceptance included Capture
Option B and the one-accepted-attempt-per-`EncounterId` rule after GSC/PXE **ADVISORY PASS**, independent
QA **READY 0/0/0/0** and Independent Auditor **PASS 0/0/0/0**.

A post-acceptance exact-current audit found one P1 ambiguity: SPEC-003 permits player-side victory,
opposing-side victory and draw, while the accepted draft did not normatively say which terminal Battle
outcomes count as successful Encounter completion for reward, capture and `PendingEncounterSelection`
consumption. Section 5.4.1 is the corrective mapping. The corrected semantic snapshot then received
fresh independent QA **READY 0/0/0/0**, Independent Auditor **PASS 0/0/0/0**, GSC **ADVISORY PASS** and
PXE **ADVISORY PASS**, all with no remaining correction required.

On 2026-09-23 the Human Owner explicitly reaffirmed the corrective Battle-outcome → Encounter-completion
mapping. SPEC-013 is therefore **APPROVED** with section 5.4.1 as normative baseline: only player-side
sole victory successfully completes an Encounter; opposing-side victory/draw grant no completion
reward/capture, preserve `PendingEncounterSelection` and terminalize the Hunt through no-living at that
same logical boundary.

Repository/history completion was separately authorized by the Human Owner on 2026-09-23; that separate
authorization is recorded in TASK-033 and is not implied by either prior semantic acceptance or
corrective re-acceptance.
