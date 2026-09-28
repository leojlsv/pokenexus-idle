# TASK-026 — UI/UX Architecture, Navigation & Design-System Spec

## Metadata

- State: DONE
- Class: B
- Owner: PM / Architecture Coordinator
- Owner execution surface: current ChatGPT project-coordination session
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: N/A
- Auditor execution surface: N/A
- Consultants: Frontend feasibility + UX/accessibility advisory
- Consultant execution surface(s): fresh independent ChatGPT workers
- Spec: `docs/specs/SPEC-016-ui-ux-architecture-navigation-design-system.md`
- Related specs: SPEC-001/003/005/006/010/011/013/015
- Related ADRs: ADR-001/002/004/005/006
- Branch: `feat/TASK-026-ui-ux-architecture-spec`
- Worktree: `.worktrees/TASK-026-ui-ux-architecture-spec`
- Human product gate: APPROVED 2026-09-27

## Objective

Define the minimum stable client information architecture, navigation model, design-system contract,
responsive/accessibility baseline and Card-vs-Visual responsibility split required to implement the
PokeNexus React shell and both combat presentation modes without moving gameplay authority into the client.

## Context

`apps/web` is currently only a React/Vite/Pixi wiring shell. The server-authoritative Player and Solo Hunt
contracts are already accepted and implemented, while TASK-027/029/030/032 need a shared client contract
before they can build navigation, renderers and asset delivery independently without inventing incompatible
UX or presentation semantics.

## Scope

- application information architecture and route/view hierarchy;
- global shell regions and primary navigation behavior;
- Collection, Pokémon detail, Team, ordered Move-loadout and Inventory UX responsibilities;
- PvE World/Zone/Hunt entry and active-Hunt presentation responsibilities;
- Card/Low-Spec vs Visual/Pixi responsibility split and parity requirements;
- client state ownership boundaries and server-authoritative reconciliation rules at UX level;
- loading, empty, error, stale, reconnect and in-progress presentation states;
- semantic design tokens and component-state vocabulary;
- responsive targets, touch/keyboard/focus behavior and reduced-motion baseline;
- accessibility acceptance bar for downstream UI tasks;
- explicit handoff constraints for TASK-027/029/030/031/032/039/040;
- identify whether a separate Move-loadout editing implementation task must be materialized.

## Out of scope

- implementation of React routes/components, CSS, Pixi scenes or production assets;
- changing accepted Player/Hunt HTTP payloads, game rules, authority or idempotency semantics;
- inventing public/social profile, trading, realtime HUB or Duo UI contracts;
- concrete final art direction, illustration/sprite production or asset licensing decisions;
- combat math, simulation, capture/reward logic or client-side gameplay authority;
- deploy/production cutover;
- Git history mutation beyond the explicitly authorized TASK-026 commit/local-main integration, plus any push/deploy, remains out of scope.

## Acceptance criteria

- [x] SPEC-016 defines one coherent application IA and route/view hierarchy for the currently accepted product surface.
- [x] Pokémon/Collection/Team/ordered Move-loadout management surfaces use accepted domain vocabulary and self-scoped APIs.
- [x] The spec makes server authority, client cache/display state and local ephemeral interaction state visibly distinct.
- [x] Card and Visual/Pixi modes consume the same accepted read-model/event source and have explicit parity/fallback rules.
- [x] Loading/empty/error/stale/reconnect/202-in-progress states have deterministic UX responsibilities with no silent retries of stale mutations.
- [x] Design tokens cover typography, spacing, size, radius, elevation, color roles, focus, motion and renderer-neutral semantic states.
- [x] Responsive targets and interaction density are defined for small mobile, large mobile/tablet and desktop.
- [x] Keyboard, focus, screen-reader, reduced-motion, zoom/text-resize and non-color-only semantics are explicit acceptance requirements.
- [x] Downstream ownership for TASK-027/029/030/031/032/039/040 is unambiguous and does not duplicate authority.
- [x] Move-loadout editing has explicit downstream implementation ownership in roadmap TASK-100.
- [x] Frontend feasibility consultation has no unresolved P0/P1 blockers.
- [x] Independent QA has no unresolved P0/P1 blockers.
- [x] Human Owner reviewed and approved the visual/UX direction on 2026-09-27.

## Validation / tests

- [x] Cross-check terminology and authority boundaries against SPEC-001/011/013/015.
- [x] Cross-check downstream dependencies and ownership against `docs/project/PROJECT_ROADMAP.md`.
- [x] Frontend feasibility review against current React 19 + Vite + Pixi 8 repository surface.
- [x] Accessibility/UX advisory review.
- [x] Independent QA review of exact-current TASK-026 diff.
- [x] `corepack pnpm roadmap:generate`.
- [x] `corepack pnpm roadmap:check`.
- [x] `git diff --check`.

## Dependencies

- TASK-003 — DONE; project control/roadmap.
- TASK-004 / SPEC-001 — DONE/APPROVED; canonical domain vocabulary.
- TASK-007/009 — DONE; presentation must remain outside combat authority.
- TASK-019/020/025 — DONE; Collection/Team/Move configuration domain and public API surface.
- TASK-033/038 — DONE; Solo Hunt lifecycle and authoritative public Hunt orchestration.

## Risks / irreversible actions

- A route/component architecture that mirrors persistence tables would couple UI to infrastructure rather than product concepts.
- Allowing Pixi or React presentation code to derive gameplay outcomes would create a second authority path.
- Treating Card and Visual modes as separate products would cause feature and accessibility drift.
- Premature concrete art choices could constrain the future asset pipeline before the Human visual direction checkpoint.
- No irreversible action, deploy, push, merge or destructive Git operation is authorized by this task activation.

## Expected files / boundaries

- `docs/specs/SPEC-016-ui-ux-architecture-navigation-design-system.md`
- `docs/project/PROJECT_ROADMAP.md`
- `docs/project/PROJECT_ROADMAP.html` (generated)
- this task file
- `tasks/active/TASK-099-pokemon-sprite-generation-lab.md` only as an exact governance mirror of the already-active
  parallel lab, required because the contiguous canonical roadmap now exposes TASK-099 before newly planned TASK-100;
  TASK-026 does not edit or execute the lab scope
- no production implementation under `apps/web/src/**` is required by TASK-026

## Completion

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
