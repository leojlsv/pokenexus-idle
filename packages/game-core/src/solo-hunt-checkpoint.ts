import {
  advanceSoloHuntToCutoff,
  type AdvanceSoloHuntResult,
  type SoloHuntRuntimeInputs,
  type SoloHuntRuntimeState,
  type SoloHuntSimulationEvent,
} from "./solo-hunt";
import {
  ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
  GENETIC_PROFILES,
} from "./encounter-individualization";
import { assertHuntAutomationPolicyAuthoritySnapshot } from "./hunt-automation-policy";
import { validateRngState } from "./rng";
import type { DeterministicRngState } from "./types";

export const SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V1 = "pokenexus.solo-hunt-checkpoint.v1" as const;
export const SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2 = "pokenexus.solo-hunt-checkpoint.v2" as const;
export const SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3 = "pokenexus.solo-hunt-checkpoint.v3" as const;
export const SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4 = "pokenexus.solo-hunt-checkpoint.v4" as const;
export const SOLO_HUNT_DEFAULT_SEGMENT_MS = 60 * 60 * 1000;

const GENETIC_GRADES = ["Normal", "Uncommon", "Rare", "Epic", "Apex"] as const;

type CanonicalValue =
  | readonly ["null"]
  | readonly ["undefined"]
  | readonly ["boolean", boolean]
  | readonly ["number", number]
  | readonly ["string", string]
  | readonly ["bigint", string]
  | readonly ["array", readonly CanonicalValue[]]
  | readonly ["object", readonly (readonly [string, CanonicalValue])[]];

function canonicalize(value: unknown): CanonicalValue {
  if (value === null) return ["null"];
  if (value === undefined) return ["undefined"];
  if (typeof value === "boolean") return ["boolean", value];
  if (typeof value === "string") return ["string", value];
  if (typeof value === "bigint") return ["bigint", value.toString(10)];
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Solo Hunt checkpoint cannot encode non-finite numbers");
    return ["number", Object.is(value, -0) ? 0 : value];
  }
  if (Array.isArray(value)) return ["array", value.map((entry) => canonicalize(entry))];
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Solo Hunt checkpoint can encode only plain deterministic objects");
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => [key, canonicalize(entry)] as const);
    return ["object", entries];
  }
  throw new Error(`Solo Hunt checkpoint cannot encode ${typeof value}`);
}

function isCanonicalTuple(value: unknown): value is unknown[] {
  return Array.isArray(value) && typeof value[0] === "string";
}

function decanonicalize(value: unknown): unknown {
  if (!isCanonicalTuple(value)) throw new Error("Malformed Solo Hunt checkpoint canonical value");
  switch (value[0]) {
    case "null":
      if (value.length !== 1) throw new Error("Malformed null checkpoint value");
      return null;
    case "undefined":
      if (value.length !== 1) throw new Error("Malformed undefined checkpoint value");
      return undefined;
    case "boolean":
      if (value.length !== 2 || typeof value[1] !== "boolean") throw new Error("Malformed boolean checkpoint value");
      return value[1];
    case "number":
      if (value.length !== 2 || typeof value[1] !== "number" || !Number.isFinite(value[1])) {
        throw new Error("Malformed number checkpoint value");
      }
      return value[1];
    case "string":
      if (value.length !== 2 || typeof value[1] !== "string") throw new Error("Malformed string checkpoint value");
      return value[1];
    case "bigint":
      if (value.length !== 2 || typeof value[1] !== "string" || !/^-?(0|[1-9]\d*)$/.test(value[1])) {
        throw new Error("Malformed bigint checkpoint value");
      }
      return BigInt(value[1]);
    case "array":
      if (value.length !== 2 || !Array.isArray(value[1])) throw new Error("Malformed array checkpoint value");
      return value[1].map((entry) => decanonicalize(entry));
    case "object": {
      if (value.length !== 2 || !Array.isArray(value[1])) throw new Error("Malformed object checkpoint value");
      const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      let previous: string | undefined;
      for (const entry of value[1]) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") {
          throw new Error("Malformed object checkpoint entry");
        }
        if (previous !== undefined && entry[0] <= previous) {
          throw new Error("Solo Hunt checkpoint object keys are not canonical");
        }
        previous = entry[0];
        output[entry[0]] = decanonicalize(entry[1]);
      }
      return output;
    }
    default:
      throw new Error("Unknown Solo Hunt checkpoint canonical value tag");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Solo Hunt checkpoint ${label} must be an object`);
}

function assertAllowedKeys(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(record).find((key) => !allowedSet.has(key));
  if (unknown !== undefined) {
    throw new Error(`Solo Hunt checkpoint ${label} has unknown field ${unknown}`);
  }
}

function assertNonEmptyString(record: Record<string, unknown>, key: string, label: string): void {
  if (typeof record[key] !== "string" || record[key].length === 0) {
    throw new Error(`Solo Hunt checkpoint ${label} has invalid ${key}`);
  }
}

function assertNonNegativeSafeInteger(record: Record<string, unknown>, key: string, label: string): void {
  if (!Number.isSafeInteger(record[key]) || (record[key] as number) < 0) {
    throw new Error(`Solo Hunt checkpoint ${label} has invalid ${key}`);
  }
}

function assertFiniteNumber(record: Record<string, unknown>, key: string, label: string): void {
  if (typeof record[key] !== "number" || !Number.isFinite(record[key])) {
    throw new Error(`Solo Hunt checkpoint ${label} has invalid ${key}`);
  }
}

function assertStringArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.length > 0)) {
    throw new Error(`Solo Hunt checkpoint ${label} must be a string array`);
  }
}

function assertRecordArray(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(`Solo Hunt checkpoint ${label} must be an object array`);
  }
}

function assertStatBlock(value: unknown, label: string): void {
  assertRecord(value, label);
  assertAllowedKeys(value, ["hp", "atk", "def", "spa", "spd", "spe"], label);
  for (const stat of ["hp", "atk", "def", "spa", "spd", "spe"] as const) {
    assertFiniteNumber(value, stat, label);
  }
}

function assertNumericRecord(value: unknown, label: string): void {
  assertRecord(value, label);
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new Error(`Solo Hunt checkpoint ${label}.${key} must be a finite number`);
    }
  }
}

function assertCadenceParticipant(value: unknown, label: string): void {
  assertRecord(value, label);
  assertAllowedKeys(value, ["kind", "identity"], label);
  if (value.kind !== "pokemonInstance" && value.kind !== "nonPlayer") {
    throw new Error(`Solo Hunt checkpoint ${label} has invalid kind`);
  }
  assertNonEmptyString(value, "identity", label);
}

function assertPolicy(value: unknown, label: string): void {
  assertRecord(value, label);
  assertAllowedKeys(value, ["nextMoveSlotByParticipant"], label);
  assertNumericRecord(value.nextMoveSlotByParticipant, `${label}.nextMoveSlotByParticipant`);
}

function assertCadenceEffect(value: unknown, label: string): void {
  assertRecord(value, label);
  assertAllowedKeys(value, [
    "effectId", "targetCadenceParticipant", "lifetimeScope", "stackingPolicy",
    "applicationSequence", "scheduleRevision", "remainingDurationMs", "remainingToNextTickMs", "stacks",
  ], label);
  assertNonEmptyString(value, "effectId", label);
  assertCadenceParticipant(value.targetCadenceParticipant, `${label}.targetCadenceParticipant`);
  if (value.lifetimeScope !== "cadence") throw new Error(`Solo Hunt checkpoint ${label} has invalid lifetimeScope`);
  if (value.stackingPolicy !== "replace" && value.stackingPolicy !== "refresh" && value.stackingPolicy !== "stack") {
    throw new Error(`Solo Hunt checkpoint ${label} has invalid stackingPolicy`);
  }
  for (const key of ["applicationSequence", "scheduleRevision", "remainingDurationMs", "stacks"] as const) {
    assertNonNegativeSafeInteger(value, key, label);
  }
  if (value.remainingToNextTickMs !== undefined) assertNonNegativeSafeInteger(value, "remainingToNextTickMs", label);
}

function assertCadenceReadiness(value: unknown, label: string, forwardV3: boolean): void {
  assertRecord(value, label);
  assertAllowedKeys(value, [
    "participant",
    "moveLoadout",
    "nextActionRemainingMs",
    "moveCooldownRemainingMs",
    ...(forwardV3 ? ["autoPotionCooldownRemainingMs"] : []),
  ], label);
  assertCadenceParticipant(value.participant, `${label}.participant`);
  assertStringArray(value.moveLoadout, `${label}.moveLoadout`);
  assertNonNegativeSafeInteger(value, "nextActionRemainingMs", label);
  assertNumericRecord(value.moveCooldownRemainingMs, `${label}.moveCooldownRemainingMs`);
  if (forwardV3 && value.autoPotionCooldownRemainingMs !== undefined) {
    assertNonNegativeSafeInteger(value, "autoPotionCooldownRemainingMs", label);
  }
}

function assertCadence(value: unknown, label: string, forwardV3 = false): void {
  assertRecord(value, label);
  assertAllowedKeys(value, [
    "effects", "hpByParticipant", "maxHpByParticipant", "readinessByParticipant", "actionLockRemainingMsByParticipant",
  ], label);
  if (!Array.isArray(value.effects)) {
    throw new Error(`Solo Hunt checkpoint ${label}.effects must be an array`);
  }
  for (const [index, effect] of value.effects.entries()) {
    assertCadenceEffect(effect, `${label}.effects[${index}]`);
  }
  assertNumericRecord(value.hpByParticipant, `${label}.hpByParticipant`);
  assertNumericRecord(value.maxHpByParticipant, `${label}.maxHpByParticipant`);
  assertRecord(value.readinessByParticipant, `${label}.readinessByParticipant`);
  for (const [key, readiness] of Object.entries(value.readinessByParticipant)) {
    assertCadenceReadiness(readiness, `${label}.readinessByParticipant.${key}`, forwardV3);
  }
  assertNumericRecord(value.actionLockRemainingMsByParticipant, `${label}.actionLockRemainingMsByParticipant`);
}

function assertTeamMember(value: unknown, label: string, requireShiny: boolean): void {
  assertRecord(value, label);
  assertAllowedKeys(value, [
    "pokemonInstanceId", "speciesId", "level", "baseStats", "ivs", "geneticBonuses",
    "types", "moveLoadout", "abilityId", ...(requireShiny ? ["shiny"] : []),
  ], label);
  if (requireShiny && typeof value.shiny !== "boolean") {
    throw new Error(`Solo Hunt checkpoint ${label} must pin original owned Shiny`);
  }
  assertNonEmptyString(value, "pokemonInstanceId", label);
  assertNonEmptyString(value, "speciesId", label);
  assertNonNegativeSafeInteger(value, "level", label);
  assertStatBlock(value.baseStats, `${label}.baseStats`);
  assertStatBlock(value.ivs, `${label}.ivs`);
  if (value.geneticBonuses !== undefined) assertStatBlock(value.geneticBonuses, `${label}.geneticBonuses`);
  assertStringArray(value.types, `${label}.types`);
  assertStringArray(value.moveLoadout, `${label}.moveLoadout`);
  if (value.abilityId !== undefined && (typeof value.abilityId !== "string" || value.abilityId.length === 0)) {
    throw new Error(`Solo Hunt checkpoint ${label} has invalid abilityId`);
  }
}

function assertSelection(value: unknown, label: string): void {
  assertRecord(value, label);
  assertAllowedKeys(value, [
    "encounterDefinitionId", "speciesId", "weight", "levelBand", "rewardEnvelope", "level",
  ], label);
  assertNonEmptyString(value, "encounterDefinitionId", label);
  assertNonEmptyString(value, "speciesId", label);
  assertFiniteNumber(value, "weight", label);
  assertNonNegativeSafeInteger(value, "level", label);
  assertRecord(value.levelBand, `${label}.levelBand`);
  assertAllowedKeys(value.levelBand, ["min", "max"], `${label}.levelBand`);
  assertNonNegativeSafeInteger(value.levelBand, "min", `${label}.levelBand`);
  assertNonNegativeSafeInteger(value.levelBand, "max", `${label}.levelBand`);
}

function assertIndividualizationLinkage(record: Record<string, unknown>, label: string): void {
  const keys = [
    "individualizationSnapshotIdentity",
    "individualizationSnapshotCommitment",
    "individualizationRulesVersion",
    "derivationAuthorityVersion",
    "derivationAuthorityKeyId",
  ] as const;
  const present = keys.filter((key) => record[key] !== undefined);
  if (present.length === 0) return;
  if (present.length !== keys.length) {
    throw new Error(`Solo Hunt checkpoint ${label} has incomplete individualization linkage`);
  }
  for (const key of keys) assertNonEmptyString(record, key, label);
  if (record.individualizationRulesVersion !== ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1) {
    throw new Error(`Solo Hunt checkpoint ${label} has unsupported individualizationRulesVersion`);
  }
}

function isGeneticProfile(value: unknown): boolean {
  return typeof value === "string" && (GENETIC_PROFILES as readonly string[]).includes(value);
}

function assertCompatibleProfiles(value: unknown, label: string): asserts value is [string, string] {
  if (!Array.isArray(value)
    || value.length !== 2
    || !isGeneticProfile(value[0])
    || !isGeneticProfile(value[1])
    || value[0] === value[1]) {
    throw new Error(`Solo Hunt checkpoint ${label} must contain two distinct supported Profiles`);
  }
}

function assertIndividualizationSnapshot(value: unknown, label: string): void {
  assertRecord(value, label);
  assertAllowedKeys(value, [
    "pendingSelectionIdentity", "speciesId", "level", "ivs", "geneticScore", "geneticGrade", "geneticBudget",
    "compatibleProfiles", "birthProfile", "birthGeneticBonuses", "profileAllocations", "shiny", "isAscendant",
    "individualizationRulesVersion", "derivationAuthorityVersion", "derivationAuthorityKeyId",
    "individualizationSnapshotIdentity", "individualizationSnapshotCommitment",
  ], label);
  for (const key of [
    "pendingSelectionIdentity",
    "speciesId",
    "geneticGrade",
    "birthProfile",
    "individualizationRulesVersion",
    "derivationAuthorityVersion",
    "derivationAuthorityKeyId",
    "individualizationSnapshotIdentity",
    "individualizationSnapshotCommitment",
  ] as const) {
    assertNonEmptyString(value, key, label);
  }
  if (!(GENETIC_GRADES as readonly string[]).includes(value.geneticGrade as string)) {
    throw new Error(`Solo Hunt checkpoint ${label} has unsupported geneticGrade`);
  }
  if (!isGeneticProfile(value.birthProfile)) {
    throw new Error(`Solo Hunt checkpoint ${label} has unsupported birthProfile`);
  }
  if (value.individualizationRulesVersion !== ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1) {
    throw new Error(`Solo Hunt checkpoint ${label} has unsupported individualizationRulesVersion`);
  }
  for (const key of ["level", "geneticScore", "geneticBudget"] as const) {
    assertNonNegativeSafeInteger(value, key, label);
  }
  assertStatBlock(value.ivs, `${label}.ivs`);
  assertStatBlock(value.birthGeneticBonuses, `${label}.birthGeneticBonuses`);
  const compatibleProfiles = value.compatibleProfiles;
  assertCompatibleProfiles(compatibleProfiles, `${label}.compatibleProfiles`);
  if (!compatibleProfiles.includes(value.birthProfile as string)) {
    throw new Error(`Solo Hunt checkpoint ${label}.birthProfile is not compatible with the Encounter`);
  }
  if (!Array.isArray(value.profileAllocations)
    || value.profileAllocations.length !== 2
    || !value.profileAllocations.every(isRecord)) {
    throw new Error(`Solo Hunt checkpoint ${label}.profileAllocations must contain two allocations`);
  }
  for (const [index, allocation] of value.profileAllocations.entries()) {
    assertAllowedKeys(allocation, ["profile", "bonuses"], `${label}.profileAllocations[${index}]`);
    if (!isGeneticProfile(allocation.profile)) {
      throw new Error(`Solo Hunt checkpoint ${label}.profileAllocations[${index}] has unsupported profile`);
    }
    if (allocation.profile !== compatibleProfiles[index]) {
      throw new Error(`Solo Hunt checkpoint ${label}.profileAllocations do not match compatibleProfiles`);
    }
    assertStatBlock(allocation.bonuses, `${label}.profileAllocations[${index}].bonuses`);
  }
  if (typeof value.shiny !== "boolean" || typeof value.isAscendant !== "boolean") {
    throw new Error(`Solo Hunt checkpoint ${label} has invalid Shiny/Ascendant flags`);
  }
}

function assertRng(value: unknown, label: string): void {
  assertRecord(value, label);
  assertAllowedKeys(value, ["algorithm", "state"], label);
  const error = validateRngState(value as DeterministicRngState);
  if (error) throw new Error(`Solo Hunt checkpoint ${label} is invalid: ${error}`);
}

function assertPendingSelection(value: unknown, label: string): void {
  assertRecord(value, label);
  assertAllowedKeys(value, [
    "pendingSelectionIdentity", "playerId", "zoneId", "huntDefinitionId", "contentVersion", "contentHash",
    "gameDataVersion", "rulesVersion", "encounterDefinitionId", "speciesId", "level",
    "policyRngBeforeSelection", "policyRngAfterSelection", "compatibleProfiles",
    "individualizationRulesVersion", "derivationAuthorityVersion", "derivationAuthorityKeyId",
  ], label);
  for (const key of [
    "pendingSelectionIdentity",
    "playerId",
    "zoneId",
    "huntDefinitionId",
    "contentVersion",
    "contentHash",
    "gameDataVersion",
    "rulesVersion",
    "encounterDefinitionId",
    "speciesId",
  ] as const) {
    assertNonEmptyString(value, key, label);
  }
  assertNonNegativeSafeInteger(value, "level", label);
  assertRng(value.policyRngBeforeSelection, `${label}.policyRngBeforeSelection`);
  assertRng(value.policyRngAfterSelection, `${label}.policyRngAfterSelection`);
  const individualizationKeys = [
    "compatibleProfiles",
    "individualizationRulesVersion",
    "derivationAuthorityVersion",
    "derivationAuthorityKeyId",
  ] as const;
  const individualizationPresent = individualizationKeys.filter((key) => value[key] !== undefined);
  if (individualizationPresent.length > 0) {
    if (individualizationPresent.length !== individualizationKeys.length) {
      throw new Error(`Solo Hunt checkpoint ${label} has incomplete individualization authority`);
    }
    assertCompatibleProfiles(value.compatibleProfiles, `${label}.compatibleProfiles`);
    for (const key of individualizationKeys.slice(1)) assertNonEmptyString(value, key, label);
    if (value.individualizationRulesVersion !== ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1) {
      throw new Error(`Solo Hunt checkpoint ${label} has unsupported individualizationRulesVersion`);
    }
  }
}

function assertSelectionOrigin(value: unknown): void {
  assertRecord(value, "selectionStreamOrigin");
  if (value.kind === "rng") {
    assertAllowedKeys(value, ["kind", "policyRng"], "selectionStreamOrigin");
    assertRng(value.policyRng, "selectionStreamOrigin.policyRng");
    return;
  }
  if (value.kind === "pending") {
    assertAllowedKeys(value, ["kind", "pendingEncounterSelection"], "selectionStreamOrigin");
    assertPendingSelection(value.pendingEncounterSelection, "selectionStreamOrigin.pendingEncounterSelection");
    return;
  }
  throw new Error("Solo Hunt checkpoint selectionStreamOrigin has invalid kind");
}

function assertParticipantActivation(value: unknown, label: string): void {
  assertRecord(value, label);
  assertAllowedKeys(value, ["pokemonInstanceId", "combatantId", "activationKind", "combatTimeMs", "eventSequence"], label);
  assertNonEmptyString(value, "pokemonInstanceId", label);
  assertNonEmptyString(value, "combatantId", label);
  if (value.activationKind !== "initial" && value.activationKind !== "forcedReplacement") {
    throw new Error(`Solo Hunt checkpoint ${label} has invalid activationKind`);
  }
  assertNonNegativeSafeInteger(value, "combatTimeMs", label);
  assertNonNegativeSafeInteger(value, "eventSequence", label);
}

function assertCombatStimulus(value: unknown, label: string, forwardV3: boolean): void {
  assertRecord(value, label);
  if (value.kind === "useMove") {
    assertAllowedKeys(value, ["kind", "actorId", "moveId", "targetId"], label);
    assertNonEmptyString(value, "actorId", label);
    assertNonEmptyString(value, "moveId", label);
    if (value.targetId !== undefined && (typeof value.targetId !== "string" || value.targetId.length === 0)) {
      throw new Error(`Solo Hunt checkpoint ${label} has invalid targetId`);
    }
    return;
  }
  if (value.kind === "advanceTime") {
    assertAllowedKeys(value, ["kind", "toMs"], label);
    assertNonNegativeSafeInteger(value, "toMs", label);
    return;
  }
  if (value.kind === "forcedReplacement") {
    assertAllowedKeys(value, ["kind", "sideId", "combatantId"], label);
    assertNonEmptyString(value, "sideId", label);
    assertNonEmptyString(value, "combatantId", label);
    return;
  }
  if (forwardV3 && value.kind === "externalHpHeal") {
    assertAllowedKeys(value, ["kind", "targetId", "actionOwnerId", "magnitude", "provenanceId"], label);
    assertNonEmptyString(value, "targetId", label);
    assertNonEmptyString(value, "actionOwnerId", label);
    assertNonEmptyString(value, "provenanceId", label);
    assertRecord(value.magnitude, `${label}.magnitude`);
    if (value.magnitude.kind === "integer") {
      assertAllowedKeys(value.magnitude, ["kind", "amount"], `${label}.magnitude`);
      if (!Number.isSafeInteger(value.magnitude.amount) || (value.magnitude.amount as number) <= 0) {
        throw new Error(`Solo Hunt checkpoint ${label}.magnitude.amount must be a positive safe integer`);
      }
      return;
    }
    if (value.magnitude.kind === "maxHpFraction") {
      assertAllowedKeys(value.magnitude, ["kind", "numerator", "denominator"], `${label}.magnitude`);
      if (
        !Number.isSafeInteger(value.magnitude.numerator)
        || (value.magnitude.numerator as number) <= 0
        || !Number.isSafeInteger(value.magnitude.denominator)
        || (value.magnitude.denominator as number) <= 0
      ) {
        throw new Error(`Solo Hunt checkpoint ${label}.magnitude fraction must be positive safe integers`);
      }
      return;
    }
    throw new Error(`Solo Hunt checkpoint ${label}.magnitude has invalid kind`);
  }
  if (forwardV3 && value.kind === "koInterventionDecision") {
    const revive = value.decision === "revive";
    assertAllowedKeys(
      value,
      revive
        ? ["kind", "sideId", "combatantId", "decision", "reviveFraction", "provenanceId"]
        : ["kind", "sideId", "combatantId", "decision"],
      label,
    );
    assertNonEmptyString(value, "sideId", label);
    assertNonEmptyString(value, "combatantId", label);
    if (value.decision !== "decline" && value.decision !== "revive") {
      throw new Error(`Solo Hunt checkpoint ${label} has invalid KO intervention decision`);
    }
    if (revive) {
      assertNonEmptyString(value, "provenanceId", label);
      assertRecord(value.reviveFraction, `${label}.reviveFraction`);
      assertAllowedKeys(value.reviveFraction, ["numerator", "denominator"], `${label}.reviveFraction`);
      if (
        !Number.isSafeInteger(value.reviveFraction.numerator)
        || (value.reviveFraction.numerator as number) <= 0
        || !Number.isSafeInteger(value.reviveFraction.denominator)
        || (value.reviveFraction.denominator as number) <= 0
      ) {
        throw new Error(`Solo Hunt checkpoint ${label}.reviveFraction must be positive safe integers`);
      }
    }
    return;
  }
  throw new Error(`Solo Hunt checkpoint ${label} has invalid kind`);
}

function assertBattleSide(value: unknown, label: string): void {
  assertRecord(value, label);
  assertAllowedKeys(value, ["sideId", "activeCapacity", "combatantIds", "activeCombatantIds"], label);
  assertNonEmptyString(value, "sideId", label);
  assertNonNegativeSafeInteger(value, "activeCapacity", label);
  assertStringArray(value.combatantIds, `${label}.combatantIds`);
  assertStringArray(value.activeCombatantIds, `${label}.activeCombatantIds`);
}

function assertStages(value: unknown, label: string): void {
  assertRecord(value, label);
  assertAllowedKeys(value, ["atk", "def", "spa", "spd", "spe"], label);
  for (const stat of ["atk", "def", "spa", "spd", "spe"] as const) {
    assertFiniteNumber(value, stat, label);
  }
}

function assertBattleCombatant(value: unknown, label: string, forwardV3: boolean): void {
  assertRecord(value, label);
  assertAllowedKeys(value, [
    "combatantId", "sideId", "speciesId", "level", "types", "maxHp", "derivedStats", "currentHp",
    "moveLoadout", "nextActionAtMs", "moveReadyAtMs", "stages", "actionLockExpiresAtMsByScope",
    "abilityId", "cadenceParticipant", ...(forwardV3 ? ["autoPotionReadyAtMs"] : []),
  ], label);
  for (const key of ["combatantId", "sideId", "speciesId"] as const) assertNonEmptyString(value, key, label);
  assertNonNegativeSafeInteger(value, "level", label);
  assertStringArray(value.types, `${label}.types`);
  assertFiniteNumber(value, "maxHp", label);
  assertStatBlock(value.derivedStats, `${label}.derivedStats`);
  assertFiniteNumber(value, "currentHp", label);
  assertStringArray(value.moveLoadout, `${label}.moveLoadout`);
  assertNonNegativeSafeInteger(value, "nextActionAtMs", label);
  if (forwardV3 && value.autoPotionReadyAtMs !== undefined) {
    assertNonNegativeSafeInteger(value, "autoPotionReadyAtMs", label);
  }
  assertNumericRecord(value.moveReadyAtMs, `${label}.moveReadyAtMs`);
  assertStages(value.stages, `${label}.stages`);
  if (value.actionLockExpiresAtMsByScope !== undefined) {
    assertRecord(value.actionLockExpiresAtMsByScope, `${label}.actionLockExpiresAtMsByScope`);
    assertAllowedKeys(value.actionLockExpiresAtMsByScope, ["battle", "cadence"], `${label}.actionLockExpiresAtMsByScope`);
    assertNumericRecord(value.actionLockExpiresAtMsByScope, `${label}.actionLockExpiresAtMsByScope`);
  }
  if (value.abilityId !== undefined && (typeof value.abilityId !== "string" || value.abilityId.length === 0)) {
    throw new Error(`Solo Hunt checkpoint ${label} has invalid abilityId`);
  }
  if (value.cadenceParticipant !== undefined) assertCadenceParticipant(value.cadenceParticipant, `${label}.cadenceParticipant`);
}

function assertActiveEffect(value: unknown, label: string): void {
  assertRecord(value, label);
  assertAllowedKeys(value, [
    "effectId", "targetCombatantId", "targetCadenceParticipant", "lifetimeScope", "stackingPolicy",
    "applicationSequence", "scheduleRevision", "appliedAtMs", "expiresAtMs", "nextTickAtMs", "stacks",
  ], label);
  assertNonEmptyString(value, "effectId", label);
  assertNonEmptyString(value, "targetCombatantId", label);
  if (value.targetCadenceParticipant !== undefined) {
    assertCadenceParticipant(value.targetCadenceParticipant, `${label}.targetCadenceParticipant`);
  }
  if (value.lifetimeScope !== "battle" && value.lifetimeScope !== "cadence") {
    throw new Error(`Solo Hunt checkpoint ${label} has invalid lifetimeScope`);
  }
  if (value.stackingPolicy !== "replace" && value.stackingPolicy !== "refresh" && value.stackingPolicy !== "stack") {
    throw new Error(`Solo Hunt checkpoint ${label} has invalid stackingPolicy`);
  }
  for (const key of ["applicationSequence", "scheduleRevision", "appliedAtMs", "expiresAtMs", "stacks"] as const) {
    assertNonNegativeSafeInteger(value, key, label);
  }
  if (value.nextTickAtMs !== undefined) assertNonNegativeSafeInteger(value, "nextTickAtMs", label);
}

function assertCombatContext(value: unknown, label: string): void {
  assertRecord(value, label);
  assertAllowedKeys(value, [
    "gameDataVersion", "rulesVersion", "combatEventSchemaVersion", "moveRules", "abilityRules", "effectRules", "typeChart",
  ], label);
  assertNonEmptyString(value, "gameDataVersion", label);
  assertNonEmptyString(value, "rulesVersion", label);
  assertNonEmptyString(value, "combatEventSchemaVersion", label);
  for (const key of ["moveRules", "abilityRules", "effectRules", "typeChart"] as const) {
    assertRecord(value[key], `${label}.${key}`);
  }
}

function assertOriginCombatEvent(
  event: Record<string, unknown>,
  label: string,
  participants: ReadonlySet<string>,
  sideIds: ReadonlySet<string>,
): void {
  const baseKeys = ["kind", "sequence", "combatTimeMs"];
  const stringFields: string[] = [];
  const numberFields: string[] = [];
  let allowed: readonly string[];
  switch (event.kind) {
    case "BattleStarted":
      allowed = ["battleId"];
      stringFields.push("battleId");
      break;
    case "MoveUsed":
      allowed = ["actorId", "moveId", "targetIds"];
      stringFields.push("actorId", "moveId");
      assertStringArray(event.targetIds, `${label}.targetIds`);
      for (const target of event.targetIds as string[]) {
        if (!participants.has(target)) throw new Error(`Solo Hunt checkpoint ${label} has unknown Move target`);
      }
      break;
    case "MoveMissed":
    case "MoveImmune":
    case "CriticalHit":
      allowed = ["actorId", "moveId", "targetId"];
      stringFields.push("actorId", "moveId", "targetId");
      break;
    case "DamageApplied":
      allowed = ["source", "actorId", "moveId", "targetId", "amount", "resultingHp"];
      if (event.source !== "move" && event.source !== "effect") {
        throw new Error(`Solo Hunt checkpoint ${label} has invalid damage source`);
      }
      stringFields.push("targetId");
      if (event.actorId !== undefined) stringFields.push("actorId");
      if (event.moveId !== undefined) stringFields.push("moveId");
      numberFields.push("amount", "resultingHp");
      break;
    case "CombatantKO":
      allowed = ["combatantId"];
      stringFields.push("combatantId");
      break;
    case "CombatantActivated":
      allowed = ["combatantId", "sideId"];
      stringFields.push("combatantId", "sideId");
      break;
    case "BattleEnded": {
      allowed = ["outcome"];
      assertRecord(event.outcome, `${label}.outcome`);
      if (event.outcome.kind === "win") {
        assertAllowedKeys(event.outcome, ["kind", "winnerSideId"], `${label}.outcome`);
        assertNonEmptyString(event.outcome, "winnerSideId", `${label}.outcome`);
        if (!sideIds.has(event.outcome.winnerSideId as string)) {
          throw new Error(`Solo Hunt checkpoint ${label} has unknown winner side`);
        }
      } else if (event.outcome.kind === "draw") {
        assertAllowedKeys(event.outcome, ["kind"], `${label}.outcome`);
      } else {
        throw new Error(`Solo Hunt checkpoint ${label} has invalid outcome`);
      }
      break;
    }
    case "EffectApplied":
    case "EffectUpdated":
      allowed = ["effectId", "targetId", "stacks"];
      stringFields.push("effectId", "targetId");
      if (event.stacks !== undefined) numberFields.push("stacks");
      break;
    case "EffectRemoved":
      allowed = ["effectId", "targetId"];
      stringFields.push("effectId", "targetId");
      break;
    case "EffectTicked":
      allowed = ["effectId", "targetId", "consequence", "amount", "resultingHp"];
      stringFields.push("effectId", "targetId");
      if (event.consequence !== "damage" && event.consequence !== "healing") {
        throw new Error(`Solo Hunt checkpoint ${label} has invalid tick consequence`);
      }
      numberFields.push("amount", "resultingHp");
      break;
    case "HealingApplied":
      allowed = ["targetId", "amount", "resultingHp"];
      stringFields.push("targetId");
      numberFields.push("amount", "resultingHp");
      break;
    case "StatStageChanged":
      allowed = ["targetId", "stat", "requestedDelta", "appliedDelta", "resultingStage"];
      stringFields.push("targetId");
      if (!["atk", "def", "spa", "spd", "spe"].includes(String(event.stat))) {
        throw new Error(`Solo Hunt checkpoint ${label} has invalid stat`);
      }
      numberFields.push("requestedDelta", "appliedDelta", "resultingStage");
      break;
    default:
      throw new Error(`Solo Hunt checkpoint ${label} has unknown CombatEvent kind`);
  }
  assertAllowedKeys(event, [...baseKeys, ...allowed], label);
  for (const key of stringFields) assertNonEmptyString(event, key, label);
  for (const key of numberFields) {
    if (!Number.isSafeInteger(event[key])) {
      throw new Error(`Solo Hunt checkpoint ${label} has invalid ${key}`);
    }
  }
  for (const key of ["actorId", "targetId", "combatantId"] as const) {
    if (event[key] !== undefined && !participants.has(event[key] as string)) {
      throw new Error(`Solo Hunt checkpoint ${label} refers to unknown ${key}`);
    }
  }
  if (event.sideId !== undefined && !sideIds.has(event.sideId as string)) {
    throw new Error(`Solo Hunt checkpoint ${label} refers to unknown sideId`);
  }
}

function assertBattleOrigin(value: unknown, label: string): void {
  assertRecord(value, label);
  assertAllowedKeys(value, [
    "battleId", "sourceVersions", "individualizationSnapshot",
    "sides", "participants", "initialEvents",
  ], label);
  assertNonEmptyString(value, "battleId", label);
  assertRecord(value.sourceVersions, `${label}.sourceVersions`);
  assertAllowedKeys(
    value.sourceVersions, ["gameDataVersion", "rulesVersion", "combatEventSchemaVersion"],
    `${label}.sourceVersions`,
  );
  for (const key of ["gameDataVersion", "rulesVersion", "combatEventSchemaVersion"] as const) {
    assertNonEmptyString(value.sourceVersions, key, `${label}.sourceVersions`);
  }
  assertIndividualizationSnapshot(value.individualizationSnapshot, `${label}.individualizationSnapshot`);
  assertRecordArray(value.sides, `${label}.sides`);
  assertRecordArray(value.participants, `${label}.participants`);
  assertRecordArray(value.initialEvents, `${label}.initialEvents`);
  if (value.sides.length !== 2 || value.participants.length === 0 || value.initialEvents.length === 0) {
    throw new Error(`Solo Hunt checkpoint ${label} has incomplete Battle origin`);
  }
  const sideIds = new Set<string>();
  const sideByCombatant = new Map<string, string>();
  for (const [index, side] of value.sides.entries()) {
    const sideLabel = `${label}.sides[${index}]`;
    assertAllowedKeys(side, ["sideId", "combatantIds", "activeCombatantIds"], sideLabel);
    assertNonEmptyString(side, "sideId", sideLabel);
    if (sideIds.has(side.sideId as string)) {
      throw new Error(`Solo Hunt checkpoint ${label} has duplicate origin side`);
    }
    sideIds.add(side.sideId as string);
    assertStringArray(side.combatantIds, `${sideLabel}.combatantIds`);
    assertStringArray(side.activeCombatantIds, `${sideLabel}.activeCombatantIds`);
    if ((side.activeCombatantIds as string[]).some((id) => !(side.combatantIds as string[]).includes(id))) {
      throw new Error(`Solo Hunt checkpoint ${sideLabel} has an unpinned initial active`);
    }
    for (const combatantId of side.combatantIds as string[]) {
      if (sideByCombatant.has(combatantId)) {
        throw new Error(`Solo Hunt checkpoint ${label} has duplicate origin Combatant`);
      }
      sideByCombatant.set(combatantId, side.sideId as string);
    }
  }
  const seen = new Set<string>();
  for (const [index, participant] of value.participants.entries()) {
    const participantLabel = `${label}.participants[${index}]`;
    const owned = participant.kind === "owned";
    if (!owned && participant.kind !== "wild") {
      throw new Error(`Solo Hunt checkpoint ${participantLabel} has unknown participant kind`);
    }
    assertAllowedKeys(participant, owned
      ? ["kind", "combatantId", "sideId", "pokemonInstanceId", "speciesId", "level", "shiny", "currentHp", "maxHp"]
      : ["kind", "combatantId", "sideId", "speciesId", "level", "shiny", "state"], participantLabel);
    for (const key of ["combatantId", "sideId", "speciesId"] as const) {
      assertNonEmptyString(participant, key, participantLabel);
    }
    assertNonNegativeSafeInteger(participant, "level", participantLabel);
    if (participant.shiny !== true && participant.shiny !== false) {
      throw new Error(`Solo Hunt checkpoint ${participantLabel}.shiny is not pinned`);
    }
    if (seen.has(participant.combatantId as string)) {
      throw new Error(`Solo Hunt checkpoint ${label} has duplicate origin participant`);
    }
    seen.add(participant.combatantId as string);
    if (sideByCombatant.get(participant.combatantId as string) !== participant.sideId) {
      throw new Error(`Solo Hunt checkpoint ${participantLabel} has mismatched side binding`);
    }
    if (owned) {
      assertNonEmptyString(participant, "pokemonInstanceId", participantLabel);
      for (const key of ["currentHp", "maxHp"] as const) {
        assertNonNegativeSafeInteger(participant, key, participantLabel);
      }
      if ((participant.maxHp as number) < 1 || (participant.currentHp as number) > (participant.maxHp as number)) {
        throw new Error(`Solo Hunt checkpoint ${participantLabel} has invalid original HP`);
      }
    } else if (participant.state !== "conscious" && participant.state !== "ko") {
      throw new Error(`Solo Hunt checkpoint ${participantLabel} has invalid public wild status`);
    }
  }
  if (seen.size !== sideByCombatant.size) {
    throw new Error(`Solo Hunt checkpoint ${label} has incomplete participant bindings`);
  }
  const first = value.initialEvents[0]!;
  if (first.kind !== "BattleStarted" || first.battleId !== value.battleId
    || first.sequence !== 1 || first.combatTimeMs !== 0) {
    throw new Error(`Solo Hunt checkpoint ${label} lacks original BattleStarted`);
  }
  for (const [index, event] of value.initialEvents.entries()) {
    if (event.sequence !== index + 1 || event.combatTimeMs !== 0) {
      throw new Error(`Solo Hunt checkpoint ${label} has non-contiguous time-zero events`);
    }
    assertOriginCombatEvent(event, `${label}.initialEvents[${index}]`, seen, sideIds);
    if (index !== 0 && event.kind === "BattleStarted") {
      throw new Error(`Solo Hunt checkpoint ${label} repeats BattleStarted`);
    }
  }
}

function assertCurrentEncounter(
  value: unknown,
  managementFirst: boolean,
  requirePresentationOrigin: boolean,
): void {
  assertRecord(value, "currentEncounter");
  assertAllowedKeys(value, [
    "encounterId", "encounterOrdinal", "pendingSelectionIdentity", "selection", "battle",
    "battleStartedAtHuntTimeMs", "playerSideId", "opponentSideId", "policy",
    "participantPokemonInstanceIds", "participantActivations", "battleStimuli", "battleOutcome", "individualizationSnapshot",
    ...(requirePresentationOrigin ? ["battleOrigin"] : []),
  ], "currentEncounter");
  if (requirePresentationOrigin) {
    assertBattleOrigin(value.battleOrigin, "currentEncounter.battleOrigin");
  }
  for (const key of [
    "encounterId",
    "pendingSelectionIdentity",
    "playerSideId",
    "opponentSideId",
  ] as const) {
    assertNonEmptyString(value, key, "currentEncounter");
  }
  assertNonNegativeSafeInteger(value, "encounterOrdinal", "currentEncounter");
  assertNonNegativeSafeInteger(value, "battleStartedAtHuntTimeMs", "currentEncounter");
  assertSelection(value.selection, "currentEncounter.selection");
  assertRecord(value.battle, "currentEncounter.battle");
  assertAllowedKeys(value.battle, [
    "battleId", "context", "combatTimeMs", "eventSequence", "status", "sides", "combatants",
    "replacementPendingSideIds", "effects", "nextEffectApplicationSequence",
    ...(managementFirst ? ["koInterventionSideId", "koInterventionPending"] : []),
  ], "currentEncounter.battle");
  assertNonEmptyString(value.battle, "battleId", "currentEncounter.battle");
  assertCombatContext(value.battle.context, "currentEncounter.battle.context");
  assertNonNegativeSafeInteger(value.battle, "combatTimeMs", "currentEncounter.battle");
  assertNonNegativeSafeInteger(value.battle, "eventSequence", "currentEncounter.battle");
  if (value.battle.status !== "active" && value.battle.status !== "ended") {
    throw new Error("Solo Hunt checkpoint currentEncounter.battle has invalid status");
  }
  if (!Array.isArray(value.battle.sides) || !Array.isArray(value.battle.replacementPendingSideIds)) {
    throw new Error("Solo Hunt checkpoint currentEncounter.battle is missing canonical arrays");
  }
  for (const [index, side] of value.battle.sides.entries()) {
    assertBattleSide(side, `currentEncounter.battle.sides[${index}]`);
  }
  assertStringArray(value.battle.replacementPendingSideIds, "currentEncounter.battle.replacementPendingSideIds");
  if (managementFirst) {
    if (
      value.battle.koInterventionSideId !== undefined
      && value.battle.koInterventionSideId !== null
      && (typeof value.battle.koInterventionSideId !== "string" || value.battle.koInterventionSideId.length === 0)
    ) {
      throw new Error("Solo Hunt checkpoint currentEncounter.battle has invalid koInterventionSideId");
    }
    if (value.battle.koInterventionPending !== undefined && value.battle.koInterventionPending !== null) {
      assertRecord(value.battle.koInterventionPending, "currentEncounter.battle.koInterventionPending");
      assertAllowedKeys(
        value.battle.koInterventionPending,
        ["sideId", "combatantId"],
        "currentEncounter.battle.koInterventionPending",
      );
      assertNonEmptyString(value.battle.koInterventionPending, "sideId", "currentEncounter.battle.koInterventionPending");
      assertNonEmptyString(value.battle.koInterventionPending, "combatantId", "currentEncounter.battle.koInterventionPending");
    }
  }
  assertRecord(value.battle.combatants, "currentEncounter.battle.combatants");
  for (const [key, combatant] of Object.entries(value.battle.combatants)) {
    assertBattleCombatant(combatant, `currentEncounter.battle.combatants.${key}`, managementFirst);
  }
  assertRecord(value.battle.effects, "currentEncounter.battle.effects");
  for (const [key, effect] of Object.entries(value.battle.effects)) {
    assertActiveEffect(effect, `currentEncounter.battle.effects.${key}`);
  }
  assertNonNegativeSafeInteger(value.battle, "nextEffectApplicationSequence", "currentEncounter.battle");
  assertPolicy(value.policy, "currentEncounter.policy");
  assertStringArray(value.participantPokemonInstanceIds, "currentEncounter.participantPokemonInstanceIds");
  assertRecordArray(value.participantActivations, "currentEncounter.participantActivations");
  for (const [index, activation] of value.participantActivations.entries()) {
    assertParticipantActivation(activation, `currentEncounter.participantActivations[${index}]`);
  }
  assertRecordArray(value.battleStimuli, "currentEncounter.battleStimuli");
  for (const [index, stimulus] of value.battleStimuli.entries()) {
    assertCombatStimulus(stimulus, `currentEncounter.battleStimuli[${index}]`, managementFirst);
  }
  if (value.battleOutcome !== undefined) {
    assertRecord(value.battleOutcome, "currentEncounter.battleOutcome");
    if (value.battleOutcome.kind === "win") {
      assertAllowedKeys(value.battleOutcome, ["kind", "winnerSideId"], "currentEncounter.battleOutcome");
      assertNonEmptyString(value.battleOutcome, "winnerSideId", "currentEncounter.battleOutcome");
    } else if (value.battleOutcome.kind === "draw") {
      assertAllowedKeys(value.battleOutcome, ["kind"], "currentEncounter.battleOutcome");
    } else {
      throw new Error("Solo Hunt checkpoint currentEncounter.battleOutcome has invalid kind");
    }
  }
  if (value.individualizationSnapshot !== undefined) {
    assertIndividualizationSnapshot(value.individualizationSnapshot, "currentEncounter.individualizationSnapshot");
  }
}

function assertInterBattle(value: unknown, interBattleGapMs: number, forwardV3: boolean): void {
  assertRecord(value, "interBattle");
  assertAllowedKeys(
    value,
    ["cadence", "policy", "remainingGapMs", ...(forwardV3 ? ["activePokemonInstanceId"] : [])],
    "interBattle",
  );
  assertCadence(value.cadence, "interBattle.cadence", forwardV3);
  assertPolicy(value.policy, "interBattle.policy");
  assertNonNegativeSafeInteger(value, "remainingGapMs", "interBattle");
  if (forwardV3 && value.activePokemonInstanceId !== undefined) {
    assertNonEmptyString(value, "activePokemonInstanceId", "interBattle");
  }
  if ((value.remainingGapMs as number) > interBattleGapMs) {
    throw new Error("Solo Hunt checkpoint interBattle remainingGapMs exceeds interBattleGapMs");
  }
}

function assertAppliedHealingEvent(value: unknown, label: string): void {
  assertRecord(value, label);
  assertAllowedKeys(value, [
    "sourceIdentity",
    "acceptanceSequence",
    "afterEncounterId",
    "afterEncounterOrdinal",
    "appliedAtHuntTimeMs",
    "targetPokemonInstanceId",
    "magnitude",
    "healedHp",
  ], label);
  assertNonEmptyString(value, "sourceIdentity", label);
  assertNonEmptyString(value, "acceptanceSequence", label);
  assertNonEmptyString(value, "afterEncounterId", label);
  if (!Number.isSafeInteger(value.afterEncounterOrdinal) || (value.afterEncounterOrdinal as number) < 1) {
    throw new Error(`Solo Hunt checkpoint ${label}.afterEncounterOrdinal must be a positive safe integer`);
  }
  if (!/^[1-9][0-9]*$/u.test(value.acceptanceSequence as string)) {
    throw new Error(`Solo Hunt checkpoint ${label}.acceptanceSequence is invalid`);
  }
  assertNonNegativeSafeInteger(value, "appliedAtHuntTimeMs", label);
  assertNonEmptyString(value, "targetPokemonInstanceId", label);
  if (!Number.isSafeInteger(value.healedHp) || (value.healedHp as number) <= 0) {
    throw new Error(`Solo Hunt checkpoint ${label}.healedHp must be a positive safe integer`);
  }
  assertRecord(value.magnitude, `${label}.magnitude`);
  if (value.magnitude.kind === "integer") {
    assertAllowedKeys(value.magnitude, ["kind", "amount"], `${label}.magnitude`);
    if (!Number.isSafeInteger(value.magnitude.amount) || (value.magnitude.amount as number) <= 0) {
      throw new Error(`Solo Hunt checkpoint ${label}.magnitude.amount must be a positive safe integer`);
    }
    return;
  }
  if (value.magnitude.kind === "maxHpFraction") {
    assertAllowedKeys(value.magnitude, ["kind", "numerator", "denominator"], `${label}.magnitude`);
    if (
      !Number.isSafeInteger(value.magnitude.numerator)
      || (value.magnitude.numerator as number) <= 0
      || !Number.isSafeInteger(value.magnitude.denominator)
      || (value.magnitude.denominator as number) <= 0
    ) {
      throw new Error(`Solo Hunt checkpoint ${label}.magnitude fraction must be positive safe integers`);
    }
    return;
  }
  throw new Error(`Solo Hunt checkpoint ${label}.magnitude has invalid kind`);
}

function assertAppliedAutomationEvent(value: unknown, label: string): void {
  assertRecord(value, label);
  if (value.kind === "potion") {
    assertAllowedKeys(value, [
      "kind",
      "provenanceId",
      "afterEncounterId",
      "afterEncounterOrdinal",
      "appliedAtHuntTimeMs",
      "targetPokemonInstanceId",
      "magnitude",
      "appliedHp",
      "resultingHp",
    ], label);
    assertRecord(value.magnitude, `${label}.magnitude`);
    if (value.magnitude.kind === "integer") {
      assertAllowedKeys(value.magnitude, ["kind", "amount"], `${label}.magnitude`);
      if (!Number.isSafeInteger(value.magnitude.amount) || (value.magnitude.amount as number) <= 0) {
        throw new Error(`Solo Hunt checkpoint ${label}.magnitude.amount must be a positive safe integer`);
      }
    } else if (value.magnitude.kind === "maxHpFraction") {
      assertAllowedKeys(value.magnitude, ["kind", "numerator", "denominator"], `${label}.magnitude`);
      if (
        !Number.isSafeInteger(value.magnitude.numerator)
        || (value.magnitude.numerator as number) <= 0
        || !Number.isSafeInteger(value.magnitude.denominator)
        || (value.magnitude.denominator as number) <= 0
      ) {
        throw new Error(`Solo Hunt checkpoint ${label}.magnitude fraction must be positive safe integers`);
      }
    } else {
      throw new Error(`Solo Hunt checkpoint ${label}.magnitude has invalid kind`);
    }
  } else if (value.kind === "revive") {
    assertAllowedKeys(value, [
      "kind",
      "provenanceId",
      "afterEncounterId",
      "afterEncounterOrdinal",
      "appliedAtHuntTimeMs",
      "targetPokemonInstanceId",
      "restoredHp",
      "appliedHp",
      "resultingHp",
    ], label);
    if (!Number.isSafeInteger(value.restoredHp) || (value.restoredHp as number) <= 0) {
      throw new Error(`Solo Hunt checkpoint ${label}.restoredHp must be a positive safe integer`);
    }
  } else {
    throw new Error(`Solo Hunt checkpoint ${label}.kind is invalid`);
  }
  assertNonEmptyString(value, "provenanceId", label);
  assertNonEmptyString(value, "afterEncounterId", label);
  if (!Number.isSafeInteger(value.afterEncounterOrdinal) || (value.afterEncounterOrdinal as number) < 1) {
    throw new Error(`Solo Hunt checkpoint ${label}.afterEncounterOrdinal must be a positive safe integer`);
  }
  assertNonNegativeSafeInteger(value, "appliedAtHuntTimeMs", label);
  assertNonEmptyString(value, "targetPokemonInstanceId", label);
  for (const key of ["appliedHp", "resultingHp"] as const) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) <= 0) {
      throw new Error(`Solo Hunt checkpoint ${label}.${key} must be a positive safe integer`);
    }
  }
}

function assertCompletedEncounter(value: unknown, label: string, forwardV3: boolean): void {
  assertRecord(value, label);
  assertAllowedKeys(value, [
    "rewardSourceIdentity", "huntRunIdentity", "encounterId", "encounterOrdinal", "pendingSelectionIdentity",
    "encounterDefinitionId", "speciesId", "level", "completionKind", "participantPokemonInstanceIds",
    "rewardEnvelope", "contentVersion", "contentHash", "gameDataVersion", "rulesVersion", "completedAtHuntTimeMs",
    "individualizationSnapshotIdentity", "individualizationSnapshotCommitment", "individualizationRulesVersion",
    "derivationAuthorityVersion", "derivationAuthorityKeyId",
  ], label);
  for (const key of [
    "huntRunIdentity",
    "encounterId",
    "pendingSelectionIdentity",
    "encounterDefinitionId",
    "speciesId",
    "contentVersion",
    "contentHash",
    "gameDataVersion",
    "rulesVersion",
  ] as const) {
    assertNonEmptyString(value, key, label);
  }
  for (const key of ["encounterOrdinal", "level", "completedAtHuntTimeMs"] as const) {
    assertNonNegativeSafeInteger(value, key, label);
  }
  if (value.completionKind === "defeat") {
    assertNonEmptyString(value, "rewardSourceIdentity", label);
    if (!("rewardEnvelope" in value)) {
      throw new Error(`Solo Hunt checkpoint ${label}.rewardEnvelope is required for defeat`);
    }
  } else if (forwardV3 && value.completionKind === "resolved_non_win") {
    if (value.rewardSourceIdentity !== undefined || value.rewardEnvelope !== undefined) {
      throw new Error(`Solo Hunt checkpoint ${label} resolved_non_win cannot contain reward authority`);
    }
  } else {
    throw new Error(`Solo Hunt checkpoint ${label} has invalid completionKind`);
  }
  assertStringArray(value.participantPokemonInstanceIds, `${label}.participantPokemonInstanceIds`);
  assertIndividualizationLinkage(value, label);
}

function assertCompletedEncounterProvenance(
  value: unknown,
  label: string,
  managementFirst: boolean,
  requirePresentationOrigin: boolean,
): void {
  assertRecord(value, label);
  assertAllowedKeys(value, [
    "encounterId", "encounterOrdinal", "consumedPendingEncounterSelection", "participantActivations", "battleStimuli",
    "battleStartedAtHuntTimeMs", "completedAtHuntTimeMs", "terminalBattleTimeMs", "terminalEventSequence",
    "individualizationSnapshot", ...(requirePresentationOrigin ? ["battleOrigin"] : []),
  ], label);
  if (requirePresentationOrigin) assertBattleOrigin(value.battleOrigin, `${label}.battleOrigin`);
  assertNonEmptyString(value, "encounterId", label);
  for (const key of [
    "encounterOrdinal",
    "battleStartedAtHuntTimeMs",
    "completedAtHuntTimeMs",
    "terminalBattleTimeMs",
    "terminalEventSequence",
  ] as const) {
    assertNonNegativeSafeInteger(value, key, label);
  }
  assertPendingSelection(value.consumedPendingEncounterSelection, `${label}.consumedPendingEncounterSelection`);
  assertRecordArray(value.participantActivations, `${label}.participantActivations`);
  for (const [index, activation] of value.participantActivations.entries()) {
    assertParticipantActivation(activation, `${label}.participantActivations[${index}]`);
  }
  assertRecordArray(value.battleStimuli, `${label}.battleStimuli`);
  for (const [index, stimulus] of value.battleStimuli.entries()) {
    assertCombatStimulus(stimulus, `${label}.battleStimuli[${index}]`, managementFirst);
  }
  if (value.individualizationSnapshot !== undefined) {
    assertIndividualizationSnapshot(value.individualizationSnapshot, `${label}.individualizationSnapshot`);
  }
}

function assertPendingCaptureDecision(value: unknown): void {
  assertRecord(value, "pendingCaptureDecision");
  assertAllowedKeys(value, [
    "encounterId", "encounterDefinitionId", "speciesId", "level", "contentVersion", "contentHash",
    "gameDataVersion", "rulesVersion", "pendingSelectionIdentity", "individualizationSnapshotIdentity",
    "individualizationSnapshotCommitment", "individualizationRulesVersion", "derivationAuthorityVersion",
    "derivationAuthorityKeyId",
  ], "pendingCaptureDecision");
  for (const key of [
    "encounterId",
    "encounterDefinitionId",
    "speciesId",
    "contentVersion",
    "contentHash",
    "gameDataVersion",
    "rulesVersion",
  ] as const) {
    assertNonEmptyString(value, key, "pendingCaptureDecision");
  }
  assertNonNegativeSafeInteger(value, "level", "pendingCaptureDecision");
  if (value.pendingSelectionIdentity !== undefined
    && (typeof value.pendingSelectionIdentity !== "string" || value.pendingSelectionIdentity.length === 0)) {
    throw new Error("Solo Hunt checkpoint pendingCaptureDecision has invalid pendingSelectionIdentity");
  }
  assertIndividualizationLinkage(value, "pendingCaptureDecision");
}

function sameDecodedRng(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return left.algorithm === right.algorithm && left.state === right.state;
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function sameCanonicalDecodedValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function decodedEncounterId(huntRunIdentity: unknown, encounterOrdinal: unknown): string {
  return JSON.stringify(["soloHuntEncounter", huntRunIdentity, encounterOrdinal]);
}

function decodedBattleId(huntRunIdentity: unknown, encounterOrdinal: unknown): string {
  return JSON.stringify(["soloHuntBattle", huntRunIdentity, encounterOrdinal]);
}

function decodedRewardSourceIdentity(huntRunIdentity: unknown, encounterOrdinal: unknown): string {
  return JSON.stringify(["soloHuntEncounterReward", huntRunIdentity, encounterOrdinal]);
}

function selectionMatchesRuntimeContext(
  selection: Record<string, unknown>,
  runtime: Record<string, unknown>,
): boolean {
  return selection.playerId === runtime.playerId
    && selection.zoneId === runtime.zoneId
    && selection.huntDefinitionId === runtime.huntDefinitionId
    && selection.contentVersion === runtime.contentVersion
    && selection.contentHash === runtime.contentHash
    && selection.gameDataVersion === runtime.gameDataVersion
    && selection.rulesVersion === runtime.rulesVersion;
}

function pendingCarriesIndividualization(pending: Record<string, unknown>): boolean {
  return pending.compatibleProfiles !== undefined;
}

function individualizationSnapshotMatchesPending(
  snapshot: Record<string, unknown>,
  pending: Record<string, unknown>,
): boolean {
  return snapshot.pendingSelectionIdentity === pending.pendingSelectionIdentity
    && snapshot.speciesId === pending.speciesId
    && snapshot.level === pending.level
    && sameCanonicalDecodedValue(snapshot.compatibleProfiles, pending.compatibleProfiles)
    && snapshot.individualizationRulesVersion === pending.individualizationRulesVersion
    && snapshot.derivationAuthorityVersion === pending.derivationAuthorityVersion
    && snapshot.derivationAuthorityKeyId === pending.derivationAuthorityKeyId;
}

function assertDecodedRuntimeConsistency(value: Record<string, unknown>): void {
  const currentEncounter = value.currentEncounter as Record<string, unknown> | undefined;
  const pendingSelection = value.pendingEncounterSelection as Record<string, unknown> | undefined;
  if (currentEncounter) {
    if (
      !pendingSelection
      || pendingSelection.pendingSelectionIdentity !== currentEncounter.pendingSelectionIdentity
    ) {
      throw new Error("Solo Hunt checkpoint current Encounter is missing its exact pending selection");
    }
    const selection = currentEncounter.selection as Record<string, unknown>;
    const battle = currentEncounter.battle as Record<string, unknown>;
    const battleContext = battle.context as Record<string, unknown>;
    const participantIds = currentEncounter.participantPokemonInstanceIds as string[];
    const participantActivationIds = (currentEncounter.participantActivations as Record<string, unknown>[])
      .map((activation) => activation.pokemonInstanceId as string);
    const individualizationSnapshot = currentEncounter.individualizationSnapshot as
      | Record<string, unknown>
      | undefined;
    if (
      currentEncounter.encounterOrdinal !== (value.nextEncounterOrdinal as number) - 1
      || currentEncounter.encounterId !== decodedEncounterId(value.huntRunIdentity, currentEncounter.encounterOrdinal)
      || battle.battleId !== decodedBattleId(value.huntRunIdentity, currentEncounter.encounterOrdinal)
      || (currentEncounter.battleStartedAtHuntTimeMs as number) + (battle.combatTimeMs as number)
        !== value.logicalTimeMs
      || battleContext.gameDataVersion !== value.gameDataVersion
      || battleContext.rulesVersion !== value.rulesVersion
      || selection.encounterDefinitionId !== pendingSelection.encounterDefinitionId
      || selection.speciesId !== pendingSelection.speciesId
      || selection.level !== pendingSelection.level
      || !sameOrderedStrings(participantIds, participantActivationIds)
    ) {
      throw new Error("Solo Hunt checkpoint current Encounter does not match its pending selection");
    }
    const pendingHasIndividualization = pendingCarriesIndividualization(pendingSelection);
    if (
      (individualizationSnapshot !== undefined) !== pendingHasIndividualization
      || (
        individualizationSnapshot
        && !individualizationSnapshotMatchesPending(individualizationSnapshot, pendingSelection)
      )
    ) {
      throw new Error("Solo Hunt checkpoint current Encounter individualization does not match pending selection");
    }
  } else if (pendingSelection !== undefined) {
    throw new Error("Solo Hunt checkpoint inter-Battle phase cannot retain a pending selection");
  }

  if (pendingSelection) {
    if (!selectionMatchesRuntimeContext(pendingSelection, value)) {
      throw new Error("Solo Hunt checkpoint pending selection does not match runtime context");
    }
  }

  const evidenceRows = value.completedEncounters as Record<string, unknown>[];
  const provenanceRows = value.completedEncounterProvenance as Record<string, unknown>[];
  const expectedCompletedCount = currentEncounter
    ? (currentEncounter.encounterOrdinal as number) - 1
    : (value.nextEncounterOrdinal as number) - 1;
  if (evidenceRows.length !== expectedCompletedCount) {
    throw new Error("Solo Hunt checkpoint completed Encounter count does not match encounter progression");
  }

  const selectionOrigin = value.selectionStreamOrigin as Record<string, unknown>;
  let expectedSelectionRng = selectionOrigin.kind === "rng"
    ? selectionOrigin.policyRng as Record<string, unknown>
    : undefined;
  const originPending = selectionOrigin.kind === "pending"
    ? selectionOrigin.pendingEncounterSelection as Record<string, unknown>
    : undefined;
  if (originPending && !selectionMatchesRuntimeContext(originPending, value)) {
    throw new Error("Solo Hunt checkpoint pending selection origin does not match runtime context");
  }
  let previousCompletionTimeMs = -1;
  for (let index = 0; index < evidenceRows.length; index += 1) {
    const evidence = evidenceRows[index]!;
    const provenance = provenanceRows[index]!;
    const consumed = provenance.consumedPendingEncounterSelection as Record<string, unknown>;
    const provenanceParticipantIds = (provenance.participantActivations as Record<string, unknown>[])
      .map((activation) => activation.pokemonInstanceId as string);
    const individualizationSnapshot = provenance.individualizationSnapshot as
      | Record<string, unknown>
      | undefined;
    const expectedOrdinal = index + 1;
    if (
      !selectionMatchesRuntimeContext(consumed, value)
      || evidence.encounterOrdinal !== expectedOrdinal
      || provenance.encounterOrdinal !== expectedOrdinal
      || evidence.encounterId !== decodedEncounterId(value.huntRunIdentity, expectedOrdinal)
      || evidence.encounterId !== provenance.encounterId
      || evidence.completedAtHuntTimeMs !== provenance.completedAtHuntTimeMs
      || evidence.pendingSelectionIdentity !== consumed.pendingSelectionIdentity
      || evidence.encounterDefinitionId !== consumed.encounterDefinitionId
      || evidence.speciesId !== consumed.speciesId
      || evidence.level !== consumed.level
      || evidence.huntRunIdentity !== value.huntRunIdentity
      || evidence.contentVersion !== value.contentVersion
      || evidence.contentHash !== value.contentHash
      || evidence.gameDataVersion !== value.gameDataVersion
      || evidence.rulesVersion !== value.rulesVersion
      || !sameOrderedStrings(
        evidence.participantPokemonInstanceIds as string[],
        provenanceParticipantIds,
      )
      || (provenance.battleStartedAtHuntTimeMs as number) + (provenance.terminalBattleTimeMs as number)
        !== provenance.completedAtHuntTimeMs
      || (evidence.completedAtHuntTimeMs as number) < previousCompletionTimeMs
      || (evidence.completedAtHuntTimeMs as number) > (value.logicalTimeMs as number)
    ) {
      throw new Error("Solo Hunt checkpoint completed Encounter evidence/provenance is context-incompatible");
    }
    if (
      evidence.completionKind === "defeat"
      && evidence.rewardSourceIdentity !== decodedRewardSourceIdentity(value.huntRunIdentity, expectedOrdinal)
    ) {
      throw new Error("Solo Hunt checkpoint winning Encounter reward authority is context-incompatible");
    }
    const consumedHasIndividualization = pendingCarriesIndividualization(consumed);
    const evidenceHasIndividualization = evidence.individualizationSnapshotIdentity !== undefined;
    if (
      (individualizationSnapshot !== undefined) !== consumedHasIndividualization
      || evidenceHasIndividualization !== consumedHasIndividualization
      || (
        individualizationSnapshot
        && (
          !individualizationSnapshotMatchesPending(individualizationSnapshot, consumed)
          || evidence.individualizationSnapshotIdentity
            !== individualizationSnapshot.individualizationSnapshotIdentity
          || evidence.individualizationSnapshotCommitment
            !== individualizationSnapshot.individualizationSnapshotCommitment
          || evidence.individualizationRulesVersion
            !== individualizationSnapshot.individualizationRulesVersion
          || evidence.derivationAuthorityVersion
            !== individualizationSnapshot.derivationAuthorityVersion
          || evidence.derivationAuthorityKeyId
            !== individualizationSnapshot.derivationAuthorityKeyId
        )
      )
    ) {
      throw new Error("Solo Hunt checkpoint completed Encounter individualization linkage is inconsistent");
    }
    if (
      index === 0
      && originPending
      && !sameCanonicalDecodedValue(consumed, originPending)
    ) {
      throw new Error("Solo Hunt checkpoint first completion does not match pending selection origin");
    }
    if (
      (index > 0 || !originPending)
      && (!expectedSelectionRng
        || !sameDecodedRng(
          consumed.policyRngBeforeSelection as Record<string, unknown>,
          expectedSelectionRng,
        ))
    ) {
      throw new Error("Solo Hunt checkpoint completed Encounter selection RNG provenance is discontinuous");
    }
    expectedSelectionRng = consumed.policyRngAfterSelection as Record<string, unknown>;
    previousCompletionTimeMs = evidence.completedAtHuntTimeMs as number;
  }

  if (pendingSelection) {
    if (
      evidenceRows.length === 0
      && originPending
      && !sameCanonicalDecodedValue(pendingSelection, originPending)
    ) {
      throw new Error("Solo Hunt checkpoint active pending selection does not match retained origin");
    }
    if (
      (evidenceRows.length > 0 || !originPending)
      && (!expectedSelectionRng
        || !sameDecodedRng(
          pendingSelection.policyRngBeforeSelection as Record<string, unknown>,
          expectedSelectionRng,
        ))
    ) {
      throw new Error("Solo Hunt checkpoint active pending selection RNG provenance is discontinuous");
    }
    if (!sameDecodedRng(
      value.policyRng as Record<string, unknown>,
      pendingSelection.policyRngAfterSelection as Record<string, unknown>,
    )) {
      throw new Error("Solo Hunt checkpoint policy RNG does not match active pending selection");
    }
  } else if (
    !expectedSelectionRng
    || !sameDecodedRng(value.policyRng as Record<string, unknown>, expectedSelectionRng)
  ) {
    throw new Error("Solo Hunt checkpoint policy RNG does not match completed selection provenance");
  }

  if (value.pendingCaptureDecision !== undefined) {
    const pendingCapture = value.pendingCaptureDecision as Record<string, unknown>;
    const matches = evidenceRows.filter((evidence) => evidence.encounterId === pendingCapture.encounterId);
    if (matches.length !== 1) {
      throw new Error("Solo Hunt checkpoint pending capture lacks one exact completed Encounter");
    }
    const evidence = matches[0]!;
    for (const key of [
      "encounterDefinitionId",
      "speciesId",
      "level",
      "contentVersion",
      "contentHash",
      "gameDataVersion",
      "rulesVersion",
    ] as const) {
      if (pendingCapture[key] !== evidence[key]) {
        throw new Error("Solo Hunt checkpoint pending capture does not match completed Encounter evidence");
      }
    }
    const linkageKeys = [
      "individualizationSnapshotIdentity",
      "individualizationSnapshotCommitment",
      "individualizationRulesVersion",
      "derivationAuthorityVersion",
      "derivationAuthorityKeyId",
    ] as const;
    const evidenceHasIndividualization = evidence.individualizationSnapshotIdentity !== undefined;
    if (
      (pendingCapture.pendingSelectionIdentity !== undefined) !== evidenceHasIndividualization
      || (evidenceHasIndividualization
        && pendingCapture.pendingSelectionIdentity !== evidence.pendingSelectionIdentity)
      || linkageKeys.some((key) => pendingCapture[key] !== evidence[key])
    ) {
      throw new Error("Solo Hunt checkpoint pending capture individualization linkage is inconsistent");
    }
  }
}

function assertDecodedRuntimeState(
  value: unknown,
  schemaVersion:
    | typeof SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V1
    | typeof SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2
    | typeof SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3
    | typeof SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4,
): asserts value is SoloHuntRuntimeState {
  if (!isRecord(value)) throw new Error("Solo Hunt checkpoint state must be an object");
  const managementFirst = schemaVersion === SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3
    || schemaVersion === SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4;
  const requirePresentationOrigin = schemaVersion === SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4;
  const allowedKeys = [
    "huntRunIdentity", "playerId", "zoneId", "huntDefinitionId", "contentVersion", "contentHash",
    "gameDataVersion", "rulesVersion", "interBattleGapMs", "pinnedTeam", "logicalTimeMs", "nextEncounterOrdinal",
    "selectionStreamOrigin", "combatDeterministicOrigin", "policyRng", "combatDeterministicState", "currentEncounter",
    "interBattle", "pendingEncounterSelection", "completedEncounters", "completedEncounterProvenance",
    "pendingCaptureDecision", "status", "terminalReason",
    ...(schemaVersion !== SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V1 ? ["appliedHealingEvents"] : []),
    ...(managementFirst
      ? ["automationPolicies", "appliedAutomationEvents"]
      : []),
  ];
  assertAllowedKeys(value, allowedKeys, "state");
  for (const key of [
    "huntRunIdentity",
    "playerId",
    "zoneId",
    "huntDefinitionId",
    "contentVersion",
    "contentHash",
    "gameDataVersion",
    "rulesVersion",
  ] as const) {
    if (typeof value[key] !== "string" || value[key].length === 0) {
      throw new Error(`Solo Hunt checkpoint state has invalid ${key}`);
    }
  }
  for (const key of ["logicalTimeMs", "nextEncounterOrdinal", "interBattleGapMs"] as const) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0) {
      throw new Error(`Solo Hunt checkpoint state has invalid ${key}`);
    }
  }
  if ((value.nextEncounterOrdinal as number) < 2) {
    throw new Error("Solo Hunt checkpoint state has invalid nextEncounterOrdinal");
  }
  if (!Array.isArray(value.pinnedTeam) || !Array.isArray(value.completedEncounters)
    || !Array.isArray(value.completedEncounterProvenance)) {
    throw new Error("Solo Hunt checkpoint state is missing canonical arrays");
  }
  if (value.completedEncounters.length !== value.completedEncounterProvenance.length) {
    throw new Error("Solo Hunt checkpoint completed Encounter evidence/provenance length mismatch");
  }
  for (const [index, member] of value.pinnedTeam.entries()) {
    assertTeamMember(member, `pinnedTeam[${index}]`, requirePresentationOrigin);
  }
  for (const [index, evidence] of value.completedEncounters.entries()) {
    assertCompletedEncounter(
      evidence,
      `completedEncounters[${index}]`,
      managementFirst,
    );
  }
  for (const [index, provenance] of value.completedEncounterProvenance.entries()) {
    assertCompletedEncounterProvenance(
      provenance,
      `completedEncounterProvenance[${index}]`,
      managementFirst,
      requirePresentationOrigin,
    );
  }
  if (schemaVersion !== SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V1) {
    if (!Array.isArray(value.appliedHealingEvents)) {
      throw new Error("Solo Hunt checkpoint v2 state is missing appliedHealingEvents");
    }
    assertRecordArray(value.appliedHealingEvents, "appliedHealingEvents");
    const pinned = new Set(
      value.pinnedTeam.map((member) => (member as Record<string, unknown>).pokemonInstanceId),
    );
    const seenSources = new Set<string>();
    let previousEncounterOrdinal = 0;
    let previousTime = -1;
    let previousSequence: bigint | null = null;
    for (const [index, event] of value.appliedHealingEvents.entries()) {
      assertAppliedHealingEvent(event, `appliedHealingEvents[${index}]`);
      const sourceIdentity = event.sourceIdentity as string;
      const encounterOrdinal = event.afterEncounterOrdinal as number;
      const time = event.appliedAtHuntTimeMs as number;
      const sequence = BigInt(event.acceptanceSequence as string);
      if (seenSources.has(sourceIdentity)) {
        throw new Error("Solo Hunt checkpoint applied healing source identity is duplicated");
      }
      if (time > (value.logicalTimeMs as number)) {
        throw new Error("Solo Hunt checkpoint applied healing occurs after checkpoint logical time");
      }
      const boundary = (value.completedEncounters as Array<Record<string, unknown>>)[encounterOrdinal - 1];
      if (
        !boundary
        || boundary.encounterId !== event.afterEncounterId
        || boundary.encounterOrdinal !== encounterOrdinal
        || (boundary.completedAtHuntTimeMs as number) > time
        || time > (boundary.completedAtHuntTimeMs as number) + (value.interBattleGapMs as number)
      ) {
        throw new Error("Solo Hunt checkpoint applied healing lacks its exact completed Encounter boundary");
      }
      if (!pinned.has(event.targetPokemonInstanceId)) {
        throw new Error("Solo Hunt checkpoint applied healing target is not in the pinned Team");
      }
      if (
        encounterOrdinal < previousEncounterOrdinal
        || (encounterOrdinal === previousEncounterOrdinal && time < previousTime)
        || (
          encounterOrdinal === previousEncounterOrdinal
          && time === previousTime
          && previousSequence !== null
          && sequence <= previousSequence
        )
      ) {
        throw new Error("Solo Hunt checkpoint applied healing events are not in deterministic order");
      }
      seenSources.add(sourceIdentity);
      previousEncounterOrdinal = encounterOrdinal;
      previousTime = time;
      previousSequence = sequence;
    }
  }
  if (managementFirst) {
    if ((value.appliedHealingEvents as unknown[]).length !== 0) {
      throw new Error("Management-first Solo Hunt checkpoint cannot contain legacy manual healing provenance");
    }
    if (!Array.isArray(value.appliedAutomationEvents)) {
      throw new Error("Management-first Solo Hunt checkpoint state is missing appliedAutomationEvents");
    }
    assertRecordArray(value.appliedAutomationEvents, "appliedAutomationEvents");
    const pinned = new Set(
      value.pinnedTeam.map((member) => (member as Record<string, unknown>).pokemonInstanceId),
    );
    const seenProvenance = new Set<string>();
    let previousEncounterOrdinal = 0;
    let previousTime = -1;
    for (const [index, event] of value.appliedAutomationEvents.entries()) {
      assertAppliedAutomationEvent(event, `appliedAutomationEvents[${index}]`);
      const provenanceId = event.provenanceId as string;
      const encounterOrdinal = event.afterEncounterOrdinal as number;
      const time = event.appliedAtHuntTimeMs as number;
      if (seenProvenance.has(provenanceId)) {
        throw new Error("Solo Hunt checkpoint automation provenance identity is duplicated");
      }
      if (time > (value.logicalTimeMs as number)) {
        throw new Error("Solo Hunt checkpoint automation event occurs after checkpoint logical time");
      }
      const boundary = (value.completedEncounters as Array<Record<string, unknown>>).find((entry) =>
        entry.encounterId === event.afterEncounterId && entry.encounterOrdinal === encounterOrdinal);
      if (
        !boundary
        || (boundary.completedAtHuntTimeMs as number) > time
        || time > (boundary.completedAtHuntTimeMs as number) + (value.interBattleGapMs as number)
      ) {
        throw new Error("Solo Hunt checkpoint automation event lacks its exact completed Encounter boundary");
      }
      if (!pinned.has(event.targetPokemonInstanceId)) {
        throw new Error("Solo Hunt checkpoint automation target is not in the pinned Team");
      }
      if (
        encounterOrdinal < previousEncounterOrdinal
        || (encounterOrdinal === previousEncounterOrdinal && time < previousTime)
      ) {
        throw new Error("Solo Hunt checkpoint automation events are not in deterministic order");
      }
      seenProvenance.add(provenanceId);
      previousEncounterOrdinal = encounterOrdinal;
      previousTime = time;
    }
    if (value.automationPolicies === undefined) {
      throw new Error("Management-first Solo Hunt checkpoint state is missing automation policy authority");
    }
    try {
      assertHuntAutomationPolicyAuthoritySnapshot(value.automationPolicies);
    } catch (cause) {
      throw new Error(
        `Management-first Solo Hunt checkpoint automation policy authority is invalid: ${cause instanceof Error ? cause.message : "unknown error"}`,
        { cause },
      );
    }
  }
  assertSelectionOrigin(value.selectionStreamOrigin);
  assertRecord(value.combatDeterministicOrigin, "combatDeterministicOrigin");
  assertAllowedKeys(value.combatDeterministicOrigin, ["rng"], "combatDeterministicOrigin");
  assertRng(value.combatDeterministicOrigin.rng, "combatDeterministicOrigin.rng");
  assertRng(value.policyRng, "policyRng");
  assertRecord(value.combatDeterministicState, "combatDeterministicState");
  assertAllowedKeys(value.combatDeterministicState, ["rng"], "combatDeterministicState");
  assertRng(value.combatDeterministicState.rng, "combatDeterministicState.rng");
  if (value.pendingEncounterSelection !== undefined) {
    assertPendingSelection(value.pendingEncounterSelection, "pendingEncounterSelection");
  }
  if (value.pendingCaptureDecision !== undefined) {
    assertPendingCaptureDecision(value.pendingCaptureDecision);
  }
  const hasCurrentEncounter = value.currentEncounter !== undefined;
  const hasInterBattle = value.interBattle !== undefined;
  if (hasCurrentEncounter === hasInterBattle) {
    throw new Error("Solo Hunt checkpoint state must contain exactly one runtime phase");
  }
  if (hasCurrentEncounter) {
    assertCurrentEncounter(value.currentEncounter, managementFirst, requirePresentationOrigin);
  } else {
    assertInterBattle(
      value.interBattle,
      value.interBattleGapMs as number,
      managementFirst,
    );
  }
  if (value.status !== "active" && value.status !== "terminal") {
    throw new Error("Solo Hunt checkpoint state has invalid status");
  }
  if (value.status === "active" && value.terminalReason !== undefined) {
    throw new Error("Solo Hunt checkpoint active state cannot carry a terminalReason");
  }
  if (
    value.status === "terminal"
    && value.terminalReason !== "noLivingTeam"
    && value.terminalReason !== "opponentVictory"
    && value.terminalReason !== "draw"
  ) {
    throw new Error("Solo Hunt checkpoint terminal state has invalid terminalReason");
  }
  assertDecodedRuntimeConsistency(value);
}

export function encodeSoloHuntCheckpointV1(state: SoloHuntRuntimeState): Uint8Array {
  if (state.appliedHealingEvents !== undefined) {
    throw new Error("Solo Hunt checkpoint v1 cannot encode explicit healing provenance");
  }
  if (state.automationPolicies !== undefined) {
    throw new Error("Solo Hunt checkpoint v1 cannot encode automation policy authority");
  }
  if (state.appliedAutomationEvents !== undefined) {
    throw new Error("Solo Hunt checkpoint v1 cannot encode automation provenance");
  }
  const payload = {
    schemaVersion: SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V1,
    state: canonicalize(state),
  };
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function encodeSoloHuntCheckpointV2(state: SoloHuntRuntimeState): Uint8Array {
  if (state.automationPolicies !== undefined) {
    throw new Error("Solo Hunt checkpoint v2 cannot encode automation policy authority");
  }
  if (state.appliedAutomationEvents !== undefined) {
    throw new Error("Solo Hunt checkpoint v2 cannot encode automation provenance");
  }
  const normalized: SoloHuntRuntimeState = {
    ...state,
    appliedHealingEvents: state.appliedHealingEvents ?? [],
  };
  const payload = {
    schemaVersion: SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2,
    state: canonicalize(normalized),
  };
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function encodeSoloHuntCheckpointV3(state: SoloHuntRuntimeState): Uint8Array {
  if (state.automationPolicies === undefined) {
    throw new Error("Solo Hunt checkpoint v3 requires automation policy authority");
  }
  assertHuntAutomationPolicyAuthoritySnapshot(state.automationPolicies);
  const normalized: SoloHuntRuntimeState = {
    ...state,
    appliedHealingEvents: state.appliedHealingEvents ?? [],
    appliedAutomationEvents: state.appliedAutomationEvents ?? [],
  };
  return new TextEncoder().encode(JSON.stringify({
    schemaVersion: SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3,
    state: canonicalize(normalized),
  }));
}

export function encodeSoloHuntCheckpointV4(state: SoloHuntRuntimeState): Uint8Array {
  if (state.automationPolicies === undefined) {
    throw new Error("Solo Hunt checkpoint v4 requires automation policy authority");
  }
  assertHuntAutomationPolicyAuthoritySnapshot(state.automationPolicies);
  const normalized: SoloHuntRuntimeState = {
    ...state,
    appliedHealingEvents: state.appliedHealingEvents ?? [],
    appliedAutomationEvents: state.appliedAutomationEvents ?? [],
  };
  assertDecodedRuntimeState(normalized, SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4);
  return new TextEncoder().encode(JSON.stringify({
    schemaVersion: SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4,
    state: canonicalize(normalized),
  }));
}

export type SoloHuntCheckpointDecodeResult =
  | { readonly accepted: true; readonly state: SoloHuntRuntimeState }
  | { readonly accepted: false; readonly reason: string };

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function decodeSoloHuntCheckpointV1(bytes: Uint8Array): SoloHuntCheckpointDecodeResult {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      return { accepted: false, reason: "Solo Hunt checkpoint bytes are required" };
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || parsed.schemaVersion !== SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V1) {
      return { accepted: false, reason: "Unsupported Solo Hunt checkpoint schema" };
    }
    assertAllowedKeys(parsed, ["schemaVersion", "state"], "payload");
    const state = decanonicalize(parsed.state);
    assertDecodedRuntimeState(state, SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V1);
    if (!sameBytes(bytes, encodeSoloHuntCheckpointV1(state))) {
      return { accepted: false, reason: "Solo Hunt checkpoint bytes are not canonical" };
    }
    return { accepted: true, state };
  } catch (error) {
    return {
      accepted: false,
      reason: error instanceof Error ? error.message : "Malformed Solo Hunt checkpoint",
    };
  }
}


export function decodeSoloHuntCheckpointV2(bytes: Uint8Array): SoloHuntCheckpointDecodeResult {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      return { accepted: false, reason: "Solo Hunt checkpoint bytes are required" };
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || parsed.schemaVersion !== SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2) {
      return { accepted: false, reason: "Unsupported Solo Hunt checkpoint schema" };
    }
    assertAllowedKeys(parsed, ["schemaVersion", "state"], "payload");
    const state = decanonicalize(parsed.state);
    assertDecodedRuntimeState(state, SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2);
    if (!sameBytes(bytes, encodeSoloHuntCheckpointV2(state))) {
      return { accepted: false, reason: "Solo Hunt checkpoint bytes are not canonical" };
    }
    return { accepted: true, state };
  } catch (error) {
    return {
      accepted: false,
      reason: error instanceof Error ? error.message : "Malformed Solo Hunt checkpoint",
    };
  }
}

export function decodeSoloHuntCheckpointV3(bytes: Uint8Array): SoloHuntCheckpointDecodeResult {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      return { accepted: false, reason: "Solo Hunt checkpoint bytes are required" };
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || parsed.schemaVersion !== SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3) {
      return { accepted: false, reason: "Unsupported Solo Hunt checkpoint schema" };
    }
    assertAllowedKeys(parsed, ["schemaVersion", "state"], "payload");
    const state = decanonicalize(parsed.state);
    assertDecodedRuntimeState(state, SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3);
    if (!sameBytes(bytes, encodeSoloHuntCheckpointV3(state))) {
      return { accepted: false, reason: "Solo Hunt checkpoint bytes are not canonical" };
    }
    return { accepted: true, state };
  } catch (error) {
    return {
      accepted: false,
      reason: error instanceof Error ? error.message : "Malformed Solo Hunt checkpoint",
    };
  }
}

export function decodeSoloHuntCheckpointV4(bytes: Uint8Array): SoloHuntCheckpointDecodeResult {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      return { accepted: false, reason: "Solo Hunt checkpoint bytes are required" };
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || parsed.schemaVersion !== SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4) {
      return { accepted: false, reason: "Unsupported Solo Hunt checkpoint schema" };
    }
    assertAllowedKeys(parsed, ["schemaVersion", "state"], "payload");
    const state = decanonicalize(parsed.state);
    assertDecodedRuntimeState(state, SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4);
    if (!sameBytes(bytes, encodeSoloHuntCheckpointV4(state))) {
      return { accepted: false, reason: "Solo Hunt checkpoint bytes are not canonical" };
    }
    return { accepted: true, state };
  } catch (error) {
    return {
      accepted: false,
      reason: error instanceof Error ? error.message : "Malformed Solo Hunt checkpoint",
    };
  }
}

export function decodeSoloHuntCheckpoint(bytes: Uint8Array): SoloHuntCheckpointDecodeResult {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      return { accepted: false, reason: "Solo Hunt checkpoint bytes are required" };
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) return { accepted: false, reason: "Unsupported Solo Hunt checkpoint schema" };
    if (parsed.schemaVersion === SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V1) return decodeSoloHuntCheckpointV1(bytes);
    if (parsed.schemaVersion === SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2) return decodeSoloHuntCheckpointV2(bytes);
    if (parsed.schemaVersion === SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3) return decodeSoloHuntCheckpointV3(bytes);
    if (parsed.schemaVersion === SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4) return decodeSoloHuntCheckpointV4(bytes);
    return { accepted: false, reason: "Unsupported Solo Hunt checkpoint schema" };
  } catch (error) {
    return {
      accepted: false,
      reason: error instanceof Error ? error.message : "Malformed Solo Hunt checkpoint",
    };
  }
}

export function advanceSoloHuntSegmentedToCutoff(
  state: SoloHuntRuntimeState,
  inputs: SoloHuntRuntimeInputs,
  cutoffMs: number,
  maxSegmentMs = SOLO_HUNT_DEFAULT_SEGMENT_MS,
): AdvanceSoloHuntResult {
  if (!Number.isSafeInteger(maxSegmentMs) || maxSegmentMs <= 0) {
    return { accepted: false, reason: "Solo Hunt segment size must be a positive safe integer", state, events: [] };
  }
  if (!Number.isSafeInteger(cutoffMs) || cutoffMs < state.logicalTimeMs) {
    return { accepted: false, reason: "Solo Hunt segmented cutoff is before current logical time", state, events: [] };
  }
  if (state.status === "terminal" || state.logicalTimeMs === cutoffMs) {
    return advanceSoloHuntToCutoff(state, inputs, cutoffMs);
  }

  let current = state;
  const events: SoloHuntSimulationEvent[] = [];
  while (current.logicalTimeMs < cutoffMs && current.status === "active") {
    const remaining = cutoffMs - current.logicalTimeMs;
    const segmentTarget = current.logicalTimeMs + Math.min(remaining, maxSegmentMs);
    const advanced = advanceSoloHuntToCutoff(current, inputs, segmentTarget);
    if (!advanced.accepted) return advanced;
    events.push(...advanced.events);
    current = advanced.state;
    if (advanced.stopReason !== "cutoff") {
      return { accepted: true, state: current, stopReason: advanced.stopReason, events };
    }
    if (current.logicalTimeMs !== segmentTarget) {
      return {
        accepted: false,
        reason: "Solo Hunt segmented advancement failed to reach its deterministic segment target",
        state: current,
        events: [],
      };
    }
  }
  return { accepted: true, state: current, stopReason: "cutoff", events };
}
