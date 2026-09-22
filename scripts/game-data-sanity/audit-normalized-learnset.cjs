const fs = require("fs");

const base = process.env.POKENEXUS_GAME_DATA_BASE;
if (!base) {
  throw new Error("POKENEXUS_GAME_DATA_BASE is required; run audits through run-sanity.cjs");
}
const learnsets = JSON.parse(fs.readFileSync(`${base}/catalogs/learnsets.json`, "utf8"));
const species = JSON.parse(fs.readFileSync(`${base}/catalogs/species.json`, "utf8"));
const roster = JSON.parse(
  fs.readFileSync("packages/game-data/src/canonical-mapping-roster.json", "utf8"),
);

const speciesName = new Map(species.map((record) => [record.id, record.sourceName]));
const moveName = new Map(
  roster.mappings.moves.map((mapping) => [mapping.canonicalId, mapping.sourceKey]),
);

const normalized = new Map();
for (const row of learnsets) {
  const key = [row.speciesId, row.moveId, row.sourceGeneration, row.sourceGame].join("\u0000");
  const group = normalized.get(key) ?? [];
  group.push(row);
  normalized.set(key, group);
}

const groups = [...normalized.values()];
const multiRoute = groups.filter((group) => group.length > 1);
const repeatedSameMethod = multiRoute.filter(
  (group) => new Set(group.map((row) => row.method)).size < group.length,
);

const unexpectedSameMethod = repeatedSameMethod.filter((group) => {
  const byMethod = new Map();
  for (const row of group) {
    const rows = byMethod.get(row.method) ?? [];
    rows.push(row);
    byMethod.set(row.method, rows);
  }
  for (const [method, rows] of byMethod) {
    if (rows.length <= 1) continue;
    if (method === "level-up" && new Set(rows.map((row) => row.level)).size === rows.length) {
      continue;
    }
    return true;
  }
  return false;
});

const contextBySpeciesMove = new Map();
for (const group of groups) {
  const first = group[0];
  const key = [first.speciesId, first.moveId].join("\u0000");
  const contexts = contextBySpeciesMove.get(key) ?? new Set();
  contexts.add(`${first.sourceGeneration}\u0000${first.sourceGame}`);
  contextBySpeciesMove.set(key, contexts);
}
const crossContext = [...contextBySpeciesMove.entries()].filter(
  ([, contexts]) => contexts.size > 1,
);

const routeMultiplicity = {};
for (const group of multiRoute) {
  routeMultiplicity[group.length] = (routeMultiplicity[group.length] ?? 0) + 1;
}

const methodCombinations = {};
for (const group of multiRoute) {
  const combo = [...new Set(group.map((row) => row.method))].sort().join("+");
  methodCombinations[combo] = (methodCombinations[combo] ?? 0) + 1;
}

const result = {
  rawLearnsetRows: learnsets.length,
  normalizedSpeciesMoveGroups: groups.length,
  multiRouteSpeciesMoveGroups: multiRoute.length,
  extraAcquisitionRoutesRetained: learnsets.length - groups.length,
  speciesMoveGroupRouteMultiplicity: routeMultiplicity,
  methodCombinations,
  repeatedSameMethodSpeciesMoveGroups: repeatedSameMethod.length,
  unexpectedSameMethodSpeciesMoveGroups: unexpectedSameMethod.length,
  crossContextSpeciesMoveGroups: crossContext.length,
  repeatedSameMethodExamples: repeatedSameMethod.map((group) => ({
    species: speciesName.get(group[0].speciesId),
    move: moveName.get(group[0].moveId),
    sourceGeneration: group[0].sourceGeneration,
    sourceGame: group[0].sourceGame,
    routes: group.map((row) => ({
      method: row.method,
      level: row.level,
      machineIdentifier: row.machineIdentifier,
    })),
  })),
};

const out = ".tmp-game-data-sanity/normalized-learnset-audit.json";
fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));

if (unexpectedSameMethod.length > 0 || crossContext.length > 0) {
  process.exitCode = 2;
}
