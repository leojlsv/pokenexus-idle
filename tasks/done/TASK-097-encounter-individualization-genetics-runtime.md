# TASK-097 — Encounter Individualization & Genetics Runtime

## Metadata

- State: DONE
- Class: B
- Owner: Lead Developer
- Owner execution surface: current ChatGPT implementation session
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor for deterministic replay/versioning spot-check
- Auditor execution surface: fresh independent ChatGPT worker
- Consultants: N/A
- Consultant execution surface(s): N/A
- Functional/architectural acceptance: fresh independent ChatGPT assignment because the coordinating session materially implemented code
- Spec: `docs/specs/SPEC-014-idle-gacha-genetic-quality-acquisition-model.md`
- Related specs: SPEC-003, SPEC-005, SPEC-013
- Depends on: TASK-096
- Blocks: TASK-036, TASK-037, TASK-038
- Branch/worktree: implementation activated by Human Owner continuation on 2026-09-25 after
  TASK-096/SPEC-014 Class-A acceptance; Git-history mutation remains separately gated

## Objective

Implement the accepted per-Encounter individualization layer so every wild Encounter has one immutable
individual identity **before Battle** and the same identity is preserved through battle, replay,
auto-capture/manual capture and successful owned-Pokémon creation.

This is forward additive work. It does not rewrite TASK-035 canonical history.

## Required boundary

For each exact TASK-035 `PendingEncounterSelection`, materialize one immutable individual snapshot before
the first Battle for that pending selection. Individualization and Battle start do **not** consume the
pending token; only an accepted player-side sole-victory Encounter completion consumes it under SPEC-013.
The pending-selection identity is the primary
anti-reroll identity because the same unresolved token may survive retreat/stop/restart; a new
`huntRunIdentity` or `EncounterId` must never create a different individual for that same token.
`EncounterId`/ordinal remain execution/reward/capture provenance once a Battle occurrence is created.

The immutable snapshot contains at least:

- Species/form;
- Level;
- six canonical IVs;
- Genetic Score;
- derived Genetic Grade;
- immutable birth Genetic Profile identity;
- six resolved Genetic Bonus values for the birth Profile, or an equally immutable/versioned reproducible
  representation;
- Shiny;
- when `Shiny && Grade == Apex`, Ascendant resonance authority: the exact two compatible Profile identities
  frozen from the Encounter-birth Species/form plus both deterministic Profile allocations (or an equally
  immutable/versioned reproducible representation);
- exact individualization rules/version identity;
- an immutable internal `individualizationSnapshotIdentity` plus version-bound commitment/provenance
  sufficient to prove that Battle/completion/capture refer to this exact snapshot;
- domain-separated deterministic RNG provenance sufficient for replay without exposing secret derivation
  material to clients.

The snapshot is created once before Battle uses the individual. Retry/reload/checkpoint/restart of the
same pending selection must reuse or byte-for-byte deterministically reproduce it. Capture never rerolls
or reconstructs a different individual.

Lifecycle point:

```text
TASK-035 selected Encounter definition
→ exact Species/form + Level are fixed
→ stable PendingEncounterSelection exists
→ TASK-097 individualizes that pending-selection token exactly once
→ frozen opponent Battle snapshot is created
→ Battle starts
```

This is the only creation point for IVs/Genetics/Profile/Shiny. TASK-036 never owns a second creation path.

### Individualization provenance and RNG isolation

TASK-097 owns one separate immutable **individualization rules version**. This identity is distinct from:

- TASK-035 selection/policy behavior and its RNG continuation;
- the Combat Engine `rulesVersion`;
- TASK-036 capture-rules version.

The deterministic individualization root is derived server-side from the exact immutable
`PendingEncounterSelection` authority plus the pinned individualization-rules version **and a
server-only non-exportable derivation authority**. The implementation may use a versioned keyed PRF or an
equivalent opaque server-owned deterministic origin, but it must freeze the derivation algorithm,
canonical input encoding, authority/key identifier/version and conformance vectors before READY.

The server-only authority used for an accepted historical individualization must remain resolvable for
replay/version retention. Rotating current secret material may not reinterpret an older
`individualizationRulesVersion` or change an existing pending/snapshot result.

The derivation is **read-only** with respect to TASK-035 state:

- it does not advance or replace `policyRngBeforeSelection` / `policyRngAfterSelection`;
- it never consumes Combat Engine RNG;
- it never consumes TASK-036 capture RNG;
- client input cannot choose a seed, continuation or domain label.

The root/origin, keyed-derivation secret, substream state and any material sufficient to derive hidden
Genetics/Grade/Score/Profile/IV/Shiny **must never be exported in a DTO, public API payload or
client-controlled checkpoint**. Public identifiers may reference an internal snapshot, but cannot be a
reversible/unsalted commitment from which hidden individual fields can feasibly be recovered before
capture.

From that root, use stable domain-separated deterministic substreams at minimum for:

- `grade`;
- `score`;
- each canonical IV stat independently in order `hp / atk / def / spa / spd / spe`;
- `profile`;
- `shiny`.

Each IV-stat domain performs its accepted two draws `U[0,15] + U[0,16]`. Adding a new field in a later
individualization-rules version must not shift the existing Grade/Score/IV/Profile/Shiny streams.

`isAscendant = shiny && grade == Apex` consumes no RNG.

The exact replay provenance retains at least the pending-selection identity, selected
Species/form + Level, contentVersion/contentHash, gameDataVersion, the TASK-035 selection provenance
needed to validate that token, individualizationRulesVersion and the exact deterministic derivation
authority identifier/version. Secret material itself remains server-confidential. A snapshot additionally
retains its immutable internal `individualizationSnapshotIdentity`/commitment and materialized facts;
those facts must validate against the same provenance/rules authority.

### Successful-completion handoff to capture

Before or atomically with the successful Encounter-completion transition that consumes the
`PendingEncounterSelection`, the completion evidence and any manual/automatic pending-capture intent
must freeze a durable linkage containing at least:

- the exact originating `pendingSelectionIdentity`;
- the exact internal `individualizationSnapshotIdentity` and version-bound commitment/reference;
- `individualizationRulesVersion`;
- sufficient internal provenance reference to reload/verify the same immutable snapshot.

Consumption of the pending-selection token therefore does not erase or weaken individual identity.
TASK-036 must reject a capture attempt unless its pending-capture linkage and supplied/reloaded snapshot
match exactly. It may never substitute another valid snapshot merely because Species/form/Level are the
same.

If a pre-feature durable `PendingEncounterSelection`, Hunt checkpoint **or pending-capture decision**
already exists at production cutover without accepted individualization snapshot/provenance authority,
deployment must fail closed or obtain a separate Human-approved conversion policy. It may not
individualize an already-observed legacy encounter or attach a fabricated snapshot to an old capture
opportunity merely because the server restarted.

## Rules-version reconciliation

SPEC-003 currently defines combat derived stats as Base Stat + canonical IV + Level and explicitly has no
other hidden stat input. Genetics therefore requires a **new immutable combat rules release/version**.

Human-approved formula for that new rules release:

```text
maxHp =
  floor(((2 * B + I + G) * L) / 100)
  + L
  + 10

otherStat =
  floor(((2 * B + I + G) * L) / 100)
  + 5
```

`G` is the per-stat Genetic Bonus resolved by the Profile frozen into the current activity snapshot. For
ordinary individuals that Profile is always the immutable birth Profile. For Ascendant, the player may
choose either frozen resonance Profile outside active content, but the activity snapshot freezes one exact
Profile/bonus vector for its full duration. The six bonuses are non-negative integers whose exact sum
equals Genetic Budget (`0..70`). The implementation must never persist or reinterpret Genetics as IV > 31.

The formula above is Human-approved through TASK-096/SPEC-014. The implementation binds it to the
immutable `combat-rules-genetics-v1` release/hash, validates canonical IV/Genetic bounds and retains
deterministic replay/conformance evidence before acceptance.

Existing TASK-095 production rules/artifacts remain immutable for historical replay.

## Persistence reconciliation

The Human-approved SPEC-005 forward amendment defines these minimum owned-Pokémon facts:

- Genetic Score;
- immutable birth Genetic Profile identity;
- exact two compatible Profile identities frozen in canonical birth-time order;
- Shiny;
- individualization-rules version/provenance;
- currently expressed Profile as mutable owned-Pokémon configuration, constrained to equal birth Profile
  for non-Ascendant and to one of the frozen two Profiles for Ascendant.

Grade, Genetic Budget, Ascendant state and the six Genetic Bonus values are deterministic/version-bound
derived values and must not become independent mutable truth. A cache/materialization is permitted only
if mechanically reproducible and incapable of diverging as a second authority.

Legacy migration is Human-approved as fail-closed. Before making the new fields mandatory, take the
required lock and prove the authoritative `pokemon_instances` relation has no pre-Genetics durable rows.
If any row requires conversion, stop the migration and require a separate Human-approved legacy policy.
No implementation may synthesize Score/Profile/Bonus/Shiny/provenance for an old row.

## Auto-capture interaction

TASK-097 does not choose whether an attempt occurs or which Ball is used.

It only guarantees that any downstream attempt — manual or standing auto-capture — references the exact
same frozen individual snapshot. One Encounter cannot generate one set of IV/Genetics/Shiny for Battle
and another set for capture.

## RNG

Individualization uses server-owned deterministic, domain-separated substreams or equivalent explicit
derivation for:

- IVs;
- Grade/Score;
- Profile selection;
- Shiny.

Human-approved Class-A exact draws for forward implementation:

- Grade: one `U[0,9999]` against cumulative weights `5500 / 8300 / 9500 / 9900 / 10000`;
- Genetic Score: one unbiased integer draw inside the inclusive Score band of the selected Grade;
- each IV: `U[0,15] + U[0,16]`, fixed stat order only for canonical serialization;
- Profile: one unbiased `U[0,1]` selecting one of the Species/form's exactly two authored compatible
  Profiles;
- Shiny: one unbiased `U[0,16383]`, Shiny iff draw is `0` under the accepted `1/16384` MVP base rate.

Ascendant requires **no additional RNG draw**. After Grade/Score and Shiny are frozen:

```text
isAscendant = shiny && grade == Apex
```

If Ascendant, both Species/form-compatible Profiles become the immutable resonance set; the already-drawn
`50/50` Profile remains `birthProfile` and initial expressed Profile.

These draws use the domain-separated deterministic substreams defined above; no sequential global draw
order may couple unrelated fields. Client input never selects seeds or continuations.

There is no pity/protection RNG state in the MVP: no Epic+, Apex or capture protection counter exists.

## Acceptance criteria

- [x] TASK-096/SPEC-014 exact IV/Profile/Grade/Shiny rules are Human-approved, including Shiny
      `1/16384` and Ascendant eligibility `Shiny && Apex`.
- [x] SPEC-003 Genetic Bonus formula is Human-approved and implemented under the immutable
      `combat-rules-genetics-v1` release/hash before runtime use.
- [x] SPEC-005 immutable Genetics/Shiny/Ascendant persistence amendment + fail-closed legacy policy is
      Human-approved.
- [x] Encounter individualization producer/provenance boundary is defined: exact TASK-035
      PendingEncounterSelection → one TASK-097 snapshot before Battle; same token cannot reroll across
      Hunt restart/EncounterId changes; individualization RNG is versioned and isolated from selection,
      combat and capture RNG.
- [x] SPEC-013 forward amendment identifies the PendingEncounterSelection-bound individualization lifecycle,
      standing auto-capture semantics, no-eligible-Ball opportunity closure and non-retroactive offline
      configuration timing.
- [x] One immutable per-Encounter snapshot exists before Battle consumes individual stats/appearance.
- [x] Battle/replay/capture all consume the same snapshot.
- [x] Reload/retry/checkpoint cannot reroll any individual field.
- [x] No existing TASK-095/TASK-035 immutable history/artifact is mutated.
- [x] Deterministic replay and version-retention tests pass.
- [x] Independent QA + IA report no P0/P1 blockers.

## Review evidence

- `@pokenexus/game-core`: build PASS; unit/replay suite `380/380` PASS; lint PASS.
- `@pokenexus/database`: build/typecheck PASS; unit suite `29/29` PASS; lint PASS; Worker-compat dry-run PASS.
- `@pokenexus/api`: typecheck PASS; unit suite `104/104` PASS; lint PASS; Wrangler build dry-run PASS.
- Disposable PostgreSQL 17 integration: `@pokenexus/database` `61/61` PASS and `@pokenexus/api`
  `35/35` PASS, including migration `0006` success on empty authoritative surfaces plus fail-closed
  rejection for pre-feature owned Pokémon and Hunt checkpoints. The disposable container was removed.
- Workspace lint/typecheck/build: PASS. Workspace `pnpm test` reaches a known parallel-contention failure
  in `@pokenexus/game-data`: five unrelated 5-second timeout cases while loading published artifacts; the
  package has no TASK-097 diff and its isolated suite passes `365/365` with `1` live-ingestion skip.
- `git diff --check`: PASS.
- Independent QA final re-gate: **READY — P0/P1/P2/P3 `0/0/0/0`**.
- Independent Auditor final re-gate: **PASS — P0/P1/P2/P3 `0/0/0/0`**.
- Fresh Class-B functional/architectural acceptance: **ACCEPT — P0/P1/P2/P3 `0/0/0/0`**.
  Exact-current review confirmed the PendingEncounterSelection-bound one-individual invariant,
  server-only derivation authority, immutable Genetics combat-rules release, durable capture linkage,
  fail-closed legacy migration and TASK-035/TASK-095 replay/history preservation.

## Out of scope

- capture probability/one-Ball debit/outcome — TASK-036;
- Ball acquisition/faucet tuning — accepted content/economy task after TASK-096;
- Hunt checkpoint/offline execution — TASK-037;
- auto-capture API/settings/orchestration — TASK-038 after SPEC-013 amendment;
- Species Research rewards/UX beyond immutable capture counts;
- monetization.

## Completion

Repository/history completion was explicitly authorized by the Human Owner on 2026-09-26 and integrated
into canonical `main` together with the accepted downstream TASK-036 snapshot. No deploy or production
cutover is implied by this completion.
