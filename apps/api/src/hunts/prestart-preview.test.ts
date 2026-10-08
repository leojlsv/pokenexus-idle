import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeGameDataReader } from "@pokenexus/game-data/runtime";
import {
  PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_RELEASE_DESCRIPTOR,
  PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_VERSION,
} from "../moves/context";
import type { PlayerStateEnvironment } from "../player/runtime";
import {
  HUNT_PRESTART_ENCOUNTER_MAX_BYTES,
  HUNT_PRESTART_ENCOUNTER_MAX_RECORDS,
  HuntPrestartPreviewError,
  loadVerifiedHuntPrestartPreview,
  projectHuntPrestartPreview,
} from "./prestart-preview";

const V5 = "game-data-core-kanto-johto-v5";
const V5_DIRECTORY = "version-38ed5230053095b7ef69290f55f40278e681f20eb530788040be5639cdde3c19";
const publishedRoot = resolve(process.cwd(), "../../packages/game-data/published");

function env(): PlayerStateEnvironment {
  const rulesVersion = PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_VERSION;
  return {
    PLAYER_STATE_GAME_DATA_BASE_URL: "https://published.example.invalid/game-data/",
    PLAYER_STATE_MOVE_GAME_DATA_VERSION: V5,
    PLAYER_STATE_MOVE_RULES_VERSION: rulesVersion,
    PLAYER_STATE_MOVE_CONTEXT_RELEASES: JSON.stringify([{ gameDataVersion: V5, rulesVersion, newOperationsAllowed: true }]),
    PLAYER_STATE_MOVE_GAME_DATA_RELEASES: JSON.stringify([{ gameDataVersion: V5, newOperationsAllowed: true }]),
    PLAYER_STATE_MOVE_RULE_RELEASES: JSON.stringify([{
      rulesVersion,
      newOperationsAllowed: true,
      productionSelectability: PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_RELEASE_DESCRIPTOR.productionSelectability,
    }]),
  };
}

function fileReader(): RuntimeGameDataReader {
  return { async read(path) {
    return new Uint8Array(await readFile(resolve(publishedRoot, ...path.split("/"))));
  } };
}

describe("SPEC-024 server-owned prestart preview", () => {
  it("projects the retained Verdant Edge Wilds content without exposing Encounter rows", async () => {
    const result = await loadVerifiedHuntPrestartPreview(
      env(),
      "hunt:verdant-edge:wilds",
      { reader: fileReader() },
    );
    expect(result.gameDataVersion).toBe(V5);
    expect(result.huntDefinitionId).toBe("hunt:verdant-edge:wilds");
    expect(result.preview.possibleSpeciesIds).toHaveLength(6);
    expect(result.preview.playerXp).toEqual({ min: 2, max: 6 });
    expect(result.preview.pokemonXpPool).toEqual({ min: 6, max: 18 });
    expect(result.preview.itemDrops).toEqual([
      {
        itemId: "pokenexus:item:basic-potion:v1",
        quantity: { min: 1, max: 1 },
        chanceBasisPoints: { min: 500, max: 500 },
      },
      {
        itemId: "pokenexus:item:poke-ball:v1",
        quantity: { min: 1, max: 1 },
        chanceBasisPoints: { min: 1500, max: 1500 },
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("encounter:verdant-edge");
    expect(JSON.stringify(result)).not.toContain("weight");
    expect(JSON.stringify(result)).not.toContain("levelBand");
  });

  it("treats missing Player XP and missing Item rows as zero lower-bound contribution", () => {
    const result = projectHuntPrestartPreview({
      gameDataVersion: "game-data:test",
      bundleHash: `sha256:${"a".repeat(64)}`,
      huntDefinitionId: "hunt:test",
      encounters: [
        {
          id: "encounter:a" as never,
          huntId: "hunt:test" as never,
          speciesId: "species:a" as never,
          weight: 1,
          levelBand: { min: 1, max: 1 },
          reward: {
            pokemonXpPool: 6,
            playerXp: null,
            itemDrops: [],
          },
        },
        {
          id: "encounter:b" as never,
          huntId: "hunt:test" as never,
          speciesId: "species:b" as never,
          weight: 1,
          levelBand: { min: 1, max: 1 },
          reward: {
            pokemonXpPool: 12,
            playerXp: 4,
            itemDrops: [{ itemId: "item:a" as never, quantity: 2, chanceBasisPoints: 2500 }],
          },
        },
      ],
    });
    expect(result.preview.playerXp).toEqual({ min: 0, max: 4 });
    expect(result.preview.itemDrops).toEqual([{
      itemId: "item:a",
      quantity: { min: 2, max: 2 },
      chanceBasisPoints: { min: 0, max: 2500 },
    }]);
  });

  it("fails closed when one Encounter repeats the same Item drop identity", () => {
    expect(() => projectHuntPrestartPreview({
      gameDataVersion: "game-data:test",
      bundleHash: `sha256:${"a".repeat(64)}`,
      huntDefinitionId: "hunt:test",
      encounters: [{
        id: "encounter:a" as never,
        huntId: "hunt:test" as never,
        speciesId: "species:a" as never,
        weight: 1,
        levelBand: { min: 1, max: 1 },
        reward: {
          pokemonXpPool: 6,
          playerXp: null,
          itemDrops: [
            { itemId: "item:a" as never, quantity: 1, chanceBasisPoints: 1000 },
            { itemId: "item:a" as never, quantity: 2, chanceBasisPoints: 2000 },
          ],
        },
      }],
    })).toThrow(/duplicate Item drop identities/);
  });

  it("returns not_found before reading Encounter bytes for an unknown current Hunt", async () => {
    const source = fileReader();
    const paths: string[] = [];
    const reader: RuntimeGameDataReader = { async read(path) {
      paths.push(path);
      return source.read(path);
    } };
    await expect(loadVerifiedHuntPrestartPreview(env(), "hunt:missing", { reader }))
      .rejects.toMatchObject({ code: "not_found" } satisfies Partial<HuntPrestartPreviewError>);
    expect(paths).not.toContain(`${V5_DIRECTORY}/catalogs/encounter-definitions.json`);
  });

  it("enforces the 4 MiB bounded reader before parsing streamed Encounter input", async () => {
    const source = fileReader();
    const fetchImpl = vi.fn(async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const url = new URL(input.toString());
      const relative = url.pathname.split("/game-data/")[1]!;
      if (relative.endsWith("/catalogs/encounter-definitions.json")) {
        expect(init?.redirect).toBe("manual");
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(HUNT_PRESTART_ENCOUNTER_MAX_BYTES));
            controller.enqueue(new Uint8Array(1));
            controller.close();
          },
        }));
      }
      const bytes = await source.read(relative);
      return new Response(Uint8Array.from(bytes), {
        status: 200,
        headers: { "Content-Length": String(bytes.byteLength) },
      });
    });
    await expect(loadVerifiedHuntPrestartPreview(env(), "hunt:verdant-edge:wilds", {
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toThrow("byte limit");
  });

  it("keeps the approved input row ceiling fixed at 4096", () => {
    expect(HUNT_PRESTART_ENCOUNTER_MAX_RECORDS).toBe(4096);
  });

  it("rejects Encounter redirects without following the Location target", async () => {
    const source = fileReader();
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(input.toString());
      expect(url.origin).toBe("https://published.example.invalid");
      const relative = url.pathname.split("/game-data/")[1]!;
      if (relative.endsWith("/catalogs/encounter-definitions.json")) {
        expect(init?.redirect).toBe("manual");
        return new Response(null, { status: 302, headers: { Location: "https://outside.example.invalid/data" } });
      }
      return new Response(Uint8Array.from(await source.read(relative)));
    });
    await expect(loadVerifiedHuntPrestartPreview(env(), "hunt:verdant-edge:wilds", {
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toThrow(/unavailable/);
    expect(fetchImpl.mock.calls.filter(([url]) => url.toString().endsWith("/catalogs/encounter-definitions.json")))
      .toHaveLength(1);
  });
});
