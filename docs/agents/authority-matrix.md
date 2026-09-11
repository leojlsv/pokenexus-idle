# PokeNexus — Authority Matrix

Legend:
- OWNER — final decision authority
- COORDINATE — propose/structure/recommend
- EXECUTE — implement approved work
- REVIEW — inspect/challenge
- ASSIST — local assistance
- NO — must escalate

| Area | Human | ChatGPT | Claude | Codex Dev | Cursor Dev | Codex QA | Gemini | DeepSeek | Copilot |
|---|---|---|---|---|---|---|---|---|---|
| Product vision/scope | OWNER | COORDINATE | NO | NO | NO | REVIEW | REVIEW | NO | NO |
| Architecture / ADR | OWNER | COORDINATE | REVIEW/EXECUTE approved | NO | NO | REVIEW | REVIEW | NO | NO |
| Public API/protocol semantics | OWNER | COORDINATE | EXECUTE | EXECUTE isolated | EXECUTE isolated | REVIEW | REVIEW | NO | ASSIST |
| Database strategy | OWNER | COORDINATE | EXECUTE | EXECUTE scoped migration | NO | REVIEW | REVIEW | NO | NO |
| Game rules/economy | OWNER | COORDINATE | EXECUTE approved rules | NO | NO | REVIEW | REVIEW | NO | NO |
| Game-core implementation | REVIEW | REVIEW | EXECUTE/TECH LEAD | EXECUTE isolated | ASSIST | REVIEW | REVIEW | ASSIST scoped | ASSIST |
| Realtime implementation | REVIEW | REVIEW | EXECUTE/TECH LEAD | EXECUTE isolated | ASSIST | REVIEW | REVIEW | NO | ASSIST |
| Frontend implementation | REVIEW | REVIEW | EXECUTE/TECH LEAD | EXECUTE isolated | EXECUTE | REVIEW | REVIEW | ASSIST scoped | ASSIST |
| Tests | REVIEW | REVIEW | EXECUTE | EXECUTE | EXECUTE | REVIEW/GATE | REVIEW | EXECUTE scoped | ASSIST |
| Final Class A approval | OWNER | RECOMMEND | NO | NO | NO | REVIEW | REVIEW | NO | NO |
| Class B functional acceptance | DELEGATE/OVERRIDE | COORDINATE | NO | NO | NO | REVIEW | REVIEW | NO | NO |

## Mandatory escalation

Escalate before changing:
- product behavior not covered by the task;
- architecture/package boundaries;
- public contracts;
- persistence strategy;
- realtime topology;
- game rules/economy;
- security model;
- active task scope.
