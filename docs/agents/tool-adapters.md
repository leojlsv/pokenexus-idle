# PokeNexus — Tool Adapter Map

| Tool / workflow | Adapter | Role |
|---|---|---|
| ChatGPT project coordination | `AGENTS.md` + `docs/agents/pm-architecture-coordinator.md` | PM / Architecture Coordinator |
| GitHub Copilot CLI Lead | `.github/agents/lead-developer.agent.md` | Lead Developer |
| Codex implementation | `AGENTS.md` + explicit assignment | Secondary Developer |
| Codex review | `AGENTS.md` + separate review assignment | QA Reviewer |
| Cursor | `AGENTS.md` + `.cursor/rules/` | Frontend Developer |
| GitHub Copilot default mode | `.github/copilot-instructions.md` + path instructions | Local Pair Programmer |
| Gemini CLI | `.gemini/settings.json` + `GEMINI_AUDITOR.md` | Independent Auditor |
| DeepSeek via Aider | `.aider.deepseek.conf.yml` | Mechanical Worker |

Aider is an execution interface, not a canonical role. Its configured model/provider
inherits only the authority of the explicitly assigned role.

## Lead model policy

The Lead custom agent does not hard-code a model.

Default:
- Copilot `Auto`, so the CLI can select from currently available supported models.

An explicit model may be selected per session when a task has a concrete reason for
it. Do not encode model choice into role authority or canonical governance.

Model/provider availability changes over time; role authority does not.

## Instruction collision rule

Copilot CLI may merge `AGENTS.md`, `.github/copilot-instructions.md`, path-specific
instructions and custom-agent instructions.

Therefore repository-wide Copilot instructions are role-neutral. Role-specific
authority lives in the selected custom agent or explicit assignment.
