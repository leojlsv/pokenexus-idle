const STORAGE_KEY = "pokenexus:player:pending-team-create:v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX_PATTERN = /^[0-9a-f]{64}$/;

interface PersistedIntent {
  readonly key: string;
  readonly sessionFingerprint: string;
}

export type TeamCreateIntentState =
  | { readonly kind: "none" }
  | { readonly kind: "resume"; readonly key: string }
  | { readonly kind: "different_session" }
  | { readonly kind: "unavailable" };

function persistedIntent(raw: string | null): PersistedIntent | null | "invalid" {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return "invalid";
    const data = value as Record<string, unknown>;
    if (typeof data.key !== "string" || !UUID_PATTERN.test(data.key)
      || typeof data.sessionFingerprint !== "string" || !HEX_PATTERN.test(data.sessionFingerprint)) {
      return "invalid";
    }
    return { key: data.key, sessionFingerprint: data.sessionFingerprint };
  } catch {
    return "invalid";
  }
}

async function fingerprint(csrfToken: string): Promise<string> {
  if (!csrfToken) throw new Error("A session-bound CSRF token is required");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(csrfToken));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Store only the command UUID and an irreversible session marker, never the CSRF token. */
export class TeamCreateIntentStore {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">) {}

  async inspect(csrfToken: string): Promise<TeamCreateIntentState> {
    try {
      const marker = await fingerprint(csrfToken);
      const record = persistedIntent(this.storage.getItem(STORAGE_KEY));
      if (record === null) return { kind: "none" };
      if (record === "invalid") return { kind: "unavailable" };
      return record.sessionFingerprint === marker
        ? { kind: "resume", key: record.key }
        : { kind: "different_session" };
    } catch {
      return { kind: "unavailable" };
    }
  }

  async begin(csrfToken: string): Promise<string> {
    const state = await this.inspect(csrfToken);
    if (state.kind === "resume") return state.key;
    if (state.kind !== "none") throw new Error("An unresolved Team-create identity cannot be safely replaced");
    const key = crypto.randomUUID();
    const marker = await fingerprint(csrfToken);
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ key, sessionFingerprint: marker } satisfies PersistedIntent));
    // Never send the mutation without first persisting its exact retry identity.
    const confirmed = await this.inspect(csrfToken);
    if (confirmed.kind !== "resume" || confirmed.key !== key) throw new Error("Team-create identity could not be persisted");
    return key;
  }

  async clear(csrfToken: string, key: string): Promise<boolean> {
    const state = await this.inspect(csrfToken);
    if (state.kind !== "resume" || state.key !== key) return false;
    try {
      this.storage.removeItem(STORAGE_KEY);
      return (await this.inspect(csrfToken)).kind === "none";
    } catch {
      return false;
    }
  }

  async discardDifferentSession(): Promise<boolean> {
    try {
      this.storage.removeItem(STORAGE_KEY);
      return this.storage.getItem(STORAGE_KEY) === null;
    } catch {
      return false;
    }
  }
}

export function browserTeamCreateIntentStore(): TeamCreateIntentStore {
  return new TeamCreateIntentStore(window.sessionStorage);
}
