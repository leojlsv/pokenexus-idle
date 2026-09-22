# SPEC-011 — Player State API Contract

- Status: APPROVED
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Related ADRs: ADR-005, ADR-006
- Related tasks: TASK-017, TASK-020, TASK-024, TASK-089, TASK-094, TASK-025

## 1. Problem

The persistence and application layers now own authenticated Player identity, Collection/Team state,
Inventory/Progression state and authoritative Move eligibility, but the approved specs deliberately
leave public HTTP payloads, lossless numeric encoding and player-state command semantics to
TASK-025.

Those details cannot be invented inside a normal Class B endpoint implementation. Public protocol
semantics are a Class A decision, and this surface also crosses authentication/authorization,
optimistic concurrency, response-loss/idempotency and saved-Team abuse-control boundaries.

SPEC-011 freezes the smallest self-scoped v1 player-state HTTP contract needed by TASK-025 without
adding new gameplay, reward, item-use, Ability-selection, social or economy authority.

## 2. Goals

- Expose private authenticated reads for Collection/Pokémon, Teams, Inventory and Progression.
- Expose saved-Team create/roster/delete commands using existing ownership and Team OCC semantics.
- Expose complete Move Loadout replacement only through TASK-089 authority.
- Preserve every authoritative integer exactly across JSON.
- Make ownership derive only from the authenticated Account -> Player relation.
- Reuse ADR-006 Origin/CSRF/session controls without creating a second auth model.
- Bound Collection/Inventory reads and saved-Team storage without turning operational limits into
  gameplay rules.
- Define response-loss behavior for commands so retries cannot create duplicate durable effects.

## 3. Non-goals

- public/social Player, Collection, Team or Inventory visibility;
- username/profile/social fields;
- Ability-selection mutation before an accepted authoritative Ability-eligibility source exists;
- Inventory consume/use/grant/set-balance endpoints;
- client-selected XP grants, Player Level setters or Pokémon progression mutation;
- Move bootstrap as a public command;
- learned/acquired Move persistence or TM/machine behavior;
- reward-source commands;
- Hunt/Battle/Gym/PvP/Duo/World-Boss orchestration;
- production Move/Ability execution content from TASK-090/091;
- WebSocket/realtime protocol design;
- UI behavior.

## 4. Common authority and transport rules

### 4.1 Self-scoped authority

Every route below requires a normal active ADR-006 session. The server resolves
`AuthSessionPrincipal.accountId -> PlayerId` through authoritative persistence. No request accepts
`accountId`, `playerId` or `ownerPlayerId` as authority.

Resource IDs supplied in path/body are selectors only. A syntactically valid resource owned by
another Player is indistinguishable from an absent resource and returns `404 not_found`.

### 4.2 Session activity

Player-state GETs are safe for polling/prefetch and therefore authenticate with
`touchActivity=false`.

The Team and Move mutations below are explicitly subscriber-initiated commands and authenticate with
`touchActivity=true`. A caller header/flag cannot change that classification.

### 4.3 Origin, CSRF and CORS

Every mutation requires:

- an allowed exact `Origin`;
- the normal session cookie;
- a valid session-bound `X-CSRF-Token`.

Credentialed CORS remains exact-origin only, never wildcard. The `/player/*` family permits
`GET, POST, PUT, DELETE` plus `OPTIONS`. Preflight for this family allows only the headers needed
by the accepted protocol: `Content-Type`, `X-CSRF-Token` and `Idempotency-Key`.

### 4.4 JSON integer encoding

Any value whose accepted domain is `bigint`/unbounded or PostgreSQL `bigint`/`numeric` is encoded
as a canonical base-10 string:

- zero is `"0"`;
- positive values have no sign and no leading zero;
- negative values are invalid for every v1 field in this contract.

This applies to `rowVersion`, Player Level, Player total XP, Pokémon total XP and Item quantity.
Pokémon Level and IVs remain JSON numbers because their accepted domains are safely bounded.

The API never narrows an accepted integer through JavaScript `number`.

### 4.5 Bounded errors

Common error envelope:

```json
{ "error": "machine_readable_code" }
```

Additional fields are allowed only where this spec explicitly defines them.

- `400 invalid_request` — malformed JSON/path/query/decimal/UUID/cursor or structurally invalid
  request.
- `401 unauthorized` — missing/invalid normal session.
- `403 forbidden` — mutation Origin/CSRF failure.
- `404 not_found` — self-scoped Player/resource absent or not owned.
- `409 stale` — expected OCC version lost. The response is only `{ "error": "stale" }`; it does
  not hand out a fresh write token. The client must perform the relevant GET, reconcile current state
  and intentionally issue a new command. Neither server nor client may auto-retry a stale mutation by
  substituting a freshly observed version.
- `409 pagination_stale` — an Inventory cursor is no longer valid because the Inventory root
  version changed; restart pagination from the first page.
- `409 team_limit_reached` — saved-Team live quota reached.
- `410 idempotency_gone` — an exact replay of a previously accepted Team-create key refers to a
  Team that has since been deleted; replay never recreates it.
- `429 team_create_rate_limited` — the authoritative per-Player new-Team-create issuance limit is
  exhausted. The response includes a bounded `Retry-After` value; exact replays of already accepted
  keys are exempt.
- `422 invalid_member` — Team roster contains a Pokémon not owned by the current Player; response
  may echo only that client-supplied `pokemonInstanceId`.
- `422 invalid_move_loadout` — TASK-089 rejects a client-selected Move because it is unresolved or
  currently ineligible; response may include only `reason: "unresolved_move" | "ineligible_move"`
  and the client-supplied `moveId`.
- `503 authority_unavailable` — the server cannot resolve the exact accepted Move context required
  for a new Move mutation, including inability to resolve the persisted Pokémon Species in that
  exact context. It does not fall back to another context.

Unexpected infrastructure faults remain server errors and must not expose SQL/auth/session secrets.

## 5. Collection and Pokémon reads

### 5.1 Collection page

`GET /player/collection?limit=<n>&cursor=<opaque>`

- `limit` default: `50`; accepted range: `1..100`.
- `cursor` is absent for the first page and otherwise is an opaque server-issued pagination token.
- pagination order is an operational transport order only and is never Team, combat or gameplay
  priority.
- each page is one committed read; the API does not promise a cross-page snapshot while Collection
  state changes concurrently.

Success `200`:

```json
{
  "items": [
    {
      "pokemonInstanceId": "uuid",
      "speciesId": "opaque",
      "level": 1,
      "selectedAbilityId": null,
      "rowVersion": "0"
    }
  ],
  "nextCursor": null
}
```

No owner/account identifiers or timestamps are returned.

### 5.2 Pokémon aggregate

`GET /player/pokemon/:pokemonInstanceId`

Success `200`:

```json
{
  "pokemonInstanceId": "uuid",
  "speciesId": "opaque",
  "level": 1,
  "ivs": { "hp": 0, "atk": 0, "def": 0, "spa": 0, "spd": 0, "spe": 0 },
  "selectedAbilityId": null,
  "moveLoadout": { "state": "uninitialized", "moveIds": [] },
  "rowVersion": "0"
}
```

Selected Ability is read-only in v1.

### 5.3 Pokémon progression

`GET /player/pokemon/:pokemonInstanceId/progression`

Success `200`:

```json
{
  "pokemonInstanceId": "uuid",
  "level": 1,
  "totalExperience": "0",
  "rowVersion": "0"
}
```

The returned `rowVersion` is the same shared Pokémon OCC token used by configuration and
progression.

## 6. Player progression read

`GET /player/progression`

Success `200`:

```json
{
  "level": "1",
  "totalExperience": "0",
  "rowVersion": "0"
}
```

There is no public v1 Player/Pokémon XP grant/setter route in TASK-025.

## 7. Inventory read

`GET /player/inventory?limit=<n>&cursor=<opaque>`

- `limit` default: `50`; accepted range: `1..100`;
- cursor/order are operational only;
- the Inventory root `rowVersion` and returned entry page must describe one committed database
  snapshot;
- every non-null Inventory cursor is bound to the root `rowVersion` of the page that issued it. If
  the Inventory changes before the next page request, that request returns
  `409 pagination_stale`; the client restarts pagination rather than combining different versions.

Success `200`:

```json
{
  "rowVersion": "0",
  "entries": [
    { "itemId": "opaque", "quantity": "1" }
  ],
  "nextCursor": null
}
```

No Inventory mutation is public in v1.

## 8. Saved Teams

### 8.1 V1 service quota

The v1 player-facing service permits at most **6 live saved Teams per Player**.

Six is an intentional **player-visible v1 saved-preset capacity** selected by the Human Owner. It may
materially constrain how many matchup/mode presets a Player can retain at once and therefore must not
be described as a gameplay-invisible abuse/storage ceiling. The same bound also limits normal service
storage/creation surface, but it is not a combat rule, battle/Team-roster capacity, monetization or
economy rule, or domain invariant. Persistence may continue to represent more rows for
historical/admin data, but a new player-facing create command fails with `409 team_limit_reached`
when 6 live Teams already exist.

The quota check and Team creation must serialize correctly for one Player so concurrent creates
cannot exceed 6.

V1 also permits at most **64 accepted new Team-create commands per Player in any rolling 24-hour
window**. This is an authoritative application/database abuse-control bound on creation issuance, not
an edge-only rate limit. Exact replays of an already accepted Idempotency-Key are exempt and do not
consume another issuance. A rejected quota/rate attempt does not create a correlation record that can
later replay as accepted.

### 8.2 List Teams

`GET /player/teams?limit=<n>&cursor=<opaque>`

- `limit` default: `50`; accepted range: `1..100`;
- `cursor` is absent for the first page and otherwise is an opaque server-issued keyset cursor;
- order is ascending canonical `teamId` text, strictly an operational transport order;
- no cross-page snapshot is promised while Teams are created/deleted concurrently; while the owned
  Team set is stable, paging reaches every persisted Team, including historical/admin state above
  the normal live-create quota.

```json
{
  "teamLimit": 6,
  "teams": [
    { "teamId": "uuid", "rowVersion": "0" }
  ],
  "nextCursor": null
}
```

No Team name/icon/favorite/active-Team field exists. In v1, the six live rows therefore constitute
the complete saved-preset capacity exposed by this service; Players reuse capacity by editing or
deleting Teams rather than by exceeding the limit.

All persisted owned Teams remain readable and editable even if historical/admin state contains more
than 6 rows. The quota constrains only acceptance of a **new** player-facing Team-create command.
The list ordering has no gameplay or preference meaning.

### 8.3 Load Team

`GET /player/teams/:teamId`

Success `200`:

```json
{
  "teamId": "uuid",
  "pokemonInstanceIds": [],
  "rowVersion": "0"
}
```

The roster is the persisted dense preference order from SPEC-005, not direct combat lineup
authority.

### 8.4 Create Team

`POST /player/teams`

Requires `Idempotency-Key: <uuid>`. The key is:

- a command identity only, never authorization;
- scoped to the authenticated Player + create-Team operation;
- never reusable for a different logical create command during its supported replay lifetime.

The server durably correlates accepted create commands so concurrent/retried delivery of the same key
returns the same created Team and never allocates a second Team. Response-loss replay is therefore
safe. There is no request body.

Creation uses one authoritative database transaction/serialization boundary for the authenticated
Player. Inside that boundary, in this order:

1. acquire the per-Player create serialization boundary;
2. resolve the exact `(PlayerId, create-Team, Idempotency-Key)` record first;
3. if it is an accepted replay, return the original Team result (or `410 idempotency_gone` for its
   retained deletion tombstone) without rechecking/consuming quota or issuance;
4. for a new key, enforce the rolling-24h accepted-create limit;
5. enforce the 6-live-Team quota;
6. allocate the server-owned Team UUIDv7, insert the Team, and persist the durable idempotency
   correlation/result in the same transaction;
7. commit all of those effects together or none.

Concurrent same-key requests therefore converge on one Team. Concurrent distinct keys when 5 live
Teams exist may accept at most one 6th Team. A process failure cannot expose a Team without its
accepted correlation record or a correlation record without its Team.

First success and exact replay both return `200`:

```json
{ "teamId": "uuid", "rowVersion": "0" }
```

An already-accepted key remains a replay even if the Player has since reached the live Team quota.
If that exact Team was later deleted, the retained create-command tombstone returns
`410 idempotency_gone` rather than recreating it.

V1 retains the live Team correlation for the Team lifetime. When that Team is deleted, its
create-command correlation becomes a tombstone with a replay expiry exactly **30 days after the
authoritative server deletion timestamp**. During that window, exact replay returns
`410 idempotency_gone` and never recreates the Team. After expiry, the old key is no longer a
supported retry identity and clients must use a new UUID for any genuinely new create command.

Normal-operation persistence must expire/delete or equivalently compact expired tombstones so
retained deleted-Team correlations remain bounded by the accepted 64-per-rolling-24h issuance
envelope and 30-day replay window; indefinite retention is not the normal v1 behavior.
Implementation may use a small forward migration for durable command correlation; exact table/index
layout and cleanup mechanics are implementation-owned.

### 8.5 Replace Team roster

`PUT /player/teams/:teamId/roster`

Request:

```json
{
  "expectedRowVersion": "0",
  "pokemonInstanceIds": ["uuid"]
}
```

The array is the complete new dense roster, length `0..6`, with no duplicate Pokémon IDs.

Success `200`:

```json
{
  "teamId": "uuid",
  "pokemonInstanceIds": ["uuid"],
  "rowVersion": "1"
}
```

The command is effect-idempotent under the expected Team OCC token: one accepted version can advance
at most once. A response-loss retry with the old expected version may return `409 stale`; it cannot
apply the roster twice or partially. On `409 stale`, callers must reload/reconcile before issuing a
new command; no automatic fresh-token retry is allowed.

### 8.6 Delete Team

`DELETE /player/teams/:teamId?expectedRowVersion=<decimal>`

Success is `204` with no body. The command deletes only the owned Team/roster and never deletes
Pokémon. A repeated request after successful deletion returns `404 not_found` and cannot recreate or
partially delete state.

## 9. Move Loadout replacement

`PUT /player/pokemon/:pokemonInstanceId/moves`

Request:

```json
{
  "expectedRowVersion": "0",
  "moveIds": ["opaque"]
}
```

The list is the proposed complete ordered `1..4` loadout. The route must call TASK-089's
`MoveEligibilityApplicationService.replaceMoveLoadout`; no HTTP/database path may bypass it with the
raw TASK-020 persistence setter.

TASK-089 result mapping is explicit:

- `invalid_structure` -> `400 invalid_request`;
- `unresolved_move` / `ineligible_move` -> `422 invalid_move_loadout`;
- `unresolved_species` or exact-context resolution failure -> `503 authority_unavailable`;
- `stale` -> `409 stale`;
- `not_found` -> `404 not_found`.

Success `200`:

```json
{
  "pokemonInstanceId": "uuid",
  "moveIds": ["opaque"],
  "rowVersion": "1"
}
```

Selected-only grandfathering remains exactly SPEC-010: a persisted legacy selected Move can remain
until an edit, but every complete replacement is validated against current exact server-selected
eligibility.

The client supplies no authoritative Species, Level, `gameDataVersion` or `rulesVersion`.
On `409 stale`, the client must reload the owned Pokémon and explicitly recompute/reselect the full
replacement. The API must not silently retry TASK-089 with a fresh shared Pokémon `rowVersion`.

## 10. Move authority runtime composition

TASK-025 must compose TASK-089 using an explicit server-owned runtime configuration:

- one selected exact `{gameDataVersion,rulesVersion}`;
- retained exact-pair compatibility;
- current new-operation permission for the pair, rules release and game-data release;
- exact `pokenexus.move-eligibility.level-up-only.v1` artifact identity + accepted semantic hash;
- exact immutable runtime game-data bundle loading.

No environment value or request field may silently mean "latest". Missing/mismatched configuration
fails closed as `503 authority_unavailable`.

The concrete production release identifiers configured by deployment are operational configuration;
changing to a different accepted release still requires that release to be present in the retained
authorities defined by SPEC-002/SPEC-010.

## 11. Request bounds and parsing

- JSON mutation bodies are objects only and are rejected above 16 KiB before domain work.
- UUID path/member/Idempotency-Key values must be canonical UUID text accepted by the server parser.
- `expectedRowVersion` is canonical non-negative decimal within PostgreSQL signed-`bigint` range.
- Opaque cursors are selectors only, carry no authority and disclose no owner/account secret; forged
  or malformed cursors fail as `400 invalid_request`.
- Move IDs are non-empty strings; the request has at most four and the server applies a conservative
  transport length bound before TASK-089 resolution. The transport bound is not a gameplay ID rule.
- Unknown top-level mutation fields are rejected rather than ignored.
- Malformed requests fail before persistence mutation.

## 12. Security, privacy and audit boundary

- Normal player-state operations require no recent-auth step-up beyond ADR-006 normal session
  authorization.
- No response exposes AccountId, ownerPlayerId, recovery email, session IDs/tokens, CSRF values,
  security epoch, database correlation secrets or raw SQL errors.
- Resource existence for another Player is not disclosed.
- Idempotency keys are command-correlation metadata, not secrets and not gameplay identity.
- Existing security/audit correlation may record bounded route/result metadata but not full Inventory,
  Move or Team payloads by default.

## 13. Implementation handoff to TASK-025

After SPEC-011 is APPROVED, TASK-025 remains Class B implementation work inside this contract. It may:

- add API application/repository adapters required for self-scoped reads and Team commands;
- add the smallest forward migration required for durable Team-create idempotency;
- add keyset/opaque-cursor read helpers and snapshot-coherent Inventory paging;
- wire TASK-089 exact Move authority into the API runtime;
- extend `/player/*` CORS methods and reusable session guards without altering ADR-006 semantics;
- add disposable PostgreSQL 17 integration/race/replay coverage and Worker compatibility tests.

TASK-025 must not widen the public route set or payload authority beyond this spec without a new
accepted protocol change.

## 14. Acceptance criteria

- [x] Public self-scoped route/method/payload/error semantics are explicit.
- [x] Client identifiers never confer owner authority.
- [x] GET routes do not advance session inactivity; explicit Team/Move commands do.
- [x] Every mutation reuses exact Origin + session-bound CSRF enforcement.
- [x] Player Level/XP, Item quantity and every rowVersion are lossless decimal strings.
- [x] Collection, Team-list and Inventory reads are bounded; their pagination order is non-gameplay.
- [x] Inventory page root/version + entries are snapshot-coherent.
- [x] No public Inventory grant/use or progression setter exists.
- [x] Selected Ability remains read-only pending an accepted authority.
- [x] Saved-Team creation has a 6-live-Team service quota with race-safe enforcement.
- [x] The 6-live-Team value is explicitly a deliberate player-visible saved-preset capacity that may
      constrain team-building organization; it is not battle/Team-roster capacity or an economy rule.
- [x] New Team-create issuance is capped at 64 accepted new commands per Player per rolling 24h;
      exact accepted-key replays are exempt.
- [x] Team creation is durable-idempotent under Player + create-Team + Idempotency-Key.
- [x] Existing-key replay lookup, issuance/quota checks, Team insert and idempotency result commit in
      one authoritative per-Player serialized transaction.
- [x] Team roster/delete and Move replacement preserve existing OCC/fail-closed ownership behavior.
- [x] A stale write never returns a replacement write token or triggers automatic retry; callers
      reload/reconcile and issue a deliberate new command.
- [x] Move replacement can only pass through TASK-089 exact current eligibility.
- [x] Missing/deprecated Move authority fails closed with no latest fallback.
- [x] No auth/reward/gameplay/economy semantics are invented.
- [x] Independent QA has no unresolved P0/P1 on the Human-revised 6-Team quota snapshot.
- [x] Independent Auditor has no unresolved P0/P1 for authz/concurrency/idempotency on the
      Human-revised 6-Team quota snapshot.
- [x] Required GSC advisory is complete for the player-visible 6-live-Team service quota; the
      advisor confirms the deliberate preset-capacity consequence and that it is not being treated as
      combat/Team-roster gameplay capacity.
- [x] Human Owner explicitly accepts the complete SPEC-011 public protocol.

## 15. Human acceptance decision

On 2026-09-22 the Human Owner explicitly accepted the complete revised SPEC-011 public protocol.
The exact pre-transition accepted snapshot SHA-256 was
`41CC5525E896F9402CDE5747914B172EE25901A228C0AB7BCD423AD26B14C858`.

The accepted v1 decisions include:

1. self-scoped route set and no public Ability/Inventory/progression mutation;
2. decimal-string encoding for all exact/unbounded integers;
3. GET non-activity vs explicit Team/Move command activity;
4. Collection/Team-list/Inventory page default `50`, maximum `100`;
5. live saved-Team service quota `6`, explicitly accepting six retained presets as a deliberate
   player-visible v1 capacity constraint rather than a gameplay-invisible abuse-only ceiling; revisit
   that product limit when broader multi-mode team-building requires more retained presets;
6. authoritative Team-create issuance limit `64` accepted new commands per rolling 24h, with exact
   accepted-key replays exempt;
7. required UUID `Idempotency-Key` for Team creation and one per-Player serialized transaction
   covering replay lookup, issuance/quota decision, Team insert and durable correlation/result;
8. Team-create correlation retained for the live Team lifetime plus a deleted-Team tombstone through
   an exact 30-day post-delete replay window, returning `410 idempotency_gone` instead of recreating
   on replay and then expiring/compacting normal retained state;
9. `409 stale` without a fresh write token or hidden retry, plus `503 authority_unavailable` for
   exact Move-context/persisted Species resolution failure.

The Class A semantic acceptance gate is complete. TASK-025 implementation remains blocked until
TASK-094 completes its normal repository/history closure and the approved SPEC-011 snapshot is
formally integrated. PXE remains N/A because the saved-Team capacity is not a currency, source/sink,
paid advantage, monetization mechanic or economy-value constraint.
