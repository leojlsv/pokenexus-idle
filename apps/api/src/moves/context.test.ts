import { describe, expect, it, vi } from "vitest";
import {
  MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
  MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH,
  createMoveEligibilityContextLoader,
  type MoveEligibilityGameDataCatalog,
} from "./context";

const PAIR = {
  gameDataVersion: "game-data:test-v2",
  rulesVersion: "rules:test-v1",
} as const;

function catalog(): MoveEligibilityGameDataCatalog {
  return {
    gameDataVersion: PAIR.gameDataVersion,
    species: [{
      id: "species:test" as never,
      sourceName: "Test",
      sourceSlug: "test",
      nationalDexNumber: 1,
      introducedGeneration: 1,
      formLabel: null,
      baseSpeciesId: null,
      typeIds: ["type:test" as never],
      baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
      abilities: [],
      catchRate: 1,
      baseExperience: { status: "known", value: 1 },
      growthRate: "medium-fast",
      heightMillimeters: 1,
      weightGrams: 1,
      eggGroups: ["monster"],
      genderRatio: { kind: "genderless" },
      eggCycles: { status: "known", value: 1 },
      evYield: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      baseFriendship: { status: "known", value: 1 },
      sourceRecordIds: ["source:test"],
    }],
    moves: [{
      id: "move:test" as never,
      typeId: "type:test" as never,
      category: "status",
      power: null,
      accuracy: null,
      basePp: 1,
      sourceTarget: "self",
      makesContact: false,
      zaBaseCooldownMs: null,
      sourceRecordIds: ["source:test"],
    }],
    learnsets: [{
      speciesId: "species:test" as never,
      moveId: "move:test" as never,
      sourceGeneration: 8,
      sourceGame: "test",
      method: "level-up",
      level: 1,
      machineIdentifier: null,
      sourceRecordIds: ["source:test"],
    }],
  };
}

function createHarness(overrides: {
  pairResolution?: unknown;
  rulesResolution?: unknown;
  gameDataResolution?: unknown;
  loadedCatalog?: MoveEligibilityGameDataCatalog;
} = {}) {
  const selector = { select: vi.fn(async () => PAIR) };
  const staticContextPairs = {
    resolve: vi.fn(async () => overrides.pairResolution === undefined
      ? { compatibility: PAIR, newOperationsAllowed: true }
      : overrides.pairResolution as never),
  };
  const rulesVersions = {
    resolve: vi.fn(async () => overrides.rulesResolution === undefined
      ? {
          rules: {
            rulesVersion: PAIR.rulesVersion,
            moveEligibilityRuleArtifactId: MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
            moveEligibilityRuleSemanticsHash: MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH,
          },
          newOperationsAllowed: true,
        }
      : overrides.rulesResolution as never),
  };
  const gameDataVersions = {
    resolve: vi.fn(async () => overrides.gameDataResolution === undefined
      ? { gameDataVersion: PAIR.gameDataVersion, newOperationsAllowed: true }
      : overrides.gameDataResolution as never),
  };
  const gameData = {
    load: vi.fn(async () => overrides.loadedCatalog ?? catalog()),
  };

  return {
    selector,
    staticContextPairs,
    rulesVersions,
    gameDataVersions,
    gameData,
    loader: createMoveEligibilityContextLoader({
      selector,
      staticContextPairs,
      rulesVersions,
      gameDataVersions,
      gameData,
    }),
  };
}

describe("createMoveEligibilityContextLoader", () => {
  it("selects one exact server context and materializes indexed exact game data", async () => {
    const harness = createHarness();
    const context = await harness.loader.loadForNewOperation();

    expect(context.pair).toEqual(PAIR);
    expect(context.speciesIds.has("species:test")).toBe(true);
    expect(context.moveIds.has("move:test")).toBe(true);
    expect(context.learnsetsBySpecies.get("species:test")).toHaveLength(1);
    expect(harness.selector.select).toHaveBeenCalledOnce();
    expect(harness.staticContextPairs.resolve).toHaveBeenCalledWith(PAIR);
    expect(harness.rulesVersions.resolve).toHaveBeenCalledWith(PAIR.rulesVersion);
    expect(harness.gameDataVersions.resolve).toHaveBeenCalledWith(PAIR.gameDataVersion);
    expect(harness.gameData.load).toHaveBeenCalledWith(PAIR.gameDataVersion);
  });

  it("fails before rules or game-data resolution when exact pair compatibility is missing", async () => {
    const harness = createHarness({ pairResolution: null });
    await expect(harness.loader.loadForNewOperation()).rejects.toThrow(/not exactly resolvable/);
    expect(harness.rulesVersions.resolve).not.toHaveBeenCalled();
    expect(harness.gameData.load).not.toHaveBeenCalled();
  });

  it("rejects a retained pair that is deprecated for new operations", async () => {
    const harness = createHarness({
      pairResolution: { compatibility: PAIR, newOperationsAllowed: false },
    });
    await expect(harness.loader.loadForNewOperation()).rejects.toThrow(/pair is deprecated/);
  });

  it("rejects wrong Move rule artifact identity or accepted semantics hash", async () => {
    for (const rules of [
      {
        rulesVersion: PAIR.rulesVersion,
        moveEligibilityRuleArtifactId: "pokenexus.move-eligibility.other.v1",
        moveEligibilityRuleSemanticsHash: MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH,
      },
      {
        rulesVersion: PAIR.rulesVersion,
        moveEligibilityRuleArtifactId: MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
        moveEligibilityRuleSemanticsHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      },
    ]) {
      const harness = createHarness({
        rulesResolution: { rules, newOperationsAllowed: true },
      });
      await expect(harness.loader.loadForNewOperation()).rejects.toThrow(/accepted Move-eligibility semantics/);
      expect(harness.gameData.load).not.toHaveBeenCalled();
    }
  });

  it("rejects resolver substitution and deprecated exact rules/game-data versions", async () => {
    const wrongRules = createHarness({
      rulesResolution: {
        rules: {
          rulesVersion: "rules:substituted",
          moveEligibilityRuleArtifactId: MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
          moveEligibilityRuleSemanticsHash: MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH,
        },
        newOperationsAllowed: true,
      },
    });
    await expect(wrongRules.loader.loadForNewOperation()).rejects.toThrow(/not exactly resolvable/);

    const deprecatedRules = createHarness({
      rulesResolution: {
        rules: {
          rulesVersion: PAIR.rulesVersion,
          moveEligibilityRuleArtifactId: MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
          moveEligibilityRuleSemanticsHash: MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH,
        },
        newOperationsAllowed: false,
      },
    });
    await expect(deprecatedRules.loader.loadForNewOperation()).rejects.toThrow(/rulesVersion is deprecated/);

    const wrongGameData = createHarness({
      gameDataResolution: { gameDataVersion: "game-data:substituted", newOperationsAllowed: true },
    });
    await expect(wrongGameData.loader.loadForNewOperation()).rejects.toThrow(/not exactly resolvable/);

    const deprecatedGameData = createHarness({
      gameDataResolution: { gameDataVersion: PAIR.gameDataVersion, newOperationsAllowed: false },
    });
    await expect(deprecatedGameData.loader.loadForNewOperation()).rejects.toThrow(/gameDataVersion is deprecated/);
  });

  it("fails closed when exact catalog identity or referential closure is malformed", async () => {
    const mismatchedCatalog = createHarness({
      loadedCatalog: { ...catalog(), gameDataVersion: "game-data:other" },
    });
    await expect(mismatchedCatalog.loader.loadForNewOperation()).rejects.toThrow(/different gameDataVersion/);

    const unresolvedMove = catalog();
    const malformed = createHarness({
      loadedCatalog: { ...unresolvedMove, moves: [] },
    });
    await expect(malformed.loader.loadForNewOperation()).rejects.toThrow(/unresolved MoveId/);
  });
});
