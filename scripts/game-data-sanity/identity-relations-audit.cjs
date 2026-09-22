const fs = require("fs");

const base = process.env.POKENEXUS_GAME_DATA_BASE;
if (!base) {
  throw new Error("POKENEXUS_GAME_DATA_BASE is required; run audits through run-sanity.cjs");
}
const species = JSON.parse(fs.readFileSync(`${base}/catalogs/species.json`, "utf8"));

const baseSpecies = species.filter((record) => record.formLabel === null);
const forms = species.filter((record) => record.formLabel !== null);
const baseIds = new Set(baseSpecies.map((record) => record.id));
const byDex = new Map();

for (const record of species) {
  const rows = byDex.get(record.nationalDexNumber) ?? [];
  rows.push(record);
  byDex.set(record.nationalDexNumber, rows);
}

const abilityIdDuplicates = [];
const abilitySlotDuplicates = [];
const typeDuplicates = [];
for (const record of species) {
  const abilityIds = record.abilities.map((entry) => entry.abilityId);
  const abilitySlots = record.abilities.map((entry) => entry.sourceAbilitySlot);
  if (new Set(abilityIds).size !== abilityIds.length) {
    abilityIdDuplicates.push(record.id);
  }
  if (new Set(abilitySlots).size !== abilitySlots.length) {
    abilitySlotDuplicates.push(record.id);
  }
  if (new Set(record.typeIds).size !== record.typeIds.length) {
    typeDuplicates.push(record.id);
  }
}

const result = {
  speciesRecords: species.length,
  distinctNationalDexEntries: byDex.size,
  baseSpeciesRecords: baseSpecies.length,
  formRecords: forms.length,
  nationalDexEntriesWithMultipleSpeciesRecords: [...byDex.values()].filter(
    (records) => records.length > 1,
  ).length,
  formsMissingBaseSpeciesId: forms.filter((record) => !record.baseSpeciesId).length,
  formsWithUnresolvedBaseSpeciesId: forms.filter(
    (record) => record.baseSpeciesId && !baseIds.has(record.baseSpeciesId),
  ).length,
  speciesWithDuplicateAbilityId: abilityIdDuplicates.length,
  speciesWithDuplicateAbilitySlot: abilitySlotDuplicates.length,
  speciesWithDuplicateTypeId: typeDuplicates.length,
  multiRecordDexExamples: [...byDex.entries()]
    .filter(([, records]) => records.length > 1)
    .map(([nationalDexNumber, records]) => ({
      nationalDexNumber,
      records: records.map((record) => ({
        speciesId: record.id,
        sourceName: record.sourceName,
        formLabel: record.formLabel,
        baseSpeciesId: record.baseSpeciesId,
      })),
    })),
};

const out = ".tmp-game-data-sanity/identity-relations-audit.json";
fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));

if (
  result.distinctNationalDexEntries !== 251 ||
  result.baseSpeciesRecords !== 251 ||
  result.formRecords !== 42 ||
  result.formsMissingBaseSpeciesId !== 0 ||
  result.formsWithUnresolvedBaseSpeciesId !== 0 ||
  result.speciesWithDuplicateAbilityId !== 0 ||
  result.speciesWithDuplicateAbilitySlot !== 0 ||
  result.speciesWithDuplicateTypeId !== 0
) {
  process.exitCode = 2;
}
