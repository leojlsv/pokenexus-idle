import { describe, expect, it } from "vitest";
import {
  proposeCandidateId,
  reconcileSourceInventory,
  validateMappingRegistry,
} from "./reconciliation";
import { asId, inventoryFixture } from "./test-fixtures";
import type { MappingRegistry } from "./schema";

describe("source mapping and inventory reconciliation", () => {
  it("accepts a fully explained accepted mapping inventory", () => {
    expect(reconcileSourceInventory(inventoryFixture())).toEqual([]);
  });

  it("blocks newly discovered unmapped, missing accepted and extracted-only keys", () => {
    const findings = reconcileSourceInventory(
      inventoryFixture({
        discoveredSourceKeys: ["alpha", "new-form"],
        acceptedMappingKeys: ["alpha", "missing"],
        extractedSourceKeys: ["alpha", "orphan"],
        normalizedSourceKeys: ["alpha"],
      }),
    );
    expect(findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "unmapped-discovered-key",
        "missing-accepted-key",
        "extracted-not-normalized",
      ]),
    );
  });

  it("allows explicit excluded/deferred transformations only with a policy reason", () => {
    expect(
      reconcileSourceInventory(
        inventoryFixture({
          discoveredSourceKeys: ["alpha", "alpha-mega"],
          excludedOrDeferred: [
            {
              sourceKey: "alpha-mega",
              disposition: "deferred",
              reason: "battle-only-transformation",
            },
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      reconcileSourceInventory(
        inventoryFixture({
          discoveredSourceKeys: ["alpha", "alpha-mega"],
          excludedOrDeferred: [
            {
              sourceKey: "alpha-mega",
              disposition: "deferred",
              reason: "",
            },
          ],
        }),
      ).map((finding) => finding.code),
    ).toContain("invalid-exclusion");
  });

  it("keeps candidate keys explicit without treating the reviewable candidate itself as malformed", () => {
    const findings = reconcileSourceInventory(
      inventoryFixture({
        discoveredSourceKeys: ["alpha", "candidate"],
        candidateSourceKeys: ["candidate"],
      }),
    );
    expect(findings).toEqual([]);
    expect(proposeCandidateId("species", "Mr. Mime")).toBe(
      proposeCandidateId("species", "Mr. Mime"),
    );
  });

  it("rejects ambiguous or duplicate accepted source/canonical mappings", () => {
    const registry: MappingRegistry = {
      species: [
        {
          sourceKey: "alpha",
          canonicalId: asId("species-alpha"),
          baseSpeciesId: null,
          status: "accepted",
        },
        {
          sourceKey: "alpha",
          canonicalId: asId("species-beta"),
          baseSpeciesId: null,
          status: "accepted",
        },
      ],
      moves: [],
      types: [],
      abilities: [],
      items: [],
    };
    expect(validateMappingRegistry(registry).map((finding) => finding.code)).toContain(
      "duplicate-source-mapping",
    );
  });
});
