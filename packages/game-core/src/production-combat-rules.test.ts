import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { initializeBattle, resolveCombatStimulus } from "./battle";
import rawProfile from "./production-move-support-v1.json";
import rawProfileV2 from "./production-move-support-v2.json";
import {
  assertProductionMoveLoadoutExecutable,
  PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH,
  PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V2,
  PRODUCTION_COMBAT_GAME_DATA_VERSION,
  PRODUCTION_COMBAT_GAME_DATA_VERSION_V2,
  PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH,
  PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH_V2,
  PRODUCTION_COMBAT_RULE_CATALOG_V1,
  PRODUCTION_COMBAT_RULE_CATALOG_V2,
  PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID_V2,
  PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH,
  PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2,
  PRODUCTION_MOVE_SELECTABILITY_RULE_ARTIFACT_ID,
  PRODUCTION_MOVE_SELECTABILITY_RULE_SEMANTICS_HASH,
  PRODUCTION_TARGET_DISPOSITIONS_V1,
  buildProductionMoveCoverageReport,
  canonicalSerializeProductionCombatRuleCatalog,
  hashCanonicalProductionCombatRuleCatalog,
  loadApprovedProductionCombatRuleCatalogV1,
  loadApprovedProductionCombatRuleCatalogV2,
  resolveProductionBattleAbility,
  resolveProductionAbilityRuleForBattle,
  validateProductionCombatRuleCatalogAgainstGameData,
  validateProductionCombatSupportProfile,
  validateProductionCombatSupportProfileV2,
  type ProductionCombatGameDataFacts,
} from "./production-combat-rules";

const PACKAGE_ROOT = process.cwd();
const V2_DIRECTORY = resolve(
  PACKAGE_ROOT,
  "../game-data/published/version-a583d33f46879d427da91e8a25ad1cedb4824df3f9adf584b2504506d0724e40",
);
const V3_DIRECTORY = resolve(
  PACKAGE_ROOT,
  "../game-data/published/version-e7903d8b32ee60805f55ef36c8fe735a517c858f700e92459c3b239a7560e1e2",
);

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function facts(directory: string): ProductionCombatGameDataFacts {
  const manifest = readJson<{ gameDataVersion: string; bundleHash: string }>(resolve(directory, "manifest.json"));
  return {
    gameDataVersion: manifest.gameDataVersion,
    gameDataBundleHash: manifest.bundleHash,
    species: readJson<ProductionCombatGameDataFacts["species"]>(resolve(directory, "catalogs/species.json")),
    moves: readJson<ProductionCombatGameDataFacts["moves"]>(resolve(directory, "catalogs/moves.json")),
    abilities: readJson<ProductionCombatGameDataFacts["abilities"]>(resolve(directory, "catalogs/abilities.json")),
    types: readJson<ProductionCombatGameDataFacts["types"]>(resolve(directory, "catalogs/types.json")),
    learnsets: readJson<ProductionCombatGameDataFacts["learnsets"]>(resolve(directory, "catalogs/learnsets.json")),
  };
}

function v2Facts(): ProductionCombatGameDataFacts {
  return facts(V2_DIRECTORY);
}

function v3Facts(): ProductionCombatGameDataFacts {
  return facts(V3_DIRECTORY);
}

function profileSemantics(value: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(value);
  delete clone.schemaVersion;
  delete clone.gameDataVersion;
  delete clone.gameDataBundleHash;
  return clone;
}

describe("SPEC-012 production combat rule catalog", () => {
  it("consumes the approved companion profile byte-for-byte with the frozen content hash", () => {
    const approvedBytes = readFileSync(resolve(PACKAGE_ROOT, "../../docs/specs/SPEC-012-production-move-support-v1.json"));
    const runtimeBytes = readFileSync(resolve(PACKAGE_ROOT, "src/production-move-support-v1.json"));
    expect(runtimeBytes.equals(approvedBytes)).toBe(true);
    expect(`sha256:${createHash("sha256").update(runtimeBytes).digest("hex")}`).toBe(
      PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH,
    );
  });

  it("freezes the v3-bound profile without changing SPEC-012 semantics", async () => {
    const runtimeBytes = readFileSync(resolve(PACKAGE_ROOT, "src/production-move-support-v2.json"));
    expect("sha256:" + createHash("sha256").update(runtimeBytes).digest("hex")).toBe(
      PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2,
    );
    expect(rawProfileV2).toMatchObject({
      schemaVersion: PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID_V2,
      gameDataVersion: PRODUCTION_COMBAT_GAME_DATA_VERSION_V2,
      gameDataBundleHash: PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V2,
    });
    expect(profileSemantics(rawProfileV2 as unknown as Record<string, unknown>)).toEqual(
      profileSemantics(rawProfile as unknown as Record<string, unknown>),
    );
    expect(() => validateProductionCombatSupportProfileV2(rawProfileV2)).not.toThrow();
    await expect(loadApprovedProductionCombatRuleCatalogV2(runtimeBytes)).resolves.toEqual(
      PRODUCTION_COMBAT_RULE_CATALOG_V2,
    );
  });

  it("materializes exactly the accepted 27 simple / 18 authored / 408 unsupported and 147 inactive profile", () => {
    const catalog = PRODUCTION_COMBAT_RULE_CATALOG_V1;
    expect(catalog.gameDataVersion).toBe(PRODUCTION_COMBAT_GAME_DATA_VERSION);
    expect(catalog.gameDataBundleHash).toBe(PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH);
    expect(catalog.moveSupport).toHaveLength(453);
    expect(catalog.abilitySupport).toHaveLength(147);
    expect(catalog.moveSupport.filter(({ support }) => support === "executable-simple")).toHaveLength(27);
    expect(catalog.moveSupport.filter(({ support }) => support === "executable-authored")).toHaveLength(18);
    expect(catalog.moveSupport.filter(({ support }) => support === "unsupported")).toHaveLength(408);
    expect(catalog.executableMoveIds).toHaveLength(45);
    expect(Object.keys(catalog.moveRules)).toHaveLength(45);
    expect(Object.keys(catalog.abilityRules)).toHaveLength(0);
    expect(Object.keys(catalog.effectRules)).toHaveLength(0);
    expect(catalog.abilitySupport.every(({ support }) => support === "inactive-by-policy")).toBe(true);
    expect(catalog.productionSelectabilityRuleArtifact).toEqual({
      artifactId: PRODUCTION_MOVE_SELECTABILITY_RULE_ARTIFACT_ID,
      baseEligibilityArtifactId: "pokenexus.move-eligibility.level-up-only.v1",
      semanticHash: PRODUCTION_MOVE_SELECTABILITY_RULE_SEMANTICS_HASH,
      candidatePolicy: "level-up-eligibility-intersect-executable-support",
    });
  });

  it("materializes the v3-bound release with identical executable semantics and distinct binding metadata", () => {
    const oldCatalog = PRODUCTION_COMBAT_RULE_CATALOG_V1;
    const catalog = PRODUCTION_COMBAT_RULE_CATALOG_V2;
    expect(catalog.gameDataVersion).toBe(PRODUCTION_COMBAT_GAME_DATA_VERSION_V2);
    expect(catalog.gameDataBundleHash).toBe(PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V2);
    expect(catalog.profileArtifactId).toBe(PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID_V2);
    expect(catalog.profileContentHash).toBe(PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2);
    expect(catalog.moveSupport).toEqual(oldCatalog.moveSupport);
    expect(catalog.abilitySupport).toEqual(oldCatalog.abilitySupport);
    expect(catalog.moveRules).toEqual(oldCatalog.moveRules);
    expect(catalog.abilityRules).toEqual(oldCatalog.abilityRules);
    expect(catalog.effectRules).toEqual(oldCatalog.effectRules);
    expect(catalog.executableMoveIds).toEqual(oldCatalog.executableMoveIds);
    expect(catalog.productionSelectabilityRuleArtifact).toEqual(
      oldCatalog.productionSelectabilityRuleArtifact,
    );
  });

  it("freezes the complete enemy-normalized target disposition vocabulary", () => {
    expect(Object.keys(PRODUCTION_TARGET_DISPOSITIONS_V1).sort()).toEqual([
      "adjacent-ally", "adjacent-foe", "all-adjacent", "all-adjacent-foes", "all-allies",
      "all-pokemon", "any-adjacent", "any-other", "entire-field", "opponents-side",
      "random-opponent", "self", "self-and-allies", "self-or-adjacent-ally", "users-side", "varies",
    ].sort());
    expect(PRODUCTION_TARGET_DISPOSITIONS_V1["any-adjacent"]).toEqual({
      disposition: "conditional",
      targetScope: "singleEnemy",
      condition: "offensive-individual-enemy-normalized",
    });
    expect(PRODUCTION_TARGET_DISPOSITIONS_V1["all-adjacent"]).toEqual({ disposition: "unsupported" });
  });

  it("fails closed on malformed support inventories instead of promoting or omitting records", () => {
    const duplicate = structuredClone(rawProfile) as unknown as { moves: unknown[] };
    duplicate.moves[duplicate.moves.length - 1] = structuredClone(duplicate.moves[0]);
    expect(() => validateProductionCombatSupportProfile(duplicate)).toThrow(/duplicate production Move support/);
  });

  it("rejects structurally valid semantic drift before it can claim the approved artifact identities", async () => {
    const approvedBytes = readFileSync(resolve(PACKAGE_ROOT, "src/production-move-support-v1.json"));
    await expect(loadApprovedProductionCombatRuleCatalogV1(approvedBytes)).resolves.toEqual(PRODUCTION_COMBAT_RULE_CATALOG_V1);

    const approvedText = approvedBytes.toString("utf8");
    const driftedText = approvedText.replace('"delta": 2', '"delta": 1');
    expect(driftedText).not.toBe(approvedText);
    const driftedProfile = JSON.parse(driftedText) as unknown;
    expect(() => validateProductionCombatSupportProfile(driftedProfile)).not.toThrow();
    await expect(loadApprovedProductionCombatRuleCatalogV1(new TextEncoder().encode(driftedText))).rejects.toThrow(/content hash mismatch/);
  });

  it("exposes deeply immutable runtime catalog content", () => {
    const catalog = PRODUCTION_COMBAT_RULE_CATALOG_V1;
    const executableMoveId = catalog.executableMoveIds[0];
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.moveSupport)).toBe(true);
    expect(Object.isFrozen(catalog.moveSupport[0])).toBe(true);
    expect(Object.isFrozen(catalog.moveRules)).toBe(true);
    expect(Object.isFrozen(catalog.moveRules[executableMoveId])).toBe(true);
    expect(Object.isFrozen(catalog.executableMoveIds)).toBe(true);
    expect(() => (catalog.executableMoveIds as string[]).push("move:drift")).toThrow(TypeError);
    expect(() => ((catalog.moveRules[executableMoveId] as { power?: number }).power = 999)).toThrow(TypeError);
  });

  it("cross-validates all support records and executable rules against the exact published v2 facts", () => {
    const facts = v2Facts();
    expect(() => validateProductionCombatRuleCatalogAgainstGameData(PRODUCTION_COMBAT_RULE_CATALOG_V1, facts)).not.toThrow();

    const wrongBundle = { ...facts, gameDataBundleHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" };
    expect(() => validateProductionCombatRuleCatalogAgainstGameData(PRODUCTION_COMBAT_RULE_CATALOG_V1, wrongBundle)).toThrow(/gameDataBundleHash/);

    const missingAbility = { ...facts, abilities: facts.abilities.slice(1) };
    expect(() => validateProductionCombatRuleCatalogAgainstGameData(PRODUCTION_COMBAT_RULE_CATALOG_V1, missingAbility)).toThrow(/Ability support universe|unresolved AbilityId/);

    const referencedTypeId = Object.values(PRODUCTION_COMBAT_RULE_CATALOG_V1.moveRules)[0].typeId;
    if (!referencedTypeId) throw new Error("test fixture must contain a referenced TypeId");
    const missingType = { ...facts, types: facts.types.filter(({ id }) => id !== referencedTypeId) };
    expect(() => validateProductionCombatRuleCatalogAgainstGameData(PRODUCTION_COMBAT_RULE_CATALOG_V1, missingType)).toThrow(/unresolved TypeId/);
  });

  it("validates only the retained-v2 and new-v3 exact catalog/data bindings", () => {
    const oldFacts = v2Facts();
    const newFacts = v3Facts();
    expect(() =>
      validateProductionCombatRuleCatalogAgainstGameData(PRODUCTION_COMBAT_RULE_CATALOG_V1, oldFacts)
    ).not.toThrow();
    expect(() =>
      validateProductionCombatRuleCatalogAgainstGameData(PRODUCTION_COMBAT_RULE_CATALOG_V2, newFacts)
    ).not.toThrow();
    expect(() =>
      validateProductionCombatRuleCatalogAgainstGameData(PRODUCTION_COMBAT_RULE_CATALOG_V1, newFacts)
    ).toThrow(/gameDataVersion mismatch/);
    expect(() =>
      validateProductionCombatRuleCatalogAgainstGameData(PRODUCTION_COMBAT_RULE_CATALOG_V2, oldFacts)
    ).toThrow(/gameDataVersion mismatch/);
    expect(() =>
      validateProductionCombatRuleCatalogAgainstGameData(PRODUCTION_COMBAT_RULE_CATALOG_V2, {
        ...newFacts,
        gameDataBundleHash: PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH,
      })
    ).toThrow(/gameDataBundleHash mismatch/);
  });

  it("omits inactive Abilities from battle composition without synthesizing a no-op rule", () => {
    const selectedAbilityId = PRODUCTION_COMBAT_RULE_CATALOG_V1.abilitySupport[0].abilityId;
    expect(resolveProductionBattleAbility(PRODUCTION_COMBAT_RULE_CATALOG_V1, selectedAbilityId)).toEqual({});
    expect(resolveProductionAbilityRuleForBattle(PRODUCTION_COMBAT_RULE_CATALOG_V1, selectedAbilityId)).toBeUndefined();
    expect(() => resolveProductionAbilityRuleForBattle(PRODUCTION_COMBAT_RULE_CATALOG_V1, "ability:unknown")).toThrow(/support universe/);
  });

  it("keeps persisted loadout compatibility separate from fresh production admission", () => {
    const executableMoveId = PRODUCTION_COMBAT_RULE_CATALOG_V1.executableMoveIds[0];
    const unsupportedMoveId = PRODUCTION_COMBAT_RULE_CATALOG_V1.moveSupport.find(({ support }) => support === "unsupported")?.moveId;
    if (!unsupportedMoveId) throw new Error("test fixture must contain an unsupported Move");
    expect(() => assertProductionMoveLoadoutExecutable(PRODUCTION_COMBAT_RULE_CATALOG_V1, [executableMoveId])).not.toThrow();
    expect(() => assertProductionMoveLoadoutExecutable(PRODUCTION_COMBAT_RULE_CATALOG_V1, [unsupportedMoveId])).toThrow(/not executable/);
  });

  it("replays a pinned production MoveRule deterministically", () => {
    const moveId = "candidate:move:dragon-pulse:54d897ab30";
    const rule = PRODUCTION_COMBAT_RULE_CATALOG_V1.moveRules[moveId];
    if (!rule?.typeId) throw new Error("production replay fixture requires Dragon Pulse");
    const input = {
      battleId: "battle:production-catalog-replay" as never,
      context: {
        gameDataVersion: PRODUCTION_COMBAT_RULE_CATALOG_V1.gameDataVersion as never,
        rulesVersion: PRODUCTION_COMBAT_RULE_CATALOG_V1.artifactId as never,
        combatEventSchemaVersion: "combat-events:production-replay-v1" as never,
        moveRules: { [moveId]: rule },
        abilityRules: PRODUCTION_COMBAT_RULE_CATALOG_V1.abilityRules,
        effectRules: PRODUCTION_COMBAT_RULE_CATALOG_V1.effectRules,
        typeChart: { [rule.typeId]: { "candidate:type:normal:317b32c143": 1 as const } },
      },
      sides: [
        { sideId: "side:a" as never, activeCapacity: 1, combatantIds: ["combatant:a" as never], initialActiveCombatantIds: ["combatant:a" as never] },
        { sideId: "side:b" as never, activeCapacity: 1, combatantIds: ["combatant:b" as never], initialActiveCombatantIds: ["combatant:b" as never] },
      ],
      combatants: [
        {
          combatantId: "combatant:a" as never,
          speciesId: "species:production-a" as never,
          level: 20,
          baseStats: { hp: 80, atk: 50, def: 50, spa: 80, spd: 50, spe: 50 },
          ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
          types: ["candidate:type:normal:317b32c143" as never],
          startingHp: 50,
          moveLoadout: [moveId as never],
          initialNextActionRemainingMs: 0,
          initialMoveCooldownRemainingMs: { [moveId]: 0 },
        },
        {
          combatantId: "combatant:b" as never,
          speciesId: "species:production-b" as never,
          level: 20,
          baseStats: { hp: 80, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 },
          ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
          types: ["candidate:type:normal:317b32c143" as never],
          startingHp: 50,
          moveLoadout: [moveId as never],
          initialNextActionRemainingMs: 10_000,
          initialMoveCooldownRemainingMs: { [moveId]: 0 },
        },
      ],
      deterministicState: { rng: { algorithm: "xorshift32-v1" as const, state: 123456789 } },
    };

    const run = () => {
      const initialized = initializeBattle(input);
      if (!initialized.accepted) throw new Error(initialized.reason);
      const resolved = resolveCombatStimulus(
        initialized.state,
        { kind: "useMove", actorId: "combatant:a" as never, moveId: moveId as never, targetId: "combatant:b" as never },
        initialized.deterministicState,
      );
      if (!resolved.accepted) throw new Error(resolved.reason);
      return resolved;
    };
    const first = run();
    const second = run();
    expect(second).toEqual(first);
    expect(createHash("sha256").update(JSON.stringify(first)).digest("hex")).toBe(
      "ca2276e65bbd7d26cb96f225bdf97bb27a76fcec8a858df86eeaeba3777e2f9c",
    );
  });

  it("emits deterministic all-293/all-level coverage evidence with explicit bottlenecks", () => {
    const facts = v2Facts();
    const first = buildProductionMoveCoverageReport({
      catalog: PRODUCTION_COMBAT_RULE_CATALOG_V1,
      gameDataVersion: facts.gameDataVersion,
      species: facts.species,
      learnsets: facts.learnsets,
    });
    const second = buildProductionMoveCoverageReport({
      catalog: PRODUCTION_COMBAT_RULE_CATALOG_V1,
      gameDataVersion: facts.gameDataVersion,
      species: [...facts.species].reverse(),
      learnsets: [...facts.learnsets].reverse(),
    });
    expect(first).toEqual(second);
    expect(first.speciesCount).toBe(293);
    expect(new Set(first.rows.map(({ speciesId }) => speciesId)).size).toBe(293);
    expect(first.rows.some(({ bottleneck }) => bottleneck === "zero-executable")).toBe(true);
    expect(first.rows.some(({ bottleneck }) => bottleneck === "one-executable")).toBe(true);
    expect(first.rows.every((row) => row.progressCapableExecutableCount <= row.executableCount)).toBe(true);
    expect(first.rows.every((row) => row.simpleExecutableCount + row.authoredExecutableCount === row.executableCount)).toBe(true);

    const bySpecies = new Map<string, typeof first.rows>();
    for (const row of first.rows) {
      const existing = bySpecies.get(row.speciesId) ?? [];
      bySpecies.set(row.speciesId, [...existing, row]);
    }
    expect([...bySpecies.values()].filter((rows) => rows.some(({ executableCount }) => executableCount > 0))).toHaveLength(277);
    expect(first.rows.filter(({ level, executableCount }) => level === 1 && executableCount > 0)).toHaveLength(254);
    expect([...bySpecies.values()].filter((rows) => rows.some(({ progressCapableExecutableCount }) => progressCapableExecutableCount > 0))).toHaveLength(234);
    expect(first.rows.filter(({ level, progressCapableExecutableCount }) => level === 1 && progressCapableExecutableCount > 0)).toHaveLength(203);
    expect(() => buildProductionMoveCoverageReport({
      catalog: PRODUCTION_COMBAT_RULE_CATALOG_V1,
      gameDataVersion: "game-data:wrong",
      species: facts.species,
      learnsets: facts.learnsets,
    })).toThrow(/gameDataVersion mismatch/);
  });

  it("rebinds all-293 coverage to v3 without semantic drift and preserves Verdant Edge playability", () => {
    const oldFacts = v2Facts();
    const newFacts = v3Facts();
    const oldCoverage = buildProductionMoveCoverageReport({
      catalog: PRODUCTION_COMBAT_RULE_CATALOG_V1,
      gameDataVersion: oldFacts.gameDataVersion,
      species: oldFacts.species,
      learnsets: oldFacts.learnsets,
    });
    const newCoverage = buildProductionMoveCoverageReport({
      catalog: PRODUCTION_COMBAT_RULE_CATALOG_V2,
      gameDataVersion: newFacts.gameDataVersion,
      species: newFacts.species,
      learnsets: newFacts.learnsets,
    });
    expect(newCoverage.speciesCount).toBe(293);
    expect(newCoverage.rows).toEqual(oldCoverage.rows);
    expect(newCoverage.profileArtifactId).toBe(PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID_V2);
    expect(newCoverage.profileContentHash).toBe(PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2);
    expect(newCoverage.gameDataVersion).toBe(PRODUCTION_COMBAT_GAME_DATA_VERSION_V2);

    const progressAt = (speciesId: string, level: number) => {
      const row = newCoverage.rows
        .filter((candidate) => candidate.speciesId === speciesId && candidate.level <= level)
        .sort((left, right) => right.level - left.level)[0];
      if (!row) throw new Error("Missing production coverage row for " + speciesId + " at level " + level);
      return row.progressCapableExecutableCount;
    };
    for (const level of [3, 4, 5]) {
      expect(progressAt("candidate:species:pokedex-rattata-19:9975b0175c", level)).toBe(1);
      expect(progressAt("candidate:species:pokedex-spearow-21:0ddd44d801", level)).toBe(1);
      expect(progressAt("candidate:species:pokedex-hoothoot-163:3ecad094b2", level)).toBe(2);
    }
  });

  it("canonically serializes and hashes the materialized catalog deterministically", async () => {
    const serialized = canonicalSerializeProductionCombatRuleCatalog(PRODUCTION_COMBAT_RULE_CATALOG_V1);
    expect(serialized).toBe(canonicalSerializeProductionCombatRuleCatalog(PRODUCTION_COMBAT_RULE_CATALOG_V1));
    const hash = await hashCanonicalProductionCombatRuleCatalog(PRODUCTION_COMBAT_RULE_CATALOG_V1);
    expect(hash).toBe(PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH);
    expect(hash).toBe(await hashCanonicalProductionCombatRuleCatalog(PRODUCTION_COMBAT_RULE_CATALOG_V1));
    const v2Hash = await hashCanonicalProductionCombatRuleCatalog(PRODUCTION_COMBAT_RULE_CATALOG_V2);
    expect(v2Hash).toBe(PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH_V2);
    expect(v2Hash).not.toBe(hash);
    expect(v2Hash).toBe(await hashCanonicalProductionCombatRuleCatalog(PRODUCTION_COMBAT_RULE_CATALOG_V2));
  });
});
