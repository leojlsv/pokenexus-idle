import {
  createOrLoadPlayerByAccountId,
  findPlayerByAccountId,
  generateUuidV7,
  withPgClient,
} from "@pokenexus/database";

export interface PlayerProfileIdentity {
  readonly playerId: string;
}

export interface PlayerHttpApplication {
  loadProfile(accountId: string): Promise<PlayerProfileIdentity | null>;
  createOrLoadProfile(accountId: string): Promise<PlayerProfileIdentity>;
}

export class PlayerApplication implements PlayerHttpApplication {
  constructor(private readonly connectionString: string) {}

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
}
