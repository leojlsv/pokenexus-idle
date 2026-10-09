# TASK-129 — Pre-alpha Ordinary Ball Supply & Commodity Acquisition Model

## Metadata

- State: DONE
- Class: A
- Owner: PM / Architecture Coordinator (ChatGPT prime)
- Owner execution surface: ChatGPT prime
- Reviewer: independent QA / economy-evidence reviewer
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: independent economy/provenance reviewer
- Auditor execution surface: independent ChatGPT delegated reviewer
- Consultants: Gameplay Systems Consultant (GSC); Player Experience / Economy Consultant (PXE)
- Consultant execution surface(s): independent advisory assignments before Human acceptance
- Skills: `SK-PNX-PLAN`, `SK-PNX-BAL`, `SK-PNX-REPLAY`, `SK-PNX-OBS`
- Authority: Human-approved TASK-128 PA-M4 decision package; APPROVED SPEC-014 §11.10–11.12; integrated TASK-022/023/024/036/096/109/110/128 evidence
- Dependencies: TASK-022, TASK-023, TASK-024, TASK-036, TASK-096, TASK-109, TASK-110, TASK-128
- Control branch: `docs/TASK-128-129-history-handback` — repository-history handback only
- Control worktree: `.worktrees/TASK-128-129-history-handback`
- Control-plane location: canonical repository history after Human-approved PA-M4 exit handback
- Dedicated TASK-129 implementation worktree/branch: **not allocated**; implementation remains separately gated after this history handback
- Source baseline: canonical `main@b467cee` plus provisional TASK-128 accepted PA-M4 review state

## Objective

Define the missing **recurring ordinary Poké Ball acquisition model** required to make structural auto-capture sustainable without changing the accepted capture curve or converting Wilds into a 1:1 Ball refund loop.

This is a Class-A **product/economy model task**, not an implementation task. It must choose a player-understandable, non-paid ordinary Poké Ball source and define enough economic authority for a downstream implementation to proceed without guessing.

The task must remain consistent with SPEC-014:

- Poké Ball is the routine commodity tier;
- Great Ball may be recurring ordinary acquisition but must remain less economical than Poké Ball for routine farming;
- Super Ball uses controlled non-paid supply;
- Ultra Ball remains scarce-but-recurring F2P and not unlimited common-NPC stock;
- VIP Ball remains a separately controlled premium-currency exception and is not required for first-Pre-alpha ordinary supply;
- no guaranteed 1:1 Ball refund per Encounter;
- exact prices, stock, cadence and faucet quantities require measured tuning and Human acceptance.

## Human-authorized problem statement

TASK-128 measured:

- `115` ordinary Poké Ball capture debits across `297` resolved Encounters;
- only `35` Wilds Poké Ball drops;
- combined preserved ledger `100 bootstrap + 35 drops - 115 spends = 20 current`;
- no other recurring player-facing Ball source is implemented;
- capture chance itself is healthy (`90/115 = 78.3%` success versus mean frozen final chance `80.1%`);
- changing capture chance or inflating Wilds drop rate is **not** the accepted solution direction.

The Human Owner accepted this as a required dependency and explicitly held PA-M4 pending this model.

## Required Class-A decisions

1. **Ordinary source shape**
   - Select the first-Pre-alpha recurring non-paid source for Poké Ball.
   - Candidate family may include ordinary NPC commodity stock/purchase, deterministic repeatable activity/progression payout, or another explicit non-paid source consistent with SPEC-014.
   - PXE/GSC currently prefer ordinary NPC commodity stock conceptually, but this is advisory rather than already-selected authority.
2. **Gameplay-currency authority**
   - Decide whether ordinary purchase introduces/uses a gameplay currency.
   - If yes, define the owning currency/source/sink authority rather than inventing `Gold` as runtime state merely because SPEC-014 uses that downstream tuning term.
   - If no currency is introduced, define the repeatable non-paid entitlement/source precisely enough to avoid hidden free refill behavior.
3. **Access / unlock**
   - Decide when the source becomes available relative to bootstrap/HUB/Wilds.
   - Avoid a circular gate where players must spend the last Balls to regain access to Ball supply.
4. **Stock / refresh / cadence**
   - Decide unlimited/effectively-unlimited Poké commodity stock versus bounded stock/refresh.
   - Any bounded model must specify deterministic refresh semantics and offline/restart behavior.
5. **Affordability / burn target**
   - Define the target economic relationship between measured capture burn and ordinary acquisition.
   - Do not target exact self-sustain from Wilds alone; routine play should have a deliberate burn/earn loop rather than guaranteed replacement.
6. **Great Ball relationship**
   - If Great Ball is in first-Pre-alpha ordinary acquisition, it must remain materially less economical than Poké Ball for routine farming.
   - It must not become the universal default because its higher capture effectiveness is cheaper per successful capture under badly chosen pricing.
7. **Super / Ultra scope**
   - Decide whether first-Pre-alpha needs these tiers immediately or whether their accepted supply hierarchy remains deferred.
   - Ultra must remain recurring F2P eventually; this task must not use VIP availability to excuse absent F2P Ultra supply.
8. **Reserve / auto-capture interaction**
   - Model how minimum reserve and auto-use interact with ordinary supply so the player can intentionally conserve stock without hidden policy bypass.
9. **Offline / replay semantics**
   - Acquisition must have explicit deterministic/idempotent authority; retries/restarts cannot duplicate stock, currency or purchase results.
10. **UX truthfulness**
   - The player must understand source availability, price/stock/refresh and that auto-capture can consume Balls faster than Wilds replenishes them.

## Evidence / tuning requirements

- Use TASK-128's measured item ledger and Encounter/capture evidence as the current burn baseline, while preserving its reserve/policy caveats.
- Do not treat `160 no_eligible_ball` rows as organic shortage frequency.
- Build sensitivity scenarios across low/medium/high capture-attempt rates and plausible Encounter cadence rather than tuning to one A/B account.
- Compare at least:
  - always-on Poké auto-capture;
  - reserve-preserving capture policy;
  - mixed Poké/Great policy if Great is included;
  - offline/return catch-up periods;
  - fresh bootstrap stock and mature repeated-play stock.
- Any recommended price/stock/cadence must state the assumed earning/source rate that makes it meaningful.
- Do not change Wilds `15%` Ball drop merely to compensate for missing ordinary supply unless a later explicit Human decision supersedes the current KEEP classification.

## Explicit non-goals

- Implementing a shop/vendor/currency API/UI/database model in this task.
- Changing capture probability, Genetic modifiers, Ball effectiveness, Wilds Species/level weights, XP, Potion/Revive drops or combat.
- Monetization, VIP pack pricing or paid-currency implementation.
- Starter/loadout parity retuning; TASK-128 retains that as `NEED MORE DATA`.
- Opening PA-M5 or any deferred expansion capability.
- Production migration/deploy/public enablement.

## Acceptance criteria

- [x] Current SPEC-014 Ball hierarchy and TASK-128 burn evidence are reconciled without redefining accepted capture rules.
- [x] Human-facing ordinary Poké Ball source shape is explicitly selected.
- [x] Gameplay currency/source authority is explicit; no implicit `Gold` runtime is invented.
- [x] Access/unlock and anti-circular-progression behavior are explicit.
- [x] Stock/refresh/cadence semantics are explicit and restart/offline-safe by contract.
- [x] Affordability/burn target is defined from measured scenarios without requiring 1:1 Wilds refill.
- [x] Great Ball economics, if included, preserve Poké Ball as the routine economical choice.
- [x] Super/Ultra first-Pre-alpha inclusion/defer decision is explicit and remains F2P-consistent.
- [x] Auto-capture reserve and offline/replay implications are explicit.
- [x] GSC + PXE advisory reports no unresolved Class-A product/economy concern.
- [x] Independent QA/provenance review finds no unresolved P0/P1 and explicitly classifies limitations/P2.
- [x] Human Owner accepts the model before any downstream implementation task is activated.

## Initial status / Gate 1

- Status: `PASS — AUTHORITY BASELINE`.
- Human authorization: accepted via TASK-128 decision package at `2026-10-09T13:04:43Z`.
- Current allowed work: read-only authority reconciliation, option modeling, sensitivity analysis and advisory consultation.
- Current forbidden work: runtime implementation, item/currency grants, shop/vendor surfaces, DB migration, price/stock mutation, commit/push/merge/deploy without separate authorization.
- SPEC-014 §11.11 is the controlling authority: deterministic non-paid Ball sources are required; Poké Ball is a routine commodity; unlimited/effectively-unlimited ordinary NPC stock is allowed; Great may be recurring/unlimited but must remain less economical for routine farming; Super is controlled non-paid; Ultra is scarce-but-recurring F2P; there is no accepted 1:1 Encounter refill assumption.
- TASK-128's measured burn baseline remains authoritative for this model: `115` capture debits, `35` Wilds Ball drops and no other recurring source in the preserved accounts. This is evidence that a source is missing, not authority to alter capture probability or Wilds drop rates.
- Read-only PostgreSQL schema census found **zero** tables matching currency/wallet/shop/vendor/store/purchase concepts. Repository runtime search likewise found no implemented gameplay currency, wallet, vendor, purchase or shop domain/API/UI in `apps/` or `packages/`.
- SPEC-007 explicitly states that no monetization mechanic is currently accepted or implied. SPEC-014 uses `Gold prices` as downstream economy-tuning language, but no integrated runtime authority currently defines `Gold`, how it is earned, stored, spent or replayed.
- Therefore TASK-129 may not treat `Gold` as pre-existing. Selecting an ordinary NPC purchase model with gameplay currency would require TASK-129 to define the currency/product authority sufficiently for a downstream implementation task, or to split that authority into a separately accepted dependency.
- A no-currency source is also not automatically safe: a free deterministic refill/claim can neutralize the intended Ball sink if its cadence/quantity effectively produces one Ball per capture opportunity. Any no-currency candidate must still preserve deliberate long-run burn/earn pressure and explicit player-facing cadence.
- Gate-1 conclusion: the product decision is not merely "what should one Poké Ball cost?". The first decision is the **source architecture** and whether first-Pre-alpha introduces a gameplay-currency domain at all.

## Option model — source architecture selected

| Option | Model | Advantages | Primary risks / new authority |
|---|---|---|---|
| A | **Ordinary HUB/NPC commodity purchase with gameplay currency** | Closest to SPEC-014's intended Poké/Great commodity hierarchy; scalable to stronger Ball tiers; clear player agency and sink/source tuning. | Requires a new gameplay-currency authority: earning sources, wallet persistence, purchase replay/OCC, prices, access and sinks. `Gold` cannot be invented by label only. |
| B | **Deterministic HUB supply stock/claim without currency** | Smaller domain surface; can provide a reliable first-Pre-alpha ordinary source without adding wallet/currency architecture. | Refresh/quantity can become disguised 1:1 refill or stamina timer; weak long-term economy depth; must be explicit and restart/offline-safe. |
| C | **Repeatable progression/activity Ball grants** | Uses non-paid gameplay accomplishments; no wallet required; naturally ties supply to participation. | Lumpy availability; can create circular starvation if capture supply depends on success/progression that itself depends on Balls; harder to tune routine commodity access. |
| D | **Raise Wilds Ball drop until self-sustaining** | Minimal new product surface. | Rejected as default direction by TASK-128/GSC/PXE: collapses Hunt reward versus commodity-supply separation and approaches the withdrawn 1:1-refill model. |

- Human-selected first-Pre-alpha authority is **Option B now / Option A later**.
- Option B is the smallest first-Pre-alpha implementation surface because currency is explicitly deferred. It must be designed as a commodity-supply mechanism rather than a hidden free refill and is expected to be superseded or coexist under an explicit migration plan when the mature economy arrives.
- Option A remains the intended mature economy direction once gameplay currency, earn sources, wallet persistence and purchase/sink semantics are deliberately introduced through their own accepted authority.
- Option C is better treated as a supplementary faucet than the sole routine commodity source unless sensitivity analysis proves it cannot create capture-starvation loops.

## Sensitivity baseline — no target selected

- Under the simple always-eligible Poké auto-capture model, expected Ball drift before external supply is `-0.85 Ball / resolved victory` (`1.00` spend minus `0.15` expected Wilds drop).
- Let `F` be external ordinary Ball acquisition expressed as average Balls per resolved victory over a long interval. Expected drift becomes `-0.85 + F`.
- Illustrative scenarios only:
  - `F = 0.00` → `-0.85` Ball/victory;
  - `F = 0.35` → `-0.50` Ball/victory;
  - `F = 0.60` → `-0.25` Ball/victory;
  - `F = 0.85` → approximately neutral long-run mean stock before reserve/variance effects.
- These are **not** recommended faucet quantities. The desired burn/accumulation target is a Human/PXE product choice and must also account for capture OFF, reserves, stronger-Ball mix, non-victory outcomes and actual acquisition cadence.
- SPEC-014's earlier modeling references sustained Encounter cadence around `200–600/hour`; using that only as a sensitivity band, fully eligible capture would require external supply on the order of `170–510 Poké-equivalent Balls/hour` merely to make mean stock neutral. This demonstrates why source capacity and affordability must be designed together; it does not authorize those quantities or imply live sessions currently sustain that cadence.

## Source-architecture advisory — Human decision complete

- GSC and PXE both reject Option D (raising Wilds Ball drops as the primary fix), keep the current capture chance/drop rules, and agree that Option C should be supplementary rather than the sole routine commodity source.
- **GSC recommendation: Option A** — ordinary HUB/NPC Poké Ball commodity purchase, conditional on explicit Human acceptance of a minimal non-paid gameplay-currency domain now. Rationale: best long-term fit with SPEC-014 and cleanest path to Great/Super/Ultra hierarchy. GSC requires a reliable non-circular early earning source, authoritative wallet/source ledger, atomic idempotent purchase, and account-scoped replay/OCC before any price tuning.
- **PXE recommendation: Option B for first Pre-alpha** — visible deterministic bounded HUB Poké Ball supply/claim without currency, explicitly as a temporary/minimal slice. Rationale: there is currently no wallet/currency/shop domain, and adding one now substantially expands the PA-M4 dependency before solving capture starvation. B must be player-visible, available from initial HUB independently of capture success/remaining Balls, capped/bounded, deterministic, idempotent and restart/offline-safe, with no per-Encounter refund or hidden auto-credit.
- PXE views Option A as the stronger eventual economy once a real earn/spend loop is intentionally introduced. GSC accepts Option B only as a conscious short-term fallback if currency is deliberately deferred. Therefore the consultants disagree on **scope timing**, not on the long-term commodity hierarchy.
- Both require explicit migration/coexistence semantics if B precedes A so claimed/free first-Pre-alpha supply history is not silently reinterpreted when a later wallet/vendor economy appears.
- Both defer numerical faucet quantities, prices, stock/cadence, Great economics and stronger-Ball supply until after the source architecture is selected.

### PM recommendation resolved by Human Owner

- The Human Owner explicitly selected **`B agora / A depois`** at `2026-10-09T13:29:44Z`.
- First-Pre-alpha source architecture is therefore a versioned **Pre-alpha Supply Depot** in the HUB with **no gameplay currency**. No `Gold`, wallet or purchase runtime is introduced by this decision.
- The depot is available from the player's first normal HUB access after bootstrap and does **not** depend on capture success, current Ball quantity, Player Level, Hunt completion or spending the player's last Ball. This closes the circular-starvation risk at the access layer.
- The depot is **player-visible and explicit**: it must show that it is a bounded ordinary Ball supply mechanism, not a shop and not a per-Encounter refund.
- Supply is intentionally **bounded and deterministically refreshable**, with authoritative entitlement/claim state that survives restart/reconnect and prevents duplicate grants. At the source-architecture stage, exact allocation quantity, carry-over behavior and refresh period/trigger remained open Class-A tuning decisions; the later accepted numerical package below resolves the first-Pre-alpha target and epoch.
- Auto-capture minimum reserve remains authoritative: Supply Depot availability never bypasses reserve policy and never auto-spends or auto-claims on behalf of the player unless a later accepted UX contract explicitly authorizes such behavior.
- Offline time may advance a future deterministic refresh boundary only according to the eventually accepted cadence contract; it must not generate unbounded hidden stock or duplicate claims. Exact offline accumulation/carry-over semantics remain open with the numeric/cadence package.
- Option A remains the intended mature economy direction. Later migration must explicitly define whether the depot is removed, retained as a starter/catch-up entitlement, or coexists with vendor/wallet economy; historical depot claims are never reinterpreted as purchases.
- This decision resolves source shape, currency/no-currency authority and access/anti-circular behavior. It does **not** resolve numeric stock/cap/refresh cadence, Great/Super/Ultra first-Pre-alpha scope or affordability/burn target.

## Qualitative Supply Depot contract — PM/GSC/PXE recommendation; Human accepted below

- **Supply shape:** one versioned Player-scoped Depot entitlement for ordinary Poké Ball only. No Great/Super/Ultra/VIP grant is part of the first-Pre-alpha Depot.
- **Claim action:** explicit/manual HUB claim. The Depot never auto-credits on Encounter completion, Hunt terminal, login, offline return or Inventory depletion.
- **Top-up semantics:** a successful claim grants only the amount required to bring the player's ordinary Poké Ball Inventory up to a configured `targetQuantity`. It is not an additive fixed grant.
- **Above-target behavior:** if authoritative Inventory is already at or above `targetQuantity`, the claim surface is unavailable/no-op and **does not consume the current entitlement**. The Player may claim later in the same epoch if ordinary Poké Ball Inventory falls below target.
- **One entitlement per epoch:** once a positive top-up is committed for the current refresh epoch, no second Depot claim is allowed until the next epoch, even if the player immediately spends down to zero. This prevents the Depot from becoming a disguised per-Encounter or spend-triggered refund loop.
- **Refresh model:** deterministic server-owned epochs with an explicit player-visible next-refresh boundary. At this qualitative stage the exact epoch duration was intentionally deferred; the later accepted numerical package sets it to `10 minutes`.
- **No stacked missed epochs:** offline/restart time may move the Player into the current epoch, but missed epochs do not accumulate multiple claims. On return there is at most the single current-epoch entitlement.
- **No hidden carry-over stock:** the Depot does not maintain an ever-growing additive grant balance. Player Inventory itself remains uncapped by this feature; legitimately held surplus from drops/prior claims is preserved.
- **Atomicity/replay:** one accepted claim atomically validates entitlement + current Inventory, credits the exact top-up amount and consumes the current epoch entitlement. Same-key retry returns the same result; conflicting/stale claims fail/reload under the downstream OCC/idempotency contract. Restart/reconnect cannot duplicate a credit.
- **Reserve independence:** Depot claim does not read, change or bypass auto-capture `minimumReserve`. Reserve remains a future-spend rule only; claiming supply and spending supply stay separate authorities.
- **Recovery/HUB access:** the Depot remains usable during normal HUB management, including Solo-Hunt recovery, because access is not conditioned on starting or winning a Hunt.
- **First-Pre-alpha tiers:** Poké Ball only. Great/Super/Ultra acquisition remains deferred to the later A economy or another explicit Class-A source. SPEC-014's future Great-economics and recurring-F2P Ultra obligations remain intact.
- **B→A migration recommendation:** when mature Option A is later activated, Depot history/inventory is immutable. PM recommends retiring future recurring B refreshes prospectively rather than running two routine faucets indefinitely; A then becomes the ordinary recurring acquisition authority. Whether B retains a one-time catch-up/starter entitlement in the mature economy remains a separate future Human decision.

### Remaining qualitative Human choices before numerical tuning

- The two choices below are the **only remaining Human choices for this qualitative-contract stage**. They do not complete TASK-129: `targetQuantity`, epoch duration/trigger, burn/earn calibration and any final implementation/cutover parameters remain separate downstream Class-A decisions after this stage.

1. **Zero-stock lockout:** after the current epoch's positive top-up has been consumed and the Player spends to zero before refresh, should first-Pre-alpha simply wait for the visible next refresh (**recommended for the smallest contract**) or add a separately bounded emergency provision? GSC/PXE did not authorize an emergency faucet by inference.
2. **B→A retirement:** accept PM recommendation that recurring B refreshes stop prospectively when A becomes authoritative, preserving inventory/history, versus long-term coexistence of both routine faucets.

- GSC/PXE agree that exact `targetQuantity` and epoch duration must be tuned together after these qualitative choices. The broad sensitivity matrix shows why: neutral external need spans roughly `20..510 Balls/hour` across modeled `200..600 Encounters/hour` and `25%..100%` capture-attempt rates, so a fixed additive grant would be fragile.

### Human Owner qualitative Depot decisions

- Human Owner message: `Ok, siga com as recomendações`.
- Recorded message timestamp: `2026-10-09T13:40:24Z`.
- **Zero-stock behavior accepted:** after a positive Depot top-up has consumed the current epoch entitlement, spending ordinary Poké Ball Inventory to zero does **not** create an emergency refill. The Player waits for the already-visible next refresh boundary. This is an explicit first-Pre-alpha scarcity/friction choice, not an implementation omission.
- No emergency grant, hidden low-stock trigger, per-Encounter refill, reserve-sensitive exception or capture-failure compensation is authorized by this choice.
- **B→A migration accepted:** when mature Option A later becomes authoritative, recurring B refreshes stop **prospectively**. Existing ordinary Ball Inventory remains owned; historical Depot entitlements/claims remain immutable evidence and are never reclassified as purchases.
- Whether mature A later retains a separate one-time bootstrap/catch-up entitlement is still a future A-era Class-A decision and does not keep recurring B alive by default.
- These decisions close the qualitative-contract stage. They do **not** select `targetQuantity`, epoch duration/trigger or desired average burn/accumulation; those remain the next numerical Class-A package.

## Numerical tuning packet — PM recommendation after GSC/PXE advisory; Human accepted below

- Numerical modeling keeps all previously accepted rules fixed and varies only two Depot parameters: `targetQuantity` and refresh-epoch duration.
- Sensitivity grid uses SPEC-014's conceptual `200 / 400 / 600 Encounters/hour` range and capture-attempt rates `50% / 75% / 100%`. Wilds Ball supply remains fixed at its authored `15%` expected drop rate. These are modeling scenarios, not claims about current live throughput.
- Candidate comparison:
  - `50 / 10 min`: preserves bootstrap stock exactly at first HUB, but modeled zero-stock wait appears at high activity — about `1.2 min` at `400/h + 100% attempts`, `1.7 min` at `600/h + 75%`, and `4.1 min` at `600/h + 100%`.
  - `75 / 10 min`: first-HUB top-up from bootstrap `50` would be at most `+25`; no modeled zero-stock interval for `200–600/h` through `75%` capture-attempt rate or for `400/h + 100%`; only the extreme `600/h + 100%` case depletes before refresh, with about `1.2 min` visible wait.
  - `100 / 15 min`: reduces claim frequency but immediately allows a bootstrap account to top up by `+50`; it survives all modeled cases except `600/h + 100%`, where modeled wait is about `3.2 min`.
  - `100 / 10 min`: survives every modeled scenario and therefore risks making the temporary no-currency Depot too close to a fully neutral routine faucet while also doubling the initial bootstrap stock on first claim.
- **PM recommendation: `targetQuantity = 75`, refresh epoch = `10 minutes`.**
- Recommended burn posture: routine capture policies up to roughly `75%` attempt coverage should normally remain supplied across the accepted high-end modeling cadence, while the extreme `600/h + 100%` always-capture scenario retains a short visible scarcity window instead of being fully neutralized. This preserves the accepted no-emergency/no-1:1 principles without making ordinary capture routinely unavailable.
- `75` is intentionally a temporary Pre-alpha tuning value, not a future vendor stock target or permanent inventory cap. The Depot top-up threshold does not cap Inventory; legitimate drops can carry the Player above 75 and then suppress unnecessary Depot claims until stock falls below target.
- `10 minutes` is a server-owned UTC-safe epoch duration in the proposed model. The downstream contract should derive `epochId = floor(serverTime / 10 minutes)` or an equivalent immutable epoch identity; client clock never controls eligibility.
- Refresh itself creates entitlement only; it does not auto-credit Inventory. The Player must return to HUB and explicitly claim.
- At this review stage the numerical values remained pending Human approval. GSC/PXE advisory and independent QA/provenance review were complete; no runtime implementation was authorized by this packet. Final Human acceptance is recorded below.

### GSC / PXE numerical advisory

- GSC: **RECOMMENDS `targetQuantity=75`, epoch=`10 minutes`**. Its modeled comparison finds `50/10` produces shortage in multiple high-demand cases, `100/15` creates a longer extreme shortage despite the higher target, and `100/10` removes modeled shortage across the envelope and therefore makes the temporary no-currency Depot too close to a fully sustaining faucet.
- PXE independently reaches the same recommendation: **75 / 10 minutes**. It views this pair as the best first-Pre-alpha compromise between claim friction, bootstrap continuity and bounded scarcity. It avoids modeled mean shortage in every reviewed scenario except `600 Encounters/hour + 100% capture-attempt rate`, where idealized stock reaches zero about `1.2 minutes` before the next refresh.
- Both consultants explicitly support the voluntary first-HUB `50→75` top-up of `+25` as part of the numerical package, subject to Human acceptance. It is not automatic and does not alter the canonical bootstrap grant itself.
- Both retain the qualitative constraints already accepted: manual claim, one positive claim/epoch, no emergency refill, no missed-epoch stacking, Poké-only, no currency, reserve independence, exact-key replay and prospective B retirement when A becomes authoritative.
- **Terminology correction:** the recommended posture is not "perpetual negative inventory drift." A player who returns to HUB and claims each eligible epoch may keep ordinary stock near the target over time. The intended sink/friction is consumption between claims, explicit HUB return/claim effort and occasional missed capture opportunities under extreme demand. This is still distinct from a guaranteed 1:1 per-Encounter refund because entitlement is time-bounded, player-claimed and capped by top-up-to-target semantics.
- Numerical advisory verdict: **GSC/PXE READY for `75 / 10 min` plus voluntary first-HUB `+25` top-up consequence; independent re-gate is recorded below before the Human Class-A decision.**

### Independent numerical QA / provenance re-gate

- Independent numerical QA: **READY — P0=0 / P1=0 / P2=0**. The reviewer independently recomputed the expected net Ball need as `encounterRate × (captureAttemptRate - 0.15)` for the complete `200 / 400 / 600 Encounters/hour × 50% / 75% / 100% capture-attempt` grid and reproduced the candidate depletion/wait results.
- For the proposed `75 / 10 min`, the idealized worst modeled case remains `600 Encounters/hour + 100% capture attempts`: expected net demand `510 Balls/hour`, depletion from target in `75 / (510/60) = 8.8235 min`, followed by approximately `1.1765 min` visible zero-stock wait before the next epoch. All other reviewed `75/10` scenarios remain above zero through the modeled epoch.
- QA explicitly bounds those numbers as deterministic expectation modeling, not an empirical SLA or guaranteed player outcome. The calculation assumes stock starts at target after an immediate eligible claim, constant encounter/attempt cadence, expected-value `15%` Wilds drops, zero reserve interference and no stronger-Ball mix; stochastic drops, manual HUB delay, reserve behavior and different starting stock can change realized waits.
- Independent provenance/Class-A audit: **READY — P0=0 / P1=0 / P2=0**. The proposed values do not alter bootstrap `50`, capture curve/chance, Wilds `15%` Ball drop, XP or other TASK-128 KEEP rules; they do not create an Inventory cap and do not introduce `Gold`, gameplay currency, wallet, shop or vendor authority.
- The audit confirms the numerical package preserves the accepted qualitative contract: manual top-up-to-target, one positive claim per server-owned epoch, above-target no entitlement consumption, no missed-epoch stacking, no emergency refill, reserve independence, exact-key replay/idempotency, Poké-only scope, prospective recurring-B retirement when A becomes authoritative and immutable historical B claims.
- The canonical bootstrap grant remains exactly `50 Poké Balls`. The proposed first-HUB `50→75` move is only a voluntary manual Depot claim of `+25` when eligible and must be explicitly accepted by the Human Owner together with `targetQuantity=75` and `epoch=10 minutes`.
- Final independent verdict: **READY for Human Class-A numerical decision.** Neither consultant advice nor independent review constitutes Human approval.

### Human Owner numerical acceptance

- Human Owner message: `Autorizado`.
- Recorded message timestamp: `2026-10-09T14:23:06Z`.
- **Accepted numerical authority:** `targetQuantity = 75 Poké Balls` and deterministic server-owned refresh epoch = `10 minutes`.
- **Accepted bootstrap interaction:** the canonical bootstrap grant remains exactly `50 Poké Balls`; from first normal HUB access, an eligible explicit/manual Depot claim may voluntarily top Inventory from `50→75` (`+25`) when the Player is still at 50. This is not an automatic bootstrap increase.
- The accepted `75` is a Depot top-up threshold, **not an Inventory cap**. Legitimate drops or other separately authorized sources may leave Inventory above 75; an above-target Depot attempt remains unavailable/no-op and does not consume the current epoch entitlement.
- One positive claim per epoch, no missed-epoch stacking, no emergency refill, no auto-credit, Poké-only scope, reserve independence, atomic exact-key replay/idempotency and prospective recurring-B retirement when A later becomes authoritative all remain part of the accepted model.
- The accepted tuning does not change the capture curve, Ball effectiveness, Wilds `15%` Poké Ball drop, Wilds Species/level weights, XP, Potion/Revive rules, starter bootstrap quantity or any other TASK-128 KEEP decision.
- At the numerical-acceptance stage, TASK-129 had a complete Human-accepted Class-A product/economy model and moved to `ACCEPTANCE`. **That acceptance alone did not authorize any downstream runtime implementation task, dedicated implementation worktree, repository-history integration, deploy or public enablement.**

### Repository-history handback

- Human Owner continuation message: `Continue`.
- Recorded message timestamp: `2026-10-09T17:31:23Z`.
- This continuation authorizes the previously stated immediate next action: integrate TASK-128/TASK-129 history so canonical project state reflects PA-M4 completion and PA-M5 entry.
- TASK-129 therefore moves to `DONE` at the **product/economy contract** level with the accepted Supply Depot authority preserved exactly: no-currency HUB source, Poké-only, manual top-up-to-target `75`, deterministic server epoch `10 minutes`, optional first-HUB `50→75 (+25)`, one positive claim/epoch, no missed-epoch stacking, no emergency refill, reserve independence, exact-key replay/idempotency and prospective B retirement when A becomes authoritative.
- This history handback does **not** authorize Supply Depot runtime/API/database implementation, item grants, migration/backfill, deploy, public enablement or mature A/vendor/currency implementation.

## Completion rule

TASK-129 may reach ACCEPTANCE only after the complete ordinary Ball supply/economy model is explicit, GSC/PXE-reviewed, independently reviewed and Human-accepted. It reaches DONE after the separately authorized repository-history handback. Implementation belongs to a separately activated downstream task/worktree after authority and repository-history gates are satisfied.
