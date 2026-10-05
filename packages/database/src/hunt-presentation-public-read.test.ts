import { describe, expect, it } from "vitest";
import {
  HuntPresentationPublicProofError,
  listHuntPresentationPublicIndices,
  loadHuntPresentationPublicEvents,
  loadHuntPresentationPublicHeaders,
  loadHuntPresentationPublicPositionAt,
  loadHuntPresentationPublicPrefixAt,
  loadHuntPresentationPublicStream,
} from "./hunt-presentation-public-read";
import {
  canonicalPresentationJson,
  digestAfter,
  publicHeaderDigest,
  type HuntPresentationDbClient,
} from "./hunt-presentation-repository";

const huntId = "0199472a-0000-7000-8000-000000000101";
const playerId = "0199472a-0000-7000-8000-000000000003";
const otherPlayerId = "0199472a-0000-7000-8000-000000000004";
const bytes = (value: unknown) => Buffer.from(canonicalPresentationJson(value), "utf8");

interface Header {
  encounterId: string;
  encounterOrdinal: number;
  battleId: string;
  battleStartedAtHuntTimeMs: number;
  initialSides: readonly unknown[];
  initialParticipants: readonly unknown[];
}

interface Event {
  battleId: string;
  sequence: number;
  combatTimeMs: number;
  publicEvent: Record<string, unknown>;
}

function header(ordinal: number): Header {
  return {
    encounterId: `encounter:${ordinal}`,
    encounterOrdinal: ordinal,
    battleId: `battle:${ordinal}`,
    battleStartedAtHuntTimeMs: 0,
    initialSides: [
      { sideId: "owned", combatantIds: ["owned"], activeCombatantIds: ["owned"] },
      { sideId: "wild", combatantIds: ["wild"], activeCombatantIds: ["wild"] },
    ],
    initialParticipants: [
      { combatantId: "owned", vitality: { visibility: "exact", currentHp: 30, maxHp: 30 } },
      { combatantId: "wild", vitality: { visibility: "hidden", state: "conscious" } },
    ],
  };
}

function event(battleId: string, sequence: number, kind: string, time = 0): Event {
  return {
    battleId, sequence, combatTimeMs: time,
    publicEvent: {
      kind, sequence, combatTimeMs: time,
      ...(kind === "BattleStarted" ? { battleId } : {}),
      ...(kind === "BattleEnded" ? { outcome: { kind: "win", winnerSideId: "owned" } } : {}),
    },
  };
}

type Row = Record<string, unknown>;

class PublicReadFixture {
  readonly headers = new Map<string, Row>();
  readonly events: Row[] = [];
  readonly queries: string[] = [];

  constructor() {
    const battle1 = header(1);
    const battle2 = header(2);
    for (const candidate of [battle1, battle2]) {
      this.headers.set(candidate.battleId, {
        encounter_id: candidate.encounterId,
        encounter_ordinal: String(candidate.encounterOrdinal),
        battle_id: candidate.battleId,
        battle_started_at_hunt_time_ms: String(candidate.battleStartedAtHuntTimeMs),
        initial_sides_json: candidate.initialSides,
        initial_participants_json: candidate.initialParticipants,
        public_header_digest: publicHeaderDigest(candidate),
      });
    }
    const sources = [
      event("battle:1", 1, "BattleStarted"),
      event("battle:1", 2, "MoveUsed"),
      event("battle:1", 3, "BattleEnded"),
      event("battle:2", 1, "BattleStarted"),
      event("battle:2", 2, "MoveUsed", 2000),
      event("battle:2", 3, "BattleEnded", 2000),
    ];
    let prefix: Uint8Array = Buffer.alloc(32);
    for (const [position, source] of sources.entries()) {
      const index = BigInt(position + 1);
      const encoded = bytes(source.publicEvent);
      prefix = digestAfter(
        prefix, index, encoded,
        this.headers.get(source.battleId)!.public_header_digest as Buffer,
      );
      this.events.push({
        event_index: index.toString(),
        battle_id: source.battleId,
        sequence: String(source.sequence),
        combat_time_ms: String(source.combatTimeMs),
        public_byte_length: encoded.byteLength,
        public_event_json: source.publicEvent,
        public_event_bytes: encoded,
        public_prefix_digest: Buffer.from(prefix),
      });
    }
  }

  readonly client = {
    query: async (sql: string, parameters: readonly unknown[] = []) => {
      const statement = sql.replace(/\s+/gu, " ").trim();
      this.queries.push(statement);
      const owned = parameters[0] === playerId && parameters[1] === huntId;
      if (!owned) return { rows: [], rowCount: 0 };
      let rows: Row[];
      if (statement.includes("octet_length(e.public_event_bytes)")) {
        const after = BigInt(String(parameters[2]));
        const through = BigInt(String(parameters[3]));
        rows = this.events
          .filter((row) => BigInt(String(row.event_index)) > after
            && BigInt(String(row.event_index)) <= through)
          .slice(0, Number(parameters[4]))
          .map(({ event_index, battle_id, sequence, combat_time_ms, public_byte_length }) => ({
            event_index, battle_id, sequence, combat_time_ms, public_byte_length,
          }));
      } else if (statement.includes("SELECT e.public_prefix_digest")) {
        rows = this.events.filter((row) => row.event_index === parameters[2])
          .map(({ public_prefix_digest }) => ({ public_prefix_digest }));
      } else if (statement.includes("SELECT e.event_index::text, e.battle_id, b.encounter_id")) {
        rows = this.events.filter((row) => row.event_index === parameters[2])
          .flatMap((row) => {
            const priorHeader = this.headers.get(String(row.battle_id));
            return priorHeader ? [{
              event_index: row.event_index,
              battle_id: row.battle_id,
              encounter_id: priorHeader.encounter_id,
              encounter_ordinal: priorHeader.encounter_ordinal,
              sequence: row.sequence,
              combat_time_ms: row.combat_time_ms,
            }] : [];
          });
      } else if (statement.includes("b.battle_id = ANY(")) {
        rows = (parameters[2] as string[])
          .flatMap((id) => this.headers.get(id) ? [this.headers.get(id)!] : []);
      } else if (statement.includes("LEFT JOIN pokenexus.hunt_presentation_events previous")) {
        const start = BigInt(String(parameters[2]));
        const stop = BigInt(String(parameters[3]));
        rows = this.events.filter((row) =>
          BigInt(String(row.event_index)) >= start && BigInt(String(row.event_index)) <= stop)
          .slice(0, Number(parameters[4])).map((row) => {
            const prior = this.events.find((candidate) =>
              BigInt(String(candidate.event_index)) === BigInt(String(row.event_index)) - 1n);
            const priorHeader = prior && this.headers.get(String(prior.battle_id));
            return {
              ...row,
              previous_public_prefix_digest: prior?.public_prefix_digest ?? null,
              previous_battle_id: prior?.battle_id ?? null,
              previous_encounter_ordinal: priorHeader?.encounter_ordinal ?? null,
              previous_sequence: prior?.sequence ?? null,
              previous_combat_time_ms: prior?.combat_time_ms ?? null,
              previous_event_kind: (prior?.public_event_json as Record<string, unknown> | undefined)?.kind ?? null,
            };
          });
      } else {
        throw new Error(`Unrecognized public-only SQL: ${statement.slice(0, 180)}`);
      }
      return { rows, rowCount: rows.length };
    },
  } as unknown as HuntPresentationDbClient;
}

describe("TASK-103 bounded public-only indexed read prerequisites (SQL-free fixture)", () => {
  it("reads only owner-scoped public stream metadata without fetching the private prefix", async () => {
    let observed = 0;
    const client = {
      query: async (sql: string, parameters: unknown[]) => {
        observed += 1;
        expect(sql).toContain("s.player_id = $1 AND s.hunt_id = $2");
        expect(sql).toContain("CEIL(EXTRACT(EPOCH FROM s.presentation_terminal_recorded_at) * 1000)::bigint::text");
        expect(sql).not.toMatch(/private_/u);
        expect(parameters).toEqual([playerId, huntId]);
        return { rows: [{
          hunt_id: huntId, player_id: playerId, status: "available",
          published_event_index: "1", public_prefix_digest: Buffer.alloc(32, 7),
          publication_generation: "2", committed_logical_time_ms: "1000",
          is_terminal: false, presentation_terminal_recorded_at_ceil_ms: null,
          input_schema_version: "hunt-runtime-inputs-v2",
          checkpoint_schema_version: "pokenexus.solo-hunt-checkpoint.v3",
          game_data_version: "game-data:v1", rules_version: "rules:v1",
          source_event_schema_version: "events:v1",
          presentation_schema_version: "pokenexus.combat-presentation.v1",
        }] };
      },
    } as unknown as HuntPresentationDbClient;
    const stream = await loadHuntPresentationPublicStream(client, playerId, huntId);
    expect(observed).toBe(1);
    expect(stream?.publishedEventIndex).toBe(1n);
    expect(stream?.publicationGeneration).toBe(2n);
    expect(stream?.presentationTerminalRecordedAtCeilMs).toBeNull();
    expect(stream).not.toHaveProperty("privatePrefixDigest");
  });

  it("preserves the rounded-up PostgreSQL microsecond anchor without an extra SELECT", async () => {
    let observed = 0;
    const client = {
      query: async (sql: string, parameters: unknown[]) => {
        observed += 1;
        expect(sql).toContain("CEIL(EXTRACT(EPOCH FROM s.presentation_terminal_recorded_at) * 1000)::bigint::text");
        expect(sql).not.toMatch(/private_/u);
        expect(parameters).toEqual([playerId, huntId]);
        return { rows: [{
          hunt_id: huntId, player_id: playerId, status: "available",
          published_event_index: "1", public_prefix_digest: Buffer.alloc(32, 7),
          publication_generation: "2", committed_logical_time_ms: "1000",
          is_terminal: true,
          // PostgreSQL timestamp = 1800000000000 ms + 1µs; JS Date would truncate it.
          presentation_terminal_recorded_at_ceil_ms: "1800000000001",
          input_schema_version: "hunt-runtime-inputs-v2",
          checkpoint_schema_version: "pokenexus.solo-hunt-checkpoint.v3",
          game_data_version: "game-data:v1", rules_version: "rules:v1",
          source_event_schema_version: "events:v1",
          presentation_schema_version: "pokenexus.combat-presentation.v1",
        }] };
      },
    } as unknown as HuntPresentationDbClient;
    const stream = await loadHuntPresentationPublicStream(client, playerId, huntId);
    expect(observed).toBe(1);
    expect(stream?.presentationTerminalRecordedAtCeilMs).toBe(1_800_000_000_001n);
    expect(stream).not.toHaveProperty("presentationTerminalRecordedAt");
  });

  it("uses indexed length-only lookahead, bounded distinct headers, and public-only source evidence", async () => {
    const fixture = new PublicReadFixture();
    const indexWindow = await listHuntPresentationPublicIndices(
      fixture.client, playerId, huntId, 0n, 6n, 4,
    );
    expect(indexWindow).toHaveLength(5);
    const selected = indexWindow.slice(0, 4);
    const headers = await loadHuntPresentationPublicHeaders(
      fixture.client, playerId, huntId, ["battle:1", "battle:2"],
    );
    const rows = await loadHuntPresentationPublicEvents(
      fixture.client, playerId, huntId, selected, headers,
    );
    expect(rows.map((row) => [row.eventIndex, row.battleId, row.sequence])).toEqual([
      [1n, "battle:1", 1], [2n, "battle:1", 2],
      [3n, "battle:1", 3], [4n, "battle:2", 1],
    ]);
    const second = await listHuntPresentationPublicIndices(
      fixture.client, playerId, huntId, 4n, 6n, 4,
    );
    const after = await loadHuntPresentationPublicEvents(
      fixture.client, playerId, huntId, second,
      await loadHuntPresentationPublicHeaders(fixture.client, playerId, huntId, ["battle:2"]),
    );
    expect(after.map((row) => row.sequence)).toEqual([2, 3]);
    expect(await loadHuntPresentationPublicPrefixAt(fixture.client, playerId, huntId, 6n))
      .toEqual(fixture.events[5]!.public_prefix_digest);
    expect(fixture.queries.every((sql) => !/private_|checkpoint|rng|ivs|genetics/iu.test(sql))).toBe(true);
    expect(fixture.queries.every((sql) => sql.includes("s.player_id = $1"))).toBe(true);
  });

  it("does not return any foreign Player's events or Battle headers", async () => {
    const fixture = new PublicReadFixture();
    await expect(listHuntPresentationPublicIndices(
      fixture.client, otherPlayerId, huntId, 0n, 6n, 3,
    )).rejects.toBeInstanceOf(HuntPresentationPublicProofError);
    expect(await loadHuntPresentationPublicPrefixAt(fixture.client, otherPlayerId, huntId, 6n))
      .toBeNull();
    await expect(loadHuntPresentationPublicHeaders(
      fixture.client, otherPlayerId, huntId, ["battle:1"],
    )).rejects.toBeInstanceOf(HuntPresentationPublicProofError);
  });

  it("reads exact signed cursor-position metadata with one player-scoped indexed lookup", async () => {
    const fixture = new PublicReadFixture();
    expect(await loadHuntPresentationPublicPositionAt(
      fixture.client, playerId, huntId, 3n,
    )).toEqual({
      eventIndex: 3n, encounterId: "encounter:1", encounterOrdinal: 1,
      battleId: "battle:1", sequence: 3, combatTimeMs: 0,
    });
    expect(fixture.queries.at(-1)).toContain("e.event_index = $3::bigint");
    expect(fixture.queries.at(-1)).toContain("s.player_id = $1");
    expect(fixture.queries.at(-1)).not.toMatch(/private_|checkpoint|rng|ivs|genetics/iu);
    expect(await loadHuntPresentationPublicPositionAt(
      fixture.client, otherPlayerId, huntId, 3n,
    )).toBeNull();
    expect(await loadHuntPresentationPublicPositionAt(
      fixture.client, playerId, huntId, 7n,
    )).toBeNull();
    await expect(loadHuntPresentationPublicPositionAt(
      fixture.client, playerId, huntId, 0n,
    )).rejects.toBeInstanceOf(RangeError);
  });

  it("rejects malformed existing cursor-position source instead of returning it", async () => {
    const fixture = new PublicReadFixture();
    fixture.events[2]!.sequence = "0";
    await expect(loadHuntPresentationPublicPositionAt(
      fixture.client, playerId, huntId, 3n,
    )).rejects.toBeInstanceOf(HuntPresentationPublicProofError);
  });

  it("rejects public header modification even when its stored digest is rewritten coherently", async () => {
    const fixture = new PublicReadFixture();
    const altered = fixture.headers.get("battle:1")!;
    altered.initial_participants_json = [
      { combatantId: "wild", vitality: { visibility: "exact", currentHp: 99, maxHp: 100 } },
    ];
    altered.public_header_digest = publicHeaderDigest({
      encounterId: String(altered.encounter_id),
      encounterOrdinal: Number(altered.encounter_ordinal),
      battleId: String(altered.battle_id),
      battleStartedAtHuntTimeMs: Number(altered.battle_started_at_hunt_time_ms),
      initialSides: altered.initial_sides_json,
      initialParticipants: altered.initial_participants_json,
    });
    const indices = await listHuntPresentationPublicIndices(
      fixture.client, playerId, huntId, 0n, 3n, 3,
    );
    const headers = await loadHuntPresentationPublicHeaders(
      fixture.client, playerId, huntId, ["battle:1"],
    );
    await expect(loadHuntPresentationPublicEvents(
      fixture.client, playerId, huntId, indices, headers,
    )).rejects.toBeInstanceOf(HuntPresentationPublicProofError);
  });

  it("rejects event-byte tampering even when JSON matches the altered bytes", async () => {
    const fixture = new PublicReadFixture();
    fixture.events[1]!.public_event_json = {
      kind: "DamageApplied", sequence: 2, combatTimeMs: 0, targetId: "wild",
      hpChange: { visibility: "exact", amount: 1, resultingHp: 2 },
    };
    fixture.events[1]!.public_event_bytes = bytes(fixture.events[1]!.public_event_json);
    fixture.events[1]!.public_byte_length = (fixture.events[1]!.public_event_bytes as Buffer).byteLength;
    const indices = await listHuntPresentationPublicIndices(
      fixture.client, playerId, huntId, 0n, 3n, 3,
    );
    const headers = await loadHuntPresentationPublicHeaders(
      fixture.client, playerId, huntId, ["battle:1"],
    );
    await expect(loadHuntPresentationPublicEvents(
      fixture.client, playerId, huntId, indices, headers,
    )).rejects.toBeInstanceOf(HuntPresentationPublicProofError);
  });

  it("rejects a forged sequence, missing event index, and a new Battle without a prior BattleEnded", async () => {
    const fixture = new PublicReadFixture();
    fixture.events.splice(1, 1);
    await expect(listHuntPresentationPublicIndices(
      fixture.client, playerId, huntId, 0n, 6n, 6,
    )).rejects.toBeInstanceOf(HuntPresentationPublicProofError);

    const another = new PublicReadFixture();
    (another.events[2]!.public_event_json as Record<string, unknown>).kind = "MoveUsed";
    const indices = await listHuntPresentationPublicIndices(
      another.client, playerId, huntId, 0n, 4n, 4,
    );
    const headers = await loadHuntPresentationPublicHeaders(
      another.client, playerId, huntId, ["battle:1", "battle:2"],
    );
    await expect(loadHuntPresentationPublicEvents(
      another.client, playerId, huntId, indices, headers,
    )).rejects.toBeInstanceOf(HuntPresentationPublicProofError);
  });

  it("rejects an incomplete indexed tail even if all returned rows are individually contiguous", async () => {
    const fixture = new PublicReadFixture();
    fixture.events.splice(-1, 1);
    await expect(listHuntPresentationPublicIndices(
      fixture.client, playerId, huntId, 0n, 6n, 6,
    )).rejects.toBeInstanceOf(HuntPresentationPublicProofError);
  });

  it("rejects out-of-window and excessive event/header/byte budgets without querying the DB", async () => {
    const fixture = new PublicReadFixture();
    await expect(listHuntPresentationPublicIndices(
      fixture.client, playerId, huntId, 0n, 6n, 129,
    )).rejects.toBeInstanceOf(RangeError);
    await expect(listHuntPresentationPublicIndices(
      fixture.client, playerId, huntId, 7n, 6n, 4,
    )).rejects.toBeInstanceOf(RangeError);
    await expect(loadHuntPresentationPublicHeaders(
      fixture.client, playerId, huntId, ["battle:1", "battle:1"],
    )).rejects.toBeInstanceOf(RangeError);
    const indices = await listHuntPresentationPublicIndices(
      fixture.client, playerId, huntId, 0n, 6n, 4,
    );
    await expect(loadHuntPresentationPublicEvents(
      fixture.client, playerId, huntId,
      [{ ...indices[0]!, publicByteLength: 256 * 1024 + 1 }],
      new Map(),
    )).rejects.toBeInstanceOf(RangeError);
  });
});
