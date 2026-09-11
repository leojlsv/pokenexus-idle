# PokeNexus — Agent Launching

## Claude Code

Run from repository root.

Claude loads shared context from `.claude/CLAUDE.md` and its role from
`.claude/rules/00-role.md`.

Verify loaded memory/rules with Claude Code context inspection.

## Claude via Aider

```powershell
aider --config .aider.claude.conf.yml --model <claude-model>
```

## DeepSeek via Aider

```powershell
aider --config .aider.deepseek.conf.yml --model <deepseek-model>
```

## Gemini CLI

```powershell
gemini
```

Workspace config loads `GEMINI_AUDITOR.md` and starts in plan/read-only mode.

## Codex — implementation

Use a separate implementation session:

```text
Role: Codex Secondary Developer.
Read AGENTS.md and docs/agents/codex-developer.md.
Implement TASK-XXX only.
```

## Codex — QA

Use a fresh/separate review session:

```text
Role: Codex QA Reviewer.
Read AGENTS.md and docs/agents/codex-qa.md.
Review TASK-XXX and the branch diff. Do not modify code.
```

## Cursor

Default scoped implementation role:
`docs/agents/cursor-developer.md`.

Do not use the same Cursor implementation session as merge-gate QA.

## Copilot

Copilot assists the current task owner and follows `.github/` instructions.
