import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { RuntimeGameDataReader } from "@pokenexus/game-data/runtime";
import { loadVerifiedHuntCatalogRelease } from "./hunts/catalog-release";
import {
  parseCaptureBallAuthorityReleases,
  parseHuntItemRuleReleases,
} from "./hunts/runtime";
import {
  localPrealphaBindings,
  localPrealphaGeneticProfileReadiness,
} from "./local-prealpha";

const publishedRoot = resolve(process.cwd(), "../../packages/game-data/published");

function fileReader(): RuntimeGameDataReader {
  return {
    async read(path) {
      return new Uint8Array(await readFile(resolve(publishedRoot, ...path.split("/"))));
    },
  };
}

function input() {
  return {
    LOCAL_PREALPHA_ENABLED: "1",
    LOCAL_PREALPHA_ALLOWED_ORIGINS: "http://localhost:5173,http://localhost:5174",
    LOCAL_PREALPHA_SESSION_A: "local-a",
    LOCAL_PREALPHA_ACCOUNT_A: "019a7f50-0000-7000-8000-000000000001",
    LOCAL_PREALPHA_SESSION_B: "local-b",
    LOCAL_PREALPHA_ACCOUNT_B: "019a7f50-0000-7000-8000-000000000002",
    LOCAL_PREALPHA_CURSOR_HMAC_KEY: "0123456789abcdef0123456789abcdef",
    HYPERDRIVE: {
      connectionString: "postgres://pokenexus:pokenexus_local@127.0.0.1:55432/pokenexus_local_prealpha",
    },
  };
}

describe("local Pre-alpha bindings", () => {
  it("binds the accepted local Hunt runtime authorities without inventing Genetic Profile content", async () => {
    const env = localPrealphaBindings(input());
    const release = await loadVerifiedHuntCatalogRelease(env, { reader: fileReader() });
    expect(release.descriptor.gameDataVersion).toBe("game-data-core-kanto-johto-v5");
    expect(release.descriptor.bundleHash)
      .toBe("sha256:565cdd360c1b29dc3607696299244279a8d0c3f488d4544c41c62ed47592f782");
    expect(env.HUNT_GENETIC_PROFILE_RELEASES).toBeUndefined();
    expect(env.HUNT_INDIVIDUALIZATION_AUTHORITY_RELEASES).toBeUndefined();
    expect(env.HUNT_COMBAT_EVENT_SCHEMA_VERSION).toBe("combat-events-management-first-v1");
    expect(env.HUNT_INTER_BATTLE_GAP_MS).toBe("0");

    const balls = parseCaptureBallAuthorityReleases(env.HUNT_CAPTURE_BALL_RELEASES);
    expect(balls).toHaveLength(1);
    expect(balls[0]?.balls).toEqual([{
      itemId: "pokenexus:item:poke-ball:v1",
      powerQuarterUnits: 4,
      premium: false,
    }]);
    const items = parseHuntItemRuleReleases(env.HUNT_ITEM_RULE_RELEASES);
    expect(items).toHaveLength(1);
    expect(items[0]?.rulesByItemId.get("pokenexus:item:poke-ball:v1"))
      .toEqual({ useKind: "capture-attempt" });
    expect(items[0]?.rulesByItemId.get("pokenexus:item:basic-potion:v1"))
      .toEqual({
        useKind: "heal-hp",
        magnitude: { kind: "max-hp-fraction", numerator: 1, denominator: 4 },
      });
    expect(items[0]?.rulesByItemId.get("pokenexus:item:revive-25:v1"))
      .toEqual({
        useKind: "revive-hp",
        magnitude: { kind: "max-hp-fraction", numerator: 1, denominator: 4 },
      });
  });

  it("preflights exactly the six starters plus six current Wilds without choosing any pair", async () => {
    const readiness = await localPrealphaGeneticProfileReadiness(input(), { reader: fileReader() });
    expect(readiness.status).toBe("blocked_missing_authority");
    expect(readiness.requiredDecisions).toHaveLength(12);
    expect(readiness.missingSpeciesIds).toHaveLength(12);
    expect(readiness.requiredDecisions.filter(({ role }) => role === "starter")).toHaveLength(6);
    expect(readiness.requiredDecisions.filter(({ role }) => role === "wild")).toHaveLength(6);
    expect(new Set(readiness.requiredDecisions.map(({ sourceName }) => sourceName))).toEqual(new Set([
      "Bulbasaur",
      "Charmander",
      "Squirtle",
      "Chikorita",
      "Cyndaquil",
      "Totodile",
      "Pidgey",
      "Rattata",
      "Caterpie",
      "Sentret",
      "Ledyba",
      "Sunkern",
    ]));
    expect(readiness.requiredDecisions.every(({ decided }) => decided === false)).toBe(true);
  });

  it("fails closed if an operator-provided Genetic Profile release is malformed", async () => {
    await expect(localPrealphaGeneticProfileReadiness({
      ...input(),
      HUNT_GENETIC_PROFILE_RELEASES: JSON.stringify([{
        gameDataVersion: "game-data-core-kanto-johto-v5",
        rulesVersion: "combat-rules-management-first-v1",
        species: [{
          speciesId: "candidate:species:invalid",
          compatibleProfiles: [],
        }],
      }]),
    }, { reader: fileReader() })).rejects.toThrow(/Genetic Profile releases are invalid/);
  });

  it("reports the exact canonical authority digest with all 12 decisions ready", async () => {
    const raw = await readFile(resolve(process.cwd(), "../../docs/qa/PREALPHA_GENETIC_PROFILE_RELEASES.json"), "utf8");
    const readiness = await localPrealphaGeneticProfileReadiness({
      ...input(), HUNT_GENETIC_PROFILE_RELEASES: raw,
    }, { reader: fileReader() });
    expect(readiness.status).toBe("ready");
    expect(readiness.requiredDecisions).toHaveLength(12);
    expect(readiness.missingSpeciesIds).toEqual([]);
    expect(readiness.authorityHash).toBe(`sha256:${createHash("sha256").update(raw.trim()).digest("hex")}`);
    expect(readiness.authorityHash).toBe("sha256:0d5e94600dc98335d85ea586586b9b73eb5ea7576f5fea26eb2e5bed23996b61");
    expect(JSON.stringify(readiness)).not.toContain("compatibleProfiles");
  });

  it.each([
    "postgresql://127.0.0.1/pokenexus_local_prealpha?host=remote.invalid",
    "postgresql://127.0.0.1/pokenexus_local_prealpha?port=5439",
    "postgresql://127.0.0.1/pokenexus_local_prealpha#other",
    "https://127.0.0.1/pokenexus_local_prealpha",
  ])("rejects local-looking database URL overrides: %s", (connectionString) => {
    expect(() => localPrealphaBindings({ ...input(), HYPERDRIVE: { connectionString } }))
      .toThrow(/refuses/);
  });

  it("rejects credentials embedded in the game-data origin", () => {
    expect(() => localPrealphaBindings({
      ...input(), LOCAL_PREALPHA_GAME_DATA_BASE_URL: "http://user:password@127.0.0.1:8788/",
    })).toThrow(/loopback HTTP origin/);
  });

  it("allows only the local Hyperdrive proxy SSL option, never target overrides", () => {
    const base = "postgresql://0123456789abcdef0123456789abcdef.hyperdrive.local/pokenexus_local_prealpha";
    expect(() => localPrealphaBindings({
      ...input(), HYPERDRIVE: { connectionString: `${base}?sslmode=disable` },
    })).not.toThrow();
    expect(() => localPrealphaBindings({
      ...input(), HYPERDRIVE: { connectionString: `${base}?sslmode=disable&host=remote.invalid` },
    })).toThrow(/refuses/);
  });

  it("requires an explicit local cursor key and explicit local enablement", () => {
    expect(() => localPrealphaBindings({ ...input(), LOCAL_PREALPHA_ENABLED: "0" }))
      .toThrow(/disabled/);
    expect(() => localPrealphaBindings({ ...input(), LOCAL_PREALPHA_CURSOR_HMAC_KEY: "short" }))
      .toThrow(/32 UTF-8 bytes/);
  });

  it("refuses remote database or game-data targets even on the local-only entry", () => {
    expect(() => localPrealphaBindings({
      ...input(),
      HYPERDRIVE: { connectionString: "postgres://example.invalid/pokenexus_local_prealpha" },
    })).toThrow(/refuses non-loopback/);
    expect(() => localPrealphaBindings({
      ...input(),
      LOCAL_PREALPHA_GAME_DATA_BASE_URL: "https://example.invalid/",
    })).toThrow(/loopback HTTP origin/);
  });
});
