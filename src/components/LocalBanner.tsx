import { es } from "../i18n/es";
import { isLocalMode } from "../lib/localMode";

export function LocalBanner() {
  if (!isLocalMode()) return null;
  return <p className="banner">{es.localBanner}</p>;
}
