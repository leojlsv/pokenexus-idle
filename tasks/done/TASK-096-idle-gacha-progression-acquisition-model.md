# TASK-096 — Idle/Gacha Progression & Acquisition Model

## Metadata

- State: DONE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: N/A
- Auditor execution surface: N/A
- Consultants: Gameplay Systems Consultant (GSC); Player Experience / Economy Consultant (PXE)
- Consultant execution surface(s): fresh independent ChatGPT advisory assignments
- Spec: `docs/specs/SPEC-014-idle-gacha-genetic-quality-acquisition-model.md`
- ADR: N/A unless technical feasibility requires a new architectural decision
- Branch: planning completed inside `feat/TASK-036-capture-reward-resolution`; repository/history
  integration remains separately gated
- Worktree: `.worktrees/TASK-036-capture-reward-resolution`

## Objective

Define the Class-A PokeNexus Idle/Gacha progression and randomized-acquisition authority that must exist
before TASK-036 capture rules, TASK-037 offline progression and TASK-038 Hunt orchestration can freeze
player-visible acquisition semantics.

The Human Owner has already accepted the Genetics + Shiny Model A slice. TASK-096 must preserve that
decision, reconcile its technical consequences, and close the remaining acquisition/cadence decisions
without silently introducing monetization or source-game formulas.

## Context

TASK-036 originally proposed a direct linear `catchRate / 255` mapping and six post-capture uniform IV
rolls. The Human Owner rejected the linear capture rule and then elevated Idle/Gacha-style individual
quality into a core PokeNexus product property.

The accepted Genetics direction means IVs/Genetics/Profile/Shiny belong to the encountered individual
before Battle/capture, so TASK-036 can no longer own a post-success reroll of those properties. Existing
TASK-035 remains canonically DONE; this task defines the new downstream authority/decomposition rather
than rewriting its completed history.

Canonical GSC/PXE governance already covers this decision. Both consultants are advisory only; Human
Owner remains final product authority.

## Accepted Human slice — 2026-09-24

- Genetic Score is one globally comparable integer `0..100`.
- Grade names/ranges are:
  - Normal `0..39`;
  - Uncommon `40..64`;
  - Rare `65..82`;
  - Epic `83..94`;
  - Apex `95..100`.
- Player-facing `Quality 0.xx` and the `Refined` label are removed.
- Genetic Budget modelling bands are `0–10 / 11–20 / 21–34 / 35–50 / 51–70`.
- Genetic Profile distributes the Budget; it does not add extra Budget.
- Genetics is separate from canonical IVs and may not overwrite/extend stored IV values beyond `0..31`.
- No direct whole-stat rarity multiplier is accepted.
- Genetics and Shiny are frozen with the Encounter individual, preserved through evolution and remain
  meaningful across future generations.
- Shiny grants no statistical power.
- Shiny Model A is accepted: same capture rule as non-Shiny, no bonus, no extra attempt and no guarantee.
- Auto-capture is a structural Idle mechanic.
- No Epic+ pity, Apex pity or capture-protection system belongs in the Idle MVP.
- Species/form appearance probability is authored per Hunt/Encounter table; there is no universal global
  Species-rarity percentage.
- Default MVP Grade probabilities are Human-approved at `55/28/12/4/1%` for
  Normal/Uncommon/Rare/Epic/Apex. Combined acquisition-cadence validation must measure elapsed-time
  outcomes but may not silently retune the accepted table.

## Scope

- Materialize and reconcile SPEC-014.
- Record and propagate the accepted Genetic Score → Budget integer semantics.
- Record and propagate the accepted Genetic Profile catalog/acquisition model.
- Record and propagate the accepted wild/captured canonical IV-generation distribution in the presence
  of Genetics.
- Define the deterministic/server-owned Encounter individualization authority and exact provenance needed
  for IVs, Genetics, Profile and Shiny before Battle.
- Define the required SPEC-003 derived-stat amendment without mutating canonical IV meaning.
- Define owned-Pokémon persistence/API implications and the required SPEC-005/schema amendments.
- Define a custom PokeNexus capture curve over canonical Species/form `catchRate`; `catchRate=255` must
  remain high/easy but must not become accidental 100% under the ordinary baseline.
- Define Ball-modifier composition and at least one sustainable non-paid Ball acquisition path before the
  player-visible capture loop can ship.
- Validate Grade/Shiny/capture probabilities against actual encounter cadence rather than independently.
- Decide duplicate value/progression with no pity/guarantee side effect.
- Define standing auto-capture authorization, Ball-selection/fallback and offline consumption semantics
  explicitly against SPEC-013's current manual-only one-pending baseline.
- Produce the downstream task/spec decomposition required before TASK-036/037/038 can reach READY.

## Out of scope

- production implementation without a separately activated downstream Class-B task;
- Git history mutation without separate Human Owner authorization;
- paid pulls, premium currency, paid stamina, paid capture boosts, loot boxes or any monetized random
  acquisition unless the Human Owner separately proposes and accepts them through the Class-A/PXE gate;
- player-to-player trading/economy rules;
- copying a source-game catch formula or source-game Apricorn Ball effects by inference;
- reopening TASK-035 canonical implementation/history;
- treating Shiny as combat power;
- silently converting Genetics into IVs above 31.

## Consolidated PM recommendation — Human pending

Fresh GSC/PXE advisory converges on preserving the approved Genetics/Shiny model while reducing stacked
RNG elsewhere. After the Human Owner's auto-capture clarification, PM recommends the corrected SPEC-014
section 11 package:

- IVs: each stat = `U[0,15] + U[0,16]`, frozen at Encounter birth;
- Profiles: Human-approved final catalog `Harmony / Might / Clarity / Endurance / Resilience`; exactly two
  compatible Profiles per Species/form, selected `50/50` and frozen;
- Grades: freeze `55/28/12/4/1%` for MVP; roll one uniform integer Genetic Score inside the selected band;
- Genetic Bonus combat formula: under a new immutable combat rules release, use
  `2*BaseStat + IV + perStatGeneticBonus` inside the existing level/stat formulas; never mutate IV > 31;
- no Genetics protection: no Epic+/Apex pity, soft pity or duplicate-driven Grade guarantee;
- duplicate utility: Human-approved permanent Species Research count keyed by exact Species/form; every
  successful capture increments by one, with no fusion/shards, consumption, power/economy or RNG effect;
- Shiny: Human-approved MVP base rate `1/16384` for expected sustained `200–600 Encounters/hour`; one
  unbiased `U[0,16383]` draw at Encounter individualization, Shiny iff `0`; no Shiny pity/protection;
- Ascendant: Human-approved composite rarity `Shiny && Apex`, not a sixth Genetic Grade. It keeps the
  Apex Score/Budget/stat ceiling and gains Ascendant Resonance: outside active content it may express
  either of the two compatible Profiles frozen at Encounter birth; the activity snapshot freezes the
  chosen Profile/bonus vector for its full duration;
- capture curve anchors: `3→8%, 25→15%, 45→25%, 75→35%, 120→50%, 190→68%, 255→82%` with deterministic
  piecewise-linear basis-point interpolation;
- Genetic capture modifier: `Normal 1.00 / Uncommon 0.98 / Rare 0.95 / Epic 0.90 / Apex 0.80`, applied
  after the catch-rate curve and before Ball behavior; hidden Genetics cannot influence Ball selection;
- no capture protection or failure counter; every attempt uses only the authored curve + Ball behavior;
- Balls: Human-approved MVP ladder
  `Poké 1.00 / Great 1.25 / Super 1.50 / Ultra 2.00 / VIP 2.25` using failure-exponent composition;
  existing Apricorn names do not infer effects;
- supply boundary: Poké commodity; Great recurring ordinary purchase but intentionally less economical
  than Poké for routine farming; Super controlled non-paid; Ultra scarce-but-recurring F2P and not
  unlimited common-NPC stock; VIP premium-currency-only;
- VIP Ball is a narrow deterministic-consumable monetization exception: it never changes
  Encounter/Species/Genetics/Profile/IV/Shiny generation and is only modestly stronger than Ultra;
- Ball faucet: no 1:1 per-Encounter refill assumption; tune exact prices/stock/faucets against measured
  auto-capture burn/accumulation without starving F2P Ultra availability;
- auto-capture: replace plain `ordered ballPriority[]` with explicit per-Ball auto-use + minimum reserve
  and ordered visible-condition rules/fallbacks. Hidden Genetics cannot influence Ball selection;
  VIP auto-use defaults OFF and can never become an implicit fallback merely because ordinary Balls run
  out; retry remains idempotent.

The prior pity/queue recommendations are superseded. In an Idle model with auto-capture, repeated
independent sampling provides the natural statistical smoothing while failed capture continues to consume
Balls and therefore remains an economy sink.

The acquisition-rate/Profile/capture/Ball/Ascendant rules above are now Human-approved, including Shiny
`1/16384`, Species Research duplicate utility and the SPEC-005 persistence/legacy boundary.
Lifecycle/provenance and downstream task ownership are reconciled. Exact-current independent gates are
clear and the Human Owner gave final consolidated Class-A acceptance on 2026-09-25T22:55:35Z.

## Acceptance criteria

- [x] Human Owner accepts the Genetics + Shiny Model A conceptual slice.
- [x] Human Owner accepts auto-capture as a structural Idle mechanic and rejects Epic+/Apex/capture
      protection for the MVP.
- [x] Human Owner accepts the Genetic Profile model: five named Profiles, exactly two compatible
      Profiles per Species/form, `50/50` frozen selection and deterministic full-Budget allocation.
- [x] Human Owner accepts center-weighted canonical IV generation:
      `U[0,15] + U[0,16]` independently per stat, frozen at Encounter individualization.
- [x] Human Owner accepts the Genetic Budget bands
      `0–10 / 11–20 / 21–34 / 35–50 / 51–70` and exact deterministic round-half-up
      Genetic Score → Budget interpolation.
- [x] Human Owner accepts the Genetic Bonus combat formula
      `2*BaseStat + IV + perStatGeneticBonus` inside a new immutable combat rules version;
      canonical IV remains `0..31` and existing SPEC-003/TASK-095 history is not reinterpreted.
- [x] Human Owner accepts the default MVP Genetic Grade probabilities:
      `Normal 55% / Uncommon 28% / Rare 12% / Epic 4% / Apex 1%`, with no pity/protection.
- [x] Human Owner accepts the composite rarity name **Ascendant** and its Resonance model:
      `Shiny && Apex`, no higher Score/Budget/stat ceiling, two frozen compatible Profiles, one expressed
      outside active content and frozen into each activity snapshot.
- [x] Human Owner accepts the Shiny MVP base rate `1/16384` for expected sustained
      `200–600 Encounters/hour`, with exact `U[0,16383]` / draw-zero semantics and no pity/protection.
- [x] SPEC-014 records that accepted slice and distinguishes release-locked rules from tuning baselines.
- [x] GSC and PXE advisory findings are reconciled for the remaining Class-A decisions into SPEC-014
      section 11; the Shiny calibration is now Human-approved and fresh exact-current final re-gates remain.
- [x] Exact Genetic Score → Budget integer semantics are Human-approved.
- [x] IV-generation policy is accepted with stacked-RNG consequences explicitly evaluated.
- [x] SPEC-003 exact Genetic Bonus formula + new immutable rulesVersion path is Human-approved before
      runtime stat consumption.
- [x] SPEC-005/schema persistence authority for Genetics/Shiny/Ascendant is Human-approved: persist the
      immutable individual facts + expressed Profile authority, derive Grade/Budget/Ascendant/bonuses,
      and fail closed on any pre-Genetics durable legacy row rather than fabricating values.
- [x] Encounter individualization provenance/producer is defined before TASK-036 READY:
      exact TASK-035 PendingEncounterSelection → one TASK-097 individual snapshot before Battle, with
      separately versioned domain-separated RNG authority that cannot advance selection/combat/capture RNG.
- [x] Final capture curve + Genetic capture modifier are Human-approved; exact versioned fixed-point
      realization remains an implementation artifact.
- [x] Ball ladder, supply hierarchy and narrow VIP monetization exception are Human-approved; exact
      prices/stock/faucets remain downstream tuning.
- [x] Auto-capture Ball-selection/reserve/fallback/offline semantics are Human-approved: per-Ball
      opt-in/reserve, visible-condition rules only, hidden Genetics excluded, VIP OFF by default.
- [x] Auto-capture UX truthfulness boundary is explicit: before enable/save, TASK-038 must warn that
      uncovered/unavailable/reserve-blocked opportunities — including visible Shiny — are permanently
      lost with no manual fallback/queue, and that later settings changes affect only future intervals.
- [x] Duplicate utility is Human-approved for MVP as permanent Species Research count only: `+1` for
      every successful capture of the exact Species/form, with no power/economy/RNG effect.
- [x] Forward TASK-097 individualization/runtime boundary is materialized so TASK-036 does not create the
      individual after capture.
- [x] TASK-097/036/037/038 dependencies and task boundaries are finalized from the accepted Class-A
      result: 097 owns individualization + persistence support, 036 owns one capture attempt/atomic grant +
      Species Research increment, 037 owns deterministic offline/checkpoint advancement, and 038 owns
      Hunt/API/settings/persistence orchestration and standing auto-capture configuration.
- [x] Exact-current independent gates are clear for the reconciled Class-A documentation snapshot:
      QA/ARCH READY `0/0/0/0`, IA PASS `0/0/0/0`, PXE READY `0/0/0/0` and
      GSC ADVISORY PASS `0/0/0/0`.
- [x] Human Owner gives final consolidated Class-A acceptance of SPEC-014 and its forward amendments
      before production implementation is activated — accepted 2026-09-25T22:55:35Z.

## Validation / tests

- [x] `corepack pnpm roadmap:generate`
- [x] `corepack pnpm roadmap:check`
- [x] `git diff --check`
- [x] Cross-spec review against SPEC-003/005/007/009/013.
- [x] GSC acquisition-cadence scenarios include low/medium/high encounter frequency and later-generation
      content.
- [x] PXE stacked-RNG scenarios cover encounter × capture × Genetics × IV/Profile × Shiny and duplicate
      value.
- [x] Determinism review confirms retry/reload/restart cannot reroll one Encounter individual and that
      hidden individualization authority is server-only/non-exportable.

## Dependencies

- TASK-008 / SPEC-003 — DONE / APPROVED baseline; APPROVED forward amendment now records the accepted
  Genetic-aware formula for a new immutable combat rules version without reinterpreting combat v1.
- TASK-019 / SPEC-005 — DONE / APPROVED baseline; accepted forward amendment now records
  Genetics/Shiny/Ascendant persistence and fail-closed legacy semantics.
- TASK-022 / SPEC-007 — DONE / APPROVED; capture-item consumption authority.
- TASK-023 / SPEC-009 — DONE / APPROVED; reward integrity authority.
- TASK-033 / SPEC-013 — DONE / APPROVED baseline; APPROVED forward amendment now records
  PendingEncounterSelection-bound individualization and standing auto-capture integration.
- TASK-034 — DONE; current Hunt/Encounter content and canonical `catchRate` inputs.
- TASK-035 — DONE; deterministic Solo Hunt orchestration remains canonical.
- TASK-093 — DONE; GSC/PXE consultation governance exists.

## Risks / irreversible actions

- Stacked rarity can make desired Pokémon practically unreachable even when each individual percentage
  looks reasonable.
- Full independent IV variance can visually/competitively obscure Genetics Grade unless both systems are
  deliberately budgeted together.
- A random immutable Profile adds another acquisition-RNG axis and may create frustrating high-Grade
  wrong-profile duplicates.
- Adding Genetic Bonus to combat without explicitly amending SPEC-003 would violate the approved no-hidden-
  stat-input rule.
- Rolling IV/Genetics/Shiny only after capture would contradict the accepted same-individual model.
- Auto-capture now explicitly changes SPEC-013's manual-only baseline and therefore requires a forward
  Class-A amendment; exact Ball fallback/empty-stock behavior must not be invented by implementation.
- Paid/random acquisition is not authorized by the word “Gacha”.

## Expected files / boundaries

- `docs/specs/SPEC-014-idle-gacha-genetic-quality-acquisition-model.md`
- `tasks/done/TASK-096-idle-gacha-progression-acquisition-model.md`
- `tasks/active/TASK-097-encounter-individualization-genetics-runtime.md`
- `tasks/active/TASK-036-capture-reward-resolution.md`
- `docs/project/PROJECT_ROADMAP.md`
- `docs/project/PROJECT_ROADMAP.html`
- later explicit amendments to SPEC-003/005/013 only after their exact semantics are accepted

No production source, migration, package version, lockfile or immutable published artifact is modified by
this planning task.

## Completion

Class-A semantic completion: Human Owner final consolidated acceptance
`2026-09-25T22:55:35Z`.

No production implementation, migration, deploy or Git-history mutation was authorized by this
completion.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
