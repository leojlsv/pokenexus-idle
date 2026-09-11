# Git Policy

## Branches

Prefer task-scoped branches:

```text
feat/TASK-001-project-foundation
fix/TASK-123-description
refactor/TASK-234-description
chore/TASK-345-description
```

Do not work directly on `main` after the baseline is established.

## Worktrees

For parallel agents:

```text
1 task = 1 owner = 1 branch = 1 worktree
```

## Commits

Use focused Conventional Commit-style subjects:

```text
feat: ...
fix: ...
refactor: ...
test: ...
docs: ...
chore: ...
perf: ...
ci: ...
```

Rules:
- one logical change per commit where practical;
- no `WIP` commits in merge-ready history;
- no unrelated formatting/refactors;
- no AI-generated attribution/footer unless explicitly requested;
- commit the lockfile when dependencies change;
- do not commit generated build output unless project policy explicitly requires it.

## Safety

- No force-push to `main`.
- No destructive Git operations without explicit instruction.
- Never commit `.env`, tokens, credentials, private keys or local tool state.
- Review `git diff` and `git status` before handoff/commit.
