import { createHash, timingSafeEqual } from "node:crypto";
import type { AuthSessionPrincipal } from "./auth/application";
import type { AuthEnvironment } from "./auth/config";
import type { AuthHttpApplication, AuthHttpRuntime } from "./auth/http";

export interface LocalPrealphaAuthEnvironment extends AuthEnvironment {
  readonly LOCAL_PREALPHA_ENABLED?: string;
  readonly LOCAL_PREALPHA_ALLOWED_ORIGINS?: string;
  readonly LOCAL_PREALPHA_SESSION_A?: string;
  readonly LOCAL_PREALPHA_ACCOUNT_A?: string;
  readonly LOCAL_PREALPHA_SESSION_B?: string;
  readonly LOCAL_PREALPHA_ACCOUNT_B?: string;
}

interface LocalIdentity {
  readonly bearer: string;
  readonly accountId: string;
  readonly sessionId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for the local Pre-alpha entry`);
  return value;
}

function parseOrigins(raw: string | undefined): readonly string[] {
  const values = required(raw, "LOCAL_PREALPHA_ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.length) throw new Error("LOCAL_PREALPHA_ALLOWED_ORIGINS must not be empty");
  for (const value of values) {
    const origin = new URL(value);
    const loopback = origin.hostname === "localhost" || origin.hostname === "127.0.0.1" || origin.hostname === "[::1]";
    if (!loopback || (origin.protocol !== "http:" && origin.protocol !== "https:") ||
      origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) {
      throw new Error("Local Pre-alpha origins must be clean loopback HTTP(S) origins");
    }
  }
  return values;
}

function identity(label: "A" | "B", bearer: string | undefined, accountId: string | undefined): LocalIdentity | null {
  if (!bearer && !accountId && label === "B") return null;
  const resolvedBearer = required(bearer, `LOCAL_PREALPHA_SESSION_${label}`);
  const resolvedAccount = required(accountId, `LOCAL_PREALPHA_ACCOUNT_${label}`);
  if (!UUID.test(resolvedAccount)) throw new Error(`LOCAL_PREALPHA_ACCOUNT_${label} must be a UUID`);
  return {
    bearer: resolvedBearer,
    accountId: resolvedAccount,
    sessionId: label === "A"
      ? "019a7f50-0000-7000-8000-0000000000a1"
      : "019a7f50-0000-7000-8000-0000000000b2",
  };
}

function sameSecret(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

function csrfFor(sessionId: string): string {
  return createHash("sha256").update(`pokenexus-local-prealpha-csrf-v1\0${sessionId}`).digest("base64url");
}

function principal(record: LocalIdentity): AuthSessionPrincipal {
  return {
    accountId: record.accountId,
    sessionId: record.sessionId,
    bearerDigest: new Uint8Array(createHash("sha256").update(record.bearer).digest()),
    securityEpoch: 0n,
    recentAuthAt: null,
    postRecoveryHoldUntil: null,
  };
}

function unsupported(name: string): never {
  throw new Error(`${name} is unavailable in the local Pre-alpha fixture auth surface`);
}

export function createLocalPrealphaAuthRuntime(env: LocalPrealphaAuthEnvironment): AuthHttpRuntime {
  if (env.LOCAL_PREALPHA_ENABLED !== "1") {
    throw new Error("Local Pre-alpha auth is disabled");
  }
  const identities = [
    identity("A", env.LOCAL_PREALPHA_SESSION_A, env.LOCAL_PREALPHA_ACCOUNT_A),
    identity("B", env.LOCAL_PREALPHA_SESSION_B, env.LOCAL_PREALPHA_ACCOUNT_B),
  ].filter((value): value is LocalIdentity => value !== null);

  const auth = new Proxy<Partial<AuthHttpApplication>>({
    async authenticateSession(rawBearer) {
      const match = identities.find(({ bearer }) => sameSecret(bearer, rawBearer));
      return match ? principal(match) : null;
    },
    async verifySessionCsrf(sessionId, token) {
      return sameSecret(csrfFor(sessionId), token);
    },
    async sessionCsrf(sessionId) {
      if (!identities.some((entry) => entry.sessionId === sessionId)) return unsupported("sessionCsrf");
      return csrfFor(sessionId);
    },
    async logout() {
      return true;
    },
    async authorizeSecurityOperation() {
      return false;
    },
    async listSessions() {
      return null;
    },
  }, {
    get(target, property) {
      if (property in target) return target[property as keyof typeof target];
      if (typeof property !== "string") return undefined;
      return () => Promise.reject(new Error(`${property} is unavailable in the local Pre-alpha fixture auth surface`));
    },
  }) as AuthHttpApplication;

  return { auth, allowedOrigins: parseOrigins(env.LOCAL_PREALPHA_ALLOWED_ORIGINS) };
}

