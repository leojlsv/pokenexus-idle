# TASK-042 — HUB Action-Scoped Realtime State & Protocol

## Metadata

- State: DONE
- Class: A
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT project coordination
- Reviewer: QA Reviewer
- Reviewer execution surface: fresh independent ChatGPT worker
- Auditor: Independent Auditor
- Auditor execution surface: fresh independent ChatGPT worker
- Consultants: Gameplay Systems Consultant (GSC)
- Consultant execution surface(s): fresh independent ChatGPT advisory worker
- Spec: `docs/specs/SPEC-020-management-first-idle-product-realignment.md`; `docs/specs/SPEC-021-persistent-pokemon-vitality-pokecenter.md`
- ADR: `docs/decisions/ADR-007-hub-action-scoped-realtime.md`
- Branch: `spec/TASK-042-hub-action-scoped-realtime`
- Worktree: `G:\pokenexus-idle\.worktrees\TASK-042-hub-action-scoped-realtime`

## Objective

Replace the planned persistent shared-HUB presence/movement topology with an action-scoped player
connection contract: ordinary HUB use has no ambient multiplayer room, while explicit accepted
social/multiplayer actions may create bounded participant sessions when their owning feature needs
synchronous coordination.

This task prepares the Class-A architecture decision only. It does not authorize realtime runtime
implementation, deployment, migration, public enablement or Git-history integration.

## Context

Before ADR-007 acceptance, `ADR-003`, `docs/architecture/system.md` and EPIC-06 assumed a persistent
shared social HUB with presence, movement and chat. The Human Owner changed the product direction on
2026-10-04 and accepted ADR-007: the HUB is no longer a multiplayer place containing everyone at the
same time; player connection is created only by specific accepted actions that require it.

The first Pre-alpha HUB is already functional and non-locomotion under `SPEC-020/021`, so the
immediate Hunt/PokéCenter slice does not require runtime rework from this architecture decision.

## Scope

- establish ADR-007 as the accepted replacement authority for the shared-HUB portion of ADR-003;
- define HUB default networking state with no global presence, position/movement broadcast, ambient
  player labels, global HUB chat room or always-on HUB WebSocket;
- keep local/private HUB scene or locomotion presentation outside this networking decision so it
  cannot be mistaken for shared movement authority;
- define feature/action-scoped session creation, participant bounds and teardown requirements;
- require fail-closed stale-session cleanup and prevent realtime coordination state from becoming
  independent progression/reward/ownership authority;
- keep HTTP/API as the default HUB transport and require feature-specific authority before realtime
  handoff;
- define the common ADR-006-derived realtime handoff/revalidation floor: valid source session,
  source-session identity/reference + issued `security_epoch`, active account/current epoch,
  feature/action/session-bound audience/purpose, no cross-feature replay, bounded revalidation and
  fail-closed revocation/expiry handling;
- preserve isolated Duo-room compatibility without pre-authorizing Duo gameplay details;
- define the amendment relationship to accepted `SPEC-020` while preserving `SPEC-021` PokéCenter;
- explicitly defer discovery, presence-lite status, chat, Party lifetime, invite concurrency and
  reward semantics to their owning future feature contracts;
- record the accepted TASK-043–048 rescope required by ADR-007 before downstream implementation;
- obtain required GSC, QA and Independent Auditor evidence before Human acceptance.

## Out of scope

- selecting or implementing the complete set of social actions available in the HUB;
- implementing invitations, parties, chat, Duo, PvP, World Boss, trading or matchmaking;
- creating a generic shared lobby as a substitute for the old HUB presence room;
- changing Solo Hunt gameplay, `SPEC-021` vitality/PokéCenter semantics or TASK-110 authority;
- application/realtime source changes;
- database migrations or persistent schema changes;
- production infrastructure, deploy or public enablement;
- commit, push or merge without separate Human authorization.

## Acceptance criteria

- [x] ADR-007 explicitly states that entering the HUB does not create ambient shared multiplayer
      presence or require a HUB WebSocket.
- [x] ADR-007 defines explicit feature actions as the only entry to bounded player-to-player
      sessions and requires each owning feature to define authorization, participants, lifecycle,
      transport and durable handoff.
- [x] ADR-007 does not infer that invitations, parties, chat, PvP, World Boss or trading are
      realtime merely because they are social/player-to-player features.
- [x] Discovery, presence-lite status, chat, Party lifetime, invite/concurrency and social reward
      semantics are explicitly deferred and cannot be inferred from the old shared-HUB model.
- [x] Duo remains compatible as an isolated action-triggered room without changing its future
      rules/protocol gates.
- [x] Common realtime admission/revalidation preserves ADR-006 server-side revocation, account-state
      and `security_epoch` authority; handoff/session authority cannot be reused across features or
      generic HUB presence, and durable effects revalidate current authority before commit.
- [x] First Pre-alpha functional HUB and `SPEC-021` PokéCenter remain unchanged.
- [x] Current TASK-043–048 shared-presence/networked-movement assumptions are identified as requiring
      rescope before implementation.
- [x] Required GSC consultation has no unresolved Human decision blocking the architecture wording,
      or each unresolved decision is explicitly surfaced.
- [x] Independent QA reports no unresolved P0/P1 on the exact proposed ADR/task/roadmap snapshot.
- [x] Independent Auditor reports no unresolved P0/P1 on realtime topology, authorization and
      lifecycle boundaries.
- [x] Human Owner explicitly accepted the exact reviewed ADR on 2026-10-04T07:02:48Z.

## Validation / tests

- [x] Cross-reference audit: ADR-003/005/006, SPEC-020/021, `docs/architecture/system.md`, TASK-042–048
      and Duo dependencies.
- [x] `corepack pnpm roadmap:generate` passes.
- [x] `corepack pnpm roadmap:check` passes.
- [x] `git diff --check` passes.
- [x] No runtime/application files changed in this architecture-preparation task.

### GSC consultation evidence — 2026-10-04

The independent Gameplay Systems Consultant found the action-scoped model coherent with the
management-first Idle direction. It recommended preserving HUB management/services and explicit
social entry points while limiting realtime to interactions that actually require simultaneity.

The initial advisory raised discovery, presence-lite status, chat, Party lifetime, invite behavior,
session concurrency and social rewards as possible Human decisions. Follow-up review of the current
boundary concluded those items do not need to be fixed in ADR-007 when they are explicitly deferred
to their owning future feature contracts. The topology decision itself must fix these invariants:

- entering HUB does not require shared player presence;
- local/private locomotion, if later desired, does not create shared movement authority;
- there is no generic realtime HUB session;
- multiplayer sessions start only from actions authorized by the owning feature contract;
- session scope/state remains bounded to that interaction;
- realtime coordination does not gain progression authority outside the owning contract.

The consultant identified no remaining advisory blocker with those boundaries explicit.

### Independent QA evidence — 2026-10-04

- Final semantic/governance review: **PASS, P0/P1/P2/P3 = 0/0/0/0**.
- The reviewer confirmed the action-scoped model matches the Human direction, local/private HUB
  locomotion remains outside the networking decision, accepted ADR/spec authority was unchanged while
  ADR-007 was Proposed, TASK-042 remained DRAFT and downstream TASK-043–048 were provisional at review.
- Focused re-review after the authentication delta: **PASS, P0/P1/P2/P3 = 0/0/0/0**. The reviewer
  confirmed the ADR-006-derived handoff/revalidation floor preserves server-side revocation,
  `security_epoch`, source-session authority, bounded fail-closed revalidation and durable-effect
  revalidation without replacing the normal browser session model.

### Independent Auditor evidence — 2026-10-04

- Initial exact-draft audit found **P1=1**: ADR-006 delegates HUB/Duo handshake/revalidation to
  ADR-007, while the first draft left source-session revocation/expiry, `security_epoch`, handoff
  purpose/audience/session binding and cross-feature authority reuse under-specified.
- ADR-007 was tightened to bind handoff authority to the source normal `session_id` or equivalent
  server-side authority reference plus issued `security_epoch`, feature/action/session/audience and
  authenticated player/account authority; admission and bounded revalidation now fail closed on
  revocation/expiry/account/epoch invalidation, cross-feature replay is forbidden, reconnect cannot
  revive invalid authority and durable effects revalidate current authority before commit.
- Final re-gate: **PASS, P0/P1/P2/P3 = 0/0/0/0**. No residual realtime-topology, authorization,
  lifecycle, generic-lobby or Duo-compatibility finding remains.

## Dependencies

- TASK-015 — authentication/authorization/session model foundation.
- TASK-017 — Player profile/API persistence foundation.
- TASK-026 — accepted client architecture/navigation foundation.
- ADR-003 — historical accepted realtime scope whose shared-HUB portion is superseded by ADR-007.
- SPEC-020 — accepted management-first product authority now forward-amended by ADR-007 for HUB
  networking semantics.
- SPEC-021 — accepted functional HUB/PokéCenter authority preserved by ADR-007.

## Risks / irreversible actions

- This realtime-topology Class-A decision has completed Independent Auditor review and explicit Human
  acceptance. Runtime implementation still requires the separately scoped downstream task gates.
- Social discovery quality may regress if later product work removes ambient presence without
  providing explicit discovery/invitation surfaces.
- An overly broad action-session contract could recreate the same global lobby topology under a
  different name; participant and purpose bounds must remain feature-specific.
- Repository/history integration for this architecture package was separately authorized by the
  Human Owner on 2026-10-04T14:46:00Z and merged into canonical `main`. Runtime implementation,
  migration, deployment and public enablement remain separately gated.

## Expected files / boundaries

- `docs/decisions/ADR-007-hub-action-scoped-realtime.md`
- `tasks/done/TASK-042-hub-action-scoped-realtime-state-protocol.md`
- `docs/project/PROJECT_ROADMAP.md`
- generated `docs/project/PROJECT_ROADMAP.html`

Accepted architecture documents were amended only after the Human Owner accepted ADR-007. Runtime
source remains unchanged; downstream implementation is separately gated.

### Repository integration evidence — 2026-10-04

- Accepted architecture/source commit: `469015e56a5e9968f618eab055096abd08599c93`.
- Canonical merge commit: `22da731c30a41c3de67008a44a0225dce8e90bdb`.
- Human Owner separately authorized Git-history integration on 2026-10-04T14:46:00Z.
- No `apps/` or `packages/` runtime source was part of the architecture package.

## Completion

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
