# TASK-115 — Schema-5 Runtime Delivery Enablement

## Metadata

- State: DONE
- Review note: implementation/owner validation complete; independent QA final TECH READY `0/0/0/0`; fresh exact-current independent Class-B PM/architecture acceptance re-gate final `ACCEPT`, `P0/P1/P2/P3 = 0/0/0/0`; repository-history integration completed on canonical `main`
- Class: B — runtime implementation inside APPROVED SPEC-002 / SPEC-022 / SPEC-023 architecture
- Owner: Lead Developer
- Owner execution surface: ChatGPT coding agent
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: N/A — no security, destructive migration, persistence-topology or economy trigger
- Auditor execution surface: N/A
- Consultants: N/A — this task adds runtime support for an already-approved immutable data schema and does not change gameplay/economy semantics
- Consultant execution surface(s): N/A
- Specs: APPROVED SPEC-002 / SPEC-022 / SPEC-023
- Related: TASK-006 / TASK-087 / TASK-095 / TASK-112 / TASK-113 / TASK-114
- Branch: `feat/TASK-115-runtime-schema5-cutover`
- Worktree: `.worktrees/TASK-115-runtime-schema5-cutover`
- Human gate: implementation and repository-history integration explicitly authorized/approved on 2026-10-03; production v4 selected-pair activation/rebind, deploy and public enablement remain separate

## Objective

Enable the browser/Worker-safe game-data runtime delivery layer to consume the already-published
`game-data-core-kanto-johto-v4` schema-5 bundle explicitly and fail closed on any unsupported schema,
without changing historical schema-3/schema-4 interpretation or inferring production static-context
compatibility.

## In scope

1. Export the schema-5 manifest/version parser through the runtime-safe package surface.
2. Make runtime manifest dispatch explicit for exactly schema `3`, `4` and `5`.
3. Load schema-5 artifacts through the exact published manifest paths and retain per-artifact hash,
   canonical JSON and record-count verification.
4. Preserve lazy, independently hash-verified provenance/source-inventory access.
5. Prove exact loading of immutable `game-data-core-kanto-johto-v4` / bundle
   `sha256:fc37e5e9acebca805949780e2adb378b7ace8241b7b13ec7689a67d7abf23346`.
6. Preserve schema-3 and schema-4 runtime behavior and reject unknown future schemas before artifact
   loading.
7. Prove Cloudflare Worker compatibility and current API consumer compilation.

## Out of scope

- changing the trusted selected `{gameDataVersion, rulesVersion}` pair for new authoritative operations;
- inferring that an existing v3-bound rules release is compatible with v4;
- publishing a new production-combat or genetics rules release;
- database/persistent-environment migration;
- deploy, public enablement or environment-variable cutover;
- commit, push or merge without a separate repository-history gate.

## Acceptance criteria

- [x] Runtime accepts only schema `3`, `4` and `5`; all other schema values fail closed.
- [x] Exact schema-5 v4 manifest parses and its bundle hash is independently recomputed/verified.
- [x] Exact v4 Species/Move/Learnset/PvE artifacts load and retain descriptor hash/count checks.
- [x] Schema-5 audit artifacts remain lazy and independently hash-verified.
- [x] Historical v1/v2 schema-3 and v3 schema-4 runtime tests remain green.
- [x] Runtime-safe exports do not introduce Node/filesystem dependencies.
- [x] Worker compatibility, relevant API build/typecheck, package tests/lint/build and roadmap/diff checks pass.
- [x] Independent QA reports no unresolved P0/P1.

## Required validation

- focused `runtime-delivery` and runtime-export tests;
- full `@pokenexus/game-data` test/typecheck/lint/build;
- `@pokenexus/game-data test:worker-compat`;
- relevant API typecheck/build;
- schema-5 `sanity:current` / `sanity:compare` remain PASS;
- `pnpm roadmap:generate`, `pnpm roadmap:check`, `git diff --check`.

## Dependencies

- TASK-114 DONE with immutable schema-5 v4 publication integrated in canonical `main`;
- APPROVED SPEC-022/023 schema-5 and immutable-publication contracts;
- existing schema-3/schema-4 runtime delivery implementation.

## Risks / boundaries

Runtime loader support is not equivalent to production selection. Existing production Move/Hunt
authority intentionally binds exact rules versions to earlier game-data versions. TASK-115 must not
weaken those pair checks or alias an old rules release to v4. If production selection of v4 requires a
new immutable rules/data pair, that rebind remains a separately explicit follow-up unless it can be
proven and scoped without changing historical rules identities.

## Owner implementation / validation evidence — 2026-10-03

- Added runtime-safe exports for `GAME_DATA_SCHEMA_V5` / `parseGameDataManifestV5`; no Node/filesystem
  dependency was added to the default/runtime package surface.
- `loadRuntimeGameDataVersion` now dispatches explicitly over exactly schema `3`, `4` and `5` and
  rejects all other schema versions before fetching any artifact shard.
- Schema-5 uses the exact additive v5 manifest parser and exact ten-artifact v5 path map. Bundle hash
  is independently recomputed from the same canonical preimage used by publication; artifacts retain
  canonical JSON, SHA-256 and record-count verification.
- Exact immutable `game-data-core-kanto-johto-v4` runtime load succeeds with bundle
  `sha256:fc37e5e9acebca805949780e2adb378b7ace8241b7b13ec7689a67d7abf23346`, including Species `293`,
  Moves `547`, Learnsets `19,035`, Zone `1`, Hunt `1`, Encounter Definitions `9`, provenance and
  source-inventory lazy loads.
- Focused runtime/schema tests: **16/16 PASS**.
- Full `@pokenexus/game-data` suite: **397/397 PASS + 1 intentional live-ingestion skip** across
  **39 passing files + 1 skipped file**.
- `@pokenexus/game-data` typecheck, lint and build: **PASS**.
- Worker compatibility: **PASS**, Wrangler dry-run upload `38.24 KiB / gzip 8.02 KiB`, no bindings.
- `@pokenexus/api` typecheck and Worker build dry-run: **PASS**, upload `2261.33 KiB / gzip 386.47 KiB`.
- Root lint and root build: **PASS**.
- `sanity:current`: **PASS — 9/9 audits, 10/10 assertions** on exact v4 bundle.
- `sanity:compare` v3→v4: **PASS — 0 catalog changes, 0 new completeness gaps, 0 structural regressions**.
- `roadmap:generate` / `roadmap:check`: **PASS** with `116` tasks on the validated snapshot.
- `git diff --check`: **PASS**.
- Worktree dependencies were materialized only through `pnpm install --offline --frozen-lockfile`:
  `272` reused, `0` downloaded.
- No trusted production pair selection, game-core release identity, database, environment, deploy,
  public enablement, commit, push or merge was changed by TASK-115.

## Independent technical QA — 2026-10-03

- Initial independent reviewer verdict on the exact implementation was **TECH READY** with
  **P0/P1/P2/P3 = `0/0/0/2`**; both findings were documentation-only and corrected immediately:
  1. stale roadmap prose calling TASK-115 `ACTIVE` while canonical state was `REVIEW`;
  2. stale owner-evidence test counts/hash snapshot after the adversarial v5 regression was added.
- Reviewer independently confirmed explicit schema `3/4/5` dispatch, runtime-safe v5 export chain,
  exact immutable v4 bundle/path loading, publisher-equivalent bundle recomputation, artifact
  canonical/hash/count verification, lazy audit descriptor-hash verification, unknown-schema
  rejection before shard fetch and preservation of historical schema-3/schema-4 behavior.
- Reviewer independently reran the focused runtime/index/v5-manifest suite and full package suite on
  the live diff. After the final adversarial test, the validated counts are **16/16 focused** and
  **397/397 full + 1 intentional live-ingestion skip**.
- The adversarial v5 regression explicitly proves rejection of a tampered manifest `bundleHash` and
  tampered Species artifact bytes.
- Reviewer confirmed no production selected-pair/static-context, game-core rules release, database,
  environment, deploy or public-enable change exists in the TASK-115 diff.
- Both documentation P3s are now corrected; `roadmap:generate`, `roadmap:check` and `git diff --check`
  pass on the corrected snapshot.
- Final independent exact-current re-gate: **P0/P1/P2/P3 = `0/0/0/0`, TECH READY**.
- Final reviewer reruns on the corrected live diff: focused **16/16 PASS**, full game-data
  **397/397 PASS + 1 intentional skip**, TypeScript noEmit PASS, changed-file ESLint PASS,
  `roadmap:check` PASS and `git diff --check` PASS.
- Sensitive-scope diff check is empty for `apps/api`, `packages/game-core`, `packages/database`,
  `pnpm-lock.yaml` and package manifests; production selected-pair/rules/database/deploy boundaries
  remain untouched. There are **no blockers**.

## Class-B acceptance — 2026-10-03

- The independent PM/architecture reviewer inspected the TASK-115 architecture and scope before final
  QA. It found **no architecture or product-scope defect** and confirmed no new Class-A spec amendment
  is required for explicit schema-5 runtime-loader support under APPROVED SPEC-022/023.
- Its exact pre-acceptance verdict was `P0/P1/P2/P3 = 0/1/0/0, NOT ACCEPT`, with the **sole P1** being
  process state: owner validation/acceptance evidence and independent QA were not yet recorded.
- The reviewer explicitly recommended: once those checks are clean, **advance to ACCEPTANCE with no
  further architecture change**, while keeping production selected-pair/rebind/deploy/public enablement
  separately gated.
- That sole condition is now satisfied: owner gates are recorded and final independent technical QA is
  **P0/P1/P2/P3 = `0/0/0/0`, TECH READY**. No architecture implementation changed after that review;
  only adversarial runtime tests and documentation/evidence corrections were added.
- A fresh independent exact-current Class-B PM/architecture re-gate then reviewed the final snapshot at
  HEAD `95b7dc1452872d7729e0adaa265ffdcfb5dab263` and returned **P0/P1/P2/P3 = `0/0/0/0`, ACCEPT**.
  It confirmed the DoR metadata is complete, the change remains inside APPROVED SPEC-002/022/023,
  no Class-A amendment is required, and no production selected-pair/rules/database/environment/deploy/
  public-enable scope leaked into the diff.
- Human Owner then explicitly authorized repository-history integration. The accepted snapshot was
  committed as `90b67d8` and merged into canonical `main` as `92905bb`; post-merge focused/full
  game-data, typecheck/lint/build, Worker compatibility, roadmap and diff gates remained green.
- TASK-115 is therefore `DONE`. Production v4 selected-pair/release activation, database/environment
  cutover, deploy and public enablement are not included and remain separately gated.
