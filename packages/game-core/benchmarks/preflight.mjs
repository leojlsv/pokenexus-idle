import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";
import { resolveGameCoreDistCandidate } from "./dist-resolver.mjs";
import { EXPECTED_SEMANTICS, EXPECTED_TIMED_SEMANTICS } from "./expected-semantics.mjs";
import { loadBuiltRuntime } from "./runtime.mjs";
import { SCENARIO_MANIFEST } from "./scenario-manifest.mjs";
import { executePreparedScenario, executePreparedScenarioTimedEvidence, prepareScenario } from "./scenarios.mjs";
import { assertSemanticEvidence, semanticEvidence, timedSemanticEvidence } from "./semantics.mjs";

const distRootUrl = new URL("../dist/", import.meta.url);
const distParentUrl = new URL("index.js", distRootUrl).href;
assert.equal(
  resolveGameCoreDistCandidate("./battle", distParentUrl, distRootUrl),
  new URL("battle.js", distRootUrl).href,
  "benchmark dist resolver must resolve local extensionless imports inside dist",
);
assert.throws(
  () => resolveGameCoreDistCandidate("../escape", distParentUrl, distRootUrl),
  /refused path escape/,
  "benchmark dist resolver must fail closed on ../ escape",
);

const runtime = await loadBuiltRuntime();
const results = [];

for (const config of SCENARIO_MANIFEST) {
  const prepared = prepareScenario(runtime, config.id);
  const evidence = semanticEvidence(config.id, executePreparedScenario(runtime, prepared));
  assertSemanticEvidence(config.id, evidence, EXPECTED_SEMANTICS[config.id]);
  const measuredPathEvidence = timedSemanticEvidence(
    config.id,
    executePreparedScenarioTimedEvidence(runtime, prepared),
  );
  assertSemanticEvidence(`${config.id} timed path`, measuredPathEvidence, EXPECTED_TIMED_SEMANTICS[config.id]);
  results.push({
    scenarioId: config.id,
    fullDigest: evidence.digest,
    timedDigest: measuredPathEvidence.digest,
    timedStartDigest: measuredPathEvidence.startDigest,
    eventCount: measuredPathEvidence.eventCount,
    consequenceCount: measuredPathEvidence.consequenceCount,
    boundaryCount: measuredPathEvidence.boundaryCount,
  });
}

process.stdout.write(`${JSON.stringify({ status: "PASS", scenarios: results }, null, 2)}\n`);
