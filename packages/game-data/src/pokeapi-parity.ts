import type { AbilityId, ItemId, MoveId, SpeciesId, TypeId } from "@pokenexus/game-types";
import { canonicalJson } from "./canonical-json.js";
import {
  EGG_GROUP_KEYS,
  type EggGroupKey,
  type AbilityAssignment,
  type GameDataCandidate,
  type GenderRatio,
  type MappingRegistry,
  type MoveTargetClassification,
  type SourceFact,
} from "./schema.js";
import type {
  PokeApiAbilityFact,
  PokeApiLowAmbiguityFacts,
  PokeApiPokemonFact,
  PokeApiTypeFact,
} from "./pokeapi-local-snapshot.js";

export type PokeApiTargetMap = Readonly<Record<string, MoveTargetClassification>>;

export interface PokeApiSpeciesParityBinding {
  sourceKey: string;
  pokemonId: number;
}

export interface PokeApiParityBindings {
  /** Explicit Human/local mapping bridge. No Species/form binding is inferred from upstream names/IDs. */
  species: readonly PokeApiSpeciesParityBinding[];
}

export type PokeApiParityStatus =
  | "match"
  | "mismatch"
  | "missing-current"
  | "missing-source"
  | "unmapped";

export interface PokeApiParityEntry {
  surface: "species" | "moves" | "types" | "abilities" | "items" | "type-effectiveness";
  sourceKey: string;
  canonicalId: string | null;
  field: string;
  status: PokeApiParityStatus;
  currentValue: unknown;
  sourceValue: unknown;
}

export interface PokeApiParityReport {
  entries: PokeApiParityEntry[];
  counts: Record<PokeApiParityStatus, number>;
}

function acceptedMap<T extends string>(entries: Array<{ sourceKey: string; canonicalId: T; status: "accepted" | "candidate" }>): Map<string, T> {
  return new Map(
    entries
      .filter((entry) => entry.status === "accepted")
      .map((entry) => [entry.sourceKey.normalize("NFC"), entry.canonicalId] as const),
  );
}

function entry(
  surface: PokeApiParityEntry["surface"],
  sourceKey: string,
  canonicalId: string | null,
  field: string,
  currentValue: unknown,
  sourceValue: unknown,
  forcedStatus?: PokeApiParityStatus,
): PokeApiParityEntry {
  return {
    surface,
    sourceKey,
    canonicalId,
    field,
    status: forcedStatus ?? (canonicalJson(currentValue) === canonicalJson(sourceValue) ? "match" : "mismatch"),
    currentValue,
    sourceValue,
  };
}

function sourceFact(value: number | null): SourceFact<number> {
  return value === null ? { status: "source-unavailable" } : { status: "known", value };
}

function genderRatio(genderRate: number): GenderRatio {
  if (genderRate === -1) return { kind: "genderless" };
  if (!Number.isSafeInteger(genderRate) || genderRate < 0 || genderRate > 8) {
    throw new Error(`unsupported PokéAPI gender_rate ${genderRate}`);
  }
  const femaleBasisPoints = genderRate * 1250;
  return { kind: "ratio", maleBasisPoints: 10000 - femaleBasisPoints, femaleBasisPoints };
}

function growthRate(identifier: string): GameDataCandidate["catalogs"]["species"][number]["growthRate"] {
  if (identifier === "medium") return "medium-fast";
  if (identifier === "slow-then-very-fast") return "erratic";
  if (identifier === "fast-then-very-slow") return "fluctuating";
  if (
    identifier === "slow" ||
    identifier === "medium-slow" ||
    identifier === "medium-fast" ||
    identifier === "fast" ||
    identifier === "erratic" ||
    identifier === "fluctuating"
  ) {
    return identifier;
  }
  throw new Error(`unsupported PokéAPI growth-rate identifier ${identifier}`);
}

function orderedEggGroups(values: readonly string[]): GameDataCandidate["catalogs"]["species"][number]["eggGroups"] {
  const aliases: Readonly<Record<string, EggGroupKey>> = {
    monster: "monster",
    water1: "water-1",
    bug: "bug",
    flying: "flying",
    ground: "field",
    fairy: "fairy",
    plant: "grass",
    humanshape: "human-like",
    water3: "water-3",
    mineral: "mineral",
    indeterminate: "amorphous",
    water2: "water-2",
    ditto: "ditto",
    dragon: "dragon",
    "no-eggs": "undiscovered",
  };
  const unique = [...new Set(values)];
  const result = unique.map((value) => {
    const mapped = aliases[value];
    if (!mapped) {
      throw new Error(`unsupported PokéAPI Egg Group identifier ${value}`);
    }
    return mapped;
  });
  return result.sort((left, right) => EGG_GROUP_KEYS.indexOf(left) - EGG_GROUP_KEYS.indexOf(right));
}

function canonicalTypeByPokeApiId(
  types: readonly PokeApiTypeFact[],
  mappings: Map<string, TypeId>,
): Map<number, TypeId> {
  const result = new Map<number, TypeId>();
  for (const type of types) {
    const canonicalId = mappings.get(type.sourceSlug);
    if (canonicalId) result.set(type.typeId, canonicalId);
  }
  return result;
}

function canonicalAbilityByPokeApiId(
  abilities: readonly PokeApiAbilityFact[],
  mappings: Map<string, AbilityId>,
): Map<number, AbilityId> {
  const result = new Map<number, AbilityId>();
  for (const ability of abilities) {
    const canonicalId = mappings.get(ability.sourceSlug);
    if (canonicalId) result.set(ability.abilityId, canonicalId);
  }
  return result;
}

function abilityAssignments(
  pokemon: PokeApiPokemonFact,
  abilityById: Map<number, AbilityId>,
): AbilityAssignment[] | null {
  const result: AbilityAssignment[] = [];
  for (const assignment of pokemon.abilities) {
    const abilityId = abilityById.get(assignment.abilityId);
    if (!abilityId) return null;
    const sourceAbilitySlot = assignment.isHidden
      ? "hidden"
      : assignment.slot === 1
        ? "normal-1"
        : assignment.slot === 2
          ? "normal-2"
          : null;
    if (sourceAbilitySlot === null) return null;
    result.push({ abilityId, sourceAbilitySlot });
  }
  return result.sort((left, right) => left.sourceAbilitySlot.localeCompare(right.sourceAbilitySlot, "en"));
}

function compareFields(
  output: PokeApiParityEntry[],
  surface: PokeApiParityEntry["surface"],
  sourceKey: string,
  canonicalId: string,
  current: Record<string, unknown>,
  source: Record<string, unknown>,
  fields: readonly string[],
): void {
  for (const field of fields) {
    output.push(entry(surface, sourceKey, canonicalId, field, current[field], source[field]));
  }
}

export function buildPokeApiParityReport(
  facts: PokeApiLowAmbiguityFacts,
  current: GameDataCandidate,
  registry: MappingRegistry,
  bindings: PokeApiParityBindings,
  targetMap: PokeApiTargetMap = {},
): PokeApiParityReport {
  const entries: PokeApiParityEntry[] = [];
  const speciesMap = acceptedMap<SpeciesId>(registry.species);
  const moveMap = acceptedMap<MoveId>(registry.moves);
  const typeMap = acceptedMap<TypeId>(registry.types);
  const abilityMap = acceptedMap<AbilityId>(registry.abilities);
  const itemMap = acceptedMap<ItemId>(registry.items);
  const typeByPokeApiId = canonicalTypeByPokeApiId(facts.types, typeMap);
  const abilityByPokeApiId = canonicalAbilityByPokeApiId(facts.abilities, abilityMap);
  const pokemonById = new Map(facts.pokemon.map((pokemon) => [pokemon.pokemonId, pokemon] as const));
  const speciesById = new Map(facts.species.map((species) => [species.speciesId, species] as const));
  const bindingSourceKeys = bindings.species.map((binding) => binding.sourceKey.normalize("NFC"));
  const bindingSourceKeySet = new Set(bindingSourceKeys);
  if (bindingSourceKeySet.size !== bindingSourceKeys.length) {
    throw new Error("PokéAPI parity Species bindings must not repeat sourceKey");
  }
  const bindingPokemonIds = bindings.species.map((binding) => binding.pokemonId);
  if (new Set(bindingPokemonIds).size !== bindingPokemonIds.length) {
    throw new Error("PokéAPI parity Species bindings must not repeat pokemonId");
  }

  const currentSpecies = new Map(current.catalogs.species.map((value) => [value.id, value] as const));
  for (const binding of bindings.species) {
    const sourceKey = binding.sourceKey.normalize("NFC");
    const canonicalId = speciesMap.get(sourceKey);
    if (!canonicalId) {
      entries.push(entry("species", sourceKey, null, "mapping", null, null, "unmapped"));
      continue;
    }
    const existing = currentSpecies.get(canonicalId);
    if (!existing) {
      entries.push(entry("species", sourceKey, canonicalId, "record", null, binding, "missing-current"));
      continue;
    }
    const pokemon = pokemonById.get(binding.pokemonId);
    if (!pokemon) {
      entries.push(entry("species", sourceKey, canonicalId, "pokemon", existing, binding.pokemonId, "missing-source"));
      continue;
    }
    const species = speciesById.get(pokemon.speciesId);
    if (!species) {
      entries.push(entry("species", sourceKey, canonicalId, "species", existing, pokemon.speciesId, "missing-source"));
      continue;
    }
    const canonicalTypes = pokemon.typeIds.map((id) => typeByPokeApiId.get(id));
    const canonicalAbilities = abilityAssignments(pokemon, abilityByPokeApiId);
    if (canonicalTypes.some((id) => id === undefined) || canonicalAbilities === null) {
      entries.push(entry("species", sourceKey, canonicalId, "relations", null, null, "unmapped"));
      continue;
    }
    const sourceRecord = {
      sourceSlug: pokemon.sourceSlug,
      nationalDexNumber: species.nationalDexNumber,
      typeIds: (canonicalTypes as TypeId[]).slice().sort((left, right) =>
        left.localeCompare(right, "en", { sensitivity: "variant" }),
      ),
      baseStats: pokemon.baseStats,
      abilities: canonicalAbilities,
      catchRate: species.captureRate,
      baseExperience: sourceFact(pokemon.baseExperience),
      growthRate: growthRate(species.growthRate),
      heightMillimeters: pokemon.heightMillimeters,
      weightGrams: pokemon.weightGrams,
      eggGroups: orderedEggGroups(species.eggGroups),
      genderRatio: genderRatio(species.genderRate),
      evYield: pokemon.evYield,
      ...(pokemon.isDefault ? { introducedGeneration: species.introducedGeneration } : {}),
    };
    compareFields(
      entries,
      "species",
      sourceKey,
      canonicalId,
      existing as unknown as Record<string, unknown>,
      sourceRecord,
      Object.keys(sourceRecord),
    );
  }
  for (const mapping of registry.species) {
    if (mapping.status !== "accepted") continue;
    const sourceKey = mapping.sourceKey.normalize("NFC");
    if (bindingSourceKeySet.has(sourceKey)) continue;
    entries.push(entry(
      "species",
      sourceKey,
      mapping.canonicalId,
      "binding",
      currentSpecies.get(mapping.canonicalId) ?? null,
      null,
      "unmapped",
    ));
  }

  const currentMoves = new Map(current.catalogs.moves.map((value) => [value.id, value] as const));
  const seenMoveKeys = new Set<string>();
  for (const move of facts.moves) {
    seenMoveKeys.add(move.sourceSlug);
    const canonicalId = moveMap.get(move.sourceSlug);
    if (!canonicalId) continue;
    const existing = currentMoves.get(canonicalId);
    if (!existing) {
      entries.push(entry("moves", move.sourceSlug, canonicalId, "record", null, move, "missing-current"));
      continue;
    }
    const mappedTarget = targetMap[move.targetIdentifier];
    entries.push(mappedTarget === undefined
      ? entry("moves", move.sourceSlug, canonicalId, "sourceTarget", existing.sourceTarget, move.targetIdentifier, "unmapped")
      : entry("moves", move.sourceSlug, canonicalId, "sourceTarget", existing.sourceTarget, mappedTarget));
    entries.push(entry("moves", move.sourceSlug, canonicalId, "makesContact", existing.makesContact, move.makesContact));
  }
  for (const mapping of registry.moves) {
    if (mapping.status === "accepted" && !seenMoveKeys.has(mapping.sourceKey.normalize("NFC"))) {
      entries.push(entry("moves", mapping.sourceKey, mapping.canonicalId, "record", currentMoves.get(mapping.canonicalId) ?? null, null, "missing-source"));
    }
  }

  const currentTypes = new Map(current.catalogs.types.map((value) => [value.id, value] as const));
  const seenTypeKeys = new Set<string>();
  for (const type of facts.types) {
    seenTypeKeys.add(type.sourceSlug);
    const canonicalId = typeMap.get(type.sourceSlug);
    if (!canonicalId) continue;
    const existing = currentTypes.get(canonicalId);
    if (!existing) {
      entries.push(entry("types", type.sourceSlug, canonicalId, "record", null, type, "missing-current"));
      continue;
    }
    compareFields(entries, "types", type.sourceSlug, canonicalId, existing as unknown as Record<string, unknown>, type as unknown as Record<string, unknown>, ["sourceName", "sourceSlug"]);
  }
  for (const mapping of registry.types) {
    if (mapping.status === "accepted" && !seenTypeKeys.has(mapping.sourceKey.normalize("NFC"))) {
      entries.push(entry("types", mapping.sourceKey, mapping.canonicalId, "record", currentTypes.get(mapping.canonicalId) ?? null, null, "missing-source"));
    }
  }

  const currentAbilities = new Map(current.catalogs.abilities.map((value) => [value.id, value] as const));
  const seenAbilityKeys = new Set<string>();
  for (const ability of facts.abilities) {
    seenAbilityKeys.add(ability.sourceSlug);
    const canonicalId = abilityMap.get(ability.sourceSlug);
    if (!canonicalId) continue;
    const existing = currentAbilities.get(canonicalId);
    if (!existing) {
      entries.push(entry("abilities", ability.sourceSlug, canonicalId, "record", null, ability, "missing-current"));
      continue;
    }
    compareFields(entries, "abilities", ability.sourceSlug, canonicalId, existing as unknown as Record<string, unknown>, ability as unknown as Record<string, unknown>, ["sourceName", "sourceSlug", "introducedGeneration"]);
  }
  for (const mapping of registry.abilities) {
    if (mapping.status === "accepted" && !seenAbilityKeys.has(mapping.sourceKey.normalize("NFC"))) {
      entries.push(entry("abilities", mapping.sourceKey, mapping.canonicalId, "record", currentAbilities.get(mapping.canonicalId) ?? null, null, "missing-source"));
    }
  }

  const currentItems = new Map(current.catalogs.items.map((value) => [value.id, value] as const));
  const seenItemKeys = new Set<string>();
  for (const item of facts.items) {
    seenItemKeys.add(item.sourceSlug);
    const canonicalId = itemMap.get(item.sourceSlug);
    if (!canonicalId) continue;
    const existing = currentItems.get(canonicalId);
    if (!existing) {
      entries.push(entry("items", item.sourceSlug, canonicalId, "record", null, item, "missing-current"));
      continue;
    }
    entries.push(item.sourceName === null
      ? entry("items", item.sourceSlug, canonicalId, "sourceName", existing.sourceName, null, "missing-source")
      : entry("items", item.sourceSlug, canonicalId, "sourceName", existing.sourceName, item.sourceName));
    entries.push(entry("items", item.sourceSlug, canonicalId, "sourceSlug", existing.sourceSlug, item.sourceSlug));
    entries.push(existing.sourceCategory === null
      ? entry("items", item.sourceSlug, canonicalId, "sourceCategory", null, item.sourceCategory, "missing-current")
      : entry("items", item.sourceSlug, canonicalId, "sourceCategory", existing.sourceCategory, item.sourceCategory));
  }
  for (const mapping of registry.items) {
    if (mapping.status === "accepted" && !seenItemKeys.has(mapping.sourceKey.normalize("NFC"))) {
      entries.push(entry("items", mapping.sourceKey, mapping.canonicalId, "record", currentItems.get(mapping.canonicalId) ?? null, null, "missing-source"));
    }
  }

  const matrix = new Map<string, GameDataCandidate["referenceData"]["currentTypeEffectiveness"][number]>(
    current.referenceData.currentTypeEffectiveness.map((value) => [`${value.attackTypeId}\u0000${value.defenseTypeId}`, value]),
  );
  const seenMatrixKeys = new Set<string>();
  for (const fact of facts.typeEffectiveness) {
    const attackTypeId = typeByPokeApiId.get(fact.attackTypeId);
    const defenseTypeId = typeByPokeApiId.get(fact.defenseTypeId);
    if (!attackTypeId || !defenseTypeId) continue;
    const key = `${attackTypeId}\u0000${defenseTypeId}`;
    seenMatrixKeys.add(key);
    const existing = matrix.get(key);
    if (!existing) {
      entries.push(entry("type-effectiveness", key, key, "multiplier", null, fact.damageFactor / 100, "missing-current"));
      continue;
    }
    if (![0, 50, 100, 200].includes(fact.damageFactor)) {
      entries.push(entry("type-effectiveness", key, key, "multiplier", existing.multiplier, fact.damageFactor, "unmapped"));
      continue;
    }
    entries.push(entry("type-effectiveness", key, key, "multiplier", existing.multiplier, fact.damageFactor / 100));
  }
  const mappedTypeIds = new Set(typeByPokeApiId.values());
  for (const [key, existing] of matrix) {
    if (!mappedTypeIds.has(existing.attackTypeId) || !mappedTypeIds.has(existing.defenseTypeId)) continue;
    if (!seenMatrixKeys.has(key)) {
      entries.push(entry("type-effectiveness", key, key, "multiplier", existing.multiplier, null, "missing-source"));
    }
  }

  entries.sort((left, right) =>
    `${left.surface}\u0000${left.sourceKey}\u0000${left.field}`.localeCompare(
      `${right.surface}\u0000${right.sourceKey}\u0000${right.field}`,
      "en",
      { sensitivity: "variant" },
    ),
  );
  const counts: Record<PokeApiParityStatus, number> = {
    match: 0,
    mismatch: 0,
    "missing-current": 0,
    "missing-source": 0,
    unmapped: 0,
  };
  for (const value of entries) counts[value.status] += 1;
  return { entries, counts };
}
