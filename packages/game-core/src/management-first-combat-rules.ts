import type { CombatEventSchemaVersion, ResolvedCombatContext, RulesVersion } from "./types";

export const GLOBAL_ACTION_COOLDOWN_MS = 2000;
export const AUTO_POTION_COOLDOWN_MS = 5000;

export const MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1 =
  "combat-rules-management-first-v1" as RulesVersion;

export const MANAGEMENT_FIRST_COMBAT_EVENT_SCHEMA_VERSION_V1 =
  "combat-events-management-first-v1" as CombatEventSchemaVersion;

export function isManagementFirstCombatContext(context: ResolvedCombatContext): boolean {
  return context.rulesVersion === MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1
    && context.combatEventSchemaVersion === MANAGEMENT_FIRST_COMBAT_EVENT_SCHEMA_VERSION_V1;
}
