import type { HuntInputAuthorityRecord, OwnedTeamSnapshot } from "@pokenexus/database";
import {
  ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
  GENETIC_PROFILES,
  PLAYER_PROGRESSION_RULE_ID,
  POKEMON_PROGRESSION_RULE_ID,
  allocateGeneticBudget,
  assertHuntAutomationPolicyAuthoritySnapshot,
  deriveLevelAvailableMoves,
  deriveMaxHpForRulesVersion,
  geneticBudgetForScore,
  resolveProductionBattleAbility,
  usesGeneticCombatSemantics,
  replayValidateSoloHuntCompletedCaptureSource,
  selectBootstrapMoveLoadout,
  type CaptureBallRuleV1,
  type EffectMagnitude,
  type EncounterIndividualizationAuthority,
  type GeneticProfile,
  type HuntAutomationPolicyAuthoritySnapshot,
  type ProductionCombatRuleCatalog,
  type ResolvedCombatContext,
  type SoloHuntEncounterOption,
  type SoloHuntOpponentTemplate,
  type SoloHuntPendingEncounterSelection,
  type SoloHuntRuntimeInputs,
  type SoloHuntTeamMemberSnapshot,
} from "@pokenexus/game-core";
import {
  createHttpGameDataReader,
  loadRuntimeGameDataArtifact,
  loadRuntimeGameDataVersion,
  type EncounterDefinitionV1,
  type HuntDefinitionV1,
  type RuntimeGameDataReader,
  type SpeciesDefinitionV2,
  type TypeEffectivenessEntry,
  type ZoneDefinitionV1,
} from "@pokenexus/game-data/runtime";
import type { MoveEligibilityContext, MoveEligibilityContextLoader } from "../moves/context";
import { MoveAuthorityUnavailableError } from "../moves/context";
import {
  createConfiguredMoveAuthorities,
  createConfiguredMoveContextLoader,
  type PlayerStateEnvironment,
} from "../player/runtime";
import {
  RewardApplicationService,
  createRuntimePinnedRewardContextLoader,
} from "../rewards/application";
import {
  HuntApplication,
  HuntAuthorityUnavailableError,
  type BuiltHuntRuntimeAuthority,
  type CaptureBallAuthorityRelease,
  type HuntBoundaryEffectsPort,
  type HuntHistoricalEncounterAuthority,
  type HuntManualCaptureEffectsPort,
  type HuntRuntimeAuthorityPort,
  type HuntStartSelectorAuthority,
} from "./application";
import {
  SoloHuntCaptureResolutionService,
  SoloHuntRewardApplicationService,
  createTransactionCaptureAttemptRepository,
  type HistoricalEncounterAuthorityLoader,
} from "./capture-reward";
import { assertStrictSoloHuntStartTeamAdmission } from "./start-admission";

export const HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V1 = "hunt-runtime-inputs-v1" as const;
export const HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V2 = "hunt-runtime-inputs-v2" as const;
export const HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V3 = "hunt-runtime-inputs-v3" as const;
export const HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V4 = "hunt-runtime-inputs-v4" as const;
const INDIVIDUALIZATION_KEY_ID_DOMAIN = "pokenexus-individualization-authority-key-id-v1";
const CAPTURE_BALL_POWERS = new Set<CaptureBallRuleV1["powerQuarterUnits"]>([4, 5, 6, 8, 9]);
const GENETIC_PROFILE_SET = new Set<string>(GENETIC_PROFILES);

export interface HuntRuntimeEnvironment extends PlayerStateEnvironment {
  /** Private producer gate only. Public GET route/capability remains disabled. */
  readonly HUNT_PRESENTATION_SOURCE_ENABLED?: string;
  readonly HUNT_CAPTURE_BALL_AUTHORITY_VERSION?: string;
  readonly HUNT_CAPTURE_BALL_RELEASES?: string;
  readonly HUNT_ITEM_RULE_RELEASES?: string;
  readonly HUNT_GENETIC_PROFILE_RELEASES?: string;
  readonly HUNT_INDIVIDUALIZATION_AUTHORITY_VERSION?: string;
  readonly HUNT_INDIVIDUALIZATION_AUTHORITY_RELEASES?: string;
  readonly HUNT_COMBAT_EVENT_SCHEMA_VERSION?: string;
  readonly HUNT_INTER_BATTLE_GAP_MS?: string;
}

export interface CaptureBallAuthorityEntry extends CaptureBallRuleV1 {
  readonly premium: boolean;
}

export interface CaptureBallAuthorityRuntimeRelease extends CaptureBallAuthorityRelease {
  readonly newOperationsAllowed: boolean;
}

export interface CaptureBallAuthorityReleaseResolver {
  current(): Promise<CaptureBallAuthorityRuntimeRelease>;
  resolve(version: string): Promise<CaptureBallAuthorityRuntimeRelease | null>;
}

export type HuntItemRuleV1 =
  | { readonly useKind: "none" }
  | { readonly useKind: "capture-attempt" }
  | {
      readonly useKind: "heal-hp";
      readonly magnitude:
        | { readonly kind: "fixed"; readonly amount: number }
        | {
            readonly kind: "max-hp-fraction";
            readonly numerator: number;
            readonly denominator: number;
          };
    }
  | {
      readonly useKind: "revive-hp";
      readonly magnitude: {
        readonly kind: "max-hp-fraction";
        readonly numerator: number;
        readonly denominator: number;
      };
    };

export interface HuntItemRuleRelease {
  readonly itemRuleVersion: string;
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
  readonly rulesByItemId: ReadonlyMap<string, HuntItemRuleV1>;
}

export interface HuntItemRuleReleaseResolver {
  resolve(input: {
    readonly gameDataVersion: string;
    readonly rulesVersion: string;
  }): Promise<HuntItemRuleRelease | null>;
  require(input: {
    readonly gameDataVersion: string;
    readonly rulesVersion: string;
  }): Promise<HuntItemRuleRelease>;
}

export interface GeneticProfilePairRelease {
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
  readonly profilesBySpeciesId: ReadonlyMap<string, readonly [GeneticProfile, GeneticProfile]>;
}

export interface GeneticProfilePairReleaseResolver {
  resolve(input: {
    readonly gameDataVersion: string;
    readonly rulesVersion: string;
  }): Promise<GeneticProfilePairRelease | null>;
  require(input: {
    readonly gameDataVersion: string;
    readonly rulesVersion: string;
  }): Promise<GeneticProfilePairRelease>;
}

interface EncounterIndividualizationAuthorityRuntimeRelease {
  readonly authority: EncounterIndividualizationAuthority;
  readonly newOperationsAllowed: boolean;
}

export interface EncounterIndividualizationAuthorityResolver {
  current(): Promise<EncounterIndividualizationAuthority>;
  resolve(input: {
    readonly rulesVersion: string;
    readonly authorityVersion: string;
    readonly keyId: string;
  }): Promise<EncounterIndividualizationAuthority | null>;
}

export interface PublishedHuntGameDataAuthority {
  readonly gameDataVersion: string;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly species: readonly SpeciesDefinitionV2[];
  readonly typeEffectiveness: readonly TypeEffectivenessEntry[];
  readonly zones: readonly ZoneDefinitionV1[];
  readonly hunts: readonly HuntDefinitionV1[];
  readonly encounters: readonly EncounterDefinitionV1[];
  readonly speciesById: ReadonlyMap<string, SpeciesDefinitionV2>;
  readonly zonesById: ReadonlyMap<string, ZoneDefinitionV1>;
  readonly huntsById: ReadonlyMap<string, HuntDefinitionV1>;
  readonly encountersById: ReadonlyMap<string, EncounterDefinitionV1>;
}

export interface ExactPublishedHuntGameDataLoader {
  load(gameDataVersion: string): Promise<PublishedHuntGameDataAuthority>;
}

export interface CreateHuntRuntimeAuthorityPortOptions {
  readonly env: HuntRuntimeEnvironment;
  readonly moveContextLoader: MoveEligibilityContextLoader;
  readonly gameDataReader?: RuntimeGameDataReader;
}

interface PersistedRuntimeEnvelope {
  readonly schemaVersion:
    | typeof HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V1
    | typeof HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V2
    | typeof HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V3
    | typeof HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V4;
  readonly inputs: Omit<SoloHuntRuntimeInputs, "individualizationAuthority">;
  readonly individualizationRequired: boolean;
}

function unavailable(message: string, cause?: unknown): HuntAuthorityUnavailableError {
  return new HuntAuthorityUnavailableError(message, cause === undefined ? undefined : { cause });
}

function required(value: string | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw unavailable(`${label} is unavailable`);
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
  label: string,
): void {
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label}.${key} is not accepted`);
  }
  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) throw new TypeError(`${label}.${key} is required`);
  }
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new TypeError(`${label} must be a bounded non-empty string`);
  }
  return value.normalize("NFC");
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function parseReleaseArray(raw: string | undefined, label: string): unknown[] {
  if (typeof raw !== "string" || raw.length === 0) throw unavailable(`${label} is unavailable`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (cause) {
    throw unavailable(`${label} is invalid`, cause);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw unavailable(`${label} is unavailable`);
  return parsed;
}

function uniqueMap<T>(values: readonly T[], keyFor: (value: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const key = keyFor(value);
    if (result.has(key)) throw new TypeError(`duplicate ${label}: ${key}`);
    result.set(key, value);
  }
  return result;
}

function pairKey(gameDataVersion: string, rulesVersion: string): string {
  return JSON.stringify([gameDataVersion, rulesVersion]);
}

export function parseCaptureBallAuthorityReleases(
  raw: string | undefined,
): readonly CaptureBallAuthorityRuntimeRelease[] {
  try {
    return parseReleaseArray(raw, "HUNT_CAPTURE_BALL_RELEASES").map((entry, releaseIndex) => {
      const release = record(entry, `captureBallReleases[${releaseIndex}]`);
      exactKeys(
        release,
        ["ballAuthorityVersion", "newOperationsAllowed", "balls"],
        [],
        `captureBallReleases[${releaseIndex}]`,
      );
      if (typeof release.newOperationsAllowed !== "boolean") {
        throw new TypeError(`captureBallReleases[${releaseIndex}].newOperationsAllowed must be boolean`);
      }
      if (!Array.isArray(release.balls) || release.balls.length === 0) {
        throw new TypeError(`captureBallReleases[${releaseIndex}].balls must be non-empty`);
      }
      const balls = release.balls.map((ballEntry, ballIndex): CaptureBallAuthorityEntry => {
        const ball = record(ballEntry, `captureBallReleases[${releaseIndex}].balls[${ballIndex}]`);
        exactKeys(
          ball,
          ["itemId", "powerQuarterUnits", "premium"],
          [],
          `captureBallReleases[${releaseIndex}].balls[${ballIndex}]`,
        );
        if (!CAPTURE_BALL_POWERS.has(ball.powerQuarterUnits as CaptureBallRuleV1["powerQuarterUnits"])) {
          throw new TypeError(`captureBallReleases[${releaseIndex}].balls[${ballIndex}].powerQuarterUnits is invalid`);
        }
        if (typeof ball.premium !== "boolean") {
          throw new TypeError(`captureBallReleases[${releaseIndex}].balls[${ballIndex}].premium must be boolean`);
        }
        return {
          itemId: nonEmptyString(ball.itemId, `captureBallReleases[${releaseIndex}].balls[${ballIndex}].itemId`) as never,
          powerQuarterUnits: ball.powerQuarterUnits as CaptureBallRuleV1["powerQuarterUnits"],
          premium: ball.premium,
        };
      });
      uniqueMap(balls, ({ itemId }) => itemId, "capture Ball ItemId");
      return {
        version: nonEmptyString(release.ballAuthorityVersion, `captureBallReleases[${releaseIndex}].ballAuthorityVersion`),
        newOperationsAllowed: release.newOperationsAllowed,
        balls,
      };
    });
  } catch (cause) {
    if (cause instanceof HuntAuthorityUnavailableError) throw cause;
    throw unavailable("capture Ball authority releases are invalid", cause);
  }
}

export function createCaptureBallAuthorityReleaseResolver(input: {
  readonly releases: readonly CaptureBallAuthorityRuntimeRelease[];
  readonly currentVersion: string;
}): CaptureBallAuthorityReleaseResolver {
  const byVersion = uniqueMap(input.releases, ({ version }) => version, "capture Ball authority version");
  return {
    async current() {
      const release = byVersion.get(input.currentVersion);
      if (!release || !release.newOperationsAllowed) {
        throw unavailable(`current capture Ball authority is unavailable: ${input.currentVersion}`);
      }
      return release;
    },
    async resolve(version) {
      return byVersion.get(version) ?? null;
    },
  };
}

function parseItemRule(value: unknown, label: string): HuntItemRuleV1 {
  const rule = record(value, label);
  const useKind = nonEmptyString(rule.useKind, `${label}.useKind`);
  if (useKind === "none" || useKind === "capture-attempt") {
    exactKeys(rule, ["useKind"], [], label);
    return { useKind };
  }
  if (useKind === "revive-hp") {
    exactKeys(rule, ["useKind", "magnitude"], [], label);
    const magnitude = record(rule.magnitude, `${label}.magnitude`);
    exactKeys(magnitude, ["kind", "numerator", "denominator"], [], `${label}.magnitude`);
    if (magnitude.kind !== "max-hp-fraction") {
      throw new TypeError(`${label}.magnitude.kind must be max-hp-fraction for revive-hp`);
    }
    const numerator = positiveInteger(magnitude.numerator, `${label}.magnitude.numerator`);
    const denominator = positiveInteger(magnitude.denominator, `${label}.magnitude.denominator`);
    const accepted = (numerator === 1 && denominator === 4)
      || (numerator === 1 && denominator === 2)
      || (numerator === 1 && denominator === 1);
    if (!accepted) throw new TypeError(`${label} revive-hp fraction must be exactly 25%, 50% or 100%`);
    return { useKind, magnitude: { kind: "max-hp-fraction", numerator, denominator } };
  }
  if (useKind !== "heal-hp") throw new TypeError(`${label}.useKind is unsupported`);
  exactKeys(rule, ["useKind", "magnitude"], [], label);
  const magnitude = record(rule.magnitude, `${label}.magnitude`);
  const kind = nonEmptyString(magnitude.kind, `${label}.magnitude.kind`);
  if (kind === "fixed") {
    exactKeys(magnitude, ["kind", "amount"], [], `${label}.magnitude`);
    return {
      useKind,
      magnitude: { kind, amount: positiveInteger(magnitude.amount, `${label}.magnitude.amount`) },
    };
  }
  if (kind === "max-hp-fraction") {
    exactKeys(magnitude, ["kind", "numerator", "denominator"], [], `${label}.magnitude`);
    return {
      useKind,
      magnitude: {
        kind,
        numerator: positiveInteger(magnitude.numerator, `${label}.magnitude.numerator`),
        denominator: positiveInteger(magnitude.denominator, `${label}.magnitude.denominator`),
      },
    };
  }
  throw new TypeError(`${label}.magnitude.kind is unsupported`);
}

export function parseHuntItemRuleReleases(raw: string | undefined): readonly HuntItemRuleRelease[] {
  try {
    return parseReleaseArray(raw, "HUNT_ITEM_RULE_RELEASES").map((entry, releaseIndex) => {
      const release = record(entry, `itemRuleReleases[${releaseIndex}]`);
      exactKeys(
        release,
        ["itemRuleVersion", "gameDataVersion", "rulesVersion", "items"],
        [],
        `itemRuleReleases[${releaseIndex}]`,
      );
      if (!Array.isArray(release.items)) throw new TypeError(`itemRuleReleases[${releaseIndex}].items must be an array`);
      const rules = release.items.map((entryValue, itemIndex) => {
        const item = record(entryValue, `itemRuleReleases[${releaseIndex}].items[${itemIndex}]`);
        exactKeys(item, ["itemId", "rule"], [], `itemRuleReleases[${releaseIndex}].items[${itemIndex}]`);
        return {
          itemId: nonEmptyString(item.itemId, `itemRuleReleases[${releaseIndex}].items[${itemIndex}].itemId`),
          rule: parseItemRule(item.rule, `itemRuleReleases[${releaseIndex}].items[${itemIndex}].rule`),
        };
      });
      return {
        itemRuleVersion: nonEmptyString(release.itemRuleVersion, `itemRuleReleases[${releaseIndex}].itemRuleVersion`),
        gameDataVersion: nonEmptyString(release.gameDataVersion, `itemRuleReleases[${releaseIndex}].gameDataVersion`),
        rulesVersion: nonEmptyString(release.rulesVersion, `itemRuleReleases[${releaseIndex}].rulesVersion`),
        rulesByItemId: new Map(
          [...uniqueMap(rules, ({ itemId }) => itemId, "ItemRule ItemId")]
            .map(([itemId, { rule }]) => [itemId, rule] as const),
        ),
      };
    });
  } catch (cause) {
    if (cause instanceof HuntAuthorityUnavailableError) throw cause;
    throw unavailable("ItemRule releases are invalid", cause);
  }
}

export function createHuntItemRuleReleaseResolver(
  releases: readonly HuntItemRuleRelease[],
): HuntItemRuleReleaseResolver {
  const byPair = uniqueMap(releases, ({ gameDataVersion, rulesVersion }) => pairKey(gameDataVersion, rulesVersion), "ItemRule pair");
  return {
    async resolve(input) {
      return byPair.get(pairKey(input.gameDataVersion, input.rulesVersion)) ?? null;
    },
    async require(input) {
      const release = byPair.get(pairKey(input.gameDataVersion, input.rulesVersion));
      if (!release) throw unavailable(`ItemRule authority is unavailable for ${input.gameDataVersion} + ${input.rulesVersion}`);
      return release;
    },
  };
}

export function normalizeHealingItemMagnitude(rule: Extract<HuntItemRuleV1, { useKind: "heal-hp" }>): EffectMagnitude {
  return rule.magnitude.kind === "fixed"
    ? { kind: "integer", amount: rule.magnitude.amount }
    : {
        kind: "maxHpFraction",
        numerator: rule.magnitude.numerator,
        denominator: rule.magnitude.denominator,
      };
}

function parseGeneticProfile(value: unknown, label: string): GeneticProfile {
  const profile = nonEmptyString(value, label);
  if (!GENETIC_PROFILE_SET.has(profile)) throw new TypeError(`${label} is not an accepted Genetic Profile`);
  return profile as GeneticProfile;
}

export function parseGeneticProfilePairReleases(raw: string | undefined): readonly GeneticProfilePairRelease[] {
  try {
    return parseReleaseArray(raw, "HUNT_GENETIC_PROFILE_RELEASES").map((entry, releaseIndex) => {
      const release = record(entry, `geneticProfileReleases[${releaseIndex}]`);
      exactKeys(
        release,
        ["gameDataVersion", "rulesVersion", "species"],
        [],
        `geneticProfileReleases[${releaseIndex}]`,
      );
      if (!Array.isArray(release.species) || release.species.length === 0) {
        throw new TypeError(`geneticProfileReleases[${releaseIndex}].species must be non-empty`);
      }
      const rows = release.species.map((rowValue, speciesIndex) => {
        const row = record(rowValue, `geneticProfileReleases[${releaseIndex}].species[${speciesIndex}]`);
        exactKeys(
          row,
          ["speciesId", "compatibleProfiles"],
          [],
          `geneticProfileReleases[${releaseIndex}].species[${speciesIndex}]`,
        );
        if (!Array.isArray(row.compatibleProfiles) || row.compatibleProfiles.length !== 2) {
          throw new TypeError(`geneticProfileReleases[${releaseIndex}].species[${speciesIndex}].compatibleProfiles must contain exactly two entries`);
        }
        const profiles = [
          parseGeneticProfile(row.compatibleProfiles[0], `geneticProfileReleases[${releaseIndex}].species[${speciesIndex}].compatibleProfiles[0]`),
          parseGeneticProfile(row.compatibleProfiles[1], `geneticProfileReleases[${releaseIndex}].species[${speciesIndex}].compatibleProfiles[1]`),
        ] as const;
        if (profiles[0] === profiles[1]) {
          throw new TypeError(`geneticProfileReleases[${releaseIndex}].species[${speciesIndex}].compatibleProfiles must be distinct`);
        }
        return {
          speciesId: nonEmptyString(row.speciesId, `geneticProfileReleases[${releaseIndex}].species[${speciesIndex}].speciesId`),
          profiles,
        };
      });
      uniqueMap(rows, ({ speciesId }) => speciesId, "Genetic Profile SpeciesId");
      return {
        gameDataVersion: nonEmptyString(release.gameDataVersion, `geneticProfileReleases[${releaseIndex}].gameDataVersion`),
        rulesVersion: nonEmptyString(release.rulesVersion, `geneticProfileReleases[${releaseIndex}].rulesVersion`),
        profilesBySpeciesId: new Map(rows.map(({ speciesId, profiles }) => [speciesId, profiles] as const)),
      };
    });
  } catch (cause) {
    if (cause instanceof HuntAuthorityUnavailableError) throw cause;
    throw unavailable("Genetic Profile releases are invalid", cause);
  }
}

export function createGeneticProfilePairReleaseResolver(
  releases: readonly GeneticProfilePairRelease[],
): GeneticProfilePairReleaseResolver {
  const byPair = uniqueMap(releases, ({ gameDataVersion, rulesVersion }) => pairKey(gameDataVersion, rulesVersion), "Genetic Profile pair");
  return {
    async resolve(input) {
      return byPair.get(pairKey(input.gameDataVersion, input.rulesVersion)) ?? null;
    },
    async require(input) {
      const release = byPair.get(pairKey(input.gameDataVersion, input.rulesVersion));
      if (!release) throw unavailable(`Genetic Profile authority is unavailable for ${input.gameDataVersion} + ${input.rulesVersion}`);
      return release;
    },
  };
}

function decodeBase64Url(value: unknown, label: string): Uint8Array {
  const encoded = nonEmptyString(value, label);
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) throw new TypeError(`${label} must be unpadded base64url`);
  const base64 = encoded.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  let decoded: string;
  try {
    decoded = atob(padded);
  } catch {
    throw new TypeError(`${label} must be canonical base64url`);
  }
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  if (bytes.length < 32) throw new TypeError(`${label} must decode to at least 32 bytes`);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function deriveEncounterIndividualizationAuthorityKeyId(secretKey: Uint8Array): Promise<string> {
  if (!(secretKey instanceof Uint8Array) || secretKey.length < 32) {
    throw new TypeError("individualization secretKey must contain at least 32 bytes");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(secretKey).buffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(INDIVIDUALIZATION_KEY_ID_DOMAIN),
  );
  return `key-v1:${bytesToHex(new Uint8Array(signature))}`;
}

export function parseEncounterIndividualizationAuthorityReleases(
  raw: string | undefined,
): readonly EncounterIndividualizationAuthorityRuntimeRelease[] {
  try {
    return parseReleaseArray(raw, "HUNT_INDIVIDUALIZATION_AUTHORITY_RELEASES").map((entry, releaseIndex) => {
      const release = record(entry, `individualizationReleases[${releaseIndex}]`);
      exactKeys(
        release,
        ["rulesVersion", "authorityVersion", "keyId", "secretKeyBase64url", "newOperationsAllowed"],
        [],
        `individualizationReleases[${releaseIndex}]`,
      );
      if (release.rulesVersion !== ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1) {
        throw new TypeError(`individualizationReleases[${releaseIndex}].rulesVersion is unsupported`);
      }
      if (typeof release.newOperationsAllowed !== "boolean") {
        throw new TypeError(`individualizationReleases[${releaseIndex}].newOperationsAllowed must be boolean`);
      }
      return {
        authority: {
          rulesVersion: ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
          authorityVersion: nonEmptyString(release.authorityVersion, `individualizationReleases[${releaseIndex}].authorityVersion`),
          keyId: nonEmptyString(release.keyId, `individualizationReleases[${releaseIndex}].keyId`),
          secretKey: decodeBase64Url(release.secretKeyBase64url, `individualizationReleases[${releaseIndex}].secretKeyBase64url`),
        },
        newOperationsAllowed: release.newOperationsAllowed,
      };
    });
  } catch (cause) {
    if (cause instanceof HuntAuthorityUnavailableError) throw cause;
    throw unavailable("Encounter individualization authority releases are invalid", cause);
  }
}

async function validatedIndividualizationAuthority(
  release: EncounterIndividualizationAuthorityRuntimeRelease,
): Promise<EncounterIndividualizationAuthority> {
  const derivedKeyId = await deriveEncounterIndividualizationAuthorityKeyId(release.authority.secretKey);
  if (derivedKeyId !== release.authority.keyId) {
    throw unavailable(`Encounter individualization authority keyId is invalid for ${release.authority.authorityVersion}`);
  }
  return {
    ...release.authority,
    secretKey: new Uint8Array(release.authority.secretKey),
  };
}

export function createEncounterIndividualizationAuthorityResolver(input: {
  readonly releases: readonly EncounterIndividualizationAuthorityRuntimeRelease[];
  readonly currentAuthorityVersion: string;
}): EncounterIndividualizationAuthorityResolver {
  const byVersion = uniqueMap(
    input.releases,
    ({ authority }) => authority.authorityVersion,
    "Encounter individualization authority version",
  );
  return {
    async current() {
      const release = byVersion.get(input.currentAuthorityVersion);
      if (!release || !release.newOperationsAllowed) {
        throw unavailable(`current Encounter individualization authority is unavailable: ${input.currentAuthorityVersion}`);
      }
      return validatedIndividualizationAuthority(release);
    },
    async resolve(request) {
      const release = byVersion.get(request.authorityVersion);
      if (
        !release
        || release.authority.rulesVersion !== request.rulesVersion
        || release.authority.keyId !== request.keyId
      ) return null;
      return validatedIndividualizationAuthority(release);
    },
  };
}

function assertUniqueId<T extends { readonly id: string }>(rows: readonly T[], label: string): Map<string, T> {
  return uniqueMap(rows, ({ id }) => id, label);
}

export function assertPublishedHuntPveManifest(manifest: {
  readonly schemaVersion: string;
  readonly pveContentSchemaVersion?: unknown;
}): asserts manifest is {
  readonly schemaVersion: "4" | "5";
  readonly pveContentSchemaVersion: string;
} {
  if (
    typeof manifest.pveContentSchemaVersion !== "string"
    || (manifest.schemaVersion !== "4" && manifest.schemaVersion !== "5")
  ) {
    throw new Error("published game-data release does not contain PVE content authority");
  }
}

export function createPublishedHuntGameDataLoader(
  reader: RuntimeGameDataReader,
): ExactPublishedHuntGameDataLoader {
  return {
    async load(gameDataVersion) {
      try {
        const version = await loadRuntimeGameDataVersion(reader, gameDataVersion);
        if (version.gameDataVersion !== gameDataVersion) {
          throw new Error("exact game-data loader returned a different gameDataVersion");
        }
        assertPublishedHuntPveManifest(version.manifest);
        const [species, typeEffectiveness, zones, hunts, encounters] = await Promise.all([
          loadRuntimeGameDataArtifact(reader, version, "catalogs/species") as Promise<SpeciesDefinitionV2[]>,
          loadRuntimeGameDataArtifact(reader, version, "referenceData/currentTypeEffectiveness") as Promise<TypeEffectivenessEntry[]>,
          loadRuntimeGameDataArtifact(reader, version, "catalogs/zones") as Promise<ZoneDefinitionV1[]>,
          loadRuntimeGameDataArtifact(reader, version, "catalogs/hunts") as Promise<HuntDefinitionV1[]>,
          loadRuntimeGameDataArtifact(reader, version, "catalogs/encounter-definitions") as Promise<EncounterDefinitionV1[]>,
        ]);
        const speciesById = assertUniqueId(species, "published SpeciesId");
        const zonesById = assertUniqueId(zones, "published ZoneId");
        const huntsById = assertUniqueId(hunts, "published HuntDefinitionId");
        const encountersById = assertUniqueId(encounters, "published EncounterDefinitionId");
        for (const hunt of hunts) {
          if (!zonesById.has(hunt.zoneId)) throw new Error(`Hunt references unavailable ZoneId: ${hunt.zoneId}`);
        }
        for (const encounter of encounters) {
          if (!huntsById.has(encounter.huntId)) throw new Error(`Encounter references unavailable HuntDefinitionId: ${encounter.huntId}`);
          if (!speciesById.has(encounter.speciesId)) throw new Error(`Encounter references unavailable SpeciesId: ${encounter.speciesId}`);
        }
        return {
          gameDataVersion: version.gameDataVersion,
          contentVersion: version.manifest.pveContentSchemaVersion,
          contentHash: version.manifest.bundleHash,
          species,
          typeEffectiveness,
          zones,
          hunts,
          encounters,
          speciesById,
          zonesById,
          huntsById,
          encountersById,
        };
      } catch (cause) {
        if (cause instanceof HuntAuthorityUnavailableError) throw cause;
        throw unavailable(`published Hunt game-data authority is unavailable: ${gameDataVersion}`, cause);
      }
    },
  };
}

export function createHistoricalEncounterAuthorityLoader(
  gameData: ExactPublishedHuntGameDataLoader,
): HuntRuntimeAuthorityPort["loadHistoricalEncounter"] {
  return async (evidence) => {
    const release = await gameData.load(evidence.gameDataVersion);
    if (release.contentVersion !== evidence.contentVersion || release.contentHash !== evidence.contentHash) {
      throw unavailable("historical Encounter content authority does not match frozen provenance");
    }
    const encounter = release.encountersById.get(evidence.encounterDefinitionId);
    const species = release.speciesById.get(evidence.speciesId);
    if (!encounter || encounter.speciesId !== evidence.speciesId || !species) {
      throw unavailable("historical Encounter authority is unavailable");
    }
    return {
      encounterDefinitionId: encounter.id,
      speciesId: encounter.speciesId,
      gameDataVersion: release.gameDataVersion,
      contentVersion: release.contentVersion,
      contentHash: release.contentHash,
      catchRate: species.catchRate,
      reward: encounter.reward,
    } satisfies HuntHistoricalEncounterAuthority;
  };
}

function typeChartFromRows(
  rows: readonly TypeEffectivenessEntry[],
): ResolvedCombatContext["typeChart"] {
  const chart: Record<string, Record<string, 0 | 0.5 | 1 | 2>> = Object.create(null) as Record<string, Record<string, 0 | 0.5 | 1 | 2>>;
  const seen = new Set<string>();
  for (const row of rows) {
    const key = JSON.stringify([row.attackTypeId, row.defenseTypeId]);
    if (seen.has(key)) throw unavailable(`type-effectiveness authority contains a duplicate pair: ${key}`);
    seen.add(key);
    const attack = chart[row.attackTypeId] ?? (chart[row.attackTypeId] = Object.create(null) as Record<string, 0 | 0.5 | 1 | 2>);
    attack[row.defenseTypeId] = row.multiplier;
  }
  return chart as ResolvedCombatContext["typeChart"];
}

function nonNegativeIntegerText(value: string | undefined, label: string): number {
  const text = required(value, label);
  if (!/^(?:0|[1-9][0-9]*)$/u.test(text)) throw unavailable(`${label} is invalid`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) throw unavailable(`${label} is invalid`);
  return parsed;
}

function ensureMoveContextForSelector(
  moveContext: MoveEligibilityContext,
  selector: Pick<HuntStartSelectorAuthority, "gameDataVersion" | "rulesVersion">,
): void {
  if (
    moveContext.pair.gameDataVersion !== selector.gameDataVersion
    || moveContext.pair.rulesVersion !== selector.rulesVersion
    || !moveContext.productionCatalog
    || moveContext.productionExecutableMoveIds === null
  ) {
    throw unavailable("selected Hunt combat authority is unavailable");
  }
}

function buildTeamMembers(
  team: OwnedTeamSnapshot,
  speciesById: ReadonlyMap<string, SpeciesDefinitionV2>,
): readonly SoloHuntTeamMemberSnapshot[] {
  return team.pokemon.map((pokemon) => {
    const species = speciesById.get(pokemon.speciesId);
    if (!species) throw unavailable(`team Species is unavailable: ${pokemon.speciesId}`);
    if (pokemon.moveLoadout.state !== "selected" || pokemon.moveLoadout.moveIds.length === 0) {
      throw new Error(`Pokémon has no selected Move loadout: ${pokemon.pokemonInstanceId}`);
    }
    if (
      pokemon.selectedAbilityId !== null
      && !species.abilities.some(({ abilityId }) => abilityId === pokemon.selectedAbilityId)
    ) {
      throw new Error(`Pokémon selected Ability is not compatible with Species: ${pokemon.pokemonInstanceId}`);
    }
    const budget = geneticBudgetForScore(pokemon.individualization.geneticScore);
    const geneticBonuses = allocateGeneticBudget(
      budget,
      pokemon.individualization.expressedProfile as GeneticProfile,
    );
    return {
      pokemonInstanceId: pokemon.pokemonInstanceId as never,
      speciesId: pokemon.speciesId as never,
      shiny: pokemon.individualization.shiny,
      level: pokemon.level,
      baseStats: species.baseStats,
      ivs: pokemon.ivs,
      geneticBonuses,
      types: species.typeIds as never,
      moveLoadout: pokemon.moveLoadout.moveIds as never,
      ...(pokemon.selectedAbilityId ? { abilityId: pokemon.selectedAbilityId as never } : {}),
    };
  });
}

export function bindProductionBattleAbilities(
  team: readonly SoloHuntTeamMemberSnapshot[],
  catalog: ProductionCombatRuleCatalog,
): readonly SoloHuntTeamMemberSnapshot[] {
  return team.map((member) => {
    const binding = resolveProductionBattleAbility(catalog, member.abilityId ?? null);
    if (!binding.abilityId) {
      const { abilityId: _inactiveAbilityId, ...withoutAbility } = member;
      return withoutAbility;
    }
    return { ...member, abilityId: binding.abilityId };
  });
}

function deriveTeamMaxHp(
  team: readonly SoloHuntTeamMemberSnapshot[],
  rulesVersion: string,
): Readonly<Record<string, number>> {
  const result: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const member of team) {
    const maxHp = deriveMaxHpForRulesVersion(
      rulesVersion as never,
      member.baseStats,
      member.ivs,
      member.level,
      member.geneticBonuses,
    );
    if (maxHp === undefined) {
      throw unavailable("team max HP authority is unavailable: " + member.pokemonInstanceId);
    }
    result[member.pokemonInstanceId] = maxHp;
  }
  return result;
}

function bindInitialHp(
  built: BuiltHuntRuntimeAuthority,
  initialHpByPokemonInstanceId: Readonly<Record<string, number>>,
): BuiltHuntRuntimeAuthority {
  const expectedIds = Object.keys(built.maxHpByPokemonInstanceId).sort();
  const actualIds = Object.keys(initialHpByPokemonInstanceId).sort();
  if (
    expectedIds.length !== actualIds.length
    || expectedIds.some((value, index) => value !== actualIds[index])
  ) {
    throw unavailable("persistent vitality identities do not match the pinned Team");
  }
  for (const pokemonInstanceId of expectedIds) {
    const currentHp = initialHpByPokemonInstanceId[pokemonInstanceId];
    const maxHp = built.maxHpByPokemonInstanceId[pokemonInstanceId];
    if (
      currentHp === undefined
      || maxHp === undefined
      || !Number.isSafeInteger(currentHp)
      || currentHp < 0
      || currentHp > maxHp
    ) {
      throw unavailable("persistent vitality is invalid: " + pokemonInstanceId);
    }
  }
  const inputs: SoloHuntRuntimeInputs = {
    ...built.inputs,
    initialHpByPokemonInstanceId,
  };
  return {
    ...built,
    inputs,
    persistedInputs: serializeHuntRuntimeInputsForPersistence(inputs) as unknown as Record<string, unknown>,
  };
}

function bindAutomationPolicies(
  built: BuiltHuntRuntimeAuthority,
  automationPolicies: HuntAutomationPolicyAuthoritySnapshot,
): BuiltHuntRuntimeAuthority {
  if (built.inputs.initialHpByPokemonInstanceId === undefined) {
    throw unavailable("persistent vitality authority must be bound before Hunt automation policy authority");
  }
  const normalized = assertHuntAutomationPolicyAuthoritySnapshot(automationPolicies);
  const inputs: SoloHuntRuntimeInputs = {
    ...built.inputs,
    automationPolicies: normalized,
  };
  return {
    ...built,
    inputs,
    persistedInputs: serializeHuntRuntimeInputsForPersistence(inputs) as unknown as Record<string, unknown>,
  };
}

function buildEncounterAuthority(input: {
  readonly huntDefinitionId: string;
  readonly gameData: PublishedHuntGameDataAuthority;
  readonly moveContext: MoveEligibilityContext;
  readonly geneticProfiles: GeneticProfilePairRelease;
}): {
  readonly encounterOptions: readonly SoloHuntEncounterOption[];
  readonly opponentTemplates: readonly SoloHuntOpponentTemplate[];
} {
  const executable = new Set(input.moveContext.productionExecutableMoveIds ?? []);
  const encounters = input.gameData.encounters.filter(({ huntId }) => huntId === input.huntDefinitionId);
  if (encounters.length === 0) throw unavailable("selected Hunt has no Encounter authority");
  const encounterOptions: SoloHuntEncounterOption[] = [];
  const opponentTemplates: SoloHuntOpponentTemplate[] = [];
  for (const encounter of encounters) {
    const species = input.gameData.speciesById.get(encounter.speciesId);
    const profiles = input.geneticProfiles.profilesBySpeciesId.get(encounter.speciesId);
    if (!species || !profiles) throw unavailable(`Encounter Species authority is unavailable: ${encounter.speciesId}`);
    encounterOptions.push({
      encounterDefinitionId: encounter.id as never,
      speciesId: encounter.speciesId as never,
      weight: encounter.weight,
      levelBand: { ...encounter.levelBand },
      rewardEnvelope: encounter.reward,
    });
    for (let level = encounter.levelBand.min; level <= encounter.levelBand.max; level += 1) {
      const eligible = deriveLevelAvailableMoves({
        speciesId: encounter.speciesId,
        currentLevel: level,
        learnset: input.moveContext.learnsetsBySpecies.get(encounter.speciesId) ?? [],
      }).filter(({ moveId }) => executable.has(moveId));
      if (eligible.length === 0) throw new Error(`Encounter Species has no production-executable Move at level ${level}: ${encounter.speciesId}`);
      opponentTemplates.push({
        encounterDefinitionId: encounter.id as never,
        speciesId: encounter.speciesId as never,
        level,
        gameDataVersion: input.moveContext.pair.gameDataVersion as never,
        rulesVersion: input.moveContext.pair.rulesVersion as never,
        baseStats: species.baseStats,
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        compatibleProfiles: profiles,
        types: species.typeIds as never,
        moveLoadout: selectBootstrapMoveLoadout(eligible) as never,
      });
    }
  }
  return { encounterOptions, opponentTemplates };
}

function validatePersistedInitialHpAuthority(inputs: Record<string, unknown>): void {
  const team = inputs.team;
  if (!Array.isArray(team) || team.length === 0) {
    throw new TypeError("runtimeInputsJson.inputs.team must be a non-empty array");
  }
  const teamIds = team.map((memberValue, index) => {
    const member = record(memberValue, "runtimeInputsJson.inputs.team[" + index + "]");
    return nonEmptyString(
      member.pokemonInstanceId,
      "runtimeInputsJson.inputs.team[" + index + "].pokemonInstanceId",
    );
  });
  if (new Set(teamIds).size !== teamIds.length) {
    throw new TypeError("runtimeInputsJson.inputs.team contains duplicate Pokémon identities");
  }
  const authority = record(
    inputs.initialHpByPokemonInstanceId,
    "runtimeInputsJson.inputs.initialHpByPokemonInstanceId",
  );
  exactKeys(
    authority,
    teamIds,
    [],
    "runtimeInputsJson.inputs.initialHpByPokemonInstanceId",
  );
  for (const pokemonInstanceId of teamIds) {
    const hp = authority[pokemonInstanceId];
    if (typeof hp !== "number" || !Number.isSafeInteger(hp) || hp < 0) {
      throw new TypeError("persisted initial Pokémon HP must be a non-negative safe integer");
    }
  }
}

export function serializeHuntRuntimeInputsForPersistence(
  inputs: SoloHuntRuntimeInputs,
): PersistedRuntimeEnvelope {
  const { individualizationAuthority: _secret, ...withoutSecret } = inputs;
  const presentationSource = inputs.automationPolicies !== undefined
    && inputs.team.length > 0
    && inputs.team.every((member) => typeof member.shiny === "boolean");
  return {
    schemaVersion: presentationSource
      ? HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V4
      : inputs.automationPolicies !== undefined
        ? HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V3
      : inputs.initialHpByPokemonInstanceId === undefined
        ? HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V1
        : HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V2,
    inputs: withoutSecret,
    individualizationRequired: inputs.individualizationAuthority !== undefined,
  };
}

export function parsePersistedHuntRuntimeEnvelope(
  recordValue: HuntInputAuthorityRecord,
): PersistedRuntimeEnvelope {
  try {
    const envelope = record(recordValue.runtimeInputsJson, "runtimeInputsJson");
    exactKeys(envelope, ["schemaVersion", "inputs", "individualizationRequired"], [], "runtimeInputsJson");
    const schemaVersion = envelope.schemaVersion;
    if (
      (
        schemaVersion !== HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V1
        && schemaVersion !== HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V2
        && schemaVersion !== HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V3
        && schemaVersion !== HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V4
      )
      || typeof envelope.individualizationRequired !== "boolean"
    ) {
      throw new TypeError("runtimeInputsJson envelope is unsupported");
    }
    const inputs = record(envelope.inputs, "runtimeInputsJson.inputs");
    const requiredKeys = [
      "playerId",
      "zoneId",
      "huntDefinitionId",
      "contentVersion",
      "contentHash",
      "context",
      "team",
      "encounterOptions",
      "opponentTemplates",
      "interBattleGapMs",
    ];
    if (schemaVersion === HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V1) {
      exactKeys(inputs, requiredKeys, [], "runtimeInputsJson.inputs");
    } else if (schemaVersion === HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V2) {
      exactKeys(
        inputs,
        [...requiredKeys, "initialHpByPokemonInstanceId"],
        [],
        "runtimeInputsJson.inputs",
      );
      validatePersistedInitialHpAuthority(inputs);
    } else {
      exactKeys(
        inputs,
        [...requiredKeys, "initialHpByPokemonInstanceId", "automationPolicies"],
        [],
        "runtimeInputsJson.inputs",
      );
      validatePersistedInitialHpAuthority(inputs);
      assertHuntAutomationPolicyAuthoritySnapshot(inputs.automationPolicies);
    }
    const context = record(inputs.context, "runtimeInputsJson.inputs.context");
    if (schemaVersion === HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V4) {
      if (!Array.isArray(inputs.team) || inputs.team.length === 0) {
        throw new TypeError("runtimeInputsJson.inputs.team is empty");
      }
      for (const [index, entry] of inputs.team.entries()) {
        const member = record(entry, `runtimeInputsJson.inputs.team[${index}]`);
        exactKeys(
          member,
          ["pokemonInstanceId", "speciesId", "shiny", "level", "baseStats", "ivs", "types", "moveLoadout"],
          ["geneticBonuses", "abilityId"],
          `runtimeInputsJson.inputs.team[${index}]`,
        );
        if (typeof member.shiny !== "boolean") {
          throw new TypeError(`runtimeInputsJson.inputs.team[${index}].shiny must be boolean`);
        }
      }
    }
    if (
      context.gameDataVersion !== recordValue.gameDataVersion
      || context.rulesVersion !== recordValue.rulesVersion
      || inputs.playerId !== recordValue.playerId
    ) {
      throw new TypeError("runtimeInputsJson does not match frozen Hunt authority columns");
    }
    return {
      schemaVersion,
      inputs: inputs as unknown as Omit<SoloHuntRuntimeInputs, "individualizationAuthority">,
      individualizationRequired: envelope.individualizationRequired,
    };
  } catch (cause) {
    if (cause instanceof HuntAuthorityUnavailableError) throw cause;
    throw unavailable("persisted Hunt runtime authority is invalid", cause);
  }
}

export function createHuntRuntimeAuthorityPort(
  options: CreateHuntRuntimeAuthorityPortOptions,
): HuntRuntimeAuthorityPort {
  const env = options.env;
  const ballResolver = createCaptureBallAuthorityReleaseResolver({
    releases: parseCaptureBallAuthorityReleases(env.HUNT_CAPTURE_BALL_RELEASES),
    currentVersion: required(env.HUNT_CAPTURE_BALL_AUTHORITY_VERSION, "HUNT_CAPTURE_BALL_AUTHORITY_VERSION"),
  });
  const itemRules = createHuntItemRuleReleaseResolver(parseHuntItemRuleReleases(env.HUNT_ITEM_RULE_RELEASES));
  const geneticProfiles = createGeneticProfilePairReleaseResolver(
    parseGeneticProfilePairReleases(env.HUNT_GENETIC_PROFILE_RELEASES),
  );
  const individualization = createEncounterIndividualizationAuthorityResolver({
    releases: parseEncounterIndividualizationAuthorityReleases(env.HUNT_INDIVIDUALIZATION_AUTHORITY_RELEASES),
    currentAuthorityVersion: required(
      env.HUNT_INDIVIDUALIZATION_AUTHORITY_VERSION,
      "HUNT_INDIVIDUALIZATION_AUTHORITY_VERSION",
    ),
  });
  const gameDataReader = options.gameDataReader ?? createHttpGameDataReader(
    required(env.PLAYER_STATE_GAME_DATA_BASE_URL, "PLAYER_STATE_GAME_DATA_BASE_URL"),
  );
  const gameData = createPublishedHuntGameDataLoader(gameDataReader);
  const historicalEncounter = createHistoricalEncounterAuthorityLoader(gameData);
  const combatEventSchemaVersion = required(env.HUNT_COMBAT_EVENT_SCHEMA_VERSION, "HUNT_COMBAT_EVENT_SCHEMA_VERSION");
  const interBattleGapMs = nonNegativeIntegerText(env.HUNT_INTER_BATTLE_GAP_MS, "HUNT_INTER_BATTLE_GAP_MS");

  async function currentMoveContext(): Promise<MoveEligibilityContext> {
    try {
      const context = await options.moveContextLoader.loadForNewOperation();
      if (!context.productionCatalog || context.productionExecutableMoveIds === null) {
        throw new Error("production combat context is unavailable");
      }
      return context;
    } catch (cause) {
      if (cause instanceof HuntAuthorityUnavailableError) throw cause;
      throw unavailable("current Hunt combat authority is unavailable", cause);
    }
  }

  async function retainedMoveContext(
    pending: SoloHuntPendingEncounterSelection,
  ): Promise<MoveEligibilityContext> {
    try {
      if (!options.moveContextLoader.loadExactRetained) {
        throw new Error("retained Move context loader is unavailable");
      }
      const context = await options.moveContextLoader.loadExactRetained({
        gameDataVersion: pending.gameDataVersion,
        rulesVersion: pending.rulesVersion,
      });
      if (!context.productionCatalog || context.productionExecutableMoveIds === null) {
        throw new Error("retained production combat context is unavailable");
      }
      return context;
    } catch (cause) {
      if (cause instanceof HuntAuthorityUnavailableError) throw cause;
      throw unavailable("retained Hunt combat authority is unavailable", cause);
    }
  }

  async function exactPublishedForMoveContext(moveContext: MoveEligibilityContext): Promise<PublishedHuntGameDataAuthority> {
    const release = await gameData.load(moveContext.pair.gameDataVersion);
    if (
      !moveContext.productionCatalog
      || moveContext.productionCatalog.gameDataVersion !== moveContext.pair.gameDataVersion
      || moveContext.productionCatalog.gameDataBundleHash !== release.contentHash
    ) {
      throw unavailable("published Hunt content does not match production combat authority");
    }
    return release;
  }

  return {
    async resolveStartSelector(huntDefinitionId) {
      const moveContext = await currentMoveContext();
      const release = await exactPublishedForMoveContext(moveContext);
      const hunt = release.huntsById.get(huntDefinitionId);
      if (!hunt) return null;
      if (!release.zonesById.has(hunt.zoneId)) throw unavailable("selected Hunt Zone authority is unavailable");
      return {
        huntDefinitionId: hunt.id,
        zoneId: hunt.zoneId,
        recoveryDurationMs: hunt.recoveryDurationMs,
        gameDataVersion: moveContext.pair.gameDataVersion,
        rulesVersion: moveContext.pair.rulesVersion,
      };
    },

    async buildStartRuntime({ playerId, selector, team, pendingEncounterSelection }) {
      const moveContext = pendingEncounterSelection
        ? await retainedMoveContext(pendingEncounterSelection)
        : await currentMoveContext();
      const release = await exactPublishedForMoveContext(moveContext);
      const consumingHuntDefinitionId = pendingEncounterSelection?.huntDefinitionId
        ?? selector.huntDefinitionId;
      const hunt = release.huntsById.get(consumingHuntDefinitionId);
      if (!hunt || hunt.zoneId !== selector.zoneId) {
        throw new Error("selected Hunt definition does not match retained Zone authority");
      }
      const effectiveSelector: HuntStartSelectorAuthority = pendingEncounterSelection
        ? {
            huntDefinitionId: hunt.id,
            zoneId: hunt.zoneId,
            recoveryDurationMs: hunt.recoveryDurationMs,
            gameDataVersion: pendingEncounterSelection.gameDataVersion,
            rulesVersion: pendingEncounterSelection.rulesVersion,
          }
        : selector;
      ensureMoveContextForSelector(moveContext, effectiveSelector);
      if (!usesGeneticCombatSemantics(moveContext.pair.rulesVersion)) {
        throw unavailable("new Hunt runtime requires the accepted Genetic combat rules authority");
      }
      assertStrictSoloHuntStartTeamAdmission(team, moveContext);
      if (!pendingEncounterSelection && hunt.recoveryDurationMs !== selector.recoveryDurationMs) {
        throw unavailable("selected Hunt definition changed before acceptance");
      }
      if (pendingEncounterSelection && (
        pendingEncounterSelection.playerId !== playerId
        || pendingEncounterSelection.zoneId !== effectiveSelector.zoneId
        || pendingEncounterSelection.huntDefinitionId !== effectiveSelector.huntDefinitionId
        || pendingEncounterSelection.contentVersion !== release.contentVersion
        || pendingEncounterSelection.contentHash !== release.contentHash
      )) {
        throw new Error("PendingEncounterSelection does not match the requested retained Hunt context");
      }
      const profiles = await geneticProfiles.require({
        gameDataVersion: effectiveSelector.gameDataVersion,
        rulesVersion: effectiveSelector.rulesVersion,
      });
      const individualizationAuthority = pendingEncounterSelection
        ? await individualization.resolve({
            rulesVersion: ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
            authorityVersion: pendingEncounterSelection.derivationAuthorityVersion ?? "",
            keyId: pendingEncounterSelection.derivationAuthorityKeyId ?? "",
          })
        : await individualization.current();
      if (!individualizationAuthority) {
        throw unavailable("retained Encounter individualization authority is unavailable");
      }
      const combatContext: ResolvedCombatContext = {
        gameDataVersion: effectiveSelector.gameDataVersion as never,
        rulesVersion: effectiveSelector.rulesVersion as never,
        combatEventSchemaVersion: combatEventSchemaVersion as never,
        moveRules: moveContext.productionCatalog!.moveRules,
        abilityRules: moveContext.productionCatalog!.abilityRules,
        effectRules: moveContext.productionCatalog!.effectRules,
        typeChart: typeChartFromRows(release.typeEffectiveness),
      };
      const encounters = buildEncounterAuthority({
        huntDefinitionId: effectiveSelector.huntDefinitionId,
        gameData: release,
        moveContext,
        geneticProfiles: profiles,
      });
      const sourceEnabled = env.HUNT_PRESENTATION_SOURCE_ENABLED === "1";
      const inputTeam = bindProductionBattleAbilities(
        buildTeamMembers(team, release.speciesById),
        moveContext.productionCatalog!,
      );
      if (sourceEnabled && !inputTeam.every((member) => typeof member.shiny === "boolean")) {
        throw unavailable("new Hunt is missing original owned Shiny authority");
      }
      const maxHpByPokemonInstanceId = deriveTeamMaxHp(
        inputTeam,
        effectiveSelector.rulesVersion,
      );
      const inputs: SoloHuntRuntimeInputs = {
        playerId: playerId as never,
        zoneId: effectiveSelector.zoneId as never,
        huntDefinitionId: effectiveSelector.huntDefinitionId as never,
        contentVersion: release.contentVersion,
        contentHash: release.contentHash,
        context: combatContext,
        // Legacy Starts retain their strict pre-v3 Team byte shape.
        team: sourceEnabled ? inputTeam : inputTeam.map(({ shiny: _shiny, ...member }) => member),
        encounterOptions: encounters.encounterOptions,
        opponentTemplates: encounters.opponentTemplates,
        interBattleGapMs,
        individualizationAuthority,
      };
      return {
        inputs,
        persistedInputs: serializeHuntRuntimeInputsForPersistence(inputs) as unknown as Record<string, unknown>,
        maxHpByPokemonInstanceId,
        selector: effectiveSelector,
        individualizationAuthorityVersion: individualizationAuthority.authorityVersion,
        individualizationAuthorityKeyId: individualizationAuthority.keyId,
      };
    },

    bindStartVitality(built, initialHpByPokemonInstanceId) {
      return bindInitialHp(built, initialHpByPokemonInstanceId);
    },

    bindStartAutomationPolicies(built, automationPolicies) {
      return bindAutomationPolicies(built, automationPolicies);
    },

    async deriveCurrentTeamMaxHp(team) {
      const moveContext = await currentMoveContext();
      const release = await exactPublishedForMoveContext(moveContext);
      const teamMembers = buildTeamMembers(team, release.speciesById);
      return deriveTeamMaxHp(teamMembers, moveContext.pair.rulesVersion);
    },

    async loadPersistedRuntime(authorityRecord, checkpointSchemaVersion) {
      const envelope = parsePersistedHuntRuntimeEnvelope(authorityRecord);
      if (checkpointSchemaVersion !== undefined) {
        const expectedCheckpointSchema = envelope.schemaVersion === HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V1
          ? "pokenexus.solo-hunt-checkpoint.v1"
          : envelope.schemaVersion === HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V2
            ? "pokenexus.solo-hunt-checkpoint.v2"
            : envelope.schemaVersion === HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V3
              ? "pokenexus.solo-hunt-checkpoint.v3"
              : "pokenexus.solo-hunt-checkpoint.v4";
        if (checkpointSchemaVersion !== expectedCheckpointSchema) {
          throw unavailable("persisted Hunt runtime input/checkpoint version binding is invalid");
        }
      }
      const release = await gameData.load(authorityRecord.gameDataVersion);
      if (
        release.contentVersion !== envelope.inputs.contentVersion
        || release.contentHash !== envelope.inputs.contentHash
      ) {
        throw unavailable("persisted Hunt content authority is unavailable");
      }
      const geneticRuntime = usesGeneticCombatSemantics(authorityRecord.rulesVersion);
      if (envelope.individualizationRequired !== geneticRuntime) {
        throw unavailable("persisted Hunt individualization mode does not match its frozen rulesVersion");
      }
      if (!envelope.individualizationRequired) return envelope.inputs;
      const historicalProfiles = await geneticProfiles.require({
        gameDataVersion: authorityRecord.gameDataVersion,
        rulesVersion: authorityRecord.rulesVersion,
      });
      for (const template of envelope.inputs.opponentTemplates) {
        const expectedProfiles = historicalProfiles.profilesBySpeciesId.get(template.speciesId);
        if (
          !expectedProfiles
          || template.compatibleProfiles?.[0] !== expectedProfiles[0]
          || template.compatibleProfiles?.[1] !== expectedProfiles[1]
        ) {
          throw unavailable(`persisted Genetic Profile authority is unavailable for Species: ${template.speciesId}`);
        }
      }
      if (!authorityRecord.individualizationAuthorityVersion || !authorityRecord.individualizationAuthorityKeyId) {
        throw unavailable("persisted Hunt individualization authority is incomplete");
      }
      const exactIndividualization = await individualization.resolve({
        rulesVersion: ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
        authorityVersion: authorityRecord.individualizationAuthorityVersion,
        keyId: authorityRecord.individualizationAuthorityKeyId,
      });
      if (!exactIndividualization) throw unavailable("persisted Hunt individualization authority is unavailable");
      return { ...envelope.inputs, individualizationAuthority: exactIndividualization };
    },

    loadHistoricalEncounter: historicalEncounter,

    async currentBallAuthority() {
      const release = await ballResolver.current();
      return { version: release.version, balls: release.balls };
    },

    async ballAuthority(version) {
      const release = await ballResolver.resolve(version);
      return release ? { version: release.version, balls: release.balls } : null;
    },

    async currentItemRule(input) {
      const release = await itemRules.require({
        gameDataVersion: input.gameDataVersion,
        rulesVersion: input.rulesVersion,
      });
      const rule = release.rulesByItemId.get(input.itemId);
      if (!rule) return null;
      return {
        itemRuleVersion: release.itemRuleVersion,
        ...rule,
      };
    },

    async itemRule(input) {
      const release = await itemRules.resolve({
        gameDataVersion: input.gameDataVersion,
        rulesVersion: input.rulesVersion,
      });
      if (!release || release.itemRuleVersion !== input.itemRuleVersion) return null;
      const rule = release.rulesByItemId.get(input.itemId);
      return rule ? { itemRuleVersion: release.itemRuleVersion, ...rule } : null;
    },

    async currentItemRuleAuthority() {
      const moveContext = await currentMoveContext();
      const release = await itemRules.require({
        gameDataVersion: moveContext.pair.gameDataVersion,
        rulesVersion: moveContext.pair.rulesVersion,
      });
      return {
        itemRuleVersion: release.itemRuleVersion,
        gameDataVersion: release.gameDataVersion,
        rulesVersion: release.rulesVersion,
      };
    },

    async validatePolicyReferences(input) {
      const moveContext = await currentMoveContext();
      const release = await exactPublishedForMoveContext(moveContext);
      return {
        gameDataVersion: release.gameDataVersion,
        accepted: input.speciesIds.every((id) => release.speciesById.has(id))
          && input.zoneIds.every((id) => release.zonesById.has(id))
          && input.huntDefinitionIds.every((id) => release.huntsById.has(id)),
      };
    },
  };
}

export function createConfiguredHuntRuntimeAuthorityPort(
  env: HuntRuntimeEnvironment,
  options: { readonly gameDataReader?: RuntimeGameDataReader } = {},
): HuntRuntimeAuthorityPort {
  return createHuntRuntimeAuthorityPort({
    env,
    moveContextLoader: createConfiguredMoveContextLoader(env),
    ...(options.gameDataReader ? { gameDataReader: options.gameDataReader } : {}),
  });
}

function runtimeHistoricalLoader(authority: HuntRuntimeAuthorityPort): HistoricalEncounterAuthorityLoader {
  return {
    load(input) {
      return authority.loadHistoricalEncounter(input as never);
    },
  };
}

function isHuntRuntimeAuthorityError(error: unknown): boolean {
  return error instanceof HuntAuthorityUnavailableError || error instanceof MoveAuthorityUnavailableError;
}

function aggregateRewardEffects(effects: readonly {
  readonly kind: "pokemon_xp" | "player_xp" | "item_grant";
  readonly amount?: bigint;
  readonly quantity?: bigint;
  readonly pokemonInstanceId?: string;
  readonly itemId?: string;
}[]) {
  let playerExperience = 0n;
  const pokemonExperience = new Map<string, bigint>();
  const items = new Map<string, bigint>();
  for (const effect of effects) {
    if (effect.kind === "player_xp") {
      playerExperience += effect.amount ?? 0n;
    } else if (effect.kind === "pokemon_xp" && effect.pokemonInstanceId) {
      pokemonExperience.set(
        effect.pokemonInstanceId,
        (pokemonExperience.get(effect.pokemonInstanceId) ?? 0n) + (effect.amount ?? 0n),
      );
    } else if (effect.kind === "item_grant" && effect.itemId) {
      items.set(effect.itemId, (items.get(effect.itemId) ?? 0n) + (effect.quantity ?? 0n));
    }
  }
  return {
    playerExperience,
    pokemonExperience: [...pokemonExperience]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([pokemonInstanceId, amount]) => ({ pokemonInstanceId, amount })),
    items: [...items]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([itemId, quantity]) => ({ itemId, quantity })),
  };
}

export function createHuntApplicationFromEnvironment(env: HuntRuntimeEnvironment): HuntApplication {
  const connectionString = required(env.HYPERDRIVE?.connectionString, "HYPERDRIVE.connectionString");
  const authority = createConfiguredHuntRuntimeAuthorityPort(env);
  const moveContextLoader = createConfiguredMoveContextLoader(env);
  const configuredMoveAuthorities = createConfiguredMoveAuthorities(env);
  const historical = runtimeHistoricalLoader(authority);
  const rewardApplication = new RewardApplicationService(
    connectionString,
    createRuntimePinnedRewardContextLoader({
      gameDataReader: configuredMoveAuthorities.gameDataReader,
      gameDataVersions: configuredMoveAuthorities.gameDataVersions,
      staticContextPairs: configuredMoveAuthorities.staticContextPairs,
      rules: {
        async resolve(rulesVersion) {
          const release = await configuredMoveAuthorities.rulesVersions.resolve(rulesVersion);
          if (!release) return null;
          return {
            rules: {
              rulesVersion,
              pokemonProgressionRuleId: POKEMON_PROGRESSION_RULE_ID,
              playerProgressionRuleId: PLAYER_PROGRESSION_RULE_ID,
            },
            newOperationsAllowed: release.newOperationsAllowed,
          };
        },
      },
    }),
  );
  const rewardService = new SoloHuntRewardApplicationService(historical, rewardApplication);

  const captureService = async (
    transaction: Parameters<HuntBoundaryEffectsPort["automaticCapture"]>[0]["transaction"],
    ballAuthorityVersion: string,
  ) => {
    const release = await authority.ballAuthority(ballAuthorityVersion);
    if (!release) throw new HuntAuthorityUnavailableError("retained capture Ball authority is unavailable");
    const byItemId = new Map(release.balls.map((ball) => [ball.itemId, ball] as const));
    return new SoloHuntCaptureResolutionService(
      createTransactionCaptureAttemptRepository(transaction),
      historical,
      moveContextLoader,
      {
        async resolve(itemId) {
          return byItemId.get(itemId) ?? null;
        },
      },
      {
        validate(input) {
          return replayValidateSoloHuntCompletedCaptureSource(
            input.huntState,
            input.huntInputs,
            input.encounterId,
          );
        },
      },
    );
  };

  const boundaryEffects: HuntBoundaryEffectsPort = {
    async automaticCapture(input) {
      try {
        const provenance = input.state.completedEncounterProvenance[
          input.boundary.encounterOrdinal - 1
        ];
        if (provenance?.encounterId !== input.boundary.encounterId) {
          throw new Error("Automatic capture boundary lacks matching Encounter provenance");
        }
        const service = await captureService(input.transaction, input.ballAuthorityVersion);
        const result = await service.attempt({
          subjectPlayerId: input.playerId,
          attemptCorrelation: input.boundary.automaticAttemptCorrelation
            ?? `auto:${input.boundary.encounterId}`,
          encounterId: input.boundary.encounterId as never,
          huntState: input.state,
          huntInputs: input.inputs,
          selectedItemId: input.selectedItemId,
          captureRng: input.captureRng,
          expectedInventoryRowVersion: input.expectedInventoryRowVersion,
          now: input.now,
        });
        if (result.status === "accepted") {
          return {
            status: "accepted",
            success: result.attempt.success,
            shiny: result.attempt.success && provenance.individualizationSnapshot?.shiny === true,
          };
        }
        return { status: "integrity_failure" };
      } catch (error) {
        if (isHuntRuntimeAuthorityError(error)) return { status: "authority_unavailable" };
        throw error;
      }
    },

    async reward(input) {
      try {
        const evidence = input.state.completedEncounters[input.boundary.encounterOrdinal - 1];
        if (
          !evidence
          || evidence.encounterId !== input.boundary.encounterId
          || evidence.completionKind !== "defeat"
        ) {
          throw new Error("Reward boundary lacks winning completed Encounter evidence");
        }
        const result = await rewardService.resolveAndApply({
          transaction: input.transaction,
          huntState: input.state,
          huntInputs: input.inputs,
          rewardSourceIdentity: evidence.rewardSourceIdentity,
          rewardRng: input.rewardRng,
        });
        if (result.application.status !== "completed") {
          throw new Error(`Reward application did not complete: ${result.application.status}`);
        }
        return {
          rewardResolutionId: result.application.resolutionId,
          reward: aggregateRewardEffects(result.resolution.envelope.effects),
        };
      } catch (error) {
        if (isHuntRuntimeAuthorityError(error)) {
          throw new HuntAuthorityUnavailableError("Hunt reward authority is unavailable", { cause: error });
        }
        throw error;
      }
    },
  };

  const manualCaptureEffects: HuntManualCaptureEffectsPort = {
    async attempt(input) {
      try {
        const service = await captureService(input.transaction, input.ballAuthorityVersion);
        const result = await service.attempt({
          subjectPlayerId: input.playerId,
          attemptCorrelation: input.attemptCorrelation,
          encounterId: input.encounterId as never,
          huntState: input.state,
          huntInputs: input.inputs,
          selectedItemId: input.selectedItemId,
          captureRng: input.captureRng,
          expectedInventoryRowVersion: input.expectedInventoryRowVersion,
          now: input.now,
        });
        if (result.status === "accepted") {
          return {
            status: "accepted",
            success: result.attempt.success,
            pokemonInstanceId: result.attempt.createdPokemonInstanceId,
          };
        }
        if (result.status === "insufficient_ball") return { status: "insufficient_ball" };
        if (result.status === "inventory_not_found") return { status: "authority_unavailable" };
        throw new Error(`Manual capture transaction lost its frozen invariant: ${result.status}`);
      } catch (error) {
        if (isHuntRuntimeAuthorityError(error)) return { status: "authority_unavailable" };
        throw error;
      }
    },
  };

  return new HuntApplication(connectionString, {
    authority,
    boundaryEffects,
    manualCaptureEffects,
  }, { presentationSourceEnabled: env.HUNT_PRESENTATION_SOURCE_ENABLED === "1" });
}
