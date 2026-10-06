import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const target = process.env.POKENEXUS_LOCAL_API_TARGET;
const bearer = process.env.POKENEXUS_LOCAL_SESSION_BEARER;
const port = Number(process.env.POKENEXUS_LOCAL_WEB_PORT ?? "5173");
if (!target || !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u.test(target)) {
  throw new Error("POKENEXUS_LOCAL_API_TARGET must be a loopback HTTP origin");
}
if (!bearer) throw new Error("POKENEXUS_LOCAL_SESSION_BEARER is required");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("POKENEXUS_LOCAL_WEB_PORT is invalid");

const proxy = {
  target,
  changeOrigin: false,
  configure(server) {
    server.on("proxyReq", (proxyRequest) => {
      proxyRequest.setHeader("cookie", `__Host-pokenexus_session=${bearer}`);
    });
  },
} as const;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@pokenexus/game-data/runtime",
        replacement: fileURLToPath(new URL("../../packages/game-data/src/runtime.ts", import.meta.url)),
      },
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
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    proxy: {
      "/auth": proxy,
      "/player": proxy,
    },
  },
});
