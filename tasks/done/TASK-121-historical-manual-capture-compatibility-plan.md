# TASK-121 — Historical Manual-Capture Compatibility & Migration Plan

## Metadata

- State: DONE
- Class: A — persisted/public compatibility and migration decision
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: independent QA/Architecture Reviewer
- Reviewer execution surface: independent compatibility/replay review
- Auditor: Persistence/Security Reviewer
- Auditor execution surface: independent migration/idempotency audit
- Consultants: Game Systems Consultant as needed
- Consultant execution surface(s): advisory only
- Spec: APPROVED SPEC-026
- Related: TASK-038 / TASK-039 / TASK-098 / TASK-106 / TASK-110
- Control branch: `docs/TASK-121-history-handback` — repository-history handback only
- Control worktree: `.worktrees/TASK-121-history-handback`
- Dedicated implementation/migration branch/worktree: not allocated; create only after Human Class-A acceptance and a separate implementation gate

## Objective

Choose and specify the compatibility/migration treatment for historical persisted manual-capture boundaries now that the accepted management-first product no longer exposes per-Encounter Ball/skip controls.

## Context

- Canonical backend still retains historical `pendingManualCapture` persistence and manual-capture command machinery for replay/compatibility.
- TASK-039 intentionally exposes only a non-actionable compatibility marker and must not fabricate an automatic resolution.
- TASK-106 explicitly requires compatibility/migration planning before removing or superseding already-persisted/public behavior.

## Scope

- Inventory every persisted/manual-capture state and completed-command shape that can exist from historical contracts.
- Decide the forward treatment for each state: preserve/read-only, migrate, deterministically resolve, or require an explicit recovery path.
- Preserve immutable historical command/economic evidence and prevent free rerolls, duplicate Ball spend, duplicate capture creation or reward duplication.
- Separate exact-existing-key historical replay from migration/recovery of unresolved pending states whose correlation has expired; replay-only transport may never mint a new manual-capture intent.
- Define migration/versioning/idempotency/rollback and replay behavior if any persisted state changes.
- Define the public compatibility surface after migration, including when the legacy marker can be removed from forward state.

## Out of scope

- Reintroducing manual per-Encounter capture UX.
- Changing accepted automatic capture policy semantics.
- Executing a production migration before Class-A acceptance and a separate implementation/deployment gate.
- Rewriting immutable historical command results.

## Acceptance criteria

- [x] The task-local Class-A candidate inventories every legacy persisted/manual-capture boundary that must remain replay-safe; canonical SPEC-026 promotion was performed only after Human acceptance and the separately authorized history handback.
- [x] Human Owner selects and accepts the exact forward treatment for each legacy state class.
- [x] No-free-reroll, Inventory debit, capture provenance and exactly-once semantics are preserved by the candidate treatment.
- [x] Replay-only compatibility rejects unseen keys/new manual intents; expired/no-command pending states use deterministic zero-effect skip-equivalent closure with migration audit.
- [x] Rollback/restart/replay, H5 partial-effect ambiguity and historical command retention cases are specified fail-closed.
- [x] A separate future Class-B implementation/migration task is identified as the only implementation surface after Class-A acceptance; no task ID/worktree is allocated or activated by this approval.
- [x] Independent compatibility and persistence/security review finds no unresolved P0/P1.

## Validation / tests

- [x] Contract matrix covers pending, skipped/no-attempt, attempted-success/failure evidence, completed replay, orphan command, blocked-existing and ambiguous/interrupted boundaries; concrete fixtures belong to the later Class-B task.
- [x] Candidate distinguishes exact-existing-key replay from expired/no-command pending recovery and prohibits implicit replacement command creation.
- [x] Migration plan specifies dry-run/count/digest/drift/owner-graph evidence before any persistent mutation.
- [x] Forward product boundary remains no manual capture UI/new-intent API; replay-only transport is historical recovery only.

## PA-M5 activation / Gate 1 — exact-current legacy inventory

- Human Owner instruction `continue` at `2026-10-09T17:39:22Z` followed the explicitly identified next action: activate **TASK-121** as the next PA-M5 Class-A compatibility gate. This activates contract/evidence work only; no migration, runtime implementation, route removal, deploy or production mutation is authorized.
- Exact-current source confirms four distinct legacy authorities that must never be conflated:
  1. `hunt_pending_manual_captures` — Player-wide unresolved legacy capture opportunity bound to exact source Hunt/Encounter evidence;
  2. `hunt_public_commands(command_kind='manual_capture')` — durable public command/idempotency/replay identity and any frozen attempt/skip intent;
  3. `capture_attempts` — immutable one-attempt-per-Encounter economic/capture result authority;
  4. `hunt_encounter_boundaries` — immutable capture/reward boundary/provenance, including historical `manualDisposition`.
- Current forward product does not create new manual fallback when checkpoint state carries `automationPolicies`; auto-capture OFF produces `automaticDisposition='disabled'`, `manualDisposition='not_applicable'` and no Player prompt.
- Forward Card UI already treats any legacy pending row as a **non-actionable compatibility marker** and exposes no Ball/skip controls.
- Preserved local Pre-alpha PostgreSQL read-only census (`pokenexus-prealpha-local`, database `pokenexus_local_prealpha`) found:
  - `hunt_pending_manual_captures = 0`;
  - `hunt_public_commands` with `command_kind='manual_capture' = 0` in every command status;
  - `hunt_encounter_boundaries = 297`, all `manual_disposition='not_applicable'`;
  - `capture_attempts = 115`, all current attempts use automatic `auto:` correlation provenance (`90` success / `25` failure), with no manual attempt present.
- Therefore the **preserved first-Pre-alpha database inspected here** needs no manual-capture data migration today. This zero-row result is environment-specific evidence only and MUST NOT be extrapolated to other historical/staging/production databases; every supported environment requires its own dry-run census before cutover.
- Historical code/tests prove a manual pending row can survive the source Hunt and remain visible during a newer Hunt. Reward/progression is independent of that stale opportunity; a pending manual row is not authority to rewind the Hunt, re-grant reward or reroll an Encounter.
- A historical manual command attempt freezes its exact Ball authority + capture RNG under that command before the final attempt. Without such a still-supported exact command, the pending row alone contains no selected Ball or frozen manual-attempt RNG and therefore cannot be safely converted into an automatic capture using current policy/Inventory.

## Approved Class-A compatibility treatment — preserved review packet

This section preserves the exact task-local candidate that received independent review and Human Class-A acceptance. The separately authorized history handback promotes the same accepted contract into canonical APPROVED SPEC-026 without changing its compatibility/economic semantics.

### Legacy state classes and proposed treatment

| Class | Exact historical state | Proposed forward treatment |
|---|---|---|
| `H0 clean` | No pending manual row and no supported manual command requiring replay. | No action. Forward management-first behavior remains authoritative. |
| `H1 completed replay` | Exact existing terminal/gone `manual_capture` command; no unresolved pending work required. | Preserve immutable exact-key replay/tombstone semantics for the existing supported retry horizon. Never rewrite result bytes or mint another attempt. |
| `H2 accepted pending command` | Exact existing **pending**, unexpired `manual_capture` command whose normalized intent matches the owned pending row/source Encounter. | Temporary **replay-only** compatibility: only the exact existing Player+key+intent may continue. No new key/manual intent may be allocated. Existing frozen attempt Ball authority/RNG or skip intent remains authoritative. |
| `H3 orphan pending opportunity` | Owned `hunt_pending_manual_captures` row with no matching still-executable manual command (never commanded, expired/gone, or prior terminal error left opportunity unresolved). | Deterministically close as **legacy non-attempt / skip-equivalent**. Delete only the pending compatibility row and write immutable migration audit evidence. Zero Ball debit, zero capture attempt, zero Pokémon creation, zero reward/XP mutation and zero Hunt/checkpoint rewind. |
| `H4 stale pending after committed attempt/skip` | Pending row remains but exact immutable evidence proves the Encounter was already manually attempted or skipped/closed. | Close only the stale pending marker with a migration audit classification. Existing command/capture/reward evidence is untouched; no refund/replay/reroll. Any mismatch in ownership/Encounter/result fails closed for operator review. |
| `H5 orphan command` | Manual command exists but matching pending row no longer exists. | Never recreate the pending opportunity. First prove from the exact command ID/key + capture-attempt/Inventory/capture provenance that no command-local economic/capture effect was committed without its terminal result. If zero effects are proven, the **same existing command identity** may terminalize to bounded `capture_unavailable`/retired behavior and then follows normal retention. Any partial/ambiguous effect linkage is H7 and fails closed; no new correlation is minted. |
| `H6 blocked-existing boundary` | Historical Encounter boundary says `manual_disposition='blocked_existing'` because another Player-wide legacy pending opportunity already existed. | Preserve as immutable history. Never manufacture a retroactive capture opportunity when the older pending row is later closed. |
| `H7 corrupt/ambiguous` | Cross-owner identity conflict, multiple incompatible commands, attempt/Encounter provenance disagreement, missing source authority or any state not deterministically classifiable. | **No automatic mutation.** Fail migration dry-run closed and require explicit operator/recovery review; never choose a Ball, RNG, refund or new capture heuristically. |

### Why unresolved pending becomes skip-equivalent

- Historical `skip` is already a valid no-spend/no-capture branch that closes the manual opportunity.
- The pending row alone does not contain a selected Ball or a frozen manual-attempt RNG. Converting it to current auto-capture would apply current policy/Inventory to an old completed Encounter and would create a new economic/RNG decision, violating no-reroll and forward-only policy authority.
- Closing the opportunity does not undo reward or Encounter completion and does not touch `PendingEncounterSelection`; it therefore cannot create a free Encounter reroll.
- No compensation/refund is created because no authoritative Ball debit exists for an unattempted pending opportunity.

### Replay-only compatibility route

- During the compatibility window, `POST /player/hunts/:huntId/capture` may remain registered **only as replay transport for an already-existing `manual_capture` command**.
- Request handling must first establish authenticated owner scope for the Hunt and exact Player+Idempotency-Key command. It must never call the generic claim path for an unseen manual-capture key.
- Exact existing key + exact frozen normalized intent:
  - terminal → immutable stored replay;
  - gone → existing `410 idempotency_gone` semantics;
  - pending/unexpired + exact H2 pending source → continue the already-frozen command only.
- Same key/different intent remains `409 correlation_conflict`.
- Owned Hunt + **unseen** manual-capture key returns a deterministic retired/manual-capture-unavailable result and performs no command allocation, Hunt advancement, Inventory debit or capture creation. Foreign/unknown Hunt remains owner-scoped `404` and must not disclose command existence.
- The forward web client exposes no method/control for creating or choosing manual capture; replay-only transport exists solely for historical exact-key recovery.
- For H5, the compatibility layer may terminalize an existing pending command as no-effect unavailable only after atomically verifying the exact command identity has no matching committed capture attempt/debit/result side effect. If source evidence is incomplete or contradictory, the command is not rewritten/terminalized by compatibility logic and the case is H7/operator-review.

### Migration authority / audit record

- Any Class-B migration must be additive/versioned and must persist an immutable compatibility receipt for every H3/H4 closure. At minimum it binds migration version, Player ID, source Hunt ID, Encounter ID, canonical pending-row digest/evidence identity, classification/reason, related historical command ID/status when one exists, applied timestamp and a canonical result digest.
- Receipt identity is create-once and unique for the historical pending identity, at minimum `UNIQUE(migrationVersion, playerId, sourceHuntId, encounterId)` (or an equivalent canonical pending-identity key). Same identity + same source/classification is replay/no-op; same identity + different digest/classification is an integrity failure.
- Closing H3/H4 is one Player-serialized/OCC transaction with a fixed lock order: lock the Player Hunt root, re-read/lock the exact pending row, lock any related still-retained public command rows, then validate immutable attempt/boundary/reward evidence. Only after the exact dry-run classification still matches may it insert the migration receipt create-only and delete that exact pending row. If a matching executable command appeared, a command status changed incompatibly, receipt/source evidence conflicts or ownership differs, rollback with zero mutation.
- Referential proof must establish one self-consistent owner-scoped graph before mutation: pending Player → owned source Hunt → exact Encounter → any matching public manual command(s) → any capture attempt for that Encounter → boundary/reward evidence. A command/attempt owned by another Player, conflicting Encounter identity, duplicate incompatible command intent or mismatched source Hunt is H7.
- The transaction must verify the create-only receipt after insertion, delete exactly one expected pending row, then re-read within the same transaction to prove the receipt is present with the exact canonical digest/classification and the pending row is absent before commit. `rowCount != 1` or any post-delete mismatch rolls back.
- The migration never edits historical command `result_json`, `capture_attempts`, Pokémon, Inventory, rewards, Hunt checkpoints, Encounter boundaries or Battle evidence.
- Reapplying the same migration receipt is a no-write replay; same identity with different source digest/classification is a hard integrity failure.

### Dry-run and rollout gate

Before any persistent mutation, a separate Class-B implementation task must produce a read-only signed/hashed plan containing:

- total pending rows and manual commands by status/retention state;
- per-row classification H2/H3/H4/H7 plus owner/Hunt/Encounter identity;
- any existing capture attempt and command result linkage;
- any pending H5 command's exact zero-effect proof, or H7 classification if that proof is unavailable;
- exact planned mutation count (only H3/H4 closures) and exact no-op/replay-only count;
- zero cross-owner/duplicate/ambiguous findings; otherwise Apply is blocked;
- canonical source digest and migration version so Apply can reject drift between Plan and Apply.

Current preserved Pre-alpha expected plan is a **zero-row/no-op migration** because its census has no pending/manual legacy state.

Apply must be resumable and bounded rather than one unbounded global transaction:

- process deterministic plan entries in a stable canonical order with a bounded batch/cursor chosen by the Class-B implementation;
- each Player mutation still uses the Player-root-first transaction/lock order above, which serializes against H2 exact-key continuation because legacy command execution uses the same Player root authority;
- immediately after acquiring locks, re-read command expiry/status, pending row, attempt/boundary evidence and source digests; Plan classification is not authority after drift;
- if any entry drifted from the frozen plan, stop/fail that entry (and, per implementation policy, the remaining batch) without deleting it; never silently reclassify H2→H3 or H3→H4 during Apply;
- already-applied exact receipts are replay/no-op and make restart safe; unapplied entries remain visible for the next bounded run.

### Rollback / old-code safety

- Compatibility cutover must be monotonic: once new manual capture creation is retired, rollback to older application bytes must still fail closed for **both** new legacy creation paths: new manual commands and new pending manual-capture opportunities.
- Class-B implementation must therefore install a durable **retirement/version guard** before/with route cutover. The guard must fail closed under old application bytes for **both** legacy creation paths:
  1. inserting a new `hunt_public_commands` row with `command_kind='manual_capture'`; and
  2. inserting a new `hunt_pending_manual_captures` row / invoking any legacy Encounter-boundary producer that would create a new pending manual opportunity.
- A database-enforced replay-only mode (trigger/constraint/guard table or equivalent durable mechanism) is preferred because an application-only feature flag would be bypassed by rollback. Existing retained pending rows/commands remain readable/replayable under the accepted rules; the guard blocks only **new** legacy intent/opportunity creation. Migration deletion/audit inserts remain permitted.
- Rollback tests must execute representative older mutation-capable code against the guarded database and prove: no new pending manual row, no new manual command row, no Ball debit/capture/reward side effect, while exact replay of an already-existing command remains possible within its supported horizon.
- Rollback must never restore deleted H3/H4 pending opportunities or remove migration receipts. The compatible rollback posture is “legacy opportunity remains retired,” not “re-enable manual capture.”

### Legacy-marker / route removal criteria

`pendingManualCapture` may be removed from the forward public state shape, and the legacy capture route may be fully unregistered, only after all of the following are true for the supported environment:

1. migration dry-run/apply evidence shows **zero** remaining `hunt_pending_manual_captures` rows;
2. no unexpired pending manual command remains;
3. all existing manual command full-result/tombstone retry horizons have elapsed or an accepted equivalent replay archive exists;
4. H3/H4 migration receipts are retained and independently audited;
5. forward UI/API negative tests prove no manual capture intent can be created;
6. rollback/write-guard tests prove old code cannot re-enable either new manual-command creation or new pending-manual-opportunity creation.

### Candidate Human decisions

1. Preserve exact historical manual-command replay only; retire creation of all new manual capture intents.
2. Allow an already-accepted, unexpired exact pending command to finish only with its frozen key/intent/authority.
3. Deterministically close unresolved pending opportunities without a still-executable exact command as **skip-equivalent / no-attempt** with zero economic effects.
4. Close stale pending markers only when immutable attempt/skip evidence proves the outcome; ambiguity fails closed.
5. Never create a retroactive opportunity for `blocked_existing` boundaries.
6. Require additive migration receipts + exact dry-run/hash/drift gate before any H3/H4 deletion.
7. Require a persistent replay-only retirement guard so rollback cannot mint either a new manual command **or a new pending manual-capture opportunity**.
8. Remove legacy state marker/route only after zero pending rows and the supported replay horizon is exhausted/audited.

## Gate 2 — independent exact-current review

- Initial compatibility/replay review: **READY P0=0 / P1=0 / P2=1**. The sole P2 required H5 orphan pending commands to prove zero committed command-local effects before terminalizing as unavailable; ambiguity must fail closed instead of being normalized.
- Initial persistence/security review: **BLOCK P0=0 / P1=1 / P2=2**. The P1 found that a command-only retirement guard would still let rolled-back old code create a fresh `hunt_pending_manual_captures` opportunity before any command existed. The P2s required unique immutable migration receipts plus deterministic Player-root locking/bounded Plan→Apply revalidation.
- Candidate hardening completed without runtime/database mutation:
  - H5 now requires the same historical command ID/key plus exact zero-effect proof from authoritative capture/economic provenance; partial/ambiguous linkage is H7.
  - durable rollback guard must block **both** new `manual_capture` public commands and new legacy pending-manual opportunities/boundary producers while preserving exact existing replay;
  - migration receipt is create-once/unique by version + owned pending identity, with canonical digest equality on replay;
  - H3/H4 Apply locks Player root → pending row → related command rows, validates full owner/Hunt/Encounter/attempt/boundary/reward graph, inserts receipt, deletes exactly one pending row and verifies post-delete state before commit;
  - migration is bounded/resumable, revalidates latest state after locks and never silently reclassifies drifted H2/H3/H4 entries;
  - preserved local zero-row census is explicitly environment-specific and not extrapolated elsewhere.
- Final compatibility/replay re-gate: **READY — P0=0 / P1=0 / P2=0**.
- Final persistence/security re-gate: **READY — P0=0 / P1=0 / P2=0**.
- No migration, persistent-state edit, route removal, manual-capture replay, live Hunt mutation, deploy or public enablement was executed during this review.
- Gate-2 conclusion: **READY FOR HUMAN CLASS-A DECISION** on the eight candidate decisions above.

## Human Owner Class-A acceptance

- Human Owner message: `aprovado`.
- Recorded message timestamp: `2026-10-09T17:50:51Z`.
- The Human Owner accepts the exact eight-decision Class-A compatibility package above.
- Accepted forward authority therefore is:
  - new manual-capture intents remain retired;
  - exact historical command replay is preserved only under the existing key/intent/authority and retention semantics;
  - an already-accepted unexpired H2 command may finish only with its frozen authority;
  - H3 orphan pending opportunities close as audited **skip-equivalent / no-attempt** with zero Ball/capture/XP/reward/checkpoint effects;
  - H4 stale markers close only when immutable result evidence proves the outcome;
  - H5 no-effect terminalization requires exact zero-effect proof under the same command identity, otherwise H7 fail-closed applies;
  - H6 `blocked_existing` history never becomes a retroactive capture opportunity;
  - Class-B implementation must use immutable receipts, hashed dry-run/Plan→Apply drift gates, Player-root serialization and durable rollback guards against both new manual commands and new pending opportunities;
  - the legacy marker/route may be removed only after zero pending state plus exhausted/audited replay horizon and rollback-guard evidence.
- TASK-121 moved from `ACTIVE` to `ACCEPTANCE` when the Class-A decision completed; this separately authorized repository-history handback closes the task lifecycle as `DONE`.
- Canonical `docs/specs/SPEC-026-historical-manual-capture-compatibility.md` is promoted by this separately authorized repository-history handback without changing the accepted task-local contract.
- A future Class-B implementation/migration task is required before any persistent mutation; its ID/branch/worktree are intentionally not allocated here.
- This approval does **not** authorize migration Apply, schema/trigger/guard implementation, replay-route modification/removal, deletion of pending rows, runtime changes, deploy or production action.

## Repository-history handback

- Human Owner continuation message: `Continue the unfinished work using this plan and the brief.`
- Recorded message timestamp: `2026-10-09T17:54:52Z`.
- Scope: promote the accepted TASK-121 Class-A contract into canonical SPEC-026 and close TASK-121 lifecycle in repository history only.
- Explicitly excluded: Class-B implementation task allocation, migration schema/Apply, retirement guard implementation, replay-route modification/removal, pending-row deletion, runtime changes, deploy and production mutation.
- History candidate is isolated from the dirty TASK-121 control worktree so its provisional control-plane state is preserved rather than committed directly.

## Dependencies

- Historical SPEC-015/TASK-038/TASK-098 command behavior.
- APPROVED SPEC-020 management-first supersession.
- TASK-110 forward automatic capture/runtime provenance.

TASK-039 is a downstream compatibility consumer, not a prerequisite for the Class-A migration decision.

## Risks / irreversible actions

- Incorrect migration can spend/restore Items incorrectly, duplicate Pokémon creation or permit rerolls.
- Historical rows/command results must not be destructively rewritten without an accepted compatibility proof.
- No persistent migration, deploy, deletion or public API removal is authorized by TASK-121 completion.

## Expected files / boundaries

- `docs/specs/SPEC-026-historical-manual-capture-compatibility.md`
- Historical fixtures/evidence inventory only after plan acceptance.
- No database migration file until a separate implementation task is authorized.
