# SPEC-019 — Bounded Solo Hunt Authority Frontier and Historical Proof

- Status: **DRAFT — not approved; no implementation authority**
- Human direction: **Strategy B (versioned compact v4 + indexed immutable private evidence) selected on 2026-09-30**. This selects the design direction, **not** the final Class-A security/compatibility contract, new implementation ownership, a migration, or public feed enablement.
- Human scope decision: **selective, end-to-end protection of Solo Hunt authority and every authoritative consequence attributable to a Hunt, accepted on 2026-09-30**. No blanket proof requirement for unrelated Player records.
- Human MVP threat-model decision: **N — restricted PostgreSQL application-role trust boundary, selected on 2026-09-30**. Trust the authoritative Worker and privileged DB/schema/backup administrators; prevent or reject historical alteration by normal runtime DB privileges. **Privileged DBA/schema takeover, coherent historical rewrite and restore of an older valid backup are outside the MVP integrity guarantee.** Model S (independently witnessed privileged-rollback resistance) is deferred, not silently supplied by N. The precise DB-role and operational restore contracts remain to be specified and tested.
- Human workload-design decision: **§12 option B — indexed, immutable logical range dispositions for pending-heal classification/terminal cancellation, transport expiry and command supersession, selected on 2026-09-30**. This approves the **MVP design direction** and authorizes drafting its SPEC-015 Class-A amendment; it does **not** approve a final SQL index, amend the currently accepted SPEC-015, relax command semantics, authorize a migration, or make v4 READY.
- Human transport-time direction: **§13.5 alternative A — authenticated monotone Player decision-time floor with selective fail-closed handling of severe clock anomalies, selected on 2026-09-30**. Gameplay cutoff remains on the SPEC-015 clock; numerical anomaly limits, independent clock evidence, recovery and versioned migration remain Class-A acceptance gates.
- Human decision record **H-01–H-06, selected on 2026-09-30**: H-01 earlier-structural-due healing precedes retreat despite later acceptance, with existing equal-T acceptance-sequence distinction; H-02 independent authenticated time witness for material forward-clock anomalies; H-03 database-enforced, scoped Worker authorization *before* protected spendable transitions, with historical MAC as complementary evidence; H-04 isolated legacy correction **conditional on real PostgreSQL reproduction and separate change authorization**; H-05 private-data least privilege and non-forgeable per-Player isolation; H-06 genuine-public versus account-only presentation classification, with non-forgeable account isolation for the latter. The precise contracts, actual permissions, cross-spec Class-A amendments, evidence and implementation authorization remain pending (§14.1).
- Human H-01/K progress direction **A — bounded cross-command help to complete an already accepted retreat, selected on 2026-09-30**. Helping R preserves its original Player/Hunt/target, acceptance order, 30-day lease, result and recovery anchor; it does **not** mean that checkpoint/claim implicitly cancels retreat. Option B (preemptive K displacement before a genuine highwater crossing) is **not selected**. This selection authorizes refining the DRAFT Class-A proposal, **not** amending accepted SPEC-013/SPEC-015, implementing v4, changing API/SQL grants, migrating, or deploying (§14.1).
- Human healing product direction **2026-10-01 — Poções de cura são exclusivamente automáticas**, disparadas por condições de **percentual de HP** e somente nos conteúdos **PvE explicitamente habilitados** (por exemplo, Hunts). **Não existe uso manual de Poção de cura no comportamento de produto desejado.** Esta instrução mais recente prevalece sobre a hipótese de Poção manual usada nas minutas H-01/A e exige emenda Class-A coordenada das SPEC-013/015 aceitas antes de qualquer implementação/ativação. Os antigos cenários `items/use` são apenas referências legadas para reespecificação; não são critérios de aceitação de cura automática (§14.1).
- Human interaction-model direction **2026-10-01 — PokeNexus é management-first Idle**. PvE World/Zone/Hunt não possui movimentação/exploração manual; traversal/progressão é automática. O **HUB é a única exceção atual com movimentação livre/manual**. Esta direção é coordenada por TASK-106/SPEC-020 e deve limitar qualquer futura interpretação de apresentação, `World/Map navigation`, Duo/PvP/World Boss ou controles de Hunt. Esta SPEC-019 não pode introduzir execução Adventure/Action por inferência.
- Human active-Hunt control direction **2026-10-01**: `checkpoint` e `claim` são reconciliação **interna/automática**, sem botões de gameplay; `Retreat` permanece intervenção estratégica manual; captura futura é **gerenciamento/automação**, sem pending manual/per-Encounter Ball prompt; policies de automação podem ser alteradas durante uma Hunt, sempre prospectivamente e sem reescrever histórico já resolvido. As rotas/resultados manuais históricos continuam apenas como superfície de compatibilidade até o contrato/migração aceito em TASK-106/SPEC-020.
- TASK-106 Class-A rebase **APPROVED 2026-10-02**: SPEC-020 and SPEC-021 are accepted forward authority for the first Pre-alpha product/UX slice. The coordinated amendments cover SPEC-003 external item/KO-intervention semantics, SPEC-007 automated Potion/Revive item semantics, SPEC-013 lifecycle, SPEC-014 automation-only capture, SPEC-015 policy/vitality/offline/activity authority, SPEC-016 Cards-only IA, SPEC-017 versioned `CombatantRevived` projection, and SPEC-021 durable vitality/PokéCenter authority. Any manual-Potion/manual-capture examples below remain **historical evidence or legacy compatibility analysis**, never forward product behavior. SPEC-019 remains DRAFT for its own v4 workload/security frontier and must conform to approved SPEC-020/021.
- Change class: **A** — changes the accepted checkpoint/storage strategy and its security/integrity boundary.
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Related specs: SPEC-015 (gameplay/commands), SPEC-017 (presentation ledger), SPEC-020 APPROVED (management-first/Class-A realignment), SPEC-021 APPROVED (persistent vitality/PokéCenter), SPEC-002/003/007/011/013/014/016 (retained/amended authority)
- Related ADRs: ADR-004/005/006
- Related tasks: TASK-037/038/103/104; implementation task **not yet assigned or made READY**.

## 1. Problem and evidence

SPEC-017 requires bounded producer work independently of the age of a Hunt while retaining
complete immutable, replayable source evidence. The current producer validates all previous
Encounter evidence and replays all completed Battles on **each** advancement
(`packages/game-core/src/solo-hunt.ts:1899-2037,2372-2553,2649-2669,3300-3303`).
It also serializes every completed Encounter, stimulus and heal in a strict v3 checkpoint
(`packages/game-core/src/solo-hunt-checkpoint.ts:1273-1425,1450-1459`;
`apps/api/src/hunts/application.ts:2767-2773`).
Removing one replay loop alone does not bound serialized bytes, decode, reward/capture
authorization or SQL writes.

An initial isolated **Node fixture using the legacy v2 encoder** generated
60/120/240/480 Encounters at 1/2/4/8 hours. The observed median no-progress validation
times were 8.34/10.81/23.10/52.06 ms and checkpoint lengths 173/343/683/1365 KB.
A second, reproducible **strict-v3** Node fixture with frozen owned-Shiny,
individualization authority and 7 local samples per size is implemented in
`packages/game-core/benchmarks/solo-hunt-v3-history.mjs`. On Windows x64,
Node 24.19.0 / Intel i7-13700, its 60/120/240/480 completed Encounters produced
640/1276/2550/5098 KB v3 checkpoints; p50 no-progress replay/validation was
33.701/69.223/156.344/299.474 ms and p50 canonical v3 encoding was
5.112/9.666/21.054/35.725 ms. These fixtures establish growing workload
and are **not** a production Cloudflare Worker, PostgreSQL, network, healing
backlog, or public GET benchmark; they establish **no accepted numerical ceiling**.

Separately, the existing public ledger uses unkeyed rolling SHA-256 and bounded local
predecessor checks. A historical row and all following unkeyed hashes can be replaced
coherently by an actor with broad DB write access. An authenticated latest head does not
by itself authenticate an arbitrary old page; a historical-read trust strategy remains
unaccepted (`packages/database/src/hunt-presentation-public-read.ts:221-225`;
`tasks/active/TASK-103-authoritative-hunt-presentation-backend.md:71`).

## 2. Goals

1. Bound **incremental gameplay validation, serialization, source publication and read**
   per successful invocation for the explicitly supported Hunt duration/size envelope,
   independently of already archived Encounter count.
2. Retain complete deterministic source provenance, rewards, healing, RNG lineage, cadence,
   original owned Shiny/Battle HP and battleStart evidence for independently initiated audits.
3. Make hard restart, multi-Worker concurrency, same-key replay, OCC loss and crash recovery
   verify the same authoritative prefix as uninterrupted execution.
4. Authenticate both the **core private authority** and **individually fetched public
   historical pages** without reading the entire preceding Hunt on every request.
5. Preserve historical SPEC-015 gameplay and SPEC-017 presentation behavior by version, while allowing only the **separately Human-accepted** TASK-106 Class-A amendment to introduce the forward auto-Potion/Revive, automation-only capture, persistent-vitality/PokéCenter and Cards-only activity-reporting model. Retain historical replay and previous-version authority until the migration/compatibility contract is accepted.

## 3. Non-goals and fixed boundaries

- **No reinterpretation of existing strict v1/v2/v3 checkpoint bytes** or `hunt-runtime-inputs-v1/v2`.
  Existing v1–v3 readers/writers preserve their prior canonical semantics and full replay.
- No deletion or silent truncation of old Encounter stimuli, healing, reward/capture
  evidence or original CombatEvents. No backfill from current Collection/Team.
- No changed encounter selection, move/ability outcomes, RNG, reward,
  cutoff, recovery, idempotency or no-free-reroll semantics **except where
  TASK-106/SPEC-020 explicitly supersedes the historical player-control model**.
  The Human-selected automatic PvE healing and automation-only capture rules are
  explicit **unimplemented Class-A exceptions**: manual Potion and manual
  pending-capture/per-Encounter Ball input are not future desired product behavior.
  Checkpoint/claim remain technical reconciliation authority but not player-facing
  controls; Retreat remains player-triggered; automation policy changes are allowed
  mid-Hunt prospectively. For Pre-alpha Solo Hunts, auto-Potion is Player-wide/global,
  uses selectable 90%-10% thresholds with **current HP <= threshold**, targets the active
  Pokémon, follows Ball-like allowed-item/priority/fallback/minimum-reserve management,
  may execute in-Battle or inter-Battle, consumes one action opportunity when applied,
  has a 5s cooldown, works offline, and resolves **after same-boundary damage/DoT** so a
  0-HP result proceeds to KO/Revive rather than Potion. SPEC-020 now proposes one future
  actor-GCD action-opportunity cost with no Move-cooldown/cursor consumption, but that
  mapping remains **DRAFT Class-A**, not accepted authority.
  A later Human direction also supersedes the historical fresh-Hunt full-HP reset:
  owned Pokémon HP must persist across Hunt termination/start and full healing belongs
  to a HUB PokéCenter flow. This draft may preserve legacy full-HP replay evidence, but
  it must not promote runtime-only HP or recovery expiry as the future vitality source.
  A subsequent Human direction also supersedes the historical no-revival baseline:
  **Revive will exist inside Hunts as policy-driven automation**. Current Revive item tiers are
  exactly **25% / 50% / 100% max-HP restoration**; the automatic target is exclusively the **Leader/active
  Pokémon that becomes KO during the current Hunt**. The earlier 2s `reviving` state is
  superseded: a successful Revive instead consumes one action opportunity (Human wording:
  one "turno" de ação), with exact mapping to the non-turn-based cadence deferred to the
  coordinated Class-A contract. Revive works during offline advancement; allowed items,
  priority/fallback and minimum reserve follow the Ball/Potion management model; the same
  eligible Leader/active Pokémon may be revived repeatedly with no extra count/cooldown
  beyond Inventory + policy + reserve. **Every eligible Leader/active KO evaluates Revive
  before any replacement/switch to a conscious reserve**; Revive is also evaluated before
  `no_living` when the last conscious member reaches KO. The coordinated
  SPEC-003/007/013/015/017 amendments plus SPEC-021 must define deterministic
  KO->Revive-action->conscious, persistent vitality and Inventory-ordering semantics
  before future-v4 may depend on them. Legacy no-revival
  Hunts remain replayable under their historical rules.
- First Pre-alpha offline progression is capped at **8h** with the detailed return summary
  fixed by SPEC-020. SPEC-019 may preserve workload evidence from 1h/8h fixtures, but it
  must not mistake those fixtures for production cap enforcement; the forward SPEC-015
  amendment owns the authoritative cap/rebase semantics.
- SPEC-017 remains the combat-only stream. Capture/reward/Inventory-consumption summaries
  for the first Cards feed belong to a separate bounded SPEC-015 Hunt-activity authority;
  SPEC-019 may protect/prove both sources but must not merge their semantic vocabularies.
- No public source-origin/Genetics/RNG exposure, no GET-time replay, and no new public cursor
  fields or relaxation of the 128-event/four-envelope/256-KiB ceilings.
- No new HTTP endpoint, migration execution, deployment, repository-history action,
  enablement of TASK-039/040 consumers or rollout authorization from this draft.

### 3.1 Selected selective-integrity boundary (Human scope decision)

The v4 design **must cover the entire causal chain of a Solo Hunt**, not merely
the current checkpoint or the public presentation feed. Its protected proof
surface comprises:

1. **Original authority and execution:** self-scoped Player/Hunt identity;
   frozen Team/Pokémon, owned Shiny, rules/content/policy versions; Battle origins,
   deterministic RNG and source CombatEvents; exact completed/active stimulus,
   cadence, status, healing, encounter/boundary and terminal/recovery provenance;
   compact checkpoint and separately committed private/public historical records.
2. **Every accepted Hunt consequence:** versioned, transaction-bound XP and other
   progression changes; item/Ball/currency debits and Hunt-origin rewards; successful
   or failed capture decisions and resulting owned-Pokémon grants; pending-capture
   closure, item-use applied/not-applied results, claim aggregates, reward resolution,
   automatic policy application and final terminal state. Record the **exact affected
   resource identities, authoritative before/after versions, canonical operation
   and effect bytes and correlation**, including a no-change disposition when
   appropriate. Do not fabricate effects for a rejected/unbound command.
3. **Cross-transaction and cross-Hunt dependencies:** source Encounter provenance,
   the Player-wide serialized command/Inventory boundary, command outcome and
   idempotency state, actual order of separate capture/reward/heal commits and
   any effect-only transaction without a checkpoint OCC update. A terminal source
   Hunt may still own a later manual capture decision, while a different Hunt
   advances independently; both facts must remain provable without reopening or
   retroactively rewriting either Hunt. A policy save without an active Hunt is
   Player-wide authority and is bound at the next applicable Start, not inserted
   into an unrelated or terminal Hunt's history.
4. **Shared mutable consequences:** the relevant portions of Inventory, Collection,
   progression and policy state cannot silently diverge from a proved Hunt effect.
   When **other authorized commands** later change a shared resource, preserve a
   versioned causal transition/provenance for the previously accepted Hunt effect,
   or use another independently specified, bounded verification of the same
   invariant. A signature on the old Hunt checkpoint cannot certify the *current*
   Inventory or Collection after unrelated changes. The v4 contract must define
   precisely how a consumer checks the authenticated prior effect, the intervening
   authorized mutations and the current resource version without scanning an
   unbounded Player history. This is a **cross-domain interface requirement**;
   it does not authorize changing unrelated game rules or imposing a global
   attestation protocol on every Player record.

**Outside this selected scope:** cosmetic/UI preferences, non-authoritative
presentation caches and records with no authority or causal effect over a Hunt.
Unrelated gameplay/economy mutations do **not** automatically become cryptographically
protected as whole domains; only the bounded provenance needed to verify shared
Hunt-sensitive consequences is in scope. Existing authentication/authorization,
privacy, backups and database access controls still apply to all records.

**The accepted coverage and selected MVP threat model are separate decisions, not
a security guarantee already delivered.** For N, tested PostgreSQL runtime-role
permissions, append-only evidence and guarded transitions must enforce the complete
causal boundary above. The authoritative Worker, schema/DB administrators and
retained backup history remain trusted; a privileged rewrite or restoration of an
older valid backup is expressly outside the MVP guarantee. Any later S upgrade needs
separate Class-A approval, off-DB freshness, authenticated historical membership and
pre-acknowledgment recovery/fencing; it does not retroactively prove N-era history.

## 4. Proposed version and compatibility boundary

1. Introduce a **new, additive `pokenexus.solo-hunt-checkpoint.v4`**, selected by the
   stored checkpoint schema/version column; never write v4 bytes under a v3 label.
   Keep `hunt-runtime-inputs-v2` for new v4 Hunts **only if** the exact frozen,
   required original owned-Shiny and authority pins remain compatible; otherwise
   propose and approve a separately versioned input schema. No field is silently
   appended to the strict inputs-v2 contract.
2. A new v4 authority frontier contains only the pinned run/player/Team/version identity,
   active Battle/cadence/policy/RNG/current-HP state, current PendingEncounterSelection
   and pending capture, latest completed ordinal and healing acceptance position,
   an authenticated **checkpoint-generation proof reference**, and checkpoint OCC
   row version. A separately locked **Player/Hunt live-head record** carries the
   *latest* private operationSequence, proof digest, checkpoint generation/rowVersion,
   boundary/effect-transition version, exact compact-state digest, and the
   authoritative current disposition/heal cursor. In a command that updates
   only an effect or boundary status (not checkpoint bytes), the checkpoint
   continues referencing its previous checkpoint generation, whereas the
   live-head record advances to the new proof operation. It must be possible
   to authenticate the latest live head in **one indexed, bounded read**, not
   by replaying all intervening non-checkpoint operations.
   The canonical **state payload excludes the resulting proof head itself**:
   the separately stored domain-separated proof binds the previous trusted head,
   operation digest, canonical next payload digest and expected successful
   checkpoint OCC **or** effect-transition version.
   This avoids self-referential hashing. Any field with unbounded growth needs an explicit safe bound or separate
   append-only storage; especially active-Battle stimuli and active effects.
   **Active Battle is not an exception to the bound.** The future v4 codec and core
   continuation contract must define a finite, independently verifiable active-Battle
   state (including turn/cadence position, pending reactions, deterministic RNG,
   original Battle identity/origin, original and current owned HP, active/reserve
   roster, status/Ability effects and next source-event sequence). Append every
   complete accepted stimulus and its full unprojected events to indexed, immutable
   authenticated private evidence; never copy the growing `battleStimuli` array
   into the compact checkpoint or replay its entire prefix on an ordinary v4
   continuation. A restart must authenticate the bounded frontier **and** the
   relevant committed evidence/head before resuming. This is a required design
   invariant, not a claim that the existing CombatEngine already supports such
   resumability. Before approval, specify the exact engine state codec, finite
   active-effect representation or lossless bounded decomposition, atomic archive
   boundary and conformance fixtures; a count-only 128-event budget is insufficient.
3. Archive old normalized combat stimuli, complete completed-Encounter evidence,
   individualization and immutable original Battle origins, healer ordering and reward/
   capture linkage in **separate indexed, append-only, player/Hunt-scoped private
   records**. Preserve the exact bytes needed for full replay, not only digest values.
   At a Battle transition, the frontier references the committed new ordinal/head
   instead of copying the full preceding history.
4. Existing v3 Hunts continue v3 gameplay unchanged. Their **already-proven public
   presentation stream remains subject to the same signed 15-minute frozen cursors,
   30-day terminal retention and accepted availability semantics**; it cannot
   silently become `410` solely because new v4 Hunts exist. An old Hunt genuinely
   lacking immutable presentation evidence still yields `410 presentation_unavailable`
   **only for presentation**, not an invented gameplay outcome. Optional v3→v4 migration requires an **independently
   specified**, fully replay-validated, atomic conversion with original input/cursor
   pins, quiescent/outstanding-command OCC fence, and existing cursor continuity.
   A conversion of a very large v3 must be staged outside an unbounded request and
   rechecked against the final immutable source head. Until accepted, **no automatic migration**. The workload bound cannot be
   claimed for legacy v3 Hunts without such a conversion and measurement.
5. Rollout of new v4 Starts, replay validator and presentation writer must be version-
   gated independently. Amend SPEC-017 §6.1's explicit new-Start v3 selection and
   §7's checkpoint-schema pin **only after Class-A acceptance**: input-v1 retains
   its accepted legacy v1/v2 checkpoint writer behavior; input-v2 pins an explicitly
   selected, canonical v3 **or v4** checkpoint. Both the schema column and canonical
   bytes must agree. Check all Start, checkpoint, claim, retreat, prelude, explicit
   heal, pending-capture cleanup, auto/manual capture, reward, terminal and
   presentation-writer/reader branches (including current
   `apps/api/src/hunts/runtime.ts:1081-1088`,
   `apps/api/src/hunts/presentation-source.ts:115`, and
   `apps/api/src/hunts/presentation-read.ts:188-194`).
   v3 publication remains disabled or follows its accepted original gate; never
   project a guessed Battle origin for either version.

## 5. Authority, digest and concurrency model

1. Define a **domain-separated, canonical private commitment** for each appended source
   operation. Bind the previous committed private head; Player/Hunt/run; frozen
   content/rules/input/checkpoint/source versions; Encounter ordinal/identity and
   Battle identity; stimulus and authentic raw source CombatEvents; pre/post deterministic
   RNG, HP, policy/cadence and outcome; due heal; pending capture/reward effects and
   authority version; canonical operation position; the next head-free compact
   state-payload digest; and its expected successful OCC version or separately
   versioned effect-transition sequence. Use fixed canonical encodings with strict
   field allowlists and length limits. The resulting head is **outside** its own
   hashed payload and is persisted with the frontier as a bound proof pointer.
2. A bare SHA-256 chain stored in the **same mutable DB** is not proof against rewriting
   a historical suffix by an actor allowed to rewrite that DB. **For selected MVP N,**
   the trust boundary is an explicitly separated, least-privilege PostgreSQL runtime
   role with enforced append-only historical evidence and guarded, versioned current
   head/effect transitions. Domain-separated commitments and any keys external to DB
   may complement those controls, but **neither a same-DB hash nor an application-
   accessible MAC proves resistance to privileged DBA rewriting or valid-backup
   rollback**. An independent off-DB monotonic witness/fence is **not** an N MVP
   requirement. Specify actual key ownership, rotation/loss and retention for every
   key used; retain required verification material throughout live-Hunt and
   audit/presentation windows, not only cursor TTL. Never expose private
   commitments or keys in public cursors.
3. Verify the authenticated **latest committed frontier/head** using fixed-work lookup
   before trusting incremental state after restart. Read the independent live-head
   record, join its bound checkpoint generation/rowVersion and current boundary/
   due-heal disposition, and reject a stale checkpoint reference or effect-status
   mismatch before admitting a new Battle or applying an old reward. Bind each
   proof operation to checkpoint schema, Player/Hunt identity, current monotonic
   operationSequence and its exact winning checkpoint OCC or effect-transition
   version. Verify each newly applied
   complete stimulus and its raw CombatEvents **before** extending that head. Never
   accept a client-provided frontier/head, an in-process memo, an unauthenticated
   operation counter or an unverified DB checksum as core authority.
4. **Proof operations follow actual SPEC-015 transaction boundaries**, not a
   fabricated all-at-once Encounter transaction. Use monotonically correlated
   operation kinds for Battle completion/frozen boundary, auto-capture disposition,
   reward disposition, boundary committed, each due heal applied/not-applied,
   manual capture/skip, pending-capture cleanup, terminal seal, and next Battle
   admission. The accepted ordering is COMBAT_END → AUTO_CAPTURE → REWARD →
   DUE_HEAL(s) → NEXT_BATTLE, with the existing boundary status transitions
   `frozen → capture_committed → reward_committed → committed`.
   Manual capture may occur in a later transaction with then-current Inventory.
   A due heal remains at most one resolution per invocation, and a zero-logical-
   time effect must still advance an authenticated operation sequence. Proof
   operations not changing the checkpoint row **CAS the separate live-head row**,
   with a real versioned boundary/effect transition, rather than inventing a
   checkpoint OCC increment. Two or more no-op/not-applied heals at the exact
   same logical time must still advance distinct accepted operationSequences;
   the subsequent Worker reads the latest live head in O(1).
   Each successful transaction's canonical operation record must authenticate
   **its actual persisted consequences**, not only the checkpoint or the logical
   operation name. The required inventory includes relevant before/after OCC
   versions and exact row identities/digests for Ball and item debits, captured
   Pokémon grants, Player/Pokémon XP, reward-resolution and claim aggregates,
   the frozen policy authority **consumed by this Hunt**, accepted and
   `not_applied` healing and command outcome/replay, pending capture/cleanup,
   terminal and recovery disposition.
   Record a defined no-change marker where an operation legitimately leaves a
   particular domain unchanged. Relate each **Encounter-scoped** effect to its
   authenticated original Encounter and frozen source identities. For Player-wide
   or other effects without an originating Encounter, bind the actual Player-level
   command, operation and authority identities without fabricating an Encounter.
   A subsequent command reading such
   evidence must verify its authenticated membership and current authorized
   consequence under the Player/Hunt and affected resource locks; an authenticated
   Hunt checkpoint **alone** does not authenticate independently mutable Inventory,
   Collection, claim, policy or command rows. Effect-only transactions that do not
   write checkpoint bytes still require a distinct winning live-head CAS and an
   immutable operation record in that same transaction. The schema and exact
   accepted consequence digest/canonical byte contract remain pre-approval work.
   A Player-wide policy save with **no active Hunt**, or one that activates only
   after its former Hunt has terminalized, is **not** a fabricated operation in
   that terminal Hunt's live-head. Preserve SPEC-015 §10.3's Player-wide save OCC,
   prelude `202`, `effectiveAt=null` and next-Start policy selection semantics.
   When an active v4 Hunt consumes a newly effective policy version, its
   authenticated transition binds that exact policyVersion, canonical saved
   policy content and activation boundary; its Start likewise binds the original
   selected policyVersion/content even when the save had no active Hunt.
   Specify the exact Player-level authority and cross-Hunt binding for **every
   policy actually consumed by a protected Hunt** before implementation;
   proving the history of an unused standing policy is not implied. Never
   silently attach the save to an unrelated Hunt.
   The same distinction applies to **Player-wide delayed manual capture**:
   SPEC-015 §9.1 allows the pending `sourceHuntId` to be terminal while the
   `advancementHuntId` belongs to another active Hunt or is absent. Its final
   Ball debit, capture grant/skip and command correlation must bind the original
   source Encounter evidence and the authoritative Player-wide Inventory state
   at the actual final transaction, not be assigned retroactively to the newer
   Hunt's Battle history or rerolled from its RNG. Before approving the selected
   selective-integrity contract **under either threat model**, specify a
   Player-level effect authority or authenticated
   cross-Hunt linkage that proves the independent source and any separate
   advancement prelude while preserving exactly that final Inventory ordering;
   a terminal source Hunt must not be silently advanced or reopened.
5. At **each actual winning authoritative transaction**, compare the relevant
   checkpoint OCC or effect-transition version under Player/Hunt lock; verify the
   preceding frontier/proof; apply the bounded new operation; and atomically
   persist its matching compact frontier/proof transition, private evidence and
   any gameplay effects, checkpoint changes, public projection and watermark
   **that belong to that transaction**. On an OCC loser/rollback, none of that
   transaction's rows or counters survives. Same-key replay requires canonical
   byte-equality of persisted private **and** public consequences. The terminal
   presentation seal remains atomic with the **first terminalizing** `solo_hunts`
   statement, which may be later than the CombatEvent ending.
   For the Player-wide effects expressly separated in §5.4, use the existing
   Player-wide serialization/root and a separately accepted Player-level proof
   authority when no live Hunt frontier applies; link any distinct source-Hunt
   evidence and optional active-Hunt prelude without inventing a checkpoint OCC
   update or modifying the already-committed source Hunt.
   A protected Hunt consequence on a shared Inventory/Collection/progression
   resource must remain attributable after later legitimate non-Hunt updates.
   Specify either a versioned, authenticated resource-transition linkage or an
   equivalent bounded proof of current-value consistency with the historical
   effect. The proof must not treat an old resource digest as an assertion that
   the resource never changes again, and may not authenticate all subsequent
   unrelated operations merely by pointing at the Hunt head. Until that
   linkage is proven under the selected threat model, current mutable totals
   cannot be advertised as end-to-end verified Hunt consequences.
6. An incomplete indivisible stimulus must neither advance the frontier nor expose
   partial CombatEvents. Keep the accepted `127 + 2 / budget 128` deferral, all
   time-zero `BattleStarted`/reaction events, forced replacement, and zero-gap
   Battle/Encounter reward/capture/heal ordering. If a single presentation group is
   irrecoverably too large, only its presentation source becomes atomically
   unavailable **while the valid SPEC-015 gameplay operation still commits**.
7. A corrupted or unauthenticated **gameplay** frontier is different from a
   presentation-only failure: do not continue from forged state or fabricate success.
   Fail closed under existing authority/error semantics and define a bounded
   operator recovery path that does not reroll or lose legitimate rewards.
8. Previously accepted reward and manual/automatic capture operations must read
   **individually proof-bound, indexed completed Encounter authority** and verify
   exact source/evidence identity before granting effects. The current presentation
   event-prefix hash is insufficient: it does not bind all stimuli, heals, RNG,
   selection provenance and gameplay-effect commitments. A trusted latest head
   proves a valid committed state transition, **not** that every old private row
   remains retrievable. Every future old-Evidence use or independent historical
   audit must verify separately indexed authenticated membership/existence of
   each requested record; missing/corrupted evidence fails closed, never rerolls
   or fabricates rewards. Do not claim full-archive availability from a head alone.
9. **Future S only, outside the selected N MVP:** if privileged-DB write/rollback
   is included in a separately approved security scope and an
   external monotonic anchor is chosen, **PostgreSQL and that external system are
   not atomically commit-compatible**. A candidate protocol is: commit a canonical
   durable outbox record with the winning DB transaction; after commit, an
   idempotent attester advances the off-DB witnessed head by strictly verified
   generation/OCC; GET refuses unanchored generations with bounded `503` pending
   attestation. A lost/reordered/duplicate outbox, crash between commits, external
   outage and valid old-head rollback must have a proven reconciliation rule.
   Never pre-sign a phantom head before PG commit; never make legitimate
   SPEC-015 gameplay depend on the **optional public GET attester** being online.
   The *private gameplay* freshness anchor is a **distinct authority** with its
   own trusted monotonicity/failure semantics. If its verification service is
   unavailable after restart, no worker may authorize gameplay from a merely
   MAC-valid DB snapshot, because it might be a signed rollback: return bounded
   `503 authority_unavailable` without new gameplay mutation until private
   authority can be verified. The Human Owner must explicitly accept this
   security-versus-availability tradeoff if privileged rollback is in scope.
   Alternatively approve the narrower DB-role threat model, not a silent
    fallback from strong to weak verification. None of this off-DB protocol is a
    prerequisite or claimed property of the selected N MVP.
10. **Future S only, outside the selected N MVP: acknowledged private-core commit
    fencing is an independent hard requirement under a privileged-DB-rollback
    threat model.** An in-PG outbox followed
    by an asynchronous private witness is insufficient: PG can commit operation
    H6 and acknowledge `202`, then be restored to H5 before that outbox is
    witnessed; an online external head still reading H5 cannot distinguish
    the rollback. A candidate stronger protocol writes an **off-DB durable
    monotonic intent/fence before the PG commit**, atomically binds that intent
    to the winning PG transition, then obtains an **off-DB durable witnessed
    completion before acknowledging any newly accepted gameplay effect or
    allowing another dependent operation**. Every restart verifies both the
    latest witnessed completion and any unresolved later intent. If a previous
    intent exists but the corresponding PG commit is missing or unverifiable,
    refuse gameplay advancement and preserve command correlations until
    authenticated reconciliation; **never** treat the valid older H5 as latest,
    invent a clean rollback, abort an ambiguous intent, or reroll an Encounter.
    Retention of private forensic proof for this reconciliation **does not extend**
    SPEC-015's public `Idempotency-Key` lifetime: a pending/progressing command
    expires after its 30-day continuation lease and then returns
    `410 idempotency_gone` under the accepted tombstone policy; no new uncommitted
    effect may execute under that key. Already committed gameplay effects remain
    authoritative, and an independently accepted scheduled heal survives its
    transport-key expiry according to its own domain boundary. A longer-lived
    unresolved witness/fence must distinguish evidence recovery from public-key
    replay, never silently restart an expired command or reroll a capture.
    Distinguish a conclusively uncommitted failed transaction from a committed
    but unwitnessed transition using independently reviewable evidence, not
    merely the rewritable current PG snapshot. Enumerate crash windows:
    before intent, after intent/before PG, after PG/before witnessed completion,
    after witness/before response and malicious restore after acknowledged
    completion. If this protocol, its safe reconciliation and availability
    consequences cannot be proved, **do not claim privileged-DB rollback
    protection**; choose the explicitly narrower approved trust model or keep
    the v4 strong mode blocked. The optional public GET outbox/attester from
    item 9 must not be mistaken for this private-core fence.
    In particular, an off-DB pending intent plus current PostgreSQL H5 is **not**
    proof whether H6 was never committed or was committed and rolled back before
    the witness. A strong-mode design must furnish an independently verifiable
    commit-outcome authority or permanently quarantine that ambiguous sequence
    without acknowledging, replaying or replacing its effects. A design may not
    claim to resolve this ambiguity by inspecting only restorable PostgreSQL
    state. The S protocol, recovery and availability semantics remain open for a
    separately approved upgrade, not for the selected N MVP.

## 6. Historical GET integrity independent of the old prefix length

1. Fetch a bounded indexed page and its at-most-four public Battle headers inside
   one `REPEATABLE READ READ ONLY` transaction. **Under selected MVP N,** validate
   their original committed publication membership using independently tested
   append-only runtime-role permissions, guarded publication/version transitions,
   owner scope, stored canonical bytes and the frozen publication state within the
   trusted PostgreSQL boundary. Bind Player/Hunt/ordinal/Battle/sequence/index and
   exact public bytes; do not accept merely recalculated unkeyed local predecessor
   hashes as evidence that an overwritable historical row is original. Specify the
   bounded indexed proof and missing-row/rollback dispositions before claiming N
   historical integrity. This model does **not** certify against a privileged rewrite
   or an older valid restored DB snapshot.
2. The selected N MVP mechanism is **separated immutable PostgreSQL app-role
   privileges, append-only controlled writes and guarded current-head transitions**,
   with independently verified permissions and operationally protected backups/WAL.
   A versioned keyed MAC on canonical public-only identities/bytes may supplement
   that mechanism, but an application-accessible MAC and a signed cursor do not
   extend N's guarantee to privileged DB actors or rollback. **A future S upgrade**
   would additionally need an independently anchored publication root, bounded
   per-row/header inclusion against the original root and anti-rollback/fork proof.
   Before N's Class-A acceptance, freeze an executable bounded membership strategy
   for each historical event and Battle header. Event validation binds at least
   `(Player,Hunt,generation,eventIndex,encounterOrdinal,encounterId,battleId,
   sequence,combatTimeMs,canonicalPublicEventBytes)`; header validation separately
   bind `(Player,Hunt,generation,encounterOrdinal,encounterId,battleId,
   battleStartedAtHuntTimeMs,canonicalPublicOriginBytes)` to their appropriate
   trusted publication state, without inventing an `eventIndex` or `sequence`
   field on a header. Define old-page inclusion and anti-fork/anti-rollback
   checks **against normal app-role writes within trusted PostgreSQL history**;
   no privileged-restore detection is claimed. A signed cursor, a keyed row from the
   same restorable DB, or a latest-head signature alone does not prove membership
   in the originally committed historical prefix **against the selected N trust
   boundary**. The key owner, rotation, compromise/loss handling (for keys actually
   used), old-v3 disposition, snapshot consistency and `404/409/410/503` behavior
   must be specified before implementation approval.
3. Preserve frozen `nextCursor` and conditional `resumeCursor`: authenticate the
   original public prefix before promotion, reject historical mutation and missing
   rows, and maintain stable `409 snapshot_changed` versus `410` dispositions.
   Never scan prior history on GET, never use private source bytes or an unverified
   page to sign a new cursor, and never leak row-authentication material.
4. Define key-loss/unavailable-verifier (if used) and corrupted-row behavior distinctly from
   a legitimate empty page. All owned unrecoverably unprovable prefixes fail closed;
   foreign/absent Hunts remain identical `404`.

## 7. Retention, size and failure guarantees

- Archive evidence for no less than all live-Hunt needs and SPEC-017's active/30-day
  terminal presentation window, plus any longer SPEC-002/009/015 gameplay or ledger
  obligation. Retention deletion cannot occur before the final dependent command/
  proof window closes.
- Define finite upper bounds for each *new* batch's raw source bytes, counted events,
  Battle-origin bytes, private evidence rows, frontier size, heal backlog, pinned
  Team/Ability/effect state and SQL work. A 128-CombatEvent count by itself does
  **not** bound one large event or many no-event operations. In particular, show
  whether the accepted CombatEngine already proves finite worst-case size for an
  **indivisible gameplay stimulus or persistent active-effect state**; if not,
  prescribe an exact bounded decomposition/fallback that **still progresses**
  valid SPEC-015 gameplay under the original same-key and effect order. If no
  such decomposition is possible, the claimed history-independent bound remains
  **open**, not achieved by marking the presentation-only stream unavailable.
- Handle limits without converting an otherwise admissible Hunt into an unstartable
  one solely because of the presentation feed. A **core** limit that would change
  gameplay admission is a separate explicit Human product/architecture decision.
- Secret-key rotation, missing retained authorities, hash/MAC mismatch, unsupported
  schema, duplicated or gapped sequence, startup recovery after partial failure,
  and terminal sealing all have deterministic, tested rollback/fail-closed paths.

## 8. Pre-implementation specification gates and post-implementation v4 proof

The selected direction is not a substitute for Class-A contract acceptance.
Before a v4 implementation task reaches READY, define exact normative codec,
effect membership, threat-model/failure semantics and **numeric target ceilings**.
**Before implementing the bounded writer**, independently benchmark and accept
the representative Worker/PostgreSQL baseline, worst-case source/event/byte
envelopes, numerical targets and failure/recovery feasibility required by the
already APPROVED SPEC-017 §7. A design target alone is not that prior benchmark
acceptance. **After** separately authorized v4 implementation, run the full
production-compatible v4 measurements, migration and code conformance matrix
below against those accepted ceilings, and obtain independent acceptance
**again before public feed enablement**. The earlier feasibility benchmark does
not prove that the delivered v4 implementation meets its targets, and this draft
does not silently relax SPEC-017's pre-implementation gate.

1. **Baseline and target:** repeat the isolated 1/2/4/8-hour measurement for valid
   v3 as a baseline; benchmark v4 on production-compatible Cloudflare Worker and
   disposable PostgreSQL at 0/100/1,000/10,000 prior Encounters, varied explicit heals,
   high-event single Battles and concurrent writers. Record p50/p95/p99 CPU/wall,
   memory peaks, rows/bytes read and written, checkpoint bytes, source events,
   transaction durations and storage growth. Establish explicit numerical ceilings
   **before** claiming independent-of-history work.
2. **Source parity:** exact original CombatEvent sequence, fields, source byte encoding,
   selected opponent, RNG state, action boundary, time-zero events, cadence, HP,
   Shiny and terminal reason match uninterrupted v3 for identical frozen inputs/
   seeds, for direct versus segmented execution and hard restart.
3. **Mutation parity:** player/pokémon XP, items, Ball debit, manual/automatic capture,
   pending selection, heal acceptance/due order and recovery converge under repeat,
   crash-after-rollback, OCC collision, process replacement and same-key `202`.
   Cover separate Battle-end/capture/reward/heal transactions and their frozen
   inventory boundaries, checkpoint-only cleanup, zero-logical-time accepted heal,
   and an ongoing no-free-reroll pending selection. Validate the `127 + 2 / 128`
   case plus 1/2-event later-Battle bootstrap budgets. Explicitly cover two
   not-applied heals with no checkpoint OCC change at identical logical time:
   live-head CAS 1→2, restart in between, next-Battle fence, rollback and
   duplicate accepted commands.
   **Selective-scope boundaries:** establish that a valid v4 checkpoint plus
   a forged/missing capture grant, altered Ball debit, modified reward/XP row,
   altered claim result or mutated policy content never passes consequence
   verification. Also test a legitimate later non-Hunt Inventory, Collection
   or progression update: the earlier Hunt contribution must remain
   independently attributable while the *current* shared resource version
   reflects its additional authorized changes. Include a policy saved without
   any active Hunt then used at a later Start, and manual capture originating
   from a terminal Hunt whose advancement prelude belongs to another Hunt
   or is absent. These tests must prove the selected protected causal chain;
   they do **not** require proofs of unrelated cosmetic/UI data.
4. **Negative integrity (selected MVP N):** using only the production-
   equivalent *normal application DB role*, attempt coherent rewriting of an old
   private Battle plus subsequent hashes, replacement of an old public row,
   historical public suffix, public header, old reward/heal/stimulus and source
   effect; prove the accepted write boundaries deny or detect each operation.
   Independently test missing/corrupted private evidence, cross-Player mix,
   changed pinned authority or signing key, rotation/loss of keys actually
   required by that model, and proof failure when an old Encounter is first
   fetched at reward/capture/audit. Distinguish unavailable *gameplay* authority
   from presentation-only failure and retain the appropriate existing response
   and retry semantics. These tests do **not** claim protection from privileged
   DBA/whole-DB rollback when N is chosen.
   **Only for a separately approved future S:** also test a coherent privileged rewrite of all
   retained private/public DB hashes and a replay of a previously valid
   externally signed head after full database rollback, independent public
   historical membership, and attestation outage/outbox reorder. Independently
   fault-inject the private-core trust service and optional public GET attester
   while restarting a Worker after PostgreSQL commit; the former must fail
   closed for protected gameplay/state reads, while the latter must not block
   otherwise provably authorized SPEC-015 mutations and must keep presentation
   GET unserved until the public root is attested.
   Under that same stronger privileged-DB threat model, first reproduce as a **negative
   test of the rejected asynchronous-only/outbox protocol** the PG-H6 commit
   followed by acknowledged `202`, PG+outbox rollback to H5 **before witness
   H6**, and restart with online witness at H5. The accepted private-core protocol
   must instead assert **no acknowledgment before independent witnessed
   completion**, reject an old H5 after rollback of a previously acknowledged H6,
   and preserve the command correlation through an ambiguous outcome. Include
   intent-without-PG-commit, PG-without-final-witness, duplicate/finalized
   intent, and an ambiguous aborted transaction; none may fabricate a
   completed command, lose a debit/reward or silently reaccept old authority.
5. **Database/GET:** real PostgreSQL uniqueness/contiguous publication, transactional
   atomicity of first terminal row with presentation seal, lock/OCC behavior,
   bounded indexed late pages, 15-minute cursor/key rotation and no private-data
   disclosure. SQL-free mocks do not satisfy this gate.
6. Independent pre-implementation QA and security/persistence audit of this draft,
   then independent implementation review/audit of the **exact** delivered diff,
   and separate Human acceptances for the contract, migration execution,
   repository-history integration and public feed enablement.

## 9. Selected strategy and remaining Class-A acceptance work

**A — Keep accepted v3 architecture (not selected for new design).** Continue strict historical replay and full
checkpoint storage; do not assert history-independent producer bounds. Set an
explicit tested maximum supported Hunt size/duration, or leave the public feed
disabled when its production workload gate cannot be met. This does not authorize
limiting legitimate SPEC-015 gameplay.

**B — Versioned compact v4 + indexed immutable private evidence (selected design
direction by the Human Owner on 2026-09-30).** Enables a path to
bounded *incremental* work, but requires schema/version changes, retention, replay
authority migration policy, selected N role enforcement, operational restore policy
and independent DB evidence.
This is **not yet an accepted implementation-ready Class-A contract**. The v4
codec, per-operation consequences, historical-page membership, failure protocol
and numerical limits must be frozen and re-reviewed before implementation.

**C — Offload full replay to a separate verifier.** Can move work away from the
request but does not by itself make strict full checkpoint writes bounded or
guarantee authoritative evidence is ready before SPEC-015 effects commit.
Do not use asynchronous verification to publish unverified source or grant rewards.

The **selective integrity scope in §3.1 is accepted**: the end-to-end protected
surface is Solo Hunt history **plus every actually committed consequence and
cross-domain dependency needed to verify it**. It is **not** a request to make
all Player records globally tamper-evident. The Human Owner also selected **N for
the MVP**; coverage and the narrow adversary boundary are settled, whereas exact
enforcement/proof mechanisms and performance acceptance remain open.

Open implementation/acceptance gates after selecting compact v4 B, protected scope, N and the §12 logical-range option B for the MVP:

1. **Legacy policy:** B applies to a separately version-gated set of **new** Starts;
   v1/v2/v3 Hunts and their legitimate presentation cursors retain their accepted
   behavior. No existing Hunt is automatically converted. Any optional v3-to-v4
   migration needs a separately accepted, fully evidenced conversion and proof
   of original cursor continuity; decide whether such a migration is in the MVP.
2. **Specify the selected N controls:** concrete trusted Worker/DB/schema/backup
   identities, restricted production SQL grants, append-only evidence and
   owner-checked guarded procedures/live-head transitions. Set an operational
   backup/restore policy, expressly excluding privileged historical rewrite and
   restoration of an older valid complete snapshot from the N cryptographic
   guarantee; do not imply N detects either attack.
3. Freeze **N historical public-page membership**: enforce immutable app-role
   publication, define a bounded indexed original-page/header check within trusted
   PostgreSQL history, and prove no normal runtime credential can forge an old
   page, consequence or source/effect root. Define private-core, public-read and
   cursor key/rotation and missing-key behaviors for any keys actually used.
4. Freeze the v4 **active-Battle continuation** representation and the **effect-row
   and command-consequence** proof contract, including same-logical-time no-op
   heals, staged auto-capture/reward, idempotent `202` and version/OCC transitions.
   Include the bounded provenance interface for later non-Hunt changes of shared
   Inventory/Collection/progression and consumed Player-wide policy; the
   implementation must remain within accepted SPEC-015 gameplay semantics.
5. Set finite production CPU/DB-byte/latency/storage ceilings and the remedy if
   a legitimate core Battle/active-effect state exceeds them; no gameplay limit
   may be silently introduced merely to satisfy presentation performance.
6. Complete the **selected logical-range storage** amendment to SPEC-015 §9.2:
   define bounded effective-due and command-supersession selectors, original
   lease/result clocks, same-cutoff order and independently queryable command
   outcomes. A selected direction is not an accepted contract or an executable
   index plan; obtain separate Class-A approval and conformance evidence.
7. Incorporate the **selected Human retreat/heal interpretation H-01** into
   the proposed §13.4 contract: an accepted heal structurally due strictly
   before the frozen retreat target must resolve in timeline order even if
   accepted after the retreat; a later-accepted heal due *exactly at* that
   target remains excluded by the retreat's acceptance-sequence fence.
   Reconcile the narrower SPEC-013 §6.1 wording with SPEC-015 §9.2 through
   explicit cross-spec Class-A approval **before** claiming the v4 selector
   is equivalent to the accepted gameplay contract. The global pending-R
   fence also requires the **Human-selected A cross-command completion rule**
   for an abandoned R and independently advancing K (§14.1). B is unselected;
   an index alone cannot break that semantic cycle. Obtain separate
   SPEC-013/SPEC-015 Class-A acceptance before implementing A.
8. Freeze **the selected H-03 normal SQL-role/Worker authorization boundary**
   from §13.4's credential matrix: the database must verify narrowly scoped
   Worker permission **before** each spendable protected transition. A
   historical MAC complements that authorization but is not an alternative
   to the guarded write. Prove actual grants, key isolation and guarded
   legacy-compatible
   Inventory/Collection/progression. Approve only after an adversarial test
   proves that a stolen normal SQL credential cannot create a *validly
   authenticated false result*. Resolve the distinct residual private-data
   access of that credential, the cross-route resource-adoption race and
   the explicit multi-principal Hyperdrive routing. The selected N threat
   model does **not** by itself approve either concrete guard construction.

### 9.1 Selected MVP threat model N and deferred alternative S

The Human Owner selected **N on 2026-09-30 for the MVP**. The trusted boundary
includes the authoritative Worker and privileged PostgreSQL/schema/backup
administration, while the normal production DB role must be unable to modify
previously committed proof/effect history or bypass guarded writes. The MVP
expressly does **not** guarantee resistance to a DBA rewriting a coherent suffix,
a compromised privileged migration/schema account, or restoring an older valid
backup. Operational backup/recovery controls remain required, but do not turn
those exclusions into cryptographic rollback resistance. **S is a possible
separate Class-A upgrade, not an unresolved MVP choice.** Both models retain the
accepted selective Hunt consequence coverage (§3.1): N cannot omit Inventory,
Collection, progression, cross-Hunt manual capture or consumed policy proof.

| Property / adversary | N — **selected for MVP** (restricted PostgreSQL application role) | S — **deferred** (privileged PostgreSQL rewrite / restore in scope) |
|---|---|---|
| Trusted boundary | Trusted authoritative Worker/application, schema/migration administrators and retained PostgreSQL history; least-privilege runtime credentials. | Trusted Worker/secret handling **plus** an independently durable, monotonic off-DB protected-effect authority; PostgreSQL rows, WAL/backups and DB administrator are not sufficient trust anchors. |
| Tampered old Battle/effect row using normal runtime DB privileges | Prevent or reject through tested grants, append-only constraints, canonical equality/transaction checks and owner-scoped repository operations. | Authenticate committed old-row membership against retained independent proof; refuse an unverifiable gameplay operation or historical page. |
| Coherent rewrite of an entire historical suffix by DBA | **Not covered**. Same-DB checksums or an application-accessible MAC cannot honestly certify the original suffix against a privileged rewrite. | Must detect or refuse the rewritten suffix against the independently witnessed original head and authenticated old-record membership. |
| Restore of a previously valid, older complete DB snapshot | **Not covered** by the new cryptographic guarantee. Recovery follows a separately accepted operational backup/restore policy. | Must detect rollback of **previously witnessed** protected effects; the old valid DB head cannot authorize another gameplay effect. |
| In-flight PG commit not yet independently witnessed | Ordinary DB commit/OCC and SPEC-015 replay semantics, subject to the accepted narrow threat assumptions. | No newly accepted protected consequence may be acknowledged before durable off-DB completion; unresolved pre-intent versus missing PG commit cannot be guessed away, including after a malicious restore. |
| Off-DB witness/key-service outage | No new gameplay dependency on such a service for the narrow design, subject to ordinary database/authority availability. | Protected progression can return `503 authority_unavailable` and remain quarantined until a safe authenticated recovery; public-page attestation outages have their own `503` and must not be confused with private-core acknowledgment. |
| Historic public GET | Bounded indexed validation of public bytes, origin and frozen cursors under the accepted DB-role trust boundary; never call a same-DB SHA chain proof against DBA. | Bounded per-event and per-header membership in a trusted original publication root, with anti-rollback/fork and independent retention/key semantics. |
| Existing v1/v2/v3 histories | Keep their accepted version semantics and actual evidence-based public availability; no retroactive cryptographic claim. | The same: an old unsigned history is **not** made strongly authentic by merely adding an external witness now. A separately accepted independently evidenced re-attestation or an explicitly disclosed legacy exclusion is required. |

**Selected N — minimum independently testable MVP contract, still requiring Class-A specification and QA:**

1. Explicitly enumerate trusted application/DB roles, migration/backup administrators,
   signing-key readers and the actions a compromised normal DB credential could
   perform. Trust in the executing authoritative Worker is an assumption: neither
   SQL privileges nor an HMAC key available to a compromised Worker prevents that
   Worker from submitting malicious **otherwise permitted** operations. Do not
   market this alternative as protection against full application runtime compromise,
   DBA/schema-owner takeover or rollback by a backup administrator.
2. Use **forward-only**, separately reviewed migrations to limit normal runtime
   SQL privileges: no unmediated UPDATE/DELETE of previously committed private or
   public evidence; no broad DDL, trigger-disabling or unrestricted historical
   root rewrite; restrict append and mutable live-head/watermark transitions to
   transaction-bound, owner-checked, versioned operations. A controlled writer
   function must not become a generic bypass; specify its validation, execution
   identity, error paths and exact `SECURITY DEFINER`/`search_path` safeguards if
   that mechanism is selected. The current migration tree is **not** accepted
   evidence that this least-privilege role design is already deployed.
3. Preserve the §3.1 selected causal coverage and genuine shared-resource
   before/after transitions with bounded lookup; verify row-level grants and
   direct-SQL negative attacks on a disposable real PostgreSQL instance, including
   forged XP/Collection grant, Ball debit, claim result, source proof and replay
   correlation. Document operational DBA/restore exclusions in the accepted
   threat model and in any security claim for this release.

**Deferred S — additional contract only if separately selected and approved later:**

1. Design and accept an **external monotonic private-core authority**, separate
   from a potentially delayed public GET attester. Protect the ordered state of
   every acknowledged Hunt and Player-wide shared-resource effect within §3.1;
   a per-Hunt head alone cannot settle a delayed manual capture or a subsequent
   modification to the same protected Inventory/Collection resource. Keep proof
   for old private records and historical public pages independently verifiable
   using retained, separated key material and bounded membership checks.
2. Specify a durable off-DB **intent**, the winning PostgreSQL OCC/effect-row
   commit, an externally witnessed **completion**, and the order of visibility,
   acknowledgment and dependent commands. **Never hold the PostgreSQL transaction
   open across external network I/O**, per accepted ADR-005 §5; coordinate the
   staged protocol without claiming an impossible atomic commit across the two
   services. An in-PG postcommit outbox may support *optional public GET*
   attestation but cannot replace the private-core pre-acknowledgment fence.
   Reads that expose **protected current gameplay or shared-resource consequences**
   must also verify their current private witnessed boundary: a PG commit that
   has not yet been independently completed is not an externally certified
   Player state simply because its row is visible in PostgreSQL. Reject/quarantine
   that read rather than serve a potentially unwitnessed Inventory grant or an
   old-but-valid rolled-back checkpoint. Preserve SPEC-015's nonmutating GET
   semantics; witnessing/reconciliation may not be hidden inside a state read.
   Before S acceptance, enumerate the **exact current-state/read surfaces**
   that expose protected v4 Hunt state or claim a current Inventory, Collection,
   progression or policy value verified against its v4 Hunt contribution.
   Each such surface must check the relevant trusted private head and bounded
   resource membership. When freshness cannot be proved, return bounded
   `503 authority_unavailable` (or a separately approved existing error),
   **never a stale/unwitnessed successful `200`**. Preserve authenticated
   self-scoping and foreign/absent `404`, `touchActivity=false` for background
   state GET, and existing public presentation `409/410/503` semantics.
   Unrelated Player record reads do not inherit S witness requirements merely
   by sharing the same database. Existing v1–v3 reads and legitimate retained
   public cursors keep their approved availability/retention behavior unless a
   separately approved migration or explicitly qualified legacy security
   contract says otherwise; do not pretend legacy evidence gained S protection.
3. After a pending external intent, current PG state H5 may represent either
   a conclusively uncommitted H6 or a committed-then-rolled-back H6. The system
   **cannot distinguish those histories from the restorable PostgreSQL snapshot
   and external intent alone**. Require independent commit-outcome evidence or
   explicit fail-closed quarantine/recovery for that ambiguous state; no `202`,
   reissued command, fresh RNG or reward may be manufactured while unresolved.
   Preserve SPEC-015's separate 30-day continuation lease/tombstone and durable
   accepted-heal semantics (§5.10). Accept and test the operational availability
   cost **before** declaring S approved; an operator must never silently choose
   the older signed H5 as if it were the freshest legitimate state.

**Shared-resource guarantee boundary (both models):** An immutable proof that
Hunt A granted 100 items establishes that **historical contribution**, not
necessarily the current balance after later legitimate non-Hunt updates. To
certify the **current** quantity/Collection membership/XP as consistent with
that protected contribution, the verifier must authenticate the intervening
mutations of the **specific affected resource** through a bounded current
resource version/proof. Those intervening updates may originate outside a
Hunt; protecting their necessary resource transitions is not the same as
cryptographically proving every unrelated Player record. If that per-resource
closure is not implemented, the output may attest the historical Hunt effect
but **must not** attest the present mutable total. Missing source evidence or
effect records fail closed rather than being reconstructed from a newer
Inventory/Collection snapshot. Source and consumer must distinguish those two
assertions and their error/disposition contracts.

**Decision/acceptance matrix, with N tests mandatory for the MVP:**

- **N-specific negatives:** direct SQL with the production-equivalent app role
  cannot overwrite an old evidence row, forge a transition/root, disable owner
  checks or bypass a guarded write procedure; separate privileged DBA rollback
  demonstrates the expressly accepted limit, not a falsely claimed security pass.
- **S-specific negatives (future upgrade only):** acknowledged witnessed H6 followed by restore to
  valid H5; PG H6 committed but never witnessed; intent with no PG commit;
  repeated or out-of-order witness; crashed Worker after witness but before
  response; an authenticated state GET attempting to serve unwitnessed H6 effects
  or a rolled-back H5 balance; independently altered old public page/header;
  keys lost/rotated; external service offline. Verify which cases recover with independently
  authenticated evidence and which remain **fail-closed without a guaranteed
  automatic recovery**. Do not assert a verifiable commit-outcome oracle before
  one has been specified and tested.
- **Both models:** independent true Hunt→reward/capture/XP/Inventory/Collection
  provenance, non-Hunt intervening mutation of a shared resource, a consumed
  policy saved without active Hunt, terminal-source manual capture with a distinct
  or absent advancement Hunt, retry/`202`/OCC loser/30-day expiry, exact public
  page cursor behavior, real database role/RR-snapshot tests and hard restarts.

**Human MVP threat-model choice resolved: N selected.** Its privileged DBA,
schema-owner and valid-backup rollback exclusions are explicit. The exact N
permission design, historical membership checks, effect/resource authority,
key lifecycle, operational restore policy, legacy migration policy and numerical
ceilings **remain open specification/verification gates**, not tacit approvals.
A future separate Class-A upgrade from N to S would need a documented treatment
of history originally committed only under N; **it does not retroactively prove
the earlier period**. No external witness service, migration, rollout or task
promotion is authorized by this decision.

The Human Owner's selections of **B + N** settle the strategy, protected scope and
MVP threat boundary, not the final security, compatibility, migration, proof or
numerical acceptance gates. Until those specifications and required independent
pre-implementation QA/audit are complete,
SPEC-017 remains the **accepted authority**, the strict v3 codec remains unchanged,
TASK-103 retains its existing scope, and the HTTP presentation endpoint stays
**disabled**. No implementation task for v4 becomes READY on this selection alone.

## 10. Proposed executable contract for selected MVP N — pre-acceptance

This section is a **design proposal for independent review**, not an amendment to
accepted SPEC-015/017 or approval of a particular migration, cryptographic primitive,
role credential or implementation owner. In particular, a selected *threat boundary*
does not mean the existing PostgreSQL installation already enforces it.

### 10.1 Existing database and code constraints

- The inspected `0001`–`0010` migrations create gameplay/presentation tables,
  primary/foreign keys and selected validations, **but no production-specific
  `CREATE ROLE`, `GRANT`, `REVOKE`, row-security policy or append-only writer role**.
  The `0010` presentation migration creates a mutable stream highwater and
  immutable-*intended* Battle/event tables, not an independently enforced N
  privilege boundary. A table name, hash column or writer's intent to append
  does not confer PostgreSQL immutability.
- The TASK-103 writer inserts original public/private Battle provenance but
  later **updates** `hunt_presentation_battles.private_continuation_context_json`
  and its digest (`hunt-presentation-repository.ts:808-816`). This mutable
  continuation is not archived evidence of each earlier continuation state.
  V4 must preserve each accepted historical context in an indexed operation/
  event record and distinguish immutable Battle-origin/header fields from the
  separately guarded, versioned current continuation. A blanket existing-
  Battle-table no-UPDATE grant would break that legacy writer unchanged.
- `0009` stores `player_hunt_roots` and Player-wide command/policy/manual-capture
  authority, plus mutable Encounter boundary and heal dispositions. `0008` owns
  checkpoint command correlation. `0007` owns Capture attempts/constructions;
  `0004` owns reward effects and mutable Inventory/progression; `0001` owns
  Collection and the checkpoint bytes. Therefore proof membership has **more
  than one Hunt/Encounter table and more than one transaction boundary**.
- Successful capture additionally writes `pokemon_instances`,
  `pokemon_move_loadout`, `capture_attempt_constructions`,
  `capture_attempt_moves` and `species_research_counts` under the same accepted
  capture consequence (`capture-repository.ts:407-485,546-621`). These are
  authority-bearing capture side effects, not optional presentation metadata;
  proof of only Ball debit plus owned-Pokémon row is incomplete.
- `player_inventories.row_version`, `players.row_version` and
  `pokemon_instances.row_version` already exist; individual
  `inventory_entries` have a composite key and quantity but no independent
  row version. `inventory_entries` may be deleted at zero quantity. A versioned
  Item-specific proof must therefore bind the Inventory root's winning version
  **and** a canonical item identity/quantity, including an explicit zero-quantity
  tombstone in its own evidence; it must not assume a persistent zero row.
- The current `inventory-repository.ts`, `progression-repository.ts`,
  `collection-team-repository.ts` and `capture-repository.ts` write Player
  resources outside `hunts/application.ts`. `withTransaction` defaults to
  `READ COMMITTED`; the bounded presentation read explicitly requires one
  `REPEATABLE READ READ ONLY` snapshot. Neither an HTTP route nor a GET should
  be given a privileged migration/write credential.

### 10.2 Runtime privileges and immutable-record ownership (proposal)

1. **Separate identities:** use a trusted migration/schema owner credential
   solely for reviewed forward migrations and operational maintenance; a
   dedicated non-owner runtime writer with minimal `USAGE`/read and narrowly
   approved DML/`EXECUTE`; a separate read-only presentation principal; and,
   if needed, a `NOLOGIN` owner for carefully enumerated guarded routines.
   Their exact names are configuration, not protocol. Explicitly revoke default
   `PUBLIC` and old broad role grants on protected objects. Normal runtime
   principals must have no schema/object ownership, membership in migration
   roles, `CREATEROLE`, `BYPASSRLS`, superuser/DDL/extension/trigger-control
   rights, or ability to `SET ROLE` to a privileged owner. Demonstrate effective
   grants and default privileges after applying the **actual** migration chain.
   The current Hunt and authentication runtimes share a Hyperdrive connection
   setting; a separate migration CLI connection string alone does not prove
   runtime separation. Define explicit connection routing or an equivalent
   tested isolation. A caller-settable SQL session variable cannot establish
   trusted Player identity against a stolen runtime DB credential.
   **The public presentation principal must have public-column-only `SELECT`**
   (or a fixed security-reviewed public-only view/function), never unrestricted
   `SELECT` on `hunt_presentation_streams`, `_battles` or `_events`: the stream
   holds `private_prefix_digest`, Battles hold `private_origin_json` and
   `private_continuation_context_json`, and events hold
   `private_source_bytes`/digests. The current public adapter's `ownedHunt`
   loads additional private columns from `solo_hunts` despite needing only
   ownership/terminal metadata; provide a dedicated minimally projected
   owner-scoped lookup/view without granting the reader the full Hunt row.
   Verify direct SQL with the presentation principal cannot read any private
   field, regardless of the application's current SELECT lists.
   Column-only grants do **not** protect another Player's account-only
   presentation rows from an attacker holding the shared reader SQL
   credential. Under selected H-06, distinguish genuinely public rows from
   account-scoped presentation; require a demonstrably non-forgeable DB
   Player binding or an equivalently isolated principal for the latter.
   HTTP self-scope and foreign-Player `404` remain mandatory but are not
   sufficient against a stolen direct SQL reader. A caller-settable Player
   session value is not such a binding. The actual principal/routing model,
   migration and negative tests remain unapproved.
   **Existing SPEC-017 classification for H-06:** although its name and
   storage schema use `public` for *privacy-projected CombatEvent fields*,
   its accepted `GET /player/hunts/:huntId/presentation` requires an
   authenticated session, Player ownership, foreign/absent-Hunt `404` and
   `Cache-Control: private, no-store` (`SPEC-017 §3`, lines 29–37).
   Therefore **the current entire presentation feed is account-only** for
   SQL-reader authorization purposes; the projected HP/roster/events do
   **not** become freely readable by another Player merely because they
   contain no private wild-HP/RNG fields. Genuinely public cross-account
   publishing would require its own separately approved route, data
   classification, scope and privacy treatment. The existing
   `hunt-presentation-public-read.ts:44-52,169-176` predicates
   `s.player_id=$1`, but `$1` is supplied by the caller; no SQL ACL alone
   makes that predicate an independently authenticated Player identity.
   Migration `0010_hunt_presentation_feed.sql:3-29,34-71` correctly stores
   the stream's Player/Hunt owner and contains both projected and private
   columns, but it does **not** establish a deployed per-account SQL reader
   isolation principal. Deny a generic stolen reader direct table access
   to account-only streams; test all public-reader SELECT paths under its
   actual granted identity rather than treating the column label `public`
   as an authorization grant. This classification preserves SPEC-017's
   **separate** field-level privacy masks and its explicitly accepted
   owned-HP-across-Battles inference (§2); account-only access is not a
   license to expose hidden wild vitality, genetics or producer context.
   **H-05/H-06 shared-credential impossibility check:** if an attacker can
   present exactly the same PostgreSQL role/session privileges as the
   ordinary Worker or public reader and freely set the only `playerId`
   argument/GUC used by its owner-scoped query, SQL sees no independent
   fact distinguishing a legitimate query for Player B from the stolen
   credential's query for B. An RLS policy comparing `player_id` only to
   that caller-controlled value therefore does **not** satisfy either
   selected isolation decision. Before claiming tenant isolation, specify
   and inspect the independently authenticated per-request Player claim
   that the SQL read boundary can verify, or an actually isolated DB
   principal with no cross-Player privilege; the trusted routing path
   must not permit the stolen shared credential to mint either authority.
   Verify read failures for A→B with the *real* deployed writer **and**
   reader identities, including pagination, owner lookup, private source
   fetches and existing legacy-compatible functions. Merely restricting
   returned columns or relying on HTTP authentication upstream cannot
   satisfy this direct-SQL adversarial test.
   **Bounded read-authority candidate — not an approved SQL function:** do
   not grant the shared presentation principal direct `SELECT` on the
   account-only base tables, nor let the shared private Worker role obtain
   arbitrary Player-private rows through a function whose only gate is a
   caller-supplied UUID. Instead, a fixed, audited, row-capped read entrypoint
   could verify an independently authenticated per-request read capability
   binding `(purpose, Player, original authenticated Account/session,
   specific Hunt/resource scope, query shape or permitted page window,
   version, expiry, issuer/keyId)` before issuing a tenant-qualified query.
   The issuing/verifying authority must be inaccessible to a stolen SQL
   credential; a shared runtime role cannot mint or widen this capability,
   set a trusted session GUC itself, bypass the entrypoint, or call an
   unscoped historical/owner lookup. This is a **candidate** for H-05/H-06,
   not a claim that PostgreSQL now verifies account/session signatures.
   A narrow **genuine** read capability intercepted from a legitimate call
   may still be replayable for its own Player/scope during its validity; an
   independently verifiable signature does not authenticate which party
   presented it. Do **not** claim one-use read-token semantics from a
   `REPEATABLE READ READ ONLY` GET without an independently authorized state
   transition, nor turn SPEC-017's no-mutation GET into a hidden nonce writer.
   Explicitly measure that residual intercepted-token exposure and choose
   the bounded freshness/scope or a stronger non-replayable proof before
   claiming complete read confidentiality. The selected H-05/H-06 baseline
   is narrower but mandatory: **a stolen shared SQL credential alone cannot
   enumerate other Players' account-only rows without independent authority**.
2. **Archive versus mutable head:** runtime credentials cannot directly
   `UPDATE`, `DELETE`, `TRUNCATE` or replace committed private operations,
   Encounter/Battle origins, event/source bytes, effect evidence, public headers
   or public events. Only guarded, version-checked operations may append or
   advance an allowed current frontier, stream highwater, command disposition,
   resource head or mutable gameplay row. Pruning past the last legitimate
   replay/audit/retention dependency is a privileged, separately reviewed
   maintenance action; it is not an ordinary runtime write. Replayed identical
   operations read/compare the original canonical record; they never rewrite it.
3. **Guarded entrypoints:** a `SECURITY DEFINER` routine, if selected, has a
   fixed non-login owner, an explicit safe `search_path`, fully qualified object
   names, no attacker-controlled dynamic SQL, validated owner/command identities,
   expected versions and exact row-count checks. Restrict `EXECUTE` on each
   routine, including default `PUBLIC` grants. Prevent a generic arbitrary-row
   updater, generic proof-issuer or a write function that accepts unchecked
   caller-supplied rewards or `playerId`. Its transaction must use the existing
   authenticated Player/Hunt lock/OCC, reward/capture evidence and effect
   semantics. SQL-side invariant checks and the trusted game-core result must
   agree; a routine may not create a second, conflicting gameplay engine.
4. **Credential compromise is testable:** possessing only an ordinary SQL
   connection must not suffice to mint a *valid* authenticated operation,
   replace earlier accepted history, create another Player's credible effect,
   alter a trusted head or bypass a relevant resource transition. Merely hiding
   inserts behind `SECURITY DEFINER` is insufficient: a caller with arbitrary
   arguments can invoke a permissive routine. **Selected H-03 requires** a
   separately authenticatable, narrowly scoped Worker-issued permission
   verified at the mandatory guarded SQL transition **before** a spendable
   effect can commit. SQL-side bounded validation remains necessary but is
   not an alternative to that authorization. A write with invalid/unverifiable authorization may cause a
   fail-closed availability incident; N does **not** promise denial of service
   resistance against a credential holder. Full compromise of the trusted
   authoritative Worker remains expressly outside N.
5. **Legacy compatibility:** v1–v3 gameplay and original checkpoint/cursor
   semantics remain unchanged. Any older writer that can still directly modify
   a resource adopted into protected v4 provenance invalidates a blanket N
   guarantee, even if that older writer itself runs a legitimate command.
   Inventory/XP/Collection/policy write paths from **all** versions must use
   the resource guard once the specific resource has joined v4 provenance.
   Before any v4 admission, inventory all such paths and demonstrate that no
   old broad-privilege credential bypasses the guard. This may require a
   compatibility adapter, but does not authorize changing legacy game rules.

### 10.3 Original-authority attestation and current-state proof (proposal)

**Two separate authorities under selected H-03:** the *pre-write*
SQL-verifiable, scoped Worker authorization is an admission guard for a
specific live state/effect transition; the *post-winning-result* historical
authenticator proves its committed source and effects to later consumers.
Their canonical identities, actual-result equality and one-use replay
semantics must be coupled atomically. A MAC secret deliberately absent from
PostgreSQL cannot serve as SQL's own verification secret; the proposed
historical MAC below does **not** independently implement H-03. A stolen
SQL role's replay of a genuine admission capability must still be unable
to commit spendable effects without the required immutable proof (§13.4).

1. **Suggested historical attestation primitive, subject to independent review (NOT the H-03 pre-write admission guard):** the
   trusted Worker computes a versioned, domain-separated canonical MAC for
   each *winning* immutable operation, and separately for every historical
   private evidence row, public event/header and protected resource transition.
   The MAC secret is **outside PostgreSQL and inaccessible to its normal runtime
   credentials**; only the Worker can issue it. Authenticate on consumption
   using retained keys, fixed byte allowlists, explicit byte lengths and
   constant-time validation. Distinct domain/key identifiers separate private
   gameplay, public publication, resource provenance and existing 15-minute
   cursor authority. The same idea may be implemented with another reviewed
   authenticator; no new library/service or exact wire encoding is approved
   merely by this proposal. DB-side checks of the original transaction and
   Worker-side checks of the authenticator are **both** necessary under N.
2. Each authenticated operation binds `(playerId, sourceHuntId or explicit
   Player-wide source, run/input/rules/data versions, operationSequence,
   operationKind, previousHead, expected winning checkpointRowVersion or
   effectTransitionVersion, canonical next head-free state digest, command
   correlation, source evidence reference and exact committed effects)`. Its
   permanent record binds the transaction that actually won. A `202` segment,
   manual capture, policy activation or heal with no checkpoint byte change
   still has a distinct operation/effect version if it commits an authoritative
   state change. An **accepted, bound command that terminates in a rejection**
   (for example, a terminal `409`/`422`) has a durable command/correlation
   outcome and a versioned no-gameplay-effect disposition as required by its
   actual committed command transaction; it never signs a reward or capture
   that did not occur. A truly unbound request, rolled-back transaction or
   losing OCC attempt generates no *winning gameplay/effect* operation or
   MAC-valid progressed Hunt head. Preserve the accepted command-sequence,
   idempotency and exact replay/tombstone rules even when no reward is granted.
   No external request is made while a PostgreSQL transaction is open.
3. Keep an immutable **operation/effect index** by Player, Hunt where
   applicable, operationSequence and immutable effect ordinal. Bind accepted
   source Encounter/Battle when one exists; otherwise bind the genuine
   Player-wide command and its separate source/advancement Hunt identities.
   Each effect records its actual target resource identity, prior/post
   version, prior/post canonical value digest, delta or no-change disposition,
   outcome and correlation. Compare values **after** the database's winning
   guarded mutation, not against proposed request arguments. The commitment
   covers the original reward resolution, successful/failed capture, Pokémon
   grant, Ball debit, XP, healing, pending selection, claim and terminal rows
   as applicable. Successful capture also binds the full owned-Pokémon
   construction/genetics/Ability, initial move-loadout and captured-move rows,
   plus the exact `species_research_counts` before/after counter for its Player.
   Bind the source/attempt and ownership to the same successful transaction.
   Research counts are shared resources: later legitimate captures must advance
   their guarded provenance; later moves or Pokémon edits cannot retroactively
   rewrite the original construction/move evidence. An unexecuted potential
   reward is never signed as paid.
   Multiple successful policy saves at an identical Hunt logical time retain
   **each** immutable Player-wide policyVersion, command sequence, intended
   and accepted activation boundary. The existing `hunt_policy_intervals` uses
   `ON CONFLICT (hunt_id, effective_logical_time_ms) DO UPDATE`, so its final
   live lookup does not prove all earlier accepted same-cutoff saves. Preserve
   their separately indexed v4 operations and the exact version consumed by
   every intervening Encounter/capture/reward. Do not change SPEC-015's
   frozen-cutoff behavior or invent a new policy tie-break rule.
4. A resource adopted by its **first** v4 protected effect gets a signed,
   versioned starting snapshot under the existing Player/resource lock. This
   authenticates the then-current trusted PostgreSQL state as an **N baseline**;
   it does **not** prove an earlier v1–v3 or pre-adoption history. Each subsequent
   mutation to that resource, including **legitimate non-Hunt mutations**, must
   atomically write a keyed immutable transition and update a guarded current
   resource head with the same winning row/version. Use a concrete resource key,
   e.g. `(Player,inventoryItem,itemId)`, `(Player,ownedPokemon,instanceId)`,
   `(Player,playerProgression)` or consumed policy authority. A versioned
   Inventory root plus an Item's before/after quantity is needed for each
   affected item, including deletion at zero; do not treat the root version
   alone as a proof of which item changed. A later manual capture from a
   terminal source Hunt binds the original source Encounter and the actual
   then-current Inventory/Collection transition, independently of any other
   active advancement Hunt.
5. **Historical versus current claim:** an indexed MAC-valid immutable effect
   can prove an original Hunt contribution under N. To attest the **current**
   quantity/XP/Collection membership, additionally read the protected
   resource head and its live data row in one consistent, bounded transaction;
   compare the authenticated current value/version with the original indexed
   effect's resource/version identity. An append-only, version-guarded,
   no-fork resource-transition history must establish the effect's membership
   in the current lineage **without replaying all later mutations**; specify
   the fixed-size ancestry/index witness and its exact lookup bounds before
   acceptance. A signed latest head, a larger version number and an old signed
   effect **alone do not cryptographically prove ancestry** if arbitrary
   branches can be constructed. Under N, enforcement of immutable history and
   the guarded no-fork writer is part of that proof; privileged DB rewrite
   remains excluded. If an intervening writer is not instrumented or any
   row/version/proof is missing, the API must not claim an authenticated
   present mutable total or reconstruct a missing grant from latest balances.

### 10.4 Bounded old-page membership, replay and failures (proposal)

1. **For version-gated v4 historical pages**, use the existing Player-owned
   `READ ONLY` snapshot and indexed `hunt_presentation_streams`, `_battles`
   and `_events` lookups. Verify the signed publication generation/prefix and
   **every returned v4** immutable event/header against its Worker-issued,
   purpose-separated authenticator and committed identities/bytes. Legacy
   v1–v3 pages and cursors retain their existing evidence-based semantics and
   accepted `410` dispositions; they do **not** acquire a retroactive v4 MAC
   prerequisite or a stronger security claim. Validate event index and
   within-Battle sequence continuity, Battle origins, original cursor position
   and expected row counts; fetch at most the accepted `limit+1` source window
   and four headers plus the specified lookahead. Do not fetch a whole Hunt,
   private source or off-DB witness during public GET. A per-row authenticator
   alone cannot replace the guarded no-fork publication/highwater contract;
   a signed cursor alone cannot authenticate newly fetched old bytes.
2. A frozen `nextCursor` stays on its original committed prefix; `resumeCursor`
   advances only after authenticated equality of the frozen prefix and position
   with the current monotonic published head. A missing/tampered old row fails
   closed using accepted `409 snapshot_changed`/`410
   presentation_unavailable` where their existing meaning applies; a recoverable
   unavailable verifier/key provider uses the existing presentation `503`.
   Preserve owned/foreign `404` indistinguishability, 15-minute cursor expiry,
   exact 30-day terminal presentation retention, `touchActivity=false` and the
   existing `128` events / four Battle envelopes / `256 KiB` JSON ceiling.
   Reconcile the additional signed-position lookup against SPEC-017's literal
   indexed-row bound before enablement; this draft does not approve an extra
   unmeasured `SELECT` or event-row exception.
3. A private historical reward/capture/heal/audit read verifies the indexed
   original Encounter/operation and its exact unprojected evidence and effect
   authenticator. Public projection cannot substitute for private RNG,
   genetics, HP, healing or source-event authority. No unsupported repair may
   backfill from current Inventory/Collection. First terminalization remains
   atomic with its source seal. A committed gameplay effect whose optional
   presentation source is irrecoverably invalid retains its accepted gameplay
   semantics and reports a presentation-only failure; corrupted *gameplay*
   authority blocks any new dependent effect under the accepted error contract.
4. Operator key loss, rotation and service failure must be separated: retired
   signing keys are retained as long as any live Hunt, audited resource lineage
   or required public page relies on them. Define a bounded, authenticated key
   inventory and exact `503` recoverable versus `410` permanent disposition;
   never issue a fresh signature over an unproven old row or silently switch
   to a shorter retention contract. Backups, WAL, migration credentials and
   signed-row retention remain trusted operationally under N; a restored
   valid old snapshot **is not detected by N's cryptographic guarantees**.

### 10.5 Evidence needed before Class-A acceptance and v4 READY

1. **Actual permissions:** on disposable PostgreSQL, run the full forward
   migration chain with the intended migration identity and connect separately
   as every proposed runtime role. Inspect effective grants, schema ownership,
   default privileges and function ownership. Negative SQL attempts include
   `UPDATE`/`DELETE`/`TRUNCATE` old source/effect rows, direct stream-head
   replacement, direct XP/Inventory/Pokémon creation, disable/replace guard,
   `SET ROLE`, cross-Player writes and arbitrary-argument calls to each guarded
   routine. Using the presentation reader principal, directly attempt to
   read private stream prefix, original Battle sidecars, private continuation,
   private source bytes, private Hunt columns and any private proof key or
   commitment column; each must be inaccessible. Also attempt a foreign-
   Player's account-only presentation rows using that stolen reader
   credential; **H-06 now requires denial** using independently verified
   DB authorization or equivalently isolated principals, not a deferred
   choice to accept cross-Player exposure.
   Prove which cases are denied and which are detected as invalid
   Worker-issued proof; document any deliberately accepted denial-of-service
   gap. **Current `0010` alone does not pass this gate.**
2. **Real transactional causality:** commit, rollback and duplicate/retry each
   command family from §3.1 with exact original private/public proof and effect
   bytes; test parallel OCC losers, crash/restart, `202` continuation, terminal
   manual capture with another/no active Hunt, no active-Hunt policy save and
   multiple no-op heals at one logical timestamp. Test two sequential accepted
   active-Hunt policy saves at the **same** logical cutoff: retain both
   command/policy-version proofs even when the live interval pointer selects
   the latter; verify replay/OCC order and the exact policy consumed by an
   intervening or later Encounter across restart, without retroactive rewrite.
   Attempt forged reward/XP,
   captured Pokémon, Ball debit and an unchanged checkpoint with mutated
   effect-only disposition. Include forged/deleted capture construction,
   initial move and genetics/Ability evidence, and a forged species research
   increment followed by a legitimate later capture of the same species.
   All signed operation/resource heads must match
   exactly the *durably winning* rows, including rollback of the entire
   transition when a transaction loses.
3. **Resource closure:** once an Inventory Item, Pokémon, progression row or
   consumed policy is protected, exercise every other writer of that same
   resource (including older Hunt versions and non-Hunt mutations). Prove the
   original Hunt effect still has bounded indexed membership and the current
   authoritative amount derives from a guarded, non-forked resource head.
   Insert a legitimate non-Hunt change, zero out an Item row and later recreate
   it; test a forged/no-op transition and a mutated current value with no
   corresponding evidence. Do not label present balances fully verified
   until all relevant writers are covered. Recheck v1–v3 Battle continuation
   after tightening grants: a legitimate versioned private continuation update
   must still progress, while no caller can alter an old public Battle header
   or the archived earlier private continuation evidence.
4. **Historical read:** request the first, middle, last full and terminal
   pages of a long retained v4 Hunt with 1/128-event, four-Battle, byte-shrink,
   original-header and expired/resumed cursor variants. Independently tamper
   an early valid event/header and a coherent suffix through each permission
   surface, including forged but unsigned future rows. Verify bounded reads,
   unchanged public privacy and exact `404/409/410/503` behavior. A **separate
   privileged** rewrite/valid-backup restore demonstrates the **declared N
   exclusion**, not a failing cryptographic test or an S protection claim.
5. **Performance/compatibility:** independently accept finite Worker/PostgreSQL
   CPU, memory, bytes, latency and storage thresholds *before* implementing
   the bounded writer, then measure actual v4 work at 0/100/1,000/10,000 prior
   Encounters with Battle/Heal and multi-Worker concurrency. In particular,
   demonstrate finite active-Battle/effect codecs, exact source/reward/capture
   parity and safe deferral of a complete large stimulus. Existing production
   public page ceilings remain `128` events, four envelopes and `256 KiB`;
   the TASK-103 experimental count/byte profile is **not** an accepted v4
   CPU, transaction-size or duration target. No v4 Start admission, production
   migration, endpoint exposure or claim of duration-independent execution
   is approved by this section.

## 11. Candidate N storage/commit contract — additional Class-A review input

This is a **proposed implementation contract**, not an approved schema, signing
algorithm, runtime privilege migration or change to SPEC-015/017. It describes
the minimum durable identities and the order in which an authoritative Worker
could prove a successful transaction under N. Exact wire codecs, key handling,
SQL entrypoints and numeric resource bounds require independent acceptance.

### 11.1 Independent version coordinates and indexed evidence

| Candidate authority | Durable key and version | Invariant / bounded consumer |
|---|---|---|
| Compact checkpoint | `(playerId, huntId, checkpointGeneration, checkpointRowVersion)` | Strict new v4 bytes and immutable generation reference; the existing checkpoint row remains OCC-controlled. A generation is not an Encounter ordinal. |
| Hunt live head | `(playerId, huntId)` with `operationSequence`, `effectTransitionVersion`, `checkpointGeneration`, `checkpointRowVersion`, state digest and head tag | At most one authoritative current row; guarded CAS on every *winning* Hunt transition. An effect-only transition advances its effect version and operation sequence without falsely bumping checkpoint OCC. |
| Private Hunt operation | `(playerId, huntId, operationSequence)` | Immutable canonical operation, expected predecessor digest/tag, winning version, source stimulus/effect references, exact outcome and authenticated receipt. No overwrite on same-key replay. |
| Private source evidence | `(playerId, huntId, encounterOrdinal, battleId, stimulusOrdinal)` and separate `(battleId, sourceEventSequence)` | Immutable original Battle origin, stimulus, raw CombatEvents, pre/post deterministic state and archive position; indexed exact lookup and contiguous archived positions. An unfinished active Battle may append many rows, but its current frontier stays finite. |
| Player command authority | `(playerId, acceptanceSequence)` with `commandId`/idempotency identity | Immutable accepted-intent and each committed command-status/context/claim-result transition, independent of any Hunt. Expiration of the public replay result does not delete still-required protected evidence. |
| Protected resource head and transition | `(playerId, resourceKind, resourceId)` with per-resource `resourceVersion`; `(same key, resourceVersion)` for immutable transitions | Guarded no-fork CAS, canonical before/after value digests, source operation and zero-quantity tombstones. Every mutation *after adoption* of that resource participates, including non-Hunt commands and legacy-Hunt writers. |
| Public v4 publication generation | `(playerId, huntId, publicationGeneration)` with predecessor generation, highwater, frozen public prefix, logical time, terminal flag, version pins, winning operation and tag | Immutable snapshot metadata for **every** committed generation, including an empty/eventless state change. A frozen old cursor resolves its exact signed generation by index. |
| Public v4 event/header membership | `(playerId, huntId, eventIndex)` or `(playerId, huntId, battleId)` with `firstPublicationGeneration` | Sign each immutable public event/header **once at first publication**, binding exact identity/bytes, event index/Battle origin and first generation. Never duplicate/re-sign the entire old prefix for each new generation. |

The identifiers above describe logical unique keys, **not** authority to add
these tables/columns in migration `0010`. Bind the immutable record to its
owner, original source run/content/rules/schema release, stable operation
identity and actual PostgreSQL winning version; encode nullable source-Hunt
and distinct Player-wide command fields without fabricated Encounter IDs.
Public membership receipts are separate from the private source and signing
keys: a public reader credential cannot fetch private origin, raw source,
genetics, RNG, continuation state or authorization secrets. An old event/header
belongs to a later frozen generation `g` only if its signed **first** generation
is no later than `g`, its indexed position is within `g`'s authenticated
highwater, its original content/position matches its immutable receipt, and
the no-fork append rule and the frozen prefix digest agree. Signing every old
row again at every new generation would reintroduce an unbounded writer.
Legacy v1–v3 rows/cursors are version-dispatched to their existing contract.

### 11.2 Winning-transaction proof issuance

1. Outside PostgreSQL transactions, the trusted Worker loads exact frozen
   authority/content and computes a **candidate** bounded deterministic core
   advancement where SPEC-015 permits it. It retains the authenticated source
   head/OCC, command intent and all expected domain inputs; the candidate is
   never automatically authoritative. External services/content fetches and
   long replay do not execute while a transaction is open (ADR-005 §5).
2. Begin the accepted narrow transaction; acquire the Player serialization
   lock and necessary Hunt/resource locks in a documented deterministic order.
   Verify every referenced live head, retained key and canonical predecessor,
   then recheck the exact expected checkpoint or effect version, original
   policy/Inventory/Encounter authority and same-key command disposition.
   On stale authority, do not apply the precomputed result: follow SPEC-015's
   bounded continuation/recompute/replay contract using the same key, without
   minting a new reward/capture RNG or duplicate effect.
3. **Before any protected live mutation**, the guarded SQL entrypoint must
   authenticate the selected H-03 scoped Worker admission capability against
   the locked original command/Player/Hunt/resource and expected versions;
   reject stale, missing, cross-source or altered permissions. Apply the
   *actual* winning changes only after that guard, using `RETURNING` and
   locked before/after rows to capture every persisted
   effect, command-context/disposition, resource version and publication
   watermark. Preserve separate COMBAT_END → AUTO_CAPTURE → REWARD → DUE_HEAL
   transactions where SPEC-015 does; this numbered protocol runs **once for
   each real transaction**, never combines them into a fabricated atomic
   Encounter. A bound rejected command may have a committed command-only
   receipt with no gameplay effect or Hunt head advance. **Pre-write
   authentication alone does not finish the end-to-end proof:** a stolen
   ordinary SQL role holding an intercepted *genuine* capability must not
   commit a spendable change without its mandatory immutable authenticated
   source/effect receipt (§13.4). The atomic receipt/authorized-final-apply
   mechanism is a Class-A blocker, not implemented by these numbered steps.
4. While that same SQL transaction is still open, the Worker locally computes
   the domain-separated candidate MAC over the **actual returned canonical
   post-state**, expected predecessor and winning versions. The MAC payload
   excludes its resulting tag and excludes any PostgreSQL commit timestamp/LSN
   that is unknowable before commit. Insert immutable operation/effect/resource
   receipts, private/public source and guarded updated head(s) **inside the
   same transaction**. Verify exact affected-row counts and internal
   referential equality, including effect-only operations. No external signer,
   attester or network I/O participates in this transaction.
5. Commit PostgreSQL, then acknowledge only the accepted result. A locally
   computed MAC whose enclosing transaction rolls back is **not a committed
   receipt** and must never be emitted or used for recovery. On an ambiguous
   response/crash after commit, the next invocation reads the indexed durable
   command/operation and returns the original accepted replay/`202` outcome;
   it does not re-sign a new history or reapply debits. Under N the trusted
   PostgreSQL commit and guarded append-only history establish durability;
   no independent post-commit witness or privileged-rollback guarantee is
   implied.
6. A normal SQL credential cannot know the Worker-only historical MAC key and
   cannot issue the corresponding proof. A `SECURITY DEFINER` function **does
   not gain the ability to verify this Worker-only secret** merely by using
   elevated table privileges. Selected H-03 separately requires SQL to verify
   a narrowly scoped Worker *admission* authority **before** spendable writes;
   an independently verifiable capability with a pinned public verification
   key is a candidate, not an accepted implementation. Mandatory Worker-side
   MAC verification at consumption remains defense-in-depth, **not** the
   rejected alternative to pre-write admission. The guarded operation must
   bind both authorities to the same actual winning source/effect; otherwise
   the assumed honest-Worker order at steps 3–5 does not protect against an
   ordinary SQL credential committing after stealing a genuine capability.
   If no bounded atomic construction meets this constraint, v4 must remain
   disabled/`503 authority_unavailable` rather than claim N compliance.

### 11.3 Bounded membership claims under N

1. **Historical event/Encounter:** a consumer looks up the exact immutable
   row by authenticated Player/Hunt/source coordinates, recomputes its
   canonical bytes and verifies its purpose-specific tag and source position.
   For public v4 pages, verify the **signed immutable frozen generation row**,
   its old highwater/digest/terminal metadata, then each fetched row/header's
   `firstPublicationGeneration <= frozenGeneration`, indexed event position
   within that frozen highwater, and original public bytes. The empty-prefix
   generation and a later metadata-only generation must also be verifiable
   without fabricating an event or scanning old rows. Validate the guarded
   no-fork publication/source highwater in the same read snapshot. Reconcile
   any added generation lookup with SPEC-017's original bounded row/query
   budget before enablement. The combination of
   authenticated old record, indexed position and enforced append-only/no-fork
   PostgreSQL history establishes its original-prefix membership **only
   under N's trusted database-administrator assumption**; an HMAC alone does
   not independently certify membership or resist restored older databases.
2. **Current protected balance/ownership:** a verifier reads the original
   immutable effect/resource-transition at version `i`, the unique guarded
   current head at version `j` and the current live resource row in one
   consistent read, requiring `j >= i`. It verifies both signed records,
   the live row's exact canonical digest/version and the mandatory guarded
   contiguous, no-fork lineage rule for every adoption-to-current transition.
   A direct indexed lookup can avoid replaying every intervening delta **only
   after** the real PostgreSQL role/guard tests prove that no ordinary writer
   can skip, fork or overwrite a protected transition. It is an N database
   invariant, **not** a cryptographic proof from `i <= j` or two tags alone.
   An item whose row is deleted at zero has a signed zero tombstone and a
   guarded later recreation. An old captured-Pokémon construction remains an
   immutable historical fact even if later authorized changes affect its
   current moves, level or status.
3. **Authenticated state reads:** all v4-authoritative reads that expose a
   current Hunt frontier or a current protected Inventory/Collection/XP/policy
   value must verify that value's relevant current head and causal membership
   before serving it as authoritative. A missing/invalid tag, unauthorized
   resource version, incorrect current digest or uninstrumented later writer
   fails closed under the accepted authority-unavailable/error contract; a
   successful `200` from raw unverified PostgreSQL rows is prohibited for that
   protected value. These are **N's local database-proof checks**, separate
   from future S's off-DB witness/freshness barrier. Preserve self-scoped
   foreign/absent `404`, nonmutating background GET (`touchActivity=false`)
   and legacy v1–v3 read semantics. Do not silently introduce a public field
   advertising cryptographic proof of an unrelated Player domain.

### 11.4 Finite core continuation and measurement gate

The current core `SoloHuntRuntimeState` stores historical
`completedEncounters`, `completedEncounterProvenance`, `appliedHealingEvents`
and `currentEncounter.battleStimuli` in its checkpoint. Its `BattleState`
contains a resolved content context, `eventSequence`, combatants, sides,
active effects and effect scheduler counters (`types.ts:241-252`;
`solo-hunt.ts:364-427`). The v4 codec must **exclude** every growing archive
array. It must retain a finite canonical active state with complete current
HP/cadence/readiness/active effects, deterministic RNG, encounter/selection,
stable original Battle-origin pointer and the last archived source positions.
The frozen content context may be referenced by its authenticated release
identity/digest rather than recopied at every checkpoint, but the reconstructed
context must compare exactly with the accepted frozen runtime inputs before
resumption. No arbitrary cap may silently remove legal effects or valid
CombatEvents.

Before Class-A approval, prove a finite bound **for every live field**, not
merely a growing-Hunt history bound: maximum active Team/foe combatants,
effect identities per combatant, cadence carry, replacement/activation state,
content-derived context and single-indivisible-stimulus raw-event/byte size.
Audit counters that can grow even if arrays do not (`eventSequence`,
`nextEffectApplicationSequence`, resource/operation versions) for safe-integer
overflow and explicit continuation behavior. Specify how a resumed v4
`BattleState` is validated without replaying previous stimuli, and how an
independent cold audit may separately replay those archived stimuli. Validate
full source/capture/reward equality with v3 under frozen seeds, including
time-zero reactions, same-cutoff forced replacements and zero-logical-time
heals. The existing 128-event presentation budget is **not** a finite upper
bound on raw stimulus bytes or on active-effect state. Until representative
   Worker/PostgreSQL baselines and exact numeric ceilings are independently
   accepted under §8, this candidate does not establish a production workload
   guarantee or make a v4 implementation task READY.

### 11.5 Command correlation, historic source ABI and version dispatch

- A protected operation distinguishes the **outer public command** whose
  Idempotency-Key is being retried from the **domain command/effect** actually
  resolved in that transaction. Persist outer command identity (nullable for
  independently recovered domain work), domain command identity, Player-wide
  acceptance sequence, source Hunt/Encounter, optional different advancement
  Hunt, actual boundary stage, per-transaction operationSequence, and ordered
  effect ordinals. A claim/checkpoint/retreat key may advance a separately
  accepted healing command; two such heal resolutions at one logical time
  remain two distinct operations even if the checkpoint bytes do not change.
  The command acceptance sequence is **not** the per-Hunt operationSequence.
- A single terminalization may resolve many pending domain heal outcomes in
  its accepted transaction. The proof must account for **every** affected
  domain command's identity, frozen disposition and original cutoff; it may
  not equate one terminal operation with one canceled heal or emit an
  unbounded list while claiming a fixed per-operation byte bound. §12 records
  the unresolved mass-update and evidence-representation conflict with
  accepted SPEC-015. Expired public Idempotency-Keys keep their 30-day
  continuation/tombstone contract, while independently required immutable
  reward/capture/heal authority persists for its domain retention period.
- Define an indexed archived Encounter API keyed by authenticated
  `(playerId, sourceHuntId, encounterId)` plus immutable reward-source
  correlation. Its validated result contains the original frozen selection,
  individualization/Shiny/genetics origin, pre-reaction Battle origin, all
  archived stimulus/source provenance needed by that operation, frozen RNG
  and exact reward/capture opportunity. A bounded reward/capture consumer
  must not call the existing full-history replay validator on a compact v4
  checkpoint or infer evidence from the latest Collection/Inventory. Terminal
  source Hunt A remains sealed when its pending manual capture is resolved
  later with then-current Inventory, optionally alongside advancing Hunt B;
  a Player-level effect receipt binds A's original Encounter and B's distinct
  or absent advancement prelude.
- The current API `encodeWritableCheckpoint` dispatches explicitly to v3
  and otherwise performs the previously accepted legacy v2 writer promotion
  (`apps/api/src/hunts/application.ts:553-580`); the presentation producer
  currently selects v3 only. A separately accepted v4 path must explicitly
  decode/encode/verify v4 and route **every** relevant Start, advance,
  reward, capture, heal, claim, retreat, public-source and GET branch.
  An unrecognized, inconsistent or mismatched v4 schema/version **fails
  closed** and must never fall through the legacy v2 writer. Exact v1–v3
  runtime and public cursor behavior remains version-scoped and unchanged.

## 12. Selected logical-range disposition B — Class-A contract still pending

**An O(1) compact checkpoint cannot by itself make the complete command
transaction O(1).** The currently accepted gameplay command contract and
repository also perform set-based writes whose affected row count can grow
with previously accepted commands. This is a **known Class-A pre-implementation
conflict**, not authorization to change accepted SPEC-015 behavior.

**Human decision (2026-09-30): option B is selected for the MVP.** This is the
*logical range-disposition* option within §12, distinct from the already selected
Strategy B (compact v4 checkpoint) in §9. It fixes the future storage-design
direction, but does not amend accepted SPEC-015's physical update requirement.
The complete SQL/query/access contract and a separately reviewed Class-A
amendment must be accepted before the first v4 implementation; until then the
current v1–v3 behavior and task/rollout gates remain unchanged.

| Existing accepted operation | Current source | Unbounded dimension to prove or redesign |
|---|---|---|
| Mark all Battle-submitted heals due at one Encounter boundary | `hunt-orchestration-repository.ts:1332-1350` | Every still-scheduled matching healing row is updated; acceptance has no per-Encounter heal quota. |
| Terminalize and cancel all still-scheduled heals | SPEC-015 §9.2, lines 983–990; repository lines 1418–1428 | One SQL statement touches every remaining scheduled domain heal, and the accepted contract requires their terminal reason/timestamp. |
| Supersede pending commands whose cutoff was overtaken | Repository lines 557–605 | A single checkpoint segment can update multiple older pending transport-command rows and their per-command expiry/replay metadata. |
| Expire pending transport keys independently of cutoff | Repository lines 566–577 | A separate sweep sets all elapsed pending commands to `gone`, even without a newly overtaken target. Replacing only supersession leaves an unbounded write. |

SPEC-015 §4.3.1 expressly resolves **at most one due heal per invocation**
without imposing a product quota on accepted item commands; §9.2 separately
requires the terminal transaction to close all scheduled heals with a
set-based update. One SQL statement can update arbitrarily many rows; its
affected-row count, WAL bytes, transaction duration and any per-row signed
effect evidence are **not independent of the backlog**. A v4 signer cannot
simply emit one unbounded list of canceled-heal receipts and still claim the
finite source/effect-byte bound in §§2/7/8. The exact same concern applies
to bulk due classification and command supersession. Existing v3 behavior
is authoritative until a separately accepted amendment states otherwise.

**Alternative A — retain materialized per-command updates (not selected):** keep SPEC-015's
current storage and error/replay semantics unchanged. The v4 producer may
claim a finite worst-case bound only after demonstrating a separately
accepted, enforceable maximum for every affected row set. Without such a
bound, A cannot meet §2's history-independent per-invocation guarantee;
the existing no-quota heal rule cannot be replaced with a guessed quota.

**Selected option B — logical range disposition (pre-acceptance proposal):**
instead of bulk row updates, atomically append one immutable authenticated
boundary/terminal/supersession marker in the same winning transaction and
derive the affected command's disposition by bounded indexed lookup of its
frozen acceptance/cutoff identity against that marker. An Encounter due marker
supplies the exact due time for still-scheduled commands without mutating
each row. This requires a replacement for the **global earliest-due and
advance-blocker selectors**, not just per-command lookup: the existing SQL
filters on physical `due_logical_time_ms IS NOT NULL` and orders by due time
and acceptance sequence (`hunt-orchestration-repository.ts:1352-1398`). A
marker whose due command still has NULL in that column is invisible to these
queries. Freeze an indexed selector that returns the earliest **effective**
due item across stored individual resolutions and immutable Encounter-due
markers with worst-case bounded work, preserving SPEC-015's one due heal per
invocation and no NEXT_BATTLE before every due item is resolved. Until this
selector and the matching advance-blocker fence are proven, B has no fixed
work guarantee or valid gameplay ordering. A terminal marker binds the first
committed terminal reason and **domain resolution timestamp from
`transaction_timestamp()`** for every covered still-scheduled heal, matching
the accepted bulk update; this is distinct from presentation
`statement_timestamp()` and the Hunt's logical `terminal_at`. Any affected
command reads as `not_applied / hunt_terminal` with zero debit and that same
frozen domain resolution time. A supersession marker binds the first winning overtaking
cutoff, actual timestamp, excluded active key and command-kind predicate;
the supported command replay resolves the corresponding deterministic
`409 command_superseded` and retains the original 30-day result/tombstone
timing. These markers must be immutable, no-fork and indexed by Hunt, cutoff,
accepted sequence and operation position. Applied heals and already-terminal
commands cannot be overwritten by a later marker. Multiple markers must
resolve to the **first legally applicable** transition without a scan, and
recovering after an OCC loss or restart must not create a second marker.
Source proof must bind the per-command original identity to its applicable
range marker, rather than pretending every canceled heal owns a separate
physically inserted effect row in the terminal transaction.

The separate **expired-pending transport-key sweep** must be eliminated from
the v4 command critical path too: an exact-key indexed read derives `gone`
when its **original** `continuationExpiresAt` has elapsed, retaining
`410 idempotency_gone` and the original tombstone semantics. No new advancing
command may trigger a full pending-command expiration sweep. A terminal
**domain** marker does not advance the public transport key to terminal
status. For example, a heal key accepted on day 0, Hunt terminalization on
day 29, and its first retry on day 31 must still return `410`, not receive
a new terminal-result lease from day 29. A supported first exact-key retry
may separately record its accepted terminal `200` snapshot and start the
result/tombstone clocks prescribed by SPEC-015; the immutable domain
cancellation survives independently after the transport key expires.

An index on `(hunt,cutoff,acceptedSequence,operationPosition)` alone does
**not** prove bounded lookup of the **first legally applicable** marker.
Repeated `202` segments may produce many earlier markers that exclude the
active command key, and other markers can fail the frozen cutoff/kind/expiry
predicates. A naive range scan plus `ORDER BY ... LIMIT 1` can read all of
them. Specify an executable, bounded selection proof/index, or demonstrate
from accepted invariants that the problematic exclusion/cutoff cases cannot
arise. The selected marker must bind its exact eligibility predicate,
original command identity and version, and winning operation proof; caller-
supplied unsigned markers never authorize a cancellation or supersession.

An indexed marker **does not by itself preserve an old HTTP response body**.
For a canceled healing command whose supported replay returns terminal `200`
with an item-specific result and a Player-wide state, freeze or separately
version the required terminal/source-Hunt command-result snapshot and bind it
to the marker plus the immutable original healing-item parameters. Never
construct an alleged old command snapshot from a later unrelated Hunt,
Inventory change or new standing policy. If the accepted behavior materializes
the response only at the first later replay, that first result needs its own
bounded, once-only immutable command receipt without another gameplay effect;
subsequent same-key replay returns identical bytes. Specify that distinction
against SPEC-015's exact transport contract before adopting B, including
expiry before the first replay and a new Hunt started meanwhile. The current
first-result routes also differ: `application.ts:2158-2195` may construct a
Player-wide state through `stateFromClient` (possibly including a different
active Hunt B), while `application.ts:3438-3480` uses `terminalStateForHunt`
with `activeHunt=null` for the terminal source Hunt. Freeze the precise
eligibility and result shape of **both accepted routes** before replacing
physical heal cancellation; verify A terminalizes, B starts, an unexpired
first heal retry resolves, and every subsequent same-key replay is byte-equal.

Selected option B must preserve the **observable** SPEC-015 logical ordering, item
debits, same-key replay, terminal outcome, pending-heal closure and timestamp
if validated. But it **changes SPEC-015's explicit materialized domain-row
update requirement** and therefore needs its own Human-approved Class-A
amendment and exact SQL/HTTP conformance proof before v4 implementation.
The durable domain resolution must remain independently queryable after its
public transport key expires; no lazy read may mutate gameplay, advance a
Hunt or silently backfill a physical row. A future operator compaction may
materialize rows offline only if the authenticated logical outcome remains
byte-identical and cursor/replay windows are preserved.

**Alternative C — segment the bulk closure (not selected):** process a fixed number of rows
per transaction and yield `202` while retaining an authenticated pending
terminal phase. This changes the accepted atomic first-terminal row/visible
completion semantics unless an additional bounded, separately approved
barrier is specified. Do not implement C by terminalizing gameplay first and
leaving canceled heals apparently pending to current state readers.

Before selecting a representation, benchmark the actual active pending
command/heal cardinalities and WAL/row bytes at 0, 100, 1,000 and 10,000
prior Encounters with increasing outstanding-heal counts; prove worst-case
bounded SQL work, no-event command transitions, first-terminal atomicity,
same-time acceptance order, 30-day idempotency, terminal domain timestamp
versus public result/retention clocks, exact-key pending expiry without a
bulk sweep, bounded global earliest-due/advance-blocker selectors, bounded
first-applicable-marker lookup, late healing-command replay after a different
Hunt Start (covering both current first-result projection branches), frozen
command-result state and independent audit access.
**Owner's storage direction resolved: §12 option B selected.** Unresolved
*technical approval gates*, not another A/B ballot: effective earliest-due and
advance-blocker indexed access, exact first-applicable supersession marker
selection, lease expiry and supported first-result replay including the two
terminal-heal branches, irreversible authenticated publication/effect receipts,
all-writer ACL closure and measured Worker/PostgreSQL limits. No production
migration, gameplay change, spec status promotion or public endpoint enablement
follows from the direction decision alone.

## 13. Proposed SPEC-015 Class-A amendment for selected §12 B — NOT ACCEPTED

**Scope and authority.** This is the reviewable *candidate replacement* of the
physical mass-update mechanism in SPEC-015 §4.3.1/§9.2, plus the corresponding
command-expiry/supersession implementation. It is **not an amendment to the
accepted SPEC-015 until separately reviewed and accepted**. Only v4-gated new
Starts use it; v1–v3 continue their accepted materialized rows. Selection of
§12 B does not change Player-visible curing, ordering, rewards, capture,
inventory consumption, one-due-heal-per-invocation, time cutoffs, idempotency,
recovery or first-terminal atomicity **by virtue of changing storage alone**.
The separately Human-selected H-01 interpretation of later-accepted healing
due *before* retreat is a **distinct pending cross-spec Class-A clarification**
(§14.1); do not claim that selected direction already amends the narrower
accepted SPEC-013 wording or is proved gameplay-equivalent by the index
replacement. Domain/transport clocks remain separate.

### 13.1 Proposed immutable domain authorities and effective status

1. The original accepted heal command is indexed under immutable
   `(playerId, sourceHuntId, commandId, acceptanceSequence,
   submissionCutoffLogicalTimeMs)`. Bind the frozen item, target, rule version,
   phase and Encounter identity when classified. **One physical command is
   classified or resolved at a time**, and only its own row/head may change.
   Immutable accepted command receipts are retained independently of the
   public `Idempotency-Key` lifetime. Post-adoption, all affected writers and
   authenticated readers use the same effective-status projection.
   Enforce a unique Player-wide acceptance key for the v4 contract: the
   existing root lock increments the counter, but `0009` has no declarative
   `UNIQUE(player_id, acceptance_sequence)` on public commands. Specify and
   test that constraint in a new forward migration, including pre-existing
   commands and same-key retries. Public transport expiry **never** removes
   an unresolved domain heal from U/I/B candidate indexes.
2. A `due_encounter` authority is an immutable winning operation at the
   *accepted* Encounter completion/boundary transition. Its scope is exactly
   `(playerId, sourceHuntId, encounterId, dueLogicalTimeMs,
   acceptanceOrderFence, operationSequence, provenanceTag)`; it does not
   require updating all Battle-submitted heal records. The effective due time
   for a classified, still-scheduled heal in that Encounter is the marker's
   time, never a later inferred checkpoint time. Inter-Battle heals retain
   their own frozen cutoff when classified. An unclassified heal retains its
   submission cutoff and must be processed/classified before advancing beyond
   that fence. No Encounter marker exists before the owning boundary commits.
3. A `terminal_cancel` authority is inserted **once** in the same transaction
   as the first authoritative `solo_hunts` terminalization and presentation
   seal/unavailable disposition. It freezes source Hunt, original terminal
   reason, the **domain** `resolvedAt = transaction_timestamp()` sampled in
   that SQL transaction, the **live Player acceptance-sequence highwater at
   terminal commit**, owning proof head before/after and the predicate
   “scheduled at this winning operation”. This terminal-closure highwater is
   distinct from a retreat command's original `beforeAcceptanceSequence`:
   that earlier fence decides which heals may execute *before* the retreat
   at an equal logical boundary, but does not narrow the first terminal
   cancellation. A heal accepted while retreat was pending on `202` and still
   scheduled when terminalization wins is included even if its acceptance
   sequence exceeds the retreat's original sequence.
   **For an explicit retreat R with frozen target T, selected H-01 permits
   this `terminal_cancel` insert only after a winning locked recheck proves**
   (a) no accepted *unclassified* submission with cutoff C<T remains
   unexamined, **nor an unclassified C=T with
   `acceptanceSequence < R.acceptanceSequence`**; (b) no classified or
   authenticated marker-derived heal due at D<T remains unresolved; and
   (c) no due-at-T heal with
   `acceptanceSequence < R.acceptanceSequence` remains. If such a preceding
   structural blocker exists, R must reject/defer and let the bounded
   one-heal/classification winner resolve it first; merely labeling it
   `scheduled` cannot authorize R to cancel it. A submission classified
   as Battle due at D>T may remain scheduled for legitimate terminal
   cancellation; do not execute a future heal merely because its earlier
   submission cutoff C<T **or C=T** has been classified. Later-accepted
   same-T scheduled heals may be canceled by R's terminal marker. **For an
   independently reached automatic terminal boundary** (for example,
   `no_living` at T_auto strictly before R's target), the accepted SPEC-013
   §5.7/SPEC-015 §9.2 automatic-terminal and domain-cancellation rules
   govern instead; do **not** graft R's frozen acceptance sequence or the
   H-01 retreat-only tie-break onto the automatic reason. The ordinary
   no-skipped-earlier-boundary invariant still applies to advancement
   preceding the automatic terminal, but the terminal-specific due-heal
   priority requires a **separate accepted-contract proof**, not an invented
   `R.acceptanceSequence` on an automatic event. For
   every eligible heal with no earlier committed point-resolution, the
   effective outcome is exactly `not_applied / hunt_terminal`, `healedHp=0`,
   `debit=0`, with the original domain resolution time. The public presentation
   `statement_timestamp()` and terminal Hunt logical anchor retain **their
   independent original meanings**. A second invocation never moves the
   cancellation time or mints a second seal.
   **The R acceptance fence is global while R is an authentic, still-executable
   pending retreat.** It cannot be enforced only by R's own continuation.
   Before *any* v4 point-heal resolution, classification that makes a heal
   immediately applicable, same-T NEXT_BATTLE admission or independent
   advancement through an R target T, the winning Player/Hunt-serialized
   transition must check for an earlier accepted retreat R with frozen
   `(sourceHuntId, target T, acceptanceSequence S)` and an authenticated
   executable public/domain status. A heal due at D<T remains eligible in
   the universal timeline; at D=T, an H with sequence >=S cannot consume
   Inventory or change HP while R has precedence. R must first resolve its
   earlier same-T work and win the terminal disposition, or a *separately
   authorized* superseding/expiry outcome must durably displace R before
   H can be reconsidered. An incomplete Battle creates no fictional due
   time. One must not apply H, then use a later K crossing beyond T to
   retroactively justify that same-T debit. A prior independently committed
   legitimate effect is not rolled back to repair a lost ordering race.
   A superseded or gone R is not itself permission to cancel H; the winning
   Hunt terminal authority, if any, determines domain cancellation.
   The bounded, SQL-verifiable lookup of the **first applicable R** across
   multiple pending retreat correlations, its original expiry and H-02
   clock-integrity evidence, and the ability for a different accepted K to
   supersede R without skipping a due heal or deadlocking are still open
   Class-A requirements. Do not assert that one application-supplied
   `beforeAcceptanceSequence` parameter proves global H-01 compliance.
4. Explicit single-heal `applied`/`not_applied` point-resolution is immutable,
   authenticated and compared by winning operation ordering to the terminal
   marker; an earlier point-resolution takes precedence and cannot be canceled
   again. Later unsigned rows, post-terminal heal acceptance, or another Hunt's
   domain record cannot inherit a terminal marker. A marker must not sign a
   fictional Potion debit or invent a Pokémon HP delta. Absence of a point row
   proves the logical cancellation only if the guarded SQL no-fork transaction
   and independently authenticated marker, acceptance fence and source Hunt
   identity all verify under model N.
5. The `hunt_public_commands` transport key has an **independent** status:
   pending expires at its original `acceptedAt + 30 days` even when its heal
   domain became `not_applied / hunt_terminal` on day 29. On first exact-key
   retry after this pending lease, return `410 idempotency_gone`; retain its
   original accepted-intent tombstone until the prescribed expiry. A supported
   retry before expiry may commit its original route-specific terminal `200`
   result; only that **actual accepted terminal-result timestamp** starts the
   separate 30-day full-result and 30-day tombstone clocks. An immutable
   result receipt then fixes the complete response body for subsequent replay.
   Do not create a new 200 lease when a domain marker appears, and do not
   reconstruct a prior response from unrelated later Player state.
   **An earlier genuinely committed supersession is different:** if an eligible
   crossing terminalized the *public* command as `409` before its pending
   lease expired, its 30-day terminal-result clock starts at that crossing's
   frozen timestamp, not at the original acceptance or later lookup. A reader
   must resolve the first committed transport terminal outcome **before**
   applying the fallback rule for a key that remained pending until expiry;
   otherwise replay can incorrectly turn a valid terminal `409` into `410`.

### 13.2 Proposed fixed-number indexed selection protocol — proof still open

Each command invocation may execute a fixed **number of index seeks and
guarded single-row writes**, not a query that iterates every scheduled heal,
Encounter or elapsed transport key. B-tree seek costs can grow logarithmically
with total retained rows; “history-independent” here excludes linear
replay/sweeps, **not** physical index height, WAL and lock overhead. Exact
query plans and benchmark ceilings remain pre-acceptance gates.

1. **Candidate three-stream index design:** maintain one partial B-tree seek
   each for (U) still-scheduled unclassified heals by
   `(sourceHuntId, submissionCutoffLogicalTimeMs, acceptanceSequence,
   commandId)`; (I) classified inter-Battle heals by
   `(sourceHuntId, dueLogicalTimeMs, acceptanceSequence, commandId)`; and
   (B) classified Battle heals by
   `(sourceHuntId, submissionEncounterOrdinal, acceptanceSequence, commandId)`.
   Each index excludes point-resolved heals; every seek uses `LIMIT 1` on an
   already eligible partial index, not a filter that scans an unbounded list
   of noneligible historical rows. The v4-added frozen Encounter ordinal
   must be validated against the existing EncounterId/source authority;
   current `0009` has `submission_encounter_id` but **no ordinal column**.
2. U's first key is the next prelude/classification blocker. I's first key
   is the next explicitly due inter-Battle heal. B's first key identifies
   the oldest Battle-classified still-scheduled command; one **exact indexed**
   `due_encounter`/boundary lookup by that original EncounterId returns its
   authentic due time if that Encounter's capture/reward/boundary stage has
   committed. If its Battle is ongoing, B is **not yet due** and may not be
   treated as a ready heal. Prove the accepted “all due heals before next
   Battle” invariant implies no old Encounter group can remain scheduled
   while a later Battle is legitimately active; otherwise this simple B-head
   selection is insufficient and needs another authenticated indexed group
   summary. No lookup may skip N older empty Encounter groups to find B.
3. Compare at most U, I and eligible B by
   `(effectiveLogicalTimeMs, acceptanceSequence)` in the same consistent
   Player/Hunt snapshot. The **advance-blocker** uses all three with the
   correct submission/structural phase fence; the **due-only selector** uses
   I/B *after* committed Encounter capture/reward disposition, and first
   checks that U does not have an earlier effective blocker. Preserve the
   existing `beforeAcceptanceSequence` exclusion of equal/later accepted
   heals **only in retreat's final same-T window**; selected H-01 forbids
   applying that filter to a heal whose structural due boundary is strictly
   earlier than T, even when its acceptance follows retreat. Recompute
   and compare the same earliest candidate **after** the
   Player/Hunt lock; no `SKIP LOCKED` or stale candidate may jump another
   command's turn. A physically NULL Battle `due_logical_time_ms` is still
   effectively due if its authenticated Encounter marker says so. Each
   point-resolution changes only one command/index membership. No
   NEXT_BATTLE or later-time advance is admitted while an effective due
   command at the boundary remains. The actual PostgreSQL index plan and
   frozen-data invariants still require real negative/concurrency fixtures.
   Every v4 application caller of `healingAdvanceFenceLogicalTimeMs`, direct
   `waiting_boundary` checks, due-heal resolution and advance-blocker
   selection must read the **effective** marker-derived due time rather than
   treating the old nullable `dueLogicalTimeMs` as proof of no due work
   (`application.ts:545-550,1881-1945,2057-2128,2235-2240,2312-2320,
   2248-2255,2463-2468,2703-2712`). An overdue prior Battle marker is an
   authority violation requiring fail-closed recovery, never an excuse to
   skip an old heal or spin forever on `202`.
   After each single-heal point-resolution or U→I/U→B classification,
   recompute the earliest candidate. Recheck it again under serialization
   **immediately before** zero-gap NEXT_BATTLE or retreat terminalization,
   including a concurrent heal accepted at the same logical T. The source
   phase is determined by that winning structural boundary: `inter_battle`
   before the newly admitted Battle and `battle` afterward. A terminal
   command's frozen acceptanceSequence excludes later accepted commands
   only from its **same-T final preceding-heal window**, not the earlier
   structural timeline (H-01); it does not delete their accepted domain
   history. That exclusion must also constrain **another command's** heal
   resolution at the same T when an authenticated earlier retreat remains
   executable (§13.1). A pending retreat is not silently treated as
   terminal, nor can a later command bypass it based on an unlocked or
   caller-supplied status. Prove a bounded retreat-fence lookup under the
   winning Player lock for every affected writer; if another command can
   validly supersede R, its authenticated winner/disposition and subsequent
   due-heal order must be proved without a circular wait.
4. A terminal marker makes every still-scheduled eligible source-Hunt queue
   logically closed at its own winning operation: the public/domain read
   consults that single marker before selecting a pending item. Do not read
   all queued rows to close it. A new Hunt uses a new sourceHuntId and cannot
   inherit this closed queue. Live queue/head edits remain lock/CAS-guarded
   against parallel accept, point-resolution, retreat and ordinary progress.
5. Replace *both* existing bulk pending-command updates: the expiry sweep
   derives `gone` from the selected command's immutable original lease using
   one indexed exact-key query, while command supersession must derive the
   first actual eligible crossing of the command's target logical time
   **after the target/advancement-Hunt identity was durably frozen**. The
   existing conditional supersession predicate requires the same Player,
   advancement Hunt, still-pending transport command at the winning marker,
   eligible non-`heal_item` kind, non-null frozen target, **strictly**
   `targetLogicalTimeMs < committedLogicalTimeMs`, current sampled DB time
   before the command's pending expiry, and the optional actively excluded
   commandId. An explicit earlier terminal result wins. Preserve separately
   frozen command target/advancement updates; some are persisted *after* the
   initial acceptance (`hunt-orchestration-repository.ts:527-541`). A suggested
   index is on strictly increasing Hunt
   advancement/crossing highwaters, with immutable crossing operation,
   accepted command-sequence fence and committed timestamp. A single
   first-greater-than-target seek may be sufficient **only if proven** to
   respect the active command exclusion, possible equal-time operations,
   nonmonotonic queued targets and first terminal result. If not, freeze a
   different indexed summary with the same bounded guarantee. Do not call
   `ORDER BY operationSequence LIMIT 1` bounded when it can walk arbitrarily
   many ineligible markers. Exact replay/expiry time must match the winning
   supersession operation, not the time of eventual GET or first retry.
   **Conditional fast-path proof to test:** record an authenticated first
   crossing only when the committed Hunt highwater strictly rises. If (a) this
   highwater is nondecreasing, (b) a newly frozen command target T is never
   smaller than the then-current highwater, and (c) K **cannot originate the
   first strictly rising checkpoint transition across T** as its own
   cutoff-bound advancement on the same frozen advancement Hunt, then the
   first indexed `newHighwater > T` necessarily follows K's target freeze
   and **cannot be a K-excluded marker**. K *can* commit a later checkpoint
   **at** a highwater above its original submission cutoff after another
   command first crossed T: for example an accepted heal submitted during
   Battle at C=T and actually applied at inter-Battle D>T. That is an
   already-crossed, same-highwater domain effect, **not K's first rising
   crossing**. Distinguish the original outer advancing command, a separately
   resolved domain heal and the source versus advancement Hunt. An exact
   `(playerId,huntId,newHighwater)` seek with
   `> T ORDER BY newHighwater LIMIT 1`, followed by bounded identity/status/
   acceptance/expiry checks, could therefore identify the first legal
   crossing without scanning thousands of earlier `202` segments. A **first
   rising** crossing attributed to K itself, or a target frozen behind the
   current highwater, is a **failed invariant** to quarantine rather than
   permission to skip an
   arbitrary number of ineligible markers. Prove these hypotheses for each
   command kind/target-freeze route and simultaneous terminal/OCC behavior;
   until then this is **not an accepted SQL plan**. If any hypothesis is false,
   design a separately reviewed fixed-seek authenticated range-summary index
   (including eligible/excluded command identity and commit order) and measure
   it; do not fall back to an unbounded historical marker scan.
   **Ordering authority:** marker operationSequence/guarded highwater is the
   ordering key, not PostgreSQL wall-clock timestamps. A sampled
   `clock_timestamp()`/`transaction_timestamp()` can tie or regress; it cannot
   establish first-commit ancestry on its own. Authenticate the index/summary
   root and its **earliest** applicable marker, including missing-earlier-row
   detection under N's no-fork SQL restrictions. Independently specify the
   behavior for a database-clock regression across pending expiry,
   supersession or terminal-result lease: once a command is demonstrably
   gone/terminal, later reads cannot silently resurrect it merely because
   the clock moved backward. Do not claim a monotonic-clock implementation
   or exact v4 timestamp remedy exists before that design is tested.
6. Each logical marker, queue-head advance and eligible command outcome is
   authorized through the selected N guarded CAS and immutable Worker-issued
   source/effect proof. A raw SQL role must neither insert a credible marker
   nor make unsigned outcomes visible as current gameplay. Any marker or
   queue inconsistency fails closed; GET cannot repair/mutate state. Versioned
   v1–v3 read/command implementations do not use these v4 markers.

### 13.3 Conformance and acceptance matrix (still required)

| Case | Required independent proof |
|---|---|
| 0, 1, 100, 1,000, 10,000 queued heals | Same bounded number of indexed candidate/marker reads and point writes for one invocation, without unbounded returned rows or SQL-affected rows; record measured p95/p99 DB work and WAL. |
| Multiple heals accepted in the same Battle | Boundary marker makes all eligible heals effectively due without mass `UPDATE`; earliest acceptance sequence first, exactly one heal resolution per invocation, zero-gap NEXT_BATTLE blocked. |
| One unresolved Battle N heal remains when Battle N+1 is attempted | Earliest B-stream ordinal exposes the old heal; transition fails closed or resolves the original eligible due command first. Never treat an old signed marker as invisible because a different Battle is now current. |
| Retreat acceptance fence with regression and 202 continuation — H-01 selected | Freeze R12/T600 while Hunt highwater H500, then accept H13 with an independently regressed raw clock and cutoff C500. H13 participates in the **unfiltered structural blocker** at C500; if its authenticated effective due boundary is strictly before T600, resolve it before R12 even though H13 was accepted later. A Battle-classified heal may wait for its authentic Encounter marker D>=C; an unresolved earlier-due blocker at H600 must fail closed rather than be skipped. If H13 is due **exactly** 600, earlier accepted H11 due 600 wins first, then R12 terminalizes and cancels H13 under the acceptance-sequence rule. Include OCC loser, unfinished boundary, restart and gap-zero cases. This is a **Human-selected proposed interpretation**, not a claim of already amended SPEC-013/SPEC-015. |
| Older retreat R12/T600, later H13 accepted in an ongoing Battle at C500 and due at D550 — H-01 selected | Expected proposed behavior: H13 resolves at D550 before R12 at T600; the R=S12 acceptance fence applies only at T600. SPEC-013 §6.1 item 4 names heals accepted before retreat and still needs an explicit normative cross-spec clarification; obtain Class-A amendment and independent gameplay-equivalence tests before marking the final contract accepted. |
| H13's own continuation reaches R12's exact T600 before R12 retries — H-01 cross-caller fence | Accept R12, persist an inter-Battle checkpoint at T600 while its original correlation remains pending `202`, then accept H13 at C=T600. Run H13's **own** `items/use` continuation first. Its candidate due heal must not debit Inventory or increase HP while R12 remains the authenticated earlier same-T authority; R12's accepted prior due H11 resolves one per invocation, then its valid terminal seal cancels H13. Test classification and point resolution separately, reverse lock order, retry/restart, no accepted prior H11, and expired/superseded R branches. The existing application `progressHealingCommandOneStep` calls the due helper without R's sequence fence (`application.ts:2218-2228,2322-2327`); the retreat caller alone supplies it (`:2684-2692`). This is a **DRAFT conformance counterexample**, not a reproduced v4 incident. |
| Independent K advances while R12/T600 and H13/D600 are pending — selected A | Freeze K's independent target at T601 and force both K-first and R-first Player-lock orders. K cannot first apply H13 at 600 and only afterward use its own crossing to claim R was superseded. In the R-abandoned trace, K cannot cross 600 while H13 is due; H13 cannot point-apply while R12's earlier same-T authority is live; and a crossing beyond 600 is the *existing* predicate needed to supersede R12. The one-heal-per-invocation rule also forbids using an applied H13 and a later-than-600 crossing in the same invocation. **Prove selected A:** an eligible independent invocation first helps the still-valid original R win its authenticated T600 terminal disposition, then H13 and K separately reconcile with their own immutable results, without fictional K>T or retroactive Potion debit. If R or the helper is ineligible, fail closed or follow an independently valid existing terminal/expiry disposition; do **not** silently preempt R under unselected B or treat indefinite `202` as a preapproved availability policy. Prove bounded per-invocation work and explicitly document any remaining time-to-progress limitations. Class-A alignment and real SQL evidence remain **OPEN**. |
| Multiple pending R keys at T600, with 10,000 expired/earlier-ineligible rows — selected A | Accept several R correlations with different frozen targets and acceptance sequences, retain an exact eligible R at T600, then advance the guarded transport clock so a large prefix is expired, gone or already superseded while H13 and K target T601 arrive. Return the **first genuinely executable R with sequence preceding H13 and target exactly T600**, or a signed absence result, using a proved bounded indexed/guarded selector; never scan 10,000 discarded pending rows using `ORDER BY acceptance_sequence LIMIT 1` plus an unindexed expiry/status filter. Source-Hunt identity, first crossing, H-02 decision-time witness, original pending lease and original intent are all mandatory; neither an unrelated earlier R nor a forged/later R can fence H13. Prove that **selected A's helper and ordinary R exact-key replay** use the one authoritative R result without duplicate terminalization or unbounded cleanup. B is an **unselected comparator**, not an admissible helper fallback or a mandatory implementation path. |
| One earlier due H11, retreat R12, 10,000 later heals due at same T | All later heals are accepted in a Battle before its committed Encounter marker freezes the shared due time T; H11 sequence 11 precedes R12, the other 10,000 have sequences above 12. At final R target H=T, the first U/I/B global due head must be H11; resolving it consumes one invocation. The next first head is excluded by R's sequence, allowing one terminal marker to cancel the scheduled suffix with no 10,000-row scan/update. A due item with effective time below H is fail-closed, not silently skipped. |
| Invalid v4 phase-shape rows hidden behind valid index heads | Stage one valid B head plus a v4 B record with missing ordinal, and one valid I head plus a v4 inter-Battle record with NULL due time. Candidate ascending index order can place invalid NULL keys later: the final SQL version-scoped CHECK/guard must reject each write or an authenticated constant-time invalid-head sentinel must fail closed before any earlier/later Battle admission; validating only the returned valid first row is insufficient. Legacy v1–v3 nullable rows retain version-dispatched semantics. |
| Classified B heal before and after Encounter completion | While its original Battle is genuinely incomplete, B may have physical NULL due time **and no marker**, and is not due. After the authoritative reward/capture boundary commits, physical NULL remains valid only if the exact authenticated original-Encounter marker supplies its effective time. A completed Battle with a missing/forged marker must return authority unavailable rather than be skipped. A non-NULL stored B due time must agree with the original marker and EncounterId/ordinal. |
| Newly accepted heal races an already-computed advancement | K loads no blocker at highwater H10000, prepares a bounded advancement to H15000, but before K obtains the Player lock another request durably accepts Hnew with frozen cutoff C12000 without changing checkpoint OCC. The winning v4 persistence transaction must re-read the earliest **effective** blocker after acquiring the Player/Hunt locks and refuse K's stale H15000 checkpoint, source events, rewards and NEXT_BATTLE; recompute a bounded segment ending no later than C12000 instead. Test both with and without an Encounter boundary and with a concurrent losing OCC candidate; the existing v3 unlocked-read sequence is not proof of safety. |
| Battle-submission cutoff vs inter-Battle cutoff at the same logical time | Existing combat/reward/capture, due/classification and acceptance-sequence order wins; unclassified and classified blocker choices match accepted SPEC-015. |
| Same T: Battle H11, unclassified H12, inter-Battle H13, retreat R14 (acceptance 11/12/13/14) | After COMBAT_END→AUTO_CAPTURE→REWARD, resolve H11; next invocation classifies H12 at T; next resolve H12; next resolve H13; only then R14/NEXT_BATTLE is eligible. With retreat R12, only earlier H11 may apply, and remaining scheduled heals become terminally not-applied. Each due heal still consumes at most one invocation. |
| First terminalization with pending heals | Single terminal marker and first terminal presentation seal share one commit; every eligible heal reads original `transaction_timestamp()`-based domain result with no item debit, without per-command update. Retreat R10 can remain pending across `202` while H11 is accepted: **if H11 is due strictly before R10's T, selected H-01 requires resolving it first**. If H11 is due at T but was accepted later, or is otherwise still legitimately scheduled after all preceding obligations are resolved, the terminal fence cancels it; a previously point-applied H11 remains applied. |
| Automatic `no_living` at T_auto preceding pending retreat R/T600 | Freeze R's stop at 600 but reach an authentic automatic terminal at T_auto=550; first terminal seal, recovery anchor and logical `terminal_cancel` all bind **550 and `no_living`**, not R's frozen 600 or sequence. A heal whose valid effective due is 570 remains scheduled until the automatic terminal and becomes `not_applied / hunt_terminal`, even if it was accepted before R. For an actual due-at-550 item, independently establish the accepted automatic-terminal boundary ordering without importing H-01's retreat-only same-T tie-break or inventing a synthetic R acceptance sequence. A retry of R converges on the original `no_living` result. Test separate automatic terminal paths from `application.ts:2332-2358,3251-3320` versus the explicit retreat path `:3345-3401`, plus genuine source phase, Potion debit, recovery and public proof. |
| H-01 terminal-cancel guard with an unclassified earlier submission | R12 has frozen T600; H13 was accepted later with unclassified submission cutoff C500. If its authentic owning Battle completes at D550, classify and apply H13 before permitting R12's terminal marker. In a distinct trace where the owning Battle **remains incomplete at T600** (and would otherwise finish around D650), classify C500 as Battle-phase without fabricating a committed D650 completion marker or forcing an unripe heal at T600; terminalization may legitimately resolve it `not_applied / hunt_terminal`. Neither case may skip an unclassified C500 head or let an unlocked stale U/I/B read decide the terminal result. Test both cases with competing locks, abandoned `202` segments and 10,000 later same-T submissions without a mass UPDATE. |
| Original heal Idempotency-Key expires before its scheduled domain boundary | Exact-key request returns `410`, but its unresolved accepted domain heal still participates in U/I/B at the frozen cutoff; transport expiry alone cannot cancel or consume it. |
| Heal key accepted day 0, terminal source Hunt day 29, first retry day 31 | Domain `not_applied / hunt_terminal` stays valid; public key returns `410 idempotency_gone`, never a refreshed terminal `200` lease. |
| Source Hunt A terminal, Hunt B active, unexpired A heal key first retry | Preserve **both actual first-result route conditions** (`stateFromClient` versus `terminalStateForHunt`), item-use and state projection; freeze one accepted `200` body and replay it byte-identically. |
| 100+ unrelated/equal-time supersession/expiry markers, including repeated `202` by one excluded key | Exactly the first *eligible* transition determines `409` or pending; no ineligible-marker linear scan, retroactive timestamp or cross-Hunt effect. A single crossing that supersedes 10,000 pending keys writes one authenticated range marker, not 10,000 per-key terminal receipts; supported exact-key lookup may materialize only its own bounded receipt and retains the original crossing's timestamp. |
| First highwater crossing is omitted from the indexed marker stream | Hunt highwater advances H24→H35 then H35→H50, frozen K target T30. Deleting only the original H24→H35 marker leaves the first returned `newHighwater>T` row at H35→H50, whose signed `oldHighwater=35>T` proves a missing covering predecessor: fail closed, never use its later clock to mint `409`. If every `newHighwater>T` row is missing but the independently authenticated current Hunt head is H50, fail closed rather than return pending. |
| Forged or self-origin first crossing at the frozen target | A pending ordinary K freezes T30 while current signed H24. A forged or mismatched source row `old=24,new=35` with invalid Worker authority, different Hunt/player, or `originatingOuterCommandId=K` cannot authorize K's own `409`; first-source K violates the cutoff-bound fast-path premise, so quarantine rather than skipping to the next of 10,000 markers. Same-highwater later K domain heal after another outer crossing produces no new rising marker. |
| Target freeze and first crossing race | Under one Player lock, freeze target T≥then-signed H and original advancement Hunt. If another command rises H across T before freeze, freeze must instead capture T≥new H; no marker committed **before** the frozen target receipt may become that key's first supersession. On a losing or rolled-back freeze/crossing attempt, preserve the previously committed head and marker set. Do not decide chronological order using regressed/tied PostgreSQL timestamps. |
| Two ordinary commands race across their targets | K freezes H100/T150; J freezes H100/T200 under serial acceptance. K may first advance to H150, J then wins H200: the first covering marker for K is J's H150→H200, never K's H100→H150. If J first commits H200, K's stale H150 checkpoint loses OCC and cannot mint an H100→H150 marker afterward. Repeated K `202` retains original T150 and must not substitute the new highwater for its target. |
| Manual capture source A versus advancement Hunt B, and no-active branches | A prior terminal Hunt A can remain the manual capture source while the current active Hunt B is the *advancement* subject with its own target T_B and signed H_B; only B's genuine first covering interval may supersede that frozen prelude. A policy-save/manual command accepted with no active Hunt has NULL advancement Hunt/target and is never placed in the first-crossing predicate. Start creates a distinct initial Hunt highwater and cannot supersede an old target by mixing Hunt identities. |
| Frozen manual-capture prelude B terminalizes below target, then C starts | K's capture source is terminal Hunt A; it freezes advancement Hunt B at H100/T150. A distinct J terminalizes B at H120 (or at unchanged H100) **without** any B marker with newH>150, then Hunt C starts and advances. K's pending prelude reconciles against B's terminal state, never C's new highwater, and may continue its original capture-source-A manual attempt subject to current Inventory/eligibility. B terminalization/C progression does **not** fabricate a `409 command_superseded`; compare with J rising B H100→H160 **before** terminalization, where a genuine signed first B crossing may make K's `409` effective before its original E. Source: `application.ts:2365-2389,1282-1395`; accepted `SPEC-015 §9.1` lines792–802. |
| Deferred K heal and unchanged-highwater consequences | K healing item submits at C=T during Battle; another outer J raises the Hunt to D>T, then K heals at already-committed H=D. J's first rising marker is the crossing, K's HP-only write has the same H and **must not produce an extra first-rise interval**. The same is true of Battle replacement, reward/capture boundary cleanup and terminal seal that leave H unchanged. A terminalizing operation receives a separate immutable receipt. |
| Genesis row version zero and first strict rise | Create a new v4 Hunt with checkpoint `row_version=0` and signed crossing genesis ordinal 0. Its first winning increase H0→H1 must accept `checkpoint_row_version_before=0`, atomically write checkpoint version 1, marker crossingOrdinal 1 with predecessor 0 and signed head version 1. A later same-H update increments checkpoint rowVersion but not crossingOrdinal. Confirm SQL guard handles bigint overflow by failure, not ordinal wrap. |
| Rolled-back candidate and PostgreSQL sequence gap | K prepares the next rising ordinal 2 but loses checkpoint OCC/rolls back while J wins its own next rise. The first actual committed successor of ordinal 1 must be ordinal 2, *not* `nextval`-allocated 3; derive the committed rising ordinal from the locked signed head `lastCrossingOrdinal+1`, without `bigserial`/identity/nontransactional sequence. Verify unique old/new/Hunt and predecessor/source digest; discarded candidates cannot leave signed winning evidence or a gap. |
| Protected head rechecked after same-H operation | A same-H HP/replacement write increases the checkpoint `row_version` while retaining last rising ordinal/digest, then a strictly increasing outer K attempts persistence using a checkpoint rowVersion read before that write. K must fail OCC or reload and sign the actual current rowVersion; it may not forge a second rise from a stale expected version or replace the immutable first marker. |
| Older J accepted before K nevertheless crosses K's newly frozen target | J has Player acceptance sequence 9 and target T200. K later accepts with sequence 10 and freezes H100/T150; *after* K freeze, J legitimately commits H100→H200. J's genuine first marker supersedes K if the original lease still allows it. The Writer must not compare Player acceptanceSequence 9 numerically against K's Hunt operation sequence, nor demand J was accepted after K; inspect K's signed freeze and the real crossing chronology. |
| Original K transport row pruned before late terminal tombstone | K accepted day0, original pending Eday30, genuine first eligible M day29, no per-K receipt at crossing. Physically prune the original K pending row day60 while its logical 409 tombstone lasts through M+60day89: a replay day70 must still recognize the **original** key and yield original gone/tombstone, not new acceptance. Retain immutable private intent, target freeze and source proof through max(A+60,M+60), or prove a separately accepted bounded authenticated safe-prune summary. |
| Signed candidate disagrees with actual winning DB effect | After a prospective Worker MAC for checkpoint/Inventory/resource effect, force a guarded SQL operation or trigger to return a different actual quantity, version, bytes or policy. Read bounded `RETURNING`/point rows **after** the update and compare every signed effect field with persisted reality; rollback the whole checkpoint/effect/crossing/head on mismatch, not commit a MAC over proposed rather than actual effects. Use no network key-service calls inside the DB transaction. |
| Sub-millisecond expiry tie and lock crossing | Freeze original pending E with PostgreSQL `timestamptz` microseconds, then commit a first crossing with `decisionNow=E-1 microsecond` versus `decisionNow=E`; only the former is eligible for original `409`. A JavaScript `Date` millisecond round-trip must not erase the comparison; choose a reviewed exact-clock codec/SQL predicate. If a separate final same-transaction outer-result decision observes expiry after provisional effects, rollback all uncommitted crossing/source writes rather than reuse a prematurely sampled E-1 clock. |
| First crossing near original pending expiry | For accepted K with E=day30, original eligible signed crossing at day29 becomes immutable terminal `409`, replayed with its original 30+30 terminal retention despite lookup day31. First crossing recorded at/after E cannot retroactively create `409`; absent earlier terminal/crossing, an independently guarded expiry yields original-key `410` under the still-unaccepted §13.5 clock policy. Normal GET never manufactures markers, materializes tombstones or advances the decision floor. |
| Command accepted before its target is frozen; later crossing and pending lease expire | No marker preceding target-freeze claims the command, a first actual eligible crossing before lease expiry retains its own `409` terminal result/clock, and a still-pending key without an earlier crossing instead returns `410` after its original lease. |
| Wall-clock tie/regression across a crossing or transport expiry | Authenticated winning operation order selects the earliest eligible marker; expiry follows the accepted frozen DB-time rule with an independently approved monotonicity/fail-closed remedy, and a previously resolved key is never resurrected by a later clock sample. |
| Pending expiry crossed **between root lock and winning status decision** | Acquire Player root at `E - 100 ms`, then hold a bounded prerequisite until `E + 100 ms`: the eventual supersession marker or explicit terminal completion must evaluate its own freshly frozen guarded decision-point clock. The old pre-prerequisite receipt sample cannot manufacture `409` or `200` after the pending lease; the operative clock point is the SQL/guarded decision, not a nonexistent known commit timestamp. |
| H-02/H-03 late-clock capability ordering | Freeze a valid scoped pre-write capability and independently authenticated clock-health sample at `E - 100 ms`; delay the transaction on a prerequisite until `E + 100 ms`. A subsequent guarded crossing/completion may not reuse the earlier capability timestamp or stale witness as authority for a post-expiry `200/409` or resource debit. Under either reviewed protocol, the exact late status decision and its authenticated source/effect receipt must be inseparable from the permitted transition; if another lock or witness-verification failure intervenes, abort without any spendable partial state. Repeat with the normal SQL role directly invoking a valid intercepted capability and committing without the Worker post-write MAC: no consumable unreceipted effect. Record *which* SQL step is the linearization point, not an assumed transaction commit UTC. |
| Pending key expires **after tentative gameplay effects but before their final status decision** | At `E - 100 ms` the locked pending policy/Start/capture/retreat/checkpoint command passes an initial lease guard; its candidate effect is written only inside the open transaction. An independent guarded outcome sample after a forced barrier returns `E + 100 ms`. Roll back the **entire** candidate effect, public source, Inventory/Policy/Hunt transition and terminal receipt. For an already durable pending key, a fresh exact-key transaction reloads original E and prior terminal/crossing receipts, then samples against the last **committed** floor: sign one `410` tombstone **only if fresh decisionNow >= E and no earlier terminal wins**; otherwise fail closed on temporal uncertainty. Previously committed `202` segments and separately accepted healing-domain obligations remain authoritative. No policy activation or reward may commit next to a `gone` original key. |
| Newly accepted key and first effect are both tentative in one transaction | A new v4 Start inserts its first `acceptedAt = day 0` and stages the Hunt inside one uncommitted transaction, then the clock jumps to day 31 before its final guarded completion. Roll back **both** Start and the provisional key; no retained key exists from which to mint an old-key `410`. An unbound subsequent request must use ordinary acceptance or fail-closed clock-incident handling. Contrast with an old key whose original `202` acceptance and frozen target already committed: its expiry creates a durable exact-key `410` without undoing its earlier completed segments. |
| Rolled-back expiry observation followed by raw clock regression | An old durable pending K has frozen expiry E. Its effect transaction samples `E + 100 ms` at its final guard, rolls back all tentative effects **and that uncommitted clock observation**, then the raw clock regresses to `E - 100 ms`. A fresh exact-key transaction must reload original E and prior committed terminal/gone receipts, reauthenticate the **committed** floor and take a fresh decision sample. If neither fresh sample nor committed floor reaches E, it cannot sign `410` from the rolled-back observation; unresolved clock authority fails closed until the separately accepted recovery rule applies. If committed floor already reaches E and no earlier terminal exists, it may sign the one bounded gone point. |
| New v4 transport key accepted during raw-clock regression | With authenticated decision floor at day 31 and raw receipt time at day 20, proposed floor-based acceptance sets `acceptedAt = 31`, pending expiry day 61 and tombstone horizon day 91, while the gameplay cutoff still uses raw day 20 plus its existing clamp. Raw `acceptedAt = 20` would consume 11 days of nominal pending lease immediately; any alternative requires separately accepted fail-closed semantics. |
| Player-floor isolation and raw gameplay recovery | With Player P at floor day 31, Player Q at floor day 20 and raw DB day 20, P's newly accepted v4 transport key uses day 31 and Q's uses day 20; neither operation changes the other Player's authenticated floor. If P's original raw `recoveryReadyAt` is day 25, its new Start must still return `409 recovery_pending`, even though P's transport `acceptedAt` is day 31. No invented global ordering of two Players' command timestamps. |
| Large forward PostgreSQL clock jump and mixed-version commands | An erroneous raw sample at day 365 can poison a day-1 Player floor and expire older keys prematurely; demonstrate an independently accepted incident policy instead of claiming the floor proves elapsed real time. Existing accepted v1–v3 keys keep their original clock version; v4 Start, no-active policy and cross-Hunt manual prelude require tested deterministic version dispatch. |
| Parallel accept, one point-resolution, retreat and restart/crash | One winning original source/receipt per operation, correct domain/result clocks, zero double debit, no premature cancellation and stable same-key `202`/terminal replay. |
| Missing/tampered old marker, forged queue head, SQL role bypass | Detect/deny under model N without false verified state `200`; old-domain private audit works after public key expiry, while privileged valid-backup restore remains out of scope. |

**Acceptance sequence:** select B (**done by Human Owner**); obtain independent
QA and security design review of the **complete** selector/guard/codec draft;
demonstrate numerical limits on disposable PostgreSQL and production-like
Worker; approve explicit SPEC-015 Class-A replacement with compatible exact
transport/domain behavior; separately authorize v4 implementation/migrations;
verify delivered code and public feed before rollout. **The tests, indexes,
MAC verifier design and migration have not been implemented by this decision.**

### 13.4 Candidate PostgreSQL query/ownership shape — non-executable design

The following SQL is a **review fixture**, not an executable migration or an
accepted definition of the full v4 authority. PostgreSQL 17 is the current SQL
baseline. It makes the U/I/B seek cardinality auditable and leaves proof/role
ownership, immutable history, canonical codecs and lifecycle/compaction to
their separate Class-A gates. Any migration must choose final canonical names,
ensure index predicates match exactly the guarded Writer's materialized
point-status values, and create its constraints on a separately verified
existing schema. Never change `0009` in place.

```sql
-- Candidate extension for v4-gated domain rows only. NOT APPLIED.
-- The original EncounterId and this ordinal must be an authenticated pair.
ALTER TABLE pokenexus.hunt_healing_commands
  ADD COLUMN submission_encounter_ordinal bigint
    CHECK (submission_encounter_ordinal IS NULL OR submission_encounter_ordinal > 0);

-- U: one unclassified point, regardless of expired public transport key.
CREATE INDEX v4_heal_unclassified_next_idx
  ON pokenexus.hunt_healing_commands
     (source_hunt_id, submission_cutoff_logical_time_ms,
      acceptance_sequence, command_id)
  WHERE heal_status = 'scheduled' AND submission_phase IS NULL;

-- I: one explicitly classified inter-Battle due point.
CREATE INDEX v4_heal_interbattle_next_idx
  ON pokenexus.hunt_healing_commands
     (source_hunt_id, due_logical_time_ms, acceptance_sequence, command_id)
  WHERE heal_status = 'scheduled' AND submission_phase = 'inter_battle';

-- B: the oldest still-scheduled Battle/Encounter, then its earliest point.
CREATE INDEX v4_heal_battle_next_idx
  ON pokenexus.hunt_healing_commands
     (source_hunt_id, submission_encounter_ordinal,
      acceptance_sequence, command_id)
  WHERE heal_status = 'scheduled' AND submission_phase = 'battle';

-- Proposed acceptance uniqueness; check existing rows + v1-v3 coexistence
-- before approving a forward migration. This is not in current 0009.
CREATE UNIQUE INDEX v4_player_command_acceptance_unique_idx
  ON pokenexus.hunt_public_commands (player_id, acceptance_sequence);
```

**Versioned phase-shape prerequisite — not enforced by the candidate SQL
above:** existing `0009` permits a classified inter-Battle heal with
`due_logical_time_ms IS NULL`, and the proposed ordinal extension expressly
permits `submission_encounter_ordinal IS NULL` to preserve legacy rows.
An ascending partial-index head can therefore show a seemingly valid I/B
row while silently placing an **invalid v4 row with a NULL sort key** later.
Validating only the selected head's marker/ordinal does not establish that
no invalid row was hidden. The executable v4 design must bind each accepted
healing row to its immutable source-Hunt schema/authority version and enforce,
through a reviewed forward-only conditional SQL constraint plus guarded
writer authorization or an equally bounded authenticated invalid-head
check, the complete phase shape:

- U: `submission_phase IS NULL`, frozen cutoff present; no fabricated
  Encounter identity, ordinal or due marker.
- I: phase `inter_battle`, **non-NULL** frozen due logical time at or
  after its submission cutoff; no Battle Encounter ordinal.
- B: phase `battle`, **non-NULL** original EncounterId and positive
  ordinal authenticated as one pair; its physical due field may remain
  NULL either **while the original Battle is genuinely incomplete** (there
  is no completion marker and the heal is not yet due), or **after the
  original completion** when the exact authenticated `due_encounter`
  marker supplies the effective due time. A completed Encounter with
  neither a physical due value nor a valid marker fails closed; do not
  require a completion marker from an ongoing Battle.

Legacy v1–v3 rows may retain their original nullable shape, but must never
be admitted into a v4 source-Hunt queue by a spoofed version field. A row
whose v4 identity, phase shape or source-Encounter binding is missing
requires `503 authority_unavailable`/quarantine, not a later valid head,
an empty queue, or a synthetic due boundary. Negative SQL fixtures must
place an invalid v4 I row with NULL due time **behind** a valid I head and
an invalid v4 B row with NULL ordinal **behind** a valid B head; prove the
normal application SQL credential cannot create either winning state, and
that a retained malformed state is detected without scanning all queue
entries. A bare `CHECK (ordinal IS NULL OR ordinal > 0)` cannot meet this
gate without a separately enforced v4 row/version predicate. The exact
schema discriminator, constraint timing, existing-row migration treatment,
restricted runtime permissions and signed-head completeness remain
separate Class-A acceptance work.

For the U/I/B candidate selector, issue one `ORDER BY`/`LIMIT 1` seek **per
eligible partial index**, scoped by `source_hunt_id` after authoritative Player
ownership checks. For B, resolve only its first returned EncounterId to a
signed immutable `due_encounter` row and original boundary by exact key; do
not join to and sort all previous Encounter marker rows. Require the B row's
ordinal/EncounterId pair, completed boundary stage and immutable receipt to
match; absence of a marker for a still-active Battle means *not due*, while
absence for an already completed earlier Battle is **authority unavailable**,
not permission to advance. The terminal marker is checked **before** any
U/I/B selection; pending records for a sealed source Hunt are archival, not
live queue work. Applied single-heal resolution removes **one** row from its
scheduled partial-index membership, even when its transport key is expired.

The three physical seeks are not a complete query-plan guarantee until
EXPLAIN on disposable PostgreSQL demonstrates each uses its eligible index
predicate rather than a sequential scan, and the canonical access layer
proves the eligible-queue invariant under concurrent acceptance/classification.
If B has no signed completed marker, do not simply drop it from the global
minimum when another old due B might exist; prove the earliest-B ordinal is
the only possibly pending Encounter group, or replace this candidate with a
guarded, indexed nonempty-group head as §13.2 requires. Also show that
`beforeAcceptanceSequence` never forces scanning N disallowed candidates:
where a command's terminal cutoff excludes a later-accepted heal at the same
logical time, compare the **first global candidate** to that acceptance fence
under the Player lock rather than iterating past excluded rows. If the
accepted ordering demands looking past an excluded first candidate, a
different bounded index is mandatory.

**Conditional eligibility lemma for the retreat acceptance fence — to
verify, not yet accepted:** let R be an executable retreat whose immutable
target is T, whose frozen sequence is S, and whose committed Hunt highwater
has reached **exactly** T. The R-only beforeAcceptanceSequence=S filter is
legal only for R's *final same-T preceding-heal window*; it does not apply
while advancing from a lower highwater, to an ordinary checkpoint/claim
prelude, or to the later domain cancellation at terminal commit. A candidate
proof for the three unfiltered first heads is given below. This restriction
on a **queue-selection filter** does not let an independent item/advance
caller apply a later-accepted due-at-T heal while R is still executable:
the *separate global point-effect admission fence* in §13.1 must be
rechecked under the winning Player lock. Filtering the independent caller's
global head to exclude H without first settling R would hide a real blocker;
the caller must instead defer or follow a separately proven legal R
disposition and retain bounded-progress guarantees.

The conditional three-head proof is:

1. **No overdue live queue:** a winning advance from logical H to H'>H must
   process/classify every unclassified cutoff C<H' and every authenticated
   due boundary D<H' (including marker-derived Battle due time), or fail
   closed without persisting H'. Thus at committed H=T an unresolved
   selectable U/I/B point with effective time strictly below T is an
   integrity violation, **not** a row to silently skip. This must hold for
   every v4 advancement writer, including independent pending command
   continuations and zero-gap NEXT_BATTLE admission. **The decisive queue
   recheck must occur inside the same winning Player-serialized SQL
   transaction that commits the new checkpoint**, after acquiring the
   required locks and before the highwater/Encounter transition. The
   speculative unlocked prelude selector cannot establish absence of a
   newly accepted heal. If a different command inserted an earlier
   scheduled cutoff after the speculative projection, fail closed or
   discard/recompute the stale candidate without committing its projected
   events, public source, rewards or next Battle; never leave an overdue
   item behind the new checkpoint.
2. **No retroactive acceptance:** a new heal accepted at committed highwater
   H freezes a submission cutoff C>=H under the Player root lock. An H_new
   accepted after R while R is still below T may legitimately have C<T;
   that heal must be considered *without S filtering* as advancement
   approaches C, and may later wait for an Encounter marker at D>=C.
   Once R reaches H=T, any later accepted unclassified command cannot
   freeze C<T; a classified command's structural due time cannot precede
   its frozen submission cutoff. A late Battle-classified heal at D=T can
   remain scheduled for terminal cancellation if its sequence is >=S.
3. **First-head dominance at T:** select the earliest **eligible structural**
   U/I/B candidate by (effectiveLogicalTimeMs, acceptanceSequence,
   commandId) from the same locked Player/Hunt snapshot. U's key at C=T
   is only **classification-ready**, not automatically healing-due:
   classify a U with sequence <S at the original T phase in a bounded
   step, then **reselect** the heads. Only an inter-Battle classification
   due at T or an already authenticated I/B due at T may consume a Potion;
   a Battle classification for an unfinished Encounter has no invented
   completion marker and can be terminal-canceled. If the first **ready
   structural** candidate at T has sequence >=S, an earlier accepted
   *ready* candidate with sequence <S cannot be hidden *behind* it in any
   stream: an earlier time is excluded by item 1, and at equal time its
   smaller sequence would win the global comparison. Hence R may terminate
   without scanning past this excluded first head; the terminal range
   marker will cancel all remaining scheduled source-Hunt heals, including
   those accepted after R. If the first head's effective time is >T,
   no T-ready point is eligible.
4. **Battle-head completeness:** the oldest B Encounter ordinal must either
   have its exact authenticated completion marker (whose due time is used
   even when the physical heal row still holds NULL), or be provably the
   current incomplete Battle. A completed older Battle without its marker,
   a due Battle blocked by a newer incomplete Battle, or an old marker with
   unresolved heals after a later Battle started invalidates item 3 and
   fails closed. The accepted zero-gap ordering must establish that no
   later Encounter's heal can have a due marker earlier than the oldest
   still-scheduled B Encounter; do not infer that solely from numeric
   Encounter ordinals.

**Counterexample obligation:** construct R=S12/T600 from H500, then accept
H13 with a regressed raw clock and C500 while R is pending. This does **not**
alone refute the lemma: until highwater reaches 600 the R-only sequence
filter is *not* applied, and a still-unclassified H13 at C500 cannot
legitimately be left overdue at H600. Test its actual classification,
Battle waiting boundary, a simultaneously due earlier H11, an OCC loser
and terminal cancellation. If a conforming trace nevertheless leaves an
excluded first head at T that hides an included due heal, reject the
three-head proposal and design a separately reviewed, authenticated
acceptance-filtered fixed-seek summary. Do not patch correctness by
iterating over arbitrarily many excluded rows. The lemma's database lock,
effective-time, completeness and SQL plan conditions remain **open Class-A
proof obligations**, not an assertion that the current v3 query already
enforces them.

**Cross-spec retreat-heal precedence — Human direction H-01 selected, amendment pending:** SPEC-013
§6.1 item 4 describes a heal already accepted *before* retreat that reaches
its boundary before terminalization; SPEC-015 §9.2 requires every advancing
command, **including retreat**, to service accepted items when their earlier
structural boundary becomes due, and applies acceptance order explicitly
when the item and retreat share the **same** boundary
(`SPEC-013:329-333`; `SPEC-015:933-953,983-992`). The currently implemented
retreat advances without the R-sequence filter until it reaches T
(`application.ts:2684-2692`). Therefore a later H13 accepted during R12's
pending `202` while the original Battle is still active at C500, and made
due at its completion D550 **strictly before** R12's frozen T600, can be
executed under the current universal-timeline interpretation. The wording
of SPEC-013 item 4 also permits a stricter reading that only commands
accepted before R can run under its stop correlation.

**Human-selected resolution (2026-09-30):** the earlier-boundary timeline
interpretation governs the proposed v4 contract. H13 due at D550 < T600
must resolve before R12 despite its later acceptance; the R12 acceptance
fence applies only to the **same-T** terminal window. If H13 becomes due
exactly at T600, its later acceptance leaves it scheduled for the retreat's
terminal cancellation after eligible earlier-accepted same-T heals. A
separately advancing command may have already committed the earlier heal;
terminalization must not undo that consequence. This selection resolves
the *Human choice*, **not** the conflicting narrower SPEC-013 §6.1 wording,
which requires an explicit, independently reviewed SPEC-013/SPEC-015
Class-A clarification before the v4 contract is accepted. Neither a new
selector nor this DRAFT alone authorizes a gameplay/runtime change.

**Current v3 source-order hazard to reproduce separately:** an advancing
command K can read an empty heal blocker set *outside* the Player lock
(`application.ts:2704-2712`), then another command accepts one U heal at a
cutoff strictly between K's old and proposed new checkpoint times while
holding the Player lock (`application.ts:1411-1585`). Heal acceptance
does not increment the checkpoint OCC version. The existing subsequent
`persistAdvancedStateAndMaybeBoundary` transaction rechecks that
checkpoint's row version but not the just-changed heal blocker set
(`application.ts:2775-2817`; repository checkpoint writer
`:1443-1503`). If a bounded combat projection reaches its target without
an intervening Encounter boundary and wins this race, it can leave the
newly accepted heal overdue; the later source guard then throws at
`application.ts:2074-2076`. Treat this as an unexecuted, concrete
concurrency negative fixture and separate v3 remediation candidate,
**not** evidence that an approved v4 recheck or repair already exists.

The **highwater-crossing seek** is a separate authority, not a fourth heal
queue. Its proposed unique key is `(playerId, huntId, newHighwaterMs)`, with
`oldHighwaterMs`, `operationSequence`, sampled DB time, actual originating
outer command, frozen target/acceptance identity, original proof-head
predecessor and authenticated marker bytes. Insert only in the same winning
transaction that moves the checkpoint's logical highwater strictly upward,
with exact `oldHighwaterMs < newHighwaterMs`; same-highwater effects/HP/heals
(including a deferred K heal resolved after a different outer command has
already crossed K's target) and terminal transactions have their **own**
authenticated operation receipts, never synthetic first-time crossings.
Before accepting a `newHighwaterMs > T`
point lookup as an eager `409` for another pending command, verify the signed
no-fork first-crossing index, all three §13.2.5 hypotheses, the original
target-freeze operation, `command_kind != heal_item`, and the actual eligible
commit-time clock/status. The first physically present row is **not** enough
if ordinary SQL can hide an earlier marker or insert a forged valid-looking
summary. When any condition fails, use the documented fail-closed response or
an independently accepted bounded alternate structure, never silently choose
the next crossing.

**First-covering-interval lemma — candidate fixed-seek proof, not a
physical-index or Class-A approval.** For one original `(playerId,
advancementHuntId)` and an ordinary pending command K, let Hf be the
authenticated checkpoint highwater at K's *durably committed target-freeze
operation*, and let its immutable target be T with `T >= Hf`. Suppose that
all winning strictly increasing checkpoint transitions for this same Hunt
are recorded atomically as immutable, non-forking marker intervals
`(oldHighwater,newHighwater]`, in exactly their Player-serialized order:
`oldHighwater` equals the preceding winning checkpoint's highwater,
`newHighwater > oldHighwater`, and same-highwater domain effects write
**no** first-rise interval.

1. Under the Player lock, read K's **original signed** target-freeze
   identity/status and a consistent signed current Hunt highwater Hcurrent.
   If an original terminal/gone point already won, use its immutable result
   and clocks **before** any candidate crossing or pending-expiry fallback.
   Do not compare unrelated source and advancement Hunt heads (cross-Hunt
   manual capture must use its frozen advancement Hunt).
2. If `Hcurrent <= T`, no **later committed** strictly rising crossing
   beyond T can yet exist on this monotone run. Its absence from the index
   means *no supersession marker*, not an automatic right to execute K:
   recheck its original lease, other terminal dispositions and unchanged
   target before continuing. A row claiming `newHighwater > T` despite an
   authenticated `Hcurrent <= T` is a mismatch to quarantine.
3. If `Hcurrent > T`, exactly one first interval spans the transition
   from at-or-below T to above T. Use one fixed, owner-scoped unique-B-tree
   seek `WHERE new_highwater_ms > :T ORDER BY new_highwater_ms LIMIT 1`.
   Its earliest **authenticated** result M must satisfy
   `M.oldHighwater <= T < M.newHighwater <= Hcurrent`, with signed Hunt,
   Player, original operation, prior proof head and immutable marker time.
   The draft may use an additional **dense per-Hunt rising-crossing ordinal**
   `crossingOrdinal` (not the global operation sequence, which can advance
   at unchanged H), together with a signed genesis/sentinel and a unique
   `(playerId,huntId,crossingOrdinal)` index. One additional exact
   predecessor seek by `M.crossingOrdinal - 1` must return that marker or
   the original signed Hunt genesis, with
   `M.oldHighwater == predecessor.newHighwater`,
   `M.previousCrossingDigest == predecessor.digest` and contiguous ordinal.
   A signed current Hunt head binds both `Hcurrent` and the latest
   `(crossingOrdinal,digest)`. The separate predecessor seek cannot be
   replaced with `OFFSET` or an arbitrary-length chain replay; these local
   checks remain coupled to model N's database-enforced no-fork/index
   completeness, not an independent defense against a privileged restore.
   A first returned `oldHighwater > T` means an earlier crossing/marker is
   missing or index membership is unprovable; **fail closed**, rather than
   walking to a later row. An empty result with `Hcurrent > T` likewise
   fails closed. If the row's Worker authenticator, source-run binding or
   guarded head relation fails, no subsequent row can be substituted.
4. Because T was frozen at or above Hf, a genuinely preceding marker
   cannot have `newHighwater > T`. Because K's own normal advancement is
   cutoff-bound by T, the **first** marker above T cannot have K as its
   originating *outer* advance, assuming §13.2's separately required
   hypothesis (c); a K-attributed first-rise marker is an invariant
   violation, not a `LIMIT 1 OFFSET 1` case. A deferred K healing-domain
   update at an already higher H is not a new first-rise marker. Later equal
   Hunt time, terminal sealing and checkpoint HP-only writes get separately
   authenticated operation receipts, not a fabricated interval.
5. Use **M's original committed decision-point time** and K's original
   pending lease to determine whether M was an eligible eager `409`
   crossing. Only a winning, eligible marker at `decisionNow < E` may
   freeze K's terminal `409` effective at M; otherwise the original key
   follows the separately accepted pending-expiry/`410` decision and cannot
   be re-clocked on late replay. If K had an earlier valid explicit terminal
   point, preserve that point. The per-key read requires a **fixed
   number** of exact command/head/freeze/predecessor point seeks plus one
   first-interval B-tree seek and bounded comparisons, **not** a walk of
   earlier markers; one winning rise writes **one marker**, never one
   `UPDATE` for every superseded key.

**What a signed interval does *not* prove by itself:** a MAC on M authenticates
M's bytes but does not prove that a normal SQL credential could not delete
an earlier marker, falsify its index membership, hide a row through a
caller-controlled predicate, or forge the Player/current-Hunt head. Model
N's bounded earliest-row completeness instead **depends jointly** on:
immutable canonical first-rise receipts issued by the trusted Worker in the
same winning checkpoint/OCC transaction; a guarded current head with a
unique rising highwater and authenticated predecessor operation; restricted
`INSERT/UPDATE/DELETE/TRUNCATE/DDL/EXECUTE/SET ROLE` pathways that prevent
the ordinary SQL principal from editing, suppressing or fabricating an
earlier row; and a fixed owner-scoped indexed SQL/read interface that
cannot be redirected to a different Hunt or unverified view. Show the
concrete grants/REVOKEs and verifier trust assumptions in an independently
reviewed forward migration. The ordinary SQL credential may cause an
availability incident but cannot mint a credible signed missing interval.
A **coherent privileged DBA backup rollback** remains explicitly outside
selected N; proving resistance to it would require separately selected S,
not a claim that an in-DB hash chain is an off-DB witness. A proof of
authentic current head and index completeness cannot consist only of
checking M's signature or the *last* chain link.

**Retained-index precondition:** the immutable first-crossing row, genesis,
its exact predecessor and their trusted verification keys must remain
available while any accepted public correlation can still derive or replay
its original `409` (including the first crossing's *own* 30-day full-result
and following tombstone window), or while a separate private domain
audit/provenance dependency requires them. A maintenance action that
physically removes a required earliest row can make a later row look first
and cannot be disguised as ordinary expiration of K. Specify privilege,
low-watermark, key-rotation and independent operational retention proof
before any v4 pruning; absent the necessary marker/authenticator, fail
closed instead of returning pending, minting a delayed `409` or silently
starting a new terminal lease. Existing v1–v3 key and Hunt histories do
not acquire this v4 dependency retroactively.
**Retain K's original bound private correlation as well as M:** the exact
accepted UUID, intent hash/kind, Player, original advancement Hunt, frozen T,
acceptance/freeze receipt, initial transport-version/expiry and verifying keys
cannot be discarded merely because the *pending* key's original
`acceptedAt+60 days` horizon elapsed. If K accepted day 0 (pending E day
30) and M first crossed day 29, M's effective terminal `409` remains in
full-result/tombstone support through M+60 = day 89. On K's first replay
at day 70, the server must still recognize the original UUID and terminal
tombstone; it must never mistake it for a fresh unbound key. The private
lookup authority must therefore survive **at least**
`max(originalPendingTombstoneExpiry, originalEligibleCrossingAt+60 days)`
(up to approximately `acceptedAt+90 days` for a near-expiry crossing),
or be replaced by a separately accepted, bounded, authenticated safe-prune
summary. This does **not** extend K's public pending lease or create a late
30-day full-result window. Retain the actual outer source-operation proof
for any longer independently required audit/correlation horizon as well.

**Candidate PostgreSQL-17 first-crossing schema — illustration only; NOT a
forward migration and NOT approved.** The following provisional objects
express the minimum index/order/retention shape for independent review.
Their names, payload serialization, constraints, owner foreign keys,
command provenance, key rotation and migration from existing rows remain
unfrozen. The SQL intentionally creates no role, privilege, function,
trigger or runtime route, and never changes the accepted `0009` schema.

```sql
-- NOT EXECUTABLE AS A MIGRATION. Missing approved MAC codec, FK, ACL,
-- guarded writer, source-version and preexisting-row compatibility proof.
-- Genesis is the immutable signed Hunt-start sentinel, rising ordinal 0.
CREATE TABLE pokenexus.v4_hunt_crossing_genesis (
  player_id uuid NOT NULL,
  hunt_id uuid NOT NULL,
  checkpoint_id uuid NOT NULL,
  initial_highwater_ms bigint NOT NULL
    CHECK (initial_highwater_ms BETWEEN 0 AND 9007199254740991),
  genesis_digest bytea NOT NULL,
  worker_key_id text NOT NULL,
  worker_authenticator bytea NOT NULL,
  PRIMARY KEY (player_id, hunt_id)
);

-- Mutable only by the original guarded Player/Hunt checkpoint writer.
-- Same-highwater HP/capture/replacement updates still advance checkpoint
-- row_version/proof head but NEVER last_crossing_ordinal.
CREATE TABLE pokenexus.v4_hunt_crossing_heads (
  player_id uuid NOT NULL,
  hunt_id uuid NOT NULL,
  checkpoint_id uuid NOT NULL,
  checkpoint_row_version bigint NOT NULL CHECK (checkpoint_row_version >= 0),
  current_highwater_ms bigint NOT NULL
    CHECK (current_highwater_ms BETWEEN 0 AND 9007199254740991),
  last_crossing_ordinal bigint NOT NULL CHECK (last_crossing_ordinal >= 0),
  last_crossing_digest bytea NOT NULL,
  head_digest bytea NOT NULL,
  worker_key_id text NOT NULL,
  worker_authenticator bytea NOT NULL,
  PRIMARY KEY (player_id, hunt_id)
);

-- One immutable marker per WINNING strictly increasing Hunt highwater.
-- Dense crossing ordinal != potentially sparse global operation sequence.
CREATE TABLE pokenexus.v4_hunt_rising_crossings (
  player_id uuid NOT NULL,
  hunt_id uuid NOT NULL,
  crossing_ordinal bigint NOT NULL CHECK (crossing_ordinal > 0),
  predecessor_ordinal bigint NOT NULL
    CHECK (predecessor_ordinal = crossing_ordinal - 1),
  old_highwater_ms bigint NOT NULL CHECK (old_highwater_ms >= 0),
  new_highwater_ms bigint NOT NULL
    CHECK (new_highwater_ms > old_highwater_ms
       AND new_highwater_ms <= 9007199254740991),
  checkpoint_id uuid NOT NULL,
  checkpoint_row_version_before bigint NOT NULL
    CHECK (checkpoint_row_version_before >= 0),
  checkpoint_row_version_after bigint NOT NULL
    CHECK (checkpoint_row_version_after = checkpoint_row_version_before + 1),
  original_outer_command_id uuid NOT NULL,
  -- Hunt-scoped private operation sequence, NOT Player acceptanceSequence.
  winning_operation_sequence bigint NOT NULL
    CHECK (winning_operation_sequence > 0),
  frozen_decision_at timestamptz NOT NULL,
  predecessor_digest bytea NOT NULL,
  crossing_digest bytea NOT NULL,
  worker_key_id text NOT NULL,
  worker_authenticator bytea NOT NULL,
  PRIMARY KEY (player_id, hunt_id, crossing_ordinal),
  UNIQUE (player_id, hunt_id, new_highwater_ms)
);

-- An immutable positive-target freeze is a distinct original authority;
-- public commands accepted with NO active advancement Hunt have NULL
-- advancement target and no row in this positive-target table.
CREATE TABLE pokenexus.v4_hunt_target_freezes (
  command_id uuid PRIMARY KEY,
  player_id uuid NOT NULL,
  advancement_hunt_id uuid NOT NULL,
  source_hunt_id uuid,
  command_kind text NOT NULL,
  -- Player-scoped command acceptance sequence; not comparable numerically
  -- to rising_crossings.winning_operation_sequence.
  original_acceptance_sequence bigint NOT NULL
    CHECK (original_acceptance_sequence > 0),
  frozen_checkpoint_highwater_ms bigint NOT NULL
    CHECK (frozen_checkpoint_highwater_ms >= 0),
  target_highwater_ms bigint NOT NULL
    CHECK (target_highwater_ms >= frozen_checkpoint_highwater_ms
       AND target_highwater_ms <= 9007199254740991),
  original_pending_expires_at timestamptz NOT NULL,
  freeze_digest bytea NOT NULL,
  worker_key_id text NOT NULL,
  worker_authenticator bytea NOT NULL
);

-- The two UNIQUE constraints on rising_crossings already provide:
--   (player,hunt,new_highwater_ms) -> first crossing > original target;
--   (player,hunt,crossing_ordinal) -> exact predecessor/ordinal continuity.
-- No ORDER BY operation_sequence historical scan and no OFFSET.
```

**Guarded transaction contract (candidate):** the version-aware v4 Writer
acquires the authenticated Player root, original Hunt/checkpoint and any
other blocking resource locks in a documented global order. It reloads the
original command correlation, its immutable target freeze (if already
committed), original pending lease, the existing signed crossing head and
checkpoint `row_version`; it verifies the exact Worker-signed source and
the effective U/I/B blocker before accepting the projected next highwater.
At the target-freeze operation, freeze `T>=H` and `advancementHuntId`
*inside that same winning Player-serialized transaction*; persist only a
single original freeze digest/row, never overwrite it on continuation. A
source-Hunt-A manual capture with advancement-Hunt-B uses B's guarded head;
no-active-Hunt policy/manual commands have no positive target and cannot
enter this supersession selector. An original correlation that already
expired **before target freeze** cannot receive a new T and retrospectively
claim a pre-freeze crossing: honor its original expiry/gone authority first.
The Player-scoped `original_acceptance_sequence` in the freeze record and
the Hunt-scoped `winning_operation_sequence` in a later rise are different
§11.1 namespaces. An earlier-accepted J may win a genuine rise *after*
later-accepted K freezes T, so never reject J's eligible crossing merely
because `J.acceptanceSequence < K.acceptanceSequence`, and never use
`J.huntOperationSequence > K.acceptanceSequence` as a surrogate ancestry
comparison. The original signed `Hf<=T`, protected Player lock and
authenticated per-Hunt marker ancestry establish the relevant post-freeze
ordering; introducing a common Player operation clock would be a separate
Class-A decision.

For each winning checkpoint candidate, compare its proposed new highwater
to the **locked current** checkpoint, not a previously unlocked projection.
Reject backward time. At equal highwater, a genuine checkpoint-byte change
still uses its expected-row-version OCC update and guarded checkpoint/
operation head; a domain-only resource/policy consequence that does not
rewrite checkpoint bytes instead advances its own authenticated effect/
operation version as §11.1 requires. **Neither** form mints a new rising
crossing, changes its dense ordinal or fabricates a checkpoint version
increment for an otherwise unchanged row.
For strict increase `H_old < H_new`, allocate
`crossingOrdinal = signedHead.lastCrossingOrdinal + 1` with overflow check;
bind `old=H_old`, `new=H_new`, `predecessorOrdinal` and
`predecessorDigest` from that signed head; freeze the genuine *outer*
command identity, winning **Hunt-scoped** operation sequence and the
independently sampled §13.5 **late guarded decision-point** timestamp.
Before permanently signing that timestamp or the effects, verify the
candidate after all potentially blocking SQL locks and bounded
preconditions. **Selected H-03 also requires the SQL guard to verify its
scoped Worker-issued authorization *before* any checkpoint/resource write**;
the historical MAC alone is not that authorization. The trusted Worker can
calculate a prospective MAC from the
canonical candidate, but a candidate signature is **not yet a winning
operation signature**. Conditionally write the authoritative checkpoint by
expected `row_version` and its bounded Inventory/policy/capture/reward/
presentation effects inside this SQL transaction. Read back the **actual
persisted** checkpoint version, canonical bytes/digest, resulting resource
versions, quantities and provenance using bounded `RETURNING` or indexed
point reads; compare each with the proposed signed effect and exact
expected-row counts **after** the SQL writes but **before COMMIT**,
as §10.3 already requires. If they disagree (including a trigger-computed
different value or overwritten Inventory), abort the entire transaction.
Only then freeze the applicable §13.5 guarded crossing decision sample and
locally sign the verified actual marker and new head with the trusted Worker
key **outside PostgreSQL**, without calling any network/key service while
the SQL transaction is open. Insert the one immutable rising marker and
advance the signed Hunt head in the *same* transaction. **For the honest
Worker path**, this staged sequence couples its checkpoint/effect to the
corresponding verified signed operation. It is **not yet proof** that a
stolen SQL credential possessing a genuine pre-write capability cannot
commit that capability's exact effect *before* the Worker supplies the
historical MAC. The final SQL mechanism must enforce atomic authoritative
receipt/authorized-final-apply, including replay and crash, as §13.4's
genuine-capability adversary requires; otherwise v4 admission is blocked.
A lost OCC race,
newly accepted due-heal blocker, invalid source signature, checked overflow,
failed insert, mismatch or crash **rolls back all of these writes together**;
none may leak a valid first-rise marker, result `409` or new public source.
No per-pending-command supersession/expiry UPDATE is added. The ordinary
SQL credential may not independently rewrite any of the four objects.
PostgreSQL sequences such as `nextval`, `bigserial` and `GENERATED AS
IDENTITY` are **not** valid allocators for the dense crossing ordinal:
an OCC loser or rolled-back insert may still consume a sequence value.
The first v4 Hunt checkpoint can legitimately have `row_version=0`
(`0001_postgresql_schema_v1.sql:85`; `createHuntCheckpoint` does not
override the default). The signed genesis/head must admit 0 and the first
strict rise must bind checkpoint `0→1`, with later same-H row-version
increments allowed without changing the dense rising ordinal.
If another explicit-result or `202` status decision occurs after the
tentative crossing in that same transaction, it requires its **own**
guarded clock sample and original lease/terminal-result recheck under §13.5.
If the outer command's pending lease has then elapsed without an earlier
valid terminal result, rollback **all** tentative state/effect/marker/head
writes rather than retaining a crossing signed earlier in an ultimately
aborted operation. Once a first crossing is genuinely committed, retain its
original decision-point timestamp independent of the clock at a later
exact-key replay. Never use the raw gameplay cutoff clock in place of the
transport result decision or claim to know the physical PostgreSQL commit
timestamp before COMMIT.

**Exact supported-key lookup under a consistent owner-scoped snapshot
(candidate; constant-number seeks, no GET mutation):**

The lock-taking command/continuation path must read a fresh authoritative
Player/Hunt state **after acquiring the Player root lock**, e.g. with a
validated `READ COMMITTED` transaction. A `REPEATABLE READ` or
`SERIALIZABLE` snapshot created before waiting on a competing writer
may instead be stale or report PostgreSQL serialization failure `40001`:
retry the whole bounded operation with its original idempotency/frozen
target, never infer marker absence from that stale snapshot. A read-only GET
uses its own consistent snapshot and performs no repairs or tombstone
materialization. This internal proof lookup does not authorize exposing
private crossing/MAC bytes in the public response.

```sql
-- Under the Player root lock for write/replay, or under an independently
-- proven consistent read-only snapshot for a public GET. Self-scope and
-- signed head/freeze/key verification happen outside this illustrative SQL.
-- (1) point-read original command, prior terminal/gone, signed freeze,
--     checkpoint and current v4 Hunt crossing head.
-- (2) only for pending ordinary K with frozen target T:
SELECT crossing_ordinal, predecessor_ordinal,
       old_highwater_ms, new_highwater_ms,
       checkpoint_row_version_before, checkpoint_row_version_after,
       original_outer_command_id, winning_operation_sequence,
       frozen_decision_at, predecessor_digest, crossing_digest,
       worker_key_id, worker_authenticator
  FROM pokenexus.v4_hunt_rising_crossings
 WHERE player_id = $1 AND hunt_id = $2
   AND new_highwater_ms > $3::bigint
 ORDER BY new_highwater_ms ASC
 LIMIT 1;
-- (3) if one M was found and ordinal > 1, point-read M.ordinal - 1
--     on the PRIMARY KEY; for ordinal 1, point-read signed genesis instead.
-- (4) check predecessor ordinal/hash/oldH, M MAC, CURRENT signed head/H,
--     original source/freeze ordering, E and prior terminal precedence.
```

If signed current H is at/below T, no later crossing is allowed to appear.
If current H is above T but the first seek is empty, or M's oldH is above T,
or its exact predecessor/genesis/source/ordinal/MAC/lease fails validation,
respond with the documented **fail-closed authority** outcome; do not skip
rows, synthesize a result, advance a command, or renew a `409` clock.
Every v4 explicit-result writer must run the same effective-status check
before committing a competing `200/409/422`: when the first eligible
crossing already implies K's original logical terminal `409`, the later
explicit operation cannot overwrite it. A supported exact replay may
materialize **at most K's one** immutable original result receipt, preserving
the marker's original `terminalAt`; result lookup and GET cannot mint a new
per-key terminal lease merely because the full-result body was read late.
The original E-versus-`frozen_decision_at` predicate must compare an
**exactly preserved** PostgreSQL `timestamptz` value (or a separately
accepted canonical microsecond-precision transport representation).
JavaScript `Date` typically retains millisecond precision and cannot
silently turn E-1 microsecond into the same apparent instant as E;
`decisionNow < E` authorizes the first `409`, equality does **not**.
Keep that distinction even across Worker serialization, MAC payload and
replay; the §13.5 monotone floor remains a separate unapproved policy.

**Required privilege/proof separation:** PostgreSQL `CHECK` and `UNIQUE`
enforce shape only; they do **not** verify Worker MACs, cross-row ancestral
membership, legitimate command effects or original Player identity. A
guarded `SECURITY DEFINER`, if ultimately selected, must reject arbitrary
caller-selected Player/Hunt/head/timestamp/effect inputs, enforce a safe
`search_path`, narrow `EXECUTE` grants and transactional CAS, and not give
the ordinary runtime principal a means to rewrite a winning older marker.
The MAC key stays unavailable to PostgreSQL and its ordinary credentials:
a routine cannot be *assumed* to verify a secret it does not have. Independently
prove the **selected H-03 SQL-verifiable, scoped Worker authorization before
any protected spendable commit**, plus complementary Worker-side MAC checks
that prevent a compromised normal credential from producing any **MAC-valid**
false gameplay/transport result. Later reader quarantine is not an alternate
write-authorization design. An invalid forged record may cause denial of
service under N, never an accepted false `200/409`. Specify the exact
privileged maintenance/DDL/trigger/role-escape exclusions; do not claim that
the in-DB genesis, predecessor and current head detect coherent privileged
backup rollback. Old v1–v3 Writers must retain legacy protocol and may not
mutate a resource once adopted into protected v4 authority without the
accepted compatibility guard.

**Candidate N SQL credential cut — authority matrix, not GRANT/REVOKE
instructions or an approved deployment topology.** The migrations currently
available as `0001`–`0010` contain no deployed role/row-security/guarded
Writer contract; `runtime.ts:1232-1239` passes the same
`HYPERDRIVE.connectionString` to Hunt and reward operations. The separate
direct `POKENEXUS_DIRECT_DATABASE_URL` migration CLI does **not** imply
that runtime credentials already lack owner privileges. A future migration
must produce these independently inspected *effective* privileges:

| Proposed principal | Allowed use | Must fail even with that credential stolen |
|---|---|---|
| Trusted, separately operated migration/schema/backup principal | Authorized forward migration, retained-key maintenance and separately reviewed bounded archive pruning; counted inside selected N's trusted boundary. | No runtime route may reuse this credential. Ordinary production SQL cannot inherit or `SET ROLE` into it; maintenance is **not** a public command. Privileged coherent backup restore remains excluded from N, not magically detected. |
| Ordinary authenticated Worker runtime SQL role | Minimum owner-scoped point reads and execution of *enumerated*, guarded operations for its validated source and expected versions; the **H-03 authorization must be verified before each spendable v4 mutation**. Under H-05, its account-private reads are also restricted by a non-forgeable Player boundary or equivalent principal isolation. | No direct INSERT/UPDATE/DELETE/TRUNCATE of private original source, accepted command/freeze receipts, old crossing markers, signed public events or retained effect history; no direct protected head rewind; no blanket cross-Player private SELECT; no object/schema ownership, DDL, trigger disable, role elevation, uncontrolled `EXECUTE`, arbitrary SQL code creation or private Worker MAC key. A stolen SQL credential cannot become a trusted Worker. |
| Non-login owner of narrowly defined SQL guards, **only if this option is accepted** | Each reviewed `SECURITY DEFINER` function owns exactly the necessary conditional row/marker transition, validates Player/Hunt/resource identities and exact expected versions, and returns bounded actual row/value evidence. | No general `writeAnyHead`, `grantAnyReward`, `signAnyCommand` or bulk marker rewrite; no identity inferred from caller-controlled `SET`/GUC; no ambient mutable search path, unqualified attacker-owned object reference, untrusted dynamic SQL, default `PUBLIC EXECUTE` or caller-selected timestamp/Player masquerading as authority. Its owner cannot be inherited by the ordinary role. |
| Public presentation reader | Server-authorized genuinely public columns and **H-06 account-only presentation** through non-forgeable Player-isolated views/principals, with a consistent read-only snapshot. | Cannot see private Battle origin, RNG/genetics/source bytes, private digest or protected signing keys; cannot mutate a key/receipt/head or cause a GET repair. Column filtering and HTTP self-scope alone **do not** isolate account-only public-looking rows against a stolen shared SQL reader; prove the separate DB binding before admission. |
| Compatible v1–v3/TASK-037 writers | Existing version-scoped gameplay and correlation semantics for histories/resources that have **not** been adopted into v4 provenance. | No generic direct checkpoint mutation of an adopted v4 Hunt and no unguarded Inventory/Collection/XP/policy/capture updates to an adopted protected Player/resource, even from a legitimate legacy game flow. Admission of the first protected v4 resource must atomically switch *all* its future mutators to an accepted compatibility guard. |

**Composite owner/key integrity is a separate guarded prerequisite.** The
illustrative crossing DDL leaves its owner FKs unresolved, and existing
`0009` has `solo_hunts (player_id,hunt_id)` uniqueness but several
other source/command relations refer to `hunt_id` alone; `0001` stores
the checkpoint owner separately. A final forward migration must prove
that each genesis, mutable head, immutable rise, original freeze and
protected checkpoint refer to the **same** immutable
`(playerId,huntId,checkpointId)` run, with appropriately scoped
composite keys/FKs (adding reviewed unique references where necessary),
DB-enforced immutable ownership and an independent Worker signature over
the same identities. A manual capture's `sourceHuntId=A` and
`advancementHuntId=B` are intentionally different where accepted; its
authoritative **target-freeze/crossing belongs to B**, never to A or a
newly active C. Merely showing that each UUID exists via an individual
FK does not establish that they belong to the same Player or run. This
is an acceptance constraint for the *final* schema, not an instruction
to add a fictitious composite FK onto the unapproved candidate tables
without inspecting historical rows.

**SQL proof versus Worker proof — H-03 direction SELECTED; implementation proof OPEN:** a
`CHECK`, `FOREIGN KEY`, serializable lock, row-count check, trigger and
`SECURITY DEFINER` can establish **database-local** predicates (typed
owner/Hunt linkage, immutable prior row, old checkpoint/version, unique
dense crossing, resource availability, frozen target, equality of actual
returned values and read/write order). They cannot independently establish
that the request came from the trusted Worker, or that its game-core RNG,
reward, genetics and capture inputs were genuinely authorized, if a stolen
ordinary SQL credential may invoke the **same** guard with arbitrary
parameters. In particular:

- **Human-selected H-03 direction to prove:** a scoped, single-transition
  Worker-issued capability whose original operation digest, Player/source/
  advancement Hunt, resource versions, frozen predecessor/head,
  decision-point clock, command/correlation and canonical effect bytes
  cannot be altered; the guarded SQL entrypoint must independently verify
  authenticity **without** obtaining the private Worker signing key, plus
  one-use CAS binding and exact result comparison. This would require a
  separately reviewed SQL-verifiable authenticator/extension or other
  verifiable trusted authorization primitive, canonical byte codec, key
  distribution and replay tests; PostgreSQL currently has **no approved
  implementation** of it. Merely passing a Worker MAC as `bytea` does
  **not** make SQL able to verify that MAC. The **historical symmetric MAC**
  whose secret remains outside PostgreSQL must be distinct from this
  **pre-write SQL-verifiable authorization**: a reviewed asymmetric
  signature with a pinned verification key, or an equivalently proven
  independent verification boundary, is a candidate mechanism, **not** an
  assertion that stock PostgreSQL already supplies a suitable primitive.
  A capability must bind a stable canonical operation intent, precise
  expected pre-state and resource/version limits; the guarded write must
  independently compare the *actual* resulting row/effect with that
  authorized intent before commit. An unanticipated generated value either
  falls inside an explicitly bounded authorized derivation or aborts the
  transaction; it may not be laundered through a post-write MAC.
- **Previously considered alternative, NOT SELECTED by H-03:** narrow database-local
  guards coupled to mandatory Worker verification of the original signed
  operation, live-head/resource equality and source evidence **at every
  accepted read and write**, with `503 authority_unavailable` upon an
  unsigned/invalid mutation. Under N, a stolen SQL credential may still
  cause an availability incident by corrupting a presently mutable row,
  but it must never manufacture a MAC-valid original reward, `409` or
  successful capture; **all** consumers (including legacy-compatible
  Inventory and the public feed) must reject the corrupt live state before
  spending, projecting or re-signing it. If an unchecked legacy path can
  observe and use the unsigned value, this alternative fails the threat
  model and requires a stronger guard/adoption barrier. An in-DB digest
  cannot substitute for the separately held Worker key. This alternative
  remains recorded only to explain the rejection boundary; it does **not**
  satisfy selected H-03 as a substitute for pre-write SQL authorization.

**A staged-write/COMMIT attack must be closed under selected H-03.** The
§13.4 honest-Worker algorithm stages actual DB mutations, compares bounded
`RETURNING` values and locally signs the verified result *before the same
transaction COMMIT*. That sequence alone is **not a database permission
boundary** if a stolen normal SQL credential can invoke an effectful
`stage` guard and independently `COMMIT` **without** performing the final
Worker-signing step. Under the selected SQL-verifiable-capability design,
no runtime-invokable guard may expose spendable/live resource writes until
the reviewed SQL-verifiable authorization has been checked; alternatives
include canonical in-memory/pre-write signed intent with post-write equality,
or strictly non-live staging followed by an authenticated final apply.
If an actual timestamp, Inventory quantity or reward is only knowable
after the guarded write, the canonical capability/commit-check timing must
be resolved **without** allowing unauthenticated half-operations to commit;
a merely present `worker_authenticator bytea` column or the application
promise to call the second function is not sufficient. Historical MAC
issuance over the exact winning `RETURNING` result is a **separate**
post-effect verification step within the winning transaction; it must
never serve as a substitute for an independently verified pre-write
capability. A staged mutation visible or spendable before its final
authorization fails H-03 even if later MAC-verifying consumers would
quarantine it. This paragraph **does not approve** a specific SQL crypto
extension, signature algorithm, function surface or deployment topology.

**Late-decision-time circularity with H-02:** the candidate strict-rise
procedure above currently samples its final guarded crossing time **after**
tentative checkpoint/resource writes (`§13.4`, strict-rise paragraph),
while H-03's pre-write capability is proposed to bind that exact decision
time. Both cannot be satisfied simply by signing the timestamp *before*
the operation if a further lock/precondition can delay the final decision
or the command expires in between. The bounded implementation must identify
the **actual authority linearization point** and show either (i) a fresh,
authenticated H-02 witness and SQL decision sample are taken after every
potentially blocking prerequisite and before one fully pre-authorized
atomic transition, with no intervening blocking operation, **or** (ii) a
non-spendable staging/final-apply protocol that independently authorizes the
late exact-time decision before any protected value becomes consumable.
Neither an application timestamp captured at transaction start nor a
post-effect second signature implicitly resolves this cycle. Under H-02,
an external witness may be obtained **outside** the transaction, but its
freshness/uncertainty must remain independently verifiable at the eventual
decision point; no network witness call is introduced while holding SQL
locks. Until this sequencing is proven, the example strict-rise transaction
is illustrative, **not** an executable H-02/H-03-compliant algorithm.

**Possession of a genuine capability is an additional adversarial case.**
Assume the ordinary SQL adversary intercepts a legitimate, still-valid
Worker-issued transition authorization from a DB parameter/log or an
in-flight call, then invokes the guard directly *before* the intended
Worker transaction. Its signature is genuine, so signature verification
alone cannot distinguish the caller. The guard must permit at most the
**same** precisely authorized, single-use transition under original
Player/resource/command/head CAS, and must atomically establish every
mandatory immutable source/effect receipt required for that spendable
transition. A signed intent that an attacker can commit as a live reward
**without** the accompanying authenticated historical lineage still fails
the end-to-end contract; a later Worker MAC cannot be assumed to appear
after the attacker commits. Conversely, exact intended early application
under stolen capability may be an availability/order disruption within N
but must never yield an altered amount, duplicate debit, altered recipient,
second effect or missing authoritative receipt presented as verified.
Specify whether a pre-authorized canonical receipt, an authenticated final
apply, or another bounded atomic protocol supplies that proof **before**
implementation. No network signing/key-service call is permitted inside
the open gameplay transaction.

**Concrete guard entrypoint acceptance gate:** enumerate `start/accept`,
`freezeTarget`, `persistStrictRise`, `persistSameHState`,
`resolveOneHeal`, `completeEncounter`, `terminalSeal`,
`completeOriginalResult`, `deriveSingleKeyExpiry` and every adopted
shared-resource transition. These are *logical capabilities*, **not**
permission to expose a generic SQL function for each name. For each one
define: immutable authorized source/target and active-Hunt interpretation;
accepted operation/correlation and replay handling; required Player and
resource lock order; expected checkpoint, command, policy, Inventory and
effect-head versions; exact allowed next-state fields; strictly bounded
candidate source/effect bytes; exact affected rows; authenticated resulting
head/marker; failure rollback and output. Validate the actual DB
`RETURNING` values before treating a Worker-authenticated candidate as
winning. A same-key retry must compare its original canonical outcome, not
invoke an effect-capable function for a second application. No permitted
function may accept a caller-supplied arbitrary prior MAC/key/version
combination as sufficient authority to create a *different* future effect.

**Legacy-route compatibility is a live admission blocker, not merely a
schema concern:** `hunt-checkpoint-repository.ts:503-526,594-627` performs
direct checkpoint updates for TASK-037 without the proposed v4 signed
head/crossing; `inventory-repository.ts:193-284` can update
`player_inventories` and INSERT/UPDATE/DELETE `inventory_entries`,
including removing a zero-quantity row, without a new v4 per-item source
proof. Other capture/Collection/progression/policy operations are enumerated
in §10.1. The versioned reader may reject a v4 checkpoint on one API path,
but that **does not** revoke the common SQL credential's direct DML
privileges. Before admitting a protected v4 Hunt or adopting Inventory/
Collection/XP, prohibit these raw writers from changing protected rows
at the *database* privilege/guard boundary, route genuine legacy commands
through a verified compatibility transition where applicable, and prove
the resulting v1–v3 gameplay remains unchanged. If this cannot be
implemented without allowing an unchecked path, v4 admission is
`503 authority_unavailable`/disabled, not a partial privilege cut.
**Plain PostgreSQL table/column `GRANT UPDATE` is not a per-row version
guard.** A single shared role allowed to UPDATE an Inventory/checkpoint
table for a v3 row also has that table privilege for a v4-adopted row;
an application-side `WHERE schema_version='v3'` is not a defense
against the stolen credential issuing its own SQL. Revoke direct mutable
access to shared protected tables and provide a version-aware guarded
compatibility route, or separately demonstrate an enforced database
row-level policy/trigger that the compromised role cannot bypass, change,
or satisfy by setting an attacker-controlled session variable. Do not
assume that having a `v4` flag in the row, or changing only an HTTP
route, constrains the SQL privilege.
Adoption and an overlapping old writer must serialize at the **same
resource-root row/guard** as the actual Inventory/Collection/XP mutation,
not just under Hunt's Player-root lock: an independent reward or capture
request may never acquire `player_hunt_roots`. A legacy transaction that
read `not adopted` before blocking on an Inventory row cannot then
commit an unsigned update **after** a competing transaction adopted that
item/Player; re-read versioned adoption under the winning resource lock,
or enforce the barrier in a database-level transition that no raw writer
can evade. Conversely an older writer whose committed effect won *before*
adoption becomes part of the signed N starting snapshot without receiving
a fictional retroactive v4 operation. Prove both serial orders, including
zero-quantity DELETE and an already in-flight TASK-037 checkpoint write.

**Confidentiality scope of the stolen normal SQL writer:** a runtime role
that legitimately reads private Battle, genetic, RNG or resource evidence
across Players can expose those bytes if its SQL credential is compromised,
even when it cannot create a MAC-valid fake gameplay event. Neither the
Worker-side MAC nor application-only owner filtering constitutes
database-enforced confidentiality for that compromised credential.
Inventory the exact private `SELECT` grants/functions exposed to it and
disclose this distinction. Selected H-05 **requires** private-data least
privilege and non-caller-forgeable per-Player isolation for account-private
reads, through independently verified identity binding, narrower isolated
principals or an equivalent enforcement boundary; a compromised shared
writer must not gain blanket cross-Player private reads. The precise
credential topology and its compatibility with authorized Worker operations
still require independent design review and direct-SQL adversarial tests.
Do not confuse the public reader's no-private-column restriction with a
guarantee that the more privileged ordinary Worker writer cannot read
those columns.

**Adversarial fixture matrix for the forward migration — not executed:**

| Credential-only attack / failure | Required observed result |
|---|---|
| Ordinary writer issues `UPDATE/DELETE/TRUNCATE` on an old first-crossing marker, genesis, freeze or effect row; resets signed current Hunt highwater or adds a fake earlier/later crossing | Denied by effective ACL/guard, or impossible to read as MAC-valid; a missing/forged first marker quarantines rather than returning pending or minting `409`. Do not claim MAC-valid merely because the syntactic CHECK/UNIQUE passes. |
| Same ordinary role invokes an overly broad `SECURITY DEFINER` with another PlayerId, its own `SET ROLE`/GUC, a copied valid earlier signature, altered resources or a stale head/version | Reject identity/source/version mismatch, replay nonce and incompatible canonical effect; no false validated `200/409`, reward/HP/capture, and no direct role elevation. Include aborted/retried identical correlation, signed candidate in a different Hunt, and cross-Player clone. |
| Malformed owner tuple pairs a genuine Player P head with another Player Q's Hunt or checkpoint, or reassigns original `player_id` after signing | Denied by the final composite owner linkage, immutable original run/ownership and source/advancement-aware Worker proof. Individual UUID FKs and a syntactically valid crossing ordinal do not authorize a cross-tenant result. Verify old non-composite rows are inspected/isolated rather than silently becoming v4 valid. |
| Ordinary SQL credential calls the guard with syntactically valid values but **no Worker-issued authenticatable permission** | Selected H-03 requires the guarded SQL boundary to reject it **before** any spendable transition using independently verifiable, narrowly scoped Worker authority. Historical MAC validation is additional evidence, not a substitute for rejection at the write boundary. An unverified signature accepted as a credential is a Class-A rejection. |
| Stolen SQL role races the Worker using a **genuine still-valid** scoped authorization observed in an in-flight call | Winning CAS allows at most the originally signed operation/recipient/effect exactly once; its mandatory immutable source/effect history and resulting head commit atomically with the live resource. No early commit of an authenticated-but-unproven spendable row, forged second operation, cross-Hunt reuse, duplicate ball debit or success without proof; the later honest Worker must replay the identical durable receipt or fail closed. A true signed capability is **not** evidence that the caller is the Worker. |
| Stolen SQL role calls `stageReward`/`stageCrossing` and executes `COMMIT` **without** the expected second Worker signature/verification step | The mandatory SQL-verifiable H-03 guard must prevent a spendable commit without independent authorization; it cannot rely on the normal Worker always calling a subsequent finalizer or on eventual reader quarantine. Repeat with crash after partial stage, copied old capability and a wrong original command. |
| A v3/TASK-037 checkpoint/Inventory/policy/capture writer mutates an already v4-adopted Player/resource, including zero-item deletion or public-source continuation UPDATE | Reject unguarded mutation or enforce its version-aware compatible proof in the same winning transaction. Demonstrate no unguarded old writer is granted a second SQL principal/connection that bypasses v4. |
| Shared SQL role is legitimately granted table-wide `UPDATE` for v3 Inventory/checkpoint rows and directly updates a row marked v4 | A mere application `WHERE legacy` predicate or static column grant cannot stop the credential-only bypass. Deny at a mandatory version-aware SQL guard/row-level mechanism with non-forgeable authority or fail v4 admission; separately verify `SET`, role ownership, trigger disable and RLS bypass are unavailable. |
| Legacy Inventory/reward command begins before v4 adoption but commits after it, or vice versa | Acquire the same protected Inventory/root locks and recheck the adoption version **at the final winning write**. An old unsigned mutator cannot bypass a newly adopted resource using a stale pre-lock `not adopted` read; the reverse order signs the existing committed balance as N's trusted starting snapshot. Include cross-route rewards and zero-item row deletion. |
| Stolen ordinary *writer* SQL credential directly selects private source/provenance for another Player | Under H-05, deny blanket account-private reads by least privilege plus non-forgeable Player binding/equivalent principal isolation; an overly broad ordinary writer credential fails the proposed MVP confidentiality gate even if Worker MAC prevents forged mutation. Preserve legitimate Worker access by separately proven routing. |
| Public reader uses SQL directly to fetch private Battle/source columns, execute mutation routines, request another Player through a freely assigned session variable, or read an old public page whose marker is missing | Under H-06, no private column/mutation privilege; genuinely public rows may be shared, but account-only presentation must reject a stolen reader's cross-Player SQL query via non-forgeable Player isolation, not a caller-settable GUC. Preserve server-side self-scope; missing proof cannot return falsely verified history. |
| Stolen public-reader credential calls the actual SPEC-017 `hunt-presentation-public-read.ts` query with Player B's UUID/huntId, or bypasses its `WHERE` by issuing direct SELECT | The existing presentation feed is account-only: reject B's stream/header/event rows, including projected owned HP and all cursor/page metadata, unless the read is independently authorized for B. A syntactically valid `$1=playerB`, column-only `GRANT` or caller-chosen GUC is insufficient. Verify authorization across first, middle, late, terminal and resumed pages with the deployed SQL principal, while retaining SPEC-017's unchanged field-level wild-HP/Genetics masks. |
| Stolen reader replays a **genuine but narrowly scoped** account-only read capability observed from a prior authorized query | The signature verifies only the originally authorized Player/purpose/resource/window: no widening to another Player, Hunt, query, private proof column or later unbounded history. Explicitly test the residual same-scope replay window and any opted-in stronger holder-of-key proof; a read-only GET cannot honestly promise a consumed single-use nonce or side-effectful token redemption. A bare stolen SQL credential with **no** authentic read capability must enumerate zero account-only foreign rows. |
| Privileged DBA performs coherent historic rewrite/backup restore | Operationally trusted/excluded by selected N; the test must not misreport same-DB signatures as detection. Strong rollback protection requires separately selected S/off-DB witness. |

No role names, grants, access-function signatures, signing algorithm,
extra service, single-use capability scheme or maintenance horizon become
accepted merely from this matrix. Record the exact effective
`has_*_privilege`, `pg_roles`, membership and
`pg_default_acl` evidence, all relevant granted routine signatures and
the guard's normalized source/mutation proof **after** a reviewed,
forward-only migration on disposable PostgreSQL, with a normal credential
used as the adversary. Without that evidence, v4 is **NOT TECH READY**.

**Executable evidence still required, not produced by the schema sketch:**
derive an authorized forward migration with canonical binary/MAC codec and
version pin; validate all pre-existing row shapes; run PostgreSQL-17
`EXPLAIN (ANALYZE, BUFFERS, WAL)` on 0/1/100/10,000 rising markers and
pending commands, showing stable count of index seeks, returned/affected
rows, elapsed p95/p99 and bytes. One `LIMIT 1` bounds **returned logical
rows**, not the number of physical MVCC index/heap pages visited when dead
tuples, bloat or long-lived snapshots accumulate; define an enforceable
Worker/DB work budget, controlled VACUUM/retention and fail-closed resource
exhaustion instead of claiming a hard constant page count from this DDL
alone. Force rollback, lock interleaving and
clock-regression fixtures; impersonate only the normal SQL role and attempt
raw writes, `SET ROLE`, unsafe routine `EXECUTE`, hidden-earliest-marker
queries and forged signature/head. Test two independent v4 command kinds,
non-active target, legacy v1–v3 coexistence, signed predecessor/key retention
and a forged earlier first `409` near E. An isolated test DB is mandatory;
this DRAFT authorizes **no migration execution, repository history change
or endpoint enablement**.

**Observed source support versus v4 proof still owed:**

| Fast-path hypothesis | Current source evidence | Unproved v4 acceptance condition |
|---|---|---|
| (a) Hunt highwater never decreases | `persistOwnedHuntCheckpointInTransaction` checks the locked expected `row_version` and rejects backward `logical_time_ms` (`hunt-orchestration-repository.ts:1443-1503`); a different run owns a different checkpoint. | Every v4 gameplay writer, guarded proof-head and forward migration preserves the same monotone no-fork invariant; no normal SQL credential can bypass it. |
| (b) frozen target T is not behind highwater | Active-Hunt target-freeze routes calculate `checkpoint.logicalTimeMs + max(0, elapsed)` under Player root lock (`application.ts:1243-1262,1554-1590,1706-1732,2516-2595`). | Bind the exact immutable **target-freeze operation** and current authenticated highwater in one winning transaction for every applicable command, even if acceptance precedes freezing. |
| (c) K cannot own the **first strictly rising** crossing beyond its cutoff T | Ordinary source advancement clamps to cutoff (`solo-hunt.ts:3277-3292,3469-3470,3501-3515,3535-3585`); a deferred K domain heal may persist at D>T **after** another operation reached D (`application.ts:1881-2025,2132-2330`). | Bind the actual **outer advancing command** to a rising marker. A later K domain heal/same-highwater checkpoint at D>T is not a first crossing; independently prove all command/phase/terminal paths. |
| Signed **first** marker, not just any valid marker | Current `0009` has no v4 crossing table, restricted ACL, signed receipt or authenticated index head. | Prove unique/contiguous index and first-row completeness under N, including rollback/OCC-loser, missing marker and SQL adversary fixtures. |

Counterexample: K is an accepted `heal_item` submitted during Battle at
cutoff C and later resolved at inter-Battle D>C. K can write an HP checkpoint
at D, **but K was not the outer operation that first advanced the Hunt from
at most C to D**. K remains excluded from eager `command_superseded` under
SPEC-015 and cannot forge or replace that prior crossing. A normal
checkpoint/claim/retreat outer command with target T has different
cutoff-bound behavior. This is a required §13.3 negative fixture, not a new
gameplay rule or a claim that the v4 fast-path is already implemented.

Finally, the original `continuationExpiresAt` and supersession
`terminalAt`/result-expiry have different authority. A supported exact-key
lookup first reads any **previously committed terminal** result, then its
full-result/tombstone window, and only if **no terminal result preceded**
the pending lease expiry may it derive pending `410` and persist a bounded
single-key tombstone. A database clock regression can never undo such a
durable terminal/tombstone receipt. The still-open Class-A clock design must
decide how an **unrecorded** observed post-expiry time and a later regressed
sample are handled without mutating a public GET or contradicting the
original accepted lease. It must not repurpose highwater operation order as
wall-clock elapsed time.

### 13.5 Candidate transport-clock non-resurrection rule — separate Class-A gate

The v3 adapter currently samples a database `clock_timestamp()` after
obtaining the Player root lock (`hunt-orchestration-repository.ts:373-399`),
but supersession and explicit terminal completion also sample the clock in
their own statements (`:557-605`, `:608-654`). These are **different samples**
even inside one transaction. Statement/operation order is controlled by the
serialized Player root and proof operationSequence, **not** by sorting the
wall-clock samples. PostgreSQL wall time can tie or regress, so using its
value alone as a monotone commit position is invalid.

The current v3 effect/result order is also an independent regression risk
under an expiring pending key: `application.ts:1803-1837` writes a new policy
before `completePublicHuntCommandInTransaction` samples expiry, then returns
the constructed `200`; the repository may instead mark that same key `gone`
(`hunt-orchestration-repository.ts:608-654`). Analogous final-effect ordering
exists for manual capture (`application.ts:1353-1395`). Retreat terminalizes
before completion too (`application.ts:3380-3401`), but **does consume** the
returned completion record via `commandReplayResult(completed)`; it is not
another discarded-return case.
An expiry crossing between those operations could commit an effect with a
public `200` whose exact-key replay is `410`. This is a **code-order risk to
reproduce on isolated PostgreSQL and remediate in a separately authorized
v1–v3 implementation task**, not permission for v4 to inherit that split.
The proposed v4 contract below requires one atomic effect/status disposition.

One **candidate** v4 protection against a previously observed expired key
becoming pending again is a guarded, authenticated Player-scoped
`lastObservedDecisionAt` floor, retained with the command-operation head:

1. Under the Player serialization lock, sample authoritative PostgreSQL UTC
   **at each bounded transport decision point** (acceptance, explicit terminal
   completion, first highwater crossing or exact-key expiry), after rechecking
   its prerequisites **and obtaining any additional blocking SQL locks**,
   immediately before its guarded marker/point write. An implementation may
   sample inside the final locked guarded statement; taking the sample before
   a potentially blocking second lock would not establish this decision time.
   Freeze `decisionNow = max(sampledDatabaseUtc, lastObservedDecisionAt,
   priorDecisionNowInThisTransaction)` for that decision. One first-crossing
   range marker samples **once for the range**, never once per affected key.
   Two distinct decisions in one transaction may have distinct samples; one
   decision must use its **same frozen sample** for the eligibility predicate,
   timestamp and deadline. Advance the authenticated Player floor with the
   winning operation(s) in the same transaction. The timestamp is the frozen
   guarded **decision-point** time, not an unknowable PostgreSQL commit time;
   a long-running prerequisite must not move behind a previously sampled
   acceptance/expiry decision. This candidate floor is **transport retention
   authority only**.
   SPEC-015 §4.3 still defines `serverNow` for Hunt receipt/cutoff from the
   database under Player serialization with the existing
   `max(serverNow, logicalTimeAnchorAt)` logic; do not silently substitute a
   new clock for combat/capture/heal target freezing. If the domain and
   transport policies must share a different clock, that is a distinct
   SPEC-015 Class-A behavior decision.
2. Eager supersession compares this frozen `decisionNow` to the original
   pending `continuationExpiresAt` **at the winning highwater crossing**.
   If `decisionNow < expiry`, and the command is eligible and lacks an
   earlier accepted terminal/gone receipt, the winning transaction freezes
   **one authenticated range-crossing marker**, including its sampled time,
   operation position and eligibility predicate. That marker makes each
   affected key *logically terminal* as `409` at the original crossing time;
   it never writes or signs one physical terminal row for every pending key.
   A subsequent supported exact-key replay can materialize at most its own
   immutable result receipt without moving the terminal timestamp: the
   30-day full-result and following tombstone windows derive from the
   original crossing, even when the first lookup occurs later. If
   `decisionNow >= expiry`, the pending correlation is
   already past its lease, so do not create a later `409` or 200 even if the
   raw clock regresses. Its domain heal, if any, remains independently
   scheduled/resolved under the accepted timeline.
3. On the first **exact-key** pending-expiry observation, insert one guarded
   immutable `gone`/tombstone receipt in the same transaction as the retained
   decision-time floor, then return `410`. Do not return a final irreversible
   `410` based solely on an uncommitted read that could later be reversed by
   an earlier raw-clock sample. A normal state/presentation GET remains
   read-only (`touchActivity=false`); it cannot repair the floor or produce
   a new per-key tombstone as a side effect. Exact-key replay reads a prior
   terminal or gone receipt **before** deriving any unmaterialized expiry.
4. An unsigned floor rewind, out-of-order marker time, unavailable original
   receipt or mismatch with the authenticated Player/Hunt head fails closed
   under N; it does not authorize a 200/potion debit/capture/reward. A normal
   SQL credential must neither rewrite the time floor nor forge a missing
   first marker. The lower-bound floor limits **logical resurrection** but
   does **not** prove precise real-world UTC passage or safety from an
   arbitrarily erroneous forward DB-clock leap. A privileged coherent backup
   rollback remains outside N.
5. **A pending command's current transaction must not commit an effect after
   its definitive status decision finds the original pending lease expired.**
   After acquiring the necessary locks but **before the first command-owned
   tentative effect**, make an indexed exact-key lease/terminal check. The
   transaction may then tentatively mutate a bounded checkpoint segment,
   public source, policy, Inventory/capture, Hunt terminal seal or other
   command-owned consequence. Immediately before the final guarded `202` or
   terminal-result decision, take that decision's independent late clock
   sample and recheck the original lease and any previously committed
   terminal/crossing authority. If `decisionNow >= original pending expiry`
   without a prior terminal result, **roll back the entire current transaction**:
   no new game state, capture, reward, policy, range marker, per-key terminal
   `200` or continuation `202` from that invocation may survive. **For an
   already durably accepted pending key**, only after rollback may an
   independently guarded exact-key transaction **reload that committed key
   and its original expiry, inspect prior terminal/crossing receipts and
   take a new authenticated decision sample against the last *committed*
   Player floor**. It may record `gone` and return `410` only if that fresh
   `decisionNow >= original expiry` and no earlier applicable terminal result
   wins; the failed transaction's late clock sample is not durable evidence.
   If the clock regresses below E after rollback and no committed floor proves
   expiry, fail closed on unresolved temporal authority instead of signing a
   fictional irreversible `410` from an abandoned sample. Infrastructure
   uncertainty remains fail-closed until the tombstone is durable. If the
   same rolled-back transaction also contained the key's
   **first acceptance**, no key/domain record survives: do not invent a
   tombstone for an unaccepted UUID; a subsequent attempt must re-enter normal
   unbound acceptance or fail closed on unresolved clock authority. A previous
   committed `202` segment remains valid, and the already accepted *domain*
   heal obligation survives expiry; a heal
   attempted in the rolled-back transaction may be retried under independent
   eligible domain authority. If the late outcome sample is still before
   expiry, it is the proposed command-result linearization point; a physical
   PostgreSQL commit occurring later does not provide an independently known
   replacement timestamp. A separate Class-A rule would be required to make
   unknowable commit-time UTC the expiry authority. The first and late checks
   are bounded **point** checks on the active command, never sweeps of all
   pending keys.

#### Selected timestamp direction for v4 — Class-A conformance pending

The Human Owner selects the **floor-based transport** direction (alternative
A), with selective fail-closed handling of severe clock anomalies. This
selection is supplemented by **H-02 (2026-09-30): require an independent,
authenticated elapsed-time/UTC witness** to detect material forward-clock
faults before irreversible expiry; do not waive that risk as acceptable under
model N. The actual independent source, trust, uncertainty bound, anomaly
thresholds, witness outage response, incident recovery, SQL/MAC
implementation, migration and endpoint activation remain unapproved.
Subject to those Class-A acceptance gates, the v4 contract would bind every
*new, explicitly v4-versioned* public correlation in its winning Player-root
transaction as follows:

1. Retain the independent **raw database receipt sample** taken under the
   Player lock for the SPEC-015 gameplay cutoff. After bounded preconditions
   are revalidated, take the transport sample at the **specific guarded
   decision point** described above, freezing its `decisionNow` against the
   authenticated Player floor and any earlier decision in the same
   transaction. Reuse this exact sample for that decision's expiry predicate,
   terminal/acceptance timestamp and indexed effect; do not let a nested SQL
   helper sample another clock while deciding the same outcome. Do not do
   unbounded work, acquire a blocking lock or await external I/O between
   decision sampling and the guarded write. A transaction that both accepts
   a key and later finishes
   its command may have two distinct transport decision samples. Advance the
   floor only with a winning guarded operation; an OCC-losing, rolled-back or
   unbound attempt creates neither a floor advance nor a terminal receipt.
2. Freeze a newly accepted **transport** command's `acceptedAt` as
   its acceptance-point `decisionNow`, with
   `continuationExpiresAt = acceptedAt + 30 days` and
   `tombstoneExpiresAt = acceptedAt + 60 days`. An explicit `200`/`409`/`422`
   terminal result freezes the decision time of its **own** guarded winning
   operation, even if acceptance and completion share a transaction; a
   supersession-derived `409` instead freezes the **original first eligible
   crossing** marker's `decisionNow`, never the eventual replay lookup time.
   An old pending key without an earlier eligible terminal operation becomes
   `410` at the first guarded exact-key expiry decision once
   `decisionNow >= acceptedAt + 30 days`. Domain heal records remain alive
   independently. A completed key's own full-result interval is
   `[terminalAt, terminalAt + 30 days)` and its tombstone interval is
   `[terminalAt + 30 days, terminalAt + 60 days)`; a pending key's supported
   tombstone interval is `[acceptedAt + 30 days, acceptedAt + 60 days)`.
   After the applicable 60-day supported horizon, do not imply that retained
   key material or its response remains available indefinitely.
3. Continue to use **`rawServerNow`**, with the existing
   `max(rawServerNow, checkpoint.logicalTimeAnchorAt)` clamp, for the exact
   SPEC-015 gameplay receipt/cutoff; use the accepted raw clock/SQL expression
   for Hunt Start/recovery, domain healing `resolvedAt`, and presentation
   sealing. The new transport `acceptedAt` and `terminalAt` cannot silently
   replace a stored `targetWallClockAt`, healing cutoff, Encounter due time,
   recovery anchor or presentation `statement_timestamp()`. Their raw and
   clamped values may legitimately differ in the **same** transaction.
4. Exact-key replay resolves its original command-kind/intent identity,
   original transport-clock version, prior authenticated terminal/gone point
   and first applicable crossing **before** considering pending expiry.
   A materialized per-key receipt may be created only under the Player lock
   and must inherit the earlier crossing's timestamp and result; neither
   normal GET nor a second replay creates a new result/expiry lease.
   The v4 mode must be frozen on first command acceptance, including v4
   Start, no-active-Hunt policy save and manual capture where
   `captureSourceHuntId` and `advancementHuntId` differ. Define and test the
   dispatch rule before adoption: existing accepted v1–v3 correlations keep
   their original lifetime, and no legacy/shared-resource writer may mutate
   a v4 proof or reclassify its old key by sampling the legacy raw clock.

This variant makes the **retention decision clock** monotone, not external
elapsed time. For example, with an authenticated floor at day 31 and raw
PostgreSQL time regressed to day 20, a newly accepted v4 key receives
`acceptedAt = day 31`, pending expiry at day 61 and tombstone horizon at day
91, while its Hunt cutoff is still calculated from raw day 20 plus the
accepted logical-anchor clamp. Using raw day 20 for this key's `acceptedAt`
would silently consume **11 days** of its 30-day continuation on arrival at
floor day 31; with a floor at or beyond day 50, the same raw-day-20 key would
be immediately expired. Conversely, a **forward** raw-clock leap to
day 100 may expire a day-20 pending key early and pin the Player's floor at
day 100. No PostgreSQL-only floor can tell an erroneous day-100 sample from
real elapsed time or safely roll that authenticated floor backward. An
operator-visible clock-integrity incident and its bounded fail-closed policy
therefore remain separate acceptance requirements; this candidate does not
promise 30 days of real-world availability under arbitrary clock faults.

**Clock-anomaly guard to specify before acceptance:** compare each new raw
sample against an authenticated prior sample **and its sampling context**;
elapsed time between samples matters. A raw timestamp five seconds beyond a
previous sample is ordinary after a player has been idle for five minutes,
and cannot alone establish a forward clock jump. Likewise, the Player floor
is a lower bound on prior *transport decisions*, not independent evidence of
current UTC or a sufficient detector of a forward leap. Specify a trusted
elapsed-time or clock-health witness, its uncertainty, a bounded recovery
path and an explicit failure response before claiming selective blocking of
severe anomalies. Without that evidence, an uncertain decision must fail
closed; never infer a safe numerical tolerance solely from two PostgreSQL
wall-clock values. A provisional clock-integrity incident must not rewrite
the authenticated floor, shorten an already accepted key's original lease,
or alter the separate gameplay cutoff.

**Unselected alternative for Class-A comparison:** retain raw PostgreSQL timestamps for
new transport acceptance, but once a committed authenticated decision floor
exceeds a later raw sample, reject affected command decisions with
`503 authority_unavailable` until a separately trusted clock or an accepted
incident-recovery procedure reestablishes temporal authority. This avoids
assigning a future logical transport timestamp, at the cost of potentially
blocking legitimate new commands and retries after a large forward leap.
It must not silently return `202`/`200` using the regressed sample or allow
a once-gone correlation to become pending. Alternative A is the selected
design direction, but **not yet an accepted SPEC-015 Class-A amendment**.
The exact treatment of new-key `acceptedAt`, terminal-result clocks, old
versioned correlations, forward-jump incidents and gameplay-clock separation
still requires independent security/concurrency and real PostgreSQL/Worker
conformance review before formal acceptance.

**Selected direction, not implemented yet:** the floor changes which timestamp is
used for some retention decisions after a real DB-clock regression compared
with blindly applying raw `clock_timestamp()` on every read. Verify the exact
effect on SPEC-015's 30-day lease, `410` tombstones, previously accepted
`409` supersessions, terminal `200` responses and independent target-freeze
time before accepting this as the v4 time amendment. If preserving raw
database-time semantics through a regression is a strict requirement, the
alternative is a trusted monotonic UTC authority or a fail-closed incident
until clock integrity is restored; no PostgreSQL-only floor can establish
accurate external elapsed time after an arbitrary privileged clock jump.

Adversarial fixture: key K accepted at day 0 with expiry E=day 30; its
committed first crossing at day 29 signs `409`, so a retry at day 31 returns
the original `409` while its terminal-result window is supported, regardless
of raw clock regression. Key L with **no** earlier terminal crossing first
returns `410` at day 31 and keeps its signed gone point after raw time moves
back to day 20. Heal domain key H canceled at day 29 with **no public
terminal** receipt yields `410` when first retried at day 31 even though its
domain `not_applied / hunt_terminal` remains auditable. Repeat the same
fixtures with a later active Hunt B and with same-timestamp command points;
observe original acceptance, operation sequence and result bodies rather
than inferring chronological order from PostgreSQL timestamps. Also freeze
a **new** key while the authenticated Player decision-time floor remains at
day 31 but raw PostgreSQL time has regressed to day 20: the pre-acceptance
Class-A clock decision must specify whether `acceptedAt` and the original
30-day pending lease use the floor or the raw sample consistently, without
silently shortening an already-accepted replay window. This is a conformance
question for the selected floor direction, not approval of implementation.

#### Transport-time acceptance fixtures and evidence gate

The following fixtures are **required prospective tests**, not observed PASS
results. Run them against a disposable PostgreSQL-17 database and the actual
Worker command path; freeze the clock provider in the fixture without
modifying production time or an existing Player's records.

| Fixture | Required observable property |
|---|---|
| Normal idle interval: raw time advances five minutes since the last Player decision | The elapsed interval alone is not classified as a five-minute forward clock fault; a legitimate new key receives a consistent acceptance/expiry pair. |
| Small raw regression while the authenticated floor is ahead | A permitted decision uses the floor for transport timestamps and never moves the floor backward; its gameplay cutoff still follows SPEC-015. |
| Raw time jumps forward across a pending expiry, with an independent clock-health witness reporting uncertainty | No irreversible `410`, eager `409`, reward, policy or Inventory effect may be justified by an untrusted clock sample; the command fails closed pending an accepted recovery rule. |
| Clock-health witness unavailable or contradictory | The implementation cannot claim a verified forward-jump threshold from Player floor and raw PostgreSQL time alone. Return a specified bounded unavailable response for affected decisions, without creating a terminal/tombstone point. |
| Two guarded decisions in one transaction, second sample later than first | Each decision uses its own frozen time for predicate and result, and a rolled-back transaction advances neither the durable floor nor the public receipt. |
| Expiry discovered after tentative checkpoint, capture, reward or policy writes | Roll back every effect from that invocation; a subsequent exact-key transaction rechecks the committed floor and original lease before persisting `gone`. |
| Earlier signed `409` crossing, then raw regression and later exact-key retry | Replay retains the original crossing time and result window; it does not convert `409` to pending or `410` while the original result is supported. |
| Earlier durable `410` point, then raw regression | The key never returns to pending; a GET does not mutate the floor or recreate a tombstone. |
| New v4 acceptance with raw time behind floor | Freeze acceptance, continuation expiry and tombstone horizon from the **same** selected transport-time authority; assert no immediately shortened lease. |
| Existing v1–v3 correlation alongside new v4 correlation | Each retains its versioned clock and result semantics; no legacy writer mutates v4 authenticated proof. |
| Concurrent Player commands and forged ordinary-SQL floor/marker writes | Only the winning serialized authorized operation advances the floor; unprivileged writes cannot fabricate time authority or bypass the guarded status decision. |

Before Class-A acceptance, name the independent clock-health witness and
its trust boundary, quantify its error and staleness, define the incident
thresholds and recovery authorization, and specify the exact public response
for an unavailable clock. A per-process monotonic timer cannot by itself
establish elapsed UTC across Worker restarts, distinct Workers or long idle
periods; an unauthenticated HTTP Date header cannot authenticate PostgreSQL
time. Benchmark the additional witness/verification path separately from
the indexed floor update, reporting p50/p95/p99 and contention under
concurrent commands. The O(1) logical floor comparison alone is **not**
evidence of bounded wall-clock latency or an accepted clock authority.

#### Bounded incident response — proposed contract, not accepted

The selected floor does **not** establish clock correctness. Separate the
integrity of a prior committed transport decision from confidence in a new
wall-clock sample. In particular, the system must not infer a forward jump
from the difference between the last Player decision and the current sample:
the Player may have been offline for an arbitrary legitimate interval.

| Evidence available at a guarded decision | Proposed treatment | Prohibited inference |
|---|---|---|
| Current sample passes an independently authenticated freshness/uncertainty check | Apply the selected monotone floor and commit the exact decision sample with the guarded effect. | A valid sample proves that every prior timestamp was accurate. |
| Raw sample is behind the authenticated floor but the independent witness establishes a bounded clock regression | Preserve the floor for transport; do not regress terminal or tombstone state. | The raw regression authorizes shortening or restarting a lease. |
| Independent witness identifies a forward jump or cannot bound sample uncertainty | Do not issue a *new* time-dependent terminal/expiry decision; fail closed with an explicitly versioned unavailable response and no partial effects. | An uncertain future sample proves a key expired. |
| Existing immutable terminal result can be returned without making a fresh time-dependent retention decision | Preserve the stored result and ordering, subject to the accepted retention/authorization contract. | A fresh clock sample may rewrite the original result or crossing point. |
| Worker restarts, switches regions or loses witness state | Re-establish the witness trust chain before new time-dependent decisions; retain durable Player floor and existing signed points. | Process uptime or local monotonic counters provide durable UTC continuity. |

**Recovery requires an explicit operator/authority contract**, not an
automatic reset of `lastObservedDecisionAt`. Specify how a replacement
clock-health witness is authenticated, how conflicting observations are
resolved, what audit record identifies the incident and its resolution, and
whether affected requests receive retry guidance. No normal SQL credential
or public API command may reset the floor, backdate a signed crossing or
reopen a gone correlation. If the witness cannot be supplied with a finite
availability and latency budget, report that operational cost as a Class-A
tradeoff instead of claiming the floor alone provides both uninterrupted
availability and arbitrary-jump safety.

**Compatibility gate:** the proposed unavailable behavior is limited to
newly versioned v4 decisions. Do not silently retrofit v1–v3 response codes,
leases or timestamps. A mixed-version conformance run must prove that
legacy commands cannot mutate v4 floor/marker authority, including when
they share the Player-root lock and complete after a v4 incident.

#### Existing v3 completion-order regression — isolated implementation gate

Source inspection confirms the **control-flow possibility**, not a reproduced
PostgreSQL execution: `completePublicHuntCommandInTransaction` samples a new
`clock_timestamp()` and returns a `gone` record when the original pending
lease has expired (`hunt-orchestration-repository.ts:608-665`). Its callers
in the policy-save success path (`application.ts:1803-1837`) and manual
capture success path (`application.ts:1353-1395`) perform authoritative
writes first, await completion, **discard its returned status**, and return
the constructed `200`. The same transaction can therefore commit the domain
effect and a `gone` command if expiry is crossed before completion. A retry
would observe the persisted `gone` rather than the original `200`.

Before accepting v4 or treating legacy coexistence as proven, reproduce this
ordering on a disposable PostgreSQL instance with a controlled clock and
original continuation expiry: (1) accept a pending key just before expiry;
(2) pause after the last authoritative effect and before the completion SQL;
(3) cross expiry; (4) resume and commit; (5) compare immediate response,
domain effects, persisted command status and exact-key retry. Include both
policy save and successful manual capture. Test retreat separately:
`application.ts:3395-3401` consumes the completion record, so verify whether
it returns persisted `gone`/`410` while still committing terminalization.
Do not classify retreat as a discarded-return case. A passing regression fix
must prevent a committed effect
from coexisting with a public `gone`/`410` disposition for that same command;
an expired command must roll back its tentative effects and resolve its
status in a separately guarded transaction when necessary. This is a
**separate v1–v3 implementation authorization and independent QA gate**;
documenting it here does not authorize changing legacy semantics or files.

The same **discarded-return** pattern also appears in the manual-capture
`skip` branch (`application.ts:1304-1316`): it closes the pending capture,
then ignores the completion record and returns its constructed `200`.
Expand the controlled-clock fixture to cover skip, successful capture and
policy save separately. In contrast, the retreat success branch
(`application.ts:3395-3401`) and healing resolution paths
(`application.ts:1977-1987,2043-2050`) inspect the returned completion
record via `commandReplayResult`; their candidate failure is **effect/status
atomicity**, not necessarily immediate-response disagreement. The exact
failure requires a PostgreSQL reproduction with the public command's lease
crossed *between* the domain write and completion. The prior recheck
(`application.ts:480-503`) cannot rule out that later crossing because
completion takes its own clock sample. The documentation must not describe
these paths as verified production failures until that reproduction runs.

**Additional effect-first caller:** successful Hunt start creates the Hunt,
checkpoint and presentation, then completes the public command
(`application.ts:1120-1145`). It **does** consume the returned completion
record, so it belongs with retreat/healing in the effect/status-atomicity
fixture, not with the discarded-return cases. The controlled expiry must be
injected after the last domain write and before completion, and the fixture
must verify whether an active Hunt remains after an immediate `410`.

| V3 path | Completion return handling | Specific negative fixture |
|---|---|---|
| Policy save | Discarded (`1803-1837`) | Policy row committed; immediate `200`; persisted `gone`; exact-key `410`. |
| Manual capture attempt | Discarded (`1353-1395`) | Ball/capture effect committed; immediate `200`; persisted `gone`; exact-key `410`. |
| Manual capture skip | Discarded (`1304-1316`) | Pending capture closed; immediate `200`; persisted `gone`; exact-key `410`. |
| Hunt start | Inspected (`1141-1144`) | Hunt created but immediate/exact-key `410`. |
| Retreat | Inspected (`3395-3401`) | Hunt terminalized but immediate/exact-key `410`. |
| Heal resolution | Inspected (`1977-1987`, `2043-2053`) | Heal applied or scheduled command resolved, but public result is `410`. |

Each row is a **hypothesis to falsify**, not a demonstrated outcome. An
adversarial fixture must prove the pre-expiry recheck actually passed,
record the completion SQL's later timestamp, and assert the committed
transaction's *combined* public/domain state. Do not use a mock that simply
forces `gone` without exercising the real PostgreSQL completion predicate.
If a fix moves expiry checking before effects, test an additional expiry
crossing during a slow domain write: the final guarded decision must still
produce a single coherent effect/status outcome. A change that only returns
`commandReplayResult(completed)` in more callers fixes response consistency,
**not** the underlying atomicity problem.

**Early-return reachability distinction:** the terminal-heal branch checks
`stateResult.httpStatus !== 200` *after* terminalization
(`application.ts:3486-3497`). The actual `stateFromClient` implementation
(`:862-905`) returns `ok(...)` on its normal paths and **throws**, rather
than returning an error response, on an unavailable active checkpoint.
`withTransaction` (`transaction.ts:12-42`) commits a normally returned
callback and rolls back a thrown exception. Therefore a committed partial
terminalization through that particular non-200 branch is **not shown
reachable in the inspected current code**; do not add it to the confirmed
v3 expiry-race matrix. Preserve the broader v4 design invariant: a future
refactor that makes `stateFromClient` return a non-200 value must not turn
this post-write early return into a commit without a terminal command
receipt. A targeted source/contract regression check suffices unless such
a return path becomes reachable.

The same reachability analysis applies to the post-terminalization
`stateFromClient` check in `application.ts:3311-3340` and the terminal
projection checks at `:3231-3247,3294-3305,3462-3480`.
`terminalStateForHunt` (`:839-860`) also returns `ok(...)` on its normal
path and throws on invalid terminal/recovery state; neither helper currently
provides an ordinary non-200 result at these call sites. Consequently,
do **not** multiply hypothetical partial-commit findings merely because
there are several syntactically similar `if (httpStatus !== 200) return`
branches. Instead, maintain one contract test that any future non-200
projection result after a domain write causes rollback rather than a
normal transaction commit. This does not weaken the independent, source-
supported *expiry-between-effects-and-completion* hypothesis above.

#### Clock-sampling split within one legacy command

The v3 repository has **three distinct temporal observation sites**, which
must be isolated in a deterministic regression fixture:

1. `ensureAndLockPlayerHuntRoot` acquires the Player row lock and then samples
   `clock_timestamp()` in a separate query
   (`hunt-orchestration-repository.ts:373-399`). The `transaction_timestamp()`
   projected in the preceding locked SELECT is **not** the `databaseNow`
   returned to the application; it is replaced by the later sample.
2. `claimPublicHuntCommandInTransaction` invokes that lock/sample path again
   and uses its returned `root.databaseNow` to expire an existing pending or
   terminal correlation (`:439-482`) or set a new key's `accepted_at` and
   30-/60-day deadlines (`:485-510`). The outer application may already hold
   the same Player lock; serialization does **not** make the two clock samples
   equal or monotone.
3. `completePublicHuntCommandInTransaction` takes another
   `clock_timestamp()` in its UPDATE (`:608-654`), independently deciding
   whether to store the caller's result or `gone`. A previous successful
   claim/recheck therefore does not reserve the remaining lease for a later
   effect-first completion.

The v4 transport contract must freeze the **specific winning decision's**
sample and predicate together, rather than treating Player-row locking as a
clock freeze. Test equal timestamps, a backward jump between sites (1)/(2),
and a forward jump between sites (2)/(3), in addition to normal passage of
time. Do not use `transaction_timestamp()` as a substitute for the
decision-point sample: a transaction can wait on the Player lock or other
prerequisites long after it began. Conversely, do not use the later
completion timestamp to retroactively move an earlier accepted command's
original lease. These distinctions are necessary regardless of the final
independent clock-health witness.

#### Clock-health distinguishability proof obligation

**Counterexample to a PostgreSQL-only forward-jump detector.** Consider two
executions with identical durable Player root, floor, command rows, and
PostgreSQL clock samples: prior sample `day 0`, next sample `day 40`.
In execution L the Player legitimately waits 40 days; in execution J the
Player waits one minute and PostgreSQL wall time jumps forward 40 days.
The Player floor, command sequence, row locks, SQL transaction timestamps,
and two raw UTC samples are identical to the transport decision procedure.
No deterministic rule using only those inputs can both allow the legitimate
day-40 expiry in L and reject the premature expiry in J. A fresh
`clock_timestamp()` or a PostgreSQL transaction/sequence identifier cannot
distinguish these executions. This is an **information limit**, not a missing
SQL index or retry loop.

Consequently, the Human Owner's selection of alternative A specifies
**monotone non-resurrection**, but cannot itself establish a 30-day
real-world lease under arbitrary forward clock faults. **H-02 now requires**
independent authenticated elapsed-time/UTC evidence with bounded uncertainty;
the *source, verification, freshness, availability and recovery contract*
are still Class-A gates. The residual forward-jump risk is not accepted as
the substitute design. An unverified second
wall clock, an unsigned external Date header, and a Worker-local monotonic
timer that resets between requests do **not** satisfy that proof obligation.
If a trustworthy witness is unavailable, do not label a fixed offset from
the Player floor as an anomaly detector: it would falsely reject the normal
40-day idle case or falsely accept the one-minute jump. Define the exact
versioned response and recovery procedure only after the trust model and
availability tradeoff have been accepted. No specific tolerance in seconds
or days is approved by this draft.

#### Guarded completion: exact SQL outcome versus application response

The existing completion helper (`hunt-orchestration-repository.ts:608-665`)
has two materially different outcomes: its `UPDATE ... WHERE
command_status = 'pending'` either updates **one** row, or updates **zero**
rows and then reads the pre-existing command. On the one-row path, its
`CASE` clauses derive *all* terminal/gone fields from the same SQL sample;
this is internally consistent for the command row, but says nothing about
the preceding domain effects in the transaction. On the zero-row path, the
returned record may have been terminalized or superseded by another
authority; the caller must not assume that its own proposed result won.

For a future v4 guarded writer, the draft's proposed proof obligations are:

1. **One winner:** require an exact command identity, Player identity,
   original version, pending status, frozen expiry and expected authority
   version in the winning predicate. The statement must expose its affected
   row count and the winning disposition; zero rows are not equivalent to
   successful completion. The caller must reload and classify the existing
   authenticated receipt or fail closed.
2. **One transaction:** the authoritative effect, any checkpoint/highwater
   movement, its first-crossing marker, the transport floor and the public
   completion disposition must commit together where the command owns those
   effects. A late `gone` disposition cannot commit alongside effects from
   that same invocation. The separately durable *previous* `202` segments
   and independent heal obligations are not rolled back retroactively.
3. **One response:** derive the immediate terminal response from the winning
   committed receipt, not a preconstructed `200`. If the transaction aborts,
   do not return a purported terminal success. A `202` remains a bounded
   continuation and does not renew the original pending lease.
4. **One expiry source per decision:** the final winning SQL predicate uses
   the decision-point transport sample and original frozen expiry. It must
   not silently extend a pending lease using the terminal result's new
   retention window; the latter begins only after a valid terminal win.

These are **design invariants**, not an executable SQL migration. A generic
`SECURITY DEFINER` function callable with arbitrary command IDs or arbitrary
JSON effects would not enforce them under the untrusted-normal-SQL threat
model. The allowed writer identity, MAC verification boundary, exact CAS
columns, privilege revocations and cross-version write paths remain
independent Class-A gates. A unit mock that returns `rowCount = 1` without
enforcing the database predicate cannot discharge this proof.

#### Legacy supersession: two-statement clock and healing exception

`supersedeOvertakenPublicHuntCommandsInTransaction`
(`hunt-orchestration-repository.ts:557-605`) first sweeps **all pending
commands for the advancement Hunt** whose original continuation deadline is
past a `clock_timestamp()` evaluated in its UPDATE (`:566-577`). This first
statement does **not** exclude `heal_item`. A second statement takes a
different clock sample, terminalizes still-pending commands as `409` only
when `target_logical_time_ms < committedLogicalTimeMs`, and **does** exclude
`heal_item` (`:578-605`). The returned count reports only the second UPDATE,
not the first expiry sweep. These are observable source-code distinctions,
not proof of a reproduced bug.

For the v4 coexistence review, keep three authorities separate:

- The **public healing correlation** may become `gone` after its original
  pending lease; the already accepted **domain healing obligation** is not
  thereby cancelled or superseded. Confirm that no caller treats the public
  `gone` as permission to discard the scheduled heal.
- The second UPDATE's strict `<` target comparison is not an equal-target
  supersession rule. A proposed first-crossing marker must preserve the
  actual eligible crossing predicate, its winning timestamp, and any
  command-kind exclusion; it cannot infer `409` from a later checkpoint
  head alone.
- The first UPDATE is a potentially multi-row expiry sweep, whereas the
  v4 exact-key `410` design requires an indexed, bounded decision. A
  legacy sweep must not mutate v4 rows, the authenticated Player time floor,
  or v4 crossing markers. Mixed-version migration must prove this with
  database privileges and a version predicate, not only an application
  dispatch convention.

Add adversarial cases with an expired `heal_item`, an equal-target pending
checkpoint, and a raw-clock regression between the two statements. Assert
both public command rows **and** the independent heal queue. Do not treat
the first sweep's unreported row count as zero, and do not retroactively
reclassify a pre-existing legacy command under v4 rules. This section is a
read-only compatibility finding; no v1–v3 behavior change is authorized.

#### Domain healing timestamp is not transport completion time

The current repository's scheduled-heal resolver
(`hunt-orchestration-repository.ts:1401-1416`) changes the independent
`hunt_healing_commands` row from `scheduled` to `applied`/`not_applied`, with
`resolved_at = transaction_timestamp()`. Terminal Hunt cancellation
(`:1418-1429`) also sets `resolved_at = transaction_timestamp()` for every
remaining scheduled heal. Neither statement samples the later transport
completion clock, and neither is conditioned on the public command's
`continuation_expires_at`. The public healing result is subsequently
completed separately (`application.ts:1977-1987,2043-2053`).

This produces two independent obligations in the v4 design:

1. Preserve the accepted **domain** heal's ordering, inventory debit and
   eventual `applied`/`not_applied` resolution even if its public key becomes
   `gone`; do not rerun a resolved heal merely because exact-key replay is
   `410`. Conversely, the current code's `resolved_at` is a transaction-start
   timestamp, **not evidence** that resolution happened before a later
   public-command expiry sample. Do not use it to prove a temporal race
   cannot occur.
2. Keep the **transport** correlation's result/expiry independent. If a
   domain heal resolves after the public pending lease has expired, the
   eventual public response may be `410` while the heal remains legitimately
   applied, provided the accepted healing obligation is independently
   authoritative. This case is **not** equivalent to an expired *new*
   manual-capture or policy-save invocation committing its own unaccepted
   effects. A naive universal assertion that `gone` implies *no domain
   effect ever* would contradict the accepted-heal separation already
   described in §13.5.

The healing fixture must therefore distinguish (a) a newly attempted
command-owned effect after an expired lease, which must not commit, from
(b) execution of a previously accepted scheduled heal, which may commit
under its own authority. Capture the healing row, inventory delta,
checkpoint, public command, and immediate/replayed HTTP response separately.
The proposed v4 guarded writer must not retroactively erase an independently
accepted heal to make the public correlation look atomic. Selected H-01 fixes
the *proposed* retreat-versus-heal ordering; its cross-spec amendment and
concurrent winning-transaction proof remain separate acceptance gates.

#### Terminalization versus scheduled healing — concrete source-order gate

The present terminalization paths have a stronger consequence than merely
returning a public `410`. In retreat, the application terminalizes the Hunt,
seals presentation and calls
`cancelScheduledHealingCommandsForHuntInTransaction` before completing the
retreat correlation (`application.ts:3380-3401`). The terminal-healing path
does the same (`application.ts:3486-3514`). The cancellation SQL updates
**every still-scheduled** healing row for the Hunt to `not_applied`, reason
`hunt_terminal` (`hunt-orchestration-repository.ts:1418-1429`). It is not
filtered by public-correlation status or acceptance sequence.

This qualifies the preceding statement that an accepted heal survives
**public-key expiry**: survival means the domain obligation remains eligible
for its own deterministic resolution; it does **not** assert that every
scheduled heal must eventually apply despite a legitimate Hunt
terminalization. In particular, a public `gone` must not *itself* cancel the
heal, whereas an independently authorized terminalization can resolve it
as `not_applied` under the game's ordering rules.

Under selected H-01, a structurally due heal at D<T must resolve before
the retreat seals T even if it was accepted later. At D=T, an earlier
accepted heal precedes retreat; a later-accepted heal is canceled by
the terminal fence. The current source proves only that the terminalization
transaction cancels any heal **still scheduled when it obtains the locks**;
it does not prove this global ordering when a healing resolution and
retreat race through separate transactions. The winning v4 guard must
verify the due-head and acceptance-sequence priority under the same
serialized transaction, not infer policy from whichever request acquires
the lock first. SPEC-013/SPEC-015 Class-A alignment remains pending.

Minimum negative fixtures: (i) heal due at boundary B, then retreat at B;
(ii) retreat at B, then an exact-key replay of the accepted heal; (iii)
heal resolution racing retreat on the same Player root; (iv) expired public
heal key with still-scheduled domain heal; (v) already resolved heal before
retreat. For each, assert terminal reason, `heal_status`, `result_reason`,
inventory debit/refund rules, checkpoint and presentation ordering, and
public command receipts. Verify the **selected H-01** priority rather than
letting lock order choose; the cross-spec amendment and SQL proof still
precede an accepted v4 contract. No numeric time tolerance is introduced.

#### Healing queue order: two selectors, one serialized recheck

The current repository does not use one universal healing selector.
`loadEarliestDueHealingCommand` orders already due rows by
`(due_logical_time_ms, acceptance_sequence)` and requires a non-null due
time (`hunt-orchestration-repository.ts:1352-1370`). By contrast,
`loadEarliestHealingAdvanceBlocker` includes **unclassified** submissions
with `submission_cutoff_logical_time_ms <= checkpoint` and classified due
submissions, ordering by the corresponding cutoff/due time followed by
`acceptance_sequence` (`:1373-1399`). Treating the due-only selector as the
entire queue could skip an earlier unclassified submission.

The application first observes a candidate outside the transaction, then
locks the Player root and Hunt, reselects the due row with `FOR UPDATE`,
checks its identity, due time and checkpoint boundary before resolving it
(`application.ts:1892-1897,1917-1945`). The classification path likewise
reselects the earliest blocker under locks and checks identity/phase before
classifying (`application.ts:2068-2129`). These rechecks limit stale-read
races, but do not establish a policy priority over a separately authorized
retreat that obtains the Player lock first.

For the Class-A ordering proof, use the **combined blocker order**, not only
the due-heal order. Negative fixtures must include two heals with equal
logical time and different acceptance sequences, an unclassified earlier
submission competing with a classified due heal, and a candidate that
changes between initial read and locked recheck. Assert that each invocation
performs bounded work and cannot advance a checkpoint past an unresolved
earlier blocker. Selected H-01 requires retreat to drain all eligible
earlier-structural-due blockers and the earlier-accepted same-T blockers;
the selector and lock-order proof remains open despite the Human choice.

## 14. Consolidated Class-A disposition and handoff — DRAFT only

This register distinguishes **selected Human directions** from **proofs
still owed**. It is a documentation handoff, not an approval, an amendment
to accepted SPEC-015, a migration plan authorized for execution, or a
production readiness verdict. Later reviewers should update these entries
in place rather than append further overlapping interpretations.

| Gate | Selected or source-grounded fact | Missing acceptance evidence / decision |
|---|---|---|
| Scope and adversary | Selective Solo Hunt and attributable effects; MVP model N; privileged coherent rewrite/backup rollback excluded (§§3.1, 9.1). H-05/H-06 select private-data least privilege. Existing **SPEC-017 presentation is account-only** despite `public` projection field names (§10.2); genuinely public cross-account access is not an accepted existing route. | Final runtime identities, actual grants, ownership, non-forgeable Player binding/equivalent principal isolation, and normal-credential adversarial denial for writer and reader; a future truly public presentation surface needs separate authorization. |
| Storage/performance | Strategy B compact versioned v4; indexed private proof; §12 logical-range B selected. | Finite codec/effect bounds and real PostgreSQL/Worker 0/100/1,000/10,000 measurements, WAL, MVCC/bloat, p95/p99 and safe failure budget. |
| Worker/SQL integrity | H-03 selects mandatory SQL-verifiable scoped Worker permission *before* spendable protected transitions, with historical MAC as complementary evidence. Current pending-command target/context and claim-effect helpers do not enforce one-time authenticated SQL freeze (§§14.3, 14.7). §14.9 provides a **non-executable** stage/final-apply proof candidate including selected-A **dual-original R/J** authorization and separate `t1` signed decision versus `t2` freshness veto. | Prove independent permission verification, protected signing key, no arbitrary `SECURITY DEFINER` invocation, role escalation, mutable frozen RNG/context, legacy bypass or unsigned consumable commit. **Joint H-02/H-03 gate:** reconcile the late exact-clock decision, pre-write authorization and atomic historical receipt even when a genuine capability is intercepted, a hidden FK/unique/trigger wait occurs, or an actual terminal presentation `statement_timestamp()` differs from staging (§§11.2, 13.3–13.4, 14.1, 14.9). |
| Shared-resource adoption | TASK-037 checkpoint and Inventory/Collection/XP writers currently have legacy direct paths (§13.4). | Mandatory database-enforced version barrier under each actual resource lock; prove both old-writer/adoption serial orders and preservation of v1–v3 behavior. |
| Encounter freeze and stage authority | Current v3 Encounter freeze uses `ON CONFLICT DO NOTHING`; automatic selection/result and stage helpers return no actual winning-row receipt, and the stage UPDATE does not require an expected predecessor (§14.8). Existing application locks/checks are not equivalent to a deployed H-03 SQL guard. | Original authenticated Encounter/RNG/policy source freeze, insert-or-match equality, legal predecessor-stage CAS with exact `RETURNING`, immutable capture result, reward-before-heal/next-Battle sequencing and adversarial ordinary-SQL direct invocation. |
| First rising highwater and `409` | Proposed signed contiguous first-crossing marker; ordinary command's own target-bound rise is not an eligible self-supersession. | Formal every-writer proof, exact frozen target/owner/source linkage, no ordinal gaps, missing-marker detection, same-H mutations and exact microsecond expiry ordering. |
| Transport time | Human selected Player monotone floor alternative A **and H-02 independent authenticated time witness**; gameplay cutoff remains SPEC-015 raw/clamped. | Specify trustworthy witness, uncertainty, availability, recovery, SQL clock codec and legacy-key dispatch; residual premature expiry is **not** silently accepted. |
| Completion/expiry atomicity | Existing v3 completion independently samples time and may return `gone` after command-owned effects were staged (§13.5); the advancement bulk sweep also includes its own command when expiry is crossed (§14.6). H-04 selects conditional isolated legacy correction. | Real PostgreSQL boundary fixtures for terminal completion **and internal 204/outer 202 continuation**; propose legacy correction only if reproduced and separately authorized. Prove v4 final guarded disposition/rollback with verified winning row and no new command-owned effect alongside an expired key. |
| Domain healing and retreat | H-01 selects structural due-before-retreat resolution even for later acceptance at D<T; equal-T heal priority still uses **explicit retreat's** sequence fence. **A is the Human-selected H-01/K progress direction:** another eligible same-Hunt command may help finish the still-valid original R; no implicit K cancellation or invented highwater crossing. Automatic `no_living` has its own accepted terminal rules, not R's fabricated sequence (§13.1). Accepted scheduled heal survives *public-key* expiry; terminalization can cancel still-scheduled heals as `not_applied`. | Normative SPEC-013/SPEC-015 Class-A alignment, a **global same-T R fence on every heal/advance writer** (including H13's own continuation), independently proven **A cross-key helper authority, dual leases, R/H/K result separation and a bounded immutable deferred-result state at terminal convergence** (§14.1), bounded ordering without indefinite `202`, automatic-terminal cases, acceptance between speculative blocker read and checkpoint persistence, and zero-row resolution versus actual HP/Inventory effects. **A is selected as direction, not accepted as executable SQL or gameplay contract.** |
| Public proof/retention | Original key identity, signed page membership, 30/60-day pending/result horizons and exact-key replay are proposed. | Bounded original-key retention through later crossing tombstone, cursor continuity, privacy, source ABI and 404/409/410/503 proof under actual permissions. |

**Minimum integrated adversarial run, once separately authorized:** on an
isolated migrated PostgreSQL 17 database with the exact proposed normal
writer and reader credentials, generate 10,000 pending heals and 10,000
pending public correlations for one v4 Hunt. Verify that one boundary
advancement, one terminalization and one first-crossing decision each
perform a bounded number of indexed candidate/marker reads and affected
rows; independently measure physical pages, WAL, elapsed time and lock
waits. Then replay exact keys at E-1 microsecond/E, force rollback and
clock regression, inject a missing earliest marker and a malformed row
hidden behind a valid index head, attempt forged direct SQL effects, and
race an old resource writer with v4 adoption. Check public/domain rows,
Inventory/Collection/XP, checkpoint, signed head, original receipt and
presentation together; a public `200` with any unauthenticated effect is
a failing outcome. Include the separate already-accepted-heal/expired-
public-key case, for which a valid domain effect and `410` can coexist.

**Exit criterion:** independent architecture/security QA, explicit
SPEC-013/SPEC-015 Class-A reconciliation of selected H-01, completion of
detailed H-02/H-03/H-05/H-06 mechanisms and the conditional H-04 gate,
authorized forward-only migration,
actual DB privilege and concurrency evidence, workload thresholds, and
separate implementation authorization. Until then: **SPEC-019 DRAFT;
v4 NOT TECH READY; no migration, runtime activation, or history write
authorized by this document.**

### 14.1 Human decision docket — selected directions, acceptance evidence outstanding

**Decision record (Human Owner, 2026-09-30):** the Owner instructed that
the six previously recommended directions H-01–H-06 be followed, and later
selected **A — cross-command completion of the original retreat** to resolve
the abandoned-R/H/K conflict. This is approval of the **design directions
described below within SPEC-019's DRAFT**, not
Class-A acceptance of the final SQL/clock/gameplay contract, permission to
edit the accepted SPEC-013/SPEC-015, authorization for a migration, or
permission to deploy. Do not relabel an unexecuted negative fixture PASS.

| Decision | Human-selected direction | Remaining evidence / boundary |
|---|---|---|
| **H-01 + A — selected directions, healing model must be revised** | Preserve genuine structural effects before retreat and the possibility of a separately authorized command helping finalize the original R. The former example with H11/H13 **publicly accepted manual Poções** describes the accepted legacy/manual contract only, since the Owner later selected exclusive automatic PvE Potion use. | Reconcile SPEC-013 §4/§5.6/§6.1 and SPEC-015 §2/§3/§4.3.1/§9.2 against the new Human decision. Automatic heal decisions require authentic engine/policy ordering and durable source identity, not a fictitious public Item key or H13 acceptance rank. Reassess whether the formerly identified R/H/K circular wait still exists; keep R/K original-key protections and selected direction A, but do not automatically transfer the obsolete manual-heal protocol to new Hunts. |
| **H-02 — selected** | Require an **independent authenticated elapsed-time/UTC witness** to detect material forward PostgreSQL clock jumps, alongside the already selected authenticated Player monotone transport floor. Fail closed for materially uncertain irreversible expiry. | Choose trustworthy source/issuer, signed sample/verification, uncertainty, availability, thresholds, recovery and user-visible error contract; prove lease semantics on long idle and mixed v1–v4. No arbitrary numeric threshold is approved. |
| **H-03 — selected** | Require **database-enforced scoped Worker authorization before each protected spendable write**; retain MAC proof for immutable historical verification. Reader-only eventual validation is not an adequate alternative. | Define verifiable capability/MAC key separation, single-use/replay/nonce semantics, DB guards, exact winning `RETURNING`, grant revocations, safe legacy compatibility and cross-resource adoption; prove stolen SQL role cannot commit a consumable forged effect. |
| **H-04 — conditional direction selected** | Reproduce the potential v3 expired-command/effect divergence in real PostgreSQL first; **if confirmed**, prepare a separately scoped backward-compatible correction rather than using v4 migration as a workaround. | Actual repro and regression matrix, affected paths, correctness/rollback design and **separate explicit change authorization**. Not a confirmed incident, nor blanket authorization to edit legacy code. |
| **H-05 — selected** | Do **not** accept blanket cross-Player private-data reads using a compromised normal writer. Require least-privilege SQL and a non-caller-forgeable Player/private-data isolation boundary (or equivalently isolated principals). | Prove how trusted Worker operations access correct private data without giving the stolen shared credential cross-tenant SELECT; measure role routing, privileges and adversarial reads. MAC integrity alone is not confidentiality. |
| **H-06 — selected** | Classify **genuinely public** presentation separately from **account-only** presentation. The currently accepted SPEC-017 `/player/hunts/:huntId/presentation` feed is **account-only** (session + ownership + private/no-store), even though its fields are privacy-projected and named `public`; it is not authorized for cross-account SQL reads. | Non-forgeable Player binding/isolated DB reader for the existing feed, tested with stolen shared reader credentials; public-field-only projection, verified direct SQL grant closure and no private proof columns. A new genuinely public cross-account feed would require separate product/security approval, not an inference from SPEC-017's name. |

**Resumo para o Human Owner — direção de cura já escolhida; detalhes
ainda sujeitos à proposta e à revisão.** Em Hunts e demais conteúdos
PvE que **explicitamente habilitarem** Poções de cura, o sistema
decidirá automaticamente seu uso a partir de uma condição de
**percentual de HP**. O jogador **não** enviará um comando de usar
Poção. Conteúdo sem essa mecânica habilitada não a executa.

| Ponto | Definição humana existente | Trabalho que ainda precisa de proposta/revisão |
|---|---|---|
| **Acionamento** | Exclusivamente automático, baseado em porcentagem de HP. | Qual Pokémon/HP é observado, como se configura o percentual, qual item é escolhido e se a automação pode ser configurada/desabilitada pelo jogador; nenhum valor numérico foi definido. |
| **Conteúdo** | Somente conteúdos PvE selecionados (Hunt é exemplo). | Identificar explicitamente cada tipo habilitado, fixar versão de política/regras na Hunt e negar consumo automático fora da lista; não pressupor habilitação em todo PvE ou em PvP. |
| **Momento do uso** | Ainda não determinado pelo Owner. | Definir se a verificação/efeito ocorre **durante Battle** ou somente numa fase segura **entre Battles**. A atual SPEC-013 aceita apenas item manual entre Battles; não presumir que a regra antiga responde a uma Poção automática disparada quando o HP cai durante combate. |
| **Retirada concorrente** | A direção A permite a outra ação autorizada concluir a retirada original; recompensas e curas devem respeitar a ordem real. | Reavaliar a ordem da **decisão automática interna** e da retirada, incluindo baixa de Inventory, KO e resposta de checkpoint/claim. O exemplo manual H11/H13 não determina o empate da nova automação. |
| **Ação que ajuda a concluir a retirada** | O conceito de auxílio continua selecionado; tipos concretos não. | `checkpoint` e `claim` permanecem candidatos, sujeitos à origem/validade próprias. **Uma Poção automática não é um comando auxiliar público.** Examinar novamente se existe bloqueio de progresso sem o antigo item manual e qual regra de resposta é necessária. |
| **Prazo da requisição** | Nenhuma alternativa temporal final escolhida. | Avaliar decisão protegida antes do prazo versus confirmação durável antes do prazo. Não criar expiração pública de uma Poção que não possui comando público. |

**Exemplo ilustrativo, sem percentual de ativação aprovado:** se
um Pokémon elegível atingir o limite configurado numa Hunt habilitada
e existir uma Poção válida no Inventory, a engine pode candidatar
uma cura automática no instante/fase que **ainda será aprovado**.
O efeito, o consumo e a justificativa devem persistir exatamente
uma vez e ser recuperáveis após queda do serviço. Se ocorrer retirada
na mesma fronteira, a prioridade exata depende da futura regra de
ordem; não gastar o item por uma cura cancelada. Nada disso
autoriza reviver KO, criar Potion ou adiantar Battle fictício.

**Momento da validação humana:** a regra de produto acima já está
definida. O próximo pacote de aprovação deverá trazer a ordem de
avaliação da Poção, o tratamento de retirada e a configuração de
HP em exemplos de jogo, com consulta GSC e PXE quando a escassez/
consumo de itens for materialmente alterada. QA/arquitetura/segurança
independentes revisam o mesmo contrato antes da emenda aceita.
Implementação, banco e HTTP exigem autorização posterior; o Owner
volta a validar o resultado e o merge após testes.

**Review discipline:** implement none of the above by this decision record
alone. Translate H-01 into a reviewed normative cross-spec amendment;
complete and independently review the mechanisms and proof obligations for
H-02/H-03/H-05/H-06; run the H-04 legacy reproduction before proposing a
legacy patch. The selected decisions remove the six *policy choices* from
the open docket, **not** their Class-A engineering/verification gates.

**Superseding scope gate for healing — Human decision 2026-10-01.**
The accepted SPEC-013 §4 items 8, §5.6 and §6.1, and SPEC-015
§§2–3, 4.3, 4.3.1 and 9.2 currently specify explicitly submitted
healing Items, including `POST /player/hunts/:huntId/items/use`.
They expressly exclude automatic Potion use. The Human Owner now
defines the opposite **future product rule**: healing Potions are
**never manually activated**, are evaluated automatically using an
HP-percentage condition and are available only in explicitly enabled
PvE content (Hunts are one example). This is a new **Class-A gameplay
and public-command amendment**, not an instruction to quietly remove
an existing route from running code, mutate old replay bytes or
rewrite accepted documents before review.

The original H-01/A examples and A01–A14 fixture plan below were
authored for a **different manually submitted healing contract**.
Treat every reference to an H11/H13 `items/use` public key,
accepted Item-command sequence, 30-day Item-command lease, its own
`200/202/410`, or H13 helping R as a **LEGACY-MODEL EXAMPLE**.
They may inform negative legacy-compatibility checks, but are
**not accepted or executable conformance for the new auto-heal
product rule**. Its internal heal must instead derive from authentic
server-side pinned rules/HP at the approved deterministic gameplay
phase, with a stable per-occurrence source identity, exactly-once
inventory debit/effect/receipt, and authenticated replay. A manual
HTTP heal key must not be fabricated as the cause of that event.
Retreat R and an eligible external checkpoint/claim J still have
their own independently frozen identities and leases. The old
same-T `heal-command acceptance sequence versus R` tie-break is
**undecided for automatic events**, because an automatic heal has
no separate Player-accepted Item request; it must be specified
from actual phase/event ordering with GSC review.

**Required cross-spec product questions before replacing the old
healing text:** (i) which PvE modes expressly enable auto-use and
whether the policy is pinned at Hunt start; (ii) HP denominator,
selected target and exact threshold comparison; (iii) evaluation
in Battle versus only between Battles, including zero-gap,
DoT/KO, incoming reward/capture and an already requested retreat;
(iv) priority/selection of Potion kinds, item reserve,
shortage, no-revival and duplicate-triggers on restart; (v) whether
the percentage is content-fixed or user-configured, its authorized
version/source and how changes affect an active Hunt; (vi) atomic
consumption under concurrency and exact immutable replay; (vii)
how to retire or version-gate the presently approved manual
`items/use` contract while preserving all previously accepted
keys, frozen commands, effects and source histories. No percentages,
item priority, cooldowns, new HTTP endpoints or PvP behavior are
selected by this entry.

**H-01/A cross-spec amendment submission map — legacy manual-heal
working text, now REQUIRES REBASE, NOT accepted for auto-heal:**
the following is one review unit, not four independently deployable rule
changes. Keep the currently approved SPEC-013/SPEC-015 files unchanged until
their separate Class-A acceptance; the detailed language and
counterexamples below document the previous manual-heal candidate
only, **not** the new automatic-heal source of truth. No v4
dispatch may activate the old healing candidate by default; a
separately accepted version-gated rule is required. v1/v2/v3
Hunts, including retained 202/replay histories, preserve their approved
legacy execution and public outcomes unless a separately approved
legacy correction explicitly changes them.

| Approved document/target | Exact subject of proposed amendment | Normative boundary preserved |
|---|---|---|
| SPEC-013 §6.1 item 4 | Replace the `accepted before stop` restriction with structural due-before-T priority irrespective of acceptance sequence; at exactly T use R's original acceptance sequence. The replacement wording follows immediately below. | Combat/cadence/reward/capture first, no fabricated Battle completion, no retroactive reversal of a committed effect and original recovery/no-free-reroll rules. |
| SPEC-015 §9.2, after equal-boundary item/retreat rule | Require the original unclassified U and effective classified I/B due heads and any applicable original pending-R fence under one winning Player/Hunt serialization boundary, on **every** healer/advancer path. The detailed wording follows below. | One due heal per invocation; accepted scheduled heal survives *public* key expiry; eligible later same-T heal is canceled only by an authentic R/terminal winner and has zero debit. |
| SPEC-015 §4.3.1 | Admit a separately authorized, same-source-Hunt, still-executable assisting command J to make bounded progress on the **original** pending retreat R, retaining **two** frozen intents, identities and leases. The selected-A proposed addition appears below. | J does not inherit R's key/result, cannot refreeze its own target or bypass an actual first `>T` crossing, and does not itself become an implicit cancel-retreat route. |
| SPEC-015 §8 and §4.3 response-snapshot invariant | Clarify who owns the terminal disposition when a valid J helps R and the immutable terminal-boundary snapshot used for J's **later** own response. A focused proposed §8 addition appears below; §4.3's current command-result semantics remain unchanged. | R's terminal reason/recovery are from the **original logical terminal**, including genuine earlier `no_living`; J's claim delta and any surviving manual capture/policy state are not reassigned. |

**Pre-acceptance decisions that this map does not silently settle:** the
precise allowed J command kinds (including policy/manual-capture preludes),
independently authenticated H-02 final decision time versus late durable
`COMMIT` (§14.13), the executable H-03 two-original pre-write guard,
one indexed applicable-R/U/I/B selector and its physical-work bounds, the
bounded original terminal-convergence state receipt for deferred J responses,
and the possible change in K's opportunity to supersede R. Require explicit
SPEC-013/SPEC-015 reconciliation and independent gameplay/architecture and
security review on these points; do not make v4 READY from the map alone.
The separately selected §12 *logical-range B* replacement of SPEC-015's
physical mass terminal-update obligation also needs **its own Class-A
approval**: acceptance of H-01/A ordering cannot implicitly approve a
new storage write contract.

**H-01 — concrete proposed cross-spec wording for separate Class-A review
(NOT an amendment to either accepted file):** replace the narrow eligibility
sentence in `SPEC-013 §6.1 item 4` with the following proposed rule:

> While a retreat remains in bounded continuation, a valid healing command
> accepted before **or after** retreat acceptance participates in the
> authoritative structural timeline. If its original, independently frozen
> effective due boundary is **strictly earlier** than the retreat's frozen
> stop boundary, its classification and eligible effect must resolve in
> canonical order before retreat terminalization, regardless of which
> command was accepted first. For an effective due boundary **equal** to the
> retreat stop boundary, resolve eligible healing accepted before the
> retreat in original acceptance order, then perform retreat terminalization;
> healing accepted after retreat at that same boundary is terminal-canceled
> without Inventory debit. A heal whose actual structural due boundary is
> later than the terminal boundary, or whose Battle remains unfinished and
> therefore has no authentic due boundary by terminalization, does **not**
> receive a fabricated earlier due time. It is terminal-canceled with no
> debit. The already committed effect of a separately advancing command is
> never undone to reorder retreat.

Add the following **proposed clarification** after `SPEC-015 §9.2`'s
equal-boundary retreat rule (current accepted lines 983–992):

> Every Hunt advancer, including a pending retreat, rechecks the effective
> earliest unclassified submission cutoff and classified/marker-derived
> healing due head in the winning serialized transaction before passing a
> structural boundary or sealing the Hunt. Classify any accepted unclassified
> submission cutoff strictly before the retreat target, **and at the target
> itself when its acceptance sequence precedes the retreat**; classification is
> **not** proof that its Battle completion is already due. Resolve actual
> due boundaries strictly before that target irrespective of retreat's
> acceptance sequence. At the exact retreat target, the frozen acceptance
> sequence is the tie-break; earlier-accepted due heals resolve first and
> later-accepted due heals are closed by the single terminal disposition.
> No committed checkpoint may skip an overdue structural blocker, and no
> terminal range marker may cancel one merely because its command was
> accepted after retreat. A pending heal for a still-incomplete Battle has
> no synthetic due marker and follows terminal-cancellation semantics.
>
> The same-target acceptance fence is authoritative across **all** command
> paths, including an item command's own continuation, not solely when
> retrying retreat. Under the Player serialization lock, before a heal
> consumes an item or changes HP at T, resolve the authenticated existence,
> original target and acceptance position of any earlier still-executable
> retreat at T. A later-accepted heal at T cannot win ahead of that retreat
> merely by obtaining the Player lock first; one accepted strictly earlier
> structural due time remains eligible. A different advancing command may
> displace retreat only through a separately authorized committed disposition
> that preserves the no-skipped-due, one-heal-per-invocation and exact-key
> results. Where such a disposition cannot be proven without a circular wait,
> reject or defer the candidate without applying the later heal. An expired
> or superseded retreat is not itself an effective Hunt terminal marker.

These are **proposed text**, not a claim that `SPEC-013` or `SPEC-015` has
changed. Verify their wording against automatic no-living terminalization,
same-boundary Encounter reward/capture priority, one-heal-per-invocation,
`202` continuation and the accepted **separate** post-boundary Inventory
authority before independent cross-spec approval. H-01 is selected, but
only the separately reviewed accepted-file amendment can make this wording
normative. The global pending-retreat selector, authenticated expiration
versus supersession outcome, bounded progress under an abandoned R and all
competing K advance paths remain an additional Class-A proof gate; an
application-only R-local acceptance filter cannot discharge it.

**Reachability gate for later-accepted D<T_R (proposed fixture discipline):**
the selected H-01 ordering remains a conditional invariant for every
authentic accepted history, but do not assume A01's later-accepted H13
with `C500 <= D550 < R12/T600` can arise through the normal v4
first-acceptance path. SPEC-015 §4.3 derives both frozen cutoffs from
serialized server receipt time, and §9.2 makes structural due time no
earlier than the healing submission cutoff. If the H-02 Player transport
floor proves non-regression across those acceptances, a **later**
acceptance cannot normally freeze an **earlier** C or D than R's T.
Before calling that A01 branch a positive conformance test, construct
an end-to-end authorized acceptance/reconciliation schedule and show
the original clock/floor, checkpoint anchor, C and genuine D; otherwise
test it as an adversarial impossible-history/integrity rejection and
use a real earlier-accepted D<T_R heal for the positive prior-boundary
order. An equal-logical-millisecond later acceptance at D=T_R can still
be a valid separate tie-order test. This reachability inquiry cannot
weaken H-01 or turn a forged historical row into an authentic heal.

**H-01/K progress conflict — a Class-A semantic decision, not an index fix.**
Consider a committed inter-Battle checkpoint at T600, accepted pending retreat
R12 with frozen T600 and sequence 12, later accepted heal H13 effectively due
at 600, and independently accepted checkpoint/claim K with target 601. The
following three constraints cannot all make forward progress **if only a
delivery of R's own key is allowed to finalize R** and that client disappears:

1. The selected global H-01 same-T guard forbids point-applying H13 before
   the still-executable, earlier-accepted R12 has a legal disposition.
2. Accepted SPEC-015 §4.3.1/§9.2 forbids K advancing beyond 600 while H13
   is due at 600, and an invocation which resolves one due heal cannot also
   advance past that boundary.
3. Accepted SPEC-015 §4.3.1's eager `409 command_superseded` for R12
   requires an **actually committed** checkpoint strictly greater than 600;
   K's frozen intention to reach 601 is not such a crossing. No existing
   `202`, lock, signed first-rise marker or H-03 staged capability can
   truthfully manufacture one. R's original 30-day continuation expiry may
   eventually remove executability, subject to H-02, but waiting for that
   expiry is not a proven bounded-progress remedy.

**Selected direction A — bounded cross-command completion of an already
accepted retreat (Human-selected design direction; NOT Class-A accepted or
executable):** while holding
the original authenticated Player/Hunt authority, an independently executing
eligible command whose invocation reaches R's exact T may *help finish* R
from its immutable correlation
after all preceding D<T and earlier-accepted D=T healing obligations are
drained, applying at most one point-heal per invocation. It then atomically
commits **R's** terminal Hunt/recovery/presentation/domain-cancellation and
original replay result; the assisting H13 returns its independent terminal
`not_applied / hunt_terminal` result when its own transport key remains
supported, while K reconciles against the now-terminal Hunt under
SPEC-015 §4.3.1. If an earlier heal was processed in this invocation,
ordinary `202` continuation remains necessary before completing later work.
The helper must verify R's original Player/Hunt/key/target/acceptance,
pending lease, absence of a genuine previous R result/supersession, frozen
source and current phase, canonical same-T ordering, and the H-02/H-03
decision authority. **The assisting command's own previously accepted
correlation, normalized intent, frozen advancement identity, pending
status and original lease are a second independent admission gate**:
a still-valid R does not allow an expired or terminal H/K correlation to
initiate another R-help effect. It cannot silently renew R's lease or
terminalize after
R's original pending expiry, bypass a prior automatic `no_living` seal, or
invent a new recovery anchor. Since K no longer crosses R's target in this
trace, **this changes the apparent opportunity for an independent K to
supersede R**; the selected A direction must therefore be reconciled with
SPEC-013/SPEC-015 via an explicit accepted Class-A amendment and proof that
eligible existing concurrent K behavior is preserved where required. A
merely attempted helper or an incomplete R prelude does not make the Hunt
terminal. **A helper is not a retreat-cancel command:** checkpoint/claim
and item-use submission cannot silently rescind the original valid R;
any future voluntary cancel-retreat capability is a separate product/API
decision, not approved or added to the current endpoint set.

**Selected A admission/response sketch — still non-executable, not finally accepted:**

1. **Who may help.** Only a separately authorized mutation for the *same*
   authenticated Player whose frozen **advancement Hunt** equals R's source
   Hunt may request a bounded R-help step. For a manual-capture prelude,
   `captureSourceHuntId` may name a *different*, prior terminal Hunt and
   must never be substituted for this advancement identity. Each helper
   command kind's eligibility still requires explicit Class-A selection
   within the approved cross-spec protocol; the overall choice of A is **not**
   an authorization for every mutation route to help R.
   Its own accepted correlation and original intent remain independent of
   R's immutable correlation. An account-only GET, foreign Hunt, expired
   or unbound helper key, Worker-local timer or caller-supplied `commandId`
   does not authorize arbitrary completion. An independently accepted heal
   whose public key expired remains a domain obligation; replaying that *expired*
   key cannot itself mint a new R consequence. A legitimate new advancing
   command may still service the domain queue under its own authority.
2. **Choose the real R.** Under the Player/Hunt lock, authenticate a bounded
   indexed lookup for the *first applicable* still-pending, unexpired R and
   freeze its original `(playerId,sourceHuntId,commandId,kind,intentHash,
   acceptanceSequence,target,checkpointIdentity,continuationExpiresAt)`.
   Check a previously committed R result, genuine eligible `409` crossing,
   original pending expiry and H-02 clock witness **before** authorizing the
   helper. Neither a newer R, an unrelated Hunt, nor a repaired/forged
   `202` receipt may replace the original R. If R is already gone or
   superseded, no R-help terminalization occurs; return to the ordinary
   surviving domain/transport order without resurrecting R.
3. **Reach the exact boundary without retroactive healing.** A helper below
   R's T may advance only one accepted safe segment and persist `202` under
   its *own* command identity; it may not finish R early. Every unclassified
   cutoff C<T and actually due heal D<T must be classified or resolved at
   its **original** structural boundary in a preceding bounded segment,
   before any persisted highwater crosses that time. At committed H=T,
   encountering an unresolved U cutoff C<T or authenticated I/B due D<T
   is an **integrity violation requiring fail-closed recovery**, not
   permission to relabel it as due at T or debit a Potion retroactively.
   At valid H=T, reconcile the genuine Battle/combat/Encounter/capture/
   reward/replacement stage and recheck the effective U/I/B queue under
   the winning lock. Only an eligible still-unclassified C=T with sequence
   <R's sequence may be classified at the original T phase; an already
   eligible earlier-accepted same-T due heal may resolve, at most one
   point-heal per invocation. Do **not** process a later-accepted H13 at
   T600 or initialize a zero-gap Battle. For the **proposed cross-command
   helper J**, this sketch stops at T after servicing a same-T preceding
   blocker and lets a later invocation reconsider R. This is **not** an
   assertion that accepted SPEC-015 §4.3.1 always requires an extra `202`
   from **R's own** invocation: at R's exact target, that accepted contract
   may permit same-boundary finalization after one due heal if no earlier/equal
   eligible heal remains and all terminal guards pass. Whether a newly
   accepted J helper may share that same-invocation finalization must be
   resolved explicitly in the Class-A amendment rather than silently
   imposing a stronger protocol. This step
   must not alter the receipt/body/claim aggregate of the *assisting* key by
   borrowing R's terminal state before R actually commits.
4. **One terminal winner.** Once no preceding structural blocker remains,
   a separately scoped H-03 permission for **helping the exact R** must be
   independently verified by PostgreSQL at the spendable write boundary.
   The permission binds the *two original command identities/intents*,
   Player, R's source Hunt and frozen T, helper advancement Hunt, expected
   winning live-head/version and bounded operation; it is not inferred from
   mere possession of the helper's ordinary SQL role, its distinct
   Idempotency-Key, or an interceptable old capability. At the **final**
   serialized
   decision, revalidate **both** R's original pending lease and the
   assisting command's separate executable pending lease using the exact
   H-02-authenticated late decision time, as well as the original R
   target/source/acceptance, frozen helper advancement Hunt, and a
   still-active Hunt at precisely the legal stop phase. In a single atomic
   guarded
   transaction, win the immutable R command result, original retreat
   terminalization and recovery anchor, private proof/live head,
   presentation seal and logical `terminal_cancel` (with zero new Potion
   debits for the later same-T suffix). Compare exact returned row counts and
   original/canonical bytes. If **either** original pending lease E was
   crossed during prerequisite work, or either row/clock/head changed,
   **abort every tentative new effect from this helper invocation**, reload
   the authentic winner and never create a post-expiry R `200`. Previous
   committed `202` segments or independent
   accepted heal-domain effects are not rolled back. Late `410` belongs to
   R's existing-key expiry rules, not to a newly fabricated terminal seal.
5. **Keep each caller's result separate.** R's result is a single original
   `200` retreat snapshot/recovery anchor under R's own correlation, with
   terminal-result/tombstone retention measured from **R's actual winning
   completion decision**, not original acceptance or H/K's time; it is not a
   public result under H13's or K's key. Once the R terminal commit is
   durable, H13's scheduled domain disposition follows the terminal marker:
   a supported H13 correlation may freeze its own route-specific `200`
   `not_applied / hunt_terminal` result with zero debit; an expired H13 key
   retains `410` and its prior accepted domain record. K's checkpoint/claim
   subsequently converges on the already-terminal Hunt at T while retaining
   K's own frozen target, accumulated claim-only deltas, replay lifetime and
   terminal snapshot. Policy-save and manual-capture preludes, if admitted
   as helpers, must independently preserve SPEC-015's next-Hunt policy and
   original pending-capture source semantics; **do not** interpret an R-help
   commit as completing their own command-owned effects. The safest
   prospective default is to commit only R in the helper transaction and
   resume the assisting key by a separate bounded continuation. Combining
   helper and assisting command terminal completions requires separately
   proven authority, exact results, bounded work and joint expiry guards;
   returning R's `200` as H13's or K's result is invalid.
   **Deferred helper-result snapshot gate:** SPEC-015 §4.3 lines 214–217
   requires each embedded mutation `state` to represent the immutable
   command-result boundary, **not** a later GET. Once J has validly helped
   R terminalize at T, J's later own terminal response must use the
   authentic **terminal-convergence state at T** and J's own accumulated
   effects, not current Player-wide mutable state at the later J reply.
   This applies even when another manual attempt/skip consumes the retained
   pending capture, Inventory changes, ball authority is updated, or a new
   Hunt C starts **between** R's winning commit and J's first supported
   `200`. A candidate design may seal one **bounded shared terminal-boundary
   state receipt** with R's valid terminal commit (including exact pending
   manual identity, versioned capture/Inventory options and pinned policy/
   ball-authority source where these are included in state) or demonstrate
   an independently authenticated, indexed as-of-T reconstruction with
   equivalent bytes. Neither option may write one per-key snapshot for
   every pending K/H correlation or scan all previous Hunt history.
   Freeze/reconstruct this receipt under the original Player/Hunt authority
   and authenticate its source digest before issuing J's own response;
   an H-03 R-only permission must bind any new shared receipt/proof emitted
   in its transaction. An old J key which expires before its own result
   still returns its original `410`, without modifying R's stored T state.
   Existing §12's canceled-heal state-snapshot gate applies here as well,
   but does **not** itself prove checkpoint/claim K's deferred result.
6. **No silent priority change.** Test K accepted **before** versus **after**
   R, genuine earlier K rising beyond T before the helper takes the lock,
   a K that reaches T but loses final R-help OCC, multiple pending retreats,
   K abandonment and R exact-key retry after another command helped it.
   Selected A may take away the opportunity for K to produce a later
   genuine >T supersession, even when K was accepted earlier; this is a
   visible semantic tradeoff requiring separate final Class-A acceptance,
   **not** an implication of the accepted `202` replay or accepted H-01 itself.

**Eligible-helper scope: superseded manual-heal candidate; narrower
auto-heal review candidate, NOT a selected allowlist.**
The Human-selected *direction A* does not itself identify which public
commands may act as J. For a first independently testable v4 amendment,
only `checkpoint` and `claim` remain candidates for new auto-heal
Hunts; the previous `items/use` candidate is **withdrawn** because
there is no manual Potion command or independently executable public
healing key. The table below preserves prior legacy reasoning while
limiting additional command-owned
side effects during R-only terminalization. The table states predicates
to propose for review, **not current API behavior or implementation
authorization**; an H-03 SQL permission must bind the exact approved kind
and original J identity, not accept any `kind` string supplied by an
application caller.

| Existing J route/kind | Candidate participation in an original R-only helper step | Independent result after R terminalizes |
|---|---|---|
| **checkpoint** | Candidate **include** only if its already-frozen `advancementHuntId=R.sourceHuntId`, `T_K>=T_R`, original correlation still pending/unexpired, and its actual stage can legally reach T_R. Never enlarge `T_K` or synthesize `K>T_R`. | Its own `200` terminal-Hunt state is the authenticated as-of-T_R command-result snapshot, or its prior authentic `409`/original expiry `410` wins. No claim delta is borrowed. |
| **claim** | Candidate **include** under the same pinned Hunt, target and lease criteria; all P accumulated by K's earlier committed `202` segments remains K-owned. | Its own `200` includes only K's original accumulated, bounded `effects=P` plus authenticated terminal-convergence state; a prior genuine supersession preserves K's own `409` and does not transfer P. |
| **items/use (healing H)** | **Exclude for future auto-heal rules.** The old separately accepted manual Item-key / structural due / public lease model remains a legacy compatibility concern only; automatic Potion triggers are engine/policy-derived consequences of a lawful advancing command, not another user command that can assist R. | Do not assign an automatic Potion a fabricated public Idempotency-Key, HTTP `200/202/410` result, acceptance rank or R-helper authority. Legacy original keys still require their separately approved historical treatment. |
| **policy replacement with advancement prelude** | Candidate **defer**, not an implicit helper: original `expectedRowVersion`, accepted Ball authority, version/policy context and possible subsequent next-Hunt activation create a second consequence distinct from R. Independently test the existing `effectiveAt=null`, stale `409` and no-retroactivity rules before including. | After a separately approved helper, original policy-save key must still independently activate or return its own documented result; R's terminal permission cannot write the new policy. |
| **manual capture attempt/skip with advancement prelude** | Candidate **defer**, not an implicit helper: its `captureSourceHuntId` can be a *different terminal Hunt* from `advancementHuntId=R.sourceHuntId`. Preserve the frozen capture source, pending decision, RNG/selected Ball and final Inventory check before separately approving this route. | After a separately approved helper, its own final attempt/skip may still operate on the original retained pending capture with its original RNG; R-only authority may not consume that Ball, close the decision or adopt a newer Hunt. |
| **a second retreat R2; start; account-only GET; unbound/expired or foreign action** | Candidate **exclude** from initiating R-help. A second R has its **own** target, acceptance rank, terminal/supersession result and may require independent canonical earliest-R handling; Start cannot rebind an existing active Hunt and GET is never mutation authority. An expired public heal may still be served under a **different** legitimate J, not under its expired key. | No synthetic terminal result for an excluded J. A supported R2 independently converges on authentic terminal/crossing, while START/GET follow their existing separate behavior. |

**Human acceptance question left explicit:** the revised proposed
first auto-heal Hunt allowlist is **checkpoint + claim** only; the
Owner has not selected that exact list. Keep policy/manual-capture/
second-retreat helper participation deferred until separate proof.
The original H13-only abandoned-R trace depends on a manually
accepted Potion and is **not** a demonstrated auto-heal deadlock.
Recreate any actual blocker from deterministic auto-heal and retreat
stage order before choosing conflict-triggered R-help; including later
policy/manual-capture preludes increases coverage but immediately requires
their independently frozen authority, side-effect and snapshot evidence.
Whichever list is chosen, it must be named in the **accepted**
SPEC-015 §4.3.1/§8 amendment and H-03 operation-kind whitelist, with
denial fixtures for every excluded route. Do **not** reclassify this
candidate table as a Human-selected decision merely because A was selected.

**Conflict-triggered R-help arbitration — legacy manual-heal
counterexample; NOT selected/accepted for auto-heal.** Direction A authorizes investigation
of helping a valid R, but the existing §4.3.1 contract also permits an
independent ordinary K to commit a **genuine** strictly rising
`checkpointHighwater>T_R` before R finishes and thereby supersede R.
An unconditional policy to make every eligible K help R would replace
that ordinary opportunity even where no later same-T heal creates the
H-01/K deadlock. For a narrower first-v4 amendment, propose that
R-help be **required only at an authenticated structural conflict**:
an applicable executable R whose original acceptance sequence precedes
a still-scheduled heal genuinely due at `D=T_R`, and an independently
executable J that has legal scope to reach the original T_R. It must
not suffice to see an unclassified submission `C<T_R`, a
later-T heal, an expired/ineligible R, a stale speculative row or an
unsigned future Encounter marker.

At the winning Player/Hunt serialization point, the candidate decision
tree is:

1. **Committed original result already exists:** replay the original
   R and J results under their own retention rules; do not reopen R.
   If a previously committed *eligible* strict `>T_R` first
   highwater crossing genuinely superseded R, its original immutable
   `409` marker precedes any later R-help attempt. If R expired
   without an earlier eligible winner, use the independently approved
   H-02 original-key `410` result; do not retrospectively mark it
   `409`.
2. **Genuine earlier gameplay/structural work:** process authentic
   combat/cadence/automatic `no_living` and due/classification
   fences in accepted order, one point-heal per service invocation.
   A heal with `D<T_R` remains eligible irrespective of H/R
   acceptance sequence, not an excuse to skip its original boundary.
   At `D=T_R`, an earlier-accepted heal precedes R; an
   after-R heal cannot debit before an executable R's authentic
   disposition, even through H's own public-key continuation.
3. **Conflict exists, R and J separately eligible:** propose the
   narrowly scoped dual-original H-03 `assist_original_retreat_final`
   after all preceding work. Only the original R terminalizes;
   preserve the later H domain-cancellation and J-own receipt
   rules. K cannot first advance `>T_R` by ignoring the blocker
   and then claim that its fabricated crossing made R `409`.
4. **No conflict requiring R-help:** retain the *genuine*
   SPEC-013 §5.3.1/SPEC-015 §4.3.1 race between a new K's
   normal frozen target and R's own advancement. If K commits
   `>T_R` first, that actual eligible crossing can supersede R;
   if R commits its own legal terminal first, K converges on the
   original terminal. Do not grant R-help simply because a K
   happens to be present. This narrower policy would preserve
   more legacy K opportunity but needs explicit Human acceptance,
   because A as a direction did not prescribe this trigger.
5. **Conflict exists but J cannot help:** preserve accepted
   domain effects and immutable original correlations. Reject or
   defer *without* a false terminal, target extension, Potion debit,
   `409` crossing or synthetic progress. If a public `202`
   would report no advancement/classification/legitimate waiting
   state across indefinite retries, do not advertise that as a
   bounded-progress success; choose an explicitly accepted
   route-specific `503 authority_unavailable`/pending
   continuation policy and retry semantics. A transient response
   does not erase either R's pending lease or the durable H
   domain action.

**This is an alternative restriction *within selected direction A*,
not a switch to unselected B:** no preemptive `409` before an
actual valid K `>T_R` crossing, no direct cancellation of a
still-executable R, and no promise to terminate every abandoned R
before its 30-day transport expiry. An independent GSC/QA/security
review must verify that the trigger does not create another
indefinite waiting case and that its indexed SQL blocker predicate
cannot be falsified by a restricted database principal. Include the
scope/trigger as an **explicit fourth Human Class-A choice** alongside
the route allowlist, K-versus-R tradeoff and J-only scheduling
policy; this paragraph alone does not select the trigger.

**Proposed bounded response discipline for a permitted J, not accepted:**
when J's invocation only classifies a due submission or point-resolves one
eligible heal at the original T, it **does not additionally complete R**
in that invocation; it persists the legitimate work/result and stops
under its own original command correlation. If J itself just
point-resolved its own heal, a resulting terminal item-key `200`
does not retain unused R-helper authority; a new eligible invocation
must examine R. A distinct later J invocation, still independently
pending/executable and with no preceding structural blocker, may commit
**only R's** authentic terminal disposition; J's own terminal route
result is then resolved separately from the frozen R-terminal state.
R's **own** accepted continuation keeps SPEC-015 §4.3.1's existing
same-boundary option to conclude R after resolving at most one due
heal when its target is exactly that boundary and no earlier/equal
eligible heal remains. Do not impose a compulsory extra `202` on R's
own already-accepted behavior. This **deliberately conservative
J-only scheduling candidate** reduces mixed-effect SQL permissions;
its availability and extra-segment consequences still require
separate GSC/QA/Human acceptance. Excluded policy/manual-capture
preludes must never debit, save a policy, advance past R, or forge
`409` solely to escape the R fence; their blocked/deferred disposition
requires a separately accepted bounded protocol and does not gain an
indefinite-`202` product guarantee here.

**Post-helper J transport response — still an unanswered Class-A
contract:** an R-only transaction may have committed authentic R
terminalization while J's own originally accepted key remains pending.
Specify the actual HTTP response to **that very J invocation**, its
retry instruction and durable evidence of the completed R-helper step.
A candidate separately bounded `202` must retain J's original
correlation, cutoff, Hunt source and route-specific shape, represent
actual committed work, and never invent increasing logical time or
extend J's lease. In particular, an `items/use` helper cannot
continue returning `202 waiting_boundary` **as if the Hunt were
non-terminal** after R already terminal-canceled its due domain item;
its frozen submission cutoff C is a different kind of target from an
ordinary advancing command's T_K, so a generic progress target cannot
be silently substituted. Alternatively, a second separately guarded bounded
J-result operation during the same HTTP invocation requires explicit
authority for both results and must handle J expiry/failure **after**
R's irreversible commit. A post-commit transient `503` must not
misrepresent the already committed R effect. Whether the J key
subsequently returns `200` or expires to its own `410`, R's original
result/recovery/retention stay fixed. Select and test this per-route
transport behavior before accepting the proposed J-only discipline;
the present SPEC-015 §4.3.1 does not define this new cross-key
half-completed HTTP state.

**Human Class-A decision card for J (unanswered; old healing-key
options overridden by the later auto-Potion decision):**

1. Review `{checkpoint, claim}` as the candidate public helper list
   for **new automatic-Potion Hunts**, or choose another explicitly
   permitted non-healing command list. Automatic healing cannot be
   authorized as a separate J; historical `items/use` retains only
   its own original legacy-key requirements.
2. Accept explicitly that, if authorized J reaches R's T and wins
   R's original terminalization **before** K has genuinely committed
   `highwater>T_R`, K loses the opportunity to create a future
   `409` for R by such a crossing. An earlier *already committed*
   eligible crossing, including one by a K accepted before R, still
   has its authentic precedence; no speculative highwater marker
   replaces that proof.
3. Accept or revise the J-only separate-invocation discipline
   above, without changing the accepted same-boundary rule for R's
   own invocation. The exact eligible J route, two-original H-03
   permission, both H-02 leases, no-living precedence and result
   snapshot must be proved together, not in independent patches.
4. After proving a **real auto-heal** versus R/K ordering conflict,
   choose whether assistance is **conflict-triggered** or generally
   allowed whenever an eligible J reaches R's T. The manually accepted
   same-T H13 example is no longer a valid reason to assert that such
   a conflict necessarily exists in auto-heal.
   Under either choice, only an actual earlier valid `>T_R`
   crossing can create original R `409`; the result cannot
   depend on a Worker-selected speculative branch or timing race
   outside the winning Player/Hunt SQL serialization.
5. Specify the first response for every eligible J that has committed
   R-only terminalization but has not completed its **own** result:
   exact `202`/other route-specific envelope, observable durable
   progress, supported retry and expiry after R commit, or an explicitly
   authorized bounded same-invocation independent J-result operation.
   Include checkpoint/claim target-already-reached cases; manual
   `items/use` waiting-boundary is a legacy compatibility case,
   not a new auto-heal J response. Neither status nor response body
   may be inferred from the original R `200`.

**Proposed SPEC-015 §4.3.1 addition for Human-selected A — NOT YET
NORMATIVE:** in the separate Class-A amendment, explicitly permit a supported,
still-executable, same-Player mutation with an authenticated frozen
advancement-Hunt identity matching an existing accepted retreat R to service
R's original pending advancement/terminal boundary as a *helper*. This is a
bounded **cross-command exception** to the ordinary same-key continuation
path, not a new HTTP command, a transfer of R's Idempotency-Key, or automatic
cancellation of retreat. R retains its original acceptance, target, lease,
terminal response and recovery anchor; the helper retains its own immutable
intent, target, command-local effects and response, independently subject to
its own lease. At the original R target, drain any genuine earlier due work
in canonical order (one point-heal per invocation), with no retroactive
healing or zero-gap NEXT_BATTLE. Under one Player-serialized, H-02/H-03-guarded
final-apply transaction, authorize **both original pending correlations**,
commit at most one original R terminal disposition with its exact result,
or fail closed without any new tentative effect. Once R terminalizes,
existing terminal-Hunt convergence rules determine the helper's *separate*
response; a prior authentic K crossing or automatic terminal outcome still
wins in its actual committed order. Helping R is **not** the speculative
K > R highwater crossing that currently authorizes eager `409`, and no K
`409` may be fabricated simply because K helped R. Accepted scheduled
healing survives transport expiry, but an expired helper key cannot itself
authorize new R-help work. A voluntary cancel-retreat command, eligible
helper route list, final-result coalescing and availability promises are
**not** silently supplied by this addition; the reviewed Class-A amendment
must resolve those details before any implementation.

**Proposed SPEC-015 §8 addition for Human-selected A — NOT YET NORMATIVE:**

> For the separately accepted and version-gated v4 path, a retreat R that
> was validly accepted with its immutable source Hunt,
> cutoff T and original public correlation may reach terminalization through
> a separately authorized bounded continuation of an eligible accepted
> command J, not only through delivery of R's own Idempotency-Key. J must
> have the same authenticated Player and frozen advancement-Hunt authority,
> remain executable under its independently frozen public lease and have
> legitimate scope to reach R's original T; an unrelated, expired, unbound
> or lower-target J cannot acquire R's authority. Before the winning
> terminalization, verify every actually earlier structural heal, combat,
> mandatory replacement, reward and capture obligation, and distinguish a
> genuine automatic `no_living` terminal from explicit retreat. In one
> authenticated, serialized winning transaction, seal the original R
> disposition and original source-Hunt terminal/recovery boundary exactly
> once, without generating a false J advancement, later same-T Potion debit,
> or duplicate terminal presentation/reward. The original R correlation
> owns the `200` retreat result and its own retention clocks. J retains its
> separately accepted intent, lease, command-local effects and later result;
> a supported J convergence response must represent the authenticated
> original terminal-convergence snapshot and J's own effect aggregate, not
> a newer mutable Player state. If an authentic earlier automatic terminal,
> eligible strict highwater crossing, original R expiry, helper expiry or
> failed authorization already prevents that exact result, do not backdate,
> forge or substitute a retreat. A helper's uncommitted attempt is not a
> terminal Hunt, and neither helper success nor R's `202` authorizes a
> voluntary cancel-retreat operation.

This proposed §8 text depends on independently accepted H-02/H-03 final
decision/guard semantics; it does **not** pick an eligible J route list,
the eventual late-`COMMIT` interpretation or the bounded receipt format
by itself. The §4.3.1 proposed exception immediately above and the
single-source immutable result requirement in §4.3 must be reviewed with
this paragraph as one contract.

**Selected-A SQL admission and response contract — candidate proof tuple,
NOT executable DDL or an accepted implementation:** the following sharpens
§14.9's two-phase H-02/H-03 construction for *one* prospective helper J
of *one* original retreat R. It does not select a signing algorithm, trusted
clock issuer, database role, procedure name, schema layout or helper-route
allowlist. A permitted command **must already have an independently valid
reason to reach the authentic original R boundary** (for example, K's frozen
target encompasses T, or a waiting heal reaches its genuine inter-Battle
boundary at T). An unrelated command with a lower terminal cutoff cannot
invent an advance to T solely to help R; nor may a helper borrow the source
Hunt of an older manual-capture decision in place of its separately frozen
advancement Hunt.

**Ordinary K target restriction:** for checkpoint/claim and any other
ordinary advance-to-cutoff helper whose frozen target is `T_K`, assistance
at `R.target=T_R` requires `T_K >= T_R` and the same frozen advancement
Hunt. With `T_K<T_R`, K may complete only its own authentic earlier
advancement; it cannot lengthen its target, pretend to be a same-T helper,
or terminalize R at the later T_R. A healing item is different: its
**independently authenticated structural due marker** may authorize its
own reconciliation at T_R even when the original submission cutoff was
before T_R; this does not license fabricated completion of an unfinished
Battle. A policy-save or manual-capture prelude must have independently
approved eligibility and must not borrow a different capture-source Hunt.

| Authority / transition | Candidate SQL-verifiable proof obligation |
|---|---|
| **R original** | One authenticated row for `(Player,sourceHunt,retreatCommandId,kind=retreat,originalIntentHash,originalIdempotencyKeyDigest,acceptanceSequence,target T,originalCheckpointIdentity,acceptedAt,lease E_R)`; its effective pending result must not be `200/409/410`, it must not have been truly superseded, and `decisionNow<E_R` is required for a new effect. R's earlier `202` segments remain durable but confer **no fresh lease**. |
| **J independent** | One authenticated accepted row for `(Player,helperCommandId,helperKind,originalIntentHash,originalIdempotencyKeyDigest,originalAcceptanceSequence,frozenAdvancementHunt,perKindFrozenCheckpointAndSourceContext,originalTargetOrStructuralDue,acceptedAt,lease E_J)` and the same Player/current source Hunt as R. J's original acceptance sequence, advancement checkpoint/source identity and original authority version must be loaded and authenticated from its **accepted persisted row**, never supplied or replaced by a caller/derived new Hunt state; manual capture's distinct `captureSourceHuntId` remains independently frozen. J must remain executable and unexpired at its **own** final decision, even if the chosen operation writes only R's result. Its legitimate advancement scope must authorize reaching R's T without changing J's frozen intent: ordinary checkpoint/claim `T_K<T_R` cannot become a helper. The previously proposed separate healing Item-key J is **excluded** from future automatic-Potion rules. |
| **Canonical earliest R and stage** | Under the Player/Hunt serialization boundary, prove R is the indexed first applicable same-T retreat, not an untrusted row chosen by J, and prove expected checkpoint/highwater, source/phase, no prior terminal, current heads, authentic earlier structural U/I/B order and original Encounter/reward/capture provenance. Any staging row is **unspendable**, cannot advance the checkpoint or mark R/J terminal, and cannot authorize a zero-gap next Battle; an attacker with only the runtime SQL credential may not transform it into a live effect. |
| **H-03 exact permission** | Fresh narrowly scoped Worker authority binds **both** original R/J identities/intents/acceptance sequences/original per-kind frozen checkpoint/source contexts and lease identities, Player, source Hunt, T, expected live-head/resource versions, one-use stage/nonce, selected operation `assist_original_retreat_final`, canonical proposed R receipt, terminal/private/public proof and candidate post-head. Bind the authenticated J source-context digest in both nonspendable stage and final permission, then recheck the original accepted row and current CAS winner; a caller-provided context cannot substitute. The first-phase stage capability cannot substitute for the final permission, and an intercepted valid final permission must not authorize a different Hunt, changed effect, second use or missing historical receipt. |
| **Late H-02 and CAS winner** | After all lockable and potentially blocking prerequisites, take an authenticated *new* SQL decision sample and witness/floor check for **both** `E_R` and `E_J`. The final SQL guard rechecks both against another fresh sample at apply, including token freshness, unchanged heads, source ownership, same-T precedence and any *actual* earlier terminal or genuine K crossing. A stage created before either E cannot justify a late terminal. If the proof requires a network witness/signature **after** a lock that can stall, §14.9's non-circularity obligation still blocks acceptance. |
| **R-only atomic terminal write** | Exactly one winning guarded transaction installs the original R `200 {status:"terminal",terminalReason:"retreat",recoveryReadyAt}` result, releases the active Hunt, preserves pending manual/no-free-reroll state, establishes the **original T-anchored** recovery, emits **one** terminal domain-cancellation/proof/presentation seal and updates authenticated heads. Validate actual winning `RETURNING`/CAS row counts and canonical receipt equality: a zero-row loser may replay the authentic winner but may not report its uncommitted proposal as success. Never commit an Inventory/HP debit for later same-T H13 or a fabricated K>T checkpoint as part of this final operation. |
| **J independent later disposition** | The R-only transaction must not silently mark J `200`, `409` or `410` or copy R's body into J. In a separately bounded, independently H-02/H-03-eligible continuation, H13 resolves its own `not_applied/hunt_terminal` domain outcome/transport replay and K converges on the terminal Hunt, preserving its own claim-only accumulated delta and original reply. If J expires **after** authentic R terminalization but before J's subsequent continuation, R remains terminal and the unsupported J key follows original `410` semantics; none of R's result/retention is rewritten. |
| **Abort / commit boundary** | A failure before the one guarded final apply creates **no R terminal** even if an unspendable stage exists; an expiry of either key, altered head, unreadable H-02 witness or invalid H-03 permission causes fail-closed rollback for this invocation. A crash **after** the R terminal commit but before J's HTTP reply yields original R exact-key replay and independent J continuation, never a second R grant. Previous separately committed `202` checkpoint or one-heal domain effects remain authoritative. |

**Selected-A time and terminal-response provenance — distinct clocks must
remain distinct (Class-A proof obligations, not SQL):** the original
SPEC-013 §6.1/accepted SPEC-015 §8 retreat maps its *logical* stop T to
the persisted Hunt checkpoint/session anchor; it does not choose the later
helper HTTP receipt time for recovery. The accepted SPEC-017 terminal feed
instead has its *own* `statement_timestamp()`-based first committed
terminal-presentation retention anchor, while §13.1's range cancellation
freezes domain `resolvedAt = transaction_timestamp()`. A v4 R-helper may
authenticate these values only from their **actual source and original
semantics**; a single convenient SQL/Worker clock field cannot be reused
for all four purposes.

| Result / timestamp | Original authority and proposed H-03 binding |
|---|---|
| R's gameplay `solo_hunts.terminal_at` and `recoveryReadyAt` | Authenticate the exact already-frozen checkpoint's `logical_time_anchor_at` at the legitimate R stop boundary or real earlier automatic terminal boundary. Derive `recoveryReadyAt` using that source and the Hunt's pinned recovery duration; bind the canonical R `200` result and original source checkpoint/version. Neither the H-02 transport decision time nor J's later receipt may delay or refresh recovery. |
| Original R transport terminal-result clock | Independently freeze the H-02-compatible guarded **decision-point** `terminalAt` while both R/J leases are valid. Derive R's **own** full-result/tombstone windows from this legitimate R result decision, not `solo_hunts.terminal_at`, R's original `acceptedAt`, J's `acceptedAt` or J's later `200/410`. A fresh final-apply decision requires a fresh clock/witness recheck; it cannot backdate to a staged or signed older sample. |
| `terminal_cancel` heal-domain resolution | The single authentic terminal operation owns the **domain** `transaction_timestamp()` and terminal acceptance-sequence highwater. Later-accepted same-T scheduled heals cancel once, with zero Inventory/HP debit; an earlier already point-applied heal keeps its own original result. The H-03 signed source/effect receipt must account for the **actual** domain value and cannot reinterpret it as R's terminal decision timestamp. |
| `presentationTerminalRecordedAt` and first terminal seal | Preserve SPEC-017's separately recorded **terminal-statement `statement_timestamp()`**, terminal generation/highwater and exact sealed-or-authentically-`presentation_unavailable` branch. It cannot be inferred from the older Hunt logical `terminal_at`, R's transport `terminalAt` or `terminal_cancel.resolvedAt`; the accepted public retention window must not shift when J eventually finishes. |
| Independent J `202`/`200`/`410` | J keeps its original accepted intent/lease, progress and any claim-local aggregates. Its later supported own terminal disposition samples its **own** valid transport decision; expiry may yield J's `410` after R validly committed, but may not retract R or mint new J rewards. J's own timeline domain heal is independent of the lifetime of J's public key. |

**Generated-value signing obstruction requiring an actual SQL proof:**
`logical_time_anchor_at` and pinned recovery duration are readable from
the locked, authentic checkpoint before R terminalization. By contrast,
the final terminal **statement** timestamp is not, by definition, the
value of an earlier staging statement, and a SQL-generated domain or
presentation result cannot be assumed to equal an arbitrary Worker
pre-signed timestamp. The prospective implementation must show exactly
how a *non-spendable* stage obtains each SQL-derived value or how a
pre-authorized, DB-verifiable **bounded derivation** yields the exact final
actual value, with the H-03 authenticator and historical MAC covering that
same result before it becomes consumable. If final SQL must generate a
previously unknowable time or choose a sealed/unavailable branch *after*
all such Worker permission has been fixed, **reject the construction**:
do not rewrite SPEC-017's timestamp semantics, insert a live-but-unsigned
terminal row, invent the missing signed receipt or assume a post-COMMIT
Worker signature repairs it. Any alternative timestamp/codec/guard choice
requires separate SPEC-017/013/015 Class-A reconciliation and actual
PostgreSQL demonstration, not a textual assertion that signing is atomic.

**Time-source negative fixtures (not run):** delay a valid R-only stage
over an SQL statement boundary and across `E_R` or `E_J`, holding an
intercepted authentic H-03 final capability; force distinct true values
for logical anchor, transaction timestamp, presentation statement
timestamp and late transport decision; replay after all four timestamps
have diverged; induce a deterministic irrecoverable presentation-only
failure at R final-apply and demand either an exact signed
`presentation_unavailable` disposition atomically with valid gameplay or
a full rollback according to SPEC-017, never an unsigned half-seal; crash
after terminal commit but before J reply, preserving each clock and
retention window on both replays. If the system must be restarted because
of clock/witness uncertainty, no new R/J irreversible timestamp may be
manufactured during recovery.

**Unselected implementation shortcuts:** treating J's `202` as an implicit
R `200`, using R's `acceptedAt`/`transaction_timestamp()` from the start
of a long transaction for late expiry, signing only J's key or only R's
key, signing a generic `UPDATE solo_hunts` capability, completing J's
claim/reward inside R's single-use permission, returning a synthetic
`409 command_superseded` without a real earlier `>T` crossing, and
falling back to B's preemption when A's guard fails are **not** selected.
§14.9's remaining witness freshness, SQL role grants, independent MAC,
intercepted-token, trigger/foreign-key waits, legacy writer and
cross-resource adoption proofs apply to **both** original command
identities; the tuple above alone does not discharge any of them.

**A-specific failure matrix — LEGACY MANUAL-HEAL TEST PLAN, NOT
auto-heal acceptance, not executed:** the H11/H13 Item-key examples
in the following table require re-derivation from actual automatic
engine/policy heal events. Checkpoint/claim-only R/J scenarios remain
useful independent regression candidates, but no automatic Potion
can be granted an invented H13 public-key identity.

| Sequence | Required evidence before Class-A acceptance of A |
|---|---|
| H13 requests help while R12 is at T600 and H11 due first | Exactly one H11 point outcome or one H11 classification in that invocation; no R/H13 terminal seal, no H13 debit; second bounded invocation may reassess the authentic head. |
| Corrupted/authenticated H600 with unresolved C500 submission or D550 due heal | Fail closed; neither helper nor original R may retroactively classify/apply it at H600, invent D600, debit HP/Inventory, terminalize R or advance K beyond T. Any accepted repair must authenticate the original boundary without rewriting committed gameplay. |
| K/T601 helps R12 at T600; R12 client never retries | Exactly one original R12 terminal `200` receipt, terminal marker at T600, no fictitious K rise to 601; K retains its own pending correlation and later converges under its own result rule. |
| K accepted with frozen T550, later R12 freezes T600 | K may reach/return only its own T550 boundary and may **not** advance to T600 merely to help R12; no unauthorized R terminal result or K re-frozen target. Contrast K with original target T600 and T601, each with its own command-local exact response, including K accepted before R12. |
| H13 accepted at C500 during Battle, authentic Encounter yields due D600 after R12/T600 acceptance | H13's due marker permits its legitimate structural path to T600 even though C500 is below R's target; if H13 sequence follows R, assisting the valid R at T600 terminal-cancels H13 with no Potion debit. Without an authentic completed Encounter marker, do not fabricate D600 or an R-help boundary. |
| R12 help commits under valid K, but K's pending lease expires before K's separate result continuation | Preserve the already valid R12 terminal `200`, proof and recovery unchanged; K's *own* unsupported pending replay becomes original-key `410` rather than inheriting or renewing R12's result. Preserve K's already-committed `202` claim/effect contribution and later Player-wide observable state without a second grant. Quantify the availability tradeoff of separate R-only commit versus a separately approved jointly guarded bounded result. |
| K=claim owns aggregate P from prior `202`, helps R12 terminalize at T600, then M consumes pending capture A and Start activates Hunt C before K's first supported `200` | R's first terminal transaction must freeze, or make verifiably reconstructible with bounded indexed proof, the original **T600 terminal-convergence state** (including pending capture A, capture options/Inventory/version as they were authoritative at T600 and `activeHunt=null`). K's own reply returns that immutable state and **only P** in K-owned `effects` once; K replay bytes remain stable. Later pending-slot closure, Inventory delta and Hunt C are visible to GET/new commands, **not retroactively substituted** into K's old result. Test original source Hunt A distinct from R's active advancement Hunt B and K's E before/after its own result. |
| Original R expiry E crossed after stage/authorization but before last SQL decision | Roll back entire *tentative* R-help terminalization and source/public/cancellation writes; previously committed segments remain. No R `200` or extended R lease; classify existing R receipt or original-key `410` only under the accepted independent clock decision. |
| Helper H13's or K's own E expires after the helper staged R but before the final SQL decision | Revalidate **both** independently frozen correlations against the H-02-authenticated late decision time. The expired assistant cannot complete R or renew its own key; roll back its tentative R-help and public/effect writes, preserving previously committed R/H domain segments. R may later be helped by another legitimately executable key while R's own E remains open. |
| H11 was processed in a prior committed `202`; R expires before the next helper invocation | Keep H11's authenticated HP/Potion consequence and its original result. Do not create R `200`, retreat terminal, recovery or cancellation after R's E; exact R retry yields its original `410` when H-02 validates expiry. H13 is still an accepted domain obligation and may apply at T600 under an independent eligible mutation after R is gone (whether or not H13's own public key is still supported). K may then genuinely rise T600→T601, but no later crossing may backdate a `409` for already-gone R. Test expired H13 key `410` independently of its eventual domain outcome. |
| Concurrent original R continuation, H13 helper and K helper all race | One guarded R terminal winner, no reused helper capability, original recovery anchor once, same frozen R reply on supported replay, each helper key independently reconciled; zero-row losers do not acknowledge their proposed terminal effect. |
| Automatic `no_living` or genuine K first crossing wins before helper R | No retroactive `retreat` terminalization; retain original automatic terminal/crossing evidence and exact R replay disposition; later manual capture keeps original source Hunt and Player-wide pending capacity. |
| Genuine `no_living` at the exact R target T600 precedes the inter-Battle heal window | With H11 accepted before R12 and H13 accepted after R12, but both structurally due at T600, commit the authentic **combat/cadence** `no_living` terminal at T600 first if the actual terminal boundary occurs before heal admission. Neither H11 nor H13 may debit after that terminal; original R12 supported replay converges to `200 no_living` at T600 and never invents a `retreat` seal. Recovery, retained pending manual decision and same-Zone no-free-reroll token remain anchored to the actual automatic terminal. Prove this order separately from the H-01 **explicit-retreat-only** equal-T acceptance fence; do not claim an automatic terminal always precedes already-committed earlier heal effects. |
| 10,000 ineligible R rows before real pending R12 | Indexed proof of bounded first-applicable-R selection or fail closed; do not scan expired/superseded R candidates or infer a live R from `pending` alone without original lease/clock authority. |

**Executable-conformance submission for H-01/A — SUPERSEDED MANUAL-HEAL
FIXTURES A01–A14, NOT runnable automatic-heal criteria; no tests
implemented or executed by this docket.** After the later Human
decision, these rows require triage and rewritten auto-heal
provenance/ordering fixtures before acceptance. Use an independently owned,
disposable PostgreSQL 17 database with the *proposed* v4 migrations, both
restricted writer/reader credentials, an authenticated Worker-proof
test issuer and exact immutable command/source fixture inputs. In all rows,
R12 is an original pending retreat frozen to source Hunt B, T600 and
acceptance sequence 12; H11/H13 are original accepted Item commands with
sequences 11/13; K14 is an independent already accepted command with its
*own* target and effect accumulator. Seed only genuine combat/reward/capture
and healing boundary transitions; inject corrupted data solely as explicitly
negative adversarial fixtures. Compare **all** winning
`hunt_public_commands`, `hunt_healing_commands`, `hunt_checkpoints`,
`solo_hunts`, Inventory/HP, Player active-Hunt/recovery, Encounter
boundary, original proof/head, retained pending-capture/policy and
presentation rows/bytes, plus the exact first terminal HTTP bodies. No
fixture can declare success from response status without matching the
winning SQL state. Existing §13.3 and the A-specific matrix above provide
additional mandatory cases; the IDs below are the minimum *reviewable
cross-spec acceptance paths*, not replacements.

| Fixture ID | Frozen initial state / forced order | Required original-result and SQL assertions |
|---|---|---|
| **A01 — earlier structural D and fixture reachability** | First accept H11 at genuine C500 with eventual D550, then R12/T600; separately attempt the selected H-01's **later-accepted** H13/C500/D550 schedule through authentic serialized acceptance, recording time floor, checkpoint anchor and due marker. If those original cutoffs cannot regress under the accepted H-02 protocol, test an injected later-H13/C500/D550 record as a negative integrity fixture, not an authorized positive history. Race the valid earlier-D case with both lock orders. | The valid earlier-D heal resolves **at D550** before any R seal at 600, exactly once and with original Battle/reward/capture sequencing. If a valid later-accepted D550 counterexample can genuinely be produced, H-01 also requires it to win before R irrespective of acceptance sequence; otherwise that constructed history must be rejected without invented due time, Potion debit or a false PASS. No checkpoint skips an actual D550 and no synthetic D550 appears before real Encounter completion. |
| **A02 — equal-time acceptance fence** | Genuine inter-Battle H600: H11 due 600, R12/T600 still executable, H13 due 600; run H13's *own* continuation before/after R's original continuation. | At most one H11 point resolution **per invocation** and bounded `202` where preceding work remains; accepted §4.3.1 permits R's own same-boundary finalization after one heal where no earlier/equal eligible heal remains and all guards pass. Proposed J-assisted same-invocation finalization remains an explicit Class-A question. Only after preceding work may R win its original `200 retreat` at T600. H13 never consumes Inventory or increases HP and becomes `not_applied / hunt_terminal`; supported H13 key gets its own replay `200`, expired key `410`. Exactly one terminal recovery/source/presentation seal. |
| **A03 — submission is not a due marker** | H11 original C500 is accepted before R12/T600 while its Battle remains genuinely incomplete at R's cutoff, with a possible later Battle end D650; test an after-R C500 variant only if original H-02 acceptance evidence proves it reachable, otherwise as an invalid-history negative. | Classify genuine C500 at its real Battle phase without forging D600 or D550, preserve prior accepted effects, and permit authentic R at T600 to cancel the still-scheduled heal without debit. If an **already committed** H600 checkpoint is found alongside an unresolved genuine D550 blocker, fail closed rather than retroactively heal at 600. |
| **A04 — abandoned R, allowed J and first J reply** | R12 client ceases after `202`. A separately **Class-A-authorized eligible** J=K14 has frozen target 601; H13 is later-accepted due 600; neither original lease expired. Run independent J-first/R-first service orders and crash after R's commit but before J's first HTTP response. Repeat using a still-pending H13/D600 `items/use` J with its independently authenticated original submission cutoff. | J may finalize **R's** original T600 terminal result only under distinct R/J authenticated intent, lease, source and H-03 SQL permission; no fictitious K crossing >600 and no H13 debit. The same invocation's J HTTP status/body and retriable pending state match a **separately approved per-route transport rule**, never replay R's `200` or invent a generic rising target or `waiting_boundary` after terminal-cancel. J later converges using its own original key/result/claim-only effects, or independently expires to `410`. R replay remains byte-identical, no duplicate terminal/reward/recovery/proof. If either helper route or J's intermediate transport contract is not accepted, this case is **blocked**, not a passing implementation test. |
| **A05 — bounded helper scope** | K14 frozen target 550 versus R12 target 600; alternatively K14 target 600/601 but wrong Player/Hunt, expired key, missing original freeze or unauthorized route. | K550 never acquires authority to move to 600; foreign/unbound/expired/mismatched J cannot complete R, commit a **new helper-owned** Item effect or convert R into `409`. Expiry of an already accepted heal's **public key** does not discard that heal's independently durable domain obligation: it may still resolve at its authentic boundary under another eligible valid command. After a genuine earlier K `>600` crossing, use its authentic winning timestamp to determine original R `409` only if within R lease; an attempted K is **not** a crossing. |
| **A06 — two original lease clocks** | Force final guarded decision at E_R−1µs, E_R and after; independently repeat for E_J while an authentic stage/permission was prepared before expiry. | Compare exact microseconds and independent H-02 witness at the actual SQL authority point; any expired required original correlation forbids a *new* R `200` and rolls back all tentative terminal/heal/proof writes. Prior committed `202` and valid heal-domain effects remain. Original pending R/J keys receive their own `410` where applicable, without deriving one key's result or lease from the other. The §14.13 pre-expiry-decision-versus-later-COMMIT fork must be explicitly resolved before this can PASS. |
| **A07 — response after world changes** | Eligible K=claim with previously committed claim-local aggregate P helps R at 600; then another valid manual-capture decision changes pending capture/Inventory, and a new Hunt C Starts **before** K's own terminal response. | R terminal at 600 must seal (or permit bounded authenticated reconstruction of) the as-of-terminal Player state. K's own supported `200` returns that frozen state and only P in its own `effects`, then stable byte replay; no effect from new Hunt C, new Inventory or later pending capture appears in K's old response. If K expires before its own result, its original-key `410` never changes R or doubles P. |
| **A08 — automatic terminal wins** | Genuine `no_living` occurs before T600 or at its authentic combat/cadence boundary at 600, competing with H11, H13, R12 and K14. | Original no-living source/terminal/recovery wins under combat ordering; no Potion debit after terminal, no invented retreat `terminalReason` or fabricated R sequence applied to the automatic boundary. Supported R replay converges to genuine `200 no_living`; no-free-reroll and retained manual pending survive as originally accepted. |
| **A09 — concurrent winner and signed SQL guard** | Original R delivery, eligible H13/K14 helper and genuine crossing contend with OCC loss and process crash after R commit/before helper reply. With normal restricted SQL credentials, attempt direct forged R/H/Inventory/HP transitions and replay one intercepted helper capability. | Exactly one original terminal/crossing winner; CAS losers do not publish an attempted `200/409`. H-03 rejects/detects every unauthorized consumable result *before* commit, and replay cannot consume another Potion, mint K result, change another Player, bypass signed source or write a second terminal presentation seal. Genuine first `>T` crossing/supersession evidence must be immutable and strictly prior to R result when invoked. |
| **A10 — long queues and legacy isolation** | 10,000 later same-T scheduled heals plus 10,000 ineligible pending R keys, including expired/superseded original correlations; replay a valid v1/v2/v3 Hunt separately. | Bounded fixed-number indexed selector/point-write and immutable range disposition **without** a 10,000-row terminal UPDATE or per-key result allocation. Measure returned/affected SQL rows, physical pages, WAL, lock waits and p95/p99; retained supported keys resolve independently and prior v1–v3 bytes/cursors/gameplay remain unchanged. A missing/forged earliest U/I/B/R authority fails closed rather than selecting a later head. |
| **A11 — exact helper-kind allowlist and source identity** | For the **candidate narrow allowlist**, attempt R-help using pending/unexpired same-Hunt checkpoint or claim `T_K>=T_R`, pending/unexpired heal with genuine D=T_R, heal with D<T_R, another retreat R2, Start, account GET, policy-save and manual-capture with `captureSourceHuntId=A` but `advancementHuntId=B` (and the converse); vary original `expectedRowVersion`, prior 202 and source Hunt. | Only **separately Human-approved** helper kinds under genuine per-route original frozen authority can invoke the guarded R-only terminal path. A completed D<T heal cannot reuse its terminalized key; D=T item may help only if independently executable. Excluded routes cannot get permission through a generic SQL role or forged source, but continue under their own accepted API semantics. For a later extension of policy/manual-capture eligibility, independently prove exact original policy/capture effects and responses **after**, never within, the R-only permission. No claim that the candidate list already passed Class-A selection. |
| **A12 — pre-expiry decision versus late COMMIT** | Force independently witnessed H-02 decision `t1<E_R,E_J`, acquire all target resource locks, then stall a first protected SQL winner so its actual durable `COMMIT` occurs after one original expiry; race an exact-key `410` observer, authentic K crossing, repeated intercepted H-03 capability and crash/restart. Separately vary late `statement_timestamp()` of terminal presentation and actual `transaction_timestamp()` of heal cancellation. | **Acceptance is blocked pending the explicit §14.13 semantic choice.** Under an approved pre-expiry *serialized decision* contract, prove a non-forked single authenticated winner despite later visibility; under an approved *COMMIT by E* contract, prove the pre-expiry candidate cannot durably become a fresh post-E consequence. Both paths reject missing historical receipts, post-E invented `200/409`, changed original R/J results, clock substitution or unsealed presentation, while retaining earlier committed `202`/heal effects. An observed PostgreSQL row lock alone is not a passing H-02/H-03 proof. |
| **A13 — conflict-triggered R-help versus normal K crossing** | Freeze executable R12/T600 and independent K14/T601, both accepted in opposite orders. Branch (a) no same-T H13 due; branch (b) authentic later-accepted H13 with D600 at an actually reachable same-logical-boundary receipt; branch (c) earlier-accepted H11/C500 unclassified in genuinely incomplete Battle; branch (d) H11 accepted before R and due 600. Race R/J/H under both Player-lock orders, verify clock/floor evidence for (b), and test a genuine previously committed K `>600` rise. | Under a separately accepted **conflict-triggered** variant, (a) preserves original K/R normal winner; (b) blocks H13's debit and requires an eligible J to finish authentic R first, without a fictitious `409`; (c) classifies C and never fabricates D or triggers R-help solely from unclassified C; (d) resolves H11 first, at most one heal per invocation, then re-evaluates actual earliest heads. Under the alternative broad-helper variant, specify and separately approve any K opportunity change in (a). A prior genuine `>600` crossing always keeps its original eligibility/lease and result; changing which Worker gets the initial lock cannot secretly re-freeze T. |
| **A14 — excluded helper, lack of progress and evidence status** | Freeze valid R12/T600, later H13/D600 and K14/T550 or an excluded policy/manual-capture route. Force successive requests with unchanged SQL heads, simulated Worker restart and H-02 witness outage; independently retry R and supply a later valid eligible J. | Excluded or unauthenticated J must not apply H13, terminalize R, fabricate K `>600`, write a false `202` progress position or repeatedly claim bounded progress without an actual accepted operation. An unavailable/deferral response needs an explicitly accepted route-specific transport result while both frozen keys/domain obligations remain stable. Recovery through original R or a newly legitimate J resolves the authentic head exactly once; an expired R never revives. A prolonged wait/time-to-progress must be disclosed, not silently called a bounded-availability guarantee. |

**New automatic-Potion conformance outline — N01–N08, PROPOSAL ONLY,
not approved or executed.** These are the replacement review topics
for the earlier manual H11/H13 assumptions. The game-rule owner
must first define the exact event order and thresholds in an accepted
SPEC-013/SPEC-015 amendment. No row below authorizes a new item
sink, healing during Battle or modification of accepted old Hunts.

| Proposed case | Observable acceptance criterion after rules are selected |
|---|---|
| **N01 — mode scope** | Two identical damaged Teams: an explicitly enabled PvE Hunt may evaluate a pinned HP-percent policy; a content mode without that opt-in consumes no Potion. PvP and every unselected mode fail closed. |
| **N02 — threshold and target** | HP immediately below/equal/above the configured percent, multiple Team members, missing target, full HP, KO and zero Inventory. Verify the accepted comparison/target/item rules exactly, without fabricated revival or silent negative stock. |
| **N03 — original logical phase** | Replay damage, DoT/KO, mandatory replacement, successful Encounter reward/capture and zero-gap next Battle around the candidate HP trigger. An approved during-Battle trigger must use the shared combat engine; an approved inter-Battle trigger cannot retroactively rescue a Battle KO. No order is assumed by the fixture before Owner acceptance. |
| **N04 — retirement/withdrawal race** | One genuinely eligible automatic heal races original pending retreat R at an authenticated logical boundary; run both serialization orders and automatic no-living. Verify the separately accepted phase priority, exactly one terminal reason/recovery and zero debit for any canceled candidate. No old H13 public acceptance sequence is imported. |
| **N05 — restart, claim and two Workers** | Repeated checkpoint/claim/retreat attempts traverse the same HP trigger with identical seeded source and pinned policy. Exactly one event identity, one winning Inventory debit plus HP effect or one valid no-op, no double spend on client retry, crash or SQL race. |
| **N06 — resource and policy version** | Toggle eligible mode/policy between Hunts, alter live Inventory and change published threshold/item content while an old Hunt is active. Preserve the separately accepted pinned versus forward-only activation rule; never rewrite historical decisions from latest mutable config. |
| **N07 — public command compatibility** | The new auto-heal version has no user-authorized `items/use` Potion command, no fabricated Item-key 30-day lease and no Item-command HTTP result. Existing accepted/manual keys and stored v1–v3 evidence retain their original replay/expiry according to an expressly accepted migration/route compatibility contract. |
| **N08 — security and load** | With normal restricted SQL credentials try to forge automatic trigger, target/HP percent, Potion debit or replay proof. Independent Worker/SQL authorization rejects unauthorized spendable outcomes. Long offline Hunts, many repeated HP crossings and concurrent writers satisfy pre-accepted finite CPU/SQL/WAL/latency limits. |

**Class-A acceptance rubric for this packet:** (1) assigned GSC gameplay
consultation and independent QA/architecture/security review of the *same proposed*
SPEC-013/SPEC-015 amendment; (2) explicit Human acceptance of the original
R-versus-K opportunity change and eligible helper kinds, with the normative
files amended through the authorized process; (3) actual role-isolated
PostgreSQL negative fixtures and real Worker/SQL H-02/H-03 dual-correlation
temporal/authorization proof, including the unresolved §14.13 authority
point; (4) authenticated bounded as-of-T deferred response proof, original
key retention and v1–v3 compatibility; (5) finite indexed/writer
measurements meeting **pre-accepted** CPU/DB/WAL/latency limits at scale.
Every **applicable, re-authored** A01–A14 row and referenced
§13.3/§14.1 case and the finalized N01–N08 cases must be independently
evidenced against the
correct versioned healing contract. **No A01–A14 row containing a
user-submitted future Potion is a new auto-heal PASS criterion.**
No SQL-free mock, `EXPLAIN` alone, one
passing lock schedule or Class-B v3 regression substitutes for that
evidence. **Current status: proposed amendment/test plan only; zero new
Class-A implementation authorization.**

**Candidate resolution B — earlier authenticated K preemption (NOT
SELECTED):** allow a new, immutable, SQL-guarded K-winner disposition at T
which irrevocably displaces the older R **before** H13 applies, even though
K's checkpoint has not yet risen beyond 600. Then H13 may run during a
later invocation and K may continue. This explicitly replaces SPEC-015's
current *strict-highwater-crossing* trigger for this case: if K is later
abandoned, R remains displaced without a committed rise beyond its cutoff.
It therefore changes idempotency terminal timing/retention, the meaning of
`409 command_superseded`, and retreat control; an isolated SQL reservation,
lock or temporary priority token is **not** equivalent to this durable
disposition. Full Class-A product and security acceptance would be required.

**Non-resolution — blocking until R retries or expires (NOT SELECTED):**
returning `202`/`503` indefinitely for H13 and K avoids an illegal debit but
does not establish any separately approved guarantee of eventual progress,
particularly under an H-02 clock-integrity incident. Accepted SPEC-015
guarantees bounded work **per invocation**, not a wall-clock upper bound for
K's progress while R is abandoned. Indefinite deferral cannot be advertised
as an accepted availability policy without a separate product decision.

**Review outcome still owed for selected A:** independently verify the
cross-command R-help disposition and its exact
Player-lock linearization point, bounded indexed pending-R lookup, genuine
eager-supersession interaction, no-active-Hunt/automatic-terminal branches,
single-heal rule, H-02 lease/expiry behavior, R/H/K immutable results and
cross-Worker crash/OCC replay. Negative fixtures must pause the client R
after `202`, deliver H13 and K in both lock orders at T, test K abandonment,
then retry R at E−1μs/E/after an independently legitimate K crossing.
**Human has selected A, not B. Selection is not an executable contract:**
the A mechanism may only be implemented after the separate SPEC-013/SPEC-015
Class-A amendment, independently reviewed guard/index/clock design,
adversarial PostgreSQL/Worker evidence and explicit implementation
authorization. B remains unselected and must not be used as a fallback when
A's eligibility, lease or proof checks fail.

### 14.2 Distinct v3 race: candidate revalidation is not advancement revalidation

The locked due-heal and classification rechecks documented above protect
**which existing candidate** is resolved or classified. They do **not**
establish that the set of blockers stayed unchanged during a separately
computed Hunt advancement. In `application.ts:2704-2712`, the outer
advancer reads the earliest blocker outside its eventual persistence
transaction; `:2721-2731` then submits a projection derived from that read.
As already identified in §13.4, another request can accept a heal under the
Player lock without incrementing the checkpoint's OCC version. Therefore
checkpoint-rowVersion revalidation alone does not prove the projected
advance is still admissible. The source-based race remains **unreproduced**,
and must not be reported as an observed production incident.

The v4 acceptance test must force the following interleaving with a
deterministic barrier: K reads no blocker at highwater H100 and prepares
an advance to H150; J then accepts an unclassified heal at frozen cutoff
C120 and commits without advancing the checkpoint rowVersion; K obtains
the Player lock and attempts to commit its H150 projection. The winning
guard must observe J's earliest **effective** blocker under that lock and
reject or recompute K before writing checkpoint, source events, rewards,
presentation or NEXT_BATTLE beyond C120. Repeat with a heal due at H150,
an OCC-losing J, a newly classified Battle heal, and a no-Encounter-boundary
projection. Assert that the rejected K attempt emits no signed rising
marker, terminal receipt or effect and that retry does not skip the heal.

This is a **separate gate** from H-01: the concurrency requirement to
observe an accepted blocker before crossing its frozen structural fence
holds whichever Human retreat/heal precedence is ultimately chosen.
Do not claim the current due-heal candidate's `FOR UPDATE` recheck fixes
the outer advancement race, and do not alter legacy code under this DRAFT.

### 14.3 Frozen target and claim accumulator are not SQL-immutable today

The current `updatePublicHuntCommandTargetInTransaction` helper sets
`advancement_hunt_id`, `target_logical_time_ms` and `target_wall_clock_at`
using only `WHERE command_id = $1 AND command_status = 'pending'`
(`hunt-orchestration-repository.ts:527-542`). It has no SQL predicate
requiring the previous target to be NULL, checking Player/Hunt identity,
or comparing the original freeze receipt. Its observed application callers
derive the target while holding the Player root and commonly enter only
when the command's loaded target is NULL (`application.ts:1239-1268,
2585-2595`; other callers at `:1556-1561,1722-1727` require their own
review). That application discipline does **not** make the database
helper itself a one-time freeze guard against a stolen ordinary SQL role.

Likewise, `updatePublicCommandClaimEffectsInTransaction` accepts arbitrary
JSON and checks only command ID and `pending` status
(`hunt-orchestration-repository.ts:1431-1441`). The observed application
callers aggregate capture and reward effects after the corresponding
boundary stage and under the Player root transaction
(`application.ts:3046-3077,3088-3122`). This is **not** evidence that
the legitimate caller fabricates rewards; it is evidence that current
SQL-level predicates do not authenticate the accumulator's canonical
source, Player, stage, prior value or winning effect bytes. The helper
also returns `void`, so the call alone does not prove an UPDATE matched
exactly one pending row.

For v4, the guarded freeze must bind the immutable original command,
Player, advancement Hunt, checkpoint/head version and target exactly once;
any subsequent `202` must reuse that frozen tuple. A claim accumulator
update must be derived from authenticated winning capture/reward source
and checked against the persisted stage, previous accumulator and actual
`RETURNING` row, not accepted as arbitrary caller JSON. Deny normal-role
direct UPDATE and broad arbitrary-argument guard execution, including
legacy-route access to adopted rows. Negative fixtures: double freeze
with changed Hunt/T, same-key `202` retry after a different Hunt starts,
foreign-Player command ID, overwritten capture success/XP, missing
pending row, rollback after a signed proposed accumulator, and replay
after terminal result. Verify zero fabricated source/effect proof and
unchanged original target on every losing attempt.

These are **v4 design requirements and existing SQL-helper limitations**,
not a demonstrated exploit of the full currently deployed API. The
precise effective database grants and attacker access are still untested.

### 14.4 Current DDL does not prove relational tenant binding or v4 adoption

The inspected baseline migration `0001_postgresql_schema_v1.sql:70-88`
defines `hunt_checkpoints` with an independent `player_id`, a global
`checkpoint_id` primary key and mutable `checkpoint_schema_version`,
`checkpoint_state_bytes`, logical time and row version. Migration
`0009_authoritative_hunt_api.sql:12-29` gives `solo_hunts` an independent
`player_id` and `checkpoint_id UNIQUE REFERENCES
pokenexus.hunt_checkpoints(checkpoint_id)`, **not** a composite foreign key
`(player_id,checkpoint_id)` into the checkpoint owner. Its
`hunt_public_commands` table similarly uses separate Player and
source/advancement Hunt foreign keys (`0009:66-96`) rather than composite
tenant-qualified foreign keys. These DDL facts do not show that legitimate
application routes mix owners; they mean the cited declarative constraints
alone do not forbid a forged cross-Player association when a database
credential can issue arbitrary writes.

The policy authority has a distinct concrete instance of this same owner
binding gap. `0009_authoritative_hunt_api.sql:126-140,158-170` references
the globally unique `policy_version` alone from
`player_hunt_roots.current_policy_version`,
`solo_hunts.initial_policy_version`, `hunt_policy_intervals.policy_version`
and `hunt_encounter_boundaries.policy_version`; none of those references
enforces equality to the policy row's `player_id`. The current-policy reader
joins only on version and filters the **root** Player
(`hunt-orchestration-repository.ts:856-868`), whereas the separate
`loadAutoCapturePolicyByVersion` path does filter by both Player and version
(`:871-883`). Thus a hypothetical malformed A-root → B-policy link can
return B's saved policy into A's own policy GET
(`application.ts:923-932`) and carry its version into A's next Hunt Start
(`:1090-1104`). This is a source/DDL conditional exposure path, **not**
evidence that current deployed SQL grants permit cross-Player mutation.
The v4 guard must bind `(policyOwnerPlayerId,policyVersion)` to the original
Player/Hunt owner at each of those four edges, with composite tenant-qualified
references or an independently enforceable equivalent; an authenticated
Hunt source must never treat a globally valid foreign policy UUID as an
authorized consumed policy. Negative fixture: attempt A→B policy pointer
tampering on each edge with the ordinary runtime role, then request A's
policy GET and Start and consume the effective Encounter policy; assert
denial or fail-closed without exposure of B's balls/rules, adoption of B's
policy or a false authenticated capture/reward result. Also prove legitimate
same-owner v1–v3 policy-history reads remain compatible. Inspect the effective
deployed grants before assigning exploitability.

The current checkpoint writer locks by `(player_id,checkpoint_id)`, checks
rowVersion and nondecreasing logical time, and updates
`checkpoint_schema_version`, state bytes and anchor in one statement
(`hunt-orchestration-repository.ts:1443-1504`). That is a valid existing
optimistic-concurrency mechanism, **not** a v4 admission barrier: the SQL
predicate does not require a signed source, authenticated transition,
protected-version guard or same-transaction first-crossing marker. A
future version barrier cannot rely solely on a TypeScript `if` around
this helper while an old writer or normal SQL credential retains direct
UPDATE permission.

The forward-only v4 migration must choose and verify database-enforced
tenant binding (composite FKs or equivalently guarded immutable owner
relationships), owner immutability, and protected-row admission at the
actual checkpoint and resource lock points. A signed marker that names a
Player must not be consumable for a checkpoint or Hunt whose owner differs.
Test a forged `solo_hunts.player_id` versus checkpoint owner, a public
command pointing at another Player's Hunt, owner reassignment, v3 helper
UPDATE of an adopted v4 checkpoint, and a rollback that leaves a v4
schema tag without its signed head. Repeat using the *real deployed SQL
role* and separately a migration/owner role; a privileged owner may be
outside model N, but the test must prove that the normal role lacks its
capabilities. Preserve the current v1–v3 paths until separately migrated.

This is a **DDL/source-level gap and negative-fixture requirement**, not
proof that the currently configured connection role has these privileges
or that a cross-tenant exploit has occurred. Inspect deployed grants,
schema ownership and role inheritance before assigning exploitability.

### 14.5 Healing resolution needs a winning-row receipt, not only a call

`resolveHealingCommandInTransaction` updates a scheduled heal by
`command_id` and `heal_status = 'scheduled'`, then returns `void` without
checking the affected-row count or returning the original Player/Hunt,
due time, acceptance sequence or final disposition
(`hunt-orchestration-repository.ts:1401-1416`). The due-heal application
does select/revalidate a candidate under the Player root and resolves it
inside its transaction (`application.ts:1960-1987,2020-2053`); this is
meaningful current application discipline, **not** an independently
authenticated SQL receipt of exactly one changed healing row. A zero-row
UPDATE would be indistinguishable to that helper's caller from a winning
UPDATE. Likewise, terminal cancellation updates *all* remaining
`scheduled` rows for `source_hunt_id` and returns `void`
(`hunt-orchestration-repository.ts:1418-1429`), without a bounded per-row
`RETURNING` receipt. Neither behavior alone establishes a deployed bug.

For v4, a single-heal resolution must bind its original immutable
acceptance, `(playerId,sourceHuntId,commandId)`, expected scheduled status,
classified boundary/due time, current protected Hunt head and actual
winning `RETURNING` disposition to the effect operation. A zero-row
outcome is a failed CAS/replay requiring authenticated reread, **never**
evidence of a newly applied heal. A Hunt-terminal cancellation may cover
many accepted scheduled heals; its proof must be bounded by the approved
logical-range disposition and immutable terminal fence (§12), not by
signing an unbounded list or trusting a mass UPDATE's unreported count.
An already applied heal must never be recategorized as terminal-canceled.

Negative fixtures: a due heal concurrently resolved by another winner;
an expired public key whose domain heal remains scheduled; a forged
`commandId` from another Player/Hunt; cancellation after an applied heal;
an unresolved earlier-due heal under a terminal fence; and a large queue
where terminalization touches no unbounded private proof rows. Compare
actual SQL row count/returned identity with signed disposition and
Inventory/HP delta, and assert no signed `applied` receipt on a zero-row
resolution. Selected H-01 requires a valid later-accepted heal due **before**
the frozen retreat time to execute first, while later-accepted same-T heals
are canceled. This CAS requirement must enforce, not re-decide, that
precedence; the cross-spec Class-A approval remains outstanding.

### 14.6 Bulk supersession can include the advancing command itself

The existing advancement transaction first rechecks the current command
and persists a new checkpoint, then calls
`supersedeOvertakenPublicHuntCommandsInTransaction` **without** passing its
optional `exceptCommandId` (`application.ts:2775-2817`). The repository's
first expiry UPDATE does not support an exception at all
(`hunt-orchestration-repository.ts:566-577`); the optional exception only
appears in the second, non-heal `409` UPDATE (`:578-605`). Consequently,
the advancing command's own still-pending public row is in the first
sweep's candidate set if its original expiry has been reached by that
later SQL clock sample. This is a source-level possibility, **not** a
reproduced PostgreSQL execution. The root-lock executable recheck at the
beginning of the transaction does not freeze the expiry clock through
the later checkpoint write and sweep.

This is distinct from the completion-time expiry race: a continuation
segment may persist a new highwater, run the sweep and return **internal**
`204` to its orchestration caller without a terminal completion in that
same segment (`application.ts:2813-2819`). This is not an assertion that
the HTTP client necessarily receives `204`: the caller may translate the
segment into a `202` continuation (`:2475-2490`). A deterministic legacy
fixture should
pause after the checkpoint/presentation writes and before the sweep,
advance the database clock past the original lease, and compare the
current command's status, highwater, public events, response and exact-key
replay. Run a separate case with the target strictly below the committed
head to test the second UPDATE's missing `exceptCommandId` at this call
site; do not conflate its `409` with the first sweep's `gone`.

For v4, the guarded winning continuation must not treat a bulk sweep as
authority to expire or supersede its own original command while committing
effects from that invocation. The exact-key final decision and any first
crossing must share the authenticated operation/clock predicate and actual
winning-row evidence. Replace both legacy bulk updates for protected v4
rows with bounded version-scoped point/range decisions; **do not** simply
pass `exceptCommandId` and claim the first sweep is thereby excluded.
H-04 already selects a **conditional** separate legacy correction if the
PostgreSQL regression reproduces the failure; it does not authorize one now.

### 14.7 The frozen server context is part of command authority

The existing repository updates `server_context_json` with arbitrary JSON
for any pending `command_id`, without a Player predicate, immutable-once
condition or affected-row receipt
(`hunt-orchestration-repository.ts:544-555`). In the manual-capture prelude,
the application writes the selected ball-authority version, capture RNG,
and optionally the active Hunt's checkpoint identity/rowVersion into that
context, separately from updating the advancement target
(`application.ts:1232-1267`). A later capture continuation reads the
persisted `ballAuthorityVersion` and `captureRng`
(`application.ts:1319-1325`). The current application acquires locks and
checks command identity, but these helper SQL predicates do not by
themselves establish that a stolen ordinary writer cannot replace a
frozen authority input. This is a **source-level authority gap**, not a
demonstrated exploit with the actual deployed grants.

For v4, define a canonical authenticated *freeze tuple* that includes
`(playerId,commandId,commandKind,sourceHuntId,advancementHuntId,
targetLogicalTimeMs,targetWallClockAt,originalExpiry,serverContextSchema,
serverContextDigest)` and the exact allowed per-kind context fields.
Manual capture must additionally bind the original capture RNG state,
ball-authority version and any prelude checkpoint ID/rowVersion; a later
202 segment must consume the **same** authenticated tuple. A NULL target
for no-active-Hunt acceptance is an explicit frozen value, not permission
to adopt a newly active Hunt on replay. The authority proof must reject
unknown fields, type confusion and schema-version reinterpretation.

The target and context are currently written through separate helpers.
The v4 freeze operation must commit them atomically under the same
Player/command guard and verify the winning `RETURNING` row; a partially
frozen tuple must not become executable or silently fall back to a fresh
RNG/authority version. For adopted v3 commands, do not retroactively
assert an immutable v4 freeze without a separately authorized migration
and trustworthy source evidence.

Negative fixtures: replace `captureRng` between 202 continuations; swap
`ballAuthorityVersion`; change the prelude checkpoint rowVersion; pair a
new target with an old context; inject an unknown context field; change
the source Hunt while keeping the advancement Hunt; retry a frozen NULL
advancement target after starting a new Hunt; and race two freezes for
one command. In every case, verify that the protected transition either
uses the **original authenticated tuple** or fails closed without a new
ball debit, capture result, checkpoint movement or signed proof.

### 14.8 Encounter boundary source and stage transitions need winning SQL proof

The present v3 `freezeEncounterBoundaryInTransaction` inserts a frozen
Encounter row carrying the source ordinal/time, policy version, reward RNG,
capture RNG and capture/manual disposition, with
`ON CONFLICT (hunt_id, encounter_id) DO NOTHING` and a `void` result
(`hunt-orchestration-repository.ts:1071-1112`). The call is made after
checkpoint/presentation persistence, using the source Encounter evidence
and newly chosen RNG (`application.ts:2818-2874`). The helper does not
distinguish one successful insert from a conflict with *different* frozen
bytes. Later application stages do reload the boundary under the Player
lock (`application.ts:2905-2915`); therefore the silent insert conflict
is **not proof of a currently replayable reroll**.

Two later helpers independently modify the same row: automatic capture
selection only updates a `frozen` boundary whose `automatic_disposition`
is NULL, but returns no winning-row evidence (`repository.ts:1114-1146`);
capture success/shiny updates any `frozen` boundary already marked
`attempt`, without an original NULL-result CAS or row-count evidence
(`:1148-1167`). Stage advancement uses a `void` UPDATE on `(hunt_id,
encounter_id)` **without a predecessor-stage predicate**
(`:1235-1257`). The application ordinarily serializes these steps with
Player-root locks and performs some source/inventory checks
(`application.ts:2905-2978,2985-3040,3090-3122`), but those checks are
not a database-enforced proof against an ordinary writer calling the SQL
helpers directly with different values. As elsewhere, the actual deployed
grants and adversarial PostgreSQL reproduction have not been established.

The v4 authority must freeze the *original* source identity, committed
checkpoint/highwater, reward/capture RNG and policy version **once**, with
an authenticated exact-byte insert-or-match result. A conflicting
EncounterId with different source, version or randomness must fail closed,
not be treated as an idempotent duplicate. Automatic ball selection and
capture outcome must each bind their immutable predecessor stage,
original Player/Hunt/Encounter, effective policy, expected Inventory
version and uniquely winning `RETURNING` row to the *same* signed original
source/effect operation. Stage transitions must permit only the accepted
`frozen → capture_committed → reward_committed → committed` succession;
the exact permitted no-capture path still requires an explicit authenticated
disposition, not a fabricated result. A result already frozen as
`success=false` cannot later be rewritten as `success=true`, even with
the same EncounterId. A stale zero-row update must re-read the immutable
winner or abort, never allow a second debit/reward or advance the public
history based solely on a `void` helper return. The v4 proof must also
cover **reward/capture-before-next-Battle** ordering and the §12 due-heal
marker at the real Encounter completion.

**Manual opportunity is part of that original Encounter receipt.** With
auto-capture disabled, the current application creates the Player-wide
pending manual decision *before* freezing the same Encounter boundary, in
one transaction (`application.ts:2836-2873`). Its insert uses
`ON CONFLICT (player_id) DO NOTHING` and **does** inspect `rowCount`
to return `created` or `blocked_existing`
(`repository.ts:984-1005`); this is not the boundary helper's silent
conflict. Under v4, the first authenticated source/boundary operation must
bind the exact `manualDisposition` **and** the winning Player-wide pending
slot identity/Encounter evidence (or the original already-occupied slot
that caused `blocked_existing`). Retrying cannot replace that pending
decision, invent a second opportunity, or reinterpret a blocked Encounter
as newly captured merely because the slot was later emptied. Preserve
SPEC-015 §7's one-slot/no-hidden-queue behavior; deny a forged opposite
disposition before publishing its reward/boundary proof.

Negative fixtures for the **proposed v4 guard**, not claims of observed v3
bugs: insert identical Encounter twice versus different RNG/source under
one `(huntId,encounterId)`; change automatic ball or pre-reward Inventory
version after selection; submit a second capture success/shiny result;
call reward stage directly from `frozen`; regress `reward_committed` to
`capture_committed`; call any stage with a foreign Player/Encounter; and
force a zero-row CAS while attempting to publish the next Battle. Include
an occupied manual slot, concurrent skip/close, and a duplicate Encounter
attempting to change `created_pending` into `blocked_existing` or the
reverse after the pending slot changes. For
each case, compare exact winning SQL rows, resource deltas, original
operation proof, resulting presentation index and one authenticated
Encounter marker; reject inconsistent combinations without relying on a
later GET to repair history.

### 14.9 Candidate H-02/H-03 atomic-admission protocol — not yet executable

The selected **pre-write** SQL-verifiable Worker permission and the
**Worker-only** historical MAC are different authorities (§§10.3, 11.2,
13.4). Neither a valid admission capability *alone*, nor a promised later
MAC step, prevents an ordinary SQL credential from committing a partial
live write. The following is a **candidate proof construction**, not an
approved crypto primitive, PostgreSQL migration or change to gameplay:

**Selected A specialization (not Class-A accepted):** a cross-command
retreat helper is a **dual-original-correlation** operation, not an
ordinary single-key continuation. Throughout steps 1–5 below, when the
operation is `assist_original_retreat_final`, every check described for an
already accepted original command must **separately** cover R and J:
each original Player, command kind/intent/Idempotency-Key binding,
pending status, frozen source/advancement Hunt, cutoff or genuine
structural-due scope, acceptance identity and 30-day continuation lease.
For selected A, `acceptance identity` includes **both** immutable original
acceptance sequences and each per-kind frozen checkpoint/source context,
signed in the stage/final permission and rechecked against the originally
accepted rows; the helper's current/latest Hunt is not a substitute.
R's source Hunt must match J's frozen *advancement Hunt*, not an unrelated
manual-capture source Hunt. The final operation is **R-only**, with
separately later J response; neither R's `200` nor its recovery is J's
result. Step 5 requires **one** SQL-verifiable H-03 final permission and
fresh H-02 late status/expiry checks over **both** original correlations,
not two separately committable/individually trusted authorizations.
§14.1's selected-A proof tuple and failure matrix apply in addition to
this general construction; they do not substitute for a real SQL proof.

1. **Trusted bounded preparation outside the SQL transaction:** for a
   previously accepted key, resolve its **already frozen** original
   command/lease, Encounter/policy/RNG and expected live versions. A helper
   resolves **both** previously accepted original R/J correlations and
   their separate lease deadlines without manufacturing a new R intent.
   For an
   **unbound first request** (including Start or no-active-Hunt policy),
   prepare only a canonical, domain-separated *intent*: no accepted key,
   transport clock or frozen target exists yet. Obtain an independently
   authenticated H-02 time-health witness. The witness is not the
   PostgreSQL clock; its issuer/verifier, uncertainty and maximum freshness
   are still unselected. No client timestamp, query parameter or arbitrary
   SQL-role GUC may authorize it.
2. **Serialize and stage only non-spendable values:** under Player/Hunt/
   resource locks, recheck the original key **or first bind the new
   correlation** with its immutable command kind/intent and independently
   guarded acceptance-time sample. For selected A, verify **both** original
   R/J pending rows, their frozen Player/source/advancement relationship
   and correct first-applicable R before any R-help stage; an existing
   key's receipt is not refreshed. In the new-key branch, freeze original
   `acceptedAt`, lease/expiry and any stage-relevant target exactly once:
   the acceptance receipt is provisional until the winning transaction
   commits. A first-request transaction that also completes may require a
   **different later guarded completion sample** (§13.5); never backdate
   completion to acceptance, or refresh an old key's lease on continuation.
   Then recheck the no-earlier-heal blocker, the global pending-retreat
   same-T point-effect admission fence from §§13.1/14.1, current protected
   heads and relevant policy/Inventory versions. A
   SQL-verifiable scoped Worker capability can authorize **only** an exact
   candidate stage that creates no visible reward, debit, capture, HP
   change, live checkpoint/highwater, transport terminal or published
   history. The staging representation, if persisted at all, must be
   unmistakably unspendable and incapable of satisfying a legacy reader.
   Any stage containing private RNG/Genetics/source bytes must inherit the
   **H-05 account-private read boundary**, rather than becoming a
   cross-Player SELECT backdoor via a shared work queue or definer result.
   A stolen ordinary SQL role may at worst interrupt/occupy such a stage,
   not convert it into live gameplay by committing the staging function.
   If first acceptance and its first effect are in the **same** transaction,
   a failed late completion guard rolls back **both** the provisional
   command and the effect: there is no previously durable key for which
   that failed transaction may invent an original-key `410`.
3. **Freeze the actual decision boundary:** after *all* potentially
   blocking preconditions, collect the exact microsecond SQL decision
   sample, compare it to the original lease (**both original R/J leases
   for selected A**) and authenticated monotone
   Player floor, and verify the H-02 witness is fresh/compatible **at this
   point**. The sample must come from the guarded database operation,
   not a caller-provided earlier `decisionNow`; final authorization binds
   its exact canonical PostgreSQL microseconds. A stale or materially
   uncertain witness, changed head,
   expired key or earlier due blocker discards the stage without a live
   effect. No network time/signing call, subsequent blocking SQL lock or
   unbounded replay is permitted after this boundary. A later final
   eligibility check may conservatively abort if the lease/witness became
   invalid; it cannot fabricate an earlier valid timestamp. **Do not
   assume** that ordinary row locks suffice to eliminate every implicit
   wait: unique-index conflicts, foreign-key checks, trigger-induced DML
   and resource-row insertion can still block. The final SQL design must
   prove those paths cannot delay the decision irreversibly, or treat a
   delay/stale witness as an abort and retry the same original command
   from fresh authority outside the transaction. It may not simply retain
   a pre-wait signed timestamp as a new post-wait decision.
4. **Authorize the exact final bundle:** locally within the bounded open
   transaction, the trusted Worker examines *actual staged/locked canonical
   values*, computes the historical MAC for the intended final immutable
   receipt, and issues a **separate SQL-verifiable final-apply permission**
   covering the exact original command, stage digest, before/after
   resource versions, decision sample, source/effect bytes, historical
   authenticator and allowed transport disposition. A value only
   discoverable from a **live** side-effect cannot be asserted to have
   been pre-signed: derive it from non-spendable staging or reject that
   implementation. A valid first-phase token is **not** a final-apply
   capability. For selected A, the one final permission binds original
   R and J identities/intents/leases, stage digest/expected source head,
   decision sample, one-use nonce and the **entire R-only original retreat
   result plus recovery/cancellation/private/public proof bundle**; it
   cannot authorize J's later separate result or any generic Hunt update.
5. **One atomic guarded final apply or no effect:** SQL independently
   verifies the final permission, Player/source binding, genuine stage,
   the still-winning global R/heal precedence where relevant, one-use
   expected head/nonce, exact decision/freshness predicates and
   canonical actual-result equality. For selected A, this means one fresh
   H-02/H-03 decision over **both** original executable R/J correlations,
   matching frozen Hunt/targets, and **one** exact R terminal winner;
   a zero-row loser cannot invent J's own `200` or an R `409`. In one
   transaction it writes the
   authoritative checkpoint/resources/command result, immutable original
   effect and public/private proof, and the authenticated next heads,
   checking each winning row; any failed check rolls **all** back. Direct
   table DML, independently committable live-stage helpers and generic
   definer invocations remain denied. A stolen credential presenting a
   **genuine intercepted final token** may only win the **same complete
   originally authorized transition and receipt once**; a later honest
   Worker invocation must return that authenticated original winner,
   not apply a new reward or sign a second history. The final permission
   itself has an independently checked *maximum age/freshness and original
   pending-lease bound*: its old signed `decisionNow<E` is **not** enough
   when an attacker withholds it until `SQL-now>=E`, after the H-02
   witness ceases to cover the decision, or after a new authoritative
   terminal/crossing has won. The guard must verify stage/final-token
   age, independently authenticated witness bounds, the authenticated
   floor and the original lease (**both R/J original pending leases for
   selected A**) **again at final apply**, against its
   freshly produced SQL-microsecond sample; it must not accept an old
   caller-selected timestamp or extend the lease. In those cases the
   guard denies a new live
   effect. An **already durably committed** terminal/crossing is a distinct
   exact-key replay path and retains its originally signed decision time;
   it is not re-executed through the stale final token.

**Selected-A two-sample temporal proof lemma (to demonstrate, not an
approved clock or SQL implementation):** distinguish the exact signed
decision point `t1` from an independently sampled **final freshness veto**
`t2`. Collapsing both into an earlier client-chosen `now`, or claiming
that one represents PostgreSQL's unobservable COMMIT UTC, is invalid:

1. Before the transaction obtains Player/Hunt locks, obtain the independent
   H-02 witness with authenticated uncertainty/freshness; no Worker-local
   clock or arbitrary SQL GUC can substitute. Verify and freeze R/J's
   *original* immutable accepted identities and scopes, not their newest
   mutable public DTOs.
2. Acquire every necessary Player, Hunt, checkpoint, command, resource,
   original queue/index and possible FK/unique/trigger prerequisite lock;
   resolve older due work only in a separately valid bounded invocation.
   In the chosen R-help invocation, stage merely a non-spendable exact
   candidate. If any needed data, timestamp or presentation disposition
   is knowable only from an effectful future UPDATE, this proof attempt
   must **not** silently create that UPDATE before authorization.
3. Sample `t1` from a guarded SQL decision **after those waits** and
   authenticate it against the monotone floor, H-02 witness, both original
   `E_R`/`E_J` and exact R/J pending states. The trusted Worker locally
   computes/signs the canonical full original R receipt and narrow H-03
   final permission referencing `t1`, accepted R/J contexts, one-use
   stage/nonce, pre-head and proposed post-head. Bound both CPU **and
   elapsed wall time** of this in-transaction operation, including Worker
   suspension; no network clock/remote signer while holding those locks.
4. At **final apply**, SQL must independently sample `t2` and revalidate
   *both* leases, H-02 witness uncertainty/freshness, permission age,
   original canonical rows, first applicable R, earliest U/I/B blockers,
   terminal/crossing absence, stage/nonce/head and actual expected result.
   `t2` is a **conservative deny/freshness check**, never an unsanctioned
   replacement for the signed R `terminalAt=t1`. If a signable exact
   receipt would instead require `t2` as its original result timestamp,
   the proof must reissue exact authority under a separately established
   bounded protocol or fail closed; do not invent a MAC for unknown bytes.
5. In one guarded winning transaction, make exactly the permitted original
   R live terminal/result/authorized private+presentation receipt visible;
   the historical MAC and post-head are inseparable from the spendable
   effect. A zero-row CAS or failed guard rolls back the entire tentative
   invocation. An intercepted genuine final capability may install only
   this **same complete transition once**. A legitimate R or different
   helper winning first is replayed, not rewritten. An already committed
   prior `202`/heal is not an uncommitted speculative effect.

**The hidden-wait and generated-value veto remains open.** A valid `t2`
sample is not sufficient if a trigger, FK lookup, unique-index insertion,
lock upgrade, Worker scheduling pause or another SQL statement can delay
the actual first spendable update beyond either E without a *new*
eligibility decision. A later check may only **deny** an old capability;
it cannot pretend the late first effect used `t1`. Separately, the exact
SPEC-017 terminal presentation `statement_timestamp()` need not be
known at `t1`, while the original R recovery is derived from a different
checkpoint clock (§14.1). Unless the chosen SQL design can produce the
**actual** permitted presentation/domain timestamps and sealed/unavailable
branch from authenticated non-spendable evidence or a separately proven
bounded signed derivation **before spendable commit**, the selected A
construction **fails its Class-A H-03 proof**. No unapproved timestamp
substitution or retrospective MAC is authorized as a workaround.

**Corresponding adversarial fixture, pending:** freeze `t1=E_R−100ms`
with J still live, stall on each of unique/FK/trigger/scheduling delays
until `t2>=E_R`, and repeat with `E_J`, stale/unavailable H-02 witness,
and a genuine intercepted stage/final permission. Neither original R
nor J may acquire a new spendable consequence from the stalled attempt;
previously committed independent heal/`202` effects persist. Repeat with
`t1<t2<E_R,E_J` but *different* actual source clocks (logical Hunt anchor,
`transaction_timestamp()`, terminal `statement_timestamp()`, R transport
result time) and verify byte-exact signed receipt and appropriate retained
clock fields. Fail the test if the implementation signs the staged
presentation timestamp but persists a different unsigned final-statement
timestamp, marks R terminal before H-03 permission, or returns an R
success after any zero-row losing write.

**Non-circularity obligation:** the final permission must authenticate
exactly the *same* decision time and effect/receipt bundle that SQL
permits to become live. It must not require a fresh network witness after
locks are held, or a historical MAC computed only *after* an independently
committable spendable effect. The accepted Class-A implementation must
identify its single point of authority, distinguish a fresh exact-key
lease decision from PostgreSQL's unknowable commit UTC, and bound the
Worker's in-transaction canonicalization/signing **CPU and elapsed
wall time**, including process suspension or delayed scheduling while
locks are held; a CPU-only cap does not constrain witness/token age.
If the genuine
capability can be committed without its accompanying historical receipt,
or the late-clock guard cannot be made consistent with the pre-write
authorization, the selected H-02/H-03 guarantees are **unproved** and v4
must remain disabled. This candidate does **not** assume a stock PostgreSQL
asymmetric verifier, choose a key algorithm or grant a public SQL API.

**Adversarial proof matrix (not run):** unbound first Start with
acceptance and completion in the same transaction (different guarded
samples), expired-after-acceptance rollback with **no** invented key/`410`,
previously committed `202` plus unchanged original lease; stolen writer
calls stage then
COMMIT; stolen writer presents a copied valid stage token to final-apply;
stolen writer replays a complete valid final token after the first winner;
Worker crashes after stage but before signature; Worker crashes after
final commit before HTTP reply; checkpoint, Inventory or healing blocker
changes before the locked stage; command expires at E exactly or the H-02
witness expires between staging and final authorization; a **genuine
final token intentionally held past E/freshness with unchanged head** is
rejected; an unexpected
trigger changes actual quantity/version; and a legacy writer tries an
unprotected mutation during v4 adoption. Each must yield an intact
authenticated **single** original result or no new spendable state, with
bounded rollback/retry, real SQL winning-row evidence and no leaked
unreceipted effect.

### 14.10 PostgreSQL temporal counterexample for the unapproved H-02/H-03 candidate

**Observed in a disposable PostgreSQL 17 instance, not in the deployed game:**
the following isolated SQL probe exercised two properties that a final
authorization design must address. The instance used a unique, labeled
`postgres:17-alpine` Docker container with a temporary data directory, no
published network port and no application migration. Its own container was
identity/label-verified and removed after the experiment. No production source,
database or original Hunt was modified.

1. A terminal `UPDATE` evaluated `clock_timestamp() < expires_at` while
   the original one-second lease was valid. A `BEFORE UPDATE` trigger then
   slept for 1.5 seconds before the row's first effective write. The statement
   nevertheless committed: `effect_after_expiry=true`,
   `statement_stamp_before_effect=true` and
   `statement_stamp_differs_from_prior_t1=true`. A fresh condition in the
   `WHERE` clause **by itself** does not prove that no later trigger or other
   blocking prerequisite can delay the spendable mutation past the lease.
   This is an ordering witness, **not** proof of a v3 vulnerability or proof
   that every valid t1 linearization must happen at physical row-write time.
2. A separate non-expired terminal `UPDATE`, with a deliberate 100-ms delay
   between freezing `t1` and issuing that statement, committed before its
   20-second lease, but its genuine `statement_timestamp()` differed from
   the earlier `clock_timestamp()` value. Thus a Worker MAC over the **exact
   earlier timestamp** cannot authenticate that later, independently sampled
   SPEC-017 presentation timestamp merely by asserting that the two clocks
   were close or that the command eventually committed.

The essential reproducible SQL shape was:

```sql
CREATE TEMP TABLE temporal_probe (
  id integer PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  decision_t1 timestamptz NOT NULL,
  presentation_stamp timestamptz,
  actual_spend_at timestamptz,
  terminal boolean NOT NULL DEFAULT false
);
CREATE FUNCTION pg_temp.delay_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = 1 THEN PERFORM pg_sleep(1.5); END IF;
  NEW.actual_spend_at := clock_timestamp();
  RETURN NEW;
END
$$;
CREATE TRIGGER delayed_write BEFORE UPDATE OF terminal ON temporal_probe
  FOR EACH ROW EXECUTE FUNCTION pg_temp.delay_write();

BEGIN;
INSERT INTO temporal_probe (id, expires_at, decision_t1)
VALUES (1, clock_timestamp() + interval '1 second', clock_timestamp());
UPDATE temporal_probe
   SET terminal = true, presentation_stamp = statement_timestamp()
 WHERE id = 1 AND clock_timestamp() < expires_at;
COMMIT;
SELECT actual_spend_at >= expires_at AS effect_after_expiry,
       presentation_stamp < actual_spend_at AS stamp_before_effect,
       presentation_stamp <> decision_t1 AS prior_t1_mismatch
  FROM temporal_probe WHERE id = 1;

BEGIN;
INSERT INTO temporal_probe (id, expires_at, decision_t1)
VALUES (2, clock_timestamp() + interval '20 seconds', clock_timestamp());
SELECT pg_sleep(0.10);
UPDATE temporal_probe
   SET terminal = true, presentation_stamp = statement_timestamp()
 WHERE id = 2 AND clock_timestamp() < expires_at;
COMMIT;
SELECT presentation_stamp <> decision_t1 AS exact_receipt_t1_mismatch,
       actual_spend_at < expires_at AS effect_before_expiry
  FROM temporal_probe WHERE id = 2;
```

**Consequence for the proposed protocol, still OPEN:** §14.9's
`t1`/`t2` design must identify an actual SQL-enforced linearization point
and prove that every subsequent prerequisite capable of blocking or deriving
a different winning value is either completed before its authoritative time
check, is covered by a later veto with no unsigned spendable intermediate
state, or is made impossible by a reviewed SQL privilege/trigger/lock shape.
An accepted design must separately reconcile a pre-write Worker permission
and a historical MAC with the **actual** terminal presentation
`statement_timestamp()`, transport receipt time, terminal logical anchor,
and signed sealed/unavailable branch. A post-commit Worker signature, a
caller-controlled `now`, a fabricated prior timestamp, or a stage that the
ordinary SQL credential can commit as live without a complete authenticated
receipt does not close this obligation.

This counterexample does **not** choose an H-02 time issuer, uncertainty
bound, signature verifier, privilege grants, terminal SQL function or new
timestamp semantics; it is not an end-to-end H-02/H-03 authorization test.
Possible designs that redefine the legitimate decision point or use a
different exact-result signing mechanism require independent security/
persistence review and, wherever they change SPEC-015/SPEC-017, separate
Human Class-A acceptance. Until a complete adversarial PostgreSQL fixture
proves the selected authority and time contract, v4 remains blocked.

### 14.11 H-02 independent time-witness transport feasibility — no provider selected

The following implementation constraints are grounded in public provider and
protocol documentation; none of them appoints an issuer, establishes a
production error tolerance or approves a new service:

1. Cloudflare's published Roughtime endpoint
   (`roughtime.cloudflare.com:2003`) accepts **UDP** and is documented as
   beta, including a potentially changing root public key
   ([Cloudflare Roughtime usage](https://developers.cloudflare.com/time-services/roughtime/usage/)).
   The current documented Worker outbound interfaces are HTTP(S) `fetch`
   and TCP sockets, **not direct outbound UDP**
   ([Cloudflare Worker protocols](https://developers.cloudflare.com/workers/reference/protocols/)).
   A Worker cannot be assumed to fetch a raw signed Roughtime datagram from
   that UDP endpoint. Any HTTPS witness bridge/relay would itself become a
   separately authenticated, operated and failure-tested component; merely
   wrapping an unsigned timestamp in HTTPS is not an H-02 signed-time proof.
2. Roughtime's signed `MIDP` (microsecond midpoint) and `RADI` (microsecond
   uncertainty radius) represent an **interval**, not the exact
   `statement_timestamp()`, `clock_timestamp()` or PostgreSQL commit time.
   Its protocol defines time using **UTC with a 24-hour linear leap-second
   smear** ([Roughtime protocol](https://roughtime.googlesource.com/roughtime/+/HEAD/PROTOCOL.md)).
   An H-02 verifier must define a reviewed comparison of signed intervals,
   request/response delay, monotonic elapsed time and PostgreSQL's chosen
   transport UTC representation, including leap-smear windows. It may not
   silently substitute the smeared midpoint for an exact accepted 30-day
   expiry, the SPEC-017 terminal presentation stamp, or a Worker-generated
   SQL microsecond value.
3. PostgreSQL 17 provides `statement_timeout`, per-lock `lock_timeout`
   and `transaction_timeout`
   ([PostgreSQL 17 client-connection defaults](https://www.postgresql.org/docs/17/runtime-config-client.html)).
   Those facilities can bound some waits only after the exact deployment
   configuration, role/GUC mutation rights, implicit waits and abort semantics
   are tested. They do **not** supply an independent authenticated clock.
   A user-settable timeout or a preceding `t1` sample does not prove that the
   later SQL guard ran within the original command lease.

For a proposed HTTPS witness bridge, the pre-acceptance evidence must include
fresh nonce-to-response binding; verifiable signer identity, delegation and
key rotation; retained raw signed interval/uncertainty; end-to-end delay
measurement and bounded verifier age; cross-Worker/restart/replay behavior;
issuer outage, leap-smear and contradictory-clock tests; and a precise
fail-closed **time-uncertain** disposition that cannot be confused with an
already valid original-key `410` or previously committed `202`/heal.
Selection of that bridge, any numerical threshold or any alteration of
accepted SPEC-015/SPEC-017 time semantics remains a separate Class-A gate.

### 14.12 Transactional exact-result sealing — narrowed H-03 candidate, not approved

**Candidate to review, not a relaxation of selected H-03:** a database-enforced
commit barrier may remove the *generated-value* circularity of §14.9 without
inventing a future `statement_timestamp()`. The decisive distinction is
between an **already SQL-authorized but still uncommitted** protected
transition and an **independently committable, unsigned** one. This does not
itself solve H-02's late time-of-authority proof.

1. A trusted Worker prepares a scoped, one-use **pre-write** capability for
   the exact original command(s), authenticated predecessor, selected
   operation, source/effect constraints, canonical expected post-state and
   permitted *SQL-derived* fields. A narrowly granted SQL entrypoint
   independently verifies this capability **before** its first protected
   UPDATE. A stolen ordinary SQL credential with no genuine capability
   cannot reach that UPDATE. Any field that can change the economic outcome
   must already be bounded by the authenticated intent; a later Worker MAC
   cannot retroactively legitimize a free-form reward.
2. Under the *same still-open transaction*, SQL effects the guarded,
   winning terminal/source mutation and captures **the actual**
   presentation `statement_timestamp()`, accepted command/result clock,
   original logical recovery anchor, actual winning row versions and
   terminal sealed/unavailable choice. An apparent terminal row at this
   point is **uncommitted** and must have no out-of-transaction consumer.
   The first terminalization-statement timing and the distinct SPEC-017
   presentation stamp must be reconciled exactly, not renamed into `t1`.
3. The Worker reads the actual bounded `RETURNING` result, checks the
   pre-authorized input/result relation and makes its **historical MAC using
   a key never present in PostgreSQL**. Separately, it issues a *SQL-
   verifiable final-seal authorization* binding the digest of that actual
   result **and the historical MAC bytes**, both original correlations for
   selected A, pre-write capability, one-use nonce, expected source heads
   and final public/private disposition. SQL verifies the final-seal
   authorization without gaining the historical MAC secret. A PostgreSQL
   checker that merely sees opaque MAC bytes but cannot authenticate
   the separate final-seal authorization does **not** satisfy H-03.
4. A mandatory commit-time constraint/guard on **every protected effect**
   verifies the matching complete final seal and the actual winning rows.
   No ordinary runtime SQL role may modify a protected table directly,
   disable that guard, set a trigger-disabling replication role, alter the
   authenticated receipt, change roles or invoke an alternate unguarded
   definer function. A caller committing after stage but before final
   Worker authorization must receive an error and roll back **all** effects.
   `SET CONSTRAINTS ALL IMMEDIATE` may force that error earlier; it must
   never count as a successful bypass. A legitimate commit includes the
   exactly matching original command and private/public/Inventory/HP
   receipts in one atomic visibility boundary.
5. A pre-authorization capability intercepted **without** the matching
   post-write final seal can therefore at most hold locks or cause rollback;
   it cannot produce a consummated unreceipted effect. A fully intercepted
   *matching* pre-write/final-seal pair must be constrained to the single
   exact already-authorized transition, with source OCC, nonce/receipt
   one-use semantics and exact-key replay. Worker crash, SQL disconnect,
   commit failure and original-key retry must remain non-rerollable.

**Disposable PostgreSQL 17 structural probe, PASS — deliberately not a
production-signature or game-conformance test.** A table-owner-only
`SECURITY DEFINER` stage function checked a demo authorization token before
writing a terminal row with actual `statement_timestamp()`. A separate
restricted function accepted an exact-result demo proof. A
`CREATE CONSTRAINT TRIGGER ... AFTER UPDATE OF terminal DEFERRABLE
INITIALLY DEFERRED` checked the **current** terminal row and proof when
the transaction attempted to commit. The separate `seal_app` SQL LOGIN
had no table DML, key read, trigger ownership, unrestricted signing helper
or trigger-bypass privilege. The isolated fixture asserted:

| Fixture | Observed PostgreSQL 17 result |
|---|---|
| Pre-authorized stage, exact post-write receipt, commit | **PASS:** exactly one intended terminal row persisted. |
| Ordinary SQL role with genuine stage token, commit without receipt | **DENIED:** deferred guard aborted the complete transaction. |
| Genuine stage, then `SET CONSTRAINTS ALL IMMEDIATE` without receipt | **DENIED:** pending check fired early and the transaction aborted. |
| Genuine stage plus forged receipt | **DENIED:** receipt verifier rejected before commit. |
| Genuine stage plus another row's previously valid receipt | **DENIED:** exact-row verifier rejected; no effect persisted. |
| Ordinary SQL role attempts direct table UPDATE, signing-key SELECT, receipt-mint function, trigger disable or `session_replication_role=replica` | **DENIED:** each lacked the necessary privilege. |

These tests establish **only a possible commit-barrier mechanism**, not
the required public-key SQL verifier or separation of historical signing
authority. The demonstration used locally held **database HMAC secrets** to
simulate both authorization and proof; that secret arrangement **fails
the selected Worker-only historical-key requirement** and is **not**
admissible v4 key management. A Class-A proposal must replace it with a
reviewed public-verification primitive, protected Worker-only secrets,
canonical exact-byte encodings, restricted `SECURITY DEFINER` search paths,
full role grants, no alternative legacy spend path and receipt provenance
for **all** Player/Hunt effects, not merely one terminal row. PostgreSQL
documents both deferred constraint-trigger timing and the retroactive
effect of `SET CONSTRAINTS ... IMMEDIATE`
([CREATE TRIGGER](https://www.postgresql.org/docs/17/sql-createtrigger.html),
[SET CONSTRAINTS](https://www.postgresql.org/docs/17/sql-set-constraints.html));
the experiment supplies only the narrower observations above.

**Separate temporal falsification, also reproduced in isolated PostgreSQL
17:** a deferred trigger named `a_freshness` checked
`clock_timestamp() < expiry` successfully. A second deferred trigger
`z_delayed_constraint` then slept 1.5 seconds beyond the same expiry;
the transaction nevertheless committed. Thus `DEFERRABLE INITIALLY
DEFERRED` does **not** by itself mean the lease check ran *after every
subsequent potentially blocking trigger or commit prerequisite*. The
authority boundary still needs a separately established, SQL-enforced,
H-02-witness-compatible last eligible decision, with no unproved later
wait; merely adding a deferred freshness predicate cannot establish it.
Nor does a speculative update's genuine `statement_timestamp()`
constitute PostgreSQL's unobservable exact COMMIT UTC.

**Decision status:** the transaction-seal mechanism merits independent
security/SQL feasibility review as a candidate alternative to signing
unavailable future SQL values. It is **not** a resolution of H-02, a
selection of H-03 cryptographic implementation, a Class-A amendment to
SPEC-015/SPEC-017, authority to change TASK-103, or acceptance of v4.
Required further proofs include an actual trusted Worker + separate SQL
LOGIN across a crash/retry, adversarial intercepted complete token pair,
time-expired late commit, all-statement/trigger/implicit-lock ordering,
every protected table's commit barrier, signature and key rotation,
equivalent public/private bytes including unavailable branches, and
bounded transaction contention/elapsed wall time.

### 14.13 First protected decision versus later COMMIT — serialized race witness, Class-A question open

**PostgreSQL 17 disposable concurrency probe, observed; not a v4
authorization test.** A committed pending row first received a two-stage
setup: its original expiry was stored, and then a separate transaction
performed an `UPDATE ... WHERE terminal=false AND
clock_timestamp()<expires_at`, recording its own `decision_at` and holding
the row lock for a 5-second `pg_sleep` before `COMMIT`. A second database
connection started **before that same expiry**, attempted the same
`UPDATE` against the committed original expiry, and was observed by
`pg_stat_activity.wait_event_type='Lock'` to block on the first
transaction. The first connection separately proved that the lease had
expired **before** issuing its `COMMIT`; its original, earlier decision
subsequently persisted. When the second connection resumed, its
`UPDATE` affected **zero** rows; it observed the original first winner,
not a second terminal. Both isolated transactions completed normally and
the uniquely labeled disposable database was removed.

This demonstrates **only** that row serialization and PostgreSQL's
recheck can yield exactly one persisted winner where the first guarded
decision predates expiry but its durable commit follows expiry. It does
not establish an authenticated H-02 clock, safe one-time H-03 signing,
bounded hidden waits, exact multiple-resource effects, real Hunt
conformance, or which temporal definition SPEC-015 has approved.

**Class-A semantic fork requiring explicit reconciliation, not an
implementation selection:**

- If the authoritative *logical* time of an effect is the first
  SQL-enforced, Player-serialized and independently H-02-authenticated
  decision point `T<E`, then a later COMMIT may make that already-
  decided outcome visible **after** `E`, but may not create a new
  decision, refresh the original lease or change the original signed
  timestamp. The system must prove that no competing `410`, crossing,
  newer Hunt, heal or other Player effect can establish a contradictory
  winner while the original transaction remains pending, and that the
  eventually committed result/receipt represents exactly `T`.
- If accepted SPEC-015 §4.3's phrase *"At/after that deadline it is no
  longer executable ... no uncommitted final consequence may run"*
  requires a **durable COMMIT no later than E**, row serialization alone
  does not satisfy it. A valid pre-expiry `WHERE`, a fresh last deferred
  trigger and an earlier token do not prove COMMIT occurred before the
  deadline when further scheduling, synchronous durability, WAL or other
  internal waits are unbounded. The protocol must instead prove its
  chosen bounded commit-admission semantics, fail closed when it cannot,
  or obtain explicit Class-A authority for a different linearization
  definition; it may not simply backdate a post-E action.

Neither branch permits an expired new key to be treated as freshly
accepted, a partial unreceipted effect to commit, or a pending original
correlation to acquire a fabricated durable `200`, `409` or `410`.
Under selected A, both original R and J expiry/identity checks and their
separate outcomes still require proof. The already committed `202`
segments and separately due domain heals are not rolled back by a
subsequent expiry. The experiment does **not** choose either branch.

**SPEC-017 timestamp provenance — original counterexample and current
TASK-103 source status (source inspection only):** the accepted SPEC-017
§5 defines the presentation retention anchor using the **first
terminalization statement's** `statement_timestamp()` within the
winning terminal transaction, distinct from the Hunt's logical-time
recovery anchor and the separate command transport clock. An earlier
TASK-103 implementation first updated `pokenexus.solo_hunts`, then
generated a *new* `statement_timestamp()` in a subsequent
presentation sealing statement. Two such statements need not have
the same timestamp: an isolated disposable PostgreSQL 17 probe with
a 120-ms gap observed approximately 122 ms of separation.

The **currently inspected worktree source** instead returns the exact
six-fractional-digit UTC `statement_timestamp()` from the winning
`solo_hunts UPDATE ... RETURNING`
(`packages/database/src/hunt-orchestration-repository.ts:830-854`).
The application forwards its
`presentationTerminalRecordedAt` through four first-terminal call
sites (`apps/api/src/hunts/application.ts:2365-2366,3331-3332,
3400-3401,3506-3507`); the presentation repository sets
`presentation_terminal_recorded_at=$3::timestamptz` from that frozen
value rather than generating a new clock
(`packages/database/src/hunt-presentation-repository.ts:904-910`).
The integration-test **source** now contains a disposable trigger
that delays the terminal statement by 225 ms, checks
`drift_us='0'` against the resulting stream in SQL microseconds and
asserts stable exact-key retreat replay
(`apps/api/integration/hunt-application-postgresql.test.ts:1265-1331`).
These statements are a review of source at this document's current
working state, **not** a claim that the updated test was run or
independently accepted in this Class-A review.

**Earlier, pre-correction HuntApplication reproduction (historical
counterexample; not the current source behavior):** a one-off *copy* of
`apps/api/integration/hunt-application-postgresql.test.ts` ran the
existing real `app.start → app.retreat` presentation-enabled test against
its own disposable PostgreSQL 17 database. A test-only `AFTER UPDATE OF
terminal_at` trigger on `pokenexus.solo_hunts` recorded
`statement_timestamp()` from the first authoritative terminal UPDATE,
then waited 225 ms. A SQL-side microsecond comparison of that recorded
instant with the subsequently persisted
`presentation_terminal_recorded_at` found **239,549 µs difference**.
The targeted original integration scenario, with the extra forensic
assertion, passed **1/1**; the other 37 tests in the copied file were
skipped by the focused test filter. Its unique temporary source file and
identity-verified ephemeral container were removed. No TASK-103 original
source or persistent database was edited. This proves the earlier
two-statement-clock application design **could** disagree, rather
than establishing a defect in the source now inspected. It does not
establish a production latency distribution or independently validate
the subsequent source correction.

The source-current approach matches the original review candidate:
capture the actual first-terminal `statement_timestamp()` using the
winning `solo_hunts UPDATE ... RETURNING`, then write that frozen
value into presentation in the **same transaction**. Independent QA
must still verify every supported terminal reason, first-only
sealing, source-unavailable disposition, rollback, lossless codec,
replay and terminal-retention behavior. Never substitute
`solo_hunts.terminal_at` (logical gameplay anchor), the transport
decision time or PostgreSQL's unobservable exact COMMIT UTC.

**Narrow TASK-103 QA handoff, still open:** the current source has the
six-digit UTC text propagation and an actual-application retreat
regression described above. Independently inspect and execute the
relevant focused tests on owned disposable PostgreSQL, including
terminal causes besides explicit retreat, first-only seal and
unavailable branch, cross-Worker retry/crash, rollback and exact
SQL-side microsecond equality across delayed statements. No
JavaScript `Date` millisecond round-trip may silently truncate the
timestamp. Do **not** treat code presence or this DRAFT's
source-only comparison as a replacement for the assigned TASK-103
owner/independent QA acceptance, or as authority to enable the
public feed.

**Lossless propagation proof, independent of the application's code
(disposable PostgreSQL 17):** a one-row
`UPDATE ... RETURNING to_char(statement_timestamp() AT TIME ZONE 'UTC',
'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` produced a six-fractional-digit timestamp
from the *first* terminal statement. Reusing that exact UTC value as a
`timestamptz` parameter in a later stream UPDATE, separated by an
intentional 240-ms wait **in the same transaction**, retained exact
microsecond equality. The actual second-statement clock was 242,797 µs
later in this isolated run; it was not substituted for the original
retention anchor. Separate SQL assertions passed for (i) exact
first-statement stamp plus unchanged logical gameplay stop,
(ii) rollback of both terminal and presentation, (iii) zero-update
duplicate replay preserving the first stamp, and (iv) an unavailable
terminal projection using the same first-statement stamp. The read-side
`CEIL(EXTRACT(EPOCH FROM presentation_terminal_recorded_at) * 1000)`
remained computable from the exact retained value without a JavaScript
`Date` round-trip. The fixture used only synthetic tables, not the
game's authoritative schema, so it validates a **lossless SQL transport
primitive**, not the four real call paths, SQL ownership/serialization,
retained-source rules or a completed TASK-103 fix.

The owner-facing regression uses **SQL-side microsecond equality**
for the source and destination stamps: a JavaScript `Date` comparison
alone could falsely hide a sub-millisecond mismatch. Where
`terminalizeSoloHuntInTransaction` finds an *already terminal* Hunt,
the caller must preserve the originally frozen statement stamp rather
than minting a replacement; no unrelated/public command may re-anchor
it. The original `202` progress and terminal-result/tombstone windows
remain independent from the presentation 30-day clock.

**Class-A transport-expiry decision card — compare, do not implement.**
The §14.13 probe establishes that PostgreSQL may durably commit an
*earlier guarded* decision **after** its original lease expiry; the
probe does **not** establish either interpretation as compliant with
the accepted SPEC-015 §4.3. For any variant, E is the original
`acceptedAt + 30 days` of **each** participating R/J correlation;
SQL uses exact microsecond precision and H-02 authenticates the
independent clock-health bound. A separately accepted scheduled
healing-domain obligation remains distinct from expiry of its
public key.

| Candidate Class-A meaning of `executable until E` | What must be normatively accepted and independently proved | What would fail this candidate |
|---|---|---|
| **T1 — serialized authoritative decision before E; durable COMMIT may follow E** | Explicitly amend/reconcile SPEC-015 §4.3 to define the SQL-enforced, Player-serialized, H-02-authenticated *winning decision point*, not the later visibility point, as the moment the accepted operation is executed. Both R/J original leases must be live at that **one** decision; lock/head and earlier-due/terminal/crossing predicates must have already been authoritatively decided. The transaction must retain the original decision clock, exactly matching immutable result/proof, and block any competing `410`, `409` or newer-Hunt winner while that transaction is unresolved. Demonstrate bounded lock/transaction duration, legitimate client retry after delayed commit, crash, rollback and progress continuity; apply the conservative fail-closed policy whenever H-02 freshness or H-03 sealing cannot be proved. | An independently committed conflicting expiry/result while an earlier winning transaction is uncommitted; a new protected SQL decision at/after E using an old token; changed R/J lease, renewed acceptedAt, post-E invented `200/409`, absent authenticated final receipt, or a runtime role able to publish partial effects. |
| **T2 — durable COMMIT must complete by E** | Retain a literal *no uncommitted final consequence at/after E* interpretation. Independently demonstrate a complete PostgreSQL/Worker protocol that makes it impossible to durably commit the original effect after E, including deferred triggers, FK/unique/index waits, WAL/durability scheduling and post-guard stalls. A merely fresh pre-COMMIT `clock_timestamp()`, `statement_timeout` or H-03 token **cannot** prove this property; if the deployed database cannot enforce/prove the cutoff, reject/fail closed rather than claim T2. Obtain explicit acceptance of any availability impact from aborting near-expiry work. | Any successful post-E durable COMMIT of a newly uncommitted effect, even when its pre-write predicate and H-03 proof were valid before E; an alleged exact COMMIT UTC inferred from `transaction_timestamp()`, `statement_timestamp()` or a Worker clock. |

**Technical proposal for Human review, not a selection:** investigate
**T1** first because the observed PostgreSQL serialized first-winner
behavior admits an independently testable one-decision model, whereas
the current T2 candidate has no demonstrated reliable way to fence all
unknown *post-guard* commit waits. T1 is nevertheless **not** a trivial
or automatically backward-compatible choice: SPEC-015's current words
may require T2, and T1 still needs H-02 time-witness freshness, a
non-forkable SQL decision/receipt, exact protected effect provenance,
bounded outstanding transaction behavior, and GSC/security/architecture
review. Neither is approved. Do not change v1/v2/v3 expiry semantics
implicitly, impose a finite product limit on accepted gameplay or
represent indefinite lock ownership as a bounded-progress guarantee.

**Decision-specific disposable negative acceptance cases, NOT run
for v4:** (i) R and J at E−1µs, exactly E and E+1µs; (ii) T1 stage
or H-03 permission issued at E−1µs but *first authoritative SQL
decision* at E+1µs; (iii) actual first decision E−1µs followed by
commit E+1µs and concurrent exact-key expiry lookup, independent K
crossing, no-living terminal and new Hunt Start; (iv) rollback
after a provisional E+1µs observation followed by DB clock regression;
(v) intercepted pre-write capability followed by last deferred
trigger/foreign-key wait, omitted final historical seal or mismatched
SQL-generated result; (vi) R authentic `200` already committed while
J expires before its own terminal `200`, verifying stable R and
original-key J `410`; (vii) six-digit-microsecond original terminal
statement stamp versus later presentation seal with deliberate SQL
delay. Compare exact SQL winning rows, public status and complete
private/public proof under both normal and stolen restricted credentials;
verify that `404/409/410/503` follow the accepted *original*
correlation status rather than an invented timestamp or changed
gameplay phase. An **isolated SQL race demonstration** is evidence for
the feasibility of a temporal primitive, **not** passage of this
complete H-01/A + H-02/H-03 gate.
