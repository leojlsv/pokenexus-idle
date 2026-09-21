# System Architecture

## Product model

PokeNexus Idle is structured around two execution models:

### Social Hub
Persistent shared multiplayer space:
- player presence
- movement
- chat
- NPC interaction
- parties / invitations

Transport: WebSocket.

### Gameplay Instances
- Solo hunts: server-authoritative, event/elapsed-time simulation.
- Duo hunts: isolated two-player room; realtime only where interaction requires it.

## High-level topology

```text
Browser
React + PixiJS
   |
   +-- HTTP ------> API / Cloudflare Worker
   |
   +-- WebSocket -> Realtime / Durable Objects
                         |
                         +-- Hub
                         +-- Duo Hunt Rooms

API + Realtime
      |
      v
PostgreSQL

Static assets -> R2/CDN
```

Versioned static game-data uses the same R2/CDN delivery plane but remains a distinct immutable
SPEC-002 dataset. See `docs/architecture/static-game-data-delivery.md` for lazy shard loading and
historical-version retention rules.

## Layer boundaries

### web
Presentation, rendering, input and local UX state.

### api
Authentication, commands, validation, persistence orchestration.

### realtime
Ephemeral multiplayer state and room coordination.

### game-core
Pure deterministic domain logic.

### database
Persistent player/account/game state.

## Non-goals for initial architecture

- microservices
- Kubernetes
- global realtime world simulation
- persistent per-frame movement
- server tick for solo hunts
