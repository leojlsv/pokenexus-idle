# TASK-113 — Local Pokémon Source Snapshot Implementation

## Metadata

- State: ACCEPTANCE
- Review note: post-ACQUIRE corrective re-gate TECH/ARCH READY with P0/P1/P2/P3 = 0/0/0/0; remaining parity deltas gate future promotion only
- Class: B — implementation inside approved SPEC-022 architecture
- Owner: Lead Developer
- Owner execution surface: ChatGPT coding agent
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: N/A — no security, concurrency, realtime, economy/trading or destructive-migration trigger
- Auditor execution surface: N/A
- Consultants: N/A — no gameplay/economy semantics are changed
- Consultant execution surface(s): N/A
- Specs: APPROVED SPEC-002 / SPEC-008 as amended by APPROVED SPEC-022
- Related: TASK-006 / TASK-087 / TASK-092 / TASK-112
- Branch: `feat/TASK-113-local-pokemon-snapshot-implementation`
- Worktree: `.worktrees/TASK-113-local-pokemon-snapshot-implementation`

## Objective

Implement the approved local-source snapshot and provenance foundation so canonical Pokémon data can
be parsed and reconciled from immutable local bytes without any third-party access during normal
ingestion, publication, build, CI or runtime.

## In scope

1. Add canonical schema-5 snapshot/provenance structures from SPEC-022:
   - `SourceSnapshotRecord`;
   - exact snapshot-hash canonicalization/verification;
   - SourceRecord → snapshot/file binding;
   - multi-file `FactSourceRelation`;
   - schema-5 `MoveFactSourceRelationV2` with multi-record roles.
2. Add `pokeapi` as an approved provider only under schema-5/local-snapshot parsing.
3. Add a deterministic local PokéAPI CSV snapshot adapter that:
   - reads an explicit local snapshot root/manifest only;
   - verifies manifest/file hashes before parsing;
   - performs no network requests;
   - exposes structured facts needed for the first approved migration surfaces.
4. Implement the low-ambiguity PokéAPI relations approved by SPEC-022 using local fixture snapshots:
   - Type identity/current effectiveness;
   - Ability identity/generation and Pokémon assignment;
   - Item identity/category;
   - Move target and contact flag evidence;
   - Species/variety types, stats, abilities, base experience, height, weight, EV yield, National Dex,
     base-species generation, catch rate, growth rate, Egg Groups and gender metadata.
5. Preserve current authority for exact-game Move scalars, Z-A cooldown, Learnsets, unresolved
   persistent-form generation/name coverage, `baseFriendship` and `eggCycles` unless explicitly
   represented as parity evidence only.
6. Provide a local-only parity/diff surface that can compare future PokéAPI-derived facts against the
   currently published canonical bundle without publishing or mutating that bundle.

## Out of scope

- any external ACQUIRE/network operation;
- downloading or refreshing PokéAPI/Bulbapedia/PokémonDB;
- publishing a new `gameDataVersion`;
- changing current Move selected-game scalar authority;
- changing Learnset authority/fallback semantics;
- promoting `base_happiness` or `hatch_counter` aliases to canonical authority;
- auto-adopting forms/varieties into the mapping roster;
- assets/sprites/cries/artwork;
- evolution/Nature runtime catalogs or mechanics;
- commit, push, merge, deploy or public enablement.

## Acceptance criteria

- [x] Existing schema-3/schema-4 publications remain readable with historical provenance semantics.
- [x] Schema 5 supports canonical `SourceSnapshotRecord` and exact snapshot-hash verification.
- [x] Every schema-5 SourceRecord is bound to one snapshot/file and exact content hash.
- [x] Multi-file facts can prove all supporting records; Move contact proves both flag vocabulary and
  Move↔flag mapping evidence.
- [x] `pokeapi` is accepted only in the schema-5/local snapshot path; old schemas retain old provider
  constraints.
- [x] The local PokéAPI adapter rejects missing/hash-mismatched files before fact parsing.
- [x] The adapter performs no network request and has no hidden fallback path.
- [x] Approved low-ambiguity Species/Type/Ability/Item/Move-target/contact facts parse deterministically
  from local fixture CSVs.
- [x] Local mapping remains authoritative for canonical IDs/form adoption.
- [x] Existing Move scalar/Z-A/Learnset authority is unchanged.
- [x] A parity/diff report can be produced locally without publication or external access.
- [x] Relevant package tests/typecheck/lint/build and `git diff --check` pass.
- [x] Independent QA reports no unresolved P0/P1 before acceptance after the real-snapshot corrections.

## Required validation

- focused unit tests for snapshot canonicalization/hash verification and schema-5 provenance;
- focused fixture tests for PokéAPI CSV joins and fail-closed missing/hash-drift cases;
- regression tests proving schema-3/schema-4 publication compatibility;
- package `@pokenexus/game-data` tests and typecheck;
- relevant root lint/build if touched surfaces require it;
- `pnpm roadmap:check` and `git diff --check`.

## Dependencies

- TASK-112 Class-A acceptance complete;
- APPROVED SPEC-022;
- existing TASK-087 publication/runtime-delivery foundation.

## Risks / irreversible actions

- schema-5 provenance must not reinterpret schema-3/schema-4 bytes;
- provider widening must not accidentally permit PokéAPI in historical schemas;
- CSV joins must retain every exact supporting source file in provenance;
- no missing local source may trigger network access.

No external acquisition, canonical publication, deployment or Git-history operation is authorized by
this task.

## Readiness / execution gate

Definition of Ready is satisfied by the Human-approved SPEC-022 contract and completed independent
pre-implementation QA on TASK-112. Implementation is authorized inside this isolated worktree. Any
ACQUIRE operation remains separately Human-gated under SPEC-022.

## Owner implementation evidence — 2026-10-02

- Added schema-5-only local snapshot/provenance structures without widening historical schema-3/4
  provider or provenance parsing. `pokeapi` is accepted only by the new Node-only v5 path.
- Added exact source snapshot hashing/binding, immutable upstream-revision checks for PokéAPI, local
  path/symlink/hash verification, multi-file fact evidence and Move fact-source arrays.
- Added the local PokéAPI CSV adapter for the SPEC-022 low-ambiguity fields plus exact evidence-file
  sets. The adapter reads only an explicit verified local snapshot and contains no network path.
- Added local parity/diff with explicit Species source-key bindings; upstream Pokémon IDs/names never
  auto-create or auto-adopt canonical forms. Move target mapping is explicit and unknown targets
  remain `unmapped` evidence.
- Repointed the normal package `ingest` command to the local-only snapshot CLI. The historical
  network-capable maintenance CLI is no longer the normal ingestion entrypoint; its direct CLI is now
  fail-closed, and no ACQUIRE command was added.
- Runtime/root consumer entrypoints remain schema-3/4 only; schema 5 stays Node-only and fail-closed
  until a separately owned publication/runtime cutover task.

### Owner validation

- `corepack pnpm --filter @pokenexus/game-data typecheck` → PASS.
- focused v5/local/PokéAPI + Node-export tests → **13/13 PASS** after the final CLI/filesystem/form-
  binding/FK guard corrections.
- historical schema/canonical/runtime/publication regression selection → **94/94 PASS**.
- full `@pokenexus/game-data` suite with one worker → **377 PASS / 1 skipped** across **35 passing
  files / 1 live-test file skipped**. A parallel run first hit only the pre-existing explicit 20-second
  timeout in `pve-publication.test.ts`; that test then passed **1/1** in isolation in 10.8 seconds, and
  the serial full-suite rerun passed without failures.
- `corepack pnpm --filter @pokenexus/game-data lint` → PASS.
- `corepack pnpm --filter @pokenexus/game-data build` → PASS.
- `corepack pnpm --filter @pokenexus/game-data test:worker-compat` → PASS.
- direct compiled `maintenance-cli.js` invocation → expected FAIL-CLOSED before provider access.
- normal `pnpm ingest -- <root>` argument forwarding was exercised; the local CLI receives the root
  after the literal pnpm `--` separator and fails on missing local material rather than usage/network.
- parity now requires an explicit local `sourceKey -> pokemonId` binding for every accepted
  Species/form; unbound accepted forms surface as `unmapped`, non-default forms use their exact
  variety facts, and form `introducedGeneration` is not inherited from base Species generation.
- local CSV parsing rejects orphan Pokémon relation rows and duplicate Type slots, in addition to
  unknown Type/Ability/Move/Stat foreign keys and duplicate relation identities.
- root `corepack pnpm lint` → PASS.
- root `corepack pnpm build` → PASS.
- `git diff --check` → PASS.
- dependency materialization used `corepack pnpm install --offline --frozen-lockfile`: **272 reused,
  0 downloaded**; no external acquisition was performed.

## Independent QA evidence — 2026-10-02

- Final re-gate verdict: **TECH READY / ARCH READY**.
- Final findings: **P0/P1/P2/P3 = 0/0/0/0**.
- The reviewer independently reran focused **13/13**, historical regression **94/94**, full serial
  suite **377 PASS / 1 live skipped**, package typecheck/lint/build, Worker compatibility dry-run,
  roadmap check and diff check; all passed.
- Direct `maintenance-cli` invocation failed closed before provider access, while the local snapshot CLI
  failed only on missing local filesystem material.
- QA confirmed the local-only external-provider boundary, historical schema-3/4 compatibility,
  deterministic schema-5 snapshot/provenance binding, filesystem fail-closed behavior, explicit
  Species/form binding, authority-preserving parity, Node-only schema-5 surface and runtime fail-closed
  behavior.

## Separately authorized real-snapshot validation — 2026-10-03

- Human Owner separately authorized one-shot ACQUIRE of provider `pokeapi`, exact revision
  `bc92d3b6029ef1abe9e7ad424c400b338f3c11fe` and the exact 25-file low-ambiguity CSV set.
- Immutable local snapshot:
  `source-snapshot:pokeapi:8ef26f3e68509ee3c101a7063c32c67283dc95c67aa5f23a6ff2a829bd2bf9b8`.
- Real local INGEST now passes with **1,351 Pokémon/varieties / 1,025 Species / 937 Moves / 21 Types /
  374 Abilities / 2,223 Items / 324 explicit Type-effectiveness rows**.
- Real bytes exposed three adapter/parity edges that fixture-only validation had missed:
  - one unsupported non-default variety (`eternatus-eternamax`) has upstream `weight = 0`; parser now
    preserves zero rather than inventing a positive value;
  - one unsupported non-default variety (`zygarde-mega`) has no upstream Ability assignment; default
    Pokémon remain fail-closed, while unbound non-default varieties may retain an empty assignment set;
  - two upstream Items lack English localized names; adapter retains `sourceName = null` as incomplete
    evidence and parity reports `missing-source` if such an Item is ever mapped.
- PokéAPI Egg Group identifiers were reconciled to canonical keys using exact set-equivalence across
  the 251 exact default-Species bindings; the mapping is closed and unknown identifiers still fail.
- Species Type parity now compares canonical Type-ID order, matching existing canonical bundle
  semantics rather than upstream slot order.
- Final local parity against `game-data-core-kanto-johto-v2`: **4,910 match / 11 mismatch /
  35 missing-current / 1 missing-source / 588 unmapped**.
  - 42 unmapped = accepted alternate forms with no explicit PokéAPI binding; no form inference occurred.
  - 546 unmapped = Move `sourceTarget` because no explicit semantic mapping is accepted; observed
    PokéAPI target identifiers are not one-to-one with current canonical target classifications.
  - 30 missing-current = Item `sourceCategory`, currently null and therefore an expected migration gap.
  - 5 missing-current Moves are the known accepted mapping identities absent from the 547 published
    Move catalog.
  - 1 missing-source Move is current `vise-grip` vs upstream identifier `vice-grip`; no alias was
    auto-adopted because source-key binding remains local/Human authority.
  - 11 factual mismatches = Blissey Base Experience **635 current vs 608 PokéAPI** plus ten
    `makesContact` values that are `true` current vs `false` in the pinned PokéAPI flag relation.
- Post-correction focused PokéAPI tests: **16/16 PASS**.
- Post-correction full serial `@pokenexus/game-data`: **385 PASS / 1 live skipped** across 35 passing
  files / 1 skipped.
- Post-correction package typecheck/lint/build, Worker compatibility dry-run, roadmap check and
  `git diff --check` all PASS.
- No canonical publication, schema-5 runtime enablement, commit, push, merge or deploy occurred.

## Post-ACQUIRE independent QA — 2026-10-03

- Verdict: **TECH READY / ARCH READY**.
- Findings: **P0/P1/P2/P3 = 0/0/0/0**.
- Reviewer independently re-ran focused PokéAPI **16/16**, historical regression **94/94**, full serial
  package **385 PASS / 1 live skipped**, typecheck/lint/build, Worker compatibility, roadmap check and
  `git diff --check`; all passed.
- Reviewer confirmed the real-byte corrections remain adapter/parity-only and do not weaken canonical
  schema constraints, form/mapping authority, runtime fail-closed behavior or external-access boundaries.
- The parity result **4,910 match / 11 mismatch / 35 missing-current / 1 missing-source / 588 unmapped**
  is accepted as classified evidence for TASK-113. These deltas do **not** block this infrastructure
  task, but they remain blockers/gates for any future field promotion or schema-5 publication until
  explicitly resolved and Human-reviewed under SPEC-022.
