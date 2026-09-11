---
applyTo: "apps/api/**/*.ts,apps/realtime/**/*.ts,packages/database/**/*.ts"
---

- Validate client input.
- Server authoritative for durable state.
- Do not continuously persist HUB movement/presence.
- Keep DB implementation out of game-core.
