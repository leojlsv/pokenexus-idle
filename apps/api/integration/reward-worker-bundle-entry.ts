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
import {
  createPlayerApplicationFromEnvironment,
  createPlayerCursorCodecFromEnvironment,
} from "../src/player/runtime";

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
      createPlayerApplicationFromEnvironment.name,
      createPlayerCursorCodecFromEnvironment.name,
    ].join(":"));
  },
};
