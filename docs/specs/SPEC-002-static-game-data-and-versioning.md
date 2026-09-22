# SPEC-002 — Static Game Data, Versioning & Canonical Pokémon Data Ingestion

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
- define the canonical Pokémon factual-source ingestion contract;
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
- import every upstream field merely because it exists at a source provider.

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

**Current implementation contract:** schemaVersion `3`. The v2→v3 transition is the
Human-approved 2026-09-19 provenance-contract change that adds canonical per-Move fact-source role
relations without changing `MoveDefinition`.

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

## 6. Move Definition — Human-approved exact structure

> **Human capture — 2026-09-18/19:** the MoveDefinition decision sequence is now materially closed.
> Traditional mainline facts, Core-learnset catalog closure, `power: number | null`,
> `accuracy: number | null`, inline Type/category/Base PP/target/contact and inline
> `zaBaseCooldownMs: number | null` are approved.
>
> **Target enum capture — 2026-09-19:** exact pre-capture SHA-256
> `13636DC63FC92776D1F52E080CF3A90643BCE375F449209A4092E18B33270A32`.
> The Human Owner approved the complete closed `MoveSourceTarget` vocabulary defined below.
>
> **Cooldown clarification — 2026-09-18:** the approved Combat Rules v1 already uses per-Move
> cooldowns rather than PP consumption. The Human Owner then approved **Pokémon Legends: Z-A normal
> Base Cooldown** as the primary factual reference for PokeNexus cooldown publication whenever the
> same Move has a clearly mapped usable value there. Base PP remains required because the existing
> exact **Power + Base PP** curve is the fallback for compatible simple-damage Moves without a
> usable Z-A Base Cooldown. The resolved `moveCooldownMs` belongs to the immutable MoveRule/rules
> context, not to factual MoveDefinition. Z-A Speed scaling, wind-up, duration, spatial range,
> Plus Moves and other real-time semantics are not adopted. Baseline v1 has no PP consumption, no
> Struggle fallback and no Move Priority.
>
> **MoveDefinition checklist capture — 2026-09-18:** the Human Owner selected:
>
> - **MAINLINE TRADITIONAL** for non-cooldown Move facts: Scarlet/Violet + DLC first, then the latest
>   traditional turn-based mainline game where an otherwise unavailable Move has valid data;
> - **Core-learnset closure** for catalog scope: publish the Moves needed to resolve the approved
>   Kanto/Johto Core learnsets, regardless of Move introduction generation;
> - **FIELD-BY-FIELD** approval rather than ratifying the proposed minimal MoveDefinition wholesale;
> - `power: number | null`, where `null` means no single factual Base Power and never parser
>   failure/missing required source data;
> - `accuracy: number | null`, where `null` means no accuracy roll and never parser
>   failure/missing required source data;
> - the approved normal Z-A Base Cooldown fact as a **variant field inside MoveDefinition**.
>
> **Residual field capture — 2026-09-19:** exact pre-capture SHA-256
> `9E2D6C8951AEA22851B540552622B267E0F9FB430B0DEFC396C5ABEB51104215`.
> The Human Owner selected:
>
> - `typeId: TypeId` inline;
> - `category: physical | special | status` inline;
> - `basePp` inline as a positive integer factual value;
> - `sourceTarget` inline as a **closed factual turn-based enum**;
> - `makesContact: boolean` inline;
> - `zaBaseCooldownMs: number | null` inline, normalized to integer milliseconds; `null` means no
>   clearly mapped usable normal Z-A Base Cooldown.
>
> Exact fact-to-source traceability, including the Z-A source supporting `zaBaseCooldownMs`, remains
> mandatory under section 11 provenance requirements. Z-A Speed scaling and all other Z-A real-time
> fields remain excluded.

The accepted MoveDefinition field structure is:

- `id: MoveId`;
- `typeId: TypeId`;
- `category: physical | special | status` as the nominal/base factual category;
- `power: number | null`;
- `accuracy: number | null`;
- `basePp: positive integer`;
- `sourceTarget: MoveSourceTarget`, using the exact closed factual turn-based enum below;
- `makesContact: boolean`;
- `zaBaseCooldownMs: number | null`, with non-null values represented as integer milliseconds.

The exact Human-approved `MoveSourceTarget` vocabulary is:

```text
any-adjacent
any-other
self-or-adjacent-ally
adjacent-ally
adjacent-foe
all-adjacent
all-adjacent-foes
self-and-allies
all-allies
self
all-pokemon
random-opponent
entire-field
opponents-side
users-side
varies
```

This is factual DATA, not executable targeting semantics. The mapping from `sourceTarget` to the
accepted `MoveRule.targetScope` set remains immutable/versioned rules content. A factual target
classification with no accepted executable mapping remains fail-closed/unsupported rather than
being guessed or coerced.

`sourceName`, `sourceSlug`, `introducedGeneration`, exact source snapshot identity and provenance
metadata remain governed by the accepted mapping/provenance contracts rather than becoming
canonical Move identity. Every normalized fact still requires exact source traceability under
section 11.

For captured fields, `null` is semantic rather than an error sentinel:

- `power = null` means there is no single factual Base Power value for that Move under the accepted
  snapshot;
- `accuracy = null` means no accuracy roll;
- `zaBaseCooldownMs = null` means no clearly mapped usable normal Z-A Base Cooldown, so cooldown
  publication proceeds to the approved fallback path;
- missing/unparseable required source data remains a validation error and must never be silently
  converted to `null`.

Move priority is intentionally not in baseline v1. TASK-008 may explicitly request it if the
accepted PokeNexus timing/action model needs the factual source field.

The factual `category` field does not by itself define every executable category behavior. The
baseline simple-damage compiler may mirror it, while any runtime category override remains explicit
versioned MoveRule semantics.

Effect prose, Z-Move prose, historical change prose and game-description prose are excluded
from canonical DATA. TASK-008 owns executable semantics.

## 7. Learnset v1

> **Human amendment — 2026-09-18:** the Core gameplay policy is **modern baseline + explicitly
> approved PokeNexus adjustments**. Historical generation/game learnset material may still be
> retained as source/provenance/review evidence, but it does not automatically become the playable
> Core learnset.
>
> **Human amendment — 2026-09-20 (LEARNSET-BASELINE-01):** for the explicit Kanto/Johto Core
> (National Dex `1..251`), use the canonical Generation IX Scarlet/Violet learnset page when that
> surface exists. Only an exact HTTP `404` for that canonical page may activate the approved
> Generation VIII fallback, and that fallback selects only Brilliant Diamond/Shining Pearl evidence.
> A successful-but-malformed Generation IX response, access/policy failure, transient/server error or
> any other non-404 condition fails closed and must not trigger fallback. Sword/Shield, USUM and
> Sun/Moon are not automatic Learnset fallbacks.

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

The baseline stores the **modern approved** type-effectiveness matrix as factual reference data.
Bulbapedia is the primary factual authority and PokémonDB may complement/cross-check under the
source policy in section 10. Each ordered attack-type/defense-type pair appears exactly once with
one accepted factual multiplier from the modern matrix domain.

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

Canonical Pokémon reference fields use an explicit ordered source policy:

1. `bulbapedia` is the **primary factual/reference authority**, especially for generational
   history, change logs, historical Move/Species/Type facts, mechanic introduction/removal and
   other facts whose correct interpretation depends on generation context;
2. `pokemondb` is an approved **complementary factual source** for fields that are absent,
   materially less explicit or easier to verify structurally there, and for cross-checking;
3. a complementary source never silently overrides a Bulbapedia fact;
4. **Human Owner resolution captured 2026-09-20:** when Bulbapedia provides the structured factual
   value for an accepted field, that Bulbapedia value is authoritative even if PokémonDB disagrees;
   PokémonDB disagreement does not veto or replace that value. Structural identity/binding ambiguity,
   a missing Bulbapedia fact that would require complementary substitution, or an ambiguous Bulbapedia
   interpretation still fails closed until explicitly resolved;
5. every normalized fact must remain traceable through provenance to the exact source record(s)
   that support the accepted value.

This source hierarchy does not authorize automatic adoption of source values. Canonical PokeNexus
structure, behavior, data selection and accepted values remain Human-gated decisions.

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

### 11.3 Move fact-source roles

The Human Owner approved a canonical provenance-side relation on 2026-09-19. This relation is part
of `ProvenanceManifest`; it **does not add fields to MoveDefinition**.

For every canonical Move, `moveFactSources[]` contains exactly one relation:

```text
MoveFactSourceRelation {
  moveId
  mainline {
    selectedGame
    sourceRecordId
  }
  sourceTargetSourceRecordId
  makesContactSourceRecordId
  zaBaseCooldownSourceRecordId
}
```

`mainline.selectedGame` is closed to the already-approved traditional snapshot choices:

- `scarlet-violet`;
- `brilliant-diamond-shining-pearl`;
- `sword-shield`;
- `ultra-sun-ultra-moon`;
- `sun-moon`.

Validation requires every role SourceRecord to exist and also appear in the Move's aggregate
`sourceRecordIds`. The mainline role identifies the exact accepted snapshot source; target/contact
roles identify the complementary PokémonDB Move-page source; the Z-A role identifies the exact
canonical Z-A move-list source. The relation is canonical provenance and therefore participates in
`provenanceHash`.

Historical fallback does not become valid merely because a generation-level availability page is
referenced. When BDSP/SwSh/USUM/SM is selected, the mainline role must ultimately point to evidence
that proves the selected game's Type/category/Base PP/Power/Accuracy facts. If a generation-level
row cannot prove those facts because of a possible intra-generation delta, publication remains
fail-closed until selected-game-specific scalar proof is available.

Publishing the source hash does not mean publishing source HTML. HTML remains transient
working/cache input and may be discarded after validation/promotion according to local tooling
policy.

## 12. Crawler/exporter contract

### 12.1 Runtime separation

The crawler/exporter is a build/data-maintenance tool, not a runtime dependency. It may run:

- manually/on demand; or
- in an explicitly controlled CI ingestion workflow.

Web/API/realtime/gameplay runtime must not fetch Bulbapedia, PokémonDB or another external factual
provider.

### 12.2 Access-policy gate

Every ingestion run must retrieve/evaluate the current access policy/robots rules for every
provider it will crawl before requesting approved pages. Bulbapedia and PokémonDB are independent
providers and each provider's current policy must be evaluated separately at execution time.

Rules:

- descriptive project User-Agent;
- single-worker/sequential requests by default;
- interval never faster than the current robots crawl delay and may be more conservative;
- cache already-fetched pages;
- exponential backoff with jitter for transient failures/429/5xx;
- fail closed if robots/access policy cannot be read or interpreted safely;
- do not bypass provider-specific blocks through alternate user agents or mirrors;
- using PokémonDB as the approved complementary source is not a bypass for Bulbapedia access
  policy and must follow the source hierarchy in section 11.1.

### 12.3 Parser behavior

- extract only approved whitelist fields;
- parser selectors must be explicit and versioned;
- structural selector drift that affects required data is a validation/parser failure;
- image `alt` text must not be used as a canonical DATA fallback;
- no OCR/screenshot-derived canonical fields;
- prose may be used as factual/historical evidence where Bulbapedia is the accepted authority for
  a generation change or fact that is not available as a structured field, but prose must never
  be converted directly into executable game behavior without an accepted PokeNexus rule decision;
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
incompatible with this specification and must not be copied. Provider selection must follow the
approved Bulbapedia-primary / PokémonDB-complementary policy rather than opportunistic fallback.

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

### Moves — Human-approved structure and source selection

Canonical Move validation now requires:

- `id` resolves as a canonical MoveId;
- `typeId` resolves as a canonical TypeId;
- `category` is exactly `physical | special | status`;
- `power` is numeric or semantic `null`; malformed/unparseable source data is not `null`;
- `accuracy` is numeric or semantic `null`; malformed/unparseable source data is not `null`;
- `basePp` is a positive integer;
- `sourceTarget` is present and validates against the exact 16-member Human-approved factual enum;
- `makesContact` is boolean;
- `zaBaseCooldownMs` is integer milliseconds or semantic `null`; `null` means no clearly mapped
  usable normal Z-A Base Cooldown and therefore permits the approved fallback path;
- non-cooldown `typeId/category/basePp/power/accuracy` facts are selected Bulbapedia-primary under
  `MOVE-01`: latest/final patched Scarlet/Violet + DLC first, then BDSP → Sword/Shield → USUM →
  Sun/Moon only when SV is unusable; Legends: Arceus and Let's Go are not traditional fallback
  candidates;
- `sourceTarget` and `makesContact` may use PokémonDB as structured complementary evidence where the
  selected Bulbapedia availability surface does not expose those facts; it never overrides the
  selected Bulbapedia scalar facts;
- provenance remains sufficient to trace every accepted fact to its exact supporting source record.

### Learnsets

- Species and Move references resolve;
- generation/game scope present;
- learn method recognized;
- method-specific required qualifiers present;
- every published Species has at least one current Learnset row;
- every current published MoveDefinition is referenced by at least one current Learnset row;
- each Species resolves to exactly one selected Learnset generation/game source context;
- machine identity is scoped by generation + game + machine identifier and cannot map to multiple
  Moves inside the same source context;
- once Species/Move mappings are canonical, accepted Learnset inventory identity and published
  Learnset rows match exactly 1:1.

### Persistent forms

- `formLabel` and `baseSpeciesId` are either both present or both absent;
- a form points directly to a canonical base Species rather than another form;
- a form retains the National Dex number of its base Species;
- a form cannot be introduced before its base Species.

### Type matrix

- each current attack/defense Type pair represented exactly once;
- no unknown Type reference;
- factual multiplier belongs to the accepted source-domain set;
- historical charts cannot silently leak into the current matrix.

### Provenance/source policy

- every normalized source-backed record traces to at least one source record;
- every source record has URL/fetchedAt/parser version/source-content hash;
- no forbidden asset/editorial/layout fields in raw extracted or normalized output;
- no unapproved-provider data or unresolved cross-provider disagreement silently mixed into the bundle;
- semantically equivalent duplicate SourceRecords are rejected;
- unreferenced SourceRecords must be explicitly recognized retained ingestion/audit evidence rather
  than unexplained residue;
- cross-surface SourceRecord reuse is fail-closed except for explicitly approved evidence patterns;
- the current Bulbapedia type-chart SourceRecord may intentionally support both Type definitions and
  current type-effectiveness rows when provider, parser version and canonical URL match the approved
  type-chart surface exactly;
- Species SourceRecords shared across different National Dex identities are allowed only for the
  approved aggregate Regional-form evidence surface;
- one Learnset SourceRecord cannot provide Learnset evidence across different National Dex
  identities;
- a SourceRecord shared by Species and Learnset evidence must remain within one National Dex
  identity;
- a SourceRecord shared by Learnset and Move facts is allowed only for the approved historical
  BDSP mainline scalar-proof role and cannot simultaneously satisfy unrelated Move provenance roles.

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
- when an approved primary provider exposes a structured form identity that has no exact
  complementary-provider source key yet, the review profile may stage that exact provider form
  label as excluded/deferred only if the label is present in the fetched primary evidence. Such a
  provider-only disposition receives a deterministic provider-form source key, is bound to the
  primary source record, is included in `discoveredSourceKeys` and the reconciled inventory hash,
  and must not create a normalized record or candidate mapping merely to satisfy completeness.
  If the complementary provider already exposes the exact form identity, the normal discovered
  source key/disposition path is required instead.
- for a structured primary Species field, a hidden zero/placeholder row for an exact persistent
  form is evidence that the primary page does not expose a usable form-specific value for that
  field, not evidence that the base value is shared. A complementary-provider value may fill that
  exact field only when the parser records that exact placeholder relationship and no explicit
  primary fact exists for the form; an explicit primary value always wins.
- pre-Human review artifacts seal the complete excluded/deferred Species source binding, not only
  a representative sample. The evidence source-key set must exactly match the reconciled Species
  excluded/deferred inventory, and each relation is bound to its fetched SourceRecord and included
  in the deterministic review hash.

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
ingestion pipeline is allowed to read from approved providers under section 11.1. **Normalized/local fields** are generated by
PokeNexus from accepted mappings and validated references; they are not claimed to have been
scraped directly from the source.

### 14.1 Source extraction fields

- Species/form source name/slug, National Dex number, introduced generation, form labels and
  source relationship labels needed to normalize accepted forms;
- current species Type source identities and six base-stat numeric values;
- source Ability names/links and current first/second/hidden assignment structure;
- catch rate, base experience and growth rate;
- Move source name/slug and introduced-generation metadata; selected traditional-mainline Type
  source identity, nominal category, Base PP, power and accuracy; complementary contact flag and
  structured target information;
- normal **Pokémon Legends: Z-A Base Cooldown** for a clearly mapped canonical Move, as an
  explicitly approved factual variant used only by the cooldown source-resolution policy; this
  does not whitelist Z-A Speed scaling, wind-up, duration, spatial range, Plus Move values or
  other Z-A battle fields;
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
- upstream encounter/location data;
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
- Move-specific canonical fixtures must cover the captured field structure and representative
  `sourceTarget` enum members, including at least one value that does not directly map to every
  baseline `TargetScope` shape;
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
8. **Whitelist v1:** the non-Move source-extracted vs normalized/deferred/excluded policy in
   section 14 remains accepted. The Move field structure and exact closed `sourceTarget` vocabulary
   are Human-approved.
9. **Modern type chart for the Core:** the accepted modern effectiveness matrix is factual
   reference input; historical charts remain non-Core unless separately adopted and TASK-008 owns
   executable math.
10. **Move priority deferred:** Combat Rules v1 does not use Move Priority and explicitly does not
    require its ingestion. It remains outside the current baseline unless a later accepted
    rulesVersion requires it.
11. **Learnset scope:** retain generation/game grouping in the logical snapshot; use physical
    sharding/lazy loading rather than silently limiting baseline to one generation for size.
12. **Source/crawler policy:** Bulbapedia is the primary factual authority and PokémonDB is an
   approved complementary source; ingestion remains controlled, current-access-policy-gated,
   provenance-bound, fail-closed on unresolved disagreement and absent from runtime web paths.
13. **Completeness gate:** source discovery/mapping/extraction/normalization inventories are
    reconciled and cryptographically bound so partial omissions cannot silently publish.
14. **Future content extension:** Zone/Encounter/Hunt concrete schemas remain with TASK-033/034
   and enter through a later schema version rather than being guessed now.
15. **Human Owner source-policy amendment (2026-09-18):** this explicitly supersedes the earlier
   PokémonDB-only provider rule. Bulbapedia is preferred because its generation-by-generation
   descriptions and change histories are required to reason reliably about Pokémon, Move, Type and
   related factual evolution across Content Packs. PokémonDB remains an approved complementary
   source where needed.
16. **Core factual reference capture (2026-09-18):** Kanto/Johto uses modern approved Species/form
    typing, modern Base Stats, modern Ability assignments and the modern Type chart. Variant-game
    factual profiles remain isolated unless separately adopted.
17. **Move factual family vs schema:** traditional mainline is the accepted non-cooldown factual
    reference policy. The MoveDefinition field structure and exact closed `sourceTarget` enum are
    Human-approved and must not be replaced by the previous candidate schema/importer.
    The already-approved Combat boundary additionally fixes the current cooldown policy: use a
    clearly mapped normal Z-A Base Cooldown as the primary reference when available; otherwise use
    the existing Power + Base PP curve as fallback for compatible simple-damage Moves; otherwise
    author an explicit versioned cooldown. Factual Base PP therefore remains available for the
    fallback; PP is not consumed at runtime; `moveCooldownMs` is rule content/pair-derived output
    rather than a source field; there is no Struggle fallback or Move Priority in baseline v1.
18. **Core Learnset direction:** the playable Core starts from a modern Learnset baseline plus only
    explicitly approved PokeNexus adjustments. For National Dex `1..251`, the selected source
    baseline is Generation IX Scarlet/Violet when its canonical learnset page exists; exact
    structural absence (`HTTP 404`) may fall back only to Generation VIII Brilliant
    Diamond/Shining Pearl. Historical groupings outside that selected fallback remain source
    evidence and do not automatically define playable acquisition.
19. **Evolution direction:** when historical methods are awkward or unavailable, PokeNexus may
    adapt them, but each concrete adaptation still requires an explicit owning design/rule decision.
20. **Z-A cooldown adoption (2026-09-18/19):** normal Pokémon Legends: Z-A Base Cooldown is an
    approved factual variant and the primary external cooldown reference when clearly mapped/usable.
    Its accepted storage is inline `zaBaseCooldownMs: number | null`, normalized to integer
    milliseconds; `null` means no usable Z-A Base Cooldown. No other Z-A real-time battle field is
    adopted by this decision.
21. **MoveDefinition final structure capture (2026-09-18/19):** non-cooldown Move facts use the
    traditional mainline snapshot policy; catalog coverage closes the approved Kanto/Johto Core
    learnsets; Power and Accuracy are `number | null`; Type/category/Base PP/target/contact are
    inline; `sourceTarget` uses the exact 16-member closed enum in section 6; and Z-A Base Cooldown
    is inline as `zaBaseCooldownMs: number | null`. No MoveDefinition structure Human gate remains.
22. **MOVE-01 snapshot/fallback capture (2026-09-19):** `Scarlet/Violet + DLC` means the
    latest/final patched SV+DLC state represented by the versioned Bulbapedia Generation IX
    availability surface. A Move unusable in SV does not use stored-but-unusable SV scalars; it
    falls back to the latest usable traditional turn-based mainline snapshot in this order:
    BDSP → Sword/Shield → USUM → Sun/Moon. Legends: Arceus and Let's Go remain isolated variants.
23. **Move provenance-role capture (2026-09-19):** the Human Owner approved required
    `ProvenanceManifest.moveFactSources[]` relations keyed by MoveId with mainline selected game +
    SourceRecord, complementary sourceTarget/contact SourceRecords and Z-A Base Cooldown
    SourceRecord. This leaves the exact MoveDefinition structure unchanged and advances the
    canonical bundle contract to schemaVersion `3` as required by section 1.1.

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
