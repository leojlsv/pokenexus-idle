# TASK-027 — React App Shell & Navigation

## Metadata

- State: DONE
- Class: B
- Owner: Frontend Developer
- Owner execution surface: ChatGPT implementation worker
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent worker
- Auditor: N/A
- Auditor execution surface: N/A
- Consultants: N/A
- Consultant execution surface(s): N/A
- Spec: `docs/specs/SPEC-016-ui-ux-architecture-navigation-design-system.md`
- Related specs: SPEC-001, SPEC-011, SPEC-013, SPEC-015
- Related ADRs: ADR-001, ADR-002, ADR-004, ADR-006
- Branch: `feat/TASK-027-react-app-shell-navigation`
- Worktree: `G:\pokenexus-idle\.worktrees\TASK-027-react-app-shell-navigation`

## Objective

Implement the APPROVED SPEC-016 React application shell and navigation foundation, including route/view
boundaries, centralized client request-state semantics, baseline keyboard/focus/responsive behavior and reusable
loading/empty/error presentation without taking ownership of downstream feature or combat-renderer UI.

## Scope

- conceptual SPEC-016 routes and browser-history navigation;
- authenticated shell bootstrap through the accepted `/auth/session` endpoint;
- private client-cache clearing on session loss/sign-out boundary;
- centralized response/retry policy for stale, pagination-stale, command continuation/supersession and bounded
  Team-create retry semantics;
- persistent four-destination navigation plus Settings utility navigation;
- route heading/focus restoration and semantic current-navigation state;
- reusable loading, empty and recoverable-error components;
- device-local renderer preference entry point without initializing Pixi;
- baseline responsive design tokens/layout, safe-area support and reduced-motion behavior;
- behavior/unit tests for route matching, policy mapping and rendered shell semantics.

## Out of scope

- Collection/Pokémon/Team/Move-loadout production feature UI owned by TASK-100;
- Card combat renderer/event feed owned by TASK-029;
- Pixi scene/rendering owned by TASK-030;
- Hunt settings/auto-capture UI owned by TASK-039;
- new gameplay, persistence, reward, capture or public protocol semantics;
- new server endpoints, database/realtime work, deploy, commit, push or merge.

## Acceptance criteria

- [x] All SPEC-016 routes resolve deterministically with selectors treated as selectors only.
- [x] The shell exposes Hunt, Pokémon, Teams and Inventory primary navigation plus Settings utility navigation.
- [x] Session bootstrap prevents private application content from rendering before authentication state is known.
- [x] Session loss clears private client cache before unauthenticated presentation.
- [x] Client response policy centrally preserves SPEC-011/SPEC-015 retry, stale and command-identity semantics.
- [x] Route changes provide predictable heading focus and active navigation semantics.
- [x] Common loading/empty/error UI states are reusable and accessible.
- [x] Small/medium/large responsive behavior follows SPEC-016 baseline and supports reduced motion/safe areas.
- [x] Renderer preference remains device-local and does not load or initialize Pixi.
- [x] No TASK-100 management feature UI or TASK-029 combat renderer is implemented.
- [x] Focused web lint/typecheck/test/build and project roadmap/diff validation pass.

## Validation

- `corepack pnpm --filter @pokenexus/web lint`
- `corepack pnpm --filter @pokenexus/web typecheck`
- `corepack pnpm --filter @pokenexus/web test`
- `corepack pnpm --filter @pokenexus/web build`
- `corepack pnpm roadmap:check`
- `git diff --check`

## Dependencies

- TASK-026 — DONE; SPEC-016 APPROVED.
- TASK-016 — DONE; accepted session bootstrap endpoint.
- TASK-025 — DONE; accepted Player State semantics consumed by the centralized client policy.
- TASK-038 — DONE; accepted Hunt command semantics consumed by the centralized client policy.

## Risks

- Shell-local retry logic must not turn stale/version conflicts into hidden authoritative retries.
- Client cache must not retain one Player's private data across session identity loss/change.
- Route placeholders must not imply downstream management/combat functionality already exists.
- Eager Pixi imports would violate the Card/Low-Spec startup boundary.

## Expected files

- `apps/web/src/**`
- `tasks/active/TASK-027-react-app-shell-navigation.md`
- `docs/project/PROJECT_ROADMAP.md`
- generated `docs/project/PROJECT_ROADMAP.html`

## REVIEW evidence

- `@pokenexus/web` lint: PASS.
- `@pokenexus/web` typecheck: PASS.
- `@pokenexus/web` tests: PASS, 6 files / 19 tests, including distinct `202 in_progress` and `202 waiting_boundary`, canonical 401 cache clearing, scheduled-heal `410` reconciliation, route document titles, encoded-slash selector rejection and small-screen CSS invariants.
- `@pokenexus/web` production build: PASS.
- built/source frontend contains no Pixi import/reference in the TASK-027 shell path.
- `corepack pnpm roadmap:generate`: PASS.
- `corepack pnpm roadmap:check`: PASS.
- `git diff --check`: PASS.
- No commit, push, merge or deploy performed.

## QA evidence

- Independent QA re-review: READY.
- P0/P1: `0/0`.
- No material residual P2/P3 findings.
- Browser validation at 390x844 found horizontal overflow/clipping in authenticated shell; TASK-027 reopened to FIX before Human acceptance.
- Responsive FIX completed: small-screen topbar no longer exposes nonessential session-status width pressure, shell/content are constrained against horizontal overflow, and the four-item bottom navigation uses four shrinkable equal columns with 44px targets. QA re-gate required before returning to ACCEPTANCE.
- Final responsive QA re-gate: READY, P0/P1 `0/0`, no material residual P2/P3.
- Browser/CDP evidence: CSS viewport width `390`, document/body `scrollWidth=390`; all four bottom-navigation items measured `93.5px` wide and remained within bounds; Settings remained reachable.
- Human Owner live UI validation: APPROVED 2026-09-27.
- Human Owner repository/history completion: AUTHORIZED 2026-09-27; push/deploy remain separately gated.
