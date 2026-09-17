# TASK-017 — Player Profile API & Persistence

## Metadata

- State: ACCEPTANCE
- Class: B
- Owner: Lead Developer
- Owner execution surface: DEFAULT
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: N/A
- Auditor execution surface: N/A
- Specs:
  - `docs/specs/SPEC-004-postgresql-schema-v1.md`
- ADRs:
  - `docs/decisions/ADR-005-persistence-data-access-strategy.md`
  - `docs/decisions/ADR-006-authentication-authorization-session-model.md`
- Branch: `feat/TASK-017-player-profile-api-persistence`
- Worktree: `.worktrees/TASK-017-player-profile-api-persistence`

## Objective

Materialize the first authenticated Player profile boundary on top of the accepted one-Account/one-Player
PostgreSQL schema without inventing social/profile product fields that have not been approved.

The result must let an authenticated active account idempotently create its one durable `PlayerId`, load
that same private profile identity later, and give subsequent gameplay APIs one tested server-authoritative
`AccountId -> PlayerId` resolution path. Client-supplied account/player/owner identifiers never confer
authority.

## Context

TASK-014 and TASK-016 are DONE and integrated. SPEC-004 already materializes `pokenexus.players` with a
UUIDv7 `player_id`, `account_id UNIQUE` and the accepted one-account/one-player relation. ADR-006 requires
normal gameplay APIs to resolve the authenticated account's `PlayerId` from authoritative persistence.

No accepted spec defines a player username, public display name, avatar, biography, locale, privacy
setting or other social/profile attribute. TASK-074 later owns public profile/leaderboard/social polish.
TASK-017 must therefore establish the minimum private profile identity/API contract and must not silently
promote an invented display field into durable/public identity.

### Approved public contract

The Human Owner explicitly approved this exact minimal self-scoped contract on 2026-09-17:

- `GET /player/profile` — authenticated private read; returns `200 { "playerId": "<uuid>" }` for the
  current account's Player identity when it exists, `404 { "error": "not_found" }` when it does not,
  and `401` for a missing/invalid session;
- `PUT /player/profile` — authenticated cookie mutation with exact Origin + session-bound CSRF; idempotently
  creates the current account's Player row when absent or returns the already-existing row when present;
  success is always `200 { "playerId": "<persisted uuid>" }`, including first creation and retries/races,
  while missing/invalid session is `401` and failed mutation Origin/CSRF is `403`;
- neither route advances session inactivity merely because the route was called. The profile read/create path
  may be used by bootstrap/prefetch, and ADR-006 forbids automatic traffic from extending `last_activity_at`;
- `PUT` defines no product/owner request fields; any future mutable profile payload requires a separately
  accepted contract rather than being inferred here;
- the response does not expose `AccountId`, auth/session state, recovery email, `row_version`, internal
  security metadata or another player's data;
- the request accepts no account/player/owner selector and no product/profile fields;
- no public profile lookup by arbitrary `PlayerId` is introduced in this task.

This contract is intentionally private/self-scoped. Any username/display-name/avatar/social/privacy field,
arbitrary-player profile lookup, rename policy or uniqueness/moderation rule is a separate product/API
decision and is not inferred from the TASK-017 title.

## Scope

### 1. Player persistence repository

Add a small `packages/database` Player repository over the existing `pokenexus.players` table:

- load one Player by authoritative `account_id`;
- idempotently create-or-load one Player for an account using an application-generated UUIDv7;
- rely on the existing database `UNIQUE (account_id)` constraint as the final one-account/one-player
  duplicate-prevention invariant;
- make concurrent create requests converge on the same persisted Player row rather than returning a
  stale/generated loser ID or surfacing a uniqueness error as success;
- implement concurrent create-or-load as an `INSERT ... ON CONFLICT (account_id) DO NOTHING RETURNING ...`
  followed, when no row was inserted, by a separate fresh `SELECT ... WHERE account_id = $1`; avoid a
  same-statement CTE fallback whose statement snapshot can miss the concurrently committed winner, and avoid
  a no-op `ON CONFLICT DO UPDATE` write merely to obtain `RETURNING`;
- schema-qualify SQL and use the existing invocation-local `pg` infrastructure; `READ COMMITTED` is
  sufficient for this single-row uniqueness invariant and no lock/`SERIALIZABLE` path is expected;
- return persistence records explicitly; do not turn PostgreSQL row order, UUID timestamp bits or
  `row_version` into gameplay/public semantics.

No schema migration is expected for the proposed minimal contract because SPEC-004 already owns the exact
required table and constraint. A migration becomes in-scope only if the Human Owner approves additional
profile fields before READY.

### 2. Player application boundary

Add an `apps/api` Player application/service boundary that:

- consumes the authenticated `AuthSessionPrincipal.accountId` produced by TASK-016;
- derives/loads the Player from authoritative persistence and never accepts client-provided owner authority;
- generates a candidate UUIDv7 for first creation and returns the persisted winner under retry/race;
- maps persistence absence/conflict into bounded application results rather than database exceptions leaking
  into the HTTP contract;
- keeps profile logic out of `packages/game-core`.

### 3. Authenticated HTTP API

Implement the approved current-player routes without duplicating or weakening TASK-016 security controls:

- reuse the authoritative session-cookie validation path for every route;
- validate both profile routes without advancing `last_activity_at`; this route family may be automatic
  bootstrap/prefetch and therefore cannot be classified as subscriber activity solely by route name;
- require exact Origin + session-bound CSRF for `PUT /player/profile` independently of SameSite;
- use exact credentialed CORS behavior for the approved application origins; no wildcard origin;
- return `401` for missing/invalid session, `403` for failed mutation Origin/CSRF and exact
  `404 { "error": "not_found" }` for an authenticated account whose Player has not been created;
- return the same persisted `playerId` on repeated/concurrent successful `PUT` calls;
- never accept `accountId`, `playerId`, `ownerPlayerId`, role or similar authority from request body/query.

Internal routing/guard extraction is allowed only where needed to reuse the existing auth/session boundary;
do not redesign unrelated TASK-016 routes.

### 4. Integration and concurrency evidence

Use the existing explicit disposable PostgreSQL 17 test path to prove at minimum:

- authenticated Account with no Player can create exactly one Player;
- repeated create-or-load is idempotent and preserves the same `PlayerId`;
- concurrent create requests for one Account converge to one row/one returned persisted identity;
- distinct Accounts receive distinct Players and cannot load each other's Player through the self-scoped API;
- database uniqueness/FK invariants remain authoritative under direct repository races;
- unauthenticated/invalid-session requests fail before Player persistence work;
- GET/PUT use the existing session activity/Origin/CSRF behavior as specified;
- no raw session/auth/recovery secret or recovery email is introduced into Player rows/responses/log evidence.

## Out of scope

- username, display name, trainer name, nickname, avatar, biography, locale, pronouns or other profile fields;
- rename/uniqueness/moderation/reserved-word policy for human-facing names;
- public/arbitrary-player profile lookup, friends, social graph, leaderboard or privacy controls;
- web/profile UI in `apps/web`;
- Pokémon collection, Team, inventory, progression or reward APIs;
- changes to authentication/session/recovery semantics from ADR-006;
- new database/runtime dependencies, ORM/query builder or provider-specific services;
- schema migration unless the task contract is explicitly amended before READY;
- production Hyperdrive resource IDs, secrets or deployment provisioning;
- Git commit/push/merge/rebase/force without separate Human Owner authorization.

## Acceptance criteria

- [x] Human Owner explicitly approved the exact minimal self-scoped TASK-017 HTTP/profile contract on
      2026-09-17. The Class-A public-protocol decision gate is satisfied; implementation remains Class B.
- [x] Existing SPEC-004 `players` schema is sufficient; no speculative profile migration/field is added.
- [x] Player persistence resolves by authenticated `AccountId` and enforces one Account -> one Player under
      repeated and concurrent creation.
- [x] Create-or-load returns the persisted winning `PlayerId`; a losing generated candidate is never exposed.
- [x] `GET /player/profile` returns only the authenticated account's Player identity or bounded not-found.
- [x] `PUT /player/profile` is idempotent and protected by the existing session, exact-Origin and CSRF model.
- [x] No endpoint accepts client `AccountId`/`PlayerId`/owner/role as authorization proof.
- [x] No username/display-name/avatar/social/public-profile semantics are introduced.
- [x] No new third-party dependency is added.
- [x] Database/API focused lint, typecheck, unit/integration tests and builds pass.
- [x] Real disposable PostgreSQL 17 tests cover create/load/idempotency/concurrent-create ownership invariants.
- [x] API Worker dry-run proves the resulting database/profile import graph remains Worker-compatible.
- [x] Workspace lint/typecheck/test/build, `roadmap:check` and `git diff --check` pass.
- [x] Complete diff remains inside TASK-017 boundaries with no secret/config leak or unrelated refactor.
- [x] Independent QA reports no unresolved P0/P1 findings.
- [x] PM / Architecture Coordinator functional/architectural acceptance passes after QA.

## Validation / tests

Run and report at minimum:

```text
corepack pnpm --filter @pokenexus/database lint
corepack pnpm --filter @pokenexus/database typecheck
corepack pnpm --filter @pokenexus/database test
corepack pnpm --filter @pokenexus/database build
corepack pnpm --filter @pokenexus/database test:integration   # explicit disposable PG17 URL
corepack pnpm --filter @pokenexus/api lint
corepack pnpm --filter @pokenexus/api typecheck
corepack pnpm --filter @pokenexus/api test
corepack pnpm --filter @pokenexus/api build
corepack pnpm --filter @pokenexus/api test:integration       # explicit disposable PG17 URL
corepack pnpm lint
corepack pnpm -r typecheck
corepack pnpm -r test
corepack pnpm -r build
corepack pnpm roadmap:generate
corepack pnpm roadmap:check
git diff --check
```

Real database tests must require an explicit disposable database named `pokenexus_test` or
`pokenexus_test_*` and fail closed otherwise. No shared/production database is an authorized test target.

### Owner validation evidence — 2026-09-17

- `@pokenexus/database`: lint PASS; typecheck PASS; unit tests 21/21 PASS; build PASS; PostgreSQL 17
  integration 28/28 PASS, including probabilistic concurrent create convergence and deterministic
  conflict-winner visibility after commit; Worker compatibility dry-run PASS.
- `@pokenexus/api`: lint PASS; typecheck PASS; unit tests 51/51 PASS; build/Worker dry-run PASS; PostgreSQL 17
  integration 10/10 PASS, including TASK-017 authentication/CSRF/self-ownership/non-activity behavior.
- workspace: lint PASS; recursive typecheck PASS; recursive test PASS; recursive build PASS.
- roadmap generation/check PASS and `git diff --check` PASS.
- integration database: disposable PostgreSQL 17 database `pokenexus_test_task017`; no shared/production database
  used.

### Independent review evidence — 2026-09-17

- Fresh independent QA revalidated the frozen REVIEW snapshot read-only and reported
  `P0=0 / P1=0 / P2=1 / P3=0`, READY. QA independently reran the database PostgreSQL 17 integration suite
  `28/28`, API PostgreSQL integration `10/10`, package/workspace validation and Worker dry-runs. The sole P2
  was a roadmap portfolio-summary lifecycle count (`DRAFT: 1` while TASK-017 was REVIEW), with no production,
  security, persistence or public-contract impact.
- Independent PM / Architecture Coordinator accepted the same frozen REVIEW snapshot. The roadmap-count P2 was
  classified non-blocking for functional/architectural acceptance and is corrected in this metadata-only
  REVIEW -> ACCEPTANCE transition.

## Dependencies

- TASK-014 — Database Adapter & Migration Foundation: DONE and integrated.
- TASK-016 — Authentication & Session Implementation: DONE and integrated.
- ADR-005: ACCEPTED.
- ADR-006: ACCEPTED.
- SPEC-004: APPROVED.

## Risks / irreversible actions

- The Human Owner explicitly approved the public HTTP shape on 2026-09-17; TASK-017 satisfied the READY
  contract gate and advanced to ACTIVE for implementation.
- Player creation is durable identity creation; concurrency/idempotency defects can create orphaned or
  conflicting gameplay ownership roots even though the database has a uniqueness constraint.
- Reusing auth guards incorrectly could weaken CSRF/Origin/session semantics; TASK-017 must consume, not
  redefine, ADR-006 authority.
- No destructive migration is planned. If an approved contract adds schema fields, the change must be a new
  forward PostgreSQL-17-compatible migration and its bytes become immutable once applied to shared state.
- Repository history operations remain separately Human Owner gated.

## Expected files / boundaries

Primary TASK-017 write boundary after READY:

```text
packages/database/src/**                         # Player repository + export/tests
packages/database/integration/**                 # Player PostgreSQL concurrency/integration evidence
apps/api/src/player/**                           # Player application/HTTP implementation + tests
apps/api/src/auth/http.ts                        # narrow reusable guard/CORS composition only if needed
apps/api/src/index.ts                            # API composition/export only if needed
apps/api/integration/**                          # authenticated Player API + PG evidence
tasks/active/TASK-017-player-profile-api-persistence.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

`apps/web/**`, `apps/realtime/**`, `packages/game-core/**`, auth/recovery semantics, production deployment
resources and unrelated domain packages are not TASK-017 write targets.

## Completion

The Human Owner approved the exact minimal public API/profile contract on 2026-09-17. TASK-017 satisfied
Definition of Ready, advanced through READY and ACTIVE, completed owner implementation/validation, passed
independent QA with no P0/P1 findings, and received independent PM / Architecture Coordinator acceptance. The
candidate is now in ACCEPTANCE. Repository completion/history remains separately Human Owner gated; the task is
not DONE.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
