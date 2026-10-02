# TASK-109 — First Pre-alpha Bootstrap, Wilds Content & Hunt Admission

## Metadata

- State: DRAFT
- Readiness note: product/content rules are accepted in SPEC-020, but implementation is not authorized in this session
- Class: B — implement accepted bootstrap/content/admission rules without balance reinterpretation
- Owner: Lead Developer
- Owner execution surface: ChatGPT delegated implementation worker
- Reviewer: independent QA Reviewer (bootstrap, content authority, Start admission and cross-package conformance)
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: independent Auditor (bootstrap ownership/Inventory/vitality atomicity and idempotency)
- Auditor execution surface: independent ChatGPT delegated auditor
- Consultants: N/A — starter/Wilds/admission rules are already Human-approved; provisional XP remains exactly the accepted provisional value
- Consultant execution surface(s): N/A
- Specs: APPROVED SPEC-020/021 plus existing SPEC-002/005/007/010/011/013/015 as forward-amended
- Related: TASK-020/024/025/034/035/038/087/089/091/104/106
- Branch: not created
- Worktree: not created

## Objective

Implement the first-Pre-alpha new-player bootstrap, authoritative Verdant Edge/Wilds content and strict Solo Hunt Start admission so a fresh account reaches one valid management-first Team/Hunt state without fallback synthesis or hidden client authority.

## In scope

1. Implement idempotent new-player bootstrap:
   - choose exactly one Level-1 starter from Bulbasaur, Charmander, Squirtle, Chikorita, Cyndaquil or Totodile;
   - initially own only that Pokémon;
   - create its vitality at max HP through TASK-108 authority;
   - auto-create the first saved Team with the starter as Leader;
   - auto-assign up to four valid Level-1 Moves using existing authoritative Move eligibility.
2. Preserve the verified starter Level-1 loadouts:
   - Bulbasaur: Growl + Tackle;
   - Charmander: Growl + Scratch;
   - Squirtle: Tackle + Tail Whip;
   - Chikorita: Growl + Tackle;
   - Cyndaquil: Leer + Tackle;
   - Totodile: Leer + Scratch.
3. Grant the accepted initial Inventory atomically with bootstrap:
   - 50 standard Poké Balls;
   - 20 basic Potions;
   - 5 starter/basic 25%-tier Revives.
4. Publish/validate first-Pre-alpha Verdant Edge -> Wilds authority:
   - permanent basic/open-ended Hunt;
   - levels: Lv1 50%, Lv2 35%, Lv3 15%;
   - species weights: Pidgey 16, Rattata 15, Caterpie 18, Sentret 17, Ledyba 17, Sunkern 17;
   - species and level roll independently;
   - all six are capturable and have at least one production-executable Level-1 progress-capable Move.
5. Implement the accepted provisional Encounter economy for Wilds:
   - Player XP = `2 × wild level`;
   - Pokémon XP pool = `6 × wild level`;
   - independent 15% Poké Ball ×1 drop;
   - independent 5% basic Potion ×1 drop;
   - both may drop;
   - no Revive drop.
6. Implement strict Start admission:
   - saved Team size 1–6;
   - every selected member has dense 1–4 selected Moves;
   - every selected Move is production-executable;
   - every selected member has at least one progress/damage-capable executable Move;
   - unsupported selected Move blocks Start;
   - no fallback Move/loadout synthesis;
   - KO members may remain selected;
   - at least one selected member must be conscious;
   - authoritative Team order selects the first living eligible active;
   - running Hunt pins Team/config snapshot.
7. Ensure first Hunt is immediately available after valid bootstrap; no formal tutorial gate is introduced.

## Out of scope

- Potion/Revive/capture policy evaluation, Inventory spending automation or offline reconciliation.
- Game-core Revive/Potion cadence primitives.
- PokéCenter implementation beyond consuming TASK-108 authority.
- Presentation feed/activity UI.
- Evolution or later Safari/stamina/content/balance changes.
- Rebalancing the provisional XP or accepted Wilds weights/drops.

## Acceptance criteria

- [ ] Each starter path is idempotent and atomically produces exactly one owned Level-1 starter, one vitality row, one first Team, accepted loadout and exact initial Inventory.
- [ ] Retry/race cannot duplicate starter, Team or initial Inventory grants.
- [ ] Published Wilds weights/levels/rewards match accepted values exactly and fail closed if required content authority is unavailable.
- [ ] All six Wild species resolve at least one production-executable Level-1 progress-capable Move.
- [ ] Strict admission rejects invalid Team size, sparse/zero/excess Move selection, unsupported Move and no-progress member without fallback synthesis.
- [ ] Damaged/KO mixed Team may Start only when at least one member is conscious and chooses first living member by Team order.
- [ ] Running Hunt freezes Team/config input against later saved-Team edits.
- [ ] Independent QA and IA report no unresolved P0/P1; Class-B acceptance completes after implementation.

## Required validation

- Bootstrap transaction/idempotency/race tests across all six starters.
- Exact Inventory/vitality/Team/loadout assertions.
- Static-content validation for Wilds species/level weights and executable-move support.
- Start admission matrix including KO/damaged Team order and unsupported Move cases.
- Relevant PostgreSQL/API/game-data/game-core integration plus lint/typecheck/test/build.

## Dependencies

- TASK-108 persistent vitality implementation.
- TASK-020 Collection/Team persistence; TASK-024 Inventory/reward persistence; TASK-034 PvE content; TASK-089 Move eligibility; TASK-091 production Move support; TASK-038 historical Hunt API.
- APPROVED SPEC-020/021 and TASK-106 acceptance.

## Risks / irreversible actions

- Bootstrap is a one-time ownership/economy mutation and must be transactionally idempotent.
- Content/rules must use immutable versioned authority so future balance does not rewrite historical Hunts.
- No production bootstrap enablement, migration, deploy or Git-history action is authorized by this DRAFT task.

## Readiness / execution gate

Promotion to READY requires TASK-108 implementation availability, explicit runtime authorization and confirmed independent QA/IA assignments.

