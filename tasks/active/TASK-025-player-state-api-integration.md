# TASK-025 — Player State API Integration

## Metadata

- State: ACCEPTANCE
- Class: B
- Owner: Lead Developer
- Owner execution surface: ChatGPT project implementation session
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor (authz, concurrency and idempotency implementation audit)
- Auditor execution surface: fresh independent ChatGPT worker
- Consultants: N/A
- Consultant execution surface(s): N/A
- Spec: `docs/specs/SPEC-011-player-state-api-contract.md`
- Related specs: SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-010
- Related ADRs: ADR-005, ADR-006
- Related tasks: TASK-017, TASK-020, TASK-024, TASK-089, TASK-094
- Branch: `main` canonical implementation worktree; no TASK-025 Git/history mutation authorized yet
- Worktree: `.worktrees/main-governance-integration`

## Objective

Implement the APPROVED SPEC-011 v1 self-scoped Player State HTTP surface without inventing new
protocol, gameplay, economy or authority semantics. The API must expose private authenticated
Collection/Pokémon, Team, Inventory and Progression reads; accepted Saved Team commands; and Move
Loadout replacement only through the TASK-089 authoritative service.

## Accepted contract baseline

TASK-094 is DONE and SPEC-011 is APPROVED. The implementation therefore consumes, and must not
reinterpret, these frozen decisions:

- authenticated `AccountId -> PlayerId` resolution is server-owned; request owner/account/player IDs
  never grant authority;
- foreign and absent protected resources collapse to `404 not_found`;
- Player State GETs use `touchActivity=false`; Team/Move commands use `touchActivity=true`;
- unsafe routes require exact allowed Origin + normal session cookie + session-bound CSRF;
- exact/unbounded integers cross JSON as canonical non-negative decimal strings;
- Collection, Team-list and Inventory reads are bounded to default `50`, max `100`;
- Inventory continuation is bound to the root Inventory rowVersion and returns
  `409 pagination_stale` after root mutation;
- v1 exposes at most **6 live saved Teams per Player** as the Human-approved player-visible preset
  capacity;
- Team creation also enforces the separate **64 accepted new creates per rolling 24h** abuse-control;
- Team create uses replay-first per-Player serialization and required UUID `Idempotency-Key`;
- deleted-Team create correlation remains a replay tombstone for exactly 30 days from authoritative
  deletion, then normal operation expires/compacts it;
- Team roster/delete use existing Team OCC and never return a fresh token on `409 stale`;
- Move replacement calls TASK-089 `MoveEligibilityApplicationService.replaceMoveLoadout`; no raw
  TASK-020 setter is exposed;
- exact Move authority failures fail closed; there is no latest-context fallback or hidden stale retry.

## Scope

### 1. Public Player State HTTP routes

Implement exactly the accepted SPEC-011 surface:

- `GET /player/collection`
- `GET /player/pokemon/:pokemonInstanceId`
- `GET /player/pokemon/:pokemonInstanceId/progression`
- `GET /player/progression`
- `GET /player/inventory`
- `GET /player/teams`
- `GET /player/teams/:teamId`
- `POST /player/teams`
- `PUT /player/teams/:teamId/roster`
- `DELETE /player/teams/:teamId?expectedRowVersion=<decimal>`
- `PUT /player/pokemon/:pokemonInstanceId/moves`

Existing `/player/profile` behavior remains compatible and is not widened into social/public state.

### 2. Read/query adapters

Add bounded owner-scoped repository/application reads required by the protocol:

- keyset Collection pagination;
- owned Pokémon aggregate read;
- Pokémon progression read;
- Player progression read;
- snapshot-coherent Inventory page with root-version-bound cursor;
- keyset Team summary pagination;
- owned Team aggregate read.

Opaque cursors are selectors only, contain no owner/account secret and grant no authority.

### 3. Team-create durable idempotency and quotas

Add the smallest forward PostgreSQL migration/repository boundary needed for:

- replay identity `(PlayerId, create-Team, Idempotency-Key)`;
- one per-Player serialization boundary covering replay lookup before issuance/quota checks;
- 64 accepted new Team creates per rolling 24h;
- 6 live saved Teams maximum for new public creates;
- server-owned UUIDv7 Team allocation;
- atomic Team + correlation/result commit;
- same-key response-loss replay convergence;
- deleted-Team `410 idempotency_gone` tombstone through the exact 30-day replay window;
- bounded normal expiry/compaction of expired tombstones;
- historical/admin over-quota Teams remain readable/editable and are never truncated.

### 4. Team mutations

Reuse TASK-020 owner-scoped complete-roster replacement and delete OCC semantics. HTTP mapping must:

- reject malformed/duplicate/>6-member payloads before mutation;
- collapse foreign/not-found to `404`;
- map invalid owned-member references to `422 invalid_member`;
- map stale to only `{ "error": "stale" }` with no fresh token;
- never delete Pokémon when deleting a Team;
- convert create correlation to the accepted deletion tombstone atomically with successful Team
  deletion.

### 5. Move Loadout mutation

Wire the accepted runtime composition for TASK-089 and expose only complete Move replacement.
Map the internal result contract exactly as SPEC-011 requires:

- invalid structure -> `400 invalid_request`;
- unresolved/ineligible client Move -> `422 invalid_move_loadout`;
- unresolved persisted Species or exact authority/runtime failure -> `503 authority_unavailable`;
- stale -> `409 stale` without fresh token;
- not-owned/not-found -> `404 not_found`.

The client never supplies Species, Level, game-data version or rules version.

### 6. Request bounds / CORS / activity

- extend `/player/*` credentialed CORS to `GET, POST, PUT, DELETE, OPTIONS`;
- allow protocol headers `Content-Type`, `X-CSRF-Token`, `Idempotency-Key`;
- enforce max 16 KiB JSON mutation body before domain work;
- reject unknown top-level mutation fields;
- parse canonical UUID and canonical non-negative signed-PG-bigint decimal inputs;
- Player State GETs do not touch session activity;
- Team/Move mutations do touch session activity;
- client headers/fields cannot override activity classification.

## Out of scope

- public/social Player/Team/Inventory visibility;
- Ability-selection mutation;
- Inventory consume/use/grant/set-balance public routes;
- Player/Pokémon XP or Level setter/grant routes;
- Move bootstrap, learned/acquired Move persistence or TM/machine commands;
- Reward public commands;
- Hunt/Battle/Gym/PvP/orchestration behavior;
- TASK-090/091 production Move/Ability execution content;
- realtime/WebSocket protocol;
- UI behavior;
- Git history mutation without separate Human Owner authorization.

## Acceptance criteria

- [x] Every accepted SPEC-011 route is implemented with exact self-scoped authority.
- [x] Foreign and absent protected resource selectors are non-enumerating `404 not_found`.
- [x] GET vs Team/Move mutation activity classification matches SPEC-011 exactly.
- [x] Exact Origin/session-CSRF and credentialed CORS semantics are preserved.
- [x] Exact/unbounded integer fields are decimal strings with no JavaScript-number narrowing.
- [x] Collection and Team-list paging are bounded/keyset and transport-order-only.
- [x] Inventory pages are snapshot-coherent and stale continuations return `409 pagination_stale`.
- [x] Team create is replay-first, same-key idempotent, atomically correlated and response-loss safe.
- [x] 6-live quota and 64-accepted-create/rolling-24h controls are race-safe.
- [x] Deleted-Team create replay returns `410 idempotency_gone` for exactly the accepted 30-day window.
- [x] Expired deleted-Team tombstones are normally compacted/expired.
- [x] Team roster/delete preserve ownership and OCC without hidden stale retry/fresh token leakage.
- [x] Move replacement only passes through TASK-089 and maps failures exactly.
- [x] Mutation bodies/UUIDs/versions/cursors are bounded and malformed requests fail before mutation.
- [x] No unsupported public mutation/gameplay/economy surface is added.
- [x] Disposable PostgreSQL 17 race/replay/integration suite passes.
- [x] Worker compatibility, package/workspace checks and roadmap validation pass.
- [x] Independent QA reports no unresolved material finding on the corrected snapshot: **READY
      0/0/0/0**.
- [x] Independent Auditor reports no unresolved P0/P1/P2/P3 for authz/concurrency/idempotency:
      **PASS 0/0/0/0**. No production code changed in the evidence-only QA delta, so the audit
      remains applicable to the accepted implementation snapshot.
- [x] PM / Architecture Coordinator Class B functional/architectural acceptance passes:
      delegated independent verdict **ACCEPT**, blockers none.

## Validation / tests

- focused database repository tests for cursors, Team create replay/quota/tombstone and Team deletion;
- API HTTP unit tests for every route/status/body bound/authz/activity/CORS/error mapping;
- disposable PostgreSQL 17 integration tests for self-scope, paging, same-key replay, distinct-key quota
  race, response loss, deletion tombstone, stale roster/delete and Move/progression race behavior;
- TASK-089 exact-context runtime integration coverage through the HTTP path;
- Cloudflare Worker dry-run/bundle gate that imports the Player State route/runtime path;
- relevant package tests/typechecks plus workspace `lint`, `typecheck`, `test`, `build` through ACCEPTANCE;
- `corepack pnpm roadmap:check`;
- `git diff --check`.

## Dependencies

- TASK-017 — DONE.
- TASK-020 — DONE.
- TASK-024 — DONE.
- TASK-089 — DONE.
- TASK-094 — DONE; SPEC-011 APPROVED.
- ADR-005 / ADR-006 — ACCEPTED.
- SPEC-004/005/006/007/010/011 — APPROVED.

## Risks / irreversible actions

- Incorrect self-scope or selector handling can expose another Player's private state.
- Incorrect replay ordering can make retries consume quota, duplicate Teams or recreate deleted Teams.
- Incomplete serialization can exceed the Human-approved 6-live-Team capacity under concurrency.
- Cursor designs that embed owner/account authority or lose Inventory root-version binding can leak
  authority or silently mix snapshots.
- Returning fresh OCC tokens on stale responses or hidden auto-retry would violate the accepted client
  reconciliation contract.
- Bypassing TASK-089 would make client Move IDs authoritative.
- The migration is forward-only persistent schema work and requires real PostgreSQL validation before
  acceptance, but no destructive migration is authorized.

## REVIEW snapshot

TASK-025 entered REVIEW on 2026-09-22 after implementing APPROVED SPEC-011 without widening its
public protocol or gameplay/economy authority. Repository/history mutation remains uncommitted.

Implemented boundaries include:

- all accepted `/player/*` reads and Team/Move command routes;
- self-scoped Account -> Player authority with non-enumerating protected selectors;
- authenticated HMAC pagination cursors with bounded keyset Collection/Team paging and
  root-version-bound Inventory continuation;
- migration `0005_player_state_api_spec011.sql` for durable Team-create command correlation;
- replay-first per-Player Team-create serialization, 6-live capacity, 64 accepted new creates/24h,
  exact 30-day deletion tombstones and bounded opportunistic expiry;
- Team roster/delete OCC without fresh-token leakage or hidden retries;
- exact TASK-089 Move eligibility runtime composition with server-selected retained pair/game-data/
  rules authorities and fail-closed `503 authority_unavailable` mapping;
- bounded streaming 16 KiB mutation bodies, strict UUID/decimal/field parsing and accepted Player CORS/
  activity behavior.

### Validation evidence before independent review

- `@pokenexus/database` unit: **28/28 PASS**.
- disposable PostgreSQL 17 database integration: **58/58 PASS**, including same-key and distinct-key
  Team-create races, 6-live/64-per-24h controls, replay/delete ordering, tombstone expiry/compaction,
  historical over-quota paging/editing and Inventory stale continuation.
- `@pokenexus/api` unit: **88/88 PASS** on the final implementation snapshot.
- disposable PostgreSQL 17 API integration: **31/31 PASS** across six files; TASK-025-specific
  Player State HTTP/DB integration is **3/3 PASS**.
- API Worker compatibility dry-run: **PASS**; Player State runtime imports are reachable in the
  Worker-safe bundle.
- API build dry-run: **PASS**.
- workspace `lint`: **PASS**.
- workspace `typecheck`: **PASS**.
- workspace `test`: **PASS**.
- workspace `build`: **PASS**.
- `git diff --check`: **PASS**.

Independent IA returned **PASS 0/0/0/0** on this snapshot. Independent QA returned **READY
0/0/1/0** with one evidence-only P2: the existing HTTP/PostgreSQL Move test injected a fixed
`MoveEligibilityApplicationService` and therefore did not prove the production
`createPlayerApplicationFromEnvironment` + retained release configuration + immutable runtime
game-data reader path through HTTP. No production-code defect was identified.

The P2 evidence gap is now corrected with a fourth real-PostgreSQL Player State HTTP integration case
that uses the default production `createPlayerApplicationFromEnvironment`, valid selected/retained
pair/game-data/rules release configuration and the production HTTP game-data reader over the exact
published v2 bundle. The test proves a valid Move replacement reaches TASK-089 and commits through the
real production runtime composition.

Corrected evidence:

- focused Player State PostgreSQL integration: **4/4 PASS**;
- full API PostgreSQL integration: **32/32 PASS** across six files;
- API typecheck: **PASS**;
- API lint: **PASS**.

No production code changed for the QA P2. The narrow QA delta re-gate returned **READY 0/0/0/0**;
the existing independent IA **PASS 0/0/0/0** remains applicable.

## ACCEPTANCE gate

TASK-025 entered ACCEPTANCE on 2026-09-22 after the corrected evidence-only snapshot completed all
required independent gates:

- independent QA: **READY 0/0/0/0**, no remaining correction;
- independent IA: **PASS 0/0/0/0**, no remaining correction;
- delegated independent PM / Architecture Coordinator Class B acceptance: **ACCEPT**, blockers none;
- disposable PostgreSQL 17 database integration: **58/58 PASS**;
- disposable PostgreSQL 17 full API integration: **32/32 PASS**, including Player State **4/4 PASS**;
- API unit: **88/88 PASS**;
- API lint/typecheck/build and Worker compatibility: **PASS**;
- final corrected workspace `lint`, `typecheck`, `test`, `build`: **PASS**;
- `corepack pnpm roadmap:check`: **PASS** on the ACCEPTANCE roadmap source
  `e810961e265fc60b11e9b2cde12c8ad34de6e063673b1bb689a45e5d880127b0`;
- `git diff --check`: **PASS** on the ACCEPTANCE snapshot.

The accepted snapshot remains within APPROVED SPEC-011 scope. No unresolved functional,
architectural, QA or IA finding remains. TASK-025 repository/history mutation has **not** been
authorized; the task remains in `tasks/active/` at ACCEPTANCE pending separate Human Owner
repository/history completion authorization.
