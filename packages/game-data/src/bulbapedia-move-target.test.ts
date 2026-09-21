import { describe, expect, it } from "vitest";
import {
  buildBulbapediaMoveTargetUrl,
  parseBulbapediaMoveTarget,
} from "./bulbapedia-move-target";

const source = (range: string) => ({
  url: "https://bulbapedia.bulbagarden.net/wiki/Psychic_Noise_(move)",
  sourceRecordId: "source:bulbapedia:psychic-noise",
  html: `<main>
    <h1><span>Psychic Noise (move)</span></h1>
    <table><tr><td><b><a href="/wiki/Range">Range</a></b>
      <table><tr><td><small>${range}</small></td></tr></table>
    </td></tr>
    <tr><td><b>Availability</b></td></tr></table>
  </main>`,
});

describe("Bulbapedia structured Move target fallback", () => {
  it("builds the canonical move-page URL", () => {
    expect(buildBulbapediaMoveTargetUrl("Psychic Noise")).toBe(
      "https://bulbapedia.bulbagarden.net/wiki/Psychic_Noise_(move)",
    );
  });

  it("maps the exact structured Psychic Noise Normal Range", () => {
    expect(
      parseBulbapediaMoveTarget(
        source("Normal: May affect anyone adjacent to the user"),
      ),
    ).toEqual({
      sourceKey: "psychic-noise",
      sourceName: "Psychic Noise",
      sourceTarget: "any-adjacent",
      sourceRecordId: "source:bulbapedia:psychic-noise",
    });
  });

  it("fails closed on an unmapped structured Normal Range", () => {
    expect(() =>
      parseBulbapediaMoveTarget(
        source("Normal: Unknown targeting shape"),
      ),
    ).toThrow(/unmapped structured Range/i);
  });
});
