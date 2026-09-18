# TASK-092 — SpeciesDefinition Static-Fact Audit & Extension Spec

## Metadata

- State: READY
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

- [ ] SPEC-008 defines all seven approved intrinsic/static additions with exact normalized shape.
- [ ] The complete audit addresses existing required Species fields that can be explicitly
      source-unavailable, including Base Exp., without mapping unavailable values to zero/null or
      silently excluding otherwise accepted Species/forms.
- [ ] Height/weight units and precision are deterministic and source-normalized.
- [ ] Egg-group membership is structured and deterministically ordered, not prose.
- [ ] Gender ratio/genderless representation is exact and cannot be confused with owned-instance
      gender.
- [ ] Egg cycles cannot be confused with hatch-progress/time state.
- [ ] EV yield uses an exact structured stat representation and cannot be confused with owned EVs.
- [ ] Base friendship cannot be confused with mutable/current friendship, and explicit source
      unavailability is distinct from numeric zero or parser failure.
- [ ] Form-specific values belong to exact `SpeciesId`; no blind `baseSpeciesId` inheritance exists.
- [ ] Source absence/ambiguity and validation behavior are explicit and fail closed.
- [ ] Contextual relations and executable mechanics remain outside scalar `SpeciesDefinition`.
- [ ] Adjacent candidate fields are explicitly classified to reduce future schema churn.
- [ ] New schema-version compatibility/publication implications are explicit under SPEC-002.
- [ ] TASK-087 can implement the accepted result without guessing fields or sourcing policy.
- [ ] QA reports no unresolved P0/P1 before Human acceptance.
- [ ] Human Owner explicitly accepts the complete Species/form static-fact boundary.

## Validation / tests

- [x] Initial cross-check against SPEC-001/002/005/006 ownership boundaries completed in DRAFT;
      final QA rechecks the accepted candidate.
- [x] Pokémon-domain advisory review sampled current PokémonDB field/source behavior under the
      existing DATA-only/no-fallback policy and identified the source-unavailable requirement now
      modeled by SPEC-008.
- [ ] Fresh independent QA review of exact spec candidate.
- [ ] `corepack pnpm roadmap:check` after lifecycle metadata changes.
- [ ] `git diff --check`.

## Readiness evidence

- Formal independent QA Definition-of-Ready review: **READY**.
- P0/P1/P2/P3: `0/0/0/0`.
- Focused Pokémon-domain advisory re-review after the `SourceFact<T>` and v2 refinement corrections:
  **READY advisory**, P0/P1/P2/P3 `0/0/0/0`.
- This readiness result authorizes the Class A specification work to proceed. It does **not**
  accept any open SPEC-008 schema decision on behalf of the Human Owner.

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
- No irreversible runtime/database/Git action is authorized by this DRAFT.

## Expected files / boundaries

- `tasks/active/TASK-092-speciesdefinition-static-fact-audit-extension-spec.md`
- `docs/specs/SPEC-008-speciesdefinition-static-fact-extension.md`
- `docs/project/PROJECT_ROADMAP.md`
- generated `docs/project/PROJECT_ROADMAP.html`

No production TypeScript, SQL migration, dependency, lockfile or runtime binding is in scope.

## Completion

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
