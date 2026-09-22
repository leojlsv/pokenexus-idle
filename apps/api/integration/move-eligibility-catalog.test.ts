import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  deriveLevelAvailableMoves,
  selectBootstrapMoveLoadout,
} from "@pokenexus/game-core";
import { describe, expect, it } from "vitest";
import {
  MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
  MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH,
  createConfiguredMoveEligibilityRulesVersionResolver,
  createMoveEligibilityContextLoader,
  createRuntimeMoveEligibilityGameDataLoader,
} from "../src/moves/context";
import { createConfiguredStaticContextAuthority } from "../src/static-context/authority";

const V2 = "game-data-core-kanto-johto-v2";
const TEST_RULES = "rules:task-089-v1-catalog-regression";
const publishedRoot = resolve(process.cwd(), "../../packages/game-data/published");

const gameDataReader = {
  async read(path: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(resolve(publishedRoot, path)));
  },
};

function configuredAuthority() {
  const staticContext = createConfiguredStaticContextAuthority({
    selectedPair: { gameDataVersion: V2, rulesVersion: TEST_RULES },
    releases: [
      {
        pair: { gameDataVersion: V2, rulesVersion: TEST_RULES },
        newOperationsAllowed: true,
      },
      {
        pair: {
          gameDataVersion: "game-data-core-kanto-johto-v1",
          rulesVersion: TEST_RULES,
        },
        newOperationsAllowed: false,
      },
    ],
  });
  const rulesVersions = createConfiguredMoveEligibilityRulesVersionResolver([
    {
      rules: {
        rulesVersion: TEST_RULES,
        moveEligibilityRuleArtifactId: MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
        moveEligibilityRuleSemanticsHash: MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH,
      },
      newOperationsAllowed: true,
    },
  ]);
  return { staticContext, rulesVersions };
}

describe("TASK-089 enabled catalog regression", () => {
  it("evaluates only explicitly new-use-enabled v1 contexts and keeps every v2 Species bootstrap-feasible", async () => {
    const { staticContext, rulesVersions } = configuredAuthority();
    expect(staticContext.listNewOperationPairs()).toEqual([
      { gameDataVersion: V2, rulesVersion: TEST_RULES },
    ]);

    const gameData = createRuntimeMoveEligibilityGameDataLoader(gameDataReader);
    const loader = createMoveEligibilityContextLoader({
      selector: staticContext.selector,
      staticContextPairs: staticContext.staticContextPairs,
      gameDataVersions: staticContext.gameDataVersions,
      rulesVersions,
      gameData,
    });
    const context = await loader.loadForNewOperation();
    const catalog = await gameData.load(V2);

    expect(catalog.species).toHaveLength(293);
    expect(context.pair).toEqual({ gameDataVersion: V2, rulesVersion: TEST_RULES });

    let speciesWithRepeatedLevelUpRows = 0;
    for (const species of catalog.species) {
      const rows = context.learnsetsBySpecies.get(species.id) ?? [];
      const levelOne = deriveLevelAvailableMoves({
        speciesId: species.id,
        currentLevel: 1,
        learnset: rows,
      });
      expect(levelOne.length, `Level-1 bootstrap candidates for ${species.id}`).toBeGreaterThan(0);
      const bootstrap = selectBootstrapMoveLoadout(levelOne);
      expect(bootstrap.length).toBeGreaterThanOrEqual(1);
      expect(bootstrap.length).toBeLessThanOrEqual(4);
      expect(bootstrap.every((moveId) => context.moveIds.has(moveId))).toBe(true);

      const levelUpCounts = new Map<string, number>();
      for (const row of rows) {
        if (row.method !== "level-up") continue;
        levelUpCounts.set(row.moveId, (levelUpCounts.get(row.moveId) ?? 0) + 1);
      }
      if ([...levelUpCounts.values()].some((count) => count > 1)) {
        speciesWithRepeatedLevelUpRows += 1;
      }
    }
    expect(speciesWithRepeatedLevelUpRows).toBe(9);
  });

  it("retains the accepted Abra and Ampharos deterministic bootstrap examples", async () => {
    const { staticContext, rulesVersions } = configuredAuthority();
    const gameData = createRuntimeMoveEligibilityGameDataLoader(gameDataReader);
    const loader = createMoveEligibilityContextLoader({
      selector: staticContext.selector,
      staticContextPairs: staticContext.staticContextPairs,
      gameDataVersions: staticContext.gameDataVersions,
      rulesVersions,
      gameData,
    });
    const context = await loader.loadForNewOperation();
    const catalog = await gameData.load(V2);
    const abra = catalog.species.find(({ sourceName }) => sourceName === "Abra");
    const ampharos = catalog.species.find(({ sourceName }) => sourceName === "Ampharos");
    if (!abra || !ampharos) throw new Error("Expected Abra and Ampharos in v2 catalog");

    const bootstrapAt = (speciesId: string, level: number) => selectBootstrapMoveLoadout(
      deriveLevelAvailableMoves({
        speciesId,
        currentLevel: level,
        learnset: context.learnsetsBySpecies.get(speciesId) ?? [],
      }),
    );

    expect(bootstrapAt(abra.id, 1)).toEqual([
      "candidate:move:teleport:e99f7ff1eb",
    ]);
    expect(bootstrapAt(ampharos.id, 1)).toEqual([
      "candidate:move:dragon-pulse:54d897ab30",
      "candidate:move:fire-punch:b4c67d5c14",
      "candidate:move:growl:7d61e39e75",
      "candidate:move:magnetic-flux:dc5c8eb468",
    ]);
    expect(bootstrapAt(ampharos.id, 20)).toEqual([
      "candidate:move:take-down:790765ae8a",
      "candidate:move:charge:97488fbab3",
      "candidate:move:cotton-spore:63a0b4a779",
      "candidate:move:dragon-pulse:54d897ab30",
    ]);
  });
});
