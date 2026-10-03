# TASK-114 — PokéAPI Promotion Decision & Schema-5 Cutover Contract

## Metadata

- State: DONE
- Review note: independent implementation/publication-path QA complete; Human-authorized schema-5 v4 publication materialized, revalidated and integrated into canonical Git history on 2026-10-03; runtime schema-5 enablement and deploy remain separate gates
- Class: A — changes approved field-authority behavior for Move `sourceTarget` and defines the first schema-5 data-promotion contract
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: N/A — no security, concurrency, realtime-topology, economy/trading or destructive-migration trigger
- Auditor execution surface: N/A
- Consultants: N/A — this decision preserves current target gameplay semantics; promoted `makesContact` deltas are not currently executable in the production MoveRule catalog
- Consultant execution surface(s): N/A
- Spec: APPROVED SPEC-023
- Related: TASK-006 / TASK-087 / TASK-092 / TASK-112 / TASK-113
- Branch: `feat/TASK-114-pokeapi-promotion-schema5` (integrates required TASK-112/113 dependency state)
- Worktree: `G:\pokenexus-idle\.worktrees\TASK-113-local-pokemon-snapshot-implementation`

## Objective

Convert the first pinned PokéAPI snapshot parity evidence into an exact Human-reviewable field-promotion
decision, including the required `Move.sourceTarget` authority correction, explicit provider bindings
and the envelope for a local schema-5 candidate derived from published v3.

## In scope

- APPROVED SPEC-023 and exact data-decision matrix;
- exact 42 accepted persistent-form PokéAPI bindings;
- project-owned `snapshotId`-bound provider-binding registry covering all 293 accepted Species plus the
  exceptional Move override;
- five Species Base Experience promotions;
- ten Move `makesContact` promotions;
- explicit `vise-grip`→PokéAPI `vice-grip` provider binding;
- 30 accepted Item category promotions;
- Type/Ability/current-matrix provenance promotion where values already match;
- amendment retaining current Move `sourceTarget` authority because pinned PokéAPI identifiers are not
  information-equivalent to the current canonical enum;
- schema-5 candidate envelope based on published `game-data-core-kanto-johto-v3`;
- exact historical-provenance retention audit: all 1,144 explicit-role obligations plus 2 shared
  Bulbapedia mainline-selection context records are locally recoverable from the final retained
  TASK-087 hardening cache with exact URL-key/hash/timestamp identity; total migration `1,146`;
- pre-implementation independent QA and completed Human acceptance gate;
- local schema-5 migration/candidate implementation and validation authorized by the accepted contract.

## Out of scope

- any new external Bulbapedia/PokémonDB acquisition;
- publishing a new `gameDataVersion`;
- runtime schema-5 enablement;
- changing target gameplay semantics or canonical target enums;
- adding the five accepted-but-unpublished Move mappings from PokéAPI alone;
- changing Move selected-game scalar, Z-A cooldown or Learnset authority;
- promoting Species `baseFriendship`, `eggCycles`, form `introducedGeneration`, `sourceName` or
  `formLabel`;
- assets/evolution/Nature mechanics;
- commit, push, merge or deploy.

## Evidence

- exact source revision: `bc92d3b6029ef1abe9e7ad424c400b338f3c11fe`;
- exact snapshot:
  `source-snapshot:pokeapi:8ef26f3e68509ee3c101a7063c32c67283dc95c67aa5f23a6ff2a829bd2bf9b8`;
- TASK-113 post-ACQUIRE QA: P0/P1/P2/P3 = `0/0/0/0`, TECH READY / ARCH READY;
- v2 and v3 seven factual artifact hashes/counts are identical;
- all 42 accepted persistent forms have one unique PokéAPI non-default variety when matched by same
  National Dex + Types + Base Stats + Ability slots + height + weight + EV yield, excluding only Base
  Experience from identity because it is an independently promoted authority field;
- `Move.sourceTarget` target-identifier correlation is non-functional: several PokéAPI identifiers map
  to multiple canonical target values across accepted Moves;
- current production Move support has no executable Move among the ten `makesContact` deltas.
- pre-implementation explicit-role audit found `1,144/1,144` exact historical SourceRecords in the
  final retained TASK-087 post-publication hardening cache; implementation deep-audit of aggregate
  Move provenance found 2 additional exact Bulbapedia mainline-selection context records, producing a
  complete `1,146/1,146` local retention set with no missing bytes or conflicts.

## Acceptance criteria

- [x] Exact pinned-snapshot deltas are classified by field and authority.
- [x] v3 is proven to retain v2 factual artifact bytes exactly.
- [x] 42/42 accepted persistent forms have unique local evidence-backed binding proposals.
- [x] `sourceTarget` semantic insufficiency is demonstrated without external consultation or circular mapping.
- [x] SPEC-023 defines exact promoted/non-promoted fields and publication boundaries.
- [x] Schema-5 historical evidence prerequisites are quantified and all 1,146 historical retention
  records are locally recoverable without upstream access.
- [x] Independent pre-implementation QA reports no unresolved P0/P1.
- [x] Human Owner accepts exact SPEC-023 decision contract — approved 2026-10-03.

## Required validation

- `pnpm roadmap:generate`;
- `pnpm roadmap:check`;
- `git diff --check`;
- independent READ-ONLY Class-A implementation review against APPROVED SPEC-023/TASK-113 evidence;
- exact staged-candidate semantic delta/provenance/idempotence validation;
- full `@pokenexus/game-data` test/lint/build/typecheck/Worker compatibility gates.

## Dependencies

- APPROVED SPEC-022 / TASK-112 acceptance;
- TASK-113 post-ACQUIRE implementation/parity acceptance;
- exact retained PokeAPI snapshot named above;
- immutable published `game-data-core-kanto-johto-v3` baseline.

## Risks / irreversible actions

No irreversible action is authorized by this task. The material risk is promoting a lossy Move
target mapping or silently changing canonical identity. SPEC-023 explicitly prevents both.

The final retained TASK-087 hardening cache is protected evidence until its 1,146 retained records are
migrated and verified in stable project-controlled maintenance storage. Do not clean or mutate that
legacy cache/worktree before migration completes.

Local implementation and staging are authorized by the Human acceptance of SPEC-023 on 2026-10-03.
Publication, runtime enablement and Git-history operations remain separately gated after
implementation/review.

## Independent Class-A QA — 2026-10-02

- Final exact-current verdict: **PRE-IMPLEMENTATION READY**.
- Findings: **P0/P1/P2/P3 = 0/0/0/0**.
- Independently reproduced all 42 persistent-form bindings and the exact five Base Experience, ten
  `makesContact`, 30 Item-category and five accepted-but-unpublished Move deltas.
- Independently confirmed post-binding/pre-promotion parity:
  **5,411 match / 57 mismatch / 35 missing-current / 0 missing-source / 547 unmapped**.
- Independently re-audited the final retained TASK-087 hardening cache against the pre-implementation
  explicit-role v3 set by SHA-256(canonical URL) cache key + exact `fetchedAt` + metadata content hash + actual byte
  SHA-256: **1,144/1,144 exact, 0 missing, 0 conflicts**.
- Confirmed `Move.sourceTarget` PokéAPI identifiers are not information-equivalent to the current
  canonical enum; retaining current target authority is the minimal semantics-preserving amendment.
- Confirmed schema-5 envelope remains additive to v4, all three PvE artifact hashes are preserved,
  historical schemas/runtime remain fail-closed and publication/runtime/Git/deploy stay separate gates.
- `roadmap:check` and `git diff --check` PASS.

## Local implementation/staging evidence — 2026-10-03

- Candidate: `game-data-core-kanto-johto-v4`, exact `schemaVersion = "5"`.
- Staging root:
  `G:\pokenexus-idle\.maintenance\staged-candidates\game-data-core-kanto-johto-v4-schema5`.
- Stable retained-evidence root:
  `G:\pokenexus-idle\.maintenance\source-snapshots\legacy-v3-retained-v5-r2`.
- Exact candidate commitments:
  - bundle: `sha256:fc37e5e9acebca805949780e2adb378b7ace8241b7b13ec7689a67d7abf23346`;
  - provenance: `sha256:fcb28b7ee90680cf28778acc48f9aad5dd24578f620ce0e30705484bd4b3dd68`;
  - Human-review: `sha256:c86dcb0c9efc8506e59fc0748fb66d815a6450a7f6639b4de09810484507dc0a`.
- Binding registry is project-owned, pinned to the approved PokéAPI snapshot, and validates exactly
  `251` default + `42` persistent-form Species bindings plus only `vise-grip -> moveId 11`.
- Historical evidence migration copied (never moved/rewrote) all **1,146/1,146** retained historical
  SourceRecords into one-file immutable schema-5 snapshots: the 1,144 explicit-role records plus the
  2 shared Bulbapedia mainline-selection context records discovered during implementation deep-audit.
  Every final snapshot was re-opened through `verifyLocalSourceSnapshot`; no missing/hash/timestamp/
  identity conflict exists. The earlier 1,144-only maintenance root remains untouched.
- Exactly **32 Moves** now preserve multi-file mainline-selection evidence, matching the v3 aggregate
  provenance; this adds no factual delta.
- Schema-5 provenance contains **1,147 SourceSnapshots / 1,169 SourceRecords / 6,165 FactSource
  relations / 547 MoveFactSource relations**. All 1,169 SourceRecords are referenced; there are zero
  orphan, missing or dangling schema-3/4 SourceRecord IDs.
- Pre-promotion parity is exactly
  **5,411 match / 57 mismatch / 35 missing-current / 0 missing-source / 547 unmapped**.
- Post-promotion parity is exactly
  **5,498 match / 0 mismatch / 5 missing-current / 0 missing-source / 547 unmapped**; the five
  missing-current entries are the intentionally unpublished accepted Move mappings and every unmapped
  entry is `Move.sourceTarget` audit evidence.
- Semantic comparison against v3, ignoring provenance-reference identity only, is exactly **87 factual
  field changes across 83 records**: `42` Species `sourceSlug`, `5` Species Base Experience, `10`
  Move `makesContact`, `30` Item `sourceCategory`; **zero unexpected factual deltas**.
- The three v3 PvE artifact hashes are byte-identical in the staged candidate:
  - zones `sha256:50cdad7d5dcd51b20f1f83ef91668fe95cec1a9ff98928da249d0d3c414d6a69`;
  - hunts `sha256:b10e4e7fc83556f3fdadefe2fe2989868d19b931b622acd70f1a17acaaa3fa8b`;
  - encounter definitions `sha256:5c197679669e86ed3646a7227b7f22983f2e312ec068562f18ad9c941f9bc60e`.
- A complete second staging run reproduced the same bundle/provenance/review commitments exactly;
  migration and staging are idempotent with the retained local inputs.
- Focused schema-5 tests: **18/18 PASS**.
- Full `@pokenexus/game-data` suite: **391/391 PASS**, with the existing external live test skipped by
  design (`1` skipped).
- `typecheck`, `lint`, `build`, Worker-compat dry-run and `git diff --check`: **PASS**.
- No external provider access, publication, runtime schema-5 enablement, commit, push, merge or deploy
  was performed.

## Post-implementation prime revalidation — 2026-10-03

- This section is **not** the required independent Class-A verdict. Two delegated READ-ONLY reviewer
  launches failed before either reviewer started (`chat ... did not report back in time`), so the
  independent post-implementation QA gate remains open and TASK-114 stays `REVIEW`.
- Exact local restage using all five explicit paths completed successfully without provider/network
  access and reproduced the same commitments:
  - bundle `sha256:fc37e5e9acebca805949780e2adb378b7ace8241b7b13ec7689a67d7abf23346`;
  - provenance `sha256:fcb28b7ee90680cf28778acc48f9aad5dd24578f620ce0e30705484bd4b3dd68`;
  - Human-review `sha256:c86dcb0c9efc8506e59fc0748fb66d815a6450a7f6639b4de09810484507dc0a`.
- Migration revalidation independently recomputed the v3 role counts as `503 / 257 / 29 / 547 / 1`,
  explicit-role union `1,144`, Move-availability context `3`, exactly `2` availability records outside
  that explicit union and complete union `1,146`.
- All `1,146` r2 index entries were reopened through `verifyLocalSourceSnapshot` with zero verification
  failures. The migration code revalidated exact normalized URL, legacy ID/url-key, `fetchedAt`, cache
  metadata hash and actual byte hash during the deterministic restage; its cache path is read-only.
- Mainline context was compared Move-by-Move against v3 aggregate availability evidence: expected
  multi-source Moves `32`, actual `32`, mismatches `0`.
- Final provenance/cardinality cross-check: `1,147` SourceSnapshots, `1,169` SourceRecords, `6,165`
  FactSource relations and `547` MoveFactSource relations. All `1,169` SourceRecords are referenced by
  field/move provenance or aggregate artifact `sourceRecordIds`; orphan `0`, missing `0`, dangling old
  schema-3/4 artifact IDs `0`.
- Full semantic artifact comparison against v3 while excluding provenance-reference identity found
  exactly `87` factual field changes and no others: `42` Species `sourceSlug`, `5` Species
  `baseExperience`, `10` Move `makesContact`, `30` Item `sourceCategory`.
- The five accepted-but-unpublished Moves remain absent; `vise-grip` retains the same mapping key and
  canonical ID while the provider registry contains only the approved `vise-grip -> moveId 11`
  override. Candidate staging contains no publishable `manifest.json`.
- Current exact-state gates rerun after compaction: focused schema-5 tests **18/18 PASS**; full package
  tests **391/391 PASS + 1 intentional live-test skip**; `typecheck`, `lint`, `build`, Worker-compat
  Wrangler dry-run, `roadmap:generate`, `roadmap:check` and `git diff --check` all **PASS**.
- SPEC-023 §10 was corrected to state the chronology accurately: the Human approval preceded discovery
  of the two additional provenance-only mainline-context records; the +2 must be disclosed at the
  publication gate and must not be represented as a separate post-discovery Human approval.

## Independent post-implementation Class-A QA — 2026-10-03

- Final independent findings: **P0/P1/P2/P3 = `0/0/0/0`**.
- Migration verdict: **MIGRATION READY**.
  - Reproduced exact v3 role counts `503 / 257 / 29 / 547 / 1`, explicit-role union `1,144`,
    Move-availability context `3`, and complete retained union `1,146` with exactly two additional
    Gen VII/VIII Bulbapedia mainline-selection context records.
  - Re-audited the protected TASK-087 cache with zero URL-key, old-ID, `fetchedAt`, metadata-hash or
    byte-hash mismatches; all `1,146` stable snapshots reopened through `verifyLocalSourceSnapshot`.
  - Confirmed index totality/uniqueness, atomic/idempotent persistence, overlap guards, exact `32`
    multi-source mainline Moves, zero orphan/missing/dangling IDs, retained Gen VII/VIII availability
    evidence and exclusion of the old Psychic Noise contact-only SourceRecord.
- Candidate verdict: **TECH READY / DATA READY**.
  - Confirmed additive schema-5 manifest isolation from schema 3/4/runtime and no publishable
    `manifest.json` in the staged candidate.
  - Confirmed registry `293 = 251 default + 42 persistent-form` and the sole
    `vise-grip -> moveId 11` provider override against pinned `vice-grip`.
  - Independently reproduced the exact **87 factual fields / 83 records** delta, five unpublished Moves
    remaining absent, byte-identical PvE artifacts and the exact candidate commitments recorded above.
  - Independently parsed provenance as `1,147` SourceSnapshots / `1,169` SourceRecords / `6,165`
    FactSource relations / `547` MoveFactSource relations, with `32` multi-source mainline Moves and
    zero missing/orphan SourceRecords.
- Reviewer reruns: focused schema-5 tests **18/18 PASS**, `typecheck` PASS, `lint` PASS and
  `git diff --check` PASS. Prime exact-state validation additionally confirmed build PASS,
  Worker-compat PASS and full suite **391/391 PASS + 1 intentional live-test skip** under controlled
  test concurrency; an earlier parallel rerun under active reviewer load hit five test timeouts, and
  every affected file passed immediately when rerun in isolation.
- No reviewer performed edits, provider/network access, publication, runtime enablement or Git-history
  operations. TASK-114 therefore advances to `ACCEPTANCE`; Human publication/runtime/Git-history
  authorization remains a separate gate.

## Human-authorized schema-5 publication — 2026-10-03

- The Human Owner separately authorized publication at **2026-10-03T08:31:47Z**, after receiving the
  exact reviewed candidate commitments and the explicit disclosure that historical retention expanded
  from the pre-implementation `1,144` explicit-role records to `1,146` by preserving two additional
  provenance-only Bulbapedia mainline-selection context records.
- Publication-path implementation added a Node-only schema-5 publisher with exact Human `reviewHash`
  binding, reviewed candidate identity enforcement, canonical/hash validation, immutable same-version
  semantics and temp-directory + verified atomic rename.
- Initial independent publication-path review found one P1: the approved Human-review file hash was
  checked, but its embedded candidate version/bundle/provenance identity was not yet cross-checked with
  the staged manifest. The publisher was corrected to bind all three identities and a coherent
  artifact+manifest substitution regression was added. Independent re-review then reported
  **P0/P1/P2/P3 = `0/0/0/0`, PUBLICATION READY**.
- A full publication dry-run using the exact approved candidate passed repository sanity:
  **9/9 audits PASS, 10/10 assertions PASS, v3→v4 comparison PASS, 0 structural regressions**. The
  temporary publication root was removed after validation.
- Immutable publication materialized at:
  `packages/game-data/published/version-3544a59c446f9ae48854a2448898df2b946b8569feeb62adafda880e3f3be47c`.
- Published manifest identity:
  - `gameDataVersion = "game-data-core-kanto-johto-v4"`;
  - `schemaVersion = "5"`;
  - `publishedAt = "2026-10-03T08:31:47.000Z"`;
  - bundle `sha256:fc37e5e9acebca805949780e2adb378b7ace8241b7b13ec7689a67d7abf23346`;
  - provenance `sha256:fcb28b7ee90680cf28778acc48f9aad5dd24578f620ce0e30705484bd4b3dd68`;
  - approved Human-review commitment
    `sha256:c86dcb0c9efc8506e59fc0748fb66d815a6450a7f6639b4de09810484507dc0a`.
- Post-publication verification re-opened the schema-5 bundle through the Node-only verified loader;
  `sanity:current` and `sanity:compare` both PASS, including **9/9 audits, 10/10 assertions, zero
  unexpected cross-surface provenance, zero unexplained SourceRecords and zero structural regressions**.
- Exact post-publication package validation: **393/393 tests PASS + 1 intentional live-test skip**;
  `typecheck`, `lint`, `build`, Worker-compat dry-run and runtime/schema parser-isolation tests PASS.
- Runtime schema 5 remains fail-closed and was not enabled. No commit, push, merge, tag or deploy was
  performed. TASK-114 remains `ACCEPTANCE` pending those separately owned gates.

## Repository/history completion — 2026-10-03

- Human Owner explicitly authorized continuation/completion of TASK-114 after the schema-5 publication gate.
- Independent governance/integration review reported **P0/P1/P2/P3 = `0/0/0/0`, INTEGRATION READY** and
  confirmed TASK-114 must integrate the accepted TASK-112/113 dependency state with it.
- Dependency/history commits:
  - `a5a9847` — `docs(game-data): define local pokemon source authority`;
  - `c341683` — `feat(game-data): publish schema v5 pokemon data`;
  - `ce36ecd` — reconcile TASK-114 branch with current `main` while preserving TASK-107/108 DONE state.
- Canonical local `main` integrated the complete chain at merge commit `938fe33`
  (`merge: integrate TASK-114 schema v5 publication`).
- Exact integrated-state validation before completion:
  - `@pokenexus/game-data` serial suite **393/393 PASS + 1 intentional live-test skip**;
  - schema-5 `sanity:compare` against v3 **PASS** with **9/9 audits, 10/10 assertions, 0 structural regressions**;
  - package/root lint and build PASS after materializing this worktree's already-locked dependencies via
    `pnpm install --offline --frozen-lockfile`;
  - roadmap check and `git diff --check` PASS.
- TASK-112, TASK-113 and TASK-114 therefore complete together in dependency order and move to `DONE`.
- Runtime schema-5 enablement, persistent-environment migration where applicable, deploy and public
  runtime enablement remain separately owned/gated and were not executed by this completion.
