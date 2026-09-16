import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { encodeOpaqueStringDbV1 } from "../src/opaque-string-db-codec";
import { generateUuidV7 } from "../src/uuid-v7";
import { withPgClient } from "../src/pg-client";
import { withTransaction } from "../src/transaction";
import { discoverMigrations, runMigrations } from "../src/migrations";

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
  await client.query(
    `INSERT INTO pokenexus.pokemon_instances (
      pokemon_instance_id, owner_player_id, species_id, level,
      iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe, row_version
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      ownerPlayerId,
      values.species ?? encoded("species:test"),
      values.level ?? 100,
      values.ivHp ?? 31,
      values.ivAtk ?? 31,
      values.ivDef ?? 31,
      values.ivSpa ?? 31,
      values.ivSpd ?? 31,
      values.ivSpe ?? 31,
      values.rowVersion ?? 0,
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
            (team_member_id, team_id, pokemon_instance_id, owner_player_id)
           VALUES ($1, $2, $3, $4)`,
          [generateUuidV7(), teamA, pokemonB, ownerA.playerId],
        ),
      ).rejects.toMatchObject({ code: "23503" });

      await expect(
        client.query(
          `INSERT INTO pokenexus.pokemon_team_members
            (team_member_id, team_id, pokemon_instance_id, owner_player_id)
           VALUES ($1, $2, $3, $4)`,
          [generateUuidV7(), teamA, pokemonB, ownerB.playerId],
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
        encoded("checkpoint:v1"),
        encoded("game-data:v1"),
        encoded("rules:v1"),
        "9007199254740991",
        Buffer.from([0, 1, 2]),
      ];
      const insertSql = `INSERT INTO pokenexus.hunt_checkpoints (
        checkpoint_id, player_id, checkpoint_schema_version, game_data_version,
        rules_version, logical_time_ms, checkpoint_state_bytes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`;
      await client.query(insertSql, baseValues);

      await expect(
        client.query(
          `INSERT INTO pokenexus.hunt_checkpoints (
            checkpoint_id, player_id, checkpoint_schema_version, game_data_version,
            rules_version, logical_time_ms, checkpoint_state_bytes, row_version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, -1)`,
          [generateUuidV7(), ...baseValues.slice(1)],
        ),
      ).rejects.toMatchObject({ code: "23514" });

      for (const invalidIndex of [2, 3, 4]) {
        for (const malformedBytes of [Buffer.alloc(0), Buffer.from([0])]) {
          const invalidValues = [...baseValues];
          invalidValues[0] = generateUuidV7();
          invalidValues[invalidIndex] = malformedBytes;
          await expect(client.query(insertSql, invalidValues)).rejects.toMatchObject({ code: "23514" });
        }
      }

      const tooLarge = [...baseValues];
      tooLarge[0] = generateUuidV7();
      tooLarge[5] = "9007199254740992";
      await expect(client.query(insertSql, tooLarge)).rejects.toMatchObject({ code: "23514" });
      const negative = [...baseValues];
      negative[0] = generateUuidV7();
      negative[5] = "-1";
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
