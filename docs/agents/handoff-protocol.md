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

## QA handoff

```text
TASK:
REVIEWER:
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
