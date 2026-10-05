import { describe, expect, it } from "vitest";
import { SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2, SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3 } from "@pokenexus/game-core";
import {
  FORWARD_OFFLINE_PRODUCTIVE_CAP_MS,
  deriveFrozenProductiveTarget,
} from "./offline-reconciliation";

describe("TASK-110 offline productive target", () => {
  const now = new Date("2026-10-04T21:00:00.000Z");

  it("caps forward V3 productive elapsed at exactly eight hours", () => {
    const result = deriveFrozenProductiveTarget({
      checkpointSchemaVersion: SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3,
      checkpointLogicalTimeMs: 12_345,
      logicalTimeAnchorAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      serverNow: now,
    });
    expect(result).toEqual({
      targetLogicalTimeMs: 12_345 + FORWARD_OFFLINE_PRODUCTIVE_CAP_MS,
      targetWallClockAt: now,
      elapsedMs: 12 * 60 * 60 * 1000,
      productiveElapsedMs: FORWARD_OFFLINE_PRODUCTIVE_CAP_MS,
      capped: true,
    });
  });

  it("uses the full elapsed interval below eight hours for forward V3", () => {
    const elapsed = 7 * 60 * 60 * 1000 + 321;
    const result = deriveFrozenProductiveTarget({
      checkpointSchemaVersion: SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3,
      checkpointLogicalTimeMs: 99,
      logicalTimeAnchorAt: new Date(now.getTime() - elapsed),
      serverNow: now,
    });
    expect(result.targetLogicalTimeMs).toBe(99 + elapsed);
    expect(result.productiveElapsedMs).toBe(elapsed);
    expect(result.capped).toBe(false);
  });

  it("preserves historical V1/V2 uncapped elapsed semantics", () => {
    const elapsed = 12 * 60 * 60 * 1000;
    const result = deriveFrozenProductiveTarget({
      checkpointSchemaVersion: SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2,
      checkpointLogicalTimeMs: 7,
      logicalTimeAnchorAt: new Date(now.getTime() - elapsed),
      serverNow: now,
    });
    expect(result.targetLogicalTimeMs).toBe(7 + elapsed);
    expect(result.productiveElapsedMs).toBe(elapsed);
    expect(result.capped).toBe(false);
  });

  it("fails closed on a backward database clock only for forward V3", () => {
    const futureAnchor = new Date(now.getTime() + 1);
    expect(() => deriveFrozenProductiveTarget({
      checkpointSchemaVersion: SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3,
      checkpointLogicalTimeMs: 7,
      logicalTimeAnchorAt: futureAnchor,
      serverNow: now,
    })).toThrow(/cannot precede/i);

    expect(deriveFrozenProductiveTarget({
      checkpointSchemaVersion: SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2,
      checkpointLogicalTimeMs: 7,
      logicalTimeAnchorAt: futureAnchor,
      serverNow: now,
    }).targetLogicalTimeMs).toBe(7);
  });
});
