# TASK-015 — ADR-006 Authentication / Authorization / Session Model

## Metadata

- State: DONE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor
- Auditor execution surface: fresh independent ChatGPT worker
- Specs:
  - `docs/specs/SPEC-004-postgresql-schema-v1.md`
- ADRs:
  - `docs/decisions/ADR-001-runtime-and-language.md`
  - `docs/decisions/ADR-003-hub-and-duo-realtime.md`
  - `docs/decisions/ADR-005-persistence-data-access-strategy.md`
  - `docs/decisions/ADR-006-authentication-authorization-session-model.md`
- Branch: `spec/TASK-015-auth-authz-session-model`
- Worktree: `.worktrees/TASK-015-auth-authz-session-model`

## Objective

Define and obtain Human Owner acceptance for the v1 authentication, authorization, session,
recovery and account-lifecycle architecture before TASK-016 implements any credential or session
endpoint/schema.

The decision must be concrete enough that TASK-016 can implement secure browser authentication and
server-side authorization without guessing identity, credential, recovery, revocation, CSRF,
session-lifetime, audit or account-state semantics.

## Context

The accepted persistence architecture already establishes PostgreSQL as the durable authority,
`AccountId` as an application-generated UUIDv7 distinct from `PlayerId` and from external credential
identity, cache-disabled authoritative reads through Hyperdrive, and invocation-local database
access. SPEC-004 intentionally leaves credentials, account states, recovery and sessions to this
task.

PokeNexus is a browser-first idle game. Long periods without requests are normal product behavior,
so normal session policy must distinguish idle-game UX from recent-authentication requirements for
security-sensitive actions. Future economy, trading, admin and realtime features must be able to
build on the same identity/session boundary without trusting client-supplied ownership claims.

The proposed ADR uses WebAuthn/passkeys as the v1 authenticator and does not introduce first-party
password storage. Verified email is an out-of-band onboarding/recovery channel, not canonical
account identity. Browser sessions are opaque, revocable server-side sessions rather than stateless
JWT authority.

## Scope

- threat model for credential phishing, session theft/fixation, CSRF, account enumeration,
  recovery takeover, authorization bypass/IDOR, automated abuse and database compromise;
- internal `AccountId` authority and separation from email, passkey credential ID and `PlayerId`;
- account lifecycle/state transitions for pending activation, active, disabled, recovery and deleted
  accounts, including the meaning of a completed recovery event;
- WebAuthn/passkey registration and authentication policy, relying-party/origin boundaries,
  user-verification requirement and signature-counter handling;
- verified-email onboarding/recovery boundary and single-use recovery/enrollment tokens;
- canonical recovery-email equality/uniqueness, restricted-flow capabilities, pre-recovery credential
  quarantine/revocation and post-recovery safety hold;
- server-side browser session format, cookie properties, token-at-rest policy, issuance,
  reauthentication, revocation, revoke-all, credential-change invalidation and expiry;
- CSRF and exact-origin/CORS requirements for cookie-authenticated mutation;
- authorization matrix and deny-by-default/ownership rules;
- coarse and security-critical rate/abuse boundaries, including Cloudflare Rate Limiting limitations;
- user-facing security notifications for recovery, passkey and recovery-email changes;
- security audit-event taxonomy, explicit secret/token exclusions and privacy/retention guidance;
- account export/deletion expectations and non-cascade interaction with SPEC-004;
- logical persistence handoff for TASK-016 without writing migrations in TASK-015;
- explicit security gates for later realtime/economy/admin tasks.

## Out of scope

- production implementation, endpoints, migrations or dependency installation;
- selecting an email-delivery vendor or production domain names;
- OAuth/social-login/OIDC provider integration in v1;
- passwords, TOTP/SMS OTP or security questions as v1 authenticators;
- admin/LiveOps role model beyond reserving a separate future privileged-auth boundary;
- HUB/Duo WebSocket authorization/revalidation details owned by ADR-007/TASK-042;
- reward/economy/trading authorization rules owned by their later Class A tasks;
- deployment secrets/environment configuration owned by TASK-079/080;
- legal-jurisdiction-specific retention obligations not yet supplied by the Human Owner;
- commits, pushes or merges without separate Human Owner authorization.

## Acceptance criteria

- [x] ADR-006 has no unresolved QA P0/P1 findings.
- [x] ADR-006 has no unresolved Independent Auditor P0/P1 security findings.
- [x] Internal `AccountId` remains distinct from email, credential IDs and `PlayerId`.
- [x] Normal user authentication is passkey/WebAuthn-based and does not require first-party password
      storage in v1.
- [x] WebAuthn RP ID, exact origin allowlist, user verification and challenge replay boundaries are
      explicit.
- [x] V1 identifier-less sign-in requires discoverable credentials and enforces globally unique
      credential ID plus exact `userHandle <-> AccountId` binding.
- [x] Account states and transitions fail closed, and completed recovery is modeled as a security
      event/epoch transition rather than a permanent elevated account state.
- [x] Raw session/recovery/enrollment secrets are never persisted or logged.
- [x] Session cookie flags, server-side revocation, absolute/inactivity expiry and recent-auth
      requirements are explicit and compatible with idle-game UX.
- [x] Recovery and credential changes invalidate prior authority through a monotonic account security
      epoch/revoke-all mechanism.
- [x] Email-secret redemption yields a separate short-lived digest-stored restricted capability with
      exact purpose/account/state/epoch/CSRF/Origin/challenge binding; the email secret is never reused
      as the multi-request bearer.
- [x] Recovery quarantines old credentials and completion atomically revokes/supersedes them before
      returning active; a 24-hour post-recovery hold blocks security/destructive actions even after a
      fresh replacement-passkey reauthentication.
- [x] Recovery-email canonical comparison and uniqueness are deterministic and database-enforceable;
      verified replacement and deleted-account reuse semantics are explicit.
- [x] Cookie-authenticated state changes have explicit CSRF + Origin/CORS defenses.
- [x] Authorization is deny-by-default and revalidates account state/ownership on every authoritative
      request; client-supplied IDs never grant authority.
- [x] Rate limiting is layered and does not treat Cloudflare's local/eventually-consistent limiter as
      an exact global security counter.
- [x] Enrollment/recovery issuance has authoritative consistent per-target cooldown/backoff independent
      from Cloudflare POP-local enforcement.
- [x] Audit taxonomy excludes secrets/tokens and defines bounded handling for IP/device telemetry.
- [x] Passkey/recovery/recovery-email security changes have a user-facing notification contract that is
      separate from audit logging.
- [x] Account deletion/export expectations do not introduce broad database cascade deletion.
- [x] TASK-016 implementation handoff is concrete without silently selecting deferred provider/product
      semantics.
- [x] `corepack pnpm lint`, `corepack pnpm roadmap:check` and `git diff --check` pass.
- [x] Human Owner explicitly accepts ADR-006 before TASK-016 may reach READY.

## Validation / reviews

During DRAFT/approval preparation:

```text
corepack pnpm lint
corepack pnpm roadmap:generate
corepack pnpm roadmap:check
git diff --check
```

Review evidence must include:

- independent QA comparison against ADR-005, SPEC-004 and roadmap scope;
- Independent Auditor threat/security review covering phishing, recovery, session theft, CSRF,
  account enumeration, IDOR, rate-limit bypass, privilege/state invalidation and secret leakage;
- confirmation that TASK-015 changed no production source, SQL migration, package manifest,
  dependency, lockfile or runtime configuration;
- confirmation that all implementation-specific dependencies remain owned by TASK-016 or later.

First independent DRAFT review found `P0/P1/P2/P3 = 0/2/1/0` and the first Independent Auditor pass
found `0/5/3/0`; the consolidated correction cycle must close those findings and receive fresh exact-
snapshot QA and IA verdicts before the Human gate.

Final corrected exact DRAFT review evidence:

- ADR SHA-256: `3c7141ec49ac9137b8a989d266af6f8f5c20dde72fc22d79c0fca041047380b1`;
- independent QA: `P0/P1/P2/P3 = 0/0/0/0` — `READY` for the Human ADR gate;
- Independent Auditor: `P0/P1/P2/P3 = 0/0/0/0` — `PASS` for the Human ADR gate;
- `corepack pnpm lint`, `corepack pnpm roadmap:check` and `git diff --check`: PASS;
- review scope remains documentation/task/roadmap only; no production source, SQL migration, package
  manifest, dependency, lockfile or runtime configuration change exists in TASK-015.
- Human Owner explicitly accepted ADR-006 on 2026-09-16; ADR status is now `Accepted` and the Class A
  pre-implementation architecture gate for TASK-016 is satisfied.
- Human Owner explicitly authorized TASK-015 repository completion/history on 2026-09-16.

## Dependencies

- TASK-012 — ADR-005 Persistence & Data Access Strategy: DONE.
- TASK-013 — PostgreSQL Schema v1: DONE.
- TASK-014 — Database Adapter & Migration Foundation: DONE.
- ADR-005: ACCEPTED.
- SPEC-004: APPROVED.

## Risks / irreversible actions

- Authentication/recovery mistakes can create account-takeover or permanent lockout paths; this is a
  mandatory Independent Auditor trigger.
- Email recovery is deliberately a weaker recovery channel than WebAuthn authentication; compromise
  of the verified mailbox remains a residual account-recovery risk and must not silently count as
  high-assurance recent passkey authentication.
- Passkey-only v1 avoids password-secret storage but makes reliable recovery/onboarding email delivery
  operationally important.
- Session persistence can become a long-lived bearer-token risk if cookie, expiry, revocation or
  token-at-rest requirements are weakened during implementation.
- No production account/security data mutation or destructive operation is authorized by TASK-015.
- Repository completion/history was explicitly authorized by the Human Owner on 2026-09-16.

## Expected files / boundaries

Primary TASK-015 write boundary:

```text
docs/decisions/ADR-006-authentication-authorization-session-model.md
tasks/done/TASK-015-auth-authz-session-model.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
```

No `apps/**`, `packages/**`, SQL migration, package manifest, dependency, lockfile or runtime config
change is authorized by TASK-015.

## Completion

Independent QA and the required Independent Auditor review are clear. The Human Owner explicitly
accepted ADR-006 and separately authorized TASK-015 repository completion/history on 2026-09-16.
TASK-015 repository completion/history is authorized and this `DONE` snapshot is the canonical
integration target. TASK-016 may rely on ADR-006 as accepted architecture, but no TASK-016
implementation has started.

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
