export const BENCHMARK_CONFIG_VERSION = "task011-benchmark-v1";
export const SAMPLE_COUNT = 30;
export const RUN_COUNT = 3;
export const WARMUP_BATCHES = 8;
export const MEMORY_EPOCHS = 5;
export const MIN_MEASURED_BATCH_NS = 100_000_000;

export const SCENARIO_MANIFEST = Object.freeze([
  Object.freeze({
    id: "battle.terminal-replacement.v1",
    kind: "battle",
    unit: "complete battle",
    batchIterations: 7000,
    memoryIterations: 1000,
  }),
  Object.freeze({
    id: "battle.scheduled-effects.v1",
    kind: "battle",
    unit: "battle stimulus stream",
    batchIterations: 18000,
    memoryIterations: 1500,
  }),
  Object.freeze({
    id: "battle.multitarget-rng.v1",
    kind: "battle",
    unit: "multi-target action",
    batchIterations: 10000,
    memoryIterations: 2000,
  }),
  Object.freeze({
    id: "cadence.realistic-1h.v1",
    kind: "cadence",
    unit: "1h cadence advancement",
    batchIterations: 650,
    memoryIterations: 30,
    gapMs: 60 * 60 * 1000,
    durationMs: 8 * 60 * 60 * 1000,
    intervalMs: 15 * 1000,
  }),
  Object.freeze({
    id: "cadence.realistic-8h.v1",
    kind: "cadence",
    unit: "8h cadence advancement",
    batchIterations: 80,
    memoryIterations: 5,
    gapMs: 8 * 60 * 60 * 1000,
    durationMs: 8 * 60 * 60 * 1000,
    intervalMs: 15 * 1000,
  }),
  Object.freeze({
    id: "cadence.pathological-boundaries.v1",
    kind: "cadence",
    unit: "bounded tiny-interval cadence advancement",
    batchIterations: 32,
    memoryIterations: 3,
    gapMs: 5000,
    durationMs: 5000,
    intervalMs: 1,
  }),
]);

export function scenarioConfig(scenarioId) {
  const config = SCENARIO_MANIFEST.find((entry) => entry.id === scenarioId);
  if (!config) throw new Error(`unknown benchmark scenario: ${scenarioId}`);
  return config;
}
