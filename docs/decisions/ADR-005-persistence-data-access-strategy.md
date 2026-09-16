# ADR-005 — Persistence & Data Access Strategy

## Status

Accepted

## Context

PokeNexus needs durable server-authoritative persistence before account/player state, owned Pokémon,
teams, inventory, progression, Hunt checkpoints and later reward/audit ledgers can be implemented.

The accepted architecture already fixes several boundaries:

- TypeScript is the primary implementation language;
- the API runs on Cloudflare Workers;
- Durable Objects are limited to realtime HUB/Duo coordination rather than global durable game
  state;
- Solo Hunts advance from elapsed time instead of a persistent server tick;
- PostgreSQL is the selected durable database family;
- `packages/game-core` is deterministic and infrastructure-free;
- canonical domain IDs are opaque strings at the TypeScript boundary;
- static game data/rules use immutable version identities that historical authoritative state must
  retain when interpretation depends on them.

What remains undecided is how Workers reach PostgreSQL, what is authoritative, how data-access code
is layered, what identity representation persistent entities use, where transaction boundaries sit,
and how schema migrations are applied safely.

Cloudflare Hyperdrive currently provides PostgreSQL connectivity and connection pooling for Workers.
Its pool operates in transaction mode. Hyperdrive query caching is enabled by default, and writes do
not invalidate cached read results. Cloudflare therefore recommends a cache-disabled Hyperdrive
configuration for reads that require freshness/read-after-write consistency. Current documentation
also identifies `node-postgres` as the recommended JavaScript/TypeScript PostgreSQL driver for
Hyperdrive and documents unsupported/session-sensitive features such as SQL-level prepared
statement management, advisory locks and `LISTEN`/`NOTIFY` through the Hyperdrive path.

This ADR defines the architecture. TASK-013 owns the concrete relational model and indexes;
TASK-014 owns driver/migration implementation and test infrastructure.

## Decision

### 1. PostgreSQL is the durable system of record

Use managed PostgreSQL as the canonical durable store for authoritative mutable account/player/game
state.

The initial topology is one logical writable primary. PokeNexus does not introduce multi-primary or
active-active relational writes in v1. Read replicas may be added later for workloads whose
consistency contract permits them, but no caller may assume replica freshness unless an accepted
contract says so.

The exact managed vendor is an environment choice rather than an application/domain dependency.
The canonical SQL-feature compatibility baseline is **PostgreSQL 17**. A provider may run a newer
major only when application schema/migrations remain PostgreSQL-17-compatible unless a later
accepted architecture change deliberately raises that baseline. This avoids silently making
TASK-013/014 depend on PostgreSQL 18-only features while current Hyperdrive support documentation
explicitly lists PostgreSQL through 17.x.

The selected provider must support:

- a currently supported PostgreSQL major compatible with the project's SQL baseline;
- TLS-secured PostgreSQL wire-protocol connections;
- direct administrative/migration connectivity separate from application runtime access;
- backups/recovery features sufficient for the later TASK-083 recovery contract;
- Cloudflare Hyperdrive connectivity from the deployed Worker environments.

Provider-specific APIs, branching features, connection proxies or proprietary extensions are not
part of the authoritative persistence contract unless a later ADR explicitly adopts them.

### 2. Cloudflare Workers reach PostgreSQL through Hyperdrive

Production request-serving Workers access PostgreSQL through environment-specific Hyperdrive
bindings rather than opening unmanaged direct origin connections for normal application traffic.

Hyperdrive owns origin connection pooling. Application code must not assume that one Worker isolate,
request or logical client retains one physical PostgreSQL session across operations. Session-local
state is not an application contract.

Database driver objects that own I/O state are created inside the Worker invocation/request context
and are not stored globally or reused across requests. TASK-014 must not add a process-style global
`pg.Pool`/`pg.Client` as a second application pool in front of Hyperdrive. Hyperdrive is the shared
origin pool; the Worker-side client is short-lived invocation-local access to that pool.

For authoritative mutable state, the default binding is **cache-disabled**. This includes account,
session, authorization-facing, ownership, team, inventory, progression, checkpoint and reward-
relevant reads once those domains exist. The reason is correctness: Hyperdrive does not invalidate
cached read results after writes.

A second cached Hyperdrive binding may be introduced only for an explicitly named read path whose
accepted contract tolerates bounded staleness. Fresh and cached bindings must have distinct names
and repository/API methods so a correctness-sensitive call cannot silently inherit cached behavior.

`apps/api` is an expected database consumer. `apps/realtime` may access PostgreSQL when a later
accepted realtime contract requires durable load/checkpoint/finalization, but ephemeral movement and
presence remain outside continuous database persistence under ADR-003.

### 3. Driver and data-access shape

Use `node-postgres` (`pg`) as the preferred baseline PostgreSQL driver for TASK-014 because current
Cloudflare documentation recommends it for Hyperdrive compatibility. TASK-012 does not install the
dependency; TASK-014 must add/pin/test it under repository dependency policy.

The current Worker configuration uses a compatibility date earlier than Cloudflare's automatic
Node.js-compatibility cutoff. TASK-014 therefore owns the required Worker runtime configuration for
database drivers: explicitly enable `nodejs_compat`, or deliberately update the compatibility date
and validate equivalent Node.js compatibility before integrating `pg`.

Do not require an ORM for the architecture. Canonical relational schema and migrations are SQL
source-of-truth. A later task may justify a lightweight typed query builder/mapper, but it must not:

- own or reinterpret schema outside canonical migrations;
- hide transaction/isolation behavior required by an accepted invariant;
- turn generated persistence rows into domain/public API authority;
- require unsupported Hyperdrive session behavior.

`packages/database` owns persistence-specific code:

- canonical SQL migrations;
- database row/record representations;
- repository/adaptor operations;
- transaction helpers;
- explicit mapping between stored values and persistence-facing records.

Application orchestration owns composition. `apps/api` and accepted realtime orchestrators may use
both `packages/database` and domain/game-core packages. `packages/game-core` never imports the
database package, driver, Cloudflare bindings or persistence records. `packages/database` likewise
does not execute the Combat Engine as a hidden side effect of a repository call.

### 4. Durable identifiers use native PostgreSQL UUID with UUIDv7 generation

Existing static definition IDs from SPEC-001/002 remain their accepted opaque PokeNexus strings.
They are not replaced with unrelated surrogate UUIDs solely for database convenience.

For new PokeNexus-generated **durable entity/instance identities**, use RFC 9562 UUIDv7 and store
them in PostgreSQL native `uuid` columns. This applies when a later accepted schema persists an
identity such as player-owned instance, team, durable encounter/session/history entity or another
locally generated persistent aggregate identity.

UUIDv7 is chosen because it remains globally unique/opaque while providing time-ordered locality
better suited to relational indexes than fully random UUID insertion. The exact standards-compliant
generator/library is TASK-014 implementation scope. Because PostgreSQL 17 is the SQL baseline,
application correctness must not depend on PostgreSQL 18's native `uuidv7()` function.

Generate the ID server-side at or before the authoritative command boundary rather than depending
on a hidden database row sequence. A retry may therefore reuse the intended identity where the
owning command contract requires idempotency.

UUIDv7 embeds a timestamp component, but a PokeNexus ID remains an opaque identifier, not a clock or
secret. Application/domain logic must never derive authoritative creation time, ordering, age,
authorization or gameplay semantics from UUID bits. Persist explicit `timestamptz`/domain fields for
time and explicit sequence/version fields for ordering/concurrency.

This rule does not force battle-local `CombatantId` or other deterministic runtime IDs to become
UUIDs. It also does not promote timestamps, display names, external auth-provider identifiers or
database row order into canonical PokeNexus identity.

### 5. Transactions follow authoritative command invariants

Use a PostgreSQL transaction when one accepted authoritative command must atomically preserve an
invariant across multiple writes/rows/tables.

Do not wrap every HTTP request in a transaction by default. Transactions are scoped to the mutation
that needs atomicity and should be as short as possible.

Never hold an application transaction open while performing:

- external HTTP/API calls;
- long-running deterministic combat/offline simulation;
- asset/content fetches;
- unrelated CPU-heavy work;
- user/client round trips.

Compute deterministic/domain outcomes outside the database transaction when the operation can be
made safe by validating a persisted version/state at commit time. When the decision itself depends
on locked current rows, keep only the minimum required read/validate/write section inside the
transaction.

Any persisted aggregate used as the source for long-running Hunt/offline/deterministic computation
must expose an explicit concurrency token/version (or an equivalently strong conditional-write
guard) in its owning schema. Final persistence uses a conditional commit against that source
version. If the guard fails, the repository returns a conflict/stale-state result; it must not apply
the stale computed output or silently auto-retry the old result. The orchestrator reloads current
state and recomputes under the owning command contract.

The default transaction isolation level is PostgreSQL `READ COMMITTED`. Stronger guarantees are
selected per invariant:

- unique/foreign-key/check constraints for structural integrity;
- conditional updates/aggregate version checks for optimistic concurrency;
- row locks (`FOR UPDATE` or equivalent) for narrow contended state;
- `SERIALIZABLE` only when a cross-row predicate/invariant cannot be safely expressed otherwise.

Any `SERIALIZABLE` command must define bounded retry behavior for serialization failures.

Transactions must not rely on session state surviving after commit because Hyperdrive uses
transaction pooling.

### 6. Migrations are ordered, immutable and run directly

Canonical schema migrations live under `packages/database` as ordered SQL artifacts.

Each migration has:

- a stable migration ID/order;
- immutable SQL content after application to any shared environment;
- a checksum recorded with its applied state in the migration ledger.

Editing an applied migration is invalid. Corrections create a new migration.

By default, a migration's transactional DDL/DML and its migration-ledger record commit in the same
PostgreSQL transaction so the ledger cannot claim work that rolled back or omit work that committed.
When PostgreSQL requires an operation outside a transaction (for example a deliberately selected
non-transactional DDL operation), that migration must be explicitly marked non-transactional and
define preconditions, partial-failure detection, repair/resume behavior and verification evidence in
its owning task before it can run against a shared environment.

Migrations execute from a controlled administrative/deployment surface using a **direct PostgreSQL
connection**, not the request-serving Hyperdrive binding. This keeps schema operations independent
from Hyperdrive transaction pooling/feature restrictions and allows migration tooling to use normal
PostgreSQL administrative capabilities when appropriate.

Use separate credentials/roles:

- application runtime roles receive only the DML/sequence/function privileges their accepted
  repositories require;
- migration role receives required schema-DDL privileges;
- migration credentials are not shipped to client code or used as the normal Worker application
  role.

Only one migration runner owns a target environment at a time. If a selected migration tool uses
PostgreSQL advisory locks to enforce single-runner behavior, that occurs only through the direct
administrative connection; application code must not rely on advisory locks through Hyperdrive.

Normal database evolution is forward-only. A failed release recovers through a compatible
application rollback, a corrective migration, or the accepted backup/restore procedure. An
automatically generated destructive `down` migration is not considered a guaranteed rollback.

Prefer expand/contract evolution where old and new application versions may overlap. Destructive,
large data-rewrite or locking migrations require explicit risk review in their owning task and must
not be smuggled into routine adapter work.

### 7. Persistence is not domain or replay authority by accident

Persistence representations do not redefine domain rules.

Static/historical interpretation retains the immutable `gameDataVersion`, `rulesVersion`, event-
schema or other accepted identities required by SPEC-002/ADR-004. A historical row must not be
reinterpreted solely against whatever content/rules are active now.

Use PostgreSQL `timestamptz` for operational/audit instants when later schemas need them. These
timestamps are infrastructure metadata and do not replace deterministic logical combat time,
ordered Combat Events or replay identities.

JSON/JSONB is acceptable for bounded immutable/versioned snapshots or evidence where a later
accepted contract requires preserving one payload, but it is not the default representation for
mutable relational entities and must not bypass relational integrity merely for implementation
convenience.

### 8. Durable Objects do not become a competing persistence authority

ADR-003 remains unchanged. Durable Object storage can own accepted realtime coordination state for
HUB/Duo rooms. Movement/presence is not continuously persisted to PostgreSQL.

When a realtime flow needs to create/update durable player-owned state, the owning later contract
must define one finalization/checkpoint boundary against PostgreSQL. The same persistent fact must
not be independently authoritative in both PostgreSQL and Durable Object storage with no conflict
resolution contract.

## Consequences

### Positive

- one durable relational source of truth for player-owned/game state;
- Cloudflare-compatible connection pooling without database code in `game-core`;
- explicit fresh-read semantics avoid accidental stale authoritative state from Hyperdrive defaults;
- schema/migration truth remains inspectable SQL rather than framework metadata;
- UUIDv7 preserves opaque distributed identity while improving insertion/index locality;
- command-scoped transactions provide atomicity without holding scarce pooled connections across
  long simulation/network work;
- migration credentials and request-serving credentials can follow least privilege;
- provider choice remains replaceable as long as PostgreSQL/Hyperdrive requirements are met.

### Negative / trade-offs

- disabling Hyperdrive caching for authoritative state gives up a potential read-latency/load
  optimization on those paths;
- SQL-first repositories require explicit mappings and more visible SQL than a full ORM;
- UUIDv7 requires a standards-compliant generator until the chosen runtime/database baseline can
  supply one in an accepted portable way, and its embedded timestamp must not become domain time;
- direct migration connectivity adds a second controlled connection path that deployment tooling
  must secure;
- one writable primary prioritizes consistency/simplicity over active-active write locality.

## Rejected alternatives

### Cloudflare D1 as the primary durable game database

Rejected for the current architecture. The roadmap/system architecture already selects PostgreSQL,
and upcoming schemas require a conventional relational transaction/migration model shared by API
and future reward/integrity work. D1 may still be appropriate for unrelated future bounded features
only through a separately accepted architecture decision.

### Hyperdrive query caching for all reads

Rejected because Hyperdrive does not invalidate cached reads after writes. Serving stale account,
permission, ownership or progression state is not an acceptable implicit default.

### Direct PostgreSQL connections from every Worker request without Hyperdrive

Rejected as the default production path because it discards the accepted Cloudflare-native pooling
layer and increases connection setup/load concerns. Direct connectivity is retained only for
controlled migration/administrative tooling unless a later measured exception is accepted.

### Full ORM as mandatory persistence architecture

Rejected. It would add framework/dependency and migration ownership before concrete schema/adaptor
requirements exist. TASK-014 may still justify a typed query builder/mapper if it preserves this
ADR's SQL/migration/transaction boundaries.

### Database-generated integer IDs as canonical domain identity

Rejected because it couples public/domain identity to one database sequence and makes distributed /
preallocated command identity harder. Native UUIDv7 remains opaque, database-friendly and
independent of row position.

### Event sourcing as the universal persistence model

Rejected. Combat events are deterministic evidence/output under ADR-004, not an automatic decision
to make every durable entity event-sourced. Later ledgers may be append-only where their owning
integrity contract requires it.

## Compatibility with accepted architecture

- ADR-001: TypeScript remains the stack language; the selected driver/adapters are TypeScript-facing.
- ADR-002: Solo Hunt elapsed-time simulation can run outside a DB transaction and persist at defined
  checkpoint/claim boundaries.
- ADR-003: realtime remains limited; DO coordination storage does not replace PostgreSQL durable
  player/game-state authority.
- ADR-004: Combat Engine remains pure; persistence orchestration consumes/produces explicit values
  around deterministic engine calls rather than performing DB I/O inside them.
- SPEC-001: persistent-instance/static/runtime identity layers remain separate.
- SPEC-002: historical authoritative state can retain immutable game-data/rules identities without
  falling back to latest active content.

## Implementation ownership

- TASK-013 defines PostgreSQL Schema v1 and concrete indexes/constraints.
- TASK-014 implements database driver/adapters, migrations, transaction helpers and test DB strategy.
- TASK-015/016 own authentication/session/authorization semantics; this ADR does not select RLS as a
  substitute for application authorization.
- TASK-023 owns reward-ledger/idempotency business semantics.
- TASK-079/080 own environments/deployment/secrets/release orchestration.
- TASK-083 owns backup/restore/disaster-recovery policy and rehearsal.

## References

- Cloudflare Hyperdrive — overview and PostgreSQL connectivity:
  `https://developers.cloudflare.com/hyperdrive/`
- Cloudflare Hyperdrive — connection pooling:
  `https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/`
- Cloudflare Hyperdrive — query caching/read-after-write behavior:
  `https://developers.cloudflare.com/hyperdrive/concepts/query-caching/`
- Cloudflare Hyperdrive — supported database features:
  `https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/`
- Cloudflare Hyperdrive — node-postgres:
  `https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/`
- RFC 9562 — Universally Unique IDentifiers (UUIDs):
  `https://www.rfc-editor.org/rfc/rfc9562`
