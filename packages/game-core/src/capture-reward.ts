import { createHash } from "node:crypto";
import { drawUniformInteger } from "./combat-math";
import type { GeneticGrade, EncounterIndividualizationSnapshot } from "./encounter-individualization";
import type { SoloHuntCompletedEncounterEvidence, SoloHuntPendingCaptureDecision, SoloHuntTeamMemberSnapshot } from "./solo-hunt";
import type { DeterministicRngState } from "./types";

export const SOLO_HUNT_REWARD_SOURCE_AUTHORITY_V1 =
  "pokenexus.solo-hunt.encounter-completion.v1" as const;
export const CAPTURE_RULES_VERSION_V1 = "pokenexus.capture.post-defeat.v1" as const;

const ITEM_QUANTITY_MAX = 9_223_372_036_854_775_807n;
const FIXED_SCALE = 10n ** 24n;

export interface EncounterRewardItemDropV1 {
  readonly itemId: string;
  readonly quantity: number;
  readonly chanceBasisPoints: number;
}

export interface EncounterRewardInputV1 {
  readonly pokemonXpPool: number;
  readonly playerXp: number | null;
  readonly itemDrops: readonly EncounterRewardItemDropV1[];
}

export type SoloHuntRewardEffect =
  | { readonly kind: "pokemon_xp"; readonly pokemonInstanceId: string; readonly amount: bigint }
  | { readonly kind: "player_xp"; readonly playerId: string; readonly amount: bigint }
  | { readonly kind: "item_grant"; readonly itemId: string; readonly quantity: bigint };

export interface SoloHuntRewardResolutionEnvelope {
  readonly subjectPlayerId: string;
  readonly sourceAuthority: typeof SOLO_HUNT_REWARD_SOURCE_AUTHORITY_V1;
  readonly sourceCorrelation: string;
  readonly rulesVersion: string;
  readonly gameDataVersion: string;
  readonly effects: readonly SoloHuntRewardEffect[];
}

export interface SoloHuntRewardResolution {
  readonly envelope: SoloHuntRewardResolutionEnvelope;
  readonly rngBefore: DeterministicRngState;
  readonly rngAfter: DeterministicRngState;
}

export interface CaptureBallRuleV1 {
  readonly itemId: string;
  readonly powerQuarterUnits: 4 | 5 | 6 | 8 | 9;
}

export interface CaptureResolutionV1 {
  readonly captureRulesVersion: typeof CAPTURE_RULES_VERSION_V1;
  readonly captureRulesSemanticsHash: string;
  readonly itemId: string;
  readonly catchRate: number;
  readonly geneticGrade: GeneticGrade;
  readonly baseChanceBp: number;
  readonly geneticChanceBp: number;
  readonly finalChanceBp: number;
  readonly roll: number;
  readonly success: boolean;
  readonly rngBefore: DeterministicRngState;
  readonly rngAfter: DeterministicRngState;
}

const CAPTURE_CURVE = [
  [3, 800],
  [25, 1500],
  [45, 2500],
  [75, 3500],
  [120, 5000],
  [190, 6800],
  [255, 8200],
] as const;

const GENETIC_CAPTURE_MODIFIER_BP: Readonly<Record<GeneticGrade, number>> = {
  Normal: 10_000,
  Uncommon: 9_800,
  Rare: 9_500,
  Epic: 9_000,
  Apex: 8_000,
};

const CAPTURE_RULES_ARTIFACT_V1 = {
  version: CAPTURE_RULES_VERSION_V1,
  curve: CAPTURE_CURVE,
  geneticModifiersBp: GENETIC_CAPTURE_MODIFIER_BP,
  ballPowerQuarterUnits: [4, 5, 6, 8, 9],
  finalBasisPointRounding: "round-half-up",
  fixedPointScale: FIXED_SCALE.toString(),
  draw: "U[0,9999]; success iff roll < finalChanceBp",
} as const;

export const CAPTURE_RULES_SEMANTICS_HASH_V1 =
  `sha256:${createHash("sha256").update(JSON.stringify(CAPTURE_RULES_ARTIFACT_V1)).digest("hex")}` as const;

function assertNonEmpty(value: string, label: string): void {
  if (value.length === 0) throw new Error(`${label} must be non-empty`);
}

function assertRewardInput(input: EncounterRewardInputV1): void {
  if (!Number.isSafeInteger(input.pokemonXpPool) || input.pokemonXpPool < 0) {
    throw new Error("pokemonXpPool must be a non-negative safe integer");
  }
  if (input.playerXp !== null && (!Number.isSafeInteger(input.playerXp) || input.playerXp < 0)) {
    throw new Error("playerXp must be null or a non-negative safe integer");
  }
  for (const drop of input.itemDrops) {
    assertNonEmpty(drop.itemId, "itemDrop.itemId");
    if (!Number.isSafeInteger(drop.quantity) || drop.quantity <= 0) {
      throw new Error("itemDrop.quantity must be a positive safe integer");
    }
    if (!Number.isSafeInteger(drop.chanceBasisPoints) || drop.chanceBasisPoints < 0 || drop.chanceBasisPoints > 10_000) {
      throw new Error("itemDrop.chanceBasisPoints must be an integer in 0..10000");
    }
  }
}

function sameRewardInput(left: unknown, right: EncounterRewardInputV1): boolean {
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const candidate = left as Partial<EncounterRewardInputV1>;
  if (candidate.pokemonXpPool !== right.pokemonXpPool || candidate.playerXp !== right.playerXp) return false;
  if (!Array.isArray(candidate.itemDrops) || candidate.itemDrops.length !== right.itemDrops.length) return false;
  return candidate.itemDrops.every((drop, index) => {
    const expected = right.itemDrops[index];
    if (!drop || typeof drop !== "object" || !expected) return false;
    const value = drop as Partial<EncounterRewardItemDropV1>;
    return value.itemId === expected.itemId
      && value.quantity === expected.quantity
      && value.chanceBasisPoints === expected.chanceBasisPoints;
  });
}

function cloneRng(rng: DeterministicRngState): DeterministicRngState {
  return { algorithm: rng.algorithm, state: rng.state };
}

export function resolveSoloHuntEncounterReward(input: {
  readonly subjectPlayerId: string;
  readonly evidence: SoloHuntCompletedEncounterEvidence;
  readonly pinnedTeam: readonly SoloHuntTeamMemberSnapshot[];
  readonly rewardInput: EncounterRewardInputV1;
  readonly rng: DeterministicRngState;
}): SoloHuntRewardResolution {
  assertNonEmpty(input.subjectPlayerId, "subjectPlayerId");
  assertRewardInput(input.rewardInput);
  if (input.evidence.completionKind !== "defeat") throw new Error("reward evidence must be a successful Encounter defeat");
  if (!sameRewardInput(input.evidence.rewardEnvelope, input.rewardInput)) {
    throw new Error("completed Encounter rewardEnvelope does not match authorized reward input");
  }

  const byId = new Map(input.pinnedTeam.map((member) => [member.pokemonInstanceId, member] as const));
  if (byId.size !== input.pinnedTeam.length) throw new Error("pinned Team contains duplicate Pokémon identities");
  const participantIds = new Set<string>();
  for (const participantId of input.evidence.participantPokemonInstanceIds) {
    if (participantIds.has(participantId)) throw new Error("completed Encounter contains duplicate participants");
    participantIds.add(participantId);
    if (!byId.has(participantId)) throw new Error("completed Encounter participant is not in the pinned Team");
  }

  const eligible = input.pinnedTeam.filter((member) => participantIds.has(member.pokemonInstanceId) && member.level < 200);
  const effects: SoloHuntRewardEffect[] = [];
  if (eligible.length > 0 && input.rewardInput.pokemonXpPool > 0) {
    const pool = BigInt(input.rewardInput.pokemonXpPool);
    const divisor = BigInt(eligible.length);
    const base = pool / divisor;
    let remainder = pool % divisor;
    for (const member of eligible) {
      const amount = base + (remainder > 0n ? 1n : 0n);
      if (remainder > 0n) remainder -= 1n;
      if (amount > 0n) effects.push({ kind: "pokemon_xp", pokemonInstanceId: member.pokemonInstanceId, amount });
    }
  }
  if (input.rewardInput.playerXp !== null) {
    effects.push({ kind: "player_xp", playerId: input.subjectPlayerId, amount: BigInt(input.rewardInput.playerXp) });
  }

  const rngBefore = cloneRng(input.rng);
  let deterministicState = { rng: cloneRng(input.rng) };
  const grants = new Map<string, bigint>();
  for (const drop of input.rewardInput.itemDrops) {
    const draw = drawUniformInteger(deterministicState, 0, 9_999);
    deterministicState = draw.nextState;
    if (draw.value >= drop.chanceBasisPoints) continue;
    const quantity = BigInt(drop.quantity);
    const current = grants.get(drop.itemId) ?? 0n;
    const next = current + quantity;
    if (next > ITEM_QUANTITY_MAX) throw new Error("aggregated Item grant exceeds ItemQuantity maximum");
    grants.set(drop.itemId, next);
  }
  for (const [itemId, quantity] of [...grants.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    effects.push({ kind: "item_grant", itemId, quantity });
  }

  return {
    envelope: {
      subjectPlayerId: input.subjectPlayerId,
      sourceAuthority: SOLO_HUNT_REWARD_SOURCE_AUTHORITY_V1,
      sourceCorrelation: input.evidence.rewardSourceIdentity,
      rulesVersion: input.evidence.rulesVersion,
      gameDataVersion: input.evidence.gameDataVersion,
      effects,
    },
    rngBefore,
    rngAfter: cloneRng(deterministicState.rng),
  };
}

export function baseCaptureChanceBp(catchRate: number): number {
  if (!Number.isSafeInteger(catchRate) || catchRate < 3 || catchRate > 255) {
    throw new Error("catchRate must be an integer in 3..255");
  }
  for (let index = 0; index < CAPTURE_CURVE.length - 1; index += 1) {
    const left = CAPTURE_CURVE[index]!;
    const right = CAPTURE_CURVE[index + 1]!;
    if (catchRate < left[0] || catchRate > right[0]) continue;
    return left[1] + Math.floor(((catchRate - left[0]) * (right[1] - left[1])) / (right[0] - left[0]));
  }
  throw new Error("capture curve does not cover catchRate");
}

export function geneticCaptureChanceBp(baseChanceBp: number, grade: GeneticGrade): number {
  if (!Number.isSafeInteger(baseChanceBp) || baseChanceBp < 0 || baseChanceBp > 10_000) {
    throw new Error("baseChanceBp must be an integer in 0..10000");
  }
  return Math.floor((baseChanceBp * GENETIC_CAPTURE_MODIFIER_BP[grade]) / 10_000);
}

function integerFourthRoot(value: bigint): bigint {
  if (value < 0n) throw new Error("fourth-root input must be non-negative");
  if (value < 2n) return value;
  let low = 0n;
  let high = 1n;
  while (high ** 4n <= value) high <<= 1n;
  while (low + 1n < high) {
    const middle = (low + high) >> 1n;
    if (middle ** 4n <= value) low = middle;
    else high = middle;
  }
  return low;
}

function multiplyFixed(left: bigint, right: bigint): bigint {
  return (left * right) / FIXED_SCALE;
}

function powerFixed(base: bigint, exponent: number): bigint {
  let result = FIXED_SCALE;
  for (let index = 0; index < exponent; index += 1) result = multiplyFixed(result, base);
  return result;
}

function fourthRootFixed(value: bigint): bigint {
  return integerFourthRoot(value * FIXED_SCALE * FIXED_SCALE * FIXED_SCALE);
}

export function applyCaptureBallPowerBp(
  geneticChanceBp: number,
  powerQuarterUnits: CaptureBallRuleV1["powerQuarterUnits"],
): number {
  if (!Number.isSafeInteger(geneticChanceBp) || geneticChanceBp < 0 || geneticChanceBp > 10_000) {
    throw new Error("geneticChanceBp must be an integer in 0..10000");
  }
  if (![4, 5, 6, 8, 9].includes(powerQuarterUnits)) throw new Error("unsupported capture Ball power");
  if (geneticChanceBp === 0) return 0;
  const complement = (BigInt(10_000 - geneticChanceBp) * FIXED_SCALE) / 10_000n;
  const quarterRoot = fourthRootFixed(complement);
  const complementPowered = powerFixed(quarterRoot, powerQuarterUnits);
  const successScaled = FIXED_SCALE - complementPowered;
  const rounded = (successScaled * 10_000n + FIXED_SCALE / 2n) / FIXED_SCALE;
  return Number(rounded > 9_999n ? 9_999n : rounded);
}

function assertCaptureLinkage(
  pending: SoloHuntPendingCaptureDecision,
  snapshot: EncounterIndividualizationSnapshot,
): void {
  if (pending.speciesId !== snapshot.speciesId || pending.level !== snapshot.level) {
    throw new Error("pending capture target does not match individualization snapshot");
  }
  if (!pending.pendingSelectionIdentity || pending.pendingSelectionIdentity !== snapshot.pendingSelectionIdentity) {
    throw new Error("pending capture is missing or mismatches pending-selection identity");
  }
  if (!pending.individualizationSnapshotIdentity
    || pending.individualizationSnapshotIdentity !== snapshot.individualizationSnapshotIdentity) {
    throw new Error("pending capture individualization snapshot identity mismatch");
  }
  if (!pending.individualizationSnapshotCommitment
    || pending.individualizationSnapshotCommitment !== snapshot.individualizationSnapshotCommitment) {
    throw new Error("pending capture individualization snapshot commitment mismatch");
  }
  if (pending.individualizationRulesVersion !== snapshot.individualizationRulesVersion
    || pending.derivationAuthorityVersion !== snapshot.derivationAuthorityVersion
    || pending.derivationAuthorityKeyId !== snapshot.derivationAuthorityKeyId) {
    throw new Error("pending capture individualization provenance mismatch");
  }
}

export function resolveCaptureAttemptV1(input: {
  readonly pendingCapture: SoloHuntPendingCaptureDecision;
  readonly snapshot: EncounterIndividualizationSnapshot;
  readonly catchRate: number;
  readonly ball: CaptureBallRuleV1;
  readonly captureRulesVersion: typeof CAPTURE_RULES_VERSION_V1;
  readonly rng: DeterministicRngState;
}): CaptureResolutionV1 {
  if (input.captureRulesVersion !== CAPTURE_RULES_VERSION_V1) throw new Error("unsupported capture rules version");
  assertNonEmpty(input.ball.itemId, "capture itemId");
  assertCaptureLinkage(input.pendingCapture, input.snapshot);
  const baseChanceBp = baseCaptureChanceBp(input.catchRate);
  const geneticChanceBp = geneticCaptureChanceBp(baseChanceBp, input.snapshot.geneticGrade);
  const finalChanceBp = applyCaptureBallPowerBp(geneticChanceBp, input.ball.powerQuarterUnits);
  const rngBefore = cloneRng(input.rng);
  const draw = drawUniformInteger({ rng: cloneRng(input.rng) }, 0, 9_999);
  return {
    captureRulesVersion: CAPTURE_RULES_VERSION_V1,
    captureRulesSemanticsHash: CAPTURE_RULES_SEMANTICS_HASH_V1,
    itemId: input.ball.itemId,
    catchRate: input.catchRate,
    geneticGrade: input.snapshot.geneticGrade,
    baseChanceBp,
    geneticChanceBp,
    finalChanceBp,
    roll: draw.value,
    success: draw.value < finalChanceBp,
    rngBefore,
    rngAfter: cloneRng(draw.nextState.rng),
  };
}
