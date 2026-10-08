import { EmptyState } from "./common-states";
import type { HuntActivityPage } from "./hunt-api";
import { formatHuntTimestamp } from "./hunt-display";

export function HuntActivityCoverage({ page }: { readonly page: HuntActivityPage | null }) {
  if (page === null) {
    return <EmptyState title="No Hunt selected in this tab"
      message="No activity history was loaded. This tab has no last-viewed Hunt reference; this does not mean you have never hunted." />;
  }
  if (page.records.length === 0) {
    return <EmptyState title="No activity records available"
      message="The server returned no activity entries for this Hunt. A defeat can end a Hunt without an Activity entry. An empty list does not prove that no combat occurred or that no items were consumed." />;
  }
  return <div className="hunt-notice">
    <strong>{page.records.length} activity {page.records.length === 1 ? "record" : "records"} loaded</strong>
    <p className="hunt-note">{page.nextCursor !== null
      ? "More activity records are available. Load more to read them."
      : "No further activity page is currently reported."}</p>
    <p className="hunt-note">These are recorded Encounter outcomes, not a complete combat log or a whole-Hunt balance. A terminal defeat and its item use may be absent. Check Inventory for your current quantities.</p>
  </div>;
}

export function HuntReturnStatus({ lastHuntId, recoveryReadyAt }: {
  readonly lastHuntId: string | null;
  readonly recoveryReadyAt: string | null;
}) {
  return <div className="hunt-return-status">
    <h2>No active Hunt</h2>
    <p>The server reports no active Hunt for this Player.</p>
    {lastHuntId ? <p>Last viewed Hunt in this tab: <code>{lastHuntId}</code></p> : null}
    <div className="hunt-notice">
      <strong>End reason unavailable</strong>
      <p className="hunt-note">This Pre-alpha does not expose the final reason to this screen. It cannot distinguish defeat, Retreat or another ending from the available activity. No final outcome, total XP or total item spend is inferred.</p>
    </div>
    <p>Player recovery: {recoveryReadyAt ? formatHuntTimestamp(recoveryReadyAt) : "No recovery time reported"}.</p>
    <p className="hunt-note">Recovery does not heal your Team. Check its condition and use PokéCenter before another Hunt; the server decides when Start is allowed.</p>
  </div>;
}

export function HuntStillActiveNotice({ onNavigate }: { readonly onNavigate: (href: string) => void }) {
  return <div className="hunt-surface">
    <EmptyState title="Hunt is still active"
      message="The server still reports an active Hunt. No final result is available." />
    <button className="button" type="button" onClick={() => onNavigate("/hunt/active")}>Open active Hunt</button>
  </div>;
}
