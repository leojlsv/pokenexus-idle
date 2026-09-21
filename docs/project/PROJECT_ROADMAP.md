# PokeNexus Idle — Project Roadmap & Control Plane

> **Canonical project progress/planning source of truth.**
>
> This file answers: where the project is, what comes next, which role/agent executes each step, which skills are applicable, what depends on what, and where the Human Owner must validate.
>
> **Authority note:** this file does **not** redefine governance. `AGENTS.md`, `docs/agents/**`, accepted ADRs and approved specs remain authoritative for role authority, approval gates and technical/product decisions. If this roadmap conflicts with those sources, those sources win and this roadmap must be corrected.

## 1. Current position

**Project phase:** Foundation, core domain/combat-engine contracts, and the PostgreSQL persistence, identity and security foundation are complete. Canonical static game-data catalog implementation is now explicitly scheduled before reward/content implementation consumes it.

**Current work:** `TASK-022 — Inventory / Item Model Spec` is **DONE** with SPEC-007 **APPROVED** and integrated after Human Owner repository-history authorization. `TASK-092 — SpeciesDefinition Static-Fact Audit & Extension Spec` is also **DONE** and integrated.

**Current action:** TASK-087 — Static Game Data Catalog & Ingestion Implementation is **ACCEPTANCE** with post-promotion independent QA READY `0/0/0/0` and delegated Class B acceptance **ACCEPTED**. Human-approved `game-data-core-kanto-johto-v1` is permanently published and reloaded; the Human Owner authorized repository-history completion on 2026-09-21, and the commit/push/main-integration sequence is now in progress. TASK-023 and TASK-088 remain independently dependency-clear.

**Next task after TASK-003 acceptance:** `TASK-087 — Static Game Data Catalog & Ingestion Implementation`.

**Portfolio status snapshot:**

| Task | Result |
|---|---|
| `TASK-000` Agent Governance Baseline | DONE |
| `TASK-001` Project Foundation | DONE |
| `TASK-002` Cloudflare Runtime Modernization | DONE |
| `TASK-003` Project Control Roadmap | DONE — corrective Node-script ESLint environment cycle QA clear; repository completion authorized |
| `TASK-004` Domain Glossary & Core Model Spec | DONE — independent QA READY; Human Owner accepted |
| `TASK-005` Core Domain Type Skeleton | DONE — QA READY; PM accepted; no semantic drift |
| `TASK-006` Static Game Data Schema & Rules Versioning | DONE — independent QA clear; Human Owner accepted SPEC-002 |
| `TASK-007` ADR-004 Universal Combat Engine Architecture | DONE — ADR-004 accepted; QA/audit clear |
| `TASK-008` Combat Rules Spec v1 | DONE — SPEC-003 approved; QA clear; repository completion authorized |
| `TASK-009` Deterministic Combat Engine v1 | DONE — independent QA clear; PM / Architecture Coordinator accepted exact snapshot; Human Owner sample-result validation complete; repository completion authorized and completed |
| `TASK-010` Combat Fixtures, Replay & Property Harness | DONE — independent QA clear; PM / Architecture Coordinator accepted; repository completion authorized and completed |
| `TASK-011` Combat Performance Baseline | DONE — independent QA clear; PM / Architecture Coordinator accepted; Human Owner accepted budget/publication guidance; repository completion authorized and completed |
| `TASK-012` ADR-005 Persistence & Data Access Strategy | DONE — independent QA/audit clear; Human Owner accepted ADR-005; repository completion authorized and completed |
| `TASK-013` PostgreSQL Schema v1 | DONE — feasibility/QA/audit clear; Human Owner accepted SPEC-004; repository completion authorized and completed |
| `TASK-014` Database Adapter & Migration Foundation | DONE — independent QA clear; PM / Architecture Coordinator accepted; repository completion authorized and completed |
| `TASK-015` ADR-006 Authentication / Authorization / Session Model | DONE — QA + IA clear; Human Owner accepted ADR-006 and authorized repository completion/history on 2026-09-16 |
| `TASK-016` Authentication & Session Implementation | DONE — corrected snapshot QA/IA clear; PM / Architecture Coordinator accepted; Human Owner authorized repository completion/history on 2026-09-16 |
| `TASK-017` Player Profile API & Persistence | DONE — owner validation clear; independent QA P0/P1 clear; PM / Architecture Coordinator accepted; Human Owner authorized repository completion/history on 2026-09-17 |
| `TASK-018` Persistence/Auth Recovery, Contract & Baseline Auditability Suite | DONE — corrected-snapshot QA READY and IA PASS with P0/P1/P2/P3 0/0/0/0; PM / Architecture accepted; Human Owner authorized repository completion/history on 2026-09-17 |
| `TASK-019` Pokémon Instance / Collection / Team Spec | DONE — exact-snapshot QA/IA clear; Human Owner accepted SPEC-005 in full and authorized repository completion/history on 2026-09-17 |
| `TASK-020` Collection & Team Domain/Persistence Implementation | DONE — owner validation clear; QA READY and IA PASS with P0/P1/P2/P3 0/0/0/0; PM / Architecture Coordinator accepted; Human Owner authorized repository completion/history on 2026-09-17 |
| `TASK-021` XP / Level / Progression Rules Spec | DONE — exact-snapshot QA READY and IA PASS with P0/P1/P2/P3 0/0/0/0; Human Owner accepted SPEC-006 in full and authorized repository completion/history on 2026-09-18 |
| `TASK-093` Gameplay Systems & Player Experience Consultant Governance | DONE — independent QA READY, P0/P1/P2/P3 0/0/0/0; Human Owner accepted and authorized repository history; governance integrated on 2026-09-18 |

**Next product milestone:** materialize the canonical Species/Move/Learnset catalog from integrated SPEC-002/SPEC-008, while separately defining reward-ledger integrity and Move acquisition/eligibility; then close production Move/Ability rule-content coverage before public Move-loadout mutation and Solo Hunt production content consume them.

### Portfolio progress

- Planned task IDs in this roadmap: `TASK-000` through `TASK-093`.
- DONE: 25.
- DRAFT: 0.
- READY: 0.
- ACTIVE: 0.
- REVIEW: 0.
- FIX: 0.
- ACCEPTANCE: 1.
- BLOCKED: 0.
- DEFERRED: 0.
- PLANNED: 68.
- Task-count completion: **25 / 94 = 26.6%**.

This percentage is a visibility metric, not a schedule estimate. Tasks are not equally sized and future scope can be split, merged or removed through normal governance.

## 2. Hierarchy and semantics

### Epic

A major product or platform capability that may span multiple stories and tasks. Epics are portfolio-level planning units and do not directly authorize implementation.

### Story

A coherent user/system outcome inside an Epic. A Story groups executable tasks around one result.

### Task

The canonical executable unit of work. A Task follows the repository lifecycle:

```text
DRAFT → READY → ACTIVE → REVIEW → ACCEPTANCE → DONE
                  ↕          ↘ FIX ↗
               BLOCKED
```

Each Task has one implementation owner, one branch and one worktree by preference. `PLANNED` in this roadmap is a **portfolio-only pre-DRAFT state**; before implementation, the task must be materialized in `tasks/active/`, assigned, reviewed for Definition of Ready and moved through the canonical lifecycle.

### Sub-task

A checklist item owned by the parent Task owner. Sub-tasks do **not** create independent authority, branch, worktree or reviewer ownership. If a sub-task needs a different owner, independent implementation branch or separate review boundary, promote it to a Task.

## 3. Human validation policy

The **Human Owner is the final validator** whenever human judgment is required.

Human Owner validation is mandatory for:

1. every Class A ADR/spec before implementation can reach READY;
2. game-rule, progression, reward, economy and balance decisions;
3. user-facing UX/art direction checkpoints marked `HUMAN`;
4. live/in-game validation where automation cannot establish product correctness;
5. release/go-live acceptance;
6. any task the Human Owner explicitly chooses to validate or override.

Human validation supplements automated checks and independent QA; it never replaces them where governance requires QA/audit.

## 4. Canonical roles and execution agents

| Code | Canonical role | Default execution surface / agent | Primary use |
|---|---|---|---|
| `HO` | Human Owner / Final Validator | Human | Final product/architecture authority and mandatory human gates |
| `PM` | PM / Architecture Coordinator | ChatGPT project coordination | Specs, ADR proposals, decomposition, sequencing, acceptance coordination |
| `GSC` | Gameplay Systems Consultant | Fresh ChatGPT advisory worker | Advisory gameplay-loop/system analysis for high-impact product/rule decisions; `RECOMMEND` only |
| `PXE` | Player Experience & Economy Consultant | Fresh ChatGPT advisory worker | Advisory F2P/payer/fairness/economy/monetization analysis; `RECOMMEND` only |
| `LD` | Lead Developer | GitHub Copilot CLI `lead-developer` custom agent | Complex game-core, API, persistence, realtime and integration work |
| `SD` | Secondary Developer | Codex implementation session | Isolated implementation tasks/tests/scripts inside accepted contracts |
| `FE` | Frontend Developer | Claude Code | React, PixiJS, CSS/layout, frontend state and isolated client integration |
| `QA` | QA Reviewer | Fresh independent Codex review session | Read-only merge-gate review |
| `IA` | Independent Auditor | Gemini CLI by default | High-risk security/concurrency/economy/migration/reward-integrity audits |
| `MW` | Mechanical Worker | DeepSeek via Aider | Explicit Class C fixtures/data transforms/mechanical work only |
| `PP` | Local Pair Programmer | Default GitHub Copilot | Local assistance to current owner; no independent authority |

Role authority always comes from `docs/agents/**`, never from model/provider identity.

### Gameplay / player-economy consultation policy

`GSC` and `PXE` are advisory inputs to PM/Human Owner decisions, never implementation owners,
QA reviewers, independent auditors or approvers. A required consultation must be completed and its
material trade-offs recorded before the applicable Human Owner Class A acceptance; consultant
disagreement is surfaced, not treated as a veto. `docs/agents/approval-gates.md` is authoritative
for trigger rules.

- **GSC required:** Class A decisions that materially define core/Idle/offline/session loops,
  progression/meta-progression, acquisition/team-building loops, reward cadence/content longevity,
  PvE/PvP/co-op/social gameplay interactions or explicitly proposed Gacha/randomized acquisition.
- **PXE required:** Class A decisions that materially define currencies, sources/sinks/scarcity/
  fees/value transfer, F2P/payer asymmetry, paid convenience/progression/power, monetization
  pressure, P2W/competitive fairness, or retention/comeback systems with economic consequences.
- **Both required:** one decision crosses both sets, including explicitly proposed Gacha, battle
  pass, premium currency, paid energy/stamina, paid XP/item multipliers, monetized offline caps,
  power-relevant storage/inventory monetization, seasonal progression or paid competitive power.
- Already accepted Class A specs are not reopened solely to obtain retrospective consultant input.
  Later changes to those rules use the new consultation policy normally.

Current planned consultation assignments:

| Planned task | Required consultation before Human gate | Reason |
|---|---|---|
| `TASK-022` Inventory / Item Model Spec | `GSC` + `PXE` | inventory limits, consumables, scarcity and acquisition/use semantics affect loop quality and economy pressure |
| `TASK-033` Solo Hunt Rules/Lifecycle | `GSC` + `PXE` | core Idle/PvE cadence, rewards, offline/claim behavior and reset-abuse incentives |
| `TASK-049` Duo Hunt Rules | `GSC` + `PXE` | co-op loop plus reward/fairness consequences |
| `TASK-055` PvP Ruleset | `GSC` + `PXE` | competitive gameplay loop and spender/non-spender fairness |
| `TASK-056` Matchmaking/Rating/Reward/PvP Integrity | `GSC` + `PXE` | competitive incentives, reward cadence and fairness |
| `TASK-061` PvP Balance/UAT | `GSC` + `PXE` | final competitive loop/fairness evidence before Human acceptance |
| `TASK-062` Gym / Challenge Rules | `GSC` + `PXE` | progression gates, challenge pacing and rewards |
| `TASK-066` World Boss Contribution & Reward | `GSC` + `PXE` | contribution loop, thresholds, rewards and participation fairness |
| `TASK-070` Economy / Trading Model | `GSC` + `PXE` | value transfer reshapes progression/social loops and economy fairness |
| `TASK-071` Sources, Sinks, Fees & Trade Rules | `GSC` + `PXE` | direct economy-health and gameplay-loop coupling |
| `TASK-075` Economy / Social UAT Gate | `GSC` + `PXE` | final player/economy behavior and fairness evidence |
| `TASK-088` Move Acquisition / Eligibility Rules | `GSC`; `PXE` only if economic/paid/scarcity channels are proposed | acquisition/progression loop is inherent; economy trigger is conditional |

`TASK-023` requires PXE only if it starts defining reward/economic semantics beyond ledger
authority/idempotency/integrity. `TASK-042` requires GSC only if HUB ADR scope begins defining
gameplay/social incentive loops rather than topology/protocol semantics. Other tasks use the same
trigger policy instead of mechanically assigning consultants to every gameplay implementation.

## 5. External skill adoption policy

Skills are **advisory procedural knowledge**, not authority. A skill never grants permission to change architecture, game rules, scope, security policy or Git history.

### Adoption rules

1. Discovery on `skills.sh` / SkillsMP does not equal installation.
2. Prefer original/provider-maintained sources over clones.
3. Before first installation/use, inspect the repository and full `SKILL.md`, confirm source activity and review marketplace audit signals.
4. A marketplace `Warn` requires explicit manual source review before adoption.
5. A marketplace `Fail` is rejected by default unless the Human Owner explicitly approves a reviewed exception.
6. Pin/review the source used by the project when practical; do not silently accept a materially changed skill.
7. Skills must respect repository governance and task scope.

### Curated skill catalog

| Code | Skill | Primary role/stage | Adoption | Source |
|---|---|---|---|---|
| `SK-CF-DO` | Cloudflare `durable-objects` | LD/IA — HUB, Duo, World Boss coordination | **Preferred**; audit signals Pass/Pass/Pass | https://www.skills.sh/cloudflare/skills/durable-objects |
| `SK-CF-WR` | Cloudflare `wrangler` | LD/SD — Worker config, local validation, deploy tooling | **Preferred**; Pass/Pass/Pass | https://www.skills.sh/cloudflare/skills/wrangler |
| `SK-CF-WBP` | Cloudflare `workers-best-practices` | LD/QA — Workers authoring/review | **Reference/manual review only**; broad scope and warning signal; prefer focused Wrangler/DO skills | https://www.skills.sh/cloudflare/skills/workers-best-practices |
| `SK-CF` | Cloudflare `cloudflare` | PM/LD — product/platform selection | **Reference only**; broad umbrella skill overlaps focused Cloudflare skills | https://www.skills.sh/cloudflare/skills/cloudflare |
| `SK-TDD` | Google Labs Code `tdd-red-green-refactor` | LD/SD/FE — TypeScript/Vitest implementation | **Preferred**; Pass/Pass/Pass | https://www.skills.sh/google-labs-code/design.md/tdd-red-green-refactor |
| `SK-GAME-ARCH` | `game-architect` | PM/LD — game-system architecture reference | **Preferred advisory**; Pass/Pass/Pass | https://www.skills.sh/yuki001/game-dev-skills/game-architect |
| `SK-GAME-PERF` | `performance-optimization` | LD/QA/IA — engine/rendering profiling | **Preferred**; Pass/Pass/Pass | https://www.skills.sh/gamedev-skills/awesome-gamedev-agent-skills/performance-optimization |
| `SK-GAME-BAL` | `game-balance-analysis` | PM/QA/HO — combat, progression, PvP, Gym and World Boss balance | **Preferred advisory**; current audit signals Pass/Pass/Pass | https://www.skills.sh/yuki001/game-dev-skills/game-balance-analysis |
| `SK-PKM-DEX` | `Pokemon-Pokedex-Skill` | PM/QA — Pokémon franchise/reference consultation | **Reference only; no auto-trigger; never factual source of truth or runtime/game-data input** | https://github.com/SNLabat/Pokemon-Pokedex-Skill |
| `SK-PKM-GEN1` | `pokemon-skills` / Pokémon Green Gen-1 skill | PM/QA — historical Gen-1 behavior/differences consultation | **Reference only; no auto-trigger; Gen-1-specific behavior/bugs are not PokeNexus rules** | https://github.com/dev-jelly/pokemon-skills |
| `SK-PG` | Neon `postgres-best-practices` | PM/LD/QA — PostgreSQL schema/query/indexing | **Preferred**; Pass/Pass/Pass | https://www.skills.sh/neondatabase/postgres-skills/postgres-best-practices |
| `SK-REACT` | Vercel `vercel-react-best-practices` | FE/QA — React performance/architecture | **Preferred**; Pass/Pass/Pass | https://www.skills.sh/vercel-labs/agent-skills/vercel-react-best-practices |
| `SK-UI` | `frontend-design` | FE/QA/HO — usability, responsiveness, maintainability | **Preferred**; Pass/Pass/Pass | https://www.skills.sh/practicalswan/agent-skills/frontend-design |
| `SK-A11Y` | `frontend-accessibility-best-practices` | FE/QA — semantic/keyboard/screen-reader checks | **Preferred**; Pass/Pass/Pass | https://www.skills.sh/sergiodxa/agent-skills/frontend-accessibility-best-practices |
| `SK-FE-TEST` | `frontend-testing-best-practices` | FE/QA/SD — client behavior, E2E and integration-test strategy | **Preferred**; current audit signals Pass/Pass/Pass | https://www.skills.sh/sergiodxa/agent-skills/frontend-testing-best-practices |
| `SK-THREAT` | OpenAI `security-threat-model` | PM/IA — pre-implementation threat modeling | **Preferred**; original repository-specific source | https://www.skills.sh/openai/skills/security-threat-model |
| `SK-SECRETS` | OWASP `secrets-scan` | IA/QA — secret leakage checks | **Preferred**; Pass/Pass/Pass | https://www.skills.sh/owasp/secure-agent-playbook/secrets-scan |
| `SK-API-SEC` | OWASP `api-security-review` | IA/QA — auth/API security review | **Reference/manual review only**; warning signal requires source review before use | https://www.skills.sh/owasp/secure-agent-playbook/api-security-review |

### Pokémon reference-skill policy

- `SK-PKM-DEX` and `SK-PKM-GEN1` are optional consultation sources only; they do not create a new canonical role, owner, reviewer, auditor or merge gate.
- They must be invoked explicitly for a scoped question. Do not install/enable them as broad Pokémon auto-trigger behavior across the repository.
- For factual Pokémon data selected for ingestion, the authority chain is PokémonDB → validated immutable local snapshot under TASK-006. These skills never override that chain and must not silently supply missing canonical fields.
- Their purpose is to help PM/QA notice franchise terminology, generation differences, historical mechanics and mapping discrepancies before the owning PokeNexus spec makes a decision.
- A reference skill may explain official/historical behavior, but executable PokeNexus behavior remains owned by the relevant accepted task and Human Owner gate.
- Direct PM/spec-task wiring is appropriate for TASK-006, TASK-008, TASK-019, TASK-022, TASK-033 and TASK-062. During TASK-034/036 or other implementation/content work, PM/QA may consult these references only as part of scoped review/clarification; the implementation owner does not inherit the skills or any authority from them. Use elsewhere only when the active task has a concrete Pokémon-domain question.

### Explicitly not adopted by default

- `agent-project-orchestrator` — relevant conceptually, but current marketplace trust signal includes a failure; existing PokeNexus governance already covers orchestration.
- OWASP `code-review-security` — useful content, but current marketplace Snyk signal is Fail; do not install without a separate reviewed exception.
- Vercel `web-design-guidelines` — useful, but current Socket/Snyk signals are warnings; `SK-UI` + `SK-A11Y` are the safer default pair.

## 6. Project-wide architectural invariants

1. **One universal Combat Engine.** Every battle-capable mode — Solo Hunt, Duo Hunt, PvP, Gyms/Challenges, World Boss and future battle content — resolves combat through the same deterministic engine.
2. The Combat Engine does not know product modes such as `Hunt`, `PvP`, `Gym` or `WorldBoss`; no `switch(mode)` or mode-specific resolver path belongs in the engine.
3. Content may configure, constrain and orchestrate combat; content must not implement an independent damage/action/effect resolution path.
4. Action selection and opponent AI are external policies/orchestrators. The engine validates and resolves supplied actions; it does not decide which move an actor should choose.
5. `packages/game-core` remains pure deterministic TypeScript with explicit RNG/time inputs and no React/HTTP/database/Cloudflare dependency.
6. Arithmetic/rounding semantics and combat-event schemas are versioned contracts. Same initial Battle input/state, including frozen/pinned resolution-affecting generic config, + pinned `{ gameDataVersion, rulesVersion, combatEventSchemaVersion }` + explicit combat RNG seed/state + identical ordered normalized `CombatStimulus` stream (including exact ActionIntent/time-advance interleaving) must produce the same event sequence, final battle state and outcome. If an offline deterministic decision policy regenerates intents instead of replaying the stored normalized stream, its immutable version/configuration/inputs/seed and, for midstream checkpoint resume, deterministic continuation state are additionally part of replay identity.
7. A published game-data/rules version referenced by replay, checkpoint, claim or persisted combat evidence is immutable. Corrections create a new version; they never mutate the referenced version in place.
8. Solo Hunts remain event/elapsed-time driven; no persistent server tick.
9. Realtime remains scoped to HUB and synchronous Duo/other explicitly accepted realtime content.
10. Persistent rewards/progression are server-authoritative.
11. Card/Low-Spec and Visual/Pixi modes consume the same versioned game/combat events; presentation does not calculate authoritative combat.
12. TypeScript remains the primary language until profiling proves a CPU-bound kernel requires another implementation; optimization begins with measurement, not speculative rewrites.

## 7. Milestone sequence

```text
M0  FOUNDATION — Governance + Runtime + Project Control
 ↓
M1  CORE ENGINE ALPHA — Domain + Universal Combat Engine
 ↓
M2  Persistence + Identity
 ↓
M3  Trainer / Collection / Progression + Client Foundation
 ↓
M4  PLAYABLE ALPHA — Solo Hunt MVP
 ├─→ M5   Social HUB → M6 MULTIPLAYER BETA — HUB + Duo → M7 COMPETITIVE BETA — PvP
 │                                                       └─→ M9 OPTIONAL ECONOMY — separate Human Owner go/no-go
 ├─→ M8A  CONTENT BETA — Gyms / Challenges
 └─→ M8B  LIVE PVE BETA — World Boss

Release-scope candidate established before qualification; frozen at RC gate
 ↓
M10 PRODUCTION — only the selected feature set and its required gates
```

Safe parallelization is described per Epic; no parallel tasks may redefine the same contract, schema boundary, protocol or game rule.

## 8. Detailed roadmap

### EPIC-00 — Governance, Foundation & Project Control

**Status:** DONE — accepted governance baseline now includes advisory GSC/PXE consultation roles
**Outcome:** provider-independent governance, validated monorepo/runtime foundation and a visible project-control plane.
**Human gate:** completed — TASK-003 baseline acceptance remains valid; Human Owner accepted TASK-093 and authorized repository history on 2026-09-18.

#### STORY-00.1 — Agent governance

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-000` Agent Governance Baseline | B | DONE | PM → ChatGPT | QA + IA | none | Completed | — | Canonical roles; authority matrix; tool adapters; Git gates |
| `TASK-093` Gameplay Systems & Player Experience Consultant Governance | B | DONE | PM → ChatGPT | **QA READY — P0/P1/P2/P3 0/0/0/0**; IA N/A because advisory-only authority does not alter security-sensitive/irreversible approval paths | none | Completed — Human Owner accepted and authorized repository history on 2026-09-18 | TASK-000/003 | GSC/PXE added as `RECOMMEND`-only consultants; trigger policy; role boundaries; task/workflow metadata; consultation handoff; roadmap wiring; no implementation/approval authority |

#### STORY-00.2 — Engineering/runtime foundation

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-001` Project Foundation | B | DONE | LD → historical implementation surface | QA | `SK-TDD` applicable retrospectively | Completed | TASK-000 | Workspace; web/API/realtime skeletons; shared packages; CI |
| `TASK-002` Cloudflare Runtime Modernization | B | DONE | LD → Copilot CLI | QA | `SK-CF-WR`, `SK-CF-DO` | Completed | TASK-001 | Wrangler 4; declarative DO export; build/smoke validation |

#### STORY-00.3 — Project visibility/control

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-003` Project Control Roadmap | B | DONE | PM → ChatGPT | QA | external-skill discovery only | Completed — original Human acceptance preserved; corrective lint QA clear; repository completion authorized/completed | TASK-000/001/002 | Hierarchy; sequencing; roles/agents/skills; Markdown truth; deterministic HTML generator/check; dashboard; Node-script ESLint environment correction |

**Exit:** original Human acceptance remains valid. TASK-093 is integrated and DONE; no accepted product/game spec was reopened by this maintenance task.

---

### EPIC-01 — Core Domain & Universal Combat Foundation

**Status:** IN PROGRESS — accepted domain/data/combat contracts and Combat Engine are complete; TASK-092/SPEC-008 are integrated, TASK-087 materializes canonical static data, and TASK-090/091 close production Move/Ability rule content
**Outcome:** stable domain vocabulary/data contracts and the single deterministic Combat Engine used by all battle content.
**Why first:** every later battle mode depends on this layer; building content before it would duplicate rules and create migration debt.

#### STORY-01.1 — Core domain contracts

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-004` Domain Glossary & Core Model Spec | A | DONE | PM → ChatGPT | QA; IA optional | `SK-GAME-ARCH`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | Completed — Human Owner accepted spec | TASK-003 | Pokémon/combatant identity; stats; moves; types; abilities; items; effects; teams; PvE world/map/zone/encounter vocabulary; invariants; frontend execution-surface alignment; upstream Pokémon data-source policy alignment; Pokémon reference-skill policy |
| `TASK-005` Core Domain Type Skeleton | B | DONE | LD → Copilot CLI | QA | `SK-TDD` | Completed — PM accepted; no semantic drift | TASK-004 | Implement nominal/opaque canonical IDs; exact `StatKey` + complete `StatBlock`; type/compiler guards; only additional structures directly derivable from SPEC-001; no game logic or downstream schemas |
| `TASK-006` Static Game Data Schema & Rules Versioning | A | DONE | PM → ChatGPT | QA | `SK-GAME-ARCH`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | Completed — Human Owner accepted SPEC-002 | TASK-004/005 | Separate schemaVersion/gameDataVersion/rulesVersion + explicit compatible pairs; immutable rules resolution/retention envelope; logical sharded game-data bundle with NFC deterministic artifacts, SHA-256 content/provenance/bundle binding; Bulbapedia-primary / PokémonDB-complementary DATA-only source policy; source-coverage inventory reconciliation; species/form mapping roster with distinct SpeciesId + baseSpeciesId and no FormId; Species/Move/Type/Ability/Item/Learnset schemas; current type chart factual reference only; future Zone/Encounter/Hunt schema extension remains TASK-033/034-owned; no runtime web dependency or opportunistic provider fallback |
| `TASK-092` SpeciesDefinition Static-Fact Audit & Extension Spec | A | DONE | PM → ChatGPT | DoR QA READY `0/0/0/0`; original final QA NOT READY `0/1/0/0`; corrected option-1 Pokémon-domain review PASS advisory `0/0/0/0`; final independent QA READY `0/0/0/0` | `SK-GAME-ARCH`; `SK-PKM-DEX` reference-only | Completed — Human Owner accepted SPEC-008 v2 direction, approved **option 1**, and authorized repository history/completion on 2026-09-18 | TASK-006/093 | SPEC-008 APPROVED and integrated. Persistent Species/forms keep the applicable v2 contract and genuine SourceFact states. Mega/Eternamax/battle-only transformations are explicit excluded/deferred source inventory, not separately captured/persisted SpeciesDefinition identities and do not force fake availability wrappers. No transformation-profile catalog is added in schema v2; activation/reversion and the future transformed profile remain future rulesVersion/schema-extension work |
| `TASK-087` Static Game Data Catalog & Ingestion Implementation | B | ACCEPTANCE | LD → ChatGPT delegated worker (Copilot quota-blocked) | Pre-promotion and post-promotion independent QA READY `0/0/0/0`; delegated Class B acceptance **ACCEPTED** | `SK-TDD`, `SK-GAME-ARCH`; `SK-PKM-DEX` reference-only | Human Owner approved exact review seal `sha256:91b646453a56ba1496810e1f55f5bac242dd0ce68790d62ba61ec8b4b0e15377`; canonical promotion completed; repository-history completion authorized 2026-09-21 | TASK-005/006/092 | Canonical schemas/validators/loaders; deterministic hashes/provenance; Bulbapedia-primary + PokémonDB-complementary controlled ingestion; adopted local mapping roster; immutable `game-data-core-kanto-johto-v1` publication; battle-only transformations excluded/deferred; no runtime web fetch or alternate-provider fallback |

**Pokémon data-source policy for TASK-006/TASK-087:** the current SPEC-002 hierarchy is
Bulbapedia-primary with PokémonDB as an approved complementary factual source. A complementary
source may fill explicitly permitted gaps or support structural cross-checking, but it never
silently overrides a structured Bulbapedia fact. PokeNexus runtime/game logic must never depend on
live upstream requests. Controlled ingestion produces immutable local snapshots which are validated,
normalized and then published through the accepted `gameDataVersion` / checksum model.

The ingestion scope is **DATA only**. It must not collect or publish images, sprites,
icons, audio, other assets, editorial prose, page layout or styling. HTML may be fetched
only as transient parser input; any local HTML cache is non-canonical working state and
must not be published as game data. "Raw snapshot" in this project means raw **extracted
fields**, not a preserved copy of the source page.

The existing `pokemondb_moves_crawler_v2.py` from the Human Owner's prior project is an
implementation reference only for operational patterns such as retry/backoff, cache,
checkpoint/resume, diagnostics, atomic promotion and deterministic fingerprinting. Its source
fallback behavior is not authoritative for PokeNexus. Provider choice and disagreement handling
must follow SPEC-002; PokeAPI, Smogon or other opportunistic fallback remains disallowed.

The TASK-006 crawler/exporter sub-task must:

- crawl only the exact factual fields/pages approved in the TASK-006 field whitelist;
- avoid copying editorial prose, page layout/design or unrelated site content;
- respect the current `robots.txt`, use a descriptive User-Agent, cache responses and use
  conservative throttling/backoff (never faster than the site's current crawl policy);
- fail closed if robots/access rules change rather than silently bypassing restrictions;
- emit a raw snapshot plus normalized output and provenance manifest containing at least
  source URL, retrieval timestamp, parser version and source-content hash;
- be manually/on-demand or controlled-CI ingestion only, never a production/runtime fetch;
- require validation before a snapshot can become canonical PokeNexus game data;
- never silently substitute an unapproved provider or let a complementary source override a
  structured primary-source fact; unresolved identity/binding/source gaps fail closed.

**Accepted TASK-006 DATA whitelist v1:**

The approved initial ingestion profile is deliberately narrow. A field belongs in the baseline only when an
already-planned PokeNexus system needs the factual input. Additional upstream data can be added later by
publishing a new immutable snapshot/schema version; "available upstream" is not sufficient justification.

**Approved baseline v1:**

- **Species/form identity:** `SpeciesId` remains the canonical PokeNexus identity for the exact accepted
  static definition; National Dex number is non-unique source/reference data, with source slug/name,
  introduced generation, form/variant label and generation/game qualifier captured where an approved source exposes
  them. Independently addressable accepted forms receive distinct `SpeciesId` values; no separate `FormId`
  is introduced by TASK-004;
- **Species battle/progression reference:** current types, six base stats, eligible Abilities and
  hidden/alternate Ability assignment, catch rate, base experience and growth rate;
- **Moves:** source move name/slug, introduced generation, type, category, power, accuracy, PP,
  contact flag and target classification; no prose effect text becomes executable logic;
- **Learnsets:** species/form, generation/game grouping, `MoveId`, learn method, level or machine identifier
  and other structured method qualifiers exposed by PokémonDB;
- **Types:** type identities and the current PokémonDB effectiveness matrix as factual reference input;
  TASK-008 still decides the PokeNexus combat rules that actually consume it;
- **Abilities:** identity, introduced generation when available, species/form eligibility and normal/hidden/
  alternate assignment; descriptive prose may be consulted during rule design but is not executable data;
- **Items:** item identity/name and structured category/classification only. Machine/item relationships are
  added only when an accepted TASK-021/022 rule requires them; item-effect prose and behavior remain
  TASK-022/TASK-036-owned rules rather than imported executable behavior.

**Original SPEC-002 deferred/conditional fields — accepted baseline at TASK-006 time:**

- height and weight, unless an accepted UI/game rule explicitly consumes them;
- historical species types and generation-scoped type-effectiveness matrices, unless TASK-008 explicitly
  adopts historical/generation-specific type behavior or another accepted task needs that reference data;
- EV yield, unless an owning rules task explicitly adopts EV mechanics;
- gender ratio, egg groups and egg cycles, unless TASK-019/021 or another accepted spec adopts
  gender/breeding/hatching mechanics;
- evolution graph/trigger data, unless TASK-021 explicitly adopts evolution as a v1 progression mechanic;
- PokémonDB locations/encounter rates, unless TASK-033/034 explicitly adopts them as factual input for
  PokeNexus content; official encounter data never automatically becomes PokeNexus Hunt data;
- any additional franchise field without an accepted owning product/rules task.

**Accepted schema extension:** TASK-092/SPEC-008 completed the pre-publication audit of the
Species/form static-fact boundary. Height, weight, egg-group membership, gender ratio, egg cycles,
EV yield and base friendship are accepted canonical static data under the exact v2
form/source/provenance normalization. This does **not** adopt breeding, hatching, actual instance
gender, EV training/accumulation, friendship progression, evolution or other executable mechanics.
TASK-087 must implement the integrated SPEC-008 contract rather than the superseded deferred
classification.

**Explicitly excluded by default:** images/sprites/icons/audio, flavor/Pokédex text, game-description prose,
editorial effect prose, languages/translations, page layout/CSS, min/max stat calculators, competitive
recommendations and any field not named in the accepted whitelist.

Natures, EV-training mechanics, breeding rules and other franchise systems may be present on PokémonDB,
but are **not automatically in PokeNexus v1** merely because they exist upstream. They require an owning
product/rules task before becoming canonical gameplay data.

If implementation of this crawler requires a different implementation owner/branch from
the TASK-006 spec owner, governance requires promoting that sub-task to a dedicated
implementation Task before code is written.

#### STORY-01.2 — Universal Combat architecture and rules

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-007` ADR-004 Universal Combat Engine Architecture | A | DONE | PM → ChatGPT | QA + IA | `SK-GAME-ARCH` | Completed — Human Owner accepted ADR-004 | TASK-004/005/006 | One mode-agnostic resolver; deterministic state-transition + explicit time advancement; player/AI/orchestrator produces ActionIntent outside resolver; engine validates legality/targets; explicit combat RNG isolated from policy RNG; pinned data/rules/event-schema context; ordered versioned Combat Events; logical combat time deterministic while infrastructure timestamps remain non-authoritative; no persistence/network/presentation authority leakage |
| `TASK-008` Combat Rules Spec v1 | A | DONE | PM → ChatGPT | QA | `SK-GAME-ARCH`, `SK-GAME-BAL`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | Completed — Human Owner accepted SPEC-003 | TASK-007 | IV/derived stats; player/content-defined ordered 1–4 Move loadout; deterministic cyclic/skip automatic sequence policy outside resolver; 2000ms actor GCD + immutable per-Move cooldowns with deterministic cross-Battle carry; explicit `battle/cadence` timed-effect lifetime; cadence DoT/HoT/Buff/Debuff/locks can advance between Battles and KO before next encounter; simple-Move cooldown resolution from pinned Power+PP + rules curve; Speed same-time initiative only; exact damage/effect ordering; KO/forced replacement; authoritative event semantics |
| `TASK-009` Deterministic Combat Engine v1 | B | DONE | LD → ChatGPT delegated worker | QA | `SK-TDD`, `SK-GAME-ARCH` | Completed — PM accepted; Human sample-result validation complete; repository completion authorized/completed | TASK-008 | Seeded RNG; explicit clock; combat state; validate legality/targets and resolve supplied ActionIntents; shared deterministic effect-rule evaluator reusable for active-Battle and cadence advancement; versioned event/consequence output; outcome; no mode-specific branches, AI decision policy or parallel Hunt effect resolver |
| `TASK-010` Combat Fixtures, Replay & Property Harness | B | DONE | SD → Codex | QA | `SK-TDD` | Completed — independent QA clear; PM accepted; repository completion authorized/completed | TASK-009 | Golden deterministic cases; same initial state + pinned data/rules/event-schema identity + combat RNG state + ordered CombatStimulus stream = same event sequence/final state/outcome; historical immutable-version replay; policy-independent replay when intents are stored; event ordering; time-partition invariance; HP/domain bounds; terminal KO/victory/draw invariants; serialization round-trip; metadata-only cross-orchestrator equivalence for identical normalized combat inputs; regression corpus |
| `TASK-011` Combat Performance Baseline | B | DONE | LD → ChatGPT delegated worker | QA; IA optional | `SK-GAME-PERF` | Completed — Human Owner accepted performance budget + periodic-content recommendation; repository completion authorized/completed | TASK-009/010 | Combats/sec; p95 wall/CPU; retained heap/RSS/GC evidence; cadence-effect boundary throughput; realistic and pathological periodic-schedule cases; 1h/8h simulation benchmark; allocation profiling when materially constrained; measured performance-budget + content-publication limit decision record |
| `TASK-090` Production Move & Ability Rule Content Spec | A | PLANNED | PM → ChatGPT | QA | `SK-GAME-ARCH`, `SK-GAME-BAL`; `SK-PKM-DEX` reference-only | **HUMAN accepts executable Move/Ability coverage** | TASK-006/008/011/087 | Define the production rule-content subset required by MVP: exact MoveId/AbilityId → immutable rule-artifact mapping; simple/status/complex Move coverage; accepted buffs/debuffs/DoT/HoT/control/targeting semantics; unsupported-content fail-closed policy; no compilation of source prose; publication/performance limits under `rulesVersion` |
| `TASK-091` Production Combat Rule Catalog Implementation | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD`, `SK-GAME-ARCH`, `SK-GAME-PERF` | **HUMAN content sample validation** | TASK-090 | Implement immutable versioned Move/Ability rule artifacts/compiler/configuration accepted by TASK-090; deterministic MoveId/AbilityId resolution; coverage/validation fixtures; replay compatibility and content-budget tests; fail closed for unsupported/missing rule content |

**Exit criteria:** one shared engine resolves battle state/events deterministically; tests prove replayability; measured budgets show TypeScript is viable; canonical Species/Move/Ability/Learnset data is published through TASK-087; and the production Move/Ability rule-content subset required by MVP is accepted and implemented through TASK-090/091.

**Safe parallelization:** the completed TASK-007..011 engine line remains frozen. TASK-092 is integrated and no longer blocks TASK-087; TASK-022 remains independent. TASK-087 may now implement the accepted static-data contract so the first canonical catalog does not immediately require a schema republish for intrinsic Species facts. TASK-090 follows TASK-087 plus the accepted combat rules/performance constraints; TASK-091 follows TASK-090. Client design exploration may run in parallel but must not invent combat semantics or static-data authority.

**Production combat-rule content gate:** TASK-009 implements the accepted resolver plus explicit
fixtures; it must not invent broad status-Move/Ability/complex-Move semantics. TASK-090 owns the
Human-accepted production coverage/rule-content contract and TASK-091 publishes its immutable
implementation under the SPEC-002 `rulesVersion` envelope before Solo/Duo/PvP or other production
content relies on those mechanics.

---

### EPIC-02 — Persistence, Identity & Security Foundation

**Status:** DONE — TASK-012 through TASK-018 are integrated; persistence/auth recovery and baseline auditability gates are complete
**Outcome:** server-authoritative player identity/state on PostgreSQL with an accepted security model.
**High-risk areas:** database strategy, authentication and security are Class A; independent audit is mandatory where governance requires it.

#### STORY-02.1 — Persistence architecture

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-012` ADR-005 Persistence & Data Access Strategy | A | DONE | PM → ChatGPT | QA + IA | `SK-PG` | Completed — Human Owner accepted ADR-005; repository completion authorized/completed | TASK-005/006 | Managed PostgreSQL; PostgreSQL 17 SQL-feature baseline; cache-disabled Hyperdrive authoritative access; invocation-local pg client over transaction-mode pooling; SQL-first adapters/migrations; UUIDv7 durable IDs; command concurrency boundaries; direct migration path; game-core isolation |
| `TASK-013` PostgreSQL Schema v1 | A | DONE | PM → ChatGPT | QA + IA | `SK-PG` | Completed — Human Owner accepted SPEC-004; repository completion authorized/completed | TASK-012 | PostgreSQL 17 `pokenexus` schema; AccountId/PlayerId identity; reversible bytea codec for opaque strings; Pokémon ownership + stable SpeciesId + Level/IV; Team aggregate + ownership-safe membership; inventory aggregate root; versioned binary Hunt checkpoint + OCC; reward/audit ledger foundation; downstream rule deferrals |
| `TASK-014` Database Adapter & Migration Foundation | B | DONE | LD → ChatGPT delegated worker | QA | `SK-PG`, `SK-TDD` | Completed — PM / Architecture Coordinator accepted; Human Owner repository completion authorized/completed | TASK-013 | SQL-first PostgreSQL 17 migration; direct migration runner + immutable checksum ledger; invocation-local pg client; transaction helper; OpaqueStringDbCodec v1; UUIDv7; API nodejs_compat; real PostgreSQL constraint/OCC/migration recovery tests |

#### STORY-02.2 — Authentication and sessions

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-015` ADR-006 Authentication / Authorization / Session Model | A | DONE | PM → ChatGPT | QA + **IA required** — clear | `SK-THREAT`, `SK-API-SEC` manual-review | Completed — Human Owner accepted ADR-006 and authorized repository completion/history on 2026-09-16 | TASK-012 | Passkey-first discoverable WebAuthn v1; exact credential/userHandle/AccountId binding; canonical unique recovery email; digest-stored restricted enrollment/recovery capability; old-credential quarantine/revocation + 24h post-recovery security hold; opaque revocable sessions; recent-auth + CSRF; deny-by-default ownership authorization; authoritative per-target abuse cooldown + coarse edge limits; security notifications; secret-free bounded audit/retention; deletion/export expectations |
| `TASK-016` Authentication & Session Implementation | B | DONE | LD → ChatGPT delegated worker (Copilot CLI quota unavailable) | QA + **IA required** — corrected-snapshot QA READY and IA PASS | `SK-TDD`, `SK-THREAT`, `SK-SECRETS` | Completed — PM / Architecture Coordinator accepted; Human Owner authorized repository completion/history on 2026-09-16 | TASK-015 | Accepted ADR-006 implementation: PostgreSQL auth/session schema; passkey/WebAuthn ceremonies; canonical recovery email; enrollment/recovery restricted capabilities; opaque revocable sessions; CSRF/origin; recent-auth + post-recovery hold; deny-by-default authz primitives; layered abuse controls; secret-free audit/notification evidence |
| `TASK-017` Player Profile API & Persistence | B | DONE | LD → DEFAULT | QA READY — P0/P1 clear; roadmap-count P2 corrected in acceptance metadata | `SK-TDD`, `SK-PG`, `SK-CF-WBP` reference-only | Completed — Human approved exact minimal self-profile contract; PM / Architecture accepted; Human Owner authorized repository completion/history on 2026-09-17 | TASK-014/016 | Create/load current authenticated Player; minimal private profile contract; ownership authorization; idempotency/concurrency; integration tests; no social/display fields without explicit approval |
| `TASK-018` Persistence/Auth Recovery, Contract & Baseline Auditability Suite | B | DONE | SD → ChatGPT delegated worker (Codex CLI unavailable) | QA READY — P0/P1/P2/P3 0/0/0/0; IA spot-check PASS — P0/P1/P2/P3 0/0/0/0 | `SK-TDD`, `SK-PG`, `SK-SECRETS` | Completed — no recovery/auditability policy gate triggered; PM accepted; Human Owner authorized repository completion/history on 2026-09-17 | TASK-014/016/017 | Failure/retry cases; authorization matrix; migration upgrade/retry test; issuance/rotation/expiry/revoke-all/recovery-invalidation cases; correlation IDs; auth/security audit-event taxonomy and retention/privacy checks; no-secret/token evidence; prove baseline exists before reward-bearing/realtime features |

**Exit criteria:** authenticated player state can be created/read/updated through authoritative APIs with tested persistence/security boundaries and enough correlation/audit evidence to diagnose later multiplayer and reward-integrity failures.

`TASK-076/077` later expand operational observability, SLOs, dashboards and tracing. They do not create the first audit trail for security/rewards; the minimum evidence boundary is established here by TASK-018.

**Safe parallelization:** persistence implementation and authentication implementation may proceed in separate tasks only after their Class A contracts are accepted and shared account/player identifiers are frozen.

---

### EPIC-03 — Trainer, Collection, Team, Inventory & Progression

**Status:** IN PROGRESS — TASK-021 / SPEC-006 complete; TASK-022 is the next planned Class A item-model specification
**Outcome:** a persistent trainer owns Pokémon/items, builds teams and progresses through server-authoritative rules.

#### STORY-03.1 — Pokémon ownership and team model

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-019` Pokémon Instance / Collection / Team Spec | A | DONE | PM → ChatGPT | QA + **IA concurrency/integrity spot-check** | `SK-GAME-ARCH`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | Completed — Human Owner accepted SPEC-005 in full and authorized repository completion/history on 2026-09-17 | TASK-004/006/008/013 | APPROVED SPEC-005: owner-derived private Collection; instance state boundaries; selected Ability cardinality/eligibility; persistent ordered `1..4` Move Loadout + mutation authority; saved Team `0..6` dense ordered slots, duplicate/reuse rules and OCC mutation; persistence handoff for TASK-020 |
| `TASK-020` Collection & Team Domain/Persistence Implementation | B | DONE | LD → ChatGPT delegated worker (Copilot CLI quota unavailable) | QA READY + **IA PASS**, P0/P1/P2/P3 `0/0/0/0` | `SK-TDD`, `SK-PG` | Completed — PM / Architecture Coordinator accepted exact frozen REVIEW snapshot; Human Owner authorized repository completion/history on 2026-09-17 | TASK-019/014 | Forward SPEC-005 migration; Pokémon selected Ability / ordered Move Loadout persistence; ownership-derived Collection boundary; saved Team `0..6` dense roster; atomic expected-rowVersion roster/config/delete commands; fail-closed unordered legacy Team handoff; snapshot-coherent aggregate reads; real PG17 race/constraint tests |

#### STORY-03.2 — Progression, inventory and reward integrity

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-021` XP / Level / Progression Rules Spec | A | DONE | PM → ChatGPT | QA READY + **IA PASS**, P0/P1/P2/P3 `0/0/0/0` | `SK-GAME-ARCH`, `SK-GAME-BAL` | Completed — Human Owner accepted SPEC-006 in full and authorized repository completion/history on 2026-09-18 | TASK-019/020 | APPROVED SPEC-006: Pokémon hard Level Cap `200` + species-independent cubic cumulative XP curve; separate **uncapped Player Level** with Level 1/0 XP baseline and cumulative `50*L*(L-1)` curve (`100*L` next-Level cost); server-authoritative grants, Player/Pokémon OCC/idempotency/versioning handoff; feature thresholds/effects remain separately owned |
| `TASK-022` Inventory / Item Model Spec | A | DONE | PM → ChatGPT | Fresh QA READY + **IA PASS** after replay/idempotency fix; reconciled current-main QA READY + IA PASS; P0/P1/P2/P3 `0/0/0/0` | `SK-GAME-ARCH`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | Completed — Human Owner accepted SPEC-007 semantics and authorized repository history/completion on 2026-09-18 | TASK-006/013/019/093 | **APPROVED SPEC-007 integrated:** fungible quantity ownership; no gameplay capacity/stack cap; fail-closed overflow; atomic consume/effect; durable source/command correlation prevents replay double-consume; shared Potion evaluator; revival/equipment deferred; TM TASK-088-owned; every valid accepted capture attempt consumes one item whether success or failure |
| `TASK-023` Reward Ledger & Integrity Model | A | PLANNED | PM → ChatGPT | QA + IA recommended | `SK-THREAT`, `SK-PG` | **HUMAN accepts reward authority model** | TASK-013/021/022 | Idempotent grants; source attribution; immutable rules/game-data snapshot identity; replay/duplicate protection; audit trail; rollback semantics; **PXE consultation becomes required if this task defines reward/economic semantics beyond ledger authority/integrity** |
| `TASK-024` Progression / Inventory / Reward Implementation | B | PLANNED | LD → Copilot CLI | QA; IA for reward-integrity paths | `SK-TDD`, `SK-PG` | PM acceptance | TASK-018/021/022/023/087 | XP grants; item mutations; reward transactions; canonical static item/data consumption through TASK-087 loaders; emit reward audit events on the TASK-018 substrate; integration tests |
| `TASK-088` Move Acquisition / Eligibility Rules Spec | A | PLANNED | PM → ChatGPT | QA | `SK-GAME-ARCH`, `SK-GAME-BAL`; `SK-PKM-DEX` reference-only | **HUMAN accepts Move acquisition/eligibility rules** | TASK-006/019/021/022 | **Required advisory consultation: GSC; add PXE if economic/paid/scarcity acquisition channels are proposed.** Define authoritative learned/available-Move semantics distinct from raw Learnset facts; initial Pokémon loadout/bootstrap; level-based availability; TM/machine/tutor/egg/evolution/transfer methods if adopted; permanence/replacement rules; generation/game Learnset interpretation; static-data correction behavior; exact server authority consumed by loadout mutation |
| `TASK-089` Move Acquisition / Eligibility Implementation | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD`, `SK-PG`, `SK-GAME-ARCH` | PM acceptance | TASK-020/024/087/088 | Implement authoritative eligible/learned-Move source from accepted rules + canonical Learnset/catalog data; persist acquired state only if SPEC requires it; compose level/item acquisition hooks; validate loadout replacement against server authority; bootstrap existing/uninitialized Pokémon deterministically; integration tests |
| `TASK-025` Player State API Integration | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD`, `SK-CF-WBP` reference-only | PM acceptance | TASK-020/024/089 | Collection/team/inventory/progression endpoints; expose ordered Move-loadout mutation only through TASK-089 authoritative Move eligibility; authz; optimistic/idempotent command handling |

**Exit criteria:** authenticated players have authoritative collection/team/inventory/progression state suitable for gameplay rewards and team selection.

**Explicit deferred product domains:** Evolution and post-Level-200 Mastery/Prestige remain BACKLOG concepts, not accidental unowned implementation work. Neither is required for the baseline through TASK-025/Solo Hunt MVP. If prioritized, PM must materialize separate Class A rules tasks (and any required static-data schema extension) before implementation; level-up alone never implies evolution or post-cap state.

---

### EPIC-04 — Client UX, Rendering & Asset Foundation

**Status:** PLANNED
**Outcome:** accessible/responsive React shell plus Card/Low-Spec and Pixi presentation adapters that consume shared domain/combat events.

#### STORY-04.1 — Product shell and design system

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-026` UI/UX Architecture, Navigation & Design-System Spec | B | PLANNED | PM → ChatGPT | QA | `SK-UI`, `SK-A11Y`, `SK-REACT` | **HUMAN visual/UX approval** | TASK-003; domain vocabulary from TASK-004 | FE feasibility input; information architecture including Pokémon/Team/ordered Move-loadout management surfaces; responsive targets; design tokens; states; accessibility bar; Card vs Visual responsibilities; materialize a dedicated feature implementation task before Move-loadout editing UI code if no later task already owns it |
| `TASK-027` React App Shell & Navigation | B | PLANNED | FE → Claude Code | QA | `SK-REACT`, `SK-UI`, `SK-A11Y`, `SK-TDD`, `SK-FE-TEST` | **HUMAN live UI validation** | TASK-026 | Shell; routes/views; loading/error/empty states; keyboard/focus; responsive layout; behavior/E2E baseline |
| `TASK-028` Combat Event Presentation Contract | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD`, `SK-GAME-ARCH` | PM acceptance | TASK-007/009 | Read-model/events consumed by UI; no authority leakage; versioned payload boundaries |

#### STORY-04.2 — Dual presentation modes and assets

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-029` Card / Low-Spec Combat Renderer Foundation | B | PLANNED | FE → Claude Code | QA | `SK-REACT`, `SK-UI`, `SK-A11Y`, `SK-FE-TEST` | **HUMAN live validation** | TASK-027/028 | Combatants; action/event feed; HP/status; reduced-motion/low-cost rendering; no combat math; behavior tests against fixture events |
| `TASK-030` Pixi Combat Renderer Foundation | B | PLANNED | FE → Claude Code | QA | `SK-GAME-PERF`, `SK-UI`, `SK-FE-TEST` | **HUMAN visual/live validation** | TASK-028 | Scene lifecycle; entity views; event animation adapter; cleanup; frame budget; integration tests against fixture events |
| `TASK-031` Accessibility & Responsive Baseline | B | PLANNED | FE → Claude Code | QA | `SK-A11Y`, `SK-UI`, `SK-REACT` | **HUMAN usability validation** | TASK-027/029 | Keyboard; focus; semantics; reduced motion; zoom/text; mobile/desktop breakpoints |
| `TASK-032` Asset Manifest & Delivery Pipeline | B | PLANNED | LD → Copilot CLI | QA | `SK-CF-WR`, `SK-GAME-PERF` | **HUMAN asset-direction checkpoint** | TASK-026 | FE consultation; asset IDs/manifests; provenance/licensing metadata; implement accepted R2/CDN delivery path; cache/versioning; missing-asset handling; frontend consumption contract; budgets; distribution-strategy changes escalate to Class A architecture work |

**Exit criteria:** application shell and both presentation modes can render deterministic fixture events without owning gameplay logic.

**Safe parallelization:** TASK-027 and TASK-028 can proceed in parallel after UI spec/domain contracts stabilize; Card and Pixi renderers can then progress in parallel because they consume the same accepted presentation contract.

---

### EPIC-05 — PvE World & Solo Hunt MVP

**Status:** PLANNED
**Outcome:** first complete playable PvE vertical slice: navigate/select an available world/map Zone → select team → start Hunt → deterministic elapsed-time combat/encounters → rewards/capture → persistence → Card/Visual presentation.

#### STORY-05.1 — PvE world, map, Hunt rules and simulation

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-033` PvE World/Map, Zone & Solo Hunt Rules/Lifecycle Spec | A | PLANNED | PM → ChatGPT | QA | `SK-GAME-ARCH`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | **HUMAN accepts PvE/Hunt rules** | TASK-008/019/021/023 | **Required advisory consultation: GSC + PXE before Human gate.** Define World/Map → Zone → Hunt navigation/progression model; zone availability/unlocks at rule level; selecting/entering a Zone/Hunt; Hunt start/end/cancel/restart including reset-abuse policy; one Hunt = one combat-cadence continuity scope; continuing player Pokémon HP across encounters with no automatic Battle-boundary heal; deterministic inter-Battle time; cadence-effect continuation/ticks/KO between encounters; when item/Potion commands may occur and their ordering against due effect boundaries using TASK-022 semantics; encounters; Pokémon Team/lineup continuation after KO, including automatic activation of the next living eligible Pokémon and a mandatory intervention state before any new Battle when no living eligible Pokémon remains; accepted intervention choices such as Revive/item action or return to city; KO/recovery; respawn; capture hooks; reward/drop rules and cadence; checkpoint/claim semantics; no combat-engine mode fork |
| `TASK-034` PvE World/Zone, Encounter & Hunt Data | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD` | **HUMAN content sample validation** | TASK-006/033/087 | Implement accepted world/map-zone content structure; Zone definitions; map/zone relationships; encounter tables referencing canonical Species/content definitions from TASK-087; versioned Hunt/Zone reward and item-drop tables/content inputs where approved; all deterministic content published through TASK-006 immutable version/provenance envelope; deterministic selection; level/rule inputs; data validation |
| `TASK-035` Solo Hunt Simulation Engine | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD`, `SK-GAME-PERF` | PM acceptance | TASK-009/033/034/091 | Event-driven encounter loop; Hunt orchestration/AI policy executes the accepted ordered Move-sequence policy using production Move/Ability rule content from TASK-091, carries actor GCD/per-Move readiness/sequence cursor and cadence-scoped effect state across encounters, advances inter-Battle effects through the shared TASK-009 rule evaluator, handles pre-next-Battle KO, deterministically continues with the next living eligible Pokémon when available or blocks before Battle creation in the accepted no-living intervention state, and supplies versioned ActionIntents to shared Combat Engine; no realtime tick or parallel effect math |
| `TASK-036` Capture & Reward Resolution | B | PLANNED | LD → Copilot CLI | QA + IA reward-integrity spot-check | `SK-TDD`, `SK-THREAT` | **HUMAN validates rule outcomes** | TASK-023/024/033/034/035 | Capture rolls/rules; resolve XP/item drops/currency-if-approved from accepted versioned rules/content; idempotent grants through the reward/inventory authority path; event output |
| `TASK-037` Offline / Elapsed-Time Checkpoint & Claim Engine | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD`, `SK-GAME-PERF` | PM acceptance | TASK-035/036 | `startedAt`/checkpoint/rulesVersion/gameDataVersion or content checksum/seed; referenced-version retention; cadence cooldown/effect continuation state; 1h/8h advancement; safe caps; replay equality |

#### STORY-05.2 — Authoritative Hunt integration and presentation

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-038` Hunt API & Persistence Orchestration | B | PLANNED | LD → Copilot CLI | QA | `SK-CF-WBP` reference-only, `SK-PG`, `SK-TDD` | PM acceptance | TASK-017/025/037 | Start/checkpoint/claim/cancel commands; commands for accepted Hunt intervention actions such as item/revive use and return-to-city/terminate flow; authz; transactions; idempotency; recovery |
| `TASK-039` Solo Hunt Card Mode Integration | B | PLANNED | FE → Claude Code | QA | `SK-REACT`, `SK-UI`, `SK-A11Y`, `SK-FE-TEST` | **HUMAN live validation** | TASK-029/038 | PvE world/map/Zone selection in Card/Low-Spec presentation; team selection; Hunt state; event playback; mandatory no-living-Pokémon intervention state with accepted actions such as Revive/item use or return to city; rewards/result states; errors/reconnect; behavior/E2E coverage |
| `TASK-040` Solo Hunt Visual/Pixi Integration | B | PLANNED | FE → Claude Code | QA | `SK-GAME-PERF`, `SK-UI`, `SK-FE-TEST` | **HUMAN visual/live validation** | TASK-030/038 | Visual/Pixi presentation of the accepted PvE world/map/Zone navigation and the same Hunt/event source as Card; animations; scene transitions; mandatory no-living-Pokémon intervention state/action presentation; performance/fallback; behavior/E2E coverage |
| `TASK-041` Solo Hunt End-to-End, Offline & Performance Harness | B | PLANNED | SD → Codex | QA + IA reward-integrity review | `SK-GAME-PERF`, `SK-TDD` | **HUMAN MVP acceptance** | TASK-034–040 | Implement E2E/regression harness; fresh/returning flows; offline 1h/8h; deterministic replay; duplicate-claim defense; Card/Visual parity; load/CPU budget |

**Exit / MVP gate:** Solo Hunt is a complete server-authoritative playable loop. Human Owner explicitly approves MVP behavior and presentation before the project expands into realtime multiplayer content.

---

### EPIC-06 — Social HUB & Realtime Presence

**Status:** PLANNED
**Outcome:** persistent shared social space for presence, movement, chat, NPC interaction hooks and party formation, without turning the whole game into a global realtime simulation.

**Operational prerequisite:** TASK-018 baseline auditability must be complete before HUB implementation. Full telemetry/SLO/LiveOps work remains in EPIC-11, but multiplayer must not launch without correlation IDs and actionable error/audit evidence.

#### STORY-06.1 — HUB realtime contract

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-042` ADR-007 HUB Realtime State & Protocol | A | PLANNED | PM → ChatGPT | QA + **IA required** | `SK-CF-DO`, `SK-THREAT`, `SK-GAME-ARCH` | **HUMAN accepts ADR** | TASK-015/017/026; ADR-003 | HUB room/area identity; presence/movement authority; message envelope; rate limits; ephemeral/persistent boundary; reconnect semantics; do not overload PvE `Zone` vocabulary; **GSC consultation becomes required if ADR scope starts defining gameplay/social incentive loops rather than topology/protocol only** |
| `TASK-043` HUB Presence & Movement Durable Object | B | PLANNED | LD → Copilot CLI | QA + IA concurrency review | `SK-CF-DO`, `SK-CF-WBP` reference-only, `SK-TDD` | PM acceptance | TASK-018/042 | Join/leave; position state; throttling; broadcast; correlation/audit integration; lifecycle cleanup; no continuous DB writes |
| `TASK-044` HUB Chat Protocol & Implementation | B | PLANNED | LD → Copilot CLI | QA + IA security spot-check | `SK-CF-DO`, `SK-THREAT`, `SK-TDD` | **HUMAN validates moderation/product behavior** | TASK-042/043 | Message limits; identity; basic moderation hooks; abuse/rate handling; disconnect behavior |
| `TASK-045` Parties & Invitations | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD`, `SK-CF-DO` | **HUMAN validates party UX/rules** | TASK-043/044 | Invite/accept/decline/leave; party identity; ownership/leadership rules; persistence boundary |

#### STORY-06.2 — HUB client and resilience

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-046` HUB Pixi Scene & Social UI | B | PLANNED | FE → Claude Code | QA | `SK-UI`, `SK-A11Y`, `SK-GAME-PERF` | **HUMAN live/visual validation** | TASK-027/032/043–045 | Scene; movement input; player labels; chat/party UI; NPC interaction shell; mobile controls |
| `TASK-047` HUB Reconnect, Rate-Limit & Load Validation | B | PLANNED | LD → Copilot CLI | QA + IA | `SK-CF-DO`, `SK-GAME-PERF` | PM acceptance | TASK-043–046 | Reconnect/resume; stale presence; burst traffic; slow clients; hotspot tests; memory/CPU budget |
| `TASK-048` HUB Human UAT | B | PLANNED | PM → ChatGPT | QA evidence required | `SK-UI` | **HUMAN final HUB acceptance** | TASK-046/047 | Coordinate multi-client live test; navigation; chat; parties; mobile/desktop usability; defect triage; fixes remain separately owned |

**Exit criteria:** shared HUB is usable and resilient, with realtime scope still constrained to the accepted topology.

---

### EPIC-07 — Duo Hunt

**Status:** PLANNED
**Outcome:** two players can enter an isolated synchronous Hunt room that orchestrates the **same shared Combat Engine** rather than implementing a second combat path.

#### STORY-07.1 — Duo rules and room protocol

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-049` Duo Hunt Rules & Orchestration Spec | A | PLANNED | PM → ChatGPT | QA | `SK-GAME-ARCH` | **HUMAN accepts Duo rules** | TASK-033/041/045 | **Required advisory consultation: GSC + PXE before Human gate.** Join/start conditions; party roles; action ownership/ActionIntent production outside engine; rewards; failure/leave semantics; shared-engine inputs |
| `TASK-050` ADR-008 Duo Realtime Room Protocol | A | PLANNED | PM → ChatGPT | QA + **IA required** | `SK-CF-DO`, `SK-THREAT` | **HUMAN accepts protocol/topology** | TASK-042/049 | Room routing; authoritative state; client commands; sequencing; reconnect; timeout; room teardown |
| `TASK-051` Duo Hunt Durable Object / Orchestrator | B | PLANNED | LD → Copilot CLI | QA + IA concurrency review | `SK-CF-DO`, `SK-TDD` | PM acceptance | TASK-050 | Room state; command validation; Combat Engine orchestration; event broadcast; persistence handoff |
| `TASK-052` Duo Sync, Reconnect & Failure Semantics | B | PLANNED | LD → Copilot CLI | QA + IA | `SK-CF-DO`, `SK-TDD` | **HUMAN validates player-facing behavior** | TASK-051 | Late packet/order cases; reconnect; partner leaves; timeout; duplicate commands; recovery |

#### STORY-07.2 — Duo presentation and acceptance

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-053` Duo Hunt Card/Visual UI | B | PLANNED | FE → Claude Code | QA | `SK-REACT`, `SK-UI`, `SK-A11Y`, `SK-GAME-PERF`, `SK-FE-TEST` | **HUMAN live validation** | TASK-039/040/051/052 | Invite→room flow; partner state; combat events; latency feedback; errors/reconnect; two-client behavior/E2E coverage |
| `TASK-054` Duo End-to-End & Load Harness | B | PLANNED | SD → Codex | QA + IA | `SK-CF-DO`, `SK-GAME-PERF`, `SK-TDD` | **HUMAN final Duo acceptance** | TASK-051–053 | Implement two-client test matrix; race/failure tests; reward integrity; room isolation; latency/load budget |

**Exit criteria:** Duo provides synchronous multiplayer while preserving universal combat semantics and isolated room scaling.

---

### EPIC-08 — PvP

**Status:** PLANNED
**Outcome:** server-authoritative player-vs-player battles reuse the universal Combat Engine with a PvP ruleset/orchestration layer.

#### STORY-08.1 — PvP rules, matchmaking and rewards

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-055` PvP Ruleset & Execution Model Spec | A | PLANNED | PM → ChatGPT | QA + IA if realtime is proposed | `SK-GAME-ARCH`, `SK-GAME-BAL`, `SK-THREAT` | **HUMAN accepts PvP rules + execution model** | TASK-008/025/041 | **Required advisory consultation: GSC + PXE before Human gate.** Team constraints; player/automation ActionIntent production outside engine; action/switch legality; async vs realtime decision; timers; draw/forfeit; modifiers; no engine fork; if realtime is selected, revise/replace ADR-003 before implementation |
| `TASK-056` Matchmaking, Rating, Reward & PvP Integrity Spec | A | PLANNED | PM → ChatGPT | QA + **IA required** | `SK-GAME-ARCH`, `SK-GAME-BAL`, `SK-THREAT` | **HUMAN accepts competitive/reward/integrity rules** | TASK-055 | **Required advisory consultation: GSC + PXE before Human gate.** Queue/rating model; anti-smurf hooks; reward cadence; disconnect/abuse policy; replay evidence; impossible-command/tamper boundaries |

#### STORY-08.2 — PvP execution and integrity

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-057` PvP Match Orchestrator | B | PLANNED | LD → Copilot CLI | QA + IA concurrency/integrity | `SK-CF-DO`, `SK-TDD` when realtime applies | PM acceptance | TASK-055/056 + accepted realtime ADR if required | Match/session authority; commands; shared Combat Engine; event sequencing; result finalization; no topology implied by implementation |
| `TASK-058` Matchmaking Service / API | B | PLANNED | LD → Copilot CLI | QA | `SK-CF-WBP` reference-only, `SK-TDD` | PM acceptance | TASK-056/057 | Queue entry/leave; pairing; eligibility; idempotency; rate limiting |
| `TASK-059` PvP Replay & Anti-Cheat Enforcement | B | PLANNED | LD → Copilot CLI | QA + **IA required** | `SK-THREAT`, `SK-TDD`, `SK-SECRETS` | **HUMAN controlled integrity acceptance** | TASK-056/057/058 | Implement accepted replay evidence; impossible-command detection; tamper controls; dispute/debug record; abuse telemetry |
| `TASK-060` PvP UI & Match Flow | B | PLANNED | FE → Claude Code | QA | `SK-REACT`, `SK-UI`, `SK-A11Y`, `SK-FE-TEST` | **HUMAN live validation** | TASK-057–059 | Queue; match found; battle state; timers; result/rating; failure/reconnect UX; behavior/E2E coverage |
| `TASK-061` PvP Balance / UAT Gate | A | PLANNED | PM → ChatGPT | QA + IA integrity evidence | `SK-GAME-BAL`, `SK-GAME-PERF` as needed | **HUMAN final PvP/balance acceptance** | TASK-055–060 | **Required advisory consultation: GSC + PXE before Human gate.** Coordinate rule sampling; match fairness; disconnect abuse; reward sanity; live multi-client UAT; rule changes return through accepted spec flow |

**Exit criteria:** PvP is competitive, replayable/auditable and uses no alternate combat-resolution implementation.

---

### EPIC-09 — PvE Expansion: Gyms, Challenges & World Boss

**Status:** PLANNED
**Outcome:** richer PvE content composes the universal Combat Engine with mode-specific rule/orchestration layers.

#### STORY-09.1 — Gyms and Challenges

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-062` Gym / Challenge Rules Spec | A | PLANNED | PM → ChatGPT | QA | `SK-GAME-ARCH`, `SK-GAME-BAL`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | **HUMAN accepts rules/balance model** | TASK-008/021/041 | **Required advisory consultation: GSC + PXE before Human gate.** Entry/min levels; level sync; overcap/penalty modifiers; team constraints; rewards; progression gates |
| `TASK-063` Gym / Challenge Orchestration & Content Data | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD` | **HUMAN content sample validation** | TASK-006/062 | Trainer/opponent data; rule adapters; stage sequencing; shared engine calls; result events |
| `TASK-064` Gym / Challenge UI & Progression Client Integration | B | PLANNED | FE → Claude Code | QA | `SK-REACT`, `SK-UI`, `SK-A11Y` | **HUMAN live/content validation** | TASK-024/025/063 | Selection/progression UI; consume authoritative result/reward flow; badges/unlocks if approved; client states |

#### STORY-09.2 — World Boss

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-065` ADR-009 World Boss Aggregation & Scaling Topology | A | PLANNED | PM → ChatGPT | QA + **IA required** | `SK-GAME-PERF`, `SK-THREAT`; `SK-CF-DO` only if accepted topology uses DO/realtime coordination | **HUMAN accepts topology** | TASK-009/010/011/018/023/041 | Decide asynchronous contribution/independent combat vs synchronous shared combat before choosing infrastructure; aggregation/global state; hotspot avoidance; consistency/failure model; HUB/Duo evidence may inform design but is not a topology prerequisite; synchronous multiplayer requires explicit ADR-003 revision/replacement |
| `TASK-066` World Boss Phases, Contribution & Reward Spec | A | PLANNED | PM → ChatGPT | QA + IA reward-integrity | `SK-GAME-ARCH`, `SK-GAME-BAL`, `SK-THREAT` | **HUMAN accepts boss/reward rules** | TASK-023/065 | **Required advisory consultation: GSC + PXE before Human gate.** Boss phase rules; participant combat parameters; contribution scoring; thresholds; reward model |
| `TASK-067` World Boss Orchestration & Aggregation Implementation | B | PLANNED | LD → Copilot CLI | QA + **IA required** | `SK-TDD`, `SK-GAME-PERF`; `SK-CF-DO` only when required by accepted ADR-009 | PM acceptance | TASK-065/066 | Accepted topology implementation; ActionIntent policy/orchestration outside shared resolver; contribution events; aggregation; failure/retry; finalization |
| `TASK-068` World Boss Client Experience | B | PLANNED | FE → Claude Code | QA | `SK-REACT`, `SK-UI`, `SK-A11Y`, `SK-GAME-PERF` | **HUMAN visual/live validation** | TASK-067 | Boss state; contribution; phases; reward/result UI; reconnect/degraded states |
| `TASK-069` World Boss Load, Integrity & UAT Gate | B | PLANNED | PM → ChatGPT | QA + **IA required** | `SK-GAME-PERF`, `SK-THREAT`; `SK-CF-DO` only when required by accepted ADR-009 | **HUMAN final World Boss acceptance** | TASK-067/068 | Coordinate evidence from hotspot/load tests; contribution consistency; duplicate rewards; failure recovery; multi-client UAT; fixes remain with implementation owners |

#### STORY-09.3 — Future battle content

Raid, dungeon, tournament, Battle Tower and event modes remain **BACKLOG concepts** until the Human Owner prioritizes them. They must compose the existing Combat Engine and must receive explicit Story/Task definitions before implementation.

---

### EPIC-10 — Economy & Extended Social Systems

**Status:** PLANNED / POST-MVP — explicit Human Owner go/no-go before activation
**Outcome:** optional player-to-player/value-transfer systems with strong integrity controls.
**Risk:** economy/trading is Class A and requires independent audit.

#### STORY-10.1 — Economy and trading

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-070` ADR-010 Economy / Trading Model | A | PLANNED | PM → ChatGPT | QA + **IA required** | `SK-THREAT`, `SK-PG` | **HUMAN go/no-go + ADR acceptance** | TASK-023/025/061 | **Required advisory consultation: GSC + PXE before Human gate.** Value boundaries; currencies; tradability; market/direct trade decision; consistency; fraud/RMT threat model |
| `TASK-071` Sources, Sinks, Fees & Trade Rules Spec | A | PLANNED | PM → ChatGPT | QA + IA | `SK-GAME-ARCH`, `SK-GAME-BAL`, `SK-THREAT` | **HUMAN accepts economy/balance** | TASK-070 | **Required advisory consultation: GSC + PXE before Human gate.** Sources/sinks; fees; limits; item/Pokémon eligibility; cooldowns; dispute/cancel behavior |
| `TASK-072` Trading / Market Implementation | B | PLANNED | LD → Copilot CLI | QA + **IA required** | `SK-PG`, `SK-TDD`, `SK-THREAT` | **HUMAN controlled acceptance** | TASK-071 | Atomic exchange/listing; locks; idempotency; authz; audit ledger; failure recovery |
| `TASK-073` Economy Abuse / Fraud / Duplication Controls | B | PLANNED | LD → Copilot CLI | QA + **IA required** | `SK-THREAT`, `SK-SECRETS`, `SK-PG` | **HUMAN risk acceptance** | TASK-072 | Velocity/duplication controls; anomalous flows; audit queries; rollback/freeze hooks; admin evidence |

#### STORY-10.2 — Extended social surfaces

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-074` Profiles, Leaderboards & Social Polish | B | PLANNED | FE → Claude Code | QA | `SK-REACT`, `SK-UI`, `SK-A11Y` | **HUMAN product/UX validation** | TASK-017/025/061 | Public profile/leaderboard UI against accepted APIs; privacy controls; UI states; promote backend additions to separate Task if required |
| `TASK-075` Economy / Social UAT Gate | A | PLANNED | PM → ChatGPT | QA + IA evidence | `SK-THREAT` | **HUMAN final economy/social acceptance** | TASK-070–074 | **Required advisory consultation: GSC + PXE before Human gate.** Coordinate abuse cases; atomicity; privacy; live trade/social workflows; economy sanity; fixes remain separately owned |

**Exit criteria:** only if explicitly approved, value-transfer/social systems are auditable, atomic, abuse-aware and do not compromise core progression integrity.

---

### EPIC-11 — Operations, Security Hardening, LiveOps & Release

**Status:** PLANNED — cross-cutting work begins earlier where dependencies require; final gate occurs last.
**Outcome:** observable, recoverable, administrable, secure and releasable production system.

#### STORY-11.1 — Observability and administration

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-076` Observability / Telemetry Strategy | B | PLANNED | PM → ChatGPT | QA | `SK-CF-WBP` reference-only | **HUMAN accepts product telemetry boundaries** | TASK-017/038/043 | LD feasibility input; logs/metrics/traces; correlation IDs; privacy; SLO indicators; cost boundaries |
| `TASK-077` Structured Logging, Metrics & Tracing Implementation | B | PLANNED | LD → Copilot CLI | QA | `SK-CF-WBP` reference-only, `SK-TDD` | PM acceptance | TASK-076 | API/realtime/game command instrumentation; error classes; dashboards/alerts hooks |
| `TASK-078` Admin / LiveOps Configuration Tools | B | PLANNED | LD → Copilot CLI | QA + IA if privileged security surface | `SK-REACT`, `SK-THREAT` | **HUMAN workflow/permission validation** | TASK-016/023/077 | Role-protected control contracts/actions; content/config visibility; publish/activate new versioned content/config rather than mutate referenced snapshots; reward/admin audit; safe operations; promote substantial frontend surface to separate FE Task |

#### STORY-11.2 — Deployment, security and resilience

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-079` ADR-011 Environments / Deployment / Release Strategy | A | PLANNED | PM → ChatGPT | QA + IA security review | `SK-CF`, `SK-CF-WR`, `SK-THREAT` | **HUMAN accepts deployment strategy** | TASK-002/016/077 | dev/staging/prod; config/secrets; release/rollback; migration order; blast-radius controls; release-scope manifest ownership/process |
| `TASK-080` CI/CD, Environments & Secrets Implementation | B | PLANNED | LD → Copilot CLI | QA + **IA required** | `SK-CF-WR`, `SK-SECRETS`, `SK-THREAT` | **HUMAN first-production-change approval** | TASK-079 | Environment configs; protected secrets; deploy gates; dry-run/staging; rollback validation; materialize candidate release-scope manifest with included/excluded/feature-flagged capabilities and required gates |
| `TASK-081` Security Hardening & Threat-Model Closure | A | PLANNED | PM → ChatGPT | QA + **IA required** | `SK-THREAT`, `SK-SECRETS`, `SK-API-SEC` manual-review | **HUMAN residual-risk acceptance** | TASK-080 + release-scope manifest | IA assesses features in the established release-scope candidate; PM coordinates threat register/residual-risk decision; implementation findings become separately owned fix Tasks |
| `TASK-082` Performance / Load / Stress Qualification | B | PLANNED | LD → Copilot CLI | QA + IA for realtime hotspots | `SK-GAME-PERF`, `SK-CF-DO` | **HUMAN accepts release budgets** | TASK-080 + release-scope manifest | Qualify only included/required release-scope paths: combat throughput; offline advancement; API load; selected realtime hotspots; frontend frame budgets |
| `TASK-083` Backup, Restore & Disaster-Recovery Rehearsal | B | PLANNED | LD → Copilot CLI | QA + IA if production-risk operations | `SK-PG`, `SK-THREAT` | **HUMAN recovery-policy acceptance** | TASK-014/079 | Backup policy; restore drill; migration rollback; data-loss objective; operator runbook evidence |

#### STORY-11.3 — Release candidate and go-live

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-084` Release Candidate Regression & Readiness Gate | B | PLANNED | PM → ChatGPT | QA + relevant IA evidence | Skills selected by affected domains | **HUMAN reviews release evidence** | TASK-080–083 + established release-scope manifest | Verify and freeze the TASK-080 release-scope manifest; consolidate independent regression/migration/accessibility/performance/security evidence and known P2/P3 ledger; fixes remain separately owned |
| `TASK-085` Human Owner UAT / Go-Live Acceptance | A | PLANNED | PM → ChatGPT | QA evidence prerequisite | `SK-UI` only as advisory | **HUMAN is the gate** | TASK-084 | Coordinate end-to-end product walkthrough; visual/content validation; rollback readiness; Human Owner explicit go/no-go |
| `TASK-086` Production Launch & Post-Launch Verification | A | PLANNED | LD → Copilot CLI | QA + IA where required | `SK-CF-WR`, `SK-CF-WBP` reference-only, `SK-SECRETS` | **HUMAN authorizes launch and confirms stabilization** | TASK-085 | Execute approved release plan; controlled deploy; migration sequence; smoke checks; metrics/errors; rollback trigger; stabilization review |

**Exit criteria:** production launch is explicitly authorized by the Human Owner and verified against security, recovery, performance and product-acceptance evidence.

## 9. Dependency / parallelization map

The recommended critical path is:

```text
TASK-003
  ↓
TASK-004 → 005 → 006 → 007 → 008 → 009 → 010 → 011
                     │
                     ├─────────────┐
                     ↓             ↓
              EPIC-02 data/auth   EPIC-04 client foundation
                     │             │
                     ↓             │
                  EPIC-03          │
                     └──────┬──────┘
                            ↓
                       EPIC-05 Solo Hunt MVP
                         ├──────────────→ EPIC-09 Gyms / Challenges lane
                         ├──────────────→ EPIC-09 World Boss lane
                         ↓
                       EPIC-06 HUB → EPIC-07 Duo → EPIC-08 PvP
                                                   └────────→ EPIC-10 optional economy/social

Selected release-scope lanes + EPIC-11 operational gates
                         ↓
                    EPIC-11 release gate
```

Parallel work is encouraged only after shared contracts are accepted:

- Persistence (`EPIC-02`) and client shell (`EPIC-04`) may overlap after domain contracts stabilize.
- Card and Pixi renderers may run in parallel after the presentation contract is accepted.
- HUB work may begin after auth/client foundations, but product sequencing recommends closing Solo Hunt MVP first to avoid too many active contract surfaces.
- PvP and World Boss planning can overlap after shared combat/realtime patterns stabilize, but their Class A rules/topologies cannot be inferred from implementation.
- Economy/trading remains off the critical MVP path unless the Human Owner explicitly moves it forward.

### Delivery horizons (avoid one giant launch-blocking critical path)

The roadmap is complete, but not every Epic must block the first usable release. Default delivery horizons are:

| Horizon | Exit target | Default included scope |
|---|---|---|
| **Alpha — Core Loop** | Human Owner accepts a stable Solo Hunt vertical slice | EPIC-00 through EPIC-05 |
| **Multiplayer Beta** | Human Owner accepts social + cooperative play | HUB + Duo; Gyms/Challenges may ship in parallel when ready |
| **Competitive / Live Content Beta** | Competitive/integrity and scalable live PvE validated | PvP + World Boss + required security/observability gates |
| **Economy Extension** | Separate Human Owner go/no-go | Trading/economy and extended social surfaces |
| **Production Release** | Release-scope features satisfy EPIC-11 gates | Explicitly selected feature set; optional later Epics may remain feature-flagged/backlog |

Human Owner can change these horizons. The purpose is to prevent optional extensions from becoming accidental blockers for validating the core game.

### Sequencing hazards that must remain visible

- Database schema before stable domain IDs/rules-version creates migration churn.
- Mutable game data without a pinned `rulesVersion` breaks deterministic replay/offline claims.
- Mode-specific combat resolvers create Solo/Duo/PvP/Gym/World Boss divergence.
- Client/server protocol implementation before accepted contracts creates drift.
- Security/auditability deferred until the end leaves rewards and multiplayer exploit-blind.
- Realtime PvP or synchronous World Boss without revising ADR-003 is an architecture violation.
- Trading before atomic ownership/reward ledger and anti-abuse controls invites dupes/double-spend.
- Parallel edits to the same schema, public protocol or Durable Object topology violate the one-owner contract boundary.
- Admin/LiveOps paths must reuse authoritative invariants; privileged bypasses create an exploit surface.

## 10. Task activation rule

A roadmap row is not implementation authorization.

Before any `PLANNED` task starts:

1. PM confirms prerequisites and current product priority.
2. Create/update the canonical task file in `tasks/active/`.
3. Resolve any required ADR/spec and Human Owner decision.
4. Assign one owner role + execution surface, reviewer and required auditor.
5. Confirm scope/out-of-scope, acceptance criteria, tests, risks and expected files.
6. Move task to `READY` only when Definition of Ready is satisfied.
7. Implementation owner then moves it to `ACTIVE` and works in its own branch/worktree.

If planned numbering no longer fits the best decomposition, preserve traceability by updating this roadmap before starting work; do not force a bad task shape merely to preserve a number.

## 11. Progress update rules

This Markdown file is the canonical portfolio view and must stay concise enough to audit.

Update it when:

- a Task changes portfolio-relevant state (`PLANNED/DRAFT/READY/ACTIVE/REVIEW/FIX/ACCEPTANCE/DONE/BLOCKED/DEFERRED`);
- an Epic/Story is added, removed, re-sequenced or materially rescoped;
- dependencies or Human Owner gates change;
- a skill is adopted/rejected or its safety status materially changes;
- a milestone is accepted.

Do **not** use it as a changelog. Current truth only. Git/tasks preserve history.

When this file changes, run `corepack pnpm roadmap:generate` in the same documentation task. The generator parses this Markdown, validates roadmap invariants and writes the standalone HTML with the Markdown SHA-256 embedded in the page. `corepack pnpm roadmap:check` must fail if task IDs/metadata/dependencies are invalid or if the checked-in HTML is stale. The HTML is a derived snapshot; if it disagrees with this Markdown file, **Markdown wins**.

## 12. Definition of visibility-complete

At any point, the Human Owner should be able to answer from this roadmap:

- What is DONE?
- What is ACTIVE right now?
- What is next and why?
- Which tasks are blocked on human decisions?
- Which role and execution agent owns each task?
- Which independent QA/audit gates apply?
- Which external skills are allowed/recommended for the work?
- Which systems can safely run in parallel?
- Where does the universal Combat Engine sit relative to every content mode?
- What must be true before production release?

If any answer becomes ambiguous, updating this roadmap is part of the planning task before new implementation begins.
