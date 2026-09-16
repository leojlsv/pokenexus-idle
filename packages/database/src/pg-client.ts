import { Client, type ClientConfig } from "pg";

export type PgClientConfig = Readonly<ClientConfig>;

export async function withPgClient<T>(
  config: PgClientConfig,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(config);
  await client.connect();

  let operationResult!: T;
  let operationFailed = false;
  let operationError: unknown;
  try {
    operationResult = await operation(client);
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }

  let cleanupFailed = false;
  let cleanupError: unknown;
  try {
    await client.end();
  } catch (error) {
    cleanupFailed = true;
    cleanupError = error;
  }

  if (operationFailed) {
    if (cleanupFailed) {
      throw new AggregateError(
        [operationError, cleanupError],
        "Database operation and client cleanup both failed",
      );
    }
    throw operationError;
  }
  if (cleanupFailed) {
    throw cleanupError;
  }

  return operationResult;
}
