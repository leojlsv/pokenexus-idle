# TASK-117 — Pokémon Move Analysis Workbench

## Metadata

- State: BLOCKED
- Class: B — isolated local analysis UI/data tooling inside accepted static-data architecture
- Owner: Lead Developer / Frontend Developer
- Owner execution surface: ChatGPT coding agent
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: N/A — local non-privileged preview; reassess if production Admin/LiveOps authority is added
- Auditor execution surface: N/A
- Consultants: N/A
- Consultant execution surface(s): N/A
- Specs: APPROVED SPEC-002 / SPEC-016 / SPEC-022 / SPEC-023
- ADR: ADR-006 only as an Admin/LiveOps security boundary
- Branch: `feat/TASK-117-pokemon-move-analysis-workbench`
- Worktree: `.worktrees/TASK-117-pokemon-move-analysis-workbench`
- Human direction: requested 2026-10-03 as a non-priority parallel side task and future Admin-panel building block

## Objective

Build a local Pokémon data workbench for Move/business analysis. It must present Pokémon facts and complete
available Learnset rows, let the analyst change a non-authoritative Learn Level override per level-up row, select
any subset of Pokémon, and export deterministic JSON that can be re-imported into the workbench and later consumed
by a controlled static-data staging/import path.

The initial product target is every base Species through Generation III (National Dex 001–386). The current
published v5 authority contains the 251 Kanto/Johto base Species plus 42 accepted persistent forms; Generation
III completion therefore has an explicit source-coverage dependency rather than being inferred or fabricated.

## Context

- Exact baseline publication: `game-data-core-kanto-johto-v5`, schema 5, bundle
  `sha256:565cdd360c1b29dc3607696299244279a8d0c3f488d4544c41c62ed47592f782`.
- Baseline counts are 293 Species records, 547 Moves and 19,035 Learnset rows.
- `LearnsetEntryV1.level` is canonical source-derived Move-unlock data and participates in authoritative Move
  eligibility. The loaded immutable reference row is never rewritten by this workbench.
- Human visual-validation correction 2026-10-03: the editable value is the Learn Level of each `level-up` row,
  not a Pokémon/scenario Level. The edit is stored as explicit workbench analysis/staging metadata while the
  canonical Learnset row remains preserved for comparison, reset and fail-closed import validation.
- TASK-078 owns future privileged Admin/LiveOps operations. This task remains outside normal player-session and
  production-admin authorization surfaces.

## Scope

- Standalone local preview/workbench outside `AppShell`, player routing and `ClientSessionProvider`.
- Read the exact immutable v5 Species, Move, Type, Ability and Learnset catalogs as the baseline.
- Search/filter Pokémon, inspect complete facts and complete baseline Learnset rows, and select multiple Species.
- Maintain an editable Learn Level override per `level-up` Learnset entry, bounded to 1..200, without rewriting
  the canonical Learnset reference row.
- Provide a compact line-mode learnset view for fast navigation, with the detailed card view still available.
- Export either every Pokémon in the current Generation I–III analysis scope or only selected Pokémon.
- Export a versioned JSON envelope with exact base publication identity and strict separation between:
  - canonical Species/Move/Learnset records;
  - workbench-only analysis/staging metadata such as Learn Level overrides.
- Support re-import/round-trip validation of the exported envelope and reject wrong format/base identity,
  dangling references, invalid Levels and malformed Learnset semantics.
- Surface exact coverage in the UI so the current Kanto/Johto baseline cannot be mistaken for full Gen III.
- Keep the format suitable for a future controlled game-data importer/staging adapter; no direct immutable-bundle
  mutation is introduced here.

## Out of scope

- Production Admin/LiveOps authentication, roles, step-up authorization, audit logging or remote mutations.
- Publishing/activating a new `gameDataVersion`, editing an immutable published bundle or bypassing review gates.
- Changing Move rules, Move scalars, Learnset source facts, Learnset unlock levels or gameplay eligibility rules.
- Inventing Generation III Species/Learnset rows or silently changing factual source authority.
- External source acquisition without the exact SPEC-022 Human ACQUIRE gate for provider/revision/surfaces.
- Commit, push, merge, deploy or public enablement without separate Human authorization.

## Acceptance criteria

- [x] Local workbench loads the exact v5 baseline and reports its exact publication identity/counts.
- [x] Pokémon list supports search, generation filtering, selection and an accessible detail view.
- [x] Detail view exposes Species facts and every baseline Learnset row with joined Move facts.
- [x] Learn Level is editable per `level-up` row as a non-authoritative override while the canonical Learnset row
      remains unchanged and resettable.
- [x] Learnset supports a compact line mode as the default plus a detailed card mode.
- [x] Export All and Export Selected produce deterministic `pokenexus.pokemon-move-workbench.v2` JSON for the
      current Generation I–III analysis scope.
- [x] Export includes only referenced Moves for the exported Species while preserving complete canonical rows and
      exact source/provenance identifiers present on those rows.
- [x] Re-import of an exported file reproduces the same selected scope and Learn Level overrides; malformed,
      wrong-base or invalid/non-level-up overrides fail closed with a useful validation error.
- [x] Current coverage is explicitly reported as 251 base Kanto/Johto Species plus accepted forms, with the Gen III
      386-base-Species target shown as incomplete until authoritative Hoenn Learnsets are available.
- [ ] Gen III completion reaches National Dex 001–386 only from an explicitly accepted local source/staging input;
      no missing rows are synthesized.
- [x] Relevant automated tests, web typecheck/lint/build and `git diff --check` pass.
- [x] Independent QA reports no unresolved P0/P1 before completion.

## Validation / tests

- [x] Pure-model tests for Learn Level overrides, stable Learnset identity and deterministic sorting.
- [x] Export/import round-trip tests for all and selected scopes.
- [x] Negative import tests for wrong base identity, dangling Move/Species references and invalid Learnset semantics.
- [x] UI behavior smoke for filtering, selection, Learn Level editing and selected export/status behavior.
- [x] Responsive review at 320/390/640/1024 px plus a 512 CSS-px / DPR2 equivalent reflow check; root horizontal
      overflow remained bounded in every measured viewport.
- [x] `corepack pnpm --filter @pokenexus/web test`
- [x] `corepack pnpm --filter @pokenexus/web typecheck`
- [x] `corepack pnpm --filter @pokenexus/web lint`
- [x] `corepack pnpm --filter @pokenexus/web build`
- [x] `corepack pnpm --filter @pokenexus/web build:pokemon-analysis`
- [x] `git diff --check`

## Current blocker

The local workbench implementation is complete and validated for the accepted v5 data. The remaining product
target is the 135 missing base Species from National Dex 252–386 with complete authoritative Learnsets. The
retained local PokéAPI snapshot does not include the required Pokémon Move/Learnset surfaces, and SPEC-022
requires a Human ACQUIRE gate before adding a new provider/revision/surface set. TASK-117 therefore remains
BLOCKED on accepted Hoenn source evidence rather than synthesizing or silently changing source authority.

The exact first acquisition gate is now materialized as
`tasks/active/TASK-117-hoenn-acquire-request.json`, derived from the already-pinned PokéAPI revision
`bc92d3b6029ef1abe9e7ad424c400b338f3c11fe`. It is explicitly `PROPOSED_NOT_AUTHORIZED` and contains:

- Bulbapedia: 405 exact locators — 135 Species pages, 135 Generation IX Learnset pages and 135 Generation VIII
  BDSP fallback Learnset pages;
- PokémonDB: 135 exact complementary Species-page locators;
- reason, candidate-fact impact and the exact 252–386 roster for the one-shot SPEC-022 gate;
- an explicit follow-up gate for any Move source pages discovered missing from the current 547-Move catalog after
  offline Learnset parsing. No external request has been executed by TASK-117.

Current validation evidence before the visual-feedback delta: web **53/53 PASS**; model **8/8 PASS**;
typecheck/lint/normal build/dedicated workbench build/diff check PASS; independent core re-gate
**P0/P1/P2/P3 = 0/0/0/0 — ACCEPT**. Post-feedback validation is **54/54 PASS** with model **9/9**;
typecheck, lint, dedicated workbench build and `git diff --check` PASS. A real 390 CSS-px browser measurement after
the compact-line correction reports `innerWidth=390`, `htmlScrollWidth=375` and `moveTableWidth=317` (no root overflow).

## Dependencies

- DONE: TASK-087 static catalog implementation.
- DONE: TASK-112/113 local immutable source-snapshot architecture/implementation.
- DONE: TASK-114 schema-5 promotion contract/publication.
- DONE: TASK-115 schema-5 runtime delivery.
- Data completion dependency: accepted local Generation III Species + complete Learnset evidence. The retained pinned
  PokéAPI snapshot has structured Species facts but does not contain the required Pokémon Move/Learnset surfaces.

## Risks / irreversible actions

- The largest semantic risk is confusing an editable Learn Level override with the canonical immutable Learnset
  source row. The v2 JSON format and UI keep them structurally separate and fail closed if the base/reference changes.
- A workbench export is a staging/import artifact, not an authorization to publish content or rewrite provenance.
- No irreversible action is owned by this task.

## Expected files / boundaries

- `apps/web/pokemon-analysis-preview.html`
- `apps/web/src/pokemon-analysis-preview.tsx`
- `apps/web/src/pokemon-analysis/*`
- focused tests under `apps/web/src/pokemon-analysis/`
- `tasks/active/TASK-117-hoenn-acquire-request.json` — proposed, non-authorized exact Hoenn ACQUIRE locator set
- this task record and roadmap metadata only as needed for canonical task visibility

## Completion

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
