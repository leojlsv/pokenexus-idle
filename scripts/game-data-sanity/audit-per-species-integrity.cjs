const fs = require("fs");

const base = process.env.POKENEXUS_GAME_DATA_BASE;
if (!base) {
  throw new Error("POKENEXUS_GAME_DATA_BASE is required; run audits through run-sanity.cjs");
}
const species = JSON.parse(fs.readFileSync(base + "/catalogs/species.json", "utf8"));
const moves = JSON.parse(fs.readFileSync(base + "/catalogs/moves.json", "utf8"));
const abilities = JSON.parse(fs.readFileSync(base + "/catalogs/abilities.json", "utf8"));
const types = JSON.parse(fs.readFileSync(base + "/catalogs/types.json", "utf8"));
const learnsets = JSON.parse(fs.readFileSync(base + "/catalogs/learnsets.json", "utf8"));
const provenance = JSON.parse(fs.readFileSync(base + "/provenance.json", "utf8"));
const roster = JSON.parse(
  fs.readFileSync("packages/game-data/src/canonical-mapping-roster.json", "utf8"),
);

const selectedNames = new Set(["Charizard", "Tyranitar", "Dragonite", "Snorlax", "Donphan"]);

const speciesById = new Map(species.map((record) => [record.id, record]));
const moveById = new Map(moves.map((record) => [record.id, record]));
const abilityIds = new Set(abilities.map((record) => record.id));
const typeIds = new Set(types.map((record) => record.id));
const sourceRecordIds = new Set(provenance.sourceRecords.map((record) => record.id));
const currentMoveIds = new Set(moves.map((record) => record.id));
const historicalMoveIds = new Set(
  roster.mappings.moves
    .filter((mapping) => mapping.status === "accepted" && !currentMoveIds.has(mapping.canonicalId))
    .map((mapping) => mapping.canonicalId),
);

const learnsetsBySpecies = new Map();
for (const row of learnsets) {
  const rows = learnsetsBySpecies.get(row.speciesId) || [];
  rows.push(row);
  learnsetsBySpecies.set(row.speciesId, rows);
}

function countUnresolvedSourceRefs(rows) {
  let count = 0;
  for (const row of rows) {
    for (const id of row.sourceRecordIds || []) {
      if (!sourceRecordIds.has(id)) count += 1;
    }
  }
  return count;
}

function duplicateExtraCount(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

const perSpecies = species.map((record) => {
  const rows = learnsetsBySpecies.get(record.id) || [];
  const uniqueMoveIds = [...new Set(rows.map((row) => row.moveId))];
  const linkedMoves = uniqueMoveIds.map((id) => moveById.get(id)).filter(Boolean);
  const completenessGaps = [];
  const integrityFailures = [];

  if (record.baseExperience.status !== "known") completenessGaps.push("baseExperience");
  if (record.baseFriendship.status !== "known") completenessGaps.push("baseFriendship");
  if (record.eggCycles.status !== "known") completenessGaps.push("eggCycles");

  const unresolvedTypes = record.typeIds.filter((id) => !typeIds.has(id));
  const unresolvedAbilities = record.abilities.filter((entry) => !abilityIds.has(entry.abilityId));
  const unresolvedMoves = rows.filter((row) => !moveById.has(row.moveId));
  const historicalMoveRows = rows.filter((row) => historicalMoveIds.has(row.moveId));
  const speciesSourceRefFailures = countUnresolvedSourceRefs([record]);
  const learnsetSourceRefFailures = countUnresolvedSourceRefs(rows);
  const routeDuplicateExtras = duplicateExtraCount(rows, (row) =>
    [
      row.speciesId,
      row.moveId,
      row.sourceGeneration,
      row.sourceGame,
      row.method,
      row.level,
      row.machineIdentifier,
    ].join("|"),
  );

  if (unresolvedTypes.length) integrityFailures.push("unresolvedTypeRefs");
  if (unresolvedAbilities.length) integrityFailures.push("unresolvedAbilityRefs");
  if (unresolvedMoves.length) integrityFailures.push("unresolvedMoveRefs");
  if (historicalMoveRows.length) integrityFailures.push("historicalMoveLeak");
  if (speciesSourceRefFailures) integrityFailures.push("speciesSourceRecordRefs");
  if (learnsetSourceRefFailures) integrityFailures.push("learnsetSourceRecordRefs");
  if (routeDuplicateExtras) integrityFailures.push("duplicateLearnsetRoutes");
  if (rows.length === 0) integrityFailures.push("missingLearnset");
  if (record.formLabel !== null && !record.baseSpeciesId) {
    integrityFailures.push("formMissingBaseSpeciesId");
  }
  if (record.baseSpeciesId && !speciesById.has(record.baseSpeciesId)) {
    integrityFailures.push("unresolvedBaseSpeciesId");
  }
  if (record.formLabel === null && record.baseSpeciesId !== null) {
    integrityFailures.push("baseSpeciesHasBaseSpeciesId");
  }

  const sourceContexts = [
    ...new Set(rows.map((row) => row.sourceGeneration + "|" + row.sourceGame)),
  ];
  const normalizedSpeciesMoveContextGroups = new Set(
    rows.map((row) => row.moveId + "|" + row.sourceGeneration + "|" + row.sourceGame),
  ).size;

  return {
    speciesId: record.id,
    sourceName: record.sourceName,
    formLabel: record.formLabel,
    nationalDexNumber: record.nationalDexNumber,
    completenessGaps,
    integrityFailures,
    references: {
      unresolvedTypeRefs: unresolvedTypes.length,
      unresolvedAbilityRefs: unresolvedAbilities.length,
      unresolvedMoveRefs: unresolvedMoves.length,
      unresolvedSpeciesSourceRecordRefs: speciesSourceRefFailures,
      unresolvedLearnsetSourceRecordRefs: learnsetSourceRefFailures,
      baseSpeciesResolved: record.baseSpeciesId === null || speciesById.has(record.baseSpeciesId),
    },
    learnset: {
      rawRows: rows.length,
      distinctCurrentMoveIds: uniqueMoveIds.filter((id) => currentMoveIds.has(id)).length,
      normalizedSpeciesMoveContextGroups,
      exactDuplicateRouteExtraRows: routeDuplicateExtras,
      historicalMoveRows: historicalMoveRows.length,
      sourceContexts,
    },
    semanticNulls: {
      power: linkedMoves.filter((move) => move.power === null).length,
      accuracy: linkedMoves.filter((move) => move.accuracy === null).length,
      zaBaseCooldownMs: linkedMoves.filter((move) => move.zaBaseCooldownMs === null).length,
    },
  };
});

const result = {
  summary: {
    speciesRecords: perSpecies.length,
    structurallyCleanSpecies: perSpecies.filter((entry) => entry.integrityFailures.length === 0)
      .length,
    speciesWithIntegrityFailures: perSpecies.filter((entry) => entry.integrityFailures.length > 0)
      .length,
    speciesWithCompletenessGaps: perSpecies.filter((entry) => entry.completenessGaps.length > 0)
      .length,
    speciesWithNoLearnset: perSpecies.filter((entry) => entry.learnset.rawRows === 0).length,
    speciesWithMultipleSourceContexts: perSpecies.filter(
      (entry) => entry.learnset.sourceContexts.length > 1,
    ).length,
    speciesWithDuplicateLearnsetRoutes: perSpecies.filter(
      (entry) => entry.learnset.exactDuplicateRouteExtraRows > 0,
    ).length,
    speciesWithHistoricalMoveLeak: perSpecies.filter(
      (entry) => entry.learnset.historicalMoveRows > 0,
    ).length,
  },
  completenessFindings: perSpecies
    .filter((entry) => entry.completenessGaps.length > 0)
    .map((entry) => ({
      speciesId: entry.speciesId,
      sourceName: entry.sourceName,
      formLabel: entry.formLabel,
      gaps: entry.completenessGaps,
    })),
  integrityFailures: perSpecies.filter((entry) => entry.integrityFailures.length > 0),
  selectedFive: perSpecies.filter((entry) => selectedNames.has(entry.sourceName)),
  perSpecies,
};

fs.writeFileSync(
  ".tmp-game-data-sanity/per-species-integrity-audit.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      summary: result.summary,
      completenessFindings: result.completenessFindings,
      selectedFive: result.selectedFive,
    },
    null,
    2,
  ),
);

if (result.summary.speciesWithIntegrityFailures !== 0) {
  process.exitCode = 2;
}
