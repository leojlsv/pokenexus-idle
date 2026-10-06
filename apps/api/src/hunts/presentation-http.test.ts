import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AuthSessionPrincipal } from "../auth/application";
import type { ApiContext } from "../auth/http";
import { createPresentationCursorCodec } from "./presentation-cursor";
import {
  handleHuntPresentationHttp,
  type HuntPresentationHttpOptions,
} from "./presentation-http";
import type { HuntPresentationReadRequest } from "./presentation-read";

const accountId = "0199472a-0000-7000-8000-000000000001";
const playerId = "0199472a-0000-7000-8000-000000000002";
const huntId = "0199472a-0000-7000-8000-000000000003";
const now = 1_800_000_000_000;
const principal: AuthSessionPrincipal = {
  accountId,
  sessionId: "0199472a-0000-7000-8000-000000000004",
  bearerDigest: new Uint8Array(32).fill(7),
  securityEpoch: 0n,
  recentAuthAt: new Date(now - 1000),
  postRecoveryHoldUntil: null,
};
const codec = createPresentationCursorCodec("current", {
  current: new Uint8Array(32).fill(43),
});

function fixture(overrides: Partial<HuntPresentationHttpOptions> = {}) {
  const reads: HuntPresentationReadRequest[] = [];
  const playerLookups: string[] = [];
  let sessionChecks = 0;
  const options: HuntPresentationHttpOptions = {
    security: {
      requireSession: async () => {
        sessionChecks += 1;
        return principal;
      },
    },
    playerIdFor: async (_c, requestedAccountId) => {
      playerLookups.push(requestedAccountId);
      return playerId;
    },
    cursorCodecFor: () => codec,
    readFor: async (_c, request) => {
      reads.push(request);
      return { httpStatus: 200, body: { ok: true } };
    },
    nowMs: () => now,
    ...overrides,
  };
  const app = new Hono();
  app.get("/player/hunts/:huntId/presentation", (c) =>
    handleHuntPresentationHttp(c as unknown as ApiContext, options));
  return { app, reads, playerLookups, sessionChecks: () => sessionChecks };
}

describe("TASK-103 disabled presentation HTTP boundary conformance", () => {
  it("derives Player authority only from the authenticated account and keeps GET private/no-store", async () => {
    const test = fixture();
    const selected = await test.app.request(
      "/player/hunts/" + huntId + "/presentation?limit=32&playerId=attacker",
    );
    expect(selected.status).toBe(400);
    expect(test.reads).toHaveLength(0);

    const ok = await test.app.request("/player/hunts/" + huntId + "/presentation?limit=32");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    expect(ok.headers.get("content-type")).toBe("application/json; charset=UTF-8");
    expect(test.playerLookups).toEqual([accountId]);
    expect(test.reads).toHaveLength(1);
    expect(test.reads[0]).toMatchObject({
      playerId,
      huntId,
      limit: 32,
      nowMs: now,
    });
    expect(test.sessionChecks()).toBe(2);
  });

  it("preserves session failures and missing Player identity without invoking the presentation reader", async () => {
    const unauthorized = fixture({
      security: {
        requireSession: async () => new Response(
          JSON.stringify({ error: "unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      },
    });
    const denied = await unauthorized.app.request("/player/hunts/" + huntId + "/presentation");
    expect(denied.status).toBe(401);
    expect(denied.headers.get("cache-control")).toBe("private, no-store");
    expect(unauthorized.reads).toHaveLength(0);

    const noProfile = fixture({ playerIdFor: async () => null });
    const missing = await noProfile.app.request("/player/hunts/" + huntId + "/presentation");
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({ error: "not_found" });
    expect(noProfile.reads).toHaveLength(0);
  });

  it("fails closed on malformed selectors/query and passes through bounded snapshot/retention failures", async () => {
    const invalid = fixture();
    for (const path of [
      "/player/hunts/not-a-uuid/presentation",
      "/player/hunts/" + huntId + "/presentation?limit=129",
      "/player/hunts/" + huntId + "/presentation?cursor=a&cursor=b",
      "/player/hunts/" + huntId + "/presentation?unknown=1",
    ]) {
      const response = await invalid.app.request(path);
      expect(response.status, path).toBe(400);
    }
    expect(invalid.reads).toHaveLength(0);

    for (const [status, code] of [
      [409, "snapshot_changed"],
      [410, "cursor_expired"],
      [410, "presentation_expired"],
      [410, "presentation_unavailable"],
    ] as const) {
      const test = fixture({
        readFor: async () => ({ httpStatus: status, body: { error: code } }),
      });
      const response = await test.app.request("/player/hunts/" + huntId + "/presentation");
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      await expect(response.json()).resolves.toEqual({ error: code });
    }
  });
});
