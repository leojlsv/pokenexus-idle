# TASK-001 — Project Foundation

## Metadata

- State: ACCEPTANCE
- Class: B
- Owner: Lead Developer
- Owner execution surface: Claude implementation session (historical)
- Reviewer: QA Reviewer
- Reviewer execution surface: ChatGPT worker (independent)
- Auditor: N/A
- Auditor execution surface: N/A
- Spec: N/A
- ADR:
  - `docs/decisions/ADR-001-runtime-and-language.md`
  - `docs/decisions/ADR-002-solo-hunts.md`
  - `docs/decisions/ADR-003-hub-and-duo-realtime.md`
- Branch: `chore/TASK-001-project-foundation-clean`
- Worktree: `.worktrees/TASK-001-project-foundation-clean`

## Objective

Transform the current scaffold into a working TypeScript monorepo with a minimal, validated foundation for web, API, realtime and shared packages.

The task establishes tooling and package boundaries only.

Do not implement gameplay.

## Context

PokeNexus will use:

- TypeScript across the stack;
- React + Vite for the web application;
- PixiJS for realtime 2D rendering where needed;
- Hono + Cloudflare Workers for HTTP API;
- Durable Objects for realtime HUB / Duo coordination;
- pnpm workspaces;
- Node.js 24 LTS;
- Vitest for tests.

The repository already contains architecture, governance and agent policies.

All implementation must follow:

- `AGENTS.md`
- `docs/agents/`
- `docs/engineering/`
- accepted ADRs

## Scope

### Workspace

- configure pnpm workspace correctly;
- define package-level `package.json` files;
- declare Node.js 24 LTS as the repository runtime baseline;
- define shared TypeScript configuration;
- ensure workspace package imports resolve correctly;
- maintain strict TypeScript.

### `apps/web`

Create a minimal React + Vite application.

Requirements:

- TypeScript;
- React;
- Vite;
- PixiJS installed and importable;
- minimal application shell;
- no gameplay UI;
- no HUB/map implementation.

### `apps/api`

Create a minimal Cloudflare Worker using Hono.

Requirements:

- TypeScript;
- Hono;
- Wrangler configuration;
- minimal application entrypoint;
- no gameplay endpoints;
- no authentication;
- no database integration.

### `apps/realtime`

Create the minimal realtime application/runtime structure.

Requirements:

- TypeScript;
- Cloudflare Durable Objects-compatible structure;
- placeholder room/object structure sufficient to typecheck/build;
- no functional HUB;
- no WebSocket protocol implementation;
- no Duo Hunt logic.

### Shared packages

Prepare:

- `packages/game-core`
- `packages/game-data`
- `packages/game-protocol`
- `packages/game-types`
- `packages/database`

Requirements:

- valid package manifests;
- valid TypeScript entrypoints;
- exports configured;
- no real domain implementation yet.

### Tooling

Configure:

- ESLint;
- Prettier;
- Vitest;
- TypeScript typecheck;
- workspace build;
- root scripts.

Required root commands:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

All four commands must run successfully.

### CI

Create a minimal GitHub Actions CI workflow that runs:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Use the repository's declared Node and pnpm versions.

## Out of scope

Do not implement:

- Pokémon data;
- battle logic;
- RNG/game simulation;
- Hunts;
- HUB;
- WebSocket message protocol;
- player movement;
- Duo Hunt;
- authentication;
- PostgreSQL;
- ORM;
- database schema;
- migrations;
- R2;
- economy;
- inventory;
- progression;
- game assets;
- admin panel.

Do not create speculative abstractions for future systems.

## Acceptance criteria

- [x] `pnpm install` completes successfully.
- [x] workspace packages are recognized by pnpm.
- [x] repository runtime is explicitly declared as Node.js 24 LTS.
- [x] `apps/web` starts with Vite.
- [x] `apps/web` compiles with React + TypeScript.
- [x] PixiJS can be imported without configuration/type errors.
- [x] `apps/api` builds as a Cloudflare Worker using Hono.
- [x] `apps/realtime` has a valid Durable Objects-compatible foundation.
- [x] all shared packages expose valid TypeScript entrypoints.
- [x] `pnpm lint` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm test` passes.
- [x] `pnpm build` passes.
- [x] GitHub Actions workflow reflects the same validation pipeline.
- [x] no gameplay/business logic was introduced.
- [x] no database dependency was introduced.
- [x] no unrelated refactor occurred.
- [x] no inline changelog/history was added.
- [x] no ad-hoc implementation/progress/report files were created.
- [x] no debug/dead/commented-out code remains.

## Validation / tests

Run and report exact results for:

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Also perform a minimal local startup validation for:

```text
apps/web
apps/api
```

Do not claim runtime validation for components that were not actually started.

Validated on the rebased branch:

- `pnpm install --frozen-lockfile` → PASS (9 workspace projects recognized);
- `pnpm lint` → PASS;
- `pnpm typecheck` → PASS;
- `pnpm test` → PASS (8 test files, 9 tests);
- `pnpm build` → PASS; Wrangler 3.114.17 emits the recorded v4 upgrade warning only;
- `apps/web` local startup → HTTP 200 at Vite dev server;
- `apps/api` local startup → HTTP 200 with `PokeNexus API`.
- QA Reviewer → PASS WITH P2; Wrangler 4 remains the explicit non-blocking deferral.

## Dependencies

- Governance v4 applied.
- Baseline repository committed.
- Node.js installed.
- pnpm available through Corepack or explicitly installed.

## Risks / irreversible actions

- Adding dependencies modifies the lockfile and manifests.
- No destructive operations are expected.
- No database/infrastructure provisioning is allowed in this task.
- P2 deferral: Wrangler 3.114.17 reports an available Wrangler 4 upgrade, but the current API/realtime dry-run builds and API local startup pass. The major upgrade is deferred to a dedicated follow-up task so dependency/runtime compatibility can be reviewed independently from the project foundation.

## Expected files / boundaries

Expected changes may include:

```text
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
tsconfig.base.json

apps/web/**
apps/api/**
apps/realtime/**

packages/game-core/**
packages/game-data/**
packages/game-protocol/**
packages/game-types/**
packages/database/**

.github/workflows/**

eslint.config.*
prettier.config.*
```

Do not modify architecture/governance documents unless the implementation is blocked by a real inconsistency.

If that happens, stop and use the escalation handoff.

## Completion

Use `docs/agents/handoff-protocol.md`.

Do not create:

```text
IMPLEMENTATION_SUMMARY.md
PROGRESS.md
STATUS.md
CHANGELOG.md
```

or equivalent completion/history files.
