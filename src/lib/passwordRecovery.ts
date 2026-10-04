export type RecoveryLinkState = "recovery" | "expired" | null;

export function recoveryLinkState(href: string): RecoveryLinkState {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const error = hash.get("error_code") ?? hash.get("error") ?? url.searchParams.get("error_code") ?? url.searchParams.get("error");
  if (error) return "expired";
  const type = hash.get("type") ?? url.searchParams.get("type");
  return type === "recovery" ? "recovery" : null;
}

export function passwordRecoveryRedirect(pageHref: string, baseUrl = "./"): string {
  const url = new URL(baseUrl, pageHref);
  url.hash = "";
  url.search = "";
  return url.href;
}
