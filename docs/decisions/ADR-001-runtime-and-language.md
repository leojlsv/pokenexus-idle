# ADR-001 — TypeScript as primary language

## Status
Accepted

## Decision
Use TypeScript across client, API, realtime services and shared game packages.

## Rationale
- Single language across the stack.
- Shared contracts and types.
- High development velocity for a solo/small-agent team.
- Suitable for the expected browser, API and realtime workload.

## Future
CPU-heavy isolated services may be moved to Rust/Go only if profiling justifies it.
