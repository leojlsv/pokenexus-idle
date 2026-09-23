# SPEC-012 — Production Move & Ability Rule Content

- Status: APPROVED
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Related ADRs: ADR-004
- Related tasks: TASK-006, TASK-008, TASK-009, TASK-011, TASK-087, TASK-088, TASK-089, TASK-090, TASK-091, TASK-025, TASK-033, TASK-035

## 1. Purpose

Define the first production combat-rule content envelope for PokeNexus without silently extending
the APPROVED SPEC-003 Combat Engine or reinterpreting APPROVED SPEC-010 Move eligibility.

This specification owns which canonical Moves and Abilities are executable in production, the
exact immutable `MoveRule` / `AbilityRule` / `EffectRule` content published under `rulesVersion`,
and the fail-closed boundary for content that the current engine cannot represent faithfully.

It does **not** make factual Pokémon prose executable. Source names/descriptions remain reference
material only; every executable behavior is explicit accepted PokeNexus rule content.

## 2. Current production-content gap

The current `game-data-core-kanto-johto-v2` catalog contains 547 Moves and 147 Abilities. The
SPEC-010 player-facing level-up eligibility path currently reaches 453 distinct MoveIds:

- 180 physical;
- 104 special;
- 169 status;
- 262 with positive numeric factual power;
- 22 physical/special Moves without positive numeric factual power;
- 237 with a captured usable normal Z-A Base Cooldown.

The engine deliberately exposes a smaller semantic algebra. It can directly represent simple
damage plus explicitly authored healing, stat-stage changes, action locks, periodic damage/healing,
persistent effects and the closed Ability reaction surface accepted by SPEC-003. It does not
provide generic implementations for mechanics such as multi-hit, variable/fixed damage, recoil or
drain tied to damage, priority, switching/phazing, weather/terrain, Protect/Substitute-style state,
accuracy/evasion stages, type-changing, copying, item interaction or arbitrary pre-hit modifiers.

Therefore production coverage cannot be inferred from the existence of a MoveDefinition or from
SPEC-010 eligibility. A Move may be valid to select persistently yet still lack faithful executable
combat semantics until this or a later accepted content/rules version supports it.

## 3. Normative separation of concerns

Three independent questions remain separate:

1. **Factual existence** — SPEC-002 / immutable game data says a Move or Ability exists and records
   factual fields/provenance.
2. **Player-facing Move eligibility** — SPEC-010 determines whether a Move may appear in a
   persistent selected Move Loadout.
3. **Combat executability** — this specification and its immutable production rule artifact decide
   whether that Move/Ability has exact executable semantics under a specific `rulesVersion`.

None of these layers may silently substitute for another.

## 4. Production rule-content manifest

TASK-091 must publish one immutable manifest for every production combat `rulesVersion`. The exact
storage/TypeScript representation is implementation-owned, but observable content must include:

- immutable artifact identity and semantic/content hash;
- exact compatible `gameDataVersion` / `rulesVersion` pair authority through the existing SPEC-002
  version envelope;
- one explicit support record for every MoveId in the production coverage universe;
- one explicit support record for every AbilityId that the product chooses to activate in combat;
- exact `MoveRule`, `AbilityRule` and referenced `EffectRule` content for executable entries;
- explicit target-mapping content rather than runtime coercion of factual `sourceTarget` values;
- explicit cooldown source/override result for every executable Move;
- deterministic canonical ordering for manifest serialization/publication;
- validation that every referenced MoveId, AbilityId, TypeId and EffectId resolves exactly;
- no dependency on source description prose at runtime or publication time.

Move support states are closed and explicit:

```text
executable-simple
executable-authored
unsupported
```

`unsupported` is a first-class production result and carries a stable reason code. It is never
compiled to a generic attack, no-op, guessed target or guessed effect.

### 4.1 Exact support universes

For the first paired production publication governed by this specification:

- the **Move support universe** is exactly every distinct MoveId referenced by a `level-up`
  Learnset row in `game-data-core-kanto-johto-v2`: **453 MoveIds**;
- the **Ability support universe** is exactly every AbilityId referenced by a Species/form Ability
  slot in that same game-data version: **147 AbilityIds**.

There must be exactly one support record for every ID in each universe and no support record for an
unknown ID. Missing, duplicate or extra records invalidate publication. Under the accepted
initial Ability policy all 147 records are explicitly `inactive-by-policy`; an omitted Ability is
not equivalent to inactive.

A future accepted game-data version with a different support universe requires a new/reviewed
production support profile and retained semantic hash. TASK-091 cannot silently reuse this v1
profile against a changed universe merely because the artifact identity is still resolvable.

Ability support states are separately explicit:

```text
inactive-by-policy
executable-authored
unsupported
```

`inactive-by-policy` means the exact mode/rules contract deliberately supplies no active combat
Ability while preserving the selected Ability as persistent factual player state. It is not an
implementation failure and must be distinguishable from a missing/unsupported authored Ability.
For the first Solo Hunt baseline, an `inactive-by-policy` Ability does **not** materialize an
`AbilityRule`, and the mode/Battle adapter omits `abilityId` from `BattleCombatantInit`. The
persistent `selectedAbilityId` is not deleted or rewritten. Only `executable-authored` Ability
support may supply an active `abilityId` + matching AbilityRule to a Battle snapshot.

## 5. Simple-damage coverage

A Move may be `executable-simple` only when all of the following are true:

- it is explicitly present in the immutable simple-damage allowlist for this `rulesVersion`;
- factual category is `physical` or `special`;
- factual power is a positive integer;
- factual accuracy is representable by SPEC-003 (`1..100` or accepted always-hit mapping);
- its factual target classification has an exact accepted mapping to the current `TargetScope`;
- cooldown resolves by SPEC-003 precedence: authored override, usable mapped normal Z-A Base
  Cooldown, then the accepted Power+PP fallback;
- the Move is known not to require an omitted mechanic such as multi-hit, recoil, drain, charge,
  variable/fixed damage or another special rule.

Numeric power alone never proves simplicity.

### 5.1 Exact first-release support profile

The per-Move semantic decision is frozen in the companion artifact:

`docs/specs/SPEC-012-production-move-support-v1.json`

The artifact classifies **all 453** current v2 level-up MoveIds and is normative input to TASK-091
rather than a suggestion for TASK-091 to reinterpret. Accepted first-release counts are:

- `27` `executable-simple`;
- `18` `executable-authored`;
- `408` `unsupported`.

The 27 simple entries are intentionally conservative. They require positive numeric power, numeric
accuracy, a section 7 target mapping, and design-time complementary-source evidence that no
additional mechanic is listed. The evidence is hashed/identified in the companion artifact; source
prose is not copied into executable content and is never consulted at runtime. An empty effect cell
is only a **classification review input**. Executability exists because the Human-accepted rules
artifact explicitly allowlists the Move, not because runtime code inferred semantics from a page.

The 18 authored entries are deliberately limited to exact existing primitives and mapped factual
Z-A base cooldowns:

`acid-armor`, `agility`, `amnesia`, `bulk-up`, `calm-mind`, `charm`, `cotton-guard`,
`fake-tears`, `growl`, `harden`, `iron-defense`, `leer`, `nasty-plot`, `recover`, `screech`,
`swords-dance`, `tail-whip`, `work-up`.

Their complete proposed PokeNexus MoveRules, including exact stage deltas or half-max-HP Recover,
targets and cooldowns, are stored in the companion artifact. All other status/complex mechanics are
unsupported in this first DRAFT rather than partially approximated.

The companion artifact also records all **147** current AbilityIds as `inactive-by-policy` under the
recommended initial Ability policy; no current Ability identity is silently absent.

The companion artifact SHA-256 for this approved first-release profile is
`1462b33b35e38224b505240dbf5205104e98dae1310d0bc630e2aa02fb31879e`.

## 6. Authored Move coverage

A Move may be `executable-authored` only when its complete intended PokeNexus behavior can be
expressed with already accepted SPEC-003 primitives. Authored content may compose:

- direct physical/special damage using the accepted direct-hit pipeline;
- self/target healing by exact integer or max-HP fraction;
- battle-local `atk/def/spa/spd/spe` stage deltas;
- battle/cadence action locks;
- application/removal of explicit `EffectRule` instances;
- periodic damage/healing with exact authored timing, lifetime and stacking semantics.

Authorship does not authorize a new engine primitive. If faithful behavior requires mechanics
outside SPEC-003, the Move remains `unsupported` until a later Class A extension explicitly adds
that mechanic.

## 7. Target mapping

Factual `MoveDefinition.sourceTarget` values are not executable scopes. The production artifact
must publish a closed mapping only where the current engine semantics are exact.

At minimum these structural mappings are candidates for direct publication when the complete Move
semantics agree:

- `self` -> `self`;
- an exact single-opponent classification -> `singleEnemy`;
- an exact other-active-ally classification -> `singleAlly`;
- exact all-opponents classification -> `allEnemies`;
- exact user-and-allies / all-active-allies classification, where inclusion of self matches the
  source behavior -> `allAllies`;
- exact all-active-Pokémon classification -> `allActive`.

Ambiguous/random/field/side/variable classifications, or classifications whose self-inclusion
does not exactly match the current `TargetScope`, remain unsupported unless an authored accepted
rule can represent them without semantic distortion. There is no adjacency geometry in the current
engine, so source adjacency wording must not create hidden positional semantics.

### 7.1 High-volume single-target mapping

The current v2 level-up surface has 262 positive-numeric-power physical/special MoveIds. Their
factual target distribution is:

- `any-adjacent`: 211;
- `any-other`: 18;
- `all-adjacent-foes`: 18;
- `all-adjacent`: 10;
- `random-opponent`: 5.

Requiring source-shape equivalence with the current TargetScope would leave most numeric attacks
without a mapping because `singleEnemy` cannot express the upstream ability to choose an ally.
The accepted production policy is option 2 below; the alternatives remain documented to make the
semantic trade-off explicit:

1. **Strict source-shape mapping** — `any-adjacent` / `any-other` remain unsupported until a later
   engine targeting extension; this is semantically narrow but makes a useful first simple-damage
   catalog much smaller.
2. **PokeNexus enemy-normalized mapping** — for the first production rulesVersion, an individually
   targeted offensive Move whose factual source target is `any-adjacent` or `any-other` may be
   explicitly authored/allowlisted as `singleEnemy`; `all-adjacent-foes` may map to `allEnemies`.
   This is a deliberate PokeNexus gameplay rule, **not** a claim that the factual source scopes are
   identical. `all-adjacent`, `random-opponent`, field/side scopes and `varies` remain unsupported
   unless separately authored or a later engine extension represents them.
3. **Extend TargetScope first** — add exact concepts such as single-other/all-other/random-opponent
   through a separate accepted Class A engine amendment before the affected content is executable.

The Human Owner accepted **option 2** for the first Solo Hunt production catalog. It makes up to 247 of
the 262 numeric-power candidates target-shape-compatible before the separate special-mechanic audit,
without adding combat-engine state or pretending random/field mechanics exist. Future multiplayer
rules may publish a new rulesVersion or explicit engine extension if ally-targeting fidelity becomes
product-relevant.

### 7.2 Complete v1 target disposition table

Under recommended section 7.1 option 2, the complete factual target vocabulary has this production
disposition. `conditional` means the mapping is executable only for an explicitly authored or
allowlisted rule whose complete semantics satisfy the stated condition; it is not a generic runtime
conversion.

| `sourceTarget` | Production disposition | Current `TargetScope` | Condition / rationale |
|---|---|---|---|
| `any-adjacent` | conditional | `singleEnemy` | Enemy-normalized only for individually targeted offensive Moves. |
| `any-other` | conditional | `singleEnemy` | Enemy-normalized only for individually targeted offensive Moves. |
| `self-or-adjacent-ally` | unsupported | — | Current scopes cannot represent self-or-other-ally choice. |
| `adjacent-ally` | conditional | `singleAlly` | Explicit adjacency collapse; self remains excluded. |
| `adjacent-foe` | conditional | `singleEnemy` | Explicit adjacency collapse. |
| `all-adjacent` | unsupported | — | `allActive` would incorrectly include the user. |
| `all-adjacent-foes` | conditional | `allEnemies` | Explicit adjacency collapse. |
| `self-and-allies` | exact | `allAllies` | Current active-side semantics include the user. |
| `all-allies` | unsupported | — | Current `allAllies` includes self; factual shape does not. |
| `self` | exact | `self` | Direct semantic match. |
| `all-pokemon` | conditional | `allActive` | Accepts PokeNexus living-active scope; reserves are never targeted. |
| `random-opponent` | unsupported | — | Current engine has no random-target scope. |
| `entire-field` | unsupported | — | Current engine has no field target/state. |
| `opponents-side` | unsupported | — | Current engine has no side-field target/state. |
| `users-side` | unsupported | — | Current engine has no side-field target/state. |
| `varies` | unsupported | — | No deterministic generic target can be inferred. |

This table is itself versioned rules content. A future targeting extension changes the disposition
through a new accepted rules contract/version; TASK-091 must not broaden it opportunistically.

## 8. Selected Move Loadout versus combat executability

APPROVED SPEC-010 currently allows a player to select any currently level-eligible Move, while
APPROVED SPEC-003 requires every Move in a Battle snapshot to resolve to an executable MoveRule and
defines no Struggle/generic fallback. Partial production Move coverage therefore creates a real
product boundary that cannot be left implicit.

The viable decision options are:

### Option A — complete executable eligibility coverage

Require every Move that SPEC-010 can make player-selectable to be faithfully executable before
production combat consumes that game-data/rules pair.

Benefits: persistent loadout and combat capability never disagree. Cost: current 453-Move level-up
universe includes many mechanics not representable by SPEC-003, so this option requires additional
Class A engine/rules extensions before TASK-091 can finish.

### Option B — executable-support intersection for new selection/bootstrap

Amend SPEC-010 for production selection/bootstrap so the authoritative candidate set is:

```text
current level-up eligibility ∩ executable Move support in the exact accepted rulesVersion
```

Every Move newly persisted by bootstrap or complete loadout replacement therefore has an
executable MoveRule in the same exact accepted context. This is an explicit Class A extension of
SPEC-010, not an implementation detail. TASK-089/TASK-025 behavior must be updated by the
implementation task that publishes/consumes the production catalog.
If the intersection is empty, production bootstrap fails closed; it does not restore a base-only
Move, synthesize a fallback or silently bypass production support. A mode/content path that requires
immediate combat must not admit/acquire that Species at that Level until its playability gate passes.
The existing SPEC-011 HTTP contract does not need a new error family: a proposed Move excluded by
this extended eligibility rule remains an ineligible loadout and maps to the existing
`422 invalid_move_loadout` response.

This extension does **not** reuse or mutate the retained SPEC-010 artifact identity
`pokenexus.move-eligibility.level-up-only.v1`. The exact production-selectability artifact is:

`pokenexus.move-production-selectability.level-up-executable.v1`

Its DRAFT accepted-semantics hash is:

`sha256:7ba0e89913bfbeda8caa6b55de0f302a824cd681daa530f9dd27989d0a3e7e51`

That semantic payload binds the retained SPEC-010 base eligibility artifact, the
`level-up eligibility ∩ executable support` candidate policy, the target policy, the Ability policy,
the exact 453-Move support/rule classification and all 147 Ability support states. Historical
operations that resolve only the retained SPEC-010 artifact keep their historical meaning. New
production selection/bootstrap governed by this spec must resolve **both** the retained base
eligibility artifact and this exact production-selectability artifact/hash from the selected
`rulesVersion`; no identity/hash reuse or latest fallback is allowed.

SPEC-012 is the Class A semantic amendment for new production Move selection. SPEC-011's route,
payload and error family remain unchanged; its Move command continues through the authoritative
Move service, which under a SPEC-012-enabled rulesVersion applies the additional production-
selectability gate before persistence.

Existing persisted selected Moves are never silently rewritten. If a later rules/data correction
makes an already-selected Move unsupported for a fresh gameplay scope, selected-only grandfathering
still preserves storage, but fresh Battle admission fails closed until the player performs a valid
complete replacement. UI/application read models must expose that incompatibility rather than
presenting the Pokémon as combat-ready.

A production rulesVersion enabled for new operations must not casually remove executable support
from previously production-selectable Moves. Such removal requires an explicit compatibility/
migration decision, an impact report for persisted selected loadouts, and a player-visible recovery
path; publishing a new version is not by itself permission to strand existing configurations.

Benefits: persistent selections accepted under a production context are executable; incremental
franchise coverage is possible without approximating unsupported mechanics; current strict
SPEC-003 Battle snapshots remain intact and no session projection is needed. Cost: this narrows
**new** SPEC-010 selection/bootstrap to the executable production subset and therefore requires
explicit Human acceptance.

### Rejected baseline alternatives

The DRAFT does not recommend:

- session-only filtering/dropping of selected unsupported Moves, because combat would execute a
  different loadout from the one the player persisted;
- accepting any level-up Move persistently and rejecting Battle only afterward as the normal path,
  because API-valid configuration would routinely create gameplay traps;
- a synthetic Struggle/basic attack or no-op replacement, because SPEC-003 explicitly has no such
  fallback and it would erase Move identity/semantics.

### Accepted production policy

The Human Owner accepted **Option B** for the first production rulesVersion: partial franchise coverage but complete
executable coverage for the production-selectable set. This is also the required GSC recommendation.
Keep Option A as a future expansion target, not an MVP prerequisite.

No synthetic generic attack or no-op fallback is proposed.

## 9. Ability coverage

The current catalog references 147 Abilities, while SPEC-003 intentionally supports only a closed
reaction surface. Activating a small arbitrary subset would make otherwise similar Species gain or
lose combat power based primarily on catalog implementation order.

Initial options are:

1. activate all 147 only after every selected Ability has faithful supported semantics;
2. activate a curated subset and explicitly accept uneven Ability coverage;
3. keep **all production Abilities mechanically inactive for the first Solo Hunt rulesVersion**,
   while preserving `selectedAbilityId` as factual/persistent player state, then activate Ability
   content in a later accepted rulesVersion.

### Accepted production policy

The Human Owner accepted option **3** for the first production Solo Hunt rulesVersion. SPEC-003 already permits a
mode/content definition to provide no active combat Ability when product rules allow it. This gives
all Pokémon the same temporary Ability treatment, avoids arbitrary balance asymmetry, and does not
invent unsupported mechanics. The UI/content must not imply that the selected Ability is active in
combat during this baseline.

Any later Ability activation remains immutable versioned content and must either fit the existing
reaction/effect surface exactly or go through a Class A extension first.

## 10. Unsupported mechanics baseline

Unless an exact existing SPEC-003 representation is demonstrated, the first production artifact
must mark Moves/Abilities requiring any of these mechanics unsupported rather than approximate:

- random/probabilistic secondary effects not represented by the accepted rule model;
- multi-hit sequences;
- variable, fixed, level-based or HP-relative direct damage outside accepted power arithmetic;
- recoil or drain proportional to dealt damage;
- Move priority;
- forced/self switching, phazing or escape/Teleport behavior;
- Protect/Substitute/decoy/barrier semantics;
- weather, terrain, hazards or field/side persistent state;
- accuracy/evasion stages;
- type/category/Move/Ability copying or transformation;
- item possession/consumption/interactions;
- reserve-targeted effects;
- pre-hit/pre-accuracy/pre-damage modifiers;
- recursive Ability reactions;
- other mechanics requiring state absent from the current engine contract.

This list is a fail-closed minimum, not permission to approximate unlisted mechanics.

## 11. Publication and versioning

Production rule content is immutable under one `rulesVersion`.

TASK-091 must:

- produce canonical deterministic serialization and content hashes;
- reject duplicate IDs and unresolved references;
- validate every executable MoveRule/AbilityRule/EffectRule with game-core validators;
- validate every executable Move against the exact paired MoveDefinition facts needed by its rule;
- make support/unsupported state queryable by tooling/tests rather than encoded as absence alone;
- prove no executable rule is generated from prose/name heuristics;
- publish exact compatibility with retained immutable `gameDataVersion`/`rulesVersion` pairs;
- keep historical published artifacts resolvable after newer content versions are introduced;
- fail closed when a selected pair, artifact, referenced content ID or expected semantic hash does
  not resolve exactly;
- enforce the accepted TASK-011 cadence publication guard: cadence-scoped periodic authored effects
  use a default minimum `intervalMs` of **1,000 ms**, and concurrently applicable cadence effects
  for one participant may schedule at most **30,000** exact periodic/expiry boundaries across an
  eight-hour catch-up window; any exception requires explicit measured evidence and normal
  rules/content approval;
- preserve the accepted TASK-011 combat/cadence performance regression budgets rather than assuming
  that a large rule catalog or dense authored effects are free.

For non-periodic authored content, SPEC-012 does not invent an arbitrary catalog-size or instruction
count cap. Existing game-core structural validators remain mandatory, and publication must run the
accepted TASK-011 semantic/performance regression gates plus Worker bundle/build qualification.
Crossing an accepted absolute or same-environment regression threshold blocks publication until the
content is reduced or new measured evidence is separately accepted. This delegation is deliberate;
it is not permission for unbounded recursive reactions or unsupported mechanics.

### 11.1 Production playability gate

Catalog publication must distinguish **syntactic executability** from **playability**. A Species
having one executable status Move is not sufficient evidence that it can make progress in Solo
Hunt or another damage-based PvE mode.

For the current v2 Learnset contexts:

- 6 Species have no positive-numeric-power physical/special level-up Move at any level: Abra,
  Ditto, Kakuna, Metapod, Smeargle and Wobbuffet;
- 10 Species have no such Move at Level 1: Abra, Delibird, Ditto, Dunsparce, Kakuna, Machop,
  Magikarp, Metapod, Smeargle and Wobbuffet.

This evidence does not itself ban those Species. It proves that a damage-only simple-rule catalog
cannot make the full current roster independently combat-viable. Before a Species is admitted as a
player-usable combat participant by a production mode/content release, the combined accepted rules
and content must prove that its reachable executable loadout can make progress under that mode's
win conditions **at every Level at which that mode can first admit/acquire it**. Species that
require Transform/Sketch/counter/fixed-damage/evolution or another unsupported mechanic remain
outside that mode's playable content until the owning Class A rules work explicitly supports them.
TASK-033/034 own which Species actually appear in Solo Hunt content; they may not bypass this
rule-content gate.

The first Solo Hunt MVP is **not required by this spec to make all 293 Species/forms player-
acquirable**. TASK-033/034 may choose a production subset, with every
included Species satisfying this playability gate. Requiring all 293 immediately would implicitly
force Transform/Sketch/Teleport/counter/fixed-damage/evolution-adjacent mechanics into TASK-090.
If the Human Owner instead requires all 293 in the first MVP, that requirement is a material scope
decision and the missing mechanics must be accepted before TASK-091 can complete.

With the exact DRAFT support profile in section 5.1, **277/293** current Species/forms have at
least one executable level-up Move somewhere in their current Learnset context, while **254/293**
have at least one executable Move at Level 1. These are coverage diagnostics, not an automatic
production roster. TASK-033/034 still owns actual acquisition/admission levels and must evaluate
the playability gate against those levels.

### 11.2 Diversity/content-quality gate

No global Move-coverage percentage is an acceptance criterion. A high percentage can still leave
specific Species or level bands with only unusable or homogeneous choices. TASK-091 must emit a
deterministic coverage report for every production-playable Species and relevant admission/level
band containing at least:

- eligible level-up Move count;
- executable Move count;
- progress-capable/damage-capable executable Move count;
- simple versus authored executable count;
- count of distinct target/category/effect-role classes represented;
- explicit one-choice/zero-choice bottlenecks.

TASK-091 does not know the future TASK-033/034 production Species/admission-level subset and therefore
must not pretend to approve it. TASK-091 emits the deterministic coverage matrix across all 293
current Species/forms and all relevant level-up thresholds. TASK-033/034 must consume that evidence
when defining Solo Hunt acquisition/admission content and fail any proposed admission where the
Species has zero progress-capable executable choices at that admitted Level.

One-choice bottlenecks are explicitly surfaced in the coverage report and become content-sample
review input; they are not hidden by a global percentage. The accepted first-release authored tranche
includes exact stat-stage and healing utility.
Action-lock/control and periodic DoT/HoT Moves remain unsupported in this first profile unless a
specific Move can be frozen with complete faithful semantics before Human acceptance; diversity is
never improved by implementing only part of a Move's behavior.

A factual game-data correction does not mutate an existing production rule artifact. A semantic
rule correction creates a new immutable rules artifact/version and follows normal compatibility
governance.

## 12. Minimum TASK-091 validation matrix

TASK-091 must at minimum prove:

- exact inventory of supported versus unsupported production MoveIds;
- byte-for-byte consumption of the Human-accepted `SPEC-012-production-move-support-v1.json`
  classification; TASK-091 cannot promote an unsupported Move or alter an authored rule;
- all support records reference current/pinned canonical IDs;
- simple allowlist contains no Move classified as requiring an omitted mechanic;
- target mapping is closed and deterministic;
- every executable Move has a valid cooldown and executable target scope;
- every authored effect references a valid immutable EffectRule;
- unsupported entries cannot initialize as executable MoveRules;
- a deterministic all-293/all-relevant-level coverage matrix is emitted for downstream mode/content
  admission checks; TASK-091 does not invent the later Solo Hunt production subset;
- cadence effects satisfy the accepted 1,000 ms default minimum interval and 30,000-boundary/
  participant/eight-hour publication limit unless a separately accepted measured exception exists;
- new bootstrap/loadout mutation uses level-up eligibility intersected with exact executable
  support if the Human Owner accepts Option B in section 8;
- later-unsupported grandfathered selected Moves remain stored but fresh Battle admission fails
  closed until deliberate valid replacement; there is no silent rewrite or session projection;
- Ability policy selected in section 9 is applied uniformly and is externally observable;
- deterministic replay remains identical for pinned artifacts;
- retained historical artifacts remain resolvable;
- Worker/build/performance budgets remain within accepted limits.

## 13. Non-goals

This specification does not define:

- new Move acquisition methods or TM/item economy;
- learned/acquired Move persistence;
- inventory, reward, XP or monetization rules;
- evolution, Nature, EV or held-item systems;
- AI or automatic Move-choice policy beyond already accepted SPEC-003 ordering;
- Hunt encounter/reward/cadence orchestration owned by TASK-033/035;
- new combat primitives without a separate accepted Class A extension;
- runtime implementation owned by TASK-091;
- Git/history mutation without separate Human Owner authorization.

PXE consultation is N/A for this DRAFT because it introduces no currency, reward, scarcity,
monetization or paid-power semantics. Any such proposal changes that classification.

## 14. Acceptance criteria

- [x] Production Move support/unsupported semantics are explicit and immutable under rulesVersion.
- [x] Exact Move/Ability support universes require one and only one support record per required ID.
- [x] Simple-damage allowlisting and authored-rule boundaries cannot infer mechanics from prose.
- [x] Human Owner accepts the exact companion 453-Move support profile.
- [x] Target mapping is explicit and fails closed on semantic mismatch.
- [x] Human Owner accepts section 7.1 **enemy-normalized option 2**.
- [x] Human Owner accepts section 8 **Option B**: new bootstrap/replacement selection is level-up
      eligibility intersected with exact executable support.
- [x] Human Owner accepts section 9 **option 3**: all 147 production Abilities are mechanically
      inactive for the first Solo Hunt rulesVersion while factual/persistent selection is preserved.
- [x] Human Owner accepts a playability-cleared production subset for the first Solo Hunt MVP rather
      than requiring all 293 current Species/forms to be player-acquirable immediately.
- [x] Human Owner accepts the section 11.2 per-Species/per-level playability/diversity gate instead
      of a raw global coverage percentage.
- [x] Required GSC advisory is completed and material trade-offs are reconciled.
- [x] Independent QA reports no unresolved material finding.
- [x] TASK-091 has an implementation-ready publication/validation contract.
- [x] TASK-091 handoff explicitly includes production-selectability integration through the existing
      TASK-089/TASK-025 Move-authority path, not only catalog file generation.
- [x] No downstream production combat task may assume unsupported mechanics are executable.
- [x] Human Owner explicitly accepts the complete SPEC-012 semantic baseline.

## 15. Accepted production decisions

The first production rulesVersion governed by this specification freezes these decisions:

1. **Target policy:** enemy-normalized option 2 from section 7.1.
2. **New Move selection/bootstrap:** section 8 Option B, `level-up eligibility ∩ executable support`.
3. **Initial Ability policy:** section 9 option 3; all 147 Ability records are `inactive-by-policy`.
4. **First Solo Hunt roster:** TASK-033/034 may admit a playability-cleared production subset instead
   of requiring all 293 current Species/forms immediately.
5. **Content quality gate:** section 11.2 per-Species/per-level playability/diversity evidence, with
   zero progress-capable choices blocking the proposed admission level.
6. **Exact support profile:** the companion artifact is accepted exactly as classified: 27
   `executable-simple`, 18 `executable-authored`, 408 `unsupported`, and all 147 Ability records
   `inactive-by-policy`.

TASK-091 implements this exact baseline and has no authority to calculate or promote additional
executable Moves, activate Abilities, broaden target semantics or require a different production
Species subset without a later accepted rules/spec change.
