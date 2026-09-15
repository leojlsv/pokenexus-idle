# TASK-009 — Deterministic Combat Engine v1

## Metadata

- State: ACCEPTANCE
- Class: B
- Owner: Lead Developer
- Owner execution surface: ChatGPT delegated implementation worker (explicit Lead Developer assignment)
- Reviewer: QA Reviewer
- Reviewer execution surface: Codex / independent review session
- Auditor: N/A
- Auditor execution surface: N/A
- Specs:
  - `docs/specs/SPEC-001-core-domain-model.md`
  - `docs/specs/SPEC-002-static-game-data-and-versioning.md`
  - `docs/specs/SPEC-003-combat-rules-v1.md`
- ADR:
  - `docs/decisions/ADR-004-universal-combat-engine-architecture.md`
- Branch: `feat/TASK-009-deterministic-combat-engine-v1`
- Worktree: `.worktrees/TASK-009-deterministic-combat-engine-v1`

## Objective

Implement the first production deterministic Combat Engine in `@pokenexus/game-core` from the
approved ADR-004 architecture and SPEC-003 combat rules without inventing product behavior,
mode-specific branches or unapproved content semantics.

The result must expose a pure, infrastructure-free TypeScript resolution boundary that can be
reused by active Battles and by deterministic cadence-effect advancement, while preserving exact
replay-relevant state, event order, RNG consumption and logical-time semantics.

## Context

TASK-008 is DONE and `SPEC-003` is APPROVED. `packages/game-core` is currently only a foundation
placeholder, so TASK-009 owns the first concrete implementation of the universal resolver.

ADR-004 deliberately leaves the concrete TypeScript API/module organization, deterministic PRNG
implementation and efficient internal state strategy to TASK-009, provided observable semantics
remain exactly those accepted by SPEC-003. These implementation freedoms do not authorize changes
to game rules or architecture.

Human Owner accepted a Level-domain update before final Batch C review: Pokémon `level` is globally
constrained to integer `1..200`; new generations/regions do not automatically raise this hard cap;
post-cap progression belongs to later progression/endgame rules. TASK-009 therefore validates the
accepted `1..200` combat input domain rather than introducing a separate implementation-only numeric
ceiling.


TASK-010 remains the owner of the broader golden-fixture/replay/property harness. TASK-009 must
still carry sufficient unit/integration tests to prove every implemented branch and deterministic
contract locally; it must not defer basic correctness to TASK-010.

## Scope

### 1. Universal pure resolver boundary

- replace the `game-core` placeholder with a coherent infrastructure-free module structure;
- implement deterministic Battle initialization and transition APIs consistent with ADR-004;
- accepted transitions return next authoritative state plus ordered authoritative events and
  deterministic continuation state rather than mutating caller-owned state in place;
- rejected inputs are atomic: no Battle state, RNG, logical time, sequence counter or other
  deterministic continuation state changes;
- do not branch on product-mode identities such as Hunt, PvP, Duo, Gym or World Boss.

### 2. Battle input/state and version contracts

- represent and validate the SPEC-003 Battle initialization inputs, Battle Sides, active/reserve
  participants, pinned Move loadouts and starting HP/readiness/effect/action-lock carry where applicable;
- require the pinned `gameDataVersion`, `rulesVersion` and `combatEventSchemaVersion` execution
  context required by ADR-004/SPEC-003;
- fail closed on malformed/unresolvable caller-supplied rule/data inputs rather than guessing,
  defaulting missing keys or consulting ambient/current configuration;
- preserve the distinction between persistent `PokemonInstanceId`/cadence identity and
  Battle-scoped `CombatantId` when validating cadence carry/rebind inputs.

### 3. Exact combat arithmetic and legality

- implement the accepted SPEC-003 numeric domains and exact integer/rational rounding points;
- implement derived-stat helpers required by the accepted Battle contract;
- implement Physical/Special/Status executable-category behavior, target legality, living/active
  restrictions, frozen target sets and canonical multi-target order;
- implement exact accuracy, critical, variance, STAB, type-effectiveness, immunity, minimum-damage
  and stat-stage semantics;
- implement same-time initiative using effective Speed then canonical `CombatantId` byte order;
- implement actor GCD and per-Move readiness/cooldown legality including non-zero carry-in;
- engine validates/resolves supplied `ActionIntent`; it never selects a Move or owns automatic
  ordered-loadout policy.

### 4. Explicit deterministic RNG

- choose and implement one small deterministic PRNG representation suitable for explicit seed/state
  continuation and replay;
- no `Math.random()` or hidden/global RNG state;
- preserve SPEC-003 RNG draw ordering exactly, including no draws on branches that do not consume
  RNG and zero RNG/state mutation on rejected intents;
- the PRNG algorithm/representation that affects authoritative output must be treated as part of
  the retained rules implementation identity and documented in stable implementation comments/tests,
  not as ambient behavior.

### 5. Logical time and scheduled effects

- implement explicit monotonic logical-time advancement; no engine-owned loop, interval, timeout or
  wall-clock read;
- implement exact due-boundary ordering, batching, stale-schedule suppression, tick-before-expiry,
  same-time terminal resolution and partition-invariance semantics from SPEC-003;
- implement the accepted finite Active Effect algebra, stacking/replacement/refresh semantics,
  explicitly scoped battle/cadence timed action locks and periodic HP damage/healing behavior;
- keep stat stages Battle-local;
- support explicit `battle | cadence` lifetime scope with validated cadence carry state;
- expose/reuse the same pure deterministic effect-rule evaluator for inter-Battle cadence advancement
  so later Hunt orchestration cannot create a second damage/healing/effect resolver;
- cadence advancement may mutate carried HP and may produce KO before a later Battle; it must not
  implement Hunt lineup, Potion, inventory or return-to-city behavior.

### 6. KO, replacement and outcome

- implement immediate KO state, non-revival baseline, forced replacement gating, reserve readiness,
  survival victory and deterministic draw semantics exactly as SPEC-003 defines;
- terminal outcome takes precedence over replacement;
- voluntary switching, forfeit and mode-specific termination remain outside baseline v1.

### 7. Authoritative events

- implement the SPEC-003 v1 authoritative Combat Event taxonomy/required semantic fields;
- event sequence and logical combat time are deterministic authoritative data;
- infrastructure timestamps/localized display copy/rendering instructions are excluded;
- `BattleEnded` remains the final authoritative event of a Battle while cadence consequences outside
  an active Battle use the shared deterministic rule evaluator and an appropriate non-Battle
  consequence/result boundary without fabricating Battle events.

### 8. Rule/content boundary

- represent immutable resolved `MoveRule`, `AbilityRule`, `EffectRule`, type matrix and related
  rule-context inputs needed by SPEC-003;
- implement only the small explicit executable semantics required by the approved spec and tests;
- do not author broad production Move/Ability/status catalogs in TASK-009;
- never infer executable behavior from Move names, Ability names, PokémonDB prose or franchise
  convention;
- unsupported rule semantics fail closed.

### 9. Tests and maintainability

- organize modules around clear deterministic responsibilities rather than one monolithic file;
- keep the public surface no larger than required for TASK-009/TASK-010 consumption;
- add focused tests for initialization, rejected atomicity, readiness, RNG order, damage branches,
  targeting, effects/time, cadence advancement, KO/replacement/outcome and event ordering;
- include representative SPEC-003 examples such as Power/PP cooldown publication inputs, long-cooldown
  carry, same-time ordering, periodic effect expiry and inter-Battle cadence KO;
- reuse canonical cross-package identity/stat primitives from `@pokenexus/game-types` rather than
  redeclaring competing nominal types inside `game-core`;
- one internal workspace dependency `@pokenexus/game-types: workspace:*` is explicitly authorized
  for `packages/game-core`; no new external dependency is authorized. The resulting
  `packages/game-core/package.json` / workspace-lock importer change is inside TASK-009 scope.

## Out of scope

- automatic Move selection/AI policy or the ordered loadout cursor implementation owned by Solo
  Hunt policy/orchestration tasks;
- Solo Hunt encounter loop, team continuation, no-living intervention state, Potion/Revive commands
  or return-to-city lifecycle;
- inventory mutation, rewards, XP, capture or progression;
- persistence/checkpoint database schemas or transport/API/WebSocket contracts;
- UI/presentation/read-model implementation;
- broad production Move/Ability/effect content catalog;
- TASK-010's full golden replay/property corpus and TASK-011 performance budget work;
- PvP/Gym/Duo/World Boss mode rules;
- new package/runtime dependencies;
- changing ADR-004, SPEC-003, package ownership or any accepted product/game rule.

## Acceptance criteria

- [x] `@pokenexus/game-core` exposes a pure deterministic Battle initialization/transition boundary
      consistent with ADR-004 and SPEC-003.
- [x] Rejected inputs are demonstrably atomic across Battle state, logical time, event sequence and
      RNG/deterministic continuation state.
- [x] Battle initialization validates identities, sides/actives, starting HP, readiness carry and
      cadence-effect carry/rebind inputs fail-closed.
- [x] Exact SPEC-003 arithmetic/rounding, accuracy/crit/variance draw order, STAB/type math,
      stat stages, target legality and same-time Speed ordering are implemented.
- [x] Actor GCD/per-Move cooldown readiness and cross-Battle remaining-delay inputs are implemented
      without Move-selection policy entering the resolver.
- [x] Deterministic explicit RNG is implemented with no hidden/global randomness and tests prove
      branch-specific draw/no-draw behavior.
- [x] Explicit logical-time advancement implements due-boundary order, stale suppression,
      tick-before-expiry, same-time terminal semantics and no wall-clock/server tick.
- [x] Battle- and cadence-scoped Active Effects are implemented; the same game-core evaluator can
      advance cadence effects between Battles and can produce inter-Battle HP mutation/KO.
- [x] KO, forced replacement, terminal precedence, survival victory and draw semantics match
      SPEC-003; baseline healing/effects cannot silently revive KO Combatants.
- [x] Authoritative event ordering/schema semantics are deterministic and presentation-neutral.
- [x] Unsupported Move/Ability/effect semantics fail closed and no executable source prose/name
      inference exists.
- [x] No mode discriminator, Hunt-specific resolver, persistence/network/UI dependency or alternate
      damage/effect path exists in `game-core`.
- [x] `game-core` reuses canonical `@pokenexus/game-types` identities/stat structures; the only
      dependency change allowed is the explicitly authorized internal workspace dependency on
      `@pokenexus/game-types`, with no new external package.
- [x] Focused `@pokenexus/game-core` lint/typecheck/test/build pass.
- [x] Workspace typecheck/test/build pass with no unrelated regression.
- [x] `corepack pnpm roadmap:check` and `git diff --check` pass.
- [x] Independent QA reports no unresolved P0/P1 findings.
- [x] PM / Architecture Coordinator acceptance passes after QA.
- [x] Human Owner validates the requested sample combat outcomes before repository completion.

## Validation / tests

Run and report exact results for at least:

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

Also inspect the complete branch diff against `origin/main` and verify no changes exist outside the
declared task/roadmap and allowed package boundaries.

TASK-010 will later add broader golden/property/replay proof; failures uncovered there that reveal
an implementation defect return to TASK-009 ownership, while genuine rule ambiguity escalates to
the Human Owner/spec flow rather than being guessed.

## Dependencies

- TASK-004 — Domain Glossary & Core Model Spec: DONE.
- TASK-005 — Core Domain Type Skeleton: DONE.
- TASK-006 — Static Game Data Schema & Rules Versioning: DONE.
- TASK-007 — ADR-004 Universal Combat Engine Architecture: DONE.
- TASK-008 — Combat Rules Spec v1: DONE.
- SPEC-001 — Core Domain Vocabulary & Model: APPROVED.
- SPEC-002 — Static Game Data, Versioning & PokémonDB Ingestion: APPROVED.
- SPEC-003 — Combat Rules v1: APPROVED.
- ADR-004 — Universal Deterministic Combat Engine Architecture: ACCEPTED.

## Risks / escalation triggers

- Any ambiguity that can change observable combat outcomes, RNG consumption, event ordering,
  cadence semantics or replay identity is a spec/game-rule question and must be escalated before
  implementation chooses a behavior.
- Any need for mode-specific resolution, persistence/network I/O in `game-core`, package ownership
  change, any dependency beyond the explicitly authorized internal `@pokenexus/game-types`
  workspace edge, or public protocol decision must be escalated before implementation.
- A monolithic implementation may satisfy examples while hiding ordering/state coupling; prefer
  small deterministic modules with tests around boundaries.
- Periodic cadence effects can produce large boundary counts; TASK-009 must implement exact semantics,
  not silently aggregate/skip ticks. Performance limits/optimization policy remain TASK-011.
- Commit/push/merge/rebase remain separately gated by explicit Human Owner authorization.

## Expected files / boundaries

Primary implementation boundary:

```text
packages/game-core/src/**
packages/game-core/README.md            # only if stable package contract documentation needs updating
packages/game-core/package.json         # internal @pokenexus/game-types workspace dependency only
pnpm-lock.yaml                          # importer change from that internal workspace edge only
tasks/active/TASK-009-deterministic-combat-engine-v1.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

`packages/game-types/src/**` may change only if the Lead Developer demonstrates that an additional
infrastructure-free structural primitive must be shared across packages under ADR-004. Such a
change must not add gameplay semantics already owned by `game-core`. Existing canonical IDs and
`StatBlock` must be reused rather than duplicated.

## Completion

TASK-009 is complete only after implementation validation, independent QA, delegated PM acceptance,
Human Owner sample-result validation and separately authorized repository completion.

Human Owner sample-result validation is complete. On 2026-09-15, the Human Owner explicitly
authorized TASK-009 repository completion/history operations. State remains `ACCEPTANCE` until the
authorized feature integration and main push complete successfully; `DONE` is recorded only after
that repository completion succeeds.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
