import type { Client } from "pg";

export type TransactionIsolationLevel = "READ COMMITTED" | "REPEATABLE READ";

export interface TransactionOptions {
  readonly isolationLevel?: TransactionIsolationLevel;
}

type TransactionClient = Pick<Client, "query">;

export async function withTransaction<T>(
  client: TransactionClient,
  operation: (client: TransactionClient) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const isolationLevel = options.isolationLevel ?? "READ COMMITTED";
  let began = false;

  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);
    began = true;
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (!began) {
      throw error;
    }

    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Database transaction and rollback both failed",
      );
    }
    throw error;
  }
}
