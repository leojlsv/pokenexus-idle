import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AuthSessionPrincipal } from "../auth/application";
import type { ApiBindings, ApiVariables } from "../auth/http";
import type { PlayerHttpApplication, PlayerProfileIdentity } from "./application";
import { registerPlayerRoutes } from "./http";

const accountId = "0199472a-0000-7000-8000-000000000001";
const playerId = "0199472a-0000-7000-8000-000000000002";
const principal: AuthSessionPrincipal = {
  accountId,
  sessionId: "0199472a-0000-7000-8000-000000000003",
  bearerDigest: new Uint8Array(32),
  securityEpoch: 0n,
  recentAuthAt: null,
  postRecoveryHoldUntil: null,
};

class FakePlayerApplication implements PlayerHttpApplication {
  readonly loads: string[] = [];
  readonly creates: string[] = [];
  profile: PlayerProfileIdentity | null = { playerId };

  async loadProfile(requestAccountId: string): Promise<PlayerProfileIdentity | null> {
    this.loads.push(requestAccountId);
    return this.profile;
  }

  async createOrLoadProfile(requestAccountId: string): Promise<PlayerProfileIdentity> {
    this.creates.push(requestAccountId);
    return { playerId };
  }
}

function createTestApp(input: {
  readonly player?: FakePlayerApplication;
  readonly sessionResult?: AuthSessionPrincipal | Response;
  readonly mutationResult?: AuthSessionPrincipal | Response;
} = {}) {
  const app = new Hono<{ Bindings: ApiBindings; Variables: ApiVariables }>();
  const player = input.player ?? new FakePlayerApplication();
  registerPlayerRoutes(app, {
    playerFor: () => player,
    security: {
      requireSession: async () => input.sessionResult ?? principal,
      requireSessionMutation: async () => input.mutationResult ?? principal,
    },
  });
  return { app, player };
}

describe("player profile HTTP routes", () => {
  it("loads only the authenticated account profile identity", async () => {
    const { app, player } = createTestApp();
    const response = await app.request("/player/profile", {}, {} as ApiBindings);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ playerId });
    expect(player.loads).toEqual([accountId]);
  });

  it("returns the exact bounded not-found body when no player exists", async () => {
    const player = new FakePlayerApplication();
    player.profile = null;
    const { app } = createTestApp({ player });

    const response = await app.request("/player/profile", {}, {} as ApiBindings);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });

  it("creates or loads using authenticated authority only", async () => {
    const { app, player } = createTestApp();
    const response = await app.request("/player/profile", { method: "PUT" }, {} as ApiBindings);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ playerId });
    expect(player.creates).toEqual([accountId]);
  });

  it("does not let client selectors or profile fields influence authenticated authority", async () => {
    const { app, player } = createTestApp();
    const selected = await app.request(
      "/player/profile?accountId=0199472a-0000-7000-8000-000000000099",
      {},
      {} as ApiBindings,
    );
    const payload = await app.request(
      "/player/profile",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "not-approved" }),
      },
      {} as ApiBindings,
    );

    expect(selected.status).toBe(200);
    await expect(selected.json()).resolves.toEqual({ playerId });
    expect(payload.status).toBe(200);
    await expect(payload.json()).resolves.toEqual({ playerId });
    expect(player.loads).toEqual([accountId]);
    expect(player.creates).toEqual([accountId]);
  });

  it("short-circuits authorization failures before player persistence", async () => {
    const unauthorized = new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    const forbidden = new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    const { app, player } = createTestApp({
      sessionResult: unauthorized,
      mutationResult: forbidden,
    });

    const read = await app.request("/player/profile", {}, {} as ApiBindings);
    const write = await app.request("/player/profile", { method: "PUT" }, {} as ApiBindings);

    expect(read.status).toBe(401);
    expect(write.status).toBe(403);
    expect(player.loads).toEqual([]);
    expect(player.creates).toEqual([]);
  });
});
