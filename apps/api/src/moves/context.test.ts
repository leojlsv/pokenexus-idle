import {
  PRODUCTION_COMBAT_RULE_CATALOG_V1,
  PRODUCTION_COMBAT_RULE_CATALOG_V2,
} from "@pokenexus/game-core";
import { describe, expect, it, vi } from "vitest";
import {
  MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
  MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH,
  PRODUCTION_COMBAT_V2_RULES_RELEASE_DESCRIPTOR,
  PRODUCTION_COMBAT_V2_RULES_VERSION,
  PRODUCTION_COMBAT_V3_RULES_RELEASE_DESCRIPTOR,
  PRODUCTION_COMBAT_V3_RULES_VERSION,
  createConfiguredMoveEligibilityRulesVersionResolver,
  createConfiguredProductionCombatCatalogResolver,
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
    gameDataBundleHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
    abilities: [],
    types: [],
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
  it("publishes distinct immutable retained-v2 and new-v3 rules release descriptors", () => {
    expect(PRODUCTION_COMBAT_V2_RULES_VERSION).toBe(PRODUCTION_COMBAT_RULE_CATALOG_V1.artifactId);
    expect(PRODUCTION_COMBAT_V3_RULES_VERSION).toBe(PRODUCTION_COMBAT_RULE_CATALOG_V2.artifactId);
    expect(PRODUCTION_COMBAT_V2_RULES_RELEASE_DESCRIPTOR).toMatchObject({
      rulesVersion: PRODUCTION_COMBAT_RULE_CATALOG_V1.artifactId,
      productionSelectability: {
        supportProfileArtifactId: PRODUCTION_COMBAT_RULE_CATALOG_V1.profileArtifactId,
        supportProfileContentHash: PRODUCTION_COMBAT_RULE_CATALOG_V1.profileContentHash,
        combatRuleCatalogArtifactId: PRODUCTION_COMBAT_RULE_CATALOG_V1.artifactId,
        combatRuleCatalogContentHash: PRODUCTION_COMBAT_RULE_CATALOG_V1.canonicalContentHash,
      },
    });
    expect(PRODUCTION_COMBAT_V3_RULES_RELEASE_DESCRIPTOR).toMatchObject({
      rulesVersion: PRODUCTION_COMBAT_RULE_CATALOG_V2.artifactId,
      productionSelectability: {
        supportProfileArtifactId: PRODUCTION_COMBAT_RULE_CATALOG_V2.profileArtifactId,
        supportProfileContentHash: PRODUCTION_COMBAT_RULE_CATALOG_V2.profileContentHash,
        combatRuleCatalogArtifactId: PRODUCTION_COMBAT_RULE_CATALOG_V2.artifactId,
        combatRuleCatalogContentHash: PRODUCTION_COMBAT_RULE_CATALOG_V2.canonicalContentHash,
      },
    });
    expect(PRODUCTION_COMBAT_V3_RULES_RELEASE_DESCRIPTOR.moveEligibilityRuleSemanticsHash).toBe(
      PRODUCTION_COMBAT_V2_RULES_RELEASE_DESCRIPTOR.moveEligibilityRuleSemanticsHash,
    );
    expect(PRODUCTION_COMBAT_V3_RULES_RELEASE_DESCRIPTOR.productionSelectability?.semanticHash).toBe(
      PRODUCTION_COMBAT_V2_RULES_RELEASE_DESCRIPTOR.productionSelectability?.semanticHash,
    );
  });

  it("rejects descriptor swapping under either immutable production rulesVersion", () => {
    const swappedV3UnderRetainedV2 = {
      ...PRODUCTION_COMBAT_V3_RULES_RELEASE_DESCRIPTOR,
      rulesVersion: PRODUCTION_COMBAT_V2_RULES_VERSION,
    };
    const swappedV2UnderNewV3 = {
      ...PRODUCTION_COMBAT_V2_RULES_RELEASE_DESCRIPTOR,
      rulesVersion: PRODUCTION_COMBAT_V3_RULES_VERSION,
    };

    for (const rules of [swappedV3UnderRetainedV2, swappedV2UnderNewV3]) {
      expect(() => createConfiguredMoveEligibilityRulesVersionResolver([
        { rules, newOperationsAllowed: true },
      ])).toThrow(/combat rule catalog artifact identity/);
    }
  });

  it("rejects production catalog aliases under an unpublished rulesVersion", () => {
    const aliasedRules = {
      ...PRODUCTION_COMBAT_V3_RULES_RELEASE_DESCRIPTOR,
      rulesVersion: "rules:production-alias",
    };

    expect(() => createConfiguredMoveEligibilityRulesVersionResolver([
      { rules: aliasedRules, newOperationsAllowed: true },
    ])).toThrow(/combat rule catalog artifact identity/);
  });

  it("rejects a production alias returned by a custom rules resolver before game-data resolution", async () => {
    const rulesVersion = "rules:production-alias";
    const pair = {
      gameDataVersion: PRODUCTION_COMBAT_RULE_CATALOG_V2.gameDataVersion,
      rulesVersion,
    };
    const gameDataVersions = {
      resolve: vi.fn(async () => ({ gameDataVersion: pair.gameDataVersion, newOperationsAllowed: true })),
    };
    const gameData = { load: vi.fn(async () => catalog()) };
    const loader = createMoveEligibilityContextLoader({
      selector: { select: vi.fn(async () => pair) },
      staticContextPairs: {
        resolve: vi.fn(async () => ({ compatibility: pair, newOperationsAllowed: true })),
      },
      rulesVersions: {
        resolve: vi.fn(async () => ({
          rules: {
            ...PRODUCTION_COMBAT_V3_RULES_RELEASE_DESCRIPTOR,
            rulesVersion,
          },
          newOperationsAllowed: true,
        })),
      },
      gameDataVersions,
      gameData,
    });

    await expect(loader.loadForNewOperation()).rejects.toThrow(/combat rule catalog artifact identity/);
    expect(gameDataVersions.resolve).not.toHaveBeenCalled();
    expect(gameData.load).not.toHaveBeenCalled();
  });

  it("rejects explicitly listed production cross-pairs before game-data resolution or fetch", async () => {
    const crossPairs = [
      {
        gameDataVersion: PRODUCTION_COMBAT_RULE_CATALOG_V2.gameDataVersion,
        rules: PRODUCTION_COMBAT_V2_RULES_RELEASE_DESCRIPTOR,
      },
      {
        gameDataVersion: PRODUCTION_COMBAT_RULE_CATALOG_V1.gameDataVersion,
        rules: PRODUCTION_COMBAT_V3_RULES_RELEASE_DESCRIPTOR,
      },
    ];

    for (const { gameDataVersion, rules } of crossPairs) {
      const pair = { gameDataVersion, rulesVersion: rules.rulesVersion };
      const gameDataVersions = {
        resolve: vi.fn(async () => ({ gameDataVersion, newOperationsAllowed: true })),
      };
      const gameData = { load: vi.fn(async () => catalog()) };
      const loader = createMoveEligibilityContextLoader({
        selector: { select: vi.fn(async () => pair) },
        staticContextPairs: {
          resolve: vi.fn(async () => ({ compatibility: pair, newOperationsAllowed: true })),
        },
        rulesVersions: createConfiguredMoveEligibilityRulesVersionResolver([
          { rules, newOperationsAllowed: true },
        ]),
        gameDataVersions,
        gameData,
      });

      await expect(loader.loadForNewOperation()).rejects.toThrow(/not compatible with selected gameDataVersion/);
      expect(gameDataVersions.resolve).not.toHaveBeenCalled();
      expect(gameData.load).not.toHaveBeenCalled();
    }
  });

  it("recomputes the canonical production catalog hash before serving an approved identity", async () => {
    const executableMoveId = PRODUCTION_COMBAT_RULE_CATALOG_V1.executableMoveIds[0];
    const rule = PRODUCTION_COMBAT_RULE_CATALOG_V1.moveRules[executableMoveId];
    if (!rule) throw new Error("test fixture requires an executable production Move");
    const tamperedCatalog = {
      ...PRODUCTION_COMBAT_RULE_CATALOG_V1,
      moveRules: {
        ...PRODUCTION_COMBAT_RULE_CATALOG_V1.moveRules,
        [executableMoveId]: { ...rule, moveCooldownMs: rule.moveCooldownMs + 1 },
      },
    } as never;
    const resolver = createConfiguredProductionCombatCatalogResolver([tamperedCatalog]);

    await expect(resolver.resolve({
      supportProfileArtifactId: PRODUCTION_COMBAT_RULE_CATALOG_V1.profileArtifactId,
      supportProfileContentHash: PRODUCTION_COMBAT_RULE_CATALOG_V1.profileContentHash,
      combatRuleCatalogArtifactId: PRODUCTION_COMBAT_RULE_CATALOG_V1.artifactId,
      combatRuleCatalogContentHash: PRODUCTION_COMBAT_RULE_CATALOG_V1.canonicalContentHash,
    })).rejects.toThrow(/content hash mismatch/);
  });

  it("resolves both immutable production releases only by their full four-field identities", async () => {
    const resolver = createConfiguredProductionCombatCatalogResolver([
      PRODUCTION_COMBAT_RULE_CATALOG_V1,
      PRODUCTION_COMBAT_RULE_CATALOG_V2,
    ]);
    const identityFor = (catalog: typeof PRODUCTION_COMBAT_RULE_CATALOG_V1 | typeof PRODUCTION_COMBAT_RULE_CATALOG_V2) => ({
      supportProfileArtifactId: catalog.profileArtifactId,
      supportProfileContentHash: catalog.profileContentHash,
      combatRuleCatalogArtifactId: catalog.artifactId,
      combatRuleCatalogContentHash: catalog.canonicalContentHash,
    });

    await expect(resolver.resolve(identityFor(PRODUCTION_COMBAT_RULE_CATALOG_V1))).resolves.toBe(
      PRODUCTION_COMBAT_RULE_CATALOG_V1,
    );
    await expect(resolver.resolve(identityFor(PRODUCTION_COMBAT_RULE_CATALOG_V2))).resolves.toBe(
      PRODUCTION_COMBAT_RULE_CATALOG_V2,
    );

    const newIdentity = identityFor(PRODUCTION_COMBAT_RULE_CATALOG_V2);
    for (const drifted of [
      { ...newIdentity, supportProfileArtifactId: PRODUCTION_COMBAT_RULE_CATALOG_V1.profileArtifactId },
      { ...newIdentity, supportProfileContentHash: PRODUCTION_COMBAT_RULE_CATALOG_V1.profileContentHash },
      { ...newIdentity, combatRuleCatalogArtifactId: PRODUCTION_COMBAT_RULE_CATALOG_V1.artifactId },
      { ...newIdentity, combatRuleCatalogContentHash: PRODUCTION_COMBAT_RULE_CATALOG_V1.canonicalContentHash },
    ]) {
      await expect(resolver.resolve(drifted)).resolves.toBeNull();
    }
  });

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

  it("preserves base-only SPEC-010 releases without requiring the production Ability catalog", async () => {
    const baseOnlyCatalog = catalog();
    baseOnlyCatalog.species[0].abilities = [{
      abilityId: "ability:legacy" as never,
      sourceAbilitySlot: "normal-1",
    }];
    const harness = createHarness({ loadedCatalog: baseOnlyCatalog });

    await expect(harness.loader.loadForNewOperation()).resolves.toMatchObject({
      pair: PAIR,
      productionExecutableMoveIds: null,
      productionCatalog: null,
    });
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
