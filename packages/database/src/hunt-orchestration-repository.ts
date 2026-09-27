import type { Client } from "pg";
import { decodeOpaqueStringDbV1, encodeOpaqueStringDbV1 } from "./opaque-string-db-codec.js";
import { generateUuidV7 } from "./uuid-v7.js";

export type HuntOrchestrationDbClient = Pick<Client, "query">;

export interface PlayerHuntRootRecord {
  readonly playerId: string;
  readonly activeHuntId: string | null;
  readonly recoveryReadyAt: Date | null;
  readonly currentPolicyVersion: string | null;
  readonly policyRowVersion: bigint;
  readonly commandSequence: bigint;
  readonly databaseNow: Date;
}

export interface SoloHuntRecord {
  readonly huntId: string;
  readonly playerId: string;
  readonly checkpointId: string;
  readonly huntDefinitionId: string;
  readonly zoneId: string;
  readonly recoveryDurationMs: number;
  readonly startedAt: Date;
  readonly terminalAt: Date | null;
  readonly terminalReason: "retreat" | "no_living" | "opponent_victory" | "draw" | null;
  readonly initialPolicyVersion: string | null;
  readonly rowVersion: bigint;
}

export type HuntPublicCommandKind =
  | "start"
  | "checkpoint"
  | "claim"
  | "retreat"
  | "manual_capture"
  | "heal_item"
  | "policy_replace";

export interface HuntPublicCommandRecord {
  readonly commandId: string;
  readonly playerId: string;
  readonly idempotencyKey: string;
  readonly commandKind: HuntPublicCommandKind;
  readonly intentHash: Uint8Array;
  readonly intentJson: Record<string, unknown>;
  readonly serverContext: Record<string, unknown>;
  readonly status: "pending" | "terminal" | "gone";
  readonly acceptanceSequence: bigint;
  readonly sourceHuntId: string | null;
  readonly advancementHuntId: string | null;
  readonly targetLogicalTimeMs: number | null;
  readonly targetWallClockAt: Date | null;
  readonly claimEffects: Record<string, unknown>;
  readonly resultHttpStatus: number | null;
  readonly resultJson: unknown | null;
  readonly acceptedAt: Date;
  readonly terminalAt: Date | null;
  readonly continuationExpiresAt: Date;
  readonly tombstoneExpiresAt: Date;
}

export type PublicCommandClaimResult =
  | { readonly status: "accepted"; readonly command: HuntPublicCommandRecord; readonly replayed: false }
  | { readonly status: "pending"; readonly command: HuntPublicCommandRecord; readonly replayed: true }
  | { readonly status: "terminal"; readonly command: HuntPublicCommandRecord; readonly replayed: true }
  | { readonly status: "gone"; readonly command: HuntPublicCommandRecord; readonly replayed: true }
  | { readonly status: "conflict"; readonly command: HuntPublicCommandRecord };

export interface HuntAutoCapturePolicyRecord {
  readonly policyVersion: string;
  readonly playerId: string;
  readonly rowVersion: bigint;
  readonly ballAuthorityVersion: string;
  readonly validationGameDataVersion: string;
  readonly enabled: boolean;
  readonly policyJson: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface HuntPendingManualCaptureRecord {
  readonly playerId: string;
  readonly sourceHuntId: string;
  readonly encounterId: string;
  readonly speciesId: string;
  readonly level: number;
  readonly catchRate: number;
  readonly shiny: boolean;
  readonly captureEvidenceJson: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface HuntHealingCommandRecord {
  readonly commandId: string;
  readonly playerId: string;
  readonly sourceHuntId: string;
  readonly itemId: string;
  readonly targetPokemonInstanceId: string;
  readonly itemRuleVersion: string;
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
  readonly submissionCutoffLogicalTimeMs: number;
  readonly submissionPhase: "battle" | "inter_battle" | null;
  readonly submissionEncounterId: string | null;
  readonly dueLogicalTimeMs: number | null;
  readonly acceptanceSequence: bigint;
  readonly status: "scheduled" | "applied" | "not_applied";
  readonly resultReason: "target_ineligible" | "insufficient_item" | "hunt_terminal" | null;
  readonly healedHp: number | null;
  readonly resolvedAt: Date | null;
}

export interface HuntEncounterBoundaryRecord {
  readonly huntId: string;
  readonly encounterId: string;
  readonly encounterOrdinal: number;
  readonly completedLogicalTimeMs: number;
  readonly policyVersion: string | null;
  readonly status: "frozen" | "capture_committed" | "reward_committed" | "committed";
  readonly rewardRngJson: Record<string, unknown>;
  readonly captureRngJson: Record<string, unknown> | null;
  readonly preRewardInventoryRowVersion: bigint | null;
  readonly rewardResolutionId: string | null;
  readonly automaticDisposition: "attempt" | "no_eligible_ball" | "disabled" | null;
  readonly selectedItemId: string | null;
  readonly automaticAttemptCorrelation: string | null;
  readonly automaticCaptureSuccess: boolean | null;
  readonly automaticCaptureShiny: boolean | null;
  readonly manualDisposition: "created_pending" | "blocked_existing" | "not_applicable";
}

export interface HuntInputAuthorityRecord {
  readonly huntId: string;
  readonly playerId: string;
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
  readonly runtimeInputsJson: Record<string, unknown>;
  readonly individualizationAuthorityVersion: string | null;
  readonly individualizationAuthorityKeyId: string | null;
}

interface RootRow {
  player_id: string;
  active_hunt_id: string | null;
  recovery_ready_at: Date | null;
  current_policy_version: string | null;
  policy_row_version: string;
  command_sequence: string;
  database_now: Date;
}

interface HuntRow {
  hunt_id: string;
  player_id: string;
  checkpoint_id: string;
  hunt_definition_id: Buffer;
  zone_id: Buffer;
  recovery_duration_ms: string;
  started_at: Date;
  terminal_at: Date | null;
  terminal_reason: SoloHuntRecord["terminalReason"];
  initial_policy_version: string | null;
  row_version: string;
}

interface CommandRow {
  command_id: string;
  player_id: string;
  idempotency_key: string;
  command_kind: HuntPublicCommandKind;
  intent_hash: Buffer;
  intent_json: Record<string, unknown>;
  server_context_json: Record<string, unknown>;
  command_status: HuntPublicCommandRecord["status"];
  acceptance_sequence: string;
  source_hunt_id: string | null;
  advancement_hunt_id: string | null;
  target_logical_time_ms: string | null;
  target_wall_clock_at: Date | null;
  claim_effects: Record<string, unknown>;
  result_http_status: number | null;
  result_json: unknown | null;
  accepted_at: Date;
  terminal_at: Date | null;
  continuation_expires_at: Date;
  tombstone_expires_at: Date;
}

interface PolicyRow {
  policy_version: string;
  player_id: string;
  row_version: string;
  ball_authority_version: Buffer;
  validation_game_data_version: Buffer;
  enabled: boolean;
  policy_json: Record<string, unknown>;
  created_at: Date;
}

interface PendingManualRow {
  player_id: string;
  source_hunt_id: string;
  encounter_id: Buffer;
  species_id: Buffer;
  level: number;
  catch_rate: number;
  shiny: boolean;
  capture_evidence_json: Record<string, unknown>;
  created_at: Date;
}

interface HealRow {
  command_id: string;
  player_id: string;
  source_hunt_id: string;
  item_id: Buffer;
  target_pokemon_instance_id: string;
  item_rule_version: Buffer;
  game_data_version: Buffer;
  rules_version: Buffer;
  submission_cutoff_logical_time_ms: string;
  submission_phase: "battle" | "inter_battle" | null;
  submission_encounter_id: Buffer | null;
  due_logical_time_ms: string | null;
  acceptance_sequence: string;
  heal_status: "scheduled" | "applied" | "not_applied";
  result_reason: HuntHealingCommandRecord["resultReason"];
  healed_hp: number | null;
  resolved_at: Date | null;
}

interface InputAuthorityRow {
  hunt_id: string;
  player_id: string;
  game_data_version: Buffer;
  rules_version: Buffer;
  runtime_inputs_json: Record<string, unknown>;
  individualization_authority_version: Buffer | null;
  individualization_authority_key_id: Buffer | null;
}

interface EncounterBoundaryRow {
  hunt_id: string;
  encounter_id: Buffer;
  encounter_ordinal: string;
  completed_logical_time_ms: string;
  policy_version: string | null;
  boundary_status: HuntEncounterBoundaryRecord["status"];
  reward_rng_json: Record<string, unknown>;
  capture_rng_json: Record<string, unknown> | null;
  pre_reward_inventory_row_version: string | null;
  reward_resolution_id: string | null;
  automatic_disposition: HuntEncounterBoundaryRecord["automaticDisposition"];
  selected_item_id: Buffer | null;
  automatic_attempt_correlation: Buffer | null;
  automatic_capture_success: boolean | null;
  automatic_capture_shiny: boolean | null;
  manual_disposition: HuntEncounterBoundaryRecord["manualDisposition"];
}

const encode = (value: string, label: string): Buffer => {
  if (!value) throw new Error(`${label} must be non-empty`);
  return Buffer.from(encodeOpaqueStringDbV1(value));
};
const decode = (value: Buffer): string => decodeOpaqueStringDbV1(value);

function mapRoot(row: RootRow): PlayerHuntRootRecord {
  return {
    playerId: row.player_id,
    activeHuntId: row.active_hunt_id,
    recoveryReadyAt: row.recovery_ready_at,
    currentPolicyVersion: row.current_policy_version,
    policyRowVersion: BigInt(row.policy_row_version),
    commandSequence: BigInt(row.command_sequence),
    databaseNow: row.database_now,
  };
}

function mapHunt(row: HuntRow): SoloHuntRecord {
  return {
    huntId: row.hunt_id,
    playerId: row.player_id,
    checkpointId: row.checkpoint_id,
    huntDefinitionId: decode(row.hunt_definition_id),
    zoneId: decode(row.zone_id),
    recoveryDurationMs: Number(row.recovery_duration_ms),
    startedAt: row.started_at,
    terminalAt: row.terminal_at,
    terminalReason: row.terminal_reason,
    initialPolicyVersion: row.initial_policy_version,
    rowVersion: BigInt(row.row_version),
  };
}

function mapCommand(row: CommandRow): HuntPublicCommandRecord {
  const targetLogicalTimeMs = row.target_logical_time_ms === null ? null : Number(row.target_logical_time_ms);
  if (targetLogicalTimeMs !== null && !Number.isSafeInteger(targetLogicalTimeMs)) {
    throw new Error("Persisted Hunt command target exceeds safe logical-time domain");
  }
  return {
    commandId: row.command_id,
    playerId: row.player_id,
    idempotencyKey: row.idempotency_key,
    commandKind: row.command_kind,
    intentHash: new Uint8Array(row.intent_hash),
    intentJson: row.intent_json,
    serverContext: row.server_context_json,
    status: row.command_status,
    acceptanceSequence: BigInt(row.acceptance_sequence),
    sourceHuntId: row.source_hunt_id,
    advancementHuntId: row.advancement_hunt_id,
    targetLogicalTimeMs,
    targetWallClockAt: row.target_wall_clock_at,
    claimEffects: row.claim_effects,
    resultHttpStatus: row.result_http_status,
    resultJson: row.result_json,
    acceptedAt: row.accepted_at,
    terminalAt: row.terminal_at,
    continuationExpiresAt: row.continuation_expires_at,
    tombstoneExpiresAt: row.tombstone_expires_at,
  };
}

function mapPolicy(row: PolicyRow): HuntAutoCapturePolicyRecord {
  return {
    policyVersion: row.policy_version,
    playerId: row.player_id,
    rowVersion: BigInt(row.row_version),
    ballAuthorityVersion: decode(row.ball_authority_version),
    validationGameDataVersion: decode(row.validation_game_data_version),
    enabled: row.enabled,
    policyJson: row.policy_json,
    createdAt: row.created_at,
  };
}

function mapPendingManual(row: PendingManualRow): HuntPendingManualCaptureRecord {
  return {
    playerId: row.player_id,
    sourceHuntId: row.source_hunt_id,
    encounterId: decode(row.encounter_id),
    speciesId: decode(row.species_id),
    level: row.level,
    catchRate: row.catch_rate,
    shiny: row.shiny,
    captureEvidenceJson: row.capture_evidence_json,
    createdAt: row.created_at,
  };
}

function mapHeal(row: HealRow): HuntHealingCommandRecord {
  return {
    commandId: row.command_id,
    playerId: row.player_id,
    sourceHuntId: row.source_hunt_id,
    itemId: decode(row.item_id),
    targetPokemonInstanceId: row.target_pokemon_instance_id,
    itemRuleVersion: decode(row.item_rule_version),
    gameDataVersion: decode(row.game_data_version),
    rulesVersion: decode(row.rules_version),
    submissionCutoffLogicalTimeMs: Number(row.submission_cutoff_logical_time_ms),
    submissionPhase: row.submission_phase,
    submissionEncounterId: row.submission_encounter_id ? decode(row.submission_encounter_id) : null,
    dueLogicalTimeMs: row.due_logical_time_ms === null ? null : Number(row.due_logical_time_ms),
    acceptanceSequence: BigInt(row.acceptance_sequence),
    status: row.heal_status,
    resultReason: row.result_reason,
    healedHp: row.healed_hp,
    resolvedAt: row.resolved_at,
  };
}

export async function ensureAndLockPlayerHuntRoot(
  client: HuntOrchestrationDbClient,
  playerId: string,
): Promise<PlayerHuntRootRecord | null> {
  await client.query(
    `INSERT INTO pokenexus.player_hunt_roots (player_id)
     SELECT player_id FROM pokenexus.players WHERE player_id = $1
     ON CONFLICT (player_id) DO NOTHING`,
    [playerId],
  );
  const result = await client.query<RootRow>(
    `SELECT player_id, active_hunt_id, recovery_ready_at, current_policy_version,
            policy_row_version::text, command_sequence::text,
            transaction_timestamp() AS database_now
       FROM pokenexus.player_hunt_roots
      WHERE player_id = $1
      FOR UPDATE`,
    [playerId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const sampled = await client.query<{ database_now: Date }>(
    "SELECT clock_timestamp() AS database_now",
  );
  const databaseNow = sampled.rows[0]?.database_now;
  if (!databaseNow) throw new Error("Player Hunt root lock lost serialized server time");
  return mapRoot({ ...row, database_now: databaseNow });
}

export async function loadPlayerHuntRoot(
  client: HuntOrchestrationDbClient,
  playerId: string,
): Promise<PlayerHuntRootRecord | null> {
  const result = await client.query<RootRow>(
    `SELECT player_id, active_hunt_id, recovery_ready_at, current_policy_version,
            policy_row_version::text, command_sequence::text,
            transaction_timestamp() AS database_now
       FROM pokenexus.player_hunt_roots
      WHERE player_id = $1`,
    [playerId],
  );
  return result.rows[0] ? mapRoot(result.rows[0]) : null;
}

export async function loadPublicHuntCommand(
  client: HuntOrchestrationDbClient,
  playerId: string,
  idempotencyKey: string,
): Promise<HuntPublicCommandRecord | null> {
  const result = await client.query<CommandRow>(
    `SELECT command_id, player_id, idempotency_key::text, command_kind, intent_hash, intent_json, server_context_json,
            command_status, acceptance_sequence::text, source_hunt_id, advancement_hunt_id,
            target_logical_time_ms::text, target_wall_clock_at, claim_effects,
            result_http_status, result_json, accepted_at, terminal_at,
            continuation_expires_at, tombstone_expires_at
       FROM pokenexus.hunt_public_commands
      WHERE player_id = $1 AND idempotency_key = $2::uuid`,
    [playerId, idempotencyKey],
  );
  return result.rows[0] ? mapCommand(result.rows[0]) : null;
}

function sameHash(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

export async function claimPublicHuntCommandInTransaction(
  client: HuntOrchestrationDbClient,
  input: {
    readonly playerId: string;
    readonly idempotencyKey: string;
    readonly commandKind: HuntPublicCommandKind;
    readonly intentHash: Uint8Array;
    readonly intentJson: Record<string, unknown>;
    readonly sourceHuntId?: string | null;
    readonly advancementHuntId?: string | null;
    readonly targetLogicalTimeMs?: number | null;
    readonly targetWallClockAt?: Date | null;
  },
): Promise<PublicCommandClaimResult> {
  if (input.intentHash.byteLength !== 32) throw new Error("Hunt command intent hash must be SHA-256");
  const root = await ensureAndLockPlayerHuntRoot(client, input.playerId);
  if (!root) throw new Error("Hunt command subject Player does not exist");
  let existing = await loadPublicHuntCommand(client, input.playerId, input.idempotencyKey);
  if (existing) {
    if (existing.commandKind !== input.commandKind || !sameHash(existing.intentHash, input.intentHash)) {
      return { status: "conflict", command: existing };
    }
    if (existing.status === "pending" && root.databaseNow >= existing.continuationExpiresAt) {
      await client.query(
        `UPDATE pokenexus.hunt_public_commands
            SET command_status = 'gone', result_http_status = NULL, result_json = NULL, terminal_at = NULL
          WHERE command_id = $1`,
        [existing.commandId],
      );
      existing = (await loadPublicHuntCommand(client, input.playerId, input.idempotencyKey))!;
    } else if (existing.status === "terminal" && root.databaseNow >= existing.continuationExpiresAt) {
      await client.query(
        `UPDATE pokenexus.hunt_public_commands
            SET command_status = 'gone', result_http_status = NULL, result_json = NULL
          WHERE command_id = $1`,
        [existing.commandId],
      );
      existing = (await loadPublicHuntCommand(client, input.playerId, input.idempotencyKey))!;
    }
    return existing.status === "terminal"
      ? { status: "terminal", command: existing, replayed: true }
      : existing.status === "gone"
        ? { status: "gone", command: existing, replayed: true }
        : { status: "pending", command: existing, replayed: true };
  }

  const sequence = root.commandSequence + 1n;
  await client.query(
    `UPDATE pokenexus.player_hunt_roots
        SET command_sequence = $2::bigint, updated_at = transaction_timestamp()
      WHERE player_id = $1`,
    [input.playerId, sequence.toString()],
  );
  const commandId = generateUuidV7();
  const inserted = await client.query<CommandRow>(
    `INSERT INTO pokenexus.hunt_public_commands (
       command_id, player_id, idempotency_key, command_kind, intent_hash, intent_json, server_context_json,
       command_status, acceptance_sequence, source_hunt_id, advancement_hunt_id,
       target_logical_time_ms, target_wall_clock_at, accepted_at,
       continuation_expires_at, tombstone_expires_at
     ) VALUES (
       $1,$2,$3::uuid,$4,$5,$6::jsonb,'{}'::jsonb,'pending',$7::bigint,$8,$9,$10,$11,
       $12::timestamptz, $12::timestamptz + interval '30 days',
       $12::timestamptz + interval '60 days'
     )
     RETURNING command_id, player_id, idempotency_key::text, command_kind, intent_hash, intent_json, server_context_json,
               command_status, acceptance_sequence::text, source_hunt_id, advancement_hunt_id,
               target_logical_time_ms::text, target_wall_clock_at, claim_effects,
               result_http_status, result_json, accepted_at, terminal_at,
               continuation_expires_at, tombstone_expires_at`,
    [
      commandId,
      input.playerId,
      input.idempotencyKey,
      input.commandKind,
      Buffer.from(input.intentHash),
      JSON.stringify(input.intentJson),
      sequence.toString(),
      input.sourceHuntId ?? null,
      input.advancementHuntId ?? null,
      input.targetLogicalTimeMs ?? null,
      input.targetWallClockAt ?? null,
      root.databaseNow,
    ],
  );
  return { status: "accepted", command: mapCommand(inserted.rows[0]!), replayed: false };
}

export async function updatePublicHuntCommandTargetInTransaction(
  client: HuntOrchestrationDbClient,
  commandId: string,
  input: {
    readonly advancementHuntId: string | null;
    readonly targetLogicalTimeMs: number | null;
    readonly targetWallClockAt: Date | null;
  },
): Promise<void> {
  await client.query(
    `UPDATE pokenexus.hunt_public_commands
        SET advancement_hunt_id = $2, target_logical_time_ms = $3, target_wall_clock_at = $4
      WHERE command_id = $1 AND command_status = 'pending'`,
    [commandId, input.advancementHuntId, input.targetLogicalTimeMs, input.targetWallClockAt],
  );
}

export async function updatePublicHuntCommandServerContextInTransaction(
  client: HuntOrchestrationDbClient,
  commandId: string,
  serverContext: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `UPDATE pokenexus.hunt_public_commands
        SET server_context_json = $2::jsonb
      WHERE command_id = $1 AND command_status = 'pending'`,
    [commandId, JSON.stringify(serverContext)],
  );
}

export async function supersedeOvertakenPublicHuntCommandsInTransaction(
  client: HuntOrchestrationDbClient,
  input: {
    readonly playerId: string;
    readonly huntId: string;
    readonly committedLogicalTimeMs: number;
    readonly exceptCommandId?: string | null;
  },
): Promise<number> {
  await client.query(
    `UPDATE pokenexus.hunt_public_commands
        SET command_status = 'gone',
            result_http_status = NULL,
            result_json = NULL,
            terminal_at = NULL
      WHERE player_id = $1
        AND advancement_hunt_id = $2
        AND command_status = 'pending'
        AND clock_timestamp() >= continuation_expires_at`,
    [input.playerId, input.huntId],
  );
  const result = await client.query(
    `WITH sampled AS (
       SELECT clock_timestamp() AS database_now
     )
     UPDATE pokenexus.hunt_public_commands AS command
        SET command_status = 'terminal',
            result_http_status = 409,
            result_json = '{"error":"command_superseded"}'::jsonb,
            terminal_at = sampled.database_now,
            continuation_expires_at = sampled.database_now + interval '30 days',
            tombstone_expires_at = sampled.database_now + interval '60 days'
       FROM sampled
      WHERE command.player_id = $1
        AND command.advancement_hunt_id = $2
        AND command.command_status = 'pending'
        AND sampled.database_now < command.continuation_expires_at
        AND command.command_kind <> 'heal_item'
        AND command.target_logical_time_ms IS NOT NULL
        AND command.target_logical_time_ms < $3
        AND ($4::uuid IS NULL OR command.command_id <> $4::uuid)`,
    [
      input.playerId,
      input.huntId,
      input.committedLogicalTimeMs,
      input.exceptCommandId ?? null,
    ],
  );
  return result.rowCount ?? 0;
}

export async function completePublicHuntCommandInTransaction(
  client: HuntOrchestrationDbClient,
  commandId: string,
  httpStatus: number,
  resultJson: unknown,
): Promise<HuntPublicCommandRecord> {
  const result = await client.query<CommandRow>(
    `WITH sampled AS (
       SELECT clock_timestamp() AS database_now
     )
     UPDATE pokenexus.hunt_public_commands AS command
        SET command_status = CASE
              WHEN sampled.database_now >= command.continuation_expires_at THEN 'gone'
              ELSE 'terminal'
            END,
            result_http_status = CASE
              WHEN sampled.database_now >= command.continuation_expires_at THEN NULL
              ELSE $2::smallint
            END,
            result_json = CASE
              WHEN sampled.database_now >= command.continuation_expires_at THEN NULL
              ELSE $3::jsonb
            END,
            terminal_at = CASE
              WHEN sampled.database_now >= command.continuation_expires_at THEN NULL
              ELSE sampled.database_now
            END,
            continuation_expires_at = CASE
              WHEN sampled.database_now >= command.continuation_expires_at
                THEN command.continuation_expires_at
              ELSE sampled.database_now + interval '30 days'
            END,
            tombstone_expires_at = CASE
              WHEN sampled.database_now >= command.continuation_expires_at
                THEN command.tombstone_expires_at
              ELSE sampled.database_now + interval '60 days'
            END
       FROM sampled
      WHERE command.command_id = $1 AND command.command_status = 'pending'
      RETURNING command_id, player_id, idempotency_key::text, command_kind, intent_hash, intent_json, server_context_json,
                command_status, acceptance_sequence::text, source_hunt_id, advancement_hunt_id,
                target_logical_time_ms::text, target_wall_clock_at, claim_effects,
                result_http_status, result_json, accepted_at, terminal_at,
                continuation_expires_at, tombstone_expires_at`,
    [commandId, httpStatus, JSON.stringify(resultJson)],
  );
  if (result.rows[0]) return mapCommand(result.rows[0]);
  const existing = await client.query<CommandRow>(
    `SELECT command_id, player_id, idempotency_key::text, command_kind, intent_hash, intent_json, server_context_json,
            command_status, acceptance_sequence::text, source_hunt_id, advancement_hunt_id,
            target_logical_time_ms::text, target_wall_clock_at, claim_effects,
            result_http_status, result_json, accepted_at, terminal_at,
            continuation_expires_at, tombstone_expires_at
       FROM pokenexus.hunt_public_commands WHERE command_id = $1`,
    [commandId],
  );
  if (!existing.rows[0]) throw new Error("Hunt public command disappeared during completion");
  return mapCommand(existing.rows[0]);
}

export async function loadOwnedSoloHunt(
  client: HuntOrchestrationDbClient,
  playerId: string,
  huntId: string,
  forUpdate = false,
): Promise<SoloHuntRecord | null> {
  const result = await client.query<HuntRow>(
    `SELECT hunt_id, player_id, checkpoint_id, hunt_definition_id, zone_id,
            recovery_duration_ms::text, started_at, terminal_at, terminal_reason,
            initial_policy_version, row_version::text
       FROM pokenexus.solo_hunts
      WHERE player_id = $1 AND hunt_id = $2${forUpdate ? " FOR UPDATE" : ""}`,
    [playerId, huntId],
  );
  return result.rows[0] ? mapHunt(result.rows[0]) : null;
}

export async function loadActiveSoloHunt(
  client: HuntOrchestrationDbClient,
  playerId: string,
  forUpdate = false,
): Promise<SoloHuntRecord | null> {
  const result = await client.query<HuntRow>(
    `SELECT hunt_id, player_id, checkpoint_id, hunt_definition_id, zone_id,
            recovery_duration_ms::text, started_at, terminal_at, terminal_reason,
            initial_policy_version, row_version::text
       FROM pokenexus.solo_hunts
      WHERE player_id = $1 AND terminal_at IS NULL${forUpdate ? " FOR UPDATE" : ""}`,
    [playerId],
  );
  return result.rows[0] ? mapHunt(result.rows[0]) : null;
}

export async function createSoloHuntInTransaction(
  client: HuntOrchestrationDbClient,
  input: {
    readonly playerId: string;
    readonly checkpointId: string;
    readonly huntDefinitionId: string;
    readonly zoneId: string;
    readonly recoveryDurationMs: number;
    readonly initialPolicyVersion: string | null;
    readonly startedAt?: Date;
  },
): Promise<SoloHuntRecord> {
  const huntId = generateUuidV7();
  const result = await client.query<HuntRow>(
    `INSERT INTO pokenexus.solo_hunts (
       hunt_id, player_id, checkpoint_id, hunt_definition_id, zone_id,
       recovery_duration_ms, started_at, initial_policy_version
     ) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, clock_timestamp()),$8)
     RETURNING hunt_id, player_id, checkpoint_id, hunt_definition_id, zone_id,
               recovery_duration_ms::text, started_at, terminal_at, terminal_reason,
               initial_policy_version, row_version::text`,
    [
      huntId,
      input.playerId,
      input.checkpointId,
      encode(input.huntDefinitionId, "huntDefinitionId"),
      encode(input.zoneId, "zoneId"),
      input.recoveryDurationMs,
      input.startedAt ?? null,
      input.initialPolicyVersion,
    ],
  );
  await client.query(
    `UPDATE pokenexus.player_hunt_roots
        SET active_hunt_id = $2,
            recovery_ready_at = NULL,
            updated_at = transaction_timestamp()
      WHERE player_id = $1`,
    [input.playerId, huntId],
  );
  return mapHunt(result.rows[0]!);
}

export async function saveHuntInputAuthorityInTransaction(
  client: HuntOrchestrationDbClient,
  input: HuntInputAuthorityRecord,
): Promise<void> {
  await client.query(
    `INSERT INTO pokenexus.hunt_input_authorities (
       hunt_id, player_id, game_data_version, rules_version, runtime_inputs_json,
       individualization_authority_version, individualization_authority_key_id
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
    [
      input.huntId,
      input.playerId,
      encode(input.gameDataVersion, "gameDataVersion"),
      encode(input.rulesVersion, "rulesVersion"),
      JSON.stringify(input.runtimeInputsJson),
      input.individualizationAuthorityVersion === null
        ? null
        : encode(input.individualizationAuthorityVersion, "individualizationAuthorityVersion"),
      input.individualizationAuthorityKeyId === null
        ? null
        : encode(input.individualizationAuthorityKeyId, "individualizationAuthorityKeyId"),
    ],
  );
}

export async function loadHuntInputAuthority(
  client: HuntOrchestrationDbClient,
  playerId: string,
  huntId: string,
): Promise<HuntInputAuthorityRecord | null> {
  const result = await client.query<InputAuthorityRow>(
    `SELECT hunt_id, player_id, game_data_version, rules_version, runtime_inputs_json,
            individualization_authority_version, individualization_authority_key_id
       FROM pokenexus.hunt_input_authorities
      WHERE player_id = $1 AND hunt_id = $2`,
    [playerId, huntId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    huntId: row.hunt_id,
    playerId: row.player_id,
    gameDataVersion: decode(row.game_data_version),
    rulesVersion: decode(row.rules_version),
    runtimeInputsJson: row.runtime_inputs_json,
    individualizationAuthorityVersion: row.individualization_authority_version
      ? decode(row.individualization_authority_version)
      : null,
    individualizationAuthorityKeyId: row.individualization_authority_key_id
      ? decode(row.individualization_authority_key_id)
      : null,
  };
}

export async function terminalizeSoloHuntInTransaction(
  client: HuntOrchestrationDbClient,
  input: {
    readonly playerId: string;
    readonly huntId: string;
    readonly terminalReason: NonNullable<SoloHuntRecord["terminalReason"]>;
    readonly recoveryDurationMs: number;
  },
): Promise<{ readonly hunt: SoloHuntRecord; readonly recoveryReadyAt: Date }> {
  const root = await ensureAndLockPlayerHuntRoot(client, input.playerId);
  if (!root) throw new Error("Hunt terminalization lost Player Hunt root");
  const locked = await client.query<HuntRow & { logical_time_anchor_at: Date }>(
    `SELECT h.hunt_id, h.player_id, h.checkpoint_id, h.hunt_definition_id, h.zone_id,
            h.recovery_duration_ms::text, h.started_at, h.terminal_at, h.terminal_reason,
            h.initial_policy_version, h.row_version::text, c.logical_time_anchor_at
       FROM pokenexus.solo_hunts h
       JOIN pokenexus.hunt_checkpoints c ON c.checkpoint_id = h.checkpoint_id AND c.player_id = h.player_id
      WHERE h.player_id = $1 AND h.hunt_id = $2
      FOR UPDATE OF h, c`,
    [input.playerId, input.huntId],
  );
  const row = locked.rows[0];
  if (!row) throw new Error("Active Hunt terminalization lost ownership invariant");
  const existing = mapHunt(row);
  if (existing.terminalAt) {
    if (!root.recoveryReadyAt) throw new Error("Terminal Hunt is missing Player recovery anchor");
    return { hunt: existing, recoveryReadyAt: root.recoveryReadyAt };
  }
  if (root.activeHuntId !== input.huntId) {
    throw new Error("Active Hunt terminalization lost current-Hunt invariant");
  }
  const terminalBoundaryAt = row.logical_time_anchor_at;
  const terminalized = await client.query<HuntRow>(
    `UPDATE pokenexus.solo_hunts
        SET terminal_at = $3, terminal_reason = $4,
            row_version = row_version + 1, updated_at = transaction_timestamp()
      WHERE player_id = $1 AND hunt_id = $2 AND terminal_at IS NULL
      RETURNING hunt_id, player_id, checkpoint_id, hunt_definition_id, zone_id,
                recovery_duration_ms::text, started_at, terminal_at, terminal_reason,
                initial_policy_version, row_version::text`,
    [input.playerId, input.huntId, terminalBoundaryAt, input.terminalReason],
  );
  const terminalHunt = terminalized.rows[0];
  if (!terminalHunt) throw new Error("Locked Hunt terminalization unexpectedly failed");
  const recovery = await client.query<{ recovery_ready_at: Date }>(
    `UPDATE pokenexus.player_hunt_roots
        SET active_hunt_id = NULL,
            recovery_ready_at = $3::timestamptz + ($4::bigint * interval '1 millisecond'),
            updated_at = transaction_timestamp()
      WHERE player_id = $1 AND active_hunt_id = $2
      RETURNING recovery_ready_at`,
    [input.playerId, input.huntId, terminalBoundaryAt, input.recoveryDurationMs],
  );
  const recoveryReadyAt = recovery.rows[0]?.recovery_ready_at;
  if (!recoveryReadyAt) throw new Error("Locked Hunt terminalization failed to release Player active-Hunt root");
  return { hunt: mapHunt(terminalHunt), recoveryReadyAt };
}

export async function loadCurrentAutoCapturePolicy(
  client: HuntOrchestrationDbClient,
  playerId: string,
): Promise<HuntAutoCapturePolicyRecord | null> {
  const result = await client.query<PolicyRow>(
    `SELECT p.policy_version, p.player_id, p.row_version::text, p.ball_authority_version,
            p.validation_game_data_version, p.enabled, p.policy_json, p.created_at
       FROM pokenexus.player_hunt_roots r
       JOIN pokenexus.hunt_auto_capture_policies p ON p.policy_version = r.current_policy_version
      WHERE r.player_id = $1`,
    [playerId],
  );
  return result.rows[0] ? mapPolicy(result.rows[0]) : null;
}

export async function loadAutoCapturePolicyByVersion(
  client: HuntOrchestrationDbClient,
  playerId: string,
  policyVersion: string,
): Promise<HuntAutoCapturePolicyRecord | null> {
  const result = await client.query<PolicyRow>(
    `SELECT policy_version, player_id, row_version::text, ball_authority_version,
            validation_game_data_version, enabled, policy_json, created_at
       FROM pokenexus.hunt_auto_capture_policies
      WHERE player_id = $1 AND policy_version = $2`,
    [playerId, policyVersion],
  );
  return result.rows[0] ? mapPolicy(result.rows[0]) : null;
}

export async function insertAutoCapturePolicyInTransaction(
  client: HuntOrchestrationDbClient,
  input: {
    readonly playerId: string;
    readonly expectedRowVersion: bigint;
    readonly ballAuthorityVersion: string;
    readonly validationGameDataVersion: string;
    readonly enabled: boolean;
    readonly policyJson: Record<string, unknown>;
    readonly effectiveHuntId: string | null;
    readonly effectiveLogicalTimeMs: number | null;
  },
): Promise<{ readonly status: "accepted"; readonly policy: HuntAutoCapturePolicyRecord } | { readonly status: "stale"; readonly rowVersion: bigint }> {
  const root = await ensureAndLockPlayerHuntRoot(client, input.playerId);
  if (!root) throw new Error("Policy subject Player does not exist");
  if (root.policyRowVersion !== input.expectedRowVersion) {
    return { status: "stale", rowVersion: root.policyRowVersion };
  }
  const nextVersion = root.policyRowVersion + 1n;
  const policyVersion = generateUuidV7();
  const inserted = await client.query<PolicyRow>(
    `INSERT INTO pokenexus.hunt_auto_capture_policies (
       policy_version, player_id, row_version, ball_authority_version,
       validation_game_data_version, enabled, policy_json, created_at
     ) VALUES ($1,$2,$3::bigint,$4,$5,$6,$7::jsonb,transaction_timestamp())
     RETURNING policy_version, player_id, row_version::text, ball_authority_version,
               validation_game_data_version, enabled, policy_json, created_at`,
    [
      policyVersion,
      input.playerId,
      nextVersion.toString(),
      encode(input.ballAuthorityVersion, "ballAuthorityVersion"),
      encode(input.validationGameDataVersion, "validationGameDataVersion"),
      input.enabled,
      JSON.stringify(input.policyJson),
    ],
  );
  await client.query(
    `UPDATE pokenexus.player_hunt_roots
        SET current_policy_version = $2, policy_row_version = $3::bigint, updated_at = transaction_timestamp()
      WHERE player_id = $1 AND policy_row_version = $4::bigint`,
    [input.playerId, policyVersion, nextVersion.toString(), input.expectedRowVersion.toString()],
  );
  if (input.effectiveHuntId !== null && input.effectiveLogicalTimeMs !== null) {
    await client.query(
      `INSERT INTO pokenexus.hunt_policy_intervals (hunt_id, effective_logical_time_ms, policy_version)
       VALUES ($1,$2,$3)
       ON CONFLICT (hunt_id, effective_logical_time_ms)
       DO UPDATE SET policy_version = EXCLUDED.policy_version`,
      [input.effectiveHuntId, input.effectiveLogicalTimeMs, policyVersion],
    );
  }
  return { status: "accepted", policy: mapPolicy(inserted.rows[0]!) };
}

export async function loadEffectivePolicyVersion(
  client: HuntOrchestrationDbClient,
  huntId: string,
  logicalTimeMs: number,
): Promise<string | null> {
  const result = await client.query<{ policy_version: string | null }>(
    `SELECT policy_version
       FROM pokenexus.hunt_policy_intervals
      WHERE hunt_id = $1 AND effective_logical_time_ms <= $2
      ORDER BY effective_logical_time_ms DESC
      LIMIT 1`,
    [huntId, logicalTimeMs],
  );
  return result.rows[0]?.policy_version ?? null;
}

export async function insertInitialPolicyIntervalInTransaction(
  client: HuntOrchestrationDbClient,
  huntId: string,
  policyVersion: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO pokenexus.hunt_policy_intervals (hunt_id, effective_logical_time_ms, policy_version)
     VALUES ($1,0,$2)`,
    [huntId, policyVersion],
  );
}

export async function loadPendingManualCapture(
  client: HuntOrchestrationDbClient,
  playerId: string,
  forUpdate = false,
): Promise<HuntPendingManualCaptureRecord | null> {
  const result = await client.query<PendingManualRow>(
    `SELECT player_id, source_hunt_id, encounter_id, species_id, level, catch_rate, shiny,
            capture_evidence_json, created_at
       FROM pokenexus.hunt_pending_manual_captures
      WHERE player_id = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [playerId],
  );
  return result.rows[0] ? mapPendingManual(result.rows[0]) : null;
}

export async function createPendingManualCaptureIfFreeInTransaction(
  client: HuntOrchestrationDbClient,
  input: Omit<HuntPendingManualCaptureRecord, "createdAt">,
): Promise<"created" | "blocked_existing"> {
  const result = await client.query(
    `INSERT INTO pokenexus.hunt_pending_manual_captures (
       player_id, source_hunt_id, encounter_id, species_id, level, catch_rate, shiny,
       capture_evidence_json, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,transaction_timestamp())
     ON CONFLICT (player_id) DO NOTHING`,
    [
      input.playerId,
      input.sourceHuntId,
      encode(input.encounterId, "encounterId"),
      encode(input.speciesId, "speciesId"),
      input.level,
      input.catchRate,
      input.shiny,
      JSON.stringify(input.captureEvidenceJson),
    ],
  );
  return result.rowCount === 1 ? "created" : "blocked_existing";
}

export async function closePendingManualCaptureInTransaction(
  client: HuntOrchestrationDbClient,
  input: { readonly playerId: string; readonly sourceHuntId: string; readonly encounterId: string },
): Promise<boolean> {
  const result = await client.query(
    `DELETE FROM pokenexus.hunt_pending_manual_captures
      WHERE player_id = $1 AND source_hunt_id = $2 AND encounter_id = $3`,
    [input.playerId, input.sourceHuntId, encode(input.encounterId, "encounterId")],
  );
  return result.rowCount === 1;
}

export async function savePendingZoneSelectionInTransaction(
  client: HuntOrchestrationDbClient,
  input: {
    readonly playerId: string;
    readonly zoneId: string;
    readonly huntDefinitionId: string;
    readonly selectionJson: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO pokenexus.hunt_pending_zone_selections (
       player_id, zone_id, hunt_definition_id, selection_json, updated_at
     ) VALUES ($1,$2,$3,$4::jsonb,transaction_timestamp())
     ON CONFLICT (player_id, zone_id)
     DO UPDATE SET hunt_definition_id = EXCLUDED.hunt_definition_id,
                   selection_json = EXCLUDED.selection_json,
                   updated_at = EXCLUDED.updated_at`,
    [
      input.playerId,
      encode(input.zoneId, "zoneId"),
      encode(input.huntDefinitionId, "huntDefinitionId"),
      JSON.stringify(input.selectionJson),
    ],
  );
}

export async function loadPendingZoneSelection(
  client: HuntOrchestrationDbClient,
  input: { readonly playerId: string; readonly zoneId: string },
): Promise<{ readonly huntDefinitionId: string; readonly selectionJson: Record<string, unknown> } | null> {
  const result = await client.query<{ hunt_definition_id: Buffer; selection_json: Record<string, unknown> }>(
    `SELECT hunt_definition_id, selection_json
       FROM pokenexus.hunt_pending_zone_selections
      WHERE player_id = $1 AND zone_id = $2`,
    [input.playerId, encode(input.zoneId, "zoneId")],
  );
  return result.rows[0]
    ? { huntDefinitionId: decode(result.rows[0].hunt_definition_id), selectionJson: result.rows[0].selection_json }
    : null;
}

export async function deletePendingZoneSelectionInTransaction(
  client: HuntOrchestrationDbClient,
  input: { readonly playerId: string; readonly zoneId: string },
): Promise<void> {
  await client.query(
    `DELETE FROM pokenexus.hunt_pending_zone_selections WHERE player_id = $1 AND zone_id = $2`,
    [input.playerId, encode(input.zoneId, "zoneId")],
  );
}

export async function freezeEncounterBoundaryInTransaction(
  client: HuntOrchestrationDbClient,
  input: {
    readonly huntId: string;
    readonly encounterId: string;
    readonly encounterOrdinal: number;
    readonly completedLogicalTimeMs: number;
    readonly policyVersion: string | null;
    readonly rewardRngJson: Record<string, unknown>;
    readonly captureRngJson: Record<string, unknown> | null;
    readonly preRewardInventoryRowVersion: bigint | null;
    readonly automaticDisposition: "attempt" | "no_eligible_ball" | "disabled" | null;
    readonly selectedItemId: string | null;
    readonly automaticAttemptCorrelation: string | null;
    readonly manualDisposition: "created_pending" | "blocked_existing" | "not_applicable";
  },
): Promise<void> {
  await client.query(
    `INSERT INTO pokenexus.hunt_encounter_boundaries (
       hunt_id, encounter_id, encounter_ordinal, completed_logical_time_ms, policy_version,
       boundary_status, reward_rng_json, capture_rng_json, pre_reward_inventory_row_version,
       automatic_disposition, selected_item_id, automatic_attempt_correlation, manual_disposition, created_at
     ) VALUES ($1,$2,$3,$4,$5,'frozen',$6::jsonb,$7::jsonb,$8::bigint,$9,$10,$11,$12,transaction_timestamp())
     ON CONFLICT (hunt_id, encounter_id) DO NOTHING`,
    [
      input.huntId,
      encode(input.encounterId, "encounterId"),
      input.encounterOrdinal,
      input.completedLogicalTimeMs,
      input.policyVersion,
      JSON.stringify(input.rewardRngJson),
      input.captureRngJson === null ? null : JSON.stringify(input.captureRngJson),
      input.preRewardInventoryRowVersion?.toString() ?? null,
      input.automaticDisposition,
      input.selectedItemId === null ? null : encode(input.selectedItemId, "selectedItemId"),
      input.automaticAttemptCorrelation === null
        ? null
        : encode(input.automaticAttemptCorrelation, "automaticAttemptCorrelation"),
      input.manualDisposition,
    ],
  );
}

export async function freezeEncounterAutomaticDecisionInTransaction(
  client: HuntOrchestrationDbClient,
  input: {
    readonly huntId: string;
    readonly encounterId: string;
    readonly automaticDisposition: "attempt" | "no_eligible_ball" | "disabled";
    readonly selectedItemId: string | null;
    readonly automaticAttemptCorrelation: string | null;
    readonly preRewardInventoryRowVersion: bigint;
  },
): Promise<void> {
  await client.query(
    `UPDATE pokenexus.hunt_encounter_boundaries
        SET automatic_disposition = $3,
            selected_item_id = $4,
            automatic_attempt_correlation = $5,
            pre_reward_inventory_row_version = $6::bigint
      WHERE hunt_id = $1
        AND encounter_id = $2
        AND boundary_status = 'frozen'
        AND automatic_disposition IS NULL`,
    [
      input.huntId,
      encode(input.encounterId, "encounterId"),
      input.automaticDisposition,
      input.selectedItemId === null ? null : encode(input.selectedItemId, "selectedItemId"),
      input.automaticAttemptCorrelation === null
        ? null
        : encode(input.automaticAttemptCorrelation, "automaticAttemptCorrelation"),
      input.preRewardInventoryRowVersion.toString(),
    ],
  );
}

export async function recordEncounterAutomaticCaptureResultInTransaction(
  client: HuntOrchestrationDbClient,
  input: {
    readonly huntId: string;
    readonly encounterId: string;
    readonly success: boolean;
    readonly shiny: boolean;
  },
): Promise<void> {
  await client.query(
    `UPDATE pokenexus.hunt_encounter_boundaries
        SET automatic_capture_success = $3,
            automatic_capture_shiny = $4
      WHERE hunt_id = $1
        AND encounter_id = $2
        AND boundary_status = 'frozen'
        AND automatic_disposition = 'attempt'`,
    [input.huntId, encode(input.encounterId, "encounterId"), input.success, input.shiny],
  );
}

function mapEncounterBoundary(row: EncounterBoundaryRow): HuntEncounterBoundaryRecord {
  return {
    huntId: row.hunt_id,
    encounterId: decode(row.encounter_id),
    encounterOrdinal: Number(row.encounter_ordinal),
    completedLogicalTimeMs: Number(row.completed_logical_time_ms),
    policyVersion: row.policy_version,
    status: row.boundary_status,
    rewardRngJson: row.reward_rng_json,
    captureRngJson: row.capture_rng_json,
    preRewardInventoryRowVersion: row.pre_reward_inventory_row_version === null
      ? null
      : BigInt(row.pre_reward_inventory_row_version),
    rewardResolutionId: row.reward_resolution_id,
    automaticDisposition: row.automatic_disposition,
    selectedItemId: row.selected_item_id ? decode(row.selected_item_id) : null,
    automaticAttemptCorrelation: row.automatic_attempt_correlation
      ? decode(row.automatic_attempt_correlation)
      : null,
    automaticCaptureSuccess: row.automatic_capture_success,
    automaticCaptureShiny: row.automatic_capture_shiny,
    manualDisposition: row.manual_disposition,
  };
}

export async function loadEncounterBoundary(
  client: HuntOrchestrationDbClient,
  huntId: string,
  encounterId: string,
  forUpdate = false,
): Promise<HuntEncounterBoundaryRecord | null> {
  const result = await client.query<EncounterBoundaryRow>(
    `SELECT hunt_id, encounter_id, encounter_ordinal::text, completed_logical_time_ms::text,
            policy_version, boundary_status, reward_rng_json, capture_rng_json,
            pre_reward_inventory_row_version::text,
            reward_resolution_id, automatic_disposition, selected_item_id,
            automatic_attempt_correlation, automatic_capture_success, automatic_capture_shiny,
            manual_disposition
       FROM pokenexus.hunt_encounter_boundaries
      WHERE hunt_id = $1 AND encounter_id = $2${forUpdate ? " FOR UPDATE" : ""}`,
    [huntId, encode(encounterId, "encounterId")],
  );
  return result.rows[0] ? mapEncounterBoundary(result.rows[0]) : null;
}

export async function loadEarliestIncompleteEncounterBoundary(
  client: HuntOrchestrationDbClient,
  huntId: string,
  forUpdate = false,
): Promise<HuntEncounterBoundaryRecord | null> {
  const result = await client.query<EncounterBoundaryRow>(
    `SELECT hunt_id, encounter_id, encounter_ordinal::text, completed_logical_time_ms::text,
            policy_version, boundary_status, reward_rng_json, capture_rng_json,
            pre_reward_inventory_row_version::text,
            reward_resolution_id, automatic_disposition, selected_item_id,
            automatic_attempt_correlation, automatic_capture_success, automatic_capture_shiny,
            manual_disposition
       FROM pokenexus.hunt_encounter_boundaries
      WHERE hunt_id = $1 AND boundary_status <> 'committed'
      ORDER BY encounter_ordinal
      LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    [huntId],
  );
  return result.rows[0] ? mapEncounterBoundary(result.rows[0]) : null;
}

export async function markEncounterBoundaryStageInTransaction(
  client: HuntOrchestrationDbClient,
  input: {
    readonly huntId: string;
    readonly encounterId: string;
    readonly status: "capture_committed" | "reward_committed" | "committed";
    readonly rewardResolutionId?: string | null;
  },
): Promise<void> {
  await client.query(
    `UPDATE pokenexus.hunt_encounter_boundaries
        SET boundary_status = $3,
            reward_resolution_id = COALESCE($4, reward_resolution_id),
            committed_at = CASE WHEN $3 = 'committed' THEN transaction_timestamp() ELSE committed_at END
      WHERE hunt_id = $1 AND encounter_id = $2`,
    [
      input.huntId,
      encode(input.encounterId, "encounterId"),
      input.status,
      input.rewardResolutionId ?? null,
    ],
  );
}

export async function createHealingCommandInTransaction(
  client: HuntOrchestrationDbClient,
  input: Omit<HuntHealingCommandRecord, "status" | "resultReason" | "healedHp" | "resolvedAt">,
): Promise<void> {
  await client.query(
    `INSERT INTO pokenexus.hunt_healing_commands (
       command_id, player_id, source_hunt_id, item_id, target_pokemon_instance_id,
       item_rule_version, game_data_version, rules_version, submission_cutoff_logical_time_ms,
       submission_phase, submission_encounter_id, due_logical_time_ms, acceptance_sequence, heal_status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::bigint,'scheduled')`,
    [
      input.commandId,
      input.playerId,
      input.sourceHuntId,
      encode(input.itemId, "itemId"),
      input.targetPokemonInstanceId,
      encode(input.itemRuleVersion, "itemRuleVersion"),
      encode(input.gameDataVersion, "gameDataVersion"),
      encode(input.rulesVersion, "rulesVersion"),
      input.submissionCutoffLogicalTimeMs,
      input.submissionPhase,
      input.submissionEncounterId === null ? null : encode(input.submissionEncounterId, "submissionEncounterId"),
      input.dueLogicalTimeMs,
      input.acceptanceSequence.toString(),
    ],
  );
}

export async function loadHealingCommandByCommandId(
  client: HuntOrchestrationDbClient,
  commandId: string,
  forUpdate = false,
): Promise<HuntHealingCommandRecord | null> {
  const result = await client.query<HealRow>(
    `SELECT command_id, player_id, source_hunt_id, item_id, target_pokemon_instance_id,
            item_rule_version, game_data_version, rules_version,
            submission_cutoff_logical_time_ms::text, submission_phase, submission_encounter_id,
            due_logical_time_ms::text, acceptance_sequence::text, heal_status,
            result_reason, healed_hp, resolved_at
       FROM pokenexus.hunt_healing_commands
      WHERE command_id = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [commandId],
  );
  return result.rows[0] ? mapHeal(result.rows[0]) : null;
}

export async function classifyHealingCommandInTransaction(
  client: HuntOrchestrationDbClient,
  input: {
    readonly commandId: string;
    readonly submissionPhase: "battle" | "inter_battle";
    readonly submissionEncounterId: string | null;
    readonly dueLogicalTimeMs: number | null;
  },
): Promise<HuntHealingCommandRecord> {
  await client.query(
    `UPDATE pokenexus.hunt_healing_commands
        SET submission_phase = $2,
            submission_encounter_id = $3,
            due_logical_time_ms = $4
      WHERE command_id = $1 AND heal_status = 'scheduled' AND submission_phase IS NULL`,
    [
      input.commandId,
      input.submissionPhase,
      input.submissionEncounterId === null ? null : encode(input.submissionEncounterId, "submissionEncounterId"),
      input.dueLogicalTimeMs,
    ],
  );
  const classified = await loadHealingCommandByCommandId(client, input.commandId, true);
  if (!classified) throw new Error("Hunt healing command disappeared during classification");
  return classified;
}

export async function markHealingCommandsDueForEncounterInTransaction(
  client: HuntOrchestrationDbClient,
  input: {
    readonly huntId: string;
    readonly encounterId: string;
    readonly dueLogicalTimeMs: number;
  },
): Promise<void> {
  await client.query(
    `UPDATE pokenexus.hunt_healing_commands
        SET due_logical_time_ms = $3
      WHERE source_hunt_id = $1
        AND heal_status = 'scheduled'
        AND submission_phase = 'battle'
        AND submission_encounter_id = $2
        AND due_logical_time_ms IS NULL`,
    [input.huntId, encode(input.encounterId, "encounterId"), input.dueLogicalTimeMs],
  );
}

export async function loadEarliestDueHealingCommand(
  client: HuntOrchestrationDbClient,
  input: { readonly huntId: string; readonly logicalTimeMs: number },
  forUpdate = false,
): Promise<HuntHealingCommandRecord | null> {
  const result = await client.query<HealRow>(
    `SELECT command_id, player_id, source_hunt_id, item_id, target_pokemon_instance_id,
            item_rule_version, game_data_version, rules_version,
            submission_cutoff_logical_time_ms::text, submission_phase, submission_encounter_id,
            due_logical_time_ms::text, acceptance_sequence::text, heal_status,
            result_reason, healed_hp, resolved_at
       FROM pokenexus.hunt_healing_commands
      WHERE source_hunt_id = $1 AND heal_status = 'scheduled'
        AND due_logical_time_ms IS NOT NULL AND due_logical_time_ms <= $2
      ORDER BY due_logical_time_ms, acceptance_sequence
      LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    [input.huntId, input.logicalTimeMs],
  );
  return result.rows[0] ? mapHeal(result.rows[0]) : null;
}

export async function loadEarliestHealingAdvanceBlocker(
  client: HuntOrchestrationDbClient,
  input: { readonly huntId: string; readonly logicalTimeMs: number },
  forUpdate = false,
): Promise<HuntHealingCommandRecord | null> {
  const result = await client.query<HealRow>(
    `SELECT command_id, player_id, source_hunt_id, item_id, target_pokemon_instance_id,
            item_rule_version, game_data_version, rules_version,
            submission_cutoff_logical_time_ms::text, submission_phase, submission_encounter_id,
            due_logical_time_ms::text, acceptance_sequence::text, heal_status,
            result_reason, healed_hp, resolved_at
       FROM pokenexus.hunt_healing_commands
      WHERE source_hunt_id = $1 AND heal_status = 'scheduled'
        AND (
          (submission_phase IS NULL AND submission_cutoff_logical_time_ms <= $2)
          OR (due_logical_time_ms IS NOT NULL AND due_logical_time_ms <= $2)
        )
      ORDER BY CASE
                 WHEN submission_phase IS NULL THEN submission_cutoff_logical_time_ms
                 ELSE due_logical_time_ms
               END,
               acceptance_sequence
      LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    [input.huntId, input.logicalTimeMs],
  );
  return result.rows[0] ? mapHeal(result.rows[0]) : null;
}

export async function resolveHealingCommandInTransaction(
  client: HuntOrchestrationDbClient,
  input: {
    readonly commandId: string;
    readonly outcome: "applied" | "not_applied";
    readonly reason: HuntHealingCommandRecord["resultReason"];
    readonly healedHp: number;
  },
): Promise<void> {
  await client.query(
    `UPDATE pokenexus.hunt_healing_commands
        SET heal_status = $2, result_reason = $3, healed_hp = $4, resolved_at = transaction_timestamp()
      WHERE command_id = $1 AND heal_status = 'scheduled'`,
    [input.commandId, input.outcome, input.reason, input.healedHp],
  );
}

export async function cancelScheduledHealingCommandsForHuntInTransaction(
  client: HuntOrchestrationDbClient,
  huntId: string,
): Promise<void> {
  await client.query(
    `UPDATE pokenexus.hunt_healing_commands
        SET heal_status = 'not_applied', result_reason = 'hunt_terminal', healed_hp = 0,
            resolved_at = transaction_timestamp()
      WHERE source_hunt_id = $1 AND heal_status = 'scheduled'`,
    [huntId],
  );
}

export async function updatePublicCommandClaimEffectsInTransaction(
  client: HuntOrchestrationDbClient,
  commandId: string,
  claimEffects: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `UPDATE pokenexus.hunt_public_commands SET claim_effects = $2::jsonb
      WHERE command_id = $1 AND command_status = 'pending'`,
    [commandId, JSON.stringify(claimEffects)],
  );
}

export async function persistOwnedHuntCheckpointInTransaction(
  client: HuntOrchestrationDbClient,
  input: {
    readonly playerId: string;
    readonly checkpointId: string;
    readonly expectedRowVersion: bigint;
    readonly schemaVersion: string;
    readonly logicalTimeMs: number;
    readonly stateBytes: Uint8Array;
  },
): Promise<
  | { readonly status: "updated"; readonly rowVersion: bigint }
  | { readonly status: "stale"; readonly rowVersion: bigint; readonly logicalTimeMs: number }
  | { readonly status: "not_found" }
> {
  const locked = await client.query<{
    row_version: string;
    logical_time_ms: string;
    logical_time_anchor_at: Date;
  }>(
    `SELECT row_version::text, logical_time_ms::text, logical_time_anchor_at
       FROM pokenexus.hunt_checkpoints
      WHERE player_id = $1 AND checkpoint_id = $2
      FOR UPDATE`,
    [input.playerId, input.checkpointId],
  );
  const row = locked.rows[0];
  if (!row) return { status: "not_found" };
  const currentRowVersion = BigInt(row.row_version);
  const currentLogicalTimeMs = Number(row.logical_time_ms);
  if (currentRowVersion !== input.expectedRowVersion) {
    return { status: "stale", rowVersion: currentRowVersion, logicalTimeMs: currentLogicalTimeMs };
  }
  if (input.logicalTimeMs < currentLogicalTimeMs) {
    throw new Error("Hunt checkpoint logical time cannot move backward");
  }
  const nextAnchorMs = row.logical_time_anchor_at.getTime() + (input.logicalTimeMs - currentLogicalTimeMs);
  if (!Number.isSafeInteger(nextAnchorMs)) throw new Error("Hunt checkpoint logical-time anchor is out of range");
  const logicalTimeAnchorAt = new Date(nextAnchorMs);
  const updated = await client.query<{ row_version: string }>(
    `UPDATE pokenexus.hunt_checkpoints
        SET checkpoint_schema_version = $4,
            logical_time_ms = $5,
            checkpoint_state_bytes = $6,
            logical_time_anchor_at = $7,
            row_version = row_version + 1,
            updated_at = transaction_timestamp()
      WHERE player_id = $1 AND checkpoint_id = $2 AND row_version = $3::bigint
      RETURNING row_version::text`,
    [
      input.playerId,
      input.checkpointId,
      input.expectedRowVersion.toString(),
      encode(input.schemaVersion, "schemaVersion"),
      input.logicalTimeMs,
      Buffer.from(input.stateBytes),
      logicalTimeAnchorAt,
    ],
  );
  if (!updated.rows[0]) throw new Error("Locked Hunt checkpoint OCC update unexpectedly failed");
  return { status: "updated", rowVersion: BigInt(updated.rows[0].row_version) };
}
