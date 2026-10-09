# TASK-120 — Durable Hunt Terminal & Offline Summary Contract

## Metadata

- State: DONE
- Class: A — new durable public read contract
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent protocol/replay reviewer
- Auditor: Security/Persistence Reviewer
- Auditor execution surface: independent owner-scope/retention/integrity audit
- Consultants: Game Systems Consultant as needed
- Consultant execution surface(s): advisory only
- Spec: APPROVED SPEC-025
- Related: TASK-039 / TASK-041 / TASK-103 / TASK-110
- Control branch: `docs/TASK-120-history-handback` — repository-history handback only
- Control worktree: `.worktrees/TASK-120-history-handback`
- Dedicated implementation branch/worktree: not allocated; implementation remains separately gated after Class-A acceptance

## Objective

Define a durable owner-scoped read contract for completed Hunt terminal reason plus immutable per-reconciliation offline/return receipts so reload/reconnect/history views can recover the exact authoritative interval facts without depending on ephemeral command responses or synthesizing Battle events.

## Context

- TASK-110 provides authoritative Hunt Activity rows and offline reconciliation effects.
- Current public Hunt state exposes active Hunt/recovery state but not a durable terminal reason or completed return summary.
- TASK-039 therefore cannot satisfy its terminal/offline summary acceptance criterion after reload without inventing state.
- TASK-041 is a downstream E2E consumer and does not own this missing backend contract.

## Scope

- Define owner-scoped durable lookup identity and retention for a completed Hunt summary.
- Define immutable identity for each offline/return reconciliation interval on long-lived/open-ended Hunts; later returns cannot overwrite earlier receipts.
- Define canonical terminal reason exposure.
- Define authoritative offline/return facts and whether they are stored directly or deterministically reconstructed from retained provenance.
- Reuse Hunt Activity for resolved Encounter facts instead of duplicating/synthesizing CombatEvents.
- Define replay/idempotency semantics across reload, reconnect, repeated reads and late Activity pagination.
- Define bounded response/pagination rules and failure behavior for expired/unavailable historical data.

## Out of scope

- CombatPresentation event transport or mutation.
- New reward grants at Hunt end.
- Client-side arithmetic becoming authoritative.
- Persistent implementation/migration before Class-A acceptance.
- Production retention tuning without explicit acceptance.

## Acceptance criteria

- [x] The task-local Class-A candidate defines a durable terminal-Hunt summary plus immutable per-reconciliation receipt contract sufficient for TASK-039 result/offline UI; canonical SPEC-025 promotion was performed only after Human acceptance and the separately authorized history handback.
- [x] Terminal reason survives command-response loss and ordinary reload/reconnect within the accepted retention window.
- [x] Offline/return resource facts are authoritative and exactly-once/replay safe; an exact older reconciliation receipt remains stable after later progress/returns on the same Hunt.
- [x] Encounter-level battle/capture/XP/drop/spend/KO/Revive facts remain sourced from Hunt Activity/provenance and are not fabricated as CombatEvents.
- [x] Owner scoping, retention/expiry, pagination/size and corruption/unavailability behavior are explicit.
- [x] Independent protocol + persistence/security review finds no unresolved P0/P1 before implementation authorization.
- [x] Human Owner accepts the exact Class-A candidate before canonical SPEC-025 promotion or downstream implementation/migration activation.

## Validation / tests

- [x] Contract semantics cover retreat, no-living/defeat, natural terminal-before-target and open-ended return cases applicable to accepted runtime semantics.
- [x] Repeated read, reload, 8h-cap return, multiple sequential returns on one open-ended Hunt, partial reconciliation, supersession/expiry and expired-history cases are specified.
- [x] Independent replay/persistence review confirms the reporting projection cannot imply or trigger duplicate reward/capture/Item grants.

## PA-M5 activation / Gate 1 — exact-current authority reconciliation

- Human Owner instruction `Ok, continue` at `2026-10-09T15:03:44Z` authorized continuation from the newly entered PA-M5 milestone. PA-M5 remains capability-gated; this activates **only the TASK-120 Class-A contract review**, not implementation, migration, deploy or public enablement.
- TASK-120 is prioritized ahead of TASK-121 because it is an additive owner-scoped read contract over already committed Hunt provenance and directly closes a TASK-039/TASK-041 read gap. TASK-121 remains `DRAFT` because it can require persistent compatibility migration with Inventory/capture/economic risk.
- Exact-current runtime already distinguishes foreground maintenance from return reconciliation: web `mode="online"` uses `POST .../checkpoint`, while `mode="return"` uses `POST .../claim`. Therefore a durable return receipt can be bound only to accepted `claim` correlations without creating one receipt per ordinary foreground checkpoint.
- Existing durable authority already provides: owner-scoped `solo_hunts` terminal fields; bounded immutable `hunt_resolved_encounter_activity`; automation item-use/post-Battle Revive provenance; capture/reward provenance; and `hunt_public_commands` with server `commandId`, frozen target logical time/wall clock and command-local `claimEffects`.
- Current `claimEffects` is useful transient reporting but is not sufficient as the durable summary authority: it is tied to bounded public-command retention and does not by itself represent every consumed Item / KO / Revive fact needed by TASK-039. TASK-120 therefore requires an immutable reporting receipt sealed from the committed source authorities, never a second reward ledger.
- Current `solo_hunts.terminal_reason` is durable, but the current Player-wide GET intentionally omits historical terminal reason. The accepted forward public vocabulary remains `retreat | no_living`; historical persisted `draw` / `opponent_victory` are projected as `no_living` without rewriting stored Battle/command evidence.
- Gate-1 conclusion: **READY TO MODEL**. No runtime or database edit is required to decide the read contract.

## Candidate Class-A contract — task-local review packet

This section preserves the exact task-local candidate that received independent review and Human Class-A acceptance. The separately authorized history handback promotes the same accepted contract into canonical APPROVED SPEC-025 without changing its gameplay/protocol semantics.

### Candidate resources and ownership

The v1 proposal is read-only and self-scoped under ADR-006 / SPEC-011. The client never supplies a Player ID.

1. `GET /player/hunts/:huntId/summary`
   - Returns one bounded Hunt summary for an owned Hunt.
   - Active Hunts return `status="active"` and `terminal=null`; a client may not infer a terminal outcome from recovery or local history.
   - Terminal Hunts return `status="terminal"` plus a durable public terminal projection.
   - `latestReturnReceiptId` / `latestReturnReceiptOrdinal` refer only to the latest **sealed reportable** return receipt; pending/abandoned receipts never advance this pointer.
2. `GET /player/hunts/:huntId/return-receipts?limit=N&cursor=C`
   - Lists only sealed **reportable** return receipts, newest-first. Pending and abandoned-no-effect records are omitted.
   - `limit` defaults to `32` and is bounded to `1..64`.
   - Cursor is the canonical positive base-10 Hunt-local `receiptOrdinal`, bounded to PostgreSQL signed-`bigint`; duplicate/malformed/zero/out-of-range query values fail `400 invalid_request`.
   - The next page returns strictly older reportable ordinals. Gaps are allowed because non-reportable ordinals are not renumbered.
3. `GET /player/hunts/:huntId/return-receipts/:receiptId`
   - Returns the exact receipt lifecycle state for one owned Hunt.
   - `receiptId` is exactly the server-owned UUID `commandId` of the accepted public `claim` command. No client-selected receipt identity exists.

Every route first resolves `huntId` under the authenticated self Player and only then resolves receipt identity/expiry inside that owned Hunt. Unknown Hunt, foreign Hunt, absent receipt and foreign receipt all return the same bounded `404 not_found`; only after ownership is established may an expired owned resource return `410`. Reads use `Cache-Control: private, no-store`, accept no request body, do not touch session activity and cannot perform gameplay/session mutation.

### Candidate terminal summary v1

Schema `pokenexus.hunt-summary.v1` contains only bounded management facts:

- `huntId`, `status`, `startedAt`;
- `terminal=null` for active Hunts;
- terminal `reason`, `terminalAt`, `recoveryReadyAt`, `sealedAt` for terminal Hunts;
- nullable latest **sealed reportable** return-receipt identity/ordinal.

The public v1 terminal reason vocabulary is exactly `retreat | no_living`. Persisted historical `opponent_victory` / `draw` remain immutable source evidence but project to `no_living`, matching accepted SPEC-015/TASK-101 public classification. Old completed command replay bytes are never rewritten.

`terminalAt` remains the gameplay terminal boundary used by recovery semantics. The 30-day read-retention clock is **not** derived at GET time and is not inferred from `solo_hunts.terminal_at`: `sealedAt` is an immutable server timestamp recorded in the same terminal transaction as the summary projection. An implementation may reuse an already committed equivalent presentation-seal timestamp only when the exact same terminal transaction/provenance is proven; summary availability never depends on the public CombatPresentation route being enabled.

### Candidate return-receipt allocation and immutable identity

- Only an accepted `claim` command (current web `mode="return"`) owns a v1 return receipt. Routine `checkpoint` foreground maintenance, Start, Retreat and policy writes never create one.
- Receipt identity/header allocation occurs in the **same database transaction as first claim acceptance** while the owned Hunt/root is serialized. That transaction fixes `receiptId=claim.commandId`, `huntId`, positive `receiptOrdinal`, `fromLogicalTimeMs`, `fromWallClockAnchorAt`, frozen `targetLogicalTimeMs`, frozen `targetWallClockAt` and the exact command/provenance binding.
- Persistence must enforce at least `UNIQUE(commandId)` and `UNIQUE(huntId, receiptOrdinal)`. Hunt-local ordinal allocation is serialized and monotonic. Same-key replay retrieves the same row and may never allocate or rebind an ordinal.
- A claim rejected before command acceptance/correlation freeze does not allocate a receipt.

### Candidate public receipt lifecycle

One receipt has exactly one of these durable states:

1. **`pending`** — accepted claim, immutable header exists, not sealed.
   - Exact receipt GET returns bounded `202 receipt_in_progress` with immutable interval header only; no uncommitted aggregate is exposed.
   - It is absent from receipt list and from `latestReturnReceipt*`.
2. **`completed`** — terminal `200` claim reached its frozen target or the Hunt naturally terminalized first.
   - Seal once with `completionDisposition=target_reached | hunt_terminal`, actual `throughLogicalTimeMs`, immutable effects and `sealedAt`.
   - A natural Hunt terminal before target does not pretend the unused target was simulated.
3. **`incomplete`** — the claim terminates without successful completion **after receipt-owned progress was committed**, including `command_superseded`, continuation expiry or another accepted terminal non-200 disposition.
   - The reporting layer **MUST** seal the receipt deterministically from already committed command-bound provenance before/at the terminal/expiry transition; it may not advance gameplay merely to finish reporting.
   - `throughLogicalTimeMs < targetLogicalTimeMs` when target was not reached and the terminal cause is explicit (`superseded | expired | terminal_error`).
   - It is reportable because it describes committed return work, but never presented as a fully reconciled interval.
4. **`abandoned`** — the accepted claim terminates/supersedes/expires with **zero receipt-owned gameplay progress**.
   - Seal a zero-effect audit record with cause and `sealedAt`; do not fabricate effects.
   - Exact receipt GET may expose this bounded terminal state, but it is absent from list/latest summary pointers because it is not a player return summary.

At the authoritative supersession/expiry/non-200 terminal transition, the same serialized transaction MUST freeze the receipt's final lifecycle state, terminal cause, source-bound committed high-water/effect digest and immutable `sealedAt`; no later job may choose or shift those facts. Lazy expiry lookup or bounded cleanup may only materialize/compact the already-frozen reporting projection from those committed fields and source bindings, without advancing gameplay or selecting a new outcome/timestamp. Restart/retry cannot leave a forever-pending header after the command is terminal. A missing/inconsistent source required to establish the seal fails closed; no alternate client arithmetic is accepted.

### Candidate interval and accepted 8-hour-cap facts

Completed/incomplete receipts expose server-derived interval facts:

- `fromLogicalTimeMs`, `throughLogicalTimeMs`, frozen `targetLogicalTimeMs`;
- `fromWallClockAnchorAt`, frozen `targetWallClockAt`;
- `observedElapsedMs = targetWallClockAt - fromWallClockAnchorAt`;
- `productiveTargetMs = targetLogicalTimeMs - fromLogicalTimeMs`;
- `productiveAppliedMs = throughLogicalTimeMs - fromLogicalTimeMs`;
- `discardedByOfflineCapMs = max(0, observedElapsedMs - productiveTargetMs)` under TASK-110's accepted 8-hour cap;
- `unappliedTargetMs = max(0, targetLogicalTimeMs - throughLogicalTimeMs)`.

All arithmetic is server-owned and validated for non-negative/safe domain bounds. Client wall clock is never consulted. For `abandoned`, applied/effect facts are zero; for `pending`, through/effect facts are not published as final.

### Candidate command-bound effect provenance

The receipt is an immutable **reporting projection**, never a second reward/Inventory authority. A logical-time range alone is insufficient membership proof because other accepted commands may advance the same Hunt. Therefore every effect counted in a receipt MUST be bound to that receipt's exact claim command through committed provenance.

Implementation must use one of two equivalent fail-closed strategies for every committed effect while a claim owns progress:

- persist `sourceCommandId`/receipt provenance alongside the underlying immutable Activity/item/capture/reward record; or
- update a receipt-owned staged aggregate/high-water/digest atomically in the same transaction that commits the authoritative effect.

GET-time reconstruction from mutable current Inventory or logical-window overlap alone is prohibited. If source bindings, high-water/digest or canonical payload disagree, the read returns `503 authority_unavailable`; it never silently assigns another command's effects to this receipt.

A sealed `effects` projection is bounded to:

- Player XP gained;
- Pokémon XP by owned Pokémon instance;
- Item rewards/drops by Item ID;
- consumed Items by Item ID, including capture/Potion/Revive debits backed by authoritative spend/use provenance;
- automatic capture attempts/successes/failures/closed-no-eligible-Ball/Shiny successes;
- KO counts by player/opponent side;
- Revive counts by `battle | post_battle` phase and Item ID.

Encounter-level Species/Battle result/capture result/drop row/item-use/Revive-HP details remain owned by Hunt Activity and immutable source ledgers. No receipt read creates entitlement, reward, capture, Item debit or CombatEvent. Canonical sealed payload/digest (or equivalent immutable binding) makes a conflicting reseal an integrity failure.

### Candidate retention, pagination and response bounds

- A terminal summary is publicly readable for 30 days from immutable terminal-summary `sealedAt`.
- A sealed receipt is publicly readable for 30 days from its own immutable `sealedAt`. A pending receipt follows the existing command continuation lifetime until it deterministically seals as completed/incomplete/abandoned.
- Physical Hunt/Activity/economy/audit retention is independent and may be longer. This read contract never authorizes deleting source evidence because its 30-day presentation window expired.
- After the public window, an owned identity that can still be established returns `410 summary_expired` or `410 return_receipt_expired`; absent/foreign stays `404`.
- Missing/corrupt in-window authority or digest mismatch returns `503 authority_unavailable`.
- Summary JSON is capped at `64 KiB`; exact receipt at `128 KiB`; list page at `256 KiB` and at most 64 entries. Pokémon aggregate rows are at most the Hunt Team bound (`6`); Item aggregate rows at most `128`. Over-bound persisted data fails `503`, never truncates facts.
- List pagination may return fewer than requested to respect byte bounds, but it may not skip any **reportable** ordinal between the returned records and the returned next cursor. Query parsing is closed/canonical as defined above.

### Candidate prospective cutover and historical backfill

- Receipt v1 is **prospective by default** from the accepted implementation cutover. Historical claim `result_json` / `claimEffects` retention is not presumed sufficient and no historical receipt is synthesized merely because a command or logical-time range exists.
- A historical receipt may be backfilled only by a separately reviewed implementation dry-run that proves the exact claim command identity, frozen interval, command-bound committed effects and a trustworthy immutable seal timestamp from complete retained provenance. Missing any element means no fabricated receipt; the owned read fails `503 authority_unavailable` where the contract requires that historical identity.
- Terminal-summary backfill follows the same rule. An existing committed presentation-terminal seal may be reused only when its transaction/provenance equivalence is proven. `solo_hunts.terminal_at` alone is not a substitute retention seal.
- Backfill writes reporting projections only; it may never rewrite historical Hunts, commands, Activity, Inventory, captures, rewards or Battle evidence.

### Candidate review decisions for Human Class-A gate

1. Three read resources: Hunt summary, paged sealed return receipts and exact receipt lookup.
2. `receiptId=claim.commandId`; Hunt-local positive ordinal allocated transactionally with claim acceptance and unique per Hunt.
3. Lifecycle `pending → completed | incomplete | abandoned`, with deterministic sealing for superseded/expired/non-200 claims and sealed-only list/latest semantics.
4. Persisted immutable reporting projection with exact command-bound provenance; no logical-overlap/current-Inventory reconstruction.
5. Public terminal reason v1 exactly `retreat | no_living`; historical raw evidence remains immutable.
6. Receipt aggregates: XP, rewards, consumed Items, capture counts, KO counts and Revive counts; per-Encounter detail remains Hunt Activity authority.
7. Public full-read window 30 days from immutable server `sealedAt`; source/audit retention independent.
8. Prospective-by-default v1 cutover; historical backfill only from complete audited provenance, never inferred.

## Gate 2 — independent exact-current review

- First protocol/replay pass: `BLOCK P0=0 / P1=1 / P2=2`. It correctly identified an undefined fate for accepted claim receipts when a pending command is superseded/expires/ends non-200, ambiguity for pending/list/latest visibility and unsafe potential attribution by logical-window overlap.
- First persistence/security pass: `BLOCK P0=0 / P1=1 / P2=2`. It additionally required mandatory incomplete sealing for committed partial progress, transactionally serialized ordinal uniqueness, precise owner-first expiry behavior, immutable terminal/receipt seal timestamps and prospective/audited backfill semantics.
- The candidate was hardened without runtime edits: lifecycle is now `pending → completed | incomplete | abandoned`; superseded/expired/non-200 transitions freeze final lifecycle/cause/high-water/effect digest/`sealedAt` atomically; pending exact GET is header-only `202`; list/latest are sealed-reportable only; receipt ID/ordinal allocate in the claim-acceptance transaction with uniqueness; effect membership is exact-command-bound; historical backfill is prospective-by-default and requires complete audited provenance.
- Final protocol/replay delta re-gate: **READY — P0=0 / P1=0 / P2=0**.
- Final persistence/security delta re-gate: **READY — P0=0 / P1=0 / P2=0**.
- Review scope was contract/source inspection only. No migration, implementation, database write, live Hunt mutation, deploy or public enablement was performed or implied.
- Gate-2 conclusion: **READY FOR HUMAN CLASS-A DECISION** on the eight candidate decisions above.

## Human Owner Class-A acceptance

- Human Owner message: `Aprovado`.
- Recorded message timestamp: `2026-10-09T17:18:01Z`.
- The Human Owner accepts the exact eight-decision Class-A candidate after the gameplay interpretation was explicitly explained as a durable **Hunt Result / Offline Summary / return-history** reporting feature rather than a new Hunt mechanic or a second reward source.
- Accepted player-facing intent: after offline/return reconciliation, the game may durably report what was already committed — XP, captures, drops, consumed Items, KO/Revive counts, terminal reason and recovery — across reload/reconnect/history without re-granting or recomputing rewards from mutable state.
- The internal receipt model remains implementation detail; the intended UX may present it as `Offline Summary` / `Return History` rather than exposing `receipt` terminology to the Player.
- TASK-120 therefore moves from `ACTIVE` to `ACCEPTANCE` with the contract decision complete.
- Canonical SPEC-025 is promoted by the separately authorized repository-history handback without changing the accepted task-local semantics.
- This acceptance does **not** authorize a database migration, API implementation, backfill, public route enablement, deploy or production action. Those remain separate downstream gates.

## Repository-history handback

- Human Owner follow-up message: `Aprovado`.
- Recorded message timestamp: `2026-10-09T17:19:43Z`.
- Scope: promote the accepted Class-A contract into canonical SPEC-025 and close TASK-120 lifecycle in repository history only.
- Explicitly excluded: database/API implementation, migration, historical backfill, public enablement, deploy, production mutation and TASK-121 activation.
- History candidate is isolated from the dirty PA-M4/PA-M5 control worktree so TASK-128/TASK-129 changes are not silently absorbed.

## Dependencies

- TASK-110 runtime/activity provenance.
- APPROVED SPEC-020 management-first offline/return product requirement.

TASK-039 and TASK-041 are downstream consumers of this contract, not prerequisites for defining it.

## Risks / irreversible actions

- A summary that is not durably bound to authoritative Hunt identity/provenance can misreport resources after retries.
- Duplicating Activity as a second mutable ledger would create conflicting authorities and is prohibited.
- No migration, implementation, deploy or public enablement is authorized by TASK-120 completion.

## Expected files / boundaries

- `docs/specs/SPEC-025-durable-hunt-terminal-offline-summary.md`
- `docs/project/PROJECT_ROADMAP.md`
- TASK-039/TASK-041 dependency updates after acceptance.
