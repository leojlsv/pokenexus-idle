# TASK-007 — ADR-004 Universal Combat Engine Architecture

## Metadata

- State: DONE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: DEFAULT
- Reviewer: QA Reviewer
- Reviewer execution surface: ChatGPT worker (independent)
- Auditor: Independent Auditor
- Auditor execution surface: ChatGPT worker (independent)
- Spec:
  - `docs/specs/SPEC-001-core-domain-model.md`
  - `docs/specs/SPEC-002-static-game-data-and-versioning.md`
- ADR:
  - `docs/decisions/ADR-001-runtime-and-language.md`
  - `docs/decisions/ADR-002-solo-hunts.md`
  - `docs/decisions/ADR-003-hub-and-duo-realtime.md`
  - `docs/decisions/ADR-004-universal-combat-engine-architecture.md`
- Branch: `spec/TASK-007-universal-combat-engine-architecture`
- Worktree: `.worktrees/TASK-007-universal-combat-engine-architecture`

## Objective

Define and obtain Human Owner acceptance for the architecture of the single deterministic
Combat Engine used by every battle-capable PokeNexus mode, without deciding the concrete
combat formulas and balance rules owned by TASK-008.

The architecture must make deterministic replay, offline/event-driven advancement,
multiplayer orchestration and future mode composition possible without allowing Hunt, PvP,
Gym, Duo, World Boss or presentation concerns to branch the core resolver.

## Context

SPEC-001 established Combatant Snapshot, Combatant State, Battle Side, Battle, Action-facing
domain vocabulary and the invariant that mode orchestration stays outside combat resolution.
SPEC-002 established immutable `gameDataVersion` / `rulesVersion` identities, explicit
compatibility and historical resolution requirements. ADR-002 requires Solo Hunts to advance
without a persistent server tick, while ADR-003 constrains realtime networking to explicit
coordination surfaces rather than making the Combat Engine itself a network service.

TASK-007 must therefore define the resolver boundary and deterministic transition model before
TASK-008 can specify formulas/timing/effects and before TASK-009 implements the engine.

## Scope

### 1. Universal engine boundary

- one Combat Engine contract for Solo Hunt, Duo, PvP, Gyms/Challenges, World Boss and future
  battle-capable content;
- engine owns authoritative mutation of battle-local state only;
- product modes/orchestrators create battle inputs and consume outcomes but never implement an
  alternate damage/action/effect resolver;
- accepted mode-specific combat modifiers are normalized into generic versioned rule/config
  inputs consumed by the universal engine rather than calculated by a mode-owned resolver;
- every resolution-affecting generic modifier/config value is immutable for the Battle and is
  either embedded in Battle initialization/state or resolved through a concrete pinned immutable
  identity/hash; replay never reads ambient/current mode configuration;
- engine state contains no product-mode discriminator used to branch resolution behavior;
- `packages/game-core` remains infrastructure-free deterministic TypeScript.

### 2. Deterministic transition model

- battle initialization consumes immutable Combatant Snapshots / Battle Sides plus resolved
  static/rule context and explicit deterministic inputs;
- resolution is modeled as pure state transition: accepted input state is not mutated in place;
- accepted transitions produce a next Battle State and an ordered batch of Combat Events;
- rejected/invalid intents leave all authoritative battle/deterministic state unchanged,
  including Battle State, RNG position, logical/scheduled time and authoritative event counters;
- the engine exposes a deterministic time-advancement capability when accepted rules need
  scheduled/time-based consequences without an actor action; no internal server tick exists.
- absent an interleaved explicit stimulus, splitting one time advance into smaller calls cannot
  change final state/events/RNG position; caller cadence is not gameplay semantics.

### 3. Action policy separation

- a player, AI policy or mode orchestrator produces `ActionIntent` outside the resolver;
- engine validates actor/action/target legality against current state and accepted rules;
- engine resolves only supplied accepted intents; it never chooses a move/action for an actor;
- UI/client legality hints are advisory only and never replace engine validation;
- offline/replay flows that regenerate intents from a deterministic policy must pin that policy's
  immutable identity/configuration/inputs separately from the Combat Engine; checkpoint resume
  midstream also preserves policy RNG cursor/state and deterministic policy memory/counters unless
  policy execution is replayed from origin.

### 4. Explicit randomness and time

- no `Math.random()`, wall-clock reads, timers or hidden mutable global randomness in
  `game-core` resolution;
- combat randomness is supplied through deterministic seeded state/input and returned/advanced
  explicitly enough for checkpoints/replay;
- external AI/policy randomness is a separate deterministic domain and must not consume the
  Combat Engine RNG stream;
- output-affecting PRNG algorithm/version/parameters are bound by the retained rules
  implementation identity and cannot change under the same `rulesVersion`;
- time-dependent rules receive explicit logical/time input; the engine never reads system time;
- authoritative replay pins one ordered normalized `CombatStimulus` stream preserving the
  interleaving of ActionIntents, time advances and any future accepted stimulus kind;
- TASK-008 owns the v1 timing model/units and which rules consume time.

### 5. Rules and static-data resolution

- each battle pins the accepted `{ gameDataVersion, rulesVersion }` pair from SPEC-002;
- incompatible or unresolvable pairs fail before authoritative resolution begins;
- the engine consumes an immutable resolved static-data view and immutable resolved combat-rule
  artifact/context rather than performing web/database/filesystem lookup during transitions;
- `rulesVersion` resolves to executable semantics without runtime `if version === ...`
  scattering throughout feature/mode code;
- an implementation change that alters authoritative combat semantics cannot silently reuse the
  previous rules identity under the SPEC-002 immutable rules envelope;
- exact rule artifact/module/config representation remains for TASK-008/009, but referenced
  historical rule versions must remain resolvable under SPEC-002.

### 6. Combat event contract

- accepted transitions emit immutable ordered Combat Events describing authoritative combat
  consequences, not presentation instructions;
- event order is deterministic for identical accepted inputs;
- event payloads use canonical IDs/values, never localized/display strings as authority;
- a dedicated `combatEventSchemaVersion` versions the structural event contract independently
  from `rulesVersion`;
- each Battle/event transcript pins one concrete `combatEventSchemaVersion` alongside the
  SPEC-002 `{ gameDataVersion, rulesVersion }` pair;
- rules/event-schema compatibility is explicit, immutable once published/referenced and
  append-only; one rules version may gain a separately recorded compatible schema without
  rewriting historical mappings, while each Battle still pins exactly one schema;
- referenced event-schema definitions/codecs remain resolvable; no latest-schema fallback;
- published event-schema version identities are immutable/non-reusable; structural changes create
  a new schema version rather than mutating a referenced identity;
- event schema versioning does not replace `rulesVersion`: rules own semantics, event schema
  owns serialized structural compatibility;
- internal Battle State is not automatically a public persistence/protocol schema, and the event
  stream is not required to be the sole event-sourced persistence model;
- TASK-028 owns presentation/read-model consumption, and persistence/replay tasks own storage.

### 7. Battle outcome and boundary effects

- terminal outcome is produced by the same deterministic resolver under TASK-008 victory rules;
- rewards, captures, XP, persistence writes, matchmaking/rating and Hunt progression are outside
  the Combat Engine and consume its authoritative outcome/events;
- battle-local mutation never directly mutates persistent Pokémon ownership/progression;
- transport/audit rejection of invalid client commands remains an adapter/orchestrator concern
  unless an accepted combat rule explicitly models a failed action as a legal in-battle action.

### 8. Ordering and concurrency boundary

- the Combat Engine is not a concurrent/network actor; callers serialize authoritative stimuli
  against a specific Battle State snapshot;
- realtime room/API orchestration owns network ordering, deduplication, retry and stale-command
  handling before/around calls to the resolver;
- rules that intentionally model simultaneous/tied actions remain deterministic and are defined
  by TASK-008 using explicit inputs/tie-break rules rather than arrival races;
- no lock, Durable Object, database transaction or WebSocket concept enters `game-core`.

### 9. Effect/status extensibility boundary

- architecture supports deterministic effect application and battle-local Active Effect state
  without defining the v1 effect algebra in TASK-007;
- TASK-008 owns exact effect/status kinds, stacking, duration, trigger timing and semantics;
- effect execution must use the same transition/event/RNG/time boundaries as every other combat
  consequence and may not introduce hidden callbacks with infrastructure side effects.

## Out of scope

- damage/stat/IV formulas or numeric domains;
- exact move category semantics, power, accuracy or critical-hit formulas;
- STAB/type-effectiveness math;
- exact target-selection rules and target cardinality;
- cooldown/turn/initiative model, Speed behavior or timing units;
- KO/switch rules, active-combatant cardinality and victory conditions;
- concrete Ability/effect/status behavior and stacking/duration rules;
- exact ActionIntent TypeScript shape or public transport serialization;
- concrete Combat Event taxonomy/payload union beyond the architectural envelope/versioning;
- implementation of the Combat Engine in `packages/game-core`;
- AI decision algorithms or mode-specific policy;
- persistence/checkpoint schema, API/WebSocket protocol or Durable Object topology;
- rewards, capture, XP, inventory or progression mutation;
- PvE/Hunt, PvP, Gym, Duo or World Boss product rules;
- performance budgets/optimization.

## Acceptance criteria

- [x] ADR-004 defines one universal Combat Engine with no mode-specific resolver branch.
- [x] Every resolution-affecting generic mode/config modifier is frozen into Battle input/state or
      resolved through a concrete pinned immutable identity/hash; no ambient current config affects replay.
- [x] Battle-local state mutation authority is confined to deterministic engine transitions.
- [x] Action selection/AI/policy is explicitly outside the resolver; engine validates and
      resolves supplied ActionIntents only.
- [x] Invalid/rejected intents leave all authoritative Battle/deterministic state unchanged and
      emit no authoritative combat consequence unless TASK-008 models the failure as a legal
      accepted action.
- [x] Time-dependent resolution can advance deterministically without a persistent server tick.
- [x] Time advancement is partition-invariant absent an interleaved explicit stimulus, so caller
      cadence cannot become mode-specific game semantics.
- [x] Logical combat time/sequence may be deterministic event data, while external wall-clock/
      audit timestamps remain non-authoritative observability metadata.
- [x] Engine randomness and time are explicit; policy RNG is isolated from combat RNG.
- [x] Output-affecting PRNG algorithm/version/parameters are covered by the retained immutable
      rules identity and cannot silently change under the same `rulesVersion`.
- [x] Replay identity pins one ordered normalized CombatStimulus stream, including exact
      ActionIntent/time-advance interleaving rather than separate unordered input lists.
- [x] Regenerated-policy checkpoint resume preserves deterministic policy continuation state
      unless the policy is replayed from origin.
- [x] Battles pin the accepted SPEC-002 `{ gameDataVersion, rulesVersion }` pair and reject
      incompatible/unresolvable context before resolution.
- [x] Static/rule resolution does not introduce runtime web/database/filesystem dependencies.
- [x] Combat Events are ordered deterministic authoritative consequences and presentation-neutral.
- [x] `combatEventSchemaVersion` is structurally separate from `rulesVersion`, concretely
      pinned per Battle/transcript, and uses immutable/additive explicit compatibility records.
- [x] Referenced historical event-schema versions remain resolvable with no latest-schema fallback.
- [x] Published `combatEventSchemaVersion` identities are immutable/non-reusable.
- [x] Internal Battle State is not silently promoted into a persistence/public protocol schema.
- [x] Network concurrency/order/retry/deduplication remain outside `game-core`.
- [x] Effect/status extensibility is architecturally supported without deciding TASK-008 rules.
- [x] Rewards/capture/progression/persistence stay outside the Combat Engine.
- [x] No production source/package/dependency change occurs in this architecture task.
- [x] Independent QA reports no unresolved P0/P1 findings.
- [x] Independent Auditor reports no unresolved P0/P1 architectural findings.
- [x] Human Owner explicitly accepts ADR-004 before TASK-008/009 may rely on it as accepted
      architecture.

## Validation / review

During DRAFT/approval preparation:

```text
corepack pnpm roadmap:generate
corepack pnpm roadmap:check
git diff --check
```

Also verify:

- complete diff is limited to TASK-007 task/ADR/roadmap planning artifacts;
- `packages/**`, `apps/**`, manifests and lockfile remain unchanged;
- no concrete combat formula/balance/timing rule is silently decided here;
- no mode-specific engine branch or infrastructure dependency is introduced;
- ADR remains consistent with SPEC-001, SPEC-002, ADR-002 and ADR-003.

Current approval-preparation result:

- independent architecture/scope QA: P0/P1/P2/P3 = 0/0/0/0 — READY for Human Owner approval;
- independent determinism/replay audit: P0/P1/P2/P3 = 0/0/0/0 — READY for Human Owner approval;
- `corepack pnpm roadmap:check`: PASS — 87 tasks;
- `git diff --check`: PASS;
- Human Owner explicitly accepted ADR-004, including the distinction between deterministic
  logical combat time and non-authoritative infrastructure/audit timestamps;
- remaining repository-completion gate: separately authorized commit/push/merge flow.

## Dependencies

- TASK-004 — Domain Glossary & Core Model Spec: DONE.
- TASK-005 — Core Domain Type Skeleton: DONE.
- TASK-006 — Static Game Data Schema & Rules Versioning: DONE.
- SPEC-001 — Core Domain Vocabulary & Model: APPROVED.
- SPEC-002 — Static Game Data, Versioning & PokémonDB Ingestion: APPROVED.

## Risks / irreversible actions

- Letting AI/orchestrators resolve combat math would create divergent engines between modes.
- Hidden RNG/time/state makes deterministic replay and offline verification unreliable.
- Coupling policy RNG to combat RNG makes unrelated AI-policy changes alter combat outcomes.
- Treating internal Battle State as a public persistence contract would freeze implementation
  details before checkpoint/protocol requirements are known.
- Conflating `rulesVersion` with event serialization shape would force semantic and structural
  changes to version together unnecessarily.
- Over-specifying formulas/effects here would steal authority from TASK-008.
- No destructive or remote runtime operation is authorized by this architecture task.
- Commit/push/merge were explicitly authorized by the Human Owner for TASK-007 completion.

## Expected files / boundaries

Planning changes are limited to:

```text
tasks/done/TASK-007-universal-combat-engine-architecture.md
docs/decisions/ADR-004-universal-combat-engine-architecture.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

No `packages/**`, `apps/**`, package manifest or lockfile should change in TASK-007.

## Completion

Completed after independent QA/audit, explicit Human Owner acceptance of ADR-004, and explicit
Human Owner authorization for repository completion on 2026-09-15.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
