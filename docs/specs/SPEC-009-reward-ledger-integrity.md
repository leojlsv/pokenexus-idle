# SPEC-009 — Reward Ledger & Integrity

- Status: APPROVED
- Owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Related ADRs: ADR-005
- Related tasks: TASK-013, TASK-021, TASK-022, TASK-023, TASK-024, TASK-087

## 1. Problem

PokeNexus already defines authoritative Pokémon/Player XP application and Inventory mutation, but it
does not yet define the durable boundary that proves whether one logical reward source has already
completed. OCC prevents lost concurrent aggregate writes; it does not by itself prevent replaying a
successfully committed reward after a response is lost or a caller retries with fresh row versions.

TASK-023 therefore needs one reward-ledger contract that composes accepted progression and Inventory
effects without inventing reward content. The contract must make retries, concurrent duplicate
delivery, stale state and historical version context deterministic and fail closed.

## 2. Goals

- make reward authority server-owned and explicit;
- give every durable logical reward source one stable idempotency identity;
- commit sibling reward effects atomically;
- make duplicate delivery converge on one durable completion;
- distinguish a true replay from a conflicting attempt to reinterpret the same source;
- preserve exact rules/game-data context required to interpret a reward;
- keep completion evidence immutable and useful for audit/recovery;
- give TASK-024 enough invariants to implement persistence safely.

## 3. Non-goals

This specification does not define:

- how much XP/items a Hunt, Battle, Gym, PvP, World Boss or other source awards;
- reward cadence, drop probability, loot tables, scarcity or content exhaustion;
- currencies, prices, sinks, trading or monetization;
- capture outcome/Pokémon creation;
- Move acquisition/eligibility;
- public HTTP payloads;
- concrete PostgreSQL table/column/index names or transaction isolation level;
- a general-purpose event-sourcing architecture.

## 4. Authority and terminology

### 4.1 Reward source

A **Reward Source** is an already-authorized server-side gameplay/content outcome that is allowed by
its owning accepted contract to resolve durable reward effects. Combat events, elapsed time, static
data, a client request or an arbitrary client idempotency key are not reward authority by themselves.

Every logical source is identified by the tuple:

```text
RewardSourceKey = (subjectPlayerId, sourceAuthority, sourceCorrelation)
```

- `subjectPlayerId` is the authoritative owning Player receiving the envelope.
- `sourceAuthority` is an opaque stable identifier for the accepted source contract/system.
- `sourceCorrelation` is an opaque stable identity for exactly one logical source occurrence under
  that authority.

The tuple is the durable idempotency key. Its uniqueness is enforced in persistence. A caller retry
must reuse it. A genuinely new source occurrence must use a different correlation.

`sourceCorrelation` is scoped by both `sourceAuthority` and `subjectPlayerId`; it is not required to
be globally unique across all players. A multi-recipient source may intentionally reuse one upstream
occurrence identity for different recipient Players because each recipient tuple is distinct. The
owning source contract must still prove that each subject is an eligible recipient. Changing the
subject is never a valid way to replay or bypass a single-recipient reward.

`sourceCorrelation` may originate from an upstream durable command/encounter/outcome identity, but
the server must validate that identity through the owning source contract. A client-provided request
ID, timestamp, display name, session token or retry counter cannot independently mint reward
authority or select a reward value.

### 4.2 Reward envelope

A **Reward Envelope** is the immutable resolved effect set for one `RewardSourceKey`.

Baseline v1 effect kinds are limited to already accepted domains:

1. Pokémon XP grant — exact target Pokémon instance and resolved non-negative XP amount per SPEC-006;
2. Player XP grant — the subject Player and resolved non-negative XP amount per SPEC-006;
3. Item grant — exact ItemId and positive quantity delta per SPEC-007.

Baseline ownership is subject-bound: Player XP mutates only `subjectPlayerId`; Item grants mutate only
that Player's Inventory; Pokémon XP may target only a Pokémon instance that the accepted
ownership/progression contracts authorize for that subject. Knowing another Player's/Pokémon's ID is
never reward authority. If ownership/target eligibility changes after durable resolution, application
fails closed under current target invariants rather than redirecting the frozen reward to another
Player or Pokémon.

The persisted envelope is canonical and contains at most one effect per logical `(effectKind,
target)` pair: at most one Player-XP effect, one Pokémon-XP effect per Pokémon instance and one Item
grant per ItemId. If an owning source conceptually produces repeated contributions to the same pair,
its resolver must deterministically combine them into one exact resolved amount **before** Reward
Resolution is claimed; otherwise resolution rejects. Application order must never change the
semantic total or rowVersion meaning.

Adding a new effect kind does not become valid by using this ledger. It requires the owning accepted
product/rules contract first.

### 4.3 Reward resolution

A **Reward Resolution** is immutable durable evidence binding one `RewardSourceKey` to one exact
Reward Envelope and its pinned interpretation context **before application**. It freezes entitlement
and resolved reward intent; it is not evidence that any XP/Item effect has completed.

The first accepted resolution for a source key wins. Any later attempt for that key must compare
against the durable resolution rather than re-resolve from mutable current state.

### 4.4 Completion record

A **Reward Completion** is immutable durable evidence that one exact envelope for one
`RewardSourceKey` committed successfully. Completion evidence is not a mutable balance cache and is
not permission to recompute the historical reward from current rules.

## 5. Resolution invariants

Before any durable mutation, the authoritative source resolves one complete envelope with:

- exact `RewardSourceKey`;
- exact ordered/normalized effect descriptors;
- exact `gameDataVersion` and/or `rulesVersion` required to interpret those effects;
- any stable source-domain identity required by the owning contract to prove the correlation is
  eligible.

Resolved reward amounts and target identities are fixed for that logical source occurrence. A retry
may recompute **derived target state** such as post-grant Level from fresh aggregate state, but it may
not silently change the already-resolved grant amount, target, ItemId, source identity or pinned
version context.

The accepted envelope/context is persisted as the source's immutable Reward Resolution before reward
application begins. Resolution creation may be transactionally composed with the owning source's
durable outcome when that source lives in the same persistence boundary. Regardless of physical
schema, there must be no interval in which a reward effect can commit while its exact resolution is
not durable.

If a process fails after the source outcome is known but before local Reward Resolution is durable,
the owning source must be capable of reproducing the **same** resolution from an immutable/pinned
source outcome. A mutable "current state" recomputation is not an acceptable idempotency strategy.

If the required rules/game-data version is missing, incompatible or cannot resolve the required
accepted semantics, the operation fails closed before reward mutation and before completion evidence.
There is no latest/current fallback.

## 6. Atomicity model

### 6.1 One source, one atomic envelope

The v1 rule is:

> One `RewardSourceKey` resolves to one all-or-nothing Reward Envelope.

All sibling effects in that envelope and its Reward Completion commit in one database transaction
using the already-durable immutable Reward Resolution as the intent authority.
No sibling effect or completion row may survive if another required sibling effect fails, rejects,
overflows, observes stale required state or otherwise cannot commit.

This closes the ownership left open by SPEC-006/007: Pokémon XP, Player XP and Item grants emitted by
one logical reward source are atomic siblings when placed in the same envelope.

If a future source deliberately needs independently committable rewards, it must model them as
distinct logical source occurrences with distinct `RewardSourceKey` values before application. An
implementation must not simulate independence by partially completing one envelope.

### 6.2 Aggregate versions

Every mutable aggregate version required by the envelope invariant is validated in the same
transaction. A successful Inventory version check is not proof that a Pokémon/Player version is
current, and vice versa.

TASK-024 may use conditional writes, row locks, transaction isolation or another PostgreSQL-safe
strategy consistent with ADR-005. This specification defines outcomes, not a blanket locking mode.

## 7. Idempotency and replay

### 7.1 First accepted resolution

For an unseen `RewardSourceKey`, the server validates source authority/eligibility and durably claims
exactly one immutable Reward Resolution. Concurrent attempts race on the complete source key:

- an identical proposed resolution converges on the existing resolution;
- a different proposed envelope/context is an integrity conflict and fails closed.

Creating a Reward Resolution does not mutate XP/Inventory and does not mean the reward completed.

### 7.2 First successful application

For an uncompleted durable Reward Resolution, the server applies the whole frozen envelope and writes
immutable completion evidence in one transaction. Commit makes both the effects and completion
visible together.

### 7.3 Replay after successful commit

If the same `RewardSourceKey` is already completed with the same immutable envelope/context, a retry
returns or reconstructs the prior completion result as permitted by the owning API/source contract.
It performs no additional XP, Item or rowVersion mutation.

This is true even when the original response was lost and every target aggregate has since advanced.

### 7.4 Conflicting replay

If the same `RewardSourceKey` is presented with a different resolved target, amount, ItemId, effect
set or pinned version context, the operation is an integrity conflict and fails closed. The existing
completion is not overwritten and the new interpretation is not applied.

A retry must never mint a fresh correlation merely to bypass a completed/conflicting source.

### 7.5 Concurrent duplicates

Concurrent attempts for the same `RewardSourceKey` must converge first to exactly one immutable
Reward Resolution and then to at most one committed completion/effect set. Persistence uniqueness on
the complete source key is mandatory. Any losing application transaction must leave no reward
mutation or contradictory completion evidence.

## 8. Stale state and retry

OCC/version failure for any required aggregate aborts the entire **application** transaction. The
immutable Reward Resolution remains durably retryable, but the failed application commits:

- no partial sibling reward effect;
- no synthetic rowVersion bump;
- no Reward Completion.

Derived values computed from the stale snapshot are discarded. The orchestrator then checks the
durable resolution/completion state for the same source key:

- if already completed, replay the prior completion and do not reapply;
- if resolved but not completed, reload the required aggregate state and retry the **same frozen
  envelope**; source entitlement/value is not re-resolved from current rules/content;
- recompute only derived application results that upstream specs require from fresh state, such as
  post-grant Level/applied-at-cap values;
- never silently re-resolve a different reward amount/target/version under the retry.

If fresh target state makes an effect inapplicable under its accepted domain rules, the whole envelope
remains uncompleted and fails closed for normal application. Any alternate/correction behavior needs
an owning accepted contract; the frozen resolution is not silently rewritten.

## 9. Zero-applied and no-op effects

Reward-source completion is distinct from aggregate mutation.

A valid effect may produce no target-state write where its owning spec allows that outcome. Examples
include zero XP or Pokémon XP fully discarded at the Level cap under SPEC-006. Such an effect may
still participate in a successfully completed envelope and therefore become durably deduplicated.

No synthetic Player/Pokémon/Inventory `rowVersion` increment is created merely to prove reward
completion. Completion evidence is the source-level proof.

An Item grant remains positive by SPEC-007; this specification does not invent zero/negative Item
grant semantics.

## 10. Completion evidence

TASK-024 must materialize an append-only logical ledger that can prove at minimum:

- application-generated UUIDv7 resolution identity and completion identity;
- full `RewardSourceKey`;
- immutable normalized resolution/effect descriptors sufficient to detect conflicting replay;
- pinned `gameDataVersion` / `rulesVersion` values required by the envelope;
- authoritative subject/target identities necessary for audit;
- infrastructure `resolvedAt` timestamp for the immutable Reward Resolution;
- infrastructure `completedAt` timestamp (`timestamptz` semantics), which is non-authoritative for
  deterministic combat/Hunt time.

The ledger may normalize resolution/completion/effect data across more than one table, but it must
distinguish "resolved but not completed" from "completed" and preserve the uniqueness/atomicity
semantics above at the database boundary.

Arbitrary source payload dumps are not required. Completion evidence should store only stable fields
needed for idempotency, audit, recovery and accepted downstream queries.

## 11. Privacy and audit boundaries

Reward evidence must not store:

- passwords, passkeys, recovery tokens, bearer/session/CSRF secrets or raw credentials;
- client-controlled request headers as authoritative correlation;
- display names as identity;
- arbitrary upstream payloads when a stable opaque source identity is sufficient.

Player/Pokémon/Item/version identities are permitted where needed to prove reward effects. Future
account deletion/anonymization policy may define retention transformation, but it must not silently
make a retained mutable balance replayable as a new reward.

## 12. Failure, rollback and correction

### 12.1 Before commit

Validation, overflow, stale OCC, constraint or persistence failure during application rolls back the
whole application transaction. The immutable Reward Resolution remains; there is no successful
Reward Completion and the frozen envelope may be retried only under sections 7–8.

### 12.2 After commit

A committed Reward Completion is immutable historical evidence. Normal operation never deletes or
rewrites it to "undo" a reward.

If a future administrative/product contract requires correction, it must create a new explicitly
authorized correction/compensation source linked to the original completion and obey the affected
domain's accepted mutation rules. TASK-023 does not authorize negative Pokémon/Player XP, deleveling,
negative Item quantities or destructive history edits merely for compensation convenience.

## 13. Persistence handoff to TASK-024

TASK-024 must implement persistence/orchestration that enforces:

1. database uniqueness for complete `RewardSourceKey` and exactly one immutable resolution per key;
2. durable resolution before application, with no reward mutation implied by resolution alone;
3. immutable resolution/completion/effect evidence after commit;
4. one application transaction for all sibling state mutations plus completion evidence;
5. exact/lossless representation for XP/item quantities and accepted opaque identities;
6. required aggregate OCC/concurrency checks inside the same transaction;
7. rollback of every sibling mutation when any required write/check fails;
8. same-source replay returning the prior completion with no duplicate mutation;
9. same-source/different-envelope conflict rejection at resolution time or replay;
10. pinned version context with no latest/current fallback;
11. tests for concurrent resolution, concurrent application, response-loss replay, stale OCC,
    process failure after resolution/before completion, overflow/failure rollback,
    zero-applied completion and conflicting replay.

TASK-024 chooses exact SQL names/indexes and measured concurrency mechanics consistent with ADR-005.

## 14. Downstream boundaries

- TASK-024 implements progression/Inventory/reward persistence using this envelope.
- TASK-025 may expose authoritative reward-derived reads/commands but cannot accept arbitrary
  client-selected reward source/value/target as authority.
- TASK-033/034 define Hunt/world/content sources and reward tables/cadence; they produce source
  authority, they do not redefine ledger semantics.
- TASK-036 owns capture outcome and any resulting Pokémon grant/capture-source semantics.
- TASK-088/089 own Move acquisition and cannot gain authority through a generic reward effect kind
  until their accepted contract says so.

## 15. Required behavior summary

1. Every durable logical reward uses one server-authoritative `RewardSourceKey`.
2. One source key maps to one immutable Reward Resolution/envelope before application.
3. Resolution alone never claims that reward effects completed.
4. Baseline envelope effects are Pokémon XP, Player XP and Item grants only.
5. Sibling effects and Reward Completion are one all-or-nothing application transaction.
6. Independent rewards use distinct source identities rather than partial envelope commits.
7. Concurrent duplicate resolutions converge; concurrent applications commit at most once.
8. Response-loss replay never duplicates effects.
9. Same source plus different envelope/context fails closed.
10. Stale OCC commits neither effects nor completion; derived stale state is discarded.
11. Retry uses the same frozen resolved envelope and fresh target state.
12. Valid zero-applied effects may complete without synthetic target rowVersion changes.
13. Required rules/game-data versions are exact and immutable for the reward; no current fallback.
14. Resolution/completion evidence is append-only and excludes secrets/arbitrary client authority.
15. Pre-commit application failure rolls back all siblings; post-commit correction uses a new separately
    authorized source and never rewrites history.
16. This ledger confers no reward amount/cadence/scarcity/economy authority by itself.

## 16. Edge cases to validate

- identical concurrent delivery of the same source;
- process loss after immutable resolution but before any reward effect/completion;
- retry after commit but before response delivery;
- same authority/correlation presented for another Player, both when multi-recipient delivery is
  valid and when that Player is not an eligible recipient;
- envelope attempts to grant Player XP/Items across the subject boundary or Pokémon XP to a target
  not authorized for the subject;
- same source key reused with one changed XP amount, target, Item quantity or pinned version;
- duplicate same-kind/same-target effects presented instead of one canonical resolved amount;
- one stale Pokémon among several sibling effects;
- Inventory overflow while XP siblings would otherwise succeed;
- zero Player XP and capped Pokémon XP with no aggregate write;
- required historical rules/data version unavailable;
- source eligibility changes before Reward Resolution is durably claimed, versus target/application
  state changing after resolution has already frozen entitlement/value;
- persistence error while writing completion evidence;
- completion evidence exists while target state has advanced through later unrelated rewards.

## 17. Acceptance

SPEC-009 is ready for Human Owner acceptance only after:

- independent QA confirms scope/ownership consistency and no unresolved P0/P1;
- Independent Auditor confirms the concurrency/idempotency/atomicity model has no unresolved P0/P1;
- roadmap/task metadata and generated project control artifacts validate cleanly.

Human acceptance fixes the Class A contract. TASK-024 implementation must not begin under this spec
until TASK-023 reaches READY according to repository governance.

The Human Owner accepted this SPEC-009 baseline in full on 2026-09-22 after independent QA returned
READY and two independent reward-integrity/concurrency audits returned PASS, all with P0/P1/P2/P3
`0/0/0/0`. The approved semantics are therefore authoritative for TASK-024 handoff unless a later
Class A change explicitly supersedes them.

## 18. Open decisions

No product/economy decision is intentionally required by this draft. If review discovers a need to
define reward cadence, scarcity, currency, monetization or content-balance semantics, that scope must
be surfaced explicitly and the applicable GSC/PXE consultation gate added before Human acceptance.
