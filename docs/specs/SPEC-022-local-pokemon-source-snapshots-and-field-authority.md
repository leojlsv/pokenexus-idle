# SPEC-022 — Local Pokémon Source Snapshots & Field Authority

- Status: APPROVED — Human Owner accepted exact QA-cleared contract on 2026-10-02
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Amends:
  - `SPEC-002 — Static Game Data, Versioning & Canonical Pokémon Data Ingestion`
  - `SPEC-008 — SpeciesDefinition Static-Fact Extension`
- Related tasks:
  - `TASK-112 — Local Pokémon Source Snapshot & Authority Realignment`
  - `TASK-087 — Static Game Data Catalog & Ingestion Implementation`

## 1. Problem

The current static-data pipeline correctly keeps external factual providers out of gameplay runtime,
but maintenance ingestion still couples source acquisition and normalization. It also uses a global
Bulbapedia-primary / PokémonDB-complementary hierarchy even where the official PokéAPI v2 source
dataset exposes the same facts as deterministic structured relations.

PokeNexus needs to reduce fragile HTML extraction while preserving stronger requirements that already
exist for exact historical Move snapshots, form identity, Human-approved mappings and immutable
publication. The project must also guarantee that routine ingestion, CI, build, API, web, realtime
and gameplay can operate without contacting any third-party factual provider.

## 2. Goals

- define a strict acquisition → local ingestion → publication boundary;
- require ordinary ingestion to consume only local immutable source snapshots;
- prohibit third-party factual-provider access from runtime, routine CI/build and normal ingestion;
- approve the official PokéAPI v2 source dataset as a structured provider only for explicitly listed
  factual fields;
- replace the global source hierarchy with field-specific source authority;
- preserve local/Human authority over canonical PokeNexus IDs, accepted persistent forms and game
  rule semantics;
- preserve existing exact-game Move and Learnset behavior until dedicated parity evidence supports a
  later Human-approved amendment;
- extend provenance so every accepted fact remains traceable to an exact immutable upstream revision
  and exact local source bytes.

## 3. Non-goals

This specification does not:

- authorize `pokeapi.co`, GitHub, Bulbapedia, PokémonDB or another third party as a runtime service;
- authorize automatic provider fallback;
- authorize an implicit `latest`, `main` or `master` upstream revision;
- add executable evolution, breeding, Nature, Move, Ability or Item mechanics;
- add sprites, cries, artwork, icons or other presentation assets to canonical factual game data;
- redefine the current exact selected-game Move scalar policy;
- redefine the current Learnset Generation IX → BDSP fallback policy;
- publish a new `gameDataVersion` merely because an upstream snapshot exists.

## 4. External-access boundary

### 4.1 Three phases

Static factual data processing is separated into three phases:

1. **ACQUIRE** — an explicit maintenance operation that may contact an approved external source and
   materializes an immutable local snapshot;
2. **INGEST** — a deterministic local operation that parses only approved local snapshot bytes,
   reconciles them with the accepted mapping roster and produces a candidate;
3. **PUBLISH** — a deterministic local operation that validates, stages, Human-reviews and publishes a
   new immutable `gameDataVersion`.

Only ACQUIRE may use third-party network access. INGEST and PUBLISH must fail closed when required
snapshot bytes are absent and must never fetch them automatically.

### 4.2 Human gate for ACQUIRE

An upstream refresh/bootstrap is a deliberate Human-controlled maintenance action. ACQUIRE **must not
execute** without explicit affirmative Human Owner authorization for the exact acquisition request.
Before authorization, the Human Owner must be shown at least:

- provider;
- exact requested upstream revision/release identity when the provider publishes one; otherwise the
  exact source-locator set to capture;
- expected source surfaces/files;
- reason for refresh;
- whether the operation can change candidate facts or only refresh identical bytes.

Authorization is scoped to the exact provider, immutable revision/release identity and source
surface/file set presented at the gate. It is one-shot for that acquisition request: it does not
authorize another revision, another provider, additional source surfaces, redirects to an alternate
source, or fallback acquisition. Any such change requires a new explicit Human decision.

No missing fact, parser failure or provider disagreement authorizes an automatic network request.

### 4.3 Runtime and CI invariant

Web, API, realtime and gameplay runtime must not access third-party factual providers. Routine build,
test and CI must not require third-party factual-provider access. Runtime continues to consume only
project-published immutable game-data artifacts through `RuntimeGameDataReader`.

Project-owned immutable delivery through R2/CDN or an equivalent project-controlled reader remains
valid runtime delivery and is not an upstream factual-provider dependency.

### 4.4 Access-policy checks move to ACQUIRE

On acceptance, this section amends the operational placement of SPEC-002 §12.1 and §12.2. Any
network-facing crawler/exporter behavior described there becomes **ACQUIRE** behavior. Provider
robots/access-policy retrieval and evaluation are requirements of ACQUIRE, immediately before that
approved network acquisition, and are not steps of INGEST or PUBLISH.

For Bulbapedia/PokémonDB acquisition, the existing descriptive User-Agent, sequential/conservative
request rate, robots/access-policy interpretation, retry/backoff and fail-closed rules continue to
apply during ACQUIRE. For an approved PokéAPI source-repository snapshot, acquisition must obey the
applicable repository/provider access policy for the exact approved revision/surface set.

INGEST and PUBLISH must not retrieve robots.txt, provider policy, source pages, repository data or any
other third-party network resource. Missing/expired acquisition-policy evidence means a new ACQUIRE
operation must be separately authorized; it never causes INGEST to contact the provider.

## 5. Snapshot identity and provenance

### 5.1 Source snapshot

Every acquired source snapshot has one canonical `SourceSnapshotRecord` containing at least:

```text
SourceSnapshotRecord {
  id
  provider
  upstreamRevision // exact immutable revision when available, otherwise null
  acquiredAt
  files[] {
    logicalPath
    sourceLocator
    sourceContentHash
  }
  snapshotHash
}
```

When a provider publishes an immutable source revision, `upstreamRevision` is required and must be
that provider-specific immutable identity, such as an exact Git commit SHA or immutable release ID.
Branch names and mutable aliases are forbidden. For an approved mutable web surface that exposes no
provider revision identity, `upstreamRevision = null`; the exact locator set, acquisition timestamp
and content hashes then form the immutable local snapshot evidence.

`sourceContentHash` is SHA-256 over the exact local bytes parsed by ingestion. Files are canonicalized
by NFC-normalized `logicalPath`, sorted by UTF-8 byte order, and each entry contains exactly
`logicalPath`, immutable `sourceLocator` and `sourceContentHash`. The exact snapshot hash preimage is:

```text
snapshotHash = SHA-256(canonical-NFC({
  provider,
  upstreamRevision,
  acquiredAt,
  files
}))
```

`id` and `snapshotHash` itself are excluded from the hash preimage. `id` is derived deterministically
from provider + `snapshotHash`. Re-acquiring identical bytes at a later approved acquisition time is
a distinct immutable snapshot record, while per-file content hashes still expose byte identity. The
complete `SourceSnapshotRecord`, including `snapshotHash`, is part of the canonical provenance
manifest and therefore contributes to `provenanceHash` and `bundleHash`.

### 5.2 SourceRecord extension

Canonical provenance must distinguish source-document identity from acquisition state. Every source
record supporting normalized data must carry directly:

- provider;
- immutable upstream revision/snapshot identity;
- immutable source locator;
- parser version;
- exact source-content hash;
- local snapshot reference;
- acquisition timestamp/status for diagnostics.

`parserVersion` must not be overloaded to encode the upstream revision.

For schema `5`, each `SourceRecord` references exactly one canonical `SourceSnapshotRecord` and one
logical file/surface inside that snapshot. The `sourceContentHash` on the SourceRecord must equal the
hash of that exact snapshot file/surface. A source record cannot resolve required snapshot identity
through mutable or non-canonical external metadata.

Facts that require more than one source file must retain all supporting records. Canonical
provenance therefore adds non-Move field evidence relations:

```text
FactSourceRelation {
  subjectKind
  subjectKey
  factKey
  sourceRecordIds[] // non-empty, unique, canonical order
}
```

`subjectKind` and `factKey` are closed/versioned vocabularies for the published schema. Each relation
binds one normalized factual field/relation to every source file needed to prove it. Aggregate
`sourceRecordIds` on normalized records remain valid convenience/audit references but do not replace
the field-level relation when more precise evidence is required.

The schema-3/4 `MoveFactSourceRelation` remains historical. Schema `5` uses a versioned relation whose
source roles are non-empty source-record arrays:

```text
MoveFactSourceRelationV2 {
  moveId
  mainline {
    selectedGame
    sourceRecordIds[]
  }
  sourceTargetSourceRecordIds[]
  makesContactSourceRecordIds[]
  zaBaseCooldownSourceRecordIds[]
}
```

This permits relations such as `makesContact` to prove both the Move↔flag mapping file and the flag
vocabulary file. Every referenced SourceRecord and SourceSnapshotRecord is included in the canonical
`provenanceHash` preimage.

Historical published bundles remain immutable and are not rewritten to the new provenance shape.
The first published bundle using this provenance contract uses `schemaVersion = "5"`, extending the
current schema-4 PvE-capable bundle rather than reinterpreting schema `3` or `4`. Consumers that do not
explicitly support schema `5` fail closed.

### 5.3 Snapshot retention

Exact source-snapshot bytes that support a staged or published candidate must be retained in
project-controlled maintenance storage under their immutable snapshot identity. They are not runtime
artifacts, but they must remain available for deterministic re-parse, provenance audit and future
parser verification without contacting the upstream provider.

Retention may use repository storage or project-controlled artifact/object storage according to an
implementation task, provided that:

- lookup is by immutable snapshot identity/content hash rather than a mutable latest path;
- the exact parsed bytes can be recovered without third-party network access;
- a published `SourceRecord` cannot reference a snapshot that has been garbage-collected;
- source-snapshot retention does not expose source files as gameplay/runtime authority.

## 6. Approved providers and authority model

The approved factual providers become:

- `pokeapi` — official PokéAPI source dataset, consumed from an exact pinned local snapshot of the
  source repository's `data/v2/csv` dataset at an immutable commit/release revision;
- `bulbapedia` — local snapshot of approved Bulbapedia factual surfaces;
- `pokemondb` — local snapshot of approved PokémonDB factual surfaces.

Provider membership does not imply authority for every field. Authority is defined per field or
relation below. A non-authoritative provider may be used for deterministic cross-checking but must
never silently replace the authoritative source.

PokéAPI REST responses are not canonical source records under this amendment. They may be used for
human/engineering consultation, but canonical PokéAPI ingestion is based on the approved pinned local
source-dataset snapshot so normal parsing and publication remain offline and bulk-reproducible.

Canonical PokeNexus IDs, mapping status, persistent-form acceptance/exclusion and executable rules
remain local/Human-controlled regardless of upstream provider identity.

### 6.1 Authority summary

| Canonical field/relation | Authority after this amendment | Notes |
|---|---|---|
| canonical IDs / accepted mapping roster | local/Human | upstream discovery cannot auto-accept identities |
| persistent-form inclusion/exclusion | local/Human | battle-only/unsupported forms remain review decisions |
| Species exact-variety Types / Base Stats / Abilities / Base Exp / height / weight / EV yield | pinned PokéAPI snapshot | exact `Pokemon`/variety relations; parity gate required |
| Species National Dex / base-species generation / catch rate / growth / Egg Groups / gender | pinned PokéAPI snapshot | species-scoped relation may support bound varieties |
| exact persistent-form introduced generation | conditional PokéAPI mapping | form version-group → generation relation requires complete accepted-roster coverage audit |
| Species `baseFriendship` / `eggCycles` | conditional PokéAPI mapping | `base_happiness` / `hatch_counter` require explicit accepted normalization |
| Species `sourceSlug` | pinned PokéAPI snapshot | exact accepted variety identifier; mapping roster remains canonical identity |
| Species `sourceName` / exact `formLabel` | current authority until coverage audit | PokéAPI localized/form-name tables may replace it only after complete accepted-roster coverage; no synthetic full-form name |
| Move `sourceTarget` / `makesContact` | pinned PokéAPI snapshot | structured target and `contact` flag relations |
| Move type/category/Base PP/Power/Accuracy | current Bulbapedia selected-game policy | PokéAPI may cross-check only |
| Move Z-A Base Cooldown | Bulbapedia | unchanged |
| current Type `sourceName` / `sourceSlug` / matrix | pinned PokéAPI snapshot | English localized-name coverage and complete matrix required |
| Ability `sourceName` / `sourceSlug` / generation and Species assignment | pinned PokéAPI snapshot | English localized-name coverage required; effect prose remains excluded |
| Item `sourceName` / `sourceSlug` / category | pinned PokéAPI snapshot | English localized-name/category coverage required; executable effects remain separately owned |
| Learnsets | current Bulbapedia policy | PokéAPI parity/audit only until later semantic amendment |
| Evolution / Nature | not published by this amendment | future owning specs |
| sprites / artwork / cries / assets | excluded | future mirrored asset pipeline only |

## 7. Species and form authority

### 7.1 Local/Human authority

The following remain authoritative local decisions:

- canonical `SpeciesId`;
- `baseSpeciesId`;
- accepted persistent-form roster;
- excluded/deferred battle-only or unsupported forms;
- accepted source-key → canonical-ID mapping.

PokéAPI discovery may propose or corroborate source identities but must not automatically create or
accept canonical Species records.

### 7.2 PokéAPI structured authority

After a complete accepted-roster parity audit, the pinned PokéAPI source dataset is approved as the
primary factual source for:

- exact variety Type assignments;
- exact variety six-stat Base Stats;
- exact variety Ability assignments including normal slot and Hidden Ability status;
- exact variety Base Experience availability/value;
- exact variety height;
- exact variety weight;
- exact variety EV yield;
- species National Pokédex relation;
- base/non-form species introduced generation;
- species capture rate;
- species growth rate;
- species Egg Group membership;
- species gender ratio/genderless encoding.

For an accepted alternate persistent form, `introducedGeneration` may move to PokéAPI authority only
after the accepted-roster audit proves the exact form → introduced version group → generation chain.
Until then its current authority remains unchanged. `sourceSlug` may use the exact accepted PokéAPI
variety identifier after parity validation. `sourceName` and `formLabel` remain on current authority
until localized/form-name coverage is proven complete; ingestion must not synthesize a canonical full
form name from partial labels.

Species-scoped facts may support multiple accepted varieties only when the source relation explicitly
binds each variety to the same `PokemonSpecies`. This is provenance-backed shared scope, not
`baseSpeciesId` inheritance.

The following normalization aliases require explicit accepted mapping and tests before publication:

- PokéAPI `base_happiness` → PokeNexus `baseFriendship`;
- PokéAPI `hatch_counter` → PokeNexus `eggCycles`.

Until those mappings are accepted by the Human Owner with the TASK-112 contract, their existing
authority remains unchanged.

### 7.3 Form discovery

PokéAPI variety/form relations and structured flags such as battle-only/Mega/form introduction may be
used as discovery and reconciliation evidence. They never override the accepted local persistent-form
roster. Unknown/new upstream forms fail closed into candidate/deferred review.

## 8. Move authority

### 8.1 PokéAPI authority

The pinned PokéAPI dataset is approved as primary structured authority for:

- Move source identity/slug where mapped to an accepted local MoveId;
- factual `sourceTarget`;
- factual `makesContact`, derived only from the structured `contact` Move flag relation.

Unknown Move target or flag identities fail closed.

### 8.2 Existing Bulbapedia authority retained

The current SPEC-002 selected-game policy remains authoritative for:

- `typeId`;
- nominal category;
- Base PP;
- Power;
- Accuracy.

The selection order remains the accepted Scarlet/Violet + DLC final snapshot with the existing exact
historical fallback chain. PokéAPI current/changelog data may be used for cross-checking only until a
separate differential proof demonstrates exact selected-game reconstruction and a later Human-approved
spec amendment changes authority.

Bulbapedia remains authoritative for `zaBaseCooldownMs`.

## 9. Types, Abilities and Items

After parity validation against the accepted publication, the pinned PokéAPI dataset is approved as
primary factual authority for:

- Type identity/source metadata used by the current catalog;
- the complete current Type effectiveness matrix;
- Ability identity and introduced generation;
- Species/variety Ability assignments;
- Item identity and source category/classification required by `ItemDefinitionV1`.

Where the normalized schema stores `sourceName` and `sourceSlug`, PokéAPI authority requires the
corresponding exact identifier plus complete English localized-name coverage for every accepted row.
Missing localized names fail the authority migration for that field rather than triggering a
synthetic name or fallback provider.

Effect prose, prices, competitive interpretation and executable mechanics remain excluded unless a
separate accepted spec owns them.

## 10. Learnsets

PokéAPI version-group, learn-method, level and machine relations are approved for parity/audit use.
They are not yet canonical Learnset authority.

The existing SPEC-002 rule that selects the canonical Generation IX surface and activates the BDSP
fallback only under its exact accepted availability condition remains unchanged. Absence of a PokéAPI
row must not be treated as equivalent to the current provider-specific fallback trigger.

A future authority change requires:

- complete Kanto/Johto differential evidence against the currently published Learnset artifact;
- an explicit dataset-native definition of Generation IX availability;
- an explicit dataset-native BDSP fallback trigger;
- Human acceptance of that semantic amendment before implementation.

## 11. Evolution, Nature and presentation assets

PokéAPI evolution/form/Nature relations may be retained as non-published maintenance evidence when an
owning task needs them. They do not become runtime catalogs under this specification.

Evolution topology/triggers, Nature mechanics and corresponding persistent instance behavior remain
owned by future accepted specs.

Sprites, artwork, cries and other presentation assets remain excluded. A future asset pipeline must
mirror approved bytes into project-controlled storage with immutable hashes; hotlinking third-party
assets is forbidden.

## 12. Ingestion and reconciliation requirements

Normal ingestion must:

- accept local snapshot roots/identities as explicit inputs;
- verify snapshot manifest and file hashes before parsing;
- parse only the whitelisted source files/fields required by the approved field-authority matrix;
- use deterministic joins and versioned parsers;
- maintain the existing accepted mapping roster as canonical identity authority;
- fail closed on missing required files, unknown enum/method/target/flag identities, duplicate source
  bindings or ambiguous form relations;
- preserve exact per-field provenance through the canonical FactSource/MoveFactSource evidence
  relation to all supporting local snapshot SourceRecord(s);
- report authoritative-vs-complementary disagreement without silently changing the accepted value;
- produce no network request as a consequence of a missing local source.

The first PokéAPI-backed candidate must compare every normalized field against the current accepted
publication. Any unexplained factual delta blocks promotion and requires classification before Human
data-gate review.

## 13. Publication and retention

- existing published `gameDataVersion` directories remain byte-immutable;
- adopting PokéAPI-backed source authority creates a new candidate and, after all gates, a new
  `gameDataVersion`;
- the first provenance/publication produced under this amendment uses exact `schemaVersion = "5"`;
- schema `3` and schema `4` publications retain their historical provenance interpretation unchanged;
- runtime delivery code remains provider-agnostic and resolves only immutable PokeNexus publications;
- source snapshots are maintenance evidence and must not be exposed as runtime authority.

## 14. Required implementation sequence

1. accept this Class-A source-policy/provenance contract;
2. materialize a READY implementation task without changing historical TASK-087 completion records;
3. implement local snapshot manifest/provenance support and a PokéAPI CSV adapter;
4. run a complete parity audit against the current accepted publication;
5. migrate the explicitly approved low-ambiguity fields first;
6. retain current Move scalar and Learnset authority until their dedicated evidence gates pass;
7. stage a new candidate and present the exact data diff to the Human Owner before publication.

No upstream refresh, canonical publication, Git-history operation or deployment is implicitly
authorized by this sequence.

## 15. Acceptance

This specification is authoritative after:

- independent pre-implementation QA found P0/P1/P2/P3 = 0/0/0/0;
- the Human Owner accepted the exact field-authority and local-snapshot contract on 2026-10-02;
- TASK-112 records that acceptance and may now authorize a dependent implementation task to become
  READY, while ACQUIRE, publication, Git-history and deployment remain separately gated.
