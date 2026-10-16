# TASK-136 — Alpha Entry & Tester Provisioning Gate

## Metadata

- State: ACTIVE
- Class: B
- Owner: SD → ChatGPT prime
- Reviewer: Independent QA required before PA-M6.1 completion
- Control branch: `main`
- Control worktree: `.`
- Milestone: PA-M6 — Closed Alpha Preparation / Phase 01 Execution
- Dependencies: TASK-016, TASK-017, TASK-109
- Execution baseline: `main` at `558adb6` plus uncommitted TASK-136 source; no merge/push/activation authorized by source tests.

## Objective

Create and validate the player entry path required before Closed Alpha tester execution.

The gate must prove that an authorized Alpha Tester can enter through one player-facing entry surface and receive an independent account, session, player identity and first-login bootstrap state.

## Scope

- Alpha entry experience.
- Tester session creation/selection flow.
- Account-to-Player provisioning.
- First-login bootstrap integration.
- Redirect into HUB after successful provisioning.
- Error/loading states required for a usable Alpha entry.

## Explicit non-goals

- Public deployment.
- Production authentication redesign.
- Public launch.
- Replacing existing authentication/security contracts.
- Using local fixture sessions as Alpha execution evidence.

## Acceptance Criteria

- [ ] One player-facing entry URL works for Alpha access.
- [ ] New tester session creates or resolves the correct account.
- [ ] Player identity is isolated by account ownership.
- [ ] First login provisions the player state correctly.
- [ ] Bootstrap creates required initial gameplay state.
- [ ] Browser A and Browser B can use the same entry surface with different sessions.
- [ ] Independent QA validates no account/player leakage.
- [ ] Human Owner validates the entry experience before opening tester execution.

## Evidence Requirements

Accepted evidence must show:

- same entry surface;
- different sessions;
- different accounts;
- different players;
- independent bootstrap results.

Local A/B fixture ports are development tooling only and are not Alpha acceptance evidence.

## Candidate implementation — 2026-10-15 (NOT ACCEPTED)

- Single local browser origin: `apps/web/vite.alpha.config.ts` proxies `/alpha`, `/auth`, `/player` without injecting a fixture cookie; `vite.local.config.ts` remains fixture-only tooling.
- Real opt-in Alpha runtime: `apps/api/src/local-alpha.ts` uses the existing authentication application, approved local bootstrap authorities, ownership derived from the authenticated account and a fail-closed first-login step. `alpha-resend-sender.ts` is a configured real HTTPS mail-provider adapter, not evidence that a mailbox received a message.
- Dedicated operator launcher: `scripts/local-alpha.ps1` and `scripts/local-alpha-README.md` manage one Alpha Web 5173, real API 8787, game-data 8788, independently owned PostgreSQL 55433 and stable local secrets. Only operator-supplied real `ALPHA_RESEND_API_KEY` and `ALPHA_EMAIL_FROM` may enable mail delivery. No fixture session, second frontend or public deployment is part of the launcher.
- After independent Security P2 review, Docker ownership names/labels became checkout-scoped and Stop requires matching saved process state; sensitive files receive an owner-only DACL atomically before secret bytes; provenance now covers 19 selected security-critical paths. A second scoped Start/Smoke/Status/Stop passed; earlier unscoped volume/container were intentionally preserved and are not reused as active authority.
- Invite persistence: `0017_alpha_invites.sql`, `alpha-invite-repository.ts`, server-only `alpha:invite:issue` operator. A 32-byte code authorizes issuance of ONE verified-email action; it does not create an account, session or a pre-verified restricted flow.
- The explicitly selected `scripts/alpha-migrate.mjs` applies historical 0001–0014 plus TASK-136 0017 and EXCLUDES TASK-132 0016. The first operational Alpha launcher smoke applied this set to a newly owned **persistent Alpha database**, while leaving the old Pre-alpha fixture DB untouched; the second run skipped the same 15 applied migrations.
- After email possession verification, the existing restricted/passkey registration issues the session; the client also supports returning-user passkey sign-in, email-action redemption and restricted-flow resumption.
- Existing ADR-006's verified-email requirement, credential binding, Origin/CSRF and session checks remain authoritative. No invite-only authentication exception is approved.
- Failed/expired email-action delivery may request another action for the same email after expiration (up to 15 minutes), but cannot rebind the invitation to a different email. UI warns about unknown POST outcomes and reconciles full Session before restricted-flow state rather than automatically replaying a one-use action.
- Client blocks HUB on bootstrap failure, displays a retryable error and shares its in-flight initialization across StrictMode effect replay; a 403 triggers a fresh session check. An authenticated player can sign out via server-backed CSRF-protected logout.

## Source verification (not Phase 01 tester evidence)

- `@pokenexus/database`: **78/78** unit tests PASS (16 files).
- `@pokenexus/api`: **299/299** unit tests PASS (36 files); real HTTPS mail adapter's provider-call tests use a mock transport and do not prove delivery.
- `@pokenexus/web`: **184/184** unit tests PASS (25 files); TypeScript typecheck and Vite build PASS, including authoritative session-first reconciliation after lost email/passkey HTTP responses and server-backed sign-out transport tests.
- `roadmap:check`: **137 tasks PASS** before this documentation update; regenerate/recheck after updating roadmap; `git diff --check`: PASS.
- Focused Alpha tests cover email-action reservation/replay, HTTP route opt-in, forbidden Origin/open enrollment, restricted session and WebAuthn request/response encoding.
- Real PostgreSQL 17 integration **6/6 PASS** (`packages/database/integration/alpha-invite-postgresql.test.ts`), using an **owned disposable test container**, removed after execution. The temporary migration set included canonical 0001–0014 plus Alpha 0017, excluding TASK-132 SQL0016. Verified invalid/replayed invites, verified-email Account binding, denial of ungated enrollment, re-invite of pending Account, concurrency (single winner), expired-email retry bound to the original mailbox and concurrent retry/redemption lock ordering.
- Operational non-delivery Alpha server smoke **PASS**: dedicated PostgreSQL 55433, API 8787, Game Data 8788, one Web 5173 with the real Alpha runtime. Root HTML 200; anonymous `/auth/session` and `/player/profile` 401; disallowed Origin on `/alpha/access/redeem` 403. The launcher was stopped afterward, retaining the Alpha volume/stable keys; no real invite/mail was issued. A deliberately **non-deliverable** provider placeholder was used solely to prove process wiring, NOT email functionality or tester acceptance.

## Independent QA (2026-10-15)

- Auth/security and Web QA agents were both run in **strict read-only** mode on the candidate and reported **NOT READY** (no false acceptance).
- QA found an `account_id UNIQUE` violation when a second invite reached an already verified `pending_activation` account. The unactivated 0017 candidate was corrected, then a real-PG regression proved re-invitation without duplicating the pending Account. Invalid-code email-quota consumption was corrected by validating the invite before consuming the email issuance quota.
- QA also identified the absence of a functional local sender/Alpha launcher; the corresponding source and operator automation now exist and were smoke-tested without sending email. Cacheability of authenticated session reads, synchronous Alpha invite timing, inverse invite/email row-lock order and misleading lost-mail UI were corrected. Further independent Security/Web re-gates are required on final candidate bytes. Near-simultaneous localhost rate-limit pressure, complete passkey browser validation and tester UX remain open.

## Pending P1 / exit gates

**Plano operacional de resolução:** `docs/project/PA-M6_1_ALPHA_ENTRY_EXIT_PLAN.md` (etapas E0–E4, responsáveis, testes, evidências e dependências humanas). **Último Security QA independente encontrou P1 ainda aberto:** o Vite Alpha pode expor `apps/api/.wrangler/task136.local.toml` pela rota `/@fs/` (caminho permitido pelo workspace, sem `server.fs.deny` explícito); o caso foi fundamentado por análise estática e ainda requer reprodução HTTP com segredo sentinela e re-gate após patch. **Nenhuma chave Resend real até corrigir.** QA identificou também P2 de cleanup antes de `state.json` e hashes parciais de proveniência. O plano explicita como fechá-los sem interferir no container legado.

1. **Server lifecycle smoke PASS; tester onboarding still unproven:** the newly owned Alpha stack was started, migrated, smoke-tested and stopped cleanly. Its preserved database currently contains no real tester provisioning evidence. The previously stopped `local:prealpha` fixture is unrelated and must never be counted as Alpha acceptance.
2. **Real email delivery not configured or received:** provider integration is implemented but live `ALPHA_RESEND_API_KEY` and a verified `ALPHA_EMAIL_FROM` were not available. No mailbox receipt/verified one-time token or WebAuthn ceremony has been observed. Mock sender tests or non-deliverable credentials do not satisfy this gate.
3. **Migration isolation implemented:** the dedicated Alpha migrator ran 0001–0014+0017 on the separate Alpha DB and excluded 0016. Do NOT run the generic shared migration/start command on the preserved Alpha database; TASK-131/TASK-132 remain independent and unauthorized for this gate.
4. **Actual browser validation missing:** prove two clean browser profiles at identical `http://localhost:5173/`, distinct invites/emails/passkeys/sessions/accounts/players, first-login starter/Team/Inventory, cross-account denials, logout, re-login, reload and failure/retry. The fixed Bulbasaur bootstrap is a provisional implementation; SPEC-027 retains six starter choices and no Owner exception is recorded. Shared loopback rate limiting must be observed during concurrent A/B access.
5. **Independent QA / Human review pending:** prior independent QA rejected acceptance, later deltas are under re-gate. Even source/runtime QA READY would not replace live mail/browser evidence or the Human Owner's experience approval.

The TASK remains **ACTIVE / PA-M6.1 NOT READY**. The localhost Alpha is not open to testers.

## Final live-evidence checklist (not satisfied by source/fixture smoke)

Record an exact UTC timestamp, Git HEAD plus selected SHA-256 provenance, actual Alpha launcher status, database migration ledger, HTTP origin and redacted evidence for **each** test. Never publish invite codes, one-time email secrets, session bearer cookies, credential payloads or operator keys.

1. Configure a real verified Resend sending identity and demonstrate that the provider accepted two unique invite-verification messages and the intended recipients actually received the secrets; no console/mocked transport counts.
2. Open **two clean independent browser profiles** at the same canonical `http://localhost:5173/` (never 5174). Redeem distinct operator-issued invites and verify separate email inboxes; create a WebAuthn passkey separately in each browser. Verify browser-captured `Origin= http://localhost:5173`, host-only session cookies and no fixture/session injection.
3. For each browser, confirm its real server-issued AccountId, Session identity and owned PlayerId are different. Trigger first-login provision, then inspect **authoritative** starter Pokémon, its Level 5/XP124, Team membership/Leader and initial Inventory 50 Balls/20 basic Potions/5 Revive-25; preserve per-player DB authority evidence. **Six starter choices required by approved SPEC-027:** fixed Bulbasaur path is not treated as product-compliant without correction/Owner decision.
4. Attempt a Player A resource identifier read under Browser B and vice versa. Confirm appropriate denial and unchanged private state. Test browser reload, server restart with preserved database/keys and passkey returning-sign-in without new starter/items. Verify explicit logout of Browser A does not change B's valid session.
5. Exercise expired/invalid/replayed invite and email codes, denied Origin/CSRF, canceled WebAuthn, temporarily unavailable mail provider, overlapping invitation issue/redeem and same-loopback A/B rate-limit conditions. A failed bootstrap must block HUB; retry must reconcile without duplication or cross-account identity change.
6. Independent Security/Web reviewers must sign off on **these live outcomes**, after which the Human Owner evaluates actual entry UI, icon/assets clarity, HUB navigation and approved placeholders. Only then consider PA-M6.1 approval; PA-M6.2/6.3/6.4 remain separate gates.
