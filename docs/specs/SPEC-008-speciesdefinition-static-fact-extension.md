# SPEC-008 — SpeciesDefinition Static-Fact Extension

- Status: APPROVED
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Extends: `SPEC-002 — Static Game Data, Versioning & Canonical Pokémon Data Ingestion`
- Related specs:
  - `SPEC-001 — Core Domain Model`
  - `SPEC-005 — Pokémon Instance, Collection & Team v1`
  - `SPEC-006 — XP / Level / Progression Rules`
- Related tasks:
  - `TASK-092 — SpeciesDefinition Static-Fact Audit & Extension Spec`
  - `TASK-087 — Static Game Data Catalog & Ingestion Implementation`

## 1. Problem

SPEC-002 intentionally deferred several PokémonDB Species/form fields because their gameplay
mechanics were not needed when the static-data contract was first approved. That deferral is now
too coarse for the first canonical catalog: height, weight, egg groups, gender ratio, egg cycles,
EV yield and base friendship are compact intrinsic Species/form facts even when breeding, EV,
friendship or hatching mechanics do not exist in PokeNexus.

Leaving those facts out until an executable mechanic needs them would force avoidable schema and
catalog republishing work. Conversely, adding them without a Class A boundary could accidentally
turn source facts into executable rules or flatten relational/contextual content into
`SpeciesDefinition`.

This specification is the additive Class A extension. SPEC-002 remains authoritative for all
unchanged fields, versioning, publication, provenance and source-policy behavior.

## 2. Goals

- extend `SpeciesDefinition` with the seven Human-approved intrinsic/static facts;
- normalize those facts deterministically without floating-point authority;
- preserve exact form-specific facts on each canonical `SpeciesId`;
- expand the PokémonDB DATA-only whitelist and provenance mapping explicitly;
- classify adjacent Pokémon fields so TASK-087 does not guess scalar-vs-relational ownership;
- keep all related executable mechanics out of scope;
- require a new static `schemaVersion` before any bundle using these fields is published.

## 3. Non-goals

This specification does not define:

- breeding eligibility, inheritance, daycare or egg production;
- hatching progression, steps, timers or hatch outcomes;
- actual gender assignment/persistence for an owned Pokémon;
- EV accumulation, caps, training, stat contribution or reset mechanics;
- friendship progression/current friendship/effects;
- evolution graph, triggers, eligibility or Species mutation;
- Learnsets or Move eligibility/acquisition;
- habitats, encounters or location content;
- local Pokédex mapping;
- held-item/drop tables;
- Nature effects/compatibility;
- derived combat stats, BST, type defenses, capture probability, hatch-time estimates or min/max
  stat tables;
- flavor/Pokédex prose, assets, sprites, icons, audio or translations;
- historical/game-specific variants of these facts unless a later accepted schema explicitly owns
  them.

## 4. Authority and versioning

### 4.1 Additive relationship to SPEC-002

On approval, this spec adds fields and whitelist rules to SPEC-002. It does not supersede
SPEC-002's canonical identity, deterministic serialization, provenance, completeness, immutable
publication, `gameDataVersion`, `rulesVersion` or accepted-pair compatibility rules.

Any conflict outside the fields explicitly extended here is resolved in favor of SPEC-002 until a
later accepted Class A change says otherwise.

### 4.2 Schema version

The extended bundle shape is not compatible with SPEC-002 schema v1. A published bundle carrying
these fields must therefore use a new exact `schemaVersion` identity. The proposed v2 identity is:

```text
schemaVersion = "2"
```

The Human Owner must explicitly accept that identity with this spec. Consumers that support only
schema v1 fail closed on v2; there is no best-effort field omission.

Because TASK-087 depends on TASK-092, the intended first canonical Species catalog publication may
start directly at schema v2. This does not mutate or reuse the v1 contract identity.

> **2026-09-19 compatibility note:** the Human-approved SpeciesDefinitionV2 field contract remains
> unchanged, but SPEC-002 later advanced the overall static-bundle `schemaVersion` to `3` when the
> canonical provenance contract added per-Move fact-source roles. References below to a
> "schema-v2 bundle" describe the Species extension's original version boundary; TASK-087's current
> published bundle contract is schemaVersion `3`, carrying the same SpeciesDefinitionV2 shape.

## 5. Extended SpeciesDefinition

For every accepted canonical **persistent Species/form** roster entry represented by
`SpeciesDefinition`, the normalized definition adds:

```text
SpeciesDefinitionV2 = Omit<SpeciesDefinitionV1, "baseExperience"> & {
  heightMillimeters: PositiveInteger
  weightGrams: PositiveInteger
  eggGroups: NonEmptyOrderedSet<EggGroupKey> // cardinality 1..2
  genderRatio: GenderRatio
  eggCycles: SourceFact<PositiveInteger>
  evYield: StatBlock<NonNegativeInteger>
  baseFriendship: SourceFact<Integer> // known value constrained to 0..255
  baseExperience: SourceFact<NonNegativeInteger> // refines existing v1 field availability
}
```

The seven newly added fields plus the refined `baseExperience` availability representation are
factual, non-executable static data. Their presence is not evidence that the corresponding gameplay
mechanic exists.

### 5.1 Source availability wrapper

For source fields where PokémonDB can explicitly publish no current numeric value, v2 uses:

```text
SourceFact<T> =
  | { status: "known", value: T }
  | { status: "source-unavailable" }
```

`source-unavailable` means the approved source explicitly exposes no current value (for example a
structured `—` state). It is not:

- numeric zero;
- null/undefined;
- parser failure;
- permission to inherit from a base/sibling form;
- permission to query an alternate provider.

Parser failure, missing extraction caused by a selector regression, or ambiguous source structure
remains a validation error. The normalizer may emit `source-unavailable` only when the accepted
source mapping explicitly recognizes that source state.

### 5.2 Nullability policy

All v2 fields are **required and non-null** for every persistent Species/form accepted into the
`SpeciesDefinition` mapping roster. A field whose type is `SourceFact<T>` is still structurally
required; explicit source unavailability is represented by the tagged variant rather than null.
Battle-only transformations excluded/deferred from that roster do not acquire inapplicable fields
merely to satisfy this shape.

If PokémonDB does not expose an approved fact and the field has no accepted source-unavailable
variant, or the parser cannot normalize the source unambiguously, candidate validation fails
closed. The normalizer must not:

- borrow the base Species value;
- copy a sibling form value;
- infer a value from franchise convention;
- use an alternate provider;
- emit `null` merely to keep publication moving.

If the source genuinely represents a semantic state such as genderless or source-unavailable,
that state is encoded by the field's explicit variant rather than by null.

## 6. Height and weight

### 6.1 Canonical representation

Canonical height is:

```text
heightMillimeters: positive integer
```

Canonical weight is:

```text
weightGrams: positive integer
```

The source metric value is normalized exactly into these integer base units. Decimal floating
point is not canonical authority.

Examples of normalization policy:

- source meters → exact millimeters;
- source kilograms → exact grams;
- imperial display values are ignored when the metric source value is available;
- a source value that cannot be represented exactly under the accepted source precision fails
  validation rather than being silently rounded.

### 6.2 Semantics

Height/weight are current factual Species/form reference values only. This spec defines no combat,
capture, item, targeting, movement or presentation formula using them.

## 7. Egg groups

### 7.1 `EggGroupKey`

`EggGroupKey` is a closed/versioned normalized schema enum derived from the accepted structured
PokémonDB Egg Groups field. v2 uses the current canonical keys:

```text
monster
water-1
bug
flying
field
fairy
grass
human-like
water-3
mineral
amorphous
water-2
ditto
dragon
undiscovered
```

Parser spelling/alias mapping from source labels to these keys is versioned. An unknown/new source
group is a validation finding and cannot be silently slugged into canonical data.

### 7.2 Cardinality and ordering

`eggGroups` contains one or two distinct keys.

Although group membership is set-like, canonical serialization orders keys by the fixed enum order
above. Source display order is provenance only and does not become semantic order.

`undiscovered` is a factual group key, not a null/absence sentinel.

### 7.3 Mechanics boundary

Membership does not define breeding compatibility. No algorithm may infer that two Species can
breed merely because their static EggGroupKey values overlap until an accepted breeding rules spec
exists.

## 8. Gender ratio

Gender ratio is represented without binary floating-point:

```text
GenderRatio =
  | { kind: "genderless" }
  | {
      kind: "ratio"
      maleBasisPoints: Integer // 0..10000
      femaleBasisPoints: Integer // 0..10000
    }
```

For `kind: "ratio"`:

```text
maleBasisPoints + femaleBasisPoints = 10000
```

Source percentages are converted exactly to basis points. A source ratio that cannot be
represented exactly in basis points is a schema/parser finding requiring an explicit future schema
decision; it must not be rounded silently.

This field is Species/form distribution metadata only. It is not the actual gender of an owned
Pokémon and does not authorize instance gender generation or persistence.

## 9. Egg cycles

Canonical representation:

```text
eggCycles: SourceFact<PositiveInteger>
```

When `status = "known"`, only the structured positive cycle count is canonical. Source-site
derived/display step ranges are not ingested as authoritative fields. When the approved source
explicitly publishes no cycle value, v2 stores `{ status: "source-unavailable" }`.

`eggCycles` does not define PokeNexus hatch time, hatch progress, egg acquisition or breeding.

## 10. EV yield

Canonical representation reuses the complete six-key stat vocabulary:

```text
evYield: StatBlock<NonNegativeInteger>
```

Normalization rules:

- all six keys `hp`, `atk`, `def`, `spa`, `spd`, `spe` are present exactly once;
- source-listed yields map to their normalized stat keys;
- unlisted stats normalize to integer `0`;
- every value is a non-negative integer;
- no derived total/BST-like field is stored in SpeciesDefinition v2.

This is defeated-Species factual yield metadata only. It does not define EV accumulation, caps,
stat formulas, training, resets or owned-Pokémon EV state.

## 11. Base friendship

Canonical representation:

```text
baseFriendship: SourceFact<Integer in 0..255>
```

When known, only the current structured source numeric value is canonical. Source descriptive
labels such as "normal" are non-canonical presentation text. When the approved source explicitly
publishes no current value, v2 stores `{ status: "source-unavailable" }`.

`baseFriendship` is a Species/form starting/reference fact only. It is not current friendship for
an owned Pokémon and does not define friendship progression or effects.

## 11.1 Existing `baseExperience` availability correction

The complete pre-publication audit found that PokémonDB can also explicitly publish no current
Base Exp. value for otherwise valid current Species/forms. Therefore v2 refines the existing
SPEC-002 field from an assumed numeric scalar to:

```text
baseExperience: SourceFact<NonNegativeInteger>
```

This is a factual availability correction only. SPEC-006 remains authoritative that
`baseExperience` has no executable progression/reward meaning unless a later owning accepted rule
adopts one.

The pre-publication audit is not limited to `baseExperience`: before SPEC-008 acceptance, every
required existing SPEC-002 Species field must be checked against the intended accepted roster for
explicit source-unavailable states. If another existing required field can legitimately be
source-unavailable, this schema must model that state explicitly (or the Human Owner must explicitly
constrain the accepted roster) before TASK-087 publication. Parser failure may never masquerade as
source unavailability.

## 12. Form-specific data rule

Every accepted persistent Species/form has its own complete seven-field v2 fact set on its exact
`SpeciesId`.

`baseSpeciesId` is a grouping relationship only. It does not authorize inheritance, fallback or
deduplication of any v2 field.

If two persistent forms have equal values, those equal values are still validated/resolved for
each exact accepted form. An implementation may internally deduplicate immutable bytes only if
logical Species records remain complete and deterministic and no consumer must infer inheritance.

Battle-only transformation profiles are outside this rule because they are not persistent
`SpeciesDefinition` identities. Their static combat profile is explicitly deferred by the
accepted section 18.2 policy to a future owning transformation/rules task.

## 13. Source extraction and provenance extension

SPEC-002 section 14.1 source extraction is extended to allow the structured current Species/form
facts needed for:

- metric height;
- metric weight;
- Egg Groups;
- Gender;
- Egg cycles;
- EV yield;
- Base Friendship.

For each extracted field, provenance uses the same immutable source-record/reference and
`sourceContentHash` rules already accepted by SPEC-002.

The crawler must extract the structured factual value, not prose-derived mechanics. In
particular, it must not promote:

- imperial height/weight display as a second canonical value;
- capture-probability annotations shown beside catch rate;
- step-range annotations shown beside Egg cycles;
- prose labels shown beside Base Friendship;
- min/max stat calculator outputs shown near Base Stats;
- evolution/breeding/location text into v2 scalar fields.

Source selection follows SPEC-002's Human-approved hierarchy: Bulbapedia is primary and PokémonDB
is complementary. No unapproved-provider or silent cross-provider override is introduced.

## 14. Adjacent-field classification audit

The following boundary is normative for TASK-087 and future schema proposals.

| Candidate field/content | Classification | v2 treatment |
|---|---|---|
| Types | intrinsic Species/form static fact | already canonical in SPEC-002 |
| six Base Stats | intrinsic Species/form static fact | already canonical in SPEC-002 |
| Ability assignments | intrinsic Species/form static relation embedded in definition | already canonical in SPEC-002 |
| catch rate | intrinsic/current static fact | already canonical; executable capture formula remains separate |
| base experience | intrinsic/current static fact with explicit source availability | **REFINE in v2** to `SourceFact<NonNegativeInteger>`; reward formula remains separate |
| growth rate | intrinsic/current static fact | already canonical; progression use remains separate |
| National Dex number | factual reference metadata | already canonical, non-unique |
| introduced generation | factual reference metadata | already canonical |
| form identity / `baseSpeciesId` | canonical identity/grouping fact | already canonical; no inheritance semantics |
| height / weight | intrinsic Species/form static fact | **ADD in v2** |
| Egg Groups | intrinsic Species/form static membership | **ADD in v2**; no breeding semantics |
| gender ratio / genderless | intrinsic Species/form static fact | **ADD in v2**; actual gender is future instance state |
| Egg cycles | intrinsic Species/form static fact with explicit source availability | **ADD in v2** as `SourceFact`; hatch progress is future instance state |
| EV yield | intrinsic Species/form static fact | **ADD in v2**; accumulated EVs are future instance state |
| Base Friendship | intrinsic Species/form static fact with explicit source availability | **ADD in v2** as `SourceFact`; current friendship is future instance state |
| battle-only transformation profile | transformation-scoped static facts | **DEFERRED** by section 18.2; no separate profile/catalog in schema v2; future owning transformation/rules task defines the static profile and activation/reversion semantics |
| actual gender | persistent Pokémon-instance fact if adopted | deferred; not SpeciesDefinition |
| Nature | persistent Pokémon-instance fact if adopted | deferred; Nature rules separate |
| accumulated EVs | persistent Pokémon-instance fact if adopted | deferred; not SpeciesDefinition |
| current friendship | persistent Pokémon-instance fact if adopted | deferred; not SpeciesDefinition |
| Learnsets / Species↔Move | contextual/relational static artifact | remain separate Learnset artifact |
| machine/item↔Move | contextual/relational static artifact | separate future relation owned with TASK-022/088 |
| evolution topology/triggers | contextual relation + executable rule boundary | separate future graph/rules task |
| local Dex mappings | contextual/game-scoped relation | separate relation if later needed |
| habitats/locations/encounters | contextual PvE content | TASK-033/034 or later content schema |
| held-item/drop facts | contextual relation/reward content | not scalar SpeciesDefinition |
| Nature compatibility/restrictions | contextual/executable rule content | deferred |
| BST | derived value | do not store as authority; compute from Base Stats |
| type defenses | derived from Types + accepted rule context | do not store as Species authority |
| capture probability | derived executable outcome | capture rules task |
| hatch-time/step estimate | derived/executable | breeding/hatching task if adopted |
| evolution eligibility | executable/contextual | evolution rules task |
| breeding compatibility | executable/contextual | breeding rules task |
| Move eligibility | executable/contextual | TASK-088 |
| min/max stat tables | derived/presentation | excluded |
| species/category label | presentation/reference metadata | not required by v2; separate sourced metadata proposal if needed |
| color/shape | presentation/filter metadata | excluded from v2 unless separately sourced/accepted |
| flavor/Pokédex prose | presentation/editorial | excluded |
| assets/sprites/audio | presentation assets | excluded |
| translations | presentation/localization | excluded |
| competitive recommendations | editorial/derived | excluded |

## 15. Historical/source variation

v2 stores the same current-source profile philosophy already accepted by SPEC-002. Historical
generation-specific height, weight, base friendship, EV yield or related factual variants are not
implicitly added merely because PokémonDB displays historical change prose.

If PokeNexus later needs game/generation-scoped historical variants, that requires a separate
relation/versioned extension rather than silently changing the meaning of these current
SpeciesDefinition fields.

## 16. Validation and publication invariants

Before TASK-087 can publish a bundle carrying this SpeciesDefinitionV2 contract:

1. every accepted persistent `SpeciesDefinition` roster entry contains all seven newly added
   required fields plus the v2 `baseExperience` representation;
2. every numeric field satisfies its exact integer domain;
3. every `SourceFact` is either a validated known value or an explicitly recognized
   `source-unavailable` source state; parser/mapping failures cannot use that variant;
4. every gender ratio variant satisfies its discriminant/invariants;
5. every EggGroupKey is recognized by the closed v2 mapping and cardinality is `1..2`;
6. every EV-yield StatBlock is complete and non-negative;
7. all form records resolve their own facts without `baseSpeciesId` fallback;
8. source discovery/extraction/normalization/provenance inventories reconcile under SPEC-002;
9. canonical serialization/hash reproducibility tests include the new/refined fields;
10. consumers that do not support the bundle's exact current `schemaVersion` fail closed;
11. no executable breeding/EV/friendship/hatching/evolution behavior is inferred from presence of
    the static facts.
12. the intended persistent `SpeciesDefinition` roster has been audited for applicability and
    source availability across **all** required existing + v2 Species fields; any additional
    legitimate source-unavailable field has an explicit accepted representation before
    publication, while battle-only transformations are not used to manufacture inapplicable
    persistent facts.

## 17. Implementation handoff to TASK-087

TASK-087 must implement the accepted SpeciesDefinitionV2 contract in `packages/game-data` and the
controlled factual normalizer. The current overall bundle schemaVersion is governed by SPEC-002.
It must not:

- add a PostgreSQL species catalog as substitute authority;
- fetch PokémonDB at runtime;
- use alternate-provider fallback;
- infer missing form facts;
- compile source prose into executable behavior;
- persist derived values as new Species facts merely because they are easy to calculate.

## 18. Human Owner accepted v2 direction

The Human Owner accepted the proposed v2 boundary then under review on 2026-09-18:

1. exact `schemaVersion = "2"`;
2. millimeters/grams as canonical integer height/weight units;
3. basis points for exact normalized gender-ratio representation;
4. the closed/versioned EggGroupKey v2 vocabulary and deterministic order;
5. explicit `SourceFact<T>` / `source-unavailable` handling for Egg cycles, Base Friendship and
   existing Base Exp. instead of numeric zero, null, inferred inheritance or roster exclusion;
6. all v2 fields remain structurally required/non-null; unrecognized missing/ambiguous source data
   blocks publication;
7. the adjacent-field classification table is the accepted pre-publication static-schema boundary.

This Human decision fixes the schema direction. SPEC-008 remains non-authoritative until fresh
independent QA confirms the exact governed artifact and no material correction changes the accepted
direction.

### 18.1 Post-acceptance applicability finding — resolved

Fresh independent QA of the exact REVIEW candidate returned **NOT READY**,
P0/P1/P2/P3 `0/1/0/0`, because the promised complete source-availability audit of the existing
SPEC-002 Species contract had not yet been recorded field by field.

A first focused Pokémon-domain audit returned **NOT READY advisory**,
P0/P1/P2/P3 `0/1/1/0` and initially treated structured `—` values on Mega/Eternamax source
blocks as possible source-unavailability inside the `SpeciesDefinition` contract.

The Human Owner subsequently clarified that Mega forms such as Mega Dragonite are temporary battle
transformations reached through battle criteria/items and are not independently captured or
persisted Pokémon. A fresh applicability re-audit therefore supersedes that first interpretation.

The relevant distinction is now:

1. **applicable-but-source-unavailable** — the fact semantically belongs to an accepted persistent
   Species/form, but PokémonDB explicitly has no current value. The existing `SourceFact<T>`
   mechanism remains appropriate where this state is accepted;
2. **not applicable to the persistent SpeciesDefinition** — the source block represents a
   battle-only transformation whose capture/progression/breeding facts do not belong to a durable
   Species identity. Such a `—` must not create a fake `SourceFact<T>` requirement;
3. **parser/mapping ambiguity** — neither of the above; validation fails closed.

The corrected field audit for the persistent `SpeciesDefinition` roster is:

| Existing required field | Audit outcome |
|---|---|
| `id` | local canonical registry identity; no availability wrapper |
| `sourceName` / `sourceSlug` | source mapping identity; unresolved mapping means no valid roster mapping |
| `nationalDexNumber` | source-backed; no unavailable state found in audited current forms |
| `introducedGeneration` | source-associated normalized mapping; must resolve for the exact form or onboarding fails |
| `formLabel` | source/mapping metadata; null remains the semantic base-form state |
| `baseSpeciesId` | local grouping identity; no value-inheritance authority and no availability wrapper |
| current Types | exact-form source fact; no unavailable state found |
| complete six Base Stats | exact-form source facts; no unavailable state found |
| eligible Ability assignments | required for accepted persistent Species/forms; Mega/Eternamax `—` evidence is not applicable because those are battle-only transformations |
| `catchRate` | required for accepted persistent/capturable Species/forms; Mega/Eternamax `—` evidence is not applicable |
| `baseExperience` | explicit source-unavailable modeling remains required where this fact applies but PokémonDB has no current value |
| `growthRate` | required for accepted persistent Species/forms; Mega `—` evidence is not applicable |
| provenance/source refs | mandatory local provenance metadata; no availability wrapper |

For the seven v2 additions, the same applicability rule holds. Temporary battle transformations do
not force persistent capture/progression/breeding facts into an availability wrapper. Genuine
source-unavailability remains a separate source state for accepted persistent Species/forms; current
audited examples include Base Friendship and Egg cycles on Ogerpon, in addition to Base Exp.

### 18.2 Persistent forms versus battle-only transformations — accepted policy

SPEC-002 already defines the local mapping registry as the explicit accepted form/source roster and
states that source presence alone does not adopt every transformation form as canonical PokeNexus
content. SPEC-008 now makes the applicability consequence explicit:

- **persistent Species/form** — an identity that PokeNexus may durably associate with a
  `PokemonInstance`; ordinary/base Species, regional forms and explicitly adopted persistent
  alternate forms belong to this category and receive the full applicable `SpeciesDefinitionV2`
  contract;
- **battle-only transformation** — a temporary battle state such as a Mega form, Eternamax or an
  equivalent battle-only transformation. It is not a separately captured/persisted
  `PokemonInstance` Species identity and therefore does not receive capture/progression/breeding
  placeholders merely to satisfy `SpeciesDefinitionV2`.

This classification is local roster/provenance policy; it does not require adding a
`formCategory` field to every normalized `SpeciesDefinition`. A discovered upstream
battle-transformation key may be explicitly excluded/deferred from the persistent Species roster
with its policy reason under SPEC-002 coverage reconciliation.

`baseSpeciesId` remains only a persistent Species/form grouping relation. It must not be overloaded
to represent a live transformation relation.

On 2026-09-18 the Human Owner approved **option 1 / defer the transformation profile**.

Therefore schema v2:

- excludes/defers battle-only transformation records from `SpeciesDefinitionV2`;
- does **not** add a transformation/static-profile catalog or a new transformation identity;
- records discovered upstream battle-transformation keys as explicit excluded/deferred inventory
  entries with a policy reason under SPEC-002 coverage reconciliation;
- leaves the canonical transformed static-profile schema to a future owning transformation/rules
  task, which must define the exact source/data boundary before that mechanic becomes executable.

The rejected alternative was to introduce a separate transformation/static-profile catalog in
schema v2. That alternative is intentionally not adopted here; if a future task later needs such a
catalog, it is a new accepted schema extension rather than latent SPEC-008 behavior.

Under the accepted policy:

- `PokemonInstance.speciesId` remains the persistent origin Species/form identity;
- transformation activation must not create or persist a separately owned Mega Pokémon;
- activation criteria/items, timing, duration, reversion and the live Combatant override semantics
  are executable rules owned by a later accepted `rulesVersion` task;
- static transformation data alone does not make Mega Evolution executable under current combat
  rules.

### 18.3 Source-state invariants

Source `—` must not be represented as:

- numeric zero;
- null/undefined;
- an empty known Ability-assignment set;
- a base-form or sibling value copied because the exact-form block omitted the fact;
- an unapproved-provider or unreviewed cross-provider substituted value.

A page-level/shared fact may be associated with more than one exact-form record only where the
accepted source structure or an accepted mapping unambiguously scopes that fact to those exact forms and
the provenance directly supports the association. This is exact-form source association, not
`baseSpeciesId` inheritance. Copying a base/sibling value merely because a form-specific block
omits it remains forbidden.

Bulbapedia is the primary canonical factual/reference authority under SPEC-002, including historical
form/mechanic change evidence. PokémonDB may complement it where a fact is absent or materially
clearer as structured data. Smogon may inform PvP-specific consultation only. The Human Owner's
2026-09-20 source-policy resolution makes a structured Bulbapedia value authoritative when PokémonDB
disagrees; only structural identity/binding ambiguity, missing-primary substitution, or ambiguity in
the Bulbapedia interpretation remains a Human gate.

## 19. Acceptance

This specification becomes authoritative only after:

1. the Human Owner acceptance recorded in section 18 plus the post-acceptance applicability
   resolution still matches the exact reviewed artifact;
2. fresh independent QA reports no unresolved P0/P1 on that corrected exact artifact;
3. repository history is separately authorized and the accepted spec is integrated.
