# TASK-140 — Skadyn Durable Identity, Security and Schema Cutover

## Metadata

- State: PLANNED
- Class: A — high-impact database and Auth/security identity migration, durable formats and published authority
- Owner: LD → assigned implementation worker (pending READY)
- Owner execution surface: separately isolated Chat On Steroids Core worktree (not yet created)
- Reviewer: independent QA (database old/new state, replay, browser and security regressions)
- Reviewer execution surface: independent ChatGPT worker strict read-only at REVIEW
- Auditor: Independent Auditor (database/auth/security/deterministic provenance, required pre/post)
- Auditor execution surface: independent ChatGPT worker strict read-only
- Consultants: N/A (no gameplay rule changes)
- Consultant execution surface: N/A
- Branch/worktree: not created; **never** implement this cross-domain migration in the dirty TASK-136 main by blind replace
- Dependencies: Human-accepted SPEC-031 / TASK-138 and bounded TASK-139 source integration; existing TASK-136/132 schema/launcher change owners reconciled; no direct persistent DB migration authority granted

## Objective and constraints

Migrate the physical application schema to `skadyn`, new project-specific `SKADYN_*` env config, new local operator state/container identity and canonical browser cookie names with guarded legacy continuity. Introduce versioned `skadyn.*` protocols, decoders and new content **only where** approved compatibility and provenance tests allow, preserving historic v1-vN opaque strings, HMAC/CSRF/Genetics proof domains, database migration file checksums and pinned published data hashes. Preserve existing credentials/sessions and WebAuthn `localhost` RP/Origin and userHandle bindings. No secrets exposure, no DB reset, no silent asset rewrite, no unauthorized Cloudflare/DO identity rename.

**Additional current external identity requiring a deliberate sub-gate:** `packages/game-data/src/ingestion.ts` uses `PokeNexusGameDataBot/1.0` as an outbound maintenance User-Agent; changing it may alter robots.txt group matching and the accepted crawler policy. Include a versioned Skadyn User-Agent proposal with deterministic robots/whitelist/backoff conformance before any outbound use. Do not mechanically change crawler identity or run a live crawl as part of TASK-139. Physical repository path and deployed Worker/DO names also await their own operational identity gate.

## Exit criteria

- Disposable PostgreSQL 17 proof for fresh and existing full/Alpha/telemetry prefixes, ledger checksum preservation, schema migration/rollback and unchanged row counts/identity, restore and no double issuance.
- Independent replay/integrity proof for old/new checkpoints, rules, cursor HMAC, old/new cookies + CSRF, account/passwordless passkey continuity; isolated dual-browser test only after TASK-136 Security P1 closed.
- QA and Independent Auditor READY, required Human Class-A implementation/merge and separate live DB/provider cutover approval; no persistent database touched by implementation tests.

## Mandatory independent stop/go checkpoints

1. **G0 Security/ownership baseline:** coordinate with TASK-136 Security E0, verify safe Vite secret exposure boundary with sentinel only, check existing Alpha/Pre-alpha owner state, no real-key or persistent-volume changes; independent QA/IA.
2. **G1 Operators/config/browser storage:** fail-closed `SKADYN_*` transition, owner-scoped adopted old Docker/local state with exact secrets and ACL, idempotent pending commands/caches; independent scoped regression.
3. **G2 PostgreSQL:** new migrator plus prebuilt matching SQL consumers, exact legacy ledger digest preservation, fresh/full/selected Alpha/optional telemetry scenarios, quiesced transactional schema cutover and restore; independent DB/IA, no live database operation.
4. **G3 Auth cookie/CSRF:** dual-reader, new-only issuance, same validated principal bearer, purpose-bound HMAC v2, timeout/no-extension, two-browser and multi-Set-Cookie proof; independent Auth/Security QA.
5. **G4 Versioned payloads:** frozen Genetics/content/item identities and historic replay, reader-first DB/client expand then optionally accepted new-format activation; independent deterministic replay and integrity QA.
6. **G5 Consolidation:** no current-source legacy branding outside allowlisted historic/compatibility boundaries; full tests/Worker dry-runs, independent final QA/IA, separate Human Class-A history approval; live DB/Worker/public publication remain additional gates.

These gates may be split into smaller implementation tasks with separately assigned owners under approved SPEC-031 if integration/risk review recommends it. A passing earlier stage does not pre-authorize the next destructive or public operation.
