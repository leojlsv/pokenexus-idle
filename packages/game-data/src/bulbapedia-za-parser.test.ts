import { describe, expect, it } from "vitest";
import {
  canonicalizeBulbapediaMoveName,
  parseBulbapediaZaBaseMoveCooldowns,
} from "./bulbapedia-za-parser";

const URL =
  "https://bulbapedia.bulbagarden.net/wiki/List_of_moves_in_Pok%C3%A9mon_Legends:_Z-A";

function source(rows: string) {
  return {
    url: URL,
    sourceRecordId: "source:bulbapedia:za-moves",
    html: `
      <main>
        <h1>List of moves in Pokémon Legends: Z-A</h1>
        <table class="roundy sortable">
          <tr>
            <th>#</th><th>Name</th><th>Type</th><th>Category</th><th>Power</th>
            <th>Duration</th><th>Cooldown</th><th>Frames</th><th>Range</th>
          </tr>
          <tr><th>Wind-up</th><th>Exec.</th><th>Min</th><th>Max</th><th>Eff.</th></tr>
          ${rows}
        </table>
      </main>`,
  };
}

function row(index: number, nameHtml: string, cooldown: string): string {
  return `
    <tr>
      <td>${index}</td><td>${nameHtml}</td><td>Normal</td><td>Physical</td>
      <td>40</td><td>—</td><td>${cooldown}</td><td>10</td><td>20</td>
      <td>0.5</td><td>2</td><td>99</td>
    </tr>`;
}

describe("Bulbapedia Legends: Z-A base Move cooldown parser", () => {
  it("extracts only normal base Moves and converts exact seconds to integer milliseconds", () => {
    const records = parseBulbapediaZaBaseMoveCooldowns(
      source(
        [
          row(33, '<a href="/wiki/Tackle_(move)">Tackle</a>', "4"),
          row(38, '<a href="/wiki/Double-Edge_(move)">Double-Edge</a>', "10.25"),
          row(1033, '<a href="/wiki/Tackle_(move)">Tackle</a> <sup>+</sup>', "3"),
          row(2033, '<a href="/wiki/Tackle_(move)">Tackle</a> <sup>R</sup>', "0"),
        ].join(""),
      ),
    );

    expect(records).toEqual([
      {
        sourceKey: "tackle",
        sourceName: "Tackle",
        zaBaseCooldownMs: 4000,
        sourceRecordId: "source:bulbapedia:za-moves",
      },
      {
        sourceKey: "double-edge",
        sourceName: "Double-Edge",
        zaBaseCooldownMs: 10250,
        sourceRecordId: "source:bulbapedia:za-moves",
      },
    ]);
  });

  it("fails closed on duplicate/ambiguous canonical move keys", () => {
    expect(() =>
      parseBulbapediaZaBaseMoveCooldowns(
        source(
          [
            row(588, "<a>King's Shield</a>", "10"),
            row(589, "<a>Kings Shield</a>", "11"),
          ].join(""),
        ),
      ),
    ).toThrow(/duplicate\/ambiguous canonical source key/i);
  });

  it("ignores duplicate excluded Rogue rows but still rejects duplicate base indexes", () => {
    const rogue = row(2304, '<a href="/wiki/Hyper_Voice_(move)">Hyper Voice</a> <sup>R</sup>', "0");
    const records = parseBulbapediaZaBaseMoveCooldowns(
      source(
        row(33, '<a href="/wiki/Tackle_(move)">Tackle</a>', "4") + rogue + rogue,
      ),
    );
    expect(records.map((record) => record.sourceKey)).toEqual(["tackle"]);

    expect(() =>
      parseBulbapediaZaBaseMoveCooldowns(
        source(
          row(33, '<a href="/wiki/Tackle_(move)">Tackle</a>', "4") +
            row(33, '<a href="/wiki/Growl_(move)">Growl</a>', "5"),
        ),
      ),
    ).toThrow(/duplicate base move index 33/i);
  });

  it("fails closed when variant markers conflict with the documented ID ranges", () => {
    expect(() =>
      parseBulbapediaZaBaseMoveCooldowns(
        source(row(33, '<a href="/wiki/Tackle_(move)">Tackle</a> <sup>+</sup>', "4")),
      ),
    ).toThrow(/variant marker conflicts with base ID range/i);
  });

  it("fails closed on cooldown precision that cannot map exactly to integer milliseconds", () => {
    expect(() =>
      parseBulbapediaZaBaseMoveCooldowns(
        source(row(33, '<a href="/wiki/Tackle_(move)">Tackle</a>', "4.0001")),
      ),
    ).toThrow(/integer milliseconds/i);
  });

  it("fails closed when source columns are reordered even if all expected header labels remain", () => {
    const reordered = source(
      row(33, '<a href="/wiki/Tackle_(move)">Tackle</a>', "4"),
    ).html.replace(
      "<th>Duration</th><th>Cooldown</th>",
      "<th>Cooldown</th><th>Duration</th>",
    );
    expect(() =>
      parseBulbapediaZaBaseMoveCooldowns({
        url: URL,
        sourceRecordId: "source:bulbapedia:za-moves",
        html: reordered,
      }),
    ).toThrow(/unexpected table header layout/i);
  });

  it("canonicalizes punctuation without adopting the upstream display name as canonical identity", () => {
    expect(canonicalizeBulbapediaMoveName("King's Shield")).toBe("kings-shield");
    expect(canonicalizeBulbapediaMoveName("10,000,000 Volt Thunderbolt")).toBe(
      "10000000-volt-thunderbolt",
    );
  });
});
