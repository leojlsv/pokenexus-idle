import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyResponsePolicy } from "./client-policy";
import { PlayerApi, PlayerApiError, type SavedTeam } from "./player-api";
import {
  readTeamReconciliation,
  requiresMutationReconciliation,
  runTeamCreateAttempt,
  teamStaleReconciliationCopy,
  teamFocusTarget,
} from "./player-orchestration";
import { CollectionPage, PokemonPage, TeamDetailPage, TeamsPage } from "./player-pages";

const pokemonId = "0199472a-0000-7000-8000-000000000001";
const teamId = "0199472a-0000-7000-8000-000000000101";
const createKey = "0199472a-0000-7000-8000-000000000201";

function apiError(status: number, code: string): PlayerApiError {
  return new PlayerApiError(status, code, applyResponsePolicy(status, code), null);
}

describe("TASK-100 page components", () => {
  it("mounts every reconciled route component without falling back to an unavailable placeholder", () => {
    const api = new PlayerApi(async () => new Response(null, { status: 500 }));
    const props = { api, csrfToken: "csrf", onSessionLost: () => undefined, onNavigate: () => undefined };

    expect(renderToStaticMarkup(<CollectionPage {...props} />)).toContain("Loading Collection");
    expect(renderToStaticMarkup(<PokemonPage {...props} pokemonInstanceId={pokemonId} />)).toContain("Loading Pokémon");
    expect(renderToStaticMarkup(<TeamsPage {...props} />)).toContain("Loading Teams");
    expect(renderToStaticMarkup(<TeamDetailPage {...props} teamId={teamId} />)).toContain("Loading saved Team");
  });
});

describe("TASK-100 Team orchestration", () => {
  it("persists the exact create key before POST and clears it only after a confirmed acceptance", async () => {
    const order: string[] = [];
    const store = {
      async begin() { order.push("persist"); return createKey; },
      async clear(_csrf: string, key: string) { order.push(`clear:${key}`); return true; },
    };
    const api = {
      async createTeam(_csrf: string, key: string) {
        order.push(`post:${key}`);
        return { teamId, rowVersion: "0" };
      },
    };
    const persisted: string[] = [];

    await expect(runTeamCreateAttempt(api, store, "csrf", (key) => persisted.push(key))).resolves.toEqual({
      kind: "accepted",
      key: createKey,
      result: { teamId, rowVersion: "0" },
      cleared: true,
    });
    expect(order).toEqual(["persist", `post:${createKey}`, `clear:${createKey}`]);
    expect(persisted).toEqual([createKey]);
  });

  it("keeps the same create identity after ambiguous response loss but clears definitive rejection", async () => {
    let clearCalls = 0;
    const store = {
      async begin() { return createKey; },
      async clear() { clearCalls += 1; return true; },
    };
    const uncertain = await runTeamCreateAttempt({
      async createTeam() { throw new TypeError("connection reset"); },
    }, store, "csrf");
    expect(uncertain).toMatchObject({ kind: "failed", key: createKey, cleared: false });
    expect(clearCalls).toBe(0);
    expect(uncertain.kind === "failed" && requiresMutationReconciliation(uncertain.failure)).toBe(true);

    const rejected = await runTeamCreateAttempt({
      async createTeam() { throw apiError(409, "team_limit_reached"); },
    }, store, "csrf");
    expect(rejected).toMatchObject({ kind: "failed", key: createKey, cleared: true });
    expect(clearCalls).toBe(1);
  });

  it("classifies server equality as reconciled and divergent order as an explicit conflict", async () => {
    const latest: SavedTeam = { teamId, pokemonInstanceIds: [pokemonId], rowVersion: "8" };
    const api = { async team() { return latest; } };
    await expect(readTeamReconciliation(api, teamId, [pokemonId])).resolves.toEqual({ kind: "matched", latest });
    await expect(readTeamReconciliation(api, teamId, [])).resolves.toEqual({ kind: "conflict", latest });
  });

  it("keeps stale save and stale delete reconciliation guidance action-specific", () => {
    expect(teamStaleReconciliationCopy("save", "matched")).toContain("No additional save is needed");
    expect(teamStaleReconciliationCopy("delete", "matched")).toContain("Deletion was not applied");
    expect(teamStaleReconciliationCopy("delete", "matched")).toContain("explicitly delete again");
    expect(teamStaleReconciliationCopy("delete", "conflict")).toContain("changed before deletion");
  });

  it("requires authoritative reconciliation only for ambiguous mutation outcomes", () => {
    expect(requiresMutationReconciliation(new TypeError("network"))).toBe(true);
    expect(requiresMutationReconciliation(apiError(408, "request_timeout"))).toBe(true);
    expect(requiresMutationReconciliation(apiError(503, "unavailable"))).toBe(true);
    expect(requiresMutationReconciliation(apiError(409, "stale"))).toBe(false);
    expect(requiresMutationReconciliation(apiError(404, "not_found"))).toBe(false);
  });

  it("keeps reconciliation focus deterministic across conflict, uncertainty, unavailability and explicit choice", () => {
    expect(teamFocusTarget({ unavailable: true, hasConflict: true, needsReconcile: true, hasError: true, afterChoice: "save" })).toBe("unavailable");
    expect(teamFocusTarget({ unavailable: false, hasConflict: true, needsReconcile: true, hasError: true, afterChoice: null })).toBe("conflict");
    expect(teamFocusTarget({ unavailable: false, hasConflict: false, needsReconcile: true, hasError: true, afterChoice: null })).toBe("error");
    expect(teamFocusTarget({ unavailable: false, hasConflict: false, needsReconcile: false, hasError: false, afterChoice: "save" })).toBe("save");
    expect(teamFocusTarget({ unavailable: false, hasConflict: false, needsReconcile: false, hasError: false, afterChoice: "check" })).toBe("check");
  });
});
