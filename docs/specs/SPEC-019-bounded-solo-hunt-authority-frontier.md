# SPEC-019 — Bounded Solo Hunt Authority Frontier and Historical Proof

- Status: **DRAFT — not approved; no implementation authority**
- Change class: **A** — changes the accepted checkpoint/storage strategy and its security/integrity boundary.
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Related specs: SPEC-015 (gameplay/commands), SPEC-017 (presentation ledger), SPEC-002/003/011/013 (retained version and authority rules)
- Related ADRs: ADR-004/005/006
- Related tasks: TASK-037/038/103; implementation task **not yet assigned or made READY**.

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
5. Keep SPEC-015 gameplay and SPEC-017's externally observable public contract unchanged.

## 3. Non-goals and fixed boundaries

- **No reinterpretation of existing strict v1/v2/v3 checkpoint bytes** or `hunt-runtime-inputs-v1/v2`.
  Existing v1–v3 readers/writers preserve their prior canonical semantics and full replay.
- No deletion or silent truncation of old Encounter stimuli, healing, reward/capture
  evidence or original CombatEvents. No backfill from current Collection/Team.
- No changed encounter selection, move/ability outcomes, RNG, capture, reward, heal,
  cutoff, recovery, policy, idempotency, manual capture or no-free-reroll semantics.
- No public source-origin/Genetics/RNG exposure, no GET-time replay, and no new public cursor
  fields or relaxation of the 128-event/four-envelope/256-KiB ceilings.
- No new HTTP endpoint, migration execution, deployment, repository-history action,
  enablement of TASK-039/040 consumers or rollout authorization from this draft.

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
   a historical suffix. The selected design must establish an independent trust
   anchor (for example, versioned MAC/signature keys kept **outside** DB plus independently
   anchored monotonic heads, or an accepted append-only storage/ACL policy with its
   explicitly narrower threat model). Key rotation/retention must cover **active
   Hunts and the required audit/presentation windows**, not merely cursor TTL.
   Never expose private commitments or keys in public cursors.
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
9. If privileged-DB write/rollback is included in the security scope and an
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
   fallback from strong to weak verification.
10. **Acknowledged private-core commit fencing is an independent hard requirement
    under the privileged-DB-rollback threat model.** An in-PG outbox followed
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

## 6. Historical GET integrity independent of the old prefix length

1. Fetch a bounded indexed page and its at-most-four public Battle headers inside
   one `REPEATABLE READ READ ONLY` transaction. Authenticate each fetched row/header
   against an **independent trusted commitment or authenticated inclusion proof**
   that binds its Player/Hunt/ordinal/Battle/sequence/index and exact public bytes.
   Merely recalculating an unkeyed local predecessor hash remains insufficient.
2. A candidate is a versioned per-row/per-header keyed MAC over canonical public-only
   identities/bytes plus an authenticated publication-generation/root reference.
   Its key must be external to DB and retained for all valid old pages. The trusted
   root must also resist **rollback to an earlier valid signed prefix**, or the
   accepted security threat model must explicitly exclude a DB administrator
   capable of restoring whole signed snapshots. A MAC alone does not prevent rollback.
   A narrower alternative is explicitly separated immutable PostgreSQL app-role
   privileges, append-only procedures/triggers and protected backups/WAL; this
   **does not** protect against a privileged database administrator and cannot
   be presented as cryptographic proof against that actor.
3. Preserve frozen `nextCursor` and conditional `resumeCursor`: authenticate the
   original public prefix before promotion, reject historical mutation and missing
   rows, and maintain stable `409 snapshot_changed` versus `410` dispositions.
   Never scan prior history on GET, never use private source bytes or an unverified
   page to sign a new cursor, and never leak row-authentication material.
4. Define key-loss/unavailable-prover and corrupted-row behavior distinctly from
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

## 8. Required proof before accepting a v4 implementation

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
4. **Negative integrity:** coherent rewriting of an old private Battle plus all
   following DB hashes; replacement of only an old public row, an entire historical
   public suffix, a public header, an old reward, old heal or stimulus; missing
   private evidence; replay of a prior **valid** signed head; cross-Player mix;
   changed pinned authority/key; key rotation and loss; all fail closed with
   documented gameplay-versus-presentation dispositions. Include replay of a
   previously valid signed head after full database rollback, attestation
   outage/outbox reorder if using the stronger trust model, and proof failure
   for an old Encounter fetched only during reward/capture/audit.
   Independently fault-inject the private-core trust service and optional
   public GET attester while restarting a Worker after a PostgreSQL commit;
   the former must fail closed for gameplay, the latter must not block
   provably authorized SPEC-015 mutations and must keep GET unserved until
   the public root is attested.
   Under the stronger privileged-DB threat model, include PG-H6 commit
   followed by acknowledged `202`, PG+outbox rollback to H5 **before witness
   H6**, restart with online witness at H5, and rejection of stale H5. Include
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

## 9. Alternatives and decisions for the Human Owner

**A — Keep accepted v3 architecture.** Continue strict historical replay and full
checkpoint storage; do not assert history-independent producer bounds. Set an
explicit tested maximum supported Hunt size/duration, or leave the public feed
disabled when its production workload gate cannot be met. This does not authorize
limiting legitimate SPEC-015 gameplay.

**B — Versioned compact v4 + indexed immutable private evidence.** Enables a path to
bounded *incremental* work, but requires schema/version changes, retention, replay
authority migration policy, key/rollback threat model and independent DB evidence.
This is the proposed design for further Class-A review, **not an accepted choice**.

**C — Offload full replay to a separate verifier.** Can move work away from the
request but does not by itself make strict full checkpoint writes bounded or
guarantee authoritative evidence is ready before SPEC-015 effects commit.
Do not use asynchronous verification to publish unverified source or grant rewards.

Open owner decisions after independent consultation:

1. Select the bounded-v4 strategy (B), explicit v3 size envelope (A), or a fully
   specified alternative; decide whether existing v3 Hunts require migration.
2. Set the **historical threat model**: protect against arbitrary DB-row rewriting
   and signed-head rollback using an off-DB trust anchor, or explicitly accept
   narrower DB-role immutability with stated administrator/backup limitations.
   Under the strong model, separately accept a durable off-DB private-intent/
   commit-fence protocol and its fail-closed availability cost; a public
   postcommit outbox alone cannot certify an already acknowledged gameplay
   effect against whole-DB rollback.
3. Set finite production CPU/DB-byte/latency/storage ceilings and the remedy if
   a legitimate core Battle/active-effect state exceeds them.

Until those decisions and required reviews are complete, SPEC-017 remains the
**accepted authority**, the strict v3 codec remains unchanged, TASK-103 retains
its existing scope, and the HTTP presentation endpoint stays **disabled**.
