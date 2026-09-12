# TASK-000 — Agent Governance Baseline

## Metadata

- State: ACCEPTANCE
- Class: B
- Owner: PM / Architecture Coordinator
- Owner execution surface: ChatGPT repository tools
- Reviewer: QA Reviewer
- Reviewer execution surface: ChatGPT worker (independent)
- Auditor: Independent Auditor
- Auditor execution surface: ChatGPT worker (independent)
- Spec: N/A — canonical governance lives in `docs/agents/`
- ADR: N/A
- Branch: `chore/TASK-000-agent-governance-clean`
- Worktree: `.worktrees/TASK-000-agent-governance-clean`

## Objective

Establish a provider-independent agent governance model with explicit role authority,
review separation and tool adapters, while making GitHub Copilot CLI the default
execution surface for the Lead Developer role.

## Context

The baseline governance mixed canonical roles with provider names. That made authority
appear to belong to Claude, Codex, Cursor, Gemini or DeepSeek instead of to the role
assigned by the project. It also left provider-specific execution artifacts in the
repository after the Lead Developer workflow moved to GitHub Copilot CLI.

## Scope

- define canonical roles independently from provider/model names;
- align authority matrix, workflow and approval gates to canonical roles;
- make tool/provider mappings explicit adapters rather than authority definitions;
- configure the repository `lead-developer` GitHub Copilot custom agent;
- keep Codex, Cursor, Gemini, Aider/DeepSeek and default Copilot as execution surfaces
  for their assigned roles;
- remove obsolete Claude-specific execution configuration;
- keep Aider safe by default and disable automatic commits/attribution noise;
- align task metadata with role and execution-surface separation;
- ignore local Aider/Copilot runtime state.

## Out of scope

- application/runtime architecture;
- gameplay or product behavior;
- Node/pnpm/runtime baseline;
- TASK-001 foundation implementation;
- changing model/provider availability outside adapter documentation;
- adding application dependencies.

## Acceptance criteria

- [x] canonical role names do not encode provider/model names;
- [x] authority matrix uses canonical roles as columns;
- [x] workflow and approval gates refer to canonical roles rather than providers;
- [x] provider/tool mappings are isolated to adapters/launching documentation;
- [x] Lead Developer role is provider-independent and defaults to the repository
      GitHub Copilot CLI custom agent;
- [x] Copilot custom-agent frontmatter uses supported properties/tool aliases;
- [x] Claude-specific Lead/Aider execution artifacts are removed;
- [x] Aider default profile is non-destructive and the Mechanical Worker profile is
      explicitly scoped to Class C work;
- [x] task template separates Owner role from Execution surface;
- [x] root policy, workflow and adapters use consistent READY/ACTIVE/FIX lifecycle semantics;
- [x] no TASK-001, runtime foundation files or binary archives are introduced;
- [x] no inline changelog/history or ad-hoc completion report is introduced.

## Validation / tests

- [x] `git diff --check`;
- [x] inspect complete `main...working-tree` diff for scope;
- [x] search for obsolete role filenames/provider-bound authority references;
- [x] validate YAML/frontmatter syntax for Aider and Copilot configuration;
- [x] independent QA review of the final governance diff.
- [x] independent governance audit of authority/gate changes.

## Dependencies

- Human Owner direction approving the governance revision and role migration (satisfied).

## Risks / irreversible actions

- Role/adapter inconsistencies can cause an execution surface to assume authority it
  does not have; canonical role documents therefore remain the source of truth.
- No destructive application/runtime action is allowed by this task.

## Expected files / boundaries

- `docs/agents/**`;
- `docs/engineering/git-policy.md` only to align repository-wide Git authorization;
- `AGENTS.md`;
- `.claude/**` only for removal of obsolete Lead Developer execution artifacts;
- `.github/agents/**`;
- `.github/copilot-instructions.md`;
- `.cursor/rules/**` only where role adapter references change;
- `.gemini/**` / `GEMINI_AUDITOR.md` only where auditor adapter references change;
- `.aider*.yml`, `.aiderignore`, `.gitignore` only for worker/tool safeguards;
- `tasks/TEMPLATE.md`;
- `tasks/active/TASK-000-agent-governance.md`;
- `README.md` / `CONTRIBUTING.md` only for stable governance navigation.

## Completion

Use `docs/agents/handoff-protocol.md`.
Do not create an implementation-summary/changelog file.
