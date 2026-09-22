import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  bundleHash,
  canonicalizeProvenanceManifest,
  canonicalSourceInventories,
  canonicalJson,
  canonicalizeCandidateArtifacts,
  provenanceHash,
  sha256,
  sourceInventoryHash,
  type ArtifactDescriptor,
} from "./canonical.js";
import { validateMappingRegistry } from "./reconciliation.js";
import { NORMALIZER_VERSION } from "./normalization.js";
import {
  GameDataValidationError,
  SCHEMA_VERSION,
  parseGameDataCandidate,
  parseGameDataManifest,
  parseProvenanceManifest,
  type GameDataCandidate,
  type GameDataManifest,
  type MappingRegistry,
  type ProvenanceManifest,
  type ValidationFinding,
} from "./schema.js";
import { canonicalizeBulbapediaMoveName } from "./bulbapedia-za-parser.js";
import { BULBAPEDIA_GEN8_LEARNSET_PARSER_VERSION } from "./bulbapedia-learnset-parser.js";
import { BULBAPEDIA_MOVE_TARGET_PARSER_VERSION } from "./bulbapedia-move-target.js";
import type { ReviewApproval } from "./review-commitment.js";
import { verifyReviewApproval } from "./review-approval.js";
import { validateCandidatePublicationSanity } from "./publication-sanity.js";

export type { ReviewApproval, ReviewStageManifest } from "./review-commitment.js";

export interface StagedBundleManifest {
  schemaVersion: typeof SCHEMA_VERSION;
  normalizerVersion: string;
  reviewHash: string | null;
  artifacts: ArtifactDescriptor[];
  provenanceHash: string;
  sourceInventoryHash: string;
  provenanceManifest: {
    logicalName: "provenance";
    path: "provenance.json";
    contentHash: string;
  };
  sourceInventory: {
    logicalName: "source-inventory";
    path: "source-inventory.json";
    contentHash: string;
  };
}

export interface StagedCandidate {
  directory: string;
  schemaVersion: typeof SCHEMA_VERSION;
  normalizerVersion: string;
  reviewHash: string | null;
  artifacts: ArtifactDescriptor[];
  provenanceHash: string;
  sourceInventoryHash: string;
  stageManifestHash: string;
  gameDataVersion?: never;
}

export type PublishedBundleManifest = GameDataManifest;

export interface PublishedBundle {
  directory: string;
  manifest: PublishedBundleManifest;
}

export interface LoadedPublishedBundle extends PublishedBundle {
  candidate: GameDataCandidate;
}

const REQUIRED_INVENTORY_SURFACES = [
  "species",
  "moves",
  "types",
  "abilities",
  "items",
  "learnsets",
  "type-effectiveness",
] as const;

const ARTIFACT_PATHS: Record<string, string> = {
  "catalogs/species": "catalogs/species.json",
  "catalogs/moves": "catalogs/moves.json",
  "catalogs/types": "catalogs/types.json",
  "catalogs/abilities": "catalogs/abilities.json",
  "catalogs/items": "catalogs/items.json",
  "catalogs/learnsets": "catalogs/learnsets.json",
  "referenceData/currentTypeEffectiveness":
    "reference-data/current-type-effectiveness.json",
};
const REQUIRED_ARTIFACT_LOGICAL_NAMES = Object.keys(ARTIFACT_PATHS).sort();
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const IMMUTABLE_V1_COMPATIBILITY = {
  gameDataVersion: "game-data-core-kanto-johto-v1",
  bundleHash: "sha256:bbe5114563abe85ac5b42d4f05a63c44af9fdad7abd66ebdafa504d584c02903",
  legacyBdspParserVersion: "bulbapedia-gen8-bdsp-learnset-v5",
} as const;

function publicationError(path: string, message: string, code = "publication-invalid"): GameDataValidationError {
  return new GameDataValidationError({ code, path, message });
}

function sortedDescriptors(descriptors: ArtifactDescriptor[]): ArtifactDescriptor[] {
  return [...descriptors].sort((a, b) => a.logicalName.localeCompare(b.logicalName));
}

function assertExactArtifactSet(
  descriptors: ArtifactDescriptor[],
  path: string,
): void {
  const actual = descriptors.map((descriptor) => descriptor.logicalName).sort();
  if (
    actual.length !== REQUIRED_ARTIFACT_LOGICAL_NAMES.length ||
    actual.some((logicalName, index) => logicalName !== REQUIRED_ARTIFACT_LOGICAL_NAMES[index])
  ) {
    throw new Error(
      `${path}: must contain exactly ${REQUIRED_ARTIFACT_LOGICAL_NAMES.join(", ")}`,
    );
  }
}

function currentMappingSourceKeys(inventory: ProvenanceManifest["inventories"][number]): Set<string> {
  return new Set(
    [...inventory.acceptedMappingKeys, ...inventory.candidateSourceKeys].map((key) =>
      key.normalize("NFC"),
    ),
  );
}

function mappingAcceptedKeys(
  registry: MappingRegistry,
  surface: "species" | "moves" | "types" | "abilities" | "items",
  currentSourceKeys?: ReadonlySet<string>,
): string[] {
  return registry[surface]
    .filter(
      (entry) =>
        entry.status === "accepted" &&
        (currentSourceKeys === undefined ||
          currentSourceKeys.has(entry.sourceKey.normalize("NFC"))),
    )
    .map((entry) => entry.sourceKey)
    .sort();
}

function catalogIds(candidate: GameDataCandidate, surface: "species" | "moves" | "types" | "abilities" | "items"): string[] {
  return candidate.catalogs[surface].map((entry) => entry.id).sort();
}

function mappingIds(
  registry: MappingRegistry,
  surface: "species" | "moves" | "types" | "abilities" | "items",
  currentSourceKeys?: ReadonlySet<string>,
): string[] {
  return registry[surface]
    .filter(
      (entry) =>
        entry.status === "accepted" &&
        (currentSourceKeys === undefined ||
          currentSourceKeys.has(entry.sourceKey.normalize("NFC"))),
    )
    .map((entry) => entry.canonicalId)
    .sort();
}

function equalStrings(left: string[], right: string[]): boolean {
  const normalizedLeft = left.map((value) => value.normalize("NFC")).sort();
  const normalizedRight = right.map((value) => value.normalize("NFC")).sort();
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

export function validatePublicationReadiness(candidate: GameDataCandidate, registry: MappingRegistry): ValidationFinding[] {
  const findings = [
    ...validateMappingRegistry(registry),
    ...validateCandidatePublicationSanity(candidate, registry),
  ];
  for (const [surface, entries] of Object.entries(registry) as Array<[keyof MappingRegistry, MappingRegistry[keyof MappingRegistry]]>) {
    for (const entry of entries) {
      if (entry.status === "candidate") {
        findings.push({
          code: "candidate-mapping-unresolved",
          path: `mapping.${surface}.${entry.sourceKey}`,
          message: "candidate mapping remains non-canonical and cannot be staged for publication",
        });
      }
    }
  }

  const inventoryBySurface = new Map(candidate.provenance.inventories.map((inventory) => [inventory.surface, inventory]));
  for (const surface of REQUIRED_INVENTORY_SURFACES) {
    if (!inventoryBySurface.has(surface)) {
      findings.push({
        code: "missing-source-inventory",
        path: `provenance.inventories.${surface}`,
        message: `missing required ${surface} completeness inventory`,
      });
    }
  }
  for (const inventory of candidate.provenance.inventories) {
    for (const sourceKey of inventory.candidateSourceKeys) {
      findings.push({
        code: "candidate-mapping-unresolved",
        path: `provenance.inventories.${inventory.surface}.candidateSourceKeys`,
        message: `candidate source key ${sourceKey} remains non-canonical and cannot be published`,
      });
    }
  }

  for (const surface of ["species", "moves", "types", "abilities", "items"] as const) {
    const inventory = inventoryBySurface.get(surface);
    const currentSourceKeys = inventory ? currentMappingSourceKeys(inventory) : undefined;
    if (
      inventory &&
      !equalStrings(
        [...inventory.acceptedMappingKeys].sort(),
        mappingAcceptedKeys(registry, surface, currentSourceKeys),
      )
    ) {
      findings.push({
        code: "mapping-inventory-mismatch",
        path: `provenance.inventories.${surface}.acceptedMappingKeys`,
        message: "accepted mapping inventory does not match the supplied local mapping registry",
      });
    }
    if (
      !equalStrings(
        catalogIds(candidate, surface),
        mappingIds(registry, surface, currentSourceKeys),
      )
    ) {
      findings.push({
        code: "mapping-catalog-mismatch",
        path: `catalogs.${surface}`,
        message: "normalized canonical IDs do not match the supplied accepted mapping registry",
      });
    }
  }

  const speciesById = new Map(candidate.catalogs.species.map((species) => [species.id, species]));
  for (const mapping of registry.species.filter((entry) => entry.status === "accepted")) {
    const species = speciesById.get(mapping.canonicalId);
    if (species && species.baseSpeciesId !== mapping.baseSpeciesId) {
      findings.push({
        code: "base-species-mapping-mismatch",
        path: `mapping.species.${mapping.sourceKey}.baseSpeciesId`,
        message: "baseSpeciesId must come from the accepted local mapping registry exactly",
      });
    }
  }

  const sourceById = new Map(
    candidate.provenance.sourceRecords.map((source) => [source.id, source]),
  );
  const acceptedMoveMappingById = new Map(
    registry.moves
      .filter((entry) => entry.status === "accepted")
      .map((entry) => [entry.canonicalId, entry] as const),
  );
  for (const relation of candidate.provenance.moveFactSources) {
    const mapping = acceptedMoveMappingById.get(relation.moveId);
    if (!mapping) continue;
    if (
      relation.mainline.selectedGame !== "scarlet-violet" &&
      relation.mainline.selectedGame !== "brilliant-diamond-shining-pearl"
    ) {
      let sourceMatchesMove = false;
      const source = sourceById.get(relation.mainline.sourceRecordId);
      if (source) {
        try {
          const url = new URL(source.canonicalUrl);
          const titles = url.searchParams.getAll("titles");
          const match = titles.length === 1 ? /^(.+) \(move\)$/u.exec(titles[0]) : null;
          const sourceKey = match ? canonicalizeBulbapediaMoveName(match[1]) : null;
          sourceMatchesMove = sourceKey === mapping.sourceKey.normalize("NFC");
        } catch {
          sourceMatchesMove = false;
        }
      }
      if (!sourceMatchesMove) {
        findings.push({
          code: "move-mainline-mapping-mismatch",
          path: `provenance.moveFactSources.${relation.moveId}.mainline`,
          message: `historical Bulbapedia Move proof must match accepted Move source key ${mapping.sourceKey}`,
        });
      }
    }
    for (const [role, sourceRecordId] of [
      ["sourceTargetSourceRecordId", relation.sourceTargetSourceRecordId],
      ["makesContactSourceRecordId", relation.makesContactSourceRecordId],
    ] as const) {
      const source = sourceById.get(sourceRecordId);
      if (!source) continue;
      let sourceKey: string | null = null;
      try {
        const url = new URL(source.canonicalUrl);
        if (source.provider === "pokemondb") {
          const match = /^\/move\/([^/]+)$/.exec(url.pathname);
          sourceKey = match ? decodeURIComponent(match[1]).normalize("NFC") : null;
        } else if (
          role === "sourceTargetSourceRecordId" &&
          source.provider === "bulbapedia" &&
          source.parserVersion === BULBAPEDIA_MOVE_TARGET_PARSER_VERSION
        ) {
          const match = /^\/wiki\/(.+)_\(move\)$/u.exec(decodeURIComponent(url.pathname));
          sourceKey = match
            ? canonicalizeBulbapediaMoveName(match[1].replace(/_/g, " "))
            : null;
        }
      } catch {
        sourceKey = null;
      }
      if (sourceKey !== mapping.sourceKey.normalize("NFC")) {
        findings.push({
          code: "move-complement-mapping-mismatch",
          path: `provenance.moveFactSources.${relation.moveId}.${role}`,
          message: `complementary PokémonDB Move page must match accepted Move source key ${mapping.sourceKey}`,
        });
      }
    }
  }
  return findings.sort((left, right) =>
    canonicalJson([left.code, left.path, left.message]).localeCompare(
      canonicalJson([right.code, right.path, right.message]),
      "en",
    ),
  );
}

function artifactEntries(candidate: GameDataCandidate) {
  const artifacts = canonicalizeCandidateArtifacts(candidate);
  return Object.values(artifacts).sort((a, b) =>
    a.descriptor.logicalName.localeCompare(b.descriptor.logicalName),
  );
}

function publishedDirectoryForVersion(root: string, gameDataVersion: string): string {
  if (!gameDataVersion) throw new TypeError("gameDataVersion must be a non-empty opaque string");
  const digest = createHash("sha256").update(Buffer.from(gameDataVersion.normalize("NFC"), "utf8")).digest("hex");
  return join(root, `version-${digest}`);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function writeCanonicalFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(canonicalJson(value), "utf8"));
}

export async function stageCandidate(
  directory: string,
  candidateInput: GameDataCandidate,
  mappingRegistry: MappingRegistry,
  reviewApproval?: ReviewApproval,
): Promise<StagedCandidate> {
  const candidate = parseGameDataCandidate(candidateInput);
  if (candidate.normalizerVersion !== NORMALIZER_VERSION) {
    throw publicationError(
      "normalizerVersion",
      `schemaVersion ${SCHEMA_VERSION} requires normalizerVersion ${NORMALIZER_VERSION}`,
    );
  }
  const stagingFindings = validatePublicationReadiness(candidate, mappingRegistry);
  if (stagingFindings.length > 0) throw new GameDataValidationError(stagingFindings[0]);
  if (
    candidate.provenance.moveFactSources.some(
      (relation) => relation.mainline.selectedGame !== "scarlet-violet",
    ) &&
    !reviewApproval
  ) {
    throw publicationError(
      "reviewApproval",
      "historical MOVE-01 selections require Human-reviewed raw scalar-proof evidence before staging",
    );
  }

  const expectedInventoryHash = sourceInventoryHash(candidate.provenance.inventories);
  if (candidate.provenance.sourceInventoryHash !== expectedInventoryHash) {
    throw publicationError("provenance.sourceInventoryHash", "sourceInventoryHash does not authenticate the reconciled inventories");
  }
  const expectedProvenanceHash = provenanceHash(candidate.provenance);
  if (candidate.provenance.provenanceHash !== expectedProvenanceHash) {
    throw publicationError("provenance.provenanceHash", "provenanceHash is missing or does not authenticate the provenance manifest");
  }
  const reviewHash = reviewApproval
    ? verifyReviewApproval(candidate, mappingRegistry, reviewApproval)
    : null;

  if (await pathExists(directory)) throw new Error(`staging directory already exists: ${directory}`);
  await mkdir(directory, { recursive: true });
  try {
    const entries = artifactEntries(candidate);
    for (const entry of entries) {
      const relativePath = ARTIFACT_PATHS[entry.descriptor.logicalName];
      if (!relativePath) throw new Error(`unsupported artifact logical name ${entry.descriptor.logicalName}`);
      const destination = join(directory, relativePath);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, entry.bytes);
    }
    const canonicalProvenance = canonicalizeProvenanceManifest(
      candidate.provenance,
    );
    const provenanceBytes = Buffer.from(
      canonicalJson(canonicalProvenance),
      "utf8",
    );
    const sourceInventoryBytes = Buffer.from(
      canonicalJson(canonicalSourceInventories(candidate.provenance.inventories)),
      "utf8",
    );
    await writeFile(join(directory, "provenance.json"), provenanceBytes);
    await writeFile(join(directory, "source-inventory.json"), sourceInventoryBytes);
    const stagedManifest: StagedBundleManifest = {
      schemaVersion: SCHEMA_VERSION,
      normalizerVersion: candidate.normalizerVersion,
      reviewHash,
      artifacts: sortedDescriptors(entries.map((entry) => entry.descriptor)),
      provenanceHash: expectedProvenanceHash,
      sourceInventoryHash: expectedInventoryHash,
      provenanceManifest: {
        logicalName: "provenance",
        path: "provenance.json",
        contentHash: sha256(provenanceBytes),
      },
      sourceInventory: {
        logicalName: "source-inventory",
        path: "source-inventory.json",
        contentHash: sha256(sourceInventoryBytes),
      },
    };
    const stagedManifestBytes = Buffer.from(canonicalJson(stagedManifest), "utf8");
    await writeFile(join(directory, "staged-manifest.json"), stagedManifestBytes);
    return {
      directory,
      schemaVersion: SCHEMA_VERSION,
      normalizerVersion: candidate.normalizerVersion,
      reviewHash,
      artifacts: stagedManifest.artifacts,
      provenanceHash: expectedProvenanceHash,
      sourceInventoryHash: expectedInventoryHash,
      stageManifestHash: sha256(stagedManifestBytes),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function readStagedManifest(
  directory: string,
  expectedManifestHash?: string,
): Promise<StagedBundleManifest> {
  const manifestBytes = await readFile(join(directory, "staged-manifest.json"));
  if (expectedManifestHash && sha256(manifestBytes) !== expectedManifestHash) {
    throw new Error("staged manifest hash does not match the validated stage commitment");
  }
  const parsed = JSON.parse(manifestBytes.toString("utf8")) as unknown;
  if (manifestBytes.toString("utf8") !== canonicalJson(parsed)) {
    throw new Error("staged manifest is not canonical JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid staged manifest");
  }
  const value = parsed as Record<string, unknown>;
  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`unsupported schemaVersion ${String(value.schemaVersion)}`);
  }
  if (value.normalizerVersion !== NORMALIZER_VERSION) {
    throw new Error(
      `unsupported staged normalizerVersion ${String(value.normalizerVersion)}`,
    );
  }
  const reviewHash = value.reviewHash;
  if (reviewHash !== null && (typeof reviewHash !== "string" || !HASH_RE.test(reviewHash))) {
    throw new Error("invalid staged manifest reviewHash");
  }
  if (!Array.isArray(value.artifacts)) throw new Error("invalid staged manifest artifacts");
  const artifacts = value.artifacts.map((entry, index): ArtifactDescriptor => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`invalid staged artifact descriptor ${index}`);
    }
    const descriptor = entry as Record<string, unknown>;
    if (
      typeof descriptor.logicalName !== "string" ||
      typeof descriptor.contentHash !== "string" ||
      !HASH_RE.test(descriptor.contentHash) ||
      typeof descriptor.recordCount !== "number" ||
      !Number.isSafeInteger(descriptor.recordCount) ||
      descriptor.recordCount < 0
    ) {
      throw new Error(`invalid staged artifact descriptor ${index}`);
    }
    return {
      logicalName: descriptor.logicalName,
      contentHash: descriptor.contentHash,
      recordCount: descriptor.recordCount,
    };
  });
  assertExactArtifactSet(artifacts, "staged.artifacts");
  if (
    canonicalJson(artifacts) !== canonicalJson(sortedDescriptors(artifacts))
  ) {
    throw new Error("staged artifact descriptors are not in canonical order");
  }
  const readHash = (key: "provenanceHash" | "sourceInventoryHash"): string => {
    const hash = value[key];
    if (typeof hash !== "string" || !HASH_RE.test(hash)) {
      throw new Error(`invalid staged manifest ${key}`);
    }
    return hash;
  };
  const readReferencedFile = <
    TLogicalName extends "provenance" | "source-inventory",
    TPath extends "provenance.json" | "source-inventory.json",
  >(
    key: "provenanceManifest" | "sourceInventory",
    logicalName: TLogicalName,
    path: TPath,
  ): { logicalName: TLogicalName; path: TPath; contentHash: string } => {
    const reference = value[key];
    if (reference === null || typeof reference !== "object" || Array.isArray(reference)) {
      throw new Error(`invalid staged manifest ${key}`);
    }
    const record = reference as Record<string, unknown>;
    if (
      record.logicalName !== logicalName ||
      record.path !== path ||
      typeof record.contentHash !== "string" ||
      !HASH_RE.test(record.contentHash)
    ) {
      throw new Error(`invalid staged manifest ${key}`);
    }
    return { logicalName, path, contentHash: record.contentHash };
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    normalizerVersion: value.normalizerVersion,
    reviewHash: reviewHash as string | null,
    artifacts,
    provenanceHash: readHash("provenanceHash"),
    sourceInventoryHash: readHash("sourceInventoryHash"),
    provenanceManifest: readReferencedFile(
      "provenanceManifest",
      "provenance",
      "provenance.json",
    ),
    sourceInventory: readReferencedFile(
      "sourceInventory",
      "source-inventory",
      "source-inventory.json",
    ),
  };
}

async function verifyStagedDirectory(directory: string, staged: StagedBundleManifest): Promise<ProvenanceManifest> {
  assertExactArtifactSet(staged.artifacts, "staged.artifacts");
  for (const descriptor of staged.artifacts) {
    const relativePath = ARTIFACT_PATHS[descriptor.logicalName];
    if (!relativePath) throw new Error(`unsupported artifact logical name ${descriptor.logicalName}`);
    const bytes = await readFile(join(directory, relativePath));
    if (sha256(bytes) !== descriptor.contentHash) throw new Error(`artifact hash mismatch for ${descriptor.logicalName}`);
    const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== descriptor.recordCount) throw new Error(`artifact recordCount mismatch for ${descriptor.logicalName}`);
  }
  const provenanceBytes = await readFile(join(directory, staged.provenanceManifest.path));
  if (sha256(provenanceBytes) !== staged.provenanceManifest.contentHash) {
    throw new Error("staged provenance file hash mismatch");
  }
  const sourceInventoryBytes = await readFile(join(directory, staged.sourceInventory.path));
  if (sha256(sourceInventoryBytes) !== staged.sourceInventory.contentHash) {
    throw new Error("staged source inventory file hash mismatch");
  }
  if (staged.sourceInventory.contentHash !== staged.sourceInventoryHash) {
    throw new Error("staged source inventory descriptor does not match sourceInventoryHash");
  }
  const provenanceValue = JSON.parse(provenanceBytes.toString("utf8")) as unknown;
  const provenance = canonicalizeProvenanceManifest(
    parseProvenanceManifest(provenanceValue),
  );
  if (provenanceBytes.toString("utf8") !== canonicalJson(provenance)) {
    throw new Error("staged provenance file is not canonical JSON");
  }
  if (provenanceHash(provenance) !== staged.provenanceHash) throw new Error("staged provenance hash mismatch");
  if (provenance.provenanceHash !== staged.provenanceHash) {
    throw new Error("staged provenance internal provenanceHash mismatch");
  }
  if (sourceInventoryHash(provenance.inventories) !== staged.sourceInventoryHash) throw new Error("staged source inventory hash mismatch");
  if (provenance.sourceInventoryHash !== staged.sourceInventoryHash) {
    throw new Error("staged provenance internal sourceInventoryHash mismatch");
  }
  const inventoryFromFile = JSON.parse(sourceInventoryBytes.toString("utf8")) as unknown;
  const expectedInventoryBytes = Buffer.from(
    canonicalJson(canonicalSourceInventories(provenance.inventories)),
    "utf8",
  );
  if (!sourceInventoryBytes.equals(expectedInventoryBytes)) {
    throw new Error("staged source inventory file does not match provenance inventory");
  }
  if (canonicalJson(inventoryFromFile) !== expectedInventoryBytes.toString("utf8")) {
    throw new Error("staged source inventory file is not canonical JSON");
  }
  return provenance;
}

function artifactByLogicalNameFromDescriptors(
  descriptors: ArtifactDescriptor[],
  logicalName: string,
): ArtifactDescriptor {
  const descriptor = descriptors.find((entry) => entry.logicalName === logicalName);
  if (!descriptor) throw new Error(`missing artifact ${logicalName}`);
  return descriptor;
}

async function readAndVerifyArtifact<T>(
  directory: string,
  descriptor: ArtifactDescriptor,
): Promise<T> {
  const relativePath = ARTIFACT_PATHS[descriptor.logicalName];
  if (!relativePath) throw new Error(`unsupported artifact logical name ${descriptor.logicalName}`);
  const bytes = await readFile(join(directory, relativePath));
  if (sha256(bytes) !== descriptor.contentHash) {
    throw new Error(`artifact hash mismatch for ${descriptor.logicalName}`);
  }
  const value = JSON.parse(bytes.toString("utf8")) as unknown;
  if (!Array.isArray(value) || value.length !== descriptor.recordCount) {
    throw new Error(`artifact recordCount mismatch for ${descriptor.logicalName}`);
  }
  return value as T;
}

async function reconstructCandidateFromPayload(
  directory: string,
  normalizerVersion: string,
  descriptors: ArtifactDescriptor[],
  provenance: ProvenanceManifest,
  allowImmutableV1Compatibility = false,
): Promise<GameDataCandidate> {
  assertExactArtifactSet(descriptors, "artifacts");
  const validationProvenance: ProvenanceManifest = {
    ...provenance,
    sourceRecords: provenance.sourceRecords.map((source) =>
      allowImmutableV1Compatibility &&
      source.provider === "bulbapedia" &&
      source.parserVersion === IMMUTABLE_V1_COMPATIBILITY.legacyBdspParserVersion
        ? { ...source, parserVersion: BULBAPEDIA_GEN8_LEARNSET_PARSER_VERSION }
        : source,
    ),
  };
  const candidate = parseGameDataCandidate({
    schemaVersion: SCHEMA_VERSION,
    normalizerVersion,
    catalogs: {
      species: await readAndVerifyArtifact(
        directory,
        artifactByLogicalNameFromDescriptors(descriptors, "catalogs/species"),
      ),
      moves: await readAndVerifyArtifact(
        directory,
        artifactByLogicalNameFromDescriptors(descriptors, "catalogs/moves"),
      ),
      types: await readAndVerifyArtifact(
        directory,
        artifactByLogicalNameFromDescriptors(descriptors, "catalogs/types"),
      ),
      abilities: await readAndVerifyArtifact(
        directory,
        artifactByLogicalNameFromDescriptors(descriptors, "catalogs/abilities"),
      ),
      items: await readAndVerifyArtifact(
        directory,
        artifactByLogicalNameFromDescriptors(descriptors, "catalogs/items"),
      ),
      learnsets: await readAndVerifyArtifact(
        directory,
        artifactByLogicalNameFromDescriptors(descriptors, "catalogs/learnsets"),
      ),
    },
    referenceData: {
      currentTypeEffectiveness: await readAndVerifyArtifact(
        directory,
        artifactByLogicalNameFromDescriptors(
          descriptors,
          "referenceData/currentTypeEffectiveness",
        ),
      ),
    },
    provenance: validationProvenance,
  });
  return { ...candidate, provenance };
}

async function assertCanonicalCandidatePayload(
  directory: string,
  candidate: GameDataCandidate,
  descriptors: ArtifactDescriptor[],
): Promise<void> {
  const expectedArtifacts = Object.values(canonicalizeCandidateArtifacts(candidate));
  for (const expected of expectedArtifacts) {
    const descriptor = artifactByLogicalNameFromDescriptors(
      descriptors,
      expected.descriptor.logicalName,
    );
    if (
      descriptor.contentHash !== expected.descriptor.contentHash ||
      descriptor.recordCount !== expected.descriptor.recordCount
    ) {
      throw new Error(`non-canonical artifact descriptor ${descriptor.logicalName}`);
    }
    const relativePath = ARTIFACT_PATHS[descriptor.logicalName];
    if (!relativePath) throw new Error(`unsupported artifact logical name ${descriptor.logicalName}`);
    const actualBytes = await readFile(join(directory, relativePath));
    if (!actualBytes.equals(expected.bytes)) {
      throw new Error(`non-canonical artifact bytes for ${descriptor.logicalName}`);
    }
  }
}

function catalogCountsFromDescriptors(descriptors: ArtifactDescriptor[]): PublishedBundleManifest["catalogCounts"] {
  assertExactArtifactSet(descriptors, "artifacts");
  const counts = new Map(descriptors.map((descriptor) => [descriptor.logicalName, descriptor.recordCount]));
  const required = (logicalName: string): number => {
    const count = counts.get(logicalName);
    if (count === undefined) throw new Error(`missing required artifact ${logicalName}`);
    return count;
  };
  return {
    species: required("catalogs/species"),
    moves: required("catalogs/moves"),
    types: required("catalogs/types"),
    abilities: required("catalogs/abilities"),
    items: required("catalogs/items"),
    learnsets: required("catalogs/learnsets"),
    currentTypeEffectiveness: required("referenceData/currentTypeEffectiveness"),
  };
}

function assertCatalogCountsMatchDescriptors(manifest: PublishedBundleManifest): void {
  const expected = catalogCountsFromDescriptors(manifest.artifacts);
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (manifest.catalogCounts[key] !== expected[key]) {
      throw new Error(`manifest catalogCounts.${key} does not match artifact recordCount`);
    }
  }
}

async function buildManifest(staged: StagedBundleManifest, gameDataVersion: string, publishedAt: string): Promise<PublishedBundleManifest> {
  if (!gameDataVersion) throw new TypeError("gameDataVersion must be a non-empty opaque string");
  if (Number.isNaN(Date.parse(publishedAt))) throw new TypeError("publishedAt must be an ISO-compatible timestamp");
  const normalizedGameDataVersion = gameDataVersion.normalize("NFC");
  const artifacts = sortedDescriptors(staged.artifacts);
  return {
    schemaVersion: SCHEMA_VERSION,
    gameDataVersion: normalizedGameDataVersion,
    bundleHash: bundleHash(SCHEMA_VERSION, normalizedGameDataVersion, artifacts, staged.provenanceHash),
    provenanceHash: staged.provenanceHash,
    publishedAt,
    normalizerVersion: staged.normalizerVersion,
    artifacts,
    provenanceManifest: staged.provenanceManifest,
    sourceInventory: staged.sourceInventory,
    catalogCounts: catalogCountsFromDescriptors(artifacts),
  };
}

async function copyStagedPayload(stagedDirectory: string, destination: string, descriptors: ArtifactDescriptor[]): Promise<void> {
  for (const descriptor of descriptors) {
    const relativePath = ARTIFACT_PATHS[descriptor.logicalName];
    if (!relativePath) throw new Error(`unsupported artifact logical name ${descriptor.logicalName}`);
    const target = join(destination, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(join(stagedDirectory, relativePath)));
  }
  await writeFile(join(destination, "provenance.json"), await readFile(join(stagedDirectory, "provenance.json")));
  await writeFile(
    join(destination, "source-inventory.json"),
    await readFile(join(stagedDirectory, "source-inventory.json")),
  );
}

async function readPublishedManifest(directory: string): Promise<PublishedBundleManifest> {
  const manifestBytes = await readFile(join(directory, "manifest.json"));
  const parsed = JSON.parse(manifestBytes.toString("utf8")) as unknown;
  if (manifestBytes.toString("utf8") !== canonicalJson(parsed)) {
    throw new Error("published manifest is not canonical JSON");
  }
  const manifest = parseGameDataManifest(
    parsed,
  );
  if (manifest.normalizerVersion !== NORMALIZER_VERSION) {
    throw new Error(`unsupported normalizerVersion ${manifest.normalizerVersion}`);
  }
  assertExactArtifactSet(manifest.artifacts, "manifest.artifacts");
  if (
    canonicalJson(manifest.artifacts) !==
    canonicalJson(sortedDescriptors(manifest.artifacts))
  ) {
    throw new Error(
      "published manifest artifact descriptors are not in canonical order",
    );
  }
  assertCatalogCountsMatchDescriptors(manifest);
  return manifest;
}

export async function publishStagedCandidate(
  stagedCandidate: StagedCandidate,
  publishedRoot: string,
  gameDataVersion: string,
  publishedAt: string,
  mappingRegistry: MappingRegistry,
  reviewApproval: ReviewApproval,
): Promise<PublishedBundle> {
  const normalizedGameDataVersion = gameDataVersion.normalize("NFC");
  if (stagedCandidate.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`unsupported schemaVersion ${String(stagedCandidate.schemaVersion)}`);
  }
  if (!HASH_RE.test(stagedCandidate.stageManifestHash)) {
    throw new Error("invalid stageManifestHash commitment");
  }
  if (!HASH_RE.test(reviewApproval.approvedReviewHash)) {
    throw new Error("canonical publication requires an exact Human-approved reviewHash");
  }
  if (stagedCandidate.reviewHash === null || !HASH_RE.test(stagedCandidate.reviewHash)) {
    throw new Error("canonical publication requires a Human-approved reviewHash commitment");
  }
  if (stagedCandidate.reviewHash !== reviewApproval.approvedReviewHash) {
    throw new Error("staged reviewHash does not match the Human-approved reviewHash");
  }
  const staged = await readStagedManifest(
    stagedCandidate.directory,
    stagedCandidate.stageManifestHash,
  );
  if (
    staged.normalizerVersion !== stagedCandidate.normalizerVersion ||
    staged.reviewHash !== stagedCandidate.reviewHash ||
    staged.provenanceHash !== stagedCandidate.provenanceHash ||
    staged.sourceInventoryHash !== stagedCandidate.sourceInventoryHash ||
    canonicalJson(sortedDescriptors(staged.artifacts)) !==
      canonicalJson(sortedDescriptors(stagedCandidate.artifacts))
  ) {
    throw new Error("staged manifest no longer matches the validated stage commitment");
  }
  const destination = publishedDirectoryForVersion(publishedRoot, normalizedGameDataVersion);
  await mkdir(publishedRoot, { recursive: true });
  const temporary = join(publishedRoot, `.publish-${randomUUID()}`);
  await mkdir(temporary, { recursive: false });
  try {
    await copyStagedPayload(stagedCandidate.directory, temporary, staged.artifacts);
    const provenance = await verifyStagedDirectory(temporary, staged);
    const candidate = await reconstructCandidateFromPayload(
      temporary,
      staged.normalizerVersion,
      staged.artifacts,
      provenance,
    );
    await assertCanonicalCandidatePayload(temporary, candidate, staged.artifacts);
    const verifiedReviewHash = verifyReviewApproval(candidate, mappingRegistry, reviewApproval);
    if (verifiedReviewHash !== staged.reviewHash) {
      throw new Error("published candidate does not match the staged Human-approved review commitment");
    }
    const publicationFindings = validatePublicationReadiness(candidate, mappingRegistry);
    if (publicationFindings.length > 0) {
      throw new GameDataValidationError(publicationFindings[0]);
    }
    const manifest = await buildManifest(staged, normalizedGameDataVersion, publishedAt);

    if (await pathExists(destination)) {
      const existing = (await loadPublishedBundle(publishedRoot, normalizedGameDataVersion)).manifest;
      if (
        existing.gameDataVersion !== normalizedGameDataVersion ||
        existing.bundleHash !== manifest.bundleHash
      ) {
        throw new Error(
          `gameDataVersion ${normalizedGameDataVersion} already exists with different content`,
        );
      }
      await rm(temporary, { recursive: true, force: true });
      return { directory: destination, manifest: existing };
    }

    await writeCanonicalFile(join(temporary, "manifest.json"), manifest);
    try {
      await rename(temporary, destination);
    } catch (error) {
      if (!(await pathExists(destination))) throw error;
      const existing = (await loadPublishedBundle(publishedRoot, normalizedGameDataVersion)).manifest;
      if (existing.gameDataVersion !== normalizedGameDataVersion || existing.bundleHash !== manifest.bundleHash) {
        throw new Error(
          `gameDataVersion ${normalizedGameDataVersion} already exists with different content`,
          { cause: error },
        );
      }
      await rm(temporary, { recursive: true, force: true });
      return { directory: destination, manifest: existing };
    }
    return { directory: destination, manifest };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export async function loadPublishedBundle(publishedRoot: string, gameDataVersion: string): Promise<LoadedPublishedBundle> {
  const normalizedGameDataVersion = gameDataVersion.normalize("NFC");
  const directory = publishedDirectoryForVersion(publishedRoot, normalizedGameDataVersion);
  const manifest = await readPublishedManifest(directory);
  if (manifest.gameDataVersion !== normalizedGameDataVersion) throw new Error("published manifest gameDataVersion does not match requested version");
  const provenanceBytes = await readFile(join(directory, manifest.provenanceManifest.path));
  if (sha256(provenanceBytes) !== manifest.provenanceManifest.contentHash) {
    throw new Error("published provenance file hash mismatch");
  }
  const provenance = canonicalizeProvenanceManifest(
    parseProvenanceManifest(
      JSON.parse(provenanceBytes.toString("utf8")) as unknown,
    ),
  );
  if (provenanceBytes.toString("utf8") !== canonicalJson(provenance)) {
    throw new Error("published provenance file is not canonical JSON");
  }
  if (provenanceHash(provenance) !== manifest.provenanceHash) throw new Error("published provenance hash mismatch");
  if (provenance.provenanceHash !== manifest.provenanceHash) {
    throw new Error("published provenance internal provenanceHash mismatch");
  }
  const sourceInventoryBytes = await readFile(join(directory, manifest.sourceInventory.path));
  if (sha256(sourceInventoryBytes) !== manifest.sourceInventory.contentHash) {
    throw new Error("published source inventory file hash mismatch");
  }
  const expectedSourceInventoryHash = sourceInventoryHash(provenance.inventories);
  if (expectedSourceInventoryHash !== manifest.sourceInventory.contentHash) {
    throw new Error("published source inventory hash mismatch");
  }
  if (provenance.sourceInventoryHash !== expectedSourceInventoryHash) {
    throw new Error("published provenance internal sourceInventoryHash mismatch");
  }
  const expectedSourceInventoryBytes = Buffer.from(
    canonicalJson(canonicalSourceInventories(provenance.inventories)),
    "utf8",
  );
  if (!sourceInventoryBytes.equals(expectedSourceInventoryBytes)) {
    throw new Error("published source inventory file does not match provenance inventory");
  }
  const expectedBundleHash = bundleHash(manifest.schemaVersion, manifest.gameDataVersion, manifest.artifacts, manifest.provenanceHash);
  if (expectedBundleHash !== manifest.bundleHash) throw new Error("published bundleHash mismatch");

  const candidate = await reconstructCandidateFromPayload(
    directory,
    manifest.normalizerVersion,
    manifest.artifacts,
    provenance,
    manifest.gameDataVersion === IMMUTABLE_V1_COMPATIBILITY.gameDataVersion &&
      manifest.bundleHash === IMMUTABLE_V1_COMPATIBILITY.bundleHash,
  );
  await assertCanonicalCandidatePayload(directory, candidate, manifest.artifacts);
  return { directory, manifest, candidate };
}
