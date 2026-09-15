import type { DeterministicRngState } from "./types";

const UINT32_MAX = 0xffffffff;

export function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= UINT32_MAX;
}

export function validateRngState(state: DeterministicRngState): string | undefined {
  if (state.algorithm !== "xorshift32-v1") return "unsupported RNG algorithm";
  if (!isUint32(state.state) || state.state === 0) return "RNG state must be a non-zero uint32";
  return undefined;
}

export function nextRngState(state: DeterministicRngState): DeterministicRngState {
  const error = validateRngState(state);
  if (error) throw new Error(error);

  let value = state.state >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return { algorithm: "xorshift32-v1", state: value >>> 0 };
}

export function createRngState(seed: number): DeterministicRngState {
  const state = { algorithm: "xorshift32-v1" as const, state: seed };
  const error = validateRngState(state);
  if (error) throw new Error(error);
  return state;
}
