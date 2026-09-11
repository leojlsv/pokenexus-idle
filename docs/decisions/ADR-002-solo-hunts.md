# ADR-002 — Solo Hunts are event-driven

## Status
Accepted

## Decision
Solo hunts do not run as persistent realtime server loops.

The server stores the authoritative session state and calculates progression from elapsed time, seed and rules version when checkpoints/claims occur.

## Consequences
- Lower server cost.
- Easier offline progress.
- Deterministic replay/testing.
- No WebSocket required for solo hunts.
