# PokeNexus — Multi-Agent Workflow

## Task lifecycle

```text
DRAFT → READY → ACTIVE → REVIEW → ACCEPTANCE → DONE
                  ↕          ↘ FIX ↗
               BLOCKED
```

- `READY` means scope, owner, reviewer and required decisions are defined and implementation is authorized to start.
- `ACTIVE` means the assigned owner is implementing.
- `REVIEW` is read-only merge-gate review.
- `FIX` returns to the original implementation owner and must go back through `REVIEW`.
- `ACCEPTANCE` occurs only after required review/audit gates pass.

## Definition of Ready

A task is READY only when it defines:
- state;
- change class;
- implementation owner;
- owner execution surface/profile (or DEFAULT);
- reviewer (or N/A when `approval-gates.md` does not require review) and its execution
  surface/profile when assigned;
- required auditor (or N/A) and its execution surface/profile when assigned;
- required consultant role(s) (or N/A) and each execution surface/profile;
- objective;
- scope;
- out of scope;
- acceptance criteria;
- required validation/tests;
- dependencies;
- relevant ADR/spec references;
- explicit risky/irreversible actions, if any.

An execution surface value of `DEFAULT` resolves to the mapping for that specific
assigned role in `docs/agents/tool-adapters.md`. A task using another surface must name
it explicitly; changing the surface does not change the role's authority.

`Reviewer: N/A` requires `Reviewer execution surface: N/A` and is valid only when the
applicable approval gate does not require review. `Auditor: N/A` likewise requires
`Auditor execution surface: N/A` and is valid only when no approval gate requires an
Independent Auditor.

`Consultants: N/A` is valid only when no consultation trigger in `approval-gates.md` applies. When
one or more consultants are required, task metadata names each canonical role and its execution
surface. Consultation is recorded evidence, not a reviewer/auditor assignment and not a new task
lifecycle state.

## Standard flow

1. Human Owner defines direction or approves proposed direction.
2. PM / Architecture Coordinator refines architecture/spec/task as needed.
3. While the task is still DRAFT, assign the owner, reviewer, required auditor, required
   consultant(s) and each execution surface/profile.
4. For Class A, required GSC/PXE consultation occurs before Human acceptance whenever the
   triggers in `approval-gates.md` apply. PM records the findings, alternatives, material
   disagreement and unresolved Human decisions in the task/spec decision evidence.
5. For Class A, required pre-implementation review/audit occurs and the Human Owner
   accepts the required ADR/spec update before the task can reach READY.
6. The task becomes READY only when Definition of Ready is satisfied.
7. Owner moves the task to ACTIVE and implements in its branch/worktree.
8. Owner runs applicable validation.
9. Owner moves the task to REVIEW; QA Reviewer reviews the task/diff independently.
10. QA P0/P1 findings move the task to FIX; the original implementation owner fixes
   them and returns the task to REVIEW.
11. Independent Auditor performs post-implementation audit when required by
   `approval-gates.md` or explicitly requested.
12. Audit P0/P1 findings move the task to FIX; after fixes, repeat the required QA and
    audit gates on the resulting diff.
13. After required review/audit gates pass, PM / Architecture Coordinator performs the
    delegated functional/architectural acceptance gate for Class B when required. If
    that PM assignment implemented the task, use a fresh independent acceptance
    assignment or the Human Owner instead.
14. Human Owner approves merge for Class A and may review/override any task.
15. Merge after all required gates pass; mark DONE after required acceptance and
    merge/completion actions are finished.

## Parallel work

Preferred:

```text
1 task = 1 owner = 1 branch = 1 worktree
```

Do not parallelize tasks that redefine the same contract, schema boundary, protocol, or feature behavior.

## Definition of Done

- acceptance criteria pass;
- relevant checks pass;
- no P0/P1 findings from assigned review/audit remain;
- P2 deferrals are explicitly recorded in a task/issue, not inline code history;
- no unrelated changes;
- no temporary/debug/dead code;
- no ad-hoc changelog/report files;
- documentation updated only where stable behavior/architecture changed;
- required acceptance gate completed.
