import {
  HuntPresentationPublicProofError,
  listHuntPresentationPublicIndices,
  loadHuntPresentationPublicEvents,
  loadHuntPresentationPublicHeaders,
  loadHuntPresentationPublicPositionAt,
  loadHuntPresentationPublicPrefixAt,
  loadHuntPresentationPublicStream,
  loadOwnedSoloHunt,
  withTransaction,
  type HuntPresentationPublicEvent,
  type HuntPresentationPublicHeader,
  type HuntPresentationPublicIndex,
  type HuntPresentationPublicPosition,
  type HuntPresentationPublicStreamRecord,
  type TransactionClient,
} from "@pokenexus/database";
import {
  type PresentationCursorCodec,
  type PresentationCursorContents,
  type PresentationCursorPosition,
  type PresentationCursorSnapshot,
} from "./presentation-cursor";
import { buildHuntPresentationPage } from "./presentation-page";
import type { HuntHttpResult } from "./application";

const PRESENTATION_SCHEMA_V1 = "pokenexus.combat-presentation.v1" as const;
const PRESENTATION_SCHEMA_V2 = "pokenexus.combat-presentation.v2" as const;
const CHECKPOINT_SCHEMA_V3 = "pokenexus.solo-hunt-checkpoint.v3";
const CHECKPOINT_SCHEMA_V4 = "pokenexus.solo-hunt-checkpoint.v4";
const INPUT_SCHEMA_V2 = "hunt-runtime-inputs-v2";
const INPUT_SCHEMA_V4 = "hunt-runtime-inputs-v4";
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PUBLIC_JSON_BYTES = 256 * 1024;
const RESERVE_JSON_METADATA_BYTES = 8 * 1024;
const CURSOR_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/u;

type PresentationFailure =
  | "invalid_request"
  | "not_found"
  | "snapshot_changed"
  | "cursor_expired"
  | "presentation_expired"
  | "presentation_unavailable"
  | "presentation_temporarily_unavailable";

function failure(code: PresentationFailure): HuntHttpResult {
  const status = {
    invalid_request: 400,
    not_found: 404,
    snapshot_changed: 409,
    cursor_expired: 410,
    presentation_expired: 410,
    presentation_unavailable: 410,
    presentation_temporarily_unavailable: 503,
  } satisfies Record<PresentationFailure, number>;
  return { httpStatus: status[code], body: { error: code } };
}

export interface HuntPresentationReadPort {
  ownedHunt(playerId: string, huntId: string): Promise<{
    readonly terminalAt: Date | null;
  } | null>;
  stream(playerId: string, huntId: string): Promise<HuntPresentationPublicStreamRecord | null>;
  publicPrefix(playerId: string, huntId: string, index: bigint): Promise<Uint8Array | null>;
  positionAt(playerId: string, huntId: string, index: bigint): Promise<HuntPresentationPublicPosition | null>;
  indexWindow(
    playerId: string, huntId: string, after: bigint, through: bigint, limit: number,
  ): Promise<readonly HuntPresentationPublicIndex[]>;
  headers(
    playerId: string, huntId: string, battleIds: readonly string[],
  ): Promise<ReadonlyMap<string, HuntPresentationPublicHeader>>;
  events(
    playerId: string, huntId: string, indices: readonly HuntPresentationPublicIndex[],
    headers: ReadonlyMap<string, HuntPresentationPublicHeader>,
  ): Promise<readonly HuntPresentationPublicEvent[]>;
}

export function createHuntPresentationReadPort(
  client: TransactionClient,
): HuntPresentationReadPort {
  return {
    ownedHunt: (playerId, huntId) => loadOwnedSoloHunt(client, playerId, huntId),
    stream: (playerId, huntId) => loadHuntPresentationPublicStream(client, playerId, huntId),
    publicPrefix: (playerId, huntId, index) =>
      loadHuntPresentationPublicPrefixAt(client, playerId, huntId, index),
    positionAt: (playerId, huntId, index) =>
      loadHuntPresentationPublicPositionAt(client, playerId, huntId, index),
    indexWindow: (playerId, huntId, after, through, limit) =>
      listHuntPresentationPublicIndices(client, playerId, huntId, after, through, limit),
    headers: (playerId, huntId, ids) =>
      loadHuntPresentationPublicHeaders(client, playerId, huntId, ids),
    events: (playerId, huntId, indices, headers) =>
      loadHuntPresentationPublicEvents(client, playerId, huntId, indices, headers),
  };
}

export interface HuntPresentationReadRequest {
  readonly playerId: string;
  readonly huntId: string;
  readonly cursorCodec: PresentationCursorCodec;
  readonly nowMs: number;
  readonly limit?: number;
  readonly rawCursor?: string;
}

/** Rejects duplicate and unknown fields without decoding any opaque cursor. */
export function parseHuntPresentationQuery(query: URLSearchParams): {
  readonly limit?: number;
  readonly rawCursor?: string;
} | null {
  const values = [...query.entries()];
  if (values.some(([key]) => key !== "limit" && key !== "cursor")
    || query.getAll("limit").length > 1 || query.getAll("cursor").length > 1) return null;
  const rawLimit = query.get("limit");
  const cursor = query.get("cursor");
  let limit: number | undefined;
  if (rawLimit !== null) {
    if (!/^[1-9][0-9]{0,2}$/u.test(rawLimit)) return null;
    limit = Number(rawLimit);
    if (limit > 128) return null;
  }
  if (cursor !== null && (
    cursor.length === 0
    || cursor.length > 4096
    || !CURSOR_TOKEN_PATTERN.test(cursor)
  )) return null;
  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(cursor !== null ? { rawCursor: cursor } : {}),
  };
}

function frozenSnapshot(stream: HuntPresentationPublicStreamRecord): PresentationCursorSnapshot {
  return {
    publicationGeneration: stream.publicationGeneration.toString(),
    publishedEventIndex: stream.publishedEventIndex.toString(),
    publicPrefixDigest: Buffer.from(stream.publicPrefixDigest).toString("base64url"),
    committedLogicalTimeMs: String(stream.committedLogicalTimeMs),
    isTerminal: stream.isTerminal,
    presentationSchemaVersion: stream.presentationSchemaVersion === PRESENTATION_SCHEMA_V2
      ? PRESENTATION_SCHEMA_V2
      : PRESENTATION_SCHEMA_V1,
    gameDataVersion: stream.gameDataVersion,
    rulesVersion: stream.rulesVersion,
    sourceCombatEventSchemaVersion: stream.sourceEventSchemaVersion,
  };
}

function pinnedVersionMatch(
  frozen: PresentationCursorSnapshot,
  current: PresentationCursorSnapshot,
): boolean {
  return frozen.presentationSchemaVersion === current.presentationSchemaVersion
    && frozen.gameDataVersion === current.gameDataVersion
    && frozen.rulesVersion === current.rulesVersion
    && frozen.sourceCombatEventSchemaVersion === current.sourceCombatEventSchemaVersion;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

function indexFromPosition(position: PresentationCursorPosition): bigint {
  return position.kind === "before_first" ? 0n : BigInt(position.eventIndex);
}

function chooseBoundedPrefix(
  indices: readonly HuntPresentationPublicIndex[],
  limit: number,
): readonly HuntPresentationPublicIndex[] {
  const selected: HuntPresentationPublicIndex[] = [];
  const battleIds = new Set<string>();
  let publicByteLength = 0;
  for (const index of indices.slice(0, limit)) {
    if (!battleIds.has(index.battleId) && battleIds.size >= 4) break;
    if (publicByteLength + index.publicByteLength
      > MAX_PUBLIC_JSON_BYTES - RESERVE_JSON_METADATA_BYTES) break;
    battleIds.add(index.battleId);
    publicByteLength += index.publicByteLength;
    selected.push(index);
  }
  return selected;
}

/**
 * Purely read-side orchestration: no replay, no checkpoint decode, no gameplay
 * side effects. The caller supplies one consistent READ ONLY DB snapshot.
 * This implementation remains disconnected from the public HTTP router.
 */
export async function readHuntPresentationFromPort(
  port: HuntPresentationReadPort,
  request: HuntPresentationReadRequest,
): Promise<HuntHttpResult> {
  const { playerId, huntId, cursorCodec, nowMs, rawCursor } = request;
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return failure("invalid_request");
  if (request.limit !== undefined
    && (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 128)) {
    return failure("invalid_request");
  }
  const owned = await port.ownedHunt(playerId, huntId);
  if (!owned) return failure("not_found");
  let verifiedCursor: PresentationCursorContents | null = null;
  if (rawCursor !== undefined) {
    const checked = await cursorCodec.verify(rawCursor, { playerId, huntId }, nowMs);
    if (checked.status === "invalid") return failure("invalid_request");
    if (checked.status === "expired") return failure("cursor_expired");
    verifiedCursor = checked.cursor;
  }
  const stream = await port.stream(playerId, huntId);
  const historicalV1 = stream?.checkpointSchemaVersion === CHECKPOINT_SCHEMA_V3
    && stream.inputSchemaVersion === INPUT_SCHEMA_V2
    && stream.presentationSchemaVersion === PRESENTATION_SCHEMA_V1;
  const forwardV2 = stream?.checkpointSchemaVersion === CHECKPOINT_SCHEMA_V4
    && stream.inputSchemaVersion === INPUT_SCHEMA_V4
    && stream.presentationSchemaVersion === PRESENTATION_SCHEMA_V2;
  if (
    !stream || stream.status === "unavailable"
    || (!historicalV1 && !forwardV2)
    || stream.publicPrefixDigest.byteLength !== 32
  ) return failure("presentation_unavailable");
  if ((owned.terminalAt !== null) !== stream.isTerminal
    || (stream.isTerminal && stream.presentationTerminalRecordedAtCeilMs === null)) {
    return failure("presentation_temporarily_unavailable");
  }
  if (stream.presentationTerminalRecordedAtCeilMs !== null
    && BigInt(nowMs) >= stream.presentationTerminalRecordedAtCeilMs + BigInt(RETENTION_MS)) {
    return failure("presentation_expired");
  }
  const current = frozenSnapshot(stream);
  let snapshot = current;
  let originalSnapshot = current;
  let after: PresentationCursorPosition = { kind: "before_first" };
  let limit = request.limit ?? 64;
  if (verifiedCursor !== null) {
    const bound = verifiedCursor;
    if (request.limit !== undefined && request.limit !== bound.limit) {
      return failure("invalid_request");
    }
    limit = bound.limit;
    if (!pinnedVersionMatch(bound.snapshot, current)
      || BigInt(bound.snapshot.publishedEventIndex) > stream.publishedEventIndex
      || BigInt(bound.snapshot.publicationGeneration) > stream.publicationGeneration
      || (bound.snapshot.isTerminal && !stream.isTerminal)) {
      return failure("snapshot_changed");
    }
    after = bound.position;
    snapshot = bound.snapshot;
    originalSnapshot = bound.snapshot;
    if (bound.purpose === "resume") {
      if (indexFromPosition(after) !== BigInt(snapshot.publishedEventIndex)
        || snapshot.isTerminal) return failure("invalid_request");
      snapshot = current;
    }
  }
  try {
    const originalPrefix = await port.publicPrefix(
      playerId, huntId, BigInt(originalSnapshot.publishedEventIndex),
    );
    const frozenDigest = Buffer.from(originalSnapshot.publicPrefixDigest, "base64url");
    if (!originalPrefix || !sameBytes(originalPrefix, frozenDigest)) {
      return failure(rawCursor === undefined ? "presentation_unavailable" : "snapshot_changed");
    }
    if (snapshot !== originalSnapshot) {
      const promotedPrefix = await port.publicPrefix(
        playerId, huntId, BigInt(snapshot.publishedEventIndex),
      );
      if (!promotedPrefix || !sameBytes(
        promotedPrefix, Buffer.from(snapshot.publicPrefixDigest, "base64url"),
      )) return failure("snapshot_changed");
    }
    if (after.kind === "event") {
      const positioned = await port.positionAt(playerId, huntId, BigInt(after.eventIndex));
      if (!positioned || positioned.encounterId !== after.encounterId
        || positioned.encounterOrdinal !== after.encounterOrdinal
        || positioned.battleId !== after.battleId
        || positioned.sequence !== after.lastSequence
        || positioned.combatTimeMs !== after.lastCombatTimeMs) {
        return failure("snapshot_changed");
      }
    }
    const highwater = BigInt(snapshot.publishedEventIndex);
    const from = indexFromPosition(after);
    const indices = await port.indexWindow(playerId, huntId, from, highwater, limit);
    const chosen = chooseBoundedPrefix(indices, limit);
    if (indices.length > 0 && chosen.length === 0) return failure("presentation_unavailable");
    const uniqueIds = [...new Set(chosen.map((index) => index.battleId))];
    const headers = chosen.length
      ? await port.headers(playerId, huntId, uniqueIds)
      : new Map<string, HuntPresentationPublicHeader>();
    const allEvents = chosen.length
      ? await port.events(playerId, huntId, chosen, headers)
      : [];
    const buildPage = (eventCount: number) => buildHuntPresentationPage({
      cursorCodec, playerId, huntId, nowMs, limit, snapshot, after,
      events: allEvents.slice(0, eventCount), headers,
    });
    try {
      const completePage = await buildPage(allEvents.length);
      return { httpStatus: 200, body: completePage };
    } catch (error) {
      if (!(error instanceof RangeError) || allEvents.length <= 1) throw error;
    }
    // Serialization has a fixed, monotonic byte budget. Binary-search the
    // largest fitting event prefix; repeated linear rescans grow quadratically.
    let minimum = 1;
    let maximum = allEvents.length - 1;
    let largestFittingPage: Awaited<ReturnType<typeof buildPage>> | null = null;
    while (minimum <= maximum) {
      const eventCount = minimum + Math.floor((maximum - minimum) / 2);
      try {
        largestFittingPage = await buildPage(eventCount);
        minimum = eventCount + 1;
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        maximum = eventCount - 1;
      }
    }
    if (!largestFittingPage) return failure("presentation_unavailable");
    return { httpStatus: 200, body: largestFittingPage };
  } catch (error) {
    if (error instanceof HuntPresentationPublicProofError
      || error instanceof RangeError
      || error instanceof Error && error.message === "The immutable public CombatPresentation envelope is invalid") {
      return failure("presentation_unavailable");
    }
    throw error;
  }
}

/** Existing routes remain unchanged: this wrapper is not invoked by a public handler. */
export async function readHuntPresentationWithConsistentSnapshot(
  client: TransactionClient,
  request: HuntPresentationReadRequest,
): Promise<HuntHttpResult> {
  return withTransaction(
    client,
    (transaction) => readHuntPresentationFromPort(createHuntPresentationReadPort(transaction), request),
    { isolationLevel: "REPEATABLE READ", readOnly: true },
  );
}
