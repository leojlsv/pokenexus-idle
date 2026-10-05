// TASK-103 test-only subprocess. It has NO Start/runtime closure from Vitest.
// Its only Hunt input comes from the Player-scoped disposable PostgreSQL row.
// Execute with Node 24 --experimental-transform-types from the owning test.
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

// The API source and built workspace ESM currently use extensionless relative
// imports. Resolve only missing relative ESM files, never CJS require calls or
// absolute/package specifiers. Do not alter the application's production code.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!context.conditions?.includes("require")
      && (specifier.startsWith("./") || specifier.startsWith("../"))
      && context.parentURL) {
      const original = new URL(specifier, context.parentURL);
      if (!existsSync(fileURLToPath(original))) {
        for (const suffix of [".js", ".ts"]) {
          const candidate = new URL(original);
          candidate.pathname = original.pathname.endsWith(".js")
            ? original.pathname.replace(/\.js$/u, ".ts")
            : original.pathname + suffix;
          if (existsSync(fileURLToPath(candidate))) {
            return nextResolve(candidate.href, context);
          }
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const databaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Disposable PostgreSQL URL missing");
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/u.test(databaseName)) {
  throw new Error("Subprocess will only access a pokenexus_test_* database");
}
const argument = process.argv[2];
if (!argument) throw new Error("Missing frozen Hunt continuation identity");
const {
  playerId, huntId, key, wrongRetainedKey = false, once = false,
  resolvePinnedPotion = false,
} = JSON.parse(argument);
for (const [name, value] of Object.entries({ playerId, huntId, key })) {
  if (typeof value !== "string" || !/^[a-f0-9-]{36}$/iu.test(value)) {
    throw new Error(`Invalid ${name} for disposable process-restart test`);
  }
}
if (typeof wrongRetainedKey !== "boolean") {
  throw new Error("Invalid test-only retained key fault mode");
}
if (typeof once !== "boolean") {
  throw new Error("Invalid test-only single-invocation mode");
}
if (typeof resolvePinnedPotion !== "boolean" || (resolvePinnedPotion && !once)) {
  throw new Error("Invalid test-only due-Potion single-invocation mode");
}

const {
  ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
  MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1,
} = await import("@pokenexus/game-core");
const { HuntApplication } = await import("../src/hunts/application.ts");
const secretKey = new Uint8Array(32).fill(wrongRetainedKey ? 42 : 41); // TEST-ONLY release key fault
const keyId = `key-v1:${createHmac("sha256", secretKey)
  .update("pokenexus-individualization-authority-key-id-v1").digest("hex")}`;

const calls = [];
const neverStart = async () => {
  calls.push("unexpected_authority_operation");
  throw new Error("A resumed Hunt must not rebuild or sample Start authority");
};
const app = new HuntApplication(databaseUrl, {
  authority: {
    resolveStartSelector: neverStart,
    buildStartRuntime: neverStart,
    async loadPersistedRuntime(record, checkpointSchemaVersion) {
      calls.push("loadPersistedRuntime");
      const runtimeVersionMismatch = {
        playerId: record.playerId !== playerId,
        huntId: record.huntId !== huntId,
        checkpoint: checkpointSchemaVersion !== "pokenexus.solo-hunt-checkpoint.v4",
        inputs: record.runtimeInputsJson.schemaVersion !== "hunt-runtime-inputs-v4",
        rules: record.rulesVersion !== MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1,
        authority: record.individualizationAuthorityVersion !== "authority-v1",
      };
      if (Object.values(runtimeVersionMismatch).some(Boolean)) {
        calls.push(`runtime_version_mismatch:${JSON.stringify(runtimeVersionMismatch)}`);
        throw new Error("Subprocess frozen runtime version/player/Hunt authority mismatch");
      }
      if (record.individualizationAuthorityKeyId !== keyId) {
        calls.push("retained_key_mismatch");
        throw new Error("Subprocess retained authority key does not match frozen Hunt pin");
      }
      const frozen = record.runtimeInputsJson.inputs;
      if (!frozen || typeof frozen !== "object" || Array.isArray(frozen)
        || Object.hasOwn(frozen, "individualizationAuthority")) {
        throw new Error("SQL frozen input is missing or contains an unsafe authority");
      }
      return {
        ...frozen,
        individualizationAuthority: {
          rulesVersion: ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
          authorityVersion: "authority-v1",
          keyId,
          secretKey,
        },
      };
    },
    // SPEC-015 state projection still needs historical visible catchRate even
    // when no encounter reward/capture effect is executed by this continuation.
    async loadHistoricalEncounter(evidence) {
      calls.push("loadHistoricalEncounter");
      return {
        ...evidence,
        catchRate: 120,
        reward: { pokemonXpPool: 0, playerXp: null, itemDrops: [] },
      };
    },
    async currentBallAuthority() {
      calls.push("currentBallAuthority");
      return { version: "balls:test", balls: [] };
    },
    async ballAuthority(version) {
      return version === "balls:test" ? { version: "balls:test", balls: [] } : null;
    },
    currentItemRule: neverStart,
    async itemRule({ itemId, itemRuleVersion, gameDataVersion, rulesVersion }) {
      calls.push("itemRule");
      if (!resolvePinnedPotion || itemId !== "item:potion"
        || itemRuleVersion !== "item-rules:test"
        || gameDataVersion !== "game-data:test"
        || rulesVersion !== "rules:test") {
        throw new Error("Unpinned or unexpected historical Item authority in test-only subprocess");
      }
      return {
        itemRuleVersion: "item-rules:test",
        useKind: "heal-hp",
        magnitude: { kind: "fixed", amount: 5 },
      };
    },
    validatePolicyReferences: neverStart,
  },
  boundaryEffects: {
    automaticCapture: neverStart,
    reward: neverStart,
  },
  manualCaptureEffects: { attempt: neverStart },
}, { presentationSourceEnabled: true });

const completed = await app.checkpoint(playerId, key, huntId);
const replay = once ? null : await app.checkpoint(playerId, key, huntId);
process.stdout.write(JSON.stringify({ pid: process.pid, completed, replay, calls }) + "\n");
