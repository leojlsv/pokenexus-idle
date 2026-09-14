# SPEC-001 — Core Domain Vocabulary & Model

- Status: APPROVED
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Related ADRs:
  - `docs/decisions/ADR-001-runtime-and-language.md`
  - `docs/decisions/ADR-002-solo-hunts.md`
  - `docs/decisions/ADR-003-hub-and-duo-realtime.md`
- Related tasks:
  - `TASK-004` — this specification
  - `TASK-005` — Core Domain Type Skeleton
  - `TASK-006` — Static Game Data Schema & Rules Versioning
  - `TASK-007` — Universal Combat Engine Architecture
  - `TASK-008` — Combat Rules Spec v1
  - `TASK-019` — Pokémon Instance & Team Model Spec
  - `TASK-022` — Inventory / Item Model Spec
  - `TASK-033` — PvE World/Map, Zone & Solo Hunt Rules/Lifecycle Spec
  - `TASK-034` — PvE World/Zone, Encounter & Hunt Data

## Problem

PokeNexus Idle needs one vocabulary for domain concepts before game types, static data, persistence, combat and protocol contracts are implemented.

Terms such as Pokémon, item, team, party, zone, encounter, battle, hunt, status and stat can otherwise mean different things in different packages. That ambiguity would make deterministic replay, persistence boundaries and later PvE/multiplayer features harder to reason about.

This specification defines what the core concepts mean and how their identities relate. It intentionally does not define combat math, balance values, database tables or wire formats.

## Goals

- establish canonical names for domain entities and identifiers;
- separate static definitions from player-owned instances and battle-scoped state;
- make identity/version boundaries explicit enough for later deterministic/replayable systems;
- prevent overloaded use of Item, Team, Party, Zone, Hunt, Battle and Encounter;
- give downstream domain/data/combat/inventory/PvE tasks a shared language without pre-implementing their decisions;
- preserve the accepted architecture: pure shared domain types and deterministic game-core logic with no infrastructure dependencies.

## Non-goals

- choosing damage, accuracy, critical-hit, speed/timing, cooldown or victory formulas;
- defining concrete persistence tables or API/WebSocket payloads;
- fixing final team size, move-slot count, level cap, IV range or other balance limits;
- defining the full static-data schema or type chart;
- defining Hunt, PvP, Gym or World Boss mode-specific orchestration;
- implementing TypeScript types.

## 1. Naming and identity rules

### 1.1 IDs are authoritative; names are presentation

Every domain entity that must be referenced across state transitions has an opaque stable identifier.

Display names, localized strings, Pokédex numbers, array indexes and UI positions are never authoritative identity unless a later accepted specification explicitly promotes one of them to a domain key.

Canonical identifier names use the `<Concept>Id` form, including:

- `SpeciesId`
- `PokemonInstanceId`
- `CombatantId`
- `MoveId`
- `TypeId`
- `AbilityId`
- `ItemId`
- `EffectId`
- `TeamId`
- `PlayerId`
- `EncounterDefinitionId`
- `EncounterId`
- `BattleId`
- `ZoneId`

The concrete representation of an ID is owned by TASK-005. This specification only requires semantic separation between ID kinds.

### 1.2 Static definition vs persistent instance vs runtime state

Three identity layers must remain distinct:

1. **Definition identity** — immutable catalog/content identity such as `SpeciesId`, `MoveId`, `TypeId`, `AbilityId`, `ItemId` or `ZoneId`.
2. **Persistent instance identity** — a durable owned entity such as a particular captured Pokémon identified by `PokemonInstanceId`.
3. **Battle/runtime identity** — an identity scoped to a deterministic battle/simulation such as `CombatantId`.

Two owned Pokémon of the same species share a `SpeciesId` but never a `PokemonInstanceId`. The same owned Pokémon may participate in multiple battles and receive a different `CombatantId` in each battle.

### 1.3 Versioned static identity

Static definitions used to produce authoritative/replayable outcomes are interpreted within an immutable published game-data/rules identity.

TASK-006 owns the concrete version/checksum/provenance schema. The invariant established here is that a bare `MoveId` or `SpeciesId` is not sufficient to reinterpret a historical authoritative outcome after static content changes.

PokémonDB (`pokemondb.net`) is the selected primary external factual source for Pokémon reference data that PokeNexus chooses to ingest. The ingestion is DATA-only: images, sprites, other assets, editorial prose and site layout/styling are outside the data contract. Source HTML may exist only as transient parser/cache input and is never canonical game data. The external website is not a runtime dependency and is not itself the authoritative game-state source. Only locally extracted, validated and immutable published data under the TASK-006 version/provenance model may be consumed by deterministic gameplay, replay, persistence or reward logic. Canonical Pokémon reference fields must not silently fall back to a different factual provider when PokémonDB is missing, ambiguous or temporarily unavailable.

## 2. Pokémon vocabulary

### Species

A **Species** is a static game-data definition describing the shared identity and baseline properties of a Pokémon kind.

Species is not owned by a player and is not mutable player state.

Canonical identity: `SpeciesId`.

### Forms and variants

A **Species Definition** may represent the base form or an accepted alternate/regional/
other form when PokeNexus needs that form to be independently addressable as static game
data. `SpeciesId` identifies the exact PokeNexus definition, not merely a National Pokédex
number.

National Dex number, source slug/name and source form/variant labels are factual/reference
attributes and must not be treated as canonical identity. When two accepted forms require
different static facts or independent content references, each published form definition
must have a distinct `SpeciesId`. TASK-004 does not introduce a separate `FormId`.

TASK-006 owns normalization from PokémonDB species/form labels and any base-species grouping
relationship. Generation/game qualifiers and historical facts are versioned source/data
dimensions, not automatic new identities; deterministic runtime interpretation always uses
the accepted definition under the pinned `gameDataVersion`/provenance model.

### Pokémon Instance

A **Pokémon Instance** is one persistent individual Pokémon owned by or otherwise durably associated with a player/account domain.

Canonical identity: `PokemonInstanceId`.

A Pokémon Instance references one Species definition and may carry instance-specific state such as progression, raw individual stat inputs, learned/selected moves, selected Ability or future customization fields when those concepts are approved by their owning tasks.

The persistence representation is not defined here.

### Combatant

A **Combatant** is one battle-scoped participant interpreted by the universal Combat Engine.

Canonical identity: `CombatantId`, unique within the battle identity domain.

A Combatant may originate from:

- a player-owned Pokémon Instance;
- a deterministic encounter-generated opponent;
- a trainer/challenge definition;
- a boss or other future content source.

Therefore a Combatant is not required to have a `PokemonInstanceId`.

### Combatant Snapshot

A **Combatant Snapshot** is the immutable starting input used to instantiate battle state for one Combatant under a pinned rules/game-data identity.

It contains or references the resolved inputs needed by combat, but it is not persistent ownership truth and must not be mutated as the battle advances.

### Combatant State

**Combatant State** is the mutable state of one Combatant during a battle: current HP and future combat-local state such as active effects, resource/cooldown state or other accepted combat fields.

The Combat Engine owns authoritative mutation of Combatant State once TASK-007/008 define that contract.

## 3. Stats and individual values

### Canonical stat keys

The shared vocabulary uses exactly these six stat keys:

| Key | Name |
|---|---|
| `hp` | HP |
| `atk` | Attack |
| `def` | Defense |
| `spa` | Special Attack |
| `spd` | Special Defense |
| `spe` | Speed |

These names establish vocabulary only. TASK-008 owns whether and how each stat contributes to combat math, timing or action resolution.

### Stat Block

A **Stat Block** is a complete mapping containing all six canonical stat keys exactly once.

Partial stat objects must use a different explicit concept/name so they cannot be mistaken for a complete Stat Block.

### Base Stats

**Base Stats** are species/static-data inputs. They belong to versioned game data, not to the persistent identity of an owned Pokémon.

### Individual Values (IVs)

**Individual Values (IVs)** are instance-specific raw inputs keyed by the same six canonical stat keys.

The numeric domain/range and their contribution to derived stats are deferred to TASK-006/TASK-008.

### Derived Stats

**Derived Stats** are authoritative resolved stat values produced from accepted rules and inputs such as species data, progression and IVs.

The exact formula and rounding policy are owned by TASK-008.

### Quality / rating

If the product exposes a **Quality**, **rating**, tier or score summarizing a Pokémon's IVs, that value is a derived presentation/domain metric and must not replace the six raw IV values as canonical instance input.

Any future quality formula, label thresholds or formatting requires an accepted rule/spec owned by the relevant progression/balance task.

## 4. Moves

### Move Definition

A **Move Definition** is immutable versioned static game data identified by `MoveId`.

Move identity is separate from display name, and a Combatant's usable move references resolve through pinned game-data/rules identity.

TASK-006 owns the concrete static schema. TASK-008 owns combat semantics such as power, category, accuracy, target rules, cooldown/timing and effect resolution.

### Move Loadout

A **Move Loadout** is the collection of move references selected/resolved for a Pokémon or Combatant under accepted rules.

This specification does not fix ordering, duplicate-move eligibility or maximum loadout size. If v1 uses ordered slots, uniqueness constraints or four moves, those rules must be approved in the owning game-rules specification rather than inferred from UI layout or franchise convention.

### Move Slot

A **Move Slot** is the vocabulary for a positional entry inside a Move Loadout if the accepted move model uses positioned slots. A slot is not the identity of the Move Definition. TASK-008 owns positional/order semantics.

## 5. Types

### Type Definition

A **Type Definition** is immutable versioned static game data identified by `TypeId`.

A species, move or future effect may reference Type IDs only where an accepted schema permits it.

The type catalog and matchup/type-chart values are owned by TASK-006/TASK-008.

Type display names, icons and colors are presentation metadata and must not be used as identity.

## 6. Abilities

### Ability Definition

An **Ability Definition** is immutable versioned static game data identified by `AbilityId`.

Species/static data may declare one or more eligible Ability references, including hidden/alternate slots where the accepted schema supports them. A Pokémon Instance may resolve/select one Ability only according to rules accepted by TASK-019 or a later owning specification.

TASK-006 owns the concrete Ability catalog/mapping schema. TASK-008 owns executable combat semantics of Abilities; PokémonDB descriptions are factual/reference input and must not be treated as executable game logic by the crawler.

## 7. Items and inventory-facing vocabulary

### Item Definition

An **Item Definition** is immutable versioned static game data identified by `ItemId`.

Items are the canonical static identities for inventory/reward content such as consumables, capture items (for example Poké Ball-like items), TMs, equipment or other future item families when those families are accepted by their owning specifications.

This specification defines only identity/vocabulary. TASK-022 owns item semantics including stackability, quantities, consumable/equipment behavior, inventory constraints, category-specific rules and mutation contracts. Capture-item behavior is additionally constrained by the accepted capture/Hunt rules; drop/reward availability is owned by the relevant content/reward tasks.

Whether any item requires a durable per-copy instance identity rather than quantity/stack state is explicitly deferred to TASK-022 and the persistence model; `ItemId` identifies the static definition, not an assumed owned item instance.

## 8. Effects and statuses

### Effect Definition

An **Effect Definition** is a versioned definition of a reusable game/combat effect identified by `EffectId` when stable cross-reference identity is required.

The concrete effect model is intentionally deferred to TASK-007/TASK-008.

### Effect Application

An **Effect Application** is the deterministic act/event of applying an effect to a target in a specific battle context.

It is not the Effect Definition itself.

### Active Effect

An **Active Effect** is battle-local state representing an effect that remains relevant after its application, if the accepted combat rules define such persistence/duration.

### Status

**Status** is a product-facing umbrella term for a meaningful state shown to players. Code/specs that require exact mechanics must use the narrower accepted domain concept rather than treating `status` as a universal implementation type.

This prevents one generic status bucket from silently mixing conditions, temporary modifiers, cooldowns, environmental effects and presentation-only labels.

## 9. Team, party and battle-side vocabulary

### Pokémon Team

A **Pokémon Team** is a gameplay-facing grouping/selection of Pokémon Instance references associated with a player or player-controlled context.

Canonical identity when the Team itself is persisted/saved: `TeamId`.

This specification defines the term only. Ordering, cardinality, duplicate-reference eligibility, whether one Pokémon Instance may appear in multiple saved Teams, mutation rules and mode-specific eligibility are explicitly deferred to TASK-019 and the relevant mode/rules specifications.

### Team Slot

A **Team Slot** is the vocabulary for a position inside a Pokémon Team if the accepted Team model uses positional slots. A slot is never a Pokémon identity. TASK-019 owns whether Team slots are ordered, sparse/fixed, mutable or subject to other constraints.

### Player Party

A **Player Party** is a social/multiplayer grouping of players, for example for Duo/HUB coordination.

It is never a synonym for Pokémon Team.

### Battle Side

A **Battle Side** is one logical side/faction in a battle. A Battle Side contains one or more Combatants and may be associated with one player, several players, AI/content ownership or no persistent player at all.

`BattleSide` is preferred over overloading `Team` inside the Combat Engine because a multiplayer side may aggregate Combatants from multiple players/Teams.

### Lineup

A **Lineup** is the ordered Combatant arrangement for one Battle Side at battle initialization.

It is derived for that battle and is not a saved Pokémon Team.

### Active Combatant

An **Active Combatant** is a Combatant currently fielded under the accepted combat rules.

Being Active does not by itself mean the Combatant is currently eligible to act; action eligibility is a separate rules question owned by TASK-008. The core vocabulary also does not assume there is exactly one Active Combatant per Battle Side.

## 10. PvE world/map, encounter, battle and hunt vocabulary

### PvE World / Map

The **PvE World / Map** is the mode-level navigation/progression structure through which a player discovers, views and selects PvE locations/content such as Zones and the Hunts available from them.

It is not part of the Combat Engine and does not itself resolve encounters or battle outcomes.

This vocabulary does not require a `MapId`: TASK-033 decides whether the accepted product model has one world/navigation surface or multiple addressable map/region definitions. If persistent cross-reference identity for maps/regions is required, that Class A spec must introduce an explicit non-display identity rather than using a name or UI index.

TASK-033 owns the product/gameplay rules for the World/Map → Zone → Hunt relationship, including navigation/selection semantics, availability/unlock rules and how a player enters PvE content. TASK-034 owns the concrete versioned world/zone/content data needed to implement that accepted model. TASK-039/040 own its Card/Low-Spec and Visual/Pixi presentation respectively.

### Encounter Definition

An **Encounter Definition** is versioned static game-data content describing inputs from which an encounter can be deterministically resolved/generated.

Canonical semantic identity: `EncounterDefinitionId`.

TASK-006/TASK-034 own the concrete representation, schema and tables.

### Encounter Instance

An **Encounter Instance** is one resolved occurrence inside gameplay progression, identified by `EncounterId` when durable/replayable correlation is required.

It records or references enough deterministic identity for later orchestration to reproduce the same authoritative encounter inputs under the pinned rules/game-data version.

`EncounterId` identifies the resolved occurrence and must not be reused as the identity of the static Encounter Definition.

### Battle

A **Battle** is one deterministic combat-resolution session owned by the universal Combat Engine contract and identified by `BattleId` when cross-event correlation is required.

A Battle consumes battle sides/combatant snapshots plus explicit rules/random/time inputs defined by TASK-007/008.

An Encounter may produce a Battle, but not every future Battle must originate from an Encounter. PvP, Gyms and World Boss are examples where orchestration may create a Battle from other accepted content/state.

### Hunt

A **Hunt** is a mode-level progression/orchestration concept that can contain or produce multiple Encounters/Battles over elapsed time.

Hunt is not a synonym for Battle and must not be embedded as a mode branch inside the universal Combat Engine.

Solo Hunt lifecycle is governed by ADR-002 and later TASK-033+ work.

### Zone

A **Zone** is a content/location identity used by Hunt/encounter orchestration to select eligible content. It is static game-data vocabulary, not a networking room and not battle state.

Canonical semantic identity: `ZoneId`.

The concrete Zone schema, World/Map topology representation, encounter tables and content relationships are deferred to TASK-033/034.

## 11. Cross-domain invariants

The following invariants are normative for later domain contracts:

1. **Identity layers remain separate.** Definition IDs, persistent-instance IDs and battle-scoped IDs are never interchangeable.
2. **Names are not IDs.** Display/localized names never authorize state mutation or cross-entity lookup by themselves.
3. **Historical authoritative results pin static interpretation.** Replay/checkpoint/claim work must retain the immutable rules/game-data identity needed to interpret referenced static definitions.
4. **Published static definitions are immutable in place.** Corrections publish a new accepted version under the TASK-006 model rather than mutating content referenced by authoritative history.
5. **Battle state is not ownership state.** Combat-local mutation never silently writes back to persistent Pokémon ownership/progression without an explicit authoritative command/result pipeline.
6. **Mode orchestration stays outside combat resolution.** Hunt, PvP, Gym, Duo and World Boss concepts compose the Combat Engine; the engine does not branch on product mode.
7. **Social Party and Pokémon Team are distinct concepts.** Public contracts and code must not call both simply `party`.
8. **Raw IVs remain inspectable canonical inputs.** Any quality/rating summary is derived and cannot replace the six raw keyed values.
9. **Complete stat structures are complete.** A value named `StatBlock` contains every canonical stat key; partial structures use an explicit partial/delta/modifier concept.
10. **Infrastructure does not enter core vocabulary.** Database rows, HTTP requests, Durable Objects and React/Pixi objects are adapters/consumers, not core domain entities.

## 12. Package ownership expectations

These are ownership directions, not TypeScript implementation requirements:

| Package | Owns / consumes |
|---|---|
| `packages/game-types` | Infrastructure-free domain IDs and structural shared types accepted by later tasks. |
| `packages/game-data` | Versioned static definitions and published content bundles. |
| `packages/game-core` | Pure deterministic resolution over accepted domain inputs; no persistence, HTTP, React or Cloudflare runtime concepts. |
| `packages/game-protocol` | Transport-facing contracts that reference/serialize accepted domain concepts without redefining their meaning. |
| `packages/database` | Persistence representation/adapters for persistent entities without becoming the source of domain semantics. |
| `apps/api` | Authoritative commands/validation/orchestration across domain and persistence boundaries. |
| `apps/realtime` | Ephemeral realtime coordination; no redefinition of combat/domain identity. |
| `apps/web` | Presentation/input/read models; never authoritative identity or persistent reward/progression logic. |

## 13. Deferred decisions and owners

| Decision | Owning task |
|---|---|
| Concrete TypeScript ID/type representation | TASK-005 |
| Species/form normalization, base-species grouping and generation/game source qualifiers | TASK-006 |
| Static species/move/type/ability/item/zone/encounter schema foundations | TASK-006, refined by owning domain/content specs |
| Rules/game-data version/checksum/provenance format | TASK-006 |
| Universal Combat Engine input/state/event architecture | TASK-007 |
| Stat formulas, IV ranges, rounding and Speed semantics | TASK-008 |
| Move categories, power, accuracy, targets, timing/cooldowns, loadout ordering/duplicate eligibility and max loadout rules | TASK-008 |
| Type chart and matchup math | TASK-006 / TASK-008 |
| Ability eligibility/slot selection on owned Pokémon | TASK-019 |
| Ability executable combat semantics | TASK-008 |
| Effect/status executable model | TASK-007 / TASK-008 |
| Item stackability, consumable/equipment/TM/capture-item semantics, inventory constraints and owned-item representation | TASK-022 |
| Pokémon Team ordering/cardinality/duplicate-reference/reuse/mutation rules | TASK-019 and mode-specific rule specs |
| Active-combatant cardinality and switch/KO rules | TASK-008 and mode-specific rule specs |
| PvE World/Map → Zone → Hunt navigation, availability/unlock and lifecycle rules | TASK-033 |
| Concrete PvE World/Zone relationships, encounter tables/generation and Hunt content data | TASK-034 |
| PvE World/Map/Zone client presentation | TASK-039 / TASK-040 |
| Item drop/reward rules and cadence for Solo PvE | TASK-033 |
| Concrete versioned Zone/Hunt item-drop/reward tables | TASK-034 |
| Authoritative capture/reward/drop resolution and grant flow | TASK-023 / TASK-024 / TASK-036 |
| Persistent schema for Pokémon/Teams/inventory/progression | TASK-013 |
| HTTP/WebSocket serialization and public protocol shapes | Relevant API/realtime contract tasks |

## Required behavior

All later specifications and implementations that use the concepts above must preserve the terminology and invariants in this document unless a later Human Owner-approved Class A change explicitly updates this spec.

When a later task needs a concept not covered here, it may introduce a narrower concept inside its accepted scope. It must not silently redefine an existing term.

## Edge cases

- Two Pokémon Instances of the same Species remain distinct because `PokemonInstanceId` differs.
- Two accepted forms that share one National Dex number still have distinct `SpeciesId` values when they are independently addressable PokeNexus definitions.
- The same Pokémon Instance used in two Battles receives separate battle-scoped Combatant identity/state.
- An encounter-generated enemy can be a Combatant without ever becoming a persistent Pokémon Instance.
- A social Player Party may contain two players whose Pokémon participate on one Battle Side; Player Party, each player's Pokémon Team and the resulting Battle Side remain separate concepts.
- A quality/rating display may change presentation formula in a later accepted rules version without losing the raw six IV values.
- A display-name/localization change must not invalidate IDs, replay references or persistence references.
- A static Move/Species definition correction must not alter the interpretation of a historical battle/checkpoint that pins an older published data/rules identity.

## Acceptance

Acceptance requires:

1. independent QA review with no unresolved P0/P1 findings;
2. Human Owner approval of the terminology, identity boundaries and invariants;
3. TASK-004 state updated through the repository lifecycle;
4. future TASK-005+ work treats this accepted specification as authoritative until explicitly superseded through governance.

## Open decisions

The following are intentionally not required to accept this vocabulary baseline and remain deferred to their owning tasks:

- exact numeric IV domain and derived-stat formula;
- whether Speed drives initiative, cooldown/timing, another mechanic or no v1 combat behavior;
- exact Pokémon Team size and number of simultaneously active Combatants;
- exact maximum Move Loadout size;
- whether move categories are Physical/Special/Status or another accepted model;
- exact Ability selection/inheritance rules and executable Ability semantics;
- concrete Effect/Status algebra and stacking/duration rules;
- item stackability, category/use semantics, owned-item representation and concrete drop tables;
- exact PvE World/Map topology, Zone unlock/navigation rules and Hunt availability model;
- exact persistent serialization/ID primitive types.
