import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { environmentMetadata } from "./environment.mjs";
import { BENCHMARK_CONFIG_VERSION, RUN_COUNT, SCENARIO_MANIFEST } from "./scenario-manifest.mjs";
import { nearestRank } from "./semantics.mjs";

const workerPath = fileURLToPath(new URL("./worker.mjs", import.meta.url));
const scenarioFilter = process.argv.find((argument) => argument.startsWith("--scenario="))?.slice("--scenario=".length);
const scenarios = scenarioFilter
  ? SCENARIO_MANIFEST.filter((scenario) => scenario.id === scenarioFilter)
  : SCENARIO_MANIFEST;
if (scenarios.length === 0) throw new Error(`unknown scenario filter: ${scenarioFilter}`);

const results = [];
for (const scenario of scenarios) {
  const runs = [];
  for (let runIndex = 1; runIndex <= RUN_COUNT; runIndex += 1) {
    const child = spawnSync(process.execPath, [workerPath, scenario.id, String(runIndex)], {
      encoding: "utf8",
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (child.status !== 0) {
      throw new Error(`benchmark worker failed for ${scenario.id} run ${runIndex}: ${child.stderr || child.stdout}`);
    }
    runs.push(JSON.parse(child.stdout));
  }

  const runP50Wall = runs.map((run) => run.measurements.p50WallNsPerUnit);
  const runP95Wall = runs.map((run) => run.measurements.p95WallNsPerUnit);
  const runP50Cpu = runs.map((run) => run.measurements.p50CpuUsPerUnit);
  const runP95Cpu = runs.map((run) => run.measurements.p95CpuUsPerUnit);
  const medianRunP50Wall = nearestRank(runP50Wall, 0.5);
  const medianRunP50Cpu = nearestRank(runP50Cpu, 0.5);
  const medianRunP95Wall = nearestRank(runP95Wall, 0.5);
  const medianRunP95Cpu = nearestRank(runP95Cpu, 0.5);
  const minRunP50Wall = Math.min(...runP50Wall);
  const maxRunP50Wall = Math.max(...runP50Wall);
  const minRunP50Cpu = Math.min(...runP50Cpu);
  const maxRunP50Cpu = Math.max(...runP50Cpu);
  const minRunP95Wall = Math.min(...runP95Wall);
  const maxRunP95Wall = Math.max(...runP95Wall);
  const minRunP95Cpu = Math.min(...runP95Cpu);
  const maxRunP95Cpu = Math.max(...runP95Cpu);
  results.push({
    scenarioId: scenario.id,
    unit: scenario.unit,
    semanticEvidence: {
      digest: runs[0].semanticEvidence.digest,
      eventCount: runs[0].semanticEvidence.eventCount,
      consequenceCount: runs[0].semanticEvidence.consequenceCount,
      boundaryCount: runs[0].semanticEvidence.boundaryCount,
      outcome: runs[0].semanticEvidence.outcome,
    },
    timedSemanticEvidence: {
      digest: runs[0].timedSemanticEvidence.digest,
      startDigest: runs[0].timedSemanticEvidence.startDigest,
      eventCount: runs[0].timedSemanticEvidence.eventCount,
      consequenceCount: runs[0].timedSemanticEvidence.consequenceCount,
      boundaryCount: runs[0].timedSemanticEvidence.boundaryCount,
      outcome: runs[0].timedSemanticEvidence.outcome,
    },
    configuration: runs[0].configuration,
    aggregate: {
      runP50WallNsPerUnit: runP50Wall,
      runP95WallNsPerUnit: runP95Wall,
      runP50CpuUsPerUnit: runP50Cpu,
      runP95CpuUsPerUnit: runP95Cpu,
      medianRunP50WallNsPerUnit: medianRunP50Wall,
      medianRunP95WallNsPerUnit: medianRunP95Wall,
      medianRunP50CpuUsPerUnit: medianRunP50Cpu,
      medianRunP95CpuUsPerUnit: medianRunP95Cpu,
      minRunP50WallNsPerUnit: minRunP50Wall,
      maxRunP50WallNsPerUnit: maxRunP50Wall,
      relativeRunP50WallSpread: medianRunP50Wall === 0 ? 0 : (maxRunP50Wall - minRunP50Wall) / medianRunP50Wall,
      minRunP50CpuUsPerUnit: minRunP50Cpu,
      maxRunP50CpuUsPerUnit: maxRunP50Cpu,
      relativeRunP50CpuSpread: medianRunP50Cpu === 0 ? 0 : (maxRunP50Cpu - minRunP50Cpu) / medianRunP50Cpu,
      minRunP95WallNsPerUnit: minRunP95Wall,
      maxRunP95WallNsPerUnit: maxRunP95Wall,
      relativeRunP95WallSpread: medianRunP95Wall === 0 ? 0 : (maxRunP95Wall - minRunP95Wall) / medianRunP95Wall,
      minRunP95CpuUsPerUnit: minRunP95Cpu,
      maxRunP95CpuUsPerUnit: maxRunP95Cpu,
      relativeRunP95CpuSpread: medianRunP95Cpu === 0 ? 0 : (maxRunP95Cpu - minRunP95Cpu) / medianRunP95Cpu,
      completedUnitsPerSecondAtMedianRunP50: 1e9 / medianRunP50Wall,
      semanticBoundariesPerSecondAtMedianRunP50: runs[0].timedSemanticEvidence.boundaryCount > 0
        ? runs[0].timedSemanticEvidence.boundaryCount * 1e9 / medianRunP50Wall
        : null,
    },
    runs: runs.map((run) => ({
      runIndex: run.runIndex,
      p50WallNsPerUnit: run.measurements.p50WallNsPerUnit,
      p95WallNsPerUnit: run.measurements.p95WallNsPerUnit,
      p50CpuUsPerUnit: run.measurements.p50CpuUsPerUnit,
      p95CpuUsPerUnit: run.measurements.p95CpuUsPerUnit,
      completedUnitsPerSecondAtP50: run.measurements.completedUnitsPerSecondAtP50,
      semanticBoundariesPerSecondAtP50: run.measurements.semanticBoundariesPerSecondAtP50,
      minimumObservedMeasuredBatchNs: run.measurements.minimumObservedMeasuredBatchNs,
      maximumObservedMeasuredBatchNs: run.measurements.maximumObservedMeasuredBatchNs,
      harnessLoopOverheadP50NsPerIteration: run.measurements.harnessLoopOverheadP50NsPerIteration,
      harnessLoopOverheadP95NsPerIteration: run.measurements.harnessLoopOverheadP95NsPerIteration,
    })),
  });
}

process.stdout.write(`${JSON.stringify({
  benchmarkConfigVersion: BENCHMARK_CONFIG_VERSION,
  referenceEnvironment: environmentMetadata(),
  independentRunsPerScenario: RUN_COUNT,
  scenarios: results,
}, null, 2)}\n`);
