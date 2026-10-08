import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HuntActivityPage, HuntActivityRecord } from "./hunt-api";
import { HuntActivityCoverage, HuntReturnStatus, HuntStillActiveNotice } from "./hunt-feedback";

const huntId = "22222222-2222-4222-8222-222222222222";
const record: HuntActivityRecord = {
  encounterOrdinal: 1, encounterId: "encounter:test", resolvedAtHuntTimeMs: 1000,
  outcome: "win", encounterDisposition: "victory", captureDisposition: { kind: "disabled" },
  playerXp: "4", pokemonXp: [], itemDrops: [], consumedItems: [], koSummary: [], reviveSummary: [],
};
const page = (records: readonly HuntActivityRecord[], nextCursor: string | null = null): HuntActivityPage => ({
  huntId, records, nextCursor,
});

describe("Hunt feedback coverage", () => {
  it("distinguishes missing session history from a fetched empty page", () => {
    const missing = renderToStaticMarkup(<HuntActivityCoverage page={null} />);
    const empty = renderToStaticMarkup(<HuntActivityCoverage page={page([])} />);
    expect(missing).toContain("No Hunt selected in this tab");
    expect(missing).toContain("No activity history was loaded");
    expect(missing).not.toContain("server returned no activity");
    expect(empty).toContain("The server returned no activity entries");
    expect(empty).toContain("does not prove that no combat occurred or that no items were consumed");
    expect(empty).not.toContain("No resolved Encounters yet");
    expect(empty).not.toContain("Player XP +0");
  });

  it("labels loaded records and pagination without claiming full Hunt coverage", () => {
    const partial = renderToStaticMarkup(<HuntActivityCoverage page={page([record], "1")} />);
    const exhausted = renderToStaticMarkup(<HuntActivityCoverage page={page([record])} />);
    expect(partial).toContain("1 activity record loaded");
    expect(partial).toContain("More activity records are available");
    expect(exhausted).toContain("No further activity page is currently reported");
    for (const html of [partial, exhausted]) {
      expect(html).toContain("not a complete combat log or a whole-Hunt balance");
      expect(html).toContain("A terminal defeat and its item use may be absent");
    }
  });

  it("does not infer a terminal outcome from a remembered Hunt or recovery time", () => {
    const html = renderToStaticMarkup(<HuntReturnStatus lastHuntId={huntId}
      recoveryReadyAt="2026-10-07T14:49:00.616Z" />);
    expect(html).toContain("No active Hunt");
    expect(html).toContain("End reason unavailable");
    expect(html).toContain(huntId);
    expect(html).toContain("Last viewed Hunt in this tab");
    expect(html).toContain("Recovery does not heal your Team");
    expect(html).not.toContain("Returned to HUB");
    expect(html).not.toContain("You were defeated");
    expect(html).not.toContain("XP +0");
  });

  it("does not invent a previous Hunt or a recovery deadline for a fresh tab", () => {
    const html = renderToStaticMarkup(<HuntReturnStatus lastHuntId={null} recoveryReadyAt={null} />);
    expect(html).toContain("No recovery time reported");
    expect(html).not.toContain("Last viewed Hunt in this tab");
    expect(html).not.toContain(huntId);
    expect(html).not.toContain("Ready to start");
  });

  it("offers active-Hunt navigation without presenting a final result", () => {
    const html = renderToStaticMarkup(<HuntStillActiveNotice onNavigate={() => undefined} />);
    expect(html).toContain("Hunt is still active");
    expect(html).toContain("Open active Hunt");
    expect(html).toContain("No final result is available");
    expect(html).not.toContain("End reason unavailable");
  });
});
