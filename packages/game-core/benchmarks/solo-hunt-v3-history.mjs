import process from "node:process";
import { performance } from "node:perf_hooks";
import { URL } from "node:url";
import { environmentMetadata } from "./environment.mjs";
import { loadBuiltRuntime } from "./runtime.mjs";

// Task-103 diagnostic, not a production Worker or PostgreSQL benchmark.
// Run after building game-core: node benchmarks/solo-hunt-v3-history.mjs
const { engine } = await loadBuiltRuntime();
const { deriveEncounterIndividualizationAuthorityKeyIdV1 } =
  await import(new URL("../dist/encounter-individualization.js", import.meta.url).href);

const periods = [1, 2, 4, 8];
const samplesPerPeriod = 7;
const ivs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const secretKey = new Uint8Array(32).fill(41);
const context = {
  gameDataVersion: "data",
  rulesVersion: engine.GENETIC_COMBAT_RULES_VERSION_V1,
  combatEventSchemaVersion: "events",
  abilityRules: {},
  effectRules: {},
  typeChart: { normal: { normal: 1 } },
  moveRules: {
    first: {
      moveId: "first", typeId: "normal", category: "physical", targetScope: "singleEnemy",
      moveCooldownMs: 2000, power: 1000, accuracy: "always", criticalPolicy: "never",
    },
    enemy: {
      moveId: "enemy", typeId: "normal", category: "physical", targetScope: "singleEnemy",
      moveCooldownMs: 2000, power: 1, accuracy: "always", criticalPolicy: "never",
    },
  },
};
const inputs = {
  playerId: "player:history-benchmark",
  zoneId: "zone:history-benchmark",
  huntDefinitionId: "hunt:history-benchmark",
  contentVersion: "pve-content:history-benchmark",
  contentHash: "sha256:history-benchmark",
  context,
  team: [{
    pokemonInstanceId: "pokemon:history-benchmark",
    speciesId: "species:player",
    shiny: true,
    level: 10,
    baseStats: { hp: 80, atk: 100, def: 100, spa: 40, spd: 50, spe: 100 },
    ivs,
    geneticBonuses: { ...ivs },
    types: ["normal"],
    moveLoadout: ["first"],
  }],
  encounterOptions: [{
    encounterDefinitionId: "encounter:history-benchmark",
    speciesId: "species:enemy",
    weight: 1,
    levelBand: { min: 5, max: 5 },
    rewardEnvelope: { pokemonXpPool: 25, playerXp: 5 },
  }],
  opponentTemplates: [{
    encounterDefinitionId: "encounter:history-benchmark",
    speciesId: "species:enemy",
    level: 5,
    gameDataVersion: context.gameDataVersion,
    rulesVersion: context.rulesVersion,
    baseStats: { hp: 10, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 },
    ivs,
    types: ["normal"],
    moveLoadout: ["enemy"],
    compatibleProfiles: ["Might", "Clarity"],
  }],
  interBattleGapMs: 60_000,
  individualizationAuthority: {
    rulesVersion: engine.ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
    authorityVersion: "history-benchmark-authority-v1",
    keyId: deriveEncounterIndividualizationAuthorityKeyIdV1(secretKey),
    secretKey,
  },
};

function nearestRank(samples, ratio) {
  return [...samples].sort((a, b) => a - b)[Math.max(0, Math.ceil(ratio * samples.length) - 1)];
}

const rows = [];
for (const hours of periods) {
  const created = engine.createSoloHuntRuntime({
    huntRunIdentity: `hunt-run:history-benchmark:${hours}`,
    inputs,
    policyRng: engine.createRngState(123),
    combatDeterministicState: { rng: engine.createRngState(999) },
  });
  if (!created.accepted) throw new Error(created.reason);
  const advanced = engine.advanceSoloHuntToCutoff(created.state, inputs, hours * 60 * 60 * 1000);
  if (!advanced.accepted) throw new Error(advanced.reason);
  const state = advanced.state;
  const validateWallMs = [];
  const encodeWallMs = [];
  let validateCpuUsTotal = 0;
  let encodeCpuUsTotal = 0;
  let byteLength = 0;
  for (let sample = 0; sample < samplesPerPeriod; sample += 1) {
    const validateCpu = process.cpuUsage();
    const validateStart = performance.now();
    const verified = engine.advanceSoloHuntToCutoff(state, inputs, state.logicalTimeMs);
    validateWallMs.push(performance.now() - validateStart);
    const validateDelta = process.cpuUsage(validateCpu);
    validateCpuUsTotal += validateDelta.user + validateDelta.system;
    if (!verified.accepted || verified.state !== state || verified.events.length !== 0) {
      throw new Error("zero-elapsed full replay no longer preserves the checkpoint");
    }

    const encodeCpu = process.cpuUsage();
    const encodeStart = performance.now();
    const bytes = engine.encodeSoloHuntCheckpointV3(state);
    encodeWallMs.push(performance.now() - encodeStart);
    const encodeDelta = process.cpuUsage(encodeCpu);
    encodeCpuUsTotal += encodeDelta.user + encodeDelta.system;
    byteLength = bytes.byteLength;
    if (sample === 0) {
      const decoded = engine.decodeSoloHuntCheckpointV3(bytes);
      if (!decoded.accepted) throw new Error(decoded.reason);
      if (decoded.state.completedEncounters.length !== state.completedEncounters.length) {
        throw new Error("v3 history count differs across a strict codec round-trip");
      }
    }
  }
  rows.push({
    hours,
    completedEncounters: state.completedEncounters.length,
    currentBattleStimuli: state.currentEncounter?.battleStimuli.length ?? 0,
    checkpointV3Bytes: byteLength,
    validateP50WallMs: Number(nearestRank(validateWallMs, 0.5).toFixed(3)),
    validateP95WallMs: Number(nearestRank(validateWallMs, 0.95).toFixed(3)),
    validateCpuUsTotal,
    encodeP50WallMs: Number(nearestRank(encodeWallMs, 0.5).toFixed(3)),
    encodeP95WallMs: Number(nearestRank(encodeWallMs, 0.95).toFixed(3)),
    encodeCpuUsTotal,
  });
}
process.stdout.write(`${JSON.stringify({
  kind: "solo-hunt-v3-history-local-baseline",
  limitation: "Node synthetic fixture; not Cloudflare Worker, PostgreSQL, live authority, or accepted workload ceiling",
  environment: environmentMetadata(),
  samplesPerPeriod,
  rows,
}, null, 2)}\n`);
