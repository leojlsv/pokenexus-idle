import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@pokenexus/game-types": fileURLToPath(
        new URL("../../packages/game-types/src/index.ts", import.meta.url),
      ),
    },
  },
});
