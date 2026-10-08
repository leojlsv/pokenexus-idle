import { describe, expect, it } from "vitest";
import {
  AUTO_CAPTURE_LOSS_WARNING_V1,
  HuntProtocolError,
  hashNormalizedIntent,
  parseAutoCapturePolicyReplaceBody,
  parseAutoPotionPolicyReplaceBody,
  parseAutoRevivePolicyReplaceBody,
  parseEmptyMutationBodyText,
  parseHuntItemUseBody,
  parseManualCaptureBody,
  parsePokeCenterHealBody,
  parseStartHuntBody,
  validateAutoCapturePolicyRelationships,
} from "./protocol";

const teamId = "018f47c1-9a45-7abc-8def-0123456789ab";
const pokemonId = "018f47c1-9a45-7abc-8def-0123456789ac";

describe("SPEC-015 Hunt protocol parsing", () => {
  it("accepts exact start shape and rejects non-canonical body UUIDs", () => {
    expect(parseStartHuntBody(JSON.stringify({ huntDefinitionId: "hunt:kanto:forest", teamId })))
      .toEqual({ huntDefinitionId: "hunt:kanto:forest", teamId });
    expect(() => parseStartHuntBody(JSON.stringify({
      huntDefinitionId: "hunt:kanto:forest",
      teamId: teamId.toUpperCase(),
    }))).toThrowError(HuntProtocolError);
  });

  it("accepts only the explicit owned-team PokéCenter selector shape", () => {
    expect(parsePokeCenterHealBody(JSON.stringify({ teamId }))).toEqual({ teamId });
    expect(() => parsePokeCenterHealBody(JSON.stringify({
      teamId: teamId.toUpperCase(),
    }))).toThrowError(HuntProtocolError);
    expect(() => parsePokeCenterHealBody(JSON.stringify({
      teamId,
      currentHp: 999,
    }))).toThrowError(HuntProtocolError);
  });

  it("accepts zero-length or exact empty body and rejects fields", () => {
    expect(parseEmptyMutationBodyText("")).toEqual({});
    expect(parseEmptyMutationBodyText("{}")).toEqual({});
    expect(() => parseEmptyMutationBodyText('{"extra":true}')).toThrowError(HuntProtocolError);
  });

  it("implements the closed manual-capture discriminated union", () => {
    expect(parseManualCaptureBody(JSON.stringify({
      decision: "attempt",
      encounterId: "encounter:one",
      selectedItemId: "item:ball",
    }))).toEqual({
      decision: "attempt",
      encounterId: "encounter:one",
      selectedItemId: "item:ball",
    });
    expect(parseManualCaptureBody(JSON.stringify({
      decision: "skip",
      encounterId: "encounter:one",
    }))).toEqual({ decision: "skip", encounterId: "encounter:one" });
    expect(() => parseManualCaptureBody(JSON.stringify({
      decision: "skip",
      encounterId: "encounter:one",
      selectedItemId: "item:ball",
    }))).toThrowError(HuntProtocolError);
  });

  it("requires canonical UUID for explicit heal target", () => {
    expect(parseHuntItemUseBody(JSON.stringify({
      itemId: "item:potion",
      targetPokemonInstanceId: pokemonId,
    }))).toEqual({ itemId: "item:potion", targetPokemonInstanceId: pokemonId });
    expect(() => parseHuntItemUseBody(JSON.stringify({
      itemId: "item:potion",
      targetPokemonInstanceId: pokemonId.toUpperCase(),
    }))).toThrowError(HuntProtocolError);
  });

  it("rejects unknown nested policy fields before semantic validation", () => {
    expect(() => parseAutoCapturePolicyReplaceBody(JSON.stringify({
      expectedRowVersion: "0",
      enabled: false,
      balls: [],
      rules: [{ when: { geneticGrade: "Apex" }, selectedItemId: "item:ball" }],
    }))).toThrowError(HuntProtocolError);
  });

  it("separates structural policy parsing from 422 semantic relationships", () => {
    const parsed = parseAutoCapturePolicyReplaceBody(JSON.stringify({
      expectedRowVersion: "0",
      enabled: true,
      lossWarningAcknowledgement: AUTO_CAPTURE_LOSS_WARNING_V1,
      balls: [{ itemId: "item:poke-ball", autoUseEnabled: false, minimumReserve: "10" }],
      rules: [{ when: {}, selectedItemId: "item:poke-ball" }],
    }));
    expect(validateAutoCapturePolicyRelationships(parsed))
      .toMatch(/enabled Ball|enabled policy/u);
  });

  it("enforces visible condition bounds and duplicate-free lists", () => {
    expect(() => parseAutoCapturePolicyReplaceBody(JSON.stringify({
      expectedRowVersion: "0",
      enabled: false,
      balls: [{ itemId: "item:poke-ball", autoUseEnabled: true, minimumReserve: "0" }],
      rules: [{
        when: { speciesIds: ["species:a", "species:a"] },
        selectedItemId: "item:poke-ball",
      }],
    }))).toThrowError(HuntProtocolError);

    const parsed = parseAutoCapturePolicyReplaceBody(JSON.stringify({
      expectedRowVersion: "0",
      enabled: false,
      balls: [{ itemId: "item:poke-ball", autoUseEnabled: true, minimumReserve: "0" }],
      rules: [{
        when: { catchRateMin: 50, catchRateMax: 20 },
        selectedItemId: "item:poke-ball",
      }],
    }));
    expect(validateAutoCapturePolicyRelationships(parsed)).toMatch(/catchRateMin/u);
  });

  it("parses exact Auto-Potion policy bodies and rejects unsupported thresholds or duplicate items", () => {
    expect(parseAutoPotionPolicyReplaceBody(JSON.stringify({
      expectedRowVersion: "0",
      enabled: true,
      thresholdPercent: 50,
      orderedItems: [
        { itemId: "item:potion", autoUseEnabled: true, minimumReserve: "2" },
      ],
    }))).toEqual({
      expectedRowVersion: "0",
      enabled: true,
      thresholdPercent: 50,
      orderedItems: [
        { itemId: "item:potion", autoUseEnabled: true, minimumReserve: "2" },
      ],
    });
    expect(() => parseAutoPotionPolicyReplaceBody(JSON.stringify({
      expectedRowVersion: "0",
      enabled: true,
      thresholdPercent: 55,
      orderedItems: [],
    }))).toThrowError(HuntProtocolError);
    expect(() => parseAutoPotionPolicyReplaceBody(JSON.stringify({
      expectedRowVersion: "0",
      enabled: false,
      thresholdPercent: 50,
      orderedItems: [
        { itemId: "item:potion", autoUseEnabled: true, minimumReserve: "0" },
        { itemId: "item:potion", autoUseEnabled: false, minimumReserve: "1" },
      ],
    }))).toThrowError(HuntProtocolError);
  });

  it("requires an integer threshold on explicit disabled Potion saves, not the no-saved null sentinel", () => {
    for (const thresholdPercent of [90, 80, 70, 60, 50, 40, 30, 20, 10]) {
      for (const orderedItems of [[], [{ itemId: "pokenexus:item:basic-potion:v1", autoUseEnabled: true, minimumReserve: "18" }]]) {
        const input = { expectedRowVersion: "0", enabled: false, thresholdPercent, orderedItems };
        expect(parseAutoPotionPolicyReplaceBody(JSON.stringify(input))).toEqual(input);
        expect(() => parseAutoPotionPolicyReplaceBody(JSON.stringify({ ...input, thresholdPercent: null })))
          .toThrow("thresholdPercent must be an integer");
      }
    }
  });

  it("parses exact Auto-Revive policy bodies and rejects structural drift", () => {
    expect(parseAutoRevivePolicyReplaceBody(JSON.stringify({
      expectedRowVersion: "3",
      enabled: false,
      orderedItems: [
        { itemId: "item:revive", autoUseEnabled: true, minimumReserve: "1" },
      ],
    }))).toEqual({
      expectedRowVersion: "3",
      enabled: false,
      orderedItems: [
        { itemId: "item:revive", autoUseEnabled: true, minimumReserve: "1" },
      ],
    });
    expect(() => parseAutoRevivePolicyReplaceBody(JSON.stringify({
      expectedRowVersion: "3",
      enabled: false,
      orderedItems: [],
      cooldownSeconds: 5,
    }))).toThrowError(HuntProtocolError);
  });

  it("produces stable intent hashes for normalized objects", async () => {
    const intent = parseStartHuntBody(JSON.stringify({ huntDefinitionId: "hunt:a", teamId }));
    await expect(hashNormalizedIntent(intent)).resolves.toEqual(await hashNormalizedIntent({ ...intent }));
  });
});
