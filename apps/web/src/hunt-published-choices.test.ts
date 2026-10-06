import { describe, expect, it } from "vitest";
import {
  GAME_DATA_SCHEMA_V5,
  type HuntDefinitionV1,
  type RuntimeGameDataVersion,
  type ZoneDefinitionV1,
} from "@pokenexus/game-data/runtime";
import { projectPublishedHuntChoices } from "./hunt-published-choices";

describe("published Hunt selector projection", () => {
  it("projects only Zone/Hunt selector facts and never derives Encounter preview in the browser", () => {
    const version = {
      manifest: {
        schemaVersion: GAME_DATA_SCHEMA_V5,
        artifacts: [
          { logicalName: "catalogs/zones", recordCount: 1 },
          { logicalName: "catalogs/hunts", recordCount: 1 },
        ],
      },
    } as unknown as RuntimeGameDataVersion;
    const zones = [{ id: "zone:a", displayName: "Zone A", displayOrder: 1 }] as ZoneDefinitionV1[];
    const hunts = [{ id: "hunt:a", zoneId: "zone:a", displayName: "Hunt A", displayOrder: 1 }] as HuntDefinitionV1[];

    const choices = projectPublishedHuntChoices({ version, zones, hunts });
    expect(choices).toEqual([{
      zoneId: "zone:a",
      zoneLabel: "Zone A",
      huntDefinitionId: "hunt:a",
      huntLabel: "Hunt A",
    }]);
    expect(JSON.stringify(choices)).not.toContain("preview");
    expect(JSON.stringify(choices)).not.toContain("encounter");
  });
});
