import { describe, expect, it } from "vitest";
import {
  artifactDescriptor,
  bundleHash,
  canonicalJson,
  canonicalizeCandidateArtifacts,
  provenanceHash,
  sha256,
} from "./canonical";
import { candidateFixture, speciesFixture } from "./test-fixtures";

describe("canonical serialization and hashes", () => {
  it("orders object keys recursively and NFC-normalizes canonical strings", () => {
    const decomposed = "Cafe\u0301";
    expect(canonicalJson({ z: decomposed, a: { y: 2, x: 1 } })).toBe(
      '{"a":{"x":1,"y":2},"z":"Café"}',
    );
  });

  it("rejects unsupported JSON values instead of silently changing the hash preimage", () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow();
    expect(() => canonicalJson({ value: undefined })).toThrow();
    expect(() => canonicalJson({ value: BigInt(1) })).toThrow();
  });

  it("uses the required lowercase sha256: representation", () => {
    expect(sha256(Buffer.from("abc", "utf8"))).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("sorts catalog records by canonical identity before hashing", () => {
    const candidateA = candidateFixture();
    candidateA.catalogs.species = [
      speciesFixture({
        id: "species-z" as never,
        sourceName: "Z",
        sourceSlug: "z",
      }),
      speciesFixture(),
    ];
    const candidateB = candidateFixture();
    candidateB.catalogs.species = [...candidateA.catalogs.species].reverse();

    expect(canonicalizeCandidateArtifacts(candidateA).species.bytes).toEqual(
      canonicalizeCandidateArtifacts(candidateB).species.bytes,
    );
  });

  it("computes deterministic artifact descriptors", () => {
    const descriptor = artifactDescriptor(
      "catalogs/species",
      Buffer.from("[]"),
      0,
    );
    expect(descriptor).toEqual({
      logicalName: "catalogs/species",
      contentHash:
        "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      recordCount: 0,
    });
  });

  it("hashes provenance without its own hash field", () => {
    const provenance = candidateFixture().provenance;
    const one = provenanceHash(provenance);
    const two = provenanceHash({ ...provenance, provenanceHash: one });
    expect(one).toBe(two);
  });

  it("hashes mixed-provider provenance deterministically without a manifest-wide provider", () => {
    const provenance = candidateFixture().provenance;
    provenance.sourceRecords[0] = {
      ...provenance.sourceRecords[0],
      provider: "bulbapedia",
      canonicalUrl: "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)",
    };
    const reversed = {
      ...provenance,
      sourceRecords: [...provenance.sourceRecords].reverse(),
    };
    expect(provenanceHash(provenance)).toBe(provenanceHash(reversed));
  });

  it("binds Move fact-source roles into provenanceHash while ignoring relation array order", () => {
    const provenance = candidateFixture().provenance;
    const duplicated = {
      ...provenance,
      moveFactSources: [
        ...provenance.moveFactSources,
        {
          ...provenance.moveFactSources[0],
          moveId: "z-move" as never,
        },
      ],
    };
    const reversed = {
      ...duplicated,
      moveFactSources: [...duplicated.moveFactSources].reverse(),
    };
    expect(provenanceHash(duplicated)).toBe(provenanceHash(reversed));

    const changed = {
      ...duplicated,
      moveFactSources: duplicated.moveFactSources.map((entry, index) =>
        index === 0
          ? {
              ...entry,
              zaBaseCooldownSourceRecordId: "source:bulbapedia:other-z-a",
            }
          : entry,
      ),
    };
    expect(provenanceHash(changed)).not.toBe(provenanceHash(duplicated));
  });

  it("uses the exact SPEC-002 BundleHashInput and logical-name ordering", () => {
    const artifacts = [
      {
        logicalName: "z",
        contentHash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        recordCount: 2,
      },
      {
        logicalName: "a",
        contentHash:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        recordCount: 1,
      },
    ] as const;
    const provenance =
      "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    expect(bundleHash("3", "opaque-version", [...artifacts], provenance)).toBe(
      sha256(
        Buffer.from(
          canonicalJson({
            schemaVersion: "3",
            gameDataVersion: "opaque-version",
            artifacts: [...artifacts].reverse(),
            provenanceHash: provenance,
          }),
          "utf8",
        ),
      ),
    );
  });

  it("reproduces byte-identical artifacts and hashes for identical logical input", () => {
    const first = canonicalizeCandidateArtifacts(candidateFixture());
    const second = canonicalizeCandidateArtifacts(candidateFixture());
    expect(Object.keys(first)).toEqual(Object.keys(second));
    for (const key of Object.keys(first) as Array<keyof typeof first>) {
      expect(first[key].bytes).toEqual(second[key].bytes);
      expect(first[key].descriptor).toEqual(second[key].descriptor);
    }
  });
});
