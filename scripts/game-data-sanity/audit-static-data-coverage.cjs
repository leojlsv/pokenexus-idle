const fs = require("fs");

const base = process.env.POKENEXUS_GAME_DATA_BASE;
if (!base) {
  throw new Error("POKENEXUS_GAME_DATA_BASE is required; run audits through run-sanity.cjs");
}
const species = JSON.parse(fs.readFileSync(`${base}/catalogs/species.json`, "utf8"));
const moves = JSON.parse(fs.readFileSync(`${base}/catalogs/moves.json`, "utf8"));
const abilities = JSON.parse(fs.readFileSync(`${base}/catalogs/abilities.json`, "utf8"));
const items = JSON.parse(fs.readFileSync(`${base}/catalogs/items.json`, "utf8"));
const types = JSON.parse(fs.readFileSync(`${base}/catalogs/types.json`, "utf8"));
const typeEffectiveness = JSON.parse(
  fs.readFileSync(`${base}/reference-data/current-type-effectiveness.json`, "utf8"),
);
const manifest = JSON.parse(fs.readFileSync(`${base}/manifest.json`, "utf8"));

function statusCoverage(records, field) {
  const counts = {};
  for (const record of records) {
    const value = record[field];
    const key = value?.status ?? "missing";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function missingCount(records, field) {
  return records.filter((record) => {
    const value = record[field];
    return value === null || value === undefined || (Array.isArray(value) && value.length === 0);
  }).length;
}

function nullableCoverage(records, field) {
  const nullCount = records.filter((record) => record[field] === null).length;
  return {
    present: records.length - nullCount,
    semanticNull: nullCount,
  };
}

function categoryNullableCoverage(field) {
  const result = {};
  for (const move of moves) {
    const bucket = result[move.category] ?? { total: 0, present: 0, semanticNull: 0 };
    bucket.total += 1;
    if (move[field] === null) bucket.semanticNull += 1;
    else bucket.present += 1;
    result[move.category] = bucket;
  }
  return result;
}

const typeMatrixKeys = new Set(
  typeEffectiveness.map((entry) => `${entry.attackTypeId}\u0000${entry.defenseTypeId}`),
);
const expectedTypePairs = types.length * types.length;

const result = {
  gameDataVersion: manifest.gameDataVersion,
  species: {
    count: species.length,
    statusFields: {
      baseExperience: statusCoverage(species, "baseExperience"),
      baseFriendship: statusCoverage(species, "baseFriendship"),
      eggCycles: statusCoverage(species, "eggCycles"),
    },
    missingOrEmpty: Object.fromEntries(
      [
        "heightMillimeters",
        "weightGrams",
        "catchRate",
        "growthRate",
        "genderRatio",
        "eggGroups",
        "evYield",
        "abilities",
        "typeIds",
      ].map((field) => [field, missingCount(species, field)]),
    ),
  },
  moves: {
    count: moves.length,
    runtimeShape: Object.keys(moves[0] ?? {}),
    nullableFacts: {
      power: nullableCoverage(moves, "power"),
      accuracy: nullableCoverage(moves, "accuracy"),
      zaBaseCooldownMs: nullableCoverage(moves, "zaBaseCooldownMs"),
    },
    semanticNullByCategory: {
      power: categoryNullableCoverage("power"),
      accuracy: categoryNullableCoverage("accuracy"),
      zaBaseCooldownMs: categoryNullableCoverage("zaBaseCooldownMs"),
    },
    completeFacts: {
      basePp: missingCount(moves, "basePp") === 0,
      makesContact: missingCount(moves, "makesContact") === 0,
      sourceTarget: missingCount(moves, "sourceTarget") === 0,
    },
    runtimeDisplayIdentity: {
      sourceNameField: Object.hasOwn(moves[0] ?? {}, "sourceName"),
      sourceSlugField: Object.hasOwn(moves[0] ?? {}, "sourceSlug"),
      introducedGenerationField: Object.hasOwn(moves[0] ?? {}, "introducedGeneration"),
      note: "Runtime MoveDefinition intentionally does not expose maintenance-only display identity fields.",
    },
  },
  abilities: {
    count: abilities.length,
    runtimeShape: Object.keys(abilities[0] ?? {}),
    hasEffectDescription:
      Object.hasOwn(abilities[0] ?? {}, "description") ||
      Object.hasOwn(abilities[0] ?? {}, "effect"),
  },
  items: {
    count: items.length,
  },
  typeEffectiveness: {
    typeCount: types.length,
    rows: typeEffectiveness.length,
    expectedRows: expectedTypePairs,
    uniquePairs: typeMatrixKeys.size,
    completeMatrix:
      typeEffectiveness.length === expectedTypePairs && typeMatrixKeys.size === expectedTypePairs,
  },
  deliberateCurrentConsumerGaps: [
    "Move runtime display name/source slug",
    "Move effect/secondary-effect semantics and prose",
    "Ability effect semantics/prose",
    "Evolution graph/triggers",
    "Sprites/images/assets",
    "Pokédex flavor text",
    "Encounter/location data",
  ],
};

const out = ".tmp-game-data-sanity/static-data-coverage-audit.json";
fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));

if (
  Object.values(result.species.missingOrEmpty).some((count) => count !== 0) ||
  !result.typeEffectiveness.completeMatrix ||
  !result.moves.completeFacts.basePp ||
  !result.moves.completeFacts.makesContact ||
  !result.moves.completeFacts.sourceTarget
) {
  process.exitCode = 2;
}
