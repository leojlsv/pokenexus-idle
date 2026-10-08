import { createHash } from "node:crypto";
import {
  MANAGEMENT_FIRST_COMBAT_EVENT_SCHEMA_VERSION_V1,
} from "@pokenexus/game-core";
import {
  PREALPHA_ITEM_IDS,
  createHttpGameDataReader,
  type RuntimeGameDataReader,
} from "@pokenexus/game-data/runtime";
import {
  PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_RELEASE_DESCRIPTOR,
  PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_VERSION,
} from "./moves/context";
import { createApiApp, type ApiBindings } from "./auth/http";
import { createLocalPrealphaAuthRuntime, type LocalPrealphaAuthEnvironment } from "./local-prealpha-auth";
import { loadVerifiedHuntCatalogRelease } from "./hunts/catalog-release";
import { loadVerifiedHuntPrestartPreview } from "./hunts/prestart-preview";
import {
  createEncounterIndividualizationAuthorityResolver,
  createGeneticProfilePairReleaseResolver,
  createPublishedHuntGameDataLoader,
  parseEncounterIndividualizationAuthorityReleases,
  parseGeneticProfilePairReleases,
} from "./hunts/runtime";
import {
  PLAYER_BOOTSTRAP_CONTENT_AUTHORITY,
  PlayerBootstrapApplicationService,
  createPgPlayerBootstrapRepository,
} from "./player/bootstrap";
import { createConfiguredMoveContextLoader } from "./player/runtime";

const GAME_DATA_VERSION = "game-data-core-kanto-johto-v5";
const WILDS_HUNT_ID = "hunt:verdant-edge:wilds";
const LOCAL_CAPTURE_BALL_AUTHORITY_VERSION = "local-prealpha-capture-balls-v1";
const LOCAL_ITEM_RULE_VERSION = "local-prealpha-item-rules-v1";

export interface LocalPrealphaGeneticProfileDecision {
  readonly role: "starter" | "wild";
  readonly speciesId: string;
  readonly sourceName: string;
  readonly decided: boolean;
}

export interface LocalPrealphaGeneticProfileReadiness {
  readonly status: "blocked_missing_authority" | "blocked_incomplete_authority" | "ready";
  readonly authorityHash: string | null;
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
  readonly requiredDecisions: readonly LocalPrealphaGeneticProfileDecision[];
  readonly missingSpeciesIds: readonly string[];
}

export type LocalPrealphaEnvironment = LocalPrealphaAuthEnvironment
  & Partial<Omit<ApiBindings, keyof LocalPrealphaAuthEnvironment>>
  & {
    readonly LOCAL_PREALPHA_GAME_DATA_BASE_URL?: string;
    readonly LOCAL_PREALPHA_CURSOR_HMAC_KEY?: string;
  };

function assertLocalPrealphaDatabase(env: LocalPrealphaEnvironment): void {
  const connectionString = env.HYPERDRIVE?.connectionString;
  if (!connectionString) throw new Error("Local Pre-alpha requires HYPERDRIVE.connectionString");
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Local Pre-alpha database connection string is invalid");
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  const localHyperdrive = /^[a-f0-9]{32}\.hyperdrive\.local$/u.test(url.hostname);
  const localProxyOptions = localHyperdrive && url.search === "?sslmode=disable";
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if ((!loopback && !localHyperdrive) || !/^pokenexus_local_prealpha(?:_|$)/u.test(databaseName) ||
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    (url.search && !localProxyOptions) || url.hash) {
    throw new Error(
      "Local Pre-alpha refuses non-loopback database target host=" + url.hostname + " database=" + databaseName,
    );
  }
}

function localGameDataBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Local Pre-alpha game-data base URL is invalid");
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.protocol !== "http:" || !loopback || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("Local Pre-alpha game-data base URL must be a loopback HTTP origin");
  }
  return url.href;
}

export function localPrealphaBindings(env: LocalPrealphaEnvironment): ApiBindings {
  if (env.LOCAL_PREALPHA_ENABLED !== "1") throw new Error("Local Pre-alpha entry is disabled");
  assertLocalPrealphaDatabase(env);
  const baseUrl = localGameDataBaseUrl(
    env.LOCAL_PREALPHA_GAME_DATA_BASE_URL ?? "http://127.0.0.1:8788/",
  );
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
    HUNT_CAPTURE_BALL_AUTHORITY_VERSION: LOCAL_CAPTURE_BALL_AUTHORITY_VERSION,
    HUNT_CAPTURE_BALL_RELEASES: JSON.stringify([{
      ballAuthorityVersion: LOCAL_CAPTURE_BALL_AUTHORITY_VERSION,
      newOperationsAllowed: true,
      balls: [{
        itemId: PREALPHA_ITEM_IDS.standardPokeBall,
        powerQuarterUnits: 4,
        premium: false,
      }],
    }]),
    HUNT_ITEM_RULE_RELEASES: JSON.stringify([{
      itemRuleVersion: LOCAL_ITEM_RULE_VERSION,
      gameDataVersion: GAME_DATA_VERSION,
      rulesVersion,
      items: [
        {
          itemId: PREALPHA_ITEM_IDS.standardPokeBall,
          rule: { useKind: "capture-attempt" },
        },
        {
          itemId: PREALPHA_ITEM_IDS.basicPotion,
          rule: {
            useKind: "heal-hp",
            magnitude: { kind: "max-hp-fraction", numerator: 1, denominator: 4 },
          },
        },
        {
          itemId: PREALPHA_ITEM_IDS.revive25,
          rule: {
            useKind: "revive-hp",
            magnitude: { kind: "max-hp-fraction", numerator: 1, denominator: 4 },
          },
        },
      ],
    }]),
    HUNT_COMBAT_EVENT_SCHEMA_VERSION: MANAGEMENT_FIRST_COMBAT_EVENT_SCHEMA_VERSION_V1,
    HUNT_INTER_BATTLE_GAP_MS: "0",
  } as ApiBindings;
}

export async function localPrealphaGeneticProfileReadiness(
  env: LocalPrealphaEnvironment,
  options: { readonly reader?: RuntimeGameDataReader } = {},
): Promise<LocalPrealphaGeneticProfileReadiness> {
  const bindings = localPrealphaBindings(env);
  const reader = options.reader ?? createHttpGameDataReader(
    bindings.PLAYER_STATE_GAME_DATA_BASE_URL ?? "",
  );
  const published = await createPublishedHuntGameDataLoader(reader).load(GAME_DATA_VERSION);
  const starterIds = PLAYER_BOOTSTRAP_CONTENT_AUTHORITY.starters.map(({ speciesId }) => speciesId);
  const wildIds = [...new Set(
    published.encounters
      .filter(({ huntId }) => huntId === WILDS_HUNT_ID)
      .map(({ speciesId }) => speciesId),
  )];
  if (starterIds.length !== 6 || wildIds.length !== 6) {
    throw new Error("Local Pre-alpha starter/Wilds Species authority changed unexpectedly");
  }
  const roles = new Map<string, "starter" | "wild">([
    ...starterIds.map((speciesId) => [speciesId, "starter"] as const),
    ...wildIds.map((speciesId) => [speciesId, "wild"] as const),
  ]);
  if (roles.size !== 12) {
    throw new Error("Local Pre-alpha required Genetic Profile Species set must contain exactly 12 entries");
  }

  const raw = bindings.HUNT_GENETIC_PROFILE_RELEASES;
  let selected: Awaited<ReturnType<ReturnType<typeof createGeneticProfilePairReleaseResolver>["resolve"]>> = null;
  if (raw) {
    const resolver = createGeneticProfilePairReleaseResolver(parseGeneticProfilePairReleases(raw));
    selected = await resolver.resolve({
      gameDataVersion: GAME_DATA_VERSION,
      rulesVersion: PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_VERSION,
    });
    const unexpectedSpeciesIds = selected
      ? [...selected.profilesBySpeciesId.keys()]
        .filter((speciesId) => !roles.has(speciesId))
        .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "variant" }))
      : [];
    if (unexpectedSpeciesIds.length > 0) {
      throw new Error(
        "Local Pre-alpha Genetic Profile authority exceeds the exact 12-Species slice: "
        + unexpectedSpeciesIds.join(","),
      );
    }
  }
  const requiredDecisions = [...roles].map(([speciesId, role]) => {
    const species = published.speciesById.get(speciesId);
    if (!species) throw new Error("Required local Pre-alpha Species is absent from v5: " + speciesId);
    return {
      role,
      speciesId,
      sourceName: species.sourceName,
      decided: selected?.profilesBySpeciesId.has(speciesId) ?? false,
    };
  }).sort((left, right) =>
    left.role.localeCompare(right.role)
    || left.sourceName.localeCompare(right.sourceName, "en", { sensitivity: "variant" })
    || left.speciesId.localeCompare(right.speciesId, "en", { sensitivity: "variant" }));
  const missingSpeciesIds = requiredDecisions
    .filter(({ decided }) => !decided)
    .map(({ speciesId }) => speciesId);
  return {
    authorityHash: raw ? `sha256:${createHash("sha256").update(raw.trim(), "utf8").digest("hex")}` : null,
    status: !raw
      ? "blocked_missing_authority"
      : missingSpeciesIds.length
        ? "blocked_incomplete_authority"
        : "ready",
    gameDataVersion: GAME_DATA_VERSION,
    rulesVersion: PRODUCTION_COMBAT_MANAGEMENT_FIRST_V1_RULES_VERSION,
    requiredDecisions,
    missingSpeciesIds,
  };
}

export function createLocalPrealphaBootstrapApplication(
  env: LocalPrealphaEnvironment,
): PlayerBootstrapApplicationService {
  const bindings = localPrealphaBindings(env);
  const connectionString = bindings.HYPERDRIVE?.connectionString;
  if (!connectionString) throw new Error("Local Pre-alpha bootstrap requires HYPERDRIVE.connectionString");
  const geneticProfiles = createGeneticProfilePairReleaseResolver(
    parseGeneticProfilePairReleases(bindings.HUNT_GENETIC_PROFILE_RELEASES),
  );
  const individualization = createEncounterIndividualizationAuthorityResolver({
    releases: parseEncounterIndividualizationAuthorityReleases(
      bindings.HUNT_INDIVIDUALIZATION_AUTHORITY_RELEASES,
    ),
    currentAuthorityVersion: bindings.HUNT_INDIVIDUALIZATION_AUTHORITY_VERSION ?? "",
  });
  return new PlayerBootstrapApplicationService(
    createPgPlayerBootstrapRepository(connectionString),
    createConfiguredMoveContextLoader(bindings),
    {
      async resolve(input) {
        const release = await geneticProfiles.resolve(input);
        return release?.profilesBySpeciesId.get(input.speciesId) ?? null;
      },
    },
    {
      loadForNewOperation() {
        return individualization.current();
      },
    },
  );
}

const app = createApiApp({
  resolveAuthRuntime: (env) => createLocalPrealphaAuthRuntime(env as LocalPrealphaEnvironment),
});

export default {
  async fetch(request: Request, env: LocalPrealphaEnvironment, context: ExecutionContext) {
    const url = new URL(request.url);
    let bindings: ApiBindings;
    try {
      bindings = localPrealphaBindings(env);
    } catch (error) {
      if (url.pathname === "/__local-prealpha/diagnostics") {
        return Response.json({
          mode: "local-prealpha",
          configuration: {
            status: "unavailable",
            error: error instanceof Error ? error.message : String(error),
          },
        }, { status: 503 });
      }
      throw error;
    }
    if (url.pathname === "/__local-prealpha/diagnostics") {
      try {
        const [catalog, geneticProfiles, wildsPreview] = await Promise.all([
          loadVerifiedHuntCatalogRelease(bindings),
          localPrealphaGeneticProfileReadiness(bindings),
          loadVerifiedHuntPrestartPreview(bindings, WILDS_HUNT_ID),
        ]);
        const individualization = createEncounterIndividualizationAuthorityResolver({
          releases: parseEncounterIndividualizationAuthorityReleases(
            bindings.HUNT_INDIVIDUALIZATION_AUTHORITY_RELEASES,
          ),
          currentAuthorityVersion: bindings.HUNT_INDIVIDUALIZATION_AUTHORITY_VERSION ?? "",
        });
        const currentIndividualization = await individualization.current();
        return Response.json({
          mode: "local-prealpha",
          catalog: {
            status: "ready",
            gameDataVersion: catalog.descriptor.gameDataVersion,
            bundleHash: catalog.descriptor.bundleHash,
          },
          wildsPreview: {
            status: "ready",
            huntDefinitionId: wildsPreview.huntDefinitionId,
            possibleSpeciesIds: wildsPreview.preview.possibleSpeciesIds,
          },
          individualization: {
            status: "ready",
            authorityVersion: currentIndividualization.authorityVersion,
            keyId: currentIndividualization.keyId,
          },
          geneticProfiles,
        });
      } catch (error) {
        return Response.json({
          mode: "local-prealpha",
          authority: {
            status: "unavailable",
            error: error instanceof Error ? error.message : String(error),
          },
        }, { status: 503 });
      }
    }
    return app.fetch(request, bindings, context);
  },
};
