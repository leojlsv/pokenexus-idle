import type {
  EncounterDefinitionId,
  HuntDefinitionId,
  ItemId,
  SpeciesId,
  ZoneId,
} from "@pokenexus/game-types";
import type { ValidationFinding, ValidationReport } from "./schema.js";

export const PVE_CONTENT_SCHEMA_VERSION = "1" as const;
export const PVE_ENCOUNTER_LEVEL_MAX = 200 as const;

export interface PveAvailabilityV1 {
  playerLevelMin: number | null;
  prerequisiteHuntIds: HuntDefinitionId[];
}

export interface ZoneDefinitionV1 {
  id: ZoneId;
  displayName: string;
  displayOrder: number;
  availability: PveAvailabilityV1;
}

export interface HuntDefinitionV1 {
  id: HuntDefinitionId;
  zoneId: ZoneId;
  displayName: string;
  displayOrder: number;
  availability: PveAvailabilityV1;
  recoveryDurationMs: number;
}

export interface EncounterLevelBandV1 {
  min: number;
  max: number;
}

export interface EncounterItemDropInputV1 {
  itemId: ItemId;
  quantity: number;
  chanceBasisPoints: number;
}

export interface EncounterRewardInputV1 {
  pokemonXpPool: number;
  playerXp: number | null;
  itemDrops: EncounterItemDropInputV1[];
}

export interface EncounterDefinitionV1 {
  id: EncounterDefinitionId;
  huntId: HuntDefinitionId;
  speciesId: SpeciesId;
  weight: number;
  levelBand: EncounterLevelBandV1;
  reward: EncounterRewardInputV1;
}

export interface PveContentV1 {
  zones: ZoneDefinitionV1[];
  hunts: HuntDefinitionV1[];
  encounters: EncounterDefinitionV1[];
}

export interface PvePlayabilityEvidenceRow {
  speciesId: string;
  level: number;
  eligibleCount: number;
  executableCount: number;
  progressCapableExecutableCount: number;
  simpleExecutableCount: number;
  authoredExecutableCount: number;
  distinctTargetClasses: number;
  distinctCategoryClasses: number;
  distinctEffectRoleClasses: number;
  bottleneck: "zero-executable" | "one-executable" | null;
}

export interface PvePlayabilityEvidence {
  profileArtifactId: string;
  profileContentHash: string;
  gameDataVersion: string;
  speciesCount: number;
  rows: readonly PvePlayabilityEvidenceRow[];
}

export interface PveReferenceAuthority {
  speciesIds: ReadonlySet<string>;
  itemIds: ReadonlySet<string>;
  playability?: PvePlayabilityEvidence;
}

export class PveContentValidationError extends Error {
  readonly finding: ValidationFinding;

  constructor(finding: ValidationFinding) {
    super(`${finding.path}: ${finding.message}`);
    this.name = "PveContentValidationError";
    this.finding = finding;
  }
}

function fail(path: string, message: string, code = "invalid-value"): never {
  throw new PveContentValidationError({ code, path, message });
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "must be an object");
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void {
  const allowed = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, "is not an accepted field", "unexpected-field");
  }
  for (const key of expected) {
    if (!(key in value)) fail(`${path}.${key}`, "is required", "missing-field");
  }
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) fail(path, "must be a non-empty string");
  return value.normalize("NFC");
}

function asSafeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    fail(path, "must be a safe integer");
  }
  return value;
}

function asIntegerInRange(
  value: unknown,
  path: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const result = asSafeInteger(value, path);
  if (result < min || result > max) {
    fail(path, `must be an integer in [${min}, ${max}]`);
  }
  return result;
}

function asNullablePositiveInteger(value: unknown, path: string): number | null {
  return value === null ? null : asIntegerInRange(value, path, 1);
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value;
}

function parseAvailability(value: unknown, path: string): PveAvailabilityV1 {
  assertRecord(value, path);
  assertExactKeys(value, ["playerLevelMin", "prerequisiteHuntIds"], path);
  return {
    playerLevelMin: asNullablePositiveInteger(value.playerLevelMin, `${path}.playerLevelMin`),
    prerequisiteHuntIds: asArray(value.prerequisiteHuntIds, `${path}.prerequisiteHuntIds`).map(
      (entry, index) =>
        asString(entry, `${path}.prerequisiteHuntIds[${index}]`) as HuntDefinitionId,
    ),
  };
}

export function parseZoneDefinitionV1(value: unknown, path = "zone"): ZoneDefinitionV1 {
  assertRecord(value, path);
  assertExactKeys(value, ["id", "displayName", "displayOrder", "availability"], path);
  return {
    id: asString(value.id, `${path}.id`) as ZoneId,
    displayName: asString(value.displayName, `${path}.displayName`),
    displayOrder: asIntegerInRange(value.displayOrder, `${path}.displayOrder`, 0),
    availability: parseAvailability(value.availability, `${path}.availability`),
  };
}

export function parseHuntDefinitionV1(value: unknown, path = "hunt"): HuntDefinitionV1 {
  assertRecord(value, path);
  assertExactKeys(
    value,
    ["id", "zoneId", "displayName", "displayOrder", "availability", "recoveryDurationMs"],
    path,
  );
  return {
    id: asString(value.id, `${path}.id`) as HuntDefinitionId,
    zoneId: asString(value.zoneId, `${path}.zoneId`) as ZoneId,
    displayName: asString(value.displayName, `${path}.displayName`),
    displayOrder: asIntegerInRange(value.displayOrder, `${path}.displayOrder`, 0),
    availability: parseAvailability(value.availability, `${path}.availability`),
    recoveryDurationMs: asIntegerInRange(
      value.recoveryDurationMs,
      `${path}.recoveryDurationMs`,
      1,
    ),
  };
}

function parseLevelBand(value: unknown, path: string): EncounterLevelBandV1 {
  assertRecord(value, path);
  assertExactKeys(value, ["min", "max"], path);
  const min = asIntegerInRange(value.min, `${path}.min`, 1, PVE_ENCOUNTER_LEVEL_MAX);
  const max = asIntegerInRange(value.max, `${path}.max`, 1, PVE_ENCOUNTER_LEVEL_MAX);
  if (max < min) fail(path, "must satisfy min <= max", "invalid-level-band");
  return { min, max };
}

function parseItemDrop(value: unknown, path: string): EncounterItemDropInputV1 {
  assertRecord(value, path);
  assertExactKeys(value, ["itemId", "quantity", "chanceBasisPoints"], path);
  return {
    itemId: asString(value.itemId, `${path}.itemId`) as ItemId,
    quantity: asIntegerInRange(value.quantity, `${path}.quantity`, 1),
    chanceBasisPoints: asIntegerInRange(
      value.chanceBasisPoints,
      `${path}.chanceBasisPoints`,
      1,
      10_000,
    ),
  };
}

function parseReward(value: unknown, path: string): EncounterRewardInputV1 {
  assertRecord(value, path);
  assertExactKeys(value, ["pokemonXpPool", "playerXp", "itemDrops"], path);
  return {
    pokemonXpPool: asIntegerInRange(value.pokemonXpPool, `${path}.pokemonXpPool`, 0),
    playerXp:
      value.playerXp === null
        ? null
        : asIntegerInRange(value.playerXp, `${path}.playerXp`, 0),
    itemDrops: asArray(value.itemDrops, `${path}.itemDrops`).map((entry, index) =>
      parseItemDrop(entry, `${path}.itemDrops[${index}]`),
    ),
  };
}

export function parseEncounterDefinitionV1(
  value: unknown,
  path = "encounter",
): EncounterDefinitionV1 {
  assertRecord(value, path);
  assertExactKeys(
    value,
    ["id", "huntId", "speciesId", "weight", "levelBand", "reward"],
    path,
  );
  return {
    id: asString(value.id, `${path}.id`) as EncounterDefinitionId,
    huntId: asString(value.huntId, `${path}.huntId`) as HuntDefinitionId,
    speciesId: asString(value.speciesId, `${path}.speciesId`) as SpeciesId,
    weight: asIntegerInRange(value.weight, `${path}.weight`, 1),
    levelBand: parseLevelBand(value.levelBand, `${path}.levelBand`),
    reward: parseReward(value.reward, `${path}.reward`),
  };
}

export function parsePveContentV1(value: unknown): PveContentV1 {
  assertRecord(value, "pveContent");
  assertExactKeys(value, ["zones", "hunts", "encounters"], "pveContent");
  return {
    zones: asArray(value.zones, "pveContent.zones").map((entry, index) =>
      parseZoneDefinitionV1(entry, `pveContent.zones[${index}]`),
    ),
    hunts: asArray(value.hunts, "pveContent.hunts").map((entry, index) =>
      parseHuntDefinitionV1(entry, `pveContent.hunts[${index}]`),
    ),
    encounters: asArray(value.encounters, "pveContent.encounters").map((entry, index) =>
      parseEncounterDefinitionV1(entry, `pveContent.encounters[${index}]`),
    ),
  };
}

function finding(code: string, path: string, message: string): ValidationFinding {
  return { code, path, message };
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateAvailability(
  availability: PveAvailabilityV1,
  path: string,
  huntIds: ReadonlySet<string>,
  findings: ValidationFinding[],
): void {
  if (
    availability.playerLevelMin !== null &&
    (!Number.isSafeInteger(availability.playerLevelMin) || availability.playerLevelMin < 1)
  ) {
    findings.push(
      finding("invalid-player-level", `${path}.playerLevelMin`, "must be null or a positive safe integer"),
    );
  }
  const seen = new Set<string>();
  for (const [index, prerequisiteHuntId] of availability.prerequisiteHuntIds.entries()) {
    const prerequisitePath = `${path}.prerequisiteHuntIds[${index}]`;
    if (seen.has(prerequisiteHuntId)) {
      findings.push(
        finding("duplicate-canonical-id", prerequisitePath, `duplicate prerequisite HuntId ${prerequisiteHuntId}`),
      );
    }
    seen.add(prerequisiteHuntId);
    if (!huntIds.has(prerequisiteHuntId)) {
      findings.push(
        finding("unresolved-reference", prerequisitePath, `unresolved HuntDefinitionId ${prerequisiteHuntId}`),
      );
    }
  }
}

function duplicateIdFindings<T extends { id: string }>(
  records: readonly T[],
  path: string,
): ValidationFinding[] {
  const seen = new Set<string>();
  const result: ValidationFinding[] = [];
  for (const [index, record] of records.entries()) {
    if (seen.has(record.id)) {
      result.push(
        finding("duplicate-canonical-id", `${path}[${index}].id`, `duplicate canonical id ${record.id}`),
      );
    }
    seen.add(record.id);
  }
  return result;
}

function playabilityRowForLevel(
  evidence: PvePlayabilityEvidence,
  speciesId: string,
  level: number,
): PvePlayabilityEvidenceRow | null {
  let selected: PvePlayabilityEvidenceRow | null = null;
  for (const row of evidence.rows) {
    if (row.speciesId !== speciesId || row.level > level) continue;
    if (selected === null || row.level > selected.level) selected = row;
  }
  return selected;
}

function cycleFindings(content: PveContentV1): ValidationFinding[] {
  const zoneById = new Map(content.zones.map((zone) => [zone.id, zone] as const));
  const huntById = new Map(content.hunts.map((hunt) => [hunt.id, hunt] as const));
  const graph = new Map<string, string[]>();
  for (const hunt of content.hunts) {
    const zone = zoneById.get(hunt.zoneId);
    graph.set(hunt.id, [
      ...hunt.availability.prerequisiteHuntIds,
      ...(zone?.availability.prerequisiteHuntIds ?? []),
    ].filter((id) => huntById.has(id)));
  }

  const findings: ValidationFinding[] = [];
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const reported = new Set<string>();

  const visit = (id: string): void => {
    const current = state.get(id) ?? 0;
    if (current === 2) return;
    if (current === 1) {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(start), id];
      const key = [...new Set(cycle)].sort().join("\u0000");
      if (!reported.has(key)) {
        reported.add(key);
        findings.push(
          finding(
            "prerequisite-cycle",
            `hunts[${id}].availability`,
            `prerequisite cycle detected: ${cycle.join(" -> ")}`,
          ),
        );
      }
      return;
    }
    state.set(id, 1);
    stack.push(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency);
    stack.pop();
    state.set(id, 2);
  };

  for (const id of [...graph.keys()].sort()) visit(id);
  return findings;
}

export function validatePveContentV1(
  content: PveContentV1,
  authority: PveReferenceAuthority,
): ValidationReport {
  const findings: ValidationFinding[] = [
    ...duplicateIdFindings(content.zones, "zones"),
    ...duplicateIdFindings(content.hunts, "hunts"),
    ...duplicateIdFindings(content.encounters, "encounters"),
  ];
  const zoneIds = new Set(content.zones.map(({ id }) => id));
  const huntIds = new Set(content.hunts.map(({ id }) => id));

  for (const [index, zone] of content.zones.entries()) {
    if (!isNonNegativeSafeInteger(zone.displayOrder)) {
      findings.push(
        finding("invalid-display-order", `zones[${index}].displayOrder`, "must be a non-negative safe integer"),
      );
    }
    validateAvailability(zone.availability, `zones[${index}].availability`, huntIds, findings);
  }

  for (const [index, hunt] of content.hunts.entries()) {
    if (!zoneIds.has(hunt.zoneId)) {
      findings.push(
        finding("unresolved-reference", `hunts[${index}].zoneId`, `unresolved ZoneId ${hunt.zoneId}`),
      );
    }
    if (!isNonNegativeSafeInteger(hunt.displayOrder)) {
      findings.push(
        finding("invalid-display-order", `hunts[${index}].displayOrder`, "must be a non-negative safe integer"),
      );
    }
    if (!Number.isSafeInteger(hunt.recoveryDurationMs) || hunt.recoveryDurationMs <= 0) {
      findings.push(
        finding("invalid-recovery", `hunts[${index}].recoveryDurationMs`, "must be a positive safe integer"),
      );
    }
    validateAvailability(hunt.availability, `hunts[${index}].availability`, huntIds, findings);
    if (!content.encounters.some(({ huntId }) => huntId === hunt.id)) {
      findings.push(
        finding("empty-hunt", `hunts[${index}]`, `Hunt ${hunt.id} has no Encounter definitions`),
      );
    }
  }

  for (const [index, encounter] of content.encounters.entries()) {
    const basePath = `encounters[${index}]`;
    if (!huntIds.has(encounter.huntId)) {
      findings.push(
        finding("unresolved-reference", `${basePath}.huntId`, `unresolved HuntDefinitionId ${encounter.huntId}`),
      );
    }
    if (!authority.speciesIds.has(encounter.speciesId)) {
      findings.push(
        finding("unresolved-reference", `${basePath}.speciesId`, `unresolved SpeciesId ${encounter.speciesId}`),
      );
    }
    if (!Number.isSafeInteger(encounter.weight) || encounter.weight <= 0) {
      findings.push(
        finding("invalid-weight", `${basePath}.weight`, "must be a positive safe integer"),
      );
    }
    if (
      !Number.isSafeInteger(encounter.levelBand.min) ||
      !Number.isSafeInteger(encounter.levelBand.max) ||
      encounter.levelBand.min < 1 ||
      encounter.levelBand.max > PVE_ENCOUNTER_LEVEL_MAX ||
      encounter.levelBand.max < encounter.levelBand.min
    ) {
      findings.push(
        finding("invalid-level-band", `${basePath}.levelBand`, "must be an inclusive positive integer band with min <= max"),
      );
    }
    if (
      !isNonNegativeSafeInteger(encounter.reward.pokemonXpPool) ||
      (encounter.reward.playerXp !== null && !isNonNegativeSafeInteger(encounter.reward.playerXp))
    ) {
      findings.push(
        finding("invalid-reward", `${basePath}.reward`, "XP values must be null or non-negative safe integers"),
      );
    }
    for (const [dropIndex, drop] of encounter.reward.itemDrops.entries()) {
      const dropPath = `${basePath}.reward.itemDrops[${dropIndex}]`;
      if (!authority.itemIds.has(drop.itemId)) {
        findings.push(
          finding("unresolved-reference", `${dropPath}.itemId`, `unresolved ItemId ${drop.itemId}`),
        );
      }
      if (!Number.isSafeInteger(drop.quantity) || drop.quantity <= 0) {
        findings.push(
          finding("invalid-item-drop", `${dropPath}.quantity`, "must be a positive safe integer"),
        );
      }
      if (
        !Number.isSafeInteger(drop.chanceBasisPoints) ||
        drop.chanceBasisPoints < 1 ||
        drop.chanceBasisPoints > 10_000
      ) {
        findings.push(
          finding("invalid-item-drop", `${dropPath}.chanceBasisPoints`, "must be an integer in [1, 10000]"),
        );
      }
    }

    if (
      authority.playability !== undefined &&
      Number.isSafeInteger(encounter.levelBand.min) &&
      Number.isSafeInteger(encounter.levelBand.max) &&
      encounter.levelBand.min >= 1 &&
      encounter.levelBand.max >= encounter.levelBand.min
    ) {
      for (let level = encounter.levelBand.min; level <= encounter.levelBand.max; level += 1) {
        const row = playabilityRowForLevel(authority.playability, encounter.speciesId, level);
        if (row === null) {
          findings.push(
            finding(
              "playability-evidence-missing",
              `${basePath}.levelBand`,
              `no TASK-091 playability evidence for ${encounter.speciesId} at level ${level}`,
            ),
          );
        } else if (row.progressCapableExecutableCount <= 0) {
          findings.push(
            finding(
              "zero-progress-capable",
              `${basePath}.levelBand`,
              `${encounter.speciesId} at level ${level} has zero progress-capable executable Moves`,
            ),
          );
        }
      }
    }
  }

  findings.push(...cycleFindings(content));
  findings.sort((left, right) =>
    `${left.path}\u0000${left.code}\u0000${left.message}`.localeCompare(
      `${right.path}\u0000${right.code}\u0000${right.message}`,
      "en",
      { sensitivity: "variant" },
    ),
  );
  return { valid: findings.length === 0, findings };
}

export function resolvePvePlayabilityEvidence(
  evidence: PvePlayabilityEvidence,
  speciesId: string,
  level: number,
): PvePlayabilityEvidenceRow | null {
  if (!Number.isSafeInteger(level) || level < 1) {
    throw new TypeError("level must be a positive safe integer");
  }
  return playabilityRowForLevel(evidence, speciesId, level);
}
