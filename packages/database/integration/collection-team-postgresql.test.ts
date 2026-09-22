import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import {
  createOwnedTeam,
  deleteOwnedTeam,
  listOwnedPokemon,
  listOwnedTeams,
  loadOwnedPokemon,
  loadOwnedTeam,
  replaceOwnedPokemonMoveLoadout,
  replaceOwnedTeamRoster,
  setOwnedPokemonSelectedAbility,
} from "../src/collection-team-repository";
import {
  canonicalMigrationsDirectory,
  discoverMigrations,
  runMigrations,
} from "../src/migrations";
import { encodeOpaqueStringDbV1 } from "../src/opaque-string-db-codec";
import { generateUuidV7 } from "../src/uuid-v7";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    "POKENEXUS_TEST_DATABASE_URL is required for the real PostgreSQL integration suite",
  );
}

const testDatabaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(testDatabaseName)) {
  throw new Error(
    "POKENEXUS_TEST_DATABASE_URL must target a disposable database named pokenexus_test or pokenexus_test_*",
  );
}

const temporaryDirectories: string[] = [];

async function withClient<T>(operation: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

async function resetSchema(): Promise<void> {
  await withClient((client) => client.query("DROP SCHEMA IF EXISTS pokenexus CASCADE").then(() => undefined));
}

async function migrationDirectoryThrough(count: number): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pokenexus-task020-migrations-"));
  temporaryDirectories.push(directory);
  const migrations = await discoverMigrations();
  for (const migration of migrations.slice(0, count)) {
    await writeFile(
      join(directory, migration.fileName),
      await readFile(join(canonicalMigrationsDirectory, migration.fileName)),
    );
  }
  return directory;
}

async function prepareThrough0002(): Promise<void> {
  await resetSchema();
  const directory = await migrationDirectoryThrough(2);
  await runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: directory });
}

async function prepareCanonicalSchema(): Promise<void> {
  await resetSchema();
  await runMigrations({ connectionString: testDatabaseUrl });
}

async function createPlayer(client: Client): Promise<string> {
  const accountId = generateUuidV7();
  const playerId = generateUuidV7();
  await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
  await client.query(
    "INSERT INTO pokenexus.players (player_id, account_id) VALUES ($1, $2)",
    [playerId, accountId],
  );
  return playerId;
}

async function insertOwnedPokemon(
  client: Client,
  ownerPlayerId: string,
  options: {
    readonly pokemonInstanceId?: string;
    readonly speciesId?: string;
    readonly rowVersion?: bigint;
    readonly createdAt?: Date;
    readonly updatedAt?: Date;
  } = {},
): Promise<string> {
  const pokemonInstanceId = options.pokemonInstanceId ?? generateUuidV7();
  const createdAt = options.createdAt ?? new Date("2026-09-17T20:00:00.000Z");
  const updatedAt = options.updatedAt ?? createdAt;
  await client.query(
    `INSERT INTO pokenexus.pokemon_instances (
       pokemon_instance_id, owner_player_id, species_id, level, total_experience,
       iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe,
       row_version, created_at, updated_at
     ) VALUES ($1, $2, $3, 50, 124999, 1, 2, 3, 4, 5, 6, $4, $5, $6)`,
    [
      pokemonInstanceId,
      ownerPlayerId,
      Buffer.from(encodeOpaqueStringDbV1(options.speciesId ?? "species:test")),
      (options.rowVersion ?? 0n).toString(),
      createdAt,
      updatedAt,
    ],
  );
  return pokemonInstanceId;
}

async function seedLegacyTeam(client: Client): Promise<{
  ownerPlayerId: string;
  pokemonInstanceId: string;
  teamId: string;
}> {
  const accountId = generateUuidV7();
  const ownerPlayerId = generateUuidV7();
  const pokemonInstanceId = generateUuidV7();
  const teamId = generateUuidV7();
  await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
  await client.query(
    "INSERT INTO pokenexus.players (player_id, account_id) VALUES ($1, $2)",
    [ownerPlayerId, accountId],
  );
  await client.query(
    `INSERT INTO pokenexus.pokemon_instances (
       pokemon_instance_id, owner_player_id, species_id, level,
       iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe
     ) VALUES ($1, $2, $3, 5, 1, 2, 3, 4, 5, 6)`,
    [pokemonInstanceId, ownerPlayerId, Buffer.from(encodeOpaqueStringDbV1("species:test"))],
  );
  await client.query(
    "INSERT INTO pokenexus.pokemon_teams (team_id, owner_player_id) VALUES ($1, $2)",
    [teamId, ownerPlayerId],
  );
  return { ownerPlayerId, pokemonInstanceId, teamId };
}

afterAll(async () => {
  await resetSchema();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("TASK-020 SPEC-005 migration", () => {
  it("upgrades canonical 0001+0002 with empty Team membership and remains idempotent", async () => {
    await prepareThrough0002();
    const canonical = await discoverMigrations();
    expect(canonical.map(({ fileName }) => fileName)).toEqual([
      "0001_postgresql_schema_v1.sql",
      "0002_authentication_session_foundation.sql",
      "0003_collection_team_spec005.sql",
      "0004_progression_inventory_reward.sql",
    ]);

    const before = await withClient(async (client) => {
      const seeded = await seedLegacyTeam(client);
      const pokemon = await client.query<{ row_version: string }>(
        "SELECT row_version FROM pokenexus.pokemon_instances WHERE pokemon_instance_id = $1",
        [seeded.pokemonInstanceId],
      );
      return { ...seeded, rowVersion: pokemon.rows[0]?.row_version };
    });
    const result = await runMigrations({ connectionString: testDatabaseUrl });
    expect(result).toEqual({
      applied: [canonical[2].id, canonical[3].id],
      skipped: [canonical[0].id, canonical[1].id],
    });
    await expect(runMigrations({ connectionString: testDatabaseUrl })).resolves.toEqual({
      applied: [],
      skipped: canonical.map(({ id }) => id),
    });

    await withClient(async (client) => {
      const pokemon = await client.query<{
        selected_ability_id: Buffer | null;
        row_version: string;
      }>(
        "SELECT selected_ability_id, row_version FROM pokenexus.pokemon_instances WHERE pokemon_instance_id = $1",
        [before.pokemonInstanceId],
      );
      expect(pokemon.rows).toEqual([
        { selected_ability_id: null, row_version: before.rowVersion },
      ]);
      const loadout = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.pokemon_move_loadout",
      );
      expect(loadout.rows[0]?.count).toBe("0");
    });
  });

  it("fails closed and leaves 0003 unapplied when unordered Team membership exists", async () => {
    await prepareThrough0002();
    await withClient(async (client) => {
      const seeded = await seedLegacyTeam(client);
      await client.query(
        `INSERT INTO pokenexus.pokemon_team_members (
           team_member_id, team_id, pokemon_instance_id, owner_player_id
         ) VALUES ($1, $2, $3, $4)`,
        [generateUuidV7(), seeded.teamId, seeded.pokemonInstanceId, seeded.ownerPlayerId],
      );
    });

    await expect(runMigrations({ connectionString: testDatabaseUrl })).rejects.toThrow(
      /unordered pokemon_team_members rows exist/,
    );
    await withClient(async (client) => {
      const ledger = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.schema_migrations WHERE migration_id = '0003_collection_team_spec005'",
      );
      expect(ledger.rows[0]?.count).toBe("0");
      const columns = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'pokenexus' AND table_name = 'pokemon_team_members' AND column_name = 'slot'`,
      );
      expect(columns.rows).toEqual([]);
    });
  });

  it("holds an ACCESS EXCLUSIVE lock so an old-application insert cannot pass the empty proof", async () => {
    await prepareThrough0002();
    const migrationSql = await readFile(
      join(canonicalMigrationsDirectory, "0003_collection_team_spec005.sql"),
      "utf8",
    );
    const migrationClient = new Client({ connectionString: testDatabaseUrl });
    const oldApplicationClient = new Client({ connectionString: testDatabaseUrl });
    const observerClient = new Client({ connectionString: testDatabaseUrl });
    await Promise.all([
      migrationClient.connect(),
      oldApplicationClient.connect(),
      observerClient.connect(),
    ]);
    try {
      const seeded = await seedLegacyTeam(migrationClient);
      const pid = await oldApplicationClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      await migrationClient.query("BEGIN");
      await migrationClient.query(
        "LOCK TABLE pokenexus.pokemon_team_members IN ACCESS EXCLUSIVE MODE",
      );

      const oldInsert = oldApplicationClient.query(
        `INSERT INTO pokenexus.pokemon_team_members (
           team_member_id, team_id, pokemon_instance_id, owner_player_id
         ) VALUES ($1, $2, $3, $4)`,
        [generateUuidV7(), seeded.teamId, seeded.pokemonInstanceId, seeded.ownerPlayerId],
      );

      let observedWaiting = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const waiting = await observerClient.query<{ wait_event_type: string | null }>(
          "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1",
          [pid.rows[0]?.pid],
        );
        if (waiting.rows[0]?.wait_event_type === "Lock") {
          observedWaiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(observedWaiting).toBe(true);

      await migrationClient.query(migrationSql);
      await migrationClient.query("COMMIT");
      await expect(oldInsert).rejects.toMatchObject({ code: "23502" });
    } finally {
      await Promise.allSettled([
        migrationClient.query("ROLLBACK"),
        migrationClient.end(),
        oldApplicationClient.end(),
        observerClient.end(),
      ]);
    }
  });
});

describe("TASK-020 Collection and Team persistence", () => {
  it("enforces selected Ability, Move Loadout and Team structural constraints without blocking cross-Team reuse", async () => {
    await prepareCanonicalSchema();
    await withClient(async (client) => {
      const ownerA = await createPlayer(client);
      const ownerB = await createPlayer(client);
      const pokemonA1 = await insertOwnedPokemon(client, ownerA);
      const pokemonA2 = await insertOwnedPokemon(client, ownerA);
      const pokemonB = await insertOwnedPokemon(client, ownerB);

      await expect(
        client.query(
          "UPDATE pokenexus.pokemon_instances SET selected_ability_id = $2 WHERE pokemon_instance_id = $1",
          [pokemonA1, Buffer.from(encodeOpaqueStringDbV1("ability:valid"))],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        client.query(
          "UPDATE pokenexus.pokemon_instances SET selected_ability_id = $2 WHERE pokemon_instance_id = $1",
          [pokemonA1, Buffer.alloc(0)],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        client.query(
          "UPDATE pokenexus.pokemon_instances SET selected_ability_id = $2 WHERE pokemon_instance_id = $1",
          [pokemonA1, Buffer.from([0x01])],
        ),
      ).rejects.toMatchObject({ code: "23514" });

      const moveA = Buffer.from(encodeOpaqueStringDbV1("move:a"));
      const moveB = Buffer.from(encodeOpaqueStringDbV1("move:b"));
      await client.query(
        `INSERT INTO pokenexus.pokemon_move_loadout
           (owner_player_id, pokemon_instance_id, slot, move_id)
         VALUES ($1, $2, 1, $3)`,
        [ownerA, pokemonA1, moveA],
      );
      await expect(
        client.query(
          `INSERT INTO pokenexus.pokemon_move_loadout
             (owner_player_id, pokemon_instance_id, slot, move_id)
           VALUES ($1, $2, 0, $3)`,
          [ownerA, pokemonA2, moveB],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        client.query(
          `INSERT INTO pokenexus.pokemon_move_loadout
             (owner_player_id, pokemon_instance_id, slot, move_id)
           VALUES ($1, $2, 1, $3)`,
          [ownerA, pokemonA1, moveB],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await expect(
        client.query(
          `INSERT INTO pokenexus.pokemon_move_loadout
             (owner_player_id, pokemon_instance_id, slot, move_id)
           VALUES ($1, $2, 2, $3)`,
          [ownerA, pokemonA1, moveA],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await expect(
        client.query(
          `INSERT INTO pokenexus.pokemon_move_loadout
             (owner_player_id, pokemon_instance_id, slot, move_id)
           VALUES ($1, $2, 1, $3)`,
          [ownerA, pokemonB, moveB],
        ),
      ).rejects.toMatchObject({ code: "23503" });

      const teamA1 = generateUuidV7();
      const teamA2 = generateUuidV7();
      await client.query(
        "INSERT INTO pokenexus.pokemon_teams (team_id, owner_player_id) VALUES ($1, $2), ($3, $2)",
        [teamA1, ownerA, teamA2],
      );
      await client.query(
        `INSERT INTO pokenexus.pokemon_team_members
           (team_member_id, team_id, pokemon_instance_id, owner_player_id, slot)
         VALUES ($1, $2, $3, $4, 1)`,
        [generateUuidV7(), teamA1, pokemonA1, ownerA],
      );
      await expect(
        client.query(
          `INSERT INTO pokenexus.pokemon_team_members
             (team_member_id, team_id, pokemon_instance_id, owner_player_id, slot)
           VALUES ($1, $2, $3, $4, 7)`,
          [generateUuidV7(), teamA1, pokemonA2, ownerA],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        client.query(
          `INSERT INTO pokenexus.pokemon_team_members
             (team_member_id, team_id, pokemon_instance_id, owner_player_id, slot)
           VALUES ($1, $2, $3, $4, 1)`,
          [generateUuidV7(), teamA1, pokemonA2, ownerA],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await expect(
        client.query(
          `INSERT INTO pokenexus.pokemon_team_members
             (team_member_id, team_id, pokemon_instance_id, owner_player_id, slot)
           VALUES ($1, $2, $3, $4, 2)`,
          [generateUuidV7(), teamA1, pokemonA1, ownerA],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await expect(
        client.query(
          `INSERT INTO pokenexus.pokemon_team_members
             (team_member_id, team_id, pokemon_instance_id, owner_player_id, slot)
           VALUES ($1, $2, $3, $4, 2)`,
          [generateUuidV7(), teamA1, pokemonB, ownerA],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        client.query(
          `INSERT INTO pokenexus.pokemon_team_members
             (team_member_id, team_id, pokemon_instance_id, owner_player_id, slot)
           VALUES ($1, $2, $3, $4, 1)`,
          [generateUuidV7(), teamA2, pokemonA1, ownerA],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  it("preserves opaque IDs losslessly, exposes staged zero-loadout, and keeps stale Pokémon writes inert", async () => {
    await prepareCanonicalSchema();
    await withClient(async (client) => {
      const owner = await createPlayer(client);
      const otherOwner = await createPlayer(client);
      const speciesId = "species:\u0000é\ud800";
      const abilityId = "ability:\u0000Ω\udfff";
      const moveIds = ["move:α", "move:\u0000", "move:\ud800"];
      const initialUpdatedAt = new Date("2026-09-17T20:00:00.000Z");
      const pokemon = await insertOwnedPokemon(client, owner, { speciesId, updatedAt: initialUpdatedAt });
      await insertOwnedPokemon(client, otherOwner, { speciesId: "species:other" });

      await expect(loadOwnedPokemon(client, owner, pokemon)).resolves.toMatchObject({
        speciesId,
        selectedAbilityId: null,
        rowVersion: 0n,
        moveLoadout: { state: "uninitialized", moveIds: [] },
      });
      const collection = await listOwnedPokemon(client, owner);
      expect(collection).toHaveLength(1);
      expect(collection[0]).toMatchObject({ pokemonInstanceId: pokemon, speciesId, rowVersion: 0n });
      await expect(listOwnedPokemon(client, otherOwner)).resolves.toHaveLength(1);

      const abilityAt = new Date("2026-09-17T20:01:00.000Z");
      await expect(
        setOwnedPokemonSelectedAbility(client, {
          ownerPlayerId: owner,
          pokemonInstanceId: pokemon,
          expectedRowVersion: 0n,
          selectedAbilityId: abilityId,
          now: abilityAt,
        }),
      ).resolves.toEqual({ status: "updated", rowVersion: 1n });
      const loadoutAt = new Date("2026-09-17T20:02:00.000Z");
      await expect(
        replaceOwnedPokemonMoveLoadout(client, {
          ownerPlayerId: owner,
          pokemonInstanceId: pokemon,
          expectedRowVersion: 1n,
          moveIds,
          now: loadoutAt,
        }),
      ).resolves.toEqual({ status: "updated", rowVersion: 2n });

      const loaded = await loadOwnedPokemon(client, owner, pokemon);
      expect(loaded).toMatchObject({
        speciesId,
        selectedAbilityId: abilityId,
        rowVersion: 2n,
        updatedAt: loadoutAt,
        moveLoadout: { state: "selected", moveIds },
      });

      const staleAt = new Date("2026-09-17T20:03:00.000Z");
      await expect(
        replaceOwnedPokemonMoveLoadout(client, {
          ownerPlayerId: owner,
          pokemonInstanceId: pokemon,
          expectedRowVersion: 1n,
          moveIds: ["move:stale"],
          now: staleAt,
        }),
      ).resolves.toEqual({ status: "stale", rowVersion: 2n });
      await expect(loadOwnedPokemon(client, owner, pokemon)).resolves.toMatchObject({
        rowVersion: 2n,
        updatedAt: loadoutAt,
        moveLoadout: { state: "selected", moveIds },
      });
      await expect(
        replaceOwnedPokemonMoveLoadout(client, {
          ownerPlayerId: owner,
          pokemonInstanceId: pokemon,
          expectedRowVersion: 2n,
          moveIds: [],
          now: staleAt,
        }),
      ).rejects.toThrow(/1\.\.4/);

      const clearAt = new Date("2026-09-17T20:04:00.000Z");
      await expect(
        setOwnedPokemonSelectedAbility(client, {
          ownerPlayerId: owner,
          pokemonInstanceId: pokemon,
          expectedRowVersion: 2n,
          selectedAbilityId: null,
          now: clearAt,
        }),
      ).resolves.toEqual({ status: "updated", rowVersion: 3n });
      await expect(loadOwnedPokemon(client, owner, pokemon)).resolves.toMatchObject({
        selectedAbilityId: null,
        rowVersion: 3n,
        moveLoadout: { state: "selected", moveIds },
      });
    });
  });

  it("creates/lists/loads/replaces/deletes owned Teams with dense order, ownership and OCC", async () => {
    await prepareCanonicalSchema();
    await withClient(async (client) => {
      const owner = await createPlayer(client);
      const otherOwner = await createPlayer(client);
      const pokemonA = await insertOwnedPokemon(client, owner);
      const pokemonB = await insertOwnedPokemon(client, owner);
      const foreignPokemon = await insertOwnedPokemon(client, otherOwner);
      const createdAt = new Date("2026-09-17T20:00:00.000Z");
      const teamA = await createOwnedTeam(client, owner, createdAt);
      const teamB = await createOwnedTeam(client, owner, new Date(createdAt.getTime() + 1));
      expect(teamA.rowVersion).toBe(0n);
      expect(teamB.rowVersion).toBe(0n);
      expect(teamA.teamId.split("-")[2]?.startsWith("7")).toBe(true);
      await expect(listOwnedTeams(client, owner)).resolves.toHaveLength(2);
      await expect(loadOwnedTeam(client, otherOwner, teamA.teamId)).resolves.toBeNull();
      await expect(loadOwnedTeam(client, owner, teamA.teamId)).resolves.toMatchObject({
        pokemonInstanceIds: [],
        rowVersion: 0n,
      });

      const rosterAt = new Date("2026-09-17T20:01:00.000Z");
      await expect(
        replaceOwnedTeamRoster(client, {
          ownerPlayerId: owner,
          teamId: teamA.teamId,
          expectedRowVersion: 0n,
          pokemonInstanceIds: [pokemonB, pokemonA],
          now: rosterAt,
        }),
      ).resolves.toEqual({ status: "updated", rowVersion: 1n });
      await expect(loadOwnedTeam(client, owner, teamA.teamId)).resolves.toMatchObject({
        pokemonInstanceIds: [pokemonB, pokemonA],
        rowVersion: 1n,
        updatedAt: rosterAt,
      });

      await expect(
        replaceOwnedTeamRoster(client, {
          ownerPlayerId: owner,
          teamId: teamB.teamId,
          expectedRowVersion: 0n,
          pokemonInstanceIds: [pokemonA],
          now: rosterAt,
        }),
      ).resolves.toEqual({ status: "updated", rowVersion: 1n });
      await expect(loadOwnedTeam(client, owner, teamB.teamId)).resolves.toMatchObject({
        pokemonInstanceIds: [pokemonA],
      });

      const invalidAt = new Date("2026-09-17T20:02:00.000Z");
      await expect(
        replaceOwnedTeamRoster(client, {
          ownerPlayerId: owner,
          teamId: teamA.teamId,
          expectedRowVersion: 1n,
          pokemonInstanceIds: [foreignPokemon],
          now: invalidAt,
        }),
      ).resolves.toEqual({ status: "invalid_member", pokemonInstanceId: foreignPokemon });
      await expect(
        replaceOwnedTeamRoster(client, {
          ownerPlayerId: owner,
          teamId: teamA.teamId,
          expectedRowVersion: 0n,
          pokemonInstanceIds: [],
          now: invalidAt,
        }),
      ).resolves.toEqual({ status: "stale", rowVersion: 1n });
      await expect(loadOwnedTeam(client, owner, teamA.teamId)).resolves.toMatchObject({
        pokemonInstanceIds: [pokemonB, pokemonA],
        rowVersion: 1n,
        updatedAt: rosterAt,
      });

      await expect(
        deleteOwnedTeam(client, {
          ownerPlayerId: owner,
          teamId: teamA.teamId,
          expectedRowVersion: 0n,
        }),
      ).resolves.toEqual({ status: "stale", rowVersion: 1n });
      await expect(
        deleteOwnedTeam(client, {
          ownerPlayerId: owner,
          teamId: teamA.teamId,
          expectedRowVersion: 1n,
        }),
      ).resolves.toEqual({ status: "deleted" });
      await expect(loadOwnedTeam(client, owner, teamA.teamId)).resolves.toBeNull();
      await expect(
        deleteOwnedTeam(client, {
          ownerPlayerId: owner,
          teamId: teamA.teamId,
          expectedRowVersion: 1n,
        }),
      ).resolves.toEqual({ status: "not_found" });
      const pokemonCount = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.pokemon_instances WHERE owner_player_id = $1",
        [owner],
      );
      expect(pokemonCount.rows[0]?.count).toBe("2");
    });
  });

  it("serializes competing Team and Pokémon commands so exactly one same-version mutation wins", async () => {
    await prepareCanonicalSchema();
    const seeded = await withClient(async (client) => {
      const owner = await createPlayer(client);
      const pokemonA = await insertOwnedPokemon(client, owner);
      const pokemonB = await insertOwnedPokemon(client, owner);
      const pokemonC = await insertOwnedPokemon(client, owner);
      const rosterRaceTeam = await createOwnedTeam(client, owner, new Date("2026-09-17T20:00:00.000Z"));
      const deleteRaceTeam = await createOwnedTeam(client, owner, new Date("2026-09-17T20:00:00.001Z"));
      return { owner, pokemonA, pokemonB, pokemonC, rosterRaceTeam, deleteRaceTeam };
    });

    const rosterClientA = new Client({ connectionString: testDatabaseUrl });
    const rosterClientB = new Client({ connectionString: testDatabaseUrl });
    await Promise.all([rosterClientA.connect(), rosterClientB.connect()]);
    try {
      const raceAt = new Date("2026-09-17T20:01:00.000Z");
      const results = await Promise.all([
        replaceOwnedTeamRoster(rosterClientA, {
          ownerPlayerId: seeded.owner,
          teamId: seeded.rosterRaceTeam.teamId,
          expectedRowVersion: 0n,
          pokemonInstanceIds: [seeded.pokemonA, seeded.pokemonB],
          now: raceAt,
        }),
        replaceOwnedTeamRoster(rosterClientB, {
          ownerPlayerId: seeded.owner,
          teamId: seeded.rosterRaceTeam.teamId,
          expectedRowVersion: 0n,
          pokemonInstanceIds: [seeded.pokemonC],
          now: raceAt,
        }),
      ]);
      expect(results.filter(({ status }) => status === "updated")).toHaveLength(1);
      expect(results.filter(({ status }) => status === "stale")).toHaveLength(1);
      const persisted = await loadOwnedTeam(rosterClientA, seeded.owner, seeded.rosterRaceTeam.teamId);
      expect(persisted?.rowVersion).toBe(1n);
      expect([
        JSON.stringify([seeded.pokemonA, seeded.pokemonB]),
        JSON.stringify([seeded.pokemonC]),
      ]).toContain(JSON.stringify(persisted?.pokemonInstanceIds));

      const replaceDelete = await Promise.all([
        replaceOwnedTeamRoster(rosterClientA, {
          ownerPlayerId: seeded.owner,
          teamId: seeded.deleteRaceTeam.teamId,
          expectedRowVersion: 0n,
          pokemonInstanceIds: [seeded.pokemonA],
          now: new Date("2026-09-17T20:02:00.000Z"),
        }),
        deleteOwnedTeam(rosterClientB, {
          ownerPlayerId: seeded.owner,
          teamId: seeded.deleteRaceTeam.teamId,
          expectedRowVersion: 0n,
        }),
      ]);
      const accepted = replaceDelete.filter(({ status }) => status === "updated" || status === "deleted");
      expect(accepted).toHaveLength(1);
      const afterRace = await loadOwnedTeam(rosterClientA, seeded.owner, seeded.deleteRaceTeam.teamId);
      const orphanCount = await rosterClientA.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.pokemon_team_members WHERE team_id = $1",
        [seeded.deleteRaceTeam.teamId],
      );
      if (afterRace === null) {
        expect(orphanCount.rows[0]?.count).toBe("0");
      } else {
        expect(afterRace).toMatchObject({ rowVersion: 1n, pokemonInstanceIds: [seeded.pokemonA] });
        expect(orphanCount.rows[0]?.count).toBe("1");
      }

      const pokemonRace = await Promise.all([
        setOwnedPokemonSelectedAbility(rosterClientA, {
          ownerPlayerId: seeded.owner,
          pokemonInstanceId: seeded.pokemonC,
          expectedRowVersion: 0n,
          selectedAbilityId: "ability:race",
          now: new Date("2026-09-17T20:03:00.000Z"),
        }),
        replaceOwnedPokemonMoveLoadout(rosterClientB, {
          ownerPlayerId: seeded.owner,
          pokemonInstanceId: seeded.pokemonC,
          expectedRowVersion: 0n,
          moveIds: ["move:race"],
          now: new Date("2026-09-17T20:03:00.000Z"),
        }),
      ]);
      expect(pokemonRace.filter(({ status }) => status === "updated")).toHaveLength(1);
      expect(pokemonRace.filter(({ status }) => status === "stale")).toHaveLength(1);
      const pokemonAfterRace = await loadOwnedPokemon(rosterClientA, seeded.owner, seeded.pokemonC);
      expect(pokemonAfterRace?.rowVersion).toBe(1n);
      if (pokemonAfterRace?.selectedAbilityId === "ability:race") {
        expect(pokemonAfterRace.moveLoadout).toEqual({ state: "uninitialized", moveIds: [] });
      } else {
        expect(pokemonAfterRace?.selectedAbilityId).toBeNull();
        expect(pokemonAfterRace?.moveLoadout).toEqual({
          state: "selected",
          moveIds: ["move:race"],
        });
      }
    } finally {
      await Promise.all([rosterClientA.end(), rosterClientB.end()]);
    }
  });
});
