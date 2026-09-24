# TASK-034 — PvE World/Zone, Encounter & Hunt Data

## Metadata

- State: ACCEPTANCE
- Class: B
- Owner: Lead Developer
- Owner execution surface: ChatGPT prime/direct implementation (explicit Lead Developer assignment;
  GitHub Copilot CLI is unavailable in the current workspace)
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: N/A
- Auditor execution surface: N/A
- Consultants: N/A
- Consultant execution surface(s): N/A
- Human gate: content-sample validation before final acceptance, canonical publication/promotion or
  repository/history integration
- Specs:
  - `docs/specs/SPEC-002-static-game-data-and-versioning.md`
  - `docs/specs/SPEC-013-pve-world-map-zone-solo-hunt-rules-lifecycle.md`
- Related specs: SPEC-006, SPEC-007, SPEC-009, SPEC-012
- Related ADRs: ADR-002, ADR-004, ADR-005
- Related tasks: TASK-006, TASK-021, TASK-022, TASK-023, TASK-033, TASK-034, TASK-035, TASK-036,
  TASK-037, TASK-038, TASK-041, TASK-087, TASK-091
- Branch: `feat/TASK-034-pve-world-zone-hunt-data`
- Worktree: `.worktrees/TASK-034-pve-world-zone-hunt-data`

## Objective

Implement the first immutable, deterministic PokeNexus Solo Hunt content pack under APPROVED
SPEC-013 so downstream TASK-035 can select exact Zone/Hunt/Encounter content without inventing
topology, level, reward, recovery or availability semantics.

The implementation must extend the SPEC-002 game-data publication schema rather than create a second
content authority. Existing immutable schema-v3 publications must remain exactly loadable/replayable.

## Accepted contract baseline

TASK-034 consumes, and must not reinterpret, these approved decisions:

- baseline topology is one World/Map navigation surface → `ZoneId` → Hunt definitions; no canonical
  `MapId` exists in v1;
- Zone/Hunt availability may use explicit Player Level and explicit prerequisite completion only;
  prerequisite completion is the normal sequencing tool and Player Level is sparse/coarse only;
- one active Solo Hunt per Player and all command/idempotency semantics remain TASK-033/TASK-038
  authority, not static-content behavior;
- encounter selection is deterministic from server-owned/pinned inputs; TASK-034 owns tables and
  TASK-035 owns the selection algorithm;
- unresolved same-Zone selection is preserved across stop/restart; content must not create a reroll
  escape hatch;
- every admitted Species/form + encounter Level must pass TASK-091 production playability evidence;
  zero progress-capable executable choices at an admission Level are forbidden;
- each successfully completed Encounter owns one fixed non-negative Pokémon-XP pool; Player XP is a
  separate optional sibling content value; item-drop inputs are versioned content;
- Capture Option B, capture probability/outcome and item debit are TASK-036-owned and are not encoded
  as alternate combat/capture mechanics here;
- fresh Hunt recovery/setup uses an explicit visible deterministic non-zero duration; the value is
  content and is subject to the required Human sample gate;
- published history pins immutable content and never falls back to latest/current data.

## Scope

### 1. Schema-v4 PvE content extension

- Extend the logical `GameDataBundle` through a new accepted schema version for PvE content while
  preserving read/verification compatibility for retained schema-v3 publications.
- Add canonical PvE definition identities/records for:
  - Zones;
  - Hunts bound to exactly one Zone;
  - Encounter definitions/table entries bound to exactly one Hunt.
- Keep authoritative relationships explicit by ID; display ordering/labels must never grant authority.
- Publish PvE artifacts through the existing deterministic canonical JSON, artifact hash, manifest,
  `bundleHash` and immutable `gameDataVersion` framework.
- Internally designed PvE content is bundle content, not fabricated external-source provenance. Existing
  factual source/provenance inventories remain truthful and are not padded with fake provider records.

### 2. Zone and Hunt availability/content

- Define stable `ZoneId` and Hunt-definition identities.
- Support exact deterministic ordering for navigation/listing without inventing `MapId`.
- Encode only accepted v1 availability inputs:
  - optional minimum Player Level;
  - optional prerequisite completed Hunt/content identity.
- Define one positive recovery/setup duration per Hunt/content configuration; zero is invalid.
- Reject missing/duplicate/unresolved Zone/Hunt/prerequisite references and prerequisite cycles.

### 3. Encounter table content

- Each Encounter definition/table row binds:
  - exact Species/form `SpeciesId`;
  - deterministic positive selection weight;
  - explicit inclusive encounter Level band;
  - fixed non-negative Pokémon-XP pool;
  - optional non-negative Player-XP amount;
  - zero or more item-drop content inputs referencing canonical `ItemId` values.
- Item-drop inputs may express deterministic quantity plus bounded chance/weight content, but TASK-036
  remains the resolution/RNG/reward-application authority.
- Every Hunt must contain at least one Encounter entry and all selection weights must be positive safe
  integers.
- Every proposed encounter Level in a published band must satisfy the TASK-091 playability gate for its
  Species/form; no zero-progress-capable admission may publish.

### 4. First-release content candidate

- Materialize a deliberately small Kanto/Johto-first candidate suitable for Human review rather than
  pretending all 293 Species/forms are release-ready.
- Use only Species/forms present in the retained canonical v2 publication and proven production-playable
  at their proposed encounter Levels.
- Prefer prerequisite sequencing over stacked Player-Level gates; any Player-Level gate must have an
  explicit content reason and the Human sample must surface its expected progression implication.
- Use only currently canonical ItemIds for non-empty drops. If no currently canonical item is suitable
  for a reward role, publish an empty item-drop list rather than inventing an item or silently promoting
  a candidate-only mechanic.
- Keep reward/recovery values conservative and reviewable; they are content candidates until the Human
  content-sample gate passes.

### 5. Validation and runtime loading

- Extend schema/canonicalization/publication/runtime loading tests for the new PvE artifacts.
- Validate referential closure against Species/Item catalogs and Zone/Hunt/Encounter identities.
- Validate deterministic ordering/serialization/hashes and byte-identical reproduction.
- Validate historical schema-v3 v1/v2 publications still load with their original manifest/bundleHash
  identities and are not rewritten in place.
- Expose Cloudflare/browser-safe runtime reads for exact PvE content under an explicitly selected
  `gameDataVersion`; no latest-version lookup.

### 6. Human-review evidence

Before any first real canonical PvE publication/promotion or TASK-034 final acceptance, generate a
compact review artifact/report containing at least:

- Zone/Hunt IDs and sequencing/gates;
- recovery/setup duration;
- each encounter Species/form, Level band and weight;
- TASK-091 playability metrics at every admitted threshold/band edge and any one-choice bottlenecks;
- Pokémon XP / Player XP and item-drop inputs;
- deterministic content/game-data identity and candidate hashes;
- expected F2P/progression implications of any Player-Level threshold.

The Human Owner validates this sample before canonical publication/promotion.

## Out of scope

- Solo Hunt simulation/orchestration, RNG implementation or Move policy — TASK-035;
- capture probability/outcome/Pokémon construction or reward application — TASK-036;
- checkpoint/offline engine — TASK-037;
- API/SQL/persistence command orchestration — TASK-038;
- Card/Visual UI — TASK-039/040;
- new Pokémon factual source ingestion or rewriting retained v1/v2 publications;
- new Move/Ability mechanics or promotion of TASK-091 unsupported content;
- new items, currencies, stamina, paid access, entry fees or monetization mechanics;
- source-derived franchise encounter/location tables; PokeNexus content is explicitly authored;
- Git/history integration before final acceptance and separate repository/history authorization.

## Acceptance criteria

- [x] TASK-034 schema extension has explicit versioning and retained schema-v3 load compatibility.
- [x] PvE Zone/Hunt/Encounter definitions are canonically parsed, validated, serialized and hashed.
- [x] No canonical `MapId` is introduced; every Hunt resolves one Zone and every Encounter one Hunt.
- [x] Availability uses only accepted prerequisite/optional Player-Level inputs; reference closure and
      cycle validation fail closed.
- [x] Recovery/setup duration is explicit and strictly positive.
- [x] Every Encounter has a positive weight, valid Level band and canonical Species reference.
- [x] Every admitted Species/Level passes TASK-091 progress-capable production playability; zero-choice
      admissions fail validation and one-choice bottlenecks are surfaced in review evidence.
- [x] Encounter Pokémon-XP pool, optional Player XP and item-drop inputs are deterministic non-negative
      content; item references resolve exactly when present.
- [x] Runtime loading requires an explicit `gameDataVersion` and supports historical retained versions
      without latest/current fallback.
- [x] Deterministic serialization/hash and artifact-manifest closure tests pass for PvE artifacts.
- [x] Existing immutable v1/v2 `gameDataVersion` + `bundleHash` identities remain unchanged/loadable.
- [x] Full relevant package tests/typecheck/lint/build and Worker compatibility pass.
- [x] Independent QA has no unresolved P0/P1.
- [x] Human Owner validates the first-release content sample before canonical publication/promotion and
      final acceptance.

### Human content-sample approval

- Approved by: Human Owner
- Approved at: `2026-09-24T00:50:52Z`
- Approved review hash:
  `sha256:ea956e6932bb4d2587883a0ffd8e5e2f90ce5f16559c8866dd274c2acd403ad6`
- Approved content commitment:
  `sha256:b3cb6b8da30b57bbdf12469077269b57c8abace6aa62ca0179270c4885e3486e`
- Approved candidate bundle:
  `sha256:ccef4592bd22aefe2cefc35359bd030c42c09717d40a0bf569f75d8074c3907e`
- Human response: `Ok, aprovado`

### Canonical publication

- Final `gameDataVersion`: `game-data-core-kanto-johto-v3`
- Final schema: `schemaVersion=4`, `pveContentSchemaVersion=1`
- Final `bundleHash`:
  `sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559`
- Published at: `2026-09-24T00:55:51.000Z`
- Immutable directory:
  `packages/game-data/published/version-e7903d8b32ee60805f55ef36c8fe735a517c858f700e92459c3b239a7560e1e2`
- Publication receipt:
  `packages/game-data/reviews/task-034/verdant-edge-v1-publication.json`
  (SHA-256 `080985F64D3468E3FAE0B8AD8241AB0F9B501E950D96957D807676B54E835D01`)
- v1/v2 publication manifests remain byte-identical to canonical main.

## Validation / tests

At minimum:

```text
corepack pnpm --filter @pokenexus/game-types test
corepack pnpm --filter @pokenexus/game-types typecheck
corepack pnpm --filter @pokenexus/game-data test
corepack pnpm --filter @pokenexus/game-data typecheck
corepack pnpm --filter @pokenexus/game-data build
corepack pnpm --filter @pokenexus/game-data test:worker-compat
corepack pnpm roadmap:check
git diff --check
```

Also run targeted tests proving:

- schema-v3 retained publication loading;
- schema-v4 canonicalization and publication hash reproducibility;
- Zone/Hunt/Encounter duplicate/reference/cycle rejection;
- invalid Level bands/weights/reward/drop inputs reject;
- unresolved Species/Item IDs reject;
- zero progress-capable playability rejects at every proposed admitted Level;
- candidate review report is deterministic and contains the required Human-sample fields.

## ACCEPTANCE gate

TASK-034 entered ACCEPTANCE on 2026-09-24 after the exact uncommitted implementation/publication
snapshot completed every technical, QA and Human content gate:

- Human Owner content-sample validation: APPROVED at `2026-09-24T00:50:52Z` against review hash
  `sha256:ea956e6932bb4d2587883a0ffd8e5e2f90ce5f16559c8866dd274c2acd403ad6`;
- canonical schema-v4 publication: `game-data-core-kanto-johto-v3`, bundle
  `sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559`;
- post-publication independent QA: READY, P0/P1/P2/P3 = 0/0/0/0;
- v1/v2 retained publications remain byte-identical to canonical main and the seven retained factual
  v3 artifacts plus provenance/source inventory remain byte-identical to v2;
- game-data full suite: 365 passed / 1 live skipped; typecheck/lint/build/Worker compatibility PASS;
- game-core regression: 280/280 PASS with production v2 binding untouched;
- sanity harness current v3: 9/9 audits + 10/10 assertions PASS; v3-vs-v2 comparison PASS with zero
  structural regressions;
- publication is atomic/idempotent and the publication receipt binds the Human approval to the final
  immutable v3 release.

Repository/history completion remains a separate Human Owner authorization gate. No commit, push,
merge or other Git-history mutation is authorized by this ACCEPTANCE transition. TASK-095 is
materialized READY but must not activate until TASK-034 is integrated into canonical main.

### Repository/history authorization

- Authorized by: Human Owner
- Authorized at: `2026-09-24T01:53:29Z`
- Human response: `Aprovado`
- Authorization scope: commit the accepted TASK-034 snapshot, integrate it into canonical `main`,
  complete the TASK-034 lifecycle/history closure, then allow TASK-095 to activate from that exact
  integrated v3 publication.

## Dependencies

- TASK-006 / SPEC-002 — DONE / APPROVED.
- TASK-021 / SPEC-006 — DONE / APPROVED.
- TASK-022 / SPEC-007 — DONE / APPROVED.
- TASK-023 / SPEC-009 — DONE / APPROVED.
- TASK-033 / SPEC-013 — DONE / APPROVED.
- TASK-087 — DONE; immutable v1/v2 canonical game-data publications retained.
- TASK-091 / SPEC-012 — DONE / APPROVED; production playability evidence available.
- ADR-002 / ADR-004 / ADR-005 — ACCEPTED.

## Risks / irreversible actions

- Extending the current static-data schema without explicit retained-version compatibility would break
  authoritative replay/history.
- Treating authored PokeNexus Zone/Hunt content as external factual provenance would corrupt the
  SPEC-002 provenance model.
- A zero-progress-capable Species/Level admission would create an unwinnable production encounter.
- Reward/recovery numbers are player-facing balance content and require the explicit Human sample gate.
- Existing item catalog coverage may not contain a suitable baseline reward item; empty drop tables are
  safer than inventing unsupported inventory semantics.
- Canonical publication was completed only after the Human sample approval; Git/history integration
  remains the sole separately gated irreversible repository action.

## Expected files / boundaries

```text
tasks/active/TASK-034-pve-world-zone-encounter-hunt-data.md
packages/game-types/src/**
packages/game-data/src/**
packages/game-data/integration/**
packages/game-data/profiles/** or an explicit authored PvE content input
packages/game-data/published/** only after Human content-sample approval
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

## Current execution state

TASK-034 is in ACCEPTANCE on `feat/TASK-034-pve-world-zone-hunt-data`. The Human content sample is approved
and the exact schema-v4 release is canonically published locally as `game-data-core-kanto-johto-v3`
with bundle `sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559`.
Post-publication independent QA is READY with P0/P1/P2/P3 = 0/0/0/0. Git/history integration is the
sole remaining TASK-034 closure gate and remains separately gated. TASK-095 is READY but inactive until
that integration; it must publish the exact v3 production-combat catalog/rules rebind before TASK-035
may perform authoritative Solo Hunt operations. The existing v2 production binding is not reused by
inference.
