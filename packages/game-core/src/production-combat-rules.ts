import rawProductionMoveSupportProfileV1 from "./production-move-support-v1.json" with { type: "json" };
import rawProductionMoveSupportProfileV2 from "./production-move-support-v2.json" with { type: "json" };
import { compareUtf8Bytes } from "./combat-math";
import { deriveSimpleDamageMoveCooldownMs } from "./cooldown";
import { deriveLevelAvailableMoves, type MoveEligibilityLearnsetEntry } from "./move-eligibility";
import type {
  AbilityId,
  AbilityRule,
  EffectInstruction,
  EffectRule,
  MoveCategory,
  MoveId,
  MoveRule,
  TargetScope,
  TypeId,
} from "./types";
import { validateContext } from "./validation";

export const PRODUCTION_MOVE_SELECTABILITY_RULE_ARTIFACT_ID =
  "pokenexus.move-production-selectability.level-up-executable.v1" as const;

export const PRODUCTION_MOVE_SELECTABILITY_RULE_SEMANTICS_HASH =
  "sha256:7ba0e89913bfbeda8caa6b55de0f302a824cd681daa530f9dd27989d0a3e7e51" as const;

export const PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID =
  "spec-012-production-move-support-v1" as const;

export const PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH =
  "sha256:1462b33b35e38224b505240dbf5205104e98dae1310d0bc630e2aa02fb31879e" as const;

export const PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID =
  "pokenexus.production-combat-rule-catalog.v1" as const;

export const PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH =
  "sha256:dead91de25034fb9dbbb36856a4aad4df164074803c357d2c9e00dd3bc7dd7ce" as const;

export const PRODUCTION_COMBAT_GAME_DATA_VERSION = "game-data-core-kanto-johto-v2" as const;

export const PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH =
  "sha256:fc4ecaacb486b496ca2539666201cf73ace40b6ff352f210783a6fadedf052b4" as const;

export const PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID_V2 =
  "spec-012-production-move-support-v2" as const;

export const PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2 =
  "sha256:6a578d7408c79b7984b5b6640be42dbbb43459f859ffe31ce79880d72d159b57" as const;

export const PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID_V2 =
  "pokenexus.production-combat-rule-catalog.v2" as const;

export const PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH_V2 =
  "sha256:6f58481ff9abe468cd12a760f05177ac6f2c322d9308fedab6ca53784010287a" as const;

export const PRODUCTION_COMBAT_GAME_DATA_VERSION_V2 = "game-data-core-kanto-johto-v3" as const;

export const PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V2 =
  "sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559" as const;

export type ProductionCombatRuleCatalogArtifactId =
  | typeof PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID
  | typeof PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID_V2;

export type ProductionCombatRuleCatalogCanonicalHash =
  | typeof PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH
  | typeof PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH_V2;

export type ProductionCombatSupportProfileArtifactId =
  | typeof PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID
  | typeof PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID_V2;

export type ProductionCombatSupportProfileContentHash =
  | typeof PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH
  | typeof PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2;

export type ProductionCombatGameDataVersion =
  | typeof PRODUCTION_COMBAT_GAME_DATA_VERSION
  | typeof PRODUCTION_COMBAT_GAME_DATA_VERSION_V2;

export type ProductionCombatGameDataBundleHash =
  | typeof PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH
  | typeof PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V2;

export type ProductionMoveSupportState = "executable-simple" | "executable-authored" | "unsupported";
export type ProductionAbilitySupportState = "inactive-by-policy" | "executable-authored" | "unsupported";
export type ProductionCooldownProvenance = "za-base-cooldown" | "spec003-power-pp-fallback";

export type ProductionTargetDisposition = {
  readonly disposition: "exact" | "conditional" | "unsupported";
  readonly targetScope?: TargetScope;
  readonly condition?: "offensive-individual-enemy-normalized" | "adjacency-collapse" | "living-active-collapse";
};

export const PRODUCTION_TARGET_DISPOSITIONS_V1 = deepFreeze({
  "any-adjacent": { disposition: "conditional", targetScope: "singleEnemy", condition: "offensive-individual-enemy-normalized" },
  "any-other": { disposition: "conditional", targetScope: "singleEnemy", condition: "offensive-individual-enemy-normalized" },
  "self-or-adjacent-ally": { disposition: "unsupported" },
  "adjacent-ally": { disposition: "conditional", targetScope: "singleAlly", condition: "adjacency-collapse" },
  "adjacent-foe": { disposition: "conditional", targetScope: "singleEnemy", condition: "adjacency-collapse" },
  "all-adjacent": { disposition: "unsupported" },
  "all-adjacent-foes": { disposition: "conditional", targetScope: "allEnemies", condition: "adjacency-collapse" },
  "self-and-allies": { disposition: "exact", targetScope: "allAllies" },
  "all-allies": { disposition: "unsupported" },
  self: { disposition: "exact", targetScope: "self" },
  "all-pokemon": { disposition: "conditional", targetScope: "allActive", condition: "living-active-collapse" },
  "random-opponent": { disposition: "unsupported" },
  "entire-field": { disposition: "unsupported" },
  "opponents-side": { disposition: "unsupported" },
  "users-side": { disposition: "unsupported" },
  varies: { disposition: "unsupported" },
} satisfies Readonly<Record<string, ProductionTargetDisposition>>);

export interface ProductionMoveSupportRecord {
  readonly moveId: MoveId;
  readonly sourceKey: string;
  readonly factualCategory: MoveCategory;
  readonly factualSourceTarget: string;
  readonly support: ProductionMoveSupportState;
  readonly reasonCode: string;
  readonly mechanicsEvidenceHash: string;
  readonly rule?: MoveRule;
  readonly cooldownProvenance?: ProductionCooldownProvenance;
}

export interface ProductionAbilitySupportRecord {
  readonly abilityId: AbilityId;
  readonly sourceKey: string;
  readonly support: ProductionAbilitySupportState;
  readonly reasonCode: string;
}

export interface ProductionCombatRuleCatalog {
  readonly artifactId: ProductionCombatRuleCatalogArtifactId;
  readonly canonicalContentHash: ProductionCombatRuleCatalogCanonicalHash;
  readonly profileArtifactId: ProductionCombatSupportProfileArtifactId;
  readonly profileContentHash: ProductionCombatSupportProfileContentHash;
  readonly gameDataVersion: ProductionCombatGameDataVersion;
  readonly gameDataBundleHash: ProductionCombatGameDataBundleHash;
  readonly targetPolicy: "enemy-normalized-v1";
  readonly abilityPolicy: "all-inactive-by-policy-v1";
  readonly productionSelectabilityRuleArtifact: {
    readonly artifactId: typeof PRODUCTION_MOVE_SELECTABILITY_RULE_ARTIFACT_ID;
    readonly baseEligibilityArtifactId: "pokenexus.move-eligibility.level-up-only.v1";
    readonly semanticHash: typeof PRODUCTION_MOVE_SELECTABILITY_RULE_SEMANTICS_HASH;
    readonly candidatePolicy: "level-up-eligibility-intersect-executable-support";
  };
  readonly moveSupport: readonly ProductionMoveSupportRecord[];
  readonly abilitySupport: readonly ProductionAbilitySupportRecord[];
  readonly moveSupportById: Readonly<Record<string, ProductionMoveSupportRecord>>;
  readonly abilitySupportById: Readonly<Record<string, ProductionAbilitySupportRecord>>;
  readonly moveRules: Readonly<Record<string, MoveRule>>;
  readonly abilityRules: Readonly<Record<string, AbilityRule>>;
  readonly effectRules: Readonly<Record<string, EffectRule>>;
  readonly executableMoveIds: readonly string[];
}

export interface ProductionMoveFact {
  readonly id: string;
  readonly typeId: string;
  readonly category: MoveCategory;
  readonly power: number | null;
  readonly accuracy: number | null;
  readonly basePp: number;
  readonly sourceTarget: string;
  readonly makesContact: boolean;
  readonly zaBaseCooldownMs: number | null;
}

export interface ProductionSpeciesFact {
  readonly id: string;
  readonly abilities: readonly { readonly abilityId: string }[];
}

export interface ProductionAbilityFact {
  readonly id: string;
}

export interface ProductionTypeFact {
  readonly id: string;
}

export interface ProductionCombatGameDataFacts {
  readonly gameDataVersion: string;
  readonly gameDataBundleHash: string;
  readonly species: readonly ProductionSpeciesFact[];
  readonly moves: readonly ProductionMoveFact[];
  readonly abilities: readonly ProductionAbilityFact[];
  readonly types: readonly ProductionTypeFact[];
  readonly learnsets: readonly MoveEligibilityLearnsetEntry[];
}

export type ProductionCoverageBottleneck = "zero-executable" | "one-executable" | null;

export interface ProductionMoveCoverageRow {
  readonly speciesId: string;
  readonly level: number;
  readonly eligibleCount: number;
  readonly executableCount: number;
  readonly progressCapableExecutableCount: number;
  readonly simpleExecutableCount: number;
  readonly authoredExecutableCount: number;
  readonly distinctTargetClasses: number;
  readonly distinctCategoryClasses: number;
  readonly distinctEffectRoleClasses: number;
  readonly bottleneck: ProductionCoverageBottleneck;
}

export interface ProductionMoveCoverageReport {
  readonly profileArtifactId: ProductionCombatSupportProfileArtifactId;
  readonly profileContentHash: ProductionCombatSupportProfileContentHash;
  readonly gameDataVersion: string;
  readonly speciesCount: number;
  readonly rows: readonly ProductionMoveCoverageRow[];
}

const HASH_RE = /^sha256:[0-9a-f]{64}$/u;
const MOVE_SUPPORT_STATES = new Set<ProductionMoveSupportState>([
  "executable-simple",
  "executable-authored",
  "unsupported",
]);
const ABILITY_SUPPORT_STATES = new Set<ProductionAbilitySupportState>([
  "inactive-by-policy",
  "executable-authored",
  "unsupported",
]);
const CATEGORIES = new Set<MoveCategory>(["physical", "special", "status"]);
const TARGET_SCOPES = new Set<TargetScope>(["self", "singleAlly", "singleEnemy", "allAllies", "allEnemies", "allActive"]);
const CRITICAL_POLICIES = new Set(["normal", "always", "never"] as const);
const STAGE_STATS = new Set(["atk", "def", "spa", "spd", "spe"] as const);
const EFFECT_KINDS = new Set(["heal", "statStage", "actionLock", "applyEffect", "removeEffect"] as const);

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be a record`);
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareUtf8Bytes);
  const expected = [...keys].sort(compareUtf8Bytes);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requiredInteger(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function requiredHash(value: unknown, label: string): string {
  const hash = requiredString(value, label);
  if (!HASH_RE.test(hash)) throw new Error(`${label} must be sha256:<lowercase-hex>`);
  return hash;
}

function parseEffectInstruction(value: unknown, label: string): EffectInstruction {
  assertRecord(value, label);
  const kind = requiredString(value.kind, `${label}.kind`);
  if (!EFFECT_KINDS.has(kind as never)) throw new Error(`${label}.kind is unsupported`);
  const scope = requiredString(value.scope, `${label}.scope`);
  if (scope !== "perResolvedTarget" && scope !== "oncePerAction") throw new Error(`${label}.scope is invalid`);
  const target = requiredString(value.target, `${label}.target`);
  if (target !== "self" && target !== "target") throw new Error(`${label}.target is invalid`);
  if (kind === "statStage") {
    assertExactKeys(value, ["kind", "scope", "target", "stat", "delta"], label);
    const stat = requiredString(value.stat, `${label}.stat`);
    if (!STAGE_STATS.has(stat as never)) throw new Error(`${label}.stat is invalid`);
    if (typeof value.delta !== "number" || !Number.isSafeInteger(value.delta) || value.delta === 0) {
      throw new Error(`${label}.delta is invalid`);
    }
    return { kind, scope, target, stat: stat as never, delta: value.delta };
  }
  if (kind === "heal") {
    assertExactKeys(value, ["kind", "scope", "target", "magnitude"], label);
    assertRecord(value.magnitude, `${label}.magnitude`);
    if (value.magnitude.kind === "integer") {
      assertExactKeys(value.magnitude, ["kind", "amount"], `${label}.magnitude`);
      return { kind, scope, target, magnitude: { kind: "integer", amount: requiredInteger(value.magnitude.amount, `${label}.magnitude.amount`, 1) } };
    }
    if (value.magnitude.kind === "maxHpFraction") {
      assertExactKeys(value.magnitude, ["kind", "numerator", "denominator"], `${label}.magnitude`);
      return {
        kind,
        scope,
        target,
        magnitude: {
          kind: "maxHpFraction",
          numerator: requiredInteger(value.magnitude.numerator, `${label}.magnitude.numerator`, 1),
          denominator: requiredInteger(value.magnitude.denominator, `${label}.magnitude.denominator`, 1),
        },
      };
    }
    throw new Error(`${label}.magnitude is invalid`);
  }
  if (kind === "actionLock") {
    assertExactKeys(value, ["kind", "scope", "target", "durationMs", "lifetimeScope"], label);
    const lifetimeScope = requiredString(value.lifetimeScope, `${label}.lifetimeScope`);
    if (lifetimeScope !== "battle" && lifetimeScope !== "cadence") throw new Error(`${label}.lifetimeScope is invalid`);
    return { kind, scope, target, durationMs: requiredInteger(value.durationMs, `${label}.durationMs`, 1), lifetimeScope };
  }
  assertExactKeys(value, ["kind", "scope", "target", "effectId"], label);
  return { kind, scope, target, effectId: requiredString(value.effectId, `${label}.effectId`) as never } as EffectInstruction;
}

function parseMoveRule(value: unknown, label: string): MoveRule {
  assertRecord(value, label);
  const allowedKeys = ["moveId", "typeId", "category", "targetScope", "moveCooldownMs", "power", "accuracy", "criticalPolicy", "makesContact", "effects"];
  for (const key of Object.keys(value)) if (!allowedKeys.includes(key)) throw new Error(`${label}.${key} is not allowed`);
  const moveId = requiredString(value.moveId, `${label}.moveId`) as MoveId;
  const category = requiredString(value.category, `${label}.category`) as MoveCategory;
  if (!CATEGORIES.has(category)) throw new Error(`${label}.category is invalid`);
  const targetScope = requiredString(value.targetScope, `${label}.targetScope`) as TargetScope;
  if (!TARGET_SCOPES.has(targetScope)) throw new Error(`${label}.targetScope is invalid`);
  const rule: MoveRule = {
    moveId,
    category,
    targetScope,
    moveCooldownMs: requiredInteger(value.moveCooldownMs, `${label}.moveCooldownMs`, 2_000),
  };
  if (value.typeId !== undefined) rule.typeId = requiredString(value.typeId, `${label}.typeId`) as TypeId;
  if (value.power !== undefined) rule.power = requiredInteger(value.power, `${label}.power`, 1);
  if (value.accuracy !== undefined) {
    if (value.accuracy === "always") rule.accuracy = "always";
    else rule.accuracy = requiredInteger(value.accuracy, `${label}.accuracy`, 1);
  }
  if (value.criticalPolicy !== undefined) {
    if (!CRITICAL_POLICIES.has(value.criticalPolicy as never)) throw new Error(`${label}.criticalPolicy is invalid`);
    rule.criticalPolicy = value.criticalPolicy as never;
  }
  if (value.makesContact !== undefined) {
    if (typeof value.makesContact !== "boolean") throw new Error(`${label}.makesContact must be boolean`);
    rule.makesContact = value.makesContact;
  }
  if (value.effects !== undefined) {
    if (!Array.isArray(value.effects) || value.effects.length === 0) throw new Error(`${label}.effects must be non-empty`);
    rule.effects = value.effects.map((effect, index) => parseEffectInstruction(effect, `${label}.effects[${index}]`));
  }
  return rule;
}

function parseMoveSupport(value: unknown, index: number): ProductionMoveSupportRecord {
  const label = `moves[${index}]`;
  assertRecord(value, label);
  const support = requiredString(value.support, `${label}.support`) as ProductionMoveSupportState;
  if (!MOVE_SUPPORT_STATES.has(support)) throw new Error(`${label}.support is invalid`);
  const executable = support !== "unsupported";
  assertExactKeys(
    value,
    executable
      ? ["moveId", "sourceKey", "factualCategory", "factualSourceTarget", "support", "reasonCode", "mechanicsEvidenceHash", "rule", "cooldownProvenance"]
      : ["moveId", "sourceKey", "factualCategory", "factualSourceTarget", "support", "reasonCode", "mechanicsEvidenceHash"],
    label,
  );
  const factualCategory = requiredString(value.factualCategory, `${label}.factualCategory`) as MoveCategory;
  if (!CATEGORIES.has(factualCategory)) throw new Error(`${label}.factualCategory is invalid`);
  const baseRecord = {
    moveId: requiredString(value.moveId, `${label}.moveId`) as MoveId,
    sourceKey: requiredString(value.sourceKey, `${label}.sourceKey`),
    factualCategory,
    factualSourceTarget: requiredString(value.factualSourceTarget, `${label}.factualSourceTarget`),
    support,
    reasonCode: requiredString(value.reasonCode, `${label}.reasonCode`),
    mechanicsEvidenceHash: requiredHash(value.mechanicsEvidenceHash, `${label}.mechanicsEvidenceHash`),
  };
  if (!executable) return baseRecord;
  const cooldownProvenance = requiredString(value.cooldownProvenance, `${label}.cooldownProvenance`) as ProductionCooldownProvenance;
  if (cooldownProvenance !== "za-base-cooldown" && cooldownProvenance !== "spec003-power-pp-fallback") {
    throw new Error(`${label}.cooldownProvenance is invalid`);
  }
  return {
    ...baseRecord,
    rule: parseMoveRule(value.rule, `${label}.rule`),
    cooldownProvenance,
  };
}

function parseAbilitySupport(value: unknown, index: number): ProductionAbilitySupportRecord {
  const label = `abilities[${index}]`;
  assertRecord(value, label);
  assertExactKeys(value, ["abilityId", "sourceKey", "support", "reasonCode"], label);
  const support = requiredString(value.support, `${label}.support`) as ProductionAbilitySupportState;
  if (!ABILITY_SUPPORT_STATES.has(support)) throw new Error(`${label}.support is invalid`);
  return {
    abilityId: requiredString(value.abilityId, `${label}.abilityId`) as AbilityId,
    sourceKey: requiredString(value.sourceKey, `${label}.sourceKey`),
    support,
    reasonCode: requiredString(value.reasonCode, `${label}.reasonCode`),
  };
}

function countBy<T extends string>(values: readonly T[]): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function exactCount(record: Record<string, unknown>, key: string, expected: number, label: string): void {
  if (requiredInteger(record[key], `${label}.${key}`) !== expected) throw new Error(`${label}.${key} does not match materialized content`);
}

interface ProductionCombatReleaseIdentity {
  readonly catalogArtifactId: ProductionCombatRuleCatalogArtifactId;
  readonly catalogCanonicalHash: ProductionCombatRuleCatalogCanonicalHash;
  readonly profileArtifactId: ProductionCombatSupportProfileArtifactId;
  readonly profileContentHash: ProductionCombatSupportProfileContentHash;
  readonly gameDataVersion: ProductionCombatGameDataVersion;
  readonly gameDataBundleHash: ProductionCombatGameDataBundleHash;
}

const PRODUCTION_COMBAT_RELEASE_V1: ProductionCombatReleaseIdentity = {
  catalogArtifactId: PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID,
  catalogCanonicalHash: PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH,
  profileArtifactId: PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID,
  profileContentHash: PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH,
  gameDataVersion: PRODUCTION_COMBAT_GAME_DATA_VERSION,
  gameDataBundleHash: PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH,
};

const PRODUCTION_COMBAT_RELEASE_V2: ProductionCombatReleaseIdentity = {
  catalogArtifactId: PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID_V2,
  catalogCanonicalHash: PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH_V2,
  profileArtifactId: PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID_V2,
  profileContentHash: PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2,
  gameDataVersion: PRODUCTION_COMBAT_GAME_DATA_VERSION_V2,
  gameDataBundleHash: PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V2,
};

function materializeProductionCombatRuleCatalog(
  value: unknown,
  identity: ProductionCombatReleaseIdentity,
): ProductionCombatRuleCatalog {
  assertRecord(value, "profile");
  assertExactKeys(value, [
    "schemaVersion", "status", "gameDataVersion", "gameDataBundleHash", "rulesContract", "targetPolicy", "abilityPolicy",
    "mechanicsAdvisoryEvidence", "classificationCount", "supportCounts", "unsupportedReasonCounts", "moves",
    "productionSelectabilityRuleArtifact", "abilityCount", "abilitySupportCounts", "abilities",
  ], "profile");
  if (value.schemaVersion !== identity.profileArtifactId) throw new Error("production profile schemaVersion mismatch");
  if (value.status !== "APPROVED" || value.rulesContract !== "SPEC-012") throw new Error("production profile is not the accepted SPEC-012 artifact");
  if (value.gameDataVersion !== identity.gameDataVersion) throw new Error("production profile gameDataVersion mismatch");
  if (value.gameDataBundleHash !== identity.gameDataBundleHash) throw new Error("production profile gameDataBundleHash mismatch");
  if (value.targetPolicy !== "enemy-normalized-v1" || value.abilityPolicy !== "all-inactive-by-policy-v1") {
    throw new Error("production profile policy mismatch");
  }
  if (!Array.isArray(value.moves) || !Array.isArray(value.abilities)) throw new Error("production profile support inventories must be arrays");
  const moveSupport = value.moves.map(parseMoveSupport).sort((left, right) => compareUtf8Bytes(left.moveId, right.moveId));
  const abilitySupport = value.abilities.map(parseAbilitySupport).sort((left, right) => compareUtf8Bytes(left.abilityId, right.abilityId));
  if (requiredInteger(value.classificationCount, "classificationCount") !== moveSupport.length || moveSupport.length !== 453) {
    throw new Error("production Move support universe must contain exactly 453 records");
  }
  if (requiredInteger(value.abilityCount, "abilityCount") !== abilitySupport.length || abilitySupport.length !== 147) {
    throw new Error("production Ability support universe must contain exactly 147 records");
  }
  const moveSupportById = new Map<string, ProductionMoveSupportRecord>();
  for (const record of moveSupport) {
    if (moveSupportById.has(record.moveId)) throw new Error(`duplicate production Move support: ${record.moveId}`);
    moveSupportById.set(record.moveId, record);
  }
  const abilitySupportById = new Map<string, ProductionAbilitySupportRecord>();
  for (const record of abilitySupport) {
    if (abilitySupportById.has(record.abilityId)) throw new Error(`duplicate production Ability support: ${record.abilityId}`);
    abilitySupportById.set(record.abilityId, record);
  }
  assertRecord(value.supportCounts, "supportCounts");
  assertExactKeys(value.supportCounts, ["executable-authored", "executable-simple", "unsupported"], "supportCounts");
  const moveCounts = countBy(moveSupport.map(({ support }) => support));
  exactCount(value.supportCounts, "executable-simple", moveCounts["executable-simple"] ?? 0, "supportCounts");
  exactCount(value.supportCounts, "executable-authored", moveCounts["executable-authored"] ?? 0, "supportCounts");
  exactCount(value.supportCounts, "unsupported", moveCounts.unsupported ?? 0, "supportCounts");
  if ((moveCounts["executable-simple"] ?? 0) !== 27 || (moveCounts["executable-authored"] ?? 0) !== 18 || (moveCounts.unsupported ?? 0) !== 408) {
    throw new Error("production Move support counts do not match accepted 27/18/408 profile");
  }
  assertRecord(value.abilitySupportCounts, "abilitySupportCounts");
  assertExactKeys(value.abilitySupportCounts, ["inactive-by-policy"], "abilitySupportCounts");
  const abilityCounts = countBy(abilitySupport.map(({ support }) => support));
  exactCount(value.abilitySupportCounts, "inactive-by-policy", abilityCounts["inactive-by-policy"] ?? 0, "abilitySupportCounts");
  if ((abilityCounts["inactive-by-policy"] ?? 0) !== 147 || abilitySupport.some(({ support }) => support !== "inactive-by-policy")) {
    throw new Error("all 147 production Abilities must be inactive-by-policy");
  }
  assertRecord(value.unsupportedReasonCounts, "unsupportedReasonCounts");
  const unsupportedReasonCounts = countBy(
    moveSupport.filter(({ support }) => support === "unsupported").map(({ reasonCode }) => reasonCode),
  );
  assertExactKeys(value.unsupportedReasonCounts, Object.keys(unsupportedReasonCounts), "unsupportedReasonCounts");
  for (const [reasonCode, count] of Object.entries(unsupportedReasonCounts)) {
    exactCount(value.unsupportedReasonCounts, reasonCode, count, "unsupportedReasonCounts");
  }
  assertRecord(value.productionSelectabilityRuleArtifact, "productionSelectabilityRuleArtifact");
  assertExactKeys(value.productionSelectabilityRuleArtifact, ["artifactId", "baseEligibilityArtifactId", "semanticHash", "candidatePolicy"], "productionSelectabilityRuleArtifact");
  if (
    value.productionSelectabilityRuleArtifact.artifactId !== PRODUCTION_MOVE_SELECTABILITY_RULE_ARTIFACT_ID
    || value.productionSelectabilityRuleArtifact.baseEligibilityArtifactId !== "pokenexus.move-eligibility.level-up-only.v1"
    || value.productionSelectabilityRuleArtifact.semanticHash !== PRODUCTION_MOVE_SELECTABILITY_RULE_SEMANTICS_HASH
    || value.productionSelectabilityRuleArtifact.candidatePolicy !== "level-up-eligibility-intersect-executable-support"
  ) throw new Error("production selectability artifact mismatch");

  const moveSupportIndex = Object.create(null) as Record<string, ProductionMoveSupportRecord>;
  const abilitySupportIndex = Object.create(null) as Record<string, ProductionAbilitySupportRecord>;
  for (const record of moveSupport) moveSupportIndex[record.moveId] = record;
  for (const record of abilitySupport) abilitySupportIndex[record.abilityId] = record;
  const moveRules = Object.create(null) as Record<string, MoveRule>;
  for (const record of moveSupport) {
    if (record.support === "unsupported") continue;
    if (!record.rule || record.rule.moveId !== record.moveId) throw new Error(`production MoveRule mismatch: ${record.moveId}`);
    const disposition = PRODUCTION_TARGET_DISPOSITIONS_V1[record.factualSourceTarget as keyof typeof PRODUCTION_TARGET_DISPOSITIONS_V1];
    if (!disposition || disposition.disposition === "unsupported" || disposition.targetScope !== record.rule.targetScope) {
      throw new Error(`production target mapping mismatch: ${record.moveId}`);
    }
    moveRules[record.moveId] = record.rule;
  }
  const structuralError = validateContext({
    gameDataVersion: identity.gameDataVersion as never,
    rulesVersion: identity.profileArtifactId as never,
    combatEventSchemaVersion: "production-rule-catalog-validation" as never,
    moveRules,
    abilityRules: {},
    effectRules: {},
    typeChart: {},
  });
  if (structuralError) throw new Error(`production combat rule catalog is structurally invalid: ${structuralError}`);
  return deepFreeze({
    artifactId: identity.catalogArtifactId,
    canonicalContentHash: identity.catalogCanonicalHash,
    profileArtifactId: identity.profileArtifactId,
    profileContentHash: identity.profileContentHash,
    gameDataVersion: identity.gameDataVersion,
    gameDataBundleHash: identity.gameDataBundleHash,
    targetPolicy: "enemy-normalized-v1" as const,
    abilityPolicy: "all-inactive-by-policy-v1" as const,
    productionSelectabilityRuleArtifact: Object.freeze({
      artifactId: PRODUCTION_MOVE_SELECTABILITY_RULE_ARTIFACT_ID,
      baseEligibilityArtifactId: "pokenexus.move-eligibility.level-up-only.v1" as const,
      semanticHash: PRODUCTION_MOVE_SELECTABILITY_RULE_SEMANTICS_HASH,
      candidatePolicy: "level-up-eligibility-intersect-executable-support" as const,
    }),
    moveSupport,
    abilitySupport,
    moveSupportById: moveSupportIndex,
    abilitySupportById: abilitySupportIndex,
    moveRules,
    abilityRules: {},
    effectRules: {},
    executableMoveIds: Object.keys(moveRules).sort(compareUtf8Bytes),
  });
}

export const PRODUCTION_COMBAT_RULE_CATALOG_V1 = materializeProductionCombatRuleCatalog(
  rawProductionMoveSupportProfileV1 as unknown,
  PRODUCTION_COMBAT_RELEASE_V1,
);

export const PRODUCTION_COMBAT_RULE_CATALOG_V2 = materializeProductionCombatRuleCatalog(
  rawProductionMoveSupportProfileV2 as unknown,
  PRODUCTION_COMBAT_RELEASE_V2,
);

function exactUniverse(label: string, expected: ReadonlySet<string>, actual: Readonly<Record<string, unknown>>): void {
  const actualIds = Object.keys(actual);
  if (expected.size !== actualIds.length) throw new Error(`${label} support universe size mismatch`);
  for (const id of expected) if (!Object.prototype.hasOwnProperty.call(actual, id)) throw new Error(`${label} support is missing ${id}`);
  for (const id of actualIds) if (!expected.has(id)) throw new Error(`${label} support contains unknown ${id}`);
}

export function validateProductionCombatRuleCatalogAgainstGameData(
  catalog: ProductionCombatRuleCatalog,
  data: ProductionCombatGameDataFacts,
): void {
  if (data.gameDataVersion !== catalog.gameDataVersion) throw new Error("production catalog gameDataVersion mismatch");
  if (data.gameDataBundleHash !== catalog.gameDataBundleHash) throw new Error("production catalog gameDataBundleHash mismatch");
  const movesById = new Map(data.moves.map((move) => [move.id, move]));
  if (movesById.size !== data.moves.length) throw new Error("paired game data contains duplicate MoveId");
  const abilitiesById = new Map(data.abilities.map((ability) => [ability.id, ability]));
  if (abilitiesById.size !== data.abilities.length) throw new Error("paired game data contains duplicate AbilityId");
  const typeIds = new Set(data.types.map(({ id }) => id));
  if (typeIds.size !== data.types.length) throw new Error("paired game data contains duplicate TypeId");
  const levelUpMoveIds = new Set(data.learnsets.filter(({ method }) => method === "level-up").map(({ moveId }) => moveId));
  const referencedAbilityIds = new Set(data.species.flatMap(({ abilities }) => abilities.map(({ abilityId }) => abilityId)));
  exactUniverse("Move", levelUpMoveIds, catalog.moveSupportById);
  exactUniverse("Ability", referencedAbilityIds, catalog.abilitySupportById);
  for (const record of catalog.moveSupport) {
    const fact = movesById.get(record.moveId);
    if (!fact) throw new Error(`production Move support references unresolved MoveId: ${record.moveId}`);
    if (fact.category !== record.factualCategory || fact.sourceTarget !== record.factualSourceTarget) {
      throw new Error(`production Move support factual snapshot mismatch: ${record.moveId}`);
    }
    if (record.support === "unsupported") continue;
    const rule = record.rule;
    if (!rule) throw new Error(`production executable Move is missing MoveRule: ${record.moveId}`);
    if (rule.typeId !== fact.typeId || rule.category !== fact.category || rule.makesContact !== fact.makesContact) {
      throw new Error(`production MoveRule factual fields mismatch: ${record.moveId}`);
    }
    if (!rule.typeId || !typeIds.has(rule.typeId)) {
      throw new Error(`production MoveRule references unresolved TypeId: ${record.moveId}`);
    }
    if (
      (fact.power === null && rule.power !== undefined)
      || (fact.power !== null && rule.power !== fact.power)
    ) {
      throw new Error(`production MoveRule factual power mismatch: ${record.moveId}`);
    }
    if (
      (fact.accuracy === null && rule.accuracy !== "always")
      || (fact.accuracy !== null && rule.accuracy !== fact.accuracy)
    ) {
      throw new Error(`production MoveRule factual accuracy mismatch: ${record.moveId}`);
    }
    if (record.support === "executable-simple") {
      if (fact.category === "status" || fact.power === null || fact.accuracy === null || rule.power !== fact.power) {
        throw new Error(`production simple MoveRule scalar mismatch: ${record.moveId}`);
      }
      if (rule.effects !== undefined) throw new Error(`production simple MoveRule cannot carry authored effects: ${record.moveId}`);
    }
    if (record.cooldownProvenance === "za-base-cooldown") {
      if (fact.zaBaseCooldownMs === null || rule.moveCooldownMs !== fact.zaBaseCooldownMs) {
        throw new Error(`production MoveRule Z-A cooldown mismatch: ${record.moveId}`);
      }
    } else if (record.cooldownProvenance === "spec003-power-pp-fallback") {
      const expected = fact.power === null ? undefined : deriveSimpleDamageMoveCooldownMs(fact.power, fact.basePp);
      if (expected === undefined || rule.moveCooldownMs !== expected) {
        throw new Error(`production MoveRule fallback cooldown mismatch: ${record.moveId}`);
      }
    } else {
      throw new Error(`production executable Move is missing cooldown provenance: ${record.moveId}`);
    }
  }
  for (const record of catalog.abilitySupport) {
    if (!abilitiesById.has(record.abilityId)) throw new Error(`production Ability support references unresolved AbilityId: ${record.abilityId}`);
    if (record.support === "inactive-by-policy" && Object.prototype.hasOwnProperty.call(catalog.abilityRules, record.abilityId)) {
      throw new Error(`inactive production Ability materialized an AbilityRule: ${record.abilityId}`);
    }
  }
}

export function isProductionMoveExecutable(catalog: ProductionCombatRuleCatalog, moveId: string): boolean {
  const support = catalog.moveSupportById[moveId];
  return support?.support === "executable-simple" || support?.support === "executable-authored";
}

export function assertProductionMoveLoadoutExecutable(
  catalog: ProductionCombatRuleCatalog,
  moveIds: readonly string[],
): void {
  for (const moveId of moveIds) {
    if (!isProductionMoveExecutable(catalog, moveId)) throw new Error(`Move is not executable in the production rules context: ${moveId}`);
  }
}

export interface ProductionBattleAbilityBinding {
  readonly abilityId?: AbilityId;
  readonly abilityRule?: AbilityRule;
}

const INACTIVE_PRODUCTION_ABILITY_BINDING = deepFreeze({} satisfies ProductionBattleAbilityBinding);

export function resolveProductionBattleAbility(
  catalog: ProductionCombatRuleCatalog,
  selectedAbilityId: string | null,
): ProductionBattleAbilityBinding {
  if (selectedAbilityId === null) return INACTIVE_PRODUCTION_ABILITY_BINDING;
  const support = catalog.abilitySupportById[selectedAbilityId];
  if (!support) throw new Error(`Ability is not present in the production support universe: ${selectedAbilityId}`);
  if (support.support === "inactive-by-policy") return INACTIVE_PRODUCTION_ABILITY_BINDING;
  if (support.support === "unsupported") throw new Error(`Ability is unsupported in the production rules context: ${selectedAbilityId}`);
  const abilityRule = catalog.abilityRules[selectedAbilityId];
  if (!abilityRule) throw new Error(`Executable production Ability is missing AbilityRule: ${selectedAbilityId}`);
  return deepFreeze({ abilityId: support.abilityId, abilityRule });
}

export function resolveProductionAbilityRuleForBattle(
  catalog: ProductionCombatRuleCatalog,
  selectedAbilityId: string | null,
): AbilityRule | undefined {
  return resolveProductionBattleAbility(catalog, selectedAbilityId).abilityRule;
}

function effectRoles(rule: MoveRule): readonly string[] {
  const roles = new Set<string>();
  if (rule.category === "physical" || rule.category === "special") roles.add("direct-damage");
  for (const effect of rule.effects ?? []) {
    if (effect.kind === "heal") roles.add("healing");
    else if (effect.kind === "statStage") roles.add(effect.delta > 0 ? "stat-buff" : "stat-debuff");
    else if (effect.kind === "actionLock") roles.add("action-lock");
    else if (effect.kind === "applyEffect") roles.add("effect-apply");
    else roles.add("effect-remove");
  }
  return [...roles].sort(compareUtf8Bytes);
}

export function buildProductionMoveCoverageReport(input: {
  readonly catalog: ProductionCombatRuleCatalog;
  readonly gameDataVersion: string;
  readonly species: readonly { readonly id: string }[];
  readonly learnsets: readonly MoveEligibilityLearnsetEntry[];
}): ProductionMoveCoverageReport {
  if (input.gameDataVersion !== input.catalog.gameDataVersion) {
    throw new Error("production coverage gameDataVersion mismatch");
  }
  const speciesIds = [...input.species.map(({ id }) => id)].sort(compareUtf8Bytes);
  if (new Set(speciesIds).size !== speciesIds.length) throw new Error("coverage input contains duplicate SpeciesId");
  if (speciesIds.length !== 293) throw new Error("production coverage must include exactly 293 Species/forms");
  const speciesIdSet = new Set(speciesIds);
  for (const row of input.learnsets) {
    if (!speciesIdSet.has(row.speciesId)) throw new Error(`production coverage learnset references unresolved SpeciesId: ${row.speciesId}`);
    if (row.method === "level-up" && !Object.prototype.hasOwnProperty.call(input.catalog.moveSupportById, row.moveId)) {
      throw new Error(`production coverage level-up row references MoveId outside support universe: ${row.moveId}`);
    }
  }
  const rows: ProductionMoveCoverageRow[] = [];
  for (const speciesId of speciesIds) {
    const speciesRows = input.learnsets.filter((row) => row.speciesId === speciesId);
    const thresholds = new Set<number>([1]);
    for (const row of speciesRows) if (row.method === "level-up" && row.level !== null) thresholds.add(row.level);
    for (const level of [...thresholds].sort((left, right) => left - right)) {
      const eligible = deriveLevelAvailableMoves({ speciesId, currentLevel: level, learnset: speciesRows });
      const executable = eligible.filter(({ moveId }) => isProductionMoveExecutable(input.catalog, moveId));
      const simpleExecutableCount = executable.filter(({ moveId }) => input.catalog.moveSupportById[moveId]?.support === "executable-simple").length;
      const authoredExecutableCount = executable.filter(({ moveId }) => input.catalog.moveSupportById[moveId]?.support === "executable-authored").length;
      const executableRules = executable.map(({ moveId }) => input.catalog.moveRules[moveId]).filter((rule): rule is MoveRule => rule !== undefined);
      const progressCapableExecutableCount = executableRules.filter((rule) =>
        (rule.category === "physical" || rule.category === "special") && (rule.power ?? 0) > 0).length;
      const targetClasses = new Set(executableRules.map(({ targetScope }) => targetScope));
      const categoryClasses = new Set(executableRules.map(({ category }) => category));
      const roleClasses = new Set(executableRules.flatMap((rule) => effectRoles(rule)));
      rows.push({
        speciesId,
        level,
        eligibleCount: eligible.length,
        executableCount: executable.length,
        progressCapableExecutableCount,
        simpleExecutableCount,
        authoredExecutableCount,
        distinctTargetClasses: targetClasses.size,
        distinctCategoryClasses: categoryClasses.size,
        distinctEffectRoleClasses: roleClasses.size,
        bottleneck: executable.length === 0 ? "zero-executable" : executable.length === 1 ? "one-executable" : null,
      });
    }
  }
  return Object.freeze({
    profileArtifactId: input.catalog.profileArtifactId,
    profileContentHash: input.catalog.profileContentHash,
    gameDataVersion: input.gameDataVersion,
    speciesCount: speciesIds.length,
    rows: Object.freeze(rows),
  });
}

export function canonicalSerializeProductionCombatRuleCatalog(catalog: ProductionCombatRuleCatalog): string {
  const canonical = (value: unknown): string => {
    if (value === null) return "null";
    if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
    if (typeof value === "boolean") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("canonical production catalog cannot contain non-finite numbers");
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    assertRecord(value, "canonical value");
    const normalizedKeys = Object.keys(value).map((sourceKey) => ({ sourceKey, normalizedKey: sourceKey.normalize("NFC") }));
    if (new Set(normalizedKeys.map(({ normalizedKey }) => normalizedKey)).size !== normalizedKeys.length) {
      throw new Error("canonical production catalog contains duplicate NFC-normalized object keys");
    }
    normalizedKeys.sort((left, right) => compareUtf8Bytes(left.normalizedKey, right.normalizedKey));
    return `{${normalizedKeys.map(({ sourceKey, normalizedKey }) => `${JSON.stringify(normalizedKey)}:${canonical(value[sourceKey])}`).join(",")}}`;
  };
  const moveSupport = [...catalog.moveSupport].sort((left, right) => compareUtf8Bytes(left.moveId, right.moveId));
  const abilitySupport = [...catalog.abilitySupport].sort((left, right) => compareUtf8Bytes(left.abilityId, right.abilityId));
  return canonical({
    artifactId: catalog.artifactId,
    profileArtifactId: catalog.profileArtifactId,
    profileContentHash: catalog.profileContentHash,
    gameDataVersion: catalog.gameDataVersion,
    gameDataBundleHash: catalog.gameDataBundleHash,
    targetPolicy: catalog.targetPolicy,
    targetDispositions: PRODUCTION_TARGET_DISPOSITIONS_V1,
    abilityPolicy: catalog.abilityPolicy,
    productionSelectabilityRuleArtifact: catalog.productionSelectabilityRuleArtifact,
    moveSupport,
    abilitySupport,
    moveRules: catalog.moveRules,
    abilityRules: catalog.abilityRules,
    effectRules: catalog.effectRules,
  });
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)));
  return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function hashCanonicalProductionCombatRuleCatalog(
  catalog: ProductionCombatRuleCatalog,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSerializeProductionCombatRuleCatalog(catalog));
  return sha256Bytes(bytes);
}

export function validateProductionCombatSupportProfile(value: unknown): void {
  materializeProductionCombatRuleCatalog(value, PRODUCTION_COMBAT_RELEASE_V1);
}

export function validateProductionCombatSupportProfileV2(value: unknown): void {
  materializeProductionCombatRuleCatalog(value, PRODUCTION_COMBAT_RELEASE_V2);
}

export async function loadApprovedProductionCombatRuleCatalogV1(
  bytes: Uint8Array,
): Promise<ProductionCombatRuleCatalog> {
  if (await sha256Bytes(bytes) !== PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH) {
    throw new Error("production combat support profile content hash mismatch");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const catalog = materializeProductionCombatRuleCatalog(
    JSON.parse(text) as unknown,
    PRODUCTION_COMBAT_RELEASE_V1,
  );
  if (await hashCanonicalProductionCombatRuleCatalog(catalog) !== PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH) {
    throw new Error("production combat rule catalog canonical hash mismatch");
  }
  return catalog;
}

export async function loadApprovedProductionCombatRuleCatalogV2(
  bytes: Uint8Array,
): Promise<ProductionCombatRuleCatalog> {
  if (await sha256Bytes(bytes) !== PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2) {
    throw new Error("production combat support profile content hash mismatch");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const catalog = materializeProductionCombatRuleCatalog(
    JSON.parse(text) as unknown,
    PRODUCTION_COMBAT_RELEASE_V2,
  );
  if (await hashCanonicalProductionCombatRuleCatalog(catalog) !== PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH_V2) {
    throw new Error("production combat rule catalog canonical hash mismatch");
  }
  return catalog;
}
