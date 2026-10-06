# PokeNexus Idle

Browser-based idle game with a shared social hub and instanced solo/duo hunts.

## Architecture

- `apps/web`: React + PixiJS client
- `apps/api`: HTTP API with Cloudflare Workers + Hono
- `apps/realtime`: Durable Objects / WebSocket realtime layer
- `packages/game-core`: deterministic game simulation
- `packages/game-data`: versioned static game definitions
- `packages/game-protocol`: client/server protocol contracts
- `packages/game-types`: shared domain types
- `packages/database`: database schema and persistence layer

See:
- `docs/architecture/system.md`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `docs/agents/launching.md`

## Project roadmap

`docs/project/PROJECT_ROADMAP.md` is the editable roadmap for the checked-out
branch; `docs/project/PROJECT_ROADMAP.html` is generated with
`pnpm roadmap:generate` and validated with `pnpm roadmap:check`. The check is
**branch-local** and does not consolidate other worktrees.

In the local Windows workspace, `G:\pokenexus-idle\PROJECT_ROADMAP.html` is
an untracked landing page with separately labelled integrated and provisional
worktree views. It is not a source of Git history or automatic publication.
Consult `docs/agents/workflow.md` before reconciling or publishing task states.
In a Windows multi-worktree checkout, run `pnpm portfolio:generate-local` after
reconciling the control-plane files, then `pnpm portfolio:check-local`. The local
gate checks the stamped landing, exact integrated-main snapshot, provisional
dashboard link, canonical current control-plane worktrees and current specification-ID
collisions. Preserved historical worktrees remain evidence and do not become
current owners merely by retaining old task metadata. This is a local control,
not a CI substitute or proof that independent review/approval gates passed.
