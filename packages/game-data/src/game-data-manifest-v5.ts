import {
  GAME_DATA_V4_ARTIFACT_PATHS,
  parseGameDataManifestV4,
  type GameDataManifestV4,
} from "./pve-manifest.js";
import { GAME_DATA_SCHEMA_V5 } from "./schema-version-v5.js";

export const GAME_DATA_V5_ARTIFACT_PATHS = GAME_DATA_V4_ARTIFACT_PATHS;
export type GameDataV5ArtifactLogicalName = keyof typeof GAME_DATA_V5_ARTIFACT_PATHS;

export interface GameDataManifestV5 extends Omit<GameDataManifestV4, "schemaVersion"> {
  schemaVersion: typeof GAME_DATA_SCHEMA_V5;
}

export function parseGameDataManifestV5(value: unknown): GameDataManifestV5 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("manifest: must be an object");
  }
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== GAME_DATA_SCHEMA_V5) {
    throw new TypeError(`manifest.schemaVersion: must be ${GAME_DATA_SCHEMA_V5}`);
  }
  const parsedV4 = parseGameDataManifestV4({ ...input, schemaVersion: "4" });
  return { ...parsedV4, schemaVersion: GAME_DATA_SCHEMA_V5 };
}
