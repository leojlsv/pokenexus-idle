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
