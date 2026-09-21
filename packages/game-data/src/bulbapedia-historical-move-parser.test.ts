import { describe, expect, it } from "vitest";
import {
  BULBAPEDIA_GEN7_MOVE_LIST_URL,
  BULBAPEDIA_GEN8_MOVE_LIST_URL,
  BULBAPEDIA_HISTORICAL_MOVE_PARSER_VERSION,
  parseBulbapediaGen7Moves,
  parseBulbapediaGen8Moves,
  selectLatestTraditionalMoveAvailability,
} from "./bulbapedia-historical-move-parser";

const GEN8_SOURCE_ID = "source:bulbapedia:gen8-move-availability";
const GEN7_SOURCE_ID = "source:bulbapedia:gen7-move-availability";

function movePath(name: string): string {
  return name.replace(/'/g, "%27").replace(/ /g, "_");
}

function row(
  index: number,
  name: string,
  type: string,
  category: "Physical" | "Special" | "Status",
  pp: string,
  power: string,
  accuracy: string,
  first: string,
  second: string,
  third: string,
  accuracySuffix = "%",
): string {
  return `
    <tr>
      <td>${index}</td>
      <td><a href="/wiki/${movePath(name)}_(move)">${name}</a></td>
      <td><a href="/wiki/${type}_(type)">${type}</a></td>
      <td>${category}</td>
      <td>${pp}</td>
      <td>${power}</td>
      <td>${accuracy === "—" ? accuracy : `${accuracy}${accuracySuffix}`}</td>
      <td>${first}</td>
      <td>${second}</td>
      <td>${third}</td>
    </tr>`;
}

function source(url: string, sourceRecordId: string, header: string, rows: string) {
  const headers = header.split(" ").map((cell) => `<th>${cell}</th>`).join("");
  return {
    url,
    sourceRecordId,
    html: `
      <main>
        <table class="roundy sortable">
          <tr>${headers}</tr>
          ${rows}
        </table>
      </main>`,
  };
}

function gen8Source(rows: string, header = "# Name Type Category PP Power Accuracy SwSh BDSP LA") {
  return source(BULBAPEDIA_GEN8_MOVE_LIST_URL, GEN8_SOURCE_ID, header, rows);
}

function gen7Source(rows: string, header = "# Name Type Category PP Power Accuracy SM USUM PE") {
  return source(BULBAPEDIA_GEN7_MOVE_LIST_URL, GEN7_SOURCE_ID, header, rows);
}

const GEN8_ROWS = [
  row(66, "Submission", "Fighting", "Physical", "20", "80", "80", "✓", "✔", ""),
  row(779, "Snap Trap", "Grass", "Physical", "15", "35", "100", "✓", "✗", "✔"),
  row(2, "Karate Chop", "Fighting", "Physical", "25", "50", "100", "", "×", "✓"),
].join("");

const GEN7_ROWS = [
  row(2, "Karate Chop", "Fighting", "Physical", "25", "50", "100", "✓", "✔", "×"),
  row(41, "Twineedle", "Bug", "Physical", "20", "25", "100", "✓", "", "✔"),
].join("");

describe("Bulbapedia historical Move availability parsers", () => {
  it("exposes a versioned parser and canonical Generation VIII/VII URLs", () => {
    expect(BULBAPEDIA_HISTORICAL_MOVE_PARSER_VERSION).toBe(
      "bulbapedia-historical-move-availability-v1",
    );
    expect(BULBAPEDIA_GEN8_MOVE_LIST_URL).toMatch(/Generation_VIII\)$/);
    expect(BULBAPEDIA_GEN7_MOVE_LIST_URL).toMatch(/Generation_VII$/);
  });

  it("parses Generation VIII common facts and closed availability columns", () => {
    expect(parseBulbapediaGen8Moves(gen8Source(GEN8_ROWS))).toEqual([
      {
        index: 66,
        sourceName: "Submission",
        sourceKey: "submission",
        typeSourceKey: "fighting",
        category: "physical",
        basePp: 20,
        power: 80,
        accuracy: 80,
        swordShieldAvailability: "usable",
        bdspAvailability: "usable",
        legendsArceusAvailability: "unusable",
        sourceRecordId: GEN8_SOURCE_ID,
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
        swordShieldAvailability: "usable",
        bdspAvailability: "unusable",
        legendsArceusAvailability: "usable",
        sourceRecordId: GEN8_SOURCE_ID,
      },
      expect.objectContaining({
        sourceKey: "karate-chop",
        swordShieldAvailability: "unusable",
        bdspAvailability: "unusable",
        legendsArceusAvailability: "usable",
      }),
    ]);
  });

  it("parses Generation VII and treats unmarked availability as unusable", () => {
    const records = parseBulbapediaGen7Moves(gen7Source(GEN7_ROWS));
    expect(records[0]).toMatchObject({
      sourceKey: "karate-chop",
      sunMoonAvailability: "usable",
      ultraSunUltraMoonAvailability: "usable",
      letsGoPikachuEeveeAvailability: "unusable",
    });
    expect(records[1]).toMatchObject({
      sourceKey: "twineedle",
      sunMoonAvailability: "usable",
      ultraSunUltraMoonAvailability: "unusable",
      letsGoPikachuEeveeAvailability: "usable",
    });
  });

  it("accepts current game-abbreviation headers rendered as separate letter labels", () => {
    const gen8 = gen8Source(
      row(66, "Submission", "Fighting", "Physical", "20", "80", "80", "✓", "✔", ""),
    );
    gen8.html = gen8.html
      .replace("<th>SwSh</th>", "<th><span>Sw</span><span>Sh</span></th>")
      .replace("<th>BDSP</th>", "<th><span>BD</span><span>SP</span></th>");
    expect(parseBulbapediaGen8Moves(gen8)[0]).toMatchObject({
      sourceKey: "submission",
      swordShieldAvailability: "usable",
      bdspAvailability: "usable",
    });

    const gen7 = gen7Source(
      row(2, "Karate Chop", "Fighting", "Physical", "25", "50", "100", "✓", "✔", "×"),
    );
    gen7.html = gen7.html
      .replace("<th>SM</th>", "<th><span>S</span><span>M</span></th>")
      .replace("<th>USUM</th>", "<th><span>US</span><span>UM</span></th>")
      .replace("<th>PE</th>", "<th><span>P</span><span>E</span></th>");
    expect(parseBulbapediaGen7Moves(gen7)[0]).toMatchObject({
      sourceKey: "karate-chop",
      sunMoonAvailability: "usable",
      ultraSunUltraMoonAvailability: "usable",
      letsGoPikachuEeveeAvailability: "unusable",
    });
  });

  it("accepts documented footnoted availability markers", () => {
    const [kinesis, heartSwap] = parseBulbapediaGen8Moves(
      gen8Source(
        row(134, "Kinesis", "Psychic", "Status", "15", "—", "80", "✔*", "✔", "✘") +
          row(391, "Heart Swap", "Psychic", "Status", "10", "—", "—", "✘*", "✔", ""),
      ),
    );
    expect(kinesis.swordShieldAvailability).toBe("usable");
    expect(heartSwap.swordShieldAvailability).toBe("unusable");
  });

  it("accepts bare accuracy only for Generation VIII Legends: Arceus-only rows", () => {
    const [direClaw] = parseBulbapediaGen8Moves(
      gen8Source(
        row(827, "Dire Claw", "Poison", "Physical", "15", "60", "100", "✘", "✘", "✔", ""),
      ),
    );
    expect(direClaw).toMatchObject({
      sourceKey: "dire-claw",
      accuracy: 100,
      swordShieldAvailability: "unusable",
      bdspAvailability: "unusable",
      legendsArceusAvailability: "usable",
    });
    expect(selectLatestTraditionalMoveAvailability(direClaw, null)).toBeNull();

    expect(() =>
      parseBulbapediaGen8Moves(
        gen8Source(
          row(33, "Tackle", "Normal", "Physical", "35", "40", "100", "✔", "✔", "✔", ""),
        ),
      ),
    ).toThrow(/expected exact percentage/i);

    expect(() =>
      parseBulbapediaGen7Moves(
        gen7Source(
          row(2, "Karate Chop", "Fighting", "Physical", "25", "50", "100", "✘", "✘", "✔", ""),
        ),
      ),
    ).toThrow(/expected exact percentage/i);
  });

  it("omits explicit no-PP battle-mechanic rows from historical normal Move datasets", () => {
    const groupedMaxMove = row(
      757,
      "Max Guard",
      "Normal",
      "Status",
      "—",
      "—",
      "—",
      "✓",
      "✘",
      "",
    ).replace(
      '<td><a href="/wiki/Max_Guard_(move)">Max Guard</a></td>',
      '<td><a href="/wiki/Max_Flare_(move)">Max Flare</a><br><a href="/wiki/G-Max_Wildfire_(move)">G-Max Wildfire</a></td>',
    );
    const records = parseBulbapediaGen8Moves(
      gen8Source(
        groupedMaxMove +
          row(66, "Submission", "Fighting", "Physical", "20", "80", "80", "✓", "✔", ""),
      ),
    );
    expect(records.map((record) => record.sourceKey)).toEqual(["submission"]);
  });

  it("prefers BDSP over SwSh when both are usable", () => {
    const [submission] = parseBulbapediaGen8Moves(gen8Source(GEN8_ROWS));
    expect(selectLatestTraditionalMoveAvailability(submission, null)).toEqual({
      generation: 8,
      game: "brilliant-diamond-shining-pearl",
      sourceKey: "submission",
      sourceRecordId: GEN8_SOURCE_ID,
    });
  });

  it("uses SwSh when BDSP is unusable and ignores Legends: Arceus", () => {
    const snapTrap = parseBulbapediaGen8Moves(gen8Source(GEN8_ROWS))[1];
    expect(selectLatestTraditionalMoveAvailability(snapTrap, null)).toMatchObject({
      generation: 8,
      game: "sword-shield",
      sourceKey: "snap-trap",
    });
    const karateChopGen8 = parseBulbapediaGen8Moves(gen8Source(GEN8_ROWS))[2];
    expect(selectLatestTraditionalMoveAvailability(karateChopGen8, null)).toBeNull();
  });

  it("falls back to USUM, then SM, and ignores Let's Go PE", () => {
    const karateChopGen8 = parseBulbapediaGen8Moves(gen8Source(GEN8_ROWS))[2];
    const [karateChopGen7, twineedle] = parseBulbapediaGen7Moves(gen7Source(GEN7_ROWS));
    expect(selectLatestTraditionalMoveAvailability(karateChopGen8, karateChopGen7)).toMatchObject({
      generation: 7,
      game: "ultra-sun-ultra-moon",
      sourceKey: "karate-chop",
    });
    expect(selectLatestTraditionalMoveAvailability(null, twineedle)).toMatchObject({
      generation: 7,
      game: "sun-moon",
      sourceKey: "twineedle",
    });
  });

  it("fails closed on header drift and wrong row width", () => {
    expect(() =>
      parseBulbapediaGen8Moves(
        gen8Source(
          row(66, "Submission", "Fighting", "Physical", "20", "80", "80", "✓", "✓", ""),
          "# Name Type Category PP Accuracy Power SwSh BDSP LA",
        ),
      ),
    ).toThrow(/unexpected table header layout/i);

    const shortRow = row(
      66,
      "Submission",
      "Fighting",
      "Physical",
      "20",
      "80",
      "80",
      "✓",
      "✓",
      "",
    ).replace(/<td><\/td>\s*<\/tr>/, "</tr>");
    expect(() => parseBulbapediaGen8Moves(gen8Source(shortRow))).toThrow(/data row has 9 cells/i);
  });

  it("fails closed on duplicate indexes", () => {
    expect(() =>
      parseBulbapediaGen7Moves(
        gen7Source(
          row(2, "Karate Chop", "Fighting", "Physical", "25", "50", "100", "✓", "✓", "") +
            row(2, "Twineedle", "Bug", "Physical", "20", "25", "100", "✓", "✓", ""),
        ),
      ),
    ).toThrow(/duplicate move index 2/i);
  });

  it("preserves distinct historical rows that legitimately share a canonical Move name", () => {
    const records = parseBulbapediaGen7Moves(
      gen7Source(
        row(622, "Breakneck Blitz", "Normal", "Physical", "1", "—", "—", "✓", "✓", "") +
          row(623, "Breakneck Blitz", "Normal", "Special", "1", "—", "—", "✓", "✓", ""),
      ),
    );
    expect(records.map(({ index, sourceKey, category }) => ({ index, sourceKey, category }))).toEqual([
      { index: 622, sourceKey: "breakneck-blitz", category: "physical" },
      { index: 623, sourceKey: "breakneck-blitz", category: "special" },
    ]);
  });

  it("fails closed on malformed values, links, and unknown availability markers", () => {
    expect(() =>
      parseBulbapediaGen8Moves(
        gen8Source(row(66, "Submission", "Fighting", "Physical", "0", "80", "80", "✓", "✓", "")),
      ),
    ).toThrow(/Submission PP/i);

    const malformedType = row(
      66,
      "Submission",
      "Fighting",
      "Physical",
      "20",
      "80",
      "80",
      "✓",
      "✓",
      "",
    ).replace('/wiki/Fighting_(type)', '/wiki/Water_(type)');
    expect(() => parseBulbapediaGen8Moves(gen8Source(malformedType))).toThrow(/Type.*disagree/i);

    expect(() =>
      parseBulbapediaGen7Moves(
        gen7Source(row(2, "Karate Chop", "Fighting", "Physical", "25", "50", "100", "?", "✓", "")),
      ),
    ).toThrow(/unknown availability marker/i);
  });

  it("fails closed when selector rows refer to different Moves", () => {
    const submission = parseBulbapediaGen8Moves(gen8Source(GEN8_ROWS))[0];
    const karateChop = parseBulbapediaGen7Moves(gen7Source(GEN7_ROWS))[0];
    expect(() => selectLatestTraditionalMoveAvailability(submission, karateChop)).toThrow(
      /sourceKey mismatch/i,
    );
  });
});
