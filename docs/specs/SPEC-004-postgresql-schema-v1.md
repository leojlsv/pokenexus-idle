# SPEC-004 — PostgreSQL Persistence Schema v1

- Status: APPROVED
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Related ADRs:
  - `docs/decisions/ADR-005-persistence-data-access-strategy.md`
- Related specs:
  - `docs/specs/SPEC-001-core-domain-model.md`
  - `docs/specs/SPEC-002-static-game-data-and-versioning.md`
  - `docs/specs/SPEC-003-combat-rules-v1.md`
- Related tasks:
  - `TASK-013` — this specification
  - `TASK-014` — Database Adapter & Migration Foundation
  - `TASK-015/016` — authentication/session model and implementation
  - `TASK-019/020` — Pokémon Instance / Collection / Team model and implementation
  - `TASK-021/022/023/024` — progression, inventory and reward integrity
  - `TASK-033+` — PvE/Hunt lifecycle and persistence consumers

## 1. Purpose

Define the first PostgreSQL 17-compatible relational persistence schema that later implementation
tasks can materialize without guessing identity, ownership, referential-integrity or optimistic-
concurrency boundaries.

This specification deliberately separates **storage shape** from later product rules. It provides a
minimum durable substrate for accounts/players, owned Pokémon, saved Team aggregates, inventory
aggregate ownership and Hunt/offline checkpoint state while leaving deferred rules with their owning
tasks.

## 2. Normative database baseline

The schema follows accepted ADR-005:

- PostgreSQL 17 SQL-feature compatibility is the baseline even if the selected provider runs newer;
- durable locally generated entity IDs use application-generated RFC 9562 UUIDv7 stored as native
  PostgreSQL `uuid`;
- static-definition/version identities remain opaque domain strings and use the reversible
  persistence codec in section 2.1 rather than gaining a SQL-text grammar or UUID surrogate;
- `timestamptz` is used for infrastructure instants and never substitutes deterministic logical
  combat/Hunt time;
- every mutable aggregate that can participate in an authoritative conditional write exposes a
  non-negative `bigint` `row_version`;
- IDs have no database-generated sequence/default; the authoritative command supplies the intended
  UUID so retries can reuse it where the owning command contract requires idempotency;
- application runtime access uses the ADR-005 Hyperdrive path, but Hyperdrive/driver configuration is
  not represented inside relational tables.

All application tables live in schema `pokenexus`. Runtime queries must schema-qualify database
objects; correctness must not depend on a request/session-specific `search_path`.

### 2.1 Opaque string persistence codec

Accepted domain IDs/version values are TypeScript strings with opaque equality semantics. The
accepted contracts do not authorize TASK-013 to reject NUL-bearing or otherwise unusual strings,
and PostgreSQL `text`/`jsonb` cannot directly round-trip every such value.

Schema v1 therefore defines **OpaqueStringDbCodec v1** for every opaque string identity/version field
stored as a relational scalar:

1. Treat the input as the exact sequence of UTF-16 code units in the TypeScript string.
2. Encode each 16-bit code unit as exactly two bytes, big-endian, in sequence.
3. Store the resulting bytes in PostgreSQL `bytea`.
4. Decode only an even-length byte sequence; malformed persisted bytes fail closed.
5. Perform no trimming, Unicode normalization, case folding, slug conversion or semantic parsing.

This mapping is one-to-one for the complete TypeScript string domain, including U+0000 and unpaired
UTF-16 surrogate code units. Database equality/UNIQUE semantics operate on the encoded bytes and
therefore preserve exact domain-string equality. For fields whose owning contract requires a
non-empty string, use
`CHECK (octet_length(column) > 0 AND mod(octet_length(column), 2) = 0)`; nullable opaque-string
fields, when later accepted, still require even byte length whenever non-null.

OpaqueStringDbCodec v1 defines storage/equality only. The lexicographic ordering of encoded `bytea`
is **not** promoted into canonical domain, gameplay or replay ordering. An authoritative ordered path
must decode values and apply the comparator/order explicitly owned by that domain contract, or use a
separate accepted sequence/order column. Repository code must not substitute `ORDER BY <opaque_id>
BYTEA` for an owning canonical comparator.

TASK-014 owns the tested encoder/decoder implementation. Its round-trip corpus must include ordinary
ASCII, non-ASCII, U+0000 and surrogate-edge strings so persistence cannot silently narrow opaque IDs.

## 3. Common column conventions

### 3.1 Mutable aggregate metadata

Mutable aggregate roots use:

```text
row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0)
created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
```

`row_version` is the optimistic-concurrency token. Repository updates use a conditional predicate on
the previously read version and increment it in the successful write. A zero-row update is a stale-
state conflict, not a successful no-op.

`updated_at` is written explicitly by the repository on accepted mutation. No trigger is required by
this specification. Timestamps are operational metadata only.

### 3.2 Deletion behavior

v1 does not use broad `ON DELETE CASCADE` from account/player ownership roots. Account deletion,
recovery, retention and anonymization are owned by TASK-015/016 and later privacy/recovery work.
Destructive deletion must therefore be explicit rather than silently cascading through player-owned
state.

### 3.3 Static references

Mutable entity rows store the stable canonical static identity, such as `species_id`, through
OpaqueStringDbCodec v1 without
silently pinning that entity forever to the `gameDataVersion` active when the row was created.
SPEC-002 freezes canonical IDs across published data versions; the authoritative operation/Battle/
checkpoint owns the exact compatible `{ gameDataVersion, rulesVersion }` used to interpret those IDs.

Historical/replayable evidence that must preserve past interpretation therefore stores the required
version identities explicitly. If a later owning contract also needs creation/origin provenance on a
mutable entity, that field must be named and documented as provenance and must not become the current
semantic resolution context by accident.

Static IDs are not relational foreign keys because the SPEC-002 published bundle is not a mutable
catalog owned by PostgreSQL. Column names retain domain names such as `species_id`, while the
persistence adapter is responsible for encoding/decoding their `bytea` storage representation.

## 4. Core identity tables

### 4.1 `pokenexus.accounts`

`accounts` is the minimum durable account identity envelope required before the later authentication
model exists.

```sql
CREATE TABLE pokenexus.accounts (
  account_id  uuid PRIMARY KEY,
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

`account_id` is persistence/auth identity, not a new gameplay identifier silently added to
`@pokenexus/game-types`. SPEC-004 freezes the semantic identity name **AccountId** for the shared
persistence/auth boundary: it is represented as an application-generated UUIDv7 and is distinct from
`PlayerId` and from any external identity-provider subject/key. TASK-015/016 may materialize the
corresponding shared TypeScript/protocol type, but must preserve this identity meaning. Credentials,
provider identities, account states, deletion/recovery fields and session data belong to TASK-015/016.

### 4.2 `pokenexus.players`

v1 uses one durable Player profile per Account. An Account may exist before its Player row is created,
but one Account cannot own multiple Player profiles in v1.

```sql
CREATE TABLE pokenexus.players (
  player_id   uuid PRIMARY KEY,
  account_id  uuid NOT NULL UNIQUE REFERENCES pokenexus.accounts(account_id),
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Profile/display fields are intentionally absent; TASK-017 owns the accepted profile/API contract.

## 5. Pokémon Instance persistence

### 5.1 `pokenexus.pokemon_instances`

The v1 row persists only instance facts already accepted by SPEC-001/003 plus ownership/concurrency.

```sql
CREATE TABLE pokenexus.pokemon_instances (
  pokemon_instance_id       uuid PRIMARY KEY,
  owner_player_id           uuid NOT NULL REFERENCES pokenexus.players(player_id),
  species_id                 bytea NOT NULL
    CHECK (octet_length(species_id) > 0 AND mod(octet_length(species_id), 2) = 0),
  level                      smallint NOT NULL CHECK (level BETWEEN 1 AND 200),
  iv_hp                      smallint NOT NULL CHECK (iv_hp  BETWEEN 0 AND 31),
  iv_atk                     smallint NOT NULL CHECK (iv_atk BETWEEN 0 AND 31),
  iv_def                     smallint NOT NULL CHECK (iv_def BETWEEN 0 AND 31),
  iv_spa                     smallint NOT NULL CHECK (iv_spa BETWEEN 0 AND 31),
  iv_spd                     smallint NOT NULL CHECK (iv_spd BETWEEN 0 AND 31),
  iv_spe                     smallint NOT NULL CHECK (iv_spe BETWEEN 0 AND 31),
  row_version                bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at                 timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                 timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (owner_player_id, pokemon_instance_id)
);
```

The schema does **not** persist derived combat stats as durable truth. Derived stats are recomputed
from accepted raw inputs under the authoritative operation/Battle's pinned rules/static context when
an owning contract requires them. `pokemon_instances.species_id` identifies the durable Species
identity; it does not select the `gameDataVersion` used for current gameplay interpretation.

The following remain deferred to TASK-019/021 and later migrations:

- selected Ability and eligibility semantics;
- learned/selected ordered Move Loadout persistence;
- XP curve/source semantics and any XP counters not yet accepted;
- evolution/customization/nickname/product fields;
- transfer/trade rules and related history.

## 6. Saved Pokémon Team persistence

### 6.1 `pokenexus.pokemon_teams`

```sql
CREATE TABLE pokenexus.pokemon_teams (
  team_id         uuid PRIMARY KEY,
  owner_player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  row_version     bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at      timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (owner_player_id, team_id)
);
```

### 6.2 `pokenexus.pokemon_team_members`

The membership table records ownership-consistent references without deciding Team order,
cardinality, duplicate-reference eligibility or reuse across Teams. Those are TASK-019 rules.

```sql
CREATE TABLE pokenexus.pokemon_team_members (
  team_member_id      uuid PRIMARY KEY,
  team_id             uuid NOT NULL,
  pokemon_instance_id uuid NOT NULL,
  owner_player_id     uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_player_id, team_id)
    REFERENCES pokenexus.pokemon_teams(owner_player_id, team_id),
  FOREIGN KEY (owner_player_id, pokemon_instance_id)
    REFERENCES pokenexus.pokemon_instances(owner_player_id, pokemon_instance_id)
);

CREATE INDEX pokemon_team_members_team_idx
  ON pokenexus.pokemon_team_members (team_id, owner_player_id);

CREATE INDEX pokemon_team_members_pokemon_idx
  ON pokenexus.pokemon_team_members (pokemon_instance_id, owner_player_id);
```

There is intentionally no `slot`, ordering constraint, `UNIQUE(team_id, pokemon_instance_id)` or
maximum-member check in SPEC-004. TASK-019 must add the accepted constraints through a later
forward migration rather than having TASK-013 guess product rules.

## 7. Inventory aggregate root

### 7.1 `pokenexus.player_inventories`

```sql
CREATE TABLE pokenexus.player_inventories (
  player_id    uuid PRIMARY KEY REFERENCES pokenexus.players(player_id),
  row_version  bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

This table establishes the durable ownership/concurrency boundary only. SPEC-004 intentionally does
not create an inventory-entry table because TASK-022 owns whether each accepted Item is stackable,
quantity-based or requires durable per-copy identity. TASK-022 may add entry tables/constraints while
keeping this aggregate root.

## 8. Hunt/offline checkpoint foundation

### 8.1 `pokenexus.hunt_checkpoints`

TASK-033 has not yet defined a canonical `HuntId` or Hunt lifecycle. The persistence foundation
therefore does not invent one. `checkpoint_id` is only the durable persistence identity of this
checkpoint row; it is not a `HuntId`, Zone identity or other product/gameplay identity. Schema-version
and static/rules-version values use OpaqueStringDbCodec v1.

```sql
CREATE TABLE pokenexus.hunt_checkpoints (
  checkpoint_id             uuid PRIMARY KEY,
  player_id                 uuid NOT NULL REFERENCES pokenexus.players(player_id),
  checkpoint_schema_version bytea NOT NULL
    CHECK (octet_length(checkpoint_schema_version) > 0
      AND mod(octet_length(checkpoint_schema_version), 2) = 0),
  game_data_version         bytea NOT NULL
    CHECK (octet_length(game_data_version) > 0
      AND mod(octet_length(game_data_version), 2) = 0),
  rules_version             bytea NOT NULL
    CHECK (octet_length(rules_version) > 0
      AND mod(octet_length(rules_version), 2) = 0),
  logical_time_ms           bigint NOT NULL
    CHECK (logical_time_ms BETWEEN 0 AND 9007199254740991),
  checkpoint_state_bytes    bytea NOT NULL,
  row_version               bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at                timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

```

Rules:

- `checkpoint_state_bytes` is a bounded, versioned snapshot/evidence payload permitted by ADR-005;
  it must never become an unversioned dumping ground for mutable relational entities;
- `logical_time_ms` is bounded to JavaScript `Number.MAX_SAFE_INTEGER` because accepted deterministic
  engine/orchestration time is represented as an exact TypeScript safe integer; persistence must not
  admit a value that cannot be losslessly rehydrated into that execution domain;
- the complete payload serialization/codec is selected by `checkpoint_schema_version`; unsupported
  versions fail closed. The database stores bytes rather than interpreting the payload as `jsonb`, so
  the codec can losslessly preserve opaque NUL-bearing identity/version strings and other accepted
  TypeScript string values;
- any embedded Battle/transcript state must carry all immutable context identities required by
  ADR-004/SPEC-003, including event-schema identity where applicable;
- a long/offline simulation loads the checkpoint plus any other source aggregates, computes outside
  the database transaction, then conditionally updates against the previously read `row_version` and
  any additional owning aggregate versions required by the command;
- stale conditional commit returns conflict and requires reload/recompute; stale output is never
  silently persisted;
- TASK-033 may add an accepted canonical Hunt/lifecycle identity and its uniqueness/lookup constraints
  through an explicit forward migration once that product contract exists; `checkpoint_id` remains a
  persistence-row identity and must not be retroactively reinterpreted as that gameplay identity.

## 9. Reward/audit ledger foundations

SPEC-004 does **not** create reward or security-audit tables because their authority semantics,
idempotency keys, event taxonomy, privacy/retention and rollback behavior belong to TASK-018/023.

Those later schemas must nevertheless preserve this accepted foundation:

- append-only immutable ledger/event rows where the owning contract requires historical evidence;
- application-generated UUIDv7 row identity;
- explicit player/account/subject reference rather than display-name identity;
- explicit source/correlation/idempotency identity defined by the owning contract;
- pinned `game_data_version` / `rules_version` whenever interpretation depends on them;
- OpaqueStringDbCodec v1 (or a later explicitly accepted lossless replacement) for opaque string
  identity/version scalars unless the owning Class A contract deliberately narrows that domain;
- `timestamptz` for infrastructure occurrence/recording instants, never deterministic combat time;
- database uniqueness/constraint support for any accepted duplicate-prevention invariant;
- no secrets, credential material or raw session tokens in audit payloads.

## 10. Index policy v1

SPEC-004 creates only indexes required by known ownership/member lookup paths and primary/unique
constraints. Owner-first composite UNIQUE constraints on `pokemon_instances` and `pokemon_teams`
serve both the ownership lookup and the composite ownership FK target, avoiding a duplicate owner
B-tree. It does not pre-emptively index every foreign key or timestamp.

TASK-014 implementation tests and later measured query plans may add indexes through migrations when
an actual accepted query path demonstrates the need. PostgreSQL index changes remain schema changes
and must be reviewed for write/storage/locking impact.

## 11. Concurrency and transaction invariants

The relational model must support ADR-005 command-scoped transactions:

1. `row_version` is the default optimistic-concurrency guard on mutable aggregate roots.
2. Team membership changes and the owning `pokemon_teams.row_version` update occur in one transaction
   once TASK-019 defines accepted Team mutation semantics.
3. Inventory entry mutations and `player_inventories.row_version` update occur in one transaction
   once TASK-022 defines inventory semantics.
4. Pokémon ownership/progression mutation conditionally updates the relevant instance version.
5. Cross-aggregate commands must validate every source version required by their accepted invariant;
   one successful row-version check must not be treated as proof that unrelated source rows are still
   current.
6. Repository code may escalate to row locks or `SERIALIZABLE` only when the owning command's
   accepted invariant requires it; SPEC-004 does not make broad locking the default.

## 12. Deferred schema extensions

The following are intentionally **not** part of Schema v1 and require their owning accepted task
before a migration adds them:

- auth credentials, provider accounts, account state, sessions/recovery/authorization (TASK-015/016);
- player profile/display fields (TASK-017);
- Ability selection, Move Loadout slots/order, Team slots/cardinality/duplicate rules (TASK-019);
- XP/progression fields whose semantics are not already accepted (TASK-021);
- inventory entry/quantity/per-copy item representation (TASK-022);
- reward/idempotency ledger tables (TASK-023);
- PvE World/Zone/Encounter/Hunt lifecycle identities and relationships (TASK-033/034);
- capture/reward grant records (TASK-036);
- social party/HUB/Duo room persistence beyond accepted realtime coordination boundaries;
- public HTTP/WebSocket payload contracts.

The intentionally permissive foundation rows are not permission to expose premature write APIs.
Team membership writes wait for TASK-019/020, inventory item writes wait for TASK-022/024, and Hunt
checkpoint creation/update waits for the accepted TASK-033+ lifecycle/implementation path. This
keeps early schema materialization from creating production data that violates rules not yet defined.

## 13. Migration implementation handoff

TASK-014 materializes this specification as ordered SQL migrations and adapter/test infrastructure.
It must:

- keep PostgreSQL 17 compatibility;
- use the direct administrative migration path from ADR-005;
- record immutable migration IDs/checksums;
- keep migration work + ledger record atomic where PostgreSQL permits transactional execution;
- configure Worker `pg`/Hyperdrive runtime compatibility separately from this relational schema;
- verify all PK/FK/UNIQUE/CHECK constraints and optimistic-concurrency behavior against a real
  PostgreSQL test database;
- not broaden the schema with deferred product fields merely to make repositories convenient.

## 14. Acceptance

SPEC-004 is accepted when:

1. Lead Developer feasibility review finds no unresolved implementation blocker;
2. independent QA reports no unresolved P0/P1 findings;
3. Independent Auditor reports no unresolved P0/P1 concurrency/migration-integrity findings;
4. Human Owner explicitly accepts this persistence model.

## 15. Open decisions

The following are deliberately deferred rather than guessed:

- auth/account status and credential/session schema;
- player-facing profile attributes;
- Team slots/order/cardinality/duplicate eligibility;
- Pokémon selected Ability and persistent Move Loadout shape;
- XP curve/source and additional progression counters;
- inventory item ownership representation;
- Hunt canonical identity and lifecycle;
- reward/security audit ledger taxonomy and retention;
- deletion/anonymization/retention policy;
- production backup/RPO/RTO and deployment migration orchestration.
