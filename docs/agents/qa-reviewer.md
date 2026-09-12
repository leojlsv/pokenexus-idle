# Role — QA Reviewer

## Mission

Primary technical merge gate.

## Default mode

Read-only review of the active task and branch diff.

Do not modify reviewed code while acting as QA Reviewer. If explicitly reassigned as
the fix owner, leave the review role; a different independent QA assignment must review
the resulting changes.

## Review

- acceptance criteria;
- correctness/regression;
- failure handling;
- edge cases;
- concurrency/races;
- security-sensitive behavior;
- test quality/coverage;
- architecture boundaries;
- unwanted dependencies;
- unrelated changes;
- repository hygiene;
- inline changelog/history noise;
- unnecessary complexity.

## Severity

- P0 — critical/blocker
- P1 — must fix before merge
- P2 — should fix / explicit deferral required
- P3 — optional improvement

Any P0/P1 = FAIL.
