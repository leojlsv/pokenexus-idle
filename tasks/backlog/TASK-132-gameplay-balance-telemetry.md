# TASK-132 — Gameplay Balance Telemetry

## Lifecycle

`PLANNED`

- Source lifecycle: ACTIVE
- Source branch: `feat/TASK-132-gameplay-balance-telemetry-implementation`
- Source worktree: `.worktrees/TASK-132-gameplay-balance-telemetry-implementation`
- Source task: `tasks/active/TASK-132-gameplay-balance-telemetry.md`

**Control-plane provenance (2026-10-15):** `PLANNED` here means **integration into dirty main remains unreviewed/unapproved**, not that the authorized local implementation stopped. The dedicated `.worktrees/TASK-132-gameplay-balance-telemetry-implementation` remains `ACTIVE` with its own unintegrated technical evidence and SQL0016 draft. The root main SQL0016 differs from that draft; neither may be promoted/applied or combined with SQL0015/0017 without separate lineage/DBA/security gates. Do not infer telemetry enablement, Git handback or PA-M6.1 acceptance from this index.

Specification:

`docs/specs/SPEC-030-gameplay-balance-telemetry.md`

## Objective

Create future balance observability for Idle progression decisions.

Primary outputs:

- XP/hour;
- money/hour;
- loot/hour;
- KO/hour;
- capture/hour;
- progression pacing.

## Scope

Includes:

- player/session measurements;
- Hunt/session aggregated snapshots;
- cohort aggregation;
- balance dashboards after separate approval.

Does not include:

- automatic balance changes;
- combat tick logging;
- replacing economic provenance.

## Entry gate

Requires implementation plan and Human Owner approval before runtime changes.

## Recommended implementation slice (pre-approval)

### Phase 1 — Data contract only

Define the immutable shape of a gameplay balance snapshot without collecting data yet.

Initial dimensions:

- player/session identifier;
- Hunt definition;
- zone/content version;
- duration;
- XP deltas;
- money deltas;
- loot summary;
- encounter count;
- victory/defeat count;
- KO count;
- capture attempts/successes;
- rules and authority versions.

### Phase 2 — Collection boundary

Prefer collecting at completed Hunt/session boundaries instead of individual combat events.

### Phase 3 — Aggregation

Generate balance views:

- XP/hour;
- money/hour;
- loot/hour;
- KO/hour;
- capture/hour;
- progression pacing.

## Explicit non-goals for first implementation

- No automatic balancing.
- No player-facing leaderboard.
- No combat tick telemetry.
- No Economic Provenance replacement.

Future PvP or high-frequency combat analysis may require a separate event telemetry contract.
TASK-132 v1 intentionally does not absorb that higher-volume model.

## Balance decision contract

Before implementation, decisions must map player questions to metrics and sources.

| Balance question | Metric | Source boundary |
|---|---|---|
| Progression is too slow? | XP/hour, time to level, time to evolution | Hunt/session snapshot |
| Zone difficulty is wrong? | KO/hour, win rate, encounter duration | Combat/Hunt summary |
| Economy is too generous or restrictive? | money/hour, loot/hour, item source/sink rate | Reward/economy summary |
| Capture pacing is correct? | attempts/hour, success rate, balls consumed/hour | Capture summary |

## Decision roles

- Human Owner: approves gameplay questions and required metrics.
- Game Design/Balance: defines interpretation of metrics and target curves.
- Data/Analytics: defines aggregation model and analysis needs.
- Backend Architecture: defines collection boundaries and runtime impact.
- DBA/Infrastructure: defines storage, retention and performance constraints.

## Data Contract v1 (design only)

The first contract is a balance snapshot, not a raw gameplay event stream.

### GameplayBalanceSnapshot

Required dimensions:

- player/session identity;
- Hunt definition;
- zone/content identity;
- content/rules/authority versions;
- snapshot duration.

Required measures:

- player XP delta;
- Pokémon XP delta;
- money delta;
- loot summary;
- encounter count;
- victory count;
- defeat count;
- Pokémon KO count;
- capture attempts;
- capture successes.

Derived metrics:

- XP/hour;
- money/hour;
- loot/hour;
- KO/hour;
- capture/hour;
- progression pacing.

### Collection boundary recommendation

Primary source:

`completed Hunt/session`

Avoid as v1 source:

- combat tick events;
- individual XP grants;
- rendering/client telemetry.

### Architecture checkpoint

Storage technology, indexing, partitioning and retention implementation remain separate DBA/Infrastructure decisions after this contract is approved.

## Human Owner architecture approval

Approved direction:

- hybrid model: gameplay decision events + derived balance snapshots;
- dedicated telemetry storage/schema;
- 90-day detailed retention window;
- long-term aggregated balance history;
- no gameplay blocking dependency.

Future PvP/high-frequency telemetry remains a separate contract due to different event volume and replay requirements.

## Architecture review preparation

### Recommended storage direction

Preferred v1:

- dedicated telemetry schema/storage;
- separated from gameplay transactional tables;
- external analytical warehouse remains a future scaling option.

Reason:

- prevents analytics workload from affecting gameplay persistence;
- allows different retention/indexing strategies;
- keeps operational database focused on authoritative state.

### Ingestion requirements

Telemetry collection should:

- observe committed gameplay outcomes;
- avoid blocking gameplay transactions;
- tolerate temporary storage degradation;
- support retry without duplicate snapshots.

Recommended snapshot identity:

- player/session identity;
- Hunt/session boundary identity;
- snapshot window;
- authority/rules version.

### Storage and retention decisions for DBA/Infrastructure

Still required:

- storage technology;
- indexing strategy;
- partition strategy;
- retention enforcement;
- cost budget;
- retry/backfill policy.

These decisions do not change telemetry scope or gameplay metrics.

## Human Owner approved decisions

Approved:

- Metrics:
  - XP/hour;
  - money/hour;
  - loot/hour;
  - KO/hour;
  - capture/hour;
  - zone dimension.
- Visibility:
  - internal team first;
  - future support access;
  - future player-facing Analyzer with separate approval.
- Retention:
  - 90 days detailed player/session data;
  - long-term aggregated balance history.
- Analysis priority:
  1. progression;
  2. economy;
  3. difficulty;
  4. capture.

## Remaining architecture decisions

Before implementation:

- telemetry storage technology;
- schema/index/partition strategy;
- ingestion mechanism;
- retry and deduplication behavior;
- storage/performance budget.

## Pre-Human Owner technical preparation

The following decisions are technical safeguards and do not define product scope:

### Snapshot identity

Each telemetry snapshot should have a deterministic deduplication identity to prevent duplicate collection after retries.

Recommended inputs:

- player/session identity;
- Hunt/session boundary identity;
- snapshot window;
- authority/rules version.

### Consistency boundary

Telemetry should be emitted only after authoritative gameplay state is committed.

Telemetry must not:

- decide gameplay outcomes;
- block gameplay transactions waiting for analytics storage;
- infer results from client state.

### Failure handling

If telemetry storage is unavailable:

- gameplay continues;
- telemetry may be delayed or sampled according to policy;
- missing telemetry is observable through operational metrics.

### Security boundary

Default telemetry should avoid storing:

- secrets;
- raw client payloads;
- unnecessary personal data;
- full combat internals when aggregated metrics are sufficient.

### Implementation gate

After these technical constraints, the remaining Human Owner decisions are product-facing:

- final metric list;
- access visibility;
- dashboard priorities;
- retention policy acceptance.

## Human Owner decisions recorded

Approved direction:

- Scope: player-level source measurements plus cohorts and operational/design dashboards.
- Retention: detailed hot window plus long-term aggregates.
- Visibility: internal controlled access; player-facing statistics require separate approval.

Remaining technical decisions:

- storage technology;
- indexing and partitioning;
- ingestion mechanism;
- performance budget;
- retention enforcement implementation.

## Architecture review preparation

### Storage options

| Option | Recommendation | Reason |
|---|---|---|
| Same gameplay tables | Avoid | Couples operational workload with analytics queries |
| Dedicated telemetry schema/storage | Preferred v1 | Keeps gameplay and analytics concerns separated |
| External warehouse/pipeline | Future option | Useful when player volume requires analytical scaling |

### Retention direction

Recommended:

- detailed player/session snapshots: limited hot window;
- aggregated balance history: long-term retention.

### Performance invariant

Telemetry collection must not block gameplay-critical transactions. Collection should be:

- bounded in payload size;
- asynchronous where possible;
- resilient to telemetry storage degradation without changing gameplay outcomes.

Implementation starts only after the contract above is accepted.

## Code Contract v1 progress

Implemented:

- shared telemetry schema version marker;
- `GameplayTelemetryEvent` type contract;
- `GameplayBalanceSnapshot` type contract;
- deterministic identity placeholders for telemetry events/snapshots;
- initial event families:
  - `HUNT_COMPLETED`;
  - `REWARD_RESOLVED`;
  - `CAPTURE_RESOLVED`;
  - `PROGRESSION_UPDATED`;
  - `AUTOMATION_RESOLVED`.

Location:

`packages/game-types/src/index.ts`

Validation:

- package typecheck PASS;
- package tests PASS;
- `git diff --check` PASS.

Not implemented yet:

- persistence schema;
- ingestion pipeline;
- runtime producers;
- database migration;
- analytics views.

## Implementation Plan v1 (design only)

No runtime authorization is implied by this plan.

### Phase 1 — Telemetry package

Create:

- event type definitions;
- snapshot contract types;
- version dimension model;
- deterministic identity rules.

Validation:

- schema contract tests;
- serialization compatibility tests.

### Phase 2 — Collection adapters

Add producers only at authoritative boundaries:

- completed Hunt/session;
- reward resolution;
- capture resolution;
- progression updates.

Requirements:

- no gameplay transaction blocking;
- idempotent retry behavior;
- bounded payloads.

### Phase 3 — Storage implementation

Create after implementation approval:

- telemetry schema;
- ingestion repository;
- deduplication constraints;
- retention jobs.

### Phase 4 — Derived analytics

Create:

- XP/hour views;
- money/hour views;
- loot/hour views;
- KO/hour views;
- capture/hour views;
- zone/content comparisons.

## Definition of Done (implementation gate)

- Telemetry cannot change gameplay outcomes.
- Duplicate ingestion does not duplicate metrics.
- Version changes remain queryable separately.
- Missing telemetry is observable.
- Snapshot aggregates reconcile with authoritative Hunt results.
- Retention does not remove required aggregate history.

## Current implementation gate

Ready for implementation planning only.

Requires final authorization before:

- migrations;
- runtime producers;
- storage creation;
- ingestion code.

## Operational contract preparation v1 (design only)

### Projection and replay model

Before analytics depends on derived aggregates, define:

- event ordering strategy;
- projection watermark/checkpoint;
- snapshot schema version;
- replay/backfill procedure;
- projection ownership.

Snapshots are derived views and must remain reproducible from authoritative telemetry inputs.

### Ingestion guarantees

Required behavior:

- at-least-once delivery is acceptable;
- ingestion must be idempotent;
- duplicate delivery must not duplicate balance metrics;
- telemetry loss must be observable.

### Implementation readiness checklist

Before runtime implementation:

- storage budget approved;
- retention enforcement defined;
- access permissions defined;
- snapshot identity frozen;
- retry/backfill contract defined;
- operational monitoring defined.

## Physical design preparation v1 (design only)

### Storage boundary

Recommended first implementation:

`dedicated telemetry schema in operational database`

Reason:

- isolates analytics workload from authoritative gameplay tables;
- keeps initial operational complexity low;
- allows future export to analytical storage.

### Logical storage model

Conceptual only, no migration:

```text
telemetry_decision_events
  event_id
  event_type
  player_reference
  session_reference
  source_boundary
  event_timestamp
  rules_version
  game_data_version
  content_identity
  payload_summary

telemetry_hunt_snapshots
  snapshot_id
  player_reference
  hunt_definition
  zone
  duration_seconds
  xp_delta
  money_delta
  loot_summary
  encounter_count
  victory_count
  defeat_count
  ko_count
  capture_attempts
  capture_successes
  rules_version
  game_data_version
  created_at

telemetry_balance_aggregates
  period
  dimensions
  xp_per_hour
  money_per_hour
  loot_per_hour
  ko_per_hour
  capture_per_hour
```

### Physical requirements

Before implementation define:

- partition key (recommended: creation/completion date);
- indexes for zone, hunt, content and version queries;
- snapshot deduplication constraint;
- retention pruning strategy.

### Explicit non-goals

- no migration yet;
- no runtime producer yet;
- no PvP combat event stream;
- no replacement of Economic Provenance.

## Architecture approval recorded

Approved direction:

- hybrid telemetry model:
  - authoritative gameplay decision events;
  - derived GameplayBalanceSnapshot aggregates;
- dedicated telemetry schema/storage as v1 boundary;
- external analytics warehouse remains a future scaling option;
- asynchronous collection where possible;
- gameplay outcome never depends on telemetry availability.

Approved operational constraints:

- detailed player/session telemetry retention: 90 days;
- long-term retention through aggregated balance history;
- deterministic snapshot identity for retry/deduplication;
- version dimensions preserved (`rulesVersion`, `gameDataVersion`, content identity).

Implementation gate:

Runtime collection, schema creation and ingestion implementation still require a separate implementation authorization.

## Technical implementation plan v1 (design only)

### Phase 1 — Event and snapshot contract

Create:

- telemetry decision event taxonomy;
- GameplayBalanceSnapshot schema;
- deterministic snapshot identity;
- version fields for rules/content authority.

No runtime collection yet.

### Phase 2 — Collection boundary

Initial producers:

- completed Hunt/session;
- reward resolution summary;
- capture resolution summary;
- progression summary.

Avoid:

- combat tick stream;
- client generated telemetry;
- inference from mutable current state.

### Phase 3 — Storage implementation

Create only after storage approval:

- dedicated telemetry schema/storage;
- ingestion path;
- retry and deduplication handling;
- retention enforcement.

### Phase 4 — Derived balance views

Initial views:

- XP/hour;
- money/hour;
- loot/hour;
- KO/hour;
- capture/hour;
- progression pacing by zone/content.

## Logical data contract v1 (design only)

This section defines the logical contract before physical storage.

### Gameplay decision events

Events represent authoritative gameplay decisions, not raw combat streams.

Initial event families:

- `HUNT_COMPLETED`
- `REWARD_RESOLVED`
- `CAPTURE_RESOLVED`
- `PROGRESSION_UPDATED`
- `AUTOMATION_RESOLVED`

Common dimensions:

- event_id;
- player/session reference;
- logical timestamp;
- source boundary;
- rules version;
- game data version;
- content identity.

### GameplayBalanceSnapshot

Derived analytical record:

- snapshot_id;
- source event window;
- player/session reference;
- zone/content identity;
- duration;
- XP deltas;
- money deltas;
- loot summary;
- encounter count;
- victory/defeat count;
- KO count;
- capture attempts/successes.

### Explicit non-contracts

Not part of v1:

- every combat action;
- every XP tick;
- client telemetry;
- full RNG/combat replay payload.

### Validation requirements

Before release:

- duplicate snapshot retry test;
- telemetry failure does not alter gameplay outcome;
- version changes remain queryable separately;
- retention pruning does not remove required aggregates;
- dashboard numbers reconcile with authoritative Hunt outcomes.

## Technical implementation preparation (no runtime authorization)

### Telemetry decision event taxonomy v1 (design only)

Initial authoritative decision events:

- `HUNT_COMPLETED`
  - source for duration, encounters, victories, defeats and KO rate;
- `REWARD_RESOLVED`
  - source for reward and loot balance measurements;
- `CAPTURE_RESOLVED`
  - source for capture attempts, success rate and resource consumption;
- `PROGRESSION_UPDATED`
  - source for XP/hour and progression pacing;
- `AUTOMATION_RESOLVED`
  - source for automated Potion/Revive/Capture balance analysis when applicable.

These events observe authoritative gameplay decisions. They do not create gameplay authority or new commands.

### Event requirements

Every event should preserve:

- deterministic event identity;
- player/session reference;
- logical timestamp;
- source boundary;
- rules/content/authority versions;
- bounded reason codes;
- metrics needed for approved balance views.

Do not store by default:

- raw client payloads;
- secrets;
- RNG internals;
- full combat state when aggregate measures are sufficient.

### Phase 1 — Telemetry contract package

Define:

- event taxonomy for authoritative gameplay decisions;
- `GameplayBalanceSnapshot` schema;
- snapshot deduplication identity;
- version dimensions (`rulesVersion`, `gameDataVersion`, content identity);
- retention classes.

### Physical design v1 (design only)

The first physical implementation should preserve separation between authoritative gameplay state and analytical storage.

Recommended logical areas:

`telemetry_decision_events`

- authoritative gameplay decisions relevant to balance analysis;
- immutable append-oriented records;
- bounded payloads with reason codes instead of full runtime state.

`telemetry_hunt_snapshots`

- derived Hunt/session measurements;
- primary source for XP/hour, money/hour, loot/hour, KO/hour and capture/hour views.

`telemetry_balance_aggregates`

- long-term analytical projections;
- cohort and zone/content comparisons.

Recommended indexes:

- completion/event time;
- zone/content identity;
- Hunt definition;
- rules/content version;
- player segment where required.

Avoid excessive indexes because telemetry is write-oriented.

Partitioning recommendation:

- start with time-based partitioning only when measured volume requires pruning efficiency;
- avoid premature multi-dimensional partitioning.

Deduplication:

- snapshot identity must come from authoritative gameplay boundaries;
- retries must not create duplicate balance records.

No migration or physical schema creation is authorized by this design step.

### Phase 2 — Collection boundary

Recommended first sources:

- completed Hunt/session;
- reward resolution summary;
- capture summary;
- progression summary.

Avoid:

- combat tick stream;
- client-generated telemetry;
- mutable-state reconstruction.

### Phase 3 — Storage implementation

After storage approval:

- create dedicated telemetry schema/storage;
- add indexes for balance queries;
- implement idempotent ingestion;
- implement retention enforcement.

### Phase 4 — Analytics views

Generate:

- XP/hour;
- money/hour;
- loot/hour;
- KO/hour;
- capture/hour;
- zone/content comparisons;
- progression pacing views.

## Current gate

Architecture and contract are approved.

Implementation remains blocked until:

- technical storage choice;
- ingestion design;
- performance budget;
- implementation task authorization.

## Local implementation progress

Completed locally after implementation authorization:

- game-types telemetry contracts;
- database ingestion/repository boundaries;
- local PostgreSQL telemetry migration `0016_gameplay_balance_telemetry.sql` (0015 reserved for TASK-130);
- PostgreSQL adapter boundary with idempotent insert design;
- migration/test compatibility updates.

Still pending:

- disposable PostgreSQL integration validation against the new telemetry schema;
- runtime producer wiring from authoritative Hunt outcomes;
- retention jobs and analytical views.

No migration was installed in Pre-alpha or persistent environments.

## Proposed v1 physical design (for architecture approval)

### Storage boundary

Recommended:

- dedicated telemetry schema in the existing platform initially;
- migration to dedicated analytical storage only when measured volume requires it.

Reason:

- isolates analytics queries from gameplay tables;
- avoids premature infrastructure complexity;
- preserves future warehouse migration path.

### Ingestion boundary

Recommended:

- post-commit asynchronous producer;
- deterministic idempotency key;
- retry-safe insertion;
- no gameplay transaction dependency on telemetry availability.

### Initial physical entities (design only)

- `telemetry_gameplay_events` — bounded authoritative decision events;
- `telemetry_hunt_snapshots` — derived balance snapshots;
- `telemetry_daily_aggregates` — long-term balance history.

## Implementation increment — local schema preparation

Authorized local implementation started after Human Owner approval.

Created locally:

- `packages/database/migrations/0016_gameplay_balance_telemetry.sql`

The migration defines the first physical telemetry boundary only. It is not installed in Pre-alpha or any persistent environment.

Validation completed:

- database typecheck PASS;
- database unit tests PASS;
- migration contract tests PASS;
- diff hygiene PASS.

The migration remains local until separate persistence/release gates are approved.
