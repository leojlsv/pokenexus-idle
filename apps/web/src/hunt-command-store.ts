const STORAGE_KEY = "pokenexus:hunt:pending-command:v2";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HEX_256_RE = /^[0-9a-f]{64}$/u;
const MAX_STORED_BYTES = 64 * 1024;

export type HuntCommandFamily =
  | "sync"
  | "start"
  | "retreat"
  | "pokecenter"
  | "capture_policy"
  | "potion_policy"
  | "revive_policy";

export interface FrozenHuntCommand {
  readonly family: HuntCommandFamily;
  readonly key: string;
  readonly intent: unknown;
}

interface StoredHuntCommand extends FrozenHuntCommand {
  readonly playerFingerprint: string;
}

export type HuntCommandStoreState =
  | { readonly kind: "none" }
  | ({ readonly kind: "resume" } & FrozenHuntCommand)
  | { readonly kind: "different_player" }
  | { readonly kind: "unavailable" };

function isFamily(value: unknown): value is HuntCommandFamily {
  return value === "sync"
    || value === "start"
    || value === "retreat"
    || value === "pokecenter"
    || value === "capture_policy"
    || value === "potion_policy"
    || value === "revive_policy";
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

function sameIntent(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function jsonSafe(value: unknown): boolean {
  try {
    const encoded = JSON.stringify(value);
    return encoded !== undefined && new TextEncoder().encode(encoded).byteLength <= MAX_STORED_BYTES;
  } catch {
    return false;
  }
}

function decode(raw: string | null): StoredHuntCommand | null | "invalid" {
  if (raw === null) return null;
  if (new TextEncoder().encode(raw).byteLength > MAX_STORED_BYTES) return "invalid";
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return "invalid";
    const row = value as Record<string, unknown>;
    if (
      Object.keys(row).length !== 4
      || !isFamily(row.family)
      || typeof row.key !== "string"
      || !UUID_RE.test(row.key)
      || typeof row.playerFingerprint !== "string"
      || !HEX_256_RE.test(row.playerFingerprint)
      || !jsonSafe(row.intent)
    ) return "invalid";
    return {
      family: row.family,
      key: row.key,
      playerFingerprint: row.playerFingerprint,
      intent: row.intent,
    };
  } catch {
    return "invalid";
  }
}

export async function fingerprintPlayerId(playerId: string): Promise<string> {
  if (!UUID_RE.test(playerId)) throw new Error("A verified self-scoped Player identity is required");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(playerId));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class HuntCommandStore {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">) {}

  private inspectWithFingerprint(playerFingerprint: string): HuntCommandStoreState {
    const stored = decode(this.storage.getItem(STORAGE_KEY));
    if (stored === null) return { kind: "none" };
    if (stored === "invalid") return { kind: "unavailable" };
    return stored.playerFingerprint === playerFingerprint
      ? { kind: "resume", family: stored.family, key: stored.key, intent: stored.intent }
      : { kind: "different_player" };
  }

  async inspect(playerId: string): Promise<HuntCommandStoreState> {
    try {
      const fingerprint = await fingerprintPlayerId(playerId);
      return this.inspectWithFingerprint(fingerprint);
    } catch {
      return { kind: "unavailable" };
    }
  }

  async begin(
    playerId: string,
    family: HuntCommandFamily,
    intent: unknown,
    signal?: AbortSignal,
  ): Promise<FrozenHuntCommand> {
    if (!jsonSafe(intent)) throw new Error("Hunt command intent is not safely serializable");
    if (signal?.aborted) throw new Error("Hunt command freeze was aborted");
    const playerFingerprint = await fingerprintPlayerId(playerId);
    if (signal?.aborted) throw new Error("Hunt command freeze was aborted");

    // Re-read synchronously after the only await. This makes concurrent begin()
    // calls converge on the first durable key instead of overwriting one another.
    const existing = this.inspectWithFingerprint(playerFingerprint);
    if (existing.kind === "resume") {
      if (existing.family !== family || !sameIntent(existing.intent, intent)) {
        throw new Error("Another unresolved Hunt command must be reconciled before a new intent");
      }
      return existing;
    }
    if (existing.kind !== "none") {
      throw new Error("Hunt command correlation storage is unavailable or belongs to another Player");
    }
    const frozen: StoredHuntCommand = {
      family,
      key: crypto.randomUUID(),
      playerFingerprint,
      intent,
    };
    if (signal?.aborted) throw new Error("Hunt command freeze was aborted");
    this.storage.setItem(STORAGE_KEY, JSON.stringify(frozen));
    // setItem/getItem are synchronous. No cancelled effect or competing begin()
    // can interleave between the final abort check, durable write and confirm.
    const confirmed = this.inspectWithFingerprint(playerFingerprint);
    if (
      confirmed.kind !== "resume"
      || confirmed.family !== family
      || confirmed.key !== frozen.key
      || !sameIntent(confirmed.intent, intent)
    ) {
      throw new Error("Unable to durably freeze the Hunt command before transmission");
    }
    return confirmed;
  }

  async clear(playerId: string, key: string): Promise<boolean> {
    const current = await this.inspect(playerId);
    if (current.kind !== "resume" || current.key !== key) return false;
    try {
      this.storage.removeItem(STORAGE_KEY);
      return (await this.inspect(playerId)).kind === "none";
    } catch {
      return false;
    }
  }

  async discardAfterReconciliation(playerId: string): Promise<boolean> {
    const current = await this.inspect(playerId);
    if (current.kind !== "resume" && current.kind !== "different_player") return false;
    try {
      this.storage.removeItem(STORAGE_KEY);
      return (await this.inspect(playerId)).kind === "none";
    } catch {
      return false;
    }
  }
}

export function browserHuntCommandStore(): HuntCommandStore {
  return new HuntCommandStore(window.sessionStorage);
}
