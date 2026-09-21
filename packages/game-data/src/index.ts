export const PACKAGE_NAME = "@pokenexus/game-data" as const;

// Default entrypoint is runtime-safe. Node-only publication/maintenance helpers live under
// `@pokenexus/game-data/node` so Cloudflare consumers cannot pull filesystem code accidentally.
export * from "./runtime.js";
