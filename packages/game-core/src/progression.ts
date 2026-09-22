export const POKEMON_PROGRESSION_RULE_ID = "pokenexus.level-cubic.v1" as const;
export const PLAYER_PROGRESSION_RULE_ID = "pokenexus.player-linear-cost.v1" as const;
export const POKEMON_LEVEL_CAP = 200n;
export const POKEMON_XP_CAP = 7_999_999n;

function assertNonNegative(value: bigint, label: string): void {
  if (value < 0n) throw new RangeError(`${label} must be non-negative`);
}

function assertPokemonLevel(level: bigint): void {
  if (level < 1n || level > POKEMON_LEVEL_CAP) {
    throw new RangeError("pokemon level must be in 1..200");
  }
}

function assertPlayerLevel(level: bigint): void {
  if (level < 1n) throw new RangeError("player level must be at least 1");
}

function assertPokemonRule(ruleId: string): void {
  if (ruleId !== POKEMON_PROGRESSION_RULE_ID) {
    throw new Error(`unsupported Pokémon progression rule: ${ruleId}`);
  }
}

function assertPlayerRule(ruleId: string): void {
  if (ruleId !== PLAYER_PROGRESSION_RULE_ID) {
    throw new Error(`unsupported Player progression rule: ${ruleId}`);
  }
}

function integerSqrt(value: bigint): bigint {
  assertNonNegative(value, "square-root input");
  if (value < 2n) return value;

  let current = 1n << (BigInt(value.toString(2).length) + 1n >> 1n);
  for (;;) {
    const next = (current + value / current) >> 1n;
    if (next >= current) return current;
    current = next;
  }
}

export function pokemonXpFloor(level: bigint): bigint {
  assertPokemonLevel(level);
  return level * level * level - 1n;
}

export function pokemonLevelForExperience(totalExperience: bigint): bigint {
  assertNonNegative(totalExperience, "totalExperience");
  if (totalExperience > POKEMON_XP_CAP) {
    throw new RangeError("Pokémon totalExperience exceeds the Level-200 cap");
  }

  let low = 1n;
  let high = POKEMON_LEVEL_CAP;
  while (low < high) {
    const middle = (low + high + 1n) >> 1n;
    if (pokemonXpFloor(middle) <= totalExperience) low = middle;
    else high = middle - 1n;
  }
  return low;
}

export function playerXpFloor(level: bigint): bigint {
  assertPlayerLevel(level);
  return 50n * level * (level - 1n);
}

export function playerLevelForExperience(totalExperience: bigint): bigint {
  assertNonNegative(totalExperience, "playerTotalExperience");
  const quotient = totalExperience / 50n;
  return (1n + integerSqrt(1n + 4n * quotient)) / 2n;
}

export interface PokemonProgressionState {
  readonly level: bigint;
  readonly totalExperience: bigint;
}

export interface PokemonXpGrantResult extends PokemonProgressionState {
  readonly appliedXp: bigint;
  readonly discardedAtCapXp: bigint;
  readonly changed: boolean;
}

export function evaluatePokemonXpGrant(input: {
  readonly ruleId: string;
  readonly current: PokemonProgressionState;
  readonly xpAmount: bigint;
}): PokemonXpGrantResult {
  assertPokemonRule(input.ruleId);
  assertPokemonLevel(input.current.level);
  assertNonNegative(input.current.totalExperience, "current.totalExperience");
  assertNonNegative(input.xpAmount, "xpAmount");
  if (input.current.totalExperience > POKEMON_XP_CAP) {
    throw new RangeError("current Pokémon totalExperience exceeds the Level-200 cap");
  }
  if (pokemonLevelForExperience(input.current.totalExperience) !== input.current.level) {
    throw new Error("current Pokémon level/experience state is inconsistent");
  }

  const remainingCapacity = POKEMON_XP_CAP - input.current.totalExperience;
  const appliedXp = input.xpAmount < remainingCapacity ? input.xpAmount : remainingCapacity;
  const totalExperience = input.current.totalExperience + appliedXp;
  return {
    level: pokemonLevelForExperience(totalExperience),
    totalExperience,
    appliedXp,
    discardedAtCapXp: input.xpAmount - appliedXp,
    changed: appliedXp > 0n,
  };
}

export interface PlayerProgressionState {
  readonly level: bigint;
  readonly totalExperience: bigint;
}

export interface PlayerXpGrantResult extends PlayerProgressionState {
  readonly appliedXp: bigint;
  readonly changed: boolean;
}

export function evaluatePlayerXpGrant(input: {
  readonly ruleId: string;
  readonly current: PlayerProgressionState;
  readonly xpAmount: bigint;
}): PlayerXpGrantResult {
  assertPlayerRule(input.ruleId);
  assertPlayerLevel(input.current.level);
  assertNonNegative(input.current.totalExperience, "current.totalExperience");
  assertNonNegative(input.xpAmount, "xpAmount");
  if (playerLevelForExperience(input.current.totalExperience) !== input.current.level) {
    throw new Error("current Player level/experience state is inconsistent");
  }

  const totalExperience = input.current.totalExperience + input.xpAmount;
  return {
    level: playerLevelForExperience(totalExperience),
    totalExperience,
    appliedXp: input.xpAmount,
    changed: input.xpAmount > 0n,
  };
}
