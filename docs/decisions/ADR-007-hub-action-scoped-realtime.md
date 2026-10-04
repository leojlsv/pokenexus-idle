# ADR-007 — HUB Action-Scoped Player Connections

- Status: Accepted — Human Owner approved the exact reviewed ADR on 2026-10-04T07:02:48Z
- Decision owner: Human Owner
- Coordinator: PM / Architecture Coordinator
- Date: 2026-10-04
- Supersedes: the shared-HUB realtime portion of `ADR-003`; the Duo-room constraint remains compatible
- Superseded by:

## Context

The accepted realtime baseline in `ADR-003` treats the HUB as a shared social multiplayer space with
ephemeral presence and movement. `docs/architecture/system.md` and EPIC-06 in the project roadmap
therefore assume that entering the HUB may place a player into a persistent shared realtime area.

The Human Owner has changed that product direction. The HUB remains the functional place players
return to for management, PokéCenter and access to social or multiplayer actions, but entering the
HUB must not automatically connect the player to a shared multiplayer population. Player-to-player
connection exists only when an explicit feature action requires it.

This keeps the management-first Idle product model while allowing synchronous multiplayer where a
specific interaction benefits from a bounded realtime session.

## Decision

### HUB baseline

The HUB is a player-facing functional and social entry surface. By default it is private to the
current player from a networking/presence perspective.

Entering or remaining in the HUB does not create or require:

- a global or area-wide presence roster;
- shared avatar position or movement state;
- movement broadcasts;
- ambient player labels;
- a global HUB chat room;
- an always-on HUB WebSocket connection;
- a persistent multiplayer room containing unrelated players.

Ordinary HUB navigation, management and service interactions use the normal application/API paths
unless the owning feature contract requires another transport.

This ADR does not decide whether a later HUB presentation uses local/private avatar locomotion,
NPC interaction or a rendered scene. Those presentation choices must not create ambient
player-to-player presence, shared position authority or movement broadcasts by themselves.

### Action-scoped connection

A player-to-player connection starts only from an explicit action whose accepted feature contract
requires shared live state. Examples may include accepting a cooperative invitation, starting a
synchronous competitive interaction or another later social feature, but this ADR does not approve
any particular gameplay/social action by example alone.

The owning feature must define before implementation:

- the action that creates or joins the session;
- participant eligibility and authorization;
- maximum participant scope;
- authoritative room/session identity;
- whether realtime transport is actually required;
- message and command authority;
- reconnect, timeout, leave and teardown behavior;
- any durable state handoff or finalization;
- abuse/rate-limit and audit requirements appropriate to that feature.

Realtime rooms are therefore capability-scoped and participant-scoped. A room must not become a
general HUB presence channel or an implicit shared-world simulation.

Realtime room/session state is coordination authority only for the owning interaction. It must not
independently grant progression, rewards, inventory/ownership changes or other durable player state
unless the owning accepted feature contract defines the authoritative command/finalization boundary.

### Transport and lifecycle

HTTP/API remains the default transport for HUB functionality and asynchronous social actions.

WebSocket/Durable Object coordination is used only after a feature-specific accepted contract
requires synchronous interaction. A realtime session begins at the feature-defined connection
boundary and ends when the interaction completes, is cancelled, times out or reaches its accepted
disconnect/teardown condition.

Disconnected, expired or abandoned sessions must reach a bounded cleanup/teardown outcome. Stale
room membership must fail closed and must not leave authoritative multiplayer interaction active
indefinitely. Exact timeout/reconnect numbers remain owned by the feature/session protocol.

No background HUB socket is required merely to make a later realtime action possible. A feature may
perform an authenticated handoff from an API action into its bounded realtime room when its own
contract defines that handoff.

### Common authentication handoff and revalidation

Every feature-owned realtime session inherits the accepted ADR-006 browser-session authority. A
feature protocol may choose its concrete handoff representation, but it must preserve these common
invariants:

- handoff issuance starts from a currently valid normal authenticated browser/API session; the
  issuing server validates session revocation/expiry, active account state and current
  `security_epoch`, then resolves the authoritative `PlayerId` server-side;
- the handoff authority is short-lived and narrowly bound to its environment/audience, owning
  feature/action purpose, intended room/session identity, authenticated player/account authority,
  source normal `session_id` (or an equivalent server-side session-authority reference) and the
  `security_epoch` observed at issuance;
- a handoff or admitted room membership for one feature/action/session cannot be replayed or reused
  as authority for another feature, room or generic HUB presence channel;
- realtime admission validates the handoff's expiry, audience/purpose/session binding and current
  ADR-006 source-session/account authority, including per-session revocation/expiry and epoch match.
  Room membership alone is never proof that browser/account authority is still valid;
- each owning realtime protocol defines a bounded revalidation interval and must fail closed when
  the source session becomes revoked/expired, the account is no longer `active`, or
  `security_epoch` changes. A durable/progression-affecting command or finalization must revalidate
  current authority before committing its effect rather than relying only on an earlier socket join;
- reconnect/resume cannot revive expired or revoked authentication authority. It requires a current
  valid feature/session-bound handoff or equivalent server-side revalidation under the owning
  protocol;
- WebSocket heartbeat/keepalive/background synchronization does not extend ADR-006 browser-session
  inactivity lifetime and must not be treated as subscriber-initiated activity;
- the owning protocol defines exact Origin/audience checks, secret transport, replay protection and
  correlation/audit evidence without exposing browser bearer secrets to room state or other players.

These are shared security invariants, not a generic HUB realtime session. Feature protocols may be
stricter, but may not weaken ADR-006 revocation/account-state/epoch semantics.

### Duo and later multiplayer modes

The existing ADR-003 rule that Duo may use an isolated two-player realtime room remains compatible
with this decision: the Duo join/start action is the explicit connection trigger and the Duo room is
bounded to that interaction.

PvP, World Boss, trading, parties, chat and other future player-to-player systems do not inherit a
realtime topology from the HUB. Each owning contract chooses asynchronous versus synchronous
behavior and, when synchronous behavior is selected, defines its bounded session authority.

### Deferred social-product semantics

This ADR defines the networking/topology boundary only. It does not approve or choose:

- the canonical catalog of social/multiplayer actions;
- friends, recent-player, invite-code, LFG, roster or matchmaking discovery models;
- ambient `online`, `busy`, `in Hunt` or `available` status exposure;
- direct messages, party chat, session chat, offline delivery or message retention;
- durable versus action-local Player Party lifetime;
- invite delivery/consent behavior while offline, in Hunt, in recovery or already connected;
- whether one player may participate in more than one realtime interaction concurrently;
- social participation rewards, progression incentives or economy effects.

Those decisions belong to their owning feature contracts and must pass their applicable product,
security, moderation, gameplay and economy gates. Until such a contract is accepted, the absence of
one of these features must not be filled by a generic HUB presence/session fallback.

### Forward amendment boundary

Upon Human acceptance, this ADR replaces the future **shared realtime/social-space networking**
premise attached to HUB movement in `SPEC-020` section 4.3 and its TASK-042–048 impact statements.
It does not prohibit a later local/private HUB movement presentation. The first Pre-alpha functional
non-locomotion HUB and `SPEC-021` PokéCenter authority remain compatible and require no gameplay
semantic change.

Accepted references in ADR-005/006 to HUB realtime coordination remain valid only for feature-owned
action-scoped sessions after this replacement; they no longer imply a persistent general HUB room.

`ADR-003` remains the historical accepted source for the earlier shared-HUB decision. Acceptance of
this ADR supersedes only that shared-HUB portion; it does not broaden realtime into Solo Hunts or a
global game simulation.

## Alternatives considered

### Persistent shared social HUB

Keep one or more shared HUB areas with presence, movement, chat and nearby-player interaction. This
creates ambient social visibility but requires permanent room membership, presence lifecycle,
movement authority, reconnect handling and hotspot/load management even when the player only wants
management functions.

### Action-scoped player connections

Keep the HUB functional and social as an entry point, while creating multiplayer sessions only from
explicit actions. This is the proposed model because infrastructure and realtime authority scale
with actual interaction and unrelated players are not coupled through a shared presence space.

### Fully asynchronous social model

Use no realtime player connection at all. This would simplify topology further but would preclude
future synchronous interactions that the product may still choose explicitly, including the
currently planned Duo direction.

## Consequences

- HUB availability no longer depends on realtime room health.
- Ordinary HUB use does not consume persistent presence/movement connection capacity.
- The project no longer needs a general HUB position/presence authority or shared-area broadcast
  protocol.
- Social discovery/invitation UX must use explicit product surfaces rather than relying on nearby
  avatars as the discovery mechanism.
- Realtime capacity, reconnect and abuse controls are evaluated per session-producing feature.
- TASK-043–048 require roadmap rescoping before implementation; their current shared presence,
  networked movement, global chat and ambient-player assumptions cannot proceed unchanged.
- First Pre-alpha HUB/PokéCenter work remains valid because it is already non-locomotion and does
  not depend on the realtime HUB stack.

## Risks

- Removing ambient presence reduces spontaneous social discovery unless explicit social actions
  provide sufficient discovery/invitation paths.
- Feature teams could accidentally recreate an unbounded shared lobby by using one broad session
  type; each session contract therefore requires bounded participants and a concrete interaction
  purpose.
- Multiple feature-specific realtime sessions can fragment protocol conventions unless shared
  authentication, envelope and observability primitives remain reusable without imposing one
  shared HUB room.
- Future action catalogs may introduce gameplay, economy, moderation or privacy semantics that
  require their own Class-A decisions and specialist consultation.
- Presence-lite status, chat, party persistence and discovery are intentionally unresolved here;
  implementations must fail closed rather than infer them from the old shared-HUB model.

## Validation / revisit trigger

Before this ADR can become Accepted:

- Gameplay Systems Consultant reviews the social/player-loop consequences;
- QA Reviewer checks consistency with `SPEC-020`, `SPEC-021`, ADR-003/005/006 and roadmap
  dependencies;
- Independent Auditor reviews the realtime topology, authorization and lifecycle boundaries;
- the Human Owner accepts the exact ADR text.

Revisit this decision if a future feature explicitly requires ambient proximity/presence across
unrelated players or proposes a persistent shared-world/lobby topology.
