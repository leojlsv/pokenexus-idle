# PokeNexus Idle — Project Roadmap & Control Plane

> **Canonical project progress/planning source of truth.**
>
> This file answers: where the project is, what comes next, which role/agent executes each step, which skills are applicable, what depends on what, and where the Human Owner must validate.
>
> **Authority note:** this file does **not** redefine governance. `AGENTS.md`, `docs/agents/**`, accepted ADRs and approved specs remain authoritative for role authority, approval gates and technical/product decisions. If this roadmap conflicts with those sources, those sources win and this roadmap must be corrected.

## 1. Current position

**Project phase:** Foundation, core domain/combat foundation and the PostgreSQL v1 persistence model are complete; database adapter and migration implementation is next.

**Current work:** `TASK-013 — PostgreSQL Schema v1` is DONE. Lead Developer feasibility, independent QA and Independent Auditor all returned P0/P1/P2/P3 = 0/0/0/0, the Human Owner accepted and approved SPEC-004, and repository completion was authorized.

**Current action:** advance `TASK-014 — Database Adapter & Migration Foundation` through the normal lifecycle against approved SPEC-004.

**Next task after TASK-003 acceptance:** `TASK-014 — Database Adapter & Migration Foundation`.

**Portfolio status snapshot:**

| Task | Result |
|---|---|
| `TASK-000` Agent Governance Baseline | DONE |
| `TASK-001` Project Foundation | DONE |
| `TASK-002` Cloudflare Runtime Modernization | DONE |
| `TASK-003` Project Control Roadmap | DONE — independent QA READY; Human Owner accepted |
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

**Next product milestone:** establish persistence, identity and security foundations on PostgreSQL before persistent trainer/gameplay systems are implemented.

### Portfolio progress

- Planned task IDs in this roadmap: `TASK-000` through `TASK-086`.
- DONE: 14.
- PLANNED: 73.
- Task-count completion: **14 / 87 = 16.1%**.

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
| `LD` | Lead Developer | GitHub Copilot CLI `lead-developer` custom agent | Complex game-core, API, persistence, realtime and integration work |
| `SD` | Secondary Developer | Codex implementation session | Isolated implementation tasks/tests/scripts inside accepted contracts |
| `FE` | Frontend Developer | Claude Code | React, PixiJS, CSS/layout, frontend state and isolated client integration |
| `QA` | QA Reviewer | Fresh independent Codex review session | Read-only merge-gate review |
| `IA` | Independent Auditor | Gemini CLI by default | High-risk security/concurrency/economy/migration/reward-integrity audits |
| `MW` | Mechanical Worker | DeepSeek via Aider | Explicit Class C fixtures/data transforms/mechanical work only |
| `PP` | Local Pair Programmer | Default GitHub Copilot | Local assistance to current owner; no independent authority |

Role authority always comes from `docs/agents/**`, never from model/provider identity.

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

**Status:** DONE
**Outcome:** provider-independent governance, validated monorepo/runtime foundation and a visible project-control plane.
**Human gate:** completed for TASK-003; Human Owner accepted the final roadmap baseline.

#### STORY-00.1 — Agent governance

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-000` Agent Governance Baseline | B | DONE | PM → ChatGPT | QA + IA | none | Completed | — | Canonical roles; authority matrix; tool adapters; Git gates |

#### STORY-00.2 — Engineering/runtime foundation

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-001` Project Foundation | B | DONE | LD → historical implementation surface | QA | `SK-TDD` applicable retrospectively | Completed | TASK-000 | Workspace; web/API/realtime skeletons; shared packages; CI |
| `TASK-002` Cloudflare Runtime Modernization | B | DONE | LD → Copilot CLI | QA | `SK-CF-WR`, `SK-CF-DO` | Completed | TASK-001 | Wrangler 4; declarative DO export; build/smoke validation |

#### STORY-00.3 — Project visibility/control

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-003` Project Control Roadmap | B | DONE | PM → ChatGPT | QA | external-skill discovery only | Completed | TASK-000/001/002 | Hierarchy; sequencing; roles/agents/skills; Markdown truth; deterministic HTML generator/check; dashboard |

**Exit:** Human Owner accepted TASK-003; the two roadmap artifacts are the project tracking baseline.

---

### EPIC-01 — Core Domain & Universal Combat Foundation

**Status:** DONE
**Outcome:** stable domain vocabulary/data contracts and the single deterministic Combat Engine used by all battle content.
**Why first:** every later battle mode depends on this layer; building content before it would duplicate rules and create migration debt.

#### STORY-01.1 — Core domain contracts

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-004` Domain Glossary & Core Model Spec | A | DONE | PM → ChatGPT | QA; IA optional | `SK-GAME-ARCH`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | Completed — Human Owner accepted spec | TASK-003 | Pokémon/combatant identity; stats; moves; types; abilities; items; effects; teams; PvE world/map/zone/encounter vocabulary; invariants; frontend execution-surface alignment; upstream Pokémon data-source policy alignment; Pokémon reference-skill policy |
| `TASK-005` Core Domain Type Skeleton | B | DONE | LD → Copilot CLI | QA | `SK-TDD` | Completed — PM accepted; no semantic drift | TASK-004 | Implement nominal/opaque canonical IDs; exact `StatKey` + complete `StatBlock`; type/compiler guards; only additional structures directly derivable from SPEC-001; no game logic or downstream schemas |
| `TASK-006` Static Game Data Schema & Rules Versioning | A | DONE | PM → ChatGPT | QA | `SK-GAME-ARCH`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | Completed — Human Owner accepted SPEC-002 | TASK-004/005 | Separate schemaVersion/gameDataVersion/rulesVersion + explicit compatible pairs; immutable rules resolution/retention envelope; logical sharded game-data bundle with NFC deterministic artifacts, SHA-256 content/provenance/bundle binding; PokémonDB DATA-only extraction whitelist vs local normalized fields; source-coverage inventory reconciliation; species/form mapping roster with distinct SpeciesId + baseSpeciesId and no FormId; Species/Move/Type/Ability/Item/Learnset v1 schemas; current type chart factual reference only; future Zone/Encounter/Hunt schema extension remains TASK-033/034-owned; no runtime web dependency or alternate-provider fallback |

**Pokémon data-source policy for TASK-006:** PokémonDB (`pokemondb.net`) is the project's
primary **external factual source of truth** for Pokémon reference data selected by the
Human Owner. PokeNexus runtime/game logic must never depend on live PokémonDB requests.
Instead, an explicit ingestion run produces immutable local snapshots which are validated,
normalized and then published through the accepted `gameDataVersion` / checksum model.

The ingestion scope is **DATA only**. It must not collect or publish images, sprites,
icons, audio, other assets, editorial prose, page layout or styling. HTML may be fetched
only as transient parser input; any local HTML cache is non-canonical working state and
must not be published as game data. "Raw snapshot" in this project means raw **extracted
fields**, not a preserved copy of the source page.

The existing `pokemondb_moves_crawler_v2.py` from the Human Owner's prior project is an
implementation reference for retry/backoff, cache, checkpoint/resume, diagnostics,
atomic canonical promotion and deterministic fingerprinting. TASK-006 must adapt it to
the PokeNexus source policy rather than copy it unchanged: canonical Pokémon reference
fields must not silently fall back to PokeAPI or another provider. Missing/conflicting
PokémonDB data becomes a validation finding requiring an explicit project decision.

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
- never silently fall back to another upstream source when PokémonDB disagrees or is
  unavailable; discrepancies must be escalated for explicit Human Owner/PM decision.

**Accepted TASK-006 DATA whitelist v1:**

The approved initial ingestion profile is deliberately narrow. A field belongs in the baseline only when an
already-planned PokeNexus system needs the factual input. Additional PokémonDB data can be added later by
publishing a new immutable snapshot/schema version; "available upstream" is not sufficient justification.

**Approved baseline v1:**

- **Species/form identity:** `SpeciesId` remains the canonical PokeNexus identity for the exact accepted
  static definition; National Dex number is non-unique source/reference data, with source slug/name,
  introduced generation, form/variant label and generation/game qualifier captured where PokémonDB exposes
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

**Deferred/conditional fields — excluded from the baseline until an owning task adopts a concrete need:**

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

**Exit criteria:** one shared engine resolves battle state/events deterministically; tests prove replayability; measured budgets show TypeScript is viable for expected workloads.

**Safe parallelization:** after TASK-008 is accepted, TASK-009 is the primary owner. TASK-010 can begin only after stable public engine interfaces exist. Client design exploration may run in parallel, but must not invent combat semantics.

**Production combat-rule content gate:** TASK-009 implements the accepted resolver plus explicit
fixtures; it must not invent broad status-Move/Ability/complex-Move semantics. Before Solo/Duo/PvP
or other production content relies on those mechanics, materialize a separately owned versioned
combat-rule content/catalog task (or an explicit accepted Class A extension) that publishes rule
content under the SPEC-002 rulesVersion envelope.

---

### EPIC-02 — Persistence, Identity & Security Foundation

**Status:** ACTIVE — persistence model approved; TASK-014 next
**Outcome:** server-authoritative player identity/state on PostgreSQL with an accepted security model.
**High-risk areas:** database strategy, authentication and security are Class A; independent audit is mandatory where governance requires it.

#### STORY-02.1 — Persistence architecture

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-012` ADR-005 Persistence & Data Access Strategy | A | DONE | PM → ChatGPT | QA + IA | `SK-PG` | Completed — Human Owner accepted ADR-005; repository completion authorized/completed | TASK-005/006 | Managed PostgreSQL; PostgreSQL 17 SQL-feature baseline; cache-disabled Hyperdrive authoritative access; invocation-local pg client over transaction-mode pooling; SQL-first adapters/migrations; UUIDv7 durable IDs; command concurrency boundaries; direct migration path; game-core isolation |
| `TASK-013` PostgreSQL Schema v1 | A | DONE | PM → ChatGPT | QA + IA | `SK-PG` | Completed — Human Owner accepted SPEC-004; repository completion authorized/completed | TASK-012 | PostgreSQL 17 `pokenexus` schema; AccountId/PlayerId identity; reversible bytea codec for opaque strings; Pokémon ownership + stable SpeciesId + Level/IV; Team aggregate + ownership-safe membership; inventory aggregate root; versioned binary Hunt checkpoint + OCC; reward/audit ledger foundation; downstream rule deferrals |
| `TASK-014` Database Adapter & Migration Foundation | B | PLANNED | LD → Copilot CLI | QA | `SK-PG`, `SK-TDD` | PM acceptance | TASK-013 | Package adapter; migrations; transaction helpers; test DB strategy; rollback/recovery tests |

#### STORY-02.2 — Authentication and sessions

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-015` ADR-006 Authentication / Authorization / Session Model | A | PLANNED | PM → ChatGPT | QA + **IA required** | `SK-THREAT`, `SK-API-SEC` manual-review | **HUMAN accepts ADR** | TASK-012 | Threat model; account states including active/disabled/deleted/recovered; session issuance/rotation/expiry/revoke-all; recovery/credential-change invalidation; authorization matrix; rate/abuse boundaries; audit-event taxonomy with secret/token exclusion; retention/privacy; account deletion/export expectations |
| `TASK-016` Authentication & Session Implementation | B | PLANNED | LD → Copilot CLI | QA + **IA required** | `SK-TDD`, `SK-THREAT`, `SK-SECRETS` | **HUMAN security acceptance** | TASK-015 | Auth endpoints/middleware; session issuance/persistence/rotation/expiry/revoke-all; recovery/credential-change invalidation; account-state enforcement; rate/error handling; security tests and audit emission without secrets/tokens |
| `TASK-017` Player Profile API & Persistence | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD`, `SK-PG`, `SK-CF-WBP` reference-only | PM acceptance | TASK-014/016 | Create/load player; profile contract; ownership authorization; idempotency; integration tests |
| `TASK-018` Persistence/Auth Recovery, Contract & Baseline Auditability Suite | B | PLANNED | SD → Codex | QA; IA spot-check | `SK-TDD`, `SK-PG`, `SK-SECRETS` | No unless recovery/auditability policy changes | TASK-014/016/017 | Failure/retry cases; authorization matrix; migration test; issuance/rotation/expiry/revoke-all/recovery-invalidation cases; correlation IDs; auth/security audit-event substrate and retention/privacy checks; no-secret/token evidence; prove baseline exists before reward-bearing/realtime features |

**Exit criteria:** authenticated player state can be created/read/updated through authoritative APIs with tested persistence/security boundaries and enough correlation/audit evidence to diagnose later multiplayer and reward-integrity failures.

`TASK-076/077` later expand operational observability, SLOs, dashboards and tracing. They do not create the first audit trail for security/rewards; the minimum evidence boundary is established here by TASK-018.

**Safe parallelization:** persistence implementation and authentication implementation may proceed in separate tasks only after their Class A contracts are accepted and shared account/player identifiers are frozen.

---

### EPIC-03 — Trainer, Collection, Team, Inventory & Progression

**Status:** PLANNED
**Outcome:** a persistent trainer owns Pokémon/items, builds teams and progresses through server-authoritative rules.

#### STORY-03.1 — Pokémon ownership and team model

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-019` Pokémon Instance / Collection / Team Spec | A | PLANNED | PM → ChatGPT | QA | `SK-GAME-ARCH`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | **HUMAN accepts product rules** | TASK-004/006/008/013 | Instance identity; level/stats/Ability snapshot and selection rules; ownership; persistent selected Move Loadout/order + mutation rules constrained by SPEC-003; roster/team constraints |
| `TASK-020` Collection & Team Domain/Persistence Implementation | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD`, `SK-PG` | PM acceptance | TASK-019/014 | Domain services; repositories; persist/validate ordered selected Move Loadout; team validation; atomic updates; tests |

#### STORY-03.2 — Progression, inventory and reward integrity

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-021` XP / Level / Progression Rules Spec | A | PLANNED | PM → ChatGPT | QA | `SK-GAME-ARCH` | **HUMAN accepts progression rules** | TASK-019 | XP sources; level curves; preserve accepted global Pokémon hard Level Cap `200` unless Human Owner explicitly changes it; new generations/regions do not automatically raise the cap; define post-cap/endgame progression outside Level; evolution hooks if applicable; versioning |
| `TASK-022` Inventory / Item Model Spec | A | PLANNED | PM → ChatGPT | QA | `SK-GAME-ARCH`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | **HUMAN accepts item semantics** | TASK-006/013/019 | Item-definition semantics over the TASK-006 catalog; stackability/quantity vs per-copy identity; consumables; Potion/healing semantics and explicit revival semantics only if accepted; capture items such as Poké Balls; equipment/TMs if in scope; inventory limits; use/consume/mutation contracts |
| `TASK-023` Reward Ledger & Integrity Model | A | PLANNED | PM → ChatGPT | QA + IA recommended | `SK-THREAT`, `SK-PG` | **HUMAN accepts reward authority model** | TASK-013/021/022 | Idempotent grants; source attribution; immutable rules/game-data snapshot identity; replay/duplicate protection; audit trail; rollback semantics |
| `TASK-024` Progression / Inventory / Reward Implementation | B | PLANNED | LD → Copilot CLI | QA; IA for reward-integrity paths | `SK-TDD`, `SK-PG` | PM acceptance | TASK-018/021/022/023 | XP grants; item mutations; reward transactions; emit reward audit events on the TASK-018 substrate; integration tests |
| `TASK-025` Player State API Integration | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD`, `SK-CF-WBP` reference-only | PM acceptance | TASK-020/024 | Collection/team/inventory/progression endpoints, including ordered Move-loadout mutation when accepted by TASK-019; authz; optimistic/idempotent command handling |

**Exit criteria:** authenticated players have authoritative collection/team/inventory/progression state suitable for gameplay rewards and team selection.

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
| `TASK-033` PvE World/Map, Zone & Solo Hunt Rules/Lifecycle Spec | A | PLANNED | PM → ChatGPT | QA | `SK-GAME-ARCH`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | **HUMAN accepts PvE/Hunt rules** | TASK-008/019/021/023 | Define World/Map → Zone → Hunt navigation/progression model; zone availability/unlocks at rule level; selecting/entering a Zone/Hunt; Hunt start/end/cancel/restart including reset-abuse policy; one Hunt = one combat-cadence continuity scope; continuing player Pokémon HP across encounters with no automatic Battle-boundary heal; deterministic inter-Battle time; cadence-effect continuation/ticks/KO between encounters; when item/Potion commands may occur and their ordering against due effect boundaries using TASK-022 semantics; encounters; Pokémon Team/lineup continuation after KO, including automatic activation of the next living eligible Pokémon and a mandatory intervention state before any new Battle when no living eligible Pokémon remains; accepted intervention choices such as Revive/item action or return to city; KO/recovery; respawn; capture hooks; reward/drop rules and cadence; checkpoint/claim semantics; no combat-engine mode fork |
| `TASK-034` PvE World/Zone, Encounter & Hunt Data | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD` | **HUMAN content sample validation** | TASK-006/033 | Implement accepted world/map-zone content structure; Zone definitions; map/zone relationships; encounter tables; versioned Hunt/Zone reward and item-drop tables/content inputs where approved; all deterministic content published through TASK-006 immutable version/provenance envelope; deterministic selection; level/rule inputs; data validation |
| `TASK-035` Solo Hunt Simulation Engine | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD`, `SK-GAME-PERF` | PM acceptance | TASK-009/033/034 | Event-driven encounter loop; Hunt orchestration/AI policy executes the accepted ordered Move-sequence policy, carries actor GCD/per-Move readiness/sequence cursor and cadence-scoped effect state across encounters, advances inter-Battle effects through the shared TASK-009 rule evaluator, handles pre-next-Battle KO, deterministically continues with the next living eligible Pokémon when available or blocks before Battle creation in the accepted no-living intervention state, and supplies versioned ActionIntents to shared Combat Engine; no realtime tick or parallel effect math |
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
| `TASK-042` ADR-007 HUB Realtime State & Protocol | A | PLANNED | PM → ChatGPT | QA + **IA required** | `SK-CF-DO`, `SK-THREAT`, `SK-GAME-ARCH` | **HUMAN accepts ADR** | TASK-015/017/026; ADR-003 | HUB room/area identity; presence/movement authority; message envelope; rate limits; ephemeral/persistent boundary; reconnect semantics; do not overload PvE `Zone` vocabulary |
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
| `TASK-049` Duo Hunt Rules & Orchestration Spec | A | PLANNED | PM → ChatGPT | QA | `SK-GAME-ARCH` | **HUMAN accepts Duo rules** | TASK-033/041/045 | Join/start conditions; party roles; action ownership/ActionIntent production outside engine; rewards; failure/leave semantics; shared-engine inputs |
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
| `TASK-055` PvP Ruleset & Execution Model Spec | A | PLANNED | PM → ChatGPT | QA + IA if realtime is proposed | `SK-GAME-ARCH`, `SK-GAME-BAL`, `SK-THREAT` | **HUMAN accepts PvP rules + execution model** | TASK-008/025/041 | Team constraints; player/automation ActionIntent production outside engine; action/switch legality; async vs realtime decision; timers; draw/forfeit; modifiers; no engine fork; if realtime is selected, revise/replace ADR-003 before implementation |
| `TASK-056` Matchmaking, Rating, Reward & PvP Integrity Spec | A | PLANNED | PM → ChatGPT | QA + **IA required** | `SK-GAME-ARCH`, `SK-GAME-BAL`, `SK-THREAT` | **HUMAN accepts competitive/reward/integrity rules** | TASK-055 | Queue/rating model; anti-smurf hooks; reward cadence; disconnect/abuse policy; replay evidence; impossible-command/tamper boundaries |

#### STORY-08.2 — PvP execution and integrity

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-057` PvP Match Orchestrator | B | PLANNED | LD → Copilot CLI | QA + IA concurrency/integrity | `SK-CF-DO`, `SK-TDD` when realtime applies | PM acceptance | TASK-055/056 + accepted realtime ADR if required | Match/session authority; commands; shared Combat Engine; event sequencing; result finalization; no topology implied by implementation |
| `TASK-058` Matchmaking Service / API | B | PLANNED | LD → Copilot CLI | QA | `SK-CF-WBP` reference-only, `SK-TDD` | PM acceptance | TASK-056/057 | Queue entry/leave; pairing; eligibility; idempotency; rate limiting |
| `TASK-059` PvP Replay & Anti-Cheat Enforcement | B | PLANNED | LD → Copilot CLI | QA + **IA required** | `SK-THREAT`, `SK-TDD`, `SK-SECRETS` | **HUMAN controlled integrity acceptance** | TASK-056/057/058 | Implement accepted replay evidence; impossible-command detection; tamper controls; dispute/debug record; abuse telemetry |
| `TASK-060` PvP UI & Match Flow | B | PLANNED | FE → Claude Code | QA | `SK-REACT`, `SK-UI`, `SK-A11Y`, `SK-FE-TEST` | **HUMAN live validation** | TASK-057–059 | Queue; match found; battle state; timers; result/rating; failure/reconnect UX; behavior/E2E coverage |
| `TASK-061` PvP Balance / UAT Gate | A | PLANNED | PM → ChatGPT | QA + IA integrity evidence | `SK-GAME-BAL`, `SK-GAME-PERF` as needed | **HUMAN final PvP/balance acceptance** | TASK-055–060 | Coordinate rule sampling; match fairness; disconnect abuse; reward sanity; live multi-client UAT; rule changes return through accepted spec flow |

**Exit criteria:** PvP is competitive, replayable/auditable and uses no alternate combat-resolution implementation.

---

### EPIC-09 — PvE Expansion: Gyms, Challenges & World Boss

**Status:** PLANNED
**Outcome:** richer PvE content composes the universal Combat Engine with mode-specific rule/orchestration layers.

#### STORY-09.1 — Gyms and Challenges

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-062` Gym / Challenge Rules Spec | A | PLANNED | PM → ChatGPT | QA | `SK-GAME-ARCH`, `SK-GAME-BAL`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | **HUMAN accepts rules/balance model** | TASK-008/021/041 | Entry/min levels; level sync; overcap/penalty modifiers; team constraints; rewards; progression gates |
| `TASK-063` Gym / Challenge Orchestration & Content Data | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD` | **HUMAN content sample validation** | TASK-006/062 | Trainer/opponent data; rule adapters; stage sequencing; shared engine calls; result events |
| `TASK-064` Gym / Challenge UI & Progression Client Integration | B | PLANNED | FE → Claude Code | QA | `SK-REACT`, `SK-UI`, `SK-A11Y` | **HUMAN live/content validation** | TASK-024/025/063 | Selection/progression UI; consume authoritative result/reward flow; badges/unlocks if approved; client states |

#### STORY-09.2 — World Boss

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-065` ADR-009 World Boss Aggregation & Scaling Topology | A | PLANNED | PM → ChatGPT | QA + **IA required** | `SK-GAME-PERF`, `SK-THREAT`; `SK-CF-DO` only if accepted topology uses DO/realtime coordination | **HUMAN accepts topology** | TASK-009/010/011/018/023/041 | Decide asynchronous contribution/independent combat vs synchronous shared combat before choosing infrastructure; aggregation/global state; hotspot avoidance; consistency/failure model; HUB/Duo evidence may inform design but is not a topology prerequisite; synchronous multiplayer requires explicit ADR-003 revision/replacement |
| `TASK-066` World Boss Phases, Contribution & Reward Spec | A | PLANNED | PM → ChatGPT | QA + IA reward-integrity | `SK-GAME-ARCH`, `SK-GAME-BAL`, `SK-THREAT` | **HUMAN accepts boss/reward rules** | TASK-023/065 | Boss phase rules; participant combat parameters; contribution scoring; thresholds; reward model |
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
| `TASK-070` ADR-010 Economy / Trading Model | A | PLANNED | PM → ChatGPT | QA + **IA required** | `SK-THREAT`, `SK-PG` | **HUMAN go/no-go + ADR acceptance** | TASK-023/025/061 | Value boundaries; currencies; tradability; market/direct trade decision; consistency; fraud/RMT threat model |
| `TASK-071` Sources, Sinks, Fees & Trade Rules Spec | A | PLANNED | PM → ChatGPT | QA + IA | `SK-GAME-ARCH`, `SK-GAME-BAL`, `SK-THREAT` | **HUMAN accepts economy/balance** | TASK-070 | Sources/sinks; fees; limits; item/Pokémon eligibility; cooldowns; dispute/cancel behavior |
| `TASK-072` Trading / Market Implementation | B | PLANNED | LD → Copilot CLI | QA + **IA required** | `SK-PG`, `SK-TDD`, `SK-THREAT` | **HUMAN controlled acceptance** | TASK-071 | Atomic exchange/listing; locks; idempotency; authz; audit ledger; failure recovery |
| `TASK-073` Economy Abuse / Fraud / Duplication Controls | B | PLANNED | LD → Copilot CLI | QA + **IA required** | `SK-THREAT`, `SK-SECRETS`, `SK-PG` | **HUMAN risk acceptance** | TASK-072 | Velocity/duplication controls; anomalous flows; audit queries; rollback/freeze hooks; admin evidence |

#### STORY-10.2 — Extended social surfaces

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-074` Profiles, Leaderboards & Social Polish | B | PLANNED | FE → Claude Code | QA | `SK-REACT`, `SK-UI`, `SK-A11Y` | **HUMAN product/UX validation** | TASK-017/025/061 | Public profile/leaderboard UI against accepted APIs; privacy controls; UI states; promote backend additions to separate Task if required |
| `TASK-075` Economy / Social UAT Gate | A | PLANNED | PM → ChatGPT | QA + IA evidence | `SK-THREAT` | **HUMAN final economy/social acceptance** | TASK-070–074 | Coordinate abuse cases; atomicity; privacy; live trade/social workflows; economy sanity; fixes remain separately owned |

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

When this file changes, run `pnpm roadmap:generate` in the same documentation task. The generator parses this Markdown, validates roadmap invariants and writes the standalone HTML with the Markdown SHA-256 embedded in the page. `pnpm roadmap:check` must fail if task IDs/metadata/dependencies are invalid or if the checked-in HTML is stale. The HTML is a derived snapshot; if it disagrees with this Markdown file, **Markdown wins**.

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
