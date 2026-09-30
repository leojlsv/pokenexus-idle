# TASK-100 — Collection, Pokémon & Team Management UI

## Metadata

- State: ACTIVE
- Execution gate: Class-B prerequisites READY; Move-choice selection gated by an authoritative public read
- Class: B
- Owner: Frontend Developer (ChatGPT prime)
- Owner execution surface: ChatGPT prime (explicit non-default Frontend Developer assignment)
- Reviewer: QA Reviewer (independent final full-task review pending)
- Reviewer execution surface: independent ChatGPT delegated reviewers (explicit non-default; exact reviewer/session and reviewed-snapshot identities require reconciliation before final acceptance)
- Auditor: N/A — this FE scope does not implement a new security model, public contract or database strategy; reassess if scope changes
- Auditor execution surface: N/A
- Consultants: N/A — this implementation does not define new gameplay or economy rules
- Consultant execution surface(s): N/A
- Prior partial-review evidence: independent technical QA PARTIAL READY (P0/P1 clear); independent UX/visual QA PARTIAL READY
- Delegated Class-B acceptance: pending; Human Owner reported "funcionalidades validadas" on 2026-09-28 for presented functionality (scope unspecified, full Move editor remains gated).
- Specs: `docs/specs/SPEC-011-player-state-api-contract.md`, `docs/specs/SPEC-016-ui-ux-architecture-navigation-design-system.md`
- Dependencies: TASK-025, TASK-027 — DONE
- Branch: `feat/TASK-100-collection-pokemon-team-ui`
- Worktree: `.worktrees/TASK-100-collection-pokemon-team-ui`

## Objective

Implement self-scoped, responsive Player management: paginated Pokémon Collection, Pokémon detail and
progression, saved-Team list/create/roster/delete and an ordered Move-loadout configuration flow.
The client cannot become an authority for gameplay or Move eligibility.

## Scope

- Bounded Collection/Team pagination with explicit loading, retry and stable instance navigation.
- Pokémon detail/progression reads and selected Move-loadout display over accepted Player fields.
- Create Team with one stable UUID `Idempotency-Key` per user intent, retained for explicit same-key
  recovery on ambiguous response loss; no automatic mutation retry.
- Edit ordered 0–6 member rosters under Team `expectedRowVersion` and delete with confirmation/OCC.
- Handle stale/invalid_member/quota/rate limit/404/401/403 and response loss with deliberate reconciliation.
- Move edits require a public server-provided set of currently eligible choices. This GET is missing
  from SPEC-011; until approved, expose the persisted ordered Move IDs read-only and disclose the gate.
- Add automated behavioral tests and an isolated visual preview when necessary.

## Out of scope

- No new public API contract, server move-evaluator, static catalog authority or speculative
  Move-choice inference within this Class-B task; a public Move-choice endpoint needs Class-A approval.
- No Solo Hunt transport, capture, rewards, Inventory mutation, selected Ability mutation, Team name,
  gameplay authority, or new production dependencies.
- No commit, merge, push or deploy without a separate Human Owner authorization.

## Acceptance criteria

- [x] Collection pagination, retry, empty and route behavior implemented over existing API.
- [x] Detail/progression and ordered read-only Move presentation with authoritative server values and
      explicit shared-version reconciliation.
- [x] Teams list/create/load/ordered roster save/delete with protected CSRF and exact OCC.
- [x] Stale or response-loss paths never silently retry mutation or swap to a fresh token; Team-create UUID
      is persisted before POST and scoped to the current session without storing the CSRF token.
- [x] Move editing remains disabled until approved server-provided eligible options are available.
- [x] Source-faithful Chrome layout and basic interaction checks at 320/390/640/1024 px, with no horizontal overflow.
- [x] Tests, typecheck, lint, build, roadmap and diff-check pass on the partial implementation.
- [ ] Independent QA and Class-B acceptance have no unresolved P0/P1.
- [ ] Human Owner live/preview validation and separate history authorization.

## Partial implementation validation evidence

- Existing Player API self-scoped reads and Team mutations are wrapped in credentialed, CSRF-aware transport.
  Response-body shapes are validated before state transitions; malformed accepted Team-create bodies preserve
  the pending command identity instead of navigating to an undefined Team.
- Unit/web suite: 10 test files, 65/65 tests passing; TypeScript typecheck, lint, Vite build,
  roadmap check and `git diff --check` PASS. Focused tests cover decimal OCC versions, error policies,
  duplicate roster guards, immutable IDs, storage failures and same-key persistence after remount.
- Successful Pokémon/progression/Team reads must match the requested selector; successful roster replacement
  must echo the exact ordered submitted member set; deletion requires HTTP 204. Valid-looking but mismatched
  200 responses fail closed and retain the draft for authoritative reconciliation.
- Chrome 153 headless local fixture, true CSS viewports 320/390/640/1024: no document-level horizontal
  overflow; bottom navigation 44px tall; synthetic Collection, Pokémon details and Team roster layouts
  rendered. The fixture never reaches the real API and does not establish account or production data behavior.
- Browser flow exercised: Team create → roster add/save; stale 409 → focus on server/draft comparison →
  explicit keep-draft → fresh submit; accepted Team create with lost response → hard browser reload → same
  Idempotency-Key recovered from sessionStorage → same Team returned; accepted deletion with lost response
  → server GET 404 → stale edit controls unavailable. Zero browser JavaScript exceptions in this exercise.
- Independent synthetic-browser re-gate: Refresh, Load more, Add member and Save roster preserve keyboard focus
  through the in-place change; 320/390/640/1024 roster arrow targets are at least 44×44 px. Focus-preserving
  aria-disabled state is visually distinguished from available controls, and repeated card action names include
  their resource identity. Inherited shell navigation clipping at 200% text zoom remains a TASK-031 follow-up.
- Both independent reviewers cleared P0/P1 on the implemented partial surface. Full-task Class-B acceptance
  and Human live validation are still pending, as is the approved Move-eligibility public read.
- Human Owner reported that the presented functionality was validated on 2026-09-28. This confirms user acceptance of the available partial functionality without asserting that the absent Move editor, full live gameplay or all viewport/browser variants were tested.
- QA/Class-B and Human usability review remain separate gates. Full TASK-100 completion remains blocked
  by a Class-A public read contract for the server-current eligible Move set; no browser-side inferencing.

## Known dependency gate

`GET /player/pokemon/:id` exposes selected `moveLoadout`, but not current eligible Move choices.
SPEC-016 §5.2 forbids client inference. A proposed Class-A public read extension must be accepted
before the selectable Move editor can be completed; TASK-100 cannot be declared DONE from this
partial implementation alone.

## Proposed Class-A decision for Human review (not approved)

Candidate self-scoped read: GET /player/pokemon/:pokemonInstanceId/eligible-moves.
Return the canonical requested Pokemon identity, current shared Pokemon rowVersion,
server-selected exact game-data/rules authority reference, and the deterministic ordered list
of MoveIds currently eligible for a *complete new* Move-loadout replacement. Resolve eligible
choices through the existing TASK-089/SPEC-010 server-authoritative application and pinned
artifact/compatibility rules, not a frontend static-data approximation. Historical selected-only
grandfathered Moves remain visible through existing Pokemon detail but are not silently offered
for new replacement when currently ineligible.

Security and race contract: same self-scoped ownership and session/Origin controls as existing
Player reads, no gameplay-side effects and no client authority over Species/Level/version.
Return 404 not_found for inaccessible instances and 503 authority_unavailable for missing exact
published authority; reject stale edits using the existing PUT expectedRowVersion without
automatic replay. A UI GET preview is never a promise that future PUT eligibility will be
unchanged. The endpoint name, response fields, bounding/paging policy, and authority
retention semantics require a separate accepted Class-A specification before implementation.
