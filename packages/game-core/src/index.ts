/**
 * Package identity marker.
 *
 * Placeholder entrypoint validating workspace build/type-resolution wiring.
 * game-core must remain pure and deterministic: no React, HTTP, database
 * client or Cloudflare runtime dependency may be introduced here.
 * Real domain logic is introduced by future scoped tasks.
 */
export const PACKAGE_NAME = "@pokenexus/game-core" as const;
