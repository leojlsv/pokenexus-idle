import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createOrLoadPlayerByAccountId,
  encodeOpaqueStringDbV1,
  generateUuidV7,
  grantInventoryEntries,
  loadOwnedPokemon,
  replaceOwnedPokemonMoveLoadout,
  withPgClient,
} from "@pokenexus/database";
import { runMigrations } from "@pokenexus/database/migrations";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSessionPrincipal } from "../src/auth/application";
import {
  createApiApp,
  CSRF_HEADER_NAME,
  SESSION_COOKIE_NAME,
  type AuthHttpApplication,
} from "../src/auth/http";
import {
  MoveEligibilityApplicationService,
  createPgMoveLoadoutRepository,
} from "../src/moves/application";
import {
  MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
  MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH,
  type MoveEligibilityContext,
} from "../src/moves/context";
import { PlayerApplication } from "../src/player/application";
import { createPlayerCursorCodec } from "../src/player/protocol";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL is required for Player State PostgreSQL integration tests");
}
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(databaseName)) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL must target pokenexus_test or pokenexus_test_*");
}

const allowedOrigin = "https://example.com";
const now = new Date("2026-09-22T22:00:00.000Z");
const cursorCodec = createPlayerCursorCodec("player-state-cross-package-cursor-secret-material-32-bytes");
const publishedGameDataRoot = resolve(process.cwd(), "../../packages/game-data/published");
const productionGameDataBaseUrl = "https://player-state-game-data.test/";
const productionGameDataVersion = "game-data-core-kanto-johto-v2";
const productionRulesVersion = "rules:task-025-production-http-integration";
const ampharosSpeciesId = "candidate:species:pokedex-ampharos-181:b682912fc8";
const dragonPulseMoveId = "candidate:move:dragon-pulse:54d897ab30";
const takeDownMoveId = "candidate:move:take-down:790765ae8a";
const chargeMoveId = "candidate:move:charge:97488fbab3";

interface SessionFixture {
  readonly accountId: string;
  readonly sessionId: string;
  readonly bearer: string;
  readonly csrf: string;
}

interface PlayerFixture extends SessionFixture {
  readonly playerId: string;
}

class FakeSessionAuth {
  private readonly byBearer = new Map<string, AuthSessionPrincipal>();
  private readonly csrfBySession = new Map<string, string>();

  add(session: SessionFixture): void {
    this.byBearer.set(session.bearer, {
      accountId: session.accountId,
      sessionId: session.sessionId,
      bearerDigest: new Uint8Array([1]),
      securityEpoch: 0n,
      recentAuthAt: null,
      postRecoveryHoldUntil: null,
    });
    this.csrfBySession.set(session.sessionId, session.csrf);
  }

  async authenticateSession(rawBearer: string): Promise<AuthSessionPrincipal | null> {
    return this.byBearer.get(rawBearer) ?? null;
  }

  async verifySessionCsrf(sessionId: string, token: string): Promise<boolean> {
    return this.csrfBySession.get(sessionId) === token;
  }
}

function exactContext(): MoveEligibilityContext {
  const rows = [
    ["move:level-10", 10],
    ["move:level-5", 5],
    ["move:level-1", 1],
  ] as const;
  return {
    pair: { gameDataVersion: "game-data:test-v2", rulesVersion: "rules:test-v1" },
    rules: {
      rulesVersion: "rules:test-v1",
      moveEligibilityRuleArtifactId: MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
      moveEligibilityRuleSemanticsHash: MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH,
    },
    speciesIds: new Set(["species:test"]),
    moveIds: new Set(rows.map(([moveId]) => moveId)),
    learnsetsBySpecies: new Map([[
      "species:test",
      rows.map(([moveId, level]) => ({
        speciesId: "species:test" as never,
        moveId: moveId as never,
        sourceGeneration: 8,
        sourceGame: "test",
        method: "level-up" as const,
        level,
        machineIdentifier: null,
        sourceRecordIds: ["source:test"],
      })),
    ]]),
  };
}

function createHarness(sessions: readonly SessionFixture[]) {
  const auth = new FakeSessionAuth();
  for (const session of sessions) auth.add(session);
  const moveService = new MoveEligibilityApplicationService(
    createPgMoveLoadoutRepository(testDatabaseUrl),
    { async loadForNewOperation() { return exactContext(); } },
  );
  const player = new PlayerApplication(testDatabaseUrl, () => moveService, () => now);
  return createApiApp({
    resolveAuthRuntime: () => ({
      auth: auth as unknown as AuthHttpApplication,
      allowedOrigins: [allowedOrigin],
    }),
    resolvePlayerApplication: () => player,
    resolvePlayerCursorCodec: () => cursorCodec,
  });
}

function readHeaders(session: SessionFixture): Record<string, string> {
  return { Cookie: `${SESSION_COOKIE_NAME}=${session.bearer}` };
}

function commandHeaders(
  session: SessionFixture,
  contentType = false,
): Record<string, string> {
  return {
    Origin: allowedOrigin,
    Cookie: `${SESSION_COOKIE_NAME}=${session.bearer}`,
    [CSRF_HEADER_NAME]: session.csrf,
    ...(contentType ? { "Content-Type": "application/json" } : {}),
  };
}

async function resetSchema(): Promise<void> {
  await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
    await client.query("DROP SCHEMA IF EXISTS pokenexus CASCADE");
  });
}

async function prepareSchema(): Promise<void> {
  await resetSchema();
  await runMigrations({ connectionString: testDatabaseUrl });
}

async function createPlayerFixture(label: string): Promise<PlayerFixture> {
  return withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
    const accountId = generateUuidV7();
    const playerId = generateUuidV7();
    await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
    const player = await createOrLoadPlayerByAccountId(client, accountId, playerId);
    return {
      accountId,
      playerId: player.playerId,
      sessionId: generateUuidV7(),
      bearer: `player-state-${label}-bearer`,
      csrf: `player-state-${label}-csrf`,
    };
  });
}

async function createPokemon(
  ownerPlayerId: string,
  options: {
    readonly speciesId?: string;
    readonly level?: number;
    readonly rowVersion?: bigint;
  } = {},
): Promise<string> {
  return withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
    const pokemonInstanceId = generateUuidV7();
    const level = options.level ?? 10;
    const totalExperience = BigInt(level) ** 3n - 1n;
    await client.query(
      `INSERT INTO pokenexus.pokemon_instances (
         pokemon_instance_id, owner_player_id, species_id, level, total_experience,
         iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe, row_version
       ) VALUES ($1, $2, $3, $4, $5::bigint, 1, 2, 3, 4, 5, 6, $6::bigint)`,
      [
        pokemonInstanceId,
        ownerPlayerId,
        Buffer.from(encodeOpaqueStringDbV1(options.speciesId ?? "species:test")),
        level,
        totalExperience.toString(),
        (options.rowVersion ?? 0n).toString(),
      ],
    );
    return pokemonInstanceId;
  });
}

beforeEach(prepareSchema);
afterAll(resetSchema);

describe("Player State API with PostgreSQL", () => {
  it("keeps reads self-scoped, preserves exact integers, and rejects a stale Inventory continuation", async () => {
    const owner = await createPlayerFixture("owner");
    const foreign = await createPlayerFixture("foreign");
    const exactRowVersion = 9_007_199_254_740_993n;
    const pokemonInstanceId = await createPokemon(owner.playerId, { rowVersion: exactRowVersion });
    const app = createHarness([owner, foreign]);

    const ownedPokemon = await app.request(
      `/player/pokemon/${pokemonInstanceId}`,
      { headers: readHeaders(owner) },
      {} as never,
    );
    expect(ownedPokemon.status).toBe(200);
    await expect(ownedPokemon.json()).resolves.toMatchObject({
      pokemonInstanceId,
      level: 10,
      rowVersion: exactRowVersion.toString(),
    });

    const foreignPokemon = await app.request(
      `/player/pokemon/${pokemonInstanceId}`,
      { headers: readHeaders(foreign) },
      {} as never,
    );
    expect(foreignPokemon.status).toBe(404);
    await expect(foreignPokemon.json()).resolves.toEqual({ error: "not_found" });

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await expect(
        grantInventoryEntries(client, {
          playerId: owner.playerId,
          expectedRowVersion: 0n,
          grants: [
            { itemId: "item:a", quantity: 9_223_372_036_854_775_807n },
            { itemId: "item:b", quantity: 2n },
            { itemId: "item:c", quantity: 3n },
          ],
          now,
        }),
      ).resolves.toEqual({ status: "updated", rowVersion: 1n });
    });

    const firstPage = await app.request(
      "/player/inventory?limit=2",
      { headers: readHeaders(owner) },
      {} as never,
    );
    expect(firstPage.status).toBe(200);
    const firstBody = await firstPage.json() as {
      rowVersion: string;
      entries: Array<{ itemId: string; quantity: string }>;
      nextCursor: string | null;
    };
    expect(firstBody).toMatchObject({
      rowVersion: "1",
      entries: [
        { itemId: "item:a", quantity: "9223372036854775807" },
        { itemId: "item:b", quantity: "2" },
      ],
    });
    expect(typeof firstBody.nextCursor).toBe("string");

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await expect(
        grantInventoryEntries(client, {
          playerId: owner.playerId,
          expectedRowVersion: 1n,
          grants: [{ itemId: "item:d", quantity: 4n }],
          now: new Date(now.getTime() + 1_000),
        }),
      ).resolves.toEqual({ status: "updated", rowVersion: 2n });
    });

    const stalePage = await app.request(
      `/player/inventory?limit=2&cursor=${encodeURIComponent(firstBody.nextCursor ?? "")}`,
      { headers: readHeaders(owner) },
      {} as never,
    );
    expect(stalePage.status).toBe(409);
    await expect(stalePage.json()).resolves.toEqual({ error: "pagination_stale" });
  });

  it("makes Team create response-loss safe and keeps stale/delete/tombstone HTTP semantics exact", async () => {
    const owner = await createPlayerFixture("team-owner");
    const pokemonInstanceId = await createPokemon(owner.playerId);
    const app = createHarness([owner]);
    const idempotencyKey = generateUuidV7();
    const createHeaders = {
      ...commandHeaders(owner),
      "Idempotency-Key": idempotencyKey,
    };

    const created = await app.request(
      "/player/teams",
      { method: "POST", headers: createHeaders },
      {} as never,
    );
    expect(created.status).toBe(200);
    const createdBody = await created.json() as { teamId: string; rowVersion: string };
    expect(createdBody.rowVersion).toBe("0");

    const replay = await app.request(
      "/player/teams",
      { method: "POST", headers: createHeaders },
      {} as never,
    );
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual(createdBody);

    const roster = await app.request(
      `/player/teams/${createdBody.teamId}/roster`,
      {
        method: "PUT",
        headers: commandHeaders(owner, true),
        body: JSON.stringify({
          expectedRowVersion: "0",
          pokemonInstanceIds: [pokemonInstanceId],
        }),
      },
      {} as never,
    );
    expect(roster.status).toBe(200);
    await expect(roster.json()).resolves.toEqual({
      teamId: createdBody.teamId,
      pokemonInstanceIds: [pokemonInstanceId],
      rowVersion: "1",
    });

    const staleRoster = await app.request(
      `/player/teams/${createdBody.teamId}/roster`,
      {
        method: "PUT",
        headers: commandHeaders(owner, true),
        body: JSON.stringify({
          expectedRowVersion: "0",
          pokemonInstanceIds: [],
        }),
      },
      {} as never,
    );
    expect(staleRoster.status).toBe(409);
    await expect(staleRoster.json()).resolves.toEqual({ error: "stale" });

    const deleted = await app.request(
      `/player/teams/${createdBody.teamId}?expectedRowVersion=1`,
      { method: "DELETE", headers: commandHeaders(owner) },
      {} as never,
    );
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe("");

    const replayDeletedCreate = await app.request(
      "/player/teams",
      { method: "POST", headers: createHeaders },
      {} as never,
    );
    expect(replayDeletedCreate.status).toBe(410);
    await expect(replayDeletedCreate.json()).resolves.toEqual({ error: "idempotency_gone" });
  });

  it("routes Move replacement through the real eligibility service and maps stale/unresolved Species", async () => {
    const owner = await createPlayerFixture("move-owner");
    const eligiblePokemonId = await createPokemon(owner.playerId, { speciesId: "species:test", level: 10 });
    const unresolvedSpeciesPokemonId = await createPokemon(owner.playerId, {
      speciesId: "species:missing",
      level: 10,
    });
    const app = createHarness([owner]);

    const updated = await app.request(
      `/player/pokemon/${eligiblePokemonId}/moves`,
      {
        method: "PUT",
        headers: commandHeaders(owner, true),
        body: JSON.stringify({
          expectedRowVersion: "0",
          moveIds: ["move:level-1"],
        }),
      },
      {} as never,
    );
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toEqual({
      pokemonInstanceId: eligiblePokemonId,
      moveIds: ["move:level-1"],
      rowVersion: "1",
    });

    const stale = await app.request(
      `/player/pokemon/${eligiblePokemonId}/moves`,
      {
        method: "PUT",
        headers: commandHeaders(owner, true),
        body: JSON.stringify({
          expectedRowVersion: "0",
          moveIds: ["move:level-5"],
        }),
      },
      {} as never,
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toEqual({ error: "stale" });

    const unresolvedSpecies = await app.request(
      `/player/pokemon/${unresolvedSpeciesPokemonId}/moves`,
      {
        method: "PUT",
        headers: commandHeaders(owner, true),
        body: JSON.stringify({
          expectedRowVersion: "0",
          moveIds: ["move:level-1"],
        }),
      },
      {} as never,
    );
    expect(unresolvedSpecies.status).toBe(503);
    await expect(unresolvedSpecies.json()).resolves.toEqual({ error: "authority_unavailable" });
  });

  it("runs Move replacement through the production env/release/runtime composition over the published bundle", async () => {
    const owner = await createPlayerFixture("production-move-owner");
    const pokemonInstanceId = await createPokemon(owner.playerId, {
      speciesId: ampharosSpeciesId,
      level: 20,
    });
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await expect(replaceOwnedPokemonMoveLoadout(client, {
        ownerPlayerId: owner.playerId,
        pokemonInstanceId,
        expectedRowVersion: 0n,
        moveIds: [dragonPulseMoveId],
        now,
      })).resolves.toEqual({ status: "updated", rowVersion: 1n });
    });

    const auth = new FakeSessionAuth();
    auth.add(owner);
    const env = {
      HYPERDRIVE: { connectionString: testDatabaseUrl },
      PLAYER_STATE_CURSOR_HMAC_KEY: "player-state-production-cursor-secret-material-32-bytes",
      PLAYER_STATE_GAME_DATA_BASE_URL: productionGameDataBaseUrl,
      PLAYER_STATE_MOVE_GAME_DATA_VERSION: productionGameDataVersion,
      PLAYER_STATE_MOVE_RULES_VERSION: productionRulesVersion,
      PLAYER_STATE_MOVE_CONTEXT_RELEASES: JSON.stringify([{
        gameDataVersion: productionGameDataVersion,
        rulesVersion: productionRulesVersion,
        newOperationsAllowed: true,
      }]),
      PLAYER_STATE_MOVE_GAME_DATA_RELEASES: JSON.stringify([{
        gameDataVersion: productionGameDataVersion,
        newOperationsAllowed: true,
      }]),
      PLAYER_STATE_MOVE_RULE_RELEASES: JSON.stringify([{
        rulesVersion: productionRulesVersion,
        newOperationsAllowed: true,
      }]),
    };
    const fetchedPaths: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.origin !== new URL(productionGameDataBaseUrl).origin) {
        throw new Error(`Unexpected game-data fetch origin: ${url.origin}`);
      }
      const relativePath = url.pathname.replace(/^\/+/, "");
      if (!relativePath || relativePath.includes("..")) {
        return new Response(null, { status: 404 });
      }
      fetchedPaths.push(relativePath);
      try {
        const bytes = await readFile(resolve(publishedGameDataRoot, relativePath));
        return new Response(Uint8Array.from(bytes).buffer, { status: 200 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return new Response(null, { status: 404 });
        }
        throw error;
      }
    });

    try {
      const app = createApiApp({
        resolveAuthRuntime: () => ({
          auth: auth as unknown as AuthHttpApplication,
          allowedOrigins: [allowedOrigin],
        }),
      });
      const updated = await app.request(
        `/player/pokemon/${pokemonInstanceId}/moves`,
        {
          method: "PUT",
          headers: commandHeaders(owner, true),
          body: JSON.stringify({
            expectedRowVersion: "1",
            moveIds: [takeDownMoveId, chargeMoveId],
          }),
        },
        env as never,
      );

      expect(updated.status).toBe(200);
      await expect(updated.json()).resolves.toEqual({
        pokemonInstanceId,
        moveIds: [takeDownMoveId, chargeMoveId],
        rowVersion: "2",
      });
      await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
        await expect(loadOwnedPokemon(client, owner.playerId, pokemonInstanceId)).resolves.toMatchObject({
          speciesId: ampharosSpeciesId,
          level: 20,
          rowVersion: 2n,
          moveLoadout: {
            state: "selected",
            moveIds: [takeDownMoveId, chargeMoveId],
          },
        });
      });
      expect(fetchedPaths).toHaveLength(4);
      expect(fetchedPaths[0]).toMatch(/^version-[0-9a-f]{64}\/manifest\.json$/);
      expect(new Set(fetchedPaths.slice(1).map((path) => path.split("/").slice(-2).join("/")))).toEqual(
        new Set(["catalogs/species.json", "catalogs/moves.json", "catalogs/learnsets.json"]),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
