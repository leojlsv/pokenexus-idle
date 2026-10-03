import { describe, expect, it } from "vitest";
import type { SpeciesId, TypeId } from "@pokenexus/game-types";
import type { PokeApiLowAmbiguityFacts } from "./pokeapi-local-snapshot.js";
import { buildPokeApiParityReport } from "./pokeapi-parity.js";
import {
  asId,
  candidateFixture,
  mappingRegistryFixture,
  speciesFixture,
  typeFixture,
} from "./test-fixtures.js";

function factsFixture(): PokeApiLowAmbiguityFacts {
  return {
    snapshot: {
      root: "local-fixture",
      manifestPath: "local-fixture/source-snapshot.json",
      record: {
        id: `source-snapshot:pokeapi:${"a".repeat(64)}`,
        provider: "pokeapi",
        upstreamRevision: "b".repeat(40),
        acquiredAt: "2026-10-02T21:34:09.000Z",
        files: [],
        snapshotHash: `sha256:${"a".repeat(64)}`,
      },
    },
    pokemon: [{
      pokemonId: 1,
      speciesId: 1,
      sourceSlug: "bulbasaur",
      isDefault: true,
      baseExperience: 64,
      heightMillimeters: 700,
      weightGrams: 6900,
      typeIds: [1],
      baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
      evYield: { hp: 0, atk: 0, def: 0, spa: 1, spd: 0, spe: 0 },
      abilities: [{ abilityId: 1, slot: 1, isHidden: false }],
    }],
    species: [{
      speciesId: 1,
      sourceSlug: "bulbasaur",
      sourceName: "Bulbasaur",
      introducedGeneration: 1,
      nationalDexNumber: 1,
      captureRate: 45,
      growthRate: "medium-slow",
      eggGroups: ["monster", "plant"],
      genderRate: 1,
    }],
    moves: [{ moveId: 1, sourceSlug: "tackle", targetIdentifier: "selected-pokemon", makesContact: true }],
    types: [{ typeId: 1, sourceSlug: "normal", sourceName: "Normal", introducedGeneration: 1 }],
    typeEffectiveness: [{ attackTypeId: 1, defenseTypeId: 1, damageFactor: 100 }],
    abilities: [{ abilityId: 1, sourceSlug: "overgrow", sourceName: "Overgrow", introducedGeneration: 3 }],
    items: [{ itemId: 1, sourceSlug: "potion", sourceName: "Potion", sourceCategory: "medicine" }],
  };
}

describe("PokéAPI local parity report", () => {
  it("compares only approved authority fields and reports an all-match local baseline", () => {
    const current = candidateFixture();
    current.catalogs.species[0] = speciesFixture({ sourceName: "Bulbasaur", sourceSlug: "bulbasaur" });
    const registry = mappingRegistryFixture();
    registry.species[0].sourceKey = "pokedex:bulbasaur:1";

    const report = buildPokeApiParityReport(
      factsFixture(),
      current,
      registry,
      { species: [{ pokemonId: 1, sourceKey: "pokedex:bulbasaur:1" }] },
      { "selected-pokemon": "any-adjacent" },
    );

    expect(report.counts.mismatch).toBe(0);
    expect(report.counts.unmapped).toBe(0);
    expect(report.counts["missing-current"]).toBe(0);
    expect(report.counts["missing-source"]).toBe(0);
    expect(report.counts.match).toBeGreaterThan(10);
    expect(report.entries.some((value) => value.field === "baseFriendship")).toBe(false);
    expect(report.entries.some((value) => value.field === "eggCycles")).toBe(false);
    expect(report.entries.some((value) => value.field === "power")).toBe(false);
    expect(report.entries.some((value) => value.field === "basePp")).toBe(false);
  });

  it("reports mismatches, missing accepted sources and unmapped targets without mutating current data", () => {
    const current = candidateFixture();
    current.catalogs.species[0] = speciesFixture({ sourceName: "Bulbasaur", sourceSlug: "bulbasaur" });
    const registry = mappingRegistryFixture();
    registry.species[0].sourceKey = "pokedex:bulbasaur:1";
    const facts = factsFixture();
    facts.moves[0] = { ...facts.moves[0], makesContact: false };
    facts.items = [];
    facts.typeEffectiveness = [];
    const before = JSON.stringify(current);

    const report = buildPokeApiParityReport(
      facts,
      current,
      registry,
      { species: [{ pokemonId: 1, sourceKey: "pokedex:bulbasaur:1" }] },
    );
    expect(report.entries).toContainEqual(expect.objectContaining({
      surface: "moves",
      field: "makesContact",
      status: "mismatch",
    }));
    expect(report.entries).toContainEqual(expect.objectContaining({
      surface: "moves",
      field: "sourceTarget",
      status: "unmapped",
    }));
    expect(report.entries).toContainEqual(expect.objectContaining({
      surface: "items",
      sourceKey: "potion",
      status: "missing-source",
    }));
    expect(report.entries).toContainEqual(expect.objectContaining({
      surface: "type-effectiveness",
      status: "missing-source",
    }));
    expect(JSON.stringify(current)).toBe(before);
  });

  it("normalizes PokéAPI growth-rate identifiers to the canonical Erratic/Fluctuating keys", () => {
    for (const [sourceGrowthRate, canonicalGrowthRate] of [
      ["slow-then-very-fast", "erratic"],
      ["fast-then-very-slow", "fluctuating"],
    ] as const) {
      const current = candidateFixture();
      current.catalogs.species[0] = speciesFixture({
        sourceName: "Bulbasaur",
        sourceSlug: "bulbasaur",
        growthRate: canonicalGrowthRate,
      });
      const registry = mappingRegistryFixture();
      registry.species[0].sourceKey = "pokedex:bulbasaur:1";
      const facts = factsFixture();
      facts.species[0] = { ...facts.species[0], growthRate: sourceGrowthRate };

      const report = buildPokeApiParityReport(
        facts,
        current,
        registry,
        { species: [{ pokemonId: 1, sourceKey: "pokedex:bulbasaur:1" }] },
        { "selected-pokemon": "any-adjacent" },
      );
      expect(report.entries).toContainEqual(expect.objectContaining({
        surface: "species",
        field: "growthRate",
        status: "match",
      }));
    }
  });

  it("requires an explicit pokemonId binding for accepted forms and never inherits form introduction generation", () => {
    const current = candidateFixture();
    current.catalogs.species[0] = speciesFixture({ sourceName: "Bulbasaur", sourceSlug: "bulbasaur" });
    const registry = mappingRegistryFixture();
    registry.species[0].sourceKey = "pokedex:bulbasaur:1";
    const facts = factsFixture();
    const baseId = current.catalogs.species[0].id;
    const formId = asId<SpeciesId>("species-alpha-form");
    const formSourceKey = "pokedex:bulbasaur:10001";
    current.catalogs.species.push(speciesFixture({
      id: formId,
      sourceName: "Bulbasaur Form",
      sourceSlug: "bulbasaur-form",
      introducedGeneration: 7,
      formLabel: "Form",
      baseSpeciesId: baseId,
    }));
    registry.species.push({
      sourceKey: formSourceKey,
      canonicalId: formId,
      baseSpeciesId: baseId,
      status: "accepted",
    });
    facts.pokemon.push({ ...facts.pokemon[0], pokemonId: 10001, sourceSlug: "bulbasaur-form", isDefault: false });

    const unbound = buildPokeApiParityReport(
      facts,
      current,
      registry,
      { species: [{ pokemonId: 1, sourceKey: "pokedex:bulbasaur:1" }] },
      { "selected-pokemon": "any-adjacent" },
    );
    expect(unbound.entries).toContainEqual(expect.objectContaining({
      sourceKey: formSourceKey,
      field: "binding",
      status: "unmapped",
    }));

    const bound = buildPokeApiParityReport(
      facts,
      current,
      registry,
      {
        species: [
          { pokemonId: 1, sourceKey: "pokedex:bulbasaur:1" },
          { pokemonId: 10001, sourceKey: formSourceKey },
        ],
      },
      { "selected-pokemon": "any-adjacent" },
    );
    expect(bound.entries).toContainEqual(expect.objectContaining({
      sourceKey: formSourceKey,
      field: "sourceSlug",
      status: "match",
    }));
    expect(bound.entries.some((value) => value.sourceKey === formSourceKey && value.field === "introducedGeneration")).toBe(false);
  });

  it("reports a mapped Item name gap as missing-source instead of inventing a name", () => {
    const current = candidateFixture();
    const registry = mappingRegistryFixture();
    const facts = factsFixture();
    facts.items[0] = { ...facts.items[0], sourceName: null };

    const report = buildPokeApiParityReport(facts, current, registry, { species: [] });
    expect(report.entries).toContainEqual(expect.objectContaining({
      surface: "items",
      sourceKey: "potion",
      field: "sourceName",
      status: "missing-source",
    }));
  });

  it("reports an unpopulated current Item category as missing-current", () => {
    const current = candidateFixture();
    current.catalogs.items[0] = { ...current.catalogs.items[0], sourceCategory: null };
    const registry = mappingRegistryFixture();
    const report = buildPokeApiParityReport(factsFixture(), current, registry, { species: [] });
    expect(report.entries).toContainEqual(expect.objectContaining({
      surface: "items",
      sourceKey: "potion",
      field: "sourceCategory",
      status: "missing-current",
    }));
  });

  it("normalizes PokéAPI Egg Group identifiers to the fixed canonical keys", () => {
    const current = candidateFixture();
    current.catalogs.species[0] = speciesFixture({
      sourceName: "Bulbasaur",
      sourceSlug: "bulbasaur",
      eggGroups: ["field", "grass"],
    });
    const registry = mappingRegistryFixture();
    registry.species[0].sourceKey = "pokedex:bulbasaur:1";
    const facts = factsFixture();
    facts.species[0] = { ...facts.species[0], eggGroups: ["ground", "plant"] };

    const report = buildPokeApiParityReport(
      facts,
      current,
      registry,
      { species: [{ pokemonId: 1, sourceKey: "pokedex:bulbasaur:1" }] },
      { "selected-pokemon": "any-adjacent" },
    );
    expect(report.entries).toContainEqual(expect.objectContaining({
      surface: "species",
      field: "eggGroups",
      status: "match",
    }));
  });

  it("compares Species Type assignments in canonical ID order rather than PokéAPI slot order", () => {
    const current = candidateFixture();
    const fire = asId<TypeId>("fire");
    current.catalogs.types.push(typeFixture({ id: fire, sourceName: "Fire", sourceSlug: "fire" }));
    current.catalogs.species[0] = speciesFixture({
      sourceName: "Bulbasaur",
      sourceSlug: "bulbasaur",
      typeIds: [fire, asId<TypeId>("normal")],
    });
    const registry = mappingRegistryFixture();
    registry.species[0].sourceKey = "pokedex:bulbasaur:1";
    registry.types.push({ sourceKey: "fire", canonicalId: fire, status: "accepted" });
    const facts = factsFixture();
    facts.types.push({ typeId: 2, sourceSlug: "fire", sourceName: "Fire", introducedGeneration: 1 });
    facts.pokemon[0] = { ...facts.pokemon[0], typeIds: [1, 2] };

    const report = buildPokeApiParityReport(
      facts,
      current,
      registry,
      { species: [{ pokemonId: 1, sourceKey: "pokedex:bulbasaur:1" }] },
      { "selected-pokemon": "any-adjacent" },
    );
    expect(report.entries).toContainEqual(expect.objectContaining({
      surface: "species",
      field: "typeIds",
      status: "match",
    }));
  });
});
