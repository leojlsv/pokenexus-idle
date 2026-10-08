# TASK-100 — Collection, Pokémon & Team Management UI

## Metadata

- State: ACTIVE
- Execution gate: Class-B prerequisites READY; Move-choice selection gated by an authoritative public read
- Class: B
- Owner: Frontend Developer (ChatGPT prime)
- Owner execution surface: ChatGPT prime (explicit non-default Frontend Developer assignment; current reconciliation worktree based on canonical `main`)
- Reviewer: QA Reviewer (independent exact-current technical + UX/Class-B READY 2026-10-06)
- Reviewer execution surface: independent ChatGPT delegated reviewers `worker-10` and `worker-11` on the current reconciliation snapshot
- Auditor: N/A — this FE scope does not implement a new security model, public contract or database strategy; reassess if scope changes
- Auditor execution surface: N/A
- Consultants: N/A — this implementation does not define new gameplay or economy rules
- Consultant execution surface(s): N/A
- Prior partial-review evidence: independent technical QA PARTIAL READY (P0/P1 clear); independent UX/visual QA PARTIAL READY
- Delegated Class-B acceptance: READY 2026-10-06 with P0/P1/P2 = 0/0/0 on the current candidate; Human Owner approved the current mock-backed live preview and explicitly authorized repository-history integration/push on 2026-10-06. Deploy/public enablement remains unauthorized, and the full Move editor remains separately gated by Class-A authority.
- Specs: `docs/specs/SPEC-011-player-state-api-contract.md`, `docs/specs/SPEC-016-ui-ux-architecture-navigation-design-system.md`
- Dependencies: TASK-025, TASK-027 — DONE
- Control branch: `main`
- Control worktree: `.` (canonical post-TASK-124 project control; this does not change the Frontend Developer implementation owner or source history)
- Source branch: `reconcile/TASK-100-current`
- Source worktree: `.worktrees/TASK-100-current-reconcile` (preserved exact-current implementation/review snapshot)
- Preserved historical source: `.worktrees/TASK-100-collection-pokemon-team-ui` on `feat/TASK-100-collection-pokemon-team-ui` remains untouched as the September partial-candidate evidence source.

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
- [x] Tests, typecheck, lint, build, roadmap and diff-check pass on the current reconciliation candidate.
- [x] Independent exact-current QA and UX/Class-B acceptance are READY with P0/P1/P2 = 0/0/0.
- [x] Human Owner live/preview validation and repository-history integration/push authorization recorded 2026-10-06; no deploy/public enablement authorization.

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
- Both independent reviewers ultimately cleared the exact-current reconciliation candidate at P0/P1/P2 = 0/0/0,
  and Human live-preview validation is approved. Full TASK-100 completion still depends on the approved
  Move-eligibility public read described below.
- Human Owner reported that the presented functionality was validated on 2026-09-28. This confirms user acceptance of the available partial functionality without asserting that the absent Move editor, full live gameplay or all viewport/browser variants were tested.
- QA/Class-B and Human usability review remain separate gates. Full TASK-100 completion remains blocked
  by a Class-A public read contract for the server-current eligible Move set; no browser-side inferencing.

## Canonical-main reconciliation candidate — 2026-10-06

- The September TASK-100 worktree was **not** rebased/reset/cleaned because it is 51 commits behind current `main` and contains preserved historical local evidence. A fresh `reconcile/TASK-100-current` worktree was created from canonical `main` `7a1980f` and only the valid frontend implementation was transplanted.
- Reconciled source is bounded to `player-api`, Collection/Pokémon/Teams pages/state, Team-create intent recovery, route integration and responsive tests. Historical temporary CDP scripts/screenshots, preview-only files and stale spec/roadmap edits were intentionally not imported.
- Current route integration coexists with the already-integrated TASK-039 Hunt surfaces and TASK-111 Inventory surface; no Hunt/Inventory implementation was replaced or absorbed.
- Player transport matches current SPEC-011 / `apps/api/src/player/http.ts`: authenticated self-scoped Collection/Pokémon/Team reads, Team create/roster/delete mutations, exact decimal OCC strings and no Player/account authority supplied by the client. Redirect following is explicitly rejected (`redirect: "error"`) for both reads and mutations.
- Team-create response-loss recovery persists one exact UUID command identity before POST, scopes recovery to the current session without persisting the CSRF token, never automatically substitutes a new key, and forces explicit review before discarding a prior-session unresolved identity.
- Team roster save/delete keeps exact `expectedRowVersion`, never automatically retries stale/uncertain mutations, validates successful echoed identities/order/status, and requires authoritative reconciliation on stale, 404 or ambiguous transport/server outcomes.
- Pokémon detail keeps the selected Move loadout **read-only** and states the missing dependency explicitly. Repository search reconfirmed that current `main` exposes `PUT /player/pokemon/:pokemonInstanceId/moves` but still has **no** public eligible-Moves GET. No browser-side level/learnset inference was added.
- Reconciliation owner gates after current-main integration and all QA/UX corrections: focused Player/pages/API/App/responsive **42/42 PASS** across 5 files; full web **117/117 PASS** across 16 files; web typecheck PASS; lint PASS; production Vite build PASS; roadmap **122** PASS; `git diff --check` PASS.
- UX/Class-B review found two P2s on the first reconciled snapshot and no P0/P1: a stale Team save could enter a conflict even when the fresh server roster already exactly matched the local draft, and Pokémon-detail Refresh temporarily replaced safe prior data with a loading-only state. Both were corrected in the current candidate: exact ordered equality now reconciles as already applied with the fresh OCC token, and single-resource refresh retains the prior authoritative value with explicit pending/failure state. Exact helper behavior is covered by focused tests.
- Additional fail-closed transport hardening on the corrected snapshot requires the exact accepted success status (`200`) for Team create/roster/profile commands, validates the returned profile UUID, rejects redirects, duplicate Collection/Team page identities, Player decimal values above PostgreSQL signed `bigint`, cursors above the public 4096-character bound and any Teams quota other than the SPEC-011 constant `6`.
- Collection/Team continuation now also fails closed on a successful opaque-cursor cycle while still allowing an explicit retry of the same page after transport/server failure; concurrent cross-page identity overlap remains merged because SPEC-011 does not promise a cross-page Collection/Team snapshot.
- Independent frontend QA then identified one remaining P2 validation gap: the reconciled tests covered transport/state helpers but did not import/mount the page components or regression-test their high-risk orchestration. The current candidate closes that gap with `player-pages.test.tsx`: all four real page components mount through React SSR, while production helpers used directly by those pages exercise exact Team-create persist-key → POST → clear ordering, ambiguous-response key retention, definitive-rejection clearing, equal/conflicting roster reconciliation, uncertain-mutation classification and deterministic conflict/error/unavailable/post-choice focus targeting. No external DOM/test dependency was added.
- Final UX/Class-B re-gate identified one additional P2 in stale Team deletion guidance: a `409 stale` DELETE correctly performed only authoritative reconciliation but reused save-oriented copy when the Team still existed. The corrected path keeps the same OCC/read-only reconciliation semantics, never retries DELETE automatically, adopts the fresh authoritative rowVersion when matched, and explicitly tells the user that deletion was not applied and must be intentionally issued again. Action-specific save/delete guidance is covered by `teamStaleReconciliationCopy` tests.
- Dependencies were materialized only with `pnpm install --offline --frozen-lockfile` (`272` reused, `0` downloaded); package/lock bytes were not changed.
- Final independent exact-current re-gates on the corrected snapshot are **READY 0/0/0** from both technical QA (`worker-10`) and UX/accessibility/Class-B (`worker-11`). Both independently reproduced focused **42/42**, full web **117/117**, typecheck, lint, production build, roadmap 122 and `git diff --check` PASS.
- Human Owner gate on 2026-10-06: the current local mock-backed preview is approved, and the validated candidate is authorized for commit, integration into repository history and push under the established project flow. This authority explicitly excludes deploy/public enablement and does not authorize TASK-119/TASK-120/TASK-121 or the missing Class-A eligible-Moves read contract.
- Repository-history integration executed under that authority on 2026-10-06: candidate commit `d08e2f6` (`feat(web): reconcile TASK-100 player management UI`) was pushed to `origin/reconcile/TASK-100-current`; merge commit `f01f310` (`merge: integrate TASK-100 player management UI`) integrated the candidate into canonical `main`. Post-merge `main` validation reproduced full web **117/117**, typecheck, lint, production build, roadmap 122 and `git diff --check` PASS. No deploy/public enablement was performed.

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
