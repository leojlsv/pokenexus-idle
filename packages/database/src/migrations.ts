import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { withPgClient } from "./pg-client.js";
import { withTransaction } from "./transaction.js";

const MIGRATION_FILE_PATTERN = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const MIGRATION_LOCK_NAMESPACE = 1347374661;
const MIGRATION_LOCK_ID = 14;

export const canonicalMigrationsDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

export interface MigrationFile {
  readonly id: string;
  readonly order: number;
  readonly fileName: string;
  readonly checksum: Buffer;
  readonly sql: string;
}

export interface MigrationRunResult {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

interface AppliedMigrationRow {
  readonly migration_id: string;
  readonly checksum: Buffer;
}

function decodeMigrationSql(bytes: Buffer, fileName: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`Migration ${fileName} is not valid UTF-8`, { cause: error });
  }
}

export async function discoverMigrations(
  migrationsDirectory: string = canonicalMigrationsDirectory,
): Promise<readonly MigrationFile[]> {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const migrations: MigrationFile[] = [];
  const orders = new Set<number>();
  const ids = new Set<string>();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".sql")) {
      continue;
    }

    const match = MIGRATION_FILE_PATTERN.exec(entry.name);
    if (!match) {
      throw new Error(`Malformed migration filename: ${entry.name}`);
    }

    const order = Number.parseInt(match[1], 10);
    if (order <= 0) {
      throw new Error(`Migration order must be positive: ${entry.name}`);
    }

    const id = entry.name.slice(0, -".sql".length);
    if (orders.has(order) || ids.has(id)) {
      throw new Error(`Duplicate migration ID/order: ${entry.name}`);
    }
    orders.add(order);
    ids.add(id);

    const bytes = await readFile(join(migrationsDirectory, entry.name));
    migrations.push({
      id,
      order,
      fileName: entry.name,
      checksum: createHash("sha256").update(bytes).digest(),
      sql: decodeMigrationSql(bytes, entry.name),
    });
  }

  migrations.sort((left, right) => left.order - right.order);
  return migrations;
}

async function bootstrapMigrationLedger(client: Client): Promise<void> {
  await withTransaction(client, async (transaction) => {
    await transaction.query("CREATE SCHEMA IF NOT EXISTS pokenexus");
    await transaction.query(`
      CREATE TABLE IF NOT EXISTS pokenexus.schema_migrations (
        migration_id text PRIMARY KEY CHECK (migration_id <> ''),
        checksum bytea NOT NULL CHECK (octet_length(checksum) = 32)
      )
    `);
  });
}

function verifyAppliedMigrations(
  migrations: readonly MigrationFile[],
  appliedRows: readonly AppliedMigrationRow[],
): Set<string> {
  if (appliedRows.length > migrations.length) {
    throw new Error("Applied migration history is not a contiguous local prefix");
  }

  const applied = new Set<string>();
  for (let index = 0; index < appliedRows.length; index += 1) {
    const row = appliedRows[index];
    const local = migrations[index];
    if (row.migration_id !== local.id) {
      throw new Error(
        `Applied migration history is not a contiguous local prefix at ${row.migration_id}`,
      );
    }
    if (!row.checksum.equals(local.checksum)) {
      throw new Error(`Applied migration checksum mismatch: ${row.migration_id}`);
    }
    applied.add(row.migration_id);
  }

  return applied;
}

export async function runMigrations(options: {
  readonly connectionString: string;
  readonly migrationsDirectory?: string;
}): Promise<MigrationRunResult> {
  if (options.connectionString.trim().length === 0) {
    throw new Error("A direct PostgreSQL connection URL is required");
  }

  const migrations = await discoverMigrations(options.migrationsDirectory);
  return withPgClient({ connectionString: options.connectionString }, async (client) => {
    await client.query(
      "SELECT pg_advisory_lock($1::integer, $2::integer)",
      [MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_ID],
    );

    let runResult!: MigrationRunResult;
    let runFailed = false;
    let runError: unknown;
    try {
      await bootstrapMigrationLedger(client);
      const appliedResult = await client.query<AppliedMigrationRow>(
        "SELECT migration_id, checksum FROM pokenexus.schema_migrations ORDER BY migration_id",
      );
      const applied = verifyAppliedMigrations(migrations, appliedResult.rows);
      const appliedIds: string[] = [];
      const skippedIds: string[] = [];

      for (const migration of migrations) {
        if (applied.has(migration.id)) {
          skippedIds.push(migration.id);
          continue;
        }

        await withTransaction(client, async (transaction) => {
          await transaction.query(migration.sql);
          await transaction.query(
            "INSERT INTO pokenexus.schema_migrations (migration_id, checksum) VALUES ($1, $2)",
            [migration.id, migration.checksum],
          );
        });
        appliedIds.push(migration.id);
      }

      runResult = { applied: appliedIds, skipped: skippedIds };
    } catch (error) {
      runFailed = true;
      runError = error;
    }

    let unlockFailed = false;
    let unlockError: unknown;
    try {
      await client.query(
        "SELECT pg_advisory_unlock($1::integer, $2::integer)",
        [MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_ID],
      );
    } catch (error) {
      unlockFailed = true;
      unlockError = error;
    }

    if (runFailed) {
      if (unlockFailed) {
        throw new AggregateError(
          [runError, unlockError],
          "Migration run and advisory-lock release both failed",
        );
      }
      throw runError;
    }
    if (unlockFailed) {
      throw unlockError;
    }

    return runResult;
  });
}
