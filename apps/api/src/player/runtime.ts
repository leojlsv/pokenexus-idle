import { createHttpGameDataReader } from "@pokenexus/game-data/runtime";
import type {
  MoveEligibilityContextLoader,
} from "../moves/context";
import {
  MoveEligibilityApplicationService,
  createPgMoveLoadoutRepository,
} from "../moves/application";
import {
  MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
  MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH,
  MoveAuthorityUnavailableError,
  createConfiguredMoveEligibilityRulesVersionResolver,
  createMoveEligibilityContextLoader,
  createRuntimeMoveEligibilityGameDataLoader,
} from "../moves/context";
import type {
  ExactGameDataVersionAuthority,
  ExactStaticContextPairAuthority,
  NewOperationStaticContextSelector,
  StaticContextPairRef,
} from "../static-context/authority";
import { PlayerApplication, type PlayerHttpApplication } from "./application";
import { createPlayerCursorCodec, type PlayerCursorCodec } from "./protocol";

export interface PlayerStateEnvironment {
  readonly HYPERDRIVE?: { readonly connectionString: string };
  readonly PLAYER_STATE_CURSOR_HMAC_KEY?: string;
  readonly PLAYER_STATE_GAME_DATA_BASE_URL?: string;
  readonly PLAYER_STATE_MOVE_GAME_DATA_VERSION?: string;
  readonly PLAYER_STATE_MOVE_RULES_VERSION?: string;
  readonly PLAYER_STATE_MOVE_CONTEXT_RELEASES?: string;
  readonly PLAYER_STATE_MOVE_GAME_DATA_RELEASES?: string;
  readonly PLAYER_STATE_MOVE_RULE_RELEASES?: string;
}

interface PairRelease extends StaticContextPairRef {
  readonly newOperationsAllowed: boolean;
}

interface GameDataRelease {
  readonly gameDataVersion: string;
  readonly newOperationsAllowed: boolean;
}

interface RulesRelease {
  readonly rulesVersion: string;
  readonly newOperationsAllowed: boolean;
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function parseJsonArray(raw: string | undefined, name: string): readonly unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(required(raw, name)) as unknown;
  } catch (error) {
    throw new Error(`${name} must be valid JSON`, { cause: error });
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 128) {
    throw new Error(`${name} must be a non-empty bounded array`);
  }
  return parsed;
}

function parsePairReleases(raw: string | undefined): readonly PairRelease[] {
  return parseJsonArray(raw, "PLAYER_STATE_MOVE_CONTEXT_RELEASES").map((entry) => {
    if (!isRecord(entry) || !exactKeys(entry, ["gameDataVersion", "rulesVersion", "newOperationsAllowed"])) {
      throw new Error("PLAYER_STATE_MOVE_CONTEXT_RELEASES contains an invalid release");
    }
    if (
      typeof entry.gameDataVersion !== "string"
      || entry.gameDataVersion.length === 0
      || typeof entry.rulesVersion !== "string"
      || entry.rulesVersion.length === 0
      || typeof entry.newOperationsAllowed !== "boolean"
    ) {
      throw new Error("PLAYER_STATE_MOVE_CONTEXT_RELEASES contains an invalid release");
    }
    return {
      gameDataVersion: entry.gameDataVersion,
      rulesVersion: entry.rulesVersion,
      newOperationsAllowed: entry.newOperationsAllowed,
    };
  });
}

function parseGameDataReleases(raw: string | undefined): readonly GameDataRelease[] {
  return parseJsonArray(raw, "PLAYER_STATE_MOVE_GAME_DATA_RELEASES").map((entry) => {
    if (!isRecord(entry) || !exactKeys(entry, ["gameDataVersion", "newOperationsAllowed"])) {
      throw new Error("PLAYER_STATE_MOVE_GAME_DATA_RELEASES contains an invalid release");
    }
    if (
      typeof entry.gameDataVersion !== "string"
      || entry.gameDataVersion.length === 0
      || typeof entry.newOperationsAllowed !== "boolean"
    ) {
      throw new Error("PLAYER_STATE_MOVE_GAME_DATA_RELEASES contains an invalid release");
    }
    return {
      gameDataVersion: entry.gameDataVersion,
      newOperationsAllowed: entry.newOperationsAllowed,
    };
  });
}

function parseRulesReleases(raw: string | undefined): readonly RulesRelease[] {
  return parseJsonArray(raw, "PLAYER_STATE_MOVE_RULE_RELEASES").map((entry) => {
    if (!isRecord(entry) || !exactKeys(entry, ["rulesVersion", "newOperationsAllowed"])) {
      throw new Error("PLAYER_STATE_MOVE_RULE_RELEASES contains an invalid release");
    }
    if (
      typeof entry.rulesVersion !== "string"
      || entry.rulesVersion.length === 0
      || typeof entry.newOperationsAllowed !== "boolean"
    ) {
      throw new Error("PLAYER_STATE_MOVE_RULE_RELEASES contains an invalid release");
    }
    return {
      rulesVersion: entry.rulesVersion,
      newOperationsAllowed: entry.newOperationsAllowed,
    };
  });
}

function uniqueBy<T>(values: readonly T[], keyFor: (value: T) => string, label: string): Map<string, T> {
  const mapped = new Map<string, T>();
  for (const value of values) {
    const key = keyFor(value);
    if (mapped.has(key)) throw new Error(`Duplicate ${label} release: ${key}`);
    mapped.set(key, value);
  }
  return mapped;
}

function pairKey(pair: StaticContextPairRef): string {
  return JSON.stringify([pair.gameDataVersion, pair.rulesVersion]);
}

function createConfiguredMoveContextLoader(env: PlayerStateEnvironment): MoveEligibilityContextLoader {
  try {
    const selectedPair = {
      gameDataVersion: required(
        env.PLAYER_STATE_MOVE_GAME_DATA_VERSION,
        "PLAYER_STATE_MOVE_GAME_DATA_VERSION",
      ),
      rulesVersion: required(
        env.PLAYER_STATE_MOVE_RULES_VERSION,
        "PLAYER_STATE_MOVE_RULES_VERSION",
      ),
    };
    const pairReleases = uniqueBy(parsePairReleases(env.PLAYER_STATE_MOVE_CONTEXT_RELEASES), pairKey, "Move context");
    const gameDataReleases = uniqueBy(
      parseGameDataReleases(env.PLAYER_STATE_MOVE_GAME_DATA_RELEASES),
      ({ gameDataVersion }) => gameDataVersion,
      "Move game-data",
    );
    const rulesReleases = parseRulesReleases(env.PLAYER_STATE_MOVE_RULE_RELEASES);

    const selector: NewOperationStaticContextSelector = {
      async select() {
        return { ...selectedPair };
      },
    };
    const staticContextPairs: ExactStaticContextPairAuthority = {
      async resolve(pair) {
        const release = pairReleases.get(pairKey(pair));
        return release
          ? {
            compatibility: {
              gameDataVersion: release.gameDataVersion,
              rulesVersion: release.rulesVersion,
            },
            newOperationsAllowed: release.newOperationsAllowed,
          }
          : null;
      },
    };
    const gameDataVersions: ExactGameDataVersionAuthority = {
      async resolve(gameDataVersion) {
        const release = gameDataReleases.get(gameDataVersion);
        return release ? { ...release } : null;
      },
    };
    const rulesVersions = createConfiguredMoveEligibilityRulesVersionResolver(
      rulesReleases.map((release) => ({
        rules: {
          rulesVersion: release.rulesVersion,
          moveEligibilityRuleArtifactId: MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
          moveEligibilityRuleSemanticsHash: MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH,
        },
        newOperationsAllowed: release.newOperationsAllowed,
      })),
    );
    const gameDataReader = createHttpGameDataReader(
      required(env.PLAYER_STATE_GAME_DATA_BASE_URL, "PLAYER_STATE_GAME_DATA_BASE_URL"),
    );
    return createMoveEligibilityContextLoader({
      selector,
      staticContextPairs,
      gameDataVersions,
      rulesVersions,
      gameData: createRuntimeMoveEligibilityGameDataLoader(gameDataReader),
    });
  } catch (error) {
    if (error instanceof MoveAuthorityUnavailableError) throw error;
    throw new MoveAuthorityUnavailableError(error);
  }
}

function createMoveApplication(env: PlayerStateEnvironment, connectionString: string) {
  const contextLoader: MoveEligibilityContextLoader = {
    async loadForNewOperation() {
      return createConfiguredMoveContextLoader(env).loadForNewOperation();
    },
  };
  return new MoveEligibilityApplicationService(
    createPgMoveLoadoutRepository(connectionString),
    contextLoader,
  );
}

export function createPlayerApplicationFromEnvironment(
  env: PlayerStateEnvironment,
): PlayerHttpApplication {
  const connectionString = required(env.HYPERDRIVE?.connectionString, "HYPERDRIVE.connectionString");
  return new PlayerApplication(
    connectionString,
    () => createMoveApplication(env, connectionString),
  );
}

export function createPlayerCursorCodecFromEnvironment(
  env: PlayerStateEnvironment,
): PlayerCursorCodec {
  return createPlayerCursorCodec(
    required(env.PLAYER_STATE_CURSOR_HMAC_KEY, "PLAYER_STATE_CURSOR_HMAC_KEY"),
  );
}
