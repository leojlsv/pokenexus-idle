import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { canonicalJson } from "./canonical-json.js";
import { sha256 } from "./canonical.js";
import {
  parseSourceSnapshotRecordV5,
  type SourceSnapshotFileV5,
  type SourceSnapshotRecordV5,
} from "./source-snapshot-v5.js";

export const SOURCE_SNAPSHOT_MANIFEST = "source-snapshot.json" as const;

export interface VerifiedLocalSourceSnapshot {
  root: string;
  manifestPath: string;
  record: SourceSnapshotRecordV5;
}

function localPath(root: string, logicalPath: string): string {
  const normalizedRoot = resolve(root);
  const candidate = resolve(normalizedRoot, logicalPath);
  const rel = relative(normalizedRoot, candidate);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`snapshot logicalPath escapes root: ${logicalPath}`);
  }
  return candidate;
}

function assertWithinRoot(root: string, candidate: string, label: string): void {
  const rel = relative(root, candidate);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${label} resolves outside snapshot root`);
  }
}

async function assertFileHash(root: string, file: SourceSnapshotFileV5): Promise<void> {
  const path = localPath(root, file.logicalPath);
  let linkMetadata;
  try {
    linkMetadata = await lstat(path);
  } catch (error) {
    throw new Error(`snapshot file is missing: ${file.logicalPath}`, { cause: error });
  }
  if (linkMetadata.isSymbolicLink()) {
    throw new Error(`snapshot file must not be a symbolic link: ${file.logicalPath}`);
  }
  const resolvedPath = await realpath(path);
  assertWithinRoot(root, resolvedPath, `snapshot file ${file.logicalPath}`);
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error(`snapshot entry is not a file: ${file.logicalPath}`);
  const bytes = await readFile(path);
  const actual = sha256(bytes);
  if (actual !== file.sourceContentHash) {
    throw new Error(`snapshot file hash mismatch for ${file.logicalPath}`);
  }
}

export async function verifyLocalSourceSnapshot(root: string): Promise<VerifiedLocalSourceSnapshot> {
  const normalizedRoot = await realpath(resolve(root));
  const manifestPath = resolve(normalizedRoot, SOURCE_SNAPSHOT_MANIFEST);
  const manifestMetadata = await lstat(manifestPath);
  if (manifestMetadata.isSymbolicLink()) throw new Error("source snapshot manifest must not be a symbolic link");
  const manifestBytes = await readFile(manifestPath);
  const text = manifestBytes.toString("utf8");
  const parsed = JSON.parse(text) as unknown;
  if (canonicalJson(parsed) !== text) {
    throw new Error("source snapshot manifest must be canonical JSON");
  }
  const record = parseSourceSnapshotRecordV5(parsed);
  for (const file of record.files) await assertFileHash(normalizedRoot, file);
  return { root: normalizedRoot, manifestPath, record };
}

export async function readVerifiedSnapshotFile(
  snapshot: VerifiedLocalSourceSnapshot,
  logicalPath: string,
): Promise<Buffer> {
  const normalizedLogicalPath = logicalPath.normalize("NFC").replaceAll("\\", "/");
  const descriptor = snapshot.record.files.find((entry) => entry.logicalPath === normalizedLogicalPath);
  if (!descriptor) throw new Error(`snapshot manifest does not contain ${normalizedLogicalPath}`);
  const bytes = await readFile(localPath(snapshot.root, normalizedLogicalPath));
  if (sha256(bytes) !== descriptor.sourceContentHash) {
    throw new Error(`snapshot file hash mismatch for ${normalizedLogicalPath}`);
  }
  return bytes;
}
