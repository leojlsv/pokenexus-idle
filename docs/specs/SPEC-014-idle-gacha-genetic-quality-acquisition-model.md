# SPEC-014 — Idle/Gacha Genetic Quality & Acquisition Model

- Status: APPROVED
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Related ADRs: ADR-002, ADR-004, ADR-005
- Related specs: SPEC-003, SPEC-005, SPEC-007, SPEC-009, SPEC-013
- Related tasks: TASK-096, TASK-097, TASK-036, TASK-037, TASK-038, TASK-041

## 1. Problem

PokeNexus needs a durable Idle/Gacha collection layer that creates meaningful individual-Pokémon
variation without turning generation, Shiny state or one opaque multiplier into accidental power-creep
authority.

The model must remain useful when later Pokémon generations are added, preserve Species identity, keep
canonical Pokémon IVs understandable, and separate encounter rarity, capture difficulty, individual power
quality and visual/prestige rarity.

The Human Owner approved the **Genetics + Shiny Model A** slice on 2026-09-24 and then clarified that
auto-capture is a structural Idle mechanic. Because high-volume Idle sampling is itself the anti-frustration
mechanism, the MVP must not add Epic+/Apex/capture pity or hard-protection systems. On 2026-09-25 the
Human Owner also approved the final Genetic Profile catalog/acquisition model and center-weighted canonical
IV generation, Grade probabilities, Genetic Budget/stat semantics, Shiny `1/16384`, Ascendant Resonance,
capture curve/Genetic modifiers/Ball ladder, reserve-aware auto-capture, Species Research duplicate utility
and Genetics persistence/legacy policy. The exact-current consolidated packet cleared independent
QA/ARCH, deterministic replay/versioning audit, PXE and GSC review and received final Class-A Human Owner
acceptance on 2026-09-25T22:55:35Z.

## 2. Goals

- define one cross-generation Genetic Quality model for individual Pokémon;
- give the player one globally comparable Genetics score instead of a misleading within-tier decimal;
- derive a readable Grade and bounded power budget from that score;
- keep Genetic power separate from canonical IV storage and from Shiny;
- define Shiny as a prestige/collection axis with no statistical power;
- freeze IV/Genetics/Profile/Shiny as properties of the Encounter individual before Battle/capture;
- preserve deterministic replay/retry with no post-capture reroll;
- keep later acquisition-cadence tuning explicit rather than hidden inside TASK-036 implementation;
- provide authority for downstream capture/offline/API task decomposition.

## 3. Non-goals

This DRAFT does not authorize or finalize:

- production code, schema migration, deployment/cutover or public API payloads;
- exact standard Ball ItemIds/publication;
- exact Gold prices, shop stock quantities, refresh cadence, drop/faucet rates or starting grants;
- exact VIP pack size, premium-currency price or purchase cadence;
- any monetization beyond the narrow Human-approved deterministic VIP Ball consumable;
- paid randomized Species/Genetics/IV/Profile/Shiny acquisition;
- the exact TASK-038 auto-capture settings schema/presets/UX beyond the accepted semantic constraints;
- exact authored two-Profile mapping for each production Species/form;
- Species Research rewards/thresholds beyond the accepted monotonic count-only MVP utility;
- source-game Ball effects inferred from item names;
- trading/transfer/economy rules outside the accepted capture/Ball supply boundary.

Pity/protection for Epic+, Apex, capture or Shiny is not merely deferred: it is explicitly **rejected**
for this MVP unless reopened by a new Human-approved Class-A decision.

## 4. Accepted conceptual separation

The following axes are independent product concepts:

| Axis | Meaning | Direct power |
|---|---|---:|
| Encounter rarity | how often a Species/form appears | no |
| Capture difficulty | how hard an encountered target is to acquire | no |
| Canonical IVs | traditional per-stat individual variation | yes |
| Genetics | PokeNexus individual-quality/potential layer | yes |
| Shiny | visual rarity, collection and prestige | no |

Generation/content origin is not a quality tier. Adding later generations must not redefine what a given
Genetic Score or Grade means.

### 4.1 Encounter rarity is Hunt-authored, not globally fixed by Species

The Human Owner accepted that Species/form appearance probability is authored **per Hunt** through the
canonical Encounter table/weights owned by TASK-034-style content.

There is no global rule such as:

```text
Common / Uncommon / Rare / Epic / Legendary Species
→ one universal appearance percentage
```

for all Hunts.

The same Species/form may therefore be common in one Hunt, rare in another and absent from a third. This
is intentional progression/content authority rather than a Genetics rule.

The acquisition pipeline remains layered:

```text
Hunt Encounter weight
→ selects Species/form + encounter level

Encounter individualization
→ resolves IVs + Genetics + Profile + Shiny

Capture
→ applies Species/form capture difficulty + accepted Genetics capture modifier + Ball behavior
```

Encounter weight does not change Genetic Grade odds unless a future Hunt explicitly authors a different
Genetics distribution through accepted Class-A content authority. Genetic Grade never changes the
Species/form's Encounter weight.

Absolute Encounters per hour are not a static Species rarity value. They emerge from Hunt/combat cadence,
so economy analysis must distinguish:

```text
probability per Encounter
from
Encounters per unit of elapsed time
```

## 5. Human-accepted Genetics model

### 5.1 Player-facing Genetic Score

Every individual has one integer **Genetic Score** in the inclusive range:

```text
0..100
```

The score is globally comparable. A higher score always represents greater Genetic potential than a
lower score before Profile distribution.

The previously explored player-facing form `Rare 0.82` / `Apex 0.82` is rejected. No player-visible
`qualityRoll` exists in the accepted product language.

### 5.2 Genetic Grade

Grade is derived from Genetic Score:

| Genetic Score | Genetic Grade |
|---:|---|
| 0–39 | Normal |
| 40–64 | Uncommon |
| 65–82 | Rare |
| 83–94 | Epic |
| 95–100 | Apex |

`Refined` is not an accepted Grade name.

The ranges are contiguous and non-overlapping. Grade is presentation/classification authority; it does
not introduce a separate hidden multiplier.

### 5.3 MVP Genetic Grade acquisition distribution

The Human Owner approved the default MVP Genetic Grade acquisition distribution:

| Grade | MVP probability |
|---|---:|
| Normal | 55% |
| Uncommon | 28% |
| Rare | 12% |
| Epic | 4% |
| Apex | 1% |

These probabilities are the accepted default MVP authority. Runtime/economy validation must measure their
real elapsed-time outcomes together with encounter frequency, capture probability, Genetic capture
modifier, Ball availability, offline throughput and duplicate value, but may not silently retune them.
Any change requires reopening the Class-A decision. No pity/protection layer is part of this model.

Higher-difficulty or special content may later use an explicitly authored alternate Grade table only after
accepted authority for that content. It may not create a stronger meaning of the same Grade. `Apex`
remains the same quality band everywhere.

### 5.4 Genetic Budget

Genetic Score maps deterministically to a bounded **Genetic Budget**:

| Grade | Score | Genetic Budget |
|---|---:|---:|
| Normal | 0–39 | 0–10 |
| Uncommon | 40–64 | 11–20 |
| Rare | 65–82 | 21–34 |
| Epic | 83–94 | 35–50 |
| Apex | 95–100 | 51–70 |

Human-approved MVP rule: within one Grade, the score's relative position maps to the budget's relative
position:

```text
position = (score - scoreMin) / (scoreMax - scoreMin)
budget = round(budgetMin + position * (budgetMax - budgetMin))
```

Production uses the exact round-half-up integer/rational semantics defined in section 11.1; binary
floating-point behavior may not become gameplay authority.

`Genetic Budget` is an engine/detail concept. The primary player-facing value is `Genetics <score>` plus
Grade.

### 5.5 Genetic Profile

A **Genetic Profile** distributes the resolved Genetic Budget across:

```text
hp / atk / def / spa / spd / spe
```

Profiles do not create extra points. Integer allocation must consume exactly the full Budget with one
deterministic remainder/tie rule.

The Human Owner accepted the MVP Profile model on 2026-09-25. The later naming decision on the same date
supersedes the earlier `Balanced / Power / Focus / Fortitude / Resilience` labels while preserving the
same five Profile shapes and mechanics:

| Genetic Profile | Primary tendency |
|---|---|
| `Harmony` | broadly even allocation |
| `Might` | Attack + Speed |
| `Clarity` | Special Attack + Speed |
| `Endurance` | HP + Defense |
| `Resilience` | HP + Special Defense |

Each Species/form authors exactly **two compatible Profiles** from this catalog. One of those two is
selected `50/50` at Encounter individualization and then frozen on that individual.

The names intentionally describe genetic predisposition rather than RPG classes and avoid overlap with
canonical Pokémon Nature terminology.

### 5.6 Relationship to canonical IVs

Canonical IVs remain stored and validated independently in the accepted `0..31` range.

Genetics must never be persisted by increasing a canonical IV above 31 or by overwriting the original IV.
Conceptually, derived-stat resolution gains a separate Genetic contribution:

```text
derived-stat input
= canonical IV contribution
+ accepted per-stat Genetic Bonus
```

SPEC-003 currently defines combat v1 derived stats only from Base Stat + IV + Level and explicitly states
that no other hidden stat input exists. Production implementation of Genetics therefore requires an
explicit Class-A rules amendment/reconciliation before any runtime starts consuming Genetic Bonus.

The Human-approved MVP IV-generation distribution for newly encountered wild individuals is defined in
section 11.2: each stat independently uses `U[0,15] + U[0,16]`. The previous TASK-036 proposal of six
independent uniform `0..31` draws is superseded.

## 6. Encounter individual identity

An encountered Pokémon is one individual before capture. The accepted conceptual identity includes:

```text
Species / Form
Level
canonical IVs
Genetic Score
Genetic Grade (derived)
Genetic Profile
resolved per-stat Genetic Bonus
Shiny
```

Those properties must be frozen by server-owned deterministic authority at Encounter individualization,
before the Battle consumes stats/appearance.

Capture does not create a second roll of the individual. On success, the owned Pokémon is the same
individual that was encountered.

Consequences:

- reload cannot reroll Genetics, IVs, Profile or Shiny;
- retry cannot reroll Genetics, IVs, Profile or Shiny;
- capture failure does not create another copy or another roll;
- successful capture persists the frozen individual values rather than generating replacement values
  after success;
- exact producer/persistence/task ownership for Encounter individualization must be defined before
  TASK-036 can reach READY.

This does not reopen or mutate canonical TASK-035 history. TASK-096 owns the required downstream
authority/decomposition for the new individualization layer.

## 7. Reveal and UI language

Genetics exists before Battle but is revealed as collection information after successful capture.

Primary UI:

```text
RARE
Genetics 78
Might
```

Detailed UI may show:

```text
Genetics 78 / 100
Grade Rare
Profile Might

HP              +...
Attack          +...
Defense         +...
Special Attack  +...
Special Defense +...
Speed           +...
```

Do not expose implementation-only `qualityRoll`, RNG seed/state, interpolation position or hidden
multiplier language as the primary quality signal.

## 8. Human-accepted Shiny model

### 8.1 Independence

Shiny is independent from Genetics.

Shiny by itself does not:

- increase Genetic Score;
- change Genetic Grade;
- increase Genetic Budget;
- increase IVs;
- increase the stat ceiling;
- alter Species encounter rarity;
- alter capture probability merely because the Pokémon is Shiny.

The Human Owner accepted one explicit composite-rarity exception:

```text
Shiny && Genetic Grade == Apex
→ Ascendant
```

**Ascendant is not a sixth Genetic Grade.** Genetic Score remains `95..100`, Genetic Budget remains
`51..70` and the ordinary Apex stat ceiling remains unchanged.

Ascendant adds one exclusive strategic property: **Ascendant Resonance**.

- every Species/form already authors exactly two compatible Genetic Profiles;
- both compatible Profiles are frozen as the Ascendant individual's resonance set at Encounter birth;
- the ordinary `50/50` Profile draw still establishes immutable `birthProfile` and initial expression;
- outside active gameplay content, the player may select either frozen resonance Profile as the
  individual's expressed Profile;
- switching Profile redistributes the **same** immutable Genetic Budget through that Profile's accepted
  deterministic allocation weights; it never creates or removes Genetic points;
- once Hunt/Expedition/PvP/Battle or equivalent active content starts, the expressed Profile and exact
  six-stat Genetic Bonus vector are frozen into that activity snapshot until the content ends;
- no mid-Battle/mid-content Resonance switch exists;
- a non-Ascendant individual cannot switch away from its immutable birth Profile.

For replay/persistence, an Ascendant therefore has two immutable reproducible Profile allocations plus one
mutable **expressed resonance selection** outside active content. The mutable selection does not mutate
the individual's birth Genetics, Score, Budget, IVs or Shiny state.

The name **Ascendant** is deliberately separate from Pokémon Species classifications such as Mythical or
Legendary.

### 8.2 Model A capture behavior

The Human Owner explicitly selected **Model A**:

- a Shiny uses exactly the same accepted capture rule as its equivalent non-Shiny target;
- no Shiny capture bonus exists;
- no extra capture attempt exists;
- no guaranteed Shiny capture exists;
- no free Ball exists;
- if the accepted capture attempt fails, that Shiny individual is lost under the baseline rule.

Shiny is determined at Encounter individualization and is visually representable during the Encounter.
Its final base rate remains an open tuning decision.

Standing auto-capture is now the accepted Idle direction. Shiny does not receive a special queue,
protection or capture rule; an enabled auto-capture policy treats the frozen Shiny individual through the
same configured Ball policy and capture formula as the equivalent non-Shiny individual.

## 9. Evolution and future generations

Genetics and Shiny belong to the individual and survive evolution.

Evolution does not reroll:

- Genetic Score;
- Genetic Grade;
- birth Genetic Profile;
- frozen Ascendant resonance set, when applicable;
- Genetic Budget and the deterministic Profile allocation rules;
- Shiny.

New generations may add Species, forms, Moves, Abilities and generation-specific battle mechanics, but
do not automatically change Genetics ranges, Grade meaning or Ascendant eligibility/Resonance semantics.

Generation-specific mechanics such as future transformation/battle systems remain separate authorities;
they are not encoded as Genetics.

## 10. Acquisition-pressure guardrail

Overall collection pressure is multiplicative across independent systems:

```text
encounter availability
× capture success
× desired Genetics outcome
× desired IV/Profile outcome
× desired Shiny outcome
```

TASK-096 must evaluate those systems together before release tuning is frozen. A low probability in each
independent layer can create an unintended practically-unreachable combined target.

The accepted Genetics concept does not by itself authorize pity, normalization, rerolls, guaranteed
Grades, duplicate conversion or paid acceleration.

## 11. PM consolidated recommendation for final Human gate

This section is a **recommendation only** until explicitly accepted by the Human Owner. It reconciles the
fresh GSC/PXE advisories into one coherent MVP package.

### 11.1 Exact Genetic Score generation

Keep the approved Grade weights:

| Grade | Weight |
|---|---:|
| Normal | 55% |
| Uncommon | 28% |
| Rare | 12% |
| Epic | 4% |
| Apex | 1% |

Generation order:

1. roll Grade from the exact weights above;
2. roll one **uniform integer Genetic Score** inside that Grade's accepted score band;
3. derive Genetic Budget from that score using deterministic round-half-up integer/rational semantics.

Human-approved exact budget interpolation:

```text
offset = score - scoreMin
scoreSpan = scoreMax - scoreMin
budgetSpan = budgetMax - budgetMin

budget =
  budgetMin
  + floor((2 * offset * budgetSpan + scoreSpan) / (2 * scoreSpan))
```

This is round-half-up without binary floating-point dependence and is the authoritative MVP
Score-to-Budget mapping.

### 11.2 Canonical IV generation

Human-approved MVP rule: treat Genetics as the primary PokeNexus quality ladder and IVs as secondary
texture.

For each stat independently, in fixed order `hp, atk, def, spa, spd, spe`:

```text
iv = uniformInteger(0, 15) + uniformInteger(0, 16)
```

Properties:

- canonical IV range remains exactly `0..31`;
- mean remains `15.5` per stat;
- center-weighting reduces extreme six-stat IV variance compared with six independent uniform `0..31`
  draws;
- IVs remain frozen at Encounter individualization and are never rerolled by capture/retry/reload.

### 11.3 Genetic Profile catalog and acquisition

MVP uses exactly five authored horizontal Profile shapes:

| Profile | HP | Atk | Def | SpA | SpD | Spe |
|---|---:|---:|---:|---:|---:|---:|
| Harmony | 17 | 17 | 17 | 17 | 16 | 16 |
| Might | 15 | 25 | 15 | 10 | 15 | 20 |
| Clarity | 15 | 10 | 15 | 25 | 15 | 20 |
| Endurance | 20 | 15 | 25 | 10 | 20 | 10 |
| Resilience | 20 | 10 | 20 | 15 | 25 | 10 |

Each Species/form explicitly authors **exactly two compatible Profiles** from this catalog. One of those
two is selected `50/50` at Encounter individualization and then frozen.

This preserves build variation while capping the Profile chase at a simple `2x` factor instead of adding
an open-ended fourth rarity ladder.

Budget allocation:

1. compute `floor(budget * profileWeight / 100)` for each stat;
2. compute each stat's exact remainder;
3. distribute leftover points by descending remainder;
4. break equal remainders in fixed order `hp, atk, def, spa, spd, spe`.

The six allocated Genetic Bonus values must sum exactly to Genetic Budget.

### 11.4 Exact Genetic Bonus combat formula

Human-approved MVP rule: a new immutable combat-rules release must consume the resolved per-stat Genetic
Bonus `G` as a separate integer input:

```text
maxHp =
  floor(((2 * B + I + G) * L) / 100)
  + L
  + 10

otherStat =
  floor(((2 * B + I + G) * L) / 100)
  + 5
```

Where:

- `B` is the canonical Species/form Base Stat;
- `I` is the canonical IV in `0..31`;
- `G` is that stat's immutable non-negative Genetic Bonus;
- `L` is Level.

The six `G` values must be the exact deterministic Profile allocation of the individual's Genetic Budget;
their sum equals that Budget and therefore remains in `0..70`. No individual `G` may be negative or exceed
the individual's full Budget.

This formula deliberately treats Genetics as an additive stat input, **not** as an IV extension and not
as a percentage multiplier over the final stat.

SPEC-003's existing combat-rules release remains immutable for historical replay. Genetics may only
participate under a new explicitly versioned rules release; no existing TASK-095 rules artifact is
silently reinterpreted.

### 11.5 No Genetics pity; Species Research duplicate utility

The Human Owner explicitly rejected Epic+/Apex protection for the Idle MVP.

Genetic Grade remains purely probabilistic from the accepted Grade table:

```text
Normal    55%
Uncommon  28%
Rare      12%
Epic       4%
Apex       1%
```

There is:

- no Epic+ pity;
- no Apex pity;
- no soft-pity curve;
- no hidden counter that changes Grade odds after misses;
- no guarantee created by duplicate count, playtime or failed captures.

The reason is structural: Idle continuously produces independent Encounter samples over long periods.
Adding pity at ordinary thresholds would increase the long-run supply of high Grades rather than merely
protect an exceptional statistical tail.

Human-approved MVP duplicate utility is a visible permanent **Species Research** count keyed by the exact
captured Species/form identity. Every successful capture increments that identity's count by exactly one;
the first successful capture therefore establishes count `1`, and every later duplicate adds `+1`.

Species Research is monotonic collection progression only in this MVP. It is not consumed and grants no
stats, shards/fusion currency, Ball efficiency, capture bonus, Genetic/Grade odds, IV effect, Shiny odds
or combat advantage. Future Pokédex/cosmetic/achievement uses may consume the count as read-only
eligibility evidence, but any power/economy/RNG effect requires a new explicit Class-A decision.

Natural Grade examples remain:

- Rare+ (`17%`) P50/P90: about `4 / 13` successful captures;
- Epic+ (`5%`) P50/P90: about `14 / 45`;
- Apex (`1%`) P50/P90: about `69 / 230`.

### 11.6 Shiny rate

The earlier `1/1024` and `1/2048` calibration candidates are superseded after the Human Owner clarified
that expected sustained throughput is approximately `200–600 Encounters/hour` depending on K.O. cadence.

Human-approved MVP base rate:

```text
baseShinyRate = 1 / 16384
```

Shiny generation remains independent from Genetics and Model A capture behavior remains unchanged.
Shiny alone grants no statistical bonus; the accepted `Shiny + Apex → Ascendant` intersection adds
Ascendant Resonance without increasing Genetic Score/Budget or the Apex stat ceiling.

No Shiny pity or Shiny-specific capture protection exists in MVP.

At `1/16384`, a Shiny is seen at approximately:

- P50: `11356` eligible individualizations;
- P90: `37724` eligible individualizations.

At the expected sustained throughput:

| Encounters/hour | mean time/Shiny | P50 | P90 |
|---:|---:|---:|---:|
| 200 | 81.9 h | 56.8 h | 188.6 h |
| 400 | 41.0 h | 28.4 h | 94.3 h |
| 600 | 27.3 h | 18.9 h | 62.9 h |

The Human Owner accepted this elapsed-time target on 2026-09-25: a Shiny event is measured in **tens of
effective hunting hours**, not a routine multiple-times-per-session outcome and not a progression
requirement. The MVP base rate is therefore fixed at `1/16384`.

With default Apex probability `1%`, the accepted base rate yields:

```text
Ascendant = Shiny && Apex
P(Ascendant) = 1 / 1,638,400 eligible individualizations
```

At `200 / 400 / 600` Encounters/hour, the mean raw appearance interval for any Ascendant is approximately
`341 / 171 / 114` continuous days respectively, before capture failure, Species targeting or Profile/IV
preferences. Ascendant must therefore remain an optional account trophy/flexibility outcome and may never
be required for progression or baseline competitive viability.

### 11.7 Custom PokeNexus capture curve

Recommend a versioned monotone piecewise-linear basis-point curve over canonical `catchRate`:

| catchRate | Base capture chance |
|---:|---:|
| 3 | 8% |
| 25 | 15% |
| 45 | 25% |
| 75 | 35% |
| 120 | 50% |
| 190 | 68% |
| 255 | 82% |

For a `catchRate` between two anchors `(x0,y0)` and `(x1,y1)`:

```text
chanceBp =
  y0Bp
  + floor((catchRate - x0) * (y1Bp - y0Bp) / (x1 - x0))
```

The MVP curve is defined only for the accepted production domain `3..255`; out-of-domain values fail
closed until separately authored.

With the neutral Ball, approximate P50/P90 accepted attempts are:

| catchRate | Base | P50 | P90 |
|---:|---:|---:|---:|
| 3 | 8% | 9 | 28 |
| 25 | 15% | 5 | 15 |
| 45 | 25% | 3 | 9 |
| 75 | 35% | 2 | 6 |
| 120 | 50% | 1 | 4 |
| 190 | 68% | 1 | 3 |
| 255 | 82% | 1 | 2 |

### 11.8 Genetic capture modifier

Recommend that Genetics reduces the probability that a stronger individual enters the Collection without
changing Species/form `catchRate` or Encounter weight.

| Genetic Grade | Capture modifier |
|---|---:|
| Normal | 1.00 |
| Uncommon | 0.98 |
| Rare | 0.95 |
| Epic | 0.90 |
| Apex | 0.80 |

Use exact basis-point modifiers:

```text
Normal    10000
Uncommon   9800
Rare       9500
Epic       9000
Apex       8000
```

After resolving `baseChanceBp` from the Species/form catch-rate curve:

```text
geneticChanceBp =
  floor(baseChanceBp * geneticCaptureModifierBp / 10000)
```

Ball behavior is applied **after** this Genetics adjustment.

This modifier does not change:

- Encounter appearance probability;
- Genetic Grade probability;
- Shiny probability;
- canonical `catchRate`;
- the Genetic Score/Grade already frozen on the individual.

With the accepted default `55/28/12/4/1%` Grade distribution, the weighted average modifier is `0.9824`. Under a
neutral Ball this reduces aggregate capture throughput by only about `1.76%`, while specifically making an
Apex about `25%` more Ball-expensive to acquire than an otherwise equivalent Normal individual
(`1 / 0.80 = 1.25`).

Ignoring Ball nonlinearity and other selection effects, the Apex share among successful neutral-Ball
captures would move from `1.00%` of encountered individuals to approximately `0.81%` of successful
captures. This is intentional: high Genetics remains a rarer Collection asset without changing its
appearance rate.

Genetics remains hidden until successful capture, so auto-capture Ball selection may not inspect or branch
on Genetic Score/Grade. The modifier participates only inside authoritative capture resolution.

Because Genetics is hidden pre-capture, player-facing capture UI must not present `baseChance` as if it
were the exact final probability. MVP presentation must use one of:

- a clearly labeled **nominal/base capture chance** plus disclosure that hidden individual Genetics may
  reduce the final chance by up to the accepted Apex modifier; or
- a truthful min/max range computed from the accepted Genetic capture-modifier bounds and selected Ball.

The UI may reveal the exact final probability only after the individual Genetics is legitimately known.
It must never leak hidden Genetic Grade indirectly through a more precise pre-capture percentage.

### 11.9 No capture protection

The Human Owner explicitly rejected capture protection for the Idle MVP.

Every accepted capture attempt uses only:

```text
base chance from catchRate
→ apply Genetic capture modifier
→ apply authored Ball behavior
→ final capture chance
```

There is:

- no capture pity;
- no hard-success attempt number;
- no failed-attempt counter that changes future probability;
- no Shiny-specific protection;
- no Species/form protection.

This preserves capture failure as a real Ball sink and prevents a second hidden acquisition curve from
inflating owned-Pokémon supply or reducing Ball consumption.

### 11.10 Ball modifier philosophy

Human-approved MVP Ball ladder:

| Ball | ballPower | Product role | Primary supply boundary |
|---|---:|---|---|
| Poké Ball | 1.00 | routine/commodity capture | standard NPC, abundant |
| Great Ball | 1.25 | moderate risk reduction | standard/advanced NPC, materially costlier |
| Super Ball | 1.50 | important encounters | controlled non-paid progression/activities/stock |
| Ultra Ball | 2.00 | high-value opportunity preservation | scarce but recurring F2P supply; not unlimited common-NPC stock |
| VIP Ball (working name) | 2.25 | premium convenience/risk reduction | premium currency only |

The currently published seven Apricorn Balls must not inherit source-game behavior or generic strength
from their names. They remain unmapped to production capture behavior until their exact authored
modifiers are separately accepted.

Semantic composition after Genetics:

```text
geneticChance = baseChance * geneticCaptureModifier
finalChance = 1 - (1 - geneticChance) ^ ballPower
```

Ordinary Ball rules never produce an exact `100%` guarantee. Production implementation must materialize
this semantic rule as a versioned deterministic basis-point lookup/table or equivalent exact fixed
artifact; runtime binary floating-point `pow` is not gameplay authority.

Representative results before any UI rounding:

| chance after Genetics | Poké 1.00 | Great 1.25 | Super 1.50 | Ultra 2.00 | VIP 2.25 |
|---:|---:|---:|---:|---:|---:|
| 8% | 8.00% | 9.90% | 11.76% | 15.36% | 17.11% |
| 20% | 20.00% | 24.34% | 28.45% | 36.00% | 39.47% |
| 25% | 25.00% | 30.21% | 35.05% | 43.75% | 47.65% |
| 50% | 50.00% | 57.96% | 64.64% | 75.00% | 78.98% |
| 82% | 82.00% | 88.28% | 92.36% | 96.76% | 97.89% |

The VIP Ball is a narrow monetization exception, not authorization for paid Genetics/Shiny/Species/IV/
Profile manipulation or randomized paid acquisition. Buying the Ball grants a deterministic consumable;
the Ball acts only on the already-existing capture opportunity.

VIP Ball must not alter Encounter appearance, Species/form, Genetic Grade/Score, Profile, canonical IVs
or Shiny probability. It is deliberately only `2.25` versus the F2P Ultra Ball's `2.00`, so the premium
advantage is risk reduction/convenience rather than a new acquisition tier. Ultra remains the strongest
non-paid Ball and must remain regularly obtainable through gameplay.

### 11.11 Ball supply is an economy parameter, not a 1:1 refund

Before capture becomes player-visible, publish a standard Poké Ball item plus deterministic non-paid Ball
sources.

The earlier candidate of approximately one standard Ball per successfully completed Encounter is
withdrawn. Under auto-capture, a 1:1 guaranteed refill would largely neutralize the baseline Ball sink.

The release faucet must instead be calibrated from measured:

```text
completed encounters / hour
× auto-capture attempt rate
× selected Ball mix
× capture success/failure
× desired Ball inventory burn / accumulation
```

Human-approved Ball supply hierarchy:

- **Poké Ball:** baseline commodity; unlimited or effectively unlimited ordinary NPC stock is allowed;
- **Great Ball:** ordinary gameplay purchase may be recurring/unlimited, but price must preserve Poké Ball
  as the more economical routine-farming choice rather than making Great the universal default;
- **Super Ball:** controlled non-paid supply through progression, advanced NPC stock, activities or
  equivalent bounded sources; it is not intended as an unlimited commodity;
- **Ultra Ball:** scarce but recurring **F2P** supply through gameplay/rewards/limited stock. It must not
  be an unlimited common-NPC purchase. Scarce means strategically conserved, not practically inaccessible;
- **VIP Ball:** premium-currency-only consumable. Its exact pack size/price/purchase cadence is downstream
  monetization tuning, but availability may not be used to justify starving F2P Ultra supply. VIP supply
  must be cost/cadence controlled so routine always-VIP farming is not the intended economic equilibrium.

Exact Gold prices, stock quantities, refresh cadence, drop rates and premium price are downstream economy
tuning. They must be calibrated against measured Encounters/hour and Ball burn. A stronger Ball sold for
ordinary gameplay currency must not become strictly more economical than Poké Ball for routine captures;
its value is higher opportunity preservation, not cheaper farming.

### 11.12 Auto-capture is the Idle acquisition baseline

The Human Owner clarified that **auto-capture is a structural Idle mechanic**.

The accepted product direction therefore supersedes the earlier manual-only/offline-queue candidate:

- no 128-opportunity queue is required as an anti-loss/protection mechanism;
- no pending-opportunity accumulation is required merely because the player is offline;
- an enabled auto-capture policy is a standing player authorization, not an offline policy inventing a
  new command;
- each successfully completed eligible Encounter may produce at most one automatic capture attempt;
- the automatic attempt uses the exact frozen Encounter individual and the player's accepted configured
  Ball policy;
- an accepted automatic attempt consumes exactly one Ball whether capture succeeds or fails;
- if the configured Ball policy cannot resolve an available eligible Ball, no Ball is fabricated and no
  protection/guarantee is created;
- auto-capture uses the exact same capture probability as a manual attempt would use for that Encounter
  and Ball;
- Shiny receives no special capture protection under auto-capture;
- retry/replay of the same auto-capture correlation cannot consume a second Ball or produce a second
  outcome.

Exact configuration/fallback UX and persistence belong to downstream auto-capture orchestration design.
SPEC-013's current explicit-command/one-pending baseline therefore requires a forward Class-A amendment;
canonical TASK-035 history is not rewritten.

The earlier `enabled + ordered ballPriority[]` recommendation is no longer sufficient once stronger and
premium Balls exist. Human-approved semantics:

1. auto-capture has one global `enabled` switch;
2. each capture Ball has an explicit auto-use permission and an integer minimum reserve;
3. player-authored ordered rules may select/fallback among enabled Balls using only already-visible,
   frozen Encounter facts such as Shiny, Species/form, Hunt/zone and public catch difficulty;
4. hidden Genetics/Grade/Score/Profile may never participate in Ball selection;
5. a Ball is auto-eligible only when inventory quantity remains at or above its configured reserve after
   the one-unit debit;
6. **VIP Ball auto-use defaults OFF** and it is never an implicit fallback when ordinary Balls run out;
7. VIP Ball can enter auto-capture only through explicit player authorization for an eligible visible rule
   such as Shiny;
8. if no eligible Ball resolves, no attempt/resource/protection queue is fabricated;
9. the selected Ball is frozen into the attempt intent before resolution; replay cannot choose a different
   Ball, debit twice or reroll the outcome.

Safe default policy is conservative: routine auto-capture may use the baseline Poké Ball; stronger Balls
and VIP auto-use require explicit player opt-in/configuration. Downstream TASK-038 owns the exact settings
schema, presets and UX without changing these Class-A semantics.

Because an enabled auto-capture policy intentionally closes an opportunity when no Ball is eligible,
TASK-038 UX must disclose this irreversible consequence **before the player enables or saves** an
auto-capture configuration:

- an encounter not covered by any eligible Ball/rule, or blocked only by stock/minimum-reserve rules, is
  permanently lost when that successful Encounter reaches the auto-capture boundary;
- this includes a visible Shiny; there is no silent manual fallback, later recovery queue or protection;
- configuration changes affect only future authoritative logical intervals and cannot retroactively
  recover or re-evaluate already resolved opportunities.

Where practical, the configuration UI should identify visible-condition/rule/reserve gaps before save so
the player can see which known categories may close without a capture attempt. This warning is a
truthfulness requirement, not a protection mechanic.

Because VIP Ball consumes a paid resource, its UI must use the same truthful chance disclosure required
by section 11.8 and must never imply a guarantee. The player must be able to see the Ball's effect/range
before authorizing manual use or enabling an auto-use rule.

When auto-capture is disabled, the existing explicit/manual pending-decision path may remain available
through the forward SPEC-013 amendment. Manual and automatic paths must still share the same
one-accepted-attempt-per-Encounter rule and capture formula.

### 11.13 Combined chase examples

Under the recommendation:

- natural Rare+ remains common enough to be normal account progression (`17%`);
- Epic+/Apex remain natural long-tail outcomes with no pity;
- exact Profile targeting adds at most a `2x` factor;
- Shiny remains an independent visual/collection axis with no Shiny pity; Human-approved MVP calibration is
  `1/16384` for expected `200–600 Encounters/hour`;
- `Shiny + Apex` is the Human-approved composite rarity **Ascendant**, with Ascendant Resonance but no
  higher Genetic Score/Budget/stat ceiling;
- no progression gate may require Shiny, max Genetic Score, exact Profile, perfect IVs or their
  intersection.

## 12. Required downstream reconciliation before implementation

Before Genetics/Shiny can reach production implementation:

1. SPEC-003 now carries an APPROVED forward amendment recording the Human-approved section 11.4 Genetic
   contribution. TASK-097 must materialize it only through a new immutable combat rules release; existing
   combat-v1/production rules artifacts remain unchanged.
2. The Human-approved SPEC-005 forward amendment defines the persistence authority for newly acquired
   Genetics/Shiny/Ascendant Pokémon: six canonical IVs, Genetic Score, frozen ordered two-Profile set,
   immutable birth Profile, Shiny, individualization-rules version/provenance and mutable expressed
   Profile. Grade, Budget, Ascendant and six Genetic Bonuses are derivable/version-bound rather than
   independent mutable truth.
3. TASK-097 must individualize exactly once at the transition from an exact TASK-035
   `PendingEncounterSelection` to the opponent Battle snapshot, before Battle initialization. The
   individual is bound primarily to that stable pending-selection token, not to a replaceable Hunt-run
   identity: retreat/restart/reload of the same unresolved token must reproduce/reuse the same individual.
   EncounterId/ordinal remain execution provenance. Individualization uses its own immutable rules identity
   and domain-separated server-owned deterministic root without consuming TASK-035 selection RNG or Combat
   Engine RNG. That root includes non-exportable server-only deterministic authority so visible pending
   data cannot be used to derive hidden Genetics; successful completion must durably bind the exact
   individualization snapshot/provenance into the pending-capture/attempt handoff before/atomically with
   consuming the pending-selection token.
4. SPEC-013/downstream Hunt authority must be amended for standing auto-capture authorization and exact
   offline Ball-consumption semantics without reopening canonical TASK-035 history.
5. TASK-036 must consume the frozen individual snapshot instead of rolling IV/Genetics/Shiny after a
   successful capture.
6. TASK-037 must consume the accepted offline acquisition/opportunity semantics.
7. TASK-038 public/persistence orchestration must freeze only after those authorities are accepted.

Legacy owned-Pokémon rows, pending Encounter selections/checkpoints **and pending-capture decisions** may
not be assigned fabricated Genetics/Shiny/individualization values by migration inference.
The accepted migration gate is fail-closed: before new fields become mandatory, the authoritative
`pokemon_instances` relation must be locked/proven empty of pre-Genetics durable rows. Any existing row
requiring conversion stops the migration and requires a separate Human-approved legacy policy.

## 13. Current Human-gate decisions

There is no remaining numerical acquisition-rate Human gate in this section. The Human Owner accepted
`baseShinyRate = 1/16384` on 2026-09-25 for expected `200–600 Encounters/hour`.

Lifecycle/provenance and downstream TASK-097/036/037/038 ownership are now reconciled in the forward
amendments. Class-A closure still requires fresh exact-current independent QA/ARCH/PXE re-gates and final
Human acceptance. Duplicate utility and SPEC-005 persistence/legacy authority were Human-approved on
2026-09-25.

The following are **downstream content/tuning decisions**, not blockers to accepting the Class-A model:

- exact authored two-Profile mapping for every production Species/form;
- exact Ball ItemIds/publication and exact versioned basis-point lookup/table that realizes the accepted
  `ballPower` semantics without runtime floating-point authority;
- exact Gold prices, stock quantities, refresh cadence and non-paid Ball faucet quantities after measured
  auto-capture consumption;
- exact VIP pack size, premium price and purchase cadence;
- exact TASK-038 auto-capture settings schema, presets, visible-condition thresholds and UX;
- later-Hunt alternate Grade probability tables;
- any monetization beyond this Human-approved deterministic VIP Ball consumable; paid randomized
  Genetics/Shiny/Species/IV/Profile acquisition remains unauthorized unless separately approved.

## 14. Human decision record

Accepted by the Human Owner on 2026-09-24:

- Genetic Score `0..100` as the single player-facing comparable quality number;
- Grades `Normal / Uncommon / Rare / Epic / Apex`;
- removal of player-facing `Quality 0.xx` and removal of `Refined`;
- bounded Genetic Budget model and Profile distribution concept;
- Genetics separate from canonical IVs and separate from Shiny;
- no direct whole-stat rarity multiplier;
- Genetics/Shiny preserved across evolution and generations;
- Encounter-birth/frozen-individual model with no retry/reload reroll;
- Shiny as prestige/collection only in the original Model-A slice; the later 2026-09-25 Ascendant
  amendment preserves no direct Shiny stat bonus while adding the narrow `Shiny + Apex` Resonance case;
- Shiny **Model A** capture behavior;
- auto-capture as a structural Idle mechanic;
- **no Epic+ protection, no Apex protection and no capture protection** in the Idle MVP;
- Species/form appearance rarity is authored per Hunt/Encounter table rather than by one universal
  Species-rarity percentage.

Accepted by the Human Owner on 2026-09-25:

- final Genetic Profile catalog names:
  `Harmony / Might / Clarity / Endurance / Resilience`, superseding the earlier same-day labels
  `Balanced / Power / Focus / Fortitude / Resilience` without changing Profile weights;
- exactly two compatible Profiles per Species/form;
- `50/50` Profile selection at Encounter individualization;
- Profile as immutable genetic predisposition rather than a power tier or RPG class;
- deterministic full-Budget Profile allocation with no created/lost Genetic points.
- canonical IV generation for every stat as
  `uniformInteger(0,15) + uniformInteger(0,16)`, independently per stat;
- canonical IV range remains `0..31` with mean `15.5`, intentionally center-weighted so IV remains a
  secondary individual-variation layer rather than competing with Genetics as the primary quality ladder;
- all six IVs are frozen at Encounter individualization before Battle and cannot reroll on capture,
  retry or reload.
- Genetic Budget bands are fixed for MVP as
  `Normal 0–10 / Uncommon 11–20 / Rare 21–34 / Epic 35–50 / Apex 51–70`;
- exact Genetic Score → Genetic Budget mapping uses the section 11.1 integer/rational round-half-up
  interpolation, with no binary floating-point authority;
- Grade remains a readable classification of Score; Score/Genetic Budget carry the continuous quality
  distinction within one Grade, so no extra `Apex+`-style tier is introduced.
- Genetic Bonus combat input is Human-approved as
  `2 * BaseStat + IV + perStatGeneticBonus` inside the existing level/stat formulas;
- Genetic Bonus remains a separate immutable additive input: it does not extend IV beyond `0..31` and
  does not become a percentage multiplier over the final stat;
- HP uses
  `floor(((2 * B + I + G) * L) / 100) + L + 10` and each other derived stat uses
  `floor(((2 * B + I + G) * L) / 100) + 5`;
- this Genetic-aware formula must ship only in a **new immutable combat rules version**. Existing
  SPEC-003/TASK-095 historical rules and replay semantics remain unchanged.
- default MVP Genetic Grade acquisition probabilities are fixed at
  `Normal 55% / Uncommon 28% / Rare 12% / Epic 4% / Apex 1%`;
- Grade acquisition is independent of Species/form Hunt appearance weights; a Hunt selects Species/form
  first, then Encounter individualization applies the accepted Grade table unless a future explicitly
  authorized content rule says otherwise;
- there is no Grade pity/protection. Any future retuning of the default table requires a new Class-A
  decision rather than silent economy adjustment.
- custom PokeNexus capture curve is fixed for MVP at
  `3→8%, 25→15%, 45→25%, 75→35%, 120→50%, 190→68%, 255→82%` with deterministic
  piecewise-linear basis-point interpolation;
- Genetic capture modifiers are fixed at
  `Normal 1.00 / Uncommon 0.98 / Rare 0.95 / Epic 0.90 / Apex 0.80`, applied after the
  Species/form catch-rate curve and before Ball behavior;
- no capture pity/failure protection is introduced; Genetics remains hidden pre-capture and may not
  influence automatic Ball selection;
- Ball ladder/power semantics are fixed at
  `Poké 1.00 / Great 1.25 / Super 1.50 / Ultra 2.00 / VIP 2.25` using the accepted
  failure-exponent composition semantics;
- Ball supply hierarchy is accepted: Poké is the routine commodity; Great may be a recurring ordinary
  purchase but must remain less economical than Poké for routine farming; Super uses controlled non-paid
  supply; Ultra is scarce-but-recurring F2P and not unlimited common-NPC stock; VIP is
  premium-currency-only;
- VIP Ball is an explicitly narrow deterministic-consumable monetization exception. It may reduce capture
  risk but may not alter Encounter/Species/Genetics/Profile/IV/Shiny generation, and it may not be used as
  justification to starve F2P Ultra supply;
- auto-capture uses explicit per-Ball auto-use permission, minimum reserve and ordered rules/fallbacks
  based only on visible frozen Encounter facts; hidden Genetics cannot branch Ball selection;
- VIP auto-use defaults OFF, is never an implicit fallback when ordinary Balls run out, and requires
  explicit player authorization for an eligible visible-condition rule;
- if no eligible Ball resolves, no attempt/resource/protection queue is fabricated; once selected, the
  Ball is frozen into the attempt intent and retry remains idempotent;
- exact Gold prices, stocks, refresh cadence, Ball faucet quantities, VIP pack size/price/cadence and
  TASK-038 settings/presets remain downstream measured tuning and may not silently change these accepted
  Class-A semantics.
- composite rarity name **Ascendant**, explicitly chosen to avoid conflict with Pokémon Mythical/Legendary
  Species classifications;
- Ascendant eligibility is exactly `Shiny && Genetic Grade == Apex`; Ascendant is not a sixth Genetic
  Grade and does not increase Genetic Score, Budget or the Apex stat ceiling;
- **Ascendant Resonance** allows an Ascendant to express either of the two compatible Profiles frozen at
  Encounter birth, redistributing the same Genetic Budget through the selected Profile;
- the original `50/50` Profile draw remains immutable `birthProfile`/initial expression; Ascendant
  Resonance changes only the currently expressed Profile outside active content;
- Hunt/Expedition/PvP/Battle snapshots freeze the expressed Profile and exact Genetic Bonus vector for the
  full activity; no mid-content Resonance switching exists;
- non-Ascendant individuals remain permanently bound to their birth Profile;
- Shiny MVP base rate is fixed at `1/16384`, implemented as one unbiased `U[0,16383]` draw at Encounter
  individualization with Shiny iff the draw is `0`; this rate is calibrated for expected sustained
  throughput of `200–600 Encounters/hour`, with no Shiny pity/protection;
- Species Research is the Human-approved MVP duplicate utility: every successful capture increments one
  permanent count for the exact Species/form identity, with no consumption, power, economy or RNG effect;
- SPEC-005 persistence authority stores/reproduces the immutable individual facts without duplicating
  Grade/Budget/Ascendant/Genetic Bonus as independent mutable truth, and legacy migration fails closed if
  any pre-Genetics durable Pokémon Instance requires conversion.

The `55/28/12/4/1%` Grade table, Genetic Budget bands, exact Score→Budget interpolation and Shiny
`1/16384` base rate are now Human-approved MVP rules. Elapsed-time/economy validation remains required
to measure outcomes, not to silently redefine these accepted probabilities.

## 15. Acceptance

The exact-current reconciled Class-A packet has cleared independent review:

- QA/ARCH: **READY — P0/P1/P2/P3 = 0/0/0/0**;
- Independent Auditor replay/versioning: **PASS — 0/0/0/0**;
- PXE: **READY — 0/0/0/0**;
- GSC: **ADVISORY PASS — 0/0/0/0**.

The Human Owner gave **final consolidated Class-A acceptance on 2026-09-25T22:55:35Z**.

SPEC-014 is therefore **APPROVED** as product/rules authority. This semantic acceptance does **not**
authorize production implementation, runtime cutover, schema migration, deployment, commit, push, merge
or any other Git-history mutation. Those remain separate downstream gates.
