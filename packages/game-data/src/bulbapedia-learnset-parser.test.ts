import { describe, expect, it } from "vitest";
import {
  BULBAPEDIA_GEN8_BDSP_LEARNSET_PARSER_VERSION,
  BULBAPEDIA_GEN9_LEARNSET_PARSER_VERSION,
  bulbapediaLearnsetDiscoveryKey,
  canonicalizeBulbapediaLearnsetSpeciesName,
  parseBulbapediaGen8BdspLearnset,
  parseBulbapediaGen9Learnset,
} from "./bulbapedia-learnset-parser";

const URL =
  "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)/Generation_IX_learnset";
const SOURCE_RECORD_ID = "source:bulbapedia:bulbasaur-gen9-learnset";
const SPECIES_SOURCE_KEY = "pokedex:bulbasaur:1";
const GEN8_URL =
  "https://bulbapedia.bulbagarden.net/wiki/Rattata_(Pok%C3%A9mon)/Generation_VIII_learnset";
const GEN8_SOURCE_RECORD_ID = "source:bulbapedia:rattata-gen8-learnset";
const RATTATA_SOURCE_KEY = "pokedex:rattata:19";

function moveLink(name: string): string {
  const path = name.replace(/'/g, "%27").replace(/ /g, "_");
  return `<a href="/wiki/${path}_(move)">${name}</a>`;
}

function typeLink(name: string): string {
  return `<a href="/wiki/${name.replace(/ /g, "_")}_(type)">${name}</a>`;
}

function section(id: string, headers: string[], rows: string[]): string {
  return `<h4><span class="mw-headline" id="${id}">${id.replace(/_/g, " ")}</span></h4>
    <table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
    <tbody>${rows.join("")}</tbody></table>`;
}

function levelingRow(level: string, move: string, type = "Grass", power = "999"): string {
  return `<tr><td>${level}</td><td>${moveLink(move)}</td><td><a href="/wiki/${type}_(type)">${type}</a></td><td>Status</td><td>${power}</td><td>100%</td><td>10</td></tr>`;
}

function tmRow(tm: string, move: string, category = "Physical"): string {
  return `<tr><td><a href="/wiki/${tm}">${tm}</a></td><td>${moveLink(move)}</td><td>${typeLink("Normal")}</td><td>${category}</td><td>40</td><td>100%</td><td>35</td></tr>`;
}

function breedingRow(move: string, parent = "Forbidden Parent Identity"): string {
  return `<tr><td>${moveLink(move)}</td><td>${typeLink("Ghost")}</td><td>Status</td><td>—</td><td>—</td><td>10</td><td><a href="/wiki/${parent.replace(/ /g, "_")}">${parent}</a></td></tr>`;
}

function source(
  body: string,
  availability = 'Bulbasaur is available in <a href="/wiki/Pok%C3%A9mon_Scarlet_and_Violet">Scarlet and Violet</a> Version 3.0.0+.',
) {
  return {
    url: URL,
    sourceRecordId: SOURCE_RECORD_ID,
    html: `<main><h1>Bulbasaur - Generation IX learnset</h1><p>${availability}</p>${body}</main>`,
  };
}

function gen8Source(
  body: string,
  availability = 'Rattata is available in <a href="/wiki/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl">Brilliant Diamond and Shining Pearl</a>.',
) {
  return {
    url: GEN8_URL,
    sourceRecordId: GEN8_SOURCE_RECORD_ID,
    html: `<main><h1>Rattata - Generation VIII learnset</h1><p>${availability}</p>${body}</main>`,
  };
}

const LEVEL_HEADERS = ["Level", "Move", "Type", "Cat.", "Power", "Acc.", "PP"];
const TM_HEADERS = ["TM", "Move", "Type", "Cat.", "Power", "Acc.", "PP"];
const BREED_HEADERS = ["Move", "Type", "Cat.", "Power", "Acc.", "PP", "Parent"];

describe("Bulbapedia Generation IX learnset parser", () => {
  it("canonicalizes gender-symbol Species identities independently of provider URL slugs", () => {
    expect(canonicalizeBulbapediaLearnsetSpeciesName("Nidoran♀")).toBe("nidoran-female");
    expect(canonicalizeBulbapediaLearnsetSpeciesName("Nidoran♂")).toBe("nidoran-male");
  });

  it("exposes the versioned parser and extracts Scarlet/Violet level, TM and breeding rows", () => {
    expect(BULBAPEDIA_GEN9_LEARNSET_PARSER_VERSION).toBe("bulbapedia-gen9-learnset-v1");
    const result = parseBulbapediaGen9Learnset(
      source(
        section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) +
          section("By_TM", TM_HEADERS, [tmRow("TM001", "Take Down")]) +
          section("By_breeding", BREED_HEADERS, [breedingRow("Curse")]),
      ),
      SPECIES_SOURCE_KEY,
    );

    expect(result.sourceSpeciesKey).toBe("bulbasaur");

    expect(result.records).toEqual([
      {
        speciesSourceKey: SPECIES_SOURCE_KEY,
        moveSourceKey: "tackle",
        sourceGeneration: 9,
        sourceGame: "Scarlet/Violet",
        method: "level-up",
        level: 1,
        machineIdentifier: null,
        sourceRecordId: SOURCE_RECORD_ID,
      },
      {
        speciesSourceKey: SPECIES_SOURCE_KEY,
        moveSourceKey: "take-down",
        sourceGeneration: 9,
        sourceGame: "Scarlet/Violet",
        method: "machine",
        level: null,
        machineIdentifier: "TM001",
        sourceRecordId: SOURCE_RECORD_ID,
      },
      {
        speciesSourceKey: SPECIES_SOURCE_KEY,
        moveSourceKey: "curse",
        sourceGeneration: 9,
        sourceGame: "Scarlet/Violet",
        method: "egg",
        level: null,
        machineIdentifier: null,
        sourceRecordId: SOURCE_RECORD_ID,
      },
    ]);
  });

  it("returns independent discovery keys for every eligible structured row before record construction", () => {
    const result = parseBulbapediaGen9Learnset(
      source(
        section("By_leveling_up", LEVEL_HEADERS, [levelingRow("7", "Vine Whip")]) +
          section("By_TM", TM_HEADERS, [tmRow("TM020", "Trailblaze")]),
      ),
      SPECIES_SOURCE_KEY,
    );
    expect(result.discoveredSourceKeys).toEqual([
      bulbapediaLearnsetDiscoveryKey({
        speciesSourceKey: SPECIES_SOURCE_KEY,
        moveSourceKey: "vine-whip",
        method: "level-up",
        level: 7,
        machineIdentifier: null,
      }),
      bulbapediaLearnsetDiscoveryKey({
        speciesSourceKey: SPECIES_SOURCE_KEY,
        moveSourceKey: "trailblaze",
        method: "machine",
        level: null,
        machineIdentifier: "TM020",
      }),
    ]);
  });

  it("ignores Type/category/power/accuracy/PP and breeding parent identities", () => {
    const result = parseBulbapediaGen9Learnset(
      source(
        section("By_leveling_up", LEVEL_HEADERS, [levelingRow("5", "Growl", "ForbiddenType", "777")]) +
          section("By_breeding", BREED_HEADERS, [breedingRow("Petal Dance", "Forbidden Parent 888")]),
      ),
      SPECIES_SOURCE_KEY,
    );
    const serialized = JSON.stringify(result.records);
    expect(serialized).not.toMatch(/Forbidden|777|888|category|power|accuracy|basePp|parent/i);
  });

  it("requires an explicit Scarlet/Violet availability sentence", () => {
    expect(() =>
      parseBulbapediaGen9Learnset(
        source(section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]), "Available somewhere in Generation IX."),
        SPECIES_SOURCE_KEY,
      ),
    ).toThrow(/explicit Scarlet\/Violet availability sentence/i);
  });

  it("fails closed on unknown move-bearing h4 sections", () => {
    expect(() =>
      parseBulbapediaGen9Learnset(
        source(
          section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) +
            section("By_move_tutor", ["Move"], [`<tr><td>${moveLink("Frenzy Plant")}</td></tr>`]),
        ),
        SPECIES_SOURCE_KEY,
      ),
    ).toThrow(/unknown move-bearing h4 section By_move_tutor/i);
  });

  it("bounds the final h4 section before later higher-level content", () => {
    const result = parseBulbapediaGen9Learnset(
      source(
        section("By_breeding", BREED_HEADERS, [breedingRow("Curse")]) +
          `<h3>Side-game learnsets</h3><table><tr><td>${moveLink("Forbidden Move")}</td></tr></table>`,
      ),
      SPECIES_SOURCE_KEY,
    );
    expect(result.records.map((record) => record.moveSourceKey)).toEqual(["curse"]);
  });

  it("fails closed on malformed structured rows", () => {
    expect(() =>
      parseBulbapediaGen9Learnset(
        source(section("By_leveling_up", LEVEL_HEADERS, [levelingRow("Level?", "Tackle")])),
        SPECIES_SOURCE_KEY,
      ),
    ).toThrow(/expected exact positive integer/i);

    expect(() =>
      parseBulbapediaGen9Learnset(
        source(section("By_TM", TM_HEADERS, [tmRow("TM1", "Take Down")])),
        SPECIES_SOURCE_KEY,
      ),
    ).toThrow(/exact Generation IX TM identifier/i);
  });

  it("maps the structured Evo. level marker to the recognized evolution method", () => {
    const result = parseBulbapediaGen9Learnset(
      source(section("By_leveling_up", LEVEL_HEADERS, [levelingRow("Evo.", "Wing Attack")])),
      SPECIES_SOURCE_KEY,
    );
    expect(result.records).toEqual([
      expect.objectContaining({
        moveSourceKey: "wing-attack",
        method: "evolution",
        level: null,
      }),
    ]);
  });

  it("fails closed on duplicate logical entries", () => {
    expect(() =>
      parseBulbapediaGen9Learnset(
        source(
          section("By_leveling_up", LEVEL_HEADERS, [
            levelingRow("1", "Tackle"),
            levelingRow("1", "Tackle"),
          ]),
        ),
        SPECIES_SOURCE_KEY,
      ),
    ).toThrow(/duplicate logical entry/i);
  });

  it("rejects noncanonical Generation IX learnset URLs", () => {
    const validBody = section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]);
    expect(() =>
      parseBulbapediaGen9Learnset(
        { ...source(validBody), url: `${URL}?oldid=1` },
        SPECIES_SOURCE_KEY,
      ),
    ).toThrow(/unexpected Bulbapedia Generation IX learnset URL/i);
    expect(() =>
      parseBulbapediaGen9Learnset(
        {
          ...source(validBody),
          url: "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)/Generation_VIII_learnset",
        },
        SPECIES_SOURCE_KEY,
      ),
    ).toThrow(/unexpected Bulbapedia Generation IX learnset URL/i);
  });
});

describe("Bulbapedia Generation VIII BDSP learnset fallback parser", () => {
  it("extracts the approved BDSP level, TM and breeding rows with historical provenance", () => {
    expect(BULBAPEDIA_GEN8_BDSP_LEARNSET_PARSER_VERSION).toBe(
      "bulbapedia-gen8-bdsp-learnset-v5",
    );
    const result = parseBulbapediaGen8BdspLearnset(
      gen8Source(
          section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) +
          section("By_TM", ["", ...TM_HEADERS], [
            `<tr><td>TM10</td><td>TM10</td><td>${moveLink("Work Up")}</td><td>${typeLink("Normal")}</td><td>Status</td><td>—</td><td>—</td><td>30</td></tr>`,
          ]) +
          section("By_breeding", ["Parent", ...BREED_HEADERS], [
            `<tr><td></td><td>${moveLink("Bite")}</td><td>${typeLink("Dark")}</td><td>Physical</td><td>60</td><td>100%</td><td>25</td><td>Parent</td></tr>`,
          ]),
      ),
      RATTATA_SOURCE_KEY,
    );

    expect(result.sourceSpeciesKey).toBe("rattata");
    expect(result.records).toEqual([
      expect.objectContaining({
        speciesSourceKey: RATTATA_SOURCE_KEY,
        moveSourceKey: "tackle",
        sourceGeneration: 8,
        sourceGame: "Brilliant Diamond/Shining Pearl",
        method: "level-up",
        level: 1,
        sourceRecordId: GEN8_SOURCE_RECORD_ID,
      }),
      expect.objectContaining({
        moveSourceKey: "work-up",
        sourceGeneration: 8,
        sourceGame: "Brilliant Diamond/Shining Pearl",
        method: "machine",
        machineIdentifier: "TM10",
      }),
      expect.objectContaining({
        moveSourceKey: "bite",
        sourceGeneration: 8,
        sourceGame: "Brilliant Diamond/Shining Pearl",
        method: "egg",
      }),
    ]);
    expect(result.moveFacts).toEqual([
      expect.objectContaining({
        moveSourceKey: "tackle",
        typeSourceKey: "grass",
        category: "status",
        power: 999,
        accuracy: 100,
        basePp: 10,
        sourceGame: "Brilliant Diamond/Shining Pearl",
        sourceRecordId: GEN8_SOURCE_RECORD_ID,
      }),
      expect.objectContaining({
        moveSourceKey: "work-up",
        typeSourceKey: "normal",
        category: "status",
        power: null,
        accuracy: null,
        basePp: 30,
      }),
      expect.objectContaining({
        moveSourceKey: "bite",
        typeSourceKey: "dark",
        category: "physical",
        power: 60,
        accuracy: 100,
        basePp: 25,
      }),
    ]);
  });

  it("requires explicit BDSP availability and Generation VIII TM syntax", () => {
    expect(() =>
      parseBulbapediaGen8BdspLearnset(
        gen8Source(
          section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]),
          "Rattata is available in Sword and Shield.",
        ),
        RATTATA_SOURCE_KEY,
      ),
    ).toThrow(/explicit Brilliant Diamond\/Shining Pearl availability sentence/i);

    expect(() =>
      parseBulbapediaGen8BdspLearnset(
        gen8Source(
          section("By_TM", ["", ...TM_HEADERS], [
            `<tr><td>TM1</td><td>TM1</td><td>${moveLink("Work Up")}</td><td>${typeLink("Normal")}</td><td>Status</td><td>—</td><td>—</td><td>30</td></tr>`,
          ]),
        ),
        RATTATA_SOURCE_KEY,
      ),
    ).toThrow(/exact Generation VIII TM identifier/i);
  });

  it("accepts mixed Sword/Shield + BDSP availability with a Sword/Shield version annotation", () => {
    const result = parseBulbapediaGen8BdspLearnset(
      gen8Source(
        section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]),
        'Rattata is available in <a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Sword and Shield</a> Version 1.2.0+ and <a href="/wiki/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl">Brilliant Diamond and Shining Pearl</a>.',
      ),
      RATTATA_SOURCE_KEY,
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0].sourceGame).toBe("Brilliant Diamond/Shining Pearl");
  });

  it("selects only the BDSP block from mixed Generation VIII TM/TR sections", () => {
    const mixedTmSection = `
      <h4><span id="By_TM.2FTR"></span><span class="mw-headline" id="By_TM/TR">By TM/TR</span></h4>
      <p><a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Sw Sh</a></p>
      <table><tr><th>TR</th><th>Move</th></tr><tr><td>TR01</td><td>${moveLink("Body Slam")}</td></tr></table>
      <p><a href="/wiki/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl">BD SP</a></p>
      <table><tr><th></th><th>TM</th><th>Move</th><th>Type</th><th>Cat.</th><th>Pwr.</th><th>Acc.</th><th>PP</th></tr>
      <tr><td>TM10</td><td>TM10</td><td>${moveLink("Work Up")}</td><td>${typeLink("Normal")}</td><td>Status</td><td>—</td><td>—</td><td>30</td></tr></table>`;
    const result = parseBulbapediaGen8BdspLearnset(
      gen8Source(
        mixedTmSection,
        'Rattata is available in <a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Sword and Shield</a> and <a href="/wiki/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl">Brilliant Diamond and Shining Pearl</a>.',
      ),
      RATTATA_SOURCE_KEY,
    );
    expect(result.records.map((record) => record.moveSourceKey)).toEqual(["work-up"]);
    expect(result.records[0]).toMatchObject({
      sourceGeneration: 8,
      sourceGame: "Brilliant Diamond/Shining Pearl",
      machineIdentifier: "TM10",
    });
  });

  it("stops the BDSP scope before a following Legends: Arceus block", () => {
    const mixedLevelSection = `
      <h4><span class="mw-headline" id="By_leveling_up">By leveling up</span></h4>
      <p><a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Sw Sh</a><a href="/wiki/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl">BD SP</a></p>
      <table><tr><th>Level</th><th>Move</th><th>Type</th><th>Cat.</th><th>Pwr.</th><th>Acc.</th><th>PP</th></tr>
      ${levelingRow("1", "Thunder Shock")}</table>
      <p><a href="/wiki/Pok%C3%A9mon_Legends:_Arceus">LA</a></p>
      <table><tr><th>Learn</th><th>Mastery</th><th>Move</th></tr><tr><td>1</td><td>9</td><td>${moveLink("Quick Attack")}</td></tr></table>`;
    const result = parseBulbapediaGen8BdspLearnset(
      gen8Source(
        mixedLevelSection,
        'Rattata is available in <a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Sword and Shield</a> and <a href="/wiki/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl">Brilliant Diamond and Shining Pearl</a>.',
      ),
      RATTATA_SOURCE_KEY,
    );
    expect(result.records.map((record) => record.moveSourceKey)).toEqual(["thunder-shock"]);
    expect(result.records[0]).toMatchObject({
      sourceGeneration: 8,
      sourceGame: "Brilliant Diamond/Shining Pearl",
      method: "level-up",
      level: 1,
    });
  });

  it("supports exact h5 game scopes while excluding the following Legends: Arceus block", () => {
    const h5Scoped = `
      <h4><span class="mw-headline" id="By_leveling_up">By leveling up</span></h4>
      <h5><span class="mw-headline" id="Pokémon_Sword,_Shield,_Brilliant_Diamond,_and_Shining_Pearl">Pokémon Sword, Shield, Brilliant Diamond, and Shining Pearl</span></h5>
      <table><tr><th>Level</th><th>Move</th><th>Type</th><th>Cat.</th><th>Power</th><th>Acc.</th><th>PP</th></tr>
      ${levelingRow("1", "Tackle")}</table>
      <h5><span class="mw-headline" id="Pokémon_Legends:_Arceus">Pokémon Legends: Arceus</span></h5>
      <table><tr><th>Learn</th><th>Mastery</th><th>Move</th></tr><tr><td>1</td><td>9</td><td>${moveLink("Quick Attack")}</td></tr></table>`;
    const result = parseBulbapediaGen8BdspLearnset(gen8Source(h5Scoped), RATTATA_SOURCE_KEY);
    expect(result.records.map((record) => record.moveSourceKey)).toEqual(["tackle"]);
  });

  it("fails closed when form-scoped h5 blocks omit the base Species", () => {
    const alternateOnly = `
      <h4><span class="mw-headline" id="By_leveling_up">By leveling up</span></h4>
      <h5><span class="mw-headline" id="Alolan_Rattata">Alolan Rattata</span></h5>
      <table><tr><th>Level</th><th>Move</th><th>Type</th><th>Cat.</th><th>Power</th><th>Acc.</th><th>PP</th></tr>
      ${levelingRow("1", "Bite")}</table>`;
    expect(() =>
      parseBulbapediaGen8BdspLearnset(gen8Source(alternateOnly), RATTATA_SOURCE_KEY),
    ).toThrow(/form-scoped h5 blocks do not contain base Species rattata/i);
  });

  it("fails closed instead of treating a Legends: Arceus-only h5 block as BDSP", () => {
    const legendsOnly = `
      <h4><span class="mw-headline" id="By_leveling_up">By leveling up</span></h4>
      <h5><span class="mw-headline" id="Pokémon_Legends:_Arceus">Pokémon Legends: Arceus</span></h5>
      <table><tr><th>Level</th><th>Move</th><th>Type</th><th>Cat.</th><th>Power</th><th>Acc.</th><th>PP</th></tr>
      ${levelingRow("1", "Quick Attack")}</table>`;
    expect(() =>
      parseBulbapediaGen8BdspLearnset(gen8Source(legendsOnly), RATTATA_SOURCE_KEY),
    ).toThrow(/approved game scope has no structured Move rows/i);
  });

  it("fails closed instead of treating an unrecognized Sword/Shield-only h5 scope as BDSP", () => {
    const swordShieldOnly = `
      <h4><span class="mw-headline" id="By_leveling_up">By leveling up</span></h4>
      <h5><span class="mw-headline" id="Pokémon_Sword_and_Shield">Pokémon Sword and Shield</span></h5>
      <table><tr><th>Level</th><th>Move</th><th>Type</th><th>Cat.</th><th>Power</th><th>Acc.</th><th>PP</th></tr>
      ${levelingRow("1", "Quick Attack")}</table>`;
    expect(() =>
      parseBulbapediaGen8BdspLearnset(gen8Source(swordShieldOnly), RATTATA_SOURCE_KEY),
    ).toThrow(/form-scoped h5 blocks do not contain base Species rattata/i);
  });

  it("applies an h5 Legends delimiter inside an already selected BDSP paragraph scope", () => {
    const mixedScope = `
      <h4><span class="mw-headline" id="By_leveling_up">By leveling up</span></h4>
      <p><a href="/wiki/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl">BD SP</a></p>
      <table><tr><th>Level</th><th>Move</th><th>Type</th><th>Cat.</th><th>Power</th><th>Acc.</th><th>PP</th></tr></table>
      <h5><span class="mw-headline" id="Pokémon_Legends:_Arceus">Pokémon Legends: Arceus</span></h5>
      <table><tr><th>Level</th><th>Move</th><th>Type</th><th>Cat.</th><th>Power</th><th>Acc.</th><th>PP</th></tr>
      ${levelingRow("1", "Quick Attack")}</table>`;
    expect(() =>
      parseBulbapediaGen8BdspLearnset(gen8Source(mixedScope), RATTATA_SOURCE_KEY),
    ).toThrow(/approved game scope has no structured Move rows/i);
  });

  it("selects the exact base-Species h5 block instead of a regional-form table", () => {
    const mixedFormTmSection = `
      <h4><span id="By_TM.2FTR"></span><span class="mw-headline" id="By_TM/TR">By TM/TR</span></h4>
      <h5><span class="mw-headline" id="Rattata">Rattata</span></h5>
      <p><a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Sw Sh</a></p>
      <table><tr><th>TR</th><th>Move</th></tr><tr><td>TR01</td><td>${moveLink("Body Slam")}</td></tr></table>
      <p><a href="/wiki/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl">BD SP</a></p>
      <table><tr><th></th><th>TM</th><th>Move</th><th>Type</th><th>Cat.</th><th>Pwr.</th><th>Acc.</th><th>PP</th></tr>
      <tr><td>TM10</td><td>TM10</td><td>${moveLink("Work Up")}</td><td>${typeLink("Normal")}</td><td>Status</td><td>—</td><td>—</td><td>30</td></tr></table>
      <h5><span class="mw-headline" id="Alolan_Rattata">Alolan Rattata</span></h5>
      <table><tr><th></th><th>TM</th><th>Move</th><th>Type</th><th>Cat.</th><th>Pwr.</th><th>Acc.</th><th>PP</th></tr>
      <tr><td>TM11</td><td>TM11</td><td>${moveLink("Sunny Day")}</td><td>${typeLink("Fire")}</td><td>Status</td><td>—</td><td>—</td><td>5</td></tr></table>`;
    const result = parseBulbapediaGen8BdspLearnset(
      gen8Source(mixedFormTmSection),
      RATTATA_SOURCE_KEY,
    );
    expect(result.records.map((record) => record.moveSourceKey)).toEqual(["work-up"]);
  });

  it("accepts documented Generation VIII breeding asterisk/dagger annotations without changing Move identity", () => {
    const result = parseBulbapediaGen8BdspLearnset(
      gen8Source(
        section("By_breeding", ["Parent", ...BREED_HEADERS], [
          `<tr><td></td><td>${moveLink("Circle Throw")}*</td><td>${typeLink("Fighting")}</td><td>Physical</td><td>60</td><td>90%</td><td>10</td><td>Parent</td></tr>`,
          `<tr><td></td><td>${moveLink("Last Resort")}†</td><td>${typeLink("Normal")}</td><td>Physical</td><td>140</td><td>100%</td><td>5</td><td>Parent</td></tr>`,
          `<tr><td></td><td>${moveLink("Charm")}*†</td><td>${typeLink("Fairy")}</td><td>Status</td><td>—</td><td>100%</td><td>20</td><td>Parent</td></tr>`,
          `<tr><td></td><td>${moveLink("Counter")}‡</td><td>${typeLink("Fighting")}</td><td>Physical</td><td>—</td><td>100%</td><td>20</td><td>Parent</td></tr>`,
        ]),
      ),
      RATTATA_SOURCE_KEY,
    );
    expect(result.records.map((record) => record.moveSourceKey)).toEqual([
      "circle-throw",
      "last-resort",
      "charm",
      "counter",
    ]);

    expect(() =>
      parseBulbapediaGen8BdspLearnset(
        gen8Source(
          section("By_leveling_up", LEVEL_HEADERS, [
            levelingRow("1", "Tackle").replace(">Tackle</a>", ">Tackle</a>*"),
          ]),
        ),
        RATTATA_SOURCE_KEY,
      ),
    ).toThrow(/ambiguous Move identity cell/i);
  });

  it("includes exact BDSP row annotations and excludes exact Sword/Shield-only rows", () => {
    const result = parseBulbapediaGen8BdspLearnset(
      gen8Source(
        section("By_leveling_up", LEVEL_HEADERS, [
          levelingRow("1", "Tackle"),
          levelingRow("10", "Agility").replace(
            ">Agility</a>",
            '>Agility</a><sup><a href="/wiki/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl">BD SP</a></sup>',
          ),
          levelingRow("20", "Splash").replace(
            ">Splash</a>",
            '>Splash</a><sup><a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Sw Sh</a></sup>',
          ),
        ]),
      ),
      RATTATA_SOURCE_KEY,
    );
    expect(result.records.map((record) => record.moveSourceKey)).toEqual(["tackle", "agility"]);

    expect(() =>
      parseBulbapediaGen8BdspLearnset(
        gen8Source(
          section("By_leveling_up", LEVEL_HEADERS, [
            levelingRow("10", "Agility").replace(
              ">Agility</a>",
              '>Agility</a><sup><a href="/wiki/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl">BD only?</a></sup>',
            ),
          ]),
        ),
        RATTATA_SOURCE_KEY,
      ),
    ).toThrow(/unsupported game-scoped Move annotation/i);
  });

  it("accepts the documented BDSP Grand Underground breeding qualifier only from its canonical link", () => {
    const qualified = `<b>${moveLink("Air Cutter")}</b><a href="/wiki/Grand_Underground">^</a>`;
    const qualifiedWithDagger = `<b>${moveLink("Self-Destruct")}</b><a href="/wiki/Grand_Underground">^</a>†`;
    const result = parseBulbapediaGen8BdspLearnset(
      gen8Source(
        section("By_breeding", ["Parent", ...BREED_HEADERS], [
          `<tr><td></td><td>${qualified}</td><td>${typeLink("Flying")}</td><td>Special</td><td>60</td><td>95%</td><td>25</td><td>Parent</td></tr>`,
          `<tr><td></td><td>${qualifiedWithDagger}</td><td>${typeLink("Normal")}</td><td>Physical</td><td>200</td><td>100%</td><td>5</td><td>Parent</td></tr>`,
        ]),
      ),
      RATTATA_SOURCE_KEY,
    );
    expect(result.records.map((record) => record.moveSourceKey)).toEqual([
      "air-cutter",
      "self-destruct",
    ]);

    expect(() =>
      parseBulbapediaGen8BdspLearnset(
        gen8Source(
          section("By_breeding", ["Parent", ...BREED_HEADERS], [
            `<tr><td></td><td>${moveLink("Air Cutter")}^</td><td>Flying</td><td>Special</td><td>60</td><td>95%</td><td>25</td><td>Parent</td></tr>`,
          ]),
        ),
        RATTATA_SOURCE_KEY,
      ),
    ).toThrow(/ambiguous Move identity cell/i);
  });

  it("ignores explicitly SwSh-only tutor sections and fails closed on unscoped BDSP tutor layout", () => {
    const result = parseBulbapediaGen8BdspLearnset(
      gen8Source(
        section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) +
          `<h4><span class="mw-headline" id="By_tutoring">By tutoring</span></h4>
          <p><a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Sw Sh</a></p>
          <table><tr><th>Move</th></tr><tr><td>${moveLink("Forbidden SwSh Tutor Move")}</td></tr></table>`,
      ),
      RATTATA_SOURCE_KEY,
    );
    expect(result.records.map((record) => record.moveSourceKey)).toEqual(["tackle"]);

    expect(() =>
      parseBulbapediaGen8BdspLearnset(
        gen8Source(
          section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) +
            `<h4><span class="mw-headline" id="By_tutoring">By tutoring</span></h4>
            <p><a href="/wiki/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl">BD SP</a></p>
            <table><tr><th>Move</th></tr><tr><td>${moveLink("Unexpected BDSP Tutor Move")}</td></tr></table>`,
        ),
        RATTATA_SOURCE_KEY,
      ),
    ).toThrow(/By_tutoring: unexpected game-scoped row layout/i);
  });

  it("parses only BDSP-applicable Generation VIII tutor rows from exact game-link evidence", () => {
    const tutorSection = `
      <h4><span class="mw-headline" id="By_tutoring">By tutoring</span></h4>
      <table>
        <tr><th colspan="5">Game</th><th>Move</th><th>Type</th><th>Cat.</th><th>Pwr.</th><th>Acc.</th><th>PP</th></tr>
        <tr>
          <th><a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Sw</a></th>
          <th><a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Sh</a></th>
          <th>EP</th>
          <th><a href="/wiki/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl">BD</a></th>
          <th><a href="/wiki/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl">SP</a></th>
          <td>${moveLink("Draco Meteor")}</td><td>${typeLink("Dragon")}</td><td>Special</td><td>130</td><td>90%</td><td>5</td>
        </tr>
        <tr>
          <th>Sw</th><th>Sh</th><th><a href="/wiki/Pok%C3%A9mon_Sword_and_Shield_Expansion_Pass">EP</a></th><th>BD</th><th>SP</th>
          <td>${moveLink("Dual Wingbeat")}</td><td>${typeLink("Flying")}</td><td>Physical</td><td>40</td><td>90%</td><td>10</td>
        </tr>
      </table>`;
    const result = parseBulbapediaGen8BdspLearnset(
      gen8Source(tutorSection),
      RATTATA_SOURCE_KEY,
    );
    expect(result.records).toEqual([
      expect.objectContaining({
        moveSourceKey: "draco-meteor",
        sourceGeneration: 8,
        sourceGame: "Brilliant Diamond/Shining Pearl",
        method: "tutor",
        level: null,
        machineIdentifier: null,
      }),
    ]);
  });

  it("ignores Generation VIII transfer rows only with exact Sword/Shield-only source evidence", () => {
    const transfer = `
      <h4><span class="mw-headline" id="By_transfer_from_another_generation">By transfer from another generation</span></h4>
      <table><tr><th>Move</th></tr><tr><td>${moveLink("Mega Punch")}</td></tr></table>
      <ul><li>Transferred Pokémon only retain these moves in <a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Pokémon Sword and Shield</a></li></ul>`;
    const result = parseBulbapediaGen8BdspLearnset(
      gen8Source(section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) + transfer),
      RATTATA_SOURCE_KEY,
    );
    expect(result.records.map((record) => record.moveSourceKey)).toEqual(["tackle"]);

    expect(() =>
      parseBulbapediaGen8BdspLearnset(
        gen8Source(transfer.replace("Transferred Pokémon only retain these moves in", "Transfer notes for")),
        RATTATA_SOURCE_KEY,
      ),
    ).toThrow(/transfer section is not explicitly Sword\/Shield-only/i);

    const emptyButScoped = `
      <h4><span class="mw-headline" id="By_transfer_from_another_generation">By transfer from another generation</span></h4>
      <ul><li>Transferred Pokémon only retain these moves in <a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Pokémon Sword and Shield</a></li></ul>`;
    expect(() =>
      parseBulbapediaGen8BdspLearnset(
        gen8Source(section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) + emptyButScoped),
        RATTATA_SOURCE_KEY,
      ),
    ).not.toThrow();

    expect(() =>
      parseBulbapediaGen8BdspLearnset(
        gen8Source(
          section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) +
            `<h4><span class="mw-headline" id="By_transfer_from_another_generation">By transfer from another generation</span></h4><p>No transfer data.</p>`,
        ),
        RATTATA_SOURCE_KEY,
      ),
    ).toThrow(/transfer section is not explicitly Sword\/Shield-only/i);

    const formScopedTransfer = `
      <h4><span class="mw-headline" id="By_transfer_from_another_generation">By transfer from another generation</span></h4>
      <h5><span class="mw-headline" id="Rattata">Rattata</span></h5>
      <ul><li>Transferred Pokémon only retain these moves in <a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Pokémon Sword and Shield</a></li></ul>
      <h5><span class="mw-headline" id="Alolan_Rattata">Alolan Rattata</span></h5>
      <ul><li>Transferred Pokémon only retain these moves in <a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Pokémon Sword and Shield</a></li></ul>`;
    expect(() =>
      parseBulbapediaGen8BdspLearnset(
        gen8Source(section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) + formScopedTransfer),
        RATTATA_SOURCE_KEY,
      ),
    ).not.toThrow();

    const withPriorEvolutionSubblock = `
      <h4><span class="mw-headline" id="By_transfer_from_another_generation">By transfer from another generation</span></h4>
      <ul><li>Transferred Pokémon only retain these moves in <a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Pokémon Sword and Shield</a></li></ul>
      <h5><span class="mw-headline" id="By_transfer_only_via_prior_Evolution">By transfer, only via prior Evolution</span></h5>
      <ul><li>Transferred Pokémon only retain these moves in <a href="/wiki/Pok%C3%A9mon_Sword_and_Shield">Pokémon Sword and Shield</a></li></ul>`;
    expect(() =>
      parseBulbapediaGen8BdspLearnset(
        gen8Source(section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) + withPriorEvolutionSubblock),
        RATTATA_SOURCE_KEY,
      ),
    ).not.toThrow();
  });

  it("requires exact source evidence for an empty Generation VIII tutor section", () => {
    const explicitEmptyTutor = `
      <h4><span class="mw-headline" id="By_tutoring">By tutoring</span></h4>
      <p>This Pokémon learns no moves by tutoring.</p>`;
    const result = parseBulbapediaGen8BdspLearnset(
      gen8Source(
        section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) + explicitEmptyTutor,
      ),
      RATTATA_SOURCE_KEY,
    );
    expect(result.records.map((record) => record.moveSourceKey)).toEqual(["tackle"]);

    expect(() =>
      parseBulbapediaGen8BdspLearnset(
        gen8Source(
          section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) +
            `<h4><span class="mw-headline" id="By_tutoring">By tutoring</span></h4><p>No tutor rows currently.</p>`,
        ),
        RATTATA_SOURCE_KEY,
      ),
    ).toThrow(/By_tutoring: empty section lacks explicit source evidence/i);
  });

  it("recognizes Generation VIII event learnsets as explicitly outside the Core LearnMethod baseline", () => {
    const result = parseBulbapediaGen8BdspLearnset(
      gen8Source(
        section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) +
          `<h4><span class="mw-headline" id="By_events">By events</span></h4>
          <table><tr><th>Move</th></tr><tr><td>${moveLink("Celebrate")}</td></tr></table>`,
      ),
      RATTATA_SOURCE_KEY,
    );
    expect(result.records.map((record) => record.moveSourceKey)).toEqual(["tackle"]);
  });

  it("does not collapse prior-evolution retention or Move Reminder into another LearnMethod", () => {
    const outOfScopeSections = `
      <h4><span class="mw-headline" id="By_a_prior_Evolution">By a prior Evolution</span></h4>
      <table><tr><th>Move</th></tr><tr><td>${moveLink("String Shot")}</td></tr></table>
      <h4><span class="mw-headline" id="By_reminder">By reminder</span></h4>
      <table><tr><th>Move</th></tr><tr><td>${moveLink("Harden")}</td></tr></table>`;
    const result = parseBulbapediaGen8BdspLearnset(
      gen8Source(
        section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) +
          outOfScopeSections,
      ),
      RATTATA_SOURCE_KEY,
    );
    expect(result.records.map((record) => record.moveSourceKey)).toEqual(["tackle"]);
  });

  it("accepts an explicitly empty BDSP method section but rejects an unexplained empty section", () => {
    const explicitEmpty = `
      <h4><span class="mw-headline" id="By_TM">By TM</span></h4>
      <table><tr><th>TM</th><th>Move</th></tr><tr><th colspan="2">This Pokémon learns no moves by TM.</th></tr></table>`;
    const result = parseBulbapediaGen8BdspLearnset(
      gen8Source(section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) + explicitEmpty),
      RATTATA_SOURCE_KEY,
    );
    expect(result.records.map((record) => record.moveSourceKey)).toEqual(["tackle"]);

    expect(() =>
      parseBulbapediaGen8BdspLearnset(
        gen8Source(
          section("By_leveling_up", LEVEL_HEADERS, [levelingRow("1", "Tackle")]) +
            `<h4><span class="mw-headline" id="By_TM">By TM</span></h4><table><tr><th>TM</th><th>Move</th></tr></table>`,
        ),
        RATTATA_SOURCE_KEY,
      ),
    ).toThrow(/approved game scope has no structured Move rows/i);
  });
});
