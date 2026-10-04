# System Architecture

## Product model

PokeNexus Idle is structured around functional management surfaces plus bounded gameplay/social
sessions when an accepted feature requires synchronous coordination.

### HUB
Functional player-facing surface for:
- management/navigation
- PokéCenter and other accepted services
- NPC/service interaction hooks
- explicit social or multiplayer action entry points

Ordinary HUB use has no ambient shared multiplayer presence, shared movement state, global HUB chat
room or always-on WebSocket. HTTP/API is the default transport. A later local/private HUB scene or
avatar movement presentation does not create shared network authority by itself.

### Action-scoped player connections
Explicit feature actions may create bounded participant sessions when their accepted contracts
require live shared state. Realtime transport, authorization, lifecycle, reconnect/teardown and
durable handoff are owned by the feature/session contract under ADR-007.

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
                         +-- Action-scoped feature rooms
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
Ephemeral action-scoped multiplayer state and room coordination.

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
