import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createOrLoadPlayerByAccountId,
  findPlayerByAccountId,
} from "../src/player-repository";
import { generateUuidV7 } from "../src/uuid-v7";
import { runMigrations } from "../src/migrations";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL is required for Player PostgreSQL integration tests");
}
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(databaseName)) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL must target pokenexus_test or pokenexus_test_*");
}

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

async function createAccount(): Promise<string> {
  const accountId = generateUuidV7();
  await withClient((client) =>
    client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]).then(() => undefined),
  );
  return accountId;
}

async function waitForLockWait(processId: number): Promise<void> {
  await withClient(async (observer) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const activity = await observer.query<{ wait_event_type: string | null }>(
        "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1",
        [processId],
      );
      if (activity.rows[0]?.wait_event_type === "Lock") {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Concurrent Player insert did not enter a lock wait");
  });
}

beforeEach(prepareSchema);
afterAll(resetSchema);

describe("Player PostgreSQL repository", () => {
  it("creates once and returns the same persisted PlayerId on repeat", async () => {
    const accountId = await createAccount();
    const firstCandidate = generateUuidV7();
    const secondCandidate = generateUuidV7();

    const [first, second, stored] = await withClient(async (client) => {
      const created = await createOrLoadPlayerByAccountId(client, accountId, firstCandidate);
      const repeated = await createOrLoadPlayerByAccountId(client, accountId, secondCandidate);
      const loaded = await findPlayerByAccountId(client, accountId);
      return [created, repeated, loaded] as const;
    });

    expect(first.playerId).toBe(firstCandidate);
    expect(second.playerId).toBe(firstCandidate);
    expect(stored?.playerId).toBe(firstCandidate);
  });

  it("converges concurrent creates on one persisted PlayerId", async () => {
    const accountId = await createAccount();
    const candidates = Array.from({ length: 8 }, () => generateUuidV7());

    const results = await Promise.all(
      candidates.map((candidate) =>
        withClient((client) => createOrLoadPlayerByAccountId(client, accountId, candidate)),
      ),
    );

    const returnedIds = new Set(results.map(({ playerId }) => playerId));
    expect(returnedIds.size).toBe(1);
    expect(candidates).toContain(results[0]?.playerId);

    await withClient(async (client) => {
      const rows = await client.query<{ player_id: string }>(
        "SELECT player_id FROM pokenexus.players WHERE account_id = $1",
        [accountId],
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0]?.player_id).toBe(results[0]?.playerId);
    });
  });

  it("returns the committed conflict winner through a fresh second statement", async () => {
    const accountId = await createAccount();
    const winnerPlayerId = generateUuidV7();
    const loserCandidateId = generateUuidV7();
    const winner = new Client({ connectionString: testDatabaseUrl });
    const loser = new Client({ connectionString: testDatabaseUrl });
    await Promise.all([winner.connect(), loser.connect()]);

    let winnerCommitted = false;
    try {
      await winner.query("BEGIN");
      await winner.query(
        "INSERT INTO pokenexus.players (player_id, account_id) VALUES ($1, $2)",
        [winnerPlayerId, accountId],
      );

      const loserProcess = await loser.query<{ process_id: number }>(
        "SELECT pg_backend_pid() AS process_id",
      );
      const loserProcessId = loserProcess.rows[0]?.process_id;
      if (loserProcessId === undefined) {
        throw new Error("Could not resolve concurrent Player test backend process id");
      }

      const loserResult = createOrLoadPlayerByAccountId(loser, accountId, loserCandidateId);
      await waitForLockWait(loserProcessId);

      await winner.query("COMMIT");
      winnerCommitted = true;

      await expect(loserResult).resolves.toEqual({
        playerId: winnerPlayerId,
        accountId,
      });
    } finally {
      if (!winnerCommitted) {
        await winner.query("ROLLBACK").catch(() => undefined);
      }
      await Promise.all([winner.end(), loser.end()]);
    }
  });

  it("keeps distinct accounts distinct and preserves the account foreign key", async () => {
    const firstAccountId = await createAccount();
    const secondAccountId = await createAccount();

    const [first, second] = await Promise.all([
      withClient((client) =>
        createOrLoadPlayerByAccountId(client, firstAccountId, generateUuidV7()),
      ),
      withClient((client) =>
        createOrLoadPlayerByAccountId(client, secondAccountId, generateUuidV7()),
      ),
    ]);
    expect(first.playerId).not.toBe(second.playerId);

    const missingAccountError = await withClient((client) =>
      createOrLoadPlayerByAccountId(client, generateUuidV7(), generateUuidV7()).then(
        () => null,
        (error: unknown) => error,
      ),
    );
    expect(missingAccountError).toMatchObject({ code: "23503" });
  });
});
