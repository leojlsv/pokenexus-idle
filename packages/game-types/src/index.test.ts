import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index";
import type {
  HuntDefinitionId,
  MoveId,
  SpeciesId,
  StatBlock,
  StatKey,
} from "./index";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Assert<T extends true> = T;

type CanonicalStatKeysAreExact = Assert<
  Equal<keyof StatBlock<number>, StatKey>
>;

const completeStatBlock: StatBlock<number> = {
  hp: 1,
  atk: 2,
  def: 3,
  spa: 4,
  spd: 5,
  spe: 6,
};

void ({} as CanonicalStatKeysAreExact);
void completeStatBlock;

describe("game-types entrypoint", () => {
  it("exposes the package identity marker", () => {
    expect(PACKAGE_NAME).toBe("@pokenexus/game-types");
  });
});

const speciesId = "" as SpeciesId;
const moveId = "" as MoveId;
const huntDefinitionId = "" as HuntDefinitionId;
void speciesId;
void moveId;
void huntDefinitionId;

// @ts-expect-error Canonical ID brands prevent assigning one identity kind to another.
const invalidIdAssignment: SpeciesId = moveId;
void invalidIdAssignment;

// @ts-expect-error Hunt-definition identity is distinct from Species identity.
const invalidHuntIdAssignment: SpeciesId = huntDefinitionId;
void invalidHuntIdAssignment;

// @ts-expect-error StatKey is limited to the six canonical keys.
const invalidStatKey: StatKey = "accuracy";
void invalidStatKey;

// @ts-expect-error A complete StatBlock must contain every canonical stat key.
const incompleteStatBlock: StatBlock<number> = { hp: 1 };
void incompleteStatBlock;
