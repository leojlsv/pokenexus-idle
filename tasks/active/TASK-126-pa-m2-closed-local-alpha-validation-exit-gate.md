# TASK-126 — PA-M2 Closed Local Alpha Validation & Exit Gate

## Metadata

- State: ACCEPTANCE
- Class: B
- Owner: Software Developer (ChatGPT prime)
- Owner execution surface: ChatGPT prime
- Reviewer: independent QA Reviewer
- Reviewer execution surface: independent ChatGPT delegated reviewer
- Auditor: independent integrity/security reviewer for account isolation, idempotency and checkpoint evidence
- Auditor execution surface: independent ChatGPT delegated reviewer
- Consultants: N/A — this task validates already-approved local Pre-alpha authority and must not redefine gameplay, economy, combat, XP, Genetics or content
- Consultant execution surface(s): N/A
- Specs: APPROVED SPEC-015/020/021/024/027; integrated TASK-038/107/108/110/122/125 authority
- Dependencies: TASK-038, TASK-039, TASK-041, TASK-107, TASK-108, TASK-110, TASK-122, TASK-125
- Control branch: `test/TASK-126-pa-m2-closed-local-alpha-validation-exit-gate`
- Control worktree: `.worktrees/TASK-126-pa-m2-closed-local-alpha-validation-exit-gate`
- Source baseline: canonical `main@ed8d455`
- Source worktree: canonical root `main`; existing historical/source worktrees remain untouched

## Objective

Validate **PA-M2 — Closed Local Alpha (1–2 Players)** against the canonical PA-M1-complete baseline by exercising two real local Player accounts concurrently and proving that their Hunt, Collection, Team, Inventory, XP, policy, recovery and correlation state remain self-scoped under simultaneous use.

Prepare an evidence-bounded Human Owner exit gate for **PA-M2 → PA-M3**. PA-M3 must not become CURRENT automatically.

This is a validation/exit-gate task. It may diagnose and propose bounded Class-B corrections only when a concrete defect is reproduced. It must not absorb TASK-120/121, enable public CombatPresentation, add eligible-Moves/Move-editor authority, deploy, migrate production state or invent new gameplay rules.

## Required live validation matrix

1. **Concurrent account baseline**
   - Confirm Player A and Player B authenticate independently against the same local server baseline.
   - Record owner-scoped Collection/Team/Inventory/XP/Hunt state before mutations.
   - Negative reads for representative foreign Pokémon/Team/Hunt identities must fail closed.
2. **Simultaneous Hunts**
   - Start or resume one real Hunt per Player with distinct idempotency keys.
   - Keep both Hunts active/reconciling concurrently for a bounded real interval.
   - Verify each checkpoint/claim/policy command remains attached to the owning Player/Hunt only.
3. **Concurrent automation/resource effects**
   - Exercise Capture/Potion/Revive where naturally eligible under the existing policies.
   - Reconcile Inventory/XP/Activity independently for A and B; no cross-account debit/reward/capture is allowed.
4. **Concurrent management mutations**
   - While both accounts are active, perform bounded owner-scoped policy or Team/management edits through normal product flows.
   - Verify OCC/idempotency conflicts stay local to the initiating Player.
5. **Asymmetric reload/reconnect**
   - Reload/reconnect one Player while the other remains active.
   - Confirm the continuing Player is unaffected and the reconnecting Player resumes only its own durable correlations.
6. **Correlation/replay isolation**
   - Capture exact command keys for representative simultaneous operations.
   - Replay completed keys and verify no duplicate reward/item/capture/Activity effects.
   - Reusing or probing another Player's identity/key must not expose or mutate their state.
7. **PA-M2 Human usability sanity**
   - Human Owner verifies both browser sessions remain distinguishable and controllable during representative concurrent use.
   - No cross-session UI state, stale account identity or ambiguous save/sync feedback is acceptable.
8. **PA-M2 exit packet**
   - Consolidate PASS/FAIL/NOT EXERCISED/KNOWN LIMITATION evidence.
   - Require independent QA + integrity/security review with no unresolved P0/P1.
   - Human Owner explicitly chooses Accept PA-M2→PA-M3 or Hold PA-M2.

## Initial target

The first gate is a **read-only concurrent baseline**. Before any new mutation, prove that A and B still resolve to distinct Player roots and record their current Hunt/Inventory/XP ownership. This prevents later concurrency evidence from being interpreted against an already-crossed baseline.

## Safety / state-preservation rules

- Use only the owned local Pre-alpha environment and loopback endpoints.
- Do not run Reset to simplify concurrency tests.
- Do not regenerate Genetic authority or individualization keys.
- Do not edit database rows to manufacture capture, KO, reward, Revive, reconnect or concurrency outcomes.
- Prefer normal UI/API product flows; database access is read-only diagnosis/evidence only.
- Preserve exact idempotency/correlation keys for ambiguous or in-progress operations.
- Never reuse one Player's command key as a substitute for another Player's operation.
- Do not clear browser storage to hide or bypass pending commands.
- Do not alter the system clock.
- Stop mutating actions immediately if account crossover, duplicated reward/capture/item debit, disappearing entities, negative Inventory, checkpoint corruption or unresolved cross-session synchronization is observed.
- Keep A/B identities explicit in every captured artifact/log to avoid evidence mixing.

## Explicit non-goals / separate gates

- TASK-120 / SPEC-025 durable terminal/offline-summary implementation.
- TASK-121 / SPEC-026 historical manual-capture compatibility/migration.
- TASK-103 public CombatPresentation route enablement or persistent migration.
- TASK-100 eligible-Moves / full Move editor authority.
- Production database, deploy, public URL, Worker/Pages/Hyperdrive production enablement.
- New balance/economy/combat/Genetic/XP/content decisions.
- PA-M3 long-session/restart-stability acceptance beyond the bounded reconnect coverage needed to prove PA-M2 isolation.

## Acceptance criteria

- [x] A and B concurrent baseline identities/resources are recorded from authoritative reads with no crossover.
- [x] Two simultaneous real Hunts progress independently under the same local server process.
- [x] Representative Capture/Potion/Revive/reward/XP/Inventory effects remain owner-scoped during simultaneous use.
- [x] Concurrent owner-scoped management mutations do not leak OCC/idempotency state across accounts.
- [x] Transport/proxy reconnect of one Player does not pause, mutate or inherit the other Player's Hunt/correlations; rendered browser reload/session sanity remains in the Human gate below.
- [x] Representative foreign reads/mutations fail closed without revealing private state.
- [x] Completed-key replay under concurrent conditions is mutation-free and no duplicate rewards/capture/items/Activity occur.
- [x] Human two-session usability sanity is explicitly approved.
- [x] Independent QA and integrity/security review find no unresolved P0/P1 in the PA-M2 exit evidence.
- [x] Human Owner explicitly decides PA-M2→PA-M3; milestone state is not auto-promoted by this task.

## Evidence log

### Gate 1 — Concurrent baseline

- Status: `PASS`.
- Canonical source baseline: `main@ed8d455`, TASK-125 DONE, PA-M2 CURRENT.
- Dedicated PA-M2 local topology prepared without opening a browser or mutating gameplay: Player A web proxy `5273` and Player B web proxy `5274` both target the same exact-current TASK-126 API process on `127.0.0.1:28787`; game-data/database authority remains the preserved local Pre-alpha baseline.
- Player A = `019a7f50-0000-7000-8000-000000000101`; Player B = `019a7f50-0000-7000-8000-000000000102`.
- Baseline Hunts: both `activeHunt=null`; no pending manual capture. Existing recovery timestamps were already in the past at PA-M2 execution time.
- Player A Inventory `rowVersion 109`: Poké Ball `1`, Revive-25 `2`, no Basic Potion entry. Representative Bulbasaur `01a11606-b8da-76b5-9e8d-b58d5defcbb5`: Lv11, XP `1384`, progression rowVersion `135`.
- Player B Inventory `rowVersion 54`: Poké Ball `20`, Basic Potion `12`, Revive-25 `2`. Representative Cyndaquil `01a11606-b998-70c3-afc4-5fe40d305aa7`: Lv7, XP `493`, progression rowVersion `39`.
- Same-API negative ownership reads PASS: B reading A-only Bulbasaur returned `404`; A reading B-only Cyndaquil returned `404`.
- An earlier diagnostic against the old mixed 5173/5174 topology accidentally used B's own Cyndaquil as the supposed A foreign identity and therefore returned `200`; that result is explicitly discarded as an invalid test vector. The corrected same-API foreign IDs above are the PA-M2 evidence.

### Gate 2 — Simultaneous Hunts on one API

- Status: `PASS` for concurrent Start/progression/replay; later automation-family coverage remains separate.
- The first concurrent Start pair intentionally used the existing teams without modifying vitality and both returned terminal `422 hunt_not_admissible`. Read-only vitality diagnosis showed every roster member at `0 HP`; this was symmetric stale local gameplay state, not a concurrency/crossover defect.
- Normal concurrent PokéCenter recovery then ran through the same API with distinct keys. A key `f995e52f-5396-4eee-bf25-cb33b78ad113` restored its Bulbasaur to `33/33`; B key `60cb0b4e-ae63-46c9-9e01-acac3c451a04` restored Cyndaquil `24/24` and Sunkern `15/15`. Both returned `200` in the same paired operation and neither touched the other Player's roster.
- Fresh concurrent Starts used new correlations after the prior terminal `422`s: A `70d9419e-4170-4d26-879d-d5f2ad9c45fd`, B `382c6779-654b-4b86-856d-5310ae9829f4`. Both returned `200` against API `28787`, starting distinct Hunts only 1 ms apart in server timestamps: A `01a11df5-8726-766a-9eac-ade8c27ebfe6`, B `01a11df5-8727-7690-ba5e-aabc9f1b1ca4`.
- No unexpected checkpoint command appeared after Start, proving no stale 5173/5174 browser coordinator was advancing the new Hunts in the background before the controlled PA-M2 progression run.
- After a bounded real interval, one checkpoint correlation per Player was frozen and continued in paired HTTP rounds: A `a5c038c2-3cf5-44ea-9e49-0040539e1b75` target `37,298`; B `350a7ad5-71eb-403d-bb68-99f14dac7a22` target `37,300`. B reached `200` in round 56 while A continued independently to `200` in round 97; B completion did not pause, supersede or mutate A's correlation.
- Post-progression owner state stayed distinct. A Inventory `rowVersion 111` remained Poké Ball `1` / Revive-25 `2`; Bulbasaur XP advanced `1384 → 1468`, Activity count `9`. B Inventory `rowVersion 56` remained Poké Ball `20` / Potion `12` / Revive-25 `2`; Cyndaquil XP advanced `493 → 529` (Lv8), Sunkern stayed `62`, Activity count `3`.
- Cross-Hunt Activity reads remained self-scoped on the shared API: A reading B Hunt Activity returned `404`; B reading A Hunt Activity returned `404`.
- Exact replay of both completed checkpoint keys was executed concurrently and returned `200` with the same Hunt states. Post-replay A/B Inventory rowVersions/quantities, Pokémon XP rowVersions/values and Activity counts were unchanged (`111`/`56`, XP `1468`/`529`/`62`, Activity `9`/`3`). No duplicate reward, capture, item debit or Activity record was introduced by replay.

### Gate 3 — Asymmetric transport/proxy reconnect / cross-session continuation

- Status: `PASS`.
- Pre-reconnect both Hunts were still active exactly at the Gate-2 logical times: A `37,298`, B `37,300`, with unchanged owner Inventory/XP baselines.
- A froze checkpoint key `2a58f520-3e56-412c-9be2-e3ae4cc231db` and received `202` at logical `38,000`, target `4,246,108`. Read-only DB evidence showed that exact key persisted as `pending` for Player A and A Hunt only.
- Only the A web proxy `5273` was stopped; API `28787` and B proxy `5274` remained live. A endpoint became unreachable while B remained authenticated and readable.
- While A was offline, B froze independent checkpoint key `a43452a9-a9ed-4af1-88cc-77cb792320a4`, target `4,285,469`, and continued that exact key to terminal `200` in 19 attempts. B Hunt terminalized to recovery without requiring or touching the A proxy/correlation.
- A proxy was then restarted on `5273` with the same A bearer and same shared API `28787`. It resolved to the original Player A identity and resumed **the existing A key** `2a58f520-3e56-412c-9be2-e3ae4cc231db`; no replacement key was created. The resumed command continued from logical `38,000` and reached terminal `200` in 19 attempts, with A Hunt independently entering recovery.
- Final command rows remain disjoint: A key belongs to Player A/Hunt A with frozen target `4,246,108`; B key belongs to Player B/Hunt B with frozen target `4,285,469`; both are terminal `200`.
- Before replay, A authoritative state was Inventory `rowVersion 112`, Poké Ball `2`, Revive-25 `2`, Bulbasaur XP `1486`, Activity `11`; B was Inventory `rowVersion 56`, Poké Ball `20`, Potion `12`, Revive-25 `2`, Cyndaquil XP `547`, Activity `4`.
- Concurrent replay of both reconnect checkpoint keys returned `200/200`. All Inventory rowVersions/quantities, XP rowVersions/values and Activity counts remained unchanged; no duplicate reward, item, capture or Activity effect occurred.
- Cross-Hunt Activity reads after reconnect/replay still returned `404` in both directions. No session inherited the other Player's Hunt or command state.
- This gate proves transport/proxy reconnection plus exact durable-command resumption. It does **not** claim rendered browser reload/cookie UX evidence; actual two-browser reload/identity/sync feedback remains explicitly Human Gate 6.

### Gate 4 — Concurrent owner-scoped management mutations

- Status: `PASS`.
- Baseline Capture policies were owner-distinct: A rowVersion `16`, enabled, Poké Ball reserve `1`; B rowVersion `2`, enabled, Poké Ball reserve `20`.
- Simultaneous semantically identical owner saves used independent exact keys: A `b34b8676-dddf-46ab-b3ad-45c13770023e`, B `c63585ad-cb78-4e07-8b40-aff2ff3c421b`. Both returned `200` through the same API in ~384 ms paired wall time.
- OCC/version ownership remained isolated: A advanced only `16→17` with a new A policyVersion; B advanced only `2→3` with a distinct B policyVersion. Neither save altered the other Player's reserve, rules or rowVersion.
- Exact-key policy replay returned the original `200` result for both Players and kept rowVersions exactly `17` / `3`, proving idempotent replay without a second policy write.
- Representative foreign **mutations** then used normal authenticated Player APIs: A attempted to replace B validation-Team roster and B attempted to replace A Team roster. Both returned `404`.
- Authoritative owner Team reads before/after the foreign attempts were byte-equivalent in semantics: A Team remained rowVersion `0` with only the A Bulbasaur; B validation Team remained rowVersion `1` with B Cyndaquil + Sunkern. No foreign OCC token, roster or identity leaked or mutated.
- Direct cross-owner command probes also reused the **other Player's completed checkpoint key together with the other Player's Hunt ID**. B probing A key `2a58f520-3e56-412c-9be2-e3ae4cc231db` + A Hunt and A probing B key `a43452a9-a9ed-4af1-88cc-77cb792320a4` + B Hunt both returned `404`. Read-only DB evidence after the probes still contained exactly one row for each key under its original Player/Hunt only; no foreign command row was accepted.
- Combined with Gate-1 foreign Pokémon reads and Gate-2/3 foreign Hunt Activity reads, both read and mutation isolation are now explicitly exercised.

### Gate 5 — Concurrent automation / resource effects

- Status: `PASS`.
- B policy reserves were deliberately opened by exactly one unit for this bounded live gate while preserving existing thresholds/priorities: Capture reserve `20→19`, Potion reserve `12→11`, Revive reserve `2→1`. A already had one Capture-eligible Ball under reserve `1`; no gameplay/economy rule changed.
- Both teams were healed concurrently through normal PokéCenter and fresh Hunts started in the same second: A Hunt `01a11e3b-2e2b-73ae-a377-b5938ea41fcf`; B Hunt `01a11e3b-2e36-703d-8af6-4f291632227d`.
- A/B checkpoint correlations froze the **same exact cutoff `39,480`** and progressed in parallel. B completed its cutoff first (round 75); A continued independently and completed in round 112. Both Hunts remained active after that shared cutoff.
- Gate-5 baseline Inventory/XP: A `rv112`, Balls `2`, Revives `2`, Bulbasaur XP `1486`; B `rv56`, Balls `20`, Potions `12`, Revives `2`, Cyndaquil XP `547`, Sunkern XP `62`.
- A Activity through `39,480` contained owner-local automatic Capture, reward/drop and Potion execution: Encounter 1 successful Capture spent one Ball; later Ball drops allowed additional successful Capture attempts while reserve protection remained respected; a Basic Potion dropped in Encounter 5 and was subsequently consumed by A in Encounter 8 even though A had no Potion at the baseline. Final A Inventory was `rv119`, Ball `1`, Revive `2`; Bulbasaur XP advanced `1486→1582` only on A.
- B Activity through the same cutoff contained owner-local Potion + Capture in Encounter 1: exactly one Basic Potion and one Poké Ball consumed with successful Capture. Final B Inventory at that point was `rv60`, Potion `11`, Ball `19`, Revive `2`; Cyndaquil XP advanced `547→619`, Sunkern remained `62`.
- Revive was then allowed to trigger naturally by continuing B while A Hunt remained active. B checkpoint key `8f8fdb06-84b1-4ac4-941d-74a26f74df6f` progressed from logical `42,000` and Encounter 8 recorded one in-Battle Revive-25 use at logical `48,000`, restoring Cyndaquil by `+6 HP`. B Revive inventory changed exactly `2→1`; A Revive inventory remained exactly `2` while A Hunt stayed active.
- B later terminalized to recovery at logical `72,000`; A remained independently active at logical `39,480`, proving B terminalization/resource execution did not terminate or mutate A.
- Exact replay of B's completed Revive-bearing checkpoint key returned `200` and left B Inventory `rv61` at Potion `11` / Ball `19` / Revive `1` and Activity count `11`. The Revive, Capture, Potion, rewards and XP did not duplicate on replay.
- This gate now covers all representative PA-M2 effect classes requested by the matrix: Capture, Potion, Revive, reward/drop, XP, Inventory debit/credit and replay under concurrent two-Player use, with owner-scoped evidence for each.

### Gate 6 — Human two-session usability sanity

- Status: `PASS`.
- A and B are exposed on distinct local URLs `http://localhost:5273` and `http://localhost:5274`, both targeting the same API `28787`. Human Owner must confirm the two sessions are visually distinguishable/controllable and no account identity, Hunt, policy-save or sync feedback appears crossed between them.
- Human Owner explicitly approved the two-session sanity on `2026-10-09` after exercising both local sessions concurrently. The approved path included distinct A/B account identity and Team/Hunt presentation, navigation across representative management surfaces, reloading only one session while leaving the other active, returning the reloaded session to its own account/Hunt, and observing concurrent sync/controls without crossed Pokémon, Inventory, Save state, correlation feedback or Hunt ownership.
- This Human evidence closes the rendered browser/session boundary intentionally left open by Gate 3; the proxy-level reconnect proof and the real two-browser usability proof are therefore recorded separately rather than conflated.

### Interim independent re-gate — pre-Human Gate 6

- QA reviewer: `READY P0=0 / P1=0 / P2=1` for Gates 1–5. The P2 was wording precision only: Gate 3 is a transport/proxy reconnect with the same bearer and exact frozen key, not itself proof of a rendered browser reload/session-cookie lifecycle. This task now states that boundary explicitly and reserves the actual two-browser experience for Human Gate 6.
- Integrity/security reviewer: `READY P0=0 / P1=0 / P2=1` for Gates 1–5. Its only evidence-strengthening P2 was a direct cross-owner idempotency-key/Hunt probe. That probe has now been executed `404/404` with DB proof that both keys remain owner-exclusive, closing the recommendation.
- Neither reviewer identified another mandatory automated/live PA-M2 scenario beyond the current matrix before Human Gate 6. Final QA/integrity review remains intentionally open until Human evidence is added.

### Final independent PA-M2 exit re-gate

- Final QA reviewer: `READY P0=0 / P1=0 / P2=0`. Gates 1–5 remain supported by concrete same-API two-Player evidence; Gate 3 wording precisely distinguishes transport/proxy reconnect from rendered browser/session behavior; Human Gate 6 closes the actual two-session reload/identity/sync UX boundary. The former wording P2 and foreign-command-probe P2 are closed. No additional mandatory PA-M2 automated/live scenario was identified.
- Final integrity/security reviewer: `READY P0=0 / P1=0 / P2=0` within PA-M2 scope. The review confirmed owner-scoped Player/Hunt/command lookup, concurrent Hunts and exact-key replay, asymmetric reconnect with same-key resumption, isolated policy OCC versions, foreign Pokémon/Hunt/Team/command probes failing closed, owner-local Capture/Potion/Revive/reward/XP/Inventory effects, mutation-free replay and Human two-session isolation.
- The direct cross-owner completed-key + foreign-Hunt probes close the prior integrity evidence-strengthening P2: both directions returned `404`, and read-only DB evidence retained one command row per key under its original Player/Hunt only.
- `git diff --check`, `roadmap:check` and `portfolio:check-local` remain green after the Human evidence update.
- The independent-review acceptance criterion is closed. The Human Owner subsequently accepted the recommended PA-M2→PA-M3 transition, so **PA-M2 is COMPLETE and PA-M3 is CURRENT**; repository-history handback remains separately gated.

### Human Owner PA-M2 exit decision

- Decision: `ACCEPT PA-M2 → PA-M3`.
- Human Owner message: `Autorizado`.
- Recorded message timestamp: `2026-10-09T01:34:17Z`.
- Consequence: PA-M2 becomes `COMPLETE`, PA-M3 becomes `CURRENT`, and PA-M4 becomes `NEXT`.
- TASK-126 advances from `ACTIVE` to `ACCEPTANCE`; it is **not DONE** until separately authorized repository-history handback is completed.
- This decision does not authorize commit, push, merge, deploy, public enablement, production migration, TASK-120/121, eligible-Moves or public CombatPresentation.

## Completion rule

TASK-126 may reach ACCEPTANCE only after the required PA-M2 concurrent-account evidence is explicit, reproducible where applicable, independently reviewed and all unresolved findings are classified without inference. It may reach DONE only after the Human Owner makes the PA-M2 exit decision and any separately authorized repository-history handback is complete.
