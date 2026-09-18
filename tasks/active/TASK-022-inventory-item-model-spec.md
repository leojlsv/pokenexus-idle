# TASK-022 — Inventory / Item Model Spec

## Metadata

- State: READY
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

- [ ] SPEC-007 defines quantity/stack versus per-copy ownership semantics without ambiguity.
- [ ] Inventory capacity/limit policy and over-cap grant behavior are explicit, including the
      explicit absence of capacity if that is the accepted v1 choice.
- [ ] Consumable use is server-authoritative, atomic and explicit about failure/no-op consumption.
- [ ] Inventory `rowVersion`/transaction boundary is sufficient for TASK-024 without guessing.
- [ ] Potion/healing semantics are bounded and composable with TASK-033/Combat rules rather than
      creating a parallel effect engine.
- [ ] Revival is either fully bounded for v1 or explicitly deferred; no implicit franchise rule.
- [ ] Capture items are modeled without defining capture probability/resolution prematurely.
- [ ] TM/machine and equipment boundaries do not leak into TASK-088/combat ownership.
- [ ] Any required `ItemDefinition`/relation schema extension is explicitly versioned through
      SPEC-002's `schemaVersion`/`gameDataVersion` model.
- [ ] Static-data corrections do not silently mutate or reinterpret existing owned state.
- [ ] GSC consultation evidence covers loop/pacing/progression/system-interaction consequences.
- [ ] PXE consultation evidence separately covers F2P viability, payer value, scarcity/fairness,
      economy sustainability, monetization-pressure/P2W risk and abuse incentives.
- [ ] No monetization mechanic is adopted merely because PXE evaluated the space.
- [ ] QA reports no unresolved P0/P1 before Human acceptance.
- [ ] IA concurrency/integrity spot-check reports no unresolved P0/P1 before Human acceptance.
- [ ] Human Owner explicitly accepts the complete item/inventory semantics before implementation.

## Consultation evidence

- GSC consultation: completed read-only. Recommended quantity-only ownership, no gameplay
  capacity/stack cap, atomic validate→effect+consume, shared deterministic Potion evaluator,
  no auto-use, revival/equipment deferral and explicit inter-Battle Hunt-use preference.
- PXE consultation: completed read-only. Converged on the same baseline, emphasizing no artificial
  storage pressure, no monetization hooks, fail-closed overflow, player-trust semantics and future
  P2W/segment risk.
- Recorded disagreement: GSC recommends capture-item consumption on every valid accepted capture
  attempt regardless of outcome; PXE recommends leaving failed-attempt consumption to TASK-036
  until capture scarcity/cadence is known. SPEC-007 surfaces this for Human Owner resolution.
- TM permanence/consumption remains TASK-088-owned. GSC recommends consume-on-success if a
  consumable TM model is later adopted; PXE keeps that economic choice with TASK-088.

## Readiness evidence

- Formal independent QA Definition-of-Ready review: **READY**.
- P0/P1/P2/P3: `0/0/0/0`.
- This readiness result authorizes the Class A specification work to proceed. It does **not**
  accept unresolved SPEC-007 product decisions or replace the required IA/Human gates.

## Validation / tests

- [x] GSC consultation handoff completed read-only.
- [x] PXE consultation handoff completed read-only.
- [ ] Cross-spec ownership audit against SPEC-001/002/003/004/005/006.
- [ ] Fresh independent QA review of exact DRAFT/REVIEW spec candidate.
- [ ] Fresh independent IA concurrency/integrity spot-check of exact spec candidate.
- [ ] `corepack pnpm roadmap:check` after roadmap lifecycle metadata changes.
- [ ] `git diff --check`.

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
  PXE must evaluate this before Human acceptance.
- IA is already required because the spec defines Inventory OCC and cross-aggregate consume/effect
  atomicity. If the scope later expands into player-to-player economy/trading, paid systems,
  security-sensitive reward authority or destructive migration policy, the IA scope must expand
  accordingly before acceptance.
- No irreversible runtime/database/Git action is authorized by this DRAFT.

## Expected files / boundaries

- `tasks/active/TASK-022-inventory-item-model-spec.md`
- `docs/specs/SPEC-007-inventory-item-model.md`
- `docs/project/PROJECT_ROADMAP.md`
- generated `docs/project/PROJECT_ROADMAP.html`

No production TypeScript, SQL migration, dependency, lockfile or runtime binding is in scope.

## Completion

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
