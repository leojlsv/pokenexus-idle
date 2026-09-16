import { runMigrations } from "./migrations.js";

const connectionString = process.env.POKENEXUS_DIRECT_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "POKENEXUS_DIRECT_DATABASE_URL is required and must point to the direct administrative PostgreSQL endpoint",
  );
}

const result = await runMigrations({ connectionString });
process.stdout.write(
  `Migrations complete: ${result.applied.length} applied, ${result.skipped.length} already applied\n`,
);
