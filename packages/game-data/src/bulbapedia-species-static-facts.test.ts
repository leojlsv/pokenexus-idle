import { describe, expect, it } from "vitest";
import {
  BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_PARSER_VERSION,
  BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_URL,
  BULBAPEDIA_SPECIES_STATIC_FACTS_PARSER_VERSION,
  parseBulbapediaKantoJohtoSpeciesDiscovery,
  parseBulbapediaSpeciesStaticFacts,
} from "./bulbapedia-species-static-facts.js";

const SOURCE_ID = "source:bulbapedia:species-static-test";

function field(label: string, href: string, table: string, colspan = ""): string {
  return `<td ${colspan}><b><a href="${href}">${label}</a></b>${table}</td>`;
}

function oneCell(value: string): string {
  return `<table><tr><td>${value}</td></tr></table>`;
}

function breeding(eggGroup = "Field", cycles = "20 cycles"): string {
  return field(
    "Breeding",
    "/wiki/Pok%C3%A9mon_breeding",
    `<table><tr>
      ${field("Egg Group", "/wiki/Egg_Group", oneCell(`<a href="/wiki/${eggGroup}_(Egg_Group)">${eggGroup}</a>`))}
      ${field("Hatch time", "/wiki/Egg_cycle", oneCell(cycles))}
    </tr></table>`,
    'colspan="2"',
  );
}

function commonFields(overrides: {
  abilities: string;
  height: string;
  weight: string;
  evYield: string;
  catchRate?: string;
  gender?: string;
  baseExperience?: string;
  growth?: string;
  friendship?: string;
  breeding?: string;
}): string {
  const baseExperienceTable = overrides.baseExperience?.startsWith("<table")
    ? overrides.baseExperience
    : oneCell(overrides.baseExperience ?? "172<br><small>V+</small>");
  return `<table><tr>${field("Abilities", "/wiki/Ability", overrides.abilities, 'colspan="2"')}</tr>
    <tr>${field("Gender ratio", "/wiki/List_of_Pok%C3%A9mon_by_gender_ratio", oneCell(overrides.gender ?? "50% male, 50% female"))}
      ${field("Catch rate", "/wiki/Catch_rate", oneCell(overrides.catchRate ?? "45"))}</tr>
    <tr>${overrides.breeding ?? breeding()}</tr>
    <tr>${field("Height", "/wiki/List_of_Pok%C3%A9mon_by_height", overrides.height)}
      ${field("Weight", "/wiki/Weight", overrides.weight)}</tr>
    <tr>${field("Base experience yield", "/wiki/Experience", baseExperienceTable)}
      ${field("Leveling rate", "/wiki/Experience", oneCell(overrides.growth ?? "Medium Fast"))}</tr>
    <tr>${field("EV yield", "/wiki/List_of_Pok%C3%A9mon_by_effort_value_yield", overrides.evYield, 'colspan="2"')}</tr>
    <tr><td>Other</td>${field("Base friendship", "/wiki/List_of_Pok%C3%A9mon_by_base_friendship", oneCell(overrides.friendship ?? "70"))}</tr>
  </table>`;
}

function metricRows(values: Array<[string, string | null]>, unit: "m" | "kg"): string {
  return `<table>${values.map(([value, label]) =>
    `<tr><td>${unit === "m" ? "imperial" : "lbs"}</td><td>${value} ${unit}</td></tr>${label === null ? "" : `<tr><td colspan="2"><small>${label}</small></td></tr>`}`,
  ).join("")}</table>`;
}

function metricRowsWithHiddenComplements(
  value: string,
  sourceName: string,
  complementLabels: string[],
  unit: "m" | "kg",
): string {
  return `<table>
    <tr><td>${unit === "m" ? "imperial" : "lbs"}</td><td>${value} ${unit}</td></tr>
    <tr style="display:none"><td colspan="2"><small>${sourceName}</small></td></tr>
    ${complementLabels.map((label) => `
      <tr style="display:none"><td>${unit === "m" ? "imperial" : "lbs"}</td><td>0 ${unit}</td></tr>
      <tr style="display:none"><td colspan="2"><small>${label}</small></td></tr>
    `).join("")}
  </table>`;
}

function evRows(values: Array<[string | null, [number, number, number, number, number, number]]>): string {
  const labels = ["HP", "Atk", "Def", "Sp.Atk", "Sp.Def", "Speed"];
  return `<table><tr><td colspan="6">Total: 2</td></tr>${values.map(([form, stats]) =>
    `${form === null ? "" : `<tr><td colspan="6">${form}</td></tr>`}<tr>${stats.map((value, i) => `<td>${value}<br><small>${labels[i]}</small></td>`).join("")}</tr>`,
  ).join("")}</table>`;
}

function source(name: string, body: string) {
  return {
    url: `https://bulbapedia.bulbagarden.net/wiki/${name.replace(/ /g, "_")}_(Pok%C3%A9mon)`,
    sourceRecordId: SOURCE_ID,
    html: `<main><h1>${name} (Pokémon)</h1>${body}</main>`,
  };
}

describe("Bulbapedia Species static facts", () => {
  it("exports a stable version and extracts Rattata-like base + Alolan explicit evidence", () => {
    expect(BULBAPEDIA_SPECIES_STATIC_FACTS_PARSER_VERSION).toBe("bulbapedia-species-static-facts-v12");
    const abilities = `<table><tr>
      <td><a href="/wiki/Run_Away_(Ability)">Run Away</a> or <a href="/wiki/Guts_(Ability)">Guts</a><br><small>Rattata</small></td>
      <td><a href="/wiki/Gluttony_(Ability)">Gluttony</a> or <a href="/wiki/Hustle_(Ability)">Hustle</a><br><small>Alolan Form</small></td></tr>
      <tr><td><a href="/wiki/Hustle_(Ability)">Hustle</a><br><small>Rattata Hidden Ability</small></td>
      <td><a href="/wiki/Thick_Fat_(Ability)">Thick Fat</a><br><small>Alolan Form Hidden Ability</small></td>
      <td style="display:none"><a href="/wiki/Cacophony_(Ability)">Cacophony</a><br><small>Alolan Form</small></td></tr></table>`;
    const result = parseBulbapediaSpeciesStaticFacts(source("Rattata", commonFields({
      abilities,
      height: metricRowsWithHiddenComplements("0.3", "Rattata", ["Alolan Form"], "m"),
      weight: metricRows([["3.5", "Rattata"], ["3.8", "Alolan Form"]], "kg"),
      evYield: evRows([[null, [0, 0, 0, 0, 0, 1]]]),
      catchRate: "255 <small>(43.9%)</small>",
      baseExperience: `<table><tr><td>57<br><small>Gen. I-IV</small></td><td style="display:none">Unknown<br><small>IV</small></td><td>51<br><small>V+</small></td></tr></table>`,
      growth: "Medium Fast",
      friendship: "70",
      breeding: breeding("Field", "15 cycles"),
    })));

    expect(result.formLabels).toEqual([null, "Alolan Form"]);
    expect(result.abilities.map(({ formLabels, abilitySourceKey, sourceAbilitySlot }) => ({ formLabels, abilitySourceKey, sourceAbilitySlot }))).toEqual([
      { formLabels: [null], abilitySourceKey: "run-away", sourceAbilitySlot: "normal-1" },
      { formLabels: [null], abilitySourceKey: "guts", sourceAbilitySlot: "normal-2" },
      { formLabels: ["Alolan Form"], abilitySourceKey: "gluttony", sourceAbilitySlot: "normal-1" },
      { formLabels: ["Alolan Form"], abilitySourceKey: "hustle", sourceAbilitySlot: "normal-2" },
      { formLabels: [null], abilitySourceKey: "hustle", sourceAbilitySlot: "hidden" },
      { formLabels: ["Alolan Form"], abilitySourceKey: "thick-fat", sourceAbilitySlot: "hidden" },
    ]);
    expect(result.catchRate).toEqual([{ formLabels: [null, "Alolan Form"], fact: { status: "known", value: 255 } }]);
    expect(result.growthRate).toEqual([{ formLabels: [null, "Alolan Form"], fact: { status: "known", value: "medium-fast" } }]);
    expect(result.baseExperience).toEqual([{ formLabels: [null, "Alolan Form"], fact: { status: "known", value: 51 } }]);
    expect(result.baseFriendship).toEqual([{ formLabels: [null, "Alolan Form"], fact: { status: "known", value: 70 } }]);
    expect(result.eggGroups).toEqual([{ formLabels: [null, "Alolan Form"], fact: { status: "known", value: ["field"] } }]);
    expect(result.eggCycles[0].fact).toEqual({ status: "known", value: 15 });
    expect(result.genderRatio[0].fact).toEqual({ status: "known", value: { kind: "ratio", maleBasisPoints: 5000, femaleBasisPoints: 5000 } });
    expect(result.heightMillimeters).toEqual([{ formLabels: [null], fact: { status: "known", value: 300 } }]);
    expect(result.metricComplementFormLabels.heightMillimeters).toEqual(["Alolan Form"]);
    expect(result.metricComplementFormLabels.weightGrams).toEqual([]);
    expect(result.weightGrams).toEqual([
      { formLabels: [null], fact: { status: "known", value: 3500 } },
      { formLabels: ["Alolan Form"], fact: { status: "known", value: 3800 } },
    ]);
    expect(result.evYield).toEqual([{ formLabels: [null, "Alolan Form"], fact: { status: "known", value: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 1 } } }]);
    expect(JSON.stringify(result)).not.toMatch(/Cacophony|43\.9/);
  });

  it("models Tauros-like Paldean breeds exactly while sharing explicit common fields once", () => {
    const abilities = `<table><tr><td colspan="2"><a href="/wiki/Intimidate_(Ability)">Intimidate</a> or <a href="/wiki/Anger_Point_(Ability)">Anger Point</a></td></tr>
      <tr><td><a href="/wiki/Sheer_Force_(Ability)">Sheer Force</a><br><small>Tauros Hidden Ability</small></td>
      <td><a href="/wiki/Cud_Chew_(Ability)">Cud Chew</a><br><small>Paldean Form Hidden Ability</small></td></tr></table>`;
    const forms = ["Paldean Form (Combat Breed)", "Paldean Form (Blaze Breed)", "Paldean Form (Aqua Breed)"];
    const result = parseBulbapediaSpeciesStaticFacts(source("Tauros", commonFields({
      abilities,
      height: metricRowsWithHiddenComplements("1.4", "Tauros", forms, "m"),
      weight: metricRows([["88.4", "Tauros"], ["115.0", forms[0]], ["85.0", forms[1]], ["110.0", forms[2]]], "kg"),
      evYield: evRows([
        ["Tauros", [0, 1, 0, 0, 0, 1]],
        [forms[0], [0, 2, 0, 0, 0, 0]],
        [forms[1], [0, 2, 0, 0, 0, 0]],
        [forms[2], [0, 2, 0, 0, 0, 0]],
      ]),
      gender: "100% male",
      growth: "Slow",
    })));
    expect(result.formLabels).toEqual([null, ...forms.slice().sort()]);
    const intimidate = result.abilities.find((entry) => entry.abilitySourceKey === "intimidate");
    expect(intimidate?.formLabels).toEqual(result.formLabels);
    const cudChew = result.abilities.find((entry) => entry.abilitySourceKey === "cud-chew");
    expect(cudChew?.formLabels).toEqual(forms.slice().sort());
    expect(result.weightGrams).toHaveLength(4);
    expect(result.metricComplementFormLabels.heightMillimeters).toEqual(forms.slice().sort());
    expect(result.genderRatio[0].fact).toEqual({ status: "known", value: { kind: "ratio", maleBasisPoints: 10000, femaleBasisPoints: 0 } });
    expect(result.evYield).toHaveLength(4);
  });

  it("uses source-unavailable only for an explicit visible dash", () => {
    const abilities = `<table><tr><td><a href="/wiki/Overgrow_(Ability)">Overgrow</a></td></tr></table>`;
    const result = parseBulbapediaSpeciesStaticFacts(source("Bulbasaur", commonFields({
      abilities,
      height: metricRows([["0.7", null]], "m"),
      weight: metricRows([["6.9", null]], "kg"),
      evYield: evRows([[null, [0, 0, 0, 1, 0, 0]]]),
      baseExperience: "—",
    })));
    expect(result.baseExperience).toEqual([{ formLabels: [null], fact: { status: "source-unavailable" } }]);

    const friendshipField = field("Base friendship", "/wiki/List_of_Pok%C3%A9mon_by_base_friendship", oneCell("70"));
    const missing = commonFields({ abilities, height: metricRows([["0.7", null]], "m"), weight: metricRows([["6.9", null]], "kg"), evYield: evRows([[null, [0, 0, 0, 1, 0, 0]]]) })
      .replace(friendshipField, "");
    expect(() => parseBulbapediaSpeciesStaticFacts(source("Bulbasaur", missing))).toThrow(/Base friendship/);
  });

  it("treats a standalone Hidden Ability label as shared hidden-slot evidence", () => {
    const abilities = `<table><tr>
      <td><a href="/wiki/Overgrow_(Ability)">Overgrow</a></td>
      <td><a href="/wiki/Chlorophyll_(Ability)">Chlorophyll</a><br><small> Hidden Ability</small></td>
    </tr></table>`;
    const result = parseBulbapediaSpeciesStaticFacts(source("Bulbasaur", commonFields({
      abilities,
      height: metricRows([["0.7", null]], "m"),
      weight: metricRows([["6.9", null]], "kg"),
      evYield: evRows([[null, [0, 0, 0, 1, 0, 0]]]),
      breeding: breeding().replace(">Egg Group</a>", ">Egg Groups</a>"),
    })));

    expect(result.abilities.map(({ abilitySourceKey, sourceAbilitySlot, formLabels }) => ({
      abilitySourceKey,
      sourceAbilitySlot,
      formLabels,
    }))).toEqual([
      { abilitySourceKey: "overgrow", sourceAbilitySlot: "normal-1", formLabels: [null] },
      { abilitySourceKey: "chlorophyll", sourceAbilitySlot: "hidden", formLabels: [null] },
    ]);
    expect(result.eggGroups).toEqual([
      { formLabels: [null], fact: { status: "known", value: ["field"] } },
    ]);
  });

  it("treats generation-scoped Ability labels as temporal evidence, not persistent forms", () => {
    const gengarAbilities = `<table>
      <tr><td><a href="/wiki/Cursed_Body_(Ability)">Cursed Body</a><br><small>Gengar</small></td></tr>
      <tr><td><a href="/wiki/Levitate_(Ability)">Levitate</a><br><small>Gengar Gen III-VI</small></td></tr>
    </table>`;
    const gengar = parseBulbapediaSpeciesStaticFacts(source("Gengar", commonFields({
      abilities: gengarAbilities,
      height: metricRows([["1.5", null]], "m"),
      weight: metricRows([["40.5", null]], "kg"),
      evYield: evRows([[null, [0, 0, 0, 3, 0, 0]]]),
    })));
    expect(gengar.formLabels).toEqual([null]);
    expect(gengar.abilities.map(({ abilitySourceKey, sourceAbilitySlot, formLabels }) => ({
      abilitySourceKey, sourceAbilitySlot, formLabels,
    }))).toEqual([
      { abilitySourceKey: "cursed-body", sourceAbilitySlot: "normal-1", formLabels: [null] },
    ]);

    const koffingAbilities = `<table>
      <tr><td><a href="/wiki/Levitate_(Ability)">Levitate</a> or <a href="/wiki/Neutralizing_Gas_(Ability)">Neutralizing Gas</a></td></tr>
      <tr><td><a href="/wiki/Stench_(Ability)">Stench</a><br><small>Gen VIII+ Hidden Ability</small></td></tr>
      <tr><td><a href="/wiki/Aftermath_(Ability)">Aftermath</a><br><small>Gen V-VI * Hidden Ability</small></td></tr>
    </table>`;
    const koffing = parseBulbapediaSpeciesStaticFacts(source("Koffing", commonFields({
      abilities: koffingAbilities,
      height: metricRows([["0.6", null]], "m"),
      weight: metricRows([["1.0", null]], "kg"),
      evYield: evRows([[null, [0, 0, 1, 0, 0, 0]]]),
    })));
    expect(koffing.formLabels).toEqual([null]);
    expect(koffing.abilities.map(({ abilitySourceKey, sourceAbilitySlot, formLabels }) => ({
      abilitySourceKey, sourceAbilitySlot, formLabels,
    }))).toEqual([
      { abilitySourceKey: "levitate", sourceAbilitySlot: "normal-1", formLabels: [null] },
      { abilitySourceKey: "neutralizing-gas", sourceAbilitySlot: "normal-2", formLabels: [null] },
      { abilitySourceKey: "stench", sourceAbilitySlot: "hidden", formLabels: [null] },
    ]);
  });

  it("accepts the exact singular Ability header used by single-Ability Species", () => {
    const abilities = `<table><tr><td><a href="/wiki/Shed_Skin_(Ability)">Shed Skin</a></td></tr></table>`;
    const body = commonFields({
      abilities,
      height: metricRows([["0.7", null]], "m"),
      weight: metricRows([["9.9", null]], "kg"),
      evYield: evRows([[null, [0, 0, 2, 0, 0, 0]]]),
    }).replace(">Abilities</a>", ">Ability</a>");
    const result = parseBulbapediaSpeciesStaticFacts(source("Metapod", body));
    expect(result.abilities.map(({ abilitySourceKey, sourceAbilitySlot }) => ({
      abilitySourceKey,
      sourceAbilitySlot,
    }))).toEqual([{ abilitySourceKey: "shed-skin", sourceAbilitySlot: "normal-1" }]);
  });

  it("keeps Pikachu base Egg Groups while excluding the explicitly qualified Cosplay/Cap group", () => {
    const abilities = `<table><tr><td><a href="/wiki/Static_(Ability)">Static</a></td></tr></table>`;
    const pikachuBreeding = field(
      "Breeding",
      "/wiki/Pok%C3%A9mon_breeding",
      `<table><tr>
        ${field(
          "Egg Groups",
          "/wiki/Egg_Group",
          oneCell(
            `<a href="/wiki/Field_(Egg_Group)">Field</a> and <a href="/wiki/Fairy_(Egg_Group)">Fairy</a> or <a href="/wiki/No_Eggs_Discovered_(Egg_Group)">No Eggs Discovered</a><sup><a href="/wiki/Cosplay_Pikachu">Cosplay</a>/<a href="/wiki/Pikachu_in_a_cap">Cap</a></sup>`,
          ),
        )}
        ${field("Hatch time", "/wiki/Egg_cycle", oneCell("10 cycles"))}
      </tr></table>`,
      'colspan="2"',
    );
    const result = parseBulbapediaSpeciesStaticFacts(source("Pikachu", commonFields({
      abilities,
      height: metricRows([["0.4", null]], "m"),
      weight: metricRows([["6.0", null]], "kg"),
      evYield: evRows([[null, [0, 0, 0, 0, 0, 2]]]),
      breeding: pikachuBreeding,
    })));
    expect(result.eggGroups).toEqual([
      { formLabels: [null], fact: { status: "known", value: ["field", "fairy"] } },
    ]);
  });

  it("uses the current V+ Base Exp. value while accepting one exact parenthetical historical note", () => {
    const abilities = `<table><tr><td><a href="/wiki/Static_(Ability)">Static</a></td></tr></table>`;
    const result = parseBulbapediaSpeciesStaticFacts(source("Raichu", commonFields({
      abilities,
      height: metricRows([["0.8", null]], "m"),
      weight: metricRows([["30.0", null]], "kg"),
      evYield: evRows([[null, [0, 0, 0, 0, 0, 3]]]),
      baseExperience: `<table><tr>
        <td>122<br><small>Gen. I-IV</small></td>
        <td>218 <small>(214 in V-VI)</small><br><small>V+</small></td>
      </tr></table>`,
    })));
    expect(result.baseExperience).toEqual([
      { formLabels: [null], fact: { status: "known", value: 218 } },
    ]);

    const unsupportedHistoricalRange = commonFields({
      abilities,
      height: metricRows([["0.8", null]], "m"),
      weight: metricRows([["30.0", null]], "kg"),
      evYield: evRows([[null, [0, 0, 0, 0, 0, 3]]]),
      baseExperience: `<table><tr>
        <td>122<br><small>Gen. I-IV</small></td>
        <td>218 <small>(214 in IV-V)</small><br><small>V+</small></td>
      </tr></table>`,
    });
    expect(() => parseBulbapediaSpeciesStaticFacts(source("Raichu", unsupportedHistoricalRange)))
      .toThrow(/multiple visible values require one explicit version label each/i);
  });

  it("ignores only structured historical asterisks in current EV-yield values", () => {
    const abilities = `<table><tr><td><a href="/wiki/Speed_Boost_(Ability)">Speed Boost</a></td></tr></table>`;
    const historical = '<span class="explain" title="2 in Generation III">*</span>';
    const evYield = `<table>
      <tr><td colspan="6">Total: 1${historical}</td></tr>
      <tr>
        <td>0<br><small>HP</small></td><td>0<br><small>Atk</small></td>
        <td>0<br><small>Def</small></td><td>0<br><small>Sp.Atk</small></td>
        <td>0<br><small>Sp.Def</small></td><td>1${historical}<br><small>Speed</small></td>
      </tr>
    </table>`;
    const result = parseBulbapediaSpeciesStaticFacts(source("Yanma", commonFields({
      abilities,
      height: metricRows([["1.2", null]], "m"),
      weight: metricRows([["38.0", null]], "kg"),
      evYield,
    })));
    expect(result.evYield).toEqual([
      {
        formLabels: [null],
        fact: { status: "known", value: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 1 } },
      },
    ]);

    const earlierHistorical = evYield.replaceAll("2 in Generation III", "1 in Generation III");
    expect(() =>
      parseBulbapediaSpeciesStaticFacts(source("Misdreavus", commonFields({
        abilities,
        height: metricRows([["0.7", null]], "m"),
        weight: metricRows([["1.0", null]], "kg"),
        evYield: earlierHistorical,
      }))),
    ).not.toThrow();

    const malformed = evYield.replace("2 in Generation III", "historical value");
    expect(() =>
      parseBulbapediaSpeciesStaticFacts(source("Yanma", commonFields({
        abilities,
        height: metricRows([["1.2", null]], "m"),
        weight: metricRows([["38.0", null]], "kg"),
        evYield: malformed,
      }))),
    ).toThrow(/unsupported historical annotation/i);

    const unsupportedGeneration = evYield.replace("2 in Generation III", "2 in Generation IV");
    expect(() =>
      parseBulbapediaSpeciesStaticFacts(source("Yanma", commonFields({
        abilities,
        height: metricRows([["1.2", null]], "m"),
        weight: metricRows([["38.0", null]], "kg"),
        evYield: unsupportedGeneration,
      }))),
    ).toThrow(/unsupported historical annotation/i);
  });

  it("ignores unrelated hidden Ability placeholders but rejects hidden metric-scope drift", () => {
    const abilities = `<table><tr><td><a href="/wiki/Overgrow_(Ability)">Overgrow</a><span style="display:none"><!-- </span> --><span>aux</span><a href="/wiki/Cacophony_(Ability)">Cacophony</a></span></td><td style="display:none"><a href="/wiki/Cacophony_(Ability)">Cacophony</a></td></tr></table>`;
    const body = commonFields({
      abilities,
      height: metricRows([["0.7", null]], "m"),
      weight: metricRows([["6.9", null]], "kg"),
      evYield: evRows([[null, [0, 0, 0, 1, 0, 0]]]),
    });
    const result = parseBulbapediaSpeciesStaticFacts(source("Bulbasaur", body));
    expect(result.formLabels).toEqual([null]);
    expect(JSON.stringify(result)).not.toMatch(/Cacophony/);

    const hiddenScopeDrift = body.replace(
      metricRows([["0.7", null]], "m"),
      `<table><tr><td>imperial</td><td>0.7 m</td></tr><tr style="display:none"><td>0 m</td><td><small>Hidden Form</small></td></tr></table>`,
    );
    expect(() => parseBulbapediaSpeciesStaticFacts(source("Bulbasaur", hiddenScopeDrift))).toThrow(
      /hidden form-label association is not an accepted inactive scope/i,
    );

    const ambiguous = body.replace("<tr><td>imperial</td><td>0.7 m</td></tr>", "<tr><td>imperial</td><td>0.7 m</td></tr><tr><td>imperial</td><td>0.8 m</td></tr>");
    expect(() => parseBulbapediaSpeciesStaticFacts(source("Bulbasaur", ambiguous))).toThrow(/consecutive visible values|ambiguous/i);
  });

  it("does not accept required static fields from a hidden ancestor container", () => {
    const abilities = `<table><tr><td><a href="/wiki/Overgrow_(Ability)">Overgrow</a></td></tr></table>`;
    const height = metricRows([["0.7", null]], "m");
    const weight = metricRows([["6.9", null]], "kg");
    const metricRow = `<tr>${field("Height", "/wiki/List_of_Pok%C3%A9mon_by_height", height)}
      ${field("Weight", "/wiki/Weight", weight)}</tr>`;
    const body = commonFields({
      abilities,
      height,
      weight,
      evYield: evRows([[null, [0, 0, 0, 1, 0, 0]]]),
    });
    const hiddenAncestor = body.replace(
      metricRow,
      metricRow.replace("<tr>", '<tr style="display:none">'),
    );

    expect(() =>
      parseBulbapediaSpeciesStaticFacts(source("Bulbasaur", hiddenAncestor)),
    ).toThrow(/Height: expected exactly one visible structured field, found 0/i);
  });

  it("parses Hatch time cycles while allowing the exact Egg not obtainable annotation", () => {
    const abilities = `<table><tr><td><a href="/wiki/Pressure_(Ability)">Pressure</a></td></tr></table>`;
    const result = parseBulbapediaSpeciesStaticFacts(source("Ho-Oh", commonFields({
      abilities,
      height: metricRows([["3.8", null]], "m"),
      weight: metricRows([["199.0", null]], "kg"),
      evYield: evRows([[null, [0, 0, 0, 0, 3, 0]]]),
      breeding: breeding("Undiscovered", "120 cycles Egg not obtainable"),
    })));
    expect(result.eggCycles).toEqual([
      { formLabels: [null], fact: { status: "known", value: 120 } },
    ]);

    expect(() =>
      parseBulbapediaSpeciesStaticFacts(source("Ho-Oh", commonFields({
        abilities,
        height: metricRows([["3.8", null]], "m"),
        weight: metricRows([["199.0", null]], "kg"),
        evYield: evRows([[null, [0, 0, 0, 0, 3, 0]]]),
        breeding: breeding("Undiscovered", "120 cycles unexpected annotation"),
      }))),
    ).toThrow(/expected exact cycles value/i);
  });

  it("maps Bulbapedia No Eggs Discovered to the canonical undiscovered Egg Group", () => {
    const abilities = `<table><tr><td><a href="/wiki/Pressure_(Ability)">Pressure</a></td></tr></table>`;
    const result = parseBulbapediaSpeciesStaticFacts(source("Ho-Oh", commonFields({
      abilities,
      height: metricRows([["3.8", null]], "m"),
      weight: metricRows([["199.0", null]], "kg"),
      evYield: evRows([[null, [0, 0, 0, 0, 3, 0]]]),
      breeding: breeding("No_Eggs_Discovered", "120 cycles Egg not obtainable"),
    })));
    expect(result.eggGroups).toEqual([
      { formLabels: [null], fact: { status: "known", value: ["undiscovered"] } },
    ]);
  });

  it("maps the exact Bulbapedia Gender unknown label to canonical genderless", () => {
    const abilities = `<table><tr><td><a href="/wiki/Pressure_(Ability)">Pressure</a></td></tr></table>`;
    const result = parseBulbapediaSpeciesStaticFacts(source("Ho-Oh", commonFields({
      abilities,
      height: metricRows([["3.8", null]], "m"),
      weight: metricRows([["199.0", null]], "kg"),
      evYield: evRows([[null, [0, 0, 0, 0, 3, 0]]]),
      gender: "Gender unknown",
      breeding: breeding("No_Eggs_Discovered", "120 cycles Egg not obtainable"),
    })));
    expect(result.genderRatio).toEqual([
      { formLabels: [null], fact: { status: "known", value: { kind: "genderless" } } },
    ]);
  });

  it("does not promote visible battle-only transformation metric rows into persistent form facts", () => {
    const abilities = `<table><tr><td><a href="/wiki/Pickup_(Ability)">Pickup</a></td></tr></table>`;
    const height = `<table>
      <tr><td>1'04&quot;</td><td>0.4 m</td></tr><tr><td colspan="2"><small>Meowth</small></td></tr>
      <tr><td>108'03&quot;+</td><td>33.0+ m</td></tr><tr><td colspan="2"><small>Gigantamax</small></td></tr>
    </table>`;
    const weight = `<table>
      <tr><td>9.3 lbs.</td><td>4.2 kg</td></tr><tr><td colspan="2"><small>Meowth</small></td></tr>
      <tr><td>????.? lbs.</td><td>???.? kg</td></tr><tr><td colspan="2"><small>Gigantamax</small></td></tr>
    </table>`;
    const result = parseBulbapediaSpeciesStaticFacts(source("Meowth", commonFields({
      abilities,
      height,
      weight,
      evYield: evRows([[null, [0, 0, 0, 0, 0, 1]]]),
    })));

    expect(result.formLabels).toEqual([null]);
    expect(result.heightMillimeters).toEqual([
      { formLabels: [null], fact: { status: "known", value: 400 } },
    ]);
    expect(result.weightGrams).toEqual([
      { formLabels: [null], fact: { status: "known", value: 4200 } },
    ]);
    expect(JSON.stringify(result)).not.toContain("Gigantamax");
  });

  it("uses an exact hidden base-name row only as metric scope metadata", () => {
    const abilities = `<table><tr><td><a href="/wiki/Static_(Ability)">Static</a></td></tr></table>`;
    const height = `<table>
      <tr><td>1'04&quot;</td><td>0.4 m</td></tr>
      <tr style="display:none"><td colspan="2"><small>Pikachu</small></td></tr>
      <tr><td>68'11&quot;+</td><td>21.0+ m</td></tr>
      <tr><td colspan="2"><small>Gigantamax</small></td></tr>
      <tr><td>1'04&quot;</td><td>0.4 m</td></tr>
      <tr><td colspan="2"><small>Pale</small></td></tr>
    </table>`;
    const weight = `<table>
      <tr><td>13.2 lbs.</td><td>6.0 kg</td></tr>
      <tr style="display:none"><td colspan="2"><small>Pikachu</small></td></tr>
      <tr><td>????.? lbs.</td><td>???.? kg</td></tr>
      <tr><td colspan="2"><small>Gigantamax</small></td></tr>
      <tr><td>11.0 lbs.</td><td>5.0 kg</td></tr>
      <tr><td colspan="2"><small>Pale</small></td></tr>
    </table>`;
    const result = parseBulbapediaSpeciesStaticFacts(source("Pikachu", commonFields({
      abilities,
      height,
      weight,
      evYield: evRows([[null, [0, 0, 0, 0, 0, 2]]]),
    })));
    expect(result.heightMillimeters).toEqual([
      { formLabels: [null], fact: { status: "known", value: 400 } },
      { formLabels: ["Pale"], fact: { status: "known", value: 400 } },
    ]);
    expect(result.weightGrams).toEqual([
      { formLabels: [null], fact: { status: "known", value: 6000 } },
      { formLabels: ["Pale"], fact: { status: "known", value: 5000 } },
    ]);

    const wrongHiddenBase = height.replace("<small>Pikachu</small>", "<small>Cosplay Pikachu</small>");
    expect(() => parseBulbapediaSpeciesStaticFacts(source("Pikachu", commonFields({
      abilities,
      height: wrongHiddenBase,
      weight,
      evYield: evRows([[null, [0, 0, 0, 0, 0, 2]]]),
    })))).toThrow(/hidden form-label association is not an accepted inactive scope/i);
  });

  it("accepts the exact hidden One form marker only for a single base form", () => {
    const abilities = `<table><tr><td><a href="/wiki/Levitate_(Ability)">Levitate</a></td></tr></table>`;
    const height = `<table>
      <tr><td>1'08&quot;</td><td>0.5 m</td></tr>
      <tr style="display:none"><td colspan="2"><small>One form</small></td></tr>
      <tr style="display:none"><td>0'0&quot;</td><td>0 m</td></tr>
      <tr style="display:none"><td colspan="2"><small>{{{form2}}}</small></td></tr>
    </table>`;
    const weight = `<table>
      <tr><td>11.0 lbs.</td><td>5.0 kg</td></tr>
      <tr style="display:none"><td colspan="2"><small>One form</small></td></tr>
      <tr style="display:none"><td>0 lbs.</td><td>0 kg</td></tr>
      <tr style="display:none"><td colspan="2"><small>{{{form2}}}</small></td></tr>
    </table>`;
    const result = parseBulbapediaSpeciesStaticFacts(source("Unown", commonFields({
      abilities,
      height,
      weight,
      evYield: evRows([[null, [0, 0, 0, 1, 0, 0]]]),
    })));
    expect(result.heightMillimeters).toEqual([
      { formLabels: [null], fact: { status: "known", value: 500 } },
    ]);
    expect(result.weightGrams).toEqual([
      { formLabels: [null], fact: { status: "known", value: 5000 } },
    ]);
  });

  it("records hidden zero metric placeholders without promoting an undiscovered form", () => {
    const abilities = `<table><tr><td><a href="/wiki/Poison_Point_(Ability)">Poison Point</a></td></tr></table>`;
    const height = `<table>
      <tr><td>1'08&quot;</td><td>0.5 m</td></tr>
      <tr style="display:none"><td colspan="2"><small>Qwilfish</small></td></tr>
      <tr style="display:none"><td>0'0&quot;</td><td>0 m</td></tr>
      <tr style="display:none"><td colspan="2"><small>Hisuian Form</small></td></tr>
    </table>`;
    const weight = `<table>
      <tr><td>8.6 lbs.</td><td>3.9 kg</td></tr>
      <tr style="display:none"><td colspan="2"><small>Qwilfish</small></td></tr>
      <tr style="display:none"><td>0 lbs.</td><td>0 kg</td></tr>
      <tr style="display:none"><td colspan="2"><small>Hisuian Form</small></td></tr>
    </table>`;
    const result = parseBulbapediaSpeciesStaticFacts(source("Qwilfish", commonFields({
      abilities,
      height,
      weight,
      evYield: evRows([[null, [0, 1, 0, 0, 0, 0]]]),
    })));
    expect(result.formLabels).toEqual([null]);
    expect(result.metricComplementFormLabels).toEqual({
      heightMillimeters: [],
      weightGrams: [],
    });
    expect(result.metricHiddenPlaceholderFormLabels).toEqual({
      heightMillimeters: ["Hisuian Form"],
      weightGrams: ["Hisuian Form"],
    });
  });

  it("fails closed on URL/title drift and missing required structured sections", () => {
    const abilities = `<table><tr><td><a href="/wiki/Overgrow_(Ability)">Overgrow</a></td></tr></table>`;
    const body = commonFields({ abilities, height: metricRows([["0.7", null]], "m"), weight: metricRows([["6.9", null]], "kg"), evYield: evRows([[null, [0, 0, 0, 1, 0, 0]]]) });
    expect(() => parseBulbapediaSpeciesStaticFacts({ ...source("Bulbasaur", body), url: "https://bulbapedia.bulbagarden.net:444/wiki/Bulbasaur_(Pok%C3%A9mon)" })).toThrow(/unexpected Bulbapedia Species static-facts URL/i);
    expect(() => parseBulbapediaSpeciesStaticFacts({ ...source("Bulbasaur", body), html: `<h1>Ivysaur (Pokémon)</h1>${body}` })).toThrow(/URL and unique page h1 disagree/i);
    expect(() => parseBulbapediaSpeciesStaticFacts(source("Bulbasaur", body.replace(field("Abilities", "/wiki/Ability", abilities, 'colspan="2"'), "")))).toThrow(/Abilities/);
  });
});

function dexRow(dex: number, name: string, formLabels: string[] = [], baseMarker = ""): string {
  const title = name.replace(/ /g, "_");
  const base = `<tr><td rowspan="${formLabels.length + 1}">#${String(dex).padStart(4, "0")}</td><td><img alt="forbidden ${name}"></td>
    <td><a href="/wiki/${title}_(Pok%C3%A9mon)">${name}</a><br><small>${baseMarker}</small></td>
    <td colspan="2">Normal</td></tr>`;
  const forms = formLabels.map((formLabel) =>
    `<tr><td><img alt="forbidden ${formLabel}"></td><td><a href="/wiki/${title}_(Pok%C3%A9mon)">${name}</a><br><small>${formLabel}</small></td><td>Dark</td><td>Normal</td></tr>`,
  ).join("");
  return base + forms;
}

function dexTable(rows: string): string {
  return `<table><tr><th>Ndex</th><th>MS</th><th>Pokémon</th><th colspan="2">Type</th></tr>${rows}</table>`;
}

function dexSource(overrides: { omit?: number; duplicate?: number; ambiguous?: number } = {}) {
  const generation1: string[] = [];
  const generation2: string[] = [];
  for (let dex = 1; dex <= 251; dex += 1) {
    if (dex === overrides.omit) continue;
    const name = `Species ${String(dex).padStart(3, "0")}`;
    let row = dexRow(dex, name, [], dex === 201 ? "One form" : "");
    if (dex === overrides.ambiguous) {
      row = row.replace(`</a><br><small>`, `</a><a href="/wiki/Other_(Pok%C3%A9mon)">Other</a><br><small>`);
    }
    const target = dex <= 151 ? generation1 : generation2;
    target.push(row);
    if (dex === overrides.duplicate) target.push(dexRow(dex, name));
    if (dex === 3) {
      target[target.length - 1] = dexRow(dex, name, [`Mega ${name}`]);
    }
  }
  return {
    url: BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_URL,
    sourceRecordId: SOURCE_ID,
    html: `<h3><span class="mw-headline" id="Generation_I"><a href="/wiki/Generation_I">Generation I</a></span></h3>${dexTable(generation1.join(""))}
      <h3><span class="mw-headline" id="Generation_II"><a href="/wiki/Generation_II">Generation II</a></span></h3>${dexTable(generation2.join(""))}
      <h3><span class="mw-headline" id="Generation_III"><a href="/wiki/Generation_III">Generation III</a></span></h3>`,
  };
}

describe("Bulbapedia Kanto/Johto Species discovery", () => {
  it("discovers exactly base National Dex 1..251 and ignores alternate-form rows/assets", () => {
    expect(BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_PARSER_VERSION).toBe("bulbapedia-kanto-johto-species-discovery-v1");
    const records = parseBulbapediaKantoJohtoSpeciesDiscovery(dexSource());
    expect(records).toHaveLength(251);
    expect(records[0]).toEqual({
      nationalDexNumber: 1,
      sourceName: "Species 001",
      sourcePageUrl: "https://bulbapedia.bulbagarden.net/wiki/Species_001_(Pok%C3%A9mon)",
    });
    expect(records.at(-1)?.nationalDexNumber).toBe(251);
    expect(records.filter((entry) => entry.nationalDexNumber === 3)).toHaveLength(1);
    expect(JSON.stringify(records)).not.toContain("forbidden");
  });

  it("fails closed on missing, duplicate, ambiguous, or noncanonical Core discovery evidence", () => {
    expect(() => parseBulbapediaKantoJohtoSpeciesDiscovery(dexSource({ omit: 251 }))).toThrow(/missing base National Dex 251/i);
    expect(() => parseBulbapediaKantoJohtoSpeciesDiscovery(dexSource({ duplicate: 25 }))).toThrow(/duplicate base Dex 25/i);
    expect(() => parseBulbapediaKantoJohtoSpeciesDiscovery(dexSource({ ambiguous: 7 }))).toThrow(/exactly one base Species identity link/i);
    expect(() => parseBulbapediaKantoJohtoSpeciesDiscovery({ ...dexSource(), url: `${BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_URL}?oldid=1` })).toThrow(/unexpected canonical URL/i);
  });
});
