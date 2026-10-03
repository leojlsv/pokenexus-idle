import { describe, expect, it, vi } from "vitest";
import {
  GAME_DATA_SCHEMA_V5,
  PACKAGE_NAME,
  SCHEMA_VERSION,
  parseGameDataManifestV5,
  parseGameDataCandidate,
  parseGameDataManifest,
  parseMoveDefinitionV1,
  parseSpeciesDefinitionV2,
  validateGameDataCandidate,
} from "./index";

describe("game-data entrypoint", () => {
  it("exposes the package identity marker", () => {
    expect(PACKAGE_NAME).toBe("@pokenexus/game-data");
  });

  it("exposes the accepted runtime schema and validators", () => {
    expect(SCHEMA_VERSION).toBe("3");
    expect(GAME_DATA_SCHEMA_V5).toBe("5");
    expect(parseSpeciesDefinitionV2).toBeTypeOf("function");
    expect(parseMoveDefinitionV1).toBeTypeOf("function");
    expect(parseGameDataCandidate).toBeTypeOf("function");
    expect(validateGameDataCandidate).toBeTypeOf("function");
    expect(parseGameDataManifest).toBeTypeOf("function");
    expect(parseGameDataManifestV5).toBeTypeOf("function");
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
