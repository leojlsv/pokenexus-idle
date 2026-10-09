# TASK-127 — PA-M3 Stability Validation & Exit Gate

## Metadata

- State: ACCEPTANCE
- Class: B
- Owner: Software Developer (ChatGPT prime)
- Owner execution surface: ChatGPT prime
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: independent integrity/replay reviewer for persistence, restart recovery and idempotency evidence
- Auditor execution surface: independent ChatGPT delegated reviewer
- Consultants: N/A — this task validates already-approved local Pre-alpha runtime behavior and must not redefine gameplay, economy, combat, XP, Genetics or content
- Consultant execution surface(s): N/A
- Specs: APPROVED SPEC-015/020/021/024/027; integrated TASK-037/038/041/107/108/110/122/125/126 authority
- Dependencies: TASK-037, TASK-038, TASK-041, TASK-107, TASK-108, TASK-110, TASK-122, TASK-126
- Control branch: `test/TASK-127-pa-m3-stability-validation-exit-gate`
- Control worktree: `.worktrees/TASK-127-pa-m3-stability-validation-exit-gate`
- Source baseline: canonical `main@9277fc4`
- Source worktree: canonical root `main`; existing historical/source worktrees remain untouched

## Objective

Validate **PA-M3 — Stability Validation** against the canonical PA-M2-complete baseline by exercising sustained local gameplay, restart/recovery boundaries, persistence, checkpoint durability, logout/reconnect behavior and extended Hunt continuity without duplicating or losing authoritative state.

Prepare an evidence-bounded Human Owner exit gate for **PA-M3 → PA-M4**. PA-M4 must not become CURRENT automatically.

This is a validation/exit-gate task. It may diagnose and propose bounded Class-B corrections only when a concrete defect is reproduced. It must not absorb PA-M4 balance tuning, TASK-120/121, public CombatPresentation enablement, eligible-Moves/Move-editor authority, production deployment/migration or new gameplay rules.

## Required live validation matrix

1. **Read-only persistence baseline**
   - Confirm canonical source/runtime topology, Player identity and persisted Hunt/Inventory/XP/policy/checkpoint state before new PA-M3 mutations.
   - Record any already-pending command/recovery state so later restart evidence cannot be confused with inherited state.
2. **Sustained online session / extended Hunt continuity**
   - Run a real local session through multiple natural Encounter/checkpoint cycles over a sustained wall-clock interval.
   - Preserve exact Hunt IDs, command keys, logical times, Inventory/XP and Activity evidence across the interval.
   - Record actual observed duration; this gate does not invent a production SLA.
3. **In-flight checkpoint durability across API restart**
   - Freeze one exact checkpoint correlation and payload, obtain an in-progress/ambiguous state where applicable, restart only the local API process, and resume the **same key/payload**.
   - Verify the command converges once, without a replacement correlation, duplicated rewards/items/capture/Activity or checkpoint rollback.
4. **Quiescent persistence across service/database restart**
   - At a mutation-free boundary, restart the relevant local web/API service(s) and the preserved local PostgreSQL container in a controlled sequence.
   - Verify persisted Player/Hunt/Inventory/XP/policy/recovery state returns unchanged before new progression resumes.
5. **Offline / return / reconnect stability**
   - Exercise a real bounded offline/return interval and reconnect against the restarted runtime.
   - Verify frozen target/correlation semantics, recovery anchors and replay behavior remain consistent; do not repeat the already-proven PA-M1 8h-cap gate unless new evidence requires it.
6. **Logout / browser-session recovery sanity**
   - Human Owner verifies a real browser logout/reconnect or equivalent session recovery returns to the correct Player state without stale identity, lost Hunt state or crossed sync feedback.
   - Browser/session UX evidence remains distinct from proxy/process restart evidence.
7. **Extended terminal/recovery/next-Hunt continuity**
   - Observe at least one natural Hunt terminal/recovery boundary and subsequent legitimate continuation/start under the preserved runtime.
   - Verify no terminal replay, recovery bypass, duplicate reward/capture/item debit or orphaned checkpoint appears after restart/reconnect.
8. **PA-M3 exit packet**
   - Consolidate PASS/FAIL/NOT EXERCISED/KNOWN LIMITATION evidence.
   - Require independent QA + integrity/replay review with no unresolved P0/P1; any P2 must be explicitly classified.
   - Human Owner explicitly chooses Accept PA-M3→PA-M4 or Hold PA-M3.

## Initial target

The first gate is a **read-only persistence baseline** from canonical `main@9277fc4`. Before any new restart or gameplay mutation, establish the exact preserved local topology and authoritative persisted state. No previous PA-M2 evidence is rerun merely for repetition.

## Safety / state-preservation rules

- Use only the owned local Pre-alpha environment and loopback endpoints.
- Do not run Reset to simplify stability tests.
- Do not regenerate Genetic authority or individualization keys.
- Do not edit database rows to manufacture restart, offline, reward, KO, recovery or persistence outcomes.
- Database access is read-only diagnosis/evidence except normal application writes.
- Preserve exact idempotency/correlation keys and payloads for every 202, ambiguous or in-progress command.
- Never replace a pending key merely because a process was restarted.
- Do not clear browser storage to hide or bypass pending commands.
- Do not alter the system clock.
- Perform PostgreSQL/container restart only at an explicitly quiescent boundary; in-flight durability is tested by API restart separately.
- Stop mutating actions immediately if duplicated reward/capture/item debit, disappearing entities, negative Inventory, checkpoint regression, corrupted recovery state, identity crossover or unresolved synchronization appears.
- Preserve `.maintenance` evidence and existing worktrees; do not clean/reset unrelated state.

## Explicit non-goals / separate gates

- PA-M4 economy/progression/encounter balance changes.
- TASK-120 / SPEC-025 durable terminal/offline-summary implementation.
- TASK-121 / SPEC-026 historical manual-capture compatibility/migration.
- TASK-103 public CombatPresentation route enablement or persistent migration.
- TASK-100 eligible-Moves / full Move editor authority.
- Production database, deploy, public URL, Worker/Pages/Hyperdrive production enablement.
- New balance/economy/combat/Genetic/XP/content decisions.
- Broad load/stress/SLA qualification beyond the stability evidence required here.
- Reopening PA-M2 account-isolation gates unless a PA-M3 regression reproduces a crossover/integrity defect.

## Acceptance criteria

- [x] Exact PA-M3 read-only persistence baseline recorded before new mutations.
- [x] Sustained real session / extended Hunt continuity completes without state drift or checkpoint corruption.
- [x] An in-flight checkpoint survives local API restart and resumes with the exact same key/payload exactly once.
- [x] Quiescent service + PostgreSQL restart preserves authoritative Player/Hunt/Inventory/XP/policy/recovery state.
- [x] Offline/return/reconnect remains durable and replay-safe after restart without re-proving unrelated 8h semantics.
- [x] Human browser/session recovery sanity is explicitly approved.
- [x] Natural terminal/recovery/next-Hunt continuity remains consistent across restart/reconnect boundaries.
- [x] Completed-key replay after restart is mutation-free with no duplicate reward/capture/items/Activity.
- [x] Independent QA and integrity/replay review find no unresolved P0/P1; any P2 is explicitly classified.
- [x] Human Owner explicitly decides PA-M3→PA-M4; milestone state is not auto-promoted by this task.

## Evidence log

### Gate 1 — Read-only persistence baseline

- Status: `PASS` for baseline capture; no PA-M3 mutation was performed.
- Canonical source baseline: `main@9277fc4`, TASK-126 DONE, PA-M3 CURRENT. TASK-127 control branch/worktree was created from that exact commit.
- Preserved local topology was still live at baseline read: A web `5273` PID `214452`, B web `5274` PID `230028`, shared API listener `28787` on `workerd` PID `215964`, game-data `8788`, PostgreSQL `55432` in container `pokenexus-prealpha-local`. The inherited TASK-126 `runtime.json` still names an earlier API wrapper PID `217660`; the authoritative listener inspection is therefore recorded separately rather than treating the stale wrapper PID as runtime failure.
- Player A `019a7f50-0000-7000-8000-000000000101` remained on active Hunt `01a11e3b-2e2b-73ae-a377-b5938ea41fcf`, started `2026-10-09T01:15:56.911Z`. Its persisted checkpoint `01a11e3b-2e25-7404-8725-11b8100f9c60` was at logical `74,000 ms`, checkpoint rowVersion `162`, last updated `2026-10-09T01:25:15.332635Z`, with logical-time anchor `2026-10-09T01:17:10.911Z`. Hunt rowVersion remained `0` and root command sequence `120`.
- A active Team `01a11606-b8da-76b5-9e8d-ba7db107ae01` remained rowVersion `0`, slot 1 Bulbasaur `01a11606-b8da-76b5-9e8d-b58d5defcbb5`, Lv11, XP `1648`, Pokémon rowVersion `165`, HP `33`, vitality rowVersion `38`. A Inventory was rowVersion `122`: Poké Ball `2`, Revive-25 `2`, no Basic Potion entry.
- Player B `019a7f50-0000-7000-8000-000000000102` had no active Hunt. Its latest Hunt `01a11e3f-1688-72ba-9776-f05b1fc2f504` terminalized `no_living` at `2026-10-09T01:24:59.146561Z`; root recovery-ready was `2026-10-09T01:25:29.146Z`. B Inventory was rowVersion `61`: Basic Potion `11`, Poké Ball `19`, Revive-25 `1`.
- B bootstrap Team `01a11606-b998-70c3-afc4-60186d332c8b` remained rowVersion `3` with Cyndaquil Lv8 XP `703` and Rattata Lv3 XP `45`, both currently `0 HP`. Validation Team `01a11c0c-13dd-7184-964d-586ff8c0f948` remained rowVersion `1` with Cyndaquil Lv8 XP `703` and Sunkern Lv4 XP `74`, both `0 HP`.
- Current automation roots remained distinct and enabled. A: Capture rowVersion `17`, Potion rowVersion `6` threshold `50%`, Revive rowVersion `3`. B: Capture rowVersion `4`, Potion rowVersion `8` threshold `80%`, Revive rowVersion `7`.
- Pending-zone selection state existed for both Players (`1` each). No pending manual-capture row was returned for either Player.
- Command ledger baseline is intentionally preserved rather than cleaned: A has `112` terminal + `8` inherited `pending` public commands; B has `87` terminal and no pending command. The A pending set contains two current-Hunt `claim` keys — `e454b5e8-ad1b-49b4-a109-bffd410aab20` and `4647f472-6dd3-40ec-bc90-2cebf26f8e0c` — both frozen at target logical `479,808 ms`, plus older pending retreat/policy-replace rows from prior Hunts/sessions. These rows are now part of the PA-M3 baseline: they must not be deleted, replaced or silently reused, and later restart/replay evidence must distinguish them explicitly.
- Gate-1 conclusion: persistence is readable and internally owner-scoped at the start of PA-M3; inherited pending correlations are a known baseline condition to preserve and test, not evidence to synthesize away.

### Gate 1b — inherited pending-correlation reconciliation

- Status: `PASS` for the current-Hunt inherited claims; no pending row was deleted or rewritten manually.
- A current-Hunt claim `e454b5e8-ad1b-49b4-a109-bffd410aab20`, originally accepted at `2026-10-09T01:23:56.732Z` with frozen target `479,808 ms`, was resumed through TASK-127 with the exact same key and `{}` payload. It returned `202` at logical `74,000`, then `76,000`, and converged to terminal `200` on the fourth continuation request when the Hunt naturally reached `no_living`.
- Hunt `01a11e3b-2e2b-73ae-a377-b5938ea41fcf` terminalized at `2026-10-09T09:15:18.763721Z`, checkpoint logical `76,000`, recovery-ready `2026-10-09T09:15:48.763Z`. No Inventory, XP or resolved-Activity mutation occurred during the terminalization itself; Bulbasaur HP changed `33→0` as the natural no-living outcome.
- The second inherited claim for the same Hunt, `4647f472-6dd3-40ec-bc90-2cebf26f8e0c`, was then resumed with its exact key/payload after the Hunt was already terminal. It returned `200` immediately and became terminal in the command ledger. Inventory stayed rowVersion `122` with Ball `2` / Revive `2`; Bulbasaur stayed Lv11 XP `1648`; Activity remained `19`. This proves the duplicate historical pending correlation converges without duplicating effects.

### Gate 2 — sustained online session / extended Hunt continuity

- Status: `PASS` on a clean sequential rerun.
- A first controller attempt on Hunt `01a11ff4-4664-764f-a70b-e7ae4b503a03` is **discarded as primary Gate-2 evidence** because the local test loop opened a second checkpoint key after the first key was still `202` at its local retry cap. The product remained consistent: the second command terminalized the Hunt naturally, the first pending key was subsequently resumed exactly and returned terminal `200` with no second Inventory/XP/Activity mutation. This was a test-controller overlap, not accepted evidence for sequential session behavior.
- Clean rerun used normal PokéCenter + Start with fresh correlations and Hunt `01a11ff6-986a-7403-b304-3eea5b1d1d9c`, started `2026-10-09T09:20:16.873Z`. Each reconciliation window was strictly sequential: no new checkpoint key was created until the prior key reached `200`.
- The clean run lasted `84,004 ms` wall-clock and completed four checkpoint windows: `124d4e13-c468-47a0-9aa5-738109e4098e` target `21,039` (`55` attempts); `dd570056-680a-40c5-97e6-87cc232a03a0` target `43,380` (`65` attempts); `f803d514-8000-4924-8f30-102f0ded03bc` target `69,059` (`67` attempts); `dcfcd587-1b0d-403c-b3c5-57c3e205982e` target `95,632` (`4` attempts). Every key progressed `202→200` using exact-key retries only.
- The Hunt remained active after the first three completed windows and terminalized naturally during the fourth at `2026-10-09T09:21:53.718792Z` with `no_living`; all four command rows are terminal `200` and none remain pending.
- The run resolved `17` Encounter Activity rows through logical `66,000 ms`. A Inventory advanced through legitimate automation/reward effects to rowVersion `132`, ending Ball `2` / Revive `2`; Bulbasaur advanced to Lv12 XP `1906`, Pokémon rowVersion `191`, and ended `0 HP`. No checkpoint regression, orphaned active Hunt or duplicate command effect was observed.
- Evidence artifacts: `.maintenance/prealpha-local/task127/gate2-clean-start.json` and `gate2-clean-sequential.json`. The discarded overlap is retained separately in `gate2-start.json` / `gate2-sustained.json` for auditability rather than hidden.

### Gate 3 — in-flight checkpoint durability across API restart

- Status: `PASS`.
- Fresh Hunt `01a11ff9-3f6b-74d7-8cd5-bc313e2f55da` was started normally after PokéCenter using recorded heal/start correlations. A new checkpoint key `df48ae81-c95e-4eb6-9f99-1156de966545` was then frozen with exactly one pre-restart request: HTTP `202`, logical `0`, immutable target `18,980 ms`.
- Read-only pre-restart proof showed that exact key persisted as `pending` for the A Hunt with target `18,980`; checkpoint remained logical `0`, rowVersion `1`; Inventory rowVersion `132`, Ball `2` / Revive `2`; Bulbasaur Lv12 XP `1906`; Activity `0`.
- Only TASK-127 API `29787` was stopped. Before stop, listeners were `5373:237216`, `5374:248796`, `29787:249456`; after stopping Wrangler wrapper PID `225428`, only `5373/5374` remained, proving the web proxies were not restarted with the API.
- The same TASK-127 Wrangler config was relaunched on `29787`; the replacement `workerd` listener became PID `249956`, while A/B web PIDs stayed `237216` / `248796`. API root returned `200` after restart.
- Before any post-restart mutation, the database still showed key `df48ae81-c95e-4eb6-9f99-1156de966545` as `pending`, same source Hunt and same target `18,980`; checkpoint was still logical `0`. No rebase, replacement key or implicit advancement occurred merely from process restart.
- Resuming the **same key with the same `{}` payload** through proxy `5373` took `52` requests and `15,715 ms` local execution time. First post-restart response remained `202` at logical `0` / target `18,980`; the same key converged to terminal HTTP `200`. The Hunt remained active.
- Post-completion persisted state: command terminal `200`; checkpoint logical exactly `18,980`, rowVersion `43`; Inventory rowVersion `135`, Ball `1` / Revive `2`; Bulbasaur Lv12 XP `1948`, Pokémon rowVersion `196`; Activity `5`, max Encounter `5`, max resolved logical `18,000`. These are the legitimate effects produced while advancing the frozen target after restart.
- Exact replay of the now-completed key returned HTTP `200` and left checkpoint logical/rowVersion/timestamp, Inventory rowVersion/quantities, Pokémon XP/rowVersion and Activity count exactly unchanged (`18,980`/`43`, `135`, XP `1948`/rv`196`, Activity `5`). No duplicate reward, capture, item or Activity effect occurred.
- Evidence artifacts: `.maintenance/prealpha-local/task127/gate3-start.json`, `gate3-frozen.json`, `gate3-resume.json`, API restart logs and `runtime.json`.

### Gate 4 — quiescent service + PostgreSQL restart persistence

- Status: `PASS`.
- Quiescence was established before restart. For current A Hunt `01a11ff9-3f6b-74d7-8cd5-bc313e2f55da`, the only command row was completed Gate-3 key `df48ae81-c95e-4eb6-9f99-1156de966545`; current-Hunt pending count was `0`. Over a four-second read-only observation, checkpoint logical/rowVersion/updatedAt and command counts were byte-equivalent (`18,980` / `43` / `2026-10-09T09:25:01.639384Z` / `0 pending` / `1 total`). No established client connection existed on 5273/5274/5373/5374 during the boundary.
- Pre-restart snapshot was saved as `.maintenance/prealpha-local/task127/gate4-pre.json`. A: Hunt `01a11ff9-3f6b-74d7-8cd5-bc313e2f55da`, logical `18,980`, Inventory rowVersion `135`; B: no active Hunt, Inventory rowVersion `61`. Selected DB rows also captured both Hunt roots, checkpoint metadata, all Inventory entries and representative Pokémon XP/vitality rows.
- Only TASK-127 services were stopped first: 5373 PID `237216`, 5374 PID `248796`, API wrapper PID `250504`. After stop, 5373/5374/29787 were all down while preserved PA-M2 5273/5274→28787 and game-data 8788 remained listening.
- PostgreSQL container `pokenexus-prealpha-local` was then restarted normally. Container `StartedAt` changed from `2026-10-08T15:00:52.795731549Z` to `2026-10-09T09:29:23.406691064Z`; the same database `pokenexus_local_prealpha` returned `SELECT 1` immediately after restart and listener 55432 remained available.
- TASK-127 was relaunched from the same config on the same ports. New runtime PIDs: API wrapper `249348` / workerd listener `249636`, A web `239552`, B web `246968`; API root returned HTTP `200` before proxy reads.
- Before any new POST/PUT, post-restart snapshot was saved as `gate4-post.json`. Exact comparison against `gate4-pre.json` returned `true` for A Hunt identity, A logical time, A Inventory, A Capture/Potion/Revive policies, B Hunt/recovery state, B Inventory and the selected raw DB rows. No checkpoint, XP, vitality, Inventory, policy, recovery or ownership row changed merely because services/database restarted.
- Gate-4 conclusion: persistent authoritative state survives a full local PostgreSQL restart plus TASK-127 service restart at a proven mutation-free boundary; restart alone neither advances nor rewrites the active Hunt.

### Gate 5 — bounded offline / return / reconnect stability

- Status: `PASS`.
- After Gate 4, preserved A Hunt `01a11ff9-3f6b-74d7-8cd5-bc313e2f55da` was still active at checkpoint logical `18,980` with anchor `2026-10-09T09:23:29.676Z` and no current-Hunt pending command. Read-only server time `2026-10-09T09:31:13.856201Z` showed `464,180 ms` real elapsed since the anchor — a bounded return interval far below the already-proven 8h cap.
- A single return/claim key `a9619531-a685-4d03-876e-1b709d3a0397` was created after the service/database restart. First response was HTTP `202`, logical `20,000`, frozen target `495,743 ms`. The persisted command row retained that exact target and source Hunt. Target delta from the pre-return logical boundary was approximately the real wall-clock elapsed interval; no 8h-cap re-test was attempted.
- The same claim key and `{}` payload were continued exclusively until terminal `200`: `169` continuation calls / `52,719 ms` local processing after the first freeze. No replacement claim key was created. The Hunt naturally ended `no_living` at checkpoint logical `84,000`, terminal `2026-10-09T09:32:44.962083Z`, recovery-ready `2026-10-09T09:33:14.962Z`; command terminalized at `2026-10-09T09:32:44.975383Z` while retaining frozen target `495,743`.
- Terminal return effects were authoritative and finite: final A Inventory rowVersion `143`, Ball `1`, Revive `2`; Bulbasaur Lv12 XP `2092`, Pokémon rowVersion `212`, HP `0`; resolved Activity `21`, max logical `84,000`. The returned effects summary included the same captured reward/XP/capture accounting on replay, but replay did not reapply it.
- Exact replay of completed claim `a9619531-a685-4d03-876e-1b709d3a0397` returned HTTP `200`. Post-replay command target/status/timestamp, terminal Hunt checkpoint logical `84,000` / rowVersion `181` / updatedAt, recovery-ready timestamp, Inventory rowVersion/quantities, Pokémon XP/rowVersion/vitality and Activity count remained exactly unchanged. No duplicate reward, capture, item debit/credit or Activity was introduced.
- Evidence artifacts: `.maintenance/prealpha-local/task127/gate5-claim-frozen.json` and `gate5-claim-resume.json` plus the Gate-4 restart snapshots/logs that establish the runtime had been restarted before this return.

### Gate 6 — Human browser/session recovery sanity

- Status: `PASS`.
- Post-restart Human topology is prepared on dedicated TASK-127 services: A `http://localhost:5373`, B `http://localhost:5374`, both through restarted API `29787` and the restarted preserved PostgreSQL database.
- Current prepared state before Human interaction: A resolves to its own Player and active Hunt `01a12003-deeb-7043-a604-40e205793c7b` at logical `0`; B resolves to its own Player with no active Hunt. This asymmetric state makes stale/crossed identity or Hunt presentation directly visible.
- Human sanity should keep both sessions open, verify their distinct Player/Team/Inventory/Hunt state, reload or close/reopen **only A** while B remains usable, and confirm A returns to its own post-restart session/Hunt with no stale identity, lost Hunt, crossed Inventory/Team, or correlation/sync feedback. This is browser/session evidence and is intentionally separate from Gates 3–5 process/database/replay evidence.
- Human Owner explicitly reported `PA-M3 humano ok` at `2026-10-09T12:14:44Z` after the requested two-session post-restart sanity. This closes the browser/session recovery boundary: A returned to its own Player/Hunt state after unilateral reload/reopen while B remained its own session, with no reported stale identity, lost Hunt, crossed Team/Inventory, or correlation/sync feedback.
- This PASS is Human evidence and remains intentionally separate from the process/database/replay evidence in Gates 3–5.

### Gate 7 — natural terminal / recovery / next-Hunt continuity

- Status: `PASS` for backend/runtime continuity; Human browser/session UX remains Gate 6.
- Gate-5 return produced a natural `no_living` terminal and 30s recovery boundary after the full API/PostgreSQL/service restart. A read-only check at `2026-10-09T09:34:27.311108Z` confirmed `active_hunt_id=null`, recovery-ready `2026-10-09T09:33:14.962Z`, and `recovery_expired=true`; no recovery bypass was used.
- Normal PokéCenter then used fresh key `4bec0737-fd3d-4d48-8ea8-5886b02057c6` and returned `200`. Fresh Start key `2236a9f1-2f2d-4fa9-a309-1c512d2051ff` returned `200`, creating new Hunt `01a12003-deeb-7043-a604-40e205793c7b` at `2026-10-09T09:34:46.889Z`, logical `0`, with root recovery cleared.
- Read-only DB proof after Start shows old Hunt `01a11ff9-3f6b-74d7-8cd5-bc313e2f55da` remains terminal `no_living`, old claim `a9619531-a685-4d03-876e-1b709d3a0397` remains terminal `200`, and root now points only to the distinct new Hunt `01a12003-deeb-7043-a604-40e205793c7b`. The new Start command is independently terminal `200`; no orphaned old checkpoint or terminal replay displaced the new Hunt.
- Evidence artifact: `.maintenance/prealpha-local/task127/gate7-next-start.json`.

### Interim independent pre-Human re-gate

- QA reviewer: `READY P0=0 / P1=0 / P2=1`. The single P2 is an operational observation, not a correctness/replay failure: Gate 3 required `52` HTTP continuations / ~`15.7 s`, and Gate 5 required `169` continuations / ~`52.7 s`. No production/runtime SLA is asserted by PA-M3, so this does not block the milestone gate; it remains explicit evidence for later performance work rather than being hidden.
- QA confirmed the clean Gate-2 run is bounded to the observed `84.004 s`; the earlier overlapping-controller attempt is correctly discarded as primary evidence; historical unrelated pending keys remain preserved rather than falsely claimed as cleared; Gate 4 quiescence is scoped to TASK-127 services; and Gate-5 productive advancement ended naturally at `no_living` before reaching the larger frozen return target.
- Integrity/replay reviewer: `READY P0=0 / P1=0 / P2=0`. Restart, persistence and replay evidence is sufficient for the prescribed PA-M3 matrix; no mandatory additional negative/replay scenario was identified before Human Gate 6. The six older inherited pending commands remain documented/preserved and are not required to be deleted or terminalized by this task.
- With Human Gate 6 now explicitly PASS, final exact-current QA and integrity/replay re-gates remain required before closing the independent-review acceptance criterion.

### Final independent PA-M3 exit re-gate

- Final QA reviewer: `READY P0=0 / P1=0 / P2=1`. Human Gate 6 is explicitly PASS and no mandatory automated/live PA-M3 scenario remains missing. The single P2 is the already-recorded operational request-pressure/latency observation: Gate 3 required `52` continuation requests / ~`15.7 s`, and Gate 5 required `169` / ~`52.7 s`. PA-M3 does not assert a production/runtime SLA, so this is classified as **non-blocking operational evidence**, not a correctness, persistence, replay or milestone failure.
- Final QA also confirms the evidence wording remains bounded and accurate: Gate 2 is only the observed `84.004 s` sustained run; the invalid overlapping-controller attempt remains explicitly discarded; Gate 4 quiescence is scoped to TASK-127 services; Gate 5 naturally terminalized `no_living` before exhausting its larger frozen target; historical unrelated pending keys remain preserved rather than claimed as cleared.
- Final integrity/replay reviewer: `READY P0=0 / P1=0 / P2=0`. Exact-current Human Gate 6 PASS, API restart with frozen checkpoint key, PostgreSQL/service restart persistence, exact-key continuation, replay invariance, natural terminal/recovery and fresh-Hunt continuity are sufficient for the prescribed PA-M3 matrix. No mandatory negative/replay scenario remains.
- Historical pending commands outside the active PA-M3 Hunts remain explicitly scoped as inherited state. Current-Hunt inherited claims were reconciled exactly; the six older historical pending rows were preserved and are not required to be deleted/terminalized by TASK-127.
- Independent-review acceptance is therefore closed. The Human Owner subsequently accepted the recommended PA-M3→PA-M4 transition, so **PA-M3 is COMPLETE and PA-M4 is CURRENT**; repository-history handback remains separately gated.

### Human Owner PA-M3 exit decision

- Decision: `ACCEPT PA-M3 → PA-M4`.
- Human Owner message: `Autorizado`.
- Recorded message timestamp: `2026-10-09T12:19:34Z`.
- Consequence: PA-M3 becomes `COMPLETE` and PA-M4 becomes `CURRENT`. PA-M5 remains `GATED`; this decision does not open the expansion-gate capabilities.
- TASK-127 advances from `ACTIVE` to `ACCEPTANCE`; it is **not DONE** until separately authorized repository-history handback is completed.
- The final QA P2 remains recorded as non-blocking operational evidence for later performance work; no correctness, persistence or replay blocker is carried into PA-M4.
- This decision does not authorize commit, push, merge, deploy, public enablement, production migration, TASK-120/121, eligible-Moves, public CombatPresentation, or any specific PA-M4 balance-rule change.

## Completion rule

TASK-127 may reach ACCEPTANCE only after the required PA-M3 stability/restart/persistence evidence is explicit, reproducible where applicable, independently reviewed and all unresolved findings are classified without inference. It may reach DONE only after the Human Owner makes the PA-M3 exit decision and any separately authorized repository-history handback is complete.
