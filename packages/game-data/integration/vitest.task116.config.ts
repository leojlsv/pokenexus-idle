import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["integration/generate-task-116-production-v5-rebind-review.task.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
