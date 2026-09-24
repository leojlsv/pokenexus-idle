# TASK-095 — Exact Production Combat Rebind for Game Data v3

## Metadata

- State: DONE
- Class: B
- Owner: Lead Developer
- Owner execution surface: ChatGPT implementation worker after activation
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: N/A
- Auditor execution surface: N/A
- Consultants: N/A
- Consultant execution surface(s): N/A
- Human gate: no new product/semantic gate while APPROVED SPEC-012 behavior is unchanged;
  repository/history integration remains separately gated
- Specs:
  - docs/specs/SPEC-002-static-game-data-and-versioning.md
  - docs/specs/SPEC-012-production-move-ability-rule-content.md
- Related specs: SPEC-010, SPEC-011, SPEC-013
- Related tasks: TASK-025, TASK-034, TASK-035, TASK-089, TASK-090, TASK-091
- Branch: fix/TASK-095-post-integration-byte-hardening
- Worktree: .worktrees/TASK-095-post-integration-byte-hardening
- Activation constraint: do not move READY → ACTIVE until TASK-034 repository/history integration is
  complete and canonical main contains the immutable v3 publication.

## Objective

Publish a second immutable production-combat support/catalog release bound exactly to the
Human-approved TASK-034 static-data release:

- gameDataVersion = game-data-core-kanto-johto-v3
- gameDataBundleHash =
  sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559

The release must preserve APPROVED SPEC-012 executable semantics exactly while adding an explicit
accepted gameDataVersion + rulesVersion pair for v3. Compatibility must not be inferred from the fact
that v3 retains the seven v2 factual artifacts byte-for-byte.

## Accepted baseline

- TASK-091 v1 production support/catalog release remains immutable and bound exactly to
  game-data-core-kanto-johto-v2 /
  sha256:fc4ecaacb486b496ca2539666201cf73ace40b6ff352f210783a6fadedf052b4.
- Existing support universe remains:
  - 453 level-up MoveIds;
  - 27 executable-simple;
  - 18 executable-authored;
  - 408 unsupported;
  - 147 Abilities, all inactive-by-policy.
- Existing target, cooldown, selectability, authored MoveRule/EffectRule and inactive-Ability semantics
  are frozen by SPEC-012.
- TASK-034 published schema-v4 static data as immutable game-data-core-kanto-johto-v3. Its factual
  Species/Move/Type/Ability/Item/Learnset/type-effectiveness artifacts are retained byte-identically
  from v2, but SPEC-002 still requires explicit exact-pair compatibility.
- TASK-035 may not perform authoritative Solo Hunt operations against v3 until TASK-095 is DONE.

## Scope

### 1. Retained multi-release production catalog architecture

- Generalize production-combat catalog resolution to retain multiple immutable releases.
- Preserve every existing v1 support profile/catalog artifact identity, byte, hash and exact v2 binding.
- Do not mutate or reinterpret the existing v1 release in place.
- Resolve production artifacts by exact artifact ID + content hash; no latest/current fallback.

### 2. New v3-bound support/catalog release

- Materialize a new immutable support profile/catalog release bound to exact TASK-034 v3
  gameDataVersion + bundleHash.
- Revalidate the complete 453 Move / 147 Ability support universe from the v3 factual artifacts.
- Require the classification inventory to remain exactly 27 / 18 / 408 and all 147 Abilities
  inactive-by-policy.
- Require every factual snapshot used by executable rules to match v3 exactly.
- Produce deterministic canonical identities/content hashes for the new support profile and catalog.
- If any support disposition, rule semantics, target policy, cooldown policy, selectability policy or
  Ability policy would differ, stop and escalate to Class A / SPEC-012 instead of changing it here.

### 3. New immutable rules release and exact compatibility pair

- Create a new immutable rules-release descriptor/version referencing the new v3-bound support/catalog
  artifacts while retaining the old rules release unchanged.
- Add only an explicit accepted v3 + newRulesVersion pair for new authoritative use.
- Preserve the existing v2 + oldRulesVersion pair for retained operations and replay.
- Reject cross-pairs, wrong bundle hashes, wrong support/catalog identities and missing releases
  fail-closed.
- Do not make productionSelectability silently pair-specific under the old rulesVersion.

### 4. Runtime/API authority composition

- Extend exact production catalog resolvers and release configuration to resolve both retained releases.
- Preserve exact gameDataVersion, rulesVersion, support-profile artifact/hash and combat-catalog
  artifact/hash checks in Move authority.
- No fallback to version ordering, publication time, latest/current or factual-subcatalog equality.
- Preserve historical Player State Move operations against the v2 pair.

### 5. Coverage and TASK-034 admission evidence

- Regenerate deterministic all-Species/all-level production coverage under the v3 binding.
- Confirm the support inventory remains semantically equivalent to TASK-091.
- Reconfirm TASK-034 Verdant Edge admissions:
  - Rattata L3/L4/L5: one progress-capable executable choice;
  - Spearow L3/L4/L5: one;
  - Hoothoot L3/L4/L5: two.
- Zero-progress-capable regressions block acceptance.

## Out of scope

- any new Move/Ability support;
- changing the 27/18/408 or 147 inactive classifications;
- new target/cooldown/effect/selectability semantics;
- Hunt orchestration, encounter RNG or battle policy — TASK-035;
- changing TASK-034 Zone/Hunt/Encounter content;
- mutating game-data-core-kanto-johto-v2 or its production catalog release;
- inferred compatibility between v2 and v3;
- Git/history mutation before separate authorization.

## Acceptance criteria

- [x] Existing TASK-091 v1 support profile/catalog bytes and hashes are unchanged.
- [x] Existing exact v2 data/rules pair still resolves and replays.
- [x] New immutable support/profile catalog binds exactly to game-data-core-kanto-johto-v3 + bundle
      sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559.
- [x] Wrong v3 version/hash, wrong profile/catalog identity/hash and unlisted cross-pairs fail closed.
- [x] v3 support universe is exactly 453 Moves / 147 Abilities with unchanged
      27 simple / 18 authored / 408 unsupported / 147 inactive-by-policy.
- [x] New profile/catalog identities and canonical hashes are deterministic and immutable.
- [x] A new immutable rules release references the new v3-bound artifacts; old rules release remains
      unchanged.
- [x] Exact v3 + newRulesVersion compatibility is explicit; v2 + oldRulesVersion remains retained.
- [x] All-293/all-level coverage/playability evidence is regenerated for v3 with no semantic drift.
- [x] TASK-034 Verdant Edge nine admitted Species/Level slots retain their accepted progress-capable
      counts.
- [x] No latest/current fallback or inferred factual-subcatalog compatibility is introduced.
- [x] Relevant game-core/API/integration/Worker/package/workspace tests pass.
- [x] Independent QA has no unresolved P0/P1.
- [x] Independent Class-B PM/Architecture acceptance confirms no SPEC-012 semantic drift.

## Validation / tests

At minimum:

    corepack pnpm --filter @pokenexus/game-core test
    corepack pnpm --filter @pokenexus/game-core typecheck
    corepack pnpm --filter @pokenexus/game-core build
    corepack pnpm --filter @pokenexus/api test
    corepack pnpm --filter @pokenexus/api typecheck
    corepack pnpm --filter @pokenexus/api build
    corepack pnpm roadmap:check
    git diff --check

Also prove:

- exact old v1 support/profile/catalog bytes and hashes remain unchanged;
- old v2 pair succeeds;
- exact v3 pair succeeds;
- v2 rules + v3 data and v3 rules + v2 data both reject;
- modified bundle/profile/catalog hashes reject;
- both exact catalog releases resolve by immutable identity;
- support counts/rule semantics are identical across releases except for immutable binding metadata;
- TASK-034 playability evidence remains valid under the v3-bound release.

## Dependencies

- TASK-006 / SPEC-002 — DONE / APPROVED.
- TASK-025 / SPEC-011 — DONE / APPROVED.
- TASK-034 — Human-approved v3 publication complete locally; repository/history integration required
  before activation.
- TASK-090 / SPEC-012 — DONE / APPROVED.
- TASK-091 — DONE; retained v1 production support/catalog release.

## Risks / irreversible actions

- Reusing the old rules release against v3 would create inferred compatibility and violate SPEC-002.
- Mutating the old support profile/catalog would break authoritative replay/history.
- A superficially identical factual catalog does not authorize a new pair without an explicit immutable
  release.
- Any discovered semantic support difference converts this from Class B rebind work into Class A
  SPEC-012 revision.
- Repository/history completion is separately gated.

## Expected files / boundaries

Likely:

    tasks/active/TASK-095-production-combat-v3-rebind.md
    packages/game-core/src/production-combat-rules.ts
    packages/game-core/src/production-combat-rules.test.ts
    packages/game-core/src/production-move-support-v2.json
    apps/api/src/moves/context.ts
    apps/api/src/moves/context.test.ts
    apps/api/src/player/runtime.ts
    apps/api/src/player/runtime.test.ts
    apps/api/integration/**
    docs/project/PROJECT_ROADMAP.md
    docs/project/PROJECT_ROADMAP.html

## READY basis

The exact v3 data identity, retained v2 production release, scope, owner, reviewer, tests and
fail-closed constraints are fully known. TASK-095 is therefore READY as a task definition, but it must
remain inactive until TASK-034 is integrated into canonical repository history so its own worktree can
start from the exact published v3 bytes without copying unintegrated state.

## Current execution state

TASK-095 is reopened in `FIX` for a bounded post-integration packaging corrective. The accepted
technical implementation remains `f482904 feat(game-core): rebind production combat to game data v3`;
no Move/Ability/selectability semantics are being changed.

The defect is repository materialization only: the accepted v2 source payload is `230244` bytes /
`sha256:6a578d7408c79b7984b5b6640be42dbbb43459f859ffe31ce79880d72d159b57`, but the blob stored by
`f482904`/canonical `main` was normalized to LF at `224537` bytes /
`sha256:852e386633f7e2470f1d310ff1cab77e7df0d7da7cc4d2fe311adf37fb2564e7`. The original accepted
TASK-095 worktree retained the correct mixed-EOL payload only in its working tree because the path was
still governed by `text=auto eol=lf`.

The corrective scope is intentionally narrow:

- mark `packages/game-core/src/production-move-support-v2.json` as `-text whitespace=cr-at-eol`,
  matching the byte-immutable treatment already used by the retained v1 support companions;
- restore exactly the accepted `230244`-byte v2 payload and prove the Git index/blob preserves its
  exact SHA-256;
- prove a fresh materialization/build sees the accepted v2 bytes and still passes the existing
  postbuild exact-byte guard;
- retain the already-correct canonical `rulesVersion -> productionSelectability` binding and its
  descriptor-swap/cross-pair/alias regressions unchanged;
- make no TASK-035, SPEC-012, gameplay, content, API contract or product-semantic change.

TASK-035 remains externally blocked from lifecycle integration until this corrective reaches the
required review/acceptance and repository-history gates.

Post-integration corrective closure: the accepted byte-hardening snapshot was committed as
`de75e1a fix(game-core): preserve production support v2 bytes`, published on
`fix/TASK-095-post-integration-byte-hardening`, and fast-forward integrated into canonical `main` under
the Human Owner authorization recorded below. Canonical `main` now materializes
`packages/game-core/src/production-move-support-v2.json` as exactly `230244` bytes /
`sha256:6a578d7408c79b7984b5b6640be42dbbb43459f859ffe31ce79880d72d159b57`; `git ls-files --eol`
reports `attr/-text`, and the canonical game-core postbuild exact-byte guard passes with retained v1
`1462b33b35e38224b505240dbf5205104e98dae1310d0bc630e2aa02fb31879e` plus accepted v2 hash.
TASK-095 is therefore DONE again and no longer blocks TASK-035.

## REVIEW evidence

- Retained support profile remains byte-identical across approved docs, runtime source and built output:
  `230244` bytes / `sha256:1462b33b35e38224b505240dbf5205104e98dae1310d0bc630e2aa02fb31879e`.
- New v3-bound support profile is byte-identical across runtime source and built output:
  `230244` bytes / `sha256:6a578d7408c79b7984b5b6640be42dbbb43459f859ffe31ce79880d72d159b57`.
- Retained catalog remains `pokenexus.production-combat-rule-catalog.v1` /
  `sha256:dead91de25034fb9dbbb36856a4aad4df164074803c357d2c9e00dd3bc7dd7ce`, exactly bound to
  `game-data-core-kanto-johto-v2` /
  `sha256:fc4ecaacb486b496ca2539666201cf73ace40b6ff352f210783a6fadedf052b4`.
- New catalog is `pokenexus.production-combat-rule-catalog.v2` /
  `sha256:6f58481ff9abe468cd12a760f05177ac6f2c322d9308fedab6ca53784010287a`, exactly bound to
  `game-data-core-kanto-johto-v3` /
  `sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559`.
- The rulesVersion authority is explicit and immutable: retained v2 uses catalog artifact `.v1`; v3
  uses catalog artifact `.v2`. Runtime pair authority contains only those two exact pairs, and the
  production catalog resolver keys the complete support-profile ID/hash + catalog ID/hash identity.
- Production rules authority additionally fails closed against configuration aliasing: any rules
  descriptor carrying `productionSelectability` must use a `rulesVersion` equal to its combat-rule
  catalog artifact ID; canonical `.v1` / `.v2` rulesVersions must exactly match their frozen release
  descriptors; the loader reapplies that invariant after rules resolution; and canonical
  `.v1 -> game-data-v2` / `.v2 -> game-data-v3` binding is enforced before game-data authority or
  fetch. Explicit cross-pairs, descriptor swaps and arbitrary production rules aliases all fail
  before fetch/write.
- New deterministic revalidation receipt:
  `packages/game-data/reviews/task-095/production-combat-v3-rebind.json`, `4099` bytes,
  `sha256:a918974974281852e3cf31736e6204b73faa96eaac8dd25180e91b6a3fea1bc5`.
  It records 293 Species/forms, 3274 all-level threshold rows and coverage-row hash
  `sha256:ea4013853e925618bd9492f5df76046848292af77f9e3e532aaeab010f3caa39`; the rows are exactly
  equal to retained v2 coverage. Verdant Edge remains Rattata L3/L4/L5 = `1`, Spearow L3/L4/L5 =
  `1`, Hoothoot L3/L4/L5 = `2` progress-capable choices, with no admitted zero-progress slot.
- Support inventory revalidates exactly as 453 Moves (`27` executable-simple / `18`
  executable-authored / `408` unsupported) and 147 Abilities (`147` inactive-by-policy).
- Real disposable `postgres:17-alpine` validation on `pokenexus_test_task095`: Player State PostgreSQL
  `4/4 PASS`; full API integration `35/35 PASS`. The production path proves retained v2 + old rules
  succeeds, exact v3 + new rules succeeds, unsupported Move stays `422` without mutation, v3 + old
  rules returns `503 authority_unavailable` before game-data fetch/write, explicitly listed
  cross-pairs fail before fetch/write, descriptor swaps fail before fetch/write, arbitrary
  production-rules aliases fail before fetch/write, and a wrong production descriptor also returns
  `503` before fetch/write.
- Workspace gates PASS on the REVIEW snapshot: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
  `roadmap:check`, `git diff --check`; game-core `288/288`, game-data `365/365` plus one intentional
  live-ingestion skip, API unit `103/103`; focused API context/runtime `22/22`; Wrangler `4.136.1`
  API build dry-run and
  `test:worker-compat` PASS.
- Corrective independent review found and closed three authority/version hardening gaps before
  acceptance: descriptor swapping under a known production rulesVersion, explicitly listed
  production cross-pairs reaching game-data resolution, and an arbitrary rulesVersion alias reusing a
  production catalog descriptor. All three now have adversarial unit/runtime/PostgreSQL coverage and
  fail closed before game-data fetch/write.
- Final independent QA re-gate on tracked diff
  `sha256:c1c3a68f88d1aea0760ecf76e0693afe77a3af777856ff5d2a28beb7b74880fa`:
  **READY — P0/P1/P2/P3 = 0/0/0/0**.
- Final independent Class-B PM/Architecture re-gate on the same diff:
  **ACCEPT — no architectural blockers**. It confirms no SPEC-012 semantic drift and no Class-A
  escalation; the corrective remains Class-B authority/version hardening.
- No new Human semantic gate is required while SPEC-012 behavior remains unchanged.
  Repository/history completion was separately authorized by the Human Owner and completed.

## Repository/history authorization

- Authorized by: Human Owner
- Authorized at: `2026-09-24T08:51:53Z`
- Human response: `APROVADO`
- Authorization scope: commit the accepted TASK-095 technical snapshot, fast-forward integrate it into
  canonical `main`, complete TASK-095 lifecycle/history closure, and push the resulting canonical
  history. No new product/semantic decision was authorized or required.
- Accepted technical commit: `f482904 feat(game-core): rebind production combat to game data v3`.

## Post-integration byte-materialization corrective

- Corrective branch/worktree: `fix/TASK-095-post-integration-byte-hardening` /
  `.worktrees/TASK-095-post-integration-byte-hardening`.
- Classification remains Class B hardening because no accepted combat/product semantics change.
- The original TASK-095 repository/history authorization closed the original accepted snapshot only;
  it is not treated as blanket authorization for this new corrective commit/push/merge sequence.
- Corrective implementation/review is complete; new repository-history publication remains a
  separate Human Owner gate for this accepted corrective snapshot.
- Root cause reproduced on canonical `main` `6383d12`: `@pokenexus/game-core` postbuild fails because
  source v2 materializes as `224537` bytes / `sha256:852e386633f7e2470f1d310ff1cab77e7df0d7da7cc4d2fe311adf37fb2564e7`
  while the immutable guard requires `6a578d7408c79b7984b5b6640be42dbbb43459f859ffe31ce79880d72d159b57`.
- Corrective staged Git blob: `230244` bytes /
  `sha256:6a578d7408c79b7984b5b6640be42dbbb43459f859ffe31ce79880d72d159b57`.
- `git check-attr --cached` reports `text: unset` and `whitespace: cr-at-eol`; staged-vs-HEAD semantic
  JSON content is unchanged apart from byte/EOL preservation.
- Index materialization via `git checkout-index` reproduces exactly `230244` bytes /
  `sha256:6a578d7408c79b7984b5b6640be42dbbb43459f859ffe31ce79880d72d159b57`.
- Independent QA additionally verified `git cat-file --filters` under `core.autocrlf=false`, `true`
  and `input`; all three materialize the same accepted 230244-byte payload.
- Owner gates on the corrective snapshot: game-core build/postbuild PASS with v1
  `1462b33b35e38224b505240dbf5205104e98dae1310d0bc630e2aa02fb31879e` and accepted v2 hash;
  game-core **288/288**; API context/runtime **22/22**; API full **103/103**; Worker compatibility PASS;
  workspace lint/typecheck/test/build PASS with game-data **365/365 + 1 intentional skip**;
  roadmap check and staged/working `git diff --check` PASS.
- Final independent corrective QA: **READY — P0/P1/P2/P3 = 0/0/0/0**. No hidden cross-platform EOL
  materialization issue found; canonical descriptor-swap/cross-pair/production-alias protections remain
  present and unchanged.
- Final independent corrective Class-B architecture/acceptance: **ACCEPT — P0/P1/P2/P3 = 0/0/0/0**.
  No SPEC-012 semantic drift and no Class-A escalation trigger; TASK-035 remains blocked until this
  accepted corrective is integrated into canonical repository history.
- Corrective repository/history authorization granted by the Human Owner via explicit `autorizado` at
  **2026-09-24T14:20:43Z**. Authorization scope is this accepted
  `fix/TASK-095-post-integration-byte-hardening` corrective: commit, publish branch, integrate into
  canonical `main`, validate the canonical materialization, and close the corrective lifecycle if the
  validated integrated bytes/gates remain exact.
