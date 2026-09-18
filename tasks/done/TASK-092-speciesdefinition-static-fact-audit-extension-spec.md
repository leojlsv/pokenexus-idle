# TASK-092 — SpeciesDefinition Static-Fact Audit & Extension Spec

## Metadata

- State: DONE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: N/A
- Auditor execution surface: N/A
- Consultants: N/A
- Consultant execution surface(s): N/A
- Spec: `docs/specs/SPEC-008-speciesdefinition-static-fact-extension.md`
- Related specs: SPEC-001, SPEC-002, SPEC-005, SPEC-006
- Related ADRs: ADR-002
- Branch: `spec/TASK-092-speciesdefinition-static-fact-audit`
- Worktree: `.worktrees/TASK-092-speciesdefinition-static-fact-audit`

## Objective

Perform the complete pre-publication `SpeciesDefinition` static-fact audit approved by the Human
Owner and define the schema extension that TASK-087 must implement before the first canonical
Species/form catalog is published.

The task exists specifically to avoid schema rework: compact intrinsic Species/form facts should
not be omitted merely because their executable mechanics are not part of current gameplay.

## Context

SPEC-002 is already APPROVED and remains authoritative until this Class A extension is accepted.
It must not be silently edited to add fields after approval.

The Human Owner already approved the audit direction that treats the following as factual,
non-executable Species/form data:

- height;
- weight;
- egg-group membership;
- gender ratio / genderless representation;
- egg cycles;
- EV yield;
- base friendship.

The accepted boundary also requires form-specific values to live on the exact `SpeciesId` rather
than being blindly inherited from `baseSpeciesId`, and keeps contextual relations such as
Learnsets, evolution, local Dex mappings, locations and held-item/drop data outside scalar
`SpeciesDefinition` fields.

No GSC/PXE trigger applies because this task classifies factual static data and explicitly does not
adopt the corresponding gameplay mechanics.

## Scope

- Audit the complete existing SPEC-002 Species/form field set against the approved intrinsic/static
  boundary before first canonical publication.
- Define exact normalized representation for:
  - height;
  - weight;
  - egg groups;
  - gender ratio/genderless;
  - egg cycles;
  - EV yield;
  - base friendship.
- Audit source availability of **all** already accepted required Species fields against the intended
  roster before first publication; explicitly address the observed Base Exp. source-unavailable
  case and require any additional legitimate source-unavailable field to receive an accepted
  representation (or explicit roster policy) before TASK-087 rather than discovering it during
  implementation.
- Define units, numeric domains/precision, nullability, cardinality, deterministic ordering and
  validation rules for every added field.
- Define exact form behavior:
  - data attaches to the exact canonical `SpeciesId`;
  - `baseSpeciesId` groups forms but does not imply value inheritance;
  - missing/ambiguous source facts fail closed through validation rather than guessed inheritance.
- Define PokémonDB DATA-only extraction/normalization mapping and provenance requirements under the
  existing no-alternate-provider-fallback policy.
- Define the new accepted static `schemaVersion` boundary consumed by TASK-087 while preserving
  independent `gameDataVersion` and `rulesVersion` semantics.
- Audit adjacent candidate fields and explicitly classify them as intrinsic static facts,
  persistent instance facts, derived values, contextual/relational content, executable rules or
  presentation-only so future implementation does not flatten unrelated concepts into
  `SpeciesDefinition`.
- Preserve existing accepted intrinsic fields including Types, six base stats, Ability assignments,
  catch rate, base experience, growth rate, National Dex number, introduced generation and exact
  form/base-species identity.

## Out of scope

- breeding compatibility, inheritance or breeding mechanics;
- hatching mechanics or hatch-progress state;
- assigning/persisting actual gender on owned Pokémon;
- EV accumulation/training mechanics or owned EV state;
- friendship progression/current-friendship mechanics;
- evolution graph, triggers, eligibility or Species mutation;
- Learnsets and Move eligibility/acquisition;
- local Dex mappings;
- habitats/locations/encounters;
- held-item/drop relations;
- machine/item-to-Move relations;
- Nature mechanics/compatibility;
- derived combat stats/BST/type defenses/capture probability/hatch-time estimates/min-max tables;
- flavor text, Pokédex prose, assets/sprites/audio/translations/competitive recommendations;
- source color/shape unless separately justified, sourced and accepted;
- production crawler/catalog implementation owned by TASK-087;
- edits that reinterpret executable gameplay rules;
- Git history operations without separate Human Owner authorization.

## Acceptance criteria

- [x] SPEC-008 defines all seven approved intrinsic/static additions with exact normalized shape.
- [x] The complete audit addresses existing required Species fields that can be explicitly
      source-unavailable, including Base Exp., without mapping unavailable values to zero/null or
      silently excluding otherwise accepted Species/forms.
- [x] Height/weight units and precision are deterministic and source-normalized.
- [x] Egg-group membership is structured and deterministically ordered, not prose.
- [x] Gender ratio/genderless representation is exact and cannot be confused with owned-instance
      gender.
- [x] Egg cycles cannot be confused with hatch-progress/time state.
- [x] EV yield uses an exact structured stat representation and cannot be confused with owned EVs.
- [x] Base friendship cannot be confused with mutable/current friendship, and explicit source
      unavailability is distinct from numeric zero or parser failure.
- [x] Form-specific values belong to exact `SpeciesId`; no blind `baseSpeciesId` inheritance exists.
- [x] Source absence/ambiguity and validation behavior are explicit and fail closed.
- [x] Contextual relations and executable mechanics remain outside scalar `SpeciesDefinition`.
- [x] Adjacent candidate fields are explicitly classified to reduce future schema churn.
- [x] New schema-version compatibility/publication implications are explicit under SPEC-002.
- [x] TASK-087 can implement the accepted result without guessing fields or sourcing policy.
- [x] QA reports no unresolved P0/P1 before authoritative APPROVED metadata/history integration.
- [x] Human Owner accepted the proposed SPEC-008 v2 direction that existed on 2026-09-18.
- [x] Human Owner resolved the post-acceptance transformation-profile choice on 2026-09-18:
      battle-only transformation profiles are deferred to a future owning transformation/rules task
      and are not added to schema v2.

## Validation / tests

- [x] Initial cross-check against SPEC-001/002/005/006 ownership boundaries completed in DRAFT;
      final QA rechecks the accepted candidate.
- [x] Pokémon-domain advisory review sampled current PokémonDB field/source behavior under the
      existing DATA-only/no-fallback policy and identified the source-unavailable requirement now
      modeled by SPEC-008.
- [x] Fresh independent QA review of exact REVIEW candidate completed: **NOT READY**,
      P0/P1/P2/P3 `0/1/0/0`; the promised complete source-availability audit was not yet recorded.
- [x] Focused Pokémon-domain source-availability audit completed after QA: **NOT READY advisory**,
      P0/P1/P2/P3 `0/1/1/0`; it initially interpreted additional structured `—` states as
      possible SpeciesDefinition source-unavailability.
- [x] Fresh applicability re-audit after Human clarification: **NOT READY advisory**,
      P0/P1/P2/P3 `0/1/0/0`; the previous Mega/Eternamax source-unavailability framing is
      superseded by persistent-form versus battle-transformation applicability.
- [x] Final exact option-1 Pokémon-domain re-review: **PASS advisory**,
      P0/P1/P2/P3 `0/0/0/0`.
- [x] Final independent QA of the exact option-1 semantic snapshot: **READY**,
      P0/P1/P2/P3 `0/0/0/0`.
- [x] `corepack pnpm roadmap:check` after lifecycle metadata changes.
- [x] `git diff --check`.

## Readiness evidence

- Formal independent QA Definition-of-Ready review: **READY**.
- P0/P1/P2/P3: `0/0/0/0`.
- Focused Pokémon-domain advisory re-review after the `SourceFact<T>` and v2 refinement corrections:
  **READY advisory**, P0/P1/P2/P3 `0/0/0/0`.
- This readiness result authorized the Class A specification work to proceed; it did not itself
  accept schema semantics. The Human Owner subsequently accepted the proposed v2 direction on
  2026-09-18; final QA still gates authoritative APPROVED metadata and history integration.

## Human Owner decision

- On 2026-09-18 the Human Owner accepted the then-complete proposed SPEC-008 direction: schema v2,
  integer mm/g units, basis-point gender ratios, the closed EggGroupKey vocabulary/order,
  `SourceFact<T>` handling, structurally required/non-null fields with fail-closed ambiguity, and
  the adjacent-field classification boundary.
- On 2026-09-18 the Human Owner additionally approved the corrected **option 1** after the
  applicability re-audit: battle-only transformation profiles are excluded/deferred from the
  persistent `SpeciesDefinitionV2` roster and their canonical static profile is left to a future
  owning transformation/rules task. No `TransformationProfile` catalog is added by SPEC-008.
- Final focused Pokémon-domain review and final independent QA both cleared the exact option-1
  semantic snapshot at P0/P1/P2/P3 `0/0/0/0`. SPEC-008 is therefore promoted metadata-only to
  `APPROVED` and TASK-092 to `ACCEPTANCE`; repository history remains separately gated.

## Post-acceptance audit finding

Final independent QA of the exact accepted REVIEW candidate returned **NOT READY**,
P0/P1/P2/P3 `0/1/0/0`: this task promises a complete field-by-field source-availability audit of
the existing SPEC-002 Species contract, but SPEC-008 concretely recorded only the Base Exp.
unavailable case and left the remaining required fields to be checked later.

A first focused Pokémon-domain audit returned **NOT READY advisory**,
P0/P1/P2/P3 `0/1/1/0` and initially treated structured `—` values on Mega/Eternamax source
blocks as possible source-unavailability for the SpeciesDefinition contract.

The Human Owner then clarified that Mega forms such as Mega Dragonite are **temporary battle
transformations**, reached through battle criteria/items, and are not independently captured or
persisted Pokémon. The consultant reference policy was also expanded so Bulbapedia may be used in
parallel with PokémonDB for general Pokémon-domain consultation and Smogon for PvP context.

A fresh read-only applicability re-audit therefore superseded the first interpretation:

- ordinary/base Species and accepted regional/persistent alternate forms remain eligible
  `SpeciesDefinition` identities with the full applicable v2 fact contract;
- temporary battle transformations such as Mega forms are **not evidence** that capture,
  progression or breeding fields need availability wrappers;
- Eternamax is likewise an unobtainable special battle transformation rather than a persistent
  SpeciesDefinition candidate;
- battle-only Terastal/Stellar states follow the same applicability principle;
- genuine `SourceFact<T>` remains appropriate when a fact really applies to a persistent
  Species/form but PokémonDB explicitly lacks a current value. Ogerpon provides current examples
  for Base Friendship, Base Exp. and Egg cycles.

The field-by-field audit otherwise classified local identity/grouping/provenance fields as mandatory
local metadata, and found no legitimate unavailable state in the audited current-form sample for
National Dex number, current Types or the complete six Base Stats. `introducedGeneration` and
source identity/mapping must resolve for an accepted exact-form mapping; unresolved mapping blocks
onboarding rather than becoming an arbitrary availability wrapper.

This was a material schema-boundary choice discovered **after** the Human Owner's first 2026-09-18
acceptance. The earlier broad-SourceFact-versus-strict-roster framing is superseded.

The Human Owner resolved the new choice on 2026-09-18 by approving **option 1**:

- battle-only transformations are explicitly excluded/deferred from the persistent
  `SpeciesDefinitionV2` roster;
- SPEC-008 does **not** introduce a separate transformation/static-profile catalog or identity;
- a future owning transformation/rules task must define the canonical transformed static profile
  together with its required data boundary before the mechanic becomes executable;
- the persistent `PokemonInstance.speciesId` remains the origin Species/form identity;
- `baseSpeciesId` is not overloaded as transformation state.

Under this policy, source `—` must not be mapped to zero, null, an empty Ability set, inferred
base/sibling values or alternate-provider fallback. A page-level/shared fact may attach to multiple
exact-form records only when source structure or an accepted mapping unambiguously scopes that fact
to those forms with direct provenance; this is source association, not `baseSpeciesId`
inheritance.

## Dependencies

- TASK-006 — Static Game Data Schema & Rules Versioning
- TASK-093 — Gameplay Systems & Player Experience Consultant Governance (governance baseline only;
  no consultant trigger applies)

## Risks / irreversible actions

- Omitting compact intrinsic facts now would force an avoidable schemaVersion/catalog republish
  cycle after TASK-087 starts producing canonical data.
- Treating relational/contextual content as scalar Species fields would create denormalized schema
  debt and ambiguous version ownership.
- Treating factual fields as executable rules could accidentally adopt breeding/EV/friendship/
  evolution mechanics; this task must keep those boundaries explicit.
- No irreversible runtime/database/Git action is authorized by this specification task.
- Repository-history/completion was explicitly authorized by the Human Owner on 2026-09-18 after
  TASK-092 reached ACCEPTANCE.

## Expected files / boundaries

- `tasks/active/TASK-092-speciesdefinition-static-fact-audit-extension-spec.md`
- `docs/specs/SPEC-008-speciesdefinition-static-fact-extension.md`
- `docs/project/PROJECT_ROADMAP.md`
- generated `docs/project/PROJECT_ROADMAP.html`

No production TypeScript, SQL migration, dependency, lockfile or runtime binding is in scope.

## Completion

TASK-092 is DONE. SPEC-008 is APPROVED after the Human Owner accepted the v2 direction, clarified
the persistent Species versus battle-only transformation boundary, approved option 1 to defer
battle-only transformation profiles, and the exact semantic snapshot cleared focused
Pokémon-domain review plus final independent QA at P0/P1/P2/P3 `0/0/0/0`.

The accepted snapshot was committed as
`0bc696d709bb36b67f7ebb7abdd70d7cbe66d07a`, pushed on
`spec/TASK-092-speciesdefinition-static-fact-audit`, and fast-forward integrated into canonical
`main` after explicit Human Owner repository-history/completion authorization on 2026-09-18.

This DONE metadata records governed closure only. TASK-022 remains a separate branch/history lane
and was not bundled into TASK-092 completion.
