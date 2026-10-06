# TASK-122 — Local Pre-alpha Environment & Operator Runbook

## Metadata

- State: ACTIVE
- Class: B
- Owner: Software Developer (ChatGPT prime)
- Owner execution surface: ChatGPT prime
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: independent security/integrity reviewer for the local-only auth/session boundary
- Auditor execution surface: independent ChatGPT delegated reviewer
- Consultants: N/A — this task must consume existing accepted gameplay/data/auth contracts without redefining them
- Consultant execution surface(s): N/A
- Dependencies: TASK-016/017/025/038/039/041/100/103/109/110/111/118/119; existing APPROVED contracts only
- Branch: `feat/TASK-122-local-prealpha-environment-runbook`
- Worktree: `.worktrees/TASK-122-local-prealpha-environment-runbook`

## Objective

Turn the already-integrated first-Pre-alpha runtime into a reproducible **local-only operator environment**
that can be started, reset, inspected and stopped from a fresh checkout, and can support one or two isolated
test accounts/ALTs without enabling any public/production capability.

## Authorized scope

1. Provide an owned local PostgreSQL 17 lifecycle with explicit Doctor/Start/Reset/Status/Stop controls.
2. Run only the existing canonical migrations against that local/disposable Pre-alpha database.
3. Serve only the already-published immutable local game-data bytes required by the accepted runtime.
4. Provide a separate local-only API execution surface that reuses the existing API applications/contracts,
   while keeping production `apps/api/src/index.ts` unchanged.
5. Provide local-only test-session/account fixture wiring for one or two ALTs without adding a public auth
   bypass, enrollment UI, starter endpoint or new public protocol.
6. Invoke the existing trusted TASK-109 bootstrap internally when all required accepted authority is
   available. Missing gameplay/content authority must fail closed; this task may not synthesize it.
7. Provide Vite local-test proxy/origin wiring so the current relative `/auth` and `/player` client calls
   reach the local API for each ALT independently.
8. Add real local HTTP smoke coverage for account isolation and the already-authorized management-first
   surfaces that are reachable without excluded Class-A/public gates.
9. Document the exact operator runbook, diagnostics, known limitations and cleanup procedure.

## Explicit non-goals / authority boundaries

- No production database migration or persistent production environment.
- No deploy, public enablement, Cloudflare production binding, tunnel or public URL.
- No public CombatPresentation GET registration or enablement.
- No eligible-Moves endpoint or Move editor authority; TASK-100 remains ACTIVE.
- No TASK-120/SPEC-025 or TASK-121/SPEC-026 implementation or inferred Human choice.
- No new starter-choice/bootstrap public API or UI. TASK-109's trusted internal bootstrap boundary remains.
- No weakening of ADR-006 authentication/session semantics in the production entry point.
- No new gameplay/economy/genetics/profile/content semantics. Missing authority is a blocker, not a fixture
  value to invent.
- No reset/cleanup/deletion of preserved historical worktrees.

## Acceptance criteria

- [ ] `Doctor` verifies Node/pnpm/Docker/ports/local authority inputs without mutating production state.
- [ ] Local PostgreSQL starts on loopback under an owned project label and Reset recreates only that owned
      local test database state.
- [ ] Canonical migrations run successfully against the owned local database.
- [ ] Immutable accepted game-data publication is served from loopback and verified by the real runtime.
- [ ] Production API entry/config is unchanged; local-only auth/session wiring cannot be enabled through it.
- [ ] One local test account can obtain a local fixture session and load the existing Player surfaces.
- [ ] When canonical bootstrap authority is available, the real TASK-109 bootstrap creates exactly one
      starter/Team/50-20-5 Inventory aggregate without a public bootstrap endpoint.
- [ ] Two ALT fixtures remain owner-isolated under concurrent local API use.
- [ ] Existing Cards-only Hunt management remains fail-closed where public CombatPresentation and
      TASK-120/121 are unavailable.
- [ ] Runbook documents Start/Status/Smoke/Stop, ALT URLs, reset semantics, diagnostics and all excluded gates.
- [ ] TASK-041 harness and relevant package/workspace gates remain green.
- [ ] Independent QA + security/integrity review find no unresolved P0/P1/P2 in TASK-122.

## Required validation

- Focused unit tests for local config/path/guard logic.
- Local HTTP/PostgreSQL integration smoke using only an owned loopback database/container.
- Two-account ownership/isolation smoke.
- Web typecheck/test/build for any Vite/proxy change.
- API typecheck/test/build/dry-run for local-entry isolation.
- `pnpm task-041:harness:local`.
- `pnpm roadmap:generate`, `pnpm roadmap:check`, `pnpm portfolio:check-local`, `git diff --check`.

## Completion rule

TASK-122 may close only when the operator flow itself is reproducible and independently reviewed. A green
tooling task does **not** mark M0/M1/M2 complete by itself and does not satisfy any Human/Class-A/public gate.
If an accepted gameplay authority required by trusted bootstrap/Hunt start is absent from the repository,
record that as a blocker and leave the affected milestone open rather than manufacturing test authority.
