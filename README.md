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
