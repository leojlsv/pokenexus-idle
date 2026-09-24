import { describe, expect, it } from "vitest";
import {
  parsePveContentV1,
  validatePveContentV1,
  type PveContentV1,
} from "./pve-content-schema.js";

const speciesIds = new Set(["species:rattata", "species:spearow"]);
const itemIds = new Set(["item:potion"]);

function validContent(): PveContentV1 {
  return {
    zones: [
      {
        id: "zone:verdant-edge" as never,
        displayName: "Verdant Edge",
        displayOrder: 10,
        availability: { playerLevelMin: null, prerequisiteHuntIds: [] },
      },
    ],
    hunts: [
      {
        id: "hunt:verdant-edge:wilds" as never,
        zoneId: "zone:verdant-edge" as never,
        displayName: "Wilds",
        displayOrder: 10,
        availability: { playerLevelMin: null, prerequisiteHuntIds: [] },
        recoveryDurationMs: 30_000,
      },
    ],
    encounters: [
      {
        id: "encounter:verdant-edge:rattata-3" as never,
        huntId: "hunt:verdant-edge:wilds" as never,
        speciesId: "species:rattata" as never,
        weight: 24,
        levelBand: { min: 3, max: 3 },
        reward: { pokemonXpPool: 18, playerXp: 6, itemDrops: [] },
      },
      {
        id: "encounter:verdant-edge:spearow-4" as never,
        huntId: "hunt:verdant-edge:wilds" as never,
        speciesId: "species:spearow" as never,
        weight: 12,
        levelBand: { min: 4, max: 4 },
        reward: {
          pokemonXpPool: 24,
          playerXp: null,
          itemDrops: [{ itemId: "item:potion" as never, quantity: 1, chanceBasisPoints: 2500 }],
        },
      },
    ],
  };
}

describe("PvE content schema v1", () => {
  it("parses the explicit Zone -> Hunt -> Encounter model without MapId", () => {
    expect(parsePveContentV1(validContent())).toEqual(validContent());
    expect(JSON.stringify(validContent())).not.toContain("MapId");
  });

  it("validates exact references and accepted numeric bounds", () => {
    expect(validatePveContentV1(validContent(), { speciesIds, itemIds })).toEqual({
      valid: true,
      findings: [],
    });

    const invalid = validContent();
    invalid.hunts[0] = { ...invalid.hunts[0], recoveryDurationMs: 0 };
    invalid.encounters[0] = {
      ...invalid.encounters[0],
      speciesId: "species:missing" as never,
      weight: 0,
      levelBand: { min: 5, max: 4 },
      reward: { pokemonXpPool: -1, playerXp: -1, itemDrops: [] },
    };
    const report = validatePveContentV1(invalid, { speciesIds, itemIds });
    expect(report.valid).toBe(false);
    expect(report.findings.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "invalid-recovery",
      "unresolved-reference",
      "invalid-weight",
      "invalid-level-band",
      "invalid-reward",
    ]));
  });

  it("rejects duplicate IDs, empty Hunts, unresolved item references and prerequisite cycles", () => {
    const invalid = validContent();
    invalid.hunts.push({
      ...invalid.hunts[0],
      id: "hunt:verdant-edge:loop" as never,
      availability: {
        playerLevelMin: null,
        prerequisiteHuntIds: ["hunt:verdant-edge:loop" as never],
      },
    });
    invalid.zones.push({ ...invalid.zones[0] });
    invalid.encounters[1] = {
      ...invalid.encounters[1],
      reward: {
        ...invalid.encounters[1].reward,
        itemDrops: [{ itemId: "item:missing" as never, quantity: 1, chanceBasisPoints: 1 }],
      },
    };
    const report = validatePveContentV1(invalid, { speciesIds, itemIds });
    expect(report.valid).toBe(false);
    expect(report.findings.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "duplicate-canonical-id",
      "prerequisite-cycle",
      "empty-hunt",
      "unresolved-reference",
    ]));
  });

  it("resolves TASK-091 threshold evidence per admitted level and rejects zero-progress admissions", () => {
    const content = validContent();
    const playability = {
      profileArtifactId: "profile:test",
      profileContentHash: `sha256:${"1".repeat(64)}`,
      gameDataVersion: "game-data:test",
      speciesCount: 2,
      rows: [
        {
          speciesId: "species:rattata",
          level: 1,
          eligibleCount: 1,
          executableCount: 1,
          progressCapableExecutableCount: 1,
          simpleExecutableCount: 1,
          authoredExecutableCount: 0,
          distinctTargetClasses: 1,
          distinctCategoryClasses: 1,
          distinctEffectRoleClasses: 1,
          bottleneck: "one-executable" as const,
        },
        {
          speciesId: "species:spearow",
          level: 1,
          eligibleCount: 1,
          executableCount: 1,
          progressCapableExecutableCount: 0,
          simpleExecutableCount: 1,
          authoredExecutableCount: 0,
          distinctTargetClasses: 1,
          distinctCategoryClasses: 1,
          distinctEffectRoleClasses: 0,
          bottleneck: "one-executable" as const,
        },
      ],
    };
    const report = validatePveContentV1(content, { speciesIds, itemIds, playability });
    expect(report.valid).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "zero-progress-capable",
          message: expect.stringContaining("species:spearow at level 4"),
        }),
      ]),
    );
  });

  it("rejects canonical MapId input at the parser boundary", () => {
    const invalid = validContent() as unknown as {
      zones: Array<Record<string, unknown>>;
      hunts: unknown[];
      encounters: unknown[];
    };
    invalid.zones[0].mapId = "map:forbidden";
    expect(() => parsePveContentV1(invalid)).toThrow(/mapId.*not an accepted field/i);
  });

  it("rejects duplicate Zone/Hunt/Encounter identities and unresolved Zone/Hunt references", () => {
    const invalid = validContent();
    invalid.zones.push({ ...invalid.zones[0] });
    invalid.hunts.push({ ...invalid.hunts[0] });
    invalid.encounters.push({ ...invalid.encounters[0] });
    invalid.hunts[0] = {
      ...invalid.hunts[0],
      zoneId: "zone:missing" as never,
    };
    invalid.encounters[0] = {
      ...invalid.encounters[0],
      huntId: "hunt:missing" as never,
    };
    const report = validatePveContentV1(invalid, { speciesIds, itemIds });
    expect(report.valid).toBe(false);
    expect(
      report.findings.filter(({ code }) => code === "duplicate-canonical-id"),
    ).toHaveLength(3);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unresolved-reference",
          path: "hunts[0].zoneId",
        }),
        expect.objectContaining({
          code: "unresolved-reference",
          path: "encounters[0].huntId",
        }),
      ]),
    );
  });
});
