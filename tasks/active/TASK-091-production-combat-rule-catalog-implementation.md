# TASK-091 — Production Combat Rule Catalog Implementation

## Metadata

- State: ACCEPTANCE
- Class: B
- Owner: Lead Developer
- Owner execution surface: ChatGPT delegated implementation worker
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: N/A
- Auditor execution surface: N/A
- Consultants: N/A
- Consultant execution surface(s): N/A
- Spec: `docs/specs/SPEC-012-production-move-ability-rule-content.md`
- Related specs: SPEC-002, SPEC-003, SPEC-010, SPEC-011
- Related ADRs: ADR-004
- Related tasks: TASK-006, TASK-008, TASK-009, TASK-010, TASK-011, TASK-025, TASK-087, TASK-088,
  TASK-089, TASK-090, TASK-033, TASK-034, TASK-035
- Branch: task-scoped implementation history pending Human authorization
- Worktree: `.worktrees/main-governance-integration` for the current reviewable snapshot

## Objective

Implement the exact Human-approved SPEC-012 first-release production Move/Ability rule-content
baseline and wire its production-selectability authority through the existing TASK-089 Move service
and TASK-025 Player State HTTP runtime.

The implementation must publish immutable, deterministic production rule content from the accepted
companion profile, guarantee that every newly bootstrapped or replaced production Move loadout is
both level-eligible and executable in the exact selected rules context, and emit deterministic
all-Species/all-relevant-level capability evidence for downstream Solo Hunt admission work.

## Accepted semantic baseline

TASK-091 implements the APPROVED SPEC-012 decisions without reinterpretation:

- target policy: enemy-normalized option 2;
- new bootstrap/replacement selection: level-up eligibility intersected with exact executable
  support under `pokenexus.move-production-selectability.level-up-executable.v1`;
- exact first-release Move profile: 27 `executable-simple`, 18 `executable-authored`, 408
  `unsupported` across all 453 current v2 level-up MoveIds;
- all 147 current AbilityIds are `inactive-by-policy` for the first Solo Hunt production
  `rulesVersion`;
- TASK-033/034 may later admit a playability-cleared production Species subset rather than all 293;
- per-Species/per-level playability/diversity evidence is the content gate; a proposed admission
  level with zero progress-capable executable choices must fail downstream admission;
- unsupported mechanics remain unsupported and may not be approximated or promoted by TASK-091.

## Scope

### 1. Immutable production support/catalog artifact

- Consume `docs/specs/SPEC-012-production-move-support-v1.json` exactly as the accepted semantic
  source for all 453 Move support records and all 147 Ability support records.
- Materialize deterministic runtime/publication content for `MoveRule`, `AbilityRule` and referenced
  `EffectRule` entries permitted by the accepted profile.
- Publish explicit support state for every required MoveId and AbilityId; unsupported/inactive state
  is queryable and never encoded only as missing content.
- Preserve the exact accepted target dispositions, authored rules, cooldown provenance and semantic
  artifact identity/hash.
- Reject missing, duplicate, unknown or extra support IDs and unresolved rule references.

### 2. Production-selectability authority

- Implement the exact artifact
  `pokenexus.move-production-selectability.level-up-executable.v1` with accepted semantic hash
  `sha256:7ba0e89913bfbeda8caa6b55de0f302a824cd681daa530f9dd27989d0a3e7e51`.
- Preserve the retained SPEC-010 base artifact `pokenexus.move-eligibility.level-up-only.v1`
  unchanged.
- For SPEC-012-enabled new bootstrap/replacement operations, require both the retained base
  eligibility artifact and the exact production-selectability artifact/hash from the selected
  `rulesVersion`.
- Candidate MoveIds are the exact intersection of authoritative current level-up eligibility and
  executable support in that same rules context.
- No latest-context fallback, hidden promotion, synthetic Move, no-op, session projection or stale
  retry is allowed.

### 3. TASK-089 / TASK-025 integration

- Extend the existing Move context/runtime authority so SPEC-012-enabled releases expose exact
  production support/selectability alongside the retained SPEC-010 authority.
- New bootstrap and complete loadout replacement use the production-selectable intersection before
  persistence.
- Existing selected-only grandfathering remains stored unchanged; later-unsupported selections are
  not silently rewritten.
- Fresh Battle/admission preparation must be able to detect a persisted selection that no longer
  resolves to executable support and fail closed until deliberate valid replacement.
- Preserve SPEC-011 route/payload/error families; a client-selected Move excluded by production
  support remains `422 invalid_move_loadout` through the existing Player State route.

### 4. Ability baseline

- Represent all 147 Ability support records as `inactive-by-policy`.
- Preserve factual/persistent `selectedAbilityId` state.
- Production Battle composition for this baseline must omit active `abilityId`/`AbilityRule` rather
  than synthesize a no-op AbilityRule or imply that the selected Ability is mechanically active.

### 5. Coverage/playability evidence

- Emit deterministic coverage evidence for all 293 current Species/forms and every relevant level-up
  threshold.
- Include at least eligible count, executable count, progress/damage-capable executable count,
  simple/authored count, distinct target/category/effect-role classes and explicit zero/one-choice
  bottlenecks.
- Evidence is diagnostic input for TASK-033/034 and must not choose the Solo Hunt production subset.

### 6. Publication, compatibility and performance

- Canonically serialize and hash production rule/support artifacts.
- Keep retained immutable `gameDataVersion` / `rulesVersion` pairs exactly resolvable after newer
  content exists.
- Fail closed for missing pair/artifact/content/hash/reference.
- Preserve deterministic replay for pinned artifacts.
- Enforce TASK-011 cadence limits and existing structural/performance validators.
- Pass Worker compatibility/build qualification.

## Out of scope

- new combat primitives or semantic extensions beyond APPROVED SPEC-012/SPEC-003;
- promotion of any of the 408 accepted unsupported Moves;
- activation of any of the 147 first-release Abilities;
- new Move acquisition methods, TM/item economy or learned-Move persistence;
- selection of the actual Solo Hunt production Species/admission-level subset;
- Hunt encounter/reward/AI orchestration;
- UI implementation;
- mutation of canonical v2 factual game data;
- Git/history mutation without separate Human Owner authorization.

## Acceptance criteria

- [x] Exact 453 Move + 147 Ability accepted companion classifications are consumed without semantic
      drift, promotion or omission.
- [x] Exactly 27 simple + 18 authored MoveRules are executable and all 408 unsupported Moves fail
      closed.
- [x] All 147 Ability records are externally observable as `inactive-by-policy`; no active
      AbilityRule is synthesized for the first baseline.
- [x] Target mapping matches accepted enemy-normalized option 2 and the complete SPEC-012 target
      disposition table.
- [x] Every executable Move resolves a valid target, cooldown and all referenced immutable rules.
- [x] Production-selectability artifact identity/hash is distinct from and composed with retained
      SPEC-010 eligibility authority.
- [x] New bootstrap/replacement persists only `level-up eligible ∩ executable` Moves in the exact
      selected production context.
- [x] TASK-025 HTTP path uses the integrated authority without changing SPEC-011 protocol/error
      families.
- [x] Grandfathered later-unsupported selections remain persisted; fresh production admission fails
      closed until deliberate valid replacement and never silently projects/replaces them.
- [x] Deterministic all-293/all-relevant-level coverage evidence is emitted with zero/one-choice
      bottlenecks and progress-capable counts.
- [x] Retained historical exact pairs/artifacts remain resolvable and deterministic replay is
      unchanged for pinned artifacts.
- [x] TASK-011 semantic guards, same-environment regression policy, Worker compatibility and
      package/workspace validation pass. The historical absolute 700,000-boundaries/s cadence floor
      is not reproducible under the current 2026-09-23 machine/runtime conditions even on exact
      pre-TASK-091 HEAD `2c8d4c9`; current TASK-091 deltas versus that contemporaneous control are
      -8.1% for realistic 8h and -3.9% for pathological cadence, inside the accepted 30% regression
      threshold with no p95 regression. The absolute-floor miss is therefore retained as an
      environment/reference-baseline qualification, not recorded as a TASK-091 pass or code regression.
- [x] Independent QA has no unresolved P0/P1 finding: **READY 0/0/0/0**, blockers none.
- [x] PM / Architecture Coordinator Class B functional/architectural acceptance passes after QA:
      delegated independent verdict **ACCEPT 0/0/0/0**, blockers none.
- [x] Human Owner content-sample validation is completed before final repository completion:
      **APPROVED on 2026-09-23** for the reviewed simple/authored/unsupported Move and inactive-Ability sample.

## REVIEW evidence

- Approved companion identity: `spec-012-production-move-support-v1`, exact SHA-256
  `1462b33b35e38224b505240dbf5205104e98dae1310d0bc630e2aa02fb31879e`.
- Canonical production catalog identity: `pokenexus.production-combat-rule-catalog.v1`, canonical
  SHA-256 `dead91de25034fb9dbbb36856a4aad4df164074803c357d2c9e00dd3bc7dd7ce`.
- `docs/specs`, `packages/game-core/src` and built `packages/game-core/dist` companion bytes are
  byte-identical after the deterministic postbuild artifact finalizer and all resolve to the approved
  SHA above.
- Exact current support universe validates as 453 unique level-up MoveIds and 147 unique referenced
  AbilityIds: 27 `executable-simple`, 18 `executable-authored`, 408 `unsupported`, 147
  `inactive-by-policy`.
- Deterministic all-Species evidence covers 293 Species/forms. At some level 277/293 have at least one
  executable Move and 234/293 have at least one progress/damage-capable executable Move; at Level 1
  those counts are 254/293 and 203/293 respectively. Downstream TASK-033/034 still owns admission.
- Pinned production replay includes Dragon Pulse digest
  `ca2276e65bbd7d26cb96f225bdf97bb27a76fcec8a858df86eeaeba3777e2f9c`.
- Real disposable PostgreSQL 17 API integration is `32/32 PASS`; Player State production path is
  `4/4 PASS`, including Ampharos Level 20: level-eligible-but-unsupported Take Down returns existing
  `422 invalid_move_loadout` with no write, supported Dragon Pulse + Tackle persists, and a wrong
  production descriptor returns `503 authority_unavailable` before game-data fetch or mutation.
- `@pokenexus/game-core` build/test is `280/280 PASS`; `@pokenexus/api` unit tests are `92/92 PASS`;
  API build and Wrangler Worker compatibility dry-run PASS; workspace lint/typecheck/test/build,
  roadmap check and `git diff --check` PASS on the implementation snapshot.
- TASK-011 semantic preflight preserves all six frozen digests/counts. A current-condition performance
  control using exact pre-task HEAD `2c8d4c9` also misses the historical absolute cadence floor, while
  TASK-091 remains within the accepted same-environment regression delta. No engine/benchmark/threshold
  correction is justified by this task.
- Independent QA on the exact REVIEW implementation snapshot returned **READY 0/0/0/0**, blockers
  none and no required correction. The reviewer independently revalidated game-core `280/280`, API
  `92/92`, disposable PostgreSQL integration `32/32`, build/postbuild byte identity, TASK-011 semantic
  preflight, API Wrangler dry-run and Worker compatibility. The reviewer also confirmed that the
  historical `700,000` boundaries/s absolute floor remains explicitly not satisfied on the current
  host, while exact pre-task HEAD `2c8d4c9` misses it under the same conditions; this is retained as a
  reference-environment qualification rather than a TASK-091 regression or waiver.
- Delegated independent PM / Architecture Coordinator Class B review returned **ACCEPT 0/0/0/0**,
  blockers none. The reviewer confirmed scope fidelity to APPROVED SPEC-012, immutable/hash-bound
  publication, retained SPEC-010 compatibility, exact production selectability and authority
  composition, TASK-025 `422`/`503` behavior, grandfathered persistence versus fresh-admission
  fail-closed helpers, inactive Ability composition, coverage remaining diagnostic-only, Node/Worker
  packaging and the same explicit TASK-011 performance qualification. TASK-091 may proceed to the
  Human Owner content-sample gate without implementation correction.
- Human Owner content-sample validation: **APPROVED on 2026-09-23**. The reviewed sample explicitly
  covered simple executable Moves (Aqua Tail, Dragon Pulse, Hydro Pump, Hyper Voice), authored Moves
  (Calm Mind, Growl, Recover, Swords Dance), intentionally unsupported Take Down fail-closed behavior,
  and the `inactive-by-policy` Ability baseline. This completes the final TASK-091 product/content gate.

## ACCEPTANCE gate

TASK-091 entered ACCEPTANCE on 2026-09-23 after the exact uncommitted implementation snapshot completed
all required review and Human content gates:

- independent QA: **READY 0/0/0/0**, blockers none;
- delegated independent PM / Architecture Coordinator Class B acceptance: **ACCEPT 0/0/0/0**,
  blockers none;
- Human Owner content-sample validation: **APPROVED**;
- game-core `280/280`, API `92/92`, disposable PostgreSQL integration `32/32`, workspace
  lint/typecheck/test/build, TASK-011 semantic preflight, Worker compatibility, roadmap and diff checks
  all pass on the accepted implementation code;
- docs/src/dist production support companion bytes remain identical at SHA-256
  `1462b33b35e38224b505240dbf5205104e98dae1310d0bc630e2aa02fb31879e`;
- the historical `700,000` boundaries/s absolute cadence floor remains explicitly not satisfied on the
  current host and is not recorded as a pass; exact pre-task control fails it under the same conditions,
  while TASK-091 same-environment deltas remain within the accepted regression threshold.

Repository/history completion remains a separate Human Owner authorization gate. No commit, push,
merge or other Git-history mutation is authorized by this ACCEPTANCE transition.

## Validation / tests

- focused game-core catalog/support validation tests;
- byte-for-byte companion-profile consumption/classification test;
- canonical serialization/hash and retained-version resolution tests;
- exact target/cooldown/authored-rule validation for all 45 executable Moves;
- unsupported Move and inactive Ability fail-closed tests;
- TASK-089 bootstrap/replacement intersection tests, including empty intersection and historical
  selected-only compatibility;
- TASK-025 HTTP/application integration tests through production runtime composition;
- deterministic all-293/all-level capability-report regression;
- deterministic replay regression using pinned production artifacts;
- TASK-011 relevant performance/cadence regression and Worker build/dry-run;
- relevant package `lint`, `typecheck`, `test`, `build`;
- workspace `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` before acceptance;
- `corepack pnpm roadmap:check`;
- `git diff --check`.

## Dependencies

- TASK-006 / SPEC-002 — DONE / APPROVED.
- TASK-008 / SPEC-003 — DONE / APPROVED.
- TASK-009/010/011 — DONE.
- TASK-087 — DONE; canonical v2 static game-data publication available.
- TASK-088 / SPEC-010 — DONE / APPROVED.
- TASK-089 — DONE.
- TASK-025 / SPEC-011 — DONE / APPROVED.
- TASK-090 — semantic gate accepted; SPEC-012 APPROVED. TASK-090 repository/history completion is
  tracked separately and does not alter this accepted semantic dependency.

## Risks / irreversible actions

- A catalog/profile mismatch could silently make unsupported mechanics executable; publication must
  compare against the accepted companion profile exactly.
- Incorrect authority composition could allow a level-eligible but non-executable Move to persist or
  could reinterpret historical SPEC-010 operations.
- Removing executable support in later releases can strand persisted loadouts unless a separate
  compatibility/migration decision provides a player-visible recovery path.
- Coverage percentages alone can hide unplayable Species/levels; the per-Species/per-level report is
  mandatory evidence.
- No destructive migration is expected. Git/history mutation remains separately gated.

## READY basis

SPEC-012 is APPROVED after GSC ADVISORY PASS, technical-feasibility PASS, independent QA READY
0/0/0/0 and explicit Human Owner acceptance of all six first-release semantic decisions. Scope,
owner, reviewer, validation, dependencies, risks and exact implementation contract are defined.
TASK-091 reached READY, completed implementation/owner validation, independent QA, delegated Class B
acceptance and Human content-sample validation, and is now in ACCEPTANCE on the exact uncommitted
snapshot. Git/history remains separately gated.
