import { describe, expect, it } from "vitest";
import {
  deriveLevelAvailableMoves,
  selectBootstrapMoveLoadout,
  type MoveEligibilityLearnsetEntry,
} from "./move-eligibility";

function row(
  moveId: string,
  options: Partial<MoveEligibilityLearnsetEntry> = {},
): MoveEligibilityLearnsetEntry {
  return {
    speciesId: "species:test",
    moveId,
    sourceGeneration: 9,
    sourceGame: "Scarlet/Violet",
    method: "level-up",
    level: 1,
    ...options,
  };
}

describe("Move eligibility", () => {
  it("derives only current-Level level-up Moves from the selected source context", () => {
    expect(deriveLevelAvailableMoves({
      speciesId: "species:test",
      currentLevel: 10,
      learnset: [
        row("move:level-1"),
        row("move:level-10", { level: 10 }),
        row("move:level-11", { level: 11 }),
        row("move:machine", { method: "machine", level: null }),
        row("move:other-species", { speciesId: "species:other" }),
      ],
    })).toEqual([
      { moveId: "move:level-1", unlockLevel: 1 },
      { moveId: "move:level-10", unlockLevel: 10 },
    ]);
  });

  it("does not grant eligibility from any disabled v1 Learnset method", () => {
    expect(deriveLevelAvailableMoves({
      speciesId: "species:test",
      currentLevel: 100,
      learnset: [
        row("move:evolution", { method: "evolution", level: null }),
        row("move:machine", { method: "machine", level: null }),
        row("move:egg", { method: "egg", level: null }),
        row("move:tutor", { method: "tutor", level: null }),
        row("move:transfer", { method: "transfer", level: null }),
        row("move:reminder", { method: "reminder", level: null }),
      ],
    })).toEqual([]);
  });

  it("uses the minimum duplicate level-up threshold for one MoveId", () => {
    expect(deriveLevelAvailableMoves({
      speciesId: "species:test",
      currentLevel: 6,
      learnset: [
        row("move:repeat", { level: 12 }),
        row("move:repeat", { level: 6 }),
        row("move:repeat", { level: 9 }),
      ],
    })).toEqual([{ moveId: "move:repeat", unlockLevel: 6 }]);
  });

  it("fails closed when the Species resolves to zero or multiple source contexts", () => {
    expect(() => deriveLevelAvailableMoves({
      speciesId: "species:missing",
      currentLevel: 1,
      learnset: [row("move:one")],
    })).toThrow(/exactly one Learnset source context; found 0/);

    expect(() => deriveLevelAvailableMoves({
      speciesId: "species:test",
      currentLevel: 1,
      learnset: [
        row("move:one"),
        row("move:machine", {
          sourceGeneration: 8,
          sourceGame: "Brilliant Diamond/Shining Pearl",
          method: "machine",
          level: null,
        }),
      ],
    })).toThrow(/exactly one Learnset source context; found 2/);
  });

  it("fails closed on malformed level-up thresholds", () => {
    expect(() => deriveLevelAvailableMoves({
      speciesId: "species:test",
      currentLevel: 1,
      learnset: [row("move:broken", { level: null })],
    })).toThrow(/missing its unlock level/);
  });

  it("bootstraps by unlock Level descending then exact UTF-8 MoveId byte order and caps at four", () => {
    const eligible = deriveLevelAvailableMoves({
      speciesId: "species:test",
      currentLevel: 20,
      learnset: [
        row("move:z", { level: 20 }),
        row("move:é", { level: 20 }),
        row("move:aa", { level: 20 }),
        row("move:a", { level: 20 }),
        row("move:older", { level: 19 }),
      ].reverse(),
    });

    expect(selectBootstrapMoveLoadout(eligible)).toEqual([
      "move:a",
      "move:aa",
      "move:z",
      "move:é",
    ]);
  });

  it("fails closed when bootstrap has no currently eligible Move", () => {
    const eligible = deriveLevelAvailableMoves({
      speciesId: "species:test",
      currentLevel: 1,
      learnset: [row("move:later", { level: 2 })],
    });

    expect(() => selectBootstrapMoveLoadout(eligible)).toThrow(/without an eligible Move/);
  });
});
