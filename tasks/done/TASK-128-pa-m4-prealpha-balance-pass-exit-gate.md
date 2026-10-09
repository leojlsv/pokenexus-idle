# TASK-128 — PA-M4 Pre-alpha Balance Pass & Exit Gate

## Metadata

- State: DONE
- Class: A
- Owner: PM / Architecture Coordinator (ChatGPT prime)
- Owner execution surface: ChatGPT prime
- Reviewer: independent QA / evidence reviewer
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: independent balance-evidence/provenance reviewer
- Auditor execution surface: independent ChatGPT delegated reviewer
- Consultants: Gameplay Systems Consultant (GSC); Player Experience / Economy Consultant (PXE)
- Consultant execution surface(s): independent advisory assignments after the read-only evidence packet exists and before any Human rule-change decision
- Skills: `SK-PNX-PLAN`, `SK-PNX-BAL`; `SK-PNX-REPLAY` / `SK-PNX-OBS` for evidence provenance; `performance-investigation` only if a runtime budget becomes part of a recommendation
- Specs/authority: APPROVED SPEC-014/020/021/027 plus integrated TASK-034/035/036/096/097/109/110/122/125/126/127 authority
- Dependencies: TASK-034, TASK-035, TASK-036, TASK-096, TASK-097, TASK-109, TASK-110, TASK-122, TASK-127
- Control branch: `docs/TASK-128-129-history-handback` — repository-history handback only
- Control worktree: `.worktrees/TASK-128-129-history-handback`
- Source baseline: canonical `main@b467cee`
- Source worktree: canonical root `main`; historical/source worktrees and preserved local gameplay state remain untouched

## Objective

Execute **PA-M4 — Pre-alpha Balance Pass** as an evidence-first Class-A review of the already integrated first-Pre-alpha rules using real local-session data. Determine whether capture economy, XP pacing, resource flows and combat difficulty are acceptable, need more evidence, or justify a specifically proposed versioned balance change.

This task **does not authorize balance changes by itself**. Any change to accepted capture curves, Ball behavior, encounter weights/levels, XP, drops, starter baseline, combat formulas, recovery or automation semantics requires explicit GSC/PXE advisory review where applicable, an explicit Human Owner decision, versioned forward authority and a separately activated implementation task. Historical Hunts/state must never be rewritten to simulate a balance correction.

At TASK-128 activation, PA-M5 remained `GATED`. TASK-128 could recommend that PA-M4 was complete, but it could not auto-open PA-M5 or any expansion capability; the later Human exit decision below separately completed that transition.

## Canonical balance baseline under review

- Bootstrap forward baseline: Level-5 starter / cumulative XP `124`, Player Level 1 / Player XP `0`, Inventory `50 Poké Ball / 20 Basic Potion / 5 Revive-25`; historical v1 bootstraps remain valid and are not converted implicitly.
- Verdant Edge / Wilds level distribution: Lv1 `50%`, Lv2 `35%`, Lv3 `15%`.
- Wild Species weights: Pidgey `16`, Rattata `15`, Caterpie `18`, Sentret `17`, Ledyba `17`, Sunkern `17`.
- Provisional Encounter rewards: Player XP `2 × wild level`; Pokémon XP pool `6 × wild level`; independent Poké Ball ×1 drop `15%`; independent Basic Potion ×1 drop `5%`; no Revive drop.
- Auto-capture is structural Idle behavior. Current accepted capture authority remains the SPEC-014 curve/Genetic modifier/Ball ladder/reserve-aware selection; no capture pity/protection is implied.
- Current management-first Potion/Revive/Capture policies, 30s recovery and persisted vitality remain accepted runtime semantics; PA-M4 measures their player-economy/difficulty consequences rather than redefining them silently.

## Required balance-review matrix

1. **Evidence inventory / provenance baseline**
   - Census the preserved local database plus PA-M1/PA-M2/PA-M3 evidence artifacts.
   - Segment real gameplay, deliberately configured validation runs, inherited/legacy state and invalid/discarded controller vectors.
   - Establish which samples may support directional balance findings and which are integrity-only tests that must not be treated as organic economy telemetry.
2. **Capture economy**
   - Measure eligible capture attempts, successes/failures/closures, Ball debits, Ball drops/credits, minimum-reserve closures and net Ball flow where evidence is authoritative.
   - Compare observed results with the accepted capture authority without inferring a new target capture rate from a small sample.
3. **XP / progression pacing**
   - Measure observed Player/Pokémon XP earned per Encounter/Hunt and actual level progression in the preserved sessions.
   - Compare observed rewards with the provisional `2×/6×` Wilds rule and identify whether progression is clearly too slow/fast or simply under-sampled.
4. **Resource economy**
   - Reconcile Poké Ball, Basic Potion and Revive sources/sinks across representative Hunts and policy settings.
   - Distinguish bootstrap stock, Hunt drops, automation spends, manually configured reserve tests and other non-organic validation changes.
5. **Combat difficulty / attrition**
   - Measure natural `no_living`, encounter counts before terminal, HP attrition, Potion/Revive use and recovery boundaries from authoritative Hunt/Activity data.
   - Reuse the known starter confrontation diagnosis as historical evidence, not as permission to retune combat.
6. **Encounter distribution sanity**
   - Compare observed Species/level samples against authored Wilds weights/level marginals only as a sample sanity check.
   - Do not reject/retune the authored distribution solely from statistically weak local counts.
7. **Cross-metric balance synthesis**
   - Evaluate capture supply versus capture demand, XP gain versus Hunt survivability, and consumable spend versus replenishment together rather than independently.
   - Identify feedback loops such as low survival reducing XP/drop acquisition, or aggressive auto-capture exhausting supply faster than the authored faucet.
8. **Recommendation packet**
   - Classify each reviewed axis as `KEEP`, `CHANGE PROPOSAL`, or `NEED MORE DATA`.
   - Every proposed change must state the exact current value, proposed value/range, evidence, expected player impact, risks, migration/versioning consequences and affected specs/tasks.
   - Obtain GSC + PXE advisory review before presenting any Class-A change package to the Human Owner.
9. **PA-M4 exit packet**
   - Independent QA/evidence review confirms the metric derivation, exclusions and wording.
   - Human Owner decides each change proposal (if any), whether more live data is required, and whether PA-M4 is complete.
   - PA-M5 remains gated unless the Human Owner separately opens the relevant expansion gate.

## Initial target

Gate 1 is **read-only evidence inventory/provenance**. No new Hunt mutation, Reset, account conversion, policy edit, balance change, DB write or runtime restart is required merely to establish the PA-M4 data baseline.

## Safety / authority rules

- Use only the owned local Pre-alpha environment and repository evidence.
- Database access for balance analysis is read-only. Normal gameplay writes are allowed only if a later approved measurement plan explicitly needs fresh live sampling.
- Do not Reset preserved accounts or fabricate outcomes to obtain a cleaner sample.
- Do not classify policy-reserve experiments, forced diagnostic states or invalid controller overlaps as organic player behavior.
- Preserve historical v1/v2 bootstrap provenance and immutable Hunt/rules versions.
- Do not change authored content, formulas, XP, drops, capture probabilities, item quantities, recovery, automation or combat behavior in TASK-128 without explicit Human Class-A acceptance.
- Do not deploy, migrate production, enable public routes or open PA-M5 capabilities.
- The TASK-127 continuation-latency P2 is operational/performance evidence, not a PA-M4 balance signal unless a later explicit player-experience budget links it to balance pacing.

## Acceptance criteria

- [x] Canonical PA-M4 balance authority and exact current values are recorded from approved sources.
- [x] Evidence inventory cleanly separates organic-ish gameplay evidence, deliberate validation/configuration runs, legacy state and discarded vectors.
- [x] Capture economy metrics are derived with explicit numerator/denominator/provenance and sample limitations.
- [x] XP/progression pacing is quantified against the current provisional Wilds rules.
- [x] Ball/Potion/Revive source-sink flows are quantified without mixing bootstrap grants or deliberate reserve tests into organic rates.
- [x] Combat attrition/difficulty is summarized from authoritative Hunt/Activity/vitality evidence.
- [x] Encounter Species/level sample sanity is reported without overclaiming statistical confidence.
- [x] Cross-metric synthesis classifies each axis `KEEP`, `CHANGE PROPOSAL`, or `NEED MORE DATA`.
- [x] GSC + PXE advisory consultation is complete for every proposed Class-A balance change.
- [x] Independent QA/evidence review finds no unresolved P0/P1 and explicitly classifies any limitations/P2.
- [x] Human Owner accepts/holds each proposed change and explicitly decides whether PA-M4 is complete; PA-M5 is not auto-opened.

## Evidence log

### Gate 1 — Evidence inventory / provenance baseline

- Status: `PASS`.
- Canonical source baseline: `main@b467cee`, TASK-127 DONE, PA-M4 CURRENT. The reviewed balance authority remains the approved/versioned source listed above; no runtime/content value was changed for this census.
- Approved current values were re-established from TASK-096 / SPEC-014, TASK-109 and SPEC-027/TASK-122: forward starter Level `5` at cumulative XP `124`; initial Inventory `50/20/5`; Wilds level weights `50/35/15`; Species weights `16/15/18/17/17/17`; Player XP `2×wild level`; Pokémon XP pool `6×wild level`; independent Ball `15%` and Potion `5%` drops; no Revive drop; accepted capture curve/Genetic modifiers/Ball ladder/reserve-aware auto-capture remain unchanged.
- Preserved PostgreSQL currently contains `40` Solo Hunts across the two local Players: A `24`, B `16`. All 40 currently have terminal reason `no_living`. This is a raw preserved-state fact, **not yet a balance verdict**, because the sample intentionally mixes historical bootstrap versions, validation scenarios and Human sessions.
- Time-window census: pre-TASK-126 = `28` Hunts (`15` A / `13` B); TASK-126 window = `8` Hunts (`5` A / `3` B); TASK-127 window = `4` A Hunts. The latest TASK-127 Human-session Hunt `01a12003-deeb-7043-a604-40e205793c7b` resolved `19` Encounter Activity rows through logical `78,000` and later terminalized `no_living`; preserved A is now Lv13 / XP `2272`.
- Authoritative metric surfaces are present and structured: `297` resolved Encounter Activity rows (`230` A / `67` B), each with the same `13` activity keys including `playerXp`, `pokemonXp`, `itemDrops`, `consumedItems`, `captureDisposition`, `battleResolved`, KO and Revive summaries; `46` automation item-use rows (`31` A / `15` B) retain item/rule/policy/logical-time and Inventory rowVersion provenance. These surfaces are sufficient to derive capture/XP/resource metrics without guessing from final Inventory alone.
- Captured-ownership surface currently contains `92` Pokémon instances (`62` A / `30` B), including starters and successful captures. Counts alone will not be treated as capture attempts; attempt/success denominators come from Activity `captureDisposition`.
- Public-command ledger remains integrity/replay evidence, not economy telemetry: A currently has historical terminal + pending command rows and B has only terminal rows. Exact-key retries/replays must never be counted as additional Encounters, captures, rewards or resource spends.
- Maintenance evidence is separately retained for controlled validation provenance: `edge-task125-a`, `task126` and `task127`; TASK-126 contains deliberate policy/reserve configuration and concurrency tests, while TASK-127 contains the explicitly discarded overlapping-controller vector plus clean sequential/restart/return runs. These files anchor which Hunt IDs/intervals were manipulated for test objectives.
- **Starter-conversion boundary:** A/B originated under bootstrap v1 at Level 1, but the Human-authorized local conversion `local-starter-conversion-v1` was executed and verified at `2026-10-07T17:42:28.816Z`. The receipt is preserved under `.maintenance/prealpha-local/starter-level-five-conversion.*`. Both starters became Level 5 / XP `124` without Reset and retained identity/provenance. Exactly five A Hunts predate that conversion and resolved `0` Encounters; all later A/B Hunts use the converted Level-5+ starter state. Post-conversion sessions are relevant to Lv5+ combat/progression, but they are not pristine fresh-account samples because prior Inventory/Collection/Hunt history was intentionally preserved.
- **Directed-validation exclusions/qualifiers:** TASK-126 Gate-5 reserve changes are valid policy mechanics evidence but not organic consumable-demand rates; replay/reconnect/checkpoint stress traffic is not wall-clock pacing; PokéCenter healing is not a Potion/Revive sink; foreign-access probes are not gameplay; the first TASK-127 overlapping checkpoint-controller run remains discarded as primary balance evidence; inherited pending commands are not failed Encounters.
- **Usable balance strata:** (A) resolved Encounter facts may support reward/capture/distribution metrics when the Hunt itself is valid; (B) resource-use rates require policy/config context and exclude deliberately manipulated reserve windows from generalized player-rate claims; (C) wall-clock pacing uses only real elapsed Human/clean-session windows, not large checkpoint/claim catch-up targets; (D) forward starter/onboarding balance requires fresh Level-5 evidence if a recommendation depends on the opening experience.
- Gate-1 conclusion: the dataset is large enough for directional PA-M4 analysis but not homogeneous enough for naïve aggregate rates. All following metrics must carry their sample stratum and exclusions explicitly.

### Gate 2 — Capture economy

- Status: `PASS` for evidence derivation; recommendation remains part of the cross-metric synthesis.
- Activity contains `115` authoritative automatic capture attempts across `297` resolved Encounter victories: `90` success / `25` failure = `78.3%` observed success. The corresponding persisted `capture_attempts` rows have mean final chance `80.1%` (`7,380..8,200 bp`). Observed outcomes are directionally consistent with the frozen chance authority; there is no evidence here that the SPEC-014 capture curve itself is too harsh or too generous.
- Descriptive Wilson 95% interval for `90/115` is approximately `69.9%..84.8%`; the mean frozen final chance `80.1%` lies inside it. This is a sampling sanity check, not a newly accepted target band.
- Capture attempt outcomes by broad execution window remain similar despite small samples: pre-TASK-126 `61/78` success (`78.2%`), TASK-126 `22/27` (`81.5%`), TASK-127 `7/10` (`70%`). TASK-127 is only ten attempts and does not justify retuning.
- `160/297` resolved Encounters report `no_eligible_ball` and `22/297` capture `disabled`. This **must not** be interpreted as a natural “54% Ball shortage rate”: B was deliberately configured to minimum reserve `19` for TASK-126 Gate 5, and current capture policies show B reserve `19` versus A reserve `1`. The no-eligible count is therefore partly an intentional validation configuration outcome.
- The 115 attempt rows include exact Species/Level/chance provenance and use generic capture rules (`when: {}`) rather than Species filters. Attempt-subset Species percentages are Caterpie `15.7%`, Ledyba `16.5%`, Pidgey `16.5%`, Rattata `13.0%`, Sentret `17.4%`, Sunkern `20.9%` versus authored `18/17/16/15/17/17`. The subset is too small and stock-limited to prove full Encounter marginals, but it shows no obvious capture-selection anomaly.
- Capture finding: **capture probability is not the current bottleneck**. The evidence points to supply/eligibility availability rather than chance-per-attempt.

### Gate 3 — XP / progression pacing

- Status: `PASS` for evidence derivation.
- All `297/297` resolved Activity rows exactly satisfy current Wilds reward composition: Pokémon XP total is exactly `3 × Player XP`, matching `6×wild level` versus `2×wild level`. No reward-formula drift was found.
- Full resolved sample: Player XP values are `2` on `163` Encounters (`54.9%`), `4` on `95` (`32.0%`), `6` on `39` (`13.1%`). This is directionally consistent with authored Lv1/Lv2/Lv3 weights `50/35/15`; the sample does not justify changing level weights.
- Total observed rewards are Player XP `940` and Pokémon XP `2,820`. Current durable Player progression exactly reconciles to A `716 XP / Level 4` from `230` resolved Encounters and B `224 XP / Level 2` from `67`. Player Level currently grants no implicit combat/stat/unlock effect, so no concrete player-facing pacing failure can be inferred from the low Player levels alone.
- Starter Pokémon reward reconciliation is exact after the explicit Level-5 conversion baseline: A Bulbasaur received `2,148` Hunt XP + baseline `124` = current `2,272` / Level 13; B Cyndaquil received `579` Hunt XP + baseline `124` = current `703` / Level 8. Seven B Encounter rewards targeted another active Team member instead of Cyndaquil, explaining why B has 67 resolved Encounters but 60 Cyndaquil XP awards.
- Current cubic Pokémon curve plus observed average Wilds reward implies meaningful but not explosive growth. Evidence supports keeping the provisional `2×/6×` values during this PA-M4 review unless cross-metric/player-experience consultation identifies a specific progression target that they fail.

### Gate 4 — Ball / Potion / Revive source-sink economy

- Status: `PASS` for evidence derivation; one structural dependency is confirmed.
- The entire preserved item ledger reconciles exactly from the two original bootstrap grants (`100` Balls / `40` Potions / `10` Revive-25 combined), Hunt drops, and authoritative Hunt consumption:
  - Poké Ball: `100 + 35 drops - 115 capture spends = 20` current combined (`A=1`, `B=19`).
  - Basic Potion: `40 + 10 drops - 39 automation uses = 11` current combined (`A=0`, `B=11`).
  - Revive-25: `10 + 0 drops - 7 automation uses = 3` current combined (`A=2`, `B=1`).
- This exact reconciliation confirms no additional recurring Item source has contributed to these accounts. Repository search also finds no implemented player-facing shop/purchase/vendor/faucet; SPEC-014 intentionally left exact commodity prices/stock/faucets for downstream measured tuning.
- Wilds drop observations alone do **not** justify changing the authored RNG: Ball `35/297 = 11.8%` versus configured `15%`; Potion `10/297 = 3.4%` versus configured `5%`. Both are plausible finite-sample outcomes, and the current PA-M4 sample gives no evidence of an implementation bias.
- Descriptive Wilson 95% intervals are approximately Ball `8.6%..15.9%` and Potion `1.8%..6.1%`; the authored `15%` / `5%` values lie inside those intervals. These intervals document sampling uncertainty only and do not define future balance tolerances.
- Consumption is policy-dependent and therefore not an “organic demand rate.” Current policies intentionally retain A Potion reserve `0` / Revive reserve `2`, B Potion reserve `11` / Revive reserve `1`, and B Capture reserve `19`. Automation history contains `39` Potion uses (`34` in-Battle, `5` inter-Battle; `208 HP` applied) and `7` in-Battle Revives (`37 HP`); no post-Battle Revive application is present.
- Structural finding: the currently implemented loop has **finite bootstrap stock + sub-1:1 Hunt drops, but no recurring ordinary acquisition source**. That is compatible with SPEC-014's explicit “no 1:1 refill” principle, but it cannot sustain structural auto-capture indefinitely. The correct PA-M4 decision axis is a recurring ordinary faucet/stock model, not inflating capture probability or blindly raising the Wilds drop chance.

### Gate 5 — Combat attrition / Hunt endurance

- Status: `PASS` for evidence derivation; starter-parity conclusion is limited by individualization/policy confounders.
- All `40` preserved Hunts are open-ended Wilds runs and eventually terminalized `no_living`; none ended by Retreat. For an open-ended mode this terminal reason alone is not a failure-rate metric. The useful measure is how many resolved victories occur before attrition ends the run.
- The five pre-conversion A Level-1 Hunts resolved `0` Encounters, matching the historical starter-confrontation bottleneck that motivated the Human Level-5 amendment.
- After explicit Level-5 conversion, A has `19` Hunts / `230` resolved victories = `12.11` per Hunt; B has `16` / `67` = `4.19`. Endurance rises materially as the starter levels: A start-Level 5 averaged `9.5` wins (2 Hunts), Level 10 averaged `17`, Level 12 averaged `19`; B start-Level 5 averaged `2.5` wins (4 Hunts) and Level 8 averaged `9.5` (2 Hunts).
- A/B are **not controlled starter-parity samples**. A Bulbasaur and B Cyndaquil have different Species, IV/Genetic profiles (conversion evidence records Genetic Score A `54`, B `11`), different selected Move sets (Bulbasaur gained Vine Whip/Growl/Tackle at Lv5 while Cyndaquil retained Leer/Tackle because Ember was unavailable under current production support), and different Potion/Revive policy histories. The large A/B endurance gap therefore cannot be attributed safely to Species balance from these two accounts alone.
- Recent mature A validation Hunts resolved `17`, `21` and `19` Encounters before natural `no_living`, showing the loop becomes substantially more durable with progression; this argues against a global Wilds difficulty reduction based solely on terminal reason.
- Combat finding: the Level-5 amendment clearly fixed the observed zero-win Level-1 blocker, but **starter/loadout parity remains NEED MORE DATA** before any combat/content retune.

### Gate 6 — Encounter distribution sanity

- Status: `PASS` with an explicit Species-data limitation.
- Full 297-Encounter Level proxy from exact Player XP rewards yields Lv1/Lv2/Lv3 `54.9/32.0/13.1%` against authored `50/35/15%`; no practical anomaly is visible at this sample size.
- Historical public presentation tables contain zero Battles because that route remains disabled, and resolved Activity v1 does not persist opponent Species. Therefore there is no unbiased 297-row historical Species sample available from Activity alone.
- The best retained Species proxy is the 115 capture-attempt rows, whose capture policy had no Species condition. Their observed Species mix remains directionally close to authored weights, but Ball availability/reserves make this a **capture-eligible subset**, not a full Encounter census. PA-M4 must not retune Species weights from it.
- Encounter-distribution finding: **KEEP current level/species weights unless a future unbiased sample shows a concrete deviation or player-experience problem**.

### Gate 7 — Cross-metric balance synthesis

- Status: `PASS — PM SYNTHESIS + GSC/PXE ADVISORY COMPLETE`.
- The evidence does **not** support a broad numerical rebalance. Most current rules are behaving as authored; the strongest observed issue is a missing complementary system, not a wrong probability/formula.

| Axis | PM classification | Evidence-bounded rationale |
|---|---|---|
| Capture curve + Genetic/Ball chance composition | `KEEP` | `90/115 = 78.3%` success against mean frozen final chance `80.1%`; no material chance mismatch. |
| Wilds Species weights | `KEEP` | Capture-eligible Species subset is directionally close; no unbiased full Species census exists, so no retune is justified. |
| Wilds Level weights `50/35/15` | `KEEP` | 297 resolved Encounters proxy to `54.9/32.0/13.1%`; no practical anomaly. |
| Player/Pokémon XP `2×/6×` | `KEEP` | `297/297` rewards conform exactly; progression is meaningful and no feature-owned Player-Level target is currently being missed. |
| Wilds Ball drop `15%` | `KEEP` | Observed `35/297 = 11.8%` is not evidence to compensate for a missing external faucet; SPEC-014 explicitly says no 1:1 refill assumption. |
| Wilds Potion drop `5%` | `KEEP` | Observed `10/297 = 3.4%` is finite-sample-compatible; free PokéCenter prevents a hard healing lock. |
| Wilds Revive drop `0%` | `KEEP` for current Wilds | No Revive drop is an explicit accepted rule; scarcity is visible but no evidence currently establishes a required Wilds faucet. |
| Ordinary recurring Poké Ball acquisition | `CHANGE PROPOSAL` | Structural auto-capture consumed `115` Balls while Wilds dropped `35`; exact item ledger proves no other recurring source contributed. SPEC-014 already requires Poké Ball to be a commodity and left exact faucet/price/stock for downstream tuning. |
| Potion/Revive broader recurring acquisition | `NEED MORE DATA` | Current depletion is heavily policy/reserve-test dependent; PokéCenter changes the value of consumables from necessity to run-extension. Do not infer a shop/faucet quantity yet. |
| Global Wilds combat difficulty | `KEEP` | Level-5 conversion removed the zero-win Level-1 blocker; mature A runs reach ~`17–21` victories. `no_living` is the expected eventual terminal of an open-ended Hunt, not itself evidence of excessive difficulty. |
| Starter/loadout parity | `NEED MORE DATA` | A/B endurance differs sharply, but Species, Genetic Score/IVs, executable Moves and policy history are confounded. Controlled six-starter evidence is required before changing combat, moves or encounter difficulty. |
| Starter Level-5 baseline | `KEEP` | Explicit conversion moved A from five zero-win Lv1 runs to non-zero sustained progression; no evidence supports reversing/amending the accepted Level-5 fix. |

- Cross-metric feedback loop: structural auto-capture + high ordinary-species capture chance creates Ball demand near one Ball per eligible victory, while the Wilds Ball faucet intentionally returns far less than one Ball per Encounter. This is healthy **only if** the separate commodity-acquisition layer exists. In the current implemented slice it does not, so capture-enabled routine farming is **structurally unsustainable over the long run** without external acquisition; an individual finite run can of course receive above-average drops or stop capture before depletion.
- The authored steady-state arithmetic makes that structural dependency explicit: with Capture enabled/eligible on every resolved victory, one attempt consumes exactly `1.00` Ball while Wilds returns `0.15` Ball in expectation, for expected net drift `-0.85 Ball / resolved victory` before any external faucet. The ratio `50 / 0.85 ≈ 58.8` is an **illustrative deterministic supply-budget ratio**, not the exact expected stochastic stopping time of a Bernoulli-drop process; actual depletion varies with drop sequence, policy enablement and minimum reserve. Capture success probability does not materially reduce the per-attempt burn because failures also consume the Ball.
- The Ball shortage also distorts downstream metrics: when stock reaches reserve, capture attempts stop and ownership growth slows, while XP/combat progression continues. Raising the capture chance would barely change Ball demand because failed attempts already consume Balls; raising the Wilds drop rate enough to self-sustain would collapse the accepted separation between Hunt rewards and ordinary commodity supply.
- Therefore the only PM `CHANGE PROPOSAL` is **introduce a recurring ordinary Poké Ball acquisition source consistent with SPEC-014's commodity boundary**, while keeping the capture curve and current Wilds reward table unchanged. Exact source, cadence, stock, price/currency model and Great/Super/Ultra relationship are intentionally **not selected yet** pending GSC/PXE advisory and Human decision.
- Recommended controlled follow-up for starter parity: deterministic/in-memory or disposable-state comparison across all six Level-5 starters under matched individualization bands and identical Potion/Revive/Capture policy, with enough encounter seeds to separate Species/loadout effects from IV/Genetic variance. This is an evidence plan, not authorization to modify Moves/combat/content.

### Gate 8 — GSC / PXE Class-A advisory

- Status: `PASS` for advisory completeness; **not numerical implementation authorization**.
- GSC independently reviewed the exact-current evidence and agrees with the PM synthesis: `KEEP` the capture curve/Genetic/Ball chance composition, `2×/6×` XP, Wilds `15%` Ball / `5%` Potion / `0%` Revive, level/species weights and Level-5 baseline; `CHANGE PROPOSAL` only for the missing recurring ordinary Poké Ball source; `NEED MORE DATA` for Potion/Revive sustainable-rate tuning and controlled starter/loadout parity.
- GSC specifically rejects using `160 no_eligible_ball` rows as an organic shortage rate because B reserve `19` was deliberate validation configuration. It also rejects numerical faucet tuning from the present sample and recommends a separate versioned economy proposal calibrated across Encounter cadence, capture-policy/reserve behavior and the eventual gameplay-currency/source model.
- PXE independently reaches the same rule classifications. It confirms that the observed capture chance is healthy (`78.3%` actual versus `80.1%` mean frozen chance), the Wilds reward probabilities should not be inflated merely to self-sustain capture, and Potion/Revive depletion is too policy/reserve-dependent to establish a shortage while free PokéCenter remains available.
- SPEC-014 §11.11 already supplies the accepted product boundary for the Ball source: deterministic non-paid Ball sources must exist; Poké Ball is the baseline commodity and unlimited/effectively-unlimited ordinary NPC stock is allowed; Great may be a recurring ordinary purchase but must remain less economical for routine farming; Super is controlled non-paid; Ultra is scarce-but-recurring F2P. Exact Gold prices, stock quantities, refresh cadence and faucet/drop quantities remain downstream measured tuning.
- The current first-Pre-alpha implementation has no player-facing shop/vendor/currency faucet. Therefore the advisory does **not** pretend that an ordinary NPC purchase can be implemented by TASK-128 alone. The Class-A decision is whether to activate a separately versioned ordinary Ball-acquisition/economy task; its currency/source authority, access/unlock, stock/refresh, affordability/burn target and stronger-Ball relationships require explicit downstream definition.
- PXE's preferred conceptual default is an ordinary NPC commodity-stock model because it matches the already-approved SPEC-014 hierarchy. Alternative non-paid recurring sources (bounded activity/progression payout or another deterministic repeatable source) remain possible, but no source/cadence/price is selected without Human authority.
- Both consultants require controlled six-starter Level-5 comparison before any starter/combat retune. Recommended controls: matched IV/Genetic bands, production-supported move availability, identical automation policies, comparable deterministic Encounter/combat seeds and reporting of victories-to-terminal, HP/consumable use and XP. A/B preserved-account differences are insufficient to infer a Cyndaquil nerf/buff or global Wilds change.
- Advisory verdict: **READY to present the ordinary Poké Ball source as a Class-A change/dependency decision; NOT READY to choose numerical prices/stock/cadence or retune combat/XP/drops.**

### Gate 9 — Independent balance-evidence / provenance review

- Initial exact-evidence QA: `READY P0=0 / P1=0 / P2=2`, both P2 editorial only. The reviewer independently reconciled all requested arithmetic: Activity `297`; capture dispositions `115 attempts = 90 success + 25 failure`, plus `160 no_eligible_ball + 22 disabled`; Player XP `940`; Pokémon XP `2,820`; Level proxy `163/95/39 = 54.9/32.0/13.1%`; item ledgers Ball `100+35-115=20`, Potion `40+10-39=11`, Revive `10-7=3`; starter conversion/confounders and Species-subset limitation were explicit. Wilson sampling sanity was accepted.
- QA P2-1: Gate-7 status still said consultant review pending after Gate 8 had already closed GSC/PXE. Corrected to `PASS — PM SYNTHESIS + GSC/PXE ADVISORY COMPLETE`.
- QA P2-2: `50 / 0.85 ≈ 58.8` was too easily read as the exact stochastic expected stopping time. Corrected to an illustrative deterministic supply-budget ratio; the authoritative balance conclusion depends only on expected negative drift under capture-every-victory, not on that ratio being an exact depletion-time estimator.
- Independent provenance/Class-A audit: `READY P0=0 / P1=0 / P2=1`, with the same stale Gate-7 status as its only P2. The auditor confirmed the Level-5 conversion receipt and v1 provenance boundary; authoritative Activity/capture/item-use versus replay traffic separation; deliberate reserve/config exclusions; source-ledger arithmetic; SPEC-014 §11.11 supply hierarchy/downstream-tuning boundary; absence of an implemented recurring faucet; and that no accepted balance rule was silently redefined.
- Provenance audit further confirmed the resolved Activity source is idempotent/canonical by persisted Hunt+Encounter ordinal/provenance rather than replay request count, supporting the exclusion of checkpoint/claim retries from economy denominators.
- Both reviewers agree the **directional ordinary recurring Poké Ball acquisition dependency is ready for Human Class-A decision**, while numerical price/stock/cadence and starter/combat retuning are not evidence-ready.
- Final scoped QA delta after both wording corrections: `READY P0=0 / P1=0 / P2=0`. It confirms Gate-7/Gate-8 status is coherent and the `50/0.85` ratio is properly qualified without changing any metric or classification. No QA blocker remains for the directional Human Class-A dependency decision.
- Final provenance/Class-A delta: `READY P0=0 / P1=0 / P2=0`. The auditor re-confirmed the corrected exact-current task: conversion/gameplay/validation provenance remains separated; Activity/capture/item-use sources are identified; replay traffic is excluded from economy counts; SPEC-014 supply hierarchy and downstream-tuning authority remain intact; no accepted rule was redefined.
- Independent-review acceptance is therefore closed. No P0/P1/P2 remains in the PA-M4 evidence packet itself; unresolved items below are product decisions or explicitly scoped `NEED MORE DATA`, not evidence-integrity findings.

### Human PA-M4 decision packet — exact current recommendation

- **KEEP without numerical change:** capture curve + Genetic/Ball chance composition; Wilds Species weights; Wilds level weights `50/35/15`; Player/Pokémon XP `2×/6×`; Wilds Ball/Potion/Revive drop table `15% / 5% / 0%`; global Wilds difficulty; starter Level-5 baseline.
- **ACCEPT one Class-A change/dependency:** the first-Pre-alpha product needs a recurring ordinary Poké Ball acquisition path consistent with SPEC-014 §11.11. TASK-128 does **not** choose price, currency, stock, refresh cadence or exact source quantity. Preferred conceptual direction from PXE/GSC is ordinary NPC commodity stock/purchase, but the implementation task must first resolve the actual non-paid source/currency authority and calibrate it against measured burn.
- **NEED MORE DATA / no current rule change:** Potion/Revive recurring acquisition quantities; subjective Player/Pokémon XP feel; starter/loadout parity. Before any starter/combat retune, run a controlled six-starter Level-5 comparison with matched IV/Genetic bands, production-supported Moves, identical policies and comparable deterministic seeds.
- **PM milestone recommendation: `HOLD PA-M4`**, not because the current numerical rules failed, but because structural auto-capture has no implemented recurring ordinary Poké Ball source. Closing the balance pass while leaving that explicit SPEC-014 dependency unowned would make the first-Pre-alpha capture loop knowingly non-sustainable.
- Recommended next control action if the Human accepts this package: create **TASK-129 — Pre-alpha Ordinary Ball Supply & Commodity Acquisition Model** as a separate Class-A task under PA-M4. It should define the recurring source, any gameplay-currency authority, access/unlock, stock/refresh, affordability/burn target and Great/Super/Ultra relationship, then return through GSC/PXE/QA/Human acceptance. No implementation/deploy is implied by creating that task.
- Controlled six-starter evidence may proceed read-only/disposable in parallel under TASK-128 or a separately scoped evidence task; it must not delay the Ball-source model unless a later finding shows a direct dependency.
- Human Owner must explicitly choose Accept/Hold for the recurring Ball-source proposal and decide whether to follow the recommended `HOLD PA-M4` or instead accept PA-M4 with the supply gap as a known deferred limitation. PA-M5 remains gated in all cases unless separately opened.

### Human Owner PA-M4 decision

- Human Owner message: `Autorizado`.
- Recorded message timestamp: `2026-10-09T13:04:43Z`.
- Decision package accepted exactly as recommended:
  - `KEEP` all currently reviewed numerical rules and accepted balance values;
  - `ACCEPT` the recurring ordinary Poké Ball acquisition dependency as a required Class-A product/economy follow-up;
  - `NEED MORE DATA` remains in force for Potion/Revive recurring supply sizing, subjective XP feel and starter/loadout parity;
  - `HOLD PA-M4` until the ordinary Ball supply/acquisition model is defined and accepted;
  - `PA-M5` remains `GATED` and is not opened by this decision.
- At that decision stage, TASK-128 advanced from `ACTIVE` to `ACCEPTANCE` as an accepted balance-review/hold package and was **not yet DONE**: PA-M4 exit remained intentionally held and repository-history handback was separately gated.
- Human acceptance authorizes creation/activation of **TASK-129 — Pre-alpha Ordinary Ball Supply & Commodity Acquisition Model** as a separate Class-A control task. It does not authorize implementation, shop/currency runtime, item grants, price/stock/refresh numbers, deployment or migration.
- TASK-129 may resolve the ordinary Poké Ball source model and return its accepted Class-A package to TASK-128/PA-M4. TASK-128 remains the PA-M4 exit gate until the Human Owner later explicitly completes or continues to hold PA-M4.

### Human Owner PA-M4 exit decision

- Human Owner message: `Aprovaod` (interpreted as `Aprovado` in direct response to the explicit PA-M4 milestone-exit gate).
- Recorded message timestamp: `2026-10-09T14:31:50Z`.
- The Human Owner **accepts PA-M4 completion and the transition to PA-M5** after TASK-129 resolved the recurring ordinary Poké Ball source dependency with a complete accepted Class-A model.
- PA-M4 is therefore `COMPLETE`.
- PA-M5 becomes the `CURRENT` milestone, but remains **capability-gated**: this transition does not activate TASK-120, TASK-121, public CombatPresentation, eligible-Moves editing, deployment, production migration or any other deferred expansion capability.
- The existing `NEED MORE DATA` observations for Potion/Revive recurring supply sizing, subjective XP feel and starter/loadout parity remain recorded evidence, not PA-M4 exit blockers and not silent authorizations to retune those systems.
- At the PA-M4 exit decision stage, TASK-128 remained `ACCEPTANCE` until a separately authorized repository-history handback could move its lifecycle to DONE. That milestone decision by itself authorized no commit/push/merge/deploy.

### Repository-history handback

- Human Owner continuation message: `Continue`.
- Recorded message timestamp: `2026-10-09T17:31:23Z`.
- This continuation follows the explicitly stated next action: **close the repository-history handback for TASK-128 + TASK-129 before opening another PA-M5 capability gate**.
- TASK-128 therefore moves to `DONE`; PA-M4 completion and the Human-approved transition to PA-M5 are now eligible for canonical roadmap integration.
- The handback is documentation/control-plane only. It does not authorize Supply Depot runtime implementation, TASK-121 activation, database migration, public route enablement, deploy or production mutation.

## Completion rule

TASK-128 may reach ACCEPTANCE only after the read-only balance evidence packet, cross-metric synthesis, required GSC/PXE consultations for any proposed changes, independent review and Human balance decisions are explicit. It reaches DONE only after the separately authorized repository-history handback is complete. No PA-M5 capability is opened by TASK-128 automatically.
