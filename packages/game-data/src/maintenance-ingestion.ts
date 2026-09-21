import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  fetchBulbapediaSources,
  fetchBulbapediaRobotsPolicy,
  type BulbapediaFetchOptions,
} from "./bulbapedia-ingestion.js";
import {
  BULBAPEDIA_ABILITY_LIST_PARSER_VERSION,
  BULBAPEDIA_ABILITY_LIST_URL,
  BULBAPEDIA_ITEM_LIST_PARSER_VERSION,
  BULBAPEDIA_ITEM_LIST_URL,
  BULBAPEDIA_TYPE_CHART_PARSER_VERSION,
  BULBAPEDIA_TYPE_CHART_URL,
  parseBulbapediaAbilityList,
  parseBulbapediaCurrentTypeChart,
  parseBulbapediaItemList,
  type BulbapediaReferenceHtmlSource,
} from "./bulbapedia-reference-parser.js";
import {
  BULBAPEDIA_GEN9_MOVE_LIST_URL,
  BULBAPEDIA_GEN9_MOVE_PARSER_VERSION,
  parseBulbapediaGen9Moves,
} from "./bulbapedia-gen9-move-parser.js";
import {
  BULBAPEDIA_GEN7_MOVE_LIST_URL,
  BULBAPEDIA_GEN8_MOVE_LIST_URL,
  BULBAPEDIA_HISTORICAL_MOVE_PARSER_VERSION,
  parseBulbapediaGen7Moves,
  parseBulbapediaGen8Moves,
} from "./bulbapedia-historical-move-parser.js";
import {
  BULBAPEDIA_HISTORICAL_SCALAR_PROOF_PARSER_VERSION,
  buildBulbapediaHistoricalScalarProofUrl,
  parseBulbapediaHistoricalScalarProof,
} from "./bulbapedia-historical-scalar-proof.js";
import {
  BULBAPEDIA_ZA_MOVE_LIST_URL,
  BULBAPEDIA_ZA_MOVE_PARSER_VERSION,
  canonicalizeBulbapediaMoveName,
  parseBulbapediaZaBaseMoveCooldowns,
  type BulbapediaHtmlSource,
  type ExtractedBulbapediaZaBaseMoveCooldown,
} from "./bulbapedia-za-parser.js";
import {
  BULBAPEDIA_REGIONAL_FORM_EVIDENCE_PARSER_VERSION,
  BULBAPEDIA_REGIONAL_FORM_LIST_URL,
  BULBAPEDIA_SPECIES_PAGE_PARSER_VERSION,
  canonicalizeBulbapediaRegionAdjective,
  parseBulbapediaBaseSpeciesEvidence,
  parseBulbapediaRegionalForms,
  type BulbapediaSpeciesEvidenceHtmlSource,
  type ExtractedBulbapediaRegionalFormEvidence,
} from "./bulbapedia-species-evidence.js";
import {
  BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_PARSER_VERSION,
  BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_URL,
  parseBulbapediaSpeciesStaticFacts,
  parseBulbapediaKantoJohtoSpeciesDiscovery,
  type BulbapediaFormLabel,
  type BulbapediaScopedFact,
  type BulbapediaStaticFact,
  type ExtractedBulbapediaCoreSpeciesDiscovery,
  type ExtractedBulbapediaSpeciesStaticFacts,
} from "./bulbapedia-species-static-facts.js";
import {
  BULBAPEDIA_GEN8_BDSP_LEARNSET_PARSER_VERSION,
  BULBAPEDIA_GEN9_LEARNSET_PARSER_VERSION,
  canonicalizeBulbapediaLearnsetSpeciesName,
  parseBulbapediaGen8BdspLearnset,
  parseBulbapediaGen9Learnset,
  type BulbapediaLearnsetHtmlSource,
} from "./bulbapedia-learnset-parser.js";
import {
  parseBulbapediaSpeciesBaseStats,
  type ExtractedBulbapediaSpeciesBaseStats,
} from "./bulbapedia-species-base-stats.js";
import { canonicalJson } from "./canonical.js";
import {
  MaintenanceFetchHttpError,
  fetchPokemonDbRobotsPolicy,
  fetchPokemonDbSources,
  type FetchedMaintenanceSource,
  type FetchedPokemonDbSource,
  type PokemonDbFetchOptions,
  type RobotsPolicy,
} from "./ingestion.js";
import {
  LOCAL_MAPPING_ROSTER,
  type LocalMappingRoster,
} from "./mapping-roster.js";
import {
  materializeBdspHistoricalScalarProofs,
  requiredHistoricalScalarProof,
  selectMainlineMoveFacts,
} from "./move-mainline-selection.js";
import {
  learnsetInventoryKey,
  normalizeRawExtractedSnapshot,
  type CandidateValidationReport,
  type ExclusionsBySurface,
  type RawExtractedSnapshot,
} from "./normalization.js";
import {
  POKEMONDB_PARSER_VERSION,
  discoverPokemonDbSpeciesForms,
  parsePokemonDbItemPage,
  parsePokemonDbMovePage,
  parsePokemonDbSpeciesPage,
  type DiscoveredPokemonDbSpeciesForm,
  type ExtractedPokemonDbAbility,
  type ExtractedPokemonDbItem,
  type ExtractedPokemonDbLearnsetEntry,
  type ExtractedPokemonDbMove,
  type ExtractedPokemonDbSpecies,
  type PokemonDbHtmlSource,
} from "./pokemondb-parser.js";
import { validatePublicationReadiness } from "./publication.js";
import {
  buildReviewStage,
  type ReviewExcludedSpeciesEvidence,
  type ReviewStageArtifacts,
} from "./review-stage.js";
import type {
  ExcludedOrDeferredSourceKey,
  MappingRegistry,
  SourceProvider,
  SourceRecord,
  ValidationFinding,
} from "./schema.js";

export interface SpeciesPageIngestionProfile {
  pokemonDbUrl: string;
  bulbapediaUrl: string;
  excludedOrDeferred?: ExcludedOrDeferredSourceKey[];
  bulbapediaExcludedOrDeferredForms?: BulbapediaFormDispositionProfile[];
}

export interface BulbapediaFormDispositionProfile {
  formLabel: string;
  disposition: "excluded" | "deferred";
  reason: string;
}

export interface LearnsetPageIngestionProfile {
  bulbapediaUrl: string;
  bdspFallbackUrl?: string;
  speciesSourceKey: string;
}

export interface ItemPageIngestionProfile {
  sourceKey: string;
  pokemonDbUrl: string;
}

export interface MaintenanceIngestionProfile {
  speciesPages?: SpeciesPageIngestionProfile[];
  movePages?: string[];
  items?: ItemPageIngestionProfile[];
  learnsetPages?: LearnsetPageIngestionProfile[];
}

export interface MaintenanceIngestionOptions {
  outputDirectory: string;
  cacheDirectory: string;
  profile: MaintenanceIngestionProfile;
  intent?: "smoke" | "full-candidate";
  roster?: LocalMappingRoster;
  fetchOptions?: Omit<PokemonDbFetchOptions, "cacheDirectory">;
  bulbapediaFetchOptions?: Omit<BulbapediaFetchOptions, "cacheDirectory">;
}

function maintenanceIntentFindings(
  intent: NonNullable<MaintenanceIngestionOptions["intent"]>,
): ValidationFinding[] {
  if (intent === "full-candidate") return [];
  return [
    {
      code: "maintenance-smoke-not-publishable",
      path: "maintenance.intent",
      message:
        "smoke ingestion is intentionally partial and cannot be represented as publication-ready",
    },
  ];
}

export interface MaintenanceIngestionResult {
  outputDirectory: string;
  rawExtracted: RawExtractedSnapshot;
  mappingRegistry: MappingRegistry;
  validationReport: CandidateValidationReport;
  reviewStage?: ReviewStageArtifacts;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function sourceRecordIdForUrl(provider: SourceProvider, url: string): string {
  const digest = createHash("sha256")
    .update(Buffer.from(new URL(url).href.normalize("NFC"), "utf8"))
    .digest("hex");
  return `source:${provider}:` + digest;
}

function parserSource(source: FetchedPokemonDbSource): PokemonDbHtmlSource {
  return {
    url: source.url,
    sourceRecordId: sourceRecordIdForUrl("pokemondb", source.url),
    html: source.bytes.toString("utf8"),
  };
}

function bulbapediaParserSource(source: FetchedMaintenanceSource): BulbapediaHtmlSource {
  return {
    url: source.url,
    sourceRecordId: sourceRecordIdForUrl("bulbapedia", source.url),
    html: source.bytes.toString("utf8"),
  };
}

function bulbapediaReferenceSource(
  source: FetchedMaintenanceSource,
): BulbapediaReferenceHtmlSource {
  return {
    url: source.url,
    sourceRecordId: sourceRecordIdForUrl("bulbapedia", source.url),
    html: source.bytes.toString("utf8"),
  };
}

function bulbapediaSpeciesEvidenceSource(
  source: FetchedMaintenanceSource,
): BulbapediaSpeciesEvidenceHtmlSource {
  return {
    url: source.url,
    sourceRecordId: sourceRecordIdForUrl("bulbapedia", source.url),
    html: source.bytes.toString("utf8"),
  };
}

function bulbapediaLearnsetSource(
  source: FetchedMaintenanceSource,
): BulbapediaLearnsetHtmlSource {
  return {
    url: source.url,
    sourceRecordId: sourceRecordIdForUrl("bulbapedia", source.url),
    html: source.bytes.toString("utf8"),
  };
}

function sourceRecord(
  source: FetchedMaintenanceSource,
  provider: SourceProvider,
  parserVersion: string,
): SourceRecord {
  return {
    id: sourceRecordIdForUrl(provider, source.url),
    provider,
    canonicalUrl: source.url,
    fetchedAt: source.fetchedAt,
    parserVersion,
    sourceContentHash: source.sourceContentHash,
    fetchStatus: source.fetchStatus,
  };
}

export function enrichMovesWithZaBaseCooldowns(
  moves: ExtractedPokemonDbMove[],
  zaCooldowns: ExtractedBulbapediaZaBaseMoveCooldown[],
  zaSourceRecordId: string,
): ExtractedPokemonDbMove[] {
  if (!zaSourceRecordId.trim()) {
    throw new Error("Z-A Base Cooldown enrichment requires a Bulbapedia SourceRecord ID");
  }
  const byKey = new Map<string, ExtractedBulbapediaZaBaseMoveCooldown>();
  for (const record of zaCooldowns) {
    if (record.sourceRecordId !== zaSourceRecordId) {
      throw new Error(
        `Z-A Base Cooldown record ${record.sourceKey} references an unexpected SourceRecord ID`,
      );
    }
    if (byKey.has(record.sourceKey)) {
      throw new Error(`duplicate Z-A Base Cooldown join key ${record.sourceKey}`);
    }
    byKey.set(record.sourceKey, record);
  }

  const seenMainlineKeys = new Map<string, string>();
  return moves.map((move) => {
    const joinKey = canonicalizeBulbapediaMoveName(move.sourceName);
    const priorSourceKey = seenMainlineKeys.get(joinKey);
    if (priorSourceKey !== undefined && priorSourceKey !== move.sourceKey) {
      throw new Error(
        `ambiguous mainline Move join key ${joinKey} for ${priorSourceKey} and ${move.sourceKey}`,
      );
    }
    seenMainlineKeys.set(joinKey, move.sourceKey);
    const zaRecord = byKey.get(joinKey);
    return {
      ...move,
      zaBaseCooldownMs: zaRecord?.zaBaseCooldownMs ?? null,
      zaBaseCooldownSourceRecordId: zaSourceRecordId,
    };
  });
}

function stableUniquePokemonDbUrls(profile: MaintenanceIngestionProfile): string[] {
  const ordered = [
    ...(profile.speciesPages ?? []).map((entry) => entry.pokemonDbUrl),
    ...(profile.movePages ?? []),
    ...(profile.items ?? []).map((entry) => entry.pokemonDbUrl),
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawUrl of ordered) {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.hostname !== "pokemondb.net") {
      throw new Error("maintenance ingestion PokémonDB profile only permits https://pokemondb.net URLs");
    }
    const canonical = url.href;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    result.push(canonical);
  }
  return result;
}

function stableUniqueBulbapediaUrls(
  profile: MaintenanceIngestionProfile,
  intent: NonNullable<MaintenanceIngestionOptions["intent"]>,
): string[] {
  const needsTypeChart =
    (profile.speciesPages?.length ?? 0) > 0 || (profile.movePages?.length ?? 0) > 0;
  const ordered = [
    ...(intent === "full-candidate" ? [BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_URL] : []),
    ...(needsTypeChart ? [BULBAPEDIA_TYPE_CHART_URL] : []),
    ...((profile.speciesPages?.length ?? 0) > 0 ? [BULBAPEDIA_ABILITY_LIST_URL] : []),
    ...((profile.items?.length ?? 0) > 0 ? [BULBAPEDIA_ITEM_LIST_URL] : []),
    ...((profile.speciesPages?.length ?? 0) > 0
      ? [BULBAPEDIA_REGIONAL_FORM_LIST_URL]
      : []),
    ...(profile.speciesPages ?? []).map((entry) => entry.bulbapediaUrl),
    ...((profile.movePages?.length ?? 0) > 0
      ? [
          BULBAPEDIA_GEN9_MOVE_LIST_URL,
          BULBAPEDIA_GEN8_MOVE_LIST_URL,
          BULBAPEDIA_GEN7_MOVE_LIST_URL,
          BULBAPEDIA_ZA_MOVE_LIST_URL,
        ]
      : []),
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawUrl of ordered) {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.hostname !== "bulbapedia.bulbagarden.net") {
      throw new Error(
        "maintenance ingestion Bulbapedia profile only permits https://bulbapedia.bulbagarden.net URLs",
      );
    }
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    result.push(url.href);
  }
  return result;
}

export async function fetchConfiguredLearnsetSources(
  profile: MaintenanceIngestionProfile,
  options: BulbapediaFetchOptions,
  policy: RobotsPolicy,
): Promise<{
  sources: FetchedMaintenanceSource[];
  selectedUrlBySpeciesSourceKey: Map<string, string>;
}> {
  const sourcesByUrl = new Map<string, FetchedMaintenanceSource>();
  const selectedUrlBySpeciesSourceKey = new Map<string, string>();

  for (const entry of profile.learnsetPages ?? []) {
    let selected: FetchedMaintenanceSource;
    try {
      const primary = await fetchBulbapediaSources(
        [entry.bulbapediaUrl],
        options,
        policy,
      );
      selected = primary.sources[0];
      if (!selected) throw new Error(`Generation IX learnset fetch returned no source for ${entry.speciesSourceKey}`);
    } catch (error) {
      if (!(error instanceof MaintenanceFetchHttpError) || error.status !== 404) throw error;
      if (!entry.bdspFallbackUrl) {
        throw new Error(
          `Generation IX learnset is structurally unavailable for ${entry.speciesSourceKey}; approved BDSP fallback URL is required`,
          { cause: error },
        );
      }
      const fallback = await fetchBulbapediaSources(
        [entry.bdspFallbackUrl],
        options,
        policy,
      );
      selected = fallback.sources[0];
      if (!selected) throw new Error(`BDSP learnset fallback fetch returned no source for ${entry.speciesSourceKey}`);
    }
    sourcesByUrl.set(selected.url, selected);
    selectedUrlBySpeciesSourceKey.set(entry.speciesSourceKey.normalize("NFC"), selected.url);
  }

  return {
    sources: [...sourcesByUrl.values()],
    selectedUrlBySpeciesSourceKey,
  };
}

function mergeExclusions(
  roster: LocalMappingRoster,
  profile: MaintenanceIngestionProfile,
): ExclusionsBySurface {
  const result: ExclusionsBySurface = {};
  for (const [surface, entries] of Object.entries(roster.excludedOrDeferred)) {
    if (!entries) continue;
    result[surface as keyof ExclusionsBySurface] = entries.map((entry) => ({ ...entry }));
  }
  const stagedSpecies = (profile.speciesPages ?? []).flatMap(
    (entry) => entry.excludedOrDeferred ?? [],
  );
  if (stagedSpecies.length > 0) {
    result.species = [...(result.species ?? []), ...stagedSpecies.map((entry) => ({ ...entry }))];
  }
  const stagedBulbapediaForms = (profile.speciesPages ?? []).flatMap((page) =>
    (page.bulbapediaExcludedOrDeferredForms ?? []).map((entry) => ({
      sourceKey: bulbapediaFormDispositionSourceKey(page.bulbapediaUrl, entry.formLabel),
      disposition: entry.disposition,
      reason: entry.reason,
    })),
  );
  if (stagedBulbapediaForms.length > 0) {
    result.species = [...(result.species ?? []), ...stagedBulbapediaForms];
  }
  for (const [surface, entries] of Object.entries(result)) {
    const keys = entries?.map((entry) => entry.sourceKey.normalize("NFC")) ?? [];
    if (new Set(keys).size !== keys.length) {
      throw new Error("duplicate excluded/deferred source key for " + surface);
    }
  }
  return result;
}

function bulbapediaFormDispositionSourceKey(bulbapediaUrl: string, formLabel: string): string {
  const pathname = decodeURIComponent(new URL(bulbapediaUrl).pathname);
  const match = /^\/wiki\/(.+)_\(Pokémon\)$/u.exec(pathname);
  if (!match) throw new Error("Bulbapedia form disposition requires an exact Species page URL");
  const baseName = match[1].replaceAll("_", " ").normalize("NFC");
  return "bulbapedia-form:" + encodeURIComponent(baseName) + ":" +
    encodeURIComponent(formLabel.normalize("NFC"));
}

function sourceByUrl(
  fetched: Map<string, FetchedPokemonDbSource>,
  rawUrl: string,
): FetchedPokemonDbSource {
  const canonical = new URL(rawUrl).href;
  const source = fetched.get(canonical);
  if (!source) throw new Error("fetched source missing for " + canonical);
  return source;
}

function maintenanceSourceByUrl(
  fetched: Map<string, FetchedMaintenanceSource>,
  rawUrl: string,
): FetchedMaintenanceSource {
  const canonical = new URL(rawUrl).href;
  const source = fetched.get(canonical);
  if (!source) throw new Error("fetched maintenance source missing for " + canonical);
  return source;
}

function assertSpeciesExclusionsWereDiscovered(
  discoveredKeys: Set<string>,
  exclusions: readonly ExcludedOrDeferredSourceKey[],
): void {
  for (const exclusion of exclusions) {
    if (!discoveredKeys.has(exclusion.sourceKey.normalize("NFC"))) {
      throw new Error(
        "species exclusion/defer key was not discovered from the configured source pages: " +
          exclusion.sourceKey,
      );
    }
  }
}

function exactRegionalFormEvidence(
  sourceName: string,
  formLabel: string,
  regionalForms: readonly ExtractedBulbapediaRegionalFormEvidence[],
): ExtractedBulbapediaRegionalFormEvidence | undefined {
  const matches = regionalForms.filter((entry) => {
    if (entry.sourceName.normalize("NFC") !== sourceName.normalize("NFC")) return false;
    return entry.formLabel.normalize("NFC") === formLabel.normalize("NFC");
  });
  if (matches.length > 1) {
    throw new Error(
      `ambiguous Bulbapedia regional-form evidence for ${JSON.stringify(formLabel)}`,
    );
  }
  return matches[0];
}

function crossProviderSpeciesNameKey(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

function sameCrossProviderSpeciesName(left: string, right: string): boolean {
  return crossProviderSpeciesNameKey(left) === crossProviderSpeciesNameKey(right);
}

export function resolveBulbapediaStaticFormLabels(
  baseSourceName: string,
  formLabel: string | null,
  regional: ExtractedBulbapediaRegionalFormEvidence | undefined,
): BulbapediaFormLabel[] {
  if (formLabel === null) return [null];
  if (!regional) {
    throw new Error(
      `Species static facts: no approved exact-form relationship for ${formLabel}`,
    );
  }
  if (
    regional.sourceName.normalize("NFC") !== baseSourceName.normalize("NFC") ||
    regional.formLabel.normalize("NFC") !== formLabel.normalize("NFC")
  ) {
    throw new Error(
      `Species static facts: regional-form proof does not bind exact identity ${baseSourceName} / ${formLabel}`,
    );
  }
  const adjective = canonicalizeBulbapediaRegionAdjective(regional.region);
  const simpleRegionalName = `${adjective} ${baseSourceName}`.normalize("NFC");
  if (formLabel.normalize("NFC") === simpleRegionalName) {
    return [`${adjective} Form`, simpleRegionalName];
  }
  return [`${adjective} Form (${formLabel.normalize("NFC")})`];
}

function assertBulbapediaPersistentFormClosure(input: {
  baseSourceName: string;
  pageDiscovery: readonly { sourceKey: string; formLabel: string | null }[];
  staticFacts: ExtractedBulbapediaSpeciesStaticFacts;
  regionalForms: readonly ExtractedBulbapediaRegionalFormEvidence[];
  excludedSpeciesKeys: ReadonlySet<string>;
  excludedBulbapediaFormLabels: ReadonlySet<string>;
}): void {
  const represented = new Set<BulbapediaFormLabel>([null]);
  const staticFormLabels = new Set(
    input.staticFacts.formLabels
      .filter((label): label is string => label !== null)
      .map((label) => label.normalize("NFC")),
  );
  const pokemonDbFormLabels = new Set(
    input.pageDiscovery
      .map((entry) => entry.formLabel)
      .filter((label): label is string => label !== null)
      .map((label) => label.normalize("NFC")),
  );
  for (const formLabel of input.excludedBulbapediaFormLabels) {
    const normalized = formLabel.normalize("NFC");
    if (!staticFormLabels.has(normalized)) {
      throw new Error(
        `Species persistent-form closure: declared Bulbapedia-only form ${JSON.stringify(formLabel)} was not discovered in primary static facts`,
      );
    }
    if (pokemonDbFormLabels.has(normalized)) {
      throw new Error(
        `Species persistent-form closure: Bulbapedia-only disposition duplicates PokémonDB-discovered form ${JSON.stringify(formLabel)}`,
      );
    }
    represented.add(normalized);
  }
  for (const discovered of input.pageDiscovery) {
    if (discovered.formLabel === null) continue;
    const regional = exactRegionalFormEvidence(
      input.baseSourceName,
      discovered.formLabel,
      input.regionalForms,
    );
    if (regional) {
      for (const label of resolveBulbapediaStaticFormLabels(
        input.baseSourceName,
        discovered.formLabel,
        regional,
      )) {
        represented.add(label);
      }
      continue;
    }
    if (input.excludedSpeciesKeys.has(discovered.sourceKey.normalize("NFC"))) {
      represented.add(discovered.formLabel.normalize("NFC"));
    }
  }

  const missing = input.staticFacts.formLabels.filter(
    (formLabel) => !represented.has(formLabel),
  );
  if (missing.length > 0) {
    throw new Error(
      `Species persistent-form closure: Bulbapedia primary evidence contains forms not represented by PokémonDB discovery/approved exact-form mapping: ${JSON.stringify(missing)}`,
    );
  }
}

function scopedStaticFact<T>(
  entries: readonly BulbapediaScopedFact<T>[],
  formLabels: readonly BulbapediaFormLabel[],
  label: string,
): BulbapediaStaticFact<T> {
  const matches = entries.filter((entry) =>
    entry.formLabels.some((candidate) => formLabels.includes(candidate)),
  );
  if (matches.length !== 1) {
    throw new Error(
      `${label}: expected exactly one Bulbapedia fact for ${formLabels.map((entry) => entry ?? "base form").join(" | ")}, found ${matches.length}`,
    );
  }
  return matches[0].fact;
}

function requireKnownStaticFact<T>(
  fact: BulbapediaStaticFact<T>,
  label: string,
): T {
  if (fact.status !== "known") {
    throw new Error(`${label}: Bulbapedia explicitly reports source-unavailable for a required value`);
  }
  return fact.value;
}

function primaryMetricOrPokemonDbComplement(
  entries: readonly BulbapediaScopedFact<number>[],
  complementFormLabels: readonly string[],
  formLabels: readonly BulbapediaFormLabel[],
  label: "Height" | "Weight",
  pokemonDbValue: number,
): number {
  const matches = entries.filter((entry) =>
    entry.formLabels.some((candidate) => formLabels.includes(candidate)),
  );
  if (matches.length === 1) return requireKnownStaticFact(matches[0].fact, label);
  const nonBaseFormLabels = formLabels.filter((candidate): candidate is string => candidate !== null);
  if (
    matches.length === 0 &&
    nonBaseFormLabels.length > 0 &&
    complementFormLabels.some((candidate) => nonBaseFormLabels.includes(candidate))
  ) {
    return pokemonDbValue;
  }
  throw new Error(
    `${label}: expected exactly one Bulbapedia fact or exact hidden-placeholder complement for ${formLabels.map((entry) => entry ?? "base form").join(" | ")}, found ${matches.length}`,
  );
}

function staticAbilitiesForForm(
  facts: ExtractedBulbapediaSpeciesStaticFacts,
  formLabels: readonly BulbapediaFormLabel[],
): ExtractedPokemonDbSpecies["abilities"] {
  const order = new Map([
    ["normal-1", 0],
    ["normal-2", 1],
    ["hidden", 2],
  ] as const);
  const abilities = facts.abilities
    .filter((entry) => entry.formLabels.some((candidate) => formLabels.includes(candidate)))
    .map((entry) => ({
      abilitySourceKey: entry.abilitySourceKey,
      sourceAbilitySlot: entry.sourceAbilitySlot,
    }))
    .sort(
      (left, right) =>
        (order.get(left.sourceAbilitySlot) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.sourceAbilitySlot) ?? Number.MAX_SAFE_INTEGER),
    );
  const slots = new Set<string>();
  for (const ability of abilities) {
    if (slots.has(ability.sourceAbilitySlot)) {
      throw new Error(
        `Abilities: ambiguous Bulbapedia assignments across exact form aliases for ${ability.sourceAbilitySlot}`,
      );
    }
    slots.add(ability.sourceAbilitySlot);
  }
  if (abilities.length === 0) {
    throw new Error(
      `Abilities: no Bulbapedia primary assignments for ${formLabels.map((entry) => entry ?? facts.sourceName).join(" | ")}`,
    );
  }
  return abilities;
}

function regionalStaticComplementFromPokemonDb(
  record: ExtractedPokemonDbSpecies,
  facts: ExtractedBulbapediaSpeciesStaticFacts,
  formLabel: string,
  additionalSupportingSourceRecordIds: readonly string[],
): ExtractedPokemonDbSpecies {
  const baseFormLabels = [null] as const;
  const abilities = staticAbilitiesForForm(facts, baseFormLabels);
  const catchRate = requireKnownStaticFact(scopedStaticFact(facts.catchRate, baseFormLabels, "Catch rate"), "Catch rate");
  const growthRate = requireKnownStaticFact(scopedStaticFact(facts.growthRate, baseFormLabels, "Growth rate"), "Growth rate");
  const baseExperience = scopedStaticFact(facts.baseExperience, baseFormLabels, "Base experience");
  const baseFriendship = scopedStaticFact(facts.baseFriendship, baseFormLabels, "Base friendship");
  const eggCycles = scopedStaticFact(facts.eggCycles, baseFormLabels, "Egg cycles");
  const eggGroupSourceKeys = requireKnownStaticFact(scopedStaticFact(facts.eggGroups, baseFormLabels, "Egg Groups"), "Egg Groups");
  const genderRatio = requireKnownStaticFact(scopedStaticFact(facts.genderRatio, baseFormLabels, "Gender ratio"), "Gender ratio");
  const evYield = requireKnownStaticFact(scopedStaticFact(facts.evYield, baseFormLabels, "EV yield"), "EV yield");

  const requiredComparisons: Array<[string, unknown, unknown]> = [
    ["Abilities", abilities, record.abilities],
    ["Catch rate", catchRate, record.catchRate],
    ["Growth rate", growthRate, record.growthRate],
    ["Egg Groups", [...eggGroupSourceKeys].sort(), [...record.eggGroupSourceKeys].sort()],
    ["Gender ratio", genderRatio, record.genderRatio],
    ["EV yield", evYield, record.evYield],
  ];
  for (const [label, primaryValue, complementValue] of requiredComparisons) {
    if (canonicalJson(primaryValue) !== canonicalJson(complementValue)) {
      throw new Error(`Species static facts: PokémonDB ${label} complement for ${formLabel} disagrees with Bulbapedia base fact`);
    }
  }

  const resolvedBaseExperience = canonicalJson(baseExperience) === canonicalJson(record.baseExperience)
    ? baseExperience
    : { status: "source-unavailable" } as const;
  const resolvedBaseFriendship = canonicalJson(baseFriendship) === canonicalJson(record.baseFriendship)
    ? baseFriendship
    : { status: "source-unavailable" } as const;
  const resolvedEggCycles = canonicalJson(eggCycles) === canonicalJson(record.eggCycles)
    ? eggCycles
    : { status: "source-unavailable" } as const;
  const supportingSourceRecordIds = [
    record.sourceRecordId,
    ...(record.supportingSourceRecordIds ?? []),
    ...additionalSupportingSourceRecordIds,
  ].filter((id, index, values) => id !== facts.sourceRecordId && values.indexOf(id) === index);

  return {
    ...record,
    abilities,
    catchRate,
    growthRate,
    baseExperience: resolvedBaseExperience,
    baseFriendship: resolvedBaseFriendship,
    eggCycles: resolvedEggCycles,
    eggGroupSourceKeys: [...eggGroupSourceKeys],
    genderRatio,
    heightMillimeters: record.heightMillimeters,
    weightGrams: record.weightGrams,
    evYield,
    sourceRecordId: facts.sourceRecordId,
    supportingSourceRecordIds,
  };
}

function applyBulbapediaPrimaryStaticFacts(
  record: ExtractedPokemonDbSpecies,
  facts: ExtractedBulbapediaSpeciesStaticFacts,
  formLabels: readonly BulbapediaFormLabel[],
  additionalSupportingSourceRecordIds: readonly string[] = [],
  allowRegionalComplementWhenFormAbsent = false,
): ExtractedPokemonDbSpecies {
  if (!facts.formLabels.some((candidate) => formLabels.includes(candidate))) {
    const nonBaseFormLabels = formLabels.filter((candidate): candidate is string => candidate !== null);
    const hiddenMetricEvidence =
      nonBaseFormLabels.length > 0 &&
      nonBaseFormLabels.some((candidate) =>
        facts.metricHiddenPlaceholderFormLabels.heightMillimeters.includes(candidate),
      ) &&
      nonBaseFormLabels.some((candidate) =>
        facts.metricHiddenPlaceholderFormLabels.weightGrams.includes(candidate),
      );
    if (allowRegionalComplementWhenFormAbsent && nonBaseFormLabels.length > 0 && hiddenMetricEvidence) {
      return regionalStaticComplementFromPokemonDb(
        record,
        facts,
        nonBaseFormLabels[0],
        additionalSupportingSourceRecordIds,
      );
    }
    throw new Error(
      `Species static facts: exact form ${formLabels.map((entry) => entry ?? facts.sourceName).join(" | ")} is not represented by Bulbapedia primary evidence`,
    );
  }
  const abilities = staticAbilitiesForForm(facts, formLabels);
  const catchRate = requireKnownStaticFact(
    scopedStaticFact(facts.catchRate, formLabels, "Catch rate"),
    "Catch rate",
  );
  const growthRate = requireKnownStaticFact(
    scopedStaticFact(facts.growthRate, formLabels, "Growth rate"),
    "Growth rate",
  );
  const baseExperience = scopedStaticFact(
    facts.baseExperience,
    formLabels,
    "Base experience",
  );
  const baseFriendship = scopedStaticFact(
    facts.baseFriendship,
    formLabels,
    "Base friendship",
  );
  const eggCycles = scopedStaticFact(facts.eggCycles, formLabels, "Egg cycles");
  const eggGroupSourceKeys = requireKnownStaticFact(
    scopedStaticFact(facts.eggGroups, formLabels, "Egg Groups"),
    "Egg Groups",
  );
  const genderRatio = requireKnownStaticFact(
    scopedStaticFact(facts.genderRatio, formLabels, "Gender ratio"),
    "Gender ratio",
  );
  const heightMillimeters = primaryMetricOrPokemonDbComplement(
    facts.heightMillimeters,
    facts.metricComplementFormLabels.heightMillimeters,
    formLabels,
    "Height",
    record.heightMillimeters,
  );
  const weightGrams = primaryMetricOrPokemonDbComplement(
    facts.weightGrams,
    facts.metricComplementFormLabels.weightGrams,
    formLabels,
    "Weight",
    record.weightGrams,
  );
  const evYield = requireKnownStaticFact(
    scopedStaticFact(facts.evYield, formLabels, "EV yield"),
    "EV yield",
  );

  const supportingSourceRecordIds = [
    record.sourceRecordId,
    ...(record.supportingSourceRecordIds ?? []),
    ...additionalSupportingSourceRecordIds,
  ].filter((id, index, values) => id !== facts.sourceRecordId && values.indexOf(id) === index);

  return {
    ...record,
    abilities,
    catchRate,
    growthRate,
    baseExperience,
    baseFriendship,
    eggCycles,
    eggGroupSourceKeys: [...eggGroupSourceKeys],
    genderRatio,
    heightMillimeters,
    weightGrams,
    evYield,
    sourceRecordId: facts.sourceRecordId,
    supportingSourceRecordIds,
  };
}

function primaryBaseStatsForSpecies(
  record: ExtractedPokemonDbSpecies,
  baseSourceName: string,
  regional: ExtractedBulbapediaRegionalFormEvidence | undefined,
  evidence: readonly ExtractedBulbapediaSpeciesBaseStats[],
) {
  const exactName =
    record.formLabel === null ? baseSourceName.normalize("NFC") : record.formLabel.normalize("NFC");
  const regionalGroup = regional
    ? `${canonicalizeBulbapediaRegionAdjective(regional.region)} ${baseSourceName}`.normalize("NFC")
    : null;
  const matches = evidence.filter((entry) => {
    if (entry.sourceName.normalize("NFC") !== baseSourceName.normalize("NFC")) return false;
    if (entry.scope.kind === "exact") {
      return entry.scope.sourceFormNames.some(
        (sourceFormName) => sourceFormName.normalize("NFC") === exactName,
      );
    }
    return regionalGroup !== null && entry.scope.sourceFormGroupName.normalize("NFC") === regionalGroup;
  });
  if (matches.length !== 1) {
    throw new Error(
      `Base Stats: expected exactly one Bulbapedia primary evidence record for ${record.formLabel ?? baseSourceName}, found ${matches.length}`,
    );
  }
  return { ...matches[0].baseStats };
}

function normalizedStringSet(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.normalize("NFC")));
}

function assertExactKeySet(
  actualValues: readonly string[],
  expectedValues: readonly string[],
  label: string,
): void {
  const actual = normalizedStringSet(actualValues);
  const expected = normalizedStringSet(expectedValues);
  const missing = [...expected].filter((value) => !actual.has(value)).sort();
  const extra = [...actual].filter((value) => !expected.has(value)).sort();
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${label}: exact coverage mismatch; missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`,
    );
  }
}

export function assertFullCandidateCoverage(input: {
  coreSpeciesDiscovery: readonly ExtractedBulbapediaCoreSpeciesDiscovery[];
  profile: MaintenanceIngestionProfile;
  speciesDiscovery: readonly { sourceKey: string; formLabel: string | null }[];
  species: readonly ExtractedPokemonDbSpecies[];
  moves: readonly ExtractedPokemonDbMove[];
  learnsets: readonly ExtractedPokemonDbLearnsetEntry[];
  learnsetDiscovery: readonly string[];
  typeSourceKeys: readonly string[];
  typeEffectivenessCount: number;
  itemSourceKeys: readonly string[];
  excludedSpeciesKeys: ReadonlySet<string>;
}): void {
  if (input.coreSpeciesDiscovery.length !== 251) {
    throw new Error(
      `full-candidate Core Species discovery must contain exactly 251 base Species; found ${input.coreSpeciesDiscovery.length}`,
    );
  }

  assertExactKeySet(
    input.profile.speciesPages?.map((entry) => new URL(entry.bulbapediaUrl).href) ?? [],
    input.coreSpeciesDiscovery.map((entry) => new URL(entry.sourcePageUrl).href),
    "full-candidate Core Species page profile",
  );

  const excludedBaseKeys = input.speciesDiscovery
    .filter((entry) => entry.formLabel === null)
    .map((entry) => entry.sourceKey.normalize("NFC"))
    .filter((sourceKey) => input.excludedSpeciesKeys.has(sourceKey));
  if (excludedBaseKeys.length > 0) {
    throw new Error(
      `full-candidate Core base Species cannot be excluded/deferred: ${JSON.stringify(excludedBaseKeys.sort())}`,
    );
  }

  const baseSpecies = input.species.filter((record) => record.formLabel === null);
  if (baseSpecies.length !== 251) {
    throw new Error(
      `full-candidate must extract exactly 251 Core base Species; found ${baseSpecies.length}`,
    );
  }
  const coreByName = new Map(
    input.coreSpeciesDiscovery.map((entry) => [crossProviderSpeciesNameKey(entry.sourceName), entry] as const),
  );
  for (const record of baseSpecies) {
    const root = coreByName.get(crossProviderSpeciesNameKey(record.sourceName));
    if (!root || root.nationalDexNumber !== record.nationalDexNumber) {
      throw new Error(
        `full-candidate Core Species binding mismatch for ${JSON.stringify(record.sourceName)} (#${record.nationalDexNumber})`,
      );
    }
  }

  assertExactKeySet(
    input.profile.learnsetPages?.map((entry) => entry.speciesSourceKey) ?? [],
    baseSpecies.map((record) => record.sourceKey),
    "full-candidate modern learnset Species coverage",
  );
  assertExactKeySet(
    input.learnsets.map((entry) => entry.speciesSourceKey),
    baseSpecies.map((record) => record.sourceKey),
    "full-candidate extracted modern learnset Species coverage",
  );
  assertExactKeySet(
    input.learnsetDiscovery,
    input.learnsets.map(learnsetInventoryKey),
    "full-candidate learnset discovery/extraction",
  );

  const requiredMoveKeys = [...normalizedStringSet(input.learnsets.map((entry) => entry.moveSourceKey))].sort();
  assertExactKeySet(
    input.moves.map((record) => record.sourceKey),
    requiredMoveKeys,
    "full-candidate Move closure from Core learnsets",
  );

  const typeKeys = normalizedStringSet(input.typeSourceKeys);
  if (typeKeys.size !== 18 || input.typeEffectivenessCount !== 324) {
    throw new Error(
      `full-candidate modern Type matrix must contain 18 Types and 324 ordered pairs; found ${typeKeys.size} Types and ${input.typeEffectivenessCount} pairs`,
    );
  }
  for (const record of input.species) {
    for (const sourceKey of record.typeSourceKeys) {
      if (!typeKeys.has(sourceKey.normalize("NFC"))) {
        throw new Error(
          `full-candidate Species ${record.sourceKey} references unknown modern Type ${sourceKey}`,
        );
      }
    }
  }
  for (const record of input.moves) {
    if (!typeKeys.has(record.typeSourceKey.normalize("NFC"))) {
      throw new Error(
        `full-candidate Move ${record.sourceKey} references unknown modern Type ${record.typeSourceKey}`,
      );
    }
  }

  assertExactKeySet(
    input.itemSourceKeys,
    input.profile.items?.map((entry) => entry.sourceKey) ?? [],
    "full-candidate Item profile scope",
  );
}

async function writeCanonical(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(canonicalJson(value), "utf8"));
}

async function emitOutputs(
  outputDirectory: string,
  rawExtracted: RawExtractedSnapshot,
  mappingRegistry: MappingRegistry,
  candidate: MaintenanceIngestionResult extends never ? never : unknown,
  provenance: unknown,
  validationReport: CandidateValidationReport,
  reviewStage?: ReviewStageArtifacts,
): Promise<void> {
  if (await exists(outputDirectory)) {
    throw new Error("maintenance ingestion output directory already exists: " + outputDirectory);
  }
  const temporary = outputDirectory + ".tmp-" + randomUUID();
  await mkdir(temporary, { recursive: true });
  try {
    await writeCanonical(join(temporary, "raw-extracted.json"), rawExtracted);
    await writeCanonical(join(temporary, "mapping-proposals.json"), mappingRegistry);
    await writeCanonical(join(temporary, "normalized-candidate.json"), candidate);
    await writeCanonical(join(temporary, "provenance-manifest.json"), provenance);
    await writeCanonical(join(temporary, "validation-report.json"), validationReport);
    if (reviewStage) {
      await writeCanonical(
        join(temporary, "excluded-species-evidence.json"),
        reviewStage.excludedSpeciesEvidence,
      );
      await writeCanonical(
        join(temporary, "human-review-sample.json"),
        reviewStage.humanReviewSample,
      );
      await writeCanonical(join(temporary, "review-stage.json"), reviewStage.manifest);
    }
    await rename(temporary, outputDirectory);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export function buildReviewExcludedSpeciesEvidence(
  profile: MaintenanceIngestionProfile,
  sourceRecords: SourceRecord[],
  speciesDiscoveryByPokemonDbUrl: ReadonlyMap<
    string,
    readonly DiscoveredPokemonDbSpeciesForm[]
  >,
  finalSpeciesExclusions: readonly ExcludedOrDeferredSourceKey[],
): ReviewExcludedSpeciesEvidence[] {
  const sourceIdByUrl = new Map(
    sourceRecords.map((source) => [new URL(source.canonicalUrl).href, source.id] as const),
  );
  const sourceRecordIdBySpeciesKey = new Map<string, string>();
  for (const page of profile.speciesPages ?? []) {
    const pokemonDbUrl = new URL(page.pokemonDbUrl).href;
    const bulbapediaUrl = new URL(page.bulbapediaUrl).href;
    const pageDiscovery = speciesDiscoveryByPokemonDbUrl.get(pokemonDbUrl);
    if (!pageDiscovery) {
      throw new Error(`review stage Species discovery is missing for ${pokemonDbUrl}`);
    }
    const pageKeys = new Set(
      pageDiscovery.map((entry) => entry.sourceKey.normalize("NFC")),
    );
    const pokemonDbSourceRecordId = sourceIdByUrl.get(pokemonDbUrl);
    if (!pokemonDbSourceRecordId) {
      throw new Error(`review stage Species source record is missing for ${pokemonDbUrl}`);
    }
    for (const discovered of pageDiscovery) {
      const key = discovered.sourceKey.normalize("NFC");
      const previous = sourceRecordIdBySpeciesKey.get(key);
      if (previous && previous !== pokemonDbSourceRecordId) {
        throw new Error(`review stage Species source key ${discovered.sourceKey} is discovered on multiple source pages`);
      }
      sourceRecordIdBySpeciesKey.set(key, pokemonDbSourceRecordId);
    }
    for (const entry of page.excludedOrDeferred ?? []) {
      if (!pageKeys.has(entry.sourceKey.normalize("NFC"))) {
        throw new Error(
          `Species exclusion/defer key ${entry.sourceKey} was not discovered from its declaring Species page ${pokemonDbUrl}`,
        );
      }
    }
    const bulbapediaSourceRecordId = sourceIdByUrl.get(bulbapediaUrl);
    if ((page.bulbapediaExcludedOrDeferredForms?.length ?? 0) > 0 && !bulbapediaSourceRecordId) {
      throw new Error(`review stage Bulbapedia Species source record is missing for ${bulbapediaUrl}`);
    }
    for (const entry of page.bulbapediaExcludedOrDeferredForms ?? []) {
      const sourceKey = bulbapediaFormDispositionSourceKey(page.bulbapediaUrl, entry.formLabel).normalize("NFC");
      const previous = sourceRecordIdBySpeciesKey.get(sourceKey);
      if (previous && previous !== bulbapediaSourceRecordId) {
        throw new Error(`review stage provider-only Species key ${sourceKey} is bound to multiple source pages`);
      }
      sourceRecordIdBySpeciesKey.set(sourceKey, bulbapediaSourceRecordId!);
    }
  }
  return finalSpeciesExclusions.map((entry) => {
    const sourceRecordId = sourceRecordIdBySpeciesKey.get(entry.sourceKey.normalize("NFC"));
    if (!sourceRecordId) {
      throw new Error(
        `review stage Species exclusion/defer key ${entry.sourceKey} has no discovered source-page binding`,
      );
    }
    return { sourceKey: entry.sourceKey, sourceRecordIds: [sourceRecordId] };
  });
}

export async function runMaintenanceIngestion(
  options: MaintenanceIngestionOptions,
): Promise<MaintenanceIngestionResult> {
  const roster = options.roster ?? LOCAL_MAPPING_ROSTER;
  const intent = options.intent ?? "smoke";
  const pokemonDbUrls = stableUniquePokemonDbUrls(options.profile);
  const bulbapediaUrls = stableUniqueBulbapediaUrls(options.profile, intent);
  const hasMovePages = (options.profile.movePages?.length ?? 0) > 0;
  const pokemonDbOptions: PokemonDbFetchOptions = {
    ...(options.fetchOptions ?? {}),
    cacheDirectory: options.cacheDirectory,
  };
  const bulbapediaOptions: BulbapediaFetchOptions = {
    ...(options.bulbapediaFetchOptions ?? options.fetchOptions ?? {}),
    cacheDirectory: options.cacheDirectory,
  };
  const [pokemonDbPolicy, bulbapediaPolicy] = await Promise.all([
    pokemonDbUrls.length > 0
      ? fetchPokemonDbRobotsPolicy(pokemonDbOptions)
      : Promise.resolve(null),
    fetchBulbapediaRobotsPolicy(bulbapediaOptions),
  ]);
  const fetchedResult =
    pokemonDbUrls.length > 0
      ? await fetchPokemonDbSources(
          pokemonDbUrls,
          pokemonDbOptions,
          pokemonDbPolicy!,
        )
      : { robotsPolicy: undefined, sources: [] };
  const commonBulbapediaFetchedResult = await fetchBulbapediaSources(
    bulbapediaUrls,
    bulbapediaOptions,
    bulbapediaPolicy,
  );
  const learnsetFetchedResult = await fetchConfiguredLearnsetSources(
    options.profile,
    bulbapediaOptions,
    bulbapediaPolicy,
  );
  const bulbapediaFetchedResult = {
    robotsPolicy: bulbapediaPolicy,
    sources: [
      ...commonBulbapediaFetchedResult.sources,
      ...learnsetFetchedResult.sources,
    ],
  };
  const fetched = new Map(fetchedResult.sources.map((source) => [source.url, source]));
  const bulbapediaFetched = new Map(
    bulbapediaFetchedResult.sources.map((source) => [source.url, source]),
  );
  const mergedExclusions = mergeExclusions(roster, options.profile);

  const coreSpeciesDiscovery =
    intent === "full-candidate"
      ? parseBulbapediaKantoJohtoSpeciesDiscovery(
          bulbapediaSpeciesEvidenceSource(
            maintenanceSourceByUrl(
              bulbapediaFetched,
              BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_URL,
            ),
          ),
        )
      : [];

  const needsTypeChart =
    (options.profile.speciesPages?.length ?? 0) > 0 || hasMovePages;
  const typeChart = needsTypeChart
    ? parseBulbapediaCurrentTypeChart(
        bulbapediaReferenceSource(
          maintenanceSourceByUrl(bulbapediaFetched, BULBAPEDIA_TYPE_CHART_URL),
        ),
      )
    : { types: [], currentTypeEffectiveness: [] };
  const bulbapediaAbilities =
    (options.profile.speciesPages?.length ?? 0) > 0
      ? parseBulbapediaAbilityList(
          bulbapediaReferenceSource(
            maintenanceSourceByUrl(bulbapediaFetched, BULBAPEDIA_ABILITY_LIST_URL),
          ),
        )
      : [];
  const bulbapediaItems =
    (options.profile.items?.length ?? 0) > 0
      ? parseBulbapediaItemList(
          bulbapediaReferenceSource(
            maintenanceSourceByUrl(bulbapediaFetched, BULBAPEDIA_ITEM_LIST_URL),
          ),
        )
      : [];

  const regionalFormSource =
    (options.profile.speciesPages?.length ?? 0) > 0
      ? maintenanceSourceByUrl(bulbapediaFetched, BULBAPEDIA_REGIONAL_FORM_LIST_URL)
      : null;
  const regionalForms = regionalFormSource
    ? parseBulbapediaRegionalForms(bulbapediaSpeciesEvidenceSource(regionalFormSource))
    : [];

  const speciesDiscoveryByPokemonDbUrl = new Map(
    (options.profile.speciesPages ?? []).map((page) => {
      const pokemonDbUrl = new URL(page.pokemonDbUrl).href;
      return [
        pokemonDbUrl,
        discoverPokemonDbSpeciesForms(
          parserSource(sourceByUrl(fetched, pokemonDbUrl)),
        ),
      ] as const;
    }),
  );
  const speciesDiscovery = [...speciesDiscoveryByPokemonDbUrl.values()].flat();
  const pokemonDbDiscoveredSpeciesKeys = new Set(
    speciesDiscovery.map((entry) => entry.sourceKey.normalize("NFC")),
  );
  const bulbapediaFormDispositionEntries = (options.profile.speciesPages ?? []).flatMap((page) =>
    (page.bulbapediaExcludedOrDeferredForms ?? []).map((entry) => ({
      ...entry,
      bulbapediaUrl: new URL(page.bulbapediaUrl).href,
      sourceKey: bulbapediaFormDispositionSourceKey(page.bulbapediaUrl, entry.formLabel),
    })),
  );
  const supplementalBulbapediaSpeciesKeys = bulbapediaFormDispositionEntries.map((entry) => entry.sourceKey);
  const discoveredSpeciesKeys = new Set([
    ...pokemonDbDiscoveredSpeciesKeys,
    ...supplementalBulbapediaSpeciesKeys.map((sourceKey) => sourceKey.normalize("NFC")),
  ]);
  const profileSpeciesExclusions = (options.profile.speciesPages ?? []).flatMap(
    (entry) => entry.excludedOrDeferred ?? [],
  );
  assertSpeciesExclusionsWereDiscovered(pokemonDbDiscoveredSpeciesKeys, profileSpeciesExclusions);
  const exclusions: ExclusionsBySurface = {
    ...mergedExclusions,
    species: (mergedExclusions.species ?? []).filter((entry) =>
      discoveredSpeciesKeys.has(entry.sourceKey.normalize("NFC")),
    ),
  };
  const excludedSpeciesKeys = new Set(
    (exclusions.species ?? []).map((entry) => entry.sourceKey.normalize("NFC")),
  );

  const species = (options.profile.speciesPages ?? []).flatMap((page) => {
    const pokemonDbSource = parserSource(sourceByUrl(fetched, page.pokemonDbUrl));
    const pageDiscovery = speciesDiscoveryByPokemonDbUrl.get(new URL(page.pokemonDbUrl).href);
    if (!pageDiscovery) {
      throw new Error(`Species discovery is missing for ${page.pokemonDbUrl}`);
    }
    const baseDiscovery = pageDiscovery.filter((entry) => entry.formLabel === null);
    if (baseDiscovery.length !== 1) {
      throw new Error(
        `Species page ${page.pokemonDbUrl}: expected exactly one base Species discovery record`,
      );
    }
    const bulbapediaBaseSource = maintenanceSourceByUrl(
      bulbapediaFetched,
      page.bulbapediaUrl,
    );
    const baseEvidence = parseBulbapediaBaseSpeciesEvidence(
      bulbapediaSpeciesEvidenceSource(bulbapediaBaseSource),
    );
    const staticFacts = parseBulbapediaSpeciesStaticFacts(
      bulbapediaSpeciesEvidenceSource(bulbapediaBaseSource),
    );
    assertBulbapediaPersistentFormClosure({
      baseSourceName: baseEvidence.sourceName,
      pageDiscovery,
      staticFacts,
      regionalForms,
      excludedSpeciesKeys,
      excludedBulbapediaFormLabels: new Set(
        (page.bulbapediaExcludedOrDeferredForms ?? []).map((entry) => entry.formLabel.normalize("NFC")),
      ),
    });
    const baseStatsEvidence = parseBulbapediaSpeciesBaseStats(
      bulbapediaSpeciesEvidenceSource(bulbapediaBaseSource),
    );
    if (
      !sameCrossProviderSpeciesName(baseDiscovery[0].sourceName, baseEvidence.sourceName) ||
      staticFacts.sourceName.normalize("NFC") !== baseEvidence.sourceName.normalize("NFC") ||
      baseStatsEvidence.some(
        (entry) => entry.sourceName.normalize("NFC") !== baseEvidence.sourceName.normalize("NFC"),
      )
    ) {
      throw new Error(
        `Species source disagreement: PokémonDB ${JSON.stringify(baseDiscovery[0].sourceName)} vs Bulbapedia ${JSON.stringify(baseEvidence.sourceName)}`,
      );
    }

    const exactFormIntroducedGenerationEvidence = Object.fromEntries(
      pageDiscovery
        .filter(
          (entry) => entry.formLabel !== null && !excludedSpeciesKeys.has(entry.sourceKey.normalize("NFC")),
        )
        .map((entry) => {
          const regional = exactRegionalFormEvidence(
            baseEvidence.sourceName,
            entry.formLabel!,
            regionalForms,
          );
          if (!regional) {
            throw new Error(
              `introduced generation: no approved Bulbapedia exact-form evidence for ${entry.formLabel}`,
            );
          }
          return [
            entry.sourceKey,
            {
              introducedGeneration: regional.introducedGeneration,
              sourceRecordId: regional.sourceRecordId,
            },
          ] as const;
        }),
    );
    const parsed = parsePokemonDbSpeciesPage(pokemonDbSource, {
      exactFormIntroducedGenerationEvidence,
      excludedSourceKeys: excludedSpeciesKeys,
    });
    return parsed.map((record) => {
      const regional =
        record.formLabel === null
          ? undefined
          : exactRegionalFormEvidence(
              baseEvidence.sourceName,
              record.formLabel,
              regionalForms,
            );
      const primaryStatic = applyBulbapediaPrimaryStaticFacts(
        record,
        staticFacts,
        resolveBulbapediaStaticFormLabels(baseEvidence.sourceName, record.formLabel, regional),
        regional ? [regional.sourceRecordId] : [],
        regional !== undefined,
      );
      const primaryBaseStats = primaryBaseStatsForSpecies(
        record,
        baseEvidence.sourceName,
        regional,
        baseStatsEvidence,
      );
      if (record.formLabel === null) {
        if (!sameCrossProviderSpeciesName(record.sourceName, baseEvidence.sourceName)) {
          throw new Error(
            `Species source identity disagreement: PokémonDB ${JSON.stringify(record.sourceName)} vs Bulbapedia ${JSON.stringify(baseEvidence.sourceName)}`,
          );
        }
        return {
          ...primaryStatic,
          introducedGeneration: baseEvidence.introducedGeneration,
          typeSourceKeys: [...baseEvidence.typeSourceKeys],
          baseStats: primaryBaseStats,
        };
      }
      if (
        !regional ||
        regional.nationalDexNumber !== record.nationalDexNumber
      ) {
        throw new Error(
          `Species source identity disagreement for persistent form ${record.formLabel}`,
        );
      }
      return {
        ...primaryStatic,
        introducedGeneration: regional.introducedGeneration,
        typeSourceKeys: [...regional.regionalTypeSourceKeys],
        baseStats: primaryBaseStats,
      };
    });
  });
  const parsedLearnsets = (options.profile.learnsetPages ?? []).map((entry) => {
    const boundSpecies = species.filter(
      (record) => record.sourceKey.normalize("NFC") === entry.speciesSourceKey.normalize("NFC"),
    );
    if (boundSpecies.length !== 1) {
      throw new Error(
        `Learnset profile speciesSourceKey ${entry.speciesSourceKey} must resolve to exactly one extracted Species`,
      );
    }
    if (boundSpecies[0].formLabel !== null) {
      throw new Error(
        `Learnset profile ${entry.speciesSourceKey}: form-specific binding is not supported by the Generation IX Species-page parser`,
      );
    }
    const selectedUrl = learnsetFetchedResult.selectedUrlBySpeciesSourceKey.get(
      entry.speciesSourceKey.normalize("NFC"),
    );
    if (!selectedUrl) {
      throw new Error(`Learnset source selection is missing for ${entry.speciesSourceKey}`);
    }
    const selectedSource = bulbapediaLearnsetSource(
      maintenanceSourceByUrl(bulbapediaFetched, selectedUrl),
    );
    const parsed = decodeURIComponent(new URL(selectedUrl).pathname).endsWith(
      "/Generation_VIII_learnset",
    )
      ? parseBulbapediaGen8BdspLearnset(selectedSource, entry.speciesSourceKey)
      : parseBulbapediaGen9Learnset(selectedSource, entry.speciesSourceKey);
    const boundSpeciesIdentity = canonicalizeBulbapediaLearnsetSpeciesName(
      boundSpecies[0].sourceName,
    );
    if (parsed.sourceSpeciesKey !== boundSpeciesIdentity) {
      throw new Error(
        `Learnset source mismatch for ${entry.speciesSourceKey}: page Species ${parsed.sourceSpeciesKey} does not match ${boundSpeciesIdentity}`,
      );
    }
    return parsed;
  });
  const learnsets = parsedLearnsets.flatMap((entry) => entry.records);
  const learnsetDiscovery = parsedLearnsets.flatMap(
    (entry) => entry.discoveredSourceKeys,
  );

  const parsedMoves = (options.profile.movePages ?? []).map((url) =>
    parsePokemonDbMovePage(parserSource(sourceByUrl(fetched, url))),
  );
  const gen9Source = hasMovePages
    ? maintenanceSourceByUrl(bulbapediaFetched, BULBAPEDIA_GEN9_MOVE_LIST_URL)
    : null;
  const gen8Source = hasMovePages
    ? maintenanceSourceByUrl(bulbapediaFetched, BULBAPEDIA_GEN8_MOVE_LIST_URL)
    : null;
  const gen7Source = hasMovePages
    ? maintenanceSourceByUrl(bulbapediaFetched, BULBAPEDIA_GEN7_MOVE_LIST_URL)
    : null;
  const zaSource = hasMovePages
    ? maintenanceSourceByUrl(bulbapediaFetched, BULBAPEDIA_ZA_MOVE_LIST_URL)
    : null;

  const generation9Moves = gen9Source
    ? parseBulbapediaGen9Moves(bulbapediaParserSource(gen9Source))
    : [];
  const generation8Moves = gen8Source
    ? parseBulbapediaGen8Moves(bulbapediaParserSource(gen8Source))
    : [];
  const generation7Moves = gen7Source
    ? parseBulbapediaGen7Moves(bulbapediaParserSource(gen7Source))
    : [];
  const historicalProofRequests = parsedMoves
    .map((pokemonDbMove) =>
      requiredHistoricalScalarProof({
        pokemonDbMove,
        generation9: generation9Moves,
        generation8: generation8Moves,
        generation7: generation7Moves,
      }),
    )
    .filter((request): request is NonNullable<typeof request> => request !== null);
  const bdspProofRequests = historicalProofRequests.filter(
    (request) => request.selectedGame === "brilliant-diamond-shining-pearl",
  );
  const revisionProofRequests = historicalProofRequests.filter(
    (request) => request.selectedGame !== "brilliant-diamond-shining-pearl",
  );
  const historicalProofUrls = revisionProofRequests.map((request) =>
    buildBulbapediaHistoricalScalarProofUrl(request.sourceName, request.selectedGame),
  );
  const historicalProofUrlSet = new Set(historicalProofUrls);
  if (historicalProofUrlSet.size !== historicalProofUrls.length) {
    throw new Error("historical scalar proof requests produced duplicate canonical URLs");
  }
  const historicalProofFetchedResult =
    historicalProofUrls.length > 0
      ? await fetchBulbapediaSources(
          historicalProofUrls,
          bulbapediaOptions,
          bulbapediaPolicy,
        )
      : { robotsPolicy: bulbapediaPolicy, sources: [] };
  for (const source of historicalProofFetchedResult.sources) {
    if (bulbapediaFetched.has(source.url)) {
      throw new Error(`duplicate Bulbapedia source URL after historical proof fetch: ${source.url}`);
    }
    bulbapediaFetched.set(source.url, source);
  }
  const bdspHistoricalScalarProofs = materializeBdspHistoricalScalarProofs({
    requests: bdspProofRequests,
    evidence: parsedLearnsets.flatMap((entry) => entry.moveFacts),
    generation8: generation8Moves,
  });
  const revisionHistoricalScalarProofs = revisionProofRequests.map((request) => {
    const url = buildBulbapediaHistoricalScalarProofUrl(request.sourceName, request.selectedGame);
    const source = maintenanceSourceByUrl(bulbapediaFetched, url);
    return parseBulbapediaHistoricalScalarProof(
      {
        url: source.url,
        sourceRecordId: sourceRecordIdForUrl("bulbapedia", source.url),
        text: source.bytes.toString("utf8"),
      },
      request.sourceName,
      request.selectedGame,
    );
  });
  const historicalScalarProofs = [
    ...bdspHistoricalScalarProofs,
    ...revisionHistoricalScalarProofs,
  ];
  const mainlineSelectedMoves = parsedMoves.map((pokemonDbMove) =>
    selectMainlineMoveFacts({
      pokemonDbMove,
      generation9: generation9Moves,
      generation8: generation8Moves,
      generation7: generation7Moves,
      historicalScalarProofs,
    }),
  );
  const zaCooldowns = zaSource
    ? parseBulbapediaZaBaseMoveCooldowns(bulbapediaParserSource(zaSource))
    : [];
  const moves = zaSource
    ? enrichMovesWithZaBaseCooldowns(
        mainlineSelectedMoves,
        zaCooldowns,
        sourceRecordIdForUrl("bulbapedia", zaSource.url),
      )
    : mainlineSelectedMoves;
  const requiredAbilityKeys = new Set(
    species.flatMap((record) => record.abilities.map((assignment) => assignment.abilitySourceKey)),
  );
  const abilityByKey = new Map(
    bulbapediaAbilities.map((record) => [record.sourceKey.normalize("NFC"), record]),
  );
  const abilities: ExtractedPokemonDbAbility[] = [...requiredAbilityKeys]
    .sort()
    .map((sourceKey) => {
      const primary = abilityByKey.get(sourceKey.normalize("NFC"));
      if (!primary) {
        throw new Error(
          `Bulbapedia Ability list is missing required Species Ability ${sourceKey}`,
        );
      }
      return primary;
    });

  const bulbapediaItemByKey = new Map(
    bulbapediaItems.map((record) => [record.sourceKey.normalize("NFC"), record]),
  );
  const items: ExtractedPokemonDbItem[] = (options.profile.items ?? []).map((entry) => {
    const primary = bulbapediaItemByKey.get(entry.sourceKey.normalize("NFC"));
    if (!primary) {
      throw new Error(`Bulbapedia Item list is missing requested Item ${entry.sourceKey}`);
    }
    const complementary = parsePokemonDbItemPage(
      parserSource(sourceByUrl(fetched, entry.pokemonDbUrl)),
    );
    if (
      complementary.sourceKey.normalize("NFC") !== primary.sourceKey.normalize("NFC") ||
      complementary.sourceName.normalize("NFC") !== primary.sourceName.normalize("NFC")
    ) {
      throw new Error(
        `Item source disagreement for ${entry.sourceKey}: Bulbapedia ${JSON.stringify(primary.sourceName)} vs PokémonDB ${JSON.stringify(complementary.sourceName)}`,
      );
    }
    return {
      sourceKey: primary.sourceKey,
      sourceName: primary.sourceName,
      sourceSlug: primary.sourceSlug,
      sourceCategory: complementary.sourceCategory,
      sourceRecordId: primary.sourceRecordId,
      supportingSourceRecordIds: [complementary.sourceRecordId],
    };
  });

  if (intent === "full-candidate") {
    assertFullCandidateCoverage({
      coreSpeciesDiscovery,
      profile: options.profile,
      speciesDiscovery,
      species,
      moves,
      learnsets,
      learnsetDiscovery,
      typeSourceKeys: typeChart.types.map((record) => record.sourceKey),
      typeEffectivenessCount: typeChart.currentTypeEffectiveness.length,
      itemSourceKeys: items.map((record) => record.sourceKey),
      excludedSpeciesKeys,
    });
  }

  const fullCandidateMoveDiscovery =
    intent === "full-candidate"
      ? [...normalizedStringSet(learnsets.map((entry) => entry.moveSourceKey))].sort()
      : null;

  const rawExtracted: RawExtractedSnapshot = {
    parserVersion: "pokenexus-static-raw-extract-v3",
    speciesDiscovery,
    discovery: {
      species: supplementalBulbapediaSpeciesKeys,
      moves:
        fullCandidateMoveDiscovery ??
        generation9Moves
          .filter((record) =>
            parsedMoves.some(
              (move) =>
                canonicalizeBulbapediaMoveName(move.sourceName) === record.sourceKey,
            ),
          )
          .map((record) => record.sourceKey),
      types: typeChart.types.map((record) => record.sourceKey),
      abilities: [...requiredAbilityKeys].sort(),
      items: (options.profile.items ?? []).map((entry) => entry.sourceKey),
      learnsets: learnsetDiscovery,
      currentTypeEffectiveness: typeChart.currentTypeEffectiveness.map(
        (record) =>
          `current:${record.attackTypeSourceKey.normalize("NFC")}:${record.defenseTypeSourceKey.normalize("NFC")}`,
      ),
    },
    species,
    moves,
    types: typeChart.types,
    abilities,
    items,
    learnsets,
    currentTypeEffectiveness: typeChart.currentTypeEffectiveness,
  };
  const speciesEvidenceUrls = new Set(
    (options.profile.speciesPages ?? []).map((entry) => new URL(entry.bulbapediaUrl).href),
  );
  const gen9LearnsetUrls = new Set<string>();
  const gen8BdspLearnsetUrls = new Set<string>();
  for (const selectedUrl of learnsetFetchedResult.selectedUrlBySpeciesSourceKey.values()) {
    if (decodeURIComponent(new URL(selectedUrl).pathname).endsWith("/Generation_VIII_learnset")) {
      gen8BdspLearnsetUrls.add(selectedUrl);
    } else {
      gen9LearnsetUrls.add(selectedUrl);
    }
  }
  const sourceRecords = [
    ...fetchedResult.sources.map((source) =>
      sourceRecord(source, "pokemondb", POKEMONDB_PARSER_VERSION),
    ),
    ...[
      ...bulbapediaFetchedResult.sources,
      ...historicalProofFetchedResult.sources,
    ].map((source) => {
      const parserVersion =
        historicalProofUrlSet.has(source.url)
          ? BULBAPEDIA_HISTORICAL_SCALAR_PROOF_PARSER_VERSION
          : source.url === BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_URL
          ? BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_PARSER_VERSION
          : source.url === BULBAPEDIA_GEN9_MOVE_LIST_URL
          ? BULBAPEDIA_GEN9_MOVE_PARSER_VERSION
          : source.url === BULBAPEDIA_GEN8_MOVE_LIST_URL ||
              source.url === BULBAPEDIA_GEN7_MOVE_LIST_URL
            ? BULBAPEDIA_HISTORICAL_MOVE_PARSER_VERSION
            : source.url === BULBAPEDIA_ZA_MOVE_LIST_URL
              ? BULBAPEDIA_ZA_MOVE_PARSER_VERSION
              : source.url === BULBAPEDIA_TYPE_CHART_URL
                ? BULBAPEDIA_TYPE_CHART_PARSER_VERSION
                : source.url === BULBAPEDIA_ABILITY_LIST_URL
                  ? BULBAPEDIA_ABILITY_LIST_PARSER_VERSION
                  : source.url === BULBAPEDIA_ITEM_LIST_URL
                    ? BULBAPEDIA_ITEM_LIST_PARSER_VERSION
                    : source.url === BULBAPEDIA_REGIONAL_FORM_LIST_URL
                      ? BULBAPEDIA_REGIONAL_FORM_EVIDENCE_PARSER_VERSION
                      : speciesEvidenceUrls.has(source.url)
                        ? BULBAPEDIA_SPECIES_PAGE_PARSER_VERSION
                      : gen9LearnsetUrls.has(source.url)
                          ? BULBAPEDIA_GEN9_LEARNSET_PARSER_VERSION
                          : gen8BdspLearnsetUrls.has(source.url)
                            ? BULBAPEDIA_GEN8_BDSP_LEARNSET_PARSER_VERSION
                          : (() => {
                              throw new Error(
                                "unexpected Bulbapedia reference source " + source.url,
                              );
                            })();
      return sourceRecord(source, "bulbapedia", parserVersion);
    }),
  ];
  const normalized = normalizeRawExtractedSnapshot(
    rawExtracted,
    sourceRecords,
    roster.mappings,
    exclusions,
  );
  const publicationFindings = validatePublicationReadiness(
    normalized.candidate,
    normalized.mappingRegistry,
  );
  const findings = [
    ...maintenanceIntentFindings(intent),
    ...publicationFindings,
  ];
  const validationReport: CandidateValidationReport = {
    candidateValid: true,
    publicationReady: findings.length === 0,
    findings,
  };
  const reviewStage =
    intent === "full-candidate"
      ? buildReviewStage({
          rawExtracted,
          mappingRegistry: normalized.mappingRegistry,
          candidate: normalized.candidate,
          validationReport,
          excludedSpeciesEvidence: buildReviewExcludedSpeciesEvidence(
            options.profile,
            sourceRecords,
            speciesDiscoveryByPokemonDbUrl,
            exclusions.species ?? [],
          ),
        })
      : undefined;
  await emitOutputs(
    options.outputDirectory,
    rawExtracted,
    normalized.mappingRegistry,
    normalized.candidate,
    normalized.candidate.provenance,
    validationReport,
    reviewStage,
  );
  return {
    outputDirectory: options.outputDirectory,
    rawExtracted,
    mappingRegistry: normalized.mappingRegistry,
    validationReport,
    ...(reviewStage ? { reviewStage } : {}),
  };
}

function profileRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function profileString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function profileUrl(
  value: unknown,
  path: string,
  origin: "https://pokemondb.net" | "https://bulbapedia.bulbagarden.net",
  pathnamePattern: RegExp,
): string {
  const raw = profileString(value, path);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${path} must be a valid URL`);
  }
  if (
    url.origin !== origin ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !pathnamePattern.test(decodeURIComponent(url.pathname))
  ) {
    throw new Error(
      `${path} must be an approved canonical URL on ${origin} with the exact surface path`,
    );
  }
  return url.href;
}

function rejectUnknownProfileKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${path}.${key} is not supported`);
  }
}

function parseProfileExclusions(
  value: unknown,
  path: string,
): ExcludedOrDeferredSourceKey[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value.map((entry, index) => {
    const object = profileRecord(entry, `${path}[${index}]`);
    rejectUnknownProfileKeys(object, ["sourceKey", "disposition", "reason"], `${path}[${index}]`);
    const disposition = object.disposition;
    if (disposition !== "excluded" && disposition !== "deferred") {
      throw new Error(`${path}[${index}].disposition must be excluded or deferred`);
    }
    return {
      sourceKey: profileString(object.sourceKey, `${path}[${index}].sourceKey`),
      disposition,
      reason: profileString(object.reason, `${path}[${index}].reason`),
    };
  });
}

function parseBulbapediaFormDispositions(
  value: unknown,
  path: string,
): BulbapediaFormDispositionProfile[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  const result = value.map((entry, index): BulbapediaFormDispositionProfile => {
    const object = profileRecord(entry, `${path}[${index}]`);
    rejectUnknownProfileKeys(object, ["formLabel", "disposition", "reason"], `${path}[${index}]`);
    const disposition = object.disposition;
    if (disposition !== "excluded" && disposition !== "deferred") {
      throw new Error(`${path}[${index}].disposition must be excluded or deferred`);
    }
    return {
      formLabel: profileString(object.formLabel, `${path}[${index}].formLabel`),
      disposition,
      reason: profileString(object.reason, `${path}[${index}].reason`),
    };
  });
  assertUniqueProfileValues(
    result.map((entry) => entry.formLabel),
    `${path} formLabel`,
  );
  return result;
}

function assertUniqueProfileValues(values: readonly string[], label: string): void {
  const normalized = values.map((value) => value.normalize("NFC"));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`duplicate ${label} in maintenance ingestion profile`);
  }
}

export function parseMaintenanceIngestionProfile(value: unknown): MaintenanceIngestionProfile {
  const object = profileRecord(value, "profile");
  rejectUnknownProfileKeys(object, ["speciesPages", "movePages", "items", "learnsetPages"], "profile");

  const speciesPages = object.speciesPages === undefined
    ? undefined
    : (() => {
        if (!Array.isArray(object.speciesPages)) throw new Error("profile.speciesPages must be an array");
        return object.speciesPages.map((entry, index): SpeciesPageIngestionProfile => {
          const page = profileRecord(entry, `profile.speciesPages[${index}]`);
          rejectUnknownProfileKeys(
            page,
            ["pokemonDbUrl", "bulbapediaUrl", "excludedOrDeferred", "bulbapediaExcludedOrDeferredForms"],
            `profile.speciesPages[${index}]`,
          );
          return {
            pokemonDbUrl: profileUrl(
              page.pokemonDbUrl,
              `profile.speciesPages[${index}].pokemonDbUrl`,
              "https://pokemondb.net",
              /^\/pokedex\/[^/]+\/?$/u,
            ),
            bulbapediaUrl: profileUrl(
              page.bulbapediaUrl,
              `profile.speciesPages[${index}].bulbapediaUrl`,
              "https://bulbapedia.bulbagarden.net",
              /^\/wiki\/[^/]+_\(Pokémon\)$/u,
            ),
            excludedOrDeferred: parseProfileExclusions(
              page.excludedOrDeferred,
              `profile.speciesPages[${index}].excludedOrDeferred`,
            ),
            bulbapediaExcludedOrDeferredForms: parseBulbapediaFormDispositions(
              page.bulbapediaExcludedOrDeferredForms,
              `profile.speciesPages[${index}].bulbapediaExcludedOrDeferredForms`,
            ),
          };
        });
      })();

  const movePages = object.movePages === undefined
    ? undefined
    : (() => {
        if (!Array.isArray(object.movePages)) throw new Error("profile.movePages must be an array");
        return object.movePages.map((entry, index) =>
          profileUrl(
            entry,
            `profile.movePages[${index}]`,
            "https://pokemondb.net",
            /^\/move\/[^/]+\/?$/u,
          ));
      })();

  const items = object.items === undefined
    ? undefined
    : (() => {
        if (!Array.isArray(object.items)) throw new Error("profile.items must be an array");
        return object.items.map((entry, index): ItemPageIngestionProfile => {
          const item = profileRecord(entry, `profile.items[${index}]`);
          rejectUnknownProfileKeys(item, ["sourceKey", "pokemonDbUrl"], `profile.items[${index}]`);
          return {
            sourceKey: profileString(item.sourceKey, `profile.items[${index}].sourceKey`),
            pokemonDbUrl: profileUrl(
              item.pokemonDbUrl,
              `profile.items[${index}].pokemonDbUrl`,
              "https://pokemondb.net",
              /^\/item\/[^/]+\/?$/u,
            ),
          };
        });
      })();

  const learnsetPages = object.learnsetPages === undefined
    ? undefined
    : (() => {
        if (!Array.isArray(object.learnsetPages)) throw new Error("profile.learnsetPages must be an array");
        return object.learnsetPages.map((entry, index): LearnsetPageIngestionProfile => {
          const page = profileRecord(entry, `profile.learnsetPages[${index}]`);
          rejectUnknownProfileKeys(
            page,
            ["bulbapediaUrl", "bdspFallbackUrl", "speciesSourceKey"],
            `profile.learnsetPages[${index}]`,
          );
          return {
            bulbapediaUrl: profileUrl(
              page.bulbapediaUrl,
              `profile.learnsetPages[${index}].bulbapediaUrl`,
              "https://bulbapedia.bulbagarden.net",
              /^\/wiki\/[^/]+_\(Pokémon\)\/Generation_IX_learnset$/u,
            ),
            bdspFallbackUrl:
              page.bdspFallbackUrl === undefined
                ? undefined
                : profileUrl(
                    page.bdspFallbackUrl,
                    `profile.learnsetPages[${index}].bdspFallbackUrl`,
                    "https://bulbapedia.bulbagarden.net",
                    /^\/wiki\/[^/]+_\(Pokémon\)\/Generation_VIII_learnset$/u,
                  ),
            speciesSourceKey: profileString(
              page.speciesSourceKey,
              `profile.learnsetPages[${index}].speciesSourceKey`,
            ),
          };
        });
      })();

  const result: MaintenanceIngestionProfile = { speciesPages, movePages, items, learnsetPages };
  if (
    (speciesPages?.length ?? 0) +
      (movePages?.length ?? 0) +
      (items?.length ?? 0) +
      (learnsetPages?.length ?? 0) ===
    0
  ) {
    throw new Error("maintenance ingestion profile contains no configured source surfaces");
  }
  assertUniqueProfileValues(speciesPages?.map((entry) => entry.pokemonDbUrl) ?? [], "Species PokémonDB URL");
  assertUniqueProfileValues(speciesPages?.map((entry) => entry.bulbapediaUrl) ?? [], "Species Bulbapedia URL");
  assertUniqueProfileValues(movePages ?? [], "Move PokémonDB URL");
  assertUniqueProfileValues(items?.map((entry) => entry.sourceKey) ?? [], "Item sourceKey");
  assertUniqueProfileValues(items?.map((entry) => entry.pokemonDbUrl) ?? [], "Item PokémonDB URL");
  assertUniqueProfileValues(learnsetPages?.map((entry) => entry.bulbapediaUrl) ?? [], "Learnset Bulbapedia URL");
  assertUniqueProfileValues(
    learnsetPages?.flatMap((entry) => entry.bdspFallbackUrl ? [entry.bdspFallbackUrl] : []) ?? [],
    "Learnset BDSP fallback URL",
  );
  assertUniqueProfileValues(learnsetPages?.map((entry) => entry.speciesSourceKey) ?? [], "Learnset speciesSourceKey");
  return result;
}

export async function loadIngestionProfile(path: string): Promise<MaintenanceIngestionProfile> {
  return parseMaintenanceIngestionProfile(JSON.parse(await readFile(path, "utf8")) as unknown);
}
