import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { encodeOpaqueStringDbV1 } from "../src/opaque-string-db-codec";
import { generateUuidV7 } from "../src/uuid-v7";
import { withPgClient } from "../src/pg-client";
import { withTransaction } from "../src/transaction";
import {
  canonicalMigrationsDirectory,
  discoverMigrations,
  runMigrations,
} from "../src/migrations";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    "POKENEXUS_TEST_DATABASE_URL is required for the real PostgreSQL integration suite",
  );
}

const parsedTestDatabaseUrl = new URL(testDatabaseUrl);
const testDatabaseName = decodeURIComponent(parsedTestDatabaseUrl.pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(testDatabaseName)) {
  throw new Error(
    "POKENEXUS_TEST_DATABASE_URL must target a disposable database named pokenexus_test or pokenexus_test_*",
  );
}

const temporaryDirectories: string[] = [];

async function withDirectClient<T>(operation: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

async function resetSchema(): Promise<void> {
  await withDirectClient(async (client) => {
    await client.query("DROP SCHEMA IF EXISTS pokenexus CASCADE");
  });
}

async function prepareCanonicalSchema(): Promise<void> {
  await resetSchema();
  await runMigrations({ connectionString: testDatabaseUrl });
}

async function makeMigrationDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pokenexus-integration-migrations-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function makeMigrationDirectoryThrough(count: number): Promise<string> {
  const directory = await makeMigrationDirectory();
  const migrations = await discoverMigrations();
  for (const migration of migrations.slice(0, count)) {
    await writeFile(
      join(directory, migration.fileName),
      await readFile(join(canonicalMigrationsDirectory, migration.fileName)),
    );
  }
  return directory;
}

function encoded(value: string): Buffer {
  return Buffer.from(encodeOpaqueStringDbV1(value));
}

async function createPlayer(client: Client): Promise<{ accountId: string; playerId: string }> {
  const accountId = generateUuidV7();
  const playerId = generateUuidV7();
  await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
  await client.query(
    "INSERT INTO pokenexus.players (player_id, account_id) VALUES ($1, $2)",
    [playerId, accountId],
  );
  return { accountId, playerId };
}

async function insertPokemon(
  client: Client,
  ownerPlayerId: string,
  values: Partial<{
    id: string;
    species: Buffer;
    level: number;
    ivHp: number;
    ivAtk: number;
    ivDef: number;
    ivSpa: number;
    ivSpd: number;
    ivSpe: number;
    rowVersion: number;
  }> = {},
): Promise<string> {
  const id = values.id ?? generateUuidV7();
  const level = values.level ?? 100;
  const totalExperience = level * level * level - 1;
  const opaque = (value: string) => Buffer.from(encodeOpaqueStringDbV1(value));
  await client.query(
    `INSERT INTO pokenexus.pokemon_instances (
      pokemon_instance_id, owner_player_id, species_id, level, total_experience,
      iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe, row_version,
      genetic_score, genetic_profile_a, genetic_profile_b, birth_profile, expressed_profile, shiny,
      individualization_rules_version, derivation_authority_version, derivation_authority_key_id,
      origin_pending_selection_identity,
      individualization_snapshot_identity, individualization_snapshot_commitment,
      individualization_content_version, individualization_content_hash, individualization_game_data_version
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
      50, 'Harmony', 'Endurance', 'Harmony', 'Harmony', false,
      $13, $14, $15, $16, $17, $18, $19, $20, $21
    )`,
    [
      id,
      ownerPlayerId,
      values.species ?? encoded("species:test"),
      level,
      totalExperience,
      values.ivHp ?? 31,
      values.ivAtk ?? 31,
      values.ivDef ?? 31,
      values.ivSpa ?? 31,
      values.ivSpd ?? 31,
      values.ivSpe ?? 31,
      values.rowVersion ?? 0,
      opaque("encounter-individualization-v1"),
      opaque("authority-v1"),
      opaque("key-v1:test"),
      opaque(`pending:${id}`),
      opaque(`indv1:${id}`),
      opaque(`sha256:${id}`),
      opaque("content:test"),
      opaque("sha256:content-test"),
      opaque("game-data:test"),
    ],
  );
  return id;
}

afterAll(async () => {
  await resetSchema();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("PostgreSQL 17 migration foundation", () => {
  it("applies the canonical migration once and verifies the exact checksum on repeat", async () => {
    await resetSchema();

    const migrations = await discoverMigrations();
    const migrationIds = migrations.map(({ id }) => id);
    const first = await runMigrations({ connectionString: testDatabaseUrl });
    const second = await runMigrations({ connectionString: testDatabaseUrl });
    expect(first).toEqual({ applied: migrationIds, skipped: [] });
    expect(second).toEqual({ applied: [], skipped: migrationIds });

    const ledger = await withDirectClient((client) =>
      client.query<{ migration_id: string; checksum_hex: string }>(
        "SELECT migration_id, encode(checksum, 'hex') AS checksum_hex FROM pokenexus.schema_migrations ORDER BY migration_id",
      ),
    );
    expect(ledger.rows).toEqual(
      migrations.map(({ id, checksum }) => ({
        migration_id: id,
        checksum_hex: checksum.toString("hex"),
      })),
    );
  });

  it("upgrades pre-auth canonical persistence data through the auth migration and remains idempotent", async () => {
    await resetSchema();
    const directory = await makeMigrationDirectory();
    const canonical = await discoverMigrations();
    expect(canonical.map(({ fileName }) => fileName)).toEqual([
      "0001_postgresql_schema_v1.sql",
      "0002_authentication_session_foundation.sql",
      "0003_collection_team_spec005.sql",
      "0004_progression_inventory_reward.sql",
      "0005_player_state_api_spec011.sql",
      "0006_encounter_individualization_genetics.sql",
      "0007_capture_resolution.sql",
      "0008_hunt_checkpoint_claim.sql",
    ]);
    const [persistenceMigration, authMigration] = canonical;

    await writeFile(
      join(directory, persistenceMigration.fileName),
      await readFile(join(canonicalMigrationsDirectory, persistenceMigration.fileName)),
    );
    await expect(
      runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: directory }),
    ).resolves.toEqual({ applied: [persistenceMigration.id], skipped: [] });

    const accountId = generateUuidV7();
    const playerId = generateUuidV7();
    await withDirectClient(async (client) => {
      await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
      await client.query(
        "INSERT INTO pokenexus.players (player_id, account_id) VALUES ($1, $2)",
        [playerId, accountId],
      );
    });

    await writeFile(
      join(directory, authMigration.fileName),
      await readFile(join(canonicalMigrationsDirectory, authMigration.fileName)),
    );
    await expect(
      runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: directory }),
    ).resolves.toEqual({
      applied: [authMigration.id],
      skipped: [persistenceMigration.id],
    });

    await withDirectClient(async (client) => {
      const account = await client.query<{
        account_id: string;
        auth_state: string;
        security_epoch: string;
      }>(
        "SELECT account_id, auth_state, security_epoch FROM pokenexus.accounts WHERE account_id = $1",
        [accountId],
      );
      expect(account.rows).toEqual([
        {
          account_id: accountId,
          auth_state: "pending_activation",
          security_epoch: "0",
        },
      ]);
      const player = await client.query<{ player_id: string; account_id: string }>(
        "SELECT player_id, account_id FROM pokenexus.players WHERE player_id = $1",
        [playerId],
      );
      expect(player.rows).toEqual([{ player_id: playerId, account_id: accountId }]);
    });

    await expect(
      runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: directory }),
    ).resolves.toEqual({
      applied: [],
      skipped: [persistenceMigration.id, authMigration.id],
    });
  });

  it("fails closed when bytes of an applied migration change", async () => {
    await resetSchema();
    const directory = await makeMigrationDirectory();
    const migrationPath = join(directory, "0001_probe.sql");
    await writeFile(migrationPath, "CREATE TABLE pokenexus.checksum_probe (id integer PRIMARY KEY);\n");
    await runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: directory });

    await writeFile(
      migrationPath,
      "CREATE TABLE pokenexus.checksum_probe (id integer PRIMARY KEY);\n-- changed bytes\n",
    );

    await expect(
      runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: directory }),
    ).rejects.toThrow(/checksum mismatch/);
  });

  it("rolls back a failed migration and safely executes corrected unapplied bytes", async () => {
    await resetSchema();
    const directory = await makeMigrationDirectory();
    const migrationPath = join(directory, "0001_rollback_probe.sql");
    await writeFile(
      migrationPath,
      "CREATE TABLE pokenexus.rollback_probe (id integer PRIMARY KEY); SELECT 1 / 0;\n",
    );

    await expect(
      runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: directory }),
    ).rejects.toThrow();

    const afterFailure = await withDirectClient(async (client) => ({
      table: await client.query<{ table_name: string | null }>(
        "SELECT to_regclass('pokenexus.rollback_probe')::text AS table_name",
      ),
      ledger: await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.schema_migrations WHERE migration_id = '0001_rollback_probe'",
      ),
    }));
    expect(afterFailure.table.rows[0].table_name).toBeNull();
    expect(afterFailure.ledger.rows[0].count).toBe("0");

    await writeFile(
      migrationPath,
      "CREATE TABLE pokenexus.rollback_probe (id integer PRIMARY KEY);\n",
    );
    await expect(
      runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: directory }),
    ).resolves.toEqual({ applied: ["0001_rollback_probe"], skipped: [] });
  });

  it("serializes concurrent direct migration runners", async () => {
    await resetSchema();
    const directory = await makeMigrationDirectory();
    await writeFile(
      join(directory, "0001_concurrent_probe.sql"),
      "SELECT pg_sleep(0.2); CREATE TABLE pokenexus.concurrent_probe (id integer PRIMARY KEY);\n",
    );

    const results = await Promise.all([
      runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: directory }),
      runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: directory }),
    ]);

    expect(results.flatMap(({ applied }) => applied)).toEqual(["0001_concurrent_probe"]);
    expect(results.flatMap(({ skipped }) => skipped)).toEqual(["0001_concurrent_probe"]);
  });

  it("fails closed when the ledger is not a contiguous migration prefix", async () => {
    await resetSchema();
    const directory = await makeMigrationDirectory();
    await writeFile(
      join(directory, "0001_first.sql"),
      "CREATE TABLE pokenexus.prefix_first (id integer PRIMARY KEY);\n",
    );
    await writeFile(
      join(directory, "0002_second.sql"),
      "CREATE TABLE pokenexus.prefix_second (id integer PRIMARY KEY);\n",
    );
    await runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: directory });
    await withDirectClient((client) =>
      client.query(
        "DELETE FROM pokenexus.schema_migrations WHERE migration_id = '0001_first'",
      ),
    );

    await expect(
      runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: directory }),
    ).rejects.toThrow(/contiguous local prefix/);
  });
});

describe("TASK-097 encounter individualization migration", () => {
  it("applies 0006 only after proving the pre-feature durable surfaces are empty", async () => {
    await resetSchema();
    const through0005 = await makeMigrationDirectoryThrough(5);
    await runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: through0005 });

    const through0006 = await makeMigrationDirectoryThrough(6);

    await expect(runMigrations({
      connectionString: testDatabaseUrl,
      migrationsDirectory: through0006,
    })).resolves.toMatchObject({
      applied: ["0006_encounter_individualization_genetics"],
    });

    await withDirectClient(async (client) => {
      const columns = await client.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'pokenexus'
           AND table_name = 'pokemon_instances'
           AND column_name IN (
             'genetic_score',
             'genetic_profile_a',
             'genetic_profile_b',
             'birth_profile',
             'expressed_profile',
             'shiny',
             'individualization_rules_version',
             'derivation_authority_key_id',
             'origin_pending_selection_identity',
             'individualization_snapshot_identity'
           )
         ORDER BY column_name`,
      );
      expect(columns.rows).toHaveLength(10);
      expect(columns.rows.every(({ is_nullable }) => is_nullable === "NO")).toBe(true);
    });
  });

  it("fails closed before 0006 when a pre-feature owned Pokémon exists", async () => {
    await resetSchema();
    const through0005 = await makeMigrationDirectoryThrough(5);
    await runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: through0005 });
    await withDirectClient(async (client) => {
      const { playerId } = await createPlayer(client);
      await client.query(
        `INSERT INTO pokenexus.pokemon_instances (
           pokemon_instance_id, owner_player_id, species_id, level, total_experience,
           iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe
         ) VALUES ($1, $2, $3, 5, 124, 1, 2, 3, 4, 5, 6)`,
        [generateUuidV7(), playerId, encoded("species:legacy")],
      );
    });

    await expect(runMigrations({ connectionString: testDatabaseUrl })).rejects.toThrow(
      /refuses to fabricate Genetics\/Shiny\/provenance/,
    );
    await withDirectClient(async (client) => {
      const ledger = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.schema_migrations WHERE migration_id = '0006_encounter_individualization_genetics'",
      );
      expect(ledger.rows[0]?.count).toBe("0");
    });
  });

  it("fails closed before 0006 when a pre-feature Hunt checkpoint exists", async () => {
    await resetSchema();
    const through0005 = await makeMigrationDirectoryThrough(5);
    await runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: through0005 });
    await withDirectClient(async (client) => {
      const { playerId } = await createPlayer(client);
      await client.query(
        `INSERT INTO pokenexus.hunt_checkpoints (
           checkpoint_id, player_id, checkpoint_schema_version, game_data_version,
           rules_version, logical_time_ms, checkpoint_state_bytes
         ) VALUES ($1, $2, $3, $4, $5, 0, $6)`,
        [
          generateUuidV7(),
          playerId,
          encoded("checkpoint:v1"),
          encoded("game-data:v3"),
          encoded("rules:v3"),
          Buffer.from([1]),
        ],
      );
    });

    await expect(runMigrations({ connectionString: testDatabaseUrl })).rejects.toThrow(
      /refuses to individualize pre-feature durable Hunt checkpoints/,
    );
  });
});

describe("PostgreSQL 17 SPEC-004 schema", () => {
  it("materializes the exact table set, constraint families and accepted indexes", async () => {
    await prepareCanonicalSchema();

    await withDirectClient(async (client) => {
      const tables = await client.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'pokenexus'
          AND table_name IN (
            'accounts', 'hunt_checkpoints', 'player_inventories', 'players',
            'pokemon_instances', 'pokemon_team_members', 'pokemon_teams', 'schema_migrations'
          )
        ORDER BY table_name
      `);
      expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
        "accounts",
        "hunt_checkpoints",
        "player_inventories",
        "players",
        "pokemon_instances",
        "pokemon_team_members",
        "pokemon_teams",
        "schema_migrations",
      ]);

      const columns = await client.query<{
        table_name: string;
        column_name: string;
        udt_name: string;
        is_nullable: string;
      }>(`
        SELECT table_name, column_name, udt_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'pokenexus'
          AND table_name IN (
            'accounts', 'hunt_checkpoints', 'player_inventories', 'players',
            'pokemon_instances', 'pokemon_team_members', 'pokemon_teams'
          )
          AND column_name IN (
            'account_id', 'checkpoint_id', 'player_id', 'pokemon_instance_id', 'team_member_id',
            'team_id', 'owner_player_id', 'species_id', 'level', 'iv_hp', 'iv_atk', 'iv_def',
            'iv_spa', 'iv_spd', 'iv_spe', 'checkpoint_schema_version', 'game_data_version',
            'rules_version', 'logical_time_ms', 'checkpoint_state_bytes', 'row_version',
            'created_at', 'updated_at'
          )
        ORDER BY table_name, ordinal_position
      `);
      const columnsByTable: Record<string, string[]> = {};
      for (const column of columns.rows) {
        (columnsByTable[column.table_name] ??= []).push(
          `${column.column_name}:${column.udt_name}:${column.is_nullable}`,
        );
      }
      expect(columnsByTable).toEqual({
        accounts: [
          "account_id:uuid:NO",
          "row_version:int8:NO",
          "created_at:timestamptz:NO",
          "updated_at:timestamptz:NO",
        ],
        hunt_checkpoints: [
          "checkpoint_id:uuid:NO",
          "player_id:uuid:NO",
          "checkpoint_schema_version:bytea:NO",
          "game_data_version:bytea:NO",
          "rules_version:bytea:NO",
          "logical_time_ms:int8:NO",
          "checkpoint_state_bytes:bytea:NO",
          "row_version:int8:NO",
          "created_at:timestamptz:NO",
          "updated_at:timestamptz:NO",
        ],
        player_inventories: [
          "player_id:uuid:NO",
          "row_version:int8:NO",
          "created_at:timestamptz:NO",
          "updated_at:timestamptz:NO",
        ],
        players: [
          "player_id:uuid:NO",
          "account_id:uuid:NO",
          "row_version:int8:NO",
          "created_at:timestamptz:NO",
          "updated_at:timestamptz:NO",
        ],
        pokemon_instances: [
          "pokemon_instance_id:uuid:NO",
          "owner_player_id:uuid:NO",
          "species_id:bytea:NO",
          "level:int2:NO",
          "iv_hp:int2:NO",
          "iv_atk:int2:NO",
          "iv_def:int2:NO",
          "iv_spa:int2:NO",
          "iv_spd:int2:NO",
          "iv_spe:int2:NO",
          "row_version:int8:NO",
          "created_at:timestamptz:NO",
          "updated_at:timestamptz:NO",
        ],
        pokemon_team_members: [
          "team_member_id:uuid:NO",
          "team_id:uuid:NO",
          "pokemon_instance_id:uuid:NO",
          "owner_player_id:uuid:NO",
          "created_at:timestamptz:NO",
        ],
        pokemon_teams: [
          "team_id:uuid:NO",
          "owner_player_id:uuid:NO",
          "row_version:int8:NO",
          "created_at:timestamptz:NO",
          "updated_at:timestamptz:NO",
        ],
      });

      const constraints = await client.query<{
        table_name: string;
        contype: string;
        definition: string;
      }>(`
        SELECT
          c.relname AS table_name,
          con.contype,
          pg_get_constraintdef(con.oid, true) AS definition
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'pokenexus'
          AND c.relname IN (
            'accounts', 'hunt_checkpoints', 'player_inventories', 'players',
            'pokemon_instances', 'pokemon_team_members', 'pokemon_teams'
          )
        ORDER BY c.relname, con.contype, pg_get_constraintdef(con.oid, true)
      `);
      expect(constraints.rows).toEqual(expect.arrayContaining([
        { table_name: "accounts", contype: "c", definition: "CHECK (row_version >= 0)" },
        { table_name: "accounts", contype: "p", definition: "PRIMARY KEY (account_id)" },
        {
          table_name: "hunt_checkpoints",
          contype: "c",
          definition:
            "CHECK (logical_time_ms >= 0 AND logical_time_ms <= '9007199254740991'::bigint)",
        },
        {
          table_name: "hunt_checkpoints",
          contype: "c",
          definition:
            "CHECK (octet_length(checkpoint_schema_version) > 0 AND mod(octet_length(checkpoint_schema_version), 2) = 0)",
        },
        {
          table_name: "hunt_checkpoints",
          contype: "c",
          definition:
            "CHECK (octet_length(game_data_version) > 0 AND mod(octet_length(game_data_version), 2) = 0)",
        },
        {
          table_name: "hunt_checkpoints",
          contype: "c",
          definition:
            "CHECK (octet_length(rules_version) > 0 AND mod(octet_length(rules_version), 2) = 0)",
        },
        { table_name: "hunt_checkpoints", contype: "c", definition: "CHECK (row_version >= 0)" },
        {
          table_name: "hunt_checkpoints",
          contype: "f",
          definition: "FOREIGN KEY (player_id) REFERENCES pokenexus.players(player_id)",
        },
        {
          table_name: "hunt_checkpoints",
          contype: "p",
          definition: "PRIMARY KEY (checkpoint_id)",
        },
        {
          table_name: "player_inventories",
          contype: "c",
          definition: "CHECK (row_version >= 0)",
        },
        {
          table_name: "player_inventories",
          contype: "f",
          definition: "FOREIGN KEY (player_id) REFERENCES pokenexus.players(player_id)",
        },
        {
          table_name: "player_inventories",
          contype: "p",
          definition: "PRIMARY KEY (player_id)",
        },
        { table_name: "players", contype: "c", definition: "CHECK (row_version >= 0)" },
        {
          table_name: "players",
          contype: "f",
          definition: "FOREIGN KEY (account_id) REFERENCES pokenexus.accounts(account_id)",
        },
        { table_name: "players", contype: "p", definition: "PRIMARY KEY (player_id)" },
        { table_name: "players", contype: "u", definition: "UNIQUE (account_id)" },
        {
          table_name: "pokemon_instances",
          contype: "c",
          definition: "CHECK (iv_atk >= 0 AND iv_atk <= 31)",
        },
        {
          table_name: "pokemon_instances",
          contype: "c",
          definition: "CHECK (iv_def >= 0 AND iv_def <= 31)",
        },
        {
          table_name: "pokemon_instances",
          contype: "c",
          definition: "CHECK (iv_hp >= 0 AND iv_hp <= 31)",
        },
        {
          table_name: "pokemon_instances",
          contype: "c",
          definition: "CHECK (iv_spa >= 0 AND iv_spa <= 31)",
        },
        {
          table_name: "pokemon_instances",
          contype: "c",
          definition: "CHECK (iv_spd >= 0 AND iv_spd <= 31)",
        },
        {
          table_name: "pokemon_instances",
          contype: "c",
          definition: "CHECK (iv_spe >= 0 AND iv_spe <= 31)",
        },
        {
          table_name: "pokemon_instances",
          contype: "c",
          definition: "CHECK (level >= 1 AND level <= 200)",
        },
        {
          table_name: "pokemon_instances",
          contype: "c",
          definition:
            "CHECK (octet_length(species_id) > 0 AND mod(octet_length(species_id), 2) = 0)",
        },
        {
          table_name: "pokemon_instances",
          contype: "c",
          definition: "CHECK (row_version >= 0)",
        },
        {
          table_name: "pokemon_instances",
          contype: "f",
          definition: "FOREIGN KEY (owner_player_id) REFERENCES pokenexus.players(player_id)",
        },
        {
          table_name: "pokemon_instances",
          contype: "p",
          definition: "PRIMARY KEY (pokemon_instance_id)",
        },
        {
          table_name: "pokemon_instances",
          contype: "u",
          definition: "UNIQUE (owner_player_id, pokemon_instance_id)",
        },
        {
          table_name: "pokemon_team_members",
          contype: "f",
          definition:
            "FOREIGN KEY (owner_player_id, pokemon_instance_id) REFERENCES pokenexus.pokemon_instances(owner_player_id, pokemon_instance_id)",
        },
        {
          table_name: "pokemon_team_members",
          contype: "f",
          definition:
            "FOREIGN KEY (owner_player_id, team_id) REFERENCES pokenexus.pokemon_teams(owner_player_id, team_id)",
        },
        {
          table_name: "pokemon_team_members",
          contype: "p",
          definition: "PRIMARY KEY (team_member_id)",
        },
        { table_name: "pokemon_teams", contype: "c", definition: "CHECK (row_version >= 0)" },
        {
          table_name: "pokemon_teams",
          contype: "f",
          definition: "FOREIGN KEY (owner_player_id) REFERENCES pokenexus.players(player_id)",
        },
        { table_name: "pokemon_teams", contype: "p", definition: "PRIMARY KEY (team_id)" },
        {
          table_name: "pokemon_teams",
          contype: "u",
          definition: "UNIQUE (owner_player_id, team_id)",
        },
      ]));

      const defaults = await client.query<{
        table_name: string;
        column_name: string;
        column_default: string;
      }>(`
        SELECT table_name, column_name, column_default
        FROM information_schema.columns
        WHERE table_schema = 'pokenexus'
          AND table_name IN (
            'accounts', 'hunt_checkpoints', 'player_inventories', 'players',
            'pokemon_instances', 'pokemon_team_members', 'pokemon_teams'
          )
          AND column_name IN ('row_version', 'created_at', 'updated_at')
          AND column_default IS NOT NULL
        ORDER BY table_name, ordinal_position
      `);
      expect(defaults.rows).toEqual([
        { table_name: "accounts", column_name: "row_version", column_default: "0" },
        { table_name: "accounts", column_name: "created_at", column_default: "CURRENT_TIMESTAMP" },
        { table_name: "accounts", column_name: "updated_at", column_default: "CURRENT_TIMESTAMP" },
        { table_name: "hunt_checkpoints", column_name: "row_version", column_default: "0" },
        { table_name: "hunt_checkpoints", column_name: "created_at", column_default: "CURRENT_TIMESTAMP" },
        { table_name: "hunt_checkpoints", column_name: "updated_at", column_default: "CURRENT_TIMESTAMP" },
        { table_name: "player_inventories", column_name: "row_version", column_default: "0" },
        { table_name: "player_inventories", column_name: "created_at", column_default: "CURRENT_TIMESTAMP" },
        { table_name: "player_inventories", column_name: "updated_at", column_default: "CURRENT_TIMESTAMP" },
        { table_name: "players", column_name: "row_version", column_default: "0" },
        { table_name: "players", column_name: "created_at", column_default: "CURRENT_TIMESTAMP" },
        { table_name: "players", column_name: "updated_at", column_default: "CURRENT_TIMESTAMP" },
        { table_name: "pokemon_instances", column_name: "row_version", column_default: "0" },
        { table_name: "pokemon_instances", column_name: "created_at", column_default: "CURRENT_TIMESTAMP" },
        { table_name: "pokemon_instances", column_name: "updated_at", column_default: "CURRENT_TIMESTAMP" },
        {
          table_name: "pokemon_team_members",
          column_name: "created_at",
          column_default: "CURRENT_TIMESTAMP",
        },
        { table_name: "pokemon_teams", column_name: "row_version", column_default: "0" },
        { table_name: "pokemon_teams", column_name: "created_at", column_default: "CURRENT_TIMESTAMP" },
        { table_name: "pokemon_teams", column_name: "updated_at", column_default: "CURRENT_TIMESTAMP" },
      ]);

      const foreignKeyDeleteActions = await client.query<{ confdeltype: string }>(`
        SELECT con.confdeltype
        FROM pg_constraint con
        JOIN pg_namespace n ON n.oid = con.connamespace
        WHERE n.nspname = 'pokenexus' AND con.contype = 'f'
      `);
      expect(new Set(foreignKeyDeleteActions.rows.map(({ confdeltype }) => confdeltype))).toEqual(
        new Set(["a"]),
      );

      const indexes = await client.query<{ indexname: string; indexdef: string }>(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'pokenexus'
          AND indexname IN ('pokemon_team_members_team_idx', 'pokemon_team_members_pokemon_idx')
        ORDER BY indexname
      `);
      expect(indexes.rows).toEqual([
        {
          indexname: "pokemon_team_members_pokemon_idx",
          indexdef:
            "CREATE INDEX pokemon_team_members_pokemon_idx ON pokenexus.pokemon_team_members USING btree (pokemon_instance_id, owner_player_id)",
        },
        {
          indexname: "pokemon_team_members_team_idx",
          indexdef:
            "CREATE INDEX pokemon_team_members_team_idx ON pokenexus.pokemon_team_members USING btree (team_id, owner_player_id)",
        },
      ]);
    });
  });

  it("enforces account/player cardinality and Pokémon owner, Level, IV and opaque-byte constraints", async () => {
    await prepareCanonicalSchema();

    await withDirectClient(async (client) => {
      const { accountId, playerId } = await createPlayer(client);
      await expect(
        client.query(
          "INSERT INTO pokenexus.players (player_id, account_id) VALUES ($1, $2)",
          [generateUuidV7(), accountId],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await expect(
        client.query(
          "INSERT INTO pokenexus.players (player_id, account_id) VALUES ($1, $2)",
          [generateUuidV7(), generateUuidV7()],
        ),
      ).rejects.toMatchObject({ code: "23503" });

      await expect(insertPokemon(client, generateUuidV7())).rejects.toMatchObject({ code: "23503" });
      await expect(insertPokemon(client, playerId, { level: 0 })).rejects.toMatchObject({ code: "23514" });
      await expect(insertPokemon(client, playerId, { level: 201 })).rejects.toMatchObject({ code: "23514" });
      await expect(insertPokemon(client, playerId, { species: Buffer.alloc(0) })).rejects.toMatchObject({ code: "23514" });
      await expect(insertPokemon(client, playerId, { species: Buffer.from([0]) })).rejects.toMatchObject({ code: "23514" });
      await expect(insertPokemon(client, playerId, { rowVersion: -1 })).rejects.toMatchObject({ code: "23514" });

      await expect(
        client.query("INSERT INTO pokenexus.accounts (account_id, row_version) VALUES ($1, -1)", [
          generateUuidV7(),
        ]),
      ).rejects.toMatchObject({ code: "23514" });

      const accountWithoutPlayer = generateUuidV7();
      await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountWithoutPlayer]);
      await expect(
        client.query(
          "INSERT INTO pokenexus.players (player_id, account_id, row_version) VALUES ($1, $2, -1)",
          [generateUuidV7(), accountWithoutPlayer],
        ),
      ).rejects.toMatchObject({ code: "23514" });

      for (const ivField of ["ivHp", "ivAtk", "ivDef", "ivSpa", "ivSpd", "ivSpe"] as const) {
        for (const invalidIv of [-1, 32]) {
          await expect(
            insertPokemon(client, playerId, { [ivField]: invalidIv }),
          ).rejects.toMatchObject({ code: "23514" });
        }
      }
    });
  });

  it("enforces owner-consistent Team membership and inventory ownership", async () => {
    await prepareCanonicalSchema();

    await withDirectClient(async (client) => {
      const ownerA = await createPlayer(client);
      const ownerB = await createPlayer(client);
      const pokemonB = await insertPokemon(client, ownerB.playerId);
      const teamA = generateUuidV7();
      await client.query(
        "INSERT INTO pokenexus.pokemon_teams (team_id, owner_player_id) VALUES ($1, $2)",
        [teamA, ownerA.playerId],
      );
      await expect(
        client.query(
          "INSERT INTO pokenexus.pokemon_teams (team_id, owner_player_id, row_version) VALUES ($1, $2, -1)",
          [generateUuidV7(), ownerA.playerId],
        ),
      ).rejects.toMatchObject({ code: "23514" });

      await expect(
        client.query(
          `INSERT INTO pokenexus.pokemon_team_members
            (team_member_id, team_id, pokemon_instance_id, owner_player_id, slot)
           VALUES ($1, $2, $3, $4, $5)`,
          [generateUuidV7(), teamA, pokemonB, ownerA.playerId, 1],
        ),
      ).rejects.toMatchObject({ code: "23503" });

      await expect(
        client.query(
          `INSERT INTO pokenexus.pokemon_team_members
            (team_member_id, team_id, pokemon_instance_id, owner_player_id, slot)
           VALUES ($1, $2, $3, $4, $5)`,
          [generateUuidV7(), teamA, pokemonB, ownerB.playerId, 1],
        ),
      ).rejects.toMatchObject({ code: "23503" });

      await expect(
        client.query(
          "INSERT INTO pokenexus.player_inventories (player_id) VALUES ($1)",
          [generateUuidV7()],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        client.query(
          "INSERT INTO pokenexus.player_inventories (player_id, row_version) VALUES ($1, -1)",
          [ownerA.playerId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("enforces checkpoint byte shapes, exact logical-time bound and optimistic concurrency", async () => {
    await prepareCanonicalSchema();

    await withDirectClient(async (client) => {
      const { playerId } = await createPlayer(client);
      const checkpointId = generateUuidV7();
      const baseValues = [
        checkpointId,
        playerId,
        encoded("hunt-run:checkpoint-schema-test"),
        encoded("checkpoint:v1"),
        encoded("game-data:v1"),
        encoded("rules:v1"),
        "9007199254740991",
        new Date("2026-09-26T23:20:00.000Z"),
        Buffer.from([0, 1, 2]),
      ];
      const insertSql = `INSERT INTO pokenexus.hunt_checkpoints (
        checkpoint_id, player_id, hunt_run_identity, checkpoint_schema_version, game_data_version,
        rules_version, logical_time_ms, logical_time_anchor_at, checkpoint_state_bytes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;
      await client.query(insertSql, baseValues);

      await expect(
        client.query(
          `INSERT INTO pokenexus.hunt_checkpoints (
            checkpoint_id, player_id, hunt_run_identity, checkpoint_schema_version, game_data_version,
            rules_version, logical_time_ms, logical_time_anchor_at, checkpoint_state_bytes, row_version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, -1)`,
          [
            generateUuidV7(),
            playerId,
            encoded("hunt-run:negative-row-version"),
            ...baseValues.slice(3),
          ],
        ),
      ).rejects.toMatchObject({ code: "23514" });

      for (const invalidIndex of [2, 3, 4, 5]) {
        for (const malformedBytes of [Buffer.alloc(0), Buffer.from([0])]) {
          const invalidValues = [...baseValues];
          invalidValues[0] = generateUuidV7();
          if (invalidIndex !== 2) {
            invalidValues[2] = encoded(`hunt-run:malformed-${invalidIndex}-${malformedBytes.length}`);
          }
          invalidValues[invalidIndex] = malformedBytes;
          await expect(client.query(insertSql, invalidValues)).rejects.toMatchObject({ code: "23514" });
        }
      }

      const tooLarge = [...baseValues];
      tooLarge[0] = generateUuidV7();
      tooLarge[2] = encoded("hunt-run:too-large");
      tooLarge[6] = "9007199254740992";
      await expect(client.query(insertSql, tooLarge)).rejects.toMatchObject({ code: "23514" });
      const negative = [...baseValues];
      negative[0] = generateUuidV7();
      negative[2] = encoded("hunt-run:negative-time");
      negative[6] = "-1";
      await expect(client.query(insertSql, negative)).rejects.toMatchObject({ code: "23514" });

      const current = await client.query<{ row_version: string }>(
        `UPDATE pokenexus.hunt_checkpoints
         SET row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE checkpoint_id = $1 AND row_version = 0
         RETURNING row_version`,
        [checkpointId],
      );
      expect(current.rowCount).toBe(1);
      expect(current.rows[0].row_version).toBe("1");
      const stale = await client.query(
        `UPDATE pokenexus.hunt_checkpoints
         SET row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE checkpoint_id = $1 AND row_version = 0`,
        [checkpointId],
      );
      expect(stale.rowCount).toBe(0);
    });
  });

  it("uses invocation-local clients and READ COMMITTED transactions with rollback on failure", async () => {
    await prepareCanonicalSchema();
    const rolledBackAccountId = generateUuidV7();

    await expect(
      withPgClient({ connectionString: testDatabaseUrl }, async (client) =>
        withTransaction(client, async (transaction) => {
          const isolation = await transaction.query<{ transaction_isolation: string }>(
            "SHOW transaction_isolation",
          );
          expect(isolation.rows[0].transaction_isolation).toBe("read committed");
          await transaction.query(
            "INSERT INTO pokenexus.accounts (account_id) VALUES ($1)",
            [rolledBackAccountId],
          );
          throw new Error("force rollback");
        }),
      ),
    ).rejects.toThrow("force rollback");

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const result = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.accounts WHERE account_id = $1",
        [rolledBackAccountId],
      );
      expect(result.rows[0].count).toBe("0");
    });
  });
});
