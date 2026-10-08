import { describe, it } from "vitest";
import { runLocalBootstrapRequests, type LocalBootstrapRequest } from "../src/local-prealpha-bootstrap-operator";
import {
  createLocalPrealphaBootstrapApplication,
  type LocalPrealphaEnvironment,
} from "../src/local-prealpha";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(name + " is required for the local Pre-alpha bootstrap operator");
  return value;
}

const enabled = process.env.POKENEXUS_LOCAL_BOOTSTRAP === "1";

describe.skipIf(!enabled)("TASK-122 local trusted bootstrap operator", () => {
  it("invokes the existing TASK-109 trusted bootstrap service for the requested local Players", async () => {
    const env: LocalPrealphaEnvironment = {
      LOCAL_PREALPHA_ENABLED: "1",
      LOCAL_PREALPHA_ALLOWED_ORIGINS: "http://localhost:5173,http://localhost:5174",
      LOCAL_PREALPHA_CURSOR_HMAC_KEY: required("POKENEXUS_LOCAL_BOOTSTRAP_CURSOR_KEY"),
      LOCAL_PREALPHA_GAME_DATA_BASE_URL: required("POKENEXUS_LOCAL_GAME_DATA_BASE_URL"),
      HYPERDRIVE: {
        connectionString: required("POKENEXUS_LOCAL_DATABASE_URL"),
      },
      HUNT_GENETIC_PROFILE_RELEASES: required("POKENEXUS_LOCAL_GENETIC_PROFILE_RELEASES"),
      HUNT_INDIVIDUALIZATION_AUTHORITY_VERSION:
        required("POKENEXUS_LOCAL_INDIVIDUALIZATION_AUTHORITY_VERSION"),
      HUNT_INDIVIDUALIZATION_AUTHORITY_RELEASES:
        required("POKENEXUS_LOCAL_INDIVIDUALIZATION_AUTHORITY_RELEASES"),
    };
    const application = createLocalPrealphaBootstrapApplication(env);
    const requests: LocalBootstrapRequest[] = [{
      label: "A",
      playerId: required("POKENEXUS_LOCAL_PLAYER_A"),
      starterSpeciesId: required("POKENEXUS_LOCAL_STARTER_A"),
    }];
    const playerB = process.env.POKENEXUS_LOCAL_PLAYER_B;
    const starterB = process.env.POKENEXUS_LOCAL_STARTER_B;
    if ((playerB && !starterB) || (!playerB && starterB)) {
      throw new Error("Player B and Starter B must either both be supplied or both be absent");
    }
    if (playerB && starterB) requests.push({ label: "B", playerId: playerB, starterSpeciesId: starterB });

    const evidence = await runLocalBootstrapRequests(requests,
      (request) => application.bootstrap(request),
      (outcome) => process.stdout.write("LOCAL_PREALPHA_BOOTSTRAP_PLAYER=" + JSON.stringify(outcome) + "\n"));
    process.stdout.write("LOCAL_PREALPHA_BOOTSTRAP=" + JSON.stringify(evidence) + "\n");
  });
});
