# database

Database schema, migrations and persistence adapters.

Primary target: PostgreSQL.

Runtime access uses invocation-local `pg.Client` instances through `withPgClient`; this package does
not create an application-side global pool.

Canonical migrations live in `migrations/`. Run them only through a direct administrative PostgreSQL
endpoint by setting `POKENEXUS_DIRECT_DATABASE_URL` and invoking
`corepack pnpm --filter @pokenexus/database migrate`.

Real-database verification is separate from ordinary unit tests. Set `POKENEXUS_TEST_DATABASE_URL`
to a disposable PostgreSQL database named `pokenexus_test` or `pokenexus_test_*`, then run
`corepack pnpm --filter @pokenexus/database test:integration`.

OpaqueStringDbCodec v1 preserves exact TypeScript UTF-16 code-unit equality in `bytea`. Its encoded
byte ordering is storage representation only and is not canonical domain ordering.
