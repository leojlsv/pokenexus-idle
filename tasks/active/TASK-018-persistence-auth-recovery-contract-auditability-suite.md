# TASK-018 — Persistence/Auth Recovery, Contract & Baseline Auditability Suite

## Metadata

- State: ACCEPTANCE
- Class: B
- Owner: Secondary Developer
- Owner execution surface: ChatGPT delegated implementation worker (explicit Secondary Developer assignment; Codex CLI unavailable at task start)
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor (spot-check)
- Auditor execution surface: fresh independent ChatGPT worker (Gemini CLI unavailable at task start)
- Specs:
  - `docs/specs/SPEC-004-postgresql-schema-v1.md`
- ADRs:
  - `docs/decisions/ADR-005-persistence-data-access-strategy.md`
  - `docs/decisions/ADR-006-authentication-authorization-session-model.md`
- Branch: `feat/TASK-018-persistence-auth-recovery-auditability-suite`
- Worktree: `.worktrees/TASK-018-persistence-auth-recovery-auditability-suite`

## Objective

Establish a reusable persistence/authentication contract-verification baseline across TASK-014, TASK-016
and TASK-017 before reward-bearing and realtime features build on those boundaries. The suite must prove
failure/retry semantics, recovery/session invalidation, authorization composition, migration resilience,
correlation/audit evidence and absence of raw security secrets without changing the accepted persistence or
authentication policy.

TASK-018 is a verification/hardening task inside ADR-005/ADR-006/SPEC-004. It may make narrowly scoped
production fixes when a test exposes non-conformance with those accepted contracts, but it must not invent a
new recovery flow, new retention policy, public API semantics, authorization model or persistence strategy.

## Context

TASK-014, TASK-016 and TASK-017 are DONE and integrated. The repository already contains:

- the direct PostgreSQL migration runner with immutable checksum ledger, rollback-on-failure and concurrent
  runner serialization;
- the ADR-006 auth/session schema, WebAuthn/recovery/session application boundary, exact-Origin + CSRF guards,
  security-event table and server-generated audit correlation IDs;
- the minimal authenticated self-only Player profile API and authoritative `AccountId -> PlayerId` mapping;
- substantial PostgreSQL 17 integration evidence for auth races, recovery, session rotation/inactivity and
  Player creation/concurrency.

ADR-006 explicitly assigns TASK-018 the cross-feature verification role. The Human Owner gate in the roadmap is
therefore **not required** while this task only proves or corrects conformance to already accepted behavior. If
implementation requires changing recovery/auditability policy, public protocol semantics, auth/security model,
destructive migration behavior or retention limits, stop and return that decision to PM / Architecture and the
Human Owner before implementation continues.

No new production migration is expected. “Migration test” means stronger verification of the existing canonical
migration chain and upgrade/retry/failure behavior. Any proposed new migration requires explicit PM / Architecture
review first and may trigger the Human gate if it changes accepted semantics.

## Scope

### 1. Persistence and migration recovery matrix

- extend the existing PostgreSQL 17 migration harness with an end-to-end canonical upgrade/retry case that proves
  pre-auth persistence state survives application of the auth/session migration chain;
- prove rerunning the canonical chain is idempotent and checksum-verified after auth tables exist;
- retain failure rollback, corrected-unapplied retry, non-contiguous ledger rejection and concurrent-runner
  evidence from TASK-014; add only gaps needed to demonstrate the TASK-014/016 combined baseline;
- do not modify bytes of an already-applied migration and do not create rollback/down migrations.

### 2. Authentication/recovery lifecycle matrix

Add reusable integration coverage for the accepted lifecycle, including where not already materially proven:

- enrollment/recovery/email-change issuance is single-current, bounded by authoritative PostgreSQL cooldown/backoff,
  expiry and supersession/consumption semantics;
- restricted recovery capability is single-use and expires/revokes fail closed;
- successful recovery increments the security epoch, revokes/invalidate prior sessions and challenges/flows,
  quarantines then permanently retires old credentials as required by ADR-006, and enforces the post-recovery hold;
- repeated/retried completion cannot replay a consumed recovery authority or resurrect stale credentials/sessions;
- reauthentication rotates the bearer atomically and a stale in-flight old bearer cannot authorize later work;
- absolute expiry, inactivity expiry, explicit session revoke and revoke-all fail closed and cannot be revived by
  activity or retries;
- revoke-all invalidates relevant outstanding auth authority consistently with the accepted security epoch model.

### 3. Cross-feature authorization contract matrix

Create a compact table-driven test matrix that demonstrates the server-authoritative boundary across auth and
Player profile routes:

- public enrollment/recovery request routes remain generic and exact-origin constrained;
- cookie-authenticated unsafe routes require exact allowed Origin + session-bound CSRF;
- sensitive account/security operations additionally require the accepted active-session, recent-auth and
  post-recovery-hold conditions;
- private Player profile routes resolve only from authenticated `AccountId`, never from client account/player/owner
  selectors;
- a revoked, expired, stale-epoch or post-recovery-invalidated session cannot use the Player API;
- automatic/self-profile bootstrap traffic remains `touchActivity=false` and cannot extend inactivity;
- uncategorized auth paths remain deny-by-default.

The matrix should reuse existing guards/application boundaries rather than introduce a parallel authorization
framework.

### 4. Correlation and audit-event baseline

Verify the minimum ADR-006 security-event taxonomy and correlation properties across successful and meaningful
failure boundaries. Evidence must cover, directly or through an explicit retained-evidence map:

- account activation;
- passkey added/removed;
- authentication success and materially significant failure/abuse decisions;
- session created/revoked/revoke-all;
- recovery requested/started/completed/failed at meaningful boundaries;
- recovery email changed;
- account disabled/re-enabled;
- account deletion requested/completed;
- authorization-denied/security-control events where the implementation emits them.

Correlation IDs used for security evidence must be generated by the server boundary. A client `X-Request-Id`,
cookie, bearer, CSRF token, WebAuthn challenge or email-action secret must never become the audit correlation ID.
Cross-feature tests should demonstrate that one server-generated correlation value can be followed through the
relevant HTTP/application/persistence evidence without making it an authorization credential.

### 5. Privacy, retention and no-secret evidence

- prove `auth_security_events` persists only the accepted bounded metadata fields and has an infrastructure
  timestamp suitable for bounded retention selection;
- prove routine account-linked security events omit raw recovery email when `AccountId` is available;
- prove pre-account abuse correlation uses only the keyed pseudonymous target digest rather than raw email;
- prove no raw session bearer/cookie, recovery/enrollment token, WebAuthn challenge, CSRF token, authorization
  header/cookie or secret-store value is persisted into security audit rows;
- add deterministic retention-boundary query/test evidence for the accepted default policy envelope (raw
  IP/user-agent telemetry, if ever collected, at most 30 days; account-linked security events at most 180 days)
  without introducing a production scheduler, observability platform or a new policy;
- if the existing schema/API cannot express a bounded retention operation without new semantics, record the gap
  rather than silently choosing a new production retention mechanism. TASK-076/077 still own broad operational
  logging/metrics/tracing implementation.

### 6. Failure/retry and audit atomicity

- verify failed external notification/email delivery does not roll back an already committed authoritative security
  mutation where ADR-006 expects notification to be best-effort;
- verify security mutations whose audit row is part of the same database transaction do not leave a false success
  event when the mutation itself rolls back;
- verify deferred public-work failure remains observable without changing the generic public response;
- verify duplicate/retried calls converge on accepted idempotent/single-use outcomes instead of creating duplicate
  authority or contradictory audit state.

### 7. Evidence map

Maintain a concise in-task evidence map tying every TASK-018 acceptance criterion to either:

- new TASK-018 tests; or
- specific retained TASK-014/016/017 tests that already prove the invariant.

Do not copy large test bodies or create a separate implementation-summary/changelog artifact.

## Evidence map

| Contract area | Evidence |
|---|---|
| Canonical migration upgrade/retry | TASK-018 `packages/database/integration/postgresql.test.ts` — `upgrades pre-auth canonical persistence data through the auth migration and remains idempotent`; retained TASK-014 tests `applies the canonical migration once and verifies the exact checksum on repeat`, `fails closed when bytes of an applied migration change`, `rolls back a failed migration and safely executes corrected unapplied bytes`, `serializes concurrent direct migration runners`, and `fails closed when the ledger is not a contiguous migration prefix`. |
| Issuance/current authority | TASK-018 DB tests `keeps enrollment, recovery and email-change issuance single-current` and `fails closed at email-action, restricted-flow and challenge expiry while superseding older recovery authority`; retained `enforces authoritative bounded issuance cooldown/backoff in PostgreSQL` and enrollment one-time redemption coverage. |
| Recovery lifecycle | TASK-018 API test `issues recovery only for active or recovery-pending accounts`; DB regression `starts recovery atomically, resumes one epoch, and permanently retires old credentials` proves the actual start emits one correlated `recovery_started` while same-epoch resume emits no second start event; retained `consumes a WebAuthn challenge and restricted flow exactly once`; TASK-018 exact-expiry coverage above. |
| Session lifecycle | Retained `rejects an in-flight old bearer after reauthentication rotates the same session`, `enforces inactivity boundaries atomically and cannot revive an expired session`, `rejects sensitive authorization for absolute-expired, revoked, and stale-epoch sessions`; TASK-018 `revokes every session, invalidates outstanding authority, and makes revoke-all retry fail closed`. |
| Authorization composition | TASK-018 `apps/api/src/auth/http.test.ts` — `covers representative authorization categories with one table-driven route matrix`; retained exact-Origin/CSRF, restricted-flow and deny-by-default HTTP tests plus DB `revalidates recent-auth and post-recovery hold inside sensitive transactions`. |
| Player authority boundary | Retained TASK-017 self-scope/non-activity tests; TASK-018 `rejects revoked, expired, stale-epoch and recovery-invalidated sessions before Player persistence`; retained repository concurrency tests prove retry/convergence and fresh committed-winner visibility. |
| Correlation | Retained API/PG `persists only server-generated HTTP audit correlation even when X-Request-Id contains a secret sentinel`; TASK-018 recovery failure and revoke-all tests persist the supplied server-boundary correlation through application/repository audit evidence. |
| Privacy / no-secret | Retained `persists security audit evidence without raw auth secrets or routine email` and failed-enrollment digest-only evidence; TASK-018 `records recovery delivery failure as correlated failure evidence without raw recovery email`; recovery issuance state-matrix coverage uses opaque synthetic correlation IDs and asserts serialized account-linked audit rows omit all tested recovery emails. |
| Retention envelope | TASK-018 `keeps security-event metadata bounded and makes the 180-day account-event cutoff deterministic` proves the exact persisted metadata columns and deterministic `created_at < cutoff` selection. Raw IP/user-agent telemetry is not persisted by the current schema, so the ADR-006 30-day limit has no current row class to retain; introducing such telemetry remains outside this task. |
| Failure/retry + audit atomicity | TASK-018 `rolls back a security mutation when its transactional audit insert fails`; retained `does not roll back a committed passkey removal when security notification delivery fails`, deferred-public-work failure observability, migration corrected retry, auth single-use/retry tests and Player concurrent convergence. |

### Minimum ADR-006 security-event family coverage

| Event family | Evidence |
|---|---|
| Account activation | TASK-018 assertion in `consumes a WebAuthn challenge and restricted flow exactly once` checks `account_activated` + `session_created`. |
| Passkey added / removed | TASK-018 `persists passkey add/remove audit families at the accepted security boundary`. |
| Authentication success / significant abuse | TASK-018 assertion in retained signature-counter sign-in coverage checks `authentication_success`; retained API/PG `throttles public sign-in work in PostgreSQL before repeated challenge or verification work` checks `authentication_abuse/throttled`. |
| Session created / revoked / revoke-all | Session creation assertion above; TASK-018 assertion in recent-auth/revocation coverage checks `session_revoked`; TASK-018 revoke-all test checks one correlated `sessions_revoked_all` event and no duplicate on retry. |
| Recovery requested / started / completed / meaningful failure | TASK-018 API state-matrix test checks successful `recovery_requested/issued`; `records recovery delivery failure as correlated failure evidence without raw recovery email` checks `recovery_requested/delivery_failed`; recovery lifecycle regression checks one `recovery_started` only for the active→recovery_pending transition plus one `recovery_completed`, with same-epoch resume producing no duplicate start event. No recovery-resumed event or separate event-name enum is introduced. |
| Recovery email changed | TASK-018 assertion in `atomically replaces/releases canonical recovery email and invalidates prior sessions` checks `recovery_email_changed`. |
| Account disabled / re-enabled | TASK-018 assertion in `cannot promote pending activation or recovery through disable/re-enable` checks both event families. |
| Account deletion requested / completed | Retained API/PG `emits distinct account-deletion request/completion audit events and notifications`. |
| Authorization-denied / security-control events | The current implementation has no dedicated denial-event family. ADR-006 makes these conditional on operational usefulness; fail-closed denial is covered by the HTTP authorization matrix, sensitive-session tests and Player invalid-session matrix, so TASK-018 does not invent a new taxonomy. |

## Out of scope

- changing ADR-006 authentication, recovery, session, abuse-control or audit/retention policy;
- new public endpoints or changed response/status semantics;
- new player profile/social/display fields or arbitrary Player lookup;
- new authentication providers, passwords, OIDC/social login or stateless JWT browser sessions;
- new production migration unless an accepted-schema defect is identified and separately reviewed;
- destructive/down migrations or mutation of applied migration bytes;
- production log aggregation, dashboards, metrics, tracing, alerting or SLOs owned by TASK-076/077;
- production secret provisioning, deployment resource IDs or provider credentials owned by TASK-079/080;
- account export/deletion-product expansion beyond verifying already implemented ADR-006 behavior;
- reward/progression, collection/team, Hunt, realtime/HUB or economy implementation;
- changes to `packages/game-core` or unrelated `apps/web` / `apps/realtime` behavior;
- new third-party dependencies unless separately approved;
- Git commit/push/merge/rebase/reset/force without separate Human Owner authorization.

## Acceptance criteria

- [x] TASK-018 has a complete evidence map for failure/retry, authorization, recovery/session lifecycle, migration,
      correlation/audit taxonomy and no-secret/privacy/retention boundaries.
- [x] Canonical PostgreSQL 17 migration upgrade/retry evidence proves existing persistence data survives the auth
      migration chain and migration ledger/checksum behavior remains fail-closed.
- [x] Recovery issuance/start/completion/retry/expiry/invalidation cases prove single-use authority, epoch changes,
      old-credential retirement, stale-session invalidation and post-recovery hold semantics.
- [x] Session issuance/rotation/absolute expiry/inactivity/revoke-one/revoke-all cases prove stale authority cannot
      regain access through retries, activity or a replaced bearer.
- [x] Table-driven authorization coverage proves public/generic, authenticated, mutation-CSRF, sensitive-operation
      and self-only Player route boundaries without client-supplied authority.
- [x] A revoked/expired/stale/recovery-invalidated session is rejected by the TASK-017 self-profile API before
      Player persistence work and profile bootstrap remains non-activity traffic.
- [x] ADR-006 minimum security-event taxonomy is either directly exercised or explicitly mapped to retained tests;
      no required event family is silently unverified.
- [x] Server-generated correlation IDs survive through relevant audit evidence and client request IDs/secrets cannot
      control or poison the security correlation field.
- [x] Security-event rows contain no raw bearer/cookie/token/challenge/CSRF/authorization/secret-store values and
      routine account-linked audit evidence omits raw recovery email.
- [x] Retention/privacy tests prove the accepted 30-day raw-telemetry and 180-day account-linked-event policy
      envelope can be applied deterministically without introducing a new production observability/retention policy.
- [x] Failure/retry tests prove audit/notification behavior does not create false success evidence or roll back an
      accepted authoritative mutation solely because best-effort notification delivery failed.
- [x] No new dependency, provider-specific runtime resource, unrelated refactor or accepted-contract drift is added.
- [x] Database/API focused lint, typecheck, unit/integration tests and builds pass against disposable PostgreSQL 17.
- [x] API and database Worker compatibility dry-runs remain green where currently applicable.
- [x] Workspace lint/typecheck/test/build, `roadmap:check` and `git diff --check` pass.
- [x] Independent QA reports no unresolved P0/P1 findings.
- [x] Independent Auditor spot-check reports no unresolved P0/P1 security/secret/audit findings.
- [x] PM / Architecture Coordinator accepts the final snapshot before repository-history authorization.

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
corepack pnpm --filter @pokenexus/api test:integration       # explicit disposable PG17 URL
corepack pnpm lint
corepack pnpm -r typecheck
corepack pnpm -r test
corepack pnpm -r build
corepack pnpm roadmap:generate
corepack pnpm roadmap:check
git diff --check
```

Real database tests must require an explicit disposable database named `pokenexus_test` or
`pokenexus_test_*` and fail closed otherwise. No shared/production database is an authorized test target.

The final validation must also include a diff-focused secret scan for raw bearer/token/cookie/challenge/CSRF,
authorization-header and provider-secret material. A test sentinel is allowed only when it is obviously synthetic
and asserted absent from persisted/logged evidence.

## Dependencies

- TASK-014 — Database Adapter & Migration Foundation: DONE and integrated.
- TASK-016 — Authentication & Session Implementation: DONE and integrated.
- TASK-017 — Player Profile API & Persistence: DONE and integrated.
- ADR-005: ACCEPTED.
- ADR-006: ACCEPTED.
- SPEC-004: APPROVED.

## Risks / irreversible actions

- Security/recovery tests can accidentally become a backdoor contract rewrite. Any discovered need to change
  recovery/auditability policy is a PM/Human decision, not an implementation shortcut.
- Applied migration bytes are immutable. TASK-018 may test migration failure/retry but must not edit canonical
  applied migrations.
- Secret-leak evidence must use synthetic sentinels only; do not introduce real credentials into fixtures, logs or
  Git history.
- Tests that exercise concurrent/session-invalidating behavior must use isolated disposable PostgreSQL 17 state.
- Repository-history operations remain separately Human Owner gated.

## Expected files / boundaries

Primary TASK-018 write boundary after READY:

```text
packages/database/integration/**                 # migration/auth lifecycle/retry/audit persistence evidence
packages/database/src/**                         # only narrow conformance fix or retention-query primitive if required
packages/database/src/**/*.test.ts               # focused repository regressions when useful
apps/api/integration/**                           # cross-feature auth/recovery/audit/profile evidence
apps/api/src/auth/**                              # only narrow accepted-contract conformance fixes/tests
apps/api/src/player/**                            # test/conformance fix only; no profile-contract expansion
tasks/active/TASK-018-persistence-auth-recovery-contract-auditability-suite.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

`packages/database/migrations/**` is read-only for this task unless PM / Architecture explicitly reopens the
boundary after finding an accepted-schema defect. `packages/game-core/**`, `apps/web/**`, `apps/realtime/**`,
production deployment resources and unrelated domain packages are not TASK-018 write targets.

## Completion

TASK-018 is ACCEPTANCE. Owner implementation and validation are complete on the bounded verification/hardening
scope. A narrow production conformance fix in `packages/database/src/auth-repository.ts` makes `recovery_started`
audit evidence correspond only to the actual active→recovery_pending start transition; same-epoch recovery resume
retains its existing behavior without emitting a second start event. No public protocol, policy, schema, migration,
dependency or recovery-flow change was introduced.

Fresh corrected-snapshot independent review is complete: QA returned READY with P0/P1/P2/P3 = 0/0/0/0;
Independent Auditor spot-check returned PASS with P0/P1/P2/P3 = 0/0/0/0; PM / Architecture Coordinator returned
ACCEPT for the exact corrected REVIEW snapshot. No technical or acceptance blocker remains. Repository-history
completion is not yet authorized and remains the next explicit Human Owner gate.

### Owner validation evidence

- Disposable PostgreSQL 17 target: `pokenexus_test_task018`.
- Corrected REVIEW snapshot after IA P1/P2 fixes was requalified from base
  `429fd00978f64b9df75e266b11447d83a81ed687`.
- Database focused: lint PASS; typecheck PASS; unit 21/21 PASS; PostgreSQL integration 35/35 PASS; build PASS;
  Worker compatibility dry-run PASS.
- API focused: lint PASS; typecheck PASS; unit 52/52 PASS; PostgreSQL integration 13/13 PASS; Worker build dry-run
  PASS.
- Workspace: lint PASS; recursive typecheck PASS; recursive tests PASS; recursive build PASS.
- Roadmap generate/check PASS; current roadmap source SHA-256
  `ffcafe43e32f00507e2b1a48f122376db830b6869b7610b91b95fe7c6af4fd9f`; `git diff --check` PASS;
  diff-focused high-confidence secret scan clean.
- Production delta is limited to the recovery-start audit conformance guard above. Canonical migration bytes,
  public API semantics, recovery/session behavior, schema, dependencies and accepted policy remain unchanged.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
