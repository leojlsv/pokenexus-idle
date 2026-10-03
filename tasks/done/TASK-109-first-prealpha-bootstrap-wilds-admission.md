# TASK-109 — First Pre-alpha Bootstrap, Wilds Content & Hunt Admission

## Metadata

- State: DONE
- Review note: implementation, owner validation, exact-current `TECH READY + IA PASS 0/0/0/0`, Human reviewHash approval, immutable Wilds v5 publication, fresh independent Class-B `ACCEPT 0/0/0/0` and Human-authorized repository/history integration are complete; production activation, persistent migration, deploy and public enablement remain separate
- Class: B — implement accepted bootstrap/content/admission rules without balance reinterpretation
- Owner: Lead Developer
- Owner execution surface: ChatGPT delegated implementation worker
- Reviewer: independent QA Reviewer (bootstrap, content authority, Start admission and cross-package conformance)
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: independent Auditor (bootstrap ownership/Inventory/vitality atomicity and idempotency)
- Auditor execution surface: independent ChatGPT delegated auditor
- Consultants: N/A — starter/Wilds/admission rules are already Human-approved; provisional XP remains exactly the accepted provisional value
- Consultant execution surface(s): N/A
- Specs: APPROVED SPEC-020/021 plus existing SPEC-002/005/007/010/011/013/015 as forward-amended
- Related: TASK-020/024/025/034/035/038/087/089/091/104/106
- Branch: `feat/TASK-109-first-prealpha-bootstrap-wilds-admission`
- Worktree: `.worktrees/TASK-109-first-prealpha-bootstrap-wilds-admission`

## Objective

Implement the first-Pre-alpha new-player bootstrap, authoritative Verdant Edge/Wilds content and strict Solo Hunt Start admission so a fresh account reaches one valid management-first Team/Hunt state without fallback synthesis or hidden client authority.

## In scope

1. Implement idempotent new-player bootstrap:
   - choose exactly one Level-1 starter from Bulbasaur, Charmander, Squirtle, Chikorita, Cyndaquil or Totodile;
   - initially own only that Pokémon;
   - create its vitality at max HP through TASK-108 authority;
   - auto-create the first saved Team with the starter as Leader;
   - auto-assign up to four valid Level-1 Moves using existing authoritative Move eligibility.
2. Preserve the verified starter Level-1 loadouts:
   - Bulbasaur: Growl + Tackle;
   - Charmander: Growl + Scratch;
   - Squirtle: Tackle + Tail Whip;
   - Chikorita: Growl + Tackle;
   - Cyndaquil: Leer + Tackle;
   - Totodile: Leer + Scratch.
3. Grant the accepted initial Inventory atomically with bootstrap:
   - 50 standard Poké Balls;
   - 20 basic Potions;
   - 5 starter/basic 25%-tier Revives.
4. Publish/validate first-Pre-alpha Verdant Edge -> Wilds authority:
   - permanent basic/open-ended Hunt;
   - levels: Lv1 50%, Lv2 35%, Lv3 15%;
   - species weights: Pidgey 16, Rattata 15, Caterpie 18, Sentret 17, Ledyba 17, Sunkern 17;
   - species and level roll independently;
   - all six are capturable and have at least one production-executable Level-1 progress-capable Move.
5. Implement the accepted provisional Encounter economy for Wilds:
   - Player XP = `2 × wild level`;
   - Pokémon XP pool = `6 × wild level`;
   - independent 15% Poké Ball ×1 drop;
   - independent 5% basic Potion ×1 drop;
   - both may drop;
   - no Revive drop.
6. Implement strict Start admission:
   - saved Team size 1–6;
   - every selected member has dense 1–4 selected Moves;
   - every selected Move is production-executable;
   - every selected member has at least one progress/damage-capable executable Move;
   - unsupported selected Move blocks Start;
   - no fallback Move/loadout synthesis;
   - KO members may remain selected;
   - at least one selected member must be conscious;
   - authoritative Team order selects the first living eligible active;
   - running Hunt pins Team/config snapshot.
7. Ensure first Hunt is immediately available after valid bootstrap; no formal tutorial gate is introduced.

## Out of scope

- Potion/Revive/capture policy evaluation, Inventory spending automation or offline reconciliation.
- Game-core Revive/Potion cadence primitives.
- PokéCenter implementation beyond consuming TASK-108 authority.
- Presentation feed/activity UI.
- Evolution or later Safari/stamina/content/balance changes.
- Rebalancing the provisional XP or accepted Wilds weights/drops.

## Acceptance criteria

- [x] Each starter path is idempotent and atomically produces exactly one owned Level-1 starter, one vitality row, one first Team, accepted loadout and exact initial Inventory.
- [x] Retry/race cannot duplicate starter, Team or initial Inventory grants.
- [x] Published Wilds weights/levels/rewards match accepted values exactly and fail closed if required content authority is unavailable.
- [x] All six Wild species resolve at least one production-executable Level-1 progress-capable Move.
- [x] Strict admission rejects invalid Team size, sparse/zero/excess Move selection, unsupported Move and no-progress member without fallback synthesis.
- [x] Damaged/KO mixed Team may Start only when at least one member is conscious and chooses first living member by Team order.
- [x] Running Hunt freezes Team/config input against later saved-Team edits.
- [x] Independent QA and IA report no unresolved P0/P1; Class-B acceptance completes after implementation.

## Required validation

- Bootstrap transaction/idempotency/race tests across all six starters.
- Exact Inventory/vitality/Team/loadout assertions.
- Static-content validation for Wilds species/level weights and executable-move support.
- Start admission matrix including KO/damaged Team order and unsupported Move cases.
- Relevant PostgreSQL/API/game-data/game-core integration plus lint/typecheck/test/build.

## Dependencies

- TASK-108 persistent vitality implementation.
- TASK-020 Collection/Team persistence; TASK-024 Inventory/reward persistence; TASK-034 PvE content; TASK-089 Move eligibility; TASK-091 production Move support; TASK-038 historical Hunt API.
- APPROVED SPEC-020/021 and TASK-106 acceptance.

## Risks / irreversible actions

- Bootstrap is a one-time ownership/economy mutation and must be transactionally idempotent.
- Content/rules must use immutable versioned authority so future balance does not rewrite historical Hunts.
- Production selected-pair activation/rebind, persistent-environment migration, deploy, public enablement and Git-history integration remain separately gated.

## Readiness / execution gate

Readiness is satisfied: TASK-108 is DONE, runtime implementation is explicitly authorized, and independent QA/IA assignments are declared above. Public starter-choice protocol semantics remain out of scope unless separately accepted as Class A.

## Owner implementation / validation evidence — 2026-10-03

- Bootstrap authority is implemented as an internal trusted application service without inventing a new
  public starter-choice HTTP contract. The exact six accepted starter/loadout paths are validated against
  the selected immutable Move context, Level-1 learnsets and production-executable Move rules before any
  persistence call.
- Bootstrap persistence is one PostgreSQL transaction guarded by a Player `FOR UPDATE` lock. It rejects
  pre-existing owned Pokémon/Team/Inventory state, creates the Level-1 Pokémon + selected Move loadout +
  max-HP vitality + slot-1 first Team, grants exactly `50/20/5`, creates the Hunt root and records the
  accepted bootstrap identity. Same-starter replay returns the accepted aggregate without regranting;
  differing-starter races serialize to one winner and one conflict.
- Durable bootstrap provenance is bound to canonical `PLAYER_BOOTSTRAP_CONTENT_AUTHORITY` bytes. Exact
  current hash: `sha256:07c12e90845a8073323a59a4261b0c0e213c77912e5402a44342e43a764e459e`.
  Starter Genetic Profile authority is resolved against the exact selected `{gameDataVersion,
  rulesVersion}` pair.
- Strict Solo Hunt Start admission requires Team size `1..6`; every member must have a dense/distinct
  `1..4` selected Move loadout; every selected Move must be exact production-executable; every selected
  member must have a direct progress-capable Move. KO members remain allowed at this stage; TASK-108
  vitality binding retains the at-least-one-conscious and first-living-Team-order rules and frozen Hunt
  snapshot semantics.
- Pre-alpha authored Item identities remain separate from factual `catalogs/items` and are admitted by
  Reward runtime only for exact `game-data-core-kanto-johto-v5` + bundle
  `sha256:565cdd360c1b29dc3607696299244279a8d0c3f488d4544c41c62ed47592f782`; historical
  versions are not widened and a same-version/different-bundle substitution fails closed.
- Hunt runtime accepts PvE manifest schema `4` or `5` only; schema `3`, future schema `6`, or a manifest
  without PvE authority fails closed. Generic runtime artifact hash/canonical/count verification remains
  unchanged.
- Exact Wilds stage/review generator: **1/1 PASS**. The staged content has exactly 18 factorized
  species×level rows, exact `16/15/18/17/17/17%` species marginals, exact `50/35/15%` Level marginals,
  exact `2×/6×` XP, independent `15%` Poké Ball + `5%` basic Potion drops, no Revive drop, and all six
  Level-1 Wild Species have production progress-capable evidence.
- Final unit/package gates on the exact pre-publication snapshot: API **183/183 PASS**, database
  **34/34 PASS**, game-data **406/406 PASS + 1 intentional live-ingestion skip**, game-core
  **245/245 PASS**. Focused final API bootstrap/admission/Hunt/Reward gate: **29/29 PASS**; focused
  game-data publication/runtime authority: **22/22 PASS**.
- Typecheck/lint/build are PASS for affected API/database/game-data packages; game-core typecheck/lint
  PASS. Cloudflare Worker compatibility dry-runs PASS for game-data, database and API; API build dry-run
  reports no bindings.
- Disposable PostgreSQL gates on the exact snapshot: canonical migration + six-starter bootstrap/
  rollback/concurrency **18/18 PASS**; Hunt application/vitality/recovery regression **32/32 PASS**.
  No persistent/production database was touched.
- `roadmap:generate`, `roadmap:check` and `git diff --check` PASS. `portfolio:check-local` reports the
  pre-existing duplicated `TASK-039` roadmap row identically on base `d59fbe3`; this is not introduced
  by TASK-109.
- Before Human publication approval, `packages/game-data/published` was clean. No existing immutable
  publication was modified; production selected-pair/rebind, persistent-environment migration, deploy,
  public enablement, commit, push or merge did not occur.

## Independent technical + integrity re-gate — 2026-10-03

- Exact-current verdict: **P0/P1/P2/P3 = `0/0/0/0` — TECH READY + INTEGRITY READY**.
- The fresh exact-current review initially found two publication-integrity gaps in the TASK-109-specific
  wrapper: accepted Verdant Edge/Wilds topology/open admission/30s recovery were not reasserted at the
  publication boundary, and Human-review PvE semantics were not cross-bound to the three staged PvE
  artifact descriptors. Both were fixed before the final verdict. `assertTask109WildsTopology` now runs
  at staging and publication-contract review; `assertReviewedPveArtifactsMatchManifest` canonicalizes
  reviewed Zone/Hunt/Encounter content and requires exact descriptor equality with the staged manifest,
  while the generic publisher continues to verify the staged disk bytes against those same hashes.
  Regression coverage coherently rebinds candidate/review/stage hashes around an alternate 60s Hunt
  descriptor and requires rejection.
- A later fresh TECH re-gate found one additional **P1** in the same publication boundary: semantic
  validation converted `itemDrops` to a `Map` before proving the reviewed array had exactly two entries,
  so a coherently rebound review/artifact with a duplicate accepted Ball drop could collapse to the same
  two keys and pass while changing runtime reward probability. The contract now requires
  `itemDrops.length === 2` before the existing unique-key/exact Ball/Potion checks. A regression test first
  reproduced the bypass, then rebinds the Encounter descriptor, candidate bundle, `reviewHash` and
  stage-manifest hash and proves the duplicate entry is rejected.
- Reviewer inspected the tracked diff and all TASK-109 untracked implementation surfaces, including
  bootstrap service/tests, strict Start admission/tests, migration/repository/PostgreSQL tests,
  schema-5 Wilds restaging/profile/review and authored-item runtime authority/tests.
- Reviewer independently confirmed single-transaction bootstrap atomicity, Player-lock race
  serialization, same-starter replay/no regrant, exact `50/20/5`, canonical bootstrap hash binding,
  exact game-data/rules Genetic Profile binding, TASK-108 vitality/first-living/frozen-snapshot
  preservation, exact-v5 authored Item binding, schema-5 Hunt loading, exact Wilds topology/recovery,
  review-to-artifact publication cross-binding, reviewHash/candidate substitution protection, exact Wilds
  math/economy/playability and no TASK-110 scope leakage.
- Final post-fix independent re-gates are **TECH READY + IA PASS, P0/P1/P2/P3 = `0/0/0/0`**. The TECH
  reviewer reran the hardened publication contract **6/6 PASS**, `git diff --check` PASS and confirmed
  `packages/game-data/published` remains clean. The IA independently revalidated the canonical bootstrap
  hash, exact `{gameDataVersion,rulesVersion,speciesId}` Genetic Profile binding, all-six PostgreSQL test
  matrix coverage in source, TASK-109 publication wrapper, authored-vs-factual Item separation, Class-A
  boundaries and TASK-110 separation with no material findings. Owner gates above cover the exact same
  post-fix snapshot, including PostgreSQL **18/18 + 32/32**, full game-data **406/406 + 1 skip** and focused
  publication/runtime **22/22**.
- Absence of a public bootstrap HTTP call site is explicitly not a finding: public starter-choice
  protocol semantics remain a separate Class-A boundary. Likewise, v5 selected-pair activation/rebind
  remains the already-declared separate production gate.

## Human-approved immutable Wilds publication — 2026-10-03

- Candidate game data: `game-data-core-kanto-johto-v5`.
- Candidate bundle: `sha256:565cdd360c1b29dc3607696299244279a8d0c3f488d4544c41c62ed47592f782`.
- Content commitment: `sha256:87bab803380b6fbcc3f23a26250be809ef9a149ba7a15ca8739744a68deb178e`.
- Exact Human review file / `reviewHash`:
  `sha256:9bf35a1ff7ce9b0d0b3f08daa8248fb1fc7241dea84158f4376c7503786daabb`.
- Candidate-manifest hash:
  `sha256:90e51b79be83b5a46825df2f46695d8054ec4773f9c703a81270d26e0ee98a33`.
- Human Owner explicitly approved the exact `reviewHash` above at `2026-10-03T14:01:30Z`.
- Publication used `publishApprovedTask109PveV5Candidate`; generic publication was not called directly.
- Immutable publication completed at `2026-10-03T14:03:02.265Z` as
  `packages/game-data/published/version-38ed5230053095b7ef69290f55f40278e681f20eb530788040be5639cdde3c19`.
- Reloaded manifest: schema `5`, PvE schema `1`, `game-data-core-kanto-johto-v5`, exact bundle
  `sha256:565cdd360c1b29dc3607696299244279a8d0c3f488d4544c41c62ed47592f782`, 10 artifacts,
  1 Zone, 1 Hunt and 18 Encounter definitions. Re-running the publication returned the same immutable
  directory and manifest, proving idempotent publication.
- Historical published directories remain unchanged. Post-publication game-data **406/406 PASS + 1
  intentional live-ingestion skip**, API **183/183 PASS**, `sanity:current` PASS on v5 and
  `sanity:compare` PASS against v4 with zero new completeness gaps and zero structural regressions.
- Publication receipt: `packages/game-data/reviews/task-109/prealpha-wilds-v5-publication.json`.
- Fresh independent Class-B functional/architecture acceptance independently re-read the post-publication
  snapshot and immutable bytes, recomputed all 10 artifact hashes/counts, revalidated the 1 Zone / 1 Hunt /
  18 Encounter semantics and returned **P0/P1/P2/P3 = `0/0/0/0` — ACCEPT**.
- TASK-109 is therefore in ACCEPTANCE. Production selected-pair activation/rebind, persistent-environment
  migration, deploy/public enablement and Git-history integration remain separately gated.
