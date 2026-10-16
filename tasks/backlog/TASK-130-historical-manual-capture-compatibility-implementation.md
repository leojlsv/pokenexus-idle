# TASK-130 — Historical Manual-Capture Compatibility Implementation

## Metadata

- State: PLANNED
- Source lifecycle: REVIEW
- Class: B
- Owner: Lead Developer / ChatGPT prime (implementation source owner remains isolated)
- Reviewer: Independent compatibility/replay QA and persistence/security auditors, per source task
- Spec: `docs/specs/SPEC-026-historical-manual-capture-compatibility.md` — APPROVED Class A
- Source branch: `feat/TASK-130-historical-manual-capture-compatibility-implementation`
- Source worktree: `.worktrees/TASK-130-historical-manual-capture-compatibility-implementation`
- Source task: `tasks/active/TASK-130-historical-manual-capture-compatibility-implementation.md` **inside that worktree**, where the historical implementation lifecycle is `REVIEW`.
- Control-plane boundary: `PLANNED` here means **integration/normalization into current main remains blocked**; it does not reset or override the separately authorized local source work, its test results or Human decisions.
- Historical collision: a later provisional PM roadmap-planning task reused `TASK-130`; that PM scope is now `TASK-141` under the 2026-10-15 control-plane correction.

## Scope and authority

This is a **control-plane index**, not a second implementation assignment. Preserve the already authorized source worktree and its exact reviewed state, tests, SQL `0015_historical_manual_capture_retirement.sql`, frozen replay/economic authorities and known incomplete acceptance criteria. Do not copy unreviewed source into the dirty main or claim Class-B universal acceptance.

The source implementation is bounded by approved SPEC-026: replay-only historical manual capture, fail-closed H0–H7 provenance, zero-effect safe classification, dual old-code retirement guards, immutable migration receipts and a separately gated Plan/Apply. Any state outside the independently proven subset stays blocked and requires source-owner reconciliation and new QA.

## Exit / integration gates

- [ ] Owner-reviewed source composition and unique task identity against all worktrees.
- [ ] Previously unclosed original Class-B acceptance criteria and exact-current independent QA completed.
- [ ] Complete migration lineage/conflict plan for SQL0015/0016/0017 independently reviewed.
- [ ] Separate Human authorization for repository-history operations and any persistent SQL Apply or rollout.

No migration, code integration, route/public change, SQL renumbering, tester access or Git history action is granted by this indexed row. The isolated source remains `REVIEW`; the control-plane index remains `PLANNED` until integration ownership is explicitly assigned.
