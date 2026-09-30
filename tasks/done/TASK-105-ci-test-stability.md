# TASK-105 — CI Test Discovery and Published-Loader Timeout Stability

## Metadata

- State: DONE
- Class: C — test-runner discovery and test-only execution budgets; no production runtime or acceptance semantics change
- Human direction: investigate the recurring `validate` failure reported on 2026-09-30 and correct the proven CI test-runner instability; Human Owner subsequently authorized proceeding with TASK-105 commit, integration and a task-scoped push
- Owner: Lead Developer (ChatGPT task-scoped implementation)
- Owner execution surface: ChatGPT in isolated TASK-105 worktree
- Reviewer: N/A — only test execution configuration and per-test timeout controls; no production code changes
- Reviewer execution surface: N/A
- Auditor: N/A — no security, concurrency, persistent data or public API implementation change
- Auditor execution surface: N/A
- Consultants: N/A — no gameplay, balance, progression or economy decisions
- Consultant execution surface(s): N/A
- Dependencies: TASK-003, TASK-104 — DONE
- Specs: N/A — immutable published catalogs and existing verification invariants unchanged
- Branch: `fix/TASK-105-ci-test-stability`
- Worktree: `.worktrees/TASK-105-ci-test-stability`
- Repository history: Human Owner authorized TASK-105 commit/integration/push on 2026-09-30. The existing local `main` includes eight separately integrated commits absent from `origin/main`; publishing those other commits is a distinct scope and not authorized by this task. No deployment authorization is implied.

## Objective

Remove redundant compiled-test execution and give fully verified immutable catalog loads an execution budget appropriate for the shared CI runner, preserving their exact hash/count/provenance assertions.

## Scope

- Restrict standard `game-core` and `game-types` test discovery to `src/` so compiled `dist/*.test.js` copies cannot run alongside source suites after typecheck.
- Apply explicit, test-local timeouts to the heavy canonical v1/v2 published-load validations in `game-data`, retaining all existing assertions and loader logic.
- Document the reproducible CI failure and test discovery evidence, register this task and regenerate/check its roadmap in the isolated worktree.

## Out of scope

- No production source, published static game data, schema, snapshots, hashes, game rules, public endpoint or security behavior changes.
- No global timeout increase, suppression of failing tests, hidden retries, CI gate removal, package upgrades or unrelated refactors.
- No commit, merge, rebase, push or deployment without separate Human Owner authorization.

## Acceptance criteria

- [x] After `typecheck` builds `dist`, the standard `game-core` and `game-types` test commands execute all source tests exactly once and do not discover compiled `.test.js` files.
- [x] Both immutable published bundles and the v2 publication-sanity fixture preserve byte-level hash/count/content validation with sufficient per-test execution time.
- [x] Focused tests, full workspace `pnpm test`, typecheck, relevant lint, roadmap check and whitespace check pass; remaining environment-dependent limitations are reported.
- [x] Unrelated worktrees remain unchanged; TASK-105's history integration was separately authorized on 2026-09-30, while publication of other local commits remains outside this task's scope.

## Diagnostic evidence

The supplied Linux GitHub Actions `validate` log failed `packages/game-data/src/publication.test.ts:213` because the v2 loader test took 5,098 ms and exceeded Vitest's default 5,000-ms test timeout. The same CI run reported source and compiled `dist` copies of `game-core` test suites, 460 cases across 26 files where the source has 13 test files; `game-types` had both `src/index.test.ts` and `dist/index.test.js`. This duplication appears after earlier `pnpm typecheck` builds. The published loader verifies the entire candidate through `loadPublishedBundle`, including immutable manifest, provenance, payload canonicality and artifact hashes. An isolated local v2 run took about 2.2 seconds and passed; this confirms the result depends on available execution time, not a failed hash assertion in the supplied run.

## Validation

- `corepack pnpm install --offline --frozen-lockfile --ignore-scripts` — PASS; lockfile unchanged.
- `corepack pnpm typecheck` — PASS; produced `dist` output before test discovery.
- `corepack pnpm test` — PASS, **857/857 tests** with one separate intentionally skipped live-ingestion case. Standard `game-core` test command now executes **230 tests in 13 source files** instead of 460 in 26 source+compiled files; `game-types` executes **one source file/test** instead of two.
- `game-data` — **365 PASS, one intentionally skipped**. Its v1/v2 loader checks and publication-sanity checks retain the original immutable hashes and catalog-count assertions. The full suite observed the v1/v2 loader checks at approximately 3.5/4.0 seconds and the v2 sanity check at approximately 4.7 seconds under parallel package execution; 15-second budgets apply **only** to these three tests.
- `corepack pnpm lint`, `corepack pnpm build` (Wrangler dry run), `corepack pnpm roadmap:check`, `corepack pnpm portfolio:check-local` and `git diff --check` — PASS. The provisional portfolio contains **106 IDs, 54 registered worktrees, five open task files across four owner worktrees, and six verified local links**.
- The Windows workspace results demonstrate the CI command and de-duplication after build, but the change has not yet run on GitHub's Linux runner. Remote `validate` cannot be claimed until the task is published and the workflow runs. The local main-to-origin commit gap must not be silently published as a side effect of TASK-105's scoped authorization.
