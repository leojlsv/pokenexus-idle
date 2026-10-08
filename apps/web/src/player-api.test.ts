import { describe, expect, it, vi } from "vitest";
import { privateClientCache } from "./private-cache";
import { PlayerApi, PlayerApiError, playerErrorText } from "./player-api";
import {
  addRosterMember,
  appendPage,
  markResourceRefresh,
  recordPageContinuation,
  removeRosterMember,
  reorderRosterMember,
  resourceRefreshFailed,
  resourceRefreshSucceeded,
  sameOrderedRoster,
} from "./player-state";

function response(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...Object.fromEntries(new Headers(headers).entries()) },
  });
}

function apiWith(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const api = new PlayerApi((async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, init });
    return handler(url, init);
  }) as typeof fetch);
  return { api, requests };
}

describe("Player State API client contract", () => {
  it("calls default fetch with a browser-compatible receiver for reads and mutations", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const teamId = "0199472a-0000-7000-8000-000000000102";
    vi.stubGlobal("fetch", function (this: unknown, input: RequestInfo | URL, init: RequestInit = {}) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      requests.push({ url: String(input), init });
      return Promise.resolve(response(init.method === "POST"
        ? { teamId, rowVersion: "0" }
        : { items: [], nextCursor: null }));
    });
    try {
      const api = new PlayerApi();
      await expect(api.collection()).resolves.toEqual({ items: [], nextCursor: null });
      await expect(api.createTeam("csrf-token", "original-key"))
        .resolves.toEqual({ teamId, rowVersion: "0" });
      expect(requests.map(({ url }) => url)).toEqual(["/player/collection?limit=50", "/player/teams"]);
      for (const { init } of requests) {
        expect(init.credentials).toBe("include");
        expect(init.redirect).toBe("error");
      }
      expect(requests[0]?.init.method).toBe("GET");
      expect(new Headers(requests[0]?.init.headers).has("X-CSRF-Token")).toBe(false);
      expect(requests[1]?.init.method).toBe("POST");
      expect(new Headers(requests[1]?.init.headers).get("X-CSRF-Token")).toBe("csrf-token");
      expect(new Headers(requests[1]?.init.headers).get("Idempotency-Key")).toBe("original-key");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses self-scoped GET paths, opaque page cursors and credentials without mutation credentials", async () => {
    const pokemonId = "0199472a-0000-7000-8000-000000000001";
    const { api, requests } = apiWith((url) => url.includes("/progression")
      ? response({ pokemonInstanceId: pokemonId, level: 5, totalExperience: "1000", rowVersion: "0" })
      : url.includes("/pokemon/") ? response({
        pokemonInstanceId: pokemonId, speciesId: "species:test",
        level: 5, selectedAbilityId: null, rowVersion: "0",
        ivs: { hp: 10, atk: 9, def: 8, spa: 7, spd: 6, spe: 5 },
        moveLoadout: { state: "selected", moveIds: ["move:test"] },
      }) : response({ items: [], nextCursor: null }));
    await api.collection("a/+ =cursor");
    await api.pokemon(pokemonId);
    await api.progression(pokemonId);
    expect(requests.map(({ url }) => url)).toEqual([
      "/player/collection?limit=50&cursor=a%2F%2B+%3Dcursor",
      `/player/pokemon/${pokemonId}`,
      `/player/pokemon/${pokemonId}/progression`,
    ]);
    for (const { init } of requests) {
      expect(init.method).toBe("GET");
      expect(init.credentials).toBe("include");
      expect(init.redirect).toBe("error");
      expect(init.body).toBeUndefined();
      expect(new Headers(init.headers).has("X-CSRF-Token")).toBe(false);
    }
  });

  it("retains the caller-supplied idempotency key and transmits no Team-create body", async () => {
    const { api, requests } = apiWith(() => response({ teamId: "0199472a-0000-7000-8000-000000000102", rowVersion: "0" }));
    const key = "019a66e6-7111-7777-8888-199999999991";
    await api.createTeam("csrf-token", key);
    await api.createTeam("csrf-token", key);
    expect(requests).toHaveLength(2);
    for (const { url, init } of requests) {
      expect(url).toBe("/player/teams");
      expect(init.method).toBe("POST");
      expect(init.body).toBeUndefined();
      const headers = new Headers(init.headers);
      expect(headers.get("Idempotency-Key")).toBe(key);
      expect(headers.get("X-CSRF-Token")).toBe("csrf-token");
      expect(headers.has("Content-Type")).toBe(false);
      expect(init.credentials).toBe("include");
      expect(init.redirect).toBe("error");
    }
  });

  it("preserves arbitrary-precision OCC tokens and the complete ordered roster", async () => {
    const teamId = "0199472a-0000-7000-8000-000000000102";
    const p2 = "0199472a-0000-7000-8000-000000000002";
    const p1 = "0199472a-0000-7000-8000-000000000001";
    const { api, requests } = apiWith((url) => url.endsWith("/roster")
      ? response({ teamId, pokemonInstanceIds: [p2, p1], rowVersion: "9007199254740993001" })
      : response(undefined, 204));
    const version = "9007199254740993000";
    await api.replaceRoster(teamId, "csrf", version, [p2, p1]);
    await api.deleteTeam(teamId, "csrf", version);
    expect(JSON.parse(String(requests[0]?.init.body))).toEqual({
      expectedRowVersion: version, pokemonInstanceIds: [p2, p1],
    });
    expect(requests[1]?.url).toBe(`/player/teams/${teamId}?expectedRowVersion=${version}`);
    expect(requests[1]?.init.method).toBe("DELETE");
    expect(requests[1]?.init.body).toBeUndefined();
  });

  it("maps stale OCC failures to reload/reconcile without any mutation retry", async () => {
    const { api, requests } = apiWith(() => response({ error: "stale" }, 409));
    await expect(api.replaceRoster("team", "csrf", "0", ["p1"])).rejects.toMatchObject({
      status: 409, code: "stale", directive: { kind: "reload_reconcile" },
    });
    expect(requests).toHaveLength(1);
  });

  it("preserves server-supplied invalid member, capacity, rate and tombstone errors", async () => {
    for (const [body, status, retryAfter, expected] of [
      [{ error: "invalid_member", pokemonInstanceId: "p3" }, 422, null, "invalid_member"],
      [{ error: "team_limit_reached" }, 409, null, "team_limit_reached"],
      [{ error: "team_create_rate_limited" }, 429, "18", "team_create_rate_limited"],
      [{ error: "idempotency_gone" }, 410, null, "idempotency_gone"],
    ] as const) {
      const { api } = apiWith(() => response(body, status, retryAfter ? { "Retry-After": retryAfter } : undefined));
      const fail = await api.createTeam("csrf", "one-intent").catch((error: unknown) => error);
      expect(fail).toBeInstanceOf(PlayerApiError);
      expect(fail).toMatchObject({ status, code: expected, retryAfter });
      if (status === 422) expect((fail as PlayerApiError).detail?.pokemonInstanceId).toBe("p3");
    }
  });

  it("invalidates session-private cache on unauthorized responses even without JSON error body", async () => {
    privateClientCache.set("saved", "private");
    const { api } = apiWith(() => new Response("not json", { status: 401 }));
    const error = await api.collection().catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(PlayerApiError);
    expect((error as PlayerApiError).directive.kind).toBe("session_lost");
    expect(playerErrorText(error)).toContain("session has expired");
    expect(privateClientCache.size).toBe(0);
  });

  it("never retries an uncertain network result using a new mutation identity", async () => {
    const transport = vi.fn(async () => { throw new TypeError("Network connection dropped after submit"); });
    const api = new PlayerApi(transport as typeof fetch);
    await expect(api.createTeam("csrf", "original-key")).rejects.toThrow("Network connection dropped");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(playerErrorText(new Error("uncertain"))).toContain("response was lost");
  });

  it("rejects malformed successful create and roster bodies before any authoritative UI transition", async () => {
    const { api } = apiWith(() => response({}));
    await expect(api.createTeam("csrf", "0199472a-0000-7000-8000-000000000101")).rejects.toThrow("Invalid Player API resource identity");
    await expect(api.replaceRoster("0199472a-0000-7000-8000-000000000102", "csrf", "0", [])).rejects.toThrow("Invalid Player API resource identity");
  });

  it("binds every selected Pokémon and Team response to its requested self-scoped identity", async () => {
    const requested = "0199472a-0000-7000-8000-000000000001";
    const returned = "0199472a-0000-7000-8000-000000000002";
    const { api, requests } = apiWith((url) => url.includes("/progression")
      ? response({ pokemonInstanceId: returned, level: 5, totalExperience: "1000", rowVersion: "0" })
      : url.includes("/pokemon/")
        ? response({ pokemonInstanceId: returned, speciesId: "species:test", level: 5,
          selectedAbilityId: null, rowVersion: "0", ivs: { hp: 10, atk: 9, def: 8, spa: 7, spd: 6, spe: 5 },
          moveLoadout: { state: "selected", moveIds: ["move:a"] } })
        : response({ teamId: returned, rowVersion: "1", pokemonInstanceIds: [requested] }));
    await expect(api.pokemon(requested)).rejects.toThrow("Pokémon identity mismatch");
    await expect(api.progression(requested)).rejects.toThrow("progression identity mismatch");
    await expect(api.team(requested)).rejects.toThrow("Team identity mismatch");
    await expect(api.replaceRoster(requested, "csrf", "0", [requested])).rejects.toThrow("saved roster did not match");
    expect(requests).toHaveLength(4);
  });

  it("treats a valid-looking 200 with a different roster as uncertain, preserving the submitted draft for reconciliation", async () => {
    const teamId = "0199472a-0000-7000-8000-000000000102";
    const p1 = "0199472a-0000-7000-8000-000000000001";
    const p2 = "0199472a-0000-7000-8000-000000000002";
    const { api, requests } = apiWith(() => response({ teamId, rowVersion: "1", pokemonInstanceIds: [p1, p2] }));
    await expect(api.replaceRoster(teamId, "csrf", "0", [p2, p1])).rejects.toThrow("saved roster did not match");
    expect(JSON.parse(String(requests[0]?.init.body)).pokemonInstanceIds).toEqual([p2, p1]);
    expect(requests).toHaveLength(1);
  });

  it("requires exact HTTP 204 on delete, even if a proxy returns success-shaped 200", async () => {
    const { api } = apiWith(() => response({ deleted: false }, 200));
    await expect(api.deleteTeam("0199472a-0000-7000-8000-000000000102", "csrf", "0"))
      .rejects.toThrow("Unexpected Player API success status");
  });

  it("requires exact success statuses for Team mutations and profile setup", async () => {
    const teamId = "0199472a-0000-7000-8000-000000000102";
    const playerId = "0199472a-0000-7000-8000-000000000103";
    const create = apiWith(() => response({ teamId, rowVersion: "0" }, 201)).api;
    await expect(create.createTeam("csrf", "0199472a-0000-7000-8000-000000000104"))
      .rejects.toThrow("Unexpected Player API success status");

    const roster = apiWith(() => response({ teamId, pokemonInstanceIds: [], rowVersion: "1" }, 201)).api;
    await expect(roster.replaceRoster(teamId, "csrf", "0", []))
      .rejects.toThrow("Unexpected Player API success status");

    const profileStatus = apiWith(() => response({ playerId }, 201)).api;
    await expect(profileStatus.createProfile("csrf")).rejects.toThrow("Unexpected Player API success status");

    const malformedProfile = apiWith(() => response({ playerId: "not-a-uuid" })).api;
    await expect(malformedProfile.createProfile("csrf")).rejects.toThrow("Invalid Player API resource identity");
  });

  it("rejects malformed selected Move cardinality and duplicates before rendering", async () => {
    const id = "0199472a-0000-7000-8000-000000000001";
    for (const moveLoadout of [
      { state: "uninitialized", moveIds: ["move:a"] },
      { state: "selected", moveIds: [] },
      { state: "selected", moveIds: ["move:a", "move:a"] },
      { state: "selected", moveIds: ["move:a", "move:b", "move:c", "move:d", "move:e"] },
    ]) {
      const { api } = apiWith(() => response({ pokemonInstanceId: id, speciesId: "species:test", level: 5,
        selectedAbilityId: null, rowVersion: "0", ivs: { hp: 10, atk: 9, def: 8, spa: 7, spd: 6, spe: 5 },
        moveLoadout }));
      await expect(api.pokemon(id)).rejects.toThrow("Invalid Player API selected Move state");
    }
  });

  it("fails closed on duplicate page identities or an unexpected saved-Team quota", async () => {
    const pokemonId = "0199472a-0000-7000-8000-000000000001";
    const teamId = "0199472a-0000-7000-8000-000000000101";
    const summary = {
      pokemonInstanceId: pokemonId,
      speciesId: "species:test",
      level: 5,
      selectedAbilityId: null,
      rowVersion: "0",
    };
    const duplicateCollection = apiWith(() => response({ items: [summary, summary], nextCursor: null })).api;
    await expect(duplicateCollection.collection()).rejects.toThrow("Duplicate Player API Collection identity");

    const duplicateTeams = apiWith(() => response({
      teamLimit: 6,
      teams: [{ teamId, rowVersion: "0" }, { teamId, rowVersion: "1" }],
      nextCursor: null,
    })).api;
    await expect(duplicateTeams.teams()).rejects.toThrow("Duplicate Player API Team identity");

    const wrongQuota = apiWith(() => response({ teamLimit: 7, teams: [], nextCursor: null })).api;
    await expect(wrongQuota.teams()).rejects.toThrow("Invalid Player API Teams page");
  });

  it("rejects Player decimals beyond PostgreSQL signed bigint and oversized cursors", async () => {
    const pokemonId = "0199472a-0000-7000-8000-000000000001";
    const tooLarge = "9223372036854775808";
    const invalidVersion = apiWith(() => response({
      items: [{
        pokemonInstanceId: pokemonId,
        speciesId: "species:test",
        level: 5,
        selectedAbilityId: null,
        rowVersion: tooLarge,
      }],
      nextCursor: null,
    })).api;
    await expect(invalidVersion.collection()).rejects.toThrow("Invalid Player API decimal version");

    const oversizedCursor = apiWith(() => response({ items: [], nextCursor: "x".repeat(4097) })).api;
    await expect(oversizedCursor.collection()).rejects.toThrow("Invalid Player API pagination cursor");
  });

  it("uses the parsed bounded Retry-After directive for visible copy", async () => {
    const raw = "9999999999999999999999999 injected";
    const { api } = apiWith(() => response({ error: "team_create_rate_limited" }, 429, { "Retry-After": raw }));
    const failure = await api.createTeam("csrf", "key").catch((error: unknown) => error);
    expect(failure).toMatchObject({ directive: { kind: "rate_limited", retryAfterSeconds: null } });
    expect(playerErrorText(failure)).not.toContain("injected");
    expect(playerErrorText(failure)).not.toContain(raw);
  });
});

describe("ordered Team draft transforms", () => {
  it("bounds the roster, rejects duplicates and preserves slot preference", () => {
    const roster = ["a", "b", "c", "d", "e", "f"];
    expect(addRosterMember(roster, "g")).toBe(roster);
    expect(addRosterMember(["a"], "a")).toEqual(["a"]);
    expect(addRosterMember(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(reorderRosterMember(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(reorderRosterMember(roster, 0, -1)).toBe(roster);
    expect(removeRosterMember(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });

  it("merges overlapping concurrent page reads without duplicating stable identities", () => {
    const first = { items: [{ id: "a", version: 0 }, { id: "b", version: 0 }], nextCursor: "next" };
    const second = { items: [{ id: "b", version: 1 }, { id: "c", version: 0 }], nextCursor: null };
    expect(appendPage(first, second, (item) => item.id)).toEqual({
      items: [{ id: "a", version: 0 }, { id: "b", version: 1 }, { id: "c", version: 0 }], nextCursor: null,
    });
  });

  it("allows retry after page failure but fails closed on a successful opaque-cursor cycle", () => {
    const afterA = recordPageContinuation(new Set(), "cursor-a", "cursor-b");
    expect([...afterA]).toEqual(["cursor-a"]);
    expect(() => recordPageContinuation(afterA, "cursor-b", "cursor-a"))
      .toThrow("repeated cursor cycle");
    expect(() => recordPageContinuation(new Set(), "cursor-a", "cursor-a"))
      .toThrow("repeated cursor cycle");
    expect([...recordPageContinuation(new Set(), "cursor-a", null)]).toEqual(["cursor-a"]);
  });

  it("recognizes only exact ordered roster equality for stale-response reconciliation", () => {
    expect(sameOrderedRoster(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameOrderedRoster(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameOrderedRoster(["a"], ["a", "b"])).toBe(false);
  });
});

describe("single-resource refresh state", () => {
  it("retains a safe ready snapshot while refresh is pending or fails", () => {
    const ready = resourceRefreshSucceeded({ version: "1", value: "authoritative" });
    expect(markResourceRefresh(ready)).toEqual({
      status: "ready",
      value: { version: "1", value: "authoritative" },
      refreshPending: true,
      refreshError: null,
    });

    const failure = new Error("offline");
    expect(resourceRefreshFailed(markResourceRefresh(ready), failure)).toEqual({
      status: "ready",
      value: { version: "1", value: "authoritative" },
      refreshPending: false,
      refreshError: failure,
    });
  });
});
