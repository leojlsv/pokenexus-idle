# PokeNexus — Tool Adapter Map

| Tool / workflow | Adapter | Role |
|---|---|---|
| Lead via Aider + GitHub Copilot | `.aider.copilot.conf.yml` | Lead Developer |
| Lead escalation | same config + `--model github_copilot/claude-opus-4.6-fast` | Lead Developer |
| Codex implementation | `AGENTS.md` + explicit assignment | Secondary Developer |
| Codex review | `AGENTS.md` + separate review assignment | QA Reviewer |
| Cursor | `AGENTS.md` + `.cursor/rules/` | Secondary / Frontend Developer |
| GitHub Copilot IDE | `.github/copilot-instructions.md` + path instructions | Pair Programmer |
| Gemini CLI | `.gemini/settings.json` + `GEMINI_AUDITOR.md` | Independent Auditor |
| DeepSeek via Aider | `.aider.deepseek.conf.yml` | Mechanical Worker |
| DeepSeek escalation | same config + `--model deepseek/deepseek-v4-pro` | Mechanical Worker |
| Claude Code (optional) | `.claude/CLAUDE.md` + `.claude/rules/` | Lead Developer |

## Rule

Provider/model selection never changes project authority.

Aider `--config` loads only the specified config file, so each role profile must
contain all required safeguards/context rather than relying on `.aider.conf.yml`.
