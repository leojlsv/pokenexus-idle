import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProductionMoveCoverageReport,
  pokemonXpFloor,
  PRODUCTION_COMBAT_RULE_CATALOG_V1,
  validateProductionCombatRuleCatalogAgainstGameData,
} from "../../game-core/src/index";
import {
  canonicalJson,
  loadPublishedBundle,
  loadPublishedPveV4Bundle,
  publishApprovedPveV4Candidate,
  stagePveV4Candidate,
} from "../src/node";

const GAME_DATA_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(GAME_DATA_ROOT, "../..");
const PUBLISHED_ROOT = join(GAME_DATA_ROOT, "published");
const REVIEW_DIRECTORY = join(GAME_DATA_ROOT, "reviews", "task-034");
const PROFILE_PATH = join(GAME_DATA_ROOT, "profiles", "pve", "verdant-edge-v1.json");
const STAGE_DIRECTORY = join(REPO_ROOT, ".tmp", "task-034-verdant-edge-v1-publish");

const BASE_GAME_DATA_VERSION = "game-data-core-kanto-johto-v2";
const FINAL_GAME_DATA_VERSION = "game-data-core-kanto-johto-v3";
const HUMAN_APPROVED_AT = "2026-09-24T00:50:52Z";
const PUBLISHED_AT = "2026-09-24T00:55:51.000Z";
const HUMAN_APPROVED_REVIEW_HASH =
  "sha256:ea956e6932bb4d2587883a0ffd8e5e2f90ce5f16559c8866dd274c2acd403ad6";
const APPROVED_CONTENT_COMMITMENT =
  "sha256:b3cb6b8da30b57bbdf12469077269b57c8abace6aa62ca0179270c4885e3486e";

describe("TASK-034 approved Verdant Edge canonical publication", () => {
  it("publishes the exact Human-approved schema-v4 content as immutable v3 game data", async () => {
    const base = await loadPublishedBundle(PUBLISHED_ROOT, BASE_GAME_DATA_VERSION);
    const combatFacts = {
      gameDataVersion: base.manifest.gameDataVersion,
      gameDataBundleHash: base.manifest.bundleHash,
      species: base.candidate.catalogs.species,
      moves: base.candidate.catalogs.moves,
      abilities: base.candidate.catalogs.abilities,
      types: base.candidate.catalogs.types,
      learnsets: base.candidate.catalogs.learnsets,
    };
    expect(() =>
      validateProductionCombatRuleCatalogAgainstGameData(
        PRODUCTION_COMBAT_RULE_CATALOG_V1,
        combatFacts,
      ),
    ).not.toThrow();

    const playability = buildProductionMoveCoverageReport({
      catalog: PRODUCTION_COMBAT_RULE_CATALOG_V1,
      gameDataVersion: base.manifest.gameDataVersion,
      species: base.candidate.catalogs.species,
      learnsets: base.candidate.catalogs.learnsets,
    });
    const candidate = JSON.parse(await readFile(PROFILE_PATH, "utf8")) as unknown;
    const pokemonNextLevelXpCostByLevel: Record<number, number> = {};
    for (const level of [3, 4, 5]) {
      pokemonNextLevelXpCostByLevel[level] = Number(
        pokemonXpFloor(BigInt(level + 1)) - pokemonXpFloor(BigInt(level)),
      );
    }

    const staged = await stagePveV4Candidate({
      basePublishedDirectory: base.directory,
      outputDirectory: STAGE_DIRECTORY,
      content: candidate,
      playability,
      pokemonNextLevelXpCostByLevel,
    });
    expect(staged.manifest.reviewHash).toBe(HUMAN_APPROVED_REVIEW_HASH);
    expect(staged.manifest.contentCommitmentHash).toBe(APPROVED_CONTENT_COMMITMENT);

    const published = await publishApprovedPveV4Candidate(
      staged,
      PUBLISHED_ROOT,
      FINAL_GAME_DATA_VERSION,
      PUBLISHED_AT,
      {
        approvedReviewHash: HUMAN_APPROVED_REVIEW_HASH,
        approvedAt: HUMAN_APPROVED_AT,
      },
    );
    const reloaded = await loadPublishedPveV4Bundle(
      PUBLISHED_ROOT,
      FINAL_GAME_DATA_VERSION,
    );
    expect(reloaded.manifest).toEqual(published.manifest);
    expect(reloaded.manifest.schemaVersion).toBe("4");
    expect(reloaded.manifest.gameDataVersion).toBe(FINAL_GAME_DATA_VERSION);
    expect(reloaded.manifest.artifacts).toHaveLength(10);
    expect(reloaded.manifest.catalogCounts).toMatchObject({
      species: 293,
      moves: 547,
      learnsets: 19_035,
      zones: 1,
      hunts: 1,
      encounterDefinitions: 9,
    });

    const receipt = {
      receiptVersion: "task-034-pve-publication-receipt-v1",
      humanApproval: {
        approvedAt: HUMAN_APPROVED_AT,
        approvedReviewHash: HUMAN_APPROVED_REVIEW_HASH,
        approvedContentCommitment: APPROVED_CONTENT_COMMITMENT,
      },
      publication: {
        schemaVersion: reloaded.manifest.schemaVersion,
        pveContentSchemaVersion: reloaded.manifest.pveContentSchemaVersion,
        gameDataVersion: reloaded.manifest.gameDataVersion,
        bundleHash: reloaded.manifest.bundleHash,
        publishedAt: reloaded.manifest.publishedAt,
        publishedDirectory: basename(reloaded.directory),
        artifactCount: reloaded.manifest.artifacts.length,
        catalogCounts: reloaded.manifest.catalogCounts,
        provenanceHash: reloaded.manifest.provenanceHash,
      },
      staging: {
        stageManifestHash: staged.stageManifestHash,
        reviewHash: staged.manifest.reviewHash,
        contentCommitmentHash: staged.manifest.contentCommitmentHash,
      },
    };
    await mkdir(REVIEW_DIRECTORY, { recursive: true });
    await writeFile(
      join(REVIEW_DIRECTORY, "verdant-edge-v1-publication.json"),
      canonicalJson(receipt),
      "utf8",
    );

    process.stdout.write(
      JSON.stringify(
        {
          gameDataVersion: reloaded.manifest.gameDataVersion,
          bundleHash: reloaded.manifest.bundleHash,
          publishedAt: reloaded.manifest.publishedAt,
          publishedDirectory: basename(reloaded.directory),
          approvedReviewHash: HUMAN_APPROVED_REVIEW_HASH,
          contentCommitmentHash: staged.manifest.contentCommitmentHash,
          stageManifestHash: staged.stageManifestHash,
        },
        null,
        2,
      ) + "\n",
    );
  }, 30_000);
});
