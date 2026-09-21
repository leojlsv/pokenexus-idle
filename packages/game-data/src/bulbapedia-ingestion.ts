import {
  DEFAULT_INGESTION_USER_AGENT,
  fetchMaintenanceRobotsPolicy,
  fetchMaintenanceSources,
  type MaintenanceFetchOptions,
  type MaintenanceFetchResult,
  type RobotsPolicy,
} from "./ingestion.js";
import { BULBAPEDIA_ZA_MOVE_LIST_URL } from "./bulbapedia-za-parser.js";
import { BULBAPEDIA_GEN9_MOVE_LIST_URL } from "./bulbapedia-gen9-move-parser.js";
import {
  BULBAPEDIA_GEN7_MOVE_LIST_URL,
  BULBAPEDIA_GEN8_MOVE_LIST_URL,
} from "./bulbapedia-historical-move-parser.js";

export const BULBAPEDIA_ROBOTS_URL = "https://bulbapedia.bulbagarden.net/robots.txt";
export const DEFAULT_BULBAPEDIA_USER_AGENT = DEFAULT_INGESTION_USER_AGENT;

export type BulbapediaFetchOptions = MaintenanceFetchOptions;
export type BulbapediaFetchResult = MaintenanceFetchResult;

export const BULBAPEDIA_PROVIDER = {
  hostname: "bulbapedia.bulbagarden.net",
  robotsUrl: BULBAPEDIA_ROBOTS_URL,
  providerLabel: "Bulbapedia",
} as const;

export async function fetchBulbapediaSources(
  sourceUrls: string[],
  options: BulbapediaFetchOptions,
  preparedRobotsPolicy?: RobotsPolicy,
): Promise<BulbapediaFetchResult> {
  return fetchMaintenanceSources(
    sourceUrls,
    options,
    BULBAPEDIA_PROVIDER,
    preparedRobotsPolicy,
  );
}

export async function fetchBulbapediaRobotsPolicy(
  options: BulbapediaFetchOptions,
): Promise<RobotsPolicy> {
  return fetchMaintenanceRobotsPolicy(options, BULBAPEDIA_PROVIDER);
}

export async function fetchBulbapediaZaMoveListSource(
  options: BulbapediaFetchOptions,
): Promise<BulbapediaFetchResult> {
  return fetchBulbapediaSources([BULBAPEDIA_ZA_MOVE_LIST_URL], options);
}

export const BULBAPEDIA_MOVE_REFERENCE_URLS = [
  BULBAPEDIA_GEN9_MOVE_LIST_URL,
  BULBAPEDIA_GEN8_MOVE_LIST_URL,
  BULBAPEDIA_GEN7_MOVE_LIST_URL,
  BULBAPEDIA_ZA_MOVE_LIST_URL,
] as const;

export async function fetchBulbapediaMoveReferenceSources(
  options: BulbapediaFetchOptions,
  preparedRobotsPolicy?: RobotsPolicy,
): Promise<BulbapediaFetchResult> {
  return fetchBulbapediaSources(
    [...BULBAPEDIA_MOVE_REFERENCE_URLS],
    options,
    preparedRobotsPolicy,
  );
}
