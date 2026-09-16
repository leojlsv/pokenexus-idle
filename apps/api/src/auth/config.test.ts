import { describe, expect, it } from "vitest";
import { createAuthConfig, type AuthEnvironment } from "./config";

function environment(overrides: Partial<AuthEnvironment> = {}): AuthEnvironment {
  return {
    HYPERDRIVE: { connectionString: "postgresql://worker.invalid/pokenexus" },
    AUTH_RP_ID: "example.com",
    AUTH_ALLOWED_ORIGINS: "https://example.com,https://app.example.com",
    AUTH_TARGET_HMAC_KEY: "target-key-material-at-least-32-bytes",
    AUTH_CSRF_KEY: "csrf-key-material-at-least-32-bytes---",
    ...overrides,
  };
}

describe("auth configuration", () => {
  it("uses finite ADR-006 defaults and exact origins", () => {
    const config = createAuthConfig(environment());
    expect(config.allowedOrigins).toEqual(["https://example.com", "https://app.example.com"]);
    expect(config.session).toEqual({
      absoluteLifetimeMs: 30 * 24 * 60 * 60 * 1000,
      inactivityLifetimeMs: 7 * 24 * 60 * 60 * 1000,
      recentAuthLifetimeMs: 10 * 60 * 1000,
    });
    expect(config.emailActionTtlMs).toBe(15 * 60 * 1000);
    expect(config.restrictedFlowTtlMs).toBe(15 * 60 * 1000);
    expect(config.webAuthnChallengeTtlMs).toBe(5 * 60 * 1000);
    expect(config.postRecoveryHoldMs).toBe(24 * 60 * 60 * 1000);
    expect(config.issuance).toEqual({
      baseCooldownMs: 60_000,
      maxCooldownMs: 60 * 60 * 1000,
      maxBackoffLevel: 6,
    });
  });

  it("fails closed on longer security windows, invalid origins, and unbounded cooldown config", () => {
    expect(() =>
      createAuthConfig(environment({ AUTH_SESSION_ABSOLUTE_TTL_MS: String(30 * 24 * 60 * 60 * 1000 + 1) })),
    ).toThrow(/AUTH_SESSION_ABSOLUTE_TTL_MS/);
    expect(() =>
      createAuthConfig(environment({ AUTH_WEBAUTHN_CHALLENGE_TTL_MS: String(5 * 60 * 1000 + 1) })),
    ).toThrow(/AUTH_WEBAUTHN_CHALLENGE_TTL_MS/);
    expect(() =>
      createAuthConfig(environment({ AUTH_ALLOWED_ORIGINS: "https://example.com/path" })),
    ).toThrow(/exact HTTPS origins/);
    expect(() =>
      createAuthConfig(environment({ AUTH_ALLOWED_ORIGINS: "https://example.com,https://example.com" })),
    ).toThrow(/unique exact origins/);
    expect(() =>
      createAuthConfig(
        environment({
          AUTH_ISSUANCE_BASE_COOLDOWN_MS: "60000",
          AUTH_ISSUANCE_MAX_COOLDOWN_MS: "30000",
        }),
      ),
    ).toThrow(/must be >= base cooldown/);
  });

  it("rejects missing or weak CSRF/HMAC secret material", () => {
    expect(() => createAuthConfig(environment({ AUTH_CSRF_KEY: undefined }))).toThrow(
      /AUTH_CSRF_KEY is required/,
    );
    expect(() => createAuthConfig(environment({ AUTH_CSRF_KEY: "short" }))).toThrow(
      /AUTH_CSRF_KEY must contain at least 32 UTF-8 bytes/,
    );
    expect(() => createAuthConfig(environment({ AUTH_TARGET_HMAC_KEY: "short" }))).toThrow(
      /AUTH_TARGET_HMAC_KEY must contain at least 32 UTF-8 bytes/,
    );
  });

  it("rejects wildcard or non-host RP IDs and origins outside the RP ID", () => {
    expect(() => createAuthConfig(environment({ AUTH_RP_ID: "*.example.com" }))).toThrow(
      /bare hostname without wildcards/,
    );
    expect(() => createAuthConfig(environment({ AUTH_RP_ID: "https://example.com" }))).toThrow(
      /bare hostname/,
    );
    expect(() =>
      createAuthConfig(environment({ AUTH_ALLOWED_ORIGINS: "https://*.example.com" })),
    ).toThrow(/must not contain wildcards/);
    expect(() =>
      createAuthConfig(environment({ AUTH_ALLOWED_ORIGINS: "https://unrelated.example.net" })),
    ).toThrow(/must belong to AUTH_RP_ID/);
  });
});
