# PokeNexus Idle — Closed Alpha Docker Environment Plan

## Objective

Prepare the Closed Alpha Phase 01 server environment using Docker with controlled local ownership.

This environment is a server validation environment. It does not represent software distribution or a public release.

## Environment model

```text
Docker Environment
        |
        +-- PostgreSQL
        +-- API
        +-- Game data service
        +-- Web application
        |
        +-- Controlled Alpha access
```

## Requirements

- Docker available on the host machine.
- Persistent database storage owned by the Alpha environment.
- Explicit environment variables.
- Recorded runtime state for reproduction.
- Controlled tester access.

## Validation baseline

Record before Phase 01 execution:

- Docker container identifiers.
- Database volume identifier.
- Application runtime references.
- Start timestamp.
- Tester access mapping.

## Isolation rules

- Alpha environment data is isolated from other environments.
- No production database is used.
- No public enablement is implied.
- Deferred capabilities remain disabled.

## Deferred capabilities

- Public CombatPresentation.
- Durable terminal/offline summary.
- Historical manual-capture compatibility runtime.
- Move editor authority.

## First validation cycle

Before tester access:

- Start environment.
- Verify database connectivity.
- Verify API availability.
- Verify web access.
- Execute gameplay smoke flow.
- Record evidence.
