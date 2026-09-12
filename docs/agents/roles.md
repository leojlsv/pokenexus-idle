# PokeNexus — Canonical Roles

| Role | Primary responsibility |
|---|---|
| Human Owner | Final product/architecture authority |
| PM / Architecture Coordinator | Planning, specs, architecture proposals, acceptance coordination |
| Lead Developer | Complex implementation and technical integration |
| Secondary Developer | Isolated implementation tasks |
| Frontend Developer | Scoped frontend/UI implementation |
| QA Reviewer | Primary merge-gate technical review |
| Independent Auditor | High-risk independent read-only audit |
| Mechanical Worker | Low-risk repetitive Class C work |
| Local Pair Programmer | Local assistance to current owner |

## Separation rules

- One task has one implementation owner.
- Canonical roles define authority; providers, models and tools only provide execution surfaces.
- The same agent/session that implemented a task cannot review, audit or approve that task.
- A provider/model family may be reused only through a fresh independent assignment with no implementation ownership for that task.
- Required QA and audit assignments are read-only and independent from the implementation session.
- The Local Pair Programmer assists the assigned owner and never inherits that owner's authority.
- Changing provider/model never changes task scope, approval gates or project authority.
