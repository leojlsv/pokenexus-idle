# SPEC-030 — Gameplay Balance Telemetry (Draft)

## Status

`APPROVED DESIGN — implementation not authorized`

> **Owner/lifecycle provenance (2026-10-16, documentary only):** the line above records the earlier **design-only approval**, not a prohibition retroactively canceling separately authorized bounded work. A subsequent TASK-132 Class-B source implementation is **ACTIVE in its isolated worktree**, while canonical dirty-main TASK-132 remains **PLANNED for integration only**. No main merge, persistent SQL0016 application, telemetry enablement or Git history is authorized by this clarification. The root SQL0016 candidate and TASK-132 isolated draft differ and require their own owner/DB gate. The SPEC-030 design text below is unchanged in authority and must not be treated as implementation acceptance.

## Purpose

Define a future capability to measure Idle gameplay pacing, progression curves and balance health.

This specification exists because balance decisions require observable rates such as:

- XP/hour;
- money/hour;
- loot/hour;
- KO/hour;
- capture/hour;
- progression time.

## Relationship with SPEC-029

SPEC-029 answers:

> "Why did an economic value change?"

SPEC-030 answers:

> "What is the player experience and progression rate?"

They are complementary capabilities.

SPEC-030 does not replace economic provenance.

## Proposed telemetry model

Prefer aggregated gameplay measurements over individual event logging.

Example:

```text
GameplayBalanceSnapshot
  player_segment
  zone
  hunt_definition
  duration_seconds
  player_xp_delta
  pokemon_xp_delta
  money_delta
  loot_summary
  encounters
  victories
  defeats
  pokemon_ko_count
  captures_attempted
  captures_successful
  authority_version
  rules_version
```

## Initial metrics

### Progression

- XP/hour;
- time to level;
- time to evolution;
- progression curve deviation.

### Economy

- money/hour;
- item acquisition rate;
- item consumption rate;
- source/sink imbalance.

### Combat

- KO/hour;
- win rate;
- encounter duration;
- difficulty by zone/team.

### Capture

- attempts/hour;
- success rate;
- balls consumed/hour.

## Non-goals

- No runtime balancing automatically.
- No automatic nerfs/buffs.
- No player manipulation systems.
- No economic authority replacement.
- No requirement to store every combat tick.

## Future scalability boundary

The v1 Hunt telemetry model intentionally uses aggregated completed Hunt/session snapshots.

Future systems with higher temporal resolution requirements, such as PvP combat analysis,
may require a separate event-stream model (for example action-by-action combat events).

This future expansion must be designed separately because PvP telemetry has different:

- volume characteristics;
- retention requirements;
- replay/debugging needs;
- analytical questions.

The existence of future combat event telemetry does not require Hunt telemetry to adopt
high-volume event logging prematurely.

## Recommended v1 direction (pending approval)

Telemetry model:

- player-level measurements as source data;
- later aggregation into cohorts and design dashboards;
- aggregated Hunt/session snapshots instead of every combat or XP tick.

Primary metrics:

- XP/hour;
- money/hour;
- loot/hour;
- KO/hour;
- capture/hour;
- win rate;
- Hunt duration;
- time to level/evolution.

Retention direction:

- detailed player/session data for a limited hot window;
- long-term aggregated metrics for balance history.

Non-goal:

- this telemetry does not become an automatic balancing system.

## Open Human Owner decisions

Resolved decisions:

- Data model: player/session level with later aggregation.
- Granularity: Hunt/session aggregated snapshots, not every gameplay tick.
- Retention: detailed hot window plus long-term aggregates.
- Purpose: balance decisions, not economic authority.

Additional resolved direction:

- Visibility scope: player-level history, anonymous cohorts and operational/design dashboards are supported through controlled access layers.
- Player-facing statistics require separate product approval.
- Telemetry remains observational and does not become gameplay authority.
- Initial metrics: XP/hour, money/hour, loot/hour, KO/hour, capture/hour and zone analysis.
- Analysis priority: progression, economy, difficulty, then capture.

### Approved v1 visibility model

- Internal team analytics: approved first access layer.
- Support tooling: future controlled access.
- Player-facing Analyzer: future product feature requiring separate approval.

### Approved v1 retention model

- Detailed player/session data: 90 days.
- Long-term history: aggregated balance metrics.

Recommended implementation assumption:

- detailed player/session data is the source;
- cohorts and dashboards are derived views;
- access differs between analytics, support and design roles.

### Scope

Should telemetry cover:

- only aggregate server metrics;
- player-level history;
- anonymous cohorts;
- both operational and design dashboards?

### Retention

Define:

- hot query window;
- archival period;
- aggregation granularity.

### Privacy / visibility

Define:

- internal-only metrics;
- player-visible statistics;
- support tooling access.

## Entry gate

Implementation requires:

1. Human Owner approval of this specification.
2. Architecture review.
3. Separate implementation task.
4. Storage/performance budget approval.

## Human Owner approved architecture direction

Approved:

- hybrid telemetry model;
- immutable gameplay decision events as source evidence where causal analysis is required;
- derived GameplayBalanceSnapshot records for dashboards and balance analysis;
- dedicated telemetry storage/schema boundary.

The hybrid model avoids snapshot-only limitations while avoiding a full combat-tick event stream.

## Storage budget and retention direction

Approved direction:

- detailed player/session data: 90-day hot window;
- long-term history: aggregated metrics only;
- telemetry storage must not block gameplay transactions;
- telemetry failure must not alter gameplay outcomes.

## Future scalability boundary

Idle/Hunt telemetry uses aggregated session boundaries.

Future high-frequency systems such as PvP may require a separate combat event telemetry contract with different volume, retention and replay requirements.
