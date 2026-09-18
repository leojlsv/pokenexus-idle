# PokeNexus — Handoff Protocol

Handoffs are responses/workflow records by default. Do not create ad-hoc handoff files.

## Implementation handoff

```text
TASK:
OWNER:
STATUS:

IMPLEMENTED:
- ...

FILES CHANGED:
- ...

VALIDATION:
- command → result

KNOWN LIMITATIONS:
- ...

RISKS / FOLLOW-UP:
- ...
```

## Review / audit handoff

```text
TASK:
REVIEWER:
ROLE: QA Reviewer | Independent Auditor
VERDICT: PASS | FAIL | PASS WITH P2/P3

FINDINGS:
- P1 | file:line | problem | impact | expected direction

TEST GAPS:
- ...

ARCHITECTURE / HYGIENE:
- ...

RECOMMENDATION:
- merge / fix required / independent audit required
```

## Consultation handoff

```text
TASK / DECISION:
CONSULTANT:
ROLE: Gameplay Systems Consultant | Player Experience & Economy Consultant
SCOPE:

FACTS / CONSTRAINTS:
- ...

SOURCES / EVIDENCE:
- ...

ASSUMPTIONS / UNCERTAINTY:
- ...

FORECASTS / EXPECTED PLAYER OR SYSTEM RESPONSE:
- ...

OPTIONS / TRADE-OFFS:
1. ...
2. ...

PLAYER / SYSTEM RISKS:
- ...

RECOMMENDATION:
- ...

HUMAN OWNER DECISIONS REQUIRED:
- ...
```

Consultation evidence is advisory. It does not use `PASS/FAIL`, does not replace QA/audit and
does not authorize implementation or merge. When external reference sources materially inform a
consultation, record which source supports the fact/context and keep source facts distinct from
community/metagame observations, assumptions and recommendations.

## Escalation handoff

```text
TASK:
BLOCKED BY:
DECISION REQUIRED:
OPTIONS:
1. ...
2. ...

RECOMMENDATION:
...
```
