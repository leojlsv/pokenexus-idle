import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AuthSessionPrincipal } from "../auth/application";
import type { ApiBindings, ApiVariables } from "../auth/http";
import type { PlayerHttpApplication, PlayerProfileIdentity } from "./application";
import { registerPlayerRoutes } from "./http";
import { createPlayerCursorCodec } from "./protocol";

const accountId = "0199472a-0000-7000-8000-000000000001";
const playerId = "0199472a-0000-7000-8000-000000000002";
const pokemonId = "0199472a-0000-7000-8000-000000000101";
const pokemonId2 = "0199472a-0000-7000-8000-000000000102";
const teamId = "0199472a-0000-7000-8000-000000000201";
const idempotencyKey = "0199472a-0000-7000-8000-000000000301";
const cursorSecret = "player-cursor-test-secret-material-32-bytes";
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
  readonly calls: Array<{ readonly name: string; readonly args: readonly unknown[] }> = [];
  profile: PlayerProfileIdentity | null = { playerId };
  collectionResult: Awaited<ReturnType<PlayerHttpApplication["listCollection"]>> = null;
  pokemonResult: Awaited<ReturnType<PlayerHttpApplication["loadPokemon"]>> = null;
  pokemonProgressionResult: Awaited<ReturnType<PlayerHttpApplication["loadPokemonProgression"]>> = null;
  progressionResult: Awaited<ReturnType<PlayerHttpApplication["loadProgression"]>> = null;
  inventoryResult: Awaited<ReturnType<PlayerHttpApplication["loadInventoryPage"]>> = { status: "not_found" };
  teamsResult: Awaited<ReturnType<PlayerHttpApplication["listTeams"]>> = null;
  teamResult: Awaited<ReturnType<PlayerHttpApplication["loadTeam"]>> = null;
  teamCreateResult: Awaited<ReturnType<PlayerHttpApplication["createTeam"]>> = { status: "not_found" };
  rosterResult: Awaited<ReturnType<PlayerHttpApplication["replaceTeamRoster"]>> = { status: "not_found" };
  deleteResult: Awaited<ReturnType<PlayerHttpApplication["deleteTeam"]>> = { status: "not_found" };
  moveResult: Awaited<ReturnType<PlayerHttpApplication["replaceMoveLoadout"]>> = { status: "not_found" };

  async loadProfile(requestAccountId: string): Promise<PlayerProfileIdentity | null> {
    this.loads.push(requestAccountId);
    return this.profile;
  }

  async createOrLoadProfile(requestAccountId: string): Promise<PlayerProfileIdentity> {
    this.creates.push(requestAccountId);
    return { playerId };
  }

  async listCollection(...args: Parameters<PlayerHttpApplication["listCollection"]>) {
    this.calls.push({ name: "listCollection", args });
    return this.collectionResult;
  }
  async loadPokemon(...args: Parameters<PlayerHttpApplication["loadPokemon"]>) {
    this.calls.push({ name: "loadPokemon", args });
    return this.pokemonResult;
  }
  async loadPokemonProgression(...args: Parameters<PlayerHttpApplication["loadPokemonProgression"]>) {
    this.calls.push({ name: "loadPokemonProgression", args });
    return this.pokemonProgressionResult;
  }
  async loadProgression(...args: Parameters<PlayerHttpApplication["loadProgression"]>) {
    this.calls.push({ name: "loadProgression", args });
    return this.progressionResult;
  }
  async loadInventoryPage(...args: Parameters<PlayerHttpApplication["loadInventoryPage"]>) {
    this.calls.push({ name: "loadInventoryPage", args });
    return this.inventoryResult;
  }
  async listTeams(...args: Parameters<PlayerHttpApplication["listTeams"]>) {
    this.calls.push({ name: "listTeams", args });
    return this.teamsResult;
  }
  async loadTeam(...args: Parameters<PlayerHttpApplication["loadTeam"]>) {
    this.calls.push({ name: "loadTeam", args });
    return this.teamResult;
  }
  async createTeam(...args: Parameters<PlayerHttpApplication["createTeam"]>) {
    this.calls.push({ name: "createTeam", args });
    return this.teamCreateResult;
  }
  async replaceTeamRoster(...args: Parameters<PlayerHttpApplication["replaceTeamRoster"]>) {
    this.calls.push({ name: "replaceTeamRoster", args });
    return this.rosterResult;
  }
  async deleteTeam(...args: Parameters<PlayerHttpApplication["deleteTeam"]>) {
    this.calls.push({ name: "deleteTeam", args });
    return this.deleteResult;
  }
  async replaceMoveLoadout(...args: Parameters<PlayerHttpApplication["replaceMoveLoadout"]>) {
    this.calls.push({ name: "replaceMoveLoadout", args });
    return this.moveResult;
  }
}

function createTestApp(input: {
  readonly player?: FakePlayerApplication;
  readonly sessionResult?: AuthSessionPrincipal | Response;
  readonly mutationResult?: AuthSessionPrincipal | Response;
} = {}) {
  const app = new Hono<{ Bindings: ApiBindings; Variables: ApiVariables }>();
  const player = input.player ?? new FakePlayerApplication();
  const guards = { read: 0, profileMutation: 0, command: 0 };
  const cursor = createPlayerCursorCodec(cursorSecret);
  registerPlayerRoutes(app, {
    playerFor: () => player,
    cursorFor: () => cursor,
    security: {
      requireSession: async () => {
        guards.read += 1;
        return input.sessionResult ?? principal;
      },
      requireSessionMutation: async () => {
        guards.profileMutation += 1;
        return input.mutationResult ?? principal;
      },
      requireCommandSession: async () => {
        guards.command += 1;
        return input.mutationResult ?? principal;
      },
    },
  });
  return { app, player, guards, cursor };
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

describe("SPEC-011 Player State HTTP routes", () => {
  it("returns the accepted read shapes with lossless integers and self-scoped selectors", async () => {
    const player = new FakePlayerApplication();
    const at = new Date("2026-09-22T20:00:00.000Z");
    player.collectionResult = {
      items: [{
        pokemonInstanceId: pokemonId,
        ownerPlayerId: playerId,
        speciesId: "species:test",
        level: 42,
        selectedAbilityId: null,
        rowVersion: 9_223_372_036_854_775_807n,
        createdAt: at,
        updatedAt: at,
      }],
      nextAfterPokemonInstanceId: pokemonId,
    };
    player.pokemonResult = {
      pokemonInstanceId: pokemonId,
      ownerPlayerId: playerId,
      speciesId: "species:test",
      level: 42,
      ivs: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 },
      selectedAbilityId: "ability:test",
      moveLoadout: { state: "selected", moveIds: ["move:a", "move:b"] },
      rowVersion: 7n,
      createdAt: at,
      updatedAt: at,
    };
    player.pokemonProgressionResult = {
      pokemonInstanceId: pokemonId,
      ownerPlayerId: playerId,
      level: 42n,
      totalExperience: 74087n,
      rowVersion: 7n,
    };
    player.progressionResult = {
      playerId,
      level: 123456789012345678901234567890n,
      totalExperience: 987654321098765432109876543210n,
      rowVersion: 8n,
    };
    player.inventoryResult = {
      status: "ok",
      rowVersion: 6n,
      entries: [{ itemId: "item:\u0000é", quantity: 9_223_372_036_854_775_807n }],
      nextAfterItemId: "item:\u0000é",
    };
    player.teamsResult = {
      teams: [{
        teamId,
        ownerPlayerId: playerId,
        rowVersion: 4n,
        createdAt: at,
        updatedAt: at,
      }],
      nextAfterTeamId: teamId,
    };
    player.teamResult = {
      teamId,
      ownerPlayerId: playerId,
      pokemonInstanceIds: [pokemonId],
      rowVersion: 4n,
      createdAt: at,
      updatedAt: at,
    };
    const { app, guards, cursor } = createTestApp({ player });
    const env = {} as ApiBindings;

    const collection = await app.request("/player/collection?limit=1", {}, env);
    expect(collection.status).toBe(200);
    const collectionBody = await collection.json() as { nextCursor: string };
    expect(collectionBody).toMatchObject({
      items: [{
        pokemonInstanceId: pokemonId,
        speciesId: "species:test",
        level: 42,
        selectedAbilityId: null,
        rowVersion: "9223372036854775807",
      }],
    });
    await expect(cursor.decodeCollection(collectionBody.nextCursor)).resolves.toEqual({
      afterPokemonInstanceId: pokemonId,
    });

    await expect((await app.request(`/player/pokemon/${pokemonId}`, {}, env)).json()).resolves.toEqual({
      pokemonInstanceId: pokemonId,
      speciesId: "species:test",
      level: 42,
      ivs: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 },
      selectedAbilityId: "ability:test",
      moveLoadout: { state: "selected", moveIds: ["move:a", "move:b"] },
      rowVersion: "7",
    });
    await expect((await app.request(`/player/pokemon/${pokemonId}/progression`, {}, env)).json()).resolves.toEqual({
      pokemonInstanceId: pokemonId,
      level: 42,
      totalExperience: "74087",
      rowVersion: "7",
    });
    await expect((await app.request("/player/progression", {}, env)).json()).resolves.toEqual({
      level: "123456789012345678901234567890",
      totalExperience: "987654321098765432109876543210",
      rowVersion: "8",
    });

    const inventory = await app.request("/player/inventory?limit=1", {}, env);
    const inventoryBody = await inventory.json() as { nextCursor: string };
    expect(inventoryBody).toMatchObject({
      rowVersion: "6",
      entries: [{ itemId: "item:\u0000é", quantity: "9223372036854775807" }],
    });
    await expect(cursor.decodeInventory(inventoryBody.nextCursor)).resolves.toEqual({
      rowVersion: 6n,
      afterItemId: "item:\u0000é",
    });

    const teams = await app.request("/player/teams?limit=1", {}, env);
    const teamsBody = await teams.json() as { nextCursor: string };
    expect(teamsBody).toMatchObject({ teamLimit: 6, teams: [{ teamId, rowVersion: "4" }] });
    await expect(cursor.decodeTeams(teamsBody.nextCursor)).resolves.toEqual({ afterTeamId: teamId });
    await expect((await app.request(`/player/teams/${teamId}`, {}, env)).json()).resolves.toEqual({
      teamId,
      pokemonInstanceIds: [pokemonId],
      rowVersion: "4",
    });

    expect(guards).toEqual({ read: 7, profileMutation: 0, command: 0 });
    expect(player.calls.every(({ args }) => args[0] === accountId)).toBe(true);
  });

  it("routes profile PUT through the legacy mutation guard and Team/Move commands through the activity guard", async () => {
    const player = new FakePlayerApplication();
    player.teamCreateResult = { status: "accepted", teamId, rowVersion: 0n, replay: false };
    player.moveResult = { status: "updated", rowVersion: 1n, moveIds: ["move:a"] };
    const { app, guards } = createTestApp({ player });
    const env = {} as ApiBindings;

    expect((await app.request("/player/profile", { method: "PUT" }, env)).status).toBe(200);
    expect((await app.request("/player/collection", {}, env)).status).toBe(404);
    expect((await app.request("/player/teams", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
    }, env)).status).toBe(200);
    expect((await app.request(`/player/pokemon/${pokemonId}/moves`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRowVersion: "0", moveIds: ["move:a"] }),
    }, env)).status).toBe(200);
    expect(guards).toEqual({ read: 1, profileMutation: 1, command: 2 });
  });

  it("rejects malformed, forged, wrong-kind cursors and page limits before application reads", async () => {
    const player = new FakePlayerApplication();
    const { app, cursor } = createTestApp({ player });
    const env = {} as ApiBindings;
    const wrongKind = await cursor.encodeTeams({ afterTeamId: teamId });
    const valid = await cursor.encodeCollection({ afterPokemonInstanceId: pokemonId });
    const [payload, signature = ""] = valid.split(".");
    const forged = `${payload}.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;
    for (const path of [
      "/player/collection?limit=0",
      "/player/collection?limit=101",
      "/player/collection?limit=1&limit=2",
      "/player/collection?cursor=garbage",
      `/player/collection?cursor=${encodeURIComponent(wrongKind)}`,
      `/player/collection?cursor=${encodeURIComponent(forged)}`,
    ]) {
      const response = await app.request(path, {}, env);
      expect(response.status, path).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
    }
    expect(player.calls).toEqual([]);
  });

  it("enforces exact Team-create identity/no-body and maps replay quota/rate outcomes", async () => {
    const player = new FakePlayerApplication();
    const { app } = createTestApp({ player });
    const env = {} as ApiBindings;

    for (const init of [
      { method: "POST" },
      { method: "POST", headers: { "Idempotency-Key": "NOT-A-UUID" } },
      { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: "{}" },
    ]) {
      const response = await app.request("/player/teams", init, env);
      expect(response.status).toBe(400);
    }
    expect(player.calls).toEqual([]);

    player.teamCreateResult = { status: "team_limit_reached" };
    let response = await app.request("/player/teams", { method: "POST", headers: { "Idempotency-Key": idempotencyKey } }, env);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "team_limit_reached" });

    player.teamCreateResult = { status: "idempotency_gone" };
    response = await app.request("/player/teams", { method: "POST", headers: { "Idempotency-Key": idempotencyKey } }, env);
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({ error: "idempotency_gone" });

    player.teamCreateResult = { status: "rate_limited", retryAfterSeconds: 37 };
    response = await app.request("/player/teams", { method: "POST", headers: { "Idempotency-Key": idempotencyKey } }, env);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("37");
    await expect(response.json()).resolves.toEqual({ error: "team_create_rate_limited" });
  });

  it("rejects ambiguous or oversized roster/move bodies before mutation", async () => {
    const player = new FakePlayerApplication();
    const { app } = createTestApp({ player });
    const env = {} as ApiBindings;
    const rosterPath = `/player/teams/${teamId}/roster`;
    const invalidBodies = [
      { expectedRowVersion: "0", pokemonInstanceIds: [pokemonId, pokemonId] },
      { expectedRowVersion: "00", pokemonInstanceIds: [] },
      { expectedRowVersion: "0", pokemonInstanceIds: [], ownerPlayerId: playerId },
    ];
    for (const body of invalidBodies) {
      const response = await app.request(rosterPath, {
        method: "PUT",
        body: JSON.stringify(body),
      }, env);
      expect(response.status).toBe(400);
    }

    const duplicateMove = await app.request(`/player/pokemon/${pokemonId}/moves`, {
      method: "PUT",
      body: JSON.stringify({ expectedRowVersion: "0", moveIds: ["move:a", "move:a"] }),
    }, env);
    expect(duplicateMove.status).toBe(400);

    const request = new Request(`http://localhost/player/pokemon/${pokemonId}/moves`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRowVersion: "0", moveIds: [`move:${"x".repeat(17_000)}`] }),
    });
    expect(request.headers.get("Content-Length")).toBeNull();
    const oversized = await app.fetch(request, env);
    expect(oversized.status).toBe(400);
    await expect(oversized.json()).resolves.toEqual({ error: "invalid_request" });
    expect(player.calls).toEqual([]);
  });

  it("maps Team OCC/member failures without leaking a fresh version", async () => {
    const player = new FakePlayerApplication();
    const { app } = createTestApp({ player });
    const env = {} as ApiBindings;
    const path = `/player/teams/${teamId}/roster`;
    const request = {
      method: "PUT",
      body: JSON.stringify({ expectedRowVersion: "4", pokemonInstanceIds: [pokemonId] }),
    };

    player.rosterResult = { status: "stale", rowVersion: 99n };
    let response = await app.request(path, request, env);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "stale" });

    player.rosterResult = { status: "invalid_member", pokemonInstanceId: pokemonId };
    response = await app.request(path, request, env);
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "invalid_member", pokemonInstanceId: pokemonId });

    player.deleteResult = { status: "stale", rowVersion: 100n };
    response = await app.request(`/player/teams/${teamId}?expectedRowVersion=4`, { method: "DELETE" }, env);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "stale" });
  });

  it("maps Move invalid/stale/authority results exactly and echoes only client Move evidence", async () => {
    const player = new FakePlayerApplication();
    const { app } = createTestApp({ player });
    const env = {} as ApiBindings;
    const path = `/player/pokemon/${pokemonId}/moves`;
    const request = {
      method: "PUT",
      body: JSON.stringify({ expectedRowVersion: "7", moveIds: ["move:a"] }),
    };

    player.moveResult = { status: "stale", rowVersion: 88n };
    let response = await app.request(path, request, env);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "stale" });

    player.moveResult = { status: "invalid", reason: "unresolved_move", moveId: "move:a" };
    response = await app.request(path, request, env);
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_move_loadout",
      reason: "unresolved_move",
      moveId: "move:a",
    });

    player.moveResult = { status: "invalid", reason: "unresolved_species" };
    response = await app.request(path, request, env);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "authority_unavailable" });

    player.moveResult = { status: "authority_unavailable" };
    response = await app.request(path, request, env);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "authority_unavailable" });
  });

  it("returns successful Team roster/delete/Move command shapes", async () => {
    const player = new FakePlayerApplication();
    player.rosterResult = { status: "updated", rowVersion: 5n };
    player.deleteResult = { status: "deleted" };
    player.moveResult = { status: "updated", rowVersion: 8n, moveIds: ["move:b", "move:a"] };
    const { app } = createTestApp({ player });
    const env = {} as ApiBindings;

    const roster = await app.request(`/player/teams/${teamId}/roster`, {
      method: "PUT",
      body: JSON.stringify({ expectedRowVersion: "4", pokemonInstanceIds: [pokemonId, pokemonId2] }),
    }, env);
    expect(roster.status).toBe(200);
    await expect(roster.json()).resolves.toEqual({
      teamId,
      pokemonInstanceIds: [pokemonId, pokemonId2],
      rowVersion: "5",
    });

    const move = await app.request(`/player/pokemon/${pokemonId}/moves`, {
      method: "PUT",
      body: JSON.stringify({ expectedRowVersion: "7", moveIds: ["move:b", "move:a"] }),
    }, env);
    expect(move.status).toBe(200);
    await expect(move.json()).resolves.toEqual({
      pokemonInstanceId: pokemonId,
      moveIds: ["move:b", "move:a"],
      rowVersion: "8",
    });

    const deleted = await app.request(`/player/teams/${teamId}?expectedRowVersion=5`, { method: "DELETE" }, env);
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe("");
  });

  it("returns Inventory pagination_stale without mixing pages", async () => {
    const player = new FakePlayerApplication();
    player.inventoryResult = { status: "pagination_stale" };
    const { app, cursor } = createTestApp({ player });
    const token = await cursor.encodeInventory({ rowVersion: 3n, afterItemId: "item:a" });
    const response = await app.request(
      `/player/inventory?cursor=${encodeURIComponent(token)}`,
      {},
      {} as ApiBindings,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "pagination_stale" });
    expect(player.calls[0]).toEqual({
      name: "loadInventoryPage",
      args: [accountId, { limit: 50, expectedRowVersion: 3n, afterItemId: "item:a" }],
    });
  });
});
