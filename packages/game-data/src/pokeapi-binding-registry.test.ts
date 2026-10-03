import { describe, expect, it } from "vitest";
import rawRegistry from "./pokeapi-binding-registry-v1.json" with { type: "json" };
import {
  POKEAPI_BINDING_REGISTRY,
  POKEAPI_BINDING_REGISTRY_VERSION,
  parsePokeApiBindingRegistryV1,
} from "./pokeapi-binding-registry.js";

const SNAPSHOT_ID =
  "source-snapshot:pokeapi:8ef26f3e68509ee3c101a7063c32c67283dc95c67aa5f23a6ff2a829bd2bf9b8";

describe("TASK-114 PokéAPI provider binding registry", () => {
  it("freezes the exact approved 293-Species coverage and vise/vice override", () => {
    expect(POKEAPI_BINDING_REGISTRY.version).toBe(POKEAPI_BINDING_REGISTRY_VERSION);
    expect(POKEAPI_BINDING_REGISTRY.snapshotId).toBe(SNAPSHOT_ID);
    expect(POKEAPI_BINDING_REGISTRY.species).toHaveLength(293);
    expect(new Set(POKEAPI_BINDING_REGISTRY.species.map((entry) => entry.sourceKey)).size).toBe(293);
    expect(new Set(POKEAPI_BINDING_REGISTRY.species.map((entry) => entry.pokemonId)).size).toBe(293);
    expect(POKEAPI_BINDING_REGISTRY.moveOverrides).toEqual([{ sourceKey: "vise-grip", moveId: 11 }]);
  });

  it("rejects duplicate provider bindings and extra structural keys", () => {
    const parsed = parsePokeApiBindingRegistryV1(rawRegistry);
    expect(() => parsePokeApiBindingRegistryV1({
      ...parsed,
      species: [...parsed.species, parsed.species[0]],
    })).toThrow(/duplicate sourceKey/);
    expect(() => parsePokeApiBindingRegistryV1({ ...parsed, extra: true })).toThrow(/is not accepted/);
  });
});
