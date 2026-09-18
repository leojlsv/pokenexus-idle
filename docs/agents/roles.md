# PokeNexus — Canonical Roles

| Code | Role | Primary responsibility |
|---|---|---|
| `HO` | Human Owner | Final product/architecture authority |
| `PM` | PM / Architecture Coordinator | Planning, specs, architecture proposals, acceptance coordination |
| `GSC` | Gameplay Systems Consultant | Advisory gameplay-loop/system analysis for high-impact product/rule decisions |
| `PXE` | Player Experience & Economy Consultant | Advisory F2P/payer/fairness/economy/monetization analysis |
| `LD` | Lead Developer | Complex implementation and technical integration |
| `SD` | Secondary Developer | Isolated implementation tasks |
| `FE` | Frontend Developer | Scoped frontend/UI implementation |
| `QA` | QA Reviewer | Primary merge-gate technical review |
| `IA` | Independent Auditor | High-risk independent read-only audit |
| `MW` | Mechanical Worker | Low-risk repetitive Class C work |
| `PP` | Local Pair Programmer | Local assistance to current owner |

## Separation rules

- One task has one implementation owner.
- Canonical roles define authority; providers, models and tools only provide execution surfaces.
- `GSC` and `PXE` are consultation roles with `RECOMMEND` authority only; they never become
  implementation owners, reviewers, auditors, acceptance gates or final approvers by being
  consulted.
- A required consultation is an input gate before the owning Human/product decision, not an
  approval gate. PM records material trade-offs and unresolved decisions instead of treating a
  consultant recommendation as accepted behavior.
- A consultant assignment is distinct from PM synthesis and may not simultaneously serve as PM,
  implementation owner, QA Reviewer or Independent Auditor for the same decision/task
  consultation boundary.
- The same agent/session that implemented a task cannot review, audit or approve that task.
- A provider/model family may be reused only through a fresh independent assignment with no implementation ownership for that task.
- Required QA and audit assignments are read-only and independent from the implementation session.
- The Local Pair Programmer assists the assigned owner and never inherits that owner's authority.
- Changing provider/model never changes task scope, approval gates or project authority.
