import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProductionMoveCoverageReport,
  PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V2,
  PRODUCTION_COMBAT_GAME_DATA_VERSION_V2,
  PRODUCTION_COMBAT_RULE_CATALOG_V2,
  PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID_V2,
  PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2,
  validateProductionCombatRuleCatalogAgainstGameData,
  type ProductionCombatGameDataFacts,
} from "../../game-core/src/index";
import {
  canonicalJson,
  loadPublishedPromotionV5Bundle,
  loadPublishedPveV4Bundle,
  PREALPHA_AUTHORED_ITEM_IDS,
  PREALPHA_ITEM_IDS,
  stageTask109PveV5Candidate,
  TASK_109_BASE_BUNDLE_HASH,
  TASK_109_BASE_GAME_DATA_VERSION,
  TASK_109_CANDIDATE_GAME_DATA_VERSION,
  TASK_109_PLAYABILITY_GAME_DATA_VERSION,
  TASK_109_PLAYABILITY_PROFILE_ARTIFACT_ID,
  TASK_109_PLAYABILITY_PROFILE_CONTENT_HASH,
} from "../src/node";

const GAME_DATA_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(GAME_DATA_ROOT, "../..");
const PUBLISHED_ROOT = join(GAME_DATA_ROOT, "published");
const PROFILE_PATH = join(GAME_DATA_ROOT, "profiles", "pve", "verdant-edge-prealpha-v1.json");
const STAGE_DIRECTORY = join(REPO_ROOT, ".tmp", "task-109-prealpha-wilds-v5");
const REVIEW_DIRECTORY = join(GAME_DATA_ROOT, "reviews", "task-109");
const REVIEW_PATH = join(REVIEW_DIRECTORY, "prealpha-wilds-v5-human-review.json");
const MANIFEST_PATH = join(REVIEW_DIRECTORY, "prealpha-wilds-v5-candidate-manifest.json");

const SPECIES_WEIGHTS = new Map<string, number>([
  ["candidate:species:pokedex-pidgey-16:8e97efe736", 16],
  ["candidate:species:pokedex-rattata-19:9975b0175c", 15],
  ["candidate:species:pokedex-caterpie-10:f77ea3bb04", 18],
  ["candidate:species:pokedex-sentret-161:fa09afb6e0", 17],
  ["candidate:species:pokedex-ledyba-165:092570add7", 17],
  ["candidate:species:pokedex-sunkern-191:8f850eef0e", 17],
]);
const LEVEL_WEIGHTS = new Map<number, number>([
  [1, 50],
  [2, 35],
  [3, 15],
]);

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
    species: await readJson<ProductionCombatGameDataFacts["species"]>(
      join(directory, "catalogs", "species.json"),
    ),
    moves: await readJson<ProductionCombatGameDataFacts["moves"]>(
      join(directory, "catalogs", "moves.json"),
    ),
    abilities: await readJson<ProductionCombatGameDataFacts["abilities"]>(
      join(directory, "catalogs", "abilities.json"),
    ),
    types: await readJson<ProductionCombatGameDataFacts["types"]>(
      join(directory, "catalogs", "types.json"),
    ),
    learnsets: await readJson<ProductionCombatGameDataFacts["learnsets"]>(
      join(directory, "catalogs", "learnsets.json"),
    ),
  };
}

function level1Projection(
  rows: readonly ProductionCombatGameDataFacts["learnsets"][number][],
): Array<{
  speciesId: string;
  moveId: string;
  method: string;
  level: number | null;
  sourceGame: string;
  sourceGeneration: number;
  machineIdentifier: string | null;
}> {
  return rows
    .filter(
      ({ speciesId, method, level }) =>
        SPECIES_WEIGHTS.has(speciesId) && method === "level-up" && level === 1,
    )
    .map(
      ({
        speciesId,
        moveId,
        method,
        level,
        sourceGame,
        sourceGeneration,
        machineIdentifier,
      }) => ({
        speciesId,
        moveId,
        method,
        level,
        sourceGame,
        sourceGeneration,
        machineIdentifier,
      }),
    )
    .sort((left, right) =>
      canonicalJson(left).localeCompare(canonicalJson(right), "en", { sensitivity: "variant" }),
    );
}

describe("TASK-109 Pre-alpha Wilds schema-5 staging", () => {
  it("stages the exact accepted factorized Wilds and binds real Level-1 production support evidence", async () => {
    const supportBase = await loadPublishedPveV4Bundle(
      PUBLISHED_ROOT,
      PRODUCTION_COMBAT_GAME_DATA_VERSION_V2,
    );
    expect(supportBase.manifest.bundleHash).toBe(PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V2);
    expect(PRODUCTION_COMBAT_GAME_DATA_VERSION_V2).toBe(TASK_109_PLAYABILITY_GAME_DATA_VERSION);
    expect(PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID_V2).toBe(
      TASK_109_PLAYABILITY_PROFILE_ARTIFACT_ID,
    );
    expect(PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2).toBe(
      TASK_109_PLAYABILITY_PROFILE_CONTENT_HASH,
    );

    const supportFacts = await factsAt(supportBase.directory);
    expect(() =>
      validateProductionCombatRuleCatalogAgainstGameData(
        PRODUCTION_COMBAT_RULE_CATALOG_V2,
        supportFacts,
      ),
    ).not.toThrow();
    const playability = buildProductionMoveCoverageReport({
      catalog: PRODUCTION_COMBAT_RULE_CATALOG_V2,
      gameDataVersion: supportFacts.gameDataVersion,
      species: supportFacts.species,
      learnsets: supportFacts.learnsets,
    });

    const level1Evidence = [...SPECIES_WEIGHTS.keys()].sort().map((speciesId) => {
      const row = playability.rows.find(
        (candidate) => candidate.speciesId === speciesId && candidate.level === 1,
      );
      if (!row) throw new Error(`Missing Level-1 production coverage for ${speciesId}`);
      expect(row.executableCount).toBeGreaterThan(0);
      expect(row.progressCapableExecutableCount).toBeGreaterThan(0);
      return row;
    });
    expect(level1Evidence).toHaveLength(6);

    const factualBase = await loadPublishedPromotionV5Bundle(
      PUBLISHED_ROOT,
      TASK_109_BASE_GAME_DATA_VERSION,
    );
    expect(factualBase.manifest.bundleHash).toBe(TASK_109_BASE_BUNDLE_HASH);
    const v4Learnsets = await readJson<ProductionCombatGameDataFacts["learnsets"]>(
      join(factualBase.directory, "catalogs", "learnsets.json"),
    );
    expect(level1Projection(v4Learnsets)).toEqual(level1Projection(supportFacts.learnsets));

    const content = await readJson<unknown>(PROFILE_PATH);
    const staged = await stageTask109PveV5Candidate({
      basePublishedDirectory: factualBase.directory,
      outputDirectory: STAGE_DIRECTORY,
      content,
      playability,
    });
    expect(staged.manifest.candidateGameDataVersion).toBe(TASK_109_CANDIDATE_GAME_DATA_VERSION);
    expect(staged.manifest.baseGameDataVersion).toBe(TASK_109_BASE_GAME_DATA_VERSION);
    expect(staged.manifest.baseBundleHash).toBe(TASK_109_BASE_BUNDLE_HASH);
    expect(staged.manifest.catalogCounts).toMatchObject({
      species: 293,
      items: 30,
      zones: 1,
      hunts: 1,
      encounterDefinitions: 18,
    });
    expect(staged.review.authoredContentAuthority.itemIds).toEqual([
      ...PREALPHA_AUTHORED_ITEM_IDS,
    ]);
    expect(staged.review.playabilityAuthority.level1Rows).toHaveLength(6);
    expect(
      staged.review.playabilityAuthority.level1Rows.every(
        ({ progressCapableExecutableCount }) => progressCapableExecutableCount > 0,
      ),
    ).toBe(true);

    const encounters = staged.review.encounters;
    expect(encounters).toHaveLength(18);
    expect(encounters.reduce((sum, encounter) => sum + encounter.weight, 0)).toBe(10_000);
    const speciesMarginals = new Map<string, number>();
    const levelMarginals = new Map<number, number>();
    const jointPairs = new Set<string>();
    for (const encounter of encounters) {
      expect(encounter.levelBand.min).toBe(encounter.levelBand.max);
      const level = encounter.levelBand.min;
      const speciesWeight = SPECIES_WEIGHTS.get(encounter.speciesId);
      const levelWeight = LEVEL_WEIGHTS.get(level);
      expect(speciesWeight).toBeDefined();
      expect(levelWeight).toBeDefined();
      expect(encounter.weight).toBe(speciesWeight! * levelWeight!);
      const pairKey = `${encounter.speciesId}\u0000${level}`;
      expect(jointPairs.has(pairKey)).toBe(false);
      jointPairs.add(pairKey);
      speciesMarginals.set(
        encounter.speciesId,
        (speciesMarginals.get(encounter.speciesId) ?? 0) + encounter.weight,
      );
      levelMarginals.set(level, (levelMarginals.get(level) ?? 0) + encounter.weight);
      expect(encounter.reward.playerXp).toBe(2 * level);
      expect(encounter.reward.pokemonXpPool).toBe(6 * level);
      expect(encounter.reward.itemDrops).toEqual([
        {
          itemId: PREALPHA_ITEM_IDS.basicPotion,
          quantity: 1,
          chanceBasisPoints: 500,
        },
        {
          itemId: PREALPHA_ITEM_IDS.standardPokeBall,
          quantity: 1,
          chanceBasisPoints: 1_500,
        },
      ]);
      expect(
        encounter.reward.itemDrops.some(({ itemId }) => itemId === PREALPHA_ITEM_IDS.revive25),
      ).toBe(false);
    }
    for (const [speciesId, percent] of SPECIES_WEIGHTS) {
      expect(speciesMarginals.get(speciesId)).toBe(percent * 100);
      for (const level of LEVEL_WEIGHTS.keys()) {
        expect(jointPairs.has(`${speciesId}\u0000${level}`)).toBe(true);
      }
    }
    expect(jointPairs.size).toBe(18);
    for (const [level, percent] of LEVEL_WEIGHTS) {
      expect(levelMarginals.get(level)).toBe(percent * 100);
    }
    expect(staged.review.distribution.speciesMarginalWeights).toEqual(
      Object.fromEntries(speciesMarginals),
    );
    expect(staged.review.distribution.levelMarginalWeights).toEqual(
      Object.fromEntries([...levelMarginals].map(([level, weight]) => [String(level), weight])),
    );

    const factualLogicalNames = [
      "catalogs/species",
      "catalogs/moves",
      "catalogs/types",
      "catalogs/abilities",
      "catalogs/items",
      "catalogs/learnsets",
      "referenceData/currentTypeEffectiveness",
    ];
    for (const logicalName of factualLogicalNames) {
      const before = factualBase.manifest.artifacts.find(
        (descriptor) => descriptor.logicalName === logicalName,
      );
      const after = staged.manifest.artifacts.find(
        (descriptor) => descriptor.logicalName === logicalName,
      );
      expect(after).toEqual(before);
    }
    expect(staged.manifest.provenanceHash).toBe(factualBase.manifest.provenanceHash);
    expect(staged.manifest.provenanceManifest).toEqual(factualBase.manifest.provenanceManifest);
    expect(staged.manifest.sourceInventory).toEqual(factualBase.manifest.sourceInventory);

    await mkdir(REVIEW_DIRECTORY, { recursive: true });
    await writeFile(REVIEW_PATH, canonicalJson(staged.review), "utf8");
    await writeFile(MANIFEST_PATH, canonicalJson(staged.manifest), "utf8");

    process.stdout.write(
      JSON.stringify(
        {
          candidateGameDataVersion: staged.manifest.candidateGameDataVersion,
          candidateBundleHash: staged.manifest.candidateBundleHash,
          contentCommitmentHash: staged.manifest.contentCommitmentHash,
          reviewHash: staged.reviewHash,
          stageManifestHash: staged.stageManifestHash,
          reviewPath: REVIEW_PATH,
          manifestPath: MANIFEST_PATH,
          publicationGate: "exact Human-approved reviewHash required before schema-5 publication",
        },
        null,
        2,
      ) + "\n",
    );
  });
});
