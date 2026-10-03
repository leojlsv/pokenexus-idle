import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalJson, sha256, sourceInventoryHash } from "./canonical.js";
import { verifyLocalSourceSnapshot } from "./local-source-snapshot.js";
import { parseSourceRecord } from "./schema.js";
import {
  finalizeSourceSnapshotRecordV5,
  parseProvenanceManifestV5,
  parseSourceSnapshotRecordV5,
  sourceRecordV5FromSnapshotFile,
  sourceSnapshotHashV5,
} from "./source-snapshot-v5.js";

const roots: string[] = [];
const REVISION = "a".repeat(40);
const ACQUIRED_AT = "2026-10-02T21:34:09.000Z";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function locator(path: string): string {
  return `https://github.com/PokeAPI/pokeapi/blob/${REVISION}/${path}`;
}

async function snapshotFixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "pokenexus-source-snapshot-"));
  roots.push(root);
  const descriptors = [];
  for (const [logicalPath, content] of Object.entries(files)) {
    const path = join(root, ...logicalPath.split("/"));
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, content, "utf8");
    descriptors.push({
      logicalPath,
      sourceLocator: locator(logicalPath),
      sourceContentHash: sha256(Buffer.from(content, "utf8")),
    });
  }
  const record = finalizeSourceSnapshotRecordV5({
    provider: "pokeapi",
    upstreamRevision: REVISION,
    acquiredAt: ACQUIRED_AT,
    files: descriptors,
  });
  await writeFile(join(root, "source-snapshot.json"), canonicalJson(record), "utf8");
  return { root, record };
}

describe("schema-5 source snapshots", () => {
  it("hashes the canonical snapshot preimage independently of input file order", () => {
    const files = [
      { logicalPath: "data/v2/csv/b.csv", sourceLocator: locator("data/v2/csv/b.csv"), sourceContentHash: `sha256:${"b".repeat(64)}` },
      { logicalPath: "data/v2/csv/a.csv", sourceLocator: locator("data/v2/csv/a.csv"), sourceContentHash: `sha256:${"a".repeat(64)}` },
    ];
    const input = { provider: "pokeapi" as const, upstreamRevision: REVISION, acquiredAt: ACQUIRED_AT, files };
    expect(sourceSnapshotHashV5(input)).toBe(sourceSnapshotHashV5({ ...input, files: [...files].reverse() }));
    expect(sourceSnapshotHashV5(input)).not.toBe(
      sourceSnapshotHashV5({ ...input, acquiredAt: "2026-10-02T21:35:09.000Z" }),
    );
  });

  it("verifies exact local bytes and fails closed on hash drift before parsing", async () => {
    const logicalPath = "data/v2/csv/move_flags.csv";
    const fixture = await snapshotFixture({ [logicalPath]: "id,identifier\n1,contact\n" });
    const verified = await verifyLocalSourceSnapshot(fixture.root);
    expect(verified.record.id).toBe(fixture.record.id);

    await writeFile(join(fixture.root, ...logicalPath.split("/")), "id,identifier\n1,changed\n", "utf8");
    await expect(verifyLocalSourceSnapshot(fixture.root)).rejects.toThrow(/hash mismatch/);
  });

  it("rejects mutable PokéAPI revisions and manifest hash/id tampering", () => {
    const record = finalizeSourceSnapshotRecordV5({
      provider: "pokeapi",
      upstreamRevision: REVISION,
      acquiredAt: ACQUIRED_AT,
      files: [{
        logicalPath: "data/v2/csv/moves.csv",
        sourceLocator: locator("data/v2/csv/moves.csv"),
        sourceContentHash: `sha256:${"c".repeat(64)}`,
      }],
    });
    expect(() => parseSourceSnapshotRecordV5({ ...record, upstreamRevision: "main" })).toThrow(/40-character/);
    expect(() => parseSourceSnapshotRecordV5({ ...record, snapshotHash: `sha256:${"d".repeat(64)}` })).toThrow(/canonical snapshot preimage/);
    expect(() => parseSourceSnapshotRecordV5({ ...record, id: "source-snapshot:pokeapi:wrong" })).toThrow(/provider \+ snapshotHash/);
    expect(() => parseSourceSnapshotRecordV5({
      ...record,
      files: [{ ...record.files[0], sourceLocator: `https://github.com/Other/repo/blob/${REVISION}/data/v2/csv/moves.csv` }],
    })).toThrow(/PokeAPI\/pokeapi/);
    expect(() => parseSourceSnapshotRecordV5({
      ...record,
      files: [{ ...record.files[0], sourceLocator: `https://github.com/PokeAPI/pokeapi/blob/${REVISION}/data/v2/csv/other.csv` }],
    })).toThrow(/exact logicalPath/);
    expect(() => parseSourceSnapshotRecordV5({
      ...record,
      files: [{ ...record.files[0], logicalPath: "../moves.csv" }],
    })).toThrow(/relative normalized path/);
  });

  it("binds multi-file Move evidence to exact snapshot files while historical schema-3 still rejects pokeapi", async () => {
    const fixture = await snapshotFixture({
      "data/v2/csv/move_flags.csv": "id,identifier\n1,contact\n",
      "data/v2/csv/move_flag_map.csv": "move_id,move_flag_id\n1,1\n",
    });
    const flags = sourceRecordV5FromSnapshotFile(fixture.record, "data/v2/csv/move_flags.csv", "pokeapi-csv-v1");
    const map = sourceRecordV5FromSnapshotFile(fixture.record, "data/v2/csv/move_flag_map.csv", "pokeapi-csv-v1");
    const provenance = parseProvenanceManifestV5({
      sourceSnapshots: [fixture.record],
      sourceRecords: [flags, map],
      factSources: [],
      moveFactSources: [{
        moveId: "tackle",
        mainline: { selectedGame: "scarlet-violet", sourceRecordIds: [map.id] },
        sourceTargetSourceRecordIds: [map.id],
        makesContactSourceRecordIds: [map.id, flags.id],
        zaBaseCooldownSourceRecordIds: [flags.id],
      }],
      inventories: [],
      sourceInventoryHash: sourceInventoryHash([]),
    });
    expect(provenance.moveFactSources[0].makesContactSourceRecordIds).toHaveLength(2);
    expect(() => parseProvenanceManifestV5({
      ...provenance,
      provenanceHash: undefined,
      sourceRecords: [{ ...flags, acquiredAt: "2026-10-02T22:34:09.000Z" }, map],
    })).toThrow(/must match snapshot acquisition timestamp/);
    expect(() => parseSourceRecord({
      id: "legacy",
      provider: "pokeapi",
      canonicalUrl: locator("data/v2/csv/moves.csv"),
      fetchedAt: ACQUIRED_AT,
      parserVersion: "legacy",
      sourceContentHash: `sha256:${"0".repeat(64)}`,
      fetchStatus: "fetched",
    })).toThrow(/sourceRecord\.provider/);
  });
});
