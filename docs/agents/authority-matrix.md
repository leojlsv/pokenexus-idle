# PokeNexus — Authority Matrix

Legend:
- OWNER — final decision authority
- COORDINATE — propose/structure/recommend
- RECOMMEND — advise the final authority without approval power
- EXECUTE — implement approved work
- REVIEW — inspect/challenge
- ASSIST — local assistance
- DELEGATE/OVERRIDE — final authority delegates the routine gate but retains override power
- NO — must escalate

Qualifiers:
- `TECH LEAD` — primary technical integration responsibility inside approved scope;
- `isolated` — execute only the explicitly assigned isolated slice;
- `scoped Class C` — execute only the exact mechanical Class C files/operation/result;
- `GATE` — formal required review gate;
- `approved` — execution is allowed only after the governing decision/scope is approved.

| Area | Human Owner | PM / Architecture Coordinator | Lead Developer | Secondary Developer | Frontend Developer | QA Reviewer | Independent Auditor | Mechanical Worker | Local Pair Programmer |
|---|---|---|---|---|---|---|---|---|---|
| Product vision/scope | OWNER | COORDINATE | NO | NO | NO | REVIEW | REVIEW | NO | NO |
| Architecture / ADR | OWNER | COORDINATE | REVIEW | NO | NO | REVIEW | REVIEW | NO | NO |
| Public API/protocol semantics | OWNER | COORDINATE | REVIEW | NO | NO | REVIEW | REVIEW | NO | NO |
| Database/persistence strategy | OWNER | COORDINATE | REVIEW | NO | NO | REVIEW | REVIEW | NO | NO |
| Game rules/economy | OWNER | COORDINATE | REVIEW | NO | NO | REVIEW | REVIEW | NO | NO |
| Security model | OWNER | COORDINATE | REVIEW | NO | NO | REVIEW | REVIEW | NO | NO |
| Game-core implementation | REVIEW | REVIEW | EXECUTE/TECH LEAD | EXECUTE isolated | NO | REVIEW/GATE | REVIEW | EXECUTE scoped Class C | ASSIST |
| API/persistence implementation | REVIEW | REVIEW | EXECUTE/TECH LEAD | EXECUTE isolated | NO | REVIEW/GATE | REVIEW | EXECUTE scoped Class C | ASSIST |
| Realtime implementation | REVIEW | REVIEW | EXECUTE/TECH LEAD | EXECUTE isolated | ASSIST | REVIEW/GATE | REVIEW | EXECUTE scoped Class C | ASSIST |
| Frontend implementation | REVIEW | REVIEW | EXECUTE/TECH LEAD | EXECUTE isolated | EXECUTE | REVIEW/GATE | REVIEW | EXECUTE scoped Class C | ASSIST |
| Tests | REVIEW | REVIEW | EXECUTE | EXECUTE | EXECUTE | REVIEW/GATE | REVIEW | EXECUTE scoped Class C | ASSIST |
| Agent governance / role policy | OWNER | COORDINATE/EXECUTE approved | REVIEW | NO | NO | REVIEW/GATE | REVIEW | NO | NO |
| Final Class A approval | OWNER | RECOMMEND | NO | NO | NO | REVIEW | REVIEW | NO | NO |
| Class B functional acceptance | DELEGATE/OVERRIDE | COORDINATE/GATE | NO | NO | NO | REVIEW | REVIEW | NO | NO |

## Mandatory escalation

Escalate before changing:
- product behavior not covered by the task;
- architecture/package boundaries;
- public contracts;
- persistence strategy;
- realtime topology;
- game rules/economy;
- security model;
- agent authority/approval gates outside an explicitly approved governance task;
- active task scope.
