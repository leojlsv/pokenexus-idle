# PokeNexus — Agent Launching

## Lead Developer — Aider + GitHub Copilot

Default:

```powershell
aider --config .aider.copilot.conf.yml
```

Model:

```text
github_copilot/claude-sonnet-4.5
```

Role:

`docs/agents/claude-lead.md`

Escalate only when necessary:

```powershell
aider --config .aider.copilot.conf.yml --model github_copilot/claude-opus-4.6-fast
```

The provider/model does not change the Lead Developer authority.

## Mechanical Worker — DeepSeek + Aider

Default:

```powershell
aider --config .aider.deepseek.conf.yml
```

Role:

`docs/agents/deepseek-worker.md`

Escalate only while the task remains Class C:

```powershell
aider --config .aider.deepseek.conf.yml --model deepseek/deepseek-v4-pro
```

If the work stops being mechanical/Class C, escalate the task to the Lead Developer instead.

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

## Local Pair Programmer — GitHub Copilot IDE

Follows:

```text
.github/copilot-instructions.md
.github/instructions/
```

Use for local assistance only. It does not gain architectural authority.
