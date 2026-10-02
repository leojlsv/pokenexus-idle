import type { Client } from "pg";
import { generateUuidV7 } from "./uuid-v7.js";

export type PokeCenterDbClient = Pick<Client, "query">;

export interface PokeCenterHealCommandRecord {
  readonly commandId: string;
  readonly playerId: string;
  readonly idempotencyKey: string;
  readonly teamId: string;
  readonly status: "pending" | "terminal";
  readonly resultHttpStatus: number | null;
  readonly resultJson: unknown;
  readonly acceptedAt: Date;
  readonly terminalAt: Date | null;
}

interface PokeCenterHealCommandRow {
  readonly command_id: string;
  readonly player_id: string;
  readonly idempotency_key: string;
  readonly team_id: string;
  readonly command_status: "pending" | "terminal";
  readonly result_http_status: number | null;
  readonly result_json: unknown;
  readonly accepted_at: Date;
  readonly terminal_at: Date | null;
}

function mapCommand(row: PokeCenterHealCommandRow): PokeCenterHealCommandRecord {
  return {
    commandId: row.command_id,
    playerId: row.player_id,
    idempotencyKey: row.idempotency_key,
    teamId: row.team_id,
    status: row.command_status,
    resultHttpStatus: row.result_http_status,
    resultJson: row.result_json,
    acceptedAt: row.accepted_at,
    terminalAt: row.terminal_at,
  };
}

export async function loadPokeCenterHealCommand(
  client: PokeCenterDbClient,
  playerId: string,
  idempotencyKey: string,
  lock = false,
): Promise<PokeCenterHealCommandRecord | null> {
  const sql =
    "SELECT command_id, player_id, idempotency_key::text, team_id, " +
    "command_status, result_http_status, result_json, accepted_at, terminal_at " +
    "FROM pokenexus.pokecenter_heal_commands " +
    "WHERE player_id = $1 AND idempotency_key = $2::uuid" +
    (lock ? " FOR UPDATE" : "");
  const result = await client.query<PokeCenterHealCommandRow>(
    sql,
    [playerId, idempotencyKey],
  );
  return result.rows[0] ? mapCommand(result.rows[0]) : null;
}

export type PokeCenterHealCommandClaimResult =
  | { readonly status: "claimed"; readonly command: PokeCenterHealCommandRecord }
  | { readonly status: "existing"; readonly command: PokeCenterHealCommandRecord }
  | { readonly status: "conflict"; readonly command: PokeCenterHealCommandRecord };

export async function claimPokeCenterHealCommandInTransaction(
  client: PokeCenterDbClient,
  input: {
    readonly playerId: string;
    readonly idempotencyKey: string;
    readonly teamId: string;
    readonly now: Date;
  },
): Promise<PokeCenterHealCommandClaimResult> {
  const existing = await loadPokeCenterHealCommand(
    client,
    input.playerId,
    input.idempotencyKey,
    true,
  );
  if (existing) {
    return existing.teamId === input.teamId
      ? { status: "existing", command: existing }
      : { status: "conflict", command: existing };
  }

  const commandId = generateUuidV7();
  const inserted = await client.query<PokeCenterHealCommandRow>(
    `INSERT INTO pokenexus.pokecenter_heal_commands (
       command_id, player_id, idempotency_key, team_id, command_status, accepted_at
     ) VALUES ($1, $2, $3::uuid, $4, 'pending', $5)
     RETURNING command_id, player_id, idempotency_key::text, team_id,
               command_status, result_http_status, result_json, accepted_at, terminal_at`,
    [commandId, input.playerId, input.idempotencyKey, input.teamId, input.now],
  );
  const row = inserted.rows[0];
  if (!row) throw new Error("PokéCenter command insert returned no row");
  return { status: "claimed", command: mapCommand(row) };
}

export async function completePokeCenterHealCommandInTransaction(
  client: PokeCenterDbClient,
  input: {
    readonly commandId: string;
    readonly httpStatus: number;
    readonly resultJson: unknown;
    readonly now: Date;
  },
): Promise<PokeCenterHealCommandRecord> {
  if (!Number.isInteger(input.httpStatus) || input.httpStatus < 100 || input.httpStatus > 599) {
    throw new RangeError("PokéCenter result status must be an HTTP status");
  }
  const updated = await client.query<PokeCenterHealCommandRow>(
    `UPDATE pokenexus.pokecenter_heal_commands
        SET command_status = 'terminal',
            result_http_status = $2,
            result_json = $3::jsonb,
            terminal_at = $4
      WHERE command_id = $1 AND command_status = 'pending'
      RETURNING command_id, player_id, idempotency_key::text, team_id,
                command_status, result_http_status, result_json, accepted_at, terminal_at`,
    [input.commandId, input.httpStatus, JSON.stringify(input.resultJson), input.now],
  );
  const row = updated.rows[0];
  if (!row) throw new Error("PokéCenter command completion lost pending command");
  return mapCommand(row);
}
