# TASK-138 — Skadyn Technical Identity Migration Contract

## Metadata

- State: ACCEPTANCE
- Readiness: Class-A SPEC-031 Human-approved on 2026-10-15 after independent pre-implementation QA and Security/DB Auditor 0/0/0; technical implementation delegated to separate TASK-139/140 owners and gates.
- Class: A — authentication/security, persistent data schema, immutable protocol and migration contracts
- Owner: PM → ChatGPT prime (planning/specification only; **not** implementation owner of TASK-139/140)
- Owner execution surface: Chat On Steroids Core (scoped task/spec/roadmap documentation only)
- Control branch: `main`
- Control worktree: `.`
- Reviewer: independent worker-1 QA **READY FOR HUMAN CLASS-A DRAFT REVIEW P0/P1/P2 = 0/0/0** (final exact-current source/protocol/schema review)
- Reviewer execution surface: independent ChatGPT worker via Chat On Steroids Core, read-only
- Auditor: independent worker-2 Security/DB IA **READY FOR HUMAN CLASS-A DRAFT REVIEW P0/P1/P2 = 0/0/0** (final exact-current pre-implementation contract review; repeat on implementation)
- Auditor execution surface: independent ChatGPT worker via Chat On Steroids Core, read-only
- Consultants: N/A — technical identity migration does not change gameplay/economy rules
- Consultant execution surface: N/A
- Branch: not created for contract planning (Class-A contract accepted on `main`; downstream implementation isolated in TASK-139/140)
- Worktree: not created for contract planning (canonical `main` owns this accepted source/spec decision)
- Spec: `docs/specs/SPEC-031-skadyn-technical-identity-migration.md` (**APPROVED 2026-10-15**)
- Dependencies: TASK-137 local copy review remains separate; avoid competing with TASK-136 active source and TASK-132 telemetry migration; ADR-006, SPEC-004/017 and published game-data history remain stable, with only the approved SPEC-031 forward amendments eligible for separately reviewed implementation.

## Objective

Replace *current technical project identity* `pokenexus` with canonical `skadyn` across workspaces, local runtime, database and newly issued contracts, without renaming user-visible artwork inadvertently or invalidating preexisting accounts, passkeys, durable data, signed/HMAC authority, historical migration checksums or immutable game-data releases.

## Scope / required decisions

1. Approve target conventions: private `@skadyn/*`, root `skadyn-idle`, `SKADYN_*` project env keys, PostgreSQL `skadyn`, canonical new `__Host-skadyn_*` cookies, new versioned `skadyn.*` durable protocol families; untouched generic `AUTH_*`, `HYPERDRIVE` and actual WebAuthn RP host/origins.
2. Approve migration/compatibility versus forced reset: freeze historic SQL/checksums and content-addressed publications, retain frozen read/verify for legacy exact-format identifiers, new writes only via explicit version bump and validated readers.
3. Separate stateless package/build/config refactor TASK-139 from high-risk database/security/protocol and local runtime identity cutover TASK-140, with prior TASK-136/132 shared file reconciliation.
4. Define fail-closed DB ledger migration, old/new cookie precedence and lifetime, HMAC/CSRF and Genetics authority preservation, stored JSON + game-data publication compatibility, backups/recovery and real-browser acceptance.
5. Separate repo physical relocation, Git remote naming, Cloudflare/DO deployed-resource cutover and domain changes from this plan. No Alpha real key activation until TASK-136 security P1 independently fixed.

## Out of scope

- No package/import/env/schema/protocol/security implementation until Class-A spec acceptance.
- No broad `pokenexus` replace, SQL mutation, DB reset, Docker volume destruction, secret rotation, cookie rollout, signed artifact rewrite or permission to commit/merge/push/deploy.
- No renegotiation of the latest design name split: **Skadyn Idle** internal implementation target, **Skadyn Poke Idle** preferred visible art lockup; Human still has to inspect current TASK-137 copy.

## Acceptance criteria (planning gate)

- `SPEC-031` enumerates each renamed domain, exact immutable exceptions, compatibility algorithms, phase order, provenance/rollback and tests; no undefined old/new simultaneous cookie/session semantics.
- Independent QA and required Independent Auditor pre-implementation source reviews record P0/P1/P2 with acceptable disposition.
- Human Owner explicitly approves Class-A contract and migration constraints **before** advancing implementation task to READY.
- Roadmap/task consistency checks pass (documentation-only); technical repo and persistent Alpha environment unchanged.

## Evidence

- Current `main` HEAD at discovery: `558adb6`, extremely dirty due to pre-existing TASK-136 and telemetry; source-only inventory found eight `@pokenexus/*` packages, 30 distinct `POKENEXUS_*` names and more than 250 nonhistorical source/config files mentioning PokeNexus.
- `packages/database/src/migrations.ts` enforces exact SQL SHA-256 checksum and contiguous ledger; migration 0016 telemetry excluded from TASK-136 Alpha runner, 0017 Alpha selected; simply renaming schema or editing historic SQL is unsafe.
- Auth cookie names, CSRF HMAC domains, encounter individualization HMAC names, pinned production-artifact hashes, checkpoint and presentation version strings and published game-data manifest IDs are durable authority rather than display strings.
- **2026-10-15 pre-implementation Class-A review:** exact-current independent QA worker-1 **READY 0/0/0** and independent Security/DB Auditor worker-2 **READY 0/0/0** for the detailed DRAFT SPEC-031. Both independently reviewed rollback, immutable SQL/ledger, unchanged WebAuthn RP/userHandle, deterministic Genetics/item IDs, old/new cookie and CSRF state machine, CSRF v2 fixed golden vectors, pending Team-create idempotency UUID, browser storage, 30 project-specific env keys, staged Alpha/telemetry branches, and G0–G5 mandatory stop/go. They performed read-only analysis only; no implementation/runtime tests or live migrations were executed. Historical exact-byte values remain intentionally present only where compatibility requires.
- **Human Owner decision:** `aprovo` on 2026-10-15, explicitly accepting the presented SPEC-031 Class-A technical migration contract. This grants scoped implementation planning and isolated staged source changes, not a destructive/data cutover or repository history.
- **Explicit pending gates:** reconcile TASK-136 and TASK-132 source owners before any cross-file changes; TASK-136 existing Vite `/@fs/` potential sensitive file P1 must be fixed and independently re-gated before real email credentials; isolate implementation; repeat QA/IA after code; independently authorize Git history and any persistent DB/worker/domain deployment.
- **Current state:** Class-A contract accepted and in ACCEPTANCE pending completion/history, not an implemented runtime rename. Keep TASK-137 at ACCEPTANCE and TASK-136 separate.
