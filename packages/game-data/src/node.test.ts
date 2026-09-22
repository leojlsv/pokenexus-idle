import { describe, expect, it } from "vitest";
import {
  loadPublishedBundle,
  stageCandidate,
  validateCandidatePublicationSanity,
  validatePublicationReadiness,
} from "./node";

describe("game-data Node entrypoint", () => {
  it("exposes filesystem-backed publication helpers only from the Node surface", () => {
    expect(validatePublicationReadiness).toBeTypeOf("function");
    expect(validateCandidatePublicationSanity).toBeTypeOf("function");
    expect(stageCandidate).toBeTypeOf("function");
    expect(loadPublishedBundle).toBeTypeOf("function");
  });
});
