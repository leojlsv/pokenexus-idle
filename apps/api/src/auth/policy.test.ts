import { describe, expect, it } from "vitest";
import {
  assertSessionPolicy,
  isPostRecoveryEligible,
  isRecentAuthentication,
} from "./policy";

describe("session and security policy", () => {
  it("accepts shorter session limits and rejects limits beyond ADR-006", () => {
    expect(() =>
      assertSessionPolicy({
        absoluteLifetimeMs: 30 * 24 * 60 * 60 * 1000,
        inactivityLifetimeMs: 7 * 24 * 60 * 60 * 1000,
        recentAuthLifetimeMs: 10 * 60 * 1000,
      }),
    ).not.toThrow();
    expect(() =>
      assertSessionPolicy({
        absoluteLifetimeMs: 30 * 24 * 60 * 60 * 1000 + 1,
        inactivityLifetimeMs: 1,
        recentAuthLifetimeMs: 1,
      }),
    ).toThrow();
    expect(() =>
      assertSessionPolicy({
        absoluteLifetimeMs: 1,
        inactivityLifetimeMs: 7 * 24 * 60 * 60 * 1000 + 1,
        recentAuthLifetimeMs: 1,
      }),
    ).toThrow();
    expect(() =>
      assertSessionPolicy({
        absoluteLifetimeMs: 1,
        inactivityLifetimeMs: 1,
        recentAuthLifetimeMs: 10 * 60 * 1000 + 1,
      }),
    ).toThrow();
  });

  it("requires both hold eligibility and recent passkey authentication", () => {
    const now = new Date("2026-09-16T12:00:00.000Z");
    expect(isPostRecoveryEligible(null, now)).toBe(true);
    expect(isPostRecoveryEligible(new Date("2026-09-16T11:59:59.999Z"), now)).toBe(true);
    expect(isPostRecoveryEligible(new Date("2026-09-16T12:00:00.001Z"), now)).toBe(false);
    expect(
      isRecentAuthentication(
        new Date("2026-09-16T11:51:00.000Z"),
        now,
        10 * 60 * 1000,
      ),
    ).toBe(true);
    expect(
      isRecentAuthentication(
        new Date("2026-09-16T11:49:59.999Z"),
        now,
        10 * 60 * 1000,
      ),
    ).toBe(false);
  });
});
