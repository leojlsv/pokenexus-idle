/** Server-private transport for SPEC-017 cursors. Not connected to a public route. */
export const HUNT_PRESENTATION_CURSOR_MAX_BYTES = 4096;
export const HUNT_PRESENTATION_CURSOR_TTL_MS = 15 * 60 * 1000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/u;
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const DIGEST_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SIGNATURE_BYTES = 32;
const MAX_EVENT_ID_LENGTH = 512;
const SIGNING_DOMAIN = new TextEncoder().encode("pokenexus.hunt-presentation.cursor.v1\0");
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export interface PresentationCursorSnapshot {
  readonly publicationGeneration: string;
  readonly publishedEventIndex: string;
  readonly publicPrefixDigest: string;
  readonly committedLogicalTimeMs: string;
  readonly isTerminal: boolean;
  readonly presentationSchemaVersion:
    | "pokenexus.combat-presentation.v1"
    | "pokenexus.combat-presentation.v2";
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
  readonly sourceCombatEventSchemaVersion: string;
}

export type PresentationCursorPosition =
  | { readonly kind: "before_first" }
  | {
      readonly kind: "event";
      readonly eventIndex: string;
      readonly encounterOrdinal: number;
      readonly encounterId: string;
      readonly battleId: string;
      readonly lastSequence: number;
      readonly lastCombatTimeMs: number;
    };

export interface PresentationCursorContents {
  readonly playerId: string;
  readonly huntId: string;
  readonly purpose: "next" | "resume";
  readonly limit: number;
  readonly snapshot: PresentationCursorSnapshot;
  readonly position: PresentationCursorPosition;
}

interface SignedPresentationCursor extends PresentationCursorContents {
  readonly version: 1;
  readonly keyId: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
}

export type PresentationCursorVerification =
  | { readonly status: "valid"; readonly cursor: PresentationCursorContents }
  | { readonly status: "expired" }
  | { readonly status: "invalid" };

export interface PresentationCursorCodec {
  issue(contents: PresentationCursorContents, nowMs: number): Promise<string>;
  verify(
    token: string,
    scope: { readonly playerId: string; readonly huntId: string },
    nowMs: number,
  ): Promise<PresentationCursorVerification>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return keys.length === sorted.length && keys.every((key, index) => key === sorted[index]);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
    && encoder.encode(value).byteLength <= MAX_EVENT_ID_LENGTH;
}

function unsignedDecimal(value: unknown, maximum: bigint): boolean {
  return typeof value === "string" && DECIMAL_PATTERN.test(value)
    && value.length <= 20 && BigInt(value) <= maximum;
}

function safeNumber(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

const BIGINT_MAX = 9_223_372_036_854_775_807n;
const LOGICAL_TIME_MAX = BigInt(Number.MAX_SAFE_INTEGER);

function validContents(value: unknown): value is PresentationCursorContents {
  if (!isRecord(value)
    || !hasExactKeys(value, ["playerId", "huntId", "purpose", "limit", "snapshot", "position"])
    || typeof value.playerId !== "string" || !UUID_PATTERN.test(value.playerId)
    || typeof value.huntId !== "string" || !UUID_PATTERN.test(value.huntId)
    || (value.purpose !== "next" && value.purpose !== "resume")
    || !safeNumber(value.limit, 1) || value.limit > 128
    || !isRecord(value.snapshot) || !isRecord(value.position)
  ) return false;
  const snapshot = value.snapshot;
  if (!hasExactKeys(snapshot, [
    "publicationGeneration", "publishedEventIndex", "publicPrefixDigest",
    "committedLogicalTimeMs", "isTerminal", "presentationSchemaVersion",
    "gameDataVersion", "rulesVersion", "sourceCombatEventSchemaVersion",
  ]) || !unsignedDecimal(snapshot.publicationGeneration, BIGINT_MAX)
    || !unsignedDecimal(snapshot.publishedEventIndex, BIGINT_MAX)
    || !unsignedDecimal(snapshot.committedLogicalTimeMs, LOGICAL_TIME_MAX)
    || typeof snapshot.publicPrefixDigest !== "string"
    || !DIGEST_PATTERN.test(snapshot.publicPrefixDigest)
    || Buffer.from(snapshot.publicPrefixDigest, "base64url").byteLength !== 32
    || Buffer.from(snapshot.publicPrefixDigest, "base64url").toString("base64url")
      !== snapshot.publicPrefixDigest
    || typeof snapshot.isTerminal !== "boolean"
    || (
      snapshot.presentationSchemaVersion !== "pokenexus.combat-presentation.v1"
      && snapshot.presentationSchemaVersion !== "pokenexus.combat-presentation.v2"
    )
    || !nonempty(snapshot.gameDataVersion)
    || !nonempty(snapshot.rulesVersion)
    || !nonempty(snapshot.sourceCombatEventSchemaVersion)
  ) return false;
  const position = value.position;
  if (position.kind === "before_first") return hasExactKeys(position, ["kind"]);
  if (position.kind !== "event"
    || !hasExactKeys(position, [
      "kind", "eventIndex", "encounterOrdinal", "encounterId",
      "battleId", "lastSequence", "lastCombatTimeMs",
    ])
    || !unsignedDecimal(position.eventIndex, BIGINT_MAX)
    || BigInt(position.eventIndex as string) === 0n
    || BigInt(position.eventIndex as string) > BigInt(snapshot.publishedEventIndex as string)
    || !safeNumber(position.encounterOrdinal, 1)
    || !nonempty(position.encounterId) || !nonempty(position.battleId)
    || !safeNumber(position.lastSequence, 1)
    || !safeNumber(position.lastCombatTimeMs, 0)
  ) return false;
  return true;
}

function validSigned(value: unknown): value is SignedPresentationCursor {
  if (!isRecord(value)
    || !hasExactKeys(value, [
      "version", "keyId", "issuedAtMs", "expiresAtMs",
      "playerId", "huntId", "purpose", "limit", "snapshot", "position",
    ])
    || value.version !== 1
    || typeof value.keyId !== "string" || !KEY_ID_PATTERN.test(value.keyId)
    || !safeNumber(value.issuedAtMs, 0)
    || !safeNumber(value.expiresAtMs, 0)
    || value.expiresAtMs - value.issuedAtMs !== HUNT_PRESENTATION_CURSOR_TTL_MS
  ) return false;
  return validContents({
    playerId: value.playerId,
    huntId: value.huntId,
    purpose: value.purpose,
    limit: value.limit,
    snapshot: value.snapshot,
    position: value.position,
  });
}

function signedBytes(payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(SIGNING_DOMAIN.byteLength + payload.byteLength);
  bytes.set(SIGNING_DOMAIN);
  bytes.set(payload, SIGNING_DOMAIN.byteLength);
  return bytes;
}

export function createPresentationCursorCodec(
  activeKeyId: string,
  secrets: Readonly<Record<string, Uint8Array>>,
): PresentationCursorCodec {
  const entries = Object.entries(secrets);
  if (entries.length === 0 || entries.length > 8 || !Object.hasOwn(secrets, activeKeyId)) {
    throw new Error("Presentation cursor signing keyring is invalid");
  }
  const keys = new Map<string, Promise<CryptoKey>>();
  for (const [id, secret] of entries) {
    if (!KEY_ID_PATTERN.test(id) || !(secret instanceof Uint8Array) || secret.byteLength < 32) {
      throw new Error("Presentation cursor signing key is invalid");
    }
    keys.set(id, crypto.subtle.importKey(
      "raw", Uint8Array.from(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
    ));
  }

  return {
    async issue(contents, nowMs) {
      if (!validContents(contents) || !safeNumber(nowMs, 0)
        || nowMs > Number.MAX_SAFE_INTEGER - HUNT_PRESENTATION_CURSOR_TTL_MS) {
        throw new Error("Presentation cursor issue input is invalid");
      }
      const issued: SignedPresentationCursor = {
        version: 1,
        keyId: activeKeyId,
        issuedAtMs: nowMs,
        expiresAtMs: nowMs + HUNT_PRESENTATION_CURSOR_TTL_MS,
        ...contents,
      };
      const payload = encoder.encode(JSON.stringify(issued));
      const signature = new Uint8Array(await crypto.subtle.sign(
        "HMAC", await keys.get(activeKeyId)!, Uint8Array.from(signedBytes(payload)).buffer,
      ));
      const bytes = new Uint8Array(payload.byteLength + SIGNATURE_BYTES);
      bytes.set(payload);
      bytes.set(signature, payload.byteLength);
      const token = Buffer.from(bytes).toString("base64url");
      if (token.length > HUNT_PRESENTATION_CURSOR_MAX_BYTES) {
        throw new Error("Presentation cursor exceeds transport limit");
      }
      return token;
    },
    async verify(token, scope, nowMs) {
      const invalid: PresentationCursorVerification = { status: "invalid" };
      if (typeof token !== "string" || token.length === 0
        || token.length > HUNT_PRESENTATION_CURSOR_MAX_BYTES
        || !TOKEN_PATTERN.test(token) || !safeNumber(nowMs, 0)) return invalid;
      const bytes = Buffer.from(token, "base64url");
      if (bytes.byteLength <= SIGNATURE_BYTES
        || bytes.toString("base64url") !== token) return invalid;
      const payload = bytes.subarray(0, -SIGNATURE_BYTES);
      const signature = bytes.subarray(-SIGNATURE_BYTES);
      let decoded: unknown;
      try {
        decoded = JSON.parse(decoder.decode(payload)) as unknown;
      } catch {
        return invalid;
      }
      if (!validSigned(decoded)) return invalid;
      const key = keys.get(decoded.keyId);
      if (!key) return invalid;
      const verified = await crypto.subtle.verify(
        "HMAC", await key, Uint8Array.from(signature).buffer,
        Uint8Array.from(signedBytes(payload)).buffer,
      );
      if (!verified || decoded.playerId !== scope.playerId || decoded.huntId !== scope.huntId
        || nowMs < decoded.issuedAtMs) return invalid;
      if (nowMs >= decoded.expiresAtMs) return { status: "expired" };
      return {
        status: "valid",
        cursor: {
          playerId: decoded.playerId,
          huntId: decoded.huntId,
          purpose: decoded.purpose,
          limit: decoded.limit,
          snapshot: decoded.snapshot,
          position: decoded.position,
        },
      };
    },
  };
}
