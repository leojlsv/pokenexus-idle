# TASK-117 — Pokémon Move Analysis Workbench

## Metadata

- State: DONE
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
- Human gate: both exact Hoenn ACQUIRE requests were explicitly authorized; repository-history integration was
  explicitly authorized at `2026-10-04T19:03:17Z` and completed

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
- [x] Export All and Export Selected produce deterministic `pokenexus.pokemon-move-workbench.v3` JSON for the
      current Generation I–III analysis scope.
- [x] Export includes only referenced Moves for the exported Species while preserving complete canonical rows and
      exact source/provenance identifiers present on those rows.
- [x] Re-import of an exported file reproduces the same selected scope and Learn Level overrides; malformed,
      wrong-base or invalid/non-level-up overrides fail closed with a useful validation error.
- [x] Coverage distinguishes the immutable published v5 base from the exact local Hoenn staging artifact and reports
      complete National Dex 001–386 base-Species analysis coverage without presenting staged Hoenn rows as published.
- [x] Gen III completion reaches National Dex 001–386 only from an explicitly accepted local source/staging input;
      no missing rows are synthesized.
- [x] Relevant automated tests, web typecheck/lint/build and `git diff --check` pass.
- [x] Fresh independent QA reports no unresolved P0/P1 for the final Hoenn-complete workbench.

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

## Current state

Both Hoenn SPEC-022 ACQUIRE gates are complete. The Human Owner explicitly authorized the first exact
`TASK-117-hoenn-acquire-request.json` at `2026-10-04T15:30:38Z`, and the operation stayed inside that exact
provider/locator set:

- PokémonDB: **135/135** exact Species pages acquired into immutable snapshot
  `source-snapshot:pokemondb:4bff6719b2454a4594577fca71f6cfc77d359cd08fc52283e6d11832b647a9ca`;
- Bulbapedia: all 405 authorized locators were attempted under the current access policy. The 135 Generation IX
  Learnset URLs returned source-level 404, while all 135 Species pages and all 135 already-authorized Generation
  VIII BDSP fallback Learnset pages were acquired into immutable snapshot
  `source-snapshot:bulbapedia:52e7cc9cc41a9870190a59c12b699865dd231db9f5bae8edebae3290ccd7b3a7`;
- both snapshot manifests and every retained file hash pass `verifyLocalSourceSnapshot`;
- the Generation VIII parser gained an additive v7 path for the real Deoxys `Normal Forme` base-species scope;
  historical v6 behavior remains unchanged;
- final offline validation covers **135/135 Hoenn base Species**, **7,328 Learnset rows**, **437 unique source Move
  slugs**, and **0 parse errors**. Evidence hash:
  `sha256:7b311af70ad05a46eeeb018c80c686d47c16175346127585ca79a368be6b36c3`.

The Human Owner then explicitly authorized the exact second Move request at `2026-10-04T16:48:33Z`. Its
authorized bytes hash to
`sha256:eca256bf80ad71204a18b296138b57fa736f0b9c37bb56692f40b9849663ecbc`, covering only the 17 exact
Bulbapedia Move pages and 17 exact PokémonDB Move pages listed in that request. Acquisition completed without
redirects and produced:

- PokémonDB Move snapshot
  `source-snapshot:pokemondb:ef78f97b11afef8b2d627d9283172600059c70fd65ca8b698cc111905ff5f0a7`;
- Bulbapedia Move snapshot
  `source-snapshot:bulbapedia:32b6f43feb77a7e39a5ce6bc89bdd444e4f4e32473e5e68d38b4954e1a1e72a5`.

The verified offline staging step combines the immutable v5 publication with the two Hoenn Species/Learnset
snapshots, the two Move snapshots, the pinned PokéAPI snapshot and the retained Z-A Move-list snapshot. The exact
staging artifact is `apps/web/src/pokemon-analysis/hoenn-staging.json`, SHA-256
`2012d517189be550c470aa6a3a59059270cd41d7c452d9741fe8a23ad8507752`, with **135 Species / 17 Moves /
19 Abilities / 7,328 Learnset rows**. The analysis surface therefore reaches exact base National Dex **001–386**;
combined local counts are **564 Moves / 166 Abilities / 26,363 Learnset rows**.

Current owner validation: web **55/55 PASS** including the exact 001–386 staging integrity test; game-data
**412 PASS / 1 live skipped**; web typecheck/lint/normal build/dedicated workbench build PASS; game-data lint/build
PASS; `git diff --check` PASS. A prior 390 CSS-px browser measurement for the unchanged compact-line layout reported
`innerWidth=390`, `htmlScrollWidth=375` and `moveTableWidth=317`. Fresh exact-current independent QA is
**READY — P0/P1/P2/P3 = 0/0/0/0**, and delegated Class-B functional/architectural acceptance is
**ACCEPT — P0/P1/P2/P3 = 0/0/0/0**. Repository-history integration completed after the explicit Human gate;
no review or completion blocker remains.

## Dependencies

- DONE: TASK-087 static catalog implementation.
- DONE: TASK-112/113 local immutable source-snapshot architecture/implementation.
- DONE: TASK-114 schema-5 promotion contract/publication.
- DONE: TASK-115 schema-5 runtime delivery.
- Data completion dependency: complete. Both exact Hoenn ACQUIRE requests are authorized, executed and locally
  verified; the final workbench staging artifact is pinned by SHA-256.

## Risks / irreversible actions

- The largest semantic risk is confusing an editable Learn Level override with the canonical immutable Learnset
  source row. The v3 JSON format and UI keep them structurally separate and fail closed if the base/reference changes.
- A workbench export is a staging/import artifact, not an authorization to publish content or rewrite provenance.
- No irreversible action is owned by this task.

## Expected files / boundaries

- `apps/web/pokemon-analysis-preview.html`
- `apps/web/src/pokemon-analysis-preview.tsx`
- `apps/web/src/pokemon-analysis/*`
- focused tests under `apps/web/src/pokemon-analysis/`
- `tasks/active/TASK-117-hoenn-acquire-request.json` — exact first Hoenn ACQUIRE request; Human-authorized and executed
- `tasks/active/TASK-117-hoenn-move-acquire-request.json` — exact 34-page follow-up Move ACQUIRE request; Human-authorized and executed
- `apps/web/src/pokemon-analysis/hoenn-staging.json` — exact local Hoenn analysis/staging artifact; no publication mutation
- this task record and roadmap metadata only as needed for canonical task visibility

## Completion

- Feature commit: `425173a41d01024b3dbaedd440732b5579413efd` (`feat(web): add Pokemon move analysis workbench`).
- Feature branch `feat/TASK-117-pokemon-move-analysis-workbench` was pushed to origin.
- Main integration merge: `2088fc0522c5d2c6255d795ac9454710ccdc6e27`
  (`merge: integrate TASK-117 pokemon move analysis workbench`).
- The workbench remains a local analysis/staging surface. No immutable game-data publication, production Admin/LiveOps
  mutation, persistent migration, deploy or public enablement was performed by TASK-117.
