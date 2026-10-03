import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { bundleHash, canonicalJson, sha256 } from "./canonical.js";
import { canonicalizePveContentArtifacts } from "./pve-content-canonical.js";
import {
  assertTask109PveV5PublicationContract,
  type StagedTask109PveV5Candidate,
  type Task109PveReview,
  type Task109PveV5StageManifest,
} from "./pve-restaging-v5.js";

async function reviewedCandidate(): Promise<StagedTask109PveV5Candidate> {
  const root = resolve(process.cwd(), "reviews/task-109");
  const manifest = JSON.parse(await readFile(
    resolve(root, "prealpha-wilds-v5-candidate-manifest.json"),
    "utf8",
  )) as Task109PveV5StageManifest;
  const review = JSON.parse(await readFile(
    resolve(root, "prealpha-wilds-v5-human-review.json"),
    "utf8",
  )) as Task109PveReview;
  return {
    directory: "not-used-by-contract-check",
    manifest,
    review,
    reviewHash: manifest.reviewHash,
    stageManifestHash: sha256(Buffer.from(canonicalJson(manifest), "utf8")),
  };
}

describe("TASK-109 schema-5 publication contract", () => {
  it("accepts the exact generated review/candidate evidence", async () => {
    const staged = await reviewedCandidate();
    expect(() => assertTask109PveV5PublicationContract(staged)).not.toThrow();
  });

  it("rejects a semantically widened review even when generic candidate identity fields remain intact", async () => {
    const staged = await reviewedCandidate();
    const tampered = structuredClone(staged);
    tampered.review.authoredContentAuthority.itemIds = [
      ...tampered.review.authoredContentAuthority.itemIds,
      "pokenexus:item:unexpected:v1",
    ];
    expect(() => assertTask109PveV5PublicationContract(tampered))
      .toThrow(/authored content authority/);
  });

  it("rejects review distribution or commitment substitution before generic publication", async () => {
    const distributionTamper = await reviewedCandidate();
    distributionTamper.review.distribution.levelMarginalWeights["1"] = 4_999;
    expect(() => assertTask109PveV5PublicationContract(distributionTamper))
      .toThrow(/distribution evidence/);

    const commitmentTamper = await reviewedCandidate();
    commitmentTamper.review.contentCommitmentHash = `sha256:${"0".repeat(64)}`;
    expect(() => assertTask109PveV5PublicationContract(commitmentTamper))
      .toThrow(/full staged candidate identity/);
  });

  it("rejects Wilds topology, admission-gate, or recovery substitution", async () => {
    const recoveryTamper = await reviewedCandidate();
    recoveryTamper.review.hunts[0]!.recoveryDurationMs = 60_000;
    expect(() => assertTask109PveV5PublicationContract(recoveryTamper))
      .toThrow(/Wilds Hunt identity\/availability\/recovery/);

    const gateTamper = await reviewedCandidate();
    gateTamper.review.hunts[0]!.availability.playerLevelMin = 2;
    expect(() => assertTask109PveV5PublicationContract(gateTamper))
      .toThrow(/Wilds Hunt identity\/availability\/recovery/);

    const topologyTamper = await reviewedCandidate();
    topologyTamper.review.zones.push(structuredClone(topologyTamper.review.zones[0]!));
    expect(() => assertTask109PveV5PublicationContract(topologyTamper))
      .toThrow(/exactly one Zone/);
  });

  it("rejects semantic review-to-artifact decoupling even when candidate hashes are rebound", async () => {
    const staged = await reviewedCandidate();
    const alternateContent = structuredClone({
      zones: staged.review.zones,
      hunts: staged.review.hunts,
      encounters: staged.review.encounters,
    });
    alternateContent.hunts[0]!.recoveryDurationMs = 60_000;
    const alternateHunts = canonicalizePveContentArtifacts(alternateContent).hunts.descriptor;
    staged.manifest.artifacts = staged.manifest.artifacts.map((descriptor) =>
      descriptor.logicalName === alternateHunts.logicalName ? alternateHunts : descriptor);
    staged.manifest.candidateBundleHash = bundleHash(
      staged.manifest.schemaVersion,
      staged.manifest.candidateGameDataVersion,
      staged.manifest.artifacts,
      staged.manifest.provenanceHash,
    );
    staged.review.candidateBundleHash = staged.manifest.candidateBundleHash;
    staged.reviewHash = sha256(Buffer.from(canonicalJson(staged.review), "utf8"));
    staged.manifest.reviewHash = staged.reviewHash;
    staged.stageManifestHash = sha256(Buffer.from(canonicalJson(staged.manifest), "utf8"));

    expect(() => assertTask109PveV5PublicationContract(staged))
      .toThrow(/does not match the staged PvE artifact descriptor/);
  });

  it("rejects duplicate accepted item drops even when review and staged artifact hashes are rebound", async () => {
    const staged = await reviewedCandidate();
    const alternateContent = structuredClone({
      zones: staged.review.zones,
      hunts: staged.review.hunts,
      encounters: staged.review.encounters,
    });
    alternateContent.encounters[0]!.reward.itemDrops.push(
      structuredClone(alternateContent.encounters[0]!.reward.itemDrops[0]!),
    );
    staged.review.encounters = alternateContent.encounters;
    const alternateEncounters = canonicalizePveContentArtifacts(alternateContent).encounters.descriptor;
    staged.manifest.artifacts = staged.manifest.artifacts.map((descriptor) =>
      descriptor.logicalName === alternateEncounters.logicalName ? alternateEncounters : descriptor);
    staged.manifest.candidateBundleHash = bundleHash(
      staged.manifest.schemaVersion,
      staged.manifest.candidateGameDataVersion,
      staged.manifest.artifacts,
      staged.manifest.provenanceHash,
    );
    staged.review.candidateBundleHash = staged.manifest.candidateBundleHash;
    staged.reviewHash = sha256(Buffer.from(canonicalJson(staged.review), "utf8"));
    staged.manifest.reviewHash = staged.reviewHash;
    staged.stageManifestHash = sha256(Buffer.from(canonicalJson(staged.manifest), "utf8"));

    expect(() => assertTask109PveV5PublicationContract(staged))
      .toThrow(/exactly two independent drops/);
  });
});
