# TASK-010 — Combat Fixtures, Replay & Property Harness

## Metadata

- State: ACCEPTANCE
- Class: B
- Owner: Secondary Developer
- Owner execution surface: ChatGPT delegated implementation worker (explicit Secondary Developer assignment)
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent review session
- Auditor: N/A
- Auditor execution surface: N/A
- Specs:
  - `docs/specs/SPEC-001-core-domain-model.md`
  - `docs/specs/SPEC-002-static-game-data-and-versioning.md`
  - `docs/specs/SPEC-003-combat-rules-v1.md`
- ADR:
  - `docs/decisions/ADR-004-universal-combat-engine-architecture.md`
- Branch: `feat/TASK-010-combat-fixtures-replay-property-harness`
- Worktree: `.worktrees/TASK-010-combat-fixtures-replay-property-harness`

## Objective

Build the broad deterministic verification layer promised by ADR-004 and SPEC-003 around the
production Combat Engine delivered by TASK-009. The harness must prove replay identity, immutable
version pinning, serialization stability, time-partition invariance and core state invariants over a
reusable regression corpus without changing accepted combat semantics or introducing a second
resolver.

## Context

TASK-009 is DONE and the production `@pokenexus/game-core` resolver is integrated on `main`.
TASK-009 already contains focused branch-level unit/integration coverage. TASK-010 adds the wider
fixture/replay/property proof owned by ADR-004 section 14, SPEC-003 section 24 and the project
roadmap. Existing TASK-009 tests remain valid evidence, but TASK-010 must add reusable higher-level
coverage rather than merely restating those tests.

The production public runtime API is intentionally narrow. Test infrastructure may import internal
game-core modules when needed to construct exhaustive fixtures, but TASK-010 must not broaden the
package root API solely for testing.

## Scope

### 1. Reusable deterministic fixture corpus

- add explicit fixture builders/data for representative Battles, resolved combat contexts, seeded
  RNG state and ordered normalized `CombatStimulus` streams;
- cover the normative SPEC-003 section 24 fixture families that benefit from end-to-end replay,
  including direct damage branches, targeting/order, cooldown/readiness carry, effects/time,
  cadence continuity, KO/replacement/outcome and fail-closed cases;
- preserve opaque canonical IDs, including delimiter/reserved-name cases already proven by TASK-009;
- keep fixture rules small and explicit; do not create broad production Move/Ability/effect content.

### 2. Replay harness

- execute one normalized fixture from its initial Battle input, immutable resolved context and
  explicit combat RNG state through its ordered stimulus stream;
- capture initialization itself as part of replay identity: accepted/rejected decision,
  initialization Combat Events, deterministic state and initialized Battle State when accepted;
- capture accepted/rejected transition decisions, flattened authoritative Combat Events, final
  Battle State/outcome and final deterministic RNG/continuation state;
- replay the exact same fixture and assert strict deterministic equality of those authoritative
  results;
- prove rejected stimuli are atomic: zero Combat Events and unchanged Battle State, logical/event
  sequence and deterministic RNG state; human-readable rejection reasons are diagnostics and are not
  part of authoritative replay identity;
- run replay from independent fixture copies/decoded values and prove the authoritative resolver does
  not mutate caller-owned fixture inputs;
- prove stored normalized ActionIntents replay independently of any external Move-selection/AI
  policy implementation;
- include continuation/rebind cases where cadence state is part of deterministic replay identity;
- explicitly replay the cross-Battle path Battle 1 → `createCadenceCarry` → `advanceCadence` → Battle
  2 rebind of the same full `{ kind, identity }` participant to a different Battle-scoped
  `CombatantId`, comparing cadence consequences, carry, deterministic state and Battle 2
  initialization.

### 3. Immutable-version / historical replay proof

- fixture explicit `gameDataVersion`, `rulesVersion` and `combatEventSchemaVersion` identities;
- use at least two distinct explicit resolved context/version triples with a behavior-relevant rule
  difference, proving a retained historical fixture remains on its pinned result without consulting
  an ambient/current/latest version;
- keep historical-version proof test-local; TASK-010 does not introduce a production registry,
  persistence format or compatibility service.

### 4. Deterministic property harness

- use deterministic generated/enumerated input cases whose generator seed/case identity is separate
  from the Combat Engine RNG; no nondeterministic test RNG and no order/shard-dependent generation;
- prove direct A→C logical-time advancement is equivalent to A→B→C when no external stimulus is
  interleaved, comparing Combat Events flattened by concatenating emitted batches in call order,
  final authoritative state/outcome and RNG continuation; intermediate transition counts need not be
  identical;
- prove the same partition invariant for cadence-gap advancement where cadence schedules are present;
- assert HP/readiness/stage/effect domains remain valid across accepted transitions;
- assert terminal Battles cannot emit later authoritative Battle events, require replacement or
  accept further combat mutation;
- derive replay outcome only from the authoritative terminal `BattleEnded.outcome` event, absent when
  no such event exists; do not infer an outcome from final `BattleState.status`;
- assert replay equality across a useful matrix of seeds, legal combat inputs and timing partitions;
- keep the corpus bounded enough for normal CI; performance/load measurement belongs to TASK-011.

### 5. Serialization round-trip proof

- serialize replay-relevant fixture inputs/transcripts using a deterministic JSON-safe test
  representation and deserialize them back;
- prove round-tripped normalized inputs reproduce the same authoritative replay outputs;
- include reserved/delimiter/NUL opaque IDs and cadence participant keys, proving semantic own-key
  preservation through JSON round-trip without making JavaScript prototype identity or JSON key/byte
  ordering part of combat semantics;
- do not declare the test representation to be a persistence/public-network schema.

### 6. Cross-orchestrator equivalence

- prove that two caller labels/scenarios representing different future product modes but normalized
  to identical Battle inputs/context/RNG/stimuli produce identical authoritative outputs;
- mode labels remain fixture metadata only and are never passed into or branched on by game-core.

### 7. Regression corpus and diagnostics

- make failures identify the fixture/seed/property case precisely enough to reproduce locally;
- retain targeted regressions for deterministic edge cases discovered during TASK-009 where they
  materially exercise replay/property behavior;
- do not weaken existing TASK-009 assertions or replace focused unit tests with broad snapshots.

### 8. SPEC-003 section 24 evidence map

| Fixture family | Retained TASK-009 evidence | TASK-010 replay/property evidence |
|---|---|---|
| Direct damage, STAB/type, accuracy, critical/minimum damage, multi-target order | Batch B arithmetic/resolver cases | strict independent replay of each deterministic damage/targeting branch fixture with pinned RNG/context |
| Initiative, GCD/per-Move readiness, alternate ready Move, carry-in/cooldown publication | Batches A/B | readiness/rejection replay plus bounded readiness-domain properties; publication arithmetic remains focused TASK-009 evidence |
| Stat stages, action locks, Battle effects, periodic tick/expiry ordering | Batches B/C/D | replay/property matrix with stage bounds and A→C vs A→B→C event flattening |
| Cadence HP/readiness/effects/locks, gap processing, full `{ kind, identity }` rebind | Batches B/C | explicit Battle 1 → carry → cadence advancement → Battle 2 replay plus cadence-gap partition property |
| KO, reserve replacement, victory/draw and post-terminal behavior | Batch D | terminal/replacement replay plus bounded deterministic win/draw property cases with post-end rejection atomicity and event-derived outcome |
| Fail-closed inputs and opaque/reserved/delimiter IDs | Batches A/C/D | rejected-initialization replay plus opaque-key JSON round-trip/replay corpus |
| Pinned historical replay | focused deterministic equal-call cases across B/C | two behavior-distinct explicit context/version triples plus strict full replay equality |

## Out of scope

- changing combat formulas, RNG rules, event semantics, cadence rules, targeting, KO/replacement or
  any other accepted SPEC-003 behavior;
- fixing a newly discovered production Combat Engine defect inside this task without returning it to
  the appropriate implementation-owner/fix workflow;
- resolving genuine game-rule ambiguity without Human Owner/spec escalation;
- implementing Move selection, AI policy, Hunt lifecycle, persistence/checkpoint schemas, network
  protocols, UI/read models or reward/progression behavior;
- production historical-rules registry/codec infrastructure;
- broad production Move/Ability/effect catalogs;
- performance budgets, load testing or long-duration benchmark policy owned by TASK-011;
- new external dependencies or a broadened `@pokenexus/game-core` root runtime API.

## Acceptance criteria

- [x] A reusable deterministic fixture/replay harness executes ordered normalized stimulus streams
      against the authoritative TASK-009 resolver with explicit context and RNG state.
- [x] Battle initialization itself replays identically, including accepted/rejected decision,
      initialization events, deterministic state and initialized Battle State when accepted.
- [x] Replaying an identical fixture produces identical accepted/rejected decisions, ordered Combat
      Events, final Battle State/outcome and deterministic RNG/continuation state.
- [x] Rejected stimuli, including cadence advancement rejection cases, prove atomicity: unchanged
      authoritative state/carry and deterministic RNG, zero events/consequences and no logical/event
      sequence mutation; rejection text is not authoritative replay identity.
- [x] Replays run from independent fixture copies/decoded values and prove caller-owned fixtures are
      not mutated by initialization/resolution.
- [x] Stored normalized ActionIntent streams replay without invoking or depending on an external
      Move-selection/AI policy.
- [x] Historical fixture contexts pin explicit `{ gameDataVersion, rulesVersion,
      combatEventSchemaVersion }` identities; two behavior-distinct resolved contexts prove retained
      historical replay stays pinned without an ambient/latest-version fallback.
- [x] Time-partition property cases prove A→C equals A→B→C without an interleaved stimulus, including
      effect ticks/expiry and RNG continuation where applicable, using call-order event-batch
      flattening rather than requiring equal transition counts.
- [x] Cross-Battle cadence replay compares `createCadenceCarry` → `advanceCadence` consequences/carry
      /deterministic state → exact Battle 2 rebind of the same full `{ kind, identity }` to a
      different `CombatantId`, and cadence-gap A→C vs A→B→C is partition invariant.
- [x] Deterministic property cases verify HP/readiness/stat-stage/effect-domain bounds and terminal
      KO/victory/draw invariants over a useful bounded seed/input matrix whose generator identity is
      isolated from Combat RNG and reproducible independently of execution order.
- [x] Terminal outcome equality uses the exact authoritative `BattleEnded.outcome` event and remains
      absent when no terminal event was emitted; it is never reconstructed from final state.
- [x] Replay-relevant fixture/transcript serialization round-trips and the round-tripped inputs replay
      to the same authoritative outputs; opaque reserved/delimiter/NUL IDs and cadence keys preserve
      their semantic own keys; the encoding is explicitly test-only.
- [x] Cross-orchestrator fixtures with identical normalized combat inputs produce identical outputs,
      with no mode discriminator entering game-core.
- [x] The regression corpus covers the relevant SPEC-003 section 24 fixture families at the replay /
      property level without duplicating a second combat resolver or broad rule catalog.
- [x] Existing TASK-009 tests remain green and no correct assertion is weakened to satisfy the new
      harness.
- [x] No production game-core semantic change, package-boundary change, root runtime API expansion or
      new external dependency is introduced by TASK-010.
- [x] Focused `@pokenexus/game-core` lint/typecheck/test/build pass.
- [x] Workspace typecheck/test/build pass with no unrelated regression.
- [x] `corepack pnpm roadmap:check` and `git diff --check` pass.
- [x] Independent QA reports no unresolved P0/P1 findings.
- [x] PM / Architecture Coordinator acceptance passes after QA.

## Validation / tests

Run and report at least:

```text
corepack pnpm --filter @pokenexus/game-core lint
corepack pnpm --filter @pokenexus/game-core typecheck
corepack pnpm --filter @pokenexus/game-core test
corepack pnpm --filter @pokenexus/game-core build
corepack pnpm -r typecheck
corepack pnpm -r test
corepack pnpm -r build
corepack pnpm roadmap:check
git diff --check
```

Also inspect the complete branch diff against `origin/main` and verify all changes remain inside the
declared TASK-010/test/roadmap boundaries.

If a property/replay fixture exposes a production engine defect, preserve the smallest failing case
and return the semantic fix to the appropriate implementation-owner workflow rather than silently
changing accepted behavior inside the harness. If the failure instead reveals genuine rule
ambiguity, escalate through the Human Owner/spec flow before choosing an expected result.

## Dependencies

- TASK-007 — ADR-004 Universal Combat Engine Architecture: DONE.
- TASK-008 — Combat Rules Spec v1: DONE.
- TASK-009 — Deterministic Combat Engine v1: DONE and integrated on `main`.
- SPEC-001 — Core Domain Vocabulary & Model: APPROVED.
- SPEC-002 — Static Game Data, Versioning & PokémonDB Ingestion: APPROVED.
- SPEC-003 — Combat Rules v1: APPROVED.
- ADR-004 — Universal Deterministic Combat Engine Architecture: ACCEPTED.

## Risks / irreversible actions

- Property generators can accidentally test undefined/invalid semantics. Generated cases must stay
  inside accepted domains unless the property explicitly verifies fail-closed rejection.
- Snapshot-heavy tests can mask the semantic reason for a failure. Prefer structural assertions and
  small named golden outputs where exact event order is the contract.
- Test-only serialization must not become an accidental persistence/public protocol contract.
- Long periodic schedules can create large deterministic workloads; keep TASK-010 CI cases bounded
  and leave throughput/pathological benchmarking to TASK-011.
- No irreversible action is required. Commit/push/merge remain separately governed by Git policy and
  explicit session authorization.

## Expected files / boundaries

Primary TASK-010 boundary:

```text
packages/game-core/src/*fixture*.ts
packages/game-core/src/*replay*.ts
packages/game-core/src/*property*.ts
packages/game-core/src/**/*.test.ts
tasks/active/TASK-010-combat-fixtures-replay-property-harness.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

Test helpers may be organized under a small `packages/game-core/src/testing/` directory if that is
clearer than flat files. Production resolver modules may be inspected but are not TASK-010 write
targets unless a separately authorized fix workflow is opened for a demonstrated defect.

## Completion

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
