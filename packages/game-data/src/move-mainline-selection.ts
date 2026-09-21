import type { ExtractedBulbapediaGen9Move } from "./bulbapedia-gen9-move-parser.js";
import {
  selectLatestTraditionalMoveAvailability,
  type ExtractedBulbapediaGen7Move,
  type ExtractedBulbapediaGen8Move,
  type HistoricalMoveFacts,
  type TraditionalMoveFallbackGame,
} from "./bulbapedia-historical-move-parser.js";
import { canonicalizeBulbapediaMoveName } from "./bulbapedia-za-parser.js";
import type { ExtractedPokemonDbMove } from "./pokemondb-parser.js";

export type MainlineSelectedGame = "scarlet-violet" | TraditionalMoveFallbackGame;

export type ExtractedMainlineSelectedMove = ExtractedPokemonDbMove & {
  /** Bulbapedia pages consulted, in deterministic decision order. */
  mainlineSourceRecordIds: string[];
  /** Exact Bulbapedia page whose scalar facts won MOVE-01 selection. */
  mainlineSelectedSourceRecordId: string;
  /** Human-approved factual snapshot selected for this Move. */
  mainlineSelectedGame: MainlineSelectedGame;
};

export interface MoveMainlineSelectionInput {
  pokemonDbMove: ExtractedPokemonDbMove;
  generation9: readonly ExtractedBulbapediaGen9Move[];
  generation8: readonly ExtractedBulbapediaGen8Move[];
  generation7: readonly ExtractedBulbapediaGen7Move[];
  historicalScalarProofs?: readonly HistoricalScalarProof[];
}

type MainlineFacts = Pick<
  ExtractedBulbapediaGen9Move,
  "typeSourceKey" | "category" | "basePp" | "power" | "accuracy"
>;

export interface HistoricalScalarProof extends MainlineFacts {
  sourceName: string;
  sourceKey: string;
  selectedGame: TraditionalMoveFallbackGame;
  sourceRecordId: string;
}

export interface HistoricalScalarProofRequest {
  sourceName: string;
  sourceKey: string;
  selectedGame: TraditionalMoveFallbackGame;
}

export interface BdspHistoricalScalarEvidence extends MainlineFacts {
  moveSourceKey: string;
  sourceRecordId: string;
}

type NamedMoveRow = {
  sourceName: string;
  sourceKey: string;
  sourceRecordId: string;
};

function normalizedName(value: string): string {
  return value.normalize("NFC");
}

function sourceRecordIdForDataset(rows: readonly NamedMoveRow[], label: string): string {
  if (rows.length === 0) {
    throw new Error(`${label}: source rows are required to prove page consultation`);
  }
  const sourceRecordIds = new Set(rows.map((row) => row.sourceRecordId));
  if (sourceRecordIds.size !== 1) {
    throw new Error(`${label}: rows must come from exactly one Bulbapedia SourceRecord`);
  }
  const sourceRecordId = rows[0].sourceRecordId;
  if (!sourceRecordId.trim()) {
    throw new Error(`${label}: Bulbapedia SourceRecord ID is empty`);
  }
  return sourceRecordId;
}

function matchingRow<T extends NamedMoveRow>(
  rows: readonly T[],
  joinKey: string,
  pokemonDbName: string,
  label: string,
): T | undefined {
  let match: T | undefined;
  for (const row of rows) {
    const canonicalKey = canonicalizeBulbapediaMoveName(row.sourceName);
    if (row.sourceKey !== canonicalKey) {
      throw new Error(
        `${label}: sourceKey/name mismatch for ${JSON.stringify(row.sourceName)}: ${row.sourceKey} vs ${canonicalKey}`,
      );
    }
    if (canonicalKey !== joinKey) continue;
    if (normalizedName(row.sourceName) !== normalizedName(pokemonDbName)) {
    throw new Error(
      `${label}: Move name mismatch for join key ${joinKey}: ${JSON.stringify(pokemonDbName)} vs ${JSON.stringify(row.sourceName)}`,
    );
  }
    if (match !== undefined) {
      throw new Error(`${label}: duplicate Move join key ${joinKey}`);
    }
    match = row;
  }
  return match;
}

function withSelectedFacts(
  move: ExtractedPokemonDbMove,
  facts: MainlineFacts,
  mainlineSourceRecordIds: string[],
  mainlineSelectedSourceRecordId: string,
  mainlineSelectedGame: MainlineSelectedGame,
): ExtractedMainlineSelectedMove {
  return {
    ...move,
    typeSourceKey: facts.typeSourceKey,
    category: facts.category,
    basePp: facts.basePp,
    power: facts.power,
    accuracy: facts.accuracy,
    mainlineSourceRecordIds,
    mainlineSelectedSourceRecordId,
    mainlineSelectedGame,
  };
}

function historicalFacts(
  selection: ReturnType<typeof selectLatestTraditionalMoveAvailability>,
  generation8: ExtractedBulbapediaGen8Move | undefined,
  generation7: ExtractedBulbapediaGen7Move | undefined,
): HistoricalMoveFacts {
  if (!selection) throw new Error("internal error: historical selection is missing");
  const row = selection.generation === 8 ? generation8 : generation7;
  if (!row || row.sourceRecordId !== selection.sourceRecordId) {
    throw new Error("historical Move selection does not resolve to its source row");
  }
  return row;
}

function selectedHistoricalScalarProof(
  proofs: readonly HistoricalScalarProof[],
  joinKey: string,
  pokemonDbName: string,
  selectedGame: TraditionalMoveFallbackGame,
): HistoricalScalarProof {
  const matches = proofs.filter(
    (proof) =>
      proof.selectedGame === selectedGame &&
      canonicalizeBulbapediaMoveName(proof.sourceName) === joinKey,
  );
  if (matches.length !== 1) {
    throw new Error(
      `${pokemonDbName}: selected-game HistoricalScalarProof required for ${selectedGame}; found ${matches.length}`,
    );
  }
  const proof = matches[0];
  if (
    proof.sourceKey !== joinKey ||
    normalizedName(proof.sourceName) !== normalizedName(pokemonDbName)
  ) {
    throw new Error(`${pokemonDbName}: HistoricalScalarProof identity mismatch for ${selectedGame}`);
  }
  if (!proof.sourceRecordId.trim()) {
    throw new Error(`${pokemonDbName}: HistoricalScalarProof SourceRecord ID is empty`);
  }
  return proof;
}

function consultedWithProof(consulted: string[], proofSourceRecordId: string): string[] {
  return [...new Set([...consulted, proofSourceRecordId])];
}

function mainlineFactsKey(facts: MainlineFacts): string {
  return JSON.stringify([
    facts.typeSourceKey.normalize("NFC"),
    facts.category,
    facts.basePp,
    facts.power,
    facts.accuracy,
  ]);
}

export function materializeBdspHistoricalScalarProofs(input: {
  requests: readonly HistoricalScalarProofRequest[];
  evidence: readonly BdspHistoricalScalarEvidence[];
  generation8: readonly ExtractedBulbapediaGen8Move[];
}): HistoricalScalarProof[] {
  return input.requests.map((request) => {
    if (request.selectedGame !== "brilliant-diamond-shining-pearl") {
      throw new Error(
        `${request.sourceName}: selected-game-specific scalar proof surface is unavailable for ${request.selectedGame}`,
      );
    }
    const matches = input.evidence.filter(
      (entry) => entry.moveSourceKey.normalize("NFC") === request.sourceKey.normalize("NFC"),
    );
    if (matches.length === 0) {
      throw new Error(`${request.sourceName}: BDSP learnset scalar proof is missing`);
    }
    const tupleKeys = new Set(matches.map((entry) => mainlineFactsKey(entry)));
    if (tupleKeys.size !== 1) {
      throw new Error(`${request.sourceName}: BDSP learnset scalar proof disagrees across Species learnsets`);
    }
    const sourceRecordIds = [...new Set(matches.map((entry) => entry.sourceRecordId))].sort((left, right) =>
      left.localeCompare(right, "en"),
    );
    if (sourceRecordIds.some((id) => !id.trim())) {
      throw new Error(`${request.sourceName}: BDSP learnset scalar proof SourceRecord ID is empty`);
    }
    const availability = matchingRow(
      input.generation8,
      request.sourceKey,
      request.sourceName,
      "Generation VIII",
    );
    if (!availability || availability.bdspAvailability !== "usable") {
      throw new Error(`${request.sourceName}: BDSP learnset scalar proof lacks usable Generation VIII BDSP availability`);
    }
    return {
      sourceName: request.sourceName,
      sourceKey: request.sourceKey,
      selectedGame: request.selectedGame,
      typeSourceKey: matches[0].typeSourceKey,
      category: matches[0].category,
      basePp: matches[0].basePp,
      power: matches[0].power,
      accuracy: matches[0].accuracy,
      sourceRecordId: sourceRecordIds[0],
    };
  });
}

interface ResolvedMainlineSelection {
  joinKey: string;
  generation9: ExtractedBulbapediaGen9Move;
  selectedGame: MainlineSelectedGame;
  consultedSourceRecordIds: string[];
}

function resolveMainlineSelection(
  input: Omit<MoveMainlineSelectionInput, "historicalScalarProofs">,
): ResolvedMainlineSelection {
  const gen9SourceRecordId = sourceRecordIdForDataset(input.generation9, "Generation IX");
  const joinKey = canonicalizeBulbapediaMoveName(input.pokemonDbMove.sourceName);
  const generation9 = matchingRow(
    input.generation9,
    joinKey,
    input.pokemonDbMove.sourceName,
    "Generation IX",
  );
  if (!generation9) {
    throw new Error(`Generation IX: missing Move join key ${joinKey}`);
  }
  if (generation9.sourceRecordId !== gen9SourceRecordId) {
    throw new Error(`Generation IX: Move ${joinKey} references an unexpected SourceRecord`);
  }
  if (generation9.scarletVioletAvailability === "usable") {
    return {
      joinKey,
      generation9,
      selectedGame: "scarlet-violet",
      consultedSourceRecordIds: [gen9SourceRecordId],
    };
  }

  const gen8SourceRecordId = sourceRecordIdForDataset(input.generation8, "Generation VIII");
  const generation8 = matchingRow(
    input.generation8,
    joinKey,
    input.pokemonDbMove.sourceName,
    "Generation VIII",
  );
  if (generation8 && generation8.sourceRecordId !== gen8SourceRecordId) {
    throw new Error(`Generation VIII: Move ${joinKey} references an unexpected SourceRecord`);
  }
  const consulted = [gen9SourceRecordId, gen8SourceRecordId];
  const generation8Selection = selectLatestTraditionalMoveAvailability(generation8, undefined);
  if (generation8Selection) {
    historicalFacts(generation8Selection, generation8, undefined);
    return {
      joinKey,
      generation9,
      selectedGame: generation8Selection.game,
      consultedSourceRecordIds: consulted,
    };
  }

  const gen7SourceRecordId = sourceRecordIdForDataset(input.generation7, "Generation VII");
  const generation7 = matchingRow(
    input.generation7,
    joinKey,
    input.pokemonDbMove.sourceName,
    "Generation VII",
  );
  if (generation7 && generation7.sourceRecordId !== gen7SourceRecordId) {
    throw new Error(`Generation VII: Move ${joinKey} references an unexpected SourceRecord`);
  }
  consulted.push(gen7SourceRecordId);
  const historicalSelection = selectLatestTraditionalMoveAvailability(generation8, generation7);
  if (!historicalSelection) {
    throw new Error(
      `no usable traditional mainline fallback for ${input.pokemonDbMove.sourceName} after Scarlet/Violet`,
    );
  }
  historicalFacts(historicalSelection, generation8, generation7);
  return {
    joinKey,
    generation9,
    selectedGame: historicalSelection.game,
    consultedSourceRecordIds: consulted,
  };
}

export function requiredHistoricalScalarProof(
  input: Omit<MoveMainlineSelectionInput, "historicalScalarProofs">,
): HistoricalScalarProofRequest | null {
  const resolved = resolveMainlineSelection(input);
  if (resolved.selectedGame === "scarlet-violet") return null;
  return {
    sourceName: input.pokemonDbMove.sourceName,
    sourceKey: resolved.joinKey,
    selectedGame: resolved.selectedGame,
  };
}

export function selectMainlineMoveFacts(
  input: MoveMainlineSelectionInput,
): ExtractedMainlineSelectedMove {
  const resolved = resolveMainlineSelection(input);
  if (resolved.selectedGame === "scarlet-violet") {
    return withSelectedFacts(
      input.pokemonDbMove,
      resolved.generation9,
      resolved.consultedSourceRecordIds,
      resolved.consultedSourceRecordIds[0],
      "scarlet-violet",
    );
  }
  const proof = selectedHistoricalScalarProof(
    input.historicalScalarProofs ?? [],
    resolved.joinKey,
    input.pokemonDbMove.sourceName,
    resolved.selectedGame,
  );
  return withSelectedFacts(
    input.pokemonDbMove,
    proof,
    consultedWithProof(resolved.consultedSourceRecordIds, proof.sourceRecordId),
    proof.sourceRecordId,
    resolved.selectedGame,
  );
}
