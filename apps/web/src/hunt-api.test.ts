import { describe, expect, it } from "vitest";
import { HuntApi, parseHuntState } from "./hunt-api";

describe("forward Hunt client contract", () => {
  it("invokes the default browser fetch without rebinding its receiver to HuntApi", async () => {
    const originalFetch = globalThis.fetch;
    const receivers: unknown[] = [];
    globalThis.fetch = function (this: unknown) {
      receivers.push(this);
      return Promise.resolve(new Response(JSON.stringify({
        activeHunt: null,
        pendingManualCapture: null,
        recoveryReadyAt: null,
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    } as typeof fetch;
    try {
      const api = new HuntApi();
      await expect(api.state()).resolves.toEqual({
        activeHunt: null,
        recoveryReadyAt: null,
        legacyPendingManualCapture: false,
      });
      expect(receivers).toHaveLength(1);
      expect(receivers[0]).not.toBe(api);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reduces legacy pending manual Capture to a non-actionable compatibility marker", () => {
    const state = parseHuntState({
      activeHunt: null,
      pendingManualCapture: {
        sourceHuntId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        encounterId: "encounter:legacy",
        captureOptions: [{ itemId: "item:ball", quantity: "99" }],
      },
      recoveryReadyAt: null,
    });

    expect(state).toEqual({ activeHunt: null, recoveryReadyAt: null, legacyPendingManualCapture: true });
    expect(JSON.stringify(state)).not.toContain("captureOptions");
  });

  it("does not expose superseded manual Capture, item-use, Checkpoint or Claim methods", () => {
    const api = new HuntApi(async () => new Response(null, { status: 500 }));
    expect("captureDecision" in api).toBe(false);
    expect("useHuntItem" in api).toBe(false);
    expect("checkpoint" in api).toBe(false);
    expect("claim" in api).toBe(false);
  });

  it("preserves a bounded 202 mutation as an explicit same-command continuation", async () => {
    const api = new HuntApi(async () => new Response(JSON.stringify({
      status: "in_progress",
      progress: { logicalTimeMs: "120", targetLogicalTimeMs: "300" },
    }), { status: 202, headers: { "Content-Type": "application/json" } }));

    await expect(api.retreat(
      "csrf",
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    )).resolves.toEqual({ kind: "in_progress", logicalTimeMs: "120", targetLogicalTimeMs: "300" });
  });

  it("keeps online and return reconciliation internal while selecting the correct transport", async () => {
    const paths: string[] = [];
    const api = new HuntApi(async (input) => {
      paths.push(String(input));
      if (String(input).endsWith("/claim")) {
        return new Response(JSON.stringify({
          state: { activeHunt: null, pendingManualCapture: null, recoveryReadyAt: null },
          effects: {
            playerExperience: "0",
            pokemonExperience: [],
            items: [],
            automaticCaptureSummary: {
              attempts: "0", successes: "0", failures: "0", closedNoEligibleBall: "0", shinySuccesses: "0",
            },
          },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ activeHunt: null, pendingManualCapture: null, recoveryReadyAt: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const key = "11111111-1111-4111-8111-111111111111";
    const huntId = "22222222-2222-4222-8222-222222222222";

    await expect(api.reconcileHunt("csrf", key, huntId, "online")).resolves.toEqual({ kind: "complete" });
    await expect(api.reconcileHunt("csrf", key, huntId, "return")).resolves.toEqual({ kind: "complete" });
    expect(paths).toEqual([
      `/player/hunts/${huntId}/checkpoint`,
      `/player/hunts/${huntId}/claim`,
    ]);
    expect("checkpoint" in api).toBe(false);
    expect("claim" in api).toBe(false);
  });

  it("does not accept a malformed 200 command response as completion", async () => {
    const api = new HuntApi(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(api.start(
      "csrf",
      "11111111-1111-4111-8111-111111111111",
      { huntDefinitionId: "hunt:wilds", teamId: "22222222-2222-4222-8222-222222222222" },
    )).rejects.toThrow(/Invalid active Hunt/);
  });

  it("keeps a historical Retreat replay unresolved until fresh-state reconciliation", async () => {
    const api = new HuntApi(async () => new Response(JSON.stringify({
      status: "terminal",
      terminalReason: "draw",
      recoveryReadyAt: "2026-10-05T20:00:00.000Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(api.retreat(
      "csrf",
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    )).rejects.toThrow(/Historical Retreat replay/);
  });

  it("rejects a Start 200 that does not identify the requested active Hunt", async () => {
    const api = new HuntApi(async () => new Response(JSON.stringify({
      activeHunt: null,
      pendingManualCapture: null,
      recoveryReadyAt: null,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(api.start(
      "csrf",
      "11111111-1111-4111-8111-111111111111",
      { huntDefinitionId: "hunt:wilds", teamId: "22222222-2222-4222-8222-222222222222" },
    )).rejects.toThrow(/requested active Hunt/);
  });

  it("rejects PokéCenter 200 unless every returned Team member is fully conscious", async () => {
    const teamId = "22222222-2222-4222-8222-222222222222";
    const pokemonId = "33333333-3333-4333-8333-333333333333";
    const api = new HuntApi(async () => new Response(JSON.stringify({
      teamId,
      vitality: [{
        pokemonInstanceId: pokemonId,
        currentHp: 9,
        maxHp: 10,
        vitality: "conscious",
        vitalityRowVersion: "2",
      }],
      recoveryReadyAt: null,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(api.healAtPokeCenter(
      "csrf",
      "11111111-1111-4111-8111-111111111111",
      teamId,
      [pokemonId],
    )).rejects.toThrow(/PokéCenter vitality/);
  });

  it("rejects a Hunt Activity page whose identity does not match the requested Hunt", async () => {
    const requestedHuntId = "22222222-2222-4222-8222-222222222222";
    const api = new HuntApi(async () => new Response(JSON.stringify({
      schemaVersion: "pokenexus.hunt-activity-page.v1",
      huntId: "33333333-3333-4333-8333-333333333333",
      records: [],
      nextCursor: null,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(api.activity(requestedHuntId)).rejects.toThrow(/identity does not match requested Hunt/);
  });

  it("rejects a truncated PokéCenter 200 that omits a selected Team member", async () => {
    const teamId = "22222222-2222-4222-8222-222222222222";
    const firstPokemonId = "33333333-3333-4333-8333-333333333333";
    const secondPokemonId = "44444444-4444-4444-8444-444444444444";
    const api = new HuntApi(async () => new Response(JSON.stringify({
      teamId,
      vitality: [{
        pokemonInstanceId: firstPokemonId,
        currentHp: 10,
        maxHp: 10,
        vitality: "conscious",
        vitalityRowVersion: "2",
      }],
      recoveryReadyAt: null,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(api.healAtPokeCenter(
      "csrf",
      "11111111-1111-4111-8111-111111111111",
      teamId,
      [firstPokemonId, secondPokemonId],
    )).rejects.toThrow(/Invalid PokéCenter result/);
  });
});
