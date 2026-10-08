import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { describe, it } from "vitest";
import { withPgClient } from "@pokenexus/database";
import type { RuntimeGameDataReader } from "@pokenexus/game-data/runtime";
import { createDefaultProductionCombatCatalogResolver, createMoveEligibilityContextLoader, createRuntimeMoveEligibilityGameDataLoader } from "../src/moves/context";
import { createConfiguredMoveAuthorities } from "../src/player/runtime";
import { localPrealphaBindings } from "../src/local-prealpha";
import { applyLocalStarterConversion, checkLocalStarterConversion, prepareLocalStarterConversion, type LocalStarterConversionPlan } from "../src/local-prealpha-starter-conversion";

const enabled = process.env.POKENEXUS_LOCAL_STARTER_CONVERSION === "1";
const digest = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const errorCode = (error: unknown) => error instanceof Error && "code" in error ? error.code : undefined;

async function writeOnce(path: string, text: string): Promise<void> {
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(text, "utf8");
    await file.sync();
  } finally { await file.close(); }
}

async function assertParentLifecycleLock(maintenance: string): Promise<void> {
  try {
    await lstat(resolve(maintenance, "state.json"));
    throw new Error("Application stack must be stopped");
  } catch (error) { if (errorCode(error) !== "ENOENT") throw error; }
  const lockPath = resolve(maintenance, "operation.lock");
  if (!(await lstat(lockPath)).isFile()) throw new Error("Missing lifecycle lock");
  let unavailable = false;
  try { const probe = await open(lockPath, "r"); await probe.close(); }
  catch (error) {
    if (!["EBUSY", "EACCES", "EPERM"].includes(String(errorCode(error)))) throw error;
    unavailable = true;
  }
  if (!unavailable) throw new Error("The parent must hold the exclusive Windows lifecycle lock");
}

describe.skipIf(!enabled)("SPEC-027 guarded local conversion operator", () => {
  it("runs only the explicitly requested stage with the application stack stopped", async () => {
    const root = resolve(process.cwd(), "../..");
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim();
    const project = resolve(common, "..");
    const maintenance = resolve(project, ".maintenance/prealpha-local");
    const expectedPlanPath = resolve(maintenance, "starter-level-five-conversion.plan.json");
    const planPath = process.env.POKENEXUS_CONVERSION_PLAN;
    const action = process.env.POKENEXUS_CONVERSION_ACTION;
    const connectionString = process.env.POKENEXUS_LOCAL_DATABASE_URL;
    if (root !== resolve(project, ".worktrees/TASK-122-local-prealpha-environment-runbook") || planPath !== expectedPlanPath ||
      connectionString !== "postgresql://pokenexus:pokenexus_local@127.0.0.1:55432/pokenexus_local_prealpha" ||
      !["Plan", "Apply", "Check"].includes(action ?? "")) throw new Error("Invalid bounded local conversion invocation");
    const applyAuthorization = process.env.POKENEXUS_CONVERSION_APPLY_AUTHORIZATION;
    if ((action === "Apply" && applyAuthorization !== "SPEC-027:2026-10-07T16:05:58Z") ||
      (action !== "Apply" && applyAuthorization)) throw new Error("Apply requires explicit authorization for the frozen local plan");
    if (await realpath(dirname(planPath)) !== maintenance) throw new Error("Private plan directory must not be redirected");
    await assertParentLifecycleLock(maintenance);

    const sourcePaths = ["apps/api/src/local-prealpha-starter-conversion.ts", "apps/api/integration/local-prealpha-starter-conversion-operator.test.ts",
      "scripts/local-prealpha-starter-conversion.ps1", "docs/specs/SPEC-027-starter-level-five-bootstrap-amendment.md",
      "docs/qa/PREALPHA_GENETIC_PROFILE_RELEASES.json"];
    const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async (path) => [path, digest(await readFile(resolve(root, path)))])));
    const reader: RuntimeGameDataReader = { async read(path) { return new Uint8Array(await readFile(resolve(root, "packages/game-data/published", path))); } };
    const env = localPrealphaBindings({ LOCAL_PREALPHA_ENABLED: "1", LOCAL_PREALPHA_CURSOR_HMAC_KEY: "local-conversion-context-no-session-or-secret",
      HYPERDRIVE: { connectionString } });
    const context = await createMoveEligibilityContextLoader({ ...createConfiguredMoveAuthorities(env),
      gameData: createRuntimeMoveEligibilityGameDataLoader(reader), productionCatalogs: createDefaultProductionCombatCatalogResolver(),
    }).loadForNewOperation();

    if (action === "Plan") {
      const plan = await withPgClient({ connectionString }, (client) => prepareLocalStarterConversion(client, context, new Date().toISOString()));
      const raw = JSON.stringify({ sourceHashes, plan }, null, 2) + "\n";
      await writeOnce(planPath, raw);
      process.stdout.write("CONVERSION_PLAN=" + JSON.stringify({ sha256: digest(raw), protectedTables: Object.keys(plan.protectedHashes).length,
        targets: plan.after.map(({ pokemon, vitality, moves }) => ({ pokemonId: pokemon.pokemon_instance_id, level: pokemon.level, xp: pokemon.total_experience, hp: vitality.current_hp, moveCount: moves.length })) }) + "\n");
      return;
    }

    if (!(await lstat(planPath)).isFile() || (await lstat(planPath)).isSymbolicLink()) throw new Error("Plan must be a regular private file");
    const raw = await readFile(planPath, "utf8");
    const planSha256 = digest(raw);
    if (planSha256 !== process.env.POKENEXUS_CONVERSION_PLAN_SHA256) throw new Error("Private conversion plan digest mismatch");
    const envelope = JSON.parse(raw) as { sourceHashes: Record<string, string>; plan: LocalStarterConversionPlan };
    if (!isDeepStrictEqual(sourceHashes, envelope.sourceHashes)) throw new Error("Conversion source differs from frozen plan");
    let status: "checked" | "applied" | "replayed" = "checked";
    if (action === "Apply") {
      await assertParentLifecycleLock(maintenance);
      status = await withPgClient({ connectionString }, (client) => applyLocalStarterConversion(client, envelope.plan, context));
    }
    await withPgClient({ connectionString }, (client) => checkLocalStarterConversion(client, envelope.plan, context));
    const receiptPath = planPath.replace(/\.plan\.json$/u, ".receipt.json");
    const receipt = JSON.stringify({ version: "local-starter-conversion-receipt-v1", planSha256, verifiedAfter: true }, null, 2) + "\n";
    try { await writeOnce(receiptPath, receipt); }
    catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      if (await readFile(receiptPath, "utf8") !== receipt) throw new Error("Existing conversion receipt mismatch", { cause: error });
    }
    process.stdout.write("CONVERSION_RESULT=" + JSON.stringify({ status, planSha256, verifiedAfter: true,
      protectedTables: Object.keys(envelope.plan.protectedHashes).length }) + "\n");
  }, 60_000);
});
