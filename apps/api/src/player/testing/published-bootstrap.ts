import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { EncounterIndividualizationAuthority } from "@pokenexus/game-core";
import type { RuntimeGameDataReader } from "@pokenexus/game-data/runtime";
import {
  createDefaultProductionCombatCatalogResolver,
  createMoveEligibilityContextLoader,
  createRuntimeMoveEligibilityGameDataLoader,
  type MoveEligibilityContext,
} from "../../moves/context";
import {
  createGeneticProfilePairReleaseResolver,
  deriveEncounterIndividualizationAuthorityKeyId,
  parseGeneticProfilePairReleases,
} from "../../hunts/runtime";
import { localPrealphaBindings } from "../../local-prealpha";
import { createConfiguredMoveAuthorities } from "../runtime";
import {
  PlayerBootstrapApplicationService,
  type PlayerBootstrapRepository,
  type StarterGeneticProfileAuthority,
} from "../bootstrap";

export interface PublishedBootstrapFixture {
  readonly context: MoveEligibilityContext;
  readonly profileAuthority: StarterGeneticProfileAuthority;
  readonly individualization: EncounterIndividualizationAuthority;
}

let loaded: Promise<PublishedBootstrapFixture> | undefined;

export function publishedBootstrapFixture(): Promise<PublishedBootstrapFixture> {
  loaded ??= (async () => {
    const root = resolve(process.cwd(), "../../");
    const reader: RuntimeGameDataReader = {
      async read(path) {
        return new Uint8Array(await readFile(resolve(root, "packages/game-data/published", path)));
      },
    };
    const env = localPrealphaBindings({
      LOCAL_PREALPHA_ENABLED: "1",
      LOCAL_PREALPHA_CURSOR_HMAC_KEY: "test-only-published-bootstrap-cursor-key",
      HYPERDRIVE: { connectionString: "postgresql://127.0.0.1:55432/pokenexus_local_prealpha" },
    });
    const authorities = createConfiguredMoveAuthorities(env);
    const context = await createMoveEligibilityContextLoader({
      ...authorities,
      gameData: createRuntimeMoveEligibilityGameDataLoader(reader),
      productionCatalogs: createDefaultProductionCombatCatalogResolver(),
    }).loadForNewOperation();
    const profiles = createGeneticProfilePairReleaseResolver(parseGeneticProfilePairReleases(
      await readFile(resolve(root, "docs/qa/PREALPHA_GENETIC_PROFILE_RELEASES.json"), "utf8"),
    ));
    const secretKey = new Uint8Array(32).fill(29);
    return {
      context,
      profileAuthority: {
        async resolve(input) {
          return (await profiles.resolve(input))?.profilesBySpeciesId.get(input.speciesId) ?? null;
        },
      },
      individualization: {
        rulesVersion: "encounter-individualization-v1",
        authorityVersion: "test-only-starter-level-five",
        secretKey,
        keyId: await deriveEncounterIndividualizationAuthorityKeyId(secretKey),
      },
    };
  })();
  return loaded;
}

export async function publishedBootstrapService(repository: PlayerBootstrapRepository) {
  const fixture = await publishedBootstrapFixture();
  return new PlayerBootstrapApplicationService(
    repository,
    { async loadForNewOperation() { return fixture.context; } },
    fixture.profileAuthority,
    { async loadForNewOperation() { return fixture.individualization; } },
  );
}
