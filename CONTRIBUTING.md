# Contributing to PokeNexus

## Before coding

1. Read `AGENTS.md`.
2. Work from a READY task.
3. Confirm owner/reviewer and task class.
4. Read referenced specs/ADRs.

## During implementation

- stay inside scope;
- preserve architecture boundaries;
- add tests for behavior changes;
- avoid unrelated cleanup;
- do not create inline changelogs, ad-hoc reports or AI attribution.

## Before handoff

- inspect `git diff`;
- inspect `git status`;
- run applicable validation;
- remove debug/temp/dead code;
- use the canonical handoff format.

## Review

Codex QA is the default merge gate.
High-risk changes follow `docs/agents/approval-gates.md`.
