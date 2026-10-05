// TASK-103 disposable-only Node process. Rebuilds the *production* authority
// port (not an in-memory Start fixture) from exact published bytes + test-only
// release configuration. No live game, shared database or deployed secret.
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

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
          if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
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
const arg = process.argv[2];
if (!arg) throw new Error("Missing frozen Hunt continuation identity");
const { playerId, huntId, key, retainA } = JSON.parse(arg);
for (const [name, value] of Object.entries({ playerId, huntId, key })) {
  if (typeof value !== "string" || !/^[a-f0-9-]{36}$/iu.test(value)) {
    throw new Error(`Invalid ${name} for disposable real-port restart test`);
  }
}
if (typeof retainA !== "boolean") throw new Error("retained release flag must be boolean");

const { HuntApplication } = await import("../src/hunts/application.ts");
const { createTask103RealHuntAuthority } = await import("./hunt-real-authority-test-fixture.ts");
const { authority: realPort } = await createTask103RealHuntAuthority({
  connectionString: databaseUrl,
  current: "B",
  retainA,
});
const calls = [];
const neverNew = async () => {
  calls.push("unexpected_new_authority");
  throw new Error("A retained checkpoint must not sample a new Start or effect authority");
};
const app = new HuntApplication(databaseUrl, {
  authority: {
    ...realPort,
    resolveStartSelector: neverNew,
    buildStartRuntime: neverNew,
    async loadPersistedRuntime(authorityRecord, schemaVersion) {
      calls.push("real_loadPersistedRuntime");
      try {
        return await realPort.loadPersistedRuntime(authorityRecord, schemaVersion);
      } catch (cause) {
        if (cause?.message === "persisted Hunt individualization authority is unavailable") {
          calls.push("historical_release_A_missing");
        }
        throw cause;
      }
    },
    async loadHistoricalEncounter(evidence) {
      calls.push("real_loadHistoricalEncounter");
      return realPort.loadHistoricalEncounter(evidence);
    },
    async currentBallAuthority() {
      calls.push("real_currentBallAuthority");
      return realPort.currentBallAuthority();
    },
    async ballAuthority(version) {
      calls.push("real_ballAuthority");
      return realPort.ballAuthority(version);
    },
    currentItemRule: neverNew,
    itemRule: neverNew,
    validatePolicyReferences: neverNew,
  },
  boundaryEffects: {
    automaticCapture: neverNew,
    reward: neverNew,
  },
  manualCaptureEffects: { attempt: neverNew },
}, { presentationSourceEnabled: true });

let completed = await app.checkpoint(playerId, key, huntId);
for (let attempt = 0; completed.httpStatus === 202 && attempt < 31; attempt += 1) {
  completed = await app.checkpoint(playerId, key, huntId);
}
if (completed.httpStatus === 202) {
  throw new Error("retained-authority checkpoint did not settle within the bounded test continuation limit");
}
const replay = await app.checkpoint(playerId, key, huntId);
process.stdout.write(JSON.stringify({ pid: process.pid, completed, replay, calls }) + "\n");
