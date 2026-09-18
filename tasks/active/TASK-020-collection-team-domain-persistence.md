# TASK-020 — Collection & Team Domain/Persistence Implementation

## Metadata

- State: ACCEPTANCE
- Class: B
- Owner: Lead Developer
- Owner execution surface: ChatGPT delegated implementation worker (explicit Lead Developer assignment; GitHub Copilot CLI unavailable due account quota at task start)
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor (concurrency/integrity implementation audit)
- Auditor execution surface: fresh independent ChatGPT worker
- Specs:
  - `docs/specs/SPEC-005-pokemon-instance-collection-team.md`
  - `docs/specs/SPEC-004-postgresql-schema-v1.md`
- ADR:
  - `docs/decisions/ADR-005-persistence-data-access-strategy.md`
- Related contracts:
  - `docs/specs/SPEC-001-core-domain-model.md`
  - `docs/specs/SPEC-003-combat-rules-v1.md`
- Branch: `feat/TASK-020-collection-team-domain-persistence`
- Worktree: `.worktrees/TASK-020-collection-team-domain-persistence`

## Objective

Implement the approved SPEC-005 Pokémon Instance / private Collection / selected Ability / ordered Move
Loadout / saved Team persistence contract on top of SPEC-004 and ADR-005, without inventing new
progression, Move-acquisition, Ability-selection, mode-lineup or public API semantics.

The implementation must give later API/mode tasks a tested persistence boundary that:

- preserves Pokémon ownership as Collection authority;
- persists nullable selected Ability and ordered `1..4` Move Loadout state;
- persists dense ordered saved Team rosters of `0..6` owned Pokémon;
- enforces no within-Team duplicate while permitting cross-Team reuse;
- performs Pokémon configuration and Team mutations under explicit optimistic concurrency;
- fails closed on stale mutations/deletes and on legacy unordered Team data that cannot be converted
  without inventing gameplay order.

## Context

TASK-019 is DONE and SPEC-005 is APPROVED. TASK-014 already provides immutable SQL migrations,
PostgreSQL 17 integration testing, UUIDv7 generation, OpaqueStringDbCodec v1, invocation-local
`pg.Client` access and short `READ COMMITTED` transactions.

The current baseline has:

- `pokenexus.pokemon_instances` with owner, SpeciesId, Level, IVs and `row_version`;
- `pokenexus.pokemon_teams` with owner and `row_version`;
- `pokenexus.pokemon_team_members` with ownership-consistent FKs but no accepted slot/order/duplicate
  semantics yet.

SPEC-005 now freezes the missing rules. TASK-020 materializes them. It does not expose HTTP endpoints;
TASK-025 owns player-facing Collection/Team/Move-loadout API integration.

Static Species/Ability/Move definitions remain in game-data. `packages/database` must not decide that
an Ability or Move is gameplay-eligible merely because an opaque ID is structurally valid. The caller
of a persistence mutation is responsible for authoritative static/content eligibility under the
owning accepted rule; this task guarantees persistence/domain structural invariants and concurrency.

## Scope

### 1. Forward migration for SPEC-005 persistence

Add one new canonical immutable migration after `0002_authentication_session_foundation.sql`.

The migration must:

- add nullable `selected_ability_id bytea` to `pokenexus.pokemon_instances` with the same
  non-empty/even-length opaque-string shape rule used by accepted static IDs when non-null;
- add an ordered Move Loadout child relation for Pokémon Instances with:
  - authoritative owner relation to `pokemon_instances`;
  - `slot` constrained to `1..4`;
  - one row per Pokémon/slot;
  - no duplicate MoveId within one Pokémon loadout;
  - non-empty/even-length `move_id bytea`;
- extend `pokenexus.pokemon_team_members` with explicit `slot` constrained to `1..6`;
- enforce one member per Team/slot;
- enforce no duplicate Pokémon Instance within one Team;
- preserve the existing same-owner composite FKs;
- preserve cross-Team reuse by avoiding any global uniqueness constraint on Pokémon membership;
- keep existing `team_member_id` if retained by the current schema; it remains persistence identity
  only and never becomes roster order authority.

### 2. Fail-closed legacy Team-order handoff

Before adding mandatory Team slot semantics, the migration must prove the existing
`pokemon_team_members` relation is empty.

The migration must take a PostgreSQL lock strong enough to prevent concurrent old-application
membership inserts from racing the emptiness proof and the slot/constraint ALTERs. The emptiness
check and schema transition remain inside the canonical migration transaction.

If any row exists, migration execution must fail before fabricating slot/order semantics. It must not
derive order from:

- `team_member_id` / UUID ordering;
- `created_at`;
- physical/insertion order;
- any other infrastructure artifact.

No automatic data rewrite or conversion policy is authorized. A non-empty target returns to a
separate reviewed conversion decision.

### 3. Pokémon persistence/domain boundary

Implement persistence-facing Pokémon records and operations in `packages/database` that can:

- load a Pokémon Instance by authoritative owner + Pokémon Instance ID with selected Ability,
  ordered Move Loadout and `rowVersion`;
- persist selected Ability assignment/removal under expected Pokémon `rowVersion`;
- replace the complete selected Move Loadout under expected Pokémon `rowVersion`;
- reject structural invalidity before/at persistence:
  - loadout length outside `1..4`;
  - duplicate MoveIds;
  - empty opaque IDs where the accepted identifier requires non-empty content;
- preserve every otherwise valid opaque TypeScript string losslessly through OpaqueStringDbCodec v1,
  including non-ASCII, NUL and unpaired-surrogate edge cases; do not add trimming, normalization,
  case-folding or a new identifier grammar;
- fail closed when persisted opaque-ID bytes cannot be decoded by the accepted codec (for example,
  odd byte length);
- increment Pokémon `rowVersion` exactly once on a successful configuration mutation;
- update the Pokémon aggregate `updated_at` on a successful configuration mutation and leave it
  unchanged on stale/not-found failure;
- return a typed stale/not-found/updated result rather than silently retrying a stale command.

The database repository does **not** grant static Ability/Move eligibility. A caller must have already
performed the authoritative Species/learned-or-available Move check required by SPEC-005. Repository
naming/docs/tests must make that boundary explicit.

A later static-data correction does not trigger read-time mutation, cleanup or reroll of already
persisted selected Ability/loadout state.

The Pokémon aggregate load must be snapshot-coherent: parent fields / `rowVersion` and ordered
Move Loadout returned in one repository result must describe one committed database snapshot. Prefer
a single SQL statement; if multiple statements are used, the implementation must use an explicit
transaction/isolation/locking strategy that guarantees equivalent coherence. A `READ COMMITTED`
multi-statement/autocommit load that can combine an old parent/version with newer child rows is not
acceptable.

The forward migration must not fabricate Moves for pre-existing Pokémon. Therefore zero child rows
may exist as a staged/uninitialized persistence state after upgrade; repository reads must represent
that state distinctly from a valid selected `1..4` Move Loadout, and any authoritative loadout-write
operation must reject an empty replacement. Such an uninitialized Pokémon is not battle-eligible
under SPEC-005 until an owning authoritative source establishes a valid loadout.

### 4. Private Collection ownership boundary

Collection membership remains owner-derived; do not add a Collection table or CollectionId.

Provide the minimum persistence operations needed for later authoritative composition, including
ownership-scoped Pokémon lookup/collection membership queries without creating a public ordering,
capacity, visibility or pagination product contract.

If an implementation needs deterministic test/query ordering, it must be documented as an
infrastructure/testing order only and must not become gameplay or UI authority.

### 5. Saved Team repository/domain operations

Implement Team persistence operations in `packages/database` for:

- create an empty Team for one authoritative owner using application-generated UUIDv7;
- load one Team by owner + TeamId with ordered dense roster and `rowVersion`;
- load an owner's saved Teams without defining a global active-Team pointer; a list operation may
  return Team summaries only, but if it returns rosters then each returned Team's metadata /
  `rowVersion` + roster must satisfy the same snapshot-coherence requirement as a single-Team load;
- atomically replace the complete roster under expected Team `rowVersion`;
- atomically delete a Team under expected Team `rowVersion`.

Each Team aggregate load must likewise be snapshot-coherent: Team metadata / `rowVersion` and the
ordered roster returned together must come from one committed snapshot. Use one SQL statement or an
explicit transaction/isolation/locking strategy that provides the same guarantee; do not compose an
aggregate from independently visible `READ COMMITTED` statements that can straddle a concurrent
roster replacement.

Roster replacement must:

1. reject more than six members;
2. reject duplicate Pokémon Instance IDs;
3. validate that every member belongs to the Team owner;
4. preserve caller-supplied order exactly as dense slots `1..N`;
5. update child membership rows and increment Team `rowVersion` in one short transaction;
6. update Team `updated_at` on success;
7. fail closed with no partial member/version/timestamp mutation when the expected version is stale.

Delete must:

- validate authoritative ownership;
- require expected Team `rowVersion`;
- remove membership + Team atomically;
- fail closed on stale version with no partial deletion;
- never delete Pokémon Instances.

Cross-Team reuse must work naturally: one Pokémon may appear in multiple saved Teams for the same
owner.

### 6. Concurrency implementation requirements

Use ADR-005 short command-scoped PostgreSQL transactions and explicit OCC. No transaction may span
external I/O or unrelated work.

Required race evidence must include at least:

- two concurrent roster replacements from the same Team version: exactly one succeeds; the loser is
  stale and cannot partially overwrite membership;
- roster replace racing Team delete from the same Team version: at most one accepted mutation wins and
  no orphan/partial membership state remains;
- two concurrent Pokémon configuration mutations from the same Pokémon version: exactly one succeeds;
  the loser is stale and cannot partially rewrite Ability/loadout state.

Read-side concurrency evidence must prove aggregate snapshot coherence during a concurrent replace,
or the repository implementation must be structurally one-statement in a way the tests can assert
without timing dependence.

Do not silently auto-retry a stale command with the old intent.

### 7. Real PostgreSQL 17 integration coverage

Extend the disposable PostgreSQL integration suite to prove:

- migration chain now includes the new migration and remains idempotent/checksum-protected;
- upgrade from canonical `0001+0002` with empty Team membership succeeds;
- upgrade with any pre-existing unordered Team membership fails closed and leaves the new migration
  unapplied;
- the empty-membership proof cannot race a concurrent insert from an old application connection;
- selected Ability null/non-null shape;
- Move Loadout slot range, slot uniqueness and per-Pokémon Move uniqueness;
- Team slot range, Team/slot uniqueness and Team/Pokémon uniqueness;
- same-owner membership is enforced;
- same Pokémon may appear in two Teams for the same owner;
- cross-owner Team membership is rejected;
- roster replacement, delete and Pokémon configuration OCC/atomicity including deterministic race
  tests;
- Pokémon and Team aggregate loads cannot return mixed parent/version + child states across a
  concurrent replace;
- stale operations do not increment versions or leave partial rows.

Only disposable databases named `pokenexus_test` or `pokenexus_test_*` may be used.

### 8. Unit/package integration

Add focused unit tests for structural validation, row/result mapping and query orchestration where
they provide fast deterministic coverage.

Export only the repository/domain-facing operations that later server-side orchestration needs.
Do not expose SQL details or make database row ordering a domain contract.

No new third-party dependency is expected or authorized.

## Out of scope

- HTTP/API endpoints, request/response contracts or Cloudflare route wiring (TASK-025);
- player-facing Move-loadout UI/API mutation before an accepted authoritative eligible-Move source is
  available;
- capture/grant/reward Pokémon creation semantics;
- XP curves, level progression or post-cap behavior (TASK-021);
- evolution, breeding, EVs, Natures, nicknames or Pokémon release/transfer;
- item/TM/tutor consumption or learned-Move inventory semantics (TASK-022+);
- Ability distribution weighting or Ability-changing items;
- Team display name/icon/favorite metadata;
- global active-Team persistence;
- domain-level saved-Team count cap or product-visible Team quota;
- public/social Collection/Team visibility;
- mode-specific active/reserve mapping, admission or lineup behavior;
- Hunt/PvP/Gym/Duo/World Boss orchestration;
- changes to Combat Engine resolution;
- new ORM/query-builder/migration framework;
- edits to applied migrations `0001` or `0002`;
- destructive/down migrations;
- new runtime/deployment resource or Hyperdrive provisioning;
- new dependency/lockfile changes unless separately reviewed and explicitly authorized;
- Git commit/push/merge/rebase/reset/force before the separate Human Owner repository-history gate.

## Acceptance criteria

- [x] One forward migration materializes SPEC-005 without editing `0001` or `0002`.
- [x] Migration fails closed before introducing Team slots when pre-existing unordered Team membership
      exists.
- [x] Migration prevents concurrent membership insertion from racing the empty-table proof/schema
      transition.
- [x] Pokémon Instance persists nullable selected Ability without treating persistence as static
      eligibility authority.
- [x] Ordered selected Move Loadout persists exactly `1..4` distinct MoveIds with explicit dense
      slots and ownership-consistent parent relation.
- [x] Migration does not fabricate a loadout for existing Pokémon; zero-slot staged state is readable
      but cannot be written as a valid selected loadout and remains battle-ineligible.
- [x] Selected Ability and Move Loadout mutations use expected Pokémon `rowVersion`, increment once
      on success and fail stale without partial mutation.
- [x] Pokémon aggregate reads return parent/version + loadout from one coherent committed snapshot.
- [x] Private Collection remains ownership-derived; no Collection aggregate/table/capacity rule is
      added.
- [x] Saved Team supports ordered dense `0..6` roster, no within-Team duplicate and same-owner
      membership.
- [x] Same Pokémon Instance can appear in multiple Teams owned by the same Player.
- [x] Team roster replacement is aggregate-atomic under expected Team `rowVersion`.
- [x] Team deletion is aggregate-atomic under expected Team `rowVersion` and never deletes Pokémon.
- [x] Team aggregate reads return Team/version + ordered roster from one coherent committed snapshot.
- [x] No global active-Team pointer or mode-lineup semantics are introduced.
- [x] Real PostgreSQL 17 tests prove structural constraints, successful/stale OCC and required race
      cases.
- [x] Successful aggregate mutations update the owning aggregate timestamp/version exactly as defined;
      stale/not-found paths leave both unchanged.
- [x] Migration upgrade/idempotence/checksum behavior remains correct.
- [x] No static-data correction performs implicit read-time reroll/removal of persisted
      Ability/loadout state.
- [x] No new third-party dependency, ORM/query builder, API route, runtime binding or unrelated
      refactor is introduced.
- [x] `packages/game-core` remains database/driver-free and unchanged unless a narrowly justified
      infrastructure-free type exposure is required and independently reviewed.
- [x] Database package lint/typecheck/unit/build/Worker-compat and real PostgreSQL integration pass.
- [x] Workspace lint/typecheck/test/build, roadmap check and diff check pass.
- [x] Independent QA has no unresolved P0/P1 findings.
- [x] Independent Auditor has no unresolved P0/P1 concurrency/integrity findings.
- [x] PM / Architecture Coordinator acceptance passes after QA + IA.

## Validation / tests

Run at least:

```text
corepack pnpm --filter @pokenexus/database lint
corepack pnpm --filter @pokenexus/database typecheck
corepack pnpm --filter @pokenexus/database test
corepack pnpm --filter @pokenexus/database build
corepack pnpm --filter @pokenexus/database test:worker-compat
POKENEXUS_TEST_DATABASE_URL=<disposable-pg17-url> corepack pnpm --filter @pokenexus/database test:integration
corepack pnpm lint
corepack pnpm -r typecheck
corepack pnpm -r test
corepack pnpm -r build
corepack pnpm roadmap:check
git diff --check
```

Also verify:

- canonical migration discovery includes the new migration after `0002`;
- no changes to `0001_postgresql_schema_v1.sql` or
  `0002_authentication_session_foundation.sql`;
- no `apps/web`, `apps/realtime`, Combat Engine behavior or public API protocol change;
- no new dependency/lockfile change;
- all PostgreSQL tests target disposable `pokenexus_test*` only;
- complete diff is limited to TASK-020-authorized database/domain/test/docs boundaries.

## Dependencies

- TASK-014 — Database Adapter & Migration Foundation: DONE.
- TASK-019 — Pokémon Instance / Collection / Team Spec: DONE.
- ADR-005: ACCEPTED.
- SPEC-004: APPROVED.
- SPEC-005: APPROVED.
- TASK-018 auth/audit baseline: DONE; no auth/recovery contract change is owned here.

## Risks / irreversible actions

- The forward migration changes persisted Team membership shape. Fabricating order for existing rows
  would be an irreversible product-data decision; migration must fail closed instead.
- Incorrect OCC ordering can produce lost updates, orphan membership or stale deletes; implementation
  requires deterministic real-PG race tests and Independent Auditor review.
- Child-row delete/reinsert strategies can transiently violate aggregate integrity if executed outside
  one transaction; all roster/loadout replacement must remain atomic.
- Database constraints alone cannot establish static Species→Ability or learned-Move eligibility because
  canonical static definitions are not PostgreSQL FK rows. Persistence must not pretend otherwise.
- Allowing an unrestricted public loadout mutation before an authoritative eligible-Move source exists
  would violate SPEC-005; TASK-020 does not expose that API.
- A migration applied to any shared environment becomes immutable under ADR-005.
- Repository-history operations remain separately Human Owner gated.

## Expected files / boundaries

Expected production/test surface:

```text
packages/database/migrations/0003_*.sql
packages/database/src/*collection*team*.ts
packages/database/src/index.ts
packages/database/src/*.test.ts
packages/database/integration/postgresql.test.ts
tasks/active/TASK-020-collection-team-domain-persistence.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

A different narrow file split inside `packages/database` is acceptable when it improves cohesion
without changing package ownership or scope.

No API/public protocol, game-core combat behavior, applied migration, dependency, lockfile or runtime
configuration change is authorized.

## Completion

TASK-020 is ACCEPTANCE after the delegated Lead Developer owner completed implementation and owner validation on the
approved SPEC-005 boundary, independent QA returned READY with `P0/P1/P2/P3 = 0/0/0/0`, the required
concurrency/integrity Independent Auditor implementation audit returned PASS with `0/0/0/0`, and a fresh independent
PM / Architecture Coordinator accepted the exact frozen REVIEW snapshot. Repository-history completion remains
separately Human Owner gated.

Owner implementation evidence:

- `0003_collection_team_spec005.sql` is forward-only, takes `ACCESS EXCLUSIVE` on legacy Team membership before the
  emptiness proof, fails closed on any unordered membership row, and adds selected Ability shape, ordered Move Loadout
  and Team slot/uniqueness constraints without editing `0001`/`0002`.
- `collection-team-postgresql.test.ts` proves canonical `0001+0002 -> 0003` empty upgrade/idempotence, non-empty
  fail-closed rollback/no ledger entry, and a deterministic old-application insert blocked by the migration lock until
  the new mandatory slot schema is committed.
- Repository unit tests prove structural input rejection, fail-closed malformed/sparse persisted opaque/order state,
  staged zero-loadout representation, typed `not_found`, and one-statement Pokémon/Team aggregate reads. Those single
  SQL aggregate reads structurally prevent mixed parent/version + child snapshots under `READ COMMITTED`.
- Real PostgreSQL repository tests prove lossless non-ASCII/NUL/unpaired-surrogate opaque IDs, nullable Ability,
  `1..4` ordered loadouts, ownership-derived Collection queries, UUIDv7 empty Team creation, dense `0..6` roster,
  cross-Team reuse, cross-owner rejection, stale timestamp/version invariance, atomic delete without Pokémon deletion,
  and no read-time static-data cleanup/reroll behavior.
- Deterministic real-PG races prove two same-version roster replacements accept exactly one mutation, replace-vs-delete
  accepts at most one mutation with no orphan members, and competing same-version Pokémon Ability/loadout mutations
  accept exactly one command with the loser stale and no partial configuration.

Owner validation evidence on disposable PostgreSQL 17 database `pokenexus_test_task020`:

- database lint PASS; typecheck PASS; unit `28/28` PASS; build PASS; Worker compatibility dry-run PASS;
- database real PostgreSQL integration `42/42` PASS;
- workspace lint PASS; recursive typecheck PASS; recursive tests PASS; recursive build PASS;
- final roadmap check and `git diff --check` PASS;
- no API route/public protocol, `game-core`, dependency/lockfile, runtime binding or applied migration `0001`/`0002`
  change is part of the TASK-020 diff.

Frozen owner-review anchors:

- base `main`: `a25680884b4068afe185dd8c6e3c926a69f22b33`;
- `0003_collection_team_spec005.sql`: `59c46ce4356975eff78b9755b5a44298fe17ab2807d81702050a9bb10adeb4c7`;
- `collection-team-repository.ts`: `6efb70e982151ce505c0397cc9d72a13b7cb5bc24f651b0efa8778456b759520`;
- `collection-team-repository.test.ts`: `302b3f86cadfcdbed888bac3959c4da3dc9dd55327eca6dd8e2e4ac21f1a2105`;
- `collection-team-postgresql.test.ts`: `84ef57c757ea0a50251d54e5b18ebe65a9d0ae7a03fdc27b8d608ff0ce4415b9`;
- retained migration integration file after TASK-020 adjustments: `fc81dc763d413597396b17a08f8121c8e28c21f4f9b90bcc17859529bef662d7`;
- database package export surface: `008bed860fc78bfc4e9484c274c3ae9ca85211d6e548623ecf4094d5b69b79b7`;
- roadmap source: `4223182e09217b5d83866ec87bf58ae8e9e5018fefb7a36dec9dc8fde99842b7`;
- generated roadmap HTML: `951b18aead068f8fea0fb3a77f669ddfbe427b7db3d4c5843c8a21dc0b79c74d`.

Independent REVIEW gates on the exact frozen production snapshot:

- canonical governance manifest: `62F4296E7608DED537F22515397D72654914CF8F5578AC35D56C1AE5C712982E`;
- QA: READY, `P0/P1/P2/P3 = 0/0/0/0`; fresh database/workspace checks PASS and disposable PostgreSQL 17
  integration `42/42` PASS;
- Independent Auditor: PASS, `P0/P1/P2/P3 = 0/0/0/0`; focused TASK-020 PostgreSQL `7/7` and full database
  PostgreSQL `42/42` PASS; migration locking, ownership/FKs, OCC serialization, replace/delete and Pokémon
  configuration races, stale invariance and snapshot coherence explicitly cleared;
- PM / Architecture Coordinator: ACCEPT; exact REVIEW identity reverified, functional/architectural scope accepted as
  proportional to SPEC-005/SPEC-004/ADR-005, with no API/product/dependency/game-core/runtime scope drift;
- all three review roles were read-only and performed no Git mutation.

The ACCEPTANCE transition changes task/roadmap metadata only. The reviewed production migration/repository/test files
remain byte-identical to the frozen REVIEW anchors above. No commit, push, merge, rebase, reset or force operation is
authorized until the Human Owner explicitly authorizes repository-history completion.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
