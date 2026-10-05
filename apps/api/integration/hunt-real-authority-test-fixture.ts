/**
 * TASK-103 disposable PostgreSQL-only production-port wiring.
 *
 * Real published manifest, Move context resolver, Start builder and retained
 * runtime loader; Genetic Profile releases and individualization keys are
 * synthetic test configuration, not deployed release material.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
  GENETIC_COMBAT_RULES_VERSION_V1,
  PRODUCTION_COMBAT_GAME_DATA_VERSION_V2,
} from "@pokenexus/game-core";
import type { RuntimeGameDataReader } from "@pokenexus/game-data/runtime";
import {
  createDefaultProductionCombatCatalogResolver,
  createConfiguredMoveEligibilityRulesVersionResolver,
  createMoveEligibilityContextLoader,
  createRuntimeMoveEligibilityGameDataLoader,
  PRODUCTION_COMBAT_GENETIC_V1_RULES_RELEASE_DESCRIPTOR,
} from "../src/moves/context";
import { createConfiguredStaticContextAuthority } from "../src/static-context/authority";
import {
  createHuntRuntimeAuthorityPort,
  createPublishedHuntGameDataLoader,
  deriveEncounterIndividualizationAuthorityKeyId,
} from "../src/hunts/runtime";

const TEST_ONLY_FIRST_KEY = new Uint8Array(32).fill(41);
const TEST_ONLY_SECOND_KEY = new Uint8Array(32).fill(42);
const PUBLISHED_ROOT = resolve(process.cwd(), "../../packages/game-data/published");
const PAIR = {
  gameDataVersion: PRODUCTION_COMBAT_GAME_DATA_VERSION_V2,
  rulesVersion: GENETIC_COMBAT_RULES_VERSION_V1,
};

export async function createTask103RealHuntAuthority(input: {
  readonly connectionString: string;
  readonly current: "A" | "B";
  /** Keep historical A resolvable after retiring it for new operations. */
  readonly retainA: boolean;
}) {
  const reader: RuntimeGameDataReader = {
    async read(path) {
      return new Uint8Array(await readFile(resolve(PUBLISHED_ROOT, ...path.split("/"))));
    },
  };
  const published = await createPublishedHuntGameDataLoader(reader).load(PAIR.gameDataVersion);
  const staticContext = createConfiguredStaticContextAuthority({
    selectedPair: PAIR,
    releases: [{ pair: PAIR, newOperationsAllowed: true }],
  });
  const moveContextLoader = createMoveEligibilityContextLoader({
    selector: staticContext.selector,
    staticContextPairs: staticContext.staticContextPairs,
    gameDataVersions: staticContext.gameDataVersions,
    rulesVersions: createConfiguredMoveEligibilityRulesVersionResolver([{
      rules: PRODUCTION_COMBAT_GENETIC_V1_RULES_RELEASE_DESCRIPTOR,
      newOperationsAllowed: true,
    }]),
    gameData: createRuntimeMoveEligibilityGameDataLoader(reader),
    productionCatalogs: createDefaultProductionCombatCatalogResolver(),
  });
  const historicalSpecies = [...new Set(published.encounters.map(({ speciesId }) => speciesId))];
  if (historicalSpecies.length !== 3 || published.encounters.length !== 9) {
    throw new Error("TASK-103 pinned published-v3 Encounter fixture changed");
  }
  const oldKeyId = await deriveEncounterIndividualizationAuthorityKeyId(TEST_ONLY_FIRST_KEY);
  const newKeyId = await deriveEncounterIndividualizationAuthorityKeyId(TEST_ONLY_SECOND_KEY);
  const individualizationReleases = [
    ...(input.retainA ? [{
      rulesVersion: ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
      authorityVersion: "test-authority-v1",
      keyId: oldKeyId,
      secretKeyBase64url: Buffer.from(TEST_ONLY_FIRST_KEY).toString("base64url"),
      newOperationsAllowed: input.current === "A",
    }] : []),
    {
      rulesVersion: ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
      authorityVersion: "test-authority-v2",
      keyId: newKeyId,
      secretKeyBase64url: Buffer.from(TEST_ONLY_SECOND_KEY).toString("base64url"),
      newOperationsAllowed: input.current === "B",
    },
  ];
  const authority = createHuntRuntimeAuthorityPort({
    env: {
      HYPERDRIVE: { connectionString: input.connectionString },
      HUNT_PRESENTATION_SOURCE_ENABLED: "1",
      HUNT_CAPTURE_BALL_AUTHORITY_VERSION: "balls:test-v1",
      HUNT_CAPTURE_BALL_RELEASES: JSON.stringify([{
        ballAuthorityVersion: "balls:test-v1",
        newOperationsAllowed: true,
        balls: [{ itemId: "item:poke-ball", powerQuarterUnits: 4, premium: false }],
      }]),
      HUNT_ITEM_RULE_RELEASES: JSON.stringify([{
        itemRuleVersion: "items:test-v1",
        gameDataVersion: PAIR.gameDataVersion,
        rulesVersion: PAIR.rulesVersion,
        items: [{ itemId: "item:potion", rule: {
          useKind: "heal-hp", magnitude: { kind: "fixed", amount: 5 },
        } }],
      }]),
      HUNT_GENETIC_PROFILE_RELEASES: JSON.stringify([{
        gameDataVersion: PAIR.gameDataVersion,
        rulesVersion: PAIR.rulesVersion,
        species: historicalSpecies.map((speciesId) => ({
          speciesId, compatibleProfiles: ["Might", "Clarity"],
        })),
      }]),
      HUNT_INDIVIDUALIZATION_AUTHORITY_VERSION:
        input.current === "A" ? "test-authority-v1" : "test-authority-v2",
      HUNT_INDIVIDUALIZATION_AUTHORITY_RELEASES: JSON.stringify(individualizationReleases),
      HUNT_COMBAT_EVENT_SCHEMA_VERSION: "events:task103-published-test",
      HUNT_INTER_BATTLE_GAP_MS: "1000",
    },
    moveContextLoader,
    gameDataReader: reader,
  });
  return { authority, published, oldKeyId, newKeyId };
}
