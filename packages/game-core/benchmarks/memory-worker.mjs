import process from "node:process";
import { environmentMetadata } from "./environment.mjs";
import { EXPECTED_SEMANTICS, EXPECTED_TIMED_SEMANTICS } from "./expected-semantics.mjs";
import { loadBuiltRuntime } from "./runtime.mjs";
import { BENCHMARK_CONFIG_VERSION, MEMORY_EPOCHS, scenarioConfig } from "./scenario-manifest.mjs";
import {
  executePreparedScenario,
  executePreparedScenarioTimed,
  executePreparedScenarioTimedEvidence,
  prepareScenario,
} from "./scenarios.mjs";
import { assertSemanticEvidence, semanticEvidence, timedSemanticEvidence } from "./semantics.mjs";

const [scenarioId] = process.argv.slice(2);
if (!scenarioId) throw new Error("usage: node --expose-gc benchmarks/memory-worker.mjs <scenario-id>");
if (typeof globalThis.gc !== "function") throw new Error("memory benchmark requires --expose-gc");

const config = scenarioConfig(scenarioId);
const runtime = await loadBuiltRuntime();
const prepared = prepareScenario(runtime, scenarioId);
const evidence = semanticEvidence(scenarioId, executePreparedScenario(runtime, prepared));
assertSemanticEvidence(scenarioId, evidence, EXPECTED_SEMANTICS[scenarioId]);
const measuredPathEvidence = timedSemanticEvidence(
  scenarioId,
  executePreparedScenarioTimedEvidence(runtime, prepared),
);
assertSemanticEvidence(`${scenarioId} timed path`, measuredPathEvidence, EXPECTED_TIMED_SEMANTICS[scenarioId]);

globalThis.gc();
const baseline = process.memoryUsage();
const epochs = [];
let sink = 0;

for (let epoch = 1; epoch <= MEMORY_EPOCHS; epoch += 1) {
  for (let iteration = 0; iteration < config.memoryIterations; iteration += 1) {
    sink += executePreparedScenarioTimed(runtime, prepared);
  }
  globalThis.gc();
  epochs.push({ epoch, ...process.memoryUsage() });
}

const heapValues = epochs.map((entry) => entry.heapUsed);
const rssValues = epochs.map((entry) => entry.rss);

process.stdout.write(`${JSON.stringify({
  benchmarkConfigVersion: BENCHMARK_CONFIG_VERSION,
  scenarioId,
  environment: environmentMetadata(),
  configuration: {
    memoryEpochs: MEMORY_EPOCHS,
    iterationsPerEpoch: config.memoryIterations,
    forcedGc: "before baseline and after each epoch; separate from throughput timing",
  },
  semanticEvidence: evidence,
  timedSemanticEvidence: measuredPathEvidence,
  baseline,
  epochs,
  trend: {
    heapUsedLastMinusBaseline: epochs.at(-1).heapUsed - baseline.heapUsed,
    heapUsedPostGcRange: Math.max(...heapValues) - Math.min(...heapValues),
    rssLastMinusBaseline: epochs.at(-1).rss - baseline.rss,
    rssPostGcRange: Math.max(...rssValues) - Math.min(...rssValues),
    monotonicHeapIncreaseCount: epochs.slice(1).filter((entry, index) => entry.heapUsed > epochs[index].heapUsed).length,
  },
  sink,
})}\n`);
