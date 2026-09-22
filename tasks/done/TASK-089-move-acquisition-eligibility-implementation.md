# TASK-089 — Move Acquisition / Eligibility Implementation

## Metadata

- State: DONE
- Class: B
- Owner: Lead Developer
- Owner execution surface: ChatGPT delegated implementation worker (explicit Lead Developer assignment)
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor (advisory spot-check: exact-context authority and shared Pokémon OCC)
- Auditor execution surface: fresh independent ChatGPT worker
- Consultants: N/A
- Consultant execution surface(s): N/A
- Spec: `docs/specs/SPEC-010-move-acquisition-eligibility-rules.md`
- Related specs:
  - `docs/specs/SPEC-002-static-game-data-and-versioning.md`
  - `docs/specs/SPEC-005-pokemon-instance-collection-team.md`
  - `docs/specs/SPEC-006-xp-level-progression-rules.md`
- ADR: `docs/decisions/ADR-005-persistence-data-access-strategy.md`
- Related tasks: TASK-020, TASK-024, TASK-087, TASK-088, TASK-025
- Branch: `main` (implementation integrated at `bd3d036`; repository history/completion authorized by Human Owner on 2026-09-22)
- Worktree: `.worktrees/main-governance-integration`

## Objective

Implement the APPROVED SPEC-010 v1 server-authoritative Move eligibility boundary: deterministic
Level-derived availability, deterministic bootstrap for uninitialized owned Pokémon, and complete
selected Move Loadout replacement validated against the exact accepted static/rules context and the
shared Pokémon optimistic-concurrency token.

This task must make the rule usable by later application/API integration without adding a public
endpoint, a durable learned/acquired Move inventory, TM/machine acquisition behavior or any other
learn method that SPEC-010 explicitly leaves disabled.

## Context

TASK-088 is DONE and SPEC-010 is APPROVED. TASK-020 already provides the persistence-only ordered
`1..4` Move Loadout repository with owner scoping and expected-`rowVersion` OCC. TASK-024 updates
Pokémon Level through the same `pokemon_instances.row_version`, so Move mutation must safely lose a
race against progression and force the caller to reload/recompute rather than commit an eligibility
decision derived from stale Level/state.

TASK-087 publishes immutable runtime game-data bundles containing Species, Moves and Learnsets.
Published catalog existence alone does not authorize a new operation: SPEC-010 requires one
server-selected exact `{gameDataVersion,rulesVersion}` with retained immutable pair compatibility,
current new-use permission and exact resolution of the accepted Move-eligibility rule descriptor.

TASK-025 remains the owner of player-facing HTTP/API exposure. TASK-089 supplies internal
authoritative services/contracts for TASK-025 to call later.

## Implementation decisions fixed by SPEC-010

- Only `level-up` Learnset rows grant v1 eligibility.
- Resolve exactly one `{sourceGeneration,sourceGame}` Learnset context for the owned Pokémon Species
  inside the exact game-data version; zero or multiple contexts fail closed.
- For duplicate level-up rows of one Move, `unlockLevel(move)` is the minimum published level.
- A Move is currently eligible iff `unlockLevel(move) <= authoritative current Level`.
- Eligibility is derived per operation; no generic learned/acquired Move persistence exists in v1.
- Bootstrap sorts eligible Moves by `unlockLevel DESC`, then exact canonical MoveId UTF-8 unsigned
  byte order ASC, and persists the first `min(4, count)` in that order.
- Bootstrap fails closed on an empty eligible set and never borrows from disabled methods.
- Existing valid selected loadouts are never automatically rewritten by bootstrap, Level gain or a
  later static/rule correction.
- New complete replacements use current authoritative eligibility. A selected Move corrected out of
  eligibility may remain persisted until the next edit, but cannot be carried through that edit while
  it remains ineligible.
- Every new bootstrap/replacement uses one server-selected exact accepted pair. The client cannot
  select `gameDataVersion` or `rulesVersion` as authoritative input.
- The selected `rulesVersion` must resolve the immutable rule artifact
  `pokenexus.move-eligibility.level-up-only.v1` and its retained accepted semantics/hash.
- Retained immutable pair compatibility is distinct from current permission for new operations;
  deprecated/disabled pairs remain historical facts but cannot authorize a new bootstrap/mutation.
- Once a pair is selected for one operation, there is no latest/current fallback, pair substitution
  or rulesVersion substitution.

## Scope

### 1. Pure Worker-safe Move eligibility and bootstrap

Add the smallest deterministic `packages/game-core` implementation needed to:

- accept a minimal generic Learnset-shaped input plus authoritative SpeciesId and current Level;
- require exactly one Learnset source context for that Species;
- ignore every non-`level-up` method for executable eligibility;
- reduce repeated level-up thresholds for one Move by minimum level;
- return current eligible MoveIds with their deterministic unlock levels;
- select deterministic bootstrap MoveIds using the exact SPEC-010 comparator and four-slot cap;
- fail closed on missing/malformed/ambiguous required input instead of guessing or falling back.

`packages/game-core` remains pure and Worker-safe: no database, filesystem, Node-only runtime,
network, HTTP framework or game-data package dependency.

### 2. Exact static/rules context authority

Implement an internal server-side authority boundary that, for each new Move operation:

- selects one exact `{gameDataVersion,rulesVersion}` independently of client command data;
- resolves an explicitly retained immutable compatibility record for that exact pair;
- separately proves the retained pair is currently enabled for new operations;
- resolves the exact `rulesVersion` to the accepted Move-eligibility artifact identity plus its
  retained semantics/hash and rejects mismatched/unavailable descriptors;
- loads Species, Moves and Learnsets from the exact immutable game-data version through the
  Worker-safe `@pokenexus/game-data/runtime` surface;
- rejects missing Species/Move definitions, missing/malformed runtime artifacts and ambiguous
  Learnset contexts before mutation;
- does not infer compatibility or activation from version-string ordering, publication time, a
  "latest" alias or the existence of a published bundle.

The same authoritative source/configuration used by runtime selection must be enumerable in tests so
the catalog-wide bootstrap regression covers every exact context enabled for new v1 operations.

### 3. Bootstrap orchestration

Implement an internal application service for an owned Pokémon that:

1. loads the ownership-scoped Pokémon state and expected `rowVersion`;
2. returns not-applicable/no-op when the Pokémon already has a valid selected loadout;
3. resolves the exact accepted Move context;
4. computes bootstrap from authoritative Species + current Level;
5. persists the complete selected loadout through the existing TASK-020 repository under the same
   expected Pokémon `rowVersion`;
6. returns stale/not-found/failure without a partial write and without silently retrying the old
   eligibility result.

### 4. Complete player-facing loadout replacement authority

Implement the internal application service TASK-025 will later call. It accepts the authenticated
subject/owner identity, Pokémon Instance ID, expected Pokémon `rowVersion` and one proposed complete
ordered `1..4` MoveId list. It must:

- load the current owned Pokémon state;
- resolve the one exact accepted static/rules context for the operation;
- derive current eligibility from authoritative Species + Level;
- require every proposed MoveId to resolve in the exact game data and belong to that eligible set;
- require the existing SPEC-005 cardinality/density/distinctness contract;
- persist only through the existing complete-replacement repository under expected `rowVersion`;
- preserve caller-selected order for a valid replacement;
- mutate nothing on not-owned/not-found/stale/invalid/ineligible/context-resolution failure.

The service must never expose or internally rely on an unrestricted MoveId setter.

### 5. Shared Pokémon OCC and progression race

TASK-089 must treat Pokémon `rowVersion` as the shared concurrency token already used by TASK-020
and TASK-024. Required behavior includes:

- Level/progression changes after eligibility evaluation make the loadout write stale;
- a stale result does not commit the old computed loadout and is not silently retried against fresh
  state without recomputation;
- successful Move mutation increments the aggregate version only through the existing repository;
- no additional Move-specific OCC token or parallel source of truth is introduced.

### 6. Catalog-wide regression and Worker compatibility

Add tests that:

- exercise every new-use-enabled v1 exact context from the authoritative runtime configuration;
- prove every Species/form in each such context can bootstrap at Level 1 to a valid `1..4` loadout;
- prove every Species resolves exactly one selected Learnset source context;
- prove selected/bootstrap MoveIds resolve from the same exact bundle;
- cover duplicate level-up thresholds, disabled methods, empty eligibility and comparator stability
  independent of Learnset row order;
- cover ownership, selected-only grandfathering, exact-context deprecation/mismatch and the
  progression-vs-loadout stale race;
- bundle the TASK-089 application/context path in a Cloudflare Worker dry-run so Node-only imports
  or runtime-incompatible dependencies cannot hide behind tree-shaking.

Current published v2 evidence is expected to remain a concrete regression fixture, but tests must
not assume every published historical bundle is enabled for new bootstrap operations.

## Out of scope

- public HTTP/WebSocket endpoint implementation or request/response protocol design; TASK-025 owns it;
- client-selected authoritative Level, `rulesVersion` or `gameDataVersion`;
- Move execution, damage, cooldown, targeting, AI or combat-rule content;
- automatic selected-loadout mutation on Level gain;
- generic learned/acquired Move tables, repositories, caches-as-authority or migrations;
- enabling `evolution`, `machine`, `egg`, `tutor`, `transfer` or `reminder` acquisition;
- TM/machine ItemId↔Move mapping, Inventory ownership checks, Item consumption/reuse or economy;
- evolution/breeding/transfer product behavior;
- database eligibility inference or a `packages/database` dependency on `game-core`/`game-data`;
- new database schema/migration unless a separately reviewed accepted contract explicitly requires it;
- TASK-090/091 production Move/Ability execution-rule content;
- Git history mutation without separate Human Owner authorization.

## Acceptance criteria

- [x] Pure eligibility uses only one exact selected Learnset context and `level-up` rows.
- [x] Duplicate level-up rows use the minimum threshold and current authoritative Level determines
      present eligibility.
- [x] All disabled methods grant zero v1 eligibility.
- [x] Bootstrap implements exact `unlockLevel DESC` + UTF-8 unsigned-byte MoveId ASC ordering, caps
      at four and fails closed on zero eligible Moves.
- [x] Bootstrap never rewrites a Pokémon that already has a valid selected loadout.
- [x] Every new operation uses one server-selected exact pair with retained compatibility and
      current new-use eligibility checked separately.
- [x] Exact `rulesVersion` descriptor resolves
      `pokenexus.move-eligibility.level-up-only.v1` and retained accepted semantics/hash.
- [x] No latest/current/pair/rules substitution can reinterpret one operation after pair selection.
- [x] Ownership and proposed Species/Move resolution fail closed before mutation.
- [x] Complete loadout replacement accepts only `1..4` distinct currently eligible MoveIds and
      preserves the proposed order.
- [x] Shared Pokémon `rowVersion` prevents a stale eligibility decision from racing progression or
      another Pokémon configuration mutation into persistence.
- [x] Selected-only grandfathering is preserved across static/rules correction; persistence is not
      silently repaired or re-bootstrapped.
- [x] Level gain does not write, insert, remove, reorder or forget selected Moves.
- [x] No durable learned/acquired Move state, Move-learning migration or machine/Inventory hook is
      introduced.
- [x] Catalog-wide regression covers every exact context currently enabled for new v1 bootstrap.
- [x] TASK-089 runtime/application boundaries remain Cloudflare Worker compatible.
- [x] No public endpoint or unrestricted Move setter is introduced.
- [x] Independent QA has no unresolved P0/P1 finding.
- [x] Independent Auditor advisory spot-check has no unresolved P0/P1 authority/OCC finding.
- [x] PM / Architecture Coordinator Class B functional/architectural acceptance passes before merge.

## Validation / tests

- focused `packages/game-core` Move eligibility/bootstrap unit tests;
- application/context authority unit tests for exact pair, lifecycle, descriptor identity/hash,
  ownership, malformed/ambiguous context and selected-only grandfathering;
- catalog-wide runtime regression over every new-use-enabled exact v1 context;
- disposable PostgreSQL integration/race coverage for bootstrap/replacement and shared Pokémon OCC;
- regression proving Pokémon Level gain leaves the persisted selected loadout unchanged;
- Cloudflare Worker dry-run/bundle gate that explicitly imports the TASK-089 application path;
- relevant package `typecheck` / `test` / `build` checks;
- workspace `lint`, `typecheck`, `test`, `build` when practical for final REVIEW;
- `corepack pnpm roadmap:check`;
- `git diff --check`.

## Class B REVIEW evidence

- Independent QA/TECH final gate: **READY / PASS WITH P2**, P0/P1/P2/P3 `0/0/1/0`.
  The sole P2 is a task-local validation-evidence gap: the new disposable PostgreSQL regression could
  not execute because this environment has no `POKENEXUS_TEST_DATABASE_URL`, PostgreSQL service,
  `psql`, usable Docker container or embedded PostgreSQL test dependency. QA found no source
  correction.
- Independent authority/OCC Auditor: **PASS**, P0/P1/P2/P3 `0/0/0/1`. The sole P3 is the same
  missing fresh task-local PostgreSQL execution, classified as evidence closure rather than an
  integrity/concurrency defect.
- Human Owner / PM accepted the exact reviewed Class B functional/architectural snapshot by
  instructing `continue` at the explicit PM review gate on 2026-09-22. This accepts the reviewed
  implementation and its documented non-blocking PostgreSQL evidence gap. Repository history /
  completion was subsequently authorized by the Human Owner on 2026-09-22.
- Focused Move eligibility tests: game-core `7/7` PASS.
- Full `@pokenexus/game-core`: `256/256` PASS.
- Move application/context unit tests: `14/14` PASS.
- Full API unit suite: `70/70` PASS.
- Published v2 catalog regression: `2/2` PASS; all `293` Species/forms have a Level-1 bootstrap
  candidate, the known `9` Species with repeated level-up rows exercise minimum-threshold
  reduction, and accepted Abra/Ampharos bootstrap examples remain exact.
- Cloudflare Worker compatibility: API PASS (`279.52 KiB` / gzip `57.14 KiB`); game-data PASS
  (`22.01 KiB` / gzip `5.43 KiB`).
- Workspace `lint`, `typecheck`, `test`, `build`: PASS.
- `corepack pnpm roadmap:check`: PASS at the final REVIEW state, source
  `8d23ba3172dc642e86354176ed7a85fc2f54dd9712f5ffd93b3cd0e74999c0ca`.
- `git diff --check`: PASS.
- SPEC-010 approved file remains byte-identical at SHA-256
  `773C9F556DA4B4AD40D97C1AB9F71CA249F7C381EE803C7C1250BDF7A50188AD`.
- The exact TASK-089 PostgreSQL regression
  `apps/api/integration/move-eligibility-postgresql.test.ts` is authored and was attempted, but
  execution stopped before test collection because the disposable database URL is unavailable.
  Existing frozen real-PostgreSQL evidence remains applicable to the unchanged primitives composed
  here: TASK-020 proves owner-scoped Move Loadout transaction/OCC behavior; TASK-024 proves
  progression bumps the same Pokémon `rowVersion`. TASK-089 unit coverage additionally proves the
  application surfaces stale once and performs no hidden eligibility retry.
- Fresh task-local PostgreSQL execution should be run when a disposable PG17 URL is available before
  repository completion if that environment becomes available; no source change is required by
  either independent reviewer.

### Post-DONE PostgreSQL evidence closure

- On 2026-09-22, after TASK-089 completion, the Human Owner requested execution of the previously
  deferred task-local PostgreSQL regression.
- A disposable `postgres:17-alpine` container was started with database
  `pokenexus_test_task089`; the test suite applied the canonical migrations itself and the container
  was removed immediately after execution.
- Exact command:
  `corepack pnpm --filter @pokenexus/api exec vitest run --config vitest.integration.config.ts integration/move-eligibility-postgresql.test.ts`.
- Result: **4/4 PASS**. The run proves deterministic bootstrap/no rewrite, ownership fail-closed,
  shared Pokémon OCC rejection of a progression-vs-loadout race without hidden retry, and preservation
  of the selected ordered loadout across a later Level change while the shared OCC version advances.
- No source, migration or test change was required. The worktree remained clean and synchronized with
  `origin/main` after the disposable database was removed.
- This execution closes the factual PostgreSQL evidence gap that produced the historical QA P2 / IA
  P3 annotations. Those original reviewer results remain preserved above as review-history facts.

## Dependencies

- TASK-020 — DONE; provides persistence-only selected Move Loadout + Pokémon OCC repository.
- TASK-024 — DONE; provides authoritative Pokémon progression on the shared aggregate OCC token.
- TASK-087 — DONE; provides immutable canonical runtime game-data delivery.
- TASK-088 / SPEC-010 — DONE / APPROVED; owns all Move eligibility/bootstrap semantics in scope.
- TASK-025 — downstream PLANNED consumer; must not bypass this authority.

## Risks / irreversible actions

- Treating raw Learnset membership as authority would enable disabled acquisition methods.
- Selecting/falling back to another static/rules context could reinterpret one command and violate
  deterministic authority.
- Computing eligibility from stale Level and then writing after progression would authorize a Move
  decision against state that no longer exists; shared OCC must reject it.
- Persisting a learned/acquired set would create new correction/grandfathering semantics and is a
  Class A product-rule extension outside this task.
- Adding machine/TM hooks would require Item↔Move authority and consume/reuse semantics that are not
  approved in SPEC-010.
- No destructive/irreversible database action is authorized by TASK-089.

## Expected files / boundaries

Expected implementation areas may include:

- `packages/game-core/src/` — pure eligibility/bootstrap implementation + focused tests/export;
- `apps/api/src/` — internal exact-context authority and Move application orchestration;
- `apps/api/integration/` — PostgreSQL/catalog/Worker compatibility tests or bundle entry;
- existing `packages/database` repository APIs from TASK-020, reused without adding eligibility
  semantics or a new learned-Move schema.

No public API route, new dependency, database migration, learned-Move persistence or TM/machine Item
hook is expected in the accepted baseline.

## Current execution state

The Human Owner authorized TASK-089 implementation on 2026-09-22 while initially withholding
Git/history mutation. Implementation completed and the exact uncommitted REVIEW snapshot passed independent
QA/TECH READY/PASS WITH P2 and independent authority/OCC IA PASS; neither review found a P0/P1 code
defect. At the explicit PM review gate, the Human Owner then instructed `continue` on 2026-09-22,
which records Class B functional/architectural acceptance of that exact snapshot and advances the
task to ACCEPTANCE. The Human Owner subsequently authorized repository history/completion on
2026-09-22; that authorization permits the frozen
implementation snapshot to be committed/published and the task to transition to DONE without
rebase/reset/force. After DONE, the previously deferred task-local PostgreSQL regression was executed
on disposable PostgreSQL 17 and passed `4/4`, closing the remaining validation-evidence gap without
any source change.

## Completion

- TASK-089 is DONE.
- Human Owner / PM accepted the exact Class B REVIEW snapshot and its documented non-blocking
  PostgreSQL evidence gap on 2026-09-22.
- Human Owner separately authorized repository history/completion on 2026-09-22.
- The accepted implementation snapshot is integrated to `main` at `bd3d036`
  (`feat(moves): implement move eligibility authority`).
- Fresh closure re-gates before the implementation commit: game-core `256/256`, API `70/70`,
  published-catalog regression `2/2`, API Worker compatibility PASS, game-data Worker
  compatibility PASS, workspace `lint` / `typecheck` / `test` / `build` PASS,
  `roadmap:check` PASS and `git diff --check` PASS.
- The authored task-local PostgreSQL regression subsequently ran on disposable PostgreSQL 17 and
  passed `4/4`; the historical QA P2 / IA P3 evidence deferral is therefore closed. No source
  correction was required.
- TASK-025 and TASK-090 are not auto-activated by this completion.
