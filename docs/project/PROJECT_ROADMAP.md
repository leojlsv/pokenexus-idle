# PokeNexus Idle — Project Roadmap & Control Plane

> **Canonical project progress/planning source of truth.**
>
> This file answers: where the project is, what comes next, which role/agent executes each step, which skills are applicable, what depends on what, and where the Human Owner must validate.
>
> **Authority note:** this file does **not** redefine governance. `AGENTS.md`, `docs/agents/**`, accepted ADRs and approved specs remain authoritative for role authority, approval gates and technical/product decisions. If this roadmap conflicts with those sources, those sources win and this roadmap must be corrected.
>
> **Specification identities:** `SPEC-018` is the TASK-039 published Hunt catalog delivery contract. The proposed bounded historical authority/frontier for TASK-103 is separately named `SPEC-019` and remains **DRAFT Class-A**, without implementation approval. Neither the roadmap nor a task file promotes that draft to an accepted contract.
>
> **Worktree integration:** canonical local `main` includes the reconciled 116-task control-plane snapshot, completed TASK-107/TASK-108 runtime foundations, the completed TASK-112/113/114 schema-5 data-source/publication chain and completed TASK-115 schema-5 runtime-delivery enablement. Passing `roadmap:check` does not authorize production-pair activation, deploy or public enablement.
>
> **PRODUCT REALIGNMENT CLASS-A ACCEPTED — Human Owner 2026-10-02:** SPEC-020 and SPEC-021 are approved forward authority. Canonical local `main` owns TASK-104 (governance reconciliation), TASK-105 (CI stability), completed TASK-107/TASK-108 runtime foundations and completed TASK-112/113/114/115 static-data/runtime-delivery work. TASK-106 remains the accepted Class-A package in ACCEPTANCE. TASK-109 is in ACCEPTANCE after Human-approved immutable `game-data-core-kanto-johto-v5` publication and fresh independent Class-B `ACCEPT 0/0/0/0`; repository/history integration remains separate. TASK-110/111 remain DRAFT and TASK-039/TASK-103 remain blocked on remaining runtime prerequisites. Production-pair activation, deploy and public enablement remain separately gated.

## 1. Current position

**Project phase:** Foundation, core domain/combat-engine contracts, PostgreSQL persistence/identity/security, canonical static game data, baseline progression/Inventory/Reward persistence, authoritative Move eligibility, Player State API, and the SPEC-012 production combat-rule catalog are integrated.

**Current work:** `TASK-096 — Idle/Gacha Progression & Acquisition Model`, `TASK-097 — Encounter Individualization & Genetics Runtime`, and `TASK-036 — Capture & Reward Resolution` are **DONE** and integrated into canonical `main` after explicit Human Owner repository/history authorization. The integrated implementation preserves correlation-first durable capture replay with frozen RNG-origin binding, exact production-executable Move authority, replay-validated reward-source authenticity, and authoritative TASK-097 IV/Genetics/Profile/Shiny provenance. Atomic Ball debit/Pokémon creation/Species Research/attempt evidence, PostgreSQL concurrency/rollback coverage, Worker compatibility and workspace validation are green. Deploy and production cutover remain separate gates. TASK-035 remains DONE/canonical. The approved acquisition authority includes Genetics/Shiny separation, Hunt-authored encounter rates, structural auto-capture, no Epic+/Apex/capture protection, final Genetic Profiles `Harmony / Might / Clarity / Endurance / Resilience` with exactly two compatible Profiles per Species/form selected 50/50, center-weighted canonical IV generation `U[0,15] + U[0,16]` per stat, exact Genetic Score→Budget bands/interpolation, the Genetic-aware stat formula `2*BaseStat + IV + perStatGeneticBonus` under a new immutable combat rules version, default Genetic Grade probabilities `55/28/12/4/1%`, Shiny `1/16384`, Species Research count-only duplicate progression, fail-closed Genetics/Shiny/Ascendant persistence/legacy authority, the 8–82% capture curve, Genetic capture modifiers, Ball ladder `Poké 1.00 / Great 1.25 / Super 1.50 / Ultra 2.00 / VIP 2.25`, supply hierarchy and reserve-aware visible-condition auto-capture. Human-approved **Ascendant** is `Shiny + Apex` with Resonance across the two frozen compatible Profiles and no higher Score/Budget/stat ceiling.

**Current action:** first-Pre-alpha product/UX is closed, including **D-F16 B**: simultaneous-KO `draw` + successful post-Battle Revive consumes the Encounter as `resolved_non_win`, grants no capture/XP/item reward, consumes the matching pending selection and advances the open-ended Hunt. Initial **Auto-Potion OFF / Auto-Revive OFF** defaults remain fixed; TASK-106 received two Human Revive corrections after its prior QA-ready snapshot: Revive now clears transient effects/status/stages/action locks, and opponent exhaustion seals the Battle result before any Player Revive. The approved Class-A package records both Human corrections plus D-F16 B. All focused architecture findings are integrated in the accepted Class-A package: post-Battle Revive has durable versioned Hunt-level replay provenance; stat-stage cleanup bytes are fixed; generic KO-intervention handles any non-intervention side; D-F16 retains exact consumed PendingEncounterSelection/RNG/content provenance; and SPEC-017 Battle N+1 publication explicitly accepts committed resolved_non_win + settled Revive/cadence effects without fabricated reward/capture rows. Final semantic and architecture/replay delta QA are both **READY P0/P1/P2 = 0/0/0**. The Human Owner accepted the complete Class-A package on **2026-10-02**. SPEC-020 and SPEC-021 are now APPROVED forward authority; affected accepted specs carry forward-amendment pointers. Runtime/implementation, migration, public enablement and Git history remain separately gated. SPEC-020 contains the accepted amendment text; SPEC-021 is the approved persistent-vitality/PokéCenter contract; SPEC-003 is explicitly in the package because in-Battle Revive may intervene before Player replacement/defeat only while the opponent remains alive; opponent exhaustion seals `BattleEnded` first and any later Revive is Hunt-level processing. **Pre-alpha bootstrap** = choose one **Lv. 1** starter from Bulbasaur/Charmander/Squirtle/Chikorita/Cyndaquil/Totodile; initially it is the only owned Pokémon; auto-create a one-member Team with it as Leader; auto-assign up to 4 valid Lv. 1 Moves; grant **50 Poké Balls / 20 basic Potions / 5 Revives**; basic Potion heals **25% max HP**; the five starter Revives restore **25% max HP**; current Revive tiers are **25% / 50% / 100%**; `Wilds` does not replenish Revive; no formal tutorial. `Verdant Edge -> Wilds` is the permanent basic Hunt and open-ended in Pre-alpha. Static wild levels are **Lv.1 50% / Lv.2 35% / Lv.3 15%**. Species weights = **Pidgey 16% / Rattata 15% / Caterpie 18% / Sentret 17% / Ledyba 17% / Sunkern 17%**. Species and level are rolled independently; every species uses **Lv.1 50% / Lv.2 35% / Lv.3 15%**. All are capturable and all six currently have at least one executable Lv.1 progress-capable Move. Provisional XP = **2× wild level Player / 6× wild level Pokémon**, pending later curve reconfirmation. Each completed Encounter independently rolls **15% Poké Ball ×1** and **5% basic Potion ×1**; both may drop together; Revive does not drop. Confirmed Hunt directions include: PvE movement/exploration is automatic; HUB is the sole free-movement exception; **Pre-alpha Solo Hunt auto-Potion** is configured Player-wide/global, uses player-selected HP triggers 90%-10% in 10-point steps with `current HP <= threshold`, always targets the active Pokémon, uses Ball-like item permission/priority/fallback/minimum-reserve management, may execute during Battle and between Battles, consumes one action opportunity when applied, resolves after same-boundary damage/DoT (0 HP proceeds to KO/Revive instead of Potion), has a 5s per-target cooldown, works offline and never revives; Encounter rewards are not post-Hunt grants; checkpoint/claim are internal automatic reconciliation rather than player buttons; Retreat remains a manual strategic intervention returning to HUB; capture is management/automation with no per-Encounter manual capture/Ball prompt; automation policies may change during an active Hunt; same-Zone no-free-reroll remains; recovery blocks all Solo Hunt starts Player-wide for **30s** after Retreat/defeat while HUB/management remain available; **Pokémon HP persists across Hunts**; PokéCenter healing is free/immediate for the selected/active Team and restores KO members to conscious/max HP; damaged/partially-KO Teams may Start provided at least one selected member is conscious; **Revive is automatic Hunt policy** targeting only the Leader/active Pokémon KO'd in the current Hunt, with **25% / 50% / 100%** item tiers, one consumed action opportunity, Ball/Potion-like allowed-item priority/fallback/minimum-reserve policy, repeated use allowed by Inventory/policy/reserve and offline execution. While the opponent remains alive, Revive is evaluated before Player replacement/defeat; if opponent exhaustion already sealed `BattleEnded`, Revive is post-Battle only and cannot rewrite winner/draw, capture or victory reward. Successful Revive clears transient buffs/debuffs/DoTs/HoTs/status/action locks and resets stat stages while preserving Move cooldowns/cursor; Hunt duration is content-dependent, finite Hunts return automatically to HUB, initial offline progression cap is **8h**, and offline return gets a detailed activity/resource summary. A stamina-like offline-progression mechanic remains exploratory only. **First Pre-alpha slice:** Hunt / Pokémon / Teams / Inventory / Settings + functional non-locomotion HUB; Cards-only Hunt presentation; full offline 8h flow; active-Hunt Capture/Potion/Revive policy editing; captured Pokémon immediately usable in Collection/Teams; evolution deferred. `TASK-039` and `TASK-103` are now contract-rebased at task-definition level and **BLOCKED** on separately scoped/authorized post-Class-A runtime prerequisites; their existing source/evidence remains preserved.

**Next task after TASK-003 acceptance:** TASK-107/TASK-108 and TASK-112/TASK-113/TASK-114/TASK-115 are DONE and integrated into canonical local `main`; TASK-115 closed with clean schema-5 runtime-delivery QA, fresh independent Class-B PM/architecture `ACCEPT 0/0/0/0` and Human-authorized repository-history integration. TASK-109 (bootstrap/Wilds/admission) is ACCEPTANCE with exact-current `TECH READY + INTEGRITY READY 0/0/0/0`, Human-approved immutable schema-5 `game-data-core-kanto-johto-v5` publication and fresh independent Class-B `ACCEPT 0/0/0/0`; repository/history integration remains separate. TASK-110 follows after 109, and TASK-111 (Inventory UI) remains DRAFT. TASK-103 remains blocked until TASK-110 authority exists, then TASK-039 remains blocked until TASK-109/110/103. TASK-100 remains its pre-existing ACTIVE Collection/Team UI task. Production-pair activation, deploy and public enablement remain separately gated.

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
| `TASK-087` Static Game Data Catalog & Ingestion Implementation | DONE — corrected v2 published; v1 preserved; all post-promotion gates clean; corrective history explicitly authorized and integrated |
| `TASK-093` Gameplay Systems & Player Experience Consultant Governance | DONE — independent QA READY, P0/P1/P2/P3 0/0/0/0; Human Owner accepted and authorized repository history; governance integrated on 2026-09-18 |
| `TASK-089` Move Acquisition / Eligibility Implementation | DONE — accepted implementation integrated at `bd3d036`; historical QA/TECH P2 + IA P3 were evidence-only and are now closed by fresh disposable-PG17 `4/4` PASS; Human Owner authorized repository history/completion |
| `TASK-094` Player State API Contract Spec | DONE — SPEC-011 APPROVED by Human Owner on 2026-09-22 after fresh 6-Team QA READY + IA PASS `0/0/0/0` and reconciled GSC ADVISORY PASS; repository/history completion separately authorized; approved snapshot integrated at `190ef09` |

| `TASK-025` Player State API Integration | DONE — final QA READY + IA PASS `0/0/0/0`; delegated Class B ACCEPT; Human Owner authorized repository/history completion on 2026-09-23; accepted implementation committed at `871c6a7` |
| `TASK-090` Production Move & Ability Rule Content Spec | DONE — SPEC-012 APPROVED; exact profile accepted (`27` simple / `18` authored / `408` unsupported; 147 Abilities inactive-by-policy); GSC ADVISORY PASS, TECH FEASIBILITY PASS, QA READY `0/0/0/0`; Human Owner authorized repository/history completion on 2026-09-23; accepted snapshot integrated at `658ca9e` |
| `TASK-091` Production Combat Rule Catalog Implementation | DONE — owner validation complete; independent QA **READY 0/0/0/0** plus exact-byte packaging re-gate **READY 0/0/0/0**; delegated Class B **ACCEPT 0/0/0/0**; Human Owner content-sample **APPROVED** and repository/history completion authorized 2026-09-23; accepted implementation integrated at `658ca9e` |
| `TASK-034` PvE World/Zone, Encounter & Hunt Data | DONE — Human sample APPROVED; immutable schema-v4 `game-data-core-kanto-johto-v3` published; post-publication QA READY `0/0/0/0`; repository/history authorized and integrated at `91f06de` |
| `TASK-095` Exact Production Combat Rebind for Game Data v3 | DONE — post-integration byte-materialization corrective integrated at `de75e1a`; canonical v2 support bytes restored exactly; corrective QA/Class-B 0/0/0/0 and Human history authorization complete |
| `TASK-035` Solo Hunt Simulation Engine | DONE — accepted deterministic Solo Hunt engine integrated at `4679d42`; formal QA/Class-B `0/0/0/0`; canonical post-integration focused/game-core/API/game-data gates clear |
| `TASK-096` Idle/Gacha Progression & Acquisition Model | DONE — final consolidated Class-A Human acceptance and repository/history completion authorized/integrated 2026-09-26 |
| `TASK-097` Encounter Individualization & Genetics Runtime | DONE — implementation, PostgreSQL integration, QA/IA/Class-B `0/0/0/0`; repository/history completion authorized and integrated 2026-09-26 |
| `TASK-036` Capture & Reward Resolution | DONE — final QA READY, IA PASS and Class-B ACCEPT `0/0/0/0`; repository/history completion authorized and integrated 2026-09-26 |
| `TASK-037` Offline / Elapsed-Time Checkpoint & Claim Engine | DONE — final QA READY, IA PASS and Class-B ACCEPT `0/0/0/0`; repository/history completion authorized and integrated 2026-09-27 |
| `TASK-038` Authoritative Hunt API / Persistence Orchestration | DONE — exact-current QA READY, IA PASS and fresh Class-B ACCEPT with no unresolved P0/P1; Human Owner repository/history completion authorized 2026-09-27; deploy remains separately gated |
| `TASK-101` Retreat Terminal Contract Correction | DONE — accepted Class-B correction to approved SPEC-015 response union; main commit `630db51` source-integrated into TASK-039 worktree on 2026-09-29, Git-history/deployment gates separate |
| `TASK-039` Solo Hunt Card Mode Integration | B | BLOCKED | FE → ChatGPT prime | Fresh QA required after reimplementation | `SK-REACT`, `SK-UI`, `SK-A11Y`, `SK-FE-TEST` | **BLOCKED on TASK-109/110/103; later HUMAN live validation** | TASK-029/038/101/103/106/109/110 + approved SPEC-020/021 | Contract rebase complete; no manual Potion/capture/Checkpoint/Claim; Cards-only policies/feed/Retreat/HUB/PokéCenter/fail-closed. |
| `TASK-102` Public Combat Presentation Source Contract | ACCEPTANCE — SPEC-017 detailed Class-A contract APPROVED by Human Owner 2026-09-29 after independent QA/IA P0/P1/P2=0; only repository/history completion pending, implementation/enablement owned separately by TASK-103 |
| `TASK-103` Authoritative Hunt Presentation Backend | BLOCKED — task-definition contract rebase complete against approved SPEC-020/021: preserve v1, add forward v2 for in-Battle Revive/cleanup, separate Hunt activity, persisted-vitality origin and D-F16 N+1 gate. Existing implementation/evidence is preserved; resume only after prerequisite runtime authority is implemented/gated |
| `TASK-104` Project Governance and Roadmap Reconciliation | DONE — canonical local `main` governance reconciliation integrated after Human authorization on 2026-09-30 |
| `TASK-105` CI Test Discovery and Published-Loader Timeout Stability | DONE — canonical local `main` CI/test-runner correction integrated after Human authorization on 2026-09-30 |
| `TASK-106` Management-First Idle Product Realignment | ACCEPTANCE — Human Owner **APPROVED Class-A 2026-10-02**; SPEC-020/021 approved; semantic + architecture/replay QA READY P0/P1/P2 = 0/0/0; repository/history completion separately gated |
| `TASK-107` Management-First Combat / Cadence Automation Primitives | DONE — independent QA TECH READY P0/P1/P2=0; delegated Class-B acceptance complete; repository/history integrated into local `main` on 2026-10-02; deploy/public enablement separately gated |
| `TASK-108` Persistent Pokémon Vitality & HUB PokéCenter Implementation | DONE — independent QA + Auditor READY P0/P1/P2=0; delegated Class-B acceptance complete; repository/history integrated into local `main` on 2026-10-02; persistent migration/deploy/public enablement separately gated |
| `TASK-109` First Pre-alpha Bootstrap, Wilds Content & Hunt Admission | ACCEPTANCE — owner gates PASS; independent exact-current TECH+INTEGRITY READY `0/0/0/0`; Human-approved immutable schema-5 v5 publication complete; fresh Class-B ACCEPT `0/0/0/0`; repository/history and production activation remain separate |
| `TASK-110` Management-First Hunt Automation, Offline & Provenance | DRAFT — depends on TASK-107/108/109 and separate implementation authorization |
| `TASK-111` First Pre-alpha Inventory Management UI | DRAFT — separate Inventory browsing ownership; no client consume/grant/use authority |
| `TASK-112` Local Pokémon Source Snapshot & Authority Realignment | DONE — SPEC-022 QA READY `0/0/0/0`; Human-approved contract integrated with TASK-113/114 dependency chain on 2026-10-03 |
| `TASK-113` Local Pokémon Source Snapshot Implementation | DONE — post-ACQUIRE QA final TECH/ARCH READY `0/0/0/0`; schema-5 local snapshot/PokéAPI foundation integrated on 2026-10-03 |
| `TASK-114` PokéAPI Promotion Decision & Schema-5 Cutover Contract | DONE — immutable schema-5 v4 publication + repository history integrated; candidate/publication/integration QA READY `0/0/0/0`; runtime/deploy remain separate |
| `TASK-115` Schema-5 Runtime Delivery Enablement | DONE — owner gates PASS; independent QA final TECH READY `0/0/0/0`; fresh independent PM/architecture final ACCEPT `0/0/0/0`; repository-history integration completed on 2026-10-03; production-pair activation/deploy remain separate |
| `TASK-026` UI/UX Architecture, Navigation & Design-System Spec | DONE — FE feasibility READY; independent QA READY; Human visual/UX approved and repository/history completion authorized 2026-09-27 |
| `TASK-027` React App Shell & Navigation | DONE — final responsive QA READY; Human live UI approved and repository/history authorized 2026-09-27 |
| `TASK-028` Combat Event Presentation Contract | DONE — corrective QA READY `0/0/0/0`; delegated Class-B ACCEPT; repository/history authorized 2026-09-27 |
| `TASK-029` Card / Low-Spec Combat Renderer Foundation | DONE — QA READY 0/0/0/0; Class-B ACCEPT 0/0; Human isolated visual preview approved 2026-09-28; full Hunt visual validation TASK-039 |
| `TASK-030` Pixi Combat Renderer Foundation | DONE — QA READY 0/0/0/0; Class-B ACCEPT 0/0; Human isolated visual preview approved 2026-09-28; full Hunt visual validation TASK-040 |
| `TASK-031` Accessibility & Responsive Baseline | DONE — QA TECH READY 0/0; Class-B ACCEPT 0/0; Human Card/Pixi usability checklist and local integration approved 2026-09-28; Hunt-integrated validation TASK-039/040 |
| `TASK-099` Pokémon Sprite Generation Lab | DEFERRED — side-project abandoned by Human Owner; branch/worktree removed; historical ID retained only |

**Next product milestone:** TASK-115 is DONE and integrated after owner validation, independent QA `0/0/0/0`, fresh independent PM/architecture final `ACCEPT 0/0/0/0` and Human-authorized repository-history integration. TASK-109 is ACCEPTANCE with implementation/QA/integrity, Human-approved immutable v5 publication and fresh independent Class-B `ACCEPT 0/0/0/0` complete; repository/history integration remains separate. TASK-110 follows in dependency order after TASK-109. Unblock TASK-103 after TASK-110 provides the remaining authoritative runtime facts, then unblock TASK-039 after TASK-109/110/103. TASK-111 remains the separate Inventory browsing slice. Production-pair activation/deploy/public enablement remain separate.

### Portfolio progress

- Planned task IDs in this roadmap: `TASK-000` through `TASK-115`.
- DONE: 59.
- DRAFT: 2.
- READY: 0.
- ACTIVE: 1.
- FIX: 0.
- REVIEW: 0.
- ACCEPTANCE: 3.
- BLOCKED: 2.
- DEFERRED: 1.
- PLANNED: 48.
- Task-count completion: **59 / 116 = 50.9%**.

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
- For factual Pokémon data selected for ingestion, current authority is SPEC-002/SPEC-008 as amended by **APPROVED SPEC-022**: provider authority is field-specific, normal ingestion consumes immutable local snapshots only, and canonical IDs/form adoption remain local/Human-owned. These skills never override that policy and must not silently supply missing canonical fields.
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

**Status:** IN PROGRESS — accepted domain/data/combat contracts and Combat Engine are complete; TASK-092/SPEC-008 and TASK-087 canonical static data are integrated; TASK-090/SPEC-012 and TASK-091 production combat-rule content are DONE/integrated
**Outcome:** stable domain vocabulary/data contracts and the single deterministic Combat Engine used by all battle content.
**Why first:** every later battle mode depends on this layer; building content before it would duplicate rules and create migration debt.

#### STORY-01.1 — Core domain contracts

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-004` Domain Glossary & Core Model Spec | A | DONE | PM → ChatGPT | QA; IA optional | `SK-GAME-ARCH`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | Completed — Human Owner accepted spec | TASK-003 | Pokémon/combatant identity; stats; moves; types; abilities; items; effects; teams; PvE world/map/zone/encounter vocabulary; invariants; frontend execution-surface alignment; upstream Pokémon data-source policy alignment; Pokémon reference-skill policy |
| `TASK-005` Core Domain Type Skeleton | B | DONE | LD → Copilot CLI | QA | `SK-TDD` | Completed — PM accepted; no semantic drift | TASK-004 | Implement nominal/opaque canonical IDs; exact `StatKey` + complete `StatBlock`; type/compiler guards; only additional structures directly derivable from SPEC-001; no game logic or downstream schemas |
| `TASK-006` Static Game Data Schema & Rules Versioning | A | DONE | PM → ChatGPT | QA | `SK-GAME-ARCH`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | Completed — Human Owner accepted SPEC-002 | TASK-004/005 | Separate schemaVersion/gameDataVersion/rulesVersion + explicit compatible pairs; immutable rules resolution/retention envelope; logical sharded game-data bundle with NFC deterministic artifacts, SHA-256 content/provenance/bundle binding; Bulbapedia-primary / PokémonDB-complementary DATA-only source policy; source-coverage inventory reconciliation; species/form mapping roster with distinct SpeciesId + baseSpeciesId and no FormId; Species/Move/Type/Ability/Item/Learnset schemas; current type chart factual reference only; future Zone/Encounter/Hunt schema extension remains TASK-033/034-owned; no runtime web dependency or opportunistic provider fallback |
| `TASK-092` SpeciesDefinition Static-Fact Audit & Extension Spec | A | DONE | PM → ChatGPT | DoR QA READY `0/0/0/0`; original final QA NOT READY `0/1/0/0`; corrected option-1 Pokémon-domain review PASS advisory `0/0/0/0`; final independent QA READY `0/0/0/0` | `SK-GAME-ARCH`; `SK-PKM-DEX` reference-only | Completed — Human Owner accepted SPEC-008 v2 direction, approved **option 1**, and authorized repository history/completion on 2026-09-18 | TASK-006/093 | SPEC-008 APPROVED and integrated. Persistent Species/forms keep the applicable v2 contract and genuine SourceFact states. Mega/Eternamax/battle-only transformations are explicit excluded/deferred source inventory, not separately captured/persisted SpeciesDefinition identities and do not force fake availability wrappers. No transformation-profile catalog is added in schema v2; activation/reversion and the future transformed profile remain future rulesVersion/schema-extension work |
| `TASK-087` Static Game Data Catalog & Ingestion Implementation | B | DONE | LD → ChatGPT delegated worker | Pre-promotion gates clean; post-promotion TECH/ARCH **FINAL READY** `0/0/0/0`, dependency/debt/governance **FINAL READY** `0/0/0/0`, independent QA **FINAL READY** `0/0/0/0`, Class B acceptance **ACCEPTED** `0/0/0/0` | `SK-TDD`, `SK-GAME-ARCH`; `SK-PKM-DEX` reference-only | Completed — Human data gate approved `a620dd9b…a468b`; corrective commit/push/main integration explicitly authorized 2026-09-21 | TASK-005/006/092 | Corrected v2 published: 293 Species / 547 Moves / 19,035 Learnsets, `bundleHash fc4ecaac…052b4`; canonical roster has 552 accepted Move identities preserving five historical mappings; v1 unchanged at `bbe511…02903`; same-version v2 republish is byte-idempotent |
| `TASK-112` Local Pokémon Source Snapshot & Authority Realignment | A | DONE | PM → ChatGPT | Independent pre-implementation QA **READY `0/0/0/0`** | N/A | **COMPLETED — Human-approved SPEC-022 plus TASK-114-scoped repository/history integration 2026-10-03** | TASK-006/087/092 | Local-only source architecture integrated: explicit Human-gated ACQUIRE; offline deterministic INGEST/PUBLISH; field-specific authority; pinned PokéAPI dataset authority where approved |
| `TASK-113` Local Pokémon Source Snapshot Implementation | B | DONE | LD → ChatGPT coding agent | Post-ACQUIRE independent QA **final TECH/ARCH READY `0/0/0/0`** | N/A | **COMPLETED — required schema-5/local-snapshot dependency integrated with TASK-114 on 2026-10-03** | TASK-087/092/112 | Schema-5 SourceSnapshotRecord + multi-file provenance; pinned PokéAPI snapshot ingest; low-ambiguity structured facts; local parity/diff; no runtime upstream access |
| `TASK-114` PokéAPI Promotion Decision & Schema-5 Cutover Contract | A | DONE | PM → ChatGPT | Pre-implementation QA **READY `0/0/0/0`**; migration/candidate QA **READY `0/0/0/0`**; publication-path + integration QA **READY `0/0/0/0`** | N/A | **COMPLETED — Human-authorized schema-5 publication + repository/history integration 2026-10-03; runtime/deploy separate** | TASK-112/113 | Immutable `game-data-core-kanto-johto-v4` schema 5 integrated at `version-3544a59c…be47c`; exact 87 fields / 83 records; 1,146/1,146 historical evidence including disclosed +2 context records; bundle `fc37e5e9…23346`; post-publication sanity/v3 comparison PASS |
| `TASK-115` Schema-5 Runtime Delivery Enablement | B | DONE | LD → ChatGPT coding agent | Owner gates PASS; independent QA final TECH READY `0/0/0/0`; fresh independent PM/architecture final ACCEPT `0/0/0/0`; post-merge gates PASS | `SK-TDD`, `SK-CF-WR` | **COMPLETED — Human Owner authorized implementation and repository-history integration 2026-10-03; production-pair activation/deploy/public-enable separate** | TASK-006/087/114 | Explicit runtime support for schema 3/4/5; exact v4 schema-5 load/hash validation; unknown future schemas fail closed; no inferred production rules/data compatibility |

**Pokémon data-source policy for TASK-006/TASK-087:** the current SPEC-002 hierarchy is
Bulbapedia-primary with PokémonDB as an approved complementary factual source. A complementary
source may fill explicitly permitted gaps or support structural cross-checking, but it never
silently overrides a structured Bulbapedia fact. PokeNexus runtime/game logic must never depend on
live upstream requests. Controlled ingestion produces immutable local snapshots which are validated,
normalized and then published through the accepted `gameDataVersion` / checksum model.

**APPROVED TASK-112 / SPEC-022 amendment:** the Human Owner directed that ordinary runtime, CI/build,
ingestion and publication use only local/immutable data. SPEC-022 therefore defines a separate
explicit Human-gated source-acquisition phase, field-specific provider authority, and an exact pinned
local PokéAPI v2 source dataset for approved structured fields. Independent pre-implementation QA is
READY `0/0/0/0`, and the Human Owner accepted the exact contract on 2026-10-02. Dependent local-only
implementation may proceed; ACQUIRE/publication/Git-history/deployment remain separately gated.

The ingestion scope is **DATA only**. It must not publish images, sprites, icons, audio, other assets,
editorial prose, page layout or styling. Third-party source bytes may be obtained only during an
explicitly Human-authorized **ACQUIRE** operation and are retained as immutable maintenance evidence
under SPEC-022; normal INGEST/PUBLISH reads only those local bytes. Source snapshots are never runtime
authority and are not published as gameplay catalogs.

The existing `pokemondb_moves_crawler_v2.py` from the Human Owner's prior project is an
implementation reference only for operational patterns such as retry/backoff, cache,
checkpoint/resume, diagnostics, atomic promotion and deterministic fingerprinting. Its source
fallback behavior is not authoritative for PokeNexus. Provider choice and disagreement handling
must follow SPEC-002/SPEC-008 as amended by SPEC-022. Opportunistic fallback remains disallowed;
PokéAPI is permitted only through the pinned local source-dataset fields explicitly approved there.

The historical TASK-006 web-provider requirements remain applicable to SPEC-022 **ACQUIRE** where
the selected provider is a web surface:

- acquire only the exact factual fields/pages/surfaces approved for that one Human-authorized request;
- avoid copying editorial prose, page layout/design or unrelated site content;
- respect the current `robots.txt`, use a descriptive User-Agent, cache responses and use
  conservative throttling/backoff (never faster than the site's current crawl policy);
- fail closed if robots/access rules change rather than silently bypassing restrictions;
- emit an immutable local source snapshot with exact locator/revision where available, retrieval
  timestamp and source-content hashes; parser/versioned normalization happens later in local INGEST;
- require explicit Human authorization per ACQUIRE; routine CI/build/INGEST and runtime never crawl;
- require validation before a snapshot can become canonical PokeNexus game data;
- never silently substitute a provider or override the field-specific authority matrix; unresolved
  identity/binding/source gaps fail closed.

**Accepted TASK-006 DATA whitelist v1:**

The following records the original baseline data scope. Current provider authority and acquisition
placement are governed by approved SPEC-022 where that later contract differs.

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
| `TASK-090` Production Move & Ability Rule Content Spec | A | DONE | PM → ChatGPT project coordination | GSC **ADVISORY PASS** + TECH FEASIBILITY **PASS** + independent QA **READY 0/0/0/0**; IA N/A | `SK-GAME-ARCH`, `SK-GAME-BAL`; `SK-PKM-DEX` reference-only | **COMPLETED — Human Owner accepted all six SPEC-012 decisions and authorized repository/history completion 2026-09-23** | TASK-006/008/011/087; informed by TASK-088/089/025 | SPEC-012 APPROVED + exact companion profile: all 453 v2 level-up Moves classified (`27` simple / `18` authored / `408` unsupported), all 147 Abilities explicit inactive-by-policy; enemy-normalized target option 2; level-up ∩ executable production selection; production-subset + per-Species/per-level gate; integrated at `658ca9e` |
| `TASK-091` Production Combat Rule Catalog Implementation | B | DONE | LD → ChatGPT delegated implementation worker | Independent QA **READY 0/0/0/0** + exact-byte packaging re-gate **READY 0/0/0/0**; delegated PM Class B **ACCEPT 0/0/0/0** | `SK-TDD`, `SK-GAME-ARCH`, `SK-GAME-PERF` | **COMPLETED — Human Owner content sample APPROVED and repository/history completion authorized 2026-09-23** | TASK-090 / APPROVED SPEC-012 | Exact profile materialized and hash-bound: 453 Moves (`27` simple / `18` authored / `408` unsupported), 147 inactive Abilities; level-up ∩ executable integrated through TASK-089/TASK-025; all-293/all-level evidence + replay + PG17/Worker/workspace gates PASS; integrated at `658ca9e`. TASK-011 current-condition control shows no TASK-091 regression; historical absolute cadence floor is not reproducible today even on exact pre-task HEAD and remains explicitly qualified |
| `TASK-095` Exact Production Combat Rebind for Game Data v3 | B | DONE | LD → ChatGPT | Corrective QA **READY 0/0/0/0**; corrective Class-B **ACCEPT 0/0/0/0** | `SK-TDD`, `SK-GAME-ARCH` | **Corrective repository history authorized and integrated 2026-09-24** | TASK-006/025/034/090/091 | Accepted combat/rules semantics unchanged. Corrective `de75e1a` pins v2 as byte-immutable `-text`; canonical main now materializes exact `230244` bytes / `6a578d74…59b57` and postbuild passes. Original descriptor/cross-pair/alias protections remain unchanged; no SPEC-012 drift |

**Exit criteria:** one shared engine resolves battle state/events deterministically; tests prove replayability; measured budgets show TypeScript is viable; canonical Species/Move/Ability/Learnset data is published through TASK-087; and the production Move/Ability rule-content subset required by MVP is accepted and implemented through TASK-090/091.

**Safe parallelization:** the completed TASK-007..011 engine line remains frozen. TASK-092, TASK-087, TASK-024, TASK-088, TASK-089, TASK-094, TASK-025, TASK-090, TASK-091, TASK-095, TASK-035, TASK-096, TASK-097, TASK-036, TASK-037, TASK-098 and TASK-038 are DONE. Downstream tasks may treat TASK-038 as the canonical accepted server-authoritative Hunt API/persistence layer; their own prerequisites and gates still apply.

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

**Status:** IN PROGRESS — TASK-089 authoritative Move eligibility, TASK-094 / APPROVED SPEC-011, and TASK-025 Player State API Integration are DONE; production Move/Ability content remains separately planned
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
| `TASK-022` Inventory / Item Model Spec | A | DONE | PM → ChatGPT | Fresh QA READY + **IA PASS** after replay/idempotency fix; reconciled current-main QA READY + IA PASS; P0/P1/P2/P3 `0/0/0/0` | `SK-GAME-ARCH`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | Completed — Human Owner accepted SPEC-007 semantics and authorized repository history/completion on 2026-09-18; revival clauses are now historical baseline under TASK-106 realignment | TASK-006/013/019/093 | **APPROVED SPEC-007 integrated historical baseline:** fungible quantity ownership; no gameplay capacity/stack cap; fail-closed overflow; atomic consume/effect; durable source/command correlation prevents replay double-consume; shared Potion evaluator; revival was deferred in the accepted baseline but Human Owner 2026-10-01 now requires Revive inside Hunts, so coordinated Class-A reconciliation is pending; TM TASK-088-owned; every valid accepted capture attempt consumes one item whether success or failure |
| `TASK-023` Reward Ledger & Integrity Model | A | DONE | PM → ChatGPT | QA **READY** + two IA **PASS**, P0/P1/P2/P3 `0/0/0/0` | `SK-THREAT`, `SK-PG` | Completed — Human Owner accepted APPROVED SPEC-009 and authorized repository closure on 2026-09-22 | TASK-013/021/022 | APPROVED SPEC-009 integrated: one immutable Reward Resolution per server-authoritative source, then atomic canonical sibling effects + Reward Completion with replay/conflict/OCC/version/privacy/correction invariants; no cadence/scarcity/economy semantics introduced |
| `TASK-024` Progression / Inventory / Reward Implementation | B | DONE | LD → ChatGPT delegated implementation worker (Copilot quota unavailable) | Final QA **READY** + final IA **PASS**, P0/P1/P2/P3 `0/0/0/0`; Class B functional/architectural acceptance **PASS**; PostgreSQL/API/Worker/workspace gates green | `SK-TDD`, `SK-PG` | Completed — Human Owner authorized repository history/completion on 2026-09-22 | TASK-018/021/022/023/087 | Integrated to `main` at `5bbf540`. Immutable exact context remains historically resolvable while new-use eligibility is evaluated separately for exact pairs, rules-only and game-data-only Rewards. Database PG `51/51`; API PG `22/22` / Reward `9/9`; API unit `56/56`; workspace + Worker gates PASS |
| `TASK-088` Move Acquisition / Eligibility Rules Spec | A | DONE | PM → ChatGPT | GSC **PASS** + QA **READY**, P0/P1/P2/P3 `0/0/0/0` | `SK-GAME-ARCH`, `SK-GAME-BAL`; `SK-PKM-DEX` reference-only | Completed — Human Owner approved SPEC-010 in full and authorized repository history/completion on 2026-09-22 | TASK-006/019/021/022 | **APPROVED SPEC-010 integrated at `72039d8`:** level-up-only derived eligibility; deterministic bootstrap; server-selected exact pair + retained rule-artifact semantics; no automatic loadout rewrite; no learned-set persistence; selected-only grandfathering; machine/TM/tutor/egg/evolution/transfer/reminder acquisition deferred |
| `TASK-089` Move Acquisition / Eligibility Implementation | B | DONE | LD → ChatGPT delegated implementation worker | QA/TECH **READY / PASS WITH P2** `0/0/1/0` + **IA PASS** `0/0/0/1` at REVIEW; sole evidence gap subsequently closed by disposable PG17 `4/4` PASS, no code correction | `SK-TDD`, `SK-PG`, `SK-GAME-ARCH` | Completed — PM accepted exact REVIEW snapshot; Human Owner authorized repository history/completion on 2026-09-22 | TASK-020/024/087/088 | Integrated at `bd3d036`. APPROVED SPEC-010 implemented: Level-derived eligibility from one exact Learnset context; exact server-selected pair + retained compatibility/new-use checks + exact artifact/hash; deterministic bootstrap; complete replacement via shared Pokémon OCC; catalog/Worker/workspace/PostgreSQL gates PASS; no public endpoint, learned/acquired persistence or machine/TM Item hooks |
| `TASK-094` Player State API Contract Spec | A | DONE | PM → ChatGPT | Fresh 6-Team delta QA READY + IA PASS `0/0/0/0`; reconciled GSC delta ADVISORY PASS, no remaining correction | `SK-API-SEC`, `SK-PG`, `SK-GAME-ARCH` reference-only | Completed — Human Owner accepted SPEC-011 and separately authorized repository history/completion on 2026-09-22 | TASK-017/020/024/089 | **APPROVED SPEC-011 integrated at `190ef09`:** self-scoped Player State routes/payloads/errors, lossless integer encoding, session activity + CSRF/Origin, bounded Collection/Team/Inventory paging, deliberate player-visible **6-live-Team preset capacity** + separate 64-create/24h abuse control, serialized durable Team-create idempotency with 30-day deletion replay window, OCC no-hidden-retry and TASK-089 Move-authority handoff |
| `TASK-025` Player State API Integration | B | DONE | LD → ChatGPT project implementation session | Final QA **READY 0/0/0/0** + IA **PASS 0/0/0/0**; delegated independent Class B **ACCEPT**, blockers none; Player State PG `4/4`, full API PG `32/32`, DB PG `58/58`, API unit `88/88`, Worker/workspace gates PASS | `SK-TDD`, `SK-CF-WBP`, `SK-PG`, `SK-API-SEC` reference-only | Completed — Human Owner authorized repository/history completion on 2026-09-23 | TASK-020/024/089/094 | Integrated implementation at `871c6a7`; APPROVED SPEC-011 implemented without scope widening; production-runtime Move HTTP evidence proves real env/release + immutable published bundle path; no production-code correction was required for the sole QA evidence P2 |

**Exit criteria:** authenticated players have authoritative collection/team/inventory/progression state suitable for gameplay rewards and team selection.

**Explicit deferred product domains:** Evolution and post-Level-200 Mastery/Prestige remain BACKLOG concepts, not accidental unowned implementation work. Neither is required for the baseline through TASK-025/Solo Hunt MVP. If prioritized, PM must materialize separate Class A rules tasks (and any required static-data schema extension) before implementation; level-up alone never implies evolution or post-cap state.

---

### EPIC-04 — Client UX, Rendering & Asset Foundation

**Status:** IN PROGRESS ? TASK-026/TASK-027/TASK-028/TASK-029/TASK-030/TASK-031 are DONE; TASK-039 is BLOCKED on post-Class-A runtime/presentation prerequisites; TASK-100 remains independently ACTIVE; TASK-040 remains planned.
**Outcome:** accessible/responsive React shell plus Card/Low-Spec and Pixi presentation adapters that consume shared domain/combat events.

#### STORY-04.1 — Product shell and design system

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-026` UI/UX Architecture, Navigation & Design-System Spec | B | DONE | PM → ChatGPT | QA READY — no unresolved P0/P1 | `SK-UI`, `SK-A11Y`, `SK-REACT` | **HUMAN visual/UX + repository/history APPROVED 2026-09-27** | TASK-003; domain vocabulary from TASK-004 | SPEC-016 APPROVED; FE feasibility READY; information architecture including Pokémon/Team/ordered Move-loadout management surfaces; responsive targets; semantic design tokens; states; accessibility bar; Card vs Visual responsibilities; explicit downstream ownership |
| `TASK-027` React App Shell & Navigation | B | DONE | FE → current ChatGPT implementation worker | Final responsive QA READY — P0/P1 `0/0`, no material residual P2/P3; 390px browser/CDP no-overflow evidence | `SK-REACT`, `SK-UI`, `SK-A11Y`, `SK-TDD`, `SK-FE-TEST` | **COMPLETED — Human live UI approved + repository/history authorized 2026-09-27** | TASK-026 | Shell/routes and protocol behavior unchanged; responsive fix prevents small-screen horizontal overflow, keeps Settings reachable and all four bottom-nav destinations visible at 320–639; 19 focused tests including CSS invariants; no TASK-100/TASK-029 ownership |
| `TASK-028` Combat Event Presentation Contract | B | DONE | LD → ChatGPT delegated worker | QA READY `0/0/0/0`; delegated Class-B ACCEPT | `SK-TDD`, `SK-GAME-ARCH` | **COMPLETED — Human Owner repository/history authorized 2026-09-27** | TASK-007/009/026/038 | One-time battle bootstrap + HP-free continuation cursor; cross-batch oracle regression; engine-generated fixture; decreasing-time regression; renderer-neutral authoritative event projection |
| `TASK-100` Collection, Pokémon & Team Management UI | B | ACTIVE | FE → ChatGPT prime (explicit non-default surface) | **Independent technical/UX partial review; final QA and Class-B acceptance pending** | `SK-REACT`, `SK-UI`, `SK-A11Y`, `SK-TDD`, `SK-FE-TEST` | **HUMAN partial UI feedback 2026-09-28; full live validation and history separately gated** | TASK-025/027 | Preserve the pre-existing isolated FE worktree and scope; Inventory is not silently absorbed — TASK-111 owns first-Pre-alpha Inventory browsing. |

#### STORY-04.2 — Dual presentation modes and assets

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-029` Card / Low-Spec Combat Renderer Foundation | B | DONE | FE → ChatGPT prime | QA READY 0/0/0/0; Class-B ACCEPT 0/0 | `SK-REACT`, `SK-UI`, `SK-A11Y`, `SK-FE-TEST` | **HUMAN isolated preview approved 2026-09-28; Hunt-integrated live validation TASK-039** | TASK-027/028 | Accepted modular DOM/Card renderer foundation: authoritative roster order, semantic KO only from events, privacy-safe exact/unavailable/hidden owned/wild vitality, bounded accessible event feed, reduced-motion/low-cost CSS, engine-produced effect/KO/replacement coverage; no route/Hunt/gameplay authority |
| `TASK-030` Pixi Combat Renderer Foundation | B | DONE | FE → ChatGPT prime | QA READY 0/0/0/0; Class-B ACCEPT 0/0 | `SK-GAME-PERF`, `SK-UI`, `SK-FE-TEST` | **HUMAN isolated preview approved 2026-09-28; Hunt-integrated live validation TASK-040** | TASK-028 | Accepted modular Pixi foundation: authoritative roster/event semantics, bounded nonnumeric cue animation, dynamic-only Pixi load, failure-safe async/StrictMode lifecycle, explicit runtime cleanup, persistent DOM fallback, reduced-motion queue collapse and engine-produced effect/KO/replacement coverage |
| `TASK-031` Accessibility & Responsive Baseline | B | DONE | FE → ChatGPT prime | QA TECH READY 0/0; Class-B ACCEPT 0/0 | `SK-A11Y`, `SK-UI`, `SK-REACT` | **HUMAN Card/Pixi usability approved 2026-09-28; Hunt-integrated validation TASK-039/040** | TASK-027/029 | Keyboard; focus; semantics; reduced motion; zoom/text; mobile/desktop breakpoints; completed task `tasks/done/TASK-031-accessibility-responsive-baseline.md` |
| `TASK-032` Asset Manifest & Delivery Pipeline | B | PLANNED | LD → Copilot CLI | QA | `SK-CF-WR`, `SK-GAME-PERF` | **HUMAN asset-direction checkpoint** | TASK-026 | FE consultation; asset IDs/manifests; provenance/licensing metadata; implement accepted R2/CDN delivery path; cache/versioning; missing-asset handling; frontend consumption contract; budgets; distribution-strategy changes escalate to Class A architecture work |
| `TASK-099` Pokémon Sprite Generation Lab | C | DEFERRED | PM → ChatGPT | N/A | none | N/A | None | Historical ID only; side-project abandoned by Human Owner; no implementation, assets, dependency, branch, worktree or follow-up |

**Exit criteria:** application shell and both presentation modes can render deterministic fixture events without owning gameplay logic.

**Safe parallelization:** TASK-027 and TASK-028 can proceed in parallel after UI spec/domain contracts stabilize; Card and Pixi renderers can then progress in parallel because they consume the same accepted presentation contract.

---

### EPIC-05 — PvE World & Solo Hunt MVP

**Status:** IN PROGRESS — TASK-033/TASK-034/TASK-035/TASK-095/TASK-096/TASK-097/TASK-036/TASK-037/TASK-098/TASK-038 are DONE; downstream Solo Hunt presentation/client-foundation work proceeds against the canonical server-authoritative Hunt layer
**Outcome:** first complete playable PvE vertical slice: navigate/select an available world/map Zone → select team → start Hunt → deterministic elapsed-time combat/encounters → rewards/capture → persistence → Card/Visual presentation.

#### STORY-05.1 — PvE world, map, Hunt rules and simulation

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-033` PvE World/Map, Zone & Solo Hunt Rules/Lifecycle Spec | A | DONE | PM → ChatGPT | Prior GSC/PXE **ADVISORY PASS**; post-acceptance IA **FAIL 0/1/0/0**; corrective IA **PASS 0/0/0/0**; corrective GSC/PXE **ADVISORY PASS**; corrective QA **READY 0/0/0/0** | `SK-GAME-ARCH`; `SK-PKM-DEX`, `SK-PKM-GEN1` reference-only | **Completed — baseline accepted, corrective mapping reaffirmed and repository/history completion authorized 2026-09-23** | TASK-008/019/021/023 plus integrated TASK-022/024/091 constraints | APPROVED SPEC-013 defines minimal Zone topology, one active Hunt, no-free-reroll/recovery, retained rewards, participant XP and Capture **Option B**, plus exact SPEC-003 outcome mapping: only player-side sole victory successfully completes an Encounter; opposing-side victory/draw grant no completion reward/capture, leave `PendingEncounterSelection` unconsumed and terminalize the Hunt at that logical boundary. TASK-034 materialized, published and integrated that accepted static-content boundary |
| `TASK-034` PvE World/Zone, Encounter & Hunt Data | B | DONE | LD → ChatGPT | **Pre-publication QA READY 0/0/0/0; post-publication QA READY 0/0/0/0** | `SK-TDD` | **COMPLETED — Human sample APPROVED and repository/history integration authorized 2026-09-24** | TASK-006/033/087 | Immutable schema-v4 `game-data-core-kanto-johto-v3` / `sha256:a7ee6337…c6559` integrated at `91f06de`; v1/v2 retained; Verdant Edge 1 Zone/1 Hunt/9 slots; TASK-091 playability gate; deterministic review/publication receipts; schema3/4 sanity/runtime compatibility; post-publication QA clear |
| `TASK-035` Solo Hunt Simulation Engine | B | DONE | LD → fresh ChatGPT implementation worker | Formal QA **READY 0/0/0/0** + Class-B **ACCEPT 0/0/0/0** | `SK-TDD`, `SK-GAME-PERF` | **COMPLETED — Human Owner approved implementation/history; canonical integration completed 2026-09-24** | TASK-009/033/034/091/095 | Integrated at `4679d42`: deterministic Solo Hunt orchestration with exact replay/checkpoint provenance, automatic Move-policy boundary enforcement, cadence carry/pruning, pending-selection no-free-reroll and capture/reward handoff only. Post-integration main: focused 35/35, game-core 354/354, API 103/103, game-data isolated 365/365 + 1 skip; production hashes preserved. Root workspace test retains only the documented pre-existing game-data 5s concurrency timeout |
| `TASK-096` Idle/Gacha Progression & Acquisition Model | A | DONE | PM → ChatGPT project coordination | Exact-current **QA/ARCH READY 0/0/0/0; IA PASS 0/0/0/0; PXE READY 0/0/0/0; GSC ADVISORY PASS 0/0/0/0** | `SK-GAME-ARCH`, `SK-GAME-BAL` | **COMPLETED — final consolidated Class-A Human acceptance plus repository/history integration authorized 2026-09-26** | TASK-008/019/022/023/033/034/035/093 | APPROVED SPEC-014 + forward SPEC-003/005/013 authority bind one individual to the stable TASK-035 PendingEncounterSelection before Battle using server-only non-exportable deterministic authority, preserve exact snapshot lineage into capture, define standing auto-capture/no-eligible-Ball closure, Species Research count-only duplicates and fail-closed legacy. Exact prices/stock/faucets remain downstream tuning |
| `TASK-097` Encounter Individualization & Genetics Runtime | B | DONE | LD → ChatGPT implementation | Final QA **READY 0/0/0/0** + IA **PASS 0/0/0/0** + fresh independent Class-B **ACCEPT 0/0/0/0** | `SK-TDD`, `SK-GAME-ARCH` | **COMPLETED — repository/history authorized and integrated 2026-09-26; deploy separately gated** | TASK-096/008/019/033/035/095 | Integrated exact PendingEncounterSelection → one immutable IV/Genetics/Profile/Shiny snapshot before Battle; server-only keyed/domain-separated individualization with retained authority-key identity and fixed conformance vector; same pending token cannot reroll across restart/EncounterId changes; immutable Genetic-aware combat-rules release + persistence/legacy guards preserve TASK-095/TASK-035 history |
| `TASK-036` Capture & Reward Resolution | B | DONE | LD → current ChatGPT implementation session | Final QA **READY 0/0/0/0** + IA **PASS 0/0/0/0** + independent Class-B **ACCEPT 0/0/0/0** | `SK-TDD`, `SK-THREAT` | **COMPLETED — Human product gate plus repository/history integration authorized 2026-09-26; deploy separately gated** | TASK-023/024/033/034/035/089/090/091/095/096/097 | Integrated correlation-first durable capture replay, frozen RNG-origin matching, mandatory exact production-executable Move authority, replay-validated TASK-035 reward-source authenticity and replay-validated TASK-097 capture snapshot provenance. Atomic capture/Research persistence and TASK-024 Reward application are green. Exact standard Ball ItemId publication/faucets remain downstream content/release work |
| `TASK-037` Offline / Elapsed-Time Checkpoint & Claim Engine | B | DONE | LD → current ChatGPT implementation session | Final QA **READY 0/0/0/0** + IA **PASS 0/0/0/0** + independent Class-B **ACCEPT 0/0/0/0** | `SK-TDD`, `SK-GAME-PERF` | **COMPLETED — Human Owner repository/history authorization and canonical integration 2026-09-27; deploy separately gated** | TASK-035/036/096/097 | Integrated canonical fail-closed checkpoint codec with exact TASK-097 provenance; fixed-cutoff correlation replay; OCC + PostgreSQL atomic progress/commit; deterministic direct/segmented 1h/8h advancement; stale/superseded no-double-advance behavior; TASK-036 replay-valid reward/capture handoff; no public Hunt route or player auto-capture settings introduced |

#### STORY-05.2 — Authoritative Hunt integration and presentation

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-098` Authoritative Hunt API Contract Spec | A | DONE | PM → ChatGPT | QA READY + IA PASS `0/0/0/0`; GSC/PXE complete | `SK-GAME-ARCH`, `SK-PG`, `SK-API-SEC` reference-only | **COMPLETED — historical semantic acceptance + separate repository/history authorization 2026-09-27; affected product clauses now under TASK-106 realignment** | TASK-017/024/025/033/035/036/037/096/097 | SPEC-015 remains the historical accepted API contract. Human Owner 2026-10-01 supersedes manual Potion and manual pending-capture/per-Encounter Ball-choice product behavior; checkpoint/claim remain technical reconciliation but are no longer player-facing controls; Retreat remains player-triggered; automation-policy changes remain allowed during an active Hunt. TASK-106/SPEC-020 owns the coordinated Class-A reconciliation. |
| `TASK-038` Hunt API & Persistence Orchestration | B | DONE | LD → current ChatGPT implementation session | Exact-current QA **READY** + IA **PASS**, no unresolved P0/P1; fresh independent Class-B **ACCEPT** | `SK-CF-WBP` reference-only, `SK-PG`, `SK-TDD` | **COMPLETED — historical implementation preserved; deploy separately gated; product-facing use subject to TASK-106 realignment** | TASK-017/025/036/037/096/097/098 | Existing implementation includes start/checkpoint/claim/retreat, explicit inter-Battle healing, Player-wide manual capture, auto-capture policy, no-free-reroll and atomic reward/capture/checkpoint composition. Future desired behavior removes manual heal and manual capture, uses checkpoint/claim automatically/internal to product flow, retains Retreat, and permits prospective mid-Hunt automation-policy changes. Preserve old source/evidence for legacy compatibility analysis; do not newly expose superseded controls. |
| `TASK-101` TASK-038 Retreat Terminal Contract Correction | B | DONE | LD → ChatGPT | **Independent QA PASS WITH P2; IA PASS WITH P2; Class-B functional/architectural acceptance, 0 P0/0 P1** | `SK-API-SEC`, `SK-PG`, `SK-TDD` | **COMPLETED — Human authorized local commit/merge 2026-09-28; push/deploy separately gated** | TASK-033/035/038/098 | Approved SPEC-015 §8 public retreat terminal union `retreat/no_living` for new and converged commands; immutable completed replay, recovery anchors and Combat outcomes preserved. API unit 166/166, API PG 56/56, DB PG 87/87, game-core 460/460 PASS; independent mapping tests 8/8 PASS. P2 deferred: loss/draw API E2E and incompatible legacy completed replay require separately scoped TASK-039 cutover/UX handling. |
| `TASK-102` Authoritative Solo Hunt Presentation Source Contract | A | ACCEPTANCE | PM → ChatGPT | Independent exact-source protocol QA **PASS 0/0/0** + security/persistence contract audit **PASS 0/0/0**; no endpoint/migration implementation audited yet | `SK-GAME-ARCH`, `SK-PG`, `SK-API-SEC`, `SK-GAME-PERF` reference-only | **HUMAN accepted detailed APPROVED SPEC-017 on 2026-09-29**; repository/history completion remains separately gated | TASK-028/035/037/038/097/101 | Accepted additive input-v2/checkpoint-v3 owned Shiny and pre-reaction HP origin strategy, complete time-zero source events, immutable private-source commitment and public indexed projection, same-transaction bound writer/terminal seal, limit-bound signed cursor and 30-day terminal-retention strategy. Contract QA/audit complete; no backend migration/endpoint, benchmark, deploy, or implementation audit claimed. Pure 47/47 core and 16/16 TASK-028 fixtures are seed evidence only. |
| `TASK-103` Authoritative Solo Hunt Combat Presentation Backend | B | BLOCKED | LD → one ChatGPT delegated implementation worker | **Independent QA + independent IA mandatory** | `SK-TDD`, `SK-PG`, `SK-API-SEC`, `SK-GAME-PERF`, `SK-GAME-ARCH` reference-only | **BLOCKED on TASK-107/108/110; public feed/Git remain separate gates** | TASK-028/035/037/038/097/101/102/106/107/108/110; APPROVED SPEC-017/020/021 | Preserve existing implementation/evidence; forward v1/v2/Hunt-activity/vitality/D-F16 rebase remains presentation-only. |
| `TASK-039` Solo Hunt Card Mode Integration | B | BLOCKED | FE → ChatGPT prime | Fresh QA required after reimplementation | `SK-REACT`, `SK-UI`, `SK-A11Y`, `SK-FE-TEST` | **BLOCKED on TASK-109/110/103; later HUMAN live validation** | TASK-029/038/101/103/106/109/110 + approved SPEC-020/021 | Contract rebase complete; no manual Potion/capture/Checkpoint/Claim; Cards-only policies/feed/Retreat/HUB/PokéCenter/fail-closed. |
| `TASK-040` Solo Hunt Visual/Pixi Integration | B | PLANNED | FE → Claude Code | QA | `SK-GAME-PERF`, `SK-UI`, `SK-FE-TEST` | **DEFERRED beyond first Pre-alpha; HUMAN visual/live validation in later Pre-alpha step** | TASK-030/038/104 | Visual/Pixi presentation remains planned but is **not required for the first Pre-alpha**, which is Cards-only. When resumed: automated PvE traversal/progression only, same authoritative Hunt/event source as Cards, scene transitions/animations, terminal/return presentation, performance/fallback and behavior/E2E coverage. |
| `TASK-041` Solo Hunt End-to-End, Offline & Performance Harness | B | PLANNED | SD → Codex | QA + IA reward-integrity review | `SK-GAME-PERF`, `SK-TDD` | **HUMAN first Pre-alpha acceptance after runtime/client slices** | TASK-034-039/100/103/106-111 | Cross-slice first-Pre-alpha validation; Pixi parity later. |
| `TASK-104` Project Governance and Roadmap Reconciliation | B | DONE | PM → ChatGPT project coordination | Independent QA/IA PASS 0/0/0 | `SK-TDD` | **COMPLETED — local-main integration 2026-09-30** | TASK-003 | Canonical governance control-plane task. |
| `TASK-105` CI Test Discovery and Published-Loader Timeout Stability | C | DONE | LD → ChatGPT isolated worktree | N/A | `SK-TDD` | **COMPLETED — local-main integration 2026-09-30** | TASK-003/104 | Canonical CI/test stability task. |
| `TASK-106` Management-First Idle Product Realignment | A | ACCEPTANCE | PM → ChatGPT project coordination | Semantic + architecture/replay QA READY 0/0/0 | `SK-GAME-ARCH`, `SK-UI`, `SK-GAME-BAL` as needed | **HUMAN Class-A acceptance COMPLETE 2026-10-02** | TASK-033/038/093/098 + SPEC-020/021 | First-Pre-alpha management-first contract authority. |
| `TASK-107` Management-First Combat / Cadence Automation Primitives | B | DONE | LD → ChatGPT delegated implementation worker | QA TECH READY 0/0/0 | `SK-TDD`, `SK-GAME-ARCH` | **COMPLETED — delegated Class-B acceptance + Human-authorized repository/history integration 2026-10-02; deploy/public enablement separate** | TASK-009/035/037/106 | Versioned external action, Potion cadence, KO intervention, Revive cleanup/event bytes. |
| `TASK-108` Persistent Pokémon Vitality & HUB PokéCenter Implementation | B | DONE | LD → ChatGPT delegated implementation worker | QA READY 0/0/0 + IA READY 0/0/0 | `SK-PG`, `SK-TDD`, `SK-GAME-ARCH` | **COMPLETED — delegated Class-B acceptance + Human-authorized repository/history integration 2026-10-02; persistent migration/deploy/public enablement separate** | TASK-013/014/020/036/038/106 | PokemonVitality, OCC, persisted HP Start/writeback, PokéCenter. |
| `TASK-109` First Pre-alpha Bootstrap, Wilds Content & Hunt Admission | B | ACCEPTANCE | LD → ChatGPT delegated implementation worker | Independent exact-current **TECH READY + INTEGRITY READY `0/0/0/0`**; fresh Class-B **ACCEPT `0/0/0/0`** | `SK-TDD`, `SK-PG`, `SK-GAME-ARCH` | **Human-approved immutable schema-5 v5 publication complete; Git history/production activation/deploy/public-enable remain separate** | TASK-020/024/034/038/089/091/106/108 | Bootstrap/Wilds/strict admission implemented and validated; no new public starter-choice protocol; TASK-110 remains separate. |
| `TASK-110` Management-First Hunt Automation, Offline & Provenance | B | DRAFT | LD → ChatGPT delegated implementation worker | QA + IA | `SK-TDD`, `SK-PG`, `SK-GAME-PERF`, `SK-API-SEC` | **Separate implementation authorization required** | TASK-023/024/035/036/037/038/101/106/107/108/109 | Policies/offline/D-F16/provenance/activity. |
| `TASK-111` First Pre-alpha Inventory Management UI | B | DRAFT | FE → ChatGPT delegated implementation worker | QA | `SK-REACT`, `SK-UI`, `SK-A11Y`, `SK-FE-TEST` | **Separate frontend implementation authorization required** | TASK-024/025/027/031/106 | Read/management Inventory browsing; no consume/grant/use authority. |

**Exit / MVP gate:** Solo Hunt is a complete server-authoritative playable loop. Human Owner explicitly approves MVP behavior and presentation before the project expands into realtime multiplayer content.

---

### EPIC-06 — Social HUB & Realtime Presence

**Status:** PLANNED
**Outcome:** persistent shared social space for presence, free movement, chat, NPC interaction hooks and party formation, without turning the whole game into a global realtime simulation. The HUB is the only product surface with free/manual movement; PvE/Hunt traversal remains automated.

**Operational prerequisite:** TASK-018 baseline auditability must be complete before HUB implementation. Full telemetry/SLO/LiveOps work remains in EPIC-11, but multiplayer must not launch without correlation IDs and actionable error/audit evidence.

#### STORY-06.1 — HUB realtime contract

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-042` ADR-007 HUB Realtime State & Protocol | A | PLANNED | PM → ChatGPT | QA + **IA required** | `SK-CF-DO`, `SK-THREAT`, `SK-GAME-ARCH` | **HUMAN accepts ADR** | TASK-015/017/026; ADR-003 | HUB room/area identity; presence/free-movement authority; message envelope; rate limits; ephemeral/persistent boundary; reconnect semantics; do not overload PvE `Zone` vocabulary; **GSC consultation becomes required if ADR scope starts defining gameplay/social incentive loops rather than topology/protocol only** |
| `TASK-043` HUB Presence & Movement Durable Object | B | PLANNED | LD → Copilot CLI | QA + IA concurrency review | `SK-CF-DO`, `SK-CF-WBP` reference-only, `SK-TDD` | PM acceptance | TASK-018/042 | Join/leave; authoritative position state; free-movement input; throttling; broadcast; correlation/audit integration; lifecycle cleanup; no continuous DB writes |
| `TASK-044` HUB Chat Protocol & Implementation | B | PLANNED | LD → Copilot CLI | QA + IA security spot-check | `SK-CF-DO`, `SK-THREAT`, `SK-TDD` | **HUMAN validates moderation/product behavior** | TASK-042/043 | Message limits; identity; basic moderation hooks; abuse/rate handling; disconnect behavior |
| `TASK-045` Parties & Invitations | B | PLANNED | LD → Copilot CLI | QA | `SK-TDD`, `SK-CF-DO` | **HUMAN validates party UX/rules** | TASK-043/044 | Invite/accept/decline/leave; party identity; ownership/leadership rules; persistence boundary |

#### STORY-06.2 — HUB client and resilience

| Task | Class | State | Owner → agent | Review / audit | Skills | Human gate | Dependencies | Sub-tasks |
|---|---|---|---|---|---|---|---|---|
| `TASK-046` HUB Pixi Scene & Social UI | B | PLANNED | FE → Claude Code | QA | `SK-UI`, `SK-A11Y`, `SK-GAME-PERF` | **HUMAN live/visual validation** | TASK-027/032/043–045 | Scene; free-movement input; player labels; chat/party UI; NPC interaction shell; mobile controls |
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
