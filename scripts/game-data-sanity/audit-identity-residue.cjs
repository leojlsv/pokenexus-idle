const fs = require("fs");

const base = process.env.POKENEXUS_GAME_DATA_BASE;
if (!base) {
  throw new Error("POKENEXUS_GAME_DATA_BASE is required; run audits through run-sanity.cjs");
}
const species = JSON.parse(fs.readFileSync(`${base}/catalogs/species.json`, "utf8"));
const moves = JSON.parse(fs.readFileSync(`${base}/catalogs/moves.json`, "utf8"));
const abilities = JSON.parse(fs.readFileSync(`${base}/catalogs/abilities.json`, "utf8"));
const types = JSON.parse(fs.readFileSync(`${base}/catalogs/types.json`, "utf8"));
const items = JSON.parse(fs.readFileSync(`${base}/catalogs/items.json`, "utf8"));
const learnsets = JSON.parse(fs.readFileSync(`${base}/catalogs/learnsets.json`, "utf8"));
const provenance = JSON.parse(fs.readFileSync(`${base}/provenance.json`, "utf8"));
const roster = JSON.parse(
  fs.readFileSync("packages/game-data/src/canonical-mapping-roster.json", "utf8"),
);

function duplicateGroups(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return [...groups.entries()].filter(([, values]) => values.length > 1);
}

const speciesById = new Map(species.map((record) => [record.id, record]));
const typeIds = new Set(types.map((record) => record.id));
const abilityIds = new Set(abilities.map((record) => record.id));
const speciesFactSignature = (record) =>
  JSON.stringify({
    nationalDexNumber: record.nationalDexNumber,
    baseStats: record.baseStats,
    typeIds: record.typeIds,
    abilities: record.abilities,
    catchRate: record.catchRate,
    baseExperience: record.baseExperience,
    growthRate: record.growthRate,
    baseFriendship: record.baseFriendship,
    heightMillimeters: record.heightMillimeters,
    weightGrams: record.weightGrams,
    genderRatio: record.genderRatio,
    eggGroups: record.eggGroups,
    eggCycles: record.eggCycles,
    evYield: record.evYield,
  });

const forms = species.filter((record) => record.formLabel !== null);
const currentMoveIds = new Set(moves.map((record) => record.id));
const acceptedMoveMappings = roster.mappings.moves.filter(
  (mapping) => mapping.status === "accepted",
);
const currentMoveMappings = acceptedMoveMappings.filter((mapping) =>
  currentMoveIds.has(mapping.canonicalId),
);
const historicalMoveMappings = acceptedMoveMappings.filter(
  (mapping) => !currentMoveIds.has(mapping.canonicalId),
);
const historicalMoveIds = new Set(historicalMoveMappings.map((mapping) => mapping.canonicalId));

const acceptedMoveSourceTargets = new Set([
  "any-adjacent",
  "any-other",
  "self-or-adjacent-ally",
  "adjacent-ally",
  "adjacent-foe",
  "all-adjacent",
  "all-adjacent-foes",
  "self-and-allies",
  "all-allies",
  "self",
  "all-pokemon",
  "random-opponent",
  "entire-field",
  "opponents-side",
  "users-side",
  "varies",
]);

const statKeys = ["hp", "atk", "def", "spa", "spd", "spe"];
const speciesDomainViolations = [];
for (const record of species) {
  const violations = [];
  if (
    !Number.isInteger(record.nationalDexNumber) ||
    record.nationalDexNumber < 1 ||
    record.nationalDexNumber > 251
  ) {
    violations.push("nationalDexNumber");
  }
  if (
    !Number.isInteger(record.introducedGeneration) ||
    record.introducedGeneration < 1 ||
    record.introducedGeneration > 9
  ) {
    violations.push("introducedGeneration");
  }
  if (
    !Array.isArray(record.typeIds) ||
    record.typeIds.length < 1 ||
    record.typeIds.length > 2 ||
    new Set(record.typeIds).size !== record.typeIds.length ||
    record.typeIds.some((id) => !typeIds.has(id))
  ) {
    violations.push("typeIds");
  }
  if (
    !Array.isArray(record.abilities) ||
    record.abilities.length === 0 ||
    new Set(record.abilities.map((entry) => entry.abilityId)).size !== record.abilities.length ||
    new Set(record.abilities.map((entry) => entry.sourceAbilitySlot)).size !==
      record.abilities.length ||
    record.abilities.some((entry) => !abilityIds.has(entry.abilityId))
  ) {
    violations.push("abilities");
  }
  if (
    !record.baseStats ||
    statKeys.some(
      (key) =>
        !Number.isInteger(record.baseStats[key]) ||
        record.baseStats[key] < 1 ||
        record.baseStats[key] > 255,
    )
  ) {
    violations.push("baseStats");
  }
  if (!Number.isInteger(record.catchRate) || record.catchRate < 1 || record.catchRate > 255) {
    violations.push("catchRate");
  }
  if (!Number.isInteger(record.heightMillimeters) || record.heightMillimeters <= 0) {
    violations.push("heightMillimeters");
  }
  if (!Number.isInteger(record.weightGrams) || record.weightGrams <= 0) {
    violations.push("weightGrams");
  }
  if (!Array.isArray(record.eggGroups) || record.eggGroups.length === 0) {
    violations.push("eggGroups");
  }
  if (record.genderRatio?.kind === "ratio") {
    const { femaleBasisPoints, maleBasisPoints } = record.genderRatio;
    if (
      !Number.isInteger(femaleBasisPoints) ||
      !Number.isInteger(maleBasisPoints) ||
      femaleBasisPoints < 0 ||
      maleBasisPoints < 0 ||
      femaleBasisPoints + maleBasisPoints !== 10000
    ) {
      violations.push("genderRatio");
    }
  } else if (record.genderRatio?.kind !== "genderless") {
    violations.push("genderRatio");
  }
  if (
    !record.evYield ||
    statKeys.some((key) => !Number.isInteger(record.evYield[key]) || record.evYield[key] < 0)
  ) {
    violations.push("evYield");
  }
  if (violations.length > 0) {
    speciesDomainViolations.push({
      speciesId: record.id,
      sourceName: record.sourceName,
      formLabel: record.formLabel,
      violations,
    });
  }
}

const moveDomainViolations = [];
for (const record of moves) {
  const violations = [];
  if (!typeIds.has(record.typeId)) violations.push("typeId");
  if (!["physical", "special", "status"].includes(record.category)) {
    violations.push("category");
  }
  if (!Number.isInteger(record.basePp) || record.basePp <= 0) violations.push("basePp");
  if (record.power !== null && (!Number.isInteger(record.power) || record.power <= 0)) {
    violations.push("power");
  }
  if (
    record.accuracy !== null &&
    (!Number.isInteger(record.accuracy) || record.accuracy < 1 || record.accuracy > 100)
  ) {
    violations.push("accuracy");
  }
  if (typeof record.makesContact !== "boolean") violations.push("makesContact");
  if (!acceptedMoveSourceTargets.has(record.sourceTarget)) violations.push("sourceTarget");
  if (
    record.zaBaseCooldownMs !== null &&
    (!Number.isInteger(record.zaBaseCooldownMs) || record.zaBaseCooldownMs <= 0)
  ) {
    violations.push("zaBaseCooldownMs");
  }
  if (violations.length > 0) {
    moveDomainViolations.push({ moveId: record.id, violations });
  }
}

const exactLearnsetRouteDuplicates = duplicateGroups(learnsets, (row) =>
  JSON.stringify([
    row.speciesId,
    row.moveId,
    row.sourceGeneration,
    row.sourceGame,
    row.method,
    row.level,
    row.machineIdentifier,
  ]),
);

const provenanceIds = new Set(provenance.sourceRecords.map((record) => record.id));
const directlyReferencedSourceIds = new Set();
const sourceRefSurfaces = [
  ["species", species],
  ["moves", moves],
  ["abilities", abilities],
  ["types", types],
  ["items", items],
  ["learnsets", learnsets],
];
const sourceRefAudit = {};
for (const [surface, rows] of sourceRefSurfaces) {
  let empty = 0;
  let duplicatedWithinRecord = 0;
  let unresolved = 0;
  for (const row of rows) {
    const ids = row.sourceRecordIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      empty += 1;
      continue;
    }
    if (new Set(ids).size !== ids.length) duplicatedWithinRecord += 1;
    for (const id of ids) {
      directlyReferencedSourceIds.add(id);
      if (!provenanceIds.has(id)) unresolved += 1;
    }
  }
  sourceRefAudit[surface] = {
    records: rows.length,
    emptySourceRecordIds: empty,
    duplicateIdsWithinRecord: duplicatedWithinRecord,
    unresolvedSourceRecordIds: unresolved,
  };
}

for (const factSource of provenance.moveFactSources) {
  for (const id of [
    factSource.mainline?.sourceRecordId,
    factSource.makesContactSourceRecordId,
    factSource.sourceTargetSourceRecordId,
    factSource.zaBaseCooldownSourceRecordId,
  ]) {
    if (id) directlyReferencedSourceIds.add(id);
  }
}

const unreferencedProvenance = provenance.sourceRecords.filter(
  (record) => !directlyReferencedSourceIds.has(record.id),
);
const unreferencedGen8Learnsets = unreferencedProvenance.filter((record) => {
  if (record.provider !== "bulbapedia" || record.parserVersion !== "bulbapedia-gen8-learnset-v6") {
    return false;
  }
  try {
    const url = new URL(record.canonicalUrl);
    return (
      url.protocol === "https:" &&
      url.hostname === "bulbapedia.bulbagarden.net" &&
      /\/Generation_VIII_learnset$/.test(decodeURIComponent(url.pathname)) &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
});
const unreferencedDiscoverySources = unreferencedProvenance.filter(
  (record) =>
    record.provider === "bulbapedia" &&
    record.parserVersion === "bulbapedia-kanto-johto-species-discovery-v1" &&
    record.canonicalUrl ===
      "https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_by_National_Pok%C3%A9dex_number",
);

const speciesInventory = provenance.inventories.find(
  (inventory) => inventory.surface === "species",
);
if (!speciesInventory) {
  throw new Error("Species provenance inventory is missing");
}
const acceptedSpeciesSourceKeys = new Set(speciesInventory.acceptedMappingKeys);
const excludedOrDeferredSpeciesAccepted = speciesInventory.excludedOrDeferred.filter((entry) =>
  acceptedSpeciesSourceKeys.has(entry.sourceKey),
);
const excludedOrDeferredReasonCounts = {};
for (const entry of speciesInventory.excludedOrDeferred) {
  const key = entry.disposition + "|" + entry.reason;
  excludedOrDeferredReasonCounts[key] = (excludedOrDeferredReasonCounts[key] ?? 0) + 1;
}

const result = {
  speciesIdentity: {
    records: species.length,
    duplicateIds: duplicateGroups(species, (record) => record.id).length,
    duplicateSourceNames: duplicateGroups(species, (record) => record.sourceName).length,
    duplicateNationalDexFormKeys: duplicateGroups(
      species,
      (record) => `${record.nationalDexNumber}|${record.formLabel ?? "BASE"}`,
    ).length,
    sourceSlugAcrossDifferentNationalDex: [
      ...new Set(species.map((record) => record.sourceSlug)),
    ].filter((slug) => {
      const dex = new Set(
        species
          .filter((record) => record.sourceSlug === slug)
          .map((record) => record.nationalDexNumber),
      );
      return dex.size > 1;
    }).length,
    identicalFactSignatureGroups: duplicateGroups(species, speciesFactSignature).length,
    forms: forms.length,
    formsFactuallyIdenticalToBase: forms.filter((form) => {
      const baseRecord = speciesById.get(form.baseSpeciesId);
      return baseRecord && speciesFactSignature(form) === speciesFactSignature(baseRecord);
    }).length,
  },
  moveIdentity: {
    currentMoveDefinitions: moves.length,
    acceptedMappings: acceptedMoveMappings.length,
    currentAcceptedMappings: currentMoveMappings.length,
    historicalAcceptedMappings: historicalMoveMappings.length,
    historicalSourceKeys: historicalMoveMappings.map((mapping) => mapping.sourceKey),
    duplicateCurrentSourceKeys: duplicateGroups(currentMoveMappings, (mapping) => mapping.sourceKey)
      .length,
    duplicateCurrentCanonicalIds: duplicateGroups(
      currentMoveMappings,
      (mapping) => mapping.canonicalId,
    ).length,
    currentMoveIdsMissingAcceptedMapping: moves.filter(
      (move) => !currentMoveMappings.some((mapping) => mapping.canonicalId === move.id),
    ).length,
    historicalMoveIdsPresentInCurrentLearnsets: learnsets.filter((row) =>
      historicalMoveIds.has(row.moveId),
    ).length,
  },
  otherIdentities: {
    abilityDuplicateIds: duplicateGroups(abilities, (record) => record.id).length,
    abilityDuplicateSourceNames: duplicateGroups(abilities, (record) => record.sourceName).length,
    abilityDuplicateSourceSlugs: duplicateGroups(abilities, (record) => record.sourceSlug).length,
    typeDuplicateIds: duplicateGroups(types, (record) => record.id).length,
    typeDuplicateSourceNames: duplicateGroups(types, (record) => record.sourceName).length,
    typeDuplicateSourceSlugs: duplicateGroups(types, (record) => record.sourceSlug).length,
  },
  learnsetIdentity: {
    rows: learnsets.length,
    exactSemanticDuplicateRouteKeys: exactLearnsetRouteDuplicates.length,
    extraDuplicateRows: exactLearnsetRouteDuplicates.reduce(
      (sum, [, values]) => sum + values.length - 1,
      0,
    ),
  },
  completeness: {
    baseExperienceKnown: species.filter((record) => record.baseExperience.status === "known")
      .length,
    baseFriendshipKnown: species.filter((record) => record.baseFriendship.status === "known")
      .length,
    baseFriendshipSourceUnavailable: species
      .filter((record) => record.baseFriendship.status !== "known")
      .map((record) => ({
        speciesId: record.id,
        sourceName: record.sourceName,
        formLabel: record.formLabel,
        value: record.baseFriendship,
      })),
    eggCyclesKnown: species.filter((record) => record.eggCycles.status === "known").length,
  },
  domainIntegrity: {
    species: {
      records: species.length,
      violationRecords: speciesDomainViolations.length,
      violations: speciesDomainViolations,
    },
    moves: {
      records: moves.length,
      violationRecords: moveDomainViolations.length,
      violations: moveDomainViolations,
    },
  },
  speciesInventoryIntegrity: {
    discoveredSourceKeys: speciesInventory.discoveredSourceKeys.length,
    acceptedMappingKeys: speciesInventory.acceptedMappingKeys.length,
    excludedOrDeferred: speciesInventory.excludedOrDeferred.length,
    excludedOrDeferredReasonCounts,
    excludedOrDeferredAcceptedMappingOverlap: excludedOrDeferredSpeciesAccepted.length,
    overlappingEntries: excludedOrDeferredSpeciesAccepted,
  },
  provenance: {
    sourceRecords: provenance.sourceRecords.length,
    duplicateSourceRecordIds:
      provenance.sourceRecords.length -
      new Set(provenance.sourceRecords.map((record) => record.id)).size,
    duplicateEquivalentSourceRecords: duplicateGroups(provenance.sourceRecords, (record) =>
      [record.provider, record.canonicalUrl, record.sourceContentHash, record.parserVersion].join(
        "|",
      ),
    ).length,
    sourceRefAudit,
    unreferencedSourceRecords: unreferencedProvenance.length,
    unreferencedGen8LearnsetCacheRecords: unreferencedGen8Learnsets.length,
    unreferencedSpeciesDiscoveryRecords: unreferencedDiscoverySources.length,
    otherUnreferencedSourceRecords:
      unreferencedProvenance.length -
      unreferencedGen8Learnsets.length -
      unreferencedDiscoverySources.length,
  },
};

const out = ".tmp-game-data-sanity/identity-residue-audit.json";
fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));

const sourceRefFailures = Object.values(result.provenance.sourceRefAudit).some(
  (surface) =>
    surface.emptySourceRecordIds !== 0 ||
    surface.duplicateIdsWithinRecord !== 0 ||
    surface.unresolvedSourceRecordIds !== 0,
);

if (
  result.speciesIdentity.duplicateIds !== 0 ||
  result.speciesIdentity.duplicateSourceNames !== 0 ||
  result.speciesIdentity.duplicateNationalDexFormKeys !== 0 ||
  result.speciesIdentity.sourceSlugAcrossDifferentNationalDex !== 0 ||
  result.speciesIdentity.identicalFactSignatureGroups !== 0 ||
  result.speciesIdentity.formsFactuallyIdenticalToBase !== 0 ||
  result.moveIdentity.currentAcceptedMappings !== result.moveIdentity.currentMoveDefinitions ||
  result.moveIdentity.duplicateCurrentSourceKeys !== 0 ||
  result.moveIdentity.duplicateCurrentCanonicalIds !== 0 ||
  result.moveIdentity.currentMoveIdsMissingAcceptedMapping !== 0 ||
  result.moveIdentity.historicalMoveIdsPresentInCurrentLearnsets !== 0 ||
  result.otherIdentities.abilityDuplicateIds !== 0 ||
  result.otherIdentities.abilityDuplicateSourceNames !== 0 ||
  result.otherIdentities.abilityDuplicateSourceSlugs !== 0 ||
  result.otherIdentities.typeDuplicateIds !== 0 ||
  result.otherIdentities.typeDuplicateSourceNames !== 0 ||
  result.otherIdentities.typeDuplicateSourceSlugs !== 0 ||
  result.learnsetIdentity.exactSemanticDuplicateRouteKeys !== 0 ||
  result.domainIntegrity.species.violationRecords !== 0 ||
  result.domainIntegrity.moves.violationRecords !== 0 ||
  result.speciesInventoryIntegrity.excludedOrDeferredAcceptedMappingOverlap !== 0 ||
  result.provenance.duplicateSourceRecordIds !== 0 ||
  result.provenance.duplicateEquivalentSourceRecords !== 0 ||
  result.provenance.otherUnreferencedSourceRecords !== 0 ||
  sourceRefFailures
) {
  process.exitCode = 2;
}
