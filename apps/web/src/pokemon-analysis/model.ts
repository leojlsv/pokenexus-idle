export const POKEMON_MOVE_WORKBENCH_FORMAT = "pokenexus.pokemon-move-workbench.v3" as const;
export const MAX_LEARN_LEVEL = 200;

export interface SpeciesRecord {
  id: string;
  sourceName: string;
  sourceSlug: string;
  nationalDexNumber: number;
  introducedGeneration: number;
  formLabel: string | null;
  baseSpeciesId: string | null;
  typeIds: string[];
  baseStats: Record<string, number>;
  abilities: Array<{ abilityId: string; sourceAbilitySlot: string }>;
  catchRate: number;
  baseExperience: unknown;
  growthRate: string;
  heightMillimeters: number;
  weightGrams: number;
  eggGroups: string[];
  genderRatio: unknown;
  eggCycles: unknown;
  evYield: Record<string, number>;
  baseFriendship: unknown;
  sourceRecordIds: string[];
  [key: string]: unknown;
}

export interface MoveRecord {
  id: string;
  typeId: string;
  category: string;
  power: number | null;
  accuracy: number | null;
  basePp: number;
  sourceTarget: string;
  makesContact: boolean;
  zaBaseCooldownMs: number | null;
  sourceRecordIds: string[];
  [key: string]: unknown;
}

export interface TypeRecord {
  id: string;
  sourceName: string;
  sourceSlug: string;
  sourceRecordIds: string[];
  [key: string]: unknown;
}

export interface AbilityRecord {
  id: string;
  sourceName: string;
  sourceSlug: string;
  introducedGeneration: number | null;
  sourceRecordIds: string[];
  [key: string]: unknown;
}

export interface LearnsetRecord {
  speciesId: string;
  moveId: string;
  sourceGeneration: number;
  sourceGame: string;
  method: string;
  level: number | null;
  machineIdentifier: string | null;
  sourceRecordIds: string[];
  [key: string]: unknown;
}

export interface PublicationIdentity {
  schemaVersion: string;
  gameDataVersion: string;
  bundleHash: string;
  provenanceHash: string;
}

export interface StagingIdentity {
  formatVersion: string;
  artifactHash: string;
  firstAcquireRequestHash: string;
  secondAcquireRequestHash: string;
  sourceSnapshotIds: string[];
}

export interface WorkbenchData {
  base: PublicationIdentity;
  staging: StagingIdentity;
  species: SpeciesRecord[];
  moves: MoveRecord[];
  types: TypeRecord[];
  abilities: AbilityRecord[];
  learnsets: LearnsetRecord[];
}

export interface WorkbenchExportV3 {
  formatVersion: typeof POKEMON_MOVE_WORKBENCH_FORMAT;
  base: PublicationIdentity;
  staging: StagingIdentity;
  scope: {
    kind: "all" | "selected";
    speciesIds: string[];
  };
  reference: {
    species: SpeciesRecord[];
    moves: MoveRecord[];
    types: TypeRecord[];
    abilities: AbilityRecord[];
    learnsets: LearnsetRecord[];
  };
  analysis: {
    learnLevelOverrides: Array<{ learnsetKey: string; level: number }>;
  };
}

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function requireInteger(value: unknown, label: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail(`${label} must be an integer between ${min} and ${max}`);
  }
  return value as number;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

export function assertLearnLevel(level: number): number {
  return requireInteger(level, "learn level", 1, MAX_LEARN_LEVEL);
}

export function learnsetKey(entry: LearnsetRecord): string {
  return [
    entry.speciesId,
    entry.moveId,
    String(entry.sourceGeneration),
    entry.sourceGame,
    entry.method,
    String(entry.level ?? ""),
    entry.machineIdentifier ?? "",
  ].join("\u0000");
}

export function effectiveLearnLevel(
  entry: LearnsetRecord,
  learnLevelOverrides: ReadonlyMap<string, number>,
): number | null {
  if (entry.method !== "level-up") return null;
  if (entry.level === null) fail(`level-up entry ${learnsetKey(entry)} is missing level`);
  const override = learnLevelOverrides.get(learnsetKey(entry));
  return override === undefined ? entry.level : assertLearnLevel(override);
}

export function isBaseSpecies(species: SpeciesRecord): boolean {
  return species.baseSpeciesId === null;
}

export function canonicalSlug(id: string, kind: "move" | "type" | "ability"): string {
  const marker = `:${kind}:`;
  const markerIndex = id.indexOf(marker);
  if (markerIndex < 0) return id;
  const tail = id.slice(markerIndex + marker.length);
  const hashIndex = tail.lastIndexOf(":");
  return hashIndex > 0 ? tail.slice(0, hashIndex) : tail;
}

export function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function semanticJson(value: unknown): string {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (!isRecord(entry)) return entry;
    return Object.fromEntries(
      Object.keys(entry)
        .sort(compareText)
        .map((key) => [key, normalize(entry[key])]),
    );
  };
  return JSON.stringify(normalize(value));
}

function assertCanonicalSubset<T>(
  imported: readonly T[],
  baseline: readonly T[],
  importedKey: (record: T) => string,
  baselineKey = importedKey,
  label: string,
): void {
  const baselineByKey = new Map(baseline.map((record) => [baselineKey(record), record]));
  for (const record of imported) {
    const key = importedKey(record);
    const expected = baselineByKey.get(key);
    if (!expected) fail(`${label} ${key} is not present in the loaded publication`);
    if (semanticJson(record) !== semanticJson(expected)) {
      fail(`${label} ${key} differs from the loaded immutable publication`);
    }
  }
}

function assertExactIdSet(actual: ReadonlySet<string>, expected: ReadonlySet<string>, label: string): void {
  if (actual.size !== expected.size || [...actual].some((id) => !expected.has(id))) {
    fail(`${label} does not exactly match referenced canonical records`);
  }
}

export function sortSpecies(records: readonly SpeciesRecord[]): SpeciesRecord[] {
  return [...records].sort((left, right) =>
    left.nationalDexNumber - right.nationalDexNumber
    || Number(left.baseSpeciesId !== null) - Number(right.baseSpeciesId !== null)
    || compareText(left.sourceName, right.sourceName)
    || compareText(left.id, right.id));
}

export function sortLearnsets(records: readonly LearnsetRecord[]): LearnsetRecord[] {
  const methodOrder = new Map([
    ["level-up", 0],
    ["evolution", 1],
    ["machine", 2],
    ["egg", 3],
    ["tutor", 4],
    ["reminder", 5],
    ["transfer", 6],
  ]);
  return [...records].sort((left, right) =>
    compareText(left.speciesId, right.speciesId)
    || (methodOrder.get(left.method) ?? 99) - (methodOrder.get(right.method) ?? 99)
    || (left.level ?? Number.MAX_SAFE_INTEGER) - (right.level ?? Number.MAX_SAFE_INTEGER)
    || compareText(left.moveId, right.moveId)
    || left.sourceGeneration - right.sourceGeneration
    || compareText(left.sourceGame, right.sourceGame)
    || compareText(left.machineIdentifier ?? "", right.machineIdentifier ?? ""));
}

export function createWorkbenchExport(
  data: WorkbenchData,
  kind: "all" | "selected",
  selectedSpeciesIds: ReadonlySet<string>,
  learnLevelOverrides: ReadonlyMap<string, number>,
): WorkbenchExportV3 {
  const allSpecies = sortSpecies(data.species);
  const includedSpecies = kind === "all"
    ? allSpecies
    : allSpecies.filter(({ id }) => selectedSpeciesIds.has(id));
  if (kind === "selected" && includedSpecies.length === 0) fail("selected export requires at least one species");

  const speciesIds = new Set(includedSpecies.map(({ id }) => id));
  const learnsets = sortLearnsets(data.learnsets.filter(({ speciesId }) => speciesIds.has(speciesId)));
  const moveIds = new Set(learnsets.map(({ moveId }) => moveId));
  const typeIds = new Set(includedSpecies.flatMap(({ typeIds }) => typeIds));
  const abilityIds = new Set(includedSpecies.flatMap(({ abilities }) => abilities.map(({ abilityId }) => abilityId)));
  for (const move of data.moves) if (moveIds.has(move.id)) typeIds.add(move.typeId);

  const moves = [...data.moves].filter(({ id }) => moveIds.has(id)).sort((a, b) => compareText(a.id, b.id));
  const types = [...data.types].filter(({ id }) => typeIds.has(id)).sort((a, b) => compareText(a.id, b.id));
  const abilities = [...data.abilities].filter(({ id }) => abilityIds.has(id)).sort((a, b) => compareText(a.id, b.id));
  const includedLearnsetByKey = new Map(learnsets.map((entry) => [learnsetKey(entry), entry]));
  const overrides = [...learnLevelOverrides.entries()]
    .filter(([key]) => includedLearnsetByKey.has(key))
    .map(([key, level]) => {
      const entry = includedLearnsetByKey.get(key)!;
      if (entry.method !== "level-up" || entry.level === null) {
        fail(`learn level override ${key} does not target a level-up entry`);
      }
      return { learnsetKey: key, level: assertLearnLevel(level) };
    })
    .filter(({ learnsetKey: key, level }) => includedLearnsetByKey.get(key)!.level !== level)
    .sort((left, right) => compareText(left.learnsetKey, right.learnsetKey));

  return {
    formatVersion: POKEMON_MOVE_WORKBENCH_FORMAT,
    base: { ...data.base },
    staging: structuredClone(data.staging),
    scope: { kind, speciesIds: includedSpecies.map(({ id }) => id) },
    reference: {
      species: structuredClone(includedSpecies),
      moves: structuredClone(moves),
      types: structuredClone(types),
      abilities: structuredClone(abilities),
      learnsets: structuredClone(learnsets),
    },
    analysis: { learnLevelOverrides: overrides },
  };
}

function sameBase(left: PublicationIdentity, right: PublicationIdentity): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.gameDataVersion === right.gameDataVersion
    && left.bundleHash === right.bundleHash
    && left.provenanceHash === right.provenanceHash;
}

function sameStaging(left: StagingIdentity, right: StagingIdentity): boolean {
  return semanticJson(left) === semanticJson(right);
}

export function parseWorkbenchImport(value: unknown, expectedData: WorkbenchData): WorkbenchExportV3 {
  if (!isRecord(value)) fail("workbench import must be an object");
  if (value.formatVersion !== POKEMON_MOVE_WORKBENCH_FORMAT) fail("unsupported workbench formatVersion");
  if (!isRecord(value.base)) fail("base must be an object");
  const base: PublicationIdentity = {
    schemaVersion: requireString(value.base.schemaVersion, "base.schemaVersion"),
    gameDataVersion: requireString(value.base.gameDataVersion, "base.gameDataVersion"),
    bundleHash: requireString(value.base.bundleHash, "base.bundleHash"),
    provenanceHash: requireString(value.base.provenanceHash, "base.provenanceHash"),
  };
  if (!sameBase(base, expectedData.base)) fail("workbench import base identity does not match the loaded publication");

  if (!isRecord(value.staging)) fail("staging must be an object");
  const staging: StagingIdentity = {
    formatVersion: requireString(value.staging.formatVersion, "staging.formatVersion"),
    artifactHash: requireString(value.staging.artifactHash, "staging.artifactHash"),
    firstAcquireRequestHash: requireString(value.staging.firstAcquireRequestHash, "staging.firstAcquireRequestHash"),
    secondAcquireRequestHash: requireString(value.staging.secondAcquireRequestHash, "staging.secondAcquireRequestHash"),
    sourceSnapshotIds: requireArray(value.staging.sourceSnapshotIds, "staging.sourceSnapshotIds").map((entry, index) =>
      requireString(entry, `staging.sourceSnapshotIds[${index}]`)),
  };
  if (!sameStaging(staging, expectedData.staging)) {
    fail("workbench import staging identity does not match the loaded Hoenn staging artifact");
  }

  if (!isRecord(value.scope)) fail("scope must be an object");
  const kind = value.scope.kind;
  if (kind !== "all" && kind !== "selected") fail("scope.kind must be all or selected");
  const scopeSpeciesIds = requireArray(value.scope.speciesIds, "scope.speciesIds").map((entry, index) =>
    requireString(entry, `scope.speciesIds[${index}]`));
  if (new Set(scopeSpeciesIds).size !== scopeSpeciesIds.length) fail("scope.speciesIds contains duplicates");
  if (kind === "selected" && scopeSpeciesIds.length === 0) fail("selected import requires at least one species");

  if (!isRecord(value.reference)) fail("reference must be an object");
  const species = requireArray(value.reference.species, "reference.species") as SpeciesRecord[];
  const moves = requireArray(value.reference.moves, "reference.moves") as MoveRecord[];
  const types = requireArray(value.reference.types, "reference.types") as TypeRecord[];
  const abilities = requireArray(value.reference.abilities, "reference.abilities") as AbilityRecord[];
  const learnsets = requireArray(value.reference.learnsets, "reference.learnsets") as LearnsetRecord[];

  const speciesIds = new Set<string>();
  for (const [index, record] of species.entries()) {
    if (!isRecord(record)) fail(`reference.species[${index}] must be an object`);
    const id = requireString(record.id, `reference.species[${index}].id`);
    if (speciesIds.has(id)) fail(`duplicate SpeciesId ${id}`);
    speciesIds.add(id);
  }
  if (scopeSpeciesIds.length !== speciesIds.size || scopeSpeciesIds.some((id) => !speciesIds.has(id))) {
    fail("scope.speciesIds must exactly match reference.species");
  }

  assertCanonicalSubset(species, expectedData.species, ({ id }) => id, ({ id }) => id, "Species");

  const moveIds = new Set<string>();
  for (const [index, record] of moves.entries()) {
    if (!isRecord(record)) fail(`reference.moves[${index}] must be an object`);
    const id = requireString(record.id, `reference.moves[${index}].id`);
    if (moveIds.has(id)) fail(`duplicate MoveId ${id}`);
    moveIds.add(id);
  }
  assertCanonicalSubset(moves, expectedData.moves, ({ id }) => id, ({ id }) => id, "Move");

  const typeIds = new Set<string>();
  for (const [index, record] of types.entries()) {
    if (!isRecord(record)) fail(`reference.types[${index}] must be an object`);
    const id = requireString(record.id, `reference.types[${index}].id`);
    if (typeIds.has(id)) fail(`duplicate TypeId ${id}`);
    typeIds.add(id);
  }
  assertCanonicalSubset(types, expectedData.types, ({ id }) => id, ({ id }) => id, "Type");

  const abilityIds = new Set<string>();
  for (const [index, record] of abilities.entries()) {
    if (!isRecord(record)) fail(`reference.abilities[${index}] must be an object`);
    const id = requireString(record.id, `reference.abilities[${index}].id`);
    if (abilityIds.has(id)) fail(`duplicate AbilityId ${id}`);
    abilityIds.add(id);
  }
  assertCanonicalSubset(abilities, expectedData.abilities, ({ id }) => id, ({ id }) => id, "Ability");

  const learnsetKeys = new Set<string>();
  for (const [index, record] of learnsets.entries()) {
    if (!isRecord(record)) fail(`reference.learnsets[${index}] must be an object`);
    const speciesId = requireString(record.speciesId, `reference.learnsets[${index}].speciesId`);
    const moveId = requireString(record.moveId, `reference.learnsets[${index}].moveId`);
    if (!speciesIds.has(speciesId)) fail(`learnset references unknown SpeciesId ${speciesId}`);
    if (!moveIds.has(moveId)) fail(`learnset references unknown MoveId ${moveId}`);
    requireInteger(record.sourceGeneration, `reference.learnsets[${index}].sourceGeneration`, 1);
    requireString(record.sourceGame, `reference.learnsets[${index}].sourceGame`);
    const method = requireString(record.method, `reference.learnsets[${index}].method`);
    if (method === "level-up") {
      requireInteger(record.level, `reference.learnsets[${index}].level`, 1);
    } else if (record.level !== null) {
      fail(`reference.learnsets[${index}].level must be null for ${method}`);
    }
    if (method === "machine" && (typeof record.machineIdentifier !== "string" || record.machineIdentifier.length === 0)) {
      fail(`reference.learnsets[${index}].machineIdentifier is required for machine`);
    }
    if (method !== "machine" && record.machineIdentifier !== null) {
      fail(`reference.learnsets[${index}].machineIdentifier must be null for ${method}`);
    }
    const key = learnsetKey(record);
    if (learnsetKeys.has(key)) fail(`duplicate learnset entry ${key}`);
    learnsetKeys.add(key);
  }
  assertCanonicalSubset(learnsets, expectedData.learnsets, learnsetKey, learnsetKey, "Learnset");
  const expectedLearnsetKeys = new Set(
    expectedData.learnsets
      .filter(({ speciesId }) => speciesIds.has(speciesId))
      .map(learnsetKey),
  );
  assertExactIdSet(learnsetKeys, expectedLearnsetKeys, "reference.learnsets");

  const referencedMoveIds = new Set(learnsets.map(({ moveId }) => moveId));
  assertExactIdSet(moveIds, referencedMoveIds, "reference.moves");
  const referencedTypeIds = new Set<string>();
  const referencedAbilityIds = new Set<string>();
  for (const record of species) {
    for (const typeId of record.typeIds) referencedTypeIds.add(typeId);
    for (const assignment of record.abilities) referencedAbilityIds.add(assignment.abilityId);
  }
  for (const move of moves) referencedTypeIds.add(move.typeId);
  assertExactIdSet(typeIds, referencedTypeIds, "reference.types");
  assertExactIdSet(abilityIds, referencedAbilityIds, "reference.abilities");

  if (kind === "all") {
    const baselineSpeciesIds = new Set(expectedData.species.map(({ id }) => id));
    assertExactIdSet(speciesIds, baselineSpeciesIds, "all-export Species scope");
  }

  if (!isRecord(value.analysis)) fail("analysis must be an object");
  const overridesRaw = requireArray(value.analysis.learnLevelOverrides, "analysis.learnLevelOverrides");
  const overrides: Array<{ learnsetKey: string; level: number }> = [];
  const overrideKeys = new Set<string>();
  const importedLearnsetByKey = new Map(learnsets.map((entry) => [learnsetKey(entry), entry]));
  for (const [index, entry] of overridesRaw.entries()) {
    if (!isRecord(entry)) fail(`analysis.learnLevelOverrides[${index}] must be an object`);
    const key = requireString(entry.learnsetKey, `analysis.learnLevelOverrides[${index}].learnsetKey`);
    if (overrideKeys.has(key)) fail(`duplicate learn level override for ${key}`);
    const learnset = importedLearnsetByKey.get(key);
    if (!learnset) fail(`learn level override references unknown Learnset ${key}`);
    if (learnset.method !== "level-up" || learnset.level === null) {
      fail(`learn level override ${key} does not target a level-up entry`);
    }
    overrideKeys.add(key);
    const level = requireInteger(entry.level, `analysis.learnLevelOverrides[${index}].level`, 1, MAX_LEARN_LEVEL);
    if (level === learnset.level) fail(`learn level override ${key} must differ from its canonical level`);
    overrides.push({ learnsetKey: key, level });
  }
  overrides.sort((left, right) => compareText(left.learnsetKey, right.learnsetKey));

  return {
    formatVersion: POKEMON_MOVE_WORKBENCH_FORMAT,
    base,
    staging,
    scope: { kind, speciesIds: scopeSpeciesIds },
    reference: { species, moves, types, abilities, learnsets },
    analysis: { learnLevelOverrides: overrides },
  };
}

export function stringifyWorkbenchExport(value: WorkbenchExportV3): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
