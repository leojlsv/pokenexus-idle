# TASK-004 — Domain Glossary & Core Model Spec

## Metadata

- State: DONE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: QA Reviewer
- Reviewer execution surface: ChatGPT worker (independent)
- Auditor: N/A
- Auditor execution surface: N/A
- Spec: `docs/specs/SPEC-001-core-domain-model.md`
- ADR:
  - `docs/decisions/ADR-001-runtime-and-language.md`
  - `docs/decisions/ADR-002-solo-hunts.md`
  - `docs/decisions/ADR-003-hub-and-duo-realtime.md`
- Branch: `docs/TASK-004-domain-glossary-core-model`
- Worktree: `.worktrees/TASK-004-domain-glossary-core-model`

## Objective

Define and obtain Human Owner acceptance for the canonical domain vocabulary and structural core model used by later game-data, combat, persistence, protocol and UI work.

The specification must remove naming ambiguity before code is written while deliberately deferring numeric combat rules, balance values, persistence schemas and transport contracts to their dedicated tasks.

## Context

TASK-003 established the project roadmap and made TASK-004 the first product-domain task. Later tasks depend on stable terminology for Pokémon identity, combatants, stats, moves, types, items, effects, teams, PvE world/zones and encounters.

Without this baseline, `game-types`, `game-core`, `game-data`, persistence and protocol work could encode incompatible meanings for the same terms.

During Human Owner acceptance review, the Human Owner explicitly replaced Cursor with
Claude Code as the official Frontend Developer execution surface. Because the canonical
roadmap exposes role/agent assignments, TASK-004 also carries the corresponding
project-control/tool-adapter correction. This changes execution tooling only; canonical
role authority and approval gates remain unchanged.

The Human Owner also established PokémonDB (`pokemondb.net`) as the primary external
factual source of truth for Pokémon reference data and requested a future crawler so the
project does not need to query the website repeatedly. TASK-004 records that project-
control decision while TASK-006 owns the detailed field whitelist, crawler contract,
provenance model and versioned local snapshot publication.

The Human Owner clarified that this ingestion is strictly DATA-only: no images, sprites,
assets, editorial content, page layout or styling. An existing historical-moves crawler
from another project may be used as an implementation reference during TASK-006, but its
current PokeAPI historical-type fallback must not become part of the canonical PokeNexus
data path because PokémonDB is the selected factual upstream.

The Human Owner also accepted using the two previously reviewed Pokémon repositories as
reference-only skills instead of creating a new canonical Pokémon Consultant role. They
may support PM/QA consultation for franchise terminology and generation differences, but
must not auto-trigger repository-wide, become a factual source of truth, supply missing
canonical PokémonDB fields, define executable PokeNexus rules or gain implementation/
approval/merge authority.

## Scope

- define stable identity vocabulary for static definitions, persistent instances and battle-scoped entities;
- define how accepted Pokémon forms/variants fit the `SpeciesId` identity boundary without prematurely adding `FormId`;
- define the six canonical stat keys without deciding formulas or balance values;
- distinguish raw instance attributes from derived presentation metrics;
- define move, type, Ability, item and effect vocabulary at structural/identity level;
- distinguish a Pokémon team from a social player party and from a battle side;
- define PvE world/map, zone, encounter, battle and hunt vocabulary and their relationships;
- define package ownership expectations for domain vocabulary;
- define cross-cutting invariants that later schemas and implementations must preserve;
- record intentionally deferred decisions and the tasks that own them;
- replace Cursor with Claude Code as the official Frontend Developer execution surface
  in project-control/tool-adapter documentation and remove the obsolete Cursor adapter.
- record PokémonDB as the primary external factual data source and make TASK-006 own a
  compliant snapshot crawler/exporter plus immutable provenance/versioning flow.
- record `SK-PKM-DEX` and `SK-PKM-GEN1` as explicitly scoped reference-only consultation
  skills without creating a new canonical role or authority path.

## Out of scope

- damage, accuracy, critical-hit, timing, cooldown, targeting or victory formulas;
- concrete move/category/effect schemas beyond vocabulary required to avoid ambiguity;
- type-chart values or matchup rules;
- encounter probabilities, zone tables, spawn rates or reward values;
- item stackability, consumable/equipment behavior, Poké Ball/capture semantics, TM behavior or concrete drop tables;
- concrete PvE map topology, unlock/travel rules, zone connections or Hunt availability rules;
- exact team-size or move-slot limits unless later rules explicitly approve them;
- persistence/database schema, API/WebSocket payloads or serialization formats;
- authentication, economy, trading or social-party rules;
- production TypeScript implementation;
- changing Frontend Developer authority, review separation or approval gates.
- selecting the final PokémonDB field whitelist or implementing the crawler itself.
- creating a Pokémon Consultant role, broad Pokémon auto-trigger behavior, or allowing
  reference skills to override PokémonDB/local-snapshot provenance or owning rule specs.

## Acceptance criteria

- [x] `SPEC-001` clearly separates static catalog identity, persistent Pokémon-instance identity and battle-scoped combatant identity.
- [x] `SpeciesId` identifies the exact accepted species/form definition; National Dex/source form labels remain reference data and no separate `FormId` is introduced prematurely.
- [x] Canonical stat keys are explicit and no combat formula is smuggled into this task.
- [x] Raw IV/stat inputs are distinguished from derived display concepts such as quality/rating.
- [x] Move, type, Ability and effect terminology is sufficient for TASK-005/006/007/008/019 to build compatible contracts without defining balance semantics here.
- [x] `AbilityId` / Ability Definition vocabulary exists without pre-empting TASK-008 combat semantics or TASK-019 owned-Pokémon selection rules.
- [x] `ItemId` / Item Definition vocabulary exists without pre-empting TASK-022 item/inventory semantics.
- [x] Pokémon Team, Player Party, Battle Side, lineup/slot and active combatant concepts are not overloaded.
- [x] PvE World/Map, Zone, Encounter Definition/Instance, Battle and Hunt are defined with clear ownership boundaries and explicit downstream owners.
- [x] Stable IDs are opaque and display names are never authoritative identity.
- [x] Published static definitions are referenced by immutable versioned identity; TASK-006 remains owner of the concrete versioning schema.
- [x] Package boundaries remain compatible with accepted architecture and no infrastructure concern leaks into `game-core`/`game-types`.
- [x] Deferred decisions explicitly point to their owning future tasks.
- [x] Claude Code replaces Cursor consistently as the Frontend Developer execution surface without changing canonical role authority.
- [x] Independent QA reports no unresolved P0/P1 findings after the Human Owner-requested Claude Code migration.
- [x] PokémonDB is recorded as the primary external factual source of truth while runtime authority remains a validated/versioned local snapshot.
- [x] TASK-006 explicitly owns the approved-field whitelist and compliant snapshot crawler/exporter contract without creating a live runtime dependency.
- [x] Pokémon-domain consultation is represented by scoped `SK-PKM-DEX` / `SK-PKM-GEN1` reference-only skills rather than a new authority-bearing role, with explicit no-auto-trigger and source/rule-boundary safeguards.
- [x] Human Owner explicitly accepts the spec before it becomes an approved Class A baseline.

## Validation / tests

- run `corepack pnpm roadmap:generate` after roadmap state updates;
- run `corepack pnpm roadmap:check`;
- run `git diff --check`;
- inspect Markdown for trailing whitespace and malformed headings/tables;
- independent read-only QA against task scope, accepted ADRs and architecture boundaries;
- Human Owner review/acceptance of `SPEC-001`.

## Dependencies

- TASK-003 — Project Control Roadmap: DONE.

## Risks / irreversible actions

- Vocabulary choices become high-fan-out dependencies; ambiguous names can create cross-package drift.
- Over-specifying formulas or concrete schemas here would steal authority from TASK-006/007/008 and create premature lock-in.
- Under-specifying identity boundaries would make replay, persistence and multiplayer contracts unsafe to design later.
- No destructive or irreversible runtime operation is authorized by this task.

## Expected files / boundaries

```text
tasks/done/TASK-004-domain-glossary-core-model.md
docs/specs/SPEC-001-core-domain-model.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
CLAUDE.md
docs/agents/tool-adapters.md
docs/agents/launching.md
.cursor/rules/00-role.mdc (removed)
.cursor/rules/frontend.mdc (removed)
```

No production source file or dependency may change in TASK-004.

## Completion

Completed after independent QA, explicit Human Owner acceptance, and authorized repository completion on 2026-09-14.
Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
