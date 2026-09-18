# TASK-021 — XP / Level / Progression Rules Spec

## Metadata

- State: READY
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor (progression concurrency/integrity spot-check)
- Auditor execution surface: fresh independent ChatGPT worker
- Spec: `docs/specs/SPEC-006-xp-level-progression-rules.md`
- Related specs: SPEC-001, SPEC-002, SPEC-003, SPEC-004, SPEC-005
- Related ADRs: ADR-002, ADR-004, ADR-005
- Branch: `spec/TASK-021-xp-level-progression-rules`
- Worktree: `.worktrees/TASK-021-xp-level-progression-rules`

## Objective

Define and obtain Human Owner acceptance for the v1 progression contract covering both bounded Pokémon XP/Level and the distinct uncapped Player Level domain before TASK-024/025 implement progression persistence/API mutation and before later Hunt/reward/features assign concrete XP amounts or Player-Level gates.

Preserve the accepted Pokémon Level Cap 200 and define its deterministic versioned curve, cumulative XP state, grant authority, concurrency/idempotency boundary, post-cap behavior and migration handoff. Separately define the uncapped Player Level curve/state/authority contract in TASK-021 while leaving concrete reward amounts, feature thresholds/effects, public API shape, item, evolution and reward-ledger semantics to their owning tasks.

## Context

TASK-020 is DONE. SPEC-003 fixes Level 200 as the global hard cap. SPEC-005 intentionally defers XP. SPEC-002 publishes factual `baseExperience` and `growthRate` but does not make source progression behavior executable.

TASK-021 is a Class A rules/balance specification. Its output is SPEC-006. No production TypeScript, SQL migration, repository, API, dependency or runtime change is authorized.

Because this specification defines concurrent durable XP application and future reward/idempotency composition, the roadmap's original QA-only review is corrected to `QA + IA progression concurrency/integrity spot-check` under approval-gates.md. TASK-023 still owns the detailed reward-ledger model.

## Accepted v1 direction

The Human Owner accepted the following SPEC-006 v1 direction in full on 2026-09-18:

1. keep Level Cap 200;
2. use one species-independent PokeNexus curve `xpFloor(L) = L^3 - 1`;
3. keep source growthRate/baseExperience factual until an owning accepted reward rule uses them;
4. persist cumulative non-negative `totalExperience`;
5. backfill existing Level L to exactly `xpFloor(L)`;
6. no normal negative XP, deleveling or XP spending;
7. one grant may cross multiple Levels atomically;
8. Level XP caps at 7,999,999 with no hidden overflow bank;
9. post-cap progression is separate from Level;
10. XP amount/target allocation belongs to owning reward/content specs;
11. Battle/client actions never directly grant durable XP;
12. no automatic evolution or learned-Move authority;
13. concurrent/retried grants must not lose or duplicate XP;
14. stale Pokémon OCC retries reload/recompute the same resolved grant rather than reusing stale derived state;
15. fully capped/zero-applied grants can complete source idempotency without synthetic Pokémon mutation;
16. progression atomicity is per target Pokémon grant; multi-target/sibling reward bundle semantics remain TASK-023-owned;
17. the progression curve identity is resolved through the grant's exact SPEC-002 `rulesVersion` with no latest/current fallback;
18. future Pokémon curve changes require a new identity, accepted resolving `rulesVersion` and explicit persisted-state conversion;
19. Player Level is a separate server-authoritative progression domain and is uncapped at the gameplay-rule level;
20. Player starts at Level 1 / 0 XP and uses its own cumulative curve `playerXpFloor(L) = 50 * L * (L - 1)`;
21. each Player next-Level step costs exactly `100 * currentLevel` XP, with no gameplay cap or overflow bank;
22. Player Level does not inherit Pokémon cap `200` or the Pokémon cubic curve;
23. Player XP is cumulative/monotonic, server-authoritative and protected by existing Player `rowVersion` OCC plus source-aware stale reload/recompute;
24. future features may consume Player Level only through their own accepted thresholds/semantics; Player level-up has no implicit reward/stat/unlock/combat effect;
25. cross-track Pokémon/Player XP plus sibling reward atomicity remains TASK-023/source-contract owned;
26. Player curve changes require a new progression identity, accepted resolving `rulesVersion` and explicit persisted-state conversion.

These rules are accepted and authoritative for SPEC-006 v1.

## Scope

- Level/XP numeric curve, cap, cumulative state and invariant.
- Existing-Level migration/backfill semantics.
- Server-authoritative resolved XP grant boundary.
- Multi-Level/capped/no-op application semantics.
- Pokémon aggregate OCC/concurrency requirements.
- Separate uncapped Player Level domain and Player aggregate OCC/version boundary.
- Player cumulative XP curve/start state and exact next-Level cost.
- Server-authoritative Player-XP grant/no-op/stale-retry/technical-overflow semantics.
- Exact/lossless Player Level/XP/grant representation across persistence/runtime/protocol boundaries.
- Ownership boundary for future Player-Level consumers/unlocks without defining their thresholds here.
- Progression-side handoff to TASK-023 reward idempotency and TASK-024 implementation.
- Exact `rulesVersion` → progression-artifact binding and no latest/read-time reinterpretation.
- Single-target atomicity boundary versus TASK-023-owned multi-target/sibling reward composition.
- Explicit post-cap/evolution/Move-acquisition deferrals.

## Out of scope

- production code or migrations;
- changing Level Cap 200;
- concrete Hunt/Battle/Gym/PvP XP amounts or share/split policies;
- XP boosts/multipliers/rested XP;
- reward-ledger schema/idempotency key format;
- inventory/item semantics;
- capture XP;
- evolution behavior/Species mutation;
- learned-Move inventory/unlocks;
- EVs/Natures/friendship/breeding;
- post-cap Mastery/Prestige;
- public API contracts;
- admin delevel/correction;
- trade/transfer progression;
- Combat Engine changes;
- dependencies/runtime config;
- Git history operations without separate Human Owner authorization.

## Acceptance criteria

- [x] SPEC-006 preserves Level 1..200 and hard cap 200.
- [x] Curve is exact integer math and fully defined through 200.
- [x] growthRate/baseExperience do not become executable by inference.
- [x] cumulative XP/Level invariant and deterministic backfill are explicit.
- [x] XP grant authority is server-side; allocation ownership remains separate.
- [x] Battle/client cannot directly mutate durable XP.
- [x] multi-Level/capped/no-op semantics are deterministic.
- [x] no hidden overflow, Level 201+, negative XP or normal deleveling.
- [x] concurrent grants cannot lose XP; durable retries cannot double-apply once composed with TASK-023.
- [x] stale OCC invalidates derived Level/XP results and retries only after fresh reload/recompute of the same resolved grant.
- [x] valid zero-applied/cap-discarded grants do not bump Pokémon rowVersion but remain source-completable under TASK-023 semantics.
- [x] TASK-021 does not define multi-Pokémon or sibling reward bundle atomicity.
- [x] combat snapshot semantics remain intact.
- [x] evolution and learned-Move acquisition are not introduced.
- [x] the exact grant `rulesVersion` resolves the progression artifact/configuration with no latest/current fallback.
- [x] curve/version changes cannot silently reinterpret persisted state and require an explicit accepted conversion.
- [x] Player Level is a distinct uncapped gameplay progression domain and never inherits Pokémon Level `200` or its curve.
- [x] Player starts at Level 1 / 0 XP; cumulative `50 * L * (L - 1)` and `100 * currentLevel` next-cost math are exact.
- [x] Player XP is server-authoritative, monotonic and OCC-safe with no technical-overflow clamping.
- [x] stale Player OCC commits neither progression nor source-completion evidence and retries only via TASK-023 source-aware reload/recompute.
- [x] Player Level/XP/grant values remain exact/lossless end to end; no unsafe numeric/protocol narrowing is permitted.
- [x] technical Player persistence bounds cannot silently become gameplay caps.
- [x] consuming features own explicit Player-Level thresholds/semantics.
- [x] Player level-up has no implicit reward/stat/unlock/combat effect.
- [x] cross-track Pokémon/Player XP reward composition remains TASK-023/source-contract owned.
- [x] TASK-025 cannot expose client-authoritative Player XP amount/source/target or Level setters and must preserve lossless progression encoding.
- [x] TASK-024 handoff is concrete without inventing new rules.
- [x] diff contains no production/dependency/runtime change.
- [x] independent QA has no unresolved P0/P1 finding.
- [x] Independent Auditor has no unresolved P0/P1 progression integrity finding.
- [x] Human Owner explicitly accepted SPEC-006 before READY.

## Validation

```text
corepack pnpm roadmap:generate
corepack pnpm roadmap:check
git diff --check
```

Verify only TASK-021, SPEC-006 and roadmap planning artifacts change; SPEC-003/005 boundaries stay intact; TASK-023/024/033/034/036 ownership is not stolen; accepted SPEC-006 product choices remain within the Human-approved decision inventory.

Final pre-implementation gate evidence:

- exact-snapshot QA: `P0/P1/P2/P3 = 0/0/0/0` — READY;
- exact-snapshot Independent Auditor: `P0/P1/P2/P3 = 0/0/0/0` — PASS;
- Human Owner explicitly accepted SPEC-006 in full on 2026-09-18;
- accepted snapshot before this metadata-only READY transition:
  - TASK-021 SHA-256: `48BC86834A5829196CCFCF6E9391AEAA3DFCCB88A548510B8799D203D207603D`;
  - SPEC-006 SHA-256: `FBE2D5620DDB2C0A291E9D046C29DBA6328E0DEAF4584162055CC247075F10A1`;
  - roadmap MD SHA-256: `DFF36D643D1DDBC8FCE2BF5984A56A77A98122F814B4EE89CDA46A97FFB31DCB`;
  - roadmap HTML SHA-256: `A67CDEF084B75E0BB639DA985A4A2C90859E7C0E1046B07E8FF8A38C99B00BDB`;
  - review manifest SHA-256: `46E4F34D0DBC083967F6196EE809FA7A92CACF68FA1533092674AE1FCA1C104C`.

## Dependencies

- TASK-019: DONE.
- TASK-020: DONE.
- SPEC-001/002/003/004/005: APPROVED.
- ADR-002/004/005: ACCEPTED.

## Risks / irreversible actions

- Level curves become long-lived progression/economy surfaces after players accumulate XP.
- Player Level is intended as a dependency for multiple future features; changing its accepted curve later will have broad migration/balance impact and therefore requires explicit versioned conversion.
- "Uncapped" is a gameplay contract, not permission to use unbounded machine arithmetic; implementation must select safe finite storage while preserving no gameplay maximum.
- JavaScript/transport numeric narrowing is an integrity risk for sufficiently high uncapped Player progression; authoritative representations must remain lossless or reject before source completion.
- Silent curve reinterpretation could mass-level/delevel existing Pokémon.
- Importing source growth formulas would confuse factual data with PokeNexus authority and is undefined above source-game Level 100.
- Hidden post-cap banking constrains future endgame design.
- Concurrent/retried grants can duplicate/lose XP unless TASK-023/024 compose correctly; IA review is required.
- Treating stale OCC as terminal would lose a valid unresolved grant; treating stale derived progression as retryable would apply stale intent. Retry must be source-aware reload/recompute.
- A cap no-op must not be confused with an unprocessed reward source merely because Pokémon rowVersion does not change.
- Multi-target reward atomicity must not be inferred by TASK-024 before TASK-023/source contracts define it.
- A progression grant must never drift to a latest/current curve outside its pinned `rulesVersion`.
- Automatic evolution would cascade Species/Ability/Move semantics and is not adopted here.
- Repository history remains separately Human Owner gated.

## Expected files

```text
tasks/active/TASK-021-xp-level-progression-rules.md
docs/specs/SPEC-006-xp-level-progression-rules.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

## Completion

TASK-021 is READY. SPEC-006 is APPROVED after independent QA and IA cleared the exact pre-acceptance snapshot and the Human Owner explicitly accepted the specification in full on 2026-09-18.

This READY transition is metadata-only. Repository history remains separately Human Owner gated; no commit, push, merge, rebase or other history operation is authorized by SPEC acceptance alone.
