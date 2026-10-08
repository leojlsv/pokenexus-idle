# SPEC-027 — Starter Level-Five Bootstrap Amendment

- Status: APPROVED — explicit Human Owner direction on 2026-10-07T15:33:21Z
- Owner: Human Owner
- Implementation: TASK-122, existing trusted TASK-109 bootstrap
- Amends: only the starter creation baseline in SPEC-020
- Related: SPEC-002, SPEC-006, SPEC-010, SPEC-021

## 1. Approved scope

New starters begin at **Level 5**, replacing the Level-1 creation baseline in SPEC-020. The six choices remain Bulbasaur, Charmander, Squirtle, Chikorita, Cyndaquil and Totodile. This amendment takes precedence over SPEC-020 only for that creation baseline and its level-derived initialization; other SPEC-020 semantics are unchanged.

SPEC-006 supplies initial cumulative Pokémon XP `xpFloor(5) = 5^3 - 1 = 124`. This is creation state, not a Hunt reward or Player-XP grant. Player Level remains 1 with zero Player XP. Initial vitality is full HP derived at Level 5 from the existing base stats, IVs and Genetic bonuses under the accepted rules pair, as required by SPEC-021.

Bootstrap still creates exactly one starter, one one-member Team with that starter as Leader, and Inventory **50 Poké Balls / 20 basic Potions / 5 Revive-25** atomically per Player.

## 2. Moves and immutable content authority

The existing SPEC-010 selection uses level-up Moves available through Level 5 intersected with executable production support under the exact accepted game-data/rules pair. Sort by unlock level descending and canonical MoveId UTF-8 ascending; select at most four. Require an executable progress-capable Move. Do not use unsupported Moves, invent missing slots or change the ordering policy.

For the current `game-data-core-kanto-johto-v5` publication, the ordered executable loadouts are:

| Starter | Ordered Moves |
|---|---|
| Bulbasaur | Vine Whip → Growl → Tackle |
| Charmander | Growl → Scratch |
| Squirtle | Water Gun → Tackle → Tail Whip |
| Chikorita | Growl → Tackle |
| Cyndaquil | Leer → Tackle |
| Totodile | Leer → Scratch |

Ember is level-available for Charmander but remains unsupported in the pinned production catalog. This amendment does not authorize adding or approximating its behavior.

New creation uses immutable `player-bootstrap-prealpha-v2`, whose content hash covers Level 5, XP124, the existing progression-rule identity, ordered loadouts, inventory and origin prefix `player-bootstrap-starter-v2`. Retain the exact v1 content/hash and provenance; do not relabel v1 births as v2. The canonical v2 hash is `sha256:a8ed10eaa73f4105da2c08a62d69df823983bbc6640a1121b2fc6195798304ae`.

## 3. Existing accounts and replay

Historical bootstrap-v1 records retain their exact Level-1 creation authority and provenance. Repeating Bootstrap for the same Player/starter returns the original committed aggregate without promoting, healing, replacing Moves, rerolling individualization or regranting Inventory. Preserve later progress and row versions. A different starter choice remains a conflict.

This forward creation rule does not convert existing Pokémon or rewrite Hunt snapshots, pending encounter selections, combat history or rewards. Applying the baseline to existing A/B test accounts requires a separately authorized local conversion. Reload, Stop/Start and Bootstrap replay are not migration mechanisms; Reset is not required or authorized by this amendment.

## 4. Unchanged boundaries

Wilds levels 1/2/3, encounter weights, captured Pokémon levels, stat formulas, cooldowns, initiative, item behavior, Genetics, reward amounts and Player progression remain unchanged. No new public endpoint, eligible-Moves capability, CombatPresentation exposure, TASK-120/121 implementation, production migration, deployment or Git-history action is authorized.

## 5. Validation

Validate the six actual catalog starters, Level/XP consistency and next XP grant, full derived HP, exact persisted Move order, Player1/XP0 and stock50/20/5. Preserve exact v1 replay after progress/damage/consumption, v2 replay, conflict and concurrent exactly-once creation; reject unsupported version/level/XP tuples and roll back all aggregates on a late failure. Integration execution uses owned disposable PostgreSQL, not preserved A/B accounts. Independent QA and integrity review remain required; this amendment does not claim full M1 acceptance or guaranteed victory.

## 6. Authorized local A/B conversion

The Human Owner separately authorized adapting the existing A/B test starters on 2026-10-07T16:05:58Z. This operation is limited to the existing Bulbasaur and Cyndaquil identified by their local fixture Account/Player, bootstrap, Pokémon and Team identities. It is not a new creation, a gameplay reward or a production migration.

Convert only the inspected Level-1/XP0 baseline to Level 5/XP124, set full HP once using the existing individual's IVs, genetic score and expressed profile, and install the corresponding section 2 ordered loadout. Preserve birth/provenance v1, all genetic/IV/profile/shiny fields, Pokémon/Team identities, Inventory quantities, Player progression, policies, recovery, pending encounter selection and all historical Hunts/checkpoints/rewards. Do not relabel old births as bootstrap v2 or rerun individualization. Increment Pokémon and affected vitality OCC versions rather than resetting them.

The two-account conversion is one bounded local transaction, distinct from normal per-Player bootstrap. Lock existing Hunt roots first in deterministic order, then the affected configuration/vitality rows. Require both Players to have no active Hunt or unfinished persisted command, and verify a frozen before-state plan under those locks. Missing roots, ownership mismatch, progress, configuration drift or a partly converted pair fail closed without changes. Preserve local browser command storage; database checks make no claim about browser-only pending intents.

Save the immutable private before/expected-after plan before applying. Verify that only the two Pokémon's Level/XP/OCC/timestamp, their vitality HP/OCC/timestamp and the required Move loadout rows changed before committing. An exact replay performs no writes; any subsequent gameplay drift refuses conversion rather than healing, changing Moves, removing earned progress or granting again. Independent read-only review and disposable-database tests precede the real local write. No Reset, new schema/table/public API, service restart, history action or other production/public capability is implied.
