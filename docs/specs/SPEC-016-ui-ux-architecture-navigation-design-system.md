# SPEC-016 — UI/UX Architecture, Navigation & Design-System

- Status: APPROVED
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Related task: `TASK-026`
- Related ADRs: ADR-001, ADR-002, ADR-004, ADR-005, ADR-006
- Related specs: SPEC-001, SPEC-003, SPEC-005, SPEC-010, SPEC-011, SPEC-013, SPEC-015

## 1. Purpose

PokeNexus now has authoritative domain, player-state, combat and Solo Hunt contracts, but `apps/web` is still
only a minimal React/Vite/Pixi wiring shell. Before the shell, renderers and asset pipeline are implemented,
the client needs one accepted product architecture that says what the major surfaces are, how players move
between them, which presentation technology owns which visual responsibility, and which state remains purely
presentational.

This specification defines that client contract. It does not change gameplay, persistence or HTTP authority.

## 2. Goals

- give TASK-027 a stable React shell/navigation contract;
- give TASK-029 and TASK-030 one renderer-neutral combat presentation boundary;
- give TASK-031 explicit accessibility/responsive acceptance targets;
- give TASK-032 stable asset-consumption roles without choosing the final asset distribution strategy;
- let TASK-039/040 present the same Solo Hunt state through Card and Visual modes without semantic drift;
- keep persistent/gameplay authority on the server and deterministic domain packages;
- make the first playable loop understandable on mobile and desktop without requiring Pixi.

## 3. Non-goals

- final production art direction, illustration style or licensed asset selection;
- implementation code or framework-specific component libraries;
- changing Player/Hunt APIs or inventing client-authoritative derived state;
- social HUB, Duo, PvP, Gym, World Boss or economy UX beyond reserving extensible navigation structure;
- exact copywriting/localization catalog;
- final telemetry/product analytics design.

## 4. Product information architecture

### 4.1 Primary destinations

The authenticated application baseline has four product destinations:

1. **Hunt** — World/Zone selection, Hunt entry, active Hunt and results.
2. **Pokémon** — owned Collection and individual Pokémon detail/configuration.
3. **Teams** — saved Team management and ordered roster configuration.
4. **Inventory** — owned item quantities and item information relevant to currently accepted systems.

Player progression is a persistent global summary surfaced from the shell/profile affordance rather than a
separate primary destination in v1. **Settings** is a shell utility destination that combines device-local
presentation/accessibility preferences with explicitly accepted authoritative configuration surfaces such as the
SPEC-015 Hunt auto-capture policy. Local and server-backed settings must be visually and behaviorally distinct.
Future HUB/social/economy destinations may be added without changing the meaning of the four baseline destinations.

### 4.2 Route model

Conceptual routes are stable product identities, not a requirement for a particular router library:

```text
/hunt
/hunt/active
/hunt/result
/pokemon
/pokemon/:pokemonInstanceId
/teams
/teams/:teamId
/inventory
/settings
/settings/hunt
```

World/Zone selection remains inside `/hunt`; UI grouping labels never become authoritative Map/Region IDs.
An active Hunt owns a dedicated route/view so refresh/reconnect can reconstruct presentation from authoritative
state rather than from a transient modal or local wizard step.

Route parameters are selectors only. They never create ownership authority, and an inaccessible/absent resource
uses the server's self-scoped not-found semantics.

### 4.3 Shell regions

The React shell owns:

- persistent primary navigation;
- page title/context and global progress summary;
- route-level loading/error/reconnect boundaries;
- global notices that affect navigation or current command completion;
- mode preference entry point for renderer-capable surfaces;
- focus restoration and route-transition semantics.

Renderer preference is device-local presentation state by default. It is not persisted as authoritative Player
state unless a later accepted contract explicitly adds that capability.

`/settings/hunt` is server-backed. It presents the persisted SPEC-015 auto-capture policy and related explanatory
state; it is not interchangeable with local presentation preferences.

The shell does not own combat math, Hunt advancement, reward calculation, capture odds or authoritative timers.

## 5. Surface responsibilities

### 5.1 Pokémon collection

Collection is a bounded, paginated list/grid of owned Pokémon. Each item exposes only presentation-safe summary
information available from accepted public state plus locally resolved static display metadata.

Required UX behavior:

- pagination/infinite-loading mechanics must preserve a reachable explicit loading affordance and retry path;
- transport order is not presented as gameplay priority;
- filters/sorts are presentation concerns unless a future API explicitly makes them server-authoritative;
- empty Collection has a true empty state, not an error state;
- selecting a Pokémon navigates to its stable instance route.

### 5.2 Pokémon detail and configuration

Pokémon detail may combine authoritative aggregate/progression data with immutable static display data. It must
visibly distinguish durable configuration from read-only derived/display information.

Move Loadout editing is a deliberate configuration flow against the accepted complete-replacement command:

- order is explicit and visible;
- eligible choices come from authoritative eligibility data, not client inference;
- a stale OCC response requires reload/reconciliation and explicit re-submit; the client must not silently retry
  with a fresh row version;
- unsupported/ineligible moves remain unavailable with an intelligible reason where the contract permits one;
- the UI never implies that dragging/reordering locally has become durable until the mutation succeeds.

TASK-026 does not implement this editor. Production Move-loadout editing is owned by roadmap TASK-100; TASK-027
remains shell/navigation infrastructure and must not absorb that feature implicitly.

### 5.3 Teams

Teams are saved ordered rosters. The Team surface owns:

- list/create/open/delete of saved Teams;
- ordered roster editing under accepted Team constraints;
- clear distinction between a saved Team and the pinned snapshot of a running Hunt;
- stale/version-conflict reconciliation without hidden mutation retry.

Editing a saved Team while a Hunt is active never implies the active Hunt snapshot changed.

### 5.4 Inventory

Inventory is an owned-quantity browsing surface. It must not expose client-side consume/grant controls that are
not backed by an accepted command contract. Pagination staleness restarts from the first page as specified by
the API; the UI should explain that the inventory changed rather than treating this as a generic fatal error.

### 5.5 Hunt entry and lifecycle

The Hunt destination presents the accepted product hierarchy:

```text
World/Map presentation grouping -> Zone -> Hunt definition -> saved Team -> start
```

Only Zone/Hunt identities and accepted server state are authoritative. Visual map arrangement is presentation.

The active Hunt surface must support:

- authoritative current Hunt state after reload/reconnect;
- bounded command progress (`202 in_progress`) without fabricating later logical progress;
- event/history playback using the accepted presentation contract from TASK-028;
- manual capture decision when present;
- explicit healing actions only when the accepted API makes them valid;
- retreat with exact public-result semantics;
- terminal no-living/result state and route back to Hunt selection;
- reward/result presentation without recomputing reward authority client-side.

### 5.6 Hunt automation/settings

TASK-039 owns the server-backed Hunt settings UI required by SPEC-015. It must:

- expose ordered auto-capture rules without silently reordering them;
- explain `minimumReserve` as the post-debit quantity that auto-use must leave behind;
- preview/lint rule shadowing and early catch-all placement while preserving exact saved order;
- make reserve-blocked, uncovered and VIP-not-authorized conditions understandable before enable/save;
- when enabling/replacing an enabled policy, present the exact accepted SPEC-015 loss warning before submission and
  send only the acknowledgement required by that protocol; the UI must not reduce the warning to a hidden/defaulted
  form field;
- explain the Player-wide one-manual-pending capacity and when an unresolved manual decision blocks later auto-OFF
  manual opportunities;
- explain that policy changes are forward-only from their authoritative effective boundary;
- preserve same-key `202 in_progress` continuation semantics and never imply the final save/capture/retreat
  consequence has completed before the authoritative command does;
- represent `202 waiting_boundary` healing as an already-accepted scheduled heal while the local client retains that
  command correlation, never as a failed request or as authority to issue a replacement command;
- after reload or transport-key expiry, never infer a scheduled-heal queue from Hunt state because v1 exposes no
  durable public queue/readback field;
- handle `410 idempotency_gone` without erasing or second-guessing already-authoritative scheduled-heal domain state;
- refresh current authoritative Hunt state after terminal command responses when the latest view is needed instead of
  treating an old replayed command-result snapshot as the latest Hunt state.

These requirements are presentation of accepted SPEC-015 semantics only; TASK-026 introduces no new Hunt protocol.

## 6. Client state ownership

Every client datum belongs to one of three categories.

### 6.1 Authoritative remote state

Examples: owned Pokémon, Team rows/versions, Inventory quantities, Player progression, current Hunt, pending manual
capture, command results and persisted policy. This state is fetched/revalidated from accepted self-scoped APIs.

The client may cache it but cannot promote a local optimistic value to truth after the server rejects or conflicts.

### 6.2 Immutable display/reference data

Examples: names, sprites/assets, type labels and other locally shipped/published presentation metadata. These must
be bound to the relevant published content identity when historical interpretation matters; the UI must not silently
display current metadata as if it were authoritative historical gameplay evidence.

### 6.3 Ephemeral interaction state

Examples: open panel, selected tab, local filter text, draft Team edits, pending drag order, animation cursor and
renderer preference. This state may be local and disposable. It cannot produce rewards, resolve combat/capture or
change durable ownership without a server command.

## 7. Data-fetching and mutation UX contract

TASK-027 may choose a client data library or a small internal abstraction; TASK-026 does not mandate one. Whatever
implementation is chosen must preserve these behaviors:

- route-level reads are cancellable/ignorable after navigation and cannot overwrite a newer resource selection;
- mutation buttons are guarded against accidental duplicate local submission, while server idempotency remains the
  correctness boundary;
- `409 stale` means reload/reconcile and intentional new submit, never automatic OCC-token substitution;
- `409 pagination_stale` restarts the relevant listing from page one;
- `409 correlation_conflict` or equivalent integrity conflict is shown as an explicit action failure, not retried as
  though it were a transient network error;
- durable Hunt `409 command_superseded` means that exact frozen command can no longer advance state; the client must
  present the superseded result and require a genuinely new player intent/new command identity to continue from the
  newer authoritative state;
- `202 in_progress` keeps the exact command identity and polls/continues only as permitted by the authoritative
  protocol; UI progress is descriptive, not a synthetic percentage unless the server exposes one;
- `401` routes to session recovery/sign-in behavior without leaking the previous player's private state;
- `403` is a security/session action failure, not a permission-upgrade prompt;
- `404` on self-scoped resources is presented as unavailable/not found without ownership disclosure;
- `503 authority_unavailable` is retryable only as a deliberate retry of the same allowed intent when the protocol
  supports exact replay.
- Player-State Team-create `410 idempotency_gone` is terminal for that exact key and must not recreate the deleted
  Team; a genuinely new create intent requires a new key;
- Player-State `429 team_create_rate_limited` presents the server-provided bounded `Retry-After` and does not spin or
  synthesize an earlier retry window.

On application bootstrap, authenticated private data is not rendered until session identity is established. A `401`
or explicit sign-out clears private query/cache state before any subsequent authenticated identity can populate the
same browser session.

The client query/mutation layer must encode these distinctions centrally rather than leaving each page to improvise
retry policy. Generic automatic mutation retries are prohibited for OCC, idempotent Hunt commands and other
state-changing actions unless the owning protocol explicitly permits the exact replay behavior.

## 8. Card mode and Visual/Pixi mode

### 8.1 One product, two presentations

Card/Low-Spec and Visual/Pixi are presentation adapters over the same accepted Hunt/combat presentation model.
They are not independent gameplay implementations.

Both modes must expose equivalent player-relevant information and commands. A mode may differ in spatial layout,
animation richness and event visualization but must not omit an action required to complete the same accepted flow.

### 8.2 React responsibility

React owns:

- application shell/navigation;
- forms, menus, dialogs, list/detail UI and accessible command controls;
- Card/Low-Spec presentation;
- accessible text/event representation that remains available when Visual mode is active;
- modal/focus lifecycle and error/status messaging.

### 8.3 Pixi responsibility

Pixi owns only realtime 2D scene presentation that materially benefits from a retained canvas scene:

- combat/world visual scene graph;
- sprite/entity view lifecycle;
- presentation animation derived from accepted events;
- camera/scene transitions and purely visual effects.

Pixi must not be the only representation of critical textual status or the only way to invoke required commands.
DOM controls remain authoritative for accessible interaction unless a later task proves an equivalent accessible path.

Pixi is lazy-loaded only for Visual-mode surfaces. Card/Low-Spec startup must not require downloading, initializing or
retaining a Pixi Application. TASK-030 must make initialization/disposal safe under React 19 development StrictMode,
including ticker/RAF, event-listener, ResizeObserver, texture/scene and canvas cleanup.

### 8.4 Fallback and mode switching

- Card mode is always available and is the functional fallback when WebGL/Pixi initialization fails or the user
  chooses reduced-cost presentation.
- Switching modes does not restart, advance or mutate Hunt state.
- Visual-mode failure during an active Hunt falls back to Card presentation using the same authoritative state.
- Reduced-motion may retain Visual mode with motion suppressed; it must never force loss of information.
- The Visual canvas fits within a React-owned bounded region using deterministic contain/letterbox behavior when its
  preferred aspect ratio cannot fill the viewport; normal page layout must not depend on canvas intrinsic size.

## 9. Design-system contract

The design system is token-first. Downstream components consume semantic roles rather than hard-coded page-specific
values.

### 9.1 Token groups

Required groups:

- **color:** canvas, surface, elevated-surface, text-primary, text-muted, interactive, interactive-hover,
  selected, focus, success, warning, danger, info, disabled, divider;
- **type:** display, heading, body, label, mono-numeric plus size/line-height/weight scale;
- **space:** 4px-based scale with named semantic gaps;
- **size:** minimum control/touch target, compact/regular control heights, content max widths;
- **radius:** none/small/medium/large plus fully rounded only when semantically appropriate;
- **elevation:** flat/raised/overlay;
- **motion:** instant/fast/standard/slow and easing roles, all reducible under reduced-motion;
- **focus:** visible focus-ring width/offset role independent from selection;
- **renderer state:** ally/enemy, active, KO, status, pending command, success/failure outcome roles.

Semantic tokens are canonical; concrete theme values may evolve after Human visual approval without changing component
semantics.

### 9.2 Initial visual direction for Human validation

The baseline proposal is a **dark-first, high-contrast game dashboard** rather than a retro/pixel-art application
chrome. Pixel art/sprites may appear as game content, while navigation, forms and data-heavy management surfaces use
clean modern typography and restrained surfaces so dense Pokémon/Team/Inventory information remains readable.

This direction is intentionally independent from final sprite/asset style. Concrete brand colors and typeface choices
remain part of the Human visual gate before downstream implementation treats them as stable.

### 9.3 Interaction semantics

Selection, keyboard focus, warning/error and rarity/content decoration are separate channels. Components must not reuse
one visual token to mean multiple states when those states can coexist.

Color alone cannot communicate selected, disabled, KO, success/failure, item rarity or command status.

## 10. Responsive architecture

### 10.1 Target classes

Normative layout targets:

- **small:** 320–639 CSS px;
- **medium:** 640–1023 CSS px;
- **large:** 1024 CSS px and above.

These are layout-contract bands, not device detection. Components may use narrower container queries where useful.

### 10.2 Small layout

- single main content column;
- persistent primary destinations available through a compact bottom or equally reachable navigation pattern;
- secondary/detail panels become route transitions or sheets, not compressed desktop sidebars;
- minimum interactive target: 44×44 CSS px except dense non-primary text controls with an equivalent accessible target;
- no hover-only affordances.
- shell/navigation spacing respects platform safe-area insets when present.

### 10.3 Medium/large layout

- navigation may become a side rail/header while preserving destination order and labels;
- list/detail split views are allowed when both regions remain independently scrollable and focus order is coherent;
- combat Visual mode may allocate more viewport to Pixi, but accessible DOM status/commands remain reachable without
  requiring canvas interaction.

### 10.4 Zoom and text

At 200% browser zoom or equivalent enlarged text, critical flows must remain operable without two-dimensional page
scroll for ordinary shell/form content. Canvas visuals may crop/scale within their region, but commands/status must
reflow in DOM.

## 11. Accessibility baseline

Downstream UI tasks target WCAG 2.2 AA for the DOM/application surface and must meet these minimum behaviors:

- all commands reachable by keyboard without requiring drag; drag/reorder flows provide button/keyboard alternatives;
- visible focus never relies on color alone and is not clipped by overflow containers;
- route change moves focus predictably to the new primary heading or preserves focus when only an in-place state
  mutation occurred;
- dialogs/sheets trap focus only while modal, restore focus to the invoker on close and support Escape where safe;
- active navigation and selected tabs expose semantic state (`aria-current`, selected/tab semantics as applicable);
- loading uses appropriate status semantics without repeatedly stealing screen-reader focus;
- command success/failure is announced through a bounded live region while persistent errors remain discoverable near
  the affected control;
- event feeds support a non-animated, readable ordered representation and do not flood live regions with historical
  playback;
- reduced-motion disables non-essential movement, parallax, shake, large transitions and repeated looping effects;
- information conveyed by sprites, type colors, rarity colors, HP colors or KO overlays has a textual/iconographic
  equivalent;
- canvas is never the sole carrier of an actionable control or critical battle/Hunt state.

TASK-031 owns full accessibility/responsive qualification and remediation; these rules are its minimum contract.

## 12. Standard UI states

Every data-bearing surface must define these states where applicable:

| State | Required behavior |
|---|---|
| Initial loading | stable skeleton/progress treatment; do not show false empty state |
| Empty | explain absence and next valid action, if any |
| Refreshing | retain safe prior data with subtle refresh status unless authority requires clearing it |
| Recoverable error | contextual retry that preserves route/intent where safe |
| Auth/session loss | clear private client state before showing another authenticated player's data |
| Stale/OCC conflict | reload authoritative state, show conflict, require intentional re-submit |
| Command in progress | disable duplicate local intent; preserve exact command continuation semantics |
| Offline/disconnected | clearly distinguish cached/read-only display from actions requiring authority |
| Terminal/result | freeze presentation of the concluded operation and expose the next navigation action |

## 13. Downstream task boundaries

### TASK-027 — React App Shell & Navigation

Implements the route/shell contract, route-level state boundaries, responsive navigation, common loading/error/empty
patterns and baseline design tokens. It must not implement combat presentation or invent new domain commands.

### TASK-028 — Combat Event Presentation Contract

Defines the renderer-neutral read model/events consumed by both Card and Pixi. TASK-026 deliberately does not encode
combat event payloads. TASK-028 must explicitly preserve SPEC-015 hidden-information rules: public wild Encounter
presentation cannot expose exact wild `hp`, `maxHP`, HP percentage or other derived values that encode/infer hidden
IV/Genetics state. Any approved HP visualization must first define a presentation-safe boundary and hidden-information
analysis rather than widening TASK-038 state ad hoc.

### TASK-029 — Card / Low-Spec Combat Renderer Foundation

Implements accessible DOM/Card combat presentation against TASK-028 fixtures. Any HP/status visualization is limited
to the exact presentation-safe information TASK-028 defines; renderer code must not derive hidden wild HP from other
state.

### TASK-030 — Pixi Combat Renderer Foundation

Implements Pixi scene/entity/animation lifecycle against the same TASK-028 fixtures and must preserve Card fallback.
It inherits the same hidden-information boundary as Card mode and receives no renderer-only wild HP authority.

### TASK-031 — Accessibility & Responsive Baseline

Qualifies and hardens the shell/Card implementation against section 10–11 requirements.

### TASK-032 — Asset Manifest & Delivery Pipeline

Defines asset identity/provenance/cache/delivery and missing-asset behavior. It must expose assets to both renderers
without making asset URLs or filenames gameplay identity.

### TASK-039 / TASK-040 — Solo Hunt integrations

Compose the canonical TASK-038 Hunt state/commands with TASK-029/TASK-030 presentation respectively. Neither task may
fork Hunt authority or define mode-specific gameplay results. TASK-039 additionally owns the DOM/settings presentation
for the persisted auto-capture policy, one-manual-pending capacity, forward-only policy boundaries, same-key 202
continuation and waiting-boundary healing semantics required by SPEC-015. TASK-040 may visualize equivalent state but
must not create a second settings/command authority path.

## 14. Move-loadout implementation ownership

The roadmap requires TASK-026 to ensure Move-loadout editing has explicit downstream ownership before editor code is
written. `TASK-099` is already occupied by the Human-approved parallel Sprite Generation Lab, so the next canonical
task ID is `TASK-100`.

`TASK-100 — Collection, Pokémon & Team Management UI` owns the authenticated management surfaces after TASK-027 has
provided the application shell: Collection/Pokémon detail, saved-Team management and ordered Move-loadout editing
against the accepted Player State API, including OCC/error/reconciliation behavior and behavior/E2E coverage.

TASK-027 remains shell/navigation infrastructure and must not silently absorb those product features.

## 15. Human validation points

Human Owner approval was granted on 2026-09-27 for the following product decisions:

1. four-destination primary IA: Hunt / Pokémon / Teams / Inventory;
2. dedicated `/hunt/active` route rather than modal-only active Hunt;
3. Card mode as universal functional fallback and accessible DOM baseline;
4. dark-first modern application chrome with game art/sprites treated as content rather than retro chrome;
5. responsive navigation approach: compact bottom-equivalent on small layouts, rail/header on larger layouts;
6. separate TASK-100 ownership for Collection/Pokémon/Team management and ordered Move-loadout editing.

## 16. Acceptance invariants

- Presentation never becomes gameplay/reward/persistence authority.
- Card and Visual modes have one semantic source and equivalent required actions.
- A running Hunt remains reconstructible after route reload from authoritative state.
- Stale/OCC conflicts are never silently auto-retried with substituted versions.
- Canvas is never the sole accessible representation of critical status or commands.
- Saved Team edits never imply mutation of a running Hunt snapshot.
- Route labels/grouping never create new canonical World/Map/Zone identities.
- UI identity uses canonical IDs internally; display names and list positions remain presentation.
