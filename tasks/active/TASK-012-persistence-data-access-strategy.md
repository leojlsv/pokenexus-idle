# TASK-012 — ADR-005 Persistence & Data Access Strategy

## Metadata

- State: ACCEPTANCE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor
- Auditor execution surface: fresh independent ChatGPT worker
- Specs:
  - `docs/specs/SPEC-001-core-domain-model.md`
  - `docs/specs/SPEC-002-static-game-data-and-versioning.md`
- ADRs:
  - `docs/decisions/ADR-001-runtime-and-language.md`
  - `docs/decisions/ADR-002-solo-hunts.md`
  - `docs/decisions/ADR-003-hub-and-duo-realtime.md`
  - `docs/decisions/ADR-004-universal-combat-engine-architecture.md`
  - `docs/decisions/ADR-005-persistence-data-access-strategy.md`
- Branch: `spec/TASK-012-persistence-data-access-strategy`
- Worktree: `.worktrees/TASK-012-persistence-data-access-strategy`

## Objective

Define and obtain Human Owner acceptance for the durable persistence and data-access architecture
used by PokeNexus before PostgreSQL schemas or adapters are implemented.

The decision must establish a server-authoritative PostgreSQL boundary that works with Cloudflare
Workers and Durable Objects without leaking database/infrastructure concerns into deterministic
`game-core`, while leaving concrete player/content schemas to TASK-013 and adapter implementation to
TASK-014.

## Context

The repository already establishes PostgreSQL as the durable player/account/game-state target,
Cloudflare Workers as the HTTP/API runtime, Durable Objects as the limited realtime coordination
surface, and `packages/database` as the persistence package. The database package is still a
placeholder and no ORM, driver, schema or migration tool has been selected.

SPEC-001 requires opaque stable domain identifiers and separates persistent instances from static
definitions and battle/runtime state. SPEC-002 requires immutable historical game-data/rules
identities to remain resolvable. ADR-004 requires the Combat Engine to remain pure and explicitly
forbids database I/O during authoritative combat resolution.

Current Cloudflare Hyperdrive documentation supports PostgreSQL access from Workers, performs
transaction-mode connection pooling, and recommends a normal PostgreSQL driver such as
`node-postgres`. Hyperdrive query caching is enabled by default and does not invalidate cached
reads after writes, so authoritative mutable state requires an explicit freshness policy rather
than inheriting defaults.

## Scope

### 1. Durable system of record

- PostgreSQL is the canonical durable store for account/player-owned state and other authoritative
  mutable game state introduced by later accepted schemas;
- use a managed PostgreSQL service with one logical writable primary for v1; no active-active /
  multi-primary database topology is introduced by this ADR;
- the exact managed vendor is an environment/deployment choice, not a domain contract, provided it
  supports the accepted PostgreSQL 17 SQL-feature compatibility baseline, TLS, direct administrative access, backups/recovery
  capabilities and Cloudflare Hyperdrive connectivity;
- Durable Object SQLite may remain coordination/storage for accepted realtime-room concerns, but it
  must not become an alternate system of record for durable player progression, ownership,
  inventory or rewards;
- static game-data bundles remain governed by SPEC-002 and are not silently migrated into mutable
  relational rows merely because PostgreSQL exists.

### 2. Cloudflare / Hyperdrive access

- runtime PostgreSQL access from `apps/api` and, when a later accepted realtime contract requires
  it, `apps/realtime`, goes through environment-specific Cloudflare Hyperdrive bindings;
- authoritative mutable-state paths use a cache-disabled Hyperdrive configuration so auth/session,
  ownership, progression and read-after-write correctness do not depend on Hyperdrive's default
  query cache;
- a separately named cached binding may be introduced later only for reads whose accepted contract
  explicitly tolerates staleness; cached and fresh bindings must never be interchangeable by
  convention;
- rely on Hyperdrive for origin connection pooling; Worker code must not assume a long-lived
  request-crossing database connection or session state;
- database driver/client objects are invocation-local and are not held globally/reused across Worker
  requests; TASK-014 must not create a second global `pg.Pool` in front of Hyperdrive;
- the preferred TASK-014 baseline driver is `node-postgres` (`pg`) because it is supported and
  recommended by current Hyperdrive documentation; an ORM/query builder is not an architectural
  requirement and requires its own task-level dependency justification if later selected;
- TASK-014 owns the required Workers Node.js-compatibility configuration for `pg`; the current
  compatibility date predates Cloudflare's automatic Node-compatibility cutoff, so implementation
  must explicitly enable `nodejs_compat` or deliberately update/validate the compatibility date;
- no SQL-level `PREPARE`, advisory-lock, `LISTEN`/`NOTIFY` or other unsupported/session-dependent
  Hyperdrive behavior may become an application invariant.

### 3. Data-access and package boundary

- `packages/database` owns SQL migrations, persistence row/record mapping, repository/adaptor code
  and transaction helpers;
- application/orchestration layers (`apps/api`, and later accepted realtime orchestration) combine
  persistence with domain/game-core operations;
- `packages/game-core` must not import `packages/database`, a PostgreSQL driver, migration tooling,
  Cloudflare bindings or persistence row types;
- `packages/database` must not call the Combat Engine as part of repository operations; database
  rows and deterministic domain inputs/results are mapped explicitly by the orchestrating
  application layer;
- persistence rows are not automatically public API contracts or `game-core` domain structures;
  representation changes may occur behind repository mapping while preserving accepted domain/API
  semantics;
- clients never connect directly to PostgreSQL/Hyperdrive and never possess database credentials.

### 4. Identity representation

- static definition IDs (`SpeciesId`, `MoveId`, `ItemId`, etc.) retain the opaque string identity
  rules from SPEC-001/002 and are not rewritten into unrelated database-generated identifiers;
- new durable instance/entity IDs generated by PokeNexus use RFC 9562 UUIDv7 and are stored in
  PostgreSQL native `uuid` columns where the identifier is relationally persisted;
- UUID generation occurs before/in the authoritative command boundary so retries can reuse the same
  server-generated identity when required; exact implementation/library choice belongs to TASK-014 under dependency
  policy;
- PostgreSQL 17 is the SQL-feature baseline, so runtime correctness must not depend on PostgreSQL
  18's native UUIDv7 generator;
- UUIDv7 remains opaque/non-secret: its embedded timestamp must never become authoritative game,
  auth, audit, ordering or creation-time semantics; explicit fields own those meanings;
- database sequence/row position, display names, external-provider IDs and timestamps are not
  canonical PokeNexus domain identity;
- deterministic battle-local identities remain governed by combat/domain contracts and are not
  required to be database-generated UUIDs merely because some battle evidence is persisted.

### 5. Transaction and concurrency boundary

- the atomic unit is an accepted authoritative command/mutation, not an entire HTTP request by
  default;
- changes that must preserve one invariant across multiple rows/tables execute in one PostgreSQL
  transaction;
- keep transactions short: do not perform remote network calls, long-running simulation, asset
  fetches or unrelated computation while holding a database transaction open;
- default isolation is PostgreSQL `READ COMMITTED`; later schemas/services must add explicit row
  locking, unique/exclusion constraints, optimistic version checks or `SERIALIZABLE` transactions
  where a concrete invariant requires stronger concurrency control;
- any `SERIALIZABLE` path must define bounded retry behavior for serialization failures rather than
  treating retries as impossible;
- database constraints remain the final integrity backstop for relational uniqueness/reference
  invariants even when application validation also exists;
- idempotency/reward-ledger semantics are owned by later tasks, but this ADR requires persistence
  operations to be structured so one authoritative command can be retried without relying on a
  global cross-request transaction/session.
- aggregates that feed long Hunt/offline/deterministic computation require an explicit persisted
  concurrency token/version (or equivalent conditional-write guard); a stale conditional commit
  returns conflict and forces orchestrator reload/recompute rather than applying or auto-retrying
  stale computed output.

### 6. Migration policy

- canonical migrations are ordered SQL artifacts owned by `packages/database`;
- every applied migration has a stable immutable migration ID and checksum recorded in a migration
  ledger; an applied migration is never edited in place;
- transactional migration work and its ledger record commit atomically in the same transaction by
  default; explicitly non-transactional migrations must define preconditions, partial-failure
  detection, repair/resume behavior and verification evidence;
- migrations run from a controlled deployment/administrative surface through a direct PostgreSQL
  administrative connection, not through the request-serving Hyperdrive path;
- production/application credentials do not receive schema-DDL privileges; migration credentials
  are separate and used only by the controlled migration runner;
- one migration runner owns a target environment at a time; tools that rely on PostgreSQL advisory
  locks may do so only on the direct administrative connection, never through Hyperdrive;
- normal evolution is forward-only. Recovery from a bad migration uses an explicit corrective
  migration, application rollback compatible with the current schema, or the accepted restore
  procedure; autogenerated `down` migrations are not assumed safe rollback;
- prefer expand/contract changes when application and schema versions can overlap during deploy;
  destructive/data-rewriting migrations require explicit review/risk handling in their owning task;
- TASK-083 later owns backup/restore/disaster-recovery rehearsal; TASK-012 only requires the
  architecture to preserve that path.

### 7. Time, snapshots and historical evidence

- PostgreSQL `timestamptz` is used for infrastructure/audit timestamps where later schemas need
  them; timestamps are stored/compared as instants and presented in user locale outside the DB;
- infrastructure timestamps do not replace deterministic logical combat time or replay ordering;
- JSON/JSONB may store bounded versioned snapshots/evidence when a later accepted contract requires
  preserving an immutable payload, but JSONB must not replace relational constraints for mutable
  core entities merely for convenience;
- authoritative historical rows that depend on static/rule interpretation retain the applicable
  immutable identities required by SPEC-002/ADR-004 rather than consulting only the currently active
  data/rules version.

## Out of scope

- concrete PostgreSQL tables, columns, indexes or foreign-key graph (TASK-013);
- exact account/player/Pokémon/team/inventory/progression schemas (TASK-013/019/022);
- installing `pg`, an ORM/query builder or migration dependency (TASK-014);
- implementing repository/adapters, migrations or test database infrastructure (TASK-014);
- authentication/session/authorization model, RLS policy or credential lifecycle (TASK-015/016);
- reward-ledger/idempotency business rules (TASK-023);
- provider account creation, Hyperdrive resource creation or production secrets;
- final environment/release/deployment/rollback orchestration (TASK-079/080);
- backup retention/RPO/RTO and restore rehearsal (TASK-083);
- any modification to production packages, manifests, lockfile or Cloudflare configuration in this
  architecture task.

## Acceptance criteria

- [x] ADR-005 selects PostgreSQL as the single durable system of record for authoritative mutable
      player/game state while preserving the accepted limited Durable Object scope.
- [x] Managed-provider assumptions are explicit without making a vendor-specific API part of the
      domain/data-access contract.
- [x] PostgreSQL 17 is the explicit SQL-feature compatibility baseline for TASK-013/014; a newer
      provider major does not silently authorize newer-only SQL/functions.
- [x] Runtime Cloudflare access uses Hyperdrive transaction pooling and explicitly disables query
      caching for authoritative mutable-state reads.
- [x] Worker-side database clients are invocation-local, with no global `pg.Pool`/`pg.Client`
      reuse; required `nodejs_compat`/compatibility-date work is explicitly owned by TASK-014.
- [x] Data-access layering keeps `game-core` infrastructure-free and makes `packages/database` the
      persistence adapter/migration boundary without turning row types into domain/API contracts.
- [x] Persistent PokeNexus-generated entity IDs use UUIDv7/native PostgreSQL `uuid` while existing
      static definition IDs remain opaque SPEC-001/002 identities.
- [x] Transaction boundaries, default isolation and escalation to row locks/version checks/
      serializable transactions are explicit and do not hold DB transactions across remote/long
      computation.
- [x] Long off-transaction deterministic computation has an explicit stale-write conflict contract:
      persisted concurrency guard, conditional commit, no application of stale output, and
      orchestrator reload/recompute.
- [x] Migration source-of-truth, checksum/immutability, direct administrative connection,
      least-privilege DDL separation and forward/expand-contract policy are explicit.
- [x] Migration ledger/work atomicity is explicit for transactional migrations, and any
      non-transactional migration requires declared partial-failure repair/resume evidence.
- [x] ADR-005 preserves deterministic logical combat time and SPEC-002 historical version identity.
- [x] No concrete schema, ORM dependency, auth model, reward rules or deployment implementation is
      silently decided.
- [x] No production source/package/manifest/lockfile/Cloudflare configuration change occurs.
- [x] Independent QA reports no unresolved P0/P1 findings on the DRAFT ADR/task/roadmap snapshot.
- [x] Independent Auditor reports no unresolved P0/P1 findings on the persistence concurrency /
      migration/security-sensitive architecture direction.
- [x] Human Owner explicitly accepts ADR-005 before TASK-013/014 may rely on it as accepted
      architecture.

## Validation / review

During DRAFT/approval preparation run:

```text
corepack pnpm roadmap:generate
corepack pnpm roadmap:check
git diff --check
```

Also verify:

- complete diff is limited to TASK-012 task/ADR/roadmap planning artifacts;
- `packages/**`, `apps/**`, manifests and lockfile remain unchanged;
- accepted SPEC-001/002 and ADR-002/003/004 boundaries are preserved;
- current Cloudflare Hyperdrive constraints used by the ADR are checked against current official
  documentation;
- PostgreSQL 17 baseline and Worker driver lifecycle/runtime-compatibility consequences are explicit;
- concrete schema/auth/reward decisions remain deferred to their owning tasks.

Current approval-preparation result:

- Lead Developer feasibility review findings were incorporated into the DRAFT: PostgreSQL 17
  feature baseline, invocation-local `pg` lifecycle / Worker Node compatibility ownership, UUIDv7
  opacity, migration-ledger atomicity and long-computation optimistic concurrency are explicit;
- independent QA re-review: P0/P1/P2/P3 = 0/0/0/0 — READY for Human Owner architecture acceptance;
- Independent Auditor: P0/P1/P2/P3 = 0/0/0/0 — PASS for Human Owner architecture acceptance;
- `corepack pnpm roadmap:check`: PASS — 87 tasks;
- `git diff --check`: PASS;
- production-scope diff (`packages/**`, `apps/**`, manifests and lockfile): empty;
- Human Owner explicitly accepted ADR-005 on 2026-09-15;
- remaining gate: separately authorized repository completion/history.

## Dependencies

- TASK-005 — Core Domain Type Skeleton: DONE.
- TASK-006 — Static Game Data Schema & Rules Versioning: DONE.
- TASK-011 — Combat Performance Baseline: DONE.
- SPEC-001 — Core Domain Vocabulary & Model: APPROVED.
- SPEC-002 — Static Game Data, Versioning & PokémonDB Ingestion: APPROVED.
- ADR-002 — Solo Hunts are event-driven: ACCEPTED.
- ADR-003 — Realtime scope: ACCEPTED.
- ADR-004 — Universal Deterministic Combat Engine Architecture: ACCEPTED.

## Risks / irreversible actions

- Hyperdrive caching defaults are unsafe for read-after-write authoritative state unless disabled or
  explicitly separated by contract.
- Transaction pooling makes session-local assumptions and unsupported PostgreSQL features unsafe as
  application invariants.
- A global Node-style database pool/client can violate Workers I/O-context rules and duplicate
  Hyperdrive's pooling role; TASK-014 must keep the client invocation-local.
- Overly long transactions would consume pooled origin connections and increase contention.
- Random/unstructured identifiers can create unnecessary relational/index costs; UUIDv7 is selected
  for new durable instance identities while preserving externally defined/static identity contracts.
- A broad ORM abstraction could blur transaction/SQL behavior and migration ownership; this ADR
  intentionally does not require one.
- Destructive migration execution is not authorized by TASK-012.
- Commit/push/merge/rebase/force remain separately governed and have not been authorized by the Human
  Owner's ADR-005 architecture acceptance.

## Expected files / boundaries

```text
docs/decisions/ADR-005-persistence-data-access-strategy.md
tasks/active/TASK-012-persistence-data-access-strategy.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

No production source, package manifest, dependency, lockfile or runtime configuration change is
authorized by this task.

## Completion

Independent QA and the required Independent Auditor review cleared the proposal, and the Human Owner
explicitly accepted ADR-005 on 2026-09-15. All architecture/semantic gates are complete. TASK-012
remains in `ACCEPTANCE` only because repository completion/history requires separate authorization.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
