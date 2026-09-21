import type {
  AbilityId,
  ItemId,
  MoveId,
  SpeciesId,
  TypeId,
} from "@pokenexus/game-types";
import type {
  AbilityDefinitionV1,
  GameDataCandidate,
  ItemDefinitionV1,
  LearnsetEntryV1,
  MoveDefinitionV1,
  ProvenanceManifest,
  SourceInventory,
  SpeciesDefinitionV2,
  TypeDefinitionV1,
  TypeEffectivenessEntry,
  MappingRegistry,
} from "./schema";
import { finalizeProvenance } from "./canonical";

export const asId = <T extends string>(value: string): T => value as T;

export const SOURCE_RECORD_ID = "source:species:alpha";
export const ZA_MOVE_SOURCE_RECORD_ID = "source:bulbapedia:za-moves";
export const GEN9_MOVE_SOURCE_RECORD_ID = "source:bulbapedia:gen9-moves";

export function speciesFixture(
  overrides: Partial<SpeciesDefinitionV2> = {},
): SpeciesDefinitionV2 {
  return {
    id: asId<SpeciesId>("species-alpha"),
    sourceName: "Alpha",
    sourceSlug: "alpha",
    nationalDexNumber: 1,
    introducedGeneration: 1,
    formLabel: null,
    baseSpeciesId: null,
    typeIds: [asId<TypeId>("normal")],
    baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
    abilities: [
      {
        abilityId: asId<AbilityId>("overgrow"),
        sourceAbilitySlot: "normal-1",
      },
    ],
    catchRate: 45,
    baseExperience: { status: "known", value: 64 },
    growthRate: "medium-slow",
    heightMillimeters: 700,
    weightGrams: 6900,
    eggGroups: ["monster", "grass"],
    genderRatio: {
      kind: "ratio",
      maleBasisPoints: 8750,
      femaleBasisPoints: 1250,
    },
    eggCycles: { status: "known", value: 20 },
    evYield: { hp: 0, atk: 0, def: 0, spa: 1, spd: 0, spe: 0 },
    baseFriendship: { status: "known", value: 50 },
    sourceRecordIds: [SOURCE_RECORD_ID],
    ...overrides,
  };
}

export function typeFixture(
  overrides: Partial<TypeDefinitionV1> = {},
): TypeDefinitionV1 {
  return {
    id: asId<TypeId>("normal"),
    sourceName: "Normal",
    sourceSlug: "normal",
    sourceRecordIds: ["source:type:normal"],
    ...overrides,
  };
}

export function abilityFixture(
  overrides: Partial<AbilityDefinitionV1> = {},
): AbilityDefinitionV1 {
  return {
    id: asId<AbilityId>("overgrow"),
    sourceName: "Overgrow",
    sourceSlug: "overgrow",
    introducedGeneration: 3,
    sourceRecordIds: ["source:ability:overgrow"],
    ...overrides,
  };
}

export function moveFixture(
  overrides: Partial<MoveDefinitionV1> = {},
): MoveDefinitionV1 {
  return {
    id: asId<MoveId>("tackle"),
    typeId: asId<TypeId>("normal"),
    category: "physical",
    power: 40,
    accuracy: 100,
    basePp: 35,
    sourceTarget: "any-adjacent",
    makesContact: true,
    zaBaseCooldownMs: null,
    sourceRecordIds: [
      GEN9_MOVE_SOURCE_RECORD_ID,
      "source:move:tackle",
      ZA_MOVE_SOURCE_RECORD_ID,
    ],
    ...overrides,
  };
}

export function itemFixture(
  overrides: Partial<ItemDefinitionV1> = {},
): ItemDefinitionV1 {
  return {
    id: asId<ItemId>("potion"),
    sourceName: "Potion",
    sourceSlug: "potion",
    sourceCategory: "medicine",
    sourceRecordIds: ["source:item:potion"],
    ...overrides,
  };
}

export function learnsetFixture(
  overrides: Partial<LearnsetEntryV1> = {},
): LearnsetEntryV1 {
  return {
    speciesId: asId<SpeciesId>("species-alpha"),
    moveId: asId<MoveId>("tackle"),
    sourceGeneration: 9,
    sourceGame: "Scarlet/Violet",
    method: "level-up",
    level: 1,
    machineIdentifier: null,
    sourceRecordIds: ["source:learnset:alpha"],
    ...overrides,
  };
}

export function typeMatrixFixture(): TypeEffectivenessEntry[] {
  return [
    {
      attackTypeId: asId<TypeId>("normal"),
      defenseTypeId: asId<TypeId>("normal"),
      multiplier: 1,
      sourceRecordIds: ["source:type-chart:current"],
    },
  ];
}

export function inventoryFixture(
  overrides: Partial<SourceInventory> = {},
): SourceInventory {
  return {
    surface: "species",
    discoveredSourceKeys: ["alpha"],
    acceptedMappingKeys: ["alpha"],
    extractedSourceKeys: ["alpha"],
    normalizedSourceKeys: ["alpha"],
    excludedOrDeferred: [],
    candidateSourceKeys: [],
    ...overrides,
  };
}

export function provenanceFixture(): ProvenanceManifest {
  return {
    sourceRecords: [
      {
        id: SOURCE_RECORD_ID,
        provider: "pokemondb",
        canonicalUrl: "https://pokemondb.net/pokedex/alpha",
        fetchedAt: "2026-09-18T00:00:00.000Z",
        parserVersion: "pokemondb-v1",
        sourceContentHash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        fetchStatus: "fetched",
      },
      {
        id: "source:type:normal",
        provider: "pokemondb",
        canonicalUrl: "https://pokemondb.net/type/normal",
        fetchedAt: "2026-09-18T00:00:00.000Z",
        parserVersion: "pokemondb-v1",
        sourceContentHash:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        fetchStatus: "fetched",
      },
      {
        id: "source:ability:overgrow",
        provider: "pokemondb",
        canonicalUrl: "https://pokemondb.net/ability/overgrow",
        fetchedAt: "2026-09-18T00:00:00.000Z",
        parserVersion: "pokemondb-v1",
        sourceContentHash:
          "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        fetchStatus: "fetched",
      },
      {
        id: "source:move:tackle",
        provider: "pokemondb",
        canonicalUrl: "https://pokemondb.net/move/tackle",
        fetchedAt: "2026-09-18T00:00:00.000Z",
        parserVersion: "pokemondb-html-v2",
        sourceContentHash:
          "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        fetchStatus: "fetched",
      },
      {
        id: GEN9_MOVE_SOURCE_RECORD_ID,
        provider: "bulbapedia",
        canonicalUrl:
          "https://bulbapedia.bulbagarden.net/wiki/List_of_moves_by_availability_in_Generation_IX",
        fetchedAt: "2026-09-18T00:00:00.000Z",
        parserVersion: "bulbapedia-gen9-move-availability-v1",
        sourceContentHash:
          "sha256:8888888888888888888888888888888888888888888888888888888888888888",
        fetchStatus: "fetched",
      },
      {
        id: ZA_MOVE_SOURCE_RECORD_ID,
        provider: "bulbapedia",
        canonicalUrl:
          "https://bulbapedia.bulbagarden.net/wiki/List_of_moves_in_Pok%C3%A9mon_Legends:_Z-A",
        fetchedAt: "2026-09-18T00:00:00.000Z",
        parserVersion: "bulbapedia-za-move-list-v1",
        sourceContentHash:
          "sha256:9999999999999999999999999999999999999999999999999999999999999999",
        fetchStatus: "fetched",
      },
      {
        id: "source:item:potion",
        provider: "pokemondb",
        canonicalUrl: "https://pokemondb.net/item/potion",
        fetchedAt: "2026-09-18T00:00:00.000Z",
        parserVersion: "pokemondb-v1",
        sourceContentHash:
          "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        fetchStatus: "fetched",
      },
      {
        id: "source:learnset:alpha",
        provider: "pokemondb",
        canonicalUrl: "https://pokemondb.net/pokedex/alpha/moves/9",
        fetchedAt: "2026-09-18T00:00:00.000Z",
        parserVersion: "pokemondb-v1",
        sourceContentHash:
          "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        fetchStatus: "fetched",
      },
      {
        id: "source:type-chart:current",
        provider: "pokemondb",
        canonicalUrl: "https://pokemondb.net/type",
        fetchedAt: "2026-09-18T00:00:00.000Z",
        parserVersion: "pokemondb-v1",
        sourceContentHash:
          "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        fetchStatus: "fetched",
      },
    ],
    moveFactSources: [
      {
        moveId: asId<MoveId>("tackle"),
        mainline: {
          selectedGame: "scarlet-violet",
          sourceRecordId: GEN9_MOVE_SOURCE_RECORD_ID,
        },
        sourceTargetSourceRecordId: "source:move:tackle",
        makesContactSourceRecordId: "source:move:tackle",
        zaBaseCooldownSourceRecordId: ZA_MOVE_SOURCE_RECORD_ID,
      },
    ],
    inventories: [
      inventoryFixture(),
      inventoryFixture({
        surface: "moves",
        discoveredSourceKeys: ["tackle"],
        acceptedMappingKeys: ["tackle"],
        extractedSourceKeys: ["tackle"],
        normalizedSourceKeys: ["tackle"],
      }),
      inventoryFixture({
        surface: "types",
        discoveredSourceKeys: ["normal"],
        acceptedMappingKeys: ["normal"],
        extractedSourceKeys: ["normal"],
        normalizedSourceKeys: ["normal"],
      }),
      inventoryFixture({
        surface: "abilities",
        discoveredSourceKeys: ["overgrow"],
        acceptedMappingKeys: ["overgrow"],
        extractedSourceKeys: ["overgrow"],
        normalizedSourceKeys: ["overgrow"],
      }),
      inventoryFixture({
        surface: "items",
        discoveredSourceKeys: ["potion"],
        acceptedMappingKeys: ["potion"],
        extractedSourceKeys: ["potion"],
        normalizedSourceKeys: ["potion"],
      }),
      inventoryFixture({
        surface: "learnsets",
        discoveredSourceKeys: ["alpha:gen9:sv:tackle:level-up"],
        acceptedMappingKeys: ["alpha:gen9:sv:tackle:level-up"],
        extractedSourceKeys: ["alpha:gen9:sv:tackle:level-up"],
        normalizedSourceKeys: ["alpha:gen9:sv:tackle:level-up"],
      }),
      inventoryFixture({
        surface: "type-effectiveness",
        discoveredSourceKeys: ["current:normal:normal"],
        acceptedMappingKeys: ["current:normal:normal"],
        extractedSourceKeys: ["current:normal:normal"],
        normalizedSourceKeys: ["current:normal:normal"],
      }),
    ],
    sourceInventoryHash:
      "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  };
}

export function candidateFixture(): GameDataCandidate {
  return {
    schemaVersion: "3",
    normalizerVersion: "test-normalizer-v1",
    catalogs: {
      species: [speciesFixture()],
      moves: [moveFixture()],
      types: [typeFixture()],
      abilities: [abilityFixture()],
      items: [itemFixture()],
      learnsets: [learnsetFixture()],
    },
    referenceData: {
      currentTypeEffectiveness: typeMatrixFixture(),
    },
    provenance: provenanceFixture(),
  };
}

export function mappingRegistryFixture(): MappingRegistry {
  return {
    species: [
      {
        sourceKey: "alpha",
        canonicalId: asId<SpeciesId>("species-alpha"),
        baseSpeciesId: null,
        status: "accepted",
      },
    ],
    moves: [
      {
        sourceKey: "tackle",
        canonicalId: asId<MoveId>("tackle"),
        status: "accepted",
      },
    ],
    types: [
      {
        sourceKey: "normal",
        canonicalId: asId<TypeId>("normal"),
        status: "accepted",
      },
    ],
    abilities: [
      {
        sourceKey: "overgrow",
        canonicalId: asId<AbilityId>("overgrow"),
        status: "accepted",
      },
    ],
    items: [
      {
        sourceKey: "potion",
        canonicalId: asId<ItemId>("potion"),
        status: "accepted",
      },
    ],
  };
}

export function publishableCandidateFixture(): GameDataCandidate {
  const candidate = candidateFixture();
  candidate.normalizerVersion = "pokenexus-static-normalizer-v5";
  candidate.provenance = finalizeProvenance({
    sourceRecords: candidate.provenance.sourceRecords,
    moveFactSources: candidate.provenance.moveFactSources,
    inventories: candidate.provenance.inventories,
  });
  return candidate;
}
