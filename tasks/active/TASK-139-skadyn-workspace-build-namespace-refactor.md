# TASK-139 — Skadyn Workspace and Build Namespace Refactor

## Metadata

- State: ACCEPTANCE
- Readiness: Human Owner accepted SPEC-031 on 2026-10-15; stage A is stateless and runs on a separately isolated tracked HEAD baseline. No untracked TASK-136/132 **runtime/SQL implementation** was copied or rewritten; control-plane task/spec/roadmap documents were copied to keep local governance checks coherent. Integration/acceptance remains gated on reconciling concurrently dirty source and deciding authoritative documentation ownership.
- Class: B — implementation of the stateless, accepted subset of SPEC-031 only
- Owner: LD → ChatGPT prime (one implementation owner for TASK-139)
- Owner execution surface: Chat On Steroids Core, isolated branch/worktree only
- Control branch: `main`
- Control worktree: `.`
- Reviewer: independent worker-1 source QA **READY P0/P1/P2 = 0/0/0**, worker-2 security/integrity **READY 0/0/0**, independent delegated PM worker-3 **Class-B ACCEPT 0/0/0** on the isolated Stage-A candidate; dirty-main integration still NOT READY
- Reviewer execution surface: independent ChatGPT worker, strict read-only after implementation
- Auditor: N/A only while change remains stateless; IA may be added if worker/deployment or credential semantics change
- Auditor execution surface: N/A
- Consultants: N/A
- Consultant execution surface: N/A
- Branch: `feat/TASK-139-skadyn-workspace-namespace` (HEAD base `558adb6`)
- Worktree: `G:\pokenexus-idle\.worktrees\TASK-139-skadyn-workspace-namespace`; original dirty `main` remains untouched by implementation
- Dependencies: APPROVED SPEC-031 from TASK-138; TASK-136 writer/reconciliation remains open for its untracked Alpha source and API/database work; TASK-132 telemetry source preserved

## Objective and constraints

Rename private workspace packages to `@skadyn/*`, root to `skadyn-idle`, package imports, `pnpm --filter` targets, TS paths, Vite aliases, workspace source metadata, lint/build/test/CI and current technical documentation. Regenerate `pnpm-lock.yaml`; verify `node_modules` link resolution and production Worker dry-runs. Do not rename auth/session cookie wire values, actual RP/origins, SQL schema, persisted versions, Docker volumes, immutable published artifacts or deployed Cloudflare/DO identities. Treat every old source import as a failure except explicitly versioned compatibility modules; original migration/fixtures are frozen.

## Exit criteria

- Full isolated workspace install/build/typecheck/lint and test suites pass; Worker dry-runs and CI commands resolve all packages; no accidental public endpoint or dependency change.
- Independent QA plus separate PM Class-B acceptance for this cross-package refactor.
- No merge/commit/push until the applicable Human repository-history gate; no source work before approved Class-A spec.

## Stage-A execution boundary (2026-10-15)

Implementation changes only files **tracked at HEAD 558adb6**: package scope/imports, workspace npm dependency names, TS aliases, package-name-only build scripts/CI, lockfile, current agent documentation, and roadmap renderer title. It adds one focused namespace CI guard. Only untracked **control-plane documents** (TASK-130..140 and SPEC-029..031) were copied from dirty main to keep the 141-task roadmap locally self-consistent; they are not TASK-139 implementation deliverables and must not be blindly staged/committed. Untracked Alpha entry/config/launcher and telemetry **runtime/SQL files** were deliberately excluded. Integration requires an explicit source-owner three-way reconciliation of 16 overlapping tracked files and newly untracked Alpha/config files after TASK-136/132 gates; passing tests on this isolated baseline never establishes Alpha real-mail or PA-M6.1 acceptance. Historical `pokenexus.*` version strings, old SQL/checksum files, HMAC domains, cookies, local Docker/volume names, WebAuthn RP/origin and published artifact bytes remain unchanged until separately gated TASK-140. No schema/secret/credential migration or deployed Cloudflare operation is authorized.

**Isolated candidate validation:** `corepack pnpm install --offline --frozen-lockfile` PASS; all eight package builds/Worker dry-runs and typechecks PASS; full `pnpm -r test` PASS (game-types 1, realtime 2, database 66, game-core 265, game-data 412 with 1 skip, game-protocol 36, web 172, API 295); scoped ESLint of 111 changed JS/TS files + new namespace check PASS; CI namespace gate PASS; game-data sanity current/compare PASS with immutable v5 `565cdd...` bundle, Worker compatibility dry-runs PASS; 141-task roadmap generation/check and `git diff --check` PASS. These gates apply to tracked HEAD candidate, not the unmerged dirty-main Alpha/telemetry additions.

**Final independent Stage-A gates:** worker-1 Source QA **READY 0/0/0**; worker-2 Security/Integrity **READY 0/0/0**; independent worker-3 PM **Class-B ACCEPT 0/0/0** on the isolated scope. This puts TASK-139 into **ACCEPTANCE pending integration/History**. Main's 16 overlapping tracked paths and untracked TASK-136 Alpha/TASK-132 telemetry still require an owner-led three-way combined change, full recomputed gates and a fresh post-integration independent QA. A passing isolated Stage-A candidate is not permission to commit, merge, push, deploy or migrate the persistent DB.
