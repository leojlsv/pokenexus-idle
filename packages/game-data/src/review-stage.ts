import { canonicalJson, sha256 } from "./canonical.js";
import {
  validateGameDataCandidate,
  type AbilityDefinitionV1,
  type GameDataCandidate,
  type ItemDefinitionV1,
  type LearnsetEntryV1,
  type MappingRegistry,
  type MoveDefinitionV1,
  type MoveFactSourceRelation,
  type SourceFact,
  type SourceRecord,
  type SpeciesDefinitionV2,
  type TypeDefinitionV1,
} from "./schema.js";
import {
  assertRawHistoricalScalarProofBinding,
  type CandidateValidationReport,
  type RawExtractedSnapshot,
} from "./normalization.js";
import { validatePublicationReadiness } from "./publication.js";
import {
  REVIEW_SCOPE,
  REVIEW_STAGE_VERSION,
  type ReviewStageFileDescriptor,
  type ReviewStageManifest,
} from "./review-commitment.js";

export {
  REVIEW_SCOPE,
  REVIEW_STAGE_VERSION,
  type ReviewApproval,
  type ReviewStageFileDescriptor,
  type ReviewStageManifest,
} from "./review-commitment.js";
export const BATTLE_ONLY_TRANSFORMATION_EXCLUSION_REASON =
  "battle-only-transformation" as const;

const REVIEWABLE_PUBLICATION_BLOCKERS = new Set([
  "candidate-mapping-unresolved",
  "mapping-catalog-mismatch",
]);

export interface ReviewExcludedSpeciesEvidence {
  sourceKey: string;
  sourceRecordIds: string[];
}

interface ReviewMappingEvidence {
  sourceKey: string;
  canonicalId: string;
  status: "accepted" | "candidate";
  baseSpeciesId?: string | null;
}

interface ReviewRecordSample<T> {
  record: T;
  mapping: ReviewMappingEvidence;
  sourceRecords: SourceRecord[];
}

export interface HumanReviewSample {
  schemaVersion: GameDataCandidate["schemaVersion"];
  normalizerVersion: string;
  candidateContentHash: string;
  mappingProposalsContentHash: string;
  provenanceHash: string;
  sourceInventoryHash: string;
  ordinarySpecies: ReviewRecordSample<SpeciesDefinitionV2>;
  alternateSpecies: ReviewRecordSample<SpeciesDefinitionV2> | null;
  sourceUnavailableSpeciesFact: {
    speciesId: string;
    field: "baseExperience" | "eggCycles" | "baseFriendship";
    fact: SourceFact<number>;
    mapping: ReviewMappingEvidence;
    sourceRecords: SourceRecord[];
  };
  excludedOrDeferredSpecies: {
    sourceKey: string;
    disposition: "excluded" | "deferred";
    reason: string;
    sourceRecords: SourceRecord[];
  };
  move: ReviewRecordSample<MoveDefinitionV1> & {
    factSources: MoveFactSourceRelation;
  };
  type: ReviewRecordSample<TypeDefinitionV1>;
  ability: ReviewRecordSample<AbilityDefinitionV1>;
  item: ReviewRecordSample<ItemDefinitionV1>;
  learnset: {
    record: LearnsetEntryV1;
    speciesMapping: ReviewMappingEvidence;
    moveMapping: ReviewMappingEvidence;
    sourceRecords: SourceRecord[];
  };
}

export interface ReviewStageArtifacts {
  manifest: ReviewStageManifest;
  excludedSpeciesEvidence: ReviewExcludedSpeciesEvidence[];
  humanReviewSample: HumanReviewSample;
}

function normalizeExcludedSpeciesEvidence(
  entries: readonly ReviewExcludedSpeciesEvidence[],
  sourceById: ReadonlyMap<string, SourceRecord>,
): ReviewExcludedSpeciesEvidence[] {
  const normalized = entries.map((entry) => ({
    sourceKey: entry.sourceKey.normalize("NFC"),
    sourceRecordIds: [...new Set(entry.sourceRecordIds)].sort((left, right) => left.localeCompare(right, "en")),
  })).sort((left, right) => left.sourceKey.localeCompare(right.sourceKey, "en"));
  const seen = new Set<string>();
  for (const entry of normalized) {
    if (!entry.sourceKey) throw new Error("review stage exclusion evidence requires a sourceKey");
    if (seen.has(entry.sourceKey)) {
      throw new Error(`review stage exclusion evidence has duplicate sourceKey ${entry.sourceKey}`);
    }
    seen.add(entry.sourceKey);
    if (entry.sourceRecordIds.length === 0) {
      throw new Error(`review stage exclusion evidence ${entry.sourceKey} requires at least one source record`);
    }
    sourceRecordsFor(entry.sourceRecordIds, sourceById, `excluded/deferred Species evidence ${entry.sourceKey}`);
  }
  return normalized;
}

function contentHash(value: unknown): string {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

function byId<T extends { id: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => left.id.localeCompare(right.id, "en"));
}

function sourceRecordsFor(
  sourceRecordIds: readonly string[],
  sourceById: ReadonlyMap<string, SourceRecord>,
  label: string,
): SourceRecord[] {
  const uniqueIds = [...new Set(sourceRecordIds)].sort((left, right) => left.localeCompare(right, "en"));
  return uniqueIds.map((id) => {
    const source = sourceById.get(id);
    if (!source) throw new Error(`${label}: source record ${id} is missing from candidate provenance`);
    return source;
  });
}

function mappingByCanonicalId(
  registry: MappingRegistry,
  surface: keyof MappingRegistry,
): Map<string, ReviewMappingEvidence> {
  const result = new Map<string, ReviewMappingEvidence>();
  for (const entry of registry[surface]) {
    const evidence: ReviewMappingEvidence = {
      sourceKey: entry.sourceKey,
      canonicalId: entry.canonicalId,
      status: entry.status,
      ...(surface === "species"
        ? { baseSpeciesId: (entry as MappingRegistry["species"][number]).baseSpeciesId }
        : {}),
    };
    if (result.has(entry.canonicalId)) {
      throw new Error(`review stage ${surface}: duplicate canonical mapping ${entry.canonicalId}`);
    }
    result.set(entry.canonicalId, evidence);
  }
  return result;
}

function mappingFor(
  mappings: ReadonlyMap<string, ReviewMappingEvidence>,
  canonicalId: string,
  label: string,
): ReviewMappingEvidence {
  const mapping = mappings.get(canonicalId);
  if (!mapping) throw new Error(`${label}: mapping proposal for canonical ID ${canonicalId} is missing`);
  return mapping;
}

function recordSample<T extends { id: string; sourceRecordIds: string[] }>(
  record: T,
  mappings: ReadonlyMap<string, ReviewMappingEvidence>,
  sourceById: ReadonlyMap<string, SourceRecord>,
  label: string,
): ReviewRecordSample<T> {
  return {
    record,
    mapping: mappingFor(mappings, record.id, label),
    sourceRecords: sourceRecordsFor(record.sourceRecordIds, sourceById, label),
  };
}

function firstSourceUnavailableFact(species: SpeciesDefinitionV2[]): {
  species: SpeciesDefinitionV2;
  field: "baseExperience" | "eggCycles" | "baseFriendship";
  fact: SourceFact<number>;
} | null {
  const fields = ["baseExperience", "eggCycles", "baseFriendship"] as const;
  for (const record of byId(species)) {
    for (const field of fields) {
      if (record[field].status === "source-unavailable") {
        return { species: record, field, fact: record[field] };
      }
    }
  }
  return null;
}

function assertReviewableFindings(
  candidate: GameDataCandidate,
  validationReport: CandidateValidationReport,
  mappingRegistry: MappingRegistry,
): void {
  const candidateValidation = validateGameDataCandidate(candidate);
  if (
    validationReport.candidateValid !== candidateValidation.valid ||
    !candidateValidation.valid
  ) {
    throw new Error("review stage requires a schema-valid normalized candidate");
  }
  const publicationFindings = validatePublicationReadiness(candidate, mappingRegistry);
  const expectedPublicationReady = publicationFindings.length === 0;
  if (
    validationReport.publicationReady !== expectedPublicationReady ||
    canonicalJson(validationReport.findings) !== canonicalJson(publicationFindings)
  ) {
    throw new Error("review stage validation report does not match recomputed publication readiness");
  }
  const candidateCount = Object.values(mappingRegistry)
    .flat()
    .filter((entry) => entry.status === "candidate").length;
  if (candidateCount === 0) {
    throw new Error("review stage requires at least one non-canonical candidate mapping proposal");
  }
  const unexpected = validationReport.findings.filter(
    (finding) => !REVIEWABLE_PUBLICATION_BLOCKERS.has(finding.code),
  );
  if (unexpected.length > 0) {
    throw new Error(
      `review stage has non-reviewable validation finding ${unexpected[0].code} at ${unexpected[0].path}`,
    );
  }
  if (validationReport.publicationReady) {
    throw new Error("review stage candidate mappings must remain non-canonical and non-publishable");
  }
}

function assertHistoricalMoveRawBindings(
  rawExtracted: RawExtractedSnapshot,
  candidate: GameDataCandidate,
  moveMappings: ReadonlyMap<string, ReviewMappingEvidence>,
  typeMappings: ReadonlyMap<string, ReviewMappingEvidence>,
): void {
  const candidateMoves = new Map(
    candidate.catalogs.moves.map((move) => [move.id, move] as const),
  );

  for (const relation of candidate.provenance.moveFactSources) {
    if (relation.mainline.selectedGame === "scarlet-violet") continue;

    const moveMapping = mappingFor(
      moveMappings,
      relation.moveId,
      "Historical Move raw binding",
    );
    const rawMatches = rawExtracted.moves.filter(
      (move) => move.sourceKey.normalize("NFC") === moveMapping.sourceKey.normalize("NFC"),
    );
    if (rawMatches.length !== 1) {
      throw new Error(
        `review stage historical Move ${moveMapping.sourceKey} requires exactly one raw Move record, found ${rawMatches.length}`,
      );
    }
    const rawMove = rawMatches[0];
    if (
      rawMove.mainlineSelectedGame !== relation.mainline.selectedGame ||
      rawMove.mainlineSelectedSourceRecordId !== relation.mainline.sourceRecordId ||
      !rawMove.mainlineSourceRecordIds?.includes(relation.mainline.sourceRecordId)
    ) {
      throw new Error(
        `review stage historical Move ${moveMapping.sourceKey} selected-game/source does not match raw extracted evidence`,
      );
    }
    assertRawHistoricalScalarProofBinding(rawExtracted, rawMove);

    const candidateMove = candidateMoves.get(relation.moveId);
    if (!candidateMove) {
      throw new Error(`review stage historical Move ${moveMapping.sourceKey} candidate record is missing`);
    }
    const typeMapping = mappingFor(
      typeMappings,
      candidateMove.typeId,
      `Historical Move ${moveMapping.sourceKey} Type raw binding`,
    );
    if (
      rawMove.typeSourceKey.normalize("NFC") !== typeMapping.sourceKey.normalize("NFC") ||
      rawMove.category !== candidateMove.category ||
      rawMove.basePp !== candidateMove.basePp ||
      rawMove.power !== candidateMove.power ||
      rawMove.accuracy !== candidateMove.accuracy
    ) {
      throw new Error(
        `review stage historical Move ${moveMapping.sourceKey} scalar tuple does not match raw extracted evidence`,
      );
    }
  }
}

function descriptor(
  logicalName: ReviewStageFileDescriptor["logicalName"],
  path: string,
  value: unknown,
): ReviewStageFileDescriptor {
  return { logicalName, path, contentHash: contentHash(value) };
}

export function buildReviewStage(input: {
  rawExtracted: RawExtractedSnapshot;
  mappingRegistry: MappingRegistry;
  candidate: GameDataCandidate;
  validationReport: CandidateValidationReport;
  excludedSpeciesEvidence: ReviewExcludedSpeciesEvidence[];
}): ReviewStageArtifacts {
  assertReviewableFindings(input.candidate, input.validationReport, input.mappingRegistry);

  const provenanceHash = input.candidate.provenance.provenanceHash;
  if (!provenanceHash) throw new Error("review stage requires finalized provenanceHash");
  const sourceInventoryHash = input.candidate.provenance.sourceInventoryHash;
  const candidateContentHash = contentHash(input.candidate);
  const mappingProposalsContentHash = contentHash(input.mappingRegistry);
  const sourceById = new Map(
    input.candidate.provenance.sourceRecords.map((source) => [source.id, source] as const),
  );

  const speciesMappings = mappingByCanonicalId(input.mappingRegistry, "species");
  const moveMappings = mappingByCanonicalId(input.mappingRegistry, "moves");
  const typeMappings = mappingByCanonicalId(input.mappingRegistry, "types");
  const abilityMappings = mappingByCanonicalId(input.mappingRegistry, "abilities");
  const itemMappings = mappingByCanonicalId(input.mappingRegistry, "items");

  assertHistoricalMoveRawBindings(
    input.rawExtracted,
    input.candidate,
    moveMappings,
    typeMappings,
  );

  const ordinarySpecies = byId(input.candidate.catalogs.species).find(
    (record) => record.formLabel === null,
  );
  if (!ordinarySpecies) throw new Error("review stage sample requires an ordinary persistent Species");
  const alternateSpecies = byId(input.candidate.catalogs.species).find(
    (record) => record.formLabel !== null,
  );
  const sourceUnavailable = firstSourceUnavailableFact(input.candidate.catalogs.species);
  if (!sourceUnavailable) {
    throw new Error("review stage sample requires a legitimate source-unavailable Species fact");
  }

  const speciesInventory = input.candidate.provenance.inventories.find(
    (inventory) => inventory.surface === "species",
  );
  if (!speciesInventory) throw new Error("review stage sample requires Species source inventory");
  const normalizedExcludedSpeciesEvidence = normalizeExcludedSpeciesEvidence(
    input.excludedSpeciesEvidence,
    sourceById,
  );
  const inventoryExclusionKeys = [...speciesInventory.excludedOrDeferred]
    .map((entry) => entry.sourceKey.normalize("NFC"))
    .sort((left, right) => left.localeCompare(right, "en"));
  const evidenceExclusionKeys = normalizedExcludedSpeciesEvidence
    .map((entry) => entry.sourceKey)
    .sort((left, right) => left.localeCompare(right, "en"));
  if (canonicalJson(inventoryExclusionKeys) !== canonicalJson(evidenceExclusionKeys)) {
    throw new Error(
      `review stage exclusion evidence must exactly cover Species inventory exclusions; inventory=${canonicalJson(inventoryExclusionKeys)} evidence=${canonicalJson(evidenceExclusionKeys)}`,
    );
  }
  const exclusionEvidence = new Map(
    normalizedExcludedSpeciesEvidence.map((entry) => [entry.sourceKey, entry] as const),
  );
  const excludedOrDeferredSpecies = [...speciesInventory.excludedOrDeferred]
    .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey, "en"))
    .find(
      (entry) =>
        entry.reason === BATTLE_ONLY_TRANSFORMATION_EXCLUSION_REASON &&
        exclusionEvidence.has(entry.sourceKey.normalize("NFC")),
    );
  if (!excludedOrDeferredSpecies) {
    throw new Error(
      "review stage sample requires battle-only-transformation Species evidence bound to its fetched source record",
    );
  }
  const exclusionBinding = exclusionEvidence.get(excludedOrDeferredSpecies.sourceKey.normalize("NFC"));
  if (!exclusionBinding) throw new Error("review stage exclusion source binding is missing");

  const moveFactSourcesByMoveId = new Map(
    input.candidate.provenance.moveFactSources.map((relation) => [relation.moveId, relation] as const),
  );
  const sortedMoves = byId(input.candidate.catalogs.moves);
  const move =
    sortedMoves.find(
      (record) =>
        moveFactSourcesByMoveId.get(record.id)?.mainline.selectedGame !== "scarlet-violet",
    ) ?? sortedMoves[0];
  const type = byId(input.candidate.catalogs.types)[0];
  const ability = byId(input.candidate.catalogs.abilities)[0];
  const item = byId(input.candidate.catalogs.items)[0];
  const learnset = [...input.candidate.catalogs.learnsets].sort((left, right) =>
    canonicalJson(left).localeCompare(canonicalJson(right), "en"),
  )[0];
  if (!move || !type || !ability || !item || !learnset) {
    throw new Error("review stage sample requires representative Move, Type, Ability, Item and Learnset records");
  }
  const moveFactSources = moveFactSourcesByMoveId.get(move.id);
  if (!moveFactSources) throw new Error(`review stage sample Move ${move.id} has no fact-source relation`);

  const humanReviewSample: HumanReviewSample = {
    schemaVersion: input.candidate.schemaVersion,
    normalizerVersion: input.candidate.normalizerVersion,
    candidateContentHash,
    mappingProposalsContentHash,
    provenanceHash,
    sourceInventoryHash,
    ordinarySpecies: recordSample(ordinarySpecies, speciesMappings, sourceById, "ordinary Species sample"),
    alternateSpecies: alternateSpecies
      ? recordSample(alternateSpecies, speciesMappings, sourceById, "alternate Species sample")
      : null,
    sourceUnavailableSpeciesFact: {
      speciesId: sourceUnavailable.species.id,
      field: sourceUnavailable.field,
      fact: sourceUnavailable.fact,
      mapping: mappingFor(
        speciesMappings,
        sourceUnavailable.species.id,
        "source-unavailable Species sample",
      ),
      sourceRecords: sourceRecordsFor(
        sourceUnavailable.species.sourceRecordIds,
        sourceById,
        "source-unavailable Species sample",
      ),
    },
    excludedOrDeferredSpecies: {
      ...excludedOrDeferredSpecies,
      sourceRecords: sourceRecordsFor(
        exclusionBinding.sourceRecordIds,
        sourceById,
        "excluded/deferred Species sample",
      ),
    },
    move: {
      ...recordSample(move, moveMappings, sourceById, "Move sample"),
      factSources: moveFactSources,
    },
    type: recordSample(type, typeMappings, sourceById, "Type sample"),
    ability: recordSample(ability, abilityMappings, sourceById, "Ability sample"),
    item: recordSample(item, itemMappings, sourceById, "Item sample"),
    learnset: {
      record: learnset,
      speciesMapping: mappingFor(speciesMappings, learnset.speciesId, "Learnset Species sample"),
      moveMapping: mappingFor(moveMappings, learnset.moveId, "Learnset Move sample"),
      sourceRecords: sourceRecordsFor(learnset.sourceRecordIds, sourceById, "Learnset sample"),
    },
  };

  const files: ReviewStageFileDescriptor[] = [
    descriptor("raw-extracted", "raw-extracted.json", input.rawExtracted),
    descriptor("mapping-proposals", "mapping-proposals.json", input.mappingRegistry),
    descriptor("normalized-candidate", "normalized-candidate.json", input.candidate),
    descriptor("provenance", "provenance-manifest.json", input.candidate.provenance),
    descriptor("validation-report", "validation-report.json", input.validationReport),
    descriptor(
      "excluded-species-evidence",
      "excluded-species-evidence.json",
      normalizedExcludedSpeciesEvidence,
    ),
    descriptor("human-review-sample", "human-review-sample.json", humanReviewSample),
  ];
  const manifestWithoutHash = {
    reviewStageVersion: REVIEW_STAGE_VERSION,
    reviewScope: REVIEW_SCOPE,
    schemaVersion: input.candidate.schemaVersion,
    normalizerVersion: input.candidate.normalizerVersion,
    candidateContentHash,
    mappingProposalsContentHash,
    provenanceHash,
    sourceInventoryHash,
    files,
  };
  const manifest: ReviewStageManifest = {
    ...manifestWithoutHash,
    reviewHash: contentHash(manifestWithoutHash),
  };
  return {
    manifest,
    excludedSpeciesEvidence: normalizedExcludedSpeciesEvidence,
    humanReviewSample,
  };
}
