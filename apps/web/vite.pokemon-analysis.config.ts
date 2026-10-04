import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@pokenexus/game-protocol/testing",
        replacement: fileURLToPath(new URL("../../packages/game-protocol/src/testing.ts", import.meta.url)),
      },
      {
        find: "@pokenexus/game-protocol",
        replacement: fileURLToPath(new URL("../../packages/game-protocol/src/index.ts", import.meta.url)),
      },
      {
        find: "@pokenexus/game-core",
        replacement: fileURLToPath(new URL("../../packages/game-core/src/index.ts", import.meta.url)),
      },
      {
        find: "@pokenexus/game-types",
        replacement: fileURLToPath(new URL("../../packages/game-types/src/index.ts", import.meta.url)),
      },
    ],
  },
  build: {
    outDir: "dist/pokemon-analysis",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./pokemon-analysis-preview.html", import.meta.url)),
    },
  },
});
