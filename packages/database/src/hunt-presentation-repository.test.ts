import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  appendHuntPresentationBattleInTransaction,
  canonicalPresentationJson,
  insertHuntPresentationStreamInTransaction,
  loadHuntPresentationPrivateBattle,
  loadHuntPresentationStream,
  sealHuntPresentationTerminalInTransaction,
  type HuntPresentationBattleWrite,
  type HuntPresentationDbClient,
} from "./hunt-presentation-repository";

const huntId = "00000000-0000-4000-8000-000000000101";
const playerId = "00000000-0000-4000-8000-000000000102";
const bytes = (value: unknown) => new TextEncoder().encode(canonicalPresentationJson(value));
const digest = (value: unknown) => createHash("sha256").update(bytes(value)).digest();

type Row = Record<string, unknown>;

class PrivateMemoryLedger {
  readonly streams = new Map<string, Row>();
  readonly battles = new Map<string, Row>();
  readonly events = new Map<string, Row>();

  private eventRows(battleId?: string): Row[] {
    return [...this.events.values()]
      .filter((event) => battleId === undefined || event.battle_id === battleId)
      .sort((left, right) => Number(left.event_index) - Number(right.event_index));
  }

  readonly client = {
    query: async (sql: string, values: readonly unknown[] = []) => {
      const query = sql.replace(/\s+/gu, " ").trim();
      const params = [...values];
      let rows: Row[] = [];
      if (query.startsWith("INSERT INTO pokenexus.hunt_presentation_streams")) {
        const columns = query.match(/\(([^)]+)\) VALUES \(/u)?.[1]
          ?.split(",").map((column) => column.trim()) ?? [];
        if (columns.length !== params.length || new Set(columns).size !== columns.length) {
          throw new Error("Presentation stream INSERT columns must be unique and match the bound parameters");
        }
        this.streams.set(String(params[0]), {
          hunt_id: params[0], player_id: params[1],
          input_schema_version: params[2], checkpoint_schema_version: params[3],
          game_data_version: params[4], rules_version: params[5],
          source_event_schema_version: params[6], presentation_schema_version: params[7],
          status: "available", unavailable_reason: null, published_event_index: "0",
          public_prefix_digest: Buffer.alloc(32), private_prefix_digest: Buffer.alloc(32),
          publication_generation: "0", committed_logical_time_ms: "0",
          is_terminal: false, presentation_terminal_recorded_at: null,
        });
      } else if (query.includes("FROM pokenexus.hunt_presentation_streams")) {
        if (!query.includes("input_schema_version") || !query.includes("checkpoint_schema_version")) {
          throw new Error("Presentation stream SELECT must retain both frozen schema-version pins");
        }
        const stream = this.streams.get(String(params[1]));
        rows = stream && stream.player_id === params[0] ? [stream] : [];
      } else if (query.startsWith("UPDATE pokenexus.hunt_presentation_streams")) {
        const stream = this.streams.get(String(params[0]));
        if (!stream || stream.player_id !== params[1]) return { rows: [], rowCount: 0 };
        if (query.includes("SET status = 'unavailable'")) {
          if (stream.status === "available") {
            stream.status = "unavailable";
            stream.unavailable_reason = params[2];
            stream.publication_generation = String(Number(stream.publication_generation) + 1);
          }
        } else if (query.includes("SET is_terminal = true")) {
          if (typeof params[2] !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}\+00:00$/u.test(params[2])) {
            throw new Error("Terminal presentation anchor must be a bound UTC microsecond timestamp");
          }
          stream.is_terminal = true;
          stream.presentation_terminal_recorded_at = new Date(params[2]);
          stream.publication_generation = String(Number(stream.publication_generation) + 1);
        } else if (query.includes("SET published_event_index")) {
          stream.published_event_index = String(params[2]);
          stream.public_prefix_digest = params[3];
          stream.private_prefix_digest = params[4];
          stream.committed_logical_time_ms = String(params[5]);
          stream.publication_generation = String(Number(stream.publication_generation) + 1);
        } else if (query.includes("SET committed_logical_time_ms")) {
          stream.committed_logical_time_ms = String(params[2]);
          stream.publication_generation = String(Number(stream.publication_generation) + 1);
        }
      } else if (query.startsWith("INSERT INTO pokenexus.hunt_presentation_battles")) {
        this.battles.set(String(params[3]), {
          encounter_ordinal: String(params[1]), encounter_id: params[2], battle_id: params[3],
          battle_started_at_hunt_time_ms: String(params[4]),
          initial_sides_json: JSON.parse(String(params[5])),
          initial_participants_json: JSON.parse(String(params[6])),
          public_header_digest: params[7],
          private_origin_json: JSON.parse(String(params[8])),
          private_continuation_context_json: JSON.parse(String(params[9])),
          private_origin_digest: params[10],
          private_continuation_context_digest: params[11],
        });
      } else if (query.includes("FROM pokenexus.hunt_presentation_battles")
        && query.includes("encounter_ordinal =")) {
        rows = [...this.battles.values()].filter((battle) =>
          battle.encounter_ordinal === String(params[1])
            || battle.encounter_id === params[2]
            || battle.battle_id === params[3]);
      } else if (query.includes("FROM pokenexus.hunt_presentation_battles")
        && query.includes("ORDER BY b.encounter_ordinal DESC")) {
        rows = [...this.battles.values()]
          .sort((left, right) => Number(right.encounter_ordinal) - Number(left.encounter_ordinal))
          .slice(0, 1);
      } else if (query.includes("FROM pokenexus.hunt_presentation_battles")
        && query.includes("private_continuation_context_json")) {
        const battle = this.battles.get(String(params[1]));
        const event = this.eventRows(String(params[1])).at(-1);
        const previous = event
          ? this.eventRows().find((candidate) =>
              Number(candidate.event_index) === Number(event.event_index) - 1)
          : undefined;
        const stream = this.streams.get(String(params[0]));
        rows = battle && stream ? [{
          ...battle,
          event_index: event?.event_index ?? null,
          sequence: event?.sequence ?? null,
          combat_time_ms: event?.combat_time_ms ?? null,
          private_source_bytes: event?.private_source_bytes ?? null,
          private_prefix_digest: event?.private_prefix_digest ?? null,
          previous_private_prefix_digest: previous?.private_prefix_digest ?? null,
          input_schema_version: stream.input_schema_version,
          checkpoint_schema_version: stream.checkpoint_schema_version,
          presentation_schema_version: stream.presentation_schema_version,
          game_data_version: stream.game_data_version,
          rules_version: stream.rules_version,
          source_event_schema_version: stream.source_event_schema_version,
        }] : [];
      } else if (query.startsWith("UPDATE pokenexus.hunt_presentation_battles")) {
        const battle = this.battles.get(String(params[1]));
        if (battle) {
          battle.private_continuation_context_json = JSON.parse(String(params[2]));
          battle.private_continuation_context_digest = params[3];
        }
      } else if (query.startsWith("INSERT INTO pokenexus.hunt_presentation_events")) {
        this.events.set(`${params[2]}:${params[3]}`, {
          event_index: String(params[1]), battle_id: params[2], sequence: String(params[3]),
          combat_time_ms: params[4], public_event_json: JSON.parse(String(params[5])),
          public_event_bytes: params[6], private_source_bytes: params[7],
          private_source_digest: params[8], private_prefix_digest: params[9],
          public_prefix_digest: params[10],
        });
      } else if (query.includes("FROM pokenexus.hunt_presentation_events")
        && query.includes("ORDER BY e.event_index DESC LIMIT 1")) {
        const event = this.eventRows().at(-1);
        const battle = event && this.battles.get(String(event.battle_id));
        const previous = event
          ? this.eventRows().find((candidate) =>
              Number(candidate.event_index) === Number(event.event_index) - 1)
          : undefined;
        rows = event && battle ? [{
          ...event,
          ...battle,
          event_index: event.event_index,
          sequence: event.sequence,
          combat_time_ms: String(event.combat_time_ms),
          private_source_bytes: event.private_source_bytes,
          public_event_json: event.public_event_json,
          public_event_bytes: event.public_event_bytes,
          private_source_digest: event.private_source_digest,
          public_prefix_digest: event.public_prefix_digest,
          private_prefix_digest: event.private_prefix_digest,
          previous_public_prefix_digest: previous?.public_prefix_digest ?? null,
          previous_private_prefix_digest: previous?.private_prefix_digest ?? null,
        }] : [];
      } else if (query.includes("FROM pokenexus.hunt_presentation_events")
        && query.includes("WHERE hunt_id = $1 ORDER BY event_index DESC LIMIT 1")) {
        rows = this.eventRows().slice(-1);
      } else if (query.includes("FROM pokenexus.hunt_presentation_events")
        && query.includes("JOIN pokenexus.hunt_presentation_battles")) {
        const event = this.eventRows().find((entry) => entry.event_index === String(params[1]));
        const battle = event && this.battles.get(String(event.battle_id));
        rows = event && battle ? [{ ...event, encounter_ordinal: battle.encounter_ordinal }] : [];
      } else if (query.includes("FROM pokenexus.hunt_presentation_events")
        && query.includes("WHERE hunt_id = $1 AND event_index =")) {
        rows = this.eventRows().filter((event) => event.event_index === String(params[1]));
      } else if (query.includes("FROM pokenexus.hunt_presentation_events")
        && (query.includes("ORDER BY sequence DESC")
          || query.includes("ORDER BY e.sequence DESC"))) {
        rows = this.eventRows(String(params[1])).sort((left, right) =>
          Number(right.sequence) - Number(left.sequence)).slice(0, 1);
      } else if (query.includes("FROM pokenexus.hunt_presentation_events")
        && query.includes("sequence = $3")) {
        const entry = this.events.get(`${params[1]}:${params[2]}`);
        rows = entry ? [entry] : [];
      } else {
        throw new Error(`Unrecognized in-memory SQL contract: ${query.slice(0, 150)}`);
      }
      return { rows, rowCount: rows.length };
    },
  } as unknown as HuntPresentationDbClient;
}

const authority = {
  huntId, playerId,
  inputSchemaVersion: "hunt-runtime-inputs-v2",
  checkpointSchemaVersion: "pokenexus.solo-hunt-checkpoint.v3",
  gameDataVersion: "data:v1",
  rulesVersion: "rules:v1",
  sourceEventSchemaVersion: "events:v1",
  presentationSchemaVersion: "pokenexus.combat-presentation.v1" as const,
};

const sourceOrigin = {
  battleId: "battle:first",
  sides: [{ sideId: "owned", combatantIds: ["owned"], activeCombatantIds: ["owned"] },
    { sideId: "wild", combatantIds: ["wild"], activeCombatantIds: ["wild"] }],
  participants: [
    { kind: "owned", combatantId: "owned", sideId: "owned", currentHp: 30, maxHp: 30, shiny: true },
    { kind: "wild", combatantId: "wild", sideId: "wild", shiny: false, state: "conscious" },
  ],
  initialEvents: [{ kind: "BattleStarted", battleId: "battle:first", sequence: 1, combatTimeMs: 0 }],
};

function battleChunk(
  sequence: number,
  publicEvent: unknown,
  privateSource: unknown = publicEvent,
): HuntPresentationBattleWrite {
  return {
    encounterId: "encounter:first",
    encounterOrdinal: 1,
    battleId: "battle:first",
    battleStartedAtHuntTimeMs: 0,
    // These are already TASK-028 PUBLIC, not original private participants.
    initialSides: sourceOrigin.sides,
    initialParticipants: [
      { combatantId: "owned", sideId: "owned", identity: { kind: "owned_pokemon", shiny: true },
        vitality: { visibility: "exact", currentHp: 30, maxHp: 30, state: "conscious" } },
      { combatantId: "wild", sideId: "wild", identity: { kind: "wild_pokemon", shiny: false },
        vitality: { visibility: "hidden", state: "conscious" } },
    ],
    privateOrigin: sourceOrigin,
    continuationContext: {
      schemaVersion: "v1", battleId: "battle:first",
      sourceCombatEventSchemaVersion: "events:v1",
      participantBindings: [{ kind: "owned", combatantId: "owned", sideId: "owned" },
        { kind: "wild", combatantId: "wild", sideId: "wild" }],
      lastSequence: sequence, lastCombatTimeMs: 0,
    },
    publicEvents: [{ sequence, combatTimeMs: 0, publicEvent,
      publicBytes: bytes(publicEvent), privateSourceBytes: bytes(privateSource) }],
  };
}

describe("TASK-103 private/visible transactional presentation ledger (SQL-free contract mock)", () => {
  it("retains the original PUBLIC Battle header across bootstrap and later continuation; exact retry is inert", async () => {
    const db = new PrivateMemoryLedger();
    await insertHuntPresentationStreamInTransaction(db.client, authority);
    const started = { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "battle:first" };
    const moved = { kind: "MoveUsed", sequence: 2, combatTimeMs: 0,
      actorId: "owned", moveId: "test", targetIds: ["wild"] };
    expect(await appendHuntPresentationBattleInTransaction(
      db.client, playerId, huntId, battleChunk(1, started), 0,
    )).toBe("appended");
    expect(await appendHuntPresentationBattleInTransaction(
      db.client, playerId, huntId, battleChunk(2, moved), 0,
    )).toBe("appended");
    const before = await loadHuntPresentationStream(db.client, playerId, huntId);
    expect(before?.status).toBe("available");
    expect(before?.publishedEventIndex).toBe(2n);
    const beforeGeneration = before?.publicationGeneration;
    expect(await appendHuntPresentationBattleInTransaction(
      db.client, playerId, huntId, battleChunk(2, moved), 0,
    )).toBe("appended");
    expect((await loadHuntPresentationStream(db.client, playerId, huntId))?.publicationGeneration)
      .toBe(beforeGeneration);
    expect(db.events.size).toBe(2);
    expect((await loadHuntPresentationPrivateBattle(db.client, huntId, "battle:first"))?.contextValid)
      .toBe(true);
  });

  it("uses the same private and public prefixes for identical direct and segmented source events", async () => {
    const started = { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "battle:first" };
    const moved = { kind: "MoveUsed", sequence: 2, combatTimeMs: 0,
      actorId: "owned", moveId: "test", targetIds: ["wild"] };
    const first = battleChunk(1, started);
    const second = battleChunk(2, moved);
    const direct = new PrivateMemoryLedger();
    const segmented = new PrivateMemoryLedger();
    await insertHuntPresentationStreamInTransaction(direct.client, authority);
    await insertHuntPresentationStreamInTransaction(segmented.client, authority);
    expect(await appendHuntPresentationBattleInTransaction(
      direct.client, playerId, huntId, {
        ...first,
        continuationContext: second.continuationContext,
        publicEvents: [...first.publicEvents, ...second.publicEvents],
      }, 0,
    )).toBe("appended");
    await appendHuntPresentationBattleInTransaction(segmented.client, playerId, huntId, first, 0);
    await appendHuntPresentationBattleInTransaction(segmented.client, playerId, huntId, second, 0);
    const directStream = await loadHuntPresentationStream(direct.client, playerId, huntId);
    const segmentedStream = await loadHuntPresentationStream(segmented.client, playerId, huntId);
    expect(directStream?.publicPrefixDigest).toEqual(segmentedStream?.publicPrefixDigest);
    expect(directStream?.privatePrefixDigest).toEqual(segmentedStream?.privatePrefixDigest);
    expect((await loadHuntPresentationPrivateBattle(direct.client, huntId, "battle:first"))?.contextValid)
      .toBe(true);
    expect((await loadHuntPresentationPrivateBattle(segmented.client, huntId, "battle:first"))?.contextValid)
      .toBe(true);
  });

  it("continues a committed prefix into the next Battle without interpreting its context as the prior Battle", async () => {
    const db = new PrivateMemoryLedger();
    await insertHuntPresentationStreamInTransaction(db.client, authority);
    const started = { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "battle:first" };
    const ended = { kind: "BattleEnded", sequence: 2, combatTimeMs: 0,
      outcome: { kind: "win", winnerSideId: "owned" } };
    expect(await appendHuntPresentationBattleInTransaction(
      db.client, playerId, huntId, {
        ...battleChunk(1, started),
        continuationContext: battleChunk(2, ended).continuationContext,
        publicEvents: [
          ...battleChunk(1, started).publicEvents,
          ...battleChunk(2, ended).publicEvents,
        ],
      }, 0,
    )).toBe("appended");
    const newBattleId = "battle:second";
    const secondStarted = { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: newBattleId };
    const second = battleChunk(1, secondStarted);
    const newOrigin = {
      ...sourceOrigin,
      battleId: newBattleId,
      initialEvents: [secondStarted],
    };
    expect(await appendHuntPresentationBattleInTransaction(db.client, playerId, huntId, {
      ...second,
      encounterId: "encounter:second",
      encounterOrdinal: 2,
      battleId: newBattleId,
      battleStartedAtHuntTimeMs: 1,
      privateOrigin: newOrigin,
      continuationContext: { ...(second.continuationContext as Record<string, unknown>),
        battleId: newBattleId },
    }, 1)).toBe("appended");
    expect((await loadHuntPresentationStream(db.client, playerId, huntId)))
      .toMatchObject({ status: "available", publishedEventIndex: 3n });
    expect((await loadHuntPresentationPrivateBattle(db.client, huntId, newBattleId))?.contextValid)
      .toBe(true);
    const reopened = { kind: "MoveUsed", sequence: 3, combatTimeMs: 0,
      actorId: "owned", moveId: "test", targetIds: ["wild"] };
    expect(await appendHuntPresentationBattleInTransaction(
      db.client, playerId, huntId, battleChunk(3, reopened), 1,
    )).toBe("unavailable");
    expect((await loadHuntPresentationStream(db.client, playerId, huntId)))
      .toMatchObject({ status: "unavailable", publishedEventIndex: 3n });
    expect(db.events.size).toBe(3);
  });

  it("never appends a new source event after BattleEnded within the same Battle", async () => {
    const db = new PrivateMemoryLedger();
    await insertHuntPresentationStreamInTransaction(db.client, authority);
    const started = { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "battle:first" };
    const ended = { kind: "BattleEnded", sequence: 2, combatTimeMs: 0,
      outcome: { kind: "win", winnerSideId: "owned" } };
    const moved = { kind: "MoveUsed", sequence: 3, combatTimeMs: 0,
      actorId: "owned", moveId: "test", targetIds: ["wild"] };
    const first = battleChunk(1, started);
    const second = battleChunk(2, ended);
    expect(await appendHuntPresentationBattleInTransaction(db.client, playerId, huntId, {
      ...first,
      continuationContext: second.continuationContext,
      publicEvents: [...first.publicEvents, ...second.publicEvents],
    }, 0)).toBe("appended");
    expect(await appendHuntPresentationBattleInTransaction(
      db.client, playerId, huntId, battleChunk(3, moved), 0,
    )).toBe("unavailable");
    expect((await loadHuntPresentationStream(db.client, playerId, huntId)))
      .toMatchObject({ status: "unavailable", publishedEventIndex: 2n });
  });

  it.each(["input_schema_version", "checkpoint_schema_version", "presentation_schema_version"] as const)(
    "rejects modification of the frozen %s after a committed event",
    async (pin) => {
      const db = new PrivateMemoryLedger();
      await insertHuntPresentationStreamInTransaction(db.client, authority);
      const started = { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "battle:first" };
      await appendHuntPresentationBattleInTransaction(db.client, playerId, huntId, battleChunk(1, started), 0);
      db.streams.get(huntId)![pin] = "unexpected-version";
      const moved = { kind: "MoveUsed", sequence: 2, combatTimeMs: 0,
        actorId: "owned", moveId: "test", targetIds: ["wild"] };
      expect(await appendHuntPresentationBattleInTransaction(
        db.client, playerId, huntId, battleChunk(2, moved), 0,
      )).toBe("unavailable");
      expect((await loadHuntPresentationStream(db.client, playerId, huntId))?.status)
        .toBe("unavailable");
    },
  );

  it("rejects a different private damage amount even when TASK-028 masked public bytes are identical", async () => {
    const db = new PrivateMemoryLedger();
    await insertHuntPresentationStreamInTransaction(db.client, authority);
    const started = { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "battle:first" };
    const masked = { kind: "DamageApplied", sequence: 2, combatTimeMs: 0, targetId: "owned" };
    await appendHuntPresentationBattleInTransaction(db.client, playerId, huntId, battleChunk(1, started), 0);
    const original = { ...masked, amount: 13, resultingHp: 17 };
    const forged = { ...masked, amount: 12, resultingHp: 18 };
    await appendHuntPresentationBattleInTransaction(db.client, playerId, huntId, battleChunk(2, masked, original), 0);
    expect(await appendHuntPresentationBattleInTransaction(
      db.client, playerId, huntId, battleChunk(2, masked, forged), 0,
    )).toBe("unavailable");
    expect((await loadHuntPresentationStream(db.client, playerId, huntId))?.status).toBe("unavailable");
  });

  it("rejects a replay that changes the immutable Battle start time", async () => {
    const db = new PrivateMemoryLedger();
    await insertHuntPresentationStreamInTransaction(db.client, authority);
    const started = { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "battle:first" };
    const chunk = battleChunk(1, started);
    expect(await appendHuntPresentationBattleInTransaction(db.client, playerId, huntId, chunk, 0))
      .toBe("appended");
    expect(await appendHuntPresentationBattleInTransaction(
      db.client, playerId, huntId, { ...chunk, battleStartedAtHuntTimeMs: 1 }, 0,
    )).toBe("unavailable");
  });

  it("binds continuation state to the exact previously committed private source prefix", async () => {
    const db = new PrivateMemoryLedger();
    await insertHuntPresentationStreamInTransaction(db.client, authority);
    const started = { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "battle:first" };
    expect(await appendHuntPresentationBattleInTransaction(
      db.client, playerId, huntId, battleChunk(1, started), 0,
    )).toBe("appended");
    const original = await loadHuntPresentationPrivateBattle(db.client, huntId, "battle:first");
    expect(original?.contextValid).toBe(true);
    const battle = db.battles.get("battle:first")!;
    battle.private_continuation_context_json = {
      ...(battle.private_continuation_context_json as Record<string, unknown>),
      participantBindings: [{ kind: "wild", combatantId: "owned", sideId: "owned" },
        { kind: "wild", combatantId: "wild", sideId: "wild" }],
    };
    battle.private_continuation_context_digest = digest(battle.private_continuation_context_json);
    const tampered = await loadHuntPresentationPrivateBattle(db.client, huntId, "battle:first");
    expect(tampered?.contextValid).toBe(false);
  });

  it.each(["public_prefix_digest", "private_prefix_digest"] as const)(
    "rejects append when the stream %s is detached from the last published event",
    async (head) => {
      const db = new PrivateMemoryLedger();
      await insertHuntPresentationStreamInTransaction(db.client, authority);
      const started = { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "battle:first" };
      await appendHuntPresentationBattleInTransaction(db.client, playerId, huntId, battleChunk(1, started), 0);
      const stream = db.streams.get(huntId)!;
      stream[head] = Buffer.alloc(32, 0x5a);
      const moved = { kind: "MoveUsed", sequence: 2, combatTimeMs: 0,
        actorId: "owned", moveId: "test", targetIds: ["wild"] };
      expect(await appendHuntPresentationBattleInTransaction(
        db.client, playerId, huntId, battleChunk(2, moved), 0,
      )).toBe("unavailable");
      expect((await loadHuntPresentationStream(db.client, playerId, huntId)))
        .toMatchObject({ status: "unavailable", publishedEventIndex: 1n });
      expect(db.events.size).toBe(1);
    },
  );

  it("rejects mutated public bootstrap participant visibility even without a changed header digest", async () => {
    const db = new PrivateMemoryLedger();
    await insertHuntPresentationStreamInTransaction(db.client, authority);
    const started = { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "battle:first" };
    await appendHuntPresentationBattleInTransaction(db.client, playerId, huntId, battleChunk(1, started), 0);
    const battle = db.battles.get("battle:first")!;
    const original = battle.initial_participants_json as Array<Record<string, unknown>>;
    battle.initial_participants_json = original.map((participant) =>
      participant.combatantId === "wild"
        ? { ...participant, vitality: { visibility: "exact", currentHp: 88, maxHp: 100 } }
        : participant,
    );
    expect((await loadHuntPresentationPrivateBattle(db.client, huntId, "battle:first"))?.contextValid)
      .toBe(false);
    const moved = { kind: "MoveUsed", sequence: 2, combatTimeMs: 0,
      actorId: "owned", moveId: "test", targetIds: ["wild"] };
    expect(await appendHuntPresentationBattleInTransaction(
      db.client, playerId, huntId, battleChunk(2, moved), 0,
    )).toBe("unavailable");
    expect((await loadHuntPresentationStream(db.client, playerId, huntId))?.status)
      .toBe("unavailable");
  });

  it("rejects a paired public-header and digest rewrite without rewriting committed source history", async () => {
    const db = new PrivateMemoryLedger();
    await insertHuntPresentationStreamInTransaction(db.client, authority);
    const started = { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "battle:first" };
    await appendHuntPresentationBattleInTransaction(db.client, playerId, huntId, battleChunk(1, started), 0);
    const battle = db.battles.get("battle:first")!;
    const participants = battle.initial_participants_json as Array<Record<string, unknown>>;
    battle.initial_participants_json = participants.map((participant) =>
      participant.combatantId === "wild"
        ? { ...participant, vitality: { visibility: "exact", currentHp: 12, maxHp: 100 } }
        : participant,
    );
    const publicHeader = {
      encounterId: battle.encounter_id,
      encounterOrdinal: Number(battle.encounter_ordinal),
      battleId: battle.battle_id,
      battleStartedAtHuntTimeMs: Number(battle.battle_started_at_hunt_time_ms),
      initialSides: battle.initial_sides_json,
      initialParticipants: battle.initial_participants_json,
    };
    battle.public_header_digest = createHash("sha256")
      .update("pokenexus.hunt-presentation.public-header.v1\0")
      .update(bytes(publicHeader)).digest();
    expect((await loadHuntPresentationPrivateBattle(db.client, huntId, "battle:first"))?.contextValid)
      .toBe(false);
    const moved = { kind: "MoveUsed", sequence: 2, combatTimeMs: 0,
      actorId: "owned", moveId: "test", targetIds: ["wild"] };
    expect(await appendHuntPresentationBattleInTransaction(
      db.client, playerId, huntId, battleChunk(2, moved), 0,
    )).toBe("unavailable");
  });

  it("rejects a paired private-origin and digest rewrite against the existing public/private event chain", async () => {
    const db = new PrivateMemoryLedger();
    await insertHuntPresentationStreamInTransaction(db.client, authority);
    const started = { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "battle:first" };
    await appendHuntPresentationBattleInTransaction(db.client, playerId, huntId, battleChunk(1, started), 0);
    const battle = db.battles.get("battle:first")!;
    battle.private_origin_json = { ...(battle.private_origin_json as Record<string, unknown>),
      participants: [{ kind: "wild", shiny: false }] };
    battle.private_origin_digest = digest(battle.private_origin_json);
    expect((await loadHuntPresentationPrivateBattle(db.client, huntId, "battle:first"))?.contextValid)
      .toBe(false);
    const moved = { kind: "MoveUsed", sequence: 2, combatTimeMs: 0,
      actorId: "owned", moveId: "test", targetIds: ["wild"] };
    expect(await appendHuntPresentationBattleInTransaction(
      db.client, playerId, huntId, battleChunk(2, moved), 0,
    )).toBe("unavailable");
  });

  it("rejects an indivisible public bootstrap whose header plus first event cannot fit one bounded page", async () => {
    const db = new PrivateMemoryLedger();
    await insertHuntPresentationStreamInTransaction(db.client, authority);
    const initial = battleChunk(1, {
      kind: "BattleStarted",
      sequence: 1,
      combatTimeMs: 0,
      battleId: "battle:first",
      padding: "e".repeat(129 * 1024),
    });
    const oversizedTogether: HuntPresentationBattleWrite = {
      ...initial,
      initialParticipants: [{ padding: "h".repeat(122 * 1024) }],
    };
    expect(await appendHuntPresentationBattleInTransaction(
      db.client, playerId, huntId, oversizedTogether, 0,
    )).toBe("unavailable");
    expect((await loadHuntPresentationStream(db.client, playerId, huntId)))
      .toMatchObject({ status: "unavailable", publishedEventIndex: 0n });
    expect(db.events.size).toBe(0);
  });

  it("never seals a truncated terminal stream; complete last Battle source seals atomically", async () => {
    const started = { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "battle:first" };
    const ended = { kind: "BattleEnded", sequence: 2, combatTimeMs: 0,
      outcome: { kind: "win", winnerSideId: "owned" } };
    const proof = { encounterOrdinal: 1, battleId: "battle:first", terminalEventSequence: 2,
      requireBattleEnded: true };
    const truncated = new PrivateMemoryLedger();
    await insertHuntPresentationStreamInTransaction(truncated.client, authority);
    await appendHuntPresentationBattleInTransaction(truncated.client, playerId, huntId, battleChunk(1, started), 0);
    await sealHuntPresentationTerminalInTransaction(truncated.client, playerId, huntId, 0, "2026-09-29T12:00:00.000000+00:00", proof);
    expect((await loadHuntPresentationStream(truncated.client, playerId, huntId)))
      .toMatchObject({ status: "unavailable", isTerminal: true });

    const complete = new PrivateMemoryLedger();
    await insertHuntPresentationStreamInTransaction(complete.client, authority);
    await appendHuntPresentationBattleInTransaction(complete.client, playerId, huntId, battleChunk(1, started), 0);
    await appendHuntPresentationBattleInTransaction(complete.client, playerId, huntId, battleChunk(2, ended), 0);
    await sealHuntPresentationTerminalInTransaction(complete.client, playerId, huntId, 0, "2026-09-29T12:00:00.000000+00:00", proof);
    expect((await loadHuntPresentationStream(complete.client, playerId, huntId)))
      .toMatchObject({ status: "available", isTerminal: true,
        presentationTerminalRecordedAt: new Date("2026-09-29T12:00:00Z") });
  });
});
