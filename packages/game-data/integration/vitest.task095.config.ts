import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["integration/generate-task-095-production-combat-v3-rebind-review.task.ts"],
    fileParallelism: false,
  },
});
