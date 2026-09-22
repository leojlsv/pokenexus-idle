import { describe, expect, it } from "vitest";
import {
  PLAYER_PROGRESSION_RULE_ID,
  POKEMON_PROGRESSION_RULE_ID,
  evaluatePlayerXpGrant,
  evaluatePokemonXpGrant,
  playerLevelForExperience,
  playerXpFloor,
  pokemonLevelForExperience,
  pokemonXpFloor,
} from "./progression";

describe("progression", () => {
  it("implements the Pokémon cubic floor and exact inversion through Level 200", () => {
    expect(pokemonXpFloor(1n)).toBe(0n);
    expect(pokemonXpFloor(10n)).toBe(999n);
    expect(pokemonXpFloor(200n)).toBe(7_999_999n);
    expect(pokemonLevelForExperience(999n)).toBe(10n);
    expect(pokemonLevelForExperience(1_329n)).toBe(10n);
    expect(pokemonLevelForExperience(1_330n)).toBe(11n);
  });

  it("caps Pokémon XP while preserving exact discarded XP", () => {
    const result = evaluatePokemonXpGrant({
      ruleId: POKEMON_PROGRESSION_RULE_ID,
      current: { level: 199n, totalExperience: pokemonXpFloor(199n) },
      xpAmount: 20_000_000_000_000_000_000n,
    });
    expect(result.level).toBe(200n);
    expect(result.totalExperience).toBe(7_999_999n);
    expect(result.appliedXp).toBe(119_401n);
    expect(result.discardedAtCapXp).toBe(19_999_999_999_999_880_599n);
  });

  it("keeps a capped or zero Pokémon grant mutation-free", () => {
    expect(evaluatePokemonXpGrant({
      ruleId: POKEMON_PROGRESSION_RULE_ID,
      current: { level: 200n, totalExperience: 7_999_999n },
      xpAmount: 9_223_372_036_854_775_808n,
    })).toMatchObject({ appliedXp: 0n, changed: false });
  });

  it("implements unbounded Player progression losslessly beyond safe integer and bigint storage", () => {
    const level = 1_000_000_000_000n;
    const floor = playerXpFloor(level);
    expect(floor).toBe(49_999_999_999_950_000_000_000_000n);
    expect(playerLevelForExperience(floor)).toBe(level);
    expect(playerLevelForExperience(playerXpFloor(level + 1n) - 1n)).toBe(level);
    const grant = evaluatePlayerXpGrant({
      ruleId: PLAYER_PROGRESSION_RULE_ID,
      current: { level, totalExperience: floor },
      xpAmount: 9_223_372_036_854_775_808n,
    });
    expect(grant.totalExperience).toBe(floor + 9_223_372_036_854_775_808n);
    expect(grant.level).toBe(playerLevelForExperience(grant.totalExperience));
  });

  it("fails closed for unsupported rules and inconsistent state", () => {
    expect(() => evaluatePokemonXpGrant({
      ruleId: "current",
      current: { level: 1n, totalExperience: 0n },
      xpAmount: 1n,
    })).toThrow(/unsupported/);
    expect(() => evaluatePlayerXpGrant({
      ruleId: PLAYER_PROGRESSION_RULE_ID,
      current: { level: 2n, totalExperience: 0n },
      xpAmount: 1n,
    })).toThrow(/inconsistent/);
  });
});
