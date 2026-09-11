# PokeNexus — Multi-Agent Governance

This directory defines canonical AI-agent roles and workflow.

## Principles

1. The Human Owner is the final authority.
2. Roles are more important than models/tools.
3. One task has one implementation owner.
4. No agent approves its own implementation.
5. Architecture changes require explicit approval.
6. Tool-specific files adapt the canonical rules; they do not redefine them.
7. Agents stop and escalate when work exceeds their authority.
8. Repository history belongs in Git/tasks/PRs, not inline changelogs.

## Precedence

1. Human Owner instruction
2. Accepted architecture / ADR
3. Approved specification
4. `AGENTS.md`
5. Assigned role
6. Active READY task
7. Tool adapter

A lower level may narrow execution but cannot override a higher level.
