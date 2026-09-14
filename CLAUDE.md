# PokeNexus — Claude Code Adapter

Follow `AGENTS.md` as the repository-wide authority baseline.

## Default project role

Claude Code is the official execution surface for the **Frontend Developer** role.
Read `docs/agents/frontend-developer.md` before implementation.

Only implement a task when all of the following are true:

- the task has reached `READY` and is currently in `READY`, `ACTIVE` or `FIX`;
- the task assigns the Frontend Developer as implementation owner;
- the task names Claude Code as the owner execution surface, or explicitly assigns
  Claude Code to another canonical role under an approved task;
- the requested work stays inside the task's accepted scope and architecture.

Do not review, audit or approve a task implemented by the same Claude Code session.
Do not create commits, pushes, merges, rebases or force-pushes without explicit Human
Owner authorization under `docs/engineering/git-policy.md`.

## Frontend boundaries

For `apps/web` and frontend-facing work:

- the client is not authoritative for persistent rewards or progression;
- React owns application UI;
- prefer PixiJS for realtime 2D entity rendering where appropriate;
- reuse accepted shared protocol/domain types instead of redefining semantics;
- preserve keyboard, focus, responsive and reduced-motion requirements from the task;
- do not introduce game rules, persistence semantics, public-contract changes or
  realtime-topology decisions from the frontend layer.

## Validation

Run only checks relevant and available for the assigned task, and report exactly what
ran. Repository project checks are defined in `AGENTS.md` and task-specific validation.
