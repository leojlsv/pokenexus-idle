import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RuntimeGameDataReader } from "@pokenexus/game-data/runtime";
import type { SoloHuntRuntimeInputs } from "@pokenexus/game-core";
import { describe, expect, it } from "vitest";
import { HuntAuthorityUnavailableError } from "./application";
import {
  createCaptureBallAuthorityReleaseResolver,
  createEncounterIndividualizationAuthorityResolver,
  createGeneticProfilePairReleaseResolver,
  createHistoricalEncounterAuthorityLoader,
  createHuntItemRuleReleaseResolver,
  createPublishedHuntGameDataLoader,
  assertPublishedHuntPveManifest,
  deriveEncounterIndividualizationAuthorityKeyId,
  HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V3,
  HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V4,
  normalizeHealingItemMagnitude,
  parsePersistedHuntRuntimeEnvelope,
  parseCaptureBallAuthorityReleases,
  parseEncounterIndividualizationAuthorityReleases,
  parseGeneticProfilePairReleases,
  parseHuntItemRuleReleases,
  serializeHuntRuntimeInputsForPersistence,
} from "./runtime";
import {
  NO_SAVED_AUTO_POTION_POLICY,
  NO_SAVED_AUTO_REVIVE_POLICY,
} from "@pokenexus/game-core";

const V2 = "game-data-core-kanto-johto-v2";
const V3 = "game-data-core-kanto-johto-v3";
const PUBLISHED_ROOT = resolve(process.cwd(), "../../packages/game-data/published");

function fileReader(root: string): RuntimeGameDataReader {
  return {
    async read(path) {
      return new Uint8Array(await readFile(resolve(root, ...path.split("/"))));
    },
  };
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

describe("Hunt runtime release authorities", () => {
  it("accepts PVE content authority on retained schema 4 and forward schema 5 only", () => {
    expect(() => assertPublishedHuntPveManifest({
      schemaVersion: "4",
      pveContentSchemaVersion: "1",
    })).not.toThrow();
    expect(() => assertPublishedHuntPveManifest({
      schemaVersion: "5",
      pveContentSchemaVersion: "1",
    })).not.toThrow();
    expect(() => assertPublishedHuntPveManifest({ schemaVersion: "3" }))
      .toThrow(/does not contain PVE content authority/);
    expect(() => assertPublishedHuntPveManifest({
      schemaVersion: "6",
      pveContentSchemaVersion: "1",
    })).toThrow(/does not contain PVE content authority/);
  });

  it("TASK-108 versions persisted Start HP authority without reinterpreting historical v1 envelopes", () => {
    const historicalInputs = {
      playerId: "player:test",
      zoneId: "zone:test",
      huntDefinitionId: "hunt:test",
      contentVersion: "content:test",
      contentHash: "sha256:content-test",
      context: { gameDataVersion: "game-data:test", rulesVersion: "rules:test" },
      team: [{ pokemonInstanceId: "pokemon:test" }],
      encounterOptions: [],
      opponentTemplates: [],
      interBattleGapMs: 0,
    } as unknown as SoloHuntRuntimeInputs;
    const recordFor = (runtimeInputsJson: Record<string, unknown>) => ({
      huntId: "hunt-instance:test",
      playerId: "player:test",
      gameDataVersion: "game-data:test",
      rulesVersion: "rules:test",
      runtimeInputsJson,
      individualizationAuthorityVersion: null,
      individualizationAuthorityKeyId: null,
    });

    const historical = serializeHuntRuntimeInputsForPersistence(historicalInputs);
    expect(historical.schemaVersion).toBe("hunt-runtime-inputs-v1");
    expect(parsePersistedHuntRuntimeEnvelope(recordFor(
      historical as unknown as Record<string, unknown>,
    )).inputs.initialHpByPokemonInstanceId).toBeUndefined();

    const forwardInputs: SoloHuntRuntimeInputs = {
      ...historicalInputs,
      initialHpByPokemonInstanceId: { "pokemon:test": 17 },
    };
    const forward = serializeHuntRuntimeInputsForPersistence(forwardInputs);
    expect(forward.schemaVersion).toBe("hunt-runtime-inputs-v2");
    expect(parsePersistedHuntRuntimeEnvelope(recordFor(
      forward as unknown as Record<string, unknown>,
    )).inputs.initialHpByPokemonInstanceId).toEqual({ "pokemon:test": 17 });

    expect(() => parsePersistedHuntRuntimeEnvelope(recordFor({
      ...historical as unknown as Record<string, unknown>,
      inputs: {
        ...historical.inputs,
        initialHpByPokemonInstanceId: { "pokemon:test": 17 },
      },
    }))).toThrow(HuntAuthorityUnavailableError);

    expect(() => parsePersistedHuntRuntimeEnvelope(recordFor({
      ...forward as unknown as Record<string, unknown>,
      inputs: historical.inputs,
    }))).toThrow(HuntAuthorityUnavailableError);
  });

  it("TASK-110 persists three-family Start policy authority only in runtime-inputs v3", () => {
    const inputs = {
      playerId: "player:test",
      zoneId: "zone:test",
      huntDefinitionId: "hunt:test",
      contentVersion: "content:test",
      contentHash: "sha256:content-test",
      context: { gameDataVersion: "game-data:test", rulesVersion: "rules:test" },
      team: [{ pokemonInstanceId: "pokemon:test" }],
      encounterOptions: [],
      opponentTemplates: [],
      interBattleGapMs: 0,
      initialHpByPokemonInstanceId: { "pokemon:test": 17 },
    } as unknown as SoloHuntRuntimeInputs;
    const policies = {
      capture: { policyVersion: "policy:capture", rowVersion: "3", enabled: true },
      potion: NO_SAVED_AUTO_POTION_POLICY,
      revive: NO_SAVED_AUTO_REVIVE_POLICY,
    } as const;
    const persisted = serializeHuntRuntimeInputsForPersistence({ ...inputs, automationPolicies: policies });
    expect(persisted.schemaVersion).toBe(HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V3);
    expect(persisted.inputs.automationPolicies).toEqual(policies);

    const recordFor = (runtimeInputsJson: Record<string, unknown>) => ({
      huntId: "hunt-instance:test",
      playerId: "player:test",
      gameDataVersion: "game-data:test",
      rulesVersion: "rules:test",
      runtimeInputsJson,
      individualizationAuthorityVersion: null,
      individualizationAuthorityKeyId: null,
    });
    expect(parsePersistedHuntRuntimeEnvelope(recordFor(
      persisted as unknown as Record<string, unknown>,
    )).inputs.automationPolicies).toEqual(policies);

    expect(() => parsePersistedHuntRuntimeEnvelope(recordFor({
      ...persisted as unknown as Record<string, unknown>,
      inputs: {
        ...persisted.inputs,
        automationPolicies: undefined,
      },
    }))).toThrow(HuntAuthorityUnavailableError);
  });

  it("TASK-103 uses additive runtime-inputs v4 only when automation and original Shiny authority are both pinned", () => {
    const policies = {
      capture: { policyVersion: null, rowVersion: "0", enabled: false },
      potion: NO_SAVED_AUTO_POTION_POLICY,
      revive: NO_SAVED_AUTO_REVIVE_POLICY,
    } as const;
    const teamMember = {
      pokemonInstanceId: "pokemon:test",
      speciesId: "species:test",
      shiny: false,
      level: 5,
      baseStats: {},
      ivs: {},
      types: [],
      moveLoadout: [],
    };
    const base = {
      playerId: "player:test",
      zoneId: "zone:test",
      huntDefinitionId: "hunt:test",
      contentVersion: "content:test",
      contentHash: "sha256:content-test",
      context: { gameDataVersion: "game-data:test", rulesVersion: "rules:test" },
      team: [teamMember],
      encounterOptions: [],
      opponentTemplates: [],
      interBattleGapMs: 0,
      initialHpByPokemonInstanceId: { "pokemon:test": 17 },
      automationPolicies: policies,
    } as unknown as SoloHuntRuntimeInputs;
    const recordFor = (runtimeInputsJson: Record<string, unknown>) => ({
      huntId: "hunt-instance:test",
      playerId: "player:test",
      gameDataVersion: "game-data:test",
      rulesVersion: "rules:test",
      runtimeInputsJson,
      individualizationAuthorityVersion: null,
      individualizationAuthorityKeyId: null,
    });

    const persisted = serializeHuntRuntimeInputsForPersistence(base);
    expect(persisted.schemaVersion).toBe(HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V4);
    expect(parsePersistedHuntRuntimeEnvelope(recordFor(
      persisted as unknown as Record<string, unknown>,
    )).inputs.team).toEqual([teamMember]);

    const withoutShiny: SoloHuntRuntimeInputs = {
      ...base,
      team: base.team.map(({ shiny: _shiny, ...member }) => member),
    };
    expect(serializeHuntRuntimeInputsForPersistence(withoutShiny).schemaVersion)
      .toBe(HUNT_RUNTIME_INPUTS_SCHEMA_VERSION_V3);

    expect(() => parsePersistedHuntRuntimeEnvelope(recordFor({
      ...persisted as unknown as Record<string, unknown>,
      inputs: {
        ...persisted.inputs,
        team: [{ ...teamMember, shiny: undefined }],
      },
    }))).toThrow(HuntAuthorityUnavailableError);
  });

  it("resolves current and retained Ball releases with exact premium metadata", async () => {
    const releases = parseCaptureBallAuthorityReleases(JSON.stringify([
      {
        ballAuthorityVersion: "balls-v1",
        newOperationsAllowed: false,
        balls: [
          { itemId: "item:poke-ball", powerQuarterUnits: 4, premium: false },
        ],
      },
      {
        ballAuthorityVersion: "balls-v2",
        newOperationsAllowed: true,
        balls: [
          { itemId: "item:ultra-ball", powerQuarterUnits: 8, premium: false },
          { itemId: "item:vip-ball", powerQuarterUnits: 9, premium: true },
        ],
      },
    ]));
    const resolver = createCaptureBallAuthorityReleaseResolver({
      releases,
      currentVersion: "balls-v2",
    });

    await expect(resolver.current()).resolves.toMatchObject({
      version: "balls-v2",
      newOperationsAllowed: true,
      balls: [
        { itemId: "item:ultra-ball", powerQuarterUnits: 8, premium: false },
        { itemId: "item:vip-ball", powerQuarterUnits: 9, premium: true },
      ],
    });
    await expect(resolver.resolve("balls-v1")).resolves.toMatchObject({
      version: "balls-v1",
      newOperationsAllowed: false,
    });
    await expect(resolver.resolve("missing")).resolves.toBeNull();
  });

  it("fails closed for malformed Ball releases or a deprecated current selector", async () => {
    expect(() => parseCaptureBallAuthorityReleases(JSON.stringify([
      {
        ballAuthorityVersion: "balls-v1",
        newOperationsAllowed: true,
        balls: [
          { itemId: "item:bad-ball", powerQuarterUnits: 7, premium: false },
        ],
      },
    ]))).toThrow(HuntAuthorityUnavailableError);

    const releases = parseCaptureBallAuthorityReleases(JSON.stringify([
      {
        ballAuthorityVersion: "balls-v1",
        newOperationsAllowed: false,
        balls: [{ itemId: "item:poke-ball", powerQuarterUnits: 4, premium: false }],
      },
    ]));
    const resolver = createCaptureBallAuthorityReleaseResolver({
      releases,
      currentVersion: "balls-v1",
    });
    await expect(resolver.current()).rejects.toBeInstanceOf(HuntAuthorityUnavailableError);
  });

  it("parses exact ItemRule releases for none, capture-attempt and HP healing", async () => {
    const releases = parseHuntItemRuleReleases(JSON.stringify([
      {
        itemRuleVersion: "items-v1",
        gameDataVersion: V3,
        rulesVersion: "combat-rules-genetics-v1",
        items: [
          { itemId: "item:key", rule: { useKind: "none" } },
          { itemId: "item:poke-ball", rule: { useKind: "capture-attempt" } },
          {
            itemId: "item:potion",
            rule: { useKind: "heal-hp", magnitude: { kind: "fixed", amount: 20 } },
          },
          {
            itemId: "item:max-potion",
            rule: {
              useKind: "heal-hp",
              magnitude: { kind: "max-hp-fraction", numerator: 1, denominator: 2 },
            },
          },
          {
            itemId: "item:revive",
            rule: {
              useKind: "revive-hp",
              magnitude: { kind: "max-hp-fraction", numerator: 1, denominator: 4 },
            },
          },
        ],
      },
    ]));
    const resolver = createHuntItemRuleReleaseResolver(releases);
    const release = await resolver.require({
      gameDataVersion: V3,
      rulesVersion: "combat-rules-genetics-v1",
    });

    expect(release.itemRuleVersion).toBe("items-v1");
    expect(release.rulesByItemId.get("item:key")).toEqual({ useKind: "none" });
    expect(release.rulesByItemId.get("item:poke-ball")).toEqual({ useKind: "capture-attempt" });
    const potion = release.rulesByItemId.get("item:potion");
    expect(potion).toEqual({ useKind: "heal-hp", magnitude: { kind: "fixed", amount: 20 } });
    if (!potion || potion.useKind !== "heal-hp") throw new Error("expected Potion heal rule");
    expect(normalizeHealingItemMagnitude(potion)).toEqual({ kind: "integer", amount: 20 });
    const maxPotion = release.rulesByItemId.get("item:max-potion");
    if (!maxPotion || maxPotion.useKind !== "heal-hp") throw new Error("expected max Potion heal rule");
    expect(normalizeHealingItemMagnitude(maxPotion)).toEqual({
      kind: "maxHpFraction",
      numerator: 1,
      denominator: 2,
    });
    expect(release.rulesByItemId.get("item:revive")).toEqual({
      useKind: "revive-hp",
      magnitude: { kind: "max-hp-fraction", numerator: 1, denominator: 4 },
    });
    await expect(resolver.require({ gameDataVersion: V2, rulesVersion: "combat-rules-genetics-v1" }))
      .rejects.toBeInstanceOf(HuntAuthorityUnavailableError);
  });

  it("rejects invalid healing magnitudes instead of inventing item behavior", () => {
    expect(() => parseHuntItemRuleReleases(JSON.stringify([
      {
        itemRuleVersion: "items-v1",
        gameDataVersion: V3,
        rulesVersion: "combat-rules-genetics-v1",
        items: [
          {
            itemId: "item:potion",
            rule: {
              useKind: "heal-hp",
              magnitude: { kind: "max-hp-fraction", numerator: 1, denominator: 0 },
            },
          },
        ],
      },
    ]))).toThrow(HuntAuthorityUnavailableError);
  });

  it("accepts only the 25/50/100 revive tiers", () => {
    expect(() => parseHuntItemRuleReleases(JSON.stringify([
      {
        itemRuleVersion: "items-v1",
        gameDataVersion: V3,
        rulesVersion: "combat-rules-genetics-v1",
        items: [{
          itemId: "item:revive",
          rule: {
            useKind: "revive-hp",
            magnitude: { kind: "max-hp-fraction", numerator: 3, denominator: 4 },
          },
        }],
      },
    ]))).toThrow(HuntAuthorityUnavailableError);
  });

  it("resolves exactly two distinct Genetic Profiles by SpeciesId and exact static pair", async () => {
    const releases = parseGeneticProfilePairReleases(JSON.stringify([
      {
        gameDataVersion: V3,
        rulesVersion: "combat-rules-genetics-v1",
        species: [
          { speciesId: "species:a", compatibleProfiles: ["Harmony", "Endurance"] },
          { speciesId: "species:b", compatibleProfiles: ["Might", "Clarity"] },
        ],
      },
    ]));
    const resolver = createGeneticProfilePairReleaseResolver(releases);
    const release = await resolver.require({
      gameDataVersion: V3,
      rulesVersion: "combat-rules-genetics-v1",
    });
    expect(release.profilesBySpeciesId.get("species:a")).toEqual(["Harmony", "Endurance"]);
    expect(release.profilesBySpeciesId.get("species:b")).toEqual(["Might", "Clarity"]);
    await expect(resolver.resolve({ gameDataVersion: V2, rulesVersion: "combat-rules-genetics-v1" }))
      .resolves.toBeNull();

    expect(() => parseGeneticProfilePairReleases(JSON.stringify([
      {
        gameDataVersion: V3,
        rulesVersion: "combat-rules-genetics-v1",
        species: [{ speciesId: "species:a", compatibleProfiles: ["Harmony", "Harmony"] }],
      },
    ]))).toThrow(HuntAuthorityUnavailableError);
  });

  it("validates current and historical individualization secrets against their derived keyId", async () => {
    const firstSecret = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const secondSecret = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);
    const firstKeyId = await deriveEncounterIndividualizationAuthorityKeyId(firstSecret);
    const secondKeyId = await deriveEncounterIndividualizationAuthorityKeyId(secondSecret);
    const releases = parseEncounterIndividualizationAuthorityReleases(JSON.stringify([
      {
        rulesVersion: "encounter-individualization-v1",
        authorityVersion: "authority-v1",
        keyId: firstKeyId,
        secretKeyBase64url: base64url(firstSecret),
        newOperationsAllowed: false,
      },
      {
        rulesVersion: "encounter-individualization-v1",
        authorityVersion: "authority-v2",
        keyId: secondKeyId,
        secretKeyBase64url: base64url(secondSecret),
        newOperationsAllowed: true,
      },
    ]));
    const resolver = createEncounterIndividualizationAuthorityResolver({
      releases,
      currentAuthorityVersion: "authority-v2",
    });

    await expect(resolver.current()).resolves.toMatchObject({
      rulesVersion: "encounter-individualization-v1",
      authorityVersion: "authority-v2",
      keyId: secondKeyId,
    });
    await expect(resolver.resolve({
      rulesVersion: "encounter-individualization-v1",
      authorityVersion: "authority-v1",
      keyId: firstKeyId,
    })).resolves.toMatchObject({ authorityVersion: "authority-v1", keyId: firstKeyId });
    await expect(resolver.resolve({
      rulesVersion: "encounter-individualization-v1",
      authorityVersion: "authority-v1",
      keyId: secondKeyId,
    })).resolves.toBeNull();
  });

  it("fails closed when configured individualization keyId does not match secret material", async () => {
    const secret = Uint8Array.from({ length: 32 }, (_, index) => index + 11);
    const releases = parseEncounterIndividualizationAuthorityReleases(JSON.stringify([
      {
        rulesVersion: "encounter-individualization-v1",
        authorityVersion: "authority-v1",
        keyId: `key-v1:${"0".repeat(64)}`,
        secretKeyBase64url: base64url(secret),
        newOperationsAllowed: true,
      },
    ]));
    const resolver = createEncounterIndividualizationAuthorityResolver({
      releases,
      currentAuthorityVersion: "authority-v1",
    });
    await expect(resolver.current()).rejects.toBeInstanceOf(HuntAuthorityUnavailableError);
  });
});

describe("published Hunt game-data authority", () => {
  it("loads the exact v4 PVE release and all Hunt runtime shards", async () => {
    const loader = createPublishedHuntGameDataLoader(fileReader(PUBLISHED_ROOT));
    const release = await loader.load(V3);

    expect(release.gameDataVersion).toBe(V3);
    expect(release.contentVersion).toBe("1");
    expect(release.contentHash).toBe(
      "sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559",
    );
    expect(release.zones).toHaveLength(1);
    expect(release.hunts).toHaveLength(1);
    expect(release.encounters).toHaveLength(9);
    expect(release.species.length).toBeGreaterThan(250);
    expect(release.typeEffectiveness).toHaveLength(324);
    expect(release.huntsById.get("hunt:verdant-edge:wilds")?.zoneId).toBe("zone:verdant-edge");
  });

  it("does not substitute a non-PVE historical game-data release", async () => {
    const loader = createPublishedHuntGameDataLoader(fileReader(PUBLISHED_ROOT));
    await expect(loader.load(V2)).rejects.toBeInstanceOf(HuntAuthorityUnavailableError);
  });

  it("resolves historical Encounter reward and catch rate only from matching frozen content", async () => {
    const loader = createPublishedHuntGameDataLoader(fileReader(PUBLISHED_ROOT));
    const release = await loader.load(V3);
    const loadHistorical = createHistoricalEncounterAuthorityLoader(loader);
    const encounter = release.encounters[0]!;
    const species = release.speciesById.get(encounter.speciesId)!;

    await expect(loadHistorical({
      encounterDefinitionId: encounter.id as never,
      speciesId: encounter.speciesId as never,
      gameDataVersion: V3 as never,
      contentVersion: release.contentVersion,
      contentHash: release.contentHash,
    })).resolves.toEqual({
      encounterDefinitionId: encounter.id,
      speciesId: encounter.speciesId,
      gameDataVersion: V3,
      contentVersion: release.contentVersion,
      contentHash: release.contentHash,
      catchRate: species.catchRate,
      reward: encounter.reward,
    });

    await expect(loadHistorical({
      encounterDefinitionId: encounter.id as never,
      speciesId: encounter.speciesId as never,
      gameDataVersion: V3 as never,
      contentVersion: release.contentVersion,
      contentHash: `sha256:${"0".repeat(64)}`,
    })).rejects.toBeInstanceOf(HuntAuthorityUnavailableError);
  });
});
