import {
  decodeOpaqueStringDbV1,
  encodeOpaqueStringDbV1,
} from "@pokenexus/database";

export const PLAYER_PAGE_DEFAULT_LIMIT = 50;
export const PLAYER_PAGE_MAX_LIMIT = 100;
export const PLAYER_MUTATION_BODY_MAX_BYTES = 16 * 1024;
export const PLAYER_CURSOR_MAX_LENGTH = 4096;
export const PG_SIGNED_BIGINT_MAX = 9_223_372_036_854_775_807n;
export const MOVE_ID_TRANSPORT_MAX_BYTES = 512;

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CANONICAL_DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const CURSOR_VERSION = 1;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_UUID_PATTERN.test(value);
}

export function parsePgSignedBigintDecimal(value: unknown): bigint | null {
  if (typeof value !== "string" || !CANONICAL_DECIMAL_PATTERN.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed <= PG_SIGNED_BIGINT_MAX ? parsed : null;
  } catch {
    return null;
  }
}

export function parsePageLimit(value: string | undefined): number | null {
  if (value === undefined) return PLAYER_PAGE_DEFAULT_LIMIT;
  if (!/^[1-9][0-9]{0,2}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed <= PLAYER_PAGE_MAX_LIMIT ? parsed : null;
}

export function isBoundedMoveId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && textEncoder.encode(value).byteLength <= MOVE_ID_TRANSPORT_MAX_BYTES;
}

export interface CollectionCursor {
  readonly afterPokemonInstanceId: string;
}

export interface TeamCursor {
  readonly afterTeamId: string;
}

export interface InventoryCursor {
  readonly rowVersion: bigint;
  readonly afterItemId: string;
}

export interface PlayerCursorCodec {
  encodeCollection(cursor: CollectionCursor): Promise<string>;
  decodeCollection(raw: string): Promise<CollectionCursor | null>;
  encodeTeams(cursor: TeamCursor): Promise<string>;
  decodeTeams(raw: string): Promise<TeamCursor | null>;
  encodeInventory(cursor: InventoryCursor): Promise<string>;
  decodeInventory(raw: string): Promise<InventoryCursor | null>;
}

type CursorKind = "collection" | "teams" | "inventory";

interface CursorEnvelope {
  readonly v: number;
  readonly k: CursorKind;
  readonly a: string;
  readonly r?: string;
}

function encodeBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function decodeBase64url(value: string, maximumBytes: number): Uint8Array | null {
  if (
    value.length === 0
    || value.length > Math.ceil((maximumBytes * 4) / 3)
    || !BASE64URL_PATTERN.test(value)
  ) {
    return null;
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength === 0 || decoded.byteLength > maximumBytes) return null;
  if (decoded.toString("base64url") !== value) return null;
  return new Uint8Array(decoded);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function parseEnvelope(bytes: Uint8Array): CursorEnvelope | null {
  let value: unknown;
  try {
    value = JSON.parse(textDecoder.decode(bytes)) as unknown;
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  if (object.v !== CURSOR_VERSION) return null;
  if (object.k !== "collection" && object.k !== "teams" && object.k !== "inventory") return null;
  if (typeof object.a !== "string" || object.a.length === 0) return null;
  if (object.k === "inventory") {
    if (!hasExactKeys(object, ["v", "k", "a", "r"]) || typeof object.r !== "string") return null;
  } else if (!hasExactKeys(object, ["v", "k", "a"])) {
    return null;
  }
  return {
    v: CURSOR_VERSION,
    k: object.k,
    a: object.a,
    ...(typeof object.r === "string" ? { r: object.r } : {}),
  };
}

export function createPlayerCursorCodec(secret: string): PlayerCursorCodec {
  const secretBytes = textEncoder.encode(secret);
  if (secretBytes.byteLength < 32) {
    throw new Error("PLAYER_STATE_CURSOR_HMAC_KEY must contain at least 32 UTF-8 bytes");
  }
  const keyPromise = crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  async function encode(envelope: CursorEnvelope): Promise<string> {
    const payload = textEncoder.encode(JSON.stringify(envelope));
    const signature = new Uint8Array(
      await crypto.subtle.sign("HMAC", await keyPromise, Uint8Array.from(payload).buffer),
    );
    return `${encodeBase64url(payload)}.${encodeBase64url(signature)}`;
  }

  async function decode(raw: string, expectedKind: CursorKind): Promise<CursorEnvelope | null> {
    if (raw.length === 0 || raw.length > PLAYER_CURSOR_MAX_LENGTH) return null;
    const parts = raw.split(".");
    if (parts.length !== 2) return null;
    const payload = decodeBase64url(parts[0] ?? "", 2048);
    const signature = decodeBase64url(parts[1] ?? "", 32);
    if (!payload || !signature || signature.byteLength !== 32) return null;
    const verified = await crypto.subtle.verify(
      "HMAC",
      await keyPromise,
      Uint8Array.from(signature).buffer,
      Uint8Array.from(payload).buffer,
    );
    if (!verified) return null;
    const envelope = parseEnvelope(payload);
    return envelope?.k === expectedKind ? envelope : null;
  }

  return {
    encodeCollection(cursor) {
      if (!isCanonicalUuid(cursor.afterPokemonInstanceId)) {
        throw new Error("Collection cursor requires a canonical Pokémon UUID");
      }
      return encode({ v: CURSOR_VERSION, k: "collection", a: cursor.afterPokemonInstanceId });
    },
    async decodeCollection(raw) {
      const envelope = await decode(raw, "collection");
      return envelope && isCanonicalUuid(envelope.a)
        ? { afterPokemonInstanceId: envelope.a }
        : null;
    },
    encodeTeams(cursor) {
      if (!isCanonicalUuid(cursor.afterTeamId)) {
        throw new Error("Team cursor requires a canonical Team UUID");
      }
      return encode({ v: CURSOR_VERSION, k: "teams", a: cursor.afterTeamId });
    },
    async decodeTeams(raw) {
      const envelope = await decode(raw, "teams");
      return envelope && isCanonicalUuid(envelope.a) ? { afterTeamId: envelope.a } : null;
    },
    encodeInventory(cursor) {
      if (cursor.rowVersion < 0n || cursor.rowVersion > PG_SIGNED_BIGINT_MAX) {
        throw new Error("Inventory cursor rowVersion is outside PostgreSQL bigint range");
      }
      const encodedItemId = encodeBase64url(encodeOpaqueStringDbV1(cursor.afterItemId));
      return encode({
        v: CURSOR_VERSION,
        k: "inventory",
        a: encodedItemId,
        r: cursor.rowVersion.toString(),
      });
    },
    async decodeInventory(raw) {
      const envelope = await decode(raw, "inventory");
      const rowVersion = envelope ? parsePgSignedBigintDecimal(envelope.r) : null;
      const encodedItemId = envelope ? decodeBase64url(envelope.a, 2048) : null;
      if (!envelope || rowVersion === null || !encodedItemId) return null;
      try {
        return {
          rowVersion,
          afterItemId: decodeOpaqueStringDbV1(encodedItemId),
        };
      } catch {
        return null;
      }
    },
  };
}
