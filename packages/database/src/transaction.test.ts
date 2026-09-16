import { describe, expect, it, vi } from "vitest";
import { withTransaction } from "./transaction";

describe("withTransaction", () => {
  it("uses READ COMMITTED by default and commits the operation", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    const result = await withTransaction({ query } as never, async () => "committed");

    expect(result).toBe("committed");
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED",
      "COMMIT",
    ]);
  });

  it("rolls back and rethrows when the operation fails", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const failure = new Error("operation failed");

    await expect(
      withTransaction({ query } as never, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED",
      "ROLLBACK",
    ]);
  });

  it("preserves both failures when rollback also fails", async () => {
    const operationFailure = new Error("operation failed");
    const rollbackFailure = new Error("rollback failed");
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(rollbackFailure);

    const error = await withTransaction({ query } as never, async () => {
      throw operationFailure;
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([operationFailure, rollbackFailure]);
  });
});
