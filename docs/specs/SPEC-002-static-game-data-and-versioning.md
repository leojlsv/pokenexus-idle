# SPEC-002 — Static Game Data, Versioning & PokémonDB Ingestion

- Status: APPROVED
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Related specs:
  - `docs/specs/SPEC-001-core-domain-model.md`
- Related ADRs:
  - `docs/decisions/ADR-001-runtime-and-language.md`
- Related tasks:
  - `TASK-004` — Domain Glossary & Core Model Spec
  - `TASK-005` — Core Domain Type Skeleton
  - `TASK-006` — this specification
  - `TASK-007` — Universal Combat Engine Architecture
  - `TASK-008` — Combat Rules Spec v1
  - `TASK-019` — Pokémon Instance / Collection / Team Spec
  - `TASK-022` — Inventory / Item Model Spec
  - `TASK-033` — PvE World/Map, Zone & Solo Hunt Rules/Lifecycle Spec
  - `TASK-034` — PvE World/Zone, Encounter & Hunt Data

## Problem

PokeNexus needs static Pokémon reference data that is locally available, deterministic,
auditable and immutable for authoritative/replayable gameplay. The external factual source
must not become a runtime dependency, and source-site presentation/editorial content must not
be confused with game rules.

The system also needs to evolve static data independently from executable game rules. A
species/move data correction must not imply that combat semantics changed, while a later
combat-rule revision must not require republishing an otherwise identical catalog merely to
produce a new rule identity.

## Goals

- define one immutable published game-data bundle contract;
- separate schema identity, static-content identity and executable-rule identity;
- define the first approved static factual schema for Species/forms, Moves, Types, Abilities,
  Items and Learnsets;
- define deterministic publication/checksum behavior;
- define provenance and validation requirements;
- define species/form normalization without adding `FormId`;
- define the DATA-only PokémonDB ingestion contract;
- ensure historical/replayable systems can pin exact accepted interpretation;
- preserve explicit ownership boundaries for combat, persistence, inventory and PvE content.

## Non-goals

- implement the crawler/exporter;
- implement `packages/game-data` production catalogs;
- define combat formulas or executable move/Ability/item effects;
- define IV ranges/formulas, Speed behavior or other balance decisions;
- define persistence tables or network payloads;
- define Team/loadout/inventory behavior;
- define PvE Zone/Hunt/Encounter content;
- import every PokémonDB field merely because it exists upstream.

## 1. Version identities

### 1.1 `schemaVersion`

`schemaVersion` identifies the serialized/validated contract of a published static-data
bundle. It changes when the canonical bundle shape or validation contract changes.

The representation is an opaque non-empty string. v1 implementations may use a simple
monotonic value such as `1`; consumers must compare the value as an identifier, not infer
compatibility from string ordering.

Schema compatibility policy is explicit: a consumer either supports the referenced
`schemaVersion` or rejects the bundle. There is no best-effort parsing of unsupported schema
versions in authoritative paths.

### 1.2 `gameDataVersion`

`gameDataVersion` identifies one immutable published normalized static-data bundle.

Properties:

- assigned only when a validated candidate is promoted to published/canonical status;
- never reused for different normalized content;
- never mutated in place;
- remains resolvable for as long as authoritative history references it;
- a correction or factual update creates a new `gameDataVersion`.

The version value is an opaque local PokeNexus identifier. Human-readable naming is allowed,
but consumers must not derive semantics from the string format.

### 1.3 `rulesVersion`

`rulesVersion` identifies executable game-rule semantics accepted by their owning specs/tasks.
TASK-006 defines the version envelope only; TASK-007/008 and later rule-owning tasks define the
actual executable rules associated with a particular value.

Changing static facts alone does not require a new `rulesVersion`. Changing executable rule
semantics does not automatically require a new `gameDataVersion`.

Every published `rulesVersion` is immutable and non-reusable. A rules release must retain an
immutable resolution descriptor sufficient for historical interpretation, containing at least:

- `rulesVersion`;
- an immutable rules artifact/configuration identity owned by the applicable rule task;
- cryptographic hash(es) for the rule artifact/configuration that carries executable semantics;
- compiler/interpreter/implementation identity where semantics depend on a compiler or rule
  compiler version;
- publication metadata and references needed to resolve the same accepted semantics later.

TASK-006 does not define the internal combat-rule artifact format. TASK-007/008 must fill this
envelope with the accepted rule representation. A `rulesVersion` referenced by authoritative
history must remain resolvable and retained; deprecation may prevent new use but never changes
the historical semantics of that version.

### 1.4 Authoritative static context

Any authoritative/replayable operation whose interpretation depends on static content and
rules must pin both:

```text
StaticContextRef = {
  gameDataVersion,
  rulesVersion
}
```

A bare `SpeciesId`, `MoveId`, `ItemId` or other static ID is insufficient to reinterpret a
historical authoritative result after data/rules evolve.

### 1.5 Accepted pair compatibility

Independent versioning does not mean every possible pair is valid.

New authoritative operations may use a `{ gameDataVersion, rulesVersion }` pair only when an
explicit compatibility record accepts that exact pair (or an explicitly defined immutable
compatibility set containing it). Compatibility must never be inferred from version-string
ordering, publication time or matching major/minor text.

Compatibility records are release metadata owned by the accepted data/rule release process.
They are immutable once referenced by authoritative history. A pair can later be deprecated
for new operations while remaining resolvable for replay/history.

## 2. Published bundle and deterministic verification

### 2.1 Logical bundle

A published game-data bundle is a **logical** bundle. It may be physically stored as multiple
deterministic catalog artifacts/shards so large Learnset/reference collections do not force
every runtime consumer to load one monolithic JSON file.

The logical bundle contains:

```text
GameDataBundle
  manifest
  catalogs
    species
    moves
    types
    abilities
    items
    learnsets
  referenceData
    currentTypeEffectiveness
```

TASK-033/034 may later extend the accepted schema with Zone/Encounter/Hunt content. TASK-006
does not fabricate those product/content rules in v1. Their eventual addition requires a new
accepted schema version when the concrete fields become known.

Physical sharding must not change logical semantics. A release manifest enumerates every
canonical artifact by stable logical name plus content hash and record count. Exact shard
boundaries are an implementation detail as long as the manifest and logical content are
deterministic.

### 2.2 Manifest

The published manifest contains at least:

- `schemaVersion`;
- `gameDataVersion`;
- `bundleHash`;
- `provenanceHash`;
- `publishedAt`;
- `normalizerVersion`;
- deterministic artifact descriptors containing logical name, content hash and record count;
- provenance-manifest identity/reference;
- source-inventory identity/hash;
- catalog counts/summaries sufficient for validation diagnostics.

`rulesVersion` is not embedded as the identity of the static bundle. It is paired with the
bundle by authoritative runtime/history through `StaticContextRef`, because one static bundle
may be valid under more than one accepted rules version.

### 2.3 Canonical serialization, artifact hashes and Unicode

Every canonical normalized artifact is serialized deterministically before hashing:

- UTF-8 JSON;
- normalized canonical string values are converted to Unicode NFC before canonical JSON
  serialization; raw fetched response bytes are **not** Unicode-normalized before their
  `sourceContentHash` is calculated;
- object keys use deterministic canonical ordering;
- catalog records use deterministic ordering by canonical PokeNexus ID;
- set-like arrays use an explicitly documented deterministic order;
- no timestamps or machine-local paths are placed inside the hashed normalized payload unless
  they are semantically part of the published bundle;
- the artifact's own hash field, if represented alongside content, is excluded from the bytes
  it authenticates.

Each canonical artifact receives `contentHash = SHA-256(canonical-artifact-bytes)` represented
as `sha256:<lowercase-hex>`.

An implementation may use RFC 8785 JSON Canonicalization Scheme or an equivalently specified
deterministic serializer. Whatever algorithm is selected becomes part of `schemaVersion` and
must have reproducibility tests.

### 2.4 Provenance hash and exact `bundleHash` preimage

The provenance manifest is immutable for a published release and receives:

```text
provenanceHash = SHA-256(canonical-NFC(provenance-manifest-without-provenanceHash))
```

The published `bundleHash` cryptographically binds the game-data release identity, all
normalized artifacts and the immutable provenance manifest. Its exact logical preimage is:

```text
BundleHashInput = {
  schemaVersion,
  gameDataVersion,
  artifacts: [
    { logicalName, contentHash, recordCount },
    ... sorted by logicalName
  ],
  provenanceHash
}
```

Then:

```text
bundleHash = SHA-256(canonical-NFC(BundleHashInput))
```

`publishedAt` is release metadata and is intentionally outside this content/identity hash
preimage. The release manifest still records it. `rulesVersion` is also outside
`bundleHash`; data/rule pairing is governed by `StaticContextRef` compatibility records.

## 3. Publication lifecycle and immutability

The data pipeline has distinct states/artifacts:

```text
fetch/cache
  → raw extracted snapshot
  → normalized candidate
  → validation
  → staged candidate
  → atomic publication
  → immutable published bundle
```

Rules:

1. Fetch/cache output is working state and never canonical.
2. Raw extracted snapshots contain only approved factual fields, not source HTML.
3. Normalized candidates may be regenerated while unpublished.
4. Validation must succeed before publication.
5. Publication assigns/finalizes the `gameDataVersion` and verified `bundleHash`.
6. Published bundles are immutable.
7. A correction publishes another version; it never overwrites an older referenced version.
8. Partial or failed ingestion output cannot be promoted.

Activation/deprecation is separate metadata that references immutable published bundles.
Changing which version is active does not mutate the bundle itself. Rollback selects a prior
published version rather than rewriting current content.

Any published version referenced by authoritative battle/reward/checkpoint/persistence history
must be retained. Physical deletion is outside normal content publishing and requires a later
explicit retention/maintenance policy proving that no authoritative reference remains.

## 4. Canonical identity vs source identity

### 4.1 Canonical PokeNexus IDs

The branded IDs established by TASK-005 remain PokeNexus identities. They are not aliases for
National Dex numbers, source slugs, display names or page positions.

Each normalized record stores source identity/reference attributes separately from the
canonical PokeNexus ID.

### 4.2 Candidate ID onboarding

For first-time source entities, ingestion may deterministically propose a local candidate ID
from an approved normalized source key to reduce manual work. The proposal is not canonical
until the candidate dataset passes validation and is accepted/published.

After a PokeNexus ID is first published:

- the ID is frozen;
- an upstream slug/name change updates source metadata under a new `gameDataVersion` but does
  not rename the canonical ID;
- a source entity unexpectedly remapping to another canonical ID is a validation error;
- ambiguous/new forms remain unmapped candidates until explicitly resolved.

The mapping registry therefore becomes local project data, not a live upstream keyspace.

The mapping registry is also the explicit **accepted form/source roster**. PokémonDB exposing
a new cosmetic, transformation, regional or alternate form does not automatically make that
form canonical PokeNexus content. Newly discovered/unmapped forms are candidates/findings and
must be explicitly resolved before publication. TASK-006 therefore does not silently decide
that every upstream Mega/Gigantamax/cosmetic/form category is supported gameplay.

## 5. Species and form normalization

### 5.1 Species Definition v1

One normalized Species Definition contains at least:

- `id: SpeciesId`;
- `sourceName`;
- `sourceSlug`;
- `nationalDexNumber` as non-unique factual reference;
- `introducedGeneration`;
- `formLabel: string | null`;
- `baseSpeciesId: SpeciesId | null`;
- one or two current `TypeId` references;
- complete six-key base `StatBlock<number>`;
- eligible Ability assignments;
- `catchRate`;
- `baseExperience`;
- normalized `growthRate`;
- provenance/source references.

This schema does not include display assets, flavor text, height/weight, breeding fields,
evolution rules or encounter locations in v1.

### 5.2 Base species and alternate forms

No `FormId` is introduced.

- each independently addressable accepted form has its own `SpeciesId`;
- a base definition uses `baseSpeciesId: null`;
- an accepted alternate/regional/other form points to the canonical base definition through
  `baseSpeciesId`;
- National Dex duplication across forms is expected and valid;
- source form labels remain source/reference attributes, not canonical identity;
- if PokémonDB exposes a form but the relationship cannot be normalized unambiguously, the
  candidate fails validation until explicitly resolved.

Generation/game qualifiers describing source facts belong to source/learnset dimensions; they
do not automatically create another canonical Species identity.

## 6. Move Definition v1

One normalized Move Definition contains at least:

- `id: MoveId`;
- `sourceName`;
- `sourceSlug`;
- `introducedGeneration`;
- `typeId: TypeId`;
- `sourceCategory: physical | special | status` as factual upstream reference data;
- `power: number | null`;
- `accuracy: number | null`;
- `pp: number`;
- `makesContact: boolean`;
- structured source target classification;
- provenance/source references.

`null` represents a factual source field that is structurally not numeric/applicable (for
example a status move with no power), not a parser failure. Missing/unparseable required source
data is a validation error and must not be silently converted to `null`.

Move priority is intentionally not in baseline v1. TASK-008 may explicitly request it if the
accepted PokeNexus timing/action model needs the factual source field.

`sourceCategory` does not define the executable PokeNexus Move category model. TASK-008 may
adopt, map or reject the upstream category when defining combat semantics.

Effect prose, Z-Move prose, historical change prose and game-description prose are excluded
from canonical DATA. TASK-008 owns executable semantics.

## 7. Learnset v1

A normalized learnset entry contains:

- `speciesId: SpeciesId`;
- `moveId: MoveId`;
- generation/game source scope;
- normalized structured learn method;
- `level` when the method is level-based;
- machine identifier when the method is machine-based;
- only method-specific structured qualifiers explicitly accepted by this schema;
- provenance/source references.

The normalizer supports only enumerated/understood source methods. A previously unseen method
label is a schema/parser finding, not a value silently collapsed into `other`.

Initial recognized method vocabulary may cover the structured categories currently exposed by
PokémonDB such as level-up, evolution, machine, egg, tutor and transfer-like groupings, but the
implementation must validate the exact current source labels before freezing parser mappings.

Learnset generation/game labels are source-domain qualifiers, not new core domain IDs.

The v1 recommendation retains the approved generation/game grouping rather than truncating the
source dataset to a single generation for file-size convenience. Physical published artifacts
may shard Learnsets by generation/game and load them on demand while remaining one logical
`gameDataVersion`.

## 8. Type Definition and type-effectiveness reference v1

Type Definition contains at least:

- `id: TypeId`;
- `sourceName`;
- `sourceSlug`;
- provenance/source references.

The baseline stores the **current** PokémonDB type-effectiveness matrix as factual reference
data. Each ordered attack-type/defense-type pair appears exactly once with one source factual
multiplier from the accepted current matrix domain.

This matrix is not automatically executable combat math. TASK-008 must explicitly decide how
PokeNexus maps/uses type-effectiveness facts, including stacking, STAB, immunities and any
future deviation from franchise behavior.

Historical Generation 1 and Generation 2–5 charts are deferred. Their upstream existence does
not make them canonical PokeNexus v1 data.

## 9. Ability Definition v1

Ability Definition contains at least:

- `id: AbilityId`;
- `sourceName`;
- `sourceSlug`;
- `introducedGeneration` when structurally available;
- provenance/source references.

Species Ability assignments contain:

- `abilityId`;
- normalized `sourceAbilitySlot` sufficient to distinguish current source roles such as first
  normal, second normal and hidden Ability eligibility.

The parser mapping for source Ability slots is closed/versioned. An unknown new slot structure
is a parser/validation finding rather than being silently collapsed into an existing slot.

Descriptive Ability text is excluded from canonical DATA and must never be compiled into
executable behavior by the crawler. TASK-008 owns executable Ability semantics; TASK-019 owns
which Ability an owned Pokémon may resolve/select.

## 10. Item Definition v1

Item Definition baseline contains only:

- `id: ItemId`;
- `sourceName`;
- `sourceSlug`;
- normalized structured source category/classification when available;
- provenance/source references.

Item effect prose, consumable behavior, stacking, owned-item representation, capture behavior,
equipment/TM mechanics and reward availability are excluded from TASK-006 executable semantics.
Those remain owned by TASK-022/TASK-023/TASK-024/TASK-033/TASK-034/TASK-036 as applicable.

Machine/item relationships are deferred until an accepted owning task demonstrates the need.

## 11. Provenance model

### 11.1 Source provider

Canonical Pokémon reference fields in v1 use provider identity `pokemondb`.

No silent PokeAPI or alternate-provider fallback is permitted. If PokémonDB is unavailable,
ambiguous, conflicting or missing an approved field, ingestion produces a validation finding
and stops canonical promotion pending an explicit PM/Human Owner decision.

### 11.2 Source record

Each fetched source document used for extraction has a provenance record containing at least:

- provider;
- canonical source URL;
- `fetchedAt` timestamp;
- parser version;
- `sourceContentHash` over the exact fetched response bytes used by the parser;
- fetch/cache status needed for diagnostics;
- references from normalized records to the source record(s) that support them.

The provenance manifest also contains the deterministic source/discovery inventory described
in section 13. It is immutable once published and is bound into `bundleHash` through
`provenanceHash`.

Publishing the source hash does not mean publishing source HTML. HTML remains transient
working/cache input and may be discarded after validation/promotion according to local tooling
policy.

## 12. Crawler/exporter contract

### 12.1 Runtime separation

The crawler/exporter is a build/data-maintenance tool, not a runtime dependency. It may run:

- manually/on demand; or
- in an explicitly controlled CI ingestion workflow.

Web/API/realtime/gameplay runtime must not fetch PokémonDB.

### 12.2 Access-policy gate

Every ingestion run must retrieve/evaluate the current `https://pokemondb.net/robots.txt`
before crawling approved pages.

As observed during TASK-006 drafting on 2026-09-15, the current public policy includes
`Crawl-delay: 2` for `User-agent: *` and blocks specific PokéBase search/revision paths. This
observation is not a permanently hard-coded entitlement: the crawler must honor the policy
that exists at execution time.

Rules:

- descriptive project User-Agent;
- single-worker/sequential requests by default;
- interval never faster than the current robots crawl delay and may be more conservative;
- cache already-fetched pages;
- exponential backoff with jitter for transient failures/429/5xx;
- fail closed if robots/access policy cannot be read or interpreted safely;
- do not bypass blocks through alternate user agents, mirrors or providers.

### 12.3 Parser behavior

- extract only approved whitelist fields;
- parser selectors must be explicit and versioned;
- structural selector drift that affects required data is a validation/parser failure;
- image `alt` text must not be used as a canonical DATA fallback;
- no OCR/screenshot-derived canonical fields;
- no editorial prose extraction as executable data;
- unknown/unapproved extracted fields are rejected or omitted before raw-extracted snapshot
  publication according to the schema whitelist; they never silently enter normalized data.

### 12.4 Outputs

One successful ingestion candidate emits separately:

1. raw extracted whitelisted snapshot;
2. normalized candidate bundle;
3. provenance manifest;
4. validation report.

Only the normalized validated candidate is eligible for canonical publication.

Checkpoint/resume, retry/backoff, cache, diagnostics, atomic promotion and deterministic
fingerprinting patterns from the Human Owner's prior `pokemondb_moves_crawler_v2.py` may be
adapted. Its historical PokeAPI fallback and image-alt fallback behavior are explicitly
incompatible with this specification and must not be copied.

## 13. Validation requirements

Before publication, validation must at minimum prove:

### Bundle/manifest

- supported `schemaVersion`;
- unique new `gameDataVersion`;
- reproducible `bundleHash`;
- deterministic serialization/order;
- complete provenance manifest references.

### Identity/references

- canonical IDs unique within their catalog;
- source-to-canonical mappings non-ambiguous;
- all cross-catalog ID references resolve;
- National Dex duplicates are allowed only as reference facts and do not collapse forms;
- published canonical IDs are not silently renamed due to upstream label changes.

### Species

- one or two current Type references;
- all six base stat keys exactly once;
- numeric source fields finite/integer where schema requires integers;
- Ability assignments resolve;
- base-species references resolve and do not create invalid cycles.

### Moves

- Type reference resolves;
- category belongs to accepted source factual enum;
- `power`/`accuracy` nullability follows structural source meaning, not parser failure;
- PP valid under the factual schema;
- contact flag present;
- target classification recognized.

### Learnsets

- Species and Move references resolve;
- generation/game scope present;
- learn method recognized;
- method-specific required qualifiers present.

### Type matrix

- each current attack/defense Type pair represented exactly once;
- no unknown Type reference;
- factual multiplier belongs to the accepted source-domain set;
- historical charts cannot silently leak into the current matrix.

### Provenance/source policy

- every normalized source-backed record traces to at least one source record;
- every source record has URL/fetchedAt/parser version/source-content hash;
- no forbidden asset/editorial/layout fields in raw extracted or normalized output;
- no alternate-provider canonical data silently mixed into the bundle.

Any required validation failure blocks canonical publication.

### Coverage / completeness

Internal referential validity is not sufficient: the pipeline must also prove that it did not
silently omit whole source pages/entities because discovery, pagination or selectors drifted.

Each ingestion candidate therefore maintains deterministic inventories for every approved
catalog/source surface:

- `discoveredSourceKeys` — all source keys discovered from the approved index/sitemap/list
  surfaces for the ingestion profile;
- `acceptedMappingKeys` — source keys explicitly mapped/accepted by the local mapping roster;
- `extractedSourceKeys` — source keys for which whitelisted DATA extraction succeeded;
- `normalizedSourceKeys` — source keys represented in normalized candidate records;
- explicit excluded/deferred keys with a policy reason where the approved profile intentionally
  does not publish a discovered upstream entity/form.

Validation reconciles these inventories and blocks publication on unexplained:

- missing accepted keys;
- newly discovered unmapped keys;
- removals/renames relative to the previous published mapping;
- duplicate mappings;
- extracted-but-not-normalized keys;
- normalized keys without supporting extraction/provenance.

The canonical provenance manifest stores the reconciled inventory and its deterministic
`sourceInventoryHash`, so completeness evidence is cryptographically bound to the release.

## 14. Baseline DATA whitelist v1

The whitelist has two different layers. **Source extraction fields** are factual values the
crawler is allowed to read from PokémonDB. **Normalized/local fields** are generated by
PokeNexus from accepted mappings and validated references; they are not claimed to have been
scraped directly from the source.

### 14.1 Source extraction fields

- Species/form source name/slug, National Dex number, introduced generation, form labels and
  source relationship labels needed to normalize accepted forms;
- current species Type source identities and six base-stat numeric values;
- source Ability names/links and current first/second/hidden assignment structure;
- catch rate, base experience and growth rate;
- Move source name/slug, introduced generation, Type source identity, `sourceCategory`, power,
  accuracy, PP, contact flag and structured target information;
- structured Learnset source facts: species/form source key, generation/game grouping, Move
  source key, learn method and method qualifiers such as level/machine identifier;
- current Type source identities and current type-effectiveness reference matrix;
- Ability source identity/name/slug and introduced-generation fact when structurally available;
- Item source identity/name/slug and structured category/classification when available.

### 14.2 Normalized/local canonical fields

These are allowed outputs of the normalizer, not direct crawler fields:

- canonical `SpeciesId`, `MoveId`, `TypeId`, `AbilityId`, `ItemId` references;
- `baseSpeciesId` relationships from the accepted local mapping roster;
- normalized `sourceAbilitySlot`, learn-method and target-classification enums;
- source-record/provenance references;
- deterministic ordering, artifact descriptors and hashes;
- publication/version metadata defined by this specification.

### 14.3 Deferred/conditional

- height/weight;
- historical species types/type matrices;
- move priority;
- EV yield/training;
- gender/breeding/egg data;
- evolution graph/triggers;
- PokémonDB encounter/location data;
- machine/item relationships;
- any unowned franchise field.

### 14.4 Excluded

- images, sprites, icons, audio and other assets;
- flavor/Pokédex text;
- game descriptions;
- editorial move/Ability/item effect prose;
- language/translation tables;
- layout/CSS/site presentation;
- min/max stat calculators;
- competitive recommendations;
- any field not in the accepted whitelist.

## 15. Schema extension ownership

TASK-006 establishes the immutable bundle/version/provenance framework and the v1 Pokémon
reference catalogs above. Later owner tasks may extend the schema through a new accepted
`schemaVersion` when they have concrete requirements.

- TASK-007/008: combat input/rules/event semantics and any additional factual move fields they
  explicitly require;
- TASK-019: owned Pokémon/Ability selection and instance state;
- TASK-021: progression/evolution if adopted;
- TASK-022: item/inventory semantics and any required machine/item data;
- TASK-033/034: PvE World/Zone/Hunt/Encounter content and drop tables;
- TASK-013: persistence representation.

Later extensions must not rewrite previously published bundle semantics in place.

### Package ownership expectation

Static definition schemas and published catalog loaders belong to `packages/game-data` by
default, consistent with SPEC-001. Infrastructure-free primitives that genuinely need to be
shared independently of the data package may be promoted to `packages/game-types` by an
implementation task, but TASK-006 does not move the static catalog itself into `game-types`.

## 16. Canonical fixture expectations

Implementation following this specification must include deterministic fixtures that cover:

- at least two distinct canonical ID kinds;
- base species plus independently addressable alternate form sharing one National Dex number;
- complete six-stat block;
- one numeric-damage Move and one Move with structurally null power or accuracy;
- Ability normal/hidden assignment;
- one structured Learnset method with a level qualifier and one non-level method;
- Type matrix validation edge cases;
- provenance/source hash verification;
- deterministic canonical serialization/hash reproduction;
- validation failure for ambiguous mapping and missing required source field.

Fixtures may use synthetic values for unit/schema tests. Source-backed parser integration
fixtures must still obey the DATA-only policy and may not embed prohibited source content.

## 17. Human Owner decisions

The Human Owner approved this specification and ratified the following decisions:

1. **Separate version identities:** `schemaVersion`, `gameDataVersion` and `rulesVersion` remain
   distinct; authoritative history pins `{ gameDataVersion, rulesVersion }`.
2. **Rules lifecycle envelope:** each published `rulesVersion` is immutable/non-reusable,
   resolves to hashed rule artifact/config/compiler identity and is retained while referenced.
3. **Explicit pair compatibility:** independently versioned data/rules are usable together only
   through an accepted compatibility record; compatibility is never inferred from version text.
4. **Immutable publication:** corrections create new game-data versions; published referenced
   bundles are retained.
5. **Canonical verification:** NFC-normalized deterministic JSON + per-artifact SHA-256,
   immutable `provenanceHash` and exact `bundleHash` preimage authenticate the release.
6. **Canonical identity independence:** source slug/Dex/name may propose/map records but never
   automatically redefine a published PokeNexus ID.
7. **Forms:** accepted forms are explicit mapping-roster entries; distinct accepted forms use
   distinct `SpeciesId`, `baseSpeciesId` groups them, no `FormId`, and source presence alone does
   not adopt every cosmetic/transformation form.
8. **Whitelist v1:** the exact source-extracted vs normalized/deferred/excluded policy in
   section 14 is accepted.
9. **Current type chart only:** current PokémonDB effectiveness is factual reference input;
   historical charts remain deferred and TASK-008 owns executable math.
10. **Move priority deferred:** not ingested in baseline until TASK-008 explicitly needs it.
11. **Learnset scope:** retain generation/game grouping in the logical snapshot; use physical
    sharding/lazy loading rather than silently limiting baseline to one generation for size.
12. **Crawler policy:** DATA-only, sequential/conservative, current-robots-gated, fail closed,
   no alternate-provider fallback and no runtime web dependency.
13. **Completeness gate:** source discovery/mapping/extraction/normalization inventories are
    reconciled and cryptographically bound so partial omissions cannot silently publish.
14. **Future content extension:** Zone/Encounter/Hunt concrete schemas remain with TASK-033/034
    and enter through a later schema version rather than being guessed now.

## Acceptance

Acceptance requirements:

1. independent QA review of this Class A proposal with no unresolved P0/P1 findings — complete;
2. Human Owner explicit acceptance of the decisions in section 17 — complete;
3. task/roadmap lifecycle is updated consistently — complete for the accepted specification;
4. implementation ownership is materialized before any production crawler or `game-data`
   code is written.

## Open implementation details after approval

The following do not need to be finalized to approve the architecture unless QA/feasibility
review finds they affect semantics:

- exact TypeScript file/module split in `packages/game-data`;
- concrete local `gameDataVersion` string naming convention;
- whether deterministic JSON uses an RFC 8785 library or an equivalent local implementation;
- cache/checkpoint storage layout for the ingestion tool;
- exact parser selector implementation;
- exact CI/manual command names.
