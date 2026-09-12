# PokeNexus — Approval Gates

## Class A — Architectural / high-impact

Examples:
- new service/runtime;
- database strategy;
- public protocol semantics;
- realtime topology;
- auth/security model;
- irreversible/destructive migration;
- player-to-player economy/trading rules.

Required:
1. PM / Architecture Coordinator prepares the recommendation and required ADR/spec update.
2. The Lead Developer may provide technical feasibility feedback.
3. QA Reviewer reviews implementation impact when useful before approval.
4. Independent Auditor reviews the proposed direction before implementation when the
   change involves security, concurrency, realtime topology, economy/trading or
   destructive migration risk.
5. Human Owner accepts the required ADR/spec update before the implementation task can
   reach READY.
6. After implementation, applicable automated checks and QA review must pass; the
   Independent Auditor performs an implementation audit for the same high-risk
   security, concurrency, realtime-topology, economy/trading or destructive-migration
   cases.
7. Human Owner approves merge for the implemented Class A change.

## Class B — Normal feature

Examples:
- feature inside accepted architecture;
- endpoint inside an approved contract;
- game-core implementation of approved rules;
- UI implementation.

Required:
1. READY task.
2. One implementation owner.
3. Automated checks.
4. QA Reviewer.
5. PM / Architecture Coordinator performs the delegated functional/architectural
   acceptance gate when the change is user-visible or cross-package.
6. If the PM / Architecture Coordinator is also the implementation owner/session, it
   cannot self-accept; the Human Owner or a fresh independent delegated acceptance
   assignment performs that gate.
7. Human Owner retains override authority and may require direct review/acceptance.

## Class C — Mechanical / low risk

Examples:
- fixtures;
- explicit test matrix;
- formatting;
- mechanical refactor;
- narrow script;
- documentation correction with no semantic change.

Required:
1. READY scoped task.
2. Validation.
3. Reviewer when production behavior can be affected.

Human Owner approval is not required for each Class C task unless requested.

## Governance gate

Any task that changes canonical role authority, precedence, approval requirements or
review separation requires:
1. explicit Human Owner approval of the governance direction;
2. an independent QA Reviewer;
3. an Independent Auditor when the governance change affects security-sensitive or
   irreversible approval paths.

This gate is cross-cutting and applies regardless of whether the implementation work
itself is classified as Class A, B or C.
