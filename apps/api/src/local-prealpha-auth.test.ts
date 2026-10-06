import { describe, expect, it } from "vitest";
import { createLocalPrealphaAuthRuntime } from "./local-prealpha-auth";

const env = {
  LOCAL_PREALPHA_ENABLED: "1",
  LOCAL_PREALPHA_ALLOWED_ORIGINS: "http://localhost:5173,http://localhost:5174",
  LOCAL_PREALPHA_SESSION_A: "local-session-a",
  LOCAL_PREALPHA_ACCOUNT_A: "019a7f50-0000-7000-8000-000000000001",
  LOCAL_PREALPHA_SESSION_B: "local-session-b",
  LOCAL_PREALPHA_ACCOUNT_B: "019a7f50-0000-7000-8000-000000000002",
};

describe("local Pre-alpha auth fixture", () => {
  it("is explicitly enabled, loopback-only and maps A/B to distinct principals", async () => {
    const runtime = createLocalPrealphaAuthRuntime(env);
    const a = await runtime.auth.authenticateSession("local-session-a");
    const b = await runtime.auth.authenticateSession("local-session-b");
    expect(a?.accountId).not.toBe(b?.accountId);
    expect(await runtime.auth.authenticateSession("wrong")).toBeNull();
    expect(runtime.allowedOrigins).toEqual(["http://localhost:5173", "http://localhost:5174"]);
  });

  it("binds CSRF to each local session", async () => {
    const runtime = createLocalPrealphaAuthRuntime(env);
    const a = await runtime.auth.authenticateSession("local-session-a");
    const b = await runtime.auth.authenticateSession("local-session-b");
    const tokenA = await runtime.auth.sessionCsrf(a!.sessionId);
    expect(await runtime.auth.verifySessionCsrf(a!.sessionId, tokenA)).toBe(true);
    expect(await runtime.auth.verifySessionCsrf(b!.sessionId, tokenA)).toBe(false);
  });

  it("fails closed when disabled or configured with non-loopback origins", () => {
    expect(() => createLocalPrealphaAuthRuntime({ ...env, LOCAL_PREALPHA_ENABLED: "0" }))
      .toThrow(/disabled/);
    expect(() => createLocalPrealphaAuthRuntime({
      ...env,
      LOCAL_PREALPHA_ALLOWED_ORIGINS: "https://example.com",
    })).toThrow(/loopback/);
  });
});

