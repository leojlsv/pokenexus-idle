import {
  canonicalizeCandidateArtifacts,
  canonicalizeProvenanceManifest,
  canonicalJson,
  provenanceHash,
  sha256,
  sourceInventoryHash,
  type ArtifactDescriptor,
} from "./canonical.js";
import {
  NORMALIZER_VERSION,
  assertRawHistoricalScalarProofBinding,
  type RawExtractedSnapshot,
} from "./normalization.js";
import {
  REVIEW_SCOPE,
  REVIEW_STAGE_VERSION,
  type ReviewApproval,
  type ReviewStageManifest,
} from "./review-commitment.js";
import {
  SCHEMA_VERSION,
  parseGameDataCandidate,
  type GameDataCandidate,
  type MappingRegistry,
  type ProvenanceManifest,
} from "./schema.js";

const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const REVIEW_MAPPING_SURFACES = ["species", "moves", "types", "abilities", "items"] as const;

function contentHash(value: unknown): string {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

function sortedDescriptors(descriptors: ArtifactDescriptor[]): ArtifactDescriptor[] {
  return [...descriptors].sort((a, b) => a.logicalName.localeCompare(b.logicalName));
}

function equalStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function canonicalAcceptedMappingRegistry(registry: MappingRegistry): MappingRegistry {
  return {
    species: registry.species.map((entry) => ({ ...entry, status: "accepted" })),
    moves: registry.moves.map((entry) => ({ ...entry, status: "accepted" })),
    types: registry.types.map((entry) => ({ ...entry, status: "accepted" })),
    abilities: registry.abilities.map((entry) => ({ ...entry, status: "accepted" })),
    items: registry.items.map((entry) => ({ ...entry, status: "accepted" })),
  };
}

function sortedSourceKeys(values: string[]): string[] {
  return [...values].sort((left, right) =>
    left.localeCompare(right, "en", { sensitivity: "variant" }),
  );
}

function acceptedCandidateFromReview(
  reviewedCandidateInput: GameDataCandidate,
  reviewedMappings: MappingRegistry,
): GameDataCandidate {
  const reviewedCandidate = parseGameDataCandidate(reviewedCandidateInput);
  const inventories = reviewedCandidate.provenance.inventories.map((inventory) => {
    if (!REVIEW_MAPPING_SURFACES.includes(inventory.surface as typeof REVIEW_MAPPING_SURFACES[number])) {
      return inventory;
    }
    const surface = inventory.surface as typeof REVIEW_MAPPING_SURFACES[number];
    const reviewedEntries = reviewedMappings[surface];
    const currentSourceKeys = new Set(
      [...inventory.acceptedMappingKeys, ...inventory.candidateSourceKeys].map((key) =>
        key.normalize("NFC"),
      ),
    );
    const currentReviewedEntries = reviewedEntries.filter((entry) =>
      currentSourceKeys.has(entry.sourceKey.normalize("NFC")),
    );
    const expectedReviewedAccepted = sortedSourceKeys(
      currentReviewedEntries
        .filter((entry) => entry.status === "accepted")
        .map((entry) => entry.sourceKey),
    );
    const expectedReviewedCandidates = sortedSourceKeys(
      currentReviewedEntries
        .filter((entry) => entry.status === "candidate")
        .map((entry) => entry.sourceKey),
    );
    if (
      !equalStrings(inventory.acceptedMappingKeys, expectedReviewedAccepted) ||
      !equalStrings(inventory.candidateSourceKeys, expectedReviewedCandidates)
    ) {
      throw new Error(
        `reviewed candidate ${surface} inventory does not match the Human-reviewed mapping proposal statuses`,
      );
    }
    return {
      ...inventory,
      acceptedMappingKeys: sortedSourceKeys(
        currentReviewedEntries.map((entry) => entry.sourceKey),
      ),
      candidateSourceKeys: [],
    };
  });
  const acceptedSourceInventoryHash = sourceInventoryHash(inventories);
  const { provenanceHash: _reviewedProvenanceHash, ...reviewedProvenanceWithoutHash } =
    reviewedCandidate.provenance;
  const acceptedProvenanceWithoutHash: ProvenanceManifest = {
    ...reviewedProvenanceWithoutHash,
    inventories,
    sourceInventoryHash: acceptedSourceInventoryHash,
  };
  const acceptedProvenance: ProvenanceManifest = {
    ...acceptedProvenanceWithoutHash,
    provenanceHash: provenanceHash(acceptedProvenanceWithoutHash),
  };
  return {
    ...reviewedCandidate,
    provenance: acceptedProvenance,
  };
}

function candidateSemanticCommitment(candidate: GameDataCandidate): string {
  const artifacts = sortedDescriptors(
    Object.values(canonicalizeCandidateArtifacts(candidate)).map((artifact) => artifact.descriptor),
  );
  return contentHash({
    schemaVersion: candidate.schemaVersion,
    normalizerVersion: candidate.normalizerVersion,
    artifacts,
    provenance: canonicalizeProvenanceManifest(candidate.provenance),
  });
}

function reviewFile(
  manifest: ReviewStageManifest,
  logicalName: ReviewStageManifest["files"][number]["logicalName"],
  expectedPath: string,
): ReviewStageManifest["files"][number] {
  const matches = manifest.files.filter((file) => file.logicalName === logicalName);
  if (
    matches.length !== 1 ||
    matches[0].path !== expectedPath ||
    !HASH_RE.test(matches[0].contentHash)
  ) {
    throw new Error(`approved review manifest has invalid ${logicalName} file descriptor`);
  }
  return matches[0];
}

function assertReviewedHistoricalMoveBindings(
  rawExtracted: RawExtractedSnapshot,
  reviewedCandidate: GameDataCandidate,
  reviewedMappings: MappingRegistry,
): void {
  const moveMappingById = new Map(
    reviewedMappings.moves.map((entry) => [entry.canonicalId, entry] as const),
  );
  const typeMappingById = new Map(
    reviewedMappings.types.map((entry) => [entry.canonicalId, entry] as const),
  );
  const candidateMoveById = new Map(
    reviewedCandidate.catalogs.moves.map((entry) => [entry.id, entry] as const),
  );
  for (const relation of reviewedCandidate.provenance.moveFactSources) {
    if (relation.mainline.selectedGame === "scarlet-violet") continue;
    const moveMapping = moveMappingById.get(relation.moveId);
    if (!moveMapping) {
      throw new Error(`reviewed historical Move ${relation.moveId} has no reviewed source mapping`);
    }
    const rawMatches = rawExtracted.moves.filter(
      (move) => move.sourceKey.normalize("NFC") === moveMapping.sourceKey.normalize("NFC"),
    );
    if (rawMatches.length !== 1) {
      throw new Error(
        `reviewed historical Move ${moveMapping.sourceKey} requires exactly one raw Move record; found ${rawMatches.length}`,
      );
    }
    const rawMove = rawMatches[0];
    if (
      rawMove.mainlineSelectedGame !== relation.mainline.selectedGame ||
      rawMove.mainlineSelectedSourceRecordId !== relation.mainline.sourceRecordId ||
      !rawMove.mainlineSourceRecordIds?.includes(relation.mainline.sourceRecordId)
    ) {
      throw new Error(
        `reviewed historical Move ${moveMapping.sourceKey} selected-game/source does not match raw evidence`,
      );
    }
    assertRawHistoricalScalarProofBinding(rawExtracted, rawMove);
    const candidateMove = candidateMoveById.get(relation.moveId);
    if (!candidateMove) {
      throw new Error(`reviewed historical Move ${moveMapping.sourceKey} candidate record is missing`);
    }
    const typeMapping = typeMappingById.get(candidateMove.typeId);
    if (!typeMapping) {
      throw new Error(`reviewed historical Move ${moveMapping.sourceKey} Type mapping is missing`);
    }
    if (
      rawMove.typeSourceKey.normalize("NFC") !== typeMapping.sourceKey.normalize("NFC") ||
      rawMove.category !== candidateMove.category ||
      rawMove.basePp !== candidateMove.basePp ||
      rawMove.power !== candidateMove.power ||
      rawMove.accuracy !== candidateMove.accuracy
    ) {
      throw new Error(
        `reviewed historical Move ${moveMapping.sourceKey} scalar tuple does not match reviewed candidate`,
      );
    }
  }
}

export function verifyReviewApproval(
  candidate: GameDataCandidate,
  mappingRegistry: MappingRegistry,
  approval: ReviewApproval,
): string {
  if (!HASH_RE.test(approval.approvedReviewHash)) {
    throw new Error("approved reviewHash must be an exact sha256 commitment");
  }
  const manifest = approval.manifest;
  if (
    manifest.reviewStageVersion !== REVIEW_STAGE_VERSION ||
    canonicalJson(manifest.reviewScope) !== canonicalJson(REVIEW_SCOPE) ||
    manifest.schemaVersion !== SCHEMA_VERSION ||
    manifest.normalizerVersion !== NORMALIZER_VERSION
  ) {
    throw new Error("approved review manifest does not match the supported review contract");
  }
  if (manifest.reviewHash !== approval.approvedReviewHash) {
    throw new Error("approved reviewHash does not match the supplied review manifest");
  }
  const { reviewHash, ...manifestWithoutHash } = manifest;
  if (contentHash(manifestWithoutHash) !== reviewHash) {
    throw new Error("approved review manifest reviewHash is invalid");
  }
  const expectedReviewFiles = [
    "raw-extracted",
    "mapping-proposals",
    "normalized-candidate",
    "provenance",
    "validation-report",
    "excluded-species-evidence",
    "human-review-sample",
  ].sort();
  const actualReviewFiles = manifest.files.map((file) => file.logicalName).sort();
  if (
    actualReviewFiles.length !== expectedReviewFiles.length ||
    actualReviewFiles.some((logicalName, index) => logicalName !== expectedReviewFiles[index])
  ) {
    throw new Error("approved review manifest must contain exactly the seven review files");
  }

  const reviewedCandidate = parseGameDataCandidate(approval.reviewedCandidate);
  const reviewedRawExtractedHash = contentHash(approval.reviewedRawExtracted);
  const reviewedCandidateContentHash = contentHash(approval.reviewedCandidate);
  const reviewedMappingHash = contentHash(approval.reviewedMappingRegistry);
  if (manifest.candidateContentHash !== reviewedCandidateContentHash) {
    throw new Error("reviewed candidate does not match the Human-approved review commitment");
  }
  if (manifest.mappingProposalsContentHash !== reviewedMappingHash) {
    throw new Error("reviewed mapping registry does not match the Human-approved review commitment");
  }
  if (
    manifest.provenanceHash !== reviewedCandidate.provenance.provenanceHash ||
    manifest.sourceInventoryHash !== reviewedCandidate.provenance.sourceInventoryHash
  ) {
    throw new Error("reviewed candidate provenance does not match the Human-approved review commitment");
  }

  const normalizedCandidateFile = reviewFile(
    manifest,
    "normalized-candidate",
    "normalized-candidate.json",
  );
  const rawExtractedFile = reviewFile(manifest, "raw-extracted", "raw-extracted.json");
  const mappingFile = reviewFile(manifest, "mapping-proposals", "mapping-proposals.json");
  const provenanceFile = reviewFile(manifest, "provenance", "provenance-manifest.json");
  if (
    rawExtractedFile.contentHash !== reviewedRawExtractedHash ||
    normalizedCandidateFile.contentHash !== reviewedCandidateContentHash ||
    mappingFile.contentHash !== reviewedMappingHash ||
    provenanceFile.contentHash !== contentHash(reviewedCandidate.provenance)
  ) {
    throw new Error("approved review file descriptors do not authenticate candidate/mapping provenance");
  }
  assertReviewedHistoricalMoveBindings(
    approval.reviewedRawExtracted,
    reviewedCandidate,
    approval.reviewedMappingRegistry,
  );

  const expectedAcceptedMappings = canonicalAcceptedMappingRegistry(approval.reviewedMappingRegistry);
  if (canonicalJson(mappingRegistry) !== canonicalJson(expectedAcceptedMappings)) {
    throw new Error(
      "canonical mapping registry is not the exact accepted form of the Human-reviewed mapping proposals",
    );
  }
  const expectedAcceptedCandidate = acceptedCandidateFromReview(
    reviewedCandidate,
    approval.reviewedMappingRegistry,
  );
  if (candidateSemanticCommitment(candidate) !== candidateSemanticCommitment(expectedAcceptedCandidate)) {
    throw new Error("candidate is not the exact accepted form of the Human-reviewed candidate");
  }
  return approval.approvedReviewHash;
}
