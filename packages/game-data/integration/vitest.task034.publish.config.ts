import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["integration/publish-task-034-verdant-edge.task.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
