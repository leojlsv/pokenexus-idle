import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["integration/generate-task-034-verdant-edge-review.task.ts"],
    fileParallelism: false,
  },
});
