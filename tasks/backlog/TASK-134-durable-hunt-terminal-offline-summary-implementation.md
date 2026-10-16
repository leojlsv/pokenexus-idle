# TASK-134 — Durable Hunt Terminal & Offline Summary Implementation

## Metadata

- State: PLANNED
- Source lifecycle: ACTIVE
- Class: B
- Owner: Lead Developer / ChatGPT prime (source owner remains in dedicated worktree)
- Reviewer: Independent source/replay QA and persistence/security auditor, per isolated source task
- Spec: `docs/specs/SPEC-025-durable-hunt-terminal-offline-summary.md` — APPROVED Class A
- Source branch: `feat/TASK-134-durable-hunt-summary-implementation`
- Source worktree: `.worktrees/TASK-134-durable-hunt-summary-implementation`
- Source task: `tasks/active/TASK-134-durable-hunt-terminal-offline-summary-implementation.md` **inside that worktree**, whose historical implementation lifecycle is `ACTIVE — TECH LOCAL READY; M1/M2/operational promotion BLOCKED`.
- Control-plane boundary: this `PLANNED` row is a **non-promoting integration index** in dirty main, not an assertion that the isolated, Human-authorized technical work is nonexistent or reverted.
- Historical collision: provisional PM operational readiness also reused `TASK-134`; that distinct planning scope is now `TASK-142` under the 2026-10-15 control-plane correction.

## Scope and authority

This file does **not** allocate a second coding agent. Preserve the existing source candidate and the accepted SPEC-025 contract: owner-scoped durable terminal summary, immutable return receipts and seal/retention semantics, no second reward authority. Preserve all original integration preflight evidence, source hashes, SQL drafts and rejection gates.

The source worktree includes a local migration-number gap guard **not integrated into main**, and identifies conflicting SQL0015/0016/0017 lineages. No generic gap guard may be installed blindly over the Alpha-specific selective migration runner. Migration/ledger continuity, SQL checksum safety and TASK-132/130 overlaps require a separate, explicit technical cutover decision.

## Exit / integration gates

- [ ] Source ownership, cross-worktree overlaps and migration predecessor graph reconciled.
- [ ] All original TASK-134 M1/M2/OP gate blockers and independent QA resolved; no scope promotion by this index.
- [ ] PostgreSQL lineage and Alpha selective-prefix behavior proven without changes to preserved data.
- [ ] Separate Human repository-history, persistent migration and operational enablement gates satisfied.

No implementation merge, history action, migration Apply, replay rewrite, public route, publish or deploy is authorized. The isolated technical source remains `ACTIVE` within its original bounds; this unintegrated main control index remains `PLANNED`.
