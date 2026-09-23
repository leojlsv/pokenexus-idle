# TASK-090 — Production Move & Ability Rule Content Spec

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
- Spec: `docs/specs/SPEC-012-production-move-ability-rule-content.md`
- Related specs: SPEC-002, SPEC-003, SPEC-005, SPEC-010, SPEC-011
- Related ADRs: ADR-004
- Related tasks: TASK-006, TASK-008, TASK-009, TASK-011, TASK-025, TASK-087, TASK-088, TASK-089, TASK-091, TASK-033, TASK-035
- Branch: `main` canonical governance worktree; Human Owner authorized repository/history completion on 2026-09-23
- Worktree: `.worktrees/main-governance-integration`

## Objective

Freeze an implementation-ready production Move/Ability rule-content contract before TASK-091 so
Solo Hunt and later combat modes consume explicit immutable content rather than inferred Pokémon
prose or ad-hoc engine exceptions.

## Context

TASK-025 is DONE. The shared Combat Engine and Move eligibility/API authority are integrated, but
broad production Move/Ability execution content is intentionally still absent.

Current v2 evidence exposes a material boundary: SPEC-010 level-up eligibility reaches 453 unique
Moves, while current SPEC-003 primitives cannot faithfully represent every franchise mechanic.
TASK-090 must make the resulting production policy explicit before TASK-091 implements a catalog.

## Scope

- Define immutable production rule-content manifest/support-state semantics.
- Define simple-damage allowlist and authored-rule boundaries.
- Freeze the exact first-release per-Move support profile as a Human-accepted companion artifact;
  TASK-091 must not discover/promote support semantics independently.
- Define fail-closed unsupported-content behavior.
- Define factual `sourceTarget` -> executable TargetScope mapping policy.
- Freeze the policy between persistent selected Move Loadout and partial combat executability.
- Freeze the initial production Ability activation policy.
- Define TASK-091 publication, compatibility, validation and performance requirements.
- Define TASK-091 integration responsibility for the new production-selectability artifact through
  the existing TASK-089 service and TASK-025 HTTP path.
- Define a production-mode playability gate so a merely executable status-only loadout is not
  mistaken for a viable combat participant.
- Preserve SPEC-003 engine authority and SPEC-010/011 player-state authority unless the Human Owner
  explicitly accepts a recorded Class A amendment.

## Out of scope

- TASK-091 implementation/code/catalog publication;
- new Move acquisition/TM/item/economy semantics;
- rewards, monetization or paid-power mechanics;
- Hunt encounter/reward orchestration;
- hidden engine extensions or approximations for unsupported mechanics;
- Git/history mutation without separate Human Owner authorization.

## Human Owner decisions

The Human Owner accepted the complete SPEC-012 first-release recommendation:

1. target policy: PokeNexus **enemy-normalized option 2**;
2. new bootstrap/replacement: **Option B**, level-up eligibility intersected with exact executable
   support;
3. initial Ability policy: **option 3**, all 147 Abilities mechanically `inactive-by-policy`;
4. first Solo Hunt roster: TASK-033/034 may define a playability-cleared production subset instead
   of requiring all 293 Species/forms immediately;
5. content gate: deterministic per-Species/per-level playability/diversity evidence instead of a raw
   global coverage percentage;
6. exact first-release support profile: **27 executable-simple / 18 executable-authored / 408
   unsupported**, with all 147 Ability records `inactive-by-policy`.

This acceptance freezes partial franchise Move coverage with complete executable coverage of the
production-selectable set. Existing later-unsupported selections remain stored without silent
projection or rewrite; fresh Battle admission fails closed until deliberate valid replacement.

## Acceptance criteria

- [x] SPEC-012 does not infer executable behavior from Move/Ability names or prose.
- [x] Production support states and immutable rule artifacts are explicit/versioned.
- [x] Exact 453-Move companion support profile is Human-accepted before TASK-091 implementation.
- [x] Unsupported mechanics fail closed without generic/no-op replacement.
- [x] Target mapping cannot silently invent adjacency/field/side semantics absent from game-core.
- [x] Initial production target-mapping policy is explicitly accepted by the Human Owner.
- [x] Selected-loadout/combat-executability policy is explicitly accepted by the Human Owner.
- [x] Initial Ability activation policy is explicitly accepted by the Human Owner.
- [x] Initial all-293-versus-production-subset policy is explicitly accepted by the Human Owner.
- [x] Per-Species/per-level playability/diversity gate is accepted instead of a raw global coverage percentage.
- [x] Required GSC advisory is completed and reconciled: final delta re-gate **ADVISORY PASS**, no
      remaining product correction before the Human gate.
- [x] Independent QA reports no unresolved material finding on the final DRAFT: **READY
      0/0/0/0**.
- [x] TASK-091 receives exact publication/validation/versioning boundaries.
- [x] TASK-091 explicitly owns the Class B catalog + Move-authority/API integration required by the
      accepted production-selectability amendment.
- [x] TASK-011 periodic-content limits are adopted by the owning production publication contract.
- [x] TASK-091 must emit all-293/all-relevant-level capability evidence; TASK-033/034 must consume it
      and reject any production admission with zero progress-capable executable choices.
- [x] Human Owner explicitly accepts the complete SPEC-012 semantics before TASK-091 can reach READY.

## Validation / review

- Cross-check against APPROVED SPEC-002/003/010/011 and current game-core types/validators.
- Measure current v2 level-up Move and Ability coverage universe.
- Technical feasibility review against current MoveRule/AbilityRule/EffectRule primitives.
- Required GSC gameplay/team-building advisory.
- Independent QA spec/Definition-of-Ready review after advisory reconciliation.
- Final technical feasibility delta: **PASS**, no remaining correction; exact support universes,
  all 45 executable MoveRules, target dispositions, cooldown provenance, distinct authority/hash,
  TASK-091 integration scope and TASK-011 limits were independently re-verified.
- Final GSC delta: **ADVISORY PASS**, no remaining product correction before Human acceptance.
- Final independent QA delta: **READY 0/0/0/0**, all prior P1/P2 findings closed and no remaining
  correction before the Human gate.
- `corepack pnpm roadmap:generate`.
- `corepack pnpm roadmap:check`.
- `git diff --check`.

## Dependencies

- TASK-006 / SPEC-002 — DONE / APPROVED.
- TASK-008 / SPEC-003 — DONE / APPROVED.
- TASK-009 — DONE.
- TASK-011 — DONE.
- TASK-087 — DONE; current v2 immutable game data published.
- TASK-088 / SPEC-010 — DONE / APPROVED.
- TASK-089 — DONE.
- TASK-025 / SPEC-011 implementation — DONE.

## Risks / irreversible actions

- Partial Move coverage can make an API-valid persistent loadout unusable in combat unless the
  product contract explicitly resolves that mismatch.
- Arbitrary partial Ability activation can create uneven Species power based on implementation
  order rather than deliberate balance/content decisions.
- Approximating unsupported mechanics creates silent semantic drift and breaks deterministic replay
  compatibility when corrected later.
- Coupling SPEC-010 eligibility directly to current combat-content coverage would make a mutable
  content catalog redefine persistent player Move authority.
- TASK-090 itself authorizes no production/runtime/database or destructive implementation; that work
  belongs to TASK-091 under the approved SPEC-012 contract.

## Expected files / boundaries

- `tasks/active/TASK-090-production-move-ability-rule-content-spec.md`
- `docs/specs/SPEC-012-production-move-ability-rule-content.md`
- `docs/specs/SPEC-012-production-move-support-v1.json`
- `docs/project/PROJECT_ROADMAP.md`
- generated `docs/project/PROJECT_ROADMAP.html`

No production TypeScript, catalog artifact, migration or API implementation belongs to TASK-090.

## Current execution state

TASK-090 is DONE. Required GSC initially returned **ADVISORY CONCERN**; after materializing the
Move-selectability intersection, zero-Ability baseline, production-subset playability boundary,
per-Species quality gate and exact support profile, final GSC delta re-gate returned **ADVISORY
PASS** with no remaining product correction. Technical feasibility delta is **PASS** and final
independent QA delta is **READY 0/0/0/0**, both with no remaining correction. TASK-090 is therefore
semantically accepted by the Human Owner; SPEC-012 is APPROVED and the six first-release decisions
are frozen. TASK-091 has also completed its implementation and acceptance path. On 2026-09-23 the
Human Owner separately authorized repository/history completion; the accepted SPEC-012 + TASK-091
implementation snapshot was committed to canonical `main` at `658ca9e`.

## Completion

SPEC-012 is APPROVED after GSC **ADVISORY PASS**, technical feasibility **PASS**, independent QA
**READY 0/0/0/0**, and explicit Human Owner acceptance of all six first-release decisions. The Human
Owner separately authorized repository/history completion on 2026-09-23; the accepted snapshot is
versioned at `658ca9e`. TASK-090 is therefore closed as DONE.
