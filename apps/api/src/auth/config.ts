import { domainToASCII } from "node:url";
import { assertSessionPolicy, MAX_SESSION_POLICY, type SessionPolicy } from "./policy";
import type { WebAuthnConfig } from "./webauthn";

export interface AuthEnvironment {
  readonly HYPERDRIVE?: { readonly connectionString: string };
  readonly AUTH_RP_ID?: string;
  readonly AUTH_ALLOWED_ORIGINS?: string;
  readonly AUTH_TARGET_HMAC_KEY?: string;
  readonly AUTH_CSRF_KEY?: string;
  readonly AUTH_EMAIL_ACTION_TTL_MS?: string;
  readonly AUTH_RESTRICTED_FLOW_TTL_MS?: string;
  readonly AUTH_WEBAUTHN_CHALLENGE_TTL_MS?: string;
  readonly AUTH_SESSION_ABSOLUTE_TTL_MS?: string;
  readonly AUTH_SESSION_INACTIVITY_TTL_MS?: string;
  readonly AUTH_RECENT_AUTH_TTL_MS?: string;
  readonly AUTH_ISSUANCE_BASE_COOLDOWN_MS?: string;
  readonly AUTH_ISSUANCE_MAX_COOLDOWN_MS?: string;
  readonly AUTH_ISSUANCE_MAX_BACKOFF_LEVEL?: string;
  readonly AUTH_SIGNIN_BASE_COOLDOWN_MS?: string;
  readonly AUTH_SIGNIN_MAX_COOLDOWN_MS?: string;
  readonly AUTH_SIGNIN_MAX_BACKOFF_LEVEL?: string;
}

export interface AuthConfig extends WebAuthnConfig {
  readonly connectionString: string;
  readonly targetHmacKey: string;
  readonly csrfKey: string;
  readonly emailActionTtlMs: number;
  readonly restrictedFlowTtlMs: number;
  readonly webAuthnChallengeTtlMs: number;
  readonly postRecoveryHoldMs: number;
  readonly session: SessionPolicy;
  readonly issuance: {
    readonly baseCooldownMs: number;
    readonly maxCooldownMs: number;
    readonly maxBackoffLevel: number;
  };
  readonly signInAbuse: {
    readonly baseCooldownMs: number;
    readonly maxCooldownMs: number;
    readonly maxBackoffLevel: number;
  };
}

const MAX_EMAIL_ACTION_TTL_MS = 15 * 60 * 1000;
const MAX_RESTRICTED_FLOW_TTL_MS = 15 * 60 * 1000;
const MAX_WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const POST_RECOVERY_HOLD_MS = 24 * 60 * 60 * 1000;

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  name: string,
  maximum: number,
): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be a positive safe integer <= ${maximum}`);
  }
  return value;
}

function required(value: string | undefined, name: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requiredSecuritySecret(value: string | undefined, name: string): string {
  const secret = required(value, name);
  if (new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error(`${name} must contain at least 32 UTF-8 bytes`);
  }
  return secret;
}

function canonicalRpId(raw: string | undefined): string {
  const value = required(raw, "AUTH_RP_ID");
  if (value !== value.trim() || value.includes("*")) {
    throw new Error("AUTH_RP_ID must be a bare hostname without wildcards");
  }
  const ascii = domainToASCII(value).toLowerCase();
  if (
    !ascii ||
    ascii.includes(":") ||
    ascii.includes("/") ||
    ascii.startsWith(".") ||
    ascii.endsWith(".")
  ) {
    throw new Error("AUTH_RP_ID must be a bare hostname without scheme, path, or port");
  }
  const labels = ascii.split(".");
  if (
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        label.startsWith("-") ||
        label.endsWith("-") ||
        !/^[a-z0-9-]+$/.test(label),
    )
  ) {
    throw new Error("AUTH_RP_ID must be a valid hostname");
  }
  return ascii;
}

export function createAuthConfig(env: AuthEnvironment): AuthConfig {
  const rpId = canonicalRpId(env.AUTH_RP_ID);
  const allowedOrigins = required(env.AUTH_ALLOWED_ORIGINS, "AUTH_ALLOWED_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowedOrigins.length === 0 || new Set(allowedOrigins).size !== allowedOrigins.length) {
    throw new Error("AUTH_ALLOWED_ORIGINS must contain unique exact origins");
  }
  for (const origin of allowedOrigins) {
    if (origin.includes("*")) {
      throw new Error("AUTH_ALLOWED_ORIGINS must not contain wildcards");
    }
    const parsed = new URL(origin);
    if (parsed.origin !== origin || (parsed.protocol !== "https:" && parsed.hostname !== "localhost")) {
      throw new Error("AUTH_ALLOWED_ORIGINS must contain exact HTTPS origins or localhost development origins");
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      rpId === "localhost"
        ? hostname !== "localhost"
        : hostname !== rpId && !hostname.endsWith(`.${rpId}`)
    ) {
      throw new Error("AUTH_ALLOWED_ORIGINS must belong to AUTH_RP_ID");
    }
  }

  const session = {
    absoluteLifetimeMs: boundedInteger(
      env.AUTH_SESSION_ABSOLUTE_TTL_MS,
      MAX_SESSION_POLICY.absoluteLifetimeMs,
      "AUTH_SESSION_ABSOLUTE_TTL_MS",
      MAX_SESSION_POLICY.absoluteLifetimeMs,
    ),
    inactivityLifetimeMs: boundedInteger(
      env.AUTH_SESSION_INACTIVITY_TTL_MS,
      MAX_SESSION_POLICY.inactivityLifetimeMs,
      "AUTH_SESSION_INACTIVITY_TTL_MS",
      MAX_SESSION_POLICY.inactivityLifetimeMs,
    ),
    recentAuthLifetimeMs: boundedInteger(
      env.AUTH_RECENT_AUTH_TTL_MS,
      MAX_SESSION_POLICY.recentAuthLifetimeMs,
      "AUTH_RECENT_AUTH_TTL_MS",
      MAX_SESSION_POLICY.recentAuthLifetimeMs,
    ),
  } satisfies SessionPolicy;
  assertSessionPolicy(session);

  const baseCooldownMs = boundedInteger(
    env.AUTH_ISSUANCE_BASE_COOLDOWN_MS,
    60_000,
    "AUTH_ISSUANCE_BASE_COOLDOWN_MS",
    60 * 60 * 1000,
  );
  const maxCooldownMs = boundedInteger(
    env.AUTH_ISSUANCE_MAX_COOLDOWN_MS,
    60 * 60 * 1000,
    "AUTH_ISSUANCE_MAX_COOLDOWN_MS",
    24 * 60 * 60 * 1000,
  );
  if (maxCooldownMs < baseCooldownMs) {
    throw new Error("AUTH_ISSUANCE_MAX_COOLDOWN_MS must be >= base cooldown");
  }
  const maxBackoffLevel = boundedInteger(
    env.AUTH_ISSUANCE_MAX_BACKOFF_LEVEL,
    6,
    "AUTH_ISSUANCE_MAX_BACKOFF_LEVEL",
    6,
  );
  const signInBaseCooldownMs = boundedInteger(
    env.AUTH_SIGNIN_BASE_COOLDOWN_MS,
    1_000,
    "AUTH_SIGNIN_BASE_COOLDOWN_MS",
    60_000,
  );
  const signInMaxCooldownMs = boundedInteger(
    env.AUTH_SIGNIN_MAX_COOLDOWN_MS,
    60_000,
    "AUTH_SIGNIN_MAX_COOLDOWN_MS",
    15 * 60 * 1000,
  );
  if (signInMaxCooldownMs < signInBaseCooldownMs) {
    throw new Error("AUTH_SIGNIN_MAX_COOLDOWN_MS must be >= sign-in base cooldown");
  }
  const signInMaxBackoffLevel = boundedInteger(
    env.AUTH_SIGNIN_MAX_BACKOFF_LEVEL,
    6,
    "AUTH_SIGNIN_MAX_BACKOFF_LEVEL",
    6,
  );

  return {
    connectionString: required(env.HYPERDRIVE?.connectionString, "HYPERDRIVE.connectionString"),
    rpId,
    rpName: "PokeNexus",
    allowedOrigins,
    targetHmacKey: requiredSecuritySecret(env.AUTH_TARGET_HMAC_KEY, "AUTH_TARGET_HMAC_KEY"),
    csrfKey: requiredSecuritySecret(env.AUTH_CSRF_KEY, "AUTH_CSRF_KEY"),
    emailActionTtlMs: boundedInteger(
      env.AUTH_EMAIL_ACTION_TTL_MS,
      MAX_EMAIL_ACTION_TTL_MS,
      "AUTH_EMAIL_ACTION_TTL_MS",
      MAX_EMAIL_ACTION_TTL_MS,
    ),
    restrictedFlowTtlMs: boundedInteger(
      env.AUTH_RESTRICTED_FLOW_TTL_MS,
      MAX_RESTRICTED_FLOW_TTL_MS,
      "AUTH_RESTRICTED_FLOW_TTL_MS",
      MAX_RESTRICTED_FLOW_TTL_MS,
    ),
    webAuthnChallengeTtlMs: boundedInteger(
      env.AUTH_WEBAUTHN_CHALLENGE_TTL_MS,
      MAX_WEBAUTHN_CHALLENGE_TTL_MS,
      "AUTH_WEBAUTHN_CHALLENGE_TTL_MS",
      MAX_WEBAUTHN_CHALLENGE_TTL_MS,
    ),
    postRecoveryHoldMs: POST_RECOVERY_HOLD_MS,
    session,
    issuance: { baseCooldownMs, maxCooldownMs, maxBackoffLevel },
    signInAbuse: {
      baseCooldownMs: signInBaseCooldownMs,
      maxCooldownMs: signInMaxCooldownMs,
      maxBackoffLevel: signInMaxBackoffLevel,
    },
  };
}
