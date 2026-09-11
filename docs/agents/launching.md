# PokeNexus — Agent Launching

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

Select the model:

```text
/model
```

Preferred: current Claude Sonnet model available in Copilot CLI.
If unavailable or rate-limited, use `Auto`.

Use a current Claude Opus model only as an escalation for unusually difficult
debugging/refactoring. Model choice does not change project authority.

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

`docs/agents/deepseek-worker.md`

Use only for Class C work.

If the work stops being mechanical/Class C, escalate the task to the Lead Developer.

## Secondary Developer — Codex

Use a dedicated implementation session:

```text
Role: Codex Secondary Developer.
Read AGENTS.md and docs/agents/codex-developer.md.
Implement TASK-XXX only.
```

## QA Reviewer — Codex

Use a fresh review session:

```text
Role: Codex QA Reviewer.
Read AGENTS.md and docs/agents/codex-qa.md.
Review TASK-XXX and the branch diff.
Do not modify code.
```

Codex must not implement and approve the same task.

## Independent Auditor — Gemini CLI

```powershell
gemini
```

Role:

`docs/agents/gemini-auditor.md`

Default mode is read-only. Use for the high-risk cases defined in
`docs/agents/approval-gates.md`.

## Secondary / Frontend Developer — Cursor

Role:

`docs/agents/cursor-developer.md`

Use for scoped React, PixiJS, CSS/layout, frontend state and isolated client integration.

Cursor must not review/approve a task it implemented.

## Local Pair Programmer — GitHub Copilot

When Copilot is used without an explicit custom project role, it is only a local
pair programmer and follows `.github/copilot-instructions.md`.
