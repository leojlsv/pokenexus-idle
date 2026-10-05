import type {
  HuntPresentationDbClient,
  HuntPresentationStreamRecord,
} from "./hunt-presentation-repository.js";
import {
  canonicalPresentationJson,
  digestAfter,
  publicHeaderDigest,
} from "./hunt-presentation-repository.js";

const MAX_PAGE_EVENTS = 128;
const MAX_HEADER_COUNT = 4;
const MAX_PUBLIC_BYTES = 256 * 1024;
const MAX_BATTLE_HEADER_BYTES = 128 * 1024;
const SIGNED_BIGINT_MAX = 9_223_372_036_854_775_807n;

export type HuntPresentationPublicStreamRecord = Omit<
  HuntPresentationStreamRecord, "privatePrefixDigest" | "presentationTerminalRecordedAt"
> & {
  /** Ceil of the exact PostgreSQL terminal instant in UTC epoch milliseconds. */
  readonly presentationTerminalRecordedAtCeilMs: bigint | null;
};

/** Public GET metadata: never fetch the writer's private source commitment. */
export async function loadHuntPresentationPublicStream(
  client: HuntPresentationDbClient,
  playerId: string,
  huntId: string,
): Promise<HuntPresentationPublicStreamRecord | null> {
  const found = await client.query<{
    hunt_id: string;
    player_id: string;
    status: "available" | "unavailable";
    published_event_index: string;
    public_prefix_digest: Buffer;
    publication_generation: string;
    committed_logical_time_ms: string;
    is_terminal: boolean;
    presentation_terminal_recorded_at_ceil_ms: string | null;
    input_schema_version: string;
    checkpoint_schema_version: string;
    game_data_version: string;
    rules_version: string;
    source_event_schema_version: string;
    presentation_schema_version: string;
  }>(
    `SELECT hunt_id, player_id, status, published_event_index::text,
            public_prefix_digest, publication_generation::text,
            committed_logical_time_ms::text, is_terminal,
            CEIL(EXTRACT(EPOCH FROM s.presentation_terminal_recorded_at) * 1000)::bigint::text
              AS presentation_terminal_recorded_at_ceil_ms, input_schema_version,
            checkpoint_schema_version, game_data_version, rules_version,
            source_event_schema_version, presentation_schema_version
       FROM pokenexus.hunt_presentation_streams s
      WHERE s.player_id = $1 AND s.hunt_id = $2`,
    [playerId, huntId],
  );
  const row = found.rows[0];
  return row ? {
    huntId: row.hunt_id,
    playerId: row.player_id,
    status: row.status,
    publishedEventIndex: BigInt(row.published_event_index),
    publicPrefixDigest: row.public_prefix_digest,
    publicationGeneration: BigInt(row.publication_generation),
    committedLogicalTimeMs: Number(row.committed_logical_time_ms),
    isTerminal: row.is_terminal,
    presentationTerminalRecordedAtCeilMs: row.presentation_terminal_recorded_at_ceil_ms === null
      ? null : BigInt(row.presentation_terminal_recorded_at_ceil_ms),
    inputSchemaVersion: row.input_schema_version,
    checkpointSchemaVersion: row.checkpoint_schema_version,
    gameDataVersion: row.game_data_version,
    rulesVersion: row.rules_version,
    sourceEventSchemaVersion: row.source_event_schema_version,
    presentationSchemaVersion: row.presentation_schema_version,
  } : null;
}

export class HuntPresentationPublicProofError extends Error {
  constructor() {
    super("Hunt presentation indexed public proof could not be validated");
    this.name = "HuntPresentationPublicProofError";
  }
}

export interface HuntPresentationPublicIndex {
  readonly eventIndex: bigint;
  readonly battleId: string;
  readonly sequence: number;
  readonly combatTimeMs: number;
  readonly publicByteLength: number;
}

export interface HuntPresentationPublicPosition {
  readonly eventIndex: bigint;
  readonly encounterId: string;
  readonly encounterOrdinal: number;
  readonly battleId: string;
  readonly sequence: number;
  readonly combatTimeMs: number;
}

export interface HuntPresentationPublicHeader {
  readonly battleId: string;
  readonly encounterId: string;
  readonly encounterOrdinal: number;
  readonly battleStartedAtHuntTimeMs: number;
  readonly initialSides: unknown;
  readonly initialParticipants: unknown;
  readonly publicHeaderDigest: Uint8Array;
}

export interface HuntPresentationPublicEvent {
  readonly eventIndex: bigint;
  readonly battleId: string;
  readonly sequence: number;
  readonly combatTimeMs: number;
  readonly publicEvent: Record<string, unknown>;
  readonly publicBytes: Uint8Array;
  readonly publicPrefixDigest: Uint8Array;
}

function reject(): never {
  throw new HuntPresentationPublicProofError();
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

function asInteger(value: unknown, minimum: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed >= minimum
    ? parsed
    : reject();
}

function asEventIndex(value: unknown): bigint {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) reject();
  const parsed = BigInt(value);
  if (parsed > SIGNED_BIGINT_MAX) reject();
  return parsed;
}

function validIndexRange(after: bigint, through: bigint, limit: number): void {
  if (after < 0n || through < after || through > SIGNED_BIGINT_MAX
    || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_EVENTS) {
    throw new RangeError("Presentation indexed read is outside its bounded source window");
  }
}

/**
 * This first pass fetches only indexed identities and byte LENGTHS, not a large
 * history of event payloads or repeated Battle headers. The enclosing caller
 * must use a REPEATABLE READ READ ONLY transaction.
 */
export async function listHuntPresentationPublicIndices(
  client: HuntPresentationDbClient,
  playerId: string,
  huntId: string,
  afterEventIndex: bigint,
  throughEventIndex: bigint,
  limit: number,
): Promise<readonly HuntPresentationPublicIndex[]> {
  validIndexRange(afterEventIndex, throughEventIndex, limit);
  if (afterEventIndex === throughEventIndex) return [];
  const found = await client.query<{
    readonly event_index: string;
    readonly battle_id: string;
    readonly sequence: string;
    readonly combat_time_ms: string;
    readonly public_byte_length: number;
  }>(
    `SELECT e.event_index::text, e.battle_id, e.sequence::text, e.combat_time_ms::text,
            octet_length(e.public_event_bytes)::integer AS public_byte_length
       FROM pokenexus.hunt_presentation_streams s
       JOIN pokenexus.hunt_presentation_events e ON e.hunt_id = s.hunt_id
      WHERE s.player_id = $1 AND s.hunt_id = $2
        AND e.event_index > $3::bigint AND e.event_index <= $4::bigint
      ORDER BY e.event_index LIMIT $5::integer`,
    [playerId, huntId, afterEventIndex.toString(), throughEventIndex.toString(), limit + 1],
  );
  const requested = BigInt(limit + 1);
  const remaining = throughEventIndex - afterEventIndex;
  const expectedRows = Number(remaining < requested ? remaining : requested);
  if (found.rows.length !== expectedRows) reject();
  const indices: HuntPresentationPublicIndex[] = [];
  let expected = afterEventIndex + 1n;
  for (const row of found.rows) {
    const index = asEventIndex(row.event_index);
    if (index !== expected || typeof row.battle_id !== "string" || row.battle_id.length === 0) reject();
    const publicByteLength = asInteger(row.public_byte_length, 1);
    if (publicByteLength > MAX_PUBLIC_BYTES) reject();
    indices.push({
      eventIndex: index,
      battleId: row.battle_id,
      sequence: asInteger(row.sequence, 1),
      combatTimeMs: asInteger(row.combat_time_ms, 0),
      publicByteLength,
    });
    expected += 1n;
  }
  if (indices.length === 0 && throughEventIndex > afterEventIndex) reject();
  return indices;
}

/** This lookup authenticates the frozen public-only index/digest in a signed cursor. */
export async function loadHuntPresentationPublicPrefixAt(
  client: HuntPresentationDbClient,
  playerId: string,
  huntId: string,
  index: bigint,
): Promise<Uint8Array | null> {
  if (index < 0n || index > SIGNED_BIGINT_MAX) {
    throw new RangeError("Presentation prefix index is invalid");
  }
  if (index === 0n) return Buffer.alloc(32);
  const found = await client.query<{ readonly public_prefix_digest: Buffer }>(
    `SELECT e.public_prefix_digest
       FROM pokenexus.hunt_presentation_streams s
       JOIN pokenexus.hunt_presentation_events e ON e.hunt_id = s.hunt_id
      WHERE s.player_id = $1 AND s.hunt_id = $2 AND e.event_index = $3::bigint`,
    [playerId, huntId, index.toString()],
  );
  const digest = found.rows[0]?.public_prefix_digest;
  return digest && digest.byteLength === 32 ? digest : null;
}

/**
 * Validate the exact predecessor identity asserted by a signed next/resume
 * cursor, including when the cursor polls an empty end-of-prefix page.
 * One owner-scoped indexed metadata row; no raw/private event bytes or
 * historical prefix traversal.
 */
export async function loadHuntPresentationPublicPositionAt(
  client: HuntPresentationDbClient,
  playerId: string,
  huntId: string,
  index: bigint,
): Promise<HuntPresentationPublicPosition | null> {
  if (index < 1n || index > SIGNED_BIGINT_MAX) {
    throw new RangeError("Presentation cursor position index is invalid");
  }
  const found = await client.query<{
    readonly event_index: string;
    readonly battle_id: string;
    readonly encounter_id: string;
    readonly encounter_ordinal: string;
    readonly sequence: string;
    readonly combat_time_ms: string;
  }>(
    `SELECT e.event_index::text, e.battle_id, b.encounter_id,
            b.encounter_ordinal::text, e.sequence::text, e.combat_time_ms::text
       FROM pokenexus.hunt_presentation_streams s
       JOIN pokenexus.hunt_presentation_events e ON e.hunt_id = s.hunt_id
       JOIN pokenexus.hunt_presentation_battles b
         ON b.hunt_id = e.hunt_id AND b.battle_id = e.battle_id
      WHERE s.player_id = $1 AND s.hunt_id = $2 AND e.event_index = $3::bigint`,
    [playerId, huntId, index.toString()],
  );
  if (found.rows.length === 0) return null;
  if (found.rows.length !== 1) reject();
  const row = found.rows[0]!;
  if (asEventIndex(row.event_index) !== index
    || typeof row.battle_id !== "string" || row.battle_id.length === 0
    || row.battle_id.length > 512
    || typeof row.encounter_id !== "string" || row.encounter_id.length === 0
    || row.encounter_id.length > 512) reject();
  return {
    eventIndex: index,
    encounterId: row.encounter_id,
    encounterOrdinal: asInteger(row.encounter_ordinal, 1),
    battleId: row.battle_id,
    sequence: asInteger(row.sequence, 1),
    combatTimeMs: asInteger(row.combat_time_ms, 0),
  };
}

/**
 * Read only the distinct public origins selected for the page. Up to four
 * headers, never a raw source event, pre-reaction private sidecar, or checkpoint.
 */
export async function loadHuntPresentationPublicHeaders(
  client: HuntPresentationDbClient,
  playerId: string,
  huntId: string,
  battleIds: readonly string[],
): Promise<ReadonlyMap<string, HuntPresentationPublicHeader>> {
  if (battleIds.length === 0 || battleIds.length > MAX_HEADER_COUNT
    || new Set(battleIds).size !== battleIds.length
    || battleIds.some((id) => id.length === 0 || id.length > 512)) {
    throw new RangeError("Presentation Battle-header lookup exceeds its bounded window");
  }
  const found = await client.query<{
    readonly battle_id: string;
    readonly encounter_id: string;
    readonly encounter_ordinal: string;
    readonly battle_started_at_hunt_time_ms: string;
    readonly initial_sides_json: unknown;
    readonly initial_participants_json: unknown;
    readonly public_header_digest: Buffer;
  }>(
    `SELECT b.battle_id, b.encounter_id, b.encounter_ordinal::text,
            b.battle_started_at_hunt_time_ms::text,
            b.initial_sides_json, b.initial_participants_json, b.public_header_digest
       FROM pokenexus.hunt_presentation_streams s
       JOIN pokenexus.hunt_presentation_battles b ON b.hunt_id = s.hunt_id
      WHERE s.player_id = $1 AND s.hunt_id = $2 AND b.battle_id = ANY($3::text[])`,
    [playerId, huntId, battleIds],
  );
  if (found.rows.length !== battleIds.length) reject();
  const headers = new Map<string, HuntPresentationPublicHeader>();
  for (const row of found.rows) {
    const ordinal = asInteger(row.encounter_ordinal, 1);
    const start = asInteger(row.battle_started_at_hunt_time_ms, 0);
    if (!battleIds.includes(row.battle_id) || headers.has(row.battle_id)
      || typeof row.encounter_id !== "string" || row.encounter_id.length === 0
      || !Array.isArray(row.initial_sides_json) || !Array.isArray(row.initial_participants_json)
    ) reject();
    const originSize = Buffer.byteLength(canonicalPresentationJson(row.initial_sides_json))
      + Buffer.byteLength(canonicalPresentationJson(row.initial_participants_json));
    if (originSize > MAX_BATTLE_HEADER_BYTES) reject();
    const expected = publicHeaderDigest({
      encounterId: row.encounter_id,
      encounterOrdinal: ordinal,
      battleId: row.battle_id,
      battleStartedAtHuntTimeMs: start,
      initialSides: row.initial_sides_json,
      initialParticipants: row.initial_participants_json,
    });
    if (!row.public_header_digest || !bytesEqual(expected, row.public_header_digest)) reject();
    headers.set(row.battle_id, {
      battleId: row.battle_id,
      encounterId: row.encounter_id,
      encounterOrdinal: ordinal,
      battleStartedAtHuntTimeMs: start,
      initialSides: row.initial_sides_json,
      initialParticipants: row.initial_participants_json,
      publicHeaderDigest: expected,
    });
  }
  return headers;
}

/**
 * Check each fetched public row against its predecessor, canonical bytes, and
 * immutable public origin. This proves local consistency, not tamper resistance
 * against a database actor allowed to rewrite the entire historical hash chain.
 */
export async function loadHuntPresentationPublicEvents(
  client: HuntPresentationDbClient,
  playerId: string,
  huntId: string,
  indices: readonly HuntPresentationPublicIndex[],
  headers: ReadonlyMap<string, HuntPresentationPublicHeader>,
): Promise<readonly HuntPresentationPublicEvent[]> {
  if (indices.length === 0 || indices.length > MAX_PAGE_EVENTS
    || indices.some((index, pos) => pos > 0
      && index.eventIndex !== indices[pos - 1]!.eventIndex + 1n)) {
    throw new RangeError("Presentation event batch is not bounded and contiguous");
  }
  const totalBytes = indices.reduce((sum, index) => sum + index.publicByteLength, 0);
  if (totalBytes > MAX_PUBLIC_BYTES) {
    throw new RangeError("Presentation public event-byte budget is exhausted");
  }
  const found = await client.query<{
    readonly event_index: string;
    readonly battle_id: string;
    readonly sequence: string;
    readonly combat_time_ms: string;
    readonly public_event_json: unknown;
    readonly public_event_bytes: Buffer;
    readonly public_prefix_digest: Buffer;
    readonly previous_public_prefix_digest: Buffer | null;
    readonly previous_battle_id: string | null;
    readonly previous_encounter_ordinal: string | null;
    readonly previous_sequence: string | null;
    readonly previous_combat_time_ms: string | null;
    readonly previous_event_kind: string | null;
  }>(
    `SELECT e.event_index::text, e.battle_id, e.sequence::text, e.combat_time_ms::text,
            e.public_event_json, e.public_event_bytes, e.public_prefix_digest,
            previous.public_prefix_digest AS previous_public_prefix_digest,
            previous.battle_id AS previous_battle_id,
            prior_b.encounter_ordinal::text AS previous_encounter_ordinal,
            previous.sequence::text AS previous_sequence,
            previous.combat_time_ms::text AS previous_combat_time_ms,
            previous.public_event_json->>'kind' AS previous_event_kind
       FROM pokenexus.hunt_presentation_streams s
       JOIN pokenexus.hunt_presentation_events e ON e.hunt_id = s.hunt_id
       LEFT JOIN pokenexus.hunt_presentation_events previous
         ON previous.hunt_id = e.hunt_id AND previous.event_index = e.event_index - 1
       LEFT JOIN pokenexus.hunt_presentation_battles prior_b
         ON prior_b.hunt_id = previous.hunt_id AND prior_b.battle_id = previous.battle_id
      WHERE s.player_id = $1 AND s.hunt_id = $2
        AND e.event_index >= $3::bigint AND e.event_index <= $4::bigint
      ORDER BY e.event_index LIMIT $5::integer`,
    [playerId, huntId, indices[0]!.eventIndex.toString(),
      indices[indices.length - 1]!.eventIndex.toString(), indices.length],
  );
  if (found.rows.length !== indices.length) reject();
  const events: HuntPresentationPublicEvent[] = [];
  for (const [position, row] of found.rows.entries()) {
    const index = indices[position]!;
    const header = headers.get(row.battle_id);
    const event = row.public_event_json;
    if (
      !header || row.battle_id !== index.battleId
      || asEventIndex(row.event_index) !== index.eventIndex
      || asInteger(row.sequence, 1) !== index.sequence
      || asInteger(row.combat_time_ms, 0) !== index.combatTimeMs
      || !row.public_event_bytes || row.public_event_bytes.byteLength !== index.publicByteLength
      || !event || typeof event !== "object" || Array.isArray(event)
    ) reject();
    const publicEvent = event as Record<string, unknown>;
    if (publicEvent.sequence !== index.sequence || publicEvent.combatTimeMs !== index.combatTimeMs
      || typeof publicEvent.kind !== "string"
      || !bytesEqual(
        Buffer.from(canonicalPresentationJson(event), "utf8"),
        row.public_event_bytes,
      )) reject();
    const prior = row.previous_public_prefix_digest ?? Buffer.alloc(32);
    if ((index.eventIndex === 1n) !== (row.previous_public_prefix_digest === null)) reject();
    if (!bytesEqual(
      digestAfter(prior, index.eventIndex, row.public_event_bytes, header.publicHeaderDigest),
      row.public_prefix_digest,
    )) reject();
    if (index.eventIndex === 1n) {
      if (header.encounterOrdinal !== 1 || index.sequence !== 1
        || publicEvent.kind !== "BattleStarted" || publicEvent.battleId !== header.battleId) reject();
    } else if (row.previous_battle_id === row.battle_id) {
      if (row.previous_sequence === null || index.sequence !== asInteger(row.previous_sequence, 1) + 1
        || row.previous_combat_time_ms === null
        || index.combatTimeMs < asInteger(row.previous_combat_time_ms, 0)
        || row.previous_event_kind === "BattleEnded") reject();
    } else {
      if (row.previous_encounter_ordinal === null
        || header.encounterOrdinal !== asInteger(row.previous_encounter_ordinal, 1) + 1
        || index.sequence !== 1 || publicEvent.kind !== "BattleStarted"
        || publicEvent.battleId !== header.battleId
        || row.previous_event_kind !== "BattleEnded") reject();
    }
    events.push({
      eventIndex: index.eventIndex,
      battleId: row.battle_id,
      sequence: index.sequence,
      combatTimeMs: index.combatTimeMs,
      publicEvent,
      publicBytes: row.public_event_bytes,
      publicPrefixDigest: row.public_prefix_digest,
    });
  }
  return events;
}
