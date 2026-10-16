# TASK-142 — Closed Alpha Phase 01 Operational Readiness

## Metadata

> **Governance correction and Class-B acceptance (2026-10-15):** this **operational-planning** task was originally materialized under provisional PM `TASK-134`, in conflict with the already-authorized technical TASK-134 implementing SPEC-025. It is reassigned to `TASK-142` by the Owner's conflict-remediation authorization. Independent QA, IA and fresh delegated Class-B reviewer accepted **documentation only**, so the lifecycle is `ACCEPTANCE`, **not DONE**. Actual Discord/ticket operation and tester access remain gated by TASK-136 E0–E4, channel/setup verification and Human live review.

- State: ACCEPTANCE
- Class: B
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT coordination
- Control branch: `main`
- Control worktree: `.`
- Reviewer: independent QA worker-4 — documentary READY 0/0/0 after operational wording and dependency correction
- Reviewer execution surface: independent delegated ChatGPT worker, strict read-only
- Auditor: independent governance auditor worker-5 — documentary PASS 0/0/0; no live Discord/tester proof
- Auditor execution surface: separate delegated ChatGPT worker, strict read-only
- Consultants: N/A
- Consultant execution surface(s): N/A
- Spec: `docs/project/CLOSED_ALPHA_PREPARATION_PACKAGE.md`
- Branch: Not assigned
- Worktree: Not assigned
- Historical identity: `TASK-134` meant PM operations only in provisional Oct14/15 documents; **technical TASK-134 remains unchanged** in its isolated worktree. Historical references are disambiguated through the PA-M5 reconciliation record.
- Status provenance: `DONE` appeared in an untracked backlog task for operational-planning completion, not a fully QA/historically closed task.
- History gate: NOT AUTHORIZED — no commit/merge/push or runtime activation.

## Objective

Prepare the operational checklist required before inviting the Closed Alpha Phase 01 tester group.

## Context

Closed Alpha Phase 01 has an approved bounded scope with 5 to 10 invited testers. This task coordinates readiness activities without expanding gameplay scope or enabling separately gated capabilities.

## Scope

- Prepare tester onboarding requirements.
- Define support and feedback operation readiness.
- Map QA evidence collection during Alpha.
- Confirm known limitations are visible to testers.

## Out of scope

- Public launch.
- Production deployment.
- TASK-103 public enablement.
- TASK-120 implementation.
- TASK-121 implementation.
- New gameplay features.

## Acceptance criteria

- [x] Tester onboarding flow documented.
- [x] Feedback and bug reporting **process documented for future operation**; real Discord channels, role permissions and ticket availability are **not yet verified or enabled**.
- [x] Alpha Tester access boundaries defined **at planning level only** (no live security, e-mail, passkey or browser validation).
- [x] Known limitations package available.
- [x] QA evidence collection process defined.

## Current progress

- [x] Closed Alpha Phase 01 operations document created.
- [x] Tester onboarding boundaries defined.
- [x] Feedback and bug-report channels mapped.
- [x] Known limitations recorded.
- [x] QA evidence categories defined.

## Operational readiness checklist

- [x] Tester scope fixed: 5 to 10 invited Alpha Testers.
- [x] Alpha access remains separate from staff permissions.
- [x] Discord operational documents identified as source references.
- [x] Proposed tester invitation process documented; issuance/verification remains blocked by TASK-136.
- [x] Support/ticket ownership model defined before invitations.
- [x] Alpha feedback triage cadence defined.

## Operational decision

Closed Alpha Phase 01 operational planning/scope was accepted as a **product direction**, and the corrected documentary task subsequently passed independent QA, IA and delegated Class-B acceptance. **Git history is pending. Actual tester invitations still require TASK-136 PA-M6.1 E0–E4 (security, starter, real provider, two browsers and Human live review); planning acceptance is not live access authorization.**

Operating model:

- Invitations are manual and limited to 5 to 10 approved testers.
- Community Manager coordinates communication when assigned.
- Moderator handles community moderation when assigned.
- QA owns reproduction and validation of reported issues.
- Developer receives only the technical context required for investigation.

Feedback cadence:

- Critical gameplay blockers: immediate triage.
- Reproducible bugs: reviewed during QA triage cycle.
- UX/progression feedback: grouped for phase review.
- Future suggestions: collected without expanding Phase 01 scope.

## Phase 01 authorization

Human Owner authorized preparation of the bounded Closed Alpha Phase 01 program; actual entry/testing remains independently gated by TASK-136.

Operating boundary:

- 5 to 10 invited Alpha Testers.
- Manual invitations only.
- Approved Phase 01 scope only.
- Deferred capabilities remain separately gated.

## Validation / tests

- [x] Role and permission review.
- [x] Closed Alpha readiness checklist review.
- [x] Independent documentary QA **READY 0/0/0** on corrected operational plan, ID crosswalk and hard-vs-related dependencies.
- [x] Independent governance IA **PASS 0/0/0** for planning-only scope, not live provider/Discord operations.
- [x] Fresh delegated independent Class-B reviewer **ACCEPTED** corrected documentary scope; see `docs/project/PA_M5_CLASS_B_ACCEPTANCE_RECORD_2026-10-15.md`.
- [ ] Separately authorized repository-history handback performed.

## Readiness state

Operational preparation documentation and delegated Class-B acceptance are complete locally; **formal task lifecycle is ACCEPTANCE, not DONE**, pending Git history. Discord/ticket channel setup and role permissions remain operational **checklist items**, not evidence of a deployed service or tested live feedback intake. Tester invitations are **not yet enabled**: TASK-136 is ACTIVE and PA-M6.1 NOT READY; E0–E4 evidence and Human live review are prerequisites.

## Completion note

Closed Alpha Phase 01 operating procedures are documented and the documentary Class-B gate accepted; Git history and actual operational provisioning remain pending. Feedback triage preparations may proceed, but **tester invitations and real Alpha entry wait for TASK-136 acceptance**.

## Dependencies

- TASK-133 — approved Closed Alpha preparation **scope**, now in documentary `ACCEPTANCE`; the separate Git history/completion gate remains pending.

## Related future Alpha gameplay/validation owners (NOT prerequisites to planning documentation)

- TASK-039 — Cards-only frontend integration and Human gameplay review.
- TASK-041 — bounded local validation and future real Phase 01 harness.
- TASK-100 — Collection/Team UX and known limitations.

These references do **not** replace TASK-136 E0–E4 or authorize Alpha Tester invitations.

## Risks / irreversible actions

- None. This task coordinates Phase 01 readiness only.

## Expected files / boundaries

- `docs/project/CLOSED_ALPHA_PREPARATION_PACKAGE.md`
- `docs/project/DISCORD_LAUNCH_CHECKLIST_V1.md`
- `docs/project/DISCORD_COMMUNITY_OPERATIONS_V1.md`
- `docs/project/CLOSED_ALPHA_PHASE_01_OPERATIONS.md`

## Completion

Use `docs/agents/handoff-protocol.md`.
