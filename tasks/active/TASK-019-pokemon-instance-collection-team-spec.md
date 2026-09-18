# TASK-019 — Pokémon Instance / Collection / Team Spec

## Metadata

- State: READY
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor (concurrency/integrity spot-check)
- Auditor execution surface: fresh independent ChatGPT worker
- Spec:
  - `docs/specs/SPEC-005-pokemon-instance-collection-team.md`
- Related specs:
  - `docs/specs/SPEC-001-core-domain-model.md`
  - `docs/specs/SPEC-002-static-game-data-and-versioning.md`
  - `docs/specs/SPEC-003-combat-rules-v1.md`
  - `docs/specs/SPEC-004-postgresql-schema-v1.md`
- Related ADRs:
  - `docs/decisions/ADR-004-universal-combat-engine-architecture.md`
  - `docs/decisions/ADR-005-persistence-data-access-strategy.md`
- Branch: `spec/TASK-019-pokemon-instance-collection-team-spec`
- Worktree: `.worktrees/TASK-019-pokemon-instance-collection-team-spec`

## Objective

Define and obtain Human Owner acceptance for the v1 persistent Pokémon Instance, private Collection,
selected Ability, ordered Move Loadout and saved Pokémon Team contract before TASK-020 adds domain
services, repositories or forward schema migrations.

The specification must make ownership, mutation, ordering, cardinality, duplicate/reuse, concurrency
and snapshot/pinning behavior explicit without stealing progression, item, capture, Hunt, public API or
social-profile semantics from their owning tasks.

## Context

TASK-018 is DONE and the persistence/auth baseline is integrated. SPEC-001 defines Pokémon Instance,
Move Loadout, Pokémon Team and Team Slot vocabulary. SPEC-003 already fixes the universal battle
Move Loadout to an ordered `1..4` distinct `MoveId` sequence and states that persistent player-side
selection/order belongs to TASK-019+. SPEC-004 already persists Pokémon ownership, SpeciesId, Level,
IVs and Team aggregates but intentionally leaves selected Ability, Move Loadout persistence and Team
slot/cardinality/duplicate rules for this task.

TASK-019 is a Class A product/rules specification. Its output is SPEC-005; no production source,
migration or dependency change is authorized here. TASK-020 may not implement these rules until
SPEC-005 is accepted by the Human Owner and TASK-019 completes the required review/acceptance flow.

## Accepted v1 direction

The Human Owner accepted the following SPEC-005 v1 direction on 2026-09-17:

1. **Collection is ownership-derived, not a second aggregate.** A player's private Collection is the
   set of Pokémon Instances whose authoritative `ownerPlayerId` is that player. No CollectionId,
   collection-capacity rule or public/social collection contract is introduced.
2. **Baseline instance facts remain narrow.** SpeciesId and IVs are not mutable by TASK-020; Level
   remains `1..200` and is mutable only through later accepted progression rules. Derived combat
   stats are never persisted as truth.
3. **Ability selection is zero-or-one durable instance state.** `selectedAbilityId` may be null.
   A non-null value must have been server-authoritatively validated as eligible for the Species under
   the accepted selection context. Ordinary player editing cannot reroll/change Ability in v1;
   future Ability-changing items/mechanics require another accepted rule.
4. **Persistent Move Loadout is exactly SPEC-003's structure:** an ordered dense `1..4` list of
   distinct MoveIds. The loadout is selected state, not a complete learned-move inventory.
5. **Move acquisition remains separate from loadout structure.** A loadout mutation may include only
   MoveIds authorized by a server-side eligible-move source owned by an accepted progression/item/
   content rule. Until such a source exists, no unrestricted public player loadout write may be
   exposed merely because TASK-020 can persist slots.
6. **Saved Team roster is ordered, dense and bounded to six slots.** A saved Team may contain
   `0..6` Pokémon Instances; empty is allowed as a draft/edit state but is not battle-eligible.
   Populated slots are contiguous `1..N` with no holes.
7. **No duplicate Pokémon inside one Team.** One Pokémon Instance may appear at most once in a given
   Team.
8. **Cross-Team reuse is allowed.** The same Pokémon Instance may appear in multiple saved Teams for
   the same owner. Saved presets do not create exclusive ownership/locking.
9. **Team mutation is aggregate-atomic and OCC-guarded.** Canonical mutation replaces/reorders the
   complete roster under expected Team `rowVersion`; membership rows and version increment commit in
   one transaction. UI-style add/remove/move actions may compile to that semantic operation.
10. **Saved Team order is persistent preference, not Combat Engine authority.** Mode specs decide how
    saved order maps to active/reserve lineup. A Hunt/Battle/cadence scope resolves and pins its own
    immutable snapshot; later Team/loadout edits do not rewrite an already-running scope.
11. **No Team display-name field in baseline v1.** Naming/presentation metadata is deferred until an
    owning product/UI contract requires it.
12. **Accepted Ability/loadout state is durable across later static-data eligibility corrections.**
    Later data changes do not silently reroll/remove persisted selections; new mutations use current
    authoritative eligibility and gameplay still resolves under its pinned static/rules context.
13. **Team deletion is OCC-guarded and atomic.** Delete requires expected Team `rowVersion`; stale
    delete fails closed and an already-pinned gameplay snapshot remains unaffected.
14. **No domain-level saved-Team-count cap or global active-Team pointer in v1.** TASK-025/API
    operations must define any player-facing storage quota before exposing creation; a mode explicitly
    selects and pins the Team it uses.

These rules are accepted as the SPEC-005 v1 product contract.

## Scope

### 1. Pokémon Instance and private Collection contract

- define private Collection as the owner-derived set of Pokémon Instances;
- preserve `PokemonInstanceId` as durable identity and `ownerPlayerId` as server-authoritative
  ownership;
- freeze TASK-020 mutation authority for SpeciesId/IVs and defer transfer/trade/evolution semantics;
- retain accepted Level `1..200` domain while deferring XP/source/curve semantics to TASK-021;
- keep derived combat stats computed from authoritative inputs under pinned static/rules context.

### 2. Selected Ability contract

- define `selectedAbilityId: AbilityId | null` instance state;
- validate non-null assignment against authoritative Species Ability eligibility rather than display
  name or PokémonDB prose;
- define normal v1 mutation policy and interaction with missing executable AbilityRule;
- define that future Ability-changing items/mechanics need separately accepted rules.

### 3. Persistent ordered Move Loadout

- persist ordered dense `1..4` distinct MoveIds per Pokémon Instance;
- preserve SPEC-003 order semantics and no-duplicate invariant;
- define aggregate/version mutation behavior;
- separate selected loadout from learned/owned move acquisition;
- require a server-authoritative eligible-move source before player-facing mutation can select a Move;
- preserve active Hunt/Battle/cadence snapshot immutability after scope start.

### 4. Saved Pokémon Team contract

- define saved Team roster as ordered dense `0..6` Pokémon Instance references;
- prohibit duplicate instance references inside one Team;
- permit the same Pokémon Instance in multiple saved Teams;
- require every member to share the Team owner's authoritative Player ownership;
- define Team `rowVersion` / atomic roster replacement semantics;
- define empty saved Team vs battle/mode admission distinction;
- leave mode-specific active capacity, forced replacement and eligibility to mode/rules specs.

### 5. Persistence handoff for TASK-020

SPEC-005 must make later forward migration constraints unambiguous, including:

- nullable selected Ability persistence on the Pokémon aggregate;
- ordered Move Loadout slot storage with slot `1..4`, one Move per slot and no duplicate MoveId per
  Pokémon loadout;
- Team slot storage with slot `1..6`, one Pokémon per slot and no duplicate Pokémon per Team;
- parent aggregate `row_version` update in the same transaction as loadout/Team child-row mutation;
- ownership-consistent relational constraints;
- no synthetic ordering of pre-existing unordered Team membership using opaque IDs, timestamps or
  incidental row order. TASK-020 must prove the table is empty for the conversion or return with an
  explicit reviewed conversion decision instead of inventing product semantics.

## Out of scope

- production TypeScript, SQL migrations, repositories or API implementation;
- capture probability/acquisition, Pokémon grant/reward generation or encounter rules;
- XP sources, XP curves, level-up transaction semantics or post-cap progression (TASK-021);
- evolution, breeding, EVs, Natures, nickname/customization or release mechanics;
- item/TM/tutor consumption, Move acquisition inventory and Ability-changing items (TASK-022+);
- public profile/collection/team visibility or social sharing;
- arbitrary Player/Pokémon lookup API semantics;
- Hunt/Gym/PvP/Duo/World Boss team-admission rules or active-capacity semantics;
- combat resolver changes, Move/Ability executable effects or ActionIntent selection logic;
- Team display names, icons, favorites or UI presentation metadata;
- trading/transfer/economy ownership changes;
- new dependencies or runtime/deployment configuration;
- Git commit/push/merge/rebase/reset/force without separate Human Owner repository-history authorization.

## Acceptance criteria

- [x] SPEC-005 is consistent with SPEC-001 vocabulary and preserves Pokémon Instance / Combatant /
      Pokémon Team / BattleSide separation.
- [x] Collection ownership semantics are server-authoritative and do not invent a second Collection
      aggregate or public/social visibility.
- [x] SpeciesId, IV, Level and derived-stat ownership are compatible with SPEC-003/004 and do not
      steal TASK-021 progression/evolution rules.
- [x] Selected Ability cardinality, eligibility and mutation policy are explicit and do not infer
      executable behavior from PokémonDB prose.
- [x] Persistent Move Loadout is ordered `1..4`, dense and duplicate-free exactly as required by
      SPEC-003.
- [x] Move selection cannot accept arbitrary client MoveIds as authority; the eligibility source is
      explicitly separated from loadout storage/mutation.
- [x] Saved Team cardinality/order/sparsity/duplicate rules are explicit.
- [x] Cross-Team reuse policy is explicit.
- [x] Team and loadout mutation semantics are OCC-safe and aggregate-atomic.
- [x] Team deletion has explicit expected-rowVersion, atomicity and pinned-snapshot behavior.
- [x] Persisted Ability/loadout state has explicit behavior when later static eligibility/data changes.
- [x] Saved-Team count and active-Team authority are explicitly owned rather than silently inferred.
- [x] Running Battle/Hunt/cadence snapshots are not retroactively changed by persistent Team/loadout
      edits.
- [x] Persistence handoff is concrete enough for TASK-020 to create forward migrations without
      inventing slot/cardinality/uniqueness semantics.
- [x] Existing unordered Team rows are never assigned gameplay order by opaque ID/timestamp accident.
- [x] No production source, SQL migration, dependency, lockfile or runtime config changes in TASK-019.
- [x] Independent QA reports no unresolved P0/P1 product/architecture/implementation-handoff finding.
- [x] Independent Auditor reports no unresolved P0/P1 concurrency/integrity finding on the proposed
      Team/loadout aggregate mutation model.
- [x] Human Owner explicitly accepts SPEC-005 before TASK-020 may implement these semantics.

## Validation / review

During DRAFT/approval preparation:

```text
corepack pnpm roadmap:generate
corepack pnpm roadmap:check
git diff --check
```

Also verify:

- diff is limited to TASK-019, SPEC-005 and roadmap planning artifacts;
- no `packages/**`, `apps/**`, migration, manifest, lockfile or runtime-config change;
- SPEC-003's loadout/cadence snapshot contract is not weakened;
- SPEC-004's ownership/OCC foundations remain valid;
- no move-acquisition, Ability distribution, evolution or mode-specific Team rule is silently
  invented outside the explicit SPEC-005 proposal;
- every recommendation requiring Human product judgment remains visibly marked as proposed until
  accepted.

Final pre-implementation gate evidence:

- exact-snapshot QA: `P0/P1/P2/P3 = 0/0/0/0` — READY for Human acceptance;
- exact-snapshot Independent Auditor: `P0/P1/P2/P3 = 0/0/0/0` — PASS;
- Human Owner explicitly accepted SPEC-005 in full on 2026-09-17;
- accepted snapshot before the metadata-only READY transition:
  - TASK-019 SHA-256: `AFAEA7D673C0A7D31A8723219D7258BFA9B13FC7595148907B95C0EAA19C503B`;
  - SPEC-005 SHA-256: `7B1F5E9AC170C1ACA3F99FA6FE89851B77B9440672AB2013B4247C1139725404`;
  - roadmap MD SHA-256: `ED82C7CC95CC4E7C641427CB867D6B0AD4AF07B652A43069B75F44C749612939`;
  - roadmap HTML SHA-256: `2D63E341FE539F708F24CDFC2FF48449895F1875EE5CE62F9B09B68362434B63`.

## Dependencies

- TASK-004 — Domain Glossary & Core Model Spec: DONE.
- TASK-006 — Static Game Data Schema & Rules Versioning: DONE.
- TASK-008 — Combat Rules Spec v1: DONE.
- TASK-013 — PostgreSQL Schema v1: DONE.
- SPEC-001/002/003/004: APPROVED.
- ADR-004/005: ACCEPTED.

## Risks / irreversible actions

- Choosing Team size/order/duplicate semantics incorrectly would freeze UX and persistence assumptions
  into later migrations and APIs.
- Treating saved-Team order as direct Combat Engine lineup authority would couple persistence presets
  to mode-specific battle rules.
- Persisting arbitrary client-selected MoveIds without an authoritative eligibility source would
  create a rules/integrity bypass.
- Revalidating old selected Ability/loadout state against changing static facts on every read could
  silently mutate or invalidate durable player state; mutation-time authority and battle snapshot
  semantics must remain explicit.
- Leaving saved-Team count unlimited at the public API without an operational quota would permit
  avoidable storage abuse; SPEC-005 keeps this out of domain rules but requires TASK-025/API policy
  before creation is exposed.
- Backfilling order into currently unordered Team membership by UUID/timestamp would invent gameplay
  semantics from infrastructure artifacts.
- Requiring exactly one non-null Ability before broad AbilityRule coverage exists could make otherwise
  valid Pokémon unusable; the DRAFT therefore recommends zero-or-one selected Ability.
- Allowing the same Pokémon in multiple saved Teams simplifies presets but requires later live-mode
  orchestration to pin/validate the chosen Team rather than treating saved membership as an exclusive
  lock.
- Repository-history operations remain separately Human Owner gated.

## Expected files / boundaries

```text
docs/specs/SPEC-005-pokemon-instance-collection-team.md
tasks/active/TASK-019-pokemon-instance-collection-team-spec.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

No production package, migration SQL, manifest, dependency, lockfile or runtime configuration change
is authorized by TASK-019.

## Completion

TASK-019 is READY. Independent QA and the required Independent Auditor review are clear, and the
Human Owner explicitly accepted SPEC-005 in full on 2026-09-17. The Class A pre-implementation
product/rules gate is satisfied. Repository-history/completion operations remain separately Human
Owner gated; no commit, push, merge or TASK-020 implementation is authorized by this metadata-only
transition.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
