# TASK-036 — Capture & Reward Resolution

## Metadata

- State: ACCEPTANCE
- Class: B
- Owner: Lead Developer
- Owner execution surface: current ChatGPT implementation session
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor (reward integrity spot-check)
- Auditor execution surface: fresh independent ChatGPT worker
- Consultants: Gameplay Systems Consultant (GSC); Player Experience / Economy Consultant (PXE)
- Consultant execution surface(s): fresh independent ChatGPT advisory assignments
- Human gate: complete — `sourceAbilitySlot = normal-1` approved by the Human Owner on 2026-09-26
- Specs:
  - `docs/specs/SPEC-005-pokemon-instance-collection-team.md`
  - `docs/specs/SPEC-006-xp-level-progression-rules.md`
  - `docs/specs/SPEC-007-inventory-item-model.md`
  - `docs/specs/SPEC-009-reward-ledger-integrity.md`
  - `docs/specs/SPEC-010-move-acquisition-eligibility-rules.md`
  - `docs/specs/SPEC-012-production-move-ability-rule-content.md`
  - `docs/specs/SPEC-013-pve-world-map-zone-solo-hunt-rules-lifecycle.md`
  - `docs/specs/SPEC-014-idle-gacha-genetic-quality-acquisition-model.md`
- Related ADR: `docs/decisions/ADR-005-persistence-data-access-strategy.md`
- Related tasks: TASK-023, TASK-024, TASK-033, TASK-034, TASK-035, TASK-089, TASK-090, TASK-091,
  TASK-095, TASK-096, TASK-097, TASK-037, TASK-038
- Branch: `feat/TASK-036-capture-reward-resolution`
- Worktree: `.worktrees/TASK-036-capture-reward-resolution`

## Objective

Implement deterministic Solo Hunt encounter-reward resolution and one post-encounter capture attempt as
server-authoritative, replay-safe consequences of immutable TASK-035 completion evidence. The resolver
must be trigger-agnostic: after SPEC-014/SPEC-013 reconciliation, the attempt may be invoked by an explicit
player action or by a standing player-authorized auto-capture policy.

The implementation must compose existing SPEC-006/007/009/010 authorities rather than invent parallel
progression, Inventory, Move-bootstrap or reward-ledger semantics. Capture outcome, one-Ball debit and
successful Pokémon creation must be atomic and idempotent under one durable attempt correlation.

TASK-036 is READY. APPROVED SPEC-013 assigns capture probability/outcome and
captured-Pokémon construction to this task. SPEC-014/TASK-096 now define the Human-approved acquisition
model, while TASK-097 is the required upstream Class-B producer of the frozen Encounter individual.
TASK-096/SPEC-014 now has final consolidated Class-A acceptance. The Human Owner resolved TASK-036's final
product gate on 2026-09-26 by selecting deterministic `sourceAbilitySlot = normal-1` for newly captured
Pokémon. TASK-097 has materialized and passed acceptance for the snapshot+persistence boundary consumed
here; its repository/history completion remains separately gated.

## Accepted inherited authority

- TASK-035 emits immutable successful-Encounter evidence only for player-side sole victory, including
  `EncounterId`, Hunt identity/ordinal, exact selected Species/form + Level, actual participant IDs,
  exact content/rules identities and one stable `rewardSourceIdentity`.
- Opponent victory/draw/incomplete Encounter produces no completion reward or pending capture decision.
- SPEC-013 reward cadence is one reward source per successfully completed Encounter and its Pokémon-XP
  pool is split only among distinct actual participants whose pinned Hunt Level is below 200.
- SPEC-009 already owns durable Reward Resolution / Reward Completion idempotency and all-or-nothing
  Pokémon-XP + Player-XP + Item-grant application; TASK-024 implements that persistence/application.
- SPEC-007 requires an accepted capture attempt to consume exactly one configured capture item whether
  the attempt succeeds or fails; rejected/stale/ineligible attempts consume nothing.
- SPEC-013 currently permits at most one accepted capture attempt per `EncounterId` and capture never
  creates a second encounter-completion reward source. SPEC-014 now requires a forward amendment so that
  the same one-attempt invariant can also be triggered by standing auto-capture authorization.
- SPEC-005 permits `selectedAbilityId = null`; the acquisition source must explicitly own any non-null
  initial Ability assignment and may not infer source-slot weighting.
- SPEC-010/TASK-089 owns deterministic level-up Move bootstrap and production-selectability admission.
- Currency does not exist as an accepted baseline reward effect and is not introduced here.

## Pre-READY decisions and reconciliations

H1/H2/H3 and the Genetics/Ball portions below are inherited Human-approved SPEC-014 authority.
TASK-036 must not reopen them. H4 was resolved by the Human Owner on 2026-09-26; H5 is inherited
SPEC-010/SPEC-012 authority; H6 is an implementation boundary; H7 is a downstream release dependency.

### H1 — Capture probability

**Human correction:** the earlier direct linear `catchRate / 255` mapping is rejected. In particular,
`catchRate=255` must not accidentally mean ordinary baseline capture is guaranteed.

The replacement must be a custom, versioned PokeNexus curve over the canonical Species/form `catchRate`,
calibrated together with encounter cadence, Ball availability, Genetics, IV/Profile and Shiny pressure
under TASK-096/SPEC-014. Required properties already accepted at the design level:

- monotonic behavior in canonical `catchRate`;
- `catchRate=255` is high/easy but remains below 100% under the ordinary baseline;
- low-rate Species must not become practically unreachable by accidental stacked RNG;
- Ball effects compose as a separate modifier layer;
- Genetics applies a separate Human-approved capture modifier after the base catch-rate curve and before
  Ball behavior; it does not mutate canonical `catchRate` or Encounter weight;
- no Epic+/Apex/capture pity or hard-protection system exists in the Idle MVP;
- final basis-point rounding/draw semantics remain deterministic and server-owned.

Human-approved numeric capture package from SPEC-014:

```text
catchRate anchors:
3→8%, 25→15%, 45→25%, 75→35%, 120→50%, 190→68%, 255→82%

Genetic capture modifier:
Normal 1.00
Uncommon 0.98
Rare 0.95
Epic 0.90
Apex 0.80
```

After all accepted deterministic modifiers resolve to `finalChanceBp`, capture draws one unbiased
`U[0,9999]` and succeeds iff `roll < finalChanceBp`.

### H2 — Capture-item roster and Ball effects

Human-approved semantic ladder:

```text
Poké   1.00
Great  1.25
Super  1.50
Ultra  2.00
VIP    2.25
```

TASK-036 consumes only explicitly authored capture ItemId → Ball-power mappings under the accepted
capture-rules artifact. Exact standard Ball ItemIds/publication remain downstream content work; the
resolver may not infer capture authorization or power from display names.

The seven currently published Apricorn Ball ItemIds remain valid Inventory content but are **not**
capture-authorized merely by name until exact effects/modifiers are separately authored and accepted.
This avoids telling the player that Fast/Friend/Heavy/Level/Love/Lure/Moon Ball are all secretly identical
and avoids inferring source-game behavior from Item names.

The accepted failure-exponent semantics must be materialized as an exact deterministic fixed-point/
basis-point artifact before runtime use. Binary floating-point `pow` is never gameplay authority.

### H3 — Captured Pokémon IVs

The earlier recommendation to roll six independent uniform `[0,31]` IVs **after capture success is not
accepted**.

The Human Owner accepted SPEC-014's individual model: canonical IVs remain separate `0..31` values, while
Genetic Score/Grade/Profile/Bonus and Shiny are separate properties of the encountered individual.
Each IV is generated by TASK-097 as `U[0,15] + U[0,16]`, independently per stat, and the full
IV/Genetics/Profile/Shiny snapshot is frozen before Battle. TASK-036 consumes those exact frozen values;
it never draws IVs or other individual fields after capture success.

### H4 — Initial selected Ability

**Human-approved:** assign deterministically the Species/form's canonical `sourceAbilitySlot = normal-1`
Ability on successful capture, resolved and validated under the server-selected then-authoritative
**creation/static-data context** used for the new owned-Pokémon construction (normally the same current
`gameDataVersion` selected for H5 Move bootstrap), not from the historical Encounter snapshot.

Rationale: canonical v3 audit has an explicit `normal-1` Ability for all current 293 Species/forms.
Choosing that exact slot needs no random weighting or inferred source order, does not change current
Solo-Hunt combat power because production Abilities remain inactive-by-policy, and avoids creating
durably ability-less captures when Ability mechanics arrive later.

`selectedAbilityId = null` remains legal under SPEC-005 generally, but is not the TASK-036 capture
construction rule.

### H5 — Initial Move Loadout

**Recommended:** keep two contexts explicit. Capture target identity and `catchRate` are resolved from
the pending Encounter's exact **historical** game-data/content context. Initial Move construction is a
new owned-Pokémon operation: server-select the currently allowed SPEC-010 new-operation
`{gameDataVersion,rulesVersion}` pair, derive level-up eligibility there, intersect it with the exact
SPEC-012/TASK-091/095 executable production Move support, then use the accepted SPEC-010 ordering
(`unlockLevel DESC`, canonical MoveId byte order ASC) to choose `1..4` Moves. Freeze that construction
pair + exact loadout into the capture attempt intent before acceptance. Same-correlation retry never
reselects it. If Species/bootstrap cannot resolve under the selected new-use pair, reject before any Ball
debit/RNG outcome is committed.

### H6 — RNG separation

**Required implementation boundary:** reward-drop RNG and capture RNG are distinct deterministic streams,
and neither reuses
Combat RNG nor TASK-035 encounter-selection RNG. Each resolver accepts an explicit pinned RNG origin and
returns the exact continuation required for durable replay/checkpoint composition.

The upstream Hunt/checkpoint/API owner supplies the server-owned origin; clients never choose RNG state.
TASK-036 freezes the exact origin/continuation in its durable resolution evidence so a retry with the same
logical source/attempt cannot substitute a different origin. TASK-037/038 later own persistence/transport
composition of those streams outside the resolver boundary.

### H7 — Ball acquisition / release boundary

**Resolved release boundary:** keep TASK-036 resolver-only with respect to Ball acquisition. Do **not** invent a
starting grant, shop, currency, drop or paid source in this task. Record as an explicit downstream MVP
release dependency that at least one accepted **non-paid** capture-item source must exist before capture
is exposed as a usable player feature.

Current Verdant Edge encounter content has `itemDrops=[]`, and no other accepted Ball faucet was found.
SPEC-014/TASK-096 already define the accepted Ball-supply hierarchy and standing auto-capture boundary.
Exact non-paid faucet quantities/sources remain downstream measured content/economy tuning and must be
calibrated against auto-capture burn rather than treated as a one-Ball-per-Encounter refund. This does not
block TASK-036 READY; the end-to-end player-visible feature remains release-blocked until at least one
accepted non-paid Ball source is published.

## Scope after Human validation

### 1. Pure deterministic Encounter reward resolver

- Consume one replay-validated reward source context containing authoritative `subjectPlayerId`, one
  immutable `SoloHuntCompletedEncounterEvidence`, and the exact pinned Hunt Team snapshot needed for
  allocation (`PokemonInstanceId`, pinned Level, pinned Team order). Never read a participant's
  **current** database Level/Team to decide eligibility or remainder order: SPEC-013 explicitly uses the
  pinned Hunt Level and Team order. Evidence participant IDs must resolve as distinct members of that
  snapshot or reward resolution fails closed.
- Application/static-authority composition must load the exact TASK-034 Encounter definition under the
  evidence's pinned content/game-data identity and compare its canonical reward input to the carried
  `rewardEnvelope`; shape-valid but value-rewritten checkpoint reward data fails closed. The pure
  game-core resolver receives the already-authorized exact reward input and does not import game-data.
- Use one fixed source authority, recommended
  `pokenexus.solo-hunt.encounter-completion.v1`, with TASK-035 `rewardSourceIdentity` as stable source
  correlation under the authoritative subject Player.
- Pin the Reward Resolution to the exact `rulesVersion` + `gameDataVersion` carried by the completed
  Encounter evidence. TASK-036 may add the runtime descriptor/wiring needed for the existing SPEC-006
  progression rules to resolve under those exact retained/new production rules releases, but it must not
  substitute a current/latest rules pair. The versioned `sourceAuthority` identifies TASK-036's v1
  encounter-reward resolution policy (including item-drop RNG semantics) separately from progression
  and static-data identities.
- Split `pokemonXpPool` among actual eligible participants exactly per SPEC-013: integer division, then
  one-XP remainder distribution in pinned Team order; participants pinned at Level 200 receive no share.
- Emit configured Player XP as the subject-bound sibling effect when non-null, including valid zero-XP
  effects only where SPEC-009/SPEC-006 permit them.
- Resolve every configured item-drop row exactly once in the exact validated canonical persisted array
  order using a dedicated deterministic reward RNG stream. For **every row**, including `10000 bp`, draw
  one unbiased uniform integer in `[0,9999]`; the row succeeds iff `roll < chanceBasisPoints`. No currency
  effect exists. Multiple successful rows for one ItemId are normalized only **after** all independent
  rolls into one exact summed Item grant; summed quantity outside SPEC-007/Inventory bounds fails closed
  rather than truncating/splitting silently.
- A legitimate Encounter reward may resolve to **zero effects** (for example: no eligible Pokémon XP,
  `playerXp=null`, and every probabilistic item drop misses). That outcome still needs one immutable
  source-level Reward Resolution/Completion so retry cannot reroll drops. SPEC-009 defines the envelope
  as an immutable effect set and completion as source-level proof; its approved semantics do not require
  a non-empty set. TASK-036 may therefore remove TASK-024's implementation-only `effects.length === 0`
  rejection and add explicit empty-envelope replay/completion tests, without inventing a synthetic
  zero-XP or zero-Item effect.
- Return one canonical `RewardResolutionEnvelope` suitable for the existing TASK-024
  `RewardApplicationService`; do not duplicate Reward Ledger persistence/application logic.
- Replays from the same immutable evidence + RNG origin must reproduce byte/field-identical envelope and
  RNG continuation.
- RNG origin is server-owned, never client-selected. TASK-036 owns the deterministic transformation and
  returns exact before/after state; TASK-037 is the future owner of durable Hunt/checkpoint reward-stream
  continuation. Until that orchestration exists, no public path may treat a returned continuation as
  committed merely because it was computed. Reward Resolution, once durably claimed, freezes the effects
  and prevents retry from rerolling entitlement.

### 2. Pure deterministic capture resolver

- Consume the exact TASK-035 pending capture decision, selected authorized capture ItemId, immutable
  Species fact containing `catchRate`, the Human-approved **capture-rules version** and explicit capture
  RNG origin. Capture-rules identity is distinct from the pinned Combat/Move `rulesVersion`; both are
  retained in durable evidence rather than overloading one version string with two authorities.
- Require the pending-capture/completion handoff to carry the exact originating
  `pendingSelectionIdentity`, immutable internal `individualizationSnapshotIdentity`/commitment,
  `individualizationRulesVersion` and internal provenance reference frozen by TASK-097/SPEC-013 before
  or atomically with successful-completion token consumption.
- Reject malformed/mismatched Species/form/Level/content/rules context before accepting an attempt.
- Apply the Human-approved probability rule and return exact RNG before/after evidence.
- Consume the accepted immutable Encounter-individual snapshot for canonical IVs, Genetics/Profile and
  Shiny. Its identity/commitment/provenance must exactly match the pending-capture linkage; a different
  snapshot is rejected even if Species/form/Level match. These fields are never generated or rerolled
  after capture success by TASK-036.
- On successful outcome, preserve that frozen individual identity while resolving only the construction
  data that remains legitimately owned by TASK-036 (for example the accepted owned-Pokémon Ability/Move
  bootstrap rules).
- If H4 `normal-1` is accepted, resolve that exact factual source Ability slot from the pinned Species
  definition in the explicitly server-selected then-authoritative creation/static-data context and fail
  before attempt acceptance if it is absent, ambiguous or no longer eligible; never fall back to the
  historical Encounter Ability set, array order or another slot. Freeze the selected Ability identity and
  creation context in the attempt intent so retry never reselects it.
- Never generate a second encounter-completion reward source.
- Freeze an exact capture-rule artifact identity after the replacement H1 is Human-approved. The obsolete
  draft identity `pokenexus.capture.post-defeat-catch-rate-linear.v1` is rejected and must not be used.
  Capture-rule identity remains distinct from the Encounter Combat/Move `rulesVersion` and is persisted
  with every accepted attempt.

### 3. Durable capture attempt authority

- Introduce the smallest append-only capture-attempt/outcome persistence required to bind one stable
  attempt correlation to:
  - subject Player;
  - exact EncounterId/pending-capture context;
  - exact selected capture ItemId;
  - exact capture rules identity/version;
  - exact game-data/rules/content identities required by the decision;
  - exact originating pending-selection identity and TASK-097 individualization snapshot
    identity/commitment + individualization rules/provenance reference;
  - frozen chance, RNG origin/continuation and accepted success/failure outcome;
  - successful Pokémon construction fields and generated `PokemonInstanceId` when applicable.
- Enforce at most one accepted attempt per **`EncounterId` itself** at the database boundary, matching
  APPROVED SPEC-013. `subjectPlayerId` remains immutable eligibility/evidence binding but does not weaken
  the global Encounter attempt uniqueness contract.
- Enforce uniqueness on both `(subjectPlayerId, attemptCorrelation)` and global `EncounterId`. Same
  correlation + exact frozen intent replays the prior accepted outcome; same correlation + any changed
  intent conflicts; a different correlation after that Encounter already owns an accepted attempt fails
  closed with no debit/grant.
- TASK-038's future command correlation must map **1:1/deterministically** to this same frozen capture
  attempt identity. Retry of one logical command cannot mint another TASK-036 attempt identity. Capture
  persistence/application must expose transaction-scoped composition so TASK-038 can later consume/close
  its pending-capture aggregate in the same outer transaction as the accepted attempt consequence.
- A rejected/stale/ineligible command creates no accepted-attempt evidence and consumes no Ball or
  attempt opportunity.

### 4. Atomic capture consequence

- Preflight every authority needed for a possible successful grant before accepting the attempt:
  Species/form, exact Move bootstrap, Inventory ItemId authorization and construction rules.
- In one database transaction for an accepted attempt:
  1. lock/revalidate the subject Inventory and exact one-unit Ball availability;
  2. claim/freeze the attempt outcome once;
  3. debit exactly one selected Ball on both success and failure;
  4. on success insert exactly one owned Pokémon with authoritative owner, server-generated UUIDv7
     `PokemonInstanceId`, exact encountered Species/form + Level, the accepted frozen canonical IVs and
     the SPEC-005-forward/SPEC-014 Genetics/Shiny/Ascendant persistence fields, approved `selectedAbilityId`,
     `totalExperience = xpFloor(Level)`, exact pre-resolved ordered Move Loadout, initial
     `rowVersion = 0`, infrastructure timestamps, and immutable individualization lineage sufficient to
     prove it is the same TASK-097 snapshot bound by the completed Encounter;
  5. on success increment the Human-approved permanent Species Research count for the exact captured
     Species/form identity by exactly one in the same transaction; this count has no power/economy/RNG
     effect in MVP;
  6. commit immutable attempt/outcome evidence.
- Any stale OCC, uniqueness race, missing quantity or grant failure rolls the whole transaction back.
- Response-loss replay after commit performs no second debit and creates no second Pokémon.
- UUIDv7/timestamps are infrastructure identities, not gameplay RNG outputs. A committed replay returns
  the stored Pokémon identity/timestamps; initial loadout is inserted as part of aggregate creation rather
  than by a second post-create mutation that would add an artificial rowVersion bump.

### 5. Internal event/result output

- Return stable internal domain/application results for reward resolved/applied and capture
  accepted-success/accepted-failure/replayed/rejected outcomes.
- TASK-036 does not define public HTTP payloads or Hunt command persistence; TASK-038 owns those
  transports/command correlations and composes this authority later.

## Out of scope

- public Hunt/capture HTTP endpoints or active-Hunt persistence — TASK-038;
- offline/checkpoint codec/horizon and claim orchestration — TASK-037;
- currencies, shops, prices, sinks, entry fees, stamina or monetization;
- new reward amounts/drop rates/content beyond immutable TASK-034 input;
- auto-capture settings/API/offline orchestration or Ball-priority selection logic — TASK-038 after the
  SPEC-013 amendment; this task's capture resolver remains trigger-agnostic and may consume a Ball already
  frozen into either manual or auto-capture attempt intent;
- more than one accepted attempt per EncounterId;
- HP/status-based capture modifiers in the post-Encounter Option-B baseline;
- source-game-specific Apricorn Ball modifiers unless separately accepted before READY;
- ability-slot weighting or automatic Ability assignment other than the Human-approved deterministic
  `sourceAbilitySlot = normal-1` rule;
- defining Genetics/Shiny/IV generation, Genetic Profile selection, Grade rates or Shiny rates — TASK-096
  / SPEC-014; TASK-036 only preserves the accepted frozen individual fields under the Human-approved
  SPEC-005 forward persistence authority;
- defining Species Research rewards/thresholds/UX beyond the accepted monotonic capture count; TASK-036
  only applies the atomic `+1` on successful capture;
- Nature, gender, held items, ribbons/marks, friendship overrides or other new captured-Pokémon persisted
  fields not accepted by the applicable product/spec authority;
- evolution/revival/machine/TM semantics;
- rewriting TASK-035 reward/capture evidence or Combat Engine semantics;
- expanding SPEC-009 Reward Envelope with negative Item effects or Pokémon creation. Capture uses its
  own atomic attempt authority because one-Ball debit + Pokémon creation are not baseline Reward Ledger
  effect kinds;
- Git history mutation without separate Human Owner authorization.

## Acceptance criteria

- [x] Human Owner rejects the old linear H1 and accepts the SPEC-014 Genetics + Shiny Model A conceptual
      slice.
- [x] TASK-096/SPEC-014 closes the remaining acquisition/individualization decisions required by
      TASK-036 before READY.
- [x] Human Owner validates the remaining TASK-036 capture/reward choices after TASK-096 reconciliation;
      H4 deterministic `sourceAbilitySlot = normal-1` was approved on 2026-09-26.
- [x] GSC/PXE advisory findings on the proposed capture/reward rules are recorded and reconciled before
      Human validation.
- [x] Reward resolution accepts only authentic TASK-035 successful-Encounter evidence and exact
      TASK-034 reward input shape/context.
- [x] Reward Resolution pins the exact completed-Encounter `rulesVersion` + `gameDataVersion`; runtime
      resolution of progression/static authority is exact and retained-history-safe with no latest/current
      fallback.
- [x] Pokémon-XP eligibility/remainder order comes only from the exact pinned Hunt Team Level/order
      snapshot; current persisted Level cannot reinterpret a completed Encounter.
- [x] Pokémon XP allocation exactly preserves the configured pool across eligible actual participants,
      with deterministic remainder order and Level-200 exclusion.
- [x] Player XP and deterministic item-drop effects normalize into one SPEC-009-compatible immutable
      envelope; no currency/economy effect is invented.
- [x] A legitimately empty resolved effect set is durably frozen/completed as an empty Reward Envelope;
      retries cannot reroll probabilistic drops and no synthetic aggregate mutation/effect is invented.
- [x] Reward resolver uses a dedicated explicit RNG stream and replay reproduces the exact same envelope
      and continuation.
- [x] Item-drop RNG semantics are exact: canonical persisted row order, one unbiased `[0,9999]` draw per
      row including guaranteed rows, strict `< chanceBasisPoints`, then post-roll ItemId aggregation.
- [x] Capture rejects stale/ineligible/mismatched context before Ball consumption and attempt acceptance.
- [x] One accepted attempt uses exactly one Ball on success or failure and at most one accepted attempt
      exists per EncounterId.
- [x] Capture outcome and successful Pokémon construction are deterministic from exact pinned input/RNG
      and the Human-approved rules.
- [x] Durable capture evidence pins a dedicated capture-rules identity separately from the Encounter's
      Combat/Move rulesVersion; neither authority can be substituted by the other.
- [x] Successful Pokémon creation uses the encountered Species/form + Level, exact frozen individual
      IV/Genetics/Profile/Shiny snapshot, exact Level XP floor, Human-approved Ability rules and exact
      SPEC-010 production-selectable bootstrap Move Loadout.
- [x] Species Research is transactionally exact: accepted successful capture increments the exact
      Species/form count by one; accepted failure, rejected/stale attempt or rolled-back transaction
      increments zero; committed replay cannot increment a second time.
- [x] Ball debit + successful Pokémon insert + attempt completion commit atomically; failure/retry cannot
      duplicate debit or grant.
- [x] Same-correlation replay returns the prior outcome; conflicting replay fails closed.
- [x] Capture persistence enforces `(subjectPlayerId, attemptCorrelation)` uniqueness plus global
      `EncounterId` accepted-attempt uniqueness; downstream TASK-038 cannot map one command retry to a
      fresh attempt identity.
- [x] No game-core → database/game-data dependency or parallel progression/reward/Move-bootstrap logic is
      introduced.
- [x] Relevant unit/integration/PostgreSQL/Worker/workspace checks pass.
- [x] Independent QA reports READY with no unresolved P0/P1.
- [x] Independent reward-integrity audit reports PASS with no unresolved P0/P1.
- [x] Independent Class-B functional/architecture acceptance passes before ACCEPTANCE.

## Validation / tests

At minimum after implementation:

    corepack pnpm --filter @pokenexus/game-core test
    corepack pnpm --filter @pokenexus/game-core typecheck
    corepack pnpm --filter @pokenexus/game-core build
    corepack pnpm --filter @pokenexus/database test
    corepack pnpm --filter @pokenexus/api test
    corepack pnpm --filter @pokenexus/api test:worker-compat
    corepack pnpm lint
    corepack pnpm typecheck
    corepack pnpm test
    corepack pnpm build
    corepack pnpm roadmap:check
    git diff --check

Add focused adversarial coverage for:

- invalid/forged Encounter evidence and reward-envelope shape;
- participant ordering/duplication/Level-200 allocation boundaries;
- item-drop chance edges, deterministic replay and same-Item aggregation;
- empty Reward Envelope claim/application/replay after all probabilistic effects miss;
- capture chance edges (`0`/near-zero/100% as permitted by accepted formula) and RNG replay;
- unauthorized ItemId, missing quantity, stale Inventory OCC and mismatched pending-capture context;
- concurrent duplicate attempt correlation and concurrent different correlations for one EncounterId;
- response-loss replay after accepted failure and after accepted success;
- transaction rollback after Ball debit path begins but before Pokémon/outcome commit;
- Species Research exact-once behavior across success/failure/rejection/rollback/response-loss replay;
- exact Pokémon construction fields and bootstrap Move authority failure before attempt acceptance;
- no second reward source created by capture success;
- fresh disposable PostgreSQL validation of uniqueness/atomicity and Worker bundling of internal API path.

### Implementation-owner evidence — 2026-09-26

- Human H4 gate closed: deterministic canonical `sourceAbilitySlot = normal-1`.
- `packages/game-core`: typecheck PASS; build PASS; unit/replay suite `396/396` PASS.
- `packages/database`: typecheck PASS; unit suite `30/30` PASS; disposable PostgreSQL 17 integration
  `68/68` PASS, including TASK-036 capture `7/7` PASS for success/failure, immutable construction replay,
  conflicting replay, same-correlation concurrency, one-Encounter concurrency, stale/insufficient
  Inventory, exact Species Research and rollback after Ball debit begins.
- `apps/api`: typecheck PASS; unit suite `110/110` PASS; disposable PostgreSQL 17 integration `36/36`
  PASS, including Reward application `10/10` with authentic empty Reward Envelope durable completion and
  replay.
- API Worker dry-run bundle PASS; database Worker dry-run bundle PASS.
- workspace `lint`, `typecheck`, `test` and `build` PASS.
- `roadmap:check` PASS after active-task projection reconciliation.
- `git diff --check` PASS.
- Standard Ball ItemId publication/faucet remains the explicitly accepted downstream content/release
  dependency from H2/H7; TASK-036 consumes only injected exact ItemId→Ball-rule authority and does not
  infer authorization from names.

Implementation owner requests independent QA, reward-integrity IA and Class-B functional/architecture
review on this exact REVIEW snapshot. No Git history mutation, deploy or production cutover is authorized.

### Independent REVIEW findings and FIX cycle — 2026-09-26

Initial independent gates returned QA **NOT READY 0/2/0/0** and reward-integrity IA **FAIL 0/2/0/0**.
The findings were material and are addressed in this FIX snapshot:

1. response-loss capture replay now performs durable `(subjectPlayerId, attemptCorrelation)` lookup before
   consulting current Ball/static/Move authority. A matching committed command returns its stored attempt
   directly; mismatched frozen request identity conflicts. Current creation authority cannot reinterpret a
   committed retry;
2. capture creation now fails closed when the selected new-operation context lacks exact
   `productionExecutableMoveIds`; raw level-up eligibility alone is never accepted as production bootstrap
   authority;
3. Encounter reward resolution no longer accepts a caller-supplied completed-evidence object as source
   authority. It resolves the requested `rewardSourceIdentity` only from a full replay-validated
   `SoloHuntRuntimeState` + exact bound `SoloHuntRuntimeInputs`; forged/absent reward-source identity fails
   before TASK-034 historical lookup or TASK-024 claim.
4. the corrected correlation-first replay also binds the caller's explicit capture RNG origin to the
   frozen accepted intent. Same correlation with a different RNG algorithm/state conflicts before any
   current authority lookup; Inventory rowVersion/current Ball or creation authority remain intentionally
   outside committed replay comparison.
5. Class-B then identified that new capture attempts still trusted caller-supplied TASK-097 snapshot
   facts. That boundary is now removed: a new attempt accepts only `encounterId` plus exact Hunt runtime
   state/inputs, and `replayValidateSoloHuntCaptureSource` performs full runtime binding/state/history
   replay before returning the authoritative pending-capture decision and the exact
   `EncounterIndividualizationSnapshot` from completed-Encounter provenance. IVs, Genetics/Profile,
   Shiny, snapshot identity/commitment and capture chance can no longer be substituted by the caller.
   Committed correlation replay remains first and does not consult current Hunt/static/Ball authority.

Focused FIX evidence: game-core typecheck PASS + `398/398` unit/replay PASS; database typecheck PASS;
API typecheck PASS + `115/115` unit PASS; capture PostgreSQL `7/7` PASS; full API PostgreSQL `36/36` PASS;
API Worker and database Worker dry-run bundles PASS. Independent re-gates are required on the corrected
snapshot before REVIEW/ACCEPTANCE resumes.

The corrected snapshot re-entered REVIEW after `pnpm lint`, `roadmap:check` and `git diff --check` also
passed. Re-gates must specifically verify correlation-first capture replay, mandatory production Move
authority, replay-validated Solo Hunt reward-source authenticity and authoritative TASK-097 capture
snapshot derivation, plus any regression those fixes may have introduced. Full workspace typecheck/test/
build PASS on the latest snapshot; one prior workspace test run hit only two 5-second `game-data`
publication-test timeouts, both passed in isolation and the complete rerun passed unchanged.

### Final independent gates — exact-current snapshot — 2026-09-26

- QA: **READY — P0/P1/P2/P3 = 0/0/0/0**. No residual/new finding. Verified that new capture accepts
  `encounterId + huntState + huntInputs`, preserves correlation-first committed replay, and consumes only
  replay-validated pending-capture/snapshot authority.
- Reward-integrity IA: **PASS — P0/P1/P2/P3 = 0/0/0/0**. No residual/new finding. Confirmed exact
  completed-Encounter/provenance replay before capture source extraction and that committed replay remains
  independent of current Hunt/static/Ball authority.
- Independent Class-B functional/architecture acceptance: **ACCEPT — P0/P1/P2/P3 = 0/0/0/0**. No
  residual/new finding. Confirmed reward-source authenticity, capture snapshot authority, production Move
  support, RNG-origin replay binding, atomic persistence and database uniqueness boundaries.

TASK-036 therefore enters **ACCEPTANCE**. Repository/history completion, deploy and production cutover are
separate gates and remain unauthorized in this session.

## Dependencies

- TASK-023 / SPEC-009 — DONE / APPROVED.
- TASK-024 — DONE; Reward Ledger / progression / Inventory application authority exists.
- TASK-033 / SPEC-013 — DONE / APPROVED.
- TASK-034 — DONE; immutable v3 Hunt/Encounter/reward content exists.
- TASK-035 — DONE; deterministic completion/capture-decision evidence exists.
- TASK-089 / SPEC-010 — DONE / APPROVED for owned-Pokémon Move bootstrap.
- TASK-090 / SPEC-012 — DONE / APPROVED; exact executable Move/Ability production-content semantics.
- TASK-091 — DONE; immutable production combat-rule catalogs/selectability authority.
- TASK-095 — DONE; exact production v3 rules/data binding and immutable artifact history repaired.
- TASK-096 / SPEC-014 — DONE / APPROVED Class-A authority; acquisition/capture/auto-capture/duplicate/
  persistence semantics are Human-approved, reconciled and exact-current review-clear.
- TASK-097 — ACCEPTANCE with implementation and independent Class-B acceptance complete; the frozen
  Encounter-individual snapshot/persistence boundary required by TASK-036 is available. Repository/history
  completion remains separately gated.

## Risks / irreversible actions

- Capture probability directly controls acquisition rate, Ball pressure and collection progression;
  implementation before Human rule validation would accidentally create product/economy semantics.
- Genetics/IV/Profile/Shiny are now properties of the Encounter individual. Generating them only after a
  successful capture would contradict the accepted identity model and permit reroll/provenance drift.
- historical SPEC-003 combat-v1 remains immutable; its APPROVED forward amendment records the approved
  Genetic-aware formula for a new rulesVersion. SPEC-005 now has a Human-approved forward
  Genetics/Shiny/Ascendant persistence amendment. TASK-036 must consume those forward authorities rather
  than smuggle alternative stat/persistence semantics into this Class-B implementation.
- Ball-specific source-game behavior cannot be reconstructed from Item display/category facts and would
  silently create unsupported context dependencies if inferred.
- Weak attempt idempotency can duplicate captures or consume multiple Balls after response loss.
- Inserting a Pokémon and bootstrapping its Moves in separate transactions would expose a partial durable
  capture state and violate accepted atomic consequence semantics.
- Sharing Combat/Encounter/reward/capture RNG streams would couple unrelated outcomes and make future
  replay/correction brittle.
- Persisting a randomly selected Ability without an accepted acquisition weighting rule would make source
  ordering an accidental product rule.
- Database schema additions are forward-only and require fresh PostgreSQL migration/integration proof.

## Expected files / boundaries

Likely after READY:

    tasks/active/TASK-036-capture-reward-resolution.md
    packages/game-core/src/capture-reward.ts
    packages/game-core/src/capture-reward.test.ts
    packages/game-core/src/index.ts
    packages/game-core/src/index.test.ts
    packages/database/migrations/0007_capture_resolution.sql
    packages/database/src/capture-repository.ts
    packages/database/src/capture-repository.test.ts
    packages/database/src/index.ts
    packages/database/integration/**
    apps/api/src/hunts/capture-reward.ts
    apps/api/src/hunts/capture-reward.test.ts
    apps/api/integration/**
    docs/project/PROJECT_ROADMAP.md
    docs/project/PROJECT_ROADMAP.html

Do not add public Hunt HTTP routes, TASK-037 checkpoint/claim implementation or TASK-038 Hunt aggregate
persistence under this task.

## Definition-of-Ready status

Known implementation authority and dependencies are sufficient to define the task boundary. TASK-096 /
SPEC-014 and the upstream TASK-097 individualization boundary are closed for DoR purposes. H6 is a
deterministic implementation boundary and H7 is a downstream release dependency, not additional Human
product gates. The Human Owner approved deterministic `sourceAbilitySlot = normal-1` for H4 on 2026-09-26.
TASK-036 therefore satisfies its Definition of Ready and implementation may proceed within the scope above.

## Pre-READY consultation evidence

The original PXE/GSC notes below are retained as historical evidence for the superseded direct-linear H1
draft. They are not current authority for H1.

### PXE advisory

- Result: **ADVISORY CONCERN** — no conflict with APPROVED SPEC-007/009/013, but material product/economy
  choices require explicit Human acceptance before READY.
- Reward resolution direction is sound if reward RNG is domain-separated/deterministic from frozen
  source context, each immutable item-drop row rolls exactly once in its persisted canonical order, and
  the resolved envelope is frozen before SPEC-009 application.
- H1 is a genuinely new PokeNexus capture rule, not a source-game formula. Under the proposed direct
  linear mapping, `catchRate=3` becomes **1.17% per accepted attempt**, approximately **85.5 Balls per
  success on average**, about **59 attempts for 50% cumulative success** and **196 for 90%**, with no
  pity mechanic. Current Verdant Edge does not expose this pressure because Rattata/Spearow/Hoothoot all
  have `catchRate=255` and would therefore be 100% under H1.
- H2 requires explicit player-facing disclosure that the seven Apricorn Balls are mechanically identical
  in v1; familiar source-game names otherwise create a strong expectation that their special effects
  exist.
- A current Ball acquisition/faucet path was not found, and TASK-034 Verdant Edge has `itemDrops=[]`.
  Therefore TASK-036 can validly remain a resolver/authority implementation, but **end-to-end playable
  capture remains release-blocked downstream until an accepted Ball source exists**. TASK-036 must not
  invent a starting grant, shop, drop, currency or monetization shortcut to hide that gap.
- H3 uniform full-range IVs create a second acquisition-scarcity layer that can matter for future PvP or
  paid-attempt designs; no paid capture/attempt-volume asymmetry is introduced here. Any future paid
  capture access remains subject to the existing Class-A/PXE gate.
- H4 (`selectedAbilityId=null`) is structurally valid and avoids accidental slot weighting, but ordinary
  editing cannot currently assign/reroll an Ability later. The Human decision should therefore treat
  ability-less captured v1 instances as an intentional baseline consequence, not a temporary UI detail.

### GSC advisory

- Result: **ADVISORY CONCERN** — reward resolution is coherent, while H1/H2/H4 materially affect player
  expectations and require explicit Human acceptance before READY.
- Current Verdant Edge contains only Rattata, Spearow and Hoothoot, all with `catchRate=255`; H1 therefore
  makes the complete current capture slice 100%. That is internally coherent for MVP but does not test
  future acquisition pacing.
- Across the current 293 Species/forms, 96 have `catchRate=45` (`1764 bp`, mean about 5.67 Balls per
  success; roughly 12 attempts for 90% cumulative success) and 12 have `catchRate=3` (`117 bp`, mean
  about 85.47 Balls; roughly 59 attempts for 50% and 196 for 90%). Option B's one accepted attempt per
  Encounter magnifies this future collector friction. GSC recommends accepting H1 only as an explicitly
  custom post-defeat PokeNexus curve and re-reviewing scarcity before very-low-rate Species become
  capture-eligible; do not invent a floor/multiplier now.
- Seven neutral Apricorn Balls are acceptable only with explicit player-facing disclosure that their v1
  capture chance is identical; otherwise familiar names imply strategy that does not exist.
- H3 full-range uniform IVs is simple and sufficiently Pokémon-like for baseline, but low catch chance +
  IV RNG can become stacked grind later and should be revisited with future low-rate/PvP content.
- GSC prefers H4 deterministic canonical `normal-1` over `null`: all current Species/forms have that
  factual slot, it adds no current combat power under inactive-by-policy Abilities, and it avoids
  permanently ability-less captures.
- H5 must use the exact production bootstrap boundary: SPEC-010 level-up eligibility **intersected with**
  SPEC-012/TASK-091/095 executable support, then SPEC-010 ordering. Raw level-up eligibility alone is
  insufficient.
- H6 domain-separated reward/capture RNG remains sound. The historical
  `capture-outcome → IV draw` ordering is **superseded**: TASK-097 now freezes IVs/Genetics/Profile/Shiny
  before Battle, and TASK-036 never draws those fields after capture.
- H7 resolver-only READY is acceptable, but playable capture requires a separately accepted Ball faucet
  before release; TASK-036 should not invent a starter grant/shop/drop to make the resolver appear usable.

## Completion

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
