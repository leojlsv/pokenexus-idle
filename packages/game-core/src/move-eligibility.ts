import { compareUtf8Bytes } from "./combat-math";

export const MOVE_ELIGIBILITY_RULE_ARTIFACT_ID =
  "pokenexus.move-eligibility.level-up-only.v1" as const;

export interface MoveEligibilityLearnsetEntry {
  readonly speciesId: string;
  readonly moveId: string;
  readonly sourceGeneration: number;
  readonly sourceGame: string;
  readonly method: string;
  readonly level: number | null;
}

export interface LevelAvailableMove {
  readonly moveId: string;
  readonly unlockLevel: number;
}

export interface DeriveLevelAvailableMovesInput {
  readonly speciesId: string;
  readonly currentLevel: number;
  readonly learnset: readonly MoveEligibilityLearnsetEntry[];
}

function assertNonEmpty(value: string, label: string): void {
  if (value.length === 0) throw new Error(`${label} must be non-empty`);
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
}

function sourceContextKey(row: MoveEligibilityLearnsetEntry): string {
  assertPositiveInteger(row.sourceGeneration, "sourceGeneration");
  assertNonEmpty(row.sourceGame, "sourceGame");
  return JSON.stringify([row.sourceGeneration, row.sourceGame]);
}

export function deriveLevelAvailableMoves(
  input: DeriveLevelAvailableMovesInput,
): readonly LevelAvailableMove[] {
  assertNonEmpty(input.speciesId, "speciesId");
  assertPositiveInteger(input.currentLevel, "currentLevel");

  const speciesRows = input.learnset.filter((row) => row.speciesId === input.speciesId);
  const contexts = new Set(speciesRows.map(sourceContextKey));
  if (contexts.size !== 1) {
    throw new Error(
      `Species ${input.speciesId} must resolve to exactly one Learnset source context; found ${contexts.size}`,
    );
  }

  const unlockLevelByMoveId = new Map<string, number>();
  for (const row of speciesRows) {
    if (row.method !== "level-up") continue;
    assertNonEmpty(row.moveId, "moveId");
    if (row.level === null) {
      throw new Error(`level-up Move ${row.moveId} is missing its unlock level`);
    }
    assertPositiveInteger(row.level, `unlock level for ${row.moveId}`);
    const current = unlockLevelByMoveId.get(row.moveId);
    if (current === undefined || row.level < current) {
      unlockLevelByMoveId.set(row.moveId, row.level);
    }
  }

  return [...unlockLevelByMoveId]
    .filter(([, unlockLevel]) => unlockLevel <= input.currentLevel)
    .map(([moveId, unlockLevel]) => ({ moveId, unlockLevel }))
    .sort((left, right) => compareUtf8Bytes(left.moveId, right.moveId));
}

export function selectBootstrapMoveLoadout(
  eligibleMoves: readonly LevelAvailableMove[],
): readonly string[] {
  if (eligibleMoves.length === 0) {
    throw new Error("Cannot bootstrap a Move Loadout without an eligible Move");
  }

  return [...eligibleMoves]
    .sort((left, right) =>
      right.unlockLevel - left.unlockLevel || compareUtf8Bytes(left.moveId, right.moveId),
    )
    .slice(0, 4)
    .map(({ moveId }) => moveId);
}
