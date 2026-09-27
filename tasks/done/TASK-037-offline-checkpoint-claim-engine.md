# TASK-037 — Offline / Elapsed-Time Checkpoint & Claim Engine

## Metadata

- State: DONE
- Class: B
- Owner: Lead Developer
- Owner execution surface: current ChatGPT implementation session
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor (replay/concurrency integrity spot-check)
- Auditor execution surface: fresh independent ChatGPT worker
- Consultants: N/A
- Consultant execution surface(s): N/A
- Specs:
  - `docs/specs/SPEC-013-pve-world-map-zone-solo-hunt-rules-lifecycle.md`
  - `docs/specs/SPEC-014-idle-gacha-genetic-quality-acquisition-model.md`
- Related tasks: TASK-024, TASK-033, TASK-035, TASK-036, TASK-096, TASK-097, TASK-038, TASK-041
- Branch: `feat/TASK-037-offline-checkpoint-claim-engine`
- Worktree: `.worktrees/TASK-037-offline-checkpoint-claim-engine`
- Human product gate: none remaining for this implementation; TASK-033/SPEC-013 and TASK-096/SPEC-014
  already define the player-visible offline/capture semantics consumed here.

## Objective

Implement a deterministic persisted Solo Hunt checkpoint/elapsed-time engine that can reproduce or advance
an accepted TASK-035/TASK-097 Hunt state to an immutable logical cutoff without substituting current
content/rules/configuration, rerolling an individual, duplicating TASK-036 reward/capture effects, or
retroactively applying later player configuration.

The task owns checkpoint codec/versioning, persistence/OCC, fixed-cutoff claim identity, elapsed-time
recomputation and performance-safe segmented advancement. Public Hunt HTTP commands and player-facing
auto-capture settings remain TASK-038-owned.

## Fixed implementation boundaries

### 1. Offline horizon/cap semantics

`safe cap` is an execution/performance bound, not a gameplay/reward-loss rule.

- no eligible elapsed logical history may be silently discarded because a processing segment is bounded;
- long elapsed advancement must be decomposable into deterministic finite segments/checkpoints;
- advancing directly to a cutoff and advancing through intermediate safe segments must yield exactly the
  same final authoritative state/evidence;
- 1-hour and 8-hour elapsed-time cases are required validation points;
- no new stamina, fee, reward multiplier, reduced offline rate, reward cap, capture protection or pity is
  introduced by this task.

### 2. Fixed-cutoff claim identity

For the first accepted elapsed-time/checkpoint command correlation, freeze:

- subject Player identity;
- Hunt/checkpoint identity;
- command correlation;
- authoritative logical target/cutoff;
- expected checkpoint row version at first acceptance;
- exact pinned gameData/rules/checkpoint-codec identities required to interpret the state.

Response-loss replay of that committed correlation must return the prior committed result and must not
move the cutoff to a later wall-clock time. Pre-commit stale/OCC retry may recompute only against the same
frozen target. If another committed command already advanced beyond that target, the old correlation must
resolve as superseded/conflicted without new advancement.

### 3. Checkpoint codec

Provide one explicit immutable checkpoint schema version and canonical byte encoding/decoding for all
state required to reproduce TASK-035/097 exactly, including:

- Hunt/player identity and logical time;
- pinned game-data and combat/rules identities;
- pending Encounter selection and exact TASK-097 individualization authority/provenance;
- current Encounter/Battle continuation and deterministic combat state;
- Team/cadence continuation;
- policy/combat RNG state and origins;
- completed Encounter evidence/provenance needed by downstream reward/capture resolution;
- pending capture decision where present;
- any deterministic inter-Battle/recovery policy memory already part of Solo Hunt runtime state.

Decode must fail closed on malformed, unknown, missing or context-incompatible state. There is no fallback
to latest/current rules or content.

### 4. Persistence and OCC

Use the existing `pokenexus.hunt_checkpoints` aggregate, extending it only where durable command/replay
authority requires it. Persistence must:

- preserve exact opaque identifiers losslessly;
- bind one active authoritative checkpoint to its Player/Hunt identity;
- use short transactions and explicit row-version/OCC semantics;
- prevent stale writers from replacing newer checkpoint state;
- store immutable command/correlation evidence sufficient for durable replay of committed advancement;
- never expose partial checkpoint/claim state;
- remain compatible with Cloudflare Worker runtime boundaries.

### 5. Deterministic advancement

Compose `advanceSoloHuntToCutoff` and accepted TASK-035/097 replay validation rather than creating a
parallel simulator.

Advancement must preserve exact direct-vs-segmented equality for:

- Encounter selection and PendingEncounterSelection continuity;
- TASK-097 IV/Genetics/Profile/Shiny snapshot identity and provenance;
- Battle/cadence/recovery continuation;
- completed Encounter identities/reward-source identities;
- pending capture handoff;
- RNG before/after state.

### 6. Reward/capture handoff

TASK-037 may produce deterministic completed Encounter/pending-capture evidence while advancing, but it
must not invent a second reward/capture authority.

- TASK-036 remains the only capture/reward resolver;
- the same completed Encounter cannot produce duplicate reward/capture effects on retry;
- this task may expose transaction-scoped composition points needed by TASK-038 but does not add public
  Hunt routes;
- automatic capture may execute during offline advancement only when TASK-038 later supplies an exact
  configuration identity/version authoritative for that logical interval;
- configuration accepted after elapsed logical history is forward-only and cannot alter prior Encounter
  or Ball decisions;
- if no authoritative auto-capture configuration is supplied for an interval, TASK-037 must not fabricate
  one.

## Scope

- Worker-safe canonical checkpoint codec + validation tests.
- PostgreSQL checkpoint repository/OCC and durable advancement-correlation persistence.
- Internal application service for fixed-target load/replay/recompute/commit.
- Deterministic segmented advancement helper with direct-vs-segmented equivalence tests.
- 1-hour and 8-hour deterministic advancement tests using bounded fixtures/performance assertions.
- Restart/reload/retry tests preserving exact TASK-097 individualization snapshot/provenance.
- Stale/OCC, response-loss replay, duplicate correlation and superseded target tests.
- Worker compatibility, package/workspace typecheck/test/build and PostgreSQL integration coverage.

## Out of scope

- Public Hunt HTTP routes/payloads, authz and command UX — TASK-038.
- Persistence/schema/UX of player auto-capture settings — TASK-038.
- New capture formula/Ball rules/Species Research semantics — TASK-036/SPEC-014.
- New game-data or published combat-rule bytes.
- Potion auto-use, revival, new recovery rules or voluntary switching.
- Player-visible offline reward caps/penalties, stamina, monetization or new economy tuning.
- Card/Pixi UI.
- Deploy/production cutover.
- Git history mutation without separate Human Owner authorization.

## Acceptance criteria

- [x] Canonical checkpoint codec round-trips the full exact-current Solo Hunt runtime state required for
      deterministic replay, including TASK-097 individualization provenance.
- [x] Unknown/malformed/incompatible checkpoint bytes fail closed with no latest/current fallback.
- [x] Direct advancement and safe segmented advancement to the same logical cutoff are byte/semantic
      equivalent for authoritative checkpoint state and completed evidence.
- [x] Required 1-hour and 8-hour advancement fixtures are deterministic and complete within the accepted
      engineering performance budget without truncating eligible logical history.
- [x] First accepted command correlation freezes one logical cutoff; committed replay cannot move it.
- [x] Pre-commit OCC retry recomputes only against that frozen cutoff.
- [x] Stale/superseded correlations create no additional advancement, reward or capture effect.
- [x] Persisted checkpoint writes are atomic and stale row versions cannot overwrite newer state.
- [x] Restart/reload cannot reroll PendingEncounterSelection or TASK-097 IV/Genetics/Profile/Shiny facts.
- [x] Completed Encounter/reward-source/capture provenance remains exactly replay-validatable by TASK-036.
- [x] No public Hunt API or auto-capture configuration schema is introduced.
- [x] Focused + workspace validation is green; PostgreSQL integration is green.
- [x] Independent QA reports READY with no unresolved P0/P1.
- [x] Independent replay/concurrency audit reports PASS with no unresolved P0/P1.
- [x] Fresh independent Class-B functional/architecture acceptance passes before ACCEPTANCE.

## Validation

- `corepack pnpm --filter @pokenexus/game-core test`
- `corepack pnpm --filter @pokenexus/database test`
- `corepack pnpm --filter @pokenexus/api test`
- targeted disposable-PostgreSQL checkpoint/claim integration
- API/database Worker dry-run where touched
- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm roadmap:check`
- `git diff --check`

## Review evidence

- Final QA: **READY — P0=0, P1=0, P2=0, P3=0** on the exact acceptance snapshot.
- Final independent replay/concurrency audit: **PASS — P0=0, P1=0, P2=0, P3=0**.
- Final independent Class-B functional/architecture gate: **ACCEPT — P0=0, P1=0, P2=0, P3=0**.
- Focused final codec/Hunt validation: `66/66` PASS; final Game Core package discovery: `454/454` PASS.
- Final API package: `130/130` PASS; Database unit package: `31/31` PASS.
- Final serialized workspace test (`corepack pnpm -r --workspace-concurrency=1 test`) PASS, including
  `game-data` `365` PASS + `1` live-test skip. The default fully parallel root test previously hit only
  the existing 5-second `game-data` publication-test contention; the same tests and full package pass
  without cross-package contention.
- Real disposable PostgreSQL validation in this implementation: targeted checkpoint suite `7/7` PASS and
  full Database integration `75/75` PASS. Final corrective deltas were codec/tests only and did not alter
  Database persistence code.
- Final `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm roadmap:check` and `git diff --check`: PASS.
- API/Database Worker compatibility checks passed during implementation; final workspace build includes
  successful API and realtime Wrangler dry-runs.
- No public Hunt route or player auto-capture configuration schema was introduced.

## Dependencies

- TASK-035 — DONE; deterministic cutoff/replay engine.
- TASK-036 — DONE; canonical reward/capture authority.
- TASK-096 / SPEC-014 — DONE/APPROVED; offline acquisition semantics.
- TASK-097 — DONE; immutable Encounter individualization/provenance.
- TASK-024 — DONE; reward application primitives consumed downstream.

## Completion

Use `docs/agents/handoff-protocol.md`. Human Owner repository/history authorization completed 2026-09-27; canonical integration completed on `main`. Deploy and production cutover remain separately gated.
