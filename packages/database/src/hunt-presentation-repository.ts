import { createHash } from "node:crypto";
import type { Client } from "pg";

export type HuntPresentationDbClient = Pick<Client, "query">;

/** Raw CombatEvent bytes plus projected public CombatEvent bytes, per OCC publication. */
export const HUNT_PRESENTATION_SOURCE_EVENT_BATCH_BYTES_MAX = 1024 * 1024;

export interface HuntPresentationStreamAuthority {
  readonly huntId: string;
  readonly playerId: string;
  readonly inputSchemaVersion: string;
  readonly checkpointSchemaVersion: string;
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
  readonly sourceEventSchemaVersion: string;
  readonly presentationSchemaVersion:
    | "pokenexus.combat-presentation.v1"
    | "pokenexus.combat-presentation.v2";
}

export interface HuntPresentationStreamRecord {
  readonly huntId: string;
  readonly playerId: string;
  readonly status: "available" | "unavailable";
  readonly publishedEventIndex: bigint;
  readonly publicPrefixDigest: Uint8Array;
  readonly privatePrefixDigest: Uint8Array;
  readonly publicationGeneration: bigint;
  readonly committedLogicalTimeMs: number;
  readonly isTerminal: boolean;
  readonly presentationTerminalRecordedAt: Date | null;
  readonly inputSchemaVersion: string;
  readonly checkpointSchemaVersion: string;
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
  readonly sourceEventSchemaVersion: string;
  readonly presentationSchemaVersion: string;
}

export interface HuntPresentationBattleWrite {
  readonly encounterId: string;
  readonly encounterOrdinal: number;
  readonly battleId: string;
  readonly battleStartedAtHuntTimeMs: number;
  readonly initialSides: unknown;
  readonly initialParticipants: unknown;
  readonly privateOrigin: unknown;
  readonly continuationContext: unknown;
  readonly publicEvents: ReadonlyArray<{
    readonly sequence: number;
    readonly combatTimeMs: number;
    readonly publicEvent: unknown;
    readonly publicBytes: Uint8Array;
    readonly privateSourceBytes: Uint8Array;
  }>;
}

interface StreamRow {
  readonly hunt_id: string;
  readonly player_id: string;
  readonly status: "available" | "unavailable";
  readonly published_event_index: string;
  readonly public_prefix_digest: Buffer;
  readonly private_prefix_digest: Buffer;
  readonly publication_generation: string;
  readonly committed_logical_time_ms: string;
  readonly is_terminal: boolean;
  readonly presentation_terminal_recorded_at: Date | null;
  readonly input_schema_version: string;
  readonly checkpoint_schema_version: string;
  readonly game_data_version: string;
  readonly rules_version: string;
  readonly source_event_schema_version: string;
  readonly presentation_schema_version: string;
}

interface BattleRow {
  readonly encounter_ordinal: string;
  readonly encounter_id: string;
  readonly battle_id: string;
  readonly battle_started_at_hunt_time_ms: string;
  readonly initial_sides_json: unknown;
  readonly initial_participants_json: unknown;
  readonly public_header_digest: Buffer;
  readonly private_origin_digest: Buffer;
  readonly private_continuation_context_digest: Buffer;
}

function sha256(bytes: Uint8Array): Buffer {
  return createHash("sha256").update(bytes).digest();
}

export function canonicalPresentationJson(value: unknown): string {
  function normalize(entry: unknown): unknown {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry !== null && typeof entry === "object") {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>)
          .filter(([, child]) => child !== undefined)
          .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    if (typeof entry === "number" && !Number.isFinite(entry)) {
      throw new Error("Presentation bytes cannot encode non-finite number");
    }
    if (typeof entry === "bigint") {
      throw new Error("Presentation bytes cannot encode unversioned bigint");
    }
    return entry;
  }
  const text = JSON.stringify(normalize(value));
  if (text === undefined) throw new Error("Presentation provenance is not serializable");
  return text;
}

function serializePrivate(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalPresentationJson(value));
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

export function publicHeaderDigest({
  encounterId, encounterOrdinal, battleId, battleStartedAtHuntTimeMs, initialSides, initialParticipants,
}: {
  readonly encounterId: string;
  readonly encounterOrdinal: number;
  readonly battleId: string;
  readonly battleStartedAtHuntTimeMs: number;
  readonly initialSides: unknown;
  readonly initialParticipants: unknown;
}): Buffer {
  return createHash("sha256")
    .update("pokenexus.hunt-presentation.public-header.v1\0")
    .update(serializePrivate({
      encounterId, encounterOrdinal, battleId, battleStartedAtHuntTimeMs,
      initialSides, initialParticipants,
    }))
    .digest();
}

function mapStream(row: StreamRow): HuntPresentationStreamRecord {
  return {
    huntId: row.hunt_id,
    playerId: row.player_id,
    status: row.status,
    publishedEventIndex: BigInt(row.published_event_index),
    publicPrefixDigest: row.public_prefix_digest,
    privatePrefixDigest: row.private_prefix_digest,
    publicationGeneration: BigInt(row.publication_generation),
    committedLogicalTimeMs: Number(row.committed_logical_time_ms),
    isTerminal: row.is_terminal,
    presentationTerminalRecordedAt: row.presentation_terminal_recorded_at,
    inputSchemaVersion: row.input_schema_version,
    checkpointSchemaVersion: row.checkpoint_schema_version,
    gameDataVersion: row.game_data_version,
    rulesVersion: row.rules_version,
    sourceEventSchemaVersion: row.source_event_schema_version,
    presentationSchemaVersion: row.presentation_schema_version,
  };
}

export async function insertHuntPresentationStreamInTransaction(
  client: HuntPresentationDbClient,
  authority: HuntPresentationStreamAuthority,
): Promise<void> {
  await client.query(
    `INSERT INTO pokenexus.hunt_presentation_streams (
       hunt_id, player_id, input_schema_version, checkpoint_schema_version,
       game_data_version, rules_version, source_event_schema_version, presentation_schema_version
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      authority.huntId,
      authority.playerId,
      authority.inputSchemaVersion,
      authority.checkpointSchemaVersion,
      authority.gameDataVersion,
      authority.rulesVersion,
      authority.sourceEventSchemaVersion,
      authority.presentationSchemaVersion,
    ],
  );
}

export async function loadHuntPresentationStream(
  client: HuntPresentationDbClient,
  playerId: string,
  huntId: string,
  lock = false,
): Promise<HuntPresentationStreamRecord | null> {
  const found = await client.query<StreamRow>(
    `SELECT hunt_id, player_id, status, published_event_index::text,
       public_prefix_digest, private_prefix_digest,
       publication_generation::text, committed_logical_time_ms::text,
       is_terminal, presentation_terminal_recorded_at,
       input_schema_version, checkpoint_schema_version,
       game_data_version, rules_version, source_event_schema_version, presentation_schema_version
       FROM pokenexus.hunt_presentation_streams
      WHERE player_id = $1 AND hunt_id = $2
      ${lock ? "FOR UPDATE" : ""}`,
    [playerId, huntId],
  );
  return found.rows[0] ? mapStream(found.rows[0]) : null;
}

/** Producer-private only; never use this helper to construct a public GET. */
export async function loadHuntPresentationPrivateBattle(
  client: HuntPresentationDbClient,
  huntId: string,
  battleId: string,
): Promise<{
  readonly continuationContext: unknown;
  readonly initialSides: unknown;
  readonly initialParticipants: unknown;
  readonly contextValid: boolean;
} | null> {
  const found = await client.query<{
    readonly private_continuation_context_json: unknown;
    readonly initial_sides_json: unknown;
    readonly initial_participants_json: unknown;
    readonly private_continuation_context_digest: Buffer;
    readonly private_origin_digest: Buffer;
    readonly private_origin_json: unknown;
    readonly public_header_digest: Buffer;
    readonly battle_started_at_hunt_time_ms: string;
    readonly encounter_id: string;
    readonly encounter_ordinal: string;
    readonly event_index: string | null;
    readonly sequence: string | null;
    readonly combat_time_ms: string | null;
    readonly private_source_bytes: Buffer | null;
    readonly private_prefix_digest: Buffer | null;
    readonly previous_private_prefix_digest: Buffer | null;
    readonly input_schema_version: string;
    readonly checkpoint_schema_version: string;
    readonly presentation_schema_version: string;
    readonly game_data_version: string;
    readonly rules_version: string;
    readonly source_event_schema_version: string;
  }>(
    `SELECT b.private_continuation_context_json, b.private_continuation_context_digest,
            b.initial_sides_json, b.initial_participants_json, b.private_origin_digest,
            b.private_origin_json, b.public_header_digest, b.battle_started_at_hunt_time_ms::text,
            b.encounter_id, b.encounter_ordinal::text,
            e.event_index::text, e.sequence::text, e.combat_time_ms::text,
            e.private_source_bytes, e.private_prefix_digest,
            prior_event.private_prefix_digest AS previous_private_prefix_digest,
            s.input_schema_version, s.checkpoint_schema_version,
            s.presentation_schema_version, s.game_data_version,
            s.rules_version, s.source_event_schema_version
       FROM pokenexus.hunt_presentation_battles b
       JOIN pokenexus.hunt_presentation_streams s ON s.hunt_id = b.hunt_id
       LEFT JOIN LATERAL (
         SELECT event_index, sequence, combat_time_ms, private_source_bytes,
                private_prefix_digest
           FROM pokenexus.hunt_presentation_events
          WHERE hunt_id = b.hunt_id AND battle_id = b.battle_id
          ORDER BY sequence DESC LIMIT 1
       ) e ON true
       LEFT JOIN pokenexus.hunt_presentation_events prior_event
         ON prior_event.hunt_id = b.hunt_id AND prior_event.event_index = e.event_index - 1
      WHERE b.hunt_id = $1 AND b.battle_id = $2`,
    [huntId, battleId],
  );
  const row = found.rows[0];
  if (!row) return null;
  const context = row.private_continuation_context_json;
  const contextDigest = sha256(serializePrivate(context));
  const originValid = bytesEqual(sha256(serializePrivate(row.private_origin_json)), row.private_origin_digest);
  const headerValid = bytesEqual(
    publicHeaderDigest({
      encounterId: row.encounter_id,
      encounterOrdinal: Number(row.encounter_ordinal),
      battleId,
      battleStartedAtHuntTimeMs: Number(row.battle_started_at_hunt_time_ms),
      initialSides: row.initial_sides_json,
      initialParticipants: row.initial_participants_json,
    }),
    row.public_header_digest,
  );
  const contextFields = context !== null && typeof context === "object" && !Array.isArray(context)
    ? context as Record<string, unknown>
    : null;
  const prior = row.previous_private_prefix_digest ?? Buffer.alloc(32);
  const expectedPrefix = row.event_index && row.private_source_bytes
    ? privateDigestAfter(
        prior, BigInt(row.event_index), row.private_origin_digest,
        {
          inputSchemaVersion: row.input_schema_version,
          checkpointSchemaVersion: row.checkpoint_schema_version,
          presentationSchemaVersion: row.presentation_schema_version,
          gameDataVersion: row.game_data_version,
          rulesVersion: row.rules_version,
          sourceEventSchemaVersion: row.source_event_schema_version,
        },
        row.private_source_bytes, contextDigest, row.public_header_digest,
      )
    : null;
  const contextValid =
    originValid
    && headerValid
    && bytesEqual(contextDigest, row.private_continuation_context_digest)
    && contextFields?.battleId === battleId
    && contextFields.sourceCombatEventSchemaVersion === row.source_event_schema_version
    && row.sequence !== null
    && contextFields.lastSequence === Number(row.sequence)
    && row.combat_time_ms !== null
    && contextFields.lastCombatTimeMs === Number(row.combat_time_ms)
    && expectedPrefix !== null
    && row.private_prefix_digest !== null
    && bytesEqual(expectedPrefix, row.private_prefix_digest);
  return {
    continuationContext: row.private_continuation_context_json,
    initialSides: row.initial_sides_json,
    initialParticipants: row.initial_participants_json,
    contextValid,
  };
}

export async function advanceHuntPresentationLogicalWatermarkInTransaction(
  client: HuntPresentationDbClient,
  playerId: string,
  huntId: string,
  committedLogicalTimeMs: number,
): Promise<void> {
  const stream = await loadHuntPresentationStream(client, playerId, huntId, true);
  if (!stream || stream.status === "unavailable") return;
  if (committedLogicalTimeMs < stream.committedLogicalTimeMs) {
    throw new Error("Presentation committed logical time cannot move backward");
  }
  if (committedLogicalTimeMs === stream.committedLogicalTimeMs) return;
  if (!(await verifyHuntPresentationPrefix(client, stream))) {
    await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "stream_prefix_conflict");
    return;
  }
  await client.query(
    `UPDATE pokenexus.hunt_presentation_streams
        SET committed_logical_time_ms = $3,
            publication_generation = publication_generation + 1
      WHERE hunt_id = $1 AND player_id = $2 AND status = 'available' AND is_terminal = false`,
    [huntId, playerId, committedLogicalTimeMs],
  );
}

export async function markHuntPresentationUnavailableInTransaction(
  client: HuntPresentationDbClient,
  playerId: string,
  huntId: string,
  reason: string,
): Promise<void> {
  if (!/^[a-z][a-z0-9_]{0,127}$/u.test(reason)) {
    throw new Error("Presentation unavailable reason must be a bounded private code");
  }
  await client.query(
    `UPDATE pokenexus.hunt_presentation_streams
        SET status = 'unavailable',
            unavailable_reason = COALESCE(unavailable_reason, $3),
            publication_generation = publication_generation + 1
      WHERE hunt_id = $1 AND player_id = $2 AND status = 'available'`,
    [huntId, playerId, reason],
  );
}

export function digestAfter(
  previous: Uint8Array,
  eventIndex: bigint,
  canonicalPublicBytes: Uint8Array,
  headerDigest: Uint8Array,
): Buffer {
  return createHash("sha256")
    .update("pokenexus.hunt-presentation.public-prefix.v1\0")
    .update(previous)
    .update(eventIndex.toString(10))
    .update("\0")
    .update(headerDigest)
    .update(canonicalPublicBytes)
    .digest();
}

function privateDigestAfter(
  previous: Uint8Array,
  eventIndex: bigint,
  originDigest: Uint8Array,
  stream: Pick<HuntPresentationStreamRecord,
    "inputSchemaVersion" | "checkpointSchemaVersion" | "presentationSchemaVersion"
    | "gameDataVersion" | "rulesVersion" | "sourceEventSchemaVersion">,
  rawSourceBytes: Uint8Array,
  contextDigest: Uint8Array,
  headerDigest: Uint8Array,
): Buffer {
  return createHash("sha256")
    .update("pokenexus.hunt-presentation.private-prefix.v1\0")
    .update(previous)
    .update(eventIndex.toString(10))
    .update("\0")
    .update(stream.inputSchemaVersion)
    .update("\0")
    .update(stream.checkpointSchemaVersion)
    .update("\0")
    .update(stream.presentationSchemaVersion)
    .update("\0")
    .update(stream.gameDataVersion)
    .update("\0")
    .update(stream.rulesVersion)
    .update("\0")
    .update(stream.sourceEventSchemaVersion)
    .update("\0")
    .update(originDigest)
    .update(headerDigest)
    .update(rawSourceBytes)
    .update(contextDigest)
    .digest();
}

async function verifyHuntPresentationPrefix(
  client: HuntPresentationDbClient,
  stream: HuntPresentationStreamRecord,
): Promise<boolean> {
  const found = await client.query<{
    readonly event_index: string;
    readonly sequence: string;
    readonly combat_time_ms: string;
    readonly public_event_json: unknown;
    readonly public_event_bytes: Buffer;
    readonly private_source_bytes: Buffer;
    readonly private_source_digest: Buffer;
    readonly public_prefix_digest: Buffer;
    readonly private_prefix_digest: Buffer;
    readonly previous_public_prefix_digest: Buffer | null;
    readonly previous_private_prefix_digest: Buffer | null;
    readonly battle_id: string;
    readonly encounter_id: string;
    readonly encounter_ordinal: string;
    readonly battle_started_at_hunt_time_ms: string;
    readonly initial_sides_json: unknown;
    readonly initial_participants_json: unknown;
    readonly public_header_digest: Buffer;
    readonly private_origin_json: unknown;
    readonly private_origin_digest: Buffer;
    readonly private_continuation_context_json: unknown;
    readonly private_continuation_context_digest: Buffer;
  }>(
    `SELECT e.event_index::text, e.sequence::text, e.combat_time_ms::text,
            e.public_event_json, e.public_event_bytes, e.private_source_bytes,
            e.private_source_digest, e.public_prefix_digest, e.private_prefix_digest,
            prior_event.public_prefix_digest AS previous_public_prefix_digest,
            prior_event.private_prefix_digest AS previous_private_prefix_digest,
            b.battle_id, b.encounter_id, b.encounter_ordinal::text,
            b.battle_started_at_hunt_time_ms::text,
            b.initial_sides_json, b.initial_participants_json, b.public_header_digest,
            b.private_origin_json, b.private_origin_digest,
            b.private_continuation_context_json, b.private_continuation_context_digest
       FROM pokenexus.hunt_presentation_events e
       JOIN pokenexus.hunt_presentation_battles b
         ON b.hunt_id = e.hunt_id AND b.battle_id = e.battle_id
       LEFT JOIN pokenexus.hunt_presentation_events prior_event
         ON prior_event.hunt_id = e.hunt_id AND prior_event.event_index = e.event_index - 1
      WHERE e.hunt_id = $1 ORDER BY e.event_index DESC LIMIT 1`,
    [stream.huntId],
  );
  const row = found.rows[0];
  if (stream.publishedEventIndex === 0n) {
    return row === undefined
      && bytesEqual(stream.publicPrefixDigest, Buffer.alloc(32))
      && bytesEqual(stream.privatePrefixDigest, Buffer.alloc(32));
  }
  if (!row || BigInt(row.event_index) !== stream.publishedEventIndex) return false;
  const priorIndex = BigInt(row.event_index) - 1n;
  if (priorIndex > 0n
    && (!row.previous_public_prefix_digest || !row.previous_private_prefix_digest)) {
    return false;
  }
  if (priorIndex === 0n
    && (row.previous_public_prefix_digest || row.previous_private_prefix_digest)) {
    return false;
  }
  const originDigest = sha256(serializePrivate(row.private_origin_json));
  const headerDigest = publicHeaderDigest({
    encounterId: row.encounter_id,
    encounterOrdinal: Number(row.encounter_ordinal),
    battleId: row.battle_id,
    battleStartedAtHuntTimeMs: Number(row.battle_started_at_hunt_time_ms),
    initialSides: row.initial_sides_json,
    initialParticipants: row.initial_participants_json,
  });
  const context = row.private_continuation_context_json;
  const contextFields = context !== null && typeof context === "object" && !Array.isArray(context)
    ? context as Record<string, unknown>
    : null;
  const contextDigest = sha256(serializePrivate(context));
  if (
    !bytesEqual(originDigest, row.private_origin_digest)
    || !bytesEqual(headerDigest, row.public_header_digest)
    || !bytesEqual(contextDigest, row.private_continuation_context_digest)
    || !bytesEqual(sha256(row.private_source_bytes), row.private_source_digest)
    || !bytesEqual(serializePrivate(row.public_event_json), row.public_event_bytes)
    || contextFields?.battleId !== row.battle_id
    || contextFields?.sourceCombatEventSchemaVersion !== stream.sourceEventSchemaVersion
    || contextFields?.lastSequence !== Number(row.sequence)
    || contextFields?.lastCombatTimeMs !== Number(row.combat_time_ms)
  ) return false;
  const priorPublic = row.previous_public_prefix_digest ?? Buffer.alloc(32);
  const priorPrivate = row.previous_private_prefix_digest ?? Buffer.alloc(32);
  const expectedPublic = digestAfter(
    priorPublic, stream.publishedEventIndex, row.public_event_bytes, headerDigest,
  );
  const expectedPrivate = privateDigestAfter(
    priorPrivate, stream.publishedEventIndex, originDigest, stream, row.private_source_bytes,
    contextDigest, headerDigest,
  );
  return bytesEqual(expectedPublic, row.public_prefix_digest)
    && bytesEqual(expectedPublic, stream.publicPrefixDigest)
    && bytesEqual(expectedPrivate, row.private_prefix_digest)
    && bytesEqual(expectedPrivate, stream.privatePrefixDigest);
}

/**
 * Must run inside the same Player/Hunt-serialized SQL transaction as a successful
 * Start or checkpoint OCC update. Callers project genuine engine events first.
 */
export async function appendHuntPresentationBattleInTransaction(
  client: HuntPresentationDbClient,
  playerId: string,
  huntId: string,
  battle: HuntPresentationBattleWrite,
  committedLogicalTimeMs: number,
): Promise<"appended" | "unavailable"> {
  const stream = await loadHuntPresentationStream(client, playerId, huntId, true);
  if (!stream) throw new Error("Hunt presentation stream is absent from a version-3 Hunt");
  if (stream.status === "unavailable") return "unavailable";
  if (stream.isTerminal) throw new Error("Cannot append events after sealed terminal presentation");
  if (committedLogicalTimeMs < stream.committedLogicalTimeMs) {
    throw new Error("Presentation logical time would move backward");
  }
  if (!(await verifyHuntPresentationPrefix(client, stream))) {
    await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "stream_prefix_conflict");
    return "unavailable";
  }
  if (
    battle.publicEvents.length > 128
    || battle.publicEvents.reduce((bytes, event) =>
      bytes + event.publicBytes.byteLength + event.privateSourceBytes.byteLength, 0)
      > HUNT_PRESENTATION_SOURCE_EVENT_BATCH_BYTES_MAX
  ) {
    await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "oversized_projection_batch");
    return "unavailable";
  }
  const privateOriginBytes = serializePrivate(battle.privateOrigin);
  if (privateOriginBytes.byteLength > 256 * 1024) {
    await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "oversized_private_origin");
    return "unavailable";
  }
  const privateOriginDigest = sha256(privateOriginBytes);
  const canonicalContext = serializePrivate(battle.continuationContext);
  if (canonicalContext.byteLength > 64 * 1024) {
    await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "oversized_private_context");
    return "unavailable";
  }
  const contextDigest = sha256(canonicalContext);
  const context = battle.continuationContext;
  const last = battle.publicEvents.at(-1);
  if (
    context === null || typeof context !== "object" || Array.isArray(context)
    || !last
    || (context as Record<string, unknown>).battleId !== battle.battleId
    || (context as Record<string, unknown>).sourceCombatEventSchemaVersion !== stream.sourceEventSchemaVersion
    || (context as Record<string, unknown>).lastSequence !== last.sequence
    || (context as Record<string, unknown>).lastCombatTimeMs !== last.combatTimeMs
  ) {
    await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "private_context_source_mismatch");
    return "unavailable";
  }
  const publicSidesBytes = serializePrivate(battle.initialSides);
  const publicParticipantsBytes = serializePrivate(battle.initialParticipants);
  const headerDigest = publicHeaderDigest(battle);
  if (publicSidesBytes.byteLength + publicParticipantsBytes.byteLength > 128 * 1024) {
    await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "oversized_battle_header");
    return "unavailable";
  }
  // A single HTTP bootstrap must include its original header AND BattleStarted.
  // The metadata reserve prevents publishing an indivisible event which cannot
  // fit in SPEC-017's complete 256-KiB JSON response ceiling.
  const responseBodyCeiling = 256 * 1024;
  const responseMetadataReserve = 8 * 1024;
  if (
    battle.publicEvents[0]?.sequence === 1
    && (
      publicSidesBytes.byteLength
      + publicParticipantsBytes.byteLength
      + battle.publicEvents[0].publicBytes.byteLength
      + responseMetadataReserve > responseBodyCeiling
    )
  ) {
    await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "oversized_public_bootstrap");
    return "unavailable";
  }
  const existingBattle = await client.query<BattleRow>(
    `SELECT encounter_ordinal::text, encounter_id, battle_id,
            battle_started_at_hunt_time_ms::text,
            initial_sides_json, initial_participants_json,
            public_header_digest,
            private_origin_digest, private_continuation_context_digest
       FROM pokenexus.hunt_presentation_battles
      WHERE hunt_id = $1 AND (
        encounter_ordinal = $2::bigint OR encounter_id = $3 OR battle_id = $4
      )`,
    [huntId, battle.encounterOrdinal, battle.encounterId, battle.battleId],
  );
  if (existingBattle.rows.length > 1) {
    await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "battle_identity_conflict");
    return "unavailable";
  }
  const header = existingBattle.rows[0];
  if (header) {
    if (
      BigInt(header.encounter_ordinal) !== BigInt(battle.encounterOrdinal)
      || header.encounter_id !== battle.encounterId
      || header.battle_id !== battle.battleId
      || BigInt(header.battle_started_at_hunt_time_ms) !== BigInt(battle.battleStartedAtHuntTimeMs)
      || !bytesEqual(header.private_origin_digest, privateOriginDigest)
      || !bytesEqual(header.public_header_digest, headerDigest)
      || canonicalPresentationJson(header.initial_sides_json) !== canonicalPresentationJson(battle.initialSides)
      || canonicalPresentationJson(header.initial_participants_json) !== canonicalPresentationJson(battle.initialParticipants)
    ) {
      await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "battle_source_conflict");
      return "unavailable";
    }
  } else {
    if (battle.publicEvents[0]?.sequence !== 1) {
      await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "missing_battle_bootstrap");
      return "unavailable";
    }
    const previous = await client.query<{
      readonly encounter_ordinal: string;
      readonly battle_id: string;
    }>(
      `SELECT b.encounter_ordinal::text, b.battle_id
         FROM pokenexus.hunt_presentation_battles b
        WHERE b.hunt_id = $1 ORDER BY b.encounter_ordinal DESC LIMIT 1`,
      [huntId],
    );
    const prior = previous.rows[0];
    if (
      (prior === undefined && battle.encounterOrdinal !== 1)
      || (prior !== undefined && BigInt(prior.encounter_ordinal) + 1n !== BigInt(battle.encounterOrdinal))
    ) {
      await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "encounter_ordinal_gap");
      return "unavailable";
    }
    if (prior) {
      const last = await client.query<{ readonly private_source_bytes: Buffer }>(
        `SELECT private_source_bytes FROM pokenexus.hunt_presentation_events
          WHERE hunt_id = $1 AND battle_id = $2 ORDER BY sequence DESC LIMIT 1`,
        [huntId, prior.battle_id],
      );
      let kind: unknown;
      try {
        kind = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
          last.rows[0]?.private_source_bytes ?? new Uint8Array(),
        )).kind;
      } catch {
        kind = undefined;
      }
      if (kind !== "BattleEnded") {
        await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "previous_battle_incomplete");
        return "unavailable";
      }
    }
    await client.query(
      `INSERT INTO pokenexus.hunt_presentation_battles (
        hunt_id, encounter_ordinal, encounter_id, battle_id,
        battle_started_at_hunt_time_ms, initial_sides_json, initial_participants_json,
        public_header_digest,
        private_origin_json, private_continuation_context_json,
        private_origin_digest, private_continuation_context_digest
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10::jsonb,$11,$12)`,
      [
        huntId, battle.encounterOrdinal, battle.encounterId, battle.battleId,
        battle.battleStartedAtHuntTimeMs, canonicalPresentationJson(battle.initialSides),
        canonicalPresentationJson(battle.initialParticipants), headerDigest,
        canonicalPresentationJson(battle.privateOrigin),
        canonicalPresentationJson(battle.continuationContext), privateOriginDigest, contextDigest,
      ],
    );
  }
  let eventIndex = stream.publishedEventIndex;
  let prefixDigest: Uint8Array = Buffer.from(stream.publicPrefixDigest);
  let privatePrefixDigest: Uint8Array = Buffer.from(stream.privatePrefixDigest);
  let appended = 0;
  const newestInHunt = await client.query<{
    readonly battle_id: string;
    readonly private_source_bytes: Buffer;
  }>(
    `SELECT battle_id, private_source_bytes
       FROM pokenexus.hunt_presentation_events
      WHERE hunt_id = $1 ORDER BY event_index DESC LIMIT 1`,
    [huntId],
  );
  const huntTail = newestInHunt.rows[0];
  let huntTailKind: unknown;
  let huntTailBattleId = huntTail?.battle_id;
  if (huntTail) {
    try {
      huntTailKind = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(huntTail.private_source_bytes),
      ).kind;
    } catch {
      await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "invalid_hunt_tail_source");
      return "unavailable";
    }
  }
  const newestInBattle = await client.query<{ sequence: string }>(
    `SELECT e.sequence::text FROM pokenexus.hunt_presentation_events e
      WHERE e.hunt_id = $1 AND e.battle_id = $2
      ORDER BY e.sequence DESC LIMIT 1`,
    [huntId, battle.battleId],
  );
  let lastSequence = newestInBattle.rows[0] ? Number(newestInBattle.rows[0].sequence) : 0;
  for (const event of battle.publicEvents) {
    if (!bytesEqual(new TextEncoder().encode(canonicalPresentationJson(event.publicEvent)), event.publicBytes)) {
      await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "public_bytes_mismatch");
      return "unavailable";
    }
    const already = await client.query<{
      readonly public_event_bytes: Buffer;
      readonly private_source_bytes: Buffer;
      readonly private_source_digest: Buffer;
      readonly public_event_json: unknown;
    }>(
      `SELECT public_event_bytes, private_source_bytes,
              private_source_digest, public_event_json
         FROM pokenexus.hunt_presentation_events
        WHERE hunt_id = $1 AND battle_id = $2 AND sequence = $3`,
      [huntId, battle.battleId, event.sequence],
    );
    if (already.rows[0]) {
      if (
        !bytesEqual(already.rows[0].public_event_bytes, event.publicBytes)
        || !bytesEqual(already.rows[0].private_source_bytes, event.privateSourceBytes)
        || !bytesEqual(already.rows[0].private_source_digest, sha256(event.privateSourceBytes))
        || canonicalPresentationJson(already.rows[0].public_event_json) !== canonicalPresentationJson(event.publicEvent)
      ) {
        await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "source_replay_conflict");
        return "unavailable";
      }
      continue;
    }
    if (
      (header || appended > 0)
      && (huntTailBattleId !== battle.battleId || huntTailKind === "BattleEnded")
    ) {
      await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "closed_battle_reopened");
      return "unavailable";
    }
    if (event.sequence !== lastSequence + 1) {
      await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "source_sequence_gap");
      return "unavailable";
    }
    if (
      event.publicBytes.byteLength + responseMetadataReserve > responseBodyCeiling
      || event.privateSourceBytes.byteLength > 1024 * 1024
    ) {
      await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "oversized_event");
      return "unavailable";
    }
    let raw: { kind?: unknown; sequence?: unknown; combatTimeMs?: unknown; battleId?: unknown } | null;
    try {
      raw = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(event.privateSourceBytes),
      );
    } catch {
      raw = null;
    }
    if (
      !raw || typeof raw.kind !== "string" || raw.sequence !== event.sequence
      || raw.combatTimeMs !== event.combatTimeMs
      || (!header && appended === 0 && (raw.kind !== "BattleStarted" || raw.battleId !== battle.battleId))
    ) {
      await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "invalid_source_event_identity");
      return "unavailable";
    }
    eventIndex += 1n;
    prefixDigest = digestAfter(prefixDigest, eventIndex, event.publicBytes, headerDigest);
    const eventContextDigest = sha256(serializePrivate({
      ...(context as Record<string, unknown>),
      lastSequence: event.sequence,
      lastCombatTimeMs: event.combatTimeMs,
    }));
    privatePrefixDigest = privateDigestAfter(
      privatePrefixDigest, eventIndex, privateOriginDigest, stream, event.privateSourceBytes,
      eventContextDigest, headerDigest,
    );
    await client.query(
      `INSERT INTO pokenexus.hunt_presentation_events (
        hunt_id, event_index, battle_id, sequence, combat_time_ms,
        public_event_json, public_event_bytes, private_source_bytes,
        private_source_digest, private_prefix_digest, public_prefix_digest
      ) VALUES ($1,$2::bigint,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)`,
      [
        huntId, eventIndex.toString(), battle.battleId, event.sequence, event.combatTimeMs,
        canonicalPresentationJson(event.publicEvent), Buffer.from(event.publicBytes),
        Buffer.from(event.privateSourceBytes), sha256(event.privateSourceBytes),
        privatePrefixDigest, prefixDigest,
      ],
    );
    appended += 1;
    lastSequence = event.sequence;
    huntTailKind = raw.kind;
    huntTailBattleId = battle.battleId;
  }
  if (appended > 0) {
    await client.query(
      `UPDATE pokenexus.hunt_presentation_battles
          SET private_continuation_context_json = $3::jsonb,
              private_continuation_context_digest = $4
        WHERE hunt_id = $1 AND battle_id = $2`,
      [huntId, battle.battleId, canonicalPresentationJson(battle.continuationContext), contextDigest],
    );
  }
  if (appended > 0 || committedLogicalTimeMs !== stream.committedLogicalTimeMs) {
    await client.query(
      `UPDATE pokenexus.hunt_presentation_streams
          SET published_event_index = $3::bigint, public_prefix_digest = $4,
              private_prefix_digest = $5, committed_logical_time_ms = $6,
              publication_generation = publication_generation + 1
        WHERE hunt_id = $1 AND player_id = $2 AND status = 'available'`,
      [huntId, playerId, eventIndex.toString(), prefixDigest, privatePrefixDigest, committedLogicalTimeMs],
    );
  }
  return "appended";
}

export async function sealHuntPresentationTerminalInTransaction(
  client: HuntPresentationDbClient,
  playerId: string,
  huntId: string,
  expectedLogicalTimeMs: number,
  presentationTerminalRecordedAt: string,
  proof: {
    readonly encounterOrdinal: number;
    readonly battleId: string;
    readonly terminalEventSequence: number;
    readonly requireBattleEnded: boolean;
  } | null,
): Promise<void> {
  const stream = await loadHuntPresentationStream(client, playerId, huntId, true);
  if (!stream) throw new Error("Terminal presentation-enabled Hunt has no durable presentation stream");
  if (stream.isTerminal) return;
  const anchored = stream.status === "available"
    && await verifyHuntPresentationPrefix(client, stream);
  if (stream.status === "available" && !anchored) {
    await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "stream_prefix_conflict");
  }
  let prefixProven = false;
  if (
    anchored
    && proof
    && stream.publishedEventIndex > 0n
    && stream.committedLogicalTimeMs === expectedLogicalTimeMs
  ) {
    // An indexed, constant-size source highwater proof. A preceding publisher
    // checks all Battle sequence gaps before moving the stream's watermark.
    const indexed = await client.query<{
      readonly public_prefix_digest: Buffer;
      readonly private_prefix_digest: Buffer;
      readonly private_source_digest: Buffer;
      readonly encounter_ordinal: string;
      readonly battle_id: string;
      readonly sequence: string;
      readonly private_source_bytes: Buffer;
    }>(
      `SELECT e.public_prefix_digest, e.private_prefix_digest,
              e.private_source_digest, b.encounter_ordinal::text, e.battle_id,
              e.sequence::text, e.private_source_bytes
         FROM pokenexus.hunt_presentation_events e
         JOIN pokenexus.hunt_presentation_battles b
           ON b.hunt_id = e.hunt_id AND b.battle_id = e.battle_id
        WHERE e.hunt_id = $1 AND e.event_index = $2::bigint`,
      [huntId, stream.publishedEventIndex.toString()],
    );
    const row = indexed.rows[0];
    if (row) {
      let lastSource: { kind?: unknown; sequence?: unknown; battleId?: unknown } | null;
      try {
        lastSource = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(row.private_source_bytes));
      } catch {
        lastSource = null;
      }
      prefixProven =
        bytesEqual(row.public_prefix_digest, stream.publicPrefixDigest)
        && bytesEqual(row.private_prefix_digest, stream.privatePrefixDigest)
        && bytesEqual(row.private_source_digest, sha256(row.private_source_bytes))
        && BigInt(row.encounter_ordinal) === BigInt(proof.encounterOrdinal)
        && row.battle_id === proof.battleId
        && BigInt(row.sequence) === BigInt(proof.terminalEventSequence)
        && lastSource?.sequence === proof.terminalEventSequence
        && (!proof.requireBattleEnded || lastSource?.kind === "BattleEnded");
    }
  }
  if (stream.status === "available" && anchored && !prefixProven) {
    await markHuntPresentationUnavailableInTransaction(client, playerId, huntId, "terminal_prefix_unproven");
  }
  await client.query(
    `UPDATE pokenexus.hunt_presentation_streams
        SET is_terminal = true,
            presentation_terminal_recorded_at = $3::timestamptz,
            publication_generation = publication_generation + 1
      WHERE hunt_id = $1 AND player_id = $2 AND is_terminal = false`,
    [huntId, playerId, presentationTerminalRecordedAt],
  );
}
