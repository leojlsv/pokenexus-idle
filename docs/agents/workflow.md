# PokeNexus — Multi-Agent Workflow

## Task lifecycle

```text
DRAFT → READY → ACTIVE → REVIEW → FIX → ACCEPTANCE → DONE
                    ↘ BLOCKED ↗
```

## Definition of Ready

A task is READY only when it defines:
- state;
- change class;
- implementation owner;
- reviewer;
- objective;
- scope;
- out of scope;
- acceptance criteria;
- required validation/tests;
- dependencies;
- relevant ADR/spec references;
- explicit risky/irreversible actions, if any.

## Standard flow

1. Human Owner defines direction or approves proposed direction.
2. ChatGPT refines architecture/spec/task as needed.
3. READY task receives one implementation owner.
4. Owner implements in its branch/worktree.
5. Owner runs applicable validation.
6. Codex QA reviews the task/diff independently.
7. P0/P1 findings return to the original implementation owner.
8. Gemini audits only when required by `approval-gates.md` or explicitly requested.
9. ChatGPT coordinates functional/architectural acceptance for Class B.
10. Human Owner approves Class A and may review/override any task.
11. Merge after all required gates pass.

## Parallel work

Preferred:

```text
1 task = 1 owner = 1 branch = 1 worktree
```

Do not parallelize tasks that redefine the same contract, schema boundary, protocol, or feature behavior.

## Definition of Done

- acceptance criteria pass;
- relevant checks pass;
- no P0/P1 findings remain;
- P2 deferrals are explicitly recorded in a task/issue, not inline code history;
- no unrelated changes;
- no temporary/debug/dead code;
- no ad-hoc changelog/report files;
- documentation updated only where stable behavior/architecture changed;
- required acceptance gate completed.
