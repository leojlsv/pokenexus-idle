# PokeNexus — Canonical Roles

| Role | Default execution surface | Primary responsibility |
|---|---|---|
| Human Owner | User | Final product/architecture authority |
| PM / Architecture Coordinator | ChatGPT | Planning, specs, architecture proposals, acceptance coordination |
| Lead Developer | GitHub Copilot CLI custom agent | Complex implementation and technical integration |
| Secondary Developer | Codex | Isolated implementation tasks |
| Frontend / Secondary Developer | Cursor | Small/medium scoped implementation, especially UI |
| QA Reviewer | Codex | Primary merge-gate technical review |
| Local Pair Programmer | GitHub Copilot IDE/CLI default mode | Local assistance to current owner |
| Independent Auditor | Gemini CLI | High-risk independent read-only audit |
| Mechanical Worker | DeepSeek via Aider | Low-risk repetitive Class C work |
| Repository Executor | Aider | Execution interface for approved worker roles; no authority of its own |

## Separation rules

- One task has one implementation owner.
- An agent/tool that implemented a task cannot approve that same task.
- Cursor/Codex may implement, but QA must be performed by a separate reviewer/session.
- Default Copilot mode assists an owner; it does not become architecture authority.
- Provider/model selection never changes project authority.
