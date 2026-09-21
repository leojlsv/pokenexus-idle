import type { GameDataCandidate, MappingRegistry } from "./schema.js";
import type { RawExtractedSnapshot } from "./normalization.js";

export const REVIEW_STAGE_VERSION = "task-087-review-stage-v3" as const;
export const REVIEW_SCOPE = {
  kind: "core-kanto-johto",
  nationalDexMin: 1,
  nationalDexMax: 251,
  baseSpeciesCount: 251,
} as const;

export interface ReviewStageFileDescriptor {
  logicalName:
    | "raw-extracted"
    | "mapping-proposals"
    | "normalized-candidate"
    | "provenance"
    | "validation-report"
    | "excluded-species-evidence"
    | "human-review-sample";
  path: string;
  contentHash: string;
}

export interface ReviewStageManifest {
  reviewStageVersion: typeof REVIEW_STAGE_VERSION;
  reviewScope: typeof REVIEW_SCOPE;
  schemaVersion: GameDataCandidate["schemaVersion"];
  normalizerVersion: string;
  candidateContentHash: string;
  mappingProposalsContentHash: string;
  provenanceHash: string;
  sourceInventoryHash: string;
  files: ReviewStageFileDescriptor[];
  reviewHash: string;
}

export interface ReviewApproval {
  manifest: ReviewStageManifest;
  reviewedRawExtracted: RawExtractedSnapshot;
  reviewedCandidate: GameDataCandidate;
  reviewedMappingRegistry: MappingRegistry;
  approvedReviewHash: string;
}
