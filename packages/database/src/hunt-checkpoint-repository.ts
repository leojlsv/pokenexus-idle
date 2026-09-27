import type { Client } from "pg";
import { decodeOpaqueStringDbV1, encodeOpaqueStringDbV1 } from "./opaque-string-db-codec.js";
import { withTransaction } from "./transaction.js";
import { generateUuidV7 } from "./uuid-v7.js";

export type HuntCheckpointDbClient = Pick<Client, "query">;

export interface HuntCheckpointRecord {
  readonly checkpointId: string;
  readonly subjectPlayerId: string;
  readonly huntRunIdentity: string;
  readonly schemaVersion: string;
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
  readonly logicalTimeMs: number;
  readonly logicalTimeAnchorAt: Date;
  readonly stateBytes: Uint8Array;
  readonly rowVersion: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface HuntCheckpointAdvanceCommandRecord {
  readonly commandId: string;
  readonly subjectPlayerId: string;
  readonly checkpointId: string;
  readonly commandCorrelation: string;
  readonly targetLogicalTimeMs: number;
  readonly targetWallClockAt: Date;
  readonly baseCheckpointRowVersion: bigint;
  readonly schemaVersion: string;
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
  readonly status: "pending" | "advanced" | "superseded";
  readonly resultCheckpointRowVersion?: bigint;
  readonly resultLogicalTimeMs?: number;
  readonly resultStateBytes?: Uint8Array;
  readonly acceptedAt: Date;
  readonly completedAt?: Date;
}

export interface HuntCheckpointCreateInput {
  readonly subjectPlayerId: string;
  readonly huntRunIdentity: string;
  readonly schemaVersion: string;
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
  readonly logicalTimeMs: number;
  readonly logicalTimeAnchorAt: Date;
  readonly stateBytes: Uint8Array;
  readonly now: Date;
}

export interface HuntCheckpointAdvanceFreezeInput {
  readonly subjectPlayerId: string;
  readonly checkpointId: string;
  readonly commandCorrelation: string;
  readonly targetLogicalTimeMs: number;
  readonly expectedCheckpointRowVersion: bigint;
  readonly now: Date;
}

export interface HuntCheckpointAdvanceCommitInput {
  readonly subjectPlayerId: string;
  readonly checkpointId: string;
  readonly commandCorrelation: string;
  readonly targetLogicalTimeMs: number;
  readonly expectedCheckpointRowVersion: bigint;
  readonly logicalTimeMs: number;
  readonly stateBytes: Uint8Array;
  readonly now: Date;
}

export type HuntCheckpointAdvanceProgressInput = HuntCheckpointAdvanceCommitInput;

export type HuntCheckpointAdvanceFreezeResult =
  | {
      readonly status: "accepted";
      readonly replayed: boolean;
      readonly command: HuntCheckpointAdvanceCommandRecord;
    }
  | { readonly status: "not_found" }
  | { readonly status: "stale"; readonly checkpoint: HuntCheckpointRecord }
  | { readonly status: "conflict" };

export type HuntCheckpointAdvanceCommitResult =
  | {
      readonly status: "accepted";
      readonly replayed: boolean;
      readonly command: HuntCheckpointAdvanceCommandRecord;
    }
  | { readonly status: "not_found" }
  | { readonly status: "stale"; readonly checkpoint: HuntCheckpointRecord }
  | {
      readonly status: "superseded";
      readonly replayed: boolean;
      readonly command: HuntCheckpointAdvanceCommandRecord;
    }
  | { readonly status: "conflict" };

export type HuntCheckpointAdvanceProgressResult =
  | { readonly status: "progressed"; readonly checkpoint: HuntCheckpointRecord }
  | {
      readonly status: "accepted";
      readonly replayed: true;
      readonly command: HuntCheckpointAdvanceCommandRecord;
    }
  | {
      readonly status: "superseded";
      readonly replayed: boolean;
      readonly command: HuntCheckpointAdvanceCommandRecord;
    }
  | { readonly status: "not_found" }
  | { readonly status: "stale"; readonly checkpoint: HuntCheckpointRecord }
  | { readonly status: "conflict" };

interface HuntCheckpointRow {
  readonly checkpoint_id: string;
  readonly player_id: string;
  readonly hunt_run_identity: Buffer;
  readonly checkpoint_schema_version: Buffer;
  readonly game_data_version: Buffer;
  readonly rules_version: Buffer;
  readonly logical_time_ms: string;
  readonly logical_time_anchor_at: Date;
  readonly checkpoint_state_bytes: Buffer;
  readonly row_version: string;
  readonly created_at: Date;
  readonly updated_at: Date;
}

interface HuntCheckpointAdvanceCommandRow {
  readonly command_id: string;
  readonly subject_player_id: string;
  readonly checkpoint_id: string;
  readonly command_correlation: Buffer;
  readonly target_logical_time_ms: string;
  readonly target_wall_clock_at: Date;
  readonly base_checkpoint_row_version: string;
  readonly checkpoint_schema_version: Buffer;
  readonly game_data_version: Buffer;
  readonly rules_version: Buffer;
  readonly command_status: "pending" | "advanced" | "superseded";
  readonly result_checkpoint_row_version: string | null;
  readonly result_logical_time_ms: string | null;
  readonly result_state_bytes: Buffer | null;
  readonly accepted_at: Date;
  readonly completed_at: Date | null;
}

function encode(value: string, label: string): Buffer {
  if (value.length === 0) throw new Error(`${label} must be non-empty`);
  return Buffer.from(encodeOpaqueStringDbV1(value));
}

function decode(value: Buffer): string {
  return decodeOpaqueStringDbV1(value);
}

function assertLogicalTime(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
}

function assertBytes(value: Uint8Array, label: string): void {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) throw new Error(`${label} must be non-empty bytes`);
}

function assertDate(value: Date, label: string): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error(`${label} must be a valid Date`);
}

function shiftWallClock(anchor: Date, deltaMs: number, label: string): Date {
  assertDate(anchor, label);
  if (!Number.isSafeInteger(deltaMs)) throw new Error(`${label} delta must be a safe integer`);
  const resultMs = anchor.getTime() + deltaMs;
  if (!Number.isSafeInteger(resultMs)) throw new Error(`${label} exceeds safe wall-clock bounds`);
  const result = new Date(resultMs);
  assertDate(result, label);
  return result;
}

function checkpointFromRow(row: HuntCheckpointRow): HuntCheckpointRecord {
  return {
    checkpointId: row.checkpoint_id,
    subjectPlayerId: row.player_id,
    huntRunIdentity: decode(row.hunt_run_identity),
    schemaVersion: decode(row.checkpoint_schema_version),
    gameDataVersion: decode(row.game_data_version),
    rulesVersion: decode(row.rules_version),
    logicalTimeMs: Number(row.logical_time_ms),
    logicalTimeAnchorAt: row.logical_time_anchor_at,
    stateBytes: new Uint8Array(row.checkpoint_state_bytes),
    rowVersion: BigInt(row.row_version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function commandFromRow(row: HuntCheckpointAdvanceCommandRow): HuntCheckpointAdvanceCommandRecord {
  return {
    commandId: row.command_id,
    subjectPlayerId: row.subject_player_id,
    checkpointId: row.checkpoint_id,
    commandCorrelation: decode(row.command_correlation),
    targetLogicalTimeMs: Number(row.target_logical_time_ms),
    targetWallClockAt: row.target_wall_clock_at,
    baseCheckpointRowVersion: BigInt(row.base_checkpoint_row_version),
    schemaVersion: decode(row.checkpoint_schema_version),
    gameDataVersion: decode(row.game_data_version),
    rulesVersion: decode(row.rules_version),
    status: row.command_status,
    ...(row.result_checkpoint_row_version === null
      ? {}
      : { resultCheckpointRowVersion: BigInt(row.result_checkpoint_row_version) }),
    ...(row.result_logical_time_ms === null ? {} : { resultLogicalTimeMs: Number(row.result_logical_time_ms) }),
    ...(row.result_state_bytes === null ? {} : { resultStateBytes: new Uint8Array(row.result_state_bytes) }),
    acceptedAt: row.accepted_at,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
  };
}

export async function loadHuntCheckpoint(
  client: HuntCheckpointDbClient,
  subjectPlayerId: string,
  checkpointId: string,
  forUpdate = false,
): Promise<HuntCheckpointRecord | null> {
  const result = await client.query<HuntCheckpointRow>(
    `SELECT checkpoint_id, player_id, hunt_run_identity, checkpoint_schema_version,
            game_data_version, rules_version, logical_time_ms::text, logical_time_anchor_at,
            checkpoint_state_bytes,
            row_version::text, created_at, updated_at
       FROM pokenexus.hunt_checkpoints
      WHERE player_id = $1 AND checkpoint_id = $2${forUpdate ? " FOR UPDATE" : ""}`,
    [subjectPlayerId, checkpointId],
  );
  return result.rows[0] ? checkpointFromRow(result.rows[0]) : null;
}

export async function loadHuntCheckpointByHuntRunIdentity(
  client: HuntCheckpointDbClient,
  subjectPlayerId: string,
  huntRunIdentity: string,
): Promise<HuntCheckpointRecord | null> {
  const result = await client.query<HuntCheckpointRow>(
    `SELECT checkpoint_id, player_id, hunt_run_identity, checkpoint_schema_version,
            game_data_version, rules_version, logical_time_ms::text, logical_time_anchor_at,
            checkpoint_state_bytes,
            row_version::text, created_at, updated_at
       FROM pokenexus.hunt_checkpoints
      WHERE player_id = $1 AND hunt_run_identity = $2`,
    [subjectPlayerId, encode(huntRunIdentity, "huntRunIdentity")],
  );
  return result.rows[0] ? checkpointFromRow(result.rows[0]) : null;
}

export async function createHuntCheckpoint(
  client: HuntCheckpointDbClient,
  input: HuntCheckpointCreateInput,
): Promise<HuntCheckpointRecord> {
  assertLogicalTime(input.logicalTimeMs, "logicalTimeMs");
  assertDate(input.logicalTimeAnchorAt, "logicalTimeAnchorAt");
  assertDate(input.now, "now");
  assertBytes(input.stateBytes, "stateBytes");
  const checkpointId = generateUuidV7();
  const result = await client.query<HuntCheckpointRow>(
    `INSERT INTO pokenexus.hunt_checkpoints (
       checkpoint_id, player_id, hunt_run_identity, checkpoint_schema_version,
       game_data_version, rules_version, logical_time_ms, logical_time_anchor_at,
       checkpoint_state_bytes, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
     RETURNING checkpoint_id, player_id, hunt_run_identity, checkpoint_schema_version,
               game_data_version, rules_version, logical_time_ms::text, logical_time_anchor_at,
               checkpoint_state_bytes,
               row_version::text, created_at, updated_at`,
    [
      checkpointId,
      input.subjectPlayerId,
      encode(input.huntRunIdentity, "huntRunIdentity"),
      encode(input.schemaVersion, "schemaVersion"),
      encode(input.gameDataVersion, "gameDataVersion"),
      encode(input.rulesVersion, "rulesVersion"),
      input.logicalTimeMs,
      input.logicalTimeAnchorAt,
      Buffer.from(input.stateBytes),
      input.now,
    ],
  );
  if (!result.rows[0]) throw new Error("Hunt checkpoint insert returned no row");
  return checkpointFromRow(result.rows[0]);
}

export async function loadHuntCheckpointAdvanceCommandByCorrelation(
  client: HuntCheckpointDbClient,
  subjectPlayerId: string,
  commandCorrelation: string,
): Promise<HuntCheckpointAdvanceCommandRecord | null> {
  const result = await client.query<HuntCheckpointAdvanceCommandRow>(
    `SELECT command_id, subject_player_id, checkpoint_id, command_correlation,
            target_logical_time_ms::text, target_wall_clock_at, base_checkpoint_row_version::text,
            checkpoint_schema_version, game_data_version, rules_version,
            command_status, result_checkpoint_row_version::text, result_logical_time_ms::text,
            result_state_bytes, accepted_at, completed_at
       FROM pokenexus.hunt_checkpoint_advance_commands
      WHERE subject_player_id = $1 AND command_correlation = $2`,
    [subjectPlayerId, encode(commandCorrelation, "commandCorrelation")],
  );
  return result.rows[0] ? commandFromRow(result.rows[0]) : null;
}

function commandMatches(
  existing: HuntCheckpointAdvanceCommandRecord,
  input: Pick<
    HuntCheckpointAdvanceFreezeInput,
    "subjectPlayerId" | "checkpointId" | "commandCorrelation" | "targetLogicalTimeMs"
  >,
): boolean {
  return existing.subjectPlayerId === input.subjectPlayerId
    && existing.checkpointId === input.checkpointId
    && existing.commandCorrelation === input.commandCorrelation
    && existing.targetLogicalTimeMs === input.targetLogicalTimeMs;
}

async function lockAdvanceCorrelation(
  client: HuntCheckpointDbClient,
  subjectPlayerId: string,
  commandCorrelation: string,
): Promise<void> {
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended(encode($1::bytea, 'hex') || ':' || encode($2::bytea, 'hex'), 0)
     )`,
    [
      encode(subjectPlayerId, "subjectPlayerId"),
      encode(commandCorrelation, "commandCorrelation"),
    ],
  );
}

async function insertFrozenAdvanceCommand(
  client: HuntCheckpointDbClient,
  input: HuntCheckpointAdvanceFreezeInput,
  checkpoint: HuntCheckpointRecord,
): Promise<HuntCheckpointAdvanceCommandRecord> {
  const commandId = generateUuidV7();
  const superseded = checkpoint.logicalTimeMs > input.targetLogicalTimeMs;
  const targetWallClockAt = shiftWallClock(
    checkpoint.logicalTimeAnchorAt,
    input.targetLogicalTimeMs - checkpoint.logicalTimeMs,
    "targetWallClockAt",
  );
  const result = await client.query<HuntCheckpointAdvanceCommandRow>(
    `INSERT INTO pokenexus.hunt_checkpoint_advance_commands (
       command_id, subject_player_id, checkpoint_id, command_correlation,
       target_logical_time_ms, target_wall_clock_at, base_checkpoint_row_version,
       checkpoint_schema_version, game_data_version, rules_version,
       command_status, result_checkpoint_row_version, result_logical_time_ms,
       result_state_bytes, accepted_at, completed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,$14,$15)
     RETURNING command_id, subject_player_id, checkpoint_id, command_correlation,
               target_logical_time_ms::text, target_wall_clock_at, base_checkpoint_row_version::text,
               checkpoint_schema_version, game_data_version, rules_version,
               command_status, result_checkpoint_row_version::text, result_logical_time_ms::text,
               result_state_bytes, accepted_at, completed_at`,
    [
      commandId,
      input.subjectPlayerId,
      input.checkpointId,
      encode(input.commandCorrelation, "commandCorrelation"),
      input.targetLogicalTimeMs,
      targetWallClockAt,
      checkpoint.rowVersion.toString(),
      encode(checkpoint.schemaVersion, "schemaVersion"),
      encode(checkpoint.gameDataVersion, "gameDataVersion"),
      encode(checkpoint.rulesVersion, "rulesVersion"),
      superseded ? "superseded" : "pending",
      superseded ? checkpoint.rowVersion.toString() : null,
      superseded ? checkpoint.logicalTimeMs : null,
      input.now,
      superseded ? input.now : null,
    ],
  );
  if (!result.rows[0]) throw new Error("Hunt checkpoint command insert returned no row");
  return commandFromRow(result.rows[0]);
}

async function completeAdvanceCommand(
  client: HuntCheckpointDbClient,
  commandId: string,
  status: "advanced" | "superseded",
  checkpointRowVersion: bigint,
  logicalTimeMs: number,
  stateBytes: Uint8Array | undefined,
  completedAt: Date,
): Promise<HuntCheckpointAdvanceCommandRecord> {
  const result = await client.query<HuntCheckpointAdvanceCommandRow>(
    `UPDATE pokenexus.hunt_checkpoint_advance_commands
        SET command_status = $2,
            result_checkpoint_row_version = $3::bigint,
            result_logical_time_ms = $4,
            result_state_bytes = $5,
            completed_at = $6
      WHERE command_id = $1 AND command_status = 'pending'
      RETURNING command_id, subject_player_id, checkpoint_id, command_correlation,
                target_logical_time_ms::text, target_wall_clock_at, base_checkpoint_row_version::text,
                checkpoint_schema_version, game_data_version, rules_version,
                command_status, result_checkpoint_row_version::text, result_logical_time_ms::text,
                result_state_bytes, accepted_at, completed_at`,
    [
      commandId,
      status,
      checkpointRowVersion.toString(),
      logicalTimeMs,
      stateBytes ? Buffer.from(stateBytes) : null,
      completedAt,
    ],
  );
  if (!result.rows[0]) throw new Error("Pending Hunt checkpoint command could not be completed");
  return commandFromRow(result.rows[0]);
}

export async function freezeHuntCheckpointAdvanceInTransaction(
  client: HuntCheckpointDbClient,
  input: HuntCheckpointAdvanceFreezeInput,
): Promise<HuntCheckpointAdvanceFreezeResult> {
  assertLogicalTime(input.targetLogicalTimeMs, "targetLogicalTimeMs");
  await lockAdvanceCorrelation(client, input.subjectPlayerId, input.commandCorrelation);

  const existing = await loadHuntCheckpointAdvanceCommandByCorrelation(
    client,
    input.subjectPlayerId,
    input.commandCorrelation,
  );
  if (existing !== null) {
    return commandMatches(existing, input)
      ? { status: "accepted", replayed: true, command: existing }
      : { status: "conflict" };
  }

  const checkpoint = await loadHuntCheckpoint(client, input.subjectPlayerId, input.checkpointId, true);
  if (checkpoint === null) return { status: "not_found" };
  if (checkpoint.rowVersion !== input.expectedCheckpointRowVersion) {
    return { status: "stale", checkpoint };
  }
  const command = await insertFrozenAdvanceCommand(client, input, checkpoint);
  return { status: "accepted", replayed: false, command };
}

export async function freezeHuntCheckpointAdvance(
  client: HuntCheckpointDbClient,
  input: HuntCheckpointAdvanceFreezeInput,
): Promise<HuntCheckpointAdvanceFreezeResult> {
  return withTransaction(client, (transaction) => freezeHuntCheckpointAdvanceInTransaction(transaction, input));
}

export async function persistHuntCheckpointAdvanceProgressInTransaction(
  client: HuntCheckpointDbClient,
  input: HuntCheckpointAdvanceProgressInput,
): Promise<HuntCheckpointAdvanceProgressResult> {
  assertLogicalTime(input.targetLogicalTimeMs, "targetLogicalTimeMs");
  assertLogicalTime(input.logicalTimeMs, "logicalTimeMs");
  if (input.logicalTimeMs >= input.targetLogicalTimeMs) {
    throw new Error("Progress logicalTimeMs must remain before the frozen targetLogicalTimeMs");
  }
  assertBytes(input.stateBytes, "stateBytes");
  await lockAdvanceCorrelation(client, input.subjectPlayerId, input.commandCorrelation);

  const command = await loadHuntCheckpointAdvanceCommandByCorrelation(
    client,
    input.subjectPlayerId,
    input.commandCorrelation,
  );
  if (command === null || !commandMatches(command, input)) return { status: "conflict" };
  if (command.status === "advanced") return { status: "accepted", replayed: true, command };
  if (command.status === "superseded") return { status: "superseded", replayed: true, command };

  const checkpoint = await loadHuntCheckpoint(client, input.subjectPlayerId, input.checkpointId, true);
  if (checkpoint === null) return { status: "not_found" };
  if (checkpoint.logicalTimeMs > input.targetLogicalTimeMs) {
    const superseded = await completeAdvanceCommand(
      client,
      command.commandId,
      "superseded",
      checkpoint.rowVersion,
      checkpoint.logicalTimeMs,
      undefined,
      input.now,
    );
    return { status: "superseded", replayed: false, command: superseded };
  }
  if (checkpoint.rowVersion !== input.expectedCheckpointRowVersion) {
    return { status: "stale", checkpoint };
  }
  if (
    checkpoint.schemaVersion !== command.schemaVersion
    || checkpoint.gameDataVersion !== command.gameDataVersion
    || checkpoint.rulesVersion !== command.rulesVersion
  ) {
    return { status: "conflict" };
  }
  if (input.logicalTimeMs <= checkpoint.logicalTimeMs) return { status: "conflict" };

  const logicalTimeAnchorAt = shiftWallClock(
    command.targetWallClockAt,
    input.logicalTimeMs - command.targetLogicalTimeMs,
    "logicalTimeAnchorAt",
  );
  const updated = await client.query<{ row_version: string }>(
    `UPDATE pokenexus.hunt_checkpoints
        SET logical_time_ms = $4,
            checkpoint_state_bytes = $5,
            logical_time_anchor_at = $6,
            row_version = row_version + 1,
            updated_at = $7
      WHERE player_id = $1 AND checkpoint_id = $2 AND row_version = $3::bigint
      RETURNING row_version::text`,
    [
      input.subjectPlayerId,
      input.checkpointId,
      input.expectedCheckpointRowVersion.toString(),
      input.logicalTimeMs,
      Buffer.from(input.stateBytes),
      logicalTimeAnchorAt,
      input.now,
    ],
  );
  if (!updated.rows[0]) {
    const current = await loadHuntCheckpoint(client, input.subjectPlayerId, input.checkpointId);
    return current ? { status: "stale", checkpoint: current } : { status: "not_found" };
  }
  const progressed = await loadHuntCheckpoint(client, input.subjectPlayerId, input.checkpointId);
  if (progressed === null) return { status: "not_found" };
  return { status: "progressed", checkpoint: progressed };
}

export async function persistHuntCheckpointAdvanceProgress(
  client: HuntCheckpointDbClient,
  input: HuntCheckpointAdvanceProgressInput,
): Promise<HuntCheckpointAdvanceProgressResult> {
  return withTransaction(client, (transaction) =>
    persistHuntCheckpointAdvanceProgressInTransaction(transaction, input));
}

export async function commitHuntCheckpointAdvanceInTransaction(
  client: HuntCheckpointDbClient,
  input: HuntCheckpointAdvanceCommitInput,
): Promise<HuntCheckpointAdvanceCommitResult> {
  assertLogicalTime(input.targetLogicalTimeMs, "targetLogicalTimeMs");
  assertLogicalTime(input.logicalTimeMs, "logicalTimeMs");
  if (input.logicalTimeMs > input.targetLogicalTimeMs) {
    throw new Error("logicalTimeMs cannot exceed the frozen targetLogicalTimeMs");
  }
  assertBytes(input.stateBytes, "stateBytes");
  await lockAdvanceCorrelation(client, input.subjectPlayerId, input.commandCorrelation);

  const command = await loadHuntCheckpointAdvanceCommandByCorrelation(
    client,
    input.subjectPlayerId,
    input.commandCorrelation,
  );
  if (command === null || !commandMatches(command, input)) return { status: "conflict" };
  if (command.status === "advanced") return { status: "accepted", replayed: true, command };
  if (command.status === "superseded") return { status: "superseded", replayed: true, command };

  const checkpoint = await loadHuntCheckpoint(client, input.subjectPlayerId, input.checkpointId, true);
  if (checkpoint === null) return { status: "not_found" };

  if (checkpoint.logicalTimeMs > input.targetLogicalTimeMs) {
    const superseded = await completeAdvanceCommand(
      client,
      command.commandId,
      "superseded",
      checkpoint.rowVersion,
      checkpoint.logicalTimeMs,
      undefined,
      input.now,
    );
    return { status: "superseded", replayed: false, command: superseded };
  }
  if (checkpoint.rowVersion !== input.expectedCheckpointRowVersion) {
    return { status: "stale", checkpoint };
  }
  if (
    checkpoint.schemaVersion !== command.schemaVersion
    || checkpoint.gameDataVersion !== command.gameDataVersion
    || checkpoint.rulesVersion !== command.rulesVersion
  ) {
    return { status: "conflict" };
  }
  if (input.logicalTimeMs < checkpoint.logicalTimeMs) {
    return { status: "conflict" };
  }

  let committedCheckpointRowVersion = checkpoint.rowVersion;
  const currentBytes = Buffer.from(checkpoint.stateBytes);
  const requestedBytes = Buffer.from(input.stateBytes);
  const changesState = input.logicalTimeMs !== checkpoint.logicalTimeMs || !currentBytes.equals(requestedBytes);
  if (changesState) {
    const logicalTimeAnchorAt = shiftWallClock(
      command.targetWallClockAt,
      input.logicalTimeMs - command.targetLogicalTimeMs,
      "logicalTimeAnchorAt",
    );
    const updated = await client.query<{ row_version: string }>(
      `UPDATE pokenexus.hunt_checkpoints
          SET logical_time_ms = $4,
              checkpoint_state_bytes = $5,
              logical_time_anchor_at = $6,
              row_version = row_version + 1,
              updated_at = $7
        WHERE player_id = $1 AND checkpoint_id = $2 AND row_version = $3::bigint
        RETURNING row_version::text`,
      [
        input.subjectPlayerId,
        input.checkpointId,
        input.expectedCheckpointRowVersion.toString(),
        input.logicalTimeMs,
        requestedBytes,
        logicalTimeAnchorAt,
        input.now,
      ],
    );
    if (!updated.rows[0]) {
      const current = await loadHuntCheckpoint(client, input.subjectPlayerId, input.checkpointId);
      return current ? { status: "stale", checkpoint: current } : { status: "not_found" };
    }
    committedCheckpointRowVersion = BigInt(updated.rows[0].row_version);
  }

  const completed = await completeAdvanceCommand(
    client,
    command.commandId,
    "advanced",
    committedCheckpointRowVersion,
    input.logicalTimeMs,
    input.stateBytes,
    input.now,
  );
  return { status: "accepted", replayed: false, command: completed };
}

export async function commitHuntCheckpointAdvance(
  client: HuntCheckpointDbClient,
  input: HuntCheckpointAdvanceCommitInput,
): Promise<HuntCheckpointAdvanceCommitResult> {
  return withTransaction(client, (transaction) => commitHuntCheckpointAdvanceInTransaction(transaction, input));
}
