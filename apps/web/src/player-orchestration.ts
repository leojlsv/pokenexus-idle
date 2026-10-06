import { PlayerApiError, type SavedTeam, type TeamSummary } from "./player-api";
import { sameOrderedRoster } from "./player-state";

interface TeamCreateApi {
  createTeam(csrfToken: string, idempotencyKey: string): Promise<TeamSummary>;
}

interface TeamReadApi {
  team(teamId: string, signal?: AbortSignal): Promise<SavedTeam>;
}

interface TeamCreateIntentPort {
  begin(csrfToken: string): Promise<string>;
  clear(csrfToken: string, key: string): Promise<boolean>;
}

export function isPlayerSessionLost(error: unknown): boolean {
  return error instanceof PlayerApiError && error.directive.kind === "session_lost";
}

export function requiresMutationReconciliation(error: unknown): boolean {
  return !(error instanceof PlayerApiError) || error.status === 408 || error.status >= 500;
}

export function shouldClearTeamCreateIntentAfterFailure(error: unknown): boolean {
  return error instanceof PlayerApiError && [400, 403, 409, 410, 429].includes(error.status);
}

export type TeamCreateAttempt =
  | {
      readonly kind: "accepted";
      readonly key: string;
      readonly result: TeamSummary;
      readonly cleared: boolean;
    }
  | {
      readonly kind: "failed";
      readonly key: string | null;
      readonly failure: unknown;
      readonly cleared: boolean;
    };

export async function runTeamCreateAttempt(
  api: TeamCreateApi,
  store: TeamCreateIntentPort,
  csrfToken: string,
  onPersistedKey: (key: string) => void = () => undefined,
): Promise<TeamCreateAttempt> {
  let key: string | null = null;
  try {
    key = await store.begin(csrfToken);
    onPersistedKey(key);
    const result = await api.createTeam(csrfToken, key);
    const cleared = await store.clear(csrfToken, key);
    return { kind: "accepted", key, result, cleared };
  } catch (failure) {
    let cleared = false;
    if (key && shouldClearTeamCreateIntentAfterFailure(failure)) {
      cleared = await store.clear(csrfToken, key);
    }
    return { kind: "failed", key, failure, cleared };
  }
}

export type TeamReconciliation =
  | { readonly kind: "matched"; readonly latest: SavedTeam }
  | { readonly kind: "conflict"; readonly latest: SavedTeam };

export type TeamStaleAction = "save" | "delete";

export function teamStaleReconciliationCopy(
  action: TeamStaleAction,
  outcome: TeamReconciliation["kind"],
): string {
  if (action === "delete") {
    return outcome === "matched"
      ? "The Team still exists at the current version. Deletion was not applied; review and explicitly delete again if intended."
      : "The Team changed before deletion. Deletion was not applied. Compare the server roster with your local draft before deciding what to do.";
  }
  return outcome === "matched"
    ? "The server already contains this roster. No additional save is needed."
    : "The authoritative Team has changed. Compare the server roster with your unsaved draft before deciding what to do.";
}

export async function readTeamReconciliation(
  api: TeamReadApi,
  teamId: string,
  draft: readonly string[],
): Promise<TeamReconciliation> {
  const latest = await api.team(teamId);
  return sameOrderedRoster(latest.pokemonInstanceIds, draft)
    ? { kind: "matched", latest }
    : { kind: "conflict", latest };
}

export type TeamFocusTarget = "unavailable" | "conflict" | "error" | "save" | "check" | null;

export function teamFocusTarget(input: {
  readonly unavailable: boolean;
  readonly hasConflict: boolean;
  readonly needsReconcile: boolean;
  readonly hasError: boolean;
  readonly afterChoice: "save" | "check" | null;
}): TeamFocusTarget {
  if (input.unavailable) return "unavailable";
  if (input.hasConflict) return "conflict";
  if (input.needsReconcile && input.hasError) return "error";
  if (!input.needsReconcile) return input.afterChoice;
  return null;
}
