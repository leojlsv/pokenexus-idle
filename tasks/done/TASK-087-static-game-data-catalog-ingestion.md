# TASK-087 — Static Game Data Catalog & Ingestion Implementation

## Metadata

- State: DONE
- Class: B
- Owner: Lead Developer
- Owner execution surface: ChatGPT delegated implementation worker (explicit Lead Developer
  assignment; GitHub Copilot CLI monthly quota exhausted at implementation start)
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: N/A
- Auditor execution surface: N/A
- Consultants: N/A
- Consultant execution surface: N/A
- Human gate: canonical-data sample validation before any first real canonical
  publication/promotion, candidate-ID adoption, final acceptance or history integration
- Specs:
  - docs/specs/SPEC-002-static-game-data-and-versioning.md
  - docs/specs/SPEC-008-speciesdefinition-static-fact-extension.md
- Related contracts:
  - docs/specs/SPEC-001-core-domain-model.md
  - docs/specs/SPEC-003-combat-rules-v1.md
  - docs/specs/SPEC-005-pokemon-instance-collection-team.md
- Branch: fix/TASK-087-post-publication-hardening
- Worktree: .worktrees/TASK-087-post-publication-hardening

## Objective

Implement the accepted SPEC-002 + SPEC-008 static-data publication boundary in
packages/game-data so PokeNexus can build, validate, hash, publish and load immutable canonical
game-data bundles without any runtime dependency on Bulbapedia, PokémonDB or another external
factual provider.

The implementation must materialize the accepted non-Move schema and sourcing policy rather than
invent new Pokémon mechanics, new source providers, new form semantics or a new persistence
authority. MoveDefinition was the explicit exception: its exact field contract was reopened by the
Human Owner and is now Human-approved, implemented and closed under the schema-v3 provenance
contract documented below.

## Context

TASK-005, TASK-006 and TASK-092 are DONE and integrated. The repository currently has only a
placeholder packages/game-data entrypoint. SPEC-002 defines the logical bundle, version/hash
envelope, canonical factual-source policy, mapping roster, provenance, coverage reconciliation
and the Type/Ability/Item/Learnset schemas plus a pre-amendment Move candidate that is now
structurally reopened. SPEC-008 upgrades persistent
SpeciesDefinition to exact schema version "2" with the accepted static facts and SourceFact
semantics, while explicitly excluding/defering battle-only transformations such as Mega/Eternamax
from the persistent Species roster.

Human Owner source-policy amendment on 2026-09-18: Bulbapedia is the primary factual/reference
authority, especially for generation history and changelogs. PokémonDB is an approved complementary
source for missing/clearer structured facts and cross-checking. Source disagreement or ambiguity
must not be auto-resolved; it requires Human Owner validation. Smogon remains consultation-only for
PvP context and is not a canonical ingestion source.

Human Owner source-policy resolution on 2026-09-20: **Bulbapedia always wins for a structured fact
that Bulbapedia provides.** A conflicting PokémonDB value is complementary evidence only and does
not block or replace the Bulbapedia value. Structural source-identity/form binding disagreement,
missing-primary substitution, and ambiguous Bulbapedia interpretation remain fail-closed.

Human Owner Core-checklist capture on 2026-09-18:

- exact captured checklist SHA-256:
  `9ED8754DECDE197F05A37174AC52EE5375D7C5BC40B124BEEDA4848048BC7C0E`;

- use modern approved typing for Kanto/Johto Species/forms;
- use modern approved Base Stats;
- use modern turn-based factual Move values as the factual reference family;
- use modern Ability assignments, including Hidden Abilities in the Core;
- use a modern Learnset baseline with explicitly approved PokeNexus adjustments;
- adapt evolution methods to PokeNexus when necessary rather than forcing historical requirements;
- use the modern Type chart;
- keep Let's Go / Legends: Arceus / Legends: Z-A factual variants isolated unless explicitly
  adopted;
- use modern IVs, per-Move Physical/Special category, Natures, Nature Mints, Hyper Training,
  Ability Capsule + Ability Patch, manual evolution activation and official gender visual
  differences in the Core;
- keep TMs consumable;
- do not include Move Reminder in the Core;
- do not persist the capture Ball as owned-Pokémon collection identity/state merely because a Ball
  was used to capture it;
- launch with Breeding/Eggs, Shiny, Friendship, Held Items, day/night, battle Weather, Apricorn
  Balls, roaming Pokémon, Battle Tower and Move Tutors;
- EVs-vs-Stat-Experience remains **PENDING HUMAN** and must not be inferred from the other
  selections.

These selections approve product/reference direction only. They do **not** independently approve
numeric values, formulas, executable behavior details or storage/schema representation beyond
contracts already separately accepted.

Move-specific amendment: selecting **modern turn-based** in the checklist chose the factual
reference family only. It did **not** re-ratify the pre-checklist MoveDefinition field set or the
existing Move importer/schema. That exact-structure Human gate was subsequently captured and closed
by the decision artifacts documented below.

Human Owner cooldown correction on 2026-09-18:

- PokeNexus Combat Rules v1 uses **per-Move cooldowns** plus the Global Action Cooldown;
- PP is **not consumed** during battle;
- **approved cooldown source policy:** use the official normal **Pokémon Legends: Z-A Base
  Cooldown** as the primary reference when that Move has a clearly mapped usable value;
- factual Base PP remains required because the existing exact Power + Base PP curve is the fallback
  for compatible simple-damage Moves without a usable Z-A Base Cooldown;
- the resolved `moveCooldownMs` belongs to MoveRule/rule-context resolution, not factual
  MoveDefinition;
- Status/complex Moves without a usable Z-A Base Cooldown use explicitly authored cooldowns in
  their immutable MoveRules;
- an explicit versioned PokeNexus override may replace either the Z-A reference or formula fallback
  when required by accepted rules content;
- adopting the Z-A Base Cooldown does **not** adopt Z-A Speed scaling, wind-up, execution/effect
  duration, spatial range, Plus Moves or other Z-A battle semantics;
- baseline v1 has no Struggle fallback and no Move Priority requirement.

The concrete Human decision artifact for that gate is:

- docs/project/MOVE_DEFINITION_CHECKLIST.md

The checklist was captured on 2026-09-18 with exact pre-capture SHA-256:

- `AAF5266EC35C235B487BF5FE98569BCFE0C5C6474E42A4BDDA9388A9C339D267`

Captured Human decisions:

- **MOVE-01:** MAINLINE TRADICIONAL — Scarlet/Violet + DLC are the primary modern factual snapshot
  for non-cooldown Move facts, with fallback to the latest traditional turn-based mainline game
  where a Move has valid data;
- **MOVE-02:** FECHAMENTO DO LEARNSET DO CORE — publish the Moves required to close the approved
  Kanto/Johto Core learnsets, regardless of the Move's introduction generation;
- **MOVE-03:** DECIDIR CAMPO A CAMPO — the minimal boundary was not accepted wholesale;
- **MOVE-04:** Base Power is `number | null`; `null` means no single factual Base Power and never
  parser failure;
- **MOVE-05:** Accuracy is `number | null`; `null` means no accuracy roll and never missing/
  unparseable source data;
- **MOVE-06:** the approved normal Legends: Z-A Base Cooldown fact is a variant field **inside
  MoveDefinition**, with exact representation still pending.

Because MOVE-03 explicitly chose field-by-field approval, canonical Move importer/schema refactor
was reduced to the residual field-placement/representation artifact:

- docs/project/MOVE_DEFINITION_FIELD_CHECKLIST.md

That residual checklist was captured on 2026-09-19 with exact pre-capture SHA-256:

- `9E2D6C8951AEA22851B540552622B267E0F9FB430B0DEFC396C5ABEB51104215`

Captured residual decisions:

- **FIELD-01:** `typeId: TypeId` lives directly in MoveDefinition;
- **FIELD-02:** `category: physical | special | status` lives directly in MoveDefinition;
- **FIELD-03:** `basePp: positive integer` lives directly in MoveDefinition;
- **FIELD-04:** `sourceTarget` lives directly in MoveDefinition and uses a closed factual
  turn-based enum; executable mapping to `TargetScope` remains rules content;
- **FIELD-05:** `makesContact: boolean` lives directly in MoveDefinition;
- **FIELD-06:** `zaBaseCooldownMs: number | null` lives directly in MoveDefinition, normalized to
  integer milliseconds; `null` means no clearly mapped usable normal Z-A Base Cooldown and therefore
  allows the approved fallback path. Z-A-specific provenance remains mandatory.

The field-placement gate is therefore closed. One exact-structure detail remains because FIELD-04
approved a **closed enum** but did not itself enumerate the accepted values:

- docs/project/MOVE_TARGET_ENUM_CHECKLIST.md

TARGET-01 was captured on 2026-09-19 with exact pre-capture SHA-256:

- `13636DC63FC92776D1F52E080CF3A90643BCE375F449209A4092E18B33270A32`

The Human Owner approved the complete closed `sourceTarget` vocabulary:

- `any-adjacent`;
- `any-other`;
- `self-or-adjacent-ally`;
- `adjacent-ally`;
- `adjacent-foe`;
- `all-adjacent`;
- `all-adjacent-foes`;
- `self-and-allies`;
- `all-allies`;
- `self`;
- `all-pokemon`;
- `random-opponent`;
- `entire-field`;
- `opponents-side`;
- `users-side`;
- `varies`.

The MoveDefinition exact-structure Human gate is therefore **CLOSED**. `sourceTarget` remains
factual DATA; mapping to executable `TargetScope` is versioned rules content and remains fail-closed
when no accepted mapping exists.

Priority, PP consumption, Struggle fallback, executable effects, runtime Type/category/contact
variation, secondary-effect RNG and unconsumed mechanic-tag families remain outside this gate.

GitHub Copilot CLI was invoked as the default Lead Developer surface after the task reached ACTIVE,
but exited before any repository change because the account monthly quota was exhausted. Per the
tool-adapter policy, the execution surface is therefore delegated explicitly to a fresh ChatGPT
implementation worker without changing Lead Developer authority, task scope or review separation.

## Scope

### 1. packages/game-data schema and validation layer

Implement typed/static validators for:

- SpeciesDefinitionV2;
- Move Definition — **HUMAN-APPROVED exact structure**;
- Type Definition v1;
- Ability Definition v1;
- Item Definition v1;
- Learnset entries;
- current Type-effectiveness factual reference matrix;
- provenance/source records;
- source inventory / mapping reconciliation;
- logical bundle manifest and artifact descriptors.

Use the canonical opaque IDs from @pokenexus/game-types; an internal workspace dependency may be
added where required. No external runtime dependency may be added merely for schema validation.

The validators must fail closed on:

- duplicate canonical IDs;
- unresolved cross-catalog references;
- unsupported schema version;
- malformed/non-integer numeric domains;
- malformed SourceFact<T>;
- unknown Ability slots, learn methods or Egg Group keys;
- Move-specific validation for the captured MoveDefinition field structure, with exact
  exact 16-member `sourceTarget` membership validation;
- incomplete six-key StatBlocks;
- invalid gender ratios;
- base-species cycles;
- explained-vs-unexplained source-inventory mismatches;
- parser/mapping ambiguity represented as a normal value.

### 2. Deterministic canonical serialization and hashes

Implement the accepted deterministic serialization/hash contract:

- UTF-8 JSON;
- canonical object-key order;
- deterministic record ordering by canonical ID;
- NFC normalization of normalized canonical string values before hashing;
- SHA-256 artifact hashes using sha256:<lowercase-hex>;
- provenance hash over the canonical provenance manifest without its own hash field;
- exact SPEC-002 BundleHashInput preimage and bundleHash;
- deterministic artifact descriptors and record counts;
- reproducibility tests proving identical logical input produces byte-identical output/hashes.

Use Node/platform primitives unless a dependency is demonstrably necessary. Do not change the
accepted hash preimage or introduce timestamps/machine paths into hashed normalized payloads.

### 3. Local mapping roster and coverage reconciliation

Materialize an explicit local source→canonical mapping registry with:

- accepted source keys mapped to frozen PokeNexus canonical IDs;
- exact baseSpeciesId grouping for accepted persistent forms;
- explicit excluded/deferred source keys with a deterministic policy reason;
- no FormId;
- no battle-only transformation Species identities;
- no automatic adoption merely because an upstream source exposes a form/entity.

The first implementation run may generate candidate mapping proposals for previously unmapped
source keys, but candidate IDs remain non-canonical staging evidence until the staged dataset
passes validation **and** the required Human sample-validation gate passes. No candidate mapping
may be adopted into the project's canonical mapping roster before that gate. Unexplained
new/unmapped source keys block canonical publication.

### 4. Controlled canonical factual-source ingestion tool

Implement a build/data-maintenance ingestion tool that:

- retrieves and safely interprets the current access policy/robots rules for every provider used;
- uses a descriptive User-Agent;
- performs sequential requests by default;
- never requests faster than each provider's currently permitted policy and may be more conservative;
- caches fetched pages locally as working state;
- uses retry/backoff for transient failures;
- fails closed when access policy cannot be read/interpreted safely;
- extracts only the whitelist accepted by SPEC-002 plus the SPEC-008 extension;
- keeps exact fetched bytes for sourceContentHash;
- emits separately:
  1. raw extracted whitelisted snapshot,
  2. normalized candidate bundle,
  3. provenance manifest,
  4. validation report;
- never uses image-alt, OCR or assets as canonical fallback;
- may use Bulbapedia descriptive/history content as factual evidence for generation change history,
  but never infers executable mechanics directly from prose;
- uses PokémonDB only as the approved complementary source under the explicit source hierarchy,
  never as a silent override.

Parser mappings/selectors must be explicit/versioned and covered by deterministic local fixtures.
Live ingestion is a maintenance command, not package import/runtime behavior.

### 5. Species v2 normalization

Implement the exact accepted persistent Species/form contract, including:

- Type references and complete Base Stats;
- Ability assignments and closed Ability-slot mapping;
- catch rate and growth rate;
- baseExperience: SourceFact<NonNegativeInteger>;
- heightMillimeters and weightGrams as exact positive integers;
- fixed-order eggGroups with cardinality 1..2;
- exact GenderRatio basis-point representation;
- eggCycles: SourceFact<PositiveInteger>;
- complete six-key evYield;
- baseFriendship: SourceFact<0..255>;
- exact-form provenance with no blind baseSpeciesId inheritance.

Battle-only transformations must remain explicit excluded/deferred source-inventory entries and
must not become SpeciesDefinitionV2 records.

### 6. Move / Type / Ability / Item / Learnset normalization

Implement the accepted non-Move factual schemas without executable rule inference:

- modern Type reference catalog and complete modern type matrix;
- modern Ability identity and assignment facts, including Hidden Ability assignment facts;
- Item identity/category facts only;
- Learnset source evidence sufficient to produce the Human-approved **modern baseline + approved
  PokeNexus adjustments** policy, with closed recognized methods/qualifiers.

For Moves, **do not treat the existing parser/schema as accepted architecture**. The Human-approved
field contract requires inline `typeId`, nominal `category`, `power: number | null`,
`accuracy: number | null`, positive `basePp`, the exact 16-member closed-enum `sourceTarget`,
`makesContact: boolean` and `zaBaseCooldownMs: number | null`. The final executable cooldown
remains MoveRule/rule-context output. The exact MoveDefinition structure gate is closed; implementation
must now conform to this captured contract rather than the historical candidate parser/schema.

Implementation status on 2026-09-19:

- `MoveDefinitionV1`, its validator, fixtures, PokémonDB parser normalization and tests conform to
  the Human-approved field contract and exact 16-member `sourceTarget` enum;
- SourceRecord provenance is provider-local with the closed provider set `bulbapedia | pokemondb`;
  canonical provenance no longer has a manifest-wide provider and mixed-provider manifests are
  supported deterministically;
- `bulbapedia-za-move-list-v1` parses only normal/base rows from Bulbapedia's
  `List of moves in Pokémon Legends: Z-A`, excludes Plus/Rogue variants, converts exact cooldown
  seconds to integer milliseconds and fails closed on malformed/ambiguous source rows or a changed
  table-header/column layout before any positional cell is interpreted;
- Bulbapedia maintenance fetches use an independently evaluated robots/access policy while reusing
  the controlled sequential cache/backoff fetch machinery; no runtime HTTP dependency is added;
- when `movePages` are configured, maintenance ingestion must successfully consult and parse the
  Z-A move list before Move normalization. A clearly mapped row supplies `zaBaseCooldownMs`; absence
  from the successfully parsed normal/base Z-A set supplies explicit `null`. Missing consultation,
  malformed data or ambiguous cross-provider name mapping fail closed instead of fabricating null;
- the raw Move enrichment carries a dedicated Z-A SourceRecord reference, and canonical Move
  `sourceRecordIds` preserves the selected/consulted Bulbapedia mainline evidence, the PokémonDB
  complementary target/contact source and the Bulbapedia Z-A evidence, including explicit-null
  conclusions;
- canonical candidate validation independently requires every Move's `sourceRecordIds` to include
  the canonical Bulbapedia Z-A move-list source supporting `zaBaseCooldownMs`, including semantic
  `null`; this prevents callers outside the maintenance enrichment path from supplying a cooldown
  conclusion with only generic/unrelated provenance;
- permanent non-retryable HTTP failures fail immediately while 429/5xx/network failures retain the
  controlled retry/backoff path;
- a disposable synthetic end-to-end `runMaintenanceIngestion` test covers one matched Z-A cooldown
  and one explicit-null fallback case and reaches `candidateValid=true` / `publicationReady=true`.
  This does not authorize or perform the first real canonical publication/promotion.

**Move mainline source-policy implementation:** the mainline selector now uses the versioned
Bulbapedia Generation IX availability table as the primary structured surface for
`Type / Category / Base PP / Power / Accuracy` and SV availability. Current generic PokémonDB
scalar values are never allowed to override those selected facts; PokémonDB remains only the
structured complement for `sourceTarget`, `makesContact` and source identity metadata where the
selected Bulbapedia availability surface does not expose those fields.

The remaining `MOVE-01` snapshot/fallback policy was Human-captured on 2026-09-19 in
`docs/project/MOVE_SNAPSHOT_FALLBACK_CHECKLIST.md`, with pre-selection SHA-256
`FF48B29EFE5D66724CCB712410EE029D07337677B052177C4E1B359A110C6EDC`:

- **SNAPSHOT-01 = ESTADO MAIS RECENTE / FINAL DE SV + DLC** — use the latest/final patched
  Scarlet/Violet + DLC state represented by the versioned Bulbapedia Gen IX availability surface;
  Champions/Z-A non-cooldown values remain excluded;
- **SNAPSHOT-FALLBACK-02 = TRATAR `✘` COMO INDISPONÍVEL E FAZER FALLBACK** — unusable SV rows do
  not provide the accepted canonical baseline; ingestion must walk backward to the latest usable
  traditional turn-based mainline snapshot with valid data and preserve that exact fallback
  provenance.

The snapshot/fallback Human gate is therefore closed. Implementation must remain fail-closed when
the historical table cannot identify a qualifying traditional snapshot or when an intra-generation
delta prevents a generation-level scalar row from proving the selected game's facts.

Implementation now follows that capture deterministically:

- SV `usable` selects the Gen IX row directly;
- SV `unusable` or otherwise unmarked/unusable falls back through **BDSP → Sword/Shield → USUM →
  Sun/Moon**;
- Legends: Arceus and Let's Go availability is parsed as source evidence but never selected as the
  traditional fallback;
- no qualifying traditional fallback is a hard ingestion failure;
- the Gen IX SourceRecord remains attached for every Move to prove the SV-first decision, while a
  Gen VIII/VII SourceRecord is additionally attached when it supplies the selected fallback facts;
- canonical candidate validation requires the exact Gen IX Bulbapedia availability SourceRecord in
  every Move's provenance, in addition to the already-required Z-A move-list provenance.

**Human-approved provenance contract — 2026-09-19:** the Owner approved adding required
`ProvenanceManifest.moveFactSources[]` relations while keeping MoveDefinition unchanged. This is a
canonical provenance/validation contract change, so TASK-087 advances `schemaVersion` from `2` to
`3` under SPEC-002 section 1.1. Each canonical Move relation binds:

- `moveId`;
- `mainline.selectedGame` + exact mainline `sourceRecordId`;
- `sourceTargetSourceRecordId`;
- `makesContactSourceRecordId`;
- `zaBaseCooldownSourceRecordId`.

The relation is part of `provenanceHash`; each role must resolve to a SourceRecord and also be
present in the Move's aggregate `sourceRecordIds`. The normalizer now validates the selected raw
mainline game/source and complementary PokémonDB Move-page source before emitting the canonical
relation. Staging/parsing therefore cannot rely only on an unlabeled aggregate source list. The
normalizer implementation identity advances from the legacy PokémonDB-specific label to
`pokenexus-static-normalizer-v3` to reflect the mixed-provider/schema-v3 normalization contract
plus the explicit independent source-discovery/completeness semantics added during implementation.

**Historical delta enforcement:** the Gen VIII/VII availability tables remain valid to determine
which approved traditional game is usable, but their single generation-level Type/category/PP/
Power/Accuracy tuple is not sufficient proof for a selected game when an intra-generation delta
could exist. The selector therefore requires a per-Move `HistoricalScalarProof` for the selected
BDSP/SwSh/USUM/SM snapshot before returning historical facts. Missing proof is a hard ingestion
failure. The current Bulbapedia modified-moves article is explicitly incomplete for Generation VIII,
so absence from that changelog is not used as a no-delta proof.

**Move ingestion final technical closure — 2026-09-19:** independent read-only re-review returned
READY with **P0/P1/P2/P3 = 0/0/0/0** for the completed Move path. The prior complementary-role
false-green (`Tackle` relation pointing to the valid PokémonDB `/move/growl` page with a recomputed
provenance hash) is closed at publication readiness by binding accepted `MoveId -> sourceKey` from
the supplied `MappingRegistry` to the complementary PokémonDB `/move/<sourceKey>` URL for both
`sourceTarget` and `makesContact`. The exact regression is covered and rejects staging. Historical
fallback also remains independently READY/fail-closed: aggregate Gen VIII/VII rows can determine
availability/order only, never selected scalar proof. Final validation after these fixes: package
suite **105 passed / 1 live skipped**, typecheck PASS, lint PASS, scoped `git diff --check` PASS and
`roadmap:check` PASS. No Git history operation was performed.

**Publication/load integrity hardening — 2026-09-19:** the staged/published boundary now promotes
only bytes that are revalidated from the exact copied temporary payload. `stageCandidate` returns a
`StagedCandidate` whose canonical staged manifest is committed by `stageManifestHash`;
`publishStagedCandidate` requires that exact commitment, copies the staged payload into a private
temporary publication directory, verifies all staged hashes/counts there, reconstructs the exact
`GameDataCandidate`, reruns schema validation, requires canonical artifact bytes, reapplies
`validatePublicationReadiness(candidate, mappingRegistry)`, then writes the final manifest and
uses atomic rename. Same-version reuse fully loads/verifies the existing published bundle before it
is treated as an immutable idempotent no-op.

The published loader now requires exactly the seven approved artifact logical names, exact
`catalogCounts == descriptor.recordCount`, the current exact `NORMALIZER_VERSION`, fixed
provenance/source-inventory references, canonical manifest/artifact/provenance/source-inventory
bytes, internal and external provenance/source-inventory hash consistency and exact `bundleHash`.
Set-like provenance collections are canonicalized before writing/hashing/loading, and artifact
descriptors must remain in canonical logical-name order. This closes the remaining representation
gap where reordered `sourceRecords` / `moveFactSources` / inventories or reordered manifest
descriptors could otherwise serialize to different published bytes for the same logical hash.

Adversarial publication regressions cover coherent staged-manifest/payload rewrites, changed staged
payloads, corrupted existing same-version bundles, extra logical artifacts, incorrect catalog
counts, non-canonical artifact bytes with recomputed hashes, inconsistent internal provenance hash,
wrong normalizer identity, reordered provenance with an updated file hash and reordered published
artifact descriptors.

Independent read-only publication and loader re-reviews on the immediately preceding hardening
state both returned **FINAL READY, P0/P1/P2/P3 = 0/0/0/0**. The subsequent fresh post-delta review
of the deterministic-ordering hardening also returned **FINAL READY, P0/P1/P2/P3 = 0/0/0/0**.

A later targeted QA found one historical-Move provenance substitution gap: a structurally valid
`HistoricalScalarProof` SourceRecord for one Move could be assigned to another Move's
`moveFactSources[].mainline` relation because publication readiness validated the selected game and
historical source shape without binding the proof's `titles=<Move> (move)` identity to the accepted
Move mapping. Publication readiness now performs that binding for every non-SV mainline proof using
the accepted `MoveId -> sourceKey` mapping and the same Bulbapedia Move-name canonicalization used
by ingestion. The adversarial regression uses canonical Tackle with a valid Pound BDSP proof and
must reject staging. Independent re-QA of this fix returned **FINAL READY, P0/P1/P2/P3 =
0/0/0/0**. Current package validation is **187 passed / 1 live skipped**, with typecheck, lint,
scoped `git diff --check` and `roadmap:check` PASS. No Git history operation or real canonical
publication was performed.

**Pre-Human review stage and live smoke — 2026-09-20:** maintenance now exposes an explicit
`review-core` mode backed by `intent: "full-candidate"`. Its review manifest declares the exact
Kanto/Johto Core scope as National Dex `1..251` / 251 base Species. A successful review run writes the exact raw
snapshot, non-canonical mapping proposals, normalized candidate, provenance manifest and validation
report plus `human-review-sample.json` and a deterministic `review-stage.json` commitment. The
review commitment contains no `gameDataVersion`, requires at least one candidate mapping, permits
only the expected pre-Human `candidate-mapping-unresolved` / `mapping-catalog-mismatch`
publication blockers and fails closed on any other validation finding. Canonical `stageCandidate`
remains unchanged and still rejects candidate mappings.

The controlled live smoke was executed against the current providers and passed end-to-end after
two source-drift fixes were captured as regressions. Generation VIII Move availability now accepts
a bare numeric Accuracy only for Legends: Arceus-only rows that cannot become traditional fallback
snapshots; traditional Generation VIII and all Generation VII rows still require exact percentage
syntax. The Z-A parser still validates variant ID/marker consistency for every row, while duplicate
IDs among excluded Rogue rows no longer block extraction of the base-Move catalog; duplicate base
Move IDs remain a hard error. At that live-smoke checkpoint the package validation was
**217 passed / 1 live skipped** after the
explicit live run passed separately; package typecheck, lint and build, workspace lint/typecheck/test/build,
`roadmap:check`, and `git diff --check` pass. The disposable live-smoke directory was removed after
validation.

Independent review of the pre-Human review stage initially found one P1: an exclusion declared
under one configured Species page could have been discovered only on another page and still be
sealed with the declaring page's source records; the mandatory sample slot also accepted any
excluded/deferred Species reason. The fixed path builds page-scoped PokémonDB discovery evidence,
requires each profile exclusion to be discovered on its declaring page, binds the review evidence
to that exact PokémonDB SourceRecord, and accepts the mandatory battle-only slot only for the
`battle-only-transformation` policy reason. The review stage also recomputes candidate validation
and publication readiness and requires the sealed validation report to match exactly. Targeted
independent re-QA returned **FINAL READY, P0/P1/P2/P3 = 0/0/0/0** with 64 focused tests passing.
Workspace `lint`, `typecheck`, `test` and `build` also pass.

The Human Owner subsequently approved the Core Learnset fallback and explicit Core boundary:
Generation IX Scarlet/Violet is primary for National Dex `1..251`; only an exact canonical-page
HTTP `404` may select Generation VIII Brilliant Diamond/Shining Pearl, with no automatic
Sword/Shield/USUM/Sun/Moon fallback. The maintenance fetch path implements that condition before
parsing and preserves the selected source/parser identity. The exact Item catalog membership is now
captured in `docs/project/CORE_ITEM_CATALOG_CHECKLIST.md`: the first Core review profile contains
exactly **30 Items** — all 21 Nature Mints, Bottle Cap, Gold Bottle Cap and the 7 standard Apricorn
Balls. Ability Capsule/Patch, additional capture Items, Held Items, TM Item identities, Evolution
Items and other consumables remain outside/deferred exactly as selected. `profile.items[]` must
contain only that captured set and must not be expanded by generation/category inference, examples
or upstream discovery.

The first live production-profile materialization then exposed two previously unresolved
non-regional, non-battle-transformation PokémonDB forms inside the National Dex `1..251` source
pages: `Partner Pikachu` (`pokedex:pikachu:11051`) and `Partner Eevee`
(`pokedex:eevee:11052`). On 2026-09-20 the Human Owner explicitly rejected both identities from the
Core **and from any future PokeNexus roster**. They are therefore permanent explicit exclusions in
the local mapping roster, not deferred candidates.

The Generation VIII BDSP learnset parser now scopes mixed game sections explicitly and remains
fail-closed on unrecognized/malformed method evidence. Tutor rows require the exact structured
Sw/Sh/EP/BD/SP applicability layout; rows without BD+SP evidence are ignored, and an empty tutoring
section is accepted only with the exact source statement that no tutoring moves exist. Transfer
sections are excluded only when the exact Sword/Shield-only retention statement is present. Event
sections and prior-evolution retention remain outside the accepted Core LearnMethod vocabulary;
Move Reminder remains explicitly excluded. Independent re-QA of the final learnset fallback delta
returned **FINAL READY, P0/P1/P2/P3 = 0/0/0/0**. The focused parser+maintenance suite passed
**44/44**; direct live/adversarial checks accepted current Rattata/Kangaskhan Generation VIII pages
and rejected the same pages when only the required empty-tutor / transfer-scope evidence was
mutated.

The subsequent **full 251-Species production-profile traversal** exposed additional real
Generation VIII source shapes that the earlier representative sample did not exercise. The BDSP
parser is therefore now versioned as `bulbapedia-gen8-bdsp-learnset-v4` and keeps those shapes
explicitly scoped instead of widening generic parsing: Legends: Arceus terminates a BDSP block;
base-Species `h5` blocks are selected exactly before regional/alternate-form blocks; exact
row-level `BD SP` annotations are included while exact `Sw Sh` annotations are excluded; breeding
annotations are closed to the source-observed `*`, `†`, `‡`, `*†`, Grand-Underground-linked `^`
and `^†`; the exact `By transfer, only via prior Evolution` subblock is outside direct transfer;
and Steelix-like exact `h5` game scopes end before the explicit `Pokémon Legends: Arceus` block.
Missing base-form scope, Legends-only scope and Sword/Shield-only `h5` scope now fail closed rather
than falling back to the whole section.

That traversal now materializes the first complete noncanonical Core review profile with exactly
**251 Species pages**, **251 selected learnsets** (**1 Generation IX + 250 approved BDSP
fallbacks**), **477 Move pages** and the captured **30 Items**. It also carries 30 explicit
battle-only/form exclusions/deferments discovered from the configured Species pages plus the two
permanent Human-rejected Partner identities from the local roster. The later full-snapshot parser
pass hardened Bulbapedia Species static facts without widening source interpretation:
`bulbapedia-species-static-facts-v12` accepts the exact singular `Ability` header, removes only
Pikachu's explicitly Cosplay/Cap-qualified `No Eggs Discovered` group, accepts only the current
Raichu-style `N (M in V-VI) V+` Base Exp. structure, and strips EV-yield historical asterisks only
for the exact observed titles `1 in Generation III`, `2 in Generation III`, and
`3 prior to generation VIII`. Generation-scoped Ability labels are treated as temporal evidence,
not persistent forms: open-ended `Gen N+` labels bind the current Ability to the base form, while
closed historical ranges/single-generation starred labels are ignored for current Ability output.
Unknown generation-looking labels still fail closed. Hidden zero metric slots are also retained as
non-authoritative placeholder metadata so an exact regional form absent from visible static facts
can use PokémonDB static complements only when both Height/Weight placeholders exist and every
complemented static value agrees with the Bulbapedia base static facts. The aggregate Bulbapedia
Species-page SourceRecord provenance is versioned as `bulbapedia-species-page-v16`. Base identity/current-Type extraction is separately
versioned as `bulbapedia-base-species-evidence-v8`; when the intro paragraph includes a later
historical-typing sentence, only the first structural sentence ending in `introduced in Generation X.`
contributes current Type and introduction evidence. That selected sentence must contain exactly one `introduced in` phrase and no earlier sentence terminator after the exact leading Species identity, preventing preceding-sentence Type contamination. Hidden subtrees are stripped with balanced same-tag traversal over inert-markup-masked HTML so nested hidden Type/Ability markup, including inert closing-tag text inside comments/script/style, cannot leak into visible evidence. Static-field selection also rejects descendants of hidden ancestor containers instead of checking only the field cell itself. A hash-verified offline traversal of all **251/251**
cached Bulbapedia Species pages through static-facts extraction now parses with **0 failures**.
For Height/Weight, hidden zero-value form rows are no longer interpreted as equality with the base
form. Instead they are recorded as exact per-field complement markers; only when Bulbapedia has no
explicit value for that exact persistent form may the already-bound PokémonDB form value fill that
metric. Visible Bulbapedia form values still take precedence. Hash-verified base-field and regional
coverage scans both report **0 unexplained gaps**.

Regional-form evidence is versioned as `bulbapedia-regional-form-evidence-v2`. Pokémon identity,
Region/Generation, breed/form labels and regional Types are all extracted from hidden-subtree-
sanitized table-cell HTML, preventing hidden links or Types from becoming canonical regional
evidence.

The same full review preflight exposed historical Base Stats tables on 31 Core pages. The
persistent-form parser is therefore now `bulbapedia-species-base-stats-v4`: it selects the current
table only from the exact closed set of source-observed historical/current `h6` heading pairs,
requires exactly one structured six-stat table per accepted heading, accepts a versioned base
scope before a distinct `h5` form scope, and binds an exact `X and Y have the same base stats.`
statement when it appears immediately before that historical pair. `Mega ...` `h5` scopes remain
battle-only and are excluded from persistent-form Base Stats evidence; an unknown `h6` pair still
fails closed. Scope-looking statement drift (`same`/`identical` base stats or `All forms of ...`)
is detected broadly but accepted only by the exact approved grammar, preventing silent fallback to
base-only scope. The hash-verified cached Base Stats traversal is also **251/251 with 0 failures**.

The same late pass also fixes persistent-form closure so an exact discovered form counts as
represented when its exact source key is explicitly excluded/deferred, while an unmapped,
unexcluded Bulbapedia form still fails closed. PokémonDB extraction is now
`pokemondb-html-v2`: the two source-observed target descriptions are mapped exactly and Accuracy
`&infin;`/`∞` alone maps to the already-approved `null` never-miss representation; the full
**477-Move** cached traversal has **0 parse failures**.

The same review preflight also detected Bulbapedia-only structured form labels with no exact
current PokémonDB form identity in the cached complement: Pikachu `Pale`, Snorlax `Mossy` and
Smeargle `Decorator`. Each has explicit primary-source form evidence (including structured
Height/Weight values), but the Core remains exactly 251 base Species. The review profile therefore
stages all three explicitly as `deferred` with reason
`bulbapedia-only-form-identity-unresolved`. These dispositions are not permanent exclusions and do
not create canonical Species or candidate mappings. Their deterministic
`bulbapedia-form:<base>:<label>` source keys are carried in Species discovery/inventory, bound to
the corresponding Bulbapedia Species SourceRecord, and therefore included in review
provenance/hash. A separate Corsola preflight drift was not a new form: the exact regional-form
evidence proves that Bulbapedia's `Galarian Corsola` and `Galarian Form` labels refer to the same
PokémonDB-discovered regional identity, so maintenance reconciliation accepts both exact labels
only under that regional proof. Review stage
`task-087-review-stage-v2` persists the complete relation in `excluded-species-evidence.json`,
requires its source-key set to equal the final Species excluded/deferred inventory exactly, and
therefore also seals global roster exclusions such as the permanently rejected Partner identities.
This provider-only
inventory extension is versioned by `pokenexus-static-raw-extract-v3` and
`pokenexus-static-normalizer-v5` and fails closed if the declared label is absent or already has a
PokémonDB-discovered exact form identity.

The first complete review materialization exposed one additional historical-Move source shape:
20 of the 26 Moves whose approved MOVE-01 fallback is BDSP have a post-BDSP per-Move Bulbapedia
revision whose description template still lists only `SwSh`, even though the structured Generation
VIII availability table marks the Move usable in BDSP. A first attempted
`bulbapedia-historical-scalar-proof-v2` replacement used a closed post-release timestamp window for
the per-Move revision. Two independent read-only reviews rejected that candidate with **P1=1**:
timestamp proves revision age, not that an unqualified MoveInfobox scalar tuple belongs to BDSP.
The sealed `reviewHash`
`sha256:4a38da5b83edff0c0bd5219579f90204a86fc9f994ec753fd43563b1d4889f72`
is therefore explicitly **superseded/rejected** and must never be promoted.

The accepted technical correction uses an already-fetched Bulbapedia surface that is genuinely
selected-game-specific. `bulbapedia-gen8-bdsp-learnset-v5` keeps the existing exact BDSP section/
row scoping and additionally extracts structured `Type / Cat. / Pwr.|Power / Acc. / PP` facts for
each BDSP-applicable Move row. Historical selection still uses the Generation VIII availability
table only for availability/order. For a BDSP-selected Move, normalization now requires at least one
BDSP learnset scalar row, requires every occurrence across the 250 selected BDSP fallback Species
pages to carry one identical five-field tuple, and binds the chosen mainline SourceRecord to a BDSP
learnset row for that exact Move. Normalizer, schema and publication validation all enforce the same
Move/source binding. Sword/Shield and Generation VII fallbacks retain the fail-closed per-Move
revision proof `v1`; the rejected timestamp-only `v2` is not accepted by the current candidate.

The regenerated noncanonical Core review candidate is sealed by `task-087-review-stage-v2` with
`candidateValid=true`. All **26/26** BDSP-selected Move relations point to
`bulbapedia-gen8-bdsp-learnset-v5` SourceRecords and have a same-Move BDSP Learnset binding; the
candidate contains **0** `bulbapedia-historical-scalar-proof-v2` SourceRecords. Its only publication
blockers are the expected pre-Human `candidate-mapping-unresolved` and
`mapping-catalog-mismatch` findings. The seven review files were independently rehashed byte-for-byte
against the stage manifest, and the review commitment was independently recomputed from the canonical
manifest preimage. Exact current `reviewHash`:
`sha256:91b646453a56ba1496810e1f55f5bac242dd0ce68790d62ba61ec8b4b0e15377`.
The Human sample contains Abra as the ordinary Species, Hisuian Arcanine as the persistent alternate
Species, Hisuian Qwilfish `baseFriendship` as `source-unavailable`, Mega Aerodactyl only as
`battle-only-transformation` inventory evidence, and representative Move/Type/Ability/Item/Learnset
records with their bound SourceRecords. The Move sample now deliberately prefers a historical
fallback when one exists; for this candidate it is **Aromatherapy / BDSP**, so the Human gate exposes
the exact corrected proof path instead of an unrelated Scarlet/Violet Move.

The reseal also exposed and closed a determinism bug in publication findings: mapping-registry object
property insertion order changed after canonical JSON serialization, producing the same 1,935
findings in a different byte order. `validatePublicationReadiness` now sorts findings canonically by
`code/path/message`, with a regression proving byte-identical output before and after canonical
registry serialization. Rebuilding the review stage from its sealed JSON inputs now reproduces the
exact `91b646...` commitment.

An adversarial post-seal review then exposed a second boundary issue: schema/publication validation
could be made to trust a coherently rewritten normalized BDSP Learnset row that falsely claimed a
valid parser-v5 SourceRecord contained the same Move. The exact `91b646...` candidate itself was
independently reparsed and remained clean, but the canonical staging API did not yet require the
Human-approved review commitment. The closure has two layers. `buildReviewStage` now binds every
historical normalized Move back to its sealed `rawExtracted.moves` selection, requiring the same
selected game, selected SourceRecord and Type/category/Base PP/Power/Accuracy tuple. Separately,
canonical publication now requires a reviewed stage: the staged manifest carries `reviewHash`,
`stageCandidate` verifies the exact Human-approved review manifest/candidate/provenance and requires
the canonical mapping registry to be exactly the `candidate -> accepted` form of the reviewed
mapping proposals, and `publishStagedCandidate` refuses any stage without that review commitment and
requires the full Human `ReviewApproval` again at publication. The approval carries the sealed
reviewed candidate and mapping proposals. Publication derives the only accepted canonical transition
from those reviewed mappings by moving the five mapping-surface inventory keys from `candidate` to
`accepted`, recomputing source-inventory/provenance hashes, and comparing the staged/reconstructed
payload through an order-stable semantic commitment over canonical artifact descriptors plus
canonical provenance. `publishStagedCandidate` reconstructs the copied payload and re-runs the full
ReviewApproval verification before writing the published bundle, so a known approved `reviewHash`
cannot be replayed onto a different coherently rehashed stage.
Disposable pre-Human staging remains possible for tests, but cannot be canonically published.
Regressions reproduce the prior coherent multi-artifact substitution and prove review-stage rejection,
prove unreviewed stages cannot publish, prove an approval cannot be reused for a changed candidate,
and prove a forged staged manifest/StagedCandidate carrying the known approved hash still fails the
full reviewed-candidate commitment.
These validation-only changes do not alter the sealed candidate/sample bytes; rebuilding the current
review stage still reproduces
`sha256:91b646453a56ba1496810e1f55f5bac242dd0ce68790d62ba61ec8b4b0e15377` exactly.

A disposable end-to-end approval smoke was then run from the exact `91b646...` review bytes. The
reviewed mappings/inventories were transformed only through the deterministic accepted projection,
staged with the same review commitment, published to an OS temp directory, and loaded back through
the immutable loader. The staged review hash remained `91b646...`; published and reloaded bundle
hashes matched exactly at
`sha256:54d0e904a5731484bfbe1dcbef448a02598905eb06a165395f270c77f20f6a64`
for 293 Species, 477 Moves and 13,785 Learnset rows. The temp bundle was deleted immediately; this was
not canonical publication or adoption.

After explicit Human approval of the exact `91b646...` review commitment, the reviewed mapping
registry was promoted only through the audited `candidate -> accepted` transition and persisted as
the local canonical roster: 293 Species, 477 Moves, 18 Types, 147 Abilities and 30 Items, plus the
35 reviewed Species excluded/deferred dispositions. No reviewed source key, canonical ID,
`baseSpeciesId`, exclusion reason or factual catalog value was changed during adoption.

The exact accepted projection was then staged with the full approved `ReviewApproval`, published
permanently under `packages/game-data/published` as opaque
`gameDataVersion = game-data-core-kanto-johto-v1`, and reloaded through the immutable loader.
The real canonical bundle is:

- `bundleHash = sha256:bbe5114563abe85ac5b42d4f05a63c44af9fdad7abd66ebdafa504d584c02903`;
- `provenanceHash = sha256:cd8fe4a8882c4626e2722b67a7024e2bcf7016d414f09f4816c01cc4ae2f029c`;
- `sourceInventoryHash = sha256:13109f1dbad00da0852083e567c5c3af4cd9682e9e06b970d09babf98d2f5862`;
- published at `2026-09-21T12:11:49.528Z`;
- 293 Species, 477 Moves, 18 Types, 147 Abilities, 30 Items, 13,785 Learnset rows and 324 current
  Type-effectiveness rows.

Post-publication semantic verification regenerated the accepted projection from the sealed reviewed
candidate and confirmed byte-identical canonical artifact payloads/hashes for all seven artifacts,
exact canonical provenance equality, exact accepted mapping equality and the unchanged approved
review seal `sha256:91b646453a56ba1496810e1f55f5bac242dd0ce68790d62ba61ec8b4b0e15377`.
Package validation after canonical roster adoption is **271 passed / 1 live skipped**.

Two fresh independent post-boundary adversarial re-reviews on the stabilized source both returned
**FINAL READY, P0/P1/P2/P3 = 0/0/0/0**. The reviewer that originally found the coherent substitution
P1 reran that exact exploit and additional changed-candidate, mapping-reorder, reviewed-mapping,
review-manifest and staged-manifest replay probes; all fail closed. A second independent reviewer
also revalidated the exact `91b646...` seven-file seal, the raw historical Move binding, deterministic
accepted projection and full publish-time ReviewApproval replay protection with no remaining blocker.

After that final learnset/fetch hardening, the controlled real-provider smoke was rerun with
`POKENEXUS_LIVE_INGESTION=1` and passed **1/1** again (`29.75s` test time, `30.59s` suite). This
post-hardening run confirms the provider path passed both robots gates and the
Bulbapedia-primary Move normalization / PokémonDB complement flow without regressing the approved
Core fallback handling. The later offline full-package validation above supersedes the older suite
counts while the live smoke evidence remains the latest intentional live-provider check.

No source effect prose becomes combat/item behavior. Machine/item→Move relations remain outside
this task except where represented by a separately accepted Learnset/acquisition contract.

### 7. Publication and loading boundary

Implement the publication machinery:

- staged-candidate validation;
- immutable published-bundle layout under a deterministic local path;
- one publication operation that assigns/finalizes an opaque gameDataVersion supplied by the
  operator and refuses overwrite/reuse with different content;
- atomic promotion from staged candidate to published bundle;
- loaders that resolve a published bundle by explicit gameDataVersion;
- unsupported schemaVersion fail-closed behavior;
- no activation/deprecation policy beyond reading/writing the immutable accepted bundle.

Publication must not require PostgreSQL and must not mutate previously published bundle bytes.

Before the Human canonical-data sample gate passes, this task may exercise publication only in
disposable test/temp directories with synthetic or staged-candidate data. It must **not**:

- promote the first real project canonical bundle;
- assign/adopt a first real canonical gameDataVersion;
- move candidate source mappings into the canonical mapping roster;
- write a repository artifact or persistent local release location that is represented as
  canonical/published project data.

The first real canonical promotion is an explicit post-sample-gate action within TASK-087, not an
automatic consequence of a successful ingestion run.

### 8. Human canonical-data sample

Before any first real canonical publication/promotion or candidate-ID adoption, and therefore
before final acceptance/history integration, produce a compact reviewable sample from the staged
candidate demonstrating at minimum:

- one ordinary persistent Species;
- one accepted persistent alternate/regional form if present in the candidate roster;
- one legitimate source-unavailable Species fact case;
- one battle-only transformation represented only as excluded/deferred inventory evidence;
- representative Move, Type, Ability, Item and Learnset records;
- provenance/hash/inventory evidence linking each sampled fact back to its supporting Bulbapedia
  and/or PokémonDB source record(s).

This sample is evidence for the Human Owner gate; it is not a second source of truth and must not
change schema semantics. A passing Human sample validation authorizes only promotion of the exact
validated candidate/mapping decision presented at that gate; a materially changed candidate must be
presented again before canonical promotion.

## Out of scope

- unapproved provider ingestion/fallback, including PokeAPI or Smogon as canonical factual sources;
- runtime HTTP fetches from Bulbapedia, PokémonDB or any other factual provider;
- sprites/images/audio/flavor text/editorial prose/translations;
- executable Move/Ability/Item/capture/breeding/evolution mechanics;
- battle-only transformation profile schema or Mega activation/reversion rules;
- PostgreSQL catalog tables or database authority;
- Zone/Encounter/Hunt schemas owned by TASK-033/034;
- Move eligibility/acquisition semantics owned by TASK-088;
- production Move/Ability executable rule content owned by TASK-090/091;
- game-data activation/deprecation/release rollout policy beyond immutable publication.

## Acceptance criteria

- [x] TASK-087 implementation remains inside SPEC-002 + SPEC-008 with no new product/rule semantics.
- [x] packages/game-data exposes typed schemas/validators/loaders for all accepted logical
      catalogs and manifest/provenance structures.
- [x] Species v2 implements all required SPEC-008 fields and exact SourceFact/form applicability
      rules.
- [x] Battle-only transformations cannot enter the persistent Species catalog.
- [x] Mapping/source inventories reconcile and unexplained gaps/new keys fail publication.
- [x] Deterministic canonical serialization and every required hash/preimage are tested.
- [x] Publication is immutable and refuses unsupported schema/reuse/overwrite conditions.
- [x] Before Human sample validation, publication behavior is exercised only in disposable
      test/temp locations; no real canonical bundle/gameDataVersion or candidate mapping is
      promoted/adopted.
- [x] Bulbapedia-primary / PokémonDB-complementary ingestion is provider-policy-gated,
      sequential/conservative, cached, provenance-bound and fail-closed on unresolved source
      disagreement.
- [x] Parser/selectors and source-state mappings are deterministic/versioned and fixture-tested.
- [x] No runtime package import performs network I/O.
- [x] Relevant packages/game-data lint/typecheck/tests/build pass.
- [x] Workspace lint/typecheck/tests/build pass.
- [x] corepack pnpm roadmap:check passes.
- [x] git diff --check passes.
- [x] Fresh independent QA reports no unresolved P0/P1.
- [x] Human Owner validates the exact staged canonical-data sample before any first real canonical
      promotion/candidate-ID adoption and before final acceptance/history integration.
- [x] The exact Human-approved candidate/mapping decision is promoted to the local canonical roster
      and immutable `game-data-core-kanto-johto-v1` bundle, then reloaded and semantically verified.

Human Owner approval recorded on 2026-09-21 for the exact sealed review artifact
`sha256:91b646453a56ba1496810e1f55f5bac242dd0ce68790d62ba61ec8b4b0e15377`.
This approval authorizes only the deterministic candidate-to-accepted promotion of that reviewed
candidate/mapping decision; any material data or mapping change requires a new Human gate.

## Validation / tests

- [x] Formal DoR QA after publication-gate correction: **READY**,
      P0/P1/P2/P3 `0/0/0/0`.
- TDD for schema/domain validators before production implementation.
- Unit tests for every accepted static schema and invalid-domain boundary.
- Unit/property-style tests for canonical serialization, NFC behavior, deterministic ordering and
  SHA-256 reproducibility.
- Coverage reconciliation tests for missing/new/duplicate/extracted-but-not-normalized keys.
- Fixture-based parser tests that do not require network.
- Controlled live smoke ingestion of a small representative Bulbapedia-primary sample plus any
  required PokémonDB complementary records only after each provider's access policy passes.
- Publication/load round-trip tests using a disposable temp directory.
- Verify published bytes remain unchanged across reload and duplicate same-version publication.
- Verify conflicting same-version/different-content publication fails closed.
- Verify package import itself performs zero network I/O.

Post-promotion validation on 2026-09-21:

- `corepack pnpm --filter @pokenexus/game-data test` — **271 passed / 1 live skipped**;
- `corepack pnpm lint` — PASS;
- `corepack pnpm typecheck` — PASS;
- `corepack pnpm test` — PASS;
- `corepack pnpm build` — PASS;
- `corepack pnpm roadmap:check` — PASS;
- `git diff --check` — PASS;
- same-version approved re-publication returned the existing immutable bundle with unchanged
  `bundleHash` and `publishedAt`.
- fresh independent post-promotion QA: **FINAL READY**, P0/P1/P2/P3 `0/0/0/0`; exact accepted
  mapping transformation, 35 Species dispositions, all seven published artifact bytes, provenance,
  inventory, review commitment and permanent loader round-trip independently matched the approved
  projection.
- delegated Class B functional/architectural acceptance: **ACCEPTED**, no implementation blocker;
  TASK-087 was implementation-complete before history integration. The Human Owner explicitly
  authorized repository-history completion/integration on 2026-09-21, allowing the governed
  commit/push/main-integration sequence to close the task as `DONE`.

## Corrective hardening cycle — 2026-09-21

The Human Owner explicitly directed that **all** dependency and technical-debt findings identified
after the first TASK-087 closure must be resolved before any other product task advances. TASK-087
is therefore reopened in `FIX` as a bounded corrective cycle. This does not activate TASK-023,
TASK-088, TASK-090 or any downstream implementation.

Required closure items for this corrective cycle:

- [x] eliminate the published Learnset coverage gap for all 42 accepted persistent alternate forms,
      without `baseSpeciesId` inheritance/fallback and without changing existing canonical IDs;
- [x] preserve immutable `game-data-core-kanto-johto-v1`; any factual correction/new Learnset
      coverage must stage under a **new** `gameDataVersion` and pass a fresh exact Human review gate
      before permanent canonical publication;
- [x] split Node/filesystem maintenance/publication APIs from a runtime-safe static-data consumer
      surface and prove that the production Worker target can consume the accepted delivery shape;
- [x] implement the SPEC-002 logical sharding/lazy-consumption expectation so runtime consumers do
      not need provenance/source-inventory or every catalog shard in one deployment payload;
- [x] add a concrete retention/delivery policy for immutable published versions that preserves
      authoritative-history resolvability without assuming every future bundle must be eagerly
      embedded in an application bundle;
- [x] upgrade the vulnerable Vitest line to a patched release compatible with the repository's
      Node/Vite baseline and revalidate the workspace;
- [x] update compatible Cloudflare tooling/runtime metadata deliberately and prove Worker builds;
- [x] strengthen CI with `roadmap:check`, production dependency audit and the new game-data
      Worker-compatibility gate; keep live upstream ingestion opt-in rather than turning CI into a
      network crawler;
- [x] update stale roadmap/README statements, including dependency-clear TASK-090 visibility, with
      no downstream task activation;
- [x] remove the unused legacy provenance caller compatibility parameter if no production caller
      still requires it;
- [x] split the largest maintenance/publication modules only where doing so materially lowers
      ownership/test risk; do not perform cosmetic refactors;
- [x] resolve the Git worktree metadata warning using a non-destructive repository-maintenance
      procedure and verify repository integrity afterward;
- [x] run full workspace validation plus fresh independent QA; no P0/P1 finding may remain.

### Corrective implementation evidence

- The corrected full candidate contains 293 Species, 547 Moves, 18 Types, 147 Abilities, 30 Items,
  19,035 Learnsets and 324 current type-effectiveness records. Learnsets cover 293 unique Species,
  including all 42 accepted persistent forms, with zero orphan Species/Move references and no
  `baseSpeciesId` Learnset inheritance.
- Exact form ingestion uses 37 current Species-page form Learnsets plus five explicit historical
  form overrides. All 251 base Species were structurally classified as 181 current Gen IX plus 70
  approved historical fallbacks, with zero remaining parser-error cases.
- The Move catalog is the exact corrected Core-Learnset closure: 547 Moves. `Psychic Noise`
  preserves `sourceTarget = any-adjacent` from structured Bulbapedia Range evidence while
  `makesContact` remains proven only by PokémonDB; both role SourceRecords are independently bound.
- Historical MOVE-01 scalar proof is review-only raw evidence (`historicalScalarProofs`) rather than
  a fabricated playable Learnset row. Raw extraction is versioned `pokenexus-static-raw-extract-v4`
  and the review contract is `task-087-review-stage-v3`.
- Three full `review-core` executions after factual closure/refactoring produced the same exact
  candidate. The last comparison was byte-identical across all eight review-stage files.
  `reviewHash = sha256:a620dd9b2721e6cc483dc9d3ea15c3e1b38de6cdb9fc8a18c48cb7d3168a468b`,
  `candidateContentHash = sha256:5221b25da2ba0423e2c042b36cf0660550d177c74a5dc4cedb505718483b0836`,
  and `mappingProposalsContentHash = sha256:f6c196af851ac59439e4a73be08e5e3db92819524af31cb6e268d4fedf89d905`.
  Its 151 pre-Human findings are exactly the expected 150 `candidate-mapping-unresolved` findings
  for 75 new Move candidates plus one aggregate `mapping-catalog-mismatch`; schema validation is
  otherwise green. The Human Owner explicitly approved this exact review commitment at
  `2026-09-21T18:16:19Z`.
- The package root and `@pokenexus/game-data/runtime` are Worker/browser-safe; Node filesystem and
  publication APIs live under `@pokenexus/game-data/node`. Runtime delivery resolves only a version
  manifest first, then individually hash-verifies requested catalog shards; Learnsets and
  provenance/source-inventory remain lazy. Wrangler dry-run bundles this surface under the strict
  realtime Worker target with no `nodejs_compat` requirement.
- `docs/architecture/static-game-data-delivery.md` defines immutable R2/CDN-style object delivery,
  on-demand historical version resolution and retention. `packages/game-data/published/**` remains
  canonical repository evidence and is not included in the package distribution (`files = dist`).
- Tooling baseline is now pnpm `10.34.5`, Vitest `4.1.11`, Wrangler `4.136.1`,
  `@cloudflare/workers-types` `5.20260921.1`, Cloudflare `compatibility_date = 2026-09-21`, ESLint
  `10.11.0` / `@eslint/js 10.0.1` / `typescript-eslint 8.70.1`. Full and production dependency
  audits report no known vulnerabilities.
- CI now includes `roadmap:check`, production dependency audit, normal workspace gates, the strict
  game-data Worker compatibility smoke and the database Worker compatibility smoke. Live upstream
  ingestion remains opt-in.
- `finalizeProvenance.provider` compatibility was removed after confirming no production caller.
  Targeted decomposition moved maintenance-profile parsing to `maintenance-profile.ts`, Human
  review/replay verification to `review-approval.ts`, runtime delivery to `runtime-delivery.ts`,
  canonical JSON to `canonical-json.ts`, and candidate-ID generation to `candidate-id.ts`; no
  cosmetic mass rewrite was performed.
- Git administrative repair first ran `git worktree repair`, then proved all 32
  `.git/worktrees/*/refs` directories were empty before removing only those empty directories.
  `git count-objects -vH` now reports `garbage: 0`; `git fsck --full --no-reflogs` reports no
  corruption and all registered worktrees remain present. Dangling objects were left untouched.
- Historical reload compatibility is explicitly preserved for the immutable v1: the Node published
  loader accepts its sealed `bulbapedia-gen8-bdsp-learnset-v5` provenance only through an internal
  validation-only v5→current-parser compatibility projection, then returns the original v5
  provenance unchanged. Normal candidate parsing/staging remains strict and rejects v5. A regression
  loads `game-data-core-kanto-johto-v1` through `loadPublishedBundle` and asserts the exact known
  `bundleHash = sha256:bbe5114563abe85ac5b42d4f05a63c44af9fdad7abd66ebdafa504d584c02903`
  with 477 Moves / 13,785 Learnsets.
- Corrective scratch artifacts no longer pollute the repository root. Diagnostic scripts, duplicate
  review outputs and obsolete Worker-smoke scratch files were removed; the sole retained Human-review
  evidence and ingestion cache are under ignored `.tmp/task-087-hardening/`, including
  `review-a620dd9b/`. No top-level `.tmp-*` path remains.
- Final current-snapshot re-gates after all corrective fixes are independently READY with
  P0/P1/P2/P3 `0/0/0/0` for both TECH/ARCH and dependency/technical-debt review. The final
  `@pokenexus/game-data` suite is 314 passed / 1 live-ingestion skipped; workspace lint, typecheck,
  tests, build, roadmap check, full + production dependency audits, strict game-data Worker smoke,
  database Worker smoke and `git diff --check` pass. Published v1 has zero Git diff.
- Fresh independent Class B acceptance of the final corrective snapshot is **ACCEPTED** with
  P0/P1/P2/P3 `0/0/0/0`. It independently recomputed
  `reviewHash = sha256:a620dd9b2721e6cc483dc9d3ea15c3e1b38de6cdb9fc8a18c48cb7d3168a468b`,
  verified all seven sealed review-file hashes plus candidate/mapping commitments, confirmed
  293 Species / 42 forms / 547 Moves / 19,035 Learnsets with zero orphan Species/Move references,
  and found no implementation blocker. This pre-promotion acceptance did not itself authorize
  publication or Git history.
- After the explicit Human approval, the reviewed mapping registry was promoted through the exact
  audited `candidate -> accepted` transition. The canonical mapping roster now contains 293 Species,
  **552 Move mappings** (the 477 previously accepted historical identities plus the 75 newly approved
  mappings), 18 Types, 147 Abilities and 30 Items; all are `accepted`. The five historical Move
  mappings no longer present in the current Learnset closure remain intentionally preserved and were
  not re-used or renamed.
- The exact accepted projection was staged with the approved `ReviewApproval` and canonically
  published as `gameDataVersion = game-data-core-kanto-johto-v2` at
  `2026-09-21T18:18:54.923Z`. The corrected immutable bundle is:
  - `bundleHash = sha256:fc4ecaacb486b496ca2539666201cf73ace40b6ff352f210783a6fadedf052b4`;
  - `provenanceHash = sha256:b7df6560514961937f87cb7edf48b87b1dc6f407cea0e2fdc213994c9de1c8eb`;
  - `sourceInventoryHash = sha256:4fb913f77edb79472c67d30dc90ce166c1e476c03684d38734c6c54ee4c9e4b1`;
  - 293 Species, 547 Moves, 18 Types, 147 Abilities, 30 Items, 19,035 Learnsets and 324 current
    Type-effectiveness rows.
- Real-loader regressions now cover both immutable v1 and corrected v2. Lazy runtime tests resolve v2
  and hash-verify its 547-Move and 19,035-Learnset shards. A duplicate same-version v2 publication
  was executed with the same approved review: all 10 published files remained byte-identical, the
  bundle hash stayed `fc4eca...052b4`, and the original `publishedAt` was preserved.
- `game-data-core-kanto-johto-v1` and its published directory remain unchanged at
  `bundleHash = sha256:bbe5114563abe85ac5b42d4f05a63c44af9fdad7abd66ebdafa504d584c02903`.
  The corrective implementation was subsequently committed, pushed and integrated only after the
  separate Human Owner Git authorization recorded below.
- Fresh post-promotion validation of the exact canonical v2 state is complete. Independent
  TECH/ARCH and dependency/debt/governance gates both returned **FINAL READY** with P0/P1/P2/P3
  `0/0/0/0`; redundant independent QA also returned **FINAL READY** `0/0/0/0`; and the fresh
  delegated Class B acceptance returned **ACCEPTED** `0/0/0/0`. These gates independently
  recomputed the approved `reviewHash = sha256:a620dd9b2721e6cc483dc9d3ea15c3e1b38de6cdb9fc8a18c48cb7d3168a468b`,
  verified the exact 293/552/18/147/30 accepted canonical mapping projection, preserved the five
  historical Move mappings outside the current 547-Move v2 catalog, reloaded v1 unchanged and v2
  at `bundleHash = sha256:fc4ecaacb486b496ca2539666201cf73ace40b6ff352f210783a6fadedf052b4`,
  verified 19,035 Learnsets plus lazy/hash-verified runtime delivery and same-version idempotence,
  and found no implementation blocker. Post-promotion QA/acceptance is therefore closed.

The Human Owner explicitly authorized the full corrective repository-history sequence at
`2026-09-21T18:48:06Z`. Corrective commit
`2366f9cfd79a3620ca2ccc69b8b615a359d045bc` (`fix(game-data): harden static catalog publication`)
was pushed on `fix/TASK-087-post-publication-hardening`, fast-forward integrated into canonical
`main`, and pushed to `origin/main`. No force/rewrite operation was used. This completed the final
TASK-087 closure gate; downstream tasks remain separate `PLANNED` work and were not activated by
this completion.

## Prior completion record

TASK-087 previously reached DONE. The Human-approved static-data review commitment
`sha256:91b646453a56ba1496810e1f55f5bac242dd0ce68790d62ba61ec8b4b0e15377` was promoted only through
the audited candidate-to-accepted mapping/inventory transition. The immutable canonical bundle is
`game-data-core-kanto-johto-v1` with
`bundleHash = sha256:bbe5114563abe85ac5b42d4f05a63c44af9fdad7abd66ebdafa504d584c02903`.

The accepted implementation snapshot was committed as
`7733f4b2ef74739c9f00ef3be9ba380198568052`, pushed on
`feat/TASK-087-static-game-data-catalog-ingestion`, and fast-forward integrated into canonical
`main` after explicit Human Owner repository-history/completion authorization on 2026-09-21.

Post-promotion independent QA returned READY P0/P1/P2/P3 `0/0/0/0`; delegated Class B acceptance
returned **ACCEPTED**. That prior closure remains the immutable history of the first publication;
the corrective cycle above addresses newly identified pre-consumer hardening debt.

## Dependencies

- TASK-005 — Core Domain Type Skeleton — DONE
- TASK-006 — Static Game Data Schema & Rules Versioning — DONE / SPEC-002 APPROVED
- TASK-092 — SpeciesDefinition Static-Fact Audit & Extension Spec — DONE / SPEC-008 APPROVED

## Risks / irreversible actions

- Canonical publication creates durable game-data identities consumed by later authoritative
  history. Implementation/testing of publication machinery may precede the Human sample gate only
  in disposable locations; the first real canonical promotion, gameDataVersion assignment and
  candidate-ID adoption are forbidden until that exact staged sample is validated by the Human
  Owner.
- Source-site structural drift can create silent omission risk; coverage inventories and fixture
  parser tests are required.
- Canonical ID mapping is sticky after first publication. The exact Human-approved candidate IDs are
  now the adopted canonical IDs for this roster; future source-label changes must not silently rename
  or remap them.
- Network crawling must respect each provider's current robots/access policy; PokémonDB
  complementing Bulbapedia must never be used to bypass a provider restriction.
- Repository-history completion for the first v1 publication sequence and this later corrective
  cycle were separately authorized by the Human Owner. The corrective authorization was given at
  `2026-09-21T18:48:06Z` and was used only for the task-scoped commit/push/main-integration sequence;
  unrelated history rewriting/force operations remain out of scope.

## Expected files / boundaries

- tasks/done/TASK-087-static-game-data-catalog-ingestion.md
- packages/game-data/**
- docs/project/PROJECT_ROADMAP.md
- generated docs/project/PROJECT_ROADMAP.html
- workspace dependency metadata only if required to reference @pokenexus/game-types

Do not modify production database migrations, API/realtime/web runtime semantics, game-core
combat rules or already approved specs.

## Completion

Use docs/agents/handoff-protocol.md.
Do not create an implementation-summary/changelog file.
