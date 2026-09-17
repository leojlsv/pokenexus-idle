import { describe, expect, it, vi } from "vitest";
import {
  createOrLoadPlayerByAccountId,
  findPlayerByAccountId,
  type PlayerDbClient,
} from "./player-repository";

const accountId = "0199472a-0000-7000-8000-000000000001";
const candidatePlayerId = "0199472a-0000-7000-8000-000000000002";
const persistedPlayerId = "0199472a-0000-7000-8000-000000000003";

function clientWithRows(rowsByCall: readonly unknown[][]): {
  readonly client: PlayerDbClient;
  readonly query: ReturnType<typeof vi.fn>;
} {
  let call = 0;
  const query = vi.fn(async () => ({ rows: rowsByCall[call++] ?? [], rowCount: 0 }));
  return { client: { query } as unknown as PlayerDbClient, query };
}

describe("player repository", () => {
  it("loads the authoritative player by account id", async () => {
    const { client } = clientWithRows([[{ player_id: persistedPlayerId, account_id: accountId }]]);

    await expect(findPlayerByAccountId(client, accountId)).resolves.toEqual({
      playerId: persistedPlayerId,
      accountId,
    });
  });

  it("returns the inserted player when this request wins creation", async () => {
    const { client, query } = clientWithRows([
      [{ player_id: candidatePlayerId, account_id: accountId }],
    ]);

    await expect(
      createOrLoadPlayerByAccountId(client, accountId, candidatePlayerId),
    ).resolves.toEqual({ playerId: candidatePlayerId, accountId });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("uses a fresh select and returns the persisted winner after an account-id conflict", async () => {
    const { client, query } = clientWithRows([
      [],
      [{ player_id: persistedPlayerId, account_id: accountId }],
    ]);

    await expect(
      createOrLoadPlayerByAccountId(client, accountId, candidatePlayerId),
    ).resolves.toEqual({ playerId: persistedPlayerId, accountId });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("ON CONFLICT (account_id) DO NOTHING");
    expect(query.mock.calls[1]?.[0]).toContain("FROM pokenexus.players");
  });

  it("fails closed if a conflict winner cannot be observed by the fresh select", async () => {
    const { client } = clientWithRows([[], []]);

    await expect(
      createOrLoadPlayerByAccountId(client, accountId, candidatePlayerId),
    ).rejects.toThrow("Player create-or-load conflict winner was not observable");
  });
});
