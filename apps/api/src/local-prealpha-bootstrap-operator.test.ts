import { describe, expect, it } from "vitest";
import type { PlayerBootstrapApplicationResult } from "./player/bootstrap";
import { runLocalBootstrapRequests, type LocalBootstrapOutcome, type LocalBootstrapRequest } from "./local-prealpha-bootstrap-operator";

const requests: readonly LocalBootstrapRequest[] = [
  { label: "A", playerId: "player:a", starterSpeciesId: "candidate:species:pokedex-bulbasaur-1:91b07648a3" },
  { label: "B", playerId: "player:b", starterSpeciesId: "candidate:species:pokedex-cyndaquil-155:f879aca845" },
];

function accepted(playerId: string, replayed = false): Extract<PlayerBootstrapApplicationResult, { status: "accepted" }> {
  return {
    status: "accepted", replayed,
    bootstrap: {
      playerId, starterSpeciesId: requests.find((row) => row.playerId === playerId)!.starterSpeciesId,
      pokemonInstanceId: `pokemon:${playerId}`, teamId: `team:${playerId}`,
      gameDataVersion: "game-data:test", rulesVersion: "rules:test", contentVersion: "content:test",
      contentHash: "sha256:test", acceptedAt: new Date("2026-10-07T00:00:00Z"),
    },
  };
}

describe("local Bootstrap operator per-Player integrity", () => {
  it("rejects an invalid B starter before invoking either Player bootstrap", async () => {
    const calls: string[] = [];
    const outcomes: LocalBootstrapOutcome[] = [];
    await expect(runLocalBootstrapRequests([requests[0]!, { ...requests[1]!, starterSpeciesId: "invalid" }], async ({ playerId }) => {
      calls.push(playerId); return accepted(playerId);
    }, (row) => outcomes.push(row))).rejects.toThrow(/no Player was processed/);
    expect(calls).toEqual([]);
    expect(outcomes).toEqual([]);
  });

  it("reports A success before B conflict and replays A without regranting on retry", async () => {
    const committed = new Set<string>();
    const grants = new Map<string, number>();
    const outcomes: LocalBootstrapOutcome[] = [];
    let conflict = true;
    const bootstrap = async ({ playerId }: { playerId: string }): Promise<PlayerBootstrapApplicationResult> => {
      if (playerId === "player:b" && conflict) {
        expect(outcomes[0]).toMatchObject({ label: "A", status: "accepted", replayed: false });
        return { status: "state_conflict", reason: "inventory" };
      }
      const replayed = committed.has(playerId);
      if (!replayed) { committed.add(playerId); grants.set(playerId, (grants.get(playerId) ?? 0) + 75); }
      return accepted(playerId, replayed);
    };
    await expect(runLocalBootstrapRequests(requests, bootstrap, (row) => outcomes.push(row)))
      .rejects.toThrow(/Completed Players remain committed/);
    expect(outcomes).toMatchObject([{ label: "A", status: "accepted" }, { label: "B", status: "failed", reason: "state_conflict" }]);
    expect([...grants]).toEqual([["player:a", 75]]);
    conflict = false;
    const retried = await runLocalBootstrapRequests(requests, bootstrap, (row) => outcomes.push(row));
    expect(retried).toMatchObject([{ label: "A", replayed: true }, { label: "B", replayed: false }]);
    expect([...grants]).toEqual([["player:a", 75], ["player:b", 75]]);
  });

  it("reports a bounded failure without placing exception details in the outcome", async () => {
    const outcomes: LocalBootstrapOutcome[] = [];
    await expect(runLocalBootstrapRequests(requests, async ({ playerId }) => {
      if (playerId === "player:b") throw new Error("internal database details");
      return accepted(playerId);
    }, (row) => outcomes.push(row))).rejects.toThrow(/do not Reset/);
    expect(outcomes).toMatchObject([{ label: "A", status: "accepted" }, { label: "B", status: "failed", reason: "operation_failed" }]);
    expect(JSON.stringify(outcomes)).not.toContain("internal database details");
  });

  it("rejects duplicated Player identities before any invocation", async () => {
    await expect(runLocalBootstrapRequests([requests[0]!, { ...requests[1]!, playerId: requests[0]!.playerId }], async () => {
      throw new Error("must not execute");
    }, () => {})).rejects.toThrow(/distinct ordered Player fixtures/);
  });

  it("reports the returned historical authority on replay instead of relabeling it as current", async () => {
    const legacy = accepted("player:a", true);
    const result = await runLocalBootstrapRequests([requests[0]!], async () => ({
      ...legacy,
      bootstrap: { ...legacy.bootstrap, contentVersion: "player-bootstrap-prealpha-v1", contentHash: "sha256:legacy" },
    }), () => {});
    expect(result[0]).toMatchObject({ replayed: true, contentVersion: "player-bootstrap-prealpha-v1", contentHash: "sha256:legacy" });
  });
});
