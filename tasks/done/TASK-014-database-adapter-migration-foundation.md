# TASK-014 — Database Adapter & Migration Foundation

## Metadata

- State: DONE
- Class: B
- Owner: Lead Developer
- Owner execution surface: ChatGPT delegated implementation worker (explicit Lead Developer assignment; Copilot CLI unavailable due account quota at task start)
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: N/A
- Auditor execution surface: N/A
- Specs:
  - `docs/specs/SPEC-004-postgresql-schema-v1.md`
- ADR:
  - `docs/decisions/ADR-005-persistence-data-access-strategy.md`
- Branch: `feat/TASK-014-database-adapter-migration-foundation`
- Worktree: `.worktrees/TASK-014-database-adapter-migration-foundation`

## Objective

Materialize the approved PostgreSQL persistence foundation as executable, ordered SQL migrations and
small persistence infrastructure that later feature tasks can safely build on without redefining the
database strategy or product semantics.

The result must establish a reproducible direct administrative migration path, invocation-local
`pg` access for Worker-compatible consumers, tested transaction/concurrency primitives,
OpaqueStringDbCodec v1, application-side UUIDv7 generation and real PostgreSQL 17 verification of the
SPEC-004 schema.

## Context

TASK-012 accepted ADR-005 and TASK-013 approved SPEC-004. Both are DONE and integrated on `main`.
The accepted architecture requires SQL-first migrations, `node-postgres` for Hyperdrive-compatible
runtime access, direct PostgreSQL connectivity for migrations, immutable migration IDs/checksums,
application-generated UUIDv7 identifiers and short command-scoped transactions.

`packages/database` is currently only a workspace placeholder. This task builds the persistence
foundation but does not implement domain repositories whose product rules belong to later tasks.

Dependency changes are explicitly authorized only where they implement accepted ADR-005 requirements:

- `pg` as the PostgreSQL runtime driver;
- `@types/pg` if required for strict TypeScript typing because the installed `pg` release does not
  provide sufficient declarations;
- `uuid` for a standards-compliant RFC 9562 UUIDv7 generator rather than maintaining bespoke UUID
  bit-layout code.

No ORM, query builder, migration framework or container-test library is authorized by this task.

## Scope

### 1. Canonical PostgreSQL migration

- add an ordered immutable SQL migration under `packages/database` that materializes SPEC-004 on
  PostgreSQL 17 exactly, including schema, tables, PK/FK/UNIQUE/CHECK constraints and accepted indexes;
- keep deferred auth/profile/Team-order/progression/item/Hunt/reward semantics absent;
- keep all application objects schema-qualified under `pokenexus`;
- do not add broad `ON DELETE CASCADE` behavior;
- do not depend on PostgreSQL 18-only UUIDv7 SQL functions.

### 2. Migration runner and ledger

- implement a direct-administrative PostgreSQL migration runner separate from request-serving
  Hyperdrive access;
- discover canonical migration files in deterministic stable-ID order and reject duplicate or malformed
  IDs;
- compute SHA-256 over exact migration bytes and record the checksum in a migration ledger;
- bootstrap only the minimum migration metadata required to run the ordered migrations;
- fail closed if an applied migration's current bytes do not match its recorded checksum;
- apply each normal migration and its ledger record atomically in one PostgreSQL transaction;
- serialize migration runners using a direct-connection-safe PostgreSQL mechanism; no Hyperdrive
  session assumption is allowed;
- expose a command/script that requires an explicit direct database URL and never embeds credentials;
- do not generate destructive `down` migrations. Recovery evidence covers transaction rollback,
  checksum mismatch and safe corrective forward execution.

### 3. Runtime database foundation

- add invocation-local `pg.Client` connection helpers; no process-global `pg.Pool`/`pg.Client`;
- keep connection strings/bindings supplied by the caller and never persist/log secrets;
- add a short transaction helper with `READ COMMITTED` default and explicit cleanup/rollback on failure;
- keep repository/domain orchestration out of this foundation until owning tasks define commands;
- ensure `packages/game-core` has no dependency on database code.

### 4. OpaqueStringDbCodec v1

- implement the exact SPEC-004 UTF-16 code-unit -> big-endian byte sequence codec;
- decode only even-length byte sequences and fail closed on malformed bytes;
- preserve exact round-trip for ASCII, non-ASCII, U+0000, lone high surrogate, lone low surrogate and
  mixed surrogate-edge strings;
- perform no normalization, trimming, case folding or semantic parsing;
- expose storage equality bytes only; do not claim encoded byte ordering is canonical domain order.

### 5. Durable UUIDv7 generation

- expose application-side standards-compliant RFC 9562 UUIDv7 generation using the authorized library;
- treat generated IDs as opaque strings; no gameplay/authorization/creation-time behavior may inspect
  embedded UUID timestamp bits;
- add focused format/version/variant/uniqueness tests without inventing a new domain ID grammar.

### 6. PostgreSQL 17 integration test strategy

- add a dedicated integration-test command that requires a real PostgreSQL URL and does not silently
  downgrade to a mock/in-memory database;
- keep ordinary unit tests independent of a running database;
- use local Docker/PostgreSQL 17 during TASK-014 validation without adding a container orchestration
  library dependency;
- verify clean migration, repeated no-op migration, exact ledger/checksum behavior, failed migration
  rollback/recovery and concurrent/single-runner protection;
- verify SPEC-004 relational constraints against real PostgreSQL, including account/player cardinality,
  Level/IV ranges, owner-consistent Team membership, inventory ownership, checkpoint logical-time bound
  and opaque `bytea` shape checks;
- prove optimistic-concurrency behavior with a successful conditional update/version increment followed
  by a stale zero-row conditional update;
- use disposable test database/schema state only; never target a shared/production database.

### 7. Worker compatibility

- add the explicit `nodejs_compat` Worker compatibility required by ADR-005 to the current API Worker
  configuration and validate the API dry-run build with `nodejs_compat` enabled;
- validate `@pokenexus/database` and its `pg` dependency through the database package build/typecheck,
  unit suite and real PostgreSQL integration suite. TASK-014 must not add an otherwise-unused
  `@pokenexus/database` dependency/import to `apps/api` solely to force that graph into the Wrangler
  bundle before an owning API consumer task exists;
- do not introduce a production Hyperdrive binding or database call in `apps/api` before an owning
  feature task requires it;
- leave `apps/realtime` unchanged until a later accepted realtime persistence consumer exists.

## Out of scope

- authentication credentials, sessions, account state or authorization rules;
- player profile fields/API;
- Pokémon selected Ability, Move Loadout, progression/XP semantics or collection APIs;
- Team slot/order/cardinality/duplicate rules or Team command repositories;
- inventory entry/quantity/per-copy item schemas or APIs;
- reward/idempotency/security-audit ledger semantics;
- canonical Hunt identity/lifecycle, World/Zone/Encounter schema or checkpoint product APIs;
- production Hyperdrive provisioning/binding IDs, database secrets or managed-provider provisioning;
- provider-specific PostgreSQL extensions;
- ORM/query-builder adoption;
- automatic destructive rollback/down migrations;
- production deployment/release migration orchestration, backups or DR;
- changing SPEC-004 schema semantics to make implementation more convenient.

## Acceptance criteria

- [x] Canonical ordered SQL migrations materialize approved SPEC-004 and are PostgreSQL 17-compatible.
- [x] Migration runner uses direct PostgreSQL connectivity, deterministic stable IDs, SHA-256 checksums
      and immutable applied-migration verification.
- [x] Transactional migration work and its ledger record commit atomically; failed transactional work
      leaves neither partial schema mutation nor a false applied ledger row.
- [x] Concurrent migration execution is serialized/fails safely on the direct admin path.
- [x] Re-running unchanged migrations is a no-op and editing an already applied migration fails closed.
- [x] Runtime database access uses invocation-local `pg.Client` helpers with no application-side pool.
- [x] Transaction helper defaults to short `READ COMMITTED` command scope and rolls back/rethrows on
      failure.
- [x] OpaqueStringDbCodec v1 exactly round-trips the complete required edge corpus and rejects odd byte
      lengths.
- [x] Application-side RFC 9562 UUIDv7 generation is standards-compliant and opaque to domain logic.
- [x] API Worker explicitly enables required Node.js compatibility and still builds successfully;
      database/`pg` compatibility is validated in `@pokenexus/database` without adding a premature
      API dependency/import.
- [x] Real PostgreSQL 17 integration tests prove all SPEC-004 PK/FK/UNIQUE/CHECK constraints and accepted
      indexes/schema shapes used by this task.
- [x] Real PostgreSQL evidence proves current-version conditional update succeeds/increments and stale
      row-version conditional update affects zero rows.
- [x] Integration tests cover clean apply, repeat apply, checksum mismatch, transactional failure recovery
      and runner concurrency behavior.
- [x] No deferred product schema/API/repository semantics are introduced.
- [x] No ORM/query-builder/container-test dependency is introduced.
- [x] `packages/game-core` remains database/driver-free.
- [x] Focused database lint/typecheck/test/build and API typecheck/test/build pass.
- [x] Workspace typecheck/test/build pass, and root lint introduces no TASK-014 regression; any
      pre-existing baseline lint failure is reproduced on `main` and recorded explicitly.
- [x] `corepack pnpm roadmap:check` and `git diff --check` pass.
- [x] Complete diff remains inside declared TASK-014 boundaries with no unrelated refactor.
- [x] Independent QA has no unresolved P0/P1 findings.
- [x] PM / Architecture Coordinator functional/architectural acceptance passes after QA.

## Validation / tests

Run and report at least:

```text
corepack pnpm --filter @pokenexus/database lint
corepack pnpm --filter @pokenexus/database typecheck
corepack pnpm --filter @pokenexus/database test
corepack pnpm --filter @pokenexus/database build
<TASK-014 real PostgreSQL 17 integration-test command>
corepack pnpm --filter @pokenexus/api typecheck
corepack pnpm --filter @pokenexus/api test
corepack pnpm --filter @pokenexus/api build
corepack pnpm lint
corepack pnpm -r typecheck
corepack pnpm -r test
corepack pnpm -r build
corepack pnpm roadmap:check
git diff --check
```

Also inspect the complete diff against `origin/main` and verify dependency additions are limited to
the task-authorized PostgreSQL driver/type support and UUIDv7 generator.

The real-database integration command must fail clearly when its explicit test database URL is absent;
ordinary unit tests may remain database-independent.

### Implementation validation evidence

- PostgreSQL test target: disposable local PostgreSQL `17.11`; no shared/production database used.
- `corepack pnpm --filter @pokenexus/database lint` → PASS.
- `corepack pnpm --filter @pokenexus/database typecheck` → PASS.
- `corepack pnpm --filter @pokenexus/database test` → PASS, 17 tests.
- `corepack pnpm --filter @pokenexus/database build` → PASS.
- `corepack pnpm --filter @pokenexus/database test:worker-compat` → PASS; Wrangler dry-run with
  `nodejs_compat` bundled the dedicated test entrypoint importing the real `@pokenexus/database`
  runtime/`pg` graph (260.29 KiB upload, 50.53 KiB gzip) without adding an API production
  dependency/import or Hyperdrive binding.
- `corepack pnpm --filter @pokenexus/database test:integration` with explicit disposable test URL →
  PASS, 10 real-PostgreSQL tests. Schema introspection verifies exact PK/FK/UNIQUE/CHECK definitions,
  accepted index definitions/order and column defaults; behavioral coverage includes both IV bounds and
  negative `row_version` rejection across mutable aggregate roots.
- `corepack pnpm --filter @pokenexus/database test:integration` without
  `POKENEXUS_TEST_DATABASE_URL` → expected FAIL with an explicit required-URL error; no mock fallback.
- `corepack pnpm --filter @pokenexus/database migrate` without
  `POKENEXUS_DIRECT_DATABASE_URL` → expected FAIL with an explicit direct-admin-URL error.
- Positive CLI-wrapper invocation with the disposable URL could not be repeated because the execution
  tool blocked a command containing the credential-bearing direct URL. The same `runMigrations` path
  is exercised successfully against PostgreSQL 17 by the real integration suite.
- `corepack pnpm --filter @pokenexus/api typecheck` → PASS.
- `corepack pnpm --filter @pokenexus/api test` → PASS, 1 test.
- `corepack pnpm --filter @pokenexus/api build` → PASS; Wrangler dry-run completed with
  `nodejs_compat` and no production database binding.
- `corepack pnpm -r typecheck` → PASS.
- `corepack pnpm -r test` → PASS.
- `corepack pnpm -r build` → PASS.
- `corepack pnpm roadmap:check` → PASS.
- `git diff --check` → PASS.
- `corepack pnpm lint` → FAIL on seven pre-existing `no-undef` findings in unchanged
  `scripts/project-roadmap.mjs` (`Buffer`, `console`, `process`). The same failure was independently
  reproduced on clean `main` at `a9b3611`; that file is identical to `origin/main` and outside the
  TASK-014 write boundary, so no out-of-scope lint refactor was introduced.
- Complete diff/status against `origin/main` inspected. Production writes are limited to the declared
  TASK-014 boundary; `apps/api/src/**`, `apps/realtime/**`, `packages/game-core/**` and root manifests
  are unchanged. Dependency additions are limited to exact-pinned `pg 8.23.0`, `@types/pg 8.23.1`,
  `uuid 14.0.2` plus their lockfile transitive resolution.
- Independent QA exact-snapshot re-review after FIX: P0/P1/P2/P3 = 0/0/0/0 — READY for PM acceptance.
- PM / Architecture Coordinator accepted the exact reviewed implementation for Class B functional/
  architectural scope on 2026-09-16.

## Dependencies

- TASK-012 — ADR-005 Persistence & Data Access Strategy: DONE and integrated.
- TASK-013 — PostgreSQL Schema v1: DONE and integrated.
- ADR-005: ACCEPTED.
- SPEC-004: APPROVED.

## Risks / irreversible actions

- Migration tooling can mutate any database URL it receives. TASK-014 validation must use disposable
  local test state and must not execute against shared/production environments.
- Migration checksum semantics become a durable operational contract once a migration reaches a shared
  environment; tests must prove mismatch detection before repository integration.
- Transaction/session assumptions valid on a direct migration connection are not automatically valid
  through Hyperdrive transaction pooling; runtime helpers must preserve the ADR boundary.
- Database-driver Node compatibility is validated in the database package foundation, while API
  `nodejs_compat` is validated independently by Wrangler dry-run until an owning API feature introduces
  the actual `@pokenexus/database` dependency/import.
- Repository completion/history operations remain separately governed by Git policy and require Human
  Owner authorization after acceptance.

## Expected files / boundaries

Primary TASK-014 write boundary:

```text
packages/database/**
apps/api/wrangler.toml                         # nodejs_compat only
pnpm-lock.yaml                                 # authorized dependency resolution only
tasks/done/TASK-014-database-adapter-migration-foundation.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

Root/package manifests outside `packages/database/package.json` are not dependency write targets.
`apps/api/src/**`, `apps/realtime/**`, `packages/game-core/**` and other domain packages are not
TASK-014 production write targets.

## Completion

Implementation validation, independent QA and the Class B PM / Architecture Coordinator functional/
architectural acceptance gate are complete. The Human Owner explicitly authorized repository
completion/history on 2026-09-16. TASK-014 is `DONE`; its authorized completion sequence includes the
feature commit/push, fast-forward integration to `main` and final integrated validation.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
