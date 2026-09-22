# SPEC-010 — Move Acquisition / Eligibility Rules

- Status: APPROVED
- Owner: Human Owner
- Coordinator: ChatGPT
- Related ADRs: ADR-005
- Related tasks: TASK-019, TASK-020, TASK-021, TASK-022, TASK-024, TASK-087, TASK-088, TASK-089, TASK-025

## 1. Problem

PokeNexus already has:

- immutable canonical Move and Learnset facts in versioned game data;
- authoritative Pokémon Level/XP;
- a persisted ordered dense `1..4` selected Move Loadout;
- structural persistence/OCC for replacing that loadout.

It intentionally does **not** yet have the server authority that answers:

> Which Moves may this owned Pokémon select into its loadout now?

Raw Learnset membership cannot answer that question by itself. A Learnset row is source-derived
factual evidence scoped to one accepted game-data context; it is not proof that the player has
acquired or unlocked every referenced Move. Likewise, a client-supplied MoveId, current Level,
Inventory Item or machine label cannot grant authority by itself.

TASK-088 defines that missing rule boundary for v1.

## 2. Goals

- Define one deterministic server-authoritative Move eligibility contract for loadout mutation.
- Use the accepted modern Core Learnset baseline without converting every learn method into gameplay.
- Make Level-based Move availability useful without introducing a separate learned-set persistence
  model that v1 does not need.
- Bootstrap new/staged Pokémon into a valid selected loadout deterministically.
- Preserve existing persisted loadouts across later static/rule corrections.
- Keep future TM/tutor/egg/evolution/transfer acquisition extensible without smuggling those rules
  into v1.
- Give TASK-089 an implementation-ready domain/application contract and TASK-025 a safe API boundary.

## 3. Non-goals

- Move execution/effects/cooldowns/targets;
- damage or combat-balance changes;
- automatic combat Move-selection policy beyond the already accepted ordered-loadout consumption;
- evolution;
- breeding/egg production or inherited-Move rules;
- tutor content;
- transfer/import features;
- TM Item↔Move static relation publication;
- TM consumption, reusability, rarity, scarcity or economy;
- paid Move acquisition or monetization;
- public API implementation;
- database/runtime implementation.

## 4. Normative terminology

### 4.1 Canonical Learnset row

A `LearnsetEntryV1` is an immutable factual row from one exact `gameDataVersion`:

- SpeciesId;
- MoveId;
- source generation/game;
- learn method;
- level for `level-up`;
- machine identifier for `machine`;
- provenance.

The row is evidence, not executable acquisition authority.

### 4.2 Selected Move Loadout

The selected loadout remains the SPEC-005 persisted ordered dense sequence of `1..4` distinct
MoveIds. It is configuration, not the complete set of Moves a Pokémon can select.

### 4.3 Level-derived Move availability

For v1, this is the only executable source of Move eligibility.

For Pokémon instance `P`, Species `S`, current authoritative Level `L`, exact game-data version
`G`, and exact top-level SPEC-002 `rulesVersion` `R`:

1. resolve the exact accepted `{G,R}` compatibility context;
2. resolve exactly one playable/selected Learnset source context
   `{sourceGeneration, sourceGame}` for `S` inside `G`, and use only rows from that context;
   zero or multiple selected contexts fail closed;
3. retain only rows whose method is `level-up`;
4. group rows by MoveId;
5. for each MoveId define:

   `unlockLevel(move) = minimum(level) across its canonical level-up rows`;

6. the Move is level-available iff `unlockLevel(move) <= L`.

No non-level method contributes to the v1 eligible set.

### 4.4 Eligible Move set

In v1:

`eligibleMoves(P,G,R) = levelDerivedMoves(P,G,R)`

There is no separate persistent learned/acquired Move inventory.

The set is recomputed from authoritative Pokémon state plus the exact accepted static/rules context
when a new loadout/bootstrap operation is evaluated.

## 5. Version and authority contract

For every new authoritative bootstrap or player-facing loadout mutation, the **server** selects the
exact `{gameDataVersion, rulesVersion}` from accepted release/configuration authority. A client
cannot choose either version axis as authoritative command input.

The selected exact pair must have an explicitly retained immutable compatibility record.
Independent resolution of the two version axes is insufficient.

The immutable compatibility fact for an exact pair is distinct from whether that retained pair is
currently allowed for **new** operations. Release metadata may later deprecate a retained exact pair
for new use while preserving its immutable compatibility/history resolution.

The Move-eligibility rule artifact/configuration identity for this baseline is:

`pokenexus.move-eligibility.level-up-only.v1`

A published `rulesVersion` used for these operations must have an immutable resolution descriptor
that resolves that exact rule artifact/configuration identity **and its retained accepted
semantics/hash**. The artifact identity is not a fourth top-level version axis and is not itself the
`rulesVersion`.

A new operation fails closed when:

- the exact pair has no retained immutable compatibility record;
- the retained exact pair is currently disallowed/deprecated for new operations;
- the exact `rulesVersion` does not resolve
  `pokenexus.move-eligibility.level-up-only.v1`;
- the Species or any proposed Move cannot resolve from the exact game data;
- required Learnset rows are unavailable/malformed;
- authoritative Pokémon ownership/state cannot be established;
- expected Pokémon `rowVersion` is stale;
- the resulting/proposed loadout violates SPEC-005 structure.

Once the server has selected the exact pair for one operation, no latest/current fallback,
pair substitution or rulesVersion substitution may reinterpret that same operation under another
data/rules pair.

## 6. Current v1 learn-method policy

The static schema recognizes:

- `level-up`;
- `evolution`;
- `machine`;
- `egg`;
- `tutor`;
- `transfer`;
- `reminder`.

Their v1 executable meaning is:

| Learn method | v1 loadout eligibility authority |
|---|---|
| `level-up` | **Enabled** when `unlockLevel <= current Level` |
| `evolution` | Disabled; evolution is not an accepted feature yet |
| `machine` | Disabled; no accepted ItemId↔machine/Move authority or use semantics |
| `egg` | Disabled; breeding/inheritance is not an accepted feature yet |
| `tutor` | Disabled; tutor acquisition/content is not defined |
| `transfer` | Disabled; transfer/import acquisition is not defined |
| `reminder` | Disabled as an independent source; v1 level availability already remains selectable without forgetting |

Presence of a disabled-method row does not grant current Move eligibility.

## 7. Level-up behavior

When Pokémon XP changes Level:

- the selected persisted Move Loadout is **not** automatically changed;
- no Move is automatically inserted, removed, reordered or forgotten;
- no separate learned-set row is written;
- the set of Moves eligible for a later loadout mutation is recomputed from the new Level.

This preserves player configuration and avoids coupling progression persistence to Move mutation.

A UI/application layer may report newly available Moves by comparing the prior and new derived
eligible sets, but that derived notification is not durable acquisition authority.

## 8. Deterministic bootstrap

### 8.1 Applicability

Bootstrap applies when an owned Pokémon has no valid selected Move Loadout because:

- it is newly created by an authoritative creation source; or
- it is an existing staged/uninitialized instance from the TASK-020 migration boundary.

Bootstrap never rewrites a Pokémon that already has a valid selected `1..4` loadout.

### 8.2 Candidate set

Compute the v1 eligible set using section 4 under the Pokémon's current authoritative Level and the
exact accepted `{gameDataVersion,rulesVersion}`.

If the set is empty, bootstrap fails closed. It must not borrow a Move from a disabled method, lower
a level requirement, use a client suggestion or fall back to another game-data version.

### 8.3 Selection and order

For every eligible Move, retain `unlockLevel(move)`.

Sort eligible Moves by:

1. `unlockLevel` descending — most recently unlocked first;
2. ascending lexicographic comparison of the UTF-8 encoding of the canonical MoveId exactly as
   published; canonical publication already guarantees the accepted NFC form. Each UTF-8 byte is
   compared as an unsigned integer `0..255`; if one byte sequence is a strict prefix of another,
   the shorter sorts first.

Select the first `min(4, eligibleMoveCount)` MoveIds. Persist them in that same order as slots
`1..N`.

The tie-breaker is intentionally independent of parser/source row order. Source-page ordering is
not part of the accepted runtime Learnset contract and therefore cannot influence gameplay. Runtime
comparison performs no locale collation, case-folding or re-normalization of client/persisted opaque
IDs; canonical static IDs were already normalized by the accepted publication pipeline.

### 8.4 Current-catalog feasibility

For the currently published Core Kanto/Johto v2 catalog, every published Species/form has at least
one `level-up` Move at Level 1, so the baseline can bootstrap all current Species/forms.

TASK-089 must retain a catalog-wide regression proving this for every game-data version enabled for
new v1 bootstrap operations. A future catalog that violates the precondition is not silently
repaired by runtime fallback; affected bootstrap fails closed until data/rules are explicitly
corrected.

## 9. Player-facing loadout mutation

A player-facing replacement command proposes one complete ordered `1..4` MoveId list.

The authoritative application layer must:

1. authenticate the subject;
2. load the owned Pokémon and expected `rowVersion`;
3. resolve the exact accepted `{gameDataVersion,rulesVersion}`;
4. compute the current v1 eligible Move set from authoritative Species + Level;
5. require every proposed MoveId to belong to that set;
6. require SPEC-005 cardinality/density/distinctness;
7. perform the existing TASK-020 atomic complete replacement under expected `rowVersion`.

A stale/not-owned/not-found/invalid/ineligible command mutates nothing.

The database repository remains persistence-only and does not infer Move eligibility.

## 10. Static-data/rules correction behavior

### 10.1 Existing selected loadout

A later static-data or eligibility-rule correction does not silently rewrite, delete, reorder or
re-bootstrap an already accepted persisted loadout.

### 10.2 New mutation

A later player-facing mutation is validated under its then-authoritative exact accepted context.
Therefore a Move that is no longer currently eligible may remain in the old persisted loadout, but
cannot be carried forward through a new complete replacement unless it is eligible under the new
operation's context.

Consequently, v1 deliberately has **selected-only grandfathering**:

- a correction may remove a formerly eligible but **unselected** Move from future derived
  eligibility immediately;
- an already-selected now-ineligible Move remains in the persisted legacy loadout under SPEC-005;
- because mutation is complete replacement, any later edit cannot carry that currently-ineligible
  legacy Move forward and may require the player to drop it.

This asymmetry is an explicit v1 product rule, not an implementation accident.

### 10.3 Running gameplay scope

Battle/Hunt behavior remains governed by SPEC-003/SPEC-005 pinning. A running scope keeps its pinned
resolved loadout/context. A later persistent edit or data correction does not rewrite that running
scope.

If a fresh gameplay scope cannot resolve a persisted Move under its required exact pinned context,
it fails closed; persistence is not silently rewritten as a repair mechanism.

## 11. No durable learned/acquired Move state in v1

TASK-089 must not add a generic learned-Move table solely because canonical Learnset rows exist.

The v1 level-derived eligible set is reproducible from:

- Pokémon SpeciesId;
- authoritative current Level;
- exact immutable game-data version;
- exact accepted Move-eligibility rules version.

V1 intentionally defines **current availability**, not permanent per-Pokémon Move acquisition.
TASK-089 must therefore not persist the derived eligible set as learned/acquired state.

Adding durable learned/acquired Move state later is a semantic extension, not merely a caching or
storage optimization: it would change permanence, correction/grandfathering and future acquisition
behavior and therefore requires explicit accepted rules.

## 12. Future acquisition methods

Enabling any currently disabled method requires an explicit accepted rules extension.

### 12.1 Machine / TM

A future machine rule must not treat `machineIdentifier` as:

- an ItemId;
- a globally unique Move identity; or
- sufficient proof of player ownership/use authority.

Machine identifiers are scoped by source generation/game context. If PokeNexus exposes machine
Items, canonical ItemId↔Move/machine relations must be published through the accepted SPEC-002
static-data extension boundary.

The future rule must explicitly decide:

- compatibility authority;
- reusable versus consumable behavior;
- consume-on-success/failure semantics;
- whether teaching creates permanent per-Pokémon acquisition state;
- idempotency/OCC/atomic Inventory + Pokémon mutation behavior.

Any scarcity/economy/paid-acquisition proposal adds PXE review before Human acceptance.

### 12.2 Tutor / egg / transfer / reminder / evolution

Each method requires an owning feature/rule that defines its authoritative event/source,
eligibility, persistence and correction/version semantics. Static method presence alone remains
insufficient.

If a future method creates permanent per-Pokémon acquisition that cannot be recomputed from current
instance state + immutable static/rules context, that extension may introduce append-only/durable
acquired-Move evidence. Such persistence is **not** part of v1.

## 13. TASK-089 implementation handoff

TASK-089 should implement:

- a pure deterministic Move eligibility evaluator;
- a pure deterministic bootstrap selector;
- server-authoritative exact static/rules pair selection;
- retained immutable pair-compatibility validation separately from current new-use eligibility;
- exact `rulesVersion` descriptor resolution of
  `pokenexus.move-eligibility.level-up-only.v1` and its retained semantics/hash;
- application orchestration for bootstrap and complete loadout replacement;
- ownership + expected-rowVersion revalidation before mutation;
- catalog-wide regression over every new-use-enabled v1 game-data version;
- no unrestricted MoveId write surface;
- no generic learned-set persistence in this baseline.

The persistence repository from TASK-020 remains responsible only for structural/OCC mutation.

## 14. TASK-025 API handoff

TASK-025 may expose:

- current selected Move Loadout reads;
- current derived eligible Move reads if useful;
- complete ordered loadout replacement.

It may do so only through TASK-089 authoritative application services.

The API must not expose:

- arbitrary MoveId setters bypassing eligibility;
- learned-set mutation;
- client-selected Level/rules/game-data authority;
- machine/TM use before a future accepted extension.

## 15. Edge cases

- Multiple level-up rows for the same Move: earliest level wins as `unlockLevel`.
- Same Move appears through level-up and disabled methods: level-up rule alone determines v1
  availability.
- More than four eligible Moves: deterministic bootstrap chooses the top four by section 8.3;
  player may later replace/reorder within the eligible set.
- Exactly one eligible Move: valid one-slot bootstrap.
- Zero eligible Moves: fail closed; no disabled-method fallback.
- Pokémon already has a valid loadout: bootstrap is a no-op/not-applicable, not an overwrite.
- Stale Pokémon rowVersion between eligibility read and write: no mutation; caller reloads and
  recomputes eligibility against fresh authoritative state/context.
- Static correction removes an unselected Move: it disappears from future derived eligibility.
- Static correction removes eligibility for a selected Move: old persisted loadout remains; a new
  replacement must satisfy current eligibility and therefore cannot carry the legacy-ineligible Move
  forward unless it has become eligible again.
- Exact context deprecated for new use: no new bootstrap/mutation; existing persisted loadout is not
  deleted.
- Historical immutable context still exists: historical gameplay/replay follows the owning
  Battle/Hunt pinning rules; this spec does not reinterpret it as permission for new mutation.

## 16. Acceptance

SPEC-010 is acceptable only when:

1. static Learnset evidence and executable eligibility remain separate;
2. v1 level-derived eligibility is exact and deterministic;
3. bootstrap is deterministic and never depends on incidental source/parser row ordering;
4. progression never silently rewrites player loadout configuration;
5. existing loadouts survive later static/rules corrections without silent persistence repair;
6. new mutation always validates the complete replacement against current authoritative eligibility;
7. disabled Learnset methods confer no v1 authority;
8. machine identifiers are never mistaken for ItemId/global Move identity;
9. no learned/acquired persistence is introduced without a rule that actually requires it;
10. exact server-selected `{gameDataVersion,rulesVersion}` compatibility is mandatory for new
    operations, with immutable compatibility kept distinct from current new-use eligibility;
11. the selected `rulesVersion` resolves the immutable
    `pokenexus.move-eligibility.level-up-only.v1` artifact semantics/hash rather than being
    conflated with that artifact identity;
12. GSC advisory review is complete;
13. independent QA has no unresolved P0/P1 finding;
14. the Human Owner explicitly accepts the full semantic baseline.

## 17. Open decisions

The Human Owner accepted the following decisions in full on 2026-09-22:

1. adopt **level-up only** as executable v1 Move availability;
2. persist **no** separate learned/acquired Move set in v1;
3. do **not** enable TM/machine/tutor/egg/evolution/transfer/reminder acquisition in v1;
4. use the deterministic bootstrap ordering:
   `unlockLevel DESC, canonical MoveId byte order ASC`;
5. never auto-replace/reorder selected Moves on Level-up;
6. require a server-selected exact accepted `{gameDataVersion,rulesVersion}` for every new
   bootstrap/loadout mutation, with retained compatibility separate from current new-use
   eligibility/deprecation;
7. accept the intentional selected-only grandfathering rule: corrections may remove unselected
   future availability, while already-selected legacy Moves remain until the next complete loadout
   replacement.

The accepted pre-transition semantic snapshot SHA-256 was
`810632522A8D12834AD7AEC2BEB5F2ADE3C45F11DCAC08DCE4D5A43206235363`.

No production implementation or repository-history action is authorized by this approval alone.
