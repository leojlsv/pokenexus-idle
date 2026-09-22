import { BULBAPEDIA_GEN8_LEARNSET_PARSER_VERSION } from "./bulbapedia-learnset-parser.js";
import {
  BULBAPEDIA_TYPE_CHART_PARSER_VERSION,
  BULBAPEDIA_TYPE_CHART_URL,
} from "./bulbapedia-reference-parser.js";
import {
  BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_PARSER_VERSION,
  BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_URL,
} from "./bulbapedia-species-static-facts.js";
import type {
  GameDataCandidate,
  MappingRegistry,
  SourceRecord,
  ValidationFinding,
} from "./schema.js";

function finding(code: string, path: string, message: string): ValidationFinding {
  return { code, path, message };
}

function acceptedSourceKeyByCanonicalId(
  registry: MappingRegistry,
  surface: "species" | "moves",
): Map<string, string> {
  return new Map(
    registry[surface]
      .filter((entry) => entry.status === "accepted")
      .map((entry) => [entry.canonicalId, entry.sourceKey.normalize("NFC")] as const),
  );
}

function canonicalLearnsetInventoryKey(
  row: GameDataCandidate["catalogs"]["learnsets"][number],
  speciesSourceKeyById: ReadonlyMap<string, string>,
  moveSourceKeyById: ReadonlyMap<string, string>,
): string | null {
  const speciesSourceKey = speciesSourceKeyById.get(row.speciesId);
  const moveSourceKey = moveSourceKeyById.get(row.moveId);
  if (!speciesSourceKey || !moveSourceKey) return null;
  return JSON.stringify([
    speciesSourceKey,
    moveSourceKey,
    row.sourceGeneration,
    row.sourceGame.normalize("NFC"),
    row.method,
    row.level,
    row.machineIdentifier?.normalize("NFC") ?? null,
  ]);
}

function isCanonicalLearnsetInventoryKey(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    return (
      Array.isArray(parsed) &&
      parsed.length === 7 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string" &&
      Number.isSafeInteger(parsed[2]) &&
      typeof parsed[3] === "string" &&
      typeof parsed[4] === "string" &&
      (parsed[5] === null || Number.isSafeInteger(parsed[5])) &&
      (parsed[6] === null || typeof parsed[6] === "string")
    );
  } catch {
    return false;
  }
}

function isAllowedUnreferencedSource(source: SourceRecord): boolean {
  try {
    const url = new URL(source.canonicalUrl);
    const pathname = decodeURIComponent(url.pathname);
    return (
      (source.provider === "bulbapedia" &&
        source.parserVersion === BULBAPEDIA_GEN8_LEARNSET_PARSER_VERSION &&
        url.protocol === "https:" &&
        url.hostname === "bulbapedia.bulbagarden.net" &&
        /\/Generation_VIII_learnset$/u.test(pathname) &&
        url.search === "" &&
        url.hash === "") ||
      (source.provider === "bulbapedia" &&
        source.parserVersion === BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_PARSER_VERSION &&
        url.href === new URL(BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_URL).href)
    );
  } catch {
    return false;
  }
}

function isValidSharedLearnsetMoveSource(source: SourceRecord | undefined): boolean {
  if (
    !source ||
    source.provider !== "bulbapedia" ||
    source.parserVersion !== BULBAPEDIA_GEN8_LEARNSET_PARSER_VERSION
  ) {
    return false;
  }
  try {
    const url = new URL(source.canonicalUrl);
    return (
      url.protocol === "https:" &&
      url.hostname === "bulbapedia.bulbagarden.net" &&
      /\/Generation_VIII_learnset$/u.test(decodeURIComponent(url.pathname)) &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isRegionalFormAggregateSource(source: SourceRecord | undefined): boolean {
  if (
    !source ||
    source.provider !== "bulbapedia" ||
    source.parserVersion !== "bulbapedia-regional-form-evidence-v2"
  ) {
    return false;
  }
  try {
    return (
      new URL(source.canonicalUrl).href === "https://bulbapedia.bulbagarden.net/wiki/Regional_form"
    );
  } catch {
    return false;
  }
}

function isCurrentTypeChartSource(source: SourceRecord | undefined): boolean {
  if (
    !source ||
    source.provider !== "bulbapedia" ||
    source.parserVersion !== BULBAPEDIA_TYPE_CHART_PARSER_VERSION
  ) {
    return false;
  }
  try {
    return new URL(source.canonicalUrl).href === new URL(BULBAPEDIA_TYPE_CHART_URL).href;
  } catch {
    return false;
  }
}

export function validateCandidatePublicationSanity(
  candidate: GameDataCandidate,
  registry: MappingRegistry,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const speciesById = new Map(candidate.catalogs.species.map((record) => [record.id, record]));
  const rowsBySpecies = new Map(candidate.catalogs.species.map((record) => [record.id, 0]));
  const rowsByMove = new Map(candidate.catalogs.moves.map((record) => [record.id, 0]));
  const contextsBySpecies = new Map<string, Set<string>>();
  const machineMovesByContext = new Map<string, Set<string>>();

  for (const row of candidate.catalogs.learnsets) {
    if (rowsBySpecies.has(row.speciesId)) {
      rowsBySpecies.set(row.speciesId, (rowsBySpecies.get(row.speciesId) ?? 0) + 1);
    }
    if (rowsByMove.has(row.moveId)) {
      rowsByMove.set(row.moveId, (rowsByMove.get(row.moveId) ?? 0) + 1);
    }
    const contexts = contextsBySpecies.get(row.speciesId) ?? new Set<string>();
    contexts.add(String(row.sourceGeneration) + "\u0000" + row.sourceGame.normalize("NFC"));
    contextsBySpecies.set(row.speciesId, contexts);

    if (row.method === "machine" && row.machineIdentifier) {
      const key = [
        String(row.sourceGeneration),
        row.sourceGame.normalize("NFC"),
        row.machineIdentifier.normalize("NFC"),
      ].join("\u0000");
      const moveIds = machineMovesByContext.get(key) ?? new Set<string>();
      moveIds.add(row.moveId);
      machineMovesByContext.set(key, moveIds);
    }
  }

  for (const record of candidate.catalogs.species) {
    if ((rowsBySpecies.get(record.id) ?? 0) === 0) {
      findings.push(
        finding(
          "sanity-species-missing-learnset",
          "catalogs.species." + record.id,
          "every published Species must have at least one current Learnset row",
        ),
      );
    }
    const contextCount = contextsBySpecies.get(record.id)?.size ?? 0;
    if (contextCount !== 1) {
      findings.push(
        finding(
          "sanity-species-learnset-context",
          "catalogs.species." + record.id,
          "published Species must resolve to exactly one Learnset source context; found " +
            String(contextCount),
        ),
      );
    }

    const hasFormLabel = record.formLabel !== null;
    const hasBaseSpeciesId = record.baseSpeciesId !== null;
    if (hasFormLabel !== hasBaseSpeciesId) {
      findings.push(
        finding(
          "sanity-form-identity-shape",
          "catalogs.species." + record.id,
          "formLabel and baseSpeciesId must either both be present or both be absent",
        ),
      );
    }
    if (record.baseSpeciesId) {
      const base = speciesById.get(record.baseSpeciesId);
      if (base) {
        if (base.formLabel !== null || base.baseSpeciesId !== null) {
          findings.push(
            finding(
              "sanity-form-base-not-canonical",
              "catalogs.species." + record.id + ".baseSpeciesId",
              "a form must point directly to a canonical base Species",
            ),
          );
        }
        if (record.nationalDexNumber !== base.nationalDexNumber) {
          findings.push(
            finding(
              "sanity-form-national-dex-mismatch",
              "catalogs.species." + record.id + ".nationalDexNumber",
              "a form must retain the National Dex number of its base Species",
            ),
          );
        }
        if (record.introducedGeneration < base.introducedGeneration) {
          findings.push(
            finding(
              "sanity-form-generation-before-base",
              "catalogs.species." + record.id + ".introducedGeneration",
              "a form cannot be introduced before its base Species",
            ),
          );
        }
      }
    }
  }

  for (const record of candidate.catalogs.moves) {
    if ((rowsByMove.get(record.id) ?? 0) === 0) {
      findings.push(
        finding(
          "sanity-move-unreferenced-by-learnset",
          "catalogs.moves." + record.id,
          "every current MoveDefinition must be referenced by at least one published Learnset row",
        ),
      );
    }
  }

  for (const [key, moveIds] of machineMovesByContext) {
    if (moveIds.size > 1) {
      findings.push(
        finding(
          "sanity-machine-context-conflict",
          "catalogs.learnsets",
          "machine identity " +
            JSON.stringify(key.split("\u0000")) +
            " maps to multiple Moves in the same source context",
        ),
      );
    }
  }

  const learnsetInventory = candidate.provenance.inventories.find(
    (inventory) => inventory.surface === "learnsets",
  );
  if (learnsetInventory) {
    if (learnsetInventory.acceptedMappingKeys.length !== candidate.catalogs.learnsets.length) {
      findings.push(
        finding(
          "sanity-learnset-inventory-count-mismatch",
          "provenance.inventories.learnsets.acceptedMappingKeys",
          "accepted Learnset inventory count must equal the published Learnset row count",
        ),
      );
    }

    if (
      learnsetInventory.acceptedMappingKeys.some((key) => !isCanonicalLearnsetInventoryKey(key))
    ) {
      findings.push(
        finding(
          "sanity-learnset-inventory-key-invalid",
          "provenance.inventories.learnsets.acceptedMappingKeys",
          "accepted Learnset inventory keys must use the canonical seven-field identity tuple",
        ),
      );
    } else {
      const speciesSourceKeyById = acceptedSourceKeyByCanonicalId(registry, "species");
      const moveSourceKeyById = acceptedSourceKeyByCanonicalId(registry, "moves");
      const mappingsAreCanonical =
        candidate.catalogs.species.every((record) => speciesSourceKeyById.has(record.id)) &&
        candidate.catalogs.moves.every((record) => moveSourceKeyById.has(record.id));
      if (mappingsAreCanonical) {
        const publishedKeys = candidate.catalogs.learnsets
          .map((row) => canonicalLearnsetInventoryKey(row, speciesSourceKeyById, moveSourceKeyById))
          .filter((key): key is string => key !== null);
        const acceptedKeys = new Set(learnsetInventory.acceptedMappingKeys);
        const publishedKeySet = new Set(publishedKeys);
        if (
          publishedKeys.length !== candidate.catalogs.learnsets.length ||
          acceptedKeys.size !== learnsetInventory.acceptedMappingKeys.length ||
          publishedKeySet.size !== candidate.catalogs.learnsets.length ||
          [...acceptedKeys].some((key) => !publishedKeySet.has(key)) ||
          [...publishedKeySet].some((key) => !acceptedKeys.has(key))
        ) {
          findings.push(
            finding(
              "sanity-learnset-inventory-parity",
              "provenance.inventories.learnsets.acceptedMappingKeys",
              "published Learnset rows must match the accepted Learnset inventory exactly 1:1",
            ),
          );
        }
      }
    }
  }

  const sourceById = new Map(
    candidate.provenance.sourceRecords.map((source) => [source.id, source]),
  );
  const directlyReferencedSourceIds = new Set<string>();
  const surfacesBySource = new Map<string, Set<string>>();
  const directSpeciesBySource = new Map<
    string,
    Set<(typeof candidate.catalogs.species)[number]["id"]>
  >();
  const equivalentSourceKeys = new Map<string, string>();
  for (const source of candidate.provenance.sourceRecords) {
    const equivalentKey = [
      source.provider,
      source.canonicalUrl.normalize("NFC"),
      source.sourceContentHash,
      source.parserVersion,
    ].join("\u0000");
    const existing = equivalentSourceKeys.get(equivalentKey);
    if (existing && existing !== source.id) {
      findings.push(
        finding(
          "sanity-duplicate-equivalent-provenance",
          "provenance.sourceRecords." + source.id,
          "equivalent SourceRecord evidence already exists as " + existing,
        ),
      );
    } else {
      equivalentSourceKeys.set(equivalentKey, source.id);
    }
  }

  const sourceBackedSurfaces: Array<{
    surface: string;
    rows: ReadonlyArray<{ sourceRecordIds: string[] }>;
  }> = [
    { surface: "species", rows: candidate.catalogs.species },
    { surface: "moves", rows: candidate.catalogs.moves },
    { surface: "types", rows: candidate.catalogs.types },
    { surface: "abilities", rows: candidate.catalogs.abilities },
    { surface: "items", rows: candidate.catalogs.items },
    { surface: "learnsets", rows: candidate.catalogs.learnsets },
    {
      surface: "type-effectiveness",
      rows: candidate.referenceData.currentTypeEffectiveness,
    },
  ];
  for (const { surface, rows } of sourceBackedSurfaces) {
    for (const row of rows) {
      for (const sourceRecordId of row.sourceRecordIds) {
        directlyReferencedSourceIds.add(sourceRecordId);
        const surfaces = surfacesBySource.get(sourceRecordId) ?? new Set<string>();
        surfaces.add(surface);
        surfacesBySource.set(sourceRecordId, surfaces);
      }
    }
  }
  for (const species of candidate.catalogs.species) {
    for (const sourceRecordId of species.sourceRecordIds) {
      const speciesIds =
        directSpeciesBySource.get(sourceRecordId) ??
        new Set<(typeof candidate.catalogs.species)[number]["id"]>();
      speciesIds.add(species.id);
      directSpeciesBySource.set(sourceRecordId, speciesIds);
    }
  }
  for (const relation of candidate.provenance.moveFactSources) {
    directlyReferencedSourceIds.add(relation.mainline.sourceRecordId);
    directlyReferencedSourceIds.add(relation.sourceTargetSourceRecordId);
    directlyReferencedSourceIds.add(relation.makesContactSourceRecordId);
    directlyReferencedSourceIds.add(relation.zaBaseCooldownSourceRecordId);
  }
  for (const source of candidate.provenance.sourceRecords) {
    if (!directlyReferencedSourceIds.has(source.id) && !isAllowedUnreferencedSource(source)) {
      findings.push(
        finding(
          "sanity-unexplained-unreferenced-provenance",
          "provenance.sourceRecords." + source.id,
          "unreferenced SourceRecord is not recognized retained ingestion/audit evidence",
        ),
      );
    }
  }

  const allowedCrossSurfaceCombinations = new Set([
    "learnsets+species",
    "learnsets+moves",
    "type-effectiveness+types",
  ]);
  for (const [sourceRecordId, surfaces] of surfacesBySource) {
    if (surfaces.size < 2) continue;
    const combination = [...surfaces].sort().join("+");
    if (!allowedCrossSurfaceCombinations.has(combination)) {
      findings.push(
        finding(
          "sanity-unexpected-cross-surface-provenance",
          "provenance.sourceRecords." + sourceRecordId,
          "SourceRecord is reused across unsupported catalog surfaces: " + combination,
        ),
      );
    } else if (
      combination === "type-effectiveness+types" &&
      !isCurrentTypeChartSource(sourceById.get(sourceRecordId))
    ) {
      findings.push(
        finding(
          "sanity-invalid-shared-type-chart-provenance",
          "provenance.sourceRecords." + sourceRecordId,
          "Type and type-effectiveness evidence may be shared only by the approved current Bulbapedia type-chart source",
        ),
      );
    }
  }

  for (const [sourceRecordId, speciesIds] of directSpeciesBySource) {
    const nationalDex = new Set(
      [...speciesIds]
        .map((speciesId) => speciesById.get(speciesId)?.nationalDexNumber)
        .filter((value): value is number => value !== undefined),
    );
    if (nationalDex.size > 1 && !isRegionalFormAggregateSource(sourceById.get(sourceRecordId))) {
      findings.push(
        finding(
          "sanity-species-provenance-cross-dex",
          "provenance.sourceRecords." + sourceRecordId,
          "Species SourceRecord reused across National Dex identities must be the approved Regional form aggregate evidence",
        ),
      );
    }
  }

  const learnsetSpeciesBySource = new Map<
    string,
    Set<(typeof candidate.catalogs.species)[number]["id"]>
  >();
  const moveIdsBySource = new Map<string, Set<string>>();
  for (const row of candidate.catalogs.learnsets) {
    for (const sourceRecordId of row.sourceRecordIds) {
      const speciesIds =
        learnsetSpeciesBySource.get(sourceRecordId) ??
        new Set<(typeof candidate.catalogs.species)[number]["id"]>();
      speciesIds.add(row.speciesId);
      learnsetSpeciesBySource.set(sourceRecordId, speciesIds);
    }
  }
  for (const move of candidate.catalogs.moves) {
    for (const sourceRecordId of move.sourceRecordIds) {
      const moveIds = moveIdsBySource.get(sourceRecordId) ?? new Set<string>();
      moveIds.add(move.id);
      moveIdsBySource.set(sourceRecordId, moveIds);
    }
  }

  for (const [sourceRecordId, speciesIds] of learnsetSpeciesBySource) {
    const nationalDex = new Set(
      [...speciesIds]
        .map((speciesId) => speciesById.get(speciesId)?.nationalDexNumber)
        .filter((value): value is number => value !== undefined),
    );
    if (nationalDex.size > 1) {
      findings.push(
        finding(
          "sanity-learnset-provenance-cross-dex",
          "provenance.sourceRecords." + sourceRecordId,
          "one Learnset SourceRecord must not provide evidence for different National Dex identities",
        ),
      );
    }

    const directSpeciesIds = directSpeciesBySource.get(sourceRecordId);
    if (directSpeciesIds) {
      const combinedNationalDex = new Set(
        [...directSpeciesIds, ...speciesIds]
          .map((speciesId) => speciesById.get(speciesId)?.nationalDexNumber)
          .filter((value): value is number => value !== undefined),
      );
      if (combinedNationalDex.size > 1) {
        findings.push(
          finding(
            "sanity-shared-species-learnset-provenance-cross-dex",
            "provenance.sourceRecords." + sourceRecordId,
            "SourceRecord shared by Species and Learnset evidence must remain within one National Dex identity",
          ),
        );
      }
    }

    const sharedMoveIds = moveIdsBySource.get(sourceRecordId);
    if (!sharedMoveIds) continue;
    const source = sourceById.get(sourceRecordId);
    for (const moveId of sharedMoveIds) {
      const relation = candidate.provenance.moveFactSources.find(
        (entry) => entry.moveId === moveId,
      );
      const valid =
        isValidSharedLearnsetMoveSource(source) &&
        relation?.mainline.sourceRecordId === sourceRecordId &&
        relation.mainline.selectedGame === "brilliant-diamond-shining-pearl" &&
        relation.sourceTargetSourceRecordId !== sourceRecordId &&
        relation.makesContactSourceRecordId !== sourceRecordId &&
        relation.zaBaseCooldownSourceRecordId !== sourceRecordId;
      if (!valid) {
        findings.push(
          finding(
            "sanity-invalid-shared-learnset-move-provenance",
            "provenance.sourceRecords." + sourceRecordId,
            "Learnset evidence shared with Move " +
              moveId +
              " is not a valid BDSP mainline scalar-proof source",
          ),
        );
      }
    }
  }

  return findings;
}
