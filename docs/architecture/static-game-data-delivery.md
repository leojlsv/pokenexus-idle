# Static Game-Data Delivery and Retention

This document defines the concrete delivery/retention policy for immutable SPEC-002 game-data
versions. It does not change the logical bundle contract or `schemaVersion`.

## Delivery boundary

`@pokenexus/game-data` is the runtime-safe consumer package. It contains schema/validation and a
lazy reader contract; it does **not** package `packages/game-data/published/**`. Node-only
publication/maintenance APIs are exposed separately from `@pokenexus/game-data/node`.

Published data is delivered as immutable static objects under the same deterministic version
directory already used by the canonical publisher:

```text
game-data/
  version-<sha256(NFC(gameDataVersion))>/
    manifest.json
    catalogs/species.json
    catalogs/moves.json
    catalogs/types.json
    catalogs/abilities.json
    catalogs/items.json
    catalogs/learnsets.json
    reference-data/current-type-effectiveness.json
    provenance.json
    source-inventory.json
```

Production storage is an immutable object-store/CDN namespace (the architecture target is
Cloudflare R2/CDN). Application bundles contain code only. A deployment may expose an HTTP/CDN
reader or implement the same `RuntimeGameDataReader` interface directly over an R2 binding.

## Lazy consumption

Runtime resolution is two-stage:

1. `loadRuntimeGameDataVersion(reader, gameDataVersion)` derives the deterministic version prefix,
   loads only `manifest.json`, checks canonical JSON and verifies the manifest's `bundleHash`.
2. `loadRuntimeGameDataArtifact(...)` fetches only the requested logical catalog shard and verifies
   its descriptor hash/record count before parsing it. `catalogs/learnsets` is therefore not loaded
   by consumers that do not need Learnsets.

`provenance.json` and `source-inventory.json` are audit/verification metadata and remain separately
lazy through `loadRuntimeAuditArtifact(...)`; normal gameplay consumers do not fetch them.

The current schema uses one Learnset artifact. Future physical subdivision by generation/game is
permitted by SPEC-002, but must preserve the same logical content and deterministic manifest
semantics. It is not required merely to keep provenance or Learnsets out of unrelated runtime
paths.

## Retention policy

- Every published `gameDataVersion` is write-once. Correction publishes a new version; existing
  objects are never overwritten.
- Any version referenced by authoritative battle/reward/checkpoint/persistence history remains
  present in durable object storage and resolvable by its exact `gameDataVersion`.
- Deprecation affects eligibility for new operations only; it does not remove historical objects.
- Physical deletion is exceptional maintenance, outside normal publication, and requires proof
  that no authoritative reference remains, plus the separately governed maintenance approval.
- CDN cache eviction is allowed because R2/durable origin retention is authoritative; deleting the
  durable origin object is not cache eviction.
- Runtime/application deployments must not copy all historical version directories into Worker or
  web bundles. They resolve immutable objects on demand from the delivery store.
- Repository copies under `packages/game-data/published/` are canonical publication evidence and
  are not included in the package distribution (`files` remains `dist` only).

## Required gates

- game-data package tests validate lazy shard loading plus immutable v1 backward resolution and
  corrected v2 resolution;
- `test:worker-compat` bundles the runtime entrypoint with Wrangler under the strict realtime
  Worker target (no `nodejs_compat`);
- CI runs the Worker compatibility gate and production dependency audit;
- live provider crawling remains opt-in maintenance and is never a routine CI prerequisite.
