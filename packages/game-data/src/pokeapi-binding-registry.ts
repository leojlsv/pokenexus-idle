import rawRegistry from "./pokeapi-binding-registry-v1.json" with { type: "json" };
import type { AbilityAssignment, GameDataCandidate, MappingRegistry } from "./schema.js";
import type { PokeApiLowAmbiguityFacts } from "./pokeapi-local-snapshot.js";

export const POKEAPI_BINDING_REGISTRY_VERSION = "pokeapi-binding-registry-v1" as const;

export interface PokeApiSpeciesBinding {
  sourceKey: string;
  pokemonId: number;
}

export interface PokeApiMoveBindingOverride {
  sourceKey: string;
  moveId: number;
}

export interface PokeApiBindingRegistryV1 {
  version: typeof POKEAPI_BINDING_REGISTRY_VERSION;
  snapshotId: string;
  species: PokeApiSpeciesBinding[];
  moveOverrides: PokeApiMoveBindingOverride[];
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path}: must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new TypeError(`${path}.${key}: is not accepted`);
  }
  for (const key of keys) {
    if (!(key in value)) throw new TypeError(`${path}.${key}: is required`);
  }
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${path}: must be a non-empty string`);
  }
  return value.normalize("NFC");
}

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${path}: must be a positive safe integer`);
  }
  return value;
}

export function parsePokeApiBindingRegistryV1(value: unknown): PokeApiBindingRegistryV1 {
  const input = record(value, "pokeApiBindingRegistry");
  exactKeys(input, ["version", "snapshotId", "species", "moveOverrides"], "pokeApiBindingRegistry");
  if (input.version !== POKEAPI_BINDING_REGISTRY_VERSION) {
    throw new TypeError(`pokeApiBindingRegistry.version: must be ${POKEAPI_BINDING_REGISTRY_VERSION}`);
  }
  if (!Array.isArray(input.species)) throw new TypeError("pokeApiBindingRegistry.species: must be an array");
  if (!Array.isArray(input.moveOverrides)) throw new TypeError("pokeApiBindingRegistry.moveOverrides: must be an array");

  const species = input.species.map((entry, index): PokeApiSpeciesBinding => {
    const item = record(entry, `pokeApiBindingRegistry.species[${index}]`);
    exactKeys(item, ["sourceKey", "pokemonId"], `pokeApiBindingRegistry.species[${index}]`);
    return {
      sourceKey: string(item.sourceKey, `pokeApiBindingRegistry.species[${index}].sourceKey`),
      pokemonId: positiveInteger(item.pokemonId, `pokeApiBindingRegistry.species[${index}].pokemonId`),
    };
  });
  const moveOverrides = input.moveOverrides.map((entry, index): PokeApiMoveBindingOverride => {
    const item = record(entry, `pokeApiBindingRegistry.moveOverrides[${index}]`);
    exactKeys(item, ["sourceKey", "moveId"], `pokeApiBindingRegistry.moveOverrides[${index}]`);
    return {
      sourceKey: string(item.sourceKey, `pokeApiBindingRegistry.moveOverrides[${index}].sourceKey`),
      moveId: positiveInteger(item.moveId, `pokeApiBindingRegistry.moveOverrides[${index}].moveId`),
    };
  });

  if (new Set(species.map((entry) => entry.sourceKey)).size !== species.length) {
    throw new TypeError("pokeApiBindingRegistry.species: duplicate sourceKey");
  }
  if (new Set(species.map((entry) => entry.pokemonId)).size !== species.length) {
    throw new TypeError("pokeApiBindingRegistry.species: duplicate pokemonId");
  }
  if (new Set(moveOverrides.map((entry) => entry.sourceKey)).size !== moveOverrides.length) {
    throw new TypeError("pokeApiBindingRegistry.moveOverrides: duplicate sourceKey");
  }
  if (new Set(moveOverrides.map((entry) => entry.moveId)).size !== moveOverrides.length) {
    throw new TypeError("pokeApiBindingRegistry.moveOverrides: duplicate moveId");
  }

  return {
    version: POKEAPI_BINDING_REGISTRY_VERSION,
    snapshotId: string(input.snapshotId, "pokeApiBindingRegistry.snapshotId"),
    species,
    moveOverrides,
  };
}

export const POKEAPI_BINDING_REGISTRY = parsePokeApiBindingRegistryV1(rawRegistry);

export function validatePokeApiBindingRegistryCoverage(
  bindingRegistry: PokeApiBindingRegistryV1,
  facts: PokeApiLowAmbiguityFacts,
  mappings: MappingRegistry,
  current: GameDataCandidate,
): void {
  if (bindingRegistry.snapshotId !== facts.snapshot.record.id) {
    throw new Error("PokéAPI binding registry snapshotId does not match verified local snapshot");
  }

  const acceptedSpecies = mappings.species.filter((entry) => entry.status === "accepted");
  if (bindingRegistry.species.length !== acceptedSpecies.length) {
    throw new Error(`PokéAPI binding registry must cover exactly ${acceptedSpecies.length} accepted Species mappings`);
  }
  const bindingKeys = new Set(bindingRegistry.species.map((entry) => entry.sourceKey));
  for (const mapping of acceptedSpecies) {
    if (!bindingKeys.has(mapping.sourceKey)) {
      throw new Error(`PokéAPI binding registry is missing accepted Species mapping ${mapping.sourceKey}`);
    }
  }

  const pokemonById = new Map(facts.pokemon.map((entry) => [entry.pokemonId, entry] as const));
  const speciesById = new Map(facts.species.map((entry) => [entry.speciesId, entry] as const));
  for (const binding of bindingRegistry.species) {
    if (!pokemonById.has(binding.pokemonId)) {
      throw new Error(`PokéAPI binding registry references unknown pokemonId ${binding.pokemonId}`);
    }
  }

  const typeCanonicalByPokeApiId = new Map<number, string>();
  const acceptedTypes = new Map(mappings.types.filter((entry) => entry.status === "accepted").map((entry) => [entry.sourceKey, entry.canonicalId] as const));
  for (const type of facts.types) {
    const canonicalId = acceptedTypes.get(type.sourceSlug);
    if (canonicalId) typeCanonicalByPokeApiId.set(type.typeId, canonicalId);
  }
  const abilityCanonicalByPokeApiId = new Map<number, string>();
  const acceptedAbilities = new Map(mappings.abilities.filter((entry) => entry.status === "accepted").map((entry) => [entry.sourceKey, entry.canonicalId] as const));
  for (const ability of facts.abilities) {
    const canonicalId = acceptedAbilities.get(ability.sourceSlug);
    if (canonicalId) abilityCanonicalByPokeApiId.set(ability.abilityId, canonicalId);
  }
  const currentById = new Map(current.catalogs.species.map((entry) => [entry.id, entry] as const));
  const speciesMappingByKey = new Map(acceptedSpecies.map((entry) => [entry.sourceKey, entry] as const));
  const sorted = (values: readonly string[]): string[] => [...values].sort((left, right) => left.localeCompare(right, "en", { sensitivity: "variant" }));
  const sourceVector = (pokemon: PokeApiLowAmbiguityFacts["pokemon"][number]) => {
    const typeIds = pokemon.typeIds.map((id) => typeCanonicalByPokeApiId.get(id));
    if (typeIds.some((id) => id === undefined)) return null;
    const abilities: AbilityAssignment[] = [];
    for (const assignment of pokemon.abilities) {
      const abilityId = abilityCanonicalByPokeApiId.get(assignment.abilityId);
      if (!abilityId) return null;
      const sourceAbilitySlot = assignment.isHidden
        ? "hidden"
        : assignment.slot === 1
          ? "normal-1"
          : assignment.slot === 2
            ? "normal-2"
            : null;
      if (sourceAbilitySlot === null) return null;
      abilities.push({ abilityId: abilityId as AbilityAssignment["abilityId"], sourceAbilitySlot });
    }
    abilities.sort((left, right) => left.sourceAbilitySlot.localeCompare(right.sourceAbilitySlot, "en"));
    return {
      typeIds: sorted(typeIds as string[]),
      baseStats: pokemon.baseStats,
      abilities,
      heightMillimeters: pokemon.heightMillimeters,
      weightGrams: pokemon.weightGrams,
      evYield: pokemon.evYield,
    };
  };
  const currentVector = (species: GameDataCandidate["catalogs"]["species"][number]) => ({
    typeIds: sorted(species.typeIds),
    baseStats: species.baseStats,
    abilities: [...species.abilities].sort((left, right) => left.sourceAbilitySlot.localeCompare(right.sourceAbilitySlot, "en")),
    heightMillimeters: species.heightMillimeters,
    weightGrams: species.weightGrams,
    evYield: species.evYield,
  });

  let defaultCount = 0;
  let persistentFormCount = 0;
  for (const binding of bindingRegistry.species) {
    const mapping = speciesMappingByKey.get(binding.sourceKey);
    const pokemon = pokemonById.get(binding.pokemonId);
    if (!mapping || !pokemon) throw new Error(`invalid Species binding ${binding.sourceKey}`);
    const sourceSpecies = speciesById.get(pokemon.speciesId);
    const currentSpecies = currentById.get(mapping.canonicalId);
    if (!sourceSpecies || !currentSpecies) throw new Error(`missing Species binding evidence ${binding.sourceKey}`);
    if (pokemon.isDefault) {
      defaultCount += 1;
      const expectedKey = `pokedex:${sourceSpecies.sourceSlug}:${sourceSpecies.nationalDexNumber}`;
      if (binding.sourceKey !== expectedKey) {
        throw new Error(`default Species binding must use exact PokéAPI species/National Dex key: ${binding.sourceKey}`);
      }
      continue;
    }
    persistentFormCount += 1;
    const candidates = facts.pokemon.filter((candidate) => {
      if (candidate.isDefault) return false;
      const candidateSpecies = speciesById.get(candidate.speciesId);
      if (!candidateSpecies || candidateSpecies.nationalDexNumber !== currentSpecies.nationalDexNumber) return false;
      const vector = sourceVector(candidate);
      return vector !== null && JSON.stringify(vector) === JSON.stringify(currentVector(currentSpecies));
    });
    if (candidates.length !== 1 || candidates[0].pokemonId !== binding.pokemonId) {
      throw new Error(`persistent-form binding is not the unique approved structured match: ${binding.sourceKey}`);
    }
  }
  if (defaultCount !== 251 || persistentFormCount !== 42) {
    throw new Error(`PokéAPI binding registry must contain 251 default + 42 persistent-form bindings; got ${defaultCount} + ${persistentFormCount}`);
  }

  const acceptedMoveKeys = new Set(
    mappings.moves.filter((entry) => entry.status === "accepted").map((entry) => entry.sourceKey),
  );
  const movesById = new Map(facts.moves.map((entry) => [entry.moveId, entry] as const));
  for (const override of bindingRegistry.moveOverrides) {
    if (!acceptedMoveKeys.has(override.sourceKey)) {
      throw new Error(`PokéAPI Move override is not an accepted mapping: ${override.sourceKey}`);
    }
    if (!movesById.has(override.moveId)) {
      throw new Error(`PokéAPI Move override references unknown moveId ${override.moveId}`);
    }
  }
  if (bindingRegistry.moveOverrides.length !== 1 || bindingRegistry.moveOverrides[0].sourceKey !== "vise-grip" || bindingRegistry.moveOverrides[0].moveId !== 11) {
    throw new Error("PokéAPI binding registry must contain only the approved vise-grip -> moveId 11 override");
  }
  if (movesById.get(11)?.sourceSlug !== "vice-grip") {
    throw new Error("PokéAPI moveId 11 must be the pinned vice-grip row");
  }
}

export function applyPokeApiMoveBindingOverrides(
  facts: PokeApiLowAmbiguityFacts,
  bindingRegistry: PokeApiBindingRegistryV1,
): PokeApiLowAmbiguityFacts {
  const overrideByMoveId = new Map(bindingRegistry.moveOverrides.map((entry) => [entry.moveId, entry.sourceKey] as const));
  return {
    ...facts,
    moves: facts.moves.map((move) => ({
      ...move,
      sourceSlug: overrideByMoveId.get(move.moveId) ?? move.sourceSlug,
    })),
  };
}
