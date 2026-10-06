import { useSyncExternalStore } from "react";
import { es } from "../i18n/es";
import { analyticsConfigured, denyAnalytics, grantAnalytics, readConsent, subscribeConsent } from "../lib/analytics";

export function AnalyticsNotice() {
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => "unknown" as const);
  if (!analyticsConfigured() || consent !== "unknown") return null;
  return (
    <div className="analytics-notice" role="dialog" aria-label={es.analyticsTitle}>
      <p>{es.analyticsTitle}</p>
      <div className="row-actions">
        <button type="button" onClick={grantAnalytics}>
          {es.analyticsAccept}
        </button>
        <button type="button" className="ghost" onClick={denyAnalytics}>
          {es.analyticsDecline}
        </button>
      </div>
    </div>
  );
}
