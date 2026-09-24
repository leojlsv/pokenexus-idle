import { createHash } from "node:crypto";
import { copyFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const APPROVED_V1_SHA256 = "1462b33b35e38224b505240dbf5205104e98dae1310d0bc630e2aa02fb31879e";
const APPROVED_V2_SHA256 = "6a578d7408c79b7984b5b6640be42dbbb43459f859ffe31ce79880d72d159b57";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(packageRoot, "../..");
const docsArtifactPath = resolve(repositoryRoot, "docs/specs/SPEC-012-production-move-support-v1.json");
const sourceArtifactV1Path = resolve(packageRoot, "src/production-move-support-v1.json");
const distArtifactV1Path = resolve(packageRoot, "dist/production-move-support-v1.json");
const sourceArtifactV2Path = resolve(packageRoot, "src/production-move-support-v2.json");
const distArtifactV2Path = resolve(packageRoot, "dist/production-move-support-v2.json");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertApproved(bytes, expectedSha256, label) {
  const actual = sha256(bytes);
  if (actual !== expectedSha256) {
    throw new Error(`${label} SHA-256 mismatch: expected ${expectedSha256}, got ${actual}`);
  }
}

const [docsBytes, sourceV1Bytes, sourceV2Bytes] = await Promise.all([
  readFile(docsArtifactPath),
  readFile(sourceArtifactV1Path),
  readFile(sourceArtifactV2Path),
]);

assertApproved(docsBytes, APPROVED_V1_SHA256, "docs SPEC-012 support artifact");
assertApproved(sourceV1Bytes, APPROVED_V1_SHA256, "game-core source v1 support artifact");
assertApproved(sourceV2Bytes, APPROVED_V2_SHA256, "game-core source v2 support artifact");
if (!docsBytes.equals(sourceV1Bytes)) {
  throw new Error("docs SPEC-012 support artifact and game-core source support artifact differ byte-for-byte");
}

await Promise.all([
  copyFile(sourceArtifactV1Path, distArtifactV1Path),
  copyFile(sourceArtifactV2Path, distArtifactV2Path),
]);

const [distV1Bytes, distV2Bytes] = await Promise.all([
  readFile(distArtifactV1Path),
  readFile(distArtifactV2Path),
]);
assertApproved(distV1Bytes, APPROVED_V1_SHA256, "game-core dist v1 support artifact");
assertApproved(distV2Bytes, APPROVED_V2_SHA256, "game-core dist v2 support artifact");
if (!sourceV1Bytes.equals(distV1Bytes)) {
  throw new Error("game-core dist v1 support artifact does not match source bytes after copy");
}
if (!sourceV2Bytes.equals(distV2Bytes)) {
  throw new Error("game-core dist v2 support artifact does not match source bytes after copy");
}

process.stdout.write(
  `production Move support artifacts finalized: v1 sha256:${APPROVED_V1_SHA256}; v2 sha256:${APPROVED_V2_SHA256}\n`,
);
