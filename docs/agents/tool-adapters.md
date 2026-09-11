# PokeNexus — Tool Adapter Map

| Tool | Adapter | Default role |
|---|---|---|
| Claude Code | `.claude/CLAUDE.md` + `.claude/rules/` | Lead Developer |
| Codex implementation | `AGENTS.md` + explicit assignment | Secondary Developer |
| Codex review | `AGENTS.md` + separate review assignment | QA Reviewer |
| Cursor | `AGENTS.md` + `.cursor/rules/` | Secondary / Frontend Developer |
| GitHub Copilot | `.github/copilot-instructions.md` + path instructions | Pair Programmer |
| Gemini CLI | `.gemini/settings.json` + `GEMINI_AUDITOR.md` | Independent Auditor |
| Claude via Aider | `.aider.claude.conf.yml` | Lead Developer |
| DeepSeek via Aider | `.aider.deepseek.conf.yml` | Mechanical Worker |

## Important

Some Copilot modes also discover agent instruction files such as `AGENTS.md`,
root `CLAUDE.md`/`GEMINI.md`, and Copilot CLI can read `.claude/CLAUDE.md`.

Therefore `.claude/CLAUDE.md` must remain role-neutral; Claude's Lead role is
defined in `.claude/rules/00-role.md`.
