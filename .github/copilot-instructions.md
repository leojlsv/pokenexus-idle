# PokeNexus — GitHub Copilot Shared Instructions

Follow `AGENTS.md` and the assigned task. Implementation work must be based on a task
that has reached READY and is currently in an implementation state (`READY`, `ACTIVE`
or `FIX`).

Role authority comes from the explicitly selected/assigned project role, not from
the provider or model.

When a repository custom agent is active, follow that agent's role and boundaries.

When no explicit implementation/review role is active, default to Local Pair
Programmer behavior:
- read `docs/agents/pair-programmer.md`;
- assist the current owner;
- do not own architecture or feature scope;
- do not approve work;
- do not make database-strategy, realtime-topology, public-protocol, security-model,
  game-rule, or economy decisions.

For all modes:
- stay inside task scope;
- do not introduce dependencies unless explicitly required;
- do not modify unrelated files;
- prefer existing patterns;
- update tests when behavior changes;
- do not generate changelogs, progress/status reports, completion-summary files,
  or AI attribution;
- never claim validation passed unless it actually ran.
