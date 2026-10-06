import {
  PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_RELEASE_DESCRIPTOR,
  PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_VERSION,
} from "./moves/context";
import { createApiApp, type ApiBindings } from "./auth/http";
import { createLocalPrealphaAuthRuntime, type LocalPrealphaAuthEnvironment } from "./local-prealpha-auth";
import { loadVerifiedHuntCatalogRelease } from "./hunts/catalog-release";

const GAME_DATA_VERSION = "game-data-core-kanto-johto-v5";

export type LocalPrealphaEnvironment = LocalPrealphaAuthEnvironment
  & Partial<Omit<ApiBindings, keyof LocalPrealphaAuthEnvironment>>
  & {
    readonly LOCAL_PREALPHA_GAME_DATA_BASE_URL?: string;
    readonly LOCAL_PREALPHA_CURSOR_HMAC_KEY?: string;
  };

export function localPrealphaBindings(env: LocalPrealphaEnvironment): ApiBindings {
  if (env.LOCAL_PREALPHA_ENABLED !== "1") throw new Error("Local Pre-alpha entry is disabled");
  const baseUrl = env.LOCAL_PREALPHA_GAME_DATA_BASE_URL ?? "http://127.0.0.1:8788/";
  const cursorKey = env.LOCAL_PREALPHA_CURSOR_HMAC_KEY;
  if (!cursorKey || new TextEncoder().encode(cursorKey).byteLength < 32) {
    throw new Error("LOCAL_PREALPHA_CURSOR_HMAC_KEY must contain at least 32 UTF-8 bytes");
  }
  const rulesVersion = PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_VERSION;
  const descriptor = PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_RELEASE_DESCRIPTOR;
  return {
    ...env,
    PLAYER_STATE_CURSOR_HMAC_KEY: cursorKey,
    PLAYER_STATE_GAME_DATA_BASE_URL: baseUrl,
    PLAYER_STATE_MOVE_GAME_DATA_VERSION: GAME_DATA_VERSION,
    PLAYER_STATE_MOVE_RULES_VERSION: rulesVersion,
    PLAYER_STATE_MOVE_CONTEXT_RELEASES: JSON.stringify([{
      gameDataVersion: GAME_DATA_VERSION,
      rulesVersion,
      newOperationsAllowed: true,
    }]),
    PLAYER_STATE_MOVE_GAME_DATA_RELEASES: JSON.stringify([{
      gameDataVersion: GAME_DATA_VERSION,
      newOperationsAllowed: true,
    }]),
    PLAYER_STATE_MOVE_RULE_RELEASES: JSON.stringify([{
      rulesVersion,
      newOperationsAllowed: true,
      productionSelectability: descriptor.productionSelectability,
    }]),
  } as ApiBindings;
}

const app = createApiApp({
  resolveAuthRuntime: (env) => createLocalPrealphaAuthRuntime(env as LocalPrealphaEnvironment),
});

export default {
  async fetch(request: Request, env: LocalPrealphaEnvironment, context: ExecutionContext) {
    const bindings = localPrealphaBindings(env);
    const url = new URL(request.url);
    if (url.pathname === "/__local-prealpha/diagnostics") {
      try {
        const catalog = await loadVerifiedHuntCatalogRelease(bindings);
        return Response.json({
          mode: "local-prealpha",
          catalog: {
            status: "ready",
            gameDataVersion: catalog.descriptor.gameDataVersion,
            bundleHash: catalog.descriptor.bundleHash,
          },
          geneticProfiles: {
            status: "blocked_missing_accepted_species_profile_pairs",
          },
        });
      } catch (error) {
        return Response.json({
          mode: "local-prealpha",
          catalog: {
            status: "unavailable",
            error: error instanceof Error ? error.message : String(error),
          },
          geneticProfiles: {
            status: "blocked_missing_accepted_species_profile_pairs",
          },
        }, { status: 503 });
      }
    }
    return app.fetch(request, bindings, context);
  },
};
