import { describe, expect, it } from "vitest";
import {
  BULBAPEDIA_SPECIES_BASE_STATS_PARSER_VERSION,
  parseBulbapediaSpeciesBaseStats,
} from "./bulbapedia-species-base-stats";

const SOURCE_RECORD_ID = "source:bulbapedia:species-base-stats";

const STAT_ROWS = [
  ["HP", "/wiki/HP", 40],
  ["Attack", "/wiki/Stat#Attack", 45],
  ["Defense", "/wiki/Stat#Defense", 35],
  ["Sp. Atk", "/wiki/Stat#Special_Attack", 40],
  ["Sp. Def", "/wiki/Stat#Special_Defense", 40],
  ["Speed", "/wiki/Stat#Speed", 90],
] as const;

function statTable(
  values: readonly number[] = STAT_ROWS.map((row) => row[2]),
  options: { hiddenKey?: string; duplicateKey?: string; omitKey?: string } = {},
): string {
  const rows = STAT_ROWS.flatMap(([label, href], index) => {
    if (options.omitKey === label) return [];
    const attrs = options.hiddenKey === label ? ` style="display:none"` : "";
    const row = `<tr><th${attrs}><a href="${href}">${label}</a><div>:</div><div>${values[index]}</div></th>
      <td><span class="calculator-range">1 - 999</span><img src="ignored.png" alt="999"></td></tr>`;
    return options.duplicateKey === label ? [row, row] : [row];
  }).join("");
  return `<table class="roundy"><tbody>${rows}</tbody><tfoot><tr><th>Total:</th><td>290</td></tr></tfoot></table>`;
}

function source(name: string, baseStatsBody: string, overrides: { url?: string; h1?: string; sourceRecordId?: string } = {}) {
  return {
    url: overrides.url ?? `https://bulbapedia.bulbagarden.net/wiki/${name.replace(/ /g, "_")}_(Pok%C3%A9mon)`,
    sourceRecordId: overrides.sourceRecordId ?? SOURCE_RECORD_ID,
    html: `<main><h1>${overrides.h1 ?? `${name} (Pokémon)`}</h1>
      <h3><span class="mw-headline" id="Stats">Stats</span></h3>
      <h4><span class="mw-headline" id="Base_stats">Base stats</span></h4>
      ${baseStatsBody}
      <h4><span class="mw-headline" id="Pokeathlon_stats">Pokéathlon stats</span></h4>
      <table><tr><td>ignored later table</td></tr></table></main>`,
  };
}

function h5(name: string, body: string): string {
  return `<h5><span class="mw-headline" id="${name.replace(/ /g, "_")}">${name}</span></h5>${body}`;
}

function h6(name: string, body: string): string {
  return `<h6><span class="mw-headline" id="${name.replace(/ /g, "_")}">${name}</span></h6>${body}`;
}

describe("Bulbapedia persistent-form Species Base Stats parser", () => {
  it("exports a stable parser version and parses a single base-only Base_stats table", () => {
    expect(BULBAPEDIA_SPECIES_BASE_STATS_PARSER_VERSION).toBe("bulbapedia-species-base-stats-v4");
    expect(parseBulbapediaSpeciesBaseStats(source("Bulbasaur", statTable()))).toEqual([
      {
        sourceName: "Bulbasaur",
        scope: { kind: "exact", sourceFormNames: ["Bulbasaur"] },
        baseStats: { hp: 40, atk: 45, def: 35, spa: 40, spd: 40, spe: 90 },
        sourceRecordId: SOURCE_RECORD_ID,
      },
    ]);
  });

  it("selects only the exact current onward table from a recognized historical h6 pair", () => {
    const result = parseBulbapediaSpeciesBaseStats(source(
      "Butterfree",
      h6("Generations I-V", statTable([60, 45, 50, 80, 80, 70])) +
        h6("Generation VI onward", statTable([60, 45, 50, 90, 80, 70])),
    ));
    expect(result).toHaveLength(1);
    expect(result[0].baseStats).toEqual({ hp: 60, atk: 45, def: 50, spa: 90, spd: 80, spe: 70 });
  });

  it("binds an exact shared-form statement placed immediately before a historical h6 pair", () => {
    const result = parseBulbapediaSpeciesBaseStats(source(
      "Golem",
      `<p>Golem and Alolan Golem have the same base stats.</p>` +
        h6("Generations I-V", statTable([80, 110, 130, 55, 65, 45])) +
        h6("Generation VI onward", statTable([80, 120, 130, 55, 65, 45])),
    ));
    expect(result).toEqual([
      expect.objectContaining({
        scope: { kind: "exact", sourceFormNames: ["Golem", "Alolan Golem"] },
        baseStats: { hp: 80, atk: 120, def: 130, spa: 55, spd: 65, spe: 45 },
      }),
    ]);
  });

  it("fails closed when a shared-form scope statement drifts from the exact accepted grammar", () => {
    for (const statement of [
      "Golem and Alolan Golem have the same base stats!",
      "Golem and Alolan Golem have the same Base Stats.",
      "Golem and Alolan Golem have identical base stats.",
    ]) {
      expect(() => parseBulbapediaSpeciesBaseStats(source(
        "Golem",
        `<p>${statement}</p>` +
          h6("Generations I-V", statTable([80, 110, 130, 55, 65, 45])) +
          h6("Generation VI onward", statTable([80, 120, 130, 55, 65, 45])),
      ))).toThrow(/unrecognized or non-immediate scope statement/i);
    }
  });

  it("selects the current h6 table inside a base h5 while preserving an alternate persistent form", () => {
    const result = parseBulbapediaSpeciesBaseStats(source(
      "Dugtrio",
      h5(
        "Dugtrio",
        h6("Generations I-VI", statTable([35, 80, 50, 50, 70, 120])) +
          h6("Generation VII onward", statTable([35, 100, 50, 50, 70, 120])),
      ) + h5("Alolan Dugtrio", statTable([35, 100, 60, 50, 70, 110])),
    ));
    expect(result.map((entry) => [entry.scope, entry.baseStats.atk])).toEqual([
      [{ kind: "exact", sourceFormNames: ["Dugtrio"] }, 100],
      [{ kind: "exact", sourceFormNames: ["Alolan Dugtrio"] }, 100],
    ]);
  });

  it("accepts a versioned base scope before a distinct h5 form", () => {
    const result = parseBulbapediaSpeciesBaseStats(source(
      "Pikachu",
      h6("Generations I - V", statTable([35, 55, 30, 50, 40, 90])) +
        h6("Generation VI onward", statTable([35, 55, 40, 50, 50, 90])) +
        h5("Partner Pikachu", statTable([45, 80, 50, 75, 60, 120])),
    ));
    expect(result[0]).toMatchObject({
      scope: { kind: "exact", sourceFormNames: ["Pikachu"] },
      baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
    });
    expect(result[1]).toMatchObject({
      scope: { kind: "exact", sourceFormNames: ["Partner Pikachu"] },
    });
  });

  it("ignores Mega battle-only h5 scopes even when they contain game-specific h6 tables", () => {
    const result = parseBulbapediaSpeciesBaseStats(source(
      "Starmie",
      h5("Starmie", statTable([60, 75, 85, 100, 85, 115])) +
        h5(
          "Mega Starmie",
          statTable([60, 100, 105, 130, 105, 120]) +
            h6("Pokémon Legends: Z-A", statTable([60, 140, 105, 130, 105, 120])),
        ),
    ));
    expect(result).toEqual([
      expect.objectContaining({
        scope: { kind: "exact", sourceFormNames: ["Starmie"] },
        baseStats: { hp: 60, atk: 75, def: 85, spa: 100, spd: 85, spe: 115 },
      }),
    ]);
  });

  it("fails closed on an unrecognized h6 version pair", () => {
    expect(() => parseBulbapediaSpeciesBaseStats(source(
      "Butterfree",
      h6("Generations I-VII", statTable()) + h6("Generation VIII onward", statTable()),
    ))).toThrow(/unsupported base-stat version headings/i);
  });

  it("parses the Rattata-like exact shared X/Y statement immediately before one table", () => {
    const body = `<p>Rattata and Alolan Rattata have the same base stats.</p>${statTable([30, 56, 35, 25, 35, 72])}`;
    expect(parseBulbapediaSpeciesBaseStats(source("Rattata", body))).toEqual([
      {
        sourceName: "Rattata",
        scope: { kind: "exact", sourceFormNames: ["Rattata", "Alolan Rattata"] },
        baseStats: { hp: 30, atk: 56, def: 35, spa: 25, spd: 35, spe: 72 },
        sourceRecordId: SOURCE_RECORD_ID,
      },
    ]);
  });

  it("parses the Meowth-like h5 exact form tables independently", () => {
    const body =
      h5("Meowth", statTable([40, 45, 35, 40, 40, 90])) +
      h5("Alolan Meowth", statTable([40, 35, 35, 50, 40, 90])) +
      h5("Galarian Meowth", statTable([50, 65, 55, 40, 40, 40]));
    const result = parseBulbapediaSpeciesBaseStats(source("Meowth", body));
    expect(result.map((entry) => entry.scope)).toEqual([
      { kind: "exact", sourceFormNames: ["Meowth"] },
      { kind: "exact", sourceFormNames: ["Alolan Meowth"] },
      { kind: "exact", sourceFormNames: ["Galarian Meowth"] },
    ]);
    expect(result.map((entry) => entry.baseStats.atk)).toEqual([45, 35, 65]);
  });

  it("parses the Tauros-like h5 all-forms group statement without expanding breed identities", () => {
    const body =
      h5("Tauros", statTable([75, 100, 95, 40, 70, 110])) +
      h5(
        "Paldean Tauros",
        `<p>All forms of Paldean Tauros have the same base stats.</p>${statTable([75, 110, 105, 30, 70, 100])}`,
      );
    expect(parseBulbapediaSpeciesBaseStats(source("Tauros", body))).toEqual([
      expect.objectContaining({
        sourceName: "Tauros",
        scope: { kind: "exact", sourceFormNames: ["Tauros"] },
        baseStats: { hp: 75, atk: 100, def: 95, spa: 40, spd: 70, spe: 110 },
      }),
      expect.objectContaining({
        sourceName: "Tauros",
        scope: { kind: "all-forms-of", sourceFormGroupName: "Paldean Tauros" },
        baseStats: { hp: 75, atk: 110, def: 105, spa: 30, spd: 70, spe: 100 },
      }),
    ]);
  });

  it("ignores calculator ranges and assets and parses only the structured six stat cells", () => {
    const [record] = parseBulbapediaSpeciesBaseStats(source("Meowth", statTable()));
    expect(record.baseStats).toEqual({ hp: 40, atk: 45, def: 35, spa: 40, spd: 40, spe: 90 });
    expect(JSON.stringify(record)).not.toContain("999");
    expect(JSON.stringify(record)).not.toContain("ignored.png");
  });

  it("fails closed on hidden, duplicate, or incomplete structured stat cells", () => {
    expect(() =>
      parseBulbapediaSpeciesBaseStats(source("Meowth", statTable(undefined, { hiddenKey: "Attack" }))),
    ).toThrow(/hidden structured stat cell/i);
    expect(() =>
      parseBulbapediaSpeciesBaseStats(source("Meowth", statTable(undefined, { duplicateKey: "Defense" }))),
    ).toThrow(/duplicate def stat row/i);
    expect(() =>
      parseBulbapediaSpeciesBaseStats(source("Meowth", statTable(undefined, { omitKey: "Speed" }))),
    ).toThrow(/incomplete six-stat evidence/i);
  });

  it("fails closed when sharing statements are non-immediate, malformed, or disagree with the h5 group", () => {
    expect(() =>
      parseBulbapediaSpeciesBaseStats(
        source(
          "Rattata",
          `<p>Rattata and Alolan Rattata have the same base stats.</p><p>intervening note</p>${statTable()}`,
        ),
      ),
    ).toThrow(/unrecognized or non-immediate scope statement/i);
    expect(() =>
      parseBulbapediaSpeciesBaseStats(
        source("Rattata", `<p>Rattata & Alolan Rattata have the same base stats.</p>${statTable()}`),
      ),
    ).toThrow(/unrecognized or non-immediate scope statement/i);
    expect(() =>
      parseBulbapediaSpeciesBaseStats(
        source(
          "Tauros",
          h5("Paldean Tauros", `<p>All forms of Tauros have the same base stats.</p>${statTable()}`),
        ),
      ),
    ).toThrow(/all-forms statement names/i);
    expect(() =>
      parseBulbapediaSpeciesBaseStats(
        source(
          "Tauros",
          h5("Paldean Tauros", `<p>All forms of Paldean Tauros have the same Base Stats.</p>${statTable()}`),
        ),
      ),
    ).toThrow(/unrecognized or non-immediate scope statement/i);
  });

  it("fails closed on ambiguous table/form structure", () => {
    expect(() =>
      parseBulbapediaSpeciesBaseStats(source("Bulbasaur", `${statTable()}${statTable()}`)),
    ).toThrow(/expected exactly one structured six-stat table/i);
    expect(() =>
      parseBulbapediaSpeciesBaseStats(
        source("Meowth", `${statTable()}${h5("Meowth", statTable())}`),
      ),
    ).toThrow(/outside an h5 form scope/i);
    expect(() =>
      parseBulbapediaSpeciesBaseStats(
        source("Meowth", `${h5("Meowth", statTable())}${h5("Meowth", statTable())}`),
      ),
    ).toThrow(/duplicate h5 form heading/i);
  });

  it("enforces exact canonical URL, h1 identity, Base_stats heading, and sourceRecordId", () => {
    const valid = source("Rattata", statTable());
    expect(() =>
      parseBulbapediaSpeciesBaseStats({ ...valid, url: `${valid.url}?oldid=1` }),
    ).toThrow(/unexpected canonical Bulbapedia Species page URL/i);
    expect(() =>
      parseBulbapediaSpeciesBaseStats(source("Rattata", statTable(), { h1: "Raticate (Pokémon)" })),
    ).toThrow(/h1 mismatch/i);
    expect(() =>
      parseBulbapediaSpeciesBaseStats(source("Rattata", statTable(), { sourceRecordId: "" })),
    ).toThrow(/sourceRecordId is required/i);
    expect(() =>
      parseBulbapediaSpeciesBaseStats({
        ...valid,
        html: valid.html.replace('id="Base_stats"', 'id="Base_Stats"'),
      }),
    ).toThrow(/Base_stats heading is missing or ambiguous/i);
  });
});
