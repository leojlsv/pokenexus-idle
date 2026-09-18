# SPEC-005 — Pokémon Instance, Collection & Team v1

- Status: APPROVED
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Related ADRs:
  - ADR-004 — Universal Deterministic Combat Engine Architecture
  - ADR-005 — Persistence & Data Access Strategy
- Related tasks:
  - TASK-019 — Pokémon Instance / Collection / Team Spec
  - TASK-020 — Collection & Team Domain/Persistence Implementation
  - TASK-021 — XP / Level / Progression Rules Spec
  - TASK-022 — Inventory / Item Model Spec
  - TASK-025 — Player State API Integration

## 1. Problem

PokeNexus already has durable Player identity, PostgreSQL ownership foundations, Pokémon Instance
rows, saved Team aggregates and deterministic combat rules. The intentionally permissive persistence
baseline does not yet define the product rules required to persist and mutate selected Ability,
ordered Move Loadout or saved Team slots.

Without one accepted contract, later implementation could independently guess Team size, Team order,
duplicate membership, whether one Pokémon can appear in several presets, how loadout edits interact
with running Hunts, or whether arbitrary client MoveIds are legal. Those guesses would leak product
semantics into migrations, APIs and runtime behavior.

## 2. Goals

This specification defines the v1 contract for:

- private player Collection identity/ownership semantics;
- baseline mutable/immutable Pokémon Instance state boundaries;
- selected Ability persistence and eligibility;
- persistent ordered Move Loadout structure and mutation boundary;
- saved Pokémon Team ordering, cardinality, duplicate/reuse and mutation rules;
- optimistic-concurrency and snapshot/pinning expectations for TASK-020+;
- the exact relational invariants later forward migrations must be able to enforce.

## 3. Non-goals

This specification does not define:

- capture probability, encounter generation or Pokémon grant/reward sources;
- XP curves/sources, level-up commands or post-Level-200 progression;
- evolution, breeding, EVs, Natures, nicknames or release;
- Move acquisition through TMs/items/tutors/egg/evolution/transfer;
- Ability distribution probabilities or Ability-changing items;
- public/social Collection or Team visibility;
- Team display names/icons/favorites;
- mode-specific Team admission, active capacity or battle lineup policy;
- Hunt/PvP/Gym/Duo/World Boss orchestration;
- executable MoveRule/AbilityRule combat behavior;
- public HTTP payloads;
- trading/transfer/economy rules.

## 4. Normative vocabulary and authority

SPEC-001 remains authoritative for vocabulary:

- `PokemonInstanceId` identifies one durable owned Pokémon Instance;
- `SpeciesId`, `MoveId` and `AbilityId` are immutable static-definition identities;
- `TeamId` identifies a persisted saved Pokémon Team;
- a Pokémon Team is not a Player Party or BattleSide;
- Combatant/Lineup are battle-scoped concepts and are not persistent Team identity.

Client-supplied identifiers are candidate command data only. Ownership, eligibility and accepted
mutation are server-authoritative.

## 5. Private Collection v1

A player's private **Collection** is the set of Pokémon Instances whose authoritative
`ownerPlayerId` equals that PlayerId.

There is no separate `CollectionId` or Collection aggregate row in v1. Collection membership is
derived from Pokémon ownership.

TASK-019 does not introduce a collection-capacity limit. Pagination/query limits are API/operational
concerns and are not ownership semantics.

No public/social visibility is implied. TASK-074 or another accepted product contract must define
public profile/collection exposure.

## 6. Pokémon Instance state v1

### 6.1 Durable identity and baseline facts

A Pokémon Instance persists:

- `PokemonInstanceId`;
- authoritative `ownerPlayerId`;
- `SpeciesId`;
- Level in the accepted `1..200` domain;
- six IVs, each `0..31`;
- zero-or-one selected Ability;
- ordered selected Move Loadout;
- optimistic-concurrency `rowVersion`.

Derived combat stats are never persisted as authoritative truth.

### 6.2 Mutation ownership

TASK-020 does not provide normal mutation for:

- `PokemonInstanceId`;
- `ownerPlayerId`;
- `SpeciesId`;
- IVs.

Future transfer/trade/evolution mechanics may introduce separately accepted changes.

Level remains mutable domain state, but the commands/sources/XP curve that change Level belong to
TASK-021+. TASK-020 must not invent level progression merely because the column exists.

## 7. Selected Ability v1

### 7.1 Cardinality

A Pokémon Instance has:

```text
selectedAbilityId: AbilityId | null
```

Zero-or-one is the baseline v1 rule.

A null value means the instance has no selected active combat Ability. Null is not, by itself, an
invalid Pokémon Instance.

### 7.2 Eligibility

A non-null selected Ability must have been validated by authoritative server logic as an eligible
Ability for that Species under the accepted static-data selection context.

Eligibility is based on canonical `AbilityId` assignments from SPEC-002. Display names, source prose
and PokémonDB descriptive text never grant eligibility or executable behavior.

The authoritative creation/acquisition source owns *which* eligible Ability is initially assigned.
SPEC-005 does not invent random weighting between normal/alternate/hidden source slots.

### 7.3 Mutation

Ordinary player editing cannot change/reroll `selectedAbilityId` in v1.

A future Ability Capsule/Patch-equivalent, evolution rule or other Ability-changing mechanic requires
an explicitly accepted owning rule before it can mutate this field.

A later data correction must not silently reroll a persisted selected Ability on read.

Eligibility is therefore checked when an Ability assignment/mutation is authoritatively accepted.
Once accepted, that persisted selection is durable instance state and is not automatically cleared,
rerolled or replaced merely because a later active static-data version changes Species Ability
eligibility. New assignments/mutations use the then-authoritative eligibility context. A Battle still
must resolve the persisted Ability definition/rule under its pinned context and fails closed where
SPEC-003 requires it.

### 7.4 Combat interaction

Executable Ability behavior remains SPEC-003/rulesVersion authority.

- null selected Ability may produce a Combatant with no active combat Ability when the owning mode
  permits it;
- non-null selected Ability does not imply executable behavior exists;
- if a Combatant Snapshot intends that Ability to participate and no compatible AbilityRule resolves
  under the pinned rulesVersion, SPEC-003 fails battle initialization closed.

## 8. Persistent Move Loadout v1

### 8.1 Shape

A persisted player Pokémon Move Loadout is an ordered dense sequence of:

```text
1..4 distinct MoveId
```

Normative invariants:

- minimum populated length: 1;
- maximum populated length: 4;
- slots are contiguous `1..N`; sparse holes are invalid;
- one `MoveId` may appear at most once in the loadout;
- order is player/content-defined and materially significant under SPEC-003's sequential automatic
  action policy.

A zero-move persistent state is not a valid selected Move Loadout. If an instance has not yet been
assigned a valid loadout during staged migration/bootstrap, it is not battle-eligible until one is
authoritatively established.

### 8.2 Selected loadout is not a learned-move inventory

The selected `1..4` list does not represent every Move the Pokémon knows, has unlocked or could
learn.

Move acquisition/learned-set semantics are separate product rules. SPEC-005 does not treat the raw
SPEC-002 learnset as automatic player ownership of every referenced Move.

### 8.3 Mutation authority

A player-facing loadout mutation is valid only when every selected MoveId belongs to a
server-authoritative eligible-move set produced under an accepted owning progression/item/content
rule.

Therefore:

- a client cannot make an arbitrary Move legal by sending its MoveId;
- TASK-020 may implement structural storage/domain invariants;
- TASK-020 must not expose unrestricted player loadout selection in the absence of an accepted
  eligible-move source;
- TASK-025 may expose loadout mutation only when its dependencies provide that authoritative source.

Mutation replaces the complete ordered loadout atomically under expected Pokémon `rowVersion`.
Fine-grained UI edits compile to this semantic replacement.

Move eligibility is likewise checked when a loadout mutation is authoritatively accepted. A later
static learnset/data correction does not silently remove or reorder an already accepted persisted
Move Loadout. New player-facing mutations use the then-authoritative eligible-move source. A running
or fresh Battle still requires every selected Move to resolve under its own pinned
`{ gameDataVersion, rulesVersion }` as required by SPEC-003; inability to resolve remains fail-closed
rather than an implicit persistence rewrite.

### 8.4 Running-scope immutability

At Battle/Hunt/cadence-scope initialization, the owning orchestrator resolves and pins the ordered
loadout used by that scope.

A later persistent loadout edit:

- does not rewrite the already-pinned Move order;
- does not rewrite cooldown mapping/cursor for the running scope;
- becomes visible only to a later fresh scope unless a future mode spec explicitly defines another
  versioned rule.

This preserves SPEC-003.

## 9. Saved Pokémon Team v1

### 9.1 Cardinality and slots

A saved Team contains an ordered dense roster of:

```text
0..6 PokemonInstanceId
```

Rules:

- slot numbers are `1..N` with no holes;
- maximum saved roster size is six;
- an empty Team is valid as a saved draft/edit state;
- empty Team is not battle/mode eligible;
- mode rules may impose stricter admission requirements but may not silently expand the saved Team
  above six.

### 9.2 Ownership and duplicates

Every Team member must be owned by the same authoritative Player who owns the Team.

Within one Team:

- the same `PokemonInstanceId` may appear at most once.

Across saved Teams:

- the same Pokémon Instance may appear in any number of Teams owned by the same Player.

Saved Team membership is therefore a preset/reference, not an exclusive lock.

SPEC-005 defines no domain/game-rule maximum number of saved Teams per Player. That count is not a
combat or ownership invariant. Before player-facing Team creation is exposed, TASK-025 (or an earlier
explicit API/operational contract) must define any bounded service quota/rate limit needed to prevent
unbounded storage abuse. TASK-020 must not invent a hidden product cap in persistence.

There is no globally persisted "active Team" in baseline v1. An authoritative mode/session command
selects a TeamId/current resolved roster when that mode needs one, then pins its own snapshot under
section 10. UI convenience selection does not become server authority by implication.

### 9.3 Order semantics

Saved Team order is durable player preference and must be preserved exactly.

It is not itself Combat Engine lineup authority. An owning mode spec decides how Team order maps to
active/reserve Combatants, selection priority or replacement behavior.

Infrastructure order is never gameplay order. Implementations must not infer Team order from:

- UUID/opaque-ID sort;
- row insertion order;
- `created_at`;
- database physical order.

### 9.4 Mutation and optimistic concurrency

The canonical Team roster mutation is:

```text
replaceRoster(
  teamId,
  expectedRowVersion,
  orderedPokemonInstanceIds // array length 0..6
)
```

A successful mutation:

1. validates Team ownership;
2. validates every Pokémon ownership;
3. validates cardinality, dense order and within-Team uniqueness;
4. replaces/reorders membership rows;
5. increments the Team aggregate `rowVersion`;
6. commits membership mutation and version change in one transaction.

If `expectedRowVersion` is stale, the command fails closed and must not partially mutate members.

Add/remove/reorder UI operations may compile to this aggregate replacement; they do not define
separate weaker concurrency semantics.

### 9.5 Team lifecycle

Creating an empty saved Team is allowed.

Deleting a Team is an OCC-guarded aggregate command requiring authoritative ownership plus the
expected Team `rowVersion`. It removes membership references and the Team row atomically. A stale
expected version fails closed with no partial deletion. Deleting a saved Team does not delete
Pokémon Instances and does not retroactively invalidate an already-pinned gameplay snapshot.

Pokémon release/transfer is not defined here. A future owning rule that removes or transfers a
Pokémon must define how existing Team references are resolved atomically.

## 10. Snapshot and mode boundary

A saved Team is mutable persistent configuration. A running authoritative gameplay scope uses an
immutable resolved snapshot appropriate to that scope.

After a Hunt/Battle/cadence scope is initialized, later edits to:

- saved Team membership/order;
- selected Move Loadout;
- selected Ability;

must not retroactively mutate the already-pinned scope.

The mode/orchestrator owns when a fresh scope begins and which current persistent configuration is
resolved into it.

## 11. Persistence requirements for TASK-020

TASK-020 must implement forward persistence compatible with SPEC-004 and these rules.

### 11.1 Ability

Persist nullable `selected_ability_id` on the Pokémon aggregate using the accepted lossless opaque
ID codec/domain representation. Static eligibility is application/domain validated because canonical
static game definitions are not relational FK rows in PostgreSQL v1.

### 11.2 Move Loadout slots

Persist explicit slot/order, not opaque-ID ordering.

The relational model must be able to enforce:

- slot integer `1..4`;
- one row per `(pokemonInstanceId, slot)`;
- no duplicate MoveId within one Pokémon loadout;
- same-owner relation where ownership columns are present;
- child-row replacement + Pokémon `rowVersion` increment in one transaction.

### 11.3 Team slots

Extend saved Team membership so the relational model can enforce:

- slot integer `1..6`;
- one row per `(teamId, slot)`;
- no duplicate Pokémon Instance within one Team;
- same-player ownership using SPEC-004's composite ownership FKs;
- membership replacement + Team `rowVersion` increment in one transaction.

### 11.4 Existing unordered Team rows

SPEC-004 intentionally created Team membership without order.

A forward migration must **not** fabricate order by sorting existing rows using UUIDs, timestamps or
physical/insertion order.

TASK-020 must either:

- prove the unordered membership table contains no rows in the governed migration target before
  enforcing slot semantics; or
- return for an explicit reviewed data-conversion decision.

The migration must fail closed rather than invent gameplay ordering.

## 12. Edge cases

- Team with zero members: valid saved draft, invalid gameplay admission.
- Team with seven members: invalid.
- Team with repeated Pokémon Instance: invalid.
- Same Pokémon in Team A and Team B for same owner: valid.
- Pokémon from another owner in Team: invalid even if the client knows its ID.
- Sparse Team slots `1,3`: invalid.
- Loadout `[MoveA, MoveA]`: invalid.
- Loadout with five Moves: invalid.
- Loadout with zero Moves: invalid selected loadout / not battle-eligible.
- Loadout edit during running Hunt: persistent mutation may succeed, but running pinned scope remains
  unchanged.
- Later static eligibility/learnset correction: already accepted persisted Ability/loadout state is
  not silently rerolled or deleted; new mutations use current authoritative eligibility and Battle
  resolution remains pinned/fail-closed.
- null selected Ability: valid persistent state; combat behavior follows section 7.4.
- non-null selected Ability with no executable AbilityRule in pinned rulesVersion: battle setup fails
  closed when that Ability is intended to participate.
- stale Team/Pokémon rowVersion: no partial mutation.
- stale Team rowVersion on delete: no membership or Team row is deleted.
- future transfer/release of a Pokémon referenced by Teams: unsupported until an owning rule defines
  atomic reference handling.

## 13. Acceptance

SPEC-005 was accepted in full by the Human Owner on 2026-09-17 after independent QA and the required
Independent Auditor concurrency/integrity review cleared the exact DRAFT snapshot. The accepted rules
include:

- private Collection is owner-derived with no separate CollectionId and no v1 domain capacity;
- zero-or-one selected Ability with no normal v1 reroll;
- ordered dense `1..4` persistent Move Loadout and external authoritative move-eligibility source;
- saved Team maximum six;
- empty saved Teams allowed as drafts;
- no duplicate Pokémon inside one Team;
- same Pokémon reusable across multiple saved Teams;
- canonical full-roster OCC replacement;
- OCC-guarded atomic Team deletion;
- no domain-level saved-Team-count cap and no globally persisted active Team; player-facing quota
  belongs to an API/operational contract;
- saved Team order is persistent preference, while each owning mode resolves/pins its own gameplay
  snapshot and lineup semantics;
- accepted Ability/loadout selections are not silently rewritten by later static eligibility/data
  corrections;
- existing unordered Team membership receives no fabricated gameplay order; migration requires
  empty-table proof or a separately reviewed conversion decision;
- no baseline Team display-name field.

## 14. Accepted decisions

The following decisions are frozen for SPEC-005 v1 by the Human Owner acceptance on 2026-09-17:

1. private Collection is owner-derived; there is no separate CollectionId or v1 domain capacity.
2. `selectedAbilityId` is nullable rather than mandatory.
3. selected Ability has no ordinary player reroll/change in v1.
4. persistent Move Loadout requires `1..4` selected Moves and has no empty valid loadout.
5. Move eligibility comes from a separate authoritative learned/available-move source; raw client
   MoveIds and raw static learnset presence are insufficient.
6. saved Team maximum is six.
7. empty saved Team is allowed as a draft/edit state.
8. duplicate Pokémon references inside one Team are prohibited.
9. one Pokémon Instance may be reused across multiple saved Teams.
10. Team mutation uses full-roster atomic replacement under Team rowVersion.
11. Team deletion requires expected rowVersion and is aggregate-atomic.
12. accepted persisted Ability/loadout selections are not silently invalidated/replaced solely by a
    later static eligibility/data correction; new mutations use current authoritative eligibility.
13. there is no domain-level maximum saved-Team count; TASK-025/API operations must define any
    player-facing storage quota before exposing creation.
14. there is no globally persisted active Team; modes select/pin Team snapshots explicitly.
15. saved Team order is persistent preference, not direct Combat Engine lineup authority; modes own
    snapshot/lineup resolution.
16. existing unordered Team membership is not assigned gameplay order by UUID, timestamp or physical
    row order; migration requires empty-table proof or a separately reviewed conversion decision.
17. baseline saved Team has no display-name field.
