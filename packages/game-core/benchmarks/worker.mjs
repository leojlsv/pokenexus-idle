import process from "node:process";
import { environmentMetadata } from "./environment.mjs";
import { EXPECTED_SEMANTICS, EXPECTED_TIMED_SEMANTICS } from "./expected-semantics.mjs";
import { loadBuiltRuntime } from "./runtime.mjs";
import {
  BENCHMARK_CONFIG_VERSION,
  MIN_MEASURED_BATCH_NS,
  SAMPLE_COUNT,
  WARMUP_BATCHES,
  scenarioConfig,
} from "./scenario-manifest.mjs";
import {
  executePreparedScenario,
  executePreparedScenarioTimed,
  executePreparedScenarioTimedEvidence,
  prepareScenario,
} from "./scenarios.mjs";
import { assertSemanticEvidence, nearestRank, semanticEvidence, timedSemanticEvidence } from "./semantics.mjs";

const [scenarioId, runIndexText] = process.argv.slice(2);
const runIndex = Number(runIndexText);
if (!scenarioId || !Number.isInteger(runIndex) || runIndex < 1) {
  throw new Error("usage: node benchmarks/worker.mjs <scenario-id> <run-index>");
}

const config = scenarioConfig(scenarioId);
const runtime = await loadBuiltRuntime();
const prepared = prepareScenario(runtime, scenarioId);

const preflightEvidence = semanticEvidence(scenarioId, executePreparedScenario(runtime, prepared));
assertSemanticEvidence(scenarioId, preflightEvidence, EXPECTED_SEMANTICS[scenarioId]);
const measuredPathEvidence = timedSemanticEvidence(
  scenarioId,
  executePreparedScenarioTimedEvidence(runtime, prepared),
);
assertSemanticEvidence(`${scenarioId} timed path`, measuredPathEvidence, EXPECTED_TIMED_SEMANTICS[scenarioId]);

let sink = 0;
for (let batch = 0; batch < WARMUP_BATCHES; batch += 1) {
  for (let iteration = 0; iteration < config.batchIterations; iteration += 1) {
    sink += executePreparedScenarioTimed(runtime, prepared);
  }
}

const samples = [];
for (let sampleIndex = 0; sampleIndex < SAMPLE_COUNT; sampleIndex += 1) {
  const cpuStart = process.cpuUsage();
  const wallStart = process.hrtime.bigint();
  for (let iteration = 0; iteration < config.batchIterations; iteration += 1) {
    sink += executePreparedScenarioTimed(runtime, prepared);
  }
  const wallNs = Number(process.hrtime.bigint() - wallStart);
  if (wallNs < MIN_MEASURED_BATCH_NS) {
    throw new Error(
      `measured batch too short for ${scenarioId}: ${wallNs}ns < ${MIN_MEASURED_BATCH_NS}ns; increase batchIterations`,
    );
  }
  const cpu = process.cpuUsage(cpuStart);
  samples.push({
    wallNs,
    cpuUs: cpu.user + cpu.system,
    wallNsPerUnit: wallNs / config.batchIterations,
    cpuUsPerUnit: (cpu.user + cpu.system) / config.batchIterations,
  });
}

const overheadSamples = [];
for (let sampleIndex = 0; sampleIndex < SAMPLE_COUNT; sampleIndex += 1) {
  const wallStart = process.hrtime.bigint();
  for (let iteration = 0; iteration < config.batchIterations; iteration += 1) sink += iteration & 1;
  overheadSamples.push(Number(process.hrtime.bigint() - wallStart) / config.batchIterations);
}

const wallPerUnit = samples.map((sample) => sample.wallNsPerUnit);
const cpuPerUnit = samples.map((sample) => sample.cpuUsPerUnit);
const p50WallNsPerUnit = nearestRank(wallPerUnit, 0.5);
const p95WallNsPerUnit = nearestRank(wallPerUnit, 0.95);
const p50CpuUsPerUnit = nearestRank(cpuPerUnit, 0.5);
const p95CpuUsPerUnit = nearestRank(cpuPerUnit, 0.95);
const boundaryCount = measuredPathEvidence.boundaryCount;

process.stdout.write(`${JSON.stringify({
  benchmarkConfigVersion: BENCHMARK_CONFIG_VERSION,
  scenarioId,
  runIndex,
  unit: config.unit,
  environment: environmentMetadata(),
  configuration: {
    batchIterations: config.batchIterations,
    warmupBatches: WARMUP_BATCHES,
    measuredSampleBatches: SAMPLE_COUNT,
    minimumMeasuredBatchNs: MIN_MEASURED_BATCH_NS,
    percentileMethod: "nearest-rank: rank=ceil(p*N), one-based",
  },
  semanticEvidence: preflightEvidence,
  timedSemanticEvidence: measuredPathEvidence,
  measurements: {
    p50WallNsPerUnit,
    p95WallNsPerUnit,
    p50CpuUsPerUnit,
    p95CpuUsPerUnit,
    completedUnitsPerSecondAtP50: 1e9 / p50WallNsPerUnit,
    semanticBoundariesPerSecondAtP50: boundaryCount > 0 ? boundaryCount * 1e9 / p50WallNsPerUnit : null,
    minimumObservedMeasuredBatchNs: Math.min(...samples.map((sample) => sample.wallNs)),
    maximumObservedMeasuredBatchNs: Math.max(...samples.map((sample) => sample.wallNs)),
    harnessLoopOverheadP50NsPerIteration: nearestRank(overheadSamples, 0.5),
    harnessLoopOverheadP95NsPerIteration: nearestRank(overheadSamples, 0.95),
    samples,
  },
  sink,
})}\n`);
