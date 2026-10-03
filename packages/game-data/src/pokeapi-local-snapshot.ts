import type { StatBlock } from "@pokenexus/game-types";
import {
  readVerifiedSnapshotFile,
  verifyLocalSourceSnapshot,
  type VerifiedLocalSourceSnapshot,
} from "./local-source-snapshot.js";
import {
  sourceRecordV5FromSnapshotFile,
  type SourceRecordV5,
} from "./source-snapshot-v5.js";

export const POKEAPI_CSV_PARSER_VERSION = "pokeapi-csv-v1" as const;

const CSV_ROOT = "data/v2/csv" as const;
const csv = (name: string): string => `${CSV_ROOT}/${name}`;

export const POKEAPI_LOW_AMBIGUITY_FILES = [
  csv("languages.csv"),
  csv("pokemon.csv"),
  csv("pokemon_species.csv"),
  csv("pokemon_species_names.csv"),
  csv("pokemon_types.csv"),
  csv("pokemon_stats.csv"),
  csv("stats.csv"),
  csv("pokemon_abilities.csv"),
  csv("pokemon_dex_numbers.csv"),
  csv("pokedexes.csv"),
  csv("pokemon_egg_groups.csv"),
  csv("egg_groups.csv"),
  csv("growth_rates.csv"),
  csv("moves.csv"),
  csv("move_targets.csv"),
  csv("move_flags.csv"),
  csv("move_flag_map.csv"),
  csv("types.csv"),
  csv("type_names.csv"),
  csv("type_efficacy.csv"),
  csv("abilities.csv"),
  csv("ability_names.csv"),
  csv("items.csv"),
  csv("item_categories.csv"),
  csv("item_names.csv"),
] as const;

/** Exact CSV evidence sets for approved SPEC-022 facts. These become SourceRecord sets in schema 5. */
export const POKEAPI_FACT_EVIDENCE_FILES = {
  "species.sourceSlug": [csv("pokemon.csv")],
  "species.typeIds": [csv("pokemon.csv"), csv("pokemon_types.csv"), csv("types.csv")],
  "species.baseStats": [csv("pokemon.csv"), csv("pokemon_stats.csv"), csv("stats.csv")],
  "species.evYield": [csv("pokemon.csv"), csv("pokemon_stats.csv"), csv("stats.csv")],
  "species.abilities": [csv("pokemon.csv"), csv("pokemon_abilities.csv"), csv("abilities.csv")],
  "species.baseExperience": [csv("pokemon.csv")],
  "species.heightMillimeters": [csv("pokemon.csv")],
  "species.weightGrams": [csv("pokemon.csv")],
  "species.nationalDexNumber": [csv("pokemon_species.csv"), csv("pokemon_dex_numbers.csv"), csv("pokedexes.csv")],
  "species.introducedGeneration": [csv("pokemon_species.csv")],
  "species.catchRate": [csv("pokemon_species.csv")],
  "species.growthRate": [csv("pokemon_species.csv"), csv("growth_rates.csv")],
  "species.eggGroups": [csv("pokemon_species.csv"), csv("pokemon_egg_groups.csv"), csv("egg_groups.csv")],
  "species.genderRatio": [csv("pokemon_species.csv")],
  "move.sourceTarget": [csv("moves.csv"), csv("move_targets.csv")],
  "move.makesContact": [csv("moves.csv"), csv("move_flag_map.csv"), csv("move_flags.csv")],
  "type.sourceName": [csv("types.csv"), csv("type_names.csv"), csv("languages.csv")],
  "type.sourceSlug": [csv("types.csv")],
  "type-effectiveness.multiplier": [csv("type_efficacy.csv"), csv("types.csv")],
  "ability.sourceName": [csv("abilities.csv"), csv("ability_names.csv"), csv("languages.csv")],
  "ability.sourceSlug": [csv("abilities.csv")],
  "ability.introducedGeneration": [csv("abilities.csv")],
  "ability.assignment": [csv("pokemon.csv"), csv("pokemon_abilities.csv"), csv("abilities.csv")],
  "item.sourceName": [csv("items.csv"), csv("item_names.csv"), csv("languages.csv")],
  "item.sourceSlug": [csv("items.csv")],
  "item.sourceCategory": [csv("items.csv"), csv("item_categories.csv")],
} as const;

export type PokeApiFactEvidenceKey = keyof typeof POKEAPI_FACT_EVIDENCE_FILES;

export function pokeApiSourceRecordsForFact(
  snapshot: VerifiedLocalSourceSnapshot,
  fact: PokeApiFactEvidenceKey,
): SourceRecordV5[] {
  return POKEAPI_FACT_EVIDENCE_FILES[fact].map((logicalPath) =>
    sourceRecordV5FromSnapshotFile(snapshot.record, logicalPath, POKEAPI_CSV_PARSER_VERSION),
  );
}

type CsvRow = Record<string, string>;

export interface PokeApiAbilityAssignmentFact {
  abilityId: number;
  slot: number;
  isHidden: boolean;
}

export interface PokeApiPokemonFact {
  pokemonId: number;
  speciesId: number;
  sourceSlug: string;
  isDefault: boolean;
  baseExperience: number | null;
  heightMillimeters: number;
  weightGrams: number;
  typeIds: number[];
  baseStats: StatBlock<number>;
  evYield: StatBlock<number>;
  abilities: PokeApiAbilityAssignmentFact[];
}

export interface PokeApiSpeciesFact {
  speciesId: number;
  sourceSlug: string;
  sourceName: string;
  introducedGeneration: number;
  nationalDexNumber: number;
  captureRate: number;
  growthRate: string;
  eggGroups: string[];
  genderRate: number;
}

export interface PokeApiMoveFact {
  moveId: number;
  sourceSlug: string;
  targetIdentifier: string;
  makesContact: boolean;
}

export interface PokeApiTypeFact {
  typeId: number;
  sourceSlug: string;
  sourceName: string;
  introducedGeneration: number;
}

export interface PokeApiTypeEffectivenessFact {
  attackTypeId: number;
  defenseTypeId: number;
  damageFactor: number;
}

export interface PokeApiAbilityFact {
  abilityId: number;
  sourceSlug: string;
  sourceName: string;
  introducedGeneration: number;
}

export interface PokeApiItemFact {
  itemId: number;
  sourceSlug: string;
  sourceName: string | null;
  sourceCategory: string;
}

export interface PokeApiLowAmbiguityFacts {
  snapshot: VerifiedLocalSourceSnapshot;
  pokemon: PokeApiPokemonFact[];
  species: PokeApiSpeciesFact[];
  moves: PokeApiMoveFact[];
  types: PokeApiTypeFact[];
  typeEffectiveness: PokeApiTypeEffectivenessFact[];
  abilities: PokeApiAbilityFact[];
  items: PokeApiItemFact[];
}

function parseCsv(text: string, label: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error(`${label}: unterminated quoted CSV field`);
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/u, ""));
    rows.push(row);
  }
  if (rows.length === 0) throw new Error(`${label}: CSV is empty`);
  const headers = rows[0].map((value) => value.normalize("NFC"));
  if (headers.some((header) => header.length === 0) || new Set(headers).size !== headers.length) {
    throw new Error(`${label}: CSV headers must be non-empty and unique`);
  }
  return rows.slice(1).filter((entry) => entry.some((value) => value.length > 0)).map((entry, rowIndex) => {
    if (entry.length !== headers.length) {
      throw new Error(`${label}: row ${rowIndex + 2} has ${entry.length} columns; expected ${headers.length}`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, entry[index].normalize("NFC")])) as CsvRow;
  });
}

function requireCell(row: CsvRow, key: string, label: string): string {
  const value = row[key];
  if (value === undefined) throw new Error(`${label}: missing column ${key}`);
  return value;
}

function integer(value: string, label: string, minimum = 0): number {
  if (!/^-?\d+$/u.test(value)) throw new Error(`${label}: expected integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new Error(`${label}: integer below ${minimum}`);
  return parsed;
}

function nullableInteger(value: string, label: string, minimum = 0): number | null {
  if (value === "") return null;
  return integer(value, label, minimum);
}

function booleanCell(value: string, label: string): boolean {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  throw new Error(`${label}: expected 0/1 or true/false`);
}

function byIntegerId(rows: CsvRow[], idColumn: string, label: string): Map<number, CsvRow> {
  const result = new Map<number, CsvRow>();
  for (const [index, row] of rows.entries()) {
    const id = integer(requireCell(row, idColumn, `${label}[${index}]`), `${label}[${index}].${idColumn}`);
    if (result.has(id)) throw new Error(`${label}: duplicate ${idColumn} ${id}`);
    result.set(id, row);
  }
  return result;
}

function groupedByInteger(rows: CsvRow[], column: string, label: string): Map<number, CsvRow[]> {
  const result = new Map<number, CsvRow[]>();
  for (const [index, row] of rows.entries()) {
    const key = integer(requireCell(row, column, `${label}[${index}]`), `${label}[${index}].${column}`);
    const group = result.get(key) ?? [];
    group.push(row);
    result.set(key, group);
  }
  return result;
}

async function rows(snapshot: VerifiedLocalSourceSnapshot, name: string): Promise<CsvRow[]> {
  const logicalPath = csv(name);
  const bytes = await readVerifiedSnapshotFile(snapshot, logicalPath);
  return parseCsv(bytes.toString("utf8"), logicalPath);
}

function englishNameByEntity(
  nameRows: CsvRow[],
  entityColumn: string,
  englishLanguageId: number,
  label: string,
): Map<number, string> {
  const result = new Map<number, string>();
  for (const [index, row] of nameRows.entries()) {
    const languageId = integer(requireCell(row, "local_language_id", `${label}[${index}]`), `${label}[${index}].local_language_id`);
    if (languageId !== englishLanguageId) continue;
    const entityId = integer(requireCell(row, entityColumn, `${label}[${index}]`), `${label}[${index}].${entityColumn}`);
    const name = requireCell(row, "name", `${label}[${index}]`).trim();
    if (!name) throw new Error(`${label}[${index}].name: English name must be non-empty`);
    if (result.has(entityId)) throw new Error(`${label}: duplicate English name for ${entityColumn} ${entityId}`);
    result.set(entityId, name.normalize("NFC"));
  }
  return result;
}

function statKey(identifier: string): keyof StatBlock<number> {
  switch (identifier) {
    case "hp": return "hp";
    case "attack": return "atk";
    case "defense": return "def";
    case "special-attack": return "spa";
    case "special-defense": return "spd";
    case "speed": return "spe";
    default: throw new Error(`unsupported battle stat identifier ${identifier}`);
  }
}

function emptyStatBlock(): StatBlock<number> {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

function assertCompleteBaseStats(value: StatBlock<number>, pokemonId: number): void {
  for (const [key, stat] of Object.entries(value)) {
    if (!Number.isSafeInteger(stat) || stat <= 0) throw new Error(`pokemon ${pokemonId}: missing/invalid base stat ${key}`);
  }
}

export async function loadPokeApiLowAmbiguityFacts(snapshotRoot: string): Promise<PokeApiLowAmbiguityFacts> {
  const snapshot = await verifyLocalSourceSnapshot(snapshotRoot);
  if (snapshot.record.provider !== "pokeapi") throw new Error("PokéAPI adapter requires a pokeapi source snapshot");
  const available = new Set(snapshot.record.files.map((entry) => entry.logicalPath));
  for (const required of POKEAPI_LOW_AMBIGUITY_FILES) {
    if (!available.has(required)) throw new Error(`PokéAPI snapshot is missing required file ${required}`);
  }

  const [
    languages,
    pokemonRows,
    speciesRows,
    speciesNamesRows,
    pokemonTypesRows,
    pokemonStatsRows,
    statsRows,
    pokemonAbilitiesRows,
    dexNumberRows,
    pokedexRows,
    pokemonEggGroupRows,
    eggGroupRows,
    growthRateRows,
    moveRows,
    moveTargetRows,
    moveFlagRows,
    moveFlagMapRows,
    typeRows,
    typeNameRows,
    typeEfficacyRows,
    abilityRows,
    abilityNameRows,
    itemRows,
    itemCategoryRows,
    itemNameRows,
  ] = await Promise.all([
    rows(snapshot, "languages.csv"),
    rows(snapshot, "pokemon.csv"),
    rows(snapshot, "pokemon_species.csv"),
    rows(snapshot, "pokemon_species_names.csv"),
    rows(snapshot, "pokemon_types.csv"),
    rows(snapshot, "pokemon_stats.csv"),
    rows(snapshot, "stats.csv"),
    rows(snapshot, "pokemon_abilities.csv"),
    rows(snapshot, "pokemon_dex_numbers.csv"),
    rows(snapshot, "pokedexes.csv"),
    rows(snapshot, "pokemon_egg_groups.csv"),
    rows(snapshot, "egg_groups.csv"),
    rows(snapshot, "growth_rates.csv"),
    rows(snapshot, "moves.csv"),
    rows(snapshot, "move_targets.csv"),
    rows(snapshot, "move_flags.csv"),
    rows(snapshot, "move_flag_map.csv"),
    rows(snapshot, "types.csv"),
    rows(snapshot, "type_names.csv"),
    rows(snapshot, "type_efficacy.csv"),
    rows(snapshot, "abilities.csv"),
    rows(snapshot, "ability_names.csv"),
    rows(snapshot, "items.csv"),
    rows(snapshot, "item_categories.csv"),
    rows(snapshot, "item_names.csv"),
  ]);

  const englishLanguage = languages.find((row) => row.identifier === "en");
  if (!englishLanguage) throw new Error("PokéAPI snapshot does not define English language identifier");
  const englishLanguageId = integer(requireCell(englishLanguage, "id", "languages.en"), "languages.en.id");

  const languageRowsById = byIntegerId(languages, "id", "languages");
  const pokemonRowsById = byIntegerId(pokemonRows, "id", "pokemon");
  const statRowsById = byIntegerId(statsRows, "id", "stats");
  const speciesRowsById = byIntegerId(speciesRows, "id", "pokemon_species");
  const typeRowsById = byIntegerId(typeRows, "id", "types");
  const abilityRowsById = byIntegerId(abilityRows, "id", "abilities");
  const pokedexRowsById = byIntegerId(pokedexRows, "id", "pokedexes");
  const eggGroupsById = byIntegerId(eggGroupRows, "id", "egg_groups");
  const itemRowsById = byIntegerId(itemRows, "id", "items");
  const itemCategoriesById = byIntegerId(itemCategoryRows, "id", "item_categories");
  const typesByPokemon = groupedByInteger(pokemonTypesRows, "pokemon_id", "pokemon_types");
  const statsByPokemon = groupedByInteger(pokemonStatsRows, "pokemon_id", "pokemon_stats");
  const abilitiesByPokemon = groupedByInteger(pokemonAbilitiesRows, "pokemon_id", "pokemon_abilities");
  for (const [pokemonId] of typesByPokemon) {
    if (!pokemonRowsById.has(pokemonId)) throw new Error(`pokemon_types references unknown pokemon_id ${pokemonId}`);
  }
  for (const [pokemonId] of statsByPokemon) {
    if (!pokemonRowsById.has(pokemonId)) throw new Error(`pokemon_stats references unknown pokemon_id ${pokemonId}`);
  }
  for (const [pokemonId] of abilitiesByPokemon) {
    if (!pokemonRowsById.has(pokemonId)) throw new Error(`pokemon_abilities references unknown pokemon_id ${pokemonId}`);
  }
  for (const [index, row] of speciesNamesRows.entries()) {
    const speciesId = integer(requireCell(row, "pokemon_species_id", `pokemon_species_names[${index}]`), `pokemon_species_names[${index}].pokemon_species_id`, 1);
    const languageId = integer(requireCell(row, "local_language_id", `pokemon_species_names[${index}]`), `pokemon_species_names[${index}].local_language_id`, 1);
    if (!speciesRowsById.has(speciesId)) throw new Error(`pokemon_species_names references unknown pokemon_species_id ${speciesId}`);
    if (!languageRowsById.has(languageId)) throw new Error(`pokemon_species_names references unknown local_language_id ${languageId}`);
  }
  for (const [index, row] of dexNumberRows.entries()) {
    const speciesId = integer(requireCell(row, "species_id", `pokemon_dex_numbers[${index}]`), `pokemon_dex_numbers[${index}].species_id`, 1);
    const pokedexId = integer(requireCell(row, "pokedex_id", `pokemon_dex_numbers[${index}]`), `pokemon_dex_numbers[${index}].pokedex_id`, 1);
    if (!speciesRowsById.has(speciesId)) throw new Error(`pokemon_dex_numbers references unknown species_id ${speciesId}`);
    if (!pokedexRowsById.has(pokedexId)) throw new Error(`pokemon_dex_numbers references unknown pokedex_id ${pokedexId}`);
  }
  for (const [index, row] of pokemonEggGroupRows.entries()) {
    const speciesId = integer(requireCell(row, "species_id", `pokemon_egg_groups[${index}]`), `pokemon_egg_groups[${index}].species_id`, 1);
    const eggGroupId = integer(requireCell(row, "egg_group_id", `pokemon_egg_groups[${index}]`), `pokemon_egg_groups[${index}].egg_group_id`, 1);
    if (!speciesRowsById.has(speciesId)) throw new Error(`pokemon_egg_groups references unknown species_id ${speciesId}`);
    if (!eggGroupsById.has(eggGroupId)) throw new Error(`pokemon_egg_groups references unknown egg_group_id ${eggGroupId}`);
  }
  const assertLocalizedNameForeignKeys = (
    nameRows: CsvRow[],
    entityColumn: string,
    entities: Map<number, CsvRow>,
    label: string,
  ): void => {
    for (const [index, row] of nameRows.entries()) {
      const entityId = integer(requireCell(row, entityColumn, `${label}[${index}]`), `${label}[${index}].${entityColumn}`, 1);
      const languageId = integer(requireCell(row, "local_language_id", `${label}[${index}]`), `${label}[${index}].local_language_id`, 1);
      if (!entities.has(entityId)) throw new Error(`${label} references unknown ${entityColumn} ${entityId}`);
      if (!languageRowsById.has(languageId)) throw new Error(`${label} references unknown local_language_id ${languageId}`);
    }
  };
  assertLocalizedNameForeignKeys(typeNameRows, "type_id", typeRowsById, "type_names");
  assertLocalizedNameForeignKeys(abilityNameRows, "ability_id", abilityRowsById, "ability_names");
  assertLocalizedNameForeignKeys(itemNameRows, "item_id", itemRowsById, "item_names");
  for (const [itemId, row] of itemRowsById) {
    const categoryId = integer(requireCell(row, "category_id", `items:${itemId}`), `items:${itemId}.category_id`, 1);
    if (!itemCategoriesById.has(categoryId)) throw new Error(`item ${itemId}: unknown category_id ${categoryId}`);
  }

  const pokemon: PokeApiPokemonFact[] = pokemonRows.map((row, index) => {
    const pokemonId = integer(requireCell(row, "id", `pokemon[${index}]`), `pokemon[${index}].id`);
    const speciesId = integer(requireCell(row, "species_id", `pokemon[${index}]`), `pokemon[${index}].species_id`, 1);
    const isDefault = booleanCell(requireCell(row, "is_default", `pokemon[${index}]`), `pokemon[${index}].is_default`);
    if (!speciesRowsById.has(speciesId)) throw new Error(`pokemon ${pokemonId}: unknown species_id ${speciesId}`);
    const baseStats = emptyStatBlock();
    const evYield = emptyStatBlock();
    const seenStats = new Set<string>();
    for (const statRow of statsByPokemon.get(pokemonId) ?? []) {
      const statId = integer(requireCell(statRow, "stat_id", `pokemon_stats:${pokemonId}`), `pokemon_stats:${pokemonId}.stat_id`);
      const definition = statRowsById.get(statId);
      if (!definition) throw new Error(`pokemon ${pokemonId}: unknown stat_id ${statId}`);
      const key = statKey(requireCell(definition, "identifier", `stats:${statId}`));
      if (seenStats.has(key)) throw new Error(`pokemon ${pokemonId}: duplicate stat ${key}`);
      seenStats.add(key);
      baseStats[key] = integer(requireCell(statRow, "base_stat", `pokemon_stats:${pokemonId}`), `pokemon_stats:${pokemonId}.base_stat`, 1);
      evYield[key] = integer(requireCell(statRow, "effort", `pokemon_stats:${pokemonId}`), `pokemon_stats:${pokemonId}.effort`);
    }
    assertCompleteBaseStats(baseStats, pokemonId);
    const typeAssignments = (typesByPokemon.get(pokemonId) ?? [])
      .map((typeRow) => ({
        typeId: integer(requireCell(typeRow, "type_id", `pokemon_types:${pokemonId}`), `pokemon_types:${pokemonId}.type_id`),
        slot: integer(requireCell(typeRow, "slot", `pokemon_types:${pokemonId}`), `pokemon_types:${pokemonId}.slot`, 1),
      }))
      .sort((left, right) => left.slot - right.slot);
    if (new Set(typeAssignments.map(({ slot }) => slot)).size !== typeAssignments.length) {
      throw new Error(`pokemon ${pokemonId}: duplicate type slot`);
    }
    const typeIds = typeAssignments.map(({ typeId }) => {
        if (!typeRowsById.has(typeId)) throw new Error(`pokemon ${pokemonId}: unknown type_id ${typeId}`);
        return typeId;
      });
    if (typeIds.length < 1 || typeIds.length > 2) throw new Error(`pokemon ${pokemonId}: must have one or two type rows`);
    if (new Set(typeIds).size !== typeIds.length) throw new Error(`pokemon ${pokemonId}: duplicate type assignment`);
    const abilities = (abilitiesByPokemon.get(pokemonId) ?? []).map((abilityRow) => ({
      abilityId: integer(requireCell(abilityRow, "ability_id", `pokemon_abilities:${pokemonId}`), `pokemon_abilities:${pokemonId}.ability_id`),
      isHidden: booleanCell(requireCell(abilityRow, "is_hidden", `pokemon_abilities:${pokemonId}`), `pokemon_abilities:${pokemonId}.is_hidden`),
      slot: integer(requireCell(abilityRow, "slot", `pokemon_abilities:${pokemonId}`), `pokemon_abilities:${pokemonId}.slot`, 1),
    })).map((assignment) => {
      if (!abilityRowsById.has(assignment.abilityId)) throw new Error(`pokemon ${pokemonId}: unknown ability_id ${assignment.abilityId}`);
      if (!assignment.isHidden && assignment.slot > 2) throw new Error(`pokemon ${pokemonId}: non-hidden ability slot must be 1 or 2`);
      return assignment;
    }).sort((left, right) => left.slot - right.slot);
    if (abilities.length === 0 && isDefault) throw new Error(`pokemon ${pokemonId}: missing ability assignments`);
    const effectiveAbilitySlots = abilities.map((assignment) => assignment.isHidden ? "hidden" : `normal-${assignment.slot}`);
    if (new Set(effectiveAbilitySlots).size !== effectiveAbilitySlots.length) throw new Error(`pokemon ${pokemonId}: duplicate ability slot`);
    return {
      pokemonId,
      speciesId,
      sourceSlug: requireCell(row, "identifier", `pokemon[${index}]`).normalize("NFC"),
      isDefault,
      baseExperience: nullableInteger(requireCell(row, "base_experience", `pokemon[${index}]`), `pokemon[${index}].base_experience`),
      heightMillimeters: integer(requireCell(row, "height", `pokemon[${index}]`), `pokemon[${index}].height`, 1) * 100,
      weightGrams: integer(requireCell(row, "weight", `pokemon[${index}]`), `pokemon[${index}].weight`) * 100,
      typeIds,
      baseStats,
      evYield,
      abilities,
    };
  }).sort((left, right) => left.pokemonId - right.pokemonId);

  const speciesNames = englishNameByEntity(speciesNamesRows, "pokemon_species_id", englishLanguageId, "pokemon_species_names");
  const growthRatesById = byIntegerId(growthRateRows, "id", "growth_rates");
  const eggGroupsBySpecies = groupedByInteger(pokemonEggGroupRows, "species_id", "pokemon_egg_groups");
  const dexBySpecies = groupedByInteger(dexNumberRows, "species_id", "pokemon_dex_numbers");
  const nationalDex = pokedexRows.find((row) => row.identifier === "national");
  if (!nationalDex) throw new Error("PokéAPI snapshot does not define national Pokédex");
  const nationalDexId = integer(requireCell(nationalDex, "id", "pokedexes.national"), "pokedexes.national.id");

  const species: PokeApiSpeciesFact[] = speciesRows.map((row, index) => {
    const speciesId = integer(requireCell(row, "id", `pokemon_species[${index}]`), `pokemon_species[${index}].id`, 1);
    const nationalRow = (dexBySpecies.get(speciesId) ?? []).find((entry) =>
      integer(requireCell(entry, "pokedex_id", `pokemon_dex_numbers:${speciesId}`), `pokemon_dex_numbers:${speciesId}.pokedex_id`) === nationalDexId,
    );
    if (!nationalRow) throw new Error(`species ${speciesId}: missing National Pokédex relation`);
    const growthRateId = integer(requireCell(row, "growth_rate_id", `pokemon_species[${index}]`), `pokemon_species[${index}].growth_rate_id`, 1);
    const growthRate = growthRatesById.get(growthRateId);
    if (!growthRate) throw new Error(`species ${speciesId}: unknown growth_rate_id ${growthRateId}`);
    const eggGroups = (eggGroupsBySpecies.get(speciesId) ?? []).map((entry) => {
      const eggGroupId = integer(requireCell(entry, "egg_group_id", `pokemon_egg_groups:${speciesId}`), `pokemon_egg_groups:${speciesId}.egg_group_id`, 1);
      const definition = eggGroupsById.get(eggGroupId);
      if (!definition) throw new Error(`species ${speciesId}: unknown egg_group_id ${eggGroupId}`);
      return requireCell(definition, "identifier", `egg_groups:${eggGroupId}`).normalize("NFC");
    });
    if (eggGroups.length < 1 || eggGroups.length > 2) throw new Error(`species ${speciesId}: must have one or two Egg Groups`);
    const sourceName = speciesNames.get(speciesId);
    if (!sourceName) throw new Error(`species ${speciesId}: missing English source name`);
    const genderRateRaw = requireCell(row, "gender_rate", `pokemon_species[${index}]`);
    const genderRate = integer(genderRateRaw, `pokemon_species[${index}].gender_rate`, -1);
    if (genderRate > 8) throw new Error(`species ${speciesId}: gender_rate must be -1..8`);
    return {
      speciesId,
      sourceSlug: requireCell(row, "identifier", `pokemon_species[${index}]`).normalize("NFC"),
      sourceName,
      introducedGeneration: integer(requireCell(row, "generation_id", `pokemon_species[${index}]`), `pokemon_species[${index}].generation_id`, 1),
      nationalDexNumber: integer(requireCell(nationalRow, "pokedex_number", `pokemon_dex_numbers:${speciesId}`), `pokemon_dex_numbers:${speciesId}.pokedex_number`, 1),
      captureRate: integer(requireCell(row, "capture_rate", `pokemon_species[${index}]`), `pokemon_species[${index}].capture_rate`),
      growthRate: requireCell(growthRate, "identifier", `growth_rates:${growthRateId}`).normalize("NFC"),
      eggGroups,
      genderRate,
    };
  }).sort((left, right) => left.speciesId - right.speciesId);

  const moveTargetsById = byIntegerId(moveTargetRows, "id", "move_targets");
  const moveFlagsById = byIntegerId(moveFlagRows, "id", "move_flags");
  const movesById = byIntegerId(moveRows, "id", "moves");
  const contactFlagEntry = [...moveFlagsById.entries()].find(([, row]) => row.identifier === "contact");
  if (!contactFlagEntry) throw new Error("PokéAPI snapshot does not define contact Move flag");
  const contactFlagId = contactFlagEntry[0];
  const flagsByMove = groupedByInteger(moveFlagMapRows, "move_id", "move_flag_map");
  const moves: PokeApiMoveFact[] = moveRows.map((row, index) => {
    const moveId = integer(requireCell(row, "id", `moves[${index}]`), `moves[${index}].id`, 1);
    const targetId = integer(requireCell(row, "target_id", `moves[${index}]`), `moves[${index}].target_id`, 1);
    const target = moveTargetsById.get(targetId);
    if (!target) throw new Error(`move ${moveId}: unknown target_id ${targetId}`);
    const moveFlags = (flagsByMove.get(moveId) ?? []).map((flagRow) => {
      const flagId = integer(requireCell(flagRow, "move_flag_id", `move_flag_map:${moveId}`), `move_flag_map:${moveId}.move_flag_id`, 1);
      if (!moveFlagsById.has(flagId)) throw new Error(`move ${moveId}: unknown move_flag_id ${flagId}`);
      return flagId;
    });
    const makesContact = moveFlags.includes(contactFlagId);
    return {
      moveId,
      sourceSlug: requireCell(row, "identifier", `moves[${index}]`).normalize("NFC"),
      targetIdentifier: requireCell(target, "identifier", `move_targets:${targetId}`).normalize("NFC"),
      makesContact,
    };
  }).sort((left, right) => left.moveId - right.moveId);
  for (const [moveId] of flagsByMove) {
    if (!movesById.has(moveId)) throw new Error(`move_flag_map references unknown move_id ${moveId}`);
  }

  const typeNames = englishNameByEntity(typeNameRows, "type_id", englishLanguageId, "type_names");
  const types: PokeApiTypeFact[] = typeRows.map((row, index) => {
    const typeId = integer(requireCell(row, "id", `types[${index}]`), `types[${index}].id`, 1);
    const sourceName = typeNames.get(typeId);
    if (!sourceName) throw new Error(`type ${typeId}: missing English source name`);
    return {
      typeId,
      sourceSlug: requireCell(row, "identifier", `types[${index}]`).normalize("NFC"),
      sourceName,
      introducedGeneration: integer(requireCell(row, "generation_id", `types[${index}]`), `types[${index}].generation_id`, 1),
    };
  }).sort((left, right) => left.typeId - right.typeId);

  const typeEffectiveness: PokeApiTypeEffectivenessFact[] = typeEfficacyRows.map((row, index) => {
    const attackTypeId = integer(requireCell(row, "damage_type_id", `type_efficacy[${index}]`), `type_efficacy[${index}].damage_type_id`, 1);
    const defenseTypeId = integer(requireCell(row, "target_type_id", `type_efficacy[${index}]`), `type_efficacy[${index}].target_type_id`, 1);
    if (!typeRowsById.has(attackTypeId) || !typeRowsById.has(defenseTypeId)) {
      throw new Error(`type_efficacy[${index}]: unknown Type FK`);
    }
    return {
      attackTypeId,
      defenseTypeId,
      damageFactor: integer(requireCell(row, "damage_factor", `type_efficacy[${index}]`), `type_efficacy[${index}].damage_factor`),
    };
  }).sort((left, right) => left.attackTypeId - right.attackTypeId || left.defenseTypeId - right.defenseTypeId);
  const typeEffectivenessKeys = typeEffectiveness.map((value) => `${value.attackTypeId}\u0000${value.defenseTypeId}`);
  if (new Set(typeEffectivenessKeys).size !== typeEffectivenessKeys.length) throw new Error("type_efficacy contains duplicate ordered Type pairs");

  const abilityNames = englishNameByEntity(abilityNameRows, "ability_id", englishLanguageId, "ability_names");
  const abilities: PokeApiAbilityFact[] = abilityRows.map((row, index) => {
    const abilityId = integer(requireCell(row, "id", `abilities[${index}]`), `abilities[${index}].id`, 1);
    const sourceName = abilityNames.get(abilityId);
    if (!sourceName) throw new Error(`ability ${abilityId}: missing English source name`);
    return {
      abilityId,
      sourceSlug: requireCell(row, "identifier", `abilities[${index}]`).normalize("NFC"),
      sourceName,
      introducedGeneration: integer(requireCell(row, "generation_id", `abilities[${index}]`), `abilities[${index}].generation_id`, 1),
    };
  }).sort((left, right) => left.abilityId - right.abilityId);

  const itemNames = englishNameByEntity(itemNameRows, "item_id", englishLanguageId, "item_names");
  const items: PokeApiItemFact[] = itemRows.map((row, index) => {
    const itemId = integer(requireCell(row, "id", `items[${index}]`), `items[${index}].id`, 1);
    const categoryId = integer(requireCell(row, "category_id", `items[${index}]`), `items[${index}].category_id`, 1);
    const category = itemCategoriesById.get(categoryId);
    if (!category) throw new Error(`item ${itemId}: unknown category_id ${categoryId}`);
    const sourceName = itemNames.get(itemId) ?? null;
    return {
      itemId,
      sourceSlug: requireCell(row, "identifier", `items[${index}]`).normalize("NFC"),
      sourceName,
      sourceCategory: requireCell(category, "identifier", `item_categories:${categoryId}`).normalize("NFC"),
    };
  }).sort((left, right) => left.itemId - right.itemId);

  return { snapshot, pokemon, species, moves, types, typeEffectiveness, abilities, items };
}
