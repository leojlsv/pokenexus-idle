# Contributing to PokeNexus

## Before coding

1. Read `AGENTS.md`.
2. Work from an assigned task that has reached READY and is in an implementation state.
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

The QA Reviewer is the default merge gate. The default execution surface is documented in
`docs/agents/tool-adapters.md`.
High-risk changes follow `docs/agents/approval-gates.md`.
