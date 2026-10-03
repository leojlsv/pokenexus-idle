import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { LOCAL_MAPPING_ROSTER } from "./mapping-roster.js";
import { canonicalJson } from "./canonical-json.js";
import {
  bundleHash,
  canonicalSourceInventories,
  canonicalizeCandidateArtifacts,
  sha256,
} from "./canonical.js";
import { GAME_DATA_SCHEMA_V5 } from "./schema-version-v5.js";
import {
  GAME_DATA_V5_ARTIFACT_PATHS,
  parseGameDataManifestV5,
  type GameDataManifestV5,
} from "./game-data-manifest-v5.js";
import { PVE_CONTENT_SCHEMA_VERSION } from "./pve-content-schema.js";
import { loadPublishedPveV4BundleDirectory } from "./pve-publication.js";
import {
  parseAbilityDefinitionV1,
  parseItemDefinitionV1,
  parseLearnsetEntryV1,
  parseMoveDefinitionV1,
  parseProvenanceManifest,
  parseSpeciesDefinitionV2,
  parseTypeDefinitionV1,
  parseTypeEffectivenessEntry,
  type GameDataCandidate,
  type SourceFact,
} from "./schema.js";
import {
  POKEAPI_CSV_PARSER_VERSION,
  pokeApiSourceRecordsForFact,
  loadPokeApiLowAmbiguityFacts,
  type PokeApiFactEvidenceKey,
} from "./pokeapi-local-snapshot.js";
import {
  POKEAPI_BINDING_REGISTRY,
  applyPokeApiMoveBindingOverrides,
  validatePokeApiBindingRegistryCoverage,
} from "./pokeapi-binding-registry.js";
import { buildPokeApiParityReport } from "./pokeapi-parity.js";
import {
  isLegacyMoveAvailabilitySourceRecord,
  migrateLegacyV3Evidence,
  type MigratedLegacyV3Evidence,
} from "./legacy-evidence-migration-v5.js";
import {
  finalizeProvenanceManifestV5,
  sourceRecordV5FromSnapshotFile,
  type FactSourceRelationV5,
  type MoveFactSourceRelationV2,
  type ProvenanceManifestV5,
  type SourceRecordV5,
} from "./source-snapshot-v5.js";

export const PROMOTION_V5_STAGE_VERSION = "task-114-promotion-v5-stage-v1" as const;
export const PROMOTION_NORMALIZER_VERSION = "pokenexus-static-normalizer-v6" as const;
export const PROMOTION_CANDIDATE_GAME_DATA_VERSION = "game-data-core-kanto-johto-v4" as const;

const FACTUAL_PATHS = {
  species: "catalogs/species.json",
  moves: "catalogs/moves.json",
  types: "catalogs/types.json",
  abilities: "catalogs/abilities.json",
  items: "catalogs/items.json",
  learnsets: "catalogs/learnsets.json",
  currentTypeEffectiveness: "reference-data/current-type-effectiveness.json",
} as const;

const PVE_PATHS = {
  "catalogs/zones": "catalogs/zones.json",
  "catalogs/hunts": "catalogs/hunts.json",
  "catalogs/encounter-definitions": "catalogs/encounter-definitions.json",
} as const;

export interface PromotionV5ReviewDelta {
  surface: "species" | "moves" | "items";
  canonicalId: string;
  field: "sourceSlug" | "baseExperience" | "makesContact" | "sourceCategory";
  before: unknown;
  after: unknown;
}

export interface PromotionV5Review {
  reviewVersion: "task-114-promotion-review-v1";
  baseGameDataVersion: string;
  baseBundleHash: string;
  candidateGameDataVersion: typeof PROMOTION_CANDIDATE_GAME_DATA_VERSION;
  candidateBundleHash: string;
  provenanceHash: string;
  prePromotionParity: {
    match: 5411;
    mismatch: 57;
    missingCurrent: 35;
    missingSource: 0;
    unmapped: 547;
  };
  postPromotionParity: {
    match: 5498;
    mismatch: 0;
    missingCurrent: 5;
    missingSource: 0;
    unmapped: 547;
  };
  factualDelta: {
    fieldChanges: 87;
    records: 83;
    speciesSourceSlug: 42;
    speciesBaseExperience: 5;
    moveMakesContact: 10;
    itemSourceCategory: 30;
  };
  historicalEvidence: {
    explicitRoleRecords: 1144;
    additionalMainlineContextRecords: 2;
    totalRecords: 1146;
    multiSourceMainlineMoves: 32;
  };
  deltas: PromotionV5ReviewDelta[];
  retainedPveArtifactHashes: Record<keyof typeof PVE_PATHS, string>;
}

export interface PromotionV5StageManifest {
  stageManifestVersion: typeof PROMOTION_V5_STAGE_VERSION;
  schemaVersion: typeof GAME_DATA_SCHEMA_V5;
  pveContentSchemaVersion: typeof PVE_CONTENT_SCHEMA_VERSION;
  baseGameDataVersion: string;
  baseBundleHash: string;
  candidateGameDataVersion: typeof PROMOTION_CANDIDATE_GAME_DATA_VERSION;
  candidateBundleHash: string;
  normalizerVersion: typeof PROMOTION_NORMALIZER_VERSION;
  provenanceHash: string;
  provenanceManifest: { logicalName: "provenance"; path: "provenance.json"; contentHash: string };
  sourceInventory: { logicalName: "source-inventory"; path: "source-inventory.json"; contentHash: string };
  artifacts: Array<{ logicalName: string; contentHash: string; recordCount: number }>;
  catalogCounts: GameDataManifestV5["catalogCounts"];
  reviewHash: string;
}

export interface StagePromotionV5Input {
  basePublishedDirectory: string;
  pokeApiSnapshotRoot: string;
  legacyCacheDirectory: string;
  stableLegacyEvidenceDirectory: string;
  outputDirectory: string;
}

export interface StagedPromotionV5Candidate {
  directory: string;
  manifest: PromotionV5StageManifest;
  review: PromotionV5Review;
  reviewHash: string;
  provenance: ProvenanceManifestV5;
}

function sourceFact(value: number | null): SourceFact<number> {
  return value === null ? { status: "source-unavailable" } : { status: "known", value };
}

async function readCanonicalArray(path: string, label: string): Promise<unknown[]> {
  const text = await readFile(path, "utf8");
  const parsed = JSON.parse(text) as unknown;
  if (canonicalJson(parsed) !== text) throw new Error(`${label} must be canonical JSON`);
  if (!Array.isArray(parsed)) throw new Error(`${label} must be an array`);
  return parsed;
}

function mapLegacyIds(ids: readonly string[], migration: MigratedLegacyV3Evidence): string[] {
  return [...new Set(ids.map((id) => {
    const mapped = migration.sourceRecordIdMap.get(id);
    if (!mapped) throw new Error(`missing migrated legacy SourceRecord ${id}`);
    return mapped;
  }))].sort();
}

function evidenceIds(
  snapshot: Awaited<ReturnType<typeof loadPokeApiLowAmbiguityFacts>>["snapshot"],
  fact: PokeApiFactEvidenceKey,
): string[] {
  return pokeApiSourceRecordsForFact(snapshot, fact).map((entry) => entry.id).sort();
}

function unionIds(...groups: readonly string[][]): string[] {
  return [...new Set(groups.flat())].sort();
}

function descriptorCount(descriptors: PromotionV5StageManifest["artifacts"], logicalName: string): number {
  const descriptor = descriptors.find((entry) => entry.logicalName === logicalName);
  if (!descriptor) throw new Error(`missing descriptor ${logicalName}`);
  return descriptor.recordCount;
}

function catalogCounts(descriptors: PromotionV5StageManifest["artifacts"]): GameDataManifestV5["catalogCounts"] {
  return {
    species: descriptorCount(descriptors, "catalogs/species"),
    moves: descriptorCount(descriptors, "catalogs/moves"),
    types: descriptorCount(descriptors, "catalogs/types"),
    abilities: descriptorCount(descriptors, "catalogs/abilities"),
    items: descriptorCount(descriptors, "catalogs/items"),
    learnsets: descriptorCount(descriptors, "catalogs/learnsets"),
    currentTypeEffectiveness: descriptorCount(descriptors, "referenceData/currentTypeEffectiveness"),
    zones: descriptorCount(descriptors, "catalogs/zones"),
    hunts: descriptorCount(descriptors, "catalogs/hunts"),
    encounterDefinitions: descriptorCount(descriptors, "catalogs/encounter-definitions"),
  };
}

async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

function pathsOverlap(left: string, right: string): boolean {
  const a = resolve(left);
  const b = resolve(right);
  const aToB = relative(a, b);
  const bToA = relative(b, a);
  const inside = (value: string): boolean =>
    value === "" || (!value.startsWith("..") && !isAbsolute(value));
  return inside(aToB) || inside(bToA);
}

function assertSafeStagePaths(input: StagePromotionV5Input): void {
  const protectedRoots = [
    ["published baseline", input.basePublishedDirectory],
    ["PokéAPI snapshot", input.pokeApiSnapshotRoot],
    ["legacy cache", input.legacyCacheDirectory],
    ["stable legacy evidence", input.stableLegacyEvidenceDirectory],
  ] as const;
  for (const [label, path] of protectedRoots) {
    if (pathsOverlap(input.outputDirectory, path)) {
      throw new Error(`promotion outputDirectory must not overlap ${label}`);
    }
  }
  for (const [label, path] of protectedRoots.slice(0, 3)) {
    if (pathsOverlap(input.stableLegacyEvidenceDirectory, path)) {
      throw new Error(`stable legacy evidence directory must not overlap ${label}`);
    }
  }
}

function assertExpectedParity(report: ReturnType<typeof buildPokeApiParityReport>): void {
  const expected = { match: 5411, mismatch: 57, "missing-current": 35, "missing-source": 0, unmapped: 547 } as const;
  for (const [key, value] of Object.entries(expected)) {
    if (report.counts[key as keyof typeof report.counts] !== value) {
      throw new Error(`unexpected pre-promotion parity ${key}: ${report.counts[key as keyof typeof report.counts]} != ${value}`);
    }
  }
  const mismatchShape = new Map<string, number>();
  const missingShape = new Map<string, number>();
  const unmappedShape = new Map<string, number>();
  for (const entry of report.entries) {
    const key = `${entry.surface}|${entry.field}`;
    const target = entry.status === "mismatch" ? mismatchShape : entry.status === "missing-current" ? missingShape : entry.status === "unmapped" ? unmappedShape : null;
    if (target) target.set(key, (target.get(key) ?? 0) + 1);
  }
  const exact = (map: Map<string, number>, values: Record<string, number>, label: string): void => {
    if (map.size !== Object.keys(values).length) throw new Error(`unexpected ${label} shape`);
    for (const [key, value] of Object.entries(values)) if (map.get(key) !== value) throw new Error(`unexpected ${label} ${key}`);
  };
  exact(mismatchShape, { "species|sourceSlug": 42, "species|baseExperience": 5, "moves|makesContact": 10 }, "mismatch");
  exact(missingShape, { "items|sourceCategory": 30, "moves|record": 5 }, "missing-current");
  exact(unmappedShape, { "moves|sourceTarget": 547 }, "unmapped");
}

export async function stagePromotionV5Candidate(input: StagePromotionV5Input): Promise<StagedPromotionV5Candidate> {
  assertSafeStagePaths(input);
  const base = await loadPublishedPveV4BundleDirectory(input.basePublishedDirectory);
  if (base.manifest.gameDataVersion !== "game-data-core-kanto-johto-v3") throw new Error("promotion requires exact v3 baseline");

  const [speciesRaw, movesRaw, typesRaw, abilitiesRaw, itemsRaw, learnsetsRaw, matrixRaw, provenanceText] = await Promise.all([
    readCanonicalArray(join(base.directory, FACTUAL_PATHS.species), "Species"),
    readCanonicalArray(join(base.directory, FACTUAL_PATHS.moves), "Moves"),
    readCanonicalArray(join(base.directory, FACTUAL_PATHS.types), "Types"),
    readCanonicalArray(join(base.directory, FACTUAL_PATHS.abilities), "Abilities"),
    readCanonicalArray(join(base.directory, FACTUAL_PATHS.items), "Items"),
    readCanonicalArray(join(base.directory, FACTUAL_PATHS.learnsets), "Learnsets"),
    readCanonicalArray(join(base.directory, FACTUAL_PATHS.currentTypeEffectiveness), "Type effectiveness"),
    readFile(join(base.directory, base.manifest.provenanceManifest.path), "utf8"),
  ]);
  const oldProvenance = parseProvenanceManifest(JSON.parse(provenanceText) as unknown);
  const baseCandidate: GameDataCandidate = {
    schemaVersion: "3",
    normalizerVersion: base.manifest.normalizerVersion,
    catalogs: {
      species: speciesRaw.map(parseSpeciesDefinitionV2),
      moves: movesRaw.map(parseMoveDefinitionV1),
      types: typesRaw.map(parseTypeDefinitionV1),
      abilities: abilitiesRaw.map(parseAbilityDefinitionV1),
      items: itemsRaw.map(parseItemDefinitionV1),
      learnsets: learnsetsRaw.map(parseLearnsetEntryV1),
    },
    referenceData: { currentTypeEffectiveness: matrixRaw.map(parseTypeEffectivenessEntry) },
    provenance: oldProvenance,
  };

  const factsOriginal = await loadPokeApiLowAmbiguityFacts(input.pokeApiSnapshotRoot);
  validatePokeApiBindingRegistryCoverage(
    POKEAPI_BINDING_REGISTRY,
    factsOriginal,
    LOCAL_MAPPING_ROSTER.mappings,
    baseCandidate,
  );
  const facts = applyPokeApiMoveBindingOverrides(factsOriginal, POKEAPI_BINDING_REGISTRY);
  const parity = buildPokeApiParityReport(
    facts,
    baseCandidate,
    LOCAL_MAPPING_ROSTER.mappings,
    { species: POKEAPI_BINDING_REGISTRY.species },
    {},
  );
  assertExpectedParity(parity);

  const migration = await migrateLegacyV3Evidence({
    basePublishedDirectory: input.basePublishedDirectory,
    cacheDirectory: input.legacyCacheDirectory,
    outputDirectory: input.stableLegacyEvidenceDirectory,
  });

  const pokeApiRecords: SourceRecordV5[] = facts.snapshot.record.files.map((file) =>
    sourceRecordV5FromSnapshotFile(facts.snapshot.record, file.logicalPath, POKEAPI_CSV_PARSER_VERSION),
  );
  const allPokeApiRecordIds = new Set(pokeApiRecords.map((entry) => entry.id));
  const factSources: FactSourceRelationV5[] = [];
  const speciesMappingByKey = new Map(LOCAL_MAPPING_ROSTER.mappings.species.filter((entry) => entry.status === "accepted").map((entry) => [entry.sourceKey, entry] as const));
  const moveMappingByKey = new Map(LOCAL_MAPPING_ROSTER.mappings.moves.filter((entry) => entry.status === "accepted").map((entry) => [entry.sourceKey, entry] as const));
  const typeMappingByKey = new Map(LOCAL_MAPPING_ROSTER.mappings.types.filter((entry) => entry.status === "accepted").map((entry) => [entry.sourceKey, entry] as const));
  const abilityMappingByKey = new Map(LOCAL_MAPPING_ROSTER.mappings.abilities.filter((entry) => entry.status === "accepted").map((entry) => [entry.sourceKey, entry] as const));
  const itemMappingByKey = new Map(LOCAL_MAPPING_ROSTER.mappings.items.filter((entry) => entry.status === "accepted").map((entry) => [entry.sourceKey, entry] as const));
  const pokemonById = new Map(facts.pokemon.map((entry) => [entry.pokemonId, entry] as const));
  const sourceSpeciesById = new Map(facts.species.map((entry) => [entry.speciesId, entry] as const));
  const currentSpeciesById = new Map(baseCandidate.catalogs.species.map((entry) => [entry.id, entry] as const));

  const promotedSpecies = POKEAPI_BINDING_REGISTRY.species.map((binding) => {
    const mapping = speciesMappingByKey.get(binding.sourceKey);
    if (!mapping) throw new Error(`missing Species mapping ${binding.sourceKey}`);
    const current = currentSpeciesById.get(mapping.canonicalId);
    const pokemon = pokemonById.get(binding.pokemonId);
    if (!current || !pokemon) throw new Error(`missing Species promotion input ${binding.sourceKey}`);
    const sourceSpecies = sourceSpeciesById.get(pokemon.speciesId);
    if (!sourceSpecies) throw new Error(`missing PokéAPI species ${pokemon.speciesId}`);
    const legacyIds = mapLegacyIds(current.sourceRecordIds, migration);
    const promotedFacts: PokeApiFactEvidenceKey[] = [
      "species.sourceSlug", "species.nationalDexNumber", "species.typeIds", "species.baseStats",
      "species.abilities", "species.catchRate", "species.baseExperience", "species.growthRate",
      "species.heightMillimeters", "species.weightGrams", "species.eggGroups", "species.genderRatio", "species.evYield",
    ];
    if (pokemon.isDefault) promotedFacts.push("species.introducedGeneration");
    const promotedIds = unionIds(...promotedFacts.map((fact) => evidenceIds(facts.snapshot, fact)));
    for (const fact of promotedFacts) {
      factSources.push({
        subjectKind: "species",
        subjectKey: current.id,
        factKey: fact.slice("species.".length) as FactSourceRelationV5["factKey"],
        sourceRecordIds: evidenceIds(facts.snapshot, fact),
      });
    }
    for (const factKey of ["sourceName", "formLabel", "eggCycles", "baseFriendship"] as const) {
      factSources.push({ subjectKind: "species", subjectKey: current.id, factKey, sourceRecordIds: legacyIds });
    }
    if (!pokemon.isDefault) {
      factSources.push({ subjectKind: "species", subjectKey: current.id, factKey: "introducedGeneration", sourceRecordIds: legacyIds });
    }
    return {
      ...current,
      sourceSlug: pokemon.sourceSlug,
      baseExperience: sourceFact(pokemon.baseExperience),
      sourceRecordIds: unionIds(legacyIds, promotedIds),
    };
  });

  const currentTypesById = new Map(baseCandidate.catalogs.types.map((entry) => [entry.id, entry] as const));
  const promotedTypes = facts.types.flatMap((source) => {
    const mapping = typeMappingByKey.get(source.sourceSlug);
    if (!mapping) return [];
    const current = currentTypesById.get(mapping.canonicalId);
    if (!current) throw new Error(`missing Type ${mapping.canonicalId}`);
    const nameIds = evidenceIds(facts.snapshot, "type.sourceName");
    const slugIds = evidenceIds(facts.snapshot, "type.sourceSlug");
    factSources.push({ subjectKind: "type", subjectKey: current.id, factKey: "sourceName", sourceRecordIds: nameIds });
    factSources.push({ subjectKind: "type", subjectKey: current.id, factKey: "sourceSlug", sourceRecordIds: slugIds });
    return [{ ...current, sourceName: source.sourceName, sourceSlug: source.sourceSlug, sourceRecordIds: unionIds(nameIds, slugIds) }];
  });

  const currentAbilitiesById = new Map(baseCandidate.catalogs.abilities.map((entry) => [entry.id, entry] as const));
  const promotedAbilities = facts.abilities.flatMap((source) => {
    const mapping = abilityMappingByKey.get(source.sourceSlug);
    if (!mapping) return [];
    const current = currentAbilitiesById.get(mapping.canonicalId);
    if (!current) throw new Error(`missing Ability ${mapping.canonicalId}`);
    const nameIds = evidenceIds(facts.snapshot, "ability.sourceName");
    const slugIds = evidenceIds(facts.snapshot, "ability.sourceSlug");
    const genIds = evidenceIds(facts.snapshot, "ability.introducedGeneration");
    factSources.push({ subjectKind: "ability", subjectKey: current.id, factKey: "sourceName", sourceRecordIds: nameIds });
    factSources.push({ subjectKind: "ability", subjectKey: current.id, factKey: "sourceSlug", sourceRecordIds: slugIds });
    factSources.push({ subjectKind: "ability", subjectKey: current.id, factKey: "introducedGeneration", sourceRecordIds: genIds });
    return [{ ...current, sourceName: source.sourceName, sourceSlug: source.sourceSlug, introducedGeneration: source.introducedGeneration, sourceRecordIds: unionIds(nameIds, slugIds, genIds) }];
  });

  const currentItemsById = new Map(baseCandidate.catalogs.items.map((entry) => [entry.id, entry] as const));
  const promotedItems = facts.items.flatMap((source) => {
    const mapping = itemMappingByKey.get(source.sourceSlug);
    if (!mapping) return [];
    const current = currentItemsById.get(mapping.canonicalId);
    if (!current || source.sourceName === null) throw new Error(`missing accepted Item evidence ${source.sourceSlug}`);
    const nameIds = evidenceIds(facts.snapshot, "item.sourceName");
    const slugIds = evidenceIds(facts.snapshot, "item.sourceSlug");
    const categoryIds = evidenceIds(facts.snapshot, "item.sourceCategory");
    factSources.push({ subjectKind: "item", subjectKey: current.id, factKey: "sourceName", sourceRecordIds: nameIds });
    factSources.push({ subjectKind: "item", subjectKey: current.id, factKey: "sourceSlug", sourceRecordIds: slugIds });
    factSources.push({ subjectKind: "item", subjectKey: current.id, factKey: "sourceCategory", sourceRecordIds: categoryIds });
    return [{ ...current, sourceName: source.sourceName, sourceSlug: source.sourceSlug, sourceCategory: source.sourceCategory, sourceRecordIds: unionIds(nameIds, slugIds, categoryIds) }];
  });

  const oldMoveFactById = new Map(oldProvenance.moveFactSources.map((entry) => [entry.moveId, entry] as const));
  const oldSourceById = new Map(oldProvenance.sourceRecords.map((entry) => [entry.id, entry] as const));
  const sourceMoveByKey = new Map(facts.moves.map((entry) => [entry.sourceSlug, entry] as const));
  const moveFactSources: MoveFactSourceRelationV2[] = [];
  const contactIds = evidenceIds(facts.snapshot, "move.makesContact");
  let multiSourceMainlineMoveCount = 0;
  const promotedMoves = baseCandidate.catalogs.moves.map((current) => {
    const mapping = [...moveMappingByKey.values()].find((entry) => entry.canonicalId === current.id);
    if (!mapping) throw new Error(`missing Move mapping for ${current.id}`);
    const source = sourceMoveByKey.get(mapping.sourceKey);
    const oldRelation = oldMoveFactById.get(current.id);
    if (!source || !oldRelation) throw new Error(`missing Move promotion evidence for ${mapping.sourceKey}`);
    const availabilityContextIds = current.sourceRecordIds.filter((id) =>
      isLegacyMoveAvailabilitySourceRecord(oldSourceById.get(id)),
    );
    const mainlineIds = mapLegacyIds(
      unionIds([oldRelation.mainline.sourceRecordId], availabilityContextIds),
      migration,
    );
    if (mainlineIds.length > 1) multiSourceMainlineMoveCount += 1;
    const targetIds = mapLegacyIds([oldRelation.sourceTargetSourceRecordId], migration);
    const zaIds = mapLegacyIds([oldRelation.zaBaseCooldownSourceRecordId], migration);
    moveFactSources.push({
      moveId: current.id,
      mainline: { selectedGame: oldRelation.mainline.selectedGame, sourceRecordIds: mainlineIds },
      sourceTargetSourceRecordIds: targetIds,
      makesContactSourceRecordIds: contactIds,
      zaBaseCooldownSourceRecordIds: zaIds,
    });
    return { ...current, makesContact: source.makesContact, sourceRecordIds: unionIds(mainlineIds, targetIds, contactIds, zaIds) };
  });
  if (multiSourceMainlineMoveCount !== 32) {
    throw new Error(`expected 32 Moves with multi-source mainline selection evidence, got ${multiSourceMainlineMoveCount}`);
  }

  const promotedLearnsets = baseCandidate.catalogs.learnsets.map((entry) => ({
    ...entry,
    sourceRecordIds: mapLegacyIds(entry.sourceRecordIds, migration),
  }));

  const canonicalTypeIdByPokeApiId = new Map<number, string>();
  for (const type of facts.types) {
    const mapping = typeMappingByKey.get(type.sourceSlug);
    if (mapping) canonicalTypeIdByPokeApiId.set(type.typeId, mapping.canonicalId);
  }
  const matrixByKey = new Map<string, GameDataCandidate["referenceData"]["currentTypeEffectiveness"][number]>(
    baseCandidate.referenceData.currentTypeEffectiveness.map((entry) => [
      `${entry.attackTypeId}\u0000${entry.defenseTypeId}`,
      entry,
    ]),
  );
  const matrixIds = evidenceIds(facts.snapshot, "type-effectiveness.multiplier");
  const promotedMatrix = facts.typeEffectiveness.flatMap((source) => {
    const attack = canonicalTypeIdByPokeApiId.get(source.attackTypeId);
    const defense = canonicalTypeIdByPokeApiId.get(source.defenseTypeId);
    if (!attack || !defense) return [];
    const key = `${attack}\u0000${defense}`;
    const current = matrixByKey.get(key);
    if (!current) throw new Error(`missing Type effectiveness ${key}`);
    factSources.push({ subjectKind: "type-effectiveness", subjectKey: key, factKey: "multiplier", sourceRecordIds: matrixIds });
    return [{ ...current, multiplier: source.damageFactor / 100 as 0 | 0.5 | 1 | 2, sourceRecordIds: matrixIds }];
  });

  if (promotedSpecies.length !== 293 || promotedMoves.length !== 547 || promotedTypes.length !== 18 || promotedAbilities.length !== 147 || promotedItems.length !== 30 || promotedMatrix.length !== 324) {
    throw new Error("promotion catalog coverage mismatch");
  }

  const promotedCandidate: GameDataCandidate = {
    schemaVersion: "3",
    normalizerVersion: PROMOTION_NORMALIZER_VERSION,
    catalogs: {
      species: promotedSpecies,
      moves: promotedMoves,
      types: promotedTypes,
      abilities: promotedAbilities,
      items: promotedItems,
      learnsets: promotedLearnsets,
    },
    referenceData: { currentTypeEffectiveness: promotedMatrix },
    provenance: oldProvenance,
  };
  const postPromotionParity = buildPokeApiParityReport(
    facts,
    promotedCandidate,
    LOCAL_MAPPING_ROSTER.mappings,
    { species: POKEAPI_BINDING_REGISTRY.species },
    {},
  );
  const expectedPost = { match: 5498, mismatch: 0, "missing-current": 5, "missing-source": 0, unmapped: 547 } as const;
  for (const [key, value] of Object.entries(expectedPost)) {
    if (postPromotionParity.counts[key as keyof typeof postPromotionParity.counts] !== value) {
      throw new Error(`unexpected post-promotion parity ${key}`);
    }
  }
  const factualArtifacts = canonicalizeCandidateArtifacts(promotedCandidate);

  const referencedPokeApiIds = new Set<string>();
  for (const relation of factSources) {
    for (const id of relation.sourceRecordIds) if (allPokeApiRecordIds.has(id)) referencedPokeApiIds.add(id);
  }
  for (const relation of moveFactSources) {
    for (const id of relation.makesContactSourceRecordIds) if (allPokeApiRecordIds.has(id)) referencedPokeApiIds.add(id);
  }
  const usedPokeApiRecords = pokeApiRecords.filter((entry) => referencedPokeApiIds.has(entry.id));
  if (usedPokeApiRecords.length !== referencedPokeApiIds.size) {
    throw new Error("schema-5 promotion references an unknown PokéAPI SourceRecord");
  }

  const provenance = finalizeProvenanceManifestV5({
    sourceSnapshots: [...migration.sourceSnapshots, facts.snapshot.record],
    sourceRecords: [...migration.sourceRecords, ...usedPokeApiRecords],
    factSources,
    moveFactSources,
    inventories: oldProvenance.inventories,
  });
  const parsedProvenance = provenance;
  const canonicalSourceRecordIds = new Set(parsedProvenance.sourceRecords.map((entry) => entry.id));
  for (const relation of parsedProvenance.factSources) {
    for (const id of relation.sourceRecordIds) if (!canonicalSourceRecordIds.has(id)) throw new Error(`unknown fact evidence ${id}`);
  }
  const provenanceBytes = Buffer.from(canonicalJson(provenance), "utf8");
  const sourceInventoryBytes = Buffer.from(canonicalJson(canonicalSourceInventories(provenance.inventories)), "utf8");
  const provenanceHash = provenance.provenanceHash;
  if (!provenanceHash) throw new Error("schema-5 provenance must have provenanceHash");

  const pveDescriptors = [];
  const pveBytes = new Map<string, Buffer>();
  for (const [logicalName, relativePath] of Object.entries(PVE_PATHS)) {
    const descriptor = base.manifest.artifacts.find((entry) => entry.logicalName === logicalName);
    if (!descriptor) throw new Error(`v3 baseline missing ${logicalName}`);
    const bytes = await readFile(join(base.directory, relativePath));
    if (sha256(bytes) !== descriptor.contentHash) throw new Error(`v3 PvE hash mismatch for ${logicalName}`);
    pveDescriptors.push(descriptor);
    pveBytes.set(logicalName, bytes);
  }
  const descriptors = [
    ...Object.values(factualArtifacts).map(({ descriptor }) => descriptor),
    ...pveDescriptors,
  ].sort((left, right) => left.logicalName.localeCompare(right.logicalName, "en", { sensitivity: "variant" }));
  const candidateBundleHash = bundleHash(GAME_DATA_SCHEMA_V5, PROMOTION_CANDIDATE_GAME_DATA_VERSION, descriptors, provenanceHash);

  const deltas: PromotionV5ReviewDelta[] = [];
  const baseSpeciesMap = new Map(baseCandidate.catalogs.species.map((entry) => [entry.id, entry] as const));
  for (const after of promotedSpecies) {
    const before = baseSpeciesMap.get(after.id)!;
    if (canonicalJson(before.sourceSlug) !== canonicalJson(after.sourceSlug)) deltas.push({ surface: "species", canonicalId: after.id, field: "sourceSlug", before: before.sourceSlug, after: after.sourceSlug });
    if (canonicalJson(before.baseExperience) !== canonicalJson(after.baseExperience)) deltas.push({ surface: "species", canonicalId: after.id, field: "baseExperience", before: before.baseExperience, after: after.baseExperience });
  }
  const baseMoveMap = new Map(baseCandidate.catalogs.moves.map((entry) => [entry.id, entry] as const));
  for (const after of promotedMoves) {
    const before = baseMoveMap.get(after.id)!;
    if (before.makesContact !== after.makesContact) deltas.push({ surface: "moves", canonicalId: after.id, field: "makesContact", before: before.makesContact, after: after.makesContact });
  }
  const baseItemMap = new Map(baseCandidate.catalogs.items.map((entry) => [entry.id, entry] as const));
  for (const after of promotedItems) {
    const before = baseItemMap.get(after.id)!;
    if (before.sourceCategory !== after.sourceCategory) deltas.push({ surface: "items", canonicalId: after.id, field: "sourceCategory", before: before.sourceCategory, after: after.sourceCategory });
  }
  const countsByField = new Map<string, number>();
  for (const delta of deltas) countsByField.set(`${delta.surface}|${delta.field}`, (countsByField.get(`${delta.surface}|${delta.field}`) ?? 0) + 1);
  if (deltas.length !== 87 || countsByField.get("species|sourceSlug") !== 42 || countsByField.get("species|baseExperience") !== 5 || countsByField.get("moves|makesContact") !== 10 || countsByField.get("items|sourceCategory") !== 30) {
    throw new Error("factual promotion delta does not match approved SPEC-023 contract");
  }
  const affectedRecords = new Set(deltas.map((delta) => `${delta.surface}\u0000${delta.canonicalId}`));
  if (affectedRecords.size !== 83) throw new Error(`expected 83 factually changed records, got ${affectedRecords.size}`);

  const review: PromotionV5Review = {
    reviewVersion: "task-114-promotion-review-v1",
    baseGameDataVersion: base.manifest.gameDataVersion,
    baseBundleHash: base.manifest.bundleHash,
    candidateGameDataVersion: PROMOTION_CANDIDATE_GAME_DATA_VERSION,
    candidateBundleHash,
    provenanceHash,
    prePromotionParity: { match: 5411, mismatch: 57, missingCurrent: 35, missingSource: 0, unmapped: 547 },
    postPromotionParity: { match: 5498, mismatch: 0, missingCurrent: 5, missingSource: 0, unmapped: 547 },
    factualDelta: { fieldChanges: 87, records: 83, speciesSourceSlug: 42, speciesBaseExperience: 5, moveMakesContact: 10, itemSourceCategory: 30 },
    historicalEvidence: {
      explicitRoleRecords: 1144,
      additionalMainlineContextRecords: 2,
      totalRecords: 1146,
      multiSourceMainlineMoves: multiSourceMainlineMoveCount,
    },
    deltas: deltas.sort((left, right) => `${left.surface}\u0000${left.canonicalId}\u0000${left.field}`.localeCompare(`${right.surface}\u0000${right.canonicalId}\u0000${right.field}`)),
    retainedPveArtifactHashes: Object.fromEntries(pveDescriptors.map((entry) => [entry.logicalName, entry.contentHash])) as PromotionV5Review["retainedPveArtifactHashes"],
  };
  const reviewBytes = Buffer.from(canonicalJson(review), "utf8");
  const reviewHash = sha256(reviewBytes);
  const provenanceDescriptor = { logicalName: "provenance" as const, path: "provenance.json" as const, contentHash: sha256(provenanceBytes) };
  const sourceInventoryDescriptor = { logicalName: "source-inventory" as const, path: "source-inventory.json" as const, contentHash: sha256(sourceInventoryBytes) };
  const manifest: PromotionV5StageManifest = {
    stageManifestVersion: PROMOTION_V5_STAGE_VERSION,
    schemaVersion: GAME_DATA_SCHEMA_V5,
    pveContentSchemaVersion: PVE_CONTENT_SCHEMA_VERSION,
    baseGameDataVersion: base.manifest.gameDataVersion,
    baseBundleHash: base.manifest.bundleHash,
    candidateGameDataVersion: PROMOTION_CANDIDATE_GAME_DATA_VERSION,
    candidateBundleHash,
    normalizerVersion: PROMOTION_NORMALIZER_VERSION,
    provenanceHash,
    provenanceManifest: provenanceDescriptor,
    sourceInventory: sourceInventoryDescriptor,
    artifacts: descriptors,
    catalogCounts: catalogCounts(descriptors),
    reviewHash,
  };

  const previewManifest: GameDataManifestV5 = parseGameDataManifestV5({
    schemaVersion: GAME_DATA_SCHEMA_V5,
    pveContentSchemaVersion: PVE_CONTENT_SCHEMA_VERSION,
    gameDataVersion: PROMOTION_CANDIDATE_GAME_DATA_VERSION,
    bundleHash: candidateBundleHash,
    provenanceHash,
    publishedAt: "1970-01-01T00:00:00.000Z",
    normalizerVersion: PROMOTION_NORMALIZER_VERSION,
    artifacts: descriptors,
    provenanceManifest: provenanceDescriptor,
    sourceInventory: sourceInventoryDescriptor,
    catalogCounts: manifest.catalogCounts,
  });

  await rm(input.outputDirectory, { recursive: true, force: true });
  await mkdir(input.outputDirectory, { recursive: true });
  for (const [key, artifact] of Object.entries(factualArtifacts)) {
    const relativePath = FACTUAL_PATHS[key as keyof typeof FACTUAL_PATHS];
    await writeBytes(join(input.outputDirectory, relativePath), artifact.bytes);
  }
  for (const [logicalName, relativePath] of Object.entries(PVE_PATHS)) {
    await writeBytes(join(input.outputDirectory, relativePath), pveBytes.get(logicalName)!);
  }
  await writeBytes(join(input.outputDirectory, provenanceDescriptor.path), provenanceBytes);
  await writeBytes(join(input.outputDirectory, sourceInventoryDescriptor.path), sourceInventoryBytes);
  await writeBytes(join(input.outputDirectory, "candidate-manifest.json"), Buffer.from(canonicalJson(manifest), "utf8"));
  await writeBytes(join(input.outputDirectory, "runtime-preview-manifest.json"), Buffer.from(canonicalJson(previewManifest), "utf8"));
  await writeBytes(join(input.outputDirectory, "human-review.json"), reviewBytes);

  for (const descriptor of descriptors) {
    const relativePath = GAME_DATA_V5_ARTIFACT_PATHS[descriptor.logicalName as keyof typeof GAME_DATA_V5_ARTIFACT_PATHS];
    if (!relativePath) throw new Error(`unsupported schema-5 artifact ${descriptor.logicalName}`);
    const bytes = await readFile(join(input.outputDirectory, relativePath));
    if (sha256(bytes) !== descriptor.contentHash) throw new Error(`staged artifact hash mismatch ${descriptor.logicalName}`);
  }
  return { directory: input.outputDirectory, manifest, review, reviewHash, provenance };
}
