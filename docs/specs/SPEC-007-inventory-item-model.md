# SPEC-007 — Inventory / Item Model v1

- Status: APPROVED
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Required consultants:
  - Gameplay Systems Consultant (`GSC`)
  - Player Experience & Economy Consultant (`PXE`)
- Related ADRs:
  - ADR-004 — Universal Deterministic Combat Engine Architecture
  - ADR-005 — Persistence & Data Access Strategy
- Related specs:
  - SPEC-001 — Core Domain Model
  - SPEC-002 — Static Game Data, Versioning & PokémonDB Ingestion
  - SPEC-003 — Combat Rules v1
  - SPEC-004 — PostgreSQL Persistence Schema v1
  - SPEC-005 — Pokémon Instance, Collection & Team v1
  - SPEC-006 — XP / Level / Progression Rules
- Related tasks:
  - TASK-022 — Inventory / Item Model Spec
  - TASK-023 — Reward Ledger & Integrity Model
  - TASK-024 — Progression / Inventory / Reward Implementation
  - TASK-033 — PvE World/Map, Zone & Solo Hunt Rules/Lifecycle Spec
  - TASK-036 — Capture & Reward Resolution
  - TASK-088 — Move Acquisition / Eligibility Rules Spec

## 1. Problem

PokeNexus already has canonical `ItemId` identity and an Inventory aggregate root, but no accepted
product contract for owned-item representation, quantities, capacity, item use or cross-system
consumption.

If TASK-024, Hunt, capture or Move-acquisition work proceeds without one contract, each subsystem
could independently guess whether items stack, whether zero-quantity rows exist, whether a failed
Potion consumes an item, whether storage is limited, whether a TM is automatically usable, or how
Inventory and Hunt state commit together. Those guesses would create persistence/API migration
debt and inconsistent player-facing behavior.

This spec defines the minimum authoritative v1 Inventory model while deliberately avoiding
monetization, player-to-player economy and unsupported equipment/revival complexity.

## 2. Goals

- define one durable Inventory aggregate model for fungible v1 items;
- make quantity, zero, overflow and concurrency semantics exact;
- define server-authoritative grant/remove/use boundaries;
- define Potion/healing integration without creating a second combat/effect resolver;
- define capture-item consumption timing without stealing capture probability/outcome rules;
- hand TM/machine acquisition cleanly to TASK-088;
- keep item factual identity separate from executable item behavior;
- avoid artificial inventory friction or monetization pressure in baseline v1;
- make later per-copy/equipment/revival/capacity additions explicit schema/rule changes rather than
  hidden assumptions.

## 3. Non-goals

This spec does not define:

- concrete reward/drop tables or Hunt reward cadence;
- reward-ledger/idempotency schema or multi-reward bundle atomicity;
- capture formula/probability, catch outcome or Pokémon grant construction;
- Move eligibility, TM compatibility, learned-Move state or Move acquisition;
- equipment/loadout slots, held-item combat effects, durability or randomized item affixes;
- player-to-player trading/market/economy;
- premium currency, paid storage, battle pass, paid stamina, paid item bundles or any monetization
  mechanic;
- UI/public API payloads;
- source-site item prose as executable behavior;
- production migrations/repositories/API implementation;
- automatic/offline item use.

## 4. Authority boundaries

### 4.1 Static Item Definition remains factual

SPEC-002 `ItemDefinition` remains immutable factual game data:

- `ItemId` identity;
- source name/slug;
- structured source category/classification when available;
- provenance.

Source category/classification is **not** executable PokeNexus behavior. A source category such as a
healing, machine, battle or capture grouping cannot by itself authorize use, consumption, targeting
or gameplay effects.

SPEC-007 does not require a static `schemaVersion` change for baseline Inventory ownership because
v1 owned state needs only canonical `ItemId` plus quantity. If later accepted item data requires a
new factual field or machine/item relation artifact, that change must enter through SPEC-002's
explicit schema-version process rather than being smuggled into runtime rules.

### 4.2 Executable item semantics are rule content

Executable PokeNexus item behavior is resolved through the exact accepted `rulesVersion` and
compatible `gameDataVersion`, not from PokémonDB prose/category.

The v1 rule layer may map an `ItemId` to an immutable `ItemRule` such as:

```text
ItemRuleV1 =
  | { useKind: "none" }
  | { useKind: "heal-hp", magnitude: HpHealingMagnitude }
  | { useKind: "capture-attempt" }
```

where:

```text
HpHealingMagnitude =
  | { kind: "fixed", amount: PositiveInteger }
  | { kind: "max-hp-fraction", numerator: PositiveInteger, denominator: PositiveInteger }
```

The fraction is exact rational math and `denominator > 0`.

This baseline intentionally does not define `revive`, `equipment` or `move-acquisition` executable
rules. Those are discussed below as explicit boundaries/open decisions.

An `ItemId` with no compatible accepted executable rule is not player-usable merely because the
item exists in static data or Inventory.

## 5. Inventory aggregate v1

### 5.1 Aggregate identity

SPEC-004 remains authoritative:

- one `player_inventories` aggregate root per Player;
- PlayerId is the Inventory ownership identity;
- Inventory root `rowVersion` is the optimistic-concurrency token.

No independent `InventoryId` is introduced.

### 5.2 Owned-item representation

Recommended v1 model:

```text
InventoryEntry = {
  itemId: ItemId,
  quantity: ItemQuantity
}
```

with exactly one logical entry per `(PlayerId, ItemId)`.

All item families admitted to v1 Inventory are **fungible quantity-based ownership**. v1 does not
create durable per-copy item instance identities.

If a future item needs durability, randomized affixes, unique provenance, binding state or another
per-copy mutable property, that item family requires a separately accepted persistence/schema
extension before ownership. A static `ItemId` is never treated as a per-copy identity.

### 5.3 Quantity domain

Logical `ItemQuantity` is an exact integer in:

```text
0 .. 9_223_372_036_854_775_807
```

This matches the non-negative domain available from PostgreSQL signed `bigint`. Runtime/protocol
representations must preserve the value losslessly; JavaScript `number` is not sufficient for the
whole domain.

Persisted entry rows use:

```text
quantity >= 1
```

Logical quantity `0` is represented by **absence of the entry**, not by a zero-quantity row.

### 5.4 No gameplay capacity in v1

Recommended baseline:

- no global Inventory slot/carry limit;
- no category capacity;
- no weight capacity;
- no player-facing per-stack limit below the technical `ItemQuantity` maximum.

API pagination/query limits are operational concerns and are not Inventory capacity.

The `ItemQuantity` numeric maximum is a technical representational bound, not a scarcity mechanic,
storage product or monetization surface.

Any future gameplay capacity, storage expansion or paid-capacity proposal is a new Class A
player/economy decision and requires PXE consultation.

## 6. Mutation model

### 6.1 Server authority

Clients never authoritatively choose a grant quantity/source or force an Inventory balance.

Inventory mutations are accepted only from an owning server-authoritative command/source contract:

- reward/grant source;
- accepted item-use command;
- accepted administrative correction under a future authority contract;
- another future explicitly accepted system.

### 6.2 Grant

A grant resolves an exact positive `delta` for one or more ItemIds before mutation.

For one entry:

```text
newQuantity = oldQuantity + delta
```

If the exact result exceeds `ItemQuantity` maximum, the mutation fails closed. It must not clamp,
wrap, silently discard excess or partially grant the entry.

Whether sibling XP/items/currency from one reward source form one all-or-nothing bundle remains
TASK-023/source-contract authority.

### 6.3 Remove / consume

A remove/consume mutation requires:

```text
0 < delta <= currentQuantity
```

Insufficient quantity rejects the mutation without decrement or rowVersion change.

If accepted decrement reaches zero, the persisted entry is deleted in the same transaction.

### 6.4 Inventory rowVersion

One accepted Inventory command that changes one or more entries increments the owning Inventory
root `rowVersion` exactly once.

Rejected/stale/invalid/no-op commands do not increment it.

An accepted multi-entry mutation and the root version change are one transaction. Entry writes
cannot commit independently from the expected Inventory version check.

### 6.5 Cross-aggregate item use

An item-use command may also mutate Hunt/checkpoint or other accepted authoritative state. In that
case, successful durable item consumption and the accepted durable consequence must be composed as
one all-or-nothing command under the owning orchestrator's accepted transaction/concurrency model.

One successful Inventory `rowVersion` check is not proof that another aggregate is current.
Every source version required by the cross-aggregate invariant must be validated as required by
SPEC-004.

TASK-024/033/038 own the concrete repository/orchestration implementation for their paths.

### 6.6 Durable command correlation and replay safety

Inventory OCC prevents lost updates and simultaneous double-consume, but `rowVersion` is **not** a
durable idempotency identity for a logical item-use/capture attempt. A response can be lost after a
transaction commits; a later retry after reloading fresh versions must not be mistaken for a new
logical use and debit the same action again.

Every durable item-use command that can consume Inventory and produce an authoritative consequence
must therefore participate in the owning TASK-023/source-contract idempotency envelope with a
server-authoritative correlation identity sufficient to distinguish one logical command/attempt
from a genuinely new one. SPEC-007 does not define the database table, public key format or ledger
schema; TASK-023 owns those details.

For one logical item-use/capture attempt:

1. completion evidence, required Inventory debit and authoritative consequence/outcome compose under
   the owning source contract's accepted atomicity semantics;
2. if the correlation is already durably completed, a replay returns/reuses that prior completion
   and outcome as applicable and performs **no additional Inventory debit or consequence**;
3. if a conditional write is stale, that attempt commits neither partial debit nor partial
   consequence/completion evidence; all results derived from the stale snapshot are invalidated;
4. only if the correlated attempt is not completed and remains eligible may the orchestrator reload
   current Inventory/target/context state, recompute/revalidate the **same logical attempt**, and
   retry against fresh versions;
5. a retry must never silently mint a new correlation identity merely to bypass a completed or stale
   command;
6. a genuinely new player action uses a distinct authoritative correlation identity.

These rules are the item-use analogue of SPEC-006 progression retry semantics and preserve
TASK-023 ownership of durable idempotency design.

## 7. Item-use command semantics

### 7.1 Validate before consume

Before decrementing Inventory, an item-use command validates at least:

1. authenticated Player ownership;
2. exact ItemId and resolved ItemRule under the authoritative version context;
3. sufficient quantity;
4. target ownership/eligibility;
5. mode/context eligibility;
6. expected Inventory version and any other required aggregate version;
7. whether the effect/attempt can be accepted at the ordered logical boundary.

Invalid, stale or ineligible use consumes nothing.

### 7.2 Accepted no-op policy

Baseline v1 does **not** consume a usable item when its intended deterministic effect cannot change
the valid target state.

Examples:

- healing item on full-HP target: reject/no consume;
- ordinary healing item on KO target: reject/no consume;
- invalid target or unavailable context: reject/no consume.

This avoids ambiguous "successful command but wasted item" behavior. A future item explicitly
designed to be consumed despite no state change requires its own accepted rule.

### 7.3 No automatic/offline consumption

Inventory items are never silently auto-consumed by offline advancement, AI policy, Battle
transition, Hunt checkpoint advancement or low-HP thresholds in v1.

Every player-owned consumable use requires an accepted explicit item-use command or a separately
accepted future automation system.

## 8. Healing / Potion semantics

### 8.1 Normal healing target

A normal HP-healing item can target only a living eligible participant whose current HP satisfies:

```text
0 < currentHp < maxHp
```

It cannot revive a target at `0` HP.

### 8.2 Shared deterministic evaluator

SPEC-003 already defines generic instant HP-healing primitives and one deterministic evaluator for
Battle/cadence effects.

An accepted `heal-hp` item consequence must normalize into that shared game-core primitive and use
the same exact integer/rational/clamping semantics. Hunt orchestration must not implement separate
Potion healing math.

Inventory authorization/decrement remains outside the Combat Engine; only the normalized
consequence is supplied to game-core evaluation.

### 8.3 Hunt timeline

TASK-033 owns when the player may submit an item-use command during Solo Hunt and exact ordering
against due cadence effect boundaries.

SPEC-007 fixes only this invariant: consumption and consequence cannot be ordered ambiguously or
retroactively relative to deterministic Hunt logical time.

## 9. Revival

Recommended v1 direction: **defer revival items**.

Reasons:

- SPEC-003 explicitly has no revival primitive today;
- adding revive requires new deterministic KO→living state semantics in shared game-core, not a
  Hunt-only shortcut;
- it changes no-living-Pokémon failure/intervention pressure and therefore core Hunt pacing;
- it creates additional economy/scarcity balancing surface before the baseline loop is validated.

If the Human Owner chooses to include revival in v1, SPEC-007 must be revised before approval to
define the exact generic game-core revival primitive, HP restoration magnitude, target eligibility,
timeline ordering and implementation handoff. TASK-033 cannot invent revival on its own.

Deferral means a future TASK-033 no-living intervention cannot assume a Revive option; it must offer
only actions supported by then-accepted item/gameplay rules (for example return/terminate) until
revival is separately accepted.

## 10. Capture items

### 10.1 Ownership

Capture items use the same fungible quantity Inventory representation.

### 10.2 Consumption boundary

TASK-033/036 own capture opportunity/eligibility/probability/outcome.

SPEC-007 fixes the Inventory safety boundary:

- invalid/stale/ineligible capture command → no item consumed;
- once the authoritative capture resolver accepts a valid attempt, exactly **one** configured
  capture-item unit is consumed whether the capture succeeds or fails;
- item consumption and the accepted attempt outcome compose atomically under the capture/reward
  orchestration contract: the outcome cannot commit without its required one-unit debit, and no
  capture-item debit may commit without an accepted attempt.

In addition, the capture resolver/source contract must bind exactly one durable logical capture
attempt correlation to exactly one accepted outcome and exactly one required one-unit debit. A
replay of a completed attempt reuses the prior completion/outcome and never throws/debits a second
Poké Ball. A stale/uncommitted retry may reload and re-evaluate the same correlated attempt only
under section 6.6; it cannot become a second attempt by retry mechanics alone.

Human Owner clarification for the normative product rule:

> A Poké Ball that is thrown is lost regardless of whether the capture succeeds or fails.

TASK-036 remains responsible for capture eligibility, probability, outcome and Pokémon grant
resolution. It does not own a second consumption policy.

No capture probability can be inferred from Item source text/category.

## 11. TM / machine items

TM/machine items may exist as static ItemIds and may be owned as ordinary Inventory quantities,
but SPEC-007 does not make them usable.

TASK-088 owns:

- whether a machine grants permanent learned/eligible Move state;
- Species/Move compatibility;
- whether use consumes a quantity;
- reusable versus consumable machine semantics;
- replacement/permanence rules;
- generation/game source interpretation.

Until TASK-088 accepts those rules, an Item's machine-like source category does not authorize Move
eligibility or Inventory consumption.

If TASK-088 needs a canonical machine/item↔Move factual relation, it must coordinate the required
SPEC-002 schema extension/relation artifact rather than encoding it as an Inventory scalar.

## 12. Equipment / held items

Recommended v1 direction: **defer equipment and held-item mechanics**.

No v1 ItemRule equips an item, creates an equipment slot, persists an equipped ItemId, modifies
combat stats/effects or creates per-copy item state.

This does not prohibit static ItemIds from existing. It means those items remain non-usable until a
future accepted owning specification defines:

- equip slots/cardinality;
- quantity versus per-copy identity;
- ownership/equip transaction semantics;
- combat snapshot/rulesVersion integration;
- trading/binding/durability/unique-state rules if any.

## 13. Static-data correction and rule-version behavior

Owned Inventory persists stable `ItemId` plus quantity. It does not silently pin every entry to the
`gameDataVersion` active at grant time.

Static data correction rules follow SPEC-002/SPEC-004 principles:

- a later factual catalog correction does not silently delete, rename or convert owned quantities;
- a canonical ItemId remap/change requires explicit migration/authority, not read-time rewriting;
- executable use resolves through the authoritative operation's exact accepted
  `{ gameDataVersion, rulesVersion }` context;
- missing/incompatible Item definition/rule fails the authoritative operation closed;
- historical authoritative actions retain the context required by their owning replay/audit
  contract.

## 14. Persistence handoff to TASK-024

TASK-024 may add an Inventory-entry relation consistent with this logical contract, for example one
row keyed by Player/Inventory + encoded ItemId with positive `bigint` quantity.

The exact SQL is implementation-owned, but it must enforce:

- at most one entry per Inventory + ItemId;
- positive persisted quantity;
- ownership through the existing Inventory root;
- expected-rowVersion mutation;
- atomic root-version + entry change;
- no per-copy item instance table for baseline v1.

TASK-024 must not expose an unrestricted grant/set-balance API merely because repository methods
exist.

## 15. Player Experience / Economy guardrails

Baseline v1 is monetization-neutral:

- no paid storage/capacity;
- no premium Inventory tier;
- no paid auto-consumption;
- no paid item-power assumption;
- no artificial slot pressure as a retention/monetization mechanism;
- no random paid item acquisition.

Scarcity comes only from separately accepted acquisition/reward/source rules, not from hidden
Inventory loss or arbitrary storage pressure.

A later monetization proposal must independently evaluate F2P practical viability, payer value,
competitive integrity, economy sustainability, pressure/FOMO, P2W impact and abuse incentives under
PXE governance. This spec does not pre-approve any such system.

## 16. Abuse / edge cases

- duplicate/retried authoritative grants must rely on TASK-023/source idempotency and cannot use
  Inventory rowVersion alone as deduplication evidence;
- duplicate/retried durable item-use and capture commands likewise rely on their TASK-023/owning
  source-contract correlation; Inventory rowVersion alone is never proof that a logical use has or
  has not already completed;
- response uncertainty after a committed item use must not create a second debit/effect on replay;
- one logical capture attempt maps to exactly one accepted outcome and, under the accepted capture
  rule, exactly one debit, even if the completion response is retried;
- stale simultaneous use of the last item must result in at most one accepted debit/use;
- quantity arithmetic is exact and overflow-checked before persistence;
- invalid use never decrements first and "refunds" later as normal control flow;
- deletion-at-zero and concurrent grant/use must serialize through the accepted Inventory aggregate
  concurrency contract;
- source category changes do not retroactively make an owned item executable;
- offline advancement cannot consume inventory implicitly;
- a Battle/Hunt boundary cannot auto-heal or auto-revive by reading available items.

## 17. Consultation evidence

Required GSC/PXE consultation was completed read-only on the TASK-022 DRAFT. The findings below are
advisory input, not accepted behavior until Human Owner decision.

### 17.1 Shared facts / constraints

Both consultants confirmed:

- TASK-022 owns stack/per-copy/capacity/use semantics while SPEC-004 already fixes the Player
  Inventory aggregate and `rowVersion` boundary;
- SPEC-003 preserves Hunt HP/effects across Battles and forbids implicit heal/revive, so item HP
  consequences must use the shared deterministic evaluator and ordered cadence timeline;
- TASK-023 owns reward/idempotency composition;
- TASK-036 owns capture formula/outcome;
- TASK-088 owns TM/Move eligibility/acquisition;
- source Item category/prose is not executable authority;
- no monetization mechanic is currently accepted or implied.

### 17.2 Converged recommendations

GSC and PXE both recommend:

1. quantity-by-`ItemId` fungible ownership in v1;
2. no per-copy Item instances until an accepted item family actually needs copy-specific mutable
   state;
3. no gameplay global/category/slot capacity and no gameplay stack cap;
4. technical overflow fails closed before mutation; never clamp, partial-grant or discard;
5. use validates Inventory + target/context first, then commits consume + consequence atomically;
6. invalid/stale/ineligible/no-effect consumable commands consume nothing;
7. no implicit/offline/automatic item consumption;
8. Potion/healing uses SPEC-003's shared deterministic healing evaluator;
9. revival is deferred from baseline v1;
10. equipment/held-item mechanics are deferred from baseline v1;
11. TM possession alone grants no Move; TASK-088 remains authoritative for compatibility,
    permanence and consumption;
12. stockpile/hoarding pressure should be managed later through accepted faucets/sinks/effects, not
    artificial storage friction.

### 17.3 Forecasts / player-system risks

- Capacity-free/no-low-stack v1 avoids full-bag reward loss, forced discard chores and an obvious
  future paid-storage pressure surface; trade-off is stockpile growth if faucets exceed sinks.
- Revival before Hunt failure/reward cadence is known can create a self-sustain loop:
  `revive → longer Hunt → more rewards/revives → longer Hunt`.
- Auto-use would silently spend scarce player resources during idle/offline advancement.
- Incorrect consume-before-effect ordering can create phantom item loss under stale/concurrent state.
- Paid healing/revive/capture/TM/equipment in a future design could create direct/indirect P2W or
  attempt-volume asymmetry, especially in PvP/leaderboards; any such proposal requires fresh Class
  A + PXE review.
- Reusable TMs reduce friction but may create dead duplicate rewards; consumable TMs create a sink
  but can add grind/power scarcity. TASK-088 must decide with its own full acquisition context.

### 17.4 Resolved consultation disagreement

The consultants differed on capture-failure consumption:

- **GSC:** consume one unit on every valid accepted capture attempt, even when capture fails.
- **PXE:** leave failed-attempt consumption to TASK-036 because it materially sets scarcity/attempt
  pressure and cannot be evaluated fully before capture sources/cadence are defined.

The Human Owner resolved this on 2026-09-18 in favor of the GSC rule: one unit is consumed for every
valid accepted capture attempt, including an unsuccessful capture. The PXE concern remains useful
context for later source/sink tuning but does not change the accepted Inventory semantic.

## 18. Human Owner accepted v1 direction

The Human Owner accepted the complete proposed baseline on 2026-09-18:

1. all baseline v1 owned items are quantity-based/fungible; no per-copy identities;
2. no gameplay Inventory capacity/stack-slot limit in v1;
3. exact logical ItemQuantity uses non-negative signed-`bigint` range and lossless representation;
4. failed/ineligible/no-op item use consumes nothing;
5. no automatic/offline item consumption;
6. Potion/healing uses SPEC-003 shared deterministic healing primitives;
7. revival items are deferred from v1;
8. equipment/held-item mechanics are deferred from v1;
9. a valid accepted capture attempt consumes exactly one capture item regardless of capture success
   or failure — in practical terms, a Poké Ball that is thrown is lost;
10. TM/machine usability/consumption remains entirely TASK-088-owned;
11. exact Hunt item-use window remains TASK-033-owned;
12. executable ItemRule content is rulesVersion-owned rather than inferred from static source data.

This Human decision fixes the product semantics. A later independent integrity audit found an
implementation-contract gap around replay after response uncertainty; section 6.6 closed that gap
without altering the accepted player-facing semantics, and the exact corrected artifact subsequently
cleared fresh QA and IA with P0/P1/P2/P3 `0/0/0/0`.

## 19. Acceptance

Approval evidence:

1. GSC consultation completed and recorded;
2. PXE consultation completed and recorded;
3. Human Owner accepted the complete v1 item/inventory product semantics on 2026-09-18, including
   the explicit capture-item rule in section 10;
4. a redundant independent IA found a replay/idempotency gap in the first REVIEW snapshot; section
   6.6 corrected it without changing product semantics;
5. fresh independent QA on the corrected exact snapshot: READY, P0/P1/P2/P3 `0/0/0/0`;
6. fresh independent IA concurrency/integrity re-audit on the corrected exact snapshot: PASS,
   P0/P1/P2/P3 `0/0/0/0`;
7. repository history/integration remains a separately authorized operational action.
