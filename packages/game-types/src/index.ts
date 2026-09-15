type NominalId<Brand extends string> = string & {
  readonly __brand: Brand;
};

export type SpeciesId = NominalId<"SpeciesId">;
export type PokemonInstanceId = NominalId<"PokemonInstanceId">;
export type CombatantId = NominalId<"CombatantId">;
export type MoveId = NominalId<"MoveId">;
export type TypeId = NominalId<"TypeId">;
export type AbilityId = NominalId<"AbilityId">;
export type ItemId = NominalId<"ItemId">;
export type EffectId = NominalId<"EffectId">;
export type TeamId = NominalId<"TeamId">;
export type PlayerId = NominalId<"PlayerId">;
export type EncounterDefinitionId = NominalId<"EncounterDefinitionId">;
export type EncounterId = NominalId<"EncounterId">;
export type BattleId = NominalId<"BattleId">;
export type ZoneId = NominalId<"ZoneId">;

export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

export type StatBlock<TValue> = {
  [Key in StatKey]: TValue;
};

export const PACKAGE_NAME = "@pokenexus/game-types" as const;
