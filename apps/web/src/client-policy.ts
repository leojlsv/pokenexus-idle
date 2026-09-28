import { privateClientCache } from "./private-cache";

export type ClientDirective =
  | { kind: "success" }
  | { kind: "continue_same_command" }
  | { kind: "accepted_waiting_boundary" }
  | { kind: "reload_reconcile" }
  | { kind: "restart_pagination" }
  | { kind: "refresh_then_new_intent" }
  | { kind: "terminal_command" }
  | { kind: "refresh_authoritative_hunt" }
  | { kind: "rate_limited"; retryAfterSeconds: number | null }
  | { kind: "session_lost" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "deliberate_retry" }
  | { kind: "failure" };

export type CommandContext =
  | { kind: "default" }
  | { kind: "scheduled_heal"; acceptedWaitingBoundary: boolean };

function boundedRetryAfter(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function classifyResponse(
  status: number,
  errorCode: string | null,
  retryAfter: string | null = null,
  responseStatus: string | null = null,
  commandContext: CommandContext = { kind: "default" },
): ClientDirective {
  if (status >= 200 && status < 300 && status !== 202) return { kind: "success" };
  if (status === 202 && responseStatus === "in_progress") return { kind: "continue_same_command" };
  if (status === 202 && responseStatus === "waiting_boundary") return { kind: "accepted_waiting_boundary" };
  if (status === 202) return { kind: "failure" };
  if (status === 401) return { kind: "session_lost" };
  if (status === 403) return { kind: "forbidden" };
  if (status === 404) return { kind: "not_found" };
  if (status === 409 && errorCode === "stale") return { kind: "reload_reconcile" };
  if (status === 409 && errorCode === "pagination_stale") return { kind: "restart_pagination" };
  if (status === 409 && errorCode === "command_superseded") return { kind: "refresh_then_new_intent" };
  if (status === 409 && errorCode === "correlation_conflict") return { kind: "terminal_command" };
  if (
    status === 410 && errorCode === "idempotency_gone" &&
    commandContext.kind === "scheduled_heal" && commandContext.acceptedWaitingBoundary
  ) return { kind: "refresh_authoritative_hunt" };
  if (status === 410 && errorCode === "idempotency_gone") return { kind: "terminal_command" };
  if (status === 429 && errorCode === "team_create_rate_limited") {
    return { kind: "rate_limited", retryAfterSeconds: boundedRetryAfter(retryAfter) };
  }
  if (status === 503 && errorCode === "authority_unavailable") return { kind: "deliberate_retry" };
  return { kind: "failure" };
}

export function applyResponsePolicy(
  status: number,
  errorCode: string | null,
  retryAfter: string | null = null,
  responseStatus: string | null = null,
  commandContext: CommandContext = { kind: "default" },
): ClientDirective {
  const directive = classifyResponse(status, errorCode, retryAfter, responseStatus, commandContext);
  if (directive.kind === "session_lost") privateClientCache.clear();
  return directive;
}

export function mayAutomaticallyRetryMutation(): false {
  return false;
}
