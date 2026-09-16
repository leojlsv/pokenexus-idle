# TASK-013 — PostgreSQL Schema v1

## Metadata

- State: DONE
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
  - `docs/specs/SPEC-003-combat-rules-v1.md`
  - `docs/specs/SPEC-004-postgresql-schema-v1.md`
- ADR:
  - `docs/decisions/ADR-005-persistence-data-access-strategy.md`
- Branch: `spec/TASK-013-postgresql-schema-v1`
- Worktree: `.worktrees/TASK-013-postgresql-schema-v1`

## Objective

Define and obtain Human Owner acceptance for PostgreSQL Schema v1 under accepted ADR-005 before
TASK-014 writes migrations/adapters.

The schema must be concrete enough to implement without guessing PK/FK/constraint/concurrency
boundaries while remaining deliberately incomplete where product semantics are owned by
TASK-015/019/021/022/023/033+.

## Scope

- PostgreSQL 17-compatible `pokenexus` application schema;
- minimal account identity envelope and one-account/one-player v1 relation;
- Pokémon Instance ownership, stable Species identity, accepted Level/IV persistence and
  optimistic-concurrency token;
- saved Team aggregate plus ownership-consistent membership rows without deciding order/cardinality/
  duplicate semantics;
- player inventory aggregate/concurrency root without pre-deciding stack/per-copy item semantics;
- versioned binary Hunt/offline checkpoint foundation with pinned game/rules identities and OCC;
- reversible `bytea` persistence codec for opaque string IDs/versions, including NUL-bearing values;
- common UUIDv7, `timestamptz`, `row_version`, deletion and static-reference conventions;
- reward/audit ledger foundation requirements without pre-implementing their future semantics;
- minimal known indexes only;
- exact deferrals and implementation handoff to TASK-014 and downstream Class A specs.

## Out of scope

- executable SQL migration files or database provisioning;
- installing `pg`, ORM/query-builder or migration dependencies;
- Worker/Hyperdrive/nodejs_compat configuration;
- repository/adaptor implementation or test database infrastructure;
- auth credentials/account-state/session schema;
- player profile API fields;
- Team ordering/cardinality/slot rules;
- selected Ability / ordered Move Loadout persistence;
- unaccepted XP/progression semantics;
- inventory item stack/per-copy representation;
- Hunt canonical identity/lifecycle/world/zone/encounter schema;
- reward ledger semantics/idempotency policy;
- security audit taxonomy/retention;
- destructive migrations or production database operations.

## Acceptance criteria

- [x] SPEC-004 is PostgreSQL 17-compatible and consistent with accepted ADR-005.
- [x] UUIDv7/native `uuid`, static opaque IDs, `timestamptz` and row-version conventions are explicit.
- [x] Opaque string IDs/version values have a one-to-one DB codec that preserves the full accepted
      TypeScript string domain instead of silently introducing a NUL-free/trimmed SQL grammar.
- [x] AccountId/PlayerId identity relationship is concrete and does not invent auth/session semantics.
- [x] Pokémon Instance rows enforce owner, Level `1..200`, IV `0..31`, stable Species identity
      and OCC without persisting derived combat stats as truth.
- [x] Team membership enforces same-player ownership through relational FKs while leaving ordering,
      cardinality, duplicates and cross-Team reuse to TASK-019.
- [x] Inventory v1 establishes an aggregate/concurrency root without deciding TASK-022 item semantics.
- [x] Hunt checkpoint foundation pins codec/data/rules identity, exact safe-integer logical time,
      binary state and
      row-version conflict semantics without inventing a canonical HuntId.
- [x] Long/offline stale computation cannot silently overwrite newer authoritative state.
- [x] Reward/audit foundations do not steal TASK-018/023 semantics.
- [x] No broad cascade-delete policy, auth schema, public protocol or product rule is silently added.
- [x] Mutable Pokémon rows do not pin current gameplay interpretation to their creation-era
      `gameDataVersion`; operation/Battle/checkpoint context owns historical/static interpretation.
- [x] No production source, SQL migration, package manifest, dependency, lockfile or runtime config
      changes in this Class A specification task.
- [x] Lead Developer feasibility review has no unresolved blocker.
- [x] Independent QA has no unresolved P0/P1 findings.
- [x] Independent Auditor has no unresolved P0/P1 concurrency/migration-integrity findings.
- [x] Human Owner explicitly accepts SPEC-004 before TASK-014 may implement this schema.

## Validation / review

During DRAFT/approval preparation:

```text
corepack pnpm roadmap:generate
corepack pnpm roadmap:check
git diff --check
```

Also verify:

- complete diff is limited to SPEC-004, TASK-013 and roadmap planning artifacts;
- `packages/**`, `apps/**`, manifests, lockfile and SQL migration directories remain unchanged;
- accepted SPEC-001/002/003 and ADR-005 boundaries are preserved;
- every table/column that touches a deferred product rule is either safely permissive or deferred;
- composite ownership FKs cannot attach another player's Pokémon to a Team;
- no migration/destructive operation is executed.

Current acceptance result:

- Lead Developer feasibility re-review: P0/P1/P2/P3 = 0/0/0/0 — READY;
- independent QA exact-snapshot re-review: P0/P1/P2/P3 = 0/0/0/0 — READY;
- Independent Auditor exact-snapshot review: P0/P1/P2/P3 = 0/0/0/0 — PASS;
- `corepack pnpm roadmap:check`: PASS — 87 tasks;
- `git diff --check`: PASS;
- production/migration scope diff (`packages/**`, `apps/**`, manifests, lockfile): empty;
- Human Owner accepted and approved SPEC-004 on 2026-09-16;
- Human Owner authorized repository completion/history on 2026-09-16.

## Dependencies

- TASK-005 — Core Domain Type Skeleton: DONE.
- TASK-006 — Static Game Data Schema & Rules Versioning: DONE.
- TASK-012 — ADR-005 Persistence & Data Access Strategy: DONE.
- SPEC-001/002/003: APPROVED.
- ADR-005: ACCEPTED.

## Risks / irreversible actions

- Over-constraining Team/inventory/progression before their Class A rule specs would freeze guessed
  product semantics into the database.
- Under-constraining ownership would leave cross-player integrity to application code and create
  avoidable authorization/integrity risk.
- Persisting derived combat stats as truth would duplicate versioned deterministic rule outputs.
- Treating the binary checkpoint payload as an unversioned general entity store would bypass relational
  integrity and SPEC-002/ADR-004 version contracts.
- Broad cascade deletion would pre-empt account deletion/recovery/privacy semantics.
- Repository completion/history for TASK-013 was explicitly authorized by the Human Owner.

## Expected files / boundaries

```text
docs/specs/SPEC-004-postgresql-schema-v1.md
tasks/done/TASK-013-postgresql-schema-v1.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

No production package, migration SQL, manifest, dependency, lockfile or runtime configuration change
is authorized by TASK-013.

## Completion

Lead Developer feasibility, independent QA and the migration/concurrency-sensitive Independent
Auditor review are clear. Human Owner accepted and approved SPEC-004 on 2026-09-16 and subsequently
authorized repository completion/history. TASK-013 is complete; TASK-014 may now implement the
approved persistence schema through migrations/adapters.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
