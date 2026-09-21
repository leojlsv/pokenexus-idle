import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  bundleHash,
  canonicalJson,
  canonicalizeCandidateArtifacts,
  provenanceHash,
  sha256,
  sourceInventoryHash,
} from "./canonical";
import {
  loadPublishedBundle,
  publishStagedCandidate as publishStagedCandidateImpl,
  stageCandidate as stageCandidateImpl,
  validatePublicationReadiness,
  type PublishedBundleManifest,
  type StagedCandidate,
} from "./publication";
import {
  mappingRegistryFixture,
  publishableCandidateFixture,
  speciesFixture,
} from "./test-fixtures";
import {
  BULBAPEDIA_HISTORICAL_SCALAR_PROOF_PARSER_VERSION,
  buildBulbapediaHistoricalScalarProofUrl,
} from "./bulbapedia-historical-scalar-proof";
import {
  REVIEW_SCOPE,
  REVIEW_STAGE_VERSION,
  type ReviewApproval,
} from "./review-commitment";
import type { RawExtractedSnapshot } from "./normalization";
import { runtimeVersionDirectoryName } from "./runtime-delivery";

const tempDirectories: string[] = [];
const reviewApprovalsByStageDirectory = new Map<string, ReviewApproval>();
const IMMUTABLE_V1_VERSION = "game-data-core-kanto-johto-v1";
const IMMUTABLE_V1_BUNDLE_HASH =
  "sha256:bbe5114563abe85ac5b42d4f05a63c44af9fdad7abd66ebdafa504d584c02903";
const IMMUTABLE_V2_VERSION = "game-data-core-kanto-johto-v2";
const IMMUTABLE_V2_BUNDLE_HASH =
  "sha256:fc4ecaacb486b496ca2539666201cf73ace40b6ff352f210783a6fadedf052b4";

function fixtureContentHash(value: unknown): string {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

function reviewedCandidateForMappings(
  candidate: ReturnType<typeof publishableCandidateFixture>,
  mappingRegistry: ReturnType<typeof mappingRegistryFixture>,
) {
  const reviewed = JSON.parse(canonicalJson(candidate)) as ReturnType<typeof publishableCandidateFixture>;
  for (const inventory of reviewed.provenance.inventories) {
    if (
      inventory.surface !== "species" &&
      inventory.surface !== "moves" &&
      inventory.surface !== "types" &&
      inventory.surface !== "abilities" &&
      inventory.surface !== "items"
    ) {
      continue;
    }
    const entries = mappingRegistry[inventory.surface];
    const currentSourceKeys = new Set(
      [...inventory.acceptedMappingKeys, ...inventory.candidateSourceKeys].map((key) =>
        key.normalize("NFC"),
      ),
    );
    const currentEntries = entries.filter((entry) =>
      currentSourceKeys.has(entry.sourceKey.normalize("NFC")),
    );
    inventory.acceptedMappingKeys = currentEntries
      .filter((entry) => entry.status === "accepted")
      .map((entry) => entry.sourceKey)
      .sort();
    inventory.candidateSourceKeys = currentEntries
      .filter((entry) => entry.status === "candidate")
      .map((entry) => entry.sourceKey)
      .sort();
  }
  reviewed.provenance.sourceInventoryHash = sourceInventoryHash(reviewed.provenance.inventories);
  reviewed.provenance.provenanceHash = provenanceHash(reviewed.provenance);
  return reviewed;
}

function reviewedRawExtractedFixture(): RawExtractedSnapshot {
  return {
    parserVersion: "publication-review-raw-v1",
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

function reviewApprovalFixture(
  candidate: ReturnType<typeof publishableCandidateFixture>,
  mappingRegistry: ReturnType<typeof mappingRegistryFixture>,
): ReviewApproval {
  const reviewedCandidate = reviewedCandidateForMappings(candidate, mappingRegistry);
  const reviewedRawExtracted = reviewedRawExtractedFixture();
  const candidateContentHash = fixtureContentHash(reviewedCandidate);
  const mappingProposalsContentHash = fixtureContentHash(mappingRegistry);
  const placeholderHash = fixtureContentHash({ fixture: true });
  const rawExtractedContentHash = fixtureContentHash(reviewedRawExtracted);
  const manifestWithoutHash = {
    reviewStageVersion: REVIEW_STAGE_VERSION,
    reviewScope: REVIEW_SCOPE,
    schemaVersion: candidate.schemaVersion,
    normalizerVersion: candidate.normalizerVersion,
    candidateContentHash,
    mappingProposalsContentHash,
    provenanceHash: reviewedCandidate.provenance.provenanceHash!,
    sourceInventoryHash: reviewedCandidate.provenance.sourceInventoryHash,
    files: [
      { logicalName: "raw-extracted" as const, path: "raw-extracted.json", contentHash: rawExtractedContentHash },
      { logicalName: "mapping-proposals" as const, path: "mapping-proposals.json", contentHash: mappingProposalsContentHash },
      { logicalName: "normalized-candidate" as const, path: "normalized-candidate.json", contentHash: candidateContentHash },
      { logicalName: "provenance" as const, path: "provenance-manifest.json", contentHash: fixtureContentHash(reviewedCandidate.provenance) },
      { logicalName: "validation-report" as const, path: "validation-report.json", contentHash: placeholderHash },
      { logicalName: "excluded-species-evidence" as const, path: "excluded-species-evidence.json", contentHash: placeholderHash },
      { logicalName: "human-review-sample" as const, path: "human-review-sample.json", contentHash: placeholderHash },
    ],
  };
  const reviewHash = fixtureContentHash(manifestWithoutHash);
  return {
    manifest: { ...manifestWithoutHash, reviewHash },
    reviewedRawExtracted,
    reviewedCandidate,
    reviewedMappingRegistry: mappingRegistry,
    approvedReviewHash: reviewHash,
  };
}

async function stageApprovedCandidate(
  directory: string,
  candidate: ReturnType<typeof publishableCandidateFixture>,
  mappingRegistry: ReturnType<typeof mappingRegistryFixture>,
) {
  const approval = reviewApprovalFixture(candidate, mappingRegistry);
  const staged = await stageCandidateImpl(
    directory,
    candidate,
    mappingRegistry,
    approval,
  );
  reviewApprovalsByStageDirectory.set(staged.directory, approval);
  return staged;
}

async function publishApprovedStagedCandidate(
  stagedCandidate: StagedCandidate,
  publishedRoot: string,
  gameDataVersion: string,
  publishedAt: string,
  mappingRegistry: ReturnType<typeof mappingRegistryFixture>,
) {
  const approval = reviewApprovalsByStageDirectory.get(stagedCandidate.directory);
  if (!approval) throw new Error("test stage is missing ReviewApproval");
  return publishStagedCandidateImpl(
    stagedCandidate,
    publishedRoot,
    gameDataVersion,
    publishedAt,
    mappingRegistry,
    approval,
  );
}

async function tempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pokenexus-game-data-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  reviewApprovalsByStageDirectory.clear();
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("staging and immutable publication", () => {
  it("loads the immutable published v1 through the Node canonical loader", async () => {
    const publishedRoot = join(import.meta.dirname, "..", "published");
    const loaded = await loadPublishedBundle(publishedRoot, IMMUTABLE_V1_VERSION);
    expect(loaded.manifest.bundleHash).toBe(IMMUTABLE_V1_BUNDLE_HASH);
    expect(loaded.manifest.catalogCounts).toEqual({
      species: 293,
      moves: 477,
      types: 18,
      abilities: 147,
      items: 30,
      learnsets: 13_785,
      currentTypeEffectiveness: 324,
    });
  });

  it("loads the Human-approved corrected v2 through the Node canonical loader", async () => {
    const publishedRoot = join(import.meta.dirname, "..", "published");
    const loaded = await loadPublishedBundle(publishedRoot, IMMUTABLE_V2_VERSION);
    expect(loaded.manifest.bundleHash).toBe(IMMUTABLE_V2_BUNDLE_HASH);
    expect(loaded.manifest.catalogCounts).toEqual({
      species: 293,
      moves: 547,
      types: 18,
      abilities: 147,
      items: 30,
      learnsets: 19_035,
      currentTypeEffectiveness: 324,
    });
  });

  it("does not apply immutable-v1 provenance compatibility to another published version", async () => {
    const root = await tempDirectory();
    const canonicalPublishedRoot = join(import.meta.dirname, "..", "published");
    const sourceDirectory = join(
      canonicalPublishedRoot,
      await runtimeVersionDirectoryName(IMMUTABLE_V1_VERSION),
    );
    const otherVersion = "game-data-legacy-v5-unapproved";
    const destination = join(root, await runtimeVersionDirectoryName(otherVersion));
    await cp(sourceDirectory, destination, { recursive: true });

    const manifestPath = join(destination, "manifest.json");
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as PublishedBundleManifest;
    manifest.gameDataVersion = otherVersion;
    manifest.bundleHash = bundleHash(
      manifest.schemaVersion,
      manifest.gameDataVersion,
      manifest.artifacts,
      manifest.provenanceHash,
    );
    await writeFile(manifestPath, canonicalJson(manifest), "utf8");

    await expect(loadPublishedBundle(root, otherVersion)).rejects.toMatchObject({
      finding: { code: "invalid-move-mainline-source" },
    });
  });

  it("emits publication findings deterministically across canonical registry serialization", () => {
    const candidate = publishableCandidateFixture();
    const registry = mappingRegistryFixture();
    registry.species.push({
      ...registry.species[0],
      sourceKey: "candidate-alpha",
      status: "candidate",
    });
    registry.abilities.push({
      ...registry.abilities[0],
      sourceKey: "candidate-overgrow",
      status: "candidate",
    });
    const reparsed = JSON.parse(canonicalJson(registry)) as typeof registry;

    expect(canonicalJson(validatePublicationReadiness(candidate, registry))).toBe(
      canonicalJson(validatePublicationReadiness(candidate, reparsed)),
    );
  });

  it("retains accepted historical mappings outside the current inventory without forcing them into the catalog", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const registry = mappingRegistryFixture();
    registry.moves.push({
      sourceKey: "historical-out-of-scope-move",
      canonicalId: "historical-out-of-scope-move" as (typeof registry.moves)[number]["canonicalId"],
      status: "accepted",
    });

    expect(validatePublicationReadiness(candidate, registry)).toEqual([]);
    const staged = await stageApprovedCandidate(join(root, "stage"), candidate, registry);
    expect(staged.artifacts).toHaveLength(7);
    expect(candidate.catalogs.moves.some((move) => move.id === "historical-out-of-scope-move")).toBe(false);
  });

  it("stages only a fully validated candidate with reconciled mapping evidence", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const staged = await stageApprovedCandidate(join(root, "stage"), candidate, mappingRegistryFixture());
    expect(staged.schemaVersion).toBe("3");
    expect(staged.gameDataVersion).toBeUndefined();
    expect(staged.reviewHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(staged.artifacts).toHaveLength(7);
  });

  it("refuses canonical publication from a stage that has no Human-approved review commitment", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const registry = mappingRegistryFixture();
    const staged = await stageCandidateImpl(join(root, "stage"), candidate, registry);
    const approval = reviewApprovalFixture(candidate, registry);

    expect(staged.reviewHash).toBeNull();
    await expect(
      publishStagedCandidateImpl(
        staged,
        join(root, "published"),
        "v1",
        "2026-09-18T12:00:00.000Z",
        registry,
        approval,
      ),
    ).rejects.toThrow(/Human-approved reviewHash commitment/i);
  });

  it("requires the explicit Human-approved reviewHash again at publication time", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const registry = mappingRegistryFixture();
    const staged = await stageApprovedCandidate(join(root, "stage"), candidate, registry);
    const approval = reviewApprovalsByStageDirectory.get(staged.directory);
    if (!approval) throw new Error("approved test stage is missing ReviewApproval");

    await expect(
      publishStagedCandidateImpl(
        staged,
        join(root, "published"),
        "v1",
        "2026-09-18T12:00:00.000Z",
        registry,
        {
          ...approval,
          approvedReviewHash:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ),
    ).rejects.toThrow(/staged reviewHash does not match the Human-approved reviewHash/i);
  });

  it("does not allow an approved reviewHash to be replayed onto a coherently rewritten unreviewed stage", async () => {
    const root = await tempDirectory();
    const registry = mappingRegistryFixture();
    const approvedCandidate = publishableCandidateFixture();
    const approval = reviewApprovalFixture(approvedCandidate, registry);

    const rewrittenCandidate = publishableCandidateFixture();
    rewrittenCandidate.catalogs.moves[0].power = 41;
    const staged = await stageCandidateImpl(
      join(root, "rewritten-stage"),
      rewrittenCandidate,
      registry,
    );
    const manifestPath = join(staged.directory, "staged-manifest.json");
    const stagedManifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    stagedManifest.reviewHash = approval.approvedReviewHash;
    const forgedManifestBytes = Buffer.from(canonicalJson(stagedManifest), "utf8");
    await writeFile(manifestPath, forgedManifestBytes);
    const forgedStage: StagedCandidate = {
      ...staged,
      reviewHash: approval.approvedReviewHash,
      stageManifestHash: sha256(forgedManifestBytes),
    };

    await expect(
      publishStagedCandidateImpl(
        forgedStage,
        join(root, "published"),
        "v1",
        "2026-09-18T12:00:00.000Z",
        registry,
        approval,
      ),
    ).rejects.toThrow(/candidate is not the exact accepted form of the Human-reviewed candidate/i);
  });

  it("stages only the exact accepted form of the Human-reviewed mapping proposals and candidate", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const reviewedMappings = mappingRegistryFixture();
    for (const entries of Object.values(reviewedMappings)) {
      for (const entry of entries) entry.status = "candidate";
    }
    const canonicalMappings = mappingRegistryFixture();
    const approval = reviewApprovalFixture(candidate, reviewedMappings);

    const staged = await stageCandidateImpl(
      join(root, "stage"),
      candidate,
      canonicalMappings,
      approval,
    );
    expect(staged.reviewHash).toBe(approval.approvedReviewHash);

    const changedCandidate = publishableCandidateFixture();
    changedCandidate.catalogs.moves[0].power = 41;
    await expect(
      stageCandidateImpl(
        join(root, "changed-stage"),
        changedCandidate,
        canonicalMappings,
        approval,
      ),
    ).rejects.toThrow(/candidate is not the exact accepted form of the Human-reviewed candidate/i);
  });

  it("rejects provenance/inventory hashes that do not authenticate the staged candidate", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    candidate.provenance.sourceInventoryHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    await expect(stageApprovedCandidate(join(root, "stage"), candidate, mappingRegistryFixture())).rejects.toThrow(/sourceInventoryHash/);
  });

  it("requires the exact schema-v3 normalizer identity at staging and load boundaries", async () => {
    const root = await tempDirectory();
    const wrong = publishableCandidateFixture();
    wrong.normalizerVersion = "other-normalizer-v99";
    await expect(
      stageApprovedCandidate(join(root, "wrong-stage"), wrong, mappingRegistryFixture()),
    ).rejects.toThrow(/requires normalizerVersion pokenexus-static-normalizer-v5/i);

    const candidate = publishableCandidateFixture();
    const staged = await stageApprovedCandidate(join(root, "stage"), candidate, mappingRegistryFixture());
    const published = await publishApprovedStagedCandidate(
      staged,
      join(root, "published"),
      "v1",
      "2026-09-18T12:00:00.000Z",
      mappingRegistryFixture(),
    );
    const manifestPath = join(published.directory, "manifest.json");
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as PublishedBundleManifest;
    manifest.normalizerVersion = "other-normalizer-v99";
    await writeFile(manifestPath, canonicalJson(manifest));
    await expect(loadPublishedBundle(join(root, "published"), "v1")).rejects.toThrow(
      /unsupported normalizerVersion/i,
    );
  });

  it("binds complementary PokémonDB Move roles to the accepted Move source mapping before staging", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const complementary = candidate.provenance.sourceRecords.find(
      (source) => source.id === "source:move:tackle",
    );
    if (!complementary) throw new Error("fixture complementary Move source missing");
    complementary.canonicalUrl = "https://pokemondb.net/move/growl";
    candidate.provenance.provenanceHash = provenanceHash(candidate.provenance);

    await expect(
      stageApprovedCandidate(join(root, "stage"), candidate, mappingRegistryFixture()),
    ).rejects.toThrow(/must match accepted Move source key tackle/i);
  });

  it("binds historical Bulbapedia revision proof to the accepted Move source mapping before staging", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const proofSourceRecordId = "source:bulbapedia:pound-historical-proof";
    candidate.provenance.sourceRecords.push({
      id: proofSourceRecordId,
      provider: "bulbapedia",
      canonicalUrl: buildBulbapediaHistoricalScalarProofUrl(
        "Pound",
        "sword-shield",
      ),
      fetchedAt: "2026-09-18T00:00:00.000Z",
      parserVersion: BULBAPEDIA_HISTORICAL_SCALAR_PROOF_PARSER_VERSION,
      sourceContentHash:
        "sha256:abababababababababababababababababababababababababababababababab",
      fetchStatus: "fetched",
    });
    candidate.catalogs.moves[0].sourceRecordIds.push(proofSourceRecordId);
    candidate.provenance.moveFactSources[0].mainline = {
      selectedGame: "sword-shield",
      sourceRecordId: proofSourceRecordId,
    };
    candidate.provenance.provenanceHash = provenanceHash(candidate.provenance);

    await expect(
      stageApprovedCandidate(join(root, "stage"), candidate, mappingRegistryFixture()),
    ).rejects.toThrow(/historical Bulbapedia Move proof must match accepted Move source key tackle/i);
  });

  it("publishes atomically by explicit opaque version and loads with full hash verification", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const staged = await stageApprovedCandidate(join(root, "stage"), candidate, mappingRegistryFixture());
    const published = await publishApprovedStagedCandidate(
      staged,
      join(root, "published"),
      "opaque/version:β",
      "2026-09-18T12:00:00.000Z",
      mappingRegistryFixture(),
    );

    const descriptors = Object.values(canonicalizeCandidateArtifacts(candidate)).map((artifact) => artifact.descriptor);
    expect(published.manifest.bundleHash).toBe(
      bundleHash("3", "opaque/version:β", descriptors, candidate.provenance.provenanceHash!),
    );
    const loaded = await loadPublishedBundle(join(root, "published"), "opaque/version:β");
    expect(loaded.manifest).toEqual(published.manifest);
    expect(loaded.candidate.catalogs.species).toEqual(candidate.catalogs.species);
  });

  it("treats same-version/same-content publication as immutable idempotent no-op", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const staged = await stageApprovedCandidate(join(root, "stage"), candidate, mappingRegistryFixture());
    const first = await publishApprovedStagedCandidate(
      staged,
      join(root, "published"),
      "v1",
      "2026-09-18T12:00:00.000Z",
      mappingRegistryFixture(),
    );
    const before = await readFile(join(first.directory, "manifest.json"));
    const second = await publishApprovedStagedCandidate(
      staged,
      join(root, "published"),
      "v1",
      "2027-01-01T00:00:00.000Z",
      mappingRegistryFixture(),
    );
    const after = await readFile(join(second.directory, "manifest.json"));
    expect(after).toEqual(before);
    expect(second.manifest.publishedAt).toBe("2026-09-18T12:00:00.000Z");
  });

  it("refuses a coherent post-validation rewrite of the sealed staged candidate", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const staged = await stageApprovedCandidate(join(root, "stage"), candidate, mappingRegistryFixture());
    const movesPath = join(staged.directory, "catalogs", "moves.json");
    const moves = JSON.parse(await readFile(movesPath, "utf8")) as Array<Record<string, unknown>>;
    moves[0].power = 41;
    const movesBytes = Buffer.from(canonicalJson(moves), "utf8");
    await writeFile(movesPath, movesBytes);

    const stagedManifestPath = join(staged.directory, "staged-manifest.json");
    const stagedManifest = JSON.parse(
      await readFile(stagedManifestPath, "utf8"),
    ) as {
      artifacts: Array<{ logicalName: string; contentHash: string }>;
    };
    const moveDescriptor = stagedManifest.artifacts.find(
      (entry) => entry.logicalName === "catalogs/moves",
    );
    if (!moveDescriptor) throw new Error("staged Move descriptor missing");
    moveDescriptor.contentHash = sha256(movesBytes);
    await writeFile(stagedManifestPath, canonicalJson(stagedManifest));

    await expect(
      publishApprovedStagedCandidate(
        staged,
        join(root, "published"),
        "v1",
        "2026-09-18T12:00:00.000Z",
        mappingRegistryFixture(),
      ),
    ).rejects.toThrow(/validated stage commitment/i);
  });

  it("verifies the copied temporary payload so a changed staged artifact cannot race into publication", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const staged = await stageApprovedCandidate(join(root, "stage"), candidate, mappingRegistryFixture());
    const movesPath = join(staged.directory, "catalogs", "moves.json");
    const moves = JSON.parse(await readFile(movesPath, "utf8")) as Array<Record<string, unknown>>;
    moves[0].power = 41;
    await writeFile(movesPath, canonicalJson(moves));

    await expect(
      publishApprovedStagedCandidate(
        staged,
        join(root, "published"),
        "v1",
        "2026-09-18T12:00:00.000Z",
        mappingRegistryFixture(),
      ),
    ).rejects.toThrow(/artifact hash mismatch for catalogs\/moves/i);
  });

  it("refuses same-version/different-content reuse", async () => {
    const root = await tempDirectory();
    const firstCandidate = publishableCandidateFixture();
    const firstStage = await stageApprovedCandidate(join(root, "stage-a"), firstCandidate, mappingRegistryFixture());
    await publishApprovedStagedCandidate(
      firstStage,
      join(root, "published"),
      "v1",
      "2026-09-18T12:00:00.000Z",
      mappingRegistryFixture(),
    );

    const secondCandidate = publishableCandidateFixture();
    secondCandidate.catalogs.species = [speciesFixture({ sourceName: "Changed" })];
    const secondStage = await stageApprovedCandidate(join(root, "stage-b"), secondCandidate, mappingRegistryFixture());
    await expect(
      publishApprovedStagedCandidate(
        secondStage,
        join(root, "published"),
        "v1",
        "2026-09-18T12:00:00.000Z",
        mappingRegistryFixture(),
      ),
    ).rejects.toThrow(/different content/);
  });

  it("fully verifies an existing same-version bundle before treating publication as idempotent", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const staged = await stageApprovedCandidate(join(root, "stage"), candidate, mappingRegistryFixture());
    const published = await publishApprovedStagedCandidate(
      staged,
      join(root, "published"),
      "v1",
      "2026-09-18T12:00:00.000Z",
      mappingRegistryFixture(),
    );
    const movesPath = join(published.directory, "catalogs", "moves.json");
    const original = await readFile(movesPath);
    await writeFile(movesPath, Buffer.concat([original, Buffer.from(" ", "utf8")]));

    await expect(
      publishApprovedStagedCandidate(
        staged,
        join(root, "published"),
        "v1",
        "2027-01-01T00:00:00.000Z",
        mappingRegistryFixture(),
      ),
    ).rejects.toThrow(/artifact hash mismatch for catalogs\/moves/i);
  });

  it("rejects published manifests with extra logical artifacts or inconsistent catalog counts", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const staged = await stageApprovedCandidate(join(root, "stage"), candidate, mappingRegistryFixture());
    const published = await publishApprovedStagedCandidate(
      staged,
      join(root, "published"),
      "v1",
      "2026-09-18T12:00:00.000Z",
      mappingRegistryFixture(),
    );
    const manifestPath = join(published.directory, "manifest.json");
    const originalManifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as PublishedBundleManifest;

    const extra = structuredClone(originalManifest);
    extra.artifacts.push({
      logicalName: "catalogs/extra",
      contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      recordCount: 0,
    });
    extra.bundleHash = bundleHash(
      extra.schemaVersion,
      extra.gameDataVersion,
      extra.artifacts,
      extra.provenanceHash,
    );
    await writeFile(manifestPath, canonicalJson(extra));
    await expect(loadPublishedBundle(join(root, "published"), "v1")).rejects.toThrow(
      /must contain exactly/i,
    );

    const wrongCounts = structuredClone(originalManifest);
    wrongCounts.catalogCounts.moves += 1;
    await writeFile(manifestPath, canonicalJson(wrongCounts));
    await expect(loadPublishedBundle(join(root, "published"), "v1")).rejects.toThrow(
      /catalogCounts\.moves/i,
    );
  });

  it("rejects non-canonical published artifact bytes even when descriptor and bundle hashes are recomputed", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const staged = await stageApprovedCandidate(join(root, "stage"), candidate, mappingRegistryFixture());
    const published = await publishApprovedStagedCandidate(
      staged,
      join(root, "published"),
      "v1",
      "2026-09-18T12:00:00.000Z",
      mappingRegistryFixture(),
    );
    const movesPath = join(published.directory, "catalogs", "moves.json");
    const parsedMoves = JSON.parse(await readFile(movesPath, "utf8"));
    const nonCanonicalBytes = Buffer.from(JSON.stringify(parsedMoves, null, 2), "utf8");
    await writeFile(movesPath, nonCanonicalBytes);

    const manifestPath = join(published.directory, "manifest.json");
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as PublishedBundleManifest;
    const descriptor = manifest.artifacts.find(
      (entry: { logicalName: string }) => entry.logicalName === "catalogs/moves",
    );
    if (!descriptor) throw new Error("published Move descriptor missing");
    descriptor.contentHash = sha256(nonCanonicalBytes);
    manifest.bundleHash = bundleHash(
      manifest.schemaVersion,
      manifest.gameDataVersion,
      manifest.artifacts,
      manifest.provenanceHash,
    );
    await writeFile(manifestPath, canonicalJson(manifest));

    await expect(loadPublishedBundle(join(root, "published"), "v1")).rejects.toThrow(
      /non-canonical artifact (?:descriptor|bytes)(?: for)? catalogs\/moves/i,
    );
  });

  it("writes one canonical provenance representation regardless of set-like input ordering", async () => {
    const root = await tempDirectory();
    const candidateA = publishableCandidateFixture();
    const candidateB = publishableCandidateFixture();
    candidateB.provenance.sourceRecords.reverse();
    candidateB.provenance.moveFactSources.reverse();
    candidateB.provenance.inventories.reverse();

    const stagedA = await stageApprovedCandidate(
      join(root, "stage-a"),
      candidateA,
      mappingRegistryFixture(),
    );
    const stagedB = await stageApprovedCandidate(
      join(root, "stage-b"),
      candidateB,
      mappingRegistryFixture(),
    );

    expect(await readFile(join(stagedB.directory, "provenance.json"))).toEqual(
      await readFile(join(stagedA.directory, "provenance.json")),
    );
  });

  it("rejects reordered published provenance even when its file hash is updated", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const staged = await stageApprovedCandidate(
      join(root, "stage"),
      candidate,
      mappingRegistryFixture(),
    );
    const published = await publishApprovedStagedCandidate(
      staged,
      join(root, "published"),
      "v1",
      "2026-09-18T12:00:00.000Z",
      mappingRegistryFixture(),
    );
    const provenancePath = join(published.directory, "provenance.json");
    const provenance = JSON.parse(
      await readFile(provenancePath, "utf8"),
    ) as typeof candidate.provenance;
    provenance.sourceRecords.reverse();
    const provenanceBytes = Buffer.from(canonicalJson(provenance), "utf8");
    await writeFile(provenancePath, provenanceBytes);

    const manifestPath = join(published.directory, "manifest.json");
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as PublishedBundleManifest;
    manifest.provenanceManifest.contentHash = sha256(provenanceBytes);
    await writeFile(manifestPath, canonicalJson(manifest));

    await expect(
      loadPublishedBundle(join(root, "published"), "v1"),
    ).rejects.toThrow(/provenance file is not canonical json/i);
  });

  it("rejects reordered published artifact descriptors even though bundleHash sorts them", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const staged = await stageApprovedCandidate(
      join(root, "stage"),
      candidate,
      mappingRegistryFixture(),
    );
    const published = await publishApprovedStagedCandidate(
      staged,
      join(root, "published"),
      "v1",
      "2026-09-18T12:00:00.000Z",
      mappingRegistryFixture(),
    );
    const manifestPath = join(published.directory, "manifest.json");
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as PublishedBundleManifest;
    manifest.artifacts.reverse();
    await writeFile(manifestPath, canonicalJson(manifest));

    await expect(
      loadPublishedBundle(join(root, "published"), "v1"),
    ).rejects.toThrow(/artifact descriptors are not in canonical order/i);
  });

  it("rejects an internally inconsistent provenance hash even when the provenance file hash is updated", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const staged = await stageApprovedCandidate(join(root, "stage"), candidate, mappingRegistryFixture());
    const published = await publishApprovedStagedCandidate(
      staged,
      join(root, "published"),
      "v1",
      "2026-09-18T12:00:00.000Z",
      mappingRegistryFixture(),
    );
    const provenancePath = join(published.directory, "provenance.json");
    const provenance = JSON.parse(
      await readFile(provenancePath, "utf8"),
    ) as typeof candidate.provenance;
    provenance.provenanceHash =
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const provenanceBytes = Buffer.from(canonicalJson(provenance), "utf8");
    await writeFile(provenancePath, provenanceBytes);

    const manifestPath = join(published.directory, "manifest.json");
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as PublishedBundleManifest;
    manifest.provenanceManifest.contentHash = sha256(provenanceBytes);
    await writeFile(manifestPath, canonicalJson(manifest));

    await expect(loadPublishedBundle(join(root, "published"), "v1")).rejects.toThrow(
      /internal provenanceHash mismatch/i,
    );
  });

  it("fails closed when a published manifest advertises an unsupported schema", async () => {
    const root = await tempDirectory();
    const candidate = publishableCandidateFixture();
    const staged = await stageApprovedCandidate(join(root, "stage"), candidate, mappingRegistryFixture());
    const published = await publishApprovedStagedCandidate(
      staged,
      join(root, "published"),
      "v1",
      "2026-09-18T12:00:00.000Z",
      mappingRegistryFixture(),
    );
    const manifestPath = join(published.directory, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.schemaVersion = "1";
    await writeFile(manifestPath, canonicalJson(manifest));
    await expect(loadPublishedBundle(join(root, "published"), "v1")).rejects.toThrow(/unsupported schemaVersion/);
  });
});
