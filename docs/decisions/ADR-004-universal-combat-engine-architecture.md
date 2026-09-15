# ADR-004 — Universal Deterministic Combat Engine Architecture

## Status

Accepted

## Context

PokeNexus will support multiple battle-capable product modes with materially different
orchestration needs: Solo Hunts advance from elapsed time without a persistent server tick,
Duo may coordinate synchronously, PvP may introduce competitive orchestration, and future
Gyms/Challenges/World Boss content may add mode-specific setup and result handling.

Those modes must not grow separate combat-resolution implementations. SPEC-001 already defines
Battle, Battle Side, Combatant Snapshot and Combatant State and requires mode orchestration to
stay outside combat resolution. SPEC-002 requires authoritative history to pin immutable
`gameDataVersion` and `rulesVersion` identities and retain referenced semantics.

The architecture therefore needs one resolver boundary that can execute the same rules
deterministically in API, offline/event-driven simulation and realtime orchestration without
depending on network, persistence, presentation or wall-clock infrastructure.

This ADR defines that boundary. It deliberately does not define the numerical/gameplay rules
owned by TASK-008.

## Decision

### 1. One Combat Engine

PokeNexus has one universal Combat Engine in `packages/game-core`.

Every battle-capable mode creates/feeds accepted combat inputs into that engine and consumes its
events/outcome. Solo Hunt, Duo, PvP, Gym/Challenge, World Boss and future modes must not own a
parallel damage/action/effect resolver.

The engine must not branch on a product-mode identity such as `hunt`, `pvp`, `gym`,
`duo` or `world-boss`. Mode-specific orchestration may select participants, create generic
combat inputs, impose accepted external eligibility constraints and react to results. When a
mode needs a modifier that changes combat resolution, its accepted mode/rule spec must normalize
that requirement into generic versioned combat configuration understood by the universal rules;
the orchestrator must not calculate an alternate damage/effect path itself. Authoritative
battle-state mutation remains inside the universal resolver.

Every normalized modifier/configuration value that can affect authoritative resolution is frozen
for that Battle. It must either be carried in immutable Battle initialization/state input or be
resolved through a concrete immutable identity/hash pinned by the Battle. Historical replay must
never consult an ambient/current mode configuration whose value can change underneath it.

### 2. Pure deterministic transition boundary

The engine operates as deterministic transitions over explicit values. Conceptually:

```text
initialize(
  BattleInit,
  ResolvedCombatContext,
  DeterministicInputs
) -> TransitionResult

transition(
  BattleState,
  CombatStimulus,
  ResolvedCombatContext,
  DeterministicInputs
) -> TransitionResult {
  nextState,
  events,
  deterministicState
}
```

Initialization follows the same deterministic-input discipline as later transitions. The
concrete TASK-009 API may therefore accept/return the same deterministic state envelope during
initialization. If the accepted TASK-008 rules do not consume RNG/time while initializing, that
state is returned unchanged rather than sourced from ambient globals.

This is an architectural shape, not the final TypeScript API.

An accepted transition never mutates caller-owned input state in place and never performs
infrastructure side effects. The returned next state is the only authoritative battle-local
state produced by that transition.

The engine may expose initialization, intent-resolution and explicit time-advancement operations
as separate pure functions if that is clearer in TASK-009. The invariant is that every
authoritative combat mutation passes through the same deterministic resolution boundary.

### 3. Battle initialization

Battle initialization receives explicit Battle Sides / Combatant Snapshots plus the resolved
static/rule context required by accepted rules. It produces battle-local state; it does not
mutate persistent Pokémon instances, teams, inventory or progression.

Initialization validates required identity/version compatibility before authoritative combat
resolution starts. A Battle that cannot resolve its pinned rules/data context does not start
under a guessed/current fallback.

### 4. ActionIntent is selected outside the resolver

An `ActionIntent` represents an actor/policy/orchestrator request for an action. Human input,
AI policy and mode orchestration produce intents outside the Combat Engine.

The engine is authoritative for validating the supplied intent against current battle state and
accepted rules, including actor/action/target legality. The engine then resolves the accepted
intent. It never selects the actor's move/action itself.

This separation is mandatory for replayability and cross-mode reuse: changing AI or player-input
policy must not change the implementation of combat math/resolution.

Clients may calculate legal-action hints for UX, but those hints are not authoritative.

### 5. Rejection is atomic

An intent rejected before accepted combat resolution leaves **all authoritative battle and
deterministic state unchanged**. This includes Battle State, combat RNG seed/cursor/state,
logical/scheduled time state, authoritative event sequence/counters and any other state that can
affect future resolution. A rejected intent emits no authoritative Combat Event or Battle Outcome
change.

Adapter/audit systems may record invalid command attempts outside the engine. If TASK-008 later
defines a particular failed attempt as a legal in-battle action with consequences, it is modeled
as an accepted rule/action rather than relying on partial validation side effects.

### 6. Explicit time advancement; no engine tick

The Combat Engine does not own a wall-clock loop, timer or server tick.

Rules that depend on elapsed/logical time receive explicit time input. When accepted rules need
consequences to resolve without a new actor action, the caller may request deterministic
advancement to an explicit logical time through the same pure resolution boundary.

This permits Solo Hunt/offline catch-up to advance combat in batches/events while allowing a
realtime room to feed the same resolver with explicit time inputs. TASK-008 decides the v1 time
model, units, cooldown/initiative rules and exact scheduling semantics.

Caller partitioning is not itself a game rule. In the absence of an interleaved external
stimulus, deterministic advancement from logical time A directly to C must be semantically
equivalent to advancement A→B followed by B→C: same final authoritative state, same flattened
ordered Combat Events and same deterministic-state/RNG position. If an accepted future rule
needs an intermediate boundary to matter, TASK-008 or the owning later rule spec must represent
that boundary as an explicit ordered CombatStimulus rather than relying on API call cadence.

The engine never calls `Date.now()`, sets timers or depends on event-loop timing for semantics.

Combat Events may carry deterministic logical battle time and/or authoritative sequence values
when the accepted TASK-008 event/rule model requires them. Those values come from the explicit
combat timeline/state, not from infrastructure wall-clock reads.

Operational/audit layers may attach external timestamps such as `recordedAt` when persisting,
transporting or observing an event. Those timestamps are non-authoritative metadata: they do not
change combat resolution, event ordering, replay identity or deterministic equality of the
authoritative Combat Event stream.

### 7. Explicit deterministic randomness

Combat randomness is an explicit deterministic input/state. The implementation must not call
`Math.random()` or use hidden mutable global RNG state.

The exact PRNG algorithm and representation are implementation/rules-version details, but the
accepted architecture requires enough explicit seeded/stateful identity to reproduce the same
authoritative transition sequence and to checkpoint/resume without silently resetting the RNG
stream.

Any PRNG algorithm/version/parameter that can change authoritative outputs is part of the retained
rules implementation identity for the pinned `rulesVersion`; changing that behavior requires a
new rules version rather than reinterpreting the same seed under a different generator.

Randomness used by an external AI/action policy is a separate domain. Policy selection must not
consume the Combat Engine RNG stream, because changing policy behavior or the number of policy
rolls must not shift damage/accuracy/crit/effect randomness inside the resolver.

If historical replay regenerates ActionIntents instead of storing the normalized intent stream,
the policy's immutable version/configuration, deterministic inputs and policy RNG identity/seed
must be pinned separately. If replay stores the authoritative intent stream, policy internals are
not required to re-resolve the already supplied actions.

If a checkpoint resumes policy generation midstream instead of replaying that policy from its
origin, the checkpoint must also preserve enough deterministic policy continuation state to
resume exactly — for example policy RNG cursor/state plus any deterministic policy memory or
counters. Exact checkpoint serialization remains owned by later persistence/replay tasks.

### 8. Rules/data are resolved before transition side effects

Every Battle pins the SPEC-002 static context:

```text
{
  gameDataVersion,
  rulesVersion
}
```

The pair must be explicitly compatible and resolvable. No consumer infers compatibility from
version strings or substitutes the latest version.

The Combat Engine consumes immutable resolved static-data access and immutable resolved combat
rules/configuration suitable for the pinned pair. Resolution code does not perform live
PokémonDB requests, database queries, filesystem reads, HTTP calls or other I/O while mutating
battle state.

`rulesVersion` is resolved through a versioned rule artifact/registry boundary rather than
scattered product-mode checks against version strings. TASK-008 defines the v1 executable rules
and TASK-009 chooses the concrete code/module organization consistent with SPEC-002 retention.
If an implementation change alters observable authoritative combat semantics, it cannot silently
reuse the previous rules identity: the changed semantics require a new immutable `rulesVersion`.
Non-semantic implementation refactors must not mutate the already-published rules descriptor or
change authoritative outputs for that rules version; concrete equivalence/retention mechanics are
implementation/release concerns for later tasks.

### 9. Ordered authoritative Combat Events

Every accepted transition emits an ordered immutable batch of Combat Events representing
authoritative combat consequences. Identical accepted inputs under the same immutable context
produce the same event sequence and next state.

Combat Events use canonical IDs and rule-domain values. They do not contain localized display
copy, CSS/UI instructions, animations or renderer-specific concerns. Presentation layers consume
events through later read-model/presentation contracts.

An event stream is a deterministic output/evidence contract, not an automatic decision to make
all persistent combat state event-sourced. Internal Battle State is likewise not automatically a
database/public protocol schema. Checkpoint, persistence and transport tasks define those
serialization boundaries explicitly.

### 10. Combat event structural version

The structural Combat Event contract uses a dedicated opaque `combatEventSchemaVersion`.

This version is independent from `rulesVersion`:

- `rulesVersion` identifies executable combat semantics;
- `combatEventSchemaVersion` identifies the structural event encoding/shape.

Every Battle pins a concrete execution contract:

```text
CombatExecutionContextRef = {
  gameDataVersion,
  rulesVersion,
  combatEventSchemaVersion
}
```

The first two fields are the unchanged SPEC-002 `StaticContextRef`; the third pins only the
structural event contract used for that combat execution/transcript.

Compatibility between `rulesVersion` and `combatEventSchemaVersion` is explicit and
immutable once published/referenced. Compatibility records are additive: an existing record is
never rewritten to point a historical rules version at a different schema.

Each published `combatEventSchemaVersion` is itself immutable and non-reusable. A structural
change creates a new version; it never mutates the meaning/shape of an already referenced schema
identity.

A single immutable `rulesVersion` may be declared compatible with more than one event schema
version only through separate explicit compatibility records, and each Battle still pins exactly
one concrete `combatEventSchemaVersion`. This permits a structurally new event representation
for unchanged combat semantics without changing how older Battles decode or replay.

Referenced event-schema definitions/codecs must remain resolvable for as long as authoritative
history references them; no "latest event schema" fallback is allowed.

Changing a damage formula with identical event shape creates a new rules version without forcing
a new event schema version. A structural event-envelope migration may create a new event schema
version and a new explicit compatibility record for unchanged rules semantics while historical
Battles continue to pin their original schema.

The exact v1 event union and payload fields remain TASK-008/009 work. TASK-028 owns the
presentation-facing contract built on the authoritative engine output.

### 11. State/events/outcome boundary

The resolver may produce:

- the next Battle State;
- zero or more ordered Combat Events;
- terminal/non-terminal status and, when terminal, an authoritative Battle Outcome under the
  accepted victory rules;
- updated deterministic engine state required for subsequent resolution, including RNG state
  where applicable.

The Battle Outcome is still combat-local. Reward granting, XP, capture, inventory mutation,
rating, persistence writes, Hunt progression and other durable product consequences are handled
by authoritative consumers outside the Combat Engine.

### 12. Effect/status execution uses the same boundary

Effects/statuses do not receive a privileged side-effect mechanism. If TASK-008 defines an
effect that changes battle state, schedules a later consequence or consumes randomness, it runs
through the same deterministic state/event/RNG/time model as move resolution.

The architecture permits battle-local Active Effect state and deterministic triggers, but
TASK-008 owns the concrete effect algebra, trigger order, stacking, duration and semantics.

### 13. Concurrency and transport remain outside game-core

The engine is a deterministic resolver, not a concurrent network actor.

API/realtime orchestrators own:

- network message ordering;
- duplicate/retry handling;
- stale-client command detection;
- room ownership/routing;
- persistence transactions;
- authentication/authorization;
- broadcast/backpressure.

They serialize authoritative stimuli against a specific Battle State and invoke the resolver.
If accepted rules intentionally permit simultaneous/tied actions, TASK-008 defines deterministic
ordering/tie-break semantics from explicit inputs; packet arrival races never become game rules.

No Durable Object, WebSocket, HTTP, database, React or Pixi concept belongs in the engine.

### 14. Replay invariant

For a Battle whose pinned immutable context resolves through the retained evaluator/artifact
descriptor of its `rulesVersion`, the architectural replay invariant is:

```text
same initial Battle input/state
+ same { gameDataVersion, rulesVersion, combatEventSchemaVersion }
+ same explicit combat RNG seed/state
+ same ordered normalized CombatStimulus stream
= same accepted/rejected transition decisions
+ same ordered Combat Event sequence
+ same terminal outcome/final Battle State
```

The ordered `CombatStimulus` stream preserves the exact interleaving of normalized
`ActionIntent` submissions, explicit time-advancement requests and any later accepted stimulus
kind. Replay must not reconstruct ordering from separate action/time lists.

"Same initial Battle input/state" includes every normalized resolution-affecting generic
modifier/configuration value and every pinned immutable reference/hash needed to resolve such
configuration. Replay never substitutes the current value of a mutable mode configuration.

When ActionIntents inside that stimulus stream are regenerated instead of stored, the
deterministic policy identity/config/inputs/seed are additionally part of replay identity.
Checkpoint continuation additionally pins the policy deterministic continuation state unless the
policy is replayed from origin to reconstruct it.

TASK-010 proves this invariant with fixtures/property/replay tests after TASK-009 exists.

## Package / ownership consequences

`packages/game-core` owns pure deterministic battle initialization/resolution implementation.
Infrastructure-free structural primitives may be shared through `packages/game-types` when an
implementation task demonstrates the need. Versioned static catalogs remain in
`packages/game-data` under SPEC-002.

Apps/services adapt the engine; they do not redefine its semantics:

- `apps/api`: authoritative command/persistence orchestration;
- `apps/realtime`: room/order/broadcast coordination for accepted realtime modes;
- `apps/web`: player input/presentation only;
- `packages/database`: persistent representations/adapters only.

## Consequences

### Positive

- every battle mode shares one authoritative resolver;
- deterministic offline, replay and realtime execution use the same core semantics;
- AI/policy can evolve without forking combat resolution;
- explicit RNG/time/version inputs expose hidden nondeterminism early;
- event consumers can evolve structurally without conflating event encoding with game rules;
- infrastructure and product-mode concerns stay outside the pure domain kernel.

### Costs / constraints

- historical rules/data/event compatibility must remain resolvable while referenced;
- callers must explicitly manage sequencing/time/policy/version resolution rather than relying on
  ambient globals;
- checkpoint/replay design must preserve deterministic engine state such as RNG position;
- later rule specs must define ambiguous ordering/timing rather than allowing implementation
  accident or packet timing to choose outcomes.

## Rejected alternatives

### Separate resolver per mode

Rejected because Solo/Duo/PvP/Gym/World Boss behavior would drift and deterministic parity would
become difficult to prove.

### Engine-owned AI/action selection

Rejected because policy changes would become coupled to resolution semantics and replay would
depend on current AI behavior.

### Persistent realtime combat loop inside game-core

Rejected because it conflicts with ADR-002, couples core logic to runtime scheduling and makes
offline advancement unnecessarily expensive.

### Hidden/global RNG or system clock

Rejected because authoritative replay cannot reproduce hidden environmental state reliably.

### RulesVersion as event-schema version

Rejected because rule semantics and serialization structure evolve for different reasons.

### Battle State as the public persistence/protocol contract

Rejected because it would freeze internal resolver structure before checkpoint, persistence and
transport requirements are accepted.

## Deferred decisions

TASK-008 owns all concrete combat rules, including damage/stat/IV formulas, exact timing model,
Speed semantics, accuracy/crit, target rules, move/Ability/effect behavior, KO/switch semantics,
active-combatant cardinality, victory conditions, arithmetic/rounding policy and the initial
Combat Event taxonomy required to express those rules.

TASK-009 owns the concrete TypeScript API/module shape, PRNG implementation, rule resolver
organization and efficient immutable/controlled-mutation implementation strategy provided the
observable architecture above remains deterministic and pure.

TASK-010 owns replay/property/golden-fixture proof. TASK-028 owns presentation consumption.
Persistence/realtime/mode tasks own their adapter-specific serialization, ordering and lifecycle.

## Human Owner acceptance decisions

Accepting ADR-004 ratifies these architectural decisions:

1. one universal mode-agnostic Combat Engine in `packages/game-core`;
2. deterministic state-transition architecture with no infrastructure side effects;
3. ActionIntent selection/AI/policy outside the resolver, with engine-side authoritative legality
   validation and resolution;
4. explicit deterministic time advancement with no engine-owned server tick;
5. explicit combat RNG state and strict separation from policy RNG;
6. pinned SPEC-002 `{ gameDataVersion, rulesVersion }` context with no latest-version fallback;
7. resolved immutable rules/static-data input rather than I/O during combat transitions;
8. ordered presentation-neutral authoritative Combat Events;
9. concrete per-Battle `combatEventSchemaVersion` pin plus immutable/additive explicit
   compatibility with `rulesVersion` and retained historical schema resolution;
10. internal Battle State is not automatically a persistence/public protocol contract;
11. rewards/capture/progression/persistence/network orchestration stay outside the engine;
12. concurrency/packet ordering stays in adapters; intentional simultaneous/tie semantics belong
    to TASK-008, not arrival timing;
13. effect/status execution must use the same deterministic transition/RNG/time/event boundary;
14. deterministic replay is defined by pinned versions + explicit RNG/time + ordered normalized
    stimuli, with all resolution-affecting generic configuration frozen/pinned for the Battle and
    external policy identity/continuation state pinned when intents are regenerated;
15. logical combat time/sequence may be authoritative event data, while infrastructure wall-clock
    timestamps are external observability metadata and never affect combat semantics or replay.
