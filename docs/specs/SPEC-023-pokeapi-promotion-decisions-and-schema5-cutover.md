# SPEC-023 — Pinned PokéAPI Promotion Decisions & Schema-5 Cutover

## Status

**APPROVED — Human Owner accepted the exact contract on 2026-10-03.**

This specification refines APPROVED SPEC-022 using evidence from the first separately authorized,
immutable PokéAPI source snapshot. It does not authorize publication, runtime schema-5 enablement,
commit, push, merge or deployment.

## 1. Scope and evidence baseline

This decision applies only to:

- provider: `pokeapi`;
- upstream Git revision: `bc92d3b6029ef1abe9e7ad424c400b338f3c11fe`;
- source snapshot:
  `source-snapshot:pokeapi:8ef26f3e68509ee3c101a7063c32c67283dc95c67aa5f23a6ff2a829bd2bf9b8`;
- the exact 25 CSVs already acquired and retained under SPEC-022;
- current published baseline: `game-data-core-kanto-johto-v3`, schema `4`, bundle
  `sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559`.

The seven factual artifacts in v3 are byte-identical to the Human-approved corrected v2 artifacts.
Therefore the TASK-113 parity findings against v2 are also factual findings against v3. A schema-5
candidate must preserve the three v3 PvE artifacts unchanged unless another owning task explicitly
changes them.

The first real parity with exact default-only Species bindings produced:

```text
4,910 match
11 mismatch
35 missing-current
1 missing-source
588 unmapped
```

After proving all 42 accepted persistent-form bindings locally, Species coverage becomes 293/293.
The remaining `unmapped` entries are Move target semantics intentionally left fail-closed by this
specification.

Applying only the complete 293-Species binding registry plus the explicit `vise-grip -> vice-grip`
Move provider binding — before changing any factual value — yields the expected comparison shape:

```text
5,411 match
57 mismatch
35 missing-current
0 missing-source
547 unmapped
```

The 57 mismatches are exactly 42 persistent-form `sourceSlug` values, five Base Experience values and
ten `makesContact` values. The 35 `missing-current` entries are 30 Item categories plus the five
accepted-but-unpublished Move records. All 547 `unmapped` entries are PokéAPI `sourceTarget` audit
evidence and are intentionally not promotion blockers under §3.

## 2. Decision summary

| Surface | Decision |
|---|---|
| Species exact-variety structured facts | **PROMOTE** from pinned PokéAPI after exact binding |
| Species persistent-form `sourceSlug` | **PROMOTE** to exact PokéAPI variety identifier for the 42 explicit bindings |
| Species persistent-form `introducedGeneration` | **KEEP CURRENT**; exact form→version-group→generation proof remains required |
| Species `sourceName` / `formLabel` | **KEEP CURRENT**; no synthetic or partial-name promotion |
| Species `baseFriendship` / `eggCycles` | **KEEP CURRENT**; aliases remain unaccepted |
| Move `makesContact` | **PROMOTE** from pinned PokéAPI structured contact flag |
| Move `sourceTarget` | **KEEP CURRENT AUTHORITY**; PokéAPI target identifier becomes parity/audit evidence only |
| Move selected-game type/category/PP/Power/Accuracy | **KEEP CURRENT** SPEC-002 policy |
| Move Z-A cooldown | **KEEP CURRENT** Bulbapedia authority |
| Five accepted-but-unpublished Move mappings | **DO NOT ADD** from PokéAPI alone |
| `vise-grip` ↔ PokéAPI `vice-grip` | **ADD EXPLICIT PROVIDER BINDING**, do not rename canonical/local source key |
| Type identity/name/current matrix | **PROMOTE PROVENANCE**; values already match |
| Ability identity/name/generation | **PROMOTE PROVENANCE**; values already match |
| Item identity/name/slug | **PROMOTE PROVENANCE** for accepted 30; values already match |
| Item category | **PROMOTE VALUE** from `null` for accepted 30 Items |
| Learnsets | **KEEP CURRENT**; PokéAPI remains audit-only |

## 3. Move `sourceTarget` authority amendment

SPEC-022 §6.1 and §8.1 currently name the pinned PokéAPI target relation as primary authority for
`Move.sourceTarget`. The real pinned dataset proves that its target identifiers are not information-
equivalent to the current PokeNexus target enum.

Across accepted published Moves, one PokéAPI identifier can map to more than one current canonical
target. Examples from the exact snapshot include:

```text
selected-pokemon -> any-adjacent (368), any-other (20), all-adjacent-foes (1)
all-other-pokemon -> all-adjacent (12), any-adjacent (1)
specific-move -> self (3), any-adjacent (2)
user-and-allies -> self-and-allies (5), adjacent-ally (1)
```

Using the existing canonical value to infer a PokéAPI→PokeNexus mapping would be circular and would
not establish PokéAPI authority. Collapsing the PokeNexus enum to the coarser upstream taxonomy would
also change battle/presentation semantics outside this data-source task.

Therefore, this specification amends SPEC-022 as follows:

- `Move.sourceTarget` retains the pre-SPEC-022/current-v3 authority and provenance policy: the accepted
  canonical value is preserved from the existing Bulbapedia-selected Move pipeline, with PokémonDB
  structured complementary target evidence and the existing exact Bulbapedia target fallback where
  that pipeline requires it;
- PokéAPI `move_targets.identifier` is retained as structured parity/audit evidence;
- no automatic PokéAPI target→PokeNexus target mapping is permitted;
- a future authority change requires a separately accepted semantic mapping or canonical target-model
  change with complete accepted-Move coverage;
- unknown or ambiguous target evidence remains fail-closed.

This amendment applies only to `sourceTarget`. PokéAPI `makesContact` authority remains approved.

## 4. Species bindings and promotion

### 4.1 Base/default Species

The 251 accepted base/default Species use exact local bindings where the accepted local source key
`pokedex:<species-slug>:<national-dex>` resolves to the PokéAPI default `pokemon` row whose joined
`pokemon_species` row has the same National Dex relation.

No PokéAPI numeric identifier becomes a canonical PokeNexus ID.

### 4.2 Accepted persistent forms

All 42 accepted persistent forms have exactly one PokéAPI non-default variety candidate when matched
within the same National Dex on the following structured identity vector:

- exact Type set;
- six Base Stats;
- Ability assignments including Hidden/normal slot;
- height;
- weight;
- EV yield.

Base Experience is deliberately excluded from the binding identity vector because it is itself an
approved PokéAPI-authoritative promoted field and differs on four otherwise uniquely identified forms.
Names, labels and upstream numeric IDs are not used to infer identity.

The exact bindings are:

| Accepted local source key | PokéAPI pokemonId | Exact PokéAPI variety slug |
|---|---:|---|
| `pokedex:rattata:10158` | 10091 | `rattata-alola` |
| `pokedex:raticate:10159` | 10092 | `raticate-alola` |
| `pokedex:raichu:10150` | 10100 | `raichu-alola` |
| `pokedex:sandshrew:10143` | 10101 | `sandshrew-alola` |
| `pokedex:sandslash:10144` | 10102 | `sandslash-alola` |
| `pokedex:vulpix:10141` | 10103 | `vulpix-alola` |
| `pokedex:ninetales:10142` | 10104 | `ninetales-alola` |
| `pokedex:diglett:10181` | 10105 | `diglett-alola` |
| `pokedex:dugtrio:10180` | 10106 | `dugtrio-alola` |
| `pokedex:meowth:10152` | 10107 | `meowth-alola` |
| `pokedex:meowth:11144` | 10161 | `meowth-galar` |
| `pokedex:persian:10173` | 10108 | `persian-alola` |
| `pokedex:growlithe:11174` | 10229 | `growlithe-hisui` |
| `pokedex:arcanine:11179` | 10230 | `arcanine-hisui` |
| `pokedex:geodude:10182` | 10109 | `geodude-alola` |
| `pokedex:graveler:10183` | 10110 | `graveler-alola` |
| `pokedex:golem:10184` | 10111 | `golem-alola` |
| `pokedex:ponyta:11080` | 10162 | `ponyta-galar` |
| `pokedex:rapidash:11081` | 10163 | `rapidash-galar` |
| `pokedex:slowpoke:11159` | 10164 | `slowpoke-galar` |
| `pokedex:slowbro:11160` | 10165 | `slowbro-galar` |
| `pokedex:farfetchd:11123` | 10166 | `farfetchd-galar` |
| `pokedex:grimer:10171` | 10112 | `grimer-alola` |
| `pokedex:muk:10172` | 10113 | `muk-alola` |
| `pokedex:voltorb:11177` | 10231 | `voltorb-hisui` |
| `pokedex:electrode:11180` | 10232 | `electrode-hisui` |
| `pokedex:exeggutor:10140` | 10114 | `exeggutor-alola` |
| `pokedex:marowak:10151` | 10115 | `marowak-alola` |
| `pokedex:weezing:11068` | 10167 | `weezing-galar` |
| `pokedex:mr-mime:11133` | 10168 | `mr-mime-galar` |
| `pokedex:tauros:11203` | 10250 | `tauros-paldea-combat-breed` |
| `pokedex:tauros:11204` | 10251 | `tauros-paldea-blaze-breed` |
| `pokedex:tauros:11205` | 10252 | `tauros-paldea-aqua-breed` |
| `pokedex:articuno:11165` | 10169 | `articuno-galar` |
| `pokedex:zapdos:11167` | 10170 | `zapdos-galar` |
| `pokedex:moltres:11168` | 10171 | `moltres-galar` |
| `pokedex:typhlosion:11182` | 10233 | `typhlosion-hisui` |
| `pokedex:wooper:11194` | 10253 | `wooper-paldea` |
| `pokedex:slowking:11161` | 10172 | `slowking-galar` |
| `pokedex:qwilfish:11181` | 10234 | `qwilfish-hisui` |
| `pokedex:sneasel:11183` | 10235 | `sneasel-hisui` |
| `pokedex:corsola:11125` | 10173 | `corsola-galar` |

These bindings are provider bindings only. They do not change canonical `SpeciesId`, `baseSpeciesId`,
accepted-form roster or current `sourceName`/`formLabel` authority.

### 4.3 Species value changes

With all 293 bindings, every promoted structured Species field matches current data except:

| Species | Field | Current | Pinned PokéAPI | Decision |
|---|---|---:|---:|---|
| Blissey | Base Experience | 635 | 608 | promote 608 |
| Alolan Raichu | Base Experience | 218 | 243 | promote 243 |
| Galarian Articuno | Base Experience | 261 | 290 | promote 290 |
| Galarian Zapdos | Base Experience | 261 | 290 | promote 290 |
| Galarian Moltres | Base Experience | 261 | 290 | promote 290 |

The 42 accepted persistent forms also change `sourceSlug` from the current base-species slug to the
exact PokéAPI variety slug listed in §4.2.

Their current `introducedGeneration`, `sourceName` and `formLabel` remain unchanged.

Expected Species content delta: **47 field changes across 43 Species records** — 42 `sourceSlug`
changes plus the five Base Experience changes above, with four records containing both changes.

### 4.4 Local PokéAPI provider-binding registry

Implementation must materialize a project-owned, versioned local provider-binding registry tied to the
exact PokéAPI `snapshotId`. It is data authority, not a runtime inference cache.

Minimum contract:

```text
PokeApiBindingRegistryV1 {
  version: "pokeapi-binding-registry-v1"
  snapshotId: "source-snapshot:pokeapi:..."
  species[] {
    sourceKey       // accepted local mapping key
    pokemonId       // exact PokéAPI pokemon row
  }
  moveOverrides[] {
    sourceKey       // accepted local mapping key
    moveId          // exact PokéAPI move row
  }
}
```

Requirements:

- all 293 accepted Species mappings must have exactly one registry entry;
- the 42 non-default bindings are exactly §4.2; the 251 default bindings must resolve to the exact
  default variety joined to the same accepted National Dex relation;
- the registry is rejected if its `snapshotId` differs from the verified local PokéAPI snapshot;
- duplicate source keys or upstream IDs fail closed;
- implementation must revalidate each entry against the pinned structured identity evidence before use;
- `moveOverrides` contains the exceptional `vise-grip -> moveId 11` binding from §5.2; ordinary exact
  Move slug matches do not become canonical IDs and remain verified against the same snapshot;
- no provider numeric ID is exposed as or substituted for a canonical PokeNexus ID.

## 5. Move promotion

### 5.1 `makesContact`

The pinned structured `contact` flag relation is promoted as approved by SPEC-022. Ten published
Moves change from current `true` to PokéAPI `false`:

```text
axe-kick
comeuppance
hyper-drill
ice-spinner
pounce
psyshield-bash
rage-fist
raging-bull
trailblaze
wave-crash
```

Six of these Moves exist in the current production combat-support universe and are already classified
`unsupported`; the remaining four are outside that support universe. None is currently executable
through the production MoveRule catalog, so this factual correction does not change currently
executable combat behavior. Future support must consume the promoted value.

The evidence relation for every promoted contact fact must retain all required PokeAPI source files:

- `moves.csv`;
- `move_flag_map.csv`;
- `move_flags.csv`.

### 5.2 `vise-grip` provider binding

The accepted local Move mapping key remains `vise-grip`. The pinned PokéAPI row is `moveId = 11`,
`identifier = vice-grip`.

Promotion adds an explicit provider binding:

```text
accepted local source key: vise-grip
PokéAPI moveId: 11
PokéAPI source slug: vice-grip
```

This is not a canonical-ID rename and does not rewrite the existing mapping roster key.

### 5.3 Five accepted mappings absent from the published Move catalog

The following accepted mapping identities remain historical mappings and are not added to the
published catalog from PokéAPI alone:

```text
burn-up
flower-shield
leaf-tornado
mind-reader
power-up-punch
```

PokéAPI does not own their selected-game type/category/PP/Power/Accuracy. A complete canonical Move
record therefore cannot be created from this source without violating SPEC-002/SPEC-022 authority.

## 6. Items, Types, Abilities and Type matrix

### 6.1 Items

All 30 accepted Item names/slugs match the pinned snapshot. `sourceCategory` is currently null for all
30 and is promoted from PokéAPI:

- 21 `nature-mints`;
- 7 `apricorn-balls`;
- 2 `loot`.

Two unrelated upstream Items lacking English localized names are not accepted local mappings and do
not block this 30-Item promotion. Missing localized evidence for any future mapped Item remains
`missing-source` and fail-closed.

Expected Item content delta: **30 field changes across 30 Item records**.

### 6.2 Types and matrix

All 18 accepted Type names/slugs and all 324 current Type-effectiveness cells match. Values remain
unchanged; schema-5 provenance moves to the pinned PokéAPI snapshot.

### 6.3 Abilities

All 147 accepted Ability names/slugs/generations match. Values remain unchanged; schema-5 provenance
moves to the pinned PokéAPI snapshot. Species Ability assignments are promoted through the exact
293 Species/variety bindings.

## 7. Explicit non-promotions

This decision does not promote or modify:

- `Move.sourceTarget`;
- Move selected-game type/category/Base PP/Power/Accuracy;
- Move Z-A cooldown;
- Learnsets or Generation IX→BDSP fallback semantics;
- Species `baseFriendship`;
- Species `eggCycles`;
- accepted persistent-form `introducedGeneration`;
- Species/form `sourceName` or `formLabel`;
- evolution/Nature mechanics;
- assets;
- canonical IDs, `baseSpeciesId`, accepted form roster or mapping status.

## 7.1 Current runtime behavior impact

The proposed factual value changes do not alter currently executable gameplay behavior:

- `Species.baseExperience`, Species `sourceSlug` and Item `sourceCategory` have no current production
  game-rule consumer outside the static-data domain;
- none of the ten changed `makesContact` Moves is executable in the current production MoveRule
  catalog: six are present but explicitly `unsupported`, and four are outside its support universe;
- `Move.sourceTarget` is not changed, so the current production combat-support target snapshot remains
  compatible.

This is a current-runtime statement only. Future Move support must consume the promoted
`makesContact` values, including their contact-reaction implications.

## 8. Schema-5 candidate envelope

After Human acceptance of this specification, implementation may prepare the local schema-5 migration
and candidate pipeline for proposed `gameDataVersion = "game-data-core-kanto-johto-v4"` with
`schemaVersion = "5"`. **Candidate staging remains blocked until the historical-evidence prerequisite
in §8.1 is complete.**

The complete expected factual content delta is **87 field changes across 83 records**:

- Species: 47 field changes / 43 records;
- Moves: 10 `makesContact` changes / 10 records;
- Items: 30 `sourceCategory` changes / 30 records.

No other catalog/reference/PvE content value is authorized to change. Provenance changes are expected
where authority moves to the pinned snapshot even when the factual value is byte-equivalent.

The candidate must:

- use `game-data-core-kanto-johto-v3` as its exact published baseline;
- define schema-5 manifest semantics as an additive extension of `GameDataManifestV4`, not of the
  historical schema-3 manifest: retain `pveContentSchemaVersion`, all ten v4 artifact logical names,
  all ten v4 catalog counts, `provenanceManifest`, `sourceInventory`, `normalizerVersion`, publication
  metadata and bundle/provenance hashing fields, changing only `schemaVersion` to `"5"` plus any
  schema-5-only provenance descriptor fields explicitly required by SPEC-022;
- retain all three schema-4 PvE artifacts byte-identically:
  - `catalogs/zones` → `sha256:50cdad7d5dcd51b20f1f83ef91668fe95cec1a9ff98928da249d0d3c414d6a69`;
  - `catalogs/hunts` → `sha256:b10e4e7fc83556f3fdadefe2fe2989868d19b931b622acd70f1a17acaaa3fa8b`;
  - `catalogs/encounter-definitions` → `sha256:5c197679669e86ed3646a7227b7f22983f2e312ec068562f18ad9c941f9bc60e`;
- retain unchanged factual artifact records except for the explicit promotions in this specification;
- use schema-5 `SourceSnapshotRecord`, SourceRecord→snapshot/file binding and field-level/multi-file
  provenance from SPEC-022/TASK-113;
- preserve historical source evidence for fields whose authority remains current;
- contain no upstream/network dependency in staging, validation or publication;
- produce a deterministic candidate identity, review hash and parity report;
- not be published or runtime-enabled without a separate Human data/publication gate.

The schema-5 manifest parser must use exact-key validation and must not widen the existing schema-3 or
schema-4 parsers. Existing runtime loaders continue to reject schema 5 until a separately owned runtime
cutover explicitly adds support.

Runtime consumers that do not explicitly support schema 5 continue to fail closed. Runtime schema-5
enablement is not implicitly authorized by this data-promotion decision.

### 8.1 Historical evidence migration prerequisite

Schema 5 requires every published `SourceRecord` to bind to a retained `SourceSnapshotRecord` and exact
local source bytes. Retaining current authority for Move mainline scalars, `sourceTarget`, Z-A cooldown,
Learnsets and the non-promoted Species fields therefore requires recoverable historical evidence; the
schema-4 provenance hashes alone are insufficient.

A pre-implementation role audit of the v3 evidence required by this specification found **1,144
distinct current v3 SourceRecord obligations** across the explicit provenance roles that must remain
supported by recoverable local bytes in the schema-5 candidate:

- all current Species aggregate evidence, because `sourceName`, `formLabel`, `baseFriendship` and
  `eggCycles` are not promoted here;
- all current Learnset evidence;
- every current Move mainline, `sourceTarget` and Z-A evidence role;
- old Move contact-only evidence is not required because `makesContact` moves to PokéAPI.

During implementation, a deeper audit of each v3 Move's aggregate `sourceRecordIds` found three shared
records outside that explicit-role union. One was the old PokémonDB contact evidence for Psychic Noise
and remains intentionally superseded by PokéAPI `makesContact`. The other two are exact Bulbapedia
Generation VII and Generation VIII Move-availability lists used as supporting evidence for why an
older mainline game was selected for removed Moves. The corresponding Generation IX availability list
was already inside the 1,144 explicit-role set. Schema 5 supports the stronger representation through
`MoveFactSourceRelationV2.mainline.sourceRecordIds[]`, so the two additional availability records are
retained rather than discarded.

Therefore the complete historical retention set for this cutover is **1,146 SourceRecords**:

- 1,144 records from the approved explicit-role audit;
- 2 additional shared Bulbapedia mainline-selection context records;
- 0 additional contact-only records.

This is an additive provenance-preservation clarification only. It does not change any factual value,
field authority, mapping decision or the approved **87 field / 83 record** promotion delta.

The authoritative retained TASK-087 post-publication hardening cache is:

`G:\pokenexus-idle\.worktrees\TASK-087-post-publication-hardening\.tmp\task-087-hardening\cache`

Exact local recovery from that cache was validated using all three legacy commitments simultaneously:

- cache key = SHA-256 of the exact canonical URL;
- cached bytes SHA-256 = the v3 `sourceContentHash`;
- cached metadata `fetchedAt` = the v3 SourceRecord timestamp.

Result:

```text
explicit-role obligations:       1,144
additional mainline context:         2
total historical records:        1,146
exact local cache matches:       1,146
missing exact source bytes:          0
hash/timestamp conflicts:            0
```

The 1,146 exact local cache hits may be migrated **without external access** into project-controlled
schema-5 evidence. Because the legacy cache acquired each URL independently, migration must not invent
a historical batch acquisition. Each legacy SourceRecord may be represented as its own one-file
`SourceSnapshotRecord`, preserving:

- provider;
- exact canonical URL as `sourceLocator`;
- original `fetchedAt` as schema-5 `acquiredAt`;
- exact content hash and bytes;
- `upstreamRevision = null` for these web-provider snapshots.

This operation is evidence retention/migration, not a new ACQUIRE.

The retained TASK-087 hardening cache is legacy working storage, not the final retention location.
Until all 1,146 records have been copied and independently verified in project-controlled
maintenance storage, that source worktree/cache is protected evidence: implementation must not clean,
delete, rewrite or otherwise mutate it. Stable migration must complete before any later cleanup of the
TASK-087 worktree is considered.

No new Bulbapedia/PokémonDB ACQUIRE is required for the v3 retained-authority evidence covered by this
specification. If implementation discovers any cache key/hash/timestamp discrepancy against these
1,146 records, it must fail closed and return to Human review rather than fetching upstream.

## 9. Promotion acceptance gates

Before presenting a publication gate, implementation must prove:

1. all 293 accepted Species have explicit PokéAPI bindings;
2. all promoted Species fields equal the staged candidate values and no unapproved field changes;
3. the five Base Experience changes are exactly those listed in §4.3;
4. the 42 form `sourceSlug` changes are exactly those in §4.2;
5. the ten `makesContact` changes are exactly those in §5.1;
6. the 30 Item category promotions are exactly those in §6.1;
7. Type/Ability/matrix values remain byte-equivalent at the fact level while provenance changes;
8. `Move.sourceTarget` values remain byte-equivalent to v3;
9. the five accepted-but-unpublished Move mappings remain absent from the Move catalog;
10. the `vise-grip` canonical/local identity remains unchanged while its PokéAPI provider binding is
    explicit;
11. Learnsets and all three v3 PvE artifacts remain unchanged;
12. all 1,146 retained historical evidence records are migrated from the exact retained TASK-087
    cache into immutable local SourceSnapshot evidence with URL-key/content-hash/timestamp identity,
    including the two shared Move-availability records preserved as multi-file `mainline` context;
13. schema-3/schema-4 historical publications remain byte-valid and readable;
14. no normal build/CI/INGEST/PUBLISH/runtime path contacts a third-party factual provider;
15. independent QA reports no unresolved P0/P1;
16. the Human Owner receives the exact staged `gameDataVersion`, bundle/provenance hashes and factual
    delta inventory before any publication authorization request.

## 10. Human decisions required

Human acceptance on 2026-10-03 approved the **pre-implementation decision contract only**. At that
gate, the historical-evidence audit quantified 1,144 explicit-role obligations. The later +2
Bulbapedia mainline-selection records in §8.1 were discovered during implementation deep-audit and are
an additive provenance-preservation clarification, not a separately post-discovery Human-approved
factual or authority change.

The accepted decision contract:

- accept the 42 explicit persistent-form PokéAPI bindings in §4.2;
- accept the five Base Experience promotions in §4.3;
- accept the ten `makesContact` promotions in §5.1;
- accept the `vise-grip`→PokéAPI `vice-grip` provider binding in §5.2;
- accept the 30 Item category promotions in §6.1;
- accept the amendment retaining current `Move.sourceTarget` authority in §3;
- authorize local evidence migration needed to preserve the accepted retained authorities; the
  pre-implementation audit identified 1,144 explicit-role records, while implementation retained the
  complete 1,146-record set described in §8.1 after discovering two additional provenance-only
  mainline-selection context records;
- authorize implementation and local staging/validation of the schema-5 v4 candidate pipeline
  described in §8.

The Human publication gate must disclose the implementation-era broadening from 1,144 to 1,146 before
any publication authorization is requested; it must not be represented as a second explicit Human
approval that occurred after the +2 records were discovered.

It does **not** authorize any new external ACQUIRE, publication, runtime schema-5 enablement, Git
history operations or deploy.
