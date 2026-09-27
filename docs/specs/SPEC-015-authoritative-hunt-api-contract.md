# SPEC-015 — Authoritative Hunt API Contract

- Status: APPROVED
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Related specs: SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-009, SPEC-010, SPEC-011, SPEC-013, SPEC-014
- Related ADRs: ADR-006
- Related tasks: TASK-017, TASK-024, TASK-025, TASK-033, TASK-035, TASK-036, TASK-037, TASK-038, TASK-096, TASK-097, TASK-098

## 1. Problem

TASK-036 and TASK-037 provide the internal capture/reward and checkpoint/elapsed-time authorities, while
SPEC-013 deliberately leaves exact public Hunt routes, command payloads, idempotency keys and transaction
composition to TASK-038.

Those details are public protocol semantics. Repository governance classifies that surface as Class A, so
TASK-038 cannot invent it inside a Class B implementation. This spec freezes the smallest authenticated
v1 Solo Hunt HTTP contract needed by TASK-038 without changing the accepted Hunt, capture, Genetics,
reward, recovery or auto-capture probability rules.

The contract also closes one ordering question that becomes observable once encounter rewards can include
capture items: an encounter's own newly earned item rewards do not fund an **automatic** capture attempt at
that same immediate encounter boundary. Auto-capture sees Inventory after all previously committed logical
effects and before this encounter's reward grants; the accepted automatic capture consequence and this
encounter's reward application then commit as one authoritative boundary or are durably retryable without
re-rolling. A later explicit manual attempt is different: it uses the Player's authoritative Inventory at
that later command boundary, including items legitimately acquired after the Encounter completed.

## 2. Goals

- expose one self-scoped Player-wide Solo Hunt state read;
- expose start, checkpoint, claim, retreat, explicit Hunt healing-item use and manual capture/skip commands;
- make every logical Hunt command response-loss idempotent through one required public command key;
- preserve TASK-037 fixed-cutoff/OCC/replay semantics without exposing checkpoint bytes or RNG authority;
- persist/version standing auto-capture policy and make policy changes forward-only;
- support an automatic capture boundary after every successfully completed eligible Encounter;
- compose TASK-036 capture and TASK-024 reward effects without duplicate Ball debit, Pokémon grant,
  XP/item grant or encounter reward;
- preserve the same-Zone no-free-reroll PendingEncounterSelection across Hunt terminalization/restart;
- preserve Player-wide recovery state and one-active-Hunt authority;
- expose only visible Hunt/capture facts; hidden Genetics/Grade/Score/Profile/Ascendant facts remain
  unavailable to policy conditions and public responses;
- reuse ADR-006/SPEC-011 normal-session Origin/CSRF behavior.

## 3. Non-goals

- new capture probability, Shiny, Genetics, reward or recovery rules;
- new Ball powers, Ball ItemIds, prices, stock, faucets or monetization;
- revival or Potion automation; explicit player-triggered normal healing item use remains in scope under
  SPEC-007/SPEC-013;
- public Card/Pixi combat-event presentation schema, owned by TASK-028 before TASK-029/030/039/040;
- Duo/PvP/Gym/World-Boss orchestration;
- deployment/production cutover;
- compatibility aliases for unaccepted legacy Hunt endpoints.

Production Ball content remains a release dependency. TASK-038 may implement generic server-authorized
Ball resolution before the final standard Ball ItemIds are published, but production enablement must fail
closed until the exact accepted capture-Ball artifact is available.

## 4. Common authority and transport rules

### 4.1 Self-scoped authority

Every route requires a normal active ADR-006 session. The server resolves the authenticated Account to the
authoritative Player. No Hunt request accepts `accountId`, `playerId` or `ownerPlayerId` as authority.

Resource identifiers in paths/bodies are selectors only. A syntactically valid Hunt/Team/resource owned by
another Player is indistinguishable from absence and returns `404 not_found`.

### 4.2 Session activity, Origin and CSRF

- `GET` Hunt/policy reads authenticate with `touchActivity=false`.
- Every Hunt/policy mutation is subscriber-initiated and authenticates with `touchActivity=true`.
- Every mutation requires an allowed exact `Origin`, the normal session cookie and valid session-bound
  `X-CSRF-Token`.
- Credentialed CORS is exact-origin only.
- The Hunt route family permits only the methods/headers required below, including
  `Content-Type`, `X-CSRF-Token` and `Idempotency-Key`.

### 4.3 Public command identity

Every mutation in sections 6 through 10 requires:

`Idempotency-Key: <canonical UUID>`

The public key is a command selector, not authorization and not a Hunt/checkpoint/capture identity.
The server binds it durably to:

- authenticated Player;
- normalized command kind;
- normalized immutable command intent;
- command-owned resource identity when applicable;
- when the command advances an active Hunt: the exact `advancementHuntId`, checkpoint identity,
  expected checkpoint row version and TASK-037 fixed advancement target, or an explicit `none` binding
  when no active Hunt exists at first acceptance;
- for an explicit healing-item command, the server-receipt submission cutoff, frozen ItemRule authority,
  target and acceptance order. The Encounter/phase classification is resolved only after the Hunt has
  authoritatively reconciled to that submission cutoff; its later inter-Battle execution boundary is
  structural timeline state, not a replaceable client-supplied cutoff.

Clients never submit authoritative wall-clock time, logical cutoff or elapsed duration. For **every**
server-receipt cutoff in this contract, including ordinary advance-to-cutoff commands and explicit
healing-item submission cutoffs, `serverNow` means the database-authoritative UTC timestamp sampled under
the Player-wide serialized transaction; a Worker/process-local clock is not authority for recovery or Hunt
time. The effective receipt time is
`max(serverNow, checkpoint.logicalTimeAnchorAt)`, so cross-Worker clock skew can produce zero elapsed time
but can never request a target below the latest committed `logicalTimeMs`. Ordinary commands freeze the
resulting TASK-037 target under the command correlation. Healing-item commands freeze that same clamped
server-receipt submission cutoff first; after reconciliation to it, section 9.2 freezes the resulting
Encounter/phase classification and, when required, the ordered structural inter-Battle execution boundary.
Retry/recovery cannot replace any frozen identity with a later receipt time.

Same Player + same key + exact normalized intent has two phases:

- while the accepted command is still **pending/progressing**, another delivery with that same key resumes
  the same frozen command for at most one additional bounded advancement segment;
- once the command has a terminal success/domain result, another delivery replays that prior terminal result
  unchanged.

Reuse with another kind/intent is `409 correlation_conflict`. Continuation/replay never substitutes a
later wall clock, a newer checkpoint identity, a different Ball or a different auto-capture policy.

For manual capture, the command identity freezes two independent selectors when applicable:

- `captureSourceHuntId`: the Hunt named by the route and owning the retained pending decision;
- `advancementHuntId`: the different/current active Hunt that existed when this command first accepted,
  or `none`.

Retry never substitutes another active Hunt. If a distinct command has already advanced/replaced the frozen
`advancementHuntId` so TASK-037 marks this command's prelude target superseded, the not-yet-committed
manual attempt does not execute and the command returns its durable `409 command_superseded` result. The
Player must issue a new Idempotency-Key for a new current-time attempt.

An unlocked replay lookup may be used as a fast path, but it is never the only concurrency guard. For a
previously unseen key, after acquiring the shared Player-wide Hunt-command serialization boundary the
server must re-check/claim the durable command correlation before any mutable Hunt/policy effect. Concurrent
same-key deliveries therefore converge on exactly one normalized command record/result; concurrent
same-key/different-intent deliveries converge on one winner plus `409 correlation_conflict`.

After authentication/CSRF and structural normalization, command-layer terminal domain results are also
durable results of that Idempotency-Key. In particular, normalized `409`/`422` outcomes are replayed
unchanged and cannot later turn into success under the same key when mutable state changes. A new logical
attempt uses a new key.

Malformed/unauthenticated/forbidden requests fail before semantic command acceptance and do not bind the
key. A self-scoped `404 not_found` resolved before semantic command acceptance likewise does not bind the
key. A transient infrastructure/`503 authority_unavailable` failure that occurs **before** correlation/
target freeze likewise leaves the key unbound. If the same failure occurs **after** a command correlation,
advancement identity or cutoff has already been durably frozen, the key remains bound to that pending
command; retry with the same normalized intent resumes exactly that frozen command after the dependency
recovers. It must not allocate a new target, RNG origin or active-Hunt identity.

Supported replay lifetime is bounded:

- a pending/progressing accepted command correlation has a maximum **30-day continuation lease** from its
  authoritative `acceptedAt`. At/after that deadline it is no longer executable: lookup of the old key
  returns `410 idempotency_gone`, and no uncommitted final consequence may run. Any checkpoint/reward/
  capture effects already committed by prior 202 progress remain authoritative; an unresolved manual
  capture decision remains available for a genuinely new command key; an unactivated policy save remains
  unactivated; and an uncommitted retreat remains uncommitted;
- **accepted healing-item domain state is different from transport correlation retention**. Once section
  9.2 accepts/persists the scheduled heal, that domain action survives expiry of its Idempotency-Key and
  remains eligible for its frozen structural boundary until it resolves applied/not-applied or the source
  Hunt terminalizes. Expiring the transport key never cancels, skips or re-times an already accepted
  scheduled heal;
- expiry may be materialized lazily from `acceptedAt` during exact-key lookup or normal bounded cleanup;
  it does not require scanning/draining every old command inside a Player request;
- the expired pending key is represented by an `idempotency_gone` tombstone through the remainder of the
  same 60-day supported retry horizon measured from `acceptedAt`;
- a terminal command's complete replay result is retained for exactly **30 days** after its authoritative
  terminal-result timestamp;
- after that 30-day full-result window, the implementation may compact the result to an
  `Idempotency-Key` tombstone retained for a further **30 days**; exact reuse during this tombstone window
  returns `410 idempotency_gone` and never executes the command again. The tombstone retains the bounded
  Player + key + command-kind + normalized-intent identity/hash needed to distinguish exact expired replay
  from same-key/different-intent `409 correlation_conflict`;
- after the applicable supported retry lifetime, the old UUID is no longer a supported retry identity.
  For a still-pending/progressing command that lifetime is the 30-day continuation lease plus its
  tombstone remainder measured from `acceptedAt`; for a command that reached a terminal result first, the
  30-day full-result plus 30-day tombstone lifetime is measured from that terminal-result timestamp.
  Clients must issue a new UUID for a genuinely new command and must not retry an expired command key.

Normal-operation cleanup may compact/delete expired records accordingly. This replay lifetime is transport
retention only; Encounter/Hunt/reward/capture audit authorities retain whatever longer lifetime their own
accepted contracts require.

Internal checkpoint command correlations and TASK-036 capture-attempt correlations are server-owned and
domain-separated. The client never supplies either internal correlation directly.

- one explicit **manual capture decision** inside a public capture command maps 1:1 to one TASK-036 attempt
  correlation and freezes one server-owned capture RNG origin before resolution;
- one advancing public command such as checkpoint/claim/retreat/policy-save/manual-capture may cross zero,
  one or many automatic capture boundaries and therefore may cause zero, one or many additional distinct
  TASK-036 automatic attempts before its own terminal command consequence;
- each automatic opportunity has one stable server-owned automatic-capture correlation keyed to the exact
  `EncounterId` plus the policy version authoritative at that Encounter boundary, independent of which
  outer advancing command first reaches or later recovers that boundary;
- each automatic opportunity also freezes the exact server-owned, domain-separated TASK-036 capture RNG
  origin/continuation before attempt resolution;
- each completed Encounter boundary freezes one exact server-owned, domain-separated reward RNG
  origin/continuation before TASK-036/TASK-024 reward resolution, independent of which outer command first
  reaches or later recovers that boundary;
- retry/recovery under the same or a later outer command reuses that Encounter-owned automatic correlation,
  frozen selected Ball, capture RNG origin and outcome. It cannot mint another attempt or reroll the same
  Encounter.

Reward recovery follows the same identity rule: the same completed Encounter/reward-source identity always
reuses its frozen reward RNG origin and immutable Reward Resolution. A retry or different outer command
cannot substitute a new reward RNG origin or re-roll item drops.

The exact opaque derivation/storage of internal correlations is implementation-owned, but must be
deterministic or durably frozen before side effects so process loss cannot create a second identity.

Any Hunt state embedded in a mutation response is the immutable **command-result snapshot** at that
command's accepted/frozen logical boundary. Exact replay returns that prior result even if the Hunt has
since advanced or terminalized. It must not be mislabeled as a fresh read. Clients that need the latest
committed Player-wide state after retry/reconnect use `GET /player/hunts/state`.

### 4.3.1 Bounded HTTP continuation

TASK-037 intentionally advances at most one safe segment per service invocation. TASK-038 preserves that
bounded execution model at the HTTP boundary; it does not loop an unbounded number of segments inside one
Worker request.

Every section 7–10 mutation that must advance an active Hunt before its final command consequence may
return `202` after committing one safe segment:

```json
{
  "status": "in_progress",
  "progress": {
    "logicalTimeMs": "1234",
    "targetLogicalTimeMs": "5678"
  }
}
```

The response contains no write token and no new correlation. The client continues by repeating the exact
same method/path/body with the same `Idempotency-Key`. Each accepted continuation advances at most one
additional segment under the already-frozen command identity/target. Intermediate 202 responses never
activate a pending policy replacement, execute the final explicit manual attempt/skip, or publish a
retreat terminal result before their required advancement prelude reaches its frozen target/terminal
boundary.

For `claim`, Encounter effect aggregates are accumulated durably under the same pending command and are
returned only in its final `200`; a 202 does not expose a partial delta that could later be double-counted.

A distinct new command/key may be accepted from the latest committed checkpoint while an older ordinary
advance-to-cutoff command is still pending. Normal TASK-037 target/OCC rules decide ordering; if the newer
command commits beyond the older frozen target, later continuation of the older key returns its durable
`409 command_superseded` result and never changes target or advances a newer Hunt.

To keep ordinary accepted pending-command retention bounded even when the old client never retries, the
transaction that commits a newer checkpoint at logical time strictly greater than another pending
advance-to-cutoff command's frozen target also marks that older command `command_superseded` and timestamps
its terminal result under the same Player-wide serialization boundary. Its normal 30-day full-result +
30-day tombstone retention then starts from that eager supersession timestamp. This eager supersession
**never applies to an accepted healing-item timeline command**, whether another advancement crosses its
submission cutoff or it is already waiting for the structural inter-Battle boundary. Any advancement that
crosses the item's submission cutoff must materialize the same scheduled boundary state; the item then
resolves applied/not-applied in its frozen acceptance order as section 9.2 requires.

At a logical boundary with one or more due healing-item commands, one service invocation resolves **at
most one** due healing-item command, always the earliest frozen acceptance order. If additional due healing
commands remain at that same logical boundary, the currently executing advancing command returns
`202 in_progress` without advancing logical time past that boundary. Repeating that same outer command
key resolves the next due heal before any later Hunt history. When the healing-item command itself is the
outer command, its same-key continuation uses the same rule. This keeps every Worker invocation bounded
without imposing a product quota on how many explicit heal commands may have been accepted.

The one-heal bound is invocation-wide, not boundary-local. After an invocation resolves any due heal, it
must not advance logical time beyond that boundary during the same invocation. It may return the heal
command's own terminal result, or finalize an outer command whose own target/consequence is exactly that
same boundary after confirming no earlier/equal due heal remains; otherwise it returns `202 in_progress`.
It cannot continue to a later boundary and resolve a second heal in the same Worker invocation.

If a different command terminalizes the same Hunt at logical time `T` at or before an ordinary pending
command's frozen target, the older command is not reinterpreted against a future Hunt:

- checkpoint/claim converge on the terminal Hunt at `T`; claim returns only its own command-local committed
  aggregate plus that terminal state;
- retreat returns terminal `200` with the actual `terminalReason` and unchanged recovery anchor;
- a policy-save prelude is considered reconciled at `T` and the saved policy may then commit for the next
  Hunt with `effectiveAt = null`; and
- a manual-capture prelude is considered reconciled at `T`; if its independently frozen capture-source
  pending decision still exists, the attempt/skip may continue against that retained evidence.

Healing-item commands use section 9.2 instead: terminalization before their due inter-Battle boundary
completes them `not_applied / hunt_terminal` with no debit.

### 4.4 Exact integer transport

The following use canonical non-negative base-10 strings in JSON:

- every PostgreSQL/OCC `rowVersion`;
- `logicalTimeMs`;
- Inventory quantities and minimum reserves;
- XP/reward quantities.

Bounded gameplay values such as Pokémon Level, owned-Team HP and basis points remain
JSON numbers within their accepted safe domains. Exact wild pre-capture HP/derived stats remain prohibited
by section 13.

Inventory quantities/reserves use the existing v1 ItemQuantity domain
`0..9223372036854775807` at the API boundary; persisted owned entries remain positive as defined by
SPEC-007, while `minimumReserve = "0"` is valid policy configuration.

`rowVersion` uses canonical decimal within PostgreSQL signed-`bigint` non-negative range.
`logicalTimeMs` uses the existing TASK-037 safe-integer domain
`0..9007199254740991`; the API never narrows either value through JavaScript `number`.

### 4.5 Request bounds

- When a mutation body is present, JSON mutation bodies are objects only and are rejected above 16 KiB
  before domain work.
- Commands documented with **empty body** accept either a zero-length body or exact JSON object `{}`;
  both normalize to the same immutable command intent. Any field in such a body is `400 invalid_request`.
- UUID path/header fields and every UUID-valued mutation-body field must use canonical lowercase UUID text;
  non-canonical spellings are `400 invalid_request` rather than silently normalized into command intent.
- Opaque content IDs are non-empty bounded strings and confer no authority.
- Unknown top-level mutation fields are rejected.
- Malformed input fails before persistence mutation.

### 4.6 Error envelope

Errors use:

```json
{ "error": "machine_readable_code" }
```

V1 codes:

- `400 invalid_request`;
- `401 unauthorized`;
- `403 forbidden`;
- `404 not_found`;
- `409 hunt_already_active`;
- `409 recovery_pending` with `recoveryReadyAt`;
- `409 stale`;
- `409 correlation_conflict`;
- `409 command_superseded`;
- `409 capture_unavailable`;
- `409 insufficient_ball`;
- `409 insufficient_item`;
- `409 hunt_not_active`;
- `410 idempotency_gone`;
- `422 hunt_not_admissible`;
- `422 hunt_item_not_supported`;
- `422 hunt_item_target_invalid`;
- `422 capture_ball_not_authorized`;
- `422 auto_capture_policy_invalid`;
- `503 authority_unavailable`.

`409 stale` never returns a replacement write token and never authorizes a hidden retry with a newly
observed version. The caller reloads/reconciles and issues a genuinely new command/Idempotency-Key.

Unexpected infrastructure faults remain server errors and must not expose raw SQL, checkpoint bytes,
authority keys, RNG state, session material or hidden Genetics.

Route-specific domain mapping:

- **start**: missing/unowned Team or unknown Hunt selector -> `404 not_found`; an existing
  active Hunt -> `409 hunt_already_active`; Player-wide recovery not elapsed ->
  `409 recovery_pending` with only `recoveryReadyAt`; a found Team/Hunt that cannot legally start under
  the accepted pinned rules/content -> `422 hunt_not_admissible`; missing exact required authority ->
  `503 authority_unavailable`;
- **checkpoint / claim / retreat**: unknown/unowned Hunt selector for a new command -> `404 not_found`;
  an owned Hunt that is terminal or is not the Player's current active Hunt for a new command ->
  `409 hunt_not_active`;
  frozen command overtaken under TASK-037 -> `409 command_superseded`; unavailable pinned authority ->
  `503 authority_unavailable` while preserving an already-frozen pending command as section 4.3 defines;
- **manual capture / skip**: use the exact mapping in section 9;
- **explicit healing item use**: use the exact mapping in section 9.2;
- **auto-capture policy PUT**: `expectedRowVersion` mismatch -> `409 stale`; structurally known policy
  whose values/relationships violate section 10 -> `422 auto_capture_policy_invalid`; referenced ItemId
  outside the exact accepted capture-Ball authority -> `422 capture_ball_not_authorized`; missing exact
  Ball/content authority -> `503 authority_unavailable`; frozen active-Hunt prelude overtaken under
  TASK-037 -> `409 command_superseded`;
- **all mutations**: accepted key reused with different normalized intent -> `409 correlation_conflict`.

No other additional error fields are public in v1 unless this spec names them explicitly.

## 5. Public Hunt state and capture-Ball metadata

`GET /player/hunts/state`

Returns `200`:

```json
{
  "activeHunt": null,
  "pendingManualCapture": null,
  "recoveryReadyAt": null
}
```

This GET is strictly read-only: it does not advance elapsed Hunt time, freeze a new cutoff, resolve rewards
or trigger auto-capture. `logicalTimeMs` and Battle/Team HP reflect the latest committed checkpoint. A
returning client that needs authoritative elapsed-time reconciliation issues `claim` (when it needs the
bounded effect summary) or `checkpoint` before treating the Hunt state as caught up to that command's
wall-clock boundary.

or:

```json
{
  "activeHunt": {
    "huntId": "uuid",
    "huntDefinitionId": "opaque",
    "zoneId": "opaque",
    "status": "active",
    "logicalTimeMs": "0",
    "startedAt": "RFC3339 UTC",
    "effectiveAutoCapturePolicyVersion": null,
    "team": [
      {
        "pokemonInstanceId": "uuid",
        "speciesId": "opaque",
        "level": 1,
        "selectedAbilityId": "opaque",
        "moveIds": ["opaque"],
        "currentHp": 1,
        "maxHp": 1
      }
    ],
    "currentEncounter": null
  },
  "pendingManualCapture": null,
  "recoveryReadyAt": null
}
```

When present, `currentEncounter` exposes only visible frozen facts needed by presentation:
`encounterId`, exact form-aware `speciesId`, `level`, canonical public `catchRate` in `3..255`,
and `shiny`.
It does not expose the wild individual's `currentHp`, `maxHp`, HP percentage or derived combat stats
because those values incorporate or can help infer hidden IV/Genetic inputs before capture. If later
Card/Pixi combat presentation requires an HP visualization, TASK-028 must define that presentation boundary
and its hidden-information analysis rather than TASK-038 leaking it through this state API.

Player-wide `pendingManualCapture` is independent of the current active Hunt because SPEC-013 requires an
unresolved decision to survive retreat/restart. When present it exposes:

- `sourceHuntId`;
- `encounterId`;
- exact form-aware `speciesId`;
- `level`;
- canonical public `catchRate` in `3..255`;
- `shiny`;
- `captureOptions`, one entry per currently authorized capture Ball with `itemId`, exact current
  Inventory `quantity`, server-authored `premium` classification and a truthful pre-capture
  `chanceRangeBp: { min, max }` computed from the accepted hidden-Genetics modifier bounds and that Ball.

The chance range must never narrow enough to reveal the individual's hidden Genetic state.
These `captureOptions` are informational at the read instant. A later manual attempt first performs any
required active-Hunt advancement and then uses the command's **frozen accepted Ball authority** while
revalidating only then-current authoritative Inventory under its serialized mutation boundary; the GET
never reserves Inventory or guarantees later availability.

The read never exposes canonical IVs, Genetic Grade/Score, compatible/birth/expressed Profile,
Ascendant state, exact wild derived stats/HP, server seeds, RNG continuation, raw combat/checkpoint state
or hidden catch modifiers.

Terminal Hunts are not returned as active after their terminal transaction commits. Their surviving manual
pending decision remains visible through the Player-wide field above. `recoveryReadyAt` is returned even
when there is no active Hunt.

`GET /player/hunts/capture-balls`

Returns the exact currently accepted capture-Ball authority available for new manual/policy choices:

```json
{
  "ballAuthorityVersion": "opaque",
  "balls": [
    {
      "itemId": "opaque",
      "powerQuarterUnits": 4,
      "premium": false
    }
  ]
}
```

This read contains public content metadata only. It does not expose Inventory quantity, hidden capture
modifiers or an individual's exact final chance. `ballAuthorityVersion` and `premium` are
server-authored. A new/no-saved policy is globally disabled and authorizes no Ball auto-use; any future
enabled preset is a separately accepted/saved policy rather than a catalog-provided implicit default.

## 6. Start command

`POST /player/hunts/start`

Headers: required `Idempotency-Key`.

Request:

```json
{
  "huntDefinitionId": "opaque",
  "teamId": "uuid"
}
```

First acceptance:

1. performs the replay-first fast-path lookup;
2. for an unseen key, resolves the requested HuntDefinition/Zone selector under the exact current
   new-operation authority; unknown selector returns unbound `404 not_found`, unavailable authority returns
   unbound `503 authority_unavailable`;
3. before returning either unbound selector error from step 2, performs one more replay lookup so a
   concurrent same-key winner accepted after the fast path is replayed rather than shadowed by a stale
   local authority/selector observation;
4. serializes against the authenticated Player's shared Hunt-command root used by every section 6–10
   mutation, then re-checks the public command key;
5. loads/locks the owned saved Team plus the referenced owned Pokémon configuration rows needed for one
   coherent snapshot; missing/unowned Team/member returns unbound `404 not_found`;
6. only after those self-scoped selectors are proven does the server claim the durable public command key;
7. rejects durably with `409 hunt_already_active` while another Hunt is active;
8. compares the database-authoritative transaction timestamp to `recoveryReadyAt` and rejects durably
   with `409 recovery_pending` while that timestamp is earlier; Worker/process-local clock skew cannot
   admit a Hunt early;
9. validates the found Team/Hunt against exact accepted start/admissibility rules; rejection is durable
   `422 hunt_not_admissible`;
10. freezes the Team's ordered members plus exact current Move/Ability state and resolves the exact accepted
   Hunt/Zone/game-data/rules/policy authority;
11. reuses any unresolved same-Zone PendingEncounterSelection under its retained exact context;
12. allocates server-owned Hunt/checkpoint identities and deterministic authority;
13. pins the currently effective auto-capture policy version for logical time zero;
14. commits the active-Hunt root, checkpoint and durable start-command result atomically.

The Team/member load is one committed authoritative snapshot: the start transaction locks/revalidates the
relevant Team and Pokémon configuration versions while freezing them. Concurrent Team roster, Move or
selected Ability mutations may order before or after start, but start must never freeze a mixture of
versions from both sides of those mutations. The returned Hunt Team is the pinned activity snapshot and
remains the presentation authority for that Hunt even if the Player later edits the reusable saved
Team/Pokémon state.

Concurrent distinct starts for one Player can accept at most one active Hunt. Same-key response-loss replay
returns the same accepted Hunt.

All Hunt/policy mutations in sections 6–10 use this same Player-wide serialization boundary after
correlation replay lookup. This makes start, advancement, retreat, manual capture and policy replacement
observe one authoritative serial order instead of racing on partially independent roots.

Success `200` returns the same complete Player-wide shape as `GET /player/hunts/state`:

```json
{
  "activeHunt": { "...": "the section-5 activeHunt view" },
  "pendingManualCapture": null,
  "recoveryReadyAt": null
}
```

`effectiveAutoCapturePolicyVersion` is the policy version authoritative at the returned
`activeHunt.logicalTimeMs`. It is nullable only for the immutable disabled/no-saved-policy default. A
mid-Hunt policy save updates this field only when the new policy's forward-only effective logical boundary
has committed; earlier history retains its persisted prior policy interval.

## 7. Checkpoint and claim

### 7.1 Checkpoint

`POST /player/hunts/:huntId/checkpoint`

Required `Idempotency-Key`; empty body.

On first acceptance the server freezes the TASK-037 cutoff from the current authoritative checkpoint
wall-clock anchor. It advances only to that cutoff, preserving exact replay and policy-version intervals.

Every completed Encounter reached during advancement must be durably reconciled before the command can
publish its new checkpoint:

1. freeze the Encounter-owned reward RNG origin, then validate/freeze the encounter reward source under
   TASK-036/TASK-024 authority;
2. at the encounter boundary, evaluate the policy version authoritative for that logical instant;
3. if auto-capture is **disabled** and no Player-wide manual decision is pending, create exactly one durable
   manual pending decision from this completed Encounter snapshot with no Ball debit; if another manual
   decision is already pending, preserve it byte/semantically unchanged and durably close this Encounter's
   manual opportunity as blocked-by-existing-pending with no replacement/debit;
4. if auto-capture is **enabled**, resolve at most one automatic TASK-036 attempt using the
   pre-this-encounter Inventory snapshot and the ordered visible-fact policy;
5. if enabled auto-capture resolves no eligible Ball, close that Encounter's automatic opportunity with no
   debit/manual fallback/queue;
6. apply the Encounter reward effects and any accepted capture consequence before advancement may pass this
   Encounter boundary. If application cannot complete, persist exact retry evidence and **stop** this
   invocation at the boundary; do not simulate a later productive Encounter until the reward/capture
   consequence has committed;
7. continue advancement only after that encounter boundary is closed.

The manual branch enforces the SPEC-013 Player-wide capacity of one pending decision. Later successful
Encounters while it remains unresolved never replace its Encounter/content identity and never acquire a
second hidden pending slot.

Player-facing Hunt settings/state presentation must make this accepted capacity consequence visible:
while auto-capture is disabled and one manual decision remains unresolved, later successful Encounters
cannot create another manual capture opportunity, including later visible Shiny encounters. The API does
not invent a queue behind that one pending slot.

The current encounter's own newly granted reward items therefore cannot be selected for that same
encounter's automatic capture. They are available to later logical boundaries after commit, including a
later explicit manual attempt if that Encounter remained the Player-wide pending manual decision.
Consequently, Encounter N's committed Ball grants are guaranteed to participate in the authoritative
Inventory seen by Encounter N+1's automatic Ball selection.

Checkpoint success `200` returns the complete section-5 Player-wide Hunt state. If advancement
automatically terminalized the Hunt, `activeHunt` is null and `recoveryReadyAt` reflects that exact
terminal boundary. It has no separate unclaimed-reward pool: effects required to make later Hunt/Inventory
decisions authoritative are reconciled as part of advancement.

### 7.2 Claim

`POST /player/hunts/:huntId/claim`

Required `Idempotency-Key`; empty body.

`claim` uses the same fixed-cutoff advancement and side-effect reconciliation as `checkpoint`. Its
distinct public purpose is to return a bounded effect delta for the accepted command correlation:

```json
{
  "state": {
    "activeHunt": { "...": "the section-5 activeHunt view or null" },
    "pendingManualCapture": null,
    "recoveryReadyAt": null
  },
  "effects": {
    "playerExperience": "0",
    "pokemonExperience": [
      { "pokemonInstanceId": "uuid", "amount": "0" }
    ],
    "items": [
      { "itemId": "opaque", "quantity": "0" }
    ],
    "automaticCaptureSummary": {
      "attempts": "0",
      "successes": "0",
      "failures": "0",
      "closedNoEligibleBall": "0",
      "shinySuccesses": "0"
    }
  }
}
```

The delta reports only effects committed by that exact command correlation. Replay returns the same delta.
It is reporting, not a second entitlement/application mechanism.

The delta is structurally bounded:

- Player XP is one aggregate scalar;
- Pokémon XP is aggregated per pinned Team member, omits zero-amount entries, and is sorted by canonical
  lowercase UUID text ascending; the array is therefore bounded by the Solo Hunt Team capacity;
- item grants are aggregated by distinct `itemId` from the pinned Hunt reward authority, with one entry per
  distinct item type rather than one row per Encounter/drop; zero-quantity entries are omitted and remaining
  entries are sorted by canonical UTF-8 byte order of `itemId`;
- automatic-capture reporting is aggregate counts only. Manual capture has its own command result.
  Individual captured Pokémon are authoritative Collection
  state and are read through the existing Player State API, not duplicated into an unbounded claim log.

The `automaticCaptureSummary` object is always present and includes all documented counters, including
zeroes. These canonical inclusion/order rules make exact replay byte/field stable.

The claim delta is command-local reporting only. Encounter effects committed during a claim's successful
202 progress segments are accumulated under that exact claim correlation and are returned only if that
claim itself reaches terminal `200`. If a distinct command later supersedes that claim, the old key
returns terminal `409 command_superseded` and no effect delta is transferred to another command.

This does **not** lose entitlement: reward/capture effects were already authoritatively applied and remain
visible through Player State/Inventory/Collection/Hunt state. It only means a superseded reporting command
does not later manufacture a synthetic summary. Reporting ownership never transfers between command kinds,
so checkpoint/retreat/policy/manual-capture commands cannot accidentally become owners of a claim delta.

## 8. Retreat

`POST /player/hunts/:huntId/retreat`

Required `Idempotency-Key`; empty body.

The command freezes one cutoff and applies SPEC-013 section 6.1 exactly. Completed Encounter boundaries
before terminalization are reconciled as in section 7 before the active Hunt becomes unreachable.

On commit:

- the Hunt terminalizes at the exact authoritative logical boundary;
- unresolved same-Zone PendingEncounterSelection survives for no-free-reroll restart;
- any existing manual pending capture decision survives independently until explicitly attempted/skipped;
- Player-wide `recoveryReadyAt` is fixed from the actual terminal boundary plus the ending Hunt's pinned
  recovery duration;
- the Player active-Hunt slot is released atomically with terminal persistence.

Success `200`:

```json
{
  "status": "terminal",
  "terminalReason": "retreat",
  "recoveryReadyAt": "RFC3339 UTC"
}
```

If no-living automatic terminalization already occurred before the frozen retreat cutoff, the same command
converges on that terminal result without moving the recovery anchor and returns the same shape with
`terminalReason = "no_living"`. Those are the only v1 retreat-command terminal reasons.

## 9. Explicit Hunt commands

### 9.1 Manual capture decision

`POST /player/hunts/:huntId/capture`

Required `Idempotency-Key`.

Attempt:

```json
{
  "decision": "attempt",
  "encounterId": "opaque",
  "selectedItemId": "opaque"
}
```

Skip:

```json
{
  "decision": "skip",
  "encounterId": "opaque"
}
```

The explicit command first advances the current active Hunt, if any, to its own frozen cutoff under the
policy versions already authoritative for elapsed history. It then acts only on the exact Player-wide
still-pending manual decision identified by `sourceHuntId + encounterId`. The source Hunt may already be
terminal; its retained evidence remains the capture authority.

Before freezing/advancing any unrelated current active Hunt, the server first resolves the route
`:huntId` as the self-scoped `captureSourceHuntId` and verifies that the Player-wide pending decision
matches `captureSourceHuntId + encounterId`. Unknown/unowned source Hunt returns `404 not_found` without
binding the key. For an unseen structurally valid capture request, after self-scoping the route the server
enters the shared Player-wide Hunt-command serialization boundary, rechecks/claims the public correlation,
then checks the pending decision. No matching pending decision returns durable
`409 capture_unavailable`. Only then may an `attempt` validate/freeze Ball authority and only then may
the command freeze an `advancementHuntId` prelude. After any 202 continuation reaches its frozen target,
the pending row is locked/revalidated again before attempt/skip commit.

The capture body is a closed discriminated union:

- `decision = "attempt"` requires exactly `decision / encounterId / selectedItemId`;
- `decision = "skip"` requires exactly `decision / encounterId`; `selectedItemId` is invalid on skip;
- any missing/extra branch field is `400 invalid_request` before semantic command acceptance.

Error precedence after route self-scope for a new attempt is therefore:
`capture_unavailable` first, then `capture_ball_not_authorized`, then any advancement-prelude result,
then final-boundary `insufficient_ball`.

Attempt:

- before freezing an active-Hunt advancement prelude, the server validates `selectedItemId` against the
  **current server-selected accepted capture-Ball authority for new manual attempts** and freezes that
  exact Ball authority version under the public command. An unauthorized ItemId therefore returns durable
  `422 capture_ball_not_authorized` without advancing an unrelated active Hunt;
- Ball availability/reserve for this explicit attempt is evaluated from authoritative Inventory at the
  final manual command boundary after any required 202 advancement completes; a delayed manual attempt may
  use items acquired after the Encounter completed. Quantity is not reserved by the earlier validation;
- the explicit manual decision maps 1:1 to one TASK-036 attempt correlation and one frozen server-owned,
  domain-separated capture RNG origin; response-loss retry reuses both;
- accepted success/failure consumes exactly one Ball and closes the pending decision;
- a rejected/stale/ineligible attempt consumes neither Ball nor capture opportunity;
- replay returns the original outcome and cannot debit/reroll.

Manual capture result mapping is explicit:

- unknown/unowned route `:huntId` -> `404 not_found` before semantic command acceptance;
- no matching still-pending Player-wide decision, or an Encounter already consumed by another accepted
  attempt -> `409 capture_unavailable`;
- selected ItemId absent from the current accepted new-manual-attempt Ball authority ->
  durable `422 capture_ball_not_authorized` before the active-Hunt prelude is frozen;
- frozen active-Hunt prelude overtaken by another command -> durable `409 command_superseded`, with no
  manual attempt/skip consequence;
- authoritative Inventory at the final attempt boundary has fewer than one selected Ball ->
  `409 insufficient_ball`;
- internal Inventory OCC loss before the command's serialized/locked boundary is established -> retry the
  same frozen command inside the service; after the authoritative boundary is established, an unexpected
  stale result is an integrity/concurrency failure and must not be converted into a fresh client-selected
  attempt or another RNG origin;
- exact historical/content/capture authority unavailable -> `503 authority_unavailable`.

If a manual-capture command froze `advancementHuntId = none` (or a specific Hunt that later terminalized)
and subsequently pauses on a post-freeze infrastructure failure, acceptance alone does **not** reserve a
Ball or grant Inventory precedence over later commands. The manual command does not adopt or advance that
newer Hunt. Its Inventory/capture linearization point is the final outer transaction in section 9.1:

- if a newer Hunt starts/advances and commits an Inventory consequence before that final manual transaction,
  the recovered manual command observes that newer committed Inventory and may return
  `409 insufficient_ball`;
- if the manual final transaction commits first, later Hunt Inventory-dependent boundaries observe the
  resulting debit;
- Hunt history already committed before the manual final transaction is never revisited or reinterpreted.

This commit-order rule is intentional and is consistent with delayed manual capture using then-current
authoritative Inventory without reservation.

For an accepted manual attempt, TASK-038 must call TASK-036's transaction-scoped capture commit inside the
same outer database transaction that:

1. locks/revalidates the exact Player-wide pending manual decision;
2. commits the one-Ball debit and accepted TASK-036 success/failure consequence;
3. closes that exact pending decision as attempted/consumed; and
4. terminalizes the durable public command result.

No transaction may expose a committed Ball debit/capture outcome while the same pending decision remains
open. A crash before commit leaves all four uncommitted; a crash after commit replays the closed decision
and prior capture result. An accepted attempt can therefore never be followed by a different-key accepted
`skip` or second attempt for the same pending decision.

The standing auto-capture `minimumReserve` does not constrain this explicit manual attempt. Reserve is an
automatic-use policy guard; an explicit player-selected attempt may consume a Ball below that configured
reserve.

Accepted attempt success/failure returns `200`:

```json
{
  "state": { "...": "the complete section-5 Player-wide Hunt state" },
  "capture": {
    "decision": "attempt",
    "encounterId": "opaque",
    "selectedItemId": "opaque",
    "outcome": "success",
    "pokemonInstanceId": "uuid"
  }
}
```

On accepted failure, `pokemonInstanceId` is null.

Skip:

- closes only the exact pending manual decision;
- consumes no Ball;
- creates no capture outcome/Pokémon;
- is durable-idempotent under the public command key.

Accepted skip closes the exact pending decision and terminalizes its public command result in one
transaction; it never races an accepted attempt on the same pending row.

Accepted skip returns `200`:

```json
{
  "state": { "...": "the complete section-5 Player-wide Hunt state" },
  "capture": {
    "decision": "skip",
    "encounterId": "opaque"
  }
}
```

Automatic capture of later forward encounters may coexist with an older manual pending decision after the
Player enables auto-capture. The older pending decision is never retroactively converted into an automatic
attempt; automatic attempts use their own completed Encounter evidence and do not overwrite that pending
manual decision.

### 9.2 Explicit healing item use

`POST /player/hunts/:huntId/items/use`

Required `Idempotency-Key`.

Request:

```json
{
  "itemId": "opaque",
  "targetPokemonInstanceId": "uuid"
}
```

This route implements only the explicit normal `heal-hp` Hunt item boundary already accepted by
SPEC-007/SPEC-013. It does not authorize revival, automatic Potion use, arbitrary Inventory mutation or
client-selected item-rule versions.

For an unseen key, the server:

1. self-scopes `:huntId`; unknown/unowned returns unbound `404 not_found`;
2. serializes on the shared Player-wide Hunt-command boundary, rechecks the public correlation and then
   revalidates that this Hunt is still the Player's current active Hunt; owned terminal/non-current state
   becomes durable `409 hunt_not_active` only inside that serialized boundary;
3. validates that `targetPokemonInstanceId` is one of the Hunt's pinned Team members; otherwise durable
   `422 hunt_item_target_invalid` without disclosing whether another Pokémon exists elsewhere;
4. resolves the current server-selected exact accepted ItemRule authority for `itemId`; only
   `useKind = "heal-hp"` is supported. Unresolved/non-healing/revival-like use is durable
   `422 hunt_item_not_supported`; missing configured authority before freeze is unbound
   `503 authority_unavailable`;
5. locks Inventory and requires at least one unit at command acceptance; otherwise durable
   `409 insufficient_item`. This proves the Player owned the requested usable item when ordering it but
   does not reserve the quantity;
6. freezes the exact ItemId, target, immutable ItemRule/game-data/rules authority and one monotonic
   Player/Hunt command-acceptance order before any advancement. Retreat and every other terminalizing
   Hunt command also receive a position in this same monotonic Player/Hunt acceptance sequence whenever
   equal-logical-boundary ordering can affect whether a waiting heal applies. This step durably creates the
   scheduled-heal **domain record**; it is no longer dependent on continued validity of the transport
   Idempotency-Key;
7. freezes the normal TASK-037 submission cutoff from server time and reconciles toward it with the common
   one-segment `202 in_progress` protocol.

Steps 6–7, including the scheduled-heal domain record, acceptance-sequence position and frozen submission
cutoff, commit atomically before any advancement. A crash cannot persist the scheduled heal without its
cutoff or let a same-key retry choose a later cutoff.

After the submission cutoff is reached:

- if the Hunt is already terminal, the item command completes `200` with
  `outcome = "not_applied"`, `reason = "hunt_terminal"`, and consumes nothing;
- otherwise classify the Hunt's exact Encounter/phase **at the reconciled submission cutoff C** and freeze
  that classification on the item command;
- if C is a deterministic inter-Battle state, resolve the item consequence immediately at C;
- if a Battle is active at C, persist the command as waiting for the **first deterministic inter-Battle
  command boundary after the Encounter that is current at C**. The command returns:

```json
{
  "status": "waiting_boundary",
  "huntId": "uuid",
  "targetPokemonInstanceId": "uuid"
}
```

with HTTP `202`. This is not a terminal replay result. Repeating the same item command while that boundary
has not yet been reached returns the same waiting state and does not invent future logical time. Normal
**any** authoritative advancement of that Hunt — checkpoint, claim, retreat, policy-save prelude,
manual-capture prelude, another item-use submission/reconciliation, or automatic terminalization work —
must consult the same durable waiting-item set and resolve commands whose structural boundary becomes due.
Replay of the item key after resolution returns its stable terminal result.

At an eligible inter-Battle boundary, due healing-item commands are ordered by the frozen
server-authoritative command-acceptance sequence. Equal-boundary retreat/terminalizing-command ordering
uses that same sequence exactly as SPEC-013 requires. The exact same-logical-time order is:

1. finish the Battle terminal outcome, mandatory replacement and cadence/effect work already due at that
   boundary under SPEC-003/SPEC-013;
2. if the Encounter completed successfully, commit its reward and capture/auto-capture consequence under
   section 7 before any later Inventory-dependent operation;
3. resolve the earliest due waiting healing-item command in frozen acceptance order; if another due heal
   remains, persist the same logical boundary and return/continue through section 4.3.1 before doing
   anything later;
4. after no due heal remains, initialize/start the next Battle/Encounter if the Hunt rules say it is due at
   that same logical instant (including `interBattleGapMs = 0`); otherwise advance any positive
   `interBattleGapMs` time toward that next Encounter.

Therefore an Encounter reward committed at step 2 is part of current Inventory for a due heal at step 3;
the heal never executes before already-due combat/cadence/KO work and never moves logical time backward.
A cutoff exactly equal to Battle-end time `T` is therefore classified as the inter-Battle boundary at
`T`: Battle terminal/reward/capture work is completed first, due heals resolve next, and a zero-gap next
Battle is initialized only afterward.

Cutoff semantics freeze this sub-instant ordering: when an advance target is exactly `T`, the authoritative
checkpoint may complete steps 1–3 at `T` but **does not execute step 4 solely because its start time also
equals T**. The persisted phase at that target remains `interBattle`. Starting/initializing the zero-gap
next Battle is productive history beyond the reached cutoff and occurs only on a subsequent advancement
that may proceed past that boundary. The same rule applies at the exact end of a positive
`interBattleGapMs`: reaching that cutoff persists the inter-Battle boundary before next-Battle
initialization. A later heal clamped to an already-committed T therefore never inserts itself before history
that was previously committed.

For the one due item command selected in step 3:

- lock/revalidate the pinned Hunt Team target and authoritative Inventory;
- require `0 < currentHp < maxHp`; a KO/full/missing pinned target completes with
  `outcome = "not_applied"`, `reason = "target_ineligible"`, consuming nothing;
- require one current unit of the frozen ItemId; otherwise complete with
  `outcome = "not_applied"`, `reason = "insufficient_item"`, consuming nothing;
- load the exact frozen `heal-hp` rule and normalize it into the shared SPEC-007/SPEC-003 healing
  evaluator;
- commit the one-unit Inventory debit, resulting Hunt HP state/checkpoint change and durable item-command
  terminal result in one outer transaction. No debit may commit without the heal consequence and no heal
  consequence may commit without its debit.

If the Hunt terminalizes before a waiting command's inter-Battle boundary, or retreat's stop boundary is
strictly before it, that scheduled heal completes as `not_applied / hunt_terminal` with no debit.
The terminal-Hunt transaction performs one set-based update that closes **all** still-scheduled healing
domain records for that Hunt and records their domain terminal timestamp/reason. For any still-supported
Idempotency-Key, replay can return the corresponding terminal `200`; an already-expired transport key
continues to return `410 idempotency_gone` even though the domain record has resolved. This set-based
metadata cancellation is not a due-heal resolution and is not subject to the one-resolved-heal-per-invocation
bound.
If the item command and retreat share the same boundary, their frozen acceptance order decides whether the
item applies before terminalization or is canceled.

Applied success returns `200`:

```json
{
  "state": { "...": "the complete section-5 Player-wide Hunt state" },
  "itemUse": {
    "itemId": "opaque",
    "targetPokemonInstanceId": "uuid",
    "outcome": "applied",
    "healedHp": 20,
    "reason": null
  }
}
```

Terminal no-effect completion returns the same shape with `outcome = "not_applied"`,
`healedHp = 0`, and `reason = "target_ineligible" | "insufficient_item" | "hunt_terminal"`.

No offline/checkpoint path fabricates a healing command. It may only execute a command that the Player
already explicitly accepted and that is due under its frozen inter-Battle ordering.

## 10. Standing auto-capture policy

### 10.1 Read

`GET /player/hunts/auto-capture-policy`

Returns the current complete policy:

```json
{
  "policyVersion": "uuid",
  "ballAuthorityVersion": "opaque",
  "rowVersion": "0",
  "enabled": false,
  "balls": [
    {
      "itemId": "opaque",
      "autoUseEnabled": false,
      "minimumReserve": "0"
    }
  ],
  "rules": []
}
```

Before any saved policy exists, the read returns `policyVersion: null`, the current server-selected
`ballAuthorityVersion`, `rowVersion: "0"`, `enabled: false`, and empty `balls`/`rules`. This is
the immutable disabled default and authorizes no automatic Ball use.

For saved policies, the server accepts/returns only ItemIds present in the exact accepted capture-Ball
authority available to the Player/runtime. VIP/premium classification comes from server-owned content
authority, never client naming.

Each accepted policy version freezes the exact server-selected `ballAuthorityVersion` required to
interpret every referenced ItemId. Historical/offline evaluation must load that exact immutable authority
and fail closed if unavailable; it never reinterprets a policy under the latest Ball catalog. The client
does not submit or select this version.

### 10.2 Replace

`PUT /player/hunts/auto-capture-policy`

Required `Idempotency-Key`.

Request:

```json
{
  "expectedRowVersion": "0",
  "enabled": true,
  "lossWarningAcknowledgement": "auto_capture_irreversible_loss_v1",
  "balls": [
    {
      "itemId": "opaque",
      "autoUseEnabled": true,
      "minimumReserve": "10"
    }
  ],
  "rules": [
    {
      "when": {
        "shiny": true,
        "speciesIds": ["opaque"],
        "zoneIds": ["opaque"],
        "huntDefinitionIds": ["opaque"],
        "catchRateMin": 3,
        "catchRateMax": 45
      },
      "selectedItemId": "opaque"
    }
  ]
}
```

Policy replacement is complete, ordered and bounded:

- the top-level PUT object is a closed schema: `expectedRowVersion / enabled / balls / rules` are required;
  `lossWarningAcknowledgement` is the only optional key when `enabled=false` and is required with the
  exact accepted token when `enabled=true`; missing or wrong acknowledgement while enabled is
  `422 auto_capture_policy_invalid`;
- every `balls[]` entry is a closed object permitting only
  `itemId / autoUseEnabled / minimumReserve`;
- every `rules[]` entry is a closed object requiring exactly `when / selectedItemId`; `when` is always
  an object and may be empty only to express the explicit catch-all;
- every `when` is a closed object permitting only
  `shiny / speciesIds / zoneIds / huntDefinitionIds / catchRateMin / catchRateMax`;
- any unknown field at any of those levels fails as `400 invalid_request` before policy semantics are
  evaluated; an unknown/typo condition can therefore never collapse into the empty-`when` catch-all;
- maximum 16 Ball entries;
- maximum 64 ordered rules;
- each condition list maximum 64 entries;
- every condition list, when present, contains at least one entry;
- Ball entries have unique `itemId`; condition lists contain no duplicates;
- condition fields are optional and conjunctive within one rule;
- `speciesId` is the exact form-aware SpeciesDefinition identity, so form-specific rules use that identity
  directly rather than a client-authored form alias;
- `catchRateMin`/`catchRateMax` are optional inclusive integer bounds in `3..255`, with
  `catchRateMin <= catchRateMax`; they compare only the canonical public frozen Species/form
  `catchRate` and introduce no derived rarity/difficulty category;
- rules are evaluated in array order; a matching rule whose selected Ball is not currently eligible falls
  through to the next rule;
- an empty `when` is a catch-all;
- `enabled=true` requires at least one rule and at least one explicitly enabled Ball entry. It is valid for
  the saved ordered conditions to match no particular future Encounter; such uncovered encounters use the
  explicitly accepted permanent no-eligible-loss behavior rather than making the policy structurally
  invalid;
- when `enabled=false`, `lossWarningAcknowledgement` may be omitted; if present it must equal the exact
  accepted warning token, otherwise the request is `422 auto_capture_policy_invalid`;
- every referenced `speciesId`, `zoneId` and `huntDefinitionId` must resolve in the exact current
  server-selected accepted Species/Hunt content authority used to validate this policy save; unknown
  references are `422 auto_capture_policy_invalid`. The accepted policy version records that validation
  authority identity for audit, while historical rule evaluation remains exact equality against the
  Encounter's already-frozen visible IDs and never substitutes latest content;
- only visible frozen facts in the schema may branch selection;
- hidden Genetics/Grade/Score/Profile/Ascendant cannot appear in request, persistence or evaluation;
- every saved rule-selected ItemId must reference exactly one `balls[]` entry and that entry must have
  explicit `autoUseEnabled=true`, even while the policy's global `enabled=false`. Global disable blocks
  execution; it does not relax referential integrity or preserve a broken future-enabled policy;
- a Ball is inventory-eligible only when one-unit debit leaves quantity >= `minimumReserve`;
- VIP/premium Ball auto-use defaults OFF in a new policy and is valid only through explicit Ball permission
  plus an explicit ordered rule; it is never an implicit fallback;
- if no eligible rule/Ball resolves, the automatic opportunity closes permanently with no manual fallback
  or recovery queue.

When `enabled=true`, the exact acknowledgement token above is required on every accepted replacement.
This protocol requirement allows clients to prove they are using the accepted warning version; UI still
must actually present the warning before submission. The warning states that uncovered, unavailable or
reserve-blocked opportunities, including visible Shiny encounters, are permanently lost and later policy
changes are forward-only. When an active Hunt has elapsed history, the warning/confirmation also makes
clear that saving a new policy first reconciles that elapsed interval under the **previous** policy; the
new policy cannot rescue or reinterpret opportunities before its effective logical boundary.

For a new policy PUT, validation/freeze order is fixed:

1. parse the closed request shape; malformed/unknown fields -> unbound `400 invalid_request`;
2. under the shared Player-wide serialization boundary, replay-check the key and lock/read the current
   policy root;
3. compare frozen request `expectedRowVersion`; mismatch is claimed/terminalized as durable `409 stale`;
4. resolve the exact current accepted capture-Ball authority and Species/Hunt content authority used for
   this save. If unavailable before command claim/freeze, return unbound `503 authority_unavailable`;
5. claim the command key and freeze those exact authority identities for the lifetime of this save;
6. validate all non-Ball policy values/relationships/content references against the frozen authorities;
   failure -> durable `422 auto_capture_policy_invalid`;
7. validate referenced Ball ItemIds against the frozen Ball authority; failure ->
   durable `422 capture_ball_not_authorized`;
8. only after those validations succeed may the command freeze/execute an active-Hunt advancement prelude.

The same frozen Ball/content authority versions are used at final activation after any `202` continuation;
catalog/configuration changes during catch-up cannot reinterpret the already-accepted save.

### 10.3 Forward-only policy activation

If a Hunt is active, the policy-save command first advances that Hunt to the save command's frozen cutoff
using the previously authoritative policy interval. Only after that boundary is reconciled may the new
policy version become effective. The new version is pinned for subsequent Hunt logical time.

If no Hunt is active, the new policy becomes the current version for the next Hunt start.

If that required advancement terminalizes the active Hunt before policy activation, the new policy still
commits as the Player's current standing policy but has no retroactive interval in the terminal Hunt;
`effectiveAt` is null and the version first applies at the next Hunt start.

Policy replacement uses the same Player-wide Hunt-command serialization boundary as start. Three legal
commit/activation outcomes cover start/save races and delayed recovery:

- save activates first: a subsequent Hunt start pins the new policy;
- a Hunt start commits before a save that is accepted while that Hunt is active: the Hunt pins the prior
  policy, then the save advances only that frozen Hunt to its save boundary under the prior policy before
  activating the new version for subsequent logical history;
- a save is accepted with no active Hunt, or its frozen prelude Hunt terminalizes before activation, and a
  different Hunt starts before the save later activates: that intervening Hunt keeps the prior policy for
  its entire pinned lifetime. The recovered save must not adopt/advance that newer Hunt; if its
  `expectedRowVersion` still matches, it becomes the standing policy with `effectiveAt = null` for the
  next Hunt after the intervening one.

No outcome may retroactively change a Hunt's already-pinned policy interval.

The request's `expectedRowVersion` is frozen as part of the normalized command intent. It is checked when
the save is first accepted **and checked again under the same Player-wide serialized transaction immediately
before policy activation** after any `202` advancement prelude. If another accepted policy save changed
the rowVersion meanwhile, the prelude advancement remains committed but this policy save terminalizes as
durable `409 stale`; it does not activate, does not substitute a fresh rowVersion and does not silently
overwrite the intervening policy. Response-loss replay returns that same terminal stale result or the same
successful policy version/effective boundary.

Accepted replacement returns `200`:

```json
{
  "policy": {
    "policyVersion": "uuid",
    "ballAuthorityVersion": "opaque",
    "rowVersion": "1",
    "enabled": true,
    "balls": [
      {
        "itemId": "opaque",
        "autoUseEnabled": true,
        "minimumReserve": "10"
      }
    ],
    "rules": [
      {
        "when": {},
        "selectedItemId": "opaque"
      }
    ]
  },
  "effectiveAt": {
    "huntId": "uuid",
    "logicalTimeMs": "1234"
  }
}
```

When no Hunt is active, `effectiveAt` is null and the policy applies from the next Hunt start.

## 11. Automatic capture boundary

TASK-038 must add an orchestration boundary capable of stopping deterministic Hunt advancement at each
successful Encounter completion before subsequent productive history is simulated.

The boundary must:

- preserve the existing TASK-035 deterministic Battle/Encounter result;
- freeze/reuse one Encounter-owned server-side reward RNG origin before reward resolution;
- derive one exact capture source from that completed Encounter evidence even when an older manual pending
  capture decision exists;
- resolve the policy version effective at that logical time;
- lock/revalidate the authoritative Inventory state used by Ball availability/reserve evaluation before
  freezing the selected Ball; selection and the accepted one-unit debit occur within the same authoritative
  transaction boundary so no unlocked Inventory snapshot can choose a Ball that is debited later;
- freeze one Encounter-owned automatic-opportunity record containing the policy version, selected Ball (or
  explicit no-eligible-Ball closure), stable automatic capture correlation and server-owned capture RNG
  origin before TASK-036 resolution;
- close the automatic opportunity deterministically when no Ball is eligible;
- resume the same Hunt state only after capture/reward side effects for that boundary are actually
  committed; durable retry evidence may pause at the boundary but never authorizes simulation beyond it;
- recover the same automatic opportunity across process loss even when recovery happens under a different
  outer checkpoint/claim/retreat/policy-save command;
- remain direct-vs-segmented deterministic.

The existing manual pending-decision field remains for manual mode/backlog compatibility. Automatic capture
does not require occupying/replacing that single manual pending slot.

Every authoritative Hunt advancement path also evaluates the same durable set of accepted healing-item
commands. When a successful Encounter closes, section 9.2's same-time order applies: Encounter
reward/capture commits first, then due healing commands, then any positive inter-Battle gap may advance.
This orchestration is endpoint-independent; checkpoint, claim, retreat, policy-save, manual-capture prelude
and another item-use reconciliation cannot produce different results merely because a different endpoint
crossed the boundary.

## 12. Persistence and transaction boundaries

TASK-038 may add the smallest forward schema required for:

- one Player Hunt root enforcing at most one active Hunt and Player-wide `recoveryReadyAt`;
- durable public Hunt-command correlations/results;
- terminal Hunt metadata needed for replay/audit;
- unresolved same-Zone PendingEncounterSelection outside a terminal Hunt, keyed so each Player+Zone has at
  most one unresolved token while different Zones may retain their own unresolved outcomes;
- versioned auto-capture policies plus their normalized Ball/rule rows;
- effective policy-version boundaries for active Hunt logical time;
- one Encounter-owned automatic-opportunity record per forward automatic boundary, including immutable
  policy version, selected Ball or no-eligible-Ball closure, stable automatic capture correlation, frozen
  TASK-036 capture RNG origin/continuation and committed/replayable outcome state;
- one durable manual-opportunity disposition for successful Encounters evaluated while auto-capture is
  disabled: exact pending-decision creation or blocked-by-existing-pending, so restart cannot create/replace
  a different manual decision for the same completed Encounter;
- command-local durable claim aggregation sufficient to reconstruct final `200` replay from the claim's
  own committed progress segments; superseded claims retain no transferable reporting ownership;
- one Encounter-owned frozen reward RNG origin/continuation bound to the immutable reward-source identity,
  retained until its Reward Resolution is durable and replayable;
- manual pending-decision closure evidence;
- durable accepted healing-item commands with source Hunt, submission cutoff, Encounter/phase identity,
  target, ItemId, exact ItemRule/game-data/rules authority, monotonic acceptance order, structural
  inter-Battle boundary state and terminal applied/not-applied result.
- one monotonic Player/Hunt acceptance-sequence position for every accepted command whose consequence may
  compete at the same logical boundary, including waiting healing-item commands and retreat/other
  terminalizing Hunt commands. Equal-boundary ordering never falls back to database row order or arrival
  timing after acceptance.

Exact table decomposition is implementation-owned, but these invariants are mandatory:

- active-Hunt uniqueness is database-enforced/serialized, not UI-only;
- all Hunt/policy mutations serialize through one Player-wide Hunt-command boundary after replay lookup;
- public command replay lookup occurs before mutable-current authority can change an accepted result;
- unseen public command correlations are re-checked/claimed under the shared Player-wide serialization
  boundary before effects, so concurrent first delivery cannot create two accepted command records;
- pending/progressing **transport correlations** cease being executable after the section-4.3 30-day
  continuation lease and exact old-key lookup returns the retained `410 idempotency_gone` tombstone;
  accepted scheduled-heal domain records are not transport correlations and remain in due-heal queries
  until applied/not-applied or source-Hunt terminalization;
- a commit that advances beyond another pending ordinary advance-to-cutoff command's frozen target eagerly
  terminalizes that older correlation as `command_superseded`, so abandoned overtaken commands do not
  remain pending indefinitely; accepted healing-item timeline commands are excluded and resolve only
  through section 9.2's applied/not-applied boundary semantics;
- every advancement path consults/locks the same due healing-item set and resolves it in frozen acceptance
  order at the section-9.2 boundary, at most one due heal per invocation, so direct/segmented and
  endpoint-to-endpoint advancement are identical while Worker execution remains bounded;
- no transaction exposes a new checkpoint that omits already-completed Encounter reward/capture evidence;
- advancement cannot cross from Encounter N into later productive history until N's reward/capture effects
  are actually applied, guaranteeing N's item grants are visible to N+1 Inventory-dependent auto-capture;
- for Encounter N, automatic Ball eligibility/selection (or explicit no-eligible closure) is frozen from
  the locked **pre-N-reward Inventory**. Within the authoritative Encounter-boundary work, the accepted
  automatic Ball debit/capture consequence is ordered before N's reward grant becomes visible. The boundary
  may commit those effects together in one transaction or persist exact retryable boundary state and stop
  before later productive history, but retry reuses the frozen opportunity and never reselects a Ball from
  Inventory that already contains N's reward. N can therefore never fund its own immediate auto-capture;
- same Encounter cannot own more than one accepted TASK-036 attempt;
- one outer advancing command may own many Encounter-scoped automatic attempt correlations without
  collapsing them into one command correlation;
- reward source/application and capture debit/grant remain exactly-once under existing authorities;
- automatic Ball reserve evaluation, selection and accepted debit use one locked authoritative Inventory
  boundary; a persisted selected Ball is never derived from an unlocked snapshot that may have gone stale;
- reward retry/recovery reuses the same Encounter-owned reward RNG origin and cannot reroll probabilistic
  drops before/after process loss;
- accepted manual capture consequence + exact pending-decision closure are one outer transaction, preventing
  a committed attempt from leaving a skippable/re-attemptable pending decision;
- manual capture acceptance does not reserve Inventory; when no active-Hunt prelude is frozen, its final
  transaction is the Inventory/capture linearization point and earlier committed Hunt history is never
  retroactively recomputed;
- stale/OCC writers cannot overwrite newer Hunt/policy state;
- policy versions referenced by historical logical intervals are immutable;
- each policy version binds an exact immutable capture-Ball authority version;
- no operation silently substitutes latest game data/rules/policy/Ball authority for a pinned historical one.
- v1 Inventory mutations capable of affecting Hunt auto-capture (reward grants, Ball debits and explicit
  Hunt healing-item use) are ordered through the same authoritative Hunt/Player serialization boundaries;
  that committed serial order is authoritative for otherwise-independent commands. A future non-Hunt/public
  Inventory writer may not bypass those ordering boundaries in a way that changes already-committed
  historical Hunt capture outcomes based on uncontrolled processing time; that future feature must define a
  Class-A ordering/integration contract before launch.

## 13. Security and privacy

- No client field supplies Hunt seed, RNG state, checkpoint bytes, capture RNG origin, reward source key,
  individualization authority key or hidden Genetics.
- Public wild-Encounter state never exposes HP/maxHP, HP percentage or derived stat values that can encode
  or help infer hidden IV/Genetic inputs before capture.
- Owned-Team current HP remains visible because it is the Player's own authoritative Hunt state. Repeated
  observation of legitimate combat consequences may still permit coarse inference about opponent bulk;
  v1 accepts that unavoidable gameplay side channel while prohibiting direct hidden-stat fields, exact
  wild HP/HP% and any auto-capture policy branch on inferred/hidden Genetics. TASK-028 owns any later
  event-stream granularity and must not reintroduce a more precise hidden-Genetics oracle.
- Cross-Player Hunt/Team/Inventory selectors do not disclose resource existence.
- Idempotency keys may be logged only as bounded command metadata; full checkpoint/policy payloads are not
  security-audit log defaults.
- Server errors do not expose SQL, connection strings, auth/session secrets or opaque checkpoint bytes.

## 14. Implementation handoff to TASK-038

After this spec is APPROVED, TASK-038 remains Class B implementation work and may:

- add Hunt HTTP/application/runtime adapters within this route/payload contract;
- add the forward migration and repositories described in section 12;
- extend game-core/Hunt orchestration with the section-11 capture boundary while preserving existing combat
  and capture authorities;
- compose TASK-024, TASK-036 and TASK-037 transactionally/idempotently;
- persist/process section-9.2 accepted healing-item timeline commands through every Hunt advancement path,
  using the shared SPEC-007/SPEC-003 heal evaluator and no revival/auto-use;
- add disposable PostgreSQL race/replay/restart coverage;
- add Worker compatibility and full workspace validation.

TASK-038 must not widen the public protocol or change gameplay/economy semantics without a new accepted
Class A change.

TASK-038 may retain/return internal authoritative Hunt simulation evidence needed for later presentation,
but it must not invent a second public combat-event schema. TASK-028 owns the versioned presentation-event
contract consumed by TASK-029/030 and later TASK-039/040. If exposing those events over Hunt HTTP requires
an additional public route/payload beyond this spec, that protocol delta must be accepted before the UI
integration uses it.

TASK-039/settings presentation must make the policy semantics inspectable without rewriting them:

- show that `minimumReserve` is an **auto-use** reserve measured as quantity remaining after the debit;
- warn/preview rule shadowing and early catch-all placement while preserving the exact saved order;
- make uncovered/reserve-blocked/VIP-not-authorized conditions understandable before enable/save;
- surface when one unresolved manual pending decision is blocking later auto-OFF manual opportunities;
- when a mutation returns `202 in_progress`, continue the exact same command/key and present that prior
  Hunt history is still being reconciled; do not imply the final policy save/capture/retreat consequence
  has already completed;
- when item use returns `202 waiting_boundary`, show it as an already-accepted scheduled heal, not a
  failure. The client may continue normal Hunt checkpoint/claim flow; any authoritative advancement can
  resolve the item. While the original key remains inside its supported replay lifetime, replay returns its
  terminal applied/not-applied result after resolution; after transport-key expiry it returns
  `410 idempotency_gone` while the already-accepted scheduled-heal domain action remains authoritative.
  Do not create a replacement item command merely because the boundary is still pending. v1 does not add
  a public scheduled-heal queue/readback field to `GET /player/hunts/state`; the UI may present this
  accepted-waiting state only while it retains the original command correlation locally. After reload or
  transport-key expiry it must not infer queue contents from Hunt state. Any future durable queue/readback
  surface is a separate public-contract change rather than an implementation detail;
- after a terminal response, refresh/read current state as needed rather than treating an old replayed
  command-result snapshot as the latest Hunt state.

These are presentation/diagnostic requirements only. UI must not silently reorder policy rules, lower
reserves, enable premium/VIP Balls, create fallback attempts or submit a new command key in place of a
required same-key continuation.

TASK-039/settings presentation must also make the one-manual-pending capacity and forward-only policy
effective boundary understandable to the Player. Ordered rules/reserves are intentional strategy; UI may
preview/lint shadowed rules or catch-all placement, but that presentation assistance must not silently
reorder or rewrite the saved policy.

## 15. Acceptance criteria

- [ ] Public route/method/payload/error semantics are explicit and self-scoped.
- [ ] All mutations use durable command identity and exact replay/conflict behavior.
- [ ] Long advancement exposes one bounded segment per invocation with 202 same-key continuation and a
      terminal 200/409 result; Worker requests never hide an unbounded loop.
- [ ] Fixed-cutoff semantics remain exactly TASK-037.
- [ ] One-active-Hunt, recovery and same-Zone no-free-reroll survive restart/concurrency.
- [ ] Auto-capture policy version changes are forward-only by Hunt logical interval.
- [ ] Every policy version pins the exact immutable capture-Ball authority used for historical evaluation.
- [ ] Hidden Genetics cannot affect or leak through Ball selection.
- [ ] VIP/premium auto-use requires explicit authorization and is never implicit fallback.
- [ ] No eligible auto Ball closes the opportunity with no debit/manual fallback/queue.
- [ ] Auto-disabled successful Encounters create at most one Player-wide manual pending decision and never
      replace an unresolved one; blocked later opportunities are durable/replay-stable.
- [ ] An older manual pending decision can coexist with forward automatic attempts without being rewritten.
- [ ] Explicit heal-hp item commands preserve SPEC-013 submission/inter-Battle ordering under every
      advancement endpoint, never use generic command supersession, never auto-use/revive, and compose
      accepted Inventory debit + heal + terminal command result atomically.
- [ ] Encounter-local ordering is explicit: same-Encounter reward grants cannot fund that Encounter's
      immediate auto-capture, while later manual capture uses then-current authoritative Inventory.
- [ ] Reward/capture/checkpoint composition cannot duplicate Ball debit, Pokémon grant, XP/items or outcomes.
- [ ] Encounter reward RNG origin is stable across retry/restart/cross-command recovery and cannot reroll
      probabilistic drops.
- [ ] No production Ball ItemId/power/economy content is invented.
- [ ] Route-specific errors and closed nested policy schemas are explicit; unknown policy condition keys
      cannot broaden a rule into catch-all behavior.
- [ ] Independent QA has no unresolved P0/P1.
- [ ] Independent Auditor has no unresolved P0/P1 on authz/concurrency/idempotency/transaction composition.
- [ ] Required GSC/PXE advisory has no unresolved Human decision beyond those explicitly surfaced.
- [ ] Human Owner explicitly accepts the complete protocol and encounter-boundary ordering.

## 16. Human decisions required before approval

This DRAFT surfaces two explicit Human choices:

1. **Same-Encounter reward/capture inventory ordering:** automatic capture for Encounter N evaluates
   Inventory before applying Encounter N's own reward grants. Those grants can fund Encounter N+1 onward
   and may also fund a later explicit manual attempt for Encounter N if that manual decision remains
   pending.

This choice prevents an Encounter from dropping the Ball used to capture itself and makes the authoritative
boundary deterministic. GSC/PXE consultation must assess the gameplay/economy consequence before Human
acceptance.

2. **Disabled/no-saved policy default:** before the Player explicitly saves an auto-capture policy,
   auto-capture is disabled and no Ball has implicit auto-use permission. This deliberately chooses the
   most conservative downstream preset allowed by SPEC-014 rather than implicitly auto-using the baseline
   Poké Ball.

Human acceptance of SPEC-015 includes both choices.

### 16.1 Consultation evidence

Gameplay Systems Consultant:

- recommends **accepting** the proposed pre-current-reward automatic capture ordering;
- finds the single manual pending/no-replace rule, old-manual-plus-future-auto coexistence, ordered
  fallback/reserves, forward-only policy and bounded 202 continuation coherent with SPEC-013/014;
- flags player-visible consequences that must remain explicit: unresolved manual pending can block later
  rare/Shiny manual opportunities; broad early rules can shadow later rules; future auto use can consume
  stock the Player intended for an older manual pending unless reserves are configured; elapsed history
  before a policy save remains governed by the previous policy.

Player Experience & Economy Consultant:

- recommends **accepting** the same proposed ordering because it avoids circular self-funding and preserves
  Ball-sink integrity;
- recommends retaining delayed manual capture against then-current Inventory, auto-only reserves, ordered
  fallback, explicit premium/VIP opt-in, irreversible no-eligible closure and forward-only policy;
- notes that numerical Ball scarcity/burn cannot be validated until production Ball faucets/prices/stocks
  and measured Encounters/hour exist, so TASK-038 must not invent economy tuning;
- recommends measuring Ball burn by tier, reserve/no-eligible closures, fallback frequency, Shiny closures
  and Inventory floors before later economy tuning.

Both consultants identified no need to reopen already-approved SPEC-013/014 rules. The same-Encounter
ordering remains the new gameplay/economy choice they explicitly recommend accepting; the conservative
disabled/no-saved default is a downstream preset choice surfaced separately in section 16 and requires
Human acceptance with the complete protocol.
