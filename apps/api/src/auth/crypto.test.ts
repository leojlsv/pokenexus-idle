import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  deriveBoundCsrfToken,
  digestBearerSecret,
  generateBearerSecret,
  pseudonymousTargetKey,
  verifyBoundCsrfToken,
} from "./crypto";

describe("authentication crypto primitives", () => {
  it("generates at least 256 bits of opaque bearer entropy and stable digests", async () => {
    const secret = generateBearerSecret();
    expect(Buffer.from(secret, "base64url").byteLength).toBeGreaterThanOrEqual(32);
    expect(await digestBearerSecret(secret)).toEqual(await digestBearerSecret(secret));
    expect(await digestBearerSecret(secret)).not.toEqual(
      await digestBearerSecret(generateBearerSecret()),
    );
  });

  it("derives stable keyed target keys without embedding the canonical email", async () => {
    const first = await pseudonymousTargetKey("user@example.com", "server-key");
    const second = await pseudonymousTargetKey("user@example.com", "server-key");
    expect(first).toEqual(second);
    expect(Buffer.from(first).toString("utf8")).not.toContain("user@example.com");
    expect(await pseudonymousTargetKey("user@example.com", "other-key")).not.toEqual(first);
  });

  it("binds CSRF proof to the server-known session or flow identity", async () => {
    const token = await deriveBoundCsrfToken("session-1", "csrf-secret");
    expect(await verifyBoundCsrfToken(token, "session-1", "csrf-secret")).toBe(true);
    expect(await verifyBoundCsrfToken(token, "session-2", "csrf-secret")).toBe(false);
    expect(await verifyBoundCsrfToken("garbage", "session-1", "csrf-secret")).toBe(false);
  });

  it("performs exact constant-time byte equality semantics", () => {
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
  });
});
