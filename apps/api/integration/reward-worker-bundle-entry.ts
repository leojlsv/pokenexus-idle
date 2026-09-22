import {
  RewardApplicationService,
  createRuntimePinnedRewardContextLoader,
} from "../src/rewards/application";
import {
  MoveEligibilityApplicationService,
  createPgMoveLoadoutRepository,
} from "../src/moves/application";
import {
  createMoveEligibilityContextLoader,
  createRuntimeMoveEligibilityGameDataLoader,
} from "../src/moves/context";
import { createConfiguredStaticContextAuthority } from "../src/static-context/authority";

export default {
  fetch(): Response {
    return new Response([
      RewardApplicationService.name,
      createRuntimePinnedRewardContextLoader.name,
      MoveEligibilityApplicationService.name,
      createPgMoveLoadoutRepository.name,
      createMoveEligibilityContextLoader.name,
      createRuntimeMoveEligibilityGameDataLoader.name,
      createConfiguredStaticContextAuthority.name,
    ].join(":"));
  },
};
