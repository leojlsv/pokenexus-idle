import { describe, expect, it } from "vitest";
import {
  POKEMON_MOVE_WORKBENCH_FORMAT,
  createWorkbenchExport,
  effectiveLearnLevel,
  learnsetKey,
  parseWorkbenchImport,
  stringifyWorkbenchExport,
  type AbilityRecord,
  type LearnsetRecord,
  type MoveRecord,
  type SpeciesRecord,
  type TypeRecord,
  type WorkbenchData,
} from "./model";

const source = ["source:test"];
const staging = {
  formatVersion: "pokenexus.task117.hoenn-workbench-staging.v1",
  artifactHash: "sha256:staging",
  firstAcquireRequestHash: "sha256:first",
  secondAcquireRequestHash: "sha256:second",
  sourceSnapshotIds: ["source-snapshot:test:one"],
};

const bulbasaur: SpeciesRecord = {
  id: "species:bulbasaur",
  sourceName: "Bulbasaur",
  sourceSlug: "bulbasaur",
  nationalDexNumber: 1,
  introducedGeneration: 1,
  formLabel: null,
  baseSpeciesId: null,
  typeIds: ["type:grass"],
  baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
  abilities: [{ abilityId: "ability:overgrow", sourceAbilitySlot: "normal-1" }],
  catchRate: 45,
  baseExperience: { status: "known", value: 64 },
  growthRate: "medium-slow",
  heightMillimeters: 700,
  weightGrams: 6900,
  eggGroups: ["monster", "grass"],
  genderRatio: { kind: "ratio", maleBasisPoints: 8750, femaleBasisPoints: 1250 },
  eggCycles: { status: "known", value: 20 },
  evYield: { hp: 0, atk: 0, def: 0, spa: 1, spd: 0, spe: 0 },
  baseFriendship: { status: "known", value: 50 },
  sourceRecordIds: source,
};

const ivysaur: SpeciesRecord = { ...bulbasaur, id: "species:ivysaur", sourceName: "Ivysaur", sourceSlug: "ivysaur", nationalDexNumber: 2 };
const grass: TypeRecord = { id: "type:grass", sourceName: "Grass", sourceSlug: "grass", sourceRecordIds: source };
const overgrow: AbilityRecord = { id: "ability:overgrow", sourceName: "Overgrow", sourceSlug: "overgrow", introducedGeneration: 3, sourceRecordIds: source };
const tackle: MoveRecord = { id: "move:tackle", typeId: "type:grass", category: "physical", power: 40, accuracy: 100, basePp: 35, sourceTarget: "any-adjacent", makesContact: true, zaBaseCooldownMs: 3000, sourceRecordIds: source };
const growl: MoveRecord = { ...tackle, id: "move:growl", category: "status", power: null };
const learnsets: LearnsetRecord[] = [
  { speciesId: bulbasaur.id, moveId: tackle.id, sourceGeneration: 9, sourceGame: "scarlet-violet", method: "level-up", level: 1, machineIdentifier: null, sourceRecordIds: source },
  { speciesId: bulbasaur.id, moveId: growl.id, sourceGeneration: 9, sourceGame: "scarlet-violet", method: "level-up", level: 5, machineIdentifier: null, sourceRecordIds: source },
  { speciesId: ivysaur.id, moveId: tackle.id, sourceGeneration: 9, sourceGame: "scarlet-violet", method: "machine", level: null, machineIdentifier: "TM001", sourceRecordIds: source },
];

const data: WorkbenchData = {
  base: { schemaVersion: "5", gameDataVersion: "data-v5", bundleHash: "sha256:bundle", provenanceHash: "sha256:provenance" },
  staging,
  species: [ivysaur, bulbasaur],
  moves: [growl, tackle],
  types: [grass],
  abilities: [overgrow],
  learnsets,
};

describe("Pokémon Move analysis model", () => {
  it("applies Learn Level overrides as analysis metadata without rewriting canonical rows", () => {
    const overrides = new Map([[learnsetKey(learnsets[1]), 12]]);
    expect(effectiveLearnLevel(learnsets[0], overrides)).toBe(1);
    expect(effectiveLearnLevel(learnsets[1], overrides)).toBe(12);
    expect(effectiveLearnLevel(learnsets[2], overrides)).toBeNull();
    expect(learnsets[1].level).toBe(5);
  });

  it("exports selected species with only referenced canonical rows and round-trips exactly", () => {
    const growlKey = learnsetKey(learnsets[1]);
    const exported = createWorkbenchExport(data, "selected", new Set([bulbasaur.id]), new Map([[growlKey, 12]]));
    expect(exported.formatVersion).toBe(POKEMON_MOVE_WORKBENCH_FORMAT);
    expect(exported.scope).toEqual({ kind: "selected", speciesIds: [bulbasaur.id] });
    expect(exported.reference.species.map(({ id }) => id)).toEqual([bulbasaur.id]);
    expect(exported.reference.moves.map(({ id }) => id)).toEqual([growl.id, tackle.id]);
    expect(exported.reference.learnsets).toHaveLength(2);
    expect(exported.analysis.learnLevelOverrides).toEqual([{ learnsetKey: growlKey, level: 12 }]);
    expect(exported.reference.learnsets.find(({ moveId }) => moveId === growl.id)?.level).toBe(5);

    const json = stringifyWorkbenchExport(exported);
    expect(parseWorkbenchImport(JSON.parse(json), data)).toEqual(exported);
    expect(json.endsWith("\n")).toBe(true);
  });

  it("produces deterministic all-export ordering", () => {
    const growlKey = learnsetKey(learnsets[1]);
    const first = stringifyWorkbenchExport(createWorkbenchExport(data, "all", new Set(), new Map([[growlKey, 20]])));
    const second = stringifyWorkbenchExport(createWorkbenchExport({ ...data, species: [...data.species].reverse(), moves: [...data.moves].reverse() }, "all", new Set(), new Map([[growlKey, 20]])));
    expect(second).toBe(first);
  });

  it("fails closed on stale bases, dangling references and invalid Learn Level overrides", () => {
    const exported = createWorkbenchExport(data, "all", new Set(), new Map());
    expect(() => parseWorkbenchImport(exported, { ...data, base: { ...data.base, bundleHash: "sha256:other" } })).toThrow(/base identity/);

    expect(() => parseWorkbenchImport(exported, {
      ...data,
      staging: { ...data.staging, artifactHash: "sha256:other-staging" },
    })).toThrow(/staging identity/);

    const dangling = structuredClone(exported);
    dangling.reference.moves = [];
    expect(() => parseWorkbenchImport(dangling, data)).toThrow(/unknown MoveId/);

    const invalidLevel = structuredClone(exported);
    invalidLevel.analysis.learnLevelOverrides = [{ learnsetKey: learnsetKey(learnsets[1]), level: 201 }];
    expect(() => parseWorkbenchImport(invalidLevel, data)).toThrow(/between 1 and 200/);
  });

  it("rejects Learn Level overrides for non-level-up or unknown entries", () => {
    const exported = createWorkbenchExport(data, "all", new Set(), new Map());
    const machineOverride = structuredClone(exported);
    machineOverride.analysis.learnLevelOverrides = [{ learnsetKey: learnsetKey(learnsets[2]), level: 7 }];
    expect(() => parseWorkbenchImport(machineOverride, data)).toThrow(/does not target a level-up entry/);

    const unknownOverride = structuredClone(exported);
    unknownOverride.analysis.learnLevelOverrides = [{ learnsetKey: "missing", level: 7 }];
    expect(() => parseWorkbenchImport(unknownOverride, data)).toThrow(/unknown Learnset/);
  });

  it("rejects learnset shapes that the canonical schema would reject", () => {
    const exported = createWorkbenchExport(data, "all", new Set(), new Map());
    const invalid = structuredClone(exported);
    invalid.reference.learnsets[0].level = null;
    expect(() => parseWorkbenchImport(invalid, data)).toThrow(/level.*between 1/);
  });

  it("rejects canonical reference tampering even when the base identity is unchanged", () => {
    const exported = createWorkbenchExport(data, "all", new Set(), new Map());
    const tampered = structuredClone(exported);
    tampered.reference.moves[0].power = 9_999;
    expect(() => parseWorkbenchImport(tampered, data)).toThrow(/immutable publication/);
  });

  it("requires the complete canonical learnset for every exported species", () => {
    const exported = createWorkbenchExport(data, "all", new Set(), new Map());
    const incomplete = structuredClone(exported);
    incomplete.reference.learnsets = [];
    incomplete.reference.moves = [];
    incomplete.reference.types = [grass];
    expect(() => parseWorkbenchImport(incomplete, data)).toThrow(/reference\.learnsets/);
  });

  it("does not alias exported canonical records back into the loaded baseline", () => {
    const exported = createWorkbenchExport(data, "all", new Set(), new Map());
    exported.reference.species[0].sourceName = "Tampered";
    expect(data.species.some(({ sourceName }) => sourceName === "Tampered")).toBe(false);
    expect(() => parseWorkbenchImport(exported, data)).toThrow(/immutable publication/);
  });
});
