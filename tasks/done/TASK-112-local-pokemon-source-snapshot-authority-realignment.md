# TASK-112 — Local Pokémon Source Snapshot & Authority Realignment

## Metadata

- State: DONE
- Acceptance note: independent pre-implementation Class-A QA READY with P0/P1/P2/P3 = 0/0/0/0; Human Owner accepted the exact SPEC-022 contract on 2026-10-02; repository/history integrated with the required TASK-113/114 dependency chain under Human TASK-114 continuation authorization on 2026-10-03
- Class: A — canonical source authority and provenance architecture
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: N/A — no security, concurrency, realtime, economy/trading or destructive-migration trigger
- Auditor execution surface: N/A
- Consultants: N/A — factual source/provenance architecture does not change gameplay/economy semantics
- Consultant execution surface(s): N/A
- Spec: `docs/specs/SPEC-022-local-pokemon-source-snapshots-and-field-authority.md`
- Amends: SPEC-002 / SPEC-008 after Human acceptance
- Related: TASK-006 / TASK-087 / TASK-092
- Branch: `feat/TASK-112-pokeapi-local-snapshot`
- Worktree: `.worktrees/TASK-112-pokeapi-local-snapshot`

## Objective

Define and obtain Human acceptance for a static Pokémon factual-data architecture that uses exact
local source snapshots, introduces field-specific source authority and permits the official PokéAPI
v2 source dataset for explicitly approved structured facts without adding any hot third-party runtime
or routine-ingestion dependency.

## In scope

- define the acquisition/local-ingestion/publication boundary;
- make normal ingestion, publication, CI, build and runtime independent of third-party factual
  provider availability;
- define immutable source-snapshot identity/provenance requirements;
- define the field-level authority matrix for Species/forms, Moves, Types, Abilities, Items and
  Learnsets;
- preserve local/Human mapping authority and current Move selected-game / Learnset semantics where
  parity is not yet proven;
- define the parity and Human data gate required before a PokéAPI-backed candidate can publish;
- update roadmap/source-policy wording after acceptance.

## Out of scope

- downloading or refreshing PokéAPI/Bulbapedia/PokémonDB source snapshots;
- production code changes;
- publishing a new `gameDataVersion`;
- changing the current Learnset fallback semantics;
- changing exact-game Move scalar authority;
- evolution/Nature mechanics;
- presentation asset ingestion;
- commit, push, merge, deploy or public enablement.

## Acceptance criteria

- [x] SPEC-022 defines zero third-party factual-provider access for runtime, routine CI/build and
  normal ingestion/publication.
- [x] External acquisition is a separate explicit Human-gated maintenance phase and cannot execute
  without affirmative authorization for the exact provider + immutable revision/release when one
  exists, otherwise the exact approved source-locator/surface set.
- [x] Source authority is field-specific and never an implicit provider fallback chain.
- [x] PokéAPI local snapshot authority is explicit for the approved Species/Type/Ability/Item and
  Move target/contact fields.
- [x] Local/Human mapping remains authoritative for canonical IDs and accepted persistent forms.
- [x] Current Bulbapedia selected-game Move scalars and Z-A cooldown authority remain unchanged.
- [x] Current Learnset authority/fallback remains unchanged pending a dedicated parity/semantic gate.
- [x] Provenance requires exact upstream revision, exact local source bytes, canonical snapshot hash
  preimage and immutable hashes bound into `provenanceHash`/`bundleHash`.
- [x] Multi-file facts retain every supporting SourceRecord; schema-5 Move provenance supports
  multi-record roles such as `move_flag_map + move_flags` for `makesContact`.
- [x] Exact source bytes supporting staged/published candidates remain recoverable from
  project-controlled maintenance storage without third-party network access.
- [x] First migration candidate requires a complete field-level diff against the accepted publication
  and blocks promotion on unexplained deltas.
- [x] Independent pre-implementation QA reports no unresolved P0/P1.
- [x] Human Owner accepted the exact SPEC-022 contract on 2026-10-02.

## Required validation

- documentation cross-reference audit against SPEC-002, SPEC-008, TASK-087 and static-data delivery;
- exact-text audit for conflicting source-policy/runtime-fetch language;
- roadmap generation/check;
- `git diff --check`;
- independent QA review focused on source authority, replay/publication immutability and accidental
  network dependency.

## Dependencies

- accepted SPEC-002/SPEC-008/TASK-087 publication architecture;
- Human direction on 2026-10-02: all normal data local/immutable; external hot data only when
  explicitly necessary and escalated for decision.

## Risks / irreversible actions

- treating PokéAPI as globally primary could weaken exact historical Move/form evidence;
- mapping an absent dataset row to the current Learnset HTTP-404 fallback would silently change
  canonical Learnset semantics;
- mutable upstream revision identifiers could make provenance non-reproducible;
- hidden network fallback would violate the Human-approved local-data invariant.

No irreversible action is owned by this coordination task.

## Readiness / execution gate

The Class-A source/provenance contract is accepted. A separately scoped implementation task may become
READY. External ACQUIRE operations, publication of a new `gameDataVersion`, Git-history operations and
deployment/public enablement remain separately gated.

## Independent pre-implementation QA evidence — 2026-10-02

- Final exact-current verdict: **PRE-IMPLEMENTATION READY**.
- Findings: **P0/P1/P2/P3 = 0/0/0/0**.
- The review specifically re-cleared the one-shot affirmative ACQUIRE gate, SPEC-002 §12.1/§12.2
  relocation to ACQUIRE, canonical SourceSnapshotRecord/hash preimage, schema-5 multi-file fact
  provenance, exact-form generation boundary, current-vs-proposed roadmap authority and nullable
  upstream-revision handling for mutable web providers.
- Validation: `pnpm roadmap:check` PASS with 113 tasks; `git diff --check` PASS.
- Human Owner accepted the exact QA-cleared contract on 2026-10-02.
