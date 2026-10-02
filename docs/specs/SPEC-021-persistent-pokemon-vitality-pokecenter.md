# SPEC-021 — Persistent Pokémon Vitality and HUB PokéCenter Authority

**Status:** APPROVED — Human Owner accepted as part of the coordinated SPEC-020 Class-A package on 2026-10-02  
**Class:** A  
**Owner:** TASK-106 management-first realignment  
**Depends on:** SPEC-004/005/011/013/015/020  
**Implementation authorization:** NONE. This document does not authorize a migration, API enablement, gameplay implementation, Git history operation or deployment.

## 1. Purpose

The Human-approved first Pre-alpha requires Pokémon HP to persist across Solo Hunts and requires a free, immediate PokéCenter full-heal for one player-selected saved Team in the HUB. The currently accepted persistence model has no authoritative out-of-Hunt `currentHp`, while the old Solo-Hunt baseline initializes every fresh Hunt at full HP.

This specification defines the durable vitality authority and its serialization boundaries. It does not change the product rules owned by SPEC-020.

## 2. Product invariants carried into this contract

- HP persists when a Solo Hunt ends; a new Hunt never heals a Pokémon merely because it is new.
- A damaged Pokémon may start a Hunt at its persisted HP.
- A Team may contain KO members; Start is allowed only when at least one selected member is conscious.
- Existing Team order remains authoritative. The first living eligible member in pinned Team order is the initial active member when earlier members are KO.
- PokéCenter is free and immediate, heals exactly the player-selected saved Team, restores KO members to conscious/max HP and is usable during the 30-second Solo-Hunt recovery window.
- PokéCenter is unavailable while a Solo Hunt is active.
- `Retreat` and `no_living` persist final Team HP and start the 30-second Player-wide Solo-Hunt Start gate; recovery expiry itself does not heal.
- Running Hunts keep immutable pinned Team/configuration input; later saved-Team edits do not rewrite the Hunt snapshot.

## 3. Durable vitality aggregate

Forward persistence introduces one authoritative vitality row per owned Pokémon:

```text
PokemonVitality(
  ownerPlayerId,
  pokemonInstanceId,
  currentHp,
  rowVersion,
  updatedAt
)
```

Normative requirements:

1. `(ownerPlayerId, pokemonInstanceId)` is unique and ownership-bound to the Pokémon Instance.
2. `currentHp` is a non-negative integer.
3. `maxHp` is **not** duplicated as durable mutable truth. It is derived from the authoritative Pokémon aggregate plus the exact accepted rules/content authority for the operation.
4. `conscious | ko` is derived from `currentHp > 0`; no independently writable vitality-status column exists.
5. `rowVersion` is an OCC token separate from Pokémon configuration `rowVersion`; Move/Ability/config edits must not masquerade as vitality writes.
6. Every mutation that changes `currentHp` increments vitality `rowVersion` exactly once in the successful transaction.
7. A new bootstrap/captured Pokémon receives one vitality row initialized at derived `maxHp` **in the same authoritative transaction that creates the owned Pokémon**; no owned forward-version Pokémon may become visible without its vitality row.

### 3.1 Max-HP mutation reconciliation

When an authoritative mutation changes derived `maxHp`:

- if `currentHp > newMaxHp`, clamp to `newMaxHp` in the same transaction and increment vitality `rowVersion`;
- if `currentHp <= newMaxHp`, keep `currentHp` unchanged;
- `currentHp = 0` remains KO when max HP rises;
- a max-HP increase never heals by itself.

The owning progression/configuration contract must call this reconciliation atomically with the mutation that changes max HP.

An immutable rules/content publication that changes derived max HP for already-owned Pokémon may not become the active vitality authority until the affected durable vitality rows can satisfy the same invariant. The cutover must use a bounded/versioned reconciliation or equivalent migration that clamps only `currentHp > newMaxHp`; a read path must not silently project one HP value while persistence keeps another authoritative value.

### 3.2 Forward cutover

Historical accepted Hunts keep their historical full-HP-fresh-Hunt/checkpoint semantics under their pinned versions.

The forward vitality migration may initialize a pre-cutover owned Pokémon to its then-current derived max HP because the old contract had **no durable out-of-Hunt HP fact to preserve**. The cutover must not infer or rewrite historical Hunt HP. Migration/enablement must either prove no active old-version Hunt exists for a Player or serialize an explicit versioned cutover after that Hunt terminates; an active historical Hunt is never silently reinterpreted.

## 4. Canonical serialization and lock order

All operations that can race with Hunt Start/terminalization or PokéCenter use the existing Player Hunt root as the first serialization gate.
The forward player/bootstrap path must ensure that this root exists before the first Start/PokéCenter/vitality-sensitive mutation (or creates it idempotently under the same Player-scoped transaction); a missing root is never permission to bypass serialization.

Canonical order:

1. authenticated Player / `player_hunt_roots` root;
2. selected Team aggregate and owned Pokémon configuration rows, in deterministic identity order;
3. vitality rows for the affected Pokémon, sorted by canonical Pokémon Instance identity;
4. Hunt policy / Inventory / checkpoint rows required by the operation, using their existing deterministic sub-order.

No operation may lock vitality first and the Player Hunt root later.

Consequences:

- PokéCenter wins the root lock first → it heals, then a later Start observes healed vitality.
- Start wins first → it commits `active_hunt_id`; a later PokéCenter command rejects as Hunt-active.
- terminalization/Retreat owns the root until final vitality writeback + Hunt terminal state + recovery anchor commit atomically.

## 5. Solo Hunt Start vitality transaction

The forward Start transaction:

1. performs normal replay/idempotency checks;
2. locks the Player Hunt root and enforces one-active-Hunt + recovery rules;
3. locks the selected saved Team, its ordered members/configuration and their vitality rows;
4. validates the accepted strict admission rule:
   - Team size `1..6`;
   - every selected member has a dense `1..4` executable Move loadout with at least one progress/damage-capable executable Move;
   - at least one selected member has `currentHp > 0`;
5. derives each selected member's exact current `maxHp`, applying any mandatory clamp before pinning;
6. freezes `currentHp/maxHp` into the versioned Hunt input/checkpoint authority;
7. starts a fresh cadence scope with prior-Hunt transient cadence state reset, **without** replacing pinned starting HP with max HP;
8. commits Start authority and the active-Hunt root atomically.

KO selected members remain pinned reserves at `0` HP. Existing Team-order rules choose the first living eligible member as the initial active member.

## 6. Hunt terminal vitality writeback

For every forward-version Solo Hunt terminal path, including `Retreat` and `no_living`:

1. the Hunt reconciles all effects authoritative before the terminal boundary;
2. final pinned Team HP is read from the authoritative cadence/checkpoint state;
3. the transaction locks/revalidates the corresponding vitality rows;
4. each selected member's durable `currentHp` is replaced with that final clamped HP;
5. the Hunt terminal row, Player `active_hunt_id = null`, vitality mutations and `recoveryReadyAt = terminalDatabaseTime + 30 seconds` commit atomically.

There is no terminal auto-heal. A crash cannot commit terminal state while leaving pre-Hunt vitality behind.

## 7. PokéCenter command

Proposed first-Pre-alpha authority:

```text
POST /player/pokecenter/heal
Idempotency-Key: <uuid>

{
  "teamId": "<owned saved Team UUID>"
}
```

The explicit `teamId` is the Team selected by the player in the HUB; no new global “active Team” persistent selector is invented.

First acceptance:

1. replay-checks the idempotency key;
2. locks the Player Hunt root;
3. rejects durably with `409 hunt_active` if `active_hunt_id` is non-null;
4. resolves/locks the owned saved Team and members; unknown/unowned Team/member is self-scoped `404 not_found`;
5. locks vitality rows in canonical member identity order;
6. derives each member's current authoritative `maxHp`;
7. sets every member to `currentHp = maxHp`, including `0 -> maxHp`;
8. consumes no item, currency or recovery time;
9. commits all changed vitality rows and the durable command result atomically.

The command is legal while `recoveryReadyAt` is in the future. If every selected member is already full HP, success is an idempotent no-op domain result; it does not manufacture vitality version churn.

The success response contains the healed Team's authoritative vitality projection and current `recoveryReadyAt`. It is reporting only, not a second healing mechanism.

## 8. Read projections

Player-State/management reads that present owned Pokémon or saved Team readiness may expose:

```text
pokemonInstanceId
currentHp
maxHp
vitality: conscious | ko
vitalityRowVersion
```

`maxHp` is derived under the read's accepted current authority. Clients never calculate authoritative Start eligibility from cached HP alone; Start revalidates under lock.

## 9. Security and integrity

- All selectors are self-scoped to the authenticated Player.
- A foreign and absent Team/Pokémon use the existing indistinguishable `404` policy.
- `teamId`, HP values and max HP are never accepted from the client as authoritative mutation values.
- Idempotency replay returns the original PokéCenter result and cannot heal twice or bypass Hunt-active rejection.
- Vitality writes participate in OCC/restart equality tests; no process-local mutex substitutes for database authority.

## 10. Required conformance evidence before implementation/enablement

- Start with damaged Leader; exact starting HP is pinned.
- Leader KO but later Team member conscious; Start succeeds and the first living member in Team order becomes active.
- all selected members KO; Start fails.
- Center-vs-Start races in both lock orders.
- Center during recovery succeeds; recovery anchor is unchanged.
- Center while Hunt active rejects with no HP mutation.
- Retreat and `no_living` atomically persist final HP + terminal + 30-second recovery.
- crash/retry cannot terminalize with stale vitality.
- captured/bootstrap Pokémon initialize at full HP exactly once.
- max-HP decrease clamps atomically; max-HP increase does not heal.
- historical Hunt replay remains byte/semantic compatible with its original version.
- ownership, OCC, idempotency and foreign-resource indistinguishability tests.

## 11. Acceptance evidence and implementation gate

Class-A semantic acceptance is complete through the coordinated SPEC-020 package:

1. coordinated SPEC-003/007/013/014/015/016/017 amendment review completed;
2. independent semantic and architecture/replay QA completed READY at P0/P1/P2 = 0/0/0;
3. Human Owner explicitly accepted the package on 2026-10-02.

Migration, runtime implementation, enablement and Git-history operations remain separately authorized/gated.
