import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPokemonVitalityInTransaction,
  generateUuidV7,
  loadPokemonVitality,
  lockPokemonVitalitiesInCanonicalOrder,
  reconcilePokemonVitalityMaxHpInTransaction,
  setPokemonVitalityCurrentHpInTransaction,
  withTransaction,
} from "../src/index";
import { runMigrations } from "../src/migrations";
import { encodeOpaqueStringDbV1 } from "../src/opaque-string-db-codec";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL is required for TASK-108 PostgreSQL integration tests");
}
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(databaseName)) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL must target pokenexus_test or pokenexus_test_*");
}

const opaque = (value: string) => Buffer.from(encodeOpaqueStringDbV1(value));

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

async function prepareSchema(): Promise<void> {
  await resetSchema();
  await runMigrations({ connectionString: testDatabaseUrl });
}

async function createPlayerAndPokemon(client: Client): Promise<{
  readonly playerId: string;
  readonly pokemonInstanceId: string;
}> {
  const accountId = generateUuidV7();
  const playerId = generateUuidV7();
  const pokemonInstanceId = generateUuidV7();
  await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
  await client.query(
    "INSERT INTO pokenexus.players (player_id, account_id) VALUES ($1, $2)",
    [playerId, accountId],
  );
  await client.query(
    "INSERT INTO pokenexus.pokemon_instances (" +
      "pokemon_instance_id, owner_player_id, species_id, level, total_experience," +
      "iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe," +
      "genetic_score, genetic_profile_a, genetic_profile_b, birth_profile, expressed_profile, shiny," +
      "individualization_rules_version, derivation_authority_version, derivation_authority_key_id," +
      "origin_pending_selection_identity, individualization_snapshot_identity," +
      "individualization_snapshot_commitment, individualization_content_version," +
      "individualization_content_hash, individualization_game_data_version" +
      ") VALUES (" +
      "$1,$2,$3,10,999,1,2,3,4,5,6," +
      "20,'Harmony','Might','Harmony','Harmony',false," +
      "$4,$5,$6,$7,$8,$9,$10,$11,$12" +
      ")",
    [
      pokemonInstanceId,
      playerId,
      opaque("species:vitality"),
      opaque("encounter-individualization-v1"),
      opaque("authority-v1"),
      opaque("key-v1:test"),
      opaque("pending:" + pokemonInstanceId),
      opaque("indv1:" + pokemonInstanceId),
      opaque("sha256:" + pokemonInstanceId),
      opaque("content:test"),
      opaque("sha256:content-test"),
      opaque("game-data:test"),
    ],
  );
  return { playerId, pokemonInstanceId };
}

beforeEach(prepareSchema);
afterAll(resetSchema);

describe("TASK-108 Pokémon vitality persistence", () => {
  it("creates one full-HP row atomically with ownership and is idempotent without version churn", async () => {
    await withClient(async (client) => {
      const { playerId, pokemonInstanceId } = await createPlayerAndPokemon(client);
      const now = new Date("2026-10-02T12:00:00.000Z");

      const first = await withTransaction(client, (transaction) =>
        createPokemonVitalityInTransaction(transaction, {
          ownerPlayerId: playerId,
          pokemonInstanceId,
          currentHp: 73,
          now,
        }));
      expect(first).toMatchObject({ status: "created", vitality: { currentHp: 73, rowVersion: 0n } });

      const replay = await withTransaction(client, (transaction) =>
        createPokemonVitalityInTransaction(transaction, {
          ownerPlayerId: playerId,
          pokemonInstanceId,
          currentHp: 99,
          now: new Date("2026-10-02T12:01:00.000Z"),
        }));
      expect(replay).toMatchObject({ status: "existing", vitality: { currentHp: 73, rowVersion: 0n } });

      const unowned = await withTransaction(client, (transaction) =>
        createPokemonVitalityInTransaction(transaction, {
          ownerPlayerId: generateUuidV7(),
          pokemonInstanceId,
          currentHp: 73,
          now,
        }));
      expect(unowned.status).toBe("not_found");
    });
  });

  it("clamps only on max-HP decrease, never heals on increase, and zero stays zero", async () => {
    await withClient(async (client) => {
      const { playerId, pokemonInstanceId } = await createPlayerAndPokemon(client);
      await createPokemonVitalityInTransaction(client, {
        ownerPlayerId: playerId,
        pokemonInstanceId,
        currentHp: 73,
        now: new Date("2026-10-02T12:00:00.000Z"),
      });

      const clamped = await withTransaction(client, (transaction) =>
        reconcilePokemonVitalityMaxHpInTransaction(transaction, {
          ownerPlayerId: playerId,
          pokemonInstanceId,
          maxHp: 50,
          now: new Date("2026-10-02T12:01:00.000Z"),
        }));
      expect(clamped).toMatchObject({ status: "updated", vitality: { currentHp: 50, rowVersion: 1n } });

      const increased = await withTransaction(client, (transaction) =>
        reconcilePokemonVitalityMaxHpInTransaction(transaction, {
          ownerPlayerId: playerId,
          pokemonInstanceId,
          maxHp: 90,
          now: new Date("2026-10-02T12:02:00.000Z"),
        }));
      expect(increased).toMatchObject({ status: "unchanged", vitality: { currentHp: 50, rowVersion: 1n } });

      const ko = await withTransaction(client, (transaction) =>
        setPokemonVitalityCurrentHpInTransaction(transaction, {
          ownerPlayerId: playerId,
          pokemonInstanceId,
          expectedRowVersion: 1n,
          currentHp: 0,
          now: new Date("2026-10-02T12:03:00.000Z"),
        }));
      expect(ko).toMatchObject({ status: "updated", vitality: { currentHp: 0, rowVersion: 2n } });

      const afterIncrease = await withTransaction(client, (transaction) =>
        reconcilePokemonVitalityMaxHpInTransaction(transaction, {
          ownerPlayerId: playerId,
          pokemonInstanceId,
          maxHp: 120,
          now: new Date("2026-10-02T12:04:00.000Z"),
        }));
      expect(afterIncrease).toMatchObject({ status: "unchanged", vitality: { currentHp: 0, rowVersion: 2n } });
    });
  });

  it("locks vitality rows in canonical identity order and rejects stale OCC writes", async () => {
    await withClient(async (client) => {
      const { playerId, pokemonInstanceId: firstId } = await createPlayerAndPokemon(client);
      const secondId = generateUuidV7();
      await client.query(
        "INSERT INTO pokenexus.pokemon_instances (" +
          "pokemon_instance_id, owner_player_id, species_id, level, total_experience," +
          "iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe," +
          "genetic_score, genetic_profile_a, genetic_profile_b, birth_profile, expressed_profile, shiny," +
          "individualization_rules_version, derivation_authority_version, derivation_authority_key_id," +
          "origin_pending_selection_identity, individualization_snapshot_identity," +
          "individualization_snapshot_commitment, individualization_content_version," +
          "individualization_content_hash, individualization_game_data_version" +
          ") SELECT $1, owner_player_id, species_id, level, total_experience," +
          "iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe," +
          "genetic_score, genetic_profile_a, genetic_profile_b, birth_profile, expressed_profile, shiny," +
          "individualization_rules_version, derivation_authority_version, derivation_authority_key_id," +
          "$2,$3,$4,individualization_content_version,individualization_content_hash," +
          "individualization_game_data_version FROM pokenexus.pokemon_instances WHERE pokemon_instance_id = $5",
        [
          secondId,
          opaque("pending:" + secondId),
          opaque("indv1:" + secondId),
          opaque("sha256:" + secondId),
          firstId,
        ],
      );
      await createPokemonVitalityInTransaction(client, {
        ownerPlayerId: playerId,
        pokemonInstanceId: firstId,
        currentHp: 40,
        now: new Date(),
      });
      await createPokemonVitalityInTransaction(client, {
        ownerPlayerId: playerId,
        pokemonInstanceId: secondId,
        currentHp: 30,
        now: new Date(),
      });

      const locked = await withTransaction(client, (transaction) =>
        lockPokemonVitalitiesInCanonicalOrder(transaction, playerId, [secondId, firstId]));
      expect(locked.map(({ pokemonInstanceId }) => pokemonInstanceId))
        .toEqual([firstId, secondId].sort());

      const updated = await setPokemonVitalityCurrentHpInTransaction(client, {
        ownerPlayerId: playerId,
        pokemonInstanceId: firstId,
        expectedRowVersion: 0n,
        currentHp: 20,
        now: new Date(),
      });
      expect(updated.status).toBe("updated");
      const stale = await setPokemonVitalityCurrentHpInTransaction(client, {
        ownerPlayerId: playerId,
        pokemonInstanceId: firstId,
        expectedRowVersion: 0n,
        currentHp: 10,
        now: new Date(),
      });
      expect(stale).toMatchObject({ status: "stale", vitality: { currentHp: 20, rowVersion: 1n } });
      expect((await loadPokemonVitality(client, playerId, firstId))?.currentHp).toBe(20);
    });
  });
});
