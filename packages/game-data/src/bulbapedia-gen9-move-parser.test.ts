import { describe, expect, it } from "vitest";
import {
  BULBAPEDIA_GEN9_MOVE_LIST_URL,
  BULBAPEDIA_GEN9_MOVE_PARSER_VERSION,
  parseBulbapediaGen9Moves,
} from "./bulbapedia-gen9-move-parser";

const SOURCE_RECORD_ID = "source:bulbapedia:gen9-move-availability";

function row(
  index: number,
  name: string,
  type: string,
  category: "Physical" | "Special" | "Status",
  pp: string,
  power: string,
  accuracy: string,
  sv: string,
  za = "ignored",
): string {
  const movePath = name.replace(/'/g, "%27").replace(/ /g, "_");
  return `
    <tr>
      <td>${index}</td>
      <td><a href="/wiki/${movePath}_(move)">${name}</a></td>
      <td><a href="/wiki/${type}_(type)">${type}</a></td>
      <td>${category}</td>
      <td>${pp}</td>
      <td>${power}</td>
      <td>${accuracy === "—" ? accuracy : `${accuracy}%`}</td>
      <td>${sv}</td>
      <td>${za}</td>
    </tr>`;
}

function source(rows: string, header = "# Name Type Category PP Power Accuracy SV ZA") {
  const headers = header.split(" ").map((cell) => `<th>${cell}</th>`).join("");
  return {
    url: BULBAPEDIA_GEN9_MOVE_LIST_URL,
    sourceRecordId: SOURCE_RECORD_ID,
    html: `
      <main>
        <h1>List of moves by availability in Generation IX</h1>
        <table class="roundy sortable">
          <tr>${headers}</tr>
          ${rows}
        </table>
      </main>`,
  };
}

const FIXTURE_ROWS = [
  row(33, "Tackle", "Normal", "Physical", "35", "40", "100", "✓", "ZA-Tackle"),
  row(787, "Apple Acid", "Grass", "Special", "10", "80", "100", "✔", "ZA-Apple-Acid"),
  row(152, "Crabhammer", "Water", "Physical", "10", "100", "90", "✓", "ZA-Crabhammer"),
  row(779, "Snap Trap", "Grass", "Physical", "15", "35", "100", "✗", "ZA-Snap-Trap"),
  row(1, "Pound", "Normal", "Physical", "35", "40", "100", "", "ZA-Pound"),
].join("");

describe("Bulbapedia Generation IX Move availability parser", () => {
  it("exposes a versioned parser bound to the canonical Generation IX availability URL", () => {
    expect(BULBAPEDIA_GEN9_MOVE_PARSER_VERSION).toBe("bulbapedia-gen9-move-availability-v1");
    expect(BULBAPEDIA_GEN9_MOVE_LIST_URL).toBe(
      "https://bulbapedia.bulbagarden.net/wiki/List_of_moves_by_availability_in_Generation_IX",
    );
  });

  it("extracts the approved non-Z-A facts and Scarlet/Violet availability tri-state", () => {
    expect(parseBulbapediaGen9Moves(source(FIXTURE_ROWS))).toEqual([
      {
        index: 33,
        sourceName: "Tackle",
        sourceKey: "tackle",
        typeSourceKey: "normal",
        category: "physical",
        basePp: 35,
        power: 40,
        accuracy: 100,
        scarletVioletAvailability: "usable",
        sourceRecordId: SOURCE_RECORD_ID,
      },
      {
        index: 787,
        sourceName: "Apple Acid",
        sourceKey: "apple-acid",
        typeSourceKey: "grass",
        category: "special",
        basePp: 10,
        power: 80,
        accuracy: 100,
        scarletVioletAvailability: "usable",
        sourceRecordId: SOURCE_RECORD_ID,
      },
      {
        index: 152,
        sourceName: "Crabhammer",
        sourceKey: "crabhammer",
        typeSourceKey: "water",
        category: "physical",
        basePp: 10,
        power: 100,
        accuracy: 90,
        scarletVioletAvailability: "usable",
        sourceRecordId: SOURCE_RECORD_ID,
      },
      {
        index: 779,
        sourceName: "Snap Trap",
        sourceKey: "snap-trap",
        typeSourceKey: "grass",
        category: "physical",
        basePp: 15,
        power: 35,
        accuracy: 100,
        scarletVioletAvailability: "unusable",
        sourceRecordId: SOURCE_RECORD_ID,
      },
      {
        index: 1,
        sourceName: "Pound",
        sourceKey: "pound",
        typeSourceKey: "normal",
        category: "physical",
        basePp: 35,
        power: 40,
        accuracy: 100,
        scarletVioletAvailability: "unmarked",
        sourceRecordId: SOURCE_RECORD_ID,
      },
    ]);
  });

  it("accepts the current structured Scarlet/Violet header rendered as separate S and V labels", () => {
    const fixture = source(
      row(33, "Tackle", "Normal", "Physical", "35", "40", "100", "✓"),
    );
    fixture.html = fixture.html.replace(
      "<th>SV</th>",
      "<th><span>S</span><span>V</span></th>",
    );

    expect(parseBulbapediaGen9Moves(fixture)).toMatchObject([
      { sourceName: "Tackle", scarletVioletAvailability: "usable" },
    ]);
  });

  it("keeps Power and Accuracy dash semantics as null without reading the Z-A cell", () => {
    const [record] = parseBulbapediaGen9Moves(
      source(row(150, "Splash", "Normal", "Status", "40", "—", "—", "✓", "arbitrary Z-A content")),
    );
    expect(record).toMatchObject({ power: null, accuracy: null });
    expect(record).not.toHaveProperty("zaAvailability");
    expect(record).not.toHaveProperty("zaBaseCooldownMs");
  });

  it("omits explicit no-PP battle-mechanic rows from the normal Move dataset", () => {
    const records = parseBulbapediaGen9Moves(
      source(
        row(743, "Max Guard", "Normal", "Status", "—", "—", "—", "✘") +
          row(33, "Tackle", "Normal", "Physical", "35", "40", "100", "✓"),
      ),
    );
    expect(records.map((record) => record.sourceKey)).toEqual(["tackle"]);
  });

  it("fails closed when source columns are reordered even if all expected labels remain", () => {
    expect(() =>
      parseBulbapediaGen9Moves(
        source(
          row(33, "Tackle", "Normal", "Physical", "35", "40", "100", "✓"),
          "# Name Type Category PP Accuracy Power SV ZA",
        ),
      ),
    ).toThrow(/unexpected table header layout/i);
  });

  it("fails closed on duplicate move indexes", () => {
    expect(() =>
      parseBulbapediaGen9Moves(
        source(
          row(33, "Tackle", "Normal", "Physical", "35", "40", "100", "✓") +
            row(33, "Pound", "Normal", "Physical", "35", "40", "100", "✓"),
        ),
      ),
    ).toThrow(/duplicate move index 33/i);
  });

  it("preserves distinct source rows that legitimately share a canonical Move name", () => {
    const records = parseBulbapediaGen9Moves(
      source(
        row(622, "Breakneck Blitz", "Normal", "Physical", "1", "—", "—", "✘") +
          row(623, "Breakneck Blitz", "Normal", "Special", "1", "—", "—", "✘"),
      ),
    );
    expect(records.map(({ index, sourceKey, category }) => ({ index, sourceKey, category }))).toEqual([
      { index: 622, sourceKey: "breakneck-blitz", category: "physical" },
      { index: 623, sourceKey: "breakneck-blitz", category: "special" },
    ]);
  });

  it("fails closed on malformed factual cells", () => {
    expect(() =>
      parseBulbapediaGen9Moves(
        source(row(33, "Tackle", "Normal", "Physical", "0", "40", "100", "✓")),
      ),
    ).toThrow(/Tackle PP/i);
    expect(() =>
      parseBulbapediaGen9Moves(
        source(row(33, "Tackle", "Normal", "Physical", "35", "forty", "100", "✓")),
      ),
    ).toThrow(/Tackle Power/i);
  });

  it("fails closed on ambiguous or unknown Scarlet/Violet availability markers", () => {
    for (const marker of ["✓ ✗", "?", "Yes"]) {
      expect(() =>
        parseBulbapediaGen9Moves(
          source(row(33, "Tackle", "Normal", "Physical", "35", "40", "100", marker)),
        ),
      ).toThrow(/availability.*ambiguous or unknown marker/i);
    }
  });

  it("accepts documented footnote/update annotations while preserving current usability", () => {
    const records = parseBulbapediaGen9Moves(
      source(
        row(33, "Tackle", "Normal", "Physical", "35", "40", "100", "✔ 2.0.1+") +
          row(34, "Body Slam", "Normal", "Physical", "15", "85", "100", "3.0.0+ ✘"),
      ),
    );
    expect(records.map((record) => record.scarletVioletAvailability)).toEqual([
      "usable",
      "unusable",
    ]);
  });

  it("rejects a non-canonical source URL", () => {
    expect(() =>
      parseBulbapediaGen9Moves({
        ...source(FIXTURE_ROWS),
        url: `${BULBAPEDIA_GEN9_MOVE_LIST_URL}?oldid=1`,
      }),
    ).toThrow(/unexpected Bulbapedia Generation IX move-list URL/i);
  });
});
