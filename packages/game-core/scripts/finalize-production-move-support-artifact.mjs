import { createHash } from "node:crypto";
import { copyFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const APPROVED_SHA256 = "1462b33b35e38224b505240dbf5205104e98dae1310d0bc630e2aa02fb31879e";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(packageRoot, "../..");
const docsArtifactPath = resolve(repositoryRoot, "docs/specs/SPEC-012-production-move-support-v1.json");
const sourceArtifactPath = resolve(packageRoot, "src/production-move-support-v1.json");
const distArtifactPath = resolve(packageRoot, "dist/production-move-support-v1.json");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertApproved(bytes, label) {
  const actual = sha256(bytes);
  if (actual !== APPROVED_SHA256) {
    throw new Error(`${label} SHA-256 mismatch: expected ${APPROVED_SHA256}, got ${actual}`);
  }
}

const [docsBytes, sourceBytes] = await Promise.all([
  readFile(docsArtifactPath),
  readFile(sourceArtifactPath),
]);

assertApproved(docsBytes, "docs SPEC-012 support artifact");
assertApproved(sourceBytes, "game-core source support artifact");
if (!docsBytes.equals(sourceBytes)) {
  throw new Error("docs SPEC-012 support artifact and game-core source support artifact differ byte-for-byte");
}

await copyFile(sourceArtifactPath, distArtifactPath);

const distBytes = await readFile(distArtifactPath);
assertApproved(distBytes, "game-core dist support artifact");
if (!sourceBytes.equals(distBytes)) {
  throw new Error("game-core dist support artifact does not match source bytes after copy");
}

process.stdout.write(`production Move support artifact finalized: sha256:${APPROVED_SHA256}\n`);
