import { describe, expect, it } from "vitest";
import {
  PG_SIGNED_BIGINT_MAX,
  createPlayerCursorCodec,
  isCanonicalUuid,
  parsePageLimit,
  parsePgSignedBigintDecimal,
} from "./protocol";

const pokemonId = "0199472a-0000-7000-8000-000000000101";
const teamId = "0199472a-0000-7000-8000-000000000102";
const secret = "player-state-cursor-test-secret-material-32-bytes";

describe("player protocol parsing", () => {
  it("accepts only canonical UUID text and bounded canonical decimals", () => {
    expect(isCanonicalUuid(pokemonId)).toBe(true);
    expect(isCanonicalUuid(pokemonId.toUpperCase())).toBe(false);
    expect(isCanonicalUuid(pokemonId.replaceAll("-", ""))).toBe(false);

    expect(parsePgSignedBigintDecimal("0")).toBe(0n);
    expect(parsePgSignedBigintDecimal(PG_SIGNED_BIGINT_MAX.toString())).toBe(PG_SIGNED_BIGINT_MAX);
    for (const invalid of ["", "00", "+1", "-1", "1.0", (PG_SIGNED_BIGINT_MAX + 1n).toString()]) {
      expect(parsePgSignedBigintDecimal(invalid)).toBeNull();
    }
  });

  it("uses the accepted default/max page bounds", () => {
    expect(parsePageLimit(undefined)).toBe(50);
    expect(parsePageLimit("1")).toBe(1);
    expect(parsePageLimit("100")).toBe(100);
    for (const invalid of ["", "0", "01", "101", "1.5", "-1"]) {
      expect(parsePageLimit(invalid)).toBeNull();
    }
  });
});

describe("authenticated player cursors", () => {
  it("round-trips kind-bound Collection and Team selectors without embedding owner authority", async () => {
    const codec = createPlayerCursorCodec(secret);
    const collection = await codec.encodeCollection({ afterPokemonInstanceId: pokemonId });
    const teams = await codec.encodeTeams({ afterTeamId: teamId });

    await expect(codec.decodeCollection(collection)).resolves.toEqual({ afterPokemonInstanceId: pokemonId });
    await expect(codec.decodeTeams(teams)).resolves.toEqual({ afterTeamId: teamId });
    await expect(codec.decodeTeams(collection)).resolves.toBeNull();
    expect(Buffer.from(collection.split(".")[0] ?? "", "base64url").toString("utf8")).not.toContain("owner");
  });

  it("rejects forged, malformed and differently signed cursor tokens", async () => {
    const codec = createPlayerCursorCodec(secret);
    const other = createPlayerCursorCodec("different-player-cursor-test-secret-32-bytes");
    const token = await codec.encodeCollection({ afterPokemonInstanceId: pokemonId });
    const parts = token.split(".");
    const signature = parts[1] ?? "";
    const forged = `${parts[0]}.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;

    await expect(codec.decodeCollection(forged)).resolves.toBeNull();
    await expect(other.decodeCollection(token)).resolves.toBeNull();
    await expect(codec.decodeCollection("not-a-cursor")).resolves.toBeNull();
  });

  it("binds Inventory continuation to the exact root version and opaque ItemId", async () => {
    const codec = createPlayerCursorCodec(secret);
    const itemId = "item:\u0000é\ud800";
    const token = await codec.encodeInventory({ rowVersion: 9n, afterItemId: itemId });
    await expect(codec.decodeInventory(token)).resolves.toEqual({ rowVersion: 9n, afterItemId: itemId });
  });
});
