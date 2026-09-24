# TASK-095 — Exact Production Combat Rebind for Game Data v3

## Metadata

- State: READY
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
- Planned branch: feat/TASK-095-production-combat-v3-rebind
- Planned worktree: .worktrees/TASK-095-production-combat-v3-rebind
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

- [ ] Existing TASK-091 v1 support profile/catalog bytes and hashes are unchanged.
- [ ] Existing exact v2 data/rules pair still resolves and replays.
- [ ] New immutable support/profile catalog binds exactly to game-data-core-kanto-johto-v3 + bundle
      sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559.
- [ ] Wrong v3 version/hash, wrong profile/catalog identity/hash and unlisted cross-pairs fail closed.
- [ ] v3 support universe is exactly 453 Moves / 147 Abilities with unchanged
      27 simple / 18 authored / 408 unsupported / 147 inactive-by-policy.
- [ ] New profile/catalog identities and canonical hashes are deterministic and immutable.
- [ ] A new immutable rules release references the new v3-bound artifacts; old rules release remains
      unchanged.
- [ ] Exact v3 + newRulesVersion compatibility is explicit; v2 + oldRulesVersion remains retained.
- [ ] All-293/all-level coverage/playability evidence is regenerated for v3 with no semantic drift.
- [ ] TASK-034 Verdant Edge nine admitted Species/Level slots retain their accepted progress-capable
      counts.
- [ ] No latest/current fallback or inferred factual-subcatalog compatibility is introduced.
- [ ] Relevant game-core/API/integration/Worker/package/workspace tests pass.
- [ ] Independent QA has no unresolved P0/P1.
- [ ] Independent Class-B PM/Architecture acceptance confirms no SPEC-012 semantic drift.

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
