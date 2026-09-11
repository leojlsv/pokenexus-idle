# PokeNexus — Tool Adapter Map

| Tool / workflow | Adapter | Role |
|---|---|---|
| GitHub Copilot CLI Lead | `.github/agents/lead-developer.agent.md` | Lead Developer |
| Codex implementation | `AGENTS.md` + explicit assignment | Secondary Developer |
| Codex review | `AGENTS.md` + separate review assignment | QA Reviewer |
| Cursor | `AGENTS.md` + `.cursor/rules/` | Secondary / Frontend Developer |
| GitHub Copilot default mode | `.github/copilot-instructions.md` + path instructions | Pair Programmer |
| Gemini CLI | `.gemini/settings.json` + `GEMINI_AUDITOR.md` | Independent Auditor |
| DeepSeek via Aider | `.aider.deepseek.conf.yml` | Mechanical Worker |

## Lead model policy

The Lead custom agent does not hard-code a model.

Preferred:
- current Claude Sonnet family available in GitHub Copilot CLI.

Escalation:
- current Claude Opus family for unusually difficult work.

Fallback:
- Copilot `Auto`.

Model/provider availability changes over time; role authority does not.

## Instruction collision rule

Copilot CLI may merge `AGENTS.md`, `.github/copilot-instructions.md`, path-specific
instructions and custom-agent instructions.

Therefore repository-wide Copilot instructions are role-neutral. Role-specific
authority lives in the selected custom agent or explicit assignment.
