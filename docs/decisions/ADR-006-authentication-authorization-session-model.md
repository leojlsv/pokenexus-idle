# ADR-006 — Authentication, Authorization & Session Model

## Status

Accepted

## Context

PokeNexus now has an accepted PostgreSQL persistence architecture, a concrete account/player identity
foundation and executable database migrations, but deliberately has no credential, session, recovery
or authorization model yet.

The accepted boundaries that ADR-006 must preserve are:

- `AccountId` is the durable internal authentication/persistence identity and is an application-
  generated UUIDv7;
- `AccountId` is distinct from `PlayerId` and from any external credential/provider identifier;
- PostgreSQL is the authoritative durable store and authentication-sensitive reads use the fresh,
  cache-disabled path accepted by ADR-005;
- browser/API authorization remains server-authoritative;
- `packages/game-core` remains authentication/infrastructure-free;
- SPEC-004 intentionally avoids cascade deletion and leaves account state, credentials, recovery and
  sessions to TASK-015/016;
- later economy, realtime and admin systems need a reusable authenticated-account boundary but own
  their own higher-risk authorization semantics.

Authentication is a high-impact Class A decision. A compromise can expose persistent player state,
future reward/economy authority and later social/realtime identity. Conversely, excessive session
friction conflicts with the product's idle-game nature: hours or days without HTTP activity are
normal and do not mean the underlying Hunt/progression system should stop.

Current security guidance also favors phishing-resistant cryptographic authenticators where
practical. WebAuthn Level 3 is a W3C Recommendation and supports single-device and synced multi-device
credentials (passkeys). NIST SP 800-63B recognizes cryptographic phishing-resistant authentication
and distinguishes long-lived session continuity from fresh reauthentication. OWASP recommends
server-side revocable sessions, Secure/HttpOnly/SameSite cookies, deny-by-default authorization,
per-request ownership checks, generic recovery responses and single-use time-limited recovery
tokens.

## Decision

### 1. PokeNexus v1 is passkey-first and passwordless

The v1 first-party authentication method is **WebAuthn/passkeys**. PokeNexus does not store or verify
user passwords in v1.

This means:

- account activation requires at least one successfully registered WebAuthn credential;
- normal sign-in is an identifier-less WebAuthn assertion ceremony using a client-side discoverable
  credential (passkey); the user does not enter email/username before the browser passkey picker;
- user verification is required for registration and authentication;
- synced passkeys are allowed;
- users may register multiple credentials and the UI should encourage a second credential or a
  backed-up multi-device credential;
- email is an onboarding/recovery/notification channel, not an authenticator used for routine
  gameplay sign-in;
- adding password, OAuth/social login, TOTP or another authenticator later requires an owning accepted
  security change rather than silently widening TASK-016.

This choice removes password hashing/storage/reset from the v1 attack surface. If a later decision
adds passwords, it must separately adopt a modern password-storage contract rather than reusing a
fast general-purpose hash.

### 2. Internal identity remains independent from credentials

`AccountId` is the sole durable internal account identity for application authorization. It remains
an opaque UUIDv7 and must never be derived from or replaced by:

- email address;
- WebAuthn credential ID;
- WebAuthn user name/display name;
- `PlayerId`;
- browser/device identifier;
- IP address;
- future OAuth/OIDC subject.

WebAuthn `userHandle` represents the PokeNexus account using a stable opaque encoding of `AccountId`.
For v1 it is the canonical 16-byte UUID representation of `AccountId`, never a display string. It
contains no email, display name or other personal information.

Credential/account binding is exact:

- a WebAuthn credential ID is globally unique within one PokeNexus RP/environment and is bound to
  exactly one `AccountId`; duplicate registration or cross-account reassignment fails closed;
- a stored credential row also stores the exact expected 16-byte `userHandle` for its account;
- every successful identifier-less assertion must return a non-null `userHandle`; the server resolves
  the credential by credential ID and requires returned `userHandle`, stored credential account and
  decoded `AccountId` to agree exactly before authentication succeeds;
- credential ID or `userHandle` is a selector/binding input, not independent authorization proof.

The authenticated session resolves to `AccountId`. Gameplay authorization then resolves ownership
from authoritative server state; clients do not gain authority by submitting an `AccountId`,
`PlayerId` or owned-resource ID.

### 3. Account state is explicit and fail-closed

The authentication account lifecycle uses these semantic states:

- `pending_activation` — verified onboarding is in progress but no usable normal session exists until
  a passkey is registered;
- `active` — normal authentication/session use is permitted;
- `disabled` — security/operator-disabled; no normal session or new authentication is accepted;
- `recovery_pending` — mailbox ownership has been proven for a recovery ceremony, all previous normal
  session authority is invalidated and only the restricted recovery flow is permitted;
- `deleted` — terminal v1 authentication state; sign-in/recovery is denied and credentials/sessions
  are removed or rendered unusable according to the deletion workflow.

`recovered` is **not** a permanent account state. Recovery completion is an auditable security event:
`recovery_pending -> active` only after a new valid replacement passkey is enrolled and every
pre-recovery credential has been permanently revoked or superseded. The recovery-start transition has
already advanced the account security epoch; completion records recovery completion and establishes a
post-recovery safety hold without restoring any pre-recovery credential authority.

State transitions are server-side authoritative and conditional on current state. Unknown states,
unavailable security state or stale state fail closed.

### 4. A monotonic security epoch invalidates old authority

Each account owns a monotonic non-negative `security_epoch` (name may be represented equivalently in
SQL/API as long as semantics remain exact).

Every normal authenticated session records the epoch at issuance. A session is valid only if its
stored epoch equals the account's current epoch and the account is `active`.

The epoch increments on events that invalidate all prior authentication authority, including:

- start of account recovery;
- explicit "revoke all sessions";
- transition to `disabled` or `deleted`;
- verified primary recovery-email replacement;
- removal/reset of an active-account passkey outside recovery/deletion.

Adding an additional passkey from a valid active session with recent passkey reauthentication does
not require global invalidation by itself. Removing/resetting an existing passkey does: one atomic
state transition revokes/removes the credential, advances the epoch and revokes all pre-change normal
sessions so a session previously obtained with the removed credential cannot silently survive the
removal.

Epoch invalidation is in addition to per-session revocation. It is not a substitute for checking
account state on each authenticated request.

### 5. WebAuthn ceremonies are tightly scoped

For every environment, TASK-016 must configure an explicit WebAuthn Relying Party ID and exact allowed
browser origins. Wildcard origins are not accepted.

Registration/authentication requirements:

- HTTPS/protected origin in deployed environments;
- cryptographically random, single-use server challenge;
- challenge TTL no longer than 5 minutes;
- challenge is bound to ceremony type and, where applicable, the account/restricted enrollment or
  recovery flow;
- successful use atomically consumes the challenge;
- `userVerification: required`;
- registration requests `residentKey: required`, `requireResidentKey: true` for backwards-
  compatibility signaling, and the credential-properties (`credProps`) extension; if `credProps`
  explicitly reports `rk: false`, registration fails because v1 requires a discoverable credential;
- normal sign-in calls WebAuthn without account-specific `allowCredentials`; only discoverable
  credentials are eligible and the returned `userHandle` identifies the candidate account after the
  ceremony. Sign-in initiation therefore does not accept email/username and does not disclose whether
  an account exists;
- expected RP ID/origin/type/challenge/user-presence/user-verification checks are mandatory;
- attestation defaults to `none`; PokeNexus does not require hardware provenance or retain raw
  attestation solely for device fingerprinting in v1;
- credential ID and public key are persisted; private keys never reach PokeNexus;
- backup eligibility/state are retained as security/recovery signals when returned by the
  authenticator;
- signature counters are stored when present. After a successfully verified assertion, persistence
  must atomically preserve `max(stored_sign_count, observed_sign_count)` (or an equivalent monotonic
  conditional update) so a late/concurrent assertion cannot overwrite a higher counter with a lower
  one. Zero or non-increasing observations are bounded audit/security signals, not standalone proof of
  cloning and not an automatic permanent account lock; synced/multi-device credentials can legitimately
  report zero or otherwise make counter interpretation weak.

Credential registration/removal from an already active account requires recent passkey
reauthentication. A user must not be allowed to remove the last usable credential unless they are in
an accepted recovery/deletion flow that does not leave an unintended active account with no
authenticator.

### 6. Verified email is the onboarding/recovery channel

PokeNexus requires one verified recovery/contact email for v1 account onboarding and recovery. The
email is sensitive account data but is not canonical account identity and is never public gameplay
identity.

V1 freezes one deterministic recovery-address equality policy so mailbox possession cannot map
ambiguously to multiple accounts:

- v1 accepts a single mailbox `addr-spec` with an ASCII local-part only (no display-name/comment form
  and no internationalized local-part); surrounding ASCII whitespace is trimmed before validation;
- a Unicode domain input is converted to its ASCII IDNA A-label form and ASCII-lowercased; the ASCII
  local-part is also compared case-insensitively by ASCII-lowercasing it;
- no provider-specific transformations are applied: dots are not removed and `+tag` suffixes are not
  stripped;
- the resulting lowercased `local@domain` is the canonical recovery-email lookup key. The separately
  retained delivery/display value is not used for equality or authorization;
- one canonical recovery-email key may belong to at most one non-`deleted` account across
  `pending_activation`, `active`, `disabled` and `recovery_pending`; the database must enforce this
  invariant, not merely application pre-checks;
- a `deleted` account releases the canonical recovery-email mapping at deletion completion. A retained
  tombstone/security record must not keep the address usable for recovery or block later fresh
  enrollment solely because of the deleted account;
- expanding v1 to internationalized local-parts or changing equality/provider-alias policy requires an
  accepted security/data-migration change.

Public enrollment/recovery request endpoints return generic responses regardless of whether an email
is already registered. Timing and error handling must not deliberately create an account-enumeration
oracle.

Email enrollment/recovery links/codes use server-generated high-entropy random secrets that are:

- short lived (maximum 15 minutes);
- single use;
- bound to purpose;
- stored only as a cryptographic digest, never raw;
- invalidated after successful use, superseding issuance or account/security-state change;
- never logged.

Email link presentation must not consume the secret or mutate account state on `GET`; automated mail
link scanners/prefetchers must not be able to start recovery or activation. The application may use a
manual code or a browser landing flow, but actual redemption is an explicit app-origin `POST`. If a
link transports the raw secret, the deployment must keep it out of server-observable/logged URL path
or query components (for example by using a browser fragment that is then submitted in the POST) and
must clear it from client-visible navigation state as soon as practical.

Redeeming one of those one-use email secrets does **not** turn that secret into a multi-request bearer.
Successful redemption atomically consumes it and issues a distinct restricted-flow server capability:

- a fresh CSPRNG secret with at least 256 bits of entropy is placed only in a dedicated browser cookie;
  PostgreSQL stores only its one-way lookup digest plus a non-secret `flow_id`;
- the restricted flow is bound to exactly one `AccountId`, purpose (`activation` or `recovery`),
  account state and current `security_epoch`, has a maximum absolute lifetime of 15 minutes and is not
  sliding;
- the cookie is separate from the normal-session cookie, `Secure`, `HttpOnly`, host-only, `Path=/`,
  `SameSite=Strict` and never accepted by normal authentication/session middleware;
- every state-changing restricted-flow request also requires exact Origin validation plus an
  unpredictable CSRF token bound to that restricted flow;
- a WebAuthn registration challenge created inside the flow is additionally bound to its `flow_id`,
  purpose, `AccountId` and epoch;
- a newer flow for the same account/purpose supersedes older restricted capabilities. Completion,
  expiry, explicit cancellation, account-state/epoch change or successful use invalidates the
  restricted capability and its outstanding challenges;
- restricted capabilities can execute only the enumerated activation/recovery completion operations;
  they never authorize gameplay, export, deletion, session management or future economy/admin APIs.

For recovery specifically, token redemption and the recovery-start state transition are one atomic
operation: the account first advances to the resulting recovery `security_epoch`, existing sessions are
invalidated and pre-recovery credentials are quarantined, then the restricted capability is issued
bound to that resulting epoch. No capability is briefly valid against the pre-recovery epoch.

An email-delivery provider is an implementation/deployment dependency and is not selected by this
ADR. Provider credentials remain server-side secrets.

Initial activation flow:

1. user requests enrollment for an email;
2. the system returns a generic public response;
3. verified possession of the email permits creation/continuation of a `pending_activation` account
   and a restricted enrollment context;
4. user registers a valid passkey;
5. account becomes `active` and a normal session is issued.

If the canonical email is already reserved by a non-deleted account, public enrollment still returns
the generic response. A pending-activation account may receive a fresh enrollment attempt when the
authoritative abuse policy permits it; active/disabled/recovery-pending accounts are not silently
rebound to a new account.

Recovery-token issuance is allowed only for an `active` account or to resume the same account already
in `recovery_pending`. A resume token is bound to the existing recovery epoch and, when redeemed,
supersedes prior restricted recovery capabilities without incrementing the epoch again. `disabled`,
`deleted` and `pending_activation` accounts do not receive recovery authority; the public response
remains indistinguishable.

Account recovery flow:

1. user requests recovery and receives the same generic public response shape;
2. only successful possession of a valid recovery secret starts recovery;
3. starting recovery atomically increments the security epoch, invalidates all prior normal sessions,
   marks every credential that existed before recovery as quarantined/unusable for authentication and
   enters `recovery_pending`;
4. a restricted recovery capability may register a new replacement passkey but cannot access
   normal gameplay/account export/deletion or future economy/admin actions;
5. successful replacement-passkey enrollment uses a state+epoch-guarded atomic transition that
   permanently revokes/supersedes all pre-recovery credentials, activates only the replacement
   credential set, transitions the account to `active`, records `account_recovered`, establishes
   `post_recovery_hold_until = recovery_completed_at + 24 hours`, invalidates restricted recovery
   capabilities/challenges and issues a new normal session;
6. a pre-recovery credential can never authenticate merely because the account became active again;
7. recovery completion itself does not satisfy recent passkey authentication. The replacement passkey
   may subsequently perform normal authentication, but until the 24-hour post-recovery hold expires,
   even a fresh valid passkey reauthentication cannot authorize passkey add/remove, recovery-email
   change, account export/deletion or other account-security/destructive operations. Logout remains
   allowed. After the hold, those operations again require the ordinary 10-minute recent-auth gate.

Email compromise therefore remains a residual account-recovery risk. Later high-value economy/admin
features must define their own post-recovery assurance/hold rules and may require stronger controls;
they must not inherit mailbox recovery plus the v1 24-hour hold as sufficient value-transfer/admin
authority by default.

Recovery-email replacement from an active account requires recent passkey reauthentication. The new
canonical address is verified before replacement and uniqueness is checked again inside the atomic
swap. Successful replacement increments `security_epoch`, revokes existing normal sessions and
invalidates outstanding auth/recovery challenges/restricted capabilities. The old canonical mapping is
released only by that successful swap; until then, the old verified address remains authoritative.

Security-sensitive changes produce user-facing notification attempts independent from audit logging:

- passkey added or removed -> notify the currently verified recovery address;
- recovery started and recovery completed -> notify the verified recovery address;
- recovery-email replacement -> notify the newly verified address and, where still deliverable, the
  previous address;
- account deletion request/completion -> notify the currently verified address while it remains
  available.

Security notifications contain no session/recovery/WebAuthn/CSRF secret. Delivery failure is audited
but does not expose account existence through the initiating public response and does not silently
roll back an otherwise committed security transition.

### 7. Browser sessions are opaque and server-side revocable

PokeNexus uses server-side sessions for browser authentication. A stateless self-contained JWT is not
the primary browser session authority in v1.

On successful authentication, the server generates a fresh session secret with at least 256 bits of
CSPRNG entropy. The raw secret exists only in the browser cookie and transient response handling.
PostgreSQL stores a SHA-256 digest (or stronger one-way digest with equivalent lookup semantics),
never the raw secret.

The session has a separate durable `session_id` for internal/audit/reference use. The cookie contains
only the opaque bearer secret and no `AccountId`, `PlayerId`, role, email or personal data.

The browser cookie must be:

- `Secure`;
- `HttpOnly`;
- host-only with no `Domain` attribute;
- `Path=/`;
- `SameSite=Lax` or stricter, with `Lax` as the interoperability baseline;
- named with a `__Host-` prefix when deployment hostname constraints permit the standard prefix
  requirements.

Production browser/API routing should prefer a same-site deployment. If the SPA and API use distinct
origins, CORS must use an exact allowlist and credentialed requests; `Access-Control-Allow-Origin: *`
is forbidden for authenticated requests.

### 8. Session lifetime balances idle UX with security

Normal gameplay session policy is deliberately AAL1-like; ADR-006 does not claim formal NIST AAL
certification.

Maximum v1 session limits:

- absolute lifetime: 30 days from authentication/reauthentication;
- inactivity lifetime: 7 days since accepted subscriber activity;
- security-sensitive recent-auth window: 10 minutes since successful passkey reauthentication.

Environments may configure shorter limits but not longer limits without an accepted security change.
The inactivity choice reflects that multi-hour/day gaps are normal in an idle game. Offline game
progress does not depend on session continuity; an expired session only requires reauthentication
before the next authoritative API action.

For inactivity expiry, only a request that represents subscriber-initiated interaction may advance
`last_activity_at`. Periodic/background polling, prefetch, analytics/beacons, server jobs, automatic
refresh, WebSocket heartbeat/keepalive and idle synchronization without a contemporaneous user action
do not reset the seven-day timer. TASK-016 must classify the routes/actions that count and test that
background traffic cannot keep a session alive indefinitely. A caller-provided header/flag alone must
never be trusted as proof that activity was subscriber-initiated; the server-side route/command
classification is authoritative.

Sensitive operations requiring recent passkey authentication include at minimum:

- add/remove passkey;
- change recovery email;
- view/revoke other sessions or revoke all;
- request account export;
- delete account;
- future privileged/economy actions when their owning contract marks them sensitive.

The 10-minute recent-auth check is necessary but not sufficient during the post-recovery hold defined
above. Security-sensitive endpoints must enforce both eligibility/hold state and authentication
freshness.

Successful reauthentication rotates the browser session secret and updates authentication freshness.
Login always issues a new session secret; a pre-authentication session identifier is never upgraded in
place, preventing session fixation.

Logout revokes the current session server-side and expires the browser cookie. Users can enumerate
their active sessions using non-secret metadata and revoke individual sessions or all sessions.

### 9. CSRF is enforced independently of SameSite

`SameSite` is defense in depth, not the sole CSRF control.

All cookie-authenticated state-changing requests must:

- use unsafe HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`), never state-changing `GET`;
- pass exact `Origin` validation against the configured application origin(s);
- present a session-bound unpredictable CSRF token using a synchronizer-token or equivalent pattern;
- fail closed when Origin/CSRF/session state is absent or invalid.

The CSRF token is not the session bearer secret and is not used as authentication. It may be returned
to the authenticated SPA through a dedicated bootstrap/session endpoint and sent in a custom request
header. It must not appear in URLs or logs.

### 10. Authorization is deny-by-default and ownership-based

Authentication proves an `AccountId`; it does not grant blanket access to application resources.

Every authoritative request is categorized as public, restricted-enrollment/recovery, normal
authenticated, recent-auth-required or future privileged. Anything not explicitly categorized is
denied.

For normal player APIs:

- middleware validates session digest lookup, revocation, expiry, account state and security epoch;
- server resolves the account's `PlayerId` from authoritative persistence when gameplay identity is
  required;
- repository/command logic constrains reads and writes by the authenticated owner;
- resource IDs from URL/body are selectors only and never proof of ownership;
- client-provided account/player/role/owner fields never override authenticated identity;
- authorization is checked on every request, including reads;
- authorization failure is fail-closed and does not disclose another user's protected resource.

`disabled`, `recovery_pending` and `deleted` accounts cannot use normal gameplay authorization.
`pending_activation` and `recovery_pending` contexts are capability-limited to their exact completion
flows.

No player session receives an admin/LiveOps role in v1. Future privileged operations require a
separate accepted authorization model and stronger step-up controls rather than overloading the
ordinary player session.

### 11. Rate limiting and abuse controls are layered

Authentication/recovery endpoints must use endpoint-specific abuse controls before expensive or
state-changing security work.

Controls use more than one dimension where practical:

- pseudonymous account/email-derived key when the target identity is known;
- credential/account identifier after authentication;
- IP/network signal only as a supplemental dimension, not the sole identity key;
- route/action family;
- server-side challenge/recovery-token one-time/expiry state.

Cloudflare's Worker Rate Limiting binding may provide a fast coarse edge limit, but it is local to a
Cloudflare location, permissive/eventually consistent and is not an exact global security counter.
Security-critical single-use/replay state therefore remains authoritative in PostgreSQL or another
later explicitly accepted consistent store.

Enrollment/recovery/email-change issuance additionally requires an authoritative consistent per-target
cooldown/backoff so requests distributed across Cloudflare locations cannot flood one mailbox or bypass
the security policy. TASK-016 must:

- derive a stable keyed pseudonymous target key from the canonical recovery email (not store the raw
  address in routine abuse counters/logs);
- enforce the route/action-family + target cooldown/backoff with an atomic PostgreSQL conditional
  update (or another separately accepted consistent store) before sending mail;
- take the same public/generic response path whether the target maps to an account or not;
- ensure exceeding the authoritative cooldown suppresses new token/mail issuance while still returning
  the generic public response.

Repeated failures result in bounded backoff/cooldown and generic errors. V1 does not permanently lock
an account solely because unauthenticated callers generated failures, which would create a trivial
denial-of-service vector.

TASK-016 owns concrete configurable thresholds and tests. Threshold changes may be operational config
when they preserve these invariants; removing layered protection is a security-semantic change.

### 12. Security audit events exclude secrets

TASK-016 establishes the minimum authentication/security audit substrate; TASK-018 later verifies
cross-feature auditability and recovery behavior.

Minimum security-event taxonomy includes:

- account activation;
- passkey added/removed;
- authentication success and materially significant failure/abuse decisions;
- session created/revoked/revoke-all;
- recovery requested/started/completed/failed at meaningful boundaries;
- recovery email changed;
- account disabled/re-enabled;
- account deletion requested/completed;
- repeated authorization-denied/security-control events when operationally useful.

Audit events may include `AccountId`, internal `session_id`, event type, result/reason code,
infrastructure timestamp, correlation/request ID and bounded security telemetry.

Audit/logging must never contain:

- raw session bearer secret or its cookie value;
- raw recovery/enrollment token;
- raw WebAuthn challenge;
- authenticator private material (which should never reach the service);
- CSRF token;
- provider credentials/API keys;
- full authorization headers/cookies;
- secret-store values.

Email should be omitted from ordinary security events when `AccountId` is available. If pre-account
abuse correlation needs an email-derived key, use a pseudonymous keyed digest rather than the raw
email in routine logs.

Raw IP address and user-agent/device telemetry are security/operational metadata, not identity. When
collected for abuse/incident response, default retention is at most 30 days unless an active incident
hold or later accepted legal/security policy requires otherwise. Account-linked security events may
be retained for up to 180 days by default. Exact production retention may be shortened by deployment/
privacy policy, but indefinite raw telemetry retention is not the default.

### 13. Account deletion and export are explicit operations

Account deletion never relies on broad database `ON DELETE CASCADE`.

V1 deletion requires an active account, recent passkey reauthentication and explicit confirmation.
Completion:

- increments security epoch;
- revokes all sessions;
- invalidates pending enrollment/recovery challenges;
- removes/disables WebAuthn credentials and recovery-email use;
- releases the canonical recovery-email uniqueness mapping while retaining no recoverable email
  authority in the deleted account tombstone;
- sets the account's authentication state to terminal `deleted`;
- preserves only the minimum internal account tombstone and referenced durable game/integrity records
  required by relational/integrity contracts until their owning privacy/data-retention workflows
  define safe erasure/anonymization.

Deleted accounts are not recoverable through the ordinary recovery flow in v1. Reinstatement, if ever
offered, requires a separately accepted product/security policy.

Account export requires recent passkey reauthentication. The export contract is machine-readable and
contains the user's own account/profile/game data as those domains become available. It excludes
session/recovery secret material, token digests, anti-abuse internals, other users' data and internal
security detection rules. TASK-016 owns the authentication-side export gate; later domain tasks add
their data to the export contract.

### 14. Logical persistence handoff to TASK-016

TASK-016 may extend the approved SPEC-004 schema through new forward migrations. Exact SQL names may
vary only where semantics remain equivalent, but the implementation needs logical persistence for:

- account auth state + `security_epoch` + canonical/verified recovery-email mapping,
  `post_recovery_hold_until` and lifecycle timestamps;
- WebAuthn credentials: credential ID, account ID, public key, signature counter, backup eligibility/
  state, exact user-handle binding, lifecycle status (active/quarantined/revoked), creation/last-use/
  revocation metadata and a globally unique credential-ID constraint within the RP/environment;
- sessions: internal session ID, account ID, digest of bearer secret, issued security epoch,
  authenticated/created/last-seen/absolute-expiry/revocation metadata and optional bounded user-facing
  device label;
- one-time enrollment/recovery records plus restricted-flow capabilities and WebAuthn challenges with
  purpose, one-way bearer digest where applicable, `flow_id`/account/state/epoch binding, expiry,
  supersession and consumed/revoked state;
- authoritative pseudonymous per-target issuance cooldown/backoff state independent from Cloudflare's
  coarse edge limiter;
- minimum security audit-event records required by this ADR.

No raw session/recovery secret is a database column. No authentication table owns gameplay `PlayerId`
semantics beyond resolving the accepted one-account/one-player relation.

TASK-016 must use PostgreSQL structural constraints/conditional updates where they materially enforce
single-use/state/epoch integrity and must test races such as double token consumption, concurrent
recovery/session invalidation, credential registration/reassignment, recovery completion versus old
credential authentication, email uniqueness/swap, restricted-flow supersession and stale or
out-of-order signature-counter/session updates.

### 15. Threat model and required mitigations

| Threat | Required boundary |
|---|---|
| Credential phishing | WebAuthn/passkey primary authentication; exact RP/origin checks; no password in v1 |
| Stolen DB | No passkey private key/password/raw session/recovery secret stored; bearer secrets stored only as digest |
| Session theft | Secure/HttpOnly/host-only cookie, bounded expiry, server revocation, security epoch, recent-auth step-up |
| Session fixation | Fresh session secret after authentication/reauthentication; no pre-auth ID upgrade |
| CSRF | SameSite + exact Origin + session-bound CSRF token; no state-changing GET |
| XSS | HttpOnly blocks direct cookie read; XSS can still act as the user, so CSP/input/output hardening remains necessary in UI work |
| Account enumeration | Identifier-less passkey sign-in; generic enrollment/recovery responses; avoid raw-email routine logs and obvious timing/error oracles |
| Recovery-token theft/replay | 15-minute max one-use digest token; redemption issues a separate bounded restricted capability; recovery start invalidates old authority |
| Old credential after recovery | Recovery start quarantines pre-recovery credentials; completion atomically revokes/supersedes them before returning active |
| Mailbox compromise | Accepted residual recovery risk; restricted recovery capability + 24-hour security-action hold; later value/admin features require separate stronger policy |
| IDOR/horizontal privilege escalation | Resolve authenticated owner server-side and authorize every resource/request; never trust submitted owner IDs |
| Brute/automated abuse | Layered route/account/pseudonymous/IP signals; authoritative per-target issuance cooldown/backoff; single-use challenge state; no permanent attacker-triggerable lockout |
| Cloudflare limiter bypass across locations | Treat edge limiter as coarse/permissive; security-critical replay/single-use state is authoritative elsewhere |
| Disabled/deleted user using old session | Account state + security epoch checked on every authenticated request |
| Log/telemetry secret leakage | Explicit forbidden-field list; structured reason codes and bounded pseudonymous telemetry |

## Consequences

### Positive

- no first-party password database/reset surface in v1;
- phishing-resistant WebAuthn is the default authentication path;
- internal account identity remains stable when email/credentials change;
- server-side sessions support immediate per-session and account-wide revocation;
- explicit security epoch makes recovery/disable/revoke-all invalidation simple and testable;
- idle-game session UX is separated from recent-auth protection for sensitive operations;
- authorization ownership checks align with the existing server-authoritative persistence model;
- future economy/admin/realtime features get one reusable authenticated account boundary without
  inheriting their higher-risk authorization policy prematurely.

### Negative / trade-offs

- onboarding/recovery depends on reliable email delivery even though normal login does not;
- passkey availability/recovery UX must be designed carefully for users unfamiliar with passkeys;
- email compromise remains a residual account-recovery takeover risk;
- legitimate users completing mailbox recovery wait 24 hours before changing account-security factors,
  exporting or deleting the account;
- server-side sessions add database reads/writes and cleanup work compared with stateless JWTs;
- 30-day absolute / 7-day inactivity sessions increase the importance of browser/device security,
  revocation UI and recent-auth gates;
- without a password fallback, users who lose all passkeys and mailbox access cannot recover v1
  accounts;
- v1 intentionally treats recovery-email local parts case-insensitively and does not support
  internationalized local-parts; this favors deterministic recovery authority over full EAI coverage.

## Rejected alternatives

### Password-first authentication

Rejected for v1 because it creates password hashing, reset, credential stuffing, phishing and breach
response obligations that are unnecessary when modern WebAuthn/passkey support is available.

If passwords are later added, the new decision must adopt a purpose-built slow password hash such as
Argon2id (or another then-current accepted equivalent) with explicit parameters and breach/reset
semantics. SHA-256/PBKDF-free fast general hashes are not acceptable password storage merely because
they are already available for high-entropy session-token digests.

### Email magic link as normal sign-in

Rejected as the primary v1 sign-in mechanism. It would make routine authentication depend on mailbox
security/delivery and is not phishing-resistant in the way a correctly verified WebAuthn assertion is.
Email remains recovery/onboarding only.

### SMS OTP / TOTP as the primary authenticator

Rejected for v1. Manual OTP entry is phishable and adds delivery/shared-secret lifecycle. It may be
considered only as part of a later accepted multi-factor/recovery policy.

### Managed external identity provider as canonical account identity

Rejected as an architecture requirement. A future OIDC/social-login adapter may map an external
subject to internal `AccountId`, but PokeNexus must not make one vendor/provider subject the canonical
game identity or silently outsource authorization semantics.

### Stateless JWT browser sessions

Rejected as the primary browser session because immediate per-session/revoke-all/recovery invalidation
is a first-class requirement. Short-lived signed tokens may later be used for narrow service or
realtime handoffs only under an owning accepted contract; they do not replace the authoritative
browser session record.

### Security questions

Rejected. They are weak knowledge-based recovery material and create additional personal-data/social-
engineering surface without improving the accepted passkey/email recovery model.

### Broad database row-level security as the primary authorization model

Rejected for v1. ADR-005 already keeps authorization in application command/repository boundaries.
Database constraints remain defense in depth for structural ownership; RLS is not silently introduced
as a substitute for explicit server authorization.

## Compatibility with accepted architecture

- ADR-001: authentication implementation remains TypeScript-facing; WebAuthn is a browser/server web
  standard rather than a new application runtime.
- ADR-003: realtime remains limited. ADR-006 defines identity/session prerequisites only; ADR-007 owns
  HUB/Duo handshake/revalidation protocol.
- ADR-005: PostgreSQL remains durable authority, auth-sensitive reads use fresh access, `game-core`
  remains database/auth-free, and session semantics do not depend on PostgreSQL physical session
  state.
- SPEC-004: `AccountId`/`PlayerId` meaning remains unchanged; auth tables extend the schema through new
  forward migrations and do not add broad cascades to player-owned state.

## Implementation ownership

- TASK-016 implements the accepted auth/session schema, endpoints, WebAuthn verification, email-
  action abstraction, session middleware, CSRF, rate/error handling and security tests/audit emission.
- TASK-017 owns Player profile APIs and must consume authenticated `AccountId -> PlayerId` authority.
- TASK-018 verifies persistence/auth recovery, contract and baseline auditability across TASK-014/016/
  017.
- TASK-042/043 own realtime HUB identity/session handshake details.
- TASK-056/070+ own competitive/economy-specific abuse and authorization rules.
- TASK-078 owns future privileged LiveOps UI/contracts and cannot reuse ordinary player sessions as
  implicit admin authority.
- TASK-079/080 own production environment secrets, domains, email-provider credentials and deployment.

## References

- NIST SP 800-63B (Digital Identity Guidelines — Authentication and Authenticator Management):
  `https://pages.nist.gov/800-63-4/sp800-63b.html`
- NIST SP 800-63B — Session Management:
  `https://pages.nist.gov/800-63-4/sp800-63b/session/`
- W3C Web Authentication Level 3 Recommendation (2026-08-25):
  `https://www.w3.org/TR/webauthn-3/`
- OWASP Authentication Cheat Sheet:
  `https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html`
- OWASP Session Management Cheat Sheet:
  `https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html`
- OWASP Authorization Cheat Sheet:
  `https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html`
- OWASP CSRF Prevention Cheat Sheet:
  `https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html`
- OWASP Forgot Password Cheat Sheet:
  `https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html`
- OWASP Multifactor Authentication Cheat Sheet:
  `https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html`
- OWASP Password Storage Cheat Sheet (reference for rejected/future password path):
  `https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html`
- Cloudflare Workers Rate Limiting binding:
  `https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/`
