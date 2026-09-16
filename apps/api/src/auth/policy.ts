export interface SessionPolicy {
  readonly absoluteLifetimeMs: number;
  readonly inactivityLifetimeMs: number;
  readonly recentAuthLifetimeMs: number;
}

export const MAX_SESSION_POLICY = {
  absoluteLifetimeMs: 30 * 24 * 60 * 60 * 1000,
  inactivityLifetimeMs: 7 * 24 * 60 * 60 * 1000,
  recentAuthLifetimeMs: 10 * 60 * 1000,
} as const satisfies SessionPolicy;

export function assertSessionPolicy(policy: SessionPolicy): void {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive safe-integer duration`);
    }
  }
  if (policy.absoluteLifetimeMs > MAX_SESSION_POLICY.absoluteLifetimeMs) {
    throw new Error("Session absolute lifetime exceeds ADR-006 maximum");
  }
  if (policy.inactivityLifetimeMs > MAX_SESSION_POLICY.inactivityLifetimeMs) {
    throw new Error("Session inactivity lifetime exceeds ADR-006 maximum");
  }
  if (policy.recentAuthLifetimeMs > MAX_SESSION_POLICY.recentAuthLifetimeMs) {
    throw new Error("Recent-auth lifetime exceeds ADR-006 maximum");
  }
}

export function isRecentAuthentication(
  recentAuthAt: Date | null,
  now: Date,
  recentAuthLifetimeMs: number,
): boolean {
  if (!recentAuthAt) {
    return false;
  }
  const age = now.getTime() - recentAuthAt.getTime();
  return age >= 0 && age <= recentAuthLifetimeMs;
}

export function isPostRecoveryEligible(holdUntil: Date | null, now: Date): boolean {
  return !holdUntil || holdUntil.getTime() <= now.getTime();
}
