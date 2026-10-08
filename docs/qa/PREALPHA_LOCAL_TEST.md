# Pre-alpha Local Test — Operator Runbook

## Purpose

This runbook starts the **local-only** first Pre-alpha operator environment for one or two isolated accounts/ALTs. It is a validation surface, not a deployment path.

For access, screen-by-screen manual tests, expected outcomes and failure reporting in Portuguese, use the [Pre-alpha player guide](PREALPHA_PLAYER_GUIDE.md). Existing test accounts do not require Reset or Bootstrap for normal access.

Current readiness is intentionally split:

- **M0 infrastructure:** local PostgreSQL, canonical migrations, immutable game-data delivery, fixture sessions, Player isolation, local web/API processes, individualization authority and the accepted Hunt item/capture/runtime bindings are wired and locally validated.
- **M0→M1 authority preflight:** the local entry derives the exact six accepted starters plus the six Species actually referenced by immutable Wilds v5 content, validates any supplied Genetic Profile release through the existing runtime parser, verifies the real Wilds prestart preview and reports per-Species readiness. The trusted TASK-109 bootstrap service is wired to the same authority and remains non-public.
- **M1 gameplay entry:** the prior Genetic Profile blocker is resolved for this Pre-alpha. On 2026-10-07 the Human Owner authorized any random pair of two distinct accepted Profiles per required Species; one one-time selection was materialized and frozen. Real Start → bootstrap/conversion → Team/Inventory verification → Wilds Hunt Start has passed locally, and one real B victory has now completed reward/XP exactly once and continued the same Hunt. This is evidence for the core loop, not full Human M1 acceptance.

Outside this explicit Human authorization, the local tooling must never invent or derive pairs. Synthetic pairs used by unit/integration tests remain test evidence only and are not Pre-alpha gameplay authority.

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

All local database mutations are constrained to the owned Docker container/volume carrying `pokenexus.scope=prealpha-local`. The launcher verifies the named volume and exclusive loopback port before database use. Bootstrap uses the database port recorded by Start, not an unrelated default port. Fixture accounts must resolve to their exact expected Player IDs before Bootstrap can mutate anything.

Maintenance state is resolved from the shared Git directory, so main and linked worktrees use the same private directory. A shared Git exclude rule protects the existing local authority before lifecycle operations; the canonical approved Genetic JSON remains versioned separately. Start, Stop, Reset and Bootstrap take an exclusive operation lock. State publication is atomic; invalid Genetic inputs are rejected before database effects. The local identity seed also installs the TASK-122-only bootstrap-Team historical-reference compatibility guard: bootstrap creation/rebinding must still point at an existing owned Team, but later deletion of that saved Team is allowed while the original `player_bootstraps.team_id` remains historical provenance. This is intentionally local-only and is **not** a production migration.

## Operator flow

Run commands from the candidate worktree root. Until the TASK-122 follow-up is integrated, use `G:\pokenexus-idle\.worktrees\TASK-122-local-prealpha-environment-runbook`, not an older main checkout. Check Status first on a prepared environment. Doctor expects free ports; Reset is an explicitly destructive fresh-database operation, not a prerequisite for ordinary Start or recovery.

### 1. Doctor

```powershell
corepack pnpm local:prealpha:doctor
```

Expected: Node/Corepack/Docker are available and immutable v5 is present. Without `-GeneticProfilesPath`, the missing-authority blocker remains explicit; with an authority path, Doctor validates JSON syntax and Start performs the authoritative schema/coverage check.

### 2. Optional fresh local database — deletes test progress

```powershell
corepack pnpm local:prealpha:reset
```

This stops only tracked local app PIDs, deletes only the project-owned local Pre-alpha PostgreSQL container/volume, recreates PostgreSQL 17 on loopback, runs the canonical migrations, and seeds two deterministic **identity + Player** fixtures only.

It deliberately does **not** fabricate starter Pokémon, Teams or 50/20/5 Inventory. Those must be created by the real TASK-109 bootstrap once its required accepted Genetic Profile authority exists.

Reset discards the local individualization secret together with the disposable database and creates a replacement authority before recreating the database. Ordinary Stop/Start preserves the same authority. A missing or corrupt authority while the database is preserved blocks Start: restore the original private key. Never regenerate a key against preserved Pokémon/Hunt data. Reset intentionally discards test progress and is not a recovery procedure.

Start and Bootstrap also compare the supplied authority version/key identity with existing Pokémon and Hunt input authority records in a read-only transaction. A different valid key is rejected before migration/seed or gameplay mutation. A legacy v2 state without a saved PostgreSQL port is read without rewriting it: the port is derived only from the verified owned container and volume.

### 3. Start local infrastructure

Two ALTs (default):

```powershell
powershell -NoProfile -File scripts/local-prealpha.ps1 -Action Start -Players 2 -GeneticProfilesPath docs/qa/PREALPHA_GENETIC_PROFILE_RELEASES.json
```

- ALT A: `http://localhost:5173`
- ALT B: `http://localhost:5174`

One Player:

```powershell
powershell -NoProfile -File scripts/local-prealpha.ps1 -Action Start -Players 1 -GeneticProfilesPath docs/qa/PREALPHA_GENETIC_PROFILE_RELEASES.json
```

The Vite instance(s) inject local-only fixture bearer values only while proxying `/auth` and `/player`. No bearer is written into browser storage and no production authentication bypass is added to `apps/api/src/index.ts`.

The bare `local:prealpha:start` / `start-one` aliases do not supply Genetic authority. Without `-GeneticProfilesPath`, Start is an infrastructure-only check and intentionally blocks genuine gameplay. The commands above explicitly supply the frozen Human-approved `HUNT_GENETIC_PROFILE_RELEASES` artifact at `docs/qa/PREALPHA_GENETIC_PROFILE_RELEASES.json`.

The launcher does not fill, infer or rewrite content values. It syntax-validates the supplied JSON, requires its trimmed-text SHA-256 to match the frozen Human-approved artifact/digest, and only then transports it into the existing runtime authority. A later Stop/Start cannot substitute a different valid 12-pair mapping without changing the reviewed Human-approved artifact and digest.

### 4. Status

```powershell
corepack pnpm local:prealpha:status
```

The output identifies owned PostgreSQL state, local process IDs/URLs and gameplay-bootstrap readiness or its explicit blocker.

### 5. Infrastructure smoke

```powershell
corepack pnpm local:prealpha:smoke
```

A green infrastructure smoke proves immutable schema-5 delivery, local session A, Player A identity, the accepted Hunt catalog, the real six-Species Wilds prestart preview and—when two Players are started—ALT B isolation with a distinct Player ID.

Without an approved Genetic authority, the smoke still ends with an explicit **gameplay BLOCKED** statement. With the 2026-10-07 approved Pre-alpha authority, it reports Genetic Profile preflight READY and the trusted bootstrap/Hunt path is available.

### 6. Trusted bootstrap after authority approval

There is no starter/bootstrap HTTP endpoint. Once Start diagnostics report Genetic Profile status ready, invoke the already-integrated TASK-109 application service through the local operator harness:

    powershell -NoProfile -File scripts/local-prealpha.ps1 -Action Bootstrap -GeneticProfilesPath docs/qa/PREALPHA_GENETIC_PROFILE_RELEASES.json -StarterA <accepted-starter-species-id> -StarterB <accepted-starter-species-id>

For a one-Player stack, omit StarterB. StarterA / StarterB are normal test-player choices among the already-approved six starters; they are not new project/content decisions.

Bootstrap refuses to run unless the running Start preflight resolved all 12 required Species, the supplied Genetic Profile JSON hashes to the same authority already preflighted by Start, the live diagnostics report that same digest and individualization key identity, and fixture sessions identify the expected Players. State URLs must match their recorded loopback ports. Local database connection strings cannot override targets with query parameters; the internal local Hyperdrive proxy permits only its `sslmode=disable` transport option.

For a new Player, the atomic TASK-109 repository creates exactly one **Lv.5 starter with 124 cumulative Pokémon XP and full derived HP**, one one-member Team with that starter as Leader, durable vitality/Hunt root and Inventory 50 Poké Balls / 20 basic Potions / 5 Revive-25, under [APPROVED SPEC-027](../specs/SPEC-027-starter-level-five-bootstrap-amendment.md). Player Level/XP stay 1/0. The current creation authority is `player-bootstrap-prealpha-v2`, hash `sha256:a8ed10eaa73f4105da2c08a62d69df823983bbc6640a1121b2fc6195798304ae`; selected Moves follow the existing executable/level-available-through-5 bootstrap order. The output reports the content version/hash actually returned.

Repeating the same Player/starter returns its existing record, including a historical `player-bootstrap-prealpha-v1` record, without promoting or healing the Pokémon, replacing its Moves/Genetics, resetting a Hunt or regranting Inventory. Existing A/B accounts therefore do not become Level 5 through reload, Stop/Start or Bootstrap replay. Preserve historical evidence; account conversion requires its own explicit local operation. A conflicting starter/state remains fail-closed. As before, the application loads current authorities before reaching repository replay, so unavailable catalog/profile authority can block that replay.

The approved A/B conversion is a separate completed operation under SPEC-027 §6. Both existing starters were moved to Level5/XP124 with full20HP at conversion, retaining v1 birth provenance. Inventory immediately after conversion remained A50/18/5 and B50/20/5, with the original IDs, Genetics, Teams and Hunt history. Later gameplay may legitimately change HP/XP/items; the detailed before/after and current-state evidence belongs to TASK-122 and the player guide.

The one-time operator is `scripts/local-prealpha-starter-conversion.ps1` with Plan/Apply/Check stages. It requires the application stack stopped, the verified owned database running, the shared exclusive lifecycle lock and a private create-only plan. Apply additionally requires the exact reviewed plan SHA-256, unchanged source hashes and explicit confirmation; it is not an ordinary access or recovery command. The original plan/receipt remain in the ignored shared `.maintenance/prealpha-local/` directory. Exact replay performs no writes; subsequent gameplay drift is rejected. Never regenerate a plan or use Reset to bypass drift.

The ordinary TASK-109 `Bootstrap` action remains per-Player and does not turn a multi-Player bootstrap invocation into one cross-account transaction. The separate SPEC-027 A/B **conversion** operator is deliberately different: the reviewed frozen plan converts the two exact existing starters in one A+B transaction, so a late B failure rolls A back as well. Its exact-plan replay performs no writes and later gameplay drift blocks reapplication. Do not Reset, regenerate the plan or switch starters to recover conversion drift.

### 7. Stop

```powershell
corepack pnpm local:prealpha:stop
```

This stops tracked local processes and the owned PostgreSQL container. The local volume is preserved for inspection. Use `local:prealpha:reset` for a fresh database.

## Diagnostics

The local-only API entry exposes:

```text
GET http://127.0.0.1:8787/__local-prealpha/diagnostics
```

It reports the exact local catalog pin, the real Wilds prestart preview identity/six possible Species, persisted individualization authority identity and Genetic Profile preflight/digest for the 12 required Species. It never returns the individualization secret or raw Profile-pair authority. This route does not exist in the production API entry.

Run `corepack pnpm local:prealpha:test` for isolated launcher integrity regressions. These tests use temporary files and mocked services; they do not stop, reset or mutate the running Pre-alpha database. Use the TASK-041 disposable harness for combat/offline/replay coverage. Passing those checks does not establish full M1 gameplay or production readiness.

If smoke fails, run Status and this diagnostics endpoint before changing configuration. Never replace a missing gameplay/content authority with a fixture unless the purpose is explicitly a synthetic automated test rather than genuine Pre-alpha gameplay.

## Human-approved Pre-alpha Genetic Profile authority — 2026-10-07

The accepted Genetic model states that each Species/form authors exactly two **distinct** compatible Profiles from `Harmony / Might / Clarity / Endurance / Resilience`, selected 50/50 for a new instance.

The Human Owner authorized a one-time random choice of any two distinct accepted Profiles for each required Species for this Pre-alpha. The resulting frozen local authority is materialized at `docs/qa/PREALPHA_GENETIC_PROFILE_RELEASES.json` and pinned by the launcher to trimmed-text SHA-256 `0d5e94600dc98335d85ea586586b9b73eb5ea7576f5fea26eb2e5bed23996b61`:

| Role | Species | Exact Species ID | Approved Pre-alpha pair |
|---|---|---|---|
| Starter | Bulbasaur | `candidate:species:pokedex-bulbasaur-1:91b07648a3` | Resilience + Harmony |
| Starter | Charmander | `candidate:species:pokedex-charmander-4:76e12e8c3b` | Clarity + Resilience |
| Starter | Chikorita | `candidate:species:pokedex-chikorita-152:24bd4cdb1d` | Clarity + Resilience |
| Starter | Cyndaquil | `candidate:species:pokedex-cyndaquil-155:f879aca845` | Harmony + Resilience |
| Starter | Squirtle | `candidate:species:pokedex-squirtle-7:6f5ada4df3` | Might + Harmony |
| Starter | Totodile | `candidate:species:pokedex-totodile-158:f3d3f9a1f7` | Might + Clarity |
| Wild | Caterpie | `candidate:species:pokedex-caterpie-10:f77ea3bb04` | Clarity + Resilience |
| Wild | Ledyba | `candidate:species:pokedex-ledyba-165:092570add7` | Clarity + Might |
| Wild | Pidgey | `candidate:species:pokedex-pidgey-16:8e97efe736` | Harmony + Clarity |
| Wild | Rattata | `candidate:species:pokedex-rattata-19:9975b0175c` | Endurance + Clarity |
| Wild | Sentret | `candidate:species:pokedex-sentret-161:fa09afb6e0` | Might + Harmony |
| Wild | Sunkern | `candidate:species:pokedex-sunkern-191:8f850eef0e` | Resilience + Harmony |

These pairs were not derived from type, stats or fixtures. They exist only because the Human Owner explicitly delegated this Pre-alpha choice to a random selection. Other releases still require their own authority.

No additional gameplay/product contract was needed. The initial pre-conversion execution evidence was:

1. the 12 rows were materialized in the existing release shape pinned to `game-data-core-kanto-johto-v5` + `combat-rules-management-first-v1`;
2. Start with `-GeneticProfilesPath` reported 12/12 Genetic decisions, individualization `ready` and Wilds preview `ready` with all six possible Species;
3. trusted TASK-109 Bootstrap PASS created ALT A Bulbasaur and ALT B Cyndaquil without a public bootstrap endpoint;
4. before the separately authorized SPEC-027 §6 conversion, ALT A reads verified Lv.1 Bulbasaur → one Team → Inventory `50 Poké Balls / 20 basic Potions / 5 Revive-25`;
5. authenticated `hunt:verdant-edge:wilds` Start PASS created an active Hunt using that Team, with Sentret Lv.2 as the first Encounter;
6. the later Human-authorized SPEC-027 conversion moved the preserved A/B starters to Lv.5/XP124 without Reset/regrant/reroll/history rewrite;
7. a real B Wilds victory at logical time8000 completed exactly one reward (+18 Cyndaquil XP, +6 Player XP, no item drop), then the same saved checkpoint command continued to logical time15521 and Encounter 2;
8. replaying that exact saved idempotency key returned HTTP200 without creating a second reward resolution or Completion; a later normal return/claim ended the Hunt at logical time16000, while current Inventory remains 50/20/5;
9. the required RewardApplication compatibility correction is bounded to already-supported runtime v2/v3/v4 persistent-vitality semantics, with future runtime schemas fail-closed; focused reward PostgreSQL 18/18 and two independent bounded re-gates are green.
10. a later real two-member B Start exposed a separate captured-Ability admission mismatch: durable Chlorophyll was copied into Battle while current production Ability policy marks all Abilities inactive. The corrected runtime omits only inactive-by-policy Abilities from Battle input, preserving the Pokémon's durable Ability selection; unsupported Ability remains fail-closed. Focused runtime/admission 21/21 and web correlation 4/4 are green. A fresh Human two-member Start remains the live acceptance step.

That pre-conversion evidence remains historical proof that the bootstrap/Hunt path worked. Exact-current state after the real B Hunt is A Bulbasaur Lv5/XP124/HP20 with Inventory50/18/5 and B Cyndaquil Lv5/XP142/HP0 with Inventory50/20/5; both original identities, IVs, Genetics and Teams remain. One real combat→reward→XP→continued-Hunt path is therefore verified. Capture success/consumption, enabled Potion/Revive automation, the 8-hour offline ceiling, broader session coverage and final Human M1 acceptance remain separate validation work. Any failure remains runtime/test evidence to investigate; it is not authority to invent a replacement Genetic pair or open a new public protocol.

## Gates that remain separate

The following remain outside the initial local infrastructure gate and are not inferred approved by a green M0 environment:

- TASK-100 eligible-Moves / full Move editor;
- TASK-120 durable terminal/offline summary;
- TASK-121 historical manual-capture compatibility;
- TASK-103 public CombatPresentation feed;
- production infrastructure, migrations and deployment.
