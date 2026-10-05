# TASK-118 — Hunt Published Catalog Backend Adoption

## Metadata

- State: DRAFT
- Readiness note: SPEC-018 is already Owner-approved; this task exists to move its preserved backend source under the correct backend owner/review boundary before implementation/integration.
- Class: B — backend implementation of an accepted read-only contract
- Owner: Lead Developer
- Owner execution surface: UNASSIGNED — explicit backend implementation authorization required before code changes
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent backend/API reviewer
- Auditor: Security Reviewer
- Auditor execution surface: independent API/auth/privacy audit
- Consultants: N/A — contract semantics are owned by SPEC-018; any expansion must escalate to Class-A
- Consultant execution surface(s): N/A
- Specs: APPROVED SPEC-018; SPEC-002 / SPEC-011 / SPEC-015
- Related: TASK-039 / TASK-104
- Branch: not created
- Worktree: not created

## Objective

Adopt and implement the already-approved SPEC-018 authenticated read-only Zone/Hunt publication transport under a correctly authorized backend owner, without importing the unowned historical API slice from the old FE worktree as accepted implementation by implication.

## Context

- TASK-039's forward client is integrated and fail-closed when the publication transport is absent.
- SPEC-018 already defines the descriptor plus immutable manifest/Zone/Hunt artifact contract.
- TASK-104 explicitly records that the historical backend implementation lived inside an FE-owned TASK-039 worktree and therefore did not have valid backend ownership/acceptance.
- Encounter preview is **not** part of SPEC-018 and is owned separately by TASK-119/SPEC-024.

## Scope

- Re-implement the SPEC-018 backend transport against canonical `main`, or deliberately adopt the preserved historical FE-owned TASK-039 source under the new backend ownership/review boundary; canonical `main` itself does not currently contain that transport.
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

- [ ] Backend implementation matches SPEC-018 exactly and is owned/reviewed as backend work.
- [ ] Only the exact accepted manifest/Zone/Hunt artifact allowlist is exposed.
- [ ] Current new-operation release selection and independent bundle pinning fail closed on mismatch/unavailability.
- [ ] Auth/session, redirect, cache, error-size, artifact-size and malformed/tampered publication cases have negative tests.
- [ ] No endpoint exposes Encounter definitions, Player eligibility, wild private state or mutation authority.
- [ ] Independent QA and security audit report no unresolved P0/P1 before integration.

## Validation / tests

- [ ] Focused API unit tests for descriptor/artifact routes and release switching.
- [ ] Negative auth/Player/session/redirect/hash/schema/size/orphan/duplicate tests from SPEC-018 acceptance.
- [ ] API lint/typecheck/test/build and Worker dry-run.
- [ ] Real immutable publication roundtrip in a non-production test surface before final acceptance.

## Dependencies

- APPROVED SPEC-018.
- TASK-104 backend ownership boundary.

TASK-039 is the downstream consumer and remains fail-closed until this transport is available; it is not an implementation prerequisite for TASK-118.

## Risks / irreversible actions

- Historical source must not be treated as accepted merely because it exists in an old worktree.
- No deploy, production-pair activation, persistent migration or public-feed enablement is authorized by this DRAFT.

## Expected files / boundaries

- `apps/api/src/hunts/*` read-only catalog transport and tests.
- `apps/api/src/auth/http.ts` route registration only if required by SPEC-018 implementation.
- No frontend semantics changes except integration tests needed to prove the existing fail-closed client contract.

## Readiness / execution gate

Promotion from DRAFT requires explicit backend implementation authorization and an assigned backend owner/reviewer/auditor execution surface.
