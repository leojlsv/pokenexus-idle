const fs = require("fs");

const base = process.env.POKENEXUS_GAME_DATA_BASE;
if (!base) {
  throw new Error("POKENEXUS_GAME_DATA_BASE is required; run audits through run-sanity.cjs");
}
const species = JSON.parse(fs.readFileSync(`${base}/catalogs/species.json`, "utf8"));
const moves = JSON.parse(fs.readFileSync(`${base}/catalogs/moves.json`, "utf8"));
const learnsets = JSON.parse(fs.readFileSync(`${base}/catalogs/learnsets.json`, "utf8"));

const speciesIds = new Set(species.map((record) => record.id));
const moveIds = new Set(moves.map((record) => record.id));
const rowsBySpecies = new Map(species.map((record) => [record.id, 0]));
const rowsByMove = new Map(moves.map((record) => [record.id, 0]));
const sourceContextsBySpecies = new Map();
const machineByContext = new Map();
const machineByIdentifier = new Map();
const methodCounts = {};
let unresolvedSpeciesRefs = 0;
let unresolvedMoveRefs = 0;
let invalidLevelQualifierRows = 0;
let invalidMachineQualifierRows = 0;

for (const row of learnsets) {
  methodCounts[row.method] = (methodCounts[row.method] ?? 0) + 1;
  if (!speciesIds.has(row.speciesId)) unresolvedSpeciesRefs += 1;
  else rowsBySpecies.set(row.speciesId, (rowsBySpecies.get(row.speciesId) ?? 0) + 1);
  if (!moveIds.has(row.moveId)) unresolvedMoveRefs += 1;
  else rowsByMove.set(row.moveId, (rowsByMove.get(row.moveId) ?? 0) + 1);

  const contexts = sourceContextsBySpecies.get(row.speciesId) ?? new Set();
  contexts.add(`${row.sourceGeneration}\u0000${row.sourceGame}`);
  sourceContextsBySpecies.set(row.speciesId, contexts);

  if (row.method === "level-up") {
    if (!Number.isInteger(row.level) || row.level < 1 || row.level > 100) {
      invalidLevelQualifierRows += 1;
    }
    if (row.machineIdentifier !== null) invalidMachineQualifierRows += 1;
  } else {
    if (row.level !== null) invalidLevelQualifierRows += 1;
    if (row.method === "machine") {
      if (typeof row.machineIdentifier !== "string" || !row.machineIdentifier) {
        invalidMachineQualifierRows += 1;
      }
    } else if (row.machineIdentifier !== null) {
      invalidMachineQualifierRows += 1;
    }
  }

  if (row.method === "machine") {
    const contextKey = [row.sourceGeneration, row.sourceGame, row.machineIdentifier].join("\u0000");
    const contextMoves = machineByContext.get(contextKey) ?? new Set();
    contextMoves.add(row.moveId);
    machineByContext.set(contextKey, contextMoves);

    const contextsForIdentifier = machineByIdentifier.get(row.machineIdentifier) ?? new Map();
    const gameKey = `${row.sourceGeneration}\u0000${row.sourceGame}`;
    const movesForGame = contextsForIdentifier.get(gameKey) ?? new Set();
    movesForGame.add(row.moveId);
    contextsForIdentifier.set(gameKey, movesForGame);
    machineByIdentifier.set(row.machineIdentifier, contextsForIdentifier);
  }
}

const reusedAcrossContexts = [...machineByIdentifier.entries()].filter(
  ([, contexts]) => contexts.size > 1,
);
const reusedWithDifferentMove = reusedAcrossContexts.filter(([, contexts]) => {
  const ids = new Set();
  for (const movesInContext of contexts.values()) {
    for (const moveId of movesInContext) ids.add(moveId);
  }
  return ids.size > 1;
});

const sourceContextCounts = {};
for (const row of learnsets) {
  const key = `${row.sourceGeneration} | ${row.sourceGame}`;
  const entry = sourceContextCounts[key] ?? {
    rows: 0,
    speciesIds: new Set(),
    moveIds: new Set(),
    machineIdentifiers: new Set(),
    methods: {},
  };
  entry.rows += 1;
  entry.speciesIds.add(row.speciesId);
  entry.moveIds.add(row.moveId);
  if (row.machineIdentifier) entry.machineIdentifiers.add(row.machineIdentifier);
  entry.methods[row.method] = (entry.methods[row.method] ?? 0) + 1;
  sourceContextCounts[key] = entry;
}

const serializedContexts = Object.fromEntries(
  Object.entries(sourceContextCounts).map(([key, value]) => [
    key,
    {
      rows: value.rows,
      species: value.speciesIds.size,
      moves: value.moveIds.size,
      machineIdentifiers: value.machineIdentifiers.size,
      methods: value.methods,
    },
  ]),
);

const result = {
  speciesRecords: species.length,
  moveDefinitions: moves.length,
  learnsetRows: learnsets.length,
  unresolvedSpeciesRefs,
  unresolvedMoveRefs,
  speciesWithZeroLearnsetRows: [...rowsBySpecies.values()].filter((count) => count === 0).length,
  movesWithZeroLearnsetRows: [...rowsByMove.values()].filter((count) => count === 0).length,
  speciesWithExactlyOneSourceContext: species.filter(
    (record) => sourceContextsBySpecies.get(record.id)?.size === 1,
  ).length,
  speciesWithZeroOrMultipleSourceContexts: species.filter(
    (record) => sourceContextsBySpecies.get(record.id)?.size !== 1,
  ).length,
  methodCounts,
  invalidLevelQualifierRows,
  invalidMachineQualifierRows,
  machineContextKeys: machineByContext.size,
  conflictingMachineContextKeys: [...machineByContext.values()].filter((ids) => ids.size > 1)
    .length,
  distinctMachineIdentifiers: machineByIdentifier.size,
  machineIdentifiersReusedAcrossContexts: reusedAcrossContexts.length,
  machineIdentifiersReusedAcrossContextsWithDifferentMove: reusedWithDifferentMove.length,
  sourceContexts: serializedContexts,
  contextSensitiveMachineExamples: reusedWithDifferentMove
    .slice(0, 20)
    .map(([machineIdentifier, contexts]) => ({
      machineIdentifier,
      contexts: [...contexts.entries()].map(([context, ids]) => ({
        context,
        moveIds: [...ids],
      })),
    })),
};

const out = ".tmp-game-data-sanity/learnset-integrity-audit.json";
fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));

if (
  result.unresolvedSpeciesRefs !== 0 ||
  result.unresolvedMoveRefs !== 0 ||
  result.speciesWithZeroLearnsetRows !== 0 ||
  result.movesWithZeroLearnsetRows !== 0 ||
  result.speciesWithZeroOrMultipleSourceContexts !== 0 ||
  result.invalidLevelQualifierRows !== 0 ||
  result.invalidMachineQualifierRows !== 0 ||
  result.conflictingMachineContextKeys !== 0
) {
  process.exitCode = 2;
}
