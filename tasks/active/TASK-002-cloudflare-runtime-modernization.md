# TASK-002 — Cloudflare Runtime Modernization

## Metadata

- State: ACCEPTANCE
- Class: B
- Owner: Lead Developer
- Owner execution surface: DEFAULT
- Reviewer: QA Reviewer
- Reviewer execution surface: DEFAULT
- Auditor: N/A
- Auditor execution surface: N/A
- Spec: N/A
- ADR:
  - `docs/decisions/ADR-001-runtime-and-language.md`
  - `docs/decisions/ADR-003-hub-and-duo-realtime.md`
- Branch: `chore/TASK-002-cloudflare-runtime-modernization`
- Worktree: `.worktrees/TASK-002-cloudflare-runtime-modernization`

## Objective

Modernize the Cloudflare development runtime established by TASK-001 before additional API or realtime features are built.

Upgrade Wrangler from major version 3 to the current approved major version 4 and move the placeholder Durable Object class lifecycle from legacy `migrations` configuration to declarative `exports`, while preserving all existing application behavior and architecture boundaries.

## Context

TASK-001 intentionally deferred the Wrangler 3 -> 4 major upgrade as a P2 because the foundation was otherwise valid.

The repository now has a stable baseline, so this dependency migration should be completed as an isolated task before API/realtime feature work grows around the older configuration.

Current Cloudflare guidance prefers declarative `exports` for new Workers. The existing `Room` Durable Object already uses SQLite-backed storage semantics and must remain SQLite-backed.

## Scope

### Wrangler

- upgrade `wrangler` in `apps/api` and `apps/realtime` to Wrangler 4.131.1 or the package-manager-equivalent current 4.x resolution selected by the implementation;
- update `pnpm-lock.yaml` intentionally;
- do not upgrade unrelated dependencies.

### Realtime Durable Object configuration

- preserve binding name `ROOM` and class name `Room`;
- replace legacy `[[migrations]]` lifecycle configuration with declarative `[exports.Room]` configuration;
- declare the Durable Object storage backend as SQLite;
- preserve existing placeholder runtime behavior;
- do not add HUB, WebSocket, movement, presence or Duo Hunt behavior.

### API

- preserve current API behavior and Wrangler configuration semantics;
- make only changes required for Wrangler 4 compatibility.

## Out of scope

- Cloudflare deployment or remote resource provisioning;
- changing realtime topology;
- changing public API/protocol semantics;
- authentication/authorization;
- database integration, schema or migrations;
- HUB or Duo Hunt implementation;
- gameplay/domain logic;
- compatibility-date changes unless strictly required for Wrangler 4 compatibility;
- unrelated dependency upgrades;
- application refactors unrelated to the runtime migration.

## Acceptance criteria

- [x] `apps/api` uses Wrangler 4.
- [x] `apps/realtime` uses Wrangler 4.
- [x] lockfile reflects only intentional dependency-resolution changes.
- [x] realtime Durable Object lifecycle uses declarative `exports` rather than legacy `migrations`.
- [x] `Room` remains SQLite-backed.
- [x] `ROOM` binding still targets `Room`.
- [x] API behavior remains unchanged.
- [x] realtime placeholder behavior remains unchanged.
- [x] no gameplay, protocol, database or topology behavior is introduced.
- [x] no unrelated dependency upgrade/refactor is introduced.
- [x] `pnpm install --frozen-lockfile` passes after the lockfile is updated.
- [x] `pnpm lint` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm test` passes.
- [x] `pnpm build` passes without the Wrangler 3 outdated-version warning.
- [x] API local startup returns HTTP 200 with `PokeNexus API`.
- [x] realtime local startup returns HTTP 200 with the existing placeholder response.
- [x] no remote deployment/provisioning is performed.

## Validation / tests

Run and report exact results for:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Also validate:

```text
apps/api local startup -> HTTP 200
apps/realtime local startup -> HTTP 200
```

Inspect the complete `main...HEAD` diff and confirm no changes outside the declared scope.

Validated on the current working tree:

- `pnpm install --frozen-lockfile` → PASS (9 workspace projects);
- `pnpm lint` → PASS;
- `pnpm typecheck` → PASS;
- `pnpm test` → PASS (8 files, 9 tests);
- `pnpm build` → PASS with Wrangler 4.131.1 in API/realtime and no Wrangler 3 warning;
- API local startup → HTTP 200 with `PokeNexus API`;
- realtime local startup → HTTP 200 with `PokeNexus realtime placeholder`;
- `git diff --check` → PASS;
- QA Reviewer → PASS, no P0/P1/P2/P3 findings.

## Dependencies

- TASK-000 — Agent Governance Baseline: DONE.
- TASK-001 — Project Foundation: DONE.

## Risks / irreversible actions

- Dependency major upgrade can change Wrangler CLI/config validation behavior.
- `exports` and legacy `migrations` are mutually exclusive Cloudflare Durable Object lifecycle models.
- This task must not deploy remotely; no irreversible namespace change is authorized.

## Expected files / boundaries

Expected changes are limited to:

```text
apps/api/package.json
apps/realtime/package.json
apps/realtime/wrangler.toml
pnpm-lock.yaml
```

Additional files require a demonstrated Wrangler 4 compatibility need and must remain inside TASK-002 scope.

## Completion

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
