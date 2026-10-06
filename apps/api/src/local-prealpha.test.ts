import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { RuntimeGameDataReader } from "@pokenexus/game-data/runtime";
import { loadVerifiedHuntCatalogRelease } from "./hunts/catalog-release";
import { localPrealphaBindings } from "./local-prealpha";

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
    HYPERDRIVE: { connectionString: "postgres://local.invalid/pokenexus" },
  };
}

describe("local Pre-alpha bindings", () => {
  it("binds the already-published v5 management-first catalog without inventing gameplay authority", async () => {
    const env = localPrealphaBindings(input());
    const release = await loadVerifiedHuntCatalogRelease(env, { reader: fileReader() });
    expect(release.descriptor.gameDataVersion).toBe("game-data-core-kanto-johto-v5");
    expect(release.descriptor.bundleHash)
      .toBe("sha256:565cdd360c1b29dc3607696299244279a8d0c3f488d4544c41c62ed47592f782");
    expect(env.HUNT_GENETIC_PROFILE_RELEASES).toBeUndefined();
    expect(env.HUNT_INDIVIDUALIZATION_AUTHORITY_RELEASES).toBeUndefined();
  });

  it("requires an explicit local cursor key and explicit local enablement", () => {
    expect(() => localPrealphaBindings({ ...input(), LOCAL_PREALPHA_ENABLED: "0" }))
      .toThrow(/disabled/);
    expect(() => localPrealphaBindings({ ...input(), LOCAL_PREALPHA_CURSOR_HMAC_KEY: "short" }))
      .toThrow(/32 UTF-8 bytes/);
  });
});

