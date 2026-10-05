export function formatHuntDuration(ms: string | number): string {
  const raw = String(ms);
  if (!/^(0|[1-9][0-9]*)$/u.test(raw)) throw new Error("Invalid Hunt duration");
  let remainder = BigInt(raw);
  const parts: string[] = [];
  for (const [suffix, size] of [
    ["d", 86_400_000n],
    ["h", 3_600_000n],
    ["m", 60_000n],
    ["s", 1_000n],
    ["ms", 1n],
  ] as const) {
    const count = remainder / size;
    remainder %= size;
    if (count > 0n) parts.push(`${count}${suffix}`);
  }
  return parts.length ? parts.join(" ") : "0ms";
}

export function formatHuntTimestamp(utc: string): string {
  const date = new Date(utc);
  if (!Number.isFinite(date.valueOf())) throw new Error("Invalid Hunt timestamp");
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
