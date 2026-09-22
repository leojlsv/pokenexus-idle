import type { Client } from "pg";

export type PlayerDbClient = Pick<Client, "query">;

export interface PlayerRecord {
  readonly playerId: string;
  readonly accountId: string;
}

interface PlayerRow {
  readonly player_id: string;
  readonly account_id: string;
}

function mapPlayer(row: PlayerRow): PlayerRecord {
  return {
    playerId: row.player_id,
    accountId: row.account_id,
  };
}

export async function findPlayerByAccountId(
  client: PlayerDbClient,
  accountId: string,
): Promise<PlayerRecord | null> {
  const result = await client.query<PlayerRow>(
    `SELECT player_id, account_id
     FROM pokenexus.players
     WHERE account_id = $1`,
    [accountId],
  );
  return result.rows[0] ? mapPlayer(result.rows[0]) : null;
}

export async function createOrLoadPlayerByAccountId(
  client: PlayerDbClient,
  accountId: string,
  candidatePlayerId: string,
): Promise<PlayerRecord> {
  const inserted = await client.query<PlayerRow>(
    `WITH inserted_player AS (
       INSERT INTO pokenexus.players (player_id, account_id)
       VALUES ($1, $2)
       ON CONFLICT (account_id) DO NOTHING
       RETURNING player_id, account_id
     ), ensured_inventory AS (
       INSERT INTO pokenexus.player_inventories (player_id)
       SELECT player_id FROM inserted_player
       ON CONFLICT (player_id) DO NOTHING
     )
     SELECT player_id, account_id FROM inserted_player`,
    [candidatePlayerId, accountId],
  );
  if (inserted.rows[0]) {
    return mapPlayer(inserted.rows[0]);
  }

  const persisted = await findPlayerByAccountId(client, accountId);
  if (!persisted) {
    throw new Error("Player create-or-load conflict winner was not observable");
  }
  return persisted;
}
