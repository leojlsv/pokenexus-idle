import type {
  AbilityId,
  ItemId,
  MoveId,
  SpeciesId,
  StatBlock,
  TypeId,
} from "@pokenexus/game-types";
import { BULBAPEDIA_GEN8_LEARNSET_PARSER_VERSION } from "./bulbapedia-learnset-parser.js";
import { BULBAPEDIA_MOVE_TARGET_PARSER_VERSION } from "./bulbapedia-move-target.js";
import {
  BULBAPEDIA_HISTORICAL_SCALAR_PROOF_PARSER_VERSION,
  BULBAPEDIA_SM_TRADITIONAL_CUTOFF,
  BULBAPEDIA_SWSH_TRADITIONAL_CUTOFF,
  BULBAPEDIA_USUM_TRADITIONAL_CUTOFF,
} from "./bulbapedia-historical-scalar-proof.js";
import { reconcileSourceInventory } from "./reconciliation.js";

export const SCHEMA_VERSION = "3" as const;
export const SOURCE_PROVIDERS = ["bulbapedia", "pokemondb"] as const;
export type SourceProvider = (typeof SOURCE_PROVIDERS)[number];

export const EGG_GROUP_KEYS = [
  "monster",
  "water-1",
  "bug",
  "flying",
  "field",
  "fairy",
  "grass",
  "human-like",
  "water-3",
  "mineral",
  "amorphous",
  "water-2",
  "ditto",
  "dragon",
  "undiscovered",
] as const;

export type EggGroupKey = (typeof EGG_GROUP_KEYS)[number];

export const ABILITY_SLOTS = ["normal-1", "normal-2", "hidden"] as const;
export type AbilitySlot = (typeof ABILITY_SLOTS)[number];

export const MOVE_CATEGORIES = ["physical", "special", "status"] as const;
export type MoveSourceCategory = (typeof MOVE_CATEGORIES)[number];

export const MOVE_TARGETS = [
  "any-adjacent",
  "any-other",
  "self-or-adjacent-ally",
  "adjacent-ally",
  "adjacent-foe",
  "all-adjacent",
  "all-adjacent-foes",
  "self",
  "self-and-allies",
  "all-allies",
  "all-pokemon",
  "random-opponent",
  "entire-field",
  "opponents-side",
  "users-side",
  "varies",
] as const;
export type MoveTargetClassification = (typeof MOVE_TARGETS)[number];

export const MOVE_MAINLINE_GAMES = [
  "scarlet-violet",
  "brilliant-diamond-shining-pearl",
  "sword-shield",
  "ultra-sun-ultra-moon",
  "sun-moon",
] as const;
export type MoveMainlineGame = (typeof MOVE_MAINLINE_GAMES)[number];

export const LEARN_METHODS = [
  "level-up",
  "evolution",
  "machine",
  "egg",
  "tutor",
  "transfer",
  "reminder",
] as const;
export type LearnMethod = (typeof LEARN_METHODS)[number];

export const GROWTH_RATES = [
  "slow",
  "medium-slow",
  "medium-fast",
  "fast",
  "erratic",
  "fluctuating",
] as const;
export type GrowthRate = (typeof GROWTH_RATES)[number];

export type SourceFact<T> =
  | { status: "known"; value: T }
  | { status: "source-unavailable" };

export type GenderRatio =
  | { kind: "genderless" }
  | {
      kind: "ratio";
      maleBasisPoints: number;
      femaleBasisPoints: number;
    };

export interface AbilityAssignment {
  abilityId: AbilityId;
  sourceAbilitySlot: AbilitySlot;
}

export interface SpeciesDefinitionV2 {
  id: SpeciesId;
  sourceName: string;
  sourceSlug: string;
  nationalDexNumber: number;
  introducedGeneration: number;
  formLabel: string | null;
  baseSpeciesId: SpeciesId | null;
  typeIds: TypeId[];
  baseStats: StatBlock<number>;
  abilities: AbilityAssignment[];
  catchRate: number;
  baseExperience: SourceFact<number>;
  growthRate: GrowthRate;
  heightMillimeters: number;
  weightGrams: number;
  eggGroups: EggGroupKey[];
  genderRatio: GenderRatio;
  eggCycles: SourceFact<number>;
  evYield: StatBlock<number>;
  baseFriendship: SourceFact<number>;
  sourceRecordIds: string[];
}

export interface MoveDefinitionV1 {
  id: MoveId;
  typeId: TypeId;
  category: MoveSourceCategory;
  power: number | null;
  accuracy: number | null;
  basePp: number;
  sourceTarget: MoveTargetClassification;
  makesContact: boolean;
  zaBaseCooldownMs: number | null;
  sourceRecordIds: string[];
}

export interface TypeDefinitionV1 {
  id: TypeId;
  sourceName: string;
  sourceSlug: string;
  sourceRecordIds: string[];
}

export interface AbilityDefinitionV1 {
  id: AbilityId;
  sourceName: string;
  sourceSlug: string;
  introducedGeneration: number | null;
  sourceRecordIds: string[];
}

export interface ItemDefinitionV1 {
  id: ItemId;
  sourceName: string;
  sourceSlug: string;
  sourceCategory: string | null;
  sourceRecordIds: string[];
}

export interface LearnsetEntryV1 {
  speciesId: SpeciesId;
  moveId: MoveId;
  sourceGeneration: number;
  sourceGame: string;
  method: LearnMethod;
  level: number | null;
  machineIdentifier: string | null;
  sourceRecordIds: string[];
}

export interface TypeEffectivenessEntry {
  attackTypeId: TypeId;
  defenseTypeId: TypeId;
  multiplier: 0 | 0.5 | 1 | 2;
  sourceRecordIds: string[];
}

export type CatalogSurface =
  | "species"
  | "moves"
  | "types"
  | "abilities"
  | "items"
  | "learnsets"
  | "type-effectiveness";

export interface ExcludedOrDeferredSourceKey {
  sourceKey: string;
  disposition: "excluded" | "deferred";
  reason: string;
}

export interface SourceInventory {
  surface: CatalogSurface;
  discoveredSourceKeys: string[];
  acceptedMappingKeys: string[];
  extractedSourceKeys: string[];
  normalizedSourceKeys: string[];
  excludedOrDeferred: ExcludedOrDeferredSourceKey[];
  candidateSourceKeys: string[];
  previousAcceptedMappingKeys?: string[];
}

export interface SourceRecord {
  id: string;
  provider: SourceProvider;
  canonicalUrl: string;
  fetchedAt: string;
  parserVersion: string;
  sourceContentHash: string;
  fetchStatus: "fetched" | "cache";
}

export interface MoveFactSourceRelation {
  moveId: MoveId;
  mainline: {
    selectedGame: MoveMainlineGame;
    sourceRecordId: string;
  };
  sourceTargetSourceRecordId: string;
  makesContactSourceRecordId: string;
  zaBaseCooldownSourceRecordId: string;
}

export interface ProvenanceManifest {
  sourceRecords: SourceRecord[];
  moveFactSources: MoveFactSourceRelation[];
  inventories: SourceInventory[];
  sourceInventoryHash: string;
  provenanceHash?: string;
}

export interface MappingEntry<TId extends string> {
  sourceKey: string;
  canonicalId: TId;
  status: "accepted" | "candidate";
}

export interface SpeciesMappingEntry extends MappingEntry<SpeciesId> {
  baseSpeciesId: SpeciesId | null;
}

export interface MappingRegistry {
  species: SpeciesMappingEntry[];
  moves: MappingEntry<MoveId>[];
  types: MappingEntry<TypeId>[];
  abilities: MappingEntry<AbilityId>[];
  items: MappingEntry<ItemId>[];
}

export interface GameDataCandidate {
  schemaVersion: typeof SCHEMA_VERSION;
  normalizerVersion: string;
  catalogs: {
    species: SpeciesDefinitionV2[];
    moves: MoveDefinitionV1[];
    types: TypeDefinitionV1[];
    abilities: AbilityDefinitionV1[];
    items: ItemDefinitionV1[];
    learnsets: LearnsetEntryV1[];
  };
  referenceData: {
    currentTypeEffectiveness: TypeEffectivenessEntry[];
  };
  provenance: ProvenanceManifest;
}

export interface ArtifactDescriptor {
  logicalName: string;
  contentHash: string;
  recordCount: number;
}

export interface GameDataManifest {
  schemaVersion: typeof SCHEMA_VERSION;
  gameDataVersion: string;
  bundleHash: string;
  provenanceHash: string;
  publishedAt: string;
  normalizerVersion: string;
  artifacts: ArtifactDescriptor[];
  provenanceManifest: {
    logicalName: "provenance";
    path: "provenance.json";
    contentHash: string;
  };
  sourceInventory: {
    logicalName: "source-inventory";
    path: "source-inventory.json";
    contentHash: string;
  };
  catalogCounts: {
    species: number;
    moves: number;
    types: number;
    abilities: number;
    items: number;
    learnsets: number;
    currentTypeEffectiveness: number;
  };
}

export interface ValidationFinding {
  code: string;
  path: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  findings: ValidationFinding[];
}

export class GameDataValidationError extends Error {
  readonly finding: ValidationFinding;

  constructor(finding: ValidationFinding) {
    super(`${finding.path}: ${finding.message}`);
    this.name = "GameDataValidationError";
    this.finding = finding;
  }
}

const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
const BULBAPEDIA_ZA_MOVE_LIST_PATH = "/wiki/List_of_moves_in_Pokémon_Legends:_Z-A";
const BULBAPEDIA_GEN9_MOVE_LIST_PATH =
  "/wiki/List_of_moves_by_availability_in_Generation_IX";
const BULBAPEDIA_ZA_MOVE_PARSER_VERSION = "bulbapedia-za-move-list-v1";
const BULBAPEDIA_GEN9_MOVE_PARSER_VERSION = "bulbapedia-gen9-move-availability-v1";
const POKEMONDB_MOVE_PARSER_VERSION = "pokemondb-html-v2";

function fail(path: string, message: string, code = "invalid-value"): never {
  throw new GameDataValidationError({ code, path, message });
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "must be an object");
  }
}

function asString(value: unknown, path: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.length === 0) fail(path, "must be a non-empty string");
  return value.normalize("NFC");
}

function asInteger(value: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(path, `must be an integer in [${min}, ${max}]`);
  }
  return value;
}

function asOptionalInteger(value: unknown, path: string, min: number): number | null {
  if (value === null) return null;
  return asInteger(value, path, min);
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be boolean");
  return value;
}

function asEnum<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    fail(path, `must be one of: ${values.join(", ")}`);
  }
  return value as T[number];
}

function asStringArray(value: unknown, path: string, minLength = 1): string[] {
  if (!Array.isArray(value) || value.length < minLength) fail(path, `must contain at least ${minLength} value(s)`);
  const result = value.map((item, index) => asString(item, `${path}[${index}]`) as string);
  if (new Set(result).size !== result.length) fail(path, "must not contain duplicates");
  return result;
}

function parseStatBlock(value: unknown, path: string, min: number): StatBlock<number> {
  assertRecord(value, path);
  const keys = Object.keys(value).sort();
  if (keys.length !== STAT_KEYS.length || !STAT_KEYS.every((key) => keys.includes(key))) {
    fail(path, "must contain exactly hp, atk, def, spa, spd, spe");
  }
  return {
    hp: asInteger(value.hp, `${path}.hp`, min),
    atk: asInteger(value.atk, `${path}.atk`, min),
    def: asInteger(value.def, `${path}.def`, min),
    spa: asInteger(value.spa, `${path}.spa`, min),
    spd: asInteger(value.spd, `${path}.spd`, min),
    spe: asInteger(value.spe, `${path}.spe`, min),
  };
}

function parseSourceFact(value: unknown, path: string, knownParser: (value: unknown, path: string) => number): SourceFact<number> {
  assertRecord(value, path);
  if (value.status === "source-unavailable") {
    if (Object.keys(value).length !== 1) fail(path, "source-unavailable must not carry a value");
    return { status: "source-unavailable" };
  }
  if (value.status === "known") {
    if (Object.keys(value).length !== 2 || !("value" in value)) {
      fail(path, "known SourceFact must contain exactly status and value");
    }
    return { status: "known", value: knownParser(value.value, `${path}.value`) };
  }
  fail(path, "must be a recognized SourceFact variant");
}

function parseGenderRatio(value: unknown): GenderRatio {
  assertRecord(value, "genderRatio");
  if (value.kind === "genderless") {
    if (Object.keys(value).length !== 1) fail("genderRatio", "genderless must not carry ratio values");
    return { kind: "genderless" };
  }
  if (value.kind !== "ratio") fail("genderRatio", "unknown gender-ratio variant");
  const maleBasisPoints = asInteger(value.maleBasisPoints, "genderRatio.maleBasisPoints", 0, 10000);
  const femaleBasisPoints = asInteger(value.femaleBasisPoints, "genderRatio.femaleBasisPoints", 0, 10000);
  if (maleBasisPoints + femaleBasisPoints !== 10000) fail("genderRatio", "ratio basis points must sum to 10000");
  return { kind: "ratio", maleBasisPoints, femaleBasisPoints };
}

function parseEggGroups(value: unknown): EggGroupKey[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) fail("eggGroups", "must contain one or two keys");
  const groups = value.map((group, index) => asEnum(group, EGG_GROUP_KEYS, `eggGroups[${index}]`));
  if (new Set(groups).size !== groups.length) fail("eggGroups", "must not contain duplicates");
  const positions = groups.map((group) => EGG_GROUP_KEYS.indexOf(group));
  if (positions.some((position, index) => index > 0 && position <= positions[index - 1])) {
    fail("eggGroups", "must use fixed canonical enum order");
  }
  return groups;
}

function parseAbilityAssignments(value: unknown): AbilityAssignment[] {
  if (!Array.isArray(value) || value.length < 1) fail("abilities", "must contain at least one assignment");
  const seenSlots = new Set<string>();
  const seenIds = new Set<string>();
  return value.map((entry, index) => {
    assertRecord(entry, `abilities[${index}]`);
    const abilityId = asString(entry.abilityId, `abilities[${index}].abilityId`) as AbilityId;
    const sourceAbilitySlot = asEnum(entry.sourceAbilitySlot, ABILITY_SLOTS, `abilities[${index}].sourceAbilitySlot`);
    if (seenSlots.has(sourceAbilitySlot)) fail(`abilities[${index}].sourceAbilitySlot`, "duplicate source Ability slot");
    if (seenIds.has(abilityId)) fail(`abilities[${index}].abilityId`, "duplicate Ability assignment");
    seenSlots.add(sourceAbilitySlot);
    seenIds.add(abilityId);
    return { abilityId, sourceAbilitySlot };
  });
}

export function parseSpeciesDefinitionV2(value: unknown): SpeciesDefinitionV2 {
  assertRecord(value, "species");
  const typeIds = asStringArray(value.typeIds, "typeIds", 1).map((id) => id as TypeId);
  if (typeIds.length > 2) fail("typeIds", "must contain one or two TypeIds");
  return {
    id: asString(value.id, "id") as SpeciesId,
    sourceName: asString(value.sourceName, "sourceName") as string,
    sourceSlug: asString(value.sourceSlug, "sourceSlug") as string,
    nationalDexNumber: asInteger(value.nationalDexNumber, "nationalDexNumber", 1),
    introducedGeneration: asInteger(value.introducedGeneration, "introducedGeneration", 1),
    formLabel: asString(value.formLabel, "formLabel", true),
    baseSpeciesId: asString(value.baseSpeciesId, "baseSpeciesId", true) as SpeciesId | null,
    typeIds,
    baseStats: parseStatBlock(value.baseStats, "baseStats", 1),
    abilities: parseAbilityAssignments(value.abilities),
    catchRate: asInteger(value.catchRate, "catchRate", 0),
    baseExperience: parseSourceFact(value.baseExperience, "baseExperience", (entry, path) => asInteger(entry, path, 0)),
    growthRate: asEnum(value.growthRate, GROWTH_RATES, "growthRate"),
    heightMillimeters: asInteger(value.heightMillimeters, "heightMillimeters", 1),
    weightGrams: asInteger(value.weightGrams, "weightGrams", 1),
    eggGroups: parseEggGroups(value.eggGroups),
    genderRatio: parseGenderRatio(value.genderRatio),
    eggCycles: parseSourceFact(value.eggCycles, "eggCycles", (entry, path) => asInteger(entry, path, 1)),
    evYield: parseStatBlock(value.evYield, "evYield", 0),
    baseFriendship: parseSourceFact(value.baseFriendship, "baseFriendship", (entry, path) => asInteger(entry, path, 0, 255)),
    sourceRecordIds: asStringArray(value.sourceRecordIds, "sourceRecordIds"),
  };
}

export function parseMoveDefinitionV1(value: unknown): MoveDefinitionV1 {
  assertRecord(value, "move");
  return {
    id: asString(value.id, "id") as MoveId,
    typeId: asString(value.typeId, "typeId") as TypeId,
    category: asEnum(value.category, MOVE_CATEGORIES, "category"),
    power: asOptionalInteger(value.power, "power", 0),
    accuracy: asOptionalInteger(value.accuracy, "accuracy", 1),
    basePp: asInteger(value.basePp, "basePp", 1),
    sourceTarget: asEnum(value.sourceTarget, MOVE_TARGETS, "sourceTarget"),
    makesContact: asBoolean(value.makesContact, "makesContact"),
    zaBaseCooldownMs: asOptionalInteger(value.zaBaseCooldownMs, "zaBaseCooldownMs", 0),
    sourceRecordIds: asStringArray(value.sourceRecordIds, "sourceRecordIds"),
  };
}

export function parseTypeDefinitionV1(value: unknown): TypeDefinitionV1 {
  assertRecord(value, "type");
  return {
    id: asString(value.id, "id") as TypeId,
    sourceName: asString(value.sourceName, "sourceName") as string,
    sourceSlug: asString(value.sourceSlug, "sourceSlug") as string,
    sourceRecordIds: asStringArray(value.sourceRecordIds, "sourceRecordIds"),
  };
}

export function parseAbilityDefinitionV1(value: unknown): AbilityDefinitionV1 {
  assertRecord(value, "ability");
  return {
    id: asString(value.id, "id") as AbilityId,
    sourceName: asString(value.sourceName, "sourceName") as string,
    sourceSlug: asString(value.sourceSlug, "sourceSlug") as string,
    introducedGeneration: value.introducedGeneration === null ? null : asInteger(value.introducedGeneration, "introducedGeneration", 1),
    sourceRecordIds: asStringArray(value.sourceRecordIds, "sourceRecordIds"),
  };
}

export function parseItemDefinitionV1(value: unknown): ItemDefinitionV1 {
  assertRecord(value, "item");
  return {
    id: asString(value.id, "id") as ItemId,
    sourceName: asString(value.sourceName, "sourceName") as string,
    sourceSlug: asString(value.sourceSlug, "sourceSlug") as string,
    sourceCategory: asString(value.sourceCategory, "sourceCategory", true),
    sourceRecordIds: asStringArray(value.sourceRecordIds, "sourceRecordIds"),
  };
}

export function parseLearnsetEntryV1(value: unknown): LearnsetEntryV1 {
  assertRecord(value, "learnset");
  const method = asEnum(value.method, LEARN_METHODS, "method");
  const level = value.level === null ? null : asInteger(value.level, "level", 1);
  const machineIdentifier = asString(value.machineIdentifier, "machineIdentifier", true);
  if (method === "level-up" && level === null) fail("level", "level-up learnset entries require level");
  if (method !== "level-up" && level !== null) fail("level", "level is only valid for level-up entries");
  if (method === "machine" && machineIdentifier === null) fail("machineIdentifier", "machine learnset entries require machineIdentifier");
  if (method !== "machine" && machineIdentifier !== null) fail("machineIdentifier", "machineIdentifier is only valid for machine entries");
  return {
    speciesId: asString(value.speciesId, "speciesId") as SpeciesId,
    moveId: asString(value.moveId, "moveId") as MoveId,
    sourceGeneration: asInteger(value.sourceGeneration, "sourceGeneration", 1),
    sourceGame: asString(value.sourceGame, "sourceGame") as string,
    method,
    level,
    machineIdentifier,
    sourceRecordIds: asStringArray(value.sourceRecordIds, "sourceRecordIds"),
  };
}

export function parseTypeEffectivenessEntry(value: unknown): TypeEffectivenessEntry {
  assertRecord(value, "typeEffectiveness");
  const multiplier = value.multiplier;
  if (multiplier !== 0 && multiplier !== 0.5 && multiplier !== 1 && multiplier !== 2) {
    fail("multiplier", "must be one of 0, 0.5, 1, 2");
  }
  return {
    attackTypeId: asString(value.attackTypeId, "attackTypeId") as TypeId,
    defenseTypeId: asString(value.defenseTypeId, "defenseTypeId") as TypeId,
    multiplier,
    sourceRecordIds: asStringArray(value.sourceRecordIds, "sourceRecordIds"),
  };
}

export function parseSourceRecord(value: unknown): SourceRecord {
  assertRecord(value, "sourceRecord");
  const provider = asEnum(value.provider, SOURCE_PROVIDERS, "sourceRecord.provider");
  const canonicalUrl = asString(value.canonicalUrl, "sourceRecord.canonicalUrl") as string;
  let parsed: URL;
  try {
    parsed = new URL(canonicalUrl);
  } catch {
    fail("sourceRecord.canonicalUrl", "must be a valid URL");
  }
  const expectedHost = provider === "bulbapedia" ? "bulbapedia.bulbagarden.net" : "pokemondb.net";
  if (parsed.protocol !== "https:" || parsed.hostname !== expectedHost) {
    fail("sourceRecord.canonicalUrl", `must be an https://${expectedHost} URL for provider ${provider}`);
  }
  const sourceContentHash = asString(value.sourceContentHash, "sourceRecord.sourceContentHash") as string;
  if (!HASH_RE.test(sourceContentHash)) fail("sourceRecord.sourceContentHash", "must be sha256:<lowercase-hex>");
  const fetchedAt = asString(value.fetchedAt, "sourceRecord.fetchedAt") as string;
  if (Number.isNaN(Date.parse(fetchedAt))) fail("sourceRecord.fetchedAt", "must be an ISO-compatible timestamp");
  if (value.fetchStatus !== "fetched" && value.fetchStatus !== "cache") fail("sourceRecord.fetchStatus", "unknown fetch status");
  return {
    id: asString(value.id, "sourceRecord.id") as string,
    provider,
    canonicalUrl,
    fetchedAt,
    parserVersion: asString(value.parserVersion, "sourceRecord.parserVersion") as string,
    sourceContentHash,
    fetchStatus: value.fetchStatus,
  };
}

export function parseMoveFactSourceRelation(value: unknown): MoveFactSourceRelation {
  assertRecord(value, "moveFactSource");
  assertRecord(value.mainline, "moveFactSource.mainline");
  return {
    moveId: asString(value.moveId, "moveFactSource.moveId") as MoveId,
    mainline: {
      selectedGame: asEnum(
        value.mainline.selectedGame,
        MOVE_MAINLINE_GAMES,
        "moveFactSource.mainline.selectedGame",
      ),
      sourceRecordId: asString(
        value.mainline.sourceRecordId,
        "moveFactSource.mainline.sourceRecordId",
      ) as string,
    },
    sourceTargetSourceRecordId: asString(
      value.sourceTargetSourceRecordId,
      "moveFactSource.sourceTargetSourceRecordId",
    ) as string,
    makesContactSourceRecordId: asString(
      value.makesContactSourceRecordId,
      "moveFactSource.makesContactSourceRecordId",
    ) as string,
    zaBaseCooldownSourceRecordId: asString(
      value.zaBaseCooldownSourceRecordId,
      "moveFactSource.zaBaseCooldownSourceRecordId",
    ) as string,
  };
}

export function parseSourceInventory(value: unknown): SourceInventory {
  assertRecord(value, "sourceInventory");
  const surfaces: CatalogSurface[] = ["species", "moves", "types", "abilities", "items", "learnsets", "type-effectiveness"];
  if (typeof value.surface !== "string" || !surfaces.includes(value.surface as CatalogSurface)) fail("sourceInventory.surface", "unknown catalog surface");
  if (!Array.isArray(value.excludedOrDeferred)) fail("sourceInventory.excludedOrDeferred", "must be an array");
  const excludedOrDeferred: ExcludedOrDeferredSourceKey[] = value.excludedOrDeferred.map((entry, index) => {
    assertRecord(entry, `sourceInventory.excludedOrDeferred[${index}]`);
    if (entry.disposition !== "excluded" && entry.disposition !== "deferred") fail(`sourceInventory.excludedOrDeferred[${index}].disposition`, "unknown disposition");
    return {
      sourceKey: asString(entry.sourceKey, `sourceInventory.excludedOrDeferred[${index}].sourceKey`) as string,
      disposition: entry.disposition,
      reason: asString(entry.reason, `sourceInventory.excludedOrDeferred[${index}].reason`) as string,
    };
  });
  return {
    surface: value.surface as CatalogSurface,
    discoveredSourceKeys: asStringArray(value.discoveredSourceKeys, "sourceInventory.discoveredSourceKeys", 0),
    acceptedMappingKeys: asStringArray(value.acceptedMappingKeys, "sourceInventory.acceptedMappingKeys", 0),
    extractedSourceKeys: asStringArray(value.extractedSourceKeys, "sourceInventory.extractedSourceKeys", 0),
    normalizedSourceKeys: asStringArray(value.normalizedSourceKeys, "sourceInventory.normalizedSourceKeys", 0),
    excludedOrDeferred,
    candidateSourceKeys: asStringArray(value.candidateSourceKeys, "sourceInventory.candidateSourceKeys", 0),
    ...(value.previousAcceptedMappingKeys === undefined
      ? {}
      : {
          previousAcceptedMappingKeys: asStringArray(
            value.previousAcceptedMappingKeys,
            "sourceInventory.previousAcceptedMappingKeys",
            0,
          ),
        }),
  };
}

export function parseProvenanceManifest(value: unknown): ProvenanceManifest {
  assertRecord(value, "provenance");
  if (!Array.isArray(value.sourceRecords)) fail("provenance.sourceRecords", "must be an array");
  if (!Array.isArray(value.moveFactSources)) fail("provenance.moveFactSources", "must be an array");
  if (!Array.isArray(value.inventories)) fail("provenance.inventories", "must be an array");
  const sourceInventoryHash = asString(value.sourceInventoryHash, "provenance.sourceInventoryHash") as string;
  if (!HASH_RE.test(sourceInventoryHash)) fail("provenance.sourceInventoryHash", "must be sha256:<lowercase-hex>");
  const provenanceHashValue = value.provenanceHash;
  if (provenanceHashValue !== undefined && (typeof provenanceHashValue !== "string" || !HASH_RE.test(provenanceHashValue))) {
    fail("provenance.provenanceHash", "must be sha256:<lowercase-hex>");
  }
  const inventories = value.inventories.map(parseSourceInventory);
  if (new Set(inventories.map((inventory) => inventory.surface)).size !== inventories.length) {
    fail("provenance.inventories", "inventory surfaces must be unique");
  }
  const moveFactSources = value.moveFactSources.map(parseMoveFactSourceRelation);
  if (new Set(moveFactSources.map((entry) => entry.moveId)).size !== moveFactSources.length) {
    fail("provenance.moveFactSources", "Move fact-source relations must have unique moveId values");
  }
  return {
    sourceRecords: value.sourceRecords.map(parseSourceRecord),
    moveFactSources,
    inventories,
    sourceInventoryHash,
    ...(provenanceHashValue === undefined ? {} : { provenanceHash: provenanceHashValue }),
  };
}

function parseArray<T>(value: unknown, path: string, parser: (entry: unknown) => T): T[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value.map(parser);
}

function finding(code: string, path: string, message: string): ValidationFinding {
  return { code, path, message };
}

function duplicateIdFindings<T extends { id: string }>(records: T[], path: string): ValidationFinding[] {
  const seen = new Set<string>();
  const findings: ValidationFinding[] = [];
  for (const record of records) {
    const normalizedId = record.id.normalize("NFC");
    if (seen.has(normalizedId)) findings.push(finding("duplicate-canonical-id", `${path}.${normalizedId}`, `duplicate canonical ID ${normalizedId}`));
    seen.add(normalizedId);
  }
  return findings;
}

function provenanceRefs(value: GameDataCandidate): Array<{ path: string; ids: string[] }> {
  return [
    ...value.catalogs.species.map((record) => ({ path: `catalogs.species.${record.id}`, ids: record.sourceRecordIds })),
    ...value.catalogs.moves.map((record) => ({ path: `catalogs.moves.${record.id}`, ids: record.sourceRecordIds })),
    ...value.catalogs.types.map((record) => ({ path: `catalogs.types.${record.id}`, ids: record.sourceRecordIds })),
    ...value.catalogs.abilities.map((record) => ({ path: `catalogs.abilities.${record.id}`, ids: record.sourceRecordIds })),
    ...value.catalogs.items.map((record) => ({ path: `catalogs.items.${record.id}`, ids: record.sourceRecordIds })),
    ...value.catalogs.learnsets.map((record, index) => ({ path: `catalogs.learnsets[${index}]`, ids: record.sourceRecordIds })),
    ...value.referenceData.currentTypeEffectiveness.map((record, index) => ({ path: `referenceData.currentTypeEffectiveness[${index}]`, ids: record.sourceRecordIds })),
    ...value.provenance.moveFactSources.map((relation) => ({
      path: `provenance.moveFactSources.${relation.moveId}`,
      ids: [
        relation.mainline.sourceRecordId,
        relation.sourceTargetSourceRecordId,
        relation.makesContactSourceRecordId,
        relation.zaBaseCooldownSourceRecordId,
      ],
    })),
  ];
}

function isBulbapediaZaMoveListSource(source: SourceRecord): boolean {
  if (
    source.provider !== "bulbapedia" ||
    source.parserVersion !== BULBAPEDIA_ZA_MOVE_PARSER_VERSION
  ) {
    return false;
  }
  try {
    const url = new URL(source.canonicalUrl);
    return (
      url.protocol === "https:" &&
      url.hostname === "bulbapedia.bulbagarden.net" &&
      decodeURIComponent(url.pathname) === BULBAPEDIA_ZA_MOVE_LIST_PATH &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isBulbapediaGen9MoveListSource(source: SourceRecord): boolean {
  if (
    source.provider !== "bulbapedia" ||
    source.parserVersion !== BULBAPEDIA_GEN9_MOVE_PARSER_VERSION
  ) {
    return false;
  }
  try {
    const url = new URL(source.canonicalUrl);
    return (
      url.protocol === "https:" &&
      url.hostname === "bulbapedia.bulbagarden.net" &&
      decodeURIComponent(url.pathname) === BULBAPEDIA_GEN9_MOVE_LIST_PATH &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isPokemonDbMovePageSource(source: SourceRecord): boolean {
  if (
    source.provider !== "pokemondb" ||
    source.parserVersion !== POKEMONDB_MOVE_PARSER_VERSION
  ) {
    return false;
  }
  try {
    const url = new URL(source.canonicalUrl);
    return (
      url.protocol === "https:" &&
      url.hostname === "pokemondb.net" &&
      /^\/move\/[^/]+$/.test(url.pathname) &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isBulbapediaMoveTargetSource(source: SourceRecord): boolean {
  if (
    source.provider !== "bulbapedia" ||
    source.parserVersion !== BULBAPEDIA_MOVE_TARGET_PARSER_VERSION
  ) {
    return false;
  }
  try {
    const url = new URL(source.canonicalUrl);
    return (
      url.protocol === "https:" &&
      url.hostname === "bulbapedia.bulbagarden.net" &&
      /^\/wiki\/[^/]+_\(move\)$/u.test(decodeURIComponent(url.pathname)) &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function mainlineSourceMatchesGame(
  source: SourceRecord,
  game: MoveMainlineGame,
): boolean {
  if (game === "scarlet-violet") return isBulbapediaGen9MoveListSource(source);
  if (game === "brilliant-diamond-shining-pearl") {
    if (
      source.provider !== "bulbapedia" ||
      source.parserVersion !== BULBAPEDIA_GEN8_LEARNSET_PARSER_VERSION
    ) return false;
    try {
      const url = new URL(source.canonicalUrl);
      return (
        url.protocol === "https:" &&
        url.hostname === "bulbapedia.bulbagarden.net" &&
        /^\/wiki\/[^/]+_\(Pok%C3%A9mon\)\/Generation_VIII_learnset$/u.test(url.pathname) &&
        url.search === "" &&
        url.hash === ""
      );
    } catch {
      return false;
    }
  }
  if (
    source.provider !== "bulbapedia" ||
    source.parserVersion !== BULBAPEDIA_HISTORICAL_SCALAR_PROOF_PARSER_VERSION
  ) return false;
  const expectedCutoff =
    game === "sword-shield"
      ? BULBAPEDIA_SWSH_TRADITIONAL_CUTOFF
      : game === "ultra-sun-ultra-moon"
        ? BULBAPEDIA_USUM_TRADITIONAL_CUTOFF
        : BULBAPEDIA_SM_TRADITIONAL_CUTOFF;
  try {
    const url = new URL(source.canonicalUrl);
    if (
      url.protocol === "https:" &&
      url.hostname === "bulbapedia.bulbagarden.net" &&
      url.pathname === "/w/api.php" &&
      url.hash === ""
    ) {
      const expected = new Map<string, string>([
        ["action", "query"],
        ["format", "json"],
        ["formatversion", "2"],
        ["prop", "revisions"],
        ["rvprop", "ids|timestamp|content"],
        ["rvslots", "main"],
        ["rvlimit", "1"],
        ["rvstart", expectedCutoff],
        ["rvdir", "older"],
      ]);
      const entries = [...url.searchParams.entries()];
      if (entries.length !== expected.size + 1) return false;
      for (const [key, value] of expected) {
        if (url.searchParams.getAll(key).length !== 1 || url.searchParams.get(key) !== value) {
          return false;
        }
      }
      const titles = url.searchParams.getAll("titles");
      return (
        titles.length === 1 &&
        /^.+ \(move\)$/u.test(titles[0]) &&
        ![...url.searchParams.keys()].some(
          (key) => key !== "titles" && !expected.has(key),
        )
      );
    }
    return false;
  } catch {
    return false;
  }
}

function baseSpeciesCycleFindings(species: SpeciesDefinitionV2[]): ValidationFinding[] {
  const byId = new Map(species.map((record) => [record.id, record]));
  const findings: ValidationFinding[] = [];
  for (const record of species) {
    const visited = new Set<string>();
    let current: SpeciesDefinitionV2 | undefined = record;
    while (current?.baseSpeciesId) {
      if (visited.has(current.baseSpeciesId) || current.baseSpeciesId === record.id) {
        findings.push(finding("base-species-cycle", `catalogs.species.${record.id}.baseSpeciesId`, "baseSpeciesId creates a cycle"));
        break;
      }
      visited.add(current.baseSpeciesId);
      current = byId.get(current.baseSpeciesId);
    }
  }
  return findings;
}

export function validateGameDataCandidate(candidate: GameDataCandidate): ValidationReport {
  const findings: ValidationFinding[] = [];
  findings.push(
    ...duplicateIdFindings(candidate.catalogs.species, "catalogs.species"),
    ...duplicateIdFindings(candidate.catalogs.moves, "catalogs.moves"),
    ...duplicateIdFindings(candidate.catalogs.types, "catalogs.types"),
    ...duplicateIdFindings(candidate.catalogs.abilities, "catalogs.abilities"),
    ...duplicateIdFindings(candidate.catalogs.items, "catalogs.items"),
  );

  const speciesIds = new Set(candidate.catalogs.species.map((record) => record.id));
  const moveIds = new Set(candidate.catalogs.moves.map((record) => record.id));
  const typeIds = new Set(candidate.catalogs.types.map((record) => record.id));
  const abilityIds = new Set(candidate.catalogs.abilities.map((record) => record.id));

  for (const record of candidate.catalogs.species) {
    if (record.baseSpeciesId && !speciesIds.has(record.baseSpeciesId)) findings.push(finding("unresolved-reference", `catalogs.species.${record.id}.baseSpeciesId`, `unknown SpeciesId ${record.baseSpeciesId}`));
    for (const typeId of record.typeIds) if (!typeIds.has(typeId)) findings.push(finding("unresolved-reference", `catalogs.species.${record.id}.typeIds`, `unknown TypeId ${typeId}`));
    for (const assignment of record.abilities) if (!abilityIds.has(assignment.abilityId)) findings.push(finding("unresolved-reference", `catalogs.species.${record.id}.abilities`, `unknown AbilityId ${assignment.abilityId}`));
  }
  for (const record of candidate.catalogs.moves) {
    if (!typeIds.has(record.typeId)) findings.push(finding("unresolved-reference", `catalogs.moves.${record.id}.typeId`, `unknown TypeId ${record.typeId}`));
  }
  for (const [index, record] of candidate.catalogs.learnsets.entries()) {
    if (!speciesIds.has(record.speciesId)) findings.push(finding("unresolved-reference", `catalogs.learnsets[${index}].speciesId`, `unknown SpeciesId ${record.speciesId}`));
    if (!moveIds.has(record.moveId)) findings.push(finding("unresolved-reference", `catalogs.learnsets[${index}].moveId`, `unknown MoveId ${record.moveId}`));
  }
  const learnsetKeys = new Set<string>();
  for (const [index, record] of candidate.catalogs.learnsets.entries()) {
    const key = [
      record.speciesId.normalize("NFC"),
      record.moveId.normalize("NFC"),
      String(record.sourceGeneration),
      record.sourceGame.normalize("NFC"),
      record.method,
      String(record.level ?? ""),
      record.machineIdentifier?.normalize("NFC") ?? "",
    ].join("\u0000");
    if (learnsetKeys.has(key)) {
      findings.push(
        finding(
          "duplicate-learnset-entry",
          `catalogs.learnsets[${index}]`,
          "duplicate semantic learnset entry",
        ),
      );
    }
    learnsetKeys.add(key);
  }

  const matrixPairs = new Set<string>();
  for (const [index, entry] of candidate.referenceData.currentTypeEffectiveness.entries()) {
    if (!typeIds.has(entry.attackTypeId) || !typeIds.has(entry.defenseTypeId)) {
      findings.push(finding("unresolved-reference", `referenceData.currentTypeEffectiveness[${index}]`, "unknown TypeId in current type matrix"));
    }
    const key = `${entry.attackTypeId}\u0000${entry.defenseTypeId}`;
    if (matrixPairs.has(key)) findings.push(finding("duplicate-type-matrix-pair", `referenceData.currentTypeEffectiveness[${index}]`, "ordered type pair appears more than once"));
    matrixPairs.add(key);
  }
  if (matrixPairs.size !== typeIds.size * typeIds.size) {
    findings.push(finding("incomplete-type-matrix", "referenceData.currentTypeEffectiveness", "current matrix must contain every ordered attack/defense Type pair exactly once"));
  }

  findings.push(...baseSpeciesCycleFindings(candidate.catalogs.species));

  const sourceIds = new Set<string>();
  const sourceById = new Map<string, SourceRecord>();
  for (const [index, source] of candidate.provenance.sourceRecords.entries()) {
    if (!(SOURCE_PROVIDERS as readonly string[]).includes(source.provider)) findings.push(finding("invalid-provider", `provenance.sourceRecords[${index}].provider`, "canonical source provider must be bulbapedia or pokemondb"));
    if (sourceIds.has(source.id)) findings.push(finding("duplicate-source-record", `provenance.sourceRecords[${index}].id`, `duplicate source record ${source.id}`));
    sourceIds.add(source.id);
    sourceById.set(source.id, source);
  }
  for (const ref of provenanceRefs(candidate)) {
    for (const sourceRecordId of ref.ids) {
      if (!sourceIds.has(sourceRecordId)) findings.push(finding("unresolved-provenance", ref.path, `unknown source record ${sourceRecordId}`));
    }
  }
  const moveFactSourceById = new Map(
    candidate.provenance.moveFactSources.map((entry) => [entry.moveId, entry]),
  );
  for (const relation of candidate.provenance.moveFactSources) {
    if (!moveIds.has(relation.moveId)) {
      findings.push(
        finding(
          "orphan-move-fact-source",
          `provenance.moveFactSources.${relation.moveId}`,
          `Move fact-source relation references unknown MoveId ${relation.moveId}`,
        ),
      );
    }
  }
  for (const record of candidate.catalogs.moves) {
    const relation = moveFactSourceById.get(record.id);
    if (!relation) {
      findings.push(
        finding(
          "missing-move-fact-sources",
          `provenance.moveFactSources.${record.id}`,
          "every canonical Move requires exactly one provenance role relation",
        ),
      );
      continue;
    }
    const roleIds = [
      relation.mainline.sourceRecordId,
      relation.sourceTargetSourceRecordId,
      relation.makesContactSourceRecordId,
      relation.zaBaseCooldownSourceRecordId,
    ];
    for (const roleId of roleIds) {
      if (!record.sourceRecordIds.includes(roleId)) {
        findings.push(
          finding(
            "move-fact-source-not-aggregated",
            `provenance.moveFactSources.${record.id}`,
            `role SourceRecord ${roleId} is not present in the Move sourceRecordIds aggregate`,
          ),
        );
      }
    }
    const mainlineSource = sourceById.get(relation.mainline.sourceRecordId);
    if (
      !mainlineSource ||
      !mainlineSourceMatchesGame(mainlineSource, relation.mainline.selectedGame)
    ) {
      findings.push(
        finding(
          "invalid-move-mainline-source",
          `provenance.moveFactSources.${record.id}.mainline`,
          "selected mainline game/source does not match an approved versioned Bulbapedia surface",
        ),
      );
    }
    const sourceTargetSource = sourceById.get(relation.sourceTargetSourceRecordId);
    if (
      !sourceTargetSource ||
      (!isPokemonDbMovePageSource(sourceTargetSource) &&
        !isBulbapediaMoveTargetSource(sourceTargetSource))
    ) {
      findings.push(
        finding(
          "invalid-move-complement-source",
          `provenance.moveFactSources.${record.id}.sourceTargetSourceRecordId`,
          "sourceTarget provenance must reference a versioned PokémonDB Move page or Bulbapedia Move target fallback page",
        ),
      );
    }
    const makesContactSource = sourceById.get(relation.makesContactSourceRecordId);
    if (!makesContactSource || !isPokemonDbMovePageSource(makesContactSource)) {
      findings.push(
        finding(
          "invalid-move-complement-source",
          `provenance.moveFactSources.${record.id}.makesContactSourceRecordId`,
          "makesContact provenance must reference a versioned PokémonDB Move page",
        ),
      );
    }
    const zaSource = sourceById.get(relation.zaBaseCooldownSourceRecordId);
    if (!zaSource || !isBulbapediaZaMoveListSource(zaSource)) {
      findings.push(
        finding(
          "invalid-move-za-source",
          `provenance.moveFactSources.${record.id}.zaBaseCooldownSourceRecordId`,
          "Z-A Base Cooldown provenance must reference the canonical versioned Z-A move list",
        ),
      );
    }
    const hasMainlineEvidence = record.sourceRecordIds.some((id) => {
      const source = sourceById.get(id);
      return source !== undefined && isBulbapediaGen9MoveListSource(source);
    });
    if (!hasMainlineEvidence) {
      findings.push(
        finding(
          "missing-mainline-move-provenance",
          `catalogs.moves.${record.id}.sourceRecordIds`,
          "Move non-cooldown facts require provenance from the canonical Bulbapedia Generation IX availability source before any approved historical fallback",
        ),
      );
    }
    const hasZaEvidence = record.sourceRecordIds.some((id) => {
      const source = sourceById.get(id);
      return source !== undefined && isBulbapediaZaMoveListSource(source);
    });
    if (!hasZaEvidence) {
      findings.push(
        finding(
          "missing-za-cooldown-provenance",
          `catalogs.moves.${record.id}.sourceRecordIds`,
          "zaBaseCooldownMs requires provenance from the canonical Bulbapedia Pokémon Legends: Z-A move-list source, including semantic null conclusions",
        ),
      );
    }
  }
  for (const inventory of candidate.provenance.inventories) findings.push(...reconcileSourceInventory(inventory));
  return { valid: findings.length === 0, findings };
}

export function parseGameDataCandidate(value: unknown): GameDataCandidate {
  assertRecord(value, "candidate");
  if (value.schemaVersion !== SCHEMA_VERSION) fail("schemaVersion", `unsupported schemaVersion ${String(value.schemaVersion)}`, "unsupported-schema-version");
  assertRecord(value.catalogs, "catalogs");
  assertRecord(value.referenceData, "referenceData");
  const candidate: GameDataCandidate = {
    schemaVersion: SCHEMA_VERSION,
    normalizerVersion: asString(value.normalizerVersion, "normalizerVersion") as string,
    catalogs: {
      species: parseArray(value.catalogs.species, "catalogs.species", parseSpeciesDefinitionV2),
      moves: parseArray(value.catalogs.moves, "catalogs.moves", parseMoveDefinitionV1),
      types: parseArray(value.catalogs.types, "catalogs.types", parseTypeDefinitionV1),
      abilities: parseArray(value.catalogs.abilities, "catalogs.abilities", parseAbilityDefinitionV1),
      items: parseArray(value.catalogs.items, "catalogs.items", parseItemDefinitionV1),
      learnsets: parseArray(value.catalogs.learnsets, "catalogs.learnsets", parseLearnsetEntryV1),
    },
    referenceData: {
      currentTypeEffectiveness: parseArray(value.referenceData.currentTypeEffectiveness, "referenceData.currentTypeEffectiveness", parseTypeEffectivenessEntry),
    },
    provenance: parseProvenanceManifest(value.provenance),
  };
  const report = validateGameDataCandidate(candidate);
  if (!report.valid) throw new GameDataValidationError(report.findings[0]);
  return candidate;
}

export function parseGameDataManifest(value: unknown): GameDataManifest {
  assertRecord(value, "manifest");
  if (value.schemaVersion !== SCHEMA_VERSION) {
    fail(
      "manifest.schemaVersion",
      `unsupported schemaVersion ${String(value.schemaVersion)}`,
      "unsupported-schema-version",
    );
  }
  const gameDataVersion = asString(
    value.gameDataVersion,
    "manifest.gameDataVersion",
  ) as string;
  const bundleHashValue = asString(
    value.bundleHash,
    "manifest.bundleHash",
  ) as string;
  const provenanceHashValue = asString(
    value.provenanceHash,
    "manifest.provenanceHash",
  ) as string;
  if (!HASH_RE.test(bundleHashValue)) {
    fail("manifest.bundleHash", "must be sha256:<lowercase-hex>");
  }
  if (!HASH_RE.test(provenanceHashValue)) {
    fail("manifest.provenanceHash", "must be sha256:<lowercase-hex>");
  }
  const publishedAt = asString(
    value.publishedAt,
    "manifest.publishedAt",
  ) as string;
  if (Number.isNaN(Date.parse(publishedAt))) {
    fail("manifest.publishedAt", "must be an ISO-compatible timestamp");
  }
  if (!Array.isArray(value.artifacts)) {
    fail("manifest.artifacts", "must be an array");
  }
  const artifacts = value.artifacts.map((entry, index): ArtifactDescriptor => {
    assertRecord(entry, `manifest.artifacts[${index}]`);
    const contentHashValue = asString(
      entry.contentHash,
      `manifest.artifacts[${index}].contentHash`,
    ) as string;
    if (!HASH_RE.test(contentHashValue)) {
      fail(
        `manifest.artifacts[${index}].contentHash`,
        "must be sha256:<lowercase-hex>",
      );
    }
    return {
      logicalName: asString(
        entry.logicalName,
        `manifest.artifacts[${index}].logicalName`,
      ) as string,
      contentHash: contentHashValue,
      recordCount: asInteger(
        entry.recordCount,
        `manifest.artifacts[${index}].recordCount`,
        0,
      ),
    };
  });
  if (
    new Set(artifacts.map((artifact) => artifact.logicalName)).size !==
    artifacts.length
  ) {
    fail("manifest.artifacts", "logical artifact names must be unique");
  }
  const parseReferencedFile = <
    TLogicalName extends "provenance" | "source-inventory",
    TPath extends "provenance.json" | "source-inventory.json",
  >(
    entry: unknown,
    path: string,
    logicalName: TLogicalName,
    expectedPath: TPath,
  ): { logicalName: TLogicalName; path: TPath; contentHash: string } => {
    assertRecord(entry, path);
    if (entry.logicalName !== logicalName) {
      fail(`${path}.logicalName`, `must equal ${logicalName}`);
    }
    if (entry.path !== expectedPath) {
      fail(`${path}.path`, `must equal ${expectedPath}`);
    }
    const contentHashValue = asString(
      entry.contentHash,
      `${path}.contentHash`,
    ) as string;
    if (!HASH_RE.test(contentHashValue)) {
      fail(`${path}.contentHash`, "must be sha256:<lowercase-hex>");
    }
    return {
      logicalName,
      path: expectedPath,
      contentHash: contentHashValue,
    };
  };
  const provenanceManifest = parseReferencedFile(
    value.provenanceManifest,
    "manifest.provenanceManifest",
    "provenance",
    "provenance.json",
  );
  const sourceInventory = parseReferencedFile(
    value.sourceInventory,
    "manifest.sourceInventory",
    "source-inventory",
    "source-inventory.json",
  );
  assertRecord(value.catalogCounts, "manifest.catalogCounts");
  const catalogCounts = {
    species: asInteger(
      value.catalogCounts.species,
      "manifest.catalogCounts.species",
      0,
    ),
    moves: asInteger(
      value.catalogCounts.moves,
      "manifest.catalogCounts.moves",
      0,
    ),
    types: asInteger(
      value.catalogCounts.types,
      "manifest.catalogCounts.types",
      0,
    ),
    abilities: asInteger(
      value.catalogCounts.abilities,
      "manifest.catalogCounts.abilities",
      0,
    ),
    items: asInteger(
      value.catalogCounts.items,
      "manifest.catalogCounts.items",
      0,
    ),
    learnsets: asInteger(
      value.catalogCounts.learnsets,
      "manifest.catalogCounts.learnsets",
      0,
    ),
    currentTypeEffectiveness: asInteger(
      value.catalogCounts.currentTypeEffectiveness,
      "manifest.catalogCounts.currentTypeEffectiveness",
      0,
    ),
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    gameDataVersion,
    bundleHash: bundleHashValue,
    provenanceHash: provenanceHashValue,
    publishedAt,
    normalizerVersion: asString(
      value.normalizerVersion,
      "manifest.normalizerVersion",
    ) as string,
    artifacts,
    provenanceManifest,
    sourceInventory,
    catalogCounts,
  };
}
