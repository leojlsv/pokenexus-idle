# PokeNexus Idle — Closed Alpha Preparation Package

## Status

- State: APPROVED
- Milestone: PA-M6 — Closed Alpha Preparation
- Owner: Human Owner
- Coordination: PM / Architecture Coordinator
- Implementation ownership: Not assigned
- QA ownership: To be assigned when validation tasks are opened

## Human Approval Record

- Human Owner approved the Alpha Visual/UI Gate definition on 2026-10-14.
- Approval scope: Alpha interface foundation, asset usage criteria and placeholder policy.
- This approval does not authorize tester execution, deployment or production asset completion.

## Purpose

Define the preparation boundary between the validated first Pre-alpha baseline and a future Closed Alpha decision.

This package coordinates scope, gates and acceptance. It does not enable blocked capabilities or replace Class-A approval flows.

## Closed Alpha Phase 01 Decision

Status: APPROVED

Phase 01 objective:

Validate the complete first gameplay loop with a controlled tester group before expanding the product scope.

Execution is divided into explicit gates:

| Gate | Purpose | Status |
| --- | --- | --- |
| PA-M6.0 Preparation | Scope, operations, limitations and evidence model | COMPLETE |
| PA-M6.1 Alpha Entry | Tester entry path, session ownership and provisioning | ACTIVE / NOT READY — TASK-136 E0–E4 and Human live review pending |
| PA-M6.2 Multi-account Validation | Multiple testers using the same entry surface with isolated accounts/players | PENDING |
| PA-M6.3 Tester Execution | Real tester gameplay evidence collection | PENDING |
| PA-M6.4 Phase Review | Human Owner review and expansion decision | PENDING |

Tester group:

- 5 to 10 invited testers.

The first Closed Alpha phase follows the recommended bounded scope below.

## Entry conditions

- PA-M5 local validation baseline remains stable.
- TASK-041 local Cards-only harness is green.
- Core gameplay loop, persistence, recovery, Collection, Team and Inventory flows are available.
- Known limitations are explicitly recorded.
- Alpha tester entry flow is validated before opening tester access.
- Multiple account isolation is validated through the same entry surface; local fixtures are not considered Alpha execution evidence.
- TASK-136 Alpha Entry & Tester Provisioning Gate is completed before opening tester access.

## Closed Alpha candidate scope

Included candidate features:

- Solo Hunt Cards presentation.
- Alpha asset package included in the playable client experience.
- Player-facing visual assets must provide an intentional Alpha experience. Placeholder assets are allowed where the Human Owner has not yet validated the final asset requirement or where the placeholder does not prevent gameplay/UX validation.
- Automatic combat progression.
- Capture, rewards and progression loop.
- Collection and Team management.
- Inventory management.
- Offline return and recovery flow.
- HUB management surfaces available in the first Pre-alpha slice.

## Phase 01 Acceptance Criteria

- No unresolved P0 or P1 gameplay blockers.
- No player data corruption during normal usage scenarios.
- Hunt start, progression, capture, rewards and return flow remain functional.
- Collection, Team and Inventory changes remain consistent after reconnect/reload.
- Offline return and recovery behavior remains stable.
- Required Alpha visual foundations load, render and remain usable during the validated gameplay loop. Specific placeholder acceptance is validated by the Human Owner during development review.
- Tester feedback is collected and categorized for the next product decision.
- Human Owner reviews Phase 01 results before expanding scope.

## PA-M6 Alpha Visual/UI Gate

The Alpha experience requires a structured player interface. Closed Alpha is not a debug surface,
but it also does not require final production art.

### Required

- Complete navigation structure for available Alpha features.
- Consistent UI components and states.
- Required icons/assets for player-facing interactions.
- Visual representation for entities where it materially affects player understanding.
- Functional loading, empty, error and unavailable states.

### Allowed during Alpha

- Temporary placeholders.
- Temporary icons/assets.
- Incomplete cosmetic assets.
- Iterative visual replacement during tester feedback cycles.

Placeholder decisions remain Human Owner validated during development. A placeholder is acceptable
when it does not prevent gameplay validation or create misleading UX.

### Not required for Phase 01

- Final production asset pipeline.
- Complete cosmetic catalog.
- Final Pixi combat presentation.
- Complete animation/VFX pass.

## Deferred capabilities requiring separate gates

| Capability | Owner | Gate |
|---|---|---|
| Public CombatPresentation feed | TASK-103 owner | Runtime/public enablement decision |
| Durable terminal/offline summary | TASK-120 / SPEC-025 **Class-A contract**; separate technical TASK-134 **Class-B implementation** | Contract APPROVED; technical source ACTIVE isolated; migration/API/public read/activation require independent QA, lineage and Human gates |
| Historical manual-capture compatibility | TASK-121 / SPEC-026 **Class-A contract**; separate technical TASK-130 **Class-B implementation** | Contract APPROVED; technical source REVIEW isolated; persisted compatibility/SQL0015, route changes and activation remain independently gated |
| Eligible Moves / Move editor | Class-A contract owner | Approved public authority contract |
| Pixi combat presentation | TASK-040 owner | Later visual milestone |

## Roles

```text
Human Owner
  Product scope, Class-A decisions and Alpha approval

PM / Architecture Coordinator
  Roadmap, dependency tracking and acceptance coordination

Implementation Owners
  Execute only assigned READY tasks

QA Reviewer / Independent Auditor
  Independent validation and challenge
```

## Entry decision checklist

- [x] Human Owner approves Closed Alpha scope.
- [x] Release scope and deferred capabilities are recorded.
- [x] Required validation tasks have owners.
- [x] Support/community process preparation is identified for the selected tester group.
- [x] No unresolved P0/P1 **within the historical 2026-10-14 preparation/scope decision**; this does **not** attest current live-Alpha Security E0, which has a later source-level Vite `/@fs/` P1 and remains NOT READY.

**Control-plane correction and independent Class-B acceptance (2026-10-15):** historical PM operations formerly referenced as `TASK-134` now has distinct control task `TASK-142 ACCEPTANCE` (**operational documentation only**); `TASK-133` preparation scope is also in `ACCEPTANCE`, along with `TASK-141` roadmap governance. QA, IA and fresh delegated documentary Class-B reviewer accepted the narrow planning scope; none is `DONE` or historically integrated. Technical `TASK-134` remains owned by its separately gated SPEC-025 implementation worktree. Actual invitations/real testing remain prohibited pending TASK-136 E0–E4 and Human live review; `TASK-135` execution remains `PLANNED`.

## Exit criteria

Closed Alpha preparation is complete when:

- tester scope is approved;
- release boundaries are documented;
- known limitations are accepted;
- required operational checks are assigned;
- Human Owner authorizes the Alpha phase.

## Non-goals

- No public launch.
- No production deployment.
- No automatic enablement of TASK-103/TASK-120/TASK-121.
- No new gameplay rules without approved scope.
