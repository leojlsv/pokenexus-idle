const fs = require("fs");

const base = process.env.POKENEXUS_GAME_DATA_BASE;
if (!base) {
  throw new Error("POKENEXUS_GAME_DATA_BASE is required; run audits through run-sanity.cjs");
}
const species = JSON.parse(fs.readFileSync(base + "/catalogs/species.json", "utf8"));
const learnsets = JSON.parse(fs.readFileSync(base + "/catalogs/learnsets.json", "utf8"));

const speciesById = new Map(species.map((record) => [record.id, record]));
const learnsetsBySpecies = new Map();
for (const row of learnsets) {
  const rows = learnsetsBySpecies.get(row.speciesId) || [];
  rows.push(row);
  learnsetsBySpecies.set(row.speciesId, rows);
}

function routeKey(row) {
  return [
    row.moveId,
    row.sourceGeneration,
    row.sourceGame,
    row.method,
    row.level,
    row.machineIdentifier,
  ].join("|");
}

function abilitySignature(record) {
  return record.abilities
    .map((entry) => entry.abilityId + "|" + entry.sourceAbilitySlot)
    .sort()
    .join(";");
}

const forms = species.filter((record) => record.formLabel !== null);
const comparisons = forms.map((form) => {
  const baseRecord = speciesById.get(form.baseSpeciesId);
  const formRows = learnsetsBySpecies.get(form.id) || [];
  const baseRows = baseRecord ? learnsetsBySpecies.get(baseRecord.id) || [] : [];
  const formRoutes = new Set(formRows.map(routeKey));
  const baseRoutes = new Set(baseRows.map(routeKey));
  const formContexts = [
    ...new Set(formRows.map((row) => row.sourceGeneration + "|" + row.sourceGame)),
  ].sort();
  const baseContexts = [
    ...new Set(baseRows.map((row) => row.sourceGeneration + "|" + row.sourceGame)),
  ].sort();
  const identicalLearnset =
    formRoutes.size === baseRoutes.size && [...formRoutes].every((key) => baseRoutes.has(key));

  return {
    formSpeciesId: form.id,
    formName: form.sourceName,
    formLabel: form.formLabel,
    baseSpeciesId: form.baseSpeciesId,
    baseName: baseRecord?.sourceName ?? null,
    baseResolved: Boolean(baseRecord),
    baseIsCanonicalBase:
      Boolean(baseRecord) && baseRecord.formLabel === null && baseRecord.baseSpeciesId === null,
    nationalDexMatchesBase:
      Boolean(baseRecord) && form.nationalDexNumber === baseRecord.nationalDexNumber,
    introducedNotBeforeBase:
      Boolean(baseRecord) && form.introducedGeneration >= baseRecord.introducedGeneration,
    learnsetRows: formRows.length,
    baseLearnsetRows: baseRows.length,
    sourceContexts: formContexts,
    baseSourceContexts: baseContexts,
    sourceContextDiffersFromBase: JSON.stringify(formContexts) !== JSON.stringify(baseContexts),
    identicalLearnsetToBase: identicalLearnset,
    sameTypesAsBase:
      Boolean(baseRecord) && JSON.stringify(form.typeIds) === JSON.stringify(baseRecord.typeIds),
    sameAbilitiesAsBase:
      Boolean(baseRecord) && abilitySignature(form) === abilitySignature(baseRecord),
    sameBaseStatsAsBase:
      Boolean(baseRecord) &&
      JSON.stringify(form.baseStats) === JSON.stringify(baseRecord.baseStats),
  };
});

const result = {
  summary: {
    forms: comparisons.length,
    unresolvedBase: comparisons.filter((entry) => !entry.baseResolved).length,
    baseNotCanonicalBase: comparisons.filter((entry) => !entry.baseIsCanonicalBase).length,
    nationalDexMismatch: comparisons.filter((entry) => !entry.nationalDexMatchesBase).length,
    introducedBeforeBase: comparisons.filter((entry) => !entry.introducedNotBeforeBase).length,
    zeroLearnsetRows: comparisons.filter((entry) => entry.learnsetRows === 0).length,
    zeroOrMultipleSourceContexts: comparisons.filter((entry) => entry.sourceContexts.length !== 1)
      .length,
    identicalLearnsetToBase: comparisons.filter((entry) => entry.identicalLearnsetToBase).length,
    sourceContextDiffersFromBase: comparisons.filter((entry) => entry.sourceContextDiffersFromBase)
      .length,
    sameTypesAbilitiesAndStatsAsBase: comparisons.filter(
      (entry) => entry.sameTypesAsBase && entry.sameAbilitiesAsBase && entry.sameBaseStatsAsBase,
    ).length,
    minimumLearnsetRows: Math.min(...comparisons.map((entry) => entry.learnsetRows)),
  },
  differentContextFromBase: comparisons
    .filter((entry) => entry.sourceContextDiffersFromBase)
    .map((entry) => ({
      formName: entry.formName,
      baseName: entry.baseName,
      sourceContexts: entry.sourceContexts,
      baseSourceContexts: entry.baseSourceContexts,
    })),
  smallestLearnsets: comparisons
    .slice()
    .sort((a, b) => a.learnsetRows - b.learnsetRows || a.formName.localeCompare(b.formName))
    .slice(0, 10)
    .map((entry) => ({
      formName: entry.formName,
      baseName: entry.baseName,
      learnsetRows: entry.learnsetRows,
      baseLearnsetRows: entry.baseLearnsetRows,
      sourceContexts: entry.sourceContexts,
    })),
  comparisons,
};

fs.writeFileSync(
  ".tmp-game-data-sanity/forms-integrity-audit.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      summary: result.summary,
      differentContextFromBase: result.differentContextFromBase,
      smallestLearnsets: result.smallestLearnsets,
    },
    null,
    2,
  ),
);

if (
  result.summary.unresolvedBase !== 0 ||
  result.summary.baseNotCanonicalBase !== 0 ||
  result.summary.nationalDexMismatch !== 0 ||
  result.summary.introducedBeforeBase !== 0 ||
  result.summary.zeroLearnsetRows !== 0 ||
  result.summary.zeroOrMultipleSourceContexts !== 0
) {
  process.exitCode = 2;
}
