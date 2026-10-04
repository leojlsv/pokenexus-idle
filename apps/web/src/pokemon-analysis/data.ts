import manifestUrl from "../../../../packages/game-data/published/version-38ed5230053095b7ef69290f55f40278e681f20eb530788040be5639cdde3c19/manifest.json?url";
import speciesUrl from "../../../../packages/game-data/published/version-38ed5230053095b7ef69290f55f40278e681f20eb530788040be5639cdde3c19/catalogs/species.json?url";
import movesUrl from "../../../../packages/game-data/published/version-38ed5230053095b7ef69290f55f40278e681f20eb530788040be5639cdde3c19/catalogs/moves.json?url";
import typesUrl from "../../../../packages/game-data/published/version-38ed5230053095b7ef69290f55f40278e681f20eb530788040be5639cdde3c19/catalogs/types.json?url";
import abilitiesUrl from "../../../../packages/game-data/published/version-38ed5230053095b7ef69290f55f40278e681f20eb530788040be5639cdde3c19/catalogs/abilities.json?url";
import learnsetsUrl from "../../../../packages/game-data/published/version-38ed5230053095b7ef69290f55f40278e681f20eb530788040be5639cdde3c19/catalogs/learnsets.json?url";
import hoennStagingUrl from "./hoenn-staging.json?url";
import type {
  AbilityRecord,
  LearnsetRecord,
  MoveRecord,
  SpeciesRecord,
  StagingIdentity,
  TypeRecord,
  WorkbenchData,
} from "./model";

interface Manifest {
  schemaVersion: string;
  gameDataVersion: string;
  bundleHash: string;
  provenanceHash: string;
  artifacts: Array<{ logicalName: string; contentHash: string; recordCount: number }>;
  catalogCounts: Record<string, number>;
}

export interface HoennStagingArtifact {
  formatVersion: string;
  sources: {
    firstAcquireRequestHash: string;
    secondAcquireRequestHash: string;
    firstPokemonDbSnapshotId: string;
    firstBulbapediaSnapshotId: string;
    movePokemonDbSnapshotId: string;
    moveBulbapediaSnapshotId: string;
    pokeApiSnapshotId: string;
    zaSnapshotId: string;
  };
  counts: { species: number; moves: number; abilities: number; learnsets: number };
  species: SpeciesRecord[];
  moves: MoveRecord[];
  abilities: AbilityRecord[];
  learnsets: LearnsetRecord[];
}

const EXPECTED_PUBLICATION = {
  schemaVersion: "5",
  gameDataVersion: "game-data-core-kanto-johto-v5",
  bundleHash: "sha256:565cdd360c1b29dc3607696299244279a8d0c3f488d4544c41c62ed47592f782",
  provenanceHash: "sha256:fcb28b7ee90680cf28778acc48f9aad5dd24578f620ce0e30705484bd4b3dd68",
} as const;

const EXPECTED_ARTIFACTS = {
  "catalogs/species": { hash: "sha256:d23c0d64291c970dd50f9832c7695b1949ab5401d09f7cedb2de4d1147e96421", count: 293 },
  "catalogs/moves": { hash: "sha256:c99674f6f04702939a1389e0aedc9290e98fa7cb935556dd7fc6e72808605c68", count: 547 },
  "catalogs/types": { hash: "sha256:a0cb954a9e1424e6a40619822ab490925b3c13b3a77e2b5f900603f221f9a928", count: 18 },
  "catalogs/abilities": { hash: "sha256:a6bf8735373ef90b32f3feca63d7b2a65afa576157faf1467cf3c6461baedbeb", count: 147 },
  "catalogs/learnsets": { hash: "sha256:110be5aa77fc1f8a3b2c62dd61210033f27c202a70ce9d8b324e159a93fc9ec1", count: 19035 },
} as const;

const EXPECTED_STAGING = {
  formatVersion: "pokenexus.task117.hoenn-workbench-staging.v1",
  artifactHash: "sha256:2012d517189be550c470aa6a3a59059270cd41d7c452d9741fe8a23ad8507752",
  firstAcquireRequestHash: "sha256:0c16d7f92776d07c961f2e7800883a0bdc999179e4cae6793b3cf595a9eae867",
  secondAcquireRequestHash: "sha256:eca256bf80ad71204a18b296138b57fa736f0b9c37bb56692f40b9849663ecbc",
  sourceSnapshotIds: [
    "source-snapshot:pokemondb:4bff6719b2454a4594577fca71f6cfc77d359cd08fc52283e6d11832b647a9ca",
    "source-snapshot:bulbapedia:52e7cc9cc41a9870190a59c12b699865dd231db9f5bae8edebae3290ccd7b3a7",
    "source-snapshot:pokemondb:ef78f97b11afef8b2d627d9283172600059c70fd65ca8b698cc111905ff5f0a7",
    "source-snapshot:bulbapedia:32b6f43feb77a7e39a5ce6bc89bdd444e4f4e32473e5e68d38b4954e1a1e72a5",
    "source-snapshot:pokeapi:8ef26f3e68509ee3c101a7063c32c67283dc95c67aa5f23a6ff2a829bd2bf9b8",
    "source-snapshot:bulbapedia:abbf22fac38c85d94d52eadd6e24e503c0231766472fe8c59dc7925195c03a4a",
  ],
  counts: { species: 135, moves: 17, abilities: 19, learnsets: 7328 },
} as const;

export const WORKBENCH_SOURCE_COUNTS = {
  published: {
    species: EXPECTED_ARTIFACTS["catalogs/species"].count,
    moves: EXPECTED_ARTIFACTS["catalogs/moves"].count,
    abilities: EXPECTED_ARTIFACTS["catalogs/abilities"].count,
    learnsets: EXPECTED_ARTIFACTS["catalogs/learnsets"].count,
  },
  staging: { ...EXPECTED_STAGING.counts },
} as const;

async function fetchBytes(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Unable to load ${url}: HTTP ${response.status}`);
  return response.arrayBuffer();
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const bytes = await fetchBytes(url, signal);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

async function fetchVerifiedCatalog<T>(
  url: string,
  expected: { hash: string; count: number },
  label: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const bytes = await fetchBytes(url, signal);
  const actualHash = await sha256(bytes);
  if (actualHash !== expected.hash) throw new Error(`${label} hash mismatch: expected ${expected.hash}, got ${actualHash}`);
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array`);
  if (parsed.length !== expected.count) throw new Error(`${label} count mismatch: expected ${expected.count}, got ${parsed.length}`);
  return parsed as T[];
}

function uniqueIdSet<T>(records: readonly T[], id: (record: T) => string, label: string): Set<string> {
  const ids = new Set<string>();
  for (const record of records) {
    const value = id(record);
    if (!value || ids.has(value)) throw new Error(`${label} contains duplicate or empty id ${value}`);
    ids.add(value);
  }
  return ids;
}

function assertNoOverlap(left: ReadonlySet<string>, right: ReadonlySet<string>, label: string): void {
  for (const id of right) if (left.has(id)) throw new Error(`${label} staging collides with published id ${id}`);
}

function assertStagingShape(staging: HoennStagingArtifact): StagingIdentity {
  if (staging.formatVersion !== EXPECTED_STAGING.formatVersion) throw new Error("Hoenn staging formatVersion mismatch");
  for (const [key, count] of Object.entries(EXPECTED_STAGING.counts)) {
    const records = staging[key as keyof Pick<HoennStagingArtifact, "species" | "moves" | "abilities" | "learnsets">];
    if (!Array.isArray(records) || records.length !== count || staging.counts[key as keyof typeof staging.counts] !== count) {
      throw new Error(`Hoenn staging ${key} count mismatch`);
    }
  }
  if (staging.sources.firstAcquireRequestHash !== EXPECTED_STAGING.firstAcquireRequestHash) throw new Error("Hoenn first ACQUIRE request hash mismatch");
  if (staging.sources.secondAcquireRequestHash !== EXPECTED_STAGING.secondAcquireRequestHash) throw new Error("Hoenn second ACQUIRE request hash mismatch");
  const sourceSnapshotIds = [
    staging.sources.firstPokemonDbSnapshotId,
    staging.sources.firstBulbapediaSnapshotId,
    staging.sources.movePokemonDbSnapshotId,
    staging.sources.moveBulbapediaSnapshotId,
    staging.sources.pokeApiSnapshotId,
    staging.sources.zaSnapshotId,
  ];
  if (sourceSnapshotIds.some((id, index) => id !== EXPECTED_STAGING.sourceSnapshotIds[index])) {
    throw new Error("Hoenn staging source snapshot identity mismatch");
  }
  const dex = staging.species.map(({ nationalDexNumber }) => nationalDexNumber).sort((a, b) => a - b);
  if (dex.length !== 135 || dex.some((value, index) => value !== 252 + index)) throw new Error("Hoenn staging Species must cover National Dex 252..386 exactly");
  if (staging.species.some(({ introducedGeneration, formLabel, baseSpeciesId }) => introducedGeneration !== 3 || formLabel !== null || baseSpeciesId !== null)) {
    throw new Error("Hoenn staging Species must contain only Generation III base Species");
  }
  return {
    formatVersion: staging.formatVersion,
    artifactHash: EXPECTED_STAGING.artifactHash,
    firstAcquireRequestHash: staging.sources.firstAcquireRequestHash,
    secondAcquireRequestHash: staging.sources.secondAcquireRequestHash,
    sourceSnapshotIds,
  };
}

export function mergeHoennStaging(
  published: Omit<WorkbenchData, "staging">,
  staging: HoennStagingArtifact,
): WorkbenchData {
  const stagingIdentity = assertStagingShape(staging);
  const publishedSpeciesIds = uniqueIdSet(published.species, ({ id }) => id, "Published Species");
  const publishedMoveIds = uniqueIdSet(published.moves, ({ id }) => id, "Published Moves");
  const publishedAbilityIds = uniqueIdSet(published.abilities, ({ id }) => id, "Published Abilities");
  const typeIds = uniqueIdSet(published.types, ({ id }) => id, "Published Types");
  const stagedSpeciesIds = uniqueIdSet(staging.species, ({ id }) => id, "Hoenn Species");
  const stagedMoveIds = uniqueIdSet(staging.moves, ({ id }) => id, "Hoenn Moves");
  const stagedAbilityIds = uniqueIdSet(staging.abilities, ({ id }) => id, "Hoenn Abilities");
  assertNoOverlap(publishedSpeciesIds, stagedSpeciesIds, "Species");
  assertNoOverlap(publishedMoveIds, stagedMoveIds, "Move");
  assertNoOverlap(publishedAbilityIds, stagedAbilityIds, "Ability");

  const moveIds = new Set([...publishedMoveIds, ...stagedMoveIds]);
  const abilityIds = new Set([...publishedAbilityIds, ...stagedAbilityIds]);
  for (const species of staging.species) {
    for (const typeId of species.typeIds) if (!typeIds.has(typeId)) throw new Error(`Hoenn Species ${species.id} references unknown Type ${typeId}`);
    for (const { abilityId } of species.abilities) if (!abilityIds.has(abilityId)) throw new Error(`Hoenn Species ${species.id} references unknown Ability ${abilityId}`);
  }
  for (const move of staging.moves) if (!typeIds.has(move.typeId)) throw new Error(`Hoenn Move ${move.id} references unknown Type ${move.typeId}`);

  const learnsetKeys = new Set<string>();
  for (const entry of staging.learnsets) {
    const key = [entry.speciesId, entry.moveId, entry.sourceGeneration, entry.sourceGame, entry.method, entry.level ?? "", entry.machineIdentifier ?? ""].join("\u0000");
    if (learnsetKeys.has(key)) throw new Error(`Hoenn staging contains duplicate Learnset ${key}`);
    learnsetKeys.add(key);
    if (!stagedSpeciesIds.has(entry.speciesId)) throw new Error(`Hoenn Learnset references non-staged Species ${entry.speciesId}`);
    if (!moveIds.has(entry.moveId)) throw new Error(`Hoenn Learnset references unknown Move ${entry.moveId}`);
  }

  return {
    ...published,
    staging: stagingIdentity,
    species: [...published.species, ...staging.species],
    moves: [...published.moves, ...staging.moves],
    abilities: [...published.abilities, ...staging.abilities],
    learnsets: [...published.learnsets, ...staging.learnsets],
  };
}

function assertManifest(manifest: Manifest): void {
  for (const [key, expected] of Object.entries(EXPECTED_PUBLICATION)) {
    if (manifest[key as keyof typeof EXPECTED_PUBLICATION] !== expected) {
      throw new Error(`Manifest ${key} does not match the pinned v5 publication`);
    }
  }
  const artifactByName = new Map(manifest.artifacts.map((artifact) => [artifact.logicalName, artifact]));
  for (const [logicalName, expected] of Object.entries(EXPECTED_ARTIFACTS)) {
    const artifact = artifactByName.get(logicalName);
    if (!artifact || artifact.contentHash !== expected.hash || artifact.recordCount !== expected.count) {
      throw new Error(`Manifest artifact binding mismatch for ${logicalName}`);
    }
  }
}

export async function loadCurrentWorkbenchData(signal?: AbortSignal): Promise<WorkbenchData> {
  const [manifest, species, moves, types, abilities, learnsets, stagingBytes] = await Promise.all([
    fetchJson<Manifest>(manifestUrl, signal),
    fetchVerifiedCatalog<SpeciesRecord>(speciesUrl, EXPECTED_ARTIFACTS["catalogs/species"], "Species catalog", signal),
    fetchVerifiedCatalog<MoveRecord>(movesUrl, EXPECTED_ARTIFACTS["catalogs/moves"], "Move catalog", signal),
    fetchVerifiedCatalog<TypeRecord>(typesUrl, EXPECTED_ARTIFACTS["catalogs/types"], "Type catalog", signal),
    fetchVerifiedCatalog<AbilityRecord>(abilitiesUrl, EXPECTED_ARTIFACTS["catalogs/abilities"], "Ability catalog", signal),
    fetchVerifiedCatalog<LearnsetRecord>(learnsetsUrl, EXPECTED_ARTIFACTS["catalogs/learnsets"], "Learnset catalog", signal),
    fetchBytes(hoennStagingUrl, signal),
  ]);
  assertManifest(manifest);
  const stagingHash = await sha256(stagingBytes);
  if (stagingHash !== EXPECTED_STAGING.artifactHash) {
    throw new Error(`Hoenn staging hash mismatch: expected ${EXPECTED_STAGING.artifactHash}, got ${stagingHash}`);
  }
  const staging = JSON.parse(new TextDecoder().decode(stagingBytes)) as HoennStagingArtifact;
  return mergeHoennStaging({
    base: {
      schemaVersion: manifest.schemaVersion,
      gameDataVersion: manifest.gameDataVersion,
      bundleHash: manifest.bundleHash,
      provenanceHash: manifest.provenanceHash,
    },
    species,
    moves,
    types,
    abilities,
    learnsets,
  }, staging);
}
