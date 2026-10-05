import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type {
  HuntDefinitionV1,
  RuntimeGameDataReader,
  ZoneDefinitionV1,
} from "@pokenexus/game-data/runtime";
import {
  PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_RELEASE_DESCRIPTOR,
  PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_VERSION,
  PRODUCTION_COMBAT_GENETIC_V1_RULES_RELEASE_DESCRIPTOR,
  PRODUCTION_COMBAT_GENETIC_V1_RULES_VERSION,
  PRODUCTION_COMBAT_V2_RULES_RELEASE_DESCRIPTOR,
  PRODUCTION_COMBAT_V2_RULES_VERSION,
} from "../moves/context";
import type { PlayerStateEnvironment } from "../player/runtime";
import {
  HUNT_CATALOG_ARTIFACT_BASE_PATH,
  catalogArtifactName,
  loadVerifiedHuntCatalogRelease,
  validateDisplayCatalog,
} from "./catalog-release";

const V5 = "game-data-core-kanto-johto-v5";
const V3 = "game-data-core-kanto-johto-v3";
const V2 = "game-data-core-kanto-johto-v2";
const V5_HASH = "sha256:565cdd360c1b29dc3607696299244279a8d0c3f488d4544c41c62ed47592f782";
const V3_HASH = "sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559";
const V5_DIRECTORY = "version-38ed5230053095b7ef69290f55f40278e681f20eb530788040be5639cdde3c19";
const V3_DIRECTORY = "version-e7903d8b32ee60805f55ef36c8fe735a517c858f700e92459c3b239a7560e1e2";
const publishedRoot = resolve(process.cwd(), "../../packages/game-data/published");

function env(input: {
  readonly version?: string;
  readonly rulesVersion?: string;
  readonly allowPair?: boolean;
  readonly allowData?: boolean;
  readonly allowRules?: boolean;
  readonly origin?: string;
} = {}): PlayerStateEnvironment {
  const gameDataVersion = input.version ?? V5;
  const rulesVersion = input.rulesVersion ?? PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_VERSION;
  const descriptor = rulesVersion === PRODUCTION_COMBAT_V2_RULES_VERSION
    ? PRODUCTION_COMBAT_V2_RULES_RELEASE_DESCRIPTOR
    : rulesVersion === PRODUCTION_COMBAT_GENETIC_V1_RULES_VERSION
      ? PRODUCTION_COMBAT_GENETIC_V1_RULES_RELEASE_DESCRIPTOR
      : PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_RELEASE_DESCRIPTOR;
  return {
    PLAYER_STATE_GAME_DATA_BASE_URL: input.origin ?? "https://published.example.invalid/game-data/",
    PLAYER_STATE_MOVE_GAME_DATA_VERSION: gameDataVersion,
    PLAYER_STATE_MOVE_RULES_VERSION: rulesVersion,
    PLAYER_STATE_MOVE_CONTEXT_RELEASES: JSON.stringify([{
      gameDataVersion, rulesVersion, newOperationsAllowed: input.allowPair ?? true,
    }]),
    PLAYER_STATE_MOVE_GAME_DATA_RELEASES: JSON.stringify([{
      gameDataVersion, newOperationsAllowed: input.allowData ?? true,
    }]),
    PLAYER_STATE_MOVE_RULE_RELEASES: JSON.stringify([{
      rulesVersion,
      newOperationsAllowed: input.allowRules ?? true,
      productionSelectability: descriptor.productionSelectability,
    }]),
  };
}

function fileReader(): RuntimeGameDataReader {
  return { async read(path) {
    return new Uint8Array(await readFile(resolve(publishedRoot, ...path.split("/"))));
  } };
}

describe("backend-owned immutable Hunt catalog release", () => {
  it("roundtrips the current immutable schema-5 publication over a bounded HTTP origin without Node runtime imports", async () => {
    const paths: string[] = [];
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = new URL(input.toString());
      const relativePath = url.pathname.split("/game-data/")[1];
      if (!relativePath) throw new Error("unexpected test origin path");
      paths.push(relativePath);
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("error");
      const bytes = await fileReader().read(relativePath);
      return new Response(Uint8Array.from(bytes), {
        status: 200,
        headers: { "Content-Length": String(bytes.byteLength) },
      });
    });
    const release = await loadVerifiedHuntCatalogRelease(env(), { fetchImpl: fetchImpl as typeof fetch });
    expect(release.descriptor.bundleHash).toBe(V5_HASH);
    expect(paths).toEqual([
      `${V5_DIRECTORY}/manifest.json`,
      `${V5_DIRECTORY}/catalogs/zones.json`,
      `${V5_DIRECTORY}/catalogs/hunts.json`,
    ]);
    expect(release.artifacts["manifest.json"]).toEqual(await fileReader().read(`${V5_DIRECTORY}/manifest.json`));
  });

  it("pins the selected new-operation pair to an independently compiled production digest and three exact files", async () => {
    const paths: string[] = [];
    const reader: RuntimeGameDataReader = { async read(path) {
      paths.push(path);
      return fileReader().read(path);
    } };
    const release = await loadVerifiedHuntCatalogRelease(env(), { reader });
    expect(release.descriptor).toEqual({
      gameDataVersion: V5,
      bundleHash: V5_HASH,
      artifactBasePath: HUNT_CATALOG_ARTIFACT_BASE_PATH,
    });
    expect(release.directoryName).toBe(V5_DIRECTORY);
    expect(paths).toEqual([
      `${V5_DIRECTORY}/manifest.json`,
      `${V5_DIRECTORY}/catalogs/zones.json`,
      `${V5_DIRECTORY}/catalogs/hunts.json`,
    ]);
    for (const suffix of ["manifest.json", "catalogs/zones.json", "catalogs/hunts.json"] as const) {
      expect(release.artifacts[suffix]).toEqual(await fileReader().read(`${V5_DIRECTORY}/${suffix}`));
      expect(catalogArtifactName(`${V5_DIRECTORY}/${suffix}`, release.directoryName)).toBe(suffix);
    }
    expect(catalogArtifactName("version-" + "0".repeat(64) + "/manifest.json", release.directoryName))
      .toBe("release_drift");
    expect(catalogArtifactName(`${V3_DIRECTORY}/catalogs/species.json`, release.directoryName)).toBeNull();
    expect(catalogArtifactName(`${V3_DIRECTORY}/catalogs/%2e%2e/manifest.json`, release.directoryName)).toBeNull();
  });

  it("retains schema-4 compatibility for an explicitly selected accepted historical pair", async () => {
    const release = await loadVerifiedHuntCatalogRelease(env({
      version: V3,
      rulesVersion: PRODUCTION_COMBAT_GENETIC_V1_RULES_VERSION,
    }), { reader: fileReader() });
    expect(release.descriptor).toEqual({
      gameDataVersion: V3,
      bundleHash: V3_HASH,
      artifactBasePath: HUNT_CATALOG_ARTIFACT_BASE_PATH,
    });
    expect(release.directoryName).toBe(V3_DIRECTORY);
  });

  it("rejects duplicate display identities and orphan Hunt-to-Zone joins", () => {
    const zone = { id: "zone:a", displayName: "Zone A" } as ZoneDefinitionV1;
    const hunt = { id: "hunt:a", displayName: "Hunt A", zoneId: zone.id } as HuntDefinitionV1;
    expect(() => validateDisplayCatalog([zone, zone], [hunt])).toThrow("Zone identity");
    expect(() => validateDisplayCatalog([zone], [hunt, hunt])).toThrow("Hunt identity");
    expect(() => validateDisplayCatalog(
      [zone],
      [{ ...hunt, id: "hunt:orphan", zoneId: "zone:missing" } as HuntDefinitionV1],
    )).toThrow("Zone reference");
  });

  it("refuses deprecated and incompatible selected pair or game data before fetching any artifact", async () => {
    const reader = { read: vi.fn(fileReader().read) };
    for (const configuration of [
      env({ allowPair: false }),
      env({ allowData: false }),
      env({ allowRules: false }),
      env({ version: "unpublished:unknown" }),
      env({ version: V2, rulesVersion: PRODUCTION_COMBAT_GENETIC_V1_RULES_VERSION }),
    ]) {
      await expect(loadVerifiedHuntCatalogRelease(configuration, { reader })).rejects.toThrow();
    }
    expect(reader.read).not.toHaveBeenCalled();
  });

  it("rejects schema-v3/future data and absent/altered canonical manifest or shards", async () => {
    await expect(loadVerifiedHuntCatalogRelease(env({
      version: V2,
      rulesVersion: PRODUCTION_COMBAT_V2_RULES_VERSION,
    }), { reader: fileReader() })).rejects.toThrow("manifest");

    const futureSchema: RuntimeGameDataReader = { async read(path) {
      const bytes = await fileReader().read(path);
      if (!path.endsWith("/manifest.json")) return bytes;
      const manifest = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
      manifest.schemaVersion = 6;
      return new TextEncoder().encode(JSON.stringify(manifest));
    } };
    await expect(loadVerifiedHuntCatalogRelease(env(), { reader: futureSchema }))
      .rejects.toThrow();

    const missing: RuntimeGameDataReader = { read: async () => { throw new Error("absent"); } };
    await expect(loadVerifiedHuntCatalogRelease(env(), { reader: missing })).rejects.toThrow("absent");

    for (const target of ["manifest.json", "catalogs/zones.json", "catalogs/hunts.json"]) {
      const tampered: RuntimeGameDataReader = { async read(path) {
        const bytes = await fileReader().read(path);
        if (!path.endsWith(`/${target}`)) return bytes;
        const copy = new Uint8Array(bytes);
        copy[15] = copy[15]! ^ 1;
        return copy;
      } };
      await expect(loadVerifiedHuntCatalogRelease(env(), { reader: tampered })).rejects.toThrow();
    }
    for (const target of ["catalogs/zones.json", "catalogs/hunts.json"]) {
      const missingShard: RuntimeGameDataReader = { read: async (path) => {
        if (path.endsWith(`/${target}`)) throw new Error("missing current shard");
        return fileReader().read(path);
      } };
      await expect(loadVerifiedHuntCatalogRelease(env(), { reader: missingShard }))
        .rejects.toThrow("missing current shard");
    }
  });

  it("limits even injected-reader bytes before parsing, including missing Content-Length", async () => {
    const tooLarge = { read: vi.fn(async () => new Uint8Array(64 * 1024 + 1)) };
    await expect(loadVerifiedHuntCatalogRelease(env(), { reader: tooLarge })).rejects.toThrow("byte limit");
    expect(tooLarge.read).toHaveBeenCalledTimes(1);

    const oversizedShard: RuntimeGameDataReader = { async read(path) {
      if (path.endsWith("/catalogs/zones.json")) return new Uint8Array(1024 * 1024 + 1);
      return fileReader().read(path);
    } };
    await expect(loadVerifiedHuntCatalogRelease(env(), { reader: oversizedShard }))
      .rejects.toThrow("byte limit");

    const oversizedStream = vi.fn(async (
      _input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1],
    ) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1024));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    })));
    await expect(loadVerifiedHuntCatalogRelease(env(), { fetchImpl: oversizedStream as typeof fetch }))
      .rejects.toThrow("byte limit");
    expect(oversizedStream).toHaveBeenCalledTimes(1);
    expect(oversizedStream.mock.calls[0]![0].toString()).toContain(`${V5_DIRECTORY}/manifest.json`);
  });

  it("refuses a nonlocal cleartext origin and redirects without following them", async () => {
    const fetchImpl = vi.fn(async (
      _input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1],
    ) => Response.redirect("https://redirect.example.invalid/manifest.json"));
    await expect(loadVerifiedHuntCatalogRelease(env({ origin: "http://remote.example.invalid/" }), {
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toThrow("HTTPS");
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(loadVerifiedHuntCatalogRelease(env(), {
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toThrow("unavailable");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ redirect: "error" });
  });
});
