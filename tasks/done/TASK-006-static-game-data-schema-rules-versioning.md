# TASK-006 — Static Game Data Schema & Rules Versioning

## Metadata

- State: DONE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: DEFAULT
- Reviewer: QA Reviewer
- Reviewer execution surface: DEFAULT
- Auditor: N/A
- Auditor execution surface: N/A
- Spec: `docs/specs/SPEC-002-static-game-data-and-versioning.md`
- ADR:
  - `docs/decisions/ADR-001-runtime-and-language.md`
- Branch: `spec/TASK-006-static-game-data-schema-rules-versioning`
- Worktree: `.worktrees/TASK-006-static-game-data-schema-rules-versioning`

## Objective

Define and obtain Human Owner approval for the first immutable static game-data schema,
publication/versioning model, provenance contract and PokémonDB DATA-only ingestion contract
used by PokeNexus.

This task is a Class A specification task. It does not authorize production crawler code,
catalog implementation or runtime consumption before the accepted specification reaches the
required Human Owner gate and any implementation ownership is materialized under governance.

## Context

TASK-004 established the canonical domain vocabulary and required authoritative/replayable
outcomes to pin immutable rules/game-data interpretation. TASK-005 implemented the shared
TypeScript ID/stat skeleton. TASK-006 owns the concrete static-data schema/version/provenance
contract that later combat, persistence and content tasks depend on.

PokémonDB (`pokemondb.net`) is the Human Owner-selected primary external factual source for
the Pokémon reference fields PokeNexus chooses to ingest. Runtime code must never depend on
live PokémonDB requests. Only locally extracted, validated and immutable published snapshots
may become canonical PokeNexus game data.

The approved source policy is DATA-only. Images, sprites, icons, audio, layout/CSS,
editorial/flavor prose, translations and other non-whitelisted content are excluded.

## Scope

### 1. Version and publication model

- define separate `gameDataVersion` and `rulesVersion` identities;
- define `schemaVersion` for the serialized game-data contract;
- define immutable/non-reusable `rulesVersion` resolution/retention envelope and explicit
  accepted compatibility for data/rules pairs;
- define deterministic NFC canonical serialization, per-artifact SHA-256 verification,
  immutable provenance hashing and exact bundle-hash binding;
- define immutable publication, activation/deprecation metadata and retention expectations;
- require authoritative/replayable consumers to pin the accepted
  `{ gameDataVersion, rulesVersion }` pair;
- corrections publish a new immutable version rather than mutating a referenced bundle.

### 2. Static schema v1

- define schema foundations for:
  - Species/forms;
  - Moves;
  - Types and current type-effectiveness reference data;
  - Abilities;
  - Items;
  - Learnsets;
- define explicit extension ownership for future Zone/Encounter Definition content rather
  than prematurely importing TASK-033/034 rules/content;
- reuse canonical IDs and `StatBlock` from `@pokenexus/game-types` semantically;
- keep executable combat semantics out of static-data facts.

### 3. PokémonDB normalization and identity mapping

- define source keys/labels separately from canonical PokeNexus IDs;
- define species/form normalization and base-species grouping;
- prevent National Dex numbers, display names, source slugs or page indexes from silently
  becoming authoritative identity;
- define deterministic candidate-ID onboarding with published IDs frozen after acceptance;
- fail closed on ambiguous/conflicting source-to-canonical mappings.

### 4. Provenance and validation

- define provenance manifest requirements;
- require at least source URL, retrieval timestamp, parser version and source-content hash;
- define provenance hash, bundle-level checksum and source-record references;
- define discovery/mapping/extraction/normalization inventory reconciliation so a pipeline
  cannot publish an internally-valid but incomplete source subset;
- define structural/referential validation before canonical publication;
- define validation failure behavior: no partial/failed dataset may be promoted as canonical.

### 5. PokémonDB crawler/exporter contract

- keep the crawler/exporter as an explicit TASK-006 sub-task contract;
- manual/on-demand or controlled-CI ingestion only; never runtime fetching;
- respect current `robots.txt` on every ingestion run;
- descriptive User-Agent;
- conservative throttling/backoff, caching and checkpoint/resume;
- no silent alternate-provider fallback;
- HTML may be transient parser/cache input only and is never canonical output;
- raw output means raw extracted whitelisted fields, not preserved source HTML;
- emit raw extracted snapshot, normalized snapshot, provenance manifest and validation report;
- canonical promotion is atomic and happens only after validation succeeds.

Current external-policy check on 2026-09-15: PokémonDB `robots.txt` exposes a
`Crawl-delay: 2` for `User-agent: *` and disallows specific PokéBase search/revision paths.
The implementation must re-check the live policy at ingestion time and never run faster
than the then-current site policy; if policy cannot be safely determined, ingestion fails
closed.

### 6. DATA whitelist v1

The Human Owner accepted the whitelist defined by `SPEC-002` and reflected in the project
roadmap.

Approved baseline:

- Species/form identity:
  - canonical `SpeciesId`;
  - source name/slug;
  - National Dex number as non-unique reference data;
  - introduced generation;
  - form/variant label;
  - base-species relationship;
  - generation/game source qualifier where structurally relevant;
- Species battle/progression reference:
  - current Type IDs;
  - six base stats;
  - eligible Abilities and normal/hidden/alternate assignment;
  - catch rate;
  - base experience;
  - growth rate;
- Moves:
  - source name/slug;
  - introduced generation;
  - Type ID;
  - factual category;
  - power;
  - accuracy;
  - PP;
  - contact flag;
  - target classification;
- Learnsets:
  - species/form;
  - generation/game grouping;
  - `MoveId`;
  - structured learn method;
  - level or machine identifier where applicable;
  - other approved structured method qualifiers;
- Types:
  - identities/source names;
  - current PokémonDB effectiveness matrix as factual reference input only;
- Abilities:
  - identity/source name/slug;
  - introduced generation when available;
  - species/form eligibility and normal/hidden/alternate assignment;
- Items:
  - identity/source name/slug;
  - structured category/classification only.

Explicitly deferred unless an owning accepted task adopts a concrete need:

- height/weight;
- historical species types;
- generation-scoped historical type charts;
- move priority;
- EV yield and EV-training mechanics;
- gender ratio, egg groups, egg cycles, breeding/hatching;
- evolution graph/trigger data;
- PokémonDB locations/encounter rates;
- machine/item relationships not yet required by accepted item/progression rules;
- any additional franchise field not owned by an accepted task.

Explicitly excluded:

- images/sprites/icons/audio/assets;
- flavor/Pokédex text;
- game-description prose;
- editorial move/Ability/item effect prose;
- languages/translations;
- page layout/CSS;
- min/max stat calculators;
- competitive recommendations;
- unapproved source fields.

## Out of scope

- executable combat formulas, timing/cooldowns, move/effect/Ability semantics;
- IV range/formula decisions;
- Speed semantics;
- final Team/loadout constraints;
- owned Pokémon/Ability selection rules;
- inventory stackability/use/equipment/capture-item behavior;
- PvE World/Zone/Hunt lifecycle or content tables;
- persistence/database schema;
- HTTP/WebSocket contracts;
- production crawler/exporter implementation;
- production game-data catalog implementation;
- live deployment/provisioning;
- alternate factual provider adoption.

## Acceptance criteria

- [x] `SPEC-002` defines separate `schemaVersion`, `gameDataVersion` and `rulesVersion`
      semantics without conflating static content with executable rules.
- [x] `rulesVersion` is immutable/non-reusable, retains hashed rules artifact/config/compiler
      identity while referenced, and cannot be silently reinterpreted.
- [x] Valid `{ gameDataVersion, rulesVersion }` combinations require explicit accepted
      compatibility rather than inference from version strings.
- [x] Published game-data bundles are immutable and corrections require a new version.
- [x] NFC deterministic serialization, per-artifact SHA-256, `provenanceHash` and exact
      `bundleHash` preimage are defined.
- [x] Authoritative/replayable contexts pin `{ gameDataVersion, rulesVersion }`.
- [x] v1 Species/form, Move, Type, Ability, Item and Learnset schema foundations are defined.
- [x] Species/form normalization and base-species grouping are explicit and do not introduce
      a `FormId`.
- [x] Canonical IDs remain PokeNexus identities rather than National Dex/name/source-slug
      aliases.
- [x] Type-effectiveness data is clearly factual reference input; TASK-008 still owns the
      executable combat mapping/math.
- [x] The DATA whitelist is explicit and excludes assets/editorial/layout content.
- [x] Deferred fields remain deferred unless the Human Owner explicitly expands v1 scope.
- [x] Provenance includes source URL, fetchedAt, parser version and source-content hash.
- [x] Provenance is immutable and cryptographically bound to the published game-data release.
- [x] Source coverage is reconciled across discovery/mapping/extraction/normalization and
      unexplained missing/new/remapped records block publication.
- [x] Raw extracted, normalized, provenance and validation artifacts are distinct.
- [x] Crawler contract is manual/controlled-CI only, never runtime.
- [x] Crawler contract re-checks and respects current robots/access policy, throttles
      conservatively and fails closed on policy/access ambiguity.
- [x] No PokeAPI/alternate-provider silent fallback is allowed.
- [x] Publication is atomic and validation-gated.
- [x] Referenced published versions have an explicit retention requirement.
- [x] No production code/package/dependency change is made in this specification phase.
- [x] Independent QA reports no unresolved P0/P1 findings on the proposed Class A spec.
- [x] Human Owner explicitly accepts `SPEC-002` before any production implementation begins.

## Validation / review

Validation commands:

```text
corepack pnpm roadmap:generate
corepack pnpm roadmap:check
git diff --check
```

Also verify:

- complete working-tree diff is limited to TASK-006 spec/task/roadmap planning artifacts;
- `packages/**`, `apps/**`, manifests and lockfile remain unchanged;
- no executable game rule is imported from PokémonDB prose;
- no deferred TASK-007/008/019/022/033/034 decision is silently decided here;
- source/crawler policy matches current PokémonDB access policy at review time.

Current acceptance result:

- independent architecture/scope re-review: P0/P1/P2/P3 = 0/0/0/0;
- independent source/provenance re-review: P0/P1/P2/P3 = 0/0/0/0;
- Human Owner accepted `SPEC-002` section 17;
- remaining repository-completion gate: the separately authorized Git completion/merge flow.

## Dependencies

- TASK-004 — Domain Glossary & Core Model Spec: DONE.
- TASK-005 — Core Domain Type Skeleton: DONE.
- `SPEC-001 — Core Domain Vocabulary & Model`: APPROVED.

## Risks / irreversible actions

- Source HTML structure can change without notice; parser drift must fail closed rather than
  emit silently corrupted canonical data.
- Treating source slugs/numbers as canonical IDs can break historical identity if upstream
  labels change.
- Combining rules and data into one version would create unnecessary replay invalidation and
  ambiguous rollback behavior.
- Publishing partial snapshots can create cross-catalog referential inconsistency.
- Crawling faster than current source policy can create access/operational risk.
- Source prose is not executable logic; importing it as rules would bypass Class A game-rule
  governance.
- No destructive or remote runtime action is authorized by this specification task.
- Commit/push/merge were explicitly authorized by the Human Owner for TASK-006 completion.

## Expected files / boundaries

Specification-phase changes are limited to:

```text
tasks/done/TASK-006-static-game-data-schema-rules-versioning.md
docs/specs/SPEC-002-static-game-data-and-versioning.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

This specification task does not change `packages/**`, `apps/**`, package manifests or the
lockfile. Production implementation requires its own materialized task/owner under governance.

## Completion

Completed after independent QA reported no unresolved findings, the Human Owner accepted
`SPEC-002`, and the Human Owner explicitly authorized repository completion for TASK-006.

Production crawler/catalog implementation remains outside this completed specification task and
requires a separately materialized implementation owner/task before code is written.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
