# TASK-108 — Persistent Pokémon Vitality & HUB PokéCenter Implementation

## Metadata

- State: ACCEPTANCE
- Acceptance note: independent QA and independent Auditor both report READY with P0/P1/P2 = 0/0/0; delegated Class-B functional/architectural acceptance completed on 2026-10-02; persistent-environment migration, repository/history integration and DONE transition remain separately gated
- Readiness note: Human Owner explicitly authorized implementation on 2026-10-02; schema/migration source and disposable-PostgreSQL validation are authorized, but no persistent-environment migration, Git-history, deploy or public enablement is implied
- Class: B — implement the accepted SPEC-021 persistence/API contract
- Owner: Lead Developer
- Owner execution surface: ChatGPT delegated implementation worker
- Reviewer: independent QA Reviewer (domain/API/database conformance)
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: independent Auditor (OCC, lock order, migration/cutover, ownership/idempotency and race safety)
- Auditor execution surface: independent ChatGPT delegated auditor
- Consultants: N/A — product behavior and persistence strategy are already accepted
- Consultant execution surface(s): N/A
- Specs: APPROVED SPEC-021; APPROVED SPEC-013/015 as forward-amended by SPEC-020/021
- Related: TASK-013/014/020/024/025/035/036/038/106
- Branch: `feat/TASK-108-persistent-vitality-pokecenter`
- Worktree: `.worktrees/TASK-108-persistent-vitality-pokecenter`

## Objective

Implement the approved durable `PokemonVitality` authority and HUB PokéCenter transaction model so forward Solo Hunts start from persisted HP, terminalization writes final HP safely, ownership flows can attach vitality atomically through one reusable authority, and the selected saved Team can be healed at the HUB without racing Hunt Start/terminalization.

## In scope

1. Add the accepted durable aggregate:
   - `PokemonVitality(ownerPlayerId,pokemonInstanceId,currentHp,rowVersion,updatedAt)`;
   - unique `(ownerPlayerId,pokemonInstanceId)`;
   - `currentHp >= 0`;
   - `maxHp` and conscious/KO remain derived.
2. Implement the reusable atomic vitality-creation authority:
   - a newly owned Pokémon can receive its max-HP vitality row inside the caller's ownership transaction;
   - retries cannot create divergent duplicate vitality;
   - integrate the existing captured-Pokémon creation path with this authority;
   - expose the same transaction-safe primitive/contract for downstream bootstrap use without implementing the new-player bootstrap transaction here.
3. Implement forward migration/cutover:
   - pre-cutover owned Pokémon may initialize at then-current derived max HP because no prior durable out-of-Hunt HP exists;
   - historical active Hunts are never reinterpreted;
   - cutover either proves no active historical Hunt for the Player or serializes after its termination.
4. Implement max-HP reconciliation:
   - decreases clamp `currentHp` in the same authoritative transaction;
   - increases do not heal;
   - `currentHp = 0` remains KO when max HP rises.
5. Rebase forward Solo Hunt Start:
   - Player Hunt root locks first;
   - selected saved Team/config + vitality rows are locked/revalidated;
   - KO members may remain selected;
   - Start succeeds iff at least one selected member is conscious;
   - Team order chooses the first living eligible initial active;
   - pinned runtime starts from persisted HP, never implicit max HP.
6. Rebase Hunt terminal writeback so final owned HP is persisted atomically under the accepted lock order/OCC and historical rules remain historical.
7. Implement idempotent HUB PokéCenter command with explicit owned `teamId`:
   - Player Hunt root first;
   - reject while any Solo Hunt is active;
   - allow during 30-second recovery;
   - lock saved Team/members and vitality in canonical identity order;
   - heal exactly that Team to derived max HP, including KO -> conscious;
   - fully healed Team causes no unnecessary vitality version churn.
8. Expose the accepted self-scoped read/write shapes required by downstream management UI without making client-cached HP authoritative.

## Out of scope

- Starter choice/Inventory kit/Wilds content and strict Move-loadout admission beyond the vitality-consciousness rule.
- Potion/Revive/capture policy evaluation or Inventory debit.
- Game-core Revive cleanup primitives.
- Offline 8h reconciliation, D-F16 post-Battle provenance/Hunt activity, presentation v2 or frontend implementation.
- A global active-Team selector; PokéCenter uses explicit owned `teamId`.

## Acceptance criteria

- [x] Migration/schema constraints and indexes implement the exact SPEC-021 aggregate.
- [x] The reusable vitality-creation primitive is transaction-safe/idempotent, and existing captured-Pokémon ownership cannot commit without the matching vitality row.
- [x] The primitive contract is consumable by TASK-109 inside its bootstrap ownership transaction without requiring TASK-108 to own starter/Team/Inventory bootstrap logic.
- [x] Damaged Leader Start pins exact persisted HP.
- [x] KO earlier Team members are skipped in authoritative order; all-KO selected Team blocks Start.
- [x] Terminal/Retreat/no_living writeback persists final HP without lost updates or cross-Hunt leakage.
- [x] Center-vs-Start and Center-vs-terminal races serialize through the Player Hunt root in both lock orders.
- [x] PokéCenter rejects active Hunt, succeeds during recovery, heals exactly selected Team and does not churn already-full rows.
- [x] Max-HP decrease/increase/zero-HP reconciliation matches SPEC-021 exactly.
- [x] Historical Hunts retain their historical full-HP-start/replay semantics.
- [x] Independent QA and IA report no unresolved P0/P1; Class-B acceptance completes after implementation.

## Required validation

- Disposable PostgreSQL migration/constraint tests.
- Real transaction/OCC/idempotency tests for Start, terminal writeback, reusable vitality creation, existing capture integration and PokéCenter.
- Explicit Center-vs-Start and Center-vs-terminal concurrency tests in both lock orders.
- Restart/retry and foreign-resource indistinguishability tests.
- Relevant database/API/game-core integration, lint/typecheck/test/build.

### Owner validation evidence

- `@pokenexus/database` unit: 33/33 PASS; PostgreSQL integration: 90/90 PASS.
- `@pokenexus/game-core`: 232/232 PASS.
- `@pokenexus/api` unit: 169/169 PASS; PostgreSQL integration: 72/72 PASS.
- Database, game-core and API typecheck: PASS.
- Root lint and build: PASS.
- `git diff --check`: PASS.

## Dependencies

- APPROVED SPEC-021 and SPEC-020.
- TASK-013/014 persistence foundation, TASK-020 Collection/Team persistence, TASK-036 capture creation, TASK-038 Hunt orchestration historical baseline.
- TASK-106 Class-A acceptance complete.

## Risks / irreversible actions

- Migration/cutover can irreversibly establish forward vitality authority and therefore requires disposable-DB proof plus explicit migration authorization before execution against any persistent environment.
- Lock-order drift can deadlock or allow double-Hunt/heal races.
- No persistent-environment migration, deploy, public enablement or Git-history action is authorized by this task.

## Readiness / execution gate

Definition of Ready is satisfied and Human implementation authorization was given on 2026-10-02. The assigned owner may implement schema/runtime source and run disposable migration/concurrency tests. Persistent-environment migration, commit/push/merge/deploy/public enablement remain separately gated.
