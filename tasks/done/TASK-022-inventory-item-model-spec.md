# TASK-022 — Inventory / Item Model Spec

## Metadata

- State: DONE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor (inventory concurrency/integrity spot-check)
- Auditor execution surface: fresh independent ChatGPT worker
- Consultants: Gameplay Systems Consultant (GSC); Player Experience & Economy Consultant (PXE)
- Consultant execution surface(s): fresh independent ChatGPT advisory workers
- Spec: `docs/specs/SPEC-007-inventory-item-model.md`
- Related specs: SPEC-001, SPEC-002, SPEC-003, SPEC-004, SPEC-005, SPEC-006
- Related ADRs: ADR-004, ADR-005
- Branch: `spec/TASK-022-inventory-item-model`
- Worktree: `.worktrees/TASK-022-inventory-item-model`

## Objective

Define and obtain Human Owner acceptance for the authoritative v1 Inventory / Item contract before
TASK-024 persists item mutations/rewards and before Hunt/capture/Move-acquisition systems consume
items as executable player state.

The specification must turn the deliberately minimal Item Definition and Inventory aggregate root
from SPEC-002/SPEC-004 into explicit product semantics without inventing reward cadence, capture
formulas, Move-acquisition rules or monetization.

## Context

Accepted upstream contracts deliberately stop before item behavior:

- SPEC-001 assigns TASK-022 ownership of stackability, quantity/per-copy representation,
  consumable/equipment/TM/capture-item semantics, inventory constraints and mutation contracts.
- SPEC-002 Item Definition v1 contains identity/source/category/provenance only and explicitly
  excludes executable behavior, stacking, owned-item representation, capture behavior and machine
  relationships.
- SPEC-004 already provides one `player_inventories` aggregate root per Player with `rowVersion`,
  but intentionally has no inventory-entry table until TASK-022 defines the product model.
- SPEC-005 keeps Move acquisition separate from selected Move Loadout and does not authorize item-
  based Move acquisition.
- SPEC-006 keeps XP/progression distinct from item/reward semantics.

This is a Class A product/rules decision. `GSC + PXE` consultation is mandatory before Human
acceptance under the accepted consultation policy.

## Scope

- Define v1 owned-item representation:
  - quantity/stack state versus durable per-copy identity;
  - exact rule for which item families, if any, require per-copy identity;
  - zero quantity / entry deletion semantics;
  - maximum quantity/stack behavior and technical overflow handling.
- Define Inventory capacity semantics:
  - whether v1 has any global/category/slot/carry capacity;
  - behavior when a grant would exceed an accepted capacity;
  - distinguish product capacity from API pagination/query limits.
- Define item category/rule taxonomy used by authoritative game logic without compiling source
  prose into behavior.
- Define consumable mutation semantics:
  - ownership/quantity checks;
  - atomic consume + target effect ordering;
  - valid no-op/failure behavior;
  - whether failed application consumes an item;
  - concurrency/OCC expectations at the Inventory aggregate boundary.
- Define healing/Potion semantics needed by TASK-033, including target eligibility and bounded HP
  restoration, without creating a second combat engine.
- Decide whether v1 explicitly supports revival items and, if accepted, define the minimum semantic
  contract needed by later Hunt rules; otherwise defer revival explicitly.
- Define capture-item identity/use boundary while leaving capture probability and encounter outcome
  resolution to TASK-033/036.
- Define TM/machine/item semantics only to the extent required to hand off cleanly to TASK-088;
  Move eligibility/acquisition remains TASK-088-owned.
- Decide whether equipment exists in v1. If accepted, define ownership/equip-state boundary and
  identify any required follow-up persistence/rules work without inventing combat effects here.
- Define authoritative grant/remove/use command semantics and Inventory `rowVersion` mutation rules
  sufficient for TASK-024 implementation.
- Define durable item-use/capture correlation and replay/idempotency handoff so response uncertainty
  cannot double-consume or duplicate an already completed authoritative consequence.
- Define static-data handoff if accepted item semantics require a SPEC-002 `ItemDefinition` schema
  extension or machine/item relation artifact under a new `schemaVersion`.
- Define correction/versioning behavior so static-data changes do not silently rewrite durable
  owned-item state or reinterpret historical authoritative actions.
- Record GSC/PXE consultation findings, alternatives, material disagreements and unresolved Human
  Owner decisions in the spec/task evidence before acceptance.

## Out of scope

- concrete Hunt/Gym/PvP/World Boss item-drop tables or reward cadence;
- reward ledger/idempotency schema and multi-reward atomicity owned by TASK-023;
- TASK-024 production migrations/repositories/API implementation;
- capture formula/probability or actual capture-resolution logic;
- Move learned/eligible-set rules, TM compatibility and Move acquisition owned by TASK-088;
- executable Move/Ability rules;
- pricing, premium currency, battle pass, paid stamina, paid inventory expansion or any other
  monetization mechanic unless separately proposed and accepted through Class A governance;
- player-to-player trading/economy rules owned by TASK-070/071;
- source-site prose as executable item behavior;
- UI/public API payload design;
- Git history operations without separate Human Owner authorization.

## Acceptance criteria

- [x] SPEC-007 defines quantity/stack versus per-copy ownership semantics without ambiguity.
- [x] Inventory capacity/limit policy and over-cap grant behavior are explicit, including the
      explicit absence of capacity if that is the accepted v1 choice.
- [x] Consumable use is server-authoritative, atomic and explicit about failure/no-op consumption.
- [x] Inventory `rowVersion`/transaction boundary is sufficient for TASK-024 without guessing.
- [x] Durable item-use/capture replay semantics bind one logical command/attempt to one completion
      and cannot double-debit/reapply after response uncertainty; TASK-023 retains ledger/key-format
      ownership.
- [x] Potion/healing semantics are bounded and composable with TASK-033/Combat rules rather than
      creating a parallel effect engine.
- [x] Revival is either fully bounded for v1 or explicitly deferred; no implicit franchise rule.
- [x] Capture items are modeled without defining capture probability/resolution prematurely.
- [x] TM/machine and equipment boundaries do not leak into TASK-088/combat ownership.
- [x] Any required `ItemDefinition`/relation schema extension is explicitly versioned through
      SPEC-002's `schemaVersion`/`gameDataVersion` model.
- [x] Static-data corrections do not silently mutate or reinterpret existing owned state.
- [x] GSC consultation evidence covers loop/pacing/progression/system-interaction consequences.
- [x] PXE consultation evidence separately covers F2P viability, payer value, scarcity/fairness,
      economy sustainability, monetization-pressure/P2W risk and abuse incentives.
- [x] No monetization mechanic is adopted merely because PXE evaluated the space.
- [x] Fresh QA re-review of the corrected exact artifact reports no unresolved P0/P1 before
      authoritative APPROVED metadata/history integration.
- [x] Fresh IA concurrency/integrity re-audit of the corrected exact artifact reports no unresolved
      P0/P1 before authoritative
      APPROVED metadata/history integration.
- [x] Human Owner explicitly accepted the complete item/inventory semantics on 2026-09-18.

## Consultation evidence

- GSC consultation: completed read-only. Recommended quantity-only ownership, no gameplay
  capacity/stack cap, atomic validate→effect+consume, shared deterministic Potion evaluator,
  no auto-use, revival/equipment deferral and explicit inter-Battle Hunt-use preference.
- PXE consultation: completed read-only. Converged on the same baseline, emphasizing no artificial
  storage pressure, no monetization hooks, fail-closed overflow, player-trust semantics and future
  P2W/segment risk.
- Recorded disagreement: GSC recommends capture-item consumption on every valid accepted capture
  attempt regardless of outcome; PXE recommends leaving failed-attempt consumption to TASK-036
  until capture scarcity/cadence is known. Human Owner resolved this on 2026-09-18: every valid
  accepted attempt consumes one capture item regardless of success/failure; in practical terms,
  a Poké Ball that is thrown is lost.
- TM permanence/consumption remains TASK-088-owned. GSC recommends consume-on-success if a
  consumable TM model is later adopted; PXE keeps that economic choice with TASK-088.

## Readiness evidence

- Formal independent QA Definition-of-Ready review: **READY**.
- P0/P1/P2/P3: `0/0/0/0`.
- This readiness result authorized the Class A specification work to proceed; it did not itself
  accept product semantics. The Human Owner subsequently resolved/accepted the proposed direction
  on 2026-09-18; QA/IA still gate authoritative APPROVED metadata and history integration.

## Human Owner decision

- On 2026-09-18 the Human Owner accepted the complete proposed SPEC-007 baseline.
- Capture clarification: **one Poké Ball is consumed when a valid capture attempt is accepted,
  regardless of whether capture succeeds or fails**.
- Independent QA + IA still gate authoritative APPROVED status. If either gate requires a material
  semantic correction, that delta must return to the Human Owner rather than being treated as
  covered by this acceptance.

## Final review evidence

- Independent QA on the initial accepted REVIEW snapshot: **READY**, P0/P1/P2/P3 `0/0/0/0`.
- One Independent Auditor pass was **PASS**, P0/P1/P2/P3 `0/0/0/0`.
- A redundant independent IA then found a **P1 replay/idempotency gap**: OCC alone does not prevent a
  completed item-use/capture command from being replayed after response uncertainty once fresh
  versions are loaded.
- FIX correction adds TASK-023/source-contract durable correlation semantics and the invariant
  `one logical capture attempt ↔ one outcome ↔ one required debit`, without changing the Human
  Owner's accepted product rule.
- Fresh QA re-review on the corrected exact snapshot: **READY**, P0/P1/P2/P3 `0/0/0/0`.
- Fresh IA concurrency/integrity re-audit on the corrected exact snapshot: **PASS**,
  P0/P1/P2/P3 `0/0/0/0`.
- No material product semantic changed; the Human Owner's 2026-09-18 acceptance still matches the
  exact APPROVED SPEC-007 direction.

## Validation / tests

- [x] GSC consultation handoff completed read-only.
- [x] PXE consultation handoff completed read-only.
- [x] Cross-spec ownership audit against SPEC-001/002/003/004/005/006.
- [x] Fresh independent QA re-review of corrected FIX candidate.
- [x] Fresh independent IA concurrency/integrity re-audit of corrected FIX candidate.
- [x] `corepack pnpm roadmap:check` after roadmap lifecycle metadata changes.
- [x] `git diff --check`.

## Dependencies

- TASK-006 — Static Game Data Schema & Rules Versioning
- TASK-013 — PostgreSQL Schema v1
- TASK-019 — Pokémon Instance / Collection / Team Spec
- TASK-093 — Gameplay Systems & Player Experience Consultant Governance

## Risks / irreversible actions

- Inventory representation becomes a durable persistence/API boundary consumed by many later
  systems; ambiguous stack/per-copy/capacity semantics would create migration debt.
- Item use can couple Inventory and Pokémon/Hunt state. Cross-aggregate atomicity must be explicit
  and must not be inferred from one aggregate's `rowVersion`.
- Scarcity/capacity choices can become de facto monetization pressure even without a paid feature;
  PXE consultation covered that risk before the Human decision.
- IA is already required because the spec defines Inventory OCC and cross-aggregate consume/effect
  atomicity. If the scope later expands into player-to-player economy/trading, paid systems,
  security-sensitive reward authority or destructive migration policy, the IA scope must expand
  accordingly before acceptance.
- No irreversible runtime/database action is authorized by this spec task.
- Repository history/completion was explicitly authorized by the Human Owner on 2026-09-18 after
  TASK-022 reached ACCEPTANCE.

## Expected files / boundaries

- `tasks/active/TASK-022-inventory-item-model-spec.md`
- `docs/specs/SPEC-007-inventory-item-model.md`
- `docs/project/PROJECT_ROADMAP.md`
- generated `docs/project/PROJECT_ROADMAP.html`

No production TypeScript, SQL migration, dependency, lockfile or runtime binding is in scope.

## Completion

TASK-022 is DONE. SPEC-007 is APPROVED after the Human Owner accepted the v1 Inventory / Item
semantics, including the rule that every valid accepted capture attempt consumes exactly one
capture item whether the capture succeeds or fails, and the corrected replay/idempotency contract
cleared fresh independent QA and IA at P0/P1/P2/P3 `0/0/0/0`.

The accepted current-main reconciliation snapshot was committed as
`da7cdae4f0f857a7e24c88a111d610d732b1cc29`, pushed on
`spec/TASK-022-inventory-item-model-integration`, and fast-forward integrated into canonical
`main` after explicit Human Owner repository-history/completion authorization on 2026-09-18.

This DONE metadata records governed closure only. TASK-023 owns durable reward/idempotency design,
TASK-024 owns production Inventory/reward implementation, TASK-033 owns Hunt-use timing,
TASK-036 owns capture eligibility/probability/outcome, and TASK-088 owns TM/Move acquisition.
