# PokeNexus Idle — Closed Alpha Phase 01 Validation Record

> **Documentary provenance clarification (2026-10-16; NOT a new validation):** the 2026-10-14 "Validation period: Started" entry below records the **opening of a preparation/fixture validation record**, not the start of tester execution. The 5–10 Alpha Testers are an **approved future cohort size**, not registered/invited testers. The initial `pokenexus-prealpha-local`/port `55432` baseline describes historical **Pre-alpha fixture** evidence only; it must not be substituted for the later dedicated TASK-136 Alpha candidate (separate port `55433`), which was smoke-tested and stopped without real e-mail, passkeys or testers. Chronological entries below may supersede earlier "not applied" statements (such as SQL0017 before the later dedicated Alpha smoke). As of this control review, TASK-136 E0 security remains **NOT READY** and E1–E4/live Human review are open. This qualification changes documentation only, not source, SQL, environment, or historical evidence.

## Purpose

Record evidence collected during Closed Alpha Phase 01. This document tracks the validation cycle of the online server experience.

It does not represent software distribution, release packaging or public launch.

## Validation baseline

- Server environment: Docker local Closed Alpha validation environment (`pokenexus-prealpha-local`)
- Repository/reference state: `main` control baseline `558adb6`
- Validation period: Started `2026-10-14T15:05:52Z`
- Authorized testers: 5 to 10 Alpha Testers

## Phase 01 execution preparation

Before opening tester access, record:

- server environment identifier;
- access authorization reference;
- validation start timestamp;
- participating tester identifiers;
- responsible validation coordinator.

Tester identities and access records are operational evidence and must be filled from the real Phase 01 execution context.

## First validation cycle checklist

- [x] Validation record created.
- [x] Server-oriented validation model confirmed.
- [x] Repository reference recorded as context evidence.
- [x] Server environment details recorded.
- [ ] Tester access records created.
- [ ] First gameplay evidence collected.

## Environment registration requirements

Before collecting player evidence, record:

- server environment identifier;
- deployed/running application state reference;
- database/runtime context required to reproduce observations;
- validation start timestamp.

Phase 01 Docker environment:

- Database: PostgreSQL container, loopback validation port `55432`.
- API: `http://127.0.0.1:8787`.
- Game Data: `http://127.0.0.1:8788`.
- Web validation surface: `http://localhost:5173`.
- Bootstrap authority: Genetic Profile authority ready.
- Authority hash: `sha256:0d5e94600dc98335d85ea586586b9b73eb5ea7576f5fea26eb2e5bed23996b61`.

Validation evidence:

- Local infrastructure smoke passed: immutable v5, session, self-scope and catalog transport.

No environment, tester account or gameplay evidence is inferred without an actual Phase 01 execution context.

## Tester observations

| Category | Evidence | Status |
| --- | --- | --- |
| Gameplay loop | TBD | Open |
| Progression | TBD | Open |
| Collection/Teams | TBD | Open |
| Inventory | TBD | Open |
| Offline/recovery | TBD | Open |
| UX issues | TBD | Open |

## Bug evidence

For each issue record:

- reproduction steps;
- affected area;
- severity;
- evidence reference;
- validation result.

## Phase review

Pending tester evidence collection.

## Server validation evidence

- [x] Docker server environment remained active during validation.
- [x] Trusted bootstrap executed with approved Genetic Profile authority.
- [x] Bootstrap persisted Player, starter Pokémon instance and Team state.
- [x] TASK-041 validation harness passed after server preparation.
- [x] PostgreSQL integration scenarios passed for persistence/recovery invariants.

Validation evidence:

- Bootstrap result: accepted Player A bootstrap with starter species `candidate:species:pokedex-bulbasaur-1:91b07648a3`.
- Infrastructure smoke: immutable v5, session, Player self-scope and catalog transport passed.
- Harness: web 43/43 tests, API 44/44 tests, PostgreSQL integration scenarios passed.

The remaining Phase 01 validation requires real Alpha Tester activity and gameplay observation on the online validation server.

## 2026-10-15 — TASK-136 corrective source-only cycle

The previous 2026-10-14 smoke/bootstrap observations above are historical, **not proof** of a working new-tester Alpha entry. Current local status command could not reach the Docker Desktop Linux engine pipe; the server's current uptime was not confirmed and no live database mutation was attempted.

Source changes now include an opt-in, same-URL Alpha entry candidate using verified-email enrollment, passkey auth and server-authoritative first-login bootstrap. Regression evidence: Database 78/78, API 296/296, Web 177/177; Web build and roadmap checks PASS. This is unit/source verification only, not HTTP/browser/PostgreSQL acceptance.

Real invitation issuance, email delivery, verification, WebAuthn browser ceremony, distinct account/session bootstrap, reconnect and two-context same-URL isolation remain **OPEN**. The default email sender is intentionally unavailable. Migration 0017 has **not** been applied; the unapproved 0016 telemetry DDL must stay isolated. No tester invitation was sent, no credentials were fabricated, and no Alpha gate was promoted.

**2026-10-15 PostgreSQL update:** Docker Linux engine recovered. An Alpha-only, disposable PostgreSQL 17 integration suite passed **5/5**. The owned test container was removed. Its isolated temporary migration directory included only historical 0001–0014 and TASK-136 0017, **excluding** TASK-132 telemetry SQL0016. Verified invalid/replayed invites, verified-email Account binding, rejection of ungated enrollment, replacement invitation for a verified pending Account, concurrent single-use, and expired email-action retry restricted to the original mailbox. This is evidence of database integrity in a disposable test instance; it does **not** establish a working browser/passkey/session/real-email/tester flow. The actual local Alpha stack remains stopped, and the persistent DB was not migrated.

Independent Auth/security and Web QA both returned **NOT READY**; the source-proven pending-Account uniqueness defect was corrected and its real-PG regression passed. Email delivery and Alpha launcher are unresolved blockers.

## 2026-10-15 — TASK-136 nonfixture Alpha server operational smoke (not tester acceptance)

The source-only assessment above preceded a separate, dedicated **TASK-136 local Alpha server**. Its operator is documented in `scripts/local-alpha-README.md` and invoked through `scripts/local-alpha.ps1` (`Doctor`, `Start`, `Status`, `Smoke`, `Stop`, `IssueInvite`). This is **not** the legacy multi-port fixture runtime. The only player-facing URL remains `http://localhost:5173/` with transparent `/auth`, `/alpha`, `/player` proxying to the real API. Two independent browser sessions must use that same URL.

**Observed lifecycle:** the operator launched a dedicated PostgreSQL 17 container (`pokenexus-alpha-local`, loopback 55433) with an owned persistent volume, the real Alpha auth API (8787), the game-data service (8788) and one Vite Alpha Web (5173). First migration applied **0001–0014 and TASK-136 0017**, while **excluding TASK-132 0016**; a second migration run skipped those same 15 records. The legacy Pre-alpha fixture database was not substituted for the Alpha database.

**Smoke evidence:** Web HTML HTTP 200; anonymous `/auth/session` HTTP 401; anonymous `/player/profile` HTTP 401; disallowed Origin on `/alpha/access/redeem` HTTP 403. The owned services were stopped, listeners released, generated Wrangler configuration removed, and the dedicated database volume and stable external key material preserved. Source and process provenance were recorded by the operator. No reset, merge, deploy, public link, tester account or distribution took place.

**Important limitation:** startup smoke supplied an intentionally **non-deliverable placeholder** mail-provider key to exercise wiring, with **NO invite or email attempted**. The real Resend HTTPS sender adapter exists and its provider transport unit tests pass, but operator `ALPHA_RESEND_API_KEY`/verified `ALPHA_EMAIL_FROM` were unavailable. No external provider acceptance, tester mailbox receipt, consumed email code, browser WebAuthn passkey, separate Account/Session/Player or first-login bootstrap is claimed.

**New automated evidence:** Database **78/78** unit tests; API **299/299** unit tests; Web **184/184** unit tests, TypeScript check and build PASS after implementing session-loss reconciliation, sign-out and short-lived auth flow handling. A second disposable PostgreSQL 17 run confirmed **6/6** Alpha invitation/redeem tests including an overlapping invite reissue/email-token redemption without deadlock. This disposable test DB is separate from the newly preserved nonfixture Alpha runtime database; no real tester was provisioned in either.

**Independent review:** prior Security and Web workers correctly reported NOT READY; subsequent strict read-only QA confirmed the real sender/launcher source paths, verified-email sequencing and row lock-order fix, while identifying process/provenance/secret-file hardening and incomplete live two-context browser evidence. Outstanding P2 items must be recorded against exact final hashes; review of launcher hardening remains underway and cannot be predeclared READY.

**Open PA-M6.1 exit evidence:** real mail credentials plus delivery/receipt verification; two separate browser profiles with independent passkey ceremonies and cookies on **one** `http://localhost:5173/`; distinct Account, Session and Player; persisted first-login starter, Team and Inventory; cross-player read denial; reload/reconnect and returning sign-in; consistent first-login starter selection contract with SPEC-027's six options; independent final QA and Human Owner UI/gameplay review. **PA-M6.1 and TASK-136 remain NOT READY / ACTIVE.**

**Later same-day launcher hardening:** independent Security QA found that early smoke's global Docker object name/scope could conflict with another checkout, private-file writes preceded ACL restriction, and runtime hash provenance did not cover all critical auth/database entrypoints. The operator was corrected to use **checkout-hash-scoped** Docker container/volume labels and names; guard Stop with the matching local state; create secrets, temporary Docker environment and Wrangler config with restrictive Windows ACL **before** secret bytes; and compare SHA-256 of **19 selected security-critical sources**. A new scoped runtime passed PowerShell AST/Doctor/ACL checks, migration selection, Start/Smoke/Status/Stop; selected hashes matched 19/19. The initial unscoped smoke container and its data volume were preserved untouched; they are not the active launcher authority. The last scoped container also exited, and no app listener or verification email remained active. This code change requires independent final re-gate and does **not** advance tester acceptance.

**Follow-up independent launcher QA (source only): SECURITY NOT READY.** The strict read-only reviewer identified a **P1 potential HTTP disclosure** of `apps/api/.wrangler/task136.local.toml` (Resend, Auth/CSRF/Genetics and PostgreSQL secrets) via Vite's default workspace `/@fs/` file-serving permissions in `apps/web/vite.alpha.config.ts`. The access path was assessed from exact source/Vite middleware; **no real HTTP exfiltration was tested and no real secret was supplied**. Further P2: an early Start error before persisted launcher state can leave an owned container running; the bounded source hash list omits other critical helpers. Treat this as a new source gate, even though the prior non-deliverable smoke passed. Plan E0–E4: `docs/project/PA-M6_1_ALPHA_ENTRY_EXIT_PLAN.md`. **Do not inject real mail credentials before E0 Security READY.**
