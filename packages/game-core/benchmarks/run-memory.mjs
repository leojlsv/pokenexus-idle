import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { BENCHMARK_CONFIG_VERSION, SCENARIO_MANIFEST } from "./scenario-manifest.mjs";

const workerPath = fileURLToPath(new URL("./memory-worker.mjs", import.meta.url));
const scenarioFilter = process.argv.find((argument) => argument.startsWith("--scenario="))?.slice("--scenario=".length);
const scenarios = scenarioFilter
  ? SCENARIO_MANIFEST.filter((scenario) => scenario.id === scenarioFilter)
  : SCENARIO_MANIFEST;
if (scenarios.length === 0) throw new Error(`unknown scenario filter: ${scenarioFilter}`);

const results = [];
for (const scenario of scenarios) {
  const child = spawnSync(process.execPath, ["--expose-gc", workerPath, scenario.id], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (child.status !== 0) {
    throw new Error(`memory benchmark worker failed for ${scenario.id}: ${child.stderr || child.stdout}`);
  }
  const result = JSON.parse(child.stdout);
  results.push({
    scenarioId: result.scenarioId,
    environment: result.environment,
    configuration: result.configuration,
    semanticEvidence: {
      digest: result.semanticEvidence.digest,
      eventCount: result.semanticEvidence.eventCount,
      consequenceCount: result.semanticEvidence.consequenceCount,
      boundaryCount: result.semanticEvidence.boundaryCount,
    },
    timedSemanticEvidence: {
      digest: result.timedSemanticEvidence.digest,
      startDigest: result.timedSemanticEvidence.startDigest,
      eventCount: result.timedSemanticEvidence.eventCount,
      consequenceCount: result.timedSemanticEvidence.consequenceCount,
      boundaryCount: result.timedSemanticEvidence.boundaryCount,
    },
    baseline: result.baseline,
    epochs: result.epochs,
    trend: result.trend,
  });
}

process.stdout.write(`${JSON.stringify({
  benchmarkConfigVersion: BENCHMARK_CONFIG_VERSION,
  mode: "retained-memory-post-gc",
  referenceEnvironment: results[0]?.environment,
  scenarios: results.map(({ environment: _environment, ...result }) => result),
}, null, 2)}\n`);
