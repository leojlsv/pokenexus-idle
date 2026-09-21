import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { finalizeProvenance } from "./canonical.js";
import type {
  CandidateValidationReport,
  RawExtractedSnapshot,
} from "./normalization.js";
import { stageCandidate, validatePublicationReadiness } from "./publication.js";
import { buildReviewStage } from "./review-stage.js";
import {
  GEN9_MOVE_SOURCE_RECORD_ID,
  SOURCE_RECORD_ID,
  ZA_MOVE_SOURCE_RECORD_ID,
  mappingRegistryFixture,
  publishableCandidateFixture,
} from "./test-fixtures.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function rawFixture(): RawExtractedSnapshot {
  return {
    parserVersion: "review-test-raw-v1",
    speciesDiscovery: [],
    discovery: {
      moves: [],
      types: [],
      abilities: [],
      items: [],
      learnsets: [],
      currentTypeEffectiveness: [],
    },
    species: [],
    moves: [],
    types: [],
    abilities: [],
    items: [],
    learnsets: [],
    historicalScalarProofs: [],
    currentTypeEffectiveness: [],
  };
}

function reviewFixture(exclusionReason = "battle-only-transformation") {
  const candidate = publishableCandidateFixture();
  candidate.catalogs.species[0].baseExperience = { status: "source-unavailable" };

  const mappingRegistry = mappingRegistryFixture();
  for (const entries of Object.values(mappingRegistry)) {
    for (const entry of entries) entry.status = "candidate";
  }

  const inventories = candidate.provenance.inventories.map((inventory) => {
    if (
      inventory.surface === "species" ||
      inventory.surface === "moves" ||
      inventory.surface === "types" ||
      inventory.surface === "abilities" ||
      inventory.surface === "items"
    ) {
      const acceptedMappingKeys = [...inventory.acceptedMappingKeys];
      return {
        ...inventory,
        discoveredSourceKeys:
          inventory.surface === "species"
            ? [...inventory.discoveredSourceKeys, "mega-alpha"]
            : inventory.discoveredSourceKeys,
        acceptedMappingKeys: [],
        candidateSourceKeys: acceptedMappingKeys,
        excludedOrDeferred:
          inventory.surface === "species"
            ? [
                ...inventory.excludedOrDeferred,
                {
                  sourceKey: "mega-alpha",
                  disposition: "deferred" as const,
                  reason: exclusionReason,
                },
              ]
            : inventory.excludedOrDeferred,
      };
    }
    return inventory;
  });
  candidate.provenance = finalizeProvenance({
    sourceRecords: candidate.provenance.sourceRecords,
    moveFactSources: candidate.provenance.moveFactSources,
    inventories,
  });

  const findings = validatePublicationReadiness(candidate, mappingRegistry);
  const validationReport: CandidateValidationReport = {
    candidateValid: true,
    publicationReady: findings.length === 0,
    findings,
  };
  return {
    rawExtracted: rawFixture(),
    candidate,
    mappingRegistry,
    validationReport,
    excludedSpeciesEvidence: [
      { sourceKey: "mega-alpha", sourceRecordIds: [SOURCE_RECORD_ID] },
    ],
  };
}

function historicalReviewFixture() {
  const input = reviewFixture();
  const bdspSourceRecordId = "source:bulbapedia:alpha-bdsp-learnset";
  input.candidate.provenance.sourceRecords.push({
    id: bdspSourceRecordId,
    provider: "bulbapedia",
    canonicalUrl:
      "https://bulbapedia.bulbagarden.net/wiki/Alpha_(Pok%C3%A9mon)/Generation_VIII_learnset",
    fetchedAt: "2026-09-18T00:00:00.000Z",
    parserVersion: "bulbapedia-gen8-learnset-v6",
    sourceContentHash:
      "sha256:1212121212121212121212121212121212121212121212121212121212121212",
    fetchStatus: "fetched",
  });
  input.candidate.catalogs.moves[0].sourceRecordIds.push(bdspSourceRecordId);
  input.candidate.provenance.moveFactSources[0].mainline = {
    selectedGame: "brilliant-diamond-shining-pearl",
    sourceRecordId: bdspSourceRecordId,
  };
  input.candidate.provenance = finalizeProvenance({
    sourceRecords: input.candidate.provenance.sourceRecords,
    moveFactSources: input.candidate.provenance.moveFactSources,
    inventories: input.candidate.provenance.inventories,
  });
  input.rawExtracted.moves = [
    {
      sourceKey: "tackle",
      sourceName: "Tackle",
      sourceSlug: "tackle",
      introducedGeneration: 1,
      typeSourceKey: "normal",
      category: "physical",
      power: 40,
      accuracy: 100,
      basePp: 35,
      makesContact: true,
      sourceTarget: "any-adjacent",
      zaBaseCooldownMs: null,
      zaBaseCooldownSourceRecordId: ZA_MOVE_SOURCE_RECORD_ID,
      mainlineSourceRecordIds: [GEN9_MOVE_SOURCE_RECORD_ID, bdspSourceRecordId],
      mainlineSelectedSourceRecordId: bdspSourceRecordId,
      mainlineSelectedGame: "brilliant-diamond-shining-pearl",
      sourceRecordId: "source:move:tackle",
    },
  ];
  input.rawExtracted.historicalScalarProofs = [
    {
      sourceName: "Tackle",
      sourceKey: "tackle",
      selectedGame: "brilliant-diamond-shining-pearl",
      typeSourceKey: "normal",
      category: "physical",
      basePp: 35,
      power: 40,
      accuracy: 100,
      sourceRecordId: bdspSourceRecordId,
    },
  ];
  const findings = validatePublicationReadiness(input.candidate, input.mappingRegistry);
  input.validationReport = {
    candidateValid: true,
    publicationReady: findings.length === 0,
    findings,
  };
  return input;
}

describe("pre-Human review stage", () => {
  it("seals the exact non-canonical candidate and produces the required review sample deterministically", () => {
    const input = reviewFixture();
    const first = buildReviewStage(input);
    const second = buildReviewStage(input);

    expect(second).toEqual(first);
    expect(first.manifest).toMatchObject({
      reviewStageVersion: "task-087-review-stage-v3",
      reviewScope: {
        kind: "core-kanto-johto",
        nationalDexMin: 1,
        nationalDexMax: 251,
        baseSpeciesCount: 251,
      },
      schemaVersion: "3",
      normalizerVersion: "pokenexus-static-normalizer-v5",
      provenanceHash: input.candidate.provenance.provenanceHash,
      sourceInventoryHash: input.candidate.provenance.sourceInventoryHash,
    });
    expect(first.manifest).not.toHaveProperty("gameDataVersion");
    expect(first.manifest.files.map((file) => file.path)).toEqual([
      "raw-extracted.json",
      "mapping-proposals.json",
      "normalized-candidate.json",
      "provenance-manifest.json",
      "validation-report.json",
      "excluded-species-evidence.json",
      "human-review-sample.json",
    ]);
    expect(first.excludedSpeciesEvidence).toEqual([
      { sourceKey: "mega-alpha", sourceRecordIds: [SOURCE_RECORD_ID] },
    ]);
    expect(first.humanReviewSample.ordinarySpecies.mapping.status).toBe("candidate");
    expect(first.humanReviewSample.alternateSpecies).toBeNull();
    expect(first.humanReviewSample.sourceUnavailableSpeciesFact).toMatchObject({
      speciesId: "species-alpha",
      field: "baseExperience",
      fact: { status: "source-unavailable" },
    });
    expect(first.humanReviewSample.excludedOrDeferredSpecies).toMatchObject({
      sourceKey: "mega-alpha",
      disposition: "deferred",
      reason: "battle-only-transformation",
    });
    expect(first.humanReviewSample.move.factSources.moveId).toBe("tackle");
    expect(first.humanReviewSample.type.record.id).toBe("normal");
    expect(first.humanReviewSample.ability.record.id).toBe("overgrow");
    expect(first.humanReviewSample.item.record.id).toBe("potion");
    expect(first.humanReviewSample.learnset.record.moveId).toBe("tackle");
  });

  it("changes the review seal when any sealed input changes", () => {
    const input = reviewFixture();
    const first = buildReviewStage(input);
    const changed = reviewFixture();
    changed.rawExtracted.parserVersion = "review-test-raw-v2";
    const second = buildReviewStage(changed);
    expect(second.manifest.reviewHash).not.toBe(first.manifest.reviewHash);
  });

  it("requires exclusion evidence to exactly cover the sealed Species inventory", () => {
    const missing = reviewFixture();
    missing.excludedSpeciesEvidence = [];
    expect(() => buildReviewStage(missing)).toThrow(/must exactly cover Species inventory exclusions/i);

    const extra = reviewFixture();
    extra.excludedSpeciesEvidence.push({
      sourceKey: "unrelated-exclusion",
      sourceRecordIds: [SOURCE_RECORD_ID],
    });
    expect(() => buildReviewStage(extra)).toThrow(/must exactly cover Species inventory exclusions/i);
  });

  it("rejects validation findings beyond the expected pre-Human candidate-mapping blockers", () => {
    const input = reviewFixture();
    input.validationReport.findings.push({
      code: "missing-source-inventory",
      path: "provenance.inventories.species",
      message: "test defect",
    });
    expect(() => buildReviewStage(input)).toThrow(/does not match recomputed publication readiness/i);
  });

  it("does not use a non-battle-only Species exclusion to satisfy the mandatory Human sample", () => {
    const input = reviewFixture("persistent-form-not-adopted");
    expect(() => buildReviewStage(input)).toThrow(/requires battle-only-transformation Species evidence/i);
  });

  it("does not weaken canonical publication staging for candidate mappings", async () => {
    const input = reviewFixture();
    const root = await mkdtemp(join(tmpdir(), "pokenexus-review-stage-"));
    tempDirectories.push(root);
    await expect(
      stageCandidate(join(root, "stage"), input.candidate, input.mappingRegistry),
    ).rejects.toThrow(/candidate mapping remains non-canonical/i);
  });

  it("binds a historical normalized Move back to the sealed raw selected-game source and scalar tuple", () => {
    const input = historicalReviewFixture();
    expect(() => buildReviewStage(input)).not.toThrow();

    const wrongSourceRecordId = "source:bulbapedia:beta-bdsp-learnset";
    input.candidate.provenance.sourceRecords.push({
      id: wrongSourceRecordId,
      provider: "bulbapedia",
      canonicalUrl:
        "https://bulbapedia.bulbagarden.net/wiki/Beta_(Pok%C3%A9mon)/Generation_VIII_learnset",
      fetchedAt: "2026-09-18T00:00:00.000Z",
      parserVersion: "bulbapedia-gen8-learnset-v6",
      sourceContentHash:
        "sha256:3434343434343434343434343434343434343434343434343434343434343434",
      fetchStatus: "fetched",
    });
    input.candidate.catalogs.moves[0].sourceRecordIds.push(wrongSourceRecordId);
    input.candidate.provenance.moveFactSources[0].mainline.sourceRecordId = wrongSourceRecordId;
    input.candidate.provenance = finalizeProvenance({
      sourceRecords: input.candidate.provenance.sourceRecords,
      moveFactSources: input.candidate.provenance.moveFactSources,
      inventories: input.candidate.provenance.inventories,
    });
    const findings = validatePublicationReadiness(input.candidate, input.mappingRegistry);
    input.validationReport = {
      candidateValid: true,
      publicationReady: findings.length === 0,
      findings,
    };

    expect(() => buildReviewStage(input)).toThrow(
      /selected-game\/source does not match raw extracted evidence/i,
    );
  });
});
