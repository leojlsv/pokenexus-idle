import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["integration/generate-task-109-prealpha-wilds-review.task.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
