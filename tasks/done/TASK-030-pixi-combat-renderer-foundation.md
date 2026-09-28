# TASK-030 — Pixi Combat Renderer Foundation

## Metadata

- State: DONE
- Class: B
- Owner: Frontend Developer
- Owner execution surface: ChatGPT prime
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent review
- Auditor: N/A
- Auditor execution surface: N/A
- Consultants: N/A
- Consultant execution surface(s): N/A
- Specs:
  - `docs/specs/SPEC-016-ui-ux-architecture-navigation-design-system.md`
  - `docs/specs/SPEC-015-authoritative-hunt-api-contract.md`
- ADR: `docs/decisions/ADR-004-universal-combat-engine-architecture.md`
- Contract dependency: `TASK-028 — Combat Presentation Event Contract`
- Branch: `feat/TASK-030-pixi-combat-renderer`
- Worktree: `.worktrees/TASK-030-pixi-combat-renderer`

## Objective

Implement the renderer-only Pixi Combat foundation that consumes the accepted TASK-028 Combat Presentation contract,
owns scene/entity/animation lifecycle only, and preserves the accessible Card/DOM presentation as the required fallback
and critical-state surface.

## Scope

- consume `@pokenexus/game-protocol` bootstrap/continuation envelopes without recomputing combat outcomes;
- maintain renderer-local entity views for active/reserve, `conscious | ko`, effects and presentation-safe owned HP;
- adapt every TASK-028 presentation event into bounded visual cues without adding gameplay semantics;
- implement a Pixi scene/runtime with explicit mount/unmount ownership and StrictMode-safe asynchronous teardown;
- clean up ticker callbacks, RAF work, listeners, ResizeObserver, Pixi scene graph, generated textures and canvas ownership;
- keep canvas non-interactive for gameplay commands and expose no critical action/status solely through Pixi;
- provide a persistent DOM/Card fallback slot adjacent to the visual surface;
- honor reduced-motion by collapsing non-essential animation durations;
- establish a bounded frame/performance baseline: no unbounded per-frame allocations, no duplicate ticker registration,
  animation work only while cues are active, and a capped visual queue;
- add integration/behavior tests against the accepted TASK-028 fixture and engine-produced KO/replacement/effect segments.

## Out of scope

- Hunt HTTP/state integration, command submission or widening TASK-038 authority;
- combat math, targeting, legality, RNG, KO/victory calculation or any second gameplay authority;
- inventing or editing canonical CombatEvent transcripts by hand for exported fixtures;
- final sprite/asset pipeline, asset URLs or production art ownership from TASK-032;
- Card renderer implementation owned by TASK-029;
- accessibility qualification owned by TASK-031;
- Solo Hunt Visual integration owned by TASK-040;
- persistence, API, database, realtime topology, commit, merge, push or deploy.

## Acceptance criteria

- [x] Pixi consumes the same TASK-028 presentation envelopes as Card with no renderer-specific gameplay contract.
- [x] Bootstrap creates entity views using authoritative initial roster/active membership; continuations never fabricate
      initial activation or fresh participant snapshots.
- [x] KO, forced replacement and effect events update only presentation state according to authoritative events.
- [x] Wild HP remains non-numeric; hidden HP event payloads never become numeric renderer data.
- [x] Canvas owns no gameplay command and is never the sole carrier of critical battle status/actions; DOM/Card fallback
      remains mounted/reachable.
- [x] Reduced-motion disables non-essential animation motion.
- [x] Mount/unmount is idempotent and safe under React StrictMode-style setup/cleanup/setup, including async init races.
- [x] Cleanup releases ticker/RAF/listeners/ResizeObserver/scene/display objects/generated textures/canvas ownership.
- [x] Renderer work is bounded by a documented/tested frame baseline and capped animation queue.
- [x] Integration tests use accepted TASK-028 fixture plus engine-produced valid KO/replacement/effect segments.
- [x] Relevant web/protocol regression, lint/typecheck/build, roadmap check and diff-check pass.

Owner validation evidence:

- web tests: PASS, 7 files / 32 tests including 13 Pixi foundation tests;
- web typecheck: PASS;
- web lint: PASS;
- web production build: PASS; shell bundle remains unchanged because TASK-030 is not route-integrated before TASK-040;
- game-protocol regression after existing game-core build prerequisite: PASS, 2 files / 16 source tests;
- game-core full package regression after build: PASS, 26 files / 460 tests;
- PixiJS is value-loaded only by dynamic `import("pixi.js")` inside the runtime factory; no App/shell eager import exists;
- lifecycle test proves late async initialization is destroyed after disposal, ready runtime destruction is idempotent,
  and a subsequent setup/cleanup cycle remains independent;
- runtime post-init setup is transactional: any failure after `app.init()` destroys the initialized Pixi application
  before rethrowing; direct fake-Pixi regressions inject both root-Container construction and host-append failures and
  verify exactly-once rollback;
- direct runtime cleanup regression verifies owned ResizeObserver/RAF/ticker/application resources are released exactly
  once, including pending resize RAF cancellation;
- runtime uses a dedicated non-shared ticker, `autoStart:false`, `maxFPS=60`, stops while cue work is idle,
  owns/disconnects ResizeObserver and RAF, removes ticker callback, clears queue, and destroys the Pixi application
  with view/children/texture/texture-source/context cleanup;
- visual cue queue is capped at 64; reduced-motion synchronously drops queued non-essential animation work and stops
  the ticker rather than draining zero-duration cues frame-by-frame;
- accepted TASK-028 fixture plus engine-produced effect/hidden wild-source KO/forced-replacement segments are projected
  before renderer-model tests; hidden HP produces no numeric visual cue and invalidates stale owned exact HP;
- a later explicitly exact owned HP consequence can resynchronize current HP using only the owned maxHP already
  disclosed by bootstrap, without reconstructing the hidden delta;
- exact `resultingHp: 0` never derives KO; semantic KO changes only after authoritative `CombatantKO`, including
  across split continuation batches;
- initial Pixi entity state/layout order follows authoritative `initialSides[].combatantIds`, not incidental
  `initialParticipants` array order;
- canvas is `aria-hidden`, noninteractive and pointer-disabled; React-owned fallback content remains mounted;
- no App route/Hunt command integration, Card implementation, asset pipeline or gameplay semantics were added.

Independent gates:

- QA corrective re-gate: **READY**, P0/P1/P2/P3 = **0/0/0/0**.
  - verified post-`app.init()` transactional rollback, including root scene construction;
  - direct runtime tests cover ResizeObserver, pending RAF, ticker removal, idempotent application destruction,
    reduced-motion queue collapse and canvas/runtime ownership;
  - authority/privacy, authoritative roster order, KO/event semantics, lazy Pixi loading and DOM fallback re-verified.
- Independent Class-B functional/architectural acceptance: **ACCEPT**, P0/P1 = **0/0**, no material P2/P3.
  - prior lifecycle rollback blocker and reduced-motion inefficiency are closed;
  - TASK-040 can integrate this foundation without introducing Hunt/gameplay authority or a second presentation contract.

## Validation / tests

```text
corepack pnpm --filter @pokenexus/web test
corepack pnpm --filter @pokenexus/web lint
corepack pnpm --filter @pokenexus/web typecheck
corepack pnpm --filter @pokenexus/web build
corepack pnpm --filter @pokenexus/game-protocol test
corepack pnpm --filter @pokenexus/game-core test
corepack pnpm roadmap:generate
corepack pnpm roadmap:check
git diff --check
```

## Dependencies

- TASK-028 — DONE; accepted renderer-neutral Combat Presentation contract and engine-produced fixture baseline.
- TASK-026 — DONE; SPEC-016 visual/Card split, responsive and accessibility minimums.
- TASK-027 — DONE; React shell and local renderer preference foundation.

## Risks / irreversible actions

- Pixi lifecycle leaks can accumulate tickers/canvases/listeners under StrictMode or route remounts.
- Renderer-local inference from hidden HP/events could recreate a prohibited Genetics oracle.
- Visual-only status/commands would violate the Card/DOM fallback requirement.
- No irreversible action is authorized.

## Expected files / boundaries

- `apps/web/src/combat-pixi/**`
- `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts` and `pnpm-lock.yaml` for the required
  internal `@pokenexus/game-protocol` runtime/type edge plus test-only `@pokenexus/game-core` fixture generation
- `tasks/active/TASK-030-pixi-combat-renderer-foundation.md`
- `docs/project/PROJECT_ROADMAP.md`
- generated `docs/project/PROJECT_ROADMAP.html`

No `game-core`, `game-protocol`, API, database or realtime production semantics should change.

## Completion

Owner validation moves this task to REVIEW. QA and delegated Class-B acceptance are independent gates. Human
visual/live validation was approved for the isolated Pixi preview on 2026-09-28; KO/replacement remain automated-only in this preview and Hunt-integrated visual validation stays with TASK-040. Use `docs/agents/handoff-protocol.md` and do not create an
ad-hoc implementation summary file.

Isolated visual preview was accepted by the Human Owner on 2026-09-28. On integrated main it is exposed at apps/web/pixi-preview.html, separate from apps/web/combat-preview.html (Card). KO/replacement remain engine-projected automated coverage rather than part of the isolated preview. The full Hunt visual gate belongs to TASK-040. Push and deploy remain separate gates.
