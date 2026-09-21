import { describe, expect, it } from "vitest";
import {
  BULBAPEDIA_BASE_SPECIES_EVIDENCE_PARSER_VERSION,
  BULBAPEDIA_REGIONAL_FORM_EVIDENCE_PARSER_VERSION,
  BULBAPEDIA_REGIONAL_FORM_LIST_URL,
  BULBAPEDIA_SPECIES_PAGE_URL_PREFIX,
  canonicalizeBulbapediaRegionAdjective,
  parseBulbapediaBaseSpeciesEvidence,
  parseBulbapediaRegionalForms,
} from "./bulbapedia-species-evidence";

const BASE_SOURCE_RECORD_ID = "source:bulbapedia:bulbasaur";
const REGIONAL_SOURCE_RECORD_ID = "source:bulbapedia:regional-forms";

function statRow(label: string, href: string, value: number): string {
  return `<tr><th><div><a href="${href}">${label}</a>:</div><div>${value}</div></th><td>ignored range</td></tr>`;
}

function baseSpeciesSource(overrides: { url?: string; intro?: string; stats?: string } = {}) {
  return {
    url: overrides.url ?? `${BULBAPEDIA_SPECIES_PAGE_URL_PREFIX}Bulbasaur_(Pok%C3%A9mon)`,
    sourceRecordId: BASE_SOURCE_RECORD_ID,
    html: `
      <main>
        <h1>Bulbasaur (Pokémon)</h1>
        <p>${overrides.intro ?? `<b>Bulbasaur</b> (Japanese: フシギダネ) is a dual-type <a href="/wiki/Grass_(type)">Grass-type</a>/<a href="/wiki/Poison_(type)">Poison</a> <a href="/wiki/Pok%C3%A9mon_(species)" title="Pokémon (species)">Pokémon</a> introduced in <a href="/wiki/Generation_I">Generation I</a>.`}</p>
        <h4><span class="mw-headline" id="Base_stats">Base stats</span></h4>
        ${overrides.stats ?? `
          <table>
            ${statRow("HP", "/wiki/HP", 45)}
            ${statRow("Attack", "/wiki/Stat#Attack", 49)}
            ${statRow("Defense", "/wiki/Stat#Defense", 49)}
            ${statRow("Sp. Atk", "/wiki/Stat#Special_Attack", 65)}
            ${statRow("Sp. Def", "/wiki/Stat#Special_Defense", 65)}
            ${statRow("Speed", "/wiki/Stat#Speed", 45)}
          </table>`}
        <h4><span class="mw-headline" id="Other">Other</span></h4>
      </main>`,
  };
}

function regionalHeader(): string {
  return `
    <tr>
      <th>Ndex</th>
      <th>Pokémon</th>
      <th>Original form</th>
      <th>Region<br>(Generation)</th>
      <th>Regional form</th>
    </tr>`;
}

function regionCell(region: string, roman: string, rowspan?: number): string {
  return `<th${rowspan ? ` rowspan="${rowspan}"` : ""}><a href="/wiki/${region}"><img src="ignored.png"></a><br><a href="/wiki/${region}">${region}</a><br><a href="/wiki/Generation_${roman}">${roman}</a></th>`;
}

function typeLinks(...types: string[]): string {
  return types.map((type) => `<a href="/wiki/${type}_(type)">${type}</a>`).join("");
}

function regionalSource(rows: string) {
  return {
    url: BULBAPEDIA_REGIONAL_FORM_LIST_URL,
    sourceRecordId: REGIONAL_SOURCE_RECORD_ID,
    html: `
      <h2><span class="mw-headline" id="List_of_regional_forms">List of regional forms</span></h2>
      <table class="roundy sortable">
        ${regionalHeader()}
        ${rows}
      </table>
      <h2><span class="mw-headline" id="Other">Other</span></h2>`,
  };
}

describe("Bulbapedia base Species evidence", () => {
  it("exports stable parser/source constants", () => {
    expect(BULBAPEDIA_BASE_SPECIES_EVIDENCE_PARSER_VERSION).toBe("bulbapedia-base-species-evidence-v8");
    expect(BULBAPEDIA_REGIONAL_FORM_EVIDENCE_PARSER_VERSION).toBe("bulbapedia-regional-form-evidence-v2");
    expect(BULBAPEDIA_SPECIES_PAGE_URL_PREFIX).toBe("https://bulbapedia.bulbagarden.net/wiki/");
    expect(BULBAPEDIA_REGIONAL_FORM_LIST_URL).toBe("https://bulbapedia.bulbagarden.net/wiki/Regional_form");
  });

  it("extracts exact identity, introduction Types and six base stats", () => {
    expect(parseBulbapediaBaseSpeciesEvidence(baseSpeciesSource())).toEqual({
      sourceName: "Bulbasaur",
      introducedGeneration: 1,
      typeSourceKeys: ["grass", "poison"],
      baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
      sourceRecordId: BASE_SOURCE_RECORD_ID,
    });
  });

  it("accepts exact Species names ending in gender symbols without weakening the intro prefix boundary", () => {
    const female = baseSpeciesSource({
      url: `${BULBAPEDIA_SPECIES_PAGE_URL_PREFIX}Nidoran%E2%99%80_(Pok%C3%A9mon)`,
      intro: `<b>Nidoran♀</b> (Japanese: ニドラン♀) is a <a href="/wiki/Poison_(type)">Poison-type</a> <a href="/wiki/Pok%C3%A9mon_(species)" title="Pokémon (species)">Pokémon</a> introduced in <a href="/wiki/Generation_I">Generation I</a>.`,
    });
    female.html = female.html.replace(
      "<h1>Bulbasaur (Pokémon)</h1>",
      "<h1>Nidoran♀ (Pokémon)</h1>",
    );
    expect(parseBulbapediaBaseSpeciesEvidence(female)).toMatchObject({
      sourceName: "Nidoran♀",
      introducedGeneration: 1,
      typeSourceKeys: ["poison"],
    });
  });

  it("does not treat punctuation inside the exact Species name as an earlier sentence boundary", () => {
    const mrMime = baseSpeciesSource({
      url: `${BULBAPEDIA_SPECIES_PAGE_URL_PREFIX}Mr._Mime_(Pok%C3%A9mon)`,
      intro: `<b>Mr. Mime</b> (Japanese: バリヤード) is a dual-type <a href="/wiki/Psychic_(type)">Psychic</a>/<a href="/wiki/Fairy_(type)">Fairy</a> <a href="/wiki/Pok%C3%A9mon_(species)">Pokémon</a> introduced in <a href="/wiki/Generation_I">Generation I</a>.`,
    });
    mrMime.html = mrMime.html.replace(
      "<h1>Bulbasaur (Pokémon)</h1>",
      "<h1>Mr. Mime (Pokémon)</h1>",
    );
    expect(parseBulbapediaBaseSpeciesEvidence(mrMime)).toMatchObject({
      sourceName: "Mr. Mime",
      introducedGeneration: 1,
      typeSourceKeys: ["psychic", "fairy"],
    });
  });

  it("accepts a structured species intro whose category is Legendary Pokémon", () => {
    const source = baseSpeciesSource({
      url: `${BULBAPEDIA_SPECIES_PAGE_URL_PREFIX}Ho-Oh_(Pok%C3%A9mon)`,
      intro: `<b>Ho-Oh</b> (Japanese: ホウオウ) is a dual-type <a href="/wiki/Fire_(type)">Fire</a>/<a href="/wiki/Flying_(type)">Flying</a> <a href="/wiki/Legendary_Pok%C3%A9mon">Legendary Pokémon</a> introduced in <a href="/wiki/Generation_II">Generation II</a>.`,
    });
    source.html = source.html.replace(
      "<h1>Bulbasaur (Pokémon)</h1>",
      "<h1>Ho-Oh (Pokémon)</h1>",
    );
    expect(parseBulbapediaBaseSpeciesEvidence(source)).toMatchObject({
      sourceName: "Ho-Oh",
      introducedGeneration: 2,
      typeSourceKeys: ["fire", "flying"],
    });
  });

  it("uses only the current introductory sentence when a later sentence records historical typing", () => {
    const clefairy = baseSpeciesSource({
      url: `${BULBAPEDIA_SPECIES_PAGE_URL_PREFIX}Clefairy_(Pok%C3%A9mon)`,
      intro: `<b>Clefairy</b> (Japanese: ピッピ) is a <a href="/wiki/Fairy_(type)">Fairy-type</a> <a href="/wiki/Pok%C3%A9mon_(species)">Pokémon</a> introduced in <a href="/wiki/Generation_I">Generation I</a>. Prior to <a href="/wiki/Generation_VI">Generation VI</a>, it was a <a href="/wiki/Normal_(type)">Normal-type</a> Pokémon.`,
    });
    clefairy.html = clefairy.html.replace(
      "<h1>Bulbasaur (Pokémon)</h1>",
      "<h1>Clefairy (Pokémon)</h1>",
    );
    expect(parseBulbapediaBaseSpeciesEvidence(clefairy)).toMatchObject({
      sourceName: "Clefairy",
      introducedGeneration: 1,
      typeSourceKeys: ["fairy"],
    });

    const magnemite = baseSpeciesSource({
      url: `${BULBAPEDIA_SPECIES_PAGE_URL_PREFIX}Magnemite_(Pok%C3%A9mon)`,
      intro: `<b>Magnemite</b> (Japanese: コイル) is a dual-type <a href="/wiki/Electric_(type)">Electric</a>/<a href="/wiki/Steel_(type)">Steel</a> <a href="/wiki/Pok%C3%A9mon_(species)">Pokémon</a> introduced in <a href="/wiki/Generation_I">Generation I</a>. Prior to <a href="/wiki/Generation_II">Generation II</a>, it was a pure <a href="/wiki/Electric_(type)">Electric-type</a> Pokémon.`,
    });
    magnemite.html = magnemite.html.replace(
      "<h1>Bulbasaur (Pokémon)</h1>",
      "<h1>Magnemite (Pokémon)</h1>",
    );
    expect(parseBulbapediaBaseSpeciesEvidence(magnemite)).toMatchObject({
      sourceName: "Magnemite",
      introducedGeneration: 1,
      typeSourceKeys: ["electric", "steel"],
    });
  });

  it("rejects preceding sentence contamination and duplicate introduced-in text", () => {
    expect(() => parseBulbapediaBaseSpeciesEvidence(baseSpeciesSource({
      intro: `<b>Bulbasaur</b> was formerly a <a href="/wiki/Poison_(type)">Poison-type</a> Pokémon. It is now a <a href="/wiki/Grass_(type)">Grass-type</a> Pokémon introduced in <a href="/wiki/Generation_I">Generation I</a>.`,
    }))).toThrow(/must terminate the first sentence/i);

    expect(() => parseBulbapediaBaseSpeciesEvidence(baseSpeciesSource({
      intro: `<b>Bulbasaur</b> was introduced in folklore; it is a <a href="/wiki/Grass_(type)">Grass-type</a> Pokémon introduced in <a href="/wiki/Generation_I">Generation I</a>.`,
    }))).toThrow(/exactly one introduced-in phrase/i);
  });

  it("ignores flat, nested and inert-token hidden Type markup inside the selected introductory sentence", () => {
    const source = baseSpeciesSource({
      intro: `<b>Bulbasaur</b> is a <span style="display:none"><a href="/wiki/Fire_(type)">Fire-type</a></span> <a href="/wiki/Grass_(type)">Grass-type</a> <a href="/wiki/Pok%C3%A9mon_(species)">Pokémon</a> introduced in <a href="/wiki/Generation_I">Generation I</a>.`,
    });
    expect(parseBulbapediaBaseSpeciesEvidence(source)).toMatchObject({
      typeSourceKeys: ["grass"],
    });

    const nested = baseSpeciesSource({
      intro: `<b>Bulbasaur</b> is a <span style="display:none"><span>aux</span><a href="/wiki/Fire_(type)">Fire-type</a></span> <a href="/wiki/Grass_(type)">Grass-type</a> <a href="/wiki/Pok%C3%A9mon_(species)">Pokémon</a> introduced in <a href="/wiki/Generation_I">Generation I</a>.`,
    });
    expect(parseBulbapediaBaseSpeciesEvidence(nested)).toMatchObject({
      typeSourceKeys: ["grass"],
    });

    const inertClosingTag = baseSpeciesSource({
      intro: `<b>Bulbasaur</b> is a <span style="display:none"><!-- </span> --><a href="/wiki/Fire_(type)">Fire-type</a></span> <a href="/wiki/Grass_(type)">Grass-type</a> <a href="/wiki/Pok%C3%A9mon_(species)">Pokémon</a> introduced in <a href="/wiki/Generation_I">Generation I</a>.`,
    });
    expect(parseBulbapediaBaseSpeciesEvidence(inertClosingTag)).toMatchObject({
      typeSourceKeys: ["grass"],
    });
  });

  it("rejects a non-canonical Species URL or URL/name disagreement", () => {
    expect(() =>
      parseBulbapediaBaseSpeciesEvidence(baseSpeciesSource({ url: "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur" })),
    ).toThrow(/unexpected Bulbapedia Species page URL/i);
    expect(() =>
      parseBulbapediaBaseSpeciesEvidence(
        baseSpeciesSource({ url: `${BULBAPEDIA_SPECIES_PAGE_URL_PREFIX}Ivysaur_(Pok%C3%A9mon)` }),
      ),
    ).toThrow(/URL title.*introductory name.*disagree/i);
  });

  it("rejects ambiguous intro evidence and Type-link disagreement", () => {
    const source = baseSpeciesSource();
    source.html = source.html.replace("<h4><span", `<p><b>Bulbasaur</b> is a <a href="/wiki/Grass_(type)">Grass</a> <a href="/wiki/Pok%C3%A9mon_(species)" title="Pokémon (species)">Pokémon</a> introduced in <a href="/wiki/Generation_I">Generation I</a>.</p><h4><span`);
    expect(() => parseBulbapediaBaseSpeciesEvidence(source)).toThrow(/exactly one introductory species sentence/i);

    expect(() =>
      parseBulbapediaBaseSpeciesEvidence(
        baseSpeciesSource({
          intro: `<b>Bulbasaur</b> (Japanese: フシギダネ) is a <a href="/wiki/Grass_(type)">Poison</a> <a href="/wiki/Pok%C3%A9mon_(species)" title="Pokémon (species)">Pokémon</a> introduced in <a href="/wiki/Generation_I">Generation I</a>.`,
        }),
      ),
    ).toThrow(/Type link and displayed Type disagree/i);
  });

  it("rejects incomplete, duplicate or hidden Base-stats evidence", () => {
    const incomplete = `
      <table>
        ${statRow("HP", "/wiki/HP", 45)}
        ${statRow("Attack", "/wiki/Stat#Attack", 49)}
      </table>`;
    expect(() => parseBulbapediaBaseSpeciesEvidence(baseSpeciesSource({ stats: incomplete }))).toThrow(/six-stat table|incomplete/i);

    const duplicate = `
      <table>
        ${statRow("HP", "/wiki/HP", 45)}
        ${statRow("HP", "/wiki/HP", 46)}
        ${statRow("Attack", "/wiki/Stat#Attack", 49)}
        ${statRow("Defense", "/wiki/Stat#Defense", 49)}
        ${statRow("Sp. Atk", "/wiki/Stat#Special_Attack", 65)}
        ${statRow("Sp. Def", "/wiki/Stat#Special_Defense", 65)}
        ${statRow("Speed", "/wiki/Stat#Speed", 45)}
      </table>`;
    expect(() => parseBulbapediaBaseSpeciesEvidence(baseSpeciesSource({ stats: duplicate }))).toThrow(/duplicate hp (?:stat )?row/i);

    const hidden = baseSpeciesSource().html.replace("<th><div><a href=\"/wiki/HP\"", "<th style=\"display:none\"><div><a href=\"/wiki/HP\"");
    expect(() => parseBulbapediaBaseSpeciesEvidence({ ...baseSpeciesSource(), html: hidden })).toThrow(/hidden structured stat cell/i);
  });
});

describe("Bulbapedia regional-form evidence", () => {
  const rattata = `
    <tr>
      <td>#0019</td>
      <td><a href="/wiki/Rattata_(Pok%C3%A9mon)">Rattata</a></td>
      <td><img src="ignored.png">${typeLinks("Normal")}</td>
      ${regionCell("Alola", "VII")}
      <td><img src="ignored.png">${typeLinks("Dark", "Normal")}</td>
    </tr>`;

  it("parses regional rows and expands current rowspan structure", () => {
    const meowth = `
      <tr>
        <td rowspan="2">#0052</td>
        <td rowspan="2"><a href="/wiki/Meowth_(Pok%C3%A9mon)">Meowth</a></td>
        <td rowspan="2"><img src="ignored.png">${typeLinks("Normal")}</td>
        ${regionCell("Alola", "VII")}
        <td><img src="ignored.png">${typeLinks("Dark")}</td>
      </tr>
      <tr>
        ${regionCell("Galar", "VIII")}
        <td><img src="ignored.png">${typeLinks("Steel")}</td>
      </tr>`;

    expect(parseBulbapediaRegionalForms(regionalSource(rattata + meowth))).toEqual([
      {
        nationalDexNumber: 19,
        sourceName: "Rattata",
        formLabel: "Alolan Rattata",
        region: "Alola",
        introducedGeneration: 7,
        regionalTypeSourceKeys: ["dark", "normal"],
        sourceRecordId: REGIONAL_SOURCE_RECORD_ID,
      },
      {
        nationalDexNumber: 52,
        sourceName: "Meowth",
        formLabel: "Alolan Meowth",
        region: "Alola",
        introducedGeneration: 7,
        regionalTypeSourceKeys: ["dark"],
        sourceRecordId: REGIONAL_SOURCE_RECORD_ID,
      },
      {
        nationalDexNumber: 52,
        sourceName: "Meowth",
        formLabel: "Galarian Meowth",
        region: "Galar",
        introducedGeneration: 8,
        regionalTypeSourceKeys: ["steel"],
        sourceRecordId: REGIONAL_SOURCE_RECORD_ID,
      },
    ]);
  });

  it("supports a shared Region rowspan while preserving distinct regional type evidence", () => {
    const tauros = `
      <tr>
        <td rowspan="3">#0128</td>
        <td rowspan="3"><a href="/wiki/Tauros_(Pok%C3%A9mon)">Tauros</a></td>
        <td rowspan="3"><img src="ignored.png">${typeLinks("Normal")}</td>
        ${regionCell("Paldea", "IX", 3)}
        <td><a href="/wiki/List_of_Pok%C3%A9mon_with_form_differences#Paldean_Tauros">Combat Breed</a>${typeLinks("Fighting")}</td>
      </tr>
      <tr><td><a href="/wiki/List_of_Pok%C3%A9mon_with_form_differences#Paldean_Tauros">Blaze Breed</a>${typeLinks("Fighting", "Fire")}</td></tr>
      <tr><td><a href="/wiki/List_of_Pok%C3%A9mon_with_form_differences#Paldean_Tauros">Aqua Breed</a>${typeLinks("Fighting", "Water")}</td></tr>`;
    const records = parseBulbapediaRegionalForms(regionalSource(tauros));
    expect(records.map((record) => record.formLabel)).toEqual([
      "Combat Breed",
      "Blaze Breed",
      "Aqua Breed",
    ]);
    expect(records.map((record) => record.regionalTypeSourceKeys)).toEqual([
      ["fighting"],
      ["fighting", "fire"],
      ["fighting", "water"],
    ]);
    expect(records.every((record) => record.region === "Paldea" && record.introducedGeneration === 9)).toBe(true);
  });

  it("ignores nested hidden regional Type and breed-label evidence", () => {
    const corsola = `
      <tr>
        <td>#0222</td>
        <td><a href="/wiki/Corsola_(Pok%C3%A9mon)">Corsola</a></td>
        <td><img src="ignored.png">${typeLinks("Water", "Rock")}</td>
        ${regionCell("Galar", "VIII")}
        <td>
          <span style="display:none"><!-- </span> --><span>aux</span><a href="/wiki/List_of_Pok%C3%A9mon_with_form_differences#Hidden">Spoof Breed</a>${typeLinks("Dark")}</span>
          ${typeLinks("Ghost")}
        </td>
      </tr>`;

    expect(parseBulbapediaRegionalForms(regionalSource(corsola))).toEqual([
      {
        nationalDexNumber: 222,
        sourceName: "Corsola",
        formLabel: "Galarian Corsola",
        region: "Galar",
        introducedGeneration: 8,
        regionalTypeSourceKeys: ["ghost"],
        sourceRecordId: REGIONAL_SOURCE_RECORD_ID,
      },
    ]);
  });

  it("rejects duplicate/ambiguous rows and structural drift", () => {
    expect(() => parseBulbapediaRegionalForms(regionalSource(rattata + rattata))).toThrow(/duplicate\/ambiguous row/i);
    expect(() =>
      parseBulbapediaRegionalForms({
        ...regionalSource(rattata),
        html: regionalSource(rattata).html.replace("Region<br>(Generation)", "Region only"),
      }),
    ).toThrow(/structured table|header layout/i);
    expect(() =>
      parseBulbapediaRegionalForms({
        ...regionalSource(rattata),
        url: "https://bulbapedia.bulbagarden.net/wiki/Regional_form?oldid=1",
      }),
    ).toThrow(/unexpected Bulbapedia regional-form list URL/i);
  });

  it("keeps region adjective mapping closed and deterministic", () => {
    expect(canonicalizeBulbapediaRegionAdjective("Alola")).toBe("Alolan");
    expect(canonicalizeBulbapediaRegionAdjective("Galar")).toBe("Galarian");
    expect(canonicalizeBulbapediaRegionAdjective("Hisui")).toBe("Hisuian");
    expect(canonicalizeBulbapediaRegionAdjective("Paldea")).toBe("Paldean");
    expect(() => canonicalizeBulbapediaRegionAdjective("Kanto")).toThrow(/unsupported Bulbapedia regional-form region/i);
  });
});
