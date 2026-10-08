# TASK-125 — PA-M1 Live Gameplay Validation & Exit Gate

## Metadata

- State: DONE
- Class: B
- Owner: Software Developer (ChatGPT prime)
- Owner execution surface: ChatGPT prime
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: independent integrity reviewer for reward/idempotency/account-isolation evidence
- Auditor execution surface: independent ChatGPT delegated reviewer
- Consultants: N/A — this task validates already-approved gameplay/product authority and must not redefine balance, economy, combat or progression rules
- Consultant execution surface(s): N/A
- Specs: APPROVED SPEC-015/020/021/024/027; existing integrated TASK-110/TASK-122 runtime authority
- Dependencies: TASK-039, TASK-041, TASK-100, TASK-103, TASK-110, TASK-122
- Control branch: `test/TASK-125-pa-m1-live-validation-exit-gate`
- Control worktree: `.worktrees/TASK-125-pa-m1-live-validation-exit-gate`
- Source branch: canonical `main@8834ab7` plus only evidence/control-plane changes owned by this task
- Source worktree: canonical root `main`; preserved historical/source worktrees remain untouched

## Objective

Close the remaining **PA-M1 — Core Gameplay Loop Validation** live/manual/visual evidence gaps against the canonical integrated local Pre-alpha baseline, then prepare an evidence-bounded Human Owner exit gate for **PA-M1 → PA-M2**.

This task is a validation/exit-gate task. It may diagnose and propose bounded Class-B corrections when a concrete defect is reproduced, but it must not invent new gameplay authority, silently absorb TASK-120/121, enable public CombatPresentation, add eligible-Moves/Move-editor authority, deploy, or migrate production state.

## Required live validation sequence

1. **Fresh real 2-member Start after captured-Ability correction**
   - Use the existing B saved Team containing the original Cyndaquil plus captured Sunkern Lv3 when still present.
   - Confirm the selected persisted Ability remains on the Pokémon while `inactive-by-policy` does not make the Team inadmissible.
   - Require a fresh authoritative Start result; do not reuse the prior terminal 422 as proof.
2. **Clean Auto-Revive live use**
   - Observe a real eligible KO under a saved Revive policy.
   - Verify one authorized item debit, restored HP, exact continuation/terminal semantics and no fabricated reward.
3. **Prospective policy editing during an active Hunt**
   - Exercise Capture/Potion/Revive edits one at a time while a Hunt is active.
   - Verify prior committed actions remain immutable and new policy versions apply only prospectively.
4. **Minimum Reserve rendered/live state**
   - Confirm owned quantity is visible, equality with owned quantity is accepted, and `reserve > owned` is blocked before Save and by the server.
   - Capture representative rendered evidence for the final state.
5. **Offline/return validation**
   - First exercise a bounded real absence/reopen interval.
   - Then exercise a recorded prolonged return up to the accepted 8h cap without artificial clock changes.
6. **T1–T8 consolidation**
   - Classify every player-guide item as `PASS`, `FALHOU`, `NÃO EXERCITADO` or `LIMITAÇÃO CONHECIDA` from actual evidence.
7. **PA-M1 exit decision packet**
   - If all required PA-M1 gates are satisfied, prepare the Human Owner PA-M1→PA-M2 decision.
   - PA-M2 must not become CURRENT automatically.

## Initial live target

The first action is the **fresh real 2-member Start** because it validates the shortest unresolved end-to-end chain:

`Capture → Collection → Team → Start admission → Battle input`

The prior failure was `422 hunt_not_admissible` when captured Sunkern's persisted Chlorophyll was copied into Battle input despite all current Ability rules being `inactive-by-policy`. TASK-122 corrected the runtime binding and correlation handling, but explicitly left the fresh real two-member retry for Human/live validation.

## Safety / state-preservation rules

- Use only the owned local Pre-alpha environment and loopback endpoints.
- Do not run Reset to make a test convenient.
- Do not regenerate Genetic authority or individualization keys.
- Do not edit database rows to force capture, KO, reward, Revive or offline outcomes.
- Prefer normal UI/API product flows; use database access only for bounded read-only diagnosis/evidence when necessary.
- Preserve exact idempotency/correlation keys for ambiguous or in-progress operations.
- Do not clear browser storage to hide a pending command.
- Do not advance the system clock artificially for offline validation.
- Stop mutating actions and preserve state if duplication, account crossover, disappearing Pokémon/Team, negative Inventory or unresolved synchronization is observed.

## Explicit non-goals / separate gates

- TASK-120 / SPEC-025 durable terminal/offline-summary implementation.
- TASK-121 / SPEC-026 historical manual-capture migration/compatibility implementation.
- TASK-103 public CombatPresentation route enablement or persistent migration.
- TASK-100 eligible-Moves / full Move editor authority.
- Pixi/Visual renderer parity beyond representative PA-M1 validation surfaces.
- Production database, deploy, public URL, Worker/Pages/Hyperdrive production enablement.
- New balance/economy/combat/Genetic/XP/content decisions.

## Acceptance criteria

- [x] Fresh real two-member Start succeeds on the corrected captured-Ability path, with no hidden rewrite of the Pokémon's selected Ability.
- [x] Clean real Auto-Revive use is observed and resource/HP/terminal semantics reconcile exactly.
- [x] Capture, Potion and Revive active-Hunt policy edits are each validated prospectively end to end; all three families have explicit live evidence and none is inferred from another family.
- [x] Minimum Reserve final rendered state is visually evidenced and live/server validation agrees with ownership bounds.
- [x] Real offline/return behavior is validated for a short interval and a prolonged interval up to the accepted 8h cap without artificial time manipulation.
- [x] T1–T8 are individually classified from live/manual evidence.
- [x] No duplicate reward/capture/item debit, account leakage, negative Inventory, checkpoint corruption or soft lock remains in the **exercised** PA-M1 loop, including the completed prolonged-return replay and final Human T8 branch.
- [x] Independent QA/integrity review finds no unresolved P0/P1 in the PA-M1 exit evidence.
- [x] Human Owner explicitly decides PA-M1→PA-M2; milestone state is not auto-promoted by this task.

## Evidence log

### Gate 1 — Fresh real 2-member Start

- Status: `PASS`
- Baseline: canonical `main@8834ab7`, TASK-122 DONE/integrated, PA-M1 CURRENT.
- Prior source evidence: the original two-member Start failed terminal `422 hunt_not_admissible`; the exact runtime/correlation correction is repository-integrated, but no post-fix real two-member Start had been executed.
- Environment provenance: direct TASK-125 worktree startup did not reach listeners because of local dependency-wrapper/startup plumbing; it was stopped without Reset. The preserved TASK-122 execution worktree was then used only after comparing its 48 dirty non-control-plane files to canonical `main@8834ab7`: 47 were byte-identical and the sole mismatch was `docs/qa/PREALPHA_LOCAL_TEST.md` (non-executable documentation). Start/Smoke from that worktree passed with the preserved PostgreSQL volume and Genetic/individualization authority READY.
- Current B state before the gate: no active Hunt; the existing saved Team had become Cyndaquil + captured Rattata, while the original captured Sunkern `01a117c3-c184-70d9-a307-bb57aceba029` with persisted Chlorophyll still existed in Collection.
- To avoid destroying the existing Team, a separate validation Team `01a11c0c-13dd-7184-964d-586ff8c0f948` was created through the normal Player API with Cyndaquil `01a11606-b998-70c3-afc4-5fe40d305aa7` + the original Sunkern. The Team was healed through the normal PokéCenter command before Start.
- Fresh authoritative Start PASS created Hunt `01a11c0c-16e3-74fa-a89f-9b39137bb2af` for `hunt:verdant-edge:wilds` at logical time `0` with Team size `2`.
- Admitted snapshot: Cyndaquil `24/24` HP and Sunkern `15/15` HP. Sunkern still reports persisted `selectedAbilityId=candidate:ability:chlorophyll:e883803e27` through the Player read, while the admitted Hunt member has no Battle `abilityId`, proving the integrated `inactive-by-policy` binding path without rewriting the durable Pokémon Ability.
- No Reset, direct SQL mutation, artificial capture or new gameplay authority was used.

### Gate 2 — Clean Auto-Revive live use

- Status: `PASS`.
- Before the live edit, B owned `4` Revive-25 and the saved Auto-Revive policy was enabled with `minimumReserve=4`, so no Revive spend was eligible. Auto-Potion was also effectively non-spending (`12 owned / reserve 12`); Capture had only one eligible Ball spend (`21 owned / reserve 20`).
- A Revive policy replacement was submitted while Hunt `01a11c0c-16e3-74fa-a89f-9b39137bb2af` was active. The command correctly reconciled the old policy first: Cyndaquil fell KO with no Revive while reserve `4` was still authoritative, then the policy committed as rowVersion `5`, reserve `3`. The Hunt terminalized before the new policy could affect that Hunt, proving no retroactive rewrite.
- The Team was healed and a new two-member Hunt `01a11c10-bbca-75f3-922b-c7fe4712c1d0` started at full HP. A second active-Hunt Revive edit `reserve 3 → 2` completed at `effectiveAt.logicalTimeMs=24030`, rowVersion `6`.
- Real Activity then recorded two authoritative in-Battle Auto-Revives under the saved policy:
  - Cyndaquil: one Revive-25 consumed at logical time `12000`, `appliedHp=6`, `resultingHp=6`.
  - Sunkern: one Revive-25 consumed at logical time `26000`, `appliedHp=3`, `resultingHp=3`.
- Inventory moved from `4` Revive-25 to exactly `2`, matching the final reserve. No third Revive was consumed below reserve. The Hunt later terminalized `no_living`; the Activity retained the exact Revive summaries and consumed-item evidence.

### Gate 3 — Active-Hunt policy editing

- Status: `PASS` — **Capture PASS / Potion PASS / Revive PASS**.
- Revive edit 1 (`4 → 3`) was accepted while a Hunt was active and first reconciled a frozen prelude under the old policy. The old reserve prevented Cyndaquil's first KO from spending a Revive, and the new policy committed only after that authoritative history was sealed.
- Revive edit 2 (`3 → 2`) was submitted immediately after a fresh Start, completed on the same Hunt at `logicalTimeMs=24030`, and subsequent Activity consumed Revives only under the new reserve. This validates prospective application on the same active Hunt.
- Exact command-correlation discipline was preserved. When a direct continuation loop omitted printing one pending key, the key was recovered by read-only inspection of the owned local `hunt_public_commands` row and the exact same payload/key was continued; no fresh intent was substituted.
- Capture was exercised independently on Player A Hunt `01a11c74-1430-7013-b47f-2b5a8635fefb`. Baseline policy `rowVersion=1`, `enabled=true`, reserve `25`, Inventory `34` Balls. Command key `b8a4c720-e41e-4f40-8f24-639710c7db80` froze `targetLogicalTimeMs=43723` and was continued with the exact same key/payload until completion. Six Encounters resolved under the old policy at Hunt times `4000/10000/16000/22000/30000/36000`, each with a Capture attempt and one Ball debit; Encounter 5 also dropped one Ball, so Inventory moved `34 → 29` net. The replacement committed only at `effectiveAt.logicalTimeMs=43723` as policy `01a11c75-8246-7276-b013-911daf241000`, `rowVersion=2`, `enabled=false`. Subsequent wins at `46000/54000/60000/66000` recorded `captureDisposition.kind=disabled` and no Capture-item consumption, directly proving the boundary is prospective and prior committed history was not rewritten.
- Potion was exercised independently rather than inferred from Capture/Revive. First active-Hunt command key `9074221f-f7f4-4f89-8264-81a77f2173a6` requested threshold `70 → 60` and froze target `122789`; the A Hunt terminalized at `66000` during the old-policy prelude, so the policy committed as `rowVersion=3` with `effectiveAt=null`. This is retained as a correct no-retroactivity/terminal-boundary observation, but was not used alone to claim same-Hunt PASS.
- After normal PokéCenter healing and recovery expiry, a fresh A Hunt `01a11c77-00af-7638-b754-5b010bdf7b10` started at logical `0`. Potion command key `78b4e90a-766a-4f46-821a-dc3b351a5e13` changed threshold `60 → 50`, froze target `317`, and completed on the same active Hunt at `effectiveAt.logicalTimeMs=317` as policy `01a11c77-0619-727d-ab3a-8c4ed7a364ae`, `rowVersion=4`; the authoritative Hunt remained active at logical `317` with Bulbasaur `23/25` HP. Player A owned no Basic Potion at this point, so no Potion consumption is asserted or required for this edit-only subgate.
- All A mutations used the normal local product API with A's session/CSRF, `Origin: http://localhost:5173`, explicit idempotency keys and OCC row versions. Player B's prolonged Hunt was not read, reconciled or mutated by this work.

### Gate 4 — Minimum Reserve rendered/live state

- Status: `PASS`.
- Final live state after Auto-Revive: Revive-25 owned quantity `2`, policy rowVersion `6`, `minimumReserve=2`, enabled and allowed.
- Server ownership bound: an attempted replacement with `minimumReserve=3` while only `2` were owned returned terminal HTTP `422`; the persisted policy remained rowVersion `6`, reserve `2`, owned `2`.
- Equality remains valid in the persisted policy (`reserve == owned == 2`) and correctly prevents further automatic Revive spend without requiring the feature to be disabled.
- Representative real rendered evidence captured from `http://localhost:5174/settings/hunt`: `.maintenance/prealpha-local/task125-minimum-reserve-tall.png`. The Auto-Revive section visibly shows `Minimum reserve 2` and `Owned: 2. Maximum reserve: 2.`; Capture and Potion sections likewise display their owned/max bounds.

### Gate 5 — Real offline/return validation

- Status: `PASS`.
- After healing the validation Team, a fresh Hunt `01a11c17-692f-75f5-85a2-395ebc2cc826` started at logical time `0` with Inventory baseline rowVersion `52`, Balls `20`, Potions `12`, Revives `2`, Cyndaquil XP `433` and Sunkern XP `50`.
- The client then performed no Hunt reconciliation for **60 real seconds**. A read-only state check after the interval still showed the same active Hunt at logical time `0`, demonstrating that no hidden client/automatic request advanced it during the absence window.
- Return reconciliation used one newly frozen claim correlation, key `d33e71c5-9067-46bf-95cd-c9c1829ccee9`, with target logical time `89999`. Exact same-key continuations advanced the frozen return until HTTP `200` terminal completion; the Hunt ended `no_living` and returned recovery state plus aggregate effects: Player XP `+6`, Cyndaquil XP `+12`, Sunkern XP `+6`, Poké Ball `+1`, Capture attempts `0`.
- Exact-key replay of the completed return produced the stored effect summary but **no second mutation**: Balls stayed `21 → 21`, Potions `12 → 12`, Revives `2 → 2`, Cyndaquil XP `445 → 445` and Sunkern XP `56 → 56`.
- The short-return evidence proves bounded absence/return and response-loss/replay safety. The prolonged real-time gate was subsequently completed after >8h elapsed without changing the system clock; see **Real prolonged B return — 8h cap / replay evidence** below. That run proves the exact `28,800,000 ms` return cap while separately recording that the Hunt itself terminalized much earlier at logicalTime `52,000 ms` with `no_living`.

### Additional live policy-save evidence — Auto-Potion OFF/ON

- The previously source-tested OFF-null correction was exercised against the real local backend after the Hunt gates.
- Baseline Auto-Potion rowVersion `5`: enabled `true`, threshold `80`, Basic Potion reserve `12`, owned `12`.
- Real Save OFF committed rowVersion `6` with `enabled=false` while retaining `thresholdPercent=80` and the saved item/reserve configuration; Inventory stayed at `12` Potions.
- A second real Save restored ON at rowVersion `7`, still threshold `80`, with Inventory unchanged (`12 → 12`). This closes the known live policy-save gap without manufacturing item consumption.

### T1–T8 consolidation — current PA-M1 evidence

| Test | Classification | Current evidence / remaining limit |
|---|---|---|
| T1 — Baseline before spending | `PASS` | Live Collection/Team/Inventory reads were used before mutation; original Cyndaquil identity was preserved, the captured Sunkern remained owner-scoped with Chlorophyll, and no Bootstrap/Reset/regrant occurred. |
| T2 — Start and observe Hunt without manual gameplay | `PASS` | Multiple fresh real Wilds Starts, authoritative logical-time progression, resolved Activity, XP/reward/capture facts and terminal `no_living` were observed. No manual attack/capture/Potion/Checkpoint/Claim product control was introduced. |
| T3 — Retreat, recovery and PokéCenter | `PASS` using integrated prior live evidence + current bounded confirmation | Canonical TASK-122 already records Human-exercised live Retreat recovery with no remaining observability issue for that path. TASK-125 independently revalidated real PokéCenter healing and recovery anchors; its Retreat command converged to already-dominant `no_living`, confirming tie/convergence semantics but **not** being misrepresented as a new voluntary `retreat` terminal outcome. |
| T4 — Automation policies | `PASS` | Automatic Capture attempts/success occurred in real Activity; two real Auto-Revives were observed with exact debit/HP evidence; Auto-Potion OFF→ON preserved saved configuration; and Capture/Potion/Revive active-Hunt edits are now independently live-validated with explicit effective boundaries. Capture ON→OFF became effective at `43723` and later victories were `disabled`; Potion `60→50` became effective on the fresh active Hunt at `317`. |
| T5 — Progress, Capture and Team | `PASS` | XP/resource effects were reconciled from real Hunts; capture success was recorded in Activity; the previously captured Sunkern was placed into a separate saved Team and successfully admitted to a fresh two-member Hunt after the Ability fix. Exact return replay produced no duplicate XP/items. |
| T6 — Reload/absence/offline return | `PASS` | A 60-second real absence already proved bounded return + replay. The real prolonged B return was then executed after >8h elapsed: the first accepted claim froze the exact cap target `28,800,000 ms`; the Hunt terminalized earlier at logicalTime `52,000 ms` with terminal reason `no_living`, so the cap was proven without misrepresenting that B actually survived for 8h of productive simulation. Exact-key replay returned the same terminal result with zero duplicate XP/items/Activity. |
| T7 — A/B isolation | `PASS` | Fresh negative read: A requesting B's captured Sunkern returned `404`; A Collection does not contain the B Sunkern while B does. A/B Inventory roots and quantities remained distinct after B-only mutations. |
| T8 — Basic usability/accessibility | `PASS` | Initial Human testing found real Settings/sync/Save defects, which were corrected and re-gated. Final Human Owner retest explicitly approved the representative mouse path, Tab/Enter activation, zoom 125%/150%, Save feedback, reachability/legibility and corrected management flow; Catch Rate remains absent and healthy Save exposes no internal Continue/Reconcile flow. |

No PA-M2 promotion follows from this table. The remaining material PA-M1 exit blockers are final independent exit-evidence QA/integrity review and the Human Owner milestone decision.

### T8 Human execution / correction retest

- Initial Human execution reproduced a blocking defect, so T8 was held at `FALHOU — correção candidata em reteste` while the corrections below were implemented and revalidated.
- Reproduced symptom: Hunt Settings surfaced `Pending Hunt command` / automatic synchronization and disabled policy Save actions while an active-Hunt `sync` correlation existed. This contradicted the accepted rule that Capture/Potion/Revive policies remain editable during an active Hunt.
- Root cause: `apps/web/src/hunt-command-store.ts` used one durable `sessionStorage` lane for progression/sync commands and policy commands, while `apps/web/src/hunt-settings.tsx` disabled Save whenever any pending command existed.
- Candidate correction: keep the existing progression lane (including the currently frozen sync key) and add a distinct policy-only correlation lane for Capture/Potion/Revive. A pending `sync` is informational in Settings and no longer disables policy Save. One unresolved policy command still serializes later policy saves; pending Start/Retreat/PokéCenter, foreign-player storage and unreadable storage remain fail-closed. Legacy policy correlations already stored in the original lane remain recoverable before any new policy correlation is accepted.
- Replay/OCC invariant: policy intent/key is frozen in its own lane before transmission; Settings never clears or overwrites the pending sync key. If policy advancement later supersedes that older sync target, the existing Active Hunt path still requires authoritative Hunt+Activity reread before clearing the exact superseded sync correlation.
- Candidate source validation: web `159/159 PASS`; typecheck PASS; lint PASS; `git diff --check` PASS. Independent read-only architecture review: `P0=0 / P1=0 / P2=0` conditional on the implemented lane/isolation invariants, which are covered by the added tests.
- Live candidate handoff: only Player A web frontend on `localhost:5173` was replaced with TASK-125 candidate bytes; Player B web on `5174`, API, game-data, database and the B 8h Hunt were not mutated by this correction. `5173` was verified to serve the corrected Hunt Settings source for Player A.
- Human retest then exposed a second UX defect: after Save was correctly allowed during active Hunt, a policy `202 in_progress` still surfaced a manual `Continue exact saved policy command` / `Reconcile and discard policy correlation` recovery flow. The same screen also rendered a duplicate policy-continue button inside the informational pending-sync card. This is **not** accepted as a Pre-alpha-only product limitation: normal policy Save and automatic Hunt synchronization are internal reconciliation and must not require a player-operated recovery step.
- Second candidate correction: an in-progress policy command now replays its **exact saved key and payload automatically** until completion or a genuine nonterminal error pause. While a policy command is pending, its lane remains the sole policy lane and no new policy intent is accepted. Manual Retry/Reconcile controls are shown only after automatic continuation pauses on an error.
- Settings now also owns safe continuation of an older pending `sync` after the policy lane is clear. It reuses the exact saved sync intent/key; on `409 command_superseded` / `hunt_not_active` or terminal `404/410`, it rereads authoritative **Hunt + Activity** before clearing that exact sync key. If either reread fails, the key remains durable and the automatic flow pauses fail-closed.
- The Player A reproduction itself confirmed the expected server-side ordering: sync key `2859a3db-ace6-49bf-aa35-3a40e579d3f8` reached terminal `409` after policy advancement, while Capture-policy key `a858a502-9fb3-4dd2-8a08-614706fd8023` reached terminal `200`; no new key was substituted for either command. The UI candidate then added automatic cleanup/recovery semantics over those same server results.
- Exact-current validation after this second correction: web `161/161 PASS`; build/typecheck PASS; lint PASS; `git diff --check` PASS. Final independent re-gate of this automatic-continuation delta is pending before T8 can be reclassified.
- Independent exact-current re-gate of the automatic-continuation delta is now clean: QA/technical review `READY P0=0 / P1=0 / P2=0`; integrity/replay review `READY P0=0 / P1=0 / P2=0`. Both reviews confirmed same-key/same-payload policy continuation, policy-before-sync ordering, exact sync replay, authoritative Hunt+Activity reread before clearing superseded sync, and fail-closed key preservation when reread fails. Remaining recommendations are test-strengthening only (fake-timer/browser lifecycle and multi-tab races), not blockers for this bounded correction.
- A further Human UX retest showed that the healthy automatic path still produced an undesirable full Settings remount on the **first** policy `202`: `run()` called `onCommitted()`, the snapshot reloaded, and a large `Pending policy command` card appeared while normal continuation was already in progress. This was a presentation/lifecycle defect, not a server-authority requirement.
- Third candidate correction: a Save now remains inside one continuous client operation. The frozen policy key/payload is reused through every `202` until terminal completion, with the Save remaining busy and **no intermediate `onCommitted()` / snapshot remount**. Only after `200` does the client clear the exact policy key and perform one authoritative reload. If the page reloads/navigates mid-flight, the durable policy lane still resumes the exact saved command automatically.
- Healthy auto-running `sync` / policy correlations no longer render the large recovery cards. Those cards, Retry and Reconcile remain reserved for an actual paused/error state. A real nonterminal error preserves the frozen key and sets the pause state in `HuntSettingsPage`, so the pause survives the authoritative reread/remount instead of immediately retrying in a loop.
- First independent review of the stable-Save lifecycle found `P1=1`: the new in-component `202` loop had no unmount cancellation, so navigating away could leave a stale loop issuing same-key continuation requests while a remounted Settings instance started a second loop. Server idempotency protected business mutation, but the client lifecycle/race was not acceptable.
- P1 correction: policy mutation transport now accepts an `AbortSignal`; each mounted Hunt Settings editor owns a lifecycle `AbortController`; the loop checks that signal before/after each request and during the retry wait; unmount aborts the in-flight fetch when possible and prevents any later POST from the stale loop. Abort never clears the durable policy correlation and never calls `onCommitted`, so the next mounted instance resumes the same frozen key/payload. Sync and manual reconciliation reads use the same lifecycle signal.
- Follow-up lifecycle review then found two narrower issues: an abort listener was retained after each successful 100ms wait, and an unmount could land in the handoff between a terminal response/reread and local correlation `clear()`. Both are now corrected: each retry removes its abort listener on timer resolution or abort, and `HuntCommandStore.clear` / `discardAfterReconciliation` are themselves abort-aware with guards before/after identity inspection and before synchronous removal. Settings also checks lifecycle state around clears and suppresses `busy`/UI state writes after abort.
- Exact-current validation after the full lifecycle correction: web `165/165 PASS`; build/typecheck PASS; lint PASS; `git diff --check` PASS. Regression coverage now includes `202 → 202 → 200`, abort during retry wait (one request only), abort immediately after the final policy response, and an already-aborted exact correlation clear preserving the frozen key.
- Final independent re-gate of this stable-Save lifecycle delta is clean: QA/technical `READY P0=0 / P1=0 / P2=0`; integrity/replay `READY P0=0 / P1=0 / P2=0`. Reviewers confirmed abort listener cleanup, no post-unmount continuation POST, abort-aware exact-key clear/discard, same-key/same-payload replay after remount, no post-unmount `onCommitted`/busy mutation, and unchanged sync reread-before-clear semantics.
- Player A `localhost:5173` was verified to serve the exact stable-Save source and abort-aware command-store implementation. This remains a candidate/live-local handoff only; Player B `5174`, API authority, database and the prolonged 8h B Hunt remain outside this UI retest.
- Human follow-up identified two additional product concerns in the same Settings flow: routine policy Save still took too long, and Capture exposed `Catch rate min/max` although catch rate is not a player-visible management value.
- Save-latency root cause: policy replacement must preserve prospective semantics by reconciling elapsed active-Hunt time under the **old** policy up to one frozen server-time target before the new version can become effective. The previous implementation invoked `progressFrozenHuntPreludeOneStep` only once per HTTP request, so every Encounter/automation/activity/projection boundary could surface another `202` and force another browser round-trip. Skipping that prelude or applying the new policy at the lagged checkpoint was rejected because it would retroactively affect already-elapsed combat/RNG/item/capture history.
- Performance correction: only Capture/Potion/Revive policy replacement now uses a bounded server-internal policy prelude. Each request runs the unchanged authoritative one-step reconciler for at most **8 steps** and at most **250 ms wall time**, returning the normal same-key `202` if either budget is exhausted. The frozen target, command key/intent, OCC, pending-return join, Inventory/automation ordering, presentation projection budgets and final `effectiveAt` binding remain unchanged; manual Capture/checkpoint/claim/Retreat paths are not batched by this delta.
- Performance evidence: the full existing Hunt PostgreSQL file passed `53/53` after the batching source change; targeted prospective Potion, concurrent frozen-advance Potion and the new active-Hunt Capture batching regression all PASS on disposable PostgreSQL. With the 250 ms request budget, the representative short active-Hunt Capture and Potion edits each settle in **no more than 2 application calls**, replacing the long chains of one-boundary-per-request `202` observed live. The concurrent prospective case remains bounded at `<=8` calls in its intentionally blocked/racing fixture.
- Capture criteria correction: `Catch rate min` / `Catch rate max` controls are removed from Hunt Settings and new Capture rules never create those fields. Existing historical rule payloads remain readable by the API/protocol for compatibility, but `captureRuleForSettings` intentionally strips those obsolete non-player-visible bounds when a rule enters the editable Settings model, so the next explicit user Save removes them rather than preserving an invisible restriction.
- A neutral compatibility notice is shown only if a historical saved rule actually contains one of those removed legacy criteria; the values themselves are never exposed. The current live Player A policy was read-only checked and has `ruleCount=1`, `legacyCatchRateFields=0`, so this migration warning does not apply to the current validation account. `catch rate` was also removed from the Active Hunt Encounter card; catch probability remains an internal capture-rule input only.
- Independent review of the batch + Capture-UI delta was clean after adding the 250 ms cooperative request budget and the neutral legacy-condition notice: QA/integrity `P0=0 / P1=0 / P2=0`. The budget is cooperative between authoritative steps; one unusually slow individual step can exceed 250 ms, so this is a runtime bound target rather than a hard wall-clock guarantee.
- Live A-only benchmark was then run against a TASK-125 candidate API isolated on `127.0.0.1:18787`, with only Player A web `5173` pointed at it. Player B `5174` remained on the original API `8787`, so the real B 8h Hunt was not contacted by this benchmark. A semantically identical Potion Save froze target `1678283` while the committed Hunt checkpoint was only around `24000`; after 20 calls / ~9.9s it was still `202`, proving batching alone cannot make a routine Save fast when the client has allowed ~27.5 minutes of active-Hunt backlog to accumulate.
- That benchmark command was preserved exactly rather than abandoned: policy key `23c00121-c239-49ca-810c-85d294627a2e` was recovered and continued with the exact same payload until terminal `200`; the Hunt terminalized first, so Potion policy `rowVersion 4→5` committed with `effectiveAt=null`. No replacement intent/key was created.
- A direct “future-effective policy” shortcut was investigated and explicitly rejected after independent architecture/integrity review. Although the DB interval tables can store future effective times, the current simulation does not have a mandatory policy-transition fence at that timestamp; rapid edits can also collide on the same `(hunt_id,effective_logical_time_ms)` interval. Applying this shortcut without new Class-A authority could cross old/new policy history incorrectly. This TASK-125 therefore keeps the existing prospective prelude semantics.
- Root product cause was moved to the client lifecycle instead: automatic Hunt synchronization previously lived only in `ActiveHuntPage`. While the player browsed Pokémon, Teams, Inventory or Settings, no online checkpoint was maintained, so a later policy Save inherited the entire elapsed backlog. A new `HuntSyncCoordinator` is now mounted once in the authenticated shell and owns synchronization on every route **except** `hunt-active`; `ActiveHuntPage` remains the sole owner on its own route. Hunt Settings no longer owns or continues sync, eliminating dual progression authority.
- Coordinator invariants: visible-tab only; cold load on a non-Active route requests one `return`, then `online` checkpoints target a ~2s cadence; visibility/online transitions request Return semantics; a foreground route handoff from an app that started on Active Hunt stays online rather than creating an artificial Return. The policy lane is inspected first and any pending policy blocks sync; the main lane accepts only none/exact saved sync. The policy lane is rechecked immediately before a new sync key is frozen. `202` always replays the exact saved key/mode; normal completion and `409 command_superseded` / `hunt_not_active` / `404` / `410` reread authoritative Hunt + Activity before abort-aware exact-key clear; other errors pause and preserve the correlation for Retry. Route handoff/unmount aborts in-flight work without clearing the key so the next sole owner resumes it.
- One headless A-only smoke already proved the coordinator can advance/terminalize a Hunt while the browser stays on `Hunt Settings`, without opening Active Hunt. Earlier A-only manual benchmark with a recent completed checkpoint reduced an identical Potion Save to `200` in ~2.23s (`5` calls, `rowVersion 5→6`) versus the unbounded-backlog case above. A later attempted floor benchmark created checkpoint key `0b91aa67-fe3b-474f-b706-c6977b522c95`; the key was recovered read-only and continued exactly until terminal `200`, leaving A clean rather than discarding the command.
- The first exact-current independent coordinator review found two real P1 lifecycle gaps before Human retest: the shell returned early on `activeHunt=null` before inspecting a persisted sync correlation, which could orphan an exact key after terminalization; and `ActiveHuntPage` did not inspect the policy-only lane before automatic sync. Both were corrected before further live validation.
- Terminal/stale correlation correction: the shell now inspects policy + main correlation lanes before deciding there is no work. A saved sync is replayed with its exact stored Hunt ID/mode/key even when the current state has no active Hunt (or a different active Hunt), and the key is cleared only after the exact replay/terminal result plus authoritative Hunt + Activity reread. Reread failure pauses and preserves the correlation.
- Cross-lane priority correction: both shell and Active-Hunt owners inspect the policy lane before sync and recheck it immediately before transmission. A healthy pending policy defers automatic sync rather than allowing the client to overtake the policy operation. Server ordering is also authoritative: `loadPendingHuntAdvanceCommands` includes `checkpoint`, `claim`, `retreat` and `policy_replace` under the Player-root lock, so policy freeze joins an already-frozen advance target and a later advance joins an already-frozen policy target.
- PostgreSQL regression now covers **both** interleavings: the existing concurrent test proves `sync frozen first → policy joins/prospective`, and a new test proves `policy frozen first → sync joins the identical target`. The targeted new regression PASSed, then the full disposable PostgreSQL Hunt application file PASSed **55/55** with the owned container removed afterward.
- Exact-current web validation after these fixes: **171/171 PASS**, build/typecheck PASS, lint PASS, `git diff --check` PASS. Independent exact-current re-gate: integrity `READY P0=0 / P1=0 / P2=0`; QA/UX `READY P0=0 / P1=0 / P2=1`. The sole QA P2 is a test-strengthening gap for mounted effect/route lifecycle orchestration (terminal stale-key failure preservation, visibility/online, and route handoff), not a concrete remaining source defect. T8 still requires the Human mouse/keyboard/zoom retest and is not promoted by these automated results.
- Human retest after that re-gate found a new frontend P1 before any server policy acceptance: Auto-Catch stayed permanently on `Saving…` with Hunt active or inactive. Read-only DB evidence showed no new Player A `policy_replace` row after the click, while the candidate API and A session remained responsive, proving this was not policy-prelude backlog.
- Root cause: the local app runs under React `StrictMode`. `HuntPolicyEditors` created a render-lifetime `AbortController` through `useMemo` and its effect cleanup aborted that same controller. StrictMode development setup→cleanup→setup therefore left the reused signal permanently aborted. Save then set parent-owned `busy=true`, failed before the first policy POST on the already-aborted signal, and deliberately skipped `setBusy(false)` because the signal was aborted; the parent `busy` state could also survive a keyed editor remount.
- Correction: each effect setup now installs a fresh lifecycle `AbortController` generation and cleanup aborts only that generation. Every policy operation captures the currently active generation signal before setting busy. `busy` ownership moved into the keyed `HuntPolicyEditors` component, so an intentional remount cannot retain a stale `Saving…` state. Abort still preserves any already-frozen exact policy correlation and never clears/replaces the key.
- Regression coverage now simulates StrictMode setup→cleanup→setup and proves the second lifecycle generation is non-aborted. Exact-current web validation after this correction: **172/172 PASS**, build/typecheck PASS, lint PASS, `git diff --check` PASS; `localhost:5173` was verified to serve the new lifecycle generation code and no longer serves the memoized AbortController pattern. Human Save retest remains required before T8 can be reclassified.
- Independent exact-current re-gate of the StrictMode fix: integrity `READY P0=0 / P1=0 / P2=0`; QA `READY P0=0 / P1=0 / P2=1`. The QA P2 is limited to missing mounted React StrictMode/keyed-remount UI coverage; no remaining P1 source defect was identified. Human browser retest is still authoritative for the actual Save button recovery.
- Human Save retest after the StrictMode correction confirmed the infinite `Saving…` lock was closed, but exposed a remaining latency difference: Auto-Catch Save took about **6s with an active Hunt** and about **1s without an active Hunt**.
- Read-only timing evidence for the active Save: Capture-policy key `7ccff23a-6f49-481c-a673-741f73824c3a` was accepted at `2026-10-08T21:01:52.611Z` and terminal `200` at `21:01:57.082Z` (~4.47s server-side). It froze target `9580`; the most recent completed online checkpoint had target `2715`, leaving roughly **6.9s of committed-Hunt backlog** for the policy prelude. This matches the product symptom rather than a storage/UI delay.
- The first performance attempt tried broad bounded internal batching for ordinary online `checkpoint`. Full PostgreSQL validation rejected it: **5/55 tests failed** because one HTTP request crossed externally meaningful Encounter/automation/healing/rollback boundaries and could surface later authority failures/effects where the prior API contract had returned `202`. That implementation was narrowed rather than normalizing the failures.
- Final safe checkpoint batching only repeats `progressOneStep` inside one HTTP request when the persisted stop reason is exactly `projectionBudget`. Encounter, automation, activity, healing, incomplete-Encounter and blocker boundaries still return externally as `202`; all non-202 results stop immediately. `claim`/Return and `retreat` remain one-step-per-request, so the real B 8h path is unchanged.
- Policy-save throughput was tuned independently without changing prospective authority: policy prelude budget moved from `8 steps / 250ms` to `16 steps / 500ms`, and the client same-key continuation delay from `100ms` to `25ms`. A disposable PostgreSQL regression reproducing about **7s Hunt lag** improved from **4 application requests to 2** while preserving the same frozen policy target/key semantics.
- The non-Active shell coordinator cadence was reduced from `5s` to `2s`, with same-key continuation delay `100ms → 25ms`, to prevent routine management browsing from recreating a multi-second backlog before a policy edit. This increases background request frequency and is therefore an operational metric to watch, not a gameplay-authority change.
- Final exact-current gates for this performance candidate: web **172/172 PASS**, API **295/295 PASS**, build/typecheck/lint and `git diff --check` PASS; full disposable Hunt PostgreSQL **56/56 PASS** including the new ~7s policy-lag regression. Independent integrity re-gate: `READY P0=0 / P1=0 / P2=0`. Independent QA/performance re-gate: `READY P0=0 / P1=0`, with P2 operational observations only (2s polling/request pressure, cooperative wall budgets, and need for Human real-latency confirmation). Human active-Hunt Save retest remains required before T8 can advance.
- Human active-Hunt performance retest after the final bounded candidate measured about **3s perceived Save latency**, down from ~6s before the correction. Read-only DB timing confirms the two most recent active Capture policy replacements settled in **1.702s** (`fedd1103-0827-49d0-9671-1e0bc2efe859`, target `5623`) and **1.636s** (`43c2d43b-f5c0-4f3d-9fae-8f1b6f2b8780`, target `10452`), both terminal `200`. The immediately preceding no-Hunt Capture Save settled server-side in **0.050s**. The remaining ~1–1.5s perceived overhead is client/network/reload plus the real prospective simulation work rather than stale backlog or manual reconciliation.
- The active-Hunt policy latency gate is therefore accepted for PA-M1 at this bounded candidate: infinite `Saving…` is closed, active Save is no longer tens of seconds/minutes, normal flow requires no manual Continue/Reconcile, and the measured active path is ~3s end to end. Further optimization is deferred unless later evidence shows a new regression; reducing it further would require attacking the underlying simulation/checkpoint cost and must not weaken prospective semantics or exactly-once behavior.
- Final Human T8 retest was explicitly approved by the Human Owner on `2026-10-08` after the lifecycle, coordinator and performance corrections above. T8 is now `PASS`: representative mouse use, Tab/Enter activation and zoom `125%` / `150%` were accepted with no remaining Human-reported reachability, focus, legibility, horizontal-layout, Save-feedback, Catch Rate or healthy-path reconciliation issue. This Human approval supersedes the earlier failed/retest classification; automated/headless evidence was not used to manufacture the PASS.

### Real prolonged B return — 8h cap / replay evidence

- Player B Hunt remained untouched before the due boundary: Hunt `01a11c1e-f5df-71f8-8e28-e04aff70f1f0`, start `2026-10-08T15:25:53.284Z`, baseline observation `2026-10-08T15:25:53.6662538Z`, logicalTime `0`.
- First post-due read at `2026-10-08T23:29:17.5552171Z` measured **29,003,888 ms (~8.0566h)** elapsed. Pre-claim state still matched the original baseline exactly: Inventory `rowVersion 53`, Balls `21`, Potions `12`, Revives `2`; Cyndaquil XP `445`; Sunkern XP `56`; active Hunt ID unchanged and logicalTime still `0`.
- One claim correlation was frozen for the whole operation: `73607f3e-7a16-47c6-9db4-b474c056e30f`. The first transport attempt was rejected `403` by exact-Origin protection before Hunt application acceptance; a read-only DB check confirmed no command row existed. The same key was then reused with the correct allowed Origin; **no replacement claim key was generated**.
- The first accepted `202` returned targetLogicalTimeMs **`28,800,000` exactly**, proving the 8h cap under a real >8h elapsed return. Every continuation reused the same key/payload. The command reached terminal `200` after 79 application calls / ~19.2s client loop; DB records the one command as terminal with target `28,800,000` and no duplicate command identity.
- The Hunt itself did **not** survive to the 8h cutoff: persisted terminal reason is `no_living`, terminal checkpoint logicalTime is **`52,000 ms`**, and terminal wall time is `2026-10-08T23:30:32.49758Z`. This explicitly distinguishes **8h return-cap freezing** from **productive Hunt duration**; the product correctly stopped simulation at the earlier terminal condition.
- Claim effects were Player XP `+18`, Pokémon XP `+48` Cyndaquil / `+6` Sunkern, and one successful automatic Capture using one Poké Ball. Post-claim authoritative state: Inventory `rowVersion 54`, Balls `20`, Potions `12`, Revives `2`; Cyndaquil XP `493`; Sunkern XP `62`; Activity has 4 immutable resolved Encounter records and no next page.
- Exact replay of the same completed claim key returned `200` with the same result body. Post-replay Inventory stayed `rowVersion 54` at `20/12/2`, Cyndaquil stayed `493 XP`, Sunkern stayed `62 XP`, Activity stayed at 4 records, and Hunt state stayed terminal/recovery. **No duplicate item debit, XP, capture or Activity record occurred.**

### Interim independent re-gate — pre-8h package

- QA reviewer: `READY`, `P0=0 / P1=0 / P2=0` for the pre-8h snapshot that existed at review time. The prior wording concern was closed: T3 uses integrated TASK-122 live Retreat/recovery evidence and explicitly distinguishes the TASK-125 `no_living` convergence. At that review snapshot Capture/Potion active-Hunt edits were still `NEEDS_RUN`; the later Player A evidence above closes those execution gaps and therefore requires inclusion in the final re-gate.
- Integrity reviewer: `READY`, `P0=0 / P1=0 / P2=0` for the bounded exercised loop available at review time. The checked no-duplicate/leak/negative/checkpoint/soft-lock criterion was supportable only for then-exercised paths. The subsequent A-only policy-edit delta introduced no observed crossover/negative inventory and left B untouched, but the final integrity judgment remains intentionally open.
- This was an **interim** re-gate, not the final exit-evidence review. At that snapshot the acceptance criterion remained open pending 8h + Human T8 evidence; the final re-gate below closes it.

### Final independent PA-M1 exit re-gate

- Final QA reviewer: `READY`, `P0=0 / P1=0 / P2=1`. The only P2 was documentation consistency: stale pre-8h/T8 checklist/status text and misplaced T8 procedural bullets. No product/runtime blocker was found. QA explicitly accepted the wording that the B run proves a real **>8h elapsed return + exact 28,800,000 ms cap**, not 8h of productive Hunt survival; the Hunt died at logicalTime `52,000 ms`.
- Final integrity reviewer: `READY`, `P0=0 / P1=0 / P2=1`. The only P2 was the same documentation housekeeping. The reviewer confirmed the one B claim key remained stable across the pre-accept `403` transport rejection, accepted `202` continuations and terminal `200`; exact completed-key replay produced no duplicate Inventory, XP, capture or Activity effects. No account crossover, negative Inventory, checkpoint corruption or replay violation was found in the exercised PA-M1 loop.
- The documentation P2s identified by both reviewers are corrected in this exact-current task file. `git diff --check`, `roadmap:check` and `portfolio:check-local` pass after the evidence update.
- The independent-review acceptance criterion is now closed.

### Human transition decision

**Human Owner decision: ACCEPT PA-M1 → PA-M2**, explicitly authorized on `2026-10-08T23:38:19Z` by the instruction to proceed with the recommended option after the complete PA-M1 exit packet was presented.

Consequences of the accepted transition:

1. `PA-M1 — Core Gameplay Loop Validation` is complete and no longer the current local-validation milestone.
2. `PA-M2 — Closed Local Alpha (1–2 Players)` becomes the current milestone.
3. `PA-M3 — Stability Validation` becomes the next local-validation milestone.
4. TASK-125 reached `ACCEPTANCE` after the live/manual/evidence gates and Human milestone decision closed; repository-history handback was then separately authorized and completed.
5. This decision does **not** authorize commit, push, merge, deploy, production migration, public CombatPresentation, TASK-120/121 implementation, eligible-Moves/Move-editor authority or any other deferred capability.
6. PA-M2 must reuse the accepted runtime/evidence baseline rather than reinterpret the PA-M1 results; new defects or scope changes return through their normal task/governance gates.

## Completion rule

TASK-125 is `DONE`: the required PA-M1 live evidence is explicit, independently reviewed, the Human Owner accepted PA-M1→PA-M2, and the separately authorized repository-history handback is complete.

### Repository-history handback

- Human Owner separately authorized commit/push/merge after accepting the PA-M1→PA-M2 transition.
- Candidate commit: `2e816f3` (`fix(prealpha): close PA-M1 live validation`) on `test/TASK-125-pa-m1-live-validation-exit-gate`, pushed to `origin`.
- Canonical merge: `35c468f` (`merge: close TASK-125 PA-M1 exit gate`) merged the accepted candidate into `main` and was pushed to `origin/main`.
- This final lifecycle handback marks TASK-125 DONE without authorizing deploy, public enablement, production migration or any deferred gameplay capability.
