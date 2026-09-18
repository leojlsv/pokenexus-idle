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

### Class A specialist consultation

Consultation is an advisory input gate, not an approval/review/audit authority. When a trigger
below is present, PM records the assigned consultant and material findings before the Human Owner
accepts the Class A product/rules decision.

`GSC` consultation is required when a Class A decision materially defines or changes:
- core gameplay, Idle/offline or session loops;
- progression/meta-progression or team-building/acquisition loops;
- reward cadence or content longevity/exhaustion behavior;
- PvE/PvP/co-op/social gameplay interactions;
- Gacha/randomized acquisition mechanics if explicitly proposed.

`PXE` consultation is required when a Class A decision materially defines or changes:
- currencies, reward sources/sinks, scarcity, fees or player-to-player value transfer;
- F2P/payer asymmetry, paid convenience/progression/power or monetization pressure;
- P2W/competitive-fairness consequences;
- retention/comeback mechanics with material reward/economy consequences;
- paid randomized rewards or other monetized chance-based acquisition if explicitly proposed.

Both consultations are required when the same decision materially crosses both trigger sets,
including examples such as Gacha, battle passes, premium currency, paid stamina/energy, paid XP or
item multipliers, monetized offline-progression limits, power-relevant storage/inventory
monetization, PvP progression rewards with paid advantages, seasonal progression tracks or
exclusive paid gameplay power.

Consultant findings must surface material disagreements, alternatives and unresolved Human Owner
choices. Consultant disagreement is not a veto: PM records the conflict and the Human Owner makes
the product decision. Required QA and IA gates remain unchanged and cannot be satisfied by a
consultant.

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
