import { describe, expect, it } from "vitest";
import {
  decodeOpaqueStringDbV1,
  encodeOpaqueStringDbV1,
} from "./opaque-string-db-codec";

describe("OpaqueStringDbCodec v1", () => {
  const roundTripCorpus = [
    "",
    "SpeciesId:pikachu",
    "Pokémon-日本語",
    "nul\u0000inside",
    "\ud800",
    "\udc00",
    "A\ud800B\udc00C\ud800\udc00D",
  ];

  it.each(roundTripCorpus)("round-trips exact UTF-16 code units for %j", (value) => {
    expect(decodeOpaqueStringDbV1(encodeOpaqueStringDbV1(value))).toBe(value);
  });

  it("encodes UTF-16 code units as big-endian bytes", () => {
    expect([...encodeOpaqueStringDbV1("A\u00e9\ud800")]).toEqual([
      0x00, 0x41, 0x00, 0xe9, 0xd8, 0x00,
    ]);
  });

  it("rejects malformed odd-length persisted bytes", () => {
    expect(() => decodeOpaqueStringDbV1(Uint8Array.of(0x00))).toThrow(/even number of bytes/);
  });
});
