import {
  SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3,
  SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4,
} from "@pokenexus/game-core";

export const FORWARD_OFFLINE_PRODUCTIVE_CAP_MS = 8 * 60 * 60 * 1000;

export interface FrozenProductiveTarget {
  readonly targetLogicalTimeMs: number;
  readonly targetWallClockAt: Date;
  readonly elapsedMs: number;
  readonly productiveElapsedMs: number;
  readonly capped: boolean;
}

function safeTime(value: Date, label: string): number {
  const time = value.getTime();
  if (!Number.isSafeInteger(time)) throw new Error(`${label} must be a valid safe-integer Date`);
  return time;
}

export function deriveFrozenProductiveTarget(input: {
  readonly checkpointSchemaVersion: string;
  readonly checkpointLogicalTimeMs: number;
  readonly logicalTimeAnchorAt: Date;
  readonly serverNow: Date;
}): FrozenProductiveTarget {
  if (!Number.isSafeInteger(input.checkpointLogicalTimeMs) || input.checkpointLogicalTimeMs < 0) {
    throw new Error("checkpointLogicalTimeMs must be a non-negative safe integer");
  }
  const anchorMs = safeTime(input.logicalTimeAnchorAt, "logicalTimeAnchorAt");
  const serverNowMs = safeTime(input.serverNow, "serverNow");
  const managementFirst = input.checkpointSchemaVersion === SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3
    || input.checkpointSchemaVersion === SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4;
  if (managementFirst && serverNowMs < anchorMs) {
    throw new Error("forward management-first return database time cannot precede the committed wall-clock anchor");
  }
  const elapsedMs = Math.max(0, Math.floor(serverNowMs - anchorMs));
  const productiveElapsedMs = managementFirst
    ? Math.min(elapsedMs, FORWARD_OFFLINE_PRODUCTIVE_CAP_MS)
    : elapsedMs;
  const targetLogicalTimeMs = input.checkpointLogicalTimeMs + productiveElapsedMs;
  if (!Number.isSafeInteger(targetLogicalTimeMs)) {
    throw new Error("frozen productive target exceeds safe logical-time domain");
  }
  return {
    targetLogicalTimeMs,
    targetWallClockAt: new Date(serverNowMs),
    elapsedMs,
    productiveElapsedMs,
    capped: managementFirst && elapsedMs > FORWARD_OFFLINE_PRODUCTIVE_CAP_MS,
  };
}
