export const HUNT_MUTATION_BODY_MAX_BYTES = 16 * 1024;
export const AUTO_CAPTURE_LOSS_WARNING_V1 = "auto_capture_irreversible_loss_v1" as const;
export const ITEM_QUANTITY_MAX = 9_223_372_036_854_775_807n;
export const ROW_VERSION_MAX = 9_223_372_036_854_775_807n;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DECIMAL_RE = /^(0|[1-9][0-9]*)$/u;
const encoder = new TextEncoder();

export class HuntProtocolError extends Error {
  constructor(
    readonly code: "invalid_request" | "auto_capture_policy_invalid",
    message: string,
  ) {
    super(message);
    this.name = "HuntProtocolError";
  }
}

export interface StartHuntRequest {
  readonly huntDefinitionId: string;
  readonly teamId: string;
}

export interface PokeCenterHealRequest {
  readonly teamId: string;
}

export type ManualCaptureRequest =
  | {
      readonly decision: "attempt";
      readonly encounterId: string;
      readonly selectedItemId: string;
    }
  | {
      readonly decision: "skip";
      readonly encounterId: string;
    };

export interface HuntItemUseRequest {
  readonly itemId: string;
  readonly targetPokemonInstanceId: string;
}

export interface AutoCaptureBallRequest {
  readonly itemId: string;
  readonly autoUseEnabled: boolean;
  readonly minimumReserve: string;
}

export interface AutoCaptureWhenRequest {
  readonly shiny?: boolean;
  readonly speciesIds?: readonly string[];
  readonly zoneIds?: readonly string[];
  readonly huntDefinitionIds?: readonly string[];
  readonly catchRateMin?: number;
  readonly catchRateMax?: number;
}

export interface AutoCaptureRuleRequest {
  readonly when: AutoCaptureWhenRequest;
  readonly selectedItemId: string;
}

export interface AutoCapturePolicyReplaceRequest {
  readonly expectedRowVersion: string;
  readonly enabled: boolean;
  readonly lossWarningAcknowledgement?: typeof AUTO_CAPTURE_LOSS_WARNING_V1 | string;
  readonly balls: readonly AutoCaptureBallRequest[];
  readonly rules: readonly AutoCaptureRuleRequest[];
}

export function isCanonicalUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function assertCanonicalUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !isCanonicalUuid(value)) {
    throw new HuntProtocolError("invalid_request", `${label} must be a canonical lowercase UUID`);
  }
  return value;
}

export function assertOpaqueId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new HuntProtocolError("invalid_request", `${label} must be a bounded non-empty opaque id`);
  }
  return value;
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HuntProtocolError("invalid_request", `${label} must be an object`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
  label = "body",
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new HuntProtocolError("invalid_request", `${label} contains unknown field: ${key}`);
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new HuntProtocolError("invalid_request", `${label} is missing field: ${key}`);
    }
  }
}

function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new HuntProtocolError("invalid_request", `${label} must be boolean`);
  return value;
}

function assertSafeInteger(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new HuntProtocolError("invalid_request", `${label} must be an integer in ${min}..${max}`);
  }
  return value;
}

function assertDecimal(value: unknown, max: bigint, label: string): string {
  if (typeof value !== "string" || !DECIMAL_RE.test(value)) {
    throw new HuntProtocolError("invalid_request", `${label} must be canonical decimal text`);
  }
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > max) {
    throw new HuntProtocolError("invalid_request", `${label} exceeds its accepted integer domain`);
  }
  return parsed.toString();
}

export function parseJsonMutationBodyText(text: string): Record<string, unknown> {
  if (encoder.encode(text).byteLength > HUNT_MUTATION_BODY_MAX_BYTES) {
    throw new HuntProtocolError("invalid_request", "mutation body exceeds 16 KiB");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new HuntProtocolError("invalid_request", "mutation body must be valid JSON");
  }
  assertRecord(parsed, "body");
  return parsed;
}

export function parseEmptyMutationBodyText(text: string): Record<string, never> {
  if (text.length === 0) return {};
  const parsed = parseJsonMutationBodyText(text);
  assertExactKeys(parsed, [], [], "body");
  return {};
}

export function parseStartHuntBody(text: string): StartHuntRequest {
  const value = parseJsonMutationBodyText(text);
  assertExactKeys(value, ["huntDefinitionId", "teamId"]);
  return {
    huntDefinitionId: assertOpaqueId(value.huntDefinitionId, "huntDefinitionId"),
    teamId: assertCanonicalUuid(value.teamId, "teamId"),
  };
}

export function parsePokeCenterHealBody(text: string): PokeCenterHealRequest {
  const value = parseJsonMutationBodyText(text);
  assertExactKeys(value, ["teamId"]);
  return {
    teamId: assertCanonicalUuid(value.teamId, "teamId"),
  };
}

export function parseManualCaptureBody(text: string): ManualCaptureRequest {
  const value = parseJsonMutationBodyText(text);
  if (value.decision === "attempt") {
    assertExactKeys(value, ["decision", "encounterId", "selectedItemId"]);
    return {
      decision: "attempt",
      encounterId: assertOpaqueId(value.encounterId, "encounterId"),
      selectedItemId: assertOpaqueId(value.selectedItemId, "selectedItemId"),
    };
  }
  if (value.decision === "skip") {
    assertExactKeys(value, ["decision", "encounterId"]);
    return {
      decision: "skip",
      encounterId: assertOpaqueId(value.encounterId, "encounterId"),
    };
  }
  throw new HuntProtocolError("invalid_request", "decision must be attempt or skip");
}

export function parseHuntItemUseBody(text: string): HuntItemUseRequest {
  const value = parseJsonMutationBodyText(text);
  assertExactKeys(value, ["itemId", "targetPokemonInstanceId"]);
  return {
    itemId: assertOpaqueId(value.itemId, "itemId"),
    targetPokemonInstanceId: assertCanonicalUuid(value.targetPokemonInstanceId, "targetPokemonInstanceId"),
  };
}

function parseOpaqueIdList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) {
    throw new HuntProtocolError("invalid_request", `${label} must contain 1..64 entries`);
  }
  const parsed = value.map((entry, index) => assertOpaqueId(entry, `${label}[${index}]`));
  if (new Set(parsed).size !== parsed.length) {
    throw new HuntProtocolError("auto_capture_policy_invalid", `${label} contains duplicates`);
  }
  return parsed;
}

function parseWhen(value: unknown, label: string): AutoCaptureWhenRequest {
  assertRecord(value, label);
  assertExactKeys(
    value,
    [],
    ["shiny", "speciesIds", "zoneIds", "huntDefinitionIds", "catchRateMin", "catchRateMax"],
    label,
  );
  const when: {
    shiny?: boolean;
    speciesIds?: readonly string[];
    zoneIds?: readonly string[];
    huntDefinitionIds?: readonly string[];
    catchRateMin?: number;
    catchRateMax?: number;
  } = {};
  if (value.shiny !== undefined) when.shiny = assertBoolean(value.shiny, `${label}.shiny`);
  if (value.speciesIds !== undefined) when.speciesIds = parseOpaqueIdList(value.speciesIds, `${label}.speciesIds`);
  if (value.zoneIds !== undefined) when.zoneIds = parseOpaqueIdList(value.zoneIds, `${label}.zoneIds`);
  if (value.huntDefinitionIds !== undefined) {
    when.huntDefinitionIds = parseOpaqueIdList(value.huntDefinitionIds, `${label}.huntDefinitionIds`);
  }
  if (value.catchRateMin !== undefined) {
    when.catchRateMin = assertSafeInteger(value.catchRateMin, 3, 255, `${label}.catchRateMin`);
  }
  if (value.catchRateMax !== undefined) {
    when.catchRateMax = assertSafeInteger(value.catchRateMax, 3, 255, `${label}.catchRateMax`);
  }
  return when;
}

export function parseAutoCapturePolicyReplaceBody(text: string): AutoCapturePolicyReplaceRequest {
  const value = parseJsonMutationBodyText(text);
  assertExactKeys(
    value,
    ["expectedRowVersion", "enabled", "balls", "rules"],
    ["lossWarningAcknowledgement"],
  );
  const enabled = assertBoolean(value.enabled, "enabled");
  if (!Array.isArray(value.balls) || value.balls.length > 16) {
    throw new HuntProtocolError("invalid_request", "balls must be an array with at most 16 entries");
  }
  if (!Array.isArray(value.rules) || value.rules.length > 64) {
    throw new HuntProtocolError("invalid_request", "rules must be an array with at most 64 entries");
  }
  const balls = value.balls.map((entry, index): AutoCaptureBallRequest => {
    assertRecord(entry, `balls[${index}]`);
    assertExactKeys(entry, ["itemId", "autoUseEnabled", "minimumReserve"], [], `balls[${index}]`);
    return {
      itemId: assertOpaqueId(entry.itemId, `balls[${index}].itemId`),
      autoUseEnabled: assertBoolean(entry.autoUseEnabled, `balls[${index}].autoUseEnabled`),
      minimumReserve: assertDecimal(entry.minimumReserve, ITEM_QUANTITY_MAX, `balls[${index}].minimumReserve`),
    };
  });
  const rules = value.rules.map((entry, index): AutoCaptureRuleRequest => {
    assertRecord(entry, `rules[${index}]`);
    assertExactKeys(entry, ["when", "selectedItemId"], [], `rules[${index}]`);
    return {
      when: parseWhen(entry.when, `rules[${index}].when`),
      selectedItemId: assertOpaqueId(entry.selectedItemId, `rules[${index}].selectedItemId`),
    };
  });
  const acknowledgement = value.lossWarningAcknowledgement;
  if (acknowledgement !== undefined && typeof acknowledgement !== "string") {
    throw new HuntProtocolError("invalid_request", "lossWarningAcknowledgement must be a string");
  }
  const result: {
    expectedRowVersion: string;
    enabled: boolean;
    lossWarningAcknowledgement?: string;
    balls: readonly AutoCaptureBallRequest[];
    rules: readonly AutoCaptureRuleRequest[];
  } = {
    expectedRowVersion: assertDecimal(value.expectedRowVersion, ROW_VERSION_MAX, "expectedRowVersion"),
    enabled,
    balls,
    rules,
  };
  if (acknowledgement !== undefined) result.lossWarningAcknowledgement = acknowledgement;
  return result;
}

export function validateAutoCapturePolicyRelationships(policy: AutoCapturePolicyReplaceRequest): string | null {
  if (
    policy.lossWarningAcknowledgement !== undefined
    && policy.lossWarningAcknowledgement !== AUTO_CAPTURE_LOSS_WARNING_V1
  ) {
    return "lossWarningAcknowledgement is not the accepted warning token";
  }
  if (policy.enabled && policy.lossWarningAcknowledgement !== AUTO_CAPTURE_LOSS_WARNING_V1) {
    return "enabled policy requires the accepted loss warning acknowledgement";
  }
  const ballIds = policy.balls.map(({ itemId }) => itemId);
  if (new Set(ballIds).size !== ballIds.length) return "Ball entries must have unique itemId";
  const balls = new Map(policy.balls.map((ball) => [ball.itemId, ball] as const));
  if (policy.enabled && (!policy.rules.length || !policy.balls.some(({ autoUseEnabled }) => autoUseEnabled))) {
    return "enabled policy requires at least one rule and one enabled Ball";
  }
  for (const [index, rule] of policy.rules.entries()) {
    const configured = balls.get(rule.selectedItemId);
    if (!configured || !configured.autoUseEnabled) {
      return `rules[${index}].selectedItemId must reference an explicitly enabled Ball`;
    }
    if (
      rule.when.catchRateMin !== undefined
      && rule.when.catchRateMax !== undefined
      && rule.when.catchRateMin > rule.when.catchRateMax
    ) {
      return `rules[${index}] catchRateMin cannot exceed catchRateMax`;
    }
  }
  return null;
}

export async function hashNormalizedIntent(value: object): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(value)));
  return new Uint8Array(digest);
}
