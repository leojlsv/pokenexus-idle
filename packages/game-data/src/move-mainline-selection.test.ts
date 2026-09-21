import { describe, expect, it } from "vitest";
import type { ExtractedBulbapediaGen9Move } from "./bulbapedia-gen9-move-parser";
import type {
  ExtractedBulbapediaGen7Move,
  ExtractedBulbapediaGen8Move,
} from "./bulbapedia-historical-move-parser";
import {
  materializeBdspHistoricalScalarProofs,
  requiredHistoricalScalarProof,
  selectMainlineMoveFacts,
  type BdspHistoricalScalarEvidence,
  type HistoricalScalarProof,
} from "./move-mainline-selection";
import type { ExtractedPokemonDbMove } from "./pokemondb-parser";

const GEN9_SOURCE = "source:bulbapedia:gen9";
const GEN8_SOURCE = "source:bulbapedia:gen8";
const GEN7_SOURCE = "source:bulbapedia:gen7";
const PROOF_SOURCE = "source:bulbapedia:selected-game-proof";

function pokemonDbMove(
  sourceName: string,
  overrides: Partial<ExtractedPokemonDbMove> = {},
): ExtractedPokemonDbMove {
  const sourceKey = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    sourceKey,
    sourceName,
    sourceSlug: sourceKey,
    introducedGeneration: 1,
    typeSourceKey: "wrong-current-type",
    category: "status",
    power: 999,
    accuracy: 1,
    basePp: 1,
    makesContact: true,
    sourceTarget: "any-adjacent",
    sourceRecordId: `source:pokemondb:${sourceKey}`,
    ...overrides,
  };
}

function gen9(
  sourceName: string,
  availability: ExtractedBulbapediaGen9Move["scarletVioletAvailability"],
  overrides: Partial<ExtractedBulbapediaGen9Move> = {},
): ExtractedBulbapediaGen9Move {
  const sourceKey = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    index: 1,
    sourceName,
    sourceKey,
    typeSourceKey: "normal",
    category: "physical",
    basePp: 35,
    power: 40,
    accuracy: 100,
    scarletVioletAvailability: availability,
    sourceRecordId: GEN9_SOURCE,
    ...overrides,
  };
}

function gen8(
  sourceName: string,
  overrides: Partial<ExtractedBulbapediaGen8Move> = {},
): ExtractedBulbapediaGen8Move {
  const sourceKey = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    index: 1,
    sourceName,
    sourceKey,
    typeSourceKey: "normal",
    category: "physical",
    basePp: 20,
    power: 80,
    accuracy: 80,
    swordShieldAvailability: "unusable",
    bdspAvailability: "unusable",
    legendsArceusAvailability: "unusable",
    sourceRecordId: GEN8_SOURCE,
    ...overrides,
  };
}

function gen7(
  sourceName: string,
  overrides: Partial<ExtractedBulbapediaGen7Move> = {},
): ExtractedBulbapediaGen7Move {
  const sourceKey = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    index: 1,
    sourceName,
    sourceKey,
    typeSourceKey: "normal",
    category: "physical",
    basePp: 20,
    power: 70,
    accuracy: 100,
    sunMoonAvailability: "unusable",
    ultraSunUltraMoonAvailability: "unusable",
    letsGoPikachuEeveeAvailability: "unusable",
    sourceRecordId: GEN7_SOURCE,
    ...overrides,
  };
}

function unrelatedRows() {
  return {
    generation8: [gen8("Pound")],
    generation7: [gen7("Pound")],
  };
}

function historicalProof(
  sourceName: string,
  selectedGame: HistoricalScalarProof["selectedGame"],
  overrides: Partial<HistoricalScalarProof> = {},
): HistoricalScalarProof {
  const sourceKey = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    sourceName,
    sourceKey,
    selectedGame,
    typeSourceKey: "normal",
    category: "physical",
    basePp: 20,
    power: 80,
    accuracy: 80,
    sourceRecordId: PROOF_SOURCE,
    ...overrides,
  };
}

function bdspEvidence(
  sourceName: string,
  overrides: Partial<BdspHistoricalScalarEvidence> = {},
): BdspHistoricalScalarEvidence {
  const moveSourceKey = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    moveSourceKey,
    typeSourceKey: "normal",
    category: "physical",
    basePp: 20,
    power: 80,
    accuracy: 80,
    sourceRecordId: "source:bulbapedia:species-bdsp-learnset",
    ...overrides,
  };
}

describe("MOVE-01 mainline fact selection", () => {
  it("materializes BDSP scalar proof only from consistent selected-game learnset tuples", () => {
    const requests = [
      {
        sourceName: "Submission",
        sourceKey: "submission",
        selectedGame: "brilliant-diamond-shining-pearl" as const,
      },
    ];
    const generation8 = [
      gen8("Submission", {
        swordShieldAvailability: "usable",
        bdspAvailability: "usable",
      }),
    ];

    expect(
      materializeBdspHistoricalScalarProofs({
        requests,
        generation8,
        evidence: [
          bdspEvidence("Submission", { sourceRecordId: "source:bulbapedia:a-bdsp-learnset" }),
          bdspEvidence("Submission", { sourceRecordId: "source:bulbapedia:b-bdsp-learnset" }),
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        sourceName: "Submission",
        sourceKey: "submission",
        selectedGame: "brilliant-diamond-shining-pearl",
        sourceRecordId: "source:bulbapedia:a-bdsp-learnset",
        power: 80,
        accuracy: 80,
        basePp: 20,
      }),
    ]);

    expect(() =>
      materializeBdspHistoricalScalarProofs({
        requests,
        generation8,
        evidence: [
          bdspEvidence("Submission", { power: 80 }),
          bdspEvidence("Submission", { power: 70, sourceRecordId: "source:bulbapedia:other" }),
        ],
      }),
    ).toThrow(/disagrees across Species learnsets/i);
  });

  it("fails BDSP proof materialization when the Move lacks BDSP learnset evidence or usable BDSP availability", () => {
    const request = {
      sourceName: "Submission",
      sourceKey: "submission",
      selectedGame: "brilliant-diamond-shining-pearl" as const,
    };
    expect(() =>
      materializeBdspHistoricalScalarProofs({
        requests: [request],
        generation8: [gen8("Submission", { bdspAvailability: "usable" })],
        evidence: [],
      }),
    ).toThrow(/BDSP learnset scalar proof is missing/i);

    expect(() =>
      materializeBdspHistoricalScalarProofs({
        requests: [request],
        generation8: [gen8("Submission", { bdspAvailability: "unusable" })],
        evidence: [bdspEvidence("Submission")],
      }),
    ).toThrow(/lacks usable Generation VIII BDSP availability/i);
  });

  it("requests historical scalar proof only for the selected fallback game", () => {
    expect(
      requiredHistoricalScalarProof({
        pokemonDbMove: pokemonDbMove("Tackle"),
        generation9: [gen9("Tackle", "usable")],
        generation8: [],
        generation7: [],
      }),
    ).toBeNull();

    expect(
      requiredHistoricalScalarProof({
        pokemonDbMove: pokemonDbMove("Submission"),
        generation9: [gen9("Submission", "unusable")],
        generation8: [
          gen8("Submission", {
            swordShieldAvailability: "usable",
            bdspAvailability: "usable",
          }),
        ],
        generation7: [gen7("Pound")],
      }),
    ).toEqual({
      sourceName: "Submission",
      sourceKey: "submission",
      selectedGame: "brilliant-diamond-shining-pearl",
    });
  });

  it("selects final Scarlet/Violet facts for a usable Move", () => {
    const selected = selectMainlineMoveFacts({
      pokemonDbMove: pokemonDbMove("Tackle", { makesContact: false, sourceTarget: "all-adjacent" }),
      generation9: [gen9("Tackle", "usable", { typeSourceKey: "normal", power: 40, basePp: 35 })],
      generation8: [],
      generation7: [],
    });

    expect(selected).toMatchObject({
      typeSourceKey: "normal",
      category: "physical",
      power: 40,
      accuracy: 100,
      basePp: 35,
      makesContact: false,
      sourceTarget: "all-adjacent",
      mainlineSelectedGame: "scarlet-violet",
      mainlineSelectedSourceRecordId: GEN9_SOURCE,
      mainlineSourceRecordIds: [GEN9_SOURCE],
    });
  });

  it("falls back from unusable SV to Sword/Shield for Snap Trap while ignoring LA", () => {
    const selected = selectMainlineMoveFacts({
      pokemonDbMove: pokemonDbMove("Snap Trap"),
      generation9: [gen9("Snap Trap", "unusable", { typeSourceKey: "grass", power: 35, basePp: 15 })],
      generation8: [
        gen8("Snap Trap", {
          typeSourceKey: "grass",
          basePp: 15,
          power: 35,
          accuracy: 100,
          swordShieldAvailability: "usable",
          bdspAvailability: "unusable",
          legendsArceusAvailability: "usable",
        }),
      ],
      generation7: [gen7("Pound")],
      historicalScalarProofs: [
        historicalProof("Snap Trap", "sword-shield", {
          typeSourceKey: "grass",
          basePp: 15,
          power: 35,
          accuracy: 100,
        }),
      ],
    });

    expect(selected.mainlineSelectedGame).toBe("sword-shield");
    expect(selected.mainlineSourceRecordIds).toEqual([GEN9_SOURCE, GEN8_SOURCE, PROOF_SOURCE]);
    expect(selected.mainlineSelectedSourceRecordId).toBe(PROOF_SOURCE);
    expect(selected).toMatchObject({ typeSourceKey: "grass", power: 35, basePp: 15 });
  });

  it("prefers BDSP over Sword/Shield when Submission is usable in both", () => {
    const selected = selectMainlineMoveFacts({
      pokemonDbMove: pokemonDbMove("Submission"),
      generation9: [gen9("Submission", "unusable")],
      generation8: [
        gen8("Submission", {
          typeSourceKey: "fighting",
          basePp: 20,
          power: 80,
          accuracy: 80,
          swordShieldAvailability: "usable",
          bdspAvailability: "usable",
        }),
      ],
      generation7: [gen7("Pound")],
      historicalScalarProofs: [
        historicalProof("Submission", "brilliant-diamond-shining-pearl", {
          typeSourceKey: "fighting",
          basePp: 20,
          power: 80,
          accuracy: 80,
        }),
      ],
    });

    expect(selected.mainlineSelectedGame).toBe("brilliant-diamond-shining-pearl");
    expect(selected.mainlineSelectedSourceRecordId).toBe(PROOF_SOURCE);
    expect(selected).toMatchObject({ typeSourceKey: "fighting", power: 80, accuracy: 80 });
  });

  it("falls through Gen VIII to USUM before SM and ignores Let's Go", () => {
    const selected = selectMainlineMoveFacts({
      pokemonDbMove: pokemonDbMove("Old Move"),
      generation9: [gen9("Old Move", "unmarked")],
      generation8: [
        gen8("Old Move", {
          swordShieldAvailability: "unusable",
          bdspAvailability: "unusable",
          legendsArceusAvailability: "usable",
        }),
      ],
      generation7: [
        gen7("Old Move", {
          typeSourceKey: "psychic",
          category: "special",
          basePp: 10,
          power: 90,
          accuracy: 95,
          sunMoonAvailability: "usable",
          ultraSunUltraMoonAvailability: "usable",
          letsGoPikachuEeveeAvailability: "usable",
        }),
      ],
      historicalScalarProofs: [
        historicalProof("Old Move", "ultra-sun-ultra-moon", {
          typeSourceKey: "psychic",
          category: "special",
          basePp: 10,
          power: 90,
          accuracy: 95,
        }),
      ],
    });

    expect(selected.mainlineSelectedGame).toBe("ultra-sun-ultra-moon");
    expect(selected.mainlineSourceRecordIds).toEqual([
      GEN9_SOURCE,
      GEN8_SOURCE,
      GEN7_SOURCE,
      PROOF_SOURCE,
    ]);
    expect(selected).toMatchObject({
      typeSourceKey: "psychic",
      category: "special",
      power: 90,
      accuracy: 95,
      basePp: 10,
    });
  });

  it("fails closed when no approved traditional fallback is usable", () => {
    expect(() =>
      selectMainlineMoveFacts({
        pokemonDbMove: pokemonDbMove("Lost Move"),
        generation9: [gen9("Lost Move", "unusable")],
        generation8: [gen8("Lost Move", { legendsArceusAvailability: "usable" })],
        generation7: [gen7("Lost Move", { letsGoPikachuEeveeAvailability: "usable" })],
      }),
    ).toThrow(/no usable traditional mainline fallback/i);
  });

  it("fails closed when historical availability exists but selected-game scalar proof is absent", () => {
    expect(() =>
      selectMainlineMoveFacts({
        pokemonDbMove: pokemonDbMove("Submission"),
        generation9: [gen9("Submission", "unusable")],
        generation8: [
          gen8("Submission", {
            swordShieldAvailability: "usable",
            bdspAvailability: "usable",
          }),
        ],
        generation7: [gen7("Pound")],
      }),
    ).toThrow(/HistoricalScalarProof required/i);
  });

  it("ignores current PokémonDB scalar drift and keeps only target/contact plus identity metadata", () => {
    const selected = selectMainlineMoveFacts({
      pokemonDbMove: pokemonDbMove("Apple Acid", {
        typeSourceKey: "steel",
        category: "physical",
        basePp: 1,
        power: 90,
        accuracy: 50,
        makesContact: false,
        sourceTarget: "adjacent-foe",
      }),
      generation9: [
        gen9("Apple Acid", "usable", {
          typeSourceKey: "grass",
          category: "special",
          basePp: 10,
          power: 80,
          accuracy: 100,
        }),
      ],
      generation8: [],
      generation7: [],
    });

    expect(selected).toMatchObject({
      typeSourceKey: "grass",
      category: "special",
      basePp: 10,
      power: 80,
      accuracy: 100,
      makesContact: false,
      sourceTarget: "adjacent-foe",
      sourceRecordId: "source:pokemondb:apple-acid",
    });
  });

  it("fails closed on missing, duplicate, or exact-name-mismatched joins", () => {
    const fallback = unrelatedRows();
    expect(() =>
      selectMainlineMoveFacts({
        pokemonDbMove: pokemonDbMove("Tackle"),
        generation9: [gen9("Pound", "usable")],
        ...fallback,
      }),
    ).toThrow(/missing Move join key tackle/i);

    expect(() =>
      selectMainlineMoveFacts({
        pokemonDbMove: pokemonDbMove("Tackle"),
        generation9: [gen9("Tackle", "usable"), gen9("Tackle", "usable", { index: 2 })],
        ...fallback,
      }),
    ).toThrow(/duplicate Move join key tackle/i);

    expect(() =>
      selectMainlineMoveFacts({
        pokemonDbMove: pokemonDbMove("King's Shield"),
        generation9: [
          gen9("Kings Shield", "usable", { sourceKey: "kings-shield" }),
        ],
        ...fallback,
      }),
    ).toThrow(/Move name mismatch/i);
  });

  it("ignores unrelated duplicate source names while keeping the requested Move join exact", () => {
    const selected = selectMainlineMoveFacts({
      pokemonDbMove: pokemonDbMove("Tackle"),
      generation9: [
        gen9("Breakneck Blitz", "unusable", { index: 622, category: "physical" }),
        gen9("Breakneck Blitz", "unusable", { index: 623, category: "special" }),
        gen9("Tackle", "usable", { index: 33 }),
      ],
      ...unrelatedRows(),
    });

    expect(selected).toMatchObject({
      sourceName: "Tackle",
      mainlineSelectedGame: "scarlet-violet",
    });
  });
});
