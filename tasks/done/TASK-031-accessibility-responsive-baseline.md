# TASK-031 — Accessibility & Responsive Baseline

## Metadata

- State: DONE
- Class: B
- Owner: Frontend Developer
- Owner execution surface: ChatGPT prime
- Reviewer: independent QA Reviewer — TECH READY / PASS WITH P2/P3 (P0=0, P1=0)
- Delegated Class-B functional acceptance: ACCEPT (P0=0, P1=0)
- Human usability and local integration gate: APPROVED 2026-09-28
- Auditor: N/A
- Specs: `docs/specs/SPEC-016-ui-ux-architecture-navigation-design-system.md`
- Contract dependency: `TASK-028 — Combat Presentation Event Contract`
- Branch: `feat/TASK-031-accessibility-responsive-baseline`
- Worktree: `.worktrees/TASK-031-accessibility-responsive-baseline`

## Objective

Qualify and remediate keyboard, focus, semantic, responsive and reduced-motion behavior in the accepted
React shell and Card/Pixi preview surfaces, with explicit evidence for the supported 320–639, 640–1023
and 1024+ CSS-pixel layouts.

## Scope

- Ensure usable skip navigation, route-focus and semantic status reporting on keyboard-only navigation.
- Audit structural headings/landmarks and programmatic labels in the shell and Card/Visual renderer surfaces.
- Correct focus visibility, control sizing and overflow at supported responsive breakpoints and 200% zoom.
- Preserve accessible Card/DOM information when Pixi is selected, and avoid live-region history floods.
- Honor reduced-motion without losing content, controls or status semantics.
- Add focused automated behavior/regression checks and a representative browser/visual inspection where available.

## Out of scope

- Solo Hunt transport, gameplay commands and active-Hunt route integration (TASK-039/040).
- Pokémon, collection, Team and Move-loadout management (TASK-100).
- Final sprite/art pipeline (TASK-032), new dependencies or changes to TASK-028 public semantics.
- Server, game-core, persistence, combat rules, commit, merge, push or deploy.

## Acceptance criteria

- [x] Main/skip navigation and route heading are keyboard-reachable without clipped focus.
- [x] Shell, controls and combat previews expose stable, unique relationships and appropriate live semantics.
- [x] 320px, 390px, 640px and 1024px width targets preserve navigation, focus, and readable content.
- [x] 200% zoom/enlarged text does not require horizontal scrolling for ordinary controls.
- [x] Reduced-motion preserves all information with non-essential motion disabled.
- [x] Card/Visual preview critical information is still accessible through DOM.
- [x] Focused checks, web tests, typecheck, lint, build and roadmap check pass.
- [x] Independent QA has no unresolved P0/P1.
- [x] Human Owner usability checkpoint is documented.

## Owner validation evidence

- `@pokenexus/web`: 8 test files / 45 tests PASS, including instance-unique Card section labels, renderer
  fallback composition, 320px Pixi label wrapping and a real redraw after resize while idle.
- Web typecheck, lint, production build, roadmap generation/check and `git diff --check`: PASS.
- Chrome 153 headless, DevTools protocol: Card/Pixi preview at actual 320, 390, 640 and 1024 CSS-pixel
  layout viewports has no document-level horizontal overflow or out-of-bounds layout elements. Main preview
  buttons measure 45px high; Pixi canvas initializes successfully and Card fallback stays mounted at every
  tested width. At 320/390 the full visual labels wrap inside separate columns below the markers.
- Authenticated shell tested with a local stub response for `GET /auth/session`: on 320/390/640/1024 CSS px,
  the four primary targets are at least 44px high, only Settings is current on `/settings/hunt`, real
  keyboard Tab exposes the skip link and Enter focuses `#main-content`; changing to Hunt focuses its `#page-title`.
  At a 640px viewport, a 200% CSS zoom produces no horizontal overflow. These observations do not assert
  production authentication or real-player Hunt behavior.
- Reduced-motion: CSS removes non-essential animation; the Pixi preview initially reads the OS setting
  and listens for changes, and the Pixi runtime empties/stops queued visual motion on reduced-motion input.

## Review and residual limitations

- Independent QA independently reran 45 web tests and the relevant checks, with no P0/P1. An independent
  Class-B functional/architectural review returned ACCEPT, also with no P0/P1. The Human Owner
  confirmed completion of the Card/Pixi visual and usability checklist and approved local integration
  on 2026-09-28.
- Dense battle rosters with unusually long opaque Species IDs may create more wrapped text rows than fit
  inside the fixed-height visual canvas; the complete identifiers remain accessible in the Card DOM.

## Dependencies

- TASK-026, TASK-027, TASK-028, TASK-029 and TASK-030 — DONE.

## Risks

- CSS clipping can hide a keyboard focus ring even when tab order appears correct.
- Repeated component instances can silently duplicate DOM IDs and degrade heading relationships.
- Small-viewport screenshots are insufficient to establish keyboard or assistive-technology usability.

## Expected files / boundaries

- `apps/web/src/App.tsx`, `apps/web/src/app.css`, `apps/web/src/common-states.tsx`
- `apps/web/src/combat-card.tsx`, `apps/web/src/combat-card.css`, Pixi fallback surface when necessary
- focused behavioral/responsive tests, this task and canonical roadmap Markdown/generated HTML.

## Human gate

The Human Owner completed the local Card/Pixi preview checklist, including keyboard navigation, zoom,
reduced motion, narrow layouts and canvas lifecycle, and authorized local integration on 2026-09-28.
Hunt-integrated visual validation remains with TASK-039/040. Push and deploy remain separately gated.
