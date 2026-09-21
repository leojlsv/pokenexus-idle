import { describe, expect, it } from "vitest";
import {
  BULBAPEDIA_ABILITY_LIST_PARSER_VERSION,
  BULBAPEDIA_ABILITY_LIST_URL,
  BULBAPEDIA_ITEM_LIST_ALIAS_URL,
  BULBAPEDIA_ITEM_LIST_PARSER_VERSION,
  BULBAPEDIA_ITEM_LIST_URL,
  BULBAPEDIA_TYPE_CHART_PARSER_VERSION,
  BULBAPEDIA_TYPE_CHART_URL,
  parseBulbapediaAbilityList,
  parseBulbapediaCurrentTypeChart,
  parseBulbapediaItemList,
} from "./bulbapedia-reference-parser";

const TYPE_SOURCE_ID = "source:bulbapedia:type-chart";
const ABILITY_SOURCE_ID = "source:bulbapedia:abilities";
const ITEM_SOURCE_ID = "source:bulbapedia:items";

const TYPE_NAMES = [
  "Normal",
  "Fighting",
  "Flying",
  "Poison",
  "Ground",
  "Rock",
  "Bug",
  "Ghost",
  "Steel",
  "Fire",
  "Water",
  "Grass",
  "Electric",
  "Psychic",
  "Ice",
  "Dragon",
  "Dark",
  "Fairy",
] as const;

function typeLink(name: string): string {
  return `<a href="/wiki/${name}_(type)">${name}</a>`;
}

function multiplier(attackIndex: number, defenseIndex: number): string {
  if (attackIndex === defenseIndex) return "1×";
  if ((attackIndex + defenseIndex) % 17 === 0) return "0×";
  if ((attackIndex + defenseIndex) % 5 === 0) return "½×";
  if ((attackIndex + defenseIndex) % 7 === 0) return "2×";
  return "1×";
}

function typeChartHtml(overrides: { defenseNames?: readonly string[]; rowNames?: readonly string[]; cellsPerRow?: number } = {}): string {
  const defenseNames = overrides.defenseNames ?? TYPE_NAMES;
  const rowNames = overrides.rowNames ?? TYPE_NAMES;
  const cellsPerRow = overrides.cellsPerRow ?? defenseNames.length;
  const defense = defenseNames.map((name) => `<th>${typeLink(name)}</th>`).join("");
  const rows = rowNames.map((name, attackIndex) => {
    const cells = Array.from({ length: cellsPerRow }, (_, defenseIndex) =>
      `<td>${multiplier(attackIndex, defenseIndex)}</td>`,
    ).join("");
    return `<tr><th>${typeLink(name)}</th>${cells}</tr>`;
  }).join("");
  return `<main>
    <h2>Type charts</h2>
    <h3>Generation VI onward</h3>
    <table class="roundy">
      <thead>
        <tr><th>⮣</th><th colspan="18">Defending type</th></tr>
        <tr><th>Attacking type</th>${defense}</tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <h3>Changes</h3>
    <table><tr><th>Historical</th></tr></table>
  </main>`;
}

function typeSource(html = typeChartHtml()) {
  return { url: BULBAPEDIA_TYPE_CHART_URL, sourceRecordId: TYPE_SOURCE_ID, html };
}

function abilitySource(rows: string, header = "#|Name|Description|Gen.") {
  const headers = header.split("|").map((cell) => `<th>${cell}</th>`).join("");
  return {
    url: BULBAPEDIA_ABILITY_LIST_URL,
    sourceRecordId: ABILITY_SOURCE_ID,
    html: `<main>
      <h2>List of Abilities</h2>
      <table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
      <h2>In other languages</h2>
    </main>`,
  };
}

function abilityRow(index: number, name: string, generation: string, description = "effect prose"): string {
  const path = name.replace(/'/g, "%27").replace(/ /g, "_");
  return `<tr><td>${index}</td><td><a href="/wiki/${path}_(Ability)">${name}</a></td><td>${description}</td><td>${generation}</td></tr>`;
}

function itemTable(rows: string, header = "Icon|Name|Gen.|Description"): string {
  const headers = header.split("|").map((cell) => `<th>${cell}</th>`).join("");
  return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

function itemRow(name: string, generation: string, description = "item effect prose"): string {
  const path = name.replace(/'/g, "%27").replace(/ /g, "_");
  return `<tr><td><img src="forbidden.png" alt="Fake ${name} IX"></td><td><a href="/wiki/${path}">${name}</a></td><td>${generation}</td><td>${description}</td></tr>`;
}

function itemSource(rows: string, url = BULBAPEDIA_ITEM_LIST_URL) {
  return {
    url,
    sourceRecordId: ITEM_SOURCE_ID,
    html: `<main><h1>List of items by name</h1><h2>List of items by name</h2><h3>A</h3>${itemTable(rows)}</main>`,
  };
}

describe("Bulbapedia non-Move reference parsers", () => {
  it("exposes versioned parsers bound to the approved source URLs", () => {
    expect(BULBAPEDIA_TYPE_CHART_PARSER_VERSION).toBe("bulbapedia-current-type-chart-v1");
    expect(BULBAPEDIA_ABILITY_LIST_PARSER_VERSION).toBe("bulbapedia-ability-list-v1");
    expect(BULBAPEDIA_ITEM_LIST_PARSER_VERSION).toBe("bulbapedia-item-list-v1");
    expect(BULBAPEDIA_TYPE_CHART_URL).toContain("/wiki/Type/Type_chart");
    expect(BULBAPEDIA_ABILITY_LIST_URL).toContain("/wiki/Ability");
    expect(BULBAPEDIA_ITEM_LIST_ALIAS_URL).toContain("/wiki/Alphabetical_list_of_items");
  });

  it("extracts exactly 18 Type identities and the complete 18x18 current matrix", () => {
    const result = parseBulbapediaCurrentTypeChart(typeSource());
    expect(result.types).toHaveLength(18);
    expect(result.types[0]).toEqual({
      sourceKey: "normal",
      sourceName: "Normal",
      sourceSlug: "normal",
      sourceRecordId: TYPE_SOURCE_ID,
    });
    expect(result.currentTypeEffectiveness).toHaveLength(324);
    expect(new Set(result.currentTypeEffectiveness.map((entry) => entry.multiplier))).toEqual(
      new Set([0, 0.5, 1, 2]),
    );
    expect(result.currentTypeEffectiveness[0]).toEqual({
      attackTypeSourceKey: "normal",
      defenseTypeSourceKey: "normal",
      multiplier: 1,
      sourceRecordId: TYPE_SOURCE_ID,
    });
  });

  it("fails closed when the current Type matrix drifts, duplicates a Type, or contains an unknown multiplier", () => {
    expect(() =>
      parseBulbapediaCurrentTypeChart(typeSource(typeChartHtml({ cellsPerRow: 17 }))),
    ).toThrow(/17 cells; expected 18/i);

    const duplicateDefense = [...TYPE_NAMES];
    duplicateDefense[17] = "Normal";
    expect(() =>
      parseBulbapediaCurrentTypeChart(typeSource(typeChartHtml({ defenseNames: duplicateDefense }))),
    ).toThrow(/duplicate defending Type identity/i);

    expect(() =>
      parseBulbapediaCurrentTypeChart(typeSource(typeChartHtml().replace("<td>1×</td>", "<td>4×</td>"))),
    ).toThrow(/unsupported type-effectiveness multiplier/i);
  });

  it("extracts Ability identity and introduced Generation while ignoring effect prose", () => {
    const records = parseBulbapediaAbilityList(
      abilitySource(
        abilityRow(1, "Stench", "III", "Forbidden damage prose 999") +
          abilityRow(65, "Overgrow", "III", "Forbidden starter prose"),
      ),
    );
    expect(records).toEqual([
      {
        sourceKey: "stench",
        sourceName: "Stench",
        sourceSlug: "stench",
        introducedGeneration: 3,
        sourceRecordId: ABILITY_SOURCE_ID,
      },
      {
        sourceKey: "overgrow",
        sourceName: "Overgrow",
        sourceSlug: "overgrow",
        introducedGeneration: 3,
        sourceRecordId: ABILITY_SOURCE_ID,
      },
    ]);
    expect(JSON.stringify(records)).not.toContain("999");
  });

  it("fails closed on Ability header drift, duplicate canonical keys, and unknown Generation labels", () => {
    expect(() =>
      parseBulbapediaAbilityList(abilitySource(abilityRow(1, "Stench", "III"), "#|Name|Gen.|Description")),
    ).toThrow(/expected exactly one structured Ability table/i);
    expect(() =>
      parseBulbapediaAbilityList(
        abilitySource(
          abilityRow(1, "Kings Shield", "III") + abilityRow(2, "King's Shield", "III"),
        ),
      ),
    ).toThrow(/duplicate\/ambiguous canonical source key/i);
    expect(() =>
      parseBulbapediaAbilityList(abilitySource(abilityRow(1, "Stench", "Generation III"))),
    ).toThrow(/unsupported Generation label/i);
  });

  it("extracts Item identity/generation from structured cells and never reads image alt or descriptions", () => {
    const records = parseBulbapediaItemList(
      itemSource(
        itemRow("Ability Capsule", "VI", "Forbidden Ability behavior 999") +
          itemRow("Potion", "I", "Forbidden healing amount 20"),
      ),
    );
    expect(records).toEqual([
      {
        sourceKey: "ability-capsule",
        sourceName: "Ability Capsule",
        sourceSlug: "ability-capsule",
        introducedGeneration: 6,
        sourceRecordId: ITEM_SOURCE_ID,
      },
      {
        sourceKey: "potion",
        sourceName: "Potion",
        sourceSlug: "potion",
        introducedGeneration: 1,
        sourceRecordId: ITEM_SOURCE_ID,
      },
    ]);
    expect(JSON.stringify(records)).not.toMatch(/Fake|999|20/);
  });

  it("accepts the documented Item-list alias URL and rejects structural or identity ambiguity", () => {
    expect(
      parseBulbapediaItemList(itemSource(itemRow("Potion", "I"), BULBAPEDIA_ITEM_LIST_ALIAS_URL)),
    ).toHaveLength(1);
    expect(() =>
      parseBulbapediaItemList({
        ...itemSource(itemRow("Potion", "I")),
        html: `<main>${itemTable(itemRow("Potion", "I"), "Name|Icon|Gen.|Description")}</main>`,
      }),
    ).toThrow(/no structured Item tables/i);
    expect(() =>
      parseBulbapediaItemList(
        itemSource(itemRow("Kings Rock", "II") + itemRow("King's Rock", "II")),
      ),
    ).toThrow(/duplicate\/ambiguous canonical source key/i);
  });

  it("rejects non-canonical URLs for every reference surface", () => {
    expect(() =>
      parseBulbapediaCurrentTypeChart({ ...typeSource(), url: `${BULBAPEDIA_TYPE_CHART_URL}?oldid=1` }),
    ).toThrow(/unexpected Bulbapedia current Type chart URL/i);
    expect(() =>
      parseBulbapediaAbilityList({
        ...abilitySource(abilityRow(1, "Stench", "III")),
        url: "https://bulbapedia.bulbagarden.net/wiki/Ability_(TCG)",
      }),
    ).toThrow(/unexpected Bulbapedia Ability list URL/i);
    expect(() =>
      parseBulbapediaItemList({
        ...itemSource(itemRow("Potion", "I")),
        url: "https://example.com/wiki/List_of_items_by_name",
      }),
    ).toThrow(/unexpected Bulbapedia Item list URL/i);
  });
});
