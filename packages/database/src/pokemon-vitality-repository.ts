import type { Client } from "pg";

export type PokemonVitalityDbClient = Pick<Client, "query">;

export interface PokemonVitalityRecord {
  readonly ownerPlayerId: string;
  readonly pokemonInstanceId: string;
  readonly currentHp: number;
  readonly rowVersion: bigint;
  readonly updatedAt: Date;
}

export type PokemonVitalityCreateResult =
  | { readonly status: "created" | "existing"; readonly vitality: PokemonVitalityRecord }
  | { readonly status: "not_found" };

export type PokemonVitalityMutationResult =
  | { readonly status: "updated" | "unchanged"; readonly vitality: PokemonVitalityRecord }
  | { readonly status: "stale"; readonly vitality: PokemonVitalityRecord }
  | { readonly status: "not_found" };

interface PokemonVitalityRow {
  readonly owner_player_id: string;
  readonly pokemon_instance_id: string;
  readonly current_hp: number;
  readonly row_version: string;
  readonly updated_at: Date;
}

function assertHp(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) {
    throw new RangeError(`${label} must be a non-negative PostgreSQL integer`);
  }
}

function mapVitality(row: PokemonVitalityRow): PokemonVitalityRecord {
  return {
    ownerPlayerId: row.owner_player_id,
    pokemonInstanceId: row.pokemon_instance_id,
    currentHp: row.current_hp,
    rowVersion: BigInt(row.row_version),
    updatedAt: row.updated_at,
  };
}

export async function loadPokemonVitality(
  client: PokemonVitalityDbClient,
  ownerPlayerId: string,
  pokemonInstanceId: string,
  lock = false,
): Promise<PokemonVitalityRecord | null> {
  const result = await client.query<PokemonVitalityRow>(
    `SELECT owner_player_id, pokemon_instance_id, current_hp, row_version::text, updated_at
       FROM pokenexus.pokemon_vitalities
      WHERE owner_player_id = $1 AND pokemon_instance_id = $2
      ${lock ? "FOR UPDATE" : ""}`,
    [ownerPlayerId, pokemonInstanceId],
  );
  return result.rows[0] ? mapVitality(result.rows[0]) : null;
}

export async function createPokemonVitalityInTransaction(
  client: PokemonVitalityDbClient,
  input: {
    readonly ownerPlayerId: string;
    readonly pokemonInstanceId: string;
    readonly currentHp: number;
    readonly now: Date;
  },
): Promise<PokemonVitalityCreateResult> {
  assertHp(input.currentHp, "currentHp");
  const inserted = await client.query<PokemonVitalityRow>(
    `INSERT INTO pokenexus.pokemon_vitalities (
       owner_player_id, pokemon_instance_id, current_hp, row_version, updated_at
     )
     SELECT p.owner_player_id, p.pokemon_instance_id, $3, 0, $4
       FROM pokenexus.pokemon_instances p
      WHERE p.owner_player_id = $1 AND p.pokemon_instance_id = $2
     ON CONFLICT (owner_player_id, pokemon_instance_id) DO NOTHING
     RETURNING owner_player_id, pokemon_instance_id, current_hp, row_version::text, updated_at`,
    [input.ownerPlayerId, input.pokemonInstanceId, input.currentHp, input.now],
  );
  if (inserted.rows[0]) {
    return { status: "created", vitality: mapVitality(inserted.rows[0]) };
  }
  const existing = await loadPokemonVitality(
    client,
    input.ownerPlayerId,
    input.pokemonInstanceId,
    true,
  );
  return existing
    ? { status: "existing", vitality: existing }
    : { status: "not_found" };
}

export async function lockPokemonVitalitiesInCanonicalOrder(
  client: PokemonVitalityDbClient,
  ownerPlayerId: string,
  pokemonInstanceIds: readonly string[],
): Promise<readonly PokemonVitalityRecord[]> {
  const canonicalIds = [...new Set(pokemonInstanceIds)].sort();
  const locked: PokemonVitalityRecord[] = [];
  for (const pokemonInstanceId of canonicalIds) {
    const vitality = await loadPokemonVitality(client, ownerPlayerId, pokemonInstanceId, true);
    if (vitality) locked.push(vitality);
  }
  return locked;
}

export async function setPokemonVitalityCurrentHpInTransaction(
  client: PokemonVitalityDbClient,
  input: {
    readonly ownerPlayerId: string;
    readonly pokemonInstanceId: string;
    readonly expectedRowVersion: bigint;
    readonly currentHp: number;
    readonly now: Date;
  },
): Promise<PokemonVitalityMutationResult> {
  assertHp(input.currentHp, "currentHp");
  if (input.expectedRowVersion < 0n) throw new RangeError("expectedRowVersion must be non-negative");
  const existing = await loadPokemonVitality(
    client,
    input.ownerPlayerId,
    input.pokemonInstanceId,
    true,
  );
  if (!existing) return { status: "not_found" };
  if (existing.rowVersion !== input.expectedRowVersion) {
    return { status: "stale", vitality: existing };
  }
  if (existing.currentHp === input.currentHp) {
    return { status: "unchanged", vitality: existing };
  }
  const updated = await client.query<PokemonVitalityRow>(
    `UPDATE pokenexus.pokemon_vitalities
        SET current_hp = $3, row_version = row_version + 1, updated_at = $4
      WHERE owner_player_id = $1
        AND pokemon_instance_id = $2
        AND row_version = $5
      RETURNING owner_player_id, pokemon_instance_id, current_hp, row_version::text, updated_at`,
    [
      input.ownerPlayerId,
      input.pokemonInstanceId,
      input.currentHp,
      input.now,
      input.expectedRowVersion.toString(),
    ],
  );
  const row = updated.rows[0];
  if (!row) throw new Error("Locked Pokémon vitality OCC update unexpectedly failed");
  return { status: "updated", vitality: mapVitality(row) };
}

export async function reconcilePokemonVitalityMaxHpInTransaction(
  client: PokemonVitalityDbClient,
  input: {
    readonly ownerPlayerId: string;
    readonly pokemonInstanceId: string;
    readonly maxHp: number;
    readonly now: Date;
  },
): Promise<PokemonVitalityMutationResult> {
  assertHp(input.maxHp, "maxHp");
  if (input.maxHp === 0) throw new RangeError("maxHp must be positive");
  const existing = await loadPokemonVitality(
    client,
    input.ownerPlayerId,
    input.pokemonInstanceId,
    true,
  );
  if (!existing) return { status: "not_found" };
  if (existing.currentHp <= input.maxHp) {
    return { status: "unchanged", vitality: existing };
  }
  return setPokemonVitalityCurrentHpInTransaction(client, {
    ownerPlayerId: input.ownerPlayerId,
    pokemonInstanceId: input.pokemonInstanceId,
    expectedRowVersion: existing.rowVersion,
    currentHp: input.maxHp,
    now: input.now,
  });
}

export async function initializeAndReconcilePokemonVitalitiesInTransaction(
  client: PokemonVitalityDbClient,
  input: {
    readonly ownerPlayerId: string;
    readonly maxHpByPokemonInstanceId: Readonly<Record<string, number>>;
    readonly now: Date;
  },
): Promise<readonly PokemonVitalityRecord[]> {
  const pokemonInstanceIds = Object.keys(input.maxHpByPokemonInstanceId).sort();
  const result: PokemonVitalityRecord[] = [];
  for (const pokemonInstanceId of pokemonInstanceIds) {
    const maxHp = input.maxHpByPokemonInstanceId[pokemonInstanceId];
    if (maxHp === undefined) throw new Error("Missing max HP for canonical Pokémon identity");
    assertHp(maxHp, "maxHp");
    if (maxHp === 0) throw new RangeError("maxHp must be positive");
    const created = await createPokemonVitalityInTransaction(client, {
      ownerPlayerId: input.ownerPlayerId,
      pokemonInstanceId,
      currentHp: maxHp,
      now: input.now,
    });
    if (created.status === "not_found") {
      throw new Error("Pokémon vitality initialization lost ownership invariant");
    }
    const reconciled = await reconcilePokemonVitalityMaxHpInTransaction(client, {
      ownerPlayerId: input.ownerPlayerId,
      pokemonInstanceId,
      maxHp,
      now: input.now,
    });
    if (reconciled.status === "not_found" || reconciled.status === "stale") {
      throw new Error("Pokémon vitality reconciliation lost locked row invariant");
    }
    result.push(reconciled.vitality);
  }
  return result;
}

export async function replacePokemonVitalitiesCurrentHpInTransaction(
  client: PokemonVitalityDbClient,
  input: {
    readonly ownerPlayerId: string;
    readonly currentHpByPokemonInstanceId: Readonly<Record<string, number>>;
    readonly now: Date;
  },
): Promise<readonly PokemonVitalityRecord[]> {
  const pokemonInstanceIds = Object.keys(input.currentHpByPokemonInstanceId).sort();
  const locked = await lockPokemonVitalitiesInCanonicalOrder(
    client,
    input.ownerPlayerId,
    pokemonInstanceIds,
  );
  if (locked.length !== pokemonInstanceIds.length) {
    throw new Error("Persistent Hunt vitality writeback is missing a pinned Pokémon vitality row");
  }
  const byId = new Map(locked.map((vitality) => [vitality.pokemonInstanceId, vitality]));
  const result: PokemonVitalityRecord[] = [];
  for (const pokemonInstanceId of pokemonInstanceIds) {
    const currentHp = input.currentHpByPokemonInstanceId[pokemonInstanceId];
    const existing = byId.get(pokemonInstanceId);
    if (currentHp === undefined || !existing) {
      throw new Error("Persistent Hunt vitality writeback authority is incomplete");
    }
    const updated = await setPokemonVitalityCurrentHpInTransaction(client, {
      ownerPlayerId: input.ownerPlayerId,
      pokemonInstanceId,
      expectedRowVersion: existing.rowVersion,
      currentHp,
      now: input.now,
    });
    if (updated.status === "not_found" || updated.status === "stale") {
      throw new Error("Persistent Hunt vitality writeback lost locked row invariant");
    }
    result.push(updated.vitality);
  }
  return result;
}

export async function healPokemonVitalitiesToMaxInTransaction(
  client: PokemonVitalityDbClient,
  input: {
    readonly ownerPlayerId: string;
    readonly maxHpByPokemonInstanceId: Readonly<Record<string, number>>;
    readonly now: Date;
  },
): Promise<{
  readonly vitality: readonly PokemonVitalityRecord[];
  readonly changedCount: number;
}> {
  const reconciled = await initializeAndReconcilePokemonVitalitiesInTransaction(
    client,
    input,
  );
  const byId = new Map(reconciled.map((entry) => [entry.pokemonInstanceId, entry]));
  const result: PokemonVitalityRecord[] = [];
  let changedCount = 0;
  for (const pokemonInstanceId of Object.keys(input.maxHpByPokemonInstanceId).sort()) {
    const maxHp = input.maxHpByPokemonInstanceId[pokemonInstanceId];
    const existing = byId.get(pokemonInstanceId);
    if (maxHp === undefined || !existing) {
      throw new Error("PokéCenter vitality authority is incomplete");
    }
    if (existing.currentHp === maxHp) {
      result.push(existing);
      continue;
    }
    const updated = await setPokemonVitalityCurrentHpInTransaction(client, {
      ownerPlayerId: input.ownerPlayerId,
      pokemonInstanceId,
      expectedRowVersion: existing.rowVersion,
      currentHp: maxHp,
      now: input.now,
    });
    if (updated.status === "not_found" || updated.status === "stale") {
      throw new Error("PokéCenter vitality update lost locked row invariant");
    }
    if (updated.status === "updated") changedCount += 1;
    result.push(updated.vitality);
  }
  return { vitality: result, changedCount };
}
