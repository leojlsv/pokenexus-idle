import type {
  AbilityId,
  ItemId,
  MoveId,
  SpeciesId,
  TypeId,
} from "@pokenexus/game-types";
import { finalizeProvenance } from "./canonical.js";
import {
  BULBAPEDIA_GEN9_MOVE_LIST_URL,
  BULBAPEDIA_GEN9_MOVE_PARSER_VERSION,
} from "./bulbapedia-gen9-move-parser.js";
import {
  BULBAPEDIA_GEN7_MOVE_LIST_URL,
  BULBAPEDIA_GEN8_MOVE_LIST_URL,
  BULBAPEDIA_HISTORICAL_MOVE_PARSER_VERSION,
} from "./bulbapedia-historical-move-parser.js";
import {
  BULBAPEDIA_MOVE_TARGET_PARSER_VERSION,
  buildBulbapediaMoveTargetUrl,
} from "./bulbapedia-move-target.js";
import { BULBAPEDIA_GEN8_LEARNSET_PARSER_VERSION } from "./bulbapedia-learnset-parser.js";
import {
  BULBAPEDIA_HISTORICAL_SCALAR_PROOF_PARSER_VERSION,
  buildBulbapediaHistoricalScalarProofUrl,
  type HistoricalScalarSelectedGame,
} from "./bulbapedia-historical-scalar-proof.js";
import { cloneMappingRegistry } from "./mapping-roster.js";
import type { HistoricalScalarProof } from "./move-mainline-selection.js";
import type {
  DiscoveredPokemonDbSpeciesForm,
  ExtractedPokemonDbAbility,
  ExtractedPokemonDbItem,
  ExtractedPokemonDbLearnsetEntry,
  ExtractedPokemonDbMove,
  ExtractedPokemonDbSpecies,
  ExtractedPokemonDbType,
  ExtractedPokemonDbTypeEffectiveness,
} from "./pokemondb-parser.js";
import { proposeCandidateId } from "./candidate-id.js";
import { validateMappingRegistry } from "./reconciliation.js";
import {
  EGG_GROUP_KEYS,
  GameDataValidationError,
  SCHEMA_VERSION,
  parseGameDataCandidate,
  type CatalogSurface,
  type ExcludedOrDeferredSourceKey,
  type GameDataCandidate,
  type MappingRegistry,
  type SourceInventory,
  type SourceRecord,
  type ValidationFinding,
} from "./schema.js";

export const NORMALIZER_VERSION = "pokenexus-static-normalizer-v5" as const;

export interface RawSourceDiscovery {
  species?: string[];
  moves: string[];
  types: string[];
  abilities: string[];
  items: string[];
  learnsets: string[];
  currentTypeEffectiveness: string[];
}

export interface RawExtractedSnapshot {
  parserVersion: string;
  speciesDiscovery: DiscoveredPokemonDbSpeciesForm[];
  discovery: RawSourceDiscovery;
  species: ExtractedPokemonDbSpecies[];
  moves: ExtractedPokemonDbMove[];
  types: ExtractedPokemonDbType[];
  abilities: ExtractedPokemonDbAbility[];
  items: ExtractedPokemonDbItem[];
  learnsets: ExtractedPokemonDbLearnsetEntry[];
  historicalScalarProofs: HistoricalScalarProof[];
  currentTypeEffectiveness: ExtractedPokemonDbTypeEffectiveness[];
}

export type ExclusionsBySurface = Partial<
  Record<CatalogSurface, readonly ExcludedOrDeferredSourceKey[]>
>;

export interface NormalizationResult {
  candidate: GameDataCandidate;
  mappingRegistry: MappingRegistry;
}

function mappingError(path: string, message: string, code = "normalization-invalid"): never {
  throw new GameDataValidationError({ code, path, message });
}

function uniqueBySourceKey<T extends { sourceKey: string }>(
  records: T[],
  path: string,
): T[] {
  const seen = new Set<string>();
  for (const record of records) {
    const key = record.sourceKey.normalize("NFC");
    if (seen.has(key)) mappingError(path, "duplicate extracted source key " + key);
    seen.add(key);
  }
  return records;
}

function sourceRecordIdsFor(
  record: { sourceRecordId: string; supportingSourceRecordIds?: string[] },
): string[] {
  const ids = [record.sourceRecordId, ...(record.supportingSourceRecordIds ?? [])];
  if (ids.some((id) => !id.trim())) {
    mappingError("provenance.sourceRecordIds", "source record IDs must be non-empty");
  }
  return [...new Set(ids)];
}

function mappingBySource<T extends { sourceKey: string; canonicalId: string }>(
  entries: T[],
): Map<string, T> {
  return new Map(entries.map((entry) => [entry.sourceKey.normalize("NFC"), entry]));
}

function idFor<TId extends string>(
  map: Map<string, { canonicalId: string }>,
  sourceKey: string,
  path: string,
): TId {
  const entry = map.get(sourceKey.normalize("NFC"));
  if (!entry) mappingError(path, "missing source-to-canonical mapping for " + sourceKey);
  return entry.canonicalId as TId;
}

function proposePrimaryMappings(
  raw: RawExtractedSnapshot,
  baseRegistry: MappingRegistry,
): MappingRegistry {
  const registry = cloneMappingRegistry(baseRegistry);

  const speciesMap = mappingBySource(registry.species);
  const baseBySlug = new Map(
    raw.species
      .filter((record) => record.formLabel === null)
      .map((record) => [record.sourceSlug, record] as const),
  );

  for (const record of raw.species.filter((entry) => entry.formLabel === null)) {
    if (speciesMap.has(record.sourceKey.normalize("NFC"))) continue;
    const entry = {
      sourceKey: record.sourceKey,
      canonicalId: proposeCandidateId("species", record.sourceKey) as SpeciesId,
      baseSpeciesId: null,
      status: "candidate" as const,
    };
    registry.species.push(entry);
    speciesMap.set(record.sourceKey.normalize("NFC"), entry);
  }

  for (const record of raw.species.filter((entry) => entry.formLabel !== null)) {
    if (speciesMap.has(record.sourceKey.normalize("NFC"))) continue;
    const base = baseBySlug.get(record.sourceSlug);
    if (!base) {
      mappingError(
        "mapping.species." + record.sourceKey,
        "alternate persistent form requires its base Species source record in the candidate",
      );
    }
    const baseEntry = speciesMap.get(base.sourceKey.normalize("NFC"));
    if (!baseEntry) {
      mappingError(
        "mapping.species." + record.sourceKey,
        "base Species mapping was not materialized",
      );
    }
    const entry = {
      sourceKey: record.sourceKey,
      canonicalId: proposeCandidateId("species", record.sourceKey) as SpeciesId,
      baseSpeciesId: baseEntry.canonicalId as SpeciesId,
      status: "candidate" as const,
    };
    registry.species.push(entry);
    speciesMap.set(record.sourceKey.normalize("NFC"), entry);
  }

  const addSimpleCandidates = <
    TRecord extends { sourceKey: string },
    TId extends string,
  >(
    kind: "move" | "type" | "ability" | "item",
    records: TRecord[],
    entries: Array<{ sourceKey: string; canonicalId: TId; status: "accepted" | "candidate" }>,
  ): void => {
    const bySource = mappingBySource(entries);
    for (const record of records) {
      if (bySource.has(record.sourceKey.normalize("NFC"))) continue;
      const entry = {
        sourceKey: record.sourceKey,
        canonicalId: proposeCandidateId(kind, record.sourceKey) as TId,
        status: "candidate" as const,
      };
      entries.push(entry);
      bySource.set(record.sourceKey.normalize("NFC"), entry);
    }
  };

  addSimpleCandidates<ExtractedPokemonDbMove, MoveId>("move", raw.moves, registry.moves);
  addSimpleCandidates<ExtractedPokemonDbType, TypeId>("type", raw.types, registry.types);
  addSimpleCandidates<ExtractedPokemonDbAbility, AbilityId>(
    "ability",
    raw.abilities,
    registry.abilities,
  );
  addSimpleCandidates<ExtractedPokemonDbItem, ItemId>("item", raw.items, registry.items);

  const findings = validateMappingRegistry(registry);
  if (findings.length > 0) throw new GameDataValidationError(findings[0]);
  return registry;
}

function canonicalEggGroups(sourceKeys: string[]): GameDataCandidate["catalogs"]["species"][number]["eggGroups"] {
  const order = new Map(EGG_GROUP_KEYS.map((key, index) => [key, index]));
  const result = sourceKeys.map((sourceKey) => {
    if (!order.has(sourceKey as (typeof EGG_GROUP_KEYS)[number])) {
      mappingError("species.eggGroups", "unknown Egg Group source key " + sourceKey);
    }
    return sourceKey as (typeof EGG_GROUP_KEYS)[number];
  });
  return result.sort(
    (left, right) => (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function learnsetInventoryKey(record: ExtractedPokemonDbLearnsetEntry): string {
  return JSON.stringify([
    record.speciesSourceKey.normalize("NFC"),
    record.moveSourceKey.normalize("NFC"),
    record.sourceGeneration,
    record.sourceGame.normalize("NFC"),
    record.method,
    record.level,
    record.machineIdentifier?.normalize("NFC") ?? null,
  ]);
}

export function typeEffectivenessInventoryKey(
  record: ExtractedPokemonDbTypeEffectiveness,
): string {
  return "current:" + record.attackTypeSourceKey.normalize("NFC") + ":" + record.defenseTypeSourceKey.normalize("NFC");
}

function inventoryForMappedSurface(
  surface: "species" | "moves" | "types" | "abilities" | "items",
  discoveredSourceKeys: string[],
  extractedSourceKeys: string[],
  normalizedSourceKeys: string[],
  registry: MappingRegistry,
  exclusions: readonly ExcludedOrDeferredSourceKey[],
): SourceInventory {
  const discovered = new Set(discoveredSourceKeys.map((key) => key.normalize("NFC")));
  const entries = registry[surface];
  return {
    surface,
    discoveredSourceKeys: [...discovered],
    acceptedMappingKeys: entries
      .filter((entry) => entry.status === "accepted" && discovered.has(entry.sourceKey.normalize("NFC")))
      .map((entry) => entry.sourceKey),
    extractedSourceKeys,
    normalizedSourceKeys,
    excludedOrDeferred: exclusions.map((entry) => ({ ...entry })),
    candidateSourceKeys: entries
      .filter((entry) => entry.status === "candidate" && discovered.has(entry.sourceKey.normalize("NFC")))
      .map((entry) => entry.sourceKey),
  };
}

function directInventory(
  surface: "learnsets" | "type-effectiveness",
  discoveredSourceKeys: string[],
  extractedSourceKeys: string[],
  normalizedSourceKeys: string[],
  exclusions: readonly ExcludedOrDeferredSourceKey[],
): SourceInventory {
  const excluded = new Set(
    exclusions.map((entry) => entry.sourceKey.normalize("NFC")),
  );
  return {
    surface,
    discoveredSourceKeys: [...discoveredSourceKeys],
    acceptedMappingKeys: discoveredSourceKeys.filter(
      (key) => !excluded.has(key.normalize("NFC")),
    ),
    extractedSourceKeys: [...extractedSourceKeys],
    normalizedSourceKeys: [...normalizedSourceKeys],
    excludedOrDeferred: exclusions.map((entry) => ({ ...entry })),
    candidateSourceKeys: [],
  };
}

function ensureNoExcludedNormalizedKeys(
  exclusions: ExclusionsBySurface,
  normalizedBySurface: Record<CatalogSurface, Set<string>>,
): void {
  for (const [surface, entries] of Object.entries(exclusions) as Array<
    [CatalogSurface, readonly ExcludedOrDeferredSourceKey[]]
  >) {
    const normalized = normalizedBySurface[surface];
    for (const entry of entries) {
      if (normalized.has(entry.sourceKey.normalize("NFC"))) {
        mappingError(
          "exclusions." + surface + "." + entry.sourceKey,
          "excluded/deferred source key cannot also be normalized",
        );
      }
    }
  }
}

interface ExplicitZaBaseCooldownEvidence {
  value: number | null;
  sourceRecordId: string;
}

export function assertRawHistoricalScalarProofBinding(
  raw: RawExtractedSnapshot,
  record: ExtractedPokemonDbMove,
): HistoricalScalarProof {
  const selectedGame = record.mainlineSelectedGame;
  const selectedSourceRecordId = record.mainlineSelectedSourceRecordId;
  if (
    selectedGame === undefined ||
    selectedGame === "scarlet-violet" ||
    selectedSourceRecordId === undefined
  ) {
    throw new Error(`${record.sourceName}: historical scalar proof requires an explicit historical selected game/source`);
  }
  if (!Array.isArray(raw.historicalScalarProofs)) {
    throw new Error(`${record.sourceName}: raw historical scalar proof evidence is missing`);
  }
  const matches = raw.historicalScalarProofs.filter(
    (proof) =>
      proof.sourceKey.normalize("NFC") === record.sourceKey.normalize("NFC") &&
      proof.selectedGame === selectedGame &&
      proof.sourceRecordId === selectedSourceRecordId,
  );
  if (matches.length !== 1) {
    throw new Error(
      `${record.sourceName}: selected historical scalar proof must resolve to exactly one same-Move raw proof; found ${matches.length}`,
    );
  }
  const proof = matches[0];
  if (proof.sourceName.normalize("NFC") !== record.sourceName.normalize("NFC")) {
    throw new Error(`${record.sourceName}: selected historical scalar proof Move identity mismatch`);
  }
  if (
    proof.typeSourceKey.normalize("NFC") !== record.typeSourceKey.normalize("NFC") ||
    proof.category !== record.category ||
    proof.basePp !== record.basePp ||
    proof.power !== record.power ||
    proof.accuracy !== record.accuracy
  ) {
    throw new Error(`${record.sourceName}: selected historical scalar proof tuple does not match normalized Move facts`);
  }
  return proof;
}

function explicitMainlineSourceRecordIds(
  record: ExtractedPokemonDbMove,
  sourceRecords: SourceRecord[],
  raw: RawExtractedSnapshot,
): string[] {
  if (!Object.prototype.hasOwnProperty.call(record, "mainlineSourceRecordIds")) {
    mappingError(
      "catalogs.moves." + record.sourceKey + ".mainlineSourceRecordIds",
      "explicit Bulbapedia traditional-mainline evidence is required before Move normalization",
    );
  }
  const ids = record.mainlineSourceRecordIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    mappingError(
      "catalogs.moves." + record.sourceKey + ".mainlineSourceRecordIds",
      "must contain at least the Generation IX Bulbapedia SourceRecord ID",
    );
  }
  const normalized = ids.map((id, index) => {
    if (typeof id !== "string" || id.trim().length === 0) {
      mappingError(
        "catalogs.moves." + record.sourceKey + `.mainlineSourceRecordIds[${index}]`,
        "must be a non-empty SourceRecord ID",
      );
    }
    return id;
  });
  if (new Set(normalized).size !== normalized.length) {
    mappingError(
      "catalogs.moves." + record.sourceKey + ".mainlineSourceRecordIds",
      "must not contain duplicate SourceRecord IDs",
    );
  }
  const sourceById = new Map(sourceRecords.map((source) => [source.id, source]));
  const hasBulbapediaSource = (canonicalUrl: string, parserVersion: string): boolean =>
    normalized.some((id) => {
      const source = sourceById.get(id);
      return (
        source?.provider === "bulbapedia" &&
        new URL(source.canonicalUrl).href === new URL(canonicalUrl).href &&
        source.parserVersion === parserVersion
      );
    });

  if (!hasBulbapediaSource(BULBAPEDIA_GEN9_MOVE_LIST_URL, BULBAPEDIA_GEN9_MOVE_PARSER_VERSION)) {
    mappingError(
      "catalogs.moves." + record.sourceKey + ".mainlineSourceRecordIds",
      "must include the canonical Generation IX Bulbapedia source with its approved parser version",
    );
  }

  const selectedSourceRecordId = record.mainlineSelectedSourceRecordId;
  if (
    typeof selectedSourceRecordId !== "string" ||
    !normalized.includes(selectedSourceRecordId)
  ) {
    mappingError(
      "catalogs.moves." + record.sourceKey + ".mainlineSelectedSourceRecordId",
      "must identify one of the explicit mainline SourceRecord IDs",
    );
  }
  const selectedGame = record.mainlineSelectedGame;
  const historicalGames = [
    "brilliant-diamond-shining-pearl",
    "sword-shield",
    "ultra-sun-ultra-moon",
    "sun-moon",
  ] as const;
  if (selectedGame !== "scarlet-violet" && !historicalGames.includes(selectedGame as typeof historicalGames[number])) {
    mappingError(
      "catalogs.moves." + record.sourceKey + ".mainlineSelectedGame",
      "unsupported MOVE-01 selected game",
    );
  }
  const selectedSource = sourceById.get(selectedSourceRecordId);
  let selectedMatches = false;
  if (selectedSource?.provider === "bulbapedia") {
    try {
      const selectedUrl = new URL(selectedSource.canonicalUrl);
      if (selectedGame === "scarlet-violet") {
        selectedMatches =
          selectedUrl.href === new URL(BULBAPEDIA_GEN9_MOVE_LIST_URL).href &&
          selectedSource.parserVersion === BULBAPEDIA_GEN9_MOVE_PARSER_VERSION;
      } else if (selectedGame === "brilliant-diamond-shining-pearl") {
        selectedMatches =
          selectedSource.parserVersion === BULBAPEDIA_GEN8_LEARNSET_PARSER_VERSION &&
          selectedUrl.protocol === "https:" &&
          selectedUrl.hostname === "bulbapedia.bulbagarden.net" &&
          /^\/wiki\/[^/]+_\(Pok%C3%A9mon\)\/Generation_VIII_learnset$/u.test(selectedUrl.pathname) &&
          selectedUrl.search === "" &&
          selectedUrl.hash === "";
      } else {
        selectedMatches =
          selectedSource.parserVersion === BULBAPEDIA_HISTORICAL_SCALAR_PROOF_PARSER_VERSION &&
          selectedUrl.href ===
            new URL(
              buildBulbapediaHistoricalScalarProofUrl(
                record.sourceName,
                selectedGame as HistoricalScalarSelectedGame,
              ),
            ).href;
      }
    } catch {
      selectedMatches = false;
    }
  }
  if (!selectedMatches) {
    mappingError(
      "catalogs.moves." + record.sourceKey + ".mainlineSelectedGame",
      "selected game/source evidence does not match the approved MOVE-01 source surface",
    );
  }
  if (selectedGame !== "scarlet-violet") {
    try {
      assertRawHistoricalScalarProofBinding(raw, record);
    } catch (error) {
      mappingError(
        "catalogs.moves." + record.sourceKey + ".mainlineSelectedSourceRecordId",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (selectedGame === "brilliant-diamond-shining-pearl" || selectedGame === "sword-shield") {
    if (
      !hasBulbapediaSource(
        BULBAPEDIA_GEN8_MOVE_LIST_URL,
        BULBAPEDIA_HISTORICAL_MOVE_PARSER_VERSION,
      )
    ) {
      mappingError(
        "catalogs.moves." + record.sourceKey + ".mainlineSourceRecordIds",
        "historical Generation VIII selection must preserve the consulted Generation VIII availability source",
      );
    }
  }
  if (selectedGame === "ultra-sun-ultra-moon" || selectedGame === "sun-moon") {
    if (
      !hasBulbapediaSource(
        BULBAPEDIA_GEN8_MOVE_LIST_URL,
        BULBAPEDIA_HISTORICAL_MOVE_PARSER_VERSION,
      ) ||
      !hasBulbapediaSource(
        BULBAPEDIA_GEN7_MOVE_LIST_URL,
        BULBAPEDIA_HISTORICAL_MOVE_PARSER_VERSION,
      )
    ) {
      mappingError(
        "catalogs.moves." + record.sourceKey + ".mainlineSourceRecordIds",
        "historical Generation VII selection must preserve both consulted Generation VIII and Generation VII availability sources",
      );
    }
  }

  const sourceTargetSourceRecordId =
    record.sourceTargetSourceRecordId ?? record.sourceRecordId;
  const makesContactSourceRecordId =
    record.makesContactSourceRecordId ?? record.sourceRecordId;
  const pokemonDbComplementMatches = (sourceRecordId: string): boolean => {
    const source = sourceById.get(sourceRecordId);
    if (source?.provider !== "pokemondb") return false;
    try {
      const url = new URL(source.canonicalUrl);
      return (
        url.pathname.startsWith("/move/") &&
        source.parserVersion === "pokemondb-html-v2"
      );
    } catch {
      return false;
    }
  };
  const bulbapediaTargetMatches = (sourceRecordId: string): boolean => {
    const source = sourceById.get(sourceRecordId);
    if (
      source?.provider !== "bulbapedia" ||
      source.parserVersion !== BULBAPEDIA_MOVE_TARGET_PARSER_VERSION
    ) return false;
    try {
      return (
        new URL(source.canonicalUrl).href ===
        new URL(buildBulbapediaMoveTargetUrl(record.sourceName)).href
      );
    } catch {
      return false;
    }
  };
  if (!pokemonDbComplementMatches(makesContactSourceRecordId)) {
    mappingError(
      "catalogs.moves." + record.sourceKey + ".makesContactSourceRecordId",
      "makesContact complement must resolve to a PokémonDB Move-page SourceRecord",
    );
  }
  if (
    !pokemonDbComplementMatches(sourceTargetSourceRecordId) &&
    !bulbapediaTargetMatches(sourceTargetSourceRecordId)
  ) {
    mappingError(
      "catalogs.moves." + record.sourceKey + ".sourceTargetSourceRecordId",
      "sourceTarget complement must resolve to either a PokémonDB Move page or the exact versioned Bulbapedia Move target fallback page",
    );
  }
  return normalized;
}

function explicitZaBaseCooldownEvidence(
  record: ExtractedPokemonDbMove,
): ExplicitZaBaseCooldownEvidence {
  if (!Object.prototype.hasOwnProperty.call(record, "zaBaseCooldownMs")) {
    mappingError(
      "catalogs.moves." + record.sourceKey + ".zaBaseCooldownMs",
      "explicit Z-A Base Cooldown input is required before Move normalization; provide an integer millisecond value or explicit null",
    );
  }
  if (!Object.prototype.hasOwnProperty.call(record, "zaBaseCooldownSourceRecordId")) {
    mappingError(
      "catalogs.moves." + record.sourceKey + ".zaBaseCooldownSourceRecordId",
      "explicit Z-A Base Cooldown source evidence is required before Move normalization",
    );
  }
  const sourceRecordId = record.zaBaseCooldownSourceRecordId;
  if (typeof sourceRecordId !== "string" || sourceRecordId.trim().length === 0) {
    mappingError(
      "catalogs.moves." + record.sourceKey + ".zaBaseCooldownSourceRecordId",
      "must be a non-empty SourceRecord ID",
    );
  }
  const value = record.zaBaseCooldownMs;
  if (value === null) return { value: null, sourceRecordId };
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    mappingError(
      "catalogs.moves." + record.sourceKey + ".zaBaseCooldownMs",
      "must be a non-negative integer millisecond value or explicit null",
    );
  }
  return { value, sourceRecordId };
}

export function normalizeRawExtractedSnapshot(
  rawInput: RawExtractedSnapshot,
  sourceRecords: SourceRecord[],
  baseRegistry: MappingRegistry,
  exclusions: ExclusionsBySurface = {},
): NormalizationResult {
  const raw: RawExtractedSnapshot = {
    ...rawInput,
    species: uniqueBySourceKey([...rawInput.species], "raw.species"),
    moves: uniqueBySourceKey([...rawInput.moves], "raw.moves"),
    types: uniqueBySourceKey([...rawInput.types], "raw.types"),
    abilities: uniqueBySourceKey([...rawInput.abilities], "raw.abilities"),
    items: uniqueBySourceKey([...rawInput.items], "raw.items"),
    historicalScalarProofs: [...rawInput.historicalScalarProofs],
  };
  const mappingRegistry = proposePrimaryMappings(raw, baseRegistry);
  const speciesMap = mappingBySource(mappingRegistry.species);
  const moveMap = mappingBySource(mappingRegistry.moves);
  const typeMap = mappingBySource(mappingRegistry.types);
  const abilityMap = mappingBySource(mappingRegistry.abilities);
  const itemMap = mappingBySource(mappingRegistry.items);

  const species = raw.species.map((record) => {
    const mapping = speciesMap.get(record.sourceKey.normalize("NFC"));
    if (!mapping) mappingError("catalogs.species", "missing Species mapping " + record.sourceKey);
    return {
      id: mapping.canonicalId as SpeciesId,
      sourceName: record.sourceName,
      sourceSlug: record.sourceSlug,
      nationalDexNumber: record.nationalDexNumber,
      introducedGeneration: record.introducedGeneration,
      formLabel: record.formLabel,
      baseSpeciesId: mapping.baseSpeciesId,
      typeIds: record.typeSourceKeys.map((key) =>
        idFor<TypeId>(typeMap, key, "catalogs.species." + record.sourceKey + ".typeIds"),
      ),
      baseStats: record.baseStats,
      abilities: record.abilities.map((assignment) => ({
        abilityId: idFor<AbilityId>(
          abilityMap,
          assignment.abilitySourceKey,
          "catalogs.species." + record.sourceKey + ".abilities",
        ),
        sourceAbilitySlot: assignment.sourceAbilitySlot,
      })),
      catchRate: record.catchRate,
      baseExperience: record.baseExperience,
      growthRate: record.growthRate,
      heightMillimeters: record.heightMillimeters,
      weightGrams: record.weightGrams,
      eggGroups: canonicalEggGroups(record.eggGroupSourceKeys),
      genderRatio: record.genderRatio,
      eggCycles: record.eggCycles,
      evYield: record.evYield,
      baseFriendship: record.baseFriendship,
      sourceRecordIds: sourceRecordIdsFor(record),
    };
  });

  const moves = raw.moves.map((record) => {
    const zaEvidence = explicitZaBaseCooldownEvidence(record);
    const mainlineSourceRecordIds = explicitMainlineSourceRecordIds(record, sourceRecords, raw);
    const sourceTargetSourceRecordId =
      record.sourceTargetSourceRecordId ?? record.sourceRecordId;
    const makesContactSourceRecordId =
      record.makesContactSourceRecordId ?? record.sourceRecordId;
    return {
      id: idFor<MoveId>(moveMap, record.sourceKey, "catalogs.moves"),
      typeId: idFor<TypeId>(typeMap, record.typeSourceKey, "catalogs.moves." + record.sourceKey + ".typeId"),
      category: record.category,
      power: record.power,
      accuracy: record.accuracy,
      basePp: record.basePp,
      sourceTarget: record.sourceTarget,
      makesContact: record.makesContact,
      zaBaseCooldownMs: zaEvidence.value,
      sourceRecordIds: [...new Set([
        ...mainlineSourceRecordIds,
        sourceTargetSourceRecordId,
        makesContactSourceRecordId,
        zaEvidence.sourceRecordId,
      ])],
    };
  });

  const moveFactSources = raw.moves.map((record) => {
    const sourceTargetSourceRecordId =
      record.sourceTargetSourceRecordId ?? record.sourceRecordId;
    const makesContactSourceRecordId =
      record.makesContactSourceRecordId ?? record.sourceRecordId;
    return {
      moveId: idFor<MoveId>(moveMap, record.sourceKey, "provenance.moveFactSources"),
      mainline: {
        selectedGame: record.mainlineSelectedGame!,
        sourceRecordId: record.mainlineSelectedSourceRecordId!,
      },
      sourceTargetSourceRecordId,
      makesContactSourceRecordId,
      zaBaseCooldownSourceRecordId: record.zaBaseCooldownSourceRecordId!,
    };
  });

  const types = raw.types.map((record) => ({
    id: idFor<TypeId>(typeMap, record.sourceKey, "catalogs.types"),
    sourceName: record.sourceName,
    sourceSlug: record.sourceSlug,
    sourceRecordIds: sourceRecordIdsFor(record),
  }));

  const abilities = raw.abilities.map((record) => ({
    id: idFor<AbilityId>(abilityMap, record.sourceKey, "catalogs.abilities"),
    sourceName: record.sourceName,
    sourceSlug: record.sourceSlug,
    introducedGeneration: record.introducedGeneration,
    sourceRecordIds: sourceRecordIdsFor(record),
  }));

  const items = raw.items.map((record) => ({
    id: idFor<ItemId>(itemMap, record.sourceKey, "catalogs.items"),
    sourceName: record.sourceName,
    sourceSlug: record.sourceSlug,
    sourceCategory: record.sourceCategory,
    sourceRecordIds: sourceRecordIdsFor(record),
  }));

  const learnsets = raw.learnsets.map((record) => ({
    speciesId: idFor<SpeciesId>(
      speciesMap,
      record.speciesSourceKey,
      "catalogs.learnsets.speciesId",
    ),
    moveId: idFor<MoveId>(moveMap, record.moveSourceKey, "catalogs.learnsets.moveId"),
    sourceGeneration: record.sourceGeneration,
    sourceGame: record.sourceGame,
    method: record.method,
    level: record.level,
    machineIdentifier: record.machineIdentifier,
    sourceRecordIds: sourceRecordIdsFor(record),
  }));

  const currentTypeEffectiveness = raw.currentTypeEffectiveness.map((record) => ({
    attackTypeId: idFor<TypeId>(
      typeMap,
      record.attackTypeSourceKey,
      "referenceData.currentTypeEffectiveness.attackTypeId",
    ),
    defenseTypeId: idFor<TypeId>(
      typeMap,
      record.defenseTypeSourceKey,
      "referenceData.currentTypeEffectiveness.defenseTypeId",
    ),
    multiplier: record.multiplier,
    sourceRecordIds: sourceRecordIdsFor(record),
  }));

  const speciesDiscovered = [
    ...raw.speciesDiscovery.map((entry) => entry.sourceKey),
    ...(raw.discovery.species ?? []),
  ];
  const learnsetKeys = raw.learnsets.map(learnsetInventoryKey);
  const matrixKeys = raw.currentTypeEffectiveness.map(typeEffectivenessInventoryKey);
  const inventories: SourceInventory[] = [
    inventoryForMappedSurface(
      "species",
      speciesDiscovered,
      raw.species.map((record) => record.sourceKey),
      raw.species.map((record) => record.sourceKey),
      mappingRegistry,
      exclusions.species ?? [],
    ),
    inventoryForMappedSurface(
      "moves",
      raw.discovery.moves,
      raw.moves.map((record) => record.sourceKey),
      raw.moves.map((record) => record.sourceKey),
      mappingRegistry,
      exclusions.moves ?? [],
    ),
    inventoryForMappedSurface(
      "types",
      raw.discovery.types,
      raw.types.map((record) => record.sourceKey),
      raw.types.map((record) => record.sourceKey),
      mappingRegistry,
      exclusions.types ?? [],
    ),
    inventoryForMappedSurface(
      "abilities",
      raw.discovery.abilities,
      raw.abilities.map((record) => record.sourceKey),
      raw.abilities.map((record) => record.sourceKey),
      mappingRegistry,
      exclusions.abilities ?? [],
    ),
    inventoryForMappedSurface(
      "items",
      raw.discovery.items,
      raw.items.map((record) => record.sourceKey),
      raw.items.map((record) => record.sourceKey),
      mappingRegistry,
      exclusions.items ?? [],
    ),
    directInventory(
      "learnsets",
      raw.discovery.learnsets,
      learnsetKeys,
      learnsetKeys,
      exclusions.learnsets ?? [],
    ),
    directInventory(
      "type-effectiveness",
      raw.discovery.currentTypeEffectiveness,
      matrixKeys,
      matrixKeys,
      exclusions["type-effectiveness"] ?? [],
    ),
  ];

  ensureNoExcludedNormalizedKeys(exclusions, {
    species: new Set(raw.species.map((record) => record.sourceKey.normalize("NFC"))),
    moves: new Set(raw.moves.map((record) => record.sourceKey.normalize("NFC"))),
    types: new Set(raw.types.map((record) => record.sourceKey.normalize("NFC"))),
    abilities: new Set(raw.abilities.map((record) => record.sourceKey.normalize("NFC"))),
    items: new Set(raw.items.map((record) => record.sourceKey.normalize("NFC"))),
    learnsets: new Set(learnsetKeys.map((key) => key.normalize("NFC"))),
    "type-effectiveness": new Set(matrixKeys.map((key) => key.normalize("NFC"))),
  });

  const candidate = parseGameDataCandidate({
    schemaVersion: SCHEMA_VERSION,
    normalizerVersion: NORMALIZER_VERSION,
    catalogs: { species, moves, types, abilities, items, learnsets },
    referenceData: { currentTypeEffectiveness },
    provenance: finalizeProvenance({
      sourceRecords,
      moveFactSources,
      inventories,
    }),
  });
  return { candidate, mappingRegistry };
}

export interface CandidateValidationReport {
  candidateValid: boolean;
  publicationReady: boolean;
  findings: ValidationFinding[];
}
