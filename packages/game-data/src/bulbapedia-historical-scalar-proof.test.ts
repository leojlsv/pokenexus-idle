import { describe, expect, it } from "vitest";
import {
  BULBAPEDIA_BDSP_TRADITIONAL_CUTOFF,
  BULBAPEDIA_HISTORICAL_SCALAR_PROOF_PARSER_VERSION,
  BULBAPEDIA_SM_TRADITIONAL_CUTOFF,
  BULBAPEDIA_SWSH_TRADITIONAL_CUTOFF,
  BULBAPEDIA_USUM_TRADITIONAL_CUTOFF,
  buildBulbapediaHistoricalScalarProofUrl,
  parseBulbapediaHistoricalScalarProof,
  type HistoricalScalarSelectedGame,
} from "./bulbapedia-historical-scalar-proof";

const SOURCE_RECORD_ID = "source:bulbapedia:tackle-historical-proof";

function gameAbbreviation(game: HistoricalScalarSelectedGame): string {
  switch (game) {
    case "brilliant-diamond-shining-pearl":
      return "BDSP";
    case "sword-shield":
      return "SwSh";
    case "ultra-sun-ultra-moon":
      return "USUM";
    case "sun-moon":
      return "SM";
  }
}

function generationTemplate(game: HistoricalScalarSelectedGame): string {
  return game === "brilliant-diamond-shining-pearl" || game === "sword-shield"
    ? "gameabbrev8"
    : "gameabbrev7";
}

function cutoffForGame(game: HistoricalScalarSelectedGame): string {
  switch (game) {
    case "brilliant-diamond-shining-pearl":
      return BULBAPEDIA_BDSP_TRADITIONAL_CUTOFF;
    case "sword-shield":
      return BULBAPEDIA_SWSH_TRADITIONAL_CUTOFF;
    case "ultra-sun-ultra-moon":
      return BULBAPEDIA_USUM_TRADITIONAL_CUTOFF;
    case "sun-moon":
      return BULBAPEDIA_SM_TRADITIONAL_CUTOFF;
  }
}

function wikitext(
  name: string,
  game: HistoricalScalarSelectedGame,
  overrides: Partial<Record<"name" | "type" | "damagecategory" | "basepp" | "power" | "accuracy", string>> = {},
): string {
  const values = {
    name,
    type: "Normal",
    damagecategory: "Physical",
    basepp: "35",
    power: "40",
    accuracy: "100",
    ...overrides,
  };
  return `{{MoveInfobox
|name=${values.name}
|jname=たいあたり
|type=${values.type}
|damagecategory=${values.damagecategory}
|basepp=${values.basepp}
|maxpp=56
|power=${values.power}
|accuracy=${values.accuracy}
|target=anyadjacent
}}
==Description==
{{movedesc|Normal}}
{{movedescentry|{{${generationTemplate(game)}|${gameAbbreviation(game)}}}|Historical flavor text only.}}
==Learnset==`;
}

function response(
  name: string,
  game: HistoricalScalarSelectedGame,
  content = wikitext(name, game),
  timestamp?: string,
): unknown {
  const cutoff = cutoffForGame(game);
  return {
    batchcomplete: true,
    query: {
      pages: [
        {
          pageid: 123,
          ns: 0,
          title: `${name} (move)`,
          revisions: [
            {
              revid: 456,
              parentid: 455,
              timestamp: timestamp ?? cutoff,
              slots: { main: { content } },
            },
          ],
        },
      ],
    },
  };
}

function source(name: string, game: HistoricalScalarSelectedGame, payload = response(name, game)) {
  return {
    url: buildBulbapediaHistoricalScalarProofUrl(name, game),
    sourceRecordId: SOURCE_RECORD_ID,
    json: payload,
  };
}

describe("Bulbapedia historical scalar proof parser", () => {
  it("exports game-specific final traditional cutoffs and a deterministic canonical MediaWiki API URL", () => {
    expect(BULBAPEDIA_HISTORICAL_SCALAR_PROOF_PARSER_VERSION).toBe(
      "bulbapedia-historical-scalar-proof-v1",
    );
    expect(BULBAPEDIA_BDSP_TRADITIONAL_CUTOFF).toBe("2022-01-27T23:59:59Z");
    expect(BULBAPEDIA_SWSH_TRADITIONAL_CUTOFF).toBe("2021-11-18T23:59:59Z");
    expect(BULBAPEDIA_USUM_TRADITIONAL_CUTOFF).toBe("2018-11-15T23:59:59Z");
    expect(BULBAPEDIA_SM_TRADITIONAL_CUTOFF).toBe("2017-11-16T23:59:59Z");
    expect(buildBulbapediaHistoricalScalarProofUrl("King's Shield", "sword-shield")).toBe(
      "https://bulbapedia.bulbagarden.net/w/api.php?action=query&format=json&formatversion=2&prop=revisions&titles=King's%20Shield%20(move)&rvprop=ids%7Ctimestamp%7Ccontent&rvslots=main&rvlimit=1&rvstart=2021-11-18T23%3A59%3A59Z&rvdir=older",
    );
    expect(buildBulbapediaHistoricalScalarProofUrl("Tackle", "sun-moon")).toContain(
      "rvstart=2017-11-16T23%3A59%3A59Z",
    );
  });

  it.each([
    "brilliant-diamond-shining-pearl",
    "sword-shield",
    "ultra-sun-ultra-moon",
    "sun-moon",
  ] as const)("extracts scalar proof for selected traditional game %s", (game) => {
    expect(parseBulbapediaHistoricalScalarProof(source("Tackle", game), "Tackle", game)).toEqual({
      sourceName: "Tackle",
      sourceKey: "tackle",
      selectedGame: game,
      typeSourceKey: "normal",
      category: "physical",
      basePp: 35,
      power: 40,
      accuracy: 100,
      sourceRecordId: SOURCE_RECORD_ID,
    });
  });

  it("uses the visible first argument of tt and maps semantic dashes to null", () => {
    const game = "sword-shield" as const;
    const content = wikitext("Guillotine", game, {
      type: "{{tt|Normal|historical annotation}}",
      damagecategory: "{{tt|Physical|pre-split-compatible visible value}}",
      basepp: "{{tt|5|historical PP}}",
      power: "{{tt|—|no ordinary power}}",
      accuracy: "{{tt|—|special accuracy semantics}}",
    });
    expect(
      parseBulbapediaHistoricalScalarProof(
        source("Guillotine", game, response("Guillotine", game, content)),
        "Guillotine",
        game,
      ),
    ).toMatchObject({
      typeSourceKey: "normal",
      category: "physical",
      basePp: 5,
      power: null,
      accuracy: null,
    });
  });

  it("maps exact historical Power Varies to semantic null without relaxing Accuracy", () => {
    const game = "ultra-sun-ultra-moon" as const;
    const variesPower = wikitext("Return", game, {
      power: "Varies",
      accuracy: "100",
    });
    expect(
      parseBulbapediaHistoricalScalarProof(
        source("Return", game, response("Return", game, variesPower)),
        "Return",
        game,
      ),
    ).toMatchObject({
      power: null,
      accuracy: 100,
    });

    const variesAccuracy = wikitext("Return", game, {
      power: "Varies",
      accuracy: "Varies",
    });
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        source("Return", game, response("Return", game, variesAccuracy)),
        "Return",
        game,
      ),
    ).toThrow(/accuracy: expected exact integer/i);
  });

  it("fails closed when a tt annotation contains game-specific scalar evidence", () => {
    const game = "sword-shield" as const;
    const content = wikitext("Tackle", game, {
      power: "{{tt|40|50 in SwSh}}",
    });
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        source("Tackle", game, response("Tackle", game, content)),
        "Tackle",
        game,
      ),
    ).toThrow(/game-specific scalar evidence.*ambiguous/i);
  });

  it("accepts a JSON text payload and rejects malformed JSON or both payload forms", () => {
    const game = "sun-moon" as const;
    const valid = source("Tackle", game);
    expect(
      parseBulbapediaHistoricalScalarProof(
        { url: valid.url, sourceRecordId: SOURCE_RECORD_ID, text: JSON.stringify(valid.json) },
        "Tackle",
        game,
      ).sourceKey,
    ).toBe("tackle");
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        { url: valid.url, sourceRecordId: SOURCE_RECORD_ID, text: "{" },
        "Tackle",
        game,
      ),
    ).toThrow(/malformed JSON/i);
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        { ...valid, text: JSON.stringify(valid.json) },
        "Tackle",
        game,
      ),
    ).toThrow(/exactly one of json or text/i);
  });

  it("rejects any URL drift, extra query parameter, wrong game cutoff, or title mismatch", () => {
    const game = "sword-shield" as const;
    const valid = source("Tackle", game);
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        { ...valid, url: `${valid.url}&origin=*` },
        "Tackle",
        game,
      ),
    ).toThrow(/unexpected Bulbapedia historical scalar proof URL/i);
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        {
          ...valid,
          url: valid.url.replace(
            BULBAPEDIA_SWSH_TRADITIONAL_CUTOFF.replace(/:/g, "%3A"),
            BULBAPEDIA_USUM_TRADITIONAL_CUTOFF.replace(/:/g, "%3A"),
          ),
        },
        "Tackle",
        game,
      ),
    ).toThrow(/unexpected Bulbapedia historical scalar proof URL/i);
    const mismatched = response("Tackle", game) as { query: { pages: Array<{ title: string }> } };
    mismatched.query.pages[0].title = "Pound (move)";
    expect(() =>
      parseBulbapediaHistoricalScalarProof(source("Tackle", game, mismatched), "Tackle", game),
    ).toThrow(/title mismatch/i);
  });

  it("rejects malformed page/revision structure and revisions newer than the cutoff", () => {
    const game = "ultra-sun-ultra-moon" as const;
    const noPages = response("Tackle", game) as { query: { pages: unknown[] } };
    noPages.query.pages = [];
    expect(() =>
      parseBulbapediaHistoricalScalarProof(source("Tackle", game, noPages), "Tackle", game),
    ).toThrow(/exactly one page/i);

    const twoRevisions = response("Tackle", game) as {
      query: { pages: Array<{ revisions: unknown[] }> };
    };
    twoRevisions.query.pages[0].revisions.push(twoRevisions.query.pages[0].revisions[0]);
    expect(() =>
      parseBulbapediaHistoricalScalarProof(source("Tackle", game, twoRevisions), "Tackle", game),
    ).toThrow(/exactly one revision/i);

    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        source("Tackle", game, response("Tackle", game, undefined, "2018-11-16T00:00:00.000Z")),
        "Tackle",
        game,
      ),
    ).toThrow(/exceeds cutoff/i);
  });

  it("requires exactly one balanced MoveInfobox and every selected scalar exactly once", () => {
    const game = "brilliant-diamond-shining-pearl" as const;
    const noInfobox = `{{movedescentry|{{gameabbrev8|BDSP}}|text}}`;
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        source("Tackle", game, response("Tackle", game, noInfobox)),
        "Tackle",
        game,
      ),
    ).toThrow(/exactly one MoveInfobox/i);

    const duplicateInfobox = `${wikitext("Tackle", game)}\n${wikitext("Tackle", game)}`;
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        source("Tackle", game, response("Tackle", game, duplicateInfobox)),
        "Tackle",
        game,
      ),
    ).toThrow(/exactly one MoveInfobox/i);

    const unbalanced = wikitext("Tackle", game).replace("|target=anyadjacent\n}}", "|target={{tt|x|y}\n}}");
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        source("Tackle", game, response("Tackle", game, unbalanced)),
        "Tackle",
        game,
      ),
    ).toThrow(/unbalanced/i);

    const duplicatePower = wikitext("Tackle", game).replace("|power=40", "|power=40\n|power=50");
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        source("Tackle", game, response("Tackle", game, duplicatePower)),
        "Tackle",
        game,
      ),
    ).toThrow(/field power must appear exactly once/i);

    const missingAccuracy = wikitext("Tackle", game).replace("|accuracy=100\n", "");
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        source("Tackle", game, response("Tackle", game, missingAccuracy)),
        "Tackle",
        game,
      ),
    ).toThrow(/field accuracy must appear exactly once/i);
  });

  it("rejects unknown nested templates in selected fields and identity mismatches", () => {
    const game = "sword-shield" as const;
    const unknownTemplate = wikitext("Tackle", game, { power: "{{unknown|40}}" });
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        source("Tackle", game, response("Tackle", game, unknownTemplate)),
        "Tackle",
        game,
      ),
    ).toThrow(/unknown nested template/i);

    const wrongName = wikitext("Tackle", game, { name: "Pound" });
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        source("Tackle", game, response("Tackle", game, wrongName)),
        "Tackle",
        game,
      ),
    ).toThrow(/MoveInfobox name mismatch/i);
  });

  it("requires selected-game evidence inside a movedescentry game-abbrev template", () => {
    const game = "sun-moon" as const;
    const wrongGame = wikitext("Tackle", "ultra-sun-ultra-moon");
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        source("Tackle", game, response("Tackle", game, wrongGame)),
        "Tackle",
        game,
      ),
    ).toThrow(/game-abbrev evidence for SM/i);

    const bareAbbreviation = wikitext("Tackle", game).replace(
      "{{movedescentry|{{gameabbrev7|SM}}|Historical flavor text only.}}",
      "SM is mentioned in prose only.",
    );
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        source("Tackle", game, response("Tackle", game, bareAbbreviation)),
        "Tackle",
        game,
      ),
    ).toThrow(/game-abbrev evidence for SM/i);
  });

  it("accepts exact structured combined game-abbreviation bundles without substring inference", () => {
    const bdsp = wikitext("Submission", "brilliant-diamond-shining-pearl").replace(
      "{{gameabbrev8|BDSP}}",
      "{{gameabbrev8|SwShBDSP}}",
    );
    expect(
      parseBulbapediaHistoricalScalarProof(
        source(
          "Submission",
          "brilliant-diamond-shining-pearl",
          response("Submission", "brilliant-diamond-shining-pearl", bdsp),
        ),
        "Submission",
        "brilliant-diamond-shining-pearl",
      ).selectedGame,
    ).toBe("brilliant-diamond-shining-pearl");

    const usum = wikitext("Karate Chop", "ultra-sun-ultra-moon").replace(
      "{{gameabbrev7|USUM}}",
      "{{gameabbrev7|SMUSUMPE}}",
    );
    expect(
      parseBulbapediaHistoricalScalarProof(
        source(
          "Karate Chop",
          "ultra-sun-ultra-moon",
          response("Karate Chop", "ultra-sun-ultra-moon", usum),
        ),
        "Karate Chop",
        "ultra-sun-ultra-moon",
      ).selectedGame,
    ).toBe("ultra-sun-ultra-moon");

    const usumOnly = wikitext("Tackle", "ultra-sun-ultra-moon");
    expect(() =>
      parseBulbapediaHistoricalScalarProof(
        source("Tackle", "sun-moon", response("Tackle", "sun-moon", usumOnly)),
        "Tackle",
        "sun-moon",
      ),
    ).toThrow(/game-abbrev evidence for SM/i);
  });
});
