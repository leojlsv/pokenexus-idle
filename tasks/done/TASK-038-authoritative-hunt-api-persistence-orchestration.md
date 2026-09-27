# TASK-038 — Authoritative Hunt API / Persistence Orchestration

## Metadata

- State: DONE
- Class: B
- Owner: Lead Developer
- Owner execution surface: current ChatGPT implementation session (Lead Developer role); Copilot CLI quota blocked before implementation and the dedicated worker surface did not begin work
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor (authz, concurrency, idempotency and transaction integrity)
- Auditor execution surface: fresh independent ChatGPT worker
- Acceptance: PM / Architecture Coordinator delegated Class-B functional/architectural gate
- Acceptance execution surface: fresh independent ChatGPT worker because the PM/implementation session cannot self-accept
- Consultants: N/A
- Consultant execution surface(s): N/A
- Spec: `docs/specs/SPEC-015-authoritative-hunt-api-contract.md`
- Related specs: SPEC-003/004/005/006/007/009/010/011/013/014/015
- Related ADRs: ADR-006
- Related tasks: TASK-017, TASK-024, TASK-025, TASK-033, TASK-035, TASK-036, TASK-037, TASK-096, TASK-097, TASK-098, TASK-039, TASK-040, TASK-041
- Branch: `feat/TASK-038-authoritative-hunt-api-persistence`
- Worktree: `.worktrees/TASK-038-authoritative-hunt-api-persistence`
- Human product gate: none remaining for protocol semantics; SPEC-015 is APPROVED. Repository/history completion remains separately gated.

## Objective

Implement the approved SPEC-015 public v1 Solo Hunt HTTP and persistence orchestration contract without
inventing or changing protocol/gameplay semantics. Compose existing TASK-024/036/037 authorities into one
self-scoped, durable-idempotent Hunt service with exact retry, cutoff, capture, heal and policy behavior.

## Scope

- self-scoped `GET /player/hunts/state`;
- start/checkpoint/claim/retreat mutation routes with required public Idempotency-Key handling;
- bounded `202 in_progress` continuation over TASK-037 fixed-cutoff advancement;
- one-active-Hunt and Player-wide recovery/no-free-reroll persistence;
- explicit normal Hunt `heal-hp` item-use transport and scheduled inter-Battle execution;
- Player-wide one-slot manual capture attempt/skip transport;
- standing versioned forward-only auto-capture policy persistence and public read/write;
- per-Encounter automatic capture boundary using pre-current-reward Inventory;
- exact Ball/item/content/rules authority pinning;
- durable command replay, tombstones, supersession and conflict semantics;
- transaction/OCC composition across checkpoint, reward, capture, Inventory, policy and command evidence;
- API/database tests for response loss, restart, concurrency, stale writers and exact-once effects.

## Out of scope

- changing SPEC-015 routes/payloads/errors or §16 Human-approved semantics;
- new capture odds, reward tables, Ball values/faucets/prices, Genetics/Shiny or recovery tuning;
- exposing hidden wild HP/HP%/derived stats;
- public scheduled-heal queue/readback not present in SPEC-015 v1;
- Card/Pixi presentation (TASK-039/040);
- deploy/production cutover;
- Git history mutation without separate Human Owner authorization.

## Required invariants

- No client Player/Account identifier becomes authority.
- First accepted command freezes immutable intent/correlation/target identities; retry never gets a later cutoff.
- Same-key first delivery is re-checked/claimed under one Player-wide serialized command boundary.
- A `202` never publishes a final retreat/capture/policy consequence early.
- At most one due heal resolves per service invocation; logical time does not pass that boundary until due heals drain.
- Scheduled-heal domain state survives transport-key expiry exactly as SPEC-015 defines.
- Manual capture source Hunt and advancement Hunt identities remain distinct and retry-stable.
- Manual capture debit + TASK-036 consequence + pending closure + command result are one transaction.
- Policy `expectedRowVersion` is rechecked immediately before activation after any prelude.
- Encounter N auto-capture selects/debits from locked pre-N-reward Inventory; N reward cannot fund N's own immediate capture.
- N reward/capture boundary completes before N+1 productive history.
- Reward/capture RNG origins and Encounter opportunity evidence are restart/replay stable.
- No latest/current authority silently replaces a pinned historical version.

## Acceptance criteria

- [x] All SPEC-015 routes, bodies, response/error envelopes and request bounds are implemented exactly.
- [x] Public authz/Origin/CSRF/session behavior matches ADR-006/SPEC-011 and self-scope non-enumeration.
- [x] Idempotency replay/conflict/expiry/tombstone behavior is durable across process restart.
- [x] Same-key concurrent first delivery cannot create two accepted command records/effects.
- [x] Checkpoint/claim/retreat use frozen server cutoffs and bounded same-key 202 continuation.
- [x] One-active-Hunt/recovery/start races converge under database serialization.
- [x] Manual capture attempt/skip is exactly-once and transactionally closes the one pending decision.
- [x] Explicit heal-hp item use obeys cutoff classification, equal-boundary ordering and one-resolved-heal-per-invocation.
- [x] Auto-capture policy persistence is versioned, fail-closed, forward-only and rechecks expectedRowVersion at activation.
- [x] Premium/VIP Balls never become implicit fallback.
- [x] Encounter N auto-capture cannot use N's own reward even across retry/restart.
- [x] Claim aggregates are bounded/deterministic and command-local.
- [x] Hidden wild Genetics-derived state is not exposed.
- [x] PostgreSQL integration tests cover rollback, OCC, concurrency and crash/replay-sensitive transaction composition.
- [x] Existing TASK-036/037/game-core/API regression suites remain green.
- [x] Worker runtime/typecheck/lint/build checks relevant to touched packages pass.
- [x] Independent QA has no unresolved P0/P1.
- [x] Independent Auditor has no unresolved P0/P1 in authz/concurrency/idempotency/transaction integrity.
- [x] PM / Architecture Coordinator performs delegated Class-B functional/architectural acceptance after independent gates.

## Validation

- focused Hunt API/service/repository tests;
- PostgreSQL integration tests for new Hunt command/policy persistence;
- TASK-036 capture/reward regression suite;
- TASK-037 checkpoint/claim regression suite;
- relevant game-core/API/database package tests;
- `corepack pnpm lint`;
- `corepack pnpm typecheck`;
- `corepack pnpm build`;
- `corepack pnpm roadmap:check`;
- `git diff --check`.

## Dependencies

- TASK-017 — DONE; authenticated Player identity.
- TASK-024 — DONE; Inventory/Progression/Reward persistence.
- TASK-025 — DONE; self-scoped Player State HTTP/session conventions.
- TASK-033 / SPEC-013 — DONE/APPROVED; Solo Hunt lifecycle.
- TASK-035 — DONE; deterministic Solo Hunt simulation.
- TASK-036 — DONE; canonical capture/reward resolver.
- TASK-037 — DONE; checkpoint/OCC/fixed-cutoff advancement.
- TASK-096 / SPEC-014 — DONE/APPROVED; acquisition and auto-capture semantics.
- TASK-097 — DONE; Encounter individualization.
- TASK-098 / SPEC-015 — DONE/APPROVED; exact public Hunt protocol and persistence contract.

## Risks / irreversible actions

- Incorrect command correlation or transaction boundaries can double-debit/grant or reinterpret retries.
- Incorrect lock order can create races/deadlocks across Hunt, Inventory, policy and capture persistence.
- Incorrect authority pinning can reinterpret historical Hunt state after content/rules changes.
- Public protocol drift would violate the approved Class-A contract.
- No deploy, destructive migration or Git-history action is authorized by this READY transition.

## Current execution state

Implementation acceptance snapshot is complete on the dedicated TASK-038 branch/worktree.

- Exact-current independent QA: **READY — P0=0, P1=0**.
- Exact-current Independent Auditor: **PASS — P0=0, P1=0** after correcting and re-reviewing the final prelude-supersession serialization race.
- Fresh independent delegated Class-B functional/architectural gate: **ACCEPT — P0=0, P1=0**.
- API unit: `158/158` PASS.
- Hunt application PostgreSQL: `17/17` PASS.
- Full API PostgreSQL: `54/54` PASS.
- Full Database PostgreSQL: `87/87` PASS.
- Serialized workspace tests: PASS, including Game Data `365/365` plus one intentionally skipped live-ingestion test.
- Root `lint`, exact-current `typecheck`, `build`, `roadmap:check` and `git diff --check`: PASS.
- Default fully parallel root test can still hit the pre-existing fixed 5-second Game Data publication timeout under cross-package contention; the exact affected tests and the full serialized workspace test pass.

The implementation is **DONE**. Human Owner repository/history completion was authorized on 2026-09-27 after the exact-current QA, audit and independent Class-B acceptance gates passed. Deploy/production cutover remains separately gated.
