import type { Client } from "pg";
import { decodeOpaqueStringDbV1, encodeOpaqueStringDbV1 } from "./opaque-string-db-codec.js";
import { withTransaction } from "./transaction.js";

export type InventoryDbClient = Pick<Client, "query">;
export const ITEM_QUANTITY_MAX = 9_223_372_036_854_775_807n;

export interface InventoryEntryRecord {
  readonly itemId: string;
  readonly quantity: bigint;
}

export interface InventoryRecord {
  readonly playerId: string;
  readonly rowVersion: bigint;
  readonly entries: readonly InventoryEntryRecord[];
}

export type InventoryMutationResult =
  | { readonly status: "updated"; readonly rowVersion: bigint }
  | { readonly status: "stale"; readonly rowVersion: bigint }
  | { readonly status: "not_found" }
  | { readonly status: "insufficient"; readonly itemId: string; readonly quantity: bigint }
  | { readonly status: "overflow"; readonly itemId: string };

interface InventoryRootRow { readonly player_id: string; readonly row_version: string }
interface InventoryEntryRow { readonly item_id: Buffer; readonly quantity: string }

function encodedItemId(itemId: string): Buffer {
  if (itemId.length === 0) throw new Error("ItemId must be non-empty");
  return Buffer.from(encodeOpaqueStringDbV1(itemId));
}

function validateDeltas(entries: readonly { readonly itemId: string; readonly quantity: bigint }[]): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.quantity <= 0n || entry.quantity > ITEM_QUANTITY_MAX) {
      throw new RangeError("Inventory mutation quantities must be positive ItemQuantity values");
    }
    if (ids.has(entry.itemId)) throw new Error(`duplicate ItemId in Inventory mutation: ${entry.itemId}`);
    ids.add(entry.itemId);
    encodedItemId(entry.itemId);
  }
  if (entries.length === 0) throw new Error("Inventory mutation must contain at least one entry");
}

export async function loadInventory(
  client: InventoryDbClient,
  playerId: string,
  forUpdate = false,
): Promise<InventoryRecord | null> {
  const root = await client.query<InventoryRootRow>(
    `SELECT player_id, row_version::text
     FROM pokenexus.player_inventories
     WHERE player_id = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [playerId],
  );
  const rootRow = root.rows[0];
  if (!rootRow) return null;
  const entries = await client.query<InventoryEntryRow>(
    `SELECT item_id, quantity::text
     FROM pokenexus.inventory_entries
     WHERE player_id = $1
     ORDER BY item_id`,
    [playerId],
  );
  return {
    playerId: rootRow.player_id,
    rowVersion: BigInt(rootRow.row_version),
    entries: entries.rows.map((row) => ({
      itemId: decodeOpaqueStringDbV1(row.item_id),
      quantity: BigInt(row.quantity),
    })),
  };
}

async function lockRootVersion(client: InventoryDbClient, playerId: string): Promise<bigint | null> {
  const result = await client.query<{ row_version: string }>(
    `SELECT row_version::text FROM pokenexus.player_inventories WHERE player_id = $1 FOR UPDATE`,
    [playerId],
  );
  return result.rows[0] ? BigInt(result.rows[0].row_version) : null;
}

async function loadQuantity(
  client: InventoryDbClient,
  playerId: string,
  itemId: Buffer,
): Promise<bigint> {
  const result = await client.query<{ quantity: string }>(
    `SELECT quantity::text FROM pokenexus.inventory_entries WHERE player_id = $1 AND item_id = $2`,
    [playerId, itemId],
  );
  return result.rows[0] ? BigInt(result.rows[0].quantity) : 0n;
}

async function bumpInventoryRoot(
  client: InventoryDbClient,
  playerId: string,
  expectedRowVersion: bigint,
  now: Date,
): Promise<bigint> {
  const result = await client.query<{ row_version: string }>(
    `UPDATE pokenexus.player_inventories
     SET row_version = row_version + 1, updated_at = $3
     WHERE player_id = $1 AND row_version = $2::bigint
     RETURNING row_version::text`,
    [playerId, expectedRowVersion.toString(), now],
  );
  if (!result.rows[0]) throw new Error("Locked Inventory OCC update unexpectedly failed");
  return BigInt(result.rows[0].row_version);
}

export async function grantInventoryEntriesInTransaction(
  client: InventoryDbClient,
  input: {
    readonly playerId: string;
    readonly expectedRowVersion: bigint;
    readonly grants: readonly { readonly itemId: string; readonly quantity: bigint }[];
    readonly now: Date;
  },
): Promise<InventoryMutationResult> {
  if (input.expectedRowVersion < 0n) throw new RangeError("expectedRowVersion must be non-negative");
  validateDeltas(input.grants);
  const currentVersion = await lockRootVersion(client, input.playerId);
  if (currentVersion === null) return { status: "not_found" };
  if (currentVersion !== input.expectedRowVersion) return { status: "stale", rowVersion: currentVersion };

  const prepared: { itemId: string; encoded: Buffer; quantity: bigint; result: bigint }[] = [];
  for (const grant of input.grants) {
    const encoded = encodedItemId(grant.itemId);
    const current = await loadQuantity(client, input.playerId, encoded);
    const result = current + grant.quantity;
    if (result > ITEM_QUANTITY_MAX) return { status: "overflow", itemId: grant.itemId };
    prepared.push({ itemId: grant.itemId, encoded, quantity: grant.quantity, result });
  }

  for (const entry of prepared) {
    await client.query(
      `INSERT INTO pokenexus.inventory_entries (player_id, item_id, quantity)
       VALUES ($1, $2, $3::bigint)
       ON CONFLICT (player_id, item_id)
       DO UPDATE SET quantity = EXCLUDED.quantity`,
      [input.playerId, entry.encoded, entry.result.toString()],
    );
  }
  return { status: "updated", rowVersion: await bumpInventoryRoot(client, input.playerId, currentVersion, input.now) };
}

export async function removeInventoryEntriesInTransaction(
  client: InventoryDbClient,
  input: {
    readonly playerId: string;
    readonly expectedRowVersion: bigint;
    readonly removals: readonly { readonly itemId: string; readonly quantity: bigint }[];
    readonly now: Date;
  },
): Promise<InventoryMutationResult> {
  if (input.expectedRowVersion < 0n) throw new RangeError("expectedRowVersion must be non-negative");
  validateDeltas(input.removals);
  const currentVersion = await lockRootVersion(client, input.playerId);
  if (currentVersion === null) return { status: "not_found" };
  if (currentVersion !== input.expectedRowVersion) return { status: "stale", rowVersion: currentVersion };

  const prepared: { itemId: string; encoded: Buffer; result: bigint }[] = [];
  for (const removal of input.removals) {
    const encoded = encodedItemId(removal.itemId);
    const current = await loadQuantity(client, input.playerId, encoded);
    if (current < removal.quantity) {
      return { status: "insufficient", itemId: removal.itemId, quantity: current };
    }
    prepared.push({ itemId: removal.itemId, encoded, result: current - removal.quantity });
  }

  for (const entry of prepared) {
    if (entry.result === 0n) {
      await client.query(
        `DELETE FROM pokenexus.inventory_entries WHERE player_id = $1 AND item_id = $2`,
        [input.playerId, entry.encoded],
      );
    } else {
      await client.query(
        `UPDATE pokenexus.inventory_entries SET quantity = $3::bigint WHERE player_id = $1 AND item_id = $2`,
        [input.playerId, entry.encoded, entry.result.toString()],
      );
    }
  }
  return { status: "updated", rowVersion: await bumpInventoryRoot(client, input.playerId, currentVersion, input.now) };
}

export async function grantInventoryEntries(
  client: InventoryDbClient,
  input: Parameters<typeof grantInventoryEntriesInTransaction>[1],
): Promise<InventoryMutationResult> {
  return withTransaction(client, (transaction) => grantInventoryEntriesInTransaction(transaction, input));
}

export async function removeInventoryEntries(
  client: InventoryDbClient,
  input: Parameters<typeof removeInventoryEntriesInTransaction>[1],
): Promise<InventoryMutationResult> {
  return withTransaction(client, (transaction) => removeInventoryEntriesInTransaction(transaction, input));
}
