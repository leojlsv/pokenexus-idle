# TASK-028 — Combat Presentation Event Contract

## Metadata

- State: DONE
- Class: B
- Owner: Lead Developer
- Owner execution surface: ChatGPT delegated implementation worker (worker-6)
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent review
- Auditor: N/A
- Auditor execution surface: N/A
- Consultants: N/A
- Consultant execution surface(s): N/A
- Specs:
  - `docs/specs/SPEC-003-combat-rules-v1.md`
  - `docs/specs/SPEC-015-authoritative-hunt-api-contract.md`
  - `docs/specs/SPEC-016-ui-ux-architecture-navigation-design-system.md`
- ADR: `docs/decisions/ADR-004-universal-combat-engine-architecture.md`
- Branch: `feat/TASK-028-combat-presentation-event-contract`
- Worktree: `.worktrees/TASK-028-combat-presentation-event-contract`

## Objective

Define and implement one versioned, renderer-neutral Combat Presentation Event Contract for Card/Low-Spec and
Visual/Pixi consumers. The contract projects existing authoritative `CombatEvent` semantics into a
presentation-safe boundary without creating gameplay authority, recomputing outcomes or leaking hidden wild
Encounter information.

## Context

ADR-004 and SPEC-003 already define the deterministic Combat Engine and ordered `CombatEvent` stream. SPEC-016
requires TASK-029/TASK-030 and TASK-039/TASK-040 to consume one shared presentation model. SPEC-015 prohibits
public pre-capture wild HP/maxHP/HP percentage and other values that encode or help infer hidden IV/Genetics.

TASK-028 therefore owns a projection contract, not another combat engine.

Independent QA reopened this task from REVIEW to FIX with P0/P1/P2/P3 = 0/1/1/1. Corrective scope:
one-time battle-origin bootstrap versus continuation semantics, removal of the cross-batch owned-HP differential
oracle, an engine-realistic exported fixture, and explicit decreasing-`combatTimeMs` regression coverage.
The corrective re-gate is READY with P0/P1/P2/P3 = 0/0/0/0, delegated Class-B functional/architectural
acceptance found no blocking issue, and Human Owner repository/history completion was authorized on 2026-09-27.
Push/deploy remain separately gated.

## Scope

- implement the contract in the existing infrastructure-free `@pokenexus/game-protocol` package so server/public
  projection and both renderers share one protocol boundary without adding a new package;
- add only an internal `@pokenexus/game-core` dependency for authoritative event types; add no external dependency;
- define a literal presentation schema version plus explicit source `combatEventSchemaVersion` binding;
- define one explicit battle-origin bootstrap envelope with side roster/initial-active membership, participant
  identities and Player-owned exact initial HP; bootstrap must begin at authoritative `BattleStarted` sequence 1/time 0;
- define continuation envelopes that carry only projected events and consume an HP-free producer cursor returned by
  bootstrap/previous continuation; continuation input has no participant snapshot field;
- preserve exact `CombatEvent` kind/sequence/logical-time semantics across contiguous batches, including cross-batch
  sequence/time validation;
- expose exact current/max HP only in the one-time Player-owned bootstrap snapshot; later current owned HP refresh
  belongs to authoritative Hunt state outside TASK-028;
- hide per-event HP numerics whenever a wild participant can influence the consequence or the authoritative event
  lacks source ownership provenance;
- define public wild vitality as semantic `conscious | ko` only in v1, with no proportional HP visualization;
- omit exact wild damage/healing/resulting-HP values, including periodic effect ticks;
- preserve only authoritative event semantics; add no gameplay resolver, scheduler or outcome calculation;
- export canonical engine-produced bootstrap/continuation fixture segments and keep adversarial/sentinel event cases
  in negative/exhaustiveness tests rather than presenting them as real transcripts.

## Out of scope

- changing `CombatEvent`, combat rules/order, damage/healing math, RNG or gameplay authority;
- adding a second combat/effect engine or client-side result calculation;
- widening SPEC-015 Hunt HTTP/WebSocket/state contracts;
- React/Card components, Pixi scenes/animations, accessibility implementation or assets;
- deriving wild HP buckets/ratios from hidden HP/maxHP;
- IV/Genetics/derived wild stats, hidden capture modifiers, seeds, checkpoint bytes or RNG state;
- persistence/database work;
- deploy, commit, push, merge or other Git-history mutation.

## Acceptance criteria

- [x] `@pokenexus/game-protocol` exports a versioned renderer-neutral Combat Presentation contract.
- [x] Projection consumes authoritative `CombatEvent`; no combat/gameplay resolution exists in the package.
- [x] Event sequence and `combatTimeMs` preserve authoritative order/values exactly across bootstrap and continuation
      batches, rejecting sequence gaps and decreasing logical time.
- [x] Initial side roster order and active-vs-reserve membership are explicit authoritative inputs; renderers never infer initial actives from `CombatantActivated`.
- [x] Public wild participants expose no exact HP/maxHP/percentage/ratio, damage/healing amount or `resultingHp`.
- [x] Wild v1 vitality is limited to `conscious | ko`; `activeCombatantIds` is the only battle-active membership
      concept and no proportional bar/fill contract exists.
- [x] Player-owned exact current/max HP appears only in the one-time battle-origin bootstrap; continuation envelopes
      and continuation projection context contain no fresh HP snapshot.
- [x] Splitting a hidden wild-source stream into one-event continuation batches cannot reveal numeric HP by snapshot
      differencing; refresh/current owned HP remains outside TASK-028.
- [x] Event-level numerics never create a wild offensive/bulk Genetics oracle and ambiguous-source HP consequences
      fail privacy-closed.
- [x] Every authoritative `CombatEvent.kind` has an explicit presentation projection with exhaustive handling.
- [x] Card and Pixi can consume the same renderer-neutral fixture segments, and the canonical exported fixture is
      directly reproduced by `game-core` Battle initialization plus a deterministic immunity branch.
- [x] Payload contains no CSS, animation instructions, localized copy, asset URL/filename or command authority.
- [x] Focused lint/typecheck/test/build plus roadmap/check/diff-check pass.

## Validation / tests

```text
corepack pnpm --filter @pokenexus/game-protocol lint
corepack pnpm --filter @pokenexus/game-protocol typecheck
corepack pnpm --filter @pokenexus/game-protocol test
corepack pnpm --filter @pokenexus/game-protocol build
corepack pnpm --filter @pokenexus/game-core test
corepack pnpm roadmap:generate
corepack pnpm roadmap:check
git diff --check
```

Exact-current owner validation evidence:

- `@pokenexus/game-protocol` lint: PASS;
- `@pokenexus/game-protocol` typecheck: PASS (including required `game-core`/`game-types` build prerequisites);
- focused `combat-presentation.test.ts`: 15/15 PASS; full package script: 32/32 PASS across source/generated
  `dist` coverage plus index tests;
- `@pokenexus/game-protocol` build: PASS;
- focused `game-core/src` regression: 230/230 PASS; package script after build: 460/460 PASS for the same
  source-plus-generated-dist reason;
- roadmap generate/check: PASS for 101 tasks, source
  `6a6554e8f30743af521235419bed368ea70af0b550821521aa7f2423eedccf43`;
- `git diff --check`: PASS;
- QA P1 regression: one-time bootstrap plus HP-free continuation context prevents fresh owned HP snapshot
  publication across one-event continuation splits;
- QA P2 regression: exported fixture is reproduced directly from `game-core` `initializeBattle` plus a deterministic
  `MoveUsed -> MoveImmune` resolution branch; synthetic sentinel cases remain test-only;
- QA P3 regression: decreasing `combatTimeMs` is explicitly rejected across continuation batches;
- exact-current diff is limited to this task file, roadmap Markdown/generated HTML, `game-protocol` contract/tests,
  and its internal workspace dependency/lockfile edge.
- independent corrective QA re-gate: READY, P0/P1/P2/P3 `0/0/0/0`;
- delegated Class-B functional/architectural acceptance: ACCEPT, no unresolved P0/P1.
- downstream renderer note: TASK-029/TASK-030 should add engine-produced KO/replacement/effect fixture segments
  for renderer behavior coverage rather than inventing synthetic transcripts.

Inspect the complete branch diff and confirm no unrelated changes.

## Dependencies

- TASK-007 — DONE; ADR-004 accepted architecture.
- TASK-008 — DONE; SPEC-003 event semantics.
- TASK-009 — DONE; authoritative `CombatEvent` implementation.
- TASK-010 — DONE; authoritative combat replay/fixture baseline.
- TASK-026 — DONE; SPEC-016 renderer split and downstream ownership.
- TASK-038 / SPEC-015 — DONE/APPROVED; public Hunt hidden-information boundary.

## Risks / irreversible actions

- Raw wild HP/damage/healing numerics would create a hidden-stat oracle.
- Presentation-side combat calculations would create a second authority path.
- Renderer-specific payload fields would cause Card/Pixi semantic drift.
- No irreversible action is authorized.

## Expected files / boundaries

- `packages/game-protocol/**`
- `pnpm-lock.yaml` only for the internal `@pokenexus/game-core` workspace dependency
- `tasks/active/TASK-028-combat-presentation-event-contract.md`
- `docs/project/PROJECT_ROADMAP.md`
- `docs/project/PROJECT_ROADMAP.html` generated from the Markdown roadmap

No `game-core` production semantics, API routes, database schema or renderer implementation should change.

## Completion

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
