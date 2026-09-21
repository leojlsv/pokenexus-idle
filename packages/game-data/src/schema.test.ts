import { describe, expect, it } from "vitest";
import {
  EGG_GROUP_KEYS,
  GameDataValidationError,
  MOVE_TARGETS,
  parseAbilityDefinitionV1,
  parseGameDataCandidate,
  parseItemDefinitionV1,
  parseLearnsetEntryV1,
  parseMoveDefinitionV1,
  parseSpeciesDefinitionV2,
  parseTypeDefinitionV1,
  validateGameDataCandidate,
} from "./schema";
import {
  abilityFixture,
  candidateFixture,
  itemFixture,
  learnsetFixture,
  moveFixture,
  speciesFixture,
  typeFixture,
} from "./test-fixtures";

describe("static game-data schemas", () => {
  it("accepts the complete SpeciesDefinitionV2 shape and SourceFact variants", () => {
    expect(parseSpeciesDefinitionV2(speciesFixture())).toEqual(speciesFixture());
    expect(
      parseSpeciesDefinitionV2(
        speciesFixture({
          baseExperience: { status: "source-unavailable" },
          eggCycles: { status: "source-unavailable" },
          baseFriendship: { status: "source-unavailable" },
        }),
      ),
    ).toBeDefined();
  });

  it("rejects malformed SourceFact instead of treating parser ambiguity as source-unavailable", () => {
    expect(() =>
      parseSpeciesDefinitionV2(
        speciesFixture({ baseExperience: { status: "unknown" } as never }),
      ),
    ).toThrow(GameDataValidationError);
    expect(() =>
      parseSpeciesDefinitionV2(
        speciesFixture({
          eggCycles: { status: "known", value: 0 },
        }),
      ),
    ).toThrow(/eggCycles/);
  });

  it("requires exact six-key stat blocks and integer numeric domains", () => {
    expect(() =>
      parseSpeciesDefinitionV2(
        speciesFixture({
          baseStats: {
            hp: 45,
            atk: 49,
            def: 49,
            spa: 65,
            spd: 65,
          } as never,
        }),
      ),
    ).toThrow(/baseStats/);
    expect(() =>
      parseSpeciesDefinitionV2(
        speciesFixture({ heightMillimeters: 700.5 }),
      ),
    ).toThrow(/heightMillimeters/);
    expect(() =>
      parseSpeciesDefinitionV2(
        speciesFixture({
          evYield: { hp: 0, atk: 0, def: 0, spa: -1, spd: 0, spe: 0 },
        }),
      ),
    ).toThrow(/evYield/);
  });

  it("enforces the closed Egg Group vocabulary, uniqueness and fixed canonical ordering", () => {
    expect(EGG_GROUP_KEYS).toHaveLength(15);
    expect(() =>
      parseSpeciesDefinitionV2(
        speciesFixture({ eggGroups: ["grass", "monster"] }),
      ),
    ).toThrow(/eggGroups.*order/i);
    expect(() =>
      parseSpeciesDefinitionV2(
        speciesFixture({ eggGroups: ["monster", "monster"] }),
      ),
    ).toThrow(/eggGroups/);
    expect(() =>
      parseSpeciesDefinitionV2(
        speciesFixture({ eggGroups: ["unknown"] as never }),
      ),
    ).toThrow(/eggGroups/);
  });

  it("validates gender ratios exactly in basis points", () => {
    expect(() =>
      parseSpeciesDefinitionV2(
        speciesFixture({
          genderRatio: {
            kind: "ratio",
            maleBasisPoints: 5000,
            femaleBasisPoints: 4999,
          },
        }),
      ),
    ).toThrow(/genderRatio/);
    expect(() =>
      parseSpeciesDefinitionV2(
        speciesFixture({
          genderRatio: {
            kind: "ratio",
            maleBasisPoints: 10000.5,
            femaleBasisPoints: -0.5,
          },
        }),
      ),
    ).toThrow(/genderRatio/);
    expect(
      parseSpeciesDefinitionV2(
        speciesFixture({ genderRatio: { kind: "genderless" } }),
      ).genderRatio,
    ).toEqual({ kind: "genderless" });
  });

  it("rejects unknown Ability slots, Move targets and learn methods", () => {
    expect(() =>
      parseSpeciesDefinitionV2(
        speciesFixture({
          abilities: [
            {
              ...speciesFixture().abilities[0],
              sourceAbilitySlot: "normal-3" as never,
            },
          ],
        }),
      ),
    ).toThrow(/sourceAbilitySlot/);
    expect(() =>
      parseMoveDefinitionV1(
        moveFixture({ sourceTarget: "mystery" as never }),
      ),
    ).toThrow(/sourceTarget/);
    expect(() =>
      parseLearnsetEntryV1(
        learnsetFixture({ method: "other" as never }),
      ),
    ).toThrow(/method/);
  });

  it("enforces the exact Human-approved 16-member Move target vocabulary", () => {
    expect(MOVE_TARGETS).toEqual([
      "any-adjacent",
      "any-other",
      "self-or-adjacent-ally",
      "adjacent-ally",
      "adjacent-foe",
      "all-adjacent",
      "all-adjacent-foes",
      "self",
      "self-and-allies",
      "all-allies",
      "all-pokemon",
      "random-opponent",
      "entire-field",
      "opponents-side",
      "users-side",
      "varies",
    ]);
    expect(parseMoveDefinitionV1(moveFixture({ sourceTarget: "varies" })).sourceTarget).toBe("varies");
  });

  it("enforces method-specific learnset qualifiers", () => {
    expect(() =>
      parseLearnsetEntryV1(learnsetFixture({ level: null })),
    ).toThrow(/level/);
    expect(() =>
      parseLearnsetEntryV1(
        learnsetFixture({
          method: "machine",
          level: null,
          machineIdentifier: null,
        }),
      ),
    ).toThrow(/machineIdentifier/);
    expect(
      parseLearnsetEntryV1(
        learnsetFixture({
          method: "egg",
          level: null,
          machineIdentifier: null,
        }),
      ).method,
    ).toBe("egg");
  });

  it("accepts representative Move, Type, Ability and Item definitions", () => {
    expect(parseMoveDefinitionV1(moveFixture())).toEqual(moveFixture());
    expect(
      parseMoveDefinitionV1(
        moveFixture({
          category: "status",
          power: null,
          accuracy: null,
          zaBaseCooldownMs: 6200,
        }),
      ),
    ).toBeDefined();
    expect(parseTypeDefinitionV1(typeFixture())).toEqual(typeFixture());
    expect(parseAbilityDefinitionV1(abilityFixture())).toEqual(
      abilityFixture(),
    );
    expect(parseItemDefinitionV1(itemFixture())).toEqual(itemFixture());
  });

  it("enforces Move basePp and Z-A Base Cooldown numeric domains", () => {
    expect(() => parseMoveDefinitionV1(moveFixture({ basePp: 0 }))).toThrow(/basePp/);
    expect(() => parseMoveDefinitionV1(moveFixture({ zaBaseCooldownMs: 2500.5 }))).toThrow(/zaBaseCooldownMs/);
    expect(parseMoveDefinitionV1(moveFixture({ zaBaseCooldownMs: 0 })).zaBaseCooldownMs).toBe(0);
    expect(parseMoveDefinitionV1(moveFixture({ zaBaseCooldownMs: null })).zaBaseCooldownMs).toBeNull();
  });
});

describe("candidate cross-catalog validation", () => {
  it("accepts a fully resolved schema-v3 candidate", () => {
    expect(parseGameDataCandidate(candidateFixture())).toBeDefined();
    expect(validateGameDataCandidate(candidateFixture())).toEqual({
      valid: true,
      findings: [],
    });
  });

  it("fails closed on duplicate canonical IDs and unresolved references", () => {
    const duplicate = candidateFixture();
    duplicate.catalogs.species.push(speciesFixture());
    expect(validateGameDataCandidate(duplicate).findings).toContainEqual(
      expect.objectContaining({ code: "duplicate-canonical-id" }),
    );

    const unresolved = candidateFixture();
    unresolved.catalogs.types = [];
    expect(validateGameDataCandidate(unresolved).findings).toContainEqual(
      expect.objectContaining({ code: "unresolved-reference" }),
    );
  });

  it("rejects unsupported schema versions and invalid base-species cycles", () => {
    const unsupported = candidateFixture() as unknown as Record<string, unknown>;
    unsupported.schemaVersion = "1";
    expect(() => parseGameDataCandidate(unsupported)).toThrow(
      /schemaVersion/,
    );

    const cyclic = candidateFixture();
    const alpha = speciesFixture({
      baseSpeciesId: "species-beta" as never,
    });
    const beta = speciesFixture({
      id: "species-beta" as never,
      sourceSlug: "beta",
      sourceName: "Beta",
      baseSpeciesId: "species-alpha" as never,
    });
    cyclic.catalogs.species = [alpha, beta];
    expect(validateGameDataCandidate(cyclic).findings).toContainEqual(
      expect.objectContaining({ code: "base-species-cycle" }),
    );
  });

  it("requires the complete current type matrix exactly once per ordered pair", () => {
    const missing = candidateFixture();
    missing.catalogs.types.push(
      typeFixture({
        id: "fire" as never,
        sourceName: "Fire",
        sourceSlug: "fire",
      }),
    );
    expect(validateGameDataCandidate(missing).findings).toContainEqual(
      expect.objectContaining({ code: "incomplete-type-matrix" }),
    );

    const duplicate = candidateFixture();
    duplicate.referenceData.currentTypeEffectiveness.push(
      duplicate.referenceData.currentTypeEffectiveness[0],
    );
    expect(validateGameDataCandidate(duplicate).findings).toContainEqual(
      expect.objectContaining({ code: "duplicate-type-matrix-pair" }),
    );
  });

  it("requires every normalized source reference to resolve to approved provenance", () => {
    const missing = candidateFixture();
    missing.provenance.sourceRecords = [];
    expect(validateGameDataCandidate(missing).findings).toContainEqual(
      expect.objectContaining({ code: "unresolved-provenance" }),
    );

    const alternate = candidateFixture();
    alternate.provenance.sourceRecords[0] = {
      ...alternate.provenance.sourceRecords[0],
      provider: "pokeapi" as never,
    };
    expect(validateGameDataCandidate(alternate).findings).toContainEqual(
      expect.objectContaining({ code: "invalid-provider" }),
    );
  });

  it("requires exact Bulbapedia Z-A move-list provenance for both cooldown values and semantic null", () => {
    for (const zaBaseCooldownMs of [null, 4000] as const) {
      const missing = candidateFixture();
      missing.catalogs.moves[0] = moveFixture({
        zaBaseCooldownMs,
        sourceRecordIds: ["source:move:tackle"],
      });
      expect(validateGameDataCandidate(missing).findings).toContainEqual(
        expect.objectContaining({ code: "missing-za-cooldown-provenance" }),
      );

      const wrongBulbapediaPage = candidateFixture();
      wrongBulbapediaPage.catalogs.moves[0].zaBaseCooldownMs = zaBaseCooldownMs;
      const zaRecord = wrongBulbapediaPage.provenance.sourceRecords.find(
        (source) => source.id === "source:bulbapedia:za-moves",
      );
      if (!zaRecord) throw new Error("fixture Z-A source record missing");
      zaRecord.canonicalUrl = "https://bulbapedia.bulbagarden.net/wiki/Tackle_(move)";
      expect(validateGameDataCandidate(wrongBulbapediaPage).findings).toContainEqual(
        expect.objectContaining({ code: "missing-za-cooldown-provenance" }),
      );
    }
  });

  it("requires the canonical Bulbapedia Generation IX move-list source for non-cooldown Move facts", () => {
    const missing = candidateFixture();
    missing.catalogs.moves[0].sourceRecordIds = missing.catalogs.moves[0].sourceRecordIds.filter(
      (id) => id !== "source:bulbapedia:gen9-moves",
    );
    expect(validateGameDataCandidate(missing).findings).toContainEqual(
      expect.objectContaining({ code: "missing-mainline-move-provenance" }),
    );

    const wrongPage = candidateFixture();
    const gen9Record = wrongPage.provenance.sourceRecords.find(
      (source) => source.id === "source:bulbapedia:gen9-moves",
    );
    if (!gen9Record) throw new Error("fixture Gen IX source record missing");
    gen9Record.canonicalUrl = "https://bulbapedia.bulbagarden.net/wiki/Tackle_(move)";
    expect(validateGameDataCandidate(wrongPage).findings).toContainEqual(
      expect.objectContaining({ code: "missing-mainline-move-provenance" }),
    );

    const wrongParser = candidateFixture();
    const gen9ParserRecord = wrongParser.provenance.sourceRecords.find(
      (source) => source.id === "source:bulbapedia:gen9-moves",
    );
    if (!gen9ParserRecord) throw new Error("fixture Gen IX source record missing");
    gen9ParserRecord.parserVersion = "bulbapedia-gen9-unknown-v0";
    expect(validateGameDataCandidate(wrongParser).findings).toContainEqual(
      expect.objectContaining({ code: "missing-mainline-move-provenance" }),
    );
  });

  it("requires one complete hash-bound Move fact-source role relation per canonical Move", () => {
    const missing = candidateFixture();
    missing.provenance.moveFactSources = [];
    expect(validateGameDataCandidate(missing).findings).toContainEqual(
      expect.objectContaining({ code: "missing-move-fact-sources" }),
    );

    const omittedHistoricalRole = candidateFixture();
    omittedHistoricalRole.provenance.moveFactSources[0].mainline = {
      selectedGame: "sword-shield",
      sourceRecordId: "source:bulbapedia:gen9-moves",
    };
    expect(validateGameDataCandidate(omittedHistoricalRole).findings).toContainEqual(
      expect.objectContaining({ code: "invalid-move-mainline-source" }),
    );

    const legacyPublishedBdspParser = candidateFixture();
    legacyPublishedBdspParser.provenance.sourceRecords.push({
      id: "source:bulbapedia:legacy-bdsp",
      provider: "bulbapedia",
      canonicalUrl:
        "https://bulbapedia.bulbagarden.net/wiki/Tackle_(Pok%C3%A9mon)/Generation_VIII_learnset",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      fetchStatus: "cache",
      parserVersion: "bulbapedia-gen8-bdsp-learnset-v5",
      sourceContentHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    legacyPublishedBdspParser.catalogs.moves[0].sourceRecordIds.push(
      "source:bulbapedia:legacy-bdsp",
    );
    legacyPublishedBdspParser.provenance.moveFactSources[0].mainline = {
      selectedGame: "brilliant-diamond-shining-pearl",
      sourceRecordId: "source:bulbapedia:legacy-bdsp",
    };
    expect(validateGameDataCandidate(legacyPublishedBdspParser).findings).toContainEqual(
      expect.objectContaining({ code: "invalid-move-mainline-source" }),
    );

    const wrongComplement = candidateFixture();
    wrongComplement.provenance.moveFactSources[0].sourceTargetSourceRecordId =
      "source:bulbapedia:gen9-moves";
    expect(validateGameDataCandidate(wrongComplement).findings).toContainEqual(
      expect.objectContaining({ code: "invalid-move-complement-source" }),
    );

    const bulbapediaTarget = candidateFixture();
    bulbapediaTarget.provenance.sourceRecords.push({
      id: "source:bulbapedia:psychic-noise-target",
      provider: "bulbapedia",
      canonicalUrl:
        "https://bulbapedia.bulbagarden.net/wiki/Psychic_Noise_(move)",
      fetchedAt: "2026-09-21T00:00:00.000Z",
      parserVersion: "bulbapedia-move-target-v1",
      sourceContentHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fetchStatus: "fetched",
    });
    bulbapediaTarget.catalogs.moves[0].sourceRecordIds.push(
      "source:bulbapedia:psychic-noise-target",
    );
    bulbapediaTarget.provenance.moveFactSources[0].sourceTargetSourceRecordId =
      "source:bulbapedia:psychic-noise-target";
    expect(
      validateGameDataCandidate(bulbapediaTarget).findings.filter(
        (finding) => finding.code === "invalid-move-complement-source",
      ),
    ).toEqual([]);

    const bulbapediaContact = structuredClone(bulbapediaTarget);
    bulbapediaContact.provenance.moveFactSources[0].makesContactSourceRecordId =
      "source:bulbapedia:psychic-noise-target";
    expect(validateGameDataCandidate(bulbapediaContact).findings).toContainEqual(
      expect.objectContaining({
        code: "invalid-move-complement-source",
        path: expect.stringContaining("makesContactSourceRecordId"),
      }),
    );

    const roleOutsideAggregate = candidateFixture();
    roleOutsideAggregate.provenance.moveFactSources[0].sourceTargetSourceRecordId =
      "source:type:normal";
    expect(validateGameDataCandidate(roleOutsideAggregate).findings).toContainEqual(
      expect.objectContaining({ code: "move-fact-source-not-aggregated" }),
    );
  });

  it("accepts mixed Bulbapedia and PokémonDB source records without a manifest-wide provider", () => {
    const candidate = candidateFixture();
    candidate.provenance.sourceRecords[0] = {
      ...candidate.provenance.sourceRecords[0],
      provider: "bulbapedia",
      canonicalUrl: "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)",
      parserVersion: "bulbapedia-v1",
    };
    const parsed = parseGameDataCandidate(candidate);
    expect(parsed.provenance).not.toHaveProperty("provider");
    expect(parsed.provenance.sourceRecords[0].provider).toBe("bulbapedia");
    expect(parsed.provenance.sourceRecords[1].provider).toBe("pokemondb");
  });

  it("rejects provider/url mismatches and unsupported source providers", () => {
    const wrongHost = candidateFixture();
    wrongHost.provenance.sourceRecords[0] = {
      ...wrongHost.provenance.sourceRecords[0],
      provider: "bulbapedia",
    };
    expect(() => parseGameDataCandidate(wrongHost)).toThrow(/bulbapedia\.bulbagarden\.net/);

    const unsupported = candidateFixture() as unknown as { provenance: { sourceRecords: Array<Record<string, unknown>> } };
    unsupported.provenance.sourceRecords[0].provider = "pokeapi";
    expect(() => parseGameDataCandidate(unsupported)).toThrow(/sourceRecord\.provider/);
  });
});
