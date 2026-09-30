# TASK-104 — Project Governance and Roadmap Reconciliation

## Metadata

- State: DONE
- Class: B — corrective project-control tooling and documentation, without changing product/public API semantics or canonical role authority
- Human direction: project-wide governance, roles/agents, task inventory and `G:\pokenexus-idle\PROJECT_ROADMAP.html` reconciliation requested and authorized on 2026-09-29; repository-history and production actions remain separately gated
- Owner: PM / Architecture Coordinator (ChatGPT project coordination; one task coordinator)
- Owner execution surface: ChatGPT project coordination (explicit)
- Reviewer: independent QA Reviewer — ChatGPT worker-3; **exact-current follow-up PASS P0/P1/P2=0/0/0** on the corrected project-control scanner and 17 focused tests
- Reviewer execution surface: ChatGPT fresh independent QA worker-3, review run `352e5735-aa36-4fd9-904b-3cd779f4ad8e` (explicit non-default)
- Auditor: Independent Auditor — ChatGPT worker-4; **exact-current follow-up PASS P0/P1/P2=0/0/0**, including both previously identified P2 corrections
- Auditor execution surface: ChatGPT fresh independent IA worker-4, review run `352e5735-aa36-4fd9-904b-3cd779f4ad8e` (explicit non-default)
- Consultants: N/A — no new gameplay, monetization, economic or progression rule
- Consultant execution surface(s): N/A
- Related: TASK-003/039/100/102/103; SPEC-017 APPROVED; SPEC-018 catalog Gate-A direction; SPEC-019 DRAFT (not implementation authority)
- Branch: `chore/TASK-104-project-governance-reconciliation`
- Worktree: `.worktrees/TASK-104-project-governance-reconciliation`
- Acceptance status: independent QA/IA gates passed; the Human Owner accepted the Class-B functional gate on 2026-09-29 and explicitly authorized this task's Git commit and integration into `main` on 2026-09-30. This completion grants no permission for other task integration, push, deployment or public endpoint enablement.

## Objective

Restore trustworthy project-level visibility and a single reconciled task/role inventory while keeping integrated `main` distinct from in-flight worktrees, preserving all existing work, approved specs, independent review requirements and repository-history gates.

## Scope

- Preserve the named local user entrypoint `G:\pokenexus-idle\PROJECT_ROADMAP.html`; replace its stale silent redirect with an explicit integrated-versus-in-flight landing and validate that referenced dashboard files exist, including after this task's integration.
- Reconcile the planning inventory for the materialized TASK-039/100/102/103 and this corrective task; copy current task/spec documentation into this isolated governance branch without merging or altering unrelated application code.
- Correct actual owner/reviewer/auditor execution-surface metadata in the owning task worktrees without inventing completed reviews or permissions. Explicitly record unresolved FE/backend ownership and missing review/provenance gates.
- Add targeted roadmap/metadata validation and a repeatable publication handoff; avoid requiring historical DONE documents to satisfy newly introduced active-task metadata fields.
- Coordinate `apps/web/src/App.tsx` and shared-file integration between TASK-039 and TASK-100 without copying either implementation into this governance worktree.
- Maintain the accepted SPEC-017, catalogue SPEC-018 and unapproved historical-proof SPEC-019 as separate identities, with no Class-A implementation under this task.

## Out of scope

- No application logic, production database, live game, public endpoint enablement, deployment or rewrite of accepted specs.
- No destructive cleanup of old worktrees or replacement of user-owned modified files; no unilateral commit, merge, rebase, push or tagging.
- This governance task does not grant an FE-owned task backend implementation authority or treat partial QA as a final gate.

## Acceptance criteria

- [x] Local root HTML no longer silently redirects to a stale worktree; all five dashboard links resolve on disk.
- [x] Reconciled 105-ID portfolio differentiates task/approval/integration status and passes `roadmap:check` with 039/100/103 ACTIVE, 102 ACCEPTANCE and 104 DONE.
- [x] Materialized open task files have explicit actor/surface fields or documented unresolved gates; TASK-039's backend ownership and final QA/IA provenance remain outstanding and are **not** waived.
- [x] Control tooling detects newly materialized owner-task/portfolio mismatches, missing current worktrees, READY metadata gaps and conflicting current Markdown spec identities while exempting integrated historical worktrees.
- [x] Independent QA and Independent Auditor re-reviewed the corrected tooling after the P2 fixes; both report **P0/P1/P2=0/0/0** within TASK-104's scope.
- [x] Human Owner independently accepted TASK-104's Class-B functional gate on 2026-09-29; this acceptance is limited to the reconciled governance/control-plane scope.
- [x] Human Owner separately authorized TASK-104 Git integration on 2026-09-30; local root dashboard differentiates integrated roadmap data from unfinished implementation worktrees.

## Validation / tests

- [x] `pnpm roadmap:generate` and `pnpm roadmap:check` in this isolated worktree.
- [x] Focused task-metadata, missing contiguous ID, source-hash/link, competing-owner and conflicting-spec identity/content validator cases: **17/17 Node tests PASS** (including five new local-worktree/source-drift fixtures).
- [x] Local entrypoint hash/links and owner-worktree scan: **105 tasks, 53 worktrees, 5 open task files in 4 owner worktrees, 5 valid links** on the acceptance snapshot; targeted ESLint and `git diff --check` PASS. On closing this task, the expected open set becomes 4 task files across 3 owner worktrees. No browser or live game used.
- [x] Renewed independent QA/IA verdicts for the corrected control script and project snapshot. Reviewers were not part of implementation; no app, DB or browser tests are inferred.

## Independent review history, corrected P2s and limits

- Independent QA worker-3 reviewed the previous 105-task snapshot and control scripts; **PASS, P0/P1/P2=0/0/0** on that prior source. It independently ran 12 focused Node tests, branch-local roadmap check, local worktree inventory check and `git diff --check` (all PASS) without editing files or opening a browser/game.
- Independent IA worker-4 inspected role authority, SPEC-017/018/019 identities, owner-worktree duplication, spec SHA identity, the **unsigned SHA-256 source-freshness stamp** in the root landing and separation of Git/deploy/Class-A gates; its prior verdict was **PASS WITH P2, P0/P1/P2=0/0/2**. It was read-only and did not rerun the tests. The stamp detects unintended drift between local files but is not a digital signature, approval proof or immutable provenance attestation.
- **Prior P2 #1 — FIXED, independent QA/IA PASS:** newly open tasks are discovered by matching exact self-declared `Worktree` plus registered `Branch` metadata across **every** registered worktree, regardless of folder basename. Mirrored task documents declaring another worktree do not claim implementation ownership; historical roadmap DONE/DEFERRED retain their archive exception. Negative and positive fixtures cover nonstandard names, ACTIVE/REVIEW/FIX state, newly active unregistered IDs and archives.
- **Prior P2 #2 — FIXED, independent QA/IA PASS:** focused disposable-directory fixtures construct two different self-declared ACTIVE owner worktrees for one task ID and verify the duplicate-owner failure. Further regression coverage catches same-state but different owner/reviewer/acceptance task documents and filenames between owning worktree and reconciled task copy.
- **Exact-current source re-gate:** independent QA worker-3 **PASS 0/0/0**, personally reran 17/17 Node fixtures, the 105-ID `roadmap:check`, 105/53/5-open/4-owner/5-link `portfolio:check-local`, and whitespace check. Independent IA worker-4 **PASS 0/0/0**, read-only review of the corrected basename-independent scanner, two-owner negative fixture, source-body equality and governance/approval boundaries (IA did not rerun the tests). The Human Owner subsequently accepted the Class-B functional gate and separately authorized this task's Git integration. The final DONE transition changes task/roadmap/landing metadata only; application implementation remains untouched.
- **Residual scope limit:** this scanner reads Git-registered worktrees and requires honest, valid, self-declared owner worktree/branch metadata. It is a workspace drift control, not a security proof over unregistered folders, maliciously forged Git state or externally published deployment. These corrections do not waive pending Human, independent feature-specific QA/IA, backend owner, repository-history or deployment gates.

## Dependencies and open decisions

- TASK-003 baseline project control is DONE; TASK-039/100/102/103 remain separately owned and are not made DONE by copying their task documents.
- Backend implementation ownership under TASK-039 needs explicit Human/PM reconciliation and independent backend gate before final TASK-039 acceptance.
- Shared `apps/web/src/App.tsx` and `App.test.tsx` integration from TASK-039/100 needs a separate single integration owner and combined QA; no auto-copy or guesswork.
- SPEC-019 remains Class-A DRAFT. SPEC-017 backend public feed remains disabled pending its own security, historical-proof, performance and Human enablement gates.

## Subsequent implementation integration handoff — not authorized by TASK-104

- **Shared web files:** TASK-039 and TASK-100 independently modify exactly `apps/web/src/App.tsx` and `App.test.tsx` in their respective web-source diffs. The former adds Hunt API, active/result/settings routes and an App smoke assertion; the latter adds Collection/Pokémon/Teams API and views with corresponding route assertions. `routing.ts` and `app.css` remain byte-identical in the inspected baseline. Neither variant may replace the other verbatim; a separately designated FE/LD-qualified integration owner must compose both route/API/session paths and merge both assertion sets in one reviewable integration workspace. Preserve TASK-039's additional `apps/web/package.json` game-data dependency and `tsconfig.json`/`vite.config.ts` alias updates when composing the frontend, rather than bringing only its new modules.
- **Backend adoption boundary:** SPEC-018's `apps/api/src/hunts/catalog-release.ts`, authenticated GET handlers in `apps/api/src/hunts/http.ts`, and registration in `apps/api/src/auth/http.ts` exist inside FE-owned TASK-039. The existing FE role lacks API/persistence implementation authority. Do not mark that backend slice accepted merely because SPEC-018's direction was approved or FE source QA was partial READY. PM/Human Owner must establish an LD-authorized implementation owner or an explicit scope/role override and obtain independent backend QA/IA as required.
- **Baseline guard:** build the eventual integration against the currently accepted main containing TASK-101's terminal-disposition correction. TASK-100's historical API worktree predates that main baseline and cannot be bulk-copied into an integration branch; use its isolated Collection/Team web-source changes instead, with source-level conflict inspection for anything shared.
- **Combined acceptance gate:** after authorized backend ownership and explicitly scoped frontend integration, validate both categories of routes and error/reconnect behavior on the combined source, with TypeScript, focused/full tests, lint/build, independent QA and the designated PM/Human acceptance. Production immutable-artifact origin, public Combat feed and live gameplay remain independent enablement gates; TASK-104's history integration does not authorize application-code integration.
