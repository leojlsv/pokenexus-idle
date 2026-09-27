import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AuthSessionPrincipal } from "../auth/application";
import type { ApiBindings, ApiVariables } from "../auth/http";
import { HUNT_MUTATION_BODY_MAX_BYTES } from "./protocol";
import { registerHuntRoutes } from "./http";

const accountId = "0199472a-0000-7000-8000-000000000001";
const sessionId = "0199472a-0000-7000-8000-000000000002";
const playerId = "0199472a-0000-7000-8000-000000000003";
const huntId = "0199472a-0000-7000-8000-000000000101";
const teamId = "0199472a-0000-7000-8000-000000000102";
const pokemonId = "0199472a-0000-7000-8000-000000000103";
const idempotencyKey = "0199472a-0000-7000-8000-000000000201";

const principal: AuthSessionPrincipal = {
  accountId,
  sessionId,
  bearerDigest: new Uint8Array(32),
  securityEpoch: 0n,
  recentAuthAt: null,
  postRecoveryHoldUntil: null,
};

interface FakeResult {
  readonly httpStatus: number;
  readonly body: unknown;
}

class FakeHuntApplication {
  readonly calls: Array<{ readonly name: string; readonly args: readonly unknown[] }> = [];
  result: FakeResult = { httpStatus: 200, body: { ok: true } };

  private record(name: string, args: readonly unknown[]): Promise<FakeResult> {
    this.calls.push({ name, args });
    return Promise.resolve(this.result);
  }

  getState(account: string) {
    return this.record("getState", [account]);
  }

  getCaptureBalls(account: string) {
    return this.record("getCaptureBalls", [account]);
  }

  getAutoCapturePolicy(account: string) {
    return this.record("getAutoCapturePolicy", [account]);
  }

  start(account: string, key: string, body: unknown) {
    return this.record("start", [account, key, body]);
  }

  checkpoint(account: string, key: string, targetHuntId: string) {
    return this.record("checkpoint", [account, key, targetHuntId]);
  }

  claim(account: string, key: string, targetHuntId: string) {
    return this.record("claim", [account, key, targetHuntId]);
  }

  retreat(account: string, key: string, targetHuntId: string) {
    return this.record("retreat", [account, key, targetHuntId]);
  }

  capture(account: string, key: string, targetHuntId: string, body: unknown) {
    return this.record("capture", [account, key, targetHuntId, body]);
  }

  useItem(account: string, key: string, targetHuntId: string, body: unknown) {
    return this.record("useItem", [account, key, targetHuntId, body]);
  }

  replaceAutoCapturePolicy(account: string, key: string, body: unknown) {
    return this.record("replaceAutoCapturePolicy", [account, key, body]);
  }
}

function createTestApp(input: {
  readonly hunt?: FakeHuntApplication;
  readonly playerIdResult?: string | null;
  readonly sessionResult?: AuthSessionPrincipal | Response;
  readonly commandResult?: AuthSessionPrincipal | Response;
} = {}) {
  const app = new Hono<{ Bindings: ApiBindings; Variables: ApiVariables }>();
  const hunt = input.hunt ?? new FakeHuntApplication();
  const guards = { read: 0, command: 0 };
  registerHuntRoutes(app, {
    huntFor: () => hunt,
    playerIdFor: async (_c, requestAccountId) => {
      expect(requestAccountId).toBe(accountId);
      return input.playerIdResult === undefined ? playerId : input.playerIdResult;
    },
    security: {
      requireSession: async () => {
        guards.read += 1;
        return input.sessionResult ?? principal;
      },
      requireCommandSession: async () => {
        guards.command += 1;
        return input.commandResult ?? principal;
      },
    },
  });
  return { app, hunt, guards };
}

function commandHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
    ...extra,
  };
}

describe("SPEC-015 Hunt HTTP routes", () => {
  it("uses the read-only session guard and authenticated self-scope for Hunt reads", async () => {
    const { app, hunt, guards } = createTestApp();

    for (const path of [
      "/player/hunts/state",
      "/player/hunts/capture-balls",
      "/player/hunts/auto-capture-policy",
    ]) {
      const response = await app.request(path, {}, {} as ApiBindings);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    }

    expect(guards).toEqual({ read: 3, command: 0 });
    expect(hunt.calls).toEqual([
      { name: "getState", args: [playerId] },
      { name: "getCaptureBalls", args: [playerId] },
      { name: "getAutoCapturePolicy", args: [playerId] },
    ]);
  });

  it("parses start and forwards only authenticated scope plus canonical command identity", async () => {
    const { app, hunt, guards } = createTestApp();
    const response = await app.request(
      "/player/hunts/start",
      {
        method: "POST",
        headers: commandHeaders(),
        body: JSON.stringify({ huntDefinitionId: "hunt:test", teamId }),
      },
      {} as ApiBindings,
    );

    expect(response.status).toBe(200);
    expect(guards).toEqual({ read: 0, command: 1 });
    expect(hunt.calls).toEqual([{
      name: "start",
      args: [playerId, idempotencyKey, { huntDefinitionId: "hunt:test", teamId }],
    }]);
  });

  it("preserves application HTTP status and JSON envelope for bounded continuation", async () => {
    const hunt = new FakeHuntApplication();
    hunt.result = {
      httpStatus: 202,
      body: {
        status: "in_progress",
        progress: { logicalTimeMs: "1234", targetLogicalTimeMs: "5678" },
      },
    };
    const { app } = createTestApp({ hunt });
    const response = await app.request(
      `/player/hunts/${huntId}/checkpoint`,
      { method: "POST", headers: commandHeaders(), body: "" },
      {} as ApiBindings,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(hunt.result.body);
    expect(hunt.calls).toEqual([{ name: "checkpoint", args: [playerId, idempotencyKey, huntId] }]);
  });

  it("accepts only zero-length or exact empty-object bodies for checkpoint/claim/retreat", async () => {
    const { app, hunt } = createTestApp();

    const claim = await app.request(
      `/player/hunts/${huntId}/claim`,
      { method: "POST", headers: commandHeaders(), body: "{}" },
      {} as ApiBindings,
    );
    expect(claim.status).toBe(200);

    const invalidRetreat = await app.request(
      `/player/hunts/${huntId}/retreat`,
      { method: "POST", headers: commandHeaders(), body: JSON.stringify({ extra: true }) },
      {} as ApiBindings,
    );
    expect(invalidRetreat.status).toBe(400);
    await expect(invalidRetreat.json()).resolves.toEqual({ error: "invalid_request" });
    expect(hunt.calls).toEqual([{ name: "claim", args: [playerId, idempotencyKey, huntId] }]);
  });

  it("rejects non-canonical route/key UUIDs and oversized mutation bodies before application dispatch", async () => {
    const { app, hunt } = createTestApp();
    const invalidKey = await app.request(
      "/player/hunts/start",
      {
        method: "POST",
        headers: commandHeaders({ "Idempotency-Key": idempotencyKey.toUpperCase() }),
        body: JSON.stringify({ huntDefinitionId: "hunt:test", teamId }),
      },
      {} as ApiBindings,
    );
    const invalidHunt = await app.request(
      "/player/hunts/NOT-A-UUID/checkpoint",
      { method: "POST", headers: commandHeaders(), body: "{}" },
      {} as ApiBindings,
    );
    const oversized = await app.request(
      "/player/hunts/start",
      {
        method: "POST",
        headers: commandHeaders(),
        body: " ".repeat(HUNT_MUTATION_BODY_MAX_BYTES + 1),
      },
      {} as ApiBindings,
    );

    for (const response of [invalidKey, invalidHunt, oversized]) {
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
    }
    expect(hunt.calls).toEqual([]);
  });

  it("parses both manual capture branches as closed request shapes", async () => {
    const { app, hunt } = createTestApp();
    const attempt = await app.request(
      `/player/hunts/${huntId}/capture`,
      {
        method: "POST",
        headers: commandHeaders(),
        body: JSON.stringify({
          decision: "attempt",
          encounterId: "encounter:test",
          selectedItemId: "item:poke-ball",
        }),
      },
      {} as ApiBindings,
    );
    const skip = await app.request(
      `/player/hunts/${huntId}/capture`,
      {
        method: "POST",
        headers: commandHeaders(),
        body: JSON.stringify({ decision: "skip", encounterId: "encounter:test-2" }),
      },
      {} as ApiBindings,
    );
    const invalidSkip = await app.request(
      `/player/hunts/${huntId}/capture`,
      {
        method: "POST",
        headers: commandHeaders(),
        body: JSON.stringify({
          decision: "skip",
          encounterId: "encounter:test-3",
          selectedItemId: "item:poke-ball",
        }),
      },
      {} as ApiBindings,
    );

    expect([attempt.status, skip.status, invalidSkip.status]).toEqual([200, 200, 400]);
    expect(hunt.calls).toEqual([
      {
        name: "capture",
        args: [playerId, idempotencyKey, huntId, {
          decision: "attempt",
          encounterId: "encounter:test",
          selectedItemId: "item:poke-ball",
        }],
      },
      {
        name: "capture",
        args: [playerId, idempotencyKey, huntId, {
          decision: "skip",
          encounterId: "encounter:test-2",
        }],
      },
    ]);
  });

  it("parses explicit Hunt item use and rejects unknown fields before dispatch", async () => {
    const { app, hunt } = createTestApp();
    const accepted = await app.request(
      `/player/hunts/${huntId}/items/use`,
      {
        method: "POST",
        headers: commandHeaders(),
        body: JSON.stringify({ itemId: "item:potion", targetPokemonInstanceId: pokemonId }),
      },
      {} as ApiBindings,
    );
    const rejected = await app.request(
      `/player/hunts/${huntId}/items/use`,
      {
        method: "POST",
        headers: commandHeaders(),
        body: JSON.stringify({ itemId: "item:potion", targetPokemonInstanceId: pokemonId, revive: true }),
      },
      {} as ApiBindings,
    );

    expect([accepted.status, rejected.status]).toEqual([200, 400]);
    expect(hunt.calls).toEqual([{
      name: "useItem",
      args: [playerId, idempotencyKey, huntId, {
        itemId: "item:potion",
        targetPokemonInstanceId: pokemonId,
      }],
    }]);
  });

  it("maps structural policy protocol errors and forwards valid replacement bodies", async () => {
    const { app, hunt } = createTestApp();
    const validBody = {
      expectedRowVersion: "0",
      enabled: false,
      balls: [{ itemId: "item:poke-ball", autoUseEnabled: false, minimumReserve: "0" }],
      rules: [{ when: {}, selectedItemId: "item:poke-ball" }],
    };
    const accepted = await app.request(
      "/player/hunts/auto-capture-policy",
      { method: "PUT", headers: commandHeaders(), body: JSON.stringify(validBody) },
      {} as ApiBindings,
    );
    expect(accepted.status).toBe(200);

    const duplicateCondition = await app.request(
      "/player/hunts/auto-capture-policy",
      {
        method: "PUT",
        headers: commandHeaders(),
        body: JSON.stringify({
          ...validBody,
          rules: [{
            when: { speciesIds: ["species:test", "species:test"] },
            selectedItemId: "item:poke-ball",
          }],
        }),
      },
      {} as ApiBindings,
    );
    expect(duplicateCondition.status).toBe(422);
    await expect(duplicateCondition.json()).resolves.toEqual({ error: "auto_capture_policy_invalid" });

    const unknownField = await app.request(
      "/player/hunts/auto-capture-policy",
      {
        method: "PUT",
        headers: commandHeaders(),
        body: JSON.stringify({ ...validBody, hiddenGenetics: true }),
      },
      {} as ApiBindings,
    );
    expect(unknownField.status).toBe(400);
    await expect(unknownField.json()).resolves.toEqual({ error: "invalid_request" });

    expect(hunt.calls).toEqual([{
      name: "replaceAutoCapturePolicy",
      args: [playerId, idempotencyKey, validBody],
    }]);
  });

  it("short-circuits read and command auth failures before application work", async () => {
    const unauthorized = new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    const forbidden = new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    const { app, hunt } = createTestApp({ sessionResult: unauthorized, commandResult: forbidden });

    const read = await app.request("/player/hunts/state", {}, {} as ApiBindings);
    const command = await app.request(
      "/player/hunts/start",
      {
        method: "POST",
        headers: commandHeaders(),
        body: JSON.stringify({ huntDefinitionId: "hunt:test", teamId }),
      },
      {} as ApiBindings,
    );

    expect([read.status, command.status]).toEqual([401, 403]);
    expect(hunt.calls).toEqual([]);
  });

  it("resolves the authenticated Account to a Player before Hunt application work", async () => {
    const { app, hunt } = createTestApp({ playerIdResult: null });

    const read = await app.request("/player/hunts/state", {}, {} as ApiBindings);
    const command = await app.request(
      "/player/hunts/start",
      {
        method: "POST",
        headers: commandHeaders(),
        body: JSON.stringify({ huntDefinitionId: "hunt:test", teamId }),
      },
      {} as ApiBindings,
    );

    expect([read.status, command.status]).toEqual([404, 404]);
    await expect(read.json()).resolves.toEqual({ error: "not_found" });
    await expect(command.json()).resolves.toEqual({ error: "not_found" });
    expect(hunt.calls).toEqual([]);
  });
});
