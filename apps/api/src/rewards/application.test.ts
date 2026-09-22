import { describe, expect, it, vi } from "vitest";
import { createRuntimePinnedRewardContextLoader } from "./application";

describe("createRuntimePinnedRewardContextLoader", () => {
  it("requires the exact game-data/rules pair to remain resolvable before resolving mixed context", async () => {
    const resolvePair = vi.fn(async () => null);
    const resolveRules = vi.fn(async () => {
      throw new Error("rules resolver must not run for a rejected pair");
    });
    const readGameData = vi.fn(async () => {
      throw new Error("game-data reader must not run for a rejected pair");
    });
    const loader = createRuntimePinnedRewardContextLoader({
      gameDataReader: { read: readGameData },
      gameDataVersions: { resolve: vi.fn() },
      rules: { resolve: resolveRules },
      staticContextPairs: { resolve: resolvePair },
    });

    await expect(loader.load({
      subjectPlayerId: "00000000-0000-0000-0000-000000000001",
      sourceAuthority: "source:test",
      sourceCorrelation: "outcome:test",
      rulesVersion: "rules:opaque-v1",
      gameDataVersion: "data:opaque-v9",
      effects: [
        {
          kind: "player_xp",
          playerId: "00000000-0000-0000-0000-000000000001",
          amount: 1n,
        },
        { kind: "item_grant", itemId: "item:test", quantity: 1n },
      ],
    })).rejects.toThrow(/not exactly resolvable/);

    expect(resolvePair).toHaveBeenCalledOnce();
    expect(resolvePair).toHaveBeenCalledWith({
      rulesVersion: "rules:opaque-v1",
      gameDataVersion: "data:opaque-v9",
    });
    expect(resolveRules).not.toHaveBeenCalled();
    expect(readGameData).not.toHaveBeenCalled();
  });

  it("retains deprecated exact-pair metadata instead of treating history as unresolvable", async () => {
    const resolvePair = vi.fn(async () => ({
      compatibility: {
        rulesVersion: "rules:opaque-v1",
        gameDataVersion: "data:opaque-v9",
      },
      newOperationsAllowed: false,
    }));
    const loader = createRuntimePinnedRewardContextLoader({
      gameDataReader: { read: vi.fn() },
      gameDataVersions: { resolve: vi.fn() },
      rules: { resolve: vi.fn() },
      staticContextPairs: { resolve: resolvePair },
    });

    const context = await loader.load({
      subjectPlayerId: "00000000-0000-0000-0000-000000000001",
      sourceAuthority: "source:test",
      sourceCorrelation: "outcome:historical",
      rulesVersion: "rules:opaque-v1",
      gameDataVersion: "data:opaque-v9",
      effects: [],
    });

    expect(context.staticContextPairCompatibility).toEqual({
      rulesVersion: "rules:opaque-v1",
      gameDataVersion: "data:opaque-v9",
    });
    expect(context.staticContextPairNewOperationsAllowed).toBe(false);
  });

  it("retains deprecated rules semantics separately from current new-use eligibility", async () => {
    const loader = createRuntimePinnedRewardContextLoader({
      gameDataReader: { read: vi.fn() },
      gameDataVersions: { resolve: vi.fn() },
      rules: {
        resolve: vi.fn(async () => ({
          rules: {
            rulesVersion: "rules:retained-v1",
            pokemonProgressionRuleId: null,
            playerProgressionRuleId: "pokenexus.player-linear-cost.v1",
          },
          newOperationsAllowed: false,
        })),
      },
      staticContextPairs: { resolve: vi.fn() },
    });

    const context = await loader.load({
      subjectPlayerId: "00000000-0000-0000-0000-000000000001",
      sourceAuthority: "source:test",
      sourceCorrelation: "outcome:rules-history",
      rulesVersion: "rules:retained-v1",
      gameDataVersion: null,
      effects: [{
        kind: "player_xp",
        playerId: "00000000-0000-0000-0000-000000000001",
        amount: 1n,
      }],
    });

    expect(context.progressionRules.rulesVersion).toBe("rules:retained-v1");
    expect(context.rulesVersionNewOperationsAllowed).toBe(false);
  });

  it("fails an unknown item-only game-data version before reading immutable runtime artifacts", async () => {
    const readGameData = vi.fn(async () => {
      throw new Error("runtime game data must not be read for an unknown version");
    });
    const loader = createRuntimePinnedRewardContextLoader({
      gameDataReader: { read: readGameData },
      gameDataVersions: { resolve: vi.fn(async () => null) },
      rules: { resolve: vi.fn() },
      staticContextPairs: { resolve: vi.fn() },
    });

    await expect(loader.load({
      subjectPlayerId: "00000000-0000-0000-0000-000000000001",
      sourceAuthority: "source:test",
      sourceCorrelation: "outcome:unknown-data",
      rulesVersion: null,
      gameDataVersion: "data:unknown",
      effects: [{ kind: "item_grant", itemId: "item:test", quantity: 1n }],
    })).rejects.toThrow(/Pinned gameDataVersion is unavailable/);
    expect(readGameData).not.toHaveBeenCalled();
  });
});
