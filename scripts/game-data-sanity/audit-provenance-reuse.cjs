const fs = require("fs");

const base = process.env.POKENEXUS_GAME_DATA_BASE;
if (!base) {
  throw new Error("POKENEXUS_GAME_DATA_BASE is required; run audits through run-sanity.cjs");
}
const species = JSON.parse(fs.readFileSync(base + "/catalogs/species.json", "utf8"));
const moves = JSON.parse(fs.readFileSync(base + "/catalogs/moves.json", "utf8"));
const abilities = JSON.parse(fs.readFileSync(base + "/catalogs/abilities.json", "utf8"));
const types = JSON.parse(fs.readFileSync(base + "/catalogs/types.json", "utf8"));
const items = JSON.parse(fs.readFileSync(base + "/catalogs/items.json", "utf8"));
const learnsets = JSON.parse(fs.readFileSync(base + "/catalogs/learnsets.json", "utf8"));
const typeEffectiveness = JSON.parse(
  fs.readFileSync(base + "/reference-data/current-type-effectiveness.json", "utf8"),
);
const provenance = JSON.parse(fs.readFileSync(base + "/provenance.json", "utf8"));

const speciesById = new Map(species.map((record) => [record.id, record]));
const sourceById = new Map(provenance.sourceRecords.map((record) => [record.id, record]));
const moveFactSourceByMoveId = new Map(
  provenance.moveFactSources.map((record) => [record.moveId, record]),
);

const usage = new Map();
function addUsage(sourceRecordId, surface, entityId) {
  const entry = usage.get(sourceRecordId) || {
    surfaces: new Set(),
    entitiesBySurface: new Map(),
  };
  entry.surfaces.add(surface);
  const entities = entry.entitiesBySurface.get(surface) || new Set();
  entities.add(entityId);
  entry.entitiesBySurface.set(surface, entities);
  usage.set(sourceRecordId, entry);
}

const surfaces = [
  ["species", species, (record) => record.id],
  ["moves", moves, (record) => record.id],
  ["abilities", abilities, (record) => record.id],
  ["types", types, (record) => record.id],
  ["items", items, (record) => record.id],
  ["learnsets", learnsets, (record) => record.speciesId + "|" + record.moveId],
  [
    "type-effectiveness",
    typeEffectiveness,
    (record) => record.attackTypeId + "|" + record.defenseTypeId,
  ],
];
for (const [surface, rows, entityId] of surfaces) {
  for (const row of rows) {
    for (const sourceRecordId of row.sourceRecordIds || []) {
      addUsage(sourceRecordId, surface, entityId(row));
    }
  }
}

const crossSurface = [...usage.entries()].filter(([, entry]) => entry.surfaces.size > 1);
const crossSurfaceCombinationCounts = {};
for (const [, entry] of crossSurface) {
  const key = [...entry.surfaces].sort().join("+");
  crossSurfaceCombinationCounts[key] = (crossSurfaceCombinationCounts[key] || 0) + 1;
}

const allowedCrossSurfaceCombinations = new Set([
  "learnsets+species",
  "learnsets+moves",
  "type-effectiveness+types",
]);
const unexpectedCrossSurface = crossSurface.filter(([, entry]) => {
  const key = [...entry.surfaces].sort().join("+");
  return !allowedCrossSurfaceCombinations.has(key);
});

const learnsetSpeciesBySource = new Map();
for (const row of learnsets) {
  for (const sourceRecordId of row.sourceRecordIds || []) {
    const ids = learnsetSpeciesBySource.get(sourceRecordId) || new Set();
    ids.add(row.speciesId);
    learnsetSpeciesBySource.set(sourceRecordId, ids);
  }
}

const speciesEntitiesBySource = new Map();
for (const record of species) {
  for (const sourceRecordId of record.sourceRecordIds || []) {
    const ids = speciesEntitiesBySource.get(sourceRecordId) || new Set();
    ids.add(record.id);
    speciesEntitiesBySource.set(sourceRecordId, ids);
  }
}

function nationalDexSet(speciesIds) {
  return new Set(
    [...speciesIds]
      .map((id) => speciesById.get(id)?.nationalDexNumber)
      .filter((value) => value !== undefined),
  );
}

const learnsetSourcesAcrossDifferentNationalDex = [...learnsetSpeciesBySource.entries()]
  .filter(([, speciesIds]) => nationalDexSet(speciesIds).size > 1)
  .map(([sourceRecordId, speciesIds]) => ({
    sourceRecordId,
    source: sourceById.get(sourceRecordId),
    species: [...speciesIds].map((id) => speciesById.get(id)?.sourceName),
    nationalDex: [...nationalDexSet(speciesIds)],
  }));

const speciesSourcesAcrossDifferentNationalDex = [...speciesEntitiesBySource.entries()]
  .filter(([, speciesIds]) => nationalDexSet(speciesIds).size > 1)
  .map(([sourceRecordId, speciesIds]) => ({
    sourceRecordId,
    source: sourceById.get(sourceRecordId),
    speciesIds,
  }));

const unexplainedSpeciesCrossDexSources = speciesSourcesAcrossDifferentNationalDex.filter(
  (entry) =>
    entry.source?.parserVersion !== "bulbapedia-regional-form-evidence-v2" ||
    entry.source?.canonicalUrl !== "https://bulbapedia.bulbagarden.net/wiki/Regional_form",
);

const invalidSharedSpeciesLearnsetSources = crossSurface
  .filter(([, entry]) => {
    const key = [...entry.surfaces].sort().join("+");
    return key === "learnsets+species";
  })
  .map(([sourceRecordId]) => {
    const directSpecies = speciesEntitiesBySource.get(sourceRecordId) || new Set();
    const learnsetSpecies = learnsetSpeciesBySource.get(sourceRecordId) || new Set();
    const allSpecies = new Set([...directSpecies, ...learnsetSpecies]);
    return {
      sourceRecordId,
      source: sourceById.get(sourceRecordId),
      nationalDex: [...nationalDexSet(allSpecies)],
    };
  })
  .filter((entry) => entry.nationalDex.length > 1);

const sharedLearnsetMoveSources = crossSurface.filter(([, entry]) => {
  const key = [...entry.surfaces].sort().join("+");
  return key === "learnsets+moves";
});
const invalidSharedLearnsetMoveSources = [];
for (const [sourceRecordId, entry] of sharedLearnsetMoveSources) {
  const source = sourceById.get(sourceRecordId);
  const moveIds = entry.entitiesBySurface.get("moves") || new Set();
  const roleMatches = [];
  let valid = false;
  if (
    source &&
    source.provider === "bulbapedia" &&
    source.parserVersion === "bulbapedia-gen8-learnset-v6"
  ) {
    try {
      const url = new URL(source.canonicalUrl);
      valid =
        url.protocol === "https:" &&
        url.hostname === "bulbapedia.bulbagarden.net" &&
        /\/Generation_VIII_learnset$/.test(decodeURIComponent(url.pathname)) &&
        url.search === "" &&
        url.hash === "";
    } catch {
      valid = false;
    }
  }

  for (const moveId of moveIds) {
    const relation = moveFactSourceByMoveId.get(moveId);
    const mainlineMatch =
      relation?.mainline?.sourceRecordId === sourceRecordId &&
      relation?.mainline?.selectedGame === "brilliant-diamond-shining-pearl";
    const unexpectedOtherRole =
      relation?.sourceTargetSourceRecordId === sourceRecordId ||
      relation?.makesContactSourceRecordId === sourceRecordId ||
      relation?.zaBaseCooldownSourceRecordId === sourceRecordId;
    roleMatches.push({ moveId, mainlineMatch, unexpectedOtherRole });
    if (!mainlineMatch || unexpectedOtherRole) valid = false;
  }

  if (!valid) {
    invalidSharedLearnsetMoveSources.push({
      sourceRecordId,
      source,
      roleMatches,
    });
  }
}

const sharedTypeChartSources = crossSurface.filter(([, entry]) => {
  const key = [...entry.surfaces].sort().join("+");
  return key === "type-effectiveness+types";
});
const invalidSharedTypeChartSources = sharedTypeChartSources
  .map(([sourceRecordId]) => ({
    sourceRecordId,
    source: sourceById.get(sourceRecordId),
  }))
  .filter(
    ({ source }) =>
      !source ||
      source.provider !== "bulbapedia" ||
      source.parserVersion !== "bulbapedia-current-type-chart-v1" ||
      source.canonicalUrl !== "https://bulbapedia.bulbagarden.net/wiki/Type/Type_chart",
  );

const result = {
  sourceRecords: provenance.sourceRecords.length,
  referencedSourceRecords: usage.size,
  crossSurface: {
    records: crossSurface.length,
    combinations: crossSurfaceCombinationCounts,
    unexpectedCombinationRecords: unexpectedCrossSurface.length,
  },
  learnsetEvidence: {
    sourceRecords: learnsetSpeciesBySource.size,
    sourceRecordsAcrossDifferentNationalDex: learnsetSourcesAcrossDifferentNationalDex.length,
    crossDexEvidence: learnsetSourcesAcrossDifferentNationalDex,
  },
  speciesEvidence: {
    sourceRecords: speciesEntitiesBySource.size,
    sourceRecordsAcrossDifferentNationalDex: speciesSourcesAcrossDifferentNationalDex.length,
    explainedRegionalFormAggregateSources:
      speciesSourcesAcrossDifferentNationalDex.length - unexplainedSpeciesCrossDexSources.length,
    unexplainedCrossDexSources: unexplainedSpeciesCrossDexSources.length,
  },
  sharedSpeciesLearnsetEvidence: {
    sourceRecords: crossSurfaceCombinationCounts["learnsets+species"] || 0,
    crossNationalDexViolations: invalidSharedSpeciesLearnsetSources.length,
    violations: invalidSharedSpeciesLearnsetSources,
  },
  sharedLearnsetMoveEvidence: {
    sourceRecords: sharedLearnsetMoveSources.length,
    validBdspMainlineProofSources:
      sharedLearnsetMoveSources.length - invalidSharedLearnsetMoveSources.length,
    invalidSources: invalidSharedLearnsetMoveSources.length,
    violations: invalidSharedLearnsetMoveSources,
  },
  sharedTypeChartEvidence: {
    sourceRecords: sharedTypeChartSources.length,
    validCurrentTypeChartSources:
      sharedTypeChartSources.length - invalidSharedTypeChartSources.length,
    invalidSources: invalidSharedTypeChartSources.length,
    violations: invalidSharedTypeChartSources,
  },
};

fs.writeFileSync(
  ".tmp-game-data-sanity/provenance-reuse-audit.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));

if (
  result.crossSurface.unexpectedCombinationRecords !== 0 ||
  result.learnsetEvidence.sourceRecordsAcrossDifferentNationalDex !== 0 ||
  result.speciesEvidence.unexplainedCrossDexSources !== 0 ||
  result.sharedSpeciesLearnsetEvidence.crossNationalDexViolations !== 0 ||
  result.sharedLearnsetMoveEvidence.invalidSources !== 0 ||
  result.sharedTypeChartEvidence.invalidSources !== 0
) {
  process.exitCode = 2;
}
