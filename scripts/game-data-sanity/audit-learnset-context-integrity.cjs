const fs = require("fs");

const base = process.env.POKENEXUS_GAME_DATA_BASE;
if (!base) {
  throw new Error("POKENEXUS_GAME_DATA_BASE is required; run audits through run-sanity.cjs");
}
const species = JSON.parse(fs.readFileSync(base + "/catalogs/species.json", "utf8"));
const learnsets = JSON.parse(fs.readFileSync(base + "/catalogs/learnsets.json", "utf8"));
const provenance = JSON.parse(fs.readFileSync(base + "/provenance.json", "utf8"));
const roster = JSON.parse(
  fs.readFileSync("packages/game-data/src/canonical-mapping-roster.json", "utf8"),
);

const speciesSourceKeyById = new Map(
  roster.mappings.species
    .filter((mapping) => mapping.status === "accepted")
    .map((mapping) => [mapping.canonicalId, mapping.sourceKey]),
);
const speciesIdBySourceKey = new Map(
  [...speciesSourceKeyById.entries()].map(([id, sourceKey]) => [sourceKey, id]),
);
const moveSourceKeyById = new Map(
  roster.mappings.moves
    .filter((mapping) => mapping.status === "accepted")
    .map((mapping) => [mapping.canonicalId, mapping.sourceKey]),
);

const inventory = provenance.inventories.find((entry) => entry.surface === "learnsets");
if (!inventory) throw new Error("Learnset provenance inventory is missing");

const acceptedKeys = inventory.acceptedMappingKeys;
const acceptedKeySet = new Set(acceptedKeys);

function publishedKey(row) {
  const speciesSourceKey = speciesSourceKeyById.get(row.speciesId);
  const moveSourceKey = moveSourceKeyById.get(row.moveId);
  if (!speciesSourceKey || !moveSourceKey) return null;
  return JSON.stringify([
    speciesSourceKey,
    moveSourceKey,
    row.sourceGeneration,
    row.sourceGame,
    row.method,
    row.level,
    row.machineIdentifier,
  ]);
}

const publishedKeys = [];
const unresolvedPublishedMappings = [];
for (const row of learnsets) {
  const key = publishedKey(row);
  if (!key) {
    unresolvedPublishedMappings.push({
      speciesId: row.speciesId,
      moveId: row.moveId,
    });
  } else {
    publishedKeys.push(key);
  }
}

function duplicateExtras(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count, extraRows: count - 1 }));
}

const publishedKeySet = new Set(publishedKeys);
const publishedNotAccepted = [...publishedKeySet].filter((key) => !acceptedKeySet.has(key));
const acceptedNotPublished = [...acceptedKeySet].filter((key) => !publishedKeySet.has(key));
const publishedDuplicateKeys = duplicateExtras(publishedKeys);
const acceptedDuplicateKeys = duplicateExtras(acceptedKeys);

const acceptedContextsBySpeciesId = new Map();
for (const key of acceptedKeys) {
  const [speciesSourceKey, , sourceGeneration, sourceGame] = JSON.parse(key);
  const speciesId = speciesIdBySourceKey.get(speciesSourceKey);
  if (!speciesId) continue;
  const contexts = acceptedContextsBySpeciesId.get(speciesId) || new Set();
  contexts.add(sourceGeneration + "|" + sourceGame);
  acceptedContextsBySpeciesId.set(speciesId, contexts);
}

const publishedContextsBySpeciesId = new Map();
for (const row of learnsets) {
  const contexts = publishedContextsBySpeciesId.get(row.speciesId) || new Set();
  contexts.add(row.sourceGeneration + "|" + row.sourceGame);
  publishedContextsBySpeciesId.set(row.speciesId, contexts);
}

const contextMismatches = [];
for (const record of species) {
  const accepted = [...(acceptedContextsBySpeciesId.get(record.id) || new Set())].sort();
  const published = [...(publishedContextsBySpeciesId.get(record.id) || new Set())].sort();
  if (JSON.stringify(accepted) !== JSON.stringify(published)) {
    contextMismatches.push({
      speciesId: record.id,
      sourceName: record.sourceName,
      accepted,
      published,
    });
  }
}

const machineMovesByContext = new Map();
const machineContextsByIdentifier = new Map();
for (const row of learnsets.filter((entry) => entry.method === "machine")) {
  const contextMachineKey = [row.sourceGeneration, row.sourceGame, row.machineIdentifier].join("|");
  const moveIds = machineMovesByContext.get(contextMachineKey) || new Set();
  moveIds.add(row.moveId);
  machineMovesByContext.set(contextMachineKey, moveIds);

  const contexts = machineContextsByIdentifier.get(row.machineIdentifier) || new Map();
  const contextKey = row.sourceGeneration + "|" + row.sourceGame;
  const contextMoves = contexts.get(contextKey) || new Set();
  contextMoves.add(row.moveId);
  contexts.set(contextKey, contextMoves);
  machineContextsByIdentifier.set(row.machineIdentifier, contexts);
}

const conflictingMachineContextKeys = [...machineMovesByContext.entries()]
  .filter(([, moveIds]) => moveIds.size > 1)
  .map(([key, moveIds]) => ({ key, moveIds: [...moveIds] }));
const reusedMachineIdentifiers = [...machineContextsByIdentifier.entries()].filter(
  ([, contexts]) => contexts.size > 1,
);
const reusedMachineIdentifiersWithDifferentMove = reusedMachineIdentifiers.filter(
  ([, contexts]) => {
    const moveIds = new Set();
    for (const ids of contexts.values()) for (const id of ids) moveIds.add(id);
    return moveIds.size > 1;
  },
);

const selectedNames = new Set(["Charizard", "Tyranitar", "Dragonite", "Snorlax", "Donphan"]);

const result = {
  inventory: {
    discovered: inventory.discoveredSourceKeys.length,
    extracted: inventory.extractedSourceKeys.length,
    normalized: inventory.normalizedSourceKeys.length,
    accepted: inventory.acceptedMappingKeys.length,
    candidate: inventory.candidateSourceKeys.length,
    excludedOrDeferred: inventory.excludedOrDeferred.length,
  },
  publishedParity: {
    rows: learnsets.length,
    reconstructedKeys: publishedKeys.length,
    unresolvedPublishedMappings: unresolvedPublishedMappings.length,
    uniquePublishedKeys: publishedKeySet.size,
    duplicatePublishedSemanticKeys: publishedDuplicateKeys.length,
    duplicatePublishedExtraRows: publishedDuplicateKeys.reduce(
      (sum, entry) => sum + entry.extraRows,
      0,
    ),
    duplicateAcceptedKeys: acceptedDuplicateKeys.length,
    publishedNotAccepted: publishedNotAccepted.length,
    acceptedNotPublished: acceptedNotPublished.length,
  },
  speciesContexts: {
    speciesRecords: species.length,
    acceptedExactlyOneContext: species.filter(
      (record) => acceptedContextsBySpeciesId.get(record.id)?.size === 1,
    ).length,
    publishedExactlyOneContext: species.filter(
      (record) => publishedContextsBySpeciesId.get(record.id)?.size === 1,
    ).length,
    acceptedZeroOrMultipleContexts: species.filter(
      (record) => acceptedContextsBySpeciesId.get(record.id)?.size !== 1,
    ).length,
    publishedZeroOrMultipleContexts: species.filter(
      (record) => publishedContextsBySpeciesId.get(record.id)?.size !== 1,
    ).length,
    acceptedPublishedContextMismatches: contextMismatches.length,
    mismatches: contextMismatches,
  },
  machineIdentity: {
    contextKeys: machineMovesByContext.size,
    conflictingContextKeys: conflictingMachineContextKeys.length,
    conflicts: conflictingMachineContextKeys,
    lexicalIdentifiers: machineContextsByIdentifier.size,
    reusedAcrossContexts: reusedMachineIdentifiers.length,
    reusedAcrossContextsWithDifferentMove: reusedMachineIdentifiersWithDifferentMove.length,
  },
  selectedFive: species
    .filter((record) => selectedNames.has(record.sourceName))
    .map((record) => ({
      sourceName: record.sourceName,
      acceptedContexts: [...(acceptedContextsBySpeciesId.get(record.id) || new Set())],
      publishedContexts: [...(publishedContextsBySpeciesId.get(record.id) || new Set())],
      rows: learnsets.filter((row) => row.speciesId === record.id).length,
    })),
  evidence: {
    publishedNotAccepted: publishedNotAccepted.slice(0, 20),
    acceptedNotPublished: acceptedNotPublished.slice(0, 20),
    unresolvedPublishedMappings: unresolvedPublishedMappings.slice(0, 20),
  },
};

fs.writeFileSync(
  ".tmp-game-data-sanity/learnset-context-integrity-audit.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));

if (
  result.inventory.accepted !== result.publishedParity.rows ||
  result.inventory.candidate !== 0 ||
  result.inventory.excludedOrDeferred !== 0 ||
  result.publishedParity.unresolvedPublishedMappings !== 0 ||
  result.publishedParity.duplicatePublishedSemanticKeys !== 0 ||
  result.publishedParity.duplicateAcceptedKeys !== 0 ||
  result.publishedParity.publishedNotAccepted !== 0 ||
  result.publishedParity.acceptedNotPublished !== 0 ||
  result.speciesContexts.acceptedZeroOrMultipleContexts !== 0 ||
  result.speciesContexts.publishedZeroOrMultipleContexts !== 0 ||
  result.speciesContexts.acceptedPublishedContextMismatches !== 0 ||
  result.machineIdentity.conflictingContextKeys !== 0
) {
  process.exitCode = 2;
}
