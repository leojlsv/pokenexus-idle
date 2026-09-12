# PokeNexus — Agent Launching

## PM / Architecture Coordinator — ChatGPT

Use the canonical role in `docs/agents/pm-architecture-coordinator.md` for planning,
specification, task decomposition and acceptance coordination. This role does not
inherit implementation authority unless an approved task explicitly assigns it.

## Lead Developer — GitHub Copilot CLI

Repository custom agent:

`.github/agents/lead-developer.agent.md`

### Recommended interactive flow

From repository root:

```powershell
copilot
```

Then:

```text
/instructions
```

Verify that repository instructions are loaded.

Model selection is optional. The recommended default is:

```text
/model
```

Choose `Auto` unless the task has a concrete reason to pin a currently supported
model. Model choice does not change project authority.

Select the role:

```text
/agent
```

Choose:

```text
lead-developer
```

Then ask for a pre-implementation review of the active task before edits.

### Programmatic / robust launch

```powershell
copilot --agent lead-developer --model auto
```

This avoids hard-coding a model name that may later be retired.

## Mechanical Worker — DeepSeek + Aider

```powershell
aider --config .aider.deepseek.conf.yml
```

Role:

`docs/agents/mechanical-worker.md`

Use only for Class C work.

Before any edit, add the exact assigned task as read-only context from inside Aider:

```text
/read-only tasks/active/TASK-XXX-description.md
```

Replace the placeholder with the exact task path. The task must name the Mechanical
Worker as owner, name the DeepSeek/Aider profile as the owner execution surface, and
currently be in `READY`, `ACTIVE` or `FIX`.

Do not pass the task through the CLI `--read` flag: in the approved Aider version that
would replace the profile's canonical `read:` list rather than extend it.

If the work stops being mechanical/Class C, escalate the task to the Lead Developer.

## Secondary Developer — Codex

Use a dedicated implementation session:

```text
Role: Secondary Developer.
Execution surface: Codex.
Read AGENTS.md and docs/agents/secondary-developer.md.
Implement TASK-XXX only.
```

## QA Reviewer — Codex

Use a fresh review session:

```text
Role: QA Reviewer.
Execution surface: Codex.
Read AGENTS.md and docs/agents/qa-reviewer.md.
Review TASK-XXX and the branch diff.
Do not modify code.
```

Codex must not implement and approve the same task.

## Independent Auditor — Gemini CLI

```powershell
gemini
```

Role:

`docs/agents/independent-auditor.md`

Default mode is read-only. Use for the high-risk cases defined in
`docs/agents/approval-gates.md`.

## Frontend Developer — Cursor

Role:

`docs/agents/frontend-developer.md`

Use for scoped React, PixiJS, CSS/layout, frontend state and isolated client integration.

The Cursor implementation session must not review/approve a task it implemented.

## Local Pair Programmer — GitHub Copilot

When Copilot is used without an explicit custom project role, it is only a local
pair programmer and follows `.github/copilot-instructions.md` and
`docs/agents/pair-programmer.md`.
