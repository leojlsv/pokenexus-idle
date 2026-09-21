export const PACKAGE_NAME = "@pokenexus/game-data" as const;

// Public static-data contract surface. Maintenance/crawler internals intentionally remain
// package-private; consumers get only canonical schema/validation, deterministic serialization
// helpers and immutable staged/published bundle APIs from the package root.
export * from "./schema.js";
export * from "./canonical.js";
export * from "./publication.js";
