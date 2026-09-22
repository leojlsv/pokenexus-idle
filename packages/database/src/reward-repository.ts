import type { Client } from "pg";
import { decodeOpaqueStringDbV1, encodeOpaqueStringDbV1 } from "./opaque-string-db-codec.js";
import { withTransaction } from "./transaction.js";
import { generateUuidV7 } from "./uuid-v7.js";
import { ITEM_QUANTITY_MAX } from "./inventory-repository.js";

export type RewardDbClient = Pick<Client, "query">;

export type RewardEffect =
  | { readonly kind: "pokemon_xp"; readonly pokemonInstanceId: string; readonly amount: bigint }
  | { readonly kind: "player_xp"; readonly playerId: string; readonly amount: bigint }
  | { readonly kind: "item_grant"; readonly itemId: string; readonly quantity: bigint };

export interface RewardResolutionEnvelope {
  readonly subjectPlayerId: string;
  readonly sourceAuthority: string;
  readonly sourceCorrelation: string;
  readonly rulesVersion: string | null;
  readonly gameDataVersion: string | null;
  readonly effects: readonly RewardEffect[];
}

export interface RewardCompletionRecord {
  readonly completionId: string;
  readonly completedAt: Date;
}

export interface RewardResolutionRecord extends RewardResolutionEnvelope {
  readonly resolutionId: string;
  readonly resolvedAt: Date;
  readonly completion: RewardCompletionRecord | null;
}

export class RewardResolutionConflictError extends Error {
  constructor() {
    super("RewardSourceKey already owns a different immutable Reward Resolution");
    this.name = "RewardResolutionConflictError";
  }
}

interface ResolutionRow {
  readonly resolution_id: string;
  readonly subject_player_id: string;
  readonly source_authority: Buffer;
  readonly source_correlation: Buffer;
  readonly rules_version: Buffer | null;
  readonly game_data_version: Buffer | null;
  readonly resolved_at: Date;
}

interface EffectRow {
  readonly effect_kind: RewardEffect["kind"];
  readonly pokemon_instance_id: string | null;
  readonly target_player_id: string | null;
  readonly item_id: Buffer | null;
  readonly xp_amount: string | null;
  readonly item_quantity: string | null;
}

interface CompletionRow { readonly completion_id: string; readonly completed_at: Date }

function encodeRequired(value: string, label: string): Buffer {
  if (value.length === 0) throw new Error(`${label} must be non-empty`);
  return Buffer.from(encodeOpaqueStringDbV1(value));
}

function decodeOptional(value: Buffer | null): string | null {
  return value === null ? null : decodeOpaqueStringDbV1(value);
}

function effectKey(effect: RewardEffect): string {
  switch (effect.kind) {
    case "pokemon_xp": return `0:${effect.pokemonInstanceId}`;
    case "player_xp": return `1:${effect.playerId}`;
    case "item_grant": return `2:${effect.itemId}`;
  }
}

function compareOpaqueStrings(left: string, right: string): number {
  const leftBytes = encodeOpaqueStringDbV1(left);
  const rightBytes = encodeOpaqueStringDbV1(right);
  const length = Math.min(leftBytes.byteLength, rightBytes.byteLength);
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return leftBytes[index] < rightBytes[index] ? -1 : 1;
  }
  return leftBytes.byteLength < rightBytes.byteLength ? -1 : leftBytes.byteLength > rightBytes.byteLength ? 1 : 0;
}

function compareEffects(left: RewardEffect, right: RewardEffect): number {
  const kindOrder = { pokemon_xp: 0, player_xp: 1, item_grant: 2 } as const;
  const kindDifference = kindOrder[left.kind] - kindOrder[right.kind];
  if (kindDifference !== 0) return kindDifference;
  const leftTarget = left.kind === "pokemon_xp"
    ? left.pokemonInstanceId
    : left.kind === "player_xp" ? left.playerId : left.itemId;
  const rightTarget = right.kind === "pokemon_xp"
    ? right.pokemonInstanceId
    : right.kind === "player_xp" ? right.playerId : right.itemId;
  return compareOpaqueStrings(leftTarget, rightTarget);
}

function normalizeEnvelope(input: RewardResolutionEnvelope): RewardResolutionEnvelope {
  encodeRequired(input.sourceAuthority, "sourceAuthority");
  encodeRequired(input.sourceCorrelation, "sourceCorrelation");
  if (input.rulesVersion !== null) encodeRequired(input.rulesVersion, "rulesVersion");
  if (input.gameDataVersion !== null) encodeRequired(input.gameDataVersion, "gameDataVersion");
  if (input.rulesVersion === null && input.gameDataVersion === null) {
    throw new Error("Reward Resolution requires pinned rulesVersion and/or gameDataVersion");
  }
  if (input.effects.length === 0) throw new Error("Reward Resolution requires at least one effect");
  if (
    input.rulesVersion === null
    && input.effects.some((effect) => effect.kind === "pokemon_xp" || effect.kind === "player_xp")
  ) {
    throw new Error("Reward XP effects require a pinned rulesVersion");
  }
  if (
    input.gameDataVersion === null
    && input.effects.some((effect) => effect.kind === "item_grant")
  ) {
    throw new Error("Reward Item effects require a pinned gameDataVersion");
  }

  const seen = new Set<string>();
  const effects = [...input.effects];
  for (const effect of effects) {
    const key = effectKey(effect);
    if (seen.has(key)) throw new Error(`duplicate logical Reward effect: ${key}`);
    seen.add(key);
    if (effect.kind === "pokemon_xp") {
      if (effect.pokemonInstanceId.length === 0 || effect.amount < 0n) {
        throw new Error("invalid Pokémon XP Reward effect");
      }
    } else if (effect.kind === "player_xp") {
      if (effect.playerId !== input.subjectPlayerId || effect.amount < 0n) {
        throw new Error("Player XP Reward effect must target the subject with non-negative XP");
      }
    } else {
      encodeRequired(effect.itemId, "ItemId");
      if (effect.quantity <= 0n || effect.quantity > ITEM_QUANTITY_MAX) {
        throw new Error("Item grant quantity is outside ItemQuantity domain");
      }
    }
  }
  effects.sort(compareEffects);
  return { ...input, effects };
}

function effectEquals(left: RewardEffect, right: RewardEffect): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "pokemon_xp" && right.kind === "pokemon_xp") {
    return left.pokemonInstanceId === right.pokemonInstanceId && left.amount === right.amount;
  }
  if (left.kind === "player_xp" && right.kind === "player_xp") {
    return left.playerId === right.playerId && left.amount === right.amount;
  }
  return left.kind === "item_grant" && right.kind === "item_grant"
    && left.itemId === right.itemId && left.quantity === right.quantity;
}

function sameEnvelope(stored: RewardResolutionRecord, proposed: RewardResolutionEnvelope): boolean {
  return stored.subjectPlayerId === proposed.subjectPlayerId
    && stored.sourceAuthority === proposed.sourceAuthority
    && stored.sourceCorrelation === proposed.sourceCorrelation
    && stored.rulesVersion === proposed.rulesVersion
    && stored.gameDataVersion === proposed.gameDataVersion
    && stored.effects.length === proposed.effects.length
    && stored.effects.every((effect, index) => effectEquals(effect, proposed.effects[index]));
}

async function loadEffects(client: RewardDbClient, resolutionId: string): Promise<readonly RewardEffect[]> {
  const result = await client.query<EffectRow>(
    `SELECT effect_kind, pokemon_instance_id, target_player_id, item_id,
            xp_amount::text, item_quantity::text
     FROM pokenexus.reward_resolution_effects
     WHERE resolution_id = $1
     ORDER BY effect_ordinal`,
    [resolutionId],
  );
  return result.rows.map((row): RewardEffect => {
    if (row.effect_kind === "pokemon_xp" && row.pokemon_instance_id && row.xp_amount !== null) {
      return { kind: "pokemon_xp", pokemonInstanceId: row.pokemon_instance_id, amount: BigInt(row.xp_amount) };
    }
    if (row.effect_kind === "player_xp" && row.target_player_id && row.xp_amount !== null) {
      return { kind: "player_xp", playerId: row.target_player_id, amount: BigInt(row.xp_amount) };
    }
    if (row.effect_kind === "item_grant" && row.item_id && row.item_quantity !== null) {
      return { kind: "item_grant", itemId: decodeOpaqueStringDbV1(row.item_id), quantity: BigInt(row.item_quantity) };
    }
    throw new Error("Persisted Reward effect has an invalid shape");
  });
}

async function loadCompletion(client: RewardDbClient, resolutionId: string): Promise<RewardCompletionRecord | null> {
  const result = await client.query<CompletionRow>(
    `SELECT completion_id, completed_at FROM pokenexus.reward_completions WHERE resolution_id = $1`,
    [resolutionId],
  );
  return result.rows[0]
    ? { completionId: result.rows[0].completion_id, completedAt: result.rows[0].completed_at }
    : null;
}

async function mapResolution(client: RewardDbClient, row: ResolutionRow): Promise<RewardResolutionRecord> {
  return {
    resolutionId: row.resolution_id,
    subjectPlayerId: row.subject_player_id,
    sourceAuthority: decodeOpaqueStringDbV1(row.source_authority),
    sourceCorrelation: decodeOpaqueStringDbV1(row.source_correlation),
    rulesVersion: decodeOptional(row.rules_version),
    gameDataVersion: decodeOptional(row.game_data_version),
    effects: await loadEffects(client, row.resolution_id),
    resolvedAt: row.resolved_at,
    completion: await loadCompletion(client, row.resolution_id),
  };
}

export async function loadRewardResolutionById(
  client: RewardDbClient,
  resolutionId: string,
  forUpdate = false,
): Promise<RewardResolutionRecord | null> {
  const result = await client.query<ResolutionRow>(
    `SELECT resolution_id, subject_player_id, source_authority, source_correlation,
            rules_version, game_data_version, resolved_at
     FROM pokenexus.reward_resolutions
     WHERE resolution_id = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [resolutionId],
  );
  return result.rows[0] ? mapResolution(client, result.rows[0]) : null;
}

export async function loadRewardResolutionBySourceKey(
  client: RewardDbClient,
  sourceKey: Pick<RewardResolutionEnvelope, "subjectPlayerId" | "sourceAuthority" | "sourceCorrelation">,
): Promise<RewardResolutionRecord | null> {
  const result = await client.query<ResolutionRow>(
    `SELECT resolution_id, subject_player_id, source_authority, source_correlation,
            rules_version, game_data_version, resolved_at
     FROM pokenexus.reward_resolutions
     WHERE subject_player_id = $1 AND source_authority = $2 AND source_correlation = $3`,
    [
      sourceKey.subjectPlayerId,
      encodeRequired(sourceKey.sourceAuthority, "sourceAuthority"),
      encodeRequired(sourceKey.sourceCorrelation, "sourceCorrelation"),
    ],
  );
  return result.rows[0] ? mapResolution(client, result.rows[0]) : null;
}

export async function claimRewardResolution(
  client: RewardDbClient,
  input: RewardResolutionEnvelope,
  options: {
    readonly now?: Date;
    readonly afterParentInserted?: () => Promise<void> | void;
  } = {},
): Promise<{ readonly status: "created" | "existing"; readonly resolution: RewardResolutionRecord }> {
  const envelope = normalizeEnvelope(input);
  return withTransaction(client, async (transaction) => {
    const resolutionId = generateUuidV7();
    const inserted = await transaction.query<ResolutionRow>(
      `INSERT INTO pokenexus.reward_resolutions (
         resolution_id, subject_player_id, source_authority, source_correlation,
         rules_version, game_data_version, resolved_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (subject_player_id, source_authority, source_correlation) DO NOTHING
       RETURNING resolution_id, subject_player_id, source_authority, source_correlation,
                 rules_version, game_data_version, resolved_at`,
      [
        resolutionId,
        envelope.subjectPlayerId,
        encodeRequired(envelope.sourceAuthority, "sourceAuthority"),
        encodeRequired(envelope.sourceCorrelation, "sourceCorrelation"),
        envelope.rulesVersion === null ? null : encodeRequired(envelope.rulesVersion, "rulesVersion"),
        envelope.gameDataVersion === null ? null : encodeRequired(envelope.gameDataVersion, "gameDataVersion"),
        options.now ?? new Date(),
      ],
    );

    if (inserted.rows[0]) {
      await options.afterParentInserted?.();
      for (let index = 0; index < envelope.effects.length; index += 1) {
        const effect = envelope.effects[index];
        await transaction.query(
          `INSERT INTO pokenexus.reward_resolution_effects (
             resolution_id, subject_player_id, effect_ordinal, effect_kind,
             pokemon_instance_id, target_player_id, item_id, xp_amount, item_quantity
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $9::bigint)`,
          [
            resolutionId,
            envelope.subjectPlayerId,
            index,
            effect.kind,
            effect.kind === "pokemon_xp" ? effect.pokemonInstanceId : null,
            effect.kind === "player_xp" ? effect.playerId : null,
            effect.kind === "item_grant" ? encodeRequired(effect.itemId, "ItemId") : null,
            effect.kind === "pokemon_xp" || effect.kind === "player_xp" ? effect.amount.toString() : null,
            effect.kind === "item_grant" ? effect.quantity.toString() : null,
          ],
        );
      }
      const created = await loadRewardResolutionById(transaction, resolutionId);
      if (!created) throw new Error("Created Reward Resolution was not readable inside its claim transaction");
      return { status: "created", resolution: created };
    }

    const existing = await loadRewardResolutionBySourceKey(transaction, envelope);
    if (!existing) throw new Error("Reward Resolution conflict winner was not observable");
    if (!sameEnvelope(existing, envelope)) throw new RewardResolutionConflictError();
    return { status: "existing", resolution: existing };
  });
}

export async function insertRewardCompletion(
  client: RewardDbClient,
  resolutionId: string,
  completedAt: Date,
): Promise<RewardCompletionRecord> {
  const completionId = generateUuidV7();
  const result = await client.query<CompletionRow>(
    `INSERT INTO pokenexus.reward_completions (completion_id, resolution_id, completed_at)
     VALUES ($1, $2, $3)
     RETURNING completion_id, completed_at`,
    [completionId, resolutionId, completedAt],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Reward Completion insert did not return a row");
  return { completionId: row.completion_id, completedAt: row.completed_at };
}
