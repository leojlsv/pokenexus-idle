import { describe, expect, it } from "vitest";
import { LOCAL_MAPPING_ROSTER, MAPPING_ROSTER_VERSION } from "./mapping-roster.js";
import { validateMappingRegistry } from "./reconciliation.js";

describe("LOCAL_MAPPING_ROSTER", () => {
  it("contains only accepted canonical mappings for the published Core roster", () => {
    expect(LOCAL_MAPPING_ROSTER.version).toBe(MAPPING_ROSTER_VERSION);
    expect(LOCAL_MAPPING_ROSTER.mappings.species).toHaveLength(293);
    expect(LOCAL_MAPPING_ROSTER.mappings.moves).toHaveLength(477);
    expect(LOCAL_MAPPING_ROSTER.mappings.types).toHaveLength(18);
    expect(LOCAL_MAPPING_ROSTER.mappings.abilities).toHaveLength(147);
    expect(LOCAL_MAPPING_ROSTER.mappings.items).toHaveLength(30);

    const allMappings = [
      ...LOCAL_MAPPING_ROSTER.mappings.species,
      ...LOCAL_MAPPING_ROSTER.mappings.moves,
      ...LOCAL_MAPPING_ROSTER.mappings.types,
      ...LOCAL_MAPPING_ROSTER.mappings.abilities,
      ...LOCAL_MAPPING_ROSTER.mappings.items,
    ];
    expect(allMappings.every((entry) => entry.status === "accepted")).toBe(true);
    expect(validateMappingRegistry(LOCAL_MAPPING_ROSTER.mappings)).toEqual([]);
  });

  it("retains the reviewed Species exclusion/defer roster", () => {
    expect(LOCAL_MAPPING_ROSTER.excludedOrDeferred.species).toHaveLength(35);
    expect(LOCAL_MAPPING_ROSTER.excludedOrDeferred.species).toContainEqual({
      sourceKey: "pokedex:aerodactyl:11010",
      disposition: "deferred",
      reason: "battle-only-transformation",
    });
    expect(LOCAL_MAPPING_ROSTER.excludedOrDeferred.species).toContainEqual({
      sourceKey: "pokedex:pikachu:11051",
      disposition: "excluded",
      reason: "human-owner-permanent-exclusion",
    });
  });
});
