# SPEC-006 — XP, Level & Progression Rules v1

- Status: APPROVED
- Accepted by Human Owner: 2026-09-18
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Architecture: ADR-004, ADR-005
- Static-data/version envelope: SPEC-002
- Pokémon instance baseline: SPEC-005

## 1. Purpose

Define the first authoritative XP/Level progression contract for PokeNexus, covering the bounded Pokémon progression track and the distinct uncapped Player Level track, without stealing reward amounts, Hunt allocation, reward-ledger, item, API, unlock-consumer or evolution semantics from later owning tasks.

## 2. Existing accepted constraints

- Level remains an integer in `1..200`.
- `200` remains the global hard Level Cap; new regions/generations do not raise it automatically.
- Any future cap change requires explicit Human Owner acceptance.
- The Pokémon Level cap applies only to Pokémon. Player Level is a distinct progression domain and has no gameplay hard cap.
- Combat consumes resolved **Pokémon Level** but never directly mutates durable Pokémon or Player progression.
- `baseExperience` and `growthRate` are factual static-data fields, not executable rules merely because they exist.
- Pokémon `rowVersion` remains the aggregate concurrency token.

## 3. Accepted Pokémon progression state

Persist cumulative Level XP:

```text
level: 1..200
totalExperience: 0..7_999_999
rowVersion: existing Pokémon OCC token
```

The invariant is:

```text
level = highest L in [1,200] where xpFloor(L) <= totalExperience
```

`level` and `totalExperience` are one aggregate state and must mutate atomically.

## 4. Accepted Level curve v1

Curve identity: `pokenexus.level-cubic.v1`.

```text
xpFloor(L) = L^3 - 1
```

Examples: Level 1 = 0 XP; 10 = 999; 50 = 124,999; 100 = 999,999; 200 = 7,999,999.

For `L < 200`, the floor-to-floor cost is `3L^2 + 3L + 1`. All arithmetic is exact integer math.

All Species/forms use this same v1 curve. Source `growthRate` remains factual/non-executable. Source `baseExperience` does not directly grant XP; an owning reward/content spec may adopt it later only through an explicit accepted rule.

`pokenexus.level-cubic.v1` is the progression rule artifact/configuration identity resolved under SPEC-002's immutable `rulesVersion` envelope; it is not a fourth top-level version axis alongside `schemaVersion`, `gameDataVersion` and `rulesVersion`.

Every authoritative XP grant/apply operation is pinned to the grant's exact `rulesVersion`. That immutable descriptor must resolve the progression artifact/configuration identity used for application. The server must not fall back to a latest/current curve when the referenced `rulesVersion` is missing, unsupported or does not resolve the required progression semantics; the operation fails closed instead.

The curve is immutable once approved. A later curve requires a new progression artifact/configuration identity, a new accepted `rulesVersion` that resolves it, and an explicitly accepted persisted-state conversion. Persisted Level/XP is never silently reinterpreted on read.

## 5. XP grant authority

Durable XP is applied only from a server-authoritative resolved grant. A Battle Outcome, client request, Team membership, elapsed time or static factual field does not grant XP by itself.

The owning reward/content rule decides target Pokémon and integer XP amount. Participation/share/split policy is therefore deferred to Hunt/Gym/PvP/content rules.

A resolved grant conceptually carries `sourceAuthority`, `sourceCorrelation`, `rulesVersion`, `targetPokemonInstanceId` and non-negative integer `xpAmount`. The `rulesVersion` is part of the grant's authoritative identity/context and governs progression application through the immutable SPEC-002 resolution descriptor; application must not substitute another rules version or progression curve. TASK-023 owns durable source/idempotency records.

## 6. Applying XP

For authoritative `xpAmount`:

```text
capXp = 7_999_999
newTotalExperience = min(capXp, totalExperience + xpAmount)
newLevel = highest L where xpFloor(L) <= newTotalExperience
appliedXp = newTotalExperience - totalExperience
discardedAtCapXp = xpAmount - appliedXp
```

- Negative/non-integer XP is invalid.
- One grant may cross multiple Levels.
- If `appliedXp > 0`, persist Level, total XP, timestamp and exactly one rowVersion increment atomically.
- If `appliedXp = 0`, progression state and rowVersion remain unchanged.
- No intermediate per-Level database commit is allowed.

A valid resolved grant with `appliedXp = 0` is still a processed source outcome for TASK-023 composition. This includes a zero-XP grant and a grant fully discarded at the Level cap: it causes no synthetic Pokémon mutation or rowVersion bump, while durable source completion/evidence follows the accepted TASK-023 idempotency/atomicity contract.

## 7. Cap and post-cap

At Level 200, Level XP is capped at `7_999_999`. Excess is not banked and cannot create Level 201. There is no hidden overflow balance.

Future Mastery/Prestige/other post-cap systems are separate progression domains with separately accepted state/rules.

## 8. Existing Pokémon / creation baseline

An existing or newly-created Pokémon with authoritative Level `L` and no accepted XP history starts at `totalExperience = xpFloor(L)`.

For the later TASK-024 migration, existing Level is preserved exactly and `total_experience` is backfilled to the Level floor. No within-level historical XP is fabricated, and no Pokémon is promoted or delevelled.

## 9. Monotonic v1

Normal v1 has no negative XP, deleveling, XP spending, respec/reset consumption or read-time correction. Administrative rollback/delevel semantics require a separately accepted authority/audit contract.

## 10. Player Level progression domain

Player Level is a separate durable progression track attached to the authoritative `PlayerId` aggregate. It is not Pokémon Level, does not inherit the Pokémon hard cap `200`, and must not reuse `pokenexus.level-cubic.v1` by inference.

Accepted v1 Player progression state:

```text
playerLevel: integer >= 1, with no gameplay maximum
playerTotalExperience: integer >= 0
rowVersion: existing Player OCC token
```

The invariant is:

```text
playerLevel = highest L >= 1 where playerXpFloor(L) <= playerTotalExperience
```

Player curve identity: `pokenexus.player-linear-cost.v1`.

```text
playerXpFloor(L) = 50 * L * (L - 1)
```

Therefore the XP needed to advance from Player Level `L` to `L + 1` is exactly:

```text
100 * L
```

Examples: Player Level 1 = 0 XP; 2 = 100; 10 = 4,500; 50 = 122,500; 100 = 495,000; 200 = 1,990,000; 1,000 = 49,950,000.

The v1 recommendation deliberately uses **linear next-level cost / quadratic cumulative XP** rather than copying the Pokémon cubic curve. Player Level is intended to remain a long-lived cross-feature progression signal, so its next-level cost grows indefinitely but predictably without a designed terminal Level.

All authoritative Player progression values and arithmetic are exact/lossless integers end to end: Player Level, total XP, resolved grant amount, threshold calculation and Level inversion. Persistence, runtime and protocol representations must preserve those values exactly or fail closed before progression mutation **and before durable source-completion evidence is committed**. No narrowing, floating-point rounding, saturation, coercion or clamp may silently change the authoritative value. Exact SQL width/encoding remains TASK-024-owned and exact API encoding remains TASK-025-owned, but neither may narrow the accepted gameplay domain.

Player Level rules:

- Player Level is **uncapped at the game-rule level**: there is no accepted maximum Player Level.
- Any finite integer/storage bound selected by implementation is a technical representation constraint, never a gameplay cap or entitlement boundary. Reaching a technical bound must fail closed/escalate through an explicit migration/rule change rather than silently clamp Player progression.
- A new Player begins at Player Level `1` with `playerTotalExperience = 0`.
- An already-existing Player row created before Player progression persistence exists, with no accepted Player-XP history, is deterministically backfilled to the same baseline: Player Level `1` and `playerTotalExperience = 0`. No historical Player XP, higher Level, unlock or entitlement is fabricated from account age, Pokémon state or other activity.
- Player XP is cumulative and monotonic in normal v1. Negative XP, deleveling, XP spending and reset/respec consumption are not allowed.
- Player Level is server-authoritative durable state and may be consumed by later accepted features such as eligibility, unlocks, scaling, matchmaking/content access or other progression gates.
- Merely having a Player Level does not define any such feature's threshold or behavior. Each consuming feature owns its explicit use of Player Level.
- Player progression mutations use the existing `players.row_version` aggregate concurrency boundary unless a later accepted persistence contract explicitly replaces it.
- Player progression must use the same SPEC-002 immutable `rulesVersion` discipline as other executable progression semantics; no latest/current-rule fallback is allowed for authoritative application/history.
- `pokenexus.player-linear-cost.v1` is a second progression artifact/configuration identity under the exact grant `rulesVersion`; the rules release must resolve both Pokémon and Player progression identities whenever a source uses both tracks.

A server-authoritative resolved Player-XP grant conceptually carries `sourceAuthority`, `sourceCorrelation`, `rulesVersion`, `targetPlayerId` and non-negative integer `playerXpAmount`. Source/content rules decide whether Player XP is granted and how much; client activity, elapsed time or Player Level itself never creates XP authority by inference.

For one Player grant:

```text
newPlayerTotalExperience = playerTotalExperience + playerXpAmount
newPlayerLevel = highest L where playerXpFloor(L) <= newPlayerTotalExperience
```

- If `playerXpAmount > 0`, persist Player Level, total XP, timestamp and exactly one Player `rowVersion` increment atomically.
- If `playerXpAmount = 0`, Player progression state and rowVersion remain unchanged, while source completion/evidence may still complete under TASK-023 semantics.
- A stale Player `rowVersion` commits neither Player progression mutation nor durable source-completion evidence for that Player-progression effect/envelope. All derived Player Level/XP values from the stale snapshot are invalidated. TASK-023 then determines whether the durable source/effect is already completed or remains eligible; only an eligible/uncompleted source may reload current Player state and recompute the same already-resolved grant before retrying under the fresh version. Never reuse stale derived state.
- Because Player Level has no gameplay cap, a technical arithmetic/storage overflow is an error: do not clamp, discard or bank XP as if the technical bound were a game rule.

One reward source may later emit both Pokémon-XP and Player-XP grants. Whether those effects plus items/currency commit as one all-or-nothing bundle or another durable envelope remains exclusively TASK-023/source-contract ownership.

Player level-up has no implicit reward, stat bonus, unlock, entitlement or combat modifier in this specification. Those effects require an explicit owning feature/reward rule. In particular, direct combat scaling from Player Level is not adopted by inference.

As with the Pokémon curve, changing the Player curve requires a new progression artifact/configuration identity, a newly accepted resolving `rulesVersion` and an explicit persisted-state conversion; authoritative reads never reinterpret existing Player XP through a latest/current curve.

## 11. Concurrency and reward integrity

Concurrent grants must not lose XP. Progression mutation uses the accepted Pokémon aggregate concurrency boundary.

If a conditional progression write observes a stale expected `rowVersion`, that attempt commits neither Pokémon progression mutation nor durable source-completion evidence. Any values derived from the stale Pokémon snapshot (`newTotalExperience`, `newLevel`, `appliedXp`, `discardedAtCapXp`) are invalidated and must not be reused.

After a stale result, the orchestrator follows the accepted TASK-023 source/idempotency contract. If that durable source is already completed, it must not reapply XP. If the source is not completed and remains eligible, the orchestrator reloads current Pokémon state and recomputes the same already-resolved grant — same `sourceAuthority`, `sourceCorrelation`, `rulesVersion`, target and `xpAmount` — against the fresh state, then retries with the fresh `rowVersion`. This is recomputation of the same authoritative grant, never silent reuse/retry of stale derived progression output.

TASK-023 owns idempotency/reward-ledger design. When TASK-024 composes them, retrying one durable source must not double-apply XP, and the accepted reward evidence plus required progression effect must satisfy TASK-023 atomicity semantics.

TASK-021 defines atomic progression application only for one target Pokémon grant. If one reward source produces XP grants for multiple Pokémon and/or sibling currency/item effects, whether those effects form one all-or-nothing bundle, independent effects or another durable envelope belongs exclusively to TASK-023 and the owning reward/source contract. TASK-024 must implement that accepted composition and must not infer cross-target or cross-reward atomicity from this specification.

## 12. Combat and version boundaries

Combat reads only the resolved **Pokémon Level**. It does not read Pokémon total XP or Player Level, decide XP rewards, level up either progression track mid-Battle or rewrite an already-running Battle snapshot.

Later rules/game-data publication never recalculates existing Pokémon Level/XP or Player Level/XP on read. Future grants change behavior only through their explicitly accepted and pinned `rulesVersion`; there is no latest/current progression fallback.

## 13. Evolution and Move boundaries

Level-up does not automatically evolve a Pokémon or mutate SpeciesId. Evolution requires a future accepted evolution/static-data contract.

TASK-021 does not create learned-Move inventory or make raw level-up learnset rows authoritative for player-facing Move selection. Durable Move acquisition/unlock remains deferred.

## 14. Persistence handoff

TASK-024 may add `pokemon_instances.total_experience` using a forward migration with:

- range `0..7_999_999`;
- deterministic backfill to `xpFloor(level)`;
- atomic Level/XP/timestamp/rowVersion mutation;
- no per-Species growth-rate state;
- no hidden post-cap XP;
- no evolution/learned-Move state implied by this migration.

Exact SQL and reward-ledger composition remain TASK-024 work after TASK-023 is accepted.

TASK-024 may extend the `players` aggregate with Player Level/total-XP persistence that preserves the section 10 invariant and existing `players.row_version` OCC boundary. Existing Player rows with no accepted Player-XP history are backfilled deterministically to Player Level `1` / `0` total XP. Exact SQL/storage width remains implementation scope.

TASK-025 may expose authoritative Player progression reads and only explicitly accepted command surfaces that consume/trigger TASK-023/024 source-authorized progression. It must not accept a client-selected authoritative Player XP amount, XP source, progression target or Player Level setter, and API shape alone cannot confer XP authority. Exact public/internal API shape and lossless encoding remain TASK-025-owned. No technical storage/protocol width may be interpreted as a gameplay Level cap or narrow the accepted gameplay domain.

## 15. Accepted decisions

The Human Owner accepted the following SPEC-006 v1 decisions in full on 2026-09-18:

1. hard Level Cap `200`;
2. species-independent `xpFloor(L) = L^3 - 1`;
3. source `growthRate` remains non-executable in v1;
4. source `baseExperience` remains non-executable until an owning reward rule adopts it;
5. cumulative non-negative `totalExperience` persistence;
6. existing Pokémon backfill to exactly `xpFloor(currentLevel)`;
7. no normal negative XP/delevel/spending;
8. multi-Level grants apply atomically;
9. cap at `7_999_999` with no hidden overflow bank;
10. post-cap progression is a separate future domain;
11. XP amount/target allocation belongs to source reward/content specs;
12. Battle Outcome does not directly grant/mutate XP;
13. no automatic evolution on level-up;
14. no level-based learned-Move authority in TASK-021;
15. TASK-023/024 own reward-idempotency composition and must prevent duplicate XP;
16. `level = highest L where xpFloor(L) <= totalExperience`, with Level and total XP as one atomic aggregate invariant;
17. only a server-authoritative resolved grant may apply durable XP; Battle/client/Team/elapsed-time/static facts are not XP authority by themselves;
18. grant application accepts only non-negative integer XP, may cross Levels atomically, increments Pokémon rowVersion exactly once only when `appliedXp > 0`, and performs no intermediate per-Level commit;
19. a valid grant with `appliedXp = 0` still completes according to TASK-023 source/idempotency semantics without synthetic Pokémon mutation or rowVersion bump;
20. an existing or newly-created Pokémon with authoritative Level `L` and no accepted XP history starts exactly at `xpFloor(L)`;
21. stale Pokémon OCC invalidates derived progression output; an unapplied durable source may only retry after reload/recompute of the same resolved grant under fresh rowVersion, while an already-completed source must not reapply;
22. TASK-021 guarantees atomicity for one target Pokémon grant only; multi-Pokémon and sibling reward bundle atomicity belongs to TASK-023/source reward contracts;
23. `pokenexus.level-cubic.v1` is a progression artifact/config identity resolved by the grant's exact SPEC-002 `rulesVersion`, with no latest/current fallback;
24. later Pokémon curve changes require a new progression identity, a newly accepted resolving `rulesVersion` and an explicit persisted-state conversion; persisted state is never silently reinterpreted;
25. Player Level is a separate server-authoritative progression domain with **no gameplay hard cap** and does not inherit Pokémon Level `200` or the Pokémon cubic curve;
26. technical storage/numeric bounds for Player progression are not gameplay caps and must not silently clamp progression;
27. later features may consume Player Level only through their own accepted thresholds/semantics; Player Level alone does not implicitly unlock or scale anything;
28. Player progression uses the immutable SPEC-002 `rulesVersion` discipline and existing Player aggregate OCC boundary;
29. Player starts at Level `1` / `0` total XP and uses cumulative `playerXpFloor(L) = 50 * L * (L - 1)`, so each next Level costs exactly `100 * currentLevel` XP;
30. normal v1 Player progression is monotonic: no negative XP, deleveling, spending or reset consumption;
31. Player-XP grants are server-authoritative, use Player `rowVersion` OCC and stale-source reload/recompute semantics equivalent to the Pokémon progression safety boundary;
32. Player XP has no cap/clamp/overflow bank; technical arithmetic/storage overflow fails instead of becoming a gameplay rule;
33. `pokenexus.player-linear-cost.v1` is a distinct progression artifact/config identity under the exact `rulesVersion` and future Player-curve changes require explicit conversion;
34. Player level-up has no implicit reward/stat/unlock/combat effect; consuming feature semantics remain separately owned;
35. TASK-023/source contracts own atomicity when one durable source emits both Pokémon XP and Player XP and/or sibling item/currency effects;
36. Player progression invariant is `playerLevel = highest L >= 1 where playerXpFloor(L) <= playerTotalExperience`, with Player Level and total XP persisted as one atomic aggregate state;
37. existing Player rows with no accepted Player-XP history are backfilled to Player Level `1` / `0` XP, with no fabricated historical progression;
38. a positive Player-XP grant atomically persists Player Level, total XP, timestamp and exactly one Player `rowVersion` increment;
39. a zero Player-XP grant leaves Player progression state and Player `rowVersion` unchanged while source completion/evidence may still complete under TASK-023 semantics;
40. a stale Player OCC attempt commits neither Player progression nor durable source-completion evidence for that effect/envelope; stale derived values are discarded before TASK-023 decides completion versus eligible retry;
41. Player Level, total XP, grant amount and threshold/inversion math are exact/lossless end to end; persistence/runtime/protocol representations must preserve values exactly or fail closed before mutation/source completion, with no narrowing/rounding/saturation/clamp;
42. TASK-025 may expose reads and accepted server-orchestrated progression commands but no client-selected authoritative XP amount/source/target or Player Level setter, and its encoding cannot narrow the gameplay domain.

## 16. Acceptance criteria

- [x] Numeric curve and cap are exact and deterministic.
- [x] Existing Pokémon migration preserves Level exactly.
- [x] XP authority is server-side and allocation ownership remains separate.
- [x] Multi-Level/capped/no-op behavior is explicit.
- [x] No hidden overflow, deleveling or XP spending exists in normal v1.
- [x] Concurrent/retried grants cannot lose or duplicate XP under later implementation.
- [x] Stale OCC retries reload and recompute the same resolved grant; stale derived progression output is never reused.
- [x] Valid cap/zero-XP no-ops remain source-completable without mutating Pokémon rowVersion.
- [x] Multi-target/sibling reward atomicity remains owned by TASK-023/source contracts.
- [x] Combat snapshot boundaries remain unchanged.
- [x] Evolution and learned-Move acquisition are not silently introduced.
- [x] Static factual fields do not become executable by inference.
- [x] Exact grant `rulesVersion` resolves the progression artifact/configuration with no latest/current fallback.
- [x] Future curve conversion cannot happen implicitly on read and requires a new identity plus explicit accepted conversion.
- [x] Pokémon Level and Player Level are explicitly separate progression domains.
- [x] Player Level has no gameplay hard cap and no technical storage bound is treated as one.
- [x] Player Level does not inherit the Pokémon XP curve by inference.
- [x] Player Level consumers must define explicit feature-owned thresholds/semantics.
- [x] Player starts at Level 1 / 0 XP and the uncapped curve `50 * L * (L - 1)` is exact and deterministic.
- [x] Player next-level cost is exactly `100 * currentLevel` with cumulative monotonic XP.
- [x] Existing pre-progression Players deterministically backfill to Level 1 / 0 XP absent accepted Player-XP history.
- [x] Player Level/total-XP invariant and positive/zero grant rowVersion semantics are explicit and atomic.
- [x] Stale Player OCC commits neither progression nor durable source-completion evidence before source-aware retry resolution.
- [x] Player progression values are exact/lossless across persistence/runtime/protocol boundaries with no narrowing/rounding/saturation/clamping.
- [x] Player-XP grant/OCC/no-op/technical-overflow behavior is explicit and cannot lose or silently clamp XP.
- [x] Player curve identity is pinned by exact `rulesVersion` and cannot be silently reinterpreted.
- [x] Player level-up has no implicit feature reward/unlock/stat/combat effect.
- [x] TASK-025 cannot make client-selected XP amount/source/target or Player Level authoritative and cannot narrow Player progression through unsafe encoding.
- [x] Cross-track Pokémon/Player XP reward composition remains TASK-023/source-contract owned.
- [x] TASK-024 handoff is implementable without new product decisions.
- [x] QA and required IA spot-check have no unresolved P0/P1 findings.
- [x] Human Owner explicitly accepted SPEC-006 before TASK-021 reached READY.

## 17. Validation / boundaries

Run `corepack pnpm roadmap:generate`, `corepack pnpm roadmap:check`, and `git diff --check`.

Only TASK-021, SPEC-006 and roadmap artifacts may change. No production code, migration, dependency, lockfile or runtime configuration is authorized.

References: SPEC-001/002/003/004/005; ADR-002/004/005.
