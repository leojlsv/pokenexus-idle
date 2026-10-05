import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createPresentationCursorCodec,
  HUNT_PRESENTATION_CURSOR_MAX_BYTES,
  HUNT_PRESENTATION_CURSOR_TTL_MS,
  type PresentationCursorContents,
} from "./presentation-cursor";

const playerId = "0199472a-0000-7000-8000-000000000003";
const huntId = "0199472a-0000-7000-8000-000000000101";
const anotherPlayerId = "0199472a-0000-7000-8000-000000000004";
const anotherHuntId = "0199472a-0000-7000-8000-000000000102";
const firstKey = new Uint8Array(32).fill(39);
const secondKey = new Uint8Array(32).fill(91);
const now = 1_800_000_000_000;
const scope = { playerId, huntId };

function beforeFirstContents(): PresentationCursorContents {
  return {
    ...scope,
    purpose: "resume",
    limit: 64,
    snapshot: {
      publicationGeneration: "0",
      publishedEventIndex: "0",
      publicPrefixDigest: Buffer.alloc(32).toString("base64url"),
      committedLogicalTimeMs: "0",
      isTerminal: false,
      presentationSchemaVersion: "pokenexus.combat-presentation.v1",
      gameDataVersion: "game-data:locked",
      rulesVersion: "combat-rules:locked",
      sourceCombatEventSchemaVersion: "combat-source:locked",
    },
    position: { kind: "before_first" },
  };
}

function afterEventContents(): PresentationCursorContents {
  return {
    ...beforeFirstContents(),
    purpose: "next",
    limit: 128,
    snapshot: {
      ...beforeFirstContents().snapshot,
      publicationGeneration: "4",
      publishedEventIndex: "1001",
      publicPrefixDigest: Buffer.alloc(32, 0x82).toString("base64url"),
      committedLogicalTimeMs: "120000",
    },
    position: {
      kind: "event",
      eventIndex: "999",
      encounterOrdinal: 13,
      encounterId: "encounter:source",
      battleId: "battle:source",
      lastSequence: 40,
      lastCombatTimeMs: 15000,
    },
  };
}

function forgePayload(token: string, mutate: (payload: Record<string, unknown>) => void): string {
  const data = Buffer.from(token, "base64url");
  const payload = JSON.parse(data.subarray(0, -32).toString("utf8")) as Record<string, unknown>;
  mutate(payload);
  const bytes = Buffer.from(JSON.stringify(payload), "utf8");
  const signature = createHmac("sha256", firstKey)
    .update("pokenexus.hunt-presentation.cursor.v1\0")
    .update(bytes)
    .digest();
  return Buffer.concat([bytes, signature]).toString("base64url");
}

describe("SPEC-017 private 15-minute HMAC-bound presentation cursor codec", () => {
  const codec = createPresentationCursorCodec("first", { first: firstKey, second: secondKey });

  it("uses one bounded canonical unpadded base64url token and binds all frozen source pins", async () => {
    for (const contents of [beforeFirstContents(), afterEventContents()]) {
      const token = await codec.issue(contents, now);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
      expect(token.length).toBeLessThanOrEqual(HUNT_PRESENTATION_CURSOR_MAX_BYTES);
      expect(await codec.verify(token, scope, now + 1)).toEqual({ status: "valid", cursor: contents });
      expect(JSON.stringify((await codec.verify(token, scope, now + 1))))
        .not.toContain("secret");
    }
  });

  it("rejects foreign Player or Hunt binding after authentication, including identical token bytes", async () => {
    const token = await codec.issue(afterEventContents(), now);
    expect(await codec.verify(token, { playerId: anotherPlayerId, huntId }, now))
      .toEqual({ status: "invalid" });
    expect(await codec.verify(token, { playerId, huntId: anotherHuntId }, now))
      .toEqual({ status: "invalid" });
  });

  it("expires at the exact 15-minute boundary only after a verified signature", async () => {
    const token = await codec.issue(afterEventContents(), now);
    expect((await codec.verify(token, scope, now + HUNT_PRESENTATION_CURSOR_TTL_MS - 1)).status)
      .toBe("valid");
    expect(await codec.verify(token, scope, now + HUNT_PRESENTATION_CURSOR_TTL_MS))
      .toEqual({ status: "expired" });
    expect(await codec.verify(token, scope, now - 1))
      .toEqual({ status: "invalid" });
  });

  it("honors retired-but-retained key rotation without silently accepting unknown keys", async () => {
    const former = createPresentationCursorCodec("first", { first: firstKey });
    const rotated = createPresentationCursorCodec("second", { first: firstKey, second: secondKey });
    const retired = createPresentationCursorCodec("second", { second: secondKey });
    const token = await former.issue(beforeFirstContents(), now);
    expect((await rotated.verify(token, scope, now)).status).toBe("valid");
    expect((await retired.verify(token, scope, now)).status).toBe("invalid");
    const afterRotation = await rotated.issue(afterEventContents(), now);
    expect((await former.verify(afterRotation, scope, now)).status).toBe("invalid");
    expect((await retired.verify(afterRotation, scope, now)).status).toBe("valid");
  });

  it("rejects syntax, noncanonical encoding, overlong bytes and a modified signature", async () => {
    const token = await codec.issue(beforeFirstContents(), now);
    const data = Buffer.from(token, "base64url");
    const modified = new Uint8Array(data);
    modified[modified.length - 1] ^= 0x7f;
    for (const invalid of [
      "", "a.b", "a=", "a+", "é", "!invalid!",
      "a".repeat(HUNT_PRESENTATION_CURSOR_MAX_BYTES + 1),
      Buffer.from(modified).toString("base64url"),
    ]) {
      expect(await codec.verify(invalid, scope, now)).toEqual({ status: "invalid" });
    }
  });

  it("does not accept an otherwise validly signed token with unknown fields or invalid shape", async () => {
    const token = await codec.issue(afterEventContents(), now);
    const badPayloads = [
      (entry: Record<string, unknown>) => { entry.extra = 123; },
      (entry: Record<string, unknown>) => { entry.limit = 129; },
      (entry: Record<string, unknown>) => { entry.purpose = "arbitrary"; },
      (entry: Record<string, unknown>) => { entry.version = 2; },
      (entry: Record<string, unknown>) => { entry.keyId = "unknown-key"; },
      (entry: Record<string, unknown>) => { entry.expiresAtMs = now + 24 * 60 * 60 * 1000; },
      (entry: Record<string, unknown>) => {
        (entry.position as Record<string, unknown>).eventIndex = "1002";
      },
      (entry: Record<string, unknown>) => {
        (entry.snapshot as Record<string, unknown>).gameDataVersion = "";
      },
      (entry: Record<string, unknown>) => {
        (entry.snapshot as Record<string, unknown>).publicPrefixDigest = "uncanonical";
      },
      (entry: Record<string, unknown>) => {
        (entry.position as Record<string, unknown>).extra = "hidden";
      },
    ];
    for (const change of badPayloads) {
      expect(await codec.verify(forgePayload(token, change), scope, now))
        .toEqual({ status: "invalid" });
    }
  });

  it("validates cursor issuance before signing any input", async () => {
    const invalid: PresentationCursorContents[] = [
      { ...beforeFirstContents(), limit: 0 },
      { ...afterEventContents(), position: { ...afterEventContents().position, kind: "event",
        eventIndex: "1002", encounterOrdinal: 1, encounterId: "e",
        battleId: "b", lastSequence: 1, lastCombatTimeMs: 0 } },
      { ...beforeFirstContents(), playerId: "foreign" },
    ];
    for (const entry of invalid) {
      await expect(codec.issue(entry, now)).rejects.toThrow(/invalid/u);
    }
    expect(() => createPresentationCursorCodec("wrong", { first: firstKey }))
      .toThrow(/keyring/u);
    expect(() => createPresentationCursorCodec("short", { short: new Uint8Array(8) }))
      .toThrow(/key/u);
  });
});
