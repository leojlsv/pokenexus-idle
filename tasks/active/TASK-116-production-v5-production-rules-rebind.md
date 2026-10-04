# TASK-116 — Exact Production Rules Rebind for Game Data v5

## Metadata

- State: ACCEPTANCE
- Class: B — immutable authority/version rebind inside APPROVED SPEC-002 / SPEC-012 / SPEC-014 semantics
- Owner: Lead Developer
- Owner execution surface: ChatGPT coding agent
- Reviewer: independent QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT delegated reviewer
- Auditor: independent architecture/integrity reviewer
- Auditor execution surface: fresh independent ChatGPT delegated reviewer
- Specs: APPROVED SPEC-002 / SPEC-012 / SPEC-014 plus accepted TASK-095/TASK-097 versioning precedent
- Related: TASK-095/097/107/109/114/115
- Branch: `feat/TASK-116-production-v5-rebind`
- Worktree: `.worktrees/TASK-116-production-v5-rebind`
- Human gate: implementation/pair-rebind explicitly authorized on `2026-10-03T15:06:57Z`; repository-history publication remains separate

## Objective

Materialize an explicit immutable production rules release for the already-published
`game-data-core-kanto-johto-v5` / `sha256:565cdd360c1b29dc3607696299244279a8d0c3f488d4544c41c62ed47592f782`
without mutating or reinterpreting any retained v2/v3 rules identity.

The new release preserves the accepted production Move/Ability/selectability semantics and the accepted
Genetic derived-stat formula exactly. It exists only to make the new `{gameDataVersion, rulesVersion}` pair
explicit and fail-closed, following TASK-095 rather than inferring compatibility from byte-identical factual
catalogs.

## In scope

1. Add a new immutable production Move support/profile + combat catalog release bound exactly to v5.
2. Revalidate the complete production support universe against exact v5 factual artifacts.
3. Add a new immutable Genetic combat-rules identity with the same accepted derived-stat semantics.
4. Preserve every existing v1/v2 production support/catalog and `combat-rules-genetics-v1` identity unchanged.
5. Add exact API Move authority descriptors and compatibility mapping for v5 + new Genetic rulesVersion.
6. Extend Genetic-aware runtime recognition to both retained v1 and the new release without broad fallback.
7. Prove retained v3 + Genetic v1 still works and cross-pairs fail before authoritative fetch/write.
8. Prove bootstrap, Hunt, capture and Reward paths use identical Genetic semantics under the new v5 pair.

## Out of scope

- changing Move/Ability support, target/cooldown/effect/selectability semantics;
- changing the Genetic formula, IV/Profile/Grade/Shiny rules or management-first cadence rules;
- mutating historical support/catalog/rules releases;
- changing Wilds v5 publication bytes;
- provisioning Cloudflare/PostgreSQL/Hyperdrive/domain/email infrastructure;
- applying persistent migrations, deploy or public enablement before their material infrastructure exists;
- commit/push/merge without a separate repository-history gate.

## Acceptance criteria

- [x] New production support/profile/catalog binds exactly to v5 + exact bundle hash.
- [x] Support semantics remain exactly `27 simple / 18 authored / 408 unsupported / 147 inactive`.
- [x] New Genetic rules identity preserves the accepted Genetic derived-stat formula byte/behavior semantics.
- [x] Existing v2/v3 production and Genetic v1 releases remain unchanged and replayable.
- [x] Exact v5 + new Genetic pair resolves for new operations; v5 + Genetic v1 and v3 + new Genetic reject.
- [x] Wrong bundle/profile/catalog identities and arbitrary rules aliases fail closed.
- [x] Bootstrap/Hunt/capture/reward Genetic-mode behavior recognizes only the explicit retained/new identities.
- [x] Relevant game-core/API/game-data/package/Worker tests, typecheck/lint/build and roadmap/diff checks pass.
- [x] Independent QA and architecture/integrity acceptance report no unresolved P0/P1.

## Risks / boundaries

The v4 and v5 combat-relevant factual artifacts are byte-identical, but SPEC-002/TASK-095 prohibit inferred
compatibility. Repointing `combat-rules-genetics-v1` or production catalog v2 to v5 would rewrite immutable
history. Any discovered gameplay-semantic drift stops this task and requires a new Class-A decision instead
of being hidden inside the rebind.

## Authorization / current evidence

- Human Owner explicitly authorized production `pair/rebind` on `2026-10-03T15:06:57Z`.
- Immutable v5 is already published and repository-integrated under TASK-109.
- Read-only feasibility review confirmed v4/v5 Species, Moves, Abilities, Types and Learnsets are exact-byte
  matches; only authored PvE Encounter content changed.
- Current runtime correctly rejects v5 + `combat-rules-genetics-v1`, proving the historical binding is still
  fail-closed and must not be edited in place.

## Owner implementation / validation evidence — 2026-10-03

- New immutable production profile `spec-012-production-move-support-v3` is bound only to
  `game-data-core-kanto-johto-v5` + bundle
  `sha256:565cdd360c1b29dc3607696299244279a8d0c3f488d4544c41c62ed47592f782`.
- Exact support-profile bytes: **230244 bytes**, SHA-256
  `sha256:fa117277ffccfcbf9092c0184dd3305d4b3b76ea6e2ab018650d92afc0fcb615`.
- New immutable production catalog identity: `pokenexus.production-combat-rule-catalog.v3`, canonical hash
  `sha256:f3332f2f3fe6019647d68ab918e6338d0bb0721f7c838137976b878712a074c6`.
- New Genetic identity: `combat-rules-genetics-v2`, semantics hash
  `sha256:266b36028ab0410e698d5cda75ff41b84564c5eb2e4b9a515498f4db5af3a53e`.
  Its derived-stat payload is exactly equal to Genetic v1; the new identity exists only for immutable v5 binding.
- API production authority now admits exact v5 + Genetic v2 and retains v3 + Genetic v1. Cross-pairs, descriptor
  swaps, aliases and wrong hashes fail before authoritative game-data fetch.
- Genetic-aware runtime checks are explicit over the retained/new Genetic release set; bootstrap and Solo Hunt have
  direct v2 regression coverage, while full capture/reward/Hunt suites remain green.
- Deterministic review receipt: `packages/game-data/reviews/task-116/production-combat-v5-rebind.json`, exact hash
  `sha256:b2d1a1ce5e3631b3c7a52752f4d492217a9354fe3ebe43333f97bfe20bb5fcae`. Re-running the generator reproduced the
  same hash. Coverage rows: **3274**, exact retained-row match; all six Wilds Level-1 Species remain progress-capable.
- Canonical package gates: game-core **249/249 PASS**; API **186/186 PASS**; game-data **406/406 PASS + 1 intentional
  live-ingestion skip**; TASK-116 generator **1/1 PASS**. Focused rebind/Genetic gates: game-core **79/79 PASS** and
  API **61/61 PASS**.
- game-core/API/game-data lint, typecheck and build PASS. API Wrangler dry-run PASS (`2479.55 KiB`, gzip `415.55 KiB`)
  and intentionally reports no bindings because production environment provisioning is outside TASK-116.
- `roadmap:generate`, `roadmap:check` and `git diff --check` PASS. `packages/game-data/published` remains untouched.
- Persistent migration, remote deploy and public enablement have **not** run: production PostgreSQL, Hyperdrive,
  Cloudflare app/domain/secrets/email topology and accepted TASK-079/080/086 release infrastructure are absent.

## Independent acceptance evidence — 2026-10-03

- Fresh independent TECH/QA exact-current re-gate: **P0/P1/P2/P3 = 0/0/0/0 — TECH READY**.
  It independently reproduced focused game-core **79/79 PASS** and focused API **61/61 PASS**, recomputed the
  support-v3 file hash and TASK-116 receipt hash, verified the literal Genetic v1/v2 whitelist, exact v5 + Genetic v2
  resolution, pre-fetch cross-pair rejection, full four-field production-catalog identity, retained v1/v2 support
  immutability, and no published game-data mutation.
- Fresh independent architecture/integrity Class-B acceptance: **P0/P1/P2/P3 = 0/0/0/0 — ACCEPT**.
  It verified TASK-095 additive-version precedent, no reinterpretation of production v2/v3 or Genetic v1, identical
  Genetic derived-stat semantics under the new identity, fail-closed static-pair/catalog binding, retained replay/history,
  no gameplay/economy drift, and no deployment/infrastructure decisions smuggled into TASK-116.
- A later root `pnpm test` run under workspace-wide parallel load hit only three pre-existing 5-second game-data timeout
  ceilings. The exact affected files were immediately rerun in isolation with one worker and a 30-second ceiling:
  `src/pve-publication-sanity.test.ts` + `src/sanity-harness.test.ts` = **15/15 PASS**. The canonical isolated full
  game-data suite remains **406/406 PASS + 1 intentional live-ingestion skip**.
- Production-environment recheck after acceptance still finds no administrative PostgreSQL URL, no `pokenexus-api`
  Worker in either available Cloudflare account, no Hyperdrive configs and no Pages projects. Therefore the Human-authorized
  persistent migration/deploy/public-enable gates remain materially blocked by absent infrastructure, not by review or
  permission.
