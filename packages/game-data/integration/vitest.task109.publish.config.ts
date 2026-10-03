import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["integration/publish-task-109-prealpha-wilds.task.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
