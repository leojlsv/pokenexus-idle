import { describe, expect, it } from "vitest";
import {
  GAME_DATA_SCHEMA_V5,
  buildPokeApiParityReport,
  loadPublishedBundle,
  loadPokeApiLowAmbiguityFacts,
  publishApprovedPromotionV5Candidate,
  parseProvenanceManifestV5,
  stageCandidate,
  validateCandidatePublicationSanity,
  validatePublicationReadiness,
  verifyLocalSourceSnapshot,
} from "./node";

describe("game-data Node entrypoint", () => {
  it("exposes filesystem-backed publication helpers only from the Node surface", () => {
    expect(validatePublicationReadiness).toBeTypeOf("function");
    expect(validateCandidatePublicationSanity).toBeTypeOf("function");
    expect(stageCandidate).toBeTypeOf("function");
    expect(loadPublishedBundle).toBeTypeOf("function");
    expect(GAME_DATA_SCHEMA_V5).toBe("5");
    expect(parseProvenanceManifestV5).toBeTypeOf("function");
    expect(verifyLocalSourceSnapshot).toBeTypeOf("function");
    expect(loadPokeApiLowAmbiguityFacts).toBeTypeOf("function");
    expect(buildPokeApiParityReport).toBeTypeOf("function");
    expect(publishApprovedPromotionV5Candidate).toBeTypeOf("function");
  });
});
