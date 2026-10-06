# Pre-alpha Local Test — Operator Runbook

## Purpose

This runbook starts the **local-only** first Pre-alpha operator environment for one or two isolated accounts/ALTs. It is a validation surface, not a deployment path.

Current readiness is intentionally split:

- **M0 infrastructure:** local PostgreSQL, canonical migrations, immutable game-data delivery, fixture sessions, Player isolation and local web/API processes can be validated here.
- **M1 gameplay:** **BLOCKED** until the Human/content authority supplies the exact two compatible Genetic Profiles for each current Pre-alpha starter/Wild Species. The repository contains the Genetic v2 mechanics, but does not contain those authored Species→Profile pairs.

The local tooling must never invent those pairs. Synthetic pairs used by unit/integration tests are test evidence only and are not Pre-alpha gameplay authority.

## Authority boundaries

This runbook does **not** authorize or perform:

- production migrations or production database access;
- Cloudflare/Pages/Worker deployment, tunnels or public URLs;
- public CombatPresentation enablement;
- eligible-Moves or Move-editor authority;
- TASK-120 / SPEC-025 or TASK-121 / SPEC-026 implementation;
- a public starter-selection/bootstrap endpoint or UI;
- new gameplay, economy, Genetics or content semantics.

TASK-100 remains ACTIVE. TASK-120 and TASK-121 remain DRAFT Class-A.

## Prerequisites

- Windows PowerShell 5.1+.
- Node.js / Corepack matching the repository.
- Docker Desktop with the Linux engine running.
- Existing repository dependencies available (`pnpm` workspace already installed).
- Ports available:
  - PostgreSQL: `127.0.0.1:55432`
  - API: `127.0.0.1:8787`
  - immutable game-data: `127.0.0.1:8788`
  - ALT A web: `127.0.0.1:5173`
  - ALT B web: `127.0.0.1:5174`

All local database mutations are constrained to the owned Docker container/volume carrying `pokenexus.scope=prealpha-local`. The scripts refuse an unmanaged container or volume with the same name.

## Operator flow

Run commands from the repository/worktree root.

### 1. Doctor

```powershell
corepack pnpm local:prealpha:doctor
```

Expected: Node/Corepack/Docker are available, immutable v5 is present, and the current gameplay authority blocker is explicit.

### 2. Fresh local database

```powershell
corepack pnpm local:prealpha:reset
```

This stops only tracked local app PIDs, deletes only the project-owned local Pre-alpha PostgreSQL container/volume, recreates PostgreSQL 17 on loopback, runs the canonical migrations, and seeds two deterministic **identity + Player** fixtures only.

It deliberately does **not** fabricate starter Pokémon, Teams or 50/20/5 Inventory. Those must be created by the real TASK-109 bootstrap once its required accepted Genetic Profile authority exists.

### 3. Start local infrastructure

Two ALTs (default):

```powershell
corepack pnpm local:prealpha:start
```

- ALT A: `http://localhost:5173`
- ALT B: `http://localhost:5174`

One Player:

```powershell
corepack pnpm local:prealpha:start-one
```

The Vite instance(s) inject local-only fixture bearer values only while proxying `/auth` and `/player`. No bearer is written into browser storage and no production authentication bypass is added to `apps/api/src/index.ts`.

### 4. Status

```powershell
corepack pnpm local:prealpha:status
```

The output identifies owned PostgreSQL state, local process IDs/URLs and the explicit gameplay-bootstrap blocker.

### 5. Infrastructure smoke

```powershell
corepack pnpm local:prealpha:smoke
```

A green infrastructure smoke proves immutable schema-5 delivery, local session A, Player A identity, the accepted Hunt catalog, and—when two Players are started—ALT B isolation with a distinct Player ID.

The smoke must still end with an explicit **gameplay BLOCKED** statement until authentic Genetic Profile pairs exist. Synthetic Hunt/Starter fixtures are not an acceptable substitute.

### 6. Stop

```powershell
corepack pnpm local:prealpha:stop
```

This stops tracked local processes and the owned PostgreSQL container. The local volume is preserved for inspection. Use `local:prealpha:reset` for a fresh database.

## Diagnostics

The local-only API entry exposes:

```text
GET http://127.0.0.1:8787/__local-prealpha/diagnostics
```

It reports only local catalog authority status plus the known Genetic Profile blocker. This route does not exist in the production API entry.

If smoke fails, run Status and this diagnostics endpoint before changing configuration. Never replace a missing gameplay/content authority with a fixture unless the purpose is explicitly a synthetic automated test rather than genuine Pre-alpha gameplay.

## Current hard blocker for genuine M1

The accepted Genetic model states that each Species/form authors exactly two compatible Profiles from `Harmony / Might / Clarity / Endurance / Resilience`, selected 50/50 for a new instance.

Current integrated bytes contain no accepted mapping for:

- starters: Bulbasaur, Charmander, Squirtle, Chikorita, Cyndaquil, Totodile;
- Wilds: Pidgey, Rattata, Caterpie, Sentret, Ledyba, Sunkern.

The runtime therefore correctly fails closed. Choosing pairs based on type/base stats or copying test fixtures would be a new content/balance decision.

Once the Human/content authority accepts the exact pairs, Class-B implementation may serialize the accepted v5 + `combat-rules-genetics-v2` rows into the existing versioned Genetic Profile authority, feed the same mapping to TASK-109 trusted bootstrap, and run the genuine starter → Team → Inventory → Wilds flow here.

## Gates that remain separate

The following remain outside the initial local infrastructure gate and are not inferred approved by a green M0 environment:

- TASK-100 eligible-Moves / full Move editor;
- TASK-120 durable terminal/offline summary;
- TASK-121 historical manual-capture compatibility;
- TASK-103 public CombatPresentation feed;
- production infrastructure, migrations and deployment.
