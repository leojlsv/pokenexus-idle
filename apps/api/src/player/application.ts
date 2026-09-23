import {
  createOrLoadPlayerByAccountId,
  createOwnedTeamIdempotent,
  deleteOwnedTeamWithCreateTombstone,
  findPlayerByAccountId,
  generateUuidV7,
  listOwnedPokemonPage,
  listOwnedTeamsPage,
  loadInventoryPage,
  loadOwnedPokemon,
  loadOwnedPokemonProgression,
  loadOwnedTeam,
  loadPlayerProgression,
  replaceOwnedTeamRoster,
  withPgClient,
  type InventoryEntryRecord,
  type OwnedPokemonProgressionRecord,
  type OwnedPokemonRecord,
  type OwnedPokemonSummary,
  type OwnedTeamRecord,
  type OwnedTeamSummary,
  type PlayerDbClient,
  type PlayerProgressionRecord,
  type TeamDeleteResult,
  type TeamRosterReplaceResult,
} from "@pokenexus/database";
import {
  MoveAuthorityUnavailableError,
} from "../moves/context";
import type {
  MoveLoadoutMutationResult,
} from "../moves/application";

export interface PlayerProfileIdentity {
  readonly playerId: string;
}

export interface CollectionPage {
  readonly items: readonly OwnedPokemonSummary[];
  readonly nextAfterPokemonInstanceId: string | null;
}

export type InventoryPageResult =
  | {
    readonly status: "ok";
    readonly rowVersion: bigint;
    readonly entries: readonly InventoryEntryRecord[];
    readonly nextAfterItemId: string | null;
  }
  | { readonly status: "not_found" }
  | { readonly status: "pagination_stale" };

export interface TeamPage {
  readonly teams: readonly OwnedTeamSummary[];
  readonly nextAfterTeamId: string | null;
}

export type TeamCreateApplicationResult =
  | {
    readonly status: "accepted";
    readonly teamId: string;
    readonly rowVersion: bigint;
    readonly replay: boolean;
  }
  | { readonly status: "not_found" }
  | { readonly status: "idempotency_gone" }
  | { readonly status: "team_limit_reached" }
  | { readonly status: "rate_limited"; readonly retryAfterSeconds: number };

export type MoveLoadoutApplicationResult =
  | MoveLoadoutMutationResult
  | { readonly status: "authority_unavailable" };

export interface MoveLoadoutCommand {
  replaceMoveLoadout(input: {
    readonly ownerPlayerId: string;
    readonly pokemonInstanceId: string;
    readonly expectedRowVersion: bigint;
    readonly moveIds: readonly string[];
    readonly now: Date;
  }): Promise<MoveLoadoutMutationResult>;
}

export interface PlayerHttpApplication {
  loadProfile(accountId: string): Promise<PlayerProfileIdentity | null>;
  createOrLoadProfile(accountId: string): Promise<PlayerProfileIdentity>;
  listCollection(accountId: string, input: {
    readonly afterPokemonInstanceId: string | null;
    readonly limit: number;
  }): Promise<CollectionPage | null>;
  loadPokemon(accountId: string, pokemonInstanceId: string): Promise<OwnedPokemonRecord | null>;
  loadPokemonProgression(
    accountId: string,
    pokemonInstanceId: string,
  ): Promise<OwnedPokemonProgressionRecord | null>;
  loadProgression(accountId: string): Promise<PlayerProgressionRecord | null>;
  loadInventoryPage(accountId: string, input: {
    readonly expectedRowVersion: bigint | null;
    readonly afterItemId: string | null;
    readonly limit: number;
  }): Promise<InventoryPageResult>;
  listTeams(accountId: string, input: {
    readonly afterTeamId: string | null;
    readonly limit: number;
  }): Promise<TeamPage | null>;
  loadTeam(accountId: string, teamId: string): Promise<OwnedTeamRecord | null>;
  createTeam(accountId: string, idempotencyKey: string): Promise<TeamCreateApplicationResult>;
  replaceTeamRoster(accountId: string, input: {
    readonly teamId: string;
    readonly expectedRowVersion: bigint;
    readonly pokemonInstanceIds: readonly string[];
  }): Promise<TeamRosterReplaceResult>;
  deleteTeam(accountId: string, input: {
    readonly teamId: string;
    readonly expectedRowVersion: bigint;
  }): Promise<TeamDeleteResult>;
  replaceMoveLoadout(accountId: string, input: {
    readonly pokemonInstanceId: string;
    readonly expectedRowVersion: bigint;
    readonly moveIds: readonly string[];
  }): Promise<MoveLoadoutApplicationResult>;
}

type PlayerDbOperation<T> = (client: PlayerDbClient, playerId: string) => Promise<T>;

export class PlayerApplication implements PlayerHttpApplication {
  constructor(
    private readonly connectionString: string,
    private readonly moveLoadoutCommandFactory?: () => MoveLoadoutCommand,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async loadProfile(accountId: string): Promise<PlayerProfileIdentity | null> {
    return withPgClient({ connectionString: this.connectionString }, async (client) => {
      const player = await findPlayerByAccountId(client, accountId);
      return player ? { playerId: player.playerId } : null;
    });
  }

  async createOrLoadProfile(accountId: string): Promise<PlayerProfileIdentity> {
    const candidatePlayerId = generateUuidV7();
    return withPgClient({ connectionString: this.connectionString }, async (client) => {
      const player = await createOrLoadPlayerByAccountId(client, accountId, candidatePlayerId);
      return { playerId: player.playerId };
    });
  }

  async listCollection(
    accountId: string,
    input: { readonly afterPokemonInstanceId: string | null; readonly limit: number },
  ): Promise<CollectionPage | null> {
    return this.withOwnedPlayer(accountId, (client, ownerPlayerId) =>
      listOwnedPokemonPage(client, { ownerPlayerId, ...input }));
  }

  async loadPokemon(accountId: string, pokemonInstanceId: string): Promise<OwnedPokemonRecord | null> {
    return this.withOwnedPlayer(accountId, (client, ownerPlayerId) =>
      loadOwnedPokemon(client, ownerPlayerId, pokemonInstanceId));
  }

  async loadPokemonProgression(
    accountId: string,
    pokemonInstanceId: string,
  ): Promise<OwnedPokemonProgressionRecord | null> {
    return this.withOwnedPlayer(accountId, (client, ownerPlayerId) =>
      loadOwnedPokemonProgression(client, ownerPlayerId, pokemonInstanceId));
  }

  async loadProgression(accountId: string): Promise<PlayerProgressionRecord | null> {
    return this.withOwnedPlayer(accountId, (client, playerId) =>
      loadPlayerProgression(client, playerId));
  }

  async loadInventoryPage(
    accountId: string,
    input: {
      readonly expectedRowVersion: bigint | null;
      readonly afterItemId: string | null;
      readonly limit: number;
    },
  ): Promise<InventoryPageResult> {
    const result = await this.withOwnedPlayer(accountId, (client, playerId) =>
      loadInventoryPage(client, { playerId, ...input }));
    return result ?? { status: "not_found" };
  }

  async listTeams(
    accountId: string,
    input: { readonly afterTeamId: string | null; readonly limit: number },
  ): Promise<TeamPage | null> {
    return this.withOwnedPlayer(accountId, (client, ownerPlayerId) =>
      listOwnedTeamsPage(client, { ownerPlayerId, ...input }));
  }

  async loadTeam(accountId: string, teamId: string): Promise<OwnedTeamRecord | null> {
    return this.withOwnedPlayer(accountId, (client, ownerPlayerId) =>
      loadOwnedTeam(client, ownerPlayerId, teamId));
  }

  async createTeam(accountId: string, idempotencyKey: string): Promise<TeamCreateApplicationResult> {
    const result = await this.withOwnedPlayer(accountId, (client, ownerPlayerId) =>
      createOwnedTeamIdempotent(client, {
        ownerPlayerId,
        idempotencyKey,
        now: this.clock(),
      }));
    return result ?? { status: "not_found" };
  }

  async replaceTeamRoster(
    accountId: string,
    input: {
      readonly teamId: string;
      readonly expectedRowVersion: bigint;
      readonly pokemonInstanceIds: readonly string[];
    },
  ): Promise<TeamRosterReplaceResult> {
    const result = await this.withOwnedPlayer(accountId, (client, ownerPlayerId) =>
      replaceOwnedTeamRoster(client, {
        ownerPlayerId,
        ...input,
        now: this.clock(),
      }));
    return result ?? { status: "not_found" };
  }

  async deleteTeam(
    accountId: string,
    input: { readonly teamId: string; readonly expectedRowVersion: bigint },
  ): Promise<TeamDeleteResult> {
    const result = await this.withOwnedPlayer(accountId, (client, ownerPlayerId) =>
      deleteOwnedTeamWithCreateTombstone(client, {
        ownerPlayerId,
        ...input,
        now: this.clock(),
      }));
    return result ?? { status: "not_found" };
  }

  async replaceMoveLoadout(
    accountId: string,
    input: {
      readonly pokemonInstanceId: string;
      readonly expectedRowVersion: bigint;
      readonly moveIds: readonly string[];
    },
  ): Promise<MoveLoadoutApplicationResult> {
    const ownerPlayerId = await this.resolvePlayerId(accountId);
    if (ownerPlayerId === null) return { status: "not_found" };
    if (!this.moveLoadoutCommandFactory) return { status: "authority_unavailable" };
    try {
      return await this.moveLoadoutCommandFactory().replaceMoveLoadout({
        ownerPlayerId,
        ...input,
        now: this.clock(),
      });
    } catch (error) {
      if (error instanceof MoveAuthorityUnavailableError) {
        return { status: "authority_unavailable" };
      }
      throw error;
    }
  }

  private async resolvePlayerId(accountId: string): Promise<string | null> {
    return withPgClient({ connectionString: this.connectionString }, async (client) =>
      (await findPlayerByAccountId(client, accountId))?.playerId ?? null);
  }

  private async withOwnedPlayer<T>(accountId: string, operation: PlayerDbOperation<T>): Promise<T | null> {
    return withPgClient({ connectionString: this.connectionString }, async (client) => {
      const player = await findPlayerByAccountId(client, accountId);
      return player ? operation(client, player.playerId) : null;
    });
  }
}
