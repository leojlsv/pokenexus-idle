# TASK-135 — Closed Alpha Phase 01 Execution

## Metadata

> **Lifecycle correction (2026-10-15):** the earlier provisional `ACTIVE` label meant coordination/preparation, **not** authorized live execution. This task is `PLANNED` until TASK-136 E0–E4 and Human live review pass; the earlier label is retained here as historical evidence, not as an open tester gate. No invitation, real gameplay evidence or runtime promotion was authorized by this correction.

> **Owner clarification authorized by Human Owner (2026-10-16T02:59:18Z):** PM / Architecture Coordinator coordinates **documents and planning evidence only**. SD → ChatGPT prime is the designated **future execution owner**, matching the roadmap. Neither role is authorized to start real tester execution before TASK-136 E0–E4 and separate Human live approval. This is a documentation/ownership clarification, not a lifecycle, technical-source or Git-history approval.

- State: PLANNED
- Class: B
- Owner: SD → ChatGPT prime (future execution only; `PLANNED`)
- Owner execution surface: Chat On Steroids Core (reserved for future authorized execution; not started)
- Documentary coordinator: PM / Architecture Coordinator (scope, governance and evidence planning only)
- Documentary coordination surface: ChatGPT coordination
- Reviewer: QA Reviewer
- Auditor: Independent Auditor when evidence review is required
- Consultants: N/A
- Spec: `docs/project/CLOSED_ALPHA_PHASE_01_OPERATIONS.md`

## Objective

Coordinate the controlled execution of Closed Alpha Phase 01 **only after** operational readiness documentation is reviewed and TASK-136 Alpha Entry Gate is accepted.

## Context

Phase 01 was approved for 5 to 10 invited testers. This task tracks execution readiness and evidence collection without expanding the approved gameplay scope.

## Scope

- Track tester onboarding completion.
- Track the validation baseline used during the Phase 01 cycle.
- Collect gameplay feedback and reproducible issues.
- Coordinate QA triage.
- Prepare Phase 01 review evidence.

## Out of scope

- Public launch.
- Production deployment.
- TASK-103 public enablement.
- TASK-120 implementation.
- TASK-121 implementation.
- New gameplay features.

## Acceptance criteria

- [ ] Tester group invited within approved limit.
- [ ] Validation baseline recorded.
- [ ] Feedback intake operational.
- [ ] Bug triage operational.
- [ ] Phase 01 review evidence collected.

## Execution state

- [x] Phase 01 program/scope preparation authorized by Human Owner.
- [ ] Human Owner explicitly authorizes **real tester execution** after TASK-136 E0–E4.
- [x] Execution remains limited to 5 to 10 invited testers.
- [x] Deferred capabilities remain disabled and separately gated.

## Initial execution checklist

- [ ] Record initial Alpha validation baseline identifier.
- [ ] Confirm tester invitation list.
- [ ] Confirm feedback channels are available.
- [ ] Start evidence collection cycle.

## Validation record

- [x] Phase 01 validation record created.
- [x] Evidence collection structure defined without software distribution assumptions.
- [x] Validation cycle checklist created.
- [x] Phase 01 access preparation requirements documented.

## Current validation baseline

- [x] Phase 01 **program planning** authorization recorded; no real tester execution approval inferred.
- [x] Tester limit confirmed: 5 to 10 invited Alpha Testers.
- [x] Scope boundary confirmed against Closed Alpha Preparation Package.
- [x] Validation baseline concept confirmed: server environment, repository state and evidence context are tracked for testing; no software distribution model is used.
- [x] Validation record created with explicit environment/tester evidence requirements.
- [x] Docker environment preparation plan created for the Closed Alpha server validation environment.

## Execution baseline

- [x] Current control baseline recorded: local `main` at `558adb6`.
- [x] Roadmap reflects PA-M6 Closed Alpha Phase 01 **preparation and gated execution plan**, not testers already operating.
- [x] Deferred capabilities remain excluded from this execution cycle.

The Phase 01 validation context must be recorded before invitations are sent. The
repository state alone does not represent the complete validation context; the
server environment and evidence references are part of the testing baseline.

## Execution preparation

- [x] Phase 01 operating document available.
- [x] Docker environment preparation document available.
- [x] Feedback and bug-report channels defined.
- [x] Deferred capabilities documented for testers.
- [ ] Initial tester invitation record created.
- [x] Validation baseline identifier recorded as control reference `main@558adb6`.
- [ ] First evidence collection cycle started.

## Dependencies

- TASK-133 — approved Alpha scope, with separate documentary/history handback.
- TASK-142 — operational planning, formerly provisional PM TASK-134 (technical TASK-134 is unrelated).
- TASK-136 — **mandatory PA-M6.1 E0–E4 and Human live-review gate before real tester entry or Phase 01 execution**.

## Related implementation and validation owners (not permission for tester access)

- TASK-039 — actual Cards-only frontend experience.
- TASK-041 — local/end-to-end/offline validation work.

These are separate future evidence tracks; they do not replace the entry gate or imply that Phase 01 has started.

## Risks / irreversible actions

- None. Execution remains controlled and invitation-based.

## Expected files / boundaries

- `docs/project/CLOSED_ALPHA_PHASE_01_OPERATIONS.md`
- `docs/project/CLOSED_ALPHA_PREPARATION_PACKAGE.md`

## Completion

Use `docs/agents/handoff-protocol.md`.
