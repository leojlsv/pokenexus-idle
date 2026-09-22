import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { finalizeProvenance } from "./canonical.js";
import {
  loadPublishedBundle,
  stageCandidate,
  validatePublicationReadiness,
} from "./publication.js";
import { validateCandidatePublicationSanity } from "./publication-sanity.js";
import type { MappingRegistry } from "./schema.js";
import { mappingRegistryFixture, publishableCandidateFixture } from "./test-fixtures.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function refinalize(candidate: ReturnType<typeof publishableCandidateFixture>) {
  candidate.provenance = finalizeProvenance({
    sourceRecords: candidate.provenance.sourceRecords,
    moveFactSources: candidate.provenance.moveFactSources,
    inventories: candidate.provenance.inventories,
  });
  return candidate;
}

function findingCodes(
  candidate: ReturnType<typeof publishableCandidateFixture>,
  registry = mappingRegistryFixture(),
): string[] {
  return validateCandidatePublicationSanity(candidate, registry).map((entry) => entry.code);
}

describe("publication sanity", () => {
  it("accepts the canonical publishable fixture", () => {
    expect(
      validateCandidatePublicationSanity(publishableCandidateFixture(), mappingRegistryFixture()),
    ).toEqual([]);
  });

  it("accepts the Human-approved published v2 with the canonical mapping roster", async () => {
    const publishedRoot = join(import.meta.dirname, "..", "published");
    const loaded = await loadPublishedBundle(publishedRoot, "game-data-core-kanto-johto-v2");
    const roster = JSON.parse(
      await readFile(join(import.meta.dirname, "canonical-mapping-roster.json"), "utf8"),
    ) as { mappings: MappingRegistry };

    expect(validateCandidatePublicationSanity(loaded.candidate, roster.mappings)).toEqual([]);
    expect(validatePublicationReadiness(loaded.candidate, roster.mappings)).toEqual([]);
  });

  it("detects missing Species/Move Learnset closure", () => {
    const candidate = publishableCandidateFixture();
    candidate.catalogs.learnsets = [];
    const inventory = candidate.provenance.inventories.find(
      (entry) => entry.surface === "learnsets",
    );
    if (!inventory) throw new Error("Learnset inventory fixture missing");
    inventory.discoveredSourceKeys = [];
    inventory.acceptedMappingKeys = [];
    inventory.extractedSourceKeys = [];
    inventory.normalizedSourceKeys = [];
    refinalize(candidate);

    expect(findingCodes(candidate)).toEqual(
      expect.arrayContaining([
        "sanity-species-missing-learnset",
        "sanity-species-learnset-context",
        "sanity-move-unreferenced-by-learnset",
      ]),
    );
  });

  it("detects mixed Learnset source contexts for one Species", () => {
    const candidate = publishableCandidateFixture();
    const second = {
      ...candidate.catalogs.learnsets[0],
      sourceGeneration: 8,
      sourceGame: "Sword/Shield",
      method: "tutor" as const,
      level: null,
      machineIdentifier: null,
    };
    candidate.catalogs.learnsets.push(second);
    const inventory = candidate.provenance.inventories.find(
      (entry) => entry.surface === "learnsets",
    );
    if (!inventory) throw new Error("Learnset inventory fixture missing");
    const key = JSON.stringify(["alpha", "tackle", 8, "Sword/Shield", "tutor", null, null]);
    inventory.discoveredSourceKeys.push(key);
    inventory.acceptedMappingKeys.push(key);
    inventory.extractedSourceKeys.push(key);
    inventory.normalizedSourceKeys.push(key);
    refinalize(candidate);

    expect(findingCodes(candidate)).toContain("sanity-species-learnset-context");
  });

  it("detects accepted Learnset inventory drift at equal row count", () => {
    const candidate = publishableCandidateFixture();
    const inventory = candidate.provenance.inventories.find(
      (entry) => entry.surface === "learnsets",
    );
    if (!inventory) throw new Error("Learnset inventory fixture missing");
    const wrongKey = JSON.stringify([
      "alpha",
      "wrong-move",
      9,
      "Scarlet/Violet",
      "level-up",
      1,
      null,
    ]);
    inventory.discoveredSourceKeys = [wrongKey];
    inventory.acceptedMappingKeys = [wrongKey];
    inventory.extractedSourceKeys = [wrongKey];
    inventory.normalizedSourceKeys = [wrongKey];
    refinalize(candidate);

    expect(findingCodes(candidate)).toContain("sanity-learnset-inventory-parity");
  });

  it("detects a machine identifier conflict inside one game context", () => {
    const candidate = publishableCandidateFixture();
    const registry = mappingRegistryFixture();
    const tackle = candidate.catalogs.moves[0];
    const growlId = "growl" as typeof tackle.id;
    candidate.catalogs.moves.push({ ...tackle, id: growlId });
    registry.moves.push({
      sourceKey: "growl",
      canonicalId: growlId,
      status: "accepted",
    });

    candidate.catalogs.learnsets[0] = {
      ...candidate.catalogs.learnsets[0],
      method: "machine",
      level: null,
      machineIdentifier: "TM01",
    };
    candidate.catalogs.learnsets.push({
      ...candidate.catalogs.learnsets[0],
      moveId: growlId,
    });
    const inventory = candidate.provenance.inventories.find(
      (entry) => entry.surface === "learnsets",
    );
    if (!inventory) throw new Error("Learnset inventory fixture missing");
    const keys = [
      JSON.stringify(["alpha", "tackle", 9, "Scarlet/Violet", "machine", null, "TM01"]),
      JSON.stringify(["alpha", "growl", 9, "Scarlet/Violet", "machine", null, "TM01"]),
    ];
    inventory.discoveredSourceKeys = [...keys];
    inventory.acceptedMappingKeys = [...keys];
    inventory.extractedSourceKeys = [...keys];
    inventory.normalizedSourceKeys = [...keys];
    refinalize(candidate);

    expect(findingCodes(candidate, registry)).toContain("sanity-machine-context-conflict");
  });

  it("detects Learnset provenance reused across different National Dex identities", () => {
    const candidate = publishableCandidateFixture();
    const registry = mappingRegistryFixture();
    const base = candidate.catalogs.species[0];
    const betaId = "species-beta" as typeof base.id;
    candidate.catalogs.species.push({
      ...base,
      id: betaId,
      sourceName: "Beta",
      sourceSlug: "beta",
      nationalDexNumber: 2,
      sourceRecordIds: ["source:species:beta"],
    });
    candidate.provenance.sourceRecords.push({
      ...candidate.provenance.sourceRecords[0],
      id: "source:species:beta",
      canonicalUrl: "https://pokemondb.net/pokedex/beta",
    });
    registry.species.push({
      sourceKey: "beta",
      canonicalId: betaId,
      baseSpeciesId: null,
      status: "accepted",
    });
    candidate.catalogs.learnsets.push({
      ...candidate.catalogs.learnsets[0],
      speciesId: betaId,
    });
    const inventory = candidate.provenance.inventories.find(
      (entry) => entry.surface === "learnsets",
    );
    if (!inventory) throw new Error("Learnset inventory fixture missing");
    const betaKey = JSON.stringify(["beta", "tackle", 9, "Scarlet/Violet", "level-up", 1, null]);
    inventory.discoveredSourceKeys.push(betaKey);
    inventory.acceptedMappingKeys.push(betaKey);
    inventory.extractedSourceKeys.push(betaKey);
    inventory.normalizedSourceKeys.push(betaKey);
    refinalize(candidate);

    expect(findingCodes(candidate, registry)).toContain("sanity-learnset-provenance-cross-dex");
  });

  it("detects unexplained unreferenced provenance", () => {
    const candidate = publishableCandidateFixture();
    candidate.provenance.sourceRecords.push({
      id: "source:orphan",
      provider: "pokemondb",
      canonicalUrl: "https://pokemondb.net/orphan",
      fetchedAt: "2026-09-18T00:00:00.000Z",
      parserVersion: "pokemondb-v1",
      sourceContentHash: "sha256:abababababababababababababababababababababababababababababababab",
      fetchStatus: "fetched",
    });
    refinalize(candidate);

    expect(findingCodes(candidate)).toContain("sanity-unexplained-unreferenced-provenance");
  });

  it("does not allow a spoofed Species-discovery URL as retained provenance", () => {
    const candidate = publishableCandidateFixture();
    candidate.provenance.sourceRecords.push({
      id: "source:spoofed-discovery",
      provider: "bulbapedia",
      canonicalUrl: "https://example.com/wiki/List_of_Pok%C3%A9mon_by_National_Pok%C3%A9dex_number",
      fetchedAt: "2026-09-18T00:00:00.000Z",
      parserVersion: "bulbapedia-kanto-johto-species-discovery-v1",
      sourceContentHash: "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
      fetchStatus: "cache",
    });
    refinalize(candidate);

    expect(findingCodes(candidate)).toContain("sanity-unexplained-unreferenced-provenance");
  });

  it("does not allow a spoofed Gen VIII Learnset URL as retained provenance", () => {
    const candidate = publishableCandidateFixture();
    candidate.provenance.sourceRecords.push({
      id: "source:spoofed-gen8-learnset",
      provider: "bulbapedia",
      canonicalUrl: "https://example.com/wiki/Alpha_(Pok%C3%A9mon)/Generation_VIII_learnset",
      fetchedAt: "2026-09-18T00:00:00.000Z",
      parserVersion: "bulbapedia-gen8-learnset-v6",
      sourceContentHash: "sha256:efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef",
      fetchStatus: "cache",
    });
    refinalize(candidate);

    expect(findingCodes(candidate)).toContain("sanity-unexplained-unreferenced-provenance");
  });

  it("detects unsupported cross-surface provenance reuse", () => {
    const candidate = publishableCandidateFixture();
    candidate.catalogs.species[0].sourceRecordIds.push("source:type:normal");
    refinalize(candidate);

    expect(findingCodes(candidate)).toContain("sanity-unexpected-cross-surface-provenance");
  });

  it("detects Species provenance reused across different National Dex identities", () => {
    const candidate = publishableCandidateFixture();
    const registry = mappingRegistryFixture();
    const base = candidate.catalogs.species[0];
    const betaId = "species-beta" as typeof base.id;
    candidate.catalogs.species.push({
      ...base,
      id: betaId,
      sourceName: "Beta",
      sourceSlug: "beta",
      nationalDexNumber: 2,
    });
    registry.species.push({
      sourceKey: "beta",
      canonicalId: betaId,
      baseSpeciesId: null,
      status: "accepted",
    });
    refinalize(candidate);

    expect(findingCodes(candidate, registry)).toContain("sanity-species-provenance-cross-dex");
  });

  it("detects Species/Learnset shared provenance crossing National Dex identities", () => {
    const candidate = publishableCandidateFixture();
    const registry = mappingRegistryFixture();
    const base = candidate.catalogs.species[0];
    const betaId = "species-beta" as typeof base.id;
    candidate.catalogs.species.push({
      ...base,
      id: betaId,
      sourceName: "Beta",
      sourceSlug: "beta",
      nationalDexNumber: 2,
      sourceRecordIds: ["source:species:beta"],
    });
    candidate.provenance.sourceRecords.push({
      ...candidate.provenance.sourceRecords[0],
      id: "source:species:beta",
      canonicalUrl: "https://pokemondb.net/pokedex/beta",
    });
    registry.species.push({
      sourceKey: "beta",
      canonicalId: betaId,
      baseSpeciesId: null,
      status: "accepted",
    });
    candidate.catalogs.learnsets.push({
      ...candidate.catalogs.learnsets[0],
      speciesId: betaId,
      sourceRecordIds: ["source:species:alpha"],
    });
    const inventory = candidate.provenance.inventories.find(
      (entry) => entry.surface === "learnsets",
    );
    if (!inventory) throw new Error("Learnset inventory fixture missing");
    const betaKey = JSON.stringify(["beta", "tackle", 9, "Scarlet/Violet", "level-up", 1, null]);
    inventory.discoveredSourceKeys.push(betaKey);
    inventory.acceptedMappingKeys.push(betaKey);
    inventory.extractedSourceKeys.push(betaKey);
    inventory.normalizedSourceKeys.push(betaKey);
    refinalize(candidate);

    expect(findingCodes(candidate, registry)).toContain(
      "sanity-shared-species-learnset-provenance-cross-dex",
    );
  });

  it("detects invalid Learnset evidence reused as Move provenance", () => {
    const candidate = publishableCandidateFixture();
    candidate.catalogs.moves[0].sourceRecordIds.push("source:learnset:alpha");
    refinalize(candidate);

    expect(findingCodes(candidate)).toContain("sanity-invalid-shared-learnset-move-provenance");
  });

  it("rejects invalid form/base identity shape", () => {
    const candidate = publishableCandidateFixture();
    candidate.catalogs.species[0].formLabel = "Regional Alpha";
    refinalize(candidate);

    expect(findingCodes(candidate)).toContain("sanity-form-identity-shape");
  });

  it("rejects a form that points to another form instead of the canonical base", () => {
    const candidate = publishableCandidateFixture();
    const base = candidate.catalogs.species[0];
    const firstFormId = "species-alpha-form-a" as typeof base.id;
    candidate.catalogs.species.push({
      ...base,
      id: firstFormId,
      sourceName: "Alpha Form A",
      sourceSlug: "alpha-form-a",
      formLabel: "Form A",
      baseSpeciesId: base.id,
    });
    candidate.catalogs.species.push({
      ...base,
      id: "species-alpha-form-b" as typeof base.id,
      sourceName: "Alpha Form B",
      sourceSlug: "alpha-form-b",
      formLabel: "Form B",
      baseSpeciesId: firstFormId,
    });
    refinalize(candidate);

    expect(findingCodes(candidate)).toContain("sanity-form-base-not-canonical");
  });

  it("rejects a form with a different National Dex identity or generation before its base", () => {
    const candidate = publishableCandidateFixture();
    const base = candidate.catalogs.species[0];
    base.introducedGeneration = 2;
    candidate.catalogs.species.push({
      ...base,
      id: "species-alpha-form" as typeof base.id,
      sourceName: "Alpha Form",
      sourceSlug: "alpha-form",
      nationalDexNumber: 2,
      introducedGeneration: 1,
      formLabel: "Form",
      baseSpeciesId: base.id,
    });
    refinalize(candidate);

    expect(findingCodes(candidate)).toEqual(
      expect.arrayContaining([
        "sanity-form-national-dex-mismatch",
        "sanity-form-generation-before-base",
      ]),
    );
  });

  it("rejects a Learnset inventory count that differs from published rows", () => {
    const candidate = publishableCandidateFixture();
    const inventory = candidate.provenance.inventories.find(
      (entry) => entry.surface === "learnsets",
    );
    if (!inventory) throw new Error("Learnset inventory fixture missing");
    inventory.acceptedMappingKeys.push(inventory.acceptedMappingKeys[0]);
    refinalize(candidate);

    expect(findingCodes(candidate)).toContain("sanity-learnset-inventory-count-mismatch");
  });

  it("rejects a malformed accepted Learnset inventory identity", () => {
    const candidate = publishableCandidateFixture();
    const inventory = candidate.provenance.inventories.find(
      (entry) => entry.surface === "learnsets",
    );
    if (!inventory) throw new Error("Learnset inventory fixture missing");
    inventory.acceptedMappingKeys = ["not-a-seven-field-json-tuple"];
    refinalize(candidate);

    expect(findingCodes(candidate)).toContain("sanity-learnset-inventory-key-invalid");
  });

  it("rejects duplicate equivalent SourceRecord evidence under different ids", () => {
    const candidate = publishableCandidateFixture();
    candidate.provenance.sourceRecords.push({
      ...candidate.provenance.sourceRecords[0],
      id: "source:species:alpha-duplicate",
    });
    refinalize(candidate);

    expect(findingCodes(candidate)).toContain("sanity-duplicate-equivalent-provenance");
  });

  it("rejects shared Type/type-effectiveness provenance outside the approved type chart source", () => {
    const candidate = publishableCandidateFixture();
    candidate.catalogs.types[0].sourceRecordIds.push("source:type-chart:current");
    refinalize(candidate);

    expect(findingCodes(candidate)).toContain("sanity-invalid-shared-type-chart-provenance");
  });

  it("blocks staging when candidate sanity fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokenexus-sanity-stage-"));
    tempDirectories.push(root);
    const candidate = publishableCandidateFixture();
    candidate.catalogs.learnsets = [];
    const inventory = candidate.provenance.inventories.find(
      (entry) => entry.surface === "learnsets",
    );
    if (!inventory) throw new Error("Learnset inventory fixture missing");
    inventory.discoveredSourceKeys = [];
    inventory.acceptedMappingKeys = [];
    inventory.extractedSourceKeys = [];
    inventory.normalizedSourceKeys = [];
    refinalize(candidate);

    await expect(
      stageCandidate(join(root, "stage"), candidate, mappingRegistryFixture()),
    ).rejects.toMatchObject({
      finding: {
        code: expect.stringMatching(
          /^sanity-(?:move-unreferenced-by-learnset|species-learnset-context|species-missing-learnset)$/,
        ),
      },
    });
  });
});
