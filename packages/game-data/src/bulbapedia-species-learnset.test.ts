import { describe, expect, it } from "vitest";
import {
  parseBulbapediaCurrentSpeciesBaseGen9Learnset,
  parseBulbapediaCurrentSpeciesFormLearnset,
  parseBulbapediaGen7FormLearnset,
  parseBulbapediaGen8GalarianFormLearnset,
} from "./bulbapedia-species-learnset";

const CURRENT_URL =
  "https://bulbapedia.bulbagarden.net/wiki/Raichu_(Pok%C3%A9mon)";
const SOURCE_RECORD_ID = "source:bulbapedia:raichu-current";
const SPECIES_SOURCE_KEY = "pokedex:raichu:26";

function moveLink(name: string): string {
  return `<a href="/wiki/${name.replace(/ /g, "_")}_(move)">${name}</a>`;
}

function sortable(headers: string[], rowHtml: string[]): string {
  return `<table class="sortable">
    <tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>
    ${rowHtml.join("")}
  </table>`;
}

function generationBlock(
  generation: "VII" | "VIII" | "IX",
  headers: string[],
  rowHtml: string[],
): string {
  return `<table class="roundy">
    <tr><td><table><tr><th><big><big><big>Generation ${generation}</big></big></big></th></tr></table></td></tr>
    <tr><td>${sortable(headers, rowHtml)}</td></tr>
  </table>`;
}

function levelRow(level: string, move: string): string {
  return `<tr><td>${level}</td><td>${moveLink(move)}</td><td>10</td></tr>`;
}

function machineRow(identifier: string, move: string): string {
  return `<tr><td>${identifier}</td><td>${moveLink(move)}</td><td>10</td></tr>`;
}

function currentSource(methods: string, url = CURRENT_URL) {
  return {
    url,
    sourceRecordId: SOURCE_RECORD_ID,
    html: `<main><h3>Learnset</h3>${methods}</main>`,
  };
}

function currentBase(methods: string, baseSourceName = "Raichu") {
  return parseBulbapediaCurrentSpeciesBaseGen9Learnset({
    source: currentSource(methods),
    speciesSourceKey: SPECIES_SOURCE_KEY,
    baseSourceName,
  });
}

function currentForm(methods: string, formLabel = "Alolan Raichu", baseSourceName = "Raichu") {
  return parseBulbapediaCurrentSpeciesFormLearnset({
    source: currentSource(methods),
    speciesSourceKey: "pokedex:raichu:10100",
    baseSourceName,
    formLabel,
  });
}

describe("Bulbapedia current Species-page Learnset parser", () => {
  it("extracts an exact traditional Generation IX base Learnset", () => {
    const parsed = currentBase(
      `<h4>By leveling up</h4>${generationBlock("IX", ["Level", "Move", "PP"], [
        levelRow("1", "Thunder Shock"),
      ])}`,
    );

    expect(parsed).toEqual([
      {
        speciesSourceKey: SPECIES_SOURCE_KEY,
        moveSourceKey: "thunder-shock",
        sourceGeneration: 9,
        sourceGame: "Scarlet/Violet",
        method: "level-up",
        level: 1,
        machineIdentifier: null,
        sourceRecordId: SOURCE_RECORD_ID,
      },
    ]);
  });

  it("binds an exact regional form heading without falling back to the base form", () => {
    const parsed = currentForm(
      `<h4>By leveling up</h4>
       <h5>Raichu</h5>${generationBlock("IX", ["Level", "Move", "PP"], [levelRow("1", "Thunder Shock")])}
       <h5>Alolan Raichu</h5>${generationBlock("IX", ["Level", "Move", "PP"], [levelRow("5", "Psychic")])}`,
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      speciesSourceKey: "pokedex:raichu:10100",
      moveSourceKey: "psychic",
      sourceGeneration: 9,
      sourceGame: "Scarlet/Violet",
      level: 5,
    });
  });

  it("accepts a directly shared unscoped method for a form only when the method has no form headings", () => {
    const parsed = currentForm(
      `<h4>By leveling up</h4>
       <h5>Raichu</h5>${generationBlock("IX", ["Level", "Move", "PP"], [levelRow("1", "Thunder Shock")])}
       <h5>Alolan Raichu</h5>${generationBlock("IX", ["Level", "Move", "PP"], [levelRow("5", "Psychic")])}
       <h4>By breeding</h4>
       ${generationBlock("IX", ["Move", "PP"], [
         `<tr><td>${moveLink("Charge")}</td><td>20</td></tr>`,
       ])}`,
    );

    expect(parsed.map((entry) => [entry.method, entry.moveSourceKey])).toEqual([
      ["level-up", "psychic"],
      ["egg", "charge"],
    ]);
  });
  it("uses the exact Paldean Tauros heading alias for canonical breed labels", () => {
    const parsed = parseBulbapediaCurrentSpeciesFormLearnset({
      source: {
        url: "https://bulbapedia.bulbagarden.net/wiki/Tauros_(Pok%C3%A9mon)",
        sourceRecordId: "source:bulbapedia:tauros-current",
        html: `<h3>Learnset</h3><h4>By leveling up</h4>
          <h5>Paldean Tauros (Combat Breed)</h5>
          ${generationBlock("IX", ["Level", "Move", "PP"], [levelRow("1", "Tackle")])}`,
      },
      speciesSourceKey: "pokedex:tauros:combat",
      baseSourceName: "Tauros",
      formLabel: "Combat Breed",
    });

    expect(parsed[0]).toMatchObject({
      speciesSourceKey: "pokedex:tauros:combat",
      moveSourceKey: "tackle",
      sourceGeneration: 9,
    });
  });

  it("returns null when a current Species page exposes multiple historical traditional tables but no Generation IX table", () => {
    const parsed = currentBase(
      `<h4>By leveling up</h4>
       <p>BDSP</p>
       ${generationBlock("VIII", ["Level", "Move", "PP"], [levelRow("1", "Scratch")])}
       <p>Legends: Arceus</p>
       ${generationBlock("VIII", ["Level", "Move", "PP"], [levelRow("2", "Absorb")])}`,
      "Paras",
    );

    expect(parsed).toBeNull();
  });
  it("returns null for a Z-A CD-only base block instead of treating the wrapper as traditional Generation IX", () => {
    const cdOnly = `<table class="roundy">
      <tr><td><table><tr><th><big><big><big>Generation IX</big></big></big></th></tr></table></td></tr>
      <tr><td>${sortable(["Learn", "Plus", "Move", "CD"], [
        `<tr><td>1</td><td>10</td><td>${moveLink("Poison Sting")}</td><td>6</td></tr>`,
      ])}</td></tr>
    </table>`;

    expect(
      currentBase(`<h4>By leveling up</h4>${cdOnly}`, "Weedle"),
    ).toBeNull();
  });

  it("accepts exact empty TM and breeding statements while retaining other accepted methods", () => {
    const parsed = currentBase(
      `<h4>By leveling up</h4>${generationBlock("IX", ["Level", "Move", "PP"], [levelRow("1", "Tackle")])}
       <h4>By TM</h4><p>This Pok\u00e9mon learns no moves by TM.</p>
       <h4>By breeding</h4><p>This Pok\u00e9mon learns no moves by breeding.</p>`,
    );

    expect(parsed?.map((entry) => entry.moveSourceKey)).toEqual(["tackle"]);
  });

  it("does not treat a Z-A CD-only table as contradicting an exact empty current TM statement", () => {
    const cdOnly = `<table class="roundy">
      <tr><td><table><tr><th><big><big><big>Generation IX</big></big></big></th></tr></table></td></tr>
      <tr><td>${sortable(["TM", "Move", "CD"], [
        `<tr><td>TM096</td><td>${moveLink("Hydro Pump")}</td><td>12</td></tr>`,
      ])}</td></tr>
    </table>`;
    const parsed = currentBase(
      `<h4>By leveling up</h4>${generationBlock("IX", ["Level", "Move", "PP"], [levelRow("1", "Splash")])}
       <h4>By TM</h4><p>This Pok\u00e9mon learns no moves by TM.</p>${cdOnly}`,
      "Magikarp",
    );

    expect(parsed?.map((entry) => entry.moveSourceKey)).toEqual(["splash"]);
  });

  it("still rejects an exact empty current TM statement that contains a Generation IX traditional TM table", () => {
    expect(() =>
      currentBase(
        `<h4>By leveling up</h4>${generationBlock("IX", ["Level", "Move", "PP"], [levelRow("1", "Splash")])}
         <h4>By TM</h4><p>This Pok\u00e9mon learns no moves by TM.</p>
         ${generationBlock("IX", ["TM", "Move", "PP"], [machineRow("TM001", "Tackle")])}`,
        "Magikarp",
      ),
    ).toThrow(/declares no moves but contains Move rows/i);
  });

  it("fails closed when a method is neither structurally parseable nor explicitly empty", () => {
    expect(() =>
      currentBase(
        `<h4>By leveling up</h4>${generationBlock("IX", ["Level", "Move", "PP"], [levelRow("1", "Tackle")])}
         <h4>By TM</h4><p>No machine data available.</p>`,
      ),
    ).toThrow(/expected exactly one .*traditional sortable Move table/i);
  });

  it("accepts the exact structured Generation IX TM version annotation independent of attribute order", () => {
    const parsed = currentBase(
      `<h4>By leveling up</h4>${generationBlock("IX", ["Level", "Move", "PP"], [levelRow("1", "Tackle")])}
       <h4>By TM</h4>${generationBlock("IX", ["TM", "Move", "PP"], [
         machineRow(
           'TM158<span title="Version 2.0.1 onwards" class="explain">*</span>',
           "Focus Blast",
         ),
       ])}`,
    );

    expect(parsed?.find((entry) => entry.method === "machine")?.machineIdentifier).toBe("TM158");
  });

  it("rejects an arbitrary machine suffix that lacks the exact structured version annotation", () => {
    expect(() =>
      currentBase(
        `<h4>By leveling up</h4>${generationBlock("IX", ["Level", "Move", "PP"], [levelRow("1", "Tackle")])}
         <h4>By TM</h4>${generationBlock("IX", ["TM", "Move", "PP"], [
           machineRow("TM158<span>*</span>", "Focus Blast"),
         ])}`,
      ),
    ).toThrow(/invalid Generation 9 machine identifier/i);
  });

  it("accepts an exact structured Generation IX level version annotation", () => {
    const parsed = currentBase(
      `<h4>By leveling up</h4>${generationBlock("IX", ["Level", "Move", "PP"], [
        levelRow(
          '15<span title="Version 3.0.0 onwards" class="explain">*</span>',
          "Defog",
        ),
      ])}`,
      "Noctowl",
    );

    expect(parsed?.[0]?.level).toBe(15);
    expect(parsed?.[0]?.moveSourceKey).toBe("defog");
  });

  it("rejects an arbitrary level suffix that lacks the exact structured version annotation", () => {
    expect(() =>
      currentBase(
        `<h4>By leveling up</h4>${generationBlock("IX", ["Level", "Move", "PP"], [
          levelRow('15<span>*</span>', "Defog"),
        ])}`,
        "Noctowl",
      ),
    ).toThrow(/expected positive integer/i);
  });

  it("uses unscoped base content before an alternate-form h5 without consuming the alternate block", () => {
    const parsed = parseBulbapediaCurrentSpeciesBaseGen9Learnset({
      source: {
        url: "https://bulbapedia.bulbagarden.net/wiki/Graveler_(Pok%C3%A9mon)",
        sourceRecordId: "source:bulbapedia:graveler-current",
        html: `<h3>Learnset</h3><h4>By leveling up</h4>
          ${generationBlock("IX", ["Level", "Move", "PP"], [levelRow("1", "Tackle")])}
          <h5>Alolan Graveler</h5>
          ${generationBlock("IX", ["Level", "Move", "PP"], [levelRow("2", "Spark")])}`,
      },
      speciesSourceKey: "pokedex:graveler:75",
      baseSourceName: "Graveler",
    });

    expect(parsed?.map((entry) => entry.moveSourceKey)).toEqual(["tackle"]);
  });

  it("excludes only exact Move Reminder level rows from the Core", () => {
    const reminder =
      '<span class="explain" title="Can only be learned via Move Reminder">Rem.</span>';
    const parsed = currentBase(
      `<h4>By leveling up</h4>${generationBlock("IX", ["Level", "Move", "PP"], [
        levelRow("1", "Metronome"),
        levelRow(reminder, "Pound"),
      ])}`,
    );

    expect(parsed?.map((entry) => entry.moveSourceKey)).toEqual(["metronome"]);
  });

  it("rejects an unstructured Rem. level marker instead of coercing or silently dropping it", () => {
    expect(() =>
      currentBase(
        `<h4>By leveling up</h4>${generationBlock("IX", ["Level", "Move", "PP"], [
          levelRow("Rem.", "Pound"),
        ])}`,
      ),
    ).toThrow(/expected positive integer/i);
  });

  it("rejects a wrong form heading rather than using another form's Learnset", () => {
    expect(() =>
      currentForm(
        `<h4>By leveling up</h4>
         <h5>Raichu</h5>${generationBlock("IX", ["Level", "Move", "PP"], [levelRow("1", "Thunder Shock")])}`,
      ),
    ).toThrow(/expected exactly one form heading Alolan Raichu/i);
  });

  it("rejects duplicate logical Learnset entries", () => {
    expect(() =>
      currentBase(
        `<h4>By leveling up</h4>${generationBlock("IX", ["Level", "Move", "PP"], [
          levelRow("1", "Tackle"),
          levelRow("1", "Tackle"),
        ])}`,
      ),
    ).toThrow(/duplicate logical entry/i);
  });

  it("requires exact current Species-page URLs", () => {
    expect(() =>
      parseBulbapediaCurrentSpeciesBaseGen9Learnset({
        source: currentSource(
          `<h4>By leveling up</h4>${generationBlock("IX", ["Level", "Move", "PP"], [levelRow("1", "Tackle")])}`,
          CURRENT_URL + "?oldid=1",
        ),
        speciesSourceKey: SPECIES_SOURCE_KEY,
        baseSourceName: "Raichu",
      }),
    ).toThrow(/unexpected Bulbapedia Species URL/i);
  });
});

describe("Bulbapedia Generation VIII exact Galarian form Learnset override", () => {
  const url =
    "https://bulbapedia.bulbagarden.net/wiki/Farfetch%27d_(Pok%C3%A9mon)/Generation_VIII_learnset";

  it("extracts exact Galarian level-up and TM/TR rows as Sword/Shield evidence", () => {
    const parsed = parseBulbapediaGen8GalarianFormLearnset({
      source: {
        url,
        sourceRecordId: "source:bulbapedia:farfetchd-gen8",
        html: `<h4>By leveling up</h4>
          <h5>Farfetch'd</h5>${generationBlock("VIII", ["Level", "Move", "PP"], [levelRow("1", "Peck")])}
          <h5>Galarian Farfetch'd</h5>${generationBlock("VIII", ["Level", "Move", "PP"], [levelRow("5", "Rock Smash")])}
          <h4>By TM/TR</h4>
          <h5>Farfetch'd</h5>${generationBlock("VIII", ["TM/TR", "Move", "PP"], [machineRow("TM12", "Solar Blade")])}
          <h5>Galarian Farfetch'd</h5>${generationBlock("VIII", ["TM/TR", "Move", "PP"], [machineRow("TR13", "Focus Energy")])}`,
      },
      speciesSourceKey: "pokedex:farfetchd:11123",
      baseSourceName: "Farfetch'd",
      formLabel: "Galarian Farfetch'd",
    });

    expect(parsed.map((entry) => ({
      move: entry.moveSourceKey,
      method: entry.method,
      level: entry.level,
      machine: entry.machineIdentifier,
      game: entry.sourceGame,
    }))).toEqual([
      {
        move: "rock-smash",
        method: "level-up",
        level: 5,
        machine: null,
        game: "Sword/Shield",
      },
      {
        move: "focus-energy",
        method: "machine",
        level: null,
        machine: "TR13",
        game: "Sword/Shield",
      },
    ]);
  });

  it("rejects non-Galarian forms on the Generation VIII Sword/Shield override path", () => {
    expect(() =>
      parseBulbapediaGen8GalarianFormLearnset({
        source: {
          url,
          sourceRecordId: "source:bulbapedia:farfetchd-gen8",
          html: "<h4>By leveling up</h4>",
        },
        speciesSourceKey: "pokedex:farfetchd:83",
        baseSourceName: "Farfetch'd",
        formLabel: "Farfetch'd",
      }),
    ).toThrow(/requires a Galarian form/i);
  });

  it("requires an exact Generation VIII Learnset URL", () => {
    expect(() =>
      parseBulbapediaGen8GalarianFormLearnset({
        source: {
          url: "https://bulbapedia.bulbagarden.net/wiki/Farfetch%27d_(Pok%C3%A9mon)",
          sourceRecordId: "source:bad",
          html: "<h4>By leveling up</h4>",
        },
        speciesSourceKey: "pokedex:farfetchd:11123",
        baseSourceName: "Farfetch'd",
        formLabel: "Galarian Farfetch'd",
      }),
    ).toThrow(/unexpected Bulbapedia Generation VIII form Learnset URL/i);
  });
});

describe("Bulbapedia Generation VII exact form Learnset override", () => {
  it("extracts the explicitly approved Alolan Rattata form block", () => {
    const parsed = parseBulbapediaGen7FormLearnset({
      source: {
        url: "https://bulbapedia.bulbagarden.net/wiki/Rattata_(Pok%C3%A9mon)/Generation_VII_learnset",
        sourceRecordId: "source:bulbapedia:rattata-gen7",
        html: `<h4>Pok\u00e9mon Sun, Moon , Ultra Sun and Ultra Moon</h4>
          <h5>By leveling up</h5>
          <h6>Rattata</h6>${sortable(["Level", "Move", "PP"], [levelRow("1", "Tackle")])}
          <h6>Alolan Rattata</h6>${sortable(["Level", "Move", "PP"], [levelRow("3", "Bite")])}`,
      },
      speciesSourceKey: "pokedex:rattata:10158",
      baseSourceName: "Rattata",
      formLabel: "Alolan Rattata",
    });

    expect(parsed).toEqual([
      {
        speciesSourceKey: "pokedex:rattata:10158",
        moveSourceKey: "bite",
        sourceGeneration: 7,
        sourceGame: "Sun/Moon/Ultra Sun/Ultra Moon",
        method: "level-up",
        level: 3,
        machineIdentifier: null,
        sourceRecordId: "source:bulbapedia:rattata-gen7",
      },
    ]);
  });

  it("binds Gen VII tutor Move identity when game applicability is encoded in row-header cells", () => {
    const tutorTable = `<table class="sortable">
      <tr><th colspan="4">Game</th><th>Move</th><th>PP</th></tr>
      <tr>
        <th>S</th><th>M</th><th>US</th><th>UM</th>
        <td>${moveLink("Covet")}</td><td>25</td>
      </tr>
    </table>`;
    const parsed = parseBulbapediaGen7FormLearnset({
      source: {
        url: "https://bulbapedia.bulbagarden.net/wiki/Rattata_(Pok%C3%A9mon)/Generation_VII_learnset",
        sourceRecordId: "source:bulbapedia:rattata-gen7",
        html: `<h4>Pok\u00e9mon Sun, Moon , Ultra Sun and Ultra Moon</h4>
          <h5>By tutoring</h5>
          <h6>Rattata</h6>${tutorTable}
          <h6>Alolan Rattata</h6>${tutorTable}`,
      },
      speciesSourceKey: "pokedex:rattata:10158",
      baseSourceName: "Rattata",
      formLabel: "Alolan Rattata",
    });

    expect(parsed).toEqual([
      {
        speciesSourceKey: "pokedex:rattata:10158",
        moveSourceKey: "covet",
        sourceGeneration: 7,
        sourceGame: "Sun/Moon/Ultra Sun/Ultra Moon",
        method: "tutor",
        level: null,
        machineIdentifier: null,
        sourceRecordId: "source:bulbapedia:rattata-gen7",
      },
    ]);
  });

  it("accepts an unscoped shared Gen VII method only when that method has no form headings", () => {
    const sharedBreeding =
      "<table class=\"sortable\"><tr><th>Move</th><th>PP</th></tr>" +
      "<tr><td>" + moveLink("Perish Song") + "</td><td>5</td></tr></table>";
    const parsed = parseBulbapediaGen7FormLearnset({
      source: {
        url: "https://bulbapedia.bulbagarden.net/wiki/Marowak_(Pok%C3%A9mon)/Generation_VII_learnset",
        sourceRecordId: "source:bulbapedia:marowak-gen7",
        html:
          "<h4>Pok\u00e9mon Sun, Moon , Ultra Sun and Ultra Moon</h4>" +
          "<h5>By leveling up</h5>" +
          "<h6>Marowak</h6>" +
          sortable(["Level", "Move", "PP"], [levelRow("1", "Growl")]) +
          "<h6>Alolan Marowak</h6>" +
          sortable(["Level", "Move", "PP"], [levelRow("1", "Shadow Bone")]) +
          "<h5>By breeding</h5>" +
          sharedBreeding,
      },
      speciesSourceKey: "pokedex:marowak:10151",
      baseSourceName: "Marowak",
      formLabel: "Alolan Marowak",
    });

    expect(parsed.map((entry) => [entry.method, entry.moveSourceKey])).toEqual([
      ["level-up", "shadow-bone"],
      ["egg", "perish-song"],
    ]);
  });

  it("requires exact Generation VII Learnset URLs", () => {
    expect(() =>
      parseBulbapediaGen7FormLearnset({
        source: {
          url: "https://bulbapedia.bulbagarden.net/wiki/Rattata_(Pok%C3%A9mon)/Generation_VI_learnset",
          sourceRecordId: "source:bad",
          html: "<h4>Pok\u00e9mon Sun, Moon , Ultra Sun and Ultra Moon</h4>",
        },
        speciesSourceKey: "pokedex:rattata:10158",
        baseSourceName: "Rattata",
        formLabel: "Alolan Rattata",
      }),
    ).toThrow(/unexpected Bulbapedia Generation VII form Learnset URL/i);
  });
});
