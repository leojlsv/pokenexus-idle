import { describe, expect, it } from "vitest";
import { applyResponsePolicy, classifyResponse, mayAutomaticallyRetryMutation } from "./client-policy";
import { privateClientCache } from "./private-cache";

describe("central client protocol policy", () => {
  it("never permits generic automatic mutation retry", () => {
    expect(mayAutomaticallyRetryMutation()).toBe(false);
  });

  it("maps OCC and pagination staleness to explicit reconciliation", () => {
    expect(classifyResponse(409, "stale")).toEqual({ kind: "reload_reconcile" });
    expect(classifyResponse(409, "pagination_stale")).toEqual({ kind: "restart_pagination" });
  });

  it("preserves exact Hunt command continuation and supersession semantics", () => {
    expect(classifyResponse(202, null, null, "in_progress")).toEqual({ kind: "continue_same_command" });
    expect(classifyResponse(202, null, null, "waiting_boundary")).toEqual({ kind: "accepted_waiting_boundary" });
    expect(classifyResponse(409, "command_superseded")).toEqual({ kind: "refresh_then_new_intent" });
    expect(classifyResponse(409, "correlation_conflict")).toEqual({ kind: "terminal_command" });
  });

  it("fails closed for an unknown or missing 202 body status", () => {
    expect(classifyResponse(202, null)).toEqual({ kind: "failure" });
    expect(classifyResponse(202, null, null, "unknown")).toEqual({ kind: "failure" });
  });

  it("keeps Team-create tombstone and rate-limit semantics bounded", () => {
    expect(classifyResponse(410, "idempotency_gone")).toEqual({ kind: "terminal_command" });
    expect(classifyResponse(429, "team_create_rate_limited", "42")).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 42,
    });
    expect(classifyResponse(429, "team_create_rate_limited", "invalid")).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: null,
    });
  });

  it("reconciles authoritative Hunt state when an accepted waiting-boundary heal key later expires", () => {
    expect(classifyResponse(410, "idempotency_gone", null, null, {
      kind: "scheduled_heal",
      acceptedWaitingBoundary: true,
    })).toEqual({ kind: "refresh_authoritative_hunt" });
    expect(classifyResponse(410, "idempotency_gone", null, null, {
      kind: "scheduled_heal",
      acceptedWaitingBoundary: false,
    })).toEqual({ kind: "terminal_command" });
  });

  it("maps session and authority failures without inventing permission or gameplay state", () => {
    expect(classifyResponse(401, "unauthorized")).toEqual({ kind: "session_lost" });
    expect(classifyResponse(403, "forbidden")).toEqual({ kind: "forbidden" });
    expect(classifyResponse(404, "not_found")).toEqual({ kind: "not_found" });
    expect(classifyResponse(503, "authority_unavailable")).toEqual({ kind: "deliberate_retry" });
  });

  it("clears private cache through the canonical response-policy path before session-lost presentation", () => {
    privateClientCache.set("player", { id: "private" });
    expect(privateClientCache.size).toBe(1);
    expect(applyResponsePolicy(401, "unauthorized")).toEqual({ kind: "session_lost" });
    expect(privateClientCache.size).toBe(0);
  });
});
