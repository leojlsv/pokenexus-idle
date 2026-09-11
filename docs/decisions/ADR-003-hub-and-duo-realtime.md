# ADR-003 — Realtime scope

## Status
Accepted

## Decision
Realtime networking is limited initially to:
- the shared social hub;
- duo hunt rooms when synchronous interaction is required.

Use Durable Objects + WebSocket for room coordination.

Movement and presence are ephemeral and are not continuously written to the database.
