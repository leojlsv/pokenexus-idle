import { PREALPHA_STARTER_LOADOUTS, type PlayerBootstrapApplicationResult } from "./player/bootstrap";

export interface LocalBootstrapRequest {
  readonly label: "A" | "B";
  readonly playerId: string;
  readonly starterSpeciesId: string;
}

export type LocalBootstrapOutcome = LocalBootstrapRequest & (
  | {
    readonly status: "accepted";
    readonly replayed: boolean;
    readonly pokemonInstanceId: string;
    readonly teamId: string;
    readonly gameDataVersion: string;
    readonly rulesVersion: string;
    readonly contentVersion: string;
    readonly contentHash: string;
  }
  | { readonly status: "failed"; readonly reason: string }
);

export async function runLocalBootstrapRequests(
  requests: readonly LocalBootstrapRequest[],
  bootstrap: (input: { playerId: string; starterSpeciesId: string; now: Date }) => Promise<PlayerBootstrapApplicationResult>,
  report: (outcome: LocalBootstrapOutcome) => void,
): Promise<readonly LocalBootstrapOutcome[]> {
  if (requests.length < 1 || requests.length > 2 || requests[0]?.label !== "A" ||
    (requests.length === 2 && requests[1]?.label !== "B") ||
    new Set(requests.map(({ playerId }) => playerId)).size !== requests.length) {
    throw new Error("Local Bootstrap requires one or two distinct ordered Player fixtures");
  }
  for (const request of requests) {
    if (!request.playerId || !Object.hasOwn(PREALPHA_STARTER_LOADOUTS, request.starterSpeciesId)) {
      throw new Error(`Invalid local Bootstrap choice for Player ${request.label}; no Player was processed`);
    }
  }
  const outcomes: LocalBootstrapOutcome[] = [];
  for (const request of requests) {
    let result: PlayerBootstrapApplicationResult;
    try {
      result = await bootstrap({ playerId: request.playerId, starterSpeciesId: request.starterSpeciesId, now: new Date() });
    } catch (cause) {
      report({ ...request, status: "failed", reason: "operation_failed" });
      throw new Error(`Local Bootstrap ${request.label} failed; completed Players remain committed. Retry the same choices; do not Reset.`, { cause });
    }
    if (result.status !== "accepted") {
      report({ ...request, status: "failed", reason: result.status });
      throw new Error(`Local Bootstrap ${request.label} failed: ${result.status}. Completed Players remain committed; retry the same choices after resolving the failure.`);
    }
    const outcome: LocalBootstrapOutcome = {
      ...request,
      status: "accepted",
      replayed: result.replayed,
      pokemonInstanceId: result.bootstrap.pokemonInstanceId,
      teamId: result.bootstrap.teamId,
      gameDataVersion: result.bootstrap.gameDataVersion,
      rulesVersion: result.bootstrap.rulesVersion,
      contentVersion: result.bootstrap.contentVersion,
      contentHash: result.bootstrap.contentHash,
    };
    outcomes.push(outcome);
    // Each Player commits independently; publish success before processing the next Player.
    report(outcome);
  }
  return outcomes;
}
