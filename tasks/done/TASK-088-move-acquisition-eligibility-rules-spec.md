# TASK-088 — Move Acquisition / Eligibility Rules Spec

## Metadata

- State: DONE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: N/A
- Auditor execution surface: N/A
- Consultants: Gameplay Systems Consultant (GSC) — required advisory
- Consultant execution surface(s): fresh independent ChatGPT worker
- Spec: `docs/specs/SPEC-010-move-acquisition-eligibility-rules.md`
- Related specs: SPEC-002, SPEC-003, SPEC-005, SPEC-006, SPEC-007, SPEC-008
- Related ADRs: ADR-005
- Branch: `spec/TASK-088-move-acquisition-eligibility-rules`
- Worktree: `.worktrees/main-governance-integration` used for governed acceptance/history integration

## Objective

Define the authoritative v1 Move availability/acquisition rules consumed by player-facing Pokémon
Move Loadout mutation and by deterministic bootstrap of uninitialized Pokémon.

The contract must distinguish immutable static Learnset facts from executable PokeNexus eligibility,
preserve the accepted persistent `1..4` Move Loadout boundary, and provide TASK-089 with an
implementation-ready authority without inventing economy, paid acquisition or scarcity semantics.

## Context

TASK-024 is DONE. TASK-088 now supplies the authoritative Move eligibility source required by
SPEC-005; TASK-089 is dependency-clear on these semantics but remains separately PLANNED, and
TASK-025 still waits for TASK-089.

Accepted upstream contracts already require:

- canonical Learnset rows are factual/contextual static data, not automatic player ownership;
- persisted selected Move Loadout is an ordered dense `1..4` list, not a learned-move inventory;
- player-facing mutation must validate every selected MoveId against server authority;
- Level/XP alone does not persist or imply learned-Move state;
- TM/machine possession alone grants no Move and cannot be consumed without TASK-088 rules;
- later static-data corrections do not silently rewrite an already accepted persisted loadout;
- new authoritative operations using both rules/data axes require an accepted exact
  `{gameDataVersion, rulesVersion}` context.

Current canonical `game-data-core-kanto-johto-v2` evidence also shows the level-up-only baseline is
technically viable: all 293 published Species/forms have at least one level-up Move at Level 1.
That observation is validation evidence, not a permanent schema guarantee; runtime behavior remains
fail-closed if a future accepted catalog cannot bootstrap a specific Pokémon.

This task intentionally defines no paid acquisition, market value, scarcity, drop-rate or TM sink
economy. Therefore PXE is N/A for the approved v1 baseline. Any later proposal that makes Move acquisition
paid/scarce/economic must add PXE review before Human acceptance of that change.

## Proposed v1 direction

The approved v1 baseline is intentionally narrow:

1. only canonical `level-up` Learnset rows can create current player-facing Move availability;
2. a Move is level-available when its minimum canonical level-up threshold for the Pokémon's
   Species is less than or equal to the Pokémon's authoritative current Level;
3. Level gain expands future availability but never auto-rewrites the persisted selected loadout;
4. v1 persists no separate learned/acquired Move inventory;
5. `evolution`, `machine`, `egg`, `tutor`, `transfer` and `reminder` rows are factual
   Learnset evidence only and grant no executable acquisition authority in v1;
6. TM/machine Item ownership is therefore not consumed or interpreted by v1;
7. bootstrap of an uninitialized Pokémon selects up to four currently level-available Moves using
   a deterministic most-recent-unlock ordering defined by SPEC-010;
8. existing accepted loadouts remain durable across later eligibility/static corrections; new
   mutations use the then-current accepted exact context.

This keeps TASK-089 implementable without a new Item↔Move relation or learned-set persistence while
preserving explicit extension points for future acquisition methods.

## Scope

- Define normative vocabulary for static Learnset rows, level-derived availability, selected loadout
  and future durable acquisition state.
- Define exact v1 level-up Move availability and duplicate-row handling.
- Define deterministic initial/bootstrap Move selection for new and staged/uninitialized Pokémon.
- Define Level-up behavior relative to an existing selected loadout.
- Define player-facing complete-loadout replacement validation.
- Define exact rules/data pinning and fail-closed behavior.
- Define static-data correction and historical-loadout behavior.
- Decide v1 status of machine/TM, tutor, egg, evolution, transfer and reminder methods.
- Define future extension requirements for durable acquired Move state and machine/item relations.
- Hand concrete authority/persistence/API boundaries to TASK-089 and TASK-025.

## Out of scope

- combat Move execution, cooldown, targeting or effect formulas owned by SPEC-003/content rules;
- Move balance, damage tuning or automatic combat AI/policy;
- evolution rules or Species mutation;
- breeding/egg generation or inheritance rules;
- tutor NPC/content design;
- transfer/import feature behavior;
- TM ItemId↔Move factual relation publication in the current baseline;
- TM consumption/reusable/scarcity/economic semantics in the current baseline;
- paid acquisition, monetization, market/trade or economy design;
- public API implementation;
- production persistence/runtime implementation owned by TASK-089;
- Git history operations without separate Human Owner authorization.

## Acceptance criteria

- [x] SPEC-010 clearly distinguishes static Learnset facts from executable Move availability.
- [x] The authoritative v1 eligible set is deterministic for exact Pokémon state +
      `{gameDataVersion,rulesVersion}`.
- [x] The exact pair is server-selected; clients cannot choose authoritative version axes.
- [x] Immutable exact-pair compatibility is distinct from current new-use eligibility/deprecation.
- [x] The exact `rulesVersion` resolves the immutable
      `pokenexus.move-eligibility.level-up-only.v1` artifact semantics/hash rather than being
      conflated with the artifact identity.
- [x] Raw client MoveIds and raw Learnset membership alone cannot authorize a loadout mutation.
- [x] Level-up availability uses one exact accepted Learnset context and an explicit threshold rule.
- [x] Duplicate level-up rows for one Move have deterministic unlock-level semantics.
- [x] Level gain does not silently rewrite/reorder an existing persisted selected loadout.
- [x] Bootstrap always returns a valid ordered dense `1..4` loadout or fails closed.
- [x] Bootstrap tie-breaking is deterministic and independent of parser/source row order.
- [x] Existing persisted loadouts are not silently rewritten after static-data/rule correction.
- [x] New loadout mutations use the then-authoritative accepted exact context.
- [x] Selected-only grandfathering is explicit: a corrected-away unselected Move can disappear from
      future eligibility, while a legacy selected Move persists until a complete replacement that
      must satisfy current eligibility.
- [x] v1 machine/TM/tutor/egg/evolution/transfer/reminder behavior is explicit rather than inferred.
- [x] The baseline requires no Item↔Move relation or separate learned/acquired persistence.
- [x] Future durable acquisition/machine extensions have explicit schema/version/consultant gates.
- [x] TASK-089 receives an implementation-ready pure eligibility/bootstrap contract.
- [x] TASK-025 receives a clear prohibition on exposing unrestricted Move mutation before TASK-089.
- [x] Required GSC advisory consultation is completed and reconciled.
- [x] Independent QA has no unresolved P0/P1 finding.
- [x] Human Owner explicitly accepts the complete SPEC-010 semantic baseline.

## Validation / tests

- [x] Cross-spec consistency review against SPEC-002/003/005/006/007/008 and ADR-005.
- [x] Current canonical catalog check: every published Species/form can bootstrap under v1.
- [x] Current canonical catalog check: duplicate Move level-up thresholds resolve deterministically.
- [x] Deterministic bootstrap examples across Level 1, higher Level and >4 eligible Moves.
- [x] Static-correction/replay reasoning for existing selected loadouts versus new mutations.
- [x] Required GSC advisory review.
- [x] Independent QA Definition-of-Ready/spec review.
- [x] `corepack pnpm roadmap:generate`.
- [x] `corepack pnpm roadmap:check`.
- [x] `git diff --check`.

## Pre-acceptance gate evidence

- Exact reviewed SPEC-010 DRAFT SHA-256:
  `810632522A8D12834AD7AEC2BEB5F2ADE3C45F11DCAC08DCE4D5A43206235363`.
- Required GSC final advisory: **PASS**, P0/P1/P2/P3 `0/0/0/0`.
- Independent QA final re-gate: **READY**, P0/P1/P2/P3 `0/0/0/0`.
- The earlier QA P1 about `rulesVersion`/rule-artifact/exact-pair authority is closed: the server
  selects the exact pair, retained immutable compatibility is distinct from current new-use
  eligibility/deprecation, and the selected `rulesVersion` must resolve the immutable
  `pokenexus.move-eligibility.level-up-only.v1` artifact semantics/hash.
- The earlier comparator P2 is closed: bootstrap uses `unlockLevel DESC`, then exact canonical
  MoveId UTF-8 unsigned-byte lexicographic order with strict-prefix-shorter-first and no
  locale/source/parser ordering.
- Current canonical `game-data-core-kanto-johto-v2` validation: 293 Species/forms; all 293 have at
  least one Level-1 `level-up` Move; each Species has exactly one selected source context; nine
  Species have repeated level-up rows for at least one Move, covered by the minimum-level rule.
- Concrete bootstrap checks include Ampharos at Level 1 (>4 candidates, deterministically capped to
  four), Ampharos at Level 20 (higher-level ordering), and Abra at Level 1 (single-Move bootstrap).
- Machine/TM remains non-executable in v1. Current static evidence has no canonical ItemId↔Move
  machine relation; PXE remains N/A because no scarcity/economy/paid acquisition semantics are
  proposed.
- `corepack pnpm roadmap:generate`, `corepack pnpm roadmap:check` and `git diff --check`: PASS.
- No production TypeScript/SQL/runtime change and no Git history mutation has occurred for TASK-088.

## Dependencies

- TASK-006 / SPEC-002: DONE / APPROVED.
- TASK-019 / SPEC-005: DONE / APPROVED.
- TASK-020: DONE.
- TASK-021 / SPEC-006: DONE / APPROVED.
- TASK-022 / SPEC-007: DONE / APPROVED.
- TASK-024: DONE.
- TASK-087: DONE.
- TASK-092 / SPEC-008: DONE / APPROVED.

## Risks / irreversible actions

- Treating all canonical Learnset methods as immediately player-available would collapse factual
  provenance into executable rules and bypass future acquisition systems.
- Persisting a learned-set prematurely would create migration/version semantics not needed by the
  level-up-only MVP.
- Using source/parser row order for bootstrap would make gameplay depend on ingestion incidental
  ordering and could change after harmless data maintenance.
- A TM machine identifier is source-context scoped and is not an ItemId or globally stable Move
  identity; equating them would create incorrect authority.
- Automatically replacing Moves on Level-up would mutate player configuration without a selected
  loadout command and could change deterministic combat behavior unexpectedly.
- No irreversible runtime/database action is authorized by this Class A specification task.

## Expected files / boundaries

- `tasks/done/TASK-088-move-acquisition-eligibility-rules-spec.md`
- `docs/specs/SPEC-010-move-acquisition-eligibility-rules.md`
- `docs/project/PROJECT_ROADMAP.md`
- generated `docs/project/PROJECT_ROADMAP.html`

No production TypeScript, SQL migration, public route, static catalog schema change or runtime binding
is in scope for TASK-088.

## Human Owner gate

On 2026-09-22 the Human Owner explicitly accepted the complete SPEC-010 semantic baseline described
by the exact pre-transition snapshot SHA-256
`810632522A8D12834AD7AEC2BEB5F2ADE3C45F11DCAC08DCE4D5A43206235363`.

The accepted decisions include level-up-only derived availability, no persistent learned/acquired
Move set, deterministic bootstrap, no automatic loadout rewrite, selected-only grandfathering,
server-selected exact static/rules context, and deferral of machine/TM/tutor/egg/evolution/transfer/
reminder acquisition.

GSC and QA were already clear at P0/P1/P2/P3 `0/0/0/0`, so TASK-088 completed its Class A
semantic/review gates before repository closure.

## Acceptance state

- SPEC-010 is **APPROVED**.
- TASK-088 is **DONE**.
- TASK-089 may use the approved rules as its dependency once normal task activation occurs.
- On 2026-09-22 the Human Owner separately authorized repository history/completion for TASK-088.
- The accepted APPROVED/ACCEPTANCE snapshot was committed as `72039d8`
  (`docs(project): approve move eligibility spec`), pushed on
  `spec/TASK-088-move-acquisition-eligibility-rules`, and fast-forward integrated into `main`.

## Completion

TASK-088 is DONE. SPEC-010 is APPROVED after required GSC advisory **PASS** and independent QA
**READY**, both P0/P1/P2/P3 `0/0/0/0`, followed by explicit Human Owner semantic approval and
separate repository-history/completion authorization on 2026-09-22.

The approved rules establish level-up-only derived Move eligibility, deterministic bootstrap,
server-selected exact static/rules authority, no automatic loadout rewrite, no persistent
learned/acquired Move set, selected-only grandfathering after corrections, and deferral of
machine/TM/tutor/egg/evolution/transfer/reminder acquisition.

The accepted specification snapshot was integrated into canonical `main` at `72039d8`. This DONE
metadata records governed closure only; TASK-089 owns implementation and remains PLANNED until
explicitly activated.
