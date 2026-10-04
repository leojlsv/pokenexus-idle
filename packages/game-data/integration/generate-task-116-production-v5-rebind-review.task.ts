import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GENETIC_COMBAT_RULES_SEMANTICS_HASH_V1,
  GENETIC_COMBAT_RULES_SEMANTICS_HASH_V2,
  GENETIC_COMBAT_RULES_VERSION_V1,
  GENETIC_COMBAT_RULES_VERSION_V2,
  PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V2,
  PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V3,
  PRODUCTION_COMBAT_GAME_DATA_VERSION_V2,
  PRODUCTION_COMBAT_GAME_DATA_VERSION_V3,
  PRODUCTION_COMBAT_RULE_CATALOG_V2,
  PRODUCTION_COMBAT_RULE_CATALOG_V3,
  buildProductionMoveCoverageReport,
  validateProductionCombatRuleCatalogAgainstGameData,
  type ProductionCombatGameDataFacts,
} from "../../game-core/src/index";
import {
  canonicalJson,
  loadPublishedPromotionV5Bundle,
  loadPublishedPveV4Bundle,
  sha256,
  type EncounterDefinitionV1,
} from "../src/node";

const GAME_DATA_ROOT = resolve(import.meta.dirname, "..");
const PUBLISHED_ROOT = join(GAME_DATA_ROOT, "published");
const REVIEW_DIRECTORY = join(GAME_DATA_ROOT, "reviews", "task-116");
const REVIEW_PATH = join(REVIEW_DIRECTORY, "production-combat-v5-rebind.json");
const WILDS_HUNT_ID = "hunt:verdant-edge:wilds";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function factsAt(directory: string): Promise<ProductionCombatGameDataFacts> {
  const manifest = await readJson<{ gameDataVersion: string; bundleHash: string }>(
    join(directory, "manifest.json"),
  );
  return {
    gameDataVersion: manifest.gameDataVersion,
    gameDataBundleHash: manifest.bundleHash,
    species: await readJson<ProductionCombatGameDataFacts["species"]>(join(directory, "catalogs", "species.json")),
    moves: await readJson<ProductionCombatGameDataFacts["moves"]>(join(directory, "catalogs", "moves.json")),
    abilities: await readJson<ProductionCombatGameDataFacts["abilities"]>(join(directory, "catalogs", "abilities.json")),
    types: await readJson<ProductionCombatGameDataFacts["types"]>(join(directory, "catalogs", "types.json")),
    learnsets: await readJson<ProductionCombatGameDataFacts["learnsets"]>(join(directory, "catalogs", "learnsets.json")),
  };
}

describe("TASK-116 production combat v5 rebind review evidence", () => {
  it("binds exact v5 authority while preserving production/Genetic semantics", async () => {
    const retained = await loadPublishedPveV4Bundle(PUBLISHED_ROOT, PRODUCTION_COMBAT_GAME_DATA_VERSION_V2);
    const rebound = await loadPublishedPromotionV5Bundle(PUBLISHED_ROOT, PRODUCTION_COMBAT_GAME_DATA_VERSION_V3);
    expect(retained.manifest.bundleHash).toBe(PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V2);
    expect(rebound.manifest.bundleHash).toBe(PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V3);

    const retainedFacts = await factsAt(retained.directory);
    const reboundFacts = await factsAt(rebound.directory);
    expect(() => validateProductionCombatRuleCatalogAgainstGameData(
      PRODUCTION_COMBAT_RULE_CATALOG_V2,
      retainedFacts,
    )).not.toThrow();
    expect(() => validateProductionCombatRuleCatalogAgainstGameData(
      PRODUCTION_COMBAT_RULE_CATALOG_V3,
      reboundFacts,
    )).not.toThrow();
    expect(() => validateProductionCombatRuleCatalogAgainstGameData(
      PRODUCTION_COMBAT_RULE_CATALOG_V2,
      reboundFacts,
    )).toThrow(/gameDataVersion mismatch/);
    expect(() => validateProductionCombatRuleCatalogAgainstGameData(
      PRODUCTION_COMBAT_RULE_CATALOG_V3,
      retainedFacts,
    )).toThrow(/gameDataVersion mismatch/);

    const retainedCoverage = buildProductionMoveCoverageReport({
      catalog: PRODUCTION_COMBAT_RULE_CATALOG_V2,
      gameDataVersion: retainedFacts.gameDataVersion,
      species: retainedFacts.species,
      learnsets: retainedFacts.learnsets,
    });
    const reboundCoverage = buildProductionMoveCoverageReport({
      catalog: PRODUCTION_COMBAT_RULE_CATALOG_V3,
      gameDataVersion: reboundFacts.gameDataVersion,
      species: reboundFacts.species,
      learnsets: reboundFacts.learnsets,
    });
    expect(reboundCoverage.rows).toEqual(retainedCoverage.rows);

    const encounters = await readJson<EncounterDefinitionV1[]>(
      join(rebound.directory, "catalogs", "encounter-definitions.json"),
    );
    const wilds = encounters.filter(({ huntId }) => huntId === WILDS_HUNT_ID);
    expect(wilds).toHaveLength(18);
    const level1Species = new Set(wilds.filter(({ levelBand }) => levelBand.min === 1).map(({ speciesId }) => speciesId));
    expect(level1Species.size).toBe(6);
    for (const speciesId of level1Species) {
      const row = reboundCoverage.rows.find((candidate) => candidate.speciesId === speciesId && candidate.level === 1);
      expect(row?.progressCapableExecutableCount).toBeGreaterThan(0);
    }

    const supportInventory = {
      moveCount: PRODUCTION_COMBAT_RULE_CATALOG_V3.moveSupport.length,
      executableSimple: PRODUCTION_COMBAT_RULE_CATALOG_V3.moveSupport.filter(({ support }) => support === "executable-simple").length,
      executableAuthored: PRODUCTION_COMBAT_RULE_CATALOG_V3.moveSupport.filter(({ support }) => support === "executable-authored").length,
      unsupported: PRODUCTION_COMBAT_RULE_CATALOG_V3.moveSupport.filter(({ support }) => support === "unsupported").length,
      abilityCount: PRODUCTION_COMBAT_RULE_CATALOG_V3.abilitySupport.length,
      inactiveByPolicy: PRODUCTION_COMBAT_RULE_CATALOG_V3.abilitySupport.filter(({ support }) => support === "inactive-by-policy").length,
    };
    expect(supportInventory).toEqual({
      moveCount: 453,
      executableSimple: 27,
      executableAuthored: 18,
      unsupported: 408,
      abilityCount: 147,
      inactiveByPolicy: 147,
    });

    const receipt = {
      receiptVersion: "task-116-production-combat-v5-rebind-review-v1",
      retained: {
        gameDataVersion: PRODUCTION_COMBAT_GAME_DATA_VERSION_V2,
        gameDataBundleHash: PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V2,
        geneticRulesVersion: GENETIC_COMBAT_RULES_VERSION_V1,
        geneticSemanticsHash: GENETIC_COMBAT_RULES_SEMANTICS_HASH_V1,
        productionCatalog: {
          artifactId: PRODUCTION_COMBAT_RULE_CATALOG_V2.artifactId,
          canonicalHash: PRODUCTION_COMBAT_RULE_CATALOG_V2.canonicalContentHash,
          supportProfileArtifactId: PRODUCTION_COMBAT_RULE_CATALOG_V2.profileArtifactId,
          supportProfileContentHash: PRODUCTION_COMBAT_RULE_CATALOG_V2.profileContentHash,
        },
      },
      rebound: {
        gameDataVersion: PRODUCTION_COMBAT_GAME_DATA_VERSION_V3,
        gameDataBundleHash: PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V3,
        geneticRulesVersion: GENETIC_COMBAT_RULES_VERSION_V2,
        geneticSemanticsHash: GENETIC_COMBAT_RULES_SEMANTICS_HASH_V2,
        productionCatalog: {
          artifactId: PRODUCTION_COMBAT_RULE_CATALOG_V3.artifactId,
          canonicalHash: PRODUCTION_COMBAT_RULE_CATALOG_V3.canonicalContentHash,
          supportProfileArtifactId: PRODUCTION_COMBAT_RULE_CATALOG_V3.profileArtifactId,
          supportProfileContentHash: PRODUCTION_COMBAT_RULE_CATALOG_V3.profileContentHash,
        },
      },
      supportInventory,
      coverage: {
        speciesCount: reboundCoverage.speciesCount,
        rowCount: reboundCoverage.rows.length,
        rowsHash: sha256(Buffer.from(canonicalJson(reboundCoverage.rows), "utf8")),
        exactRowsMatchRetained: canonicalJson(reboundCoverage.rows) === canonicalJson(retainedCoverage.rows),
      },
      wilds: {
        encounterCount: wilds.length,
        level1SpeciesCount: level1Species.size,
        everyLevel1SpeciesProgressCapable: [...level1Species].every((speciesId) =>
          (reboundCoverage.rows.find((row) => row.speciesId === speciesId && row.level === 1)
            ?.progressCapableExecutableCount ?? 0) > 0),
      },
    };
    expect(receipt.coverage.exactRowsMatchRetained).toBe(true);
    expect(receipt.wilds.everyLevel1SpeciesProgressCapable).toBe(true);

    const bytes = canonicalJson(receipt);
    await mkdir(REVIEW_DIRECTORY, { recursive: true });
    await writeFile(REVIEW_PATH, bytes, "utf8");
    process.stdout.write(JSON.stringify({
      reviewPath: REVIEW_PATH,
      reviewHash: sha256(Buffer.from(bytes, "utf8")),
      rebound: receipt.rebound,
      supportInventory,
      coverage: receipt.coverage,
      wilds: receipt.wilds,
    }, null, 2) + "\n");
  });
});
