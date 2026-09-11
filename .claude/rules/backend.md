---
paths:
  - "apps/api/**/*.ts"
  - "apps/realtime/**/*.ts"
  - "packages/database/**/*.ts"
---

# Backend
- Validate untrusted input.
- Server authoritative for durable state.
- Keep movement/presence ephemeral.
- Do not leak DB concerns into game-core.
- Escalate protocol/topology changes.
