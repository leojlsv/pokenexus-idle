# @pokenexus/game-data

Versioned static Pokémon factual data for PokeNexus.

## Consumer entrypoints

- `@pokenexus/game-data` / `@pokenexus/game-data/runtime`: Worker/browser-safe schemas, validators,
  immutable-version resolution and lazy catalog readers.
- `@pokenexus/game-data/node`: Node-only deterministic serialization and publication/loading APIs.
- crawler/maintenance internals remain package-private and execute only through controlled
  maintenance tooling.

Runtime code must not import the Node entrypoint. The automated Wrangler compatibility smoke uses
the realtime Worker target without `nodejs_compat` to enforce this boundary.

## Delivery

Published versions are logical bundles composed of individually hashed catalog artifacts. Runtime
consumers first resolve the manifest and then request only required artifacts; Learnsets and audit
metadata are not eagerly loaded with the core catalogs. Published historical directories are not
included in the package distribution.

Canonical repository evidence currently includes the immutable original
`game-data-core-kanto-johto-v1` and the Human-approved corrected
`game-data-core-kanto-johto-v2`; consumers must always request an explicit version rather than
assuming an implicit latest bundle.

The durable delivery/retention contract is documented in
`docs/architecture/static-game-data-delivery.md`.

## Maintenance

The controlled ingestion command is Node-only. Build the package, then invoke the compiled CLI
directly; do not pass a literal `--` through the package-script wrapper:

```text
corepack pnpm --filter @pokenexus/game-data build
node packages/game-data/dist/maintenance-cli.js <profile> <output> <cache> <mode>
```

Routine CI does not perform live upstream crawling. Provider fetches remain explicit maintenance
operations governed by SPEC-002 source policy.

## Repository sanity harness

The repository includes a deterministic static-data sanity harness under
`scripts/game-data-sanity/`. It audits published data without crawling providers or mutating an
immutable publication. The current checks cover catalog/reference closure, Species/Move identity
and domain integrity, Learnset normalization/context parity, forms, provenance reuse, semantic-null
telemetry, and the complete type-effectiveness matrix.

Before those semantic audits run, the harness authenticates the materialized publication itself:
canonical manifest bytes, supported schema/normalizer versions, the exact seven-artifact set/order,
all manifest catalog counts against artifact record counts, artifact hashes,
provenance/source-inventory hashes and canonical bytes, and the release `bundleHash`. A corrupted,
incompatible, or partially copied publication therefore fails before it can produce a semantic PASS.

Publication integrity is enforced at two complementary layers:

- `validateCandidatePublicationSanity(...)` is part of `validatePublicationReadiness(...)`.
  Therefore maintenance validation, pre-Human review-stage construction, `stageCandidate(...)`,
  and the final `publishStagedCandidate(...)` revalidation all use the same candidate-level sanity
  gate before atomic publication.
- the repository harness validates already materialized immutable bundles and compares the newest
  publication with its immediate predecessor for regressions that are meaningful across versions.

The package tests include dedicated coverage for both layers: candidate sanity/staging rejection and
the repository harness/comparator, including stale-report cleanup and automatic current/previous
selection.

Run the current publication gate through the package script:

```text
corepack pnpm --filter @pokenexus/game-data sanity:current
```

Compare the newest repository publication with the immediately preceding publication:

```text
corepack pnpm --filter @pokenexus/game-data sanity:compare
```

`sanity:current` and `sanity:compare` discover repository publications from their manifests and
`publishedAt` metadata. They are maintenance/CI conveniences only; runtime consumers still resolve
an explicit `gameDataVersion` and never depend on an implicit latest version.

For another immutable publication, invoke the runner directly with an explicit repository-relative
or absolute directory:

```text
node scripts/game-data-sanity/run-sanity.cjs --game-data-dir packages/game-data/published/<candidate-directory>
```

To compare two publications:

```text
node scripts/game-data-sanity/run-sanity.cjs --game-data-dir packages/game-data/published/<candidate-directory> --compare-to packages/game-data/published/<baseline-directory>
```

The comparison treats catalog-size and coverage changes as factual deltas rather than failures by
themselves. It separately reports new/resolved completeness gaps, structural
regressions/improvements, residue/conflict deltas, semantic-null drift, and Learnset coverage
changes. An older baseline may fail the current standalone sanity standard and can still be used as
historical comparison evidence; the candidate fails comparison only when the comparator detects a
new completeness gap or structural regression.

Generated evidence is local-only under `.tmp-game-data-sanity/`:

- `sanity-report.json` / `sanity-report.txt` for the candidate publication;
- `sanity-compare-report.json` / `sanity-compare-report.txt` when `--compare-to` is supplied.

The runner clears prior audit, candidate, and comparison evidence before parsing arguments or
resolving a publication, and each child audit also deletes its own prior JSON before execution. A
failed run therefore cannot inherit a previous PASS artifact. CI runs the package tests first, then
both the automatically resolved current sanity gate and current-vs-previous comparison. Baseline
comparison is also fail-closed: the candidate report is removed from the baseline child-process slot
before execution and restored afterward, so a baseline that fails before producing its own report
cannot be mistaken for the candidate.
