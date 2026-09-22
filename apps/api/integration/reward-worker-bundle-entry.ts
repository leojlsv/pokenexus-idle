import {
  RewardApplicationService,
  createRuntimePinnedRewardContextLoader,
} from "../src/rewards/application";

export default {
  fetch(): Response {
    return new Response(`${RewardApplicationService.name}:${createRuntimePinnedRewardContextLoader.name}`);
  },
};
