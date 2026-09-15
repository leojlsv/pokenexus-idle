export function deriveSimpleDamageMoveCooldownMs(power: number, pp: number): number | undefined {
  if (!Number.isSafeInteger(power) || power <= 0 || !Number.isSafeInteger(pp) || pp <= 0) return undefined;

  const rawPowerBaseCooldownMs = 500n + 50n * BigInt(power);
  const powerBaseCooldownMs = rawPowerBaseCooldownMs < 2000n
    ? 2000n
    : rawPowerBaseCooldownMs > 10000n
      ? 10000n
      : rawPowerBaseCooldownMs;
  let multiplierNumerator: bigint;
  let multiplierDenominator: bigint;

  if (pp >= 30) {
    multiplierNumerator = 4n;
    multiplierDenominator = 5n;
  } else if (pp >= 20) {
    multiplierNumerator = BigInt(70 - pp);
    multiplierDenominator = 50n;
  } else if (pp >= 10) {
    multiplierNumerator = BigInt(340 - 7 * pp);
    multiplierDenominator = 200n;
  } else if (pp >= 5) {
    multiplierNumerator = BigInt(205 - 7 * pp);
    multiplierDenominator = 100n;
  } else {
    multiplierNumerator = 17n;
    multiplierDenominator = 10n;
  }

  const rawNumerator = powerBaseCooldownMs * multiplierNumerator;
  const quantum = multiplierDenominator * 100n;
  const quantized = ((rawNumerator + quantum - 1n) / quantum) * 100n;
  if (quantized > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
  return Math.max(2000, Number(quantized));
}
