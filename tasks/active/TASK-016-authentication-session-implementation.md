# TASK-016 — Authentication & Session Implementation

## Metadata

- State: ACCEPTANCE
- Class: B
- Owner: Lead Developer
- Owner execution surface: ChatGPT delegated implementation worker (explicit Lead Developer assignment; Copilot CLI unavailable due account quota at task start)
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor
- Auditor execution surface: fresh independent ChatGPT worker
- Specs:
  - `docs/specs/SPEC-004-postgresql-schema-v1.md`
- ADRs:
  - `docs/decisions/ADR-005-persistence-data-access-strategy.md`
  - `docs/decisions/ADR-006-authentication-authorization-session-model.md`
- Branch: `feat/TASK-016-authentication-session-implementation`
- Worktree: `.worktrees/TASK-016-authentication-session-implementation`

## Objective

Implement the accepted ADR-006 authentication, authorization, recovery and server-side session model
on top of the PostgreSQL foundation without widening the accepted security contract or inventing
provider-specific deployment semantics.

The result must give later API/profile/gameplay tasks one tested, server-authoritative authenticated
`AccountId` boundary with passkey/WebAuthn ceremonies, revocable opaque browser sessions,
recovery/enrollment capability flows, CSRF/origin enforcement, account-state/security-epoch
invalidation, ownership-ready authorization primitives, layered abuse controls and secret-free
audit/security-notification emission.

## Context

TASK-015 is DONE and ADR-006 is Accepted. TASK-014 already provides PostgreSQL 17 migrations,
invocation-local `pg.Client` access, short transactions, UUIDv7 generation and Worker `nodejs_compat`.
The API is otherwise a minimal Hono Worker and has no auth or database consumer yet.

Current dependency/runtime verification for this task establishes:

- `@simplewebauthn/server` `14.0.2` is the selected WebAuthn verifier/options library. The exact pin is
  required because the current release includes security fixes and supports WebCrypto-based compatible
  runtimes including Cloudflare Workers; the task must still prove the actual API Worker dry-run bundle.
- `apps/api` may add the existing workspace `@pokenexus/database` dependency because TASK-016 is the
  first owning API database consumer.
- recovery-email domain canonicalization uses the platform `node:url` `domainToASCII()` available under
  the already-enabled Worker Node compatibility surface; no additional IDNA/email-validation package is
  authorized.
- no email-delivery vendor SDK is selected. Email delivery is an injected server-side action port with
  fake/test implementation; production provider credentials/configuration remain TASK-079/080.
- the repository-selected Copilot CLI `lead-developer` surface was attempted at task start but returned
  a monthly-quota error before any edit (`+0/-0`). Under the workflow's execution-surface rule, the
  Lead Developer role is therefore delegated to a ChatGPT implementation worker without changing role
  authority, task scope, review separation or acceptance gates.

## Scope

### 1. Forward PostgreSQL auth/session migration

Add one ordered forward migration after `0001_postgresql_schema_v1.sql` that implements the logical
persistence handoff from ADR-006, including database-enforced invariants where meaningful:

- extend `pokenexus.accounts` with explicit auth state, monotonic non-negative `security_epoch`, verified
  canonical/delivery recovery-email fields, `post_recovery_hold_until` and lifecycle timestamps needed
  by ADR-006;
- database-enforced uniqueness for the canonical recovery email while it is attached to a non-deleted
  account; deletion completion releases that mapping rather than relying on a provider alias rule;
- WebAuthn credentials with globally unique credential ID, exact 16-byte `userHandle <-> AccountId`
  binding, public key bytes, monotonic signature counter, backup signals and
  active/quarantined/revoked lifecycle;
- opaque server sessions with internal UUIDv7 `session_id`, one-way bearer digest, issued security
  epoch, authentication/activity/absolute-expiry/revocation metadata and bounded optional device label;
- one-time email-action records, restricted-flow capabilities and WebAuthn challenge records with
  purpose/account/state/epoch/flow binding, expiry, supersession and atomic consumed/revoked state;
- authoritative pseudonymous per-target issuance cooldown/backoff state;
- minimum auth/security audit-event persistence that excludes raw secrets/tokens and does not persist
  raw IP/user-agent telemetry by default;
- necessary indexes/constraints/conditional-update support without broad `ON DELETE CASCADE`.

### 2. Auth persistence/repository boundary

Implement explicit `packages/database` auth repositories/helpers for the accepted state transitions,
using short PostgreSQL transactions and conditional SQL rather than read-check-write races. At minimum
cover:

- account activation/recovery/disable/delete state and epoch transitions;
- canonical recovery-email reservation/replacement/release;
- credential registration/binding/quarantine/revocation and atomic monotonic sign-count update;
- session create/lookup/activity/rotation/revoke-one/revoke-all with epoch/state validation;
- one-time token/restricted-flow/challenge issue, supersede, consume and expiry semantics;
- authoritative per-target cooldown/backoff conditional updates;
- security audit-event insertions that accept only bounded non-secret fields.

### 3. Cryptographic/token primitives

Implement small explicit server primitives with testable clock/random inputs where useful:

- at least 256-bit CSPRNG opaque session and restricted-flow secrets;
- SHA-256/equivalent one-way lookup digests for high-entropy bearer/email-action secrets;
- keyed HMAC pseudonymous target keys from canonical email using a server secret supplied by
  environment/dependency injection;
- session-bound unpredictable CSRF token derivation/verification that is not the session bearer and is
  never placed in URLs/logs;
- exact constant-time comparisons where application-side digest/token comparison is required.

Raw session, restricted-flow and email-action bearer secrets must never be database columns or log/audit
fields.

### 4. Recovery-email canonicalization

Implement the exact ADR-006 v1 equality policy:

- accept only a single addr-spec with ASCII local-part; reject display-name/comment/EAI local-part;
- trim surrounding ASCII whitespace only;
- convert Unicode domain input to ASCII IDNA A-label with `domainToASCII()`, reject invalid/empty result,
  then ASCII-lowercase it;
- ASCII-lowercase the local-part for equality;
- do not strip dots or `+tag` suffixes;
- keep a separately validated delivery/display value but never use it for equality/authorization.

### 5. WebAuthn/passkey ceremonies

Use exact-pinned `@simplewebauthn/server 14.0.2` to implement server generation/verification for:

- restricted activation/recovery registration;
- active-account passkey addition after recent passkey reauthentication and post-recovery eligibility;
- identifier-less authentication with discoverable credentials and no account-specific
  `allowCredentials`;
- recent-auth reauthentication bound to the already authenticated account/session.

Enforce exact configured RP ID and exact allowed origins, `userVerification: required`, attestation
`none`, discoverable credential requirements (`residentKey: required`, `requireResidentKey: true`,
`credProps` and reject explicit `rk:false`), challenge TTL <= 5 minutes, atomic challenge consumption,
non-null identifier-less `userHandle`, exact credential/account/userHandle binding and the accepted
signature-counter semantics.

### 6. Enrollment/recovery/email-change flows

Implement public generic-request handlers and explicit app-origin POST redemption with injected email
action delivery:

- initial enrollment request -> one-use enrollment email secret -> restricted activation capability ->
  passkey registration -> active account + new normal session;
- recovery request only grants authority for active or same-account recovery-pending targets while the
  public response remains indistinguishable -> atomic recovery start/epoch advance/session invalidation/
  old-credential quarantine -> restricted replacement-passkey registration -> active account + 24-hour
  post-recovery hold + new session;
- recovery resume reuses the existing recovery epoch and supersedes older restricted recovery flows;
- verified recovery-email replacement is account-bound, requires recent passkey reauthentication,
  rechecks uniqueness atomically, increments epoch and invalidates prior sessions/challenges/flows;
- automated email-link GET/prefetch never consumes a secret or starts account state transitions.

The task owns a transport-neutral `EmailActionSender`/equivalent port and test fake only. No provider SDK,
credential or production vendor selection is allowed.

### 7. Opaque browser sessions and CSRF/origin middleware

Implement Hono/API authentication primitives/endpoints with these exact boundaries:

- session cookie contains only the opaque bearer and is `Secure`, `HttpOnly`, host-only, `Path=/`,
  `SameSite=Lax` or stricter, using `__Host-` naming where the deployment shape permits;
- login issues a fresh session; successful reauth rotates the bearer rather than promoting an existing
  pre-auth identifier;
- absolute lifetime <= 30 days; inactivity <= 7 days; recent-auth <= 10 minutes; shorter config is
  permitted, longer is rejected/fails closed;
- only server-classified subscriber-initiated actions may advance inactivity. Polling/prefetch/background
  sync/analytics/heartbeat cannot extend it and a client header alone never marks activity;
- every authenticated request revalidates digest, revocation, expiry, account state and security epoch;
- cookie-authenticated mutation requires unsafe method, exact Origin and session/restricted-flow-bound
  unpredictable CSRF proof independently of SameSite;
- logout revokes current session; recent-auth-protected session listing/revoke-one/revoke-all are
  implemented with non-secret metadata.

### 8. Authorization and account-security operations

Provide deny-by-default API/middleware categories for public, restricted-flow, normal authenticated and
recent-auth-required operations. Server derives authoritative `AccountId`; any client-supplied owner,
account, player or role field is selector/input only and never authority.

Implement the authentication-side gates/state transitions for:

- passkey add/remove, including prohibition on removing the last active credential outside accepted
  recovery/deletion;
- recovery-email replacement;
- session listing/revocation/revoke-all;
- account deletion auth transition with explicit confirmation, epoch advance, session/challenge/flow/
  credential invalidation and recovery-email release while preserving referenced game rows;
- reusable recent-auth + post-recovery eligibility guard for later account export and future
  security/destructive endpoints. TASK-016 does not invent later domain export payload semantics.

### 9. Abuse controls and security evidence

- implement configurable bounded authoritative per-target cooldown/backoff with a stable HMAC-derived
  pseudonymous target key; default thresholds must be finite, tested and incapable of permanent
  unauthenticated lockout;
- keep Cloudflare POP-local rate limiting optional/coarse only; no correctness/security invariant may
  depend on it and no production binding ID is selected;
- emit minimum ADR-006 security events and notification attempts without raw secrets/tokens/email where
  `AccountId` is available;
- audit notification delivery failure without rolling back an already committed security transition or
  changing the generic public response.

### 10. Security race/integration tests

Use real disposable PostgreSQL 17 evidence to cover at minimum:

- exact auth schema/constraints/indexes and no broad cascades;
- duplicate/cross-account credential registration rejection;
- double email-token/challenge/restricted-flow consumption;
- concurrent recovery start/session invalidation;
- recovery completion racing an old credential assertion;
- canonical recovery-email uniqueness and atomic replacement/release;
- restricted-flow supersession and stale epoch/state rejection;
- monotonic signature-count update under stale/out-of-order observations;
- session epoch/revocation/absolute/inactivity behavior and user-activity classification;
- post-recovery 24-hour hold plus later 10-minute recent-auth behavior;
- public enrollment/recovery response indistinguishability at the application contract level;
- CSRF/origin failure paths and absence of raw secret material in persisted audit rows.

## Out of scope

- production email provider/vendor selection, credentials or DNS/domain setup;
- production Hyperdrive resource IDs/secrets or deployment provisioning;
- web/passkey UI (`apps/web`) beyond API contract tests required by this task;
- password, TOTP/SMS OTP, OAuth/OIDC/social-login implementation;
- Player profile product fields/API beyond resolving authenticated ownership for later tasks;
- realtime HUB/Duo authentication/revalidation protocol owned by TASK-042/043;
- economy/trading/value-transfer or admin/LiveOps privilege rules;
- raw IP/user-agent telemetry collection/retention implementation;
- account export domain payloads beyond the reusable auth gate;
- legal-policy-specific retention jobs beyond the bounded ADR defaults;
- broad RLS adoption;
- broad database cascades or destructive migration/down-migration support;
- Git commit/push/merge/rebase/force without separate Human Owner authorization.

## Acceptance criteria

- [x] Forward migration implements ADR-006 auth/session persistence with exact structural invariants and
      PostgreSQL 17 compatibility.
- [x] Canonical recovery-email equality/uniqueness and deleted-account release semantics are deterministic
      and race-safe.
- [x] Identifier-less WebAuthn sign-in, registration and recent reauth enforce exact RP/origin/UV,
      discoverable credential and credential/userHandle/AccountId binding.
- [x] Old/pre-recovery credentials cannot authenticate after recovery start or completion.
- [x] Signature-count persistence is monotonic under concurrent/stale assertions without treating zero or
      lower counters as automatic permanent lockout.
- [x] Email-action secrets are one-use, <=15 minutes, digest-stored, purpose-bound and redeemed only by
      explicit app-origin POST; restricted multi-request capability is distinct and <=15 minutes.
- [x] Restricted capabilities are account/purpose/state/epoch/flow bound and never authorize normal
      gameplay/session/account-destructive operations.
- [x] Recovery atomically advances epoch, invalidates sessions, quarantines prior credentials and
      completes only with replacement credential + permanent old-credential revocation + 24h hold.
- [x] Session bearer secrets are >=256-bit, stored only by one-way digest, rotated on reauth and validated
      against revocation/state/epoch/absolute/inactivity limits on every authenticated request.
- [x] Background/non-user traffic cannot refresh inactivity; route/command classification is server
      authoritative.
- [x] Cookie mutations enforce exact Origin + CSRF independently of SameSite; state-changing GET is absent.
- [x] Recent-auth and post-recovery guards protect passkey/recovery-email/session-management/account-delete
      operations, and a reusable export/security-operation gate exists.
- [x] Account authorization is deny-by-default and never trusts client-supplied owner/account/player/role
      fields as authority.
- [x] Authoritative pseudonymous per-target cooldown/backoff cannot be bypassed by Cloudflare-location
      distribution and cannot permanently lock an account from unauthenticated failures.
- [x] Security audit/notification evidence excludes raw session/recovery/enrollment/WebAuthn/CSRF/provider
      secrets and routine raw email/IP/UA values.
- [x] No password/OAuth/TOTP/SMS/admin/economy/realtime/provider-specific semantics are introduced.
- [x] `@simplewebauthn/server` is exact-pinned to `14.0.2`; no other new third-party runtime dependency is
      added unless TASK-016 is explicitly amended before use.
- [x] API Worker dry-run proves the actual `@pokenexus/database` + `pg` + SimpleWebAuthn production import
      graph under the existing compatibility policy.
- [x] Focused database/API lint, typecheck, unit/integration tests and builds pass.
- [x] Workspace lint/typecheck/test/build, `roadmap:check` and `git diff --check` pass.
- [x] Complete diff remains inside TASK-016 boundaries with no unrelated refactor or secret/config leak.
- [x] Independent QA reports no unresolved P0/P1 findings.
- [x] Independent Auditor reports no unresolved P0/P1 security/concurrency findings.
- [x] PM / Architecture Coordinator functional/architectural acceptance passes after QA + IA.

## Validation / tests

Run and report at minimum:

```text
corepack pnpm --filter @pokenexus/database lint
corepack pnpm --filter @pokenexus/database typecheck
corepack pnpm --filter @pokenexus/database test
corepack pnpm --filter @pokenexus/database build
corepack pnpm --filter @pokenexus/database test:integration   # explicit disposable PG17 URL
corepack pnpm --filter @pokenexus/api lint
corepack pnpm --filter @pokenexus/api typecheck
corepack pnpm --filter @pokenexus/api test
corepack pnpm --filter @pokenexus/api build
corepack pnpm lint
corepack pnpm -r typecheck
corepack pnpm -r test
corepack pnpm -r build
corepack pnpm roadmap:generate
corepack pnpm roadmap:check
git diff --check
```

Also inspect the complete diff against `origin/main`, verify direct dependency additions and run the
real API Worker dry-run after the production auth import graph exists.

Real database tests must require an explicit disposable database named `pokenexus_test` or
`pokenexus_test_*` and fail closed if the URL is absent. No shared/production database is an authorized
test target.

### Implementation evidence — post-FIX REVIEW handoff

- Disposable local PostgreSQL `17.11`, database `pokenexus_test`: database integration `24/24` PASS and
  API/application integration `7/7` PASS. The corrected snapshot adds real-PostgreSQL evidence that an
  in-flight principal authenticated with the old bearer digest loses sensitive-session and activity-touch
  authority after same-`session_id` reauthentication rotates the bearer; only the rotated digest remains
  authoritative. It also covers PostgreSQL-backed sign-in options/verify throttling, `session_created`
  audit emission, account-deletion requested/completed audit + notification boundaries, and HTTP-to-DB
  proof that a client `X-Request-Id` secret sentinel is never persisted as `correlation_id`.
- Public enrollment/recovery HTTP tests prove the generic `202` is returned while account-dependent work
  remains pending in the injected Worker deferral, and that a rejected deferred promise remains observable
  rather than being swallowed. HTTP boundary tests also reject malformed UUID, base64url selector and
  nested WebAuthn shapes with bounded `400` responses before application/database work.
- `@pokenexus/database`: lint PASS; typecheck PASS; unit tests `17/17` PASS; build PASS; PostgreSQL 17
  integration `24/24` PASS; Worker compatibility dry-run PASS (`260.49 KiB`, gzip `50.54 KiB`).
- `@pokenexus/api`: lint PASS; typecheck PASS; unit tests `41/41` PASS; PostgreSQL integration `7/7` PASS;
  Worker production dry-run PASS (`1193.63 KiB`, gzip `208.32 KiB`). The generated production bundle
  contains the SimpleWebAuthn verification/generation implementation, `pg-protocol` and auth repository
  SQL, proving the actual database/driver/WebAuthn import graph under `nodejs_compat`.
- Workspace root lint PASS; recursive workspace typecheck/test/build PASS; `roadmap:generate` and
  `roadmap:check` PASS; `git diff --check` PASS.
- Diff/dependency inspection against `origin/main`: writes are confined to the TASK-016 boundaries;
  `apps/web`, `apps/realtime`, `packages/game-core` and `apps/api/wrangler.toml` are unchanged; the only
  new direct API dependencies are workspace `@pokenexus/database` and exact `@simplewebauthn/server`
  `14.0.2`; no production provider resource ID, deployment secret or credential is present.
- The implementation owner addressed the complete prior P1/P2 finding set on this snapshot.

### Corrected-snapshot review and acceptance evidence

- Exact frozen corrected REVIEW snapshot: working-snapshot manifest SHA-256
  `792ceae6bb426317a31dbe40de0a99f9b515fd159fdfa653bb436675a184663d`; TASK metadata SHA-256
  `4f3374fa60e3f1bbb0322dfc629738b04dcdc427069a3101ff51479d55448fd0`; roadmap source SHA-256
  `414a6e5dfc7255667ba16a47d2fabc33f72ac4fc61462f0fc74f75284c320abb`.
- Fresh independent QA on that exact corrected snapshot: P0=0, P1=0, P2=0, P3=0 — READY.
- Mandatory Independent Auditor on that exact corrected snapshot: P0=0, P1=0, P2=0, P3=0 — PASS.
- PM / Architecture Coordinator final acceptance on that exact corrected snapshot: ACCEPT.

### Independent review findings — FIX handoff

The exact frozen REVIEW snapshot above was reviewed read-only by the assigned QA Reviewer and mandatory
Independent Auditor. Both gates failed with P0=0; their combined blocking set is five distinct P1 findings
plus one P2 robustness finding:

- P1: client-controlled `X-Request-Id` can be persisted verbatim as a security-event correlation ID and
  deliberately smuggle raw bearer/CSRF/email-action secret material into audit rows;
- P1: reauthentication rotates `bearer_digest` while retaining `session_id`, but transactional session
  authorization does not bind to the bearer digest/version that authenticated the request, allowing an
  in-flight old-bearer request to survive rotation and inherit newly refreshed recent-auth authority;
- P1: public passkey sign-in options/verify lacks endpoint-specific abuse protection before challenge
  persistence, credential lookup and WebAuthn cryptographic work;
- P1: public enrollment/recovery returns the same response body/status but synchronously performs
  materially different account-dependent token/email/audit work, creating an observable timing oracle;
- P1: the minimum ADR-006 audit/notification taxonomy is incomplete for session creation and the distinct
  account-deletion requested/completed boundaries;
- P2: malformed nested WebAuthn objects and malformed UUID selectors can escape bounded request rejection
  before the verifier safety boundary and produce server/database errors.

The Lead Developer / implementation owner completed one coherent FIX cycle for this set and reran the
required owner validation. TASK-016 is now back in REVIEW. Both independent QA and Independent Auditor
gates must re-review this corrected snapshot before PM / Architecture Coordinator acceptance; the prior
review verdicts do not carry forward automatically.

## Dependencies

- TASK-012 — ADR-005 Persistence & Data Access Strategy: DONE and integrated.
- TASK-013 — PostgreSQL Schema v1: DONE and integrated.
- TASK-014 — Database Adapter & Migration Foundation: DONE and integrated.
- TASK-015 — ADR-006 Authentication / Authorization / Session Model: DONE and integrated.
- ADR-005: ACCEPTED.
- ADR-006: ACCEPTED.
- SPEC-004: APPROVED.

## Risks / irreversible actions

- Auth/recovery/session defects can create account takeover, lockout or authority-survival paths. The
  Independent Auditor is mandatory before acceptance.
- Forward migration bytes/checksum become immutable after they are applied to a shared environment;
  TASK-016 validation may use only disposable local PostgreSQL state.
- Email delivery is security-sensitive but provider selection is intentionally deferred; the injected
  transport must not leak raw action secrets into logs/audit.
- Browser session and recovery secrets are bearer authority; any persistence/logging of raw values is a
  blocker.
- `@simplewebauthn/server` handles cryptographic WebAuthn parsing/verification but does not replace the
  ADR-required account/state/epoch/challenge/authorization checks owned by PokeNexus.
- Repository completion/history remains separately governed and is not authorized by starting TASK-016.

## Expected files / boundaries

Primary TASK-016 write boundary:

```text
packages/database/migrations/0002_*.sql
packages/database/src/**                         # auth persistence/repository additions + exports/tests
packages/database/integration/**                 # auth PostgreSQL 17 integration evidence
packages/database/package.json                   # scripts only if needed; no new runtime dependency expected
apps/api/src/**                                  # auth/session API, middleware, crypto/email ports/tests
apps/api/package.json                            # @pokenexus/database workspace + @simplewebauthn/server 14.0.2
apps/api/wrangler.toml                           # no production resource IDs/secrets; compatibility-only if proven necessary
pnpm-lock.yaml                                   # exact authorized dependency resolution
tasks/active/TASK-016-authentication-session-implementation.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

`apps/web/**`, `apps/realtime/**`, `packages/game-core/**`, production deployment secrets/resource IDs
and unrelated domain packages are not TASK-016 write targets.

## Completion

TASK-016 is in ACCEPTANCE. Owner validation, fresh independent QA, mandatory Independent Auditor review
and PM / Architecture Coordinator acceptance are clear on the exact corrected snapshot. Technical and
acceptance gates are complete. Repository completion/history remains separately governed and requires
explicit Human Owner authorization; this transition does not authorize commit, push, merge or marking the
task DONE.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
