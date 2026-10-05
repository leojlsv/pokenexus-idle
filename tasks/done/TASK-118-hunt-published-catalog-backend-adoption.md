# TASK-118 — Hunt Published Catalog Backend Adoption

## Metadata

- State: DONE
- Review note: implementation, independent backend QA/security review and repository-history integration completed on 2026-10-05 with no unresolved P0/P1; one bounded performance P2 is explicitly accepted as non-blocking. Deploy/public enablement, production-pair activation and persistent migration remain separately gated.
- Class: B — backend implementation of an accepted read-only contract
- Owner: Lead Developer
- Owner execution surface: ChatGPT prime (current Human-directed continuation; isolated TASK-118 worktree)
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent ChatGPT delegated backend/API reviewer
- Auditor: Security Reviewer
- Auditor execution surface: independent ChatGPT delegated API/auth/privacy auditor
- Consultants: N/A — contract semantics are owned by SPEC-018; any expansion must escalate to Class-A
- Consultant execution surface(s): N/A
- Specs: APPROVED SPEC-018; SPEC-002 / SPEC-011 / SPEC-015
- Related: TASK-039 / TASK-104
- Branch: `feat/TASK-118-hunt-published-catalog-backend-adoption`
- Worktree: `.worktrees/TASK-118-hunt-published-catalog-backend-adoption`
- Human gate: current Human-directed `continue` authorized completion of the saved integration plan after the independent QA/security gate; feature commit `07771e9`, canonical-main merge `8c1eab0` and push to `origin/main` completed on 2026-10-05. Deploy/migration/public enablement remain separate.

## Objective

Adopt and implement the already-approved SPEC-018 authenticated read-only Zone/Hunt publication transport under a correctly authorized backend owner, without importing the unowned historical API slice from the old FE worktree as accepted implementation by implication.

## Context

- TASK-039's forward client is integrated and fail-closed when the publication transport is absent.
- SPEC-018 already defines the descriptor plus immutable manifest/Zone/Hunt artifact contract.
- TASK-104 explicitly records that the historical backend implementation lived inside an FE-owned TASK-039 worktree and therefore did not have valid backend ownership/acceptance.
- Encounter preview is **not** part of SPEC-018 and is owned separately by TASK-119/SPEC-024.

## Scope

- Re-implement the SPEC-018 backend transport against canonical `main`, or deliberately adopt the preserved historical FE-owned TASK-039 source under the new backend ownership/review boundary. The accepted backend-owned implementation is now integrated into canonical `main`.
- Authenticated self-scoped `GET /player/hunts/catalog-release`.
- Authenticated same-origin immutable artifact reads for the exact SPEC-018 allowlist: manifest, `catalogs/zones.json`, `catalogs/hunts.json`.
- Exact release/pin/hash/schema/size/count/referential-integrity validation and fail-closed behavior required by SPEC-018.
- Explicit route registration, auth/session behavior, cache headers, redirect rejection and error-shape tests.
- Backend QA plus security/privacy review before repository integration.

## Out of scope

- `catalogs/encounter-definitions.json` or any Encounter preview transport.
- Player-specific Hunt eligibility or Start mutation semantics.
- Public CombatPresentation feed enablement.
- Persistent migration, production deployment, CDN/R2 provisioning or production-pair activation.
- Any change to SPEC-018 semantics without a separate Class-A amendment.

## Acceptance criteria

- [x] Backend implementation matches SPEC-018's exact three-file transport, with schema-5 runtime compatibility inherited only from the separately accepted TASK-115 runtime cutover; historical schema-4 remains supported and schema-3/future unsupported schemas fail closed.
- [x] Only the exact accepted manifest/Zone/Hunt artifact allowlist is exposed.
- [x] Current new-operation release selection and independent bundle pinning fail closed on mismatch/unavailability.
- [x] Auth/session, redirect, cache, bounded-error, artifact-size, malformed/tampered, duplicate/orphan and release-drift cases have negative tests.
- [x] No endpoint exposes Encounter definitions, Player eligibility, wild private state or mutation authority; TASK-103 presentation remains unregistered.
- [x] Independent QA and security audit report no unresolved P0/P1 before integration.

## Validation / tests

- [x] Focused API unit tests for descriptor/artifact routes and release switching: 50/50 PASS across catalog/http/auth/index focused files after final negative-coverage increment.
- [x] Negative auth/Player/session/redirect/hash/schema/size/orphan/duplicate tests from SPEC-018 acceptance.
- [x] API lint/typecheck/full unit test/build and Worker dry-run: API 250/250 PASS; lint/typecheck PASS; Wrangler API build dry-run PASS; Worker compatibility dry-run PASS.
- [x] Real immutable publication roundtrip in a non-production test surface: exact current `game-data-core-kanto-johto-v5` schema-5 bundle `sha256:565cdd360c1b29dc3607696299244279a8d0c3f488d4544c41c62ed47592f782`, plus explicit historical schema-4 compatibility regression.

## Dependencies

- APPROVED SPEC-018.
- TASK-104 backend ownership boundary.

TASK-039 is the downstream consumer and was never an implementation prerequisite for TASK-118. TASK-118 now closes the source-side published Zone/Hunt catalog transport blocker; deployed route/origin availability and TASK-119 Encounter preview remain separate TASK-039 acceptance gates.

## Risks / irreversible actions

- Historical source must not be treated as accepted merely because it exists in an old worktree.
- No deploy, production-pair activation, persistent migration or public-feed enablement is authorized by this task or its implementation candidate.

## Expected files / boundaries

- `apps/api/src/hunts/*` read-only catalog transport and tests.
- `apps/api/src/auth/http.ts` route registration only if required by SPEC-018 implementation.
- No frontend semantics changes except integration tests needed to prove the existing fail-closed client contract.

## Implementation candidate evidence — 2026-10-05

- Historical FE-owned SPEC-018 source was inspected read-only and deliberately re-adopted under this backend-owned task; the historical worktree was not mutated.
- The historical strict-schema-4 gate was reconciled with the later accepted TASK-115 runtime authority: runtime delivery already accepts exactly schemas 3/4/5, while this catalog transport accepts only schema 4/5 because SPEC-018 requires PvE Zone/Hunt artifacts and schema 3 lacks that accepted envelope. The exposed allowlist remains unchanged: manifest, Zones, Hunts only.
- Default/current test authority uses the exact management-first production pair on `game-data-core-kanto-johto-v5`; production catalog bundle pinning is independently resolved before any publication bytes are accepted.
- HTTP routes require authenticated self-scoped Player existence, use the non-activity read-session guard, expose `private, no-store`, preserve exact verified raw JSON bytes, return bounded generic 404/503 envelopes and never invoke Hunt mutation application work.
- `catalogs/encounter-definitions.json`, Species and arbitrary artifact paths are rejected before release-provider work; TASK-103 presentation GET remains absent.
- Residual bounded P2: each descriptor/artifact request currently re-resolves the selected release and re-verifies the three immutable origin files rather than caching a verified release. This preserves SPEC-018's release-switch fail-closed semantics but costs repeated bounded origin reads; any cache/performance optimization must preserve exact release/pin invalidation and is not required for correctness acceptance.
- Dependencies were materialized with `pnpm install --offline --frozen-lockfile` only (`272` reused, `0` downloaded); no package/lock changes occurred.
- No migration, deploy, production-pair activation, public CombatPresentation enablement, commit, merge or push was performed by this implementation candidate.

## Independent backend QA — 2026-10-05

- Exact-current read-only QA found **no P0/P1** and confirmed the implementation matches APPROVED SPEC-018 plus the separately accepted TASK-115 schema-5 compatibility boundary.
- Reviewer independently confirmed authenticated self-scope, exact current new-operation authority selection, independent production catalog/bundle pinning, schema `4/5` only, exact three-file allowlist, canonical/hash/count/join validation, bounded origin/bytes, `private, no-store`, no session-activity touch, Player existence, generic fail-closed release drift/errors, no Encounter/private/admission/mutation scope and no TASK-103 presentation route registration.
- Reviewer validation: focused **50/50 PASS**, full API **250/250 PASS**, API typecheck/lint/Wrangler dry-run PASS, roadmap **122** PASS and `git diff --check` PASS.
- Reviewer recorded the already-known bounded performance P2: a descriptor plus three artifact reads can cause four independent release verifications (up to twelve bounded origin reads). Correctness/release-switch semantics remain fail-closed and no accepted performance budget is violated, so this remains a documented non-blocking follow-up rather than a cache change inside TASK-118.
- Reviewer also found stale lifecycle wording that still referred to this task as `DRAFT`; that documentation-only P2 was corrected when the task advanced to ACCEPTANCE.

## Independent security/privacy audit — 2026-10-05

- Exact-current read-only security/privacy re-gate returned **READY — no new P0/P1/P2**.
- Reviewer confirmed trusted-config origin containment, HTTPS except loopback HTTP, no URL credentials/query/hash, same-origin/root-path enforcement, redirect rejection, exact route allowlist before release resolution, self-scoped auth with no client Player ID, missing-Player 404, non-activity session reads, GET/no-CSRF correctness, `private, no-store`, generic bounded errors, byte/row ceilings, streaming size enforcement, canonical/hash/schema verification, independent production pair/bundle pinning, release-switch fail-closed behavior and Worker-safe runtime imports.
- TASK-103 presentation remains unregistered; no mutation, migration, commit, merge, push, deploy or public enablement occurred during the audit.
- The known repeated-verification performance P2 was explicitly classified as bounded/non-blocking and **not** a security/privacy defect.

## Repository-history integration — 2026-10-05

- Accepted feature snapshot committed as `07771e9` (`feat(api): adopt Hunt published catalog backend`) and pushed to `origin/feat/TASK-118-hunt-published-catalog-backend-adoption`.
- Canonical `main` merged the accepted feature as `8c1eab0` (`merge: integrate TASK-118 Hunt published catalog backend`) and pushed that source integration to `origin/main`.
- Merge-tree equivalence was exact: feature commit tree and merge commit tree both resolve to `38c482ee10be459ae88295a28a2526e48cc061ba`; no source delta was introduced by integration.
- Post-acceptance committed-source API validation reran **250/250 PASS** across 30 files. Roadmap check and `git diff --check` remained PASS.
- No deploy, persistent migration, production-pair activation, CDN/R2 provisioning or public CombatPresentation enablement was performed. Local immutable publication tests are not production deployment proof.
