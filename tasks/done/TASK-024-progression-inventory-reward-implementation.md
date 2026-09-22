# TASK-024 — Progression / Inventory / Reward Implementation

## Metadata

- State: DONE
- Class: B
- Owner: Lead Developer
- Owner execution surface: ChatGPT delegated implementation worker (explicit Lead Developer assignment; GitHub Copilot CLI unavailable due account quota at implementation start)
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor (reward integrity/concurrency implementation audit)
- Auditor execution surface: fresh independent ChatGPT worker
- Consultants: N/A
- Consultant execution surface(s): N/A
- Specs:
  - `docs/specs/SPEC-004-postgresql-schema-v1.md`
  - `docs/specs/SPEC-006-xp-level-progression-rules.md`
  - `docs/specs/SPEC-007-inventory-item-model.md`
  - `docs/specs/SPEC-009-reward-ledger-integrity.md`
- ADR: `docs/decisions/ADR-005-persistence-data-access-strategy.md`
- Related tasks: TASK-018, TASK-020, TASK-021, TASK-022, TASK-023, TASK-087
- Branch: `feat/TASK-024-progression-inventory-reward-implementation`
- Worktree: `.worktrees/TASK-024-progression-inventory-reward-implementation`

## Objective

Implement the approved Pokémon/Player progression, Inventory ownership/mutation and reward-ledger
contracts as one tested PostgreSQL-backed authority boundary without inventing reward values, drop
tables, Hunt allocation, public API semantics or economy rules.

The implementation must make one frozen TASK-023 Reward Resolution safely retryable and ensure that
its canonical Pokémon-XP, Player-XP and Item-grant effects plus Reward Completion either commit
together or do not commit at all.

## Context

TASK-023 is DONE and SPEC-009 is APPROVED. The current canonical database ends at migration
`0003_collection_team_spec005.sql`. It already has:

- `players.row_version` and `pokemon_instances.row_version` aggregate OCC tokens;
- `player_inventories` as the Inventory root with its own `row_version`;
- Pokémon Level persisted at `1..200`, but no total Pokémon XP;
- no Player Level/XP persistence;
- no Inventory entry/quantity relation;
- no reward-resolution/completion ledger.

TASK-024 fills exactly those accepted persistence/orchestration gaps. TASK-025 owns public API
exposure. TASK-033/034/036 own concrete Hunt/capture/reward-source content and values.

At implementation start, the repository-selected GitHub Copilot CLI `lead-developer` surface was
invoked on this READY task but returned a monthly-quota error before any edit (`+0/-0`). Under the
workflow execution-surface rule, the Lead Developer role is therefore delegated to a fresh ChatGPT
implementation worker without changing role authority, task scope, review separation or acceptance
gates.

## Implementation decisions fixed by accepted specs

- Pokémon XP uses exact integer arithmetic and `pokenexus.level-cubic.v1`:
  `xpFloor(L) = L^3 - 1`, hard Level cap 200 and total XP cap `7_999_999`.
- Player XP uses exact integer arithmetic and `pokenexus.player-linear-cost.v1`:
  `playerXpFloor(L) = 50 * L * (L - 1)`, with no gameplay maximum Level.
- `ItemQuantity` is exact signed-`bigint` non-negative range; persisted entries are strictly positive.
- Player Level/XP persistence must remain lossless for values beyond JavaScript safe integer range.
  PostgreSQL unconstrained `numeric` plus TypeScript `bigint`/lossless decimal-string conversion is
  the baseline technical representation; its PostgreSQL implementation bound is not a gameplay cap.
- Reward authority is `(subjectPlayerId, sourceAuthority, sourceCorrelation)` and is never minted by
  a client request ID, timestamp, session token or display value.
- One source key owns exactly one immutable canonical Reward Resolution before application.
- Resolution and Completion are distinct: resolution freezes intent; completion proves effects.
- One application transaction contains all sibling mutations plus Reward Completion.
- Exact `rulesVersion` / `gameDataVersion` context is pinned; there is no latest/current fallback.

## Scope

### 1. Pure progression evaluation

Add a small Worker-safe progression module, preferably under `packages/game-core`, with exact `bigint`
arithmetic and no database dependency. It must provide deterministic primitives for:

- Pokémon XP floor / Level inversion / grant evaluation;
- Player XP floor / Level inversion / grant evaluation;
- exact applied/discarded-at-cap Pokémon XP;
- zero-applied/no-op results without synthetic mutation;
- overflow/invalid-input rejection for the accepted domains.

The evaluator consumes an explicitly resolved progression rule identity/context. It must never choose
the active/latest rule version implicitly. Persistence/orchestration may inject the exact accepted
rules descriptor/resolver; TASK-024 does not create a global mutable "current rules" authority.

### 2. Forward migration `0004`

Add one canonical forward migration after `0003_collection_team_spec005.sql` that:

- adds `pokemon_instances.total_experience` with exact range `0..7_999_999`;
- backfills every existing Pokémon to `level^3 - 1`, preserving Level exactly;
- database-constrains Pokémon Level/XP consistency for the accepted v1 floor interval;
- adds exact Player `player_level` / `player_total_experience` persistence, backfilled to `1 / 0`;
- uses exact integer PostgreSQL representation for Player progression without a gameplay cap;
- database-constrains Player Level/XP to scale-zero integer values and preserves the accepted
  `playerXpFloor(L) <= XP < playerXpFloor(L+1)` invariant;
- adds one Inventory-entry relation keyed by owner Inventory + encoded `ItemId`, with positive
  `bigint` quantity and no per-copy item identity;
- adds immutable Reward Resolution, normalized reward-effect and Reward Completion persistence;
- enforces database uniqueness for the complete RewardSourceKey;
- enforces at most one Completion per Resolution;
- represents canonical effect kinds only: Pokémon XP, Player XP and Item grant;
- stores frozen Pokémon-XP and Player-XP effect amounts as exact non-negative scale-zero PostgreSQL
  `numeric` (or an equivalently lossless accepted integer representation), because resolved XP grant
  amounts are not bounded by Pokémon stored-state cap or JavaScript/PG signed-bigint range;
- stores frozen Item-grant amounts as exact positive signed-`bigint`, matching accepted
  `ItemQuantity` domain;
- prevents duplicate logical `(effectKind,target)` rows within a Resolution;
- preserves exact opaque source/version/Item identifiers through OpaqueStringDbCodec v1-compatible
  byte representation;
- keeps resolution/completion/effect evidence append-only under normal repository operations;
- stores only required identity/effect/version/timestamp evidence and no session/auth secrets.

Exact table/index names are implementation-owned, but the relational constraints must make the
SPEC-009 duplicate-prevention and subject-ownership invariants enforceable rather than convention-only.

### 3. Reward-resolution claim repository

Implement an internal repository boundary that accepts an already server-authoritative canonical
envelope and:

- validates canonical effect shape and subject ownership boundary;
- creates one application-generated UUIDv7 Resolution identity;
- inserts the immutable normalized effect set and pinned context durably before application;
- converges identical concurrent claims for the same RewardSourceKey on one stored Resolution;
- rejects same-source/different-envelope or different-context claims as integrity conflicts;
- returns existing Resolution state on identical replay;
- never creates Completion or mutates XP/Inventory merely by resolving.

Canonical comparison must be semantic and independent of caller array order. The persisted envelope
contains at most one effect per logical `(effectKind,target)` pair; repeated conceptual contributions
must already be deterministically combined before the claim.

The **claim itself is one atomic database transaction**: unique RewardSourceKey claim, Resolution
parent row, complete normalized effect set and all pinned version/context evidence commit together.
There must be no visible/persisted state in which a source key owns a partial Resolution. A crash,
constraint error or injected failure between parent/effect writes rolls the entire claim back.

For concurrent claim races, the uniqueness loser performs no partial write; after the winning claim
commits, it loads the complete winner and performs the semantic identical-vs-conflicting comparison.
It must not treat an in-flight/partial envelope as an existing immutable Resolution.

### 4. Application-layer atomic reward orchestration

Implement the cross-aggregate reward application/composition service in the application layer,
under `apps/api/src/` (internal service only; no public endpoint semantics). `packages/database`
remains limited to persistence-specific migrations, records/codecs, repositories, transaction-scoped
primitives and database tests in accordance with ADR-005.

The application service may depend on `@pokenexus/database`, `@pokenexus/game-core` and the
Worker-safe `@pokenexus/game-data` runtime surface as required. It must not import Node-only game-data
maintenance/publication modules. Required workspace dependency wiring is explicitly in scope.
`@pokenexus/database` must not gain a dependency on `@pokenexus/game-core` or `@pokenexus/game-data`
to execute rules implicitly; domain/rules composition remains application-owned.

For one stored unresolved Resolution, the application service must:

- serialize/guard duplicate application of the same Resolution using database-enforced state;
- return/reconstruct prior Completion when already completed, with zero additional mutation;
- load/revalidate every required Player/Pokémon/Inventory aggregate and subject ownership;
- compute fresh derived progression from the frozen grant amounts and current accepted target state;
- use the existing aggregate `row_version` boundaries or an equivalently strong reviewed conditional
  strategy inside the same short PostgreSQL transaction;
- apply all non-no-op sibling effects and create Reward Completion in one transaction;
- increment each changed aggregate root rowVersion exactly once for that envelope, regardless of how
  many Item entries for the Inventory or derived fields for that aggregate change;
- leave aggregates with valid zero-applied effects unchanged while still allowing source Completion;
- roll back all sibling mutations and Completion when any target is stale, missing, unauthorized,
  invalid, overflows or otherwise cannot commit;
- on stale application, discard stale derived values and permit retry only against the same frozen
  Resolution after fresh-state reload;
- never change the frozen target, amount, source key or version context during retry.

A narrow `FOR UPDATE`/conditional-write strategy is allowed where needed under ADR-005. The service
controls the short application transaction and composes transaction-scoped database primitives; it
must not hide domain/game-rule execution inside repository side effects. Broad locks, long
transactions, external I/O inside the transaction and hidden automatic retry of stale derived state
are prohibited.

### 5. Pokémon progression persistence

For each frozen Pokémon-XP effect:

- target must still be owned/authorized for `subjectPlayerId`;
- exact rule context must resolve `pokenexus.level-cubic.v1` or fail closed;
- `totalExperience`, `level`, `updated_at` and `row_version` change atomically when applied XP > 0;
- total XP caps at `7_999_999`; excess is reported as discarded-at-cap and never banked;
- applied XP = 0 changes no Pokémon row/version;
- no evolution, Species mutation, Move acquisition or Ability mutation is inferred.

### 6. Player progression persistence

For a frozen Player-XP effect:

- target is exactly `subjectPlayerId`;
- exact rule context must resolve `pokenexus.player-linear-cost.v1` or fail closed;
- arithmetic is `bigint`/lossless end to end;
- Player Level/total XP/timestamp/rowVersion change atomically when grant > 0;
- zero XP changes no Player row/version;
- any technical representation overflow fails before Completion and never clamps;
- Player Level-up creates no implicit unlock/reward/stat/combat effect.

### 7. Inventory grant persistence

For frozen Item-grant effects:

- ItemId belongs to the exact accepted game-data/rules context required by the source, resolved via an
  injected authoritative validator/loader rather than a network/latest fallback;
- positive grant quantities use exact `bigint` arithmetic;
- absent entries are inserted; existing quantities are incremented exactly;
- exceeding `9_223_372_036_854_775_807` fails the whole envelope;
- all Item entries for one envelope and the Inventory root version update atomically;
- Inventory root `rowVersion` increments exactly once if at least one Item quantity changes;
- no capacity/stack/friction rule or unrestricted set-balance/grant API is introduced.

Also implement the baseline internal Inventory repository primitives required by SPEC-007 for later
owning commands:

- ownership-scoped read of Inventory root/version and exact Item quantities;
- positive grant mutation under expected Inventory `rowVersion`;
- positive remove/consume mutation under expected Inventory `rowVersion`;
- insufficient quantity rejects with no entry/root-version change;
- decrement to zero deletes the entry in the same transaction;
- one accepted multi-entry Inventory command increments root `rowVersion` exactly once;
- stale/invalid/overflow commands leave every entry and root version unchanged.

These are persistence primitives only. TASK-024 does **not** invent a player-facing item-use command
or compose consumption with Hunt/capture state; TASK-033/036/038 own those source-specific flows.

### 8. Auditability boundary

Persist the immutable resolution/completion evidence required by SPEC-009. Where TASK-018's generic
audit substrate has an accepted reusable event boundary, emit only bounded non-secret reward events;
otherwise do not overload authentication/security-event tables or invent an unrelated telemetry
taxonomy. Ledger rows themselves are the authoritative reward replay evidence.

### 9. Required PostgreSQL 17 and unit/race coverage

Tests must prove at minimum:

- migration backfill/invariants for existing Pokémon and Players;
- exact Player progression beyond JavaScript safe integer range;
- ItemQuantity at `bigint` boundary and overflow rollback;
- lossless Reward Effect XP amount round-trip and conflict detection beyond JavaScript safe integer
  and beyond signed PostgreSQL `bigint` for Player XP;
- a frozen Pokémon-XP grant amount greater than the Level-200 stored-state cap remains exact in the
  Resolution while application records the correct applied/discarded-at-cap result;
- injected failure between Resolution parent/effect writes leaves no source-key/partial Resolution;
- identical concurrent Resolution claims converge to one record;
- same source with changed target/amount/version is rejected;
- process loss after Resolution/before application leaves a retryable unresolved Resolution;
- two concurrent applications of one Resolution produce exactly one effect set/Completion;
- response loss after commit replays Completion without duplicate XP/items/rowVersion changes;
- stale Pokémon/Player/Inventory attempt rolls back every sibling effect/Completion;
- retry after stale uses fresh target state with the same frozen grant;
- multi-Pokémon + Player-XP + multi-Item envelope commits atomically;
- one Item overflow/unauthorized target causes zero sibling mutations;
- zero XP / Level-200 discarded XP can complete without synthetic aggregate mutation;
- missing/incompatible pinned version context fails before effect/Completion;
- unrelated later rewards advancing target state do not make an already-completed source replayable.

Use disposable real PostgreSQL integration tests for constraints, transactions and races. Mock/unit
tests alone are insufficient for the reward-integrity path.

## Out of scope

- reward amounts, allocation/share formulas, loot/drop tables, cadence or scarcity;
- currencies, prices, sinks, trading, monetization or paid reward systems;
- Hunt/Zone/Gym/PvP/World Boss reward-source rules;
- capture outcome/Pokémon creation;
- item-use product/source semantics or cross-aggregate consume consequences beyond the accepted
  baseline Inventory persistence primitives;
- Move acquisition/eligibility, evolution or Player-Level feature unlocks;
- public HTTP/WebSocket endpoints or client-selected reward authority;
- admin correction UI/negative XP/delevel/negative-item compensation;
- production telemetry/dashboard design;
- Git history mutation without the applicable explicit authorization.

## Acceptance criteria

- [x] Pure progression evaluators implement SPEC-006 exactly with lossless arithmetic.
- [x] Migration/backfills preserve all existing Pokémon Levels and existing Players deterministically.
- [x] Inventory entries enforce SPEC-007 quantity/ownership/root-version invariants.
- [x] Internal Inventory grant and remove/consume primitives implement SPEC-007 OCC, insufficient-
      quantity and delete-at-zero semantics without exposing unrestricted public authority.
- [x] Complete RewardSourceKey is unique and one immutable canonical Resolution wins concurrency.
- [x] Resolution claim is atomic across source-key identity, parent row, complete normalized effects
      and pinned context; failed/interrupted claims leave no partial Resolution.
- [x] Frozen XP effect amounts are persisted losslessly for the full accepted grant domain; Item
      effect amounts remain bounded exactly to accepted signed-bigint `ItemQuantity`.
- [x] Same source/different envelope or pinned context fails closed.
- [x] Resolution never implies Completion or reward mutation.
- [x] All sibling reward effects + Completion are one atomic application transaction.
- [x] Duplicate/concurrent/replayed application can commit effects at most once.
- [x] Stale OCC/constraint/overflow/authorization failure leaves no partial effect or Completion.
- [x] Zero-applied XP can complete without synthetic aggregate rowVersion mutation.
- [x] Exact historical rules/game-data context is required; no latest/current fallback exists.
- [x] Reward evidence is immutable/minimized and contains no secrets.
- [x] No public unrestricted grant/set-balance authority is introduced.
- [x] Real PostgreSQL race/integration coverage exercises the required integrity cases.
- [x] Worker compatibility, workspace lint/typecheck/test/build and migration checks pass.
- [x] Independent QA has no unresolved P0/P1 finding.
- [x] Independent Auditor has no unresolved P0/P1 reward-integrity/concurrency finding.
- [x] PM/fresh delegated Class B acceptance gate passes before merge.

## Class B acceptance evidence

- Final independent QA: **READY**, P0/P1/P2/P3 `0/0/0/0`.
- Final independent reward-integrity/concurrency IA: **PASS**, P0/P1/P2/P3 `0/0/0/0`.
- Disposable PostgreSQL 17:
  - database integration `51/51` PASS;
  - API integration `22/22` PASS;
  - Reward application integration `9/9` PASS.
- API unit `56/56` PASS; database unit `28/28` PASS; game-core `242/242` PASS.
- Workspace `lint`, `typecheck`, `test`, `build`: PASS.
- Database Worker compatibility: PASS, `198.28 KiB` / gzip `40.46 KiB`.
- Reward/API Worker compatibility: PASS, `260.33 KiB` / gzip `53.57 KiB`.
- Exact mixed-pair, rules-only and game-data-only lifecycle behavior separates immutable historical
  resolvability from current new-operation eligibility; deprecated context blocks new claims while
  retained unresolved historical Resolutions remain applicable, and unavailable historical context
  fails closed.
- `packages/database` remains persistence-only; no game-core/game-data dependency is introduced.
- No public Reward endpoint or unrestricted grant/set-balance authority was added.
- `corepack pnpm roadmap:check`: PASS at REVIEW snapshot
  `be414ce5d514304b92a72cc3633ef3b44681b341d5d1dbd6d38761d533be1c28`.
- `git diff --check`: PASS.
- Class B PM/Architecture functional and architectural acceptance gate: **PASS**.
- Human Owner authorized repository history/completion on 2026-09-22.
- Feature implementation/acceptance snapshot integrated to `main` at `5bbf540`
  (`feat(rewards): implement progression inventory and reward`).

## Definition-of-Ready evidence

- Independent QA initial review found one P1 application-layer ownership issue; corrected by moving
  cross-aggregate reward composition to internal `apps/api/src/` and keeping `packages/database`
  persistence-only under ADR-005.
- Independent pre-implementation IA found three P1s: atomic Resolution claim, lossless frozen XP
  effect storage and the same application/persistence layering issue.
- All P1s were corrected in the current brief.
- Fresh QA re-gate: **READY**, P0/P1/P2/P3 `0/0/0/0`.
- Fresh IA re-audit: **PASS**, P0/P1/P2/P3 `0/0/0/0`.
- `corepack pnpm roadmap:check`: PASS.
- `git diff --check`: PASS.
- No product/economy semantics were added; consultants remain N/A for this implementation task.

## Validation / tests

- targeted progression unit tests;
- database repository unit tests;
- disposable PostgreSQL 17 migration/integration/race suite;
- application-layer reward orchestration unit/integration tests;
- API Worker bundle/compatibility validation after any new game-core/game-data dependency wiring;
- `corepack pnpm --filter @pokenexus/database test:worker-compat`;
- `corepack pnpm roadmap:check`;
- workspace `lint`, `typecheck`, `test`, `build`;
- `git diff --check`;
- independent QA review;
- independent reward-integrity/concurrency audit.

## Dependencies

- TASK-018 — Persistence/Auth Recovery, Contract & Baseline Auditability Suite: DONE.
- TASK-021 / SPEC-006: DONE / APPROVED.
- TASK-022 / SPEC-007: DONE / APPROVED.
- TASK-023 / SPEC-009: DONE / APPROVED.
- TASK-087 — canonical static game-data publication/sanity: DONE.
- ADR-005: ACCEPTED.

## Risks / irreversible actions

- A reward race/idempotency defect can permanently duplicate or lose XP/items.
- A migration/backfill defect can corrupt durable progression state.
- Player progression narrowing can accidentally create an implementation-defined gameplay cap.
- Long/broad locking can create production contention; concurrency mechanics require measured review.
- Ledger payload over-collection can create privacy/security debt.
- Forward migration is durable schema history once shared; migration SQL becomes immutable after use.
- No production deployment/database migration is authorized by this task alone.

## Expected files / boundaries

Expected change areas include:

- `packages/game-core/src/` progression evaluator/tests;
- `packages/database/migrations/0004_*.sql`;
- `packages/database/src/` reward/progression/inventory persistence repositories/primitives/tests;
- `packages/database/integration/` PostgreSQL/race tests;
- `apps/api/src/` internal reward application/composition service and tests;
- `apps/api/package.json` / workspace dependency wiring for Worker-safe game-core/game-data consumption
  only where required by the implementation;
- package exports/dependencies only where required by the accepted layering;
- this task + generated roadmap lifecycle metadata.

No public API route or frontend surface is in scope. `apps/api` changes are internal application-layer
composition/dependency wiring only.

## Completion

Use `docs/agents/handoff-protocol.md`. Do not create an ad-hoc implementation-summary/changelog file.
