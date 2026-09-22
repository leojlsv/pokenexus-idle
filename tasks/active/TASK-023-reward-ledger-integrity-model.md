# TASK-023 — Reward Ledger & Integrity Model

## Metadata

- State: ACCEPTANCE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor (reward integrity/concurrency)
- Auditor execution surface: fresh independent ChatGPT worker
- Consultants: N/A
- Consultant execution surface(s): N/A
- Spec: `docs/specs/SPEC-009-reward-ledger-integrity.md`
- Related specs: SPEC-002, SPEC-004, SPEC-005, SPEC-006, SPEC-007
- Related ADRs: ADR-005
- Branch: `spec/TASK-023-reward-ledger-integrity`
- Worktree: `.worktrees/TASK-023-reward-ledger-integrity`

## Objective

Define and obtain Human Owner acceptance for the authoritative v1 reward-ledger and idempotency
contract before TASK-024 implements durable XP, Inventory and reward mutations.

The contract must guarantee that one logical server-authoritative reward source cannot be lost,
duplicated, partially committed or silently re-resolved differently across retries while preserving
the accepted progression, Inventory, static-data and persistence boundaries.

## Context

Accepted upstream contracts deliberately leave reward composition to TASK-023:

- SPEC-004 reserves reward/idempotency ledger schema and requires explicit source/correlation,
  immutable evidence, version pinning and database uniqueness support.
- SPEC-006 defines Pokémon-XP and Player-XP application but delegates durable source completion,
  cross-track composition and sibling reward atomicity to TASK-023.
- SPEC-007 defines Inventory grants/use and requires TASK-023/source correlation so retries cannot
  duplicate grants or debits after response uncertainty.
- TASK-024 is blocked on this contract for concrete migrations/repositories/orchestration.

This task is intentionally an integrity/authority specification. It does not define reward amounts,
drop rates, cadence, scarcity, currencies, monetization or content balance. Therefore no GSC/PXE
consultation trigger is activated by the current scope. If the draft expands into those domains,
the applicable consultant gate must be added before Human acceptance.

Because the contract defines durable duplicate prevention, concurrency and cross-aggregate atomicity,
an Independent Auditor review is required before implementation readiness.

## Scope

- Define the stable identity of one logical reward source and its authoritative correlation rules.
- Define the resolved reward envelope and the baseline effect kinds that may participate in v1:
  Pokémon XP, Player XP and Item grants already authorized by approved upstream specs.
- Decide sibling-effect atomicity and the boundary for splitting genuinely independent rewards.
- Define immutable reward-resolution evidence that freezes one envelope before application, plus
  durable completion evidence and replay behavior under response loss, retries and concurrent
  duplicate delivery.
- Define conflict behavior when the same source identity is presented with different resolved reward
  semantics/context.
- Define exact `{ gameDataVersion, rulesVersion }` pinning requirements and fail-closed behavior.
- Define stale aggregate/OCC retry semantics without reusing stale derived progression state.
- Define zero-applied/no-op reward completion semantics.
- Define append-only audit/history requirements, privacy boundaries and infrastructure timestamps.
- Define transaction-failure rollback versus post-commit correction/compensation boundaries.
- Define the logical persistence constraints TASK-024 must implement without prescribing provider-
  specific locking/query strategy.
- Define downstream handoffs to TASK-024/025/033/034/036 without stealing their content/API rules.

## Out of scope

- reward amounts, XP allocation/share formulas, drop tables, drop chances or reward cadence;
- Hunt/Gym/PvP/World Boss reward content;
- currencies, prices, sinks, fees, trading or player-to-player economy;
- monetization, paid boosts, battle passes, premium rewards or scarcity design;
- capture probability/outcome or Pokémon grant construction owned by TASK-036;
- Item use/capture consumption rules already owned by SPEC-007;
- Move acquisition/eligibility owned by TASK-088;
- concrete SQL migration/repository/API implementation owned by TASK-024/025;
- administrative delevel/negative-XP or destructive correction semantics not accepted upstream;
- public API payload design;
- Git history operations without separate Human Owner authorization.

## Acceptance criteria

- [x] SPEC-009 defines one unambiguous durable identity for a logical reward source.
- [x] Client-controlled request data alone cannot mint authoritative reward identity or value.
- [x] One source resolves to one immutable reward envelope; replay with different envelope/context
      fails closed rather than mutating again.
- [x] The first accepted resolution is durably frozen before reward application so an uncompleted
      retry cannot silently re-resolve from newer mutable state/rules/content.
- [x] One v1 envelope is all-or-nothing across its sibling Pokémon-XP, Player-XP and Item effects.
- [x] Independent rewards use distinct source identities/envelopes instead of partial completion of
      one envelope.
- [x] Durable completion evidence and all required mutable effects commit in one transaction; an
      earlier immutable resolution record is not itself proof that effects completed.
- [x] Concurrent duplicate delivery can produce at most one committed completion/effect set.
- [x] Response loss after commit replays the prior completion without duplicate mutation.
- [x] Stale OCC commits neither partial effects nor completion evidence and only retries the same
      resolved envelope after reload/revalidation/recomputation of target/application state where
      required; source entitlement/value is not re-resolved after durable resolution.
- [x] Valid zero-applied/no-op effects can complete source evidence without synthetic aggregate
      rowVersion changes.
- [x] Required game-data/rules context is pinned exactly; no latest/current fallback is permitted.
- [x] Ledger evidence is immutable/append-only and contains no secrets/session credentials.
- [x] Transaction rollback and post-commit correction semantics are explicit and do not erase
      historical completion evidence.
- [x] TASK-024 receives concrete persistence/uniqueness/transaction invariants without premature SQL.
- [x] Reward amount/cadence/scarcity/economy semantics remain outside this spec.
- [x] Independent QA has no unresolved P0/P1 finding.
- [x] Independent Auditor has no unresolved P0/P1 reward-integrity/concurrency finding.
- [x] Human Owner explicitly accepts SPEC-009 before TASK-023 can reach READY/DONE.

## Validation / tests

- [x] Cross-spec consistency review against SPEC-004/006/007 and ADR-005.
- [x] Independent QA Definition-of-Ready/spec review.
- [x] Independent Auditor concurrency/idempotency/rollback review.
- [x] `corepack pnpm roadmap:generate`.
- [x] `corepack pnpm roadmap:check`.
- [x] `git diff --check`.

## Pre-acceptance gate evidence

- Independent QA on the current semantic draft: **READY**, P0/P1/P2/P3 `0/0/0/0`.
- Independent reward-integrity/concurrency audit on the current semantic draft: **PASS**,
  P0/P1/P2/P3 `0/0/0/0`.
- QA confirmed Definition-of-Ready fields and ownership boundaries are structurally complete; the
  task correctly remains DRAFT because Class A Human acceptance has not occurred.
- IA confirmed the two-stage immutable Reward Resolution → atomic application/Reward Completion
  model is PostgreSQL-implementable under ADR-005 with no identified hidden partial-commit/race
  window.
- GSC/PXE remain N/A because the draft deliberately defines no reward amount, cadence, scarcity,
  currency, monetization or gameplay-loop semantics. Any later scope expansion into those domains
  reactivates the applicable consultant gate before Human acceptance.

## Human Owner decision

- On 2026-09-22 the Human Owner accepted the complete SPEC-009 reward authority/integrity baseline.
- The accepted pre-transition SPEC-009 snapshot SHA-256 was
  `489A48166B84FFE7D0901C0C592726BBA3BD163CDC820FE4E82B3D2FECEF8B35`.
- This acceptance covers the reviewed semantics: subject-scoped `RewardSourceKey`, immutable Reward
  Resolution before application, canonical all-or-nothing sibling effects plus Reward Completion,
  replay/conflict/OCC/version/privacy/correction invariants, and no reward amount/cadence/economy
  semantics.
- QA and two independent integrity audits were already clear at P0/P1/P2/P3 `0/0/0/0`; therefore
  the accepted task has completed its Class A semantic/review gates without changing SPEC-009
  semantics.

## Acceptance state

- TASK-023 is in ACCEPTANCE after Human Owner approval and clean QA/IA gates.
- No production implementation belongs to this specification task; TASK-024 owns implementation.
- Remaining closure work is repository-history integration and then moving this task record from
  `tasks/active/` to `tasks/done/` with final roadmap completion metadata.
- Commit, push and merge remain separately governed Git-history actions and are not authorized by a
  generic continuation instruction.

## Dependencies

- TASK-013 — PostgreSQL Schema v1: DONE.
- TASK-021 — XP / Level / Progression Rules Spec: DONE.
- TASK-022 — Inventory / Item Model Spec: DONE.
- TASK-087 — Static Game Data Catalog & Ingestion Implementation: DONE.
- SPEC-004, SPEC-006 and SPEC-007: APPROVED.
- ADR-005: ACCEPTED.

## Risks / irreversible actions

- Weak idempotency can duplicate XP/items after retries or concurrent delivery.
- Treating OCC as idempotency can still duplicate a completed logical reward after response loss.
- Partial sibling commits can permanently diverge Player/Pokémon XP and Inventory state.
- Re-resolving an unresolved prior source under newer mutable rules/data can make a retry produce a
  different reward unless the first accepted resolution is durably frozen.
- An overly broad metadata/audit payload can retain secrets or personal data unnecessarily.
- Post-commit deletion/rewrite of ledger rows would destroy forensic/replay evidence.
- No irreversible runtime/database action is authorized by this specification task.

## Expected files / boundaries

- `tasks/active/TASK-023-reward-ledger-integrity-model.md`
- `docs/specs/SPEC-009-reward-ledger-integrity.md`
- `docs/project/PROJECT_ROADMAP.md`
- generated `docs/project/PROJECT_ROADMAP.html`

No production TypeScript, SQL migration, dependency, lockfile or runtime binding is in scope.

## Completion

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
