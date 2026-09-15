# TASK-008 — Combat Rules Spec v1

## Metadata

- State: DONE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: DEFAULT
- Reviewer: QA Reviewer
- Reviewer execution surface: ChatGPT worker (independent)
- Auditor: N/A
- Auditor execution surface: N/A
- Spec: `docs/specs/SPEC-003-combat-rules-v1.md`
- ADR:
  - `docs/decisions/ADR-004-universal-combat-engine-architecture.md`
- Branch: `spec/TASK-008-combat-rules-spec-v1`
- Worktree: `.worktrees/TASK-008-combat-rules-spec-v1`

## Objective

Define and obtain Human Owner acceptance for the first executable PokeNexus combat-rules contract
consumed by the universal deterministic Combat Engine.

The specification must be precise enough for TASK-009 to implement the resolver without inventing
damage, timing, targeting, RNG-consumption, KO, replacement, event or arithmetic semantics.

## Context

SPEC-001 established the domain vocabulary and deferred executable combat meaning to TASK-008.
SPEC-002 established immutable game-data/rules identities and explicitly kept source Pokémon data
separate from executable PokeNexus semantics. ADR-004 established one mode-agnostic deterministic
resolver with explicit logical time, RNG, ordered CombatStimulus replay and versioned Combat Events.

TASK-008 now freezes the smallest coherent v1 ruleset that can exercise that architecture. It is
not required to reproduce every franchise move/Ability mechanic before the engine foundation can
exist; unsupported mechanics must fail closed rather than being inferred from prose or silently
approximated.

## Scope

- derived combat stats and IV numeric domain;
- move-loadout battle constraints;
- player/content-defined ordered `1..4` Move sequence semantics for external automatic policy;
- logical-time readiness/cooldown semantics;
- deterministic simultaneous-readiness ordering and Speed semantics;
- target legality;
- executable Physical/Special/Status category semantics;
- accuracy, critical hit, damage variance and exact RNG-consumption order;
- exact base-damage formula and rounding;
- STAB and type-effectiveness math;
- minimum-damage and immunity behavior;
- baseline executable MoveRule / AbilityRule / EffectRule ownership boundaries;
- battle/cadence-scoped timed-effect primitives plus Battle-local stat stages required by explicitly
  authored rules;
- KO, forced replacement and baseline victory semantics;
- initial authoritative Combat Event taxonomy/semantic requirements;
- rulesVersion / event-schema obligations inherited from SPEC-002 and ADR-004.

## Out of scope

- production TypeScript implementation;
- broad authored coverage for every Pokémon move or Ability;
- inventory/item use in combat;
- capture, XP, rewards or progression mutation;
- voluntary switching, forfeit, PvP clocks or mode-specific team constraints;
- Hunt/Duo/PvP/Gym/World Boss orchestration;
- persistence/protocol schemas;
- persistent Pokémon Move-loadout editing/storage/API/UI implementation;
- animation/cast timing;
- move priority;
- EVs, Natures, breeding or held-item modifiers;
- accuracy/evasion stat stages;
- weather, terrain, field hazards or other environment systems unless separately accepted later;
- final long-term balance tuning or performance budgets.

## Acceptance criteria

- [x] SPEC-003 defines exact derived-stat formulas and IV domain without stealing level-cap policy.
- [x] Logical combat time uses deterministic integer milliseconds and no tick/wall-clock rule.
- [x] useMove/replacement resolve only at current combatTimeMs; time changes only through explicit
      monotonic advanceTime, which stops at terminal/replacement blocking boundaries.
- [x] Speed has one explicit v1 role and cannot accidentally alter cooldown/DPS through hidden math.
- [x] Actor GCD + per-Move cooldown readiness, simultaneous ordering and action legality are deterministic.
- [x] Global action cooldown is exactly 2000 ms and every published per-Move cooldown is an integer
      >= 2000 ms, preventing meaningless sub-GCD cooldowns and zero-time action loops/starvation.
- [x] Cross-Battle cadence continuity is explicit: Battle-local clocks may restart at zero, but
      remaining actor GCD/per-Move cooldown delays carry across chained Battles in one cadence scope;
      only deterministic modeled inter-Battle elapsed time reduces those remaining delays.
- [x] Allowlisted simple-damage cooldown resolution requires positive integer Power/PP and uses the
      exact continuous rulesVersion curve/quantization from SPEC-003; source PP is never consumed
      as battle state.
- [x] The v1 loadout rule is explicit, including player/content-defined ordering, uniqueness,
      `1..4` capacity and PP behavior.
- [x] Automatic ordered-Move policy semantics are deterministic: fresh cadence scope starts at slot 1,
      scans cyclically for the first ready/legal Move, advances only after accepted execution, skips
      cooling-down/currently unusable slots without mutating the cursor, carries the cursor across
      chained Battles, and emits no knowingly invalid fallback intent when no slot is currently usable.
- [x] Actor GCD and per-Move cooldowns are not reset by a Battle boundary inside one cadence-continuity
      scope; exact remaining-delay carry-out/carry-in and deterministic inter-Battle gap subtraction
      are specified without wall-clock dependence.
- [x] Ordered automatic selection remains outside the universal Combat Engine resolver under ADR-004;
      TASK-009 validates/resolves supplied ActionIntents and does not own hidden Move choice.
- [x] Physical/Special/Status semantics and unsupported-move behavior are fail-closed.
- [x] Generic simple-damage compilation is gated by immutable MoveId allowlist rather than inferred
      from incomplete source fields.
- [x] Accuracy/null-accuracy, crit, variance, RNG draw order and rejected-action RNG behavior are exact.
- [x] Damage arithmetic/rounding, STAB, type multiplication, immunity and minimum damage are exact.
- [x] Source PokémonDB facts are never interpreted as executable status/Ability prose.
- [x] Target selection has no implicit retarget/random-target fallback and multi-target order is canonical.
- [x] Every target scope defines exact active/living/self/ally/enemy eligibility; reserves are not
      targetable and the target set is frozen before action mutation/RNG.
- [x] Effect/stat-stage primitives are deterministic and do not create an infrastructure callback path.
- [x] Finite timed effects explicitly declare `lifetimeScope = battle | cadence`; no scope is inferred.
      Battle-scoped state terminates at Battle end, while cadence-scoped DoT/HoT/Buff/Debuff/lock/
      Active Effect state carries for the same continuing participant.
- [x] Inter-Battle elapsed time advances cadence effects through the same deterministic game-core
      effect evaluator; due ticks/expiries can mutate HP and may KO a Pokémon before the next Battle.
- [x] Solo Hunt cadence carries current HP for the same player-owned Pokémon through the gap; cadence
      effects mutate that HP and Battle transition itself does not auto-heal it.
- [x] Every new Battle initializes supported stat stages to `0`, rejects prior Battle-scoped effects,
      and accepts cadence-effect carry-in only through validated deterministic cadence state.
- [x] Cadence effect carry never keys continuity by Battle-scoped `CombatantId`: player-owned
      continuation binds to stable `PokemonInstanceId`, later non-player continuation requires an
      equally stable accepted cadence identity, and new-Battle rebinding is explicit one-to-one.
- [x] Potion/healing/revival item semantics remain owned by TASK-022/TASK-033; item use during Hunt
      cadence must be explicitly ordered relative to effect boundaries and must not create a second
      damage/healing resolver in orchestration.
- [x] Performance consequence is explicit: cross-Battle effect carry is small bounded state, while
      cost scales with the number of due periodic boundaries; pathological authored schedules require
      publication/performance constraints rather than hidden tick aggregation.
- [x] Fresh-Hunt reset/anti-abuse disclosure covers cadence-effect cleanse as well as GCD/Move/cursor
      reset, and Buff/Debuff labels never imply unsupported stat modifiers or source-prose behavior.
- [x] Abilities execute only through explicit authored AbilityRule entries; unsupported semantics fail closed.
- [x] BattleStarted/battleStart Ability reactions have a frozen cross-Combatant order and reserves
      do not implicitly fire startup reactions on later activation.
- [x] KO/replacement/victory behavior is sufficient for one-or-more active Combatants per Battle Side.
- [x] Battle initialization requires >=2 sides, positive activeCapacity, globally unique
      CombatantIds and fully populated initial active slots from living eligible Combatants.
- [x] KO is non-revivable in baseline v1; healing/effect primitives cannot resurrect or newly
      modify a KO Combatant.
- [x] Mandatory replacement gates further actions/time while fillable active vacancies remain, and
      reserve readiness is defined before first activation.
- [x] Same-time scheduled effect boundaries can resolve deterministic mutual KO/draw before
      terminal outcome is finalized.
- [x] Voluntary switching remains disabled in baseline v1 rather than being accidentally invented.
- [x] Initial Combat Event semantic taxonomy includes logical time/sequence requirements and excludes
      infrastructure timestamps from authoritative equality.
- [x] Branch event order is exact for miss/immunity/crit/damage/effect tick/KO/replacement/end.
- [x] Event/replay semantics preserve ADR-004's ordered CombatStimulus and pinned version invariants.
- [x] Known GCD/per-Move-cooldown, sequential-loadout throughput/order, cross-Battle cadence continuity,
      fresh-Hunt restart-reset abuse risk, repeat-spam limit, PP-correlation/double-weighting,
      exact-Speed tie-break and no-universal-timeout consequences are exposed for Human Owner
      acceptance rather than hidden as implementation behavior.
- [x] Roadmap records the required future production combat-rule content/catalog gate before broad
      status/Ability/complex-Move content can ship.
- [x] TASK-009 is left implementation freedom only where it cannot change observable rules.
- [x] No production source/package/dependency change occurs in this specification task.
- [x] Fresh independent architecture/determinism and game-rules/balance/performance QA report no
      unresolved findings after the Human Owner-directed cadence-effect/inter-Battle-KO/HP-continuity delta.
- [x] Human Owner explicitly accepts SPEC-003 before TASK-009 may implement these combat semantics.

## Validation / review

```text
corepack pnpm roadmap:generate
corepack pnpm roadmap:check
git diff --check
```

Also verify:

- complete diff is limited to TASK-008 task/spec/roadmap planning artifacts;
- no `packages/**`, `apps/**`, manifest or lockfile change;
- every output-affecting formula/order/RNG decision is versioned rule semantics;
- no mode-specific resolver branch is introduced;
- no PokémonDB prose is treated as executable behavior;
- SPEC-003 remains compatible with SPEC-001, SPEC-002 and ADR-004.

Current acceptance result:

- independent architecture/determinism QA on the GCD + per-Move cooldown model:
  P0/P1/P2/P3 = 0/0/0/0 — READY;
- independent cooldown balance/performance QA: P0/P1/P2/P3 = 0/0/0/0 — READY;
- balance findings were incorporated into the proposal: quantization reduced from 250 ms to 100 ms,
  loadout-throughput impact is explicit, PP correlation/double-weighting is explicit, and a
  mechanically simple Move may leave the generic allowlist for an authored exact cooldown;
- `corepack pnpm roadmap:check`: PASS — 87 tasks;
- `git diff --check`: PASS;
- Human Owner approved replacing the universal fixed Move cooldown with `2000 ms` actor GCD plus
  per-Move cooldowns resolved from Power + PP for simple Moves and explicit authored
  cooldowns for Status/complex Moves;
- Human Owner subsequently clarified that player-configured Move Loadouts remain `1..4`, not
  exactly four; SPEC-003 now makes the ordered sequence mechanically meaningful while keeping
  Move selection outside the resolver;
- Human Owner then explicitly rejected intra-Battle-only cooldown semantics: chained Battles within
  the same Hunt/session must preserve remaining actor GCD and per-Move cooldowns. SPEC-003 now uses
  deterministic remaining-delay carry-in/carry-out and proposes carrying the sequence cursor across
  the same cadence scope so Battle boundaries do not alter cadence/rotation;
- Human Owner first chose Battle-local effect reset, then revised that decision after comparing it
  with Hunt-wide cooldown continuity: timed effects now have explicit `battle | cadence` lifetime
  scope, deterministic inter-Battle time counts for `cadence`, and a DoT may KO a Pokémon before
  the next Battle; stat stages remain Battle-local;
- Human Owner explicitly framed surviving inter-Battle damage as player resource-management pressure
  through Potions. TASK-008 does not invent Potion/revival behavior; TASK-022/TASK-033 own those item
  semantics/timing while TASK-009 must keep effect resolution in the shared game-core kernel;
- Human Owner clarified the later Solo Hunt lifecycle expectation: if a Pokémon becomes KO and another
  living eligible team member exists, Hunt orchestration continues with the next Pokémon; if no living
  eligible Pokémon remains, TASK-033 must define a mandatory intervention state that prevents a new
  Battle until an accepted action such as Revive/item use or return to city resolves the situation.
  TASK-035 implements that lifecycle, TASK-038 exposes the commands, and TASK-039/040 present it;
- fresh architecture/determinism QA on the final cadence-effect + stable-identity + HP-continuity
  model: P0/P1/P2/P3 = 0/0/0/0 — READY;
- fresh game-rules/balance/performance QA on the same final model:
  P0/P1/P2/P3 = 0/0/0/0 — READY;
- Human Owner explicitly accepted the complete corrected SPEC-003, including the exact continuous
  Power+PP curve, 100 ms quantization, ordered cyclic sequential-policy semantics, cross-Battle
  cooldown continuity, scoped timed-effect cadence, inter-Battle HP continuity and KO semantics;
- repository-completion authorization: Human Owner explicitly authorized commit/push/merge for TASK-008 on 2026-09-15; this does not start TASK-009 implementation.

## Dependencies

- TASK-004 — Domain Glossary & Core Model Spec: DONE.
- TASK-005 — Core Domain Type Skeleton: DONE.
- TASK-006 — Static Game Data Schema & Rules Versioning: DONE.
- TASK-007 — ADR-004 Universal Combat Engine Architecture: DONE.
- SPEC-001 — Core Domain Vocabulary & Model: APPROVED.
- SPEC-002 — Static Game Data, Versioning & PokémonDB Ingestion: APPROVED.
- ADR-004 — Universal Deterministic Combat Engine Architecture: ACCEPTED.

## Risks / irreversible actions

- Copying franchise mechanics implicitly would make source/reference knowledge an undeclared rules
  authority; every PokeNexus mechanic must be explicit here or in a later accepted rules version.
- Too many v1 effect families would expand engine complexity before replay/performance foundations
  exist; fail-closed unsupported mechanics are safer than approximate behavior.
- Hidden floating-point/rounding differences can break replay across implementations.
- Letting Speed alter GCD/Move cooldown without an explicit rule would create large DPS scaling and
  balance coupling; v1 uses Speed only for deterministic same-time initiative ordering.
- Treating PP as battle fuel would make long idle sessions require a restoration economy not yet
  specified; v1 uses PP only as a pinned-game-data input to cooldown resolution for eligible Moves.
- No destructive or remote runtime operation beyond the explicitly authorized TASK-008 Git completion flow is authorized by this specification task.
- Human Owner explicitly authorized TASK-008 commit/push/merge completion on 2026-09-15.

## Expected files / boundaries

```text
tasks/done/TASK-008-combat-rules-spec-v1.md
docs/specs/SPEC-003-combat-rules-v1.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

No production source file or dependency may change in TASK-008.

## Completion

Completed after independent QA reported no unresolved findings, the Human Owner explicitly accepted SPEC-003, and the Human Owner explicitly authorized repository completion for TASK-008 on 2026-09-15.

TASK-009 remains a separate implementation task and is not started by this completion.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
