import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outdir = join(root, ".tmp-game-data-worker-compat");

try {
  const pnpmArgs = [
    "pnpm",
    "--filter",
    "@pokenexus/realtime",
    "exec",
    "wrangler",
    "deploy",
    "../../packages/game-data/integration/worker-bundle-entry.ts",
    "--dry-run",
    "--outdir",
    "../../.tmp-game-data-worker-compat",
    "--name",
    "pokenexus-game-data-runtime-smoke",
    "--compatibility-date",
    "2026-09-21",
  ];
  const result = process.platform === "win32"
    ? spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `& corepack ${pnpmArgs.join(" ")}`,
        ],
        { cwd: root, encoding: "utf8" },
      )
    : spawnSync("corepack", pnpmArgs, { cwd: root, encoding: "utf8" });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  await rm(outdir, { recursive: true, force: true });
}
