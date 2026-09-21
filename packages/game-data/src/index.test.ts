import { describe, expect, it, vi } from "vitest";
import {
  PACKAGE_NAME,
  SCHEMA_VERSION,
  loadPublishedBundle,
  parseGameDataCandidate,
  parseGameDataManifest,
  parseMoveDefinitionV1,
  parseSpeciesDefinitionV2,
  stageCandidate,
  validateGameDataCandidate,
  validatePublicationReadiness,
} from "./index";

describe("game-data entrypoint", () => {
  it("exposes the package identity marker", () => {
    expect(PACKAGE_NAME).toBe("@pokenexus/game-data");
  });

  it("exposes the accepted schema, validator and publication/loading surface", () => {
    expect(SCHEMA_VERSION).toBe("3");
    expect(parseSpeciesDefinitionV2).toBeTypeOf("function");
    expect(parseMoveDefinitionV1).toBeTypeOf("function");
    expect(parseGameDataCandidate).toBeTypeOf("function");
    expect(validateGameDataCandidate).toBeTypeOf("function");
    expect(parseGameDataManifest).toBeTypeOf("function");
    expect(validatePublicationReadiness).toBeTypeOf("function");
    expect(stageCandidate).toBeTypeOf("function");
    expect(loadPublishedBundle).toBeTypeOf("function");
  });

  it("imports without performing network I/O", async () => {
    vi.resetModules();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await import("./index.js");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
