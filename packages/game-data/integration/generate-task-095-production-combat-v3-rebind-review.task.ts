import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProductionMoveCoverageReport,
  PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH,
  PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V2,
  PRODUCTION_COMBAT_GAME_DATA_VERSION,
  PRODUCTION_COMBAT_GAME_DATA_VERSION_V2,
  PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID,
  PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID_V2,
  PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH,
  PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH_V2,
  PRODUCTION_COMBAT_RULE_CATALOG_V1,
  PRODUCTION_COMBAT_RULE_CATALOG_V2,
  PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID,
  PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID_V2,
  PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH,
  PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2,
  validateProductionCombatRuleCatalogAgainstGameData,
  type ProductionCombatGameDataFacts,
  type ProductionMoveCoverageReport,
} from "../../game-core/src/index";
import {
  canonicalJson,
  loadPublishedBundle,
  loadPublishedPveV4Bundle,
  sha256,
  type EncounterDefinitionV1,
} from "../src/node";

const GAME_DATA_ROOT = resolve(import.meta.dirname, "..");
const PUBLISHED_ROOT = join(GAME_DATA_ROOT, "published");
const REVIEW_DIRECTORY = join(GAME_DATA_ROOT, "reviews", "task-095");
const REVIEW_PATH = join(REVIEW_DIRECTORY, "production-combat-v3-rebind.json");
const VERDANT_HUNT_ID = "hunt:verdant-edge:wilds";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function v3Facts(directory: string): Promise<ProductionCombatGameDataFacts> {
  const manifest = await readJson<{ gameDataVersion: string; bundleHash: string }>(join(directory, "manifest.json"));
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

function coverageAt(
  coverage: ProductionMoveCoverageReport,
  speciesId: string,
  level: number,
): ProductionMoveCoverageReport["rows"][number] {
  const row = coverage.rows
    .filter((candidate) => candidate.speciesId === speciesId && candidate.level <= level)
    .sort((left, right) => right.level - left.level)[0];
  if (!row) throw new Error(`Missing production coverage for ${speciesId} at Level ${level}`);
  return row;
}

function coverageSummary(coverage: ProductionMoveCoverageReport) {
  const bySpecies = new Map<string, ProductionMoveCoverageReport["rows"]>();
  for (const row of coverage.rows) {
    const existing = bySpecies.get(row.speciesId) ?? [];
    bySpecies.set(row.speciesId, [...existing, row]);
  }
  return {
    speciesCount: coverage.speciesCount,
    rowCount: coverage.rows.length,
    canonicalRowsHash: sha256(Buffer.from(canonicalJson(coverage.rows), "utf8")),
    speciesWithExecutableAtAnyLevel: [...bySpecies.values()]
      .filter((rows) => rows.some(({ executableCount }) => executableCount > 0)).length,
    level1SpeciesWithExecutable: coverage.rows
      .filter(({ level, executableCount }) => level === 1 && executableCount > 0).length,
    speciesWithProgressAtAnyLevel: [...bySpecies.values()]
      .filter((rows) => rows.some(({ progressCapableExecutableCount }) => progressCapableExecutableCount > 0)).length,
    level1SpeciesWithProgress: coverage.rows
      .filter(({ level, progressCapableExecutableCount }) => level === 1 && progressCapableExecutableCount > 0).length,
  };
}

describe("TASK-095 production combat v3 rebind review evidence", () => {
  it("materializes deterministic exact-pair, all-Species, and Verdant Edge revalidation evidence", async () => {
    const retained = await loadPublishedBundle(PUBLISHED_ROOT, PRODUCTION_COMBAT_GAME_DATA_VERSION);
    const publishedV3 = await loadPublishedPveV4Bundle(PUBLISHED_ROOT, PRODUCTION_COMBAT_GAME_DATA_VERSION_V2);
    expect(publishedV3.manifest.bundleHash).toBe(PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V2);

    const retainedFacts: ProductionCombatGameDataFacts = {
      gameDataVersion: retained.manifest.gameDataVersion,
      gameDataBundleHash: retained.manifest.bundleHash,
      species: retained.candidate.catalogs.species,
      moves: retained.candidate.catalogs.moves,
      abilities: retained.candidate.catalogs.abilities,
      types: retained.candidate.catalogs.types,
      learnsets: retained.candidate.catalogs.learnsets,
    };
    const reboundFacts = await v3Facts(publishedV3.directory);

    expect(() => validateProductionCombatRuleCatalogAgainstGameData(
      PRODUCTION_COMBAT_RULE_CATALOG_V1,
      retainedFacts,
    )).not.toThrow();
    expect(() => validateProductionCombatRuleCatalogAgainstGameData(
      PRODUCTION_COMBAT_RULE_CATALOG_V2,
      reboundFacts,
    )).not.toThrow();
    expect(() => validateProductionCombatRuleCatalogAgainstGameData(
      PRODUCTION_COMBAT_RULE_CATALOG_V1,
      reboundFacts,
    )).toThrow(/gameDataVersion mismatch/);
    expect(() => validateProductionCombatRuleCatalogAgainstGameData(
      PRODUCTION_COMBAT_RULE_CATALOG_V2,
      retainedFacts,
    )).toThrow(/gameDataVersion mismatch/);

    const retainedCoverage = buildProductionMoveCoverageReport({
      catalog: PRODUCTION_COMBAT_RULE_CATALOG_V1,
      gameDataVersion: retainedFacts.gameDataVersion,
      species: retainedFacts.species,
      learnsets: retainedFacts.learnsets,
    });
    const reboundCoverage = buildProductionMoveCoverageReport({
      catalog: PRODUCTION_COMBAT_RULE_CATALOG_V2,
      gameDataVersion: reboundFacts.gameDataVersion,
      species: reboundFacts.species,
      learnsets: reboundFacts.learnsets,
    });
    expect(reboundCoverage.rows).toEqual(retainedCoverage.rows);

    const retainedSummary = coverageSummary(retainedCoverage);
    const reboundSummary = coverageSummary(reboundCoverage);
    expect(reboundSummary).toEqual(retainedSummary);
    expect(reboundSummary).toMatchObject({
      speciesCount: 293,
      speciesWithExecutableAtAnyLevel: 277,
      level1SpeciesWithExecutable: 254,
      speciesWithProgressAtAnyLevel: 234,
      level1SpeciesWithProgress: 203,
    });

    const encounters = await readJson<EncounterDefinitionV1[]>(
      join(publishedV3.directory, "catalogs", "encounter-definitions.json"),
    );
    const verdantEdgeAdmissions = encounters
      .filter(({ huntId }) => huntId === VERDANT_HUNT_ID)
      .flatMap((encounter) => {
        const rows = [];
        for (let level = encounter.levelBand.min; level <= encounter.levelBand.max; level += 1) {
          const coverage = coverageAt(reboundCoverage, encounter.speciesId, level);
          rows.push({
            encounterId: encounter.id,
            speciesId: encounter.speciesId,
            level,
            evidenceThresholdLevel: coverage.level,
            executableCount: coverage.executableCount,
            progressCapableExecutableCount: coverage.progressCapableExecutableCount,
          });
        }
        return rows;
      })
      .sort((left, right) => left.encounterId.localeCompare(right.encounterId, "en", { sensitivity: "variant" }));
    expect(verdantEdgeAdmissions).toHaveLength(9);
    expect(verdantEdgeAdmissions.every(({ progressCapableExecutableCount }) => progressCapableExecutableCount > 0)).toBe(true);
    for (const row of verdantEdgeAdmissions) {
      if (row.speciesId.includes("rattata-19") || row.speciesId.includes("spearow-21")) {
        expect(row.progressCapableExecutableCount).toBe(1);
      } else if (row.speciesId.includes("hoothoot-163")) {
        expect(row.progressCapableExecutableCount).toBe(2);
      } else {
        throw new Error(`Unexpected Verdant Edge SpeciesId ${row.speciesId}`);
      }
    }

    const receipt = {
      receiptVersion: "task-095-production-combat-v3-rebind-review-v1",
      retainedPair: {
        gameDataVersion: PRODUCTION_COMBAT_GAME_DATA_VERSION,
        gameDataBundleHash: PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH,
        rulesVersion: PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID,
        supportProfileArtifactId: PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID,
        supportProfileContentHash: PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH,
        combatRuleCatalogArtifactId: PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID,
        combatRuleCatalogContentHash: PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH,
      },
      reboundPair: {
        gameDataVersion: PRODUCTION_COMBAT_GAME_DATA_VERSION_V2,
        gameDataBundleHash: PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V2,
        rulesVersion: PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID_V2,
        supportProfileArtifactId: PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID_V2,
        supportProfileContentHash: PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2,
        combatRuleCatalogArtifactId: PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID_V2,
        combatRuleCatalogContentHash: PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH_V2,
      },
      supportInventory: {
        moveCount: PRODUCTION_COMBAT_RULE_CATALOG_V2.moveSupport.length,
        executableSimple: PRODUCTION_COMBAT_RULE_CATALOG_V2.moveSupport
          .filter(({ support }) => support === "executable-simple").length,
        executableAuthored: PRODUCTION_COMBAT_RULE_CATALOG_V2.moveSupport
          .filter(({ support }) => support === "executable-authored").length,
        unsupported: PRODUCTION_COMBAT_RULE_CATALOG_V2.moveSupport
          .filter(({ support }) => support === "unsupported").length,
        abilityCount: PRODUCTION_COMBAT_RULE_CATALOG_V2.abilitySupport.length,
        inactiveByPolicy: PRODUCTION_COMBAT_RULE_CATALOG_V2.abilitySupport
          .filter(({ support }) => support === "inactive-by-policy").length,
      },
      coverage: {
        ...reboundSummary,
        matchesRetainedV2Rows: reboundSummary.canonicalRowsHash === retainedSummary.canonicalRowsHash,
      },
      exactCatalogBindingMatrix: [
        { gameDataVersion: PRODUCTION_COMBAT_GAME_DATA_VERSION, rulesVersion: PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID, accepted: true },
        { gameDataVersion: PRODUCTION_COMBAT_GAME_DATA_VERSION_V2, rulesVersion: PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID_V2, accepted: true },
        { gameDataVersion: PRODUCTION_COMBAT_GAME_DATA_VERSION_V2, rulesVersion: PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID, accepted: false },
        { gameDataVersion: PRODUCTION_COMBAT_GAME_DATA_VERSION, rulesVersion: PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID_V2, accepted: false },
      ],
      verdantEdgeAdmissions,
    };
    expect(receipt.supportInventory).toEqual({
      moveCount: 453,
      executableSimple: 27,
      executableAuthored: 18,
      unsupported: 408,
      abilityCount: 147,
      inactiveByPolicy: 147,
    });
    expect(receipt.coverage.matchesRetainedV2Rows).toBe(true);

    const bytes = canonicalJson(receipt);
    await mkdir(REVIEW_DIRECTORY, { recursive: true });
    await writeFile(REVIEW_PATH, bytes, "utf8");
    const reviewHash = sha256(Buffer.from(bytes, "utf8"));

    process.stdout.write(JSON.stringify({ reviewPath: REVIEW_PATH, reviewHash, ...receipt.coverage }, null, 2) + "\n");
  });
});
